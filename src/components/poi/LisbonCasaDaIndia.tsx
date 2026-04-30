// ── Lisbon — Casa da Índia ─────────────────────────────────────────────────
//
// Bespoke high-quality POI. Authoring brief (post-Venice review):
//   - Read first from a high, far camera. Big simple masses, strong color
//     blocks, almost no sub-2u detail. Massing > prop count.
//   - One long arcade-fronted warehouse + one battlemented customs tower
//     + one royal banner waving on the flagpole. Everything else (sack
//     pyramid, armillary sphere) is a single distinctive accent on a stone
//     quay.
//   - Palette is the silhouette: white limestone walls, terra-cotta tile
//     roof, azulejo blue trim, royal-red banner. That four-color block
//     IS the identity.
//
// Composition (top-down legibility):
//   1. Long horizontal warehouse mass — one big white box with a tile
//      roof. Biggest single shape, runs east-west along the quay.
//   2. Square stone customs tower at the west end with stepped battlements
//      and the Portuguese royal banner — strong vertical counterpoint.
//   3. Open arcade along the warehouse front (six chunky stone columns
//      under a single beam), reading as a rhythmic colonnade.
//   4. Stone quay (Cais da Pedra) running along the river side, with five
//      bollards, a pepper-sack pyramid (signature beige cargo pile), and
//      a Manueline armillary-sphere ornament on a pedestal.
//   5. No bespoke water or ship props: the world terrain/ocean own the
//      shoreline, and harbor traffic belongs to the shared ship systems.
//
// Atmosphere:
//   - Royal banner waves on the flagpole (per-vertex sine on a segmented
//     plane — the only "complex" animation here).
//   - One smoke wisp from the customs hearth at the tower base.
//   - 4 torches: 2 flanking the tower entrance, 2 at the arcade ends.

import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { getTerrainHeight } from '../../utils/terrain';
import { SEA_LEVEL } from '../../constants/world';
import { chunkyMat, ChimneySmoke, POITorchInstancer, type POITorchSpot } from './atmosphere';
import { WavingBanner } from './WavingBanner';

// ── Palette — four core blocks, plus quay/timber neutrals ─────────────────

const LIMESTONE: readonly [number, number, number] = [0.92, 0.90, 0.84];
const LIMESTONE_SHADOW: readonly [number, number, number] = [0.72, 0.70, 0.64];
const TILE_ROOF: readonly [number, number, number] = [0.62, 0.30, 0.20];
const TILE_ROOF_DARK: readonly [number, number, number] = [0.46, 0.22, 0.16];
const AZULEJO_BLUE: readonly [number, number, number] = [0.28, 0.42, 0.66];
const BANNER_RED: readonly [number, number, number] = [0.74, 0.18, 0.20];
const BANNER_GOLD: readonly [number, number, number] = [0.82, 0.66, 0.22];
const STONE_QUAY: readonly [number, number, number] = [0.70, 0.66, 0.58];
const STONE_QUAY_DARK: readonly [number, number, number] = [0.55, 0.52, 0.46];
const TIMBER_DARK: readonly [number, number, number] = [0.32, 0.20, 0.12];
const TIMBER_PALE: readonly [number, number, number] = [0.55, 0.40, 0.24];
const PEPPER_SACK: readonly [number, number, number] = [0.66, 0.55, 0.36];
const PEPPER_SACK_SHADE: readonly [number, number, number] = [0.50, 0.42, 0.28];
const IRON_DARK: readonly [number, number, number] = [0.20, 0.18, 0.16];

// ── Hash ──────────────────────────────────────────────────────────────────

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ── Warehouse — one big simple mass with arcade + tile roof ───────────────
//
// One white box, one tile-roof slab, six chunky columns under one beam =
// the arcade. No window detail; the mass and color are the read.

