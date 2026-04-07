import { getTerrainData } from './terrain';
import { Commodity } from '../store/gameStore';
import { generateCity } from './cityGenerator';

export type Culture = 'Indian Ocean' | 'European' | 'Caribbean';
export type PortScale = 'Small' | 'Medium' | 'Large' | 'Very Large';

export interface PortOverride {
  id: string;
  name: string;
  culture: Culture;
  scale: PortScale;
  forcedPosition?: [number, number, number];
}

export interface MapConfig {
  seed: number;
  worldSize: number;
  portOverrides: PortOverride[];
}

export const DEFAULT_MAP_CONFIG: MapConfig = {
  seed: 1612,
  worldSize: 2000,
  portOverrides: [
    { id: 'goa', name: 'Goa', culture: 'European', scale: 'Large' },
    { id: 'hormuz', name: 'Hormuz', culture: 'Indian Ocean', scale: 'Medium' },
    { id: 'malacca', name: 'Malacca', culture: 'Indian Ocean', scale: 'Very Large' },
    { id: 'aden', name: 'Aden', culture: 'Indian Ocean', scale: 'Medium' },
    { id: 'zanzibar', name: 'Zanzibar', culture: 'Indian Ocean', scale: 'Small' },
    { id: 'macau', name: 'Macau', culture: 'European', scale: 'Medium' },
    { id: 'mombasa', name: 'Mombasa', culture: 'Indian Ocean', scale: 'Small' }
  ]
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

export function generateMap(config: MapConfig = DEFAULT_MAP_CONFIG) {
  const prng = mulberry32(config.seed);
  
  // 1. Find Candidate Locations
  // We scan a grid across the world size to find coastlines
  const candidates: ScoredLocation[] = [];
  const step = 20; // Check every 20 units
  const halfSize = config.worldSize / 2;
  
  for (let x = -halfSize; x < halfSize; x += step) {
    for (let z = -halfSize; z < halfSize; z += step) {
      const terrain = getTerrainData(x, z);
      
      // Look for coastlines (elevation slightly above water level 0)
      if (terrain.height > 0 && terrain.height < 2) {
        // Evaluate Harbor Suitability
        // Check surrounding points in a radius to see if it's a bay/harbor
        let landCount = 0;
        let waterCount = 0;
        const radius = 30;
        const samples = 8;
        
        for (let i = 0; i < samples; i++) {
          const angle = (i / samples) * Math.PI * 2;
          const cx = x + Math.cos(angle) * radius;
          const cz = z + Math.sin(angle) * radius;
          const cTerrain = getTerrainData(cx, cz);
          if (cTerrain.height > 0) landCount++;
          else waterCount++;
        }
        
        // A perfect harbor is surrounded by land on 3 sides (e.g. 5-6 land, 2-3 water)
        let harborScore = 0;
        if (landCount >= 4 && landCount <= 6) {
          harborScore = 50; // Great harbor
        } else if (landCount === 3 || landCount === 7) {
          harborScore = 20; // Okay harbor
        } else if (landCount < 3) {
          harborScore = -50; // Peninsula / exposed
        } else {
          harborScore = -100; // Landlocked (shouldn't happen on coast, but just in case)
        }
        
        // Fertility Score (Moisture)
        const fertilityScore = terrain.moisture * 30;
        
        // Flatness Score (Avoid steep cliffs nearby)
        let flatnessScore = 0;
        const inlandTerrain = getTerrainData(x + 10, z + 10);
        if (inlandTerrain.height > 10) {
          flatnessScore = -50; // Too steep
        } else {
          flatnessScore = 20; // Nice and flat
        }
        
        const totalScore = harborScore + fertilityScore + flatnessScore;
        
        if (totalScore > 0) {
          candidates.push({ x, z, score: totalScore });
        }
      }
    }
  }
  
  // Sort candidates by score descending
  candidates.sort((a, b) => b.score - a.score);
  
  // 2. Place Ports
  const generatedPorts = [];
  const minDistance = 150; // Minimum distance between ports
  
  for (let i = 0; i < config.portOverrides.length; i++) {
    const override = config.portOverrides[i];
    let placed = false;
    
    if (override.forcedPosition) {
      // Use forced position
      generatedPorts.push({
        id: override.id,
        name: override.name,
        culture: override.culture,
        scale: override.scale,
        position: override.forcedPosition,
        inventory: generateInventory(prng),
        prices: generatePrices(prng),
        buildings: generateCity(override.forcedPosition[0], override.forcedPosition[2], override.scale, override.culture, config.seed + i)
      });
      continue;
    }
    
    // Find the best candidate that is far enough from existing ports
    for (let j = 0; j < candidates.length; j++) {
      const candidate = candidates[j];
      
      let tooClose = false;
      for (const port of generatedPorts) {
        const dist = Math.sqrt(
          Math.pow(port.position[0] - candidate.x, 2) + 
          Math.pow(port.position[2] - candidate.z, 2)
        );
        if (dist < minDistance) {
          tooClose = true;
          break;
        }
      }
      
      if (!tooClose) {
        // Place port here
        generatedPorts.push({
          id: override.id,
          name: override.name,
          culture: override.culture,
          scale: override.scale,
          position: [candidate.x, 0.5, candidate.z] as [number, number, number],
          inventory: generateInventory(prng),
          prices: generatePrices(prng),
          buildings: generateCity(candidate.x, candidate.z, override.scale, override.culture, config.seed + i)
        });
        
        // Remove candidate so it's not reused
        candidates.splice(j, 1);
        placed = true;
        break;
      }
    }
    
    if (!placed) {
      console.warn(`Could not find a suitable location for port: ${override.name}`);
    }
  }
  
  return generatedPorts;
}

function generateInventory(prng: () => number): Record<Commodity, number> {
  return {
    Spices: Math.floor(prng() * 100),
    Silk: Math.floor(prng() * 50),
    Tea: Math.floor(prng() * 80),
    Wood: Math.floor(prng() * 200),
    Cannonballs: Math.floor(prng() * 100),
  };
}

function generatePrices(prng: () => number): Record<Commodity, number> {
  return {
    Spices: 10 + Math.floor(prng() * 40),
    Silk: 20 + Math.floor(prng() * 60),
    Tea: 15 + Math.floor(prng() * 30),
    Wood: 2 + Math.floor(prng() * 8),
    Cannonballs: 5 + Math.floor(prng() * 15),
  };
}
