import { createNoise2D } from 'simplex-noise';
import {
  PortDefinition, ARCHETYPE_RADIUS, getArchetypeShape, getClimateMoisture,
  reseedArchetypeNoise, setArchetypeMeshHalf,
  type ClimateProfile,
} from './portArchetypes';
import { SEA_LEVEL } from '../constants/world';
import { getResolvedWaterPalette } from './waterPalettes';

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
let _reefNoise = createNoise2D(mulberry32(7373));
let _patchNoise = createNoise2D(mulberry32(6161));

// Re-seed all terrain noise functions. Call before regenerating the world.
export function reseedTerrain(seed: number) {
  _mainNoise = createNoise2D(mulberry32(seed));
  _moistureNoise = createNoise2D(mulberry32(seed * 5 + 3377));
  _volcanoNoise = createNoise2D(mulberry32(seed * 3 + 7741));
  _riverNoise = createNoise2D(mulberry32(seed * 7 + 2019));
  _reefNoise = createNoise2D(mulberry32(seed * 11 + 7373));
  _patchNoise = createNoise2D(mulberry32(seed * 23 + 6161));
  _climateCache.clear();
  reseedArchetypeNoise(seed);
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

// Spatial cache for getNearestClimate — avoids looping all archetypes per vertex.
// Keys are rounded coords "x,z" (resolution 4 units). Cleared on archetype change.
const _climateCache = new Map<string, ClimateProfile | null>();
const CLIMATE_CACHE_RES = 4; // world units per cache cell

export function setPlacedArchetypes(placed: PlacedArchetype[]) {
  _placedArchetypes = placed;
  _climateCache.clear();
}

export function getPlacedArchetypes() {
  return _placedArchetypes;
}

// ── Terrain mesh extent (set by World.tsx to match actual mesh half-size) ─────
let _meshHalf = 450; // default matches World.tsx's standard 900/2

export function setMeshHalf(half: number) {
  _meshHalf = half;
  setArchetypeMeshHalf(half);
}

export function getMeshHalf(): number {
  return _meshHalf;
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

export type BiomeType = 'ocean' | 'beach' | 'desert' | 'scrubland' | 'paddy' | 'swamp' | 'grassland' | 'forest' | 'jungle' | 'arroyo' | 'snow' | 'volcano' | 'river' | 'waterfall';

// Find nearest port climate for biome decisions that depend on cultural context.
// Results are cached in a spatial grid so repeated queries for nearby coords are O(1).
function getNearestClimate(x: number, z: number): ClimateProfile | null {
  const kx = Math.round(x / CLIMATE_CACHE_RES);
  const kz = Math.round(z / CLIMATE_CACHE_RES);
  const key = `${kx},${kz}`;
  const cached = _climateCache.get(key);
  if (cached !== undefined) return cached;

  let best: ClimateProfile | null = null;
  let bestDist = Infinity;
  for (const pa of _placedArchetypes) {
    const dx = x - pa.cx;
    const dz = z - pa.cz;
    const dist = dx * dx + dz * dz; // squared distance is fine for comparison
    const limit = ARCHETYPE_RADIUS * 0.9;
    if (dist < limit * limit && dist < bestDist) {
      bestDist = dist;
      best = pa.def.climate;
    }
  }
  _climateCache.set(key, best);
  return best;
}

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
  reefFactor: number;
  paddyFlooded: boolean;
  slope: number;
}

const WET_SAND_COLOR: TerrainColor = [0.68, 0.59, 0.43];
const DRY_SAND_COLOR: TerrainColor = [0.86, 0.78, 0.58];
const ROCKY_SHORE_COLOR: TerrainColor = [0.47, 0.41, 0.35];

// Cache resolved water palette to avoid store lookups per vertex
let _cachedWaterPalette: ReturnType<typeof getResolvedWaterPalette> | null = null;

/** Call before a batch of getTerrainData calls to refresh the palette cache. */
export function refreshTerrainPaletteCache() {
  _cachedWaterPalette = getResolvedWaterPalette();
}

/** Lightweight height-only computation for slope estimation.
 *  Mirrors getTerrainData's height path but skips biome/color/volcano/river detail. */
function getHeightOnly(x: number, z: number): number {
  let elevation = 0;
  elevation += _mainNoise(x * 0.005, z * 0.005) * 30;
  elevation += _mainNoise(x * 0.01, z * 0.01) * 15;
  elevation += _mainNoise(x * 0.02, z * 0.02) * 7.5;
  elevation += _mainNoise(x * 0.04, z * 0.04) * 3.75;

  const continentNoise = _mainNoise(x * 0.0003, z * 0.0003);
  const islandNoise = _mainNoise(x * 0.0012 + 500, z * 0.0012 + 500);
  const maskNoise = continentNoise * 0.75 + islandNoise * 0.25;
  const mask = smoothstep(0.05, 0.55, maskNoise);
  let h = elevation * mask;

  let appliedArchetype = false;
  for (const pa of _placedArchetypes) {
    if (pa.def.geography === 'archipelago') continue;
    const dx = x - pa.cx;
    const dz = z - pa.cz;
    let shape = getArchetypeShape(dx, dz, pa.def);
    const isIsolated = pa.def.geography === 'island';
    const edgeDist = Math.max(Math.abs(dx), Math.abs(dz));
    if (isIsolated && edgeDist > _meshHalf * 0.88) {
      const fade = 1 - smoothstep(_meshHalf * 0.88, _meshHalf, edgeDist);
      shape = shape * fade - (1 - fade) * 0.5;
    }
    h = shape > 0 ? shape * 22 + _mainNoise(x * 0.02, z * 0.02) * 4 : shape * 12;
    appliedArchetype = true;
  }

  if (_placedArchetypes.length > 0 && !appliedArchetype && h > SEA_LEVEL) {
    h = SEA_LEVEL - 5;
  }
  return h - 7;
}

export function getTerrainData(x: number, z: number): TerrainData {
  if (!_cachedWaterPalette) _cachedWaterPalette = getResolvedWaterPalette();
  const deepWaterColor = _cachedWaterPalette.terrain.deep;
  const shallowWaterColor = _cachedWaterPalette.terrain.shallow;
  const surfZoneColor = _cachedWaterPalette.terrain.surf;

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
  // The archetype shape function fully controls terrain across the mesh.
  // Shape functions use mesh-scale coords internally so they handle their own
  // edge fading (islands fade to ocean, continents extend to edges).
  let appliedArchetype = false;
  for (const pa of _placedArchetypes) {
    if (pa.def.geography === 'archipelago') continue;

    const dx = x - pa.cx;
    const dz = z - pa.cz;

    let shape = getArchetypeShape(dx, dz, pa.def); // -1 to 1

    // For isolated island types, fade to ocean at mesh edges so the island
    // is surrounded by water. Continental types keep land running off-edge.
    const isIsolated = pa.def.geography === 'island';
    const edgeDist = Math.max(Math.abs(dx), Math.abs(dz));
    if (isIsolated && edgeDist > _meshHalf * 0.88) {
      const fade = 1 - smoothstep(_meshHalf * 0.88, _meshHalf, edgeDist);
      shape = shape * fade - (1 - fade) * 0.5;
    }

    // Convert shape to height: positive = land (~15-25 units), negative = water (~-10)
    const archetypeHeight = shape > 0
      ? shape * 22 + _mainNoise(x * 0.02, z * 0.02) * 4
      : shape * 12;

    finalHeight = archetypeHeight;
    appliedArchetype = true;

    // Climate moisture override
    const [moistMin, moistMax] = getClimateMoisture(pa.def.climate);
    moisture = moistMin + (_moistureNoise(x * 0.004, z * 0.004) + 1) / 2 * (moistMax - moistMin);
  }

  // Suppress random noise-based islands when an archetype is active
  if (_placedArchetypes.length > 0 && !appliedArchetype && finalHeight > SEA_LEVEL) {
    finalHeight = SEA_LEVEL - 5;
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

  // ── Slope estimation (central differences via lightweight height function) ──
  const SLOPE_EPS = 2.0;
  const hR = getHeightOnly(x + SLOPE_EPS, z);
  const hL = getHeightOnly(x - SLOPE_EPS, z);
  const hU = getHeightOnly(x, z + SLOPE_EPS);
  const hD = getHeightOnly(x, z - SLOPE_EPS);
  const dhdx = (hR - hL) / (2 * SLOPE_EPS);
  const dhdz = (hU - hD) / (2 * SLOPE_EPS);
  const slope = clamp01(Math.sqrt(dhdx * dhdx + dhdz * dhdz) * 0.12);

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

  // Coral reef factor — patchy distribution in shallow tropical/monsoon waters
  const reefNoiseVal = (_reefNoise(x * 0.008, z * 0.008) + 1) * 0.5; // 0-1
  const reefDepthBand = bandFactor(finalHeight, SEA_LEVEL - 6, SEA_LEVEL - 5, SEA_LEVEL - 0.6, SEA_LEVEL - 0.2);
  const reefFactor = finalHeight < SEA_LEVEL
    ? smoothstep(0.2, 0.45, reefNoiseVal)
      * reefDepthBand
      * smoothstep(0.35, 0.55, moisture)
      * clamp01(1 - coastSteepness * 1.2)
    : 0;

  // Determine inland biome first, then blend coastal colors on top.
  let biome: BiomeType = 'ocean';
  let color: TerrainColor = deepWaterColor;
  let inlandColor: TerrainColor = [0.3, 0.5, 0.2];
  let paddyFlooded = false;

  // Noise-fuzzed height for biome boundary selection — makes ecotones irregular
  // instead of following contour lines
  const biomeNoise = _patchNoise(x * 0.008, z * 0.008) * 2.0;
  const biomeHeight = finalHeight + biomeNoise;

  // Sub-biome patch noise at two frequencies for within-biome variety
  const patch1 = _patchNoise(x * 0.015, z * 0.015);       // field-scale patches
  const patch2 = _patchNoise(x * 0.04 + 100, z * 0.04 + 100); // clump-scale detail

  // Slope-based rock exposure — steep slopes show underlying rock
  const rockColor: TerrainColor = [
    0.42 + (1 - moisture) * 0.10,   // drier = warmer sandstone
    0.36 - moisture * 0.04,          // wetter = darker basalt
    0.30 + moisture * 0.03,
  ];
  const rockExposure = clamp01(slope * 1.8) * smoothstep(SEA_LEVEL + 1, SEA_LEVEL + 3, finalHeight);

  if (isWaterfall) {
    biome = 'waterfall';
    color = [0.8, 0.9, 1.0]; // White/blue frothy water
  } else if (isRiver && finalHeight < 2) {
    biome = 'river';
    color = [0.2, 0.5, 0.7]; // River water
  } else if (finalHeight < SEA_LEVEL) {
    biome = 'ocean';
    const underwaterBlend = clamp01((coastalHeight - (SEA_LEVEL - shallowDepth)) / shallowDepth);
    color = mixColor(deepWaterColor, shallowWaterColor, underwaterBlend);
    color = mixColor(color, surfZoneColor, surfFactor * 0.25);
    color = mixColor(color, ROCKY_SHORE_COLOR, underwaterBlend * coastSteepness * 0.18);

    // Coral reef color tinting on the seafloor
    if (reefFactor > 0.1) {
      const coralHue = (_reefNoise(x * 0.03 + 200, z * 0.03 + 200) + 1) * 0.5;
      const coralColor: TerrainColor = coralHue < 0.25
        ? [0.75, 0.40, 0.50]   // pink brain coral
        : coralHue < 0.5
        ? [0.80, 0.50, 0.28]   // orange staghorn
        : coralHue < 0.75
        ? [0.55, 0.38, 0.62]   // purple sea fan
        : [0.58, 0.68, 0.32];  // yellow-green
      color = mixColor(color, coralColor, reefFactor * 0.4);
    }
  } else if (isVolcano) {
    biome = 'volcano';
    const volNoise = _mainNoise(x * 0.04 + 77, z * 0.04 + 77) * 0.04;
    if (finalHeight < 18) {
      // Patchy volcanic rock — pumice veins, obsidian streaks
      const baseVol: TerrainColor = [0.2 + volNoise, 0.15 + volNoise * 0.5, 0.15 + volNoise * 0.3];
      const pumiceVein: TerrainColor = [0.30, 0.26, 0.22];
      const obsidian: TerrainColor = [0.10, 0.09, 0.11];
      const veinBlend = smoothstep(0.2, 0.5, patch1) * 0.35;
      const obsBlend = smoothstep(-0.25, -0.50, patch2) * 0.25;
      inlandColor = mixColor(baseVol, pumiceVein, veinBlend);
      inlandColor = mixColor(inlandColor, obsidian, obsBlend);
    } else {
      const glowVar = _mainNoise(x * 0.08, z * 0.08) * 0.1;
      inlandColor = [0.8 + glowVar, 0.2 - glowVar * 0.5, 0.0];
    }
  } else if (biomeHeight > 22) {
    biome = 'snow';
    const snowNoise = _mainNoise(x * 0.03 + 55, z * 0.03 + 55) * 0.03;
    // Patchy snow — windswept rock exposure, deep drifts
    const pureSnow: TerrainColor = [0.92 + snowNoise, 0.92 + snowNoise * 0.5, 0.96 - snowNoise];
    const windsweptRock: TerrainColor = [0.52, 0.48, 0.45];
    const snowPatch = smoothstep(0.1, 0.4, patch1);
    inlandColor = mixColor(windsweptRock, pureSnow, 0.5 + snowPatch * 0.5);
  } else if (biomeHeight > 10) {
    // Highlands — with sub-biome feature patches
    const hillNoise = _moistureNoise(x * 0.025 + 150, z * 0.025 + 150) * 0.04;
    if (moisture > 0.6) {
      biome = 'jungle';
      const baseJungle: TerrainColor = [0.08 + hillNoise, 0.28 + hillNoise * 2, 0.08 + hillNoise * 0.5];
      // Canopy gaps (lighter green), dense understory (very dark), mossy patches
      const canopyGap: TerrainColor = [0.14, 0.36, 0.11];
      const darkUnderstory: TerrainColor = [0.04, 0.17, 0.05];
      const gapBlend = smoothstep(0.25, 0.50, patch1) * 0.40;
      const darkBlend = smoothstep(-0.20, -0.45, patch1) * 0.35;
      inlandColor = mixColor(baseJungle, canopyGap, gapBlend);
      inlandColor = mixColor(inlandColor, darkUnderstory, darkBlend);
    } else if (moisture > 0.3) {
      biome = 'forest';
      const baseForest: TerrainColor = [0.18 + hillNoise, 0.33 + hillNoise * 1.5, 0.13 + hillNoise * 0.5];
      // Clearings with leaf litter (brown), bluer conifer zones
      const leafLitter: TerrainColor = [0.35, 0.28, 0.16];
      const coniferZone: TerrainColor = [0.12, 0.28, 0.18];
      const clearingBlend = smoothstep(-0.20, -0.45, patch1) * 0.35;
      const coniferBlend = smoothstep(0.30, 0.55, patch2) * 0.30;
      inlandColor = mixColor(baseForest, leafLitter, clearingBlend);
      inlandColor = mixColor(inlandColor, coniferZone, coniferBlend);
    } else {
      biome = 'arroyo';
      const rockVar = _mainNoise(x * 0.035, z * 0.035) * 0.06;
      const baseArroyo: TerrainColor = [0.6 + rockVar, 0.3 - rockVar * 0.3, 0.15 + rockVar * 0.2];
      // Banded sediment layers, loose pale gravel
      const sedimentBand: TerrainColor = [0.50, 0.35, 0.22];
      const gravel: TerrainColor = [0.52, 0.48, 0.38];
      const bandBlend = smoothstep(0.15, 0.40, patch1) * 0.35;
      const gravelBlend = smoothstep(-0.15, -0.35, patch2) * 0.25;
      inlandColor = mixColor(baseArroyo, sedimentBand, bandBlend);
      inlandColor = mixColor(inlandColor, gravel, gravelBlend);
    }
  } else {
    // Lowlands
    // Paddy fields: monsoon/tropical lowlands with high moisture, near ports
    let lowlandResolved = false;
    if (moisture > 0.55 && finalHeight < 5 && finalHeight > SEA_LEVEL + 1.5) {
      const nearClimate = getNearestClimate(x, z);
      if (nearClimate === 'monsoon' || nearClimate === 'tropical') {
        biome = 'paddy';
        lowlandResolved = true;
        // Alternating flooded/bund patches via high-frequency noise
        const paddyNoise = (_moistureNoise(x * 0.05, z * 0.05) + 1) * 0.5;
        const isFlooded = paddyNoise > 0.45;
        paddyFlooded = isFlooded;
        if (isFlooded) {
          const mudVar = (_moistureNoise(x * 0.08 + 100, z * 0.08 + 100) + 1) * 0.12;
          inlandColor = [0.38 + mudVar, 0.48 - mudVar * 0.2, 0.50 - mudVar * 0.4];
        } else {
          const growVar = (_moistureNoise(x * 0.1 + 200, z * 0.1 + 200) + 1) * 0.06;
          inlandColor = [0.40 - growVar, 0.54 + growVar, 0.20 + growVar * 0.5];
        }
      }
    }
    // Lowland biomes with sub-biome feature patches
    const lowNoise = _moistureNoise(x * 0.025 + 300, z * 0.025 + 300) * 0.04;
    if (!lowlandResolved) {
      if (moisture > 0.7) {
        biome = 'swamp';
        const swampVar = _moistureNoise(x * 0.04 + 400, z * 0.04 + 400) * 0.05;
        const baseSwamp: TerrainColor = [0.23 + swampVar, 0.28 + lowNoise * 1.5, 0.13 + swampVar * 0.5];
        // Open water pools (dark), reed beds (yellow-green), mossy humps
        const poolColor: TerrainColor = [0.12, 0.18, 0.16];
        const reedColor: TerrainColor = [0.38, 0.42, 0.18];
        const poolBlend = smoothstep(-0.20, -0.50, patch1) * 0.45;
        const reedBlend = smoothstep(0.25, 0.50, patch2) * 0.30;
        inlandColor = mixColor(baseSwamp, poolColor, poolBlend);
        inlandColor = mixColor(inlandColor, reedColor, reedBlend);
      } else if (moisture > 0.3) {
        biome = 'grassland';
        const dryFactor = 1 - smoothstep(0.3, 0.65, moisture);
        const baseGrass: TerrainColor = [
          0.28 + dryFactor * 0.18 + lowNoise,
          0.48 + (1 - dryFactor) * 0.08 + lowNoise,
          0.18 - dryFactor * 0.06 + lowNoise * 0.5,
        ];
        // Bare dirt patches, dried grass clumps, lush green clusters
        const bareDirt: TerrainColor = [0.48, 0.40, 0.28];
        const driedGrass: TerrainColor = [0.52, 0.48, 0.26];
        const lushClump: TerrainColor = [0.20, 0.50, 0.14];
        const dirtBlend = smoothstep(-0.25, -0.50, patch1) * dryFactor * 0.45;
        const driedBlend = smoothstep(0.15, 0.40, patch2) * dryFactor * 0.30;
        const lushBlend = smoothstep(0.30, 0.55, patch1) * (1 - dryFactor) * 0.35;
        inlandColor = mixColor(baseGrass, bareDirt, dirtBlend);
        inlandColor = mixColor(inlandColor, driedGrass, driedBlend);
        inlandColor = mixColor(inlandColor, lushClump, lushBlend);
      } else if (moisture > 0.18) {
        biome = 'scrubland';
        const scrubNoise = _moistureNoise(x * 0.03, z * 0.03) * 0.05;
        const baseScrub: TerrainColor = [0.62 + scrubNoise, 0.56 + scrubNoise * 0.5, 0.35 - scrubNoise * 0.3];
        // Bare stony ground, sparse green bush clusters
        const gravelGround: TerrainColor = [0.55, 0.50, 0.40];
        const bushClump: TerrainColor = [0.40, 0.48, 0.25];
        const gravelBlend = smoothstep(-0.15, -0.40, patch1) * 0.35;
        const bushBlend = smoothstep(0.30, 0.55, patch1) * 0.30;
        inlandColor = mixColor(baseScrub, gravelGround, gravelBlend);
        inlandColor = mixColor(inlandColor, bushClump, bushBlend);
      } else {
        biome = 'desert';
        const duneNoise = _mainNoise(x * 0.02 + 88, z * 0.02 + 88) * 0.05;
        const baseDesert: TerrainColor = [0.8 + duneNoise, 0.7 + duneNoise * 0.6, 0.4 - duneNoise * 0.3];
        // Rocky desert pavement, bright dune crests, pale salt pans
        const rockyPavement: TerrainColor = [0.50, 0.44, 0.35];
        const duneCrest: TerrainColor = [0.88, 0.80, 0.55];
        const saltPan: TerrainColor = [0.82, 0.82, 0.78];
        const pavementBlend = smoothstep(-0.20, -0.50, patch1) * 0.40;
        const duneBlend = smoothstep(0.25, 0.50, patch1) * 0.30;
        const saltBlend = smoothstep(0.45, 0.65, patch2) * 0.20;
        inlandColor = mixColor(baseDesert, rockyPavement, pavementBlend);
        inlandColor = mixColor(inlandColor, duneCrest, duneBlend);
        inlandColor = mixColor(inlandColor, saltPan, saltBlend);
      }
    }
  }

  if (finalHeight >= SEA_LEVEL && biome !== 'waterfall' && biome !== 'river') {
    const drySandColor = mixColor(DRY_SAND_COLOR, ROCKY_SHORE_COLOR, coastSteepness * 0.38);
    const wetSandColor = mixColor(WET_SAND_COLOR, ROCKY_SHORE_COLOR, coastSteepness * 0.52);
    const washColor = mixColor(surfZoneColor, wetSandColor, coastSteepness * 0.35);

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
    reefFactor,
    paddyFlooded,
    slope: 0,
  };
}

// Keep this for backwards compatibility if needed, but we'll use getTerrainData mostly
export function getTerrainHeight(x: number, z: number): number {
  return getTerrainData(x, z).height;
}
