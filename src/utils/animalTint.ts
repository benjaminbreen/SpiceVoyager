/**
 * Cheap per-part shading for instanced animal geometry.
 *
 * Each animal's base color is driven by a per-instance RGB via setColorAt, which
 * in three.js multiplies with vertex colors. Baking relative tints into each
 * geometry part — hooves darker, belly lighter, horns near-black — gives
 * visible silhouette structure without adding draw calls or textures.
 *
 * Factors are relative multipliers, not absolute colors, so they compose
 * correctly with any per-instance base tone (tan impala, black buffalo, etc).
 */

import * as THREE from 'three';

/** Paint every vertex of `geom` with a flat RGB factor. */
export function tintFlat(geom: THREE.BufferGeometry, factor: number): void {
  const count = geom.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3]     = factor;
    colors[i * 3 + 1] = factor;
    colors[i * 3 + 2] = factor;
  }
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

/**
 * Paint a vertical gradient (countershading). `bottomFactor > topFactor` gives
 * the classic "lighter belly, darker back" that reads as mass and light direction
 * at a glance, even on monotone species.
 *
 * Operates on untransformed local y, so apply before scale/translate so the
 * gradient follows the part's intended orientation. (BufferGeometry.scale()
 * transforms positions but leaves vertex colors alone, which is what we want.)
 */
export function tintGradient(
  geom: THREE.BufferGeometry,
  topFactor: number,
  bottomFactor: number,
): void {
  const pos = geom.attributes.position;
  const count = pos.count;
  let yMin = Infinity;
  let yMax = -Infinity;
  for (let i = 0; i < count; i++) {
    const y = pos.getY(i);
    if (y < yMin) yMin = y;
    if (y > yMax) yMax = y;
  }
  const range = yMax - yMin || 1;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const t = (pos.getY(i) - yMin) / range; // 0 = bottom, 1 = top
    const f = bottomFactor + (topFactor - bottomFactor) * t;
    colors[i * 3]     = f;
    colors[i * 3 + 1] = f;
    colors[i * 3 + 2] = f;
  }
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

/**
 * Tint with separate channel factors — for parts that should warm-shift or
 * cool-shift relative to the base color (e.g., pink snouts, warm-dark hooves).
 */
export function tintRGB(
  geom: THREE.BufferGeometry,
  r: number, g: number, b: number,
): void {
  const count = geom.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3]     = r;
    colors[i * 3 + 1] = g;
    colors[i * 3 + 2] = b;
  }
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}