function CasaWarehouse({ position, rotationY }: {
  position: readonly [number, number, number];
  rotationY: number;
}) {
  const w = 22;
  const d = 7;
  const wallH = 5.0;
  const roofH = 1.6;

  const lime = chunkyMat(LIMESTONE, { roughness: 1 });
  const limeShade = chunkyMat(LIMESTONE_SHADOW, { roughness: 1 });
  const tile = chunkyMat(TILE_ROOF, { roughness: 0.9 });
  const tileDark = chunkyMat(TILE_ROOF_DARK, { roughness: 0.9 });
  const blue = chunkyMat(AZULEJO_BLUE, { roughness: 0.9 });
  const stone = chunkyMat(STONE_QUAY, { roughness: 1 });
  const stoneDark = chunkyMat(STONE_QUAY_DARK, { roughness: 1 });
  const ironMat = chunkyMat(IRON_DARK, { roughness: 0.9 });

  return (
    <group position={position as unknown as [number, number, number]} rotation={[0, rotationY, 0]}>
      {/* ── Stone plinth ── */}
      <mesh position={[0, 0.2, 0]} material={stoneDark}>
        <boxGeometry args={[w + 0.5, 0.4, d + 0.5]} />
      </mesh>

      {/* ── Main wall mass ── */}
      <mesh position={[0, 0.4 + wallH * 0.5, 0]} material={lime}>
        <boxGeometry args={[w, wallH, d]} />
      </mesh>

      {/* Faint shadow stripe on the side walls — no detail, just a tone shift */}
      <mesh position={[w / 2 - 0.04, 0.4 + wallH * 0.5, 0]} material={limeShade}>
        <boxGeometry args={[0.06, wallH, d - 0.4]} />
      </mesh>
      <mesh position={[-w / 2 + 0.04, 0.4 + wallH * 0.5, 0]} material={limeShade}>
        <boxGeometry args={[0.06, wallH, d - 0.4]} />
      </mesh>

      {/* ── Azulejo trim band — blue tile course at the top of the wall ── */}
      <mesh position={[0, 0.4 + wallH - 0.4, -d / 2 - 0.02]} material={blue}>
        <boxGeometry args={[w, 0.45, 0.08]} />
      </mesh>
      {/* Same band on the back wall */}
      <mesh position={[0, 0.4 + wallH - 0.4, d / 2 + 0.02]} material={blue}>
        <boxGeometry args={[w, 0.45, 0.08]} />
      </mesh>

      {/* ── Tile roof — single low gable, runs along the long axis ── */}
      {/* Roof base course */}
      <mesh position={[0, 0.4 + wallH + 0.16, 0]} material={stoneDark}>
        <boxGeometry args={[w + 0.4, 0.32, d + 0.4]} />
      </mesh>
      {/* Front (river-side) roof slope */}
      <mesh
        position={[0, 0.4 + wallH + 0.32 + roofH * 0.5, -d * 0.22]}
        rotation={[0.5, 0, 0]}
        material={tile}
      >
        <boxGeometry args={[w + 0.6, 0.3, d * 0.72]} />
      </mesh>
      {/* Back (inland) roof slope */}
      <mesh
        position={[0, 0.4 + wallH + 0.32 + roofH * 0.5, d * 0.22]}
        rotation={[-0.5, 0, 0]}
        material={tileDark}
      >
        <boxGeometry args={[w + 0.6, 0.3, d * 0.72]} />
      </mesh>
      {/* Ridge cap */}
      <mesh position={[0, 0.4 + wallH + 0.32 + roofH + 0.02, 0]} material={tileDark}>
        <boxGeometry args={[w + 0.2, 0.18, 0.4]} />
      </mesh>

      {/* ── Arcade on the front (-Z) face — six chunky columns + one beam ── */}
      {/* Beam spanning the full width, sits at the wall midline */}
      <mesh position={[0, 3.4, -d / 2 - 0.7]} material={limeShade}>
        <boxGeometry args={[w, 0.6, 1.2]} />
      </mesh>
      {/* Six columns */}
      {Array.from({ length: 6 }).map((_, i) => {
        const x = -w / 2 + 1.6 + i * (w - 3.2) / 5;
        return (
          <group key={i}>
            {/* Column base */}
            <mesh position={[x, 0.5, -d / 2 - 0.7]} material={stoneDark}>
              <boxGeometry args={[1.0, 0.6, 1.0]} />
            </mesh>
            {/* Column shaft */}
            <mesh position={[x, 1.85, -d / 2 - 0.7]} material={lime}>
              <cylinderGeometry args={[0.32, 0.36, 2.5, 8]} />
            </mesh>
            {/* Capital — squat blocky top */}
            <mesh position={[x, 3.15, -d / 2 - 0.7]} material={limeShade}>
              <boxGeometry args={[0.7, 0.18, 0.7]} />
            </mesh>
          </group>
        );
      })}
      {/* Arcade ceiling shadow strip — dark band visible under the beam */}
      <mesh position={[0, 3.05, -d / 2 - 0.7]} material={chunkyMat([0.30, 0.28, 0.24], { roughness: 1 })}>
        <boxGeometry args={[w - 0.4, 0.05, 1.0]} />
      </mesh>

      {/* ── Big iron-banded warehouse door — single dark slab, center ── */}
      <mesh position={[0, 0.4 + 1.4, -d / 2 + 0.05]} material={chunkyMat([0.22, 0.14, 0.08], { roughness: 1 })}>
        <boxGeometry args={[3.0, 2.8, 0.1]} />
      </mesh>
      {/* Iron straps on the door — three horizontal bands, no fuss */}
      {[-0.7, 0.0, 0.7].map((dy, i) => (
        <mesh key={i} position={[0, 0.4 + 1.4 + dy, -d / 2 + 0.01]} material={ironMat}>
          <boxGeometry args={[3.1, 0.12, 0.04]} />
        </mesh>
      ))}
      {/* Door surround stone */}
      <mesh position={[0, 0.4 + 1.45, -d / 2 + 0.005]} material={limeShade}>
        <boxGeometry args={[3.4, 3.0, 0.05]} />
      </mesh>

      {/* ── Inland-side stone steps + door (simpler) ── */}
      <mesh position={[0, 0.55, d / 2 + 0.4]} material={stone}>
        <boxGeometry args={[3.0, 0.3, 0.7]} />
      </mesh>
    </group>
  );
}

