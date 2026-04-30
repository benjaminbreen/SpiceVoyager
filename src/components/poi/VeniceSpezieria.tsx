// ── Venice — Spezieria al Cedro (Theriac Workshop) ─────────────────────────
//
// Bespoke high-quality POI: Maestro Stefano da Zen's theriac compounding
// shop on the Riva del Vin, a fondamenta on the Grand Canal between the
// Rialto bridge and Riva del Carbon. Two years before the Sanudo printer
// would catalogue the city's eleven licensed theriac masters — da Zen is
// one of them.
//
// The architectural signature is unmistakably Venetian and distinct from
// every other shipped POI:
//   1. Three-storey red-stuccoed shop-house with white Istrian stone trim
//      (the biggest top-down silhouette, the iconic Venetian red).
//   2. Iron-grilled theriac display window on the ground floor — square,
//      facing the canal, glows warmly at night with the apothecary's lamps.
//   3. Pointed Gothic windows on upper storeys with quatrefoil discs.
//   4. Terra-cotta tile roof at low pitch (NOT the Japanese deep eaves).
//   5. Distinctive Venetian mushroom-flared chimney pot.
//   6. Small inland campiello footprint: warm Istrian paving, low walls,
//      a wellhead, and one herb/hearth courtyard. No bespoke canal/waterline:
//      the generated Venice terrain owns the shoreline.
//
// Atmosphere:
//   - Two smoke wisps: chimney pot (cool wood-smoke) + cauldron hearth
//     (warmer, herb-tinged).
//   - Torches: 2 at shop entrance, 1 at cauldron.
//   - Theriac window glows warm at night; upper-floor windows glow softer.
//   - Subtle sway on the hanging-herb bunches.

import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { getTerrainHeight } from '../../utils/terrain';
import { chunkyMat, POISmokeInstancer, POITorchInstancer, getNightFactor, type POITorchSpot } from './atmosphere';
import { useGameStore } from '../../store/gameStore';

// ── Palette — Venetian red, Istrian stone, terra-cotta, canal dark ────────

const VENETIAN_RED: readonly [number, number, number] = [0.66, 0.28, 0.22];
const VENETIAN_RED_DEEP: readonly [number, number, number] = [0.52, 0.22, 0.18];
const VENETIAN_RED_PALE: readonly [number, number, number] = [0.78, 0.42, 0.32];
const ISTRIAN_STONE: readonly [number, number, number] = [0.92, 0.88, 0.80];
const ISTRIAN_SHADOW: readonly [number, number, number] = [0.72, 0.68, 0.60];
const TERRA_COTTA: readonly [number, number, number] = [0.62, 0.30, 0.20];
const TERRA_COTTA_DARK: readonly [number, number, number] = [0.46, 0.22, 0.16];
const TERRA_COTTA_RIDGE: readonly [number, number, number] = [0.38, 0.18, 0.14];
const IRON_GRILLE: readonly [number, number, number] = [0.18, 0.16, 0.14];
const COPPER: readonly [number, number, number] = [0.72, 0.42, 0.18];
const COPPER_DARK: readonly [number, number, number] = [0.52, 0.30, 0.14];
const HEARTH_STONE: readonly [number, number, number] = [0.50, 0.46, 0.42];
const PERGOLA_WOOD: readonly [number, number, number] = [0.42, 0.30, 0.20];
const HERB_SAFFRON: readonly [number, number, number] = [0.84, 0.56, 0.20];
const HERB_GENTIAN: readonly [number, number, number] = [0.40, 0.34, 0.55];
const HERB_GREY: readonly [number, number, number] = [0.55, 0.52, 0.48];
const HERB_GREEN: readonly [number, number, number] = [0.36, 0.46, 0.24];
const HERB_RED: readonly [number, number, number] = [0.62, 0.22, 0.18];
const CANAL_WATER: readonly [number, number, number] = [0.16, 0.22, 0.24];
const CANAL_WATER_DEEP: readonly [number, number, number] = [0.10, 0.14, 0.18];
const FONDAMENTA: readonly [number, number, number] = [0.78, 0.74, 0.68];
const FONDAMENTA_DARK: readonly [number, number, number] = [0.62, 0.58, 0.52];
const BAY_LAUREL_DARK: readonly [number, number, number] = [0.22, 0.32, 0.18];
const BAY_LAUREL_BRIGHT: readonly [number, number, number] = [0.32, 0.44, 0.24];
const SIGN_GOLD: readonly [number, number, number] = [0.78, 0.62, 0.20];

// ── Hash + RNG ────────────────────────────────────────────────────────────

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

// ── Pointed Gothic window — used on the upper storeys ──────────────────────
//
// Inset emissive panel with a pointed peak above and a small quatrefoil
// disc — the patrician palazzo signature. Reads as "Gothic" from above
// thanks to the peak silhouette and the disc.

