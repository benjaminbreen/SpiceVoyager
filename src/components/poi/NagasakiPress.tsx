// ── Nagasaki Jesuit Press — Todos os Santos ────────────────────────────────
//
// Bespoke high-quality POI: the hilltop seminary above Nagasaki harbor in
// 1612, where Padre João Rodrigues Tçuzu's press produces romanized-Japanese
// (rōmaji) Christian texts. Two years before the 1614 expulsion. The
// architecture is the signature visual: Japanese post-and-beam temple
// vernacular fused with Tridentine Christian iconography.
//
// Top-down legibility (the player's default camera is high & far):
//   1. Hipped, deep-eaved double-tier tile roof — the biggest single
//      top-down silhouette, with the cross at its apex
//   2. Sanmon-style entry gate with cross above, on the front edge
//   3. Approach path of raked gravel flanked by 5 stone lanterns —
//      strong rhythmic geometric pattern leading the eye to the church
//   4. Press shed to the right with a printing press visible through
//      open shutters
//   5. Bell tower as a counterpoint vertical
//   6. Plum tree in pink bloom + bonsai-pruned pine breaking the silhouette
//   7. Christian-Japanese gravestones (cross-topped sotoba) tucked at the
//      back corner
//   8. Low irregular-stone perimeter wall (Japanese castle-base style)
//
// Atmosphere:
//   - 5 stone lanterns + 1 gate torch — emissive lantern boxes that glow
//     warmly at night, all flickering through the shared instancer
//   - Thin smoke from a small brazier (incense / cooking)
//   - Subtle plum-branch and pine-bough sway
//   - Lit shoji panels on the church at night

import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { getTerrainHeight } from '../../utils/terrain';
import { chunkyMat, BoundaryWall, ChimneySmoke, POITorchInstancer, getNightFactor, type POITorchSpot } from './atmosphere';
import { useGameStore } from '../../store/gameStore';

// ── Palette — cool temperate Kyushu, distinct from arid Indian Ocean ──────

const ROOF_TILE: readonly [number, number, number] = [0.30, 0.31, 0.34];
const ROOF_TILE_DARK: readonly [number, number, number] = [0.20, 0.21, 0.24];
const ROOF_RIDGE: readonly [number, number, number] = [0.16, 0.17, 0.20];
const PLASTER: readonly [number, number, number] = [0.88, 0.85, 0.76];
const PLASTER_SHADOW: readonly [number, number, number] = [0.66, 0.62, 0.52];
const HINOKI: readonly [number, number, number] = [0.42, 0.30, 0.20];
const HINOKI_PALE: readonly [number, number, number] = [0.55, 0.42, 0.28];
const STONE_PALE: readonly [number, number, number] = [0.62, 0.60, 0.55];
const STONE_DARK: readonly [number, number, number] = [0.42, 0.42, 0.40];
const PINE_DARK: readonly [number, number, number] = [0.18, 0.30, 0.18];
const PINE_BRIGHT: readonly [number, number, number] = [0.28, 0.42, 0.22];
const PLUM_TRUNK: readonly [number, number, number] = [0.22, 0.16, 0.12];
const PLUM_BLOSSOM: readonly [number, number, number] = [0.94, 0.78, 0.82];
const PLUM_BLOSSOM_DEEP: readonly [number, number, number] = [0.84, 0.62, 0.68];
const BRONZE: readonly [number, number, number] = [0.55, 0.40, 0.18];
const STONE_LANTERN: readonly [number, number, number] = [0.55, 0.53, 0.48];
const CROSS_DARK: readonly [number, number, number] = [0.28, 0.20, 0.14];
const PAPER_BOOK: readonly [number, number, number] = [0.85, 0.78, 0.62];

// ── RNG ────────────────────────────────────────────────────────────────────

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

// ── Tridentine cross — wooden Latin cross, used at multiple sites ─────────

function TridentineCross({ position, scale = 1, rotationY = 0 }: {
  position: readonly [number, number, number];
  scale?: number;
  rotationY?: number;
}) {
  const wood = chunkyMat(CROSS_DARK, { roughness: 0.95 });
  return (
    <group
      position={position as unknown as [number, number, number]}
      rotation={[0, rotationY, 0]}
      scale={[scale, scale, scale]}
    >
      <mesh position={[0, 0.7, 0]} material={wood}>
        <boxGeometry args={[0.18, 1.4, 0.18]} />
      </mesh>
      <mesh position={[0, 1.0, 0]} material={wood}>
        <boxGeometry args={[0.85, 0.16, 0.18]} />
      </mesh>
    </group>
  );
}

// ── Church — Todos os Santos ─────────────────────────────────────────────
//
// Two-tier hipped roof with deep eaves, post-and-beam wall frame, plaster
// panels between posts, paper shoji panels on the front. Wide stone steps
// lead up to an open central bay. Tridentine cross at the roof apex.

