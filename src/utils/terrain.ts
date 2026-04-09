import { createNoise2D } from 'simplex-noise';
import {
  PortDefinition, ARCHETYPE_RADIUS, getArchetypeShape, getClimateMoisture,
} from './portArchetypes';
import { SEA_LEVEL } from '../constants/world';

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
let _riverNoise = createNoise2D(mulberry32(4242));

// Re-seed all terrain noise functions. Call before regenerating the world.
export function reseedTerrain(seed: number) {
  _mainNoise = createNoise2D(mulberry32(seed));
  _moistureNoise = createNoise2D(mulberry32(seed * 5 + 3377));
  _volcanoNoise = createNoise2D(mulberry32(seed * 3 + 7741));
  _riverNoise = createNoise2D(mulberry32(seed * 7 + 2019));
}

// Proxy so existing consumers keep working
export const noise2D: ReturnType<typeof createNoise2D> = (x, y) => _mainNoise(x, y);

// ── Active port archetypes (registered by mapGenerator) ────────────────────────
interface PlacedArchetype {
  def: PortDefinition;
  cx: number; // world X of port center
  cz: number; // world Z of port center
}
let _placedArchetypes: PlacedArchetype[] = [];

export function setPlacedArchetypes(placed: PlacedArchetype[]) {
  _placedArchetypes = placed;
}

export function getPlacedArchetypes() {
  return _placedArchetypes;
}

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * clamp01(t);
}

type TerrainColor = [number, number, number];

function mixColor(a: TerrainColor, b: TerrainColor, t: number): TerrainColor {
  const blend = clamp01(t);
  return [
    lerp(a[0], b[0], blend),
    lerp(a[1], b[1], blend),
    lerp(a[2], b[2], blend),
  ];
}

function bandFactor(value: number, start: number, fullStart: number, fullEnd: number, end: number) {
  return clamp01(smoothstep(start, fullStart, value) * (1 - smoothstep(fullEnd, end, value)));
}

export type BiomeType = 'ocean' | 'beach' | 'desert' | 'swamp' | 'grassland' | 'forest' | 'jungle' | 'arroyo' | 'snow' | 'volcano' | 'river' | 'waterfall';

export interface TerrainData {
  height: number;
  biome: BiomeType;
  color: TerrainColor;
  moisture: number;
  coastFactor: number;
  shallowFactor: number;
  surfFactor: number;
  wetSandFactor: number;
  beachFactor: number;
  coastSteepness: number;
}

const DEEP_WATER_COLOR: TerrainColor = [0.07, 0.17, 0.28];
const SHALLOW_WATER_COLOR: TerrainColor = [0.2, 0.46, 0.44];
const SURF_ZONE_COLOR: TerrainColor = [0.78, 0.8, 0.68];
const WET_SAND_COLOR: TerrainColor = [0.68, 0.59, 0.43];
const DRY_SAND_COLOR: TerrainColor = [0.86, 0.78, 0.58];
const ROCKY_SHORE_COLOR: TerrainColor = [0.47, 0.41, 0.35];