// ── Customs tower — square stone block with stepped battlements ───────────

function CustomsTower({ position, rotationY }: {
  position: readonly [number, number, number];
  rotationY: number;
}) {
  const stone = chunkyMat(LIMESTONE, { roughness: 1 });
  const stoneShade = chunkyMat(LIMESTONE_SHADOW, { roughness: 1 });
  const stoneDark = chunkyMat(STONE_QUAY_DARK, { roughness: 1 });
  const blue = chunkyMat(AZULEJO_BLUE, { roughness: 0.9 });
  const ironMat = chunkyMat(IRON_DARK, { roughness: 0.9 });

  const baseW = 5;
  const towerH = 11;

  return (
    <group position={position as unknown as [number, number, number]} rotation={[0, rotationY, 0]}>
      {/* Plinth */}
      <mesh position={[0, 0.25, 0]} material={stoneDark}>
        <boxGeometry args={[baseW + 0.6, 0.5, baseW + 0.6]} />
      </mesh>
      {/* Main shaft */}
      <mesh position={[0, 0.5 + towerH * 0.5, 0]} material={stone}>
        <boxGeometry args={[baseW, towerH, baseW]} />
      </mesh>
      {/* Single corner-shadow stripe per face — gives volume without window detail */}
      <mesh position={[baseW / 2 - 0.04, 0.5 + towerH * 0.5, 0]} material={stoneShade}>
        <boxGeometry args={[0.06, towerH - 0.6, baseW - 0.4]} />
      </mesh>
      <mesh position={[-baseW / 2 + 0.04, 0.5 + towerH * 0.5, 0]} material={stoneShade}>
        <boxGeometry args={[0.06, towerH - 0.6, baseW - 0.4]} />
      </mesh>

      {/* One narrow window slit per face — emissive dark slot, reads as
          arrow-loop. Not lit — keep the read simple. */}
      {[
        [0, towerH * 0.45, -baseW / 2 - 0.01, 0],
        [0, towerH * 0.45, baseW / 2 + 0.01, Math.PI],
        [-baseW / 2 - 0.01, towerH * 0.45, 0, -Math.PI / 2],
        [baseW / 2 + 0.01, towerH * 0.45, 0, Math.PI / 2],
      ].map(([x, y, z, ry], i) => (
        <mesh
          key={i}
          position={[x as number, 0.5 + (y as number), z as number]}
          rotation={[0, ry as number, 0]}
          material={chunkyMat([0.10, 0.08, 0.06], { roughness: 1 })}
        >
          <boxGeometry args={[0.4, 1.4, 0.08]} />
        </mesh>
      ))}

      {/* Azulejo cornice band — blue tile course just under the battlements */}
      <mesh position={[0, 0.5 + towerH - 0.4, 0]} material={blue}>
        <boxGeometry args={[baseW + 0.2, 0.5, baseW + 0.2]} />
      </mesh>

      {/* ── Battlements — chunky toothed cap ── */}
      {/* Cap base */}
      <mesh position={[0, 0.5 + towerH + 0.18, 0]} material={stoneShade}>
        <boxGeometry args={[baseW + 0.4, 0.36, baseW + 0.4]} />
      </mesh>
      {/* Merlons — 4 per side */}
      {[
        [-baseW * 0.35, 0, baseW / 2 + 0.2, baseW * 0.3, 0.3],
        [-baseW * 0.12, 0, baseW / 2 + 0.2, baseW * 0.18, 0.3],
        [baseW * 0.12, 0, baseW / 2 + 0.2, baseW * 0.18, 0.3],
        [baseW * 0.35, 0, baseW / 2 + 0.2, baseW * 0.3, 0.3],
        [-baseW * 0.35, 0, -baseW / 2 - 0.2, baseW * 0.3, 0.3],
        [-baseW * 0.12, 0, -baseW / 2 - 0.2, baseW * 0.18, 0.3],
        [baseW * 0.12, 0, -baseW / 2 - 0.2, baseW * 0.18, 0.3],
        [baseW * 0.35, 0, -baseW / 2 - 0.2, baseW * 0.3, 0.3],
        [baseW / 2 + 0.2, 0, -baseW * 0.35, 0.3, baseW * 0.3],
        [baseW / 2 + 0.2, 0, -baseW * 0.12, 0.3, baseW * 0.18],
        [baseW / 2 + 0.2, 0, baseW * 0.12, 0.3, baseW * 0.18],
        [baseW / 2 + 0.2, 0, baseW * 0.35, 0.3, baseW * 0.3],
        [-baseW / 2 - 0.2, 0, -baseW * 0.35, 0.3, baseW * 0.3],
        [-baseW / 2 - 0.2, 0, -baseW * 0.12, 0.3, baseW * 0.18],
        [-baseW / 2 - 0.2, 0, baseW * 0.12, 0.3, baseW * 0.18],
        [-baseW / 2 - 0.2, 0, baseW * 0.35, 0.3, baseW * 0.3],
      ].map(([x, _y, z, sx, sz], i) => (
        <mesh
          key={`mer${i}`}
          position={[x as number, 0.5 + towerH + 0.7, z as number]}
          material={stone}
        >
          <boxGeometry args={[sx as number, 0.7, sz as number]} />
        </mesh>
      ))}

      {/* Tower entrance — simple dark door at base, river-facing (-Z) */}
      <mesh position={[0, 0.5 + 1.0, -baseW / 2 + 0.05]} material={chunkyMat([0.22, 0.14, 0.08], { roughness: 1 })}>
        <boxGeometry args={[1.4, 2.2, 0.1]} />
      </mesh>
      <mesh position={[0, 0.5 + 1.05, -baseW / 2 + 0.005]} material={stoneShade}>
        <boxGeometry args={[1.7, 2.4, 0.05]} />
      </mesh>
      {/* Iron-band detail on door */}
      <mesh position={[0, 0.5 + 1.0, -baseW / 2 + 0.02]} material={ironMat}>
        <boxGeometry args={[1.5, 0.1, 0.05]} />
      </mesh>
    </group>
  );
}

