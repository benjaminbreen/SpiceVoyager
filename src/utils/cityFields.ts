import type {
  Building,
  BuildingType,
  Port,
  PortScale,
  Road,
  RoadTier,
} from '../store/gameStore';
import { SEA_LEVEL } from '../constants/world';
import { getTerrainData } from './terrain';
import type { CityFieldKey, CityFieldSample } from './cityFieldTypes';

const CITY_RADIUS_BY_SCALE: Record<PortScale, number> = {
  Small: 48,
  Medium: 64,
  Large: 92,
  'Very Large': 124,
  Huge: 164,
};

const CITY_SAMPLE_STEP_BY_SCALE: Record<PortScale, number> = {
  Small: 4,
  Medium: 4,
  Large: 6,
  'Very Large': 6,
  Huge: 8,
};

const WORLD_TARGET_SAMPLE_COUNT = 7000;
const PORT_INFLUENCE_RADIUS_MULTIPLIER = 3.2;

const ROAD_ACCESS_RADIUS: Record<RoadTier, number> = {
  path: 11,
  road: 15,
  avenue: 20,
  bridge: 18,
};

const ROAD_ACCESS_WEIGHT: Record<RoadTier, number> = {
  path: 0.4,
  road: 0.68,
  avenue: 1.0,
  bridge: 0.82,
};

interface BuildingFieldInfluence {
  radius: number;
  access: number;
  nuisance: number;
  sanctity: number;
  prestige: number;
  safety: number;
  danger: number;
}

const BUILDING_FIELD_INFLUENCE: Partial<Record<BuildingType, BuildingFieldInfluence>> = {
  dock:      { radius: 26, access: 0.48, nuisance: 0.82, sanctity: -0.10, prestige: -0.12, safety: 0.00, danger: 0.18 },
  warehouse: { radius: 22, access: 0.42, nuisance: 0.58, sanctity: -0.04, prestige: -0.04, safety: 0.02, danger: 0.08 },
  fort:      { radius: 36, access: 0.18, nuisance: 0.04, sanctity: 0.05, prestige: 0.26, safety: 0.90, danger: -0.38 },
  estate:    { radius: 26, access: 0.12, nuisance: -0.05, sanctity: 0.16, prestige: 0.42, safety: 0.18, danger: -0.12 },
  market:    { radius: 24, access: 0.62, nuisance: 0.34, sanctity: -0.02, prestige: 0.08, safety: 0.08, danger: 0.02 },
  plaza:     { radius: 28, access: 0.70, nuisance: 0.10, sanctity: 0.18, prestige: 0.22, safety: 0.22, danger: -0.08 },
  shack:     { radius: 18, access: 0.10, nuisance: 0.22, sanctity: -0.10, prestige: -0.18, safety: -0.02, danger: 0.14 },
  farmhouse: { radius: 20, access: 0.06, nuisance: -0.04, sanctity: 0.10, prestige: 0.04, safety: 0.00, danger: -0.04 },
  // Spiritual buildings radiate sanctity into their precinct and pull housing
  // around them toward the `sacred` district. Also mildly prestigious and
  // quiet — a cathedral close / mosque courtyard is a desirable address.
  spiritual: { radius: 30, access: 0.14, nuisance: -0.10, sanctity: 0.70, prestige: 0.22, safety: 0.18, danger: -0.08 },
  // Palace: the royal precinct. Strong prestige + safety pull, mild sanctity
  // (the palace chapel / zenana / court ceremony is adjacent to sacred use).
  // Housing in the palace's field should tag elite-residential.
  palace:    { radius: 34, access: 0.16, nuisance: -0.08, sanctity: 0.12, prestige: 0.60, safety: 0.46, danger: -0.18 },
  // Landmarks inherit their class-appropriate influence via a uniform
  // profile — slightly prestigious, mildly sacred, safe. Class-specific
  // nuance (a civic fort-landmark vs a religious basilica) is handled by
  // the type-hint layer in cityDistricts, not here.
  landmark:  { radius: 32, access: 0.16, nuisance: -0.04, sanctity: 0.28, prestige: 0.38, safety: 0.32, danger: -0.14 },
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge0 === edge1) return x < edge0 ? 0 : 1;
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function linearFalloff(distance: number, radius: number): number {
  if (distance >= radius) return 0;
  return 1 - distance / radius;
}

function weightedRoadAccess(x: number, z: number, roads: Road[]): number {
  let best = 0;
  for (const road of roads) {
    let nearest = Infinity;
    for (const point of road.points) {
      const dx = point[0] - x;
      const dz = point[2] - z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < nearest) nearest = dist;
    }
    const radius = ROAD_ACCESS_RADIUS[road.tier];
    const weight = ROAD_ACCESS_WEIGHT[road.tier];
    best = Math.max(best, linearFalloff(nearest, radius) * weight);
  }
  return clamp01(best);
}