function NagasakiChurch({ position, rotationY }: {
  position: readonly [number, number, number];
  rotationY: number;
}) {
  const w = 14;
  const d = 9;
  const wallH = 4.0;
  const eaveOverhang = 2.4;
  const plinthH = 0.7;
  const wallTopY = plinthH + 0.3 + wallH;          // y where wall meets the kumimono beam
  const lowerRoofBase = wallTopY + 0.36;            // bottom of the lower roof
  const lowerRoofH = 1.6;
  const upperRoofBase = lowerRoofBase + lowerRoofH + 0.4;
  const upperRoofH = 1.1;
  const roofPeakY = upperRoofBase + upperRoofH + 0.3;

  const stoneLight = chunkyMat(STONE_PALE, { roughness: 1 });
  const stoneDark = chunkyMat(STONE_DARK, { roughness: 1 });
  const post = chunkyMat(HINOKI, { roughness: 1 });
  const beam = chunkyMat(HINOKI_PALE, { roughness: 1 });
  const plaster = chunkyMat(PLASTER, { roughness: 1 });
  const plasterShade = chunkyMat(PLASTER_SHADOW, { roughness: 1 });
  const tile = chunkyMat(ROOF_TILE, { roughness: 0.85 });
  const tileDark = chunkyMat(ROOF_TILE_DARK, { roughness: 0.85 });
  const ridge = chunkyMat(ROOF_RIDGE, { roughness: 0.8 });

  // Lit shoji material — paper panels glow softly at night.
  const shojiGlow = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#cdc4a0',
    emissive: '#ffd680',
    emissiveIntensity: 0,
    flatShading: true,
    roughness: 0.85,
  }), []);
  // Dark interior of the open central bay — glows like a lit chapel at night.
  const archGlow = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#1c150d',
    emissive: '#ffaa55',
    emissiveIntensity: 0.06,
    flatShading: true,
    roughness: 0.9,
  }), []);

  useFrame(() => {
    const timeOfDay = useGameStore.getState().timeOfDay;
    const n = getNightFactor(timeOfDay);
    shojiGlow.emissiveIntensity = n * 0.85;
    archGlow.emissiveIntensity = 0.06 + n * 0.6;
  });

  return (
    <group position={position as unknown as [number, number, number]} rotation={[0, rotationY, 0]}>
      {/* Stone foundation plinth */}
      <mesh position={[0, plinthH * 0.5, 0]} material={stoneLight}>
        <boxGeometry args={[w + 0.6, plinthH, d + 0.6]} />
      </mesh>
      {/* Visible irregular stones along the plinth edges (Japanese castle-base look) */}
      {[
        [-w * 0.4, -d / 2 - 0.3], [-w * 0.13, -d / 2 - 0.3], [w * 0.13, -d / 2 - 0.3], [w * 0.4, -d / 2 - 0.3],
        [-w * 0.4, d / 2 + 0.3], [-w * 0.13, d / 2 + 0.3], [w * 0.13, d / 2 + 0.3], [w * 0.4, d / 2 + 0.3],
      ].map(([x, z], i) => (
        <mesh
          key={i}
          position={[x, 0.32 + (i % 2) * 0.12, z]}
          rotation={[0, (i * 0.7) % Math.PI, 0]}
          material={i % 2 === 0 ? stoneDark : stoneLight}
        >
          <boxGeometry args={[1.6, 0.55 + (i % 3) * 0.18, 0.45]} />
        </mesh>
      ))}

      {/* Wide stone steps up the front (toward -Z) */}
      {[0, 1, 2].map((i) => (
        <mesh
          key={i}
          position={[0, plinthH + 0.15 - i * 0.22, -d / 2 - 0.7 - i * 0.7]}
          material={stoneDark}
        >
          <boxGeometry args={[5.5 - i * 0.4, 0.28, 0.7]} />
        </mesh>
      ))}

      {/* Wall plinth band */}
      <mesh position={[0, plinthH + 0.15, 0]} material={plaster}>
        <boxGeometry args={[w, 0.3, d]} />
      </mesh>

      {/* Post-and-beam frame: 4 corner posts + 4 mid posts + 2 side-mid posts */}
      {[
        [-w / 2 + 0.4, -d / 2 + 0.4],
        [w / 2 - 0.4, -d / 2 + 0.4],
        [-w / 2 + 0.4, d / 2 - 0.4],
        [w / 2 - 0.4, d / 2 - 0.4],
        [-w * 0.18, -d / 2 + 0.4],
        [w * 0.18, -d / 2 + 0.4],
        [-w * 0.18, d / 2 - 0.4],
        [w * 0.18, d / 2 - 0.4],
        [-w / 2 + 0.4, 0],
        [w / 2 - 0.4, 0],
      ].map(([x, z], i) => (
        <mesh key={i} position={[x, plinthH + 0.3 + wallH * 0.5, z]} material={post}>
          <boxGeometry args={[0.45, wallH, 0.45]} />
        </mesh>
      ))}

      {/* Back wall (plaster, full panel) */}
      <mesh position={[0, plinthH + 0.3 + wallH * 0.5, d / 2 - 0.1]} material={plaster}>
        <boxGeometry args={[w - 1.2, wallH, 0.18]} />
      </mesh>
      {/* Side walls */}
      <mesh position={[-w / 2 + 0.1, plinthH + 0.3 + wallH * 0.5, 0]} material={plaster}>
        <boxGeometry args={[0.18, wallH, d - 1.2]} />
      </mesh>
      <mesh position={[w / 2 - 0.1, plinthH + 0.3 + wallH * 0.5, 0]} material={plaster}>
        <boxGeometry args={[0.18, wallH, d - 1.2]} />
      </mesh>
      {/* Side wall shadow strips */}
      <mesh position={[-w / 2 + 0.04, plinthH + 0.3 + wallH * 0.4, 0]} material={plasterShade}>
        <boxGeometry args={[0.06, wallH * 0.8, d - 1.5]} />
      </mesh>
      <mesh position={[w / 2 - 0.04, plinthH + 0.3 + wallH * 0.4, 0]} material={plasterShade}>
        <boxGeometry args={[0.06, wallH * 0.8, d - 1.5]} />
      </mesh>

      {/* Front wall: two flanking shoji panels + open central bay */}
      <mesh position={[-w * 0.32, plinthH + 0.3 + wallH * 0.5, -d / 2 + 0.1]} material={shojiGlow}>
        <boxGeometry args={[w * 0.25, wallH * 0.85, 0.12]} />
      </mesh>
      {/* Lattice grid on left shoji */}
      {Array.from({ length: 4 }).map((_, i) => (
        <mesh
          key={`lh${i}`}
          position={[-w * 0.32, plinthH + 0.3 + 0.6 + i * (wallH * 0.85 / 4), -d / 2 + 0.18]}
          material={post}
        >
          <boxGeometry args={[w * 0.25, 0.05, 0.04]} />
        </mesh>
      ))}
      {Array.from({ length: 4 }).map((_, i) => (
        <mesh
          key={`lv${i}`}
          position={[-w * 0.32 - w * 0.1 + i * (w * 0.06), plinthH + 0.3 + wallH * 0.5, -d / 2 + 0.18]}
          material={post}
        >
          <boxGeometry args={[0.05, wallH * 0.8, 0.04]} />
        </mesh>
      ))}
      {/* Right shoji + lattice */}
      <mesh position={[w * 0.32, plinthH + 0.3 + wallH * 0.5, -d / 2 + 0.1]} material={shojiGlow}>
        <boxGeometry args={[w * 0.25, wallH * 0.85, 0.12]} />
      </mesh>
      {Array.from({ length: 4 }).map((_, i) => (
        <mesh
          key={`rh${i}`}
          position={[w * 0.32, plinthH + 0.3 + 0.6 + i * (wallH * 0.85 / 4), -d / 2 + 0.18]}
          material={post}
        >
          <boxGeometry args={[w * 0.25, 0.05, 0.04]} />
        </mesh>
      ))}
      {Array.from({ length: 4 }).map((_, i) => (
        <mesh
          key={`rv${i}`}
          position={[w * 0.32 - w * 0.1 + i * (w * 0.06), plinthH + 0.3 + wallH * 0.5, -d / 2 + 0.18]}
          material={post}
        >
          <boxGeometry args={[0.05, wallH * 0.8, 0.04]} />
        </mesh>
      ))}

      {/* Open central bay — dark interior glow */}
      <mesh position={[0, plinthH + 0.3 + 1.5, -d / 2 + 0.2]} material={archGlow}>
        <boxGeometry args={[2.6, 3.0, 0.1]} />
      </mesh>
      {/* Bay header beam */}
      <mesh position={[0, plinthH + 0.3 + 3.2, -d / 2 + 0.3]} material={beam}>
        <boxGeometry args={[3.0, 0.3, 0.32]} />
      </mesh>

      {/* Continuous wall-top beam (kumimono platform) */}
      <mesh position={[0, wallTopY, 0]} material={beam}>
        <boxGeometry args={[w + 0.4, 0.36, d + 0.4]} />
      </mesh>

      {/* ── Lower hipped roof — deep overhanging eave ──
          Built from 4 tilted slabs around a flat platform. Each slab is a
          long thin box rotated outward; the top of the slab meets the
          ridge platform, the bottom hangs out past the wall. */}
      {/* Front slab */}
      <mesh
        position={[0, lowerRoofBase + lowerRoofH * 0.5, -d / 2 - eaveOverhang * 0.42]}
        rotation={[0.55, 0, 0]}
        material={tile}
      >
        <boxGeometry args={[w + eaveOverhang * 0.3, 0.34, eaveOverhang + 1.4]} />
      </mesh>
      {/* Back slab */}
      <mesh
        position={[0, lowerRoofBase + lowerRoofH * 0.5, d / 2 + eaveOverhang * 0.42]}
        rotation={[-0.55, 0, 0]}
        material={tile}
      >
        <boxGeometry args={[w + eaveOverhang * 0.3, 0.34, eaveOverhang + 1.4]} />
      </mesh>
      {/* Left slab */}
      <mesh
        position={[-w / 2 - eaveOverhang * 0.42, lowerRoofBase + lowerRoofH * 0.5, 0]}
        rotation={[0, 0, -0.55]}
        material={tileDark}
      >
        <boxGeometry args={[eaveOverhang + 1.0, 0.34, d + eaveOverhang * 0.3]} />
      </mesh>
      {/* Right slab */}
      <mesh
        position={[w / 2 + eaveOverhang * 0.42, lowerRoofBase + lowerRoofH * 0.5, 0]}
        rotation={[0, 0, 0.55]}
        material={tileDark}
      >
        <boxGeometry args={[eaveOverhang + 1.0, 0.34, d + eaveOverhang * 0.3]} />
      </mesh>
      {/* Lower-roof ridge platform — flat top connecting the slabs */}
      <mesh position={[0, lowerRoofBase + lowerRoofH + 0.1, 0]} material={ridge}>
        <boxGeometry args={[w * 0.6, 0.2, d * 0.5]} />
      </mesh>
      {/* Upturned-eave wing tips at the 4 corners — small angled blocks */}
      {[
        [-w / 2 - eaveOverhang * 0.55, -d / 2 - eaveOverhang * 0.55, 0.4, 0.4],
        [w / 2 + eaveOverhang * 0.55, -d / 2 - eaveOverhang * 0.55, -0.4, 0.4],
        [-w / 2 - eaveOverhang * 0.55, d / 2 + eaveOverhang * 0.55, 0.4, -0.4],
        [w / 2 + eaveOverhang * 0.55, d / 2 + eaveOverhang * 0.55, -0.4, -0.4],
      ].map(([x, z, rx, rz], i) => (
        <mesh
          key={i}
          position={[x, lowerRoofBase + 0.15, z]}
          rotation={[rz as number, 0, rx as number]}
          material={tile}
        >
          <boxGeometry args={[1.4, 0.28, 1.4]} />
        </mesh>
      ))}

      {/* ── Upper roof — smaller pyramid sitting on the lower-roof ridge ── */}
      {/* Front upper slab */}
      <mesh
        position={[0, upperRoofBase + upperRoofH * 0.5, -d * 0.18]}
        rotation={[0.7, 0, 0]}
        material={tile}
      >
        <boxGeometry args={[w * 0.55, 0.3, d * 0.5]} />
      </mesh>
      {/* Back upper slab */}
      <mesh
        position={[0, upperRoofBase + upperRoofH * 0.5, d * 0.18]}
        rotation={[-0.7, 0, 0]}
        material={tile}
      >
        <boxGeometry args={[w * 0.55, 0.3, d * 0.5]} />
      </mesh>
      {/* Left upper slab */}
      <mesh
        position={[-w * 0.22, upperRoofBase + upperRoofH * 0.5, 0]}
        rotation={[0, 0, -0.7]}
        material={tileDark}
      >
        <boxGeometry args={[w * 0.4, 0.3, d * 0.32]} />
      </mesh>
      {/* Right upper slab */}
      <mesh
        position={[w * 0.22, upperRoofBase + upperRoofH * 0.5, 0]}
        rotation={[0, 0, 0.7]}
        material={tileDark}
      >
        <boxGeometry args={[w * 0.4, 0.3, d * 0.32]} />
      </mesh>
      {/* Upper roof ridge */}
      <mesh position={[0, upperRoofBase + upperRoofH + 0.05, 0]} material={ridge}>
        <boxGeometry args={[w * 0.32, 0.18, 0.6]} />
      </mesh>
      {/* Ridge ornament — a small bronze finial under the cross */}
      <mesh position={[0, roofPeakY - 0.15, 0]} material={chunkyMat(BRONZE, { roughness: 0.5, metalness: 0.5 })}>
        <cylinderGeometry args={[0.2, 0.28, 0.4, 6]} />
      </mesh>
      {/* Tridentine cross on the apex */}
      <TridentineCross position={[0, roofPeakY, 0]} scale={1.6} />
    </group>
  );
}

