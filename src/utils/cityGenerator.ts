import { PortScale, Culture, Building, BuildingType, Nationality, CulturalRegion, Road, RoadTier } from '../store/gameStore';
import { SEA_LEVEL } from '../constants/world';
import { getTerrainData } from './terrain';
import { generateBuildingLabel } from './buildingLabels';
import type { CanalLayout } from './canalLayout';
import { distanceToNearestCanal } from './canalLayout';
import { classifyBuildingDistrict, pruneDistrictBoundaries } from './cityDistricts';
import { assignBuildingForms } from './cityBuildings';
import { buildingSemanticClass, SEMANTIC_STYLE } from './semanticClasses';
import {
  pickPathOrigin,
  pickPathTarget,
  PATH_INTERIOR_BIAS,
  ROAD_DENSITY,
} from './cityLayout';

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

// `spiritual` and `landmark` sit at 0 across all scales — their counts are
// driven by the port's faith list and its `landmarkId`, not by this table.
// The entries exist solely to keep the Record exhaustive for TypeScript.
const SCALE_COUNTS: Record<PortScale, Record<BuildingType, number>> = {
  'Small':      { dock: 1, warehouse: 1, fort: 0, estate: 0, market: 0, plaza: 0, spiritual: 0, landmark: 0, house: 8,   shack: 5,  farmhouse: 3 },
  'Medium':     { dock: 2, warehouse: 2, fort: 0, estate: 1, market: 1, plaza: 1, spiritual: 0, landmark: 0, house: 20,  shack: 8,  farmhouse: 6 },
  'Large':      { dock: 3, warehouse: 3, fort: 1, estate: 3, market: 2, plaza: 1, spiritual: 0, landmark: 0, house: 40,  shack: 12, farmhouse: 10 },
  'Very Large': { dock: 5, warehouse: 4, fort: 1, estate: 5, market: 3, plaza: 2, spiritual: 0, landmark: 0, house: 70,  shack: 20, farmhouse: 15 },
  'Huge':       { dock: 6, warehouse: 5, fort: 2, estate: 7, market: 4, plaza: 2, spiritual: 0, landmark: 0, house: 110, shack: 25, farmhouse: 20 },
};

// Plaza footprint grows with port stature. Medium gets a compact 7×7; Huge
// gets a 10×10 civic square. These override BUILDING_SIZES.plaza per scale.
const PLAZA_FOOTPRINT: Record<PortScale, [number, number, number]> = {
  'Small':      [7, 0.3, 7],
  'Medium':     [7, 0.3, 7],
  'Large':      [9, 0.3, 9],
  'Very Large': [9, 0.3, 9],
  'Huge':       [10, 0.3, 10],
};

