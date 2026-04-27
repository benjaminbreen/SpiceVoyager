import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing';
import { motion } from 'framer-motion';
import * as THREE from 'three';
import { Info, Settings as SettingsIcon } from 'lucide-react';
import { type DayState, makeDayState, sampleDayPalette } from '../utils/dayPhase';
import { FACTION_SPAWN_WEIGHTS } from '../store/gameStore';
import { useIsMobile } from '../utils/useIsMobile';
import { sfxClick, sfxHover } from '../audio/SoundEffects';
import { SkyClouds, SkyDome, SkyLights } from './sky/SkyScene';

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
// Ship sits BELOW the camera-facing equator so the title space stays clean.
// Slight southerly bias keeps the ship visually centered while sitting in
// the strip of clear water just south of the lat-8/lon-90 island.
const SHIP_ANGLE = -0.18;
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
  >;
};

const LAND = '#5e9f4a';
const LAND_DARK = '#487a36';

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
  // distant island (will mostly be on the rim/back)
  { lat: 8, lon: 90, rx: 0.16, rz: 0.18, elevation: 0.022, color: LAND, rotation: -0.1,
    features: [{ kind: 'tree', u: 0.05, v: -0.1 }] },
  // far-side sliver to keep the back of the globe interesting
  { lat: -30, lon: 160, rx: 0.18, rz: 0.10, elevation: 0.018, color: LAND_DARK, rotation: 0.0 },
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

const _eulerScratch = new THREE.Euler();
const _matScratch = new THREE.Matrix4();
const _vecScratch = new THREE.Vector3();

function isClearAt(yaw: number, pitch: number): boolean {
  _eulerScratch.set(pitch, yaw, 0, 'XYZ');
  _matScratch.makeRotationFromEuler(_eulerScratch).invert();
  _vecScratch.copy(SHIP_ANCHOR).applyMatrix4(_matScratch).normalize();
  for (const cb of CONTINENT_BOUNDS) {
    if (_vecScratch.dot(cb.center) > cb.cosRadius) return false;
  }
  return true;
}

// ─── water shader (sphere) ───────────────────────────────────────────────────

const OCEAN_VERT = /* glsl */`
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  varying vec3 vViewDir;
  varying vec2 vUvA;
  varying vec2 vUvB;
  uniform float uTime;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vViewDir = normalize(cameraPosition - wp.xyz);
    float lat = asin(normal.y);
    float lon = atan(normal.z, normal.x);
    vUvA = vec2(lon * 0.7 + uTime * 0.020, lat * 0.7 + uTime * 0.014);
    vUvB = vec2(lon * 1.4 - uTime * 0.026, lat * 1.2 + uTime * 0.022) + vec2(0.37, 0.13);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;
const OCEAN_FRAG = /* glsl */`
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  varying vec3 vViewDir;
  varying vec2 vUvA;
  varying vec2 vUvB;
  uniform sampler2D uNormalMap;
  uniform vec3 uDeepColor;
  uniform vec3 uShallowColor;
  uniform vec3 uFoamColor;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform float uSunStrength;
  void main() {
    vec3 nA = texture2D(uNormalMap, vUvA).rgb * 2.0 - 1.0;
    vec3 nB = texture2D(uNormalMap, vUvB).rgb * 2.0 - 1.0;
    vec3 perturb = normalize(vWorldNormal + (nA * 0.22 + nB * 0.14));

    float fres = pow(1.0 - max(dot(vWorldNormal, vViewDir), 0.0), 2.6);
    vec3 col = mix(uDeepColor, uShallowColor, 0.20 + fres * 0.55);

    // Sun-side lambert shade so the ocean has clear day/night cheek-light.
    float lam = max(dot(vWorldNormal, uSunDir), 0.0);
    col *= 0.45 + lam * 0.85;

    vec3 reflectDir = reflect(-uSunDir, perturb);
    float spec = pow(max(dot(reflectDir, vViewDir), 0.0), 26.0);
    col += uSunColor * spec * uSunStrength;

    float crest = smoothstep(0.55, 0.85, (nA.x + nB.x) * 0.5 + 0.5);
    col = mix(col, uFoamColor, crest * 0.30 * (0.4 + lam * 0.6));

    col += uShallowColor * fres * 0.16;

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
      uSunDir: { value: new THREE.Vector3(0.5, 0.6, 0.7) },
      uSunColor: { value: new THREE.Color('#ffe9c4') },
      uSunStrength: { value: 0.85 },
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
  });

  return (
    <mesh>
      <sphereGeometry args={[GLOBE_RADIUS, 96, 64]} />
      <shaderMaterial ref={matRef} vertexShader={OCEAN_VERT} fragmentShader={OCEAN_FRAG} uniforms={uniforms} />
    </mesh>
  );
}

