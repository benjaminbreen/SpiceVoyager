// ── Lisbon — Casa da Índia ─────────────────────────────────────────────────
//
// Bespoke high-quality POI. Authoring brief (post-Venice review):
//   - Read first from a high, far camera. Big simple masses, strong color
//     blocks, almost no sub-2u detail. Massing > prop count.
//   - One long arcade-fronted warehouse + one battlemented customs tower
//     + one royal banner waving on the flagpole. Everything else (sack
//     pyramid, armillary sphere, caravel bow) is a single distinctive
//     accent on a stone quay.
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
//   5. Moored caravel bow at the quay's east end — one curved hull and
//      a single mast suggesting active unloading.
//   6. Tagus river plane filling the foreground.
//
// Atmosphere:
//   - Royal banner waves on the flagpole (per-vertex sine on a segmented
//     plane — the only "complex" animation here).
//   - One smoke wisp from the customs hearth at the tower base.
//   - 4 torches: 2 flanking the tower entrance, 2 at the arcade ends.
//   - Caravel bobs gently on the river.

import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { getTerrainHeight } from '../../utils/terrain';
import { chunkyMat, ChimneySmoke, POITorchInstancer, type POITorchSpot } from './atmosphere';

// ── Palette — four core blocks, plus quay/river/timber neutrals ───────────

const LIMESTONE: readonly [number, number, number] = [0.92, 0.90, 0.84];
const LIMESTONE_SHADOW: readonly [number, number, number] = [0.72, 0.70, 0.64];
const TILE_ROOF: readonly [number, number, number] = [0.62, 0.30, 0.20];
const TILE_ROOF_DARK: readonly [number, number, number] = [0.46, 0.22, 0.16];
const AZULEJO_BLUE: readonly [number, number, number] = [0.28, 0.42, 0.66];
const BANNER_RED: readonly [number, number, number] = [0.74, 0.18, 0.20];
const BANNER_GOLD: readonly [number, number, number] = [0.82, 0.66, 0.22];
const STONE_QUAY: readonly [number, number, number] = [0.70, 0.66, 0.58];
const STONE_QUAY_DARK: readonly [number, number, number] = [0.55, 0.52, 0.46];
const TAGUS_WATER: readonly [number, number, number] = [0.32, 0.42, 0.44];
const TAGUS_DEEP: readonly [number, number, number] = [0.18, 0.26, 0.28];
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

// ── Portuguese royal banner — animated waving cloth ───────────────────────
//
// Rectangular cloth on a pole. Uses a segmented PlaneGeometry with per-
// vertex Z displacement on a sine wave; the wave amplitude grows with
// distance from the pole, so the cloth flutters at the trailing edge.
// One material, one geometry — animation lives in vertex positions only.

