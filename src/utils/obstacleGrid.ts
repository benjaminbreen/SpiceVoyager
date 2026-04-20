/**
 * Uniform spatial hash grid for static terrain obstacles (trees, rocks, etc.).
 *
 * Built once when a map generates; queried every frame by the walking player and
 * ground animals. Lookups inspect only the 9 cells around the mover, so cost is
 * independent of the total obstacle count.
 *
 * Cell size 8u is chosen against the world: max obstacle radius ~2u + max mover
 * radius ~0.7u = 2.7u. Any collision pair sits within one cell of each other, so
 * a 3×3 neighborhood is exhaustive.
 */

const CELL = 8;
const INV_CELL = 1 / CELL;

interface Obstacle {
  x: number;
  z: number;
  r: number;
}

// Flat Map keyed by a packed (ix, iz) signed integer hash. A grid over a
// 900×900 world at 8u fits in ~13k cells, mostly empty.
const grid: Map<number, Obstacle[]> = new Map();

function cellKey(ix: number, iz: number): number {
  // Pack two signed 16-bit cell coords into one 32-bit number.
  return ((ix & 0xffff) << 16) | (iz & 0xffff);
}

export function clearObstacleGrid(): void {
  grid.clear();
}

export function addObstacle(x: number, z: number, r: number): void {
  if (r <= 0) return;
  const ix = Math.floor(x * INV_CELL);
  const iz = Math.floor(z * INV_CELL);
  const key = cellKey(ix, iz);
  let bucket = grid.get(key);
  if (!bucket) {
    bucket = [];
    grid.set(key, bucket);
  }
  bucket.push({ x, z, r });
}

/** Debug / telemetry — number of registered obstacles. */
export function obstacleCount(): number {
  let n = 0;
  for (const bucket of grid.values()) n += bucket.length;
  return n;
}

export interface ObstaclePush {
  px: number;
  pz: number;
  depth: number; // deepest single-obstacle overlap — useful for bounce / thud thresholds
  hit: boolean;
}

// Reused output so the hot path doesn't allocate per call.
const _out: ObstaclePush = { px: 0, pz: 0, depth: 0, hit: false };

/**
 * Resolve overlap between a circle at (x, z, radius) and all nearby static
 * obstacles. Returns a shared output object — callers must read px/pz/depth/hit
 * immediately, before the next call overwrites it.
 *
 * Push vectors accumulate. If the mover is wedged between two obstacles the
 * combined push still resolves cleanly, since each contributes only along its
 * own normal.
 */
export function resolveObstaclePush(x: number, z: number, radius: number): ObstaclePush {
  _out.px = 0;
  _out.pz = 0;
  _out.depth = 0;
  _out.hit = false;

  const cx = Math.floor(x * INV_CELL);
  const cz = Math.floor(z * INV_CELL);

  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const bucket = grid.get(cellKey(cx + dx, cz + dz));
      if (!bucket) continue;
      for (let i = 0; i < bucket.length; i++) {
        const o = bucket[i];
        const ox = x - o.x;
        const oz = z - o.z;
        const sumR = radius + o.r;
        const d2 = ox * ox + oz * oz;
        if (d2 >= sumR * sumR) continue;
        if (d2 < 1e-4) {
          // Degenerate overlap (mover perfectly on obstacle center) — eject
          // along a stable axis derived from the obstacle coords so the push
          // direction doesn't flicker frame to frame.
          const ang = (o.x * 12.9898 + o.z * 78.233) % (Math.PI * 2);
          _out.px += Math.cos(ang) * sumR;
          _out.pz += Math.sin(ang) * sumR;
          if (sumR > _out.depth) _out.depth = sumR;
          _out.hit = true;
          continue;
        }
        const d = Math.sqrt(d2);
        const overlap = sumR - d;
        _out.px += (ox / d) * overlap;
        _out.pz += (oz / d) * overlap;
        if (overlap > _out.depth) _out.depth = overlap;
        _out.hit = true;
      }
    }
  }
  return _out;
}
