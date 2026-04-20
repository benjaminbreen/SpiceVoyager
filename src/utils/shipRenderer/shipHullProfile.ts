// Shared hull geometry — the same top/bottom profile is used by both
// the exterior filled renderer and the cutaway outline renderer, so
// silhouettes always match when the user toggles between views.

import type { RendererShipType } from './shipTypes';

export interface HullGeometry {
  sternX: number;
  bowX: number;
  length: number;
  keelY: number;
  deckY: number;
  bowOvershoot: number;
}

export function getHullGeometry(
  shipType: RendererShipType,
  width: number,
  height: number
): HullGeometry {
  const sternX = Math.floor(width * 0.15);
  const bowX = Math.floor(width * 0.85);
  const length = bowX - sternX;
  const keelY = Math.floor(height * 0.82);
  const deckY = Math.floor(height * 0.62);
  const bowOvershoot =
    shipType === 'baghla' || shipType === 'dhow' || shipType === 'pinnace' ? 12 : 0;
  return { sternX, bowX, length, keelY, deckY, bowOvershoot };
}

const AUTHORED_HEIGHT = 80;

/**
 * Returns top and bottom Y of the hull at a given column `x`,
 * or null if `x` is outside the hull at that column.
 */
export function getHullColumn(
  shipType: RendererShipType,
  geom: HullGeometry,
  height: number,
  x: number
): { topY: number; bottomY: number } | null {
  const { sternX, bowX, length, keelY, deckY, bowOvershoot } = geom;
  if (x < sternX || x > bowX + bowOvershoot) return null;
  const hy = height / AUTHORED_HEIGHT;

  let t = (x - sternX) / length;
  if (t > 1) t = 1;

  let bottomY = keelY;
  let topY = deckY;

  if (shipType === 'galleon') {
    bottomY -= t < 0.1 ? (0.1 - t) * 30 * hy : 0;
    bottomY -= t > 0.8 ? Math.pow((t - 0.8) / 0.2, 2) * 35 * hy : 0;
    topY -= t < 0.2 ? 8 * hy : t < 0.3 ? 4 * hy : 0;
    topY -= t > 0.85 ? 7 * hy : 0;
  } else if (shipType === 'carrack') {
    bottomY -= t < 0.15 ? (0.15 - t) * 35 * hy : 0;
    bottomY -= t > 0.75 ? Math.pow((t - 0.75) / 0.25, 2) * 30 * hy : 0;
    topY -= t < 0.3 ? 15 * hy : t < 0.4 ? 8 * hy : 0;
    topY -= t > 0.8 ? 12 * hy : 0;
  } else if (shipType === 'xebec') {
    bottomY -= t < 0.3 ? Math.pow((0.3 - t) / 0.3, 2) * 20 * hy : 0;
    bottomY -= t > 0.6 ? Math.pow((t - 0.6) / 0.4, 2) * 40 * hy : 0;
    topY += t < 0.2 ? -3 * hy : 4 * hy;
    topY -= t > 0.7 ? Math.pow((t - 0.7) / 0.3, 2) * 10 * hy : 0;
    if (t > 0.95) bottomY = topY + 3;
  } else if (shipType === 'fluyt') {
    bottomY -= t < 0.1 ? (0.1 - t) * 20 * hy : 0;
    bottomY -= t > 0.85 ? Math.pow((t - 0.85) / 0.15, 2) * 20 * hy : 0;
    topY -= t < 0.15 ? 5 * hy : 0;
    topY += 3 * hy;
    topY -= t > 0.9 ? 4 * hy : 0;
    if (t < 0.05) topY += 4 * hy;
  } else if (shipType === 'baghla' || shipType === 'dhow') {
    bottomY -= t < 0.2 ? (0.2 - t) * 25 * hy : 0;
    bottomY -= t > 0.7 ? Math.pow((t - 0.7) / 0.3, 2) * 35 * hy : 0;
    topY -= t < 0.15 ? 9 * hy : 0;
    topY += t > 0.8 ? 3 * hy : 0;
    if (t > 0.95) bottomY = topY + 2;
  } else if (shipType === 'pinnace') {
    bottomY -= t < 0.15 ? (0.15 - t) * 28 * hy : 0;
    bottomY -= t > 0.75 ? Math.pow((t - 0.75) / 0.25, 2) * 32 * hy : 0;
    topY -= t < 0.2 ? 5 * hy : 0;
    topY -= t > 0.85 ? 4 * hy : 0;
    if (t > 0.98) bottomY = topY + 2;
  } else if (shipType === 'merchant_cog') {
    bottomY -= t < 0.25 ? Math.pow((0.25 - t) / 0.25, 2) * 25 * hy : 0;
    bottomY -= t > 0.75 ? Math.pow((t - 0.75) / 0.25, 2) * 25 * hy : 0;
    topY -= t < 0.15 ? 8 * hy : t < 0.25 ? 4 * hy : 0;
    topY -= t > 0.8 ? 8 * hy : 0;
  } else if (shipType === 'junk') {
    bottomY -= t < 0.15 ? (0.15 - t) * 20 * hy : 0;
    bottomY -= t > 0.85 ? Math.pow((t - 0.85) / 0.15, 2) * 22 * hy : 0;
    topY -= t < 0.15 ? 18 * hy : t < 0.22 ? 10 * hy : 0;
    topY -= t > 0.85 ? 6 * hy : 0;
  }

  return { topY: Math.floor(topY), bottomY: Math.floor(bottomY) };
}
