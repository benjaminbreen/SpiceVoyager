/**
 * Shared live buffer of pedestrian positions, published each throttled tick by
 * Pedestrians.tsx and read by Player.tsx to resolve one-way push-out collisions.
 *
 * Flat typed arrays + count — O(N) scan is trivial at the ~40–100 peds per port
 * we deal with, and skipping a grid avoids rebuild cost for points that move
 * every update.
 */

const MAX_LIVE_PEDS = 256;

const xs = new Float32Array(MAX_LIVE_PEDS);
const ys = new Float32Array(MAX_LIVE_PEDS);
const zs = new Float32Array(MAX_LIVE_PEDS);
let count = 0;

// Effective ped body radius for collision (matches the visible torso footprint).
// Matches the 1.12× pedestrian visual scale applied in Pedestrians.tsx so the
// player can't walk through the body silhouette and projectiles register cleanly.
const PED_RADIUS = 0.36;

// Kill queue: indices of peds hit this frame. Consumed by Pedestrians.tsx.
const _pendingKills: number[] = [];

export function syncLivePedestrians(
  n: number,
  srcXs: readonly number[] | Float32Array,
  srcYs: readonly number[] | Float32Array,
  srcZs: readonly number[] | Float32Array,
): void {
  const lim = Math.min(n, MAX_LIVE_PEDS);
  for (let i = 0; i < lim; i++) {
    xs[i] = srcXs[i];
    ys[i] = srcYs[i];
    zs[i] = srcZs[i];
  }
  count = lim;
}

export function clearLivePedestrians(): void {
  count = 0;
}

export interface PedestrianPush {
  px: number;
  pz: number;
  depth: number;
  hit: boolean;
}

const _out: PedestrianPush = { px: 0, pz: 0, depth: 0, hit: false };

/**
 * Resolve overlap between a circle at (x, z, radius) and every live pedestrian.
 * Returns a shared output — read immediately before the next call overwrites it.
 */
export function resolvePedestrianPush(x: number, z: number, radius: number): PedestrianPush {
  _out.px = 0;
  _out.pz = 0;
  _out.depth = 0;
  _out.hit = false;

  const sumR = radius + PED_RADIUS;
  const sumSq = sumR * sumR;

  for (let i = 0; i < count; i++) {
    if (xs[i] > 9000) continue; // killed ped parked far away
    const ox = x - xs[i];
    const oz = z - zs[i];
    const d2 = ox * ox + oz * oz;
    if (d2 >= sumSq) continue;
    if (d2 < 1e-4) {
      // Degenerate overlap — push along a stable axis derived from index
      const ang = (i * 12.9898) % (Math.PI * 2);
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
  return _out;
}

/**
 * Test whether a point (from a projectile) hits any live pedestrian.
 * Returns the buffer index of the first hit, or -1 if none.
 * Uses XZ circle test + Y range (ped body 0 to ~+2.5 above their ground position).
 */
export function pointHitsPedestrian(px: number, py: number, pz: number): number {
  const HIT_R = PED_RADIUS + 0.12;
  const hitSq = HIT_R * HIT_R;
  for (let i = 0; i < count; i++) {
    if (xs[i] > 9000) continue; // already killed
    const dy = py - ys[i];
    if (dy < -0.3 || dy > 2.5) continue; // body+head, accounting for 1.12× ped scale
    const dx = px - xs[i];
    const dz = pz - zs[i];
    if (dx * dx + dz * dz < hitSq) return i;
  }
  return -1;
}

/**
 * Mark a pedestrian as killed: park it far off-screen so it no longer
 * participates in collision, and queue its index for Pedestrians.tsx to
 * deactivate in the system.
 */
export function markKillPedestrian(index: number): void {
  if (index < 0 || index >= count) return;
  xs[index] = 99999;
  zs[index] = 99999;
  _pendingKills.push(index);
}

/**
 * Called by Pedestrians.tsx each frame. Returns all newly killed indices
 * and clears the queue.
 */
export function consumePendingKills(): number[] {
  if (_pendingKills.length === 0) return [];
  return _pendingKills.splice(0);
}
