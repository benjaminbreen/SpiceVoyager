import { useRef, useMemo, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { SEA_LEVEL } from '../constants/world';
import { getActivePlayerPos } from '../utils/livePlayerTransform';
import { windUniforms } from '../utils/windSway';

const STREAK_COUNT = 380;
const STREAK_RADIUS = 55;
const STREAK_HEIGHT = 50;
const STREAK_SPEED = 22;
const STREAK_SLANT = 0.05;
const STREAK_LENGTH = 3.8;

const RIPPLE_COUNT = 220;
const RIPPLE_RADIUS = 34;
const RIPPLE_LIFETIME = 1.35;
const RIPPLE_SIZE = 1.25;
const RIPPLE_HEIGHT_OFFSET = 0.25;

function buildStreakGeometry(): THREE.BufferGeometry {
  const geom = new THREE.BufferGeometry();
  const positions = new Float32Array(STREAK_COUNT * 2 * 3);
  const offsets = new Float32Array(STREAK_COUNT * 3);
  const seeds = new Float32Array(STREAK_COUNT);
  for (let i = 0; i < STREAK_COUNT; i++) {
    offsets[i * 3 + 0] = (Math.random() * 2 - 1) * STREAK_RADIUS;
    offsets[i * 3 + 1] = Math.random() * STREAK_HEIGHT;
    offsets[i * 3 + 2] = (Math.random() * 2 - 1) * STREAK_RADIUS;
    seeds[i] = Math.random();
  }
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geom.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offsets, 3));
  geom.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
  return geom;
}

function buildRippleGeometry(): THREE.InstancedBufferGeometry {
  const base = new THREE.PlaneGeometry(RIPPLE_SIZE, RIPPLE_SIZE);
  // Bake the horizontal orientation into the geometry so vertices lie in XZ.
  // Avoids the mesh-rotation pitfall where instance offsets in (X,0,Z) get
  // remapped onto the world Y axis.
  base.rotateX(-Math.PI / 2);
  const geom = new THREE.InstancedBufferGeometry();
  geom.index = base.index;
  for (const key of Object.keys(base.attributes)) {
    geom.setAttribute(key, base.attributes[key as keyof typeof base.attributes]);
  }
  const offsets = new Float32Array(RIPPLE_COUNT * 3);
  const seeds = new Float32Array(RIPPLE_COUNT);
  for (let i = 0; i < RIPPLE_COUNT; i++) {
    const angle = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * RIPPLE_RADIUS;
    offsets[i * 3 + 0] = Math.cos(angle) * r;
    offsets[i * 3 + 1] = 0;
    offsets[i * 3 + 2] = Math.sin(angle) * r;
    seeds[i] = Math.random();
  }
  geom.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offsets, 3));
  geom.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
  geom.instanceCount = RIPPLE_COUNT;
  base.dispose();
  return geom;
}

const STREAK_VERTEX = /* glsl */ `
  attribute vec3 aOffset;
  attribute float aSeed;
  attribute float aScale;
  uniform float uTime;
  uniform float uHeight;
  uniform float uSpeed;
  uniform float uSlant;
  uniform float uIntensity;
  uniform vec2 uWindDir;
  uniform vec3 uCameraRight;
  uniform vec3 uCameraUp;
  varying float vAlpha;
  varying vec2 vUv;

  void main() {
    vec3 local = position;

    // Length jitter per instance — wider variance reads as motion-blurred depth.
    // Width jitter is a milder sqrt so far drops aren't visibly wider than near ones.
    local.y *= aScale;
    local.x *= mix(0.85, 1.15, aSeed);

    // Intensity-gated culling — drizzle is genuinely sparse, downpour fills the
    // volume. Push culled instances behind the near plane via NaN-safe scale.
    // Threshold maps so intensity=0.2 spawns ~40% of streaks, intensity=1 all.
    float visible = step(aSeed, uIntensity * 1.2 + 0.2);

    // Per-instance falling Y, wrapped within volume so drops loop forever.
    float yPos = mod(aOffset.y - uTime * uSpeed - aSeed * uHeight, uHeight) - uHeight * 0.5;
    vec3 worldOff = vec3(aOffset.x, yPos, aOffset.z);

    // Instance origin in world space (mesh tracks the camera each frame).
    vec3 instanceWorld = (modelMatrix * vec4(worldOff, 1.0)).xyz;

    vec3 windWS = vec3(uWindDir.x, 0.0, uWindDir.y);

    vec3 vertexWS = instanceWorld
      + uCameraRight * local.x
      + uCameraUp * local.y
      + windWS * (local.y * uSlant);

    gl_Position = projectionMatrix * viewMatrix * vec4(vertexWS, 1.0);

    float vNorm = (yPos / uHeight) + 0.5;
    vAlpha = smoothstep(0.0, 0.2, vNorm) * smoothstep(1.0, 0.8, vNorm) * visible;
    vUv = uv;
  }
`;

const STREAK_FRAGMENT = /* glsl */ `
  precision mediump float;
  uniform float uIntensity;
  varying float vAlpha;
  varying vec2 vUv;
  void main() {
    // Soft falloff across width — no hard pixel edges, so each streak reads as
    // a motion-blurred trail rather than a solid sliver.
    float edge = 1.0 - smoothstep(0.0, 0.5, abs(vUv.x - 0.5));
    edge = pow(edge, 1.6);
    // Brighter at the leading (bottom) end, fades along the length so the
    // trail dissolves into the air rather than ending in a solid bar.
    float head = smoothstep(0.0, 0.55, vUv.y) * (0.55 + 0.45 * vUv.y);
    float a = vAlpha * edge * head * 3.5 * uIntensity;
    gl_FragColor = vec4(0.98, 1.0, 1.0, a);
  }
`;

