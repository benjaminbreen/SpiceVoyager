import { Fragment, lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { Bloom, EffectComposer, SMAA, Vignette } from '@react-three/postprocessing';
import { motion } from 'framer-motion';
import * as THREE from 'three';
import { Info, Settings as SettingsIcon } from 'lucide-react';
import { type DayState, makeDayState, sampleDayPalette } from '../utils/dayPhase';
import { FACTION_SPAWN_WEIGHTS, useGameStore, type Nationality } from '../store/gameStore';
import { useIsMobile } from '../utils/useIsMobile';
import { sfxClick, sfxHover } from '../audio/SoundEffects';
import { audioManager } from '../audio/AudioManager';
import { ambientEngine } from '../audio/AmbientEngine';
import { AudioMuteButton } from './AudioMuteButton';
import {
  DistantBirds,
  NightStars,
  SkyClouds,
  SkyDome,
  SkyLights,
  SPLASH_CLOUDS,
} from './sky/SkyScene';

const SettingsModalV2 = lazy(() =>
  import('./SettingsModalV2').then((m) => ({ default: m.SettingsModalV2 }))
);
type SettingsTab = 'world' | 'display' | 'audio' | 'gameplay' | 'dev' | 'about';

interface Props {
  ready: boolean;
  loadingMessage: string;
  loadingProgress: number;
  shipName: string;
  captainName: string;
  crewCount: number;
  portCount: number;
  gold: number;
  onStart: () => void;
}

// ─── fonts ────────────────────────────────────────────────────────────────────
// Cinzel — historical Roman caps for the title block
// Cormorant Garamond — elegant subtitle italic
// Inter / DM Sans — body UI
const FONT_LINK_ID = 'claude-splash-fonts';
function injectFonts() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(FONT_LINK_ID)) return;
  const link = document.createElement('link');
  link.id = FONT_LINK_ID;
  link.rel = 'stylesheet';
  link.href =
    'https://fonts.googleapis.com/css2?family=Cinzel:wght@500;700;900&family=Cormorant+Garamond:ital,wght@0,500;0,700;1,500;1,700&family=Manrope:wght@400;500;600;700;800&family=Inter:wght@500;600;700;800&display=swap';
  document.head.appendChild(link);
}

const TITLE_FONT  = '"Cinzel", "Trajan Pro", "Cormorant Garamond", Georgia, serif';
const SUBTITLE_FN = '"Cormorant Garamond", "Cormorant", Georgia, serif';
// Manrope for body chrome (mono-ish UI text).
const BODY_FONT   = '"Manrope", "Inter", "DM Sans", system-ui, sans-serif';
// Card labels — elegant serif, sentence-case ("England", "Random", "Standard").
const CARD_LABEL_FONT = '"Cormorant Garamond", "EB Garamond", Georgia, serif';
const MONO        = '"SF Mono", "Fira Code", "Cascadia Code", Consolas, monospace';

type IntroProgressRef = React.MutableRefObject<number>;

const INTRO_CAMERA_DURATION = 3.35;
const INTRO_GLOBE_DURATION = 2.65;
const INTRO_SHIP_DELAY = 1.38;
const INTRO_SHIP_DURATION = 1.15;

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

function easeOutCubic(v: number) {
  const t = clamp01(v);
  return 1 - Math.pow(1 - t, 3);
}

function easeOutBack(v: number) {
  const t = clamp01(v);
  const c1 = 1.35;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

// ─── small util ──────────────────────────────────────────────────────────────

function latLonToVec3(lat: number, lon: number, r: number, target?: THREE.Vector3) {
  const phi = THREE.MathUtils.degToRad(90 - lat);
  const theta = THREE.MathUtils.degToRad(lon);
  const v = target ?? new THREE.Vector3();
  v.set(
    -r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta)
  );
  return v;
}

// ─── geometry constants ──────────────────────────────────────────────────────

const GLOBE_RADIUS = 1.42;
// Ship sits on the camera-facing meridian, lifted above the equator so the
// bottom button dock can't overlap it. Positive angle = north of equator =
// higher in screen space.
const SHIP_ANGLE = 0.12;
const SHIP_ANCHOR = new THREE.Vector3(
  0,
  GLOBE_RADIUS * Math.sin(SHIP_ANGLE),
  GLOBE_RADIUS * Math.cos(SHIP_ANGLE)
);

// ─── continent data — mostly ocean, only a few small islands ─────────────────

type Continent = {
  lat: number;
  lon: number;
  rx: number;
  rz: number;
  elevation: number;
  color: string;
  rotation: number;
  features?: Array<
    | { kind: 'mountain'; u: number; v: number; h: number }
    | { kind: 'volcano'; u: number; v: number; h: number }
    | { kind: 'tree'; u: number; v: number }
    | { kind: 'palm'; u: number; v: number }
    | { kind: 'temple'; u: number; v: number }
    | { kind: 'oasis'; u: number; v: number }
  >;
};

const LAND = '#5e9f4a';
const LAND_DARK = '#487a36';
const LAND_DESERT = '#e0a957';

const CONTINENTS: Continent[] = [
  // small "India-tip" island — mid-front
  {
    lat: 12, lon: 14, rx: 0.22, rz: 0.28, elevation: 0.022, color: LAND, rotation: 0.1,
    features: [
      { kind: 'mountain', u: -0.05, v: 0.18, h: 0.10 },
      { kind: 'tree', u: 0.12, v: -0.1 },
      { kind: 'tree', u: -0.18, v: 0.05 },
    ],
  },
  // tiny crescent
  { lat: 22, lon: -28, rx: 0.14, rz: 0.10, elevation: 0.018, color: LAND_DARK, rotation: 0.4 },
  // mid-distance archipelago: 3 small dots
  { lat: -10, lon: 38, rx: 0.10, rz: 0.08, elevation: 0.02, color: LAND, rotation: 0,
    features: [{ kind: 'volcano', u: 0, v: 0, h: 0.10 }] },
  { lat: -18, lon: 50, rx: 0.07, rz: 0.07, elevation: 0.018, color: LAND_DARK, rotation: 0 },
  { lat: -4,  lon: 52, rx: 0.08, rz: 0.09, elevation: 0.018, color: LAND, rotation: 0.2,
    features: [{ kind: 'tree', u: 0.0, v: 0.0 }] },
  // distant island — sits to the upper-right of the visible hemisphere,
  // well clear of the ship's spawn at lat=0/lon=90.
  { lat: 24, lon: 122, rx: 0.13, rz: 0.15, elevation: 0.022, color: LAND, rotation: -0.1,
    features: [{ kind: 'tree', u: 0.05, v: -0.1 }] },
  // far-side sliver to keep the back of the globe interesting
  { lat: -30, lon: 160, rx: 0.18, rz: 0.10, elevation: 0.018, color: LAND_DARK, rotation: 0.0 },
  // desert island — front-lower hemisphere. Larger and very flat, with a
  // ruined temple and an oasis with two leaning palms. Sits clear of the
  // india-tip patch above and well off the ship spawn.
  { lat: -14, lon: -2, rx: 0.20, rz: 0.22, elevation: 0.008, color: LAND_DESERT, rotation: 0.25,
    features: [
      { kind: 'temple', u: -0.10, v: -0.18 },
      { kind: 'oasis', u: 0.18, v: 0.20 },
      { kind: 'palm', u: 0.28, v: 0.08 },
      { kind: 'palm', u: 0.08, v: 0.30 },
    ] },
];

// ─── collision: bounding circle for each continent in globe-local frame ─────
// Ship's world position is fixed at SHIP_ANCHOR; the globe rotates underneath.
// Transforming SHIP_ANCHOR by the inverse globe rotation gives the ship's
// position in globe-local — then we just test angular distance to each
// continent center against its (slightly inflated) angular radius.
const CONTINENT_BOUNDS = CONTINENTS.map((c) => {
  const center = latLonToVec3(c.lat, c.lon, 1).normalize();
  // rx/rz are tangent-plane half-extents; convert to angular radius on the
  // sphere. 1.15 covers wobble; +0.03 gives the ship a tiny body radius so
  // it bumps the shore rather than overlapping it visibly.
  const angRadius = (Math.max(c.rx, c.rz) * 1.15 + 0.03) / GLOBE_RADIUS;
  return { center, cosRadius: Math.cos(angRadius) };
});

// Visual-only bounds for shore foam / shallows tint in the ocean shader.
// These align with the actual beach silhouette (which extends to
// ~max(rx,rz)*1.18*wob in ContinentPatch) — the *1.18 multiplier matches the
// outer beach ring without the navigation inflation, so the foam peak sits
// at the water line instead of out in open ocean.
const CONTINENT_VISUAL_BOUNDS = CONTINENTS.map((c) => {
  const center = latLonToVec3(c.lat, c.lon, 1).normalize();
  const angRadius = (Math.max(c.rx, c.rz) * 1.18) / GLOBE_RADIUS;
  return { center, cosRadius: Math.cos(angRadius) };
});

// ─── ice caps — geometry constants shared with collision ────────────────────
// IceCap mesh references these too. Kept at module scope so ICE_BOUNDS can
// be computed once.
const ICE_BASE_RADIUS = GLOBE_RADIUS * 0.16;
const ICE_PEAK_H = 0.045;
const ICE_WOB_MAX = 1.26; // 1 + 0.16 + 0.10, matches IceCap's wobAt()

const ICE_BOUNDS = [
  { center: new THREE.Vector3(0, 1, 0),
    cosRadius: Math.cos((ICE_BASE_RADIUS * ICE_WOB_MAX) / GLOBE_RADIUS + 0.03) },
  { center: new THREE.Vector3(0, -1, 0),
    cosRadius: Math.cos((ICE_BASE_RADIUS * ICE_WOB_MAX) / GLOBE_RADIUS + 0.03) },
];

// Cloud shadow spheres for the ocean shader. SPLASH_CLOUDS are static (the
// splash sets driftSpeed=0), so we can pack them into a fixed-size uniform
// once at module scope. Each entry is (centerXYZ, shadowRadius).
const CLOUD_SHADOW_SPHERES = SPLASH_CLOUDS.map((c) => ({
  position: new THREE.Vector4(
    c.position[0],
    c.position[1],
    c.position[2],
    // Average horizontal extent of the cloud, scaled down a touch so the
    // shadow doesn't extend past the visible cloud's silhouette.
    (c.bounds[0] + c.bounds[2]) * 0.42,
  ),
  opacity: c.opacity,
}));

const _vecScratch = new THREE.Vector3();
const _qInvScratch = new THREE.Quaternion();

// Surface normal at the ship anchor + the local "north" tangent (worldUp
// projected into the tangent plane). Used to convert a screen-space heading
// into a world-frame bow vector for free-roam globe rotation.
const SHIP_NORMAL = SHIP_ANCHOR.clone().normalize();
const SHIP_TANGENT_NORTH = (() => {
  const up = new THREE.Vector3(0, 1, 0);
  const proj = up.sub(SHIP_NORMAL.clone().multiplyScalar(up.dot(SHIP_NORMAL)));
  if (proj.lengthSq() < 1e-6) proj.set(0, 0, -1);
  return proj.normalize();
})();
const WORLD_Y = new THREE.Vector3(0, 1, 0);

function isClearForQuat(q: THREE.Quaternion): boolean {
  _qInvScratch.copy(q).invert();
  _vecScratch.copy(SHIP_ANCHOR).applyQuaternion(_qInvScratch).normalize();
  for (const cb of CONTINENT_BOUNDS) {
    if (_vecScratch.dot(cb.center) > cb.cosRadius) return false;
  }
  for (const ib of ICE_BOUNDS) {
    if (_vecScratch.dot(ib.center) > ib.cosRadius) return false;
  }
  return true;
}

// ─── water shader (sphere) ───────────────────────────────────────────────────

const OCEAN_VERT = /* glsl */`
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  varying vec3 vLocalNormal;
  varying vec3 vViewDir;
  varying vec2 vUvA;
  varying vec2 vUvB;
  varying vec2 vUvC;
  uniform float uTime;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    // Sphere centred at origin, so the un-rotated vertex normal IS the
    // globe-local surface direction — needed for shore-foam lookup against
    // CONTINENT_BOUNDS (which are stored in globe-local frame).
    vLocalNormal = normalize(normal);
    vViewDir = normalize(cameraPosition - wp.xyz);
    float lat = asin(normal.y);
    float lon = atan(normal.z, normal.x);
    vUvA = vec2(lon * 0.7 + uTime * 0.020, lat * 0.7 + uTime * 0.014);
    vUvB = vec2(lon * 1.4 - uTime * 0.026, lat * 1.2 + uTime * 0.022) + vec2(0.37, 0.13);
    vUvC = vec2(lon * 3.1 + uTime * 0.042, lat * 2.8 - uTime * 0.038) + vec2(0.71, 0.59);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;
const OCEAN_FRAG = /* glsl */`
  #define CONTINENT_COUNT ${CONTINENT_VISUAL_BOUNDS.length}
  #define CLOUD_COUNT ${CLOUD_SHADOW_SPHERES.length}
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  varying vec3 vLocalNormal;
  varying vec3 vViewDir;
  varying vec2 vUvA;
  varying vec2 vUvB;
  varying vec2 vUvC;
  uniform float uTime;
  uniform sampler2D uNormalMap;
  uniform vec3 uDeepColor;
  uniform vec3 uShallowColor;
  uniform vec3 uFoamColor;
  uniform vec3 uNightDeepColor;
  uniform vec3 uNightShallowColor;
  uniform vec3 uNightFoamColor;
  uniform vec3 uMoonColor;
  uniform float uNightMix;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform float uSunStrength;
  uniform vec3 uContinentCenters[CONTINENT_COUNT];
  uniform float uContinentCosRadii[CONTINENT_COUNT];
  uniform float uShoreBand;
  // Cloud shadow spheres: xyz = world-space center, w = shadow radius.
  uniform vec4 uClouds[CLOUD_COUNT];
  void main() {
    vec3 nA = texture2D(uNormalMap, vUvA).rgb * 2.0 - 1.0;
    vec3 nB = texture2D(uNormalMap, vUvB).rgb * 2.0 - 1.0;
    vec3 nC = texture2D(uNormalMap, vUvC).rgb * 2.0 - 1.0;

    // Wave-activity field — modulates whitecap density, wavetop sparkle,
    // and normal-map perturbation strength so the ocean isn't a uniform
    // blanket of identical whitecaps. Peaks in the trade-wind belt
    // (~25° lat, latAbs≈0.42) and the westerlies (~50° lat, latAbs≈0.77);
    // quietest in the equatorial doldrums and at the poles. A low-
    // frequency longitudinal term breaks up the horizontal banding so
    // adjacent oceans at the same latitude don't read as identical.
    float latAbs = abs(vLocalNormal.y);
    float oceanLon = atan(vLocalNormal.z, vLocalNormal.x);
    float trade     = exp(-pow((latAbs - 0.42) * 4.0, 2.0));
    float westerly  = exp(-pow((latAbs - 0.77) * 4.0, 2.0));
    float doldrum   = 1.0 - smoothstep(0.0, 0.15, latAbs);
    float polarCalm = smoothstep(0.92, 1.0, latAbs);
    float lonNoise =
      0.5 +
      0.5 * sin(oceanLon * 2.3 + latAbs * 5.0) *
            cos(oceanLon * 1.7 - latAbs * 3.1);
    float waveActivity = 0.35 + trade * 0.9 + westerly * 1.0
                              - doldrum * 0.35 - polarCalm * 0.6;
    waveActivity *= 0.65 + 0.45 * lonNoise;
    waveActivity = clamp(waveActivity, 0.15, 1.5);

    vec3 perturb = normalize(
      vWorldNormal + (nA * 0.22 + nB * 0.14 + nC * 0.08) * waveActivity
    );

    // Day/night water palette — interpolate the fixed deep/shallow blues
    // toward darker night equivalents so the cyan only shows in daylight.
    vec3 deepCol = mix(uDeepColor, uNightDeepColor, uNightMix);
    vec3 shallowCol = mix(uShallowColor, uNightShallowColor, uNightMix);
    vec3 foamCol = mix(uFoamColor, uNightFoamColor, uNightMix);

    // Latitude-based palette nudge. uDeepColor/uShallowColor are the
    // temperate baseline; tropical waters get a strong warm cyan shift,
    // polar waters a cool slate desaturation. Faded at night since
    // moonlight greys everything regardless. vLocalNormal.y = sin(lat),
    // so abs() = 0 at equator, ~0.45 at 27°, ~0.87 at 60°, 1 at the
    // poles. (latAbs is computed near the top of main() for the wave-
    // activity field; reused here.)
    float dayGate = 1.0 - uNightMix * 0.5;
    float tropic = (1.0 - smoothstep(0.0, 0.55, latAbs)) * dayGate;
    float polar  = smoothstep(0.55, 0.92, latAbs) * dayGate;

    shallowCol = mix(shallowCol, vec3(0.38, 0.82, 0.84), tropic * 0.65);
    deepCol    = mix(deepCol,    vec3(0.06, 0.36, 0.56), tropic * 0.55);
    shallowCol = mix(shallowCol, vec3(0.28, 0.40, 0.46), polar * 0.55);
    deepCol    = mix(deepCol,    vec3(0.06, 0.14, 0.22), polar * 0.45);

    // Tint the whitecap foam itself by latitude. Without this, every
    // whitecap reads as the same neutral cream — which is what was
    // washing out the tropical zone, since that's exactly where the
    // wave-activity field puts the most foam. Tropical foam picks up a
    // turquoise cast from the warm shallow water beneath; polar foam
    // goes cooler/grey-blue.
    foamCol = mix(foamCol, vec3(0.82, 0.95, 0.93), tropic * 0.40);
    foamCol = mix(foamCol, vec3(0.72, 0.78, 0.86), polar  * 0.40);

    // Open-ocean satellite variation — bathymetry, plankton blooms,
    // sediment plumes. Cheap sum-of-sines on the globe-local normal,
    // computed here but APPLIED at the end of main() as a finishing
    // multiplier so the white sun-glint, lambert lift, and whitecap
    // noise can't neutralize it (which is what was hiding it before).
    vec3 N = vLocalNormal;
    float bathy =
      sin(N.x * 3.7 + N.y * 1.9) * cos(N.z * 2.8 - N.y * 1.3) * 0.55 +
      sin(N.x * 1.4 - N.z * 2.1) * cos(N.y * 2.4 + N.x * 0.9) * 0.35 +
      sin(N.x * 6.3 + N.z * 4.7) * cos(N.y * 5.1)            * 0.18;
    float bloom =
      sin(N.x * 2.3 - N.y * 3.1 + 1.7) * cos(N.z * 1.8 + 0.9) * 0.6 +
      sin(N.z * 4.4 + N.y * 2.0)       * cos(N.x * 3.3)       * 0.3 +
      sin(N.x * 5.7 + N.z * 1.1)       * cos(N.y * 4.2 - 0.4) * 0.25;
    // Sediment / coastal-stream field — a third independent pattern
    // with higher frequency and asymmetric range, used to bias certain
    // patches toward greenish-brown (river plumes, upwelling silt).
    float sediment =
      sin(N.x * 8.1 - N.z * 3.4) * cos(N.y * 6.2 + N.x * 1.1) * 0.5 +
      sin(N.z * 2.9 + N.y * 5.3) * cos(N.x * 4.7)             * 0.3;

    float fres = pow(1.0 - max(dot(vWorldNormal, vViewDir), 0.0), 2.6);
    vec3 col = mix(deepCol, shallowCol, 0.20 + fres * 0.55);

    // Shore proximity: angular distance from each continent. The continents
    // are wobbled ellipses but we're testing against a circular cap, so any
    // hard interior cutoff (step(0, gap)) shows up as a dark ring where the
    // visible coast sits inside the cap. We clamp t to 1.0 inside the cap
    // instead — the land/beach mesh covers that area anyway, so the halo
    // just extends smoothly to the visible coast with no boundary artifact.
    float shore = 0.0;
    float shallowMix = 0.0;
    for (int i = 0; i < CONTINENT_COUNT; i++) {
      float d = dot(vLocalNormal, uContinentCenters[i]);
      float gap = uContinentCosRadii[i] - d;        // >0 in water, <0 in land
      float t = clamp(1.0 - gap / uShoreBand, 0.0, 1.0);
      shore = max(shore, t);
      float ts = clamp(1.0 - gap / (uShoreBand * 3.0), 0.0, 1.0);
      shallowMix = max(shallowMix, ts);
    }
    // Lighten the base water color near shore — turquoise sandy shallows
    // (or, at night, a paler navy reflecting moonlight onto the sand).
    // Tint must happen pre-lambert so the band shades with the rest of the
    // ocean (otherwise it reads as a flat unlit patch on the lit hemisphere).
    // Multipliers kept restrained so the shore halo doesn't overpower the
    // surrounding water at noon.
    vec3 dayShallowTint = uShallowColor * 1.25 + vec3(0.03, 0.06, 0.03);
    vec3 nightShallowTint = uNightShallowColor * 1.3 + vec3(0.02, 0.03, 0.06);
    vec3 shallowTint = mix(dayShallowTint, nightShallowTint, uNightMix);
    col = mix(col, shallowTint, shallowMix * 0.40);

    // Sun-side lambert shade so the ocean has clear day/night cheek-light.
    float lam = max(dot(vWorldNormal, uSunDir), 0.0);

    // Cloud shadows: for each cloud, find its closest approach to the ray
    // shot from this fragment toward the sun. If the cloud center is within
    // shadowRadius of that ray AND in front of the fragment relative to the
    // sun, the fragment is occluded. Soft falloff via smoothstep, summed
    // across clouds, modulated by lambert so shadows fade with the night
    // side. (Cheap — six iterations, all unrolled by the GLSL compiler.)
    float cloudShadow = 0.0;
    for (int i = 0; i < CLOUD_COUNT; i++) {
      vec3 toCloud = uClouds[i].xyz - vWorldPos;
      float along = dot(toCloud, uSunDir);
      if (along > 0.0) {
        vec3 closest = vWorldPos + uSunDir * along;
        float d = length(uClouds[i].xyz - closest);
        float r = uClouds[i].w;
        cloudShadow += smoothstep(r, r * 0.4, d);
      }
    }
    cloudShadow = clamp(cloudShadow * 0.30, 0.0, 0.40) * lam;

    col *= (0.45 + lam * 0.85) * (1.0 - cloudShadow);

    vec3 reflectDir = reflect(-uSunDir, perturb);
    // Concentrate sun-glint near the limb where real ocean glitter lives.
    // Center of the disc keeps a soft 25% so the noon hemisphere still shines.
    float rim = 1.0 - max(dot(vWorldNormal, vViewDir), 0.0);
    float specRim = 0.25 + pow(rim, 2.0) * 1.6;
    float spec = pow(max(dot(reflectDir, vViewDir), 0.0), 26.0) * specRim;
    col += uSunColor * spec * uSunStrength;

    // Anisotropic glitter streak: real ocean glitter forms an elongated
    // path along the sun-tangent direction on the water surface, not a
    // circular hotspot. Decompose the half-vector against a tangent frame
    // (sunTan = sun direction projected onto the surface; sunBin = its
    // perpendicular) and use a stretched Gaussian — wide along the streak
    // axis, narrow across it — to trace the glitter ribbon from the
    // sub-solar point toward the viewer.
    vec3 H = normalize(uSunDir + vViewDir);
    vec3 sunTanRaw = uSunDir - vWorldNormal * dot(uSunDir, vWorldNormal);
    vec3 sunTan = sunTanRaw / max(length(sunTanRaw), 1e-4);
    vec3 sunBin = cross(vWorldNormal, sunTan);
    float TdotH = dot(sunTan, H);
    float BdotH = dot(sunBin, H);
    float NdotHp = max(dot(perturb, H), 0.0);
    // ax wider than ay → ribbon stretched along the sun-tangent direction.
    float ax = 0.55;
    float ay = 0.09;
    float streak = exp(-(TdotH * TdotH) / (ax * ax) - (BdotH * BdotH) / (ay * ay));
    streak *= pow(NdotHp, 8.0) * specRim;
    col += uSunColor * streak * uSunStrength * 0.55;

    // Moon-side glitter: tighter highlight (higher exponent) than the sun,
    // gated by uNightMix so it only shows in actual darkness.
    vec3 moonDir = -uSunDir;
    vec3 moonReflect = reflect(-moonDir, perturb);
    float moonLam = max(dot(vWorldNormal, moonDir), 0.0);
    float moonSpec = pow(max(dot(moonReflect, vViewDir), 0.0), 38.0) * specRim;
    col += uMoonColor * moonSpec * uNightMix * 0.7 * (0.3 + moonLam);

    float crest = smoothstep(0.55, 0.85, (nA.x + nB.x) * 0.5 + 0.5);
    col = mix(col, foamCol, crest * 0.30 * (0.4 + lam * 0.6) * waveActivity);

    // Fine-scale wavetop sparkle from the high-frequency layer — narrow
    // smoothstep so only the crests of the small ripples pop, gated by
    // lambert and limb so it reads as sun glitter, not allover speckle.
    float sparkle = smoothstep(0.78, 0.96, nC.x * 0.5 + 0.5);
    col += uSunColor * sparkle * lam * rim * 0.25 * (1.0 - uNightMix) * waveActivity;

    // Shore foam: bleach a wave-modulated band right at the water/land edge.
    // Applied post-lambert because foam reads as bright surf regardless of
    // how lit that side of the planet currently is.
    float surf = smoothstep(0.35, 0.95, (nA.x + nB.x) * 0.5 + 0.5);
    float breath = 0.55 + 0.45 * sin(uTime * 1.4 + vLocalNormal.x * 5.0 + vLocalNormal.z * 4.0);
    float foamBand = pow(shore, 1.6) * (0.55 + 0.55 * surf) * breath;
    // Shore foam dims at night rather than brightening — moonlit surf is
    // visible but not glowing, so the halo around islands stays grounded
    // in the surrounding dark water.
    col = mix(col, foamCol, foamBand * (0.5 + lam * 0.5) * (1.0 - uNightMix * 0.4));

    col += shallowCol * fres * 0.16;

    // ─── Finishing tints — applied AFTER all the white additions
    // (sun glint, streak, sparkle, whitecaps) so those can't neutralize
    // the hue/value variations. Multiplicative so they act like colored
    // filters on the whole composited ocean rather than overwriting it.
    // Day-only: fades to neutral at night so moonlit ocean reads grey.

    // 1. Bathymetry / depth lightness — gyres brighter, abyssal darker.
    //    ±22% lightness swing is firmly visible without looking patchy.
    float bathyMul = 1.0 + bathy * 0.22;
    col *= mix(1.0, bathyMul, 1.0 - uNightMix);

    // 2. Plankton-bloom / clear-water hue. Strong saturated targets:
    //    negative bloom → clear deep blue; positive bloom → greenish
    //    plankton water. The smoothstep widens the transition so the
    //    boundary between "blue patch" and "green patch" is soft.
    vec3 bloomBlue  = vec3(0.82, 0.90, 1.15);   // clear deep blue
    vec3 bloomGreen = vec3(1.05, 1.18, 0.85);   // plankton-rich teal-green
    vec3 bloomTint  = mix(bloomBlue, bloomGreen, smoothstep(-0.6, 0.6, bloom));
    col *= mix(vec3(1.0), bloomTint, (1.0 - uNightMix) * 0.55);

    // 3. Sediment / upwelling — desaturated greenish-brown bias on
    //    high-positive sediment patches only (one-sided, since clean
    //    water is the default and only specific patches go silty).
    float sedAmt = smoothstep(0.15, 0.55, sediment);
    vec3 sedTint = vec3(1.04, 1.05, 0.85);
    col *= mix(vec3(1.0), sedTint, sedAmt * (1.0 - uNightMix) * 0.45);

    // 4. Latitude tint — last so it has the final say on tropical vs
    //    polar mood. Toned modestly since the bloom field already
    //    provides a lot of variation in the same color space.
    vec3 tropicTint = vec3(0.95, 1.03, 1.02);   // warm cyan lift
    vec3 polarTint  = vec3(0.88, 0.95, 1.02);   // cool slate
    vec3 latTint = mix(vec3(1.0), tropicTint, tropic * 0.55);
    latTint      = mix(latTint, polarTint,  polar  * 0.65);
    col *= mix(vec3(1.0), latTint, 1.0 - uNightMix);

    gl_FragColor = vec4(col, 1.0);
  }
