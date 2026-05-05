/**
 * hinterland.ts — Outlying rural buildings (farmsteads, cottages, hamlets)
 *
 * Scatters buildings in a ring beyond the dense port grid. These live in the
 * same `port.buildings` array and are rendered by the usual pipeline, but
 * their placement rules are far looser: fertility-driven, gentle slope,
 * minimum spacing from everything (port core included), no road requirement.
 *
 * Hamlets are small clusters of 2-4 shacks around a shared centroid — a bit
 * of structure in the otherwise sparse countryside.
 */

import type { Building, PortScale, Road } from '../store/gameStore';
import { getTerrainData, getTerrainHeight } from './terrain';
import { SEA_LEVEL } from '../constants/world';

function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Building sizes used for hinterland (match cityGenerator)
const SIZE: Record<'farmhouse' | 'shack', [number, number, number]> = {
  farmhouse: [4, 3, 4],
  shack: [2.5, 2, 2.5],
};

// How many hinterland buildings to place per port scale (inclusive of hamlet shacks)
const COUNT_BY_SCALE: Record<PortScale, number> = {
  'Small': 6,
  'Medium': 10,
  'Large': 14,
  'Very Large': 18,
  'Huge': 22,
};

// Hamlet clusters: how many, and how many shacks per cluster
const HAMLETS_BY_SCALE: Record<PortScale, number> = {
  'Small': 1,
  'Medium': 1,
  'Large': 2,
  'Very Large': 2,
  'Huge': 3,
};

// Grid radius of the port core — drawn from cityGenerator constants.
// Duplicated here to avoid importing cityGenerator internals; keep in sync if
// those numbers shift.
const GRID_RADIUS: Record<PortScale, number> = {
  'Small': 24, 'Medium': 35, 'Large': 50, 'Very Large': 66, 'Huge': 82,
};
const CELL_SIZE = 2;

// Spacing requirements
const MIN_SPACING_FROM_CORE = 15;      // min world units past the core edge
const MAX_DISTANCE_FACTOR = 2.6;       // max = this × core edge
const MIN_SPACING_BETWEEN = 14;        // min distance between hinterland buildings
const MIN_SPACING_FROM_EXISTING = 10;  // min distance to any existing port building
const HAMLET_INTERNAL_SPACING = 6;     // shack-to-shack within a hamlet

function isGoodRuralSpot(x: number, z: number, minMoisture: number): {
  ok: boolean; height: number; slope: number; moisture: number;
} {
  const t = getTerrainData(x, z);
  if (t.height < SEA_LEVEL + 0.6) return { ok: false, height: t.height, slope: t.slope, moisture: t.moisture };
  if (t.slope > 0.35) return { ok: false, height: t.height, slope: t.slope, moisture: t.moisture };
  if (t.coastFactor > 0.22) return { ok: false, height: t.height, slope: t.slope, moisture: t.moisture };
  if (t.moisture < minMoisture) return { ok: false, height: t.height, slope: t.slope, moisture: t.moisture };
  return { ok: true, height: t.height, slope: t.slope, moisture: t.moisture };
}

function isShackSpot(x: number, z: number): { ok: boolean; height: number } {
  const t = getTerrainData(x, z);
  // Beach or coastal flat
  if (t.height < SEA_LEVEL + 0.3) return { ok: false, height: t.height };
  if (t.slope > 0.45) return { ok: false, height: t.height };
  const onBeach = t.coastFactor > 0.22 || t.height < SEA_LEVEL + 2.2;
  if (!onBeach) return { ok: false, height: t.height };
  return { ok: true, height: t.height };
}

function dist2(ax: number, az: number, bx: number, bz: number): number {
  return (ax - bx) ** 2 + (az - bz) ** 2;
}

function tooClose(x: number, z: number, placed: Building[], minDist: number): boolean {
  const m2 = minDist * minDist;
  for (const b of placed) {
    if (dist2(x, z, b.position[0], b.position[2]) < m2) return true;
  }
  return false;
}

/**
 * Place a single building by rejection-sampling in an angular sector.
 * Returns null if no spot satisfied constraints within maxAttempts.
 */