function accumulateBuildingInfluence(x: number, z: number, buildings: Building[]) {
  let access = 0;
  let nuisance = 0;
  let sanctity = 0;
  let prestige = 0;
  let safety = 0;
  let danger = 0;

  for (const building of buildings) {
    const influence = BUILDING_FIELD_INFLUENCE[building.type];
    if (!influence) continue;
    const dx = building.position[0] - x;
    const dz = building.position[2] - z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const falloff = linearFalloff(dist, influence.radius);
    if (falloff <= 0) continue;
    access += influence.access * falloff;
    nuisance += influence.nuisance * falloff;
    sanctity += influence.sanctity * falloff;
    prestige += influence.prestige * falloff;
    safety += influence.safety * falloff;
    danger += influence.danger * falloff;
  }

  return {
    access,
    nuisance,
    sanctity,
    prestige,
    safety,
    danger,
  };
}

/**
 * Compute the eight field values at a single city point. Pure function: takes
 * raw inputs (no Port object required), so the city generator can call this
 * mid-build before the Port is assembled.
 *
 * Returns null when the point is outside the city footprint or below water.
 */
export function sampleCityFieldValuesAt(
  x: number,
  z: number,
  centerX: number,
  centerZ: number,
  radius: number,
  roads: Road[],
  buildings: Building[],
): { values: Record<CityFieldKey, number>; terrainHeight: number } | null {
  const dx = x - centerX;
  const dz = z - centerZ;
  const distToCenter = Math.sqrt(dx * dx + dz * dz);
  if (distToCenter > radius * 1.03) return null;

  const terrain = getTerrainData(x, z);
  if (terrain.height < SEA_LEVEL - 0.2) return null;

  const centrality = clamp01(1 - distToCenter / (radius * 0.97));
  const prominence = clamp01(
    (terrain.height - SEA_LEVEL) / 8.5
    + terrain.slope * 0.18
    - terrain.coastFactor * 0.08
  );
  const waterfront = clamp01(
    terrain.coastFactor * 1.1
    + terrain.shallowFactor * 0.45
    + terrain.surfFactor * 0.14
    + (terrain.height < SEA_LEVEL + 1.4 ? 0.08 : 0)
  );

  const roadAccess = weightedRoadAccess(x, z, roads);
  const buildingInfluence = accumulateBuildingInfluence(x, z, buildings);

  const access = clamp01(
    centrality * 0.24
    + roadAccess * 0.48
    + buildingInfluence.access * 0.34
  );

  const nuisance = clamp01(
    waterfront * 0.34
    + roadAccess * 0.14
    + buildingInfluence.nuisance * 0.38
    + smoothstep(radius * 0.55, radius * 0.95, distToCenter) * 0.04
  );

  const edgeRisk = smoothstep(radius * 0.46, radius * 0.98, distToCenter);
  const terrainRisk = clamp01(
    edgeRisk * 0.5
    + terrain.coastFactor * 0.18
    + terrain.slope * 0.18
    + (terrain.height < SEA_LEVEL + 0.9 ? 0.08 : 0)
  );

  const risk = clamp01(
    terrainRisk
    + nuisance * 0.26
    + buildingInfluence.danger * 0.4
    - access * 0.16
    - buildingInfluence.safety * 0.38
  );

  const quiet = 1 - nuisance;
  const sanctity = clamp01(
    quiet * 0.28
    + prominence * 0.24
    + (1 - waterfront) * 0.14
    + centrality * 0.08
    + buildingInfluence.sanctity * 0.42
    - risk * 0.08
  );

  const prestige = clamp01(
    centrality * 0.28
    + access * 0.2
    + (1 - risk) * 0.2
    + prominence * 0.14
    + sanctity * 0.1
    + buildingInfluence.prestige * 0.36
    - nuisance * 0.16
  );

  return {
    terrainHeight: terrain.height,
    values: {
      sanctity,
      risk,
      centrality,
      access,
      waterfront,
      prominence,
      nuisance,
      prestige,
    },
  };
}

export function cityRadiusForScale(scale: PortScale): number {
  return CITY_RADIUS_BY_SCALE[scale];
}

export function sampleCityFields(port: Port): CityFieldSample[] {
  const centerX = port.position[0];
  const centerZ = port.position[2];
  const radius = CITY_RADIUS_BY_SCALE[port.scale];
  const step = CITY_SAMPLE_STEP_BY_SCALE[port.scale];
  const roads = port.roads ?? [];
  const samples: CityFieldSample[] = [];

  for (let z = centerZ - radius; z <= centerZ + radius; z += step) {
    for (let x = centerX - radius; x <= centerX + radius; x += step) {
      const sampled = sampleCityFieldValuesAt(x, z, centerX, centerZ, radius, roads, port.buildings);
      if (!sampled) continue;
      samples.push({
        x,
        y: Math.max(sampled.terrainHeight, SEA_LEVEL + 0.05),
        z,
        size: step * 0.82,
        values: sampled.values,
      });
    }
  }

  return samples;
}