`;

function OceanShell({ dayRef }: { dayRef: React.MutableRefObject<DayState> }) {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const normalMap = useLoader(THREE.TextureLoader, '/textures/waternormals.jpg');
  useEffect(() => {
    normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;
    normalMap.anisotropy = 8;
  }, [normalMap]);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uNormalMap: { value: normalMap },
      uDeepColor: { value: new THREE.Color('#0a2a4a') },
      uShallowColor: { value: new THREE.Color('#3aa3c2') },
      uFoamColor: { value: new THREE.Color('#fbf4e6') },
      // Night palette — water lerps toward these as sunIntensity drops, so
      // the ocean reads as cold dark navy under moonlight rather than as
      // dimmed daytime cyan.
      uNightDeepColor: { value: new THREE.Color('#0a1428') },
      uNightShallowColor: { value: new THREE.Color('#1a2c4a') },
      // Foam at night: dim moonlit slate, NOT bright white. A near-white
      // foam target reads as a glowing halo around every island and ruins
      // the sense of darkness.
      uNightFoamColor: { value: new THREE.Color('#5a6e8a') },
      uMoonColor: { value: new THREE.Color('#cdd6e8') },
      uNightMix: { value: 0 },
      uSunDir: { value: new THREE.Vector3(0.5, 0.6, 0.7) },
      uSunColor: { value: new THREE.Color('#ffe9c4') },
      uSunStrength: { value: 0.85 },
      uContinentCenters: {
        value: CONTINENT_VISUAL_BOUNDS.map((b) => b.center.clone()),
      },
      uContinentCosRadii: {
        value: CONTINENT_VISUAL_BOUNDS.map((b) => b.cosRadius),
      },
      // Angular half-width of the foam band, in radians on the unit sphere.
      // ~0.028 rad reads as a thin surf line at this globe radius/zoom.
      uShoreBand: { value: 0.028 },
      // Static cloud shadow positions/radii (SPLASH_CLOUDS, driftSpeed=0).
      uClouds: {
        value: CLOUD_SHADOW_SPHERES.map((c) => c.position.clone()),
      },
    }),
    [normalMap]
  );

  useFrame((state) => {
    const u = matRef.current?.uniforms;
    if (!u) return;
    (u.uTime as { value: number }).value = state.clock.elapsedTime;
    const day = dayRef.current;
    (u.uSunDir as { value: THREE.Vector3 }).value.copy(day.sunDir);
    (u.uSunColor as { value: THREE.Color }).value.copy(day.sunColor);
    // Stronger spec at noon, faded at night
    const noonLerp = THREE.MathUtils.smoothstep(day.sunIntensity, 0.4, 1.7);
    (u.uSunStrength as { value: number }).value = noonLerp * 1.2;
    // Night blend — tracks the full sun-intensity range (0 → ~1.5 at noon)
    // so the ocean palette darkens in step with the directional light that
    // shades the land. Old [0.05, 0.6] range left the water bright through
    // dusk while continents had already gone dim.
    (u.uNightMix as { value: number }).value =
      1 - THREE.MathUtils.smoothstep(day.sunIntensity, 0.0, 1.5);
  });

  return (
    <mesh>
      <sphereGeometry args={[GLOBE_RADIUS, 96, 64]} />
      <shaderMaterial ref={matRef} vertexShader={OCEAN_VERT} fragmentShader={OCEAN_FRAG} uniforms={uniforms} />
    </mesh>
  );
}

// ─── continent patches (curved sphere caps) ─────────────────────────────────
//
// Each continent is built as a tessellated dome whose vertices are projected
// onto the sphere of radius (R + h(t)). This gives true 3D landmasses with
// thickness and silhouette at the limb — fixing the "flat 2d pancake" look
// that plain ShapeGeometry tangent disks produce.

// Exaggerate authored elevations so terrain reads at globe scale. Earth's real
// elevation:radius ratio is ~0.1%; for this stylized look we want ~5%.
const ELEVATION_SCALE = 3.5;

// Project a tangent-plane offset (x, z) at height h above sea level into the
// patch's local frame, where local +y is the surface normal at the patch
// center and the group origin sits exactly on the sphere surface (R*N).
//
// Derivation: a sphere point at unit direction d = normalize(N + (xE+zN_t)/R)
// at radius (R+h), expressed in the local frame where R_q maps (0,1,0) → N.
// Working in local coords: R_q^{-1}*d = normalize((x/R, 1, z/R)) ; the local
// position is then R_q^{-1}*d*(R+h) − (0,R,0).
function projectToSphereLocal(
  x: number,
  z: number,
  h: number,
  R: number,
  out?: THREE.Vector3,
): THREE.Vector3 {
  const inv = 1 / R;
  const qx = x * inv;
  const qz = z * inv;
  const len = Math.sqrt(qx * qx + 1 + qz * qz);
  const r = R + h;
  const v = out ?? new THREE.Vector3();
  v.set((qx * r) / len, r / len - R, (qz * r) / len);
  return v;
}

function ContinentPatch({ continent: c }: { continent: Continent }) {
  const { position, quaternion } = useMemo(() => {
    const normal = latLonToVec3(c.lat, c.lon, 1).normalize();
    // Group origin sits on the sphere surface (not above it). Heights are
    // applied per-vertex via projectToSphereLocal.
    const pos = normal.clone().multiplyScalar(GLOBE_RADIUS);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
    const yaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), c.rotation);
    q.multiply(yaw);
    return { position: pos, quaternion: q };
  }, [c]);

  const peakH = c.elevation * ELEVATION_SCALE;

  // Plateau-then-cliff height profile: full peak height for the inner 60% of
  // the patch radius, smoothly easing to ~18% peak at the perimeter so the
  // skirt has a visible cliff face instead of vanishing into the ocean.
  const heightAt = (t: number) => {
    if (t <= 0.6) return peakH;
    const u = (t - 0.6) / 0.4;
    const e = u * u * (3 - 2 * u);
    return peakH * (1 - e * 0.82);
  };

  const wobAt = (theta: number) =>
    1 + 0.12 * Math.sin(theta * 3 + c.lon) + 0.07 * Math.sin(theta * 5 + c.lat);

  const RAD_SEGS = 36;
  const RING_COUNT = 6;

  const topGeom = useMemo(() => {
    const positions: number[] = [];
    const indices: number[] = [];
    const tmp = new THREE.Vector3();

    // Apex (center) vertex — index 0
    projectToSphereLocal(0, 0, peakH, GLOBE_RADIUS, tmp);
    positions.push(tmp.x, tmp.y, tmp.z);

    // Concentric rings, t = i/RING_COUNT in (0, 1]
    for (let i = 1; i <= RING_COUNT; i++) {
      const t = i / RING_COUNT;
      const h = heightAt(t);
      for (let j = 0; j < RAD_SEGS; j++) {
        const theta = (j / RAD_SEGS) * Math.PI * 2;
        const wob = wobAt(theta);
        const x = Math.cos(theta) * c.rx * wob * t;
        const z = Math.sin(theta) * c.rz * wob * t;
        projectToSphereLocal(x, z, h, GLOBE_RADIUS, tmp);
        positions.push(tmp.x, tmp.y, tmp.z);
      }
    }

    // Center fan → ring 1. Winding (0, j+1, j) faces outward (+y in local).
    for (let j = 0; j < RAD_SEGS; j++) {
      const b = 1 + j;
      const cIdx = 1 + ((j + 1) % RAD_SEGS);
      indices.push(0, cIdx, b);
    }
    // Ring quads
    for (let i = 1; i < RING_COUNT; i++) {
      const baseInner = 1 + (i - 1) * RAD_SEGS;
      const baseOuter = 1 + i * RAD_SEGS;
      for (let j = 0; j < RAD_SEGS; j++) {
        const a0 = baseInner + j;
        const a1 = baseInner + ((j + 1) % RAD_SEGS);
        const b0 = baseOuter + j;
        const b1 = baseOuter + ((j + 1) % RAD_SEGS);
        indices.push(a0, b1, b0);
        indices.push(a0, a1, b1);
      }
    }

    // Skirt: outermost cap ring drops to a level just below the ocean. The
    // upper portion of the skirt above sea level is the visible cliff face;
    // the underwater portion is hidden by the opaque ocean shell.
    const lastRingBase = 1 + (RING_COUNT - 1) * RAD_SEGS;
    const skirtBase = positions.length / 3;
    const skirtH = -peakH * 0.5;

    for (let j = 0; j < RAD_SEGS; j++) {
      const theta = (j / RAD_SEGS) * Math.PI * 2;
      const wob = wobAt(theta);
      const x = Math.cos(theta) * c.rx * wob;
      const z = Math.sin(theta) * c.rz * wob;
      projectToSphereLocal(x, z, skirtH, GLOBE_RADIUS, tmp);
      positions.push(tmp.x, tmp.y, tmp.z);
    }
    // Skirt walls — winding (top, skirt+1, skirt), (top, top+1, skirt+1)
    // gives outward-facing normals (away from sphere axis).
    for (let j = 0; j < RAD_SEGS; j++) {
      const j1 = (j + 1) % RAD_SEGS;
      const t0 = lastRingBase + j;
      const t1 = lastRingBase + j1;
      const s0 = skirtBase + j;
      const s1 = skirtBase + j1;
      indices.push(t0, s1, s0);
      indices.push(t0, t1, s1);
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.setIndex(indices);
    geom.computeVertexNormals();

    // Per-vertex hash-driven color jitter — breaks up the flat continent tone
    // into "lichen on stone" variation. Lerps between a darker and lighter
    // variant of c.color via a deterministic position hash, so re-renders
    // don't shimmer. Combines naturally with flatShading: faces interpolate
    // between three vertex colors, giving subtle terrain noise without the
    // cost of a real texture map.
    const baseCol = new THREE.Color(c.color);
    const darkCol = baseCol.clone().multiplyScalar(0.62);
    const lightCol = baseCol.clone().lerp(new THREE.Color('#ffffff'), 0.18);
    const colors = new Float32Array(positions.length);
    const tmpCol = new THREE.Color();
    for (let p = 0; p < positions.length; p += 3) {
      const x = positions[p];
      const y = positions[p + 1];
      const z = positions[p + 2];
      // Cheap hash → [-1, 1]
      const n = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
      const t = (n - Math.floor(n)) * 2 - 1;
      tmpCol.copy(baseCol);
      if (t > 0) tmpCol.lerp(lightCol, t * 0.55);
      else tmpCol.lerp(darkCol, -t * 0.55);
      colors[p] = tmpCol.r;
      colors[p + 1] = tmpCol.g;
      colors[p + 2] = tmpCol.b;
    }
    geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    return geom;
  }, [c, peakH]);

  // Beach: a sea-level ring that wraps the continent, sphere-projected so it
  // hugs the curvature instead of clipping through the ocean shell.
  const beachGeom = useMemo(() => {
    const positions: number[] = [];
    const indices: number[] = [];
    const tmp = new THREE.Vector3();

    for (let j = 0; j < RAD_SEGS; j++) {
      const theta = (j / RAD_SEGS) * Math.PI * 2;
      const wob = wobAt(theta);
      const x = Math.cos(theta) * c.rx * wob;
      const z = Math.sin(theta) * c.rz * wob;
      projectToSphereLocal(x, z, 0.004, GLOBE_RADIUS, tmp);
      positions.push(tmp.x, tmp.y, tmp.z);
    }
    for (let j = 0; j < RAD_SEGS; j++) {
      const theta = (j / RAD_SEGS) * Math.PI * 2;
      const wob = wobAt(theta);
      const x = Math.cos(theta) * c.rx * wob * 1.18;
      const z = Math.sin(theta) * c.rz * wob * 1.18;
      projectToSphereLocal(x, z, 0.001, GLOBE_RADIUS, tmp);
      positions.push(tmp.x, tmp.y, tmp.z);
    }
    for (let j = 0; j < RAD_SEGS; j++) {
      const j1 = (j + 1) % RAD_SEGS;
      const i0 = j;
      const i1 = j1;
      const o0 = RAD_SEGS + j;
      const o1 = RAD_SEGS + j1;
      indices.push(i0, o1, o0);
      indices.push(i0, i1, o1);
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.setIndex(indices);
    geom.computeVertexNormals();
    return geom;
  }, [c]);

  return (
    <group position={position} quaternion={quaternion}>
      <mesh geometry={beachGeom}>
        <meshStandardMaterial color="#e8d49a" roughness={0.95} />
      </mesh>
      <mesh geometry={topGeom}>
        {/* color="#ffffff" + vertexColors lets the per-vertex hash colors
            on topGeom be the only contribution — otherwise standard would
            multiply by c.color again and double-darken everything. */}
        <meshStandardMaterial color="#ffffff" roughness={0.85} flatShading vertexColors />
      </mesh>
      {c.features?.map((f, i) => {
        // Original f.u/f.v are normalized to the patch ellipse and the legacy
        // *GLOBE_RADIUS factor is preserved so existing feature placements
        // don't shift visually relative to the cap.
        const u = f.u * c.rx * GLOBE_RADIUS;
        const v = f.v * c.rz * GLOBE_RADIUS;
        if (f.kind === 'mountain')
          return (
            <FeatureMount key={i} u={u} v={v} c={c}>
              <Mountain h={f.h} />
            </FeatureMount>
          );
        if (f.kind === 'volcano')
          return (
            <FeatureMount key={i} u={u} v={v} c={c}>
              <Volcano h={f.h} />
            </FeatureMount>
          );
        if (f.kind === 'tree')
          return (
            <FeatureMount key={i} u={u} v={v} c={c}>
              <Tree />
            </FeatureMount>
          );
        if (f.kind === 'palm')
          return (
            <FeatureMount key={i} u={u} v={v} c={c}>
              <PalmTree seed={i} />
            </FeatureMount>
          );
        if (f.kind === 'temple')
          return (
            <FeatureMount key={i} u={u} v={v} c={c}>
              <Temple />
            </FeatureMount>
          );
        if (f.kind === 'oasis')
          return (
            <FeatureMount key={i} u={u} v={v} c={c}>
              <Oasis />
            </FeatureMount>
          );
        return null;
      })}
    </group>
  );
}

// Place a feature on the curved cap surface. Computes the cap height at the
// feature's tangent (u, v) and orients local +y to the sphere normal there,
// so cones/trees stand "up" relative to the planet rather than the flat patch.
function FeatureMount({
  u,
  v,
  c,
  children,
}: {
  u: number;
  v: number;
  c: Continent;
  children: React.ReactNode;
}) {
  const { position, quaternion } = useMemo(() => {
    const peakH = c.elevation * ELEVATION_SCALE;
    const t = Math.min(1, Math.sqrt((u / c.rx) ** 2 + (v / c.rz) ** 2));
    let h: number;
    if (t <= 0.6) h = peakH;
    else {
      const tt = (t - 0.6) / 0.4;
      const e = tt * tt * (3 - 2 * tt);
      h = peakH * (1 - e * 0.82);
    }
    const pos = projectToSphereLocal(u, v, h, GLOBE_RADIUS);
    const inv = 1 / GLOBE_RADIUS;
    const nLocal = new THREE.Vector3(u * inv, 1, v * inv).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), nLocal);
    return { position: pos, quaternion: q };
  }, [u, v, c]);
  return <group position={position} quaternion={quaternion}>{children}</group>;
}

function Mountain({ h }: { h: number }) {
  return (
    <group position={[0, h / 2, 0]}>
      <mesh>
        <coneGeometry args={[h * 0.7, h, 6]} />
        <meshStandardMaterial color="#8b6a4a" roughness={1} flatShading />
      </mesh>
      <mesh position={[0, h * 0.32, 0]}>
        <coneGeometry args={[h * 0.32, h * 0.36, 6]} />
        <meshStandardMaterial color="#f4f0e0" roughness={0.9} flatShading />
      </mesh>
    </group>
  );
}

// Number of smoke puffs in the volcano plume. More = denser column, but
// each is just a 6×6 sphere so the cost is trivial.
const VOLCANO_PUFF_COUNT = 9;
const VOLCANO_PUFF_LIFE = 3.6; // seconds per puff lifecycle

function Volcano({ h }: { h: number }) {
  const smokeRef = useRef<THREE.Group>(null);
  const lavaRef = useRef<THREE.MeshStandardMaterial>(null);

  // Per-puff offsets so each rises along its own slightly-different path.
  // Stable across re-renders so the plume doesn't shimmer.
  const puffSeeds = useMemo(
    () =>
      Array.from({ length: VOLCANO_PUFF_COUNT }, (_, i) => ({
        stagger: (i / VOLCANO_PUFF_COUNT) * VOLCANO_PUFF_LIFE,
        driftX: Math.cos(i * 1.7 + 0.3) * 0.18,
        driftZ: Math.sin(i * 2.31 + 0.7) * 0.18,
        wobbleHz: 0.6 + (i % 3) * 0.15,
      })),
    [],
  );

  useFrame((state) => {
    const time = state.clock.elapsedTime;
    if (smokeRef.current) {
      smokeRef.current.children.forEach((child, i) => {
        const seed = puffSeeds[i];
        // Lifecycle t ∈ [0, 1]. At t=0 puff is born at the crater, at t=1
        // it's fully dispersed and recycles for the next breath.
        const t = ((time + seed.stagger) % VOLCANO_PUFF_LIFE) / VOLCANO_PUFF_LIFE;

        // 4t(1-t) is a parabola peaking at 0.5 — proper ease-in / ease-out
        // so puffs don't pop in or snap out.
        const lifeOpacity = 4 * t * (1 - t);

        // Vertical rise + small horizontal drift (winds aloft) plus a tiny
        // sideways wobble for organic feel.
        const wobble = Math.sin(time * seed.wobbleHz + i) * 0.04 * t;
        const x = seed.driftX * t + wobble;
        const z = seed.driftZ * t;
        const y = h * 0.55 + t * 1.05;
        child.position.set(x, y, z);

        const mat = (child as THREE.Mesh).material as THREE.MeshStandardMaterial;
        mat.opacity = lifeOpacity * 0.65;

        // Puffs grow as they rise — small at the crater, billowing out by
        // the time they reach the top of the plume.
        const scale = 0.05 + t * 0.13;
        child.scale.setScalar(scale);
      });
    }
    if (lavaRef.current) lavaRef.current.emissiveIntensity = 1.4 + Math.sin(time * 3) * 0.5;
  });

  return (
    <group position={[0, h / 2, 0]}>
      <mesh>
        <coneGeometry args={[h * 0.85, h, 7]} />
        <meshStandardMaterial color="#5c3a2a" roughness={1} flatShading />
      </mesh>
      <mesh position={[0, h * 0.5, 0]}>
        <cylinderGeometry args={[h * 0.18, h * 0.22, h * 0.06, 8]} />
        <meshStandardMaterial ref={lavaRef} color="#ff6a2a" emissive="#ff6a2a" emissiveIntensity={1.6} toneMapped={false} />
      </mesh>
      <group ref={smokeRef}>
        {puffSeeds.map((_, i) => (
          <mesh key={i}>
            <sphereGeometry args={[1, 6, 6]} />
            <meshStandardMaterial color="#d8c8b0" transparent opacity={0.5} depthWrite={false} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function Tree() {
  // FeatureMount already places this group's origin exactly on the patch
  // surface, so trunk-bottom must be at local y=0. Trunk center sits at
  // half its height (0.04), foliage cone sits on top of the trunk.
  return (
    <group>
      <mesh position={[0, 0.04, 0]}>
        <cylinderGeometry args={[0.012, 0.018, 0.08, 5]} />
        <meshStandardMaterial color="#5a3a22" roughness={1} />
      </mesh>
      <mesh position={[0, 0.12, 0]}>
        <coneGeometry args={[0.05, 0.12, 6]} />
        <meshStandardMaterial color="#3e6a2c" roughness={1} flatShading />
      </mesh>
    </group>
  );
}

// Palm: small drooping coconut palm with a curved trunk. Trunk is built
// from three nested segments whose cumulative tilt sweeps the apex out
// over the base — a proper leaning silhouette, not a straight pole. The
// crown carries five fronds; each frond is two hinged cone segments where
// the proximal angles outward from the crown's local horizontal and the
// distal bends past π/2 so the tip droops below the crown. `seed` varies
// trunk lean direction and frond phase so paired palms don't twin.
function PalmTree({ seed = 0 }: { seed?: number }) {
  // Cumulative trunk tilts from world vertical. Each child group rotates
  // by the DELTA from its parent, so the segments compose a smooth arc.
  const lean1 = 0.10 + (seed % 2 === 0 ? 0.03 : -0.02);
  const lean2 = 0.30 + Math.sin(seed * 1.7) * 0.04;
  const lean3 = 0.55 + Math.cos(seed * 2.3) * 0.05;
  // Azimuth that the trunk leans toward — different per palm.
  const faceA = seed * 1.91;

  const h1 = 0.034;
  const h2 = 0.028;
  const h3 = 0.022;

  const FROND_COUNT = 5;
  const fronds = useMemo(() => {
    return Array.from({ length: FROND_COUNT }, (_, i) => {
      const a = (i / FROND_COUNT) * Math.PI * 2 + seed * 0.81;
      // Proximal tilt from crown's local up axis. ~81° starts the frond
      // nearly horizontal — slightly above for the upper-side of the
      // crown, slightly below on the lean-side once the trunk's tilt is
      // composed in.
      const tilt1 = 1.42 + Math.sin(i * 1.9 + seed) * 0.07;
      // Strong distal bend so the frond's tip arcs well below horizontal.
      // Combined with tilt1, distal tip sits ~140° from crown +Y.
      const droop = 1.05 + Math.cos(i * 2.7 + seed * 1.3) * 0.10;
      const len1 = 0.024 + (i % 2 === 0 ? 0.003 : 0);
      const len2 = 0.020 + (i % 3 === 0 ? -0.002 : 0.002);
      return { a, tilt1, droop, len1, len2 };
    });
  }, [seed]);

  const TRUNK_COL = '#8a6a45';
  const FROND_COL = '#7a9a3e';
  const FROND_DARK = '#5e7a2c';

  return (
    <group rotation={[0, faceA, 0]}>
      {/* Segment 1 (base) — tilts the whole tree by lean1 */}
      <group rotation={[lean1, 0, 0]}>
        <mesh position={[0, h1 / 2, 0]}>
          <cylinderGeometry args={[0.0080, 0.0095, h1, 7]} />
          <meshStandardMaterial color={TRUNK_COL} roughness={1} flatShading />
        </mesh>
        {/* Segment 2 — hinged at top of seg 1, adds (lean2 - lean1) */}
        <group position={[0, h1, 0]} rotation={[lean2 - lean1, 0, 0]}>
          <mesh position={[0, h2 / 2, 0]}>
            <cylinderGeometry args={[0.0070, 0.0080, h2, 7]} />
            <meshStandardMaterial color={TRUNK_COL} roughness={1} flatShading />
          </mesh>
          {/* Segment 3 — hinged at top of seg 2, adds (lean3 - lean2) */}
          <group position={[0, h2, 0]} rotation={[lean3 - lean2, 0, 0]}>
            <mesh position={[0, h3 / 2, 0]}>
              <cylinderGeometry args={[0.0060, 0.0070, h3, 7]} />
              <meshStandardMaterial color={TRUNK_COL} roughness={1} flatShading />
            </mesh>
            {/* Crown at the trunk apex — its local +Y is the trunk-tip
                direction (tilted ~31° from world up), so fronds spread in
                the crown's plane and droop relative to it. The lean-side
                fronds end up pointing well below world horizontal. */}
            <group position={[0, h3, 0]}>
              {/* Coconut cluster nestled at the crown */}
              <mesh position={[0, 0, 0]}>
                <sphereGeometry args={[0.0085, 7, 6]} />
                <meshStandardMaterial color="#3e2a18" roughness={1} flatShading />
              </mesh>
              {fronds.map((f, i) => (
                // Outer Y-rotation spins the frond around the crown
                // (azimuth); inner X-rotation tilts the frond out from
                // crown +Y so its long axis lies near the crown's
                // horizontal plane.
                <group key={i} rotation={[0, f.a, 0]}>
                  <group rotation={[f.tilt1, 0, 0]}>
                    {/* Proximal segment */}
                    <mesh position={[0, f.len1 / 2, 0]}>
                      <coneGeometry args={[0.0075, f.len1, 4]} />
                      <meshStandardMaterial color={FROND_COL} roughness={1} flatShading />
                    </mesh>
                    {/* Distal segment hinged at proximal apex with an
                        additional X-rotation so the tip arcs further down. */}
                    <group position={[0, f.len1, 0]} rotation={[f.droop, 0, 0]}>
                      <mesh position={[0, f.len2 / 2, 0]}>
                        <coneGeometry args={[0.0045, f.len2, 4]} />
                        <meshStandardMaterial color={FROND_DARK} roughness={1} flatShading />
                      </mesh>
                    </group>
                  </group>
                </group>
              ))}
            </group>
          </group>
        </group>
      </group>
    </group>
  );
}

// Oasis: a small water pool with a darker rim, a few reed tufts at the
// edge, and a slow shimmer driven by emissiveIntensity so it reads as
// catching the sun even at low light. Sits flat on the cap surface.
function Oasis() {
  const matRef = useRef<THREE.MeshStandardMaterial>(null);
  useFrame((s) => {
    if (!matRef.current) return;
    const t = s.clock.elapsedTime;
    // Layered slow ripples — feels like wind drawing across the surface.
    matRef.current.emissiveIntensity =
      0.22 + Math.sin(t * 1.3) * 0.06 + Math.sin(t * 2.7 + 1.1) * 0.04;
  });

  const reeds = useMemo(
    () =>
      [0.4, 1.3, 2.5, 3.6, 4.8, 5.9].map((a, i) => ({
        a,
        h: 0.018 + (i % 2 === 0 ? 0.006 : -0.003),
        r: 0.054 + (i % 3 === 0 ? 0.004 : 0),
      })),
    [],
  );

  return (
    <group>
      {/* Damp sand rim */}
      <mesh position={[0, 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.044, 0.060, 28]} />
        <meshStandardMaterial color="#9a7d4e" roughness={1} flatShading />
      </mesh>
      {/* Water surface — dark teal, faintly emissive so it pops against sand */}
      <mesh position={[0, 0.003, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.046, 28]} />
        <meshStandardMaterial
          ref={matRef}
          color="#2d6e88"
          emissive="#1c4a64"
          emissiveIntensity={0.22}
          roughness={0.25}
          metalness={0.30}
        />
      </mesh>
      {/* Reed tufts around the edge */}
      {reeds.map((r, i) => (
        <mesh
          key={i}
          position={[Math.cos(r.a) * r.r, r.h / 2, Math.sin(r.a) * r.r]}
          rotation={[0, r.a, 0]}
        >
          <coneGeometry args={[0.005, r.h, 4]} />
          <meshStandardMaterial color="#5a7a32" roughness={1} flatShading />
        </mesh>
      ))}
    </group>
  );
}

// Brazier torch: short post + bowl + an emissive flame that flickers via
// scale + emissiveIntensity modulation. Phase offset per torch keeps two
// adjacent torches from breathing in lockstep. The outer halo sphere is
// additive-friendly (transparent, depthWrite off) so bloom picks it up.
function Torch({
  x,
  z,
  baseY,
  seed = 0,
}: {
  x: number;
  z: number;
  baseY: number;
  seed?: number;
}) {
  const flameRef = useRef<THREE.Mesh>(null);
  const flameMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const haloMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const phase = useMemo(() => seed * 1.37, [seed]);

  useFrame((s) => {
    const t = s.clock.elapsedTime + phase;
    // Layered flicker: high-freq jitter + a slower bob, summed and clamped.
    const f =
      0.85 +
      Math.sin(t * 23.0) * 0.10 +
      Math.sin(t * 9.3 + 0.7) * 0.08 +
      Math.sin(t * 47.0) * 0.04;
    if (flameRef.current) flameRef.current.scale.set(f, f * 1.06, f);
    if (flameMatRef.current) flameMatRef.current.emissiveIntensity = 1.6 * f;
    if (haloMatRef.current) haloMatRef.current.opacity = 0.20 * f;
  });

  return (
    <group position={[x, baseY, z]}>
      {/* Wooden post */}
      <mesh position={[0, 0.025, 0]}>
        <cylinderGeometry args={[0.0035, 0.0045, 0.050, 6]} />
        <meshStandardMaterial color="#3a2415" roughness={1} flatShading />
      </mesh>
      {/* Iron brazier */}
      <mesh position={[0, 0.054, 0]}>
        <cylinderGeometry args={[0.0110, 0.0060, 0.011, 8]} />
        <meshStandardMaterial color="#1a1108" roughness={0.9} flatShading />
      </mesh>
      {/* Flame */}
      <mesh ref={flameRef} position={[0, 0.072, 0]}>
        <coneGeometry args={[0.007, 0.022, 6]} />
        <meshStandardMaterial
          ref={flameMatRef}
          color="#ffc070"
          emissive="#ff7820"
          emissiveIntensity={1.6}
          toneMapped={false}
          transparent
          opacity={0.95}
        />
      </mesh>
      {/* Soft glow halo — picked up by the bloom pass */}
      <mesh position={[0, 0.072, 0]} renderOrder={6}>
        <sphereGeometry args={[0.020, 10, 8]} />
        <meshBasicMaterial
          ref={haloMatRef}
          color="#ff8a30"
          transparent
          opacity={0.20}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

// Ruined temple: stepped sandstone base, a few standing/broken columns,
// a tilted lintel that's slipped from its perch, fallen column drums, an
// inner altar, and two flanking torches that flicker. Local +z is "front"
// — front columns sit at z=-0.030 and the entrance stair faces -z.
function Temple() {
  const COLUMNS: Array<[number, number, number]> = [
    // [x, z, height] — heights vary so some columns read as snapped off
    [-0.045, -0.030, 0.085],
    [ 0.045, -0.030, 0.058],
    [-0.045,  0.030, 0.034],
    [ 0.045,  0.030, 0.072],
  ];
  // Rubble pebbles strewn around the base — small randomized chunks.
  const RUBBLE: Array<[number, number, number, number, number]> = [
    // [x, y, z, scale, rot]
    [-0.058, 0.005, -0.034, 0.7, 0.4],
    [ 0.062, 0.005,  0.018, 0.9, 1.2],
    [-0.052, 0.005,  0.045, 0.8, 2.0],
    [ 0.040, 0.005, -0.058, 0.6, 0.7],
    [-0.038, 0.005, -0.062, 1.0, 1.6],
  ];

  return (
    <group>
      {/* Front stair step — single low slab leading up to the base */}
      <mesh position={[0, 0.006, -0.061]}>
        <boxGeometry args={[0.092, 0.012, 0.020]} />
        <meshStandardMaterial color="#b09a78" roughness={0.95} flatShading />
      </mesh>
      {/* Lower stepped base */}
      <mesh position={[0, 0.013, 0]}>
        <boxGeometry args={[0.135, 0.026, 0.105]} />
        <meshStandardMaterial color="#a89a82" roughness={0.95} flatShading />
      </mesh>
      {/* Upper plinth */}
      <mesh position={[0, 0.034, 0]}>
        <boxGeometry args={[0.108, 0.016, 0.082]} />
        <meshStandardMaterial color="#bdae93" roughness={0.95} flatShading />
      </mesh>
      {/* Cracked threshold tile, slightly off-color — reads as the entrance */}
      <mesh position={[0, 0.043, -0.030]}>
        <boxGeometry args={[0.040, 0.002, 0.018]} />
        <meshStandardMaterial color="#9c8a6a" roughness={0.95} flatShading />
      </mesh>
      {/* Standing / broken columns */}
      {COLUMNS.map(([x, z, h], i) => (
        <group key={i}>
          <mesh position={[x, 0.042 + h / 2, z]}>
            <cylinderGeometry args={[0.0085, 0.0105, h, 8]} />
            <meshStandardMaterial color="#c4b59e" roughness={0.95} flatShading />
          </mesh>
          {/* Capital block on top of taller columns */}
          {h > 0.05 && (
            <mesh position={[x, 0.042 + h + 0.005, z]}>
              <boxGeometry args={[0.022, 0.010, 0.022]} />
              <meshStandardMaterial color="#b5a78f" roughness={0.95} flatShading />
            </mesh>
          )}
          {/* Jagged broken cap on shorter columns — a tilted thin slab where
              the column was sheared off, sells the "ruin" silhouette. */}
          {h <= 0.05 && (
            <mesh position={[x, 0.042 + h + 0.002, z]} rotation={[0.18, i * 0.7, -0.15]}>
              <cylinderGeometry args={[0.0095, 0.0085, 0.005, 8]} />
              <meshStandardMaterial color="#9a8a72" roughness={1} flatShading />
            </mesh>
          )}
        </group>
      ))}
      {/* Inner altar — small pedestal block toward the back of the plinth */}
      <mesh position={[0, 0.050, 0.022]}>
        <boxGeometry args={[0.034, 0.018, 0.024]} />
        <meshStandardMaterial color="#9c8b6e" roughness={0.95} flatShading />
      </mesh>
      {/* Worn idol on the altar — dark stone */}
      <mesh position={[0, 0.066, 0.022]}>
        <coneGeometry args={[0.008, 0.018, 6]} />
        <meshStandardMaterial color="#3e3022" roughness={0.9} flatShading />
      </mesh>
      {/* Tilted lintel — slipped half off its supports */}
      <mesh position={[0.012, 0.048, -0.007]} rotation={[0.06, 0.38, 0.34]}>
        <boxGeometry args={[0.090, 0.011, 0.018]} />
        <meshStandardMaterial color="#a89978" roughness={0.95} flatShading />
      </mesh>
      {/* Fallen column drum lying on the plinth */}
      <mesh position={[-0.028, 0.052, 0.026]} rotation={[1.45, 0.25, 0]}>
        <cylinderGeometry args={[0.0085, 0.0085, 0.020, 7]} />
        <meshStandardMaterial color="#b3a48c" roughness={0.95} flatShading />
      </mesh>
      {/* Second fallen drum tumbled off the base */}
      <mesh position={[0.040, 0.030, 0.044]} rotation={[1.4, -0.6, 0.2]}>
        <cylinderGeometry args={[0.0080, 0.0080, 0.017, 7]} />
        <meshStandardMaterial color="#a89878" roughness={0.95} flatShading />
      </mesh>
      {/* Scattered rubble pebbles around the base */}
      {RUBBLE.map(([x, y, z, s, r], i) => (
        <mesh key={i} position={[x, y, z]} rotation={[r * 0.5, r, r * 0.3]} scale={s}>
          <boxGeometry args={[0.012, 0.008, 0.010]} />
          <meshStandardMaterial color="#a89786" roughness={1} flatShading />
        </mesh>
      ))}
      {/* Flanking torches at the entrance — sit on the lower base step in
          front of the front columns. */}
      <Torch x={-0.045} z={-0.048} baseY={0.026} seed={1} />
      <Torch x={0.045} z={-0.048} baseY={0.026} seed={2} />
    </group>
  );
}

// ─── atmosphere halo ─────────────────────────────────────────────────────────
//
// A slightly-larger back-faced sphere with a fresnel-falloff shader. Renders
// only the back hemisphere of the larger sphere, so depth-tested fragments
// outside the underlying globe's silhouette form a thin halo ring. The day
// side of the rim picks up sun direction; bloom turns the brightest pixels
// into a soft glow.

const ATMOSPHERE_VERT = /* glsl */`
  varying vec3 vWorldNormal;
  varying vec3 vViewDir;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vViewDir = normalize(cameraPosition - wp.xyz);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;
