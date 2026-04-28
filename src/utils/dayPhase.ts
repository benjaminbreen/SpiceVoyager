import * as THREE from 'three';

// Eleven-keyframe time-of-day palette for the splash globe (port scenes
// use PORT_DAY_KEYS below). `phase` is normalized to [0, 1):
//   0.00 dawn       0.10 morning     0.38 afternoon
//   0.55 sunset     0.66 dusk        0.76 night entry
//   0.84 deep night 0.94 STILL deep  0.97 first ember
//   0.99 dawn rise  1.00 wraps to dawn
// 0.84 and 0.94 carry IDENTICAL values, so the palette literally rests at
// peak darkness for the 10% between them rather than continuously lerping
// through a single deep-night stop. Combined with the 120s cycle (see
// GlobeDriver), this gives ~12s of unchanging held night plus ~28s of
// gradual approach/exit on either side.
const DAY_KEYS = [
  { p: 0.00, top: '#7d4d6f', horizon: '#f7c08a', sun: '#ffd198', cool: '#5b6e8a', sunI: 1.4,  ambI: 0.55, stars: 0.20 },
  { p: 0.10, top: '#79b3dd', horizon: '#f8e6c4', sun: '#fff7e2', cool: '#bcd6e6', sunI: 1.65, ambI: 0.7,  stars: 0.0  },
  { p: 0.38, top: '#5485b6', horizon: '#bfd6e8', sun: '#fff4d0', cool: '#9bbfd8', sunI: 1.7,  ambI: 0.7,  stars: 0.0  },
  { p: 0.55, top: '#3a5277', horizon: '#f1956a', sun: '#ff9764', cool: '#8a5a72', sunI: 1.5,  ambI: 0.6,  stars: 0.10 },
  { p: 0.66, top: '#1a1a3a', horizon: '#3a2a4a', sun: '#9b88c0', cool: '#3a4a6c', sunI: 0.35, ambI: 0.32, stars: 0.55 },
  { p: 0.76, top: '#0e1228', horizon: '#1c1838', sun: '#5060a0', cool: '#2a3454', sunI: 0.05, ambI: 0.32, stars: 0.95 },
  // Hold pair — both stops carry the deepest-night palette; the palette
  // stays flat for the entire interval so it really feels like night.
  { p: 0.84, top: '#070a1c', horizon: '#10122a', sun: '#404870', cool: '#26304e', sunI: 0.0,  ambI: 0.34, stars: 1.0  },
  { p: 0.94, top: '#070a1c', horizon: '#10122a', sun: '#404870', cool: '#26304e', sunI: 0.0,  ambI: 0.34, stars: 1.0  },
  // First ember: top still inky, horizon picks up a deep-violet hint, stars
  // mostly still showing. This is the "false dawn" stop you see in real skies.
  { p: 0.97, top: '#141228', horizon: '#3a2436', sun: '#7a5a78', cool: '#231e3a', sunI: 0.10, ambI: 0.24, stars: 0.70 },
  // Dawn rise: top warming to plum, horizon glowing peach, stars dimming out.
  { p: 0.99, top: '#4a3a5e', horizon: '#c08272', sun: '#ffba8c', cool: '#3e5074', sunI: 0.85, ambI: 0.42, stars: 0.32 },
  { p: 1.00, top: '#7d4d6f', horizon: '#f7c08a', sun: '#ffd198', cool: '#5b6e8a', sunI: 1.4,  ambI: 0.55, stars: 0.20 },
];

export type DayState = {
  skyTop: THREE.Color;
  skyHorizon: THREE.Color;
  sunColor: THREE.Color;
  coolColor: THREE.Color;
  sunIntensity: number;
  ambIntensity: number;
  starOpacity: number;
  sunDir: THREE.Vector3;
};

export function makeDayState(): DayState {
  return {
    skyTop: new THREE.Color(),
    skyHorizon: new THREE.Color(),
    sunColor: new THREE.Color(),
    coolColor: new THREE.Color(),
    sunIntensity: 1,
    ambIntensity: 0.5,
    starOpacity: 0,
    sunDir: new THREE.Vector3(0.5, 0.6, 0.7).normalize(),
  };
}

const _tmpA = new THREE.Color();
const _tmpB = new THREE.Color();

function lerpColor(out: THREE.Color, a: THREE.Color, b: THREE.Color, t: number) {
  out.r = a.r + (b.r - a.r) * t;
  out.g = a.g + (b.g - a.g) * t;
  out.b = a.b + (b.b - a.b) * t;
}

