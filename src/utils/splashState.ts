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

export interface ImpactBurstEvent {
  x: number;
  y: number;
  z: number;
  time: number;
  intensity: number;
}

export interface RicochetBurstEvent {
  x: number;
  y: number;
  z: number;
  dirX: number;
  dirY: number;
  dirZ: number;
  time: number;
  intensity: number;
}

export interface MuzzleBurstEvent {
  x: number;
  y: number;
  z: number;
  dirX: number;
  dirY: number;
  dirZ: number;
  time: number;
  intensity: number;
}

/** Smoke-trail puff emitted continuously along a rocket's flight path.
 *  Short-lived (<1s) but many are alive simultaneously, so the ring is
 *  larger than the other effect buffers. */
export interface RocketTrailEvent {
  x: number;
  y: number;
  z: number;
  /** Normalized velocity direction at spawn — puffs stream backward from this. */
  vx: number;
  vy: number;
  vz: number;
  time: number;
  /** Small random seed so each puff drifts slightly differently. */
  seed: number;
}

/** Bright fire-burst at rocket detonation — visually distinct from the grey
 *  impactBurst used by cannon shots. */
export interface RocketFireBurstEvent {
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

const MAX_IMPACT_BURSTS = 12;
export const impactBursts: ImpactBurstEvent[] = [];

const MAX_RICOCHET_BURSTS = 12;
export const ricochetBursts: RicochetBurstEvent[] = [];

const MAX_MUZZLE_BURSTS = 12;
export const muzzleBursts: MuzzleBurstEvent[] = [];

// Rocket trails — a rocket spawns a puff every ~50ms while in flight, and
// each puff lives ~0.8s, so ~16 alive at once is the steady-state ceiling.
// Headroom for two simultaneous rockets.
const MAX_ROCKET_TRAIL = 40;
export const rocketTrails: RocketTrailEvent[] = [];

const MAX_ROCKET_FIRE_BURSTS = 8;
export const rocketFireBursts: RocketFireBurstEvent[] = [];

let _nextClock = 0; // set by SplashSystem each frame

export function setSplashClock(t: number) { _nextClock = t; }

export function spawnSplash(x: number, z: number, intensity = 1) {
  const ev: SplashEvent = { x, z, time: _nextClock, intensity: Math.min(2.4, Math.max(0.1, intensity)) };
  if (splashes.length >= MAX_SPLASHES) {
    splashes.shift();
  }
  splashes.push(ev);
}

export function spawnSplinters(x: number, y: number, z: number, intensity = 1) {
  const ev: SplinterEvent = { x, y, z, time: _nextClock, intensity: Math.min(2, Math.max(0.1, intensity)) };
  if (splinters.length >= MAX_SPLINTERS) {
    splinters.shift();
  }
  splinters.push(ev);
}

export function spawnImpactBurst(x: number, y: number, z: number, intensity = 1) {
  const ev: ImpactBurstEvent = { x, y, z, time: _nextClock, intensity: Math.min(2, Math.max(0.1, intensity)) };
  if (impactBursts.length >= MAX_IMPACT_BURSTS) {
    impactBursts.shift();
  }
  impactBursts.push(ev);
}

export function spawnRicochetBurst(
  x: number,
  y: number,
  z: number,
  dirX: number,
  dirY: number,
  dirZ: number,
  intensity = 1,
) {
  const ev: RicochetBurstEvent = {
    x,
    y,
    z,
    dirX,
    dirY,
    dirZ,
    time: _nextClock,
    intensity: Math.min(2.4, Math.max(0.1, intensity)),
  };
  if (ricochetBursts.length >= MAX_RICOCHET_BURSTS) {
    ricochetBursts.shift();
  }
  ricochetBursts.push(ev);
}

export function spawnRocketTrail(x: number, y: number, z: number, vx = 0, vy = 0, vz = 1) {
  const ev: RocketTrailEvent = { x, y, z, vx, vy, vz, time: _nextClock, seed: Math.random() };
  if (rocketTrails.length >= MAX_ROCKET_TRAIL) {
    rocketTrails.shift();
  }
  rocketTrails.push(ev);
}

export function spawnRocketFireBurst(x: number, y: number, z: number, intensity = 1) {
  const ev: RocketFireBurstEvent = { x, y, z, time: _nextClock, intensity: Math.min(2, Math.max(0.1, intensity)) };
  if (rocketFireBursts.length >= MAX_ROCKET_FIRE_BURSTS) {
    rocketFireBursts.shift();
  }
  rocketFireBursts.push(ev);
}

export function spawnMuzzleBurst(
  x: number,
  y: number,
  z: number,
  dirX: number,
  dirY: number,
  dirZ: number,
  intensity = 1,
) {
  const ev: MuzzleBurstEvent = {
    x,
    y,
    z,
    dirX,
    dirY,
    dirZ,
    time: _nextClock,
    intensity: Math.min(2, Math.max(0.1, intensity)),
  };
  if (muzzleBursts.length >= MAX_MUZZLE_BURSTS) {
    muzzleBursts.shift();
  }
  muzzleBursts.push(ev);
}
