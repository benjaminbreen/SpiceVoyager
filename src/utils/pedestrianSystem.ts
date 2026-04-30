/**
 * pedestrianSystem.ts — Procedural pedestrian simulation
 *
 * Generates walking corridors between buildings and manages pedestrian slots
 * that lerp along them. No pathfinding, no collision, no AI — just organic
 * movement patterns driven by building layout and time of day.
 */

import { Building, BuildingType, Culture, CulturalRegion, Nationality, Road } from '../store/gameStore';
import { getLandCharacter } from './landCharacter';
import { getTerrainHeight } from './terrain';
import { buildRoadSurfaceIndex, getGroundHeight, RoadSurfaceIndex } from './roadSurface';
import { SEA_LEVEL } from '../constants/world';
import { gunfireAlerts } from './combatState';
import { placeHinterlandScenes, getSceneLoadout, SceneInstance } from './hinterlandScenes';
import { getGivenName } from './buildingLabels';

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
  /** Id of the residential building this corridor terminates at (if any).
   *  Pedestrians walking this corridor are assumed to live there, so they
   *  inherit the building's familyName and get a given name. Hub-to-hub
   *  corridors leave this undefined — those walkers stay anonymous. */
  homeBuildingId?: string;
  /** Important public destination at either end of the route. Pedestrians on
   *  these corridors linger longer and can be surfaced in building/POI modals. */
  attractorBuildingId?: string;
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
  // Dwell behavior — NPCs pause at corridor endpoints / wander targets
  dwellUntil: number;       // world time until which the ped is idle
  isDwelling: boolean;      // derived flag set each update (renderer reads)
  // Home anchor for wander behavior. Defaults to the port center with a
  // generous radius, but rural wanderers attached to outlying farms/hamlets
  // use their building's position and a small radius so they don't drift into
  // the urban core.
  homeX: number;
  homeZ: number;
  wanderRadius: number;
  // Panic — set when a gunshot is heard nearby. While panicking, the ped
  // abandons its corridor/wander behavior and flees along (panicFleeX, Z).
  panicUntil: number;
  panicFleeX: number;
  panicFleeZ: number;
  // Set true when the pedestrian is killed by a projectile.
  dead: boolean;
  // Identity — set at init for peds with a home building (corridor walkers
  // whose corridor terminates at a residence + hinterland wanderers anchored
  // to a farmstead/shack). Wanderers and scene NPCs leave these undefined.
  homeBuildingId?: string;
  givenName?: string;
  familyName?: string;
  attractorBuildingId?: string;
}

