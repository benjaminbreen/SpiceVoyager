// Shared camera shake/kick state — mutable, kept out of Zustand for per-frame perf.
// Any system can call addCameraShake() for random jitter (hits, hard turns) or
// addCameraImpulse() for a directional nudge (ramming, collisions). The main
// camera controller samples once per frame and adds the offset to camera.position.

import * as THREE from 'three';

const state = {
  trauma: 0,        // 0-1, drives random jitter; decays every frame
  impulseX: 0,      // world-space directional offset (meters)
  impulseY: 0,
  impulseZ: 0,
};

/** Add random shake trauma. Typical values: 0.2 light bump, 0.5 ram, 0.8 broadside. */
export function addCameraShake(trauma: number) {
  state.trauma = Math.min(1, state.trauma + trauma);
}

/** Add a directional kick in world space. dirX/dirZ should be roughly unit length. */
export function addCameraImpulse(dirX: number, dirZ: number, magnitude: number, vertical = 0) {
  state.impulseX += dirX * magnitude;
  state.impulseZ += dirZ * magnitude;
  state.impulseY += vertical * magnitude;
}

const _offset = new THREE.Vector3();

/** Called once per frame by the camera controller. Returns the total offset to apply. */
export function sampleCameraShake(delta: number): THREE.Vector3 {
  // Random jitter scales with trauma² so low values stay subtle
  const t2 = state.trauma * state.trauma;
  const shakeMag = t2 * 1.3;
  _offset.set(
    (Math.random() - 0.5) * 2 * shakeMag,
    (Math.random() - 0.5) * 2 * shakeMag * 0.35,
    (Math.random() - 0.5) * 2 * shakeMag,
  );

  // Directional impulse springs back exponentially
  _offset.x += state.impulseX;
  _offset.y += state.impulseY;
  _offset.z += state.impulseZ;

  // Decay — trauma fades in ~0.6s, impulse in ~0.4s
  state.trauma = Math.max(0, state.trauma - delta * 1.8);
  const damp = Math.exp(-delta * 7);
  state.impulseX *= damp;
  state.impulseY *= damp;
  state.impulseZ *= damp;

  // Kill micro-residuals so we don't keep sampling noise forever
  if (Math.abs(state.impulseX) < 0.001) state.impulseX = 0;
  if (Math.abs(state.impulseY) < 0.001) state.impulseY = 0;
  if (Math.abs(state.impulseZ) < 0.001) state.impulseZ = 0;

  return _offset;
}
