import type { Building, BuildingType, PortScale, Road } from '../store/gameStore';
import type { CityFieldKey } from './cityFieldTypes';
import { cityRadiusForScale, sampleCityFieldValuesAt } from './cityFields';

export const DISTRICT_KEYS = [
  'citadel',
  'sacred',
  'urban-core',
  'elite-residential',
  'artisan',
  'waterside',
  'fringe',
] as const;

export type DistrictKey = typeof DISTRICT_KEYS[number];

export const DISTRICT_LABELS: Record<DistrictKey, string> = {
  'citadel': 'Citadel',
  'sacred': 'Sacred',
  'urban-core': 'Urban Core',
  'elite-residential': 'Elite Residential',
  'artisan': 'Artisan',
  'waterside': 'Waterside',
  'fringe': 'Fringe',
};

// Palette is picked to remain distinguishable at low opacity against terrain.
export const DISTRICT_COLORS: Record<DistrictKey, [number, number, number]> = {
  'citadel':           [0.56, 0.20, 0.18],
  'sacred':            [0.62, 0.28, 0.82],
  'urban-core':        [0.98, 0.74, 0.22],
  'elite-residential': [0.98, 0.88, 0.72],
  'artisan':           [0.76, 0.46, 0.20],
  'waterside':         [0.16, 0.56, 0.88],
  'fringe':            [0.48, 0.72, 0.36],
};

type FieldValues = {
  [K in CityFieldKey]: number;
};

// Scale gating per the roadmap. Forbidden districts are demoted; required
// districts are tracked for later placement logic (Phase B uses this).
const FORBIDDEN_BY_SCALE: Record<PortScale, Set<DistrictKey>> = {
  'Small':      new Set(['elite-residential', 'artisan']),
  'Medium':     new Set(),
  'Large':      new Set(),
  'Very Large': new Set(),
  'Huge':       new Set(),
};

export const REQUIRED_BY_SCALE: Record<PortScale, readonly DistrictKey[]> = {
  'Small':      ['urban-core'],
  'Medium':     ['urban-core', 'sacred'],
  'Large':      ['urban-core', 'waterside', 'sacred'],
  'Very Large': ['urban-core', 'waterside', 'elite-residential', 'artisan', 'sacred'],
  'Huge':       ['urban-core', 'waterside', 'elite-residential', 'artisan', 'sacred', 'citadel', 'fringe'],
};

// Building-type hints. These override field-based classification for anchors
// that have unambiguous district identity.
const BUILDING_TYPE_HINT: Partial<Record<BuildingType, DistrictKey>> = {
  fort:      'citadel',
  // Landmarks get their district from the field classifier instead of a
  // fixed hint — a religious landmark (Bom Jesus, Oude Kerk) should read as
  // `sacred`, while a civic/military one (Tower of London, Belém) reads as
  // `citadel`. Leaving it out lets the surrounding field decide.
  dock:      'waterside',
  market:    'urban-core',
  plaza:     'urban-core',
  estate:    'elite-residential',
  farmhouse: 'fringe',
  spiritual: 'sacred',
};

function demoteForScale(
  district: DistrictKey,
  scale: PortScale,
  fv: FieldValues,
): DistrictKey {
  if (!FORBIDDEN_BY_SCALE[scale].has(district)) return district;
  if (district === 'elite-residential') return 'urban-core';
  if (district === 'artisan') return fv.centrality > 0.45 ? 'urban-core' : 'fringe';
  return district;
}

/**
 * Classify a point into a district. Building type (if known) acts as a hard
 * hint; otherwise the classification is driven by the field values and then
 * demoted to satisfy scale gating.
 */