function samplePlacement(
  portX: number, portZ: number,
  rMin: number, rMax: number,
  isValid: (x: number, z: number) => { ok: boolean; height: number } | null,
  allPlaced: Building[],
  minBetween: number,
  rng: () => number,
  maxAttempts = 30,
  angleRange?: [number, number], // restrict to an angular wedge (hamlet seed)
): { x: number; z: number; height: number } | null {
  for (let i = 0; i < maxAttempts; i++) {
    const angle = angleRange
      ? angleRange[0] + rng() * (angleRange[1] - angleRange[0])
      : rng() * Math.PI * 2;
    const r = rMin + rng() * (rMax - rMin);
    const x = portX + Math.cos(angle) * r;
    const z = portZ + Math.sin(angle) * r;
    const check = isValid(x, z);
    if (!check || !check.ok) continue;
    if (tooClose(x, z, allPlaced, minBetween)) continue;
    return { x, z, height: check.height };
  }
  return null;
}

export interface HinterlandOptions {
  /** Minimum clearance from existing (urban) buildings. Defaults to MIN_SPACING_FROM_EXISTING. */
  minSpacingFromExisting?: number;
}

/**
 * Generate hinterland buildings and the farm tracks that connect them.
 *
 * Tracks are only emitted when a straight (or lightly-kinked) polyline from
 * the building's representative point to the nearest existing road stays on
 * walkable land. Routes that can't be validated are silently dropped — those
 * hamlets end up with only local wanderers, no commuters.
 */
export function generateHinterland(
  portX: number,
  portZ: number,
  scale: PortScale,
  seed: number,
  existingBuildings: Building[],
  existingRoads: Road[],
  opts: HinterlandOptions = {},
): { buildings: Building[]; roads: Road[] } {
  const rng = mulberry32(seed * 97 + 3313);
  const minExisting = opts.minSpacingFromExisting ?? MIN_SPACING_FROM_EXISTING;

  const coreEdge = GRID_RADIUS[scale] * CELL_SIZE;
  const rMin = coreEdge + MIN_SPACING_FROM_CORE;
  const rMax = coreEdge * MAX_DISTANCE_FACTOR;

  const totalTarget = COUNT_BY_SCALE[scale];
  const hamletTarget = HAMLETS_BY_SCALE[scale];

  const placed: Building[] = [];
  // Representative points that should each get their own track to port.
  // Hamlets contribute only their seed (first shack); solo farms/shacks
  // contribute themselves.
  const trackHeads: { x: number; z: number; id: string }[] = [];

  // Combined spacing check against both existing port buildings and newly placed.
  const validOpen = (minMoisture: number) => (x: number, z: number) => {
    const check = isGoodRuralSpot(x, z, minMoisture);
    if (!check.ok) return null;
    if (tooClose(x, z, existingBuildings, minExisting)) return null;
    return check;
  };
  const validShack = () => (x: number, z: number) => {
    const check = isShackSpot(x, z);
    if (!check.ok) return null;
    if (tooClose(x, z, existingBuildings, minExisting)) return null;
    return check;
  };

  // ── 1. Hamlet clusters (2-4 shacks around a seed point) ─────────────────
  let hamletShackCount = 0;
  for (let h = 0; h < hamletTarget; h++) {
    const seedSpot = samplePlacement(
      portX, portZ, rMin, rMax,
      validOpen(0.3),
      placed,
      MIN_SPACING_BETWEEN,
      rng,
    );
    if (!seedSpot) continue;

    const shacksInHamlet = 2 + Math.floor(rng() * 3); // 2-4
    const hamletId = `hl_shack_${h}_0`;
    let headPlaced = false;
    for (let s = 0; s < shacksInHamlet; s++) {
      const ang = rng() * Math.PI * 2;
      const dist = HAMLET_INTERNAL_SPACING + rng() * 4;
      const x = seedSpot.x + Math.cos(ang) * dist;
      const z = seedSpot.z + Math.sin(ang) * dist;
      const t = getTerrainData(x, z);
      if (t.height < SEA_LEVEL + 0.4 || t.slope > 0.4) continue;
      if (tooClose(x, z, existingBuildings, minExisting)) continue;
      if (tooClose(x, z, placed, HAMLET_INTERNAL_SPACING - 1)) continue;
      placed.push({
        id: `hl_shack_${h}_${s}`,
        type: 'shack',
        position: [x, Math.max(t.height, SEA_LEVEL + 0.4), z],
        rotation: rng() * Math.PI,
        scale: SIZE.shack,
        housingClass: 'poor',
      });
      hamletShackCount++;
      if (!headPlaced) {
        trackHeads.push({ x, z, id: hamletId });
        headPlaced = true;
      }
    }
  }

  // ── 2. Scattered farmsteads (remainder of budget) ───────────────────────
  const remaining = Math.max(0, totalTarget - hamletShackCount);
  const farmTarget = Math.ceil(remaining * 0.75);
  const soloShackTarget = remaining - farmTarget;

  for (let i = 0; i < farmTarget; i++) {
    const spot = samplePlacement(
      portX, portZ, rMin, rMax,
      validOpen(0.45),
      placed,
      MIN_SPACING_BETWEEN,
      rng,
    );
    if (!spot) continue;
    const id = `hl_farm_${i}`;
    placed.push({
      id,
      type: 'farmhouse',
      position: [spot.x, spot.height, spot.z],
      rotation: rng() * Math.PI,
      scale: SIZE.farmhouse,
      housingClass: 'common',
    });
    trackHeads.push({ x: spot.x, z: spot.z, id });
  }

  // ── 3. Solo shacks (coastal cottages, woodcutter huts) ──────────────────
  for (let i = 0; i < soloShackTarget; i++) {
    // Mix: half coastal (shack spot), half inland (good rural spot).
    const useBeach = rng() < 0.5;
    const validator = useBeach ? validShack() : validOpen(0.3);
    const spot = samplePlacement(
      portX, portZ, rMin, rMax,
      validator,
      placed,
      MIN_SPACING_BETWEEN,
      rng,
    );
    if (!spot) continue;
    const id = `hl_solo_${i}`;
    placed.push({
      id,
      type: 'shack',
      position: [spot.x, Math.max(spot.height, SEA_LEVEL + 0.4), spot.z],
      rotation: rng() * Math.PI,
      scale: SIZE.shack,
      housingClass: 'poor',
    });
    trackHeads.push({ x: spot.x, z: spot.z, id });
  }

  const roads = buildFarmTracks(trackHeads, existingRoads, portX, portZ);
  return { buildings: placed, roads };
}

