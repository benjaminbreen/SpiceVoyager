import { createNoise2D } from 'simplex-noise';
import {
  PortDefinition, ARCHETYPE_RADIUS, getArchetypeShape, getClimateMoisture,
  reseedArchetypeNoise, setArchetypeMeshHalf, resolveDirRadians,
  type ClimateProfile,
} from './portArchetypes';
import { SEA_LEVEL } from '../constants/world';
import { getResolvedWaterPalette } from './waterPalettes';
import { reseedLandCharacter } from './landCharacter';

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
  reseedLandCharacter(seed);
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

const CARDINAL_RADIANS = {
  N: 0,
  NE: Math.PI / 4,
  E: Math.PI / 2,
  SE: (3 * Math.PI) / 4,
  S: Math.PI,
  SW: (5 * Math.PI) / 4,
  W: (3 * Math.PI) / 2,
  NW: (7 * Math.PI) / 4,
} as const;

export type CoastalBiomeType = 'mangrove' | 'tidal_flat' | 'rocky_shore' | 'lagoon';
export type BiomeType =
  | 'ocean'
  | 'beach'
  | 'desert'
  | 'scrubland'
  | 'paddy'
  | 'swamp'
  | 'grassland'
  | 'forest'
  | 'jungle'
  | 'arroyo'
  | 'snow'
  | 'volcano'
  | 'river'
  | 'waterfall'
  | CoastalBiomeType;

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

const WET_SAND_COLOR: TerrainColor = [0.76, 0.68, 0.50];
const DRY_SAND_COLOR: TerrainColor = [0.94, 0.86, 0.62];
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
  elevation += _mainNoise(x * 0.02, z * 0.02) * 5.0;
  elevation += _mainNoise(x * 0.04, z * 0.04) * 2.0;

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
    // Islands sink fully into ocean at the mesh edge; continentals taper more
    // gently so their coastline meets the background horizon without a cliff.
    if (edgeDist > _meshHalf * 0.82) {
      const fade = 1 - smoothstep(_meshHalf * 0.82, _meshHalf, edgeDist);
      const sinkTarget = isIsolated ? -0.5 : -0.15;
      shape = shape * fade + sinkTarget * (1 - fade);
    }
    h = archetypeHeightFromShape(x, z, dx, dz, shape, pa.def);
    appliedArchetype = true;
  }

  if (_placedArchetypes.length > 0 && !appliedArchetype && h > SEA_LEVEL) {
    h = SEA_LEVEL - 5;
  }
  return h - 7;
}

function climateWindStrength(climate: ClimateProfile): number {
  switch (climate) {
    case 'monsoon': return 1.0;
    case 'tropical': return 0.85;
    case 'mediterranean': return 0.7;
    case 'temperate': return 0.55;
    case 'arid': return 0.35;
  }
}

function archetypeMountainStrength(archetype: PortDefinition): number {
  let strength = 0.58;
  switch (archetype.geography) {
    case 'bay':
    case 'crater_harbor':
      strength = 1.15;
      break;
    case 'continental_coast':
    case 'inlet':
    case 'peninsula':
      strength = 0.70;
      break;
    case 'island':
    case 'coastal_island':
      strength = 0.58;
      break;
    case 'estuary':
    case 'strait':
      strength = 0.34;
      break;
    case 'lagoon':
      strength = 0.18;       // pancake-flat alluvial lagoon — no relief
      break;
    case 'archipelago':
      strength = 0.45;
      break;
  }

  if (archetype.climate === 'arid') strength += 0.12;
  if (archetype.id === 'muscat' || archetype.id === 'aden' || archetype.id === 'socotra') strength += 0.55;
  if (archetype.id === 'mocha') strength += 0.65;
  if (archetype.id === 'zanzibar' || archetype.id === 'diu') strength -= 0.12;
  return Math.max(0.18, strength);
}

