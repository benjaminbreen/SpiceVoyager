/**
 * roadTopology.ts — post-generation pass that densifies, welds, and graphs
 * a port's road network.
 *
 * Pipeline (run once at the end of city generation):
 *   densifyRoads()  →  weldAndJunction()  →  buildRoadGraph()
 *
 * Why each step:
 *   1. densify — the generator emits polylines with ~2u spacing. The ribbon
 *      mesh linearly interpolates Y between points, so on sloped terrain the
 *      ribbon floats above or dips below the true surface. Subdividing to
 *      ≤ MAX_SEG_LEN and resampling terrain Y at each insert makes the
 *      ribbon hug the ground.
 *   2. weld + junction — generator endpoints snap to a 2u grid and therefore
 *      often sit ~1–2u away from the road they were meant to tee into. For
 *      each non-bridge road endpoint we find the nearest other-road segment
 *      and either (a) merge to a shared welded point if both are endpoints
 *      near each other, or (b) insert a new vertex into the target road at
 *      the hit location (a T-junction) and snap our endpoint onto it.
 *   3. graph — walks the welded network and reports which endpoints coincide
 *      with which others and which roads pass straight through those points.
 *      Used by downstream systems (taper logic, NPC routing) and cheap to
 *      rebuild.
 *
 * All three are pure mutators / builders over Road[] — no dependency on the
 * renderer, no runtime cost.
 */

import { Road, RoadGraph, RoadGraphEdge, RoadGraphNode, RoadTier } from '../store/gameStore';
import { getTerrainHeight } from './terrain';
import { ROAD_TIER_STYLE } from './roadStyle';

// ── Tunables ────────────────────────────────────────────────────────────────

/** Target maximum segment length after densification, in world units.
 *  Smaller = tighter terrain fit but more triangles. 1.0 is a good balance
 *  for the current terrain noise scale. */
const MAX_SEG_LEN = 1.0;

/** Maximum lateral distance at which an endpoint will weld to another road.
 *  Equal to ~1 cell of the generator's snap grid (2u) plus slack. */
const WELD_TOLERANCE = 1.5;

/** If both roads' endpoints are within this distance of each other, they
 *  merge to a shared welded position (no T-vertex inserted). */
const ENDPOINT_MERGE_TOL = 0.6;

/** If the welding hit-point is within this distance of an existing vertex
 *  on the target road, don't insert a new vertex — snap onto the existing
 *  one. Keeps the target polyline from growing unnecessarily and avoids
 *  degenerate near-zero-length segments. */
const VERTEX_DEDUP_TOL = 0.3;

/** Tolerance for graph node-matching after welding. Welded positions should
 *  be identical, so this only needs to cover floating-point noise. */
const NODE_MATCH_TOL = 0.05;

// ── Densification ───────────────────────────────────────────────────────────

/**
 * Subdivide polyline segments longer than MAX_SEG_LEN, resampling terrain
 * height at each inserted point. Bridges are skipped — their polyline Y is
 * authored as a deck-height ramp and must not be overwritten by terrain.
 *
 * A small memo cache on (x, z) quantized to 0.25u keeps the noise lookups
 * from dominating — typical port densification hits the same (x, z) cell
 * repeatedly across nearby segments.
 */
export function densifyRoads(roads: Road[]): void {
  const terrainCache = new Map<number, number>();
  const quantize = (n: number) => Math.round(n * 4); // 0.25u grid
  const sampleTerrain = (x: number, z: number): number => {
    const k = (quantize(x) + 32768) * 65536 + (quantize(z) + 32768);
    const cached = terrainCache.get(k);
    if (cached !== undefined) return cached;
    const v = getTerrainHeight(x, z);
    terrainCache.set(k, v);
    return v;
  };

  for (const r of roads) {
    if (r.tier === 'bridge') continue;
    const pts = r.points;
    if (pts.length < 2) continue;
    const out: [number, number, number][] = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const dx = b[0] - a[0];
      const dz = b[2] - a[2];
      const len = Math.hypot(dx, dz);
      if (len > MAX_SEG_LEN) {
        const steps = Math.ceil(len / MAX_SEG_LEN);
        for (let s = 1; s < steps; s++) {
          const t = s / steps;
          const nx = a[0] + dx * t;
          const nz = a[2] + dz * t;
          // Pick the higher of (linear interp Y between segment endpoints,
          // terrain Y at this XZ). Pure terrain sampling — the old
          // behaviour — would slam an elevated span (e.g. a non-bridge tier
          // routed across a bridge deck via pathToRoad's lift) back down to
          // water level at every subdivision, since the underlying water
          // cell's terrain Y sits below sea level. The max preserves the
          // lift while still letting normal land roads track terrain on
          // convex crests where the surface rises above the linear chord.
          const linearY = a[1] + (b[1] - a[1]) * t;
          const ny = Math.max(linearY, sampleTerrain(nx, nz));
          out.push([nx, ny, nz]);
        }
      }
      out.push(b);
    }
    r.points = out;
  }
}

