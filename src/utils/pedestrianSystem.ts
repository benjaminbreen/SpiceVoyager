/**
 * pedestrianSystem.ts — Procedural pedestrian simulation
 *
 * Generates walking corridors between buildings and manages pedestrian slots
 * that lerp along them. No pathfinding, no collision, no AI — just organic
 * movement patterns driven by building layout and time of day.
 */

import { Building, BuildingType, Culture, Road } from '../store/gameStore';
import { getLandCharacter } from './landCharacter';
import { getTerrainHeight } from './terrain';
import { extractBridges, getGroundHeight } from './bridgeNavigation';
import { SEA_LEVEL } from '../constants/world';

// ── Seeded PRNG ─────────────────────────────────────────────────────────────
function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Types ───────────────────────────────────────────────────────────────────

export type PedestrianType = 'merchant' | 'laborer' | 'religious' | 'sailor' | 'farmer';
export type FigureType = 'man' | 'woman' | 'child';

export interface Corridor {
  // Polyline of (x, z) waypoints. A plain straight corridor has 2 entries;
  // road-aware corridors weave through intermediate road-polyline points.
  waypoints: [number, number][];
  segLengths: number[];     // length per segment (waypoints.length - 1 entries)
  totalLength: number;
  weight: number;           // traffic importance (higher = more pedestrians assigned)
  type: PedestrianType;     // dominant pedestrian type for this corridor
}

export interface Pedestrian {
  corridorIdx: number;      // which corridor (-1 = wanderer)
  progress: number;         // 0-1 along corridor
  speed: number;            // units per second
  direction: 1 | -1;        // walking forward or back
  type: PedestrianType;
  figureType: FigureType;
  phase: number;            // animation phase offset
  wobbleAmp: number;        // perpendicular wobble amplitude
  // Current world position (updated each frame)
  x: number;
  y: number;
  z: number;
  // Facing angle
  angle: number;
  // Wanderer fields
  wanderTargetX: number;
  wanderTargetZ: number;
  wanderSeed: number;       // stable seed for picking new targets
}