function PortugueseBanner({ position, rotationY }: {
  position: readonly [number, number, number];
  rotationY: number;
}) {
  const pole = chunkyMat(TIMBER_DARK, { roughness: 1 });
  const finial = chunkyMat(BANNER_GOLD, { roughness: 0.5, metalness: 0.4 });
  const ironMat = chunkyMat(IRON_DARK, { roughness: 0.9 });

  // Banner cloth — front + back faces share a single segmented plane each.
  const flagGeo = useMemo(() => new THREE.PlaneGeometry(2.6, 1.6, 10, 4), []);
  const restPositions = useMemo(() => flagGeo.attributes.position.array.slice(0), [flagGeo]);

  const flagMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: new THREE.Color(...BANNER_RED),
    side: THREE.DoubleSide,
    flatShading: true,
    roughness: 1,
  }), []);

  // Royal-arms shield — a single white rectangle with a small gold dot
  // that reads as "armorial bearing" from above without modeling castles.
  const shieldWhite = chunkyMat([0.94, 0.92, 0.88], { roughness: 1 });
  const shieldGold = chunkyMat(BANNER_GOLD, { roughness: 0.5, metalness: 0.4 });

  const flagRef = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const mesh = flagRef.current;
    if (!mesh) return;
    const pos = mesh.geometry.attributes.position;
    const t = clock.elapsedTime;
    for (let i = 0; i < pos.count; i++) {
      const rx = restPositions[i * 3];
      const ry = restPositions[i * 3 + 1];
      // Distance from the pole edge (left side of the plane, x = -1.3).
      const distFromPole = (rx + 1.3) / 2.6; // 0 at pole, 1 at trailing edge
      // Wave grows quadratically with distance from pole.
      const amp = distFromPole * distFromPole * 0.32;
      const wave = Math.sin(rx * 3.5 + t * 4.0) * amp + Math.sin(rx * 7 + t * 6 + ry * 2) * amp * 0.4;
      pos.setX(i, rx);
      pos.setY(i, ry);
      pos.setZ(i, wave);
    }
    pos.needsUpdate = true;
    mesh.geometry.computeVertexNormals();
  });

  return (
    <group position={position as unknown as [number, number, number]} rotation={[0, rotationY, 0]}>
      {/* Pole */}
      <mesh position={[0, 2.0, 0]} material={pole}>
        <cylinderGeometry args={[0.08, 0.1, 4.0, 6]} />
      </mesh>
      {/* Pole bracket (iron) at base */}
      <mesh position={[0, 0.18, 0]} material={ironMat}>
        <boxGeometry args={[0.3, 0.36, 0.3]} />
      </mesh>
      {/* Gold finial at top */}
      <mesh position={[0, 4.18, 0]} material={finial}>
        <coneGeometry args={[0.14, 0.4, 6]} />
      </mesh>
      {/* Banner cloth — anchored at the pole, drifting along +X */}
      <mesh
        ref={flagRef}
        position={[1.3, 3.0, 0]}
        geometry={flagGeo}
        material={flagMat}
      />
      {/* Royal-arms patch — small white square near the pole side of the
          banner. Doesn't animate — it sits on the unbent area near the pole. */}
      <mesh position={[0.5, 3.0, 0.02]} material={shieldWhite}>
        <boxGeometry args={[0.7, 0.7, 0.04]} />
      </mesh>
      <mesh position={[0.5, 3.0, 0.05]} material={shieldGold}>
        <boxGeometry args={[0.18, 0.18, 0.04]} />
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

// ── Caravel bow — moored at the quay's east end ───────────────────────────
//
// Just the bow + a stub of one mast — suggests "ship being unloaded" without
// modeling a full carrack. Reads as a curved dark hull from above, with a
// single tall mast and a furled sail bundle.

function CaravelBow({ position, rotationY }: {
  position: readonly [number, number, number];
  rotationY: number;
}) {
  const hullDark = chunkyMat(TIMBER_DARK, { roughness: 1 });
  const hullPale = chunkyMat(TIMBER_PALE, { roughness: 1 });
  const mast = chunkyMat([0.45, 0.32, 0.18], { roughness: 1 });
  const sailBundle = chunkyMat([0.86, 0.82, 0.72], { roughness: 1 });
  const cross = chunkyMat([0.65, 0.18, 0.18], { roughness: 1 });
  const ironMat = chunkyMat(IRON_DARK, { roughness: 0.9 });

  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.elapsedTime;
    ref.current.position.y = Math.sin(t * 0.55) * 0.1;
    ref.current.rotation.z = Math.sin(t * 0.4) * 0.012;
  });

  return (
    <group ref={ref} position={position as unknown as [number, number, number]} rotation={[0, rotationY, 0]}>
      {/* Main hull body — long box (vessel runs along local +X) */}
      <mesh position={[0, 0.5, 0]} material={hullDark}>
        <boxGeometry args={[8.0, 1.2, 2.4]} />
      </mesh>
      {/* Slightly raised forecastle at +X end */}
      <mesh position={[3.4, 1.1, 0]} material={hullDark}>
        <boxGeometry args={[1.6, 1.0, 2.4]} />
      </mesh>
      {/* Raised aftcastle at -X end */}
      <mesh position={[-3.4, 1.3, 0]} material={hullDark}>
        <boxGeometry args={[1.6, 1.4, 2.4]} />
      </mesh>
      {/* Pointed prow — angled wedge at +X */}
      <mesh position={[4.2, 0.9, 0]} rotation={[0, 0, 0.3]} material={hullDark}>
        <boxGeometry args={[1.0, 0.9, 1.6]} />
      </mesh>
      {/* Pale strake — thin decorative band */}
      <mesh position={[0, 1.0, 1.21]} material={hullPale}>
        <boxGeometry args={[7.0, 0.18, 0.04]} />
      </mesh>
      <mesh position={[0, 1.0, -1.21]} material={hullPale}>
        <boxGeometry args={[7.0, 0.18, 0.04]} />
      </mesh>
      {/* Iron capstan on the foredeck */}
      <mesh position={[2.8, 1.6, 0]} material={ironMat}>
        <cylinderGeometry args={[0.28, 0.3, 0.5, 6]} />
      </mesh>
      {/* Single tall mast */}
      <mesh position={[0, 5.2, 0]} material={mast}>
        <cylinderGeometry args={[0.16, 0.22, 8.0, 6]} />
      </mesh>
      {/* Yard arm — horizontal beam */}
      <mesh position={[0, 7.5, 0]} material={mast}>
        <boxGeometry args={[3.6, 0.16, 0.16]} />
      </mesh>
      {/* Furled sail bundle hanging from the yard */}
      <mesh position={[0, 7.0, 0]} material={sailBundle}>
        <cylinderGeometry args={[0.28, 0.28, 3.0, 8]} />
      </mesh>
      {/* Cross of Christ on a small banner at the mast top */}
      <mesh position={[0, 8.2, 0]} material={sailBundle}>
        <boxGeometry args={[0.7, 0.7, 0.04]} />
      </mesh>
      <mesh position={[0, 8.2, 0.03]} material={cross}>
        <boxGeometry args={[0.5, 0.16, 0.04]} />
      </mesh>
      <mesh position={[0, 8.2, 0.03]} material={cross}>
        <boxGeometry args={[0.16, 0.5, 0.04]} />
      </mesh>
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

export function LisbonCasaDaIndia({ poiId, position, rotationY }: {
  poiId: string;
  position: readonly [number, number, number];
  rotationY: number;
}) {
  // Reserve seed for future variant tuning even if unused right now.
  void hashStr(poiId);
  const [ax, , az] = position as [number, number, number];

  const terrainAt = useMemo(() => {
    return (lx: number, lz: number) => {
      const c = Math.cos(rotationY);
      const s = Math.sin(rotationY);
      const wx = ax + (lx * c - lz * s);
      const wz = az + (lx * s + lz * c);
      return getTerrainHeight(wx, wz);
    };
  }, [ax, az, rotationY]);

  const anchorY = terrainAt(0, 0);

  // Local-space layout. -Z is the river, +Z is inland.
  // Tower at -X end, warehouse runs along +X, caravel at the +X end of quay.
  const warehousePos: [number, number] = [2, 4];
  const towerPos: [number, number] = [-12, 4];
  const bannerPos: [number, number] = [-12, 4]; // on top of the tower
  const sackPos: [number, number] = [4, -3];
  const armillaryPos: [number, number] = [-3, -3];
  const caravelPos: [number, number] = [10, -10];

  const warehouseY = terrainAt(warehousePos[0], warehousePos[1]) - anchorY;
  const towerY = terrainAt(towerPos[0], towerPos[1]) - anchorY;
  const sackY = terrainAt(sackPos[0], sackPos[1]) - anchorY;
  const armillaryY = terrainAt(armillaryPos[0], armillaryPos[1]) - anchorY;

  // Quay sits a hair above local ground; river surface is below.
  const quayY = 0.05;
  const riverSurfaceY = -0.5;

  // ── Atmosphere ───────────────────────────────────────────────────────────

  // Smoke — one wisp from the tower (customs hearth / signal fire above).
  const smokePos: [number, number, number] = useMemo(() => {
    const c = Math.cos(rotationY);
    const s = Math.sin(rotationY);
    const lx = towerPos[0];
    const lz = towerPos[1];
    const ly = towerY + 0.5 + 11 + 0.5; // just above the battlements
    return [
      ax + (lx * c - lz * s),
      anchorY + ly,
      az + (lx * s + lz * c),
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
        ax + (lx * c - lz * s),
        anchorY + ly,
        az + (lx * s + lz * c),
      ] as [number, number, number],
      warmth: 'warm',
    }));
  }, [ax, az, anchorY, towerY, warehouseY, rotationY]);

  // Materials shared at the top level.
  const quayMat = useMemo(() => chunkyMat(STONE_QUAY, { roughness: 1 }), []);
  const quayDarkMat = useMemo(() => chunkyMat(STONE_QUAY_DARK, { roughness: 1 }), []);
  const riverMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: new THREE.Color(...TAGUS_WATER),
    flatShading: true,
    roughness: 0.3,
    metalness: 0.55,
    transparent: true,
    opacity: 0.92,
  }), []);
  const riverDeepMat = useMemo(() => chunkyMat(TAGUS_DEEP, { roughness: 1 }), []);

  // Bollards — five along the quay edge.
  const bollardXs = [-9, -5, -1, 4, 8];

  return (
    <>
      <POITorchInstancer spots={torchSpots} />
      <ChimneySmoke position={smokePos} warmth="cool" scale={1.0} />

      <group position={position as unknown as [number, number, number]} rotation={[0, rotationY, 0]}>
        {/* ── Tagus river plane (main foreground water) ── */}
        <mesh
          position={[0, riverSurfaceY, -12]}
          rotation={[-Math.PI / 2, 0, 0]}
          material={riverMat}
        >
          <planeGeometry args={[40, 16]} />
        </mesh>
        <mesh
          position={[0, riverSurfaceY - 0.25, -12]}
          rotation={[-Math.PI / 2, 0, 0]}
          material={riverDeepMat}
        >
          <planeGeometry args={[40, 16]} />
        </mesh>

        {/* ── Stone quay (Cais da Pedra) running along the river edge ── */}
        <mesh
          position={[0, quayY, -2.5]}
          rotation={[-Math.PI / 2, 0, 0]}
          material={quayMat}
        >
          <planeGeometry args={[32, 4.5]} />
        </mesh>
        {/* Quay retaining wall — Istrian-style stone band facing the water */}
        <mesh position={[0, -0.18, -4.6]} material={quayMat}>
          <boxGeometry args={[32, 0.6, 0.5]} />
        </mesh>
        <mesh position={[0, -0.6, -4.65]} material={quayDarkMat}>
          <boxGeometry args={[32, 0.5, 0.4]} />
        </mesh>

        {/* Inland paving — darker stone behind the quay, in front of arcade */}
        <mesh
          position={[0, quayY - 0.005, 5]}
          rotation={[-Math.PI / 2, 0, 0]}
          material={quayDarkMat}
        >
          <planeGeometry args={[32, 16]} />
        </mesh>

        {/* Low back wall closing the compound at +Z */}
        <mesh position={[0, 0.7, 14]} material={quayMat}>
          <boxGeometry args={[32, 1.4, 0.5]} />
        </mesh>

        {/* ── Bollards along the quay edge ── */}
        {bollardXs.map((x, i) => (
          <Bollard key={i} position={[x, quayY, -4.2]} />
        ))}

        {/* ── Customs tower ── */}
        <CustomsTower position={[towerPos[0], towerY, towerPos[1]]} rotationY={0} />

        {/* ── Royal banner on top of the tower ── */}
        <PortugueseBanner
          position={[bannerPos[0] + 1.2, towerY + 0.5 + 11 + 1.0, bannerPos[1]]}
          rotationY={Math.PI / 2}
        />

        {/* ── Warehouse ── */}
        <CasaWarehouse position={[warehousePos[0], warehouseY, warehousePos[1]]} rotationY={0} />

        {/* ── Pepper-sack pyramid on the quay ── */}
        <PepperSackPyramid
          position={[sackPos[0], terrainAt(sackPos[0], sackPos[1]) - anchorY + quayY, sackPos[1]]}
          rotationY={0.3}
        />

        {/* ── Armillary sphere ornament ── */}
        <ArmillarySphere
          position={[armillaryPos[0], terrainAt(armillaryPos[0], armillaryPos[1]) - anchorY + quayY, armillaryPos[1]]}
          rotationY={0}
        />

        {/* ── Moored caravel bow at the east end of the quay ── */}
        <CaravelBow
          position={[caravelPos[0], riverSurfaceY + 0.1, caravelPos[1]]}
          rotationY={Math.PI}
        />
      </group>
    </>
  );
}
