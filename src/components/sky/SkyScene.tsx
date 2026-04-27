import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Cloud, Clouds, Stars } from '@react-three/drei';
import * as THREE from 'three';
import type { DayState } from '../../utils/dayPhase';

// ─── sky dome — gradient sphere with sun-direction warm bloom ───────────────

const SKY_VERT = /* glsl */`
  varying vec3 vLocalPos;
  void main() {
    vLocalPos = normalize(position);
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
  }
`;
const SKY_FRAG = /* glsl */`
  varying vec3 vLocalPos;
  uniform vec3 uTop;
  uniform vec3 uHorizon;
  uniform vec3 uSunColor;
  uniform vec3 uSunDir;
  uniform float uSunBlend;
  void main() {
    float h = clamp(vLocalPos.y * 0.5 + 0.5, 0.0, 1.0);
    float t = smoothstep(0.30, 0.70, h);
    vec3 col = mix(uHorizon, uTop, t);
    float sun = max(dot(normalize(vLocalPos), uSunDir), 0.0);
    col += uSunColor * pow(sun, 6.0) * 0.55 * uSunBlend;
    float band = exp(-pow((h - 0.42) * 6.0, 2.0));
    col += uSunColor * band * 0.18 * uSunBlend;
    gl_FragColor = vec4(col, 1.0);
  }
`;

export function SkyDome({ dayRef, radius = 60 }: { dayRef: React.MutableRefObject<DayState>; radius?: number }) {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const uniforms = useMemo(
    () => ({
      uTop: { value: new THREE.Color('#79b3dd') },
      uHorizon: { value: new THREE.Color('#f8e6c4') },
      uSunColor: { value: new THREE.Color('#fff7e2') },
      uSunDir: { value: new THREE.Vector3(0, 0.5, 0.7) },
      uSunBlend: { value: 1 },
    }),
    [],
  );
  useFrame(() => {
    const u = matRef.current?.uniforms;
    if (!u) return;
    const day = dayRef.current;
    (u.uTop as { value: THREE.Color }).value.copy(day.skyTop);
    (u.uHorizon as { value: THREE.Color }).value.copy(day.skyHorizon);
    (u.uSunColor as { value: THREE.Color }).value.copy(day.sunColor);
    (u.uSunDir as { value: THREE.Vector3 }).value.copy(day.sunDir);
    (u.uSunBlend as { value: number }).value = THREE.MathUtils.smoothstep(day.sunIntensity, 0.3, 1.7);
  });
  return (
    <mesh>
      <sphereGeometry args={[radius, 32, 16]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={SKY_VERT}
        fragmentShader={SKY_FRAG}
        uniforms={uniforms}
        side={THREE.BackSide}
        depthWrite={false}
      />
    </mesh>
  );
}

// ─── sun mesh — bloom source ────────────────────────────────────────────────

export function Sun({
  dayRef,
  distance = 14,
  radius = 1.4,
}: {
  dayRef: React.MutableRefObject<DayState>;
  distance?: number;
  radius?: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(() => {
    if (!meshRef.current || !matRef.current) return;
    const day = dayRef.current;
    meshRef.current.position.copy(day.sunDir).multiplyScalar(distance);
    matRef.current.color.copy(day.sunColor);
    const visible = day.sunDir.y > -0.05;
    meshRef.current.visible = visible;
    matRef.current.opacity = THREE.MathUtils.clamp((day.sunDir.y + 0.05) * 4, 0, 1);
  });
  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[radius, 32, 16]} />
      <meshBasicMaterial ref={matRef} color="#fff4c8" toneMapped={false} transparent />
    </mesh>
  );
}

// ─── stars — drei Stars with star-opacity gating ────────────────────────────

export function NightStars({ dayRef }: { dayRef: React.MutableRefObject<DayState> }) {
  const ref = useRef<THREE.Points>(null);
  useFrame(() => {
    if (!ref.current) return;
    const t = dayRef.current.starOpacity;
    ref.current.visible = t > 0.05;
    const mat = ref.current.material as THREE.ShaderMaterial;
    if (mat.uniforms?.opacity) (mat.uniforms.opacity as { value: number }).value = t;
  });
  return (
    <Stars
      ref={ref}
      radius={50}
      depth={20}
      count={1600}
      factor={3.5}
      saturation={0.2}
      fade
      speed={0.4}
    />
  );
}

