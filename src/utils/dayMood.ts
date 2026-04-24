/**
 * Per-in-game-day atmospheric mood. Each 24h block gets a stable
 * (warmth, saturation, fogDensity) triplet that biases the dawn/dusk palette
 * without changing its overall structure — the curve predawn → dusk → night
 * still plays out, but the peak colors shift between gray-overcast and
 * blazing-orange, and haze can thicken or thin.
 */

export interface DayMood {
  /** 0 = gray overcast, 1 = blazing orange. Skewed toward higher values. */
  warmth: number;
  /** Multiplier on the sunset saturation/hue bump in postprocessing. */
  saturation: number;
  /** Multiplier on fog reach during the golden-hour band (lower = hazier). */
  fogDensity: number;
}

/** Overcast gray used when blending the warm sunset band toward neutral. */
export const MOOD_OVERCAST_WARM_HEX = '#8c97a0';

function hash32(n: number): number {
  n = (n | 0) ^ 0x9e3779b1;
  n = Math.imul(n ^ (n >>> 16), 0x85ebca6b);
  n = Math.imul(n ^ (n >>> 13), 0xc2b2ae35);
  n ^= n >>> 16;
  return n >>> 0;
}

function rand01(seed: number, salt: number): number {
  return hash32(seed ^ Math.imul(salt | 0, 0x9e3779b1)) / 0x1_0000_0000;
}

export function computeDayMood(timeOfDay: number, worldSeed: number): DayMood {
  const day = Math.floor(timeOfDay / 24);
  const seed = (worldSeed | 0) ^ Math.imul(day, 0x27d4eb2d);
  // pow(roll, 0.55) pushes the mean up to ~0.65 — most days feel saturated,
  // overcast dawns are occasional rather than routine.
  const warmth = Math.pow(rand01(seed, 1), 0.55);
  const saturation = 0.55 + rand01(seed, 2) * 0.85;   // 0.55 – 1.40
  const fogDensity = 0.6 + rand01(seed, 3) * 0.55;    // 0.60 – 1.15
  return { warmth, saturation, fogDensity };
}
