import { useRef, useMemo, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { SEA_LEVEL } from '../constants/world';
import { getActivePlayerPos } from '../utils/livePlayerTransform';
import { windUniforms } from '../utils/windSway';

const STREAK_COUNT = 500;
const STREAK_RADIUS = 55;
const STREAK_HEIGHT = 50;
const STREAK_SPEED = 34;
const STREAK_SLANT = 0.06;
const STREAK_WIDTH = 0.045;
const STREAK_LENGTH = 0.9;

const RIPPLE_COUNT = 160;
const RIPPLE_RADIUS = 30;
const RIPPLE_LIFETIME = 1.2;
const RIPPLE_SIZE = 0.9;
const RIPPLE_HEIGHT_OFFSET = 0.25;

function buildStreakGeometry(): THREE.InstancedBufferGeometry {
  const base = new THREE.PlaneGeometry(STREAK_WIDTH, STREAK_LENGTH);
  const geom = new THREE.InstancedBufferGeometry();
  geom.index = base.index;
  for (const key of Object.keys(base.attributes)) {
    geom.setAttribute(key, base.attributes[key as keyof typeof base.attributes]);
  }
  const offsets = new Float32Array(STREAK_COUNT * 3);
  const seeds = new Float32Array(STREAK_COUNT);
  for (let i = 0; i < STREAK_COUNT; i++) {
    offsets[i * 3 + 0] = (Math.random() * 2 - 1) * STREAK_RADIUS;
    offsets[i * 3 + 1] = Math.random() * STREAK_HEIGHT;
    offsets[i * 3 + 2] = (Math.random() * 2 - 1) * STREAK_RADIUS;
    seeds[i] = Math.random();
  }
  geom.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offsets, 3));
  geom.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
  geom.instanceCount = STREAK_COUNT;
  base.dispose();
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
  uniform float uTime;
  uniform float uHeight;
  uniform float uSpeed;
  uniform float uSlant;
  uniform vec2 uWindDir;
  varying float vAlpha;
  varying vec2 vUv;

  void main() {
    vec3 local = position;

    // Per-instance falling Y, wrapped within volume so drops loop forever.
    float yPos = mod(aOffset.y - uTime * uSpeed - aSeed * uHeight, uHeight) - uHeight * 0.5;
    vec3 worldOff = vec3(aOffset.x, yPos, aOffset.z);

    // Instance origin in world space (mesh tracks the camera each frame).
    vec3 instanceWorld = (modelMatrix * vec4(worldOff, 1.0)).xyz;

    // Y-axis billboard: 'right' faces the camera horizontally.
    vec3 toCam = cameraPosition - instanceWorld;
    vec2 fwdXZ = normalize(vec2(toCam.x, toCam.z) + vec2(1e-4, 0.0));
    vec3 rightWS = vec3(fwdXZ.y, 0.0, -fwdXZ.x);
    vec3 windWS = vec3(uWindDir.x, 0.0, uWindDir.y);

    vec3 vertexWS = instanceWorld
      + rightWS * local.x
      + vec3(0.0, local.y, 0.0)
      + windWS * (local.y * uSlant);

    gl_Position = projectionMatrix * viewMatrix * vec4(vertexWS, 1.0);

    float vNorm = (yPos / uHeight) + 0.5;
    vAlpha = smoothstep(0.0, 0.2, vNorm) * smoothstep(1.0, 0.8, vNorm);
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
    float a = vAlpha * edge * head * 0.16 * uIntensity;
    gl_FragColor = vec4(0.66, 0.74, 0.84, a);
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
    float ring = smoothstep(r - 0.035, r - 0.010, d) * (1.0 - smoothstep(r - 0.010, r + 0.025, d));
    float impact = smoothstep(0.04, 0.0, d) * smoothstep(0.12, 0.0, vPhase);
    float fade = 1.0 - vPhase;
    float a = (ring * fade + impact * 0.5) * 0.32 * uIntensity;
    gl_FragColor = vec4(0.92, 0.96, 1.0, a);
  }
`;

interface RainOverlayProps {
  /** 0..1 — fades both streaks and ripples; values <= 0 effectively hide. */
  intensity?: number;
}

export function RainOverlay({ intensity = 1 }: RainOverlayProps = {}) {
  const streakRef = useRef<THREE.Mesh>(null);
  const rippleRef = useRef<THREE.Mesh>(null);
  const { camera } = useThree();

  const streakGeom = useMemo(() => buildStreakGeometry(), []);
  const rippleGeom = useMemo(() => buildRippleGeometry(), []);

  const streakMat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uHeight: { value: STREAK_HEIGHT },
      uSpeed: { value: STREAK_SPEED },
      uSlant: { value: STREAK_SLANT },
      // Shared with vegetation/sway so streaks slant in the same direction the
      // trees bend. Magnitude scales with windSpeed via a separate uniform path
      // (kept here as a Vector2 ref to windUniforms.uWindDir).
      uWindDir: windUniforms.uWindDir,
      uIntensity: { value: intensity },
    },
    vertexShader: STREAK_VERTEX,
    fragmentShader: STREAK_FRAGMENT,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
  }), [intensity]);

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
    streakMat.uniforms.uTime.value += dt;
    rippleMat.uniforms.uTime.value += dt;
    // Live intensity so the parent can fade rain in/out without remounting.
    streakMat.uniforms.uIntensity.value = intensity;
    rippleMat.uniforms.uIntensity.value = intensity;
    // Slant grows with wind speed — calm rain falls nearly vertical, gusts lash.
    streakMat.uniforms.uSlant.value = STREAK_SLANT * (0.4 + windUniforms.uWindSpeed.value * 1.6);
    if (streakRef.current) {
      streakRef.current.position.copy(camera.position);
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
      <mesh ref={streakRef} frustumCulled={false} renderOrder={9}>
        <primitive object={streakGeom} attach="geometry" />
        <primitive object={streakMat} attach="material" />
      </mesh>
      <mesh ref={rippleRef} frustumCulled={false} renderOrder={8}>
        <primitive object={rippleGeom} attach="geometry" />
        <primitive object={rippleMat} attach="material" />
      </mesh>
    </>
  );
}
