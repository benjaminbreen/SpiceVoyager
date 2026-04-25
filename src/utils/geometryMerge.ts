import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export function mergeCompatibleGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
  const hasIndexed = geometries.some((geometry) => geometry.index);
  const hasNonIndexed = geometries.some((geometry) => !geometry.index);
  if (!hasIndexed || !hasNonIndexed) {
    return mergeGeometries(geometries);
  }

  const compatible = geometries.map((geometry) => (
    geometry.index ? geometry.toNonIndexed() : geometry
  ));
  const merged = mergeGeometries(compatible);
  compatible.forEach((geometry, index) => {
    if (geometry !== geometries[index]) geometry.dispose();
  });
  return merged;
}
