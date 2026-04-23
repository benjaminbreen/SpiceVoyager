import { getTerrainData, setPlacedArchetypes } from './terrain';
import { generateCity } from './cityGenerator';
import { generateHinterland } from './hinterland';
import { generatePortPrices, generatePortInventory, supplyDemandModifier, type Commodity } from './commodities';
import { PORT_FACTION, PORT_CULTURAL_REGION } from '../store/gameStore';
import {
  PortDefinition, CORE_PORTS, ARCHETYPE_RADIUS,
  WorldSize, WORLD_SIZE_VALUES, GeographicArchetype, ClimateProfile,
  resolveDirRadians,
} from './portArchetypes';
import { generateCanalLayout } from './canalLayout';
import { faithsForPort } from './portReligions';
import { palaceStyleForPort } from './palaceStyles';
import { postprocessRoads } from './roadTopology';

export type Culture = 'Indian Ocean' | 'European' | 'West African' | 'Atlantic';
export type PortScale = 'Small' | 'Medium' | 'Large' | 'Very Large' | 'Huge';

export interface PortOverride {
  id: string;
  name: string;
  culture: Culture;
  scale: PortScale;
  buildingStyle?: string;
  flagColor?: [number, number, number];
  landmark?: string;
  forcedPosition?: [number, number, number];
  bridgeCount?: number;
}

export interface MapConfig {
  seed: number;
  worldSize: number;
  portOverrides: PortOverride[];
  /** If set, only generate this port (dev mode) */
  soloPort?: string;
}

// Build the default override list from CORE_PORTS
function corePortsToOverrides(): PortOverride[] {
  return CORE_PORTS.map(p => ({
    id: p.id,
    name: p.name,
    culture: p.culture,
    scale: p.scale,
    buildingStyle: p.buildingStyle,
    flagColor: p.flagColor,
    landmark: p.landmark,
    bridgeCount: p.bridgeCount,
  }));
}

/** Pick a single random port based on seed */
export function singlePortConfig(seed: number, worldSize: number): MapConfig {
  const portIndex = seed % CORE_PORTS.length;
  const port = CORE_PORTS[portIndex];
  return focusedPortConfig(port.id, seed, worldSize);
}

export function focusedPortConfig(portId: string, seed: number, worldSize: number): MapConfig {
  const port = findPortDef(portId) ?? CORE_PORTS[seed % CORE_PORTS.length];
  return {
    seed,
    worldSize,
    portOverrides: [{
      id: port.id,
      name: port.name,
      culture: port.culture,
      scale: port.scale,
      buildingStyle: port.buildingStyle,
      flagColor: port.flagColor,
      landmark: port.landmark,
      bridgeCount: port.bridgeCount,
    }],
    soloPort: port.id,
  };
}

export const DEFAULT_MAP_CONFIG: MapConfig = {
  seed: 1612,
  worldSize: 150,
  portOverrides: corePortsToOverrides(),
};

