// ── POI Proximity Resolution ───────────────────────────────────────────────
//
// Single source of truth for "is the player close enough to interact with a
// POI?" Used by both ship-mode and walking-mode in UI.tsx so a wreck sailed
// up to and a hinterland shrine walked up to share one detection path.
//
// Per-kind interaction radius: a 3u-wide wayside shrine and a 14u-wide
// caravanserai can't share an 8u radius — the player would be inside the
// caravanserai courtyard and still ineligible to interact. Radii here are
// XZ world units, sized to land just past the visible silhouette so the
// "Enter" affordance fires when the player is *on* or *adjacent to* the
// site rather than only at its exact center.
//
// Hover labels for non-building POIs aren't handled here (silhouettes are
// pure three.js meshes with no Building backing). When that ships it can
// raycast against the silhouette mesh — orthogonal to this radius check.

import type { Port } from '../store/gameStore';
import type { POIDefinition, POIKind } from './poiDefinitions';
import { getPOIsForPort, resolvePOIPosition } from './poiDefinitions';
import { getTerrainHeight } from './terrain';
import { SEA_LEVEL } from '../constants/world';

/**
 * XZ interaction radius per POI kind, in world units.
 *
 * Sized to ~half the silhouette's footprint so a player at the visible edge
 * of the structure is in range, and so adjacent POIs don't overlap their
 * interaction zones. If a POI kind isn't listed here, it has no proximity
 * interaction (rendered-only, e.g. atmospheric set-dressing).
 */
export const POI_INTERACTION_RADIUS_BY_KIND: Partial<Record<POIKind, number>> = {
  // Building-anchored bespoke POIs.
  shrine: 8,
  // Naturalist sites cover halls/landmarks (camera trips the landmark AABB),
  // hinterland camps (~14u plinth), and merchant compounds folded in from
  // the dropped merchant_guild kind. Use the larger camp footprint so the
  // walking detection still fires on the salt-pan edge.
  naturalist: 12,
  // Hinterland archetypes — sized to silhouette footprint.
  garden: 12,
  caravanserai: 14,
  ruin: 12,
  // Nearshore archetypes — sailed up to, not walked, so radius is generous
  // enough to catch a ship drifting alongside.
  wreck: 16,
  smugglers_cove: 12,
  // Natural features — large, distant landmarks (volcanoes, sacred peaks)
  // typically far offshore or deep in hinterland. Generous radius so a ship
  // circling the island or a walker on a viewpoint trail catches the toast.
  natural: 22,
};

export interface POIHit {
  poi: POIDefinition;
  port: Port;
  /** Squared XZ distance from the query point. Useful for tie-breaking. */
  distSq: number;
}

// ── Land / water sanity checks ─────────────────────────────────────────────
//
// Bespoke and procedural POIs both need to land on actual ground. A
// single-point sea-level check passes if the centroid is on a 1u-wide land
// sliver while the surrounding silhouette overhangs water. Multi-sample
// checks the centroid plus four cardinal samples at half the footprint, so
// the whole footprint must be on land before the POI is considered placeable.

/**
 * Per-kind footprint diameter (XZ world units) used by `isPOIOnLand` to size
 * the multi-sample radius. Sized to match the visible silhouette mass so a
 * shrine spawning on the edge of a small islet is rejected, not floated.
 */
const POI_FOOTPRINT_BY_KIND: Partial<Record<POIKind, number>> = {
  shrine: 6,
  naturalist: 12,
  garden: 12,
  caravanserai: 14,
  ruin: 12,
  // Natural features bring their own island/peak geometry, so the land-check
  // is skipped at the resolveSnappedPOI level. This footprint is unused by
  // isPOIOnLand but kept here so getPOIFootprint stays well-defined.
  natural: 24,
};

const LAND_HEIGHT_MIN = SEA_LEVEL + 0.3;