export interface PedestrianSystemState {
  corridors: Corridor[];
  pedestrians: Pedestrian[];
  maxActive: number;        // max pedestrians for this port size
  culture: Culture;
  portX: number;
  portZ: number;
  bridges: Road[];          // bridge-tier roads, used for walkable deck queries
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Walkable if terrain is above sea level, OR if the point is on a bridge deck.
 * Bridges are passed in so corridor generation (which runs before the
 * PedestrianSystemState is finalized) can use the same rule.
 */
function isWalkable(x: number, z: number, bridges?: Road[]): boolean {
  return getGroundHeight(x, z, bridges) > SEA_LEVEL + 0.3;
}

function distSq(ax: number, az: number, bx: number, bz: number) {
  return (ax - bx) ** 2 + (az - bz) ** 2;
}

// How far to offset corridor endpoints from building centers
// so pedestrians walk *outside* buildings, not through them
const BUILDING_CLEARANCE: Record<BuildingType, number> = {
  dock: 4, warehouse: 4, market: 5, fort: 8,
  estate: 5, house: 2.5, shack: 2, farmhouse: 3,
};

// ── Building type → pedestrian type mapping ─────────────────────────────────

function pedestrianTypeForBuilding(b: Building): PedestrianType {
  const t = b.type;
  if (t === 'dock') return 'sailor';
  if (t === 'warehouse') return 'laborer';
  if (t === 'market') return 'merchant';
  if (t === 'farmhouse') return 'farmer';
  if (t === 'estate') return 'merchant';
  // Houses: infer from label
  const label = (b.label ?? '').toLowerCase();
  if (label.includes('shipwright') || label.includes('rope') || label.includes('sail') || label.includes('net'))
    return 'sailor';
  if (label.includes('merchant') || label.includes('goldsmith') || label.includes('apothecary') || label.includes('silk') || label.includes('spice'))
    return 'merchant';
  if (label.includes('farm') || label.includes('rice') || label.includes('coconut') || label.includes('sugar'))
    return 'farmer';
  return 'laborer';
}

// ── Road snapping ───────────────────────────────────────────────────────────

interface RoadSnap {
  segIdx: number;  // segment index on the road polyline
  t: number;       // 0..1 along that segment
  x: number;
  z: number;
  dist: number;    // distance from query point to snap
}

/** Closest point on a road polyline to (x, z), in world-space xz only. */
function nearestPointOnRoad(x: number, z: number, road: Road): RoadSnap | null {
  const pts = road.points;
  if (pts.length < 2) return null;
  let best: RoadSnap | null = null;
  for (let i = 0; i < pts.length - 1; i++) {
    const ax = pts[i][0], az = pts[i][2];
    const bx = pts[i + 1][0], bz = pts[i + 1][2];
    const dx = bx - ax;
    const dz = bz - az;
    const segLen2 = dx * dx + dz * dz;
    if (segLen2 < 1e-6) continue;
    let t = ((x - ax) * dx + (z - az) * dz) / segLen2;
    if (t < 0) t = 0; else if (t > 1) t = 1;
    const sx = ax + dx * t;
    const sz = az + dz * t;
    const d = Math.sqrt((x - sx) ** 2 + (z - sz) ** 2);
    if (!best || d < best.dist) {
      best = { segIdx: i, t, x: sx, z: sz, dist: d };
    }
  }
  return best;
}

/** Walk the road polyline from snap a to snap b, returning 2D waypoints. */
function sampleRoadBetween(road: Road, a: RoadSnap, b: RoadSnap): [number, number][] {
  const pts = road.points;
  const out: [number, number][] = [[a.x, a.z]];
  if (a.segIdx < b.segIdx) {
    for (let i = a.segIdx + 1; i <= b.segIdx; i++) out.push([pts[i][0], pts[i][2]]);
  } else if (a.segIdx > b.segIdx) {
    for (let i = a.segIdx; i > b.segIdx; i--) out.push([pts[i][0], pts[i][2]]);
  }
  out.push([b.x, b.z]);
  return out;
}

function dedupeNearby(pts: [number, number][], tol: number): [number, number][] {
  if (pts.length === 0) return pts;
  const out: [number, number][] = [pts[0]];
  const t2 = tol * tol;
  for (let i = 1; i < pts.length; i++) {
    const prev = out[out.length - 1];
    const dx = pts[i][0] - prev[0];
    const dz = pts[i][1] - prev[1];
    if (dx * dx + dz * dz > t2) out.push(pts[i]);
  }
  return out;
}

/**
 * Try to build a path from (ax,az) to (bx,bz) that snaps onto an existing road.
 * Returns null when no road gives a reasonable detour.
 * Picks the single road that minimizes total snap distance, requiring that the
 * road actually spans a meaningful fraction of the gap (otherwise we're just
 * crossing perpendicular to it).
 */
function tryRoadAwarePath(
  ax: number, az: number,
  bx: number, bz: number,
  roads: Road[] | undefined,
): [number, number][] | null {
  if (!roads || roads.length === 0) return null;
  const straightLen = Math.sqrt((bx - ax) ** 2 + (bz - az) ** 2);
  if (straightLen < 10) return null;

  const MAX_SNAP = 14;
  let bestWaypoints: [number, number][] | null = null;
  let bestScore = Infinity;

  for (const road of roads) {
    const snapA = nearestPointOnRoad(ax, az, road);
    const snapB = nearestPointOnRoad(bx, bz, road);
    if (!snapA || !snapB) continue;
    if (snapA.dist > MAX_SNAP || snapB.dist > MAX_SNAP) continue;
    const snapSpan = Math.sqrt((snapA.x - snapB.x) ** 2 + (snapA.z - snapB.z) ** 2);
    if (snapSpan < straightLen * 0.35) continue;
    const score = snapA.dist + snapB.dist;
    if (score < bestScore) {
      const mid = sampleRoadBetween(road, snapA, snapB);
      const raw: [number, number][] = [[ax, az], ...mid, [bx, bz]];
      bestWaypoints = dedupeNearby(raw, 0.5);
      bestScore = score;
    }
  }
  return bestWaypoints;
}

function validateWaypoints(waypoints: [number, number][], bridges?: Road[]): boolean {
  for (let i = 0; i < waypoints.length - 1; i++) {
    const [ax, az] = waypoints[i];
    const [bx, bz] = waypoints[i + 1];
    const mx = (ax + bx) * 0.5;
    const mz = (az + bz) * 0.5;
    if (!isWalkable(mx, mz, bridges)) return false;
    const len = Math.sqrt((bx - ax) ** 2 + (bz - az) ** 2);
    if (len > 20) {
      if (!isWalkable(ax + (bx - ax) * 0.25, az + (bz - az) * 0.25, bridges)) return false;
      if (!isWalkable(ax + (bx - ax) * 0.75, az + (bz - az) * 0.75, bridges)) return false;
    }
  }
  return true;
}

function buildCorridor(
  waypoints: [number, number][],
  weight: number,
  type: PedestrianType,
): Corridor | null {
  if (waypoints.length < 2) return null;
  const segLengths: number[] = [];
  let total = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    const dx = waypoints[i + 1][0] - waypoints[i][0];
    const dz = waypoints[i + 1][1] - waypoints[i][1];
    const len = Math.sqrt(dx * dx + dz * dz);
    segLengths.push(len);
    total += len;
  }
  if (total < 0.5) return null;
  return { waypoints, segLengths, totalLength: total, weight, type };
}