// ── Farm-track road generation ──────────────────────────────────────────────

/** Strip walkability check: sample points along a segment. */
function isStripWalkable(
  ax: number, az: number, bx: number, bz: number,
  step = 3,
): boolean {
  const len = Math.sqrt((bx - ax) ** 2 + (bz - az) ** 2);
  const steps = Math.max(2, Math.ceil(len / step));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = ax + (bx - ax) * t;
    const z = az + (bz - az) * t;
    const td = getTerrainData(x, z);
    if (td.height < SEA_LEVEL + 0.35) return false;
    if (td.slope > 0.55) return false;
  }
  return true;
}

/** Find the closest point on any existing road polyline to (x, z). */
function nearestRoadSnap(
  x: number, z: number,
  roads: Road[],
): { x: number; z: number; dist: number } | null {
  let best: { x: number; z: number; dist: number } | null = null;
  for (const road of roads) {
    const pts = road.points;
    for (let i = 0; i < pts.length - 1; i++) {
      const ax = pts[i][0], az = pts[i][2];
      const bx = pts[i + 1][0], bz = pts[i + 1][2];
      const dx = bx - ax, dz = bz - az;
      const segLen2 = dx * dx + dz * dz;
      if (segLen2 < 1e-6) continue;
      let t = ((x - ax) * dx + (z - az) * dz) / segLen2;
      if (t < 0) t = 0; else if (t > 1) t = 1;
      const sx = ax + dx * t;
      const sz = az + dz * t;
      const d = Math.sqrt((x - sx) ** 2 + (z - sz) ** 2);
      if (!best || d < best.dist) best = { x: sx, z: sz, dist: d };
    }
  }
  return best;
}

/** Sample a polyline at regular intervals and resolve Y from terrain. */
function polylineToPoints3D(line: [number, number][], step = 3): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (let i = 0; i < line.length - 1; i++) {
    const [ax, az] = line[i];
    const [bx, bz] = line[i + 1];
    const len = Math.sqrt((bx - ax) ** 2 + (bz - az) ** 2);
    const steps = Math.max(1, Math.ceil(len / step));
    for (let k = 0; k < steps; k++) {
      const t = k / steps;
      const x = ax + (bx - ax) * t;
      const z = az + (bz - az) * t;
      const y = getTerrainHeight(x, z);
      out.push([x, y, z]);
    }
  }
  // Final endpoint
  const [fx, fz] = line[line.length - 1];
  out.push([fx, getTerrainHeight(fx, fz), fz]);
  return out;
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Produce a meandering polyline from (ax,az) to (bx,bz) using a sine-wave
 * envelope (tapers to zero at endpoints so the track lines up with the
 * building and the trunk road cleanly), plus a small per-point jitter.
 *
 * Returns null if any intermediate segment crosses water or steep terrain.
 */
