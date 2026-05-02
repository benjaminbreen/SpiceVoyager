// ── Bespoke POI atmosphere kit ─────────────────────────────────────────────
//
// Shared primitives for the eight Phase-3 bespoke POIs. All animation runs
// off a single `useFrame` per primitive, time-of-day driven from the game
// store. Materials come from `chunkyMaterial(...)` so the same beige stone
// is one GPU material across every POI.
//
// What's here:
//   - useNightFactor()       : 0..1 ramp from the existing sun-angle math
//   - <POITorchInstancer>    : aggregated flickering torch flames + halos
//                              + optional PointLights (budget-capped)
//   - <ChimneySmoke>          : low-poly puff stack rising from a roof vent
//   - <StoneHut>              : single-room chunky stone hut + thatch
//   - <BoundaryWall>          : segmented low stone wall around a center
//   - <ChunkyDateePalm>       : reusable palm tree silhouette
//
// Perf notes:
//   - Torches use InstancedMesh; ≤6 PointLights total across all POIs.
//   - Smoke is small per-POI. Three small puffs per chimney = cheap.
//   - All MeshStandardMaterial allocations go through chunkyMaterial.

import { useMemo, useRef, useEffect } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useGameStore } from '../../store/gameStore';

// ── Shared material cache ──────────────────────────────────────────────────
//
// Mirror of POIArchetypes.tsx's chunkyMaterial — kept local so this kit is
// self-contained. Future cleanup: lift to a shared materials.ts module.

interface MatOpts {
  opacity?: number;
  metalness?: number;
  roughness?: number;
  emissive?: readonly [number, number, number];
  emissiveIntensity?: number;
}

const matCache = new Map<string, THREE.MeshStandardMaterial>();

export function chunkyMat(rgb: readonly [number, number, number], opts: MatOpts = {}): THREE.MeshStandardMaterial {
  const r = Math.round(rgb[0] * 255);
  const g = Math.round(rgb[1] * 255);
  const b = Math.round(rgb[2] * 255);
  const op = opts.opacity ?? 1;
  const m = opts.metalness ?? 0;
  const ro = opts.roughness ?? 0.95;
  const er = opts.emissive ? Math.round(opts.emissive[0] * 255) : 0;
  const eg = opts.emissive ? Math.round(opts.emissive[1] * 255) : 0;
  const eb = opts.emissive ? Math.round(opts.emissive[2] * 255) : 0;
  const ei = Math.round((opts.emissiveIntensity ?? 0) * 100);
  const key = `${r}_${g}_${b}_${Math.round(op * 100)}_${Math.round(m * 100)}_${Math.round(ro * 100)}_${er}_${eg}_${eb}_${ei}`;
  const cached = matCache.get(key);
  if (cached) return cached;
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(rgb[0], rgb[1], rgb[2]),
    flatShading: true,
    roughness: ro,
    metalness: m,
    transparent: op < 1,
    opacity: op,
    emissive: opts.emissive ? new THREE.Color(opts.emissive[0], opts.emissive[1], opts.emissive[2]) : undefined,
    emissiveIntensity: opts.emissiveIntensity ?? 0,
  });
  matCache.set(key, mat);
  return mat;
}

// ── Night factor ───────────────────────────────────────────────────────────
//
// Mirrors the formula used by CityTorches in city/renderers/CityEffects.tsx. Reads the
// store directly so the consumer can call this from inside useFrame without
// re-subscribing the React tree on every tick.

export function getNightFactor(timeOfDay: number): number {
  const sunAngle = ((timeOfDay - 6) / 24) * Math.PI * 2;
  const sunH = Math.sin(sunAngle);
  return Math.max(0, Math.min(1, (0.1 - sunH) / 0.3));
}

// ── Torches ────────────────────────────────────────────────────────────────
//
// One InstancedMesh for flame spheres, one for ground-glow halos, both
// shared across every bespoke POI. PointLights are budget-capped to the
// first N positions so a long row of torches doesn't blow the WebGL light
// budget. Per-instance phase offsets (hashed off index) keep flickers
// independent.

export interface POITorchSpot {
  pos: readonly [number, number, number];
  /** Tints the flame for cooler vs warmer braziers. Default warm orange. */
  warmth?: 'warm' | 'cool';
}