/** All five sample points (centroid + cardinal) above sea level. */
export function isPOIOnLand(x: number, z: number, footprint: number): boolean {
  const r = footprint * 0.5;
  if (getTerrainHeight(x, z) < LAND_HEIGHT_MIN) return false;
  if (getTerrainHeight(x + r, z) < LAND_HEIGHT_MIN) return false;
  if (getTerrainHeight(x - r, z) < LAND_HEIGHT_MIN) return false;
  if (getTerrainHeight(x, z + r) < LAND_HEIGHT_MIN) return false;
  if (getTerrainHeight(x, z - r) < LAND_HEIGHT_MIN) return false;
  return true;
}

export function getPOIFootprint(kind: POIKind): number {
  return POI_FOOTPRINT_BY_KIND[kind] ?? 8;
}

/**
 * Wrecks live on the boundary — too deep and the hull is invisible, too
 * shallow and they sit above water. Accept terrain in a narrow band around
 * sea level so wrecks read as "beached or grounded on a reef."
 */
export function isWreckShallow(x: number, z: number): boolean {
  const t = getTerrainHeight(x, z);
  return t > SEA_LEVEL - 4 && t < SEA_LEVEL + 0.5;
}

/**
 * Spiral-search outward from a hand-authored POI coord to the nearest cell
 * that satisfies `predicate`. Used by bespoke POIs so an authored point that
 * happens to land in water (or in the wrong wreck-depth band) snaps to a
 * valid neighbor instead of silently failing.
 *
 * Sampling pattern: 16 directions × 8 radii (0, 4, 8, 14, 22, 34, 52, 78u),
 * ranked by squared distance from the original. Returns the first valid
 * candidate in distance order, or null if the whole 78u disc is rejected
 * (in which case the authored coord is genuinely bad and the caller
 * should warn).
 */
export function snapToValidCell(
  x: number,
  z: number,
  predicate: (x: number, z: number) => boolean,
): { x: number; z: number; snapped: boolean } | null {
  if (predicate(x, z)) return { x, z, snapped: false };
  const radii = [4, 8, 14, 22, 34, 52, 78];
  const dirCount = 16;
  for (const r of radii) {
    for (let d = 0; d < dirCount; d++) {
      const angle = (d / dirCount) * Math.PI * 2;
      const cx = x + Math.cos(angle) * r;
      const cz = z + Math.sin(angle) * r;
      if (predicate(cx, cz)) return { x: cx, z: cz, snapped: true };
    }
  }
  return null;
}

// ── Unified resolved-position cache ────────────────────────────────────────
//
// Multiple subsystems consume POI positions: in-world silhouettes, cyan
// beacon pillars, the minimap, the walking proximity check. If each path
// snaps independently they can disagree — silhouette renders at A, beacon
// at B, minimap shows the raw author coord at C. The cache below computes
// the snapped position *once* per (poi.id, portSeed) and hands every
// consumer the same answer.
//
// Keyed by `${poi.id}:${portKey}` because the snap result depends on
// terrain which is procgen-driven by the world seed; the seed-stable part
// of the port shape is whatever identity ProceduralCity uses to memoize
// itself, so for now we conservatively key on `port.id` alone (the
// procgen is deterministic per session, so a single key per port is
// safe — but we expose `clearSnappedCache()` for tests / dev resets).

interface SnappedPosition {
  x: number;
  z: number;
  snapped: boolean;
  /** True iff snap returned null — caller should treat the POI as un-renderable. */
  rejected: boolean;
}

const snappedCache = new Map<string, SnappedPosition>();

export function clearSnappedCache(): void {
  snappedCache.clear();
}

/**
 * Resolve a POI's final placement position, snapping water/wrong-band
 * authored coords to the nearest valid cell. Result is memoized so repeat
 * callers (silhouettes, beacons, minimap) all agree.
 *
 * Landmark-anchored POIs are *not* snapped — they're already pinned to a
 * generated building, which is on land by definition.
 */