// ── Corridor generation ─────────────────────────────────────────────────────

// How much traffic weight each building type generates
const BUILDING_TRAFFIC: Record<BuildingType, number> = {
  dock: 1.0, warehouse: 0.8, market: 1.0, fort: 0.3,
  estate: 0.4, house: 0.3, shack: 0.15, farmhouse: 0.25,
};

/**
 * Compute a corridor endpoint offset from building center.
 * Places the point at the building edge, in the direction of the other building.
 * Also ensures the point is on walkable land.
 */
function corridorEndpoint(
  bx: number, bz: number, // building center
  tx: number, tz: number, // target building center
  clearance: number,
  bridges?: Road[],
): [number, number] {
  const dx = tx - bx;
  const dz = tz - bz;
  const len = Math.sqrt(dx * dx + dz * dz);
  if (len < 0.1) return [bx, bz];
  // Offset from building center toward the other building
  const ox = bx + (dx / len) * clearance;
  const oz = bz + (dz / len) * clearance;
  // If this lands in water (and not a bridge), pull it back toward center
  if (!isWalkable(ox, oz, bridges)) return [bx, bz];
  return [ox, oz];
}

/**
 * Generate corridors between buildings. Strategy:
 * - Important buildings (dock/market/warehouse) connect to nearest 2 other hubs
 * - Houses connect to nearest hub
 * - Farms connect to nearest hub
 * - Some house↔house neighborhood links
 * Endpoints are offset so pedestrians walk outside buildings.
 * Corridors that cross water are rejected.
 */
