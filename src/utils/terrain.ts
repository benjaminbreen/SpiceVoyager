import { createNoise2D } from 'simplex-noise';
import {
  PortDefinition, ARCHETYPE_RADIUS, getArchetypeShape, getClimateMoisture,
  getRiverPlumeStrength,
  reseedArchetypeNoise, setArchetypeMeshHalf, resolveDirRadians,
  type ClimateProfile,
} from './portArchetypes';
import { SEA_LEVEL } from '../constants/world';
import { getResolvedWaterPalette } from './waterPalettes';
import { reseedLandCharacter } from './landCharacter';
import type { CanalLayout } from './canalLayout';

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

// ── Active urban canals (registered by mapGenerator after city generation) ────
// Each entry pairs a canal layout with a bounding circle so getTerrainData can
// early-out for points far from any canal city. Canal carving here lowers the
// terrain mesh to below sea level inside canal water strips, which makes the
// ocean overlay show through as visible water — turning the placement-grid
// canals (Amsterdam, Venice) into actual rendered waterways.
interface ActiveCanal {
  layout: CanalLayout;
  cx: number;
  cz: number;
  /** Furthest point of any canal segment from (cx,cz), plus halfWidth + slack. */
  bboxRadius: number;
  segments: ActiveCanalSegment[];
}
interface ActiveCanalSegment {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  halfWidth: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}
let _activeCanals: ActiveCanal[] = [];
const CANAL_DREDGE_BAND = 3.0;

export function setActiveCanals(entries: { layout: CanalLayout; cx: number; cz: number }[]) {
  _activeCanals = entries.map(({ layout, cx, cz }) => {
    let maxR = 0;
    const segments: ActiveCanalSegment[] = [];
    for (const seg of layout.canals) {
      for (const [px, pz] of seg.polyline) {
        const d = Math.hypot(px - cx, pz - cz) + seg.halfWidth;
        if (d > maxR) maxR = d;
      }
      for (let i = 0; i < seg.polyline.length - 1; i++) {
        const [ax, az] = seg.polyline[i];
        const [bx, bz] = seg.polyline[i + 1];
        const pad = seg.halfWidth + CANAL_DREDGE_BAND;
        segments.push({
          ax, az, bx, bz,
          halfWidth: seg.halfWidth,
          minX: Math.min(ax, bx) - pad,
          maxX: Math.max(ax, bx) + pad,
          minZ: Math.min(az, bz) - pad,
          maxZ: Math.max(az, bz) + pad,
        });
      }
    }
    return { layout, cx, cz, bboxRadius: maxR + CANAL_DREDGE_BAND + 1, segments };
  });
}

export function getActiveCanals() {
  return _activeCanals;
}

function signedDistanceToActiveCanal(x: number, z: number, canal: ActiveCanal): number {
  let best = Infinity;
  for (const seg of canal.segments) {
    if (x < seg.minX || x > seg.maxX || z < seg.minZ || z > seg.maxZ) continue;
    const dx = seg.bx - seg.ax;
    const dz = seg.bz - seg.az;
    const len2 = dx * dx + dz * dz;
    if (len2 < 1e-6) continue;
    let t = ((x - seg.ax) * dx + (z - seg.az) * dz) / len2;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    const cx = seg.ax + dx * t;
    const cz = seg.az + dz * t;
    const dist = Math.hypot(x - cx, z - cz) - seg.halfWidth;
    if (dist < best) best = dist;
  }
  return best;
}

// ── Natural-feature POI islands (volcanoes, etc.) ────────────────────────────
//
// Bespoke natural POIs (currently Krakatoa) bring their own visual cone but
// no land underneath them in the procgen heightmap. That breaks ship
// collision (sails right through), disembark (no land detected), and any
// downstream code that expects the world to be self-consistent. The registry
// below lets a natural POI publish a small disc-of-land bump at its location
// — terrain queries inside the disc return a moderate above-sea height with
// a smooth ramp to deep water at the perimeter, so:
//   • Ship.tsx's terrainHeight > -0.15 collision check fires inside the disc
//   • GameScene disembark cliff-rise check passes (gentle ramp, not steep)
//   • Walking-mode ground sampling sees a flat plateau to stand on
// The visual cone deliberately extends *past* the bump so its lower flank
// reads as rocky outcrops emerging from water, while the safe disembark
// area is the inner plateau.
interface NaturalIsland {
  cx: number;
  cz: number;
  /** Beyond this radius the bump has no effect — pure terrain shows through. */
  outerRadius: number;
  /** Within this radius the bump is full peakHeight — flat plateau. */
  innerRadius: number;
  /** Height above SEA_LEVEL at the plateau center. */
  peakHeight: number;
}
let _naturalIslands: NaturalIsland[] = [];

export function setNaturalIslands(islands: NaturalIsland[]) {
  _naturalIslands = islands;
}

/** Apply any natural-POI island bumps to a base terrain height. The bump
 *  takes the max with the existing terrain so we never lower real land. */