// ── Pepper-sack pyramid ───────────────────────────────────────────────────
//
// Five beige sacks stacked in a 3-2 pyramid on a pallet. The signature
// "spice cargo" silhouette of the Carreira da Índia.

function PepperSackPyramid({ position, rotationY }: {
  position: readonly [number, number, number];
  rotationY: number;
}) {
  const sack = chunkyMat(PEPPER_SACK, { roughness: 1 });
  const sackShade = chunkyMat(PEPPER_SACK_SHADE, { roughness: 1 });
  const wood = chunkyMat(TIMBER_PALE, { roughness: 1 });
  const rope = chunkyMat([0.55, 0.42, 0.28], { roughness: 1 });

  return (
    <group position={position as unknown as [number, number, number]} rotation={[0, rotationY, 0]}>
      {/* Wooden pallet underneath */}
      <mesh position={[0, 0.12, 0]} material={wood}>
        <boxGeometry args={[3.4, 0.24, 2.4]} />
      </mesh>
      {/* Bottom row — three sacks */}
      {[-1.0, 0, 1.0].map((x, i) => (
        <mesh
          key={`b${i}`}
          position={[x, 0.7, 0]}
          rotation={[0, i * 0.3, 0]}
          material={i % 2 === 0 ? sack : sackShade}
        >
          <boxGeometry args={[0.95, 0.85, 1.6]} />
        </mesh>
      ))}
      {/* Middle row — two sacks */}
      {[-0.5, 0.5].map((x, i) => (
        <mesh
          key={`m${i}`}
          position={[x, 1.45, 0]}
          rotation={[0, i * 0.4, 0]}
          material={i % 2 === 0 ? sackShade : sack}
        >
          <boxGeometry args={[0.9, 0.8, 1.55]} />
        </mesh>
      ))}
      {/* Top sack */}
      <mesh position={[0, 2.15, 0]} rotation={[0, 0.2, 0]} material={sack}>
        <boxGeometry args={[0.9, 0.8, 1.5]} />
      </mesh>
      {/* Two rope ties around the stack */}
      <mesh position={[0, 1.0, 0.85]} material={rope}>
        <boxGeometry args={[3.0, 0.06, 0.06]} />
      </mesh>
      <mesh position={[0, 1.0, -0.85]} material={rope}>
        <boxGeometry args={[3.0, 0.06, 0.06]} />
      </mesh>
    </group>
  );
}