// Road counts now live in cityLayout.ts (ROAD_DENSITY) so tuning can happen
// from one place alongside the path-picking helpers.
const ROAD_COUNTS = ROAD_DENSITY;

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
  // Plazas are flat open squares — their renderer only reads the footprint;
  // the "height" field is ignored but we keep a nominal value for placement.
  plaza: [9, 0.3, 9],
  house: [3, 3, 3],
  shack: [2.5, 2, 2.5],
  farmhouse: [4, 3, 4],
  // Spiritual buildings reserve a big footprint so the +1 occupancy pad
  // carves out a clearing around them — the actual geometry is smaller.
  spiritual: [8, 4, 8],
  // Landmarks override this per-rule (LANDMARK_RULES[id].size). This value
  // is only a safety fallback if a landmark is ever placed without a rule.
  landmark: [10, 4, 10],
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
  canalLayout?: CanalLayout,
  landmarkId?: string,
  faiths: readonly string[] = [],
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
      let height = terrain.height;
      let isWater = terrain.height < SEA_LEVEL;
      let isBeach = terrain.height >= SEA_LEVEL && (terrain.coastFactor > 0.22 || terrain.height < SEA_LEVEL + 2.2);
      let isLand = terrain.height >= SEA_LEVEL && terrain.coastFactor <= 0.22 && terrain.height >= SEA_LEVEL + 0.6;

      // Canal carving: cells inside a canal water strip override to water with
      // the deck-level depth so bridges still clear comfortably overhead.
      if (canalLayout && canalLayout.canals.length > 0 && (isLand || isBeach)) {
        const { insideCanal } = distanceToNearestCanal(x, z, canalLayout);
        if (insideCanal) {
          height = SEA_LEVEL - 0.5;
          isWater = true;
          isLand = false;
          isBeach = false;
        }
      }

      const cell: Cell = {
        x, z,
        height,
        moisture: terrain.moisture,
        occupied: false,
        isWater, isBeach, isLand,
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
  // Canal cities subdivide the land into many ring/spoke fragments. The dual-
  // bank logic is meant for a single river bisecting the map; suppressing it
  // here lets anchors place freely on whichever fragment happens to be largest.
  const dualBank = !canalLayout
    && sortedBanks.length >= 2
    && sortedBanks[1].size >= totalLand * 0.18;
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

  if (bridgeCount > 0 && !dualBank) {
    // Estuary-style geographies often produce a single connected bank even
    // when a river is visible, because the two sides meet around the upstream
    // end of the river. Switching such a port to `tidal_river` (which cuts
    // across the whole map) fixes this.
    console.warn(`[bridges] ${portName}: requested=${bridgeCount} but dualBank=false — no bridges will be placed. Banks=[${bankSizes.join(',')}] totalLand=${totalLand}`);
  }
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

      if (!best) {
        console.warn(`[bridges] ${portName}: failed to place bridge ${bi + 1}/${bridgeCount} (no valid crossing found)`);
        break;
      }
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

  // ── Canal-city bridges ────────────────────────────────────────────────────
  // For each predetermined canal crossing, walk perpendicular across the
  // canal in cell steps, trim to land on each side, and emit a bridge road.
  if (canalLayout && canalLayout.bridges.length > 0) {
    let canalBridgeIdx = 0;
    for (const cb of canalLayout.bridges) {
      // Sample along the deck axis at sub-cell density so the path includes
      // every cell the deck overlaps. Reach a bit past halfLength so the
      // trim step can find land on both sides.
      const reach = cb.halfLength + cellSize * 2;
      const samples = Math.max(8, Math.ceil((reach * 2) / (cellSize * 0.5)));
      const seen = new Set<string>();
      const rawPath: Cell[] = [];
      for (let i = -samples; i <= samples; i++) {
        const t = (i / samples) * reach;
        const wx = cb.x + cb.dirX * t;
        const wz = cb.z + cb.dirZ * t;
        const cx = portX + Math.round((wx - portX) / cellSize) * cellSize;
        const cz = portZ + Math.round((wz - portZ) / cellSize) * cellSize;
        const key = `${cx},${cz}`;
        if (seen.has(key)) continue;
        const cell = gridMap.get(key);
        if (!cell) continue;
        seen.add(key);
        rawPath.push(cell);
      }
      // Trim to first land cell on each side so the deck lands on solid ground.
      let lo = -1, hi = -1;
      for (let i = 0; i < rawPath.length; i++) {
        if (rawPath[i].isLand || rawPath[i].isBeach) { lo = i; break; }
      }
      for (let i = rawPath.length - 1; i >= 0; i--) {
        if (rawPath[i].isLand || rawPath[i].isBeach) { hi = i; break; }
      }
      if (lo < 0 || hi <= lo) continue;
      const path = rawPath.slice(lo, hi + 1);
      // Need at least one water cell in the middle for this to read as a bridge.
      const hasWater = path.some(c => c.isWater);
      if (!hasWater) continue;

      for (const cell of path) {
        const k = `${cell.x},${cell.z}`;
        if (cell.isWater) bridgeCells.add(k);
        roadCells.add(k);
      }
      const deckY = SEA_LEVEL + 0.8;
      const points: [number, number, number][] = path.map(c => {
        const y = c.isWater ? deckY : Math.max(c.height, deckY);
        return [c.x, y, c.z];
      });
      roads.push({ id: `canal_bridge_${canalBridgeIdx++}`, tier: 'bridge', points });
      bridgeRoads.push(path);
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

  // Forts belong on commanding ground — a ridge, hilltop, or coastal
  // headland — not jammed against the urban core. Historical references:
  // Tower of London (riverside bluff, east of the medieval city), Castelo
  // de São Jorge (highest hill above Lisbon), Castillo del Morro (peninsula
  // guarding Havana's harbor), Fort Jesus (headland at Mombasa), São Paulo
  // (escarpment above Malacca).
  //
  // The score below prefers:
  //   • medium distance from center (~0.5 of the port footprint radius),
  //     so the fort reads as "overlooking" the city rather than "in" it;
  //   • elevated cells (real height above sea level);
  //   • local prominence — cells that rise above their neighborhood;
  //   • coastal adjacency — a waterside headland is better than an inland
  //     hill for a harbor-guarding fort, unless the site has strong
  //     prominence on its own.
  //
  // On dual-bank maps with a bridge, still prefer the opposite bank from
  // dock 0 so the avenue must cross the bridge.
  const fortPreferBank = dualBank && bridgeRoads.length > 0 ? bankB : -1;
  const radiusWorld = gridRadius * cellSize;

  const hasNearWater = (c: Cell): boolean => {
    for (const [dx, dz] of NEIGHBORS) {
      const n = gridMap.get(`${c.x + dx * cellSize},${c.z + dz * cellSize}`);
      if (n && (n.isWater || n.isBeach)) return true;
    }
    return false;
  };

  const localProminence = (c: Cell): number => {
    let sum = 0;
    let count = 0;
    for (let dr = -3; dr <= 3; dr++) {
      for (let dc = -3; dc <= 3; dc++) {
        if (dr === 0 && dc === 0) continue;
        const n = gridMap.get(`${c.x + dc * cellSize},${c.z + dr * cellSize}`);
        if (n && (n.isLand || n.isBeach)) {
          sum += n.height;
          count += 1;
        }
      }
    }
    if (count === 0) return 0;
    return Math.max(0, c.height - sum / count);
  };

  const fortScore = (c: Cell): number => {
    const normDist = c.distToCenter / radiusWorld;
    // Parabolic preference centered on 0.5 * footprint radius.
    const distScore = -Math.abs(normDist - 0.5) * 3.0;
    const elevScore = Math.max(0, c.height - SEA_LEVEL) * 0.35;
    const prominence = localProminence(c) * 0.8;
    const coastalBonus = hasNearWater(c) ? 0.9 : 0;
    // Lower score = better in findSpot's ascending sort.
    return -(distScore + elevScore + prominence + coastalBonus);
  };

  for (let i = 0; i < counts.fort; i++) {
    let spot = fortPreferBank >= 0
      ? findSpot(
          c => c.isLand && c.bank === fortPreferBank,
          BUILDING_SIZES.fort,
          (a, b) => fortScore(a) - fortScore(b),
        )
      : null;
    if (!spot) {
      spot = findSpot(
        c => c.isLand && (!dualBank || majorBanks.has(c.bank)),
        BUILDING_SIZES.fort,
        (a, b) => fortScore(a) - fortScore(b),
      );
    }
    if (spot) {
      // Face the fort toward the port centre so the gate/flag point inward.
      const toCenter = Math.atan2(portX - spot.x, portZ - spot.z);
      buildings.push({
        id: `fort_${i}`, type: 'fort',
        position: [spot.x, spot.height, spot.z],
        rotation: toCenter, scale: BUILDING_SIZES.fort,
      });
      anchorCells.push({ type: 'fort', cell: spot, idx: i });
    }
  }

  // ── 2b. Named landmark (Tower of London, etc.) ────────────────────────────
  // Captured here (not inside the conditional) so the spiritual placer below
  // can see it even when no landmark is present.
  let landmarkCell: Cell | null = null;
  // Some ports carry a single unique landmark with a specific geographic
  // identity that the generic fort loop can't honour. The Tower of London
  // sits east of the medieval city walls on the north bank of the Thames —
  // not wherever the fort happens to score well. Each landmark here gets
  // an explicit directional/bank rule; all others continue to render
  // adjacent to the generic fort (legacy path).
  if (landmarkId) {
    interface LandmarkRule {
      /** Offset from port center as fraction of footprint radius: +x=east, +z=south. */
      offset: [number, number];
      /** Preferred bank relative to the dock's bank ('same' or 'opposite'). */
      bank?: 'same' | 'opposite';
      /** Prefer cells adjacent to water (harbor / river edge). */
      coastal?: boolean;
      /** Footprint size for grid reservation. */
      size: [number, number, number];
      /** Strong preference for elevated / prominent ground. */
      elevated?: boolean;
    }

    // Per-landmark placement rules — each tries to honour the real-world
    // position of the monument relative to its city center. Directions use
    // world coords (+x east, +z south); archetype openDirection already
    // orients the terrain so these read correctly relative to the harbor.
    const LANDMARK_RULES: Record<string, LandmarkRule> = {
      // Tower of London — NE of the medieval city, north bank of the Thames.
      // London openDirection 'E' (Thames flows E-W through the map).
      'tower-of-london':     { offset: [ 0.55, -0.25], bank: 'same', coastal: true,  size: [10, 4, 10] },

      // Torre de Belém — far west of Lisbon, directly on the Tagus.
      // Lisbon openDirection 'W'; downstream/seaward sits west of centre.
      'belem-tower':         { offset: [-0.55,  0.05], coastal: true,  size: [6, 4, 6] },

      // Oude Kerk — De Wallen, central-north of Amsterdam near the IJ harbor.
      // Amsterdam openDirection 'N'.
      'oude-kerk-spire':     { offset: [ 0.05, -0.2 ], size: [6, 4, 9] },

      // La Giralda — central Seville, east bank of the Guadalquivir.
      // Seville openDirection 'S' (river flows N→S).
      'giralda-tower':       { offset: [ 0.15,  0.05], size: [6, 4, 6] },

      // Bom Jesus Basilica — central Velha Goa, inland on north bank of Mandovi.
      // Goa openDirection 'W'; basilica is inland from the river.
      'bom-jesus-basilica':  { offset: [ 0.1 , -0.05], size: [8, 4, 11] },

      // Fort Jesus — NE headland of Mombasa Old Town, guarding harbor mouth.
      // Mombasa openDirection 'E'.
      'fort-jesus':          { offset: [ 0.55, -0.2 ], coastal: true,  size: [10, 4, 10] },

      // Tali Temple gopuram — inland, south-east of central Calicut.
      // Calicut openDirection 'W' (sea to west).
      'calicut-gopuram':     { offset: [ 0.2 ,  0.15], size: [8, 4, 8] },

      // Al-Shadhili mosque — central Mocha, slightly inland from the harbor.
      // Mocha openDirection 'S'.
      'al-shadhili-mosque':  { offset: [ 0.0 , -0.15], size: [8, 4, 8] },

      // Mesjid Agung Banten — central, slightly inland from the harbor.
      // Bantam openDirection 'N'.
      'grand-mosque-tiered': { offset: [ 0.0 ,  0.15], size: [10, 4, 10] },

      // Diu fortress — east tip of Diu island, long coastal wall.
      // Diu openDirection 'S'.
      'diu-fortress':        { offset: [ 0.55,  0.1 ], coastal: true,  size: [8, 4, 18] },

      // São Jorge da Mina — promontory south of Elmina town, seaward.
      // Elmina openDirection 'S'.
      'elmina-castle':       { offset: [ 0.0 ,  0.5 ], coastal: true, elevated: true, size: [12, 4, 12] },

      // Jesuit College — Salvador upper city (Pelourinho), east of the bay.
      // Salvador openDirection 'W'.
      'jesuit-college':      { offset: [ 0.25, -0.05], elevated: true, size: [14, 4, 8] },

      // Palace of the Inquisition — central Cartagena on the Plaza de Bolívar.
      // Cartagena openDirection 'W'.
      'palacio-inquisicion': { offset: [ 0.05,  0.05], size: [12, 4, 8] },

      // Colégio de São Paulo — uphill of the Macau peninsula, Jesuit
      // educational complex founded 1594. Macau openDirection 'S'.
      'colegio-sao-paulo':   { offset: [ 0.05, -0.3 ], elevated: true, size: [10, 4, 10] },

      // English East India Company Factory — riverside trading compound
      // on the Tapti. Established 1612, literally the game year.
      // Surat openDirection 'W'.
      'english-factory-surat': { offset: [ 0.3 ,  0.1 ], coastal: true, size: [10, 4, 10] },
    };

    const rule = LANDMARK_RULES[landmarkId];
    if (rule) {
      const radiusW = gridRadius * cellSize;
      const targetX = portX + rule.offset[0] * radiusW;
      const targetZ = portZ + rule.offset[1] * radiusW;
      const dockBank = dockCells[0]?.bank ?? -1;
      const preferredLandmarkBank = rule.bank === 'opposite'
        ? (dockBank === bankA ? bankB : bankA)
        : dockBank;

      const landmarkScore = (c: Cell): number => {
        const dx = c.x - targetX;
        const dz = c.z - targetZ;
        const dist = Math.sqrt(dx * dx + dz * dz);
        const bankPenalty = (dualBank && preferredLandmarkBank >= 0 && c.bank !== preferredLandmarkBank) ? 40 : 0;
        const coastalPenalty = (rule.coastal && !hasNearWater(c)) ? 12 : 0;
        const elevBonus = Math.max(0, (c.height - SEA_LEVEL) * (rule.elevated ? 1.2 : 0.4));
        return dist + bankPenalty + coastalPenalty - elevBonus;
      };

      const spot = findSpot(
        c => c.isLand,
        rule.size,
        (a, b) => landmarkScore(a) - landmarkScore(b),
      );
      if (spot) {
        const faceCity = Math.atan2(portX - spot.x, portZ - spot.z);
        buildings.push({
          id: `landmark_${landmarkId}`,
          type: 'landmark',
          position: [spot.x, spot.height, spot.z],
          rotation: faceCity,
          scale: rule.size,
          landmarkId,
        });
        anchorCells.push({ type: 'landmark', cell: spot, idx: 99 });
        landmarkCell = spot;
      }
    }
  }

  // ── 2c. Spiritual buildings (churches, mosques, temples, pagodas, shrines) ──
  // One per faith listed for the port (up to 3). Each lands in a clearing
  // created by the 8×8 reserved footprint plus findSpot's +1 occupancy pad.
  // Preferences: inland over coastal, elevated, away from other spiritual
  // buildings (each faith should read as its own precinct). The first faith
  // gets the most prominent, central-ish spot; later ones push outward.
  //
  // Some landmarks are themselves religious buildings (Bom Jesus, Oude Kerk,
  // Al-Shadhili, etc.). When the port's landmark already represents a faith
  // on the port's faith list, we drop that faith from the generic spiritual
  // loop so the port doesn't end up with two churches / two mosques / etc.
  const LANDMARK_FAITH: Record<string, string> = {
    'bom-jesus-basilica':  'catholic',
    'oude-kerk-spire':     'protestant',
    'giralda-tower':       'catholic',
    'al-shadhili-mosque':  'sunni',
    'grand-mosque-tiered': 'sunni',
    'calicut-gopuram':     'hindu',
    'jesuit-college':      'catholic',
    'palacio-inquisicion': 'catholic',
  };
  const landmarkFaith = landmarkId ? LANDMARK_FAITH[landmarkId] : undefined;
  const spiritualFaiths = landmarkFaith
    ? faiths.filter(f => f !== landmarkFaith)
    : faiths;
  const maxSpiritual = scale === 'Small' ? Math.min(1, spiritualFaiths.length)
                     : scale === 'Medium' ? Math.min(2, spiritualFaiths.length)
                     : Math.min(3, spiritualFaiths.length);
  const placedSpiritualCells: Cell[] = [];
  // Seed with the landmark site when it's a religious building — keeps
  // generic spirituals from clustering on top of the anchor church/mosque.
  if (landmarkCell && landmarkFaith) placedSpiritualCells.push(landmarkCell);
  for (let si = 0; si < maxSpiritual; si++) {
    const faith = spiritualFaiths[si];
    // First faith sits closer to the centre; subsequent ones prefer mid-to-
    // outer rings so faiths don't pile on top of each other.
    const idealRadiusFraction = si === 0 ? 0.25 : si === 1 ? 0.45 : 0.6;
    const idealDist = gridRadius * cellSize * idealRadiusFraction;

    const spiritualScore = (c: Cell): number => {
      const distFromIdeal = Math.abs(c.distToCenter - idealDist);
      let score = distFromIdeal;
      // Prefer inland: penalise coastal-adjacent cells for this building
      // class (spiritual sites usually sit back from the working waterfront).
      if (hasNearWater(c)) score += 18;
      // Elevation bonus
      score -= Math.max(0, (c.height - SEA_LEVEL)) * 0.6;
      // Distance from other spiritual buildings — each faith should stand apart.
      for (const prev of placedSpiritualCells) {
        const dsq = (c.x - prev.x) ** 2 + (c.z - prev.z) ** 2;
        if (dsq < 18 * 18) score += (18 * 18 - dsq) * 0.02;
      }
      return score;
    };

    const spot = findSpot(
      c => c.isLand,
      BUILDING_SIZES.spiritual,
      (a, b) => spiritualScore(a) - spiritualScore(b),
    );
    if (!spot) continue;

    const faceCity = Math.atan2(portX - spot.x, portZ - spot.z);
    buildings.push({
      id: `spiritual_${si}_${faith}`,
      type: 'spiritual',
      position: [spot.x, spot.height, spot.z],
      rotation: faceCity,
      scale: BUILDING_SIZES.spiritual,
      faith,
    });
    anchorCells.push({ type: 'spiritual', cell: spot, idx: si });
    placedSpiritualCells.push(spot);
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
    const order: Record<BuildingType, number> = {
      market: 0, plaza: 0, spiritual: 0, landmark: 1, fort: 1,
      warehouse: 2, estate: 3, dock: 4, house: 5, farmhouse: 6, shack: 7,
    };
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

  // Paths: build a network by teeing off existing roads at midpoints AND
  // endpoints, with a mix of outskirts and interior targets. This is what
  // turns a radial spoke pattern into a medieval-style tangled street grid —
  // crucial for big cities to stop reading as "random scatter".
  let pathsBuilt = 0;
  let pathFailures = 0;
  const maxPathFailures = Math.max(5, Math.round(roadCounts.paths * 1.2));
  const interiorBias = PATH_INTERIOR_BIAS[scale];

  while (pathsBuilt < roadCounts.paths) {
    const layoutTarget = pickPathTarget(grid, prng, {
      innerRing,
      outerRing,
      interiorBias,
      avoid: usedAnchorKeys,
      avoidRadius: 8,
    });
    if (!layoutTarget) break;
    // pickPathTarget returns a narrow LayoutCell view — look the full Cell
    // back up from gridMap so A* has the height/water/bank fields it needs.
    const target = gridMap.get(`${layoutTarget.x},${layoutTarget.z}`);
    if (!target) break;

    // Origin: mostly tee off existing roads at midpoints so we build a
    // network, not radial spokes. Falls back to dock if no road exists.
    const origin = pickPathOrigin(roads, prng, { midpointProbability: 0.65 });
    let start: Cell | null = null;
    if (origin) start = snap(origin[0], origin[1]);
    if (!start) {
      const pool = [...roadEndpoints(), ...(dockAnchor ? [dockAnchor] : [])];
      start = pool.length > 0 ? (nearestOf(target, pool) ?? dockAnchor) : dockAnchor;
    }
    if (!start) break;

    const added = tryAddRoad('path', `path_${pathsBuilt}`, start, target, pathOpts, 1);
    if (!added) {
      pathFailures++;
      if (pathFailures > maxPathFailures) break;
      continue;
    }
    pathsBuilt++;
    // Record the new path's points as "used" so subsequent targets spread out.
    for (const p of added.points) {
      usedAnchorKeys.add(`${Math.round(p[0])},${Math.round(p[2])}`);
    }
  }

  // ── 3b. Plazas ─────────────────────────────────────────────────────────────
  // Open squares sited at road junctions and landmark cues. Placed AFTER the
  // road network (so we can find junctions) but BEFORE houses (so their
  // footprint reserves a chunk of the grid that houses won't fill in).
  const plazaCount = counts.plaza;
  if (plazaCount > 0 && roads.length > 0) {
    // Build a quick lookup: how many distinct roads touch each rounded
    // world-space cell? Cells with 2+ roads are junctions and make the best
    // plaza seeds — that's where people actually gather.
    const junctionScore = new Map<string, number>();
    const junctionCell  = new Map<string, Cell>();
    const plazaTagSeen  = new Set<string>();
    const bump = (p: [number, number, number], roadId: string) => {
      const c = snap(p[0], p[2]);
      if (!c || !c.isLand) return;
      const k = `${c.x},${c.z}`;
      const tag = `${k}:${roadId}`;
      if (plazaTagSeen.has(tag)) return;
      plazaTagSeen.add(tag);
      junctionScore.set(k, (junctionScore.get(k) ?? 0) + 1);
      junctionCell.set(k, c);
    };
    for (const r of roads) {
      if (r.tier === 'bridge') continue;
      // Only sample every ~3rd point so we don't over-score ribbon segments.
      for (let i = 0; i < r.points.length; i += 3) bump(r.points[i], r.id);
      // Always sample endpoints so anchor meets are captured.
      if (r.points.length > 0) bump(r.points[0], r.id);
      if (r.points.length > 1) bump(r.points[r.points.length - 1], r.id);
    }

    const plazaFootprint = PLAZA_FOOTPRINT[scale];
    const plazaRadiusCells = Math.ceil(plazaFootprint[0] / cellSize / 2);
    const tryReservePlaza = (seed: Cell): Cell | null => {
      // Walk outward in a small spiral from the seed until we find a cell
      // whose full footprint is unoccupied and roughly flat. We tolerate
      // overlap with road cells (plazas sit astride streets) but reject
      // existing buildings.
      for (let ring = 0; ring <= 4; ring++) {
        for (let dz = -ring; dz <= ring; dz++) {
          for (let dx = -ring; dx <= ring; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
            const center = gridMap.get(`${seed.x + dx * cellSize},${seed.z + dz * cellSize}`);
            if (!center || !center.isLand) continue;
            let ok = true;
            let sumH = 0;
            let nH = 0;
            for (let rr = -plazaRadiusCells; rr <= plazaRadiusCells && ok; rr++) {
              for (let cc = -plazaRadiusCells; cc <= plazaRadiusCells && ok; cc++) {
                const ch = gridMap.get(`${center.x + cc * cellSize},${center.z + rr * cellSize}`);
                if (!ch || !ch.isLand) { ok = false; break; }
                if (ch.occupied && !roadCells.has(`${ch.x},${ch.z}`)) { ok = false; break; }
                if (Math.abs(ch.height - center.height) > 1.0) { ok = false; break; }
                sumH += ch.height;
                nH++;
              }
            }
            if (!ok || nH === 0) continue;
            // Reserve the footprint (keep road cells as road cells, just
            // mark them occupied so houses don't pack onto the plaza edge).
            for (let rr = -plazaRadiusCells; rr <= plazaRadiusCells; rr++) {
              for (let cc = -plazaRadiusCells; cc <= plazaRadiusCells; cc++) {
                const ch = gridMap.get(`${center.x + cc * cellSize},${center.z + rr * cellSize}`);
                if (ch) ch.occupied = true;
              }
            }
            return { ...center, height: sumH / nH };
          }
        }
      }
      return null;
    };

    // Rank junction candidates: junction score first, then proximity to the
    // market (plazas are civic centres, not estate courtyards).
    const marketCell = market?.cell;
    const candidates = [...junctionScore.entries()]
      .map(([k, score]) => ({ k, score, cell: junctionCell.get(k)! }))
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (!marketCell) return 0;
        const da = (a.cell.x - marketCell.x) ** 2 + (a.cell.z - marketCell.z) ** 2;
        const db = (b.cell.x - marketCell.x) ** 2 + (b.cell.z - marketCell.z) ** 2;
        return da - db;
      });

    // Find the strongest road tangent near a world-space point so the plaza
    // can align its directional props (paifang arch, iberian cross axis) to
    // the main approach. Prefer higher-tier roads; within a road, sample the
    // segment midpoint closest to the seed.
    const tierWeight: Record<RoadTier, number> = { bridge: 0, path: 1, road: 2, avenue: 3 };
    const tangentAtSeed = (sx: number, sz: number): number => {
      let best: { w: number; angle: number; d2: number } | null = null;
      for (const r of roads) {
        const w = tierWeight[r.tier];
        if (w === 0) continue;
        for (let i = 0; i < r.points.length - 1; i++) {
          const [x0, , z0] = r.points[i];
          const [x1, , z1] = r.points[i + 1];
          const mx = (x0 + x1) / 2;
          const mz = (z0 + z1) / 2;
          const d2 = (mx - sx) ** 2 + (mz - sz) ** 2;
          const angle = Math.atan2(x1 - x0, z1 - z0);
          if (!best || w > best.w || (w === best.w && d2 < best.d2)) {
            best = { w, angle, d2 };
          }
        }
      }
      return best ? best.angle : 0;
    };

    let plazasPlaced = 0;
    const minPlazaSep = 14; // keep plazas visually distinct
    const placedPlazas: Cell[] = [];
    for (const cand of candidates) {
      if (plazasPlaced >= plazaCount) break;
      const tooClose = placedPlazas.some(p =>
        Math.hypot(p.x - cand.cell.x, p.z - cand.cell.z) < minPlazaSep,
      );
      if (tooClose) continue;
      const placed = tryReservePlaza(cand.cell);
      if (!placed) continue;
      placedPlazas.push(placed);
      buildings.push({
        id: `plaza_${plazasPlaced}`,
        type: 'plaza',
        position: [placed.x, placed.height, placed.z],
        rotation: tangentAtSeed(placed.x, placed.z),
        scale: plazaFootprint,
      });
      plazasPlaced++;
    }
  }

  // ── 4. Place houses, constrained to cells near roads ───────────────────────
  // Precompute road-adjacency anchors (both sides of each road, spaced ~3.5u).
  // Build anchors grouped by tier so we can place avenue frontages first
  // (shoulder-to-shoulder street wall) before path-anchors back-fill gaps.
  const anchorsByTier: Record<'avenue' | 'road' | 'path', RoadAnchor[]> = {
    avenue: [], road: [], path: [],
  };
  for (const r of roads) {
    if (r.tier === 'bridge') continue;
    // Houses cluster more heavily on avenues & roads than on paths. Tighter
    // spacing on the main street tiers produces continuous frontage walls;
    // paths keep looser spacing so alleys read as open space. Offsets match
    // the wider road tiers so frontages sit just off the kerb, not in it.
    const spacing = r.tier === 'avenue' ? 3.2 : r.tier === 'road' ? 3.2 : 4.2;
    const offset  = r.tier === 'avenue' ? 5.0 : r.tier === 'road' ? 3.7 : 3.0;
    const bucket = anchorsByTier[r.tier as 'avenue' | 'road' | 'path'];
    bucket.push(...sampleRoadAnchors(r, spacing, offset));
  }
  // Shuffle within each tier — preserves tier ordering but randomizes which
  // sides/slots get filled first so repeated roads don't always fill left-first.
  const shuffleInPlace = <T,>(arr: T[]) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(prng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  };
  shuffleInPlace(anchorsByTier.avenue);
  shuffleInPlace(anchorsByTier.road);
  shuffleInPlace(anchorsByTier.path);
  const houseAnchors: RoadAnchor[] = [
    ...anchorsByTier.avenue,
    ...anchorsByTier.road,
    ...anchorsByTier.path,
  ];

  // Big-city urban cores get chunkier house footprints near the centre. This
  // grows both the grid reservation and the stored scale, so the denser
  // core feels crowded and the taller Phase B storey counts have a plot
  // worth sitting on. Outer rings stay at the baseline size so fringe/fields
  // don't balloon with a city's size.
  const houseBaseSizeForCell = (cellDistToCenter: number): [number, number, number] => {
    const base = BUILDING_SIZES.house;
    if (scale === 'Small' || scale === 'Medium' || scale === 'Large') return base;
    const radiusWorld = gridRadius * cellSize;
    const centrality = Math.max(0, Math.min(1, 1 - cellDistToCenter / (radiusWorld * 0.72)));
    const maxGrowth = scale === 'Huge' ? 0.58 : 0.42;
    const factor = 1 + centrality * maxGrowth;
    return [base[0] * factor, base[1], base[2] * factor];
  };

  const tryPlaceAtAnchor = (
    anchor: RoadAnchor,
    type: BuildingType,
    id: string,
  ): boolean => {
    const cell = snap(anchor.x, anchor.z);
    if (!cell || !cell.isLand || cell.occupied) return false;
    let size = type === 'house'
      ? houseBaseSizeForCell(cell.distToCenter)
      : BUILDING_SIZES[type];

    // Avenue frontage = slender rowhouses. Narrower front, slightly taller,
    // slightly deeper. Footprint stays within the grid cell so the standard
    // full-footprint occupancy check below guarantees neighbours can't
    // overlap — flush (zero padding) is the densest they can get.
    if (type === 'house' && anchor.tier === 'avenue') {
      size = [size[0] * 0.85, size[1] * 1.15, size[2] * 1.1];
    }

    // Full footprint check — no overlap between any two houses, regardless
    // of tier. This is the hard guarantee against clipping roofs.
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
    // Avenue rowhouses reserve only their footprint (pad=0) so neighbours
    // can stand flush; road/path houses keep the 1-cell breathing buffer so
    // alleys read as breathing alleys rather than continuous walls.
    const pad = anchor.tier === 'avenue' ? 0 : 1;
    for (let r = -radiusZ - pad; r <= radiusZ + pad; r++) {
      for (let c = -radiusX - pad; c <= radiusX + pad; c++) {
        const check = gridMap.get(`${cell.x + c * cellSize},${cell.z + r * cellSize}`);
        if (check) check.occupied = true;
      }
    }
    // Less jitter on higher-tier roads — avenues are the frontage wall and
    // must read as a continuous row, paths can kink freely.
    const jitter = anchor.tier === 'avenue' ? 0.03
                 : anchor.tier === 'road'   ? 0.07
                 : 0.18;
    buildings.push({
      id,
      type,
      position: [cell.x, avgHeight / count, cell.z],
      rotation: anchor.rot + (prng() - 0.5) * jitter,
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
    // Use a representative size up-front for the occupancy-check radius;
    // we reassign the per-cell size after a spot is chosen so the stored
    // scale matches the cell's centrality (same rule as tryPlaceAtAnchor).
    const probeSize = houseBaseSizeForCell(0);
    const spot = findSpot(
      c => c.isLand,
      probeSize,
      (a, b) => (a.distToCenter + (houseJitter.get(`${a.x},${a.z}`) ?? 0))
              - (b.distToCenter + (houseJitter.get(`${b.x},${b.z}`) ?? 0)),
    );
    if (!spot) break;
    const size = houseBaseSizeForCell(spot.distToCenter);
    buildings.push({
      id: `house_${houseIdx}`, type: 'house',
      position: [spot.x, spot.height, spot.z],
      rotation: prng() * Math.PI, scale: size,
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
      { faith: b.faith, landmarkId: b.landmarkId },
    );
    b.label = result.label;
    b.labelSub = result.sub;

    // Semantic class → eyebrow + color. Shared source of truth with the
    // renderer; see src/utils/semanticClasses.ts.
    const semClass = buildingSemanticClass(b);
    if (semClass) {
      const style = SEMANTIC_STYLE[semClass];
      b.labelEyebrow = style.eyebrow;
      b.labelEyebrowColor = style.color;
    }
  }

  // ── 8. District tags ───────────────────────────────────────────────────────
  // Each building carries a district tag derived from the field model + its
  // type. Phase B uses this to vary building form (stories, setback, etc.).
  for (const b of buildings) {
    b.district = classifyBuildingDistrict(b, portX, portZ, scale, roads, buildings);
  }

  // ── 9. District boundary pruning ───────────────────────────────────────────
  // Drop buildings that sit on the seam between districts so clusters read as
  // distinct neighborhoods separated by road or gap, not mashed into each
  // other. Skipped on Small ports (districts mostly don't apply) and on Very
  // Large / Huge ports where gaps worsen the "scattered" read that Phase C
  // will address via archetype-specific road skeletons.
  const shouldPrune = scale === 'Medium' || scale === 'Large';
  const prunedBuildings = shouldPrune
    ? pruneDistrictBoundaries(buildings, prng, { minCoherence: 0.4, dropProbability: 0.55 })
    : buildings;

  // ── 10. Building form metadata ─────────────────────────────────────────────
  // Stories, housing class, and setback per building. Renderer reads these to
  // vary massing — urban-core tall townhouses vs elite walled estates vs
  // long-low waterside sheds.
  assignBuildingForms(prunedBuildings, portX, portZ, scale, roads);

  return { buildings: prunedBuildings, roads };
}