// A simple deterministic PRNG based on seed
function mulberry32(a: number) {
  return function() {
    var t = a += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
}

interface ScoredLocation {
  x: number;
  z: number;
  score: number;
}

/** Look up the PortDefinition for a given port id */
function findPortDef(id: string): PortDefinition | undefined {
  return CORE_PORTS.find(p => p.id === id);
}

/**
 * Distribute port positions across the world using a relaxed grid approach.
 * For ports with archetypes, we place them first at spread-out positions,
 * then register their archetypes so terrain conforms to them.
 */
function distributePortPositions(
  overrides: PortOverride[],
  worldSize: number,
  prng: () => number,
  soloPort?: string,
): { id: string; x: number; z: number; def?: PortDefinition }[] {
  const halfSize = worldSize / 2;
  const minDistance = Math.min(250, worldSize / 4);
  const placed: { id: string; x: number; z: number; def?: PortDefinition }[] = [];

  // If solo mode, place just one port near center
  if (soloPort) {
    const def = findPortDef(soloPort);
    placed.push({ id: soloPort, x: 0, z: 0, def });
    return placed;
  }

  // Distribute ports in a relaxed pattern across the world
  for (const override of overrides) {
    const def = findPortDef(override.id);

    if (override.forcedPosition) {
      placed.push({ id: override.id, x: override.forcedPosition[0], z: override.forcedPosition[2], def });
      continue;
    }

    // Try random positions, pick one far enough from existing ports
    let bestX = 0, bestZ = 0, bestMinDist = 0;
    for (let attempt = 0; attempt < 80; attempt++) {
      const x = (prng() - 0.5) * worldSize * 0.85;
      const z = (prng() - 0.5) * worldSize * 0.85;

      let minDist = Infinity;
      for (const p of placed) {
        const d = Math.sqrt((p.x - x) ** 2 + (p.z - z) ** 2);
        if (d < minDist) minDist = d;
      }

      if (minDist > bestMinDist) {
        bestMinDist = minDist;
        bestX = x;
        bestZ = z;
      }

      if (minDist > minDistance) break;
    }

    placed.push({ id: override.id, x: bestX, z: bestZ, def });
  }

  return placed;
}

export function generateMap(config: MapConfig = DEFAULT_MAP_CONFIG) {
  const prng = mulberry32(config.seed);

  // 1. Distribute port positions
  const positions = distributePortPositions(
    config.portOverrides, config.worldSize, prng, config.soloPort
  );

  // 2. Register archetype shapes with terrain system
  const archetypePlacements = positions
    .filter(p => p.def && p.def.geography !== 'archipelago')
    .map(p => ({ def: p.def!, cx: p.x, cz: p.z }));
  setPlacedArchetypes(archetypePlacements);

  // 3. For each port, find the best coastal spot near its distributed position.
  //    For archetype ports, the terrain now conforms to them, so we search within
  //    the archetype radius for a good coastline spot.
  const generatedPorts = [];

  for (const pos of positions) {
    const override = config.portOverrides.find(o => o.id === pos.id);
    if (!override) continue;

    let portX = pos.x;
    let portZ = pos.z;

    // Strait geography: the channel center is water, so offset the search
    // center perpendicular to the channel onto one landmass.
    // The channel runs along the open direction; land is on either side.
    if (pos.def?.geography === 'strait') {
      const cw = (pos.def.channelWidth ?? 1.0) * 0.25;
      const openAngle = resolveDirRadians(pos.def.openDirection);
      // Perpendicular to open direction — offset onto the "left" landmass
      const perpAngle = openAngle + Math.PI / 2;
      const offset = (cw + 0.15) * 450; // just past channel edge in world units
      portX += Math.sin(perpAngle) * offset;
      portZ += Math.cos(perpAngle) * offset;
    }

    // Estuary geography: the river center is water along the open-direction axis.
    // Push the search center perpendicular to the river onto a bank, just past
    // the mouth half-width, so the city sits on the riverbank rather than mid-channel.
    if (pos.def?.geography === 'estuary') {
      const mouthW = pos.def.riverMouthWidth ?? 0.18;
      const openAngle = resolveDirRadians(pos.def.openDirection);
      const perpAngle = openAngle + Math.PI / 2;
      const offset = (mouthW + 0.06) * 450;
      portX += Math.sin(perpAngle) * offset;
      portZ += Math.cos(perpAngle) * offset;
    }

    // Search for a good coastal position near the distributed position.
    // For archetype ports, start within the shaped area; if nothing usable is
    // found, retry with a wider radius so wide-channel estuaries / harbors don't
    // strand the port marker in open water.
    const baseRadius = pos.def && pos.def.geography !== 'archipelago'
      ? ARCHETYPE_RADIUS * 0.6
      : 200;
    const searchRadii = pos.def && pos.def.geography !== 'archipelago'
      ? [baseRadius, ARCHETYPE_RADIUS * 1.5, ARCHETYPE_RADIUS * 3.0]
      : [baseRadius];

    let bestScore = -Infinity;
    let bestX = portX, bestZ = portZ;
    const step = 15;

    for (const searchRadius of searchRadii) {
      for (let dx = -searchRadius; dx <= searchRadius; dx += step) {
        for (let dz = -searchRadius; dz <= searchRadius; dz += step) {
          const sx = portX + dx;
          const sz = portZ + dz;
          const terrain = getTerrainData(sx, sz);

          // Look for coastlines
          if (terrain.height > 0 && terrain.height < 3) {
            // Harbor suitability check
            let landCount = 0;
            const radius = 25;
            const samples = 8;
            for (let i = 0; i < samples; i++) {
              const angle = (i / samples) * Math.PI * 2;
              const cx = sx + Math.cos(angle) * radius;
              const cz = sz + Math.sin(angle) * radius;
              if (getTerrainData(cx, cz).height > 0) landCount++;
            }

            let score = 0;
            if (landCount >= 4 && landCount <= 6) score = 50;
            else if (landCount === 3 || landCount === 7) score = 20;
            else if (landCount < 3) score = -30;
            else score = -80;

            score += terrain.moisture * 20;

            // Prefer positions closer to the distributed center for archetype ports
            if (pos.def && pos.def.geography !== 'archipelago') {
              const distFromCenter = Math.sqrt(dx * dx + dz * dz);
              score -= distFromCenter * 0.1;
            }

            if (score > bestScore) {
              bestScore = score;
              bestX = sx;
              bestZ = sz;
            }
          }
        }
      }
      if (bestScore > -Infinity) break;
    }

    // If we found a valid coast, use it; otherwise fall back to distributed position
    if (bestScore > -Infinity) {
      portX = bestX;
      portZ = bestZ;
    }

    const portIdx = generatedPorts.length;
    const baseInventory = generatePortInventory(override.id, prng);
    const basePrices = generatePortPrices(override.id, prng);
    // Compute initial effective prices (at baseline supply, modifier = 1.0)
    const prices = { ...basePrices };
    generatedPorts.push({
      id: override.id,
      name: override.name,
      culture: override.culture,
      scale: override.scale,
      buildingStyle: override.buildingStyle,
      flagColor: override.flagColor,
      landmark: override.landmark,
      position: [portX, 0.5, portZ] as [number, number, number],
      inventory: { ...baseInventory },
      baseInventory,
      basePrices,
      prices,
      ...(() => {
        const portDef = findPortDef(override.id);
        const canalLayout = portDef?.canalLayout
          ? generateCanalLayout(portX, portZ, portDef.canalLayout)
          : undefined;
        const city = generateCity(
          portX, portZ,
          override.scale, override.culture,
          config.seed + portIdx,
          override.name,
          PORT_FACTION[override.id], PORT_CULTURAL_REGION[override.id],
          override.bridgeCount ?? 0,
          canalLayout,
          override.landmark,
          faithsForPort(override.id),
          palaceStyleForPort(override.id),
        );
        const hinterland = generateHinterland(
          portX, portZ,
          override.scale,
          config.seed + portIdx,
          city.buildings,
          city.roads,
        );
        // Densify + weld + graph the combined network so hinterland tracks
        // connect to city roads cleanly and the ribbon renderer has short
        // segments that hug terrain. Mutates `roads` in place.
        const roads = [...city.roads, ...hinterland.roads];
        const roadGraph = postprocessRoads(roads);
        return {
          buildings: [...city.buildings, ...hinterland.buildings],
          roads,
          roadGraph,
        };
      })(),
    });
  }

  return generatedPorts;
}

/** Generate a map config for dev mode — a single port centered in a medium world */
export function devModeConfig(portId: string, seed: number): MapConfig {
  const def = findPortDef(portId);
  if (!def) {
    return { ...DEFAULT_MAP_CONFIG, seed };
  }
  return focusedPortConfig(portId, seed, 1000);
}

/**
 * Find a safe water spawn point near the first port.
 * Searches in expanding rings for open water (height between -3 and -8,
 * i.e. deep enough to sail but not abyssal).
 */
export function findSafeSpawn(ports: { position: [number, number, number] }[]): [number, number, number] {
  // Pick a random port as the starting anchor
  const anchor = ports.length > 0
    ? ports[Math.floor(Math.random() * ports.length)].position
    : [0, 0.5, 0] as [number, number, number];

  // Search in expanding rings
  for (let radius = 20; radius < 400; radius += 10) {
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 8) {
      const x = anchor[0] + Math.cos(angle) * radius;
      const z = anchor[2] + Math.sin(angle) * radius;
      const terrain = getTerrainData(x, z);

      // Want navigable water: not too shallow, not too deep
      if (terrain.height < -2 && terrain.height > -15) {
        // Verify it's not a tiny pocket — check a few nearby points
        let allWater = true;
        for (let i = 0; i < 4; i++) {
          const checkAngle = (i / 4) * Math.PI * 2;
          const cx = x + Math.cos(checkAngle) * 10;
          const cz = z + Math.sin(checkAngle) * 10;
          if (getTerrainData(cx, cz).height > -1) {
            allWater = false;
            break;
          }
        }
        if (allWater) {
          return [x, 0, z];
        }
      }
    }
  }

  // Fallback: just find any water
  for (let x = -200; x <= 200; x += 20) {
    for (let z = -200; z <= 200; z += 20) {
      if (getTerrainData(x, z).height < -2) {
        return [x, 0, z];
      }
    }
  }

  return [0, 0, 0]; // absolute fallback
}

// Price & inventory generation now delegated to commodities.ts
// with per-port trade profiles (produces/trades/demands)