export function sampleDayPalette(phase: number, out: DayState) {
  const p = ((phase % 1) + 1) % 1;
  let i = 0;
  while (i < DAY_KEYS.length - 1 && DAY_KEYS[i + 1].p <= p) i++;
  const a = DAY_KEYS[i];
  const b = DAY_KEYS[i + 1] ?? DAY_KEYS[i];
  const span = (b.p - a.p) || 1;
  const t = THREE.MathUtils.clamp((p - a.p) / span, 0, 1);
  lerpColor(out.skyTop,     _tmpA.set(a.top),     _tmpB.set(b.top),     t);
  lerpColor(out.skyHorizon, _tmpA.set(a.horizon), _tmpB.set(b.horizon), t);
  lerpColor(out.sunColor,   _tmpA.set(a.sun),     _tmpB.set(b.sun),     t);
  lerpColor(out.coolColor,  _tmpA.set(a.cool),    _tmpB.set(b.cool),    t);
  out.sunIntensity = THREE.MathUtils.lerp(a.sunI, b.sunI, t);
  out.ambIntensity = THREE.MathUtils.lerp(a.ambI, b.ambI, t);
  out.starOpacity  = THREE.MathUtils.lerp(a.stars, b.stars, t);
  // Sun arc: phase 0 east, 0.25 high noon, 0.5 west, 0.75 below horizon.
  const sunAngle = p * Math.PI * 2 - Math.PI / 2;
  out.sunDir.set(Math.cos(sunAngle) * 0.85, Math.sin(sunAngle), 0.42).normalize();
}

// Game-clock convention: timeOfDay ∈ [0, 24), 6 AM is sunrise, 6 PM is sunset.
// Mapped so 6 → 0 (dawn), 12 → 0.25, 18 → 0.5 (sunset), 0 → 0.75 (midnight).
export function timeOfDayToPhase(hours: number): number {
  return (((hours - 6) % 24) + 24) % 24 / 24;
}

// Hour-keyed palette for port-side scenes — uniform 24h spacing so the colors
// land on real wall-clock moments, with a literal sun arc (6am east horizon,
// noon overhead, 6pm west horizon, midnight below).
const PORT_DAY_KEYS = [
  { h:  0, top: '#0a0a1e', horizon: '#1c1838', sun: '#666688', cool: '#1c2238', sunI: 0.0,  ambI: 0.22, stars: 1.0  },
  { h:  4, top: '#1a1c40', horizon: '#3a2a4a', sun: '#7c6ba0', cool: '#2c3252', sunI: 0.05, ambI: 0.25, stars: 1.0  },
  { h:  6, top: '#7d4d6f', horizon: '#f7c08a', sun: '#ffd198', cool: '#5b6e8a', sunI: 1.30, ambI: 0.50, stars: 0.35 },
  { h:  9, top: '#79b3dd', horizon: '#f8e6c4', sun: '#fff7e2', cool: '#bcd6e6', sunI: 1.65, ambI: 0.70, stars: 0.0  },
  { h: 13, top: '#5485b6', horizon: '#bfd6e8', sun: '#fff4d0', cool: '#9bbfd8', sunI: 1.70, ambI: 0.70, stars: 0.0  },
  { h: 17, top: '#5a85b6', horizon: '#e8c894', sun: '#ffd496', cool: '#8090a8', sunI: 1.50, ambI: 0.65, stars: 0.0  },
  { h: 19, top: '#3a5277', horizon: '#f1956a', sun: '#ff9764', cool: '#8a5a72', sunI: 0.80, ambI: 0.50, stars: 0.35 },
  { h: 21, top: '#1a1a3a', horizon: '#3a2a4a', sun: '#9b88c0', cool: '#3a4a6c', sunI: 0.15, ambI: 0.32, stars: 1.0  },
  { h: 24, top: '#0a0a1e', horizon: '#1c1838', sun: '#666688', cool: '#1c2238', sunI: 0.0,  ambI: 0.22, stars: 1.0  },
];

export function samplePortDay(hours: number, out: DayState) {
  const h = (((hours % 24) + 24) % 24);
  let i = 0;
  while (i < PORT_DAY_KEYS.length - 1 && PORT_DAY_KEYS[i + 1].h <= h) i++;
  const a = PORT_DAY_KEYS[i];
  const b = PORT_DAY_KEYS[i + 1] ?? PORT_DAY_KEYS[i];
  const span = (b.h - a.h) || 1;
  const t = THREE.MathUtils.clamp((h - a.h) / span, 0, 1);
  lerpColor(out.skyTop,     _tmpA.set(a.top),     _tmpB.set(b.top),     t);
  lerpColor(out.skyHorizon, _tmpA.set(a.horizon), _tmpB.set(b.horizon), t);
  lerpColor(out.sunColor,   _tmpA.set(a.sun),     _tmpB.set(b.sun),     t);
  lerpColor(out.coolColor,  _tmpA.set(a.cool),    _tmpB.set(b.cool),    t);
  out.sunIntensity = THREE.MathUtils.lerp(a.sunI, b.sunI, t);
  out.ambIntensity = THREE.MathUtils.lerp(a.ambI, b.ambI, t);
  out.starOpacity  = THREE.MathUtils.lerp(a.stars, b.stars, t);
  // Literal sun arc: 6am east horizon → 12pm overhead → 6pm west horizon → midnight below.
  // The +z bias keeps the sun in front of a -Z-looking camera so the warm bloom hits visible sky.
  const angle = ((h - 6) / 24) * Math.PI * 2;
  out.sunDir.set(Math.cos(angle) * 0.7, Math.sin(angle), -0.7).normalize();
}