function GothicWindow({ position, scale = 1, glow }: {
  position: readonly [number, number, number];
  scale?: number;
  glow: THREE.MeshStandardMaterial;
}) {
  const stone = chunkyMat(ISTRIAN_STONE, { roughness: 1 });
  const w = 0.65 * scale;
  const h = 1.1 * scale;
  return (
    <group position={position as unknown as [number, number, number]}>
      {/* Stone surround */}
      <mesh position={[0, 0, -0.02]} material={stone}>
        <boxGeometry args={[w + 0.18, h + 0.18, 0.08]} />
      </mesh>
      {/* Glass / shutter pane — emissive at night */}
      <mesh material={glow}>
        <boxGeometry args={[w, h, 0.04]} />
      </mesh>
      {/* Pointed peak — small triangle stone above */}
      <mesh position={[0, h * 0.5 + 0.18, -0.02]} material={stone} rotation={[0, 0, Math.PI / 4]}>
        <boxGeometry args={[w * 0.7, w * 0.7, 0.08]} />
      </mesh>
      {/* Quatrefoil disc — small circle ornament above the peak */}
      <mesh position={[0, h * 0.5 + 0.55, 0.02]} material={stone}>
        <cylinderGeometry args={[0.18 * scale, 0.18 * scale, 0.05, 8]} />
      </mesh>
      {/* Mullion — thin vertical bar dividing the pane */}
      <mesh position={[0, 0, 0.05]} material={stone}>
        <boxGeometry args={[0.06, h * 0.92, 0.06]} />
      </mesh>
    </group>
  );
}

// ── Theriac display window — the centerpiece ──────────────────────────────
//
// Iron-grilled square on the ground floor where the year's compound is
// publicly mixed. Larger than the Gothic windows; warm emissive at night
// with hanging herb silhouettes inside.

function TheriacWindow({ position, scale = 1, glow }: {
  position: readonly [number, number, number];
  scale?: number;
  glow: THREE.MeshStandardMaterial;
}) {
  const stone = chunkyMat(ISTRIAN_STONE, { roughness: 1 });
  const stoneShade = chunkyMat(ISTRIAN_SHADOW, { roughness: 1 });
  const iron = chunkyMat(IRON_GRILLE, { roughness: 0.9 });
  const w = 1.8 * scale;
  const h = 1.6 * scale;

  return (
    <group position={position as unknown as [number, number, number]}>
      {/* Stone surround */}
      <mesh position={[0, 0, -0.04]} material={stone}>
        <boxGeometry args={[w + 0.4, h + 0.4, 0.12]} />
      </mesh>
      {/* Stone sill (lower trim) */}
      <mesh position={[0, -h / 2 - 0.18, 0.02]} material={stoneShade}>
        <boxGeometry args={[w + 0.6, 0.16, 0.18]} />
      </mesh>
      {/* Glass / inner pane — warm emissive at night */}
      <mesh material={glow}>
        <boxGeometry args={[w, h, 0.04]} />
      </mesh>
      {/* Iron grille — vertical bars */}
      {Array.from({ length: 5 }).map((_, i) => (
        <mesh
          key={`v${i}`}
          position={[-w * 0.5 + (i + 1) * w / 6, 0, 0.06]}
          material={iron}
        >
          <boxGeometry args={[0.06, h, 0.06]} />
        </mesh>
      ))}
      {/* Iron grille — horizontal bars */}
      {Array.from({ length: 3 }).map((_, i) => (
        <mesh
          key={`h${i}`}
          position={[0, -h * 0.5 + (i + 1) * h / 4, 0.06]}
          material={iron}
        >
          <boxGeometry args={[w, 0.06, 0.06]} />
        </mesh>
      ))}
      {/* Hanging herb silhouettes inside the window — dim at day, lit at
          night. Each is a small dark cluster behind the bars. */}
      <mesh position={[-w * 0.28, h * 0.18, -0.02]} material={chunkyMat(HERB_SAFFRON, { roughness: 1 })}>
        <boxGeometry args={[0.18, 0.5, 0.06]} />
      </mesh>
      <mesh position={[0, h * 0.18, -0.02]} material={chunkyMat(HERB_GREY, { roughness: 1 })}>
        <boxGeometry args={[0.18, 0.55, 0.06]} />
      </mesh>
      <mesh position={[w * 0.28, h * 0.18, -0.02]} material={chunkyMat(HERB_RED, { roughness: 1 })}>
        <boxGeometry args={[0.18, 0.45, 0.06]} />
      </mesh>
    </group>
  );
}

// ── Mushroom-flared Venetian chimney pot ──────────────────────────────────
//
// The caminata Veneziana — the distinctive cone-flared chimney that flares
// outward at the top to break sparks before they reach the tile-and-wood
// roofs. Repeats on every Venetian rooftop and reads as a tiny Doric column
// with a flared cap.

function VenetianChimney({ position, scale = 1 }: {
  position: readonly [number, number, number];
  scale?: number;
}) {
  const stone = chunkyMat(ISTRIAN_STONE, { roughness: 1 });
  const stoneShade = chunkyMat(ISTRIAN_SHADOW, { roughness: 1 });
  const s = scale;
  return (
    <group position={position as unknown as [number, number, number]}>
      {/* Square base */}
      <mesh position={[0, 0.3 * s, 0]} material={stoneShade}>
        <boxGeometry args={[0.55 * s, 0.6 * s, 0.55 * s]} />
      </mesh>
      {/* Slim shaft */}
      <mesh position={[0, 1.0 * s, 0]} material={stone}>
        <cylinderGeometry args={[0.18 * s, 0.22 * s, 0.8 * s, 6]} />
      </mesh>
      {/* Flared inverted-cone cap (mushroom shape) */}
      <mesh position={[0, 1.5 * s, 0]} material={stoneShade}>
        <cylinderGeometry args={[0.5 * s, 0.22 * s, 0.36 * s, 8]} />
      </mesh>
      {/* Top rim */}
      <mesh position={[0, 1.72 * s, 0]} material={stone}>
        <cylinderGeometry args={[0.55 * s, 0.5 * s, 0.1 * s, 8]} />
      </mesh>
    </group>
  );
}

