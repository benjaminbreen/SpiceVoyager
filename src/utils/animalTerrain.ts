/**
 * Terrain-aware movement for ground animals.
 *
 * Animals used to flee in straight lines regardless of landscape — they'd trot
 * straight into the sea or scale mountain faces, which made catching them nearly
 * impossible. This helper clamps each proposed step against a per-species
 * height window so a coastline or cliff becomes a wall they can slide along.
 */

import { getTerrainHeight } from './terrain';
import { SEA_LEVEL } from '../constants/world';

// Where each kind of animal is allowed to exist. Min gates sea / swamp entry,
// max gates mountainside climbing.
export const GRAZER_TERRAIN  = { min: SEA_LEVEL + 0.3,  max: SEA_LEVEL + 5.0 };
export const PRIMATE_TERRAIN = { min: SEA_LEVEL + 0.3,  max: SEA_LEVEL + 6.0 };
export const REPTILE_TERRAIN = { min: SEA_LEVEL - 0.4,  max: SEA_LEVEL + 3.0 };

/**
 * Resolve a proposed step against the terrain. If the full step leaves the
 * allowed band, try each axis alone so the animal can slide along a barrier
 * instead of locking up. If neither axis works, return (0, 0) and let the
 * animal come to a stop — that's the moment the player catches up.
 *
 * Costs at most 3 terrain samples per call (full, X-only, Z-only) and only
 * runs while the animal is moving.
 */
export function resolveTerrainStep(
  fromX: number, fromZ: number,
  stepX: number, stepZ: number,
  min: number, max: number,
): { dx: number; dz: number } {
  // Allow a step if the target is in-band. If the animal is already out of band
  // (e.g. it spawned on a plateau above max, or the map was re-seeded under it),
  // allow any step that doesn't push it further out — without this, animals on
  // high inland terrain stay frozen because every target sample also exceeds max.
  const fromH = getTerrainHeight(fromX, fromZ);
  const fromAbove = fromH > max;
  const fromBelow = fromH < min;
  const allowed = (h: number) => {
    if (h >= min && h <= max) return true;
    if (fromAbove) return h <= fromH;
    if (fromBelow) return h >= fromH;
    return false;
  };
  const fullH = getTerrainHeight(fromX + stepX, fromZ + stepZ);
  if (allowed(fullH)) return { dx: stepX, dz: stepZ };
  const xH = getTerrainHeight(fromX + stepX, fromZ);
  const zH = getTerrainHeight(fromX, fromZ + stepZ);
  const okX = allowed(xH);
  const okZ = allowed(zH);
  if (okX && !okZ) return { dx: stepX, dz: 0 };
  if (okZ && !okX) return { dx: 0, dz: stepZ };
  return { dx: 0, dz: 0 };
}