function archetypeHeightFromShape(
  x: number,
  z: number,
  localX: number,
  localZ: number,
  shape: number,
  archetype: PortDefinition,
): number {
  if (shape <= 0) return shape * 12;

  // Keep beaches, harbor edges, and most low ground calm; concentrate relief inland.
  const landDepth = smoothstep(0.24, 0.70, shape);
  const inlandBack = smoothstep(0.50, 0.86, shape);
  const strength = archetypeMountainStrength(archetype);
  const openAngle = resolveDirRadians(archetype.openDirection);
  const openX = Math.sin(openAngle);
  const openZ = Math.cos(openAngle);
  const harborSide = localX * openX + localZ * openZ;
  const inlandDistance = -harborSide;
  const inlandBias = smoothstep(-18, 95, inlandDistance);
  const summitOffset = archetype.geography === 'island' || archetype.geography === 'coastal_island'
    ? 35
    : archetype.geography === 'continental_coast' || archetype.geography === 'inlet' || archetype.geography === 'peninsula'
    ? 125
    : 85;
  const ruggedBackdrop = archetype.id === 'muscat'
    || archetype.id === 'aden'
    || archetype.id === 'socotra'
    || archetype.id === 'mocha';
  const summitSpread = ruggedBackdrop
    ? 170
    : 135;
  const summitX = -openX * summitOffset;
  const summitZ = -openZ * summitOffset;
  const summitDist = Math.sqrt((localX - summitX) ** 2 + (localZ - summitZ) ** 2);
  const interiorSummit = (1 - smoothstep(summitSpread * 0.34, summitSpread, summitDist))
    * smoothstep(0.34, 0.72, shape)
    * (0.45 + inlandBias * 0.55);

  const ridgeNoise = 1 - Math.abs(_mainNoise(x * 0.010 + 712.4, z * 0.006 - 248.1));
  const ridge = smoothstep(0.66, 0.90, ridgeNoise);
  const massifNoise = (_patchNoise(x * 0.0035 - 190.0, z * 0.0035 + 503.0) + 1) * 0.5;
  const massif = Math.max(interiorSummit * 0.85, smoothstep(0.66, 0.88, massifNoise));
  const peakNoise = (_volcanoNoise(x * 0.004 + 914.0, z * 0.004 - 313.0) + 1) * 0.5;
  const peak = Math.max(interiorSummit * 0.75, smoothstep(0.90, 0.985, peakNoise));
  const detail = _mainNoise(x * 0.025, z * 0.025) * 2.0;
  const escarpment = bandFactor(
    inlandDistance,
    45,
    ruggedBackdrop ? 90 : 115,
    ruggedBackdrop ? 230 : 190,
    ruggedBackdrop ? 320 : 270,
  ) * smoothstep(0.26, 0.62, shape);

  const ridgeUplift = ridge * (0.35 + massif * 0.65) * landDepth * inlandBias * strength * 8.5;
  const massifUplift = massif * inlandBack * strength * 11;
  const peakUplift = peak * massif * inlandBack * strength * 12;
  const escarpmentUplift = escarpment * strength * (ruggedBackdrop ? 14 : 7);

  return shape * 22.5 + detail + ridgeUplift + massifUplift + peakUplift + escarpmentUplift;
}

function applyWindwardMoisture(
  x: number,
  z: number,
  height: number,
  moisture: number,
  archetype: PortDefinition,
): number {
  const openAngle = resolveDirRadians(archetype.openDirection);
  const openX = Math.sin(openAngle);
  const openZ = Math.cos(openAngle);
  // Treat the harbor-facing sea direction as the prevailing source of moist air.
  const flowX = -openX;
  const flowZ = -openZ;
  const ridgeSample = 70;
  const slopeSample = 22;
  const upwindHeight = getHeightOnly(x - flowX * ridgeSample, z - flowZ * ridgeSample);
  const downwindHeight = getHeightOnly(x + flowX * slopeSample, z + flowZ * slopeSample);
  const slopeIntoWind = downwindHeight - getHeightOnly(x - flowX * slopeSample, z - flowZ * slopeSample);
  const oceanFetch = smoothstep(SEA_LEVEL + 0.8, SEA_LEVEL - 1.8, upwindHeight);
  const orographicLift = smoothstep(1.0, 7.0, slopeIntoWind);
  const rainShadow = smoothstep(5.0, 16.0, upwindHeight - height);
  const strength = climateWindStrength(archetype.climate);

  return clamp01(
    moisture
      + oceanFetch * strength * 0.09
      + orographicLift * strength * 0.13
      - rainShadow * strength * 0.16,
  );
}