export function getTerrainData(x: number, z: number): TerrainData {
  // Base elevation using multiple octaves
  let elevation = 0;
  elevation += _mainNoise(x * 0.005, z * 0.005) * 30;
  elevation += _mainNoise(x * 0.01, z * 0.01) * 15;
  elevation += _mainNoise(x * 0.02, z * 0.02) * 7.5;
  elevation += _mainNoise(x * 0.04, z * 0.04) * 3.75;

  // Continent/Island mask — continent scale dominates for fewer, larger landmasses
  const continentNoise = _mainNoise(x * 0.0003, z * 0.0003);          // large continents
  const islandNoise = _mainNoise(x * 0.0012 + 500, z * 0.0012 + 500); // smaller island detail
  const maskNoise = continentNoise * 0.75 + islandNoise * 0.25;
  // High threshold: mostly ocean, land only at strong noise peaks
  const mask = smoothstep(0.05, 0.55, maskNoise);

  // Moisture map (base — may be overridden by climate near ports)
  let moisture = (_moistureNoise(x * 0.002, z * 0.002) + 1) / 2; // 0 to 1

  // Volcano mask
  const volcanoNoise = _volcanoNoise(x * 0.005, z * 0.005);
  const isVolcanoArea = volcanoNoise > 0.8 && mask > 0.5;

  // River carving — uses dedicated noise so channels don't correlate with coastlines
  const riverNoise = Math.abs(_riverNoise(x * 0.003, z * 0.003));
  const riverMask = smoothstep(0.0, 0.04, riverNoise); // 0 at river center, 1 at banks

  let finalHeight = elevation * mask;

  // ── Archetype blending ─────────────────────────────────────────────────────
  // Check if this point is within any port's archetype radius.
  // If so, blend the archetype shape with the noise-based terrain.
  for (const pa of _placedArchetypes) {
    if (pa.def.geography === 'archipelago') continue; // pure noise, no override

    const dx = x - pa.cx;
    const dz = z - pa.cz;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist > ARCHETYPE_RADIUS * 1.2) continue;

    // Blend factor: 1.0 at center, 0.0 at edge
    const blend = 1 - smoothstep(ARCHETYPE_RADIUS * 0.6, ARCHETYPE_RADIUS * 1.1, dist);
    if (blend <= 0) continue;

    const shape = getArchetypeShape(dx, dz, pa.def); // -1 to 1

    // Convert shape to height: positive = land (~15-25 units), negative = water (~-10)
    const archetypeHeight = shape > 0
      ? shape * 22 + _mainNoise(x * 0.02, z * 0.02) * 4  // land with detail noise
      : shape * 12;                                         // water

    // Blend archetype height with noise-based height
    finalHeight = finalHeight * (1 - blend) + archetypeHeight * blend;

    // Climate moisture override
    const [moistMin, moistMax] = getClimateMoisture(pa.def.climate);
    const climateMoisture = moistMin + (_moistureNoise(x * 0.004, z * 0.004) + 1) / 2 * (moistMax - moistMin);
    moisture = moisture * (1 - blend) + climateMoisture * blend;
  }

  // Volcano crater logic
  let isVolcano = false;
  if (isVolcanoArea && finalHeight > 15) {
    isVolcano = true;
    const distToCenter = smoothstep(0.8, 1.0, volcanoNoise);
    const craterDepth = smoothstep(0.95, 1.0, volcanoNoise) * 20;
    finalHeight += distToCenter * 25 - craterDepth;
  }

  let isRiver = false;
  let isWaterfall = false;

  // Apply river depression only on large, elevated landmasses
  // mask > 0.7 = deep inland on a big continent (skip small islands entirely)
  if (finalHeight > 6 && !isVolcano && mask > 0.7) {
    const originalHeight = finalHeight;
    // Carving strength ramps up with elevation — gentle below 10, full above 18
    const carveFactor = smoothstep(6, 18, finalHeight);
    const effectiveRiverMask = riverMask + (1 - riverMask) * (1 - carveFactor);
    finalHeight = finalHeight * (0.4 + 0.6 * effectiveRiverMask);

    if (effectiveRiverMask < 0.15 && originalHeight > 10) {
      isRiver = true;
      if (originalHeight > 15 && finalHeight < 5) {
        isWaterfall = true;
      }
    }
  }

  // Shift down so the shared sea level has some depth — higher value = more ocean
  finalHeight -= 7;

  const coastReliefNoise = Math.abs(_mainNoise(x * 0.008 + 321.5, z * 0.008 - 187.2));
  const coastSteepness = clamp01(smoothstep(0.42, 0.86, mask) * 0.48 + coastReliefNoise * 0.52);
  const coastWidthScale = 1 - coastSteepness;

  const shallowDepth = lerp(2.4, 5.8, coastWidthScale);
  const surfHeight = lerp(0.16, 0.62, coastWidthScale);
  const wetSandHeight = lerp(0.42, 1.15, coastWidthScale);
  const dryBeachHeight = lerp(0.95, 2.45, coastWidthScale);
  const coastlineNoise = _mainNoise(x * 0.014 + 913.2, z * 0.014 - 447.7) * lerp(0.14, 0.42, coastWidthScale);
  const coastalHeight = finalHeight - coastlineNoise;

  const shallowFactor = finalHeight < SEA_LEVEL
    ? bandFactor(
        coastalHeight,
        SEA_LEVEL - shallowDepth,
        SEA_LEVEL - shallowDepth * 0.7,
        SEA_LEVEL - 0.75,
        SEA_LEVEL - 0.08,
      )
    : 0;
  const surfFactor = bandFactor(
    coastalHeight,
    SEA_LEVEL - 0.65,
    SEA_LEVEL - 0.2,
    SEA_LEVEL + 0.08,
    SEA_LEVEL + surfHeight,
  );
  const wetSandFactor = finalHeight >= SEA_LEVEL
    ? bandFactor(
        coastalHeight,
        SEA_LEVEL - 0.02,
        SEA_LEVEL + 0.18,
        SEA_LEVEL + wetSandHeight * 0.72,
        SEA_LEVEL + wetSandHeight,
      )
    : 0;
  const beachFactor = finalHeight >= SEA_LEVEL
    ? bandFactor(
        coastalHeight,
        SEA_LEVEL + 0.35,
        SEA_LEVEL + wetSandHeight * 0.85,
        SEA_LEVEL + dryBeachHeight * 0.78,
        SEA_LEVEL + dryBeachHeight,
      )
    : 0;
  const coastFactor = Math.max(shallowFactor, surfFactor, wetSandFactor, beachFactor);

  // Determine inland biome first, then blend coastal colors on top.
  let biome: BiomeType = 'ocean';
  let color: TerrainColor = DEEP_WATER_COLOR;
  let inlandColor: TerrainColor = [0.3, 0.5, 0.2];

  if (isWaterfall) {
    biome = 'waterfall';
    color = [0.8, 0.9, 1.0]; // White/blue frothy water
  } else if (isRiver && finalHeight < 2) {
    biome = 'river';
    color = [0.2, 0.5, 0.7]; // River water
  } else if (finalHeight < SEA_LEVEL) {
    biome = 'ocean';
    const underwaterBlend = clamp01((coastalHeight - (SEA_LEVEL - shallowDepth)) / shallowDepth);
    color = mixColor(DEEP_WATER_COLOR, SHALLOW_WATER_COLOR, underwaterBlend);
    color = mixColor(color, SURF_ZONE_COLOR, surfFactor * 0.25);
    color = mixColor(color, ROCKY_SHORE_COLOR, underwaterBlend * coastSteepness * 0.18);
  } else if (isVolcano) {
    biome = 'volcano';
    if (finalHeight < 18) inlandColor = [0.2, 0.15, 0.15]; // Dark igneous rock
    else inlandColor = [0.8, 0.2, 0.0]; // Lava/glowing rock near crater
  } else if (finalHeight > 22) {
    biome = 'snow';
    inlandColor = [0.9, 0.9, 0.95];
  } else if (finalHeight > 10) {
    // Highlands
    if (moisture > 0.6) {
      biome = 'jungle';
      inlandColor = [0.1, 0.3, 0.1]; // Deep green
    } else if (moisture > 0.3) {
      biome = 'forest';
      inlandColor = [0.2, 0.35, 0.15];
    } else {
      biome = 'arroyo';
      inlandColor = [0.6, 0.3, 0.15]; // Reddish canyon rock
    }
  } else {
    // Lowlands
    if (moisture > 0.7) {
      biome = 'swamp';
      inlandColor = [0.25, 0.3, 0.15]; // Murky green/brown
    } else if (moisture > 0.3) {
      biome = 'grassland';
      inlandColor = [0.3, 0.5, 0.2]; // Bright green
    } else {
      biome = 'desert';
      inlandColor = [0.8, 0.7, 0.4]; // Dry sand/dirt
    }
  }

  if (finalHeight >= SEA_LEVEL && biome !== 'waterfall' && biome !== 'river') {
    const drySandColor = mixColor(DRY_SAND_COLOR, ROCKY_SHORE_COLOR, coastSteepness * 0.38);
    const wetSandColor = mixColor(WET_SAND_COLOR, ROCKY_SHORE_COLOR, coastSteepness * 0.52);
    const washColor = mixColor(SURF_ZONE_COLOR, wetSandColor, coastSteepness * 0.35);

    color = inlandColor;
    color = mixColor(color, drySandColor, beachFactor);
    color = mixColor(color, wetSandColor, wetSandFactor);
    color = mixColor(color, washColor, surfFactor * 0.72);

    if (coastFactor > 0.14 && finalHeight < SEA_LEVEL + dryBeachHeight + 0.35) {
      biome = 'beach';
    }
  }

  return {
    height: finalHeight,
    biome,
    color,
    moisture,
    coastFactor,
    shallowFactor,
    surfFactor,
    wetSandFactor,
    beachFactor,
    coastSteepness,
  };
}

// Keep this for backwards compatibility if needed, but we'll use getTerrainData mostly
export function getTerrainHeight(x: number, z: number): number {
  return getTerrainData(x, z).height;
}