// ─── crepuscular rays — additive cones, peak at sunrise/sunset ──────────────

export function CrepuscularRays({ dayRef }: { dayRef: React.MutableRefObject<DayState> }) {
  const groupRef = useRef<THREE.Group>(null);
  const matsRef = useRef<THREE.MeshBasicMaterial[]>([]);
  useFrame((state) => {
    if (!groupRef.current) return;
    const day = dayRef.current;
    groupRef.current.position.copy(day.sunDir).multiplyScalar(12);
    groupRef.current.lookAt(0, 0, 0);
    groupRef.current.rotateZ(state.clock.elapsedTime * 0.08);
    const horizonness = 1 - Math.abs(day.sunDir.y);
    const aboveHorizon = THREE.MathUtils.clamp(day.sunDir.y * 6 + 0.3, 0, 1);
    const opacity = horizonness * aboveHorizon * 0.18;
    matsRef.current.forEach((m, i) => {
      m.color.copy(day.sunColor);
      m.opacity = opacity * (i === 0 ? 1 : 0.6);
    });
  });
  return (
    <group ref={groupRef}>
      {[0, 1].map((i) => (
        <mesh key={i} rotation={[Math.PI / 2, 0, (i * Math.PI) / 6]}>
          <coneGeometry args={[6, 22, 24, 1, true]} />
          <meshBasicMaterial
            ref={(m) => { if (m) matsRef.current[i] = m; }}
            color="#fff4c8"
            transparent
            opacity={0}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            side={THREE.DoubleSide}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}

// ─── lights driven by day state ─────────────────────────────────────────────

export function SkyLights({ dayRef }: { dayRef: React.MutableRefObject<DayState> }) {
  const sunLight = useRef<THREE.DirectionalLight>(null);
  const ambient = useRef<THREE.AmbientLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  useFrame(() => {
    const day = dayRef.current;
    if (sunLight.current) {
      sunLight.current.position.copy(day.sunDir).multiplyScalar(8);
      sunLight.current.color.copy(day.sunColor);
      sunLight.current.intensity = day.sunIntensity;
    }
    if (ambient.current) {
      ambient.current.color.copy(day.coolColor);
      ambient.current.intensity = day.ambIntensity;
    }
    if (hemi.current) {
      hemi.current.color.copy(day.skyHorizon);
      hemi.current.groundColor.copy(day.coolColor);
      hemi.current.intensity = 0.25 + day.sunIntensity * 0.12;
    }
  });
  return (
    <>
      <ambientLight ref={ambient} intensity={0.5} />
      <directionalLight ref={sunLight} position={[5, 4, 4]} intensity={1.5} />
      <hemisphereLight ref={hemi} args={['#ffe2bd', '#3a4a5c', 0.35]} />
    </>
  );
}

// ─── distant birds — procedural sprite flock drifting across the sky ───────

function createBirdSheet(): THREE.CanvasTexture {
  // 2-frame sprite sheet, 128×32: wings-up | wings-down. Anti-aliased via
  // 2× upscale draw + half-size canvas would over-soften the strokes at
  // the small render size, so we draw at native size with crisp lineCaps.
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 32;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, 128, 32);
  ctx.strokeStyle = 'rgba(20, 20, 30, 0.92)';
  ctx.lineWidth = 2.4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Frame 0 — wings raised, classic "^^" silhouette.
  ctx.beginPath();
  ctx.moveTo(6, 22);
  ctx.quadraticCurveTo(18, 6, 32, 18);
  ctx.quadraticCurveTo(46, 6, 58, 22);
  ctx.stroke();

  // Frame 1 — wings dipped, downstroke "vv".
  ctx.beginPath();
  ctx.moveTo(70, 12);
  ctx.quadraticCurveTo(82, 24, 96, 14);
  ctx.quadraticCurveTo(110, 24, 122, 12);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

type BirdSpec = {
  baseY: number;
  z: number;
  size: number;
  startX: number;
  driftSpeed: number; // world-units per second
  bobPhase: number;
  bobAmp: number;
  flapHz: number;
  flapPhase: number;
};

function Bird({
  spec,
  texture,
  wrap,
  dayRef,
}: {
  spec: BirdSpec;
  texture: THREE.CanvasTexture;
  wrap: number;
  dayRef: React.MutableRefObject<DayState>;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshBasicMaterial>(null);
  // Each bird gets its own texture clone so flap-frame offsets stay independent.
  // Clones share the underlying canvas, so this is essentially free.
  const localTex = useMemo(() => {
    const t = texture.clone();
    t.repeat.set(0.5, 1);
    t.needsUpdate = true;
    return t;
  }, [texture]);

  useFrame((state) => {
    const m = meshRef.current;
    const mat = matRef.current;
    if (!m || !mat) return;
    const t = state.clock.elapsedTime;

    // Lateral drift with wrap. startX is the seed offset; we add drift over
    // time and wrap into [-wrap, +wrap] so birds re-enter from the far side.
    const span = wrap * 2;
    let x = spec.startX + spec.driftSpeed * t;
    x = ((((x + wrap) % span) + span) % span) - wrap;
    m.position.set(x, spec.baseY + Math.sin(t * 0.7 + spec.bobPhase) * spec.bobAmp, spec.z);

    // Discrete two-frame flap.
    const frame = Math.floor(t * spec.flapHz + spec.flapPhase) % 2;
    localTex.offset.x = frame === 0 ? 0 : 0.5;

    // Birds fade out at night — they're hard to see anyway, and dark sky +
    // dark birds reads as noise rather than wildlife.
    const day = dayRef.current;
    const dayness = THREE.MathUtils.smoothstep(day.sunIntensity, 0.4, 1.4);
    mat.opacity = 0.85 * dayness;
    mat.visible = mat.opacity > 0.05;
  });

  return (
    <mesh ref={meshRef}>
      <planeGeometry args={[spec.size, spec.size * 0.42]} />
      <meshBasicMaterial
        ref={matRef}
        map={localTex}
        transparent
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}

// Mulberry32 — small deterministic PRNG so the flock layout is stable
// across re-renders (hot-reload, tab switches) without committing literals.
function mulberry32(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function DistantBirds({
  dayRef,
  count = 9,
  seed = 1612,
  wrap = 12,
  /** Vertical band the flock occupies, in world-units. */
  yRange = [0.6, 3.2],
  /** Depth range — closer birds are larger and faster. */
  zRange = [-22, -10],
}: {
  dayRef: React.MutableRefObject<DayState>;
  count?: number;
  seed?: number;
  wrap?: number;
  yRange?: [number, number];
  zRange?: [number, number];
}) {
  const texture = useMemo(() => createBirdSheet(), []);
  const specs = useMemo<BirdSpec[]>(() => {
    const rnd = mulberry32(seed);
    const [yLo, yHi] = yRange;
    const [zLo, zHi] = zRange;
    return Array.from({ length: count }, () => {
      const z = THREE.MathUtils.lerp(zLo, zHi, rnd());
      // Closer birds appear larger and drift faster (parallax cue).
      const closeness = (z - zLo) / (zHi - zLo); // 0 = far, 1 = near
      const size = THREE.MathUtils.lerp(0.32, 0.62, closeness);
      const drift = THREE.MathUtils.lerp(0.18, 0.42, closeness) * (rnd() < 0.5 ? -1 : 1);
      return {
        z,
        baseY: THREE.MathUtils.lerp(yLo, yHi, rnd()),
        size,
        startX: (rnd() * 2 - 1) * wrap,
        driftSpeed: drift,
        bobPhase: rnd() * Math.PI * 2,
        bobAmp: 0.04 + rnd() * 0.06,
        flapHz: 4 + rnd() * 3, // 4-7 Hz wingbeats — fast enough to feel alive
        flapPhase: rnd() * 2,
      };
    });
  }, [count, seed, wrap, yRange, zRange]);

  return (
    <group>
      {specs.map((spec, i) => (
        <Bird key={i} spec={spec} texture={texture} wrap={wrap} dayRef={dayRef} />
      ))}
    </group>
  );
}

// ─── default cloud layout — six layered drei volumetric clouds ──────────────

export type CloudSpec = {
  position: [number, number, number];
  segments: number;
  bounds: [number, number, number];
  volume: number;
  color: string;
  opacity: number;
  growth: number;
  speed: number;
  /** Stable seed so the puff distribution survives parent re-renders. */
  seed?: number;
};

export const SPLASH_CLOUDS: CloudSpec[] = [
  { seed: 11, position: [ 2.6,  1.0, -1.4], segments: 28, bounds: [1.6, 0.4, 1.0], volume: 3.0, color: '#fff8e8', opacity: 0.85, growth: 2, speed: 0.07 },
  { seed: 23, position: [-2.7,  0.7, -0.6], segments: 26, bounds: [1.4, 0.4, 1.0], volume: 2.6, color: '#fff8e8', opacity: 0.80, growth: 2, speed: 0.06 },
  { seed: 37, position: [ 1.6, -1.4, -1.0], segments: 24, bounds: [1.5, 0.5, 1.0], volume: 2.2, color: '#ffeed4', opacity: 0.70, growth: 2, speed: 0.05 },
  { seed: 53, position: [-1.9, -1.3, -0.4], segments: 22, bounds: [1.3, 0.4, 1.0], volume: 2.0, color: '#ffeed4', opacity: 0.70, growth: 2, speed: 0.05 },
  { seed: 71, position: [ 3.2,  0.0, -2.4], segments: 22, bounds: [1.2, 0.3, 0.8], volume: 1.6, color: '#ffe9c4', opacity: 0.55, growth: 2, speed: 0.04 },
  { seed: 89, position: [-3.0, -0.4, -2.2], segments: 22, bounds: [1.2, 0.3, 0.8], volume: 1.6, color: '#ffe9c4', opacity: 0.55, growth: 2, speed: 0.04 },
];

export function SkyClouds({
  dayRef,
  specs = SPLASH_CLOUDS,
  limit = 48,
  range = 120,
  tintNight = true,
  driftSpeed = 0,
  driftWrap = 12,
}: {
  dayRef: React.MutableRefObject<DayState>;
  specs?: CloudSpec[];
  limit?: number;
  range?: number;
  tintNight?: boolean;
  /** Lateral drift speed in world-units / second. 0 disables drift. */
  driftSpeed?: number;
  /** Horizontal half-extent at which clouds wrap back to the other side. */
  driftWrap?: number;
}) {
  const groupRef = useRef<THREE.Group>(null);
  // Tint clouds toward the sun warmth at sunrise/sunset, cool/dim at night,
  // and (optionally) drift them slowly across the sky.
  useFrame((_, dt) => {
    if (groupRef.current && driftSpeed !== 0) {
      let x = groupRef.current.position.x + driftSpeed * dt;
      // Wrap so clouds re-enter from the opposite side rather than drifting off.
      const span = driftWrap * 2;
      if (x > driftWrap) x -= span;
      else if (x < -driftWrap) x += span;
      groupRef.current.position.x = x;
    }
    if (!tintNight || !groupRef.current) return;
    const day = dayRef.current;
    const dim = THREE.MathUtils.clamp(day.sunIntensity / 1.7, 0.18, 1);
    groupRef.current.traverse((o) => {
      const mesh = o as THREE.Mesh;
      const mat = mesh.material as THREE.MeshLambertMaterial | THREE.MeshStandardMaterial | undefined;
      if (mat && (mat as THREE.MeshLambertMaterial).color) {
        // Lerp from the spec's authored white toward day's warm horizon, then dim.
        (mat as THREE.MeshLambertMaterial).color.copy(day.skyHorizon).lerp(new THREE.Color('#ffffff'), 0.55).multiplyScalar(dim);
      }
    });
  });
  // Memoize the Cloud JSX so re-renders of this component (which happen
  // whenever the parent re-renders, e.g. on every store update) don't hand
  // drei fresh element nodes — that's enough to make it recompute puffs even
  // with a stable seed.
  const cloudChildren = useMemo(
    () =>
      specs.map((s, i) => (
        <Cloud
          key={i}
          seed={s.seed}
          position={s.position}
          segments={s.segments}
          bounds={s.bounds}
          volume={s.volume}
          color={s.color}
          opacity={s.opacity}
          growth={s.growth}
          speed={s.speed}
        />
      )),
    [specs],
  );
  return (
    <group ref={groupRef}>
      <Clouds limit={limit} range={range}>
        {cloudChildren}
      </Clouds>
    </group>
  );
}

// ─── small util: drive a dayRef from an externally-supplied phase function ──

export function useDayPhaseDriver(
  dayRef: React.MutableRefObject<DayState>,
  getPhase: () => number,
  sampler: (phase: number, out: DayState) => void,
) {
  // Initialize once before first paint so nothing renders gray.
  useEffect(() => {
    sampler(getPhase(), dayRef.current);
  }, [dayRef, getPhase, sampler]);
  useFrame(() => {
    sampler(getPhase(), dayRef.current);
  });
}