// ─── continent patches ───────────────────────────────────────────────────────

function ContinentPatch({ continent: c }: { continent: Continent }) {
  const { position, quaternion } = useMemo(() => {
    const normal = latLonToVec3(c.lat, c.lon, 1).normalize();
    const pos = normal.clone().multiplyScalar(GLOBE_RADIUS + c.elevation);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
    const yaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), c.rotation);
    q.multiply(yaw);
    return { position: pos, quaternion: q };
  }, [c]);

  const ellipseGeom = useMemo(() => {
    const shape = new THREE.Shape();
    const segs = 36;
    for (let i = 0; i <= segs; i++) {
      const t = (i / segs) * Math.PI * 2;
      const wob = 1 + 0.12 * Math.sin(t * 3 + c.lon) + 0.07 * Math.sin(t * 5 + c.lat);
      const rx = c.rx * wob;
      const rz = c.rz * wob;
      const x = Math.cos(t) * rx;
      const y = Math.sin(t) * rz;
      if (i === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    }
    return new THREE.ShapeGeometry(shape, 18);
  }, [c]);

  const beachGeom = useMemo(() => {
    const shape = new THREE.Shape();
    const segs = 36;
    for (let i = 0; i <= segs; i++) {
      const t = (i / segs) * Math.PI * 2;
      const wob = 1 + 0.12 * Math.sin(t * 3 + c.lon) + 0.07 * Math.sin(t * 5 + c.lat);
      const rx = c.rx * wob * 1.16;
      const rz = c.rz * wob * 1.16;
      const x = Math.cos(t) * rx;
      const y = Math.sin(t) * rz;
      if (i === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    }
    return new THREE.ShapeGeometry(shape, 12);
  }, [c]);

  return (
    <group position={position} quaternion={quaternion}>
      <mesh geometry={beachGeom} rotation={[-Math.PI / 2, 0, 0]} position={[0, -c.elevation + 0.005, 0]}>
        <meshStandardMaterial color="#e8d49a" roughness={0.95} />
      </mesh>
      <mesh geometry={ellipseGeom} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]}>
        <meshStandardMaterial color={c.color} roughness={0.85} />
      </mesh>
      {c.features?.map((f, i) => {
        const u = f.u * c.rx * GLOBE_RADIUS;
        const v = f.v * c.rz * GLOBE_RADIUS;
        if (f.kind === 'mountain') return <Mountain key={i} x={u} z={v} h={f.h} />;
        if (f.kind === 'volcano')  return <Volcano  key={i} x={u} z={v} h={f.h} />;
        if (f.kind === 'tree')     return <Tree     key={i} x={u} z={v} />;
        return null;
      })}
    </group>
  );
}

