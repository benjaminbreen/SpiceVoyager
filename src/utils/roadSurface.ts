/**
 * roadSurface.ts — walkable road / bridge surfaces
 *
 * Characters (player + pedestrians) query `getGroundHeight(x, z, index)` to
 * find the Y they should stand on. Terrain is the baseline; any road whose
 * polyline passes within its tier's walk-half-width contributes a lifted
 * surface, and we return the maximum so higher-tier roads at a junction
 * win over lower-tier ones and bridges raise characters above the water.
 *
 * All road segments are bucketed into a coarse XZ grid at port-load time so
 * the per-character per-frame query only visits a handful of segments
 * instead of the whole city. Rebuild the index whenever the port's roads
 * change (typically once on port entry).
 */

import type { Road, RoadTier } from '../store/gameStore';
import { getTerrainHeight } from './terrain';
import { ROAD_TIER_STYLE, tierWalkHalfWidth } from './roadStyle';

// Grid cell size in world units. Chosen so a typical segment (1–6u after
// densification, longer before) fits in 1–3 cells, keeping lookup O(~segs
// in cell) without excessive bucketing work at build time.
const CELL_SIZE = 8;

interface IndexedSegment {
  ax: number; ay: number; az: number;
  bx: number; by: number; bz: number;
  tier: RoadTier;
  halfWidth: number;   // walk half-width for this tier
  yLift: number;
}

export interface RoadSurfaceIndex {
  cells: Map<number, IndexedSegment[]>;
  // Precomputed for fast query.
  cellSize: number;
  /** Max walkable half-width across all roads. Needed so a query at (x, z)
   *  can include segments in neighbour cells whose centerline is up to this
   *  many units outside our cell. */
  maxHalfWidth: number;
}

function cellKey(cx: number, cz: number): number {
  // Interleave as 32-bit signed ints into a single number key. Cell coords
  // comfortably fit ±32k, so (cx + 32768) * 65536 + (cz + 32768) is unique
  // and avoids Map<string> hash overhead.
  return ((cx + 32768) << 16) | (cz + 32768);
}

function floorDiv(n: number, d: number): number {
  return Math.floor(n / d);
}

/**
 * Build the spatial index from a port's roads. Safe to call with undefined
 * (returns an empty index). One-time at port load.
 */
export function buildRoadSurfaceIndex(
  roads: Road[] | undefined,
): RoadSurfaceIndex {
  const cells = new Map<number, IndexedSegment[]>();
  let maxHalfWidth = 0;

  if (!roads || roads.length === 0) {
    return { cells, cellSize: CELL_SIZE, maxHalfWidth };
  }

  for (const r of roads) {
    const tier = r.tier;
    const style = ROAD_TIER_STYLE[tier];
    if (!style) continue;
    const halfWidth = tierWalkHalfWidth(tier);
    if (halfWidth > maxHalfWidth) maxHalfWidth = halfWidth;
    const yLift = style.yLift;

    const pts = r.points;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const seg: IndexedSegment = {
        ax: a[0], ay: a[1], az: a[2],
        bx: b[0], by: b[1], bz: b[2],
        tier, halfWidth, yLift,
      };

      // Bucket the segment into every cell its swept bounding box overlaps.
      // The sweep is the AABB of the two endpoints expanded by halfWidth so
      // that edge-of-ribbon queries still find the segment.
      const minX = Math.min(a[0], b[0]) - halfWidth;
      const maxX = Math.max(a[0], b[0]) + halfWidth;
      const minZ = Math.min(a[2], b[2]) - halfWidth;
      const maxZ = Math.max(a[2], b[2]) + halfWidth;
      const cx0 = floorDiv(minX, CELL_SIZE);
      const cx1 = floorDiv(maxX, CELL_SIZE);
      const cz0 = floorDiv(minZ, CELL_SIZE);
      const cz1 = floorDiv(maxZ, CELL_SIZE);
      for (let cx = cx0; cx <= cx1; cx++) {
        for (let cz = cz0; cz <= cz1; cz++) {
          const k = cellKey(cx, cz);
          const arr = cells.get(k);
          if (arr) arr.push(seg);
          else cells.set(k, [seg]);
        }
      }
    }
  }

  return { cells, cellSize: CELL_SIZE, maxHalfWidth };
}

/**
 * Bridge-aware, road-aware ground height. Returns terrain height, or a
 * lifted road surface when (x, z) lies within some road's walk footprint.
 * When multiple road surfaces apply (a T-junction where path meets avenue,
 * a bridge crossing a path), the maximum is returned — higher-tier yLift
 * wins, bridges over water win over flat terrain.
 */
export function getGroundHeight(
  x: number, z: number,
  index: RoadSurfaceIndex | undefined,
): number {
  const terrainY = getTerrainHeight(x, z);
  if (!index || index.cells.size === 0) return terrainY;

  const { cells, cellSize, maxHalfWidth } = index;

  // A character at (x, z) can be on a segment whose midline is up to
  // maxHalfWidth outside our cell. Include neighbours within that band.
  const qx0 = floorDiv(x - maxHalfWidth, cellSize);
  const qx1 = floorDiv(x + maxHalfWidth, cellSize);
  const qz0 = floorDiv(z - maxHalfWidth, cellSize);
  const qz1 = floorDiv(z + maxHalfWidth, cellSize);

  let bestSurface = terrainY;
  // Dedup: the same segment can appear in multiple cells. A visited Set
  // avoids re-testing it for each overlap cell.
  const seen = new Set<IndexedSegment>();

  for (let cx = qx0; cx <= qx1; cx++) {
    for (let cz = qz0; cz <= qz1; cz++) {
      const bucket = cells.get(cellKey(cx, cz));
      if (!bucket) continue;
      for (const s of bucket) {
        if (seen.has(s)) continue;
        seen.add(s);
        const dx = s.bx - s.ax;
        const dz = s.bz - s.az;
        const segLen2 = dx * dx + dz * dz;
        if (segLen2 < 1e-6) continue;
        let t = ((x - s.ax) * dx + (z - s.az) * dz) / segLen2;
        if (t < 0) t = 0; else if (t > 1) t = 1;
        const sx = s.ax + dx * t;
        const sz = s.az + dz * t;
        const distSq = (x - sx) ** 2 + (z - sz) ** 2;
        if (distSq > s.halfWidth * s.halfWidth) continue;
        // Interpolated polyline Y + tier yLift. For non-bridge tiers the
        // polyline Y equals terrain height at that point, so surface Y is
        // effectively terrainY_at_segment + yLift. For bridges the
        // polyline Y rides up to deck height over water.
        const surfaceY = s.ay + (s.by - s.ay) * t + s.yLift;
        if (surfaceY > bestSurface) bestSurface = surfaceY;
      }
    }
  }

  return bestSurface;
}