// ── Sanmon-style entry gate ───────────────────────────────────────────────
//
// Two thick wooden posts + horizontal lintel + small tile roof + cross
// above. Reads as "this is the entry" from above thanks to the cross
// counterpoint above the path.

function SanmonGate({ position, rotationY }: {
  position: readonly [number, number, number];
  rotationY: number;
}) {
  const post = chunkyMat(HINOKI, { roughness: 1 });
  const beam = chunkyMat(HINOKI_PALE, { roughness: 1 });
  const tile = chunkyMat(ROOF_TILE, { roughness: 0.85 });
  const tileDark = chunkyMat(ROOF_TILE_DARK, { roughness: 0.85 });
  const stone = chunkyMat(STONE_PALE, { roughness: 1 });

  return (
    <group position={position as unknown as [number, number, number]} rotation={[0, rotationY, 0]}>
      {/* Stone bases for the posts */}
      <mesh position={[-2.0, 0.35, 0]} material={stone}>
        <boxGeometry args={[1.0, 0.7, 1.0]} />
      </mesh>
      <mesh position={[2.0, 0.35, 0]} material={stone}>
        <boxGeometry args={[1.0, 0.7, 1.0]} />
      </mesh>
      {/* Two thick posts */}
      <mesh position={[-2.0, 0.7 + 2.0, 0]} material={post}>
        <boxGeometry args={[0.55, 4.0, 0.55]} />
      </mesh>
      <mesh position={[2.0, 0.7 + 2.0, 0]} material={post}>
        <boxGeometry args={[0.55, 4.0, 0.55]} />
      </mesh>
      {/* Horizontal beams (kumimono — two stacked beams) */}
      <mesh position={[0, 0.7 + 4.1, 0]} material={beam}>
        <boxGeometry args={[5.0, 0.32, 0.5]} />
      </mesh>
      <mesh position={[0, 0.7 + 4.5, 0]} material={beam}>
        <boxGeometry args={[5.4, 0.28, 0.55]} />
      </mesh>
      {/* Tile roof — small pyramidal hipped */}
      <mesh
        position={[0, 0.7 + 5.0, -0.3]}
        rotation={[0.55, 0, 0]}
        material={tile}
      >
        <boxGeometry args={[5.6, 0.25, 1.0]} />
      </mesh>
      <mesh
        position={[0, 0.7 + 5.0, 0.3]}
        rotation={[-0.55, 0, 0]}
        material={tileDark}
      >
        <boxGeometry args={[5.6, 0.25, 1.0]} />
      </mesh>
      {/* Roof ridge */}
      <mesh position={[0, 0.7 + 5.4, 0]} material={chunkyMat(ROOF_RIDGE, { roughness: 0.8 })}>
        <boxGeometry args={[5.2, 0.18, 0.36]} />
      </mesh>
      {/* Cross atop the ridge */}
      <TridentineCross position={[0, 0.7 + 5.55, 0]} scale={1.4} />
    </group>
  );
}

