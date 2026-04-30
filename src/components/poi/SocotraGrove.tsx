// ── Socotra Dragon's Blood Grove ───────────────────────────────────────────
//
// Bespoke high-quality POI: the Diksam plateau on Socotra, a remote
// limestone karst dotted with the iconic umbrella-canopied Dracaena
// cinnabari trees. Yusuf bin Ahmad al-Mahri keeps a small stone hut here
// for the spring tapping season.
//
// Composition:
//   - 7–9 dragon's blood trees in two clusters (deterministic per id)
//   - Mahri stone hut with thatched palm-leaf roof
//   - Low limestone boundary wall around the hut compound
//   - Resin drying rack with hanging clay pots
//   - Scattered limestone scree (chunky white-gray rocks)
//   - Stone offering cairn (small stack with painted crimson dots)
//   - 2 torches (hut door + drying rack brazier)
//   - 1 chimney smoke wisp
//
// Animation:
//   - Torch flicker via shared POITorchInstancer
//   - Smoke wisp via shared ChimneySmoke
//   - Subtle canopy sway: each tree's canopy rotates ±0.04 rad on a slow
//     sine offset so the grove breathes in wind. One useFrame per render,
//     ≤9 transform updates per tick. Cheap.
//
// Determinism: every per-tree axis (trunk height, fork count, canopy radius,
// position offset, lean angle) hashes off the POI id + index. Same world
// seed → same grove layout.

import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { getTerrainHeight } from '../../utils/terrain';
import { chunkyMat, BoundaryWall, StoneHut, ChimneySmoke, POITorchInstancer, type POITorchSpot } from './atmosphere';

// ── Per-tree variant ────────────────────────────────────────────────────────

interface TreeVariant {
  /** XZ offset from the grove anchor. */
  offset: [number, number];
  /** Trunk radius at base. */
  trunkR: number;
  /** Total height ground → canopy underside. */
  height: number;
  /** Outward angle of primary branches from vertical (radians). */
  branchAngle: number;
  /** Number of primary forks at the trunk crown (3 or 4). */
  forkCount: 3 | 4;
  /** Canopy radius (the umbrella). */
  canopyR: number;
  /** Slight whole-tree lean — gives windward shaping. */
  leanZ: number;
  /** 0..1 maturity. Older trees have wider canopies and broader trunks. */
  age: number;
  /** Canopy color jitter — older trees darken slightly. */
  canopyTint: [number, number, number];
}

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

// Canopy palette — Dracaena cinnabari leaves are a dense, almost waxy dark
// olive that tilts slightly blue-green compared to the ochre limestone
// floor. Keep saturation low; this is an arid plateau, not a rainforest.
const CANOPY_BASE: readonly [number, number, number] = [0.32, 0.42, 0.22];
const CANOPY_OLD: readonly [number, number, number] = [0.24, 0.34, 0.18];
const TRUNK_BARK: readonly [number, number, number] = [0.55, 0.5, 0.42];
const TRUNK_BARK_DARK: readonly [number, number, number] = [0.4, 0.35, 0.28];
const RESIN_RED: readonly [number, number, number] = [0.55, 0.13, 0.1];
const SCREE_PALE: readonly [number, number, number] = [0.78, 0.74, 0.62];
const SCREE_SHADE: readonly [number, number, number] = [0.6, 0.55, 0.45];
const PATH: readonly [number, number, number] = [0.72, 0.66, 0.5];
const POT_CLAY: readonly [number, number, number] = [0.55, 0.32, 0.22];
const WOOD_DARK: readonly [number, number, number] = [0.4, 0.28, 0.18];

