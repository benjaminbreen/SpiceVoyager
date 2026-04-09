import { PortScale, Culture, Building, BuildingType } from '../store/gameStore';
import { SEA_LEVEL } from '../constants/world';
import { getTerrainData } from './terrain';

function mulberry32(a: number) {
  return function() {
    var t = a += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
}

const SCALE_COUNTS: Record<PortScale, Record<BuildingType, number>> = {
  'Small': { dock: 1, warehouse: 1, fort: 0, estate: 0, market: 0, house: 8, shack: 5, farmhouse: 3, road: 0 },
  'Medium': { dock: 2, warehouse: 2, fort: 0, estate: 1, market: 1, house: 20, shack: 8, farmhouse: 6, road: 0 },
  'Large': { dock: 3, warehouse: 3, fort: 1, estate: 3, market: 2, house: 40, shack: 12, farmhouse: 10, road: 0 },
  'Very Large': { dock: 5, warehouse: 4, fort: 1, estate: 5, market: 3, house: 70, shack: 20, farmhouse: 15, road: 0 },
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
  road: [2, 0.12, 2]
};

export function generateCity(portX: number, portZ: number, scale: PortScale, culture: Culture, seed: number): Building[] {
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
  for (let r = -gridRadius; r <= gridRadius; r++) {
    for (let c = -gridRadius; c <= gridRadius; c++) {
      const x = portX + c * cellSize;
      const z = portZ + r * cellSize;
      const terrain = getTerrainData(x, z);
      grid.push({
        x, z,
        height: terrain.height,
        moisture: terrain.moisture,
        occupied: false,
        isWater: terrain.height < SEA_LEVEL,
        isBeach: terrain.coastFactor > 0.22 || (terrain.height >= SEA_LEVEL && terrain.height < SEA_LEVEL + 2.2),
        isLand: terrain.height >= SEA_LEVEL && terrain.coastFactor <= 0.22 && terrain.height >= SEA_LEVEL + 0.6,
        distToCenter: Math.sqrt((x - portX)**2 + (z - portZ)**2)
      });
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
    else candidates.sort(() => prng() - 0.5); // shuffle
    
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
          const checkCell = grid.find(gc => gc.x === checkX && gc.z === checkZ);
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
             const checkCell = grid.find(gc => gc.x === checkX && gc.z === checkZ);
             if (checkCell) checkCell.occupied = true;
          }
        }
        return { ...cell, height: avgHeight / count };
      }
    }
    return null;
  };

  // 1. Place Docks (needs to be on the water edge)
  for (let i = 0; i < counts.dock; i++) {
    const spot = findSpot(
      c => c.isWater && c.height > -3 && c.height < SEA_LEVEL,
      BUILDING_SIZES.dock,
      (a, b) => a.distToCenter - b.distToCenter // closest to center
    );
    if (spot) {
      // Rotate dock to face land (roughly)
      const landDir = grid.find(c => c.isLand && Math.abs(c.x - spot.x) < 10 && Math.abs(c.z - spot.z) < 10);
      let rot = prng() * Math.PI;
      if (landDir) {
        rot = Math.atan2(landDir.x - spot.x, landDir.z - spot.z);
      }
      buildings.push({
        id: `dock_${i}`, type: 'dock',
        position: [spot.x, 0.2, spot.z], // Docks are slightly above water
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
  for (let i = 0; i < counts.house; i++) {
    const spot = findSpot(
      c => c.isLand, 
      BUILDING_SIZES.house,
      (a, b) => (a.distToCenter + prng()*20) - (b.distToCenter + prng()*20) // somewhat clustered
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
        position: [spot.x, spot.height, spot.z],
        rotation: prng() * Math.PI, scale: BUILDING_SIZES.shack
      });
    }
  }

  // 9. Generate roads connecting key buildings
  const roads = generateRoads(grid, buildings, portX, portZ, cellSize, gridRadius, culture);
  buildings.push(...roads);

  return buildings;
}

// A* pathfinding on the city grid
function findPath(
  grid: Array<{ x: number; z: number; height: number; isWater: boolean; isLand: boolean; isBeach: boolean }>,
  startX: number, startZ: number,
  endX: number, endZ: number,
  cellSize: number
): Array<{ x: number; z: number; height: number }> {
  const cellMap = new Map<string, typeof grid[0]>();
  for (const c of grid) {
    cellMap.set(`${c.x},${c.z}`, c);
  }

  // Snap to nearest grid cell
  const snapX = (v: number) => Math.round(v / cellSize) * cellSize;
  const startCell = cellMap.get(`${snapX(startX)},${snapX(startZ)}`);
  const endCell = cellMap.get(`${snapX(endX)},${snapX(endZ)}`);
  if (!startCell || !endCell) return [];

  return findPathAStar(cellMap, startCell, endCell, cellSize);
}

function findPathAStar(
  cellMap: Map<string, { x: number; z: number; height: number; isWater: boolean }>,
  start: { x: number; z: number; height: number },
  end: { x: number; z: number; height: number },
  cellSize: number
): Array<{ x: number; z: number; height: number }> {
  const key = (x: number, z: number) => `${x},${z}`;
  const parents = new Map<string, string>();
  const gScores = new Map<string, number>();
  const open: string[] = [];
  const closed = new Set<string>();

  const sk = key(start.x, start.z);
  const ek = key(end.x, end.z);
  open.push(sk);
  gScores.set(sk, 0);

  const heuristic = (x: number, z: number) => Math.abs(x - end.x) + Math.abs(z - end.z);

  const dirs = [
    [0, cellSize], [0, -cellSize], [cellSize, 0], [-cellSize, 0],
    [cellSize, cellSize], [cellSize, -cellSize], [-cellSize, cellSize], [-cellSize, -cellSize]
  ];

  let iterations = 0;
  while (open.length > 0 && iterations < 3000) {
    iterations++;

    // Find best
    let bestIdx = 0;
    let bestF = Infinity;
    for (let i = 0; i < open.length; i++) {
      const k = open[i];
      const cell = cellMap.get(k);
      if (!cell) continue;
      const g = gScores.get(k) ?? Infinity;
      const f = g + heuristic(cell.x, cell.z);
      if (f < bestF) { bestF = f; bestIdx = i; }
    }

    const currentKey = open.splice(bestIdx, 1)[0];
    if (currentKey === ek) {
      // Reconstruct
      const path: Array<{ x: number; z: number; height: number }> = [];
      let ck: string | undefined = currentKey;
      while (ck) {
        const cell = cellMap.get(ck);
        if (cell) path.unshift({ x: cell.x, z: cell.z, height: cell.height });
        ck = parents.get(ck);
      }
      return path;
    }

    closed.add(currentKey);
    const currentCell = cellMap.get(currentKey);
    if (!currentCell) continue;
    const currentG = gScores.get(currentKey) ?? 0;

    for (const [dx, dz] of dirs) {
      const nx = currentCell.x + dx;
      const nz = currentCell.z + dz;
      const nk = key(nx, nz);
      if (closed.has(nk)) continue;

      const neighbor = cellMap.get(nk);
      if (!neighbor || neighbor.isWater) continue;

      const slope = Math.abs(neighbor.height - currentCell.height);
      if (slope > 2.5) continue; // too steep for a road

      const isDiag = dx !== 0 && dz !== 0;
      const cost = (isDiag ? 1.414 : 1) + slope * 2;
      const newG = currentG + cost;

      if (newG < (gScores.get(nk) ?? Infinity)) {
        gScores.set(nk, newG);
        parents.set(nk, currentKey);
        if (!open.includes(nk)) open.push(nk);
      }
    }
  }

  return []; // no path found
}

function generateRoads(
  grid: Array<{ x: number; z: number; height: number; isWater: boolean; isLand: boolean; isBeach: boolean; occupied: boolean }>,
  buildings: Building[],
  portX: number, portZ: number,
  cellSize: number,
  _gridRadius: number,
  culture: Culture
): Building[] {
  const roads: Building[] = [];
  const roadCells = new Set<string>();

  const docks = buildings.filter(b => b.type === 'dock');
  const markets = buildings.filter(b => b.type === 'market');
  const warehouses = buildings.filter(b => b.type === 'warehouse');
  const forts = buildings.filter(b => b.type === 'fort');
  const farmhouses = buildings.filter(b => b.type === 'farmhouse');

  // Find the "town center" - first market, or port center
  const center = markets[0]
    ? { x: markets[0].position[0], z: markets[0].position[2] }
    : { x: portX, z: portZ };

  // Pairs to connect
  const pairs: Array<[{ x: number; z: number }, { x: number; z: number }]> = [];

  // Docks to center
  for (const dock of docks) {
    pairs.push([{ x: dock.position[0], z: dock.position[2] }, center]);
  }

  // Warehouses to center
  for (const wh of warehouses) {
    pairs.push([{ x: wh.position[0], z: wh.position[2] }, center]);
  }

  // Fort to center
  for (const fort of forts) {
    pairs.push([{ x: fort.position[0], z: fort.position[2] }, center]);
  }

  // Farmhouses to center (these create outlying roads)
  for (const farm of farmhouses) {
    pairs.push([center, { x: farm.position[0], z: farm.position[2] }]);
  }

  // Road dimensions: flat and wide
  const roadWidth = culture === 'European' ? 2.2 : 1.8;
  const roadHeight = 0.12;
  let roadIdx = 0;

  for (const [from, to] of pairs) {
    const path = findPath(grid, from.x, from.z, to.x, to.z, cellSize);

    for (const cell of path) {
      const ck = `${cell.x},${cell.z}`;
      if (roadCells.has(ck)) continue; // don't duplicate
      roadCells.add(ck);

      roads.push({
        id: `road_${roadIdx++}`,
        type: 'road',
        position: [cell.x, cell.height + 0.05, cell.z],
        rotation: 0,
        scale: [roadWidth, roadHeight, roadWidth]
      });
    }
  }

  return roads;
}