// ── Stone lantern (ishidoro) ──────────────────────────────────────────────
//
// Square base + slim shaft + carved lantern box + stone cap. The light
// itself comes from the shared POITorchInstancer (one torch spot per
// lantern); this geometry is just the housing.

function StoneLantern({ position, rotationY }: {
  position: readonly [number, number, number];
  rotationY: number;
}) {
  const stone = chunkyMat(STONE_LANTERN, { roughness: 1 });
  const stoneDark = chunkyMat([STONE_LANTERN[0] * 0.75, STONE_LANTERN[1] * 0.75, STONE_LANTERN[2] * 0.75], { roughness: 1 });
  const lanternGlow = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#3a2a18',
    emissive: '#ffb060',
    emissiveIntensity: 0,
    flatShading: true,
    roughness: 0.85,
  }), []);

  useFrame(() => {
    const timeOfDay = useGameStore.getState().timeOfDay;
    const n = getNightFactor(timeOfDay);
    lanternGlow.emissiveIntensity = n * 1.6;
  });

  return (
    <group position={position as unknown as [number, number, number]} rotation={[0, rotationY, 0]}>
      {/* Square base */}
      <mesh position={[0, 0.18, 0]} material={stone}>
        <boxGeometry args={[0.8, 0.36, 0.8]} />
      </mesh>
      {/* Plinth */}
      <mesh position={[0, 0.45, 0]} material={stoneDark}>
        <boxGeometry args={[0.55, 0.18, 0.55]} />
      </mesh>
      {/* Slim shaft — slightly tapered hexagonal column */}
      <mesh position={[0, 1.05, 0]} material={stone}>
        <cylinderGeometry args={[0.16, 0.2, 1.0, 6]} />
      </mesh>
      {/* Mid-shaft platform */}
      <mesh position={[0, 1.6, 0]} material={stoneDark}>
        <boxGeometry args={[0.6, 0.16, 0.6]} />
      </mesh>
      {/* Lantern box (the kasaishi) — the chamber that holds the flame */}
      <mesh position={[0, 1.9, 0]} material={stone}>
        <boxGeometry args={[0.65, 0.55, 0.65]} />
      </mesh>
      {/* Glow on each face — four small emissive panels */}
      {[
        [0, 1.9, 0.34, 0],
        [0, 1.9, -0.34, Math.PI],
        [0.34, 1.9, 0, Math.PI / 2],
        [-0.34, 1.9, 0, -Math.PI / 2],
      ].map(([x, y, z, ry], i) => (
        <mesh key={i} position={[x as number, y as number, z as number]} rotation={[0, ry as number, 0]} material={lanternGlow}>
          <boxGeometry args={[0.34, 0.36, 0.04]} />
        </mesh>
      ))}
      {/* Stone cap — peaked four-side pyramid */}
      <mesh position={[0, 2.34, 0]} material={stoneDark}>
        <coneGeometry args={[0.55, 0.5, 4]} />
      </mesh>
      {/* Finial */}
      <mesh position={[0, 2.7, 0]} material={stone}>
        <boxGeometry args={[0.12, 0.2, 0.12]} />
      </mesh>
    </group>
  );
}

// ── Press shed ────────────────────────────────────────────────────────────
//
// Lower-profile wooden building with open shutters; a printing press
// (vertical wooden frame with screw shaft) is visible inside. Stack of
// bound books on a low table outside the door.