function sampleStepForWorld(worldSize: number): number {
  const step = Math.ceil(Math.sqrt((worldSize * worldSize) / WORLD_TARGET_SAMPLE_COUNT));
  return Math.max(4, step);
}

function sampleFieldsAtPoint(x: number, z: number, ports: Port[]) {
  const terrain = getTerrainData(x, z);
  if (terrain.height < SEA_LEVEL - 0.2) return null;

  const waterfront = clamp01(
    terrain.coastFactor * 1.05
    + terrain.shallowFactor * 0.38
    + terrain.surfFactor * 0.14
    + terrain.beachFactor * 0.12
    + (terrain.height < SEA_LEVEL + 1.4 ? 0.08 : 0)
  );

  const prominence = clamp01(
    (terrain.height - SEA_LEVEL) / 8.5
    + terrain.slope * 0.16
    - terrain.coastFactor * 0.08
  );

  let centrality = 0;
  let accessFromPorts = 0;
  let nuisanceFromPorts = 0;
  let sanctityFromPorts = 0;
  let prestigeFromPorts = 0;
  let safetyFromPorts = 0;
  let dangerFromPorts = 0;

  for (const port of ports) {
    const dx = x - port.position[0];
    const dz = z - port.position[2];
    const dist = Math.sqrt(dx * dx + dz * dz);
    const cityRadius = CITY_RADIUS_BY_SCALE[port.scale];
    const influenceRadius = cityRadius * PORT_INFLUENCE_RADIUS_MULTIPLIER + 18;
    const portWeight = linearFalloff(dist, influenceRadius);
    if (portWeight <= 0) continue;

    centrality = Math.max(centrality, portWeight);

    const roadAccess = weightedRoadAccess(x, z, port.roads ?? []);
    const buildingInfluence = accumulateBuildingInfluence(x, z, port.buildings);

    accessFromPorts = Math.max(
      accessFromPorts,
      clamp01(
        portWeight * 0.28
        + roadAccess * 0.52
        + buildingInfluence.access * 0.34
      )
    );
    nuisanceFromPorts += portWeight * 0.08 + buildingInfluence.nuisance * 0.34;
    sanctityFromPorts += buildingInfluence.sanctity * 0.36 + portWeight * 0.03;
    prestigeFromPorts += buildingInfluence.prestige * 0.34 + portWeight * 0.10;
    safetyFromPorts += buildingInfluence.safety * 0.30 + portWeight * 0.12;
    dangerFromPorts += buildingInfluence.danger * 0.34;
  }

  const remoteness = 1 - centrality;
  const access = clamp01(
    accessFromPorts
    + centrality * 0.12
    + waterfront * 0.04
  );

  const nuisance = clamp01(
    waterfront * 0.18
    + terrain.surfFactor * 0.10
    + nuisanceFromPorts
  );

  const terrainRisk = clamp01(
    remoteness * 0.56
    + terrain.coastFactor * 0.18
    + terrain.slope * 0.18
    + (terrain.height < SEA_LEVEL + 0.9 ? 0.08 : 0)
  );

  const risk = clamp01(
    terrainRisk
    + nuisance * 0.18
    + dangerFromPorts * 0.32
    - access * 0.12
    - safetyFromPorts * 0.34
  );

  const quiet = 1 - nuisance;
  const sanctity = clamp01(
    quiet * 0.22
    + prominence * 0.24
    + (1 - waterfront) * 0.14
    + terrain.moisture * 0.08
    + sanctityFromPorts * 0.34
    + remoteness * 0.06
    - risk * 0.08
  );

  const prestige = clamp01(
    centrality * 0.28
    + access * 0.18
    + (1 - risk) * 0.16
    + prominence * 0.12
    + sanctity * 0.12
    + prestigeFromPorts * 0.34
    - nuisance * 0.14
  );

  return {
    terrain,
    values: {
      sanctity,
      risk,
      centrality,
      access,
      waterfront,
      prominence,
      nuisance,
      prestige,
    },
  };
}

export function sampleWorldFields(ports: Port[], worldSize: number): CityFieldSample[] {
  const halfSize = worldSize / 2;
  const step = sampleStepForWorld(worldSize);
  const samples: CityFieldSample[] = [];

  for (let z = -halfSize; z <= halfSize; z += step) {
    for (let x = -halfSize; x <= halfSize; x += step) {
      const sampled = sampleFieldsAtPoint(x, z, ports);
      if (!sampled) continue;

      samples.push({
        x,
        y: Math.max(sampled.terrain.height, SEA_LEVEL + 0.05),
        z,
        size: step * 0.92,
        values: sampled.values,
      });
    }
  }

  return samples;
}
