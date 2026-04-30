// ── Hormuz Pearl Divers' Bazaar ────────────────────────────────────────────
//
// Bespoke high-quality POI: the south-shore compound of Sayyid Murad al-Lari,
// where Bahraini and Lari divers' dhows beach at dusk and brokerage takes
// place under palm-mat awnings.
//
// Top-down legibility — the default camera is high and far. Composition is
// chosen so the silhouette reads at that distance:
//   1. Long thin jetty into shallow water  (linear "pier" silhouette)
//   2. Three beached dhows parallel to shore (rhythmic hull repetition)
//   3. Large square palm-mat awning over sorting tables (biggest single top-down shape)
//   4. Whitewashed sorting house, flat parapet roof, strong contrast on dark sand
//   5. 2×3 grid of oyster-drying frames east of the awning
//   6. Three date palms along the inland edge
//   7. Stone boundary wall on the landward side
//   8. Small qibla niche, fire pit with smoke, baskets of oysters
//
// Atmosphere:
//   - Two torches flanking the compound gate
//   - Smoke from the fire pit (cooking pot)
//   - Subtle palm-frond and awning-cloth sway on a slow sine
//   - Lit window in the sorting house at night
//
// Geometry budget: ~180 meshes total, mostly small. All materials route
// through chunkyMat so duplicated wall-color / sand-color / wood meshes
// share one GPU material.

import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { getTerrainHeight } from '../../utils/terrain';
import { SEA_LEVEL } from '../../constants/world';
import { chunkyMat, BoundaryWall, ChimneySmoke, POITorchInstancer, getNightFactor, type POITorchSpot } from './atmosphere';
import { useGameStore } from '../../store/gameStore';

// ── Palette ────────────────────────────────────────────────────────────────

const STUCCO_LIGHT: readonly [number, number, number] = [0.92, 0.87, 0.74];
const STUCCO_TRIM: readonly [number, number, number] = [0.78, 0.7, 0.55];
const STUCCO_SHADOW: readonly [number, number, number] = [0.66, 0.58, 0.44];
const ROOF_PARAPET: readonly [number, number, number] = [0.62, 0.5, 0.36];
const TIMBER_DARK: readonly [number, number, number] = [0.42, 0.3, 0.2];
const TIMBER_TEAK: readonly [number, number, number] = [0.55, 0.4, 0.24];
const TIMBER_PALE: readonly [number, number, number] = [0.7, 0.55, 0.36];
const PALM_CANVAS: readonly [number, number, number] = [0.78, 0.66, 0.42];
const PALM_CANVAS_DARK: readonly [number, number, number] = [0.6, 0.5, 0.32];
const ROPE: readonly [number, number, number] = [0.62, 0.52, 0.4];
const PALM_FROND: readonly [number, number, number] = [0.36, 0.46, 0.2];
const PALM_FROND_DARK: readonly [number, number, number] = [0.26, 0.34, 0.15];
const PALM_TRUNK: readonly [number, number, number] = [0.5, 0.4, 0.28];
const OYSTER_SHELL: readonly [number, number, number] = [0.42, 0.4, 0.42];
const OYSTER_DARK: readonly [number, number, number] = [0.28, 0.26, 0.3];
const BRASS: readonly [number, number, number] = [0.82, 0.62, 0.22];
const BANNER_GREEN: readonly [number, number, number] = [0.18, 0.42, 0.28]; // Ottoman-coded green
const BASKET: readonly [number, number, number] = [0.55, 0.4, 0.22];

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

// ── Sorting house ──────────────────────────────────────────────────────────
//
// Whitewashed Persian-Gulf style: rectangular plan, flat roof with stepped
// parapet, deep arched doorway, two narrow windows on the front, an
// external staircase up the side wall to the roof. The sorting platform
// is visible through the open arch — a teak table with a brass scale.
// Window emissive ramps with night factor so a lit interior shows at dusk.

