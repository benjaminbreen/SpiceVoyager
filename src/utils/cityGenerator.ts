import { PortScale, Culture, Building, BuildingType, Nationality, CulturalRegion, Road, RoadTier } from '../store/gameStore';
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
  'Small':      { dock: 1, warehouse: 1, fort: 0, estate: 0, market: 0, house: 8,   shack: 5,  farmhouse: 3 },
  'Medium':     { dock: 2, warehouse: 2, fort: 0, estate: 1, market: 1, house: 20,  shack: 8,  farmhouse: 6 },
  'Large':      { dock: 3, warehouse: 3, fort: 1, estate: 3, market: 2, house: 40,  shack: 12, farmhouse: 10 },
  'Very Large': { dock: 5, warehouse: 4, fort: 1, estate: 5, market: 3, house: 70,  shack: 20, farmhouse: 15 },
  'Huge':       { dock: 6, warehouse: 5, fort: 2, estate: 7, market: 4, house: 110, shack: 25, farmhouse: 20 },
};

const ROAD_COUNTS: Record<PortScale, { avenues: number; roads: number; paths: number }> = {
  'Small':      { avenues: 0, roads: 0, paths: 1 },
  'Medium':     { avenues: 0, roads: 1, paths: 2 },
  'Large':      { avenues: 0, roads: 2, paths: 3 },
  'Very Large': { avenues: 1, roads: 3, paths: 4 },
  'Huge':       { avenues: 2, roads: 4, paths: 6 },
};

// Generator footprint per scale. Half-width in grid cells; world size is
// (2 * GRID_RADIUS * cellSize) units per side. Huge ports need ~4× the area
// of Medium to fit their building counts without bumping the edge of the box.
const GRID_RADIUS: Record<PortScale, number> = {
  'Small':      24,
  'Medium':     32,
  'Large':      46,
  'Very Large': 62,
  'Huge':       82,
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
  /** Connected-land-component id assigned by flood-fill. -1 for water. */
  bank: number;
}

// ── A* pathfinder for road generation ─────────────────────────────────────────

interface PathOpts {
  slopePenalty: number;   // how much vertical change costs — avenues high, paths low
  occupiedPenalty: number; // cost of crossing a building footprint
  turnPenalty: number;    // penalty for changing direction — avenues high, paths low
  waypoints?: Cell[];     // extra cells the path should be drawn toward (bonus — unused for now)
  allowStartEndOnOccupied: boolean;
  // Cells already used by earlier roads. A* discounts stepping onto them so
  // later roads tee into existing corridors instead of running parallel.
  roadCells?: Set<string>;
  roadReuseFactor?: number; // step multiplier when stepping onto a roadCell (default 0.3)
  // Water cells that are spanned by a bridge — A* is allowed to traverse these
  // even though they are water. Used to route roads across rivers.
  bridgeCells?: Set<string>;
}

const NEIGHBORS: [number, number][] = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [-1, 1], [1, -1], [-1, -1],
];

function aStarPath(
  start: Cell,
  end: Cell,
  gridMap: Map<string, Cell>,
  cellSize: number,
  opts: PathOpts
): Cell[] | null {
  const startKey = `${start.x},${start.z}`;
  const endKey = `${end.x},${end.z}`;
  if (startKey === endKey) return [start];

  const gScore = new Map<string, number>();
  const fScore = new Map<string, number>();
  const cameFrom = new Map<string, Cell>();
  const cameDir = new Map<string, [number, number]>();
  const open = new Set<string>();

  gScore.set(startKey, 0);
  fScore.set(startKey, heuristic(start, end));
  open.add(startKey);

  while (open.size > 0) {
    // Pick lowest fScore in the open set
    let currentKey = '';
    let bestF = Infinity;
    for (const k of open) {
      const f = fScore.get(k) ?? Infinity;
      if (f < bestF) { bestF = f; currentKey = k; }
    }
    if (!currentKey) break;

    if (currentKey === endKey) {
      // Reconstruct
      const path: Cell[] = [];
      let curKey: string | undefined = currentKey;
      while (curKey) {
        const parent = cameFrom.get(curKey);
        const [cx, cz] = curKey.split(',').map(Number);
        const cell = gridMap.get(`${cx},${cz}`);
        if (cell) path.unshift(cell);
        curKey = parent ? `${parent.x},${parent.z}` : undefined;
      }
      return path;
    }

    open.delete(currentKey);
    const current = gridMap.get(currentKey);
    if (!current) continue;
    const prevDir = cameDir.get(currentKey);

    for (const [dx, dz] of NEIGHBORS) {
      const nx = current.x + dx * cellSize;
      const nz = current.z + dz * cellSize;
      const nKey = `${nx},${nz}`;
      const neighbor = gridMap.get(nKey);
      if (!neighbor) continue;
      const isEndpoint = nKey === endKey || nKey === startKey;
      const isBridgeCell = opts.bridgeCells?.has(nKey) ?? false;
      if (neighbor.isWater && !isEndpoint && !isBridgeCell) continue;
      if (!neighbor.isLand && !neighbor.isBeach && !isEndpoint && !isBridgeCell) continue;

      const diag = (dx !== 0 && dz !== 0);
      const stepDist = diag ? 1.414 : 1;
      const dh = Math.abs(neighbor.height - current.height);
      let step = stepDist + dh * dh * opts.slopePenalty;
      if (neighbor.occupied && !(isEndpoint && opts.allowStartEndOnOccupied)) {
        step += opts.occupiedPenalty;
      }
      if (prevDir && (prevDir[0] !== dx || prevDir[1] !== dz)) {
        step += opts.turnPenalty;
      }
      if (opts.roadCells?.has(nKey)) {
        step *= opts.roadReuseFactor ?? 0.3;
      }

      const tentative = (gScore.get(currentKey) ?? Infinity) + step;
      if (tentative < (gScore.get(nKey) ?? Infinity)) {
        cameFrom.set(nKey, current);
        cameDir.set(nKey, [dx, dz]);
        gScore.set(nKey, tentative);
        fScore.set(nKey, tentative + heuristic(neighbor, end));
        open.add(nKey);
      }
    }
  }
  return null;
}