function PressShed({ position, rotationY }: {
  position: readonly [number, number, number];
  rotationY: number;
}) {
  const post = chunkyMat(HINOKI, { roughness: 1 });
  const beam = chunkyMat(HINOKI_PALE, { roughness: 1 });
  const plaster = chunkyMat(PLASTER, { roughness: 1 });
  const tile = chunkyMat(ROOF_TILE, { roughness: 0.85 });
  const tileDark = chunkyMat(ROOF_TILE_DARK, { roughness: 0.85 });
  const ridge = chunkyMat(ROOF_RIDGE, { roughness: 0.8 });
  const stone = chunkyMat(STONE_PALE, { roughness: 1 });
  const book = chunkyMat(PAPER_BOOK, { roughness: 0.95 });
  const bookDark = chunkyMat([PAPER_BOOK[0] * 0.6, PAPER_BOOK[1] * 0.55, PAPER_BOOK[2] * 0.5], { roughness: 0.95 });
  const press = chunkyMat([0.36, 0.28, 0.18], { roughness: 0.9 });
  const screw = chunkyMat([0.62, 0.5, 0.32], { roughness: 0.7, metalness: 0.3 });

  const w = 7;
  const d = 5;
  const wallH = 2.8;

  return (
    <group position={position as unknown as [number, number, number]} rotation={[0, rotationY, 0]}>
      {/* Plinth */}
      <mesh position={[0, 0.25, 0]} material={stone}>
        <boxGeometry args={[w + 0.4, 0.5, d + 0.4]} />
      </mesh>
      {/* Wall mass (back + sides) */}
      <mesh position={[0, 0.5 + wallH * 0.5, d / 2 - 0.05]} material={plaster}>
        <boxGeometry args={[w - 0.6, wallH, 0.1]} />
      </mesh>
      <mesh position={[-w / 2 + 0.05, 0.5 + wallH * 0.5, 0]} material={plaster}>
        <boxGeometry args={[0.1, wallH, d - 0.6]} />
      </mesh>
      <mesh position={[w / 2 - 0.05, 0.5 + wallH * 0.5, 0]} material={plaster}>
        <boxGeometry args={[0.1, wallH, d - 0.6]} />
      </mesh>
      {/* Corner posts */}
      {[
        [-w / 2 + 0.2, -d / 2 + 0.2],
        [w / 2 - 0.2, -d / 2 + 0.2],
        [-w / 2 + 0.2, d / 2 - 0.2],
        [w / 2 - 0.2, d / 2 - 0.2],
      ].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.5 + wallH * 0.5, z]} material={post}>
          <boxGeometry args={[0.3, wallH, 0.3]} />
        </mesh>
      ))}
      {/* Wall-top beam */}
      <mesh position={[0, 0.5 + wallH + 0.16, 0]} material={beam}>
        <boxGeometry args={[w + 0.2, 0.32, d + 0.2]} />
      </mesh>
      {/* Hipped roof — same construction as the church but smaller */}
      <mesh position={[0, 0.5 + wallH + 0.7, -0.4]} rotation={[0.55, 0, 0]} material={tile}>
        <boxGeometry args={[w + 1.2, 0.28, d + 0.6]} />
      </mesh>
      <mesh position={[0, 0.5 + wallH + 0.7, 0.4]} rotation={[-0.55, 0, 0]} material={tileDark}>
        <boxGeometry args={[w + 1.2, 0.28, d + 0.6]} />
      </mesh>
      <mesh position={[0, 0.5 + wallH + 1.18, 0]} material={ridge}>
        <boxGeometry args={[w * 0.65, 0.22, 0.5]} />
      </mesh>
      {/* Open front (toward -Z): two shutter doors swung open, the
          printing press visible in the dark interior */}
      {/* Open doorway dark interior */}
      <mesh position={[0, 0.5 + wallH * 0.5, -d / 2 + 0.06]} material={chunkyMat([0.08, 0.06, 0.05], { roughness: 0.9 })}>
        <boxGeometry args={[w * 0.55, wallH * 0.85, 0.06]} />
      </mesh>
      {/* Shutters swung outward */}
      <mesh
        position={[-w * 0.22, 0.5 + wallH * 0.5, -d / 2 - 0.5]}
        rotation={[0, -0.5, 0]}
        material={post}
      >
        <boxGeometry args={[0.08, wallH * 0.85, w * 0.3]} />
      </mesh>
      <mesh
        position={[w * 0.22, 0.5 + wallH * 0.5, -d / 2 - 0.5]}
        rotation={[0, 0.5, 0]}
        material={post}
      >
        <boxGeometry args={[0.08, wallH * 0.85, w * 0.3]} />
      </mesh>
      {/* The press itself — vertical wooden frame inside */}
      <group position={[0, 0.5, -d / 2 + 0.5]}>
        {/* Two upright posts */}
        <mesh position={[-0.6, 1.4, 0.4]} material={press}>
          <boxGeometry args={[0.18, 2.5, 0.18]} />
        </mesh>
        <mesh position={[0.6, 1.4, 0.4]} material={press}>
          <boxGeometry args={[0.18, 2.5, 0.18]} />
        </mesh>
        {/* Top crossbeam */}
        <mesh position={[0, 2.55, 0.4]} material={press}>
          <boxGeometry args={[1.4, 0.18, 0.18]} />
        </mesh>
        {/* Vertical screw shaft (brass-toned) */}
        <mesh position={[0, 1.7, 0.4]} material={screw}>
          <cylinderGeometry args={[0.08, 0.08, 1.5, 8]} />
        </mesh>
        {/* Platen (the flat plate that presses paper) */}
        <mesh position={[0, 1.0, 0.4]} material={press}>
          <boxGeometry args={[1.0, 0.12, 0.7]} />
        </mesh>
        {/* Bed (paper rests here) */}
        <mesh position={[0, 0.55, 0.4]} material={press}>
          <boxGeometry args={[1.1, 0.16, 0.85]} />
        </mesh>
        {/* T-bar handle on the side */}
        <mesh position={[0.85, 1.7, 0.4]} rotation={[0, 0, Math.PI / 2]} material={screw}>
          <cylinderGeometry args={[0.05, 0.05, 0.6, 6]} />
        </mesh>
      </group>
      {/* Stack of books outside the door (low table + 4 stacked volumes) */}
      <group position={[w / 2 - 1.0, 0.5, -d / 2 - 0.5]}>
        <mesh position={[0, 0.3, 0]} material={post}>
          <boxGeometry args={[1.4, 0.6, 0.9]} />
        </mesh>
        {[0, 1, 2, 3].map((i) => (
          <mesh
            key={i}
            position={[(i % 2 === 0 ? -0.25 : 0.25), 0.65 + i * 0.12, (i < 2 ? -0.15 : 0.15)]}
            material={i % 2 === 0 ? book : bookDark}
          >
            <boxGeometry args={[0.55, 0.1, 0.4]} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

// ── Bell tower ────────────────────────────────────────────────────────────
//
// Small standalone four-post wooden tower with a tile cap and a bronze
// bell hanging inside. Counterpoint vertical to the gate.

function BellTower({ position, rotationY }: {
  position: readonly [number, number, number];
  rotationY: number;
}) {
  const post = chunkyMat(HINOKI, { roughness: 1 });
  const beam = chunkyMat(HINOKI_PALE, { roughness: 1 });
  const tile = chunkyMat(ROOF_TILE, { roughness: 0.85 });
  const tileDark = chunkyMat(ROOF_TILE_DARK, { roughness: 0.85 });
  const stone = chunkyMat(STONE_PALE, { roughness: 1 });
  const bronze = chunkyMat(BRONZE, { roughness: 0.5, metalness: 0.55 });
  const bronzeDark = chunkyMat([BRONZE[0] * 0.7, BRONZE[1] * 0.7, BRONZE[2] * 0.6], { roughness: 0.55, metalness: 0.55 });

  // Bell sway — gentle, slow.
  const bellRef = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!bellRef.current) return;
    bellRef.current.rotation.x = Math.sin(clock.elapsedTime * 0.6) * 0.04;
  });

  return (
    <group position={position as unknown as [number, number, number]} rotation={[0, rotationY, 0]}>
      {/* Stone base */}
      <mesh position={[0, 0.3, 0]} material={stone}>
        <boxGeometry args={[2.4, 0.6, 2.4]} />
      </mesh>
      {/* Four posts */}
      {[
        [-0.85, -0.85],
        [0.85, -0.85],
        [-0.85, 0.85],
        [0.85, 0.85],
      ].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.6 + 1.7, z]} material={post}>
          <boxGeometry args={[0.28, 3.4, 0.28]} />
        </mesh>
      ))}
      {/* Top frame */}
      <mesh position={[0, 0.6 + 3.55, 0]} material={beam}>
        <boxGeometry args={[2.2, 0.28, 2.2]} />
      </mesh>
      {/* Tile cap (pyramidal) */}
      <mesh position={[0, 0.6 + 3.95, 0]} material={tile}>
        <coneGeometry args={[1.7, 0.9, 4]} />
      </mesh>
      {/* Cap shadow band */}
      <mesh position={[0, 0.6 + 3.7, 0]} material={tileDark}>
        <cylinderGeometry args={[1.6, 1.7, 0.1, 4]} />
      </mesh>
      {/* Cross atop */}
      <TridentineCross position={[0, 0.6 + 4.4, 0]} scale={0.95} />
      {/* Bell — hangs from top frame, swings */}
      <group ref={bellRef} position={[0, 0.6 + 3.45, 0]}>
        {/* Suspension cord */}
        <mesh position={[0, -0.3, 0]} material={beam}>
          <boxGeometry args={[0.06, 0.6, 0.06]} />
        </mesh>
        {/* Bell body — bowl shape approximated as a tapered cylinder */}
        <mesh position={[0, -0.95, 0]} material={bronze}>
          <cylinderGeometry args={[0.55, 0.4, 0.95, 12]} />
        </mesh>
        {/* Bell rim band */}
        <mesh position={[0, -1.42, 0]} material={bronzeDark}>
          <torusGeometry args={[0.5, 0.06, 4, 14]} />
        </mesh>
        {/* Bell crown */}
        <mesh position={[0, -0.45, 0]} material={bronzeDark}>
          <cylinderGeometry args={[0.18, 0.28, 0.18, 8]} />
        </mesh>
      </group>
    </group>
  );
}

