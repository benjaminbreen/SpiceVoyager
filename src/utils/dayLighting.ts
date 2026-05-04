import * as THREE from 'three';
import { computeDayMood } from './dayMood';
import type { WaterPaletteId } from './waterPalettes';

export interface DayLighting {
  sunPosition: THREE.Vector3;
  ambientColor: THREE.Color;
  groundColor: THREE.Color;
  ambientIntensity: number;
  sunColor: THREE.Color;
  sunIntensity: number;
  moonPosition: THREE.Vector3;
  moonIntensity: number;
  shadowRadius: number;
  shadowIntensity: number;
}

type LightProfile = {
  ambCol: THREE.Color; groundCol: THREE.Color; ambBase: number; ambScale: number;
  sunCol: THREE.Color; sunBase: number; sunScale: number; shadowRadius: number; shadowIntensity: number;
};

// Climate-dependent lighting profiles — each shapes sky fill, ground bounce,
// sun color, and ambient-to-sun ratio (which controls shadow color/softness).
const LIGHT_PROFILES: Record<string, LightProfile> = {
  tropical: {
    ambCol: new THREE.Color(0.62, 0.78, 0.96), groundCol: new THREE.Color(0.74, 0.70, 0.56),
    ambBase: 0.42, ambScale: 0.10,
    sunCol: new THREE.Color(1.0, 0.92, 0.72), sunBase: 1.24, sunScale: 0.88,
    shadowRadius: 4.2,
    shadowIntensity: 0.84,
  },
  monsoon: {
    ambCol: new THREE.Color(0.50, 0.66, 0.72), groundCol: new THREE.Color(0.34, 0.36, 0.24),
    ambBase: 0.24, ambScale: 0.055,
    sunCol: new THREE.Color(1.0, 0.88, 0.62), sunBase: 1.24, sunScale: 0.82,
    shadowRadius: 4.3,
    shadowIntensity: 0.88,
  },
  temperate: {
    ambCol: new THREE.Color(0.62, 0.68, 0.78), groundCol: new THREE.Color(0.38, 0.34, 0.28),
    ambBase: 0.31, ambScale: 0.055,
    sunCol: new THREE.Color(0.90, 0.88, 0.84), sunBase: 1.02, sunScale: 0.68,
    shadowRadius: 5.8,
    shadowIntensity: 0.90,
  },
  arid: {
    ambCol: new THREE.Color(0.72, 0.76, 0.78), groundCol: new THREE.Color(0.78, 0.63, 0.38),
    ambBase: 0.42, ambScale: 0.12,
    sunCol: new THREE.Color(1.0, 0.88, 0.65), sunBase: 1.38, sunScale: 0.92,
    shadowRadius: 3.6,
    shadowIntensity: 0.66,
  },
  mediterranean: {
    ambCol: new THREE.Color(0.66, 0.78, 0.96), groundCol: new THREE.Color(0.78, 0.72, 0.58),
    ambBase: 0.40, ambScale: 0.10,
    sunCol: new THREE.Color(1.0, 0.86, 0.58), sunBase: 1.36, sunScale: 0.92,
    shadowRadius: 3.6,
    shadowIntensity: 0.80,
  },
};

export interface DayLightingArgs {
  timeOfDay: number;
  worldSeed: number;
  waterPaletteId: WaterPaletteId;
}

export function computeDayLighting({ timeOfDay, worldSeed, waterPaletteId }: DayLightingArgs): DayLighting {
  const angle = ((timeOfDay - 6) / 24) * Math.PI * 2; // 6 AM is sunrise
  const sunH = Math.sin(angle); // -1 to 1, how high the sun is
  const mood = computeDayMood(timeOfDay, worldSeed);

  // Tropical sun path — arcs from east, very high overhead at midday, to west.
  // Height uses a flattened curve so the sun stays near-overhead for hours (short shadows).
  // Z varies sinusoidally so shadows rotate through the day like a real sundial.
  const clampedSunH = Math.max(0, sunH);
  const tropicalHeight = Math.pow(clampedSunH, 0.55) * 100; // flattened peak: stays high longer
  const sunPos = new THREE.Vector3(
    Math.cos(angle) * 100,                    // east-west arc
    tropicalHeight,                            // height: nearly overhead for wide midday window
    -Math.sin(angle) * 15                      // north-south: shadows rotate through the day
  );

  const lp = LIGHT_PROFILES[waterPaletteId] ?? LIGHT_PROFILES.tropical;

  // Hemisphere light — sky color (top) + ground bounce color (bottom)
  let ambInt: number, ambCol: THREE.Color, groundCol: THREE.Color;
  if (sunH > 0.35) {
    ambInt = lp.ambBase + sunH * lp.ambScale;
    ambCol = lp.ambCol;
    groundCol = lp.groundCol;
  } else if (sunH > -0.15) {
    const t = (sunH + 0.15) / 0.5;
    ambInt = 0.20 + t * (lp.ambBase - 0.20);
    ambCol = new THREE.Color().lerpColors(
      new THREE.Color(0.18, 0.22, 0.42),
      new THREE.Color().lerpColors(new THREE.Color(1.0, 0.70, 0.44), lp.ambCol, 0.3),
      t
    );
    groundCol = new THREE.Color().lerpColors(
      new THREE.Color(0.08, 0.07, 0.14),
      lp.groundCol,
      t
    );
  } else {
    ambInt = 0.24;
    ambCol = new THREE.Color(0.18, 0.23, 0.43);
    groundCol = new THREE.Color(0.07, 0.07, 0.13);
  }

  // Directional sun light — intensity and color shaped by climate, with the
  // low-sun warm color biased by daymood warmth (overcast dawns drop the
  // aggressive orange toward a silver-gray).
  let sInt: number, sCol: THREE.Color;
  if (sunH > 0.35) {
    sInt = lp.sunBase + sunH * lp.sunScale;
    sCol = lp.sunCol;
  } else if (sunH > -0.05) {
    const t = (sunH + 0.05) / 0.4;
    sInt = t * lp.sunBase;
    const moodWarmSun = new THREE.Color(0.86, 0.84, 0.80).lerp(
      new THREE.Color(1.0, 0.42, 0.12),
      mood.warmth,
    );
    sCol = new THREE.Color().lerpColors(moodWarmSun, lp.sunCol, t);
  } else {
    sInt = 0;
    sCol = new THREE.Color(0, 0, 0);
  }

  // Moonlight — opposite the sun, cool silver-blue
  const moonPos = new THREE.Vector3(-Math.cos(angle) * 100, Math.max(10, -Math.sin(angle) * 80), 30);
  const moonInt = sunH < 0.1 ? Math.max(0, Math.min(0.3, (0.1 - sunH) * 1.5)) : 0;

  return {
    sunPosition: sunPos,
    ambientColor: ambCol,
    groundColor: groundCol,
    ambientIntensity: ambInt,
    sunColor: sCol,
    sunIntensity: sInt,
    moonPosition: moonPos,
    moonIntensity: moonInt,
    shadowRadius: lp.shadowRadius,
    shadowIntensity: lp.shadowIntensity,
  };
}