function generateCorridors(buildings: Building[], rng: () => number, roads?: Road[], bridges?: Road[]): Corridor[] {
  const corridors: Corridor[] = [];
  const seen = new Set<string>();

  const addCorridor = (a: Building, b: Building, weight: number) => {
    const key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
    if (seen.has(key)) return;
    seen.add(key);

    // Offset endpoints to building edges
    const clearA = BUILDING_CLEARANCE[a.type] ?? 2.5;
    const clearB = BUILDING_CLEARANCE[b.type] ?? 2.5;
    const [ax, az] = corridorEndpoint(a.position[0], a.position[2], b.position[0], b.position[2], clearA, bridges);
    const [bx, bz] = corridorEndpoint(b.position[0], b.position[2], a.position[0], a.position[2], clearB, bridges);

    // Determine dominant pedestrian type from the higher-traffic endpoint
    const aTraffic = BUILDING_TRAFFIC[a.type];
    const bTraffic = BUILDING_TRAFFIC[b.type];
    const dominant = aTraffic >= bTraffic ? a : b;
    const type = pedestrianTypeForBuilding(dominant);

    // Try a road-following path first; it gets a weight bonus because roads
    // are visually the "right" place for foot traffic.
    const roadPath = tryRoadAwarePath(ax, az, bx, bz, roads);
    if (roadPath && validateWaypoints(roadPath, bridges)) {
      const c = buildCorridor(roadPath, weight * 1.3, type);
      if (c) { corridors.push(c); return; }
    }

    // Fallback: straight corridor from building edge to building edge.
    const straight: [number, number][] = [[ax, az], [bx, bz]];
    if (!validateWaypoints(straight, bridges)) return;
    const c = buildCorridor(straight, weight, type);
    if (c) corridors.push(c);
  };

  // Sort buildings into categories
  const hubs: Building[] = [];  // docks, markets, warehouses
  const homes: Building[] = []; // houses, shacks, estates
  const farms: Building[] = []; // farmhouses

  for (const b of buildings) {
    if (b.type === 'dock' || b.type === 'market' || b.type === 'warehouse') hubs.push(b);
    else if (b.type === 'farmhouse') farms.push(b);
    else if (b.type !== 'fort') homes.push(b);
  }

  // Hub ↔ Hub connections (high traffic)
  for (let i = 0; i < hubs.length; i++) {
    const sorted = [...hubs]
      .filter((_, j) => j !== i)
      .sort((a, b) => distSq(hubs[i].position[0], hubs[i].position[2], a.position[0], a.position[2])
                     - distSq(hubs[i].position[0], hubs[i].position[2], b.position[0], b.position[2]));
    for (let j = 0; j < Math.min(2, sorted.length); j++) {
      addCorridor(hubs[i], sorted[j], 1.0);
    }
  }

  // Home → nearest hub (medium traffic)
  for (const home of homes) {
    if (hubs.length === 0) break;
    let nearest = hubs[0];
    let nearestDist = distSq(home.position[0], home.position[2], nearest.position[0], nearest.position[2]);
    for (let i = 1; i < hubs.length; i++) {
      const d = distSq(home.position[0], home.position[2], hubs[i].position[0], hubs[i].position[2]);
      if (d < nearestDist) { nearest = hubs[i]; nearestDist = d; }
    }
    if (nearestDist < 70 * 70) {
      addCorridor(home, nearest, 0.5);
    }
  }

  // Farm → nearest hub (low-medium traffic)
  for (const farm of farms) {
    if (hubs.length === 0) break;
    let nearest = hubs[0];
    let nearestDist = distSq(farm.position[0], farm.position[2], nearest.position[0], nearest.position[2]);
    for (let i = 1; i < hubs.length; i++) {
      const d = distSq(farm.position[0], farm.position[2], hubs[i].position[0], hubs[i].position[2]);
      if (d < nearestDist) { nearest = hubs[i]; nearestDist = d; }
    }
    if (nearestDist < 80 * 80) {
      addCorridor(farm, nearest, 0.35);
    }
  }

  // Random home ↔ home connections (~15% of homes get a neighbor link)
  for (const home of homes) {
    if (rng() > 0.15) continue;
    let nearest: Building | null = null;
    let nearestDist = Infinity;
    for (const other of homes) {
      if (other === home) continue;
      const d = distSq(home.position[0], home.position[2], other.position[0], other.position[2]);
      if (d < nearestDist && d < 25 * 25) { nearest = other; nearestDist = d; }
    }
    if (nearest) addCorridor(home, nearest, 0.2);
  }

  return corridors;
}

// ── Time-of-day crowd density ───────────────────────────────────────────────

export function getCrowdDensity(hour: number): number {
  // Bell curve peaking at noon, near-zero at 3am
  const x = (hour - 12) / 6;
  return Math.max(0.02, Math.exp(-x * x * 2));
}

// ── System initialization ───────────────────────────────────────────────────

const MAX_PEDESTRIANS_BY_SCALE: Record<string, number> = {
  'Small': 8,
  'Medium': 16,
  'Large': 28,
  'Very Large': 45,
  'Huge': 70,
};

function pickFigureType(rng: () => number): FigureType {
  const r = rng();
  // ~40% men, ~40% women, ~20% children
  if (r < 0.4) return 'man';
  if (r < 0.8) return 'woman';
  return 'child';
}

/**
 * Find a valid land position near the port for a wanderer.
 * Tries up to maxAttempts random points, returns null if all are in water.
 */
function findWalkableLandPoint(
  portX: number, portZ: number,
  minDist: number, maxDist: number,
  rng: () => number, maxAttempts = 8,
): [number, number] | null {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const angle = rng() * Math.PI * 2;
    const dist = minDist + rng() * (maxDist - minDist);
    const wx = portX + Math.cos(angle) * dist;
    const wz = portZ + Math.sin(angle) * dist;
    if (isWalkable(wx, wz)) return [wx, wz];
  }
  return null;
}

