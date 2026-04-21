// Shared mutable touch input — kept outside React/Zustand so per-frame reads
// in Ship.tsx / Player.tsx don't trigger re-renders. Mirrors combatState.ts.
//
// Ship mode has two steering strategies (user-selectable in Settings):
//   - 'tap'      — tap the water to set a target heading; sail toggles throttle.
//   - 'joystick' — dual-axis joystick (x = turn, y = throttle). Mirrors WASD.
// Walking mode always uses a joystick.

export const touchShipInput = {
  // tap-to-steer
  targetHeading: null as number | null,  // world-space yaw (radians), or null
  sailRaised: false,                     // throttle 0 or 1 in tap mode

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
  touchShipInput.sailRaised = false;
  touchShipInput.turnInput = 0;
  touchShipInput.throttleInput = 0;
  touchWalkInput.x = 0;
  touchWalkInput.y = 0;
}
