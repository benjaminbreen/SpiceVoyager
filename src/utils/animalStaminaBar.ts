/**
 * Shared stamina bar primitives for ground animals.
 *
 * Each animal component renders its own instancedMesh of bars using these
 * helpers, so geometry/material are small and the bar draws share a single
 * call per species. A bar is a flat quad lying on the ground just under the
 * animal's feet — readable from the game's near-overhead camera without
 * needing per-instance billboarding.
 */

import * as THREE from 'three';

const BAR_WIDTH = 1.1;
const BAR_DEPTH = 0.16;
const BAR_Y_OFFSET = 0.08; // above terrain/foot to avoid z-fighting

export function createStaminaBarGeometry(): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(BAR_WIDTH, BAR_DEPTH);
  g.rotateX(-Math.PI / 2); // lay flat — local X is world width, local Z is world depth
  return g;
}

export function createStaminaBarMaterial(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: '#ffffff',
    transparent: true,
    depthWrite: false,
    opacity: 0.85,
  });
}

const _color = new THREE.Color();
/**
 * Returns a shared THREE.Color to pass to setColorAt — mutates in place, so
 * callers must read it before the next call.
 */
export function staminaColor(stamina: number): THREE.Color {
  // Green → yellow → red as the animal tires out.
  if (stamina > 0.5) {
    const t = (stamina - 0.5) * 2;
    _color.setRGB(1 - t * 0.85, 0.95, 0.15);
  } else {
    const t = stamina * 2;
    _color.setRGB(1, t * 0.75, 0.1);
  }
  return _color;
}

/**
 * Write a bar instance matrix into `dummy`. When `visible` is false, scale
 * collapses to zero so the mesh disappears without needing a draw-skip.
 */
export function setStaminaBarInstance(
  dummy: THREE.Object3D,
  x: number,
  y: number,
  z: number,
  animalScale: number,
  stamina: number,
  visible: boolean,
): void {
  if (!visible) {
    dummy.position.set(x, y + BAR_Y_OFFSET, z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(0, 0, 0);
    dummy.updateMatrix();
    return;
  }
  dummy.position.set(x, y + BAR_Y_OFFSET, z);
  dummy.rotation.set(0, 0, 0);
  // Local X scales with stamina fraction; Z uses animal scale for depth
  const w = Math.max(0.05, animalScale * stamina); // floor so fully-exhausted bar is still a visible sliver
  dummy.scale.set(w, 1, animalScale);
  dummy.updateMatrix();
}
