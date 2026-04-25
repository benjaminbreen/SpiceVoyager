import * as THREE from 'three';

export type PalmEntry = {
  position: [number, number, number];
  scale: number;
  lean: number;
  rotation: number;
};

export function palmCanopyCenter(palm: PalmEntry, out: THREE.Vector3) {
  out.set(0.6 * palm.scale, 4.15 * palm.scale, 0);
  out.applyEuler(new THREE.Euler(palm.lean, palm.rotation, 0));
  out.x += palm.position[0];
  out.y += palm.position[1];
  out.z += palm.position[2];
  return out;
}
