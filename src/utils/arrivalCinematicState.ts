// One-shot port arrival cinematic after world-map fast travel.
// Kept outside Zustand so CameraController can sample it every frame without
// UI re-renders or adding persistence surface.

const DURATION = 5.0;
const START_ZOOM = 134;
const END_ZOOM = 50;
const START_ROT = 330 * Math.PI / 180;
const END_ROT = 230 * Math.PI / 180;

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
    return { active: false, zoom: END_ZOOM, rotation: END_ROT };
  }

  state.elapsed += delta;
  const linear = Math.min(1, state.elapsed / DURATION);
  const eased = easeOutCubic(linear);
  if (linear >= 1) state.active = false;

  return {
    active: true,
    zoom: START_ZOOM + (END_ZOOM - START_ZOOM) * eased,
    rotation: START_ROT + (END_ROT - START_ROT) * eased,
  };
}