function applyNaturalIslandBump(x: number, z: number, height: number): number {
  if (_naturalIslands.length === 0) return height;
  let result = height;
  for (const isle of _naturalIslands) {
    const dx = x - isle.cx;
    const dz = z - isle.cz;
    const d2 = dx * dx + dz * dz;
    const outerSq = isle.outerRadius * isle.outerRadius;
    if (d2 >= outerSq) continue;
    const d = Math.sqrt(d2);
    let bump: number;
    if (d <= isle.innerRadius) {
      bump = isle.peakHeight;
    } else {
      const t = (d - isle.innerRadius) / (isle.outerRadius - isle.innerRadius);
      const eased = 1 - smoothstep(0, 1, t);
      bump = isle.peakHeight * eased;
    }
    const bumped = SEA_LEVEL + bump;
    if (bumped > result) result = bumped;
  }
  return result;
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
  /** Climate-scaled silty river-plume strength in [0,1]. Non-zero only near
   *  the mouth of an estuary/tidal-river archetype; consumed by the ocean
   *  surface overlay to brown the water near deltas. */
  plumeFactor: number;
}

const WET_SAND_COLOR: TerrainColor = [0.76, 0.68, 0.50];
const DRY_SAND_COLOR: TerrainColor = [0.94, 0.86, 0.62];
const ROCKY_SHORE_COLOR: TerrainColor = [0.47, 0.41, 0.35];

type ShoreProfile =
  | 'open_sandy_beach'
  | 'tidal_mudflat'
  | 'marsh_reed_edge'
  | 'mangrove_edge'
  | 'rocky_bank';

function classifyShoreProfile(args: {
  climate: ClimateProfile | null;
  slope: number;
  moisture: number;
  coastSteepness: number;
  flatShoreFactor: number;
  wetSandFactor: number;
  beachFactor: number;
  raisedBankFactor: number;
  plumeFactor: number;
}): ShoreProfile {
  const {
    climate,
    slope,
    moisture,
    coastSteepness,
    flatShoreFactor,
    wetSandFactor,
    beachFactor,
    raisedBankFactor,
    plumeFactor,
  } = args;
  const sheltered = coastSteepness < 0.42;
  const lowFlat = flatShoreFactor > 0.12 && slope < 0.30 && coastSteepness < 0.62;

  if (raisedBankFactor > 0.14 && !lowFlat) return 'rocky_bank';
  if (coastSteepness > 0.68 || slope > 0.46) return 'rocky_bank';

  const wetEdge = wetSandFactor > beachFactor * 0.65 || plumeFactor > 0.12;
  if ((climate === 'tropical' || climate === 'monsoon') && sheltered && wetEdge && moisture > 0.68) {
    return 'mangrove_edge';
  }
  if (climate === 'temperate' && sheltered && wetEdge && moisture > 0.52) {
    return 'marsh_reed_edge';
  }
  if (sheltered && (wetEdge || flatShoreFactor > 0.34)) return 'tidal_mudflat';

  return 'open_sandy_beach';
}

// Cache resolved water palette to avoid store lookups per vertex
let _cachedWaterPalette: ReturnType<typeof getResolvedWaterPalette> | null = null;

/** Call before a batch of getTerrainData calls to refresh the palette cache. */
export function refreshTerrainPaletteCache() {
  _cachedWaterPalette = getResolvedWaterPalette();
}

/**
 * Shape edge fade. Islands sink to ocean on all sides at the mesh boundary
 * (so they read as isolated landmasses). Continental archetypes only fade on
 * the open-water side — land must extend off the lateral and inland edges
 * of the mesh so the map doesn't look like a square island with a wedge cut
 * into it. Uses the archetype's openDirection to project edge distance onto
 * the seaward axis.
 */
