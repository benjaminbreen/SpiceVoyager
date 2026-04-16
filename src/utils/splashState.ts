// Shared mutable splash/splinter state — kept outside React/Zustand for per-frame perf.
// Any component can call spawnSplash() or spawnSplinters(); the SplashSystem
// component reads these each frame to drive particles + the ripple shader.

export interface SplashEvent {
  x: number;
  z: number;
  time: number;       // clock time when spawned (elapsed seconds)
  intensity: number;  // 0-1, scales particle count and ripple amplitude
}

export interface SplinterEvent {
  x: number;
  y: number;
  z: number;
  time: number;
  intensity: number;
}

// Ring of active splashes — oldest get overwritten
const MAX_SPLASHES = 8;
export const splashes: SplashEvent[] = [];

const MAX_SPLINTERS = 8;
export const splinters: SplinterEvent[] = [];

let _nextClock = 0; // set by SplashSystem each frame

export function setSplashClock(t: number) { _nextClock = t; }

export function spawnSplash(x: number, z: number, intensity = 1) {
  const ev: SplashEvent = { x, z, time: _nextClock, intensity: Math.min(1, Math.max(0.1, intensity)) };
  if (splashes.length >= MAX_SPLASHES) {
    splashes.shift();
  }
  splashes.push(ev);
}

export function spawnSplinters(x: number, y: number, z: number, intensity = 1) {
  const ev: SplinterEvent = { x, y, z, time: _nextClock, intensity: Math.min(1, Math.max(0.1, intensity)) };
  if (splinters.length >= MAX_SPLINTERS) {
    splinters.shift();
  }
  splinters.push(ev);
}
