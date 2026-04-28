import { memo, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { Bloom, EffectComposer, Pixelation, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import { useGameStore } from '../store/gameStore';
import { type DayState, makeDayState, samplePortDay } from '../utils/dayPhase';
import { DistantBirds, NightStars, SkyClouds, SkyDome, SkyLights, Sun } from './sky/SkyScene';

// Banner-tuned cloud rig — sit above the rooftop silhouette so they read as
// cumulus over the city, not smoke columns rising from it.
import type { CloudSpec } from './sky/SkyScene';
// `speed: 0` locks each cloud's internal puff pattern — the lateral drift on
// the parent group does the visible movement, so the puffs themselves don't
// shimmer. Stable `seed` per cloud so the puff distribution survives any
// React re-render rather than regenerating from Math.random().
//
// Authored color is near-white because the day driver in SkyClouds already
// warms them toward the horizon hue at golden hour and dims them at night.
// y is lifted to 2.7–4.5 so puff bases clear the rooftop silhouette band.
// volume/bounds tightened so they read as compact cumulus, not smoke plumes.
const BANNER_CLOUDS: CloudSpec[] = [
  { seed:  17, position: [ 7.5,  4.2, -7.5], segments: 22, bounds: [2.6, 0.5, 1.2], volume: 2.2, color: '#fdfdf6', opacity: 0.92, growth: 1.6, speed: 0 },
  { seed:  29, position: [ 2.0,  3.4, -8.5], segments: 22, bounds: [3.0, 0.4, 1.1], volume: 1.7, color: '#fbfbf2', opacity: 0.78, growth: 1.6, speed: 0 },
  { seed:  41, position: [-3.5,  2.9, -6.8], segments: 22, bounds: [2.4, 0.5, 1.2], volume: 2.0, color: '#fdfdf6', opacity: 0.88, growth: 1.6, speed: 0 },
  { seed:  59, position: [-8.0,  3.8, -8.0], segments: 22, bounds: [2.4, 0.4, 1.1], volume: 1.6, color: '#f7f5ec', opacity: 0.74, growth: 1.6, speed: 0 },
  { seed:  73, position: [ 0.8,  2.7, -9.5], segments: 20, bounds: [2.0, 0.3, 0.9], volume: 1.1, color: '#f3f1e6', opacity: 0.55, growth: 1.5, speed: 0 },
  { seed:  97, position: [-5.5,  2.7,-10.0], segments: 20, bounds: [2.0, 0.3, 0.9], volume: 1.1, color: '#f3f1e6', opacity: 0.50, growth: 1.5, speed: 0 },
];

// ─── silhouette overlay — magenta-keyed PNG drawn last in NDC ───────────────
//
// Renders a fullscreen NDC quad and samples up to two source textures (a day
// silhouette and an optional night silhouette), each with its own cover-fit
// UV transform. The two are crossfaded by sun intensity, so a port with both
// versions actually re-lights at dusk rather than just being tinted cool.
// Without a night texture the day silhouette gets the legacy mood-tint.

const OVERLAY_VERT = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;
const OVERLAY_FRAG = /* glsl */`
  varying vec2 vUv;
  uniform sampler2D uDay;
  uniform sampler2D uNight;
  uniform vec2 uDayUvScale;
  uniform vec2 uNightUvScale;
  uniform float uHasNight;
  uniform float uMix;          // 0 = day, 1 = night
  uniform float uKeyLow;
  uniform float uKeyHigh;
  uniform vec3 uTint;
  uniform float uTintAmount;

  // Brightness-normalized magenta detector: pixels read as magenta when both
  // red and blue exceed green relative to the pixel's own brightness. Catches
  // dark sky corners that an absolute threshold misses, rejects warm oranges
  // (only R > G) so the foreground stays solid.
  float magentaAlpha(vec4 c) {
    float chroma = min(c.r - c.g, c.b - c.g);
    float bright = max(max(c.r, c.b), 0.04);
    float m = chroma / bright;
    return 1.0 - smoothstep(uKeyLow, uKeyHigh, m);
  }

  void main() {
    vec2 dayUv = (vUv - 0.5) * uDayUvScale + 0.5;
    vec4 dayC = texture2D(uDay, dayUv);
    float dayA = magentaAlpha(dayC);

    // Tint applies only to the day-side contribution — the night image
    // already carries baked nighttime lighting and shouldn't be re-shifted.
    vec3 dayRgb = dayC.rgb * mix(vec3(1.0), uTint * 1.2, uTintAmount);

    if (uHasNight > 0.5) {
      vec2 nightUv = (vUv - 0.5) * uNightUvScale + 0.5;
      vec4 nightC = texture2D(uNight, nightUv);
      float nightA = magentaAlpha(nightC);

      vec3 col = mix(dayRgb, nightC.rgb, uMix);
      float a = mix(dayA, nightA, uMix);
      if (a < 0.02) discard;
      gl_FragColor = vec4(col, a);
    } else {
      if (dayA < 0.02) discard;
      gl_FragColor = vec4(dayRgb, dayA);
    }
  }
`;

// Compute UV scale for a `cover` fit — sample less of whichever axis would
// otherwise stretch the image. Returned scale multiplies (uv - 0.5).
function coverUvScale(canvasAspect: number, imageAspect: number, out: THREE.Vector2) {
  if (canvasAspect > imageAspect) {
    out.set(1, imageAspect / canvasAspect);
  } else {
    out.set(canvasAspect / imageAspect, 1);
  }
}

function SilhouetteOverlay({
  textureUrl,
  imageAspect,
  nightTextureUrl,
  nightImageAspect,
  dayRef,
}: {
  textureUrl: string;
  imageAspect: number;
  nightTextureUrl?: string;
  nightImageAspect?: number;
  dayRef: React.MutableRefObject<DayState>;
}) {
  // Conditionally load the night texture — useLoader hooks must be called
  // unconditionally per render, so we always pass an array and just include
  // the night URL when present. The day texture is always at index 0.
  const sources = useMemo(
    () => (nightTextureUrl ? [textureUrl, nightTextureUrl] : [textureUrl]),
    [textureUrl, nightTextureUrl],
  );
  const textures = useLoader(THREE.TextureLoader, sources);
  const dayTex = textures[0];
  const nightTex = textures[1];

  useEffect(() => {
    for (const t of textures) {
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.magFilter = THREE.LinearFilter;
      t.needsUpdate = true;
    }
  }, [textures]);

  const uniforms = useMemo(
    () => ({
      uDay: { value: dayTex },
      // Sampling the day texture as a fallback keeps the sampler bound; the
      // uHasNight flag gates whether it's actually mixed in.
      uNight: { value: nightTex ?? dayTex },
      uDayUvScale: { value: new THREE.Vector2(1, 1) },
      uNightUvScale: { value: new THREE.Vector2(1, 1) },
      uHasNight: { value: nightTex ? 1 : 0 },
      uMix: { value: 0 },
      uKeyLow: { value: 0.20 },
      uKeyHigh: { value: 0.35 },
      uTint: { value: new THREE.Color(1, 1, 1) },
      uTintAmount: { value: 0 },
    }),
    [dayTex, nightTex],
  );

  const { size } = useThree();

  useFrame(() => {
    const canvasAspect = size.width / Math.max(1, size.height);
    coverUvScale(canvasAspect, imageAspect, uniforms.uDayUvScale.value);
    if (nightTex) {
      coverUvScale(canvasAspect, nightImageAspect ?? imageAspect, uniforms.uNightUvScale.value);
    }

    const day = dayRef.current;
    // Crossfade fully to the night texture by sunset, fully to the day by
    // mid-morning. The smoothstep window matches dawn (~6am sunI≈1.3) and
    // dusk (~7pm sunI≈0.8) ramps so the transition straddles golden hour.
    if (nightTex) {
      uniforms.uMix.value = 1 - THREE.MathUtils.smoothstep(day.sunIntensity, 0.4, 1.4);
      // No fake mood tint when we have a real night image.
      uniforms.uTintAmount.value = 0;
    } else {
      // Fallback: legacy cool-tint on the day silhouette.
      const dim = THREE.MathUtils.clamp(1 - day.sunIntensity / 1.7, 0, 1);
      uniforms.uTint.value.copy(day.coolColor).lerp(day.skyHorizon, 0.4);
      uniforms.uTintAmount.value = dim * 0.85;
    }
  });

  return (
    <mesh frustumCulled={false} renderOrder={1000}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        vertexShader={OVERLAY_VERT}
        fragmentShader={OVERLAY_FRAG}
        uniforms={uniforms}
        transparent
        depthTest={false}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}

// ─── day driver — reads game timeOfDay, samples palette into dayRef ─────────

function DayDriver({ dayRef }: { dayRef: React.MutableRefObject<DayState> }) {
  const timeOfDay = useGameStore((s) => s.timeOfDay);
  // Sample on every frame so a smooth game-time progression remains smooth here,
  // but we read from a ref so we never re-render the Canvas tree.
  const hoursRef = useRef(timeOfDay);
  hoursRef.current = timeOfDay;
  useEffect(() => {
    samplePortDay(timeOfDay, dayRef.current);
  }, [timeOfDay, dayRef]);
  useFrame(() => {
    samplePortDay(hoursRef.current, dayRef.current);
  });
  return null;
}

// ─── camera — fixed at origin, gentle parallax drift ────────────────────────

function BannerCamera() {
  const { camera } = useThree();
  useEffect(() => {
    camera.position.set(0, 0, 0);
    camera.lookAt(0, 0, -1);
  }, [camera]);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    // Tiny breathing motion so clouds parallax over the silhouette.
    camera.position.x = Math.sin(t * 0.05) * 0.08;
    camera.position.y = Math.sin(t * 0.04) * 0.05;
    camera.lookAt(0, 0, -1);
  });
  return null;
}

// ─── main exported component ────────────────────────────────────────────────

export interface PortBannerSceneProps {
  /** Public path to the day-time silhouette PNG with magenta sky-cutout. */
  textureUrl: string;
  /** Source image aspect ratio (width / height) for cover-fit math. */
  imageAspect: number;
  /** Optional night-time silhouette. Crossfades in by sunset. */
  nightTextureUrl?: string;
  /** Aspect ratio of the night image (defaults to day's aspect). */
  nightImageAspect?: number;
}

function PortBannerSceneInner({
  textureUrl,
  imageAspect,
  nightTextureUrl,
  nightImageAspect,
}: PortBannerSceneProps) {
  const dayRef = useRef<DayState>(makeDayState());
  // Initialize before first paint so the first frame isn't gray.
  useMemo(() => {
    samplePortDay(useGameStore.getState().timeOfDay, dayRef.current);
  }, []);

  return (
    <Canvas
      className="absolute inset-0"
      camera={{ fov: 55, near: 0.1, far: 200, position: [0, 0, 0] }}
      dpr={[1, 1.5]}
      gl={{ antialias: true, alpha: false, toneMapping: THREE.ACESFilmicToneMapping }}
      style={{ background: '#04050a' }}
    >
      <BannerCamera />
      <DayDriver dayRef={dayRef} />
      <SkyLights dayRef={dayRef} />
      <SkyDome dayRef={dayRef} radius={60} />
      <NightStars dayRef={dayRef} />
      <Sun dayRef={dayRef} distance={28} radius={2.0} />
      <SkyClouds dayRef={dayRef} specs={BANNER_CLOUDS} driftSpeed={0.05} driftWrap={28} />
      <DistantBirds dayRef={dayRef} count={9} wrap={14} yRange={[0.8, 3.0]} zRange={[-22, -10]} />
      <SilhouetteOverlay
        textureUrl={textureUrl}
        imageAspect={imageAspect}
        nightTextureUrl={nightTextureUrl}
        nightImageAspect={nightImageAspect}
        dayRef={dayRef}
      />
      <EffectComposer multisampling={0}>
        <Bloom intensity={0.55} luminanceThreshold={0.7} luminanceSmoothing={0.35} mipmapBlur />
        {/* Subtle pixel quantization — unifies the soft volumetric clouds with
            the hard pixel-art silhouette by re-aligning everything to a shared
            grid. Granularity 2 is the lightest setting that visibly snaps cloud
            edges without making the whole banner look 8-bit. */}
        <Pixelation granularity={2} />
        <Vignette eskil={false} offset={0.3} darkness={0.28} />
      </EffectComposer>
    </Canvas>
  );
}

// PortModal re-renders on every store update; memoizing skips the entire
// Canvas tree reconciliation when textureUrl / imageAspect haven't changed.
export const PortBannerScene = memo(PortBannerSceneInner);