function meanderingPath(
  ax: number, az: number,
  bx: number, bz: number,
  seed: number,
  amplitude: number,
  waves: number,
  segmentLen = 10,
): [number, number][] | null {
  const dx = bx - ax;
  const dz = bz - az;
  const len = Math.sqrt(dx * dx + dz * dz);
  if (len < 1e-3) return null;

  const steps = Math.max(3, Math.ceil(len / segmentLen));
  const perpX = -dz / len;
  const perpZ = dx / len;

  const rng = mulberry32(seed);
  const phase = rng() * Math.PI * 2;
  const jitterScale = 1.5;

  const pts: [number, number][] = [[ax, az]];
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const baseX = ax + dx * t;
    const baseZ = az + dz * t;
    // Tapered envelope: zero at both endpoints, peak at midpoint.
    const envelope = Math.sin(t * Math.PI);
    const meander = Math.sin(t * Math.PI * 2 * waves + phase) * amplitude * envelope;
    const jitterX = (rng() - 0.5) * jitterScale * envelope;
    const jitterZ = (rng() - 0.5) * jitterScale * envelope;
    pts.push([
      baseX + perpX * meander + jitterX,
      baseZ + perpZ * meander + jitterZ,
    ]);
  }
  pts.push([bx, bz]);

  // Validate every segment
  for (let i = 0; i < pts.length - 1; i++) {
    if (!isStripWalkable(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1])) {
      return null;
    }
  }
  return pts;
}

function buildFarmTracks(
  heads: { x: number; z: number; id: string }[],
  existingRoads: Road[],
  portX: number,
  portZ: number,
): Road[] {
  const out: Road[] = [];
  if (existingRoads.length === 0) return out;

  // Route the nearest heads first so later heads can snap onto the tracks we
  // just generated. This yields branching tree structures instead of a fan of
  // straight radials from the port center.
  const sorted = [...heads].sort((a, b) => {
    const da = (a.x - portX) ** 2 + (a.z - portZ) ** 2;
    const db = (b.x - portX) ** 2 + (b.z - portZ) ** 2;
    return da - db;
  });

  // Growing road set — each accepted track is added so subsequent heads can
  // snap onto it.
  const allRoads: Road[] = [...existingRoads];

  for (const head of sorted) {
    const snap = nearestRoadSnap(head.x, head.z, allRoads);
    if (!snap) continue;
    // Already basically on a road — skip. (Rare.)
    if (snap.dist < 4) continue;

    // Seed the meander from the head's id so the same port always produces
    // the same track shapes across reloads.
    const baseSeed = hashString(head.id);

    // Try progressively calmer meanders until one validates. Amplitude scales
    // with track length so short tracks don't flail and long tracks feel
    // organic.
    const straightLen = Math.sqrt((snap.x - head.x) ** 2 + (snap.z - head.z) ** 2);
    const attempts: Array<{ amp: number; waves: number }> = [
      { amp: Math.min(10, straightLen * 0.18), waves: 1.2 },
      { amp: Math.min(7,  straightLen * 0.12), waves: 1.5 },
      { amp: Math.min(5,  straightLen * 0.08), waves: 0.8 },
      { amp: Math.min(3,  straightLen * 0.05), waves: 0.6 },
      { amp: 0,                                 waves: 0   }, // last resort: straight
    ];

    let waypoints: [number, number][] | null = null;
    for (let i = 0; i < attempts.length; i++) {
      const { amp, waves } = attempts[i];
      if (amp === 0) {
        // Straight-line last-resort
        if (isStripWalkable(head.x, head.z, snap.x, snap.z)) {
          waypoints = [[head.x, head.z], [snap.x, snap.z]];
          break;
        }
      } else {
        waypoints = meanderingPath(
          head.x, head.z, snap.x, snap.z,
          baseSeed + i * 7919,
          amp, waves,
        );
        if (waypoints) break;
      }
    }
    if (!waypoints) continue;

    // Nudge the initial point slightly toward the snap so the track
    // terminates just outside the building footprint.
    const inwardDX = waypoints[1][0] - waypoints[0][0];
    const inwardDZ = waypoints[1][1] - waypoints[0][1];
    const inwardLen = Math.sqrt(inwardDX * inwardDX + inwardDZ * inwardDZ);
    if (inwardLen > 1e-3) {
      waypoints[0][0] = head.x + (inwardDX / inwardLen) * 2.5;
      waypoints[0][1] = head.z + (inwardDZ / inwardLen) * 2.5;
    }

    const road: Road = {
      id: `farm_track_${head.id}`,
      tier: 'path',
      points: polylineToPoints3D(waypoints, 2.5),
    };
    out.push(road);
    allRoads.push(road);
  }

  return out;
}