export interface PedestrianSystemState {
  corridors: Corridor[];
  pedestrians: Pedestrian[];
  maxActive: number;        // max pedestrians for this port size
  culture: Culture;
  portX: number;
  portZ: number;
  roadIndex: RoadSurfaceIndex; // bucketed road segments for ground-height queries
  scenes: SceneInstance[];  // hinterland gatherings (fire rings, brazier mats, etc.)
  // Scene NPCs sit at the front of the pedestrians array and are ALWAYS active,
  // regardless of time-of-day density. Without this floor, night-only scenes
  // (shepherds' fire, shrine lamp) would render their prop with nobody around.
  sceneNpcCount: number;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Walkable if terrain is above sea level, OR if the point is on a bridge deck
 * (or other lifted road surface that bridges a low patch). The road index is
 * passed in so corridor generation (which runs before the
 * PedestrianSystemState is finalized) can use the same rule.
 */
function isWalkable(x: number, z: number, roadIndex?: RoadSurfaceIndex): boolean {
  return getGroundHeight(x, z, roadIndex) > SEA_LEVEL + 0.3;
}

function distSq(ax: number, az: number, bx: number, bz: number) {
  return (ax - bx) ** 2 + (az - bz) ** 2;
}

// How far to offset corridor endpoints from building centers
// so pedestrians walk *outside* buildings, not through them
const BUILDING_CLEARANCE: Record<BuildingType, number> = {
  dock: 4, warehouse: 4, market: 5, fort: 8, landmark: 8, palace: 7,
  estate: 5, house: 2.5, shack: 2, farmhouse: 3, plaza: 5,
  spiritual: 5,
};

// ── Building type → pedestrian type mapping ─────────────────────────────────

function pedestrianTypeForBuilding(b: Building): PedestrianType {
  const t = b.type;
  if (t === 'dock') return 'sailor';
  if (t === 'warehouse') return 'laborer';
  if (t === 'market') return 'merchant';
  if (t === 'spiritual') return 'religious';
  if (t === 'landmark' && b.labelEyebrow?.toLowerCase() === 'religious') return 'religious';
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

function validateWaypoints(waypoints: [number, number][], roadIndex?: RoadSurfaceIndex): boolean {
  for (let i = 0; i < waypoints.length - 1; i++) {
    const [ax, az] = waypoints[i];
    const [bx, bz] = waypoints[i + 1];
    const mx = (ax + bx) * 0.5;
    const mz = (az + bz) * 0.5;
    if (!isWalkable(mx, mz, roadIndex)) return false;
    const len = Math.sqrt((bx - ax) ** 2 + (bz - az) ** 2);
    if (len > 20) {
      if (!isWalkable(ax + (bx - ax) * 0.25, az + (bz - az) * 0.25, roadIndex)) return false;
      if (!isWalkable(ax + (bx - ax) * 0.75, az + (bz - az) * 0.75, roadIndex)) return false;
    }
  }
  return true;
}

function buildCorridor(
  waypoints: [number, number][],
  weight: number,
  type: PedestrianType,
  homeBuildingId?: string,
  attractorBuildingId?: string,
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
  return { waypoints, segLengths, totalLength: total, weight, type, homeBuildingId, attractorBuildingId };
}

function residentialSide(a: Building, b: Building): Building | undefined {
  const isRes = (x: Building) =>
    x.type === 'house' || x.type === 'shack' || x.type === 'estate' || x.type === 'farmhouse';
  if (isRes(a) && !isRes(b)) return a;
  if (isRes(b) && !isRes(a)) return b;
  if (isRes(a) && isRes(b)) return a;
  return undefined;
}

// ── Corridor generation ─────────────────────────────────────────────────────

// How much traffic weight each building type generates
const BUILDING_TRAFFIC: Record<BuildingType, number> = {
  dock: 1.0, warehouse: 0.8, market: 1.35, fort: 0.5, landmark: 0.85, palace: 0.75,
  estate: 0.4, house: 0.3, shack: 0.15, farmhouse: 0.25, plaza: 0.9,
  spiritual: 1.15,
};

function isAttractorBuilding(b: Building): boolean {
  return b.type === 'market' || b.type === 'spiritual' || b.type === 'landmark' ||
    b.type === 'palace' || b.type === 'fort' || !!b.poiId;
}

function corridorAttractor(a: Building, b: Building): Building | undefined {
  const aAttr = isAttractorBuilding(a);
  const bAttr = isAttractorBuilding(b);
  if (aAttr && bAttr) return BUILDING_TRAFFIC[a.type] >= BUILDING_TRAFFIC[b.type] ? a : b;
  if (aAttr) return a;
  if (bAttr) return b;
  return undefined;
}

/**
 * Compute a corridor endpoint offset from building center.
 * Places the point at the building edge, in the direction of the other building.
 * Also ensures the point is on walkable land.
 */
function corridorEndpoint(
  bx: number, bz: number, // building center
  tx: number, tz: number, // target building center
  clearance: number,
  roadIndex?: RoadSurfaceIndex,
): [number, number] {
  const dx = tx - bx;
  const dz = tz - bz;
  const len = Math.sqrt(dx * dx + dz * dz);
  if (len < 0.1) return [bx, bz];
  // Offset from building center toward the other building
  const ox = bx + (dx / len) * clearance;
  const oz = bz + (dz / len) * clearance;
  // If this lands in water (and not a bridge), pull it back toward center
  if (!isWalkable(ox, oz, roadIndex)) return [bx, bz];
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
function generateCorridors(buildings: Building[], rng: () => number, roads?: Road[], roadIndex?: RoadSurfaceIndex): Corridor[] {
  const corridors: Corridor[] = [];
  const seen = new Set<string>();

  const addCorridor = (a: Building, b: Building, weight: number) => {
    const key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
    if (seen.has(key)) return;
    seen.add(key);

    // Offset endpoints to building edges
    const clearA = BUILDING_CLEARANCE[a.type] ?? 2.5;
    const clearB = BUILDING_CLEARANCE[b.type] ?? 2.5;
    const [ax, az] = corridorEndpoint(a.position[0], a.position[2], b.position[0], b.position[2], clearA, roadIndex);
    const [bx, bz] = corridorEndpoint(b.position[0], b.position[2], a.position[0], a.position[2], clearB, roadIndex);

    // Determine dominant pedestrian type from the higher-traffic endpoint
    const aTraffic = BUILDING_TRAFFIC[a.type];
    const bTraffic = BUILDING_TRAFFIC[b.type];
    const dominant = aTraffic >= bTraffic ? a : b;
    const type = pedestrianTypeForBuilding(dominant);

    const home = residentialSide(a, b)?.id;
    const attractor = corridorAttractor(a, b)?.id;

    // Try a road-following path first; it gets a weight bonus because roads
    // are visually the "right" place for foot traffic.
    const roadPath = tryRoadAwarePath(ax, az, bx, bz, roads);
    if (roadPath && validateWaypoints(roadPath, roadIndex)) {
      const c = buildCorridor(roadPath, weight * 1.3, type, home, attractor);
      if (c) { corridors.push(c); return; }
    }

    // Fallback: straight corridor from building edge to building edge.
    const straight: [number, number][] = [[ax, az], [bx, bz]];
    if (!validateWaypoints(straight, roadIndex)) return;
    const c = buildCorridor(straight, weight, type, home, attractor);
    if (c) corridors.push(c);
  };

  // Sort buildings into categories
  const hubs: Building[] = [];  // docks, markets, warehouses
  const homes: Building[] = []; // houses, shacks, estates
  const farms: Building[] = []; // farmhouses

  for (const b of buildings) {
    if (b.type === 'dock' || b.type === 'market' || b.type === 'warehouse' || isAttractorBuilding(b)) hubs.push(b);
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
  nationality?: Nationality,
  region?: CulturalRegion,
): PedestrianSystemState {
  const rng = mulberry32(seed * 13 + 9901);
  const roadIndex = buildRoadSurfaceIndex(roads);
  const corridors = generateCorridors(buildings, rng, roads, roadIndex);
  const maxActive = MAX_PEDESTRIANS_BY_SCALE[portScale] ?? 60;
  // Building lookup so corridor walkers can read their home building's
  // family name without scanning the whole array per ped.
  const buildingById = new Map<string, Building>();
  for (const b of buildings) buildingById.set(b.id, b);

  const assignIdentity = (p: Pedestrian, building: Building | undefined) => {
    if (!building?.familyName) return;
    p.homeBuildingId = building.id;
    p.familyName = building.familyName;
    p.givenName = getGivenName(culture, p.figureType, rng, nationality, region);
  };

  // Pre-compute total corridor weight for weighted selection
  const totalWeight = corridors.reduce((sum, c) => sum + c.weight, 0);

  // Create all pedestrian slots
  const pedestrians: Pedestrian[] = [];

  // ── Hinterland scenes (spawn FIRST so they sit at the front of the array) ──
  // These NPCs are always active regardless of time-of-day density, so they
  // need to be at indices 0..sceneNpcCount-1 where the update/render loops
  // are guaranteed to reach them even at 3am density (~0.02).
  const scenes = placeHinterlandScenes(portX, portZ, culture, buildings, seed);
  let sceneNpcCount = 0;
  for (const scene of scenes) {
    const loadout = getSceneLoadout(scene.kind);
    for (const slot of loadout) {
      const a = rng() * Math.PI * 2;
      const r = 1.5 + rng() * 1.2;
      const wx = scene.x + Math.cos(a) * r;
      const wz = scene.z + Math.sin(a) * r;
      const h = getTerrainHeight(wx, wz);
      if (h < SEA_LEVEL + 0.3) continue;

      const ta = rng() * Math.PI * 2;
      const tr = 1.2 + rng() * 1.3;
      pedestrians.push({
        corridorIdx: -1,
        progress: 0,
        // Slow pace — these are loiterers, not commuters.
        speed: 0.15 + rng() * 0.1,
        direction: 1,
        type: slot.type,
        figureType: slot.figure,
        phase: rng() * Math.PI * 2,
        wobbleAmp: 0,
        x: wx, y: Math.max(h, SEA_LEVEL + 0.3), z: wz,
        angle: rng() * Math.PI * 2,
        wanderTargetX: scene.x + Math.cos(ta) * tr,
        wanderTargetZ: scene.z + Math.sin(ta) * tr,
        wanderSeed: Math.floor(rng() * 100000),
        dwellUntil: 0,
        isDwelling: false,
        homeX: scene.x,
        homeZ: scene.z,
        // 12 is a compromise: findWalkableLandPoint picks 5–18 away, so a
        // radius much smaller than that triggers the 15-unit drift-back on
        // every target pick and the NPC ends up ping-ponging far from home.
        // At 12, enough picks land inside the radius that NPCs settle into
        // a visible cluster around the scene prop.
        wanderRadius: 12,
        panicUntil: 0,
        panicFleeX: 0,
        panicFleeZ: 0,
        dead: false,
      });
      sceneNpcCount++;
    }
  }

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
          const walker = makeCorridorWalker(ci, corridors[ci], rng, portX, portZ);
          pedestrians.push(walker);
          assignIdentity(walker, buildingById.get(corridors[ci].homeBuildingId ?? ''));
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
        dwellUntil: 0,
        isDwelling: false,
        homeX: portX,
        homeZ: portZ,
        wanderRadius: 65,
        panicUntil: 0,
        panicFleeX: 0,
        panicFleeZ: 0,
        dead: false,
      });
    } else {
      // Weighted corridor selection — busier corridors get more pedestrians
      let r = rng() * totalWeight;
      let ci = 0;
      for (; ci < corridors.length - 1; ci++) {
        r -= corridors[ci].weight;
        if (r <= 0) break;
      }
      const walker = makeCorridorWalker(ci, corridors[ci], rng, portX, portZ);
      pedestrians.push(walker);
      assignIdentity(walker, buildingById.get(corridors[ci].homeBuildingId ?? ''));
    }
  }