// ── The Spezieria — three-storey red-stuccoed shop-house ──────────────────
//
// Ground floor: shop with the iron-grilled theriac display window + door.
// Second floor: residence with three Gothic windows + small balcony.
// Third floor (attic-like): three smaller Gothic windows.
// Roof: low-pitched terra-cotta tile gable with white stone gutters and a
// mushroom chimney pot. White Istrian stone trim line at every floor break.

function SpezieriaHouse({ position, rotationY }: {
  position: readonly [number, number, number];
  rotationY: number;
}) {
  const w = 9.5;
  const d = 6.4;
  const f1H = 3.0;        // ground floor (shop)
  const f2H = 2.6;        // first piano nobile
  const f3H = 2.0;        // attic floor
  const totalH = f1H + f2H + f3H;
  const roofH = 1.2;

  const stucco = chunkyMat(VENETIAN_RED, { roughness: 1 });
  const stuccoDeep = chunkyMat(VENETIAN_RED_DEEP, { roughness: 1 });
  const stuccoPale = chunkyMat(VENETIAN_RED_PALE, { roughness: 1 });
  const stone = chunkyMat(ISTRIAN_STONE, { roughness: 1 });
  const stoneShade = chunkyMat(ISTRIAN_SHADOW, { roughness: 1 });
  const tile = chunkyMat(TERRA_COTTA, { roughness: 0.9 });
  const tileDark = chunkyMat(TERRA_COTTA_DARK, { roughness: 0.9 });
  const tileRidge = chunkyMat(TERRA_COTTA_RIDGE, { roughness: 0.85 });
  const wood = chunkyMat(PERGOLA_WOOD, { roughness: 1 });
  const iron = chunkyMat(IRON_GRILLE, { roughness: 0.9 });
  const goldSign = chunkyMat(SIGN_GOLD, { roughness: 0.5, metalness: 0.4 });

  // Emissive glows, ramped by night factor.
  const theriacGlow = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#2a1a0e',
    emissive: '#ffaa50',
    emissiveIntensity: 0,
    flatShading: true,
    roughness: 0.85,
  }), []);
  const upperGlow = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#1f1810',
    emissive: '#ffc880',
    emissiveIntensity: 0,
    flatShading: true,
    roughness: 0.9,
  }), []);

  useFrame(() => {
    const timeOfDay = useGameStore.getState().timeOfDay;
    const n = getNightFactor(timeOfDay);
    theriacGlow.emissiveIntensity = n * 1.4;
    upperGlow.emissiveIntensity = n * 0.55;
  });

  return (
    <group position={position as unknown as [number, number, number]} rotation={[0, rotationY, 0]}>
      {/* ── Stone plinth ── */}
      <mesh position={[0, 0.18, 0]} material={stoneShade}>
        <boxGeometry args={[w + 0.4, 0.36, d + 0.4]} />
      </mesh>

      {/* ── Floor 1: ground floor (shop) ── */}
      <mesh position={[0, 0.36 + f1H * 0.5, 0]} material={stucco}>
        <boxGeometry args={[w, f1H, d]} />
      </mesh>
      {/* Stone trim line at top of floor 1 */}
      <mesh position={[0, 0.36 + f1H + 0.1, 0]} material={stone}>
        <boxGeometry args={[w + 0.2, 0.2, d + 0.2]} />
      </mesh>

      {/* Theriac display window — front center, facing -Z */}
      <TheriacWindow
        position={[0, 0.36 + f1H * 0.55, -d / 2 - 0.06]}
        scale={1}
        glow={theriacGlow}
      />

      {/* Shop door — left of window */}
      <mesh position={[-w * 0.36, 0.36 + 1.1, -d / 2 - 0.04]} material={chunkyMat([0.18, 0.12, 0.08], { roughness: 1 })}>
        <boxGeometry args={[1.2, 2.2, 0.1]} />
      </mesh>
      {/* Stone door surround */}
      <mesh position={[-w * 0.36, 0.36 + 1.1, -d / 2 - 0.05]} material={stone}>
        <boxGeometry args={[1.4, 2.4, 0.08]} />
      </mesh>
      {/* Inner door pane (offset deeper, dark with hint of warm interior) */}
      <mesh position={[-w * 0.36, 0.36 + 1.1, -d / 2 - 0.02]} material={chunkyMat([0.32, 0.20, 0.10], { roughness: 0.85 })}>
        <boxGeometry args={[1.0, 2.0, 0.04]} />
      </mesh>

      {/* Hanging shop sign — small wooden plaque on iron bracket above door */}
      <mesh position={[-w * 0.36, 0.36 + 2.6, -d / 2 - 0.5]} material={iron}>
        <boxGeometry args={[0.05, 0.4, 0.5]} />
      </mesh>
      <mesh position={[-w * 0.36, 0.36 + 2.4, -d / 2 - 0.7]} rotation={[0, 0, 0]} material={wood}>
        <boxGeometry args={[0.85, 0.6, 0.06]} />
      </mesh>
      {/* Gold stencil — represented as a small bright disc on the sign */}
      <mesh position={[-w * 0.36, 0.36 + 2.4, -d / 2 - 0.74]} material={goldSign}>
        <cylinderGeometry args={[0.16, 0.16, 0.02, 8]} />
      </mesh>

      {/* ── Floor 2: piano nobile ── */}
      <mesh position={[0, 0.36 + f1H + 0.2 + f2H * 0.5, 0]} material={stucco}>
        <boxGeometry args={[w, f2H, d]} />
      </mesh>
      {/* Three Gothic windows on front */}
      {[-w * 0.32, 0, w * 0.32].map((x, i) => (
        <GothicWindow
          key={`f2-${i}`}
          position={[x, 0.36 + f1H + 0.2 + f2H * 0.5, -d / 2 - 0.05]}
          scale={1}
          glow={upperGlow}
        />
      ))}
      {/* Small iron balcony in front of the central window */}
      <mesh position={[0, 0.36 + f1H + 0.2, -d / 2 - 0.4]} material={iron}>
        <boxGeometry args={[2.4, 0.1, 0.6]} />
      </mesh>
      {/* Balcony rail — tiny vertical bars */}
      {Array.from({ length: 6 }).map((_, i) => (
        <mesh
          key={`bal${i}`}
          position={[-1.0 + i * 0.4, 0.36 + f1H + 0.5, -d / 2 - 0.6]}
          material={iron}
        >
          <boxGeometry args={[0.04, 0.55, 0.04]} />
        </mesh>
      ))}
      {/* Balcony top rail */}
      <mesh position={[0, 0.36 + f1H + 0.78, -d / 2 - 0.6]} material={iron}>
        <boxGeometry args={[2.4, 0.06, 0.06]} />
      </mesh>
      {/* Stone trim line at top of floor 2 */}
      <mesh position={[0, 0.36 + f1H + 0.2 + f2H + 0.1, 0]} material={stone}>
        <boxGeometry args={[w + 0.2, 0.18, d + 0.2]} />
      </mesh>

      {/* ── Floor 3: attic ── */}
      <mesh position={[0, 0.36 + f1H + 0.2 + f2H + 0.2 + f3H * 0.5, 0]} material={stuccoDeep}>
        <boxGeometry args={[w, f3H, d]} />
      </mesh>
      {/* Three smaller Gothic windows — top floor */}
      {[-w * 0.32, 0, w * 0.32].map((x, i) => (
        <GothicWindow
          key={`f3-${i}`}
          position={[x, 0.36 + f1H + 0.2 + f2H + 0.2 + f3H * 0.55, -d / 2 - 0.05]}
          scale={0.7}
          glow={upperGlow}
        />
      ))}

      {/* Side walls — thin stripe of paler stucco simulating sun-bleached
          west face, deeper red on the east face. Subtle but reads. */}
      <mesh position={[w / 2 - 0.04, 0.36 + totalH * 0.5 + 0.2, 0]} material={stuccoPale}>
        <boxGeometry args={[0.05, totalH, d - 0.4]} />
      </mesh>
      <mesh position={[-w / 2 + 0.04, 0.36 + totalH * 0.5 + 0.2, 0]} material={stuccoDeep}>
        <boxGeometry args={[0.05, totalH, d - 0.4]} />
      </mesh>

      {/* ── Roof — broad terra-cotta gable with chunky eaves ── */}
      {/* Roof base box (the eave-thickness slab at the top of the wall) */}
      <mesh position={[0, 0.36 + totalH + 0.4, 0]} material={tileRidge}>
        <boxGeometry args={[w + 0.4, 0.2, d + 0.4]} />
      </mesh>
      {/* Front (north) tile slope */}
      <mesh
        position={[0, 0.36 + totalH + 0.32 + roofH * 0.5, -d * 0.18]}
        rotation={[-0.38, 0, 0]}
        material={tile}
      >
        <boxGeometry args={[w + 0.8, 0.28, d * 0.62]} />
      </mesh>
      {/* Back (south) tile slope */}
      <mesh
        position={[0, 0.36 + totalH + 0.32 + roofH * 0.5, d * 0.18]}
        rotation={[0.38, 0, 0]}
        material={tileDark}
      >
        <boxGeometry args={[w + 0.8, 0.28, d * 0.62]} />
      </mesh>
      {/* Ridge cap */}
      <mesh position={[0, 0.36 + totalH + 0.32 + roofH + 0.02, 0]} material={tileRidge}>
        <boxGeometry args={[w + 0.45, 0.16, 0.34]} />
      </mesh>

      {/* Mushroom chimney pot on the back-left of the roof ridge */}
      <VenetianChimney
        position={[-w * 0.26, 0.36 + totalH + 0.32 + roofH + 0.04, d * 0.15]}
        scale={1.0}
      />
    </group>
  );
}

