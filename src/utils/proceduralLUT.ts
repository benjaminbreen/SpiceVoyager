// Procedural 3D color grading LUT.
//
// Generates a LookupTexture from a small set of color-grading parameters so
// the dev panel can dial in a "look" live without shipping any LUT assets.
// Three presets are tuned for the Indian Ocean trade setting: tropical
// (high-sun coastal), temperate (Atlantic/Mediterranean), monsoon (rainy
// season — diffuse, desaturated, slight green cast).
//
// The LUT is sampled by LUT3DEffect after tonemapping, so input/output are
// treated as sRGB-display [0,1]. Math is intentionally simple: temperature,
// tint, contrast, luminance-zoned warmth and lift/roll, then saturation.
// 16³ keeps rebuilds cheap during dawn/dusk and weather transitions.

import { LookupTexture } from 'postprocessing';

export interface LUTParams {
  /** Cool (-1) ↔ warm (+1). Shifts r up / b down. */
  temperature: number;
  /** Magenta (-1) ↔ green (+1). Shifts g. */
  tint: number;
  /** 0..2, 1 = neutral. Pulls colors toward/away from luminance. */
  saturation: number;
  /** 0..2, 1 = neutral. Steepens/flattens around 0.5. */
  contrast: number;
  /** -1..1. Warmth bias applied weighted by (1-L)². */
  shadowWarmth: number;
  /** -1..1. Warmth bias applied weighted by L². */
  highlightWarmth: number;
  /** -0.5..0.5. Lifts (positive) or crushes (negative) shadows. */
  shadowLift: number;
  /** -0.5..0.5. Compresses (negative) or lifts (positive) highlights. */
  highlightRoll: number;
}

export type LUTPresetId = 'tropical' | 'temperate' | 'monsoon';

export const LUT_PRESETS: Record<LUTPresetId, LUTParams> = {
  // Coastal Indian Ocean — Surat, Calicut, Aceh. Sun-bleached but still
  // saturated; warm shadows from atmospheric scatter, cream-cyan highlights.
  tropical: {
    temperature: 0.18,
    tint: -0.04,
    saturation: 1.12,
    contrast: 1.06,
    shadowWarmth: 0.35,
    highlightWarmth: 0.15,
    shadowLift: 0.04,
    highlightRoll: -0.05,
  },
  // Lisbon, London, Venice. Cooler diffuse light, lower saturation, slight
  // blue lift in shadows, muted warm highlights.
  temperate: {
    temperature: -0.15,
    tint: 0.02,
    saturation: 0.92,
    contrast: 1.02,
    shadowWarmth: -0.18,
    highlightWarmth: 0.12,
    shadowLift: 0.06,
    highlightRoll: -0.03,
  },
  // Monsoon — Surat in August, Cochin June–Sept. Heavy diffuse light, low
  // saturation, greenish-gray cast, crushed warm blacks.
  monsoon: {
    temperature: -0.05,
    tint: 0.12,
    saturation: 0.74,
    contrast: 0.94,
    shadowWarmth: 0.18,
    highlightWarmth: -0.08,
    shadowLift: -0.02,
    highlightRoll: -0.08,
  },
};

export const LUT_NEUTRAL: LUTParams = {
  temperature: 0,
  tint: 0,
  saturation: 1,
  contrast: 1,
  shadowWarmth: 0,
  highlightWarmth: 0,
  shadowLift: 0,
  highlightRoll: 0,
};