const RIPPLE_VERTEX = /* glsl */ `
  attribute vec3 aOffset;
  attribute float aSeed;
  uniform float uTime;
  uniform float uLifetime;
  uniform float uDiscScale;
  varying vec2 vUv;
  varying float vPhase;
  void main() {
    vPhase = fract((uTime + aSeed * uLifetime * 4.0) / uLifetime);
    // Scale only the per-instance spread, not the quad itself, so the disc
    // expands at zoomed-out views while each ripple stays raindrop-sized.
    vec3 finalLocal = position + aOffset * uDiscScale;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(finalLocal, 1.0);
    vUv = uv;
  }
`;

const RIPPLE_FRAGMENT = /* glsl */ `
  precision mediump float;
  uniform float uIntensity;
  varying vec2 vUv;
  varying float vPhase;
  void main() {
    vec2 c = vUv - vec2(0.5);
    float d = length(c);
    float r = vPhase * 0.42;
    float ring = smoothstep(r - 0.045, r - 0.012, d) * (1.0 - smoothstep(r - 0.012, r + 0.035, d));
    float impact = smoothstep(0.055, 0.0, d) * smoothstep(0.14, 0.0, vPhase);
    float fade = 1.0 - vPhase;
    float a = (ring * fade + impact * 0.6) * 0.48 * uIntensity;
    gl_FragColor = vec4(0.92, 0.96, 1.0, a);
  }
`;

interface RainOverlayProps {
  /** 0..1 — fades both streaks and ripples; values <= 0 effectively hide. */
  intensity?: number;
}

export function RainOverlay({ intensity = 1 }: RainOverlayProps = {}) {
  const streakRef = useRef<THREE.LineSegments>(null);
  const rippleRef = useRef<THREE.Mesh>(null);
  const { camera } = useThree();

  const streakGeom = useMemo(() => buildStreakGeometry(), []);
  const rippleGeom = useMemo(() => buildRippleGeometry(), []);

  const streakMat = useMemo(() => new THREE.LineBasicMaterial({
    color: new THREE.Color(0.74, 0.88, 0.96),
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
    depthTest: false,
  }), []);

  const rippleMat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uLifetime: { value: RIPPLE_LIFETIME },
      uDiscScale: { value: 1.0 },
      uIntensity: { value: intensity },
    },
    vertexShader: RIPPLE_VERTEX,
    fragmentShader: RIPPLE_FRAGMENT,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
  }), [intensity]);

  useEffect(() => () => {
    streakGeom.dispose();
    rippleGeom.dispose();
    streakMat.dispose();
    rippleMat.dispose();
  }, [streakGeom, rippleGeom, streakMat, rippleMat]);

  useFrame((_state, delta) => {
    const dt = Math.min(delta, 0.1);
    rippleMat.uniforms.uTime.value += dt;
    streakMat.opacity = Math.min(0.2, Math.max(0.04, intensity * 0.16));
    rippleMat.uniforms.uIntensity.value = intensity;
    if (streakRef.current) {
      streakRef.current.position.copy(camera.position);
      streakRef.current.quaternion.copy(camera.quaternion);
      const position = streakGeom.getAttribute('position') as THREE.BufferAttribute;
      const offsets = streakGeom.getAttribute('aOffset') as THREE.BufferAttribute;
      const seeds = streakGeom.getAttribute('aSeed') as THREE.BufferAttribute;
      const arr = position.array as Float32Array;
      const slant = STREAK_SLANT * (0.5 + windUniforms.uWindSpeed.value);
      const elapsed = _state.clock.elapsedTime;
      for (let i = 0; i < STREAK_COUNT; i++) {
        const ox = offsets.getX(i);
        const oy = offsets.getY(i);
        const oz = offsets.getZ(i);
        const seed = seeds.getX(i);
        const y = ((oy - elapsed * STREAK_SPEED - seed * STREAK_HEIGHT) % STREAK_HEIGHT + STREAK_HEIGHT) % STREAK_HEIGHT - STREAK_HEIGHT * 0.5;
        const len = STREAK_LENGTH * (0.8 + seed * 0.8);
        const head = i * 6;
        const leanX = len * slant;
        arr[head + 0] = ox + leanX;
        arr[head + 1] = y + len * 0.45;
        arr[head + 2] = -Math.abs(oz) - 8;
        arr[head + 3] = ox - leanX;
        arr[head + 4] = y - len * 0.55;
        arr[head + 5] = -Math.abs(oz) - 8;
      }
      position.needsUpdate = true;
    }
    if (rippleRef.current) {
      const player = getActivePlayerPos();
      rippleRef.current.position.set(player[0], SEA_LEVEL + RIPPLE_HEIGHT_OFFSET, player[2]);
      // Spread the disc with camera-to-target distance via a shader uniform —
      // this scales only the per-instance offsets, leaving each ripple at its
      // seeded size so they read as small raindrop ripples at any zoom.
      const dx = camera.position.x - player[0];
      const dy = camera.position.y - player[1];
      const dz = camera.position.z - player[2];
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      rippleMat.uniforms.uDiscScale.value = Math.min(3.5, Math.max(1.0, dist / 30));
    }
  });

  return (
    <>
      <lineSegments ref={streakRef} frustumCulled={false} renderOrder={9}>
        <primitive object={streakGeom} attach="geometry" />
        <primitive object={streakMat} attach="material" />
      </lineSegments>
      <mesh ref={rippleRef} frustumCulled={false} renderOrder={8}>
        <primitive object={rippleGeom} attach="geometry" />
        <primitive object={rippleMat} attach="material" />
      </mesh>
    </>
  );
}