const ATMOSPHERE_FRAG = /* glsl */`
  varying vec3 vWorldNormal;
  varying vec3 vViewDir;
  uniform vec3 uColor;
  uniform vec3 uSunDir;
  uniform float uIntensity;
  void main() {
    // Back-face N points outward; visible halo fragments have N · V in
    // [-0.5, 0]. -dot gives 0 at outer silhouette, ~0.5 at inner edge —
    // brightest where the halo touches the globe's rim. Higher exponent
    // concentrates the glow near the limb so the halo reads as a thin
    // Rayleigh band rather than a uniform corona.
    float rim = max(-dot(vWorldNormal, vViewDir), 0.0);
    float halo = pow(rim * 2.6, 2.4);
    halo = clamp(halo, 0.0, 1.0);

    // Day/night gradient — sun-side rim glows stronger.
    float lit = max(dot(vWorldNormal, uSunDir), 0.0);
    float dayMix = 0.35 + lit * 0.85;

    // Terminator warmth: peaks where the rim crosses the sunrise/sunset
    // line (lit just past 0 on the day side), fades by mid-day, hidden at
    // night. This is the warm Rayleigh band you see on the day-side limb
    // near the terminator from low Earth orbit.
    float warmth = 1.0 - smoothstep(0.0, 0.55, lit);
    warmth *= step(0.001, lit);
    warmth *= warmth;
    vec3 warmTint = vec3(1.0, 0.62, 0.38);
    vec3 tinted = mix(uColor, warmTint, warmth * 0.55);

    float intensity = halo * dayMix * uIntensity;
    gl_FragColor = vec4(tinted * intensity, intensity);
  }
`;