// ── Plum tree in bloom ────────────────────────────────────────────────────
//
// Twisted dark trunk, sparse asymmetric branches, dense pink blossom puffs
// at the branch tips. Smaller than the dragon's blood tree (3-4u tall).
// Subtle sway on a slow sine.

function PlumTree({ position, scale = 1, swayPhase = 0, seed }: {
  position: readonly [number, number, number];
  scale?: number;
  swayPhase?: number;
  seed: number;
}) {
  const rng = mulberry32(seed);
  const trunk = chunkyMat(PLUM_TRUNK, { roughness: 1 });
  const trunkDark = chunkyMat([PLUM_TRUNK[0] * 0.7, PLUM_TRUNK[1] * 0.7, PLUM_TRUNK[2] * 0.7], { roughness: 1 });
  const blossom = chunkyMat(PLUM_BLOSSOM, { roughness: 0.85 });
  const blossomDeep = chunkyMat(PLUM_BLOSSOM_DEEP, { roughness: 0.9 });

  // Two-segment leaning trunk for the twisted look.
  const trunkH = 2.4 * scale;
  const trunkLean = (rng() < 0.5 ? -1 : 1) * 0.18;

  // 5-6 branch tips with puffs.
  const branches: { az: number; tilt: number; len: number; r: number }[] = useMemo(() => {
    const out = [];
    const count = 5 + Math.floor(rng() * 2);
    for (let i = 0; i < count; i++) {
      out.push({
        az: (i / count) * Math.PI * 2 + rng() * 0.5,
        tilt: 0.3 + rng() * 0.35,
        len: 1.2 * scale + rng() * 0.5 * scale,
        r: 0.55 * scale + rng() * 0.25 * scale,
      });
    }
    return out;
  }, [seed, scale]);

  const swayRef = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!swayRef.current) return;
    swayRef.current.rotation.z = Math.sin(clock.elapsedTime * 0.4 + swayPhase) * 0.025;
    swayRef.current.rotation.y = Math.sin(clock.elapsedTime * 0.3 + swayPhase * 1.2) * 0.018;
  });

  return (
    <group position={position as unknown as [number, number, number]}>
      {/* Lower trunk segment (leans one way) */}
      <mesh position={[0, trunkH * 0.3, 0]} rotation={[0, 0, trunkLean]} material={trunk}>
        <cylinderGeometry args={[0.18 * scale, 0.26 * scale, trunkH * 0.6, 6]} />
      </mesh>
      {/* Upper trunk segment (leans the other way — gives the twisted look) */}
      <mesh
        position={[trunkLean * 0.6 * scale, trunkH * 0.7, 0]}
        rotation={[0, 0, -trunkLean * 0.5]}
        material={trunk}
      >
        <cylinderGeometry args={[0.14 * scale, 0.18 * scale, trunkH * 0.5, 6]} />
      </mesh>
      {/* Sway group for branches + blossoms */}
      <group ref={swayRef} position={[trunkLean * 0.7 * scale, trunkH, 0]}>
        {branches.map((b, i) => {
          const dirX = Math.cos(b.az) * Math.sin(b.tilt);
          const dirY = Math.cos(b.tilt);
          const dirZ = Math.sin(b.az) * Math.sin(b.tilt);
          const tipX = dirX * b.len;
          const tipY = dirY * b.len;
          const tipZ = dirZ * b.len;
          const quat = new THREE.Quaternion().setFromUnitVectors(
            new THREE.Vector3(0, 1, 0),
            new THREE.Vector3(dirX, dirY, dirZ),
          );
          const e = new THREE.Euler().setFromQuaternion(quat);
          return (
            <group key={i}>
              {/* Branch */}
              <mesh
                position={[tipX * 0.5, tipY * 0.5, tipZ * 0.5]}
                rotation={[e.x, e.y, e.z]}
                material={trunkDark}
              >
                <cylinderGeometry args={[0.05 * scale, 0.1 * scale, b.len, 5]} />
              </mesh>
              {/* Blossom puff at the tip */}
              <mesh
                position={[tipX, tipY + b.r * 0.2, tipZ]}
                material={blossom}
              >
                <sphereGeometry args={[b.r, 8, 6]} />
              </mesh>
              {/* Slightly darker underside */}
              <mesh
                position={[tipX, tipY - b.r * 0.05, tipZ]}
                scale={[1, 0.5, 1]}
                material={blossomDeep}
              >
                <sphereGeometry args={[b.r * 0.92, 8, 6]} />
              </mesh>
            </group>
          );
        })}
      </group>
      {/* Fallen petals — small pink tiles scattered around the base */}
      {Array.from({ length: 6 }).map((_, i) => {
        const az = (i / 6) * Math.PI * 2;
        const r = 1.0 + (i % 2) * 0.4;
        return (
          <mesh
            key={i}
            position={[Math.cos(az) * r * scale, 0.04, Math.sin(az) * r * scale]}
            rotation={[-Math.PI / 2, 0, az]}
            material={blossom}
          >
            <planeGeometry args={[0.4 * scale, 0.3 * scale]} />
          </mesh>
        );
      })}
    </group>
  );
}