export function initPedestrianSystem(
  buildings: Building[],
  culture: Culture,
  portScale: string,
  portX: number,
  portZ: number,
  seed: number,
  roads?: Road[],
): PedestrianSystemState {
  const rng = mulberry32(seed * 13 + 9901);
  const bridges = extractBridges(roads);
  const corridors = generateCorridors(buildings, rng, roads, bridges);
  const maxActive = MAX_PEDESTRIANS_BY_SCALE[portScale] ?? 60;

  // Pre-compute total corridor weight for weighted selection
  const totalWeight = corridors.reduce((sum, c) => sum + c.weight, 0);

  // Create all pedestrian slots
  const pedestrians: Pedestrian[] = [];
  const wandererFraction = 0.1; // 10% are wanderers

  for (let i = 0; i < maxActive; i++) {
    const isWanderer = rng() < wandererFraction || corridors.length === 0;

    if (isWanderer) {
      // Pick a random land point near the port
      const pt = findWalkableLandPoint(portX, portZ, 10, 50, rng);
      if (!pt) {
        // Couldn't find walkable land — make a corridor walker instead
        if (corridors.length > 0) {
          const ci = Math.floor(rng() * corridors.length);
          pedestrians.push(makeCorridorWalker(ci, corridors[ci], rng));
          continue;
        }
        continue; // skip this slot entirely
      }

      const [wx, wz] = pt;
      const h = getTerrainHeight(wx, wz);
      const lc = getLandCharacter(wx, wz);
      let type: PedestrianType = 'laborer';
      if (lc.sanctity > 0.5) type = 'religious';
      else if (lc.fertility > 0.5) type = 'farmer';

      // Find a valid initial wander target
      const target = findWalkableLandPoint(wx, wz, 5, 15, rng) ?? [wx, wz];

      const ft = pickFigureType(rng);
      pedestrians.push({
        corridorIdx: -1,
        progress: 0,
        speed: (ft === 'child' ? 0.25 : 0.3) + rng() * 0.3, // slow wanderers, kids slower
        direction: 1,
        type,
        figureType: ft,
        phase: rng() * Math.PI * 2,
        wobbleAmp: 0, // no wobble for wanderers
        x: wx, y: Math.max(h, SEA_LEVEL + 0.3), z: wz,
        angle: rng() * Math.PI * 2,
        wanderTargetX: target[0],
        wanderTargetZ: target[1],
        wanderSeed: Math.floor(rng() * 100000),
      });
    } else {
      // Weighted corridor selection — busier corridors get more pedestrians
      let r = rng() * totalWeight;
      let ci = 0;
      for (; ci < corridors.length - 1; ci++) {
        r -= corridors[ci].weight;
        if (r <= 0) break;
      }
      pedestrians.push(makeCorridorWalker(ci, corridors[ci], rng));
    }
  }

  return { corridors, pedestrians, maxActive, culture, portX, portZ, bridges };
}

function makeCorridorWalker(ci: number, corridor: Corridor, rng: () => number): Pedestrian {
  const ft = pickFigureType(rng);
  return {
    corridorIdx: ci,
    progress: rng(),
    speed: (ft === 'child' ? 0.3 : 0.4) + rng() * 0.5,
    direction: rng() < 0.5 ? 1 : -1,
    type: corridor.type,
    figureType: ft,
    phase: rng() * Math.PI * 2,
    wobbleAmp: 0.1 + rng() * 0.2, // subtle wobble: 0.1–0.3 units
    x: 0, y: 0, z: 0,
    angle: 0,
    wanderTargetX: 0, wanderTargetZ: 0,
    wanderSeed: Math.floor(rng() * 100000),
  };
}

// ── Per-frame update ────────────────────────────────────────────────────────

