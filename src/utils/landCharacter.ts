/**
 * landCharacter.ts — Semantic terrain overlay
 *
 * Answers "what kind of place is this?" for any (x, z) coordinate.
 * Derived from existing terrain data + building positions + one new noise layer.
 * Consumed by: pedestrian system, POI/holy site generation, animal spawns,
 * ruin placement, foraging spots.
 */

import { createNoise2D } from 'simplex-noise';
import { getTerrainData, BiomeType } from './terrain';
import { SEA_LEVEL } from '../constants/world';
import { Building, BuildingType } from '../store/gameStore';

// ── Seeded PRNG (same as terrain.ts) ────────────────────────────────────────
function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp01(v: number) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

// ── Sacred noise — one low-frequency layer for broad sacred zones ───────────
let _sacredNoise = createNoise2D(mulberry32(1453));

export function reseedLandCharacter(seed: number) {
  _sacredNoise = createNoise2D(mulberry32(seed * 17 + 1453));
  _buildingCache = null;
}

// ── Building activity weights ───────────────────────────────────────────────
// How much "urban heat" each building type radiates
const BUILDING_ACTIVITY: Record<BuildingType, number> = {
  dock:      1.0,
  warehouse: 0.9,
  market:    1.0,
  plaza:     0.95,
  spiritual: 0.5,
  landmark:  0.85,
  fort:      0.6,
  estate:    0.7,
  house:     0.4,
  shack:     0.25,
  farmhouse: 0.3,
};

// Max radius (squared) at which a building contributes to settlement score
const SETTLEMENT_RADIUS_SQ = 60 * 60; // 60 world units

// ── Biome wilderness bonuses ────────────────────────────────────────────────
const WILD_BIOMES: Partial<Record<BiomeType, number>> = {
  jungle:    0.35,
  forest:    0.25,
  swamp:     0.30,
  volcano:   0.20,
  mangrove:  0.15,
  scrubland: 0.10,
};

// Biomes that suppress sanctity (too mundane/commercial)
const PROFANE_BIOMES: Partial<Record<BiomeType, number>> = {
  beach:     0.15,
  desert:    0.05,
};

// ── Cached building spatial data ────────────────────────────────────────────
// Rebuilt when buildings change (port transition). Stores flat arrays for
// fast iteration — no per-query allocations.
interface BuildingCache {
  xs: Float32Array;
  zs: Float32Array;
  weights: Float32Array;
  count: number;
}

let _buildingCache: BuildingCache | null = null;

/**
 * Register the current port's buildings for settlement calculation.
 * Call when the player enters a new port or the world generates.
 */
export function setLandCharacterBuildings(buildings: Building[]) {
  const n = buildings.length;
  const xs = new Float32Array(n);
  const zs = new Float32Array(n);
  const weights = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    xs[i] = buildings[i].position[0];
    zs[i] = buildings[i].position[2];
    weights[i] = BUILDING_ACTIVITY[buildings[i].type] ?? 0.3;
  }
  _buildingCache = { xs, zs, weights, count: n };
}

// ── The main query ──────────────────────────────────────────────────────────

export interface LandCharacter {
  /** 0-1: how urban/developed this spot is */
  settlement: number;
  /** 0-1: spiritual/sacred significance */
  sanctity: number;
  /** 0-1: how wild and untamed */
  wilderness: number;
  /** 0-1: agricultural/food productivity */
  fertility: number;
}

/**
 * Compute the semantic character of a land position.
 * Cheap enough to call per-building at generation time or for a sparse grid
 * of sample points — but avoid calling per-vertex per-frame.
 */
export function getLandCharacter(x: number, z: number): LandCharacter {
  const terrain = getTerrainData(x, z);

  // ── Settlement: distance-weighted building influence ────────────────────
  let settlement = 0;
  if (_buildingCache) {
    const { xs, zs, weights, count } = _buildingCache;
    for (let i = 0; i < count; i++) {
      const dx = x - xs[i];
      const dz = z - zs[i];
      const distSq = dx * dx + dz * dz;
      if (distSq < SETTLEMENT_RADIUS_SQ) {
        // Inverse-square falloff, weighted by building importance
        const influence = weights[i] / (1 + distSq * 0.008);
        settlement += influence;
      }
    }
    // Normalize: ~0.3 near a single house, ~1.0 in a dense market cluster
    settlement = clamp01(settlement * 0.25);
  }

  // ── Sanctity: sacred noise + elevation + remoteness ────────────────────
  const isLand = terrain.height >= SEA_LEVEL;
  let sanctity = 0;
  if (isLand) {
    // Low-frequency sacred zones — large, slow blobs across the map
    const sacredBase = (_sacredNoise(x * 0.0015, z * 0.0015) + 1) * 0.5;
    // Hilltops and ridges feel sacred
    const elevBonus = smoothstep(8, 25, terrain.height) * 0.3;
    // Remoteness: sacred places tend away from commerce
    const remoteBonus = (1 - settlement) * 0.2;
    // Steep, dramatic terrain gets a small boost (cliffs, gorges)
    const dramaBonus = terrain.slope * 0.15;
    // Some biomes suppress sanctity
    const profanePenalty = PROFANE_BIOMES[terrain.biome] ?? 0;

    sanctity = clamp01(
      sacredBase * 0.5 + elevBonus + remoteBonus + dramaBonus - profanePenalty
    );
  }

  // ── Wilderness: inverse of settlement, boosted by wild biomes ──────────
  let wilderness = 0;
  if (isLand) {
    const baseWild = 1 - settlement;
    const biomeBonus = WILD_BIOMES[terrain.biome] ?? 0;
    // Steep slopes feel wilder
    const slopeBonus = terrain.slope * 0.15;
    wilderness = clamp01(baseWild * 0.6 + biomeBonus + slopeBonus);
  }

  // ── Fertility: moisture * flatness, on land ────────────────────────────
  let fertility = 0;
  if (isLand) {
    const flatness = 1 - terrain.slope;
    fertility = clamp01(
      terrain.moisture * flatness * 0.9
      + (terrain.biome === 'paddy' ? 0.3 : 0)
      + (terrain.biome === 'grassland' ? 0.15 : 0)
    );
  }

  return { settlement, sanctity, wilderness, fertility };
}

// ── Convenience queries for downstream systems ──────────────────────────────

/** Quick check: is this a good spot for a sacred site / temple / shrine? */
export function isSacredCandidate(x: number, z: number, threshold = 0.65): boolean {
  const { sanctity, wilderness } = getLandCharacter(x, z);
  return sanctity >= threshold && wilderness > 0.2;
}

/** Quick check: is this a good spot for dangerous wildlife? */
export function isDangerousWild(x: number, z: number, threshold = 0.75): boolean {
  const { wilderness, settlement } = getLandCharacter(x, z);
  return wilderness >= threshold && settlement < 0.1;
}

/** Quick check: is this productive farmland? */
export function isFertileGround(x: number, z: number, threshold = 0.6): boolean {
  const { fertility, settlement } = getLandCharacter(x, z);
  return fertility >= threshold && settlement < 0.5;
}