const TORCH_LIGHT_BUDGET = 4;

export function POITorchInstancer({ spots }: { spots: POITorchSpot[] }) {
  const flameRef = useRef<THREE.InstancedMesh>(null);
  const haloRef = useRef<THREE.InstancedMesh>(null);
  const lightsRef = useRef<(THREE.PointLight | null)[]>([]);

  const flameGeo = useMemo(() => new THREE.SphereGeometry(1, 6, 6), []);
  const flameMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#ff7a22',
    emissive: '#ffb056',
    emissiveIntensity: 0,
    toneMapped: false,
    transparent: true,
    opacity: 0,
    flatShading: true,
  }), []);

  const haloGeo = useMemo(() => {
    const g = new THREE.PlaneGeometry(1, 1);
    g.rotateX(-Math.PI / 2);
    return g;
  }, []);
  const haloTex = useMemo(() => {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0.0, 'rgba(255, 200, 130, 1.0)');
    grad.addColorStop(0.35, 'rgba(255, 150, 70, 0.45)');
    grad.addColorStop(1.0, 'rgba(255, 100, 40, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, []);
  const haloMat = useMemo(() => new THREE.MeshBasicMaterial({
    map: haloTex,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    opacity: 0,
  }), [haloTex]);

  const phaseOffsets = useMemo(
    () => spots.map((_, i) => {
      const h = ((i + 7) * 2654435761) >>> 0;
      return (h / 0xffffffff) * Math.PI * 2;
    }),
    [spots],
  );
  const dummyRef = useRef(new THREE.Object3D());

  // Position flame + halo instances (static; only the per-frame scale wobbles).
  useEffect(() => {
    if (!flameRef.current || spots.length === 0) return;
    const dummy = dummyRef.current;
    spots.forEach((s, i) => {
      dummy.position.set(s.pos[0], s.pos[1], s.pos[2]);
      dummy.scale.set(0.22, 0.34, 0.22);
      dummy.updateMatrix();
      flameRef.current!.setMatrixAt(i, dummy.matrix);
    });
    flameRef.current.instanceMatrix.needsUpdate = true;
  }, [spots]);

  useEffect(() => {
    if (!haloRef.current || spots.length === 0) return;
    const dummy = dummyRef.current;
    spots.forEach((s, i) => {
      dummy.position.set(s.pos[0], s.pos[1] + 0.04, s.pos[2]);
      dummy.scale.set(2.4, 2.4, 2.4);
      dummy.updateMatrix();
      haloRef.current!.setMatrixAt(i, dummy.matrix);
    });
    haloRef.current.instanceMatrix.needsUpdate = true;
  }, [spots]);

  useFrame(({ clock }) => {
    const timeOfDay = useGameStore.getState().timeOfDay;
    const nightFactor = getNightFactor(timeOfDay);
    const t = clock.elapsedTime;

    const baseFlicker = 0.9 + Math.sin(t * 2.3) * 0.05;
    flameMat.emissiveIntensity = nightFactor * 2.7 * baseFlicker;
    flameMat.opacity = nightFactor * 0.85;
    haloMat.opacity = nightFactor * 0.42 * baseFlicker;

    if (flameRef.current && nightFactor > 0) {
      const dummy = dummyRef.current;
      for (let i = 0; i < spots.length; i++) {
        const phase = phaseOffsets[i];
        const f =
          0.78 +
          Math.sin(t * 7.3 + phase) * 0.12 +
          Math.sin(t * 13.1 + phase * 1.7) * 0.07 +
          Math.sin(t * 3.7 + phase * 0.5) * 0.05;
        const s = spots[i].pos;
        dummy.position.set(s[0], s[1], s[2]);
        dummy.scale.set(0.22 * f, 0.34 * f, 0.22 * f);
        dummy.updateMatrix();
        flameRef.current.setMatrixAt(i, dummy.matrix);
      }
      flameRef.current.instanceMatrix.needsUpdate = true;
    }

    if (haloRef.current && nightFactor > 0) {
      const dummy = dummyRef.current;
      for (let i = 0; i < spots.length; i++) {
        const phase = phaseOffsets[i];
        const h = 0.92 + Math.sin(t * 4.1 + phase * 0.8) * 0.06 + Math.sin(t * 9.3 + phase * 1.3) * 0.03;
        const s = spots[i].pos;
        dummy.position.set(s[0], s[1] + 0.04, s[2]);
        const scale = 2.4 * h;
        dummy.scale.set(scale, scale, scale);
        dummy.updateMatrix();
        haloRef.current.setMatrixAt(i, dummy.matrix);
      }
      haloRef.current.instanceMatrix.needsUpdate = true;
    }

    for (let i = 0; i < lightsRef.current.length; i++) {
      const light = lightsRef.current[i];
      if (!light) continue;
      const phase = phaseOffsets[i];
      const lf =
        0.82 +
        Math.sin(t * 7.3 + phase) * 0.09 +
        Math.sin(t * 13.1 + phase * 1.7) * 0.05 +
        Math.sin(t * 3.7 + phase) * 0.04;
      light.intensity = nightFactor * 3.2 * lf;
    }
  });

  if (spots.length === 0) return null;
  const lightCount = Math.min(spots.length, TORCH_LIGHT_BUDGET);

  return (
    <group>
      <instancedMesh ref={haloRef} args={[haloGeo, haloMat, spots.length]} frustumCulled={false} />
      <instancedMesh ref={flameRef} args={[flameGeo, flameMat, spots.length]} frustumCulled={false} />
      {spots.slice(0, lightCount).map((s, i) => (
        <pointLight
          key={i}
          ref={(el) => { lightsRef.current[i] = el; }}
          position={[s.pos[0], s.pos[1] + 0.5, s.pos[2]]}
          color="#ffaa55"
          intensity={0}
          distance={14}
          decay={1.5}
        />
      ))}
    </group>
  );
}

// ── Smoke wisp ────────────────────────────────────────────────────────────
//
// Three stacked translucent puffs that drift upward and shrink. Use the
// instanced form when a POI has multiple smoke sources so it pays one draw
// call per warmth instead of one mesh stack per chimney/brazier.

export interface POISmokeSpot {
  pos: readonly [number, number, number];
  warmth?: 'warm' | 'cool';
  scale?: number;
}

function SmokeInstancer({ spots, warmth }: { spots: POISmokeSpot[]; warmth: 'warm' | 'cool' }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummyRef = useRef(new THREE.Object3D());
  const baseColor = warmth === 'warm' ? [0.5, 0.42, 0.34] as const : [0.55, 0.55, 0.58] as const;
  const geo = useMemo(() => new THREE.SphereGeometry(1, 6, 5), []);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({
    color: new THREE.Color(...baseColor),
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
    flatShading: true,
    roughness: 1,
  }), [baseColor]);

  useFrame(({ clock }) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const t = clock.elapsedTime;
    const dummy = dummyRef.current;
    let idx = 0;
    for (let sIdx = 0; sIdx < spots.length; sIdx++) {
      const spot = spots[sIdx];
      const scale = spot.scale ?? 1;
      const phase = (sIdx * 1.931 + (warmth === 'warm' ? 0.4 : 1.2)) % (Math.PI * 2);
      for (let i = 0; i < 3; i++) {
        const wave = Math.sin(t * 0.6 + phase + i * 0.7);
        const lift = ((t * 0.4 + i * 0.55 + phase * 0.15) % 1.6);
        const fade = Math.max(0, 1 - lift / 1.6);
        const puffScale = (0.15 + fade * (0.35 + lift * 0.4)) * scale;
        dummy.position.set(
          spot.pos[0] + wave * 0.18 * scale,
          spot.pos[1] + lift * scale,
          spot.pos[2] + wave * 0.12 * scale,
        );
        dummy.scale.set(puffScale, puffScale, puffScale);
        dummy.updateMatrix();
        mesh.setMatrixAt(idx++, dummy.matrix);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  if (spots.length === 0) return null;
  return <instancedMesh ref={meshRef} args={[geo, mat, spots.length * 3]} />;
}

export function POISmokeInstancer({ spots }: { spots: POISmokeSpot[] }) {
  const warm = useMemo(() => spots.filter((s) => (s.warmth ?? 'cool') === 'warm'), [spots]);
  const cool = useMemo(() => spots.filter((s) => (s.warmth ?? 'cool') === 'cool'), [spots]);
  return (
    <>
      <SmokeInstancer spots={warm} warmth="warm" />
      <SmokeInstancer spots={cool} warmth="cool" />
    </>
  );
}

export function ChimneySmoke({ position, warmth = 'cool', scale = 1 }: {
  position: readonly [number, number, number];
  warmth?: 'warm' | 'cool';
  scale?: number;
}) {
  return <POISmokeInstancer spots={[{ pos: position, warmth, scale }]} />;
}

// ── Stone hut ─────────────────────────────────────────────────────────────
//
// Compact rectangular single-room dwelling. Walls + door + small window +
// thatch pyramidal roof. Used by Socotra (Mahri stone hut) and reusable
// for other arid-climate POIs (Aden customs watchtower, etc.) by recoloring.

export function StoneHut({
  position,
  rotationY = 0,
  size = [4.5, 3.4, 3.6],
  wallColor = [0.74, 0.66, 0.5],
  trimColor = [0.55, 0.46, 0.34],
  roofColor = [0.58, 0.42, 0.24],
  thatch = true,
}: {
  position: readonly [number, number, number];
  rotationY?: number;
  size?: readonly [number, number, number];
  wallColor?: readonly [number, number, number];
  trimColor?: readonly [number, number, number];
  roofColor?: readonly [number, number, number];
  thatch?: boolean;
}) {
  const [w, h, d] = size;
  const wall = chunkyMat(wallColor, { roughness: 1 });
  const trim = chunkyMat(trimColor, { roughness: 1 });
  const roof = chunkyMat(roofColor, { roughness: 1 });
  const dark = chunkyMat([0.12, 0.08, 0.06], { roughness: 1 });
  // Lit window glow at night — emissive driven by the same darkMat trick the
  // city building system uses, but bespoke to this hut shape.
  const windowGlow = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#1a120a',
    emissive: '#ffb155',
    emissiveIntensity: 0,
    flatShading: true,
    roughness: 0.9,
  }), []);

  useFrame(() => {
    const timeOfDay = useGameStore.getState().timeOfDay;
    const nightFactor = getNightFactor(timeOfDay);
    windowGlow.emissiveIntensity = nightFactor * 0.95;
  });

  return (
    <group position={position as unknown as [number, number, number]} rotation={[0, rotationY, 0]}>
      {/* Plinth */}
      <mesh position={[0, 0.15, 0]} material={trim}>
        <boxGeometry args={[w + 0.4, 0.3, d + 0.4]} />
      </mesh>
      {/* Walls (single block; door + window are subtractive front-face details) */}
      <mesh position={[0, 0.3 + h * 0.5, 0]} material={wall}>
        <boxGeometry args={[w, h, d]} />
      </mesh>
      {/* Door slot — flush front, just inset darker block */}
      <mesh position={[0, 0.3 + 0.85, d * 0.5 + 0.001]} material={dark}>
        <boxGeometry args={[0.85, 1.7, 0.1]} />
      </mesh>
      {/* Window slot — small square, emissive at night */}
      <mesh position={[w * 0.32, 0.3 + h * 0.62, d * 0.5 + 0.002]} material={windowGlow}>
        <boxGeometry args={[0.55, 0.5, 0.08]} />
      </mesh>
      {/* Lintel above door */}
      <mesh position={[0, 0.3 + 1.75, d * 0.5 + 0.04]} material={trim}>
        <boxGeometry args={[1.1, 0.18, 0.18]} />
      </mesh>
      {/* Roof */}
      {thatch ? (
        // Pyramidal thatch — four-sided cone via cone with 4 segments.
        <mesh position={[0, 0.3 + h + 0.7, 0]} material={roof}>
          <coneGeometry args={[Math.max(w, d) * 0.62, 1.4, 4]} />
        </mesh>
      ) : (
        // Flat mud-brick roof with a parapet, suited to arid-cubic styles.
        <>
          <mesh position={[0, 0.3 + h + 0.18, 0]} material={trim}>
            <boxGeometry args={[w + 0.3, 0.36, d + 0.3]} />
          </mesh>
          <mesh position={[0, 0.3 + h + 0.5, 0]} material={trim}>
            <boxGeometry args={[w * 0.95, 0.18, d * 0.95]} />
          </mesh>
        </>
      )}
      {/* Chimney stub */}
      <mesh position={[w * 0.28, 0.3 + h + 0.95, -d * 0.18]} material={trim}>
        <boxGeometry args={[0.4, 0.7, 0.4]} />
      </mesh>
    </group>
  );
}

