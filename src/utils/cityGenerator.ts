import { PortScale, Culture, Building, BuildingType } from '../store/gameStore';
import { SEA_LEVEL } from '../constants/world';
import { getTerrainData } from './terrain';
import { generateBuildingLabel } from './buildingLabels';

function mulberry32(a: number) {
  return function() {
    var t = a += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h >>> 0;
}

const SCALE_COUNTS: Record<PortScale, Record<BuildingType, number>> = {
  'Small': { dock: 1, warehouse: 1, fort: 0, estate: 0, market: 0, house: 8, shack: 5, farmhouse: 3 },
  'Medium': { dock: 2, warehouse: 2, fort: 0, estate: 1, market: 1, house: 20, shack: 8, farmhouse: 6 },
  'Large': { dock: 3, warehouse: 3, fort: 1, estate: 3, market: 2, house: 40, shack: 12, farmhouse: 10 },
  'Very Large': { dock: 5, warehouse: 4, fort: 1, estate: 5, market: 3, house: 70, shack: 20, farmhouse: 15 },
};

const BUILDING_SIZES: Record<BuildingType, [number, number, number]> = {
  dock: [3, 1, 6],
  warehouse: [5, 4, 5],
  fort: [12, 6, 12],
  estate: [6, 5, 6],
  market: [6, 4, 6],
  house: [3, 3, 3],
  shack: [2.5, 2, 2.5],
  farmhouse: [4, 3, 4],
};

export function generateCity(portX: number, portZ: number, scale: PortScale, culture: Culture, seed: number, portName: string = ''): Building[] {
  const prng = mulberry32(seed);
  const buildings: Building[] = [];
  const counts = SCALE_COUNTS[scale];
  
  // We'll use a grid to avoid overlaps and find suitable spots
  const cellSize = 2;
  const gridRadius = 40; // 80x80 grid = 160x160 units
  
  interface Cell {
    x: number;
    z: number;
    height: number;
    moisture: number;
    occupied: boolean;
    isWater: boolean;
    isBeach: boolean;
    isLand: boolean;
    distToCenter: number;
  }
  
  const grid: Cell[] = [];
  const gridMap = new Map<string, Cell>();
  for (let r = -gridRadius; r <= gridRadius; r++) {
    for (let c = -gridRadius; c <= gridRadius; c++) {
      const x = portX + c * cellSize;
      const z = portZ + r * cellSize;
      const terrain = getTerrainData(x, z);
      const cell: Cell = {
        x, z,
        height: terrain.height,
        moisture: terrain.moisture,
        occupied: false,
        isWater: terrain.height < SEA_LEVEL,
        isBeach: terrain.height >= SEA_LEVEL && (terrain.coastFactor > 0.22 || terrain.height < SEA_LEVEL + 2.2),
        isLand: terrain.height >= SEA_LEVEL && terrain.coastFactor <= 0.22 && terrain.height >= SEA_LEVEL + 0.6,
        distToCenter: Math.sqrt((x - portX)**2 + (z - portZ)**2)
      };
      grid.push(cell);
      gridMap.set(`${x},${z}`, cell);
    }
  }
  
  // Helper to find a spot
  const findSpot = (
    condition: (cell: Cell) => boolean, 
    size: [number, number, number], 
    sortFn?: (a: Cell, b: Cell) => number
  ): Cell | null => {
    let candidates = grid.filter(c => !c.occupied && condition(c));
    if (sortFn) candidates.sort(sortFn);
    else {
      // Fisher-Yates shuffle for uniform randomness
      for (let i = candidates.length - 1; i > 0; i--) {
        const j = Math.floor(prng() * (i + 1));
        [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
      }
    }
    
    for (const cell of candidates) {
      // Check if the area for the building is clear
      const radiusX = Math.ceil(size[0] / cellSize / 2);
      const radiusZ = Math.ceil(size[2] / cellSize / 2);
      let clear = true;
      let avgHeight = 0;
      let count = 0;
      
      for (let r = -radiusZ; r <= radiusZ; r++) {
        for (let c = -radiusX; c <= radiusX; c++) {
          const checkX = cell.x + c * cellSize;
          const checkZ = cell.z + r * cellSize;
          const checkCell = gridMap.get(`${checkX},${checkZ}`);
          if (!checkCell || checkCell.occupied) {
            clear = false;
            break;
          }
          // Ensure it's not too steep
          if (Math.abs(checkCell.height - cell.height) > 1.5) {
            clear = false;
            break;
          }
          avgHeight += checkCell.height;
          count++;
        }
        if (!clear) break;
      }
      
      if (clear) {
        // Mark occupied
        for (let r = -radiusZ - 1; r <= radiusZ + 1; r++) {
          for (let c = -radiusX - 1; c <= radiusX + 1; c++) {
             const checkX = cell.x + c * cellSize;
             const checkZ = cell.z + r * cellSize;
             const checkCell = gridMap.get(`${checkX},${checkZ}`);
             if (checkCell) checkCell.occupied = true;
          }
        }
        return { ...cell, height: avgHeight / count };
      }
    }
    return null;
  };

  // 1. Place Docks (on the water edge, adjacent to land/beach)
  // Helper: check if a water cell has at least one neighboring land or beach cell
  const isCoastalWater = (cell: Cell): boolean => {
    if (!cell.isWater || cell.height <= -3) return false;
    for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]]) {
      const neighbor = gridMap.get(`${cell.x + dx * cellSize},${cell.z + dz * cellSize}`);
      if (neighbor && (neighbor.isLand || neighbor.isBeach)) return true;
    }
    return false;
  };

  for (let i = 0; i < counts.dock; i++) {
    const spot = findSpot(
      c => isCoastalWater(c),
      BUILDING_SIZES.dock,
      (a, b) => a.distToCenter - b.distToCenter // closest to center
    );
    if (spot) {
      // Find nearest land/beach cell to orient dock toward shore
      let landDir: Cell | undefined;
      let bestDist = Infinity;
      for (const c of grid) {
        if (!(c.isLand || c.isBeach)) continue;
        const d = (c.x - spot.x) ** 2 + (c.z - spot.z) ** 2;
        if (d < bestDist && d < 15 * 15) { bestDist = d; landDir = c; }
      }
      let rot = prng() * Math.PI;
      if (landDir) {
        rot = Math.atan2(landDir.x - spot.x, landDir.z - spot.z);
      }
      buildings.push({
        id: `dock_${i}`, type: 'dock',
        position: [spot.x, 0.55, spot.z], // raised above water so deck is visible
        rotation: rot, scale: BUILDING_SIZES.dock
      });
    }
  }

  // 2. Place Fort (needs large flat land, preferably near water)
  if (counts.fort > 0) {
    const spot = findSpot(
      c => c.isLand, 
      BUILDING_SIZES.fort,
      (a, b) => a.distToCenter - b.distToCenter
    );
    if (spot) {
      buildings.push({
        id: `fort_0`, type: 'fort',
        position: [spot.x, spot.height, spot.z],
        rotation: prng() * Math.PI, scale: BUILDING_SIZES.fort
      });
    }
  }

  // 3. Place Warehouses (near center/docks)
  for (let i = 0; i < counts.warehouse; i++) {
    const spot = findSpot(
      c => c.isLand, 
      BUILDING_SIZES.warehouse,
      (a, b) => a.distToCenter - b.distToCenter
    );
    if (spot) {
      buildings.push({
        id: `warehouse_${i}`, type: 'warehouse',
        position: [spot.x, spot.height, spot.z],
        rotation: prng() * Math.PI, scale: BUILDING_SIZES.warehouse
      });
    }
  }

  // 4. Place Markets (central)
  for (let i = 0; i < counts.market; i++) {
    const spot = findSpot(
      c => c.isLand, 
      BUILDING_SIZES.market,
      (a, b) => a.distToCenter - b.distToCenter
    );
    if (spot) {
      buildings.push({
        id: `market_${i}`, type: 'market',
        position: [spot.x, spot.height, spot.z],
        rotation: prng() * Math.PI, scale: BUILDING_SIZES.market
      });
    }
  }

  // 5. Place Estates (nice land)
  for (let i = 0; i < counts.estate; i++) {
    const spot = findSpot(
      c => c.isLand && c.height > 2, 
      BUILDING_SIZES.estate
    );
    if (spot) {
      buildings.push({
        id: `estate_${i}`, type: 'estate',
        position: [spot.x, spot.height, spot.z],
        rotation: prng() * Math.PI, scale: BUILDING_SIZES.estate
      });
    }
  }

  // 6. Place Houses (town)
  // Pre-compute jitter per cell so the sort comparator is stable
  const houseJitter = new Map<string, number>();
  for (const c of grid) houseJitter.set(`${c.x},${c.z}`, prng() * 20);
  for (let i = 0; i < counts.house; i++) {
    const spot = findSpot(
      c => c.isLand,
      BUILDING_SIZES.house,
      (a, b) => (a.distToCenter + (houseJitter.get(`${a.x},${a.z}`) ?? 0))
              - (b.distToCenter + (houseJitter.get(`${b.x},${b.z}`) ?? 0)) // somewhat clustered
    );
    if (spot) {
      buildings.push({
        id: `house_${i}`, type: 'house',
        position: [spot.x, spot.height, spot.z],
        rotation: prng() * Math.PI, scale: BUILDING_SIZES.house
      });
    }
  }

  // 7. Place Farmhouses (fertile land, outskirts)
  for (let i = 0; i < counts.farmhouse; i++) {
    const spot = findSpot(
      c => c.isLand && c.moisture > 0.4, 
      BUILDING_SIZES.farmhouse,
      (a, b) => b.distToCenter - a.distToCenter // further away
    );
    if (spot) {
      buildings.push({
        id: `farmhouse_${i}`, type: 'farmhouse',
        position: [spot.x, spot.height, spot.z],
        rotation: prng() * Math.PI, scale: BUILDING_SIZES.farmhouse
      });
    }
  }

  // 8. Place Shacks (beaches)
  for (let i = 0; i < counts.shack; i++) {
    const spot = findSpot(
      c => c.isBeach,
      BUILDING_SIZES.shack
    );
    if (spot) {
      buildings.push({
        id: `shack_${i}`, type: 'shack',
        position: [spot.x, Math.max(spot.height, SEA_LEVEL + 0.4), spot.z],
        rotation: prng() * Math.PI, scale: BUILDING_SIZES.shack
      });
    }
  }

  // 9. Attach labels to all buildings
  for (const b of buildings) {
    // Find the original grid cell for this building to get moisture
    // Snap to nearest grid cell for moisture lookup
    const snapX = Math.round((b.position[0] - portX) / cellSize) * cellSize + portX;
    const snapZ = Math.round((b.position[2] - portZ) / cellSize) * cellSize + portZ;
    const cell = gridMap.get(`${snapX},${snapZ}`);
    const moisture = cell?.moisture ?? 0.5;
    const distToCenter = Math.sqrt((b.position[0] - portX) ** 2 + (b.position[2] - portZ) ** 2);
    const labelSeed = hashStr(b.id) + seed;
    const result = generateBuildingLabel(
      b.id, b.type, culture, portName,
      b.position[1], distToCenter, moisture, labelSeed,
    );
    b.label = result.label;
    b.labelSub = result.sub;
  }

  return buildings;
}