// ── Bonsai-pruned pine ────────────────────────────────────────────────────
//
// Short twisted trunk, horizontal layered foliage tiers (the classic
// niwaki pruning style). Three or four tiers of dark green flat-top puffs.

function PrunedPine({ position, scale = 1, swayPhase = 0, seed }: {
  position: readonly [number, number, number];
  scale?: number;
  swayPhase?: number;
  seed: number;
}) {
  const rng = mulberry32(seed);
  const trunk = chunkyMat([0.4, 0.28, 0.18], { roughness: 1 });
  const dark = chunkyMat(PINE_DARK, { roughness: 1 });
  const bright = chunkyMat(PINE_BRIGHT, { roughness: 0.95 });

  const trunkH = 2.8 * scale;
  const tierCount = 3 + Math.floor(rng() * 2);

  const swayRef = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!swayRef.current) return;
    swayRef.current.rotation.z = Math.sin(clock.elapsedTime * 0.45 + swayPhase) * 0.018;
  });

  const tiers: { y: number; offX: number; offZ: number; r: number }[] = [];
  for (let i = 0; i < tierCount; i++) {
    const f = i / Math.max(tierCount - 1, 1);
    tiers.push({
      y: trunkH * (0.6 + f * 0.6),
      offX: (rng() - 0.5) * 0.6 * scale,
      offZ: (rng() - 0.5) * 0.6 * scale,
      r: (0.9 - f * 0.25) * scale,
    });
  }

  return (
    <group position={position as unknown as [number, number, number]}>
      {/* Twisted trunk — one tilted segment */}
      <mesh position={[0, trunkH * 0.5, 0]} rotation={[0, 0, 0.18]} material={trunk}>
        <cylinderGeometry args={[0.18 * scale, 0.28 * scale, trunkH, 6]} />
      </mesh>
      {/* Tier branches (short horizontal stubs) */}
      <group ref={swayRef}>
        {tiers.map((tier, i) => (
          <group key={i} position={[tier.offX, tier.y, tier.offZ]}>
            {/* Flat foliage disc — the niwaki pruned shape */}
            <mesh material={dark} scale={[1, 0.35, 1]}>
              <sphereGeometry args={[tier.r, 9, 6]} />
            </mesh>
            {/* Highlight bumps on top */}
            <mesh position={[tier.r * 0.25, tier.r * 0.18, 0]} material={bright}>
              <sphereGeometry args={[tier.r * 0.42, 7, 5]} />
            </mesh>
            <mesh position={[-tier.r * 0.2, tier.r * 0.2, tier.r * 0.25]} material={bright}>
              <sphereGeometry args={[tier.r * 0.34, 7, 5]} />
            </mesh>
            {/* Branch stub from trunk to tier */}
            <mesh
              position={[-tier.offX * 0.5, -0.05, -tier.offZ * 0.5]}
              rotation={[0, Math.atan2(tier.offZ, tier.offX) + Math.PI / 2, 0]}
              material={trunk}
            >
              <cylinderGeometry args={[0.06 * scale, 0.08 * scale, Math.hypot(tier.offX, tier.offZ) + 0.5, 5]} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}

// ── Stone basin (tsukubai) ────────────────────────────────────────────────
//
// Low stone bowl with a dark water surface. The classic Japanese garden
// hand-washing stone.

function StoneBasin({ position, rotationY }: {
  position: readonly [number, number, number];
  rotationY: number;
}) {
  const stone = chunkyMat(STONE_DARK, { roughness: 1 });
  const stoneShade = chunkyMat([STONE_DARK[0] * 0.7, STONE_DARK[1] * 0.7, STONE_DARK[2] * 0.7], { roughness: 1 });
  const water = chunkyMat([0.16, 0.22, 0.26], { roughness: 0.2, metalness: 0.7 });
  return (
    <group position={position as unknown as [number, number, number]} rotation={[0, rotationY, 0]}>
      {/* Outer bowl */}
      <mesh position={[0, 0.25, 0]} material={stone}>
        <cylinderGeometry args={[0.55, 0.65, 0.5, 8]} />
      </mesh>
      {/* Inner darker rim */}
      <mesh position={[0, 0.5, 0]} material={stoneShade}>
        <torusGeometry args={[0.45, 0.08, 4, 14]} />
      </mesh>
      {/* Water surface */}
      <mesh position={[0, 0.51, 0]} material={water}>
        <cylinderGeometry args={[0.42, 0.42, 0.04, 12]} />
      </mesh>
      {/* Three small stones around the basin */}
      {[
        [0.85, 0],
        [-0.5, 0.7],
        [-0.5, -0.7],
      ].map(([x, z], i) => (
        <mesh
          key={i}
          position={[x, 0.15, z]}
          rotation={[0, i * 0.7, 0]}
          material={stone}
        >
          <boxGeometry args={[0.4, 0.3, 0.45]} />
        </mesh>
      ))}
    </group>
  );
}

// ── Christian-Japanese gravestones ───────────────────────────────────────
//
// Cross-topped sotoba — Japanese-style stone markers with a small Latin
// cross at the top instead of Sanskrit characters. Three in a row.

function GravestoneCluster({ position, rotationY }: {
  position: readonly [number, number, number];
  rotationY: number;
}) {
  const stone = chunkyMat(STONE_PALE, { roughness: 1 });
  const stoneDark = chunkyMat(STONE_DARK, { roughness: 1 });
  return (
    <group position={position as unknown as [number, number, number]} rotation={[0, rotationY, 0]}>
      {[-1.2, 0, 1.2].map((x, i) => (
        <group key={i} position={[x, 0, 0]}>
          {/* Base */}
          <mesh position={[0, 0.18, 0]} material={stoneDark}>
            <boxGeometry args={[0.7, 0.36, 0.5]} />
          </mesh>
          {/* Shaft */}
          <mesh position={[0, 0.85, 0]} material={stone}>
            <boxGeometry args={[0.42, 1.0 + i * 0.1, 0.32]} />
          </mesh>
          {/* Top stone (gabled) */}
          <mesh position={[0, 1.42 + i * 0.05, 0]} material={stoneDark}>
            <coneGeometry args={[0.28, 0.36, 4]} />
          </mesh>
          {/* Small cross atop */}
          <TridentineCross position={[0, 1.62 + i * 0.05, 0]} scale={0.45} />
        </group>
      ))}
    </group>
  );
}

// ── Top-level compound ────────────────────────────────────────────────────

export function NagasakiPress({ poiId, position, rotationY }: {
  poiId: string;
  position: readonly [number, number, number];
  rotationY: number;
}) {
  const seed = hashStr(poiId);
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

  // Local-space layout. +Z heads "uphill" away from the harbor.
  // Gate at the front (-Z), church at the back (+Z), path between.
  const churchPos: [number, number] = [0, 7];
  const gatePos: [number, number] = [0, -10];
  const pressPos: [number, number] = [11, 7];
  const bellPos: [number, number] = [9, -2];
  const plumPos: [number, number] = [-9, 4];
  const pinePos: [number, number] = [-7, 9];
  const basinPos: [number, number] = [-9, -2];
  const gravesPos: [number, number] = [10, -10];

  // Stone lanterns flanking the path between gate and church.
  const lanternPositions: [number, number][] = [
    [-3.2, -7], [3.2, -7],
    [-3.2, -2], [3.2, -2],
    [0, 3],
  ];

  // Y offsets relative to anchor for each element.
  const churchY = terrainAt(churchPos[0], churchPos[1]) - anchorY;
  const gateY = terrainAt(gatePos[0], gatePos[1]) - anchorY;
  const pressY = terrainAt(pressPos[0], pressPos[1]) - anchorY;
  const bellY = terrainAt(bellPos[0], bellPos[1]) - anchorY;
  const plumY = terrainAt(plumPos[0], plumPos[1]) - anchorY;
  const pineY = terrainAt(pinePos[0], pinePos[1]) - anchorY;
  const basinY = terrainAt(basinPos[0], basinPos[1]) - anchorY;
  const gravesY = terrainAt(gravesPos[0], gravesPos[1]) - anchorY;
  // Sample terrain at the back-wall midpoint so the wall sits on the hill
  // rather than floating/sinking when the slope past the church is steep.
  const backWallY = terrainAt(0, 13) - anchorY;

  // Atmosphere — torch spots at each stone lantern + 1 at the gate.
  const torchSpots: POITorchSpot[] = useMemo(() => {
    const local: Array<[number, number, number]> = [
      // 5 stone lanterns — light at the lantern-box height (~1.9u above ground)
      ...lanternPositions.map(([lx, lz]) => {
        const ly = terrainAt(lx, lz) - anchorY + 1.95;
        return [lx, ly, lz] as [number, number, number];
      }),
      // Gate torch — mounted on top of the gate posts
      [-2, gateY + 4.2, gatePos[1]],
      [2, gateY + 4.2, gatePos[1]],
    ];
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
  }, [ax, az, anchorY, gateY, rotationY, terrainAt]);

  // Gravel path mesh — a long thin tan strip from gate to church steps.
  const gravelMat = useMemo(() => chunkyMat([0.78, 0.74, 0.66], { roughness: 1, opacity: 0.92 }), []);

  // Smoke from a small brazier near the press shed (active workshop).
  const smokePos: [number, number, number] = useMemo(() => {
    const lx = pressPos[0] - 3.5;
    const lz = pressPos[1] - 2;
    const ly = (terrainAt(lx, lz) - anchorY) + 1.6;
    const c = Math.cos(rotationY);
    const s = Math.sin(rotationY);
    return [
      ax + (lx * c - lz * s),
      anchorY + ly,
      az + (lx * s + lz * c),
    ];
  }, [ax, az, anchorY, rotationY, terrainAt]);

  return (
    <>
      <POITorchInstancer spots={torchSpots} />
      <ChimneySmoke position={smokePos} warmth="cool" scale={0.9} />

      <group position={position as unknown as [number, number, number]} rotation={[0, rotationY, 0]}>
        {/* Gravel approach path — thin strip between gate and church steps */}
        <mesh
          position={[0, 0.06, (gatePos[1] + churchPos[1]) * 0.5 - 1.5]}
          rotation={[-Math.PI / 2, 0, 0]}
          material={gravelMat}
        >
          <planeGeometry args={[3.5, Math.abs(churchPos[1] - gatePos[1]) - 1]} />
        </mesh>

        {/* Stone lanterns flanking the path */}
        {lanternPositions.map(([lx, lz], i) => {
          const ly = terrainAt(lx, lz) - anchorY;
          return (
            <StoneLantern
              key={i}
              position={[lx, ly, lz]}
              rotationY={i * 0.4}
            />
          );
        })}

        {/* Gate */}
        <SanmonGate position={[gatePos[0], gateY, gatePos[1]]} rotationY={0} />

        {/* Church */}
        <NagasakiChurch position={[churchPos[0], churchY, churchPos[1]]} rotationY={0} />

        {/* Press shed — open front faces -X (toward the courtyard/path) */}
        <PressShed position={[pressPos[0], pressY, pressPos[1]]} rotationY={Math.PI / 2} />

        {/* Bell tower */}
        <BellTower position={[bellPos[0], bellY, bellPos[1]]} rotationY={0} />

        {/* Plum tree in bloom */}
        <PlumTree
          position={[plumPos[0], plumY, plumPos[1]]}
          scale={1.3}
          swayPhase={0.7}
          seed={seed ^ 0xb10550}
        />

        {/* Bonsai-pruned pine */}
        <PrunedPine
          position={[pinePos[0], pineY, pinePos[1]]}
          scale={1.2}
          swayPhase={1.3}
          seed={seed ^ 0xa1ce}
        />

        {/* Stone basin */}
        <StoneBasin position={[basinPos[0], basinY, basinPos[1]]} rotationY={Math.PI / 4} />

        {/* Christian-Japanese gravestones */}
        <GravestoneCluster position={[gravesPos[0], gravesY, gravesPos[1]]} rotationY={Math.PI / 8} />

        {/* Stone perimeter wall along the back edge (uphill side) */}
        <BoundaryWall
          position={[0, backWallY, 13]}
          width={28}
          depth={1.4}
          height={1.5}
          thickness={0.7}
          segments={20}
          gateSide="none"
          color={[0.62, 0.6, 0.55]}
        />
      </group>
    </>
  );
}
