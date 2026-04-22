import type { Building, HousingClass, PortScale, Road } from '../store/gameStore';
import type { DistrictKey } from './cityDistricts';
import { cityRadiusForScale, sampleCityFieldValuesAt } from './cityFields';

/**
 * Building form metadata. Assigned per-building from district + local field
 * values + overall port scale, and read by the renderer to vary massing.
 *
 * Phase B scope: stories, housingClass, and setback. Parcel tightness and
 * frontage are computed implicitly from district + stories today; they can be
 * promoted to explicit fields if a future phase needs them.
 */

// Ceiling of stories per scale. Small ports never get 3-4 story buildings even
// if the classifier wants to — the whole point of the scale gate is that a
// fishing village shouldn't suddenly sprout London-style townhouses.
const MAX_STORIES_BY_SCALE: Record<PortScale, number> = {
  'Small':      1,
  'Medium':     2,
  'Large':      3,
  'Very Large': 4,
  'Huge':       4,
};

function pickStories(
  district: DistrictKey,
  centrality: number,
  prestige: number,
  rng: () => number,
  scale: PortScale,
): number {
  const ceiling = MAX_STORIES_BY_SCALE[scale];

  let target: number;
  switch (district) {
    case 'urban-core': {
      // The metropolis read lives here. Stories climb with centrality: the
      // dense commercial/merchant heart gets the tallest façades.
      if (centrality > 0.78) target = 4;
      else if (centrality > 0.58) target = 3;
      else if (centrality > 0.35) target = 2;
      else target = 2;
      break;
    }
    case 'elite-residential': {
      target = prestige > 0.72 ? 2 : 1;
      break;
    }
    case 'artisan': {
      target = centrality > 0.5 ? 2 : 1;
      break;
    }
    case 'waterside': {
      // Warehouses on the water should read long and low, not tall.
      target = 1;
      break;
    }
    case 'citadel':
    case 'sacred': {
      target = 1;
      break;
    }
    case 'fringe':
    default:
      target = 1;
  }

  // Small random variation so not every cell is identical.
  if (target > 1 && rng() < 0.22) target -= 1;
  if (target < ceiling && rng() < 0.12) target += 1;

  return Math.min(ceiling, Math.max(1, target));
}

function pickHousingClass(
  district: DistrictKey,
  centrality: number,
  prestige: number,
): HousingClass {
  switch (district) {
    case 'elite-residential':
      return 'elite';
    case 'urban-core':
      return prestige > 0.6 ? 'merchant' : 'common';
    case 'artisan':
      return 'common';
    case 'waterside':
      return centrality > 0.5 ? 'common' : 'poor';
    case 'fringe':
      return 'poor';
    case 'sacred':
    case 'citadel':
    default:
      return 'common';
  }
}

function pickSetback(district: DistrictKey, centrality: number): number {
  switch (district) {
    case 'elite-residential': return 0.85;
    case 'fringe':            return 0.7;
    case 'sacred':            return 0.75;
    case 'citadel':           return 0.5;
    case 'artisan':           return 0.35;
    case 'urban-core':        return centrality > 0.55 ? 0.1 : 0.25;
    case 'waterside':         return 0.2;
    default:                  return 0.4;
  }
}

function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Populate stories, housingClass, and setback on every building that has a
 * district tag. Called after district classification in the generator.
 * Deterministic given the port seed (buildings' existing IDs are seeded).
 */
export function assignBuildingForms(
  buildings: Building[],
  centerX: number,
  centerZ: number,
  scale: PortScale,
  roads: Road[],
): void {
  const radius = cityRadiusForScale(scale);
  for (const b of buildings) {
    if (!b.district) continue;

    const sampled = sampleCityFieldValuesAt(
      b.position[0],
      b.position[2],
      centerX,
      centerZ,
      radius,
      roads,
      buildings,
    );
    const centrality = sampled?.values.centrality ?? 0;
    const prestige   = sampled?.values.prestige   ?? 0;

    const rng = mulberry32(hashString(b.id));

    // Don't over-stack anchors — they already have bespoke geometry. Setback
    // and class are still assigned so the renderer can key off them.
    const isAnchor = b.type === 'fort' || b.type === 'dock' || b.type === 'market' || b.type === 'plaza' || b.type === 'spiritual' || b.type === 'landmark';
    b.stories = isAnchor ? 1 : pickStories(b.district, centrality, prestige, rng, scale);
    b.housingClass = pickHousingClass(b.district, centrality, prestige);
    b.setback = pickSetback(b.district, centrality);
  }
}
