// ── Bantam — Krakatoa ──────────────────────────────────────────────────────
//
// Bespoke natural-feature POI. A smoking volcanic island far out in the Sunda
// Strait, NW corner of Bantam's local map. The cone *is* the island — there
// is no beach plateau, no foam ring, no perimeter boulders. The waterline is
// where the cone's lower flank dips below sea level, with multi-octave noise
// on the lower rings making the shoreline genuinely irregular and organic.
//
// Composition:
//   1. Custom BufferGeometry stratovolcano cone (~48 radial × 36 height
//      segments). Concave-up profile so the silhouette reads as a composite
//      cone, not a pure pyramid. Bottom rings extend below sea level.
//   2. Strong multi-octave radial erosion + 3 deep ravines on the lower flank
//      → no rotational symmetry, irregular coastline emerges naturally.
//   3. Vertex-color stratification: dark waterline, tropical forest band,
//      mid-altitude rock, ash, glowing rim.
//   4. Concave crater bowl (LatheGeometry) recessed into the rim.
//   5. Big, cartoony glowing lava lake — pulsing, bright, with inner hot
//      core, billboarded corona above the rim.
//   6. Three smoke columns (main + 2 fumaroles).
//   7. Two satellite peaks (Rakata-Danan-Perboewatan three-summit).
//   8. Sparse palm clumps on the lower forest band — no beach scatter.

import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { SEA_LEVEL } from '../../constants/world';

// ── Tuning ────────────────────────────────────────────────────────────────

const CONE_BASE_RADIUS = 62;       // cone is the island — wide base meets the water
const CONE_BASE_DEPTH = -8;        // submerge the lowest ring this far below sea level
const CONE_HEIGHT_ABOVE = 96;      // height *above* sea level
const CRATER_RIM_RADIUS = 9;
const CRATER_RIM_FALLOFF = 0.85;
const CRATER_BOWL_DEPTH = 14;
const CRATER_BOWL_RADIUS = 6.5;

const CONE_RADIAL_SEGS = 48;
const CONE_HEIGHT_SEGS = 36;

const MAIN_PUFF_COUNT = 14;
const FUMAROLE_PUFF_COUNT = 6;
const PUFF_LIFE = 4.2;

// ── Palette ────────────────────────────────────────────────────────────────

const COL_WATERLINE: readonly [number, number, number] = [0.16, 0.14, 0.16];
const COL_FOREST_LO: readonly [number, number, number] = [0.18, 0.32, 0.13];
const COL_FOREST_HI: readonly [number, number, number] = [0.24, 0.40, 0.18];
const COL_SCRUB:     readonly [number, number, number] = [0.32, 0.32, 0.22];
const COL_ROCK_LO:   readonly [number, number, number] = [0.34, 0.28, 0.22];
const COL_ROCK_HI:   readonly [number, number, number] = [0.42, 0.36, 0.28];
const COL_BASALT:    readonly [number, number, number] = [0.24, 0.20, 0.20];
const COL_ASH:       readonly [number, number, number] = [0.55, 0.50, 0.46];
const COL_RIM_HOT:   readonly [number, number, number] = [0.65, 0.32, 0.18];
const COL_CRATER:    readonly [number, number, number] = [0.20, 0.10, 0.08];