const LUT_SIZE = 16;

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// Rec.709 luma — matches what the eye reads as brightness.
function luma(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function buildLUT(params: LUTParams): LookupTexture {
  const tex = LookupTexture.createNeutral(LUT_SIZE);
  const data = tex.image.data as Float32Array;
  const N = LUT_SIZE;
  const inv = 1 / (N - 1);

  const tempR = params.temperature * 0.10;
  const tempB = -params.temperature * 0.10;
  const tintG = params.tint * 0.08;
  const tintRB = -params.tint * 0.04;

  for (let bi = 0; bi < N; bi++) {
    for (let gi = 0; gi < N; gi++) {
      for (let ri = 0; ri < N; ri++) {
        let r = ri * inv;
        let g = gi * inv;
        let b = bi * inv;

        // 1. Temperature + tint (white-balance-ish).
        r += tempR + tintRB;
        g += tintG;
        b += tempB + tintRB;

        // 2. Contrast around 0.5.
        r = (r - 0.5) * params.contrast + 0.5;
        g = (g - 0.5) * params.contrast + 0.5;
        b = (b - 0.5) * params.contrast + 0.5;

        // 3. Luminance-zoned warmth (shadows vs highlights).
        const L = clamp01(luma(r, g, b));
        const shadowW = (1 - L) * (1 - L);
        const highW = L * L;
        const warmShift =
          params.shadowWarmth * shadowW + params.highlightWarmth * highW;
        r += warmShift * 0.10;
        b -= warmShift * 0.10;

        // 4. Shadow lift / highlight roll-off.
        r += params.shadowLift * shadowW;
        g += params.shadowLift * shadowW;
        b += params.shadowLift * shadowW;
        r += params.highlightRoll * highW;
        g += params.highlightRoll * highW;
        b += params.highlightRoll * highW;

        // 5. Saturation around per-pixel luminance.
        const L2 = luma(r, g, b);
        r = L2 + (r - L2) * params.saturation;
        g = L2 + (g - L2) * params.saturation;
        b = L2 + (b - L2) * params.saturation;

        const idx = (ri + gi * N + bi * N * N) * 4;
        data[idx] = clamp01(r);
        data[idx + 1] = clamp01(g);
        data[idx + 2] = clamp01(b);
        data[idx + 3] = 1;
      }
    }
  }

  tex.needsUpdate = true;
  return tex;
}

// Stable hash of params for useMemo key — JSON.stringify works but keying on
// a fixed-precision string is cheaper and avoids rebuilding for sub-1e-3
// slider jitter.
export function lutParamsKey(p: LUTParams): string {
  return [
    p.temperature, p.tint, p.saturation, p.contrast,
    p.shadowWarmth, p.highlightWarmth, p.shadowLift, p.highlightRoll,
  ].map((v) => v.toFixed(3)).join('|');
}

/** Sum two LUT param sets channel-wise. Saturation/contrast are multiplicative
 *  in spirit (1 = neutral), so we add the *delta from 1* rather than the raw
 *  values — i.e. (a.sat - 1) + (b.sat - 1) + 1. Other params are additive. */
export function addLUTParams(a: LUTParams, b: LUTParams): LUTParams {
  return {
    temperature:     a.temperature     + b.temperature,
    tint:            a.tint            + b.tint,
    saturation:      a.saturation      + (b.saturation - 1),
    contrast:        a.contrast        + (b.contrast - 1),
    shadowWarmth:    a.shadowWarmth    + b.shadowWarmth,
    highlightWarmth: a.highlightWarmth + b.highlightWarmth,
    shadowLift:      a.shadowLift      + b.shadowLift,
    highlightRoll:   a.highlightRoll   + b.highlightRoll,
  };
}

function gauss(x: number, center: number, width: number): number {
  const k = (x - center) / width;
  return Math.exp(-k * k);
}

/** Subtle time-of-day mood grade. Returns deltas to add onto NEUTRAL.
 *
 *  Signals:
 *  - Sunny midday: small saturation + highlight warmth boost, peaks ~13:00.
 *  - Golden hour:  warmth in temperature + shadows, peaks ~18:30.
 *  - Dawn:         gentler rose warmth, peaks ~6:30.
 *  - Deep night:   subtle cool/desaturate.
 *
 *  All clear-sky signals are killed by rain so storms read as overcast and
 *  the rain-driven monsoon shift takes over. Magnitudes are intentionally
 *  small (tenths) — meant to be felt, not seen. */
export function computeMoodDelta(hour: number, weatherIntensity: number): LUTParams {
  const clear = Math.max(0, 1 - weatherIntensity);

  const noon = gauss(hour, 13, 4) * clear;
  const dusk = gauss(hour, 18.5, 1.2) * clear;
  const dawn = gauss(hour, 6.5, 1.0) * clear;
  // Night: 0 during daytime, ramps in past 21:00 and pre-04:00.
  const lateNight = Math.max(0, (hour - 21) / 3);
  const earlyNight = Math.max(0, (4 - hour) / 4);
  const night = Math.min(1, Math.max(lateNight, earlyNight));

  const delta: LUTParams = {
    temperature:     0.10 * dusk + 0.05 * dawn - 0.04 * night,
    tint:           -0.02 * dawn,
    saturation:      1 + 0.05 * noon - 0.06 * night,
    contrast:        1 + 0.03 * noon,
    shadowWarmth:    0.08 * dusk + 0.04 * dawn,
    highlightWarmth: 0.06 * noon + 0.05 * dusk,
    shadowLift:      0.02 * night,
    highlightRoll:   0,
  };
  return delta;
}

/** True if params differ enough from neutral to warrant building/binding the
 *  LUT pass. Cheap and avoids paying for a no-op LUT on perfectly neutral
 *  frames (e.g. exactly noon, no weather). */
export function lutDiffersFromNeutral(p: LUTParams): boolean {
  const eps = 0.005;
  return (
    Math.abs(p.temperature) > eps ||
    Math.abs(p.tint) > eps ||
    Math.abs(p.saturation - 1) > eps ||
    Math.abs(p.contrast - 1) > eps ||
    Math.abs(p.shadowWarmth) > eps ||
    Math.abs(p.highlightWarmth) > eps ||
    Math.abs(p.shadowLift) > eps ||
    Math.abs(p.highlightRoll) > eps
  );
}

/** Linear blend between two LUT param sets. t=0 returns a, t=1 returns b. */
export function lerpLUTParams(a: LUTParams, b: LUTParams, t: number): LUTParams {
  const k = t < 0 ? 0 : t > 1 ? 1 : t;
  return {
    temperature:     a.temperature     + (b.temperature     - a.temperature)     * k,
    tint:            a.tint            + (b.tint            - a.tint)            * k,
    saturation:      a.saturation      + (b.saturation      - a.saturation)      * k,
    contrast:        a.contrast        + (b.contrast        - a.contrast)        * k,
    shadowWarmth:    a.shadowWarmth    + (b.shadowWarmth    - a.shadowWarmth)    * k,
    highlightWarmth: a.highlightWarmth + (b.highlightWarmth - a.highlightWarmth) * k,
    shadowLift:      a.shadowLift      + (b.shadowLift      - a.shadowLift)      * k,
    highlightRoll:   a.highlightRoll   + (b.highlightRoll   - a.highlightRoll)   * k,
  };
}