/** Background-horizon sampler: distant land beyond the playable mesh.
 *  Uses pure noise-based continent/island terrain without applying archetype
 *  shape overrides (which would otherwise force everything past the playable
 *  area to ocean). Returns a height band–based color suitable for terrain
 *  that will be viewed through atmospheric haze — no need for reef/river/beach
 *  detail at horizon distances. */
export function getBackgroundHeightColor(x: number, z: number): { height: number; color: TerrainColor } {
  if (!_cachedWaterPalette) _cachedWaterPalette = getResolvedWaterPalette();
  const deepWaterColor = _cachedWaterPalette.terrain.deep;
  const shallowWaterColor = _cachedWaterPalette.terrain.shallow;

  let elevation = 0;
  elevation += _mainNoise(x * 0.005, z * 0.005) * 30;
  elevation += _mainNoise(x * 0.01, z * 0.01) * 15;
  elevation += _mainNoise(x * 0.02, z * 0.02) * 5.0;
  elevation += _mainNoise(x * 0.04, z * 0.04) * 2.0;

  const continentNoise = _mainNoise(x * 0.0003, z * 0.0003);
  const islandNoise = _mainNoise(x * 0.0012 + 500, z * 0.0012 + 500);
  const maskNoise = continentNoise * 0.75 + islandNoise * 0.25;
  const mask = smoothstep(0.05, 0.55, maskNoise);

  // Match getTerrainData's final offset so sea level alignment is identical.
  const height = elevation * mask - 7;

  // Smooth multi-stop height ramp. Avoid hard band transitions — at coarse
  // vertex spacing they form straight color edges that read as roads/blocks.
  const beachColor: TerrainColor = [0.74, 0.66, 0.48];
  const lowlandColor: TerrainColor = [0.40, 0.50, 0.28];
  const forestColor: TerrainColor = [0.28, 0.40, 0.22];
  const highlandColor: TerrainColor = [0.44, 0.42, 0.36];
  const peakColor: TerrainColor = [0.82, 0.82, 0.86];

  let color: TerrainColor;
  if (height < SEA_LEVEL) {
    const t = smoothstep(SEA_LEVEL - 6, SEA_LEVEL, height);
    color = mixColor(deepWaterColor, shallowWaterColor, t);
  } else {
    const landH = height - SEA_LEVEL;
    // Micro color variation from noise so large flat areas don't read uniform.
    const tint = _patchNoise(x * 0.02, z * 0.02) * 0.05;
    const beachT = smoothstep(0, 2.5, landH);
    const lowT   = smoothstep(2, 9, landH);
    const forT   = smoothstep(8, 20, landH);
    const highT  = smoothstep(19, 32, landH);
    color = mixColor(beachColor, lowlandColor, beachT);
    color = mixColor(color, forestColor, lowT);
    color = mixColor(color, highlandColor, forT);
    color = mixColor(color, peakColor, highT);
    color = [
      clamp01(color[0] + tint),
      clamp01(color[1] + tint * 0.6),
      clamp01(color[2] + tint * 0.4),
    ];
  }

  return { height, color };
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
  elevation += _mainNoise(x * 0.02, z * 0.02) * 5.0;
  elevation += _mainNoise(x * 0.04, z * 0.04) * 2.0;

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

    // Islands sink fully into ocean at the mesh edge; continentals taper more
    // gently so their coastline meets the background horizon without a cliff.
    const isIsolated = pa.def.geography === 'island';
    const edgeDist = Math.max(Math.abs(dx), Math.abs(dz));
    if (edgeDist > _meshHalf * 0.82) {
      const fade = 1 - smoothstep(_meshHalf * 0.82, _meshHalf, edgeDist);
      const sinkTarget = isIsolated ? -0.5 : -0.15;
      shape = shape * fade + sinkTarget * (1 - fade);
    }

    // Convert shape to height, with occasional inland ridges/massifs while keeping coastlines low.
    const archetypeHeight = archetypeHeightFromShape(x, z, dx, dz, shape, pa.def);

    finalHeight = archetypeHeight;
    appliedArchetype = true;

    // Climate moisture override
    const [moistMin, moistMax] = getClimateMoisture(pa.def.climate);
    moisture = moistMin + (_moistureNoise(x * 0.004, z * 0.004) + 1) / 2 * (moistMax - moistMin);
    moisture = applyWindwardMoisture(x, z, finalHeight - 7, moisture, pa.def);
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
  const nearbyClimate = getNearestClimate(x, z);
  const sandyClimate = nearbyClimate === 'tropical' || nearbyClimate === 'monsoon';
  const beachWidthBoost = (0.72 + (sandyClimate ? 0.42 : 0)) * coastWidthScale * (1 - slope * 0.55);

  const shallowDepth = lerp(3.1, 7.8 + beachWidthBoost * 1.3, coastWidthScale);
  const surfHeight = lerp(0.16, 0.62 + beachWidthBoost * 0.12, coastWidthScale);
  const wetSandHeight = lerp(0.42, 1.15 + beachWidthBoost * 0.34, coastWidthScale);
  const dryBeachHeight = lerp(0.95, 2.45 + beachWidthBoost * 0.95, coastWidthScale);
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
  const biomeNoise = _patchNoise(x * 0.008, z * 0.008) * 1.3;
  const biomeHeight = finalHeight + biomeNoise;

  // Sub-biome patch noise at two frequencies for within-biome variety
  const patch1 = _patchNoise(x * 0.015, z * 0.015) * 0.72;       // field-scale patches (damped for smoother biome coloring)
  const patch2 = _patchNoise(x * 0.04 + 100, z * 0.04 + 100) * 0.72; // clump-scale detail

  // Slope-based rock exposure — steep slopes show underlying rock
  const rockColor: TerrainColor = [
    0.42 + (1 - moisture) * 0.10,   // drier = warmer sandstone
    0.36 - moisture * 0.04,          // wetter = darker basalt
    0.30 + moisture * 0.03,
  ];
  const rockExposure = clamp01(slope * 1.4) * smoothstep(SEA_LEVEL + 1, SEA_LEVEL + 3, finalHeight);

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

    if (shallowFactor > 0.45 && coastSteepness < 0.36 && moisture > 0.48) {
      biome = 'lagoon';
      const lagoonColor: TerrainColor = _cachedWaterPalette.id === 'monsoon'
        ? [0.12, 0.44, 0.34]
        : [0.20, 0.62, 0.58];
      const sandbarColor: TerrainColor = _cachedWaterPalette.id === 'monsoon'
        ? [0.42, 0.54, 0.34]
        : [0.58, 0.70, 0.52];
      const channelColor: TerrainColor = _cachedWaterPalette.id === 'monsoon'
        ? [0.05, 0.28, 0.28]
        : [0.10, 0.42, 0.48];
      const sandbarBlend = smoothstep(0.30, 0.58, patch1) * shallowFactor * 0.28;
      const channelBlend = smoothstep(-0.20, -0.46, patch2) * 0.22;
      color = mixColor(color, lagoonColor, 0.35 + shallowFactor * 0.25);
      color = mixColor(color, sandbarColor, sandbarBlend);
      color = mixColor(color, channelColor, channelBlend);
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
  } else if (biomeHeight > 28) {
    biome = 'snow';
    const snowNoise = _mainNoise(x * 0.03 + 55, z * 0.03 + 55) * 0.03;
    // Patchy snow — windswept rock exposure, deep drifts
    const pureSnow: TerrainColor = [0.92 + snowNoise, 0.92 + snowNoise * 0.5, 0.96 - snowNoise];
    const windsweptRock: TerrainColor = [0.52, 0.48, 0.45];
    const snowPatch = smoothstep(0.05, 0.42, patch1);
    const altitudeSnow = smoothstep(28, 42, biomeHeight);
    inlandColor = mixColor(windsweptRock, pureSnow, 0.35 + snowPatch * 0.35 + altitudeSnow * 0.30);
  } else if (biomeHeight > 20) {
    biome = moisture > 0.45 ? 'forest' : 'arroyo';
    const alpineNoise = _mainNoise(x * 0.035 + 177, z * 0.035 - 211) * 0.06;
    const bareRock: TerrainColor = [
      0.46 + (1 - moisture) * 0.12 + alpineNoise,
      0.42 - moisture * 0.04 + alpineNoise * 0.5,
      0.36 + moisture * 0.03,
    ];
    const scree: TerrainColor = [0.55, 0.52, 0.45];
    const alpineGreen: TerrainColor = moisture > 0.55 ? [0.18, 0.34, 0.18] : [0.42, 0.40, 0.25];
    inlandColor = mixColor(bareRock, scree, smoothstep(0.18, 0.50, patch1) * 0.35);
    inlandColor = mixColor(inlandColor, alpineGreen, smoothstep(-0.18, -0.46, patch2) * 0.22);
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
    const tropicalCoast = sandyClimate;
    const coralSand: TerrainColor = [0.96, 0.93, 0.78];
    const tropicalSandBlend = tropicalCoast ? 0.58 * (1 - coastSteepness * 0.55) : 0;
    const drySandColor = mixColor(
      mixColor(DRY_SAND_COLOR, coralSand, tropicalSandBlend),
      ROCKY_SHORE_COLOR,
      coastSteepness * 0.34,
    );
    const wetSandColor = mixColor(
      mixColor(WET_SAND_COLOR, coralSand, tropicalSandBlend * 0.42),
      ROCKY_SHORE_COLOR,
      coastSteepness * 0.46,
    );
    const washColor = mixColor(surfZoneColor, wetSandColor, coastSteepness * 0.30);
    const lowCoast = finalHeight < SEA_LEVEL + wetSandHeight + 0.9;
    const shelteredCoast = coastSteepness < 0.42;

    color = inlandColor;
    color = mixColor(color, drySandColor, beachFactor);
    color = mixColor(color, wetSandColor, wetSandFactor);
    color = mixColor(color, washColor, surfFactor * 0.72);

    if (coastFactor > 0.10 && finalHeight < SEA_LEVEL + dryBeachHeight + 0.58) {
      if (coastSteepness > 0.68) {
        biome = 'rocky_shore';
        const cliffColor = mixColor(ROCKY_SHORE_COLOR, rockColor, 0.45);
        const sprayStain: TerrainColor = [0.62, 0.60, 0.54];
        const darkCrevice: TerrainColor = [0.24, 0.23, 0.22];
        color = mixColor(color, cliffColor, 0.58);
        color = mixColor(color, sprayStain, smoothstep(0.28, 0.55, patch2) * surfFactor * 0.28);
        color = mixColor(color, darkCrevice, smoothstep(-0.20, -0.48, patch1) * 0.22);
      } else if (tropicalCoast && shelteredCoast && lowCoast && moisture > 0.68 && wetSandFactor > beachFactor * 0.65) {
        biome = 'mangrove';
        const mangroveMud: TerrainColor = [0.22, 0.28, 0.20];
        const brackishGreen: TerrainColor = [0.18, 0.36, 0.26];
        const rootShadow: TerrainColor = [0.10, 0.16, 0.12];
        const reedFringe: TerrainColor = [0.32, 0.42, 0.22];
        color = mixColor(mangroveMud, brackishGreen, smoothstep(0.62, 0.86, moisture));
        color = mixColor(color, wetSandColor, wetSandFactor * 0.35);
        color = mixColor(color, rootShadow, smoothstep(-0.18, -0.44, patch1) * 0.30);
        color = mixColor(color, reedFringe, smoothstep(0.24, 0.52, patch2) * 0.22);
      } else if (shelteredCoast && lowCoast && wetSandFactor + surfFactor > 0.24 && beachFactor < 0.45) {
        biome = 'tidal_flat';
        const siltColor: TerrainColor = [0.54, 0.49, 0.39];
        const slickMud: TerrainColor = [0.38, 0.42, 0.38];
        const paleSilt: TerrainColor = [0.66, 0.61, 0.48];
        const waterStreak: TerrainColor = [0.30, 0.44, 0.46];
        color = mixColor(siltColor, slickMud, smoothstep(0.35, 0.75, moisture));
        color = mixColor(color, washColor, surfFactor * 0.45);
        color = mixColor(color, paleSilt, smoothstep(0.22, 0.54, patch1) * 0.26);
        color = mixColor(color, waterStreak, smoothstep(-0.16, -0.42, patch2) * wetSandFactor * 0.32);
      } else {
        biome = 'beach';
        const wrackLine: TerrainColor = [0.44, 0.34, 0.20];
        color = mixColor(color, wrackLine, smoothstep(0.18, 0.46, patch2) * wetSandFactor * 0.18);
      }
    }
  }

  // Apply climate-specific color tinting — desaturation + tonal shift for cohesion
  if (biome !== 'ocean' && nearbyClimate) {
    color = applyClimateTint(color, nearbyClimate);
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
    slope,
  };
}