function Mountain({ x, z, h }: { x: number; z: number; h: number }) {
  return (
    <group position={[x, h / 2, z]}>
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

function Volcano({ x, z, h }: { x: number; z: number; h: number }) {
  const smokeRef = useRef<THREE.Group>(null);
  const lavaRef = useRef<THREE.MeshStandardMaterial>(null);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (smokeRef.current) {
      smokeRef.current.children.forEach((c, i) => {
        const phase = t * 0.5 + i * 0.7;
        c.position.y = (phase % 2) * 0.6 + h * 0.5;
        const mat = (c as THREE.Mesh).material as THREE.MeshStandardMaterial;
        mat.opacity = Math.max(0, 1 - (phase % 2) / 2) * 0.7;
        c.scale.setScalar(0.06 + (phase % 2) * 0.06);
      });
    }
    if (lavaRef.current) lavaRef.current.emissiveIntensity = 1.4 + Math.sin(t * 3) * 0.5;
  });
  return (
    <group position={[x, h / 2, z]}>
      <mesh>
        <coneGeometry args={[h * 0.85, h, 7]} />
        <meshStandardMaterial color="#5c3a2a" roughness={1} flatShading />
      </mesh>
      <mesh position={[0, h * 0.5, 0]}>
        <cylinderGeometry args={[h * 0.18, h * 0.22, h * 0.06, 8]} />
        <meshStandardMaterial ref={lavaRef} color="#ff6a2a" emissive="#ff6a2a" emissiveIntensity={1.6} toneMapped={false} />
      </mesh>
      <group ref={smokeRef}>
        {[0, 1, 2, 3].map((i) => (
          <mesh key={i}>
            <sphereGeometry args={[1, 6, 6]} />
            <meshStandardMaterial color="#d8c8b0" transparent opacity={0.5} depthWrite={false} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function Tree({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0.04, z]}>
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

// ─── ocean foam patches (rim sparkle) ────────────────────────────────────────

function FoamPatches() {
  const groupRef = useRef<THREE.Group>(null);
  const patches = useMemo(() => Array.from({ length: 18 }).map(() => ({
    lat: -55 + Math.random() * 110,
    lon: Math.random() * 360,
    scale: 0.05 + Math.random() * 0.07,
    phase: Math.random() * Math.PI * 2,
  })), []);
  useFrame((state) => {
    if (!groupRef.current) return;
    const t = state.clock.elapsedTime;
    groupRef.current.children.forEach((child, i) => {
      const p = patches[i];
      const breath = 0.55 + Math.sin(t * 1.3 + p.phase) * 0.45;
      const mesh = child as THREE.Mesh;
      const mat = mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.16 * breath;
    });
  });
  return (
    <group ref={groupRef}>
      {patches.map((p, i) => {
        const pos = latLonToVec3(p.lat, p.lon, GLOBE_RADIUS + 0.005);
        const normal = pos.clone().normalize();
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
        return (
          <mesh key={i} position={pos} quaternion={q} scale={p.scale}>
            <circleGeometry args={[1, 12]} />
            <meshBasicMaterial color="#fbf4e6" transparent opacity={0.16} depthWrite={false} />
          </mesh>
        );
      })}
    </group>
  );
}

// ─── globe ───────────────────────────────────────────────────────────────────

function Globe({
  rotationRef,
  dayRef,
}: {
  rotationRef: React.MutableRefObject<{ yaw: number; pitch: number }>;
  dayRef: React.MutableRefObject<DayState>;
}) {
  const groupRef = useRef<THREE.Group>(null);
  useFrame(() => {
    if (!groupRef.current) return;
    groupRef.current.rotation.y = rotationRef.current.yaw;
    groupRef.current.rotation.x = rotationRef.current.pitch;
  });
  return (
    <group ref={groupRef}>
      <OceanShell dayRef={dayRef} />
      <FoamPatches />
      {CONTINENTS.map((c, i) => <ContinentPatch key={i} continent={c} />)}
    </group>
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

function ShipSprite({
  heelRef,
  collisionRef,
  speedRef,
  dayRef,
}: {
  heelRef: React.MutableRefObject<number>;
  collisionRef: React.MutableRefObject<number>;
  speedRef: React.MutableRefObject<number>;
  dayRef: React.MutableRefObject<DayState>;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const innerRef = useRef<THREE.Group>(null);
  const matRef = useRef<THREE.MeshBasicMaterial>(null);
  const texture = useMemo(() => createShipTexture(), []);
  const { camera } = useThree();

  const surfaceNormal = useMemo(() => SHIP_ANCHOR.clone().normalize(), []);

  useFrame((state) => {
    if (!groupRef.current || !innerRef.current) return;
    const t = state.clock.elapsedTime;

    const bob = Math.sin(t * 2.2) * 0.005;
    const recoil = collisionRef.current * 0.025;
    // Lift well above the ocean shell to dodge z-fighting and keep the
    // sprite reading clearly against the water beneath it.
    groupRef.current.position
      .copy(SHIP_ANCHOR)
      .add(surfaceNormal.clone().multiplyScalar(0.05 + bob - recoil));

    // Billboard: copy camera quaternion (NOT lookAt — lookAt aims -Z at the
    // target, which leaves the plane's front face pointing AWAY).
    groupRef.current.quaternion.copy(camera.quaternion);

    // Heel from A/D + tactile shake on collision
    const collisionShake = collisionRef.current * Math.sin(t * 28) * 0.18;
    innerRef.current.rotation.z = heelRef.current + collisionShake;

    if (matRef.current) {
      const day = dayRef.current;
      // Keep tint in [0,1] so the texture isn't washed into a bloom halo.
      const warmth = THREE.MathUtils.clamp(0.6 + day.sunIntensity * 0.22, 0.5, 0.95);
      matRef.current.color.setRGB(
        Math.min(1, warmth + day.sunColor.r * 0.04),
        Math.min(1, warmth + day.sunColor.g * 0.03),
        Math.min(1, warmth * 0.95 + day.sunColor.b * 0.03)
      );
    }

  });

  return (
    <group ref={groupRef} renderOrder={10}>
      <group ref={innerRef}>
        {/* The ship sprite — about tree-sized */}
        <mesh renderOrder={11}>
          <planeGeometry args={[0.14, 0.14]} />
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

// ─── camera animation (lights now provided by SkyLights) ────────────────────

function CameraDrift() {
  const { camera } = useThree();
  useEffect(() => {
    camera.position.set(0, 0.4, 6.4);
    camera.lookAt(0, 0, 0);
  }, [camera]);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    camera.position.x = Math.sin(t * 0.07) * 0.14;
    camera.position.y = 0.4 + Math.sin(t * 0.05) * 0.05;
    camera.lookAt(0, 0, 0);
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
  rotationRef: React.MutableRefObject<{ yaw: number; pitch: number }>;
  heelRef: React.MutableRefObject<number>;
  speedRef: React.MutableRefObject<number>;
  collisionRef: React.MutableRefObject<number>;
  dayRef: React.MutableRefObject<DayState>;
  keys: React.MutableRefObject<{ w: boolean; a: boolean; s: boolean; d: boolean; shift: boolean }>;
}) {
  const dayPhase = useRef(0.20);
  useFrame((_, dt) => {
    const k = keys.current;
    const boost = k.shift ? 1.7 : 1;

    // Direct globe motion: A/D yaw, W/S pitch, plus a steady ambient yaw
    // drift so the world is never static.
    let dYaw = 0.04 * dt;          // ambient
    let dPitch = 0;
    // Ship heading accumulates with A/D — full continuous rotation, no snap-back.
    // Held A spins the bow CCW until released; Shift speeds the turn rate.
    const TURN_RATE = 1.4;          // rad/sec at 1× boost
    if (k.a) { dYaw += 0.85 * dt * boost; heelRef.current += TURN_RATE * dt * boost; }
    if (k.d) { dYaw -= 0.85 * dt * boost; heelRef.current -= TURN_RATE * dt * boost; }
    if (k.w) { dPitch += 0.55 * dt * boost; }
    if (k.s) { dPitch -= 0.55 * dt * boost; }

    const newYaw = rotationRef.current.yaw + dYaw;
    const newPitch = THREE.MathUtils.clamp(rotationRef.current.pitch + dPitch, -0.55, 0.55);

    // Collision: try full motion → slide on yaw → slide on pitch → block
    if (isClearAt(newYaw, newPitch)) {
      rotationRef.current.yaw = newYaw;
      rotationRef.current.pitch = newPitch;
    } else if (isClearAt(newYaw, rotationRef.current.pitch)) {
      rotationRef.current.yaw = newYaw;
      collisionRef.current = Math.min(1, collisionRef.current + 0.5);
    } else if (isClearAt(rotationRef.current.yaw, newPitch)) {
      rotationRef.current.pitch = newPitch;
      collisionRef.current = Math.min(1, collisionRef.current + 0.5);
    } else {
      collisionRef.current = 1;
    }

    // Pitch decays back toward 0 when no W/S held (so view recenters)
    if (!k.w && !k.s) rotationRef.current.pitch *= 1 - 0.6 * dt;

    // (heelRef is now the accumulated ship heading angle — driven above by A/D)

    // Speed proxy for wake — magnitude of input, not a separate physics value
    const inputMag = (k.w ? 1 : 0) + (k.s ? 0.3 : 0) + (k.a || k.d ? 0.4 : 0);
    speedRef.current += (inputMag * boost - speedRef.current) * Math.min(1, dt * 3);

    collisionRef.current = Math.max(0, collisionRef.current - dt * 1.6);

    // Day phase cycle (60s, 4× under Shift)
    dayPhase.current = (dayPhase.current + dt / 60 * (k.shift ? 4 : 1)) % 1;
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
const FACTION_KEY_TO_NATIONALITY: Record<FactionKey, string | null> = {
  english: 'English',
  dutch: 'Dutch',
  portuguese: 'Portuguese',
  spanish: 'Spanish',
  venetian: 'Venetian',
  omani: 'Omani',          // surfaced as "Arab" in the UI
  gujarati: 'Gujarati',
  chinese: 'Chinese',
  random: null,            // any port
  pirate: null,            // pirates start anywhere
};

/** Ordered list of port IDs available to a faction, weight-descending. We
 *  return ALL spawn ports (icon or no icon) so the cycle is faithful to the
 *  spawn data — ports without icons fall back to random.png visually until
 *  their /icons/ports/{id}.png is added. */
function portsForFaction(factionKey: FactionKey): string[] {
  const nationality = FACTION_KEY_TO_NATIONALITY[factionKey];
  if (nationality) {
    const weights = FACTION_SPAWN_WEIGHTS[nationality as keyof typeof FACTION_SPAWN_WEIGHTS];
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
        color: 'rgba(255, 248, 232, 0.78)',
        letterSpacing: '0.02em',
        pointerEvents: 'none',
        textShadow: '0 1px 4px rgba(0,0,0,0.55)',
      }}
    >
      <motion.div
        key={i}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.6 }}
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
    <button
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
    </button>
  );
}

// ─── main exported component ─────────────────────────────────────────────────

export function ClaudeSplashGlobe(props: Props) {
  const { ready, loadingMessage, loadingProgress, onStart } = props;
  const { isMobile } = useIsMobile();

  useEffect(() => { injectFonts(); }, []);

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
  const rotationRef = useRef({ yaw: 0, pitch: 0 });
  const heelRef = useRef(0);
  const speedRef = useRef(0);
  const collisionRef = useRef(0);
  const dayRef = useRef<DayState>(makeDayState());
  // Initialize palette once before first frame so things don't render gray.
  useMemo(() => sampleDayPalette(0.20, dayRef.current), []);

  const handleEnter = () => { if (ready) onStart(); };
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
        inset: 0,
        zIndex: 60,
        overflow: 'hidden',
        pointerEvents: 'auto',
        background: '#04050a',
      }}
    >
      <div style={{ position: 'absolute', inset: 0 }}>
        <Canvas
          camera={{ fov: 28, position: [0, 0.4, 6.4] }}
          dpr={[1, 1.8]}
          gl={{ antialias: true, alpha: false, toneMapping: THREE.ACESFilmicToneMapping }}
        >
          <CameraDrift />
          {/* Day/night-driven sky gradient + lights. We deliberately omit
              Sun/NightStars/CrepuscularRays for a cleaner read. */}
          <SkyDome dayRef={dayRef} />
          <SkyLights dayRef={dayRef} />

          <GlobeDriver
            rotationRef={rotationRef}
            heelRef={heelRef}
            speedRef={speedRef}
            collisionRef={collisionRef}
            dayRef={dayRef}
            keys={keys}
          />
          <Globe rotationRef={rotationRef} dayRef={dayRef} />

          <SkyClouds dayRef={dayRef} tintNight={false} />

          <ShipSprite
            heelRef={heelRef}
            collisionRef={collisionRef}
            speedRef={speedRef}
            dayRef={dayRef}
          />

          <EffectComposer multisampling={0}>
            <Bloom intensity={0.85} luminanceThreshold={0.55} luminanceSmoothing={0.35} mipmapBlur />
            <Vignette eskil={false} offset={0.18} darkness={0.55} />
          </EffectComposer>
        </Canvas>
      </div>

      {/* HTML overlay UI */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: isMobile ? '64px 12px 64px' : '52px 24px 92px',
          pointerEvents: 'none',
        }}
      >
        {/* Title block — ASCII title (matches Opening.tsx) + elegant subtitle */}
        <div style={{ textAlign: 'center', pointerEvents: 'none' }}>
          <div
            style={{
              display: 'inline-block',
              padding: 'clamp(14px, 2.8vw, 24px) clamp(20px, 3.8vw, 36px)',
              background:
                'radial-gradient(ellipse at center, rgba(10,8,4,0.78) 0%, rgba(8,6,3,0.62) 60%, rgba(6,4,2,0.42) 100%)',
              border: '1px solid rgba(201,168,76,0.42)',
              borderRadius: 4,
              position: 'relative',
              boxShadow: `
                0 0 0 1px rgba(201,168,76,0.14) inset,
                0 22px 70px rgba(10,5,0,0.65),
                0 0 24px rgba(201,168,76,0.08) inset
              `,
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
{`╔═╗  ╔═╗  ╦  ╔═╗  ╔═╗
╚═╗  ╠═╝  ║  ║    ╠═ 
╚═╝  ╩    ╩  ╚═╝  ╚═╝`}
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
          </div>
          <div
            style={{
              fontFamily: SUBTITLE_FN,
              fontStyle: 'italic',
              fontSize: 'clamp(15px, 1.7vw, 21px)',
              color: 'rgba(255,248,232,0.92)',
              letterSpacing: '0.04em',
              marginTop: 18,
              textShadow: '0 1px 4px rgba(20,10,0,0.55)',
              fontWeight: 500,
            }}
          >
            A historical spice and drug trading game set in 1612
          </div>
        </div>

        {/* Bottom dock — picker cards above, wide SET SAIL bar below.
            Stacks the same way on desktop and mobile; only sizing changes. */}
        <div
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
          <div style={{
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
          </div>
          <BeginButton
            ready={ready}
            loadingMessage={loadingMessage}
            loadingProgress={loadingProgress}
            compact={isMobile}
            onClick={handleEnter}
          />
        </div>
      </div>

      {/* Top-left: controls hint (hidden on mobile — touch users tap the dock) */}
      {!isMobile && (
        <div
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
        </div>
      )}
      {/* Top-right: Settings + About icon buttons */}
      <div
        style={{
          position: 'absolute',
          top: 16,
          right: 18,
          display: 'flex',
          gap: 10,
          pointerEvents: 'auto',
        }}
      >
        <CornerIconButton label="About" onClick={openAbout}>
          <Info size={18} strokeWidth={2.2} />
        </CornerIconButton>
        <CornerIconButton label="Settings" onClick={openSettings}>
          <SettingsIcon size={18} strokeWidth={2.2} />
        </CornerIconButton>
      </div>

      <Ticker />

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

  const baseShadow = `0 0 0 1px ${BTN_GOLD}22 inset, 0 0 12px ${BTN_GOLD}22, 0 2px 10px rgba(0,0,0,0.5)`;
  const litShadow = `0 0 0 1px ${BTN_GOLD}3a inset, 0 0 22px ${BTN_GOLD}44, 0 2px 10px rgba(0,0,0,0.5)`;
  const hoverShadow = `0 0 0 1px ${BTN_GOLD}66 inset, 0 0 30px ${BTN_GOLD}66, 0 4px 14px rgba(0,0,0,0.6)`;
  const disabledShadow = `0 0 0 1px ${BTN_DIM_GOLD}22 inset, 0 2px 8px rgba(0,0,0,0.4)`;

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
        border: `1px solid ${BTN_DIM_GOLD}`,
        borderRadius: 3,
        cursor: ready ? 'pointer' : 'wait',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: compact ? 12 : 16,
        transition: 'color 200ms ease, background 200ms ease',
      }}
    >
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
          <span style={{ paddingTop: 1 }}>Set&nbsp;Sail</span>
          {!compact && (
            <span
              style={{
                position: 'absolute',
                right: 18,
                fontFamily: MONO,
                fontSize: 10,
                fontWeight: 500,
                letterSpacing: '0.28em',
                color: hover ? `${BTN_BRIGHT}99` : `${BTN_DIM_GOLD}cc`,
                transition: 'color 200ms ease',
              }}
            >
              ↵ Enter
            </span>
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
          {!compact && loadingMessage && (
            <span
              style={{
                position: 'absolute',
                right: 18,
                fontFamily: CARD_LABEL_FONT,
                fontStyle: 'italic',
                fontSize: 12,
                fontWeight: 500,
                letterSpacing: '0.01em',
                textTransform: 'none',
                color: 'rgba(245,236,214,0.55)',
                maxWidth: 240,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {loadingMessage}
            </span>
          )}
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
