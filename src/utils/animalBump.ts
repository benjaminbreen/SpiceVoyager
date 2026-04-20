/**
 * Shared bump physics for ground animals. Grazers/Primates/Reptiles/WadingBirds
 * all feed through these helpers so colliding feels consistent across species.
 *
 * Each animal stores a "flee offset" (dx, dz) on top of its spawn position. Bumps
 * resolve by adding to that offset, which naturally decays via the existing
 * RETURN_DECAY once the collider moves away.
 */

// Approximate top-down body radius used for collision, expressed as a multiplier
// on the per-instance scale. Tuned against the geometry in each component.
export const BODY_RADIUS: Record<'grazer' | 'primate' | 'reptile' | 'wading', number> = {
  grazer: 0.55,
  primate: 0.38,
  reptile: 0.60,
  wading: 0.32,
};

// Effective radius of the player's collider when on foot. Ship mode is in water
// so ground-animal overlap won't trigger regardless.
export const PLAYER_RADIUS = 0.7;

/**
 * Resolve overlap between the animal at (selfX, selfZ) and a collider at
 * (otherX, otherZ). Returns the delta to add to the animal's flee offset,
 * plus the overlap depth (useful for throttling the bump event to real contact).
 */
export function computeCirclePush(
  selfX: number, selfZ: number,
  otherX: number, otherZ: number,
  sumRadius: number,
): { px: number; pz: number; overlap: number } | null {
  const dx = selfX - otherX;
  const dz = selfZ - otherZ;
  const sumSq = sumRadius * sumRadius;
  const d2 = dx * dx + dz * dz;
  if (d2 >= sumSq) return null;
  if (d2 < 1e-4) {
    // Degenerate: use a stable axis so the pair doesn't jitter
    return { px: sumRadius, pz: 0, overlap: sumRadius };
  }
  const d = Math.sqrt(d2);
  const overlap = sumRadius - d;
  return { px: (dx / d) * overlap, pz: (dz / d) * overlap, overlap };
}

/**
 * Pairwise O(N²/2) separation pass over a single-species herd.
 *
 * Each colliding pair gets pushed half the overlap in opposite directions, so the
 * resolution is symmetric and one animal doesn't hog all the displacement.
 * `strength` of 1.0 fully resolves overlap in one frame; lower values smooth out
 * the response so animals settle rather than pop apart.
 */
export function separateHerd(
  offsets: { dx: number; dz: number }[],
  worldX: number[],
  worldZ: number[],
  radii: number[],
  strength = 0.6,
): void {
  const n = worldX.length;
  for (let i = 0; i < n - 1; i++) {
    const xi = worldX[i];
    const zi = worldZ[i];
    const ri = radii[i];
    for (let j = i + 1; j < n; j++) {
      const dx = worldX[j] - xi;
      const dz = worldZ[j] - zi;
      const sum = ri + radii[j];
      const d2 = dx * dx + dz * dz;
      if (d2 >= sum * sum) continue;
      let nx: number, nz: number, d: number;
      if (d2 < 1e-4) {
        // Deterministic axis per pair — avoids jitter when two animals land on top of each other
        const ang = (i * 2.399 + j * 0.973) % (Math.PI * 2);
        nx = Math.cos(ang);
        nz = Math.sin(ang);
        d = 1e-4;
      } else {
        d = Math.sqrt(d2);
        nx = dx / d;
        nz = dz / d;
      }
      const half = (sum - d) * 0.5 * strength;
      offsets[i].dx -= nx * half;
      offsets[i].dz -= nz * half;
      offsets[j].dx += nx * half;
      offsets[j].dz += nz * half;
    }
  }
}

export interface BumpToastOpts {
  speciesName: string;
  speciesLatin: string;
  /** Reaction verb — varies by species (e.g., "startled", "scatters", "hisses") */
  reaction: string;
}