function SortingHouse({ position, rotationY }: {
  position: readonly [number, number, number];
  rotationY: number;
}) {
  const w = 11;
  const d = 8;
  const h = 5.4;
  const wall = chunkyMat(STUCCO_LIGHT, { roughness: 1 });
  const trim = chunkyMat(STUCCO_TRIM, { roughness: 1 });
  const shadow = chunkyMat(STUCCO_SHADOW, { roughness: 1 });
  const parapet = chunkyMat(ROOF_PARAPET, { roughness: 1 });
  const teak = chunkyMat(TIMBER_TEAK, { roughness: 1 });
  const dark = chunkyMat(TIMBER_DARK, { roughness: 1 });
  const brass = chunkyMat(BRASS, { roughness: 0.4, metalness: 0.55 });

  const windowGlow = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#1c140a',
    emissive: '#ffb060',
    emissiveIntensity: 0,
    flatShading: true,
    roughness: 0.85,
  }), []);
  const archGlow = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#231810',
    emissive: '#ffaa55',
    emissiveIntensity: 0.05,
    flatShading: true,
    roughness: 0.9,
  }), []);

  useFrame(() => {
    const timeOfDay = useGameStore.getState().timeOfDay;
    const n = getNightFactor(timeOfDay);
    windowGlow.emissiveIntensity = n * 1.1;
    // The arch is open all the time so the inner glow is dim during the
    // day (lamplight against shaded interior) and bright at night.
    archGlow.emissiveIntensity = 0.05 + n * 0.65;
  });

  return (
    <group position={position as unknown as [number, number, number]} rotation={[0, rotationY, 0]}>
      {/* Plinth */}
      <mesh position={[0, 0.2, 0]} material={trim}>
        <boxGeometry args={[w + 0.6, 0.4, d + 0.6]} />
      </mesh>
      {/* Main wall mass */}
      <mesh position={[0, 0.4 + h * 0.5, 0]} material={wall}>
        <boxGeometry args={[w, h, d]} />
      </mesh>
      {/* Shadowed back-side band — gives volumetric read at top-down */}
      <mesh position={[0, 0.4 + h * 0.5, -d * 0.5 - 0.02]} material={shadow}>
        <boxGeometry args={[w * 0.96, h * 0.96, 0.08]} />
      </mesh>
      {/* Parapet — stepped */}
      <mesh position={[0, 0.4 + h + 0.2, 0]} material={parapet}>
        <boxGeometry args={[w + 0.4, 0.4, d + 0.4]} />
      </mesh>
      {/* Crenellated top — a row of small block teeth on the front parapet */}
      {Array.from({ length: 7 }).map((_, i) => {
        const x = -w * 0.4 + (i / 6) * (w * 0.8);
        return (
          <mesh
            key={i}
            position={[x, 0.4 + h + 0.55, d * 0.5 + 0.18]}
            material={parapet}
          >
            <boxGeometry args={[0.45, 0.4, 0.25]} />
          </mesh>
        );
      })}

      {/* Deep arched doorway — a recessed dark interior with arch lintel.
          Implemented as a darker box behind a slim frame. */}
      <mesh position={[0, 0.4 + 1.7, d * 0.5 + 0.001]} material={archGlow}>
        <boxGeometry args={[2.2, 3.3, 0.1]} />
      </mesh>
      {/* Arch top — half-cylinder cap above the doorway */}
      <mesh
        position={[0, 0.4 + 3.4, d * 0.5 + 0.002]}
        rotation={[0, 0, Math.PI / 2]}
        material={archGlow}
      >
        <cylinderGeometry args={[1.1, 1.1, 0.12, 12, 1, false, -Math.PI / 2, Math.PI]} />
      </mesh>
      {/* Door-frame trim (inner edge) */}
      <mesh position={[1.16, 0.4 + 1.7, d * 0.5 + 0.04]} material={trim}>
        <boxGeometry args={[0.16, 3.3, 0.16]} />
      </mesh>
      <mesh position={[-1.16, 0.4 + 1.7, d * 0.5 + 0.04]} material={trim}>
        <boxGeometry args={[0.16, 3.3, 0.16]} />
      </mesh>

      {/* Two narrow windows flanking the door */}
      {[-3.2, 3.2].map((x, i) => (
        <group key={i}>
          <mesh position={[x, 0.4 + 3.0, d * 0.5 + 0.001]} material={windowGlow}>
            <boxGeometry args={[0.8, 1.4, 0.08]} />
          </mesh>
          {/* Lintel above the window */}
          <mesh position={[x, 0.4 + 3.85, d * 0.5 + 0.05]} material={trim}>
            <boxGeometry args={[1.1, 0.18, 0.18]} />
          </mesh>
        </group>
      ))}

      {/* External staircase climbing the right side wall to the roof — a
          common Persian-Gulf vernacular detail. Three steps + landing. */}
      {Array.from({ length: 5 }).map((_, i) => (
        <mesh
          key={i}
          position={[w * 0.5 + 0.5, 0.4 + i * 0.95, -d * 0.2 + i * 0.85]}
          material={trim}
        >
          <boxGeometry args={[0.9, 0.32, 0.9]} />
        </mesh>
      ))}

      {/* Sorting platform inside the arch — visible from top-down through
          the open doorway (the arch is dark but the platform extends
          forward beyond the front wall by a tiny margin). */}
      <mesh position={[0, 0.4 + 0.85, d * 0.5 - 0.6]} material={teak}>
        <boxGeometry args={[3.0, 0.18, 1.5]} />
      </mesh>
      {/* Brass scale on the platform */}
      <mesh position={[0, 0.4 + 1.05, d * 0.5 - 0.6]} material={brass}>
        <cylinderGeometry args={[0.18, 0.22, 0.12, 8]} />
      </mesh>
      <mesh position={[0, 0.4 + 1.5, d * 0.5 - 0.6]} material={dark}>
        <cylinderGeometry args={[0.04, 0.04, 0.85, 4]} />
      </mesh>
      {/* Two scale pans */}
      <mesh position={[-0.5, 0.4 + 1.62, d * 0.5 - 0.6]} material={brass}>
        <cylinderGeometry args={[0.28, 0.22, 0.06, 10]} />
      </mesh>
      <mesh position={[0.5, 0.4 + 1.62, d * 0.5 - 0.6]} material={brass}>
        <cylinderGeometry args={[0.28, 0.22, 0.06, 10]} />
      </mesh>
      {/* Beam connecting them */}
      <mesh position={[0, 0.4 + 1.78, d * 0.5 - 0.6]} material={dark}>
        <boxGeometry args={[1.2, 0.04, 0.06]} />
      </mesh>

      {/* Banner pole on the parapet — small Ottoman-coded green pennant,
          the Lari governor's flag in 1612. */}
      <mesh position={[w * 0.36, 0.4 + h + 1.4, 0]} material={dark}>
        <cylinderGeometry args={[0.05, 0.05, 1.8, 4]} />
      </mesh>
      <mesh position={[w * 0.36 + 0.5, 0.4 + h + 1.5, 0]} material={chunkyMat(BANNER_GREEN, { roughness: 1 })}>
        <boxGeometry args={[1.0, 0.6, 0.02]} />
      </mesh>
    </group>
  );
}