function buildTreeVariants(seed: number, count: number): TreeVariant[] {
  const rng = mulberry32(seed);
  const out: TreeVariant[] = [];
  for (let i = 0; i < count; i++) {
    const isInner = i < Math.ceil(count * 0.55);
    const angle = rng() * Math.PI * 2;
    const r = isInner
      ? 8 + rng() * 10          // 8–18u from grove center
      : 18 + rng() * 14;        // 18–32u outer scatter
    const offset: [number, number] = [Math.cos(angle) * r, Math.sin(angle) * r];
    // Maturity drives both trunk + branch + puff size in concert.
    const age = 0.4 + rng() * 0.6;
    const trunkR = 0.55 + age * 0.55;
    // Trunk is now substantially taller than the canopy span. Real dragon
    // trees are clearly vertical; the umbrella shape comes from spread of
    // branches, not from canopy height.
    const height = 6.5 + age * 4.5;          // 6.5–11u trunk
    const canopyR = 3.4 + age * 2.6;         // 3.4–6.0u total branch reach
    const branchAngle = (38 + rng() * 18) * Math.PI / 180;
    const forkCount: 3 | 4 = rng() < 0.55 ? 4 : 3;
    const leanZ = (rng() - 0.5) * 0.14;
    const canopyTint: [number, number, number] = age > 0.75
      ? [...CANOPY_OLD] as [number, number, number]
      : [
          CANOPY_BASE[0] + (rng() - 0.5) * 0.05,
          CANOPY_BASE[1] + (rng() - 0.5) * 0.06,
          CANOPY_BASE[2] + (rng() - 0.5) * 0.04,
        ];
    out.push({ offset, trunkR, height, branchAngle, forkCount, canopyR, leanZ, age, canopyTint });
  }
  return out;
}

// ── Single tree ─────────────────────────────────────────────────────────────
//
// Geometry: tapered trunk → primary forks (each a tilted cylinder) →
// secondary forks at each tip → flat olive canopy disc spanning all tips.
// Subtle sway: the canopy + branches share a parent group whose Y rotation
// drifts on a sine. The trunk stays still so the sway reads as breeze
// pushing the leaves, not the whole tree wobbling.