// ── Armillary sphere on pedestal — Manueline ornament ─────────────────────
//
// Stone pedestal + concentric brass rings + a small gold equatorial. The
// armillary sphere is the heraldic symbol of King Manuel I and the sea
// route. Single distinctive ornament, not a complex mechanical model.

function ArmillarySphere({ position, rotationY }: {
  position: readonly [number, number, number];
  rotationY: number;
}) {
  const stone = chunkyMat(LIMESTONE, { roughness: 1 });
  const stoneShade = chunkyMat(LIMESTONE_SHADOW, { roughness: 1 });
  const brass = chunkyMat([0.78, 0.60, 0.18], { roughness: 0.45, metalness: 0.55 });
  const brassDark = chunkyMat([0.55, 0.42, 0.14], { roughness: 0.5, metalness: 0.5 });

  const ringRef = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!ringRef.current) return;
    // Imperceptibly slow rotation — just a hint of motion.
    ringRef.current.rotation.y = clock.elapsedTime * 0.06;
  });

  return (
    <group position={position as unknown as [number, number, number]} rotation={[0, rotationY, 0]}>
      {/* Pedestal — square base, stepped */}
      <mesh position={[0, 0.3, 0]} material={stoneShade}>
        <boxGeometry args={[1.6, 0.6, 1.6]} />
      </mesh>
      <mesh position={[0, 0.7, 0]} material={stone}>
        <boxGeometry args={[1.2, 0.3, 1.2]} />
      </mesh>
      <mesh position={[0, 1.0, 0]} material={stoneShade}>
        <cylinderGeometry args={[0.45, 0.55, 0.4, 8]} />
      </mesh>
      {/* Sphere — three brass rings */}
      <group ref={ringRef} position={[0, 1.9, 0]}>
        {/* Equatorial ring (horizontal) */}
        <mesh material={brass}>
          <torusGeometry args={[0.7, 0.06, 5, 18]} />
        </mesh>
        {/* Meridian ring (vertical, around X) */}
        <mesh rotation={[Math.PI / 2, 0, 0]} material={brassDark}>
          <torusGeometry args={[0.7, 0.06, 5, 18]} />
        </mesh>
        {/* Solstitial ring (vertical, around Z) */}
        <mesh rotation={[0, 0, Math.PI / 2]} material={brass}>
          <torusGeometry args={[0.7, 0.06, 5, 18]} />
        </mesh>
        {/* Tilted ecliptic band — brighter accent */}
        <mesh rotation={[0.4, 0, 0]} material={brassDark}>
          <torusGeometry args={[0.65, 0.04, 4, 16]} />
        </mesh>
        {/* Tiny center sphere */}
        <mesh material={brass}>
          <sphereGeometry args={[0.16, 8, 6]} />
        </mesh>
      </group>
    </group>
  );
}

// ── Bollard — single small stone post (reused along quay) ─────────────────

