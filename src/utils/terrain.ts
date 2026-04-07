import { createNoise2D } from 'simplex-noise';

// Seeded random number generator (Mulberry32)
function mulberry32(a: number) {
  return function() {
    var t = a += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
}

let _mainNoise = createNoise2D(mulberry32(1612));
let _moistureNoise = createNoise2D(mulberry32(8989));
let _volcanoNoise = createNoise2D(mulberry32(5555));

// Re-seed all terrain noise functions. Call before regenerating the world.
export function reseedTerrain(seed: number) {
  _mainNoise = createNoise2D(mulberry32(seed));
  _moistureNoise = createNoise2D(mulberry32(seed * 5 + 3377));
  _volcanoNoise = createNoise2D(mulberry32(seed * 3 + 7741));
}

// Proxy so existing consumers keep working
export const noise2D: ReturnType<typeof createNoise2D> = (x, y) => _mainNoise(x, y);

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export type BiomeType = 'ocean' | 'beach' | 'desert' | 'swamp' | 'grassland' | 'forest' | 'jungle' | 'arroyo' | 'snow' | 'volcano' | 'river' | 'waterfall';

export function getTerrainData(x: number, z: number) {
  // Base elevation using multiple octaves
  let elevation = 0;
  elevation += _mainNoise(x * 0.005, z * 0.005) * 30;
  elevation += _mainNoise(x * 0.01, z * 0.01) * 15;
  elevation += _mainNoise(x * 0.02, z * 0.02) * 7.5;
  elevation += _mainNoise(x * 0.04, z * 0.04) * 3.75;

  // Continent/Island mask
  const maskNoise = _mainNoise(x * 0.001 + 500, z * 0.001 + 500);
  const mask = smoothstep(-0.3, 0.3, maskNoise);

  // Moisture map
  const moisture = (_moistureNoise(x * 0.002, z * 0.002) + 1) / 2; // 0 to 1

  // Volcano mask
  const volcanoNoise = _volcanoNoise(x * 0.005, z * 0.005);
  const isVolcanoArea = volcanoNoise > 0.8 && mask > 0.5;

  // River carving
  const riverNoise = Math.abs(_mainNoise(x * 0.003 + 100, z * 0.003 + 100));
  const riverMask = smoothstep(0.0, 0.06, riverNoise); // 0 at river center, 1 at banks

  let finalHeight = elevation * mask;
  
  // Volcano crater logic
  let isVolcano = false;
  if (isVolcanoArea && finalHeight > 15) {
    isVolcano = true;
    // Push the mountain up, but carve a crater in the very center
    const distToCenter = smoothstep(0.8, 1.0, volcanoNoise);
    const craterDepth = smoothstep(0.95, 1.0, volcanoNoise) * 20;
    finalHeight += distToCenter * 25 - craterDepth;
  }

  let isRiver = false;
  let isWaterfall = false;

  // Apply river depression only on land
  if (finalHeight > 0 && !isVolcano) {
    const originalHeight = finalHeight;
    finalHeight = finalHeight * (0.1 + 0.9 * riverMask);
    
    if (riverMask < 0.2 && originalHeight > 0) {
      isRiver = true;
      // If the river drops steeply, it's a waterfall
      if (originalHeight > 10 && finalHeight < 5) {
        isWaterfall = true;
      }
    }
  }

  // Shift down so water level (0) has some depth
  finalHeight -= 5;

  // Determine Biome
  let biome: BiomeType = 'ocean';
  let color: [number, number, number] = [0, 0, 0];

  if (finalHeight < 0) {
    biome = 'ocean';
    color = [0.1, 0.3, 0.5]; // Base underwater color (mostly handled by ocean shader)
  } else if (isWaterfall) {
    biome = 'waterfall';
    color = [0.8, 0.9, 1.0]; // White/blue frothy water
  } else if (isRiver && finalHeight < 2) {
    biome = 'river';
    color = [0.2, 0.5, 0.7]; // River water
  } else if (finalHeight < 0.8) {
    biome = 'beach';
    color = [0.85, 0.78, 0.53]; // Sand
  } else if (isVolcano) {
    biome = 'volcano';
    if (finalHeight < 18) color = [0.2, 0.15, 0.15]; // Dark igneous rock
    else color = [0.8, 0.2, 0.0]; // Lava/glowing rock near crater
  } else if (finalHeight > 22) {
    biome = 'snow';
    color = [0.9, 0.9, 0.95];
  } else if (finalHeight > 10) {
    // Highlands
    if (moisture > 0.6) {
      biome = 'jungle';
      color = [0.1, 0.3, 0.1]; // Deep green
    } else if (moisture > 0.3) {
      biome = 'forest';
      color = [0.2, 0.35, 0.15];
    } else {
      biome = 'arroyo';
      color = [0.6, 0.3, 0.15]; // Reddish canyon rock
    }
  } else {
    // Lowlands
    if (moisture > 0.7) {
      biome = 'swamp';
      color = [0.25, 0.3, 0.15]; // Murky green/brown
    } else if (moisture > 0.3) {
      biome = 'grassland';
      color = [0.3, 0.5, 0.2]; // Bright green
    } else {
      biome = 'desert';
      color = [0.8, 0.7, 0.4]; // Dry sand/dirt
    }
  }

  return { height: finalHeight, biome, color, moisture };
}

// Keep this for backwards compatibility if needed, but we'll use getTerrainData mostly
export function getTerrainHeight(x: number, z: number): number {
  return getTerrainData(x, z).height;
}