function applyEdgeFade(shape: number, dx: number, dz: number, def: PortDefinition): number {
  const isIsolated = def.geography === 'island';
  if (isIsolated) {
    const edgeDist = Math.max(Math.abs(dx), Math.abs(dz));
    if (edgeDist <= _meshHalf * 0.82) return shape;
    const fade = 1 - smoothstep(_meshHalf * 0.82, _meshHalf, edgeDist);
    return shape * fade + (-0.5) * (1 - fade);
  }
  // Continental: only fade toward the open-water direction.
  const openAngle = resolveDirRadians(def.openDirection);
  const openX = Math.sin(openAngle);
  const openZ = Math.cos(openAngle);
  // Positive openDist = toward open ocean from the port center.
  const openDist = dx * openX + dz * openZ;
  if (openDist <= _meshHalf * 0.82) return shape;
  const fade = 1 - smoothstep(_meshHalf * 0.82, _meshHalf * 1.05, openDist);
  return shape * fade + (-0.15) * (1 - fade);
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
    shape = applyEdgeFade(shape, dx, dz, pa.def);
    h = archetypeHeightFromShape(x, z, dx, dz, shape, pa.def);
    appliedArchetype = true;
  }

  if (_placedArchetypes.length > 0 && !appliedArchetype && h > SEA_LEVEL) {
    h = SEA_LEVEL - 5;
  }
  let height = h - 7;
  // Mirror getTerrainData's canal carving so slope estimation stays consistent
  // along canal banks (otherwise the slope sampler reads natural land height on
  // one side of the canal and water height on the other, producing a fake cliff).
  // Must use the same smoothed dredge band, or the slope sampler would see a
  // sharp cliff at the canal edge while the visual mesh has a gradual ramp.
  if (_activeCanals.length > 0 && height > SEA_LEVEL - 1.0) {
    const CANAL_TROUGH_Y = SEA_LEVEL - 1.6;
    for (const ac of _activeCanals) {
      const dx = x - ac.cx;
      const dz = z - ac.cz;
      if (dx * dx + dz * dz > ac.bboxRadius * ac.bboxRadius) continue;
      const signed = signedDistanceToActiveCanal(x, z, ac);
      if (signed <= 0) {
        height = CANAL_TROUGH_Y;
        break;
      }
      if (signed < CANAL_DREDGE_BAND) {
        const t = signed / CANAL_DREDGE_BAND;
        const blend = t * t * (3 - 2 * t);
        const carved = CANAL_TROUGH_Y + (height - CANAL_TROUGH_Y) * blend;
        if (carved < height) height = carved;
        break;
      }
    }
  }
  // Natural-POI islands (volcano discs, etc.) — applied last so they show
  // through any base terrain or canal carving. The bump only ever raises.
  height = applyNaturalIslandBump(x, z, height);
  return height;
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
    case 'tidal_river':
      // A floodplain river cutting through low alluvium — flatter than an
      // estuary because the river is bounded by levees and low banks rather
      // than a coastal hill rim. London and Seville both fit this profile.
      strength = 0.22;
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
  // Lowland-on-flat-coast overrides. The default per-geography strengths fit
  // the dramatic ports (Salvador on its bluff, Mombasa on a coral island) but
  // overstate relief for cities that historically sat on flat alluvium.
  if (archetype.id === 'calicut') strength -= 0.30;          // Malabar coastal plain
  if (archetype.id === 'manila') strength -= 0.55;           // Pasig delta — distant hills
  if (archetype.id === 'cartagena') strength -= 0.65;        // low limestone shelf
  if (archetype.id === 'havana') strength -= 0.30;           // limestone, gentle relief
  if (archetype.id === 'bantam') strength -= 0.85;           // mangrove flats
  // Lisbon sits on the famous seven hills above the Tagus — Castelo de São Jorge,
  // Graça, São Vicente, etc. The estuary baseline (0.34) reads pancake-flat.
  if (archetype.id === 'lisbon') strength += 0.95;
  return Math.max(0.15, strength);
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

  if (archetype.geography === 'lagoon') {
    const microRelief = _mainNoise(x * 0.028 + 51.7, z * 0.028 - 93.4) * 0.15;
    return 9.7 + shape * 1.35 + microRelief;
  }

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
  let summitOffset = archetype.geography === 'island' || archetype.geography === 'coastal_island'
    ? 35
    : archetype.geography === 'continental_coast' || archetype.geography === 'inlet' || archetype.geography === 'peninsula'
    ? 125
    : archetype.geography === 'tidal_river' || archetype.geography === 'estuary'
    ? 170                  // low river basin — push any inland mass well past the city
    : 85;
  // Lisbon's seven hills rise immediately behind the Ribeira waterfront, not far
  // inland — pull the summit close so Castelo de São Jorge sits right above the city.
  if (archetype.id === 'lisbon') summitOffset = 55;
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

  // Harbor plateau: suppress all relief inside the buildable port zone so the
  // city sits on flat low ground near the water. Without this, rugged-backdrop
  // ports (Muscat, Aden, Mocha) push the escarpment band into the build radius
  // and buildings end up clinging to a hillside. The plateau ramps up so distant
  // hinterland still gets full mountain mass.
  // Lisbon overrides this — the seven hills (Castelo, Graça, São Vicente) rise
  // directly out of the Ribeira waterfront. We want a narrow flat strip right at
  // the docks and full hills almost immediately behind.
  const plateauNear = archetype.id === 'lisbon' ? 8 : 20;
  const plateauFar = archetype.id === 'lisbon' ? 45 : 110;
  const harborPlateau = smoothstep(plateauNear, plateauFar, inlandDistance);
  const ridgeUplift = ridge * (0.35 + massif * 0.65) * landDepth * inlandBias * strength * 8.5;
  const massifUplift = massif * inlandBack * harborPlateau * strength * 11;
  const peakUplift = peak * massif * inlandBack * harborPlateau * strength * 12;
  const escarpmentUplift = escarpment * harborPlateau * strength * (ruggedBackdrop ? 14 : 7);

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
  let activeArchetype: PortDefinition | null = null;
  let activeDx = 0;
  let activeDz = 0;
  for (const pa of _placedArchetypes) {
    if (pa.def.geography === 'archipelago') continue;

    const dx = x - pa.cx;
    const dz = z - pa.cz;

    let shape = getArchetypeShape(dx, dz, pa.def); // -1 to 1
    shape = applyEdgeFade(shape, dx, dz, pa.def);

    // Convert shape to height, with occasional inland ridges/massifs while keeping coastlines low.
    const archetypeHeight = archetypeHeightFromShape(x, z, dx, dz, shape, pa.def);

    finalHeight = archetypeHeight;
    appliedArchetype = true;
    activeArchetype = pa.def;
    activeDx = dx;
    activeDz = dz;

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

  // ── Urban canal carving ──────────────────────────────────────────────────────
  // After the natural-terrain height is finalized, dip the mesh below sea level
  // wherever an active canal water strip covers this point — and within a
  // small `dredge` band beyond the strip's edge, smoothly ramp from the deep
  // canal trough back up to the natural terrain height. The band is wider
  // than one mesh quad (~2.78u at the standard 900/324 grid), so even a
  // canal narrower than 3 quads still pulls at least one nearby vertex
  // below sea level — without the band, narrow canals (rings, radials)
  // were Nyquist-aliased and rendered invisibly while only the wider
  // central inlet survived. Bounding-circle pre-check keeps the per-vertex
  // cost negligible outside canal cities.
  let urbanCanalBankFactor = 0;
  if (_activeCanals.length > 0 && finalHeight > SEA_LEVEL - 1.0) {
    const CANAL_TROUGH_Y = SEA_LEVEL - 1.6;
    for (const ac of _activeCanals) {
      const dx = x - ac.cx;
      const dz = z - ac.cz;
      if (dx * dx + dz * dz > ac.bboxRadius * ac.bboxRadius) continue;
      const signed = signedDistanceToActiveCanal(x, z, ac);
      if (signed <= 0) {
        // Inside the canal water strip — full trough depth.
        finalHeight = CANAL_TROUGH_Y;
        break;
      }
      if (signed < CANAL_DREDGE_BAND) {
        // Just outside the edge — smoothstep from trough Y up to natural
        // height across the dredge band. The 1 - smoothstep flips it so
        // signed=0 returns 0 (full carve) and signed=BAND returns 1 (no
        // carve), then we lerp finalHeight from CANAL_TROUGH_Y to itself
        // at edge to natural at band.
        const t = signed / CANAL_DREDGE_BAND;
        const blend = t * t * (3 - 2 * t); // smoothstep(0..1)
        const carved = CANAL_TROUGH_Y + (finalHeight - CANAL_TROUGH_Y) * blend;
        // Only lower (never raise) the natural height — a canal carve
        // should not push a riverbank up above what it would naturally be.
        if (carved < finalHeight) finalHeight = carved;
        urbanCanalBankFactor = Math.max(urbanCanalBankFactor, 1 - blend);
        break;
      }
    }
  }

  // Natural-POI island bumps (volcano discs, etc.) — last, so they raise
  // above any other carving. Mirrors getHeightOnly so all consumers agree.
  finalHeight = applyNaturalIslandBump(x, z, finalHeight);

  // ── Slope estimation (central differences via lightweight height function) ──
  const SLOPE_EPS = 2.0;
  const hR = getHeightOnly(x + SLOPE_EPS, z);
  const hL = getHeightOnly(x - SLOPE_EPS, z);
  const hU = getHeightOnly(x, z + SLOPE_EPS);
  const hD = getHeightOnly(x, z - SLOPE_EPS);
  const dhdx = (hR - hL) / (2 * SLOPE_EPS);
  const dhdz = (hU - hD) / (2 * SLOPE_EPS);
  const slope = clamp01(Math.sqrt(dhdx * dhdx + dhdz * dhdz) * 0.12);
  let raisedBankFactor = 0;
  if (finalHeight >= SEA_LEVEL && finalHeight < SEA_LEVEL + 7.5) {
    let shoreMinNeighborHeight = Math.min(hR, hL, hU, hD);
    if (shoreMinNeighborHeight > SEA_LEVEL + 0.2) {
      const SHORE_PROBE = 7.5;
      shoreMinNeighborHeight = Math.min(
        shoreMinNeighborHeight,
        getHeightOnly(x + SHORE_PROBE, z),
        getHeightOnly(x - SHORE_PROBE, z),
        getHeightOnly(x, z + SHORE_PROBE),
        getHeightOnly(x, z - SHORE_PROBE),
      );
    }
    raisedBankFactor =
      smoothstep(SEA_LEVEL + 0.2, SEA_LEVEL - 1.2, shoreMinNeighborHeight)
      * smoothstep(SEA_LEVEL + 7.5, SEA_LEVEL + 0.8, finalHeight);
  }

  const coastReliefNoise = Math.abs(_mainNoise(x * 0.008 + 321.5, z * 0.008 - 187.2));
  const coastSteepness = clamp01(smoothstep(0.42, 0.86, mask) * 0.48 + coastReliefNoise * 0.52);
  const coastWidthScale = 1 - coastSteepness;
  const nearbyClimate = getNearestClimate(x, z);
  const sandyClimate = nearbyClimate === 'tropical' || nearbyClimate === 'monsoon';
  const dryCoastClimate = nearbyClimate === 'arid' || nearbyClimate === 'mediterranean';
  const temperateCoastClimate = nearbyClimate === 'temperate';
  const beachWidthBoost = (
    1.12
    + (sandyClimate ? 0.82 : 0)
    + (dryCoastClimate ? 0.70 : 0)
    + (temperateCoastClimate ? 0.48 : 0)
  ) * coastWidthScale * (1 - slope * 0.55);

  const shallowDepth = lerp(3.1, 8.4 + beachWidthBoost * 1.45, coastWidthScale);
  const surfHeight = lerp(0.20, 0.72 + beachWidthBoost * 0.16, coastWidthScale);
  const wetSandHeight = lerp(0.56, 1.45 + beachWidthBoost * 0.42, coastWidthScale);
  const dryBeachHeight = lerp(1.25, 3.30 + beachWidthBoost * 1.12, coastWidthScale);
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
  const flatShoreFactor = Math.max(shallowFactor, surfFactor, wetSandFactor, beachFactor);
  const coastFactor = Math.max(flatShoreFactor, raisedBankFactor);

  // Coral reef factor — patchy distribution in shallow tropical/monsoon waters
  const reefNoiseVal = (_reefNoise(x * 0.008, z * 0.008) + 1) * 0.5; // 0-1
  const reefDepthBand = bandFactor(finalHeight, SEA_LEVEL - 6, SEA_LEVEL - 5, SEA_LEVEL - 0.6, SEA_LEVEL - 0.2);
  const reefFactor = finalHeight < SEA_LEVEL
    ? smoothstep(0.2, 0.45, reefNoiseVal)
      * reefDepthBand
      * smoothstep(0.35, 0.55, moisture)
      * clamp01(1 - coastSteepness * 1.2)
    : 0;

  // ── River-plume strength (climate-scaled) ────────────────────────────────────
  // Reused by the seafloor tint below and by the ocean surface overlay.
  let plumeFactor = 0;
  if (activeArchetype) {
    const rawPlume = getRiverPlumeStrength(activeDx, activeDz, activeArchetype);
    if (rawPlume > 0) {
      const climateScale =
        activeArchetype.climate === 'monsoon'       ? 1.00 :
        activeArchetype.climate === 'temperate'     ? 0.85 :
        activeArchetype.climate === 'tropical'      ? 0.55 :
        activeArchetype.climate === 'mediterranean' ? 0.40 :
        0; // arid: Red Sea / Gulf rivers don't carry visible silt
      plumeFactor = rawPlume * climateScale;
    }
  }
  const shoreProfile = classifyShoreProfile({
    climate: nearbyClimate,
    slope,
    moisture,
    coastSteepness,
    flatShoreFactor,
    wetSandFactor,
    beachFactor,
    raisedBankFactor,
    plumeFactor,
  });

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
    if (underwaterBlend > 0.45 && coastSteepness < 0.64) {
      const submergedSand: TerrainColor = nearbyClimate === 'mediterranean'
        ? [0.72, 0.64, 0.46]
        : nearbyClimate === 'arid'
        ? [0.76, 0.64, 0.40]
        : nearbyClimate === 'temperate'
        ? [0.55, 0.52, 0.40]
        : sandyClimate
        ? [0.72, 0.74, 0.52]
        : [0.58, 0.55, 0.42];
      const submergedStrength = nearbyClimate === 'temperate' ? 0.18 : 0.30;
      color = mixColor(color, submergedSand, shallowFactor * underwaterBlend * submergedStrength);
    }
    color = mixColor(color, surfZoneColor, surfFactor * 0.25);
    color = mixColor(color, ROCKY_SHORE_COLOR, underwaterBlend * coastSteepness * 0.18);

    // Silty river-plume tint near deltas — sediment carried out by the outflow
    // makes the water near a river mouth read brown-green instead of clean blue.
    // Pushed hard on the seafloor since the reflective Water surface overhead
    // washes most of this out; the matching tint on the ocean overlay (Ocean.tsx)
    // is what actually carries the effect to the player.
    if (plumeFactor > 0) {
      const depthScale = 0.55 + 0.45 * underwaterBlend; // ~half strength in deep, full in shallows
      // Muted green-brown silt — dark enough to read as murky estuary water
      // without pulling the plume toward pale yellow-tan.
      const siltColor: TerrainColor = [0.28, 0.34, 0.24];
      color = mixColor(color, siltColor, plumeFactor * depthScale * 0.85);
    }

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
    const temperateCoast = nearbyClimate === 'temperate';
    const mediterraneanCoast = nearbyClimate === 'mediterranean';
    const coralSand: TerrainColor = [0.96, 0.93, 0.78];
    const monsoonSand: TerrainColor = [0.78, 0.72, 0.52];
    const temperateSand: TerrainColor = [0.70, 0.66, 0.50];
    const aridSand: TerrainColor = [0.88, 0.74, 0.46];
    const mediterraneanSand: TerrainColor = [0.86, 0.80, 0.64];
    const sandyShore = 1 - coastSteepness * 0.45;
    const tropicalSandBlend = nearbyClimate === 'tropical' ? 0.82 * sandyShore : 0;
    const monsoonSandBlend = nearbyClimate === 'monsoon' ? 0.62 * sandyShore : 0;
    const temperateSandBlend = temperateCoast ? 0.48 * sandyShore : 0;
    const aridSandBlend = nearbyClimate === 'arid' ? 0.70 * sandyShore : 0;
    const mediterraneanSandBlend = mediterraneanCoast ? 0.58 * sandyShore : 0;
    const drySandColor = mixColor(
      mixColor(
        mixColor(
          mixColor(
            mixColor(
              mixColor(DRY_SAND_COLOR, coralSand, tropicalSandBlend),
              monsoonSand,
              monsoonSandBlend,
            ),
            temperateSand,
            temperateSandBlend,
          ),
          aridSand,
          aridSandBlend,
        ),
        mediterraneanSand,
        mediterraneanSandBlend,
      ),
      ROCKY_SHORE_COLOR,
      coastSteepness * 0.34,
    );
    const brightBeachColor: TerrainColor =
      nearbyClimate === 'tropical' ? [1.00, 0.98, 0.86] :
      nearbyClimate === 'monsoon' ? [0.96, 0.90, 0.70] :
      mediterraneanCoast ? [0.95, 0.89, 0.70] :
      nearbyClimate === 'arid' ? [0.92, 0.80, 0.54] :
      temperateCoast ? [0.78, 0.74, 0.58] :
      drySandColor;
    const wetSandColor = mixColor(
      mixColor(
        mixColor(
          mixColor(
            mixColor(
              mixColor(WET_SAND_COLOR, coralSand, tropicalSandBlend * 0.48),
              monsoonSand,
              monsoonSandBlend * 0.42,
            ),
            temperateSand,
            temperateSandBlend * 0.45,
          ),
          aridSand,
          aridSandBlend * 0.38,
        ),
        [0.58, 0.55, 0.45],
        mediterraneanSandBlend * 0.38,
      ),
      ROCKY_SHORE_COLOR,
      coastSteepness * 0.46,
    );
    const washColor = mixColor(surfZoneColor, wetSandColor, coastSteepness * 0.30);
    const lowCoast = finalHeight < SEA_LEVEL + wetSandHeight + 0.9;
    const shelteredCoast = coastSteepness < 0.42;
    const tidalFlatBias = temperateCoast ? 0.12 : 0;
    const beachContinuity = 0.58 + smoothstep(-0.42, 0.34, patch1) * 0.42;
    const dryBeachStrength =
      shoreProfile === 'open_sandy_beach' ? beachContinuity :
      shoreProfile === 'tidal_mudflat' ? 0.24 :
      shoreProfile === 'marsh_reed_edge' ? 0.12 :
      shoreProfile === 'mangrove_edge' ? 0.08 :
      0.05;
    const wetEdgeStrength =
      shoreProfile === 'open_sandy_beach' ? 0.88 :
      shoreProfile === 'tidal_mudflat' ? (temperateCoast ? 1.36 : 1.20) :
      shoreProfile === 'marsh_reed_edge' ? (temperateCoast ? 1.15 : 0.82) :
      shoreProfile === 'mangrove_edge' ? 0.62 :
      0.34;
    const washStrength =
      shoreProfile === 'rocky_bank' ? 0.34 :
      shoreProfile === 'mangrove_edge' || shoreProfile === 'marsh_reed_edge' ? 0.46 :
      0.72;
    const whiteBeachEligibility =
      shoreProfile === 'open_sandy_beach'
      && (nearbyClimate === 'tropical' || nearbyClimate === 'monsoon' || mediterraneanCoast)
      && coastSteepness < 0.58
      ? 1
      : 0;
    const lowShoreShelf = coastFactor * smoothstep(SEA_LEVEL + 5.2, SEA_LEVEL + 0.35, finalHeight);
    const exposedTidalFlat =
      shelteredCoast
      && lowCoast
      && slope < 0.28
      && coastSteepness < 0.58
      && !(shoreProfile === 'open_sandy_beach' && whiteBeachEligibility > 0 && beachFactor > 0.48)
      ? Math.max(wetSandFactor, surfFactor * 0.75, beachFactor * 0.50, lowShoreShelf * 0.72)
      : 0;
    const visibleBeachApron = Math.max(
      beachFactor,
      wetSandFactor * 0.72,
      surfFactor * 0.36,
      lowShoreShelf * (shoreProfile === 'rocky_bank' ? 0.32 : 0.58) * (1 - coastSteepness * 0.36),
    );
    const whiteBeachApron = whiteBeachEligibility * Math.max(
      beachFactor,
      wetSandFactor * 0.35,
      lowShoreShelf * (nearbyClimate === 'tropical' ? 0.82 : mediterraneanCoast ? 0.62 : 0.48),
    );

    color = inlandColor;
    color = mixColor(color, drySandColor, beachFactor * dryBeachStrength);
    color = mixColor(color, drySandColor, visibleBeachApron * dryBeachStrength * 0.72);
    color = mixColor(color, brightBeachColor, whiteBeachApron * dryBeachStrength * 0.70);
    color = mixColor(color, wetSandColor, wetSandFactor * wetEdgeStrength);
    color = mixColor(color, washColor, surfFactor * washStrength);

    const contactLine = bandFactor(
      coastalHeight,
      SEA_LEVEL + 0.015,
      SEA_LEVEL + 0.08,
      SEA_LEVEL + 0.55,
      SEA_LEVEL + 1.35,
    ) * Math.max(wetSandFactor, surfFactor * 0.72, lowShoreShelf * 0.52) * (1 - coastSteepness * 0.24);
    if (contactLine > 0.01) {
      const contactColor: TerrainColor =
        shoreProfile === 'rocky_bank'
          ? [0.22, 0.22, 0.20]
          : shoreProfile === 'mangrove_edge' || shoreProfile === 'marsh_reed_edge' || shoreProfile === 'tidal_mudflat'
          ? [0.24, 0.29, 0.24]
          : [0.48, 0.40, 0.27];
      const brokenLine = 0.58 + smoothstep(-0.28, 0.42, patch2) * 0.42;
      color = mixColor(color, contactColor, Math.min(0.62, contactLine * brokenLine));
    }

    if (temperateCoast && (shoreProfile === 'tidal_mudflat' || shoreProfile === 'marsh_reed_edge')) {
      const wetSilt: TerrainColor = shoreProfile === 'marsh_reed_edge'
        ? [0.28, 0.34, 0.26]
        : [0.30, 0.32, 0.27];
      const bankMud: TerrainColor = [0.24, 0.27, 0.23];
      const reedStain: TerrainColor = [0.34, 0.40, 0.24];
      const edgeMudFactor = Math.max(wetSandFactor * 0.90, surfFactor * 0.55);
      color = mixColor(color, wetSilt, edgeMudFactor);
      color = mixColor(color, bankMud, smoothstep(-0.18, -0.46, patch2) * edgeMudFactor * 0.38);
      color = mixColor(color, reedStain, smoothstep(0.18, 0.50, patch1) * edgeMudFactor * 0.22);
    }
    if (raisedBankFactor > 0.08) {
      const bankDirt: TerrainColor = temperateCoast
        ? [0.66, 0.58, 0.40]
        : mediterraneanCoast
        ? [0.72, 0.64, 0.46]
        : nearbyClimate === 'arid'
        ? [0.74, 0.60, 0.36]
        : nearbyClimate === 'monsoon'
        ? [0.58, 0.50, 0.34]
        : [0.70, 0.64, 0.43];
      const bankShadow: TerrainColor = [0.34, 0.30, 0.22];
      const bankRimFactor = raisedBankFactor * smoothstep(SEA_LEVEL + 4.2, SEA_LEVEL + 0.7, finalHeight);
      color = mixColor(color, bankDirt, bankRimFactor * (temperateCoast ? 0.84 : 0.76));
      color = mixColor(color, bankShadow, smoothstep(-0.12, -0.42, patch1) * bankRimFactor * 0.30);
    }

    if (flatShoreFactor > 0.10 && finalHeight < SEA_LEVEL + dryBeachHeight + 0.58) {
      if (shoreProfile === 'rocky_bank') {
        biome = 'rocky_shore';
        const cliffColor = mixColor(ROCKY_SHORE_COLOR, rockColor, 0.45);
        const sprayStain: TerrainColor = [0.62, 0.60, 0.54];
        const darkCrevice: TerrainColor = [0.24, 0.23, 0.22];
        color = mixColor(color, cliffColor, 0.58);
        color = mixColor(color, sprayStain, smoothstep(0.28, 0.55, patch2) * surfFactor * 0.28);
        color = mixColor(color, darkCrevice, smoothstep(-0.20, -0.48, patch1) * 0.22);
      } else if (shoreProfile === 'mangrove_edge' && tropicalCoast && lowCoast) {
        biome = 'mangrove';
        const mangroveMud: TerrainColor = [0.22, 0.28, 0.20];
        const brackishGreen: TerrainColor = [0.18, 0.36, 0.26];
        const rootShadow: TerrainColor = [0.10, 0.16, 0.12];
        const reedFringe: TerrainColor = [0.32, 0.42, 0.22];
        color = mixColor(mangroveMud, brackishGreen, smoothstep(0.62, 0.86, moisture));
        color = mixColor(color, wetSandColor, wetSandFactor * 0.35);
        color = mixColor(color, rootShadow, smoothstep(-0.18, -0.44, patch1) * 0.30);
        color = mixColor(color, reedFringe, smoothstep(0.24, 0.52, patch2) * 0.22);
      } else if (urbanCanalBankFactor > 0.02) {
        biome = 'beach';
        const canalBankMud: TerrainColor = temperateCoast
          ? [0.26, 0.28, 0.23]
          : [0.32, 0.28, 0.22];
        const dampBank: TerrainColor = temperateCoast
          ? [0.36, 0.34, 0.27]
          : [0.42, 0.36, 0.26];
        const bankMix = Math.min(0.82, 0.46 + urbanCanalBankFactor * 0.42);
        color = mixColor(color, dampBank, 0.36);
        color = mixColor(color, canalBankMud, bankMix);
      } else if (
        (shoreProfile === 'tidal_mudflat' || shoreProfile === 'marsh_reed_edge' || exposedTidalFlat > 0.18)
        && shelteredCoast
        && lowCoast
        && wetSandFactor + surfFactor + beachFactor * 0.42 + lowShoreShelf * 0.52 + tidalFlatBias > 0.16
        && (temperateCoast || beachFactor < 0.62 || exposedTidalFlat > 0.24)
      ) {
        biome = 'tidal_flat';
        const siltColor: TerrainColor = temperateCoast
          ? [0.58, 0.60, 0.49]
          : mediterraneanCoast
          ? [0.76, 0.71, 0.56]
          : nearbyClimate === 'monsoon'
          ? [0.76, 0.72, 0.54]
          : nearbyClimate === 'tropical'
          ? [0.82, 0.78, 0.58]
          : [0.70, 0.66, 0.50];
        const slickMud: TerrainColor = temperateCoast
          ? [0.38, 0.44, 0.39]
          : mediterraneanCoast
          ? [0.54, 0.53, 0.42]
          : nearbyClimate === 'monsoon'
          ? [0.48, 0.50, 0.42]
          : nearbyClimate === 'tropical'
          ? [0.54, 0.56, 0.44]
          : [0.50, 0.52, 0.43];
        const paleSilt: TerrainColor = temperateCoast
          ? [0.74, 0.75, 0.62]
          : mediterraneanCoast
          ? [0.88, 0.82, 0.64]
          : nearbyClimate === 'monsoon'
          ? [0.90, 0.86, 0.66]
          : nearbyClimate === 'tropical'
          ? [0.94, 0.91, 0.70]
          : [0.82, 0.78, 0.60];
        const waterStreak: TerrainColor = temperateCoast
          ? [0.30, 0.42, 0.42]
          : mediterraneanCoast
          ? [0.44, 0.54, 0.52]
          : nearbyClimate === 'monsoon'
          ? [0.40, 0.52, 0.48]
          : [0.42, 0.56, 0.54];
        const flatExposure = Math.max(wetSandFactor, surfFactor * 0.70, beachFactor * 0.35, exposedTidalFlat);
        color = mixColor(siltColor, slickMud, smoothstep(0.38, 0.82, moisture) * 0.82);
        color = mixColor(color, washColor, surfFactor * (temperateCoast ? 0.26 : 0.45));
        color = mixColor(color, paleSilt, (0.34 + smoothstep(0.08, 0.52, patch1) * 0.42) * flatExposure);
        color = mixColor(color, waterStreak, smoothstep(-0.10, -0.42, patch2) * flatExposure * (temperateCoast ? 0.66 : 0.54));
      } else {
        biome = 'beach';
        const wrackLine: TerrainColor = [0.44, 0.34, 0.20];
        color = mixColor(color, wrackLine, smoothstep(0.18, 0.46, patch2) * wetSandFactor * 0.18);
      }
    }
  }

  const shorelineColorBeforeTint = color;

  // Apply climate-specific color tinting — desaturation + tonal shift for cohesion
  if (biome !== 'ocean' && nearbyClimate) {
    color = applyClimateTint(color, nearbyClimate);
  }

  if (
    finalHeight >= SEA_LEVEL
    && biome !== 'waterfall'
    && biome !== 'river'
    && coastFactor > 0.08
    && nearbyClimate
  ) {
    const warmShoreKeep = nearbyClimate === 'mediterranean' || nearbyClimate === 'arid'
      ? 0.72
      : nearbyClimate === 'temperate'
      ? (shoreProfile === 'tidal_mudflat' || shoreProfile === 'marsh_reed_edge' ? 0.24 : 0.50)
      : nearbyClimate === 'monsoon'
      ? 0.50
      : 0.42;
    color = mixColor(color, shorelineColorBeforeTint, flatShoreFactor * warmShoreKeep);
    color = mixColor(color, shorelineColorBeforeTint, raisedBankFactor * warmShoreKeep * 0.55);
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
    plumeFactor,
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

// Height-only fast path — skips biome/color/moisture/volcano/river work and
// the 4-sample slope estimation that getTerrainData runs internally. The full
// getTerrainData path costs ~50 noise samples per call; this costs ~10. Hot
// callers (ship/NPC collision, InteractionController land-scan, animal
// ground-follow, pedestrian walking) only need the surface elevation for
// positioning and can't see volcano craters or river carving anyway (those
// only affect inland terrain well above sea level). Callers that genuinely
// need volcano/river-corrected height use getTerrainData(x, z).height instead.
export function getTerrainHeight(x: number, z: number): number {
  return getHeightOnly(x, z);
}