// ── Welding + T-junctions ───────────────────────────────────────────────────

interface ClosestHit {
  roadIdx: number;       // target road within the roads array
  segIdx: number;        // segment (points[segIdx] → points[segIdx+1])
  t: number;             // parametric position 0..1 along the segment
  hitX: number;
  hitY: number;
  hitZ: number;
  dist: number;          // lateral distance from endpoint to hit
  targetIsEndpoint: boolean; // closest point was within ENDPOINT_MERGE_TOL of
                              // the target segment's start or end vertex
}

/** Find the closest point on *any* other road to (ex, ez), excluding the
 *  given endpoint's own road. Returns null if nothing is within
 *  WELD_TOLERANCE. */
function findClosestOtherRoad(
  roads: Road[],
  selfRoadIdx: number,
  ex: number, ez: number,
): ClosestHit | null {
  let best: ClosestHit | null = null;

  for (let ri = 0; ri < roads.length; ri++) {
    if (ri === selfRoadIdx) continue;
    const r = roads[ri];
    const pts = r.points;
    for (let i = 0; i < pts.length - 1; i++) {
      const ax = pts[i][0], ay = pts[i][1], az = pts[i][2];
      const bx = pts[i + 1][0], by = pts[i + 1][1], bz = pts[i + 1][2];
      const dx = bx - ax;
      const dz = bz - az;
      const segLen2 = dx * dx + dz * dz;
      if (segLen2 < 1e-6) continue;
      let t = ((ex - ax) * dx + (ez - az) * dz) / segLen2;
      if (t < 0) t = 0; else if (t > 1) t = 1;
      const hx = ax + dx * t;
      const hz = az + dz * t;
      const d = Math.hypot(ex - hx, ez - hz);
      if (d > WELD_TOLERANCE) continue;
      if (best && d >= best.dist) continue;
      const hy = ay + (by - ay) * t;
      // "Target endpoint" means the hit landed near one of the segment's
      // own endpoints, meaning the two roads end close to each other and we
      // can merge both to a shared point rather than inserting a T vertex.
      const distToA = Math.hypot(hx - ax, hz - az);
      const distToB = Math.hypot(hx - bx, hz - bz);
      const atSegStart = distToA < ENDPOINT_MERGE_TOL;
      const atSegEnd = distToB < ENDPOINT_MERGE_TOL;
      // Only treat as shared-endpoint if this is actually one of the road's
      // overall endpoints (first or last point), not an interior vertex.
      const targetIsEndpoint =
        (atSegStart && i === 0) ||
        (atSegEnd && i === pts.length - 2);
      best = {
        roadIdx: ri, segIdx: i, t,
        hitX: hx, hitY: hy, hitZ: hz,
        dist: d, targetIsEndpoint,
      };
    }
  }
  return best;
}

/** Was this insertion index (hitX, hitZ) close to an existing vertex of the
 *  target road? Returns the vertex index, or -1. */
function findNearbyExistingVertex(
  road: Road, segIdx: number,
  hx: number, hz: number,
): number {
  const pts = road.points;
  const candidates = [segIdx, segIdx + 1];
  for (const i of candidates) {
    if (i < 0 || i >= pts.length) continue;
    if (Math.hypot(pts[i][0] - hx, pts[i][2] - hz) < VERTEX_DEDUP_TOL) return i;
  }
  return -1;
}

/**
 * Manifest of logical weld anchors. When a road's endpoint T-welds into
 * another road, we trim the endpoint back from the target centerline to
 * its edge so the ribbons render cleanly — but the graph still needs to
 * know the endpoint logically connects at the target's centerline. The
 * manifest records that logical position per (roadId, which).
 *
 * Keys are `${roadId}|start` or `${roadId}|end`. Only T-welded endpoints
 * appear; endpoint-merge welds don't need the manifest because both roads
 * already share the merged position in their polylines.
 */