function AtmosphereShell({ dayRef }: { dayRef: React.MutableRefObject<DayState> }) {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const uniforms = useMemo(
    () => ({
      uColor: { value: new THREE.Color('#9bc8ff') },
      uSunDir: { value: new THREE.Vector3(0.5, 0.6, 0.7) },
      uIntensity: { value: 1.6 },
    }),
    [],
  );
  useFrame(() => {
    const u = matRef.current?.uniforms;
    if (!u) return;
    const day = dayRef.current;
    (u.uSunDir as { value: THREE.Vector3 }).value.copy(day.sunDir);
    // Tint atmosphere with the current horizon color so dawn/dusk warm it,
    // night cools it. Heavier lerp toward base sky-blue keeps the halo
    // cool by default — the warm tint at the terminator now lives in the
    // shader rather than coming from the horizon palette.
    const c = (u.uColor as { value: THREE.Color }).value;
    c.copy(day.skyHorizon).lerp(_atmosphereDayBlue, 0.75);
    // Lower base + noon ramp so peak intensity (~0.95) stays under the
    // bloom luminanceThreshold (0.55) on most pixels, preventing the
    // hot-white halo bloom can otherwise create.
    const noon = THREE.MathUtils.smoothstep(day.sunIntensity, 0.2, 1.4);
    (u.uIntensity as { value: number }).value = 0.30 + noon * 0.65;
  });
  return (
    <mesh scale={1.07} renderOrder={2}>
      <sphereGeometry args={[GLOBE_RADIUS, 64, 48]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={ATMOSPHERE_VERT}
        fragmentShader={ATMOSPHERE_FRAG}
        uniforms={uniforms}
        side={THREE.BackSide}
        transparent
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </mesh>
  );
}
const _atmosphereDayBlue = new THREE.Color('#9bc8ff');

// ─── aurora — northern-lights cap above the local north pole ────────────────
//
// Sphere-cap mesh that lives inside the rotating Globe group, so the aurora
// stays anchored to the planet's local pole. Animated curtain pattern in the
// fragment shader, additive blended, masked to the night side.

const AURORA_VERT = /* glsl */`
  varying vec3 vLocalNormal;
  varying vec3 vWorldNormal;
  varying vec3 vViewDir;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vLocalNormal = normalize(normal);
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vViewDir = normalize(cameraPosition - wp.xyz);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;
const AURORA_FRAG = /* glsl */`
  varying vec3 vLocalNormal;
  varying vec3 vWorldNormal;
  varying vec3 vViewDir;
  uniform float uTime;
  uniform float uNightMix;
  uniform vec3 uSunDir;
  // +1 for the north-pole instance, -1 for the south-pole instance.
  uniform float uPoleY;
  void main() {
    // Angular distance from this instance's pole. 0 at pole, ~0.5 at 60°.
    float poleDist = 1.0 - uPoleY * vLocalNormal.y;
    if (poleDist > 0.55 || uNightMix < 0.04) discard;

    // Band mask: ribbons live ~5° to ~50° from pole.
    float bandMask = smoothstep(0.004, 0.020, poleDist)
                   * smoothstep(0.42, 0.22, poleDist);

    // Longitude — drives ribbon spacing around the pole.
    float lon = atan(vLocalNormal.z, vLocalNormal.x);

    // Curtain ribbons: stacked sin layers + a slow drift in time give an
    // organic, swaying feel without needing a noise texture.
    float r = 0.0;
    r += 0.50 + 0.50 * sin(lon * 6.0 + uTime * 0.32 + sin(uTime * 0.13) * 1.6);
    r += 0.40 * sin(lon * 11.0 - uTime * 0.45 + poleDist * 14.0);
    r += 0.25 * sin(poleDist * 22.0 + uTime * 0.55);
    r = clamp(r * 0.45 + 0.22, 0.0, 1.0);
    r = pow(r, 1.6);

    // Color gradient: green-teal near the pole, deep violet at outer fringe.
    vec3 col = mix(
      vec3(0.18, 0.88, 0.50),
      vec3(0.55, 0.28, 0.92),
      smoothstep(0.02, 0.32, poleDist)
    );

    // Hide on the day side. Generous falloff so the aurora fades smoothly
    // through dawn/dusk rather than popping at the terminator.
    float nightSide = clamp(1.0 - dot(vWorldNormal, uSunDir) * 1.3, 0.0, 1.0);

    // Limb boost — auroras read brightest seen edge-on, near the limb of
    // the planet, dim at the centre of the polar disc seen from above.
    float fres = pow(1.0 - max(dot(vWorldNormal, vViewDir), 0.0), 1.4);

    float intensity = bandMask * r * uNightMix * nightSide * (0.45 + fres * 0.75) * 0.85;

    gl_FragColor = vec4(col * intensity, intensity);
  }
`;

// ─── ice caps — frozen polar plates + localized snowfall ───────────────────
//
// Built like a simplified ContinentPatch in patch-local space (apex at +Y on
// the sphere surface), then wrapped in a group transform that places it at
// the actual north or south pole. A small Points cloud above the cap drifts
// downward in patch-local frame so the snowfall is localized to the polar
// region and rotates with the globe (like the volcano plume).

function IceCap({
  pole,
  dayRef,
}: {
  pole: 'north' | 'south';
  dayRef: React.MutableRefObject<DayState>;
}) {
  const matRef = useRef<THREE.MeshStandardMaterial>(null);
  const snowMatRef = useRef<THREE.PointsMaterial>(null);
  const snowPointsRef = useRef<THREE.Points>(null);

  // Place the patch-local frame at the actual pole. North: identity. South:
  // flip 180° around X so the patch-local +Y axis points toward world -Y,
  // which keeps the geometry winding correct (negative scale would reverse it).
  const { position, quaternion } = useMemo(() => {
    if (pole === 'north') {
      return {
        position: new THREE.Vector3(0, GLOBE_RADIUS, 0),
        quaternion: new THREE.Quaternion(),
      };
    }
    return {
      position: new THREE.Vector3(0, -GLOBE_RADIUS, 0),
      quaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI),
    };
  }, [pole]);

  const geom = useMemo(() => {
    const positions: number[] = [];
    const indices: number[] = [];
    const colors: number[] = [];
    const tmp = new THREE.Vector3();

    const baseRadius = ICE_BASE_RADIUS;
    const peakH = ICE_PEAK_H;
    const RAD_SEGS = 48;
    const RING_COUNT = 5;

    const phaseA = pole === 'north' ? 0.3 : 1.7;
    const phaseB = pole === 'north' ? 1.1 : 0.4;
    const wobAt = (theta: number) =>
      1 + 0.16 * Math.sin(theta * 3 + phaseA) + 0.10 * Math.sin(theta * 5 + phaseB);

    // Plateau-then-taper: full thickness for the inner half, easing to a thin
    // edge at the perimeter so it reads as a frozen ice sheet.
    const heightAt = (t: number) => {
      if (t <= 0.5) return peakH * (1 - t * 0.15);
      const u = (t - 0.5) / 0.5;
      const e = u * u * (3 - 2 * u);
      return peakH * (0.93 - e * 0.78);
    };

    const baseCol = new THREE.Color('#f4faff');
    const edgeCol = new THREE.Color('#bcd5e8');
    const tmpCol = new THREE.Color();

    projectToSphereLocal(0, 0, peakH, GLOBE_RADIUS, tmp);
    positions.push(tmp.x, tmp.y, tmp.z);
    colors.push(baseCol.r, baseCol.g, baseCol.b);

    for (let i = 1; i <= RING_COUNT; i++) {
      const t = i / RING_COUNT;
      const h = heightAt(t);
      for (let j = 0; j < RAD_SEGS; j++) {
        const theta = (j / RAD_SEGS) * Math.PI * 2;
        const wob = wobAt(theta);
        const x = Math.cos(theta) * baseRadius * wob * t;
        const z = Math.sin(theta) * baseRadius * wob * t;
        projectToSphereLocal(x, z, h, GLOBE_RADIUS, tmp);
        positions.push(tmp.x, tmp.y, tmp.z);
        tmpCol.copy(baseCol).lerp(edgeCol, t * 0.55);
        colors.push(tmpCol.r, tmpCol.g, tmpCol.b);
      }
    }

    for (let j = 0; j < RAD_SEGS; j++) {
      const b = 1 + j;
      const cIdx = 1 + ((j + 1) % RAD_SEGS);
      indices.push(0, cIdx, b);
    }
    for (let i = 1; i < RING_COUNT; i++) {
      const baseInner = 1 + (i - 1) * RAD_SEGS;
      const baseOuter = 1 + i * RAD_SEGS;
      for (let j = 0; j < RAD_SEGS; j++) {
        const a0 = baseInner + j;
        const a1 = baseInner + ((j + 1) % RAD_SEGS);
        const b0 = baseOuter + j;
        const b1 = baseOuter + ((j + 1) % RAD_SEGS);
        indices.push(a0, b1, b0);
        indices.push(a0, a1, b1);
      }
    }

    // Short skirt below the perimeter so the cap edge has a visible cliff
    // instead of vanishing into the ocean.
    const lastRingBase = 1 + (RING_COUNT - 1) * RAD_SEGS;
    const skirtBase = positions.length / 3;
    for (let j = 0; j < RAD_SEGS; j++) {
      const theta = (j / RAD_SEGS) * Math.PI * 2;
      const wob = wobAt(theta);
      const x = Math.cos(theta) * baseRadius * wob;
      const z = Math.sin(theta) * baseRadius * wob;
      projectToSphereLocal(x, z, -0.04, GLOBE_RADIUS, tmp);
      positions.push(tmp.x, tmp.y, tmp.z);
      colors.push(edgeCol.r, edgeCol.g, edgeCol.b);
    }
    for (let j = 0; j < RAD_SEGS; j++) {
      const j1 = (j + 1) % RAD_SEGS;
      const t0 = lastRingBase + j;
      const t1 = lastRingBase + j1;
      const s0 = skirtBase + j;
      const s1 = skirtBase + j1;
      indices.push(t0, s1, s0);
      indices.push(t0, t1, s1);
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    g.setIndex(indices);
    g.computeVertexNormals();
    return g;
  }, [pole]);

  // Localized snowfall over this cap. Points live in patch-local space, so
  // they're carried along with the cap when the globe rotates.
  const SNOW_COUNT = 70;
  const SNOW_RADIUS = ICE_BASE_RADIUS * 0.85; // pulled inside the cap silhouette
  const SNOW_TOP = 0.55;                       // patch-local +Y ceiling
  const SNOW_FLOOR = ICE_PEAK_H * 0.5;          // settle on the ice

  const snowTexture = useMemo(() => createSnowflakeTexture(), []);
  const { snowPositions, snowVelocities } = useMemo(() => {
    const snowPositions = new Float32Array(SNOW_COUNT * 3);
    const snowVelocities = new Float32Array(SNOW_COUNT * 3);
    for (let i = 0; i < SNOW_COUNT; i++) {
      // Uniform-area disk sampling so the column doesn't clump at center.
      const r = Math.sqrt(Math.random()) * SNOW_RADIUS;
      const theta = Math.random() * Math.PI * 2;
      snowPositions[i * 3]     = Math.cos(theta) * r;
      snowPositions[i * 3 + 1] = SNOW_FLOOR + Math.random() * (SNOW_TOP - SNOW_FLOOR);
      snowPositions[i * 3 + 2] = Math.sin(theta) * r;
      snowVelocities[i * 3]     = (Math.random() - 0.5) * 0.04;
      snowVelocities[i * 3 + 1] = -(0.10 + Math.random() * 0.14);
      snowVelocities[i * 3 + 2] = (Math.random() - 0.5) * 0.04;
    }
    return { snowPositions, snowVelocities };
  }, [SNOW_RADIUS, SNOW_FLOOR]);

  const snowGeom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(snowPositions, 3));
    return g;
  }, [snowPositions]);

  // Ice-surface sparkles: static positions scattered on top of the cap, each
  // with its own twinkle phase so they flash out of sync. Custom shader so
  // size + alpha can pulse per-vertex (PointsMaterial doesn't support that).
  const SPARKLE_COUNT = 35;
  const sparkleTexture = useMemo(() => createSparkleTexture(), []);
  const sparkleGeom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const positions = new Float32Array(SPARKLE_COUNT * 3);
    const phases = new Float32Array(SPARKLE_COUNT);
    const sizes = new Float32Array(SPARKLE_COUNT);
    const tmp = new THREE.Vector3();
    for (let i = 0; i < SPARKLE_COUNT; i++) {
      const r = Math.sqrt(Math.random()) * ICE_BASE_RADIUS * 0.92;
      const theta = Math.random() * Math.PI * 2;
      const x = Math.cos(theta) * r;
      const z = Math.sin(theta) * r;
      // Sit a sliver above the ice surface so the sprite isn't coplanar.
      const t = r / ICE_BASE_RADIUS;
      const surfaceH = ICE_PEAK_H * (t <= 0.5 ? (1 - t * 0.15) : (0.93 - ((t - 0.5) / 0.5) * ((t - 0.5) / 0.5) * (3 - 2 * (t - 0.5) / 0.5) * 0.78));
      projectToSphereLocal(x, z, surfaceH + 0.005, GLOBE_RADIUS, tmp);
      positions[i * 3]     = tmp.x;
      positions[i * 3 + 1] = tmp.y;
      positions[i * 3 + 2] = tmp.z;
      phases[i] = Math.random() * Math.PI * 2;
      sizes[i] = 1.6 + Math.random() * 1.4;
    }
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
    g.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    return g;
  }, []);

  const sparkleUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uTex: { value: sparkleTexture },
      uColor: { value: new THREE.Color('#ffffff') },
      uPxScale: { value: 8 },
    }),
    [sparkleTexture],
  );

  useFrame((state, dt) => {
    const day = dayRef.current;
    if (matRef.current) {
      const lit = THREE.MathUtils.clamp(0.6 + day.sunIntensity * 0.5, 0.5, 1.1);
      matRef.current.color.setRGB(lit, lit * 1.01, lit * 1.05);
    }

    sparkleUniforms.uTime.value = state.clock.elapsedTime;
    // Sparkles brighter at twilight/night when the sun isn't washing them out.
    const sparkleTint = THREE.MathUtils.clamp(1.0 - day.sunIntensity * 0.35, 0.55, 1.0);
    sparkleUniforms.uColor.value.setRGB(sparkleTint, sparkleTint, sparkleTint * 1.05);

    if (!snowPointsRef.current) return;
    const attr = snowPointsRef.current.geometry.attributes.position as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    const t = state.clock.elapsedTime;
    for (let i = 0; i < SNOW_COUNT; i++) {
      const ix = i * 3;
      // Gentle horizontal flutter; flakes don't fall in straight lines.
      const swayX = Math.sin(t * 1.1 + i * 0.41) * 0.05;
      const swayZ = Math.cos(t * 0.9 + i * 0.27) * 0.05;
      arr[ix]     += (snowVelocities[ix]     + swayX) * dt;
      arr[ix + 1] += snowVelocities[ix + 1] * dt;
      arr[ix + 2] += (snowVelocities[ix + 2] + swayZ) * dt;
      if (arr[ix + 1] < SNOW_FLOOR) {
        const r = Math.sqrt(Math.random()) * SNOW_RADIUS;
        const theta = Math.random() * Math.PI * 2;
        arr[ix]     = Math.cos(theta) * r;
        arr[ix + 1] = SNOW_TOP + Math.random() * 0.3;
        arr[ix + 2] = Math.sin(theta) * r;
      }
    }
    attr.needsUpdate = true;

    if (snowMatRef.current) {
      // Slightly dimmer in bright daylight so the flakes don't dominate.
      snowMatRef.current.opacity = THREE.MathUtils.clamp(0.85 - day.sunIntensity * 0.20, 0.55, 0.9);
    }
  });

  return (
    <group position={position} quaternion={quaternion}>
      <mesh geometry={geom} renderOrder={3}>
        <meshStandardMaterial
          ref={matRef}
          vertexColors
          flatShading
          roughness={0.4}
          metalness={0.05}
        />
      </mesh>
      <points geometry={sparkleGeom} renderOrder={5}>
        <shaderMaterial
          vertexShader={SPARKLE_VERT}
          fragmentShader={SPARKLE_FRAG}
          uniforms={sparkleUniforms}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
      <points ref={snowPointsRef} geometry={snowGeom} renderOrder={4}>
        <pointsMaterial
          ref={snowMatRef}
          map={snowTexture}
          size={0.04}
          sizeAttenuation
          transparent
          depthWrite={false}
          alphaTest={0.01}
          color="#f4f9ff"
        />
      </points>
    </group>
  );
}

function createSnowflakeTexture(): THREE.CanvasTexture {
  // 6-fold-symmetric flake: main arm + barbs at 1/3 and 2/3 of its length,
  // rotated 6 times around the center. Soft halo behind so out-of-focus flakes
  // still read as bright dots rather than scratchy lines.
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, 64, 64);
  ctx.translate(32, 32);

  // Halo first (drawn under the arms via composite below).
  const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, 28);
  halo.addColorStop(0, 'rgba(255,255,255,0.55)');
  halo.addColorStop(0.45, 'rgba(220,235,255,0.20)');
  halo.addColorStop(1, 'rgba(220,235,255,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(-32, -32, 64, 64);

  ctx.strokeStyle = 'rgba(248,252,255,1)';
  ctx.lineCap = 'round';
  ctx.lineWidth = 2.0;
  for (let i = 0; i < 6; i++) {
    ctx.save();
    ctx.rotate((i / 6) * Math.PI * 2);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -22);
    // outer barbs
    ctx.moveTo(0, -10); ctx.lineTo(-5, -15);
    ctx.moveTo(0, -10); ctx.lineTo(5, -15);
    // inner barbs
    ctx.moveTo(0, -16); ctx.lineTo(-3, -19);
    ctx.moveTo(0, -16); ctx.lineTo(3, -19);
    ctx.stroke();
    ctx.restore();
  }

  // Bright center pip.
  const pip = ctx.createRadialGradient(0, 0, 0, 0, 0, 4);
  pip.addColorStop(0, 'rgba(255,255,255,1)');
  pip.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = pip;
  ctx.fillRect(-4, -4, 8, 8);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createSparkleTexture(): THREE.CanvasTexture {
  // 4-point cross/star with a soft glow — used for ice-surface twinkles.
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 32;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, 32, 32);
  ctx.translate(16, 16);

  const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, 14);
  halo.addColorStop(0, 'rgba(255,255,255,0.95)');
  halo.addColorStop(0.4, 'rgba(220,240,255,0.45)');
  halo.addColorStop(1, 'rgba(220,240,255,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(-16, -16, 32, 32);

  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = 'rgba(255,255,255,1)';
  ctx.lineCap = 'round';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(0, -13); ctx.lineTo(0, 13);
  ctx.moveTo(-13, 0); ctx.lineTo(13, 0);
  ctx.stroke();
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(-9, -9); ctx.lineTo(9, 9);
  ctx.moveTo(9, -9); ctx.lineTo(-9, 9);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const SPARKLE_VERT = /* glsl */ `
  attribute float aPhase;
  attribute float aSize;
  uniform float uTime;
  uniform float uPxScale;
  varying float vAlpha;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    // Sharp twinkle: pow(sin, 6) makes each flake dark for most of the cycle
    // with a brief bright flash, so the cap looks dusted, not glowing.
    float s = 0.5 + 0.5 * sin(uTime * 2.6 + aPhase);
    float pulse = pow(s, 6.0);
    gl_PointSize = aSize * pulse * (uPxScale / -mv.z);
    vAlpha = pulse;
  }
`;

const SPARKLE_FRAG = /* glsl */ `
  uniform sampler2D uTex;
  uniform vec3 uColor;
  varying float vAlpha;
  void main() {
    vec4 t = texture2D(uTex, gl_PointCoord);
    if (t.a < 0.01) discard;
    gl_FragColor = vec4(uColor * t.rgb, t.a * vAlpha);
  }