  // ── Hinterland wanderers ────────────────────────────────────────────────
  // For each building far from the port core, spawn 1-2 local wanderers
  // anchored to the building with a small wander radius. These make hamlets
  // and farmsteads feel inhabited without relying on corridors that would
  // otherwise fail validation over long distances.
  const OUTLYING_MIN_DIST = 80;
  let hinterlandAdded = 0;
  for (const b of buildings) {
    const bx = b.position[0], bz = b.position[2];
    const d2 = (bx - portX) ** 2 + (bz - portZ) ** 2;
    if (d2 < OUTLYING_MIN_DIST * OUTLYING_MIN_DIST) continue;
    // Only residential/work buildings get local wanderers.
    if (b.type !== 'farmhouse' && b.type !== 'shack' && b.type !== 'house') continue;

    const localCount = 1 + Math.floor(rng() * 2); // 1-2
    for (let n = 0; n < localCount; n++) {
      // Sample a walkable starting point near the building
      const pt = findWalkableLandPoint(bx, bz, 2, 12, rng);
      if (!pt) continue;
      const [wx, wz] = pt;
      const h = getTerrainHeight(wx, wz);

      const type: PedestrianType = pedestrianTypeForBuilding(b);
      const ft = pickFigureType(rng);
      const target = findWalkableLandPoint(wx, wz, 3, 10, rng) ?? [wx, wz];

      const hinterlandPed: Pedestrian = {
        corridorIdx: -1,
        progress: 0,
        speed: (ft === 'child' ? 0.22 : 0.28) + rng() * 0.2, // rural pace: a touch slower
        direction: 1,
        type,
        figureType: ft,
        phase: rng() * Math.PI * 2,
        wobbleAmp: 0,
        x: wx, y: Math.max(h, SEA_LEVEL + 0.3), z: wz,
        angle: rng() * Math.PI * 2,
        wanderTargetX: target[0],
        wanderTargetZ: target[1],
        wanderSeed: Math.floor(rng() * 100000),
        dwellUntil: 0,
        isDwelling: false,
        homeX: bx,
        homeZ: bz,
        wanderRadius: 18,
        panicUntil: 0,
        panicFleeX: 0,
        panicFleeZ: 0,
        dead: false,
      };
      pedestrians.push(hinterlandPed);
      assignIdentity(hinterlandPed, b);
      hinterlandAdded++;
    }
  }
  // Include hinterland + scene NPCs in the active budget so they also scale
  // with the time-of-day density curve (fields empty at 3am, populated at noon).
  // Scene NPCs additionally get a hard floor in updatePedestrians so they're
  // never squeezed out by low density at night.
  const effectiveMaxActive = maxActive + hinterlandAdded + sceneNpcCount;