// ── Theriac compounding hearth — open-air courtyard installation ──────────
//
// Stone hearth with a copper kettle, hanging dried herb bunches on a
// wooden frame above, and a small wooden bench with mortars and pestles.
// This is where Maestro da Zen actually mixes the formula. Smoke rises
// from the kettle (added at the top level via ChimneySmoke).

function TheriacHearth({ position, rotationY }: {
  position: readonly [number, number, number];
  rotationY: number;
}) {
  const stone = chunkyMat(HEARTH_STONE, { roughness: 1 });
  const stoneDark = chunkyMat([HEARTH_STONE[0] * 0.7, HEARTH_STONE[1] * 0.7, HEARTH_STONE[2] * 0.7], { roughness: 1 });
  const copper = chunkyMat(COPPER, { roughness: 0.5, metalness: 0.6 });
  const copperDark = chunkyMat(COPPER_DARK, { roughness: 0.55, metalness: 0.55 });
  const wood = chunkyMat(PERGOLA_WOOD, { roughness: 1 });
  const benchWood = chunkyMat([PERGOLA_WOOD[0] * 0.85, PERGOLA_WOOD[1] * 0.85, PERGOLA_WOOD[2] * 0.85], { roughness: 1 });

  // Hearth glow — emissive plate that reads as embers at night.
  const emberGlow = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#1a0a04',
    emissive: '#ff6020',
    emissiveIntensity: 0.2,
    flatShading: true,
    roughness: 0.9,
    toneMapped: false,
  }), []);
  useFrame(({ clock }) => {
    const timeOfDay = useGameStore.getState().timeOfDay;
    const n = getNightFactor(timeOfDay);
    const flicker = 0.85 + Math.sin(clock.elapsedTime * 4.7) * 0.1 + Math.sin(clock.elapsedTime * 13.2) * 0.05;
    emberGlow.emissiveIntensity = (0.2 + n * 1.0) * flicker;
  });

  return (
    <group position={position as unknown as [number, number, number]} rotation={[0, rotationY, 0]}>
      {/* Hearth base — square stone block */}
      <mesh position={[0, 0.4, 0]} material={stone}>
        <boxGeometry args={[2.6, 0.8, 1.6]} />
      </mesh>
      {/* Stepped trim along the top */}
      <mesh position={[0, 0.84, 0]} material={stoneDark}>
        <boxGeometry args={[2.4, 0.12, 1.4]} />
      </mesh>
      {/* Ember plate inset — emissive at night */}
      <mesh position={[0, 0.91, 0]} material={emberGlow}>
        <boxGeometry args={[0.9, 0.04, 0.9]} />
      </mesh>
      {/* Copper kettle — body */}
      <mesh position={[0, 1.4, 0]} material={copper}>
        <cylinderGeometry args={[0.55, 0.42, 1.0, 12]} />
      </mesh>
      {/* Kettle rim */}
      <mesh position={[0, 1.92, 0]} material={copperDark}>
        <torusGeometry args={[0.52, 0.06, 5, 16]} />
      </mesh>
      {/* Kettle handles — two little brass arches */}
      <mesh position={[0.6, 1.6, 0]} rotation={[0, 0, Math.PI / 2]} material={copperDark}>
        <torusGeometry args={[0.18, 0.04, 4, 8, Math.PI]} />
      </mesh>
      <mesh position={[-0.6, 1.6, 0]} rotation={[0, 0, Math.PI / 2]} material={copperDark}>
        <torusGeometry args={[0.18, 0.04, 4, 8, Math.PI]} />
      </mesh>
      {/* Crank arm above the kettle (for stirring during the public ceremony) */}
      <mesh position={[0, 2.4, 0]} material={wood}>
        <boxGeometry args={[0.16, 0.16, 1.6]} />
      </mesh>
      {/* Vertical paddle dropping into the kettle */}
      <mesh position={[0, 1.85, 0]} material={wood}>
        <boxGeometry args={[0.1, 0.9, 0.1]} />
      </mesh>

      {/* Adjacent wooden bench with mortars and pestles */}
      <group position={[2.4, 0, 0]}>
        {/* Bench top */}
        <mesh position={[0, 0.65, 0]} material={benchWood}>
          <boxGeometry args={[1.4, 0.12, 1.0]} />
        </mesh>
        {/* Bench legs */}
        {[
          [-0.6, -0.4],
          [0.6, -0.4],
          [-0.6, 0.4],
          [0.6, 0.4],
        ].map(([x, z], i) => (
          <mesh key={i} position={[x, 0.32, z]} material={benchWood}>
            <boxGeometry args={[0.1, 0.6, 0.1]} />
          </mesh>
        ))}
        {/* Two stone mortars on the bench */}
        <mesh position={[-0.4, 0.85, 0.15]} material={stone}>
          <cylinderGeometry args={[0.18, 0.22, 0.32, 8]} />
        </mesh>
        <mesh position={[0.35, 0.85, -0.18]} material={stone}>
          <cylinderGeometry args={[0.16, 0.20, 0.28, 8]} />
        </mesh>
        {/* Pestles — small angled wooden batons */}
        <mesh position={[-0.4, 1.05, 0.05]} rotation={[0.4, 0, 0.3]} material={wood}>
          <cylinderGeometry args={[0.04, 0.05, 0.4, 6]} />
        </mesh>
      </group>
    </group>
  );
}