`;

function Aurora({
  dayRef,
  pole,
}: {
  dayRef: React.MutableRefObject<DayState>;
  pole: 'north' | 'south';
}) {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const poleY = pole === 'north' ? 1 : -1;
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uNightMix: { value: 0 },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uPoleY: { value: poleY },
    }),
    [poleY],
  );
  useFrame((state) => {
    const u = matRef.current?.uniforms;
    if (!u) return;
    (u.uTime as { value: number }).value = state.clock.elapsedTime;
    const day = dayRef.current;
    (u.uSunDir as { value: THREE.Vector3 }).value.copy(day.sunDir);
    (u.uNightMix as { value: number }).value =
      1 - THREE.MathUtils.smoothstep(day.sunIntensity, 0.05, 0.6);
  });
  // Polar sphere-cap. North uses thetaStart=0, south uses thetaStart=2π/3 so
  // the geometry only spans the relevant ~60° around the pole. Sits a sliver
  // above the ocean shell so it doesn't z-fight, additive blended.
  const thetaStart = pole === 'north' ? 0 : (Math.PI * 2) / 3;
  return (
    <mesh renderOrder={3}>
      <sphereGeometry
        args={[GLOBE_RADIUS * 1.012, 48, 16, 0, Math.PI * 2, thetaStart, Math.PI / 3]}
      />
      <shaderMaterial
        ref={matRef}
        vertexShader={AURORA_VERT}
        fragmentShader={AURORA_FRAG}
        uniforms={uniforms}
        transparent
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

// ─── shooting stars — occasional bright streaks across the night sky ────────
//
// Two pre-allocated streak slots, world-space (so they don't rotate with the
// globe). Each slot ticks down to a random spawn time during night, animates
// a tail-following-head streak, fades, then re-arms.

function createStreakTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 32;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, 256, 32);

  // Streak gradient: faint cool tail at left → bright warm head at right.
  const grad = ctx.createLinearGradient(0, 0, 256, 0);
  grad.addColorStop(0.0, 'rgba(180, 200, 255, 0)');
  grad.addColorStop(0.45, 'rgba(220, 230, 255, 0.22)');
  grad.addColorStop(0.85, 'rgba(255, 255, 255, 0.95)');
  grad.addColorStop(1.0, 'rgba(255, 248, 220, 1.0)');

  // Apply the horizontal gradient row by row, multiplied by a soft vertical
  // taper so the streak has a thinning top/bottom edge instead of a hard band.
  for (let y = 0; y < 32; y++) {
    const yMid = (y - 16) / 16;
    const yFade = Math.max(0, 1 - yMid * yMid * 1.4);
    ctx.globalAlpha = yFade;
    ctx.fillStyle = grad;
    ctx.fillRect(0, y, 256, 1);
  }

  // Bright glow around the head.
  ctx.globalAlpha = 1;
  const headGlow = ctx.createRadialGradient(248, 16, 0, 248, 16, 16);
  headGlow.addColorStop(0, 'rgba(255, 255, 255, 1)');
  headGlow.addColorStop(0.45, 'rgba(255, 240, 220, 0.7)');
  headGlow.addColorStop(1, 'rgba(255, 220, 180, 0)');
  ctx.fillStyle = headGlow;
  ctx.fillRect(228, 0, 28, 32);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

interface StreakSlot {
  active: boolean;
  start: THREE.Vector3;
  end: THREE.Vector3;
  timer: number;
  duration: number;
  nextSpawn: number;
}

const _streakHead = new THREE.Vector3();
const _streakTail = new THREE.Vector3();
const _streakMid = new THREE.Vector3();
const _streakX = new THREE.Vector3();
const _streakY = new THREE.Vector3();
const _streakZ = new THREE.Vector3();
const _streakMat4 = new THREE.Matrix4();

function spawnStreak(slot: StreakSlot) {
  // Camera sits at +Z looking toward origin, so the visible front
  // hemisphere is z < 0. Negate the Z component for both the spawn
  // position AND the velocity direction so streaks appear in front of
  // the camera instead of behind it.
  const az = (Math.random() - 0.5) * Math.PI * 1.3;
  const el = 0.18 + Math.random() * 0.55;
  const dist = 28 + Math.random() * 12;
  const cosEl = Math.cos(el);
  slot.start
    .set(
      Math.sin(az) * cosEl,
      Math.sin(el),
      -Math.cos(az) * cosEl,
    )
    .multiplyScalar(dist);

  // Velocity primarily in the camera-tangent (XY) plane with a downward
  // bias, so streaks read as falling across the sky rather than racing
  // away from the viewer.
  const velAngle = Math.random() * Math.PI * 2;
  const vx = Math.cos(velAngle);
  const vy = Math.sin(velAngle) * 0.6 - 0.45;
  const length = 9 + Math.random() * 6;
  const velLen = Math.sqrt(vx * vx + vy * vy);
  slot.end.set(
    slot.start.x + (vx / velLen) * length,
    slot.start.y + (vy / velLen) * length,
    slot.start.z,
  );

  slot.timer = 0;
  slot.duration = 0.85 + Math.random() * 0.7;
}

function ShootingStars({ dayRef }: { dayRef: React.MutableRefObject<DayState> }) {
  const meshA = useRef<THREE.Mesh>(null);
  const meshB = useRef<THREE.Mesh>(null);
  const matA = useRef<THREE.MeshBasicMaterial>(null);
  const matB = useRef<THREE.MeshBasicMaterial>(null);
  const texture = useMemo(() => createStreakTexture(), []);
  const { camera } = useThree();
  const slotsRef = useRef<StreakSlot[]>([
    {
      active: false,
      start: new THREE.Vector3(),
      end: new THREE.Vector3(),
      timer: 0,
      duration: 1,
      nextSpawn: 4 + Math.random() * 8,
    },
    {
      active: false,
      start: new THREE.Vector3(),
      end: new THREE.Vector3(),
      timer: 0,
      duration: 1,
      nextSpawn: 11 + Math.random() * 12,
    },
  ]);

  useFrame((_, dt) => {
    const day = dayRef.current;
    const nightMix = 1 - THREE.MathUtils.smoothstep(day.sunIntensity, 0.05, 0.6);
    const meshes = [meshA.current, meshB.current];
    const mats = [matA.current, matB.current];

    slotsRef.current.forEach((slot, i) => {
      const mesh = meshes[i];
      const mat = mats[i];
      if (!mesh || !mat) return;

      // Hide entirely outside of night — stops the spawn timers too so
      // streaks don't pile up unseen during the day.
      if (nightMix < 0.30) {
        mesh.visible = false;
        slot.active = false;
        return;
      }

      if (!slot.active) {
        slot.nextSpawn -= dt;
        mesh.visible = false;
        if (slot.nextSpawn <= 0) {
          spawnStreak(slot);
          slot.active = true;
        }
        return;
      }

      slot.timer += dt;
      const t = slot.timer / slot.duration;
      if (t >= 1) {
        slot.active = false;
        slot.nextSpawn = 5 + Math.random() * 14;
        mesh.visible = false;
        return;
      }

      // Head moves linearly from start → end. Tail trails ~18% behind the
      // head's lerp position, so the streak grows from a point at spawn to
      // full length once t passes 0.18.
      _streakHead.copy(slot.start).lerp(slot.end, t);
      _streakTail.copy(slot.start).lerp(slot.end, Math.max(0, t - 0.18));
      _streakMid.copy(_streakHead).lerp(_streakTail, 0.5);
      mesh.position.copy(_streakMid);

      // Billboard the streak so it always faces the camera, with the long
      // axis aligned to head→tail.
      _streakX.copy(_streakHead).sub(_streakTail).normalize();
      _streakZ.copy(camera.position).sub(_streakMid).normalize();
      _streakY.crossVectors(_streakZ, _streakX).normalize();
      _streakZ.crossVectors(_streakX, _streakY); // re-orthogonalize
      _streakMat4.makeBasis(_streakX, _streakY, _streakZ);
      mesh.quaternion.setFromRotationMatrix(_streakMat4);

      const length = _streakHead.distanceTo(_streakTail);
      mesh.scale.set(length, 0.32, 1);

      // Fade in fast, hold, fade out as the head approaches its endpoint.
      const fadeIn = THREE.MathUtils.smoothstep(t, 0.0, 0.18);
      const fadeOut = 1 - THREE.MathUtils.smoothstep(t, 0.75, 1.0);
      mat.opacity = nightMix * fadeIn * fadeOut * 0.95;
      mesh.visible = true;
    });
  });

  return (
    <>
      <mesh ref={meshA} visible={false} renderOrder={4}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial
          ref={matA}
          map={texture}
          transparent
          depthWrite={false}
          depthTest={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
      <mesh ref={meshB} visible={false} renderOrder={4}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial
          ref={matB}
          map={texture}
          transparent
          depthWrite={false}
          depthTest={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
    </>
  );
}

// ─── lighthouse — randomly placed coastal beacon with rotating beam ─────────
//
// One lighthouse per splash session, placed at a random point along the
// perimeter of a random continent. Beam rotates around the local vertical,
// dims to a faint pilot light during the day and grows into a sweeping
// glow at night with a subtle scintillating shimmer along its length.

const BEAM_VERT = /* glsl */`
  varying float vAxisT;
  uniform float uHalfHeight;
  void main() {
    // ConeGeometry has apex at +halfHeight, base at -halfHeight on its
    // local Y axis. Map to t ∈ [0, 1] where 0 = apex, 1 = base.
    vAxisT = (uHalfHeight - position.y) / (2.0 * uHalfHeight);
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
  }
`;
const BEAM_FRAG = /* glsl */`
  varying float vAxisT;
  uniform float uTime;
  uniform float uNightMix;
  uniform vec3 uColor;
  void main() {
    // Brightest at the apex (lamp), fading to nothing at the projection end.
    float lenFade = pow(1.0 - vAxisT, 0.85);
    // Subtle moving shimmer along the cone length.
    float shimmer = 0.85 + 0.15 * sin(vAxisT * 18.0 - uTime * 1.6);
    float alpha = lenFade * shimmer * uNightMix * 0.55;
    gl_FragColor = vec4(uColor * alpha, alpha);
  }