function heuristic(a: Cell, b: Cell): number {
  const dx = Math.abs(a.x - b.x);
  const dz = Math.abs(a.z - b.z);
  // Diagonal-aware (octile) distance
  return Math.max(dx, dz) + (Math.sqrt(2) - 1) * Math.min(dx, dz);
}

// Chaikin corner-cutting — smooths a polyline into gentle curves.
// 3D variant: smooths y alongside xz so bridge-deck plateaus survive smoothing
// and transition smoothly into land ramps at each endpoint.
function chaikin3(
  pts: [number, number, number][],
  iterations: number,
): [number, number, number][] {
  let result = pts;
  for (let i = 0; i < iterations; i++) {
    if (result.length < 3) return result;
    const next: [number, number, number][] = [result[0]];
    for (let j = 0; j < result.length - 1; j++) {
      const [x0, y0, z0] = result[j];
      const [x1, y1, z1] = result[j + 1];
      next.push([
        0.75 * x0 + 0.25 * x1,
        0.75 * y0 + 0.25 * y1,
        0.75 * z0 + 0.25 * z1,
      ]);
      next.push([
        0.25 * x0 + 0.75 * x1,
        0.25 * y0 + 0.75 * y1,
        0.25 * z0 + 0.75 * z1,
      ]);
    }
    next.push(result[result.length - 1]);
    result = next;
  }
  return result;
}

const BRIDGE_DECK_Y = SEA_LEVEL + 0.8;

function pathToRoad(
  id: string,
  tier: RoadTier,
  cellPath: Cell[],
  smoothIterations: number,
  bridgeCells?: Set<string>,
): Road {
  // Pre-compute y per input cell so bridge spans ride the deck instead of
  // floating a ribbon at sea level underneath. Land cells keep terrain height.
  const raw: [number, number, number][] = cellPath.map(c => {
    const onBridge = bridgeCells?.has(`${c.x},${c.z}`) ?? false;
    if (onBridge) return [c.x, BRIDGE_DECK_Y, c.z];
    const h = getTerrainData(c.x, c.z).height;
    return [c.x, Math.max(h, SEA_LEVEL + 0.05), c.z];
  });
  const smoothed = smoothIterations > 0 ? chaikin3(raw, smoothIterations) : raw;
  // Final clamp: never dip below terrain or water surface. This preserves the
  // deck on bridge cells and lets Chaikin's interpolated ramp points ride up
  // the land slope naturally at each endpoint.
  const points: [number, number, number][] = smoothed.map(([x, y, z]) => {
    const h = getTerrainData(x, z).height;
    return [x, Math.max(y, h, SEA_LEVEL + 0.05), z];
  });
  return { id, tier, points };
}

// For placing buildings "along" a road. Returns candidate spots at perpendicular
// offsets from road midpoints, with rotation facing the road centerline.
interface RoadAnchor {
  x: number;
  z: number;
  rot: number;        // rotation such that building's +Z faces the road
  tier: RoadTier;
}