/** Shifts terrain color toward a climate-appropriate tone — desaturates and tints
 *  so all biomes within a region share a common color family. */
function applyClimateTint(color: TerrainColor, climate: ClimateProfile): TerrainColor {
  let sat: number, tint: TerrainColor, tintStr: number;

  switch (climate) {
    case 'tropical':
      // Lush but slightly earthy — just a gentle muting
      sat = 0.92; tint = [0.45, 0.42, 0.32]; tintStr = 0.06;
      break;
    case 'temperate':
      // Grey-green, cool, noticeably muted
      sat = 0.72; tint = [0.42, 0.46, 0.44]; tintStr = 0.14;
      break;
    case 'arid':
      // Dusty ochre warmth, moderately desaturated
      sat = 0.78; tint = [0.55, 0.45, 0.32]; tintStr = 0.12;
      break;
    case 'mediterranean':
      // Warm olive, between tropical and temperate
      sat = 0.82; tint = [0.48, 0.44, 0.34]; tintStr = 0.10;
      break;
    case 'monsoon':
      // Deep rich greens, mild muting
      sat = 0.88; tint = [0.28, 0.38, 0.30]; tintStr = 0.10;
      break;
  }

  // Perceptual luminance
  const lum = color[0] * 0.299 + color[1] * 0.587 + color[2] * 0.114;

  // Desaturate toward grey
  let r = lum + (color[0] - lum) * sat;
  let g = lum + (color[1] - lum) * sat;
  let b = lum + (color[2] - lum) * sat;

  // Mix toward climate tint
  r = r + (tint[0] - r) * tintStr;
  g = g + (tint[1] - g) * tintStr;
  b = b + (tint[2] - b) * tintStr;

  return [clamp01(r), clamp01(g), clamp01(b)];
}

// Keep this for backwards compatibility if needed, but we'll use getTerrainData mostly
export function getTerrainHeight(x: number, z: number): number {
  return getTerrainData(x, z).height;
}
