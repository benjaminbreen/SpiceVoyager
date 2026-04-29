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

/**
 * XZ interaction radius per POI kind, in world units.
 *
 * Sized to ~half the silhouette's footprint so a player at the visible edge
 * of the structure is in range, and so adjacent POIs don't overlap their
 * interaction zones. If a POI kind isn't listed here, it has no proximity
 * interaction (rendered-only, e.g. atmospheric set-dressing).
 */
export const POI_INTERACTION_RADIUS_BY_KIND: Partial<Record<POIKind, number>> = {
  // Building-anchored bespoke POIs — small radius, structure already has
  // its own AABB walking detection.
  shrine: 8,
  naturalist: 8,
  merchant_guild: 8,
  // Hinterland archetypes — sized to silhouette footprint.
  garden: 12,
  caravanserai: 14,
  ruin: 12,
  // Nearshore archetypes — sailed up to, not walked, so radius is generous
  // enough to catch a ship drifting alongside.
  wreck: 16,
  smugglers_cove: 12,
};

export interface POIHit {
  poi: POIDefinition;
  port: Port;
  /** Squared XZ distance from the query point. Useful for tie-breaking. */
  distSq: number;
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
      const resolved = resolvePOIPosition(poi, port);
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