function sampleRoadAnchors(road: Road, spacing: number, offset: number): RoadAnchor[] {
  const anchors: RoadAnchor[] = [];
  const pts = road.points;
  if (pts.length < 2) return anchors;
  let accum = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, , z0] = pts[i];
    const [x1, , z1] = pts[i + 1];
    const dx = x1 - x0;
    const dz = z1 - z0;
    const segLen = Math.sqrt(dx * dx + dz * dz);
    if (segLen < 0.001) continue;
    const ux = dx / segLen;
    const uz = dz / segLen;
    const nx = -uz; // perpendicular
    const nz = ux;
    let t = Math.max(0, spacing - accum);
    while (t <= segLen) {
      const mx = x0 + ux * t;
      const mz = z0 + uz * t;
      // Two sides of the road
      for (const side of [1, -1]) {
        const bx = mx + nx * offset * side;
        const bz = mz + nz * offset * side;
        const rot = Math.atan2(mx - bx, mz - bz); // face road center
        anchors.push({ x: bx, z: bz, rot, tier: road.tier });
      }
      t += spacing;
    }
    accum = (accum + segLen) % spacing;
  }
  return anchors;
}

// ── Main generation ───────────────────────────────────────────────────────────

export function generateCity(
  portX: number,
  portZ: number,
  scale: PortScale,
  culture: Culture,
  seed: number,
  portName: string = '',
  nationality?: Nationality,
  region?: CulturalRegion,
  bridgeCount: number = 0,
): { buildings: Building[]; roads: Road[] } {
  const prng = mulberry32(seed);
  const buildings: Building[] = [];
  const roads: Road[] = [];
  const counts = SCALE_COUNTS[scale];
  const roadCounts = ROAD_COUNTS[scale];

  const cellSize = 2;
  const gridRadius = GRID_RADIUS[scale];
  // Outer-ring band where path targets are sampled. Scales with gridRadius so
  // sprawl reaches the edge of the box at every port size.
  const innerRing = gridRadius * 0.625;
  const outerRing = gridRadius * 1.375;

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
        distToCenter: Math.sqrt((x - portX) ** 2 + (z - portZ) ** 2),
        bank: -1,
      };
      grid.push(cell);
      gridMap.set(`${x},${z}`, cell);
    }
  }

  // ── Bank classification via 4-neighbor flood-fill on land cells ─────────────
  // Two major land components ⇒ the map is bisected (river/strait), and anchor
  // placement distributes across both sides. Small islands (< 10% of total land)
  // are treated as part of the mainland pool for placement.
  const bankSizes: number[] = [];
  let nextBank = 0;
  const FOUR_NEIGHBORS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (const seedCell of grid) {
    if (!(seedCell.isLand || seedCell.isBeach) || seedCell.bank !== -1) continue;
    const id = nextBank++;
    bankSizes[id] = 0;
    const queue: Cell[] = [seedCell];
    seedCell.bank = id;
    bankSizes[id]++;
    while (queue.length > 0) {
      const c = queue.shift()!;
      for (const [dx, dz] of FOUR_NEIGHBORS) {
        const n = gridMap.get(`${c.x + dx * cellSize},${c.z + dz * cellSize}`);
        if (!n || n.bank !== -1) continue;
        if (!(n.isLand || n.isBeach)) continue;
        n.bank = id;
        bankSizes[id]++;
        queue.push(n);
      }
    }
  }
  const sortedBanks = bankSizes
    .map((size, id) => ({ id, size }))
    .sort((a, b) => b.size - a.size);
  const totalLand = bankSizes.reduce((a, b) => a + b, 0);
  const dualBank =
    sortedBanks.length >= 2 && sortedBanks[1].size >= totalLand * 0.18;
  const bankA = dualBank ? sortedBanks[0].id : -1;
  const bankB = dualBank ? sortedBanks[1].id : -1;
  const majorBanks = new Set<number>();
  if (dualBank) { majorBanks.add(bankA); majorBanks.add(bankB); }

  // Helper to find a spot
  const findSpot = (
    condition: (cell: Cell) => boolean,
    size: [number, number, number],
    sortFn?: (a: Cell, b: Cell) => number,
  ): Cell | null => {
    let candidates = grid.filter(c => !c.occupied && condition(c));
    if (sortFn) candidates.sort(sortFn);
    else {
      for (let i = candidates.length - 1; i > 0; i--) {
        const j = Math.floor(prng() * (i + 1));
        [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
      }
    }

    for (const cell of candidates) {
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
          if (!checkCell || checkCell.occupied) { clear = false; break; }
          if (Math.abs(checkCell.height - cell.height) > 1.5) { clear = false; break; }
          avgHeight += checkCell.height;
          count++;
        }
        if (!clear) break;
      }

      if (clear) {
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

  const isCoastalWater = (cell: Cell): boolean => {
    if (!cell.isWater || cell.height <= -3) return false;
    for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]]) {
      const neighbor = gridMap.get(`${cell.x + dx * cellSize},${cell.z + dz * cellSize}`);
      if (neighbor && (neighbor.isLand || neighbor.isBeach)) return true;
    }
    return false;
  };

  // Which bank a water cell belongs to (based on nearest land neighbor).
  // Used to steer docks onto a specific bank in dual-bank maps. -1 if no
  // adjacent land within one step.
  const waterCellBank = (cell: Cell): number => {
    for (const [dx, dz] of FOUR_NEIGHBORS) {
      const n = gridMap.get(`${cell.x + dx * cellSize},${cell.z + dz * cellSize}`);
      if (n && n.bank >= 0) return n.bank;
    }
    for (const [dx, dz] of [[1,1],[-1,-1],[1,-1],[-1,1]] as [number, number][]) {
      const n = gridMap.get(`${cell.x + dx * cellSize},${cell.z + dz * cellSize}`);
      if (n && n.bank >= 0) return n.bank;
    }
    return -1;
  };

  // For dual-bank ports, alternate anchor types between the two banks so
  // neither side is starved. For single-bank ports this collapses to "-1 = any".
  const preferredBank = (i: number): number => {
    if (!dualBank) return -1;
    return i % 2 === 0 ? bankA : bankB;
  };

  const snap = (x: number, z: number) => {
    const sx = Math.round((x - portX) / cellSize) * cellSize + portX;
    const sz = Math.round((z - portZ) / cellSize) * cellSize + portZ;
    return gridMap.get(`${sx},${sz}`) ?? null;
  };

  // ── 0. Bridges ─────────────────────────────────────────────────────────────
  // Placed before any anchors so that (a) fort placement can see whether a
  // bridge actually succeeded before steering the fort onto the opposite bank,
  // and (b) A* has the bridge's water cells available as the road network is
  // built. Shared road-cell + bridge-cell sets live here too so later A*
  // corridors tee into earlier ones and route over the bridge.
  const roadCells = new Set<string>();
  const registerCells = (cells: Cell[]) => {
    for (const c of cells) roadCells.add(`${c.x},${c.z}`);
  };
  const bridgeCells = new Set<string>();
  const bridgeRoads: Cell[][] = [];

  // Scan reach scales with port footprint — a fixed 28-cell cap was too short
  // for Huge ports with wide channels, which silently dropped their bridge.
  const bridgeScanSteps = Math.max(18, Math.round(gridRadius * 0.7));

  if (bridgeCount > 0 && dualBank) {
    const bankABeach = grid.filter(c => c.bank === bankA && c.isBeach);
    const shuffled = [...bankABeach];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(prng() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const sample = shuffled.slice(0, Math.min(220, shuffled.length));

    const bridgeCentroids: [number, number][] = [];
    // Max water-span a bridge is allowed to cover. Scales with the scan reach
    // so Huge ports don't reject an otherwise-valid crossing.
    const maxSpan = Math.max(16, Math.round(bridgeScanSteps * 0.85));

    for (let bi = 0; bi < bridgeCount; bi++) {
      let bestScore = Infinity;
      let best: { start: Cell; end: Cell; water: Cell[] } | null = null;

      for (const a of sample) {
        for (const [dx, dz] of NEIGHBORS) {
          let sx = a.x, sz = a.z;
          const water: Cell[] = [];
          for (let step = 0; step < bridgeScanSteps; step++) {
            sx += dx * cellSize;
            sz += dz * cellSize;
            const n = gridMap.get(`${sx},${sz}`);
            if (!n) break;
            if (n.bank === bankB) {
              if (water.length > 0 && water.length < maxSpan) {
                const mid = water[Math.floor(water.length / 2)];
                const centerDist = Math.hypot(mid.x - portX, mid.z - portZ);
                let spacingPenalty = 0;
                for (const [cx, cz] of bridgeCentroids) {
                  const d = Math.hypot(mid.x - cx, mid.z - cz);
                  if (d < 30) spacingPenalty += (30 - d) * 0.8;
                }
                const score = water.length * 1.6 + centerDist * 0.25 + spacingPenalty;
                if (score < bestScore) {
                  bestScore = score;
                  best = { start: a, end: n, water: [...water] };
                }
              }
              break;
            }
            if (n.bank >= 0) break;
            if (!n.isWater) break;
            water.push(n);
          }
        }
      }

      if (!best) break;
      for (const w of best.water) {
        const k = `${w.x},${w.z}`;
        bridgeCells.add(k);
        roadCells.add(k);
      }
      roadCells.add(`${best.start.x},${best.start.z}`);
      roadCells.add(`${best.end.x},${best.end.z}`);
      const deckY = SEA_LEVEL + 0.8;
      const path = [best.start, ...best.water, best.end];
      const points: [number, number, number][] = path.map(c => {
        const y = c.isWater ? deckY : Math.max(c.height, deckY);
        return [c.x, y, c.z];
      });
      roads.push({ id: `bridge_${bi}`, tier: 'bridge', points });
      bridgeRoads.push(path);
      const mid = best.water[Math.floor(best.water.length / 2)];
      bridgeCentroids.push([mid.x, mid.z]);
    }
  }

  // ── 1. Place docks ──────────────────────────────────────────────────────────
  const dockCells: Cell[] = [];
  for (let i = 0; i < counts.dock; i++) {
    const pref = preferredBank(i);
    const spot = findSpot(
      c => isCoastalWater(c) && (pref < 0 || waterCellBank(c) === pref),
      BUILDING_SIZES.dock,
      (a, b) => a.distToCenter - b.distToCenter,
    );
    if (spot) {
      let landDir: Cell | undefined;
      let bestDist = Infinity;
      for (const c of grid) {
        if (!(c.isLand || c.isBeach)) continue;
        const d = (c.x - spot.x) ** 2 + (c.z - spot.z) ** 2;
        if (d < bestDist && d < 15 * 15) { bestDist = d; landDir = c; }
      }
      let rot = prng() * Math.PI;
      if (landDir) rot = Math.atan2(landDir.x - spot.x, landDir.z - spot.z);
      buildings.push({
        id: `dock_${i}`, type: 'dock',
        position: [spot.x, 0.55, spot.z],
        rotation: rot, scale: BUILDING_SIZES.dock,
      });
      // Anchor for road generation = nearest land cell to the dock
      if (landDir) dockCells.push(landDir);
    }
  }

  // ── 2. Place civic anchors (fort, markets, warehouses, estates) ─────────────
  const anchorCells: { type: BuildingType; cell: Cell; idx: number }[] = [];

  // Forts tend to be single per port. On dual-bank maps *with a successfully
  // placed bridge*, steer the fort onto the opposite bank from dock 0 (dock 0
  // sits on bankA by preferredBank(0)) so the primary dock→market→fort avenue
  // must cross the bridge. This keeps the bridge wired into the road network
  // instead of leaving it an isolated stone span. If no bridge was placed
  // (wide/curved river, or bridgeCount=0 on a dual-bank map), fall back to
  // central placement on any major bank — otherwise the fort would be
  // stranded on an unreachable bank.
  const fortPreferBank = dualBank && bridgeRoads.length > 0 ? bankB : -1;
  for (let i = 0; i < counts.fort; i++) {
    let spot = fortPreferBank >= 0
      ? findSpot(
          c => c.isLand && c.bank === fortPreferBank,
          BUILDING_SIZES.fort,
          (a, b) => a.distToCenter - b.distToCenter,
        )
      : null;
    if (!spot) {
      spot = findSpot(
        c => c.isLand && (!dualBank || majorBanks.has(c.bank)),
        BUILDING_SIZES.fort,
        (a, b) => a.distToCenter - b.distToCenter,
      );
    }
    if (spot) {
      buildings.push({
        id: `fort_${i}`, type: 'fort',
        position: [spot.x, spot.height, spot.z],
        rotation: prng() * Math.PI, scale: BUILDING_SIZES.fort,
      });
      anchorCells.push({ type: 'fort', cell: spot, idx: i });
    }
  }

  for (let i = 0; i < counts.market; i++) {
    const pref = preferredBank(i);
    const spot = findSpot(
      c => c.isLand && (pref < 0 || c.bank === pref),
      BUILDING_SIZES.market,
      (a, b) => a.distToCenter - b.distToCenter,
    );
    if (spot) {
      buildings.push({
        id: `market_${i}`, type: 'market',
        position: [spot.x, spot.height, spot.z],
        rotation: prng() * Math.PI, scale: BUILDING_SIZES.market,
      });
      anchorCells.push({ type: 'market', cell: spot, idx: i });
    }
  }

  for (let i = 0; i < counts.warehouse; i++) {
    const pref = preferredBank(i);
    const spot = findSpot(
      c => c.isLand && (pref < 0 || c.bank === pref),
      BUILDING_SIZES.warehouse,
      (a, b) => a.distToCenter - b.distToCenter,
    );
    if (spot) {
      buildings.push({
        id: `warehouse_${i}`, type: 'warehouse',
        position: [spot.x, spot.height, spot.z],
        rotation: prng() * Math.PI, scale: BUILDING_SIZES.warehouse,
      });
      anchorCells.push({ type: 'warehouse', cell: spot, idx: i });
    }
  }

  for (let i = 0; i < counts.estate; i++) {
    const pref = preferredBank(i);
    const spot = findSpot(
      c => c.isLand && c.height > 2 && (pref < 0 || c.bank === pref),
      BUILDING_SIZES.estate,
    );
    if (spot) {
      buildings.push({
        id: `estate_${i}`, type: 'estate',
        position: [spot.x, spot.height, spot.z],
        rotation: prng() * Math.PI, scale: BUILDING_SIZES.estate,
      });
      anchorCells.push({ type: 'estate', cell: spot, idx: i });
    }
  }

  // ── 3. Build road network ──────────────────────────────────────────────────
  const dockAnchor = dockCells[0] ?? null;

  const market = anchorCells.find(a => a.type === 'market');
  const fort = anchorCells.find(a => a.type === 'fort');
  const secondMarket = anchorCells.filter(a => a.type === 'market')[1];
  const warehouse = anchorCells.find(a => a.type === 'warehouse');

  const avenueOpts: PathOpts = {
    slopePenalty: 6, occupiedPenalty: 15, turnPenalty: 2.5, allowStartEndOnOccupied: true,
    roadCells, roadReuseFactor: 0.25, bridgeCells,
  };
  const roadOpts: PathOpts = {
    slopePenalty: 3, occupiedPenalty: 10, turnPenalty: 1.2, allowStartEndOnOccupied: true,
    roadCells, roadReuseFactor: 0.3, bridgeCells,
  };
  const pathOpts: PathOpts = {
    slopePenalty: 1, occupiedPenalty: 6, turnPenalty: 0.2, allowStartEndOnOccupied: true,
    roadCells, roadReuseFactor: 0.35, bridgeCells,
  };

  const tryAddRoad = (
    tier: RoadTier,
    id: string,
    start: Cell | null,
    end: Cell | null,
    opts: PathOpts,
    smoothIter: number,
  ): Road | null => {
    if (!start || !end) return null;
    const cellPath = aStarPath(start, end, gridMap, cellSize, opts);
    if (!cellPath || cellPath.length < 2) return null;
    registerCells(cellPath);
    const road = pathToRoad(id, tier, cellPath, smoothIter, bridgeCells);
    roads.push(road);
    return road;
  };

  // Avenues (one or two for Very Large/Huge)
  if (roadCounts.avenues >= 1) {
    // Main avenue: dock → market → fort if available, else dock → fort, else dock → any inland anchor
    const chain: Cell[] = [];
    if (dockAnchor) chain.push(dockAnchor);
    if (market) chain.push(market.cell);
    if (fort) chain.push(fort.cell);
    if (chain.length >= 2) {
      // Build piece-wise A*, concat into one polyline
      const fullCells: Cell[] = [];
      for (let i = 0; i < chain.length - 1; i++) {
        const seg = aStarPath(chain[i], chain[i + 1], gridMap, cellSize, avenueOpts);
        if (!seg) continue;
        registerCells(seg);
        if (fullCells.length > 0) seg.shift(); // avoid duplicate junction
        fullCells.push(...seg);
      }
      if (fullCells.length >= 2) {
        roads.push(pathToRoad(`avenue_0`, 'avenue', fullCells, 3, bridgeCells));
      }
    }
  }
  if (roadCounts.avenues >= 2) {
    // Second avenue: perpendicular axis — fort → estate/market farther out
    const estate = anchorCells.find(a => a.type === 'estate');
    const altStart = secondMarket?.cell ?? warehouse?.cell ?? dockAnchor;
    const altEnd = estate?.cell ?? fort?.cell ?? market?.cell;
    tryAddRoad('avenue', 'avenue_1', altStart ?? null, altEnd ?? null, avenueOpts, 3);
  }

  // Roads: remaining anchors → nearest existing road terminus
  const roadEndpoints = (): Cell[] => {
    const ends: Cell[] = [];
    for (const r of roads) {
      const first = r.points[0];
      const last = r.points[r.points.length - 1];
      const f = snap(first[0], first[2]);
      const l = snap(last[0], last[2]);
      if (f) ends.push(f);
      if (l) ends.push(l);
    }
    return ends;
  };

  const nearestOf = (from: Cell, candidates: Cell[]): Cell | null => {
    let best: Cell | null = null;
    let bestD = Infinity;
    for (const c of candidates) {
      const d = (c.x - from.x) ** 2 + (c.z - from.z) ** 2;
      if (d < bestD) { bestD = d; best = c; }
    }
    return best;
  };

  const unconnected: { type: BuildingType; cell: Cell; idx: number }[] = [...anchorCells];
  // Remove anchors that are already on the avenue (roughly — those used in chain)
  const usedAnchorKeys = new Set<string>();
  for (const r of roads) {
    for (const p of r.points) {
      usedAnchorKeys.add(`${Math.round(p[0])},${Math.round(p[2])}`);
    }
  }

  let roadsBuilt = 0;
  // Prefer connecting markets, forts, warehouses that are off-network
  const sortedAnchors = unconnected.sort((a, b) => {
    const order = { market: 0, fort: 1, warehouse: 2, estate: 3, dock: 4, house: 5, farmhouse: 6, shack: 7 } as Record<BuildingType, number>;
    return (order[a.type] ?? 9) - (order[b.type] ?? 9);
  });
  for (const a of sortedAnchors) {
    if (roadsBuilt >= roadCounts.roads) break;
    const pool = [...roadEndpoints(), ...(dockAnchor ? [dockAnchor] : [])];
    if (pool.length === 0) break;
    const near = nearestOf(a.cell, pool);
    if (!near) continue;
    // Skip if the anchor is already nearly on a road endpoint
    const d = Math.sqrt((near.x - a.cell.x) ** 2 + (near.z - a.cell.z) ** 2);
    if (d < 6) continue;
    const added = tryAddRoad('road', `road_${roadsBuilt}`, a.cell, near, roadOpts, 2);
    if (added) roadsBuilt++;
  }

  // If we still need roads and have no avenue (Medium/Large), connect dock↔market directly
  if (roadsBuilt < roadCounts.roads && roadCounts.avenues === 0) {
    if (dockAnchor && market) {
      const added = tryAddRoad('road', `road_${roadsBuilt}`, dockAnchor, market.cell, roadOpts, 2);
      if (added) roadsBuilt++;
    }
    // Chain markets
    if (roadsBuilt < roadCounts.roads && market && fort) {
      const added = tryAddRoad('road', `road_${roadsBuilt}`, market.cell, fort.cell, roadOpts, 2);
      if (added) roadsBuilt++;
    }
  }

  // Paths: branch from road endpoints to distant land points (where outskirts will cluster)
  let pathsBuilt = 0;
  const pathTargetCell = (): Cell | null => {
    // Pick a random land cell in the outer ring, far from existing roads
    const ring = grid.filter(c =>
      c.isLand && c.distToCenter > innerRing && c.distToCenter < outerRing &&
      !Array.from(usedAnchorKeys).some(k => {
        const [ux, uz] = k.split(',').map(Number);
        return Math.abs(ux - c.x) < 8 && Math.abs(uz - c.z) < 8;
      })
    );
    if (ring.length === 0) return null;
    return ring[Math.floor(prng() * ring.length)];
  };

  let pathFailures = 0;
  while (pathsBuilt < roadCounts.paths) {
    const target = pathTargetCell();
    if (!target) break;
    const pool = [...roadEndpoints(), ...(dockAnchor ? [dockAnchor] : [])];
    const start = pool.length > 0
      ? (nearestOf(target, pool) ?? dockAnchor)
      : dockAnchor;
    if (!start) break;
    const added = tryAddRoad('path', `path_${pathsBuilt}`, start, target, pathOpts, 1);
    if (!added) {
      pathFailures++;
      if (pathFailures > 5) break;
      continue;
    }
    pathsBuilt++;
    // Record the new path's points as "used" so outskirt-target picker avoids them
    for (const p of added.points) {
      usedAnchorKeys.add(`${Math.round(p[0])},${Math.round(p[2])}`);
    }
  }

  // ── 4. Place houses, constrained to cells near roads ───────────────────────
  // Precompute road-adjacency anchors (both sides of each road, spaced ~3.5u).
  const houseAnchors: RoadAnchor[] = [];
  for (const r of roads) {
    // Houses cluster more heavily on avenues & roads than on paths.
    const spacing = r.tier === 'avenue' ? 3.2 : r.tier === 'road' ? 3.4 : 4.5;
    const offset  = r.tier === 'avenue' ? 4.0 : r.tier === 'road' ? 3.2 : 3.0;
    houseAnchors.push(...sampleRoadAnchors(r, spacing, offset));
  }
  // Shuffle anchors
  for (let i = houseAnchors.length - 1; i > 0; i--) {
    const j = Math.floor(prng() * (i + 1));
    [houseAnchors[i], houseAnchors[j]] = [houseAnchors[j], houseAnchors[i]];
  }

  const tryPlaceAtAnchor = (
    anchor: RoadAnchor,
    type: BuildingType,
    id: string,
  ): boolean => {
    const size = BUILDING_SIZES[type];
    const cell = snap(anchor.x, anchor.z);
    if (!cell || !cell.isLand || cell.occupied) return false;
    // Occupancy footprint check + height variance check (same as findSpot)
    const radiusX = Math.ceil(size[0] / cellSize / 2);
    const radiusZ = Math.ceil(size[2] / cellSize / 2);
    let avgHeight = 0;
    let count = 0;
    for (let r = -radiusZ; r <= radiusZ; r++) {
      for (let c = -radiusX; c <= radiusX; c++) {
        const check = gridMap.get(`${cell.x + c * cellSize},${cell.z + r * cellSize}`);
        if (!check || check.occupied) return false;
        if (Math.abs(check.height - cell.height) > 1.5) return false;
        avgHeight += check.height;
        count++;
      }
    }
    // Mark occupied with padding
    for (let r = -radiusZ - 1; r <= radiusZ + 1; r++) {
      for (let c = -radiusX - 1; c <= radiusX + 1; c++) {
        const check = gridMap.get(`${cell.x + c * cellSize},${cell.z + r * cellSize}`);
        if (check) check.occupied = true;
      }
    }
    buildings.push({
      id,
      type,
      position: [cell.x, avgHeight / count, cell.z],
      rotation: anchor.rot + (prng() - 0.5) * 0.15, // slight jitter so rows aren't robotically parallel
      scale: size,
    });
    return true;
  };

  let houseIdx = 0;
  let anchorCursor = 0;
  while (houseIdx < counts.house && anchorCursor < houseAnchors.length * 2) {
    const anchor = houseAnchors[anchorCursor % houseAnchors.length];
    anchorCursor++;
    if (tryPlaceAtAnchor(anchor, 'house', `house_${houseIdx}`)) houseIdx++;
  }

  // Fallback: fill any remaining houses using the original clustered-random spot finder.
  // This only triggers when road adjacency is exhausted (small ports, missing roads).
  const houseJitter = new Map<string, number>();
  for (const c of grid) houseJitter.set(`${c.x},${c.z}`, prng() * 20);
  while (houseIdx < counts.house) {
    const spot = findSpot(
      c => c.isLand,
      BUILDING_SIZES.house,
      (a, b) => (a.distToCenter + (houseJitter.get(`${a.x},${a.z}`) ?? 0))
              - (b.distToCenter + (houseJitter.get(`${b.x},${b.z}`) ?? 0)),
    );
    if (!spot) break;
    buildings.push({
      id: `house_${houseIdx}`, type: 'house',
      position: [spot.x, spot.height, spot.z],
      rotation: prng() * Math.PI, scale: BUILDING_SIZES.house,
    });
    houseIdx++;
  }

  // ── 5. Farmhouses (fertile outskirts) ──────────────────────────────────────
  for (let i = 0; i < counts.farmhouse; i++) {
    const spot = findSpot(
      c => c.isLand && c.moisture > 0.4,
      BUILDING_SIZES.farmhouse,
      (a, b) => b.distToCenter - a.distToCenter,
    );
    if (spot) {
      buildings.push({
        id: `farmhouse_${i}`, type: 'farmhouse',
        position: [spot.x, spot.height, spot.z],
        rotation: prng() * Math.PI, scale: BUILDING_SIZES.farmhouse,
      });
    }
  }

  // ── 6. Shacks (beaches) ────────────────────────────────────────────────────
  for (let i = 0; i < counts.shack; i++) {
    const spot = findSpot(
      c => c.isBeach,
      BUILDING_SIZES.shack,
    );
    if (spot) {
      buildings.push({
        id: `shack_${i}`, type: 'shack',
        position: [spot.x, Math.max(spot.height, SEA_LEVEL + 0.4), spot.z],
        rotation: prng() * Math.PI, scale: BUILDING_SIZES.shack,
      });
    }
  }

  // ── 7. Labels ──────────────────────────────────────────────────────────────
  for (const b of buildings) {
    const snapX = Math.round((b.position[0] - portX) / cellSize) * cellSize + portX;
    const snapZ = Math.round((b.position[2] - portZ) / cellSize) * cellSize + portZ;
    const cell = gridMap.get(`${snapX},${snapZ}`);
    const moisture = cell?.moisture ?? 0.5;
    const distToCenter = Math.sqrt((b.position[0] - portX) ** 2 + (b.position[2] - portZ) ** 2);
    const labelSeed = hashStr(b.id) + seed;
    const result = generateBuildingLabel(
      b.id, b.type, culture, portName,
      b.position[1], distToCenter, moisture, labelSeed, nationality, region,
    );
    b.label = result.label;
    b.labelSub = result.sub;
  }

  return { buildings, roads };
}