export type WeldManifest = Map<string, [number, number, number]>;

/**
 * For each non-bridge road endpoint, weld to the nearest other road within
 * WELD_TOLERANCE. Merges endpoint-to-endpoint; inserts a T-junction vertex
 * otherwise. Mutates roads in place. Returns a manifest of T-welded
 * endpoint anchor positions for the graph builder.
 */
export function weldAndJunction(roads: Road[]): WeldManifest {
  const manifest: WeldManifest = new Map();
  // Build the list of endpoint tasks up front. Using a snapshot means later
  // mutations don't invalidate earlier task targets — each endpoint still
  // looks at the current state of every road, which is what we want.
  const tasks: { roadIdx: number; which: 'start' | 'end' }[] = [];
  for (let i = 0; i < roads.length; i++) {
    const r = roads[i];
    if (r.points.length < 2) continue;
    // Bridges have authored endpoints at terrain level on the abutments; we
    // don't move them, but paths/roads are allowed to weld *into* them.
    if (r.tier === 'bridge') continue;
    tasks.push({ roadIdx: i, which: 'start' });
    tasks.push({ roadIdx: i, which: 'end' });
  }

  for (const task of tasks) {
    const road = roads[task.roadIdx];
    const pts = road.points;
    if (pts.length < 2) continue;
    const epIdx = task.which === 'start' ? 0 : pts.length - 1;
    const ep = pts[epIdx];
    const hit = findClosestOtherRoad(roads, task.roadIdx, ep[0], ep[2]);
    if (!hit) continue;
    // If we're already effectively on it, skip — saves a spurious vertex
    // insert for endpoints that already happen to sit on another road.
    if (hit.dist < 0.05) continue;

    const target = roads[hit.roadIdx];

    // Welding X/Z together is always wanted, but Y is different: if the
    // target is a bridge (authored at BRIDGE_DECK_Y over water), snapping a
    // ground-level road's endpoint onto it produces a near-vertical ribbon
    // segment from the approach's terrain Y up to deck Y over <1 cell — a
    // thin brown "blade" piercing the bridge deck at every cross-street
    // weld. For bridge targets, snap only X/Z and let the approach keep
    // its own Y; the road then visually terminates under/at the abutment
    // with no vertical jump.
    const targetIsBridge = target.tier === 'bridge';

    if (hit.targetIsEndpoint) {
      // Both roads end near each other — merge both to a shared mid-point.
      // Averaging the two positions lets neither road "win" visually.
      // targetIsEndpoint guarantees the nearer segment vertex (t<0.5 → seg
      // start, else seg end) is one of the road's overall endpoints.
      const targetEpIdx = hit.t < 0.5 ? hit.segIdx : hit.segIdx + 1;
      const tep = target.points[targetEpIdx];
      const mx = (ep[0] + tep[0]) * 0.5;
      const mz = (ep[2] + tep[2]) * 0.5;
      if (targetIsBridge) {
        // Keep each road's own Y. Bridge abutment stays at its authored
        // height, approach stays at terrain.
        pts[epIdx] = [mx, ep[1], mz];
        target.points[targetEpIdx] = [mx, tep[1], mz];
      } else {
        const my = (ep[1] + tep[1]) * 0.5;
        pts[epIdx] = [mx, my, mz];
        target.points[targetEpIdx] = [mx, my, mz];
      }
    } else {
      // T-junction. Try to reuse an existing vertex on the target road; if
      // none is close enough, insert a new one at the hit location and
      // splice it into the polyline in the right order.
      let insertedAt = findNearbyExistingVertex(target, hit.segIdx, hit.hitX, hit.hitZ);
      if (insertedAt < 0) {
        // For bridges keep the linearly-interpolated Y because the deck and
        // its abutment ramp aren't on terrain. For land roads sample terrain
        // so the inserted vertex lines up with the welded approach endpoint
        // (which we also place at terrain Y below).
        const insertY = targetIsBridge ? hit.hitY : getTerrainHeight(hit.hitX, hit.hitZ);
        target.points.splice(hit.segIdx + 1, 0, [hit.hitX, insertY, hit.hitZ]);
        insertedAt = hit.segIdx + 1;
      }
      // Snap our endpoint onto the target T vertex, then pull it back
      // toward our own body by (targetHalfWidth - selfHalfWidth * 0.3) so
      // the narrower road visually terminates at the wider road's edge
      // rather than extending all the way to its centerline. Without this
      // trim, a road's ribbon ends stamped across half of an avenue's
      // width, producing the visible "road stub" seam where colors compete.
      const tv = target.points[insertedAt];
      // Always weld at terrain Y instead of adopting the target's
      // interpolated Y (tv[1]). Snapping the approach's last segment to
      // the target's smoothed Y used to produce a one-segment waterfall
      // wherever an approach descended a slope into a flatter cross-street.
      // For non-bridge targets terrain Y is correct directly. For bridge
      // targets the approach is meant to terminate at the abutment (terrain
      // Y at the outermost cell) or duck under the deck over water — both
      // cases match terrain Y, with the deck above hiding any submerged
      // sliver.
      const weldY = getTerrainHeight(tv[0], tv[2]);
      pts[epIdx] = [tv[0], weldY, tv[2]];
      // Record the logical anchor (target centerline) before trimming so
      // the graph can still recognise this endpoint as a T-welded junction
      // rather than a dead-end.
      manifest.set(`${road.id}|${task.which}`, [tv[0], tv[1], tv[2]]);
      const selfHalf = ROAD_TIER_STYLE[road.tier].width * 0.5;
      const targetHalf = ROAD_TIER_STYLE[target.tier].width * 0.5;
      const trim = targetHalf - selfHalf * 0.3;
      // Only trim when the target road is at least as wide as us — no need
      // to pull back an avenue that welded into a path, and negative trim
      // would push the endpoint onto the target's far edge.
      if (trim > 0 && pts.length >= 2) {
        const neighborIdx = task.which === 'start' ? 1 : pts.length - 2;
        const neighbor = pts[neighborIdx];
        const ep2 = pts[epIdx];
        const dx = neighbor[0] - ep2[0];
        const dz = neighbor[2] - ep2[2];
        const dLen = Math.hypot(dx, dz);
        if (dLen > 1e-4) {
          // Cap trim at half the distance to the neighbor so we never
          // cross or meet the previous vertex.
          const trimSafe = Math.min(trim, dLen * 0.5);
          const nx = dx / dLen;
          const nz = dz / dLen;
          const tx = ep2[0] + nx * trimSafe;
          const tz = ep2[2] + nz * trimSafe;
          // Resample Y from terrain at the trimmed position. Linearly
          // interpolating from the two prior vertices drifts above or
          // below the actual terrain surface on steep slopes near
          // junctions; a direct sample is authoritative and cheap.
          pts[epIdx] = [tx, getTerrainHeight(tx, tz), tz];
        }
      }
    }
  }
  return manifest;
}