// ── Hash + RNG ─────────────────────────────────────────────────────────────

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6D2B79F5) >>> 0;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function valueNoise2D(x: number, y: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const h = (a: number, b: number) => {
    let h = (a * 374761393 + b * 668265263 + seed * 982451653) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    return ((h ^ (h >>> 16)) / 0xffffffff);
  };
  const a = h(ix, iy);
  const b = h(ix + 1, iy);
  const c = h(ix, iy + 1);
  const d = h(ix + 1, iy + 1);
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  return (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy;
}

// Two-octave radial noise — gives the shoreline a fractal feel rather than a
// single sinusoidal wobble.
function fbmRadial(theta: number, t: number, seed: number): number {
  const a = valueNoise2D(theta * 1.4, t * 4, seed);
  const b = valueNoise2D(theta * 3.2, t * 7, seed ^ 0x9c) * 0.5;
  const c = valueNoise2D(theta * 6.4, t * 11, seed ^ 0xab) * 0.25;
  return (a + b + c) / 1.75 - 0.5;        // centered around 0
}

function mix(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  t: number,
): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

// Stratification by normalized height (0=base/waterline, 1=summit/rim).
// No "beach" band — the cone goes from waterline straight into forest.
function colorAtHeight(t: number, jitter: number): [number, number, number] {
  let c: [number, number, number];
  if (t < 0.04) c = [...COL_WATERLINE];
  else if (t < 0.18) c = mix(COL_WATERLINE, COL_FOREST_LO, (t - 0.04) / 0.14);
  else if (t < 0.32) c = mix(COL_FOREST_LO, COL_FOREST_HI, (t - 0.18) / 0.14);
  else if (t < 0.48) c = mix(COL_FOREST_HI, COL_SCRUB, (t - 0.32) / 0.16);
  else if (t < 0.64) c = mix(COL_SCRUB, COL_ROCK_LO, (t - 0.48) / 0.16);
  else if (t < 0.78) c = mix(COL_ROCK_LO, COL_ROCK_HI, (t - 0.64) / 0.14);
  else if (t < 0.88) c = mix(COL_ROCK_HI, COL_BASALT, (t - 0.78) / 0.10);
  else if (t < 0.96) c = mix(COL_BASALT, COL_ASH, (t - 0.88) / 0.08);
  else c = mix(COL_ASH, COL_RIM_HOT, (t - 0.96) / 0.04);
  return [
    Math.max(0, Math.min(1, c[0] + (jitter - 0.5) * 0.07)),
    Math.max(0, Math.min(1, c[1] + (jitter - 0.5) * 0.07)),
    Math.max(0, Math.min(1, c[2] + (jitter - 0.5) * 0.07)),
  ];
}

// Build the cone. Lowest ring sits at CONE_BASE_DEPTH (below sea); top ring
// is at CONE_HEIGHT_ABOVE. The waterline is wherever the lower flank crosses
// y=0, and noise makes that line genuinely irregular.
function buildVolcanoGeometry(seed: number): THREE.BufferGeometry {
  const radSegs = CONE_RADIAL_SEGS;
  const hSegs = CONE_HEIGHT_SEGS;
  const totalHeight = CONE_HEIGHT_ABOVE - CONE_BASE_DEPTH;
  const vertCount = (hSegs + 1) * radSegs + 1;
  const positions = new Float32Array(vertCount * 3);
  const colors = new Float32Array(vertCount * 3);

  const rng = mulberry32(seed);
  // Three deep ravines plus a couple of asymmetric bays on the lower flank.
  const ravineAngles = [rng() * Math.PI * 2, rng() * Math.PI * 2, rng() * Math.PI * 2];
  const ravineWidth = 0.45;
  const ravineDepth = 0.16;

  for (let h = 0; h <= hSegs; h++) {
    const t = h / hSegs;            // 0 = submerged base, 1 = summit
    // Concave-up profile. tAbove = the height fraction *above* sea level
    // (clamped to ≥0); use it for color so submerged + waterline rings all
    // come out as "waterline" color, not green.
    const yWorld = CONE_BASE_DEPTH + t * totalHeight;
    const tAbove = Math.max(0, yWorld) / CONE_HEIGHT_ABOVE;
    const profileR = CRATER_RIM_RADIUS + (CONE_BASE_RADIUS - CRATER_RIM_RADIUS) * Math.pow(1 - t, 1.45);

    for (let a = 0; a < radSegs; a++) {
      const theta = (a / radSegs) * Math.PI * 2;

      // Radial displacement: stronger on the lower flank (where the
      // coastline lives), tapering to almost nothing at the summit.
      const lowerWeight = Math.pow(1 - t, 1.6);     // 1 at base, ~0 at summit
      const fbm = fbmRadial(theta, t, seed);
      const surfaceNoise = (valueNoise2D(theta * 8, t * 14, seed ^ 0xa1) - 0.5) * 0.05;
      // Coastline noise is hefty (up to ±22%) on the lower flank.
      let radialMul = 1 + fbm * (0.08 + 0.18 * lowerWeight) + surfaceNoise;

      // Deep ravines — only on lower 75% of cone, fade out toward summit.
      const ravineMask = Math.max(0, 1 - Math.pow(t / 0.75, 2));
      for (const ra of ravineAngles) {
        let dTheta = theta - ra;
        dTheta = ((dTheta + Math.PI) % (Math.PI * 2)) - Math.PI;
        if (Math.abs(dTheta) < ravineWidth) {
          const falloff = 0.5 + 0.5 * Math.cos((dTheta / ravineWidth) * Math.PI);
          radialMul -= ravineDepth * falloff * ravineMask;
        }
      }

      const r = Math.max(CRATER_RIM_RADIUS * 0.95, profileR * radialMul);
      const yJitter = (valueNoise2D(theta * 5, t * 8, seed ^ 0xc3) - 0.5) * 0.7;

      const idx = (h * radSegs + a) * 3;
      positions[idx] = Math.cos(theta) * r;
      positions[idx + 1] = yWorld + yJitter;
      positions[idx + 2] = Math.sin(theta) * r;

      const colJitter = valueNoise2D(theta * 3, t * 6, seed ^ 0x77);
      const c = colorAtHeight(tAbove, colJitter);
      colors[idx] = c[0];
      colors[idx + 1] = c[1];
      colors[idx + 2] = c[2];
    }
  }

  // Apex (caps the cone — the crater bowl mesh sits above this).
  const apexIdx = (hSegs + 1) * radSegs;
  positions[apexIdx * 3] = 0;
  positions[apexIdx * 3 + 1] = CONE_HEIGHT_ABOVE;
  positions[apexIdx * 3 + 2] = 0;
  const apexCol = colorAtHeight(1.0, 0.5);
  colors[apexIdx * 3] = apexCol[0];
  colors[apexIdx * 3 + 1] = apexCol[1];
  colors[apexIdx * 3 + 2] = apexCol[2];

  const indices: number[] = [];
  for (let h = 0; h < hSegs; h++) {
    for (let a = 0; a < radSegs; a++) {
      const aNext = (a + 1) % radSegs;
      const i00 = h * radSegs + a;
      const i01 = h * radSegs + aNext;
      const i10 = (h + 1) * radSegs + a;
      const i11 = (h + 1) * radSegs + aNext;
      indices.push(i00, i10, i01);
      indices.push(i01, i10, i11);
    }
  }
  for (let a = 0; a < radSegs; a++) {
    const aNext = (a + 1) % radSegs;
    const i0 = hSegs * radSegs + a;
    const i1 = hSegs * radSegs + aNext;
    indices.push(i0, apexIdx, i1);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

// Concave crater bowl with the rim slightly notched.
function buildCraterBowlGeometry(): THREE.BufferGeometry {
  const radSegs = 24;
  const points: THREE.Vector2[] = [];
  points.push(new THREE.Vector2(CRATER_RIM_RADIUS * CRATER_RIM_FALLOFF, 0));
  points.push(new THREE.Vector2(CRATER_RIM_RADIUS * 0.78, -CRATER_BOWL_DEPTH * 0.35));
  points.push(new THREE.Vector2(CRATER_BOWL_RADIUS, -CRATER_BOWL_DEPTH * 0.85));
  points.push(new THREE.Vector2(0.4, -CRATER_BOWL_DEPTH));
  const lathe = new THREE.LatheGeometry(points, radSegs);
  lathe.computeVertexNormals();
  return lathe;
}

// ── Component ──────────────────────────────────────────────────────────────

export function BantamKrakatoa({
  poiId,
  position,
  rotationY,
}: {
  poiId: string;
  position: readonly [number, number, number];
  rotationY: number;
}) {
  const seed = useMemo(() => hashStr(poiId), [poiId]);

  const coneGeo = useMemo(() => buildVolcanoGeometry(seed), [seed]);
  const craterGeo = useMemo(() => buildCraterBowlGeometry(), []);

  // Cartoony glow corona above the crater — billboarded plane, big.
  const coronaGeo = useMemo(() => new THREE.PlaneGeometry(CRATER_RIM_RADIUS * 7, CRATER_RIM_RADIUS * 7), []);
  const coronaTex = useMemo(() => {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0.0, 'rgba(255, 230, 150, 1.0)');
    grad.addColorStop(0.25, 'rgba(255, 150, 60, 0.78)');
    grad.addColorStop(0.55, 'rgba(240, 80, 30, 0.32)');
    grad.addColorStop(1.0, 'rgba(180, 30, 20, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, []);

  // Smoke seeds — same algorithm as splash <Volcano>, scaled up for size.
  const mainPuffSeeds = useMemo(
    () =>
      Array.from({ length: MAIN_PUFF_COUNT }, (_, i) => ({
        stagger: (i / MAIN_PUFF_COUNT) * PUFF_LIFE,
        driftX: Math.cos(i * 1.7 + 0.3) * 7,
        driftZ: Math.sin(i * 2.31 + 0.7) * 7,
        wobbleHz: 0.55 + (i % 3) * 0.12,
        sizeBias: 0.85 + (i % 4) * 0.1,
      })),
    [],
  );
  const fumarolePuffSeeds = useMemo(() => {
    const rng = mulberry32(seed ^ 0xfee1);
    return Array.from({ length: 2 }, (_, fi) => {
      const theta = rng() * Math.PI * 2;
      const heightFrac = 0.55 + rng() * 0.15;
      const r = CRATER_RIM_RADIUS + (CONE_BASE_RADIUS - CRATER_RIM_RADIUS) * Math.pow(1 - heightFrac, 1.45);
      const baseX = Math.cos(theta) * r * 1.01;
      const baseZ = Math.sin(theta) * r * 1.01;
      const baseY = heightFrac * CONE_HEIGHT_ABOVE;
      return {
        baseX, baseY, baseZ,
        puffs: Array.from({ length: FUMAROLE_PUFF_COUNT }, (_, i) => ({
          stagger: (i / FUMAROLE_PUFF_COUNT) * PUFF_LIFE * 0.9,
          driftX: Math.cos(i * 2.1 + fi * 0.8) * 2.5,
          driftZ: Math.sin(i * 2.7 + fi * 1.3) * 2.5,
          wobbleHz: 0.7 + (i % 2) * 0.2,
        })),
      };
    });
  }, [seed]);

  // Sparse palms on the lower forest band only — no beach scatter, since
  // there's no beach. ~12 clumps, deterministic.
  const palms = useMemo(() => {
    const rng = mulberry32(seed ^ 0xc0a5);
    const out: { x: number; y: number; z: number; tilt: number; height: number; rot: number }[] = [];
    const count = 12;
    for (let i = 0; i < count; i++) {
      // Pick a height fraction in the forest band (0.06..0.20 above sea).
      const tAbove = 0.06 + rng() * 0.14;
      const t = (tAbove * CONE_HEIGHT_ABOVE - CONE_BASE_DEPTH) / (CONE_HEIGHT_ABOVE - CONE_BASE_DEPTH);
      const profileR = CRATER_RIM_RADIUS + (CONE_BASE_RADIUS - CRATER_RIM_RADIUS) * Math.pow(1 - t, 1.45);
      const angle = rng() * Math.PI * 2;
      // Approximate the cone's noisy radius at this angle/height.
      const fbm = fbmRadial(angle, t, seed);
      const lowerWeight = Math.pow(1 - t, 1.6);
      const r = profileR * (1 + fbm * (0.08 + 0.18 * lowerWeight)) * 0.97;
      out.push({
        x: Math.cos(angle) * r,
        y: tAbove * CONE_HEIGHT_ABOVE,
        z: Math.sin(angle) * r,
        tilt: (rng() - 0.5) * 0.35,
        height: 3 + rng() * 2,
        rot: rng() * Math.PI * 2,
      });
    }
    return out;
  }, [seed]);

  // Two satellite peaks (Rakata-Danan-Perboewatan three-summit silhouette).
  const satPeaks = useMemo(() => {
    const peakA = {
      x: Math.cos(rotationY + 0.7) * CONE_BASE_RADIUS * 0.62,
      z: Math.sin(rotationY + 0.7) * CONE_BASE_RADIUS * 0.62,
      h: CONE_HEIGHT_ABOVE * 0.42,
      r: CONE_BASE_RADIUS * 0.30,
      twist: 0.4,
    };
    const peakB = {
      x: Math.cos(rotationY - 0.85) * CONE_BASE_RADIUS * 0.70,
      z: Math.sin(rotationY - 0.85) * CONE_BASE_RADIUS * 0.70,
      h: CONE_HEIGHT_ABOVE * 0.32,
      r: CONE_BASE_RADIUS * 0.26,
      twist: 1.2,
    };
    return { peakA, peakB };
  }, [rotationY]);

  // ── Refs for animated bits ──────────────────────────────────────────────
  const mainSmokeRef = useRef<THREE.Group>(null);
  const fumarole1Ref = useRef<THREE.Group>(null);
  const fumarole2Ref = useRef<THREE.Group>(null);
  const lavaPoolRef = useRef<THREE.MeshStandardMaterial>(null);
  const innerHotRef = useRef<THREE.MeshStandardMaterial>(null);
  const coronaRef = useRef<THREE.Mesh>(null);
  const rimGlowRef = useRef<THREE.MeshBasicMaterial>(null);

  useFrame((state) => {
    const time = state.clock.elapsedTime;

    if (mainSmokeRef.current) {
      mainSmokeRef.current.children.forEach((child, i) => {
        const sd = mainPuffSeeds[i];
        const t = ((time + sd.stagger) % PUFF_LIFE) / PUFF_LIFE;
        const lifeOpacity = 4 * t * (1 - t);
        const wobble = Math.sin(time * sd.wobbleHz + i) * 1.2 * t;
        child.position.set(
          sd.driftX * t + wobble,
          CONE_HEIGHT_ABOVE * 1.02 + t * (CONE_HEIGHT_ABOVE * 0.7),
          sd.driftZ * t,
        );
        const m = (child as THREE.Mesh).material as THREE.MeshStandardMaterial;
        m.opacity = lifeOpacity * 0.78;
        const scale = (2.4 + t * 8) * sd.sizeBias;
        child.scale.setScalar(scale);
      });
    }

    [fumarole1Ref, fumarole2Ref].forEach((ref, fi) => {
      if (!ref.current) return;
      const fum = fumarolePuffSeeds[fi];
      ref.current.children.forEach((child, i) => {
        const sd = fum.puffs[i];
        const t = ((time + sd.stagger) % (PUFF_LIFE * 0.9)) / (PUFF_LIFE * 0.9);
        const lifeOpacity = 4 * t * (1 - t);
        const wobble = Math.sin(time * sd.wobbleHz + i + fi) * 0.6 * t;
        child.position.set(
          sd.driftX * t + wobble,
          t * (CONE_HEIGHT_ABOVE * 0.25),
          sd.driftZ * t,
        );
        const m = (child as THREE.Mesh).material as THREE.MeshStandardMaterial;
        m.opacity = lifeOpacity * 0.55;
        const scale = 1.0 + t * 2.6;
        child.scale.setScalar(scale);
      });
    });

    // Cartoony, bright lava pulse — much stronger than before.
    if (lavaPoolRef.current) {
      const fast = Math.sin(time * 3) * 1.0;
      const slow = Math.sin(time * 0.7) * 0.4;
      lavaPoolRef.current.emissiveIntensity = 3.2 + fast + slow;
    }
    if (innerHotRef.current) {
      innerHotRef.current.emissiveIntensity = 4.4 + Math.sin(time * 2.1) * 0.8;
    }
    if (rimGlowRef.current) {
      rimGlowRef.current.opacity = 0.55 + Math.sin(time * 2.4) * 0.15;
    }
    if (coronaRef.current) {
      coronaRef.current.quaternion.copy(state.camera.quaternion);
      const m = coronaRef.current.material as THREE.MeshBasicMaterial;
      m.opacity = 0.78 + Math.sin(time * 1.6) * 0.18;
      const s = 1 + Math.sin(time * 1.2) * 0.06;
      coronaRef.current.scale.set(s, s, 1);
    }
  });

  const coneMat = useMemo(() => new THREE.MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    roughness: 1,
    metalness: 0,
  }), []);
  const craterInteriorMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: new THREE.Color(...COL_CRATER),
    flatShading: true,
    roughness: 1,
    side: THREE.BackSide,
    emissive: new THREE.Color(0.55, 0.18, 0.05),
    emissiveIntensity: 1.3,
    toneMapped: false,
  }), []);
  const palmTrunkMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: new THREE.Color(0.42, 0.32, 0.22),
    flatShading: true,
    roughness: 1,
  }), []);
  const palmFrondMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: new THREE.Color(0.22, 0.42, 0.18),
    flatShading: true,
    roughness: 1,
  }), []);
  const satPeakMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: new THREE.Color(0.30, 0.24, 0.20),
    flatShading: true,
    roughness: 1,
  }), []);
  const smokeMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#d8c8b0',
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    flatShading: true,
  }), []);
  const fumaroleSmokeMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#c8c0b8',
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
    flatShading: true,
  }), []);

  // Cone is positioned so y=0 in local space corresponds to sea level.
  // Group origin is at sea level, cone's lowest ring is at CONE_BASE_DEPTH
  // (below), highest at CONE_HEIGHT_ABOVE.
  const baseY = SEA_LEVEL;

  return (
    <group position={[position[0], baseY, position[2]]} rotation={[0, rotationY, 0]}>
      {/* ── Satellite peaks — placed before the main cone so their bases
              are partially occluded by the main flank, reading as adjacent
              summits rather than detached spikes. ──────────────────────── */}
      <mesh
        position={[satPeaks.peakA.x, satPeaks.peakA.h * 0.5, satPeaks.peakA.z]}
        rotation={[0, satPeaks.peakA.twist, 0]}
        material={satPeakMat}
      >
        <coneGeometry args={[satPeaks.peakA.r, satPeaks.peakA.h, 9]} />
      </mesh>
      <mesh
        position={[satPeaks.peakB.x, satPeaks.peakB.h * 0.5, satPeaks.peakB.z]}
        rotation={[0, satPeaks.peakB.twist, 0]}
        material={satPeakMat}
      >
        <coneGeometry args={[satPeaks.peakB.r, satPeaks.peakB.h, 9]} />
      </mesh>

      {/* ── Main volcanic cone — the island itself ──────────────────────── */}
      <mesh geometry={coneGeo} material={coneMat} />

      {/* ── Crater bowl (recessed interior) ─────────────────────────────── */}
      <mesh
        geometry={craterGeo}
        material={craterInteriorMat}
        position={[0, CONE_HEIGHT_ABOVE, 0]}
      />

      {/* ── Lava lake — bright, pulsing, cartoony ───────────────────────── */}
      <mesh position={[0, CONE_HEIGHT_ABOVE - CRATER_BOWL_DEPTH * 0.92, 0]}>
        <cylinderGeometry args={[CRATER_BOWL_RADIUS * 0.96, CRATER_BOWL_RADIUS * 0.72, 0.7, 24]} />
        <meshStandardMaterial
          ref={lavaPoolRef}
          color="#ff7a2c"
          emissive="#ff7a2c"
          emissiveIntensity={3.2}
          toneMapped={false}
        />
      </mesh>
      {/* Inner hot core — yellow-white, very bright */}
      <mesh position={[0, CONE_HEIGHT_ABOVE - CRATER_BOWL_DEPTH * 0.86, 0]}>
        <cylinderGeometry args={[CRATER_BOWL_RADIUS * 0.55, CRATER_BOWL_RADIUS * 0.4, 0.4, 18]} />
        <meshStandardMaterial
          ref={innerHotRef}
          color="#fff4c0"
          emissive="#ffd870"
          emissiveIntensity={4.4}
          toneMapped={false}
        />
      </mesh>

      {/* ── Rim glow ring — sits just above the crater rim, additive ────── */}
      <mesh position={[0, CONE_HEIGHT_ABOVE + 0.4, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[CRATER_RIM_RADIUS * 0.6, CRATER_RIM_RADIUS * 1.4, 32]} />
        <meshBasicMaterial
          ref={rimGlowRef}
          color="#ffb060"
          transparent
          opacity={0.6}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* ── Crater corona — billboarded soft halo, big and bright ───────── */}
      <mesh
        ref={coronaRef}
        geometry={coronaGeo}
        position={[0, CONE_HEIGHT_ABOVE + 4, 0]}
      >
        <meshBasicMaterial
          map={coronaTex}
          transparent
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
          opacity={0.85}
        />
      </mesh>

      {/* ── Sparse palm clumps on the lower forest band ─────────────────── */}
      {palms.map((p, i) => (
        <group key={`p${i}`} position={[p.x, p.y, p.z]} rotation={[0, p.rot, 0]}>
          <group rotation={[0, 0, p.tilt]}>
            <mesh material={palmTrunkMat} position={[0, p.height * 0.5, 0]}>
              <cylinderGeometry args={[0.18, 0.28, p.height, 5]} />
            </mesh>
            {Array.from({ length: 6 }).map((_, fi) => {
              const a = (fi / 6) * Math.PI * 2;
              return (
                <mesh
                  key={fi}
                  material={palmFrondMat}
                  position={[Math.cos(a) * 0.7, p.height + 0.1, Math.sin(a) * 0.7]}
                  rotation={[0.3, -a, 0.7]}
                >
                  <boxGeometry args={[1.6, 0.08, 0.45]} />
                </mesh>
              );
            })}
          </group>
        </group>
      ))}

      {/* ── Main smoke column ───────────────────────────────────────────── */}
      <group ref={mainSmokeRef}>
        {mainPuffSeeds.map((_, i) => (
          <mesh key={i} material={smokeMat}>
            <sphereGeometry args={[1, 8, 7]} />
          </mesh>
        ))}
      </group>

      {/* ── Fumarole vents on the upper flank ───────────────────────────── */}
      <group position={[fumarolePuffSeeds[0].baseX, fumarolePuffSeeds[0].baseY, fumarolePuffSeeds[0].baseZ]}>
        <group ref={fumarole1Ref}>
          {fumarolePuffSeeds[0].puffs.map((_, i) => (
            <mesh key={i} material={fumaroleSmokeMat}>
              <sphereGeometry args={[1, 6, 6]} />
            </mesh>
          ))}
        </group>
      </group>
      <group position={[fumarolePuffSeeds[1].baseX, fumarolePuffSeeds[1].baseY, fumarolePuffSeeds[1].baseZ]}>
        <group ref={fumarole2Ref}>
          {fumarolePuffSeeds[1].puffs.map((_, i) => (
            <mesh key={i} material={fumaroleSmokeMat}>
              <sphereGeometry args={[1, 6, 6]} />
            </mesh>
          ))}
        </group>
      </group>
    </group>
  );
}