// ── Awning ────────────────────────────────────────────────────────────────
//
// Square shade structure: 4 corner posts (peeled date-palm trunk look), a
// thick canvas-and-palm-mat top with a slight catenary droop, fringe
// strips along the front edge that wave gently in the breeze. Three
// sorting benches under it loaded with mother-of-pearl piles.

function Awning({ position, rotationY, scale = 1 }: {
  position: readonly [number, number, number];
  rotationY: number;
  scale?: number;
}) {
  const post = chunkyMat(PALM_TRUNK, { roughness: 1 });
  const canvas = chunkyMat(PALM_CANVAS, { roughness: 1 });
  const canvasDark = chunkyMat(PALM_CANVAS_DARK, { roughness: 1 });
  const benchWood = chunkyMat(TIMBER_TEAK, { roughness: 1 });
  const oyster = chunkyMat(OYSTER_SHELL, { roughness: 0.7, metalness: 0.15 });
  const oysterDark = chunkyMat(OYSTER_DARK, { roughness: 0.9 });
  const rope = chunkyMat(ROPE, { roughness: 1 });

  // Animate fringe sway
  const fringeRef = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!fringeRef.current) return;
    const t = clock.elapsedTime;
    fringeRef.current.children.forEach((strip, i) => {
      strip.rotation.x = Math.sin(t * 0.9 + i * 0.6) * 0.12;
    });
  });

  const w = 9 * scale;
  const d = 8 * scale;
  const ph = 4.2 * scale; // post height

  return (
    <group position={position as unknown as [number, number, number]} rotation={[0, rotationY, 0]}>
      {/* Four corner posts */}
      {[
        [-w / 2, -d / 2],
        [w / 2, -d / 2],
        [-w / 2, d / 2],
        [w / 2, d / 2],
      ].map(([x, z], i) => (
        <mesh key={i} position={[x, ph * 0.5, z]} material={post}>
          <cylinderGeometry args={[0.25 * scale, 0.32 * scale, ph, 7]} />
        </mesh>
      ))}
      {/* Cross beams along the long axis */}
      <mesh position={[0, ph + 0.18 * scale, -d / 2]} material={post}>
        <boxGeometry args={[w + 0.6, 0.34 * scale, 0.34 * scale]} />
      </mesh>
      <mesh position={[0, ph + 0.18 * scale, d / 2]} material={post}>
        <boxGeometry args={[w + 0.6, 0.34 * scale, 0.34 * scale]} />
      </mesh>
      {/* Canvas top — slight droop in the middle implemented as two stacked
          slabs, the upper one slightly smaller and a hair higher (so the
          edges read as folded over the cross-beams). */}
      <mesh position={[0, ph + 0.55 * scale, 0]} material={canvas}>
        <boxGeometry args={[w + 0.4, 0.32 * scale, d + 0.4]} />
      </mesh>
      <mesh position={[0, ph + 0.78 * scale, 0]} material={canvasDark}>
        <boxGeometry args={[w * 0.78, 0.18 * scale, d * 0.7]} />
      </mesh>

      {/* Front-edge fringe strips — 7 thin chunks hanging from the front
          beam. Animated. */}
      <group ref={fringeRef} position={[0, ph + 0.04, d / 2 + 0.02]}>
        {Array.from({ length: 7 }).map((_, i) => {
          const x = -w * 0.42 + (i / 6) * w * 0.84;
          return (
            <mesh
              key={i}
              position={[x, -0.25 * scale, 0]}
              material={canvasDark}
            >
              <boxGeometry args={[0.6 * scale, 0.5 * scale, 0.04]} />
            </mesh>
          );
        })}
      </group>

      {/* Two sorting benches under the awning */}
      {[-1.8 * scale, 1.8 * scale].map((zb, i) => (
        <group key={i} position={[0, 0, zb]}>
          {/* Legs */}
          <mesh position={[-2.0 * scale, 0.55 * scale, 0]} material={benchWood}>
            <boxGeometry args={[0.18, 1.1 * scale, 0.18]} />
          </mesh>
          <mesh position={[2.0 * scale, 0.55 * scale, 0]} material={benchWood}>
            <boxGeometry args={[0.18, 1.1 * scale, 0.18]} />
          </mesh>
          {/* Top */}
          <mesh position={[0, 1.15 * scale, 0]} material={benchWood}>
            <boxGeometry args={[5 * scale, 0.18, 1.4 * scale]} />
          </mesh>
          {/* Oyster pile #1 */}
          <mesh position={[-1.4 * scale, 1.45 * scale, 0]} material={oyster}>
            <sphereGeometry args={[0.5 * scale, 7, 5]} />
          </mesh>
          <mesh position={[-1.4 * scale, 1.32 * scale, 0]} scale={[1, 0.4, 1]} material={oysterDark}>
            <sphereGeometry args={[0.55 * scale, 7, 5]} />
          </mesh>
          {/* Oyster pile #2 */}
          <mesh position={[0.3 * scale, 1.45 * scale, 0]} material={oyster}>
            <sphereGeometry args={[0.42 * scale, 7, 5]} />
          </mesh>
          {/* Oyster pile #3 */}
          <mesh position={[1.7 * scale, 1.5 * scale, 0]} material={oyster}>
            <sphereGeometry args={[0.55 * scale, 7, 5]} />
          </mesh>
          <mesh position={[1.7 * scale, 1.34 * scale, 0]} scale={[1, 0.4, 1]} material={oysterDark}>
            <sphereGeometry args={[0.6 * scale, 7, 5]} />
          </mesh>
          {/* A coil of rope on the bench */}
          <mesh position={[1.0 * scale, 1.4 * scale, -0.45 * scale]} rotation={[Math.PI / 2, 0, 0]} material={rope}>
            <torusGeometry args={[0.32 * scale, 0.08 * scale, 4, 14]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// ── Jetty ─────────────────────────────────────────────────────────────────
//
// Long thin pier extending toward the water, with paired posts at regular
// intervals and a continuous plank deck on top. The end of the jetty
// sits in shallow water — terrain Y handles the transition because the
// snapper has placed the compound on land.

function Jetty({ position, rotationY, length = 14, anchorTerrainY, terrainAt }: {
  position: readonly [number, number, number];
  rotationY: number;
  length?: number;
  anchorTerrainY: number;
  terrainAt: (x: number, z: number) => number;
}) {
  const wood = chunkyMat(TIMBER_TEAK, { roughness: 1 });
  const dark = chunkyMat(TIMBER_DARK, { roughness: 1 });
  const plank = chunkyMat(TIMBER_PALE, { roughness: 1 });

  // Sample terrain along the jetty axis — local space relative to the
  // rotated group, so we have to rotate the sampling direction by
  // -rotationY when querying world terrain.
  // For simplicity, the jetty heads in the local +Z direction; world coord
  // is precomputed by the parent and passed via terrainAt.
  const segments = 7;
  const segLen = length / segments;
  const posts: { z: number; deckY: number; postH: number }[] = [];
  for (let i = 0; i <= segments; i++) {
    const z = i * segLen;
    const tY = terrainAt(0, z);
    const deckY = Math.max(anchorTerrainY, SEA_LEVEL + 0.4);
    const postH = Math.max(0.5, deckY - Math.min(tY, SEA_LEVEL - 1));
    posts.push({ z, deckY: deckY - anchorTerrainY, postH });
  }

  return (
    <group position={position as unknown as [number, number, number]} rotation={[0, rotationY, 0]}>
      {posts.map((p, i) => (
        <group key={i} position={[0, 0, p.z]}>
          <mesh position={[-0.85, p.deckY - p.postH / 2, 0]} material={dark}>
            <boxGeometry args={[0.28, p.postH, 0.28]} />
          </mesh>
          <mesh position={[0.85, p.deckY - p.postH / 2, 0]} material={dark}>
            <boxGeometry args={[0.28, p.postH, 0.28]} />
          </mesh>
        </group>
      ))}
      {/* Plank deck — continuous strip with darker seam lines */}
      <mesh position={[0, posts[0].deckY + 0.08, length / 2]} material={plank}>
        <boxGeometry args={[2.1, 0.14, length]} />
      </mesh>
      {/* Plank seams — 4 darker lines running the length */}
      {[-0.6, -0.2, 0.2, 0.6].map((xOff, i) => (
        <mesh
          key={i}
          position={[xOff, posts[0].deckY + 0.16, length / 2]}
          material={wood}
        >
          <boxGeometry args={[0.04, 0.03, length]} />
        </mesh>
      ))}
      {/* Mooring bollards at the end */}
      <mesh position={[-0.85, posts[0].deckY + 0.45, length]} material={dark}>
        <cylinderGeometry args={[0.16, 0.22, 0.85, 6]} />
      </mesh>
      <mesh position={[0.85, posts[0].deckY + 0.45, length]} material={dark}>
        <cylinderGeometry args={[0.16, 0.22, 0.85, 6]} />
      </mesh>
      {/* Coiled rope around one bollard */}
      <mesh
        position={[0.85, posts[0].deckY + 0.32, length]}
        rotation={[Math.PI / 2, 0, 0]}
        material={chunkyMat(ROPE, { roughness: 1 })}
      >
        <torusGeometry args={[0.28, 0.06, 4, 12]} />
      </mesh>
    </group>
  );
}

// ── Beached dhow ──────────────────────────────────────────────────────────
//
// A small fishing dhow pulled up onto sand, hull tilted slightly to one
// side. Mast lowered (a simple horizontal beam across the deck) — this
// is a *beached* boat, not a working one. Deterministic per-instance
// variation: hull length, side it leans toward, presence of a draped sail.

function BeachedDhow({ position, rotationY, seed, scale = 1 }: {
  position: readonly [number, number, number];
  rotationY: number;
  seed: number;
  scale?: number;
}) {
  const rng = mulberry32(seed);
  const hullLen = 5.2 + rng() * 1.6;
  const hullW = 1.4 + rng() * 0.3;
  const hullH = 0.9 + rng() * 0.2;
  const leanZ = (rng() < 0.5 ? -1 : 1) * (0.16 + rng() * 0.12);
  const hasSail = rng() < 0.6;

  const hull = chunkyMat(TIMBER_TEAK, { roughness: 1 });
  const hullTrim = chunkyMat(TIMBER_DARK, { roughness: 1 });
  const deck = chunkyMat(TIMBER_PALE, { roughness: 1 });
  const sailMat = chunkyMat([0.86, 0.78, 0.62], { roughness: 1 });

  return (
    <group
      position={position as unknown as [number, number, number]}
      rotation={[0, rotationY, leanZ]}
      scale={[scale, scale, scale]}
    >
      {/* Lower hull — tapered hexagonal body. Approximated as a long box
          plus a sloping bow/stern. */}
      <mesh position={[0, hullH * 0.5, 0]} material={hull}>
        <boxGeometry args={[hullW, hullH, hullLen]} />
      </mesh>
      {/* Bow — pointed prow */}
      <mesh
        position={[0, hullH * 0.55, hullLen * 0.5 + 0.4]}
        rotation={[0, Math.PI / 4, 0]}
        material={hull}
      >
        <boxGeometry args={[hullW * 0.7, hullH * 1.05, 0.7]} />
      </mesh>
      {/* Stern — squared off, slightly higher */}
      <mesh position={[0, hullH * 0.65, -hullLen * 0.5 - 0.3]} material={hull}>
        <boxGeometry args={[hullW, hullH * 1.25, 0.6]} />
      </mesh>
      {/* Hull rim/strake */}
      <mesh position={[0, hullH + 0.06, 0]} material={hullTrim}>
        <boxGeometry args={[hullW + 0.05, 0.12, hullLen]} />
      </mesh>
      {/* Deck */}
      <mesh position={[0, hullH + 0.18, 0]} material={deck}>
        <boxGeometry args={[hullW * 0.78, 0.12, hullLen * 0.85]} />
      </mesh>
      {/* Lowered mast — laid horizontally across the deck */}
      <mesh position={[0, hullH + 0.32, 0]} material={hullTrim}>
        <cylinderGeometry args={[0.07, 0.09, hullLen * 0.85, 5]} />
      </mesh>
      {/* Draped sail bundle */}
      {hasSail && (
        <mesh
          position={[hullW * 0.18, hullH + 0.4, hullLen * 0.05]}
          rotation={[0, 0, 0.15]}
          material={sailMat}
        >
          <boxGeometry args={[hullW * 0.45, 0.32, hullLen * 0.55]} />
        </mesh>
      )}
      {/* Tiller stub at stern */}
      <mesh
        position={[0, hullH + 0.45, -hullLen * 0.5 - 0.2]}
        rotation={[0.4, 0, 0]}
        material={hullTrim}
      >
        <boxGeometry args={[0.08, 0.5, 0.08]} />
      </mesh>
    </group>
  );
}

// ── Drying frame grid ─────────────────────────────────────────────────────
//
// A 2×3 grid of low wooden frames — split bivalves drying in the sun.
// Top-down this reads as an obvious geometric texture against the sand.

function DryingFrames({ position, rotationY }: {
  position: readonly [number, number, number];
  rotationY: number;
}) {
  const wood = chunkyMat(TIMBER_PALE, { roughness: 1 });
  const dark = chunkyMat(TIMBER_DARK, { roughness: 1 });
  const oyster = chunkyMat(OYSTER_SHELL, { roughness: 0.8 });
  const oysterDark = chunkyMat(OYSTER_DARK, { roughness: 0.9 });

  const frameW = 2.2;
  const frameD = 1.6;
  const cols = 3;
  const rows = 2;
  const gap = 0.6;

  const frames: { x: number; z: number; pile: number }[] = [];
  // Deterministic per-frame pile size so the grid has visual variation.
  const rng = mulberry32(0xfac7);
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      frames.push({
        x: (c - (cols - 1) / 2) * (frameW + gap),
        z: (r - (rows - 1) / 2) * (frameD + gap),
        pile: 0.18 + rng() * 0.18,
      });
    }
  }

  return (
    <group position={position as unknown as [number, number, number]} rotation={[0, rotationY, 0]}>
      {frames.map((f, i) => (
        <group key={i} position={[f.x, 0, f.z]}>
          {/* Four legs */}
          {[
            [-frameW / 2, -frameD / 2],
            [frameW / 2, -frameD / 2],
            [-frameW / 2, frameD / 2],
            [frameW / 2, frameD / 2],
          ].map(([lx, lz], j) => (
            <mesh key={j} position={[lx, 0.2, lz]} material={dark}>
              <boxGeometry args={[0.1, 0.4, 0.1]} />
            </mesh>
          ))}
          {/* Frame top */}
          <mesh position={[0, 0.42, 0]} material={wood}>
            <boxGeometry args={[frameW, 0.06, frameD]} />
          </mesh>
          {/* Oyster pile in the middle */}
          <mesh position={[0, 0.42 + f.pile / 2, 0]} material={oyster}>
            <boxGeometry args={[frameW * 0.78, f.pile, frameD * 0.78]} />
          </mesh>
          {/* Slightly darker dimple to break the flat top */}
          <mesh position={[0, 0.42 + f.pile * 0.95, 0]} material={oysterDark}>
            <boxGeometry args={[frameW * 0.52, 0.04, frameD * 0.5]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// ── Date palm ─────────────────────────────────────────────────────────────
//
// Tall thin trunk + crown of long arching fronds. Visually distinct from
// the dragon's-blood tree: trunk is much thinner and taller, fronds are
// long lanceolate strips that arc downward at the tips. Reads from
// top-down as a small cluster of green strokes around a central point.

function DatePalm({ position, scale = 1, swayPhase = 0 }: {
  position: readonly [number, number, number];
  scale?: number;
  swayPhase?: number;
}) {
  const trunk = chunkyMat(PALM_TRUNK, { roughness: 1 });
  const trunkDark = chunkyMat([PALM_TRUNK[0] * 0.75, PALM_TRUNK[1] * 0.75, PALM_TRUNK[2] * 0.75], { roughness: 1 });
  const frond = chunkyMat(PALM_FROND, { roughness: 0.95 });
  const frondDark = chunkyMat(PALM_FROND_DARK, { roughness: 1 });

  const swayRef = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!swayRef.current) return;
    const t = clock.elapsedTime;
    swayRef.current.rotation.z = Math.sin(t * 0.55 + swayPhase) * 0.04;
    swayRef.current.rotation.y = Math.sin(t * 0.35 + swayPhase * 1.2) * 0.025;
  });

  const trunkH = 9 * scale;
  const trunkR = 0.32 * scale;
  // Trunk segmentation — narrow rings every 1.5u of height to suggest
  // the date palm's distinctive scaled bark.
  const ringCount = 6;

  // Frond arrangement: 9 fronds radiating from the crown, alternating
  // between full-length (top) and shorter (lower) tiers.
  const fronds: { az: number; tilt: number; len: number; tier: 'top' | 'lower' }[] = [];
  for (let i = 0; i < 9; i++) {
    const az = (i / 9) * Math.PI * 2;
    const top = i % 2 === 0;
    fronds.push({
      az,
      tilt: top ? -0.15 : 0.25,
      len: top ? 3.6 * scale : 2.8 * scale,
      tier: top ? 'top' : 'lower',
    });
  }

  return (
    <group position={position as unknown as [number, number, number]}>
      {/* Trunk */}
      <mesh position={[0, trunkH * 0.5, 0]} material={trunk}>
        <cylinderGeometry args={[trunkR * 0.85, trunkR * 1.05, trunkH, 8]} />
      </mesh>
      {/* Bark rings */}
      {Array.from({ length: ringCount }).map((_, i) => (
        <mesh
          key={i}
          position={[0, (i + 0.5) * (trunkH / ringCount), 0]}
          material={trunkDark}
        >
          <cylinderGeometry args={[trunkR * 1.12, trunkR * 1.08, 0.18, 8]} />
        </mesh>
      ))}
      {/* Crown sway group */}
      <group ref={swayRef} position={[0, trunkH, 0]}>
        {/* Crown nub — small dark disc where fronds attach */}
        <mesh material={trunkDark}>
          <sphereGeometry args={[trunkR * 1.5, 8, 6]} />
        </mesh>
        {/* Fronds */}
        {fronds.map((f, i) => {
          // Each frond is a flat plane oriented to point outward, with a
          // slight downward arc at the tip. Approximated as two segments
          // for the arc.
          const dirX = Math.cos(f.az);
          const dirZ = Math.sin(f.az);
          const segLen = f.len * 0.5;
          // First half — straight outward, slight upward tilt at base.
          const baseX = dirX * segLen * 0.5;
          const baseZ = dirZ * segLen * 0.5;
          const baseY = -Math.sin(f.tilt) * segLen * 0.5;
          // Second half — arcs downward.
          const tipX = dirX * f.len * 0.92;
          const tipZ = dirZ * f.len * 0.92;
          const tipY = -segLen * 0.6;
          const midX = (baseX + tipX) / 2 + dirX * segLen * 0.1;
          const midZ = (baseZ + tipZ) / 2 + dirZ * segLen * 0.1;
          const midY = (baseY + tipY) / 2 + 0.1;

          // Build orientation for each segment.
          const seg2Dir = new THREE.Vector3(tipX - baseX, tipY - baseY, tipZ - baseZ).normalize();
          const seg1Dir = new THREE.Vector3(dirX, Math.sin(-f.tilt), dirZ).normalize();
          const q1 = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), seg1Dir);
          const q2 = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), seg2Dir);
          const e1 = new THREE.Euler().setFromQuaternion(q1);
          const e2 = new THREE.Euler().setFromQuaternion(q2);

          return (
            <group key={i}>
              {/* Inner segment */}
              <mesh
                position={[baseX * 0.5, baseY * 0.5, baseZ * 0.5]}
                rotation={[e1.x, e1.y, e1.z]}
                material={f.tier === 'top' ? frond : frondDark}
              >
                <boxGeometry args={[0.42 * scale, 0.06, segLen]} />
              </mesh>
              {/* Outer arcing segment */}
              <mesh
                position={[midX, midY, midZ]}
                rotation={[e2.x, e2.y, e2.z]}
                material={f.tier === 'top' ? frond : frondDark}
              >
                <boxGeometry args={[0.36 * scale, 0.06, segLen * 1.05]} />
              </mesh>
              {/* Frond center spine */}
              <mesh
                position={[(baseX + tipX) * 0.5, (baseY + tipY) * 0.5, (baseZ + tipZ) * 0.5]}
                rotation={[e2.x, e2.y, e2.z]}
                material={trunkDark}
              >
                <boxGeometry args={[0.06, 0.08, f.len * 0.94]} />
              </mesh>
            </group>
          );
        })}
        {/* A few date clusters under the crown — small dark hanging clumps */}
        {[0, 2, 4].map((i) => {
          const az = (i / 6) * Math.PI * 2;
          return (
            <mesh
              key={i}
              position={[Math.cos(az) * trunkR * 1.2, -trunkR * 1.4, Math.sin(az) * trunkR * 1.2]}
              material={frondDark}
            >
              <boxGeometry args={[0.5 * scale, 0.5 * scale, 0.4 * scale]} />
            </mesh>
          );
        })}
      </group>
    </group>
  );
}

// ── Fire pit ──────────────────────────────────────────────────────────────
//
// Stone ring + cooking pot on a tripod. Not lit by default — the smoke
// wisp does most of the work signalling "active".

function FirePit({ position, rotationY }: {
  position: readonly [number, number, number];
  rotationY: number;
}) {
  const stone = chunkyMat([0.45, 0.4, 0.36], { roughness: 1 });
  const stoneDark = chunkyMat([0.3, 0.27, 0.24], { roughness: 1 });
  const ember = chunkyMat([0.32, 0.18, 0.1], { roughness: 0.6, emissive: [0.35, 0.12, 0.04], emissiveIntensity: 0.4 });
  const iron = chunkyMat([0.22, 0.2, 0.22], { roughness: 0.8, metalness: 0.4 });
  const pot = chunkyMat([0.28, 0.24, 0.22], { roughness: 0.7, metalness: 0.3 });

  // Animate ember intensity at night
  const emberRef = useRef<THREE.MeshStandardMaterial>(ember);
  useFrame(({ clock }) => {
    const timeOfDay = useGameStore.getState().timeOfDay;
    const n = getNightFactor(timeOfDay);
    const t = clock.elapsedTime;
    const flicker = 0.85 + Math.sin(t * 7.1) * 0.1 + Math.sin(t * 13.3) * 0.05;
    emberRef.current.emissiveIntensity = 0.4 + n * 0.9 * flicker;
  });

  return (
    <group position={position as unknown as [number, number, number]} rotation={[0, rotationY, 0]}>
      {/* Stone ring — 6 small blocks */}
      {Array.from({ length: 6 }).map((_, i) => {
        const az = (i / 6) * Math.PI * 2;
        return (
          <mesh
            key={i}
            position={[Math.cos(az) * 0.85, 0.18, Math.sin(az) * 0.85]}
            rotation={[0, az, 0]}
            material={i % 2 === 0 ? stone : stoneDark}
          >
            <boxGeometry args={[0.5, 0.36, 0.4]} />
          </mesh>
        );
      })}
      {/* Embers in the center */}
      <mesh position={[0, 0.08, 0]} material={ember}>
        <cylinderGeometry args={[0.55, 0.5, 0.16, 8]} />
      </mesh>
      {/* Iron tripod — 3 legs meeting at apex over the embers */}
      {[0, 1, 2].map((i) => {
        const az = (i / 3) * Math.PI * 2;
        return (
          <mesh
            key={i}
            position={[Math.cos(az) * 0.55, 0.95, Math.sin(az) * 0.55]}
            rotation={[Math.cos(az) * 0.3, 0, Math.sin(az) * 0.3]}
            material={iron}
          >
            <cylinderGeometry args={[0.04, 0.04, 1.9, 4]} />
          </mesh>
        );
      })}
      {/* Cooking pot hanging from apex */}
      <mesh position={[0, 1.05, 0]} material={pot}>
        <cylinderGeometry args={[0.42, 0.36, 0.55, 8]} />
      </mesh>
      <mesh position={[0, 1.36, 0]} material={pot}>
        <torusGeometry args={[0.42, 0.06, 4, 14]} />
      </mesh>
    </group>
  );
}

// ── Top-level compound ────────────────────────────────────────────────────

export function HormuzPearlBazaar({ poiId, position, rotationY }: {
  poiId: string;
  position: readonly [number, number, number];
  rotationY: number;
}) {
  const seed = hashStr(poiId);
  const [ax, , az] = position as [number, number, number];

  const terrainAt = useMemo(() => {
    return (lx: number, lz: number) => {
      // Rotate the local coord by rotationY before sampling world terrain.
      const c = Math.cos(rotationY);
      const s = Math.sin(rotationY);
      const wx = ax + (lx * c - lz * s);
      const wz = az + (lx * s + lz * c);
      return getTerrainHeight(wx, wz);
    };
  }, [ax, az, rotationY]);

  const anchorY = terrainAt(0, 0);

  // Compound layout (local space; +Z heads toward the water in our convention
  // so the jetty extends from the building toward shore at +Z).
  const housePos: [number, number] = [-3, -8];
  const awningPos: [number, number] = [6, -5];
  const jettyStart: [number, number] = [0, 1];
  const dryingPos: [number, number] = [10, -10];
  const firePos: [number, number] = [-9, -4];
  const cairnQiblaPos: [number, number] = [-12, -10];

  // Terrain Ys for each element (relative to anchor for the rotated group)
  const houseY = terrainAt(housePos[0], housePos[1]) - anchorY;
  const awningY = terrainAt(awningPos[0], awningPos[1]) - anchorY;
  const dryingY = terrainAt(dryingPos[0], dryingPos[1]) - anchorY;
  const fireY = terrainAt(firePos[0], firePos[1]) - anchorY;
  const qiblaY = terrainAt(cairnQiblaPos[0], cairnQiblaPos[1]) - anchorY;

  // Three beached dhows along the shoreline, parallel to each other.
  const dhows = useMemo(() => {
    const out: { offset: [number, number]; seed: number }[] = [];
    for (let i = 0; i < 3; i++) {
      out.push({
        offset: [-5 + i * 4, 4 + (i % 2) * 0.6],
        seed: seed ^ (0xdeadbeef + i * 1031),
      });
    }
    return out;
  }, [seed]);

  // Three palms along the inland edge.
  const palms: { offset: [number, number]; phase: number; scale: number }[] = useMemo(() => {
    return [
      { offset: [-15, -12], phase: 0.3, scale: 1.0 },
      { offset: [-2, -14], phase: 1.7, scale: 1.15 },
      { offset: [13, -13], phase: 0.9, scale: 0.95 },
    ];
  }, []);

  // Build atmosphere positions in world coords (rotation baked in).
  const torchSpots: POITorchSpot[] = useMemo(() => {
    const local: Array<[number, number, number]> = [
      [-8, awningY + 2.6, -2],   // Gate torch left
      [4, awningY + 2.6, -2],    // Gate torch right
      [3, awningY + 4.4, -5],    // Awning corner lamp (on the post)
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
  }, [ax, az, anchorY, awningY, rotationY]);

  const smokePos: [number, number, number] = useMemo(() => {
    const lx = firePos[0];
    const lz = firePos[1];
    const ly = fireY + 1.6;
    const c = Math.cos(rotationY);
    const s = Math.sin(rotationY);
    return [
      ax + (lx * c - lz * s),
      anchorY + ly,
      az + (lx * s + lz * c),
    ];
  }, [ax, az, anchorY, fireY, rotationY]);

  // Roof-top window glow on the sorting house at night.
  const stuccoTrim = chunkyMat(STUCCO_TRIM, { roughness: 1 });

  return (
    <>
      <POITorchInstancer spots={torchSpots} />
      <ChimneySmoke position={smokePos} warmth="warm" scale={1.0} />

      <group position={position as unknown as [number, number, number]} rotation={[0, rotationY, 0]}>
        {/* Sorting house */}
        <SortingHouse
          position={[housePos[0], houseY, housePos[1]]}
          rotationY={0}
        />

        {/* Awning (sun-shade with sorting benches) */}
        <Awning
          position={[awningPos[0], awningY, awningPos[1]]}
          rotationY={0}
          scale={1.0}
        />

        {/* Jetty extending toward the water in +Z direction */}
        <Jetty
          position={[jettyStart[0], 0, jettyStart[1]]}
          rotationY={0}
          length={14}
          anchorTerrainY={anchorY}
          terrainAt={(x, z) => terrainAt(x + jettyStart[0], z + jettyStart[1])}
        />

        {/* Three beached dhows on the sand */}
        {dhows.map((d, i) => {
          const dy = terrainAt(d.offset[0], d.offset[1]) - anchorY;
          return (
            <BeachedDhow
              key={i}
              position={[d.offset[0], dy, d.offset[1]]}
              rotationY={Math.PI / 2}
              seed={d.seed}
              scale={1.05}
            />
          );
        })}

        {/* Drying-frame grid */}
        <DryingFrames position={[dryingPos[0], dryingY, dryingPos[1]]} rotationY={0} />

        {/* Date palms */}
        {palms.map((p, i) => {
          const y = terrainAt(p.offset[0], p.offset[1]) - anchorY;
          return (
            <DatePalm
              key={i}
              position={[p.offset[0], y, p.offset[1]]}
              scale={p.scale}
              swayPhase={p.phase}
            />
          );
        })}

        {/* Stone boundary wall on the inland (back) edge */}
        <BoundaryWall
          position={[-3, houseY, -14]}
          width={28}
          depth={1.2}
          height={1.5}
          thickness={0.7}
          segments={18}
          gateSide="none"
          color={[0.7, 0.62, 0.48]}
        />

        {/* Fire pit */}
        <FirePit position={[firePos[0], fireY, firePos[1]]} rotationY={0} />

        {/* Qibla niche — a small whitewashed prayer shrine on the inland
            edge, oriented (in real geography) toward Mecca. Here it's
            just a small carved-out stone block. */}
        <group position={[cairnQiblaPos[0], qiblaY, cairnQiblaPos[1]]}>
          <mesh position={[0, 0.7, 0]} material={chunkyMat(STUCCO_LIGHT, { roughness: 1 })}>
            <boxGeometry args={[1.6, 1.4, 0.6]} />
          </mesh>
          <mesh position={[0, 1.55, 0]} material={stuccoTrim}>
            <coneGeometry args={[0.85, 0.5, 4]} />
          </mesh>
          {/* Niche cutout — a thin dark recess on the front face */}
          <mesh position={[0, 0.85, 0.32]} material={chunkyMat([0.12, 0.1, 0.08], { roughness: 1 })}>
            <boxGeometry args={[0.55, 0.95, 0.04]} />
          </mesh>
        </group>

        {/* Scattered baskets near the awning — woven oyster-collection
            baskets the divers fill at sea. */}
        {[
          [3, -7], [4.5, -6.6], [2, -6.8], [10, -3], [8.5, -4],
        ].map(([x, z], i) => {
          const y = terrainAt(x, z) - anchorY;
          return (
            <group key={i} position={[x, y + 0.3, z]}>
              <mesh material={chunkyMat(BASKET, { roughness: 1 })}>
                <cylinderGeometry args={[0.4, 0.32, 0.6, 8]} />
              </mesh>
              {/* Basket weave dark line */}
              <mesh position={[0, 0, 0]} material={chunkyMat([BASKET[0] * 0.7, BASKET[1] * 0.7, BASKET[2] * 0.7], { roughness: 1 })}>
                <torusGeometry args={[0.36, 0.04, 4, 14]} />
              </mesh>
              {/* Oyster heap inside */}
              <mesh position={[0, 0.3, 0]} material={chunkyMat(OYSTER_DARK, { roughness: 0.9 })}>
                <sphereGeometry args={[0.32, 7, 5]} />
              </mesh>
            </group>
          );
        })}
      </group>
    </>
  );
}