export function resolveSnappedPOI(
  poi: POIDefinition,
  port: { id: string; buildings: { type: string; landmarkId?: string; position: [number, number, number] }[]; pois?: POIDefinition[] },
): SnappedPosition | null {
  const key = `${poi.id}:${port.id}`;
  const hit = snappedCache.get(key);
  if (hit) return hit.rejected ? null : hit;

  const resolved = resolvePOIPosition(poi, port);
  if (!resolved) return null;

  // Landmark POIs are pinned to existing buildings — no snap needed.
  if (poi.location.kind === 'landmark') {
    const out: SnappedPosition = { x: resolved.x, z: resolved.z, snapped: false, rejected: false };
    snappedCache.set(key, out);
    return out;
  }

  // Natural features (volcanoes, etc.) bring their own island/peak geometry
  // and are intentionally placed in deep water or hinterland with no land
  // backing. Skip the snap entirely — honor the authored coord verbatim.
  if (poi.kind === 'natural') {
    const out: SnappedPosition = { x: resolved.x, z: resolved.z, snapped: false, rejected: false };
    snappedCache.set(key, out);
    return out;
  }

  const predicate = poi.kind === 'wreck'
    ? (x: number, z: number) => isWreckShallow(x, z)
    : (x: number, z: number) => isPOIOnLand(x, z, getPOIFootprint(poi.kind));
  const snap = snapToValidCell(resolved.x, resolved.z, predicate);
  if (!snap) {
    snappedCache.set(key, { x: resolved.x, z: resolved.z, snapped: false, rejected: true });
    return null;
  }
  const out: SnappedPosition = { x: snap.x, z: snap.z, snapped: snap.snapped, rejected: false };
  snappedCache.set(key, out);
  return out;
}

/**
 * Sea-level transitions along the straight line between two points. Each
 * land↔water flip is one crossing; a river or strait between port and POI
 * therefore registers as 2 (land → water → land), an island detour as 4,
 * etc. Used by procgen to bias hinterland POI placement toward sites
 * separated from the port by some natural feature so the dirt-path that
 * connects them goes over a bridge or around a headland.
 *
 * 10 samples is enough for one-river crossings up to ~260u apart without
 * missing thin streams; doubling samples didn't change placement outcomes
 * in spot tests.
 */
export function countBarrierCrossings(
  fromX: number, fromZ: number,
  toX: number, toZ: number,
  samples: number = 10,
): number {
  let crossings = 0;
  let prevWasWater: boolean | null = null;
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const x = fromX + (toX - fromX) * t;
    const z = fromZ + (toZ - fromZ) * t;
    const isWater = getTerrainHeight(x, z) < SEA_LEVEL;
    if (prevWasWater !== null && prevWasWater !== isWater) crossings++;
    prevWasWater = isWater;
  }
  return crossings;
}

/**
 * Closest interactable POI across all ports given a world-space (x, _, z)
 * query point. Mode-agnostic — caller decides whether ship- or walking-mode
 * should react. POIs whose kind isn't in `POI_INTERACTION_RADIUS_BY_KIND`
 * are skipped silently.
 *
 * Iterates every POI on every port (~30 ports × ~3 POIs ≈ 90 checks). Cheap
 * at the 4 Hz polling rate UI.tsx uses; if we ever push to per-frame, swap
 * in a spatial grid keyed by port position.
 */
export function findNearestPOI(
  playerPos: [number, number, number],
  ports: Port[],
): POIHit | null {
  let best: POIHit | null = null;
  for (const port of ports) {
    for (const poi of getPOIsForPort(port)) {
      const radius = POI_INTERACTION_RADIUS_BY_KIND[poi.kind];
      if (radius == null) continue;
      // Use the unified snapped position so the walk-up trigger fires at
      // the spot the silhouette + beacon actually render at, not at the
      // raw author coord which may have been moved by the snapper.
      const resolved = resolveSnappedPOI(poi, port);
      if (!resolved) continue;
      const dx = playerPos[0] - resolved.x;
      const dz = playerPos[2] - resolved.z;
      const distSq = dx * dx + dz * dz;
      if (distSq <= radius * radius && (!best || distSq < best.distSq)) {
        best = { poi, port, distSq };
      }
    }
  }
  return best;
}