  return {
    corridors, pedestrians, maxActive: effectiveMaxActive,
    culture, portX, portZ, roadIndex, scenes, sceneNpcCount,
  };
}

function makeCorridorWalker(ci: number, corridor: Corridor, rng: () => number, portX: number, portZ: number): Pedestrian {
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
    dwellUntil: 0,
    isDwelling: false,
    homeX: portX,
    homeZ: portZ,
    wanderRadius: 65,
    panicUntil: 0,
    panicFleeX: 0,
    panicFleeZ: 0,
    dead: false,
    attractorBuildingId: corridor.attractorBuildingId,
  };
}

// ── Per-frame update ────────────────────────────────────────────────────────

export function updatePedestrians(
  state: PedestrianSystemState,
  time: number,
  delta: number,
  hourOfDay: number,
): number {
  const { corridors, pedestrians, maxActive, roadIndex, sceneNpcCount } = state;
  const density = getCrowdDensity(hourOfDay);
  // Scene NPCs (at the front of the array) are exempt from the density curve —
  // without this floor, night-only scenes render their prop with nobody around.
  const activeCount = Math.max(1, sceneNpcCount, Math.floor(maxActive * density));

  // Clamp delta to avoid huge jumps when tab is backgrounded
  const dt = Math.min(delta, 0.1);

  const nowMs = Date.now();

  for (let i = 0; i < activeCount; i++) {
    const p = pedestrians[i];
    if (p.dead) continue; // position preserved at death coords; live buffer handles collision exclusion

    // ── Gunfire scatter ────────────────────────────────────────────────
    // Any active alert within its hearing radius triggers (or extends) a
    // panic. While panicking, the ped abandons its corridor or wander target
    // and runs away from the loudest nearby alert.
    if (gunfireAlerts.length > 0) {
      const wasPanicking = time < p.panicUntil;
      for (let a = 0; a < gunfireAlerts.length; a++) {
        const alert = gunfireAlerts[a];
        if (alert.expireAt < nowMs) continue;
        const adx = p.x - alert.x;
        const adz = p.z - alert.z;
        const ad2 = adx * adx + adz * adz;
        const r = alert.radius;
        if (ad2 < r * r) {
          // Fresh reaction — set a flee target directly away from the source.
          if (!wasPanicking) {
            const d = Math.sqrt(Math.max(ad2, 0.01));
            p.panicFleeX = p.x + (adx / d) * 30;
            p.panicFleeZ = p.z + (adz / d) * 30;
            // Abandon the corridor so panic-advance doesn't snap back when
            // panicUntil expires. Wanderer mode anchors them at their current
            // spot with a modest radius.
            if (p.corridorIdx >= 0) {
              p.corridorIdx = -1;
              p.homeX = p.x;
              p.homeZ = p.z;
              p.wanderRadius = 40;
              p.wanderTargetX = p.panicFleeX;
              p.wanderTargetZ = p.panicFleeZ;
            }
            if (typeof window !== 'undefined' && (window as unknown as { DEBUG_GUNFIRE?: boolean }).DEBUG_GUNFIRE) {
              console.log('[panic]', p.type, 'ped at', p.x.toFixed(1), p.z.toFixed(1), 'flees from', alert.x.toFixed(1), alert.z.toFixed(1));
            }
          }
          p.panicUntil = Math.max(p.panicUntil, time + 5 + Math.random() * 3);
          p.isDwelling = false;
          p.dwellUntil = 0;
        }
      }
    }

    if (time < p.panicUntil) {
      let dtx = p.panicFleeX - p.x;
      let dtz = p.panicFleeZ - p.z;
      let dist = Math.sqrt(dtx * dtx + dtz * dtz);
      if (dist < 2.5) {
        // Extend the flee in roughly the same direction, with a little jitter.
        const dir = Math.atan2(dtz, dtx);
        const jitter = (Math.random() - 0.5) * 0.6;
        p.panicFleeX = p.x + Math.cos(dir + jitter) * 18;
        p.panicFleeZ = p.z + Math.sin(dir + jitter) * 18;
        dtx = p.panicFleeX - p.x;
        dtz = p.panicFleeZ - p.z;
        dist = Math.sqrt(dtx * dtx + dtz * dtz) || 0.01;
      }
      // Fixed running pace — 5 units/sec reads as a visible sprint versus
      // the ~0.4 u/s normal walk.
      const moveSpeed = 5 * dt;
      const nx = p.x + (dtx / dist) * moveSpeed;
      const nz = p.z + (dtz / dist) * moveSpeed;
      const ny = getGroundHeight(nx, nz, roadIndex);
      if (ny > SEA_LEVEL + 0.3) {
        p.x = nx;
        p.z = nz;
        p.y = ny;
        p.angle = Math.atan2(dtx, dtz);
      } else {
        // Blocked by water — pick a new flee target perpendicular to the shore.
        const dir = Math.atan2(dtz, dtx) + Math.PI / 2;
        p.panicFleeX = p.x + Math.cos(dir) * 14;
        p.panicFleeZ = p.z + Math.sin(dir) * 14;
      }
      continue;
    }

    if (p.corridorIdx >= 0) {
      // ── Corridor walker ────────────────────────────────────────────
      const c = corridors[p.corridorIdx];
      if (!c || c.totalLength < 0.5) continue;

      // Dwell pause at endpoints — NPCs stop to rest/haggle/pray for 5-25s.
      if (time < p.dwellUntil) {
        p.isDwelling = true;
        continue; // skip advance and position recompute; hold pose
      }
      p.isDwelling = false;

      // Advance along the full polyline (progress is 0..1 over totalLength)
      p.progress += (p.speed * dt / c.totalLength) * p.direction;
      let reachedEnd = false;
      if (p.progress >= 1) { p.progress = 1; p.direction = -1; reachedEnd = true; }
      else if (p.progress <= 0) { p.progress = 0; p.direction = 1; reachedEnd = true; }
      if (reachedEnd) {
        p.dwellUntil = time + (p.attractorBuildingId ? 12 + Math.random() * 34 : 5 + Math.random() * 20);
      }

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
      // Road-aware: over a bridge deck the polyline Y takes over, and
      // other road tiers contribute their small yLift — so pedestrians
      // visibly stand on the road surface instead of sinking into it.
      const newY = getGroundHeight(newX, newZ, roadIndex);

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

      // Default to walking; the blocked-by-water branch flips this back on.
      p.isDwelling = false;

      if (distToTarget < 1.5) {
        // Pick a new wander target — use a stable incrementing seed, not time
        p.wanderSeed += 1;
        const targetRng = mulberry32(p.wanderSeed);
        // Try to find walkable land near current position
        const found = findWalkableLandPoint(p.x, p.z, 5, 18, targetRng);
        const rad2 = p.wanderRadius * p.wanderRadius;
        if (found) {
          // Keep target within this ped's home radius (port core or hamlet)
          const ddx = found[0] - p.homeX;
          const ddz = found[1] - p.homeZ;
          if (ddx * ddx + ddz * ddz < rad2) {
            p.wanderTargetX = found[0];
            p.wanderTargetZ = found[1];
          } else {
            // Drift back toward home
            const backAngle = Math.atan2(p.homeZ - p.z, p.homeX - p.x);
            p.wanderTargetX = p.x + Math.cos(backAngle) * 15;
            p.wanderTargetZ = p.z + Math.sin(backAngle) * 15;
          }
        } else {
          // Can't find walkable land — drift toward home
          const backAngle = Math.atan2(p.homeZ - p.z, p.homeX - p.x);
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
        const newY = getGroundHeight(newX, newZ, roadIndex);

        // Only move if destination is walkable
        if (newY > SEA_LEVEL + 0.3) {
          p.x = newX;
          p.z = newZ;
          p.y = newY;
          p.angle = Math.atan2(dtx, dtz);
        } else {
          // Hit water — immediately pick new target back toward home and
          // hold pose this frame so arms don't swing in place.
          p.wanderSeed += 1;
          const backAngle = Math.atan2(p.homeZ - p.z, p.homeX - p.x);
          p.wanderTargetX = p.x + Math.cos(backAngle) * 12;
          p.wanderTargetZ = p.z + Math.sin(backAngle) * 12;
          p.isDwelling = true;
        }
      }
    }
  }

  return activeCount;
}