// ── Road graph ──────────────────────────────────────────────────────────────

/**
 * Build the endpoint/T-junction graph from the welded network. Nodes are
 * distinct positions shared by one or more road endpoints and/or
 * pass-through vertices inserted during welding. Degree counts both.
 *
 * When a manifest is provided, T-welded endpoints are placed at their
 * logical anchor (the target road's centerline) rather than their
 * visually-trimmed polyline position, so the graph correctly sees them as
 * junction endpoints instead of dead-ends.
 */
export function buildRoadGraph(roads: Road[], manifest?: WeldManifest): RoadGraph {
  const nodes: RoadGraphNode[] = [];
  const edges: RoadGraphEdge[] = [];

  const findNode = (x: number, y: number, z: number): number => {
    for (let i = 0; i < nodes.length; i++) {
      const p = nodes[i].pos;
      if (Math.hypot(p[0] - x, p[2] - z) < NODE_MATCH_TOL) {
        // Match in XZ. Refresh Y toward the max seen so bridge decks win
        // over terrain-level endpoints welded to the same (x, z).
        if (y > p[1]) nodes[i].pos = [p[0], y, p[2]];
        return i;
      }
    }
    nodes.push({ pos: [x, y, z], degree: 0, tiers: [] });
    return nodes.length - 1;
  };

  const addIncidence = (nodeIdx: number, tier: RoadTier) => {
    const n = nodes[nodeIdx];
    n.degree += 1;
    if (!n.tiers.includes(tier)) n.tiers.push(tier);
  };

  // ── Endpoint nodes ────────────────────────────────────────────────────
  for (const r of roads) {
    if (r.points.length < 2) {
      edges.push({ roadId: r.id, tier: r.tier, fromNode: -1, toNode: -1 });
      continue;
    }
    const startAnchor = manifest?.get(`${r.id}|start`) ?? r.points[0];
    const endAnchor = manifest?.get(`${r.id}|end`) ?? r.points[r.points.length - 1];
    const fromNode = findNode(startAnchor[0], startAnchor[1], startAnchor[2]);
    const toNode = findNode(endAnchor[0], endAnchor[1], endAnchor[2]);
    addIncidence(fromNode, r.tier);
    addIncidence(toNode, r.tier);
    edges.push({ roadId: r.id, tier: r.tier, fromNode, toNode });
  }

  // ── Pass-through incidence ────────────────────────────────────────────
  // For each interior vertex of every road, if some other road's endpoint
  // shares that position (i.e. a T-junction was welded in), bump this
  // road's pass-through incidence on that node.
  for (const r of roads) {
    const pts = r.points;
    for (let i = 1; i < pts.length - 1; i++) {
      const p = pts[i];
      for (let n = 0; n < nodes.length; n++) {
        const np = nodes[n].pos;
        if (Math.hypot(np[0] - p[0], np[2] - p[2]) < NODE_MATCH_TOL) {
          addIncidence(n, r.tier);
          break;
        }
      }
    }
  }

  return { nodes, edges };
}