`;

const BEAM_LENGTH = 0.55;
const BEAM_RADIUS = 0.12;

function LighthouseStructure({ dayRef }: { dayRef: React.MutableRefObject<DayState> }) {
  const beamRotator = useRef<THREE.Group>(null);
  const lampMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const lampGlowMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const beamMatRef = useRef<THREE.ShaderMaterial>(null);

  // Stable beam phase offset per lighthouse so the sweep doesn't always
  // start aligned with the random spawn axis.
  const phase = useMemo(() => Math.random() * Math.PI * 2, []);

  const beamUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uNightMix: { value: 0 },
      uHalfHeight: { value: BEAM_LENGTH * 0.5 },
      uColor: { value: new THREE.Color('#fff1b0') },
    }),
    [],
  );

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const day = dayRef.current;
    const nightMix =
      1 - THREE.MathUtils.smoothstep(day.sunIntensity, 0.05, 0.6);

    if (beamRotator.current) {
      // ~11 second period — slow, steady, classic.
      beamRotator.current.rotation.y = phase + t * 0.58;
    }
    if (lampMatRef.current) {
      // Gentle breathing pulse on the lamp room itself.
      const pulse = 0.88 + Math.sin(t * 4.2 + phase) * 0.08;
      const introWink = Math.sin(clamp01((t - 0.82) / 0.58) * Math.PI);
      lampMatRef.current.opacity = Math.min(1, (0.45 + nightMix * 0.55) * pulse + introWink * 0.42);
    }
    if (lampGlowMatRef.current) {
      // Outer glow halo — only really visible at night.
      const introWink = Math.sin(clamp01((t - 0.82) / 0.58) * Math.PI);
      lampGlowMatRef.current.opacity = Math.min(0.82, nightMix * 0.55 + introWink * 0.35);
    }
    const u = beamMatRef.current?.uniforms;
    if (u) {
      (u.uTime as { value: number }).value = t;
      const introWink = Math.sin(clamp01((t - 0.82) / 0.58) * Math.PI);
      (u.uNightMix as { value: number }).value = Math.min(1, nightMix + introWink * 0.55);
    }
  });

  // Tower segment heights, stacked from the surface upward.
  const stoneH = 0.024;
  const towerH = 0.082;
  const stripeH = 0.012;
  const lampH = 0.024;
  const stoneY = stoneH * 0.5;
  const towerY = stoneH + towerH * 0.5;
  const stripeY = stoneH + towerH + stripeH * 0.5;
  const lampY = stoneH + towerH + stripeH + lampH * 0.5;
  const roofY = stoneH + towerH + stripeH + lampH + 0.005;

  return (
    <group>
      {/* Stone foundation — wider, darker, rougher than the painted tower */}
      <mesh position={[0, stoneY, 0]}>
        <cylinderGeometry args={[0.026, 0.030, stoneH, 10]} />
        <meshStandardMaterial color="#7a6952" roughness={1} flatShading />
      </mesh>
      {/* White-painted tower body, slightly tapered toward the top */}
      <mesh position={[0, towerY, 0]}>
        <cylinderGeometry args={[0.020, 0.024, towerH, 12]} />
        <meshStandardMaterial color="#f4eedd" roughness={0.85} />
      </mesh>
      {/* Red gallery band */}
      <mesh position={[0, stripeY, 0]}>
        <cylinderGeometry args={[0.0225, 0.0225, stripeH, 12]} />
        <meshStandardMaterial color="#a52e26" roughness={0.7} />
      </mesh>
      {/* Lamp room — emissive sphere that always glows a little, more at night */}
      <mesh position={[0, lampY, 0]}>
        <sphereGeometry args={[lampH * 0.62, 16, 10]} />
        <meshBasicMaterial
          ref={lampMatRef}
          color="#ffe082"
          toneMapped={false}
          transparent
          opacity={0.85}
        />
      </mesh>
      {/* Lamp halo — bigger, much fainter, hot-side bloom feeder at night */}
      <mesh position={[0, lampY, 0]}>
        <sphereGeometry args={[lampH * 1.4, 16, 10]} />
        <meshBasicMaterial
          ref={lampGlowMatRef}
          color="#fff2b0"
          toneMapped={false}
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      {/* Conical roof above the lamp */}
      <mesh position={[0, roofY, 0]}>
        <coneGeometry args={[lampH * 0.7, 0.018, 10]} />
        <meshStandardMaterial color="#3a2826" roughness={0.85} flatShading />
      </mesh>

      {/* Beam — rotates around local +Y at the lamp height. Inner group
          tilts the cone slightly downward so it sweeps the water surface
          rather than firing into space. */}
      <group ref={beamRotator} position={[0, lampY, 0]}>
        <group rotation={[0, 0, -0.16]}>
          {/* ConeGeometry default: apex at +Y, base at -Y. Rotate Z=+π/2 so
              apex maps to -X and base to +X, then translate by +H/2 in X
              to put the apex right at the lamp and the base out at +H. */}
          <mesh
            rotation={[0, 0, Math.PI / 2]}
            position={[BEAM_LENGTH / 2, 0, 0]}
          >
            <coneGeometry args={[BEAM_RADIUS, BEAM_LENGTH, 16, 1, true]} />
            <shaderMaterial
              ref={beamMatRef}
              vertexShader={BEAM_VERT}
              fragmentShader={BEAM_FRAG}
              uniforms={beamUniforms}
              transparent
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              side={THREE.DoubleSide}
              toneMapped={false}
            />
          </mesh>
        </group>
      </group>
    </group>
  );
}

function Lighthouse({ dayRef }: { dayRef: React.MutableRefObject<DayState> }) {
  // Pick a random continent + perimeter point on mount. Persists for the
  // splash session — the "random" is per-page-load. We also bake the
  // continent's own position+rotation transform here, since ContinentPatch
  // (which normally wraps features in that frame) isn't an ancestor of
  // this component — Lighthouse is mounted as a sibling of all patches
  // inside Globe, so FeatureMount alone would place the tower near globe
  // origin instead of on the continent's surface.
  const placement = useMemo(() => {
    const c = CONTINENTS[Math.floor(Math.random() * CONTINENTS.length)];
    const angle = Math.random() * Math.PI * 2;
    // r in 0.55-0.85 of the patch radius — toward the coast, but inside
    // the cliff plateau (heightAt drops past ~0.6).
    const r = 0.55 + Math.random() * 0.30;

    const normal = latLonToVec3(c.lat, c.lon, 1).normalize();
    const continentPos = normal.clone().multiplyScalar(GLOBE_RADIUS);
    const baseQuat = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      normal,
    );
    const yawQuat = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      c.rotation,
    );
    const continentQuat = baseQuat.clone().multiply(yawQuat);

    return {
      continent: c,
      u: Math.cos(angle) * c.rx * r * GLOBE_RADIUS,
      v: Math.sin(angle) * c.rz * r * GLOBE_RADIUS,
      continentPos,
      continentQuat,
    };
  }, []);

  return (
    <group position={placement.continentPos} quaternion={placement.continentQuat}>
      <FeatureMount u={placement.u} v={placement.v} c={placement.continent}>
        <LighthouseStructure dayRef={dayRef} />
      </FeatureMount>
    </group>
  );
}

// ─── globe ───────────────────────────────────────────────────────────────────

function Globe({
  rotationRef,
  dayRef,
  introRef,
}: {
  rotationRef: React.MutableRefObject<THREE.Quaternion>;
  dayRef: React.MutableRefObject<DayState>;
  introRef: IntroProgressRef;
}) {
  const groupRef = useRef<THREE.Group>(null);
  useFrame(() => {
    if (!groupRef.current) return;
    const intro = easeOutCubic(introRef.current / INTRO_GLOBE_DURATION);
    groupRef.current.quaternion.copy(rotationRef.current);
    groupRef.current.scale.setScalar(0.90 + intro * 0.10);
    groupRef.current.position.y = (1 - intro) * -0.055;
  });
  return (
    <group ref={groupRef}>
      <OceanShell dayRef={dayRef} />
      {CONTINENTS.map((c, i) => <ContinentPatch key={i} continent={c} />)}
      <IceCap dayRef={dayRef} pole="north" />
      <IceCap dayRef={dayRef} pole="south" />
      <Aurora dayRef={dayRef} pole="north" />
      <Aurora dayRef={dayRef} pole="south" />
      <Lighthouse dayRef={dayRef} />
    </group>
  );
}

function GlobeRevealMask({ introRef }: { introRef: IntroProgressRef }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshBasicMaterial>(null);

  useFrame(() => {
    const intro = easeOutCubic(introRef.current / 2.55);
    const opacity = (1 - intro) * 0.96;
    if (matRef.current) {
      matRef.current.opacity = opacity;
      matRef.current.visible = opacity > 0.01;
    }
    if (meshRef.current) {
      const globeIntro = easeOutCubic(introRef.current / INTRO_GLOBE_DURATION);
      meshRef.current.scale.setScalar(0.90 + globeIntro * 0.10);
      meshRef.current.position.y = (1 - globeIntro) * -0.055;
    }
  });

  return (
    <mesh ref={meshRef} renderOrder={90}>
      <sphereGeometry args={[GLOBE_RADIUS * 1.09, 64, 48]} />
      <meshBasicMaterial
        ref={matRef}
        color="#04050a"
        transparent
        opacity={0.96}
        depthWrite={false}
        depthTest={false}
        toneMapped={false}
      />
    </mesh>
  );
}

// ─── ship — tiny billboard sprite, top-down icon, smaller than a tree ───────

// Draw a top-down ship icon to a canvas, bow facing +Y (top of canvas).
// Returns a CanvasTexture ready to slap onto a small plane.
function createShipTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, 128, 128);

  // Soft drop-shadow on water below the hull
  const grad = ctx.createRadialGradient(64, 96, 4, 64, 96, 30);
  grad.addColorStop(0, 'rgba(20, 30, 45, 0.35)');
  grad.addColorStop(1, 'rgba(20, 30, 45, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 70, 128, 50);

  // Hull — pointed-bow oval
  ctx.fillStyle = '#5b3a22';
  ctx.strokeStyle = '#2e1c0e';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(64, 22);
  ctx.bezierCurveTo(94, 38, 94, 92, 64, 106);
  ctx.bezierCurveTo(34, 92, 34, 38, 64, 22);
  ctx.fill();
  ctx.stroke();

  // Deck — lighter inner oval
  ctx.fillStyle = '#a0784a';
  ctx.beginPath();
  ctx.moveTo(64, 32);
  ctx.bezierCurveTo(84, 44, 84, 86, 64, 96);
  ctx.bezierCurveTo(44, 86, 44, 44, 64, 32);
  ctx.fill();

  // Gold gunwale trim
  ctx.strokeStyle = '#d6b46c';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(64, 32);
  ctx.bezierCurveTo(84, 44, 84, 86, 64, 96);
  ctx.bezierCurveTo(44, 86, 44, 44, 64, 32);
  ctx.stroke();

  // Sail — cream curved leaf, billowed forward of the mast
  ctx.fillStyle = '#fbf4e6';
  ctx.strokeStyle = '#a08060';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(64, 36);
  ctx.bezierCurveTo(82, 54, 82, 80, 64, 92);
  ctx.bezierCurveTo(46, 80, 46, 54, 64, 36);
  ctx.fill();
  ctx.stroke();

  // Mast (thin dark line down the centre)
  ctx.strokeStyle = '#3a2410';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(64, 30);
  ctx.lineTo(64, 96);
  ctx.stroke();

  // Pennant — small gold triangle at bow
  ctx.fillStyle = '#c9a84c';
  ctx.beginPath();
  ctx.moveTo(64, 30);
  ctx.lineTo(76, 34);
  ctx.lineTo(64, 38);
  ctx.fill();

  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createWakeTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 160;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, 256, 160);

  const wake = ctx.createLinearGradient(128, 16, 128, 154);
  wake.addColorStop(0, 'rgba(255,255,255,0)');
  wake.addColorStop(0.18, 'rgba(230,248,255,0.45)');
  wake.addColorStop(0.56, 'rgba(180,230,255,0.16)');
  wake.addColorStop(1, 'rgba(255,255,255,0)');

  ctx.strokeStyle = wake;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let i = 0; i < 5; i++) {
    const offset = (i - 2) * 13;
    const alpha = 1 - Math.abs(i - 2) * 0.16;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = 3.5 - Math.abs(i - 2) * 0.35;
    ctx.beginPath();
    ctx.moveTo(128 + offset * 0.18, 18);
    ctx.bezierCurveTo(118 + offset, 48, 92 + offset * 1.2, 86, 54 + offset * 1.45, 140);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(128 - offset * 0.18, 18);
    ctx.bezierCurveTo(138 - offset, 48, 164 - offset * 1.2, 86, 202 - offset * 1.45, 140);
    ctx.stroke();
  }
  ctx.globalAlpha = 0.42;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(128, 28, 38, 9, 0, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(220,245,255,0.45)';
  ctx.stroke();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function ShipSprite({
  heelRef,
  collisionRef,
  speedRef,
  dayRef,
  factionKey,
  introRef,
}: {
  heelRef: React.MutableRefObject<number>;
  collisionRef: React.MutableRefObject<number>;
  speedRef: React.MutableRefObject<number>;
  dayRef: React.MutableRefObject<DayState>;
  factionKey: FactionKey;
  introRef: IntroProgressRef;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const innerRef = useRef<THREE.Group>(null);
  const matRef = useRef<THREE.MeshBasicMaterial>(null);
  const shadowMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const wakeMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const fallbackTexture = useMemo(() => createShipTexture(), []);
  const wakeTexture = useMemo(() => createWakeTexture(), []);
  const [loadedTexture, setLoadedTexture] = useState<THREE.Texture | null>(null);

  // Try to load the faction-specific sprite. Until a key is enabled in
  // FACTION_SHIP_SPRITE_AVAILABLE we keep the canvas-drawn fallback so
  // blank stub PNGs don't render as invisible ships.
  useEffect(() => {
    if (!FACTION_SHIP_SPRITE_AVAILABLE.has(factionKey)) {
      setLoadedTexture(null);
      return;
    }
    let cancelled = false;
    const loader = new THREE.TextureLoader();
    loader.load(
      factionShipUrl(factionKey),
      (tex) => {
        if (cancelled) { tex.dispose(); return; }
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 8;
        setLoadedTexture(tex);
      },
      undefined,
      () => { if (!cancelled) setLoadedTexture(null); }
    );
    return () => { cancelled = true; };
  }, [factionKey]);

  // Dispose loaded textures when they're swapped out.
  useEffect(() => {
    return () => { loadedTexture?.dispose(); };
  }, [loadedTexture]);

  const texture = loadedTexture ?? fallbackTexture;

  const surfaceNormal = useMemo(() => SHIP_ANCHOR.clone().normalize(), []);

  // Base orientation: aligns the plane so its texture-up (+Y) follows the
  // local "north" tangent on the sphere and its face-normal (+Z) points
  // along the surface normal. Heading then rotates around that normal.
  const baseQuaternion = useMemo(() => {
    const z = surfaceNormal.clone();
    const worldUp = new THREE.Vector3(0, 1, 0);
    // Tangent "up" along the meridian = worldUp projected onto the tangent
    // plane. Falls back to +Y if the ship is at a pole (degenerate).
    const y = worldUp.clone().sub(z.clone().multiplyScalar(worldUp.dot(z)));
    if (y.lengthSq() < 1e-6) y.set(0, 0, -1);
    y.normalize();
    const x = new THREE.Vector3().crossVectors(y, z).normalize();
    const m = new THREE.Matrix4().makeBasis(x, y, z);
    return new THREE.Quaternion().setFromRotationMatrix(m);
  }, [surfaceNormal]);

  // World-space tilt of the deck toward the camera so the icon reads as
  // a 3D ship from a high angle rather than a flat sticker. Applied
  // OUTSIDE the heading rotation so the bow always foreshortens the same
  // way regardless of which direction the ship is pointing.
  const worldTiltQuaternion = useMemo(
    () => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.42),
    []
  );
  const _headingScratch = useMemo(() => new THREE.Quaternion(), []);
  const _zAxis = useMemo(() => new THREE.Vector3(0, 0, 1), []);

  useFrame((state) => {
    if (!groupRef.current || !innerRef.current) return;
    const t = state.clock.elapsedTime;
    const intro = easeOutBack((introRef.current - INTRO_SHIP_DELAY) / INTRO_SHIP_DURATION);
    const introFade = easeOutCubic((introRef.current - INTRO_SHIP_DELAY) / INTRO_SHIP_DURATION);

    const bob = Math.sin(t * 2.2) * 0.005;
    const recoil = collisionRef.current * 0.025;
    // Lift well above the ocean shell to dodge z-fighting and keep the
    // sprite reading clearly against the water beneath it.
    groupRef.current.position
      .copy(SHIP_ANCHOR)
      .add(surfaceNormal.clone().multiplyScalar(0.05 + bob - recoil));
    groupRef.current.scale.setScalar(0.72 + intro * 0.28);

    // Compose: worldTilt ∘ base ∘ heading. headingQ rotates around the
    // plane's local +Z (= surface normal after baseQ); baseQ aligns the
    // plane to the local sphere tangent frame; worldTilt then leans the
    // whole thing toward the camera in world space.
    _headingScratch.setFromAxisAngle(_zAxis, heelRef.current);
    groupRef.current.quaternion
      .copy(worldTiltQuaternion)
      .multiply(baseQuaternion)
      .multiply(_headingScratch);

    // Inner: small idle sway + tactile shake on collision (deck roll).
    // Pitch.x rears the bow up on impact; envelope (c² rather than c) so the
    // pitch lift only registers on hard hits and decays faster than the roll.
    const sway = Math.sin(t * 1.3) * 0.025;
    const c = collisionRef.current;
    const collisionShake = c * Math.sin(t * 28) * 0.18;
    innerRef.current.rotation.x = c * c * 0.18;
    innerRef.current.rotation.z = sway + collisionShake;

    if (matRef.current) {
      const day = dayRef.current;
      // Keep tint in [0,1] so the texture isn't washed into a bloom halo.
      const warmth = THREE.MathUtils.clamp(0.6 + day.sunIntensity * 0.22, 0.5, 0.95);
      matRef.current.color.setRGB(
        Math.min(1, warmth + day.sunColor.r * 0.04),
        Math.min(1, warmth + day.sunColor.g * 0.03),
        Math.min(1, warmth * 0.95 + day.sunColor.b * 0.03)
      );
      matRef.current.opacity = introFade;
    }
    if (shadowMatRef.current) shadowMatRef.current.opacity = 0.42 * introFade;
    if (wakeMatRef.current) {
      const introWake = Math.sin(clamp01((introRef.current - 0.72) / 0.74) * Math.PI);
      const movementWake = THREE.MathUtils.clamp(speedRef.current * 0.42, 0, 0.32);
      const wakeOpacity = Math.max(introWake * 0.42, movementWake);
      wakeMatRef.current.opacity = wakeOpacity;
    }

  });

  return (
    <group ref={groupRef} renderOrder={10}>
      {/* Cast shadow: same silhouette, tinted black, slightly larger and
          offset in the tangent plane to fake a low sun. Sits outside
          innerRef so the deck-sway/collision shake doesn't drag the
          shadow with it — the ship rocks against a stable shadow. */}
      <mesh renderOrder={9} position={[0.012, -0.012, -0.002]} scale={1.08}>
        <planeGeometry args={[0.18, 0.18]} />
        <meshBasicMaterial
          ref={shadowMatRef}
          map={texture}
          color="#000000"
          transparent
          opacity={0}
          depthWrite={false}
          depthTest={false}
          toneMapped={false}
        />
      </mesh>
      <mesh renderOrder={10} position={[0, -0.065, -0.001]} scale={[1.25, 0.78, 1]}>
        <planeGeometry args={[0.26, 0.18]} />
        <meshBasicMaterial
          ref={wakeMatRef}
          map={wakeTexture}
          color="#d8f2ff"
          transparent
          opacity={0}
          depthWrite={false}
          depthTest={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
      <group ref={innerRef}>
        {/* The ship sprite — about tree-sized */}
        <mesh renderOrder={11}>
          <planeGeometry args={[0.18, 0.18]} />
          <meshBasicMaterial
            ref={matRef}
            map={texture}
            transparent
            depthWrite={false}
            depthTest={false}
            toneMapped
          />
        </mesh>
      </group>
    </group>
  );
}

// ─── sun + moon billboards ──────────────────────────────────────────────────
//
// Two camera-facing sprites positioned along ±dayRef.sunDir at a fixed
// distance. The sun fades in with day.sunIntensity, the moon fades in as
// it falls. Default depthTest=true so the globe occludes whichever body
// is on the far side. Drop-in: <SunMoonBillboards dayRef={dayRef} />.

function createSunDiskTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0.00, 'rgba(255, 248, 220, 1.00)');
  g.addColorStop(0.10, 'rgba(255, 230, 170, 0.95)');
  g.addColorStop(0.28, 'rgba(255, 180, 100, 0.55)');
  g.addColorStop(0.55, 'rgba(255, 130,  60, 0.18)');
  g.addColorStop(1.00, 'rgba(255, 110,  40, 0.00)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createMoonDiskTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const ctx = c.getContext('2d')!;
  // Soft halo behind the disk.
  const halo = ctx.createRadialGradient(128, 128, 40, 128, 128, 128);
  halo.addColorStop(0, 'rgba(225, 230, 240, 0.18)');
  halo.addColorStop(1, 'rgba(225, 230, 240, 0.00)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, 256, 256);
  // Disk itself — slightly off-white with a faint terminator on one side.
  const disk = ctx.createRadialGradient(118, 118, 4, 128, 128, 56);
  disk.addColorStop(0.00, 'rgba(252, 248, 238, 1.00)');
  disk.addColorStop(0.65, 'rgba(225, 220, 210, 0.95)');
  disk.addColorStop(1.00, 'rgba(180, 178, 170, 0.00)');
  ctx.fillStyle = disk;
  ctx.beginPath();
  ctx.arc(128, 128, 56, 0, Math.PI * 2);
  ctx.fill();
  // A couple of faint mare blots for character. Tiny cost; reads at
  // distance only as subtle shading rather than craters.
  ctx.fillStyle = 'rgba(170, 170, 165, 0.18)';
  ctx.beginPath(); ctx.arc(140, 132, 10, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(118, 142, 7,  0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(135, 118, 5,  0, Math.PI * 2); ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function SunMoonBillboards({ dayRef }: { dayRef: React.MutableRefObject<DayState> }) {
  const sunRef = useRef<THREE.Sprite>(null);
  const moonRef = useRef<THREE.Sprite>(null);
  const sunMatRef = useRef<THREE.SpriteMaterial>(null);
  const moonMatRef = useRef<THREE.SpriteMaterial>(null);

  const sunTex = useMemo(() => createSunDiskTexture(), []);
  const moonTex = useMemo(() => createMoonDiskTexture(), []);

  // Distance from origin to billboard. Camera sits at z≈6.4 (12 on mobile)
  // and the globe radius is 1.42, so 5.0 places the disks well past the
  // near hemisphere but close enough that perspective foreshortening
  // doesn't shrink them to nothing.
  const DISTANCE = 5.0;

  useFrame(() => {
    const day = dayRef.current;
    if (sunRef.current) {
      sunRef.current.position.copy(day.sunDir).multiplyScalar(DISTANCE);
    }
    if (moonRef.current) {
      moonRef.current.position.copy(day.sunDir).multiplyScalar(-DISTANCE);
    }
    const sunOpacity  = THREE.MathUtils.clamp(day.sunIntensity * 1.05, 0, 1);
    const moonOpacity = THREE.MathUtils.clamp((1 - day.sunIntensity) * 0.95, 0, 0.9);
    if (sunMatRef.current)  sunMatRef.current.opacity  = sunOpacity;
    if (moonMatRef.current) moonMatRef.current.opacity = moonOpacity;
  });

  return (
    <>
      <sprite ref={sunRef} scale={[0.85, 0.85, 1]} renderOrder={4}>
        <spriteMaterial
          ref={sunMatRef}
          map={sunTex}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </sprite>
      <sprite ref={moonRef} scale={[0.55, 0.55, 1]} renderOrder={4}>
        <spriteMaterial
          ref={moonMatRef}
          map={moonTex}
          transparent
          depthWrite={false}
          toneMapped={false}
        />
      </sprite>
    </>
  );
}

// ─── camera animation (lights now provided by SkyLights) ────────────────────

function CameraDrift({ isMobile, introRef }: { isMobile: boolean; introRef: IntroProgressRef }) {
  const { camera, gl } = useThree();
  // Zoom = uniform scale of the camera offset from target. 1.0 = base
  // framing; smaller pulls in, larger pulls back. Smoothed toward
  // zoomTargetRef so trackpad scrolls feel kinetic, not snappy.
  const zoomRef = useRef(1.0);
  const zoomTargetRef = useRef(1.0);
  const TARGET = useMemo(() => new THREE.Vector3(0, 0.1, 0), []);
  // Mobile pulls the camera back so the globe doesn't dominate the screen
  // — ~2× the Z distance halves the apparent size, leaving room for the
  // title and the bottom button dock to breathe.
  const BASE_OFFSET = useMemo(
    () => isMobile
      ? new THREE.Vector3(0, 0.40, 12.0)
      : new THREE.Vector3(0, 0.40, 6.4),
    [isMobile]
  );

  useEffect(() => {
    camera.position.copy(BASE_OFFSET).add(TARGET);
    camera.lookAt(TARGET);

    const el = gl.domElement;
    const onWheel = (e: WheelEvent) => {
      // Negative deltaY = scroll up / pinch out = zoom in.
      const factor = Math.exp(e.deltaY * 0.0014);
      zoomTargetRef.current = THREE.MathUtils.clamp(
        zoomTargetRef.current * factor,
        0.45,
        1.9
      );
      e.preventDefault();
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [camera, gl, TARGET, BASE_OFFSET]);

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    introRef.current = Math.min(INTRO_CAMERA_DURATION, t);
    const intro = easeOutCubic(t / INTRO_CAMERA_DURATION);
    // Ease zoom toward target — fast enough to feel responsive, slow
    // enough that one trackpad flick reads as a smooth glide.
    zoomRef.current += (zoomTargetRef.current - zoomRef.current) * Math.min(1, dt * 8);
    const zoom = zoomRef.current;

    const driftX = Math.sin(t * 0.07) * 0.14;
    const driftY = Math.sin(t * 0.05) * 0.5;
    const introZoom = 1.72 - intro * 0.72;
    const introY = (1 - intro) * -0.38;
    camera.position.set(
      (BASE_OFFSET.x + driftX) * zoom * introZoom + TARGET.x,
      (BASE_OFFSET.y + driftY + introY) * zoom + TARGET.y,
      BASE_OFFSET.z * zoom * introZoom + TARGET.z
    );
    camera.lookAt(TARGET);
  });
  return null;
}

// ─── controls ────────────────────────────────────────────────────────────────

function useGlobeControls(onEnter: () => void) {
  const keys = useRef({ w: false, a: false, s: false, d: false, shift: false });
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === 'w' || e.key === 'ArrowUp') keys.current.w = true;
      else if (k === 's' || e.key === 'ArrowDown') keys.current.s = true;
      else if (k === 'a' || e.key === 'ArrowLeft') keys.current.a = true;
      else if (k === 'd' || e.key === 'ArrowRight') keys.current.d = true;
      else if (k === 'shift') keys.current.shift = true;
      else if (k === 'enter' || k === ' ') onEnter();
    };
    const up = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === 'w' || e.key === 'ArrowUp') keys.current.w = false;
      else if (k === 's' || e.key === 'ArrowDown') keys.current.s = false;
      else if (k === 'a' || e.key === 'ArrowLeft') keys.current.a = false;
      else if (k === 'd' || e.key === 'ArrowRight') keys.current.d = false;
      else if (k === 'shift') keys.current.shift = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [onEnter]);
  return keys;
}

function GlobeDriver({
  rotationRef, heelRef, speedRef, collisionRef, dayRef, keys,
}: {
  rotationRef: React.MutableRefObject<THREE.Quaternion>;
  heelRef: React.MutableRefObject<number>;
  speedRef: React.MutableRefObject<number>;
  collisionRef: React.MutableRefObject<number>;
  dayRef: React.MutableRefObject<DayState>;
  keys: React.MutableRefObject<{ w: boolean; a: boolean; s: boolean; d: boolean; shift: boolean }>;
}) {
  const dayPhase = useRef(0.20);
  // Forward velocity along the bow tangent. Carries inertia so the ship
  // accelerates / coasts / recoils instead of moving as a binary key state.
  // Reflected to negative on coast strikes; see the collision branch below.
  const fwdVelRef = useRef(0);
  // Reusable scratch quats/vecs so the per-frame loop allocates nothing.
  const _bow = useMemo(() => new THREE.Vector3(), []);
  const _axis = useMemo(() => new THREE.Vector3(), []);
  const _forwardQ = useMemo(() => new THREE.Quaternion(), []);
  const _driftQ = useMemo(() => new THREE.Quaternion(), []);
  const _stepQ = useMemo(() => new THREE.Quaternion(), []);
  const _candidate = useMemo(() => new THREE.Quaternion(), []);

  useFrame((_, dt) => {
    const k = keys.current;
    const boost = k.shift ? 1.7 : 1;

    // Heading model: heelRef = ship's bow direction in screen space, in
    // radians CCW from "up". A/D only turn the wheel — they do NOT rotate
    // the globe. W/S sail the ship along the bow tangent, which is
    // converted to a world-frame quaternion increment so the ship can
    // freely circumnavigate (no Euler poles, no clamps).
    const TURN_RATE = 1.6;
    if (k.a) heelRef.current += TURN_RATE * dt * boost;
    if (k.d) heelRef.current -= TURN_RATE * dt * boost;

    // Velocity-based forward motion. Target follows W/S input; velocity
    // smooths toward it (accel when input, damp when idle). While the ship
    // is recoiling from a coast strike — collisionRef still high — forward
    // input is suppressed so the player can't mash W back into land. S and
    // turn keys still respond.
    const ACCEL = 3.0;
    const DAMP  = 1.6;
    const recoilLockout = collisionRef.current > 0.15;
    let target = (k.w ? 1 : 0) + (k.s ? -0.55 : 0);
    if (recoilLockout && target > 0) target = 0;
    const blendRate = target !== 0 ? ACCEL : DAMP;
    fwdVelRef.current += (target - fwdVelRef.current) * Math.min(1, dt * blendRate);

    const forward = fwdVelRef.current;
    const anyKey = k.a || k.d || k.w || k.s;
    const SPEED = 0.7;

    // Forward step: bow tangent in world space, rotated by heelRef around
    // the surface normal. Rotation axis = bow × normal so positive forward
    // pulls the world-point ahead of the ship onto SHIP_ANCHOR (i.e. the
    // ship "moves" along the bow direction over the spherical surface).
    _forwardQ.identity();
    if (Math.abs(forward) > 1e-4) {
      _bow.copy(SHIP_TANGENT_NORTH).applyAxisAngle(SHIP_NORMAL, heelRef.current);
      _axis.copy(_bow).cross(SHIP_NORMAL).normalize();
      _forwardQ.setFromAxisAngle(_axis, forward * SPEED * dt * boost);
    }

    // Idle ambient drift: small Y-axis spin only when no input, so the
    // controls never fight a baseline rotation.
    _driftQ.identity();
    if (!anyKey) _driftQ.setFromAxisAngle(WORLD_Y, 0.025 * dt);

    // World-frame increment (drift after forward) pre-multiplied onto the
    // current orientation: Q' = drift · forward · Q.
    _stepQ.multiplyQuaternions(_driftQ, _forwardQ);
    _candidate.multiplyQuaternions(_stepQ, rotationRef.current);

    if (isClearForQuat(_candidate)) {
      rotationRef.current.copy(_candidate);
    } else {
      // Forward blocked by a continent. Try drift-only so the view doesn't
      // lock up entirely.
      _candidate.multiplyQuaternions(_driftQ, rotationRef.current);
      const driftClear = isClearForQuat(_candidate);
      if (driftClear) rotationRef.current.copy(_candidate);

      // Bounce: reflect any forward-going velocity into a backward kick so
      // the ship visibly recoils off the coast instead of dead-stopping.
      // Skip if velocity is already negative — we're mid-recoil and the
      // bounce should decay naturally rather than re-firing each frame.
      if (fwdVelRef.current > 0) {
        const ELASTICITY = 0.55;
        const MIN_KICK = 0.18;
        fwdVelRef.current = -Math.max(fwdVelRef.current * ELASTICITY, MIN_KICK);
        // Lateral heel impulse so the bow visibly veers off the obstacle.
        heelRef.current += (Math.random() < 0.5 ? -1 : 1) * 0.22;
        collisionRef.current = 1;
      } else if (!driftClear) {
        // Idle drift wedged against a coast (no forward input, and drift
        // alone can't clear). Without this branch the ship grinds the
        // shoreline forever — visible on mobile where there are no keys to
        // back it off. Apply a small reverse nudge + heel impulse so it
        // un-sticks and resumes drifting in open water.
        fwdVelRef.current = -0.3;
        heelRef.current += (Math.random() < 0.5 ? -1 : 1) * 0.18;
        collisionRef.current = 1;
      } else {
        collisionRef.current = Math.min(1, collisionRef.current + 0.5);
      }
    }

    // Speed proxy for wake/visual intensity — driven by translation, not turn.
    const inputMag = Math.abs(forward) + (k.a || k.d ? 0.25 : 0);
    speedRef.current += (inputMag * boost - speedRef.current) * Math.min(1, dt * 3);

    collisionRef.current = Math.max(0, collisionRef.current - dt * 1.6);

    // Day phase cycle (120s, 4× under Shift). The DAY_KEYS palette carries
    // a held deep-night plateau between p=0.84 and p=0.94; combined with
    // this length that's ~12s of unchanging darkness, giving night a
    // proper "rest" before the slow ember rise back to dawn.
    dayPhase.current = (dayPhase.current + dt / 120 * (k.shift ? 4 : 1)) % 1;
    sampleDayPalette(dayPhase.current, dayRef.current);
  });
  return null;
}

// ─── overlay UI ──────────────────────────────────────────────────────────────

// Faction icons — extracted from /icons/faction icons.png into transparent
// PNGs in /icons/factions/. Cycle order is curated (not array order) so
// clicks advance through nationalities geographically, with the Random and
// Pirate "wildcard" picks anchoring the end of the rotation.
type FactionKey =
  | 'english' | 'dutch' | 'portuguese' | 'spanish' | 'venetian'
  | 'omani' | 'gujarati' | 'chinese'
  | 'random' | 'pirate';

// Faction key 'omani' is kept (matches the game's Nationality 'Omani' and the
// existing icon file omani.png), but surfaces as "Arab" to the player.
const FACTIONS: { key: FactionKey; label: string }[] = [
  { key: 'english',    label: 'English' },
  { key: 'dutch',      label: 'Dutch' },
  { key: 'portuguese', label: 'Portuguese' },
  { key: 'spanish',    label: 'Spanish' },
  { key: 'venetian',   label: 'Venetian' },
  { key: 'omani',      label: 'Arab' },
  { key: 'gujarati',   label: 'Gujarati' },
  { key: 'chinese',    label: 'Chinese' },
  { key: 'random',     label: 'Random' },
  { key: 'pirate',     label: 'Pirate' },
];

// Faction keys whose icon PNG lives in /icons/factions/. Drop the new icon in
// and add the key here to swap it from the random.png placeholder.
const FACTION_ICON_AVAILABLE = new Set<FactionKey>([
  'english', 'dutch', 'portuguese', 'spanish', 'venetian',
  'omani', 'gujarati', 'chinese',
  'random', 'pirate',
]);

function factionIconUrl(key: FactionKey) {
  return FACTION_ICON_AVAILABLE.has(key)
    ? `/icons/factions/${key}.png`
    : `/icons/factions/random.png`;
}

// Top-down ship sprites per faction. Stubs (blank 512×512 transparent PNGs)
// live at /icons/factions/ships/<key>.png so paths exist; the canvas-drawn
// ship in createShipTexture() is the visual fallback. Once a real PNG is
// dropped in, add the key to FACTION_SHIP_SPRITE_AVAILABLE to switch the
// globe over to the painted sprite.
const FACTION_SHIP_SPRITE_AVAILABLE = new Set<FactionKey>([
  'english', 'dutch', 'portuguese', 'spanish', 'venetian',
  'omani', 'gujarati', 'chinese', 'random', 'pirate',
]);

function factionShipUrl(key: FactionKey) {
  return `/icons/factions/ships/${key}.png`;
}

// Difficulty / play modes. Icons live in /icons/gameplay/{key}.png — drop a
// new PNG in and add an entry to wire up another mode.
type DifficultyKey = 'easy' | 'educational' | 'hard';
const DIFFICULTIES: { key: DifficultyKey; label: string }[] = [
  { key: 'easy',        label: 'Easy' },
  { key: 'educational', label: 'Educational' },
  { key: 'hard',        label: 'Hard' },
];

function difficultyIconUrl(key: DifficultyKey) {
  return `/icons/gameplay/${key}.png`;
}

// Start-port catalogue. Labels + period-flavor descriptions exist for every
// port any playable faction can spawn at. Icons are drop-in: save a
// transparent PNG to /icons/ports/{id}.png and add the id to
// PORT_ICON_AVAILABLE; the splash falls back to random.png for ports without
// a custom icon yet, so the cycle is always faithful to the spawn data.
const PORT_ICON_AVAILABLE = new Set<string>([
  'london', 'amsterdam', 'lisbon',
  'seville', 'havana', 'aden',
  'mocha', 'goa', 'macau',
  'surat',
]);

const PORT_LABELS: Record<string, string> = {
  london:    'London',
  amsterdam: 'Amsterdam',
  lisbon:    'Lisbon',
  seville:   'Seville',
  venice:    'Venice',
  havana:    'Havana',
  cartagena: 'Cartagena',
  jamestown: 'Jamestown',
  salvador:  'Salvador',
  luanda:    'Luanda',
  cape:      'Cape',
  mombasa:   'Mombasa',
  zanzibar:  'Zanzibar',
  socotra:   'Socotra',
  aden:      'Aden',
  mocha:     'Mocha',
  hormuz:    'Hormuz',
  muscat:    'Muscat',
  surat:     'Surat',
  goa:       'Goa',
  calicut:   'Calicut',
  malacca:   'Malacca',
  bantam:    'Bantam',
  manila:    'Manila',
  macau:     'Macau',
};

// One-sentence period-flavor blurb per port. Surfaced as a hover tooltip
// over the Start Port card — keeps the splash faithful to the historical
// frame without burying the player in detail.
const PORT_DESCRIPTIONS: Record<string, string> = {
  london:    'Metropole of Tudor England. The Royal Exchange and the East India Company on Leadenhall Street.',
  amsterdam: 'Heart of the Dutch Republic and the VOC, founded 1602 — the world\'s first stock exchange.',
  lisbon:    'Capital of the Portuguese Estado da Índia. The Casa da Índia oversees the Carreira spice fleets.',
  seville:   'Spanish metropole. The Casa de Contratación monopolises trade with the Indies.',
  venice:    'Most Serene Republic. Levantine pepper still arrives by caravan even as the Cape route reroutes Asia.',
  havana:    'Caribbean treasure-fleet base. Galleons rendezvous here for the Atlantic crossing each summer.',
  cartagena: 'Spanish fortified port on the Tierra Firme coast — silver from Potosí passes through.',
  jamestown: 'Virginia Company colony, ~300 settlers in 1612. Tobacco cultivation begins this year.',
  salvador:  'Capital of Portuguese Brazil — sugar engenhos and the Atlantic slave trade.',
  luanda:    'São Paulo de Luanda — Portuguese slaving entrepôt to Brazil and the Caribbean.',
  cape:      'Cape of Good Hope. No permanent settlement; ships water and salt cured meat here.',
  mombasa:   'Portuguese Fort Jesus (completed 1596) on the Swahili coast. Disputed with Omani Arabs.',
  zanzibar:  'Swahili port within the Omani-Portuguese dhow network.',
  socotra:   'Yemeni island in the western Indian Ocean — frankincense, myrrh, and dragon\'s-blood resin.',
  aden:      'Ottoman port at the mouth of the Red Sea — coffee and pepper traffic toward Cairo.',
  mocha:     'Yemeni port through which all Red Sea coffee passes. Arab and Indian merchants dominate.',
  hormuz:    'Portuguese-held island at the Persian Gulf gateway — silks, pearls, and Persian horses.',
  muscat:    'Omani port on the Arabian Sea — base of the Indian Ocean dhow trade.',
  surat:     'Mughal port on the Gujarat coast. The English open their first Indian factory here in 1612.',
  goa:       'Portuguese viceregal capital of the Estado da Índia. Cathedrals and the Inquisition.',
  calicut:   'Malabar coast port. The Zamorin kingdom; trade run by Gujarati and Mappila merchants.',
  malacca:   'Portuguese fortress on the Strait — chokepoint of the Spice Route since 1511.',
  bantam:    'Pepper port on Java; VOC headquarters in Asia, 1610–1619.',
  manila:    'Spanish capital of the Philippines. The Acapulco galleon and ~30,000 Chinese in the Sangley Parián.',
  macau:     'Luso-Chinese trade hub on the South China coast — the Macau-Nagasaki silver run.',
};

function portIconUrl(id: string) {
  return PORT_ICON_AVAILABLE.has(id)
    ? `/icons/ports/${id}.png`
    : '/icons/factions/random.png';
}

// Map splash faction keys → game's Nationality (or null = "any").
const FACTION_KEY_TO_NATIONALITY: Record<FactionKey, Nationality | null> = {
  english: 'English',
  dutch: 'Dutch',
  portuguese: 'Portuguese',
  spanish: 'Spanish',
  venetian: 'Venetian',
  omani: 'Omani',          // surfaced as "Arab" in the UI
  gujarati: 'Gujarati',
  chinese: 'Chinese',
  random: null,            // any port
  pirate: 'Pirate',
};

/** Ordered list of port IDs available to a faction, weight-descending. We
 *  return ALL spawn ports (icon or no icon) so the cycle is faithful to the
 *  spawn data — ports without icons fall back to random.png visually until
 *  their /icons/ports/{id}.png is added. */
function portsForFaction(factionKey: FactionKey): string[] {
  const nationality = FACTION_KEY_TO_NATIONALITY[factionKey];
  if (nationality) {
    const weights = FACTION_SPAWN_WEIGHTS[nationality];
    if (weights && weights.length) {
      return [...weights]
        .sort((a, b) => b.weight - a.weight)
        .map((w) => w.portId);
    }
  }
  // Fallback for factions without spawn weights (Random / Pirate / Gujarati
  // until added): the union of every port mentioned anywhere in the table.
  const union = new Set<string>();
  for (const list of Object.values(FACTION_SPAWN_WEIGHTS)) {
    if (!list) continue;
    for (const row of list) union.add(row.portId);
  }
  return Array.from(union);
}

const TICKER_LINES = [
  '1612 — Dutch fleet rounds the Cape of Good Hope',
  'Spice prices rise in Aceh',
  'Portuguese padrão raised at Mombasa',
  'A galleon out of Goa carries cinnamon and pearls',
  'Aden harbour fills with Gujarati dhows',
  'Surat reports a fair monsoon and full warehouses',
];

const SPICE_ASCII = `╔═╗  ╔═╗  ╦  ╔═╗  ╔═╗
╚═╗  ╠═╝  ║  ║    ╠═ 
╚═╝  ╩    ╩  ╚═╝  ╚═╝`;

function AnimatedSpiceAscii() {
  return (
    <>
      {SPICE_ASCII.split('\n').map((line, lineIndex) => (
        <Fragment key={lineIndex}>
          {line.split('').map((char, charIndex) => {
            const key = `${lineIndex}-${charIndex}`;
            if (char === ' ') return <span key={key}> </span>;
            const delay = ((lineIndex * 7 + charIndex) % 16) * 0.13;
            return (
              <motion.span
                key={key}
                animate={{
                  color: ['#c9a84c', '#efd27a', '#c9a84c'],
                  textShadow: [
                    '0 0 14px rgba(201,168,76,0.45)',
                    '0 0 18px rgba(239,210,122,0.58)',
                    '0 0 14px rgba(201,168,76,0.45)',
                  ],
                }}
                transition={{
                  duration: 2.4,
                  ease: 'easeInOut',
                  repeat: Infinity,
                  repeatDelay: 3.6,
                  delay,
                }}
              >
                {char}
              </motion.span>
            );
          })}
          {lineIndex < 2 && '\n'}
        </Fragment>
      ))}
    </>
  );
}

function Ticker() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((x) => (x + 1) % TICKER_LINES.length), 4200);
    return () => clearInterval(id);
  }, []);
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 22,
        left: 0,
        right: 0,
        textAlign: 'center',
        fontFamily: SUBTITLE_FN,
        fontStyle: 'italic',
        fontSize: 14,
        color: 'rgba(255, 248, 232, 0.88)',
        letterSpacing: '0.02em',
        pointerEvents: 'none',
        textShadow: '0 1px 3px rgba(0,0,0,0.68), 0 0 8px rgba(0,0,0,0.28)',
      }}
    >
      <motion.div
        key={i}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.6 }}
        style={{
          display: 'inline-block',
          padding: '5px 28px 6px',
          background: 'radial-gradient(ellipse at center, rgba(6,4,2,0.22) 0%, rgba(6,4,2,0.14) 45%, rgba(6,4,2,0) 78%)',
        }}
      >
        {TICKER_LINES[i]}
      </motion.div>
    </div>
  );
}

function ChoiceCard({
  caption,
  label,
  iconUrl,
  iconText,
  hint,
  description,
  disabled,
  compact,
  onClick,
}: {
  caption: string;          // mono uppercase tag above (e.g. "FACTION")
  label: string;            // main label below the icon
  iconUrl?: string;         // optional image src for the icon
  iconText?: string;        // alt: emoji / glyph centered in the icon slot
  hint?: string;            // optional micro hint shown when no value yet
  description?: string;     // styled hover tooltip (period-flavor blurb)
  disabled?: boolean;
  compact?: boolean;        // mobile: tighter footprint
  onClick?: () => void;
}) {
  const [hover, setHover] = useState(false);
  const cardW = compact ? 100 : 138;
  const cardH = compact ? 132 : 168;
  const iconSz = compact ? 64 : 96;
  const labelSz = compact ? 15 : 19;
  return (
    <motion.button
      variants={{
        hidden: { opacity: 0, y: 10 },
        show: { opacity: 1, y: 0 },
      }}
      transition={{ duration: 0.38, ease: 'easeOut' }}
      onClick={() => { if (!disabled) { sfxClick(); onClick?.(); } }}
      disabled={disabled}
      title={description ? undefined : hint}
      onMouseEnter={(e) => {
        setHover(true);
        if (!disabled) {
          sfxHover();
          e.currentTarget.style.transform = 'translateY(-2px)';
        }
      }}
      onMouseLeave={(e) => {
        setHover(false);
        e.currentTarget.style.transform = 'translateY(0)';
      }}
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: cardW,
        height: cardH,
        padding: compact ? '10px 8px 12px' : '12px 10px 14px',
        borderRadius: 14,
        background: 'rgba(252, 246, 230, 0.10)',
        border: '1px solid rgba(252,246,230,0.28)',
        boxShadow: '0 8px 22px rgba(20,10,5,0.36), inset 0 1px 0 rgba(255,255,255,0.06)',
        cursor: disabled ? 'default' : 'pointer',
        transition: 'transform 140ms ease, background 200ms ease, border-color 200ms ease',
        fontFamily: CARD_LABEL_FONT,
        color: '#fbf4e6',
        backdropFilter: 'blur(10px)',
        opacity: disabled ? 0.72 : 1,
      }}
    >
      {/* Caption */}
      <div style={{
        fontFamily: MONO,
        fontSize: 9.5,
        opacity: 0.55,
        letterSpacing: '0.24em',
        textTransform: 'uppercase',
      }}>{caption}</div>
      {/* Icon slot — bigger so the painted ships actually read */}
      <div style={{
        width: iconSz,
        height: iconSz,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 2,
      }}>
        {iconUrl ? (
          <img
            src={iconUrl}
            alt={label}
            draggable={false}
            style={{
              width: iconSz,
              height: iconSz,
              objectFit: 'contain',
              filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.55))',
              imageRendering: 'auto',
            }}
          />
        ) : (
          <div style={{
            width: iconSz * 0.83,
            height: iconSz * 0.83,
            borderRadius: 12,
            border: '1px dashed rgba(252,246,230,0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: SUBTITLE_FN,
            fontSize: iconSz * 0.33,
            color: 'rgba(252,246,230,0.55)',
          }}>
            {iconText ?? '?'}
          </div>
        )}
      </div>
      {/* Label — elegant serif, sentence-case for warmth */}
      <div style={{
        fontFamily: CARD_LABEL_FONT,
        fontWeight: 700,
        fontSize: labelSz,
        letterSpacing: '0.005em',
        lineHeight: 1.05,
        marginTop: 4,
      }}>{label}</div>
      {/* Hover tooltip — period-flavor blurb. Sits above the card. */}
      {description && hover && (
        <div
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 12px)',
            left: '50%',
            transform: 'translateX(-50%)',
            width: 280,
            padding: '10px 14px',
            borderRadius: 8,
            background: 'rgba(8, 6, 3, 0.94)',
            border: '1px solid rgba(201,168,76,0.38)',
            boxShadow: '0 10px 30px rgba(0,0,0,0.55), 0 0 16px rgba(201,168,76,0.12) inset',
            color: '#f5ecd6',
            fontFamily: CARD_LABEL_FONT,
            fontStyle: 'italic',
            fontSize: 13.5,
            fontWeight: 500,
            lineHeight: 1.42,
            letterSpacing: '0.01em',
            textAlign: 'left',
            pointerEvents: 'none',
            zIndex: 50,
            whiteSpace: 'normal',
          }}
        >
          {description}
          {/* Caret */}
          <div style={{
            position: 'absolute',
            top: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            width: 0,
            height: 0,
            borderLeft: '6px solid transparent',
            borderRight: '6px solid transparent',
            borderTop: '7px solid rgba(8,6,3,0.94)',
          }}/>
        </div>
      )}
    </motion.button>
  );
}

// ─── main exported component ─────────────────────────────────────────────────

export function ClaudeSplashGlobe(props: Props) {
  const { ready, loadingMessage, loadingProgress, onStart } = props;
  const { isMobile } = useIsMobile();

  useEffect(() => { injectFonts(); }, []);

  // Audio: browsers gate autoplay behind a user gesture, so we wait for the
  // first click/keydown/pointerdown before booting the waves bed. The intro
  // music itself is held back until the player commits via Set Sail / Enter
  // (handled in handleEnter below).
  const audioStarted = useRef(false);
  useEffect(() => {
    const tryStart = () => {
      if (audioStarted.current) return;
      audioStarted.current = true;
      ambientEngine.markInteracted();
      ambientEngine.playSplashAmbient();
      window.removeEventListener('click', tryStart, true);
      window.removeEventListener('keydown', tryStart, true);
      window.removeEventListener('pointerdown', tryStart, true);
    };
    window.addEventListener('click', tryStart, true);
    window.addEventListener('keydown', tryStart, true);
    window.addEventListener('pointerdown', tryStart, true);
    return () => {
      window.removeEventListener('click', tryStart, true);
      window.removeEventListener('keydown', tryStart, true);
      window.removeEventListener('pointerdown', tryStart, true);
    };
  }, []);

  // Faction starts at a random slot; clicks march through the curated cycle.
  const [factionIdx, setFactionIdx] = useState<number>(
    () => Math.floor(Math.random() * FACTIONS.length)
  );
  const [diffIdx, setDiffIdx] = useState(0);     // 0 = "Easy"
  const cycleFaction = () => setFactionIdx((i) => (i + 1) % FACTIONS.length);
  const cycleDiff    = () => setDiffIdx((i) => (i + 1) % DIFFICULTIES.length);
  const faction = FACTIONS[factionIdx];
  const difficulty = DIFFICULTIES[diffIdx];

  // Start port is gated by current faction. The cycle is ['random', ...gated].
  // When the faction changes, reset the port slot back to Random so we never
  // display a port the new faction can't actually spawn at.
  // No "Random" option — the cycle is real ports in weight-descending order
  // (English starts on London, Venetian on Venice, etc.). Click to advance.
  const portOptions = useMemo(() => portsForFaction(faction.key), [faction.key]);
  const [portIdx, setPortIdx] = useState(0);
  useEffect(() => { setPortIdx(0); }, [faction.key]);
  const cyclePort = () => setPortIdx((i) => (i + 1) % Math.max(1, portOptions.length));
  const startPortId = portOptions[Math.min(portIdx, portOptions.length - 1)] ?? '';
  const startPortLabel = PORT_LABELS[startPortId] ?? startPortId;
  const startPortIconUrl = portIconUrl(startPortId);
  const startPortDescription = PORT_DESCRIPTIONS[startPortId];
  const startNewGame = useGameStore((state) => state.startNewGame);
  const rotationRef = useRef(new THREE.Quaternion());
  const heelRef = useRef(0);
  const speedRef = useRef(0);
  const collisionRef = useRef(0);
  const introRef = useRef(0);
  const dayRef = useRef<DayState>(makeDayState());
  // Initialize palette once before first frame so things don't render gray.
  useMemo(() => sampleDayPalette(0.20, dayRef.current), []);

  const handleEnter = () => {
    if (!ready) return;
    const selectedFaction = FACTION_KEY_TO_NATIONALITY[faction.key];
    if (selectedFaction && startPortId) {
      startNewGame({ faction: selectedFaction, portId: startPortId });
    }
    // Intro music kicks in on commit, layering over the existing waves bed.
    // transitionToOverworld() (called later from UI.tsx after the commission
    // modal closes) will fade both tracks out and start the overworld rotation.
    audioManager.playSplash();
    onStart();
  };
  const keys = useGlobeControls(handleEnter);

  // Settings + About modal — matches Opening.tsx convention; About just opens
  // the same modal pre-routed to its 'about' tab.
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('world');
  const openSettings = () => { setSettingsTab('world'); setSettingsOpen(true); };
  const openAbout    = () => { setSettingsTab('about'); setSettingsOpen(true); };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.7 }}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        // 100dvh follows iOS Safari's collapsing toolbars; the fallback covers
        // browsers without dynamic-viewport support.
        height: '100dvh',
        minHeight: '100vh',
        zIndex: 60,
        overflow: 'hidden',
        pointerEvents: 'auto',
        background: '#04050a',
      }}
    >
      <div style={{ position: 'absolute', inset: 0 }}>
        <Canvas
          camera={{ fov: 28, position: [0, 0.4, 6.4] }}
          dpr={isMobile ? [1, 1.5] : [1, 2]}
          gl={{ antialias: true, alpha: false, toneMapping: THREE.ACESFilmicToneMapping }}
        >
          <CameraDrift isMobile={isMobile} introRef={introRef} />
          {/* Day/night-driven sky gradient + lights + stars. Sun and
              CrepuscularRays remain omitted for a cleaner read. */}
          <SkyDome dayRef={dayRef} />
          <SkyLights dayRef={dayRef} />
          <NightStars dayRef={dayRef} />
          <ShootingStars dayRef={dayRef} />

          <GlobeDriver
            rotationRef={rotationRef}
            heelRef={heelRef}
            speedRef={speedRef}
            collisionRef={collisionRef}
            dayRef={dayRef}
            keys={keys}
          />
          <Globe rotationRef={rotationRef} dayRef={dayRef} introRef={introRef} />
          <AtmosphereShell dayRef={dayRef} />
          <GlobeRevealMask introRef={introRef} />
          <SunMoonBillboards dayRef={dayRef} />

          <SkyClouds dayRef={dayRef} tintNight={false} />

          {/* Daytime flock drifting across the back of the sky. Each Bird
              already self-fades on day.sunIntensity, so no extra gating.
              Small sizeScale + slow speedScale keeps them as distant
              silhouettes instead of dominating the scene. */}
          <DistantBirds
            dayRef={dayRef}
            count={9}
            seed={1612}
            sizeScale={0.32}
            speedScale={0.4}
          />

          <ShipSprite
            heelRef={heelRef}
            collisionRef={collisionRef}
            speedRef={speedRef}
            dayRef={dayRef}
            factionKey={faction.key}
            introRef={introRef}
          />

          <EffectComposer multisampling={0}>
            <SMAA />
            <Bloom intensity={0.85} luminanceThreshold={0.55} luminanceSmoothing={0.35} mipmapBlur />
            <Vignette eskil={false} offset={0.18} darkness={0.55} />
          </EffectComposer>
        </Canvas>
      </div>
      <motion.div
        aria-hidden="true"
        initial={{ opacity: 0.94 }}
        animate={{ opacity: 0 }}
        transition={{ duration: 2.15, ease: [0.22, 1, 0.36, 1], delay: 0.04 }}
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background: `
            radial-gradient(circle at 50% 48%, rgba(4,5,10,0.38) 0%, rgba(4,5,10,0.58) 38%, rgba(4,5,10,0.92) 100%),
            #04050a
          `,
        }}
      />

      {/* HTML overlay UI.
          On mobile we let this layer own scrolling (pointerEvents: auto +
          overflowY: auto) so the dock is always reachable when the title
          block + dock combined exceed the iOS visible viewport. Desktop
          keeps the original click-through behaviour (canvas takes drags). */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: isMobile
            ? '20px 12px calc(20px + env(safe-area-inset-bottom))'
            : '52px 24px 92px',
          paddingTop: isMobile
            ? 'calc(20px + env(safe-area-inset-top))'
            : 52,
          gap: isMobile ? 16 : 0,
          pointerEvents: isMobile ? 'auto' : 'none',
          overflowY: isMobile ? 'auto' : 'visible',
          WebkitOverflowScrolling: 'touch',
          overscrollBehavior: 'contain',
        }}
      >
        {/* Title block — ASCII title (matches Opening.tsx) + elegant subtitle */}
        <motion.div
          initial={{ opacity: 0, y: -10, filter: 'blur(3px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ duration: 0.58, ease: [0.22, 1, 0.36, 1], delay: 0.22 }}
          style={{ textAlign: 'center', pointerEvents: 'none' }}
        >
          <motion.div
            initial={{ boxShadow: '0 0 0 1px rgba(201,168,76,0.06) inset, 0 12px 38px rgba(10,5,0,0.34)' }}
            animate={{
              boxShadow: [
                '0 0 0 1px rgba(201,168,76,0.10) inset, 0 12px 38px rgba(10,5,0,0.38), 0 0 12px rgba(201,168,76,0.04) inset',
                '0 0 0 1px rgba(201,168,76,0.18) inset, 0 18px 58px rgba(10,5,0,0.52), 0 0 28px rgba(201,168,76,0.13) inset',
                '0 0 0 1px rgba(201,168,76,0.14) inset, 0 18px 58px rgba(10,5,0,0.52), 0 0 24px rgba(201,168,76,0.08) inset',
              ],
            }}
            transition={{ duration: 0.9, ease: 'easeOut', delay: 0.30 }}
            style={{
              display: 'block',
              width: 'fit-content',
              margin: '0 auto',
              padding: 'clamp(14px, 2.8vw, 24px) clamp(20px, 3.8vw, 36px)',
              background:
                'radial-gradient(ellipse at center, rgba(10,8,4,0.62) 0%, rgba(8,6,3,0.44) 62%, rgba(6,4,2,0.28) 100%)',
              border: '1px solid rgba(201,168,76,0.42)',
              borderRadius: 22,
              position: 'relative',
              backdropFilter: 'blur(2px)',
            }}
          >
            <pre
              style={{
                margin: 0,
                fontFamily: MONO,
                color: '#c9a84c',
                fontSize: 'clamp(11px, 2.6vw, 18px)',
                lineHeight: 1.45,
                letterSpacing: '0.02em',
                textShadow: '0 0 14px rgba(201,168,76,0.45)',
                whiteSpace: 'pre',
              }}
            >
              <AnimatedSpiceAscii />
            </pre>
            <pre
              style={{
                margin: 'clamp(4px, 1vw, 8px) 0',
                fontFamily: MONO,
                color: 'rgba(201,168,76,0.5)',
                fontSize: 'clamp(8px, 1.8vw, 11px)',
                whiteSpace: 'pre',
              }}
            >
              {'─'.repeat(34)}
            </pre>
            <pre
              style={{
                margin: 0,
                fontFamily: MONO,
                color: '#fff4d8',
                fontSize: 'clamp(11px, 2.6vw, 18px)',
                lineHeight: 1.45,
                letterSpacing: '0.02em',
                textShadow: '0 0 18px rgba(255,220,160,0.42)',
                whiteSpace: 'pre',
              }}
            >
{`╦  ╦  ╔═╗  ╦ ╦  ╔═╗  ╔═╗  ╔═╗  ╦═╗
╚╗╔╝  ║ ║  ╚╦╝  ╠═╣  ║ ╦  ╠═   ╠╦╝
 ╚╝   ╚═╝   ╩   ╩ ╩  ╚═╝  ╚═╝  ╩╚═`}
            </pre>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.95, ease: 'easeOut', delay: 1.45 }}
            style={{
              fontFamily: SUBTITLE_FN,
              fontStyle: 'italic',
              fontSize: 'clamp(15px, 1.7vw, 21px)',
              color: 'rgba(255,248,232,0.92)',
              letterSpacing: '0.04em',
              margin: '18px auto 0',
              padding: '6px 28px 7px',
              display: 'block',
              width: 'fit-content',
              background: 'radial-gradient(ellipse at center, rgba(6,4,2,0.24) 0%, rgba(6,4,2,0.15) 46%, rgba(6,4,2,0) 76%)',
              textShadow: '0 1px 3px rgba(0,0,0,0.68), 0 0 8px rgba(0,0,0,0.28)',
              fontWeight: 500,
            }}
          >
            A historical spice and drug trading game set in 1612
          </motion.div>
        </motion.div>

        {/* Bottom dock — picker cards above, wide SET SAIL bar below.
            Stacks the same way on desktop and mobile; only sizing changes. */}
        <motion.div
          initial={{ opacity: 0, y: 22, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 1.05, ease: [0.22, 1, 0.36, 1], delay: 2.05 }}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'stretch',
            gap: isMobile ? 12 : 16,
            padding: isMobile ? '14px 14px 16px' : '20px 24px 22px',
            background: 'rgba(20, 30, 45, 0.32)',
            backdropFilter: 'blur(14px)',
            borderRadius: 22,
            border: '1px solid rgba(255,248,232,0.18)',
            boxShadow: '0 22px 52px rgba(0, 5, 15, 0.5)',
            pointerEvents: 'auto',
            width: isMobile ? 'min(96vw, 360px)' : 'auto',
            maxWidth: '96vw',
          }}
        >
          <motion.div
            initial="hidden"
            animate="show"
            variants={{
              hidden: {},
              show: { transition: { staggerChildren: 0.14, delayChildren: 2.22 } },
            }}
            style={{
            display: 'flex',
            gap: isMobile ? 8 : 16,
            justifyContent: 'center',
          }}>
            <ChoiceCard
              caption="Faction"
              label={faction.label}
              iconUrl={factionIconUrl(faction.key)}
              hint="Click to cycle"
              compact={isMobile}
              onClick={cycleFaction}
            />
            <ChoiceCard
              caption="Start Port"
              label={startPortLabel}
              iconUrl={startPortIconUrl}
              description={startPortDescription}
              hint={portOptions.length <= 1 ? undefined : 'Click to cycle'}
              compact={isMobile}
              onClick={cyclePort}
            />
            <ChoiceCard
              caption="Difficulty"
              label={difficulty.label}
              iconUrl={difficultyIconUrl(difficulty.key)}
              hint="Click to cycle"
              compact={isMobile}
              onClick={cycleDiff}
            />
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.68, ease: 'easeOut', delay: 2.78 }}
          >
          <BeginButton
            ready={ready}
            loadingMessage={loadingMessage}
            loadingProgress={loadingProgress}
            compact={isMobile}
            onClick={handleEnter}
          />
          </motion.div>
        </motion.div>
      </div>

      {/* Top-left: controls hint (hidden on mobile — touch users tap the dock) */}
      {!isMobile && (
        <motion.div
          initial={{ opacity: 0, x: -6 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.82, ease: 'easeOut', delay: 2.95 }}
          style={{
            position: 'absolute',
            top: 18,
            left: 20,
            fontFamily: MONO,
            fontSize: 11,
            color: 'rgba(255,248,232,0.62)',
            letterSpacing: '0.16em',
            textShadow: '0 1px 2px rgba(0,0,0,0.45)',
            pointerEvents: 'none',
            textTransform: 'uppercase',
          }}
        >
          W/S sail · A/D turn · SHIFT trim · ENTER begin
        </motion.div>
      )}
      {/* Top-right: Settings + About icon buttons */}
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.82, ease: 'easeOut', delay: 2.65 }}
        style={{
          position: 'absolute',
          top: 16,
          right: 18,
          display: 'flex',
          gap: 10,
          pointerEvents: 'auto',
        }}
      >
        <AudioMuteButton variant="splash" />
        <CornerIconButton label="About" onClick={openAbout}>
          <Info size={18} strokeWidth={2.2} />
        </CornerIconButton>
        <CornerIconButton label="Settings" onClick={openSettings}>
          <SettingsIcon size={18} strokeWidth={2.2} />
        </CornerIconButton>
      </motion.div>

      {!isMobile && <Ticker />}

      {settingsOpen && (
        <Suspense fallback={null}>
          <SettingsModalV2
            open={settingsOpen}
            onClose={() => setSettingsOpen(false)}
            initialTab={settingsTab}
          />
        </Suspense>
      )}
    </motion.div>
  );
}

// Animated ASCII wave row — mono characters scrolling horizontally.
// The string is rendered twice in a wide container; translating x by -50%
// produces a seamless loop because the second half lines up exactly where
// the first half started.
// Settings-menu palette — keeps the splash CTA visually consistent with
// PrimaryBtn in SettingsModalV2 (gold border, mono caps, pulsing diamond).
const BTN_GOLD = '#c9a84c';
const BTN_DIM_GOLD = '#7a6432';
const BTN_BRIGHT = '#fff4d8';
const BTN_WARM = '#f5d9a0';

function BeginButton({
  ready,
  loadingMessage,
  loadingProgress,
  compact,
  onClick,
}: {
  ready: boolean;
  loadingMessage: string;
  loadingProgress: number;
  compact?: boolean;
  onClick: () => void;
}) {
  const [hover, setHover] = useState(false);
  const pct = Math.max(0, Math.min(1, loadingProgress));

  // Pulsing dots for the loading message ("·" → "··" → "···")
  const [dot, setDot] = useState(0);
  useEffect(() => {
    if (ready) return;
    const id = setInterval(() => setDot((d) => (d + 1) % 4), 420);
    return () => clearInterval(id);
  }, [ready]);
  const dots = '·'.repeat(dot);

  const baseShadow = `0 0 0 1px ${BTN_GOLD}44 inset, 0 1px 0 rgba(255,238,184,0.34) inset, 0 -1px 0 rgba(78,54,20,0.45) inset, 0 0 0 4px rgba(201,168,76,0.12) inset, 0 0 12px ${BTN_GOLD}22, 0 2px 10px rgba(0,0,0,0.5)`;
  const litShadow = `0 0 0 1px ${BTN_GOLD}66 inset, 0 1px 0 rgba(255,238,184,0.48) inset, 0 -1px 0 rgba(78,54,20,0.4) inset, 0 0 0 4px rgba(201,168,76,0.18) inset, 0 0 22px ${BTN_GOLD}44, 0 2px 10px rgba(0,0,0,0.5)`;
  const hoverShadow = `0 0 0 1px ${BTN_GOLD}88 inset, 0 1px 0 rgba(255,238,184,0.62) inset, 0 -1px 0 rgba(78,54,20,0.36) inset, 0 0 0 4px rgba(201,168,76,0.24) inset, 0 0 30px ${BTN_GOLD}66, 0 4px 14px rgba(0,0,0,0.6)`;
  const disabledShadow = `0 0 0 1px ${BTN_DIM_GOLD}33 inset, 0 0 0 4px rgba(122,100,50,0.08) inset, 0 2px 8px rgba(0,0,0,0.4)`;

  return (
    <motion.button
      type="button"
      onClick={() => { if (ready) { sfxClick(); onClick(); } }}
      disabled={!ready}
      onMouseEnter={() => { if (ready) { sfxHover(); setHover(true); } }}
      onMouseLeave={() => setHover(false)}
      whileTap={ready ? { scale: 0.985 } : undefined}
      animate={
        ready
          ? {
              boxShadow: hover ? hoverShadow : [baseShadow, litShadow, baseShadow],
              borderColor: hover ? BTN_GOLD : BTN_DIM_GOLD,
            }
          : { boxShadow: disabledShadow, borderColor: `${BTN_DIM_GOLD}55` }
      }
      transition={
        ready && !hover
          ? { boxShadow: { duration: 2.6, ease: 'easeInOut', repeat: Infinity } }
          : { duration: 0.18, ease: 'easeOut' }
      }
      style={{
        position: 'relative',
        width: '100%',
        minHeight: compact ? 52 : 64,
        padding: compact ? '12px 16px' : '16px 22px',
        fontFamily: MONO,
        fontSize: compact ? 12.5 : 14,
        fontWeight: 700,
        letterSpacing: '0.32em',
        textTransform: 'uppercase',
        color: ready ? (hover ? BTN_BRIGHT : BTN_WARM) : 'rgba(214,180,108,0.45)',
        background: ready ? 'rgba(16, 14, 22, 0.92)' : 'rgba(12, 10, 16, 0.7)',
        border: `2px solid ${BTN_DIM_GOLD}`,
        borderRadius: 14,
        cursor: ready ? 'pointer' : 'wait',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: compact ? 12 : 16,
        transition: 'color 200ms ease, background 200ms ease',
      }}
    >
      {ready && (
        <motion.span
          aria-hidden="true"
          animate={hover ? { opacity: 0.78 } : { opacity: [0.45, 0.62, 0.45] }}
          transition={hover ? { duration: 0.18, ease: 'easeOut' } : { duration: 3.2, ease: 'easeInOut', repeat: Infinity }}
          style={{
            position: 'absolute',
            inset: 2,
            borderRadius: 11,
            pointerEvents: 'none',
            background: `
              linear-gradient(115deg, rgba(255,244,216,0.34) 0%, rgba(255,244,216,0.1) 18%, rgba(201,168,76,0.05) 34%, rgba(0,0,0,0) 58%),
              linear-gradient(180deg, rgba(255,232,176,0.16) 0%, rgba(255,232,176,0) 36%, rgba(55,35,12,0.18) 100%)
            `,
            boxShadow: '0 0 0 1px rgba(255,230,170,0.18) inset',
          }}
        />
      )}
      {ready && (
        <motion.span
          aria-hidden="true"
          initial={{ x: '-130%', opacity: 0 }}
          animate={{ x: '130%', opacity: [0, 0.72, 0] }}
          transition={{ duration: 0.95, ease: 'easeOut', delay: 0.08 }}
          style={{
            position: 'absolute',
            top: -10,
            bottom: -10,
            width: '36%',
            background: 'linear-gradient(90deg, rgba(255,244,216,0) 0%, rgba(255,244,216,0.46) 48%, rgba(255,244,216,0) 100%)',
            pointerEvents: 'none',
            zIndex: 1,
          }}
        />
      )}
      {ready ? (
        <>
          {/* Pulsing diamond — same as SettingsModalV2 PrimaryBtn */}
          <motion.span
            animate={hover ? { opacity: [1, 0.35, 1] } : { opacity: [0.75, 1, 0.75] }}
            transition={{ duration: hover ? 1.0 : 1.8, ease: 'easeInOut', repeat: Infinity }}
            style={{
              color: BTN_GOLD,
              fontSize: compact ? 13 : 15,
              lineHeight: 1,
              textShadow: `0 0 10px ${BTN_GOLD}aa`,
            }}
          >
            ◆
          </motion.span>
          <motion.span
            animate={hover ? { opacity: 1 } : { opacity: [0.86, 1, 0.86] }}
            transition={hover ? { duration: 0.18, ease: 'easeOut' } : { duration: 2.4, ease: 'easeInOut', repeat: Infinity }}
            style={{
              position: 'relative',
              zIndex: 1,
              paddingTop: 1,
              textShadow: hover
                ? `0 0 12px ${BTN_GOLD}66, 0 1px 2px rgba(0,0,0,0.72)`
                : `0 0 7px ${BTN_GOLD}3d, 0 1px 2px rgba(0,0,0,0.7)`,
            }}
          >
            Set&nbsp;Sail
          </motion.span>
          {!compact && (
            <motion.span
              animate={hover ? { opacity: 1 } : { opacity: [0.58, 0.82, 0.58] }}
              transition={hover ? { duration: 0.18, ease: 'easeOut' } : { duration: 2.4, ease: 'easeInOut', repeat: Infinity, delay: 0.18 }}
              style={{
                position: 'absolute',
                right: 18,
                zIndex: 1,
                fontFamily: MONO,
                fontSize: 10,
                fontWeight: 500,
                letterSpacing: '0.28em',
                color: hover ? `${BTN_BRIGHT}99` : `${BTN_DIM_GOLD}cc`,
                transition: 'color 200ms ease',
              }}
            >
              ↵ Enter
            </motion.span>
          )}
        </>
      ) : (
        <>
          <span
            style={{
              color: BTN_DIM_GOLD,
              fontSize: compact ? 13 : 15,
              lineHeight: 1,
              opacity: 0.6,
            }}
          >
            ◆
          </span>
          <span style={{ paddingTop: 1 }}>Charting{dots}</span>
        </>
      )}

      {/* Progress bar — sits flush at the bottom edge */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: 2,
          background: `${BTN_GOLD}14`,
          overflow: 'hidden',
        }}
      >
        <motion.div
          animate={{
            width: ready ? '100%' : `${Math.max(4, pct * 100)}%`,
            opacity: ready ? 0 : 1,
          }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          style={{
            height: '100%',
            background: `linear-gradient(90deg, ${BTN_GOLD}00 0%, ${BTN_GOLD}cc 50%, #ffe8b0 100%)`,
            boxShadow: `0 0 8px ${BTN_GOLD}aa`,
          }}
        />
      </div>
    </motion.button>
  );
}

function CornerIconButton({
  label,
  onClick,
  children,
}: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={() => { sfxClick(); onClick(); }}
      title={label}
      aria-label={label}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        height: 38,
        padding: '0 14px',
        borderRadius: 19,
        background: 'rgba(20, 30, 45, 0.42)',
        border: '1px solid rgba(255,248,232,0.22)',
        color: 'rgba(255,248,232,0.88)',
        fontFamily: '"Manrope", "Inter", system-ui, sans-serif',
        fontSize: 12.5,
        fontWeight: 600,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        cursor: 'pointer',
        backdropFilter: 'blur(10px)',
        boxShadow: '0 6px 14px rgba(0,5,15,0.35)',
        transition: 'transform 120ms ease, border-color 200ms ease, background 200ms ease',
      }}
      onMouseEnter={(e) => {
        sfxHover();
        e.currentTarget.style.transform = 'translateY(-1px)';
        e.currentTarget.style.borderColor = 'rgba(214,180,108,0.55)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.borderColor = 'rgba(255,248,232,0.22)';
      }}
    >
      {children}
      <span>{label}</span>
    </button>
  );
}
