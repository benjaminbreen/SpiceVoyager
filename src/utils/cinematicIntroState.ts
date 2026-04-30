// One-shot intro cinematic — a slow orbit + dolly-in onto the player ship,
// played once after the Commission of Voyage modal closes. Module-level state
// keeps it out of Zustand (no re-renders, sampled per-frame in CameraController).
//
// Lifecycle: startIntroCinematic() at game start → sampleIntroCinematic() each
// frame returns { active, eased } where `eased` ramps 0 → 1 over DURATION.
// At eased=1 the camera sits in its normal gameplay pose. skipIntroCinematic()
// snaps to the end (Enter key).

const DURATION = 3.5;     // seconds; the long dolly-in
const SWEEP_RAD = 1.0;    // ~57° azimuth orbit toward gameplay pose
const HEIGHT_BOOST = 42;  // start this much higher (world units)
const DIST_BOOST = 78;    // start this much further out — distant aerial shot, then dolly in
const FOV_BOOST = 12;     // start this many degrees wider; eases back to gameplay FOV

const state = {
  active: false,
  elapsed: 0,
};

export function startIntroCinematic() {
  state.active = true;
  state.elapsed = 0;
}

export function skipIntroCinematic() {
  if (!state.active) return;
  state.elapsed = DURATION;
}

export function isIntroCinematicActive(): boolean {
  return state.active;
}

// easeInOutCubic — slow start, slow finish, accelerates through the middle
function ease(t: number): number {
  if (t < 0.5) return 4 * t * t * t;
  const f = 2 * t - 2;
  return 1 + (f * f * f) / 2;
}

export interface IntroSample {
  active: boolean;
  eased: number;       // 0 = full cinematic offset, 1 = gameplay pose
  sweepAngle: number;  // remaining azimuth to sweep through (radians)
  heightBoost: number; // remaining vertical offset (world units)
  distBoost: number;   // remaining outward dolly (world units)
  fovBoost: number;    // remaining FOV widening (degrees) — eases to 0
}

export function sampleIntroCinematic(delta: number): IntroSample {
  if (!state.active) {
    return { active: false, eased: 1, sweepAngle: 0, heightBoost: 0, distBoost: 0, fovBoost: 0 };
  }
  state.elapsed += delta;
  const linear = Math.min(1, state.elapsed / DURATION);
  const eased = ease(linear);
  if (linear >= 1) state.active = false;
  const remaining = 1 - eased;
  return {
    active: true,
    eased,
    sweepAngle: remaining * SWEEP_RAD,
    heightBoost: remaining * HEIGHT_BOOST,
    distBoost: remaining * DIST_BOOST,
    fovBoost: remaining * FOV_BOOST,
  };
}
