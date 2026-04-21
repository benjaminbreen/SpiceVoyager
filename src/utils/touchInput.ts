// Shared mutable touch input — kept outside React/Zustand so per-frame reads
// in Ship.tsx / Player.tsx don't trigger re-renders. Mirrors combatState.ts.
//
// Ship mode has two steering strategies (user-selectable in Settings):
//   - 'tap'      — tap the water to set a target heading; sail toggles throttle.
//   - 'joystick' — dual-axis joystick (x = turn, y = throttle). Mirrors WASD.
// Walking mode always uses a joystick.
//
// NOTE: "sail raised" in tap mode is NOT here — it lives in the store as
// `touchSailRaised` so the SailToggleButton re-renders when the raycaster
// auto-raises the sail on an ocean tap.

export const touchShipInput = {
  // tap-to-steer
  targetHeading: null as number | null,  // world-space yaw (radians), or null

  // joystick
  turnInput: 0,                          // -1..1 (left/right)
  throttleInput: 0,                      // -1..1 (forward/back)
};

export const touchWalkInput = {
  x: 0,  // -1..1 strafe (right positive, matches keyboard D)
  y: 0,  // -1..1 forward (forward positive, matches keyboard W)
};

export function resetTouchInput() {
  touchShipInput.targetHeading = null;
  touchShipInput.turnInput = 0;
  touchShipInput.throttleInput = 0;
  touchWalkInput.x = 0;
  touchWalkInput.y = 0;
  // Callers that also want to drop the sail should call setTouchSailRaised(false).
}