function Bollard({ position }: { position: readonly [number, number, number] }) {
  const stone = chunkyMat(STONE_QUAY_DARK, { roughness: 1 });
  const stoneShade = chunkyMat([STONE_QUAY_DARK[0] * 0.7, STONE_QUAY_DARK[1] * 0.7, STONE_QUAY_DARK[2] * 0.7], { roughness: 1 });
  return (
    <group position={position as unknown as [number, number, number]}>
      <mesh position={[0, 0.35, 0]} material={stone}>
        <cylinderGeometry args={[0.22, 0.28, 0.7, 6]} />
      </mesh>
      <mesh position={[0, 0.78, 0]} material={stoneShade}>
        <sphereGeometry args={[0.26, 6, 4]} />
      </mesh>
    </group>
  );
}

// ── Top-level compound ────────────────────────────────────────────────────

export function LisbonCasaDaIndia({ poiId, position }: {
  poiId: string;
  position: readonly [number, number, number];
  rotationY: number;
}) {
  // Reserve seed for future variant tuning even if unused right now.
  void hashStr(poiId);
  const [ax, , az] = position as [number, number, number];

  // Auto-orient toward the water. The compound's local -Z is the quay/river
  // side; we want it to face the actual Tagus, wherever that ended up
  // relative to the snapped land cell. Sample 16 directions around the
  // anchor at three radii and pick the bearing with the most water (lowest
  // averaged terrain). The hash-derived rotationY is intentionally ignored
  // — terrain sampling beats a static seed when the snap can drift.
  const rotationY = useMemo(() => {
    let bestAngle = 0;
    let bestScore = -Infinity;
    for (let i = 0; i < 16; i++) {
      const alpha = (i / 16) * Math.PI * 2;
      let score = 0;
      for (const r of [18, 30, 44]) {
        const sx = ax + Math.sin(alpha) * r;
        const sz = az + Math.cos(alpha) * r;
        const h = getTerrainHeight(sx, sz);
        score += SEA_LEVEL - h; // deeper water → larger positive contribution
      }
      if (score > bestScore) {
        bestScore = score;
        bestAngle = alpha;
      }
    }
    // Three.js Y-rotation maps local (0,0,-1) → world (-sin θ, -cos θ).
    // We want that to point toward (sin α*, cos α*) — the water bearing.
    return Math.atan2(-Math.sin(bestAngle), -Math.cos(bestAngle));
  }, [ax, az]);

  // Three.js R_y(θ): wx = lx·cos θ + lz·sin θ; wz = -lx·sin θ + lz·cos θ.
  // The previous formula here flipped the sign on the X term, so sub-mesh
  // terrain sampling read from the wrong world cell.
  const terrainAt = useMemo(() => {
    return (lx: number, lz: number) => {
      const c = Math.cos(rotationY);
      const s = Math.sin(rotationY);
      const wx = ax + lx * c + lz * s;
      const wz = az - lx * s + lz * c;
      return getTerrainHeight(wx, wz);
    };
  }, [ax, az, rotationY]);

  const anchorY = terrainAt(0, 0);

  // If a sub-mesh's local position rotates out over water, terrainAt drops
  // below SEA_LEVEL and the building sinks. Floor it to the anchor so the
  // quay/buildings always sit on (or above) the snapped land plane.
  const groundY = (lx: number, lz: number) =>
    Math.max(terrainAt(lx, lz), anchorY) - anchorY;

  // Local-space layout. -Z faces the river, +Z faces inland.
  // Tower at -X end, warehouse runs along +X.
  const warehousePos: [number, number] = [2, 4];
  const towerPos: [number, number] = [-12, 4];
  const bannerPos: [number, number] = [-12, 4]; // on top of the tower
  const sackPos: [number, number] = [4, -3];
  const armillaryPos: [number, number] = [-3, -3];

  const warehouseY = groundY(warehousePos[0], warehousePos[1]);
  const towerY = groundY(towerPos[0], towerPos[1]);
  const sackY = groundY(sackPos[0], sackPos[1]);
  const armillaryY = groundY(armillaryPos[0], armillaryPos[1]);

  // Stonework sits a hair above local ground so terrain still reads around it.
  const quayY = 0.05;

  // ── Atmosphere ───────────────────────────────────────────────────────────

  // Smoke — one wisp from the tower (customs hearth / signal fire above).
  const smokePos: [number, number, number] = useMemo(() => {
    const c = Math.cos(rotationY);
    const s = Math.sin(rotationY);
    const lx = towerPos[0];
    const lz = towerPos[1];
    const ly = towerY + 0.5 + 11 + 0.5; // just above the battlements
    return [
      ax + lx * c + lz * s,
      anchorY + ly,
      az - lx * s + lz * c,
    ];
  }, [ax, az, anchorY, towerY, rotationY]);

  // Torch spots — 2 at tower entrance, 2 at arcade ends (warehouse front).
  const torchSpots: POITorchSpot[] = useMemo(() => {
    const c = Math.cos(rotationY);
    const s = Math.sin(rotationY);
    const local: Array<[number, number, number]> = [
      // Tower door flank
      [towerPos[0] - 1.6, towerY + 2.4, towerPos[1] - 2.6],
      [towerPos[0] + 1.6, towerY + 2.4, towerPos[1] - 2.6],
      // Arcade ends (warehouse spans x = -9 to +13 around centerX=2)
      [warehousePos[0] - 10.5, warehouseY + 3.6, warehousePos[1] - 4.2],
      [warehousePos[0] + 10.5, warehouseY + 3.6, warehousePos[1] - 4.2],
    ];
    return local.map(([lx, ly, lz]) => ({
      pos: [
        ax + lx * c + lz * s,
        anchorY + ly,
        az - lx * s + lz * c,
      ] as [number, number, number],
      warmth: 'warm',
    }));
  }, [ax, az, anchorY, towerY, warehouseY, rotationY]);

  // Materials shared at the top level.
  const quayMat = useMemo(() => chunkyMat(STONE_QUAY, { roughness: 1 }), []);
  const quayDarkMat = useMemo(() => chunkyMat(STONE_QUAY_DARK, { roughness: 1 }), []);

  // Bollards — five along the quay edge.
  const bollardXs = [-9, -5, -1, 4, 8];

  return (
    <>
      <POITorchInstancer spots={torchSpots} />
      <ChimneySmoke position={smokePos} warmth="cool" scale={1.0} />

      <group position={position as unknown as [number, number, number]} rotation={[0, rotationY, 0]}>
        {/* ── Stone quay and yard — local paving only, not a shoreline override ── */}
        <mesh
          position={[0, quayY, -2.4]}
          rotation={[-Math.PI / 2, 0, 0]}
          material={quayMat}
        >
          <planeGeometry args={[28, 3.4]} />
        </mesh>
        <mesh
          position={[1.5, quayY - 0.005, 4.8]}
          rotation={[-Math.PI / 2, 0, 0]}
          material={quayDarkMat}
        >
          <planeGeometry args={[25, 9.5]} />
        </mesh>
        <mesh
          position={[-12, quayY - 0.004, 4.4]}
          rotation={[-Math.PI / 2, 0, 0]}
          material={quayMat}
        >
          <planeGeometry args={[8, 8]} />
        </mesh>

        {/* Low rear wall, deliberately shorter than the full compound width. */}
        <mesh position={[1.5, 0.7, 11.8]} material={quayMat}>
          <boxGeometry args={[24, 1.4, 0.5]} />
        </mesh>

        {/* ── Bollards along the quay edge ── */}
        {bollardXs.map((x, i) => (
          <Bollard key={i} position={[x, quayY, -4.2]} />
        ))}

        {/* ── Customs tower ── */}
        <CustomsTower position={[towerPos[0], towerY, towerPos[1]]} rotationY={0} />

        {/* ── Royal banner on top of the tower ── */}
        <WavingBanner
          position={[bannerPos[0] + 1.2, towerY + 0.5 + 11 + 1.0, bannerPos[1]]}
          rotationY={Math.PI / 2}
          width={2.6}
          height={1.6}
          poleHeight={4.0}
          poleColor={TIMBER_DARK}
          finialColor={BANNER_GOLD}
          pattern={{ kind: 'patch', field: BANNER_RED, patch: [0.94, 0.92, 0.88], device: BANNER_GOLD }}
          phase={0.4}
        />

        {/* ── Warehouse ── */}
        <CasaWarehouse position={[warehousePos[0], warehouseY, warehousePos[1]]} rotationY={0} />

        {/* ── Pepper-sack pyramid on the quay ── */}
        <PepperSackPyramid
          position={[sackPos[0], sackY + quayY, sackPos[1]]}
          rotationY={0.3}
        />

        {/* ── Armillary sphere ornament ── */}
        <ArmillarySphere
          position={[armillaryPos[0], armillaryY + quayY, armillaryPos[1]]}
          rotationY={0}
        />
      </group>
    </>
  );
}