function DragonBloodTree({ variant, swayPhase, terrainY }: {
  variant: TreeVariant;
  swayPhase: number;
  terrainY: number;
}) {
  const swayRef = useRef<THREE.Group>(null);
  const trunkMat = chunkyMat(TRUNK_BARK, { roughness: 1 });
  const trunkDarkMat = chunkyMat(TRUNK_BARK_DARK, { roughness: 1 });
  const canopyMat = useMemo(() => chunkyMat(variant.canopyTint, { roughness: 0.95 }), [variant.canopyTint]);
  // Underside is much darker so the silhouette reads as a layered shape,
  // not a flat plate.
  const canopyShade = useMemo(
    () => chunkyMat(
      [variant.canopyTint[0] * 0.45, variant.canopyTint[1] * 0.5, variant.canopyTint[2] * 0.5],
      { roughness: 1 },
    ),
    [variant.canopyTint],
  );
  // Spike-leaf material is a brighter, slightly warmer green so the
  // needle texture pops against the puff dome.
  const leafMat = useMemo(
    () => chunkyMat(
      [variant.canopyTint[0] * 1.15, variant.canopyTint[1] * 1.18, variant.canopyTint[2] * 0.95],
      { roughness: 0.92 },
    ),
    [variant.canopyTint],
  );
  const resinMat = chunkyMat(RESIN_RED, { roughness: 0.6 });

  // Build the branch architecture: trunk forks at 60% → primaries (3 or 4)
  // → secondaries (2 each) → puff at every secondary tip. Every tip gets
  // its own dome + radiating spike leaves, and the cluster of puffs forms
  // the umbrella silhouette without any flat-disc geometry.
  const architecture = useMemo(() => {
    const trunkForkY = variant.height * 0.62;
    // Primaries — start at fork point, fan outward in azimuth.
    type Branch = {
      start: [number, number, number];
      end: [number, number, number];
      thickStart: number;
      thickEnd: number;
    };
    type Puff = {
      pos: [number, number, number];
      r: number;
      // Tilt of the puff's "up" axis — slightly outward from trunk so each
      // puff faces its own direction in the sky.
      tilt: [number, number, number];
    };
    const primaries: Branch[] = [];
    const secondaries: Branch[] = [];
    const puffs: Puff[] = [];

    const primaryReach = variant.canopyR * 0.55;        // how far primaries swing out
    const primaryRise = variant.height * 0.25;          // how much they climb
    const secondaryReach = variant.canopyR * 0.45;
    const secondaryRise = variant.height * 0.15;

    for (let i = 0; i < variant.forkCount; i++) {
      const azimuth = (i / variant.forkCount) * Math.PI * 2 +
        (variant.forkCount === 4 ? Math.PI / 4 : Math.PI / 6);
      const px = Math.cos(azimuth) * primaryReach;
      const pz = Math.sin(azimuth) * primaryReach;
      const py = trunkForkY + primaryRise;

      primaries.push({
        start: [0, trunkForkY, 0],
        end: [px, py, pz],
        thickStart: variant.trunkR * 0.78,
        thickEnd: variant.trunkR * 0.42,
      });

      // Two secondaries from each primary tip, splayed in azimuth ±25°.
      for (let j = 0; j < 2; j++) {
        const splay = (j === 0 ? -1 : 1) * (Math.PI / 7);
        const az2 = azimuth + splay;
        const sx = px + Math.cos(az2) * secondaryReach;
        const sz = pz + Math.sin(az2) * secondaryReach;
        const sy = py + secondaryRise;
        secondaries.push({
          start: [px, py, pz],
          end: [sx, sy, sz],
          thickStart: variant.trunkR * 0.42,
          thickEnd: variant.trunkR * 0.22,
        });
        // Puff at the secondary tip. Tilt direction = outward (away from
        // trunk axis), small magnitude so the puffs sit roughly upright.
        const outwardLen = Math.hypot(sx, sz);
        const tiltMag = 0.18;
        const tiltX = (sz / Math.max(outwardLen, 0.001)) * -tiltMag;
        const tiltZ = (sx / Math.max(outwardLen, 0.001)) * tiltMag;
        const puffR = variant.trunkR * 1.6 + variant.age * 0.4;
        puffs.push({
          pos: [sx, sy + puffR * 0.55, sz],
          r: puffR,
          tilt: [tiltX, 0, tiltZ],
        });
      }
    }
    return { primaries, secondaries, puffs };
  }, [variant]);

  // Resin scars on trunk — vertical drips from past tappings.
  const resinScars = useMemo(() => {
    const out: Array<{ y: number; az: number; w: number; h: number }> = [];
    const s = (variant.offset[0] * 73 + variant.offset[1] * 41) | 0;
    const rng = mulberry32(s >>> 0);
    const scarCount = 2 + Math.floor(rng() * 3);
    for (let i = 0; i < scarCount; i++) {
      out.push({
        y: variant.height * (0.32 + rng() * 0.35),
        az: rng() * Math.PI * 2,
        w: 0.06 + rng() * 0.05,
        h: 0.5 + rng() * 0.7,
      });
    }
    return out;
  }, [variant]);

  useFrame(({ clock }) => {
    if (!swayRef.current) return;
    const t = clock.elapsedTime;
    swayRef.current.rotation.y = Math.sin(t * 0.45 + swayPhase) * 0.022;
    swayRef.current.rotation.z = variant.leanZ + Math.sin(t * 0.35 + swayPhase * 1.3) * 0.01;
  });

  // Helper: render a tapered cylinder from start to end, with a quaternion
  // built so the cylinder's local +Y axis points along the segment.
  const branchToProps = (start: [number, number, number], end: [number, number, number]) => {
    const s = new THREE.Vector3(...start);
    const e = new THREE.Vector3(...end);
    const dir = e.clone().sub(s);
    const len = dir.length();
    dir.normalize();
    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    const euler = new THREE.Euler().setFromQuaternion(quat);
    const mid: [number, number, number] = [(s.x + e.x) / 2, (s.y + e.y) / 2, (s.z + e.z) / 2];
    return { mid, len, rot: [euler.x, euler.y, euler.z] as [number, number, number] };
  };

  // Per-puff spike leaves — 7 thin wedges radiating outward from the puff
  // top hemisphere. Hashed so each puff has a slightly different rotation
  // and each tree's leaves don't all line up identically.
  const renderSpikes = (puffR: number, puffSeed: number) => {
    const rng = mulberry32(puffSeed);
    const spikes: React.ReactNode[] = [];
    const count = 7;
    for (let k = 0; k < count; k++) {
      const az = (k / count) * Math.PI * 2 + rng() * 0.4;
      const tilt = (35 + rng() * 30) * Math.PI / 180; // outward tilt from vertical
      const len = puffR * (1.4 + rng() * 0.5);
      const cx = Math.cos(az) * Math.sin(tilt) * (puffR * 0.4);
      const cy = Math.cos(tilt) * (len * 0.5) + puffR * 0.3;
      const cz = Math.sin(az) * Math.sin(tilt) * (puffR * 0.4);
      // Build orientation: spike's local +Y points outward+up.
      const dirX = Math.cos(az) * Math.sin(tilt);
      const dirY = Math.cos(tilt);
      const dirZ = Math.sin(az) * Math.sin(tilt);
      const quat = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(dirX, dirY, dirZ),
      );
      const e = new THREE.Euler().setFromQuaternion(quat);
      spikes.push(
        <mesh
          key={k}
          position={[cx, cy, cz]}
          rotation={[e.x, e.y, e.z]}
          material={leafMat}
        >
          {/* Thin tapered chunk: wider at the base, narrower at the tip. A
              cone reads cleaner than a box at this density. */}
          <coneGeometry args={[puffR * 0.18, len, 4]} />
        </mesh>,
      );
    }
    return spikes;
  };

  return (
    <group position={[variant.offset[0], terrainY, variant.offset[1]]}>
      {/* Trunk — tapered cylinder, much taller than before so the tree
          reads vertical from any camera angle. */}
      <mesh position={[0, variant.height * 0.5, 0]} material={trunkMat}>
        <cylinderGeometry
          args={[variant.trunkR * 0.65, variant.trunkR * 1.08, variant.height, 9]}
        />
      </mesh>
      {/* Root flare — wider conical band at the base */}
      <mesh position={[0, 0.22, 0]} material={trunkDarkMat}>
        <cylinderGeometry args={[variant.trunkR * 1.05, variant.trunkR * 1.55, 0.44, 9]} />
      </mesh>
      {/* Resin scars — vertical red marks where the bark has been tapped */}
      {resinScars.map((s, i) => {
        const x = Math.cos(s.az) * variant.trunkR * 1.0;
        const z = Math.sin(s.az) * variant.trunkR * 1.0;
        return (
          <mesh
            key={i}
            position={[x, s.y, z]}
            rotation={[0, -s.az + Math.PI / 2, 0]}
            material={resinMat}
          >
            <boxGeometry args={[0.05, s.h, s.w]} />
          </mesh>
        );
      })}

      {/* Sway group: branches + puffs breathe together; trunk stays still
          so the wind reads as moving the foliage rather than the whole tree. */}
      <group ref={swayRef}>
        {/* Primary branches */}
        {architecture.primaries.map((b, i) => {
          const { mid, len, rot } = branchToProps(b.start, b.end);
          return (
            <mesh key={`p${i}`} position={mid} rotation={rot} material={trunkDarkMat}>
              <cylinderGeometry args={[b.thickEnd, b.thickStart, len, 6]} />
            </mesh>
          );
        })}
        {/* Secondary branches */}
        {architecture.secondaries.map((b, i) => {
          const { mid, len, rot } = branchToProps(b.start, b.end);
          return (
            <mesh key={`s${i}`} position={mid} rotation={rot} material={trunkDarkMat}>
              <cylinderGeometry args={[b.thickEnd, b.thickStart, len, 5]} />
            </mesh>
          );
        })}
        {/* Puffs — one dome + 7 spikes per branch tip. The collective
            silhouette reads as the umbrella canopy, but you can see
            *between* the puffs which restores the candelabrum visibility. */}
        {architecture.puffs.map((puff, i) => {
          const puffSeed = ((variant.offset[0] * 1031 + variant.offset[1] * 211 + i * 137) | 0) >>> 0;
          return (
            <group key={`f${i}`} position={puff.pos} rotation={puff.tilt}>
              {/* Dome (top) */}
              <mesh position={[0, puff.r * 0.15, 0]} material={canopyMat}>
                <sphereGeometry args={[puff.r, 8, 6]} />
              </mesh>
              {/* Underside shadow — squashed darker hemisphere */}
              <mesh position={[0, -puff.r * 0.05, 0]} scale={[1, 0.55, 1]} material={canopyShade}>
                <sphereGeometry args={[puff.r * 0.95, 8, 6]} />
              </mesh>
              {/* Radiating spikes */}
              {renderSpikes(puff.r, puffSeed)}
            </group>
          );
        })}
      </group>
    </group>
  );
}