// ── Public pipeline ─────────────────────────────────────────────────────────

/**
 * Smooth interior Y values of each non-bridge road with a 3-tap moving
 * average, clamped to terrain. Welding can introduce a single segment
 * where the approach drops abruptly to the target's terrain Y; densify
 * fills in vertices but they still have a kink at the weld point because
 * the immediate neighbours bracket a sharp Y change. Averaging interior
 * Ys across one neighbour on each side spreads that kink over a few
 * segments instead of letting it render as a fall-line cliff. The clamp
 * to terrain prevents the smoothing from sinking the polyline into the
 * ground on convex slopes. Endpoints stay fixed so welds remain coherent.
 *
 * Bridges are skipped — their authored deck/abutment ramp is already
 * smooth and any further Y averaging would round off the deck plateau.
 */
function smoothRoadYs(roads: Road[]): void {
  for (const r of roads) {
    if (r.tier === 'bridge') continue;
    const pts = r.points;
    if (pts.length < 3) continue;
    const smoothed: number[] = new Array(pts.length);
    smoothed[0] = pts[0][1];
    smoothed[pts.length - 1] = pts[pts.length - 1][1];
    for (let i = 1; i < pts.length - 1; i++) {
      const a = pts[i - 1][1];
      const b = pts[i][1];
      const c = pts[i + 1][1];
      const terrainY = getTerrainHeight(pts[i][0], pts[i][2]);
      // Skip points that sit well above terrain — these are a non-bridge
      // road's deck-shared span, lifted by pathToRoad to BRIDGE_DECK_Y.
      // A 3-tap moving average mixes them with terrain-Y neighbours and
      // scallops the deck plateau down at each end (visible as a dip into
      // the canal where a road meets the bridge). Preserve them as-is.
      // The 1.0 threshold is well above natural terrain noise but well
      // below BRIDGE_DECK_Y above water level (which is several units).
      if (b - terrainY > 1.0) {
        smoothed[i] = b;
        continue;
      }
      const avg = (a + 2 * b + c) * 0.25;
      // Never push the polyline below terrain — the ribbon edge sampler
      // handles "follow the slope sideways", but the centerline still
      // needs to ride the surface or a road in a valley would tunnel
      // into the ground.
      smoothed[i] = Math.max(avg, terrainY);
    }
    for (let i = 0; i < pts.length; i++) {
      pts[i] = [pts[i][0], smoothed[i], pts[i][2]];
    }
  }
}

/**
 * Run the full post-generation pipeline on a combined road list. Mutates
 * `roads` in place (densify + weld + Y-smooth) and returns the built graph.
 *
 * Densification runs twice by design: the first pass ensures weld-hit Y
 * interpolation is accurate on short target segments; the second pass
 * handles any newly-long segment that a moved endpoint created. The
 * Y-smoothing pass runs after the second densify so it sees the final
 * vertex set and only has to redistribute residual weld-induced kinks.
 */
export function postprocessRoads(roads: Road[]): RoadGraph {
  densifyRoads(roads);
  const manifest = weldAndJunction(roads);
  densifyRoads(roads);
  smoothRoadYs(roads);
  return buildRoadGraph(roads, manifest);
}