export function updatePedestrians(
  state: PedestrianSystemState,
  time: number,
  delta: number,
  hourOfDay: number,
): number {
  const { corridors, pedestrians, maxActive, bridges } = state;
  const density = getCrowdDensity(hourOfDay);
  const activeCount = Math.max(1, Math.floor(maxActive * density));

  // Clamp delta to avoid huge jumps when tab is backgrounded
  const dt = Math.min(delta, 0.1);

  for (let i = 0; i < activeCount; i++) {
    const p = pedestrians[i];

    if (p.corridorIdx >= 0) {
      // ── Corridor walker ────────────────────────────────────────────
      const c = corridors[p.corridorIdx];
      if (!c || c.totalLength < 0.5) continue;

      // Advance along the full polyline (progress is 0..1 over totalLength)
      p.progress += (p.speed * dt / c.totalLength) * p.direction;
      if (p.progress >= 1) { p.progress = 2 - p.progress; p.direction = -1; }
      else if (p.progress <= 0) { p.progress = -p.progress; p.direction = 1; }
      if (p.progress < 0) p.progress = 0;
      if (p.progress > 1) p.progress = 1;

      // Find which segment the current progress lands on
      const targetDist = p.progress * c.totalLength;
      const segCount = c.segLengths.length;
      let segIdx = 0;
      let accum = 0;
      while (segIdx < segCount - 1 && accum + c.segLengths[segIdx] < targetDist) {
        accum += c.segLengths[segIdx];
        segIdx++;
      }
      const segLen = c.segLengths[segIdx];
      const localT = segLen > 1e-6 ? (targetDist - accum) / segLen : 0;

      const [sx, sz] = c.waypoints[segIdx];
      const [ex, ez] = c.waypoints[segIdx + 1];
      const cdx = ex - sx;
      const cdz = ez - sz;

      const lx = sx + cdx * localT;
      const lz = sz + cdz * localT;

      // Perpendicular wobble along the current segment
      const perpX = segLen > 1e-6 ? -cdz / segLen : 0;
      const perpZ = segLen > 1e-6 ? cdx / segLen : 0;
      const wobble = Math.sin(time * 2.5 + p.phase) * p.wobbleAmp;

      const newX = lx + perpX * wobble;
      const newZ = lz + perpZ * wobble;
      // Bridge-aware: over a deck the polyline Y takes over, so corridor
      // walkers assigned to road-aware paths that cross a bridge actually
      // walk the deck instead of hanging stuck at the abutment.
      const newY = getGroundHeight(newX, newZ, bridges);

      if (newY > SEA_LEVEL + 0.2) {
        p.x = newX;
        p.z = newZ;
        p.y = newY;
      }
      // else: hold previous position (don't walk into water)

      // Face direction of travel along this segment
      p.angle = Math.atan2(cdx * p.direction, cdz * p.direction);

    } else {
      // ── Wanderer ───────────────────────────────────────────────────
      const dtx = p.wanderTargetX - p.x;
      const dtz = p.wanderTargetZ - p.z;
      const distToTarget = Math.sqrt(dtx * dtx + dtz * dtz);

      if (distToTarget < 1.5) {
        // Pick a new wander target — use a stable incrementing seed, not time
        p.wanderSeed += 1;
        const targetRng = mulberry32(p.wanderSeed);
        // Try to find walkable land near current position
        const found = findWalkableLandPoint(p.x, p.z, 5, 18, targetRng);
        if (found) {
          // Also ensure target stays within port radius
          const ddx = found[0] - state.portX;
          const ddz = found[1] - state.portZ;
          if (ddx * ddx + ddz * ddz < 65 * 65) {
            p.wanderTargetX = found[0];
            p.wanderTargetZ = found[1];
          } else {
            // Drift back toward port center
            const backAngle = Math.atan2(state.portZ - p.z, state.portX - p.x);
            p.wanderTargetX = p.x + Math.cos(backAngle) * 15;
            p.wanderTargetZ = p.z + Math.sin(backAngle) * 15;
          }
        } else {
          // Can't find walkable land — drift toward port center
          const backAngle = Math.atan2(state.portZ - p.z, state.portX - p.x);
          p.wanderTargetX = p.x + Math.cos(backAngle) * 10;
          p.wanderTargetZ = p.z + Math.sin(backAngle) * 10;
        }
      } else {
        // Move toward target
        const moveSpeed = p.speed * dt;
        const moveX = (dtx / distToTarget) * moveSpeed;
        const moveZ = (dtz / distToTarget) * moveSpeed;
        const newX = p.x + moveX;
        const newZ = p.z + moveZ;
        const newY = getGroundHeight(newX, newZ, bridges);

        // Only move if destination is walkable
        if (newY > SEA_LEVEL + 0.3) {
          p.x = newX;
          p.z = newZ;
          p.y = newY;
          p.angle = Math.atan2(dtx, dtz);
        } else {
          // Hit water — immediately pick new target back toward land
          p.wanderSeed += 1;
          const backAngle = Math.atan2(state.portZ - p.z, state.portX - p.x);
          p.wanderTargetX = p.x + Math.cos(backAngle) * 12;
          p.wanderTargetZ = p.z + Math.sin(backAngle) * 12;
        }
      }
    }
  }

  return activeCount;
}
