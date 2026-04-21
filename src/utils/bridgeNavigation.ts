/**
 * bridgeNavigation.ts — walkable bridge decks
 *
 * Bridges are generated as Road polylines (tier: 'bridge') whose Y values
 * already encode a ramped deck: terrain height at the abutments, climbing
 * smoothly up to SEA_LEVEL + 0.8 over water. We re-use that polyline at
 * runtime as the "ground" surface whenever a character stands within the
 * bridge's footprint, giving free ramp transitions with no extra math.
 */

import { Road } from '../store/gameStore';
import { getTerrainHeight } from './terrain';

// Matches the rendered bridge ribbon width (3.2) in ProceduralCity.tsx.
// Characters within this lateral distance of the deck polyline stand on it.
export const BRIDGE_HALF_WIDTH = 1.6;

/** Pick out only the bridge-tier roads. Call once per port load and cache. */
export function extractBridges(roads: Road[] | undefined): Road[] {
  if (!roads || roads.length === 0) return [];
  return roads.filter(r => r.tier === 'bridge');
}

/**
 * Nearest point on any bridge polyline to (x, z). Returns the deck Y
 * (linearly interpolated along the segment so abutment ramps are smooth)
 * and the lateral distance from the polyline.
 */
function nearestBridgePoint(
  x: number, z: number,
  bridges: Road[],
): { y: number; dist: number } | null {
  let bestDist = Infinity;
  let bestY = 0;
  for (const b of bridges) {
    const pts = b.points;
    if (pts.length < 2) continue;
    for (let i = 0; i < pts.length - 1; i++) {
      const ax = pts[i][0],     ay = pts[i][1],     az = pts[i][2];
      const bx = pts[i + 1][0], by = pts[i + 1][1], bz = pts[i + 1][2];
      const dx = bx - ax;
      const dz = bz - az;
      const segLen2 = dx * dx + dz * dz;
      if (segLen2 < 1e-6) continue;
      let t = ((x - ax) * dx + (z - az) * dz) / segLen2;
      if (t < 0) t = 0; else if (t > 1) t = 1;
      const sx = ax + dx * t;
      const sz = az + dz * t;
      const d = Math.sqrt((x - sx) ** 2 + (z - sz) ** 2);
      if (d < bestDist) {
        bestDist = d;
        bestY = ay + (by - ay) * t;
      }
    }
  }
  if (bestDist === Infinity) return null;
  return { y: bestY, dist: bestDist };
}

/**
 * Bridge-aware ground height. Returns the terrain height, or the bridge
 * deck height when a character is within a bridge's footprint. The
 * polyline's Y is used directly so the ramped abutments Just Work — at
 * the land end the deck Y equals terrain, on the span it's SEA_LEVEL+0.8,
 * and Chaikin-smoothed points in between ramp smoothly.
 */
export function getGroundHeight(
  x: number, z: number,
  bridges: Road[] | undefined,
): number {
  const terrainY = getTerrainHeight(x, z);
  if (!bridges || bridges.length === 0) return terrainY;
  const hit = nearestBridgePoint(x, z, bridges);
  if (!hit || hit.dist > BRIDGE_HALF_WIDTH) return terrainY;
  // On the bridge footprint. Max with terrain so the abutment side never
  // sinks into a hill — the deck is only "ground" where it's actually up.
  return Math.max(terrainY, hit.y);
}
