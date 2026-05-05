// One-shot port arrival cinematic after world-map fast travel.
// Kept outside Zustand so CameraController can sample it every frame without
// UI re-renders or adding persistence surface.

const DURATION = 4.5;
const START_ZOOM = 150;
const END_ZOOM = 100;
const START_ROT = 230 * Math.PI / 180;
const END_ROT = 230 * Math.PI / 180;
const START_ORBIT_MULTIPLIER = 1;
const END_ORBIT_MULTIPLIER = 1;

const state = {
  active: false,
  elapsed: 0,
};

function easeOutCubic(t: number): number {
  const inv = 1 - t;
  return 1 - inv * inv * inv;
}

export interface ArrivalCinematicSample {
  active: boolean;
  zoom: number;
  rotation: number;
  orbitMultiplier: number;
}

export function startArrivalCinematic() {
  state.active = true;
  state.elapsed = 0;
}

export function isArrivalCinematicActive(): boolean {
  return state.active;
}

export function sampleArrivalCinematic(delta: number): ArrivalCinematicSample {
  if (!state.active) {
    return { active: false, zoom: END_ZOOM, rotation: END_ROT, orbitMultiplier: END_ORBIT_MULTIPLIER };
  }

  state.elapsed += delta;
  const linear = Math.min(1, state.elapsed / DURATION);
  const eased = easeOutCubic(linear);
  if (linear >= 1) state.active = false;

  return {
    active: true,
    zoom: START_ZOOM + (END_ZOOM - START_ZOOM) * eased,
    rotation: START_ROT + (END_ROT - START_ROT) * eased,
    orbitMultiplier: START_ORBIT_MULTIPLIER + (END_ORBIT_MULTIPLIER - START_ORBIT_MULTIPLIER) * eased,
  };
}