// ── Resin drying rack ───────────────────────────────────────────────────────
//
// Four wooden posts in a rectangle, two horizontal beams across the top,
// six clay pots hanging by twine catching dragon's blood resin. Small
// crimson dots on the rim of each pot are the fresh tap.

function DryingRack({ position, rotationY, scale = 1 }: {
  position: readonly [number, number, number];
  rotationY: number;
  scale?: number;
}) {
  const wood = chunkyMat(WOOD_DARK, { roughness: 1 });
  const beam = chunkyMat([WOOD_DARK[0] * 1.1, WOOD_DARK[1] * 1.1, WOOD_DARK[2] * 1.1], { roughness: 1 });
  const pot = chunkyMat(POT_CLAY, { roughness: 1 });
  const resin = chunkyMat(RESIN_RED, { roughness: 0.5 });
  const twine = chunkyMat([0.45, 0.35, 0.25], { roughness: 1 });

  return (
    <group
      position={position as unknown as [number, number, number]}
      rotation={[0, rotationY, 0]}
      scale={[scale, scale, scale]}
    >
      {/* Four posts */}
      {[
        [-1.3, -0.8],
        [1.3, -0.8],
        [-1.3, 0.8],
        [1.3, 0.8],
      ].map(([x, z], i) => (
        <mesh key={i} position={[x, 1.1, z]} material={wood}>
          <boxGeometry args={[0.18, 2.2, 0.18]} />
        </mesh>
      ))}
      {/* Two cross beams */}
      <mesh position={[0, 2.1, -0.8]} material={beam}>
        <boxGeometry args={[2.8, 0.16, 0.18]} />
      </mesh>
      <mesh position={[0, 2.1, 0.8]} material={beam}>
        <boxGeometry args={[2.8, 0.16, 0.18]} />
      </mesh>
      {/* Six clay pots hanging on twine */}
      {[
        [-1.0, -0.8], [0.0, -0.8], [1.0, -0.8],
        [-1.0, 0.8],  [0.0, 0.8],  [1.0, 0.8],
      ].map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh position={[0, 1.55, 0]} material={twine}>
            <cylinderGeometry args={[0.018, 0.018, 0.7, 4]} />
          </mesh>
          <mesh position={[0, 1.05, 0]} material={pot}>
            <cylinderGeometry args={[0.22, 0.18, 0.34, 8]} />
          </mesh>
          <mesh position={[0, 1.24, 0]} material={pot}>
            <torusGeometry args={[0.22, 0.04, 4, 12]} />
          </mesh>
          <mesh position={[0, 1.21, 0]} material={resin}>
            <cylinderGeometry args={[0.19, 0.19, 0.05, 8]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// ── Stone offering cairn ───────────────────────────────────────────────────
//
// A small stack of three to four stones with crimson-painted dots — pilgrim
// offerings to the spirit of the grove. Reads as "this is sacred ground"
// from across the plateau.

function OfferingCairn({ position, rotationY, scale = 1 }: {
  position: readonly [number, number, number];
  rotationY: number;
  scale?: number;
}) {
  const pale = chunkyMat(SCREE_PALE, { roughness: 1 });
  const shade = chunkyMat(SCREE_SHADE, { roughness: 1 });
  const resin = chunkyMat(RESIN_RED, { roughness: 0.5 });
  return (
    <group
      position={position as unknown as [number, number, number]}
      rotation={[0, rotationY, 0]}
      scale={[scale, scale, scale]}
    >
      <mesh position={[0, 0.3, 0]} material={pale}>
        <boxGeometry args={[1.3, 0.55, 1.0]} />
      </mesh>
      <mesh position={[0.05, 0.85, 0.05]} material={shade}>
        <boxGeometry args={[1.0, 0.45, 0.85]} />
      </mesh>
      <mesh position={[-0.05, 1.25, -0.05]} material={pale}>
        <boxGeometry args={[0.7, 0.4, 0.6]} />
      </mesh>
      <mesh position={[0.0, 1.5, 0.0]} material={shade}>
        <boxGeometry args={[0.45, 0.3, 0.4]} />
      </mesh>
      {/* Crimson dots — small red boxes flush with stone faces */}
      <mesh position={[0.66, 0.55, 0]} material={resin}>
        <boxGeometry args={[0.04, 0.16, 0.16]} />
      </mesh>
      <mesh position={[0, 0.55, 0.51]} material={resin}>
        <boxGeometry args={[0.16, 0.16, 0.04]} />
      </mesh>
      <mesh position={[0, 1.05, 0.43]} material={resin}>
        <boxGeometry args={[0.12, 0.12, 0.04]} />
      </mesh>
    </group>
  );
}

// ── Scattered scree ─────────────────────────────────────────────────────────
//
// 14 small chunky stones scattered across the grove area, half-embedded in
// the terrain. Limestone karst character: pale, irregular, sized for the
// "this is rocky ground" feel.

function Scree({ centerXZ, terrainAt, count = 14, seed }: {
  centerXZ: [number, number];
  terrainAt: (x: number, z: number) => number;
  count?: number;
  seed: number;
}) {
  const pale = chunkyMat(SCREE_PALE, { roughness: 1 });
  const shade = chunkyMat(SCREE_SHADE, { roughness: 1 });
  const stones = useMemo(() => {
    const rng = mulberry32(seed);
    const out: Array<{ pos: [number, number, number]; sz: [number, number, number]; rot: number; light: boolean }> = [];
    for (let i = 0; i < count; i++) {
      const angle = rng() * Math.PI * 2;
      const r = 4 + rng() * 24;
      const x = centerXZ[0] + Math.cos(angle) * r;
      const z = centerXZ[1] + Math.sin(angle) * r;
      const w = 0.4 + rng() * 0.7;
      const h = 0.18 + rng() * 0.4;
      const d = 0.4 + rng() * 0.7;
      const y = terrainAt(x, z) + h * 0.4;
      out.push({
        pos: [x, y, z],
        sz: [w, h, d],
        rot: rng() * Math.PI * 2,
        light: rng() < 0.55,
      });
    }
    return out;
  }, [centerXZ, count, seed, terrainAt]);
  return (
    <group>
      {stones.map((s, i) => (
        <mesh
          key={i}
          position={s.pos}
          rotation={[0, s.rot, 0]}
          material={s.light ? pale : shade}
        >
          <boxGeometry args={s.sz} />
        </mesh>
      ))}
    </group>
  );
}

// ── Footpath ────────────────────────────────────────────────────────────────
//
// A simple worn-path strip from the grove entrance to the hut. Single
// plane laid flat just above the terrain, lighter color than the
// surrounding ground.

function Footpath({ from, to, terrainAt }: {
  from: [number, number];
  to: [number, number];
  terrainAt: (x: number, z: number) => number;
}) {
  const mat = chunkyMat(PATH, { roughness: 1, opacity: 0.85 });
  const dx = to[0] - from[0];
  const dz = to[1] - from[1];
  const length = Math.hypot(dx, dz);
  const angle = Math.atan2(dz, dx);
  const cx = (from[0] + to[0]) / 2;
  const cz = (from[1] + to[1]) / 2;
  const cy = (terrainAt(from[0], from[1]) + terrainAt(to[0], to[1])) / 2 + 0.04;
  return (
    <mesh position={[cx, cy, cz]} rotation={[-Math.PI / 2, 0, -angle]} material={mat}>
      <planeGeometry args={[length, 1.2]} />
    </mesh>
  );
}

// ── Top-level grove ─────────────────────────────────────────────────────────

export function SocotraGrove({ poiId, position, rotationY }: {
  poiId: string;
  position: readonly [number, number, number];
  rotationY: number;
}) {
  const seed = hashStr(poiId);
  // 7 trees — slightly fewer than before since each has more geometry
  // now (puffs + spikes), but still reads as a grove.
  const trees = useMemo(() => buildTreeVariants(seed, 7), [seed]);
  const swayPhases = useMemo(() => trees.map((_, i) => (i * 0.97) % (Math.PI * 2)), [trees]);

  // Compound layout — bumped distances so the hut and trees don't
  // overlap at the new tree scale. Rotation is hashed off the world seed
  // via the rotationY passed in by the dispatcher.
  const huts: { offset: [number, number]; rot: number } = { offset: [-7, 2], rot: 0 };
  const rackOffset: [number, number] = [5, -2];
  const cairnOffset: [number, number] = [-5, 9];

  const [ax, , az] = position as [number, number, number];

  // Localized terrain sampler — cheaper than calling getTerrainHeight from
  // every leaf component, especially in the Scree pass.
  const terrainAt = useMemo(() => {
    return (x: number, z: number) => getTerrainHeight(ax + x, az + z);
  }, [ax, az]);

  // Anchor terrain Y for hut + rack + cairn (they sit on the same plateau).
  const anchorY = terrainAt(0, 0);
  const hutTerrainY = terrainAt(huts.offset[0], huts.offset[1]) - anchorY;
  const rackTerrainY = terrainAt(rackOffset[0], rackOffset[1]) - anchorY;
  const cairnTerrainY = terrainAt(cairnOffset[0], cairnOffset[1]) - anchorY;

  // Torch + smoke spots — in world coords, since POITorchInstancer is a
  // sibling that lives in world space.
  const torchSpots: POITorchSpot[] = useMemo(() => {
    const local: Array<[number, number, number]> = [
      // Hut door lantern
      [huts.offset[0], hutTerrainY + 2.1, huts.offset[1] + 1.95],
      // Drying-rack brazier
      [rackOffset[0] - 1.8, rackTerrainY + 0.6, rackOffset[1]],
    ];
    // Apply group rotation to each local point — atmosphere lives outside
    // the rotated group so we have to bake the rotation in.
    const c = Math.cos(rotationY);
    const s = Math.sin(rotationY);
    return local.map(([lx, ly, lz]) => ({
      pos: [
        ax + (lx * c - lz * s),
        anchorY + ly,
        az + (lx * s + lz * c),
      ] as [number, number, number],
      warmth: 'warm',
    }));
  }, [ax, az, anchorY, rotationY, hutTerrainY, rackTerrainY]);

  const smokePos: [number, number, number] = useMemo(() => {
    // Hut chimney top, in world coords with rotation baked in.
    const lx = huts.offset[0] + 1.26;
    const lz = huts.offset[1] - 0.65;
    const ly = hutTerrainY + 4.6;
    const c = Math.cos(rotationY);
    const s = Math.sin(rotationY);
    return [
      ax + (lx * c - lz * s),
      anchorY + ly,
      az + (lx * s + lz * c),
    ];
  }, [ax, az, anchorY, rotationY, hutTerrainY]);

  return (
    <>
      {/* Atmosphere lives outside the rotated group — torches are
          aggregated in world space already. */}
      <POITorchInstancer spots={torchSpots} />
      <ChimneySmoke position={smokePos} warmth="warm" scale={0.9} />

      <group position={position as unknown as [number, number, number]} rotation={[0, rotationY, 0]}>
        {/* Compound: hut + boundary wall + drying rack + cairn */}
        <StoneHut
          position={[huts.offset[0], hutTerrainY, huts.offset[1]]}
          rotationY={huts.rot}
          // Bumped ~1.7x — at the default camera distance the previous
          // 4.2u-wide hut read as a tiny speck.
          size={[7.5, 5.2, 6.0]}
          wallColor={[0.78, 0.7, 0.54]}
          trimColor={[0.55, 0.46, 0.34]}
          roofColor={[0.5, 0.36, 0.22]}
          thatch={true}
        />
        <BoundaryWall
          position={[huts.offset[0] + 0.5, hutTerrainY, huts.offset[1]]}
          width={15}
          depth={11}
          height={1.4}
          thickness={0.7}
          segments={20}
          gateSide="front"
          color={[0.72, 0.66, 0.52]}
        />
        <DryingRack
          position={[rackOffset[0], rackTerrainY, rackOffset[1]]}
          rotationY={Math.PI / 6}
          scale={1.5}
        />
        <OfferingCairn
          position={[cairnOffset[0], cairnTerrainY, cairnOffset[1]]}
          rotationY={Math.PI / 5}
          scale={1.5}
        />

        {/* Footpath from compound gate toward the outer ring */}
        <Footpath
          from={[huts.offset[0], huts.offset[1] + 4]}
          to={[huts.offset[0] + 4, huts.offset[1] + 14]}
          terrainAt={(x, z) => terrainAt(x, z) - anchorY}
        />

        {/* Trees */}
        {trees.map((variant, i) => (
          <DragonBloodTree
            key={i}
            variant={variant}
            swayPhase={swayPhases[i]}
            terrainY={terrainAt(variant.offset[0], variant.offset[1]) - anchorY}
          />
        ))}

        {/* Scattered scree across the grove */}
        <Scree
          centerXZ={[0, 0]}
          terrainAt={(x, z) => terrainAt(x, z) - anchorY}
          count={18}
          seed={seed ^ 0x5cee}
        />
      </group>
    </>
  );
}