// ── Hanging-herb pergola ──────────────────────────────────────────────────
//
// Open wooden frame under which bunches of dried plants hang upside down —
// the universal apothecary signature. Five colors of bunch interleave for
// a strong polychrome reading from above (saffron orange, gentian purple,
// muted grey, sage green, dried-rose red). Subtle sway on the bunches.

function HangingHerbPergola({ position, rotationY, swayPhase }: {
  position: readonly [number, number, number];
  rotationY: number;
  swayPhase: number;
}) {
  const wood = chunkyMat(PERGOLA_WOOD, { roughness: 1 });
  const woodDark = chunkyMat([PERGOLA_WOOD[0] * 0.75, PERGOLA_WOOD[1] * 0.75, PERGOLA_WOOD[2] * 0.75], { roughness: 1 });
  const stone = chunkyMat(ISTRIAN_SHADOW, { roughness: 1 });

  const bunches = useMemo(() => {
    const colors = [HERB_SAFFRON, HERB_GENTIAN, HERB_GREY, HERB_GREEN, HERB_RED];
    const out: Array<{ x: number; z: number; color: readonly [number, number, number]; len: number; r: number }> = [];
    let i = 0;
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 5; col++) {
        out.push({
          x: -1.6 + col * 0.8,
          z: -0.4 + row * 0.8,
          color: colors[i % colors.length],
          len: 0.55 + (i * 0.07) % 0.25,
          r: 0.13 + (i * 0.05) % 0.08,
        });
        i++;
      }
    }
    return out;
  }, []);

  const bunchGroupRef = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!bunchGroupRef.current) return;
    const t = clock.elapsedTime;
    bunchGroupRef.current.rotation.x = Math.sin(t * 0.4 + swayPhase) * 0.025;
    bunchGroupRef.current.rotation.z = Math.sin(t * 0.5 + swayPhase * 1.4) * 0.018;
  });

  return (
    <group position={position as unknown as [number, number, number]} rotation={[0, rotationY, 0]}>
      {/* Stone bases for the pergola posts */}
      {[
        [-2.2, -1.0],
        [2.2, -1.0],
        [-2.2, 1.0],
        [2.2, 1.0],
      ].map(([x, z], i) => (
        <mesh key={`base${i}`} position={[x, 0.15, z]} material={stone}>
          <boxGeometry args={[0.5, 0.3, 0.5]} />
        </mesh>
      ))}
      {/* Four posts */}
      {[
        [-2.2, -1.0],
        [2.2, -1.0],
        [-2.2, 1.0],
        [2.2, 1.0],
      ].map(([x, z], i) => (
        <mesh key={`post${i}`} position={[x, 1.6, z]} material={wood}>
          <boxGeometry args={[0.22, 2.8, 0.22]} />
        </mesh>
      ))}
      {/* Top crossbeams (X axis) */}
      <mesh position={[0, 3.0, -1.0]} material={woodDark}>
        <boxGeometry args={[4.8, 0.18, 0.22]} />
      </mesh>
      <mesh position={[0, 3.0, 1.0]} material={woodDark}>
        <boxGeometry args={[4.8, 0.18, 0.22]} />
      </mesh>
      {/* Top crossbeams (Z axis) */}
      <mesh position={[-2.2, 3.0, 0]} material={woodDark}>
        <boxGeometry args={[0.22, 0.18, 2.0]} />
      </mesh>
      <mesh position={[2.2, 3.0, 0]} material={woodDark}>
        <boxGeometry args={[0.22, 0.18, 2.0]} />
      </mesh>
      {/* Hanging-bunch group */}
      <group ref={bunchGroupRef} position={[0, 2.9, 0]}>
        {bunches.map((b, i) => (
          <group key={i} position={[b.x, 0, b.z]}>
            {/* Twine — short thin rope from beam to bunch */}
            <mesh position={[0, -0.08, 0]} material={woodDark}>
              <boxGeometry args={[0.04, 0.16, 0.04]} />
            </mesh>
            {/* Stem cluster — narrow cylinder */}
            <mesh position={[0, -0.4, 0]} material={chunkyMat([b.color[0] * 0.55, b.color[1] * 0.55, b.color[2] * 0.55], { roughness: 1 })}>
              <cylinderGeometry args={[0.04, 0.06, b.len, 6]} />
            </mesh>
            {/* Bunch puff at the bottom */}
            <mesh position={[0, -0.4 - b.len * 0.5, 0]} material={chunkyMat(b.color, { roughness: 1 })}>
              <sphereGeometry args={[b.r, 7, 5]} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}

// ── Octagonal wellhead (vera da pozzo) ────────────────────────────────────
//
// Carved Istrian-stone octagonal pillar with an iron well-collar at top
// and a pulley arm. Every campiello in Venice has one; reads as a small
// monumental cylinder from above.

function VeneraDaPozzo({ position, rotationY }: {
  position: readonly [number, number, number];
  rotationY: number;
}) {
  const stone = chunkyMat(ISTRIAN_STONE, { roughness: 1 });
  const stoneShade = chunkyMat(ISTRIAN_SHADOW, { roughness: 1 });
  const iron = chunkyMat(IRON_GRILLE, { roughness: 0.9 });
  const wood = chunkyMat(PERGOLA_WOOD, { roughness: 1 });
  const water = chunkyMat(CANAL_WATER_DEEP, { roughness: 0.3, metalness: 0.6 });

  return (
    <group position={position as unknown as [number, number, number]} rotation={[0, rotationY, 0]}>
      {/* Octagonal stone base */}
      <mesh position={[0, 0.5, 0]} material={stone}>
        <cylinderGeometry args={[0.85, 0.95, 1.0, 8]} />
      </mesh>
      {/* Carved trim band — slightly darker */}
      <mesh position={[0, 0.85, 0]} material={stoneShade}>
        <cylinderGeometry args={[0.92, 0.92, 0.15, 8]} />
      </mesh>
      {/* Top rim */}
      <mesh position={[0, 1.05, 0]} material={stone}>
        <cylinderGeometry args={[0.78, 0.82, 0.18, 8]} />
      </mesh>
      {/* Iron collar (inner) */}
      <mesh position={[0, 1.16, 0]} material={iron}>
        <torusGeometry args={[0.62, 0.06, 4, 12]} />
      </mesh>
      {/* Water surface (small disc inside the rim, dark) */}
      <mesh position={[0, 1.13, 0]} material={water}>
        <cylinderGeometry args={[0.55, 0.55, 0.04, 12]} />
      </mesh>
      {/* Pulley arm — tall iron arch over the well */}
      <mesh position={[-0.7, 1.7, 0]} material={iron}>
        <boxGeometry args={[0.06, 1.1, 0.06]} />
      </mesh>
      <mesh position={[0.7, 1.7, 0]} material={iron}>
        <boxGeometry args={[0.06, 1.1, 0.06]} />
      </mesh>
      <mesh position={[0, 2.2, 0]} material={iron}>
        <boxGeometry args={[1.5, 0.06, 0.06]} />
      </mesh>
      {/* Pulley wheel */}
      <mesh position={[0, 2.16, 0]} rotation={[Math.PI / 2, 0, 0]} material={wood}>
        <cylinderGeometry args={[0.12, 0.12, 0.06, 8]} />
      </mesh>
      {/* Bucket hanging from the pulley */}
      <mesh position={[0, 1.6, 0]} material={wood}>
        <cylinderGeometry args={[0.18, 0.16, 0.32, 8]} />
      </mesh>
    </group>
  );
}

// ── Bay laurel shrub — ornamental in the campiello ────────────────────────
//
// Small dense evergreen at the base of the back wall, providing a green
// note against the red stucco. Subtle sway.

function BayLaurel({ position, scale = 1, swayPhase = 0 }: {
  position: readonly [number, number, number];
  scale?: number;
  swayPhase?: number;
}) {
  const dark = chunkyMat(BAY_LAUREL_DARK, { roughness: 1 });
  const bright = chunkyMat(BAY_LAUREL_BRIGHT, { roughness: 1 });
  const trunk = chunkyMat(PERGOLA_WOOD, { roughness: 1 });

  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.rotation.z = Math.sin(clock.elapsedTime * 0.5 + swayPhase) * 0.02;
  });

  return (
    <group position={position as unknown as [number, number, number]} scale={[scale, scale, scale]}>
      {/* Short trunk */}
      <mesh position={[0, 0.4, 0]} material={trunk}>
        <cylinderGeometry args={[0.12, 0.18, 0.8, 6]} />
      </mesh>
      <group ref={ref} position={[0, 0.8, 0]}>
        {/* Dense leaf cluster — three overlapping spheres for irregular shape */}
        <mesh position={[0, 0.4, 0]} scale={[1, 0.85, 1]} material={dark}>
          <sphereGeometry args={[0.85, 8, 6]} />
        </mesh>
        <mesh position={[0.3, 0.35, 0.2]} scale={[0.8, 0.7, 0.8]} material={bright}>
          <sphereGeometry args={[0.55, 8, 6]} />
        </mesh>
        <mesh position={[-0.25, 0.5, -0.15]} scale={[0.7, 0.8, 0.7]} material={bright}>
          <sphereGeometry args={[0.5, 8, 6]} />
        </mesh>
        <mesh position={[0.05, 0.7, 0.0]} scale={[0.6, 0.55, 0.6]} material={dark}>
          <sphereGeometry args={[0.4, 8, 6]} />
        </mesh>
      </group>
    </group>
  );
}

// ── Top-level compound ────────────────────────────────────────────────────

export function VeniceSpezieria({ poiId, position, rotationY }: {
  poiId: string;
  position: readonly [number, number, number];
  rotationY: number;
}) {
  const seed = hashStr(poiId);
  const rng = mulberry32(seed);
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

  // Compact local-space layout. The model is authored as one flat campiello
  // so the modal preview cannot pull individual props above or below the shop.
  const housePos: [number, number] = [0, 2.4];
  const hearthPos: [number, number] = [-5.1, -3.8];
  const pergolaPos: [number, number] = [-5.1, -3.8];
  const wellPos: [number, number] = [4.8, -3.9];
  const laurelPositions: Array<[number, number]> = [[-7.1, 6.9], [6.8, 6.9], [7.6, -0.8]];

  const houseY = 0;
  const hearthY = 0;
  const pergolaY = 0;
  const wellY = 0;

  const pavingY = 0.03;

  // Atmosphere — torch spots at the shop door and hearth.
  const torchSpots: POITorchSpot[] = useMemo(() => {
    const c = Math.cos(rotationY);
    const s = Math.sin(rotationY);
    const local: Array<[number, number, number]> = [
      [housePos[0] - 4.5, houseY + 3.0, housePos[1] - 3.25],
      [housePos[0] + 1.45, houseY + 3.0, housePos[1] - 3.25],
      // Hearth torch
      [hearthPos[0], hearthY + 2.5, hearthPos[1]],
    ];
    return local.map(([lx, ly, lz]) => ({
      pos: [
        ax + (lx * c - lz * s),
        anchorY + ly,
        az + (lx * s + lz * c),
      ] as [number, number, number],
      warmth: 'warm',
    }));
  }, [ax, az, anchorY, houseY, hearthY, rotationY]);

  // Two smoke wisps — chimney pot + cauldron hearth.
  const chimneySmokePos: [number, number, number] = useMemo(() => {
    const c = Math.cos(rotationY);
    const s = Math.sin(rotationY);
    const lx = housePos[0] - 9.5 * 0.26;
    const lz = housePos[1] + 6.4 * 0.15;
    const ly = houseY + 0.36 + (3.0 + 2.6 + 2.0) + 0.32 + 1.2 + 1.72;
    return [
      ax + (lx * c - lz * s),
      anchorY + ly,
      az + (lx * s + lz * c),
    ];
  }, [ax, az, anchorY, houseY, rotationY]);

  const hearthSmokePos: [number, number, number] = useMemo(() => {
    const c = Math.cos(rotationY);
    const s = Math.sin(rotationY);
    const ly = hearthY + 2.0;
    return [
      ax + (hearthPos[0] * c - hearthPos[1] * s),
      anchorY + ly,
      az + (hearthPos[0] * s + hearthPos[1] * c),
    ];
  }, [ax, az, anchorY, hearthY, rotationY]);

  const smokeSpots = useMemo(() => [
    { pos: chimneySmokePos, warmth: 'cool' as const, scale: 0.85 },
    { pos: hearthSmokePos, warmth: 'warm' as const, scale: 1.0 },
  ], [chimneySmokePos, hearthSmokePos]);

  // Gravel/stone palette materials — used for the campiello paving and walls.
  const fondamentaMat = useMemo(() => chunkyMat(FONDAMENTA, { roughness: 1 }), []);
  const fondamentaDarkMat = useMemo(() => chunkyMat(FONDAMENTA_DARK, { roughness: 1 }), []);
  const istrianMat = useMemo(() => chunkyMat(ISTRIAN_STONE, { roughness: 1 }), []);

  // Sway phase per laurel
  const laurelPhases = useMemo(() => laurelPositions.map(() => rng() * Math.PI * 2), [seed]);

  return (
    <>
      <POITorchInstancer spots={torchSpots} />
      <POISmokeInstancer spots={smokeSpots} />

      <group position={position as unknown as [number, number, number]} rotation={[0, rotationY, 0]}>
        {/* ── Campiello paving: compact slabs, no modal z-fighting planes ── */}
        <mesh position={[0, pavingY, 0.8]} material={fondamentaDarkMat}>
          <boxGeometry args={[17, 0.12, 13.5]} />
        </mesh>
        <mesh position={[0, pavingY + 0.08, -2.2]} material={fondamentaMat}>
          <boxGeometry args={[15.2, 0.1, 5.5]} />
        </mesh>
        <mesh position={[-5.1, pavingY + 0.14, -3.8]} material={fondamentaMat}>
          <boxGeometry args={[5.4, 0.1, 4.2]} />
        </mesh>

        {/* Low walls frame the court while keeping the whole POI readable. */}
        <mesh position={[0, 0.55, 7.75]} material={istrianMat}>
          <boxGeometry args={[16.8, 1.1, 0.42]} />
        </mesh>
        <mesh position={[-8.6, 0.45, 1.5]} material={istrianMat}>
          <boxGeometry args={[0.42, 0.9, 11.8]} />
        </mesh>
        <mesh position={[8.6, 0.45, 2.2]} material={istrianMat}>
          <boxGeometry args={[0.42, 0.9, 10.4]} />
        </mesh>

        {/* ── The shop-house (Spezieria al Cedro) ── */}
        <SpezieriaHouse
          position={[housePos[0], houseY, housePos[1]]}
          rotationY={0}
        />

        {/* ── Theriac compounding hearth ── */}
        <TheriacHearth
          position={[hearthPos[0], hearthY, hearthPos[1]]}
          rotationY={Math.PI / 2}
        />

        {/* ── Hanging-herb pergola (behind the hearth) ── */}
        <HangingHerbPergola
          position={[pergolaPos[0], pergolaY, pergolaPos[1]]}
          rotationY={0}
          swayPhase={(seed % 1000) / 1000 * Math.PI * 2}
        />

        {/* ── Wellhead in the campiello ── */}
        <VeneraDaPozzo
          position={[wellPos[0], wellY, wellPos[1]]}
          rotationY={Math.PI / 8}
        />

        {/* ── Bay laurel shrubs along the back wall ── */}
        {laurelPositions.map(([lx, lz], i) => {
          return (
            <BayLaurel
              key={i}
              position={[lx, 0, lz]}
              scale={0.9 + (i % 2) * 0.15}
              swayPhase={laurelPhases[i]}
            />
          );
        })}
      </group>
    </>
  );
}