// ── Boundary wall ─────────────────────────────────────────────────────────
//
// Low stone segments arranged as a rectangle, octagon, or arc, with an
// optional gap as a gate. Used for the compound boundary around bespoke
// POIs to give the "embedded in the landscape" feel.

export function BoundaryWall({
  position,
  rotationY = 0,
  width = 12,
  depth = 10,
  height = 0.85,
  thickness = 0.55,
  segments = 14,
  gateSide = 'front',
  color = [0.66, 0.58, 0.46],
  capColor,
}: {
  position: readonly [number, number, number];
  rotationY?: number;
  width?: number;
  depth?: number;
  height?: number;
  thickness?: number;
  segments?: number;
  gateSide?: 'front' | 'back' | 'left' | 'right' | 'none';
  color?: readonly [number, number, number];
  capColor?: readonly [number, number, number];
}) {
  const wallMat = chunkyMat(color, { roughness: 1 });
  const cap = chunkyMat(capColor ?? [color[0] * 0.85, color[1] * 0.85, color[2] * 0.85], { roughness: 1 });

  // Generate segments around the perimeter — a ring of small boxes that
  // visually reads as a stacked-stone wall when slightly y-jittered and
  // height-jittered.
  const blocks = useMemo(() => {
    const out: Array<{ pos: [number, number, number]; sz: [number, number, number]; rot: number }> = [];
    const ringPerim = 2 * (width + depth);
    const seg = ringPerim / segments;
    let cursor = 0;
    for (let i = 0; i < segments; i++) {
      // Walk the perimeter as a clockwise rectangle. Skip a 2.4u gate gap on
      // the chosen side near its midpoint.
      const t = (cursor + seg * 0.5) / ringPerim;
      cursor += seg;
      let x = 0, z = 0, rot = 0;
      // Map [0,1] perimeter to rectangle corners
      const u = t;
      const f = u * 4; // 0..4
      if (f < 1) {
        // front edge (z = +depth/2), x: -w/2 .. +w/2
        x = -width / 2 + f * width;
        z = depth / 2;
        rot = 0;
      } else if (f < 2) {
        // right edge (x = +w/2), z: +d/2 .. -d/2
        x = width / 2;
        z = depth / 2 - (f - 1) * depth;
        rot = Math.PI / 2;
      } else if (f < 3) {
        // back edge
        x = width / 2 - (f - 2) * width;
        z = -depth / 2;
        rot = 0;
      } else {
        // left edge
        x = -width / 2;
        z = -depth / 2 + (f - 3) * depth;
        rot = Math.PI / 2;
      }
      // Skip a gate gap of two segments around the chosen side midpoint
      const inGap =
        (gateSide === 'front' && f > 1.85 && f < 2.15) ||
        (gateSide === 'back' && f > 0.85 && f < 1.15) ||  // back relative to caller-default
        (gateSide === 'right' && f > 2.85 && f < 3.15) ||
        (gateSide === 'left' && f > 3.85 || (gateSide === 'left' && f < 0.15));
      if (inGap) continue;
      // Per-block jitter — pseudorandom from index for determinism.
      const j = (Math.sin(i * 12.345) + 1) * 0.5;
      const hJit = height * (0.85 + j * 0.25);
      out.push({
        pos: [x, hJit * 0.5, z],
        sz: [seg * 0.92 + j * 0.05, hJit, thickness],
        rot,
      });
    }
    return out;
  }, [width, depth, height, thickness, segments, gateSide]);

  return (
    <group position={position as unknown as [number, number, number]} rotation={[0, rotationY, 0]}>
      {blocks.map((b, i) => (
        <group key={i} position={b.pos} rotation={[0, b.rot, 0]}>
          <mesh material={wallMat}>
            <boxGeometry args={b.sz} />
          </mesh>
          {/* Cap stone — slightly wider, slightly darker */}
          <mesh position={[0, b.sz[1] / 2 + 0.06, 0]} material={cap}>
            <boxGeometry args={[b.sz[0] * 0.96, 0.12, b.sz[2] * 1.18]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
