import type { PortScale, Road } from '../store/gameStore';

// Shared Cell shape. cityGenerator owns the full definition; layout helpers
// only need the read-only view surface.
export interface LayoutCell {
  x: number;
  z: number;
  isLand: boolean;
  isBeach: boolean;
  distToCenter: number;
  occupied: boolean;
}

export interface PathTargetOptions {
  innerRing: number;
  outerRing: number;
  /** Interior-vs-outskirts mix: probability of targeting an interior cell. */
  interiorBias: number;
  /** Reject candidates within this radius of any point in this set. */
  avoid: Set<string>;
  /** Minimum distance (world units) from any `avoid` point. */
  avoidRadius: number;
}

/**
 * Pick a random target cell for a secondary path. Mixes outer-ring targets
 * (outskirts spurs) with interior cells (infill alleys) according to
 * `interiorBias`. Biasing interior is what produces a tangled network instead
 * of a radial starburst.
 */
export function pickPathTarget(
  grid: LayoutCell[],
  rng: () => number,
  opts: PathTargetOptions,
): LayoutCell | null {
  const wantInterior = rng() < opts.interiorBias;

  const avoidPoints: [number, number][] = [];
  for (const key of opts.avoid) {
    const [xs, zs] = key.split(',');
    avoidPoints.push([Number(xs), Number(zs)]);
  }
  const avoidRadiusSq = opts.avoidRadius * opts.avoidRadius;

  const inRing = (c: LayoutCell): boolean => {
    if (!c.isLand) return false;
    if (c.occupied) return false;
    if (wantInterior) {
      // Interior band: between the very core and the outer ring. We don't
      // want paths targeting the dead-centre square (anchors sit there).
      return c.distToCenter > opts.innerRing * 0.35 && c.distToCenter < opts.innerRing;
    }
    return c.distToCenter > opts.innerRing && c.distToCenter < opts.outerRing;
  };

  const isFarFromAvoid = (c: LayoutCell): boolean => {
    if (avoidPoints.length === 0) return true;
    for (const [ax, az] of avoidPoints) {
      const dx = ax - c.x;
      const dz = az - c.z;
      if (dx * dx + dz * dz < avoidRadiusSq) return false;
    }
    return true;
  };

  const pool = grid.filter((c) => inRing(c) && isFarFromAvoid(c));
  if (pool.length === 0) {
    // Fall back to ring-only (ignore avoid set) so big cities with dense
    // coverage still emit paths instead of silently dropping them.
    const fallback = grid.filter(inRing);
    if (fallback.length === 0) return null;
    return fallback[Math.floor(rng() * fallback.length)];
  }
  return pool[Math.floor(rng() * pool.length)];
}

/**
 * Pick a point to branch a new path off of. Samples from both endpoints AND
 * midpoints of existing roads, so new paths tee into the middle of existing
 * roads rather than only dangling off the tips — this is what turns a radial
 * spoke diagram into a networked medieval street grid.
 *
 * Returns a world-space [x, z] coord; the caller is responsible for snapping
 * it to the grid.
 */
export function pickPathOrigin(
  roads: Road[],
  rng: () => number,
  options: { midpointProbability?: number } = {},
): [number, number] | null {
  if (roads.length === 0) return null;
  const midpointProbability = options.midpointProbability ?? 0.65;

  const useMidpoint = rng() < midpointProbability;
  const road = roads[Math.floor(rng() * roads.length)];
  if (!road || road.points.length === 0) return null;

  if (useMidpoint && road.points.length >= 3) {
    // Pick a point from the interior of the polyline (not the two endpoints).
    const idx = 1 + Math.floor(rng() * (road.points.length - 2));
    const p = road.points[idx];
    return [p[0], p[2]];
  }

  // Endpoint
  const endIdx = rng() < 0.5 ? 0 : road.points.length - 1;
  const p = road.points[endIdx];
  return [p[0], p[2]];
}

/**
 * Road density tuning per scale. Big cities get substantially more paths so
 * the network has enough branches to read as streets rather than radial
 * spokes. cityGenerator consumes this via ROAD_COUNTS.
 */
export const ROAD_DENSITY: Record<PortScale, { avenues: number; roads: number; paths: number }> = {
  'Small':      { avenues: 0, roads: 0, paths: 1 },
  'Medium':     { avenues: 0, roads: 1, paths: 2 },
  'Large':      { avenues: 0, roads: 2, paths: 4 },
  'Very Large': { avenues: 1, roads: 3, paths: 9 },
  'Huge':       { avenues: 2, roads: 5, paths: 14 },
};

/**
 * Interior vs outskirts bias for path targets by scale. Larger cities want
 * more interior infill; tiny hamlets do better with a handful of spokes.
 */
export const PATH_INTERIOR_BIAS: Record<PortScale, number> = {
  'Small':      0.0,
  'Medium':     0.15,
  'Large':      0.35,
  'Very Large': 0.55,
  'Huge':       0.65,
};