export function classifyDistrict(
  fieldValues: FieldValues,
  scale: PortScale,
  buildingType?: BuildingType,
): DistrictKey {
  if (buildingType) {
    const hint = BUILDING_TYPE_HINT[buildingType];
    if (hint) return demoteForScale(hint, scale, fieldValues);
    if (buildingType === 'warehouse') {
      const d: DistrictKey = fieldValues.waterfront > 0.32 ? 'waterside' : 'artisan';
      return demoteForScale(d, scale, fieldValues);
    }
  }

  const { sanctity, centrality, access, waterfront, nuisance, prestige } = fieldValues;

  let district: DistrictKey;
  if (waterfront > 0.55 && (nuisance > 0.32 || access > 0.28)) {
    district = 'waterside';
  } else if (prestige > 0.62 && nuisance < 0.42 && centrality > 0.22) {
    district = 'elite-residential';
  } else if (sanctity > 0.68 && nuisance < 0.3) {
    district = 'sacred';
  } else if (centrality > 0.48 && access > 0.3) {
    district = 'urban-core';
  } else if (nuisance > 0.42 && centrality > 0.2) {
    district = 'artisan';
  } else if (centrality < 0.28 || access < 0.18) {
    district = 'fringe';
  } else {
    district = 'urban-core';
  }

  return demoteForScale(district, scale, fieldValues);
}

/**
 * Classify a single building by sampling the field at its position. Pure —
 * callable from the city generator after buildings and roads are produced but
 * before the Port object is assembled.
 */
export function classifyBuildingDistrict(
  building: Building,
  centerX: number,
  centerZ: number,
  scale: PortScale,
  roads: Road[],
  allBuildings: Building[],
): DistrictKey {
  const radius = cityRadiusForScale(scale);
  const sampled = sampleCityFieldValuesAt(
    building.position[0],
    building.position[2],
    centerX,
    centerZ,
    radius,
    roads,
    allBuildings,
  );
  if (!sampled) {
    // Outside the city footprint — fall back to fringe (or citadel for forts
    // and civic landmarks on exposed promontories, which commonly sit outside
    // the normal radius).
    if (building.type === 'fort' || building.type === 'landmark') return 'citadel';
    return 'fringe';
  }
  return classifyDistrict(sampled.values, scale, building.type);
}

/**
 * Sample a point and return the district class. Used by the debug overlay's
 * district mode.
 */
export function districtAtPoint(
  x: number,
  z: number,
  centerX: number,
  centerZ: number,
  scale: PortScale,
  roads: Road[],
  buildings: Building[],
): DistrictKey | null {
  const radius = cityRadiusForScale(scale);
  const sampled = sampleCityFieldValuesAt(x, z, centerX, centerZ, radius, roads, buildings);
  if (!sampled) return null;
  return classifyDistrict(sampled.values, scale);
}

// Anchors (these drive district identity) are never pruned.
const ANCHOR_TYPES: ReadonlySet<string> = new Set([
  'fort', 'dock', 'market', 'estate', 'warehouse', 'plaza', 'spiritual', 'landmark',
]);

/**
 * Drop housing buildings whose local neighborhood is dominated by a different
 * district. Creates visible separation between districts so the existing road
 * network reads as connective tissue between them, rather than every district
 * mashing into its neighbors.
 *
 * Pure function in terms of inputs (it mutates the array passed in, returning
 * the filtered result).
 */
export function pruneDistrictBoundaries(
  buildings: Building[],
  rng: () => number,
  options: { radius?: number; minCoherence?: number; dropProbability?: number } = {},
): Building[] {
  const radius = options.radius ?? 9;
  const minCoherence = options.minCoherence ?? 0.45;
  const dropProbability = options.dropProbability ?? 0.7;
  const radiusSq = radius * radius;

  const kept: Building[] = [];
  for (const b of buildings) {
    if (!b.district) { kept.push(b); continue; }
    if (ANCHOR_TYPES.has(b.type)) { kept.push(b); continue; }

    let same = 0;
    let total = 0;
    for (const other of buildings) {
      if (other === b || !other.district) continue;
      const dx = other.position[0] - b.position[0];
      const dz = other.position[2] - b.position[2];
      const distSq = dx * dx + dz * dz;
      if (distSq > radiusSq) continue;
      total += 1;
      if (other.district === b.district) same += 1;
    }

    // Isolated buildings (no neighbors at all) are kept — they're outliers,
    // not boundary-mash.
    if (total < 3) { kept.push(b); continue; }
    const coherence = same / total;
    if (coherence < minCoherence && rng() < dropProbability) continue;
    kept.push(b);
  }
  return kept;
}
