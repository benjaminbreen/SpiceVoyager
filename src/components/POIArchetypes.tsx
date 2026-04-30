// ── POI Archetype Silhouettes ──────────────────────────────────────────────
//
// Chunky low-poly silhouettes for POI archetypes that don't reuse in-city
// geometry. Authored in the splash-globe style (flatShading, exaggerated
// proportions, saturated palette) so each one reads as a recognizable
// landmark from across the hinterland — not just an abstract marker.
//
// Four archetypes today:
//   - Wreck            : tilted hull + broken mast on a beach / reef
//   - SmugglersCove    : hidden lean-to + crates + small jetty
//   - Garden           : walled compound + greenhouse + corner gazebo
//   - Caravanserai     : square courtyard + crenellated walls + corner towers
//
// Procedural variation is hashed off the POI id so the same world seed
// produces the same silhouette on the same hilltop. Each archetype declares
// its own variant axes; nothing is shared except the part-count budget.
//
// Mounting pattern matches POIBeacons in ProceduralCity.tsx — POISilhouettes
// reads ports, resolves each POI's position, and dispatches by kind. POIs
// that already have geometry (shrines, landmark-bound POIs) skip this pass.
//
// ── Perf notes ─────────────────────────────────────────────────────────────
// Every <meshStandardMaterial color={new THREE.Color(...)} /> instantiates a
// fresh material on each render. With ~50 POIs × ~15 sub-meshes each, that's
// ~750 allocations per render. The shared `chunkyMaterial(...)` cache keys
// MeshStandardMaterial by RGB triple + opacity so identical colors reuse one
// GPU material across all silhouettes. Static palettes are hoisted to
// module scope; variant-dependent colors come from per-variant lookup tables
// also at module scope.
//
// True GPU instancing (one InstancedMesh per (geometry × material) bucket)
// is a future optimization — variant geometry varies per POI, so bucketing
// without a full archetype-aware pipeline is non-trivial. Material caching
// captures most of the win until then.

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '../store/gameStore';
import { getPOIsForPort } from '../utils/poiDefinitions';
import type { POIDefinition } from '../utils/poiDefinitions';
import { getTerrainHeight } from '../utils/terrain';
import { SEA_LEVEL } from '../constants/world';
import { resolveSnappedPOI } from '../utils/proximityResolution';
import { BESPOKE_POI_IDS } from './BespokePOIs';

type PortsProp = ReturnType<typeof useGameStore.getState>['ports'];
const POI_RENDER_RADIUS_SQ = 340 * 340;

// ── Material cache ──────────────────────────────────────────────────────────
//
// Keyed by quantized RGB + opacity + flag bits. Quantization to 1/256
// collapses near-identical colors so two crates that differ by 0.005 in red
// (procedural jitter) reuse one material — without it the cache fills with
// redundant entries.

interface MatOpts {
  opacity?: number;
  metalness?: number;
  roughness?: number;
}

const matCache = new Map<string, THREE.MeshStandardMaterial>();

function chunkyMaterial(rgb: readonly [number, number, number], opts: MatOpts = {}): THREE.MeshStandardMaterial {
  const r = Math.round(rgb[0] * 255);
  const g = Math.round(rgb[1] * 255);
  const b = Math.round(rgb[2] * 255);
  const op = opts.opacity ?? 1;
  const m = opts.metalness ?? 0;
  const ro = opts.roughness ?? 0.95;
  const key = `${r}_${g}_${b}_${Math.round(op * 100)}_${Math.round(m * 100)}_${Math.round(ro * 100)}`;
  const cached = matCache.get(key);
  if (cached) return cached;
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(rgb[0], rgb[1], rgb[2]),
    flatShading: true,
    roughness: ro,
    metalness: m,
    transparent: op < 1,
    opacity: op,
  });
  matCache.set(key, mat);
  return mat;
}

// ── Hash + variant helpers ──────────────────────────────────────────────────

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

// ── Static palettes (module-level constants) ───────────────────────────────

const WRECK_TRIM: [number, number, number] = [0.28, 0.18, 0.12];
const WRECK_HULL_CARRACK: [number, number, number] = [0.42, 0.30, 0.20];
const WRECK_HULL_DHOW: [number, number, number] = [0.55, 0.42, 0.28];

const COVE_CLIFF: [number, number, number] = [0.45, 0.42, 0.36];
const COVE_CLIFF_DARK: [number, number, number] = [0.41, 0.39, 0.33];
const COVE_WOOD: [number, number, number] = [0.38, 0.26, 0.16];
const COVE_THATCH: [number, number, number] = [0.65, 0.55, 0.34];
const COVE_CRATE_BASE: [number, number, number] = [0.52, 0.38, 0.24];

interface GardenCulture {
  key: string;
  wall: [number, number, number];
  wallTrim: [number, number, number];
  gazebo: [number, number, number];
  herb: [number, number, number];
}
const GARDEN_CULTURES: GardenCulture[] = [
  { key: 'mughal',  wall: [0.62, 0.32, 0.26], wallTrim: [0.527, 0.272, 0.221], gazebo: [0.85, 0.78, 0.42], herb: [0.32, 0.48, 0.26] },
  { key: 'jesuit',  wall: [0.92, 0.88, 0.78], wallTrim: [0.782, 0.748, 0.663], gazebo: [0.62, 0.30, 0.22], herb: [0.30, 0.46, 0.28] },
  { key: 'chinese', wall: [0.68, 0.62, 0.55], wallTrim: [0.578, 0.527, 0.468], gazebo: [0.62, 0.18, 0.16], herb: [0.34, 0.50, 0.24] },
  { key: 'yemeni',  wall: [0.78, 0.62, 0.45], wallTrim: [0.663, 0.527, 0.383], gazebo: [0.55, 0.42, 0.28], herb: [0.40, 0.46, 0.22] },
];
const GARDEN_GREENHOUSE: [number, number, number] = [0.78, 0.86, 0.84];
const GARDEN_PATH: [number, number, number] = [0.78, 0.74, 0.66];

const CARAVANSERAI_WALL_SANDSTONE: [number, number, number] = [0.78, 0.62, 0.42];
const CARAVANSERAI_WALL_MUDBRICK: [number, number, number] = [0.66, 0.52, 0.36];
const CARAVANSERAI_TRIM_SANDSTONE: [number, number, number] = [0.663, 0.527, 0.357];
const CARAVANSERAI_TRIM_MUDBRICK: [number, number, number] = [0.561, 0.442, 0.306];
const CARAVANSERAI_GATE: [number, number, number] = [0.18, 0.12, 0.08];
const CARAVANSERAI_FLAGPOLE: [number, number, number] = [0.32, 0.22, 0.14];

// Naturalist Camp (Hadhrami aloe / gum collectors on salt flats).
const CAMP_GOATHAIR: [number, number, number] = [0.20, 0.17, 0.14];
const CAMP_CANVAS: [number, number, number] = [0.78, 0.68, 0.50];
const CAMP_CANVAS_DARK: [number, number, number] = [0.62, 0.52, 0.36];
const CAMP_WOOD: [number, number, number] = [0.32, 0.20, 0.12];
const CAMP_SALT: [number, number, number] = [0.86, 0.83, 0.74];
const CAMP_RESIN: [number, number, number] = [0.78, 0.55, 0.22];
const CAMP_FIRE_ASH: [number, number, number] = [0.18, 0.15, 0.13];

const NATURAL_STONE: [number, number, number] = [0.42, 0.40, 0.34];
const NATURAL_DARK: [number, number, number] = [0.16, 0.15, 0.13];
const NATURAL_WATER: [number, number, number] = [0.36, 0.62, 0.72];
const NATURAL_GREEN: [number, number, number] = [0.26, 0.42, 0.22];
const NATURAL_SMOKE: [number, number, number] = [0.55, 0.53, 0.48];
const RUIN_STONE: [number, number, number] = [0.56, 0.50, 0.40];
const RUIN_SHADOW: [number, number, number] = [0.28, 0.24, 0.19];
const RUIN_VINE: [number, number, number] = [0.20, 0.36, 0.18];
const TORCH_FIRE: [number, number, number] = [1.0, 0.52, 0.16];
const PROD_WOOD: [number, number, number] = [0.38, 0.25, 0.14];
const PROD_THATCH: [number, number, number] = [0.62, 0.52, 0.31];
const TOBACCO_LEAF: [number, number, number] = [0.48, 0.34, 0.16];
const INDIGO_LIQUID: [number, number, number] = [0.08, 0.13, 0.34];
const SUGAR_CANE: [number, number, number] = [0.58, 0.68, 0.30];
const PEARL_SHELL: [number, number, number] = [0.82, 0.76, 0.62];
const PEARL_GLOW: [number, number, number] = [0.94, 0.88, 0.74];

// ── Wreck ───────────────────────────────────────────────────────────────────
//
// Tilted ship hull half-buried in surf. The hull is a long oblong box rolled
// onto its side; one or two snapped masts lean at sharp angles. A spar lies
// beside the hull. Variant: tilt angle, hull culture (carrack = longer +
// blockier, dhow = shorter + tapered), mast count (0–2), submersion depth.

function WreckSilhouette({ poiId, position, rotationY }: {
  poiId: string;
  position: [number, number, number];
  rotationY: number;
}) {
  const variant = useMemo(() => {
    const rng = mulberry32(hashStr(poiId));
    const hullKind: 'carrack' | 'dhow' = rng() < 0.55 ? 'carrack' : 'dhow';
    return {
      tilt: 0.55 + rng() * 0.35,
      hullKind,
      hullLen: hullKind === 'carrack' ? 9.5 : 7.5,
      hullWid: hullKind === 'carrack' ? 3.2 : 2.6,
      hullColor: hullKind === 'carrack' ? WRECK_HULL_CARRACK : WRECK_HULL_DHOW,
      mastCount: rng() < 0.5 ? 1 : rng() < 0.8 ? 2 : 0,
      submersion: 0.6 + rng() * 0.5,
      seed: rng(),
    };
  }, [poiId]);
  const hullHt = 2.8;

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <group position={[0, -variant.submersion, 0]} rotation={[0, 0, variant.tilt]}>
        <mesh position={[0, hullHt * 0.5, 0]} material={chunkyMaterial(variant.hullColor)}>
          <boxGeometry args={[variant.hullLen, hullHt, variant.hullWid]} />
        </mesh>
        <mesh position={[0, 0.05, 0]} material={chunkyMaterial(WRECK_TRIM, { roughness: 1 })}>
          <boxGeometry args={[variant.hullLen * 0.96, 0.35, 0.5]} />
        </mesh>
        {variant.hullKind === 'carrack' && (
          <mesh position={[variant.hullLen * 0.42, hullHt * 0.95, 0]} material={chunkyMaterial(variant.hullColor)}>
            <boxGeometry args={[1.6, 1.1, variant.hullWid * 0.95]} />
          </mesh>
        )}
        {variant.mastCount >= 1 && (
          <group rotation={[0, 0, -0.4]}>
            <mesh position={[variant.hullLen * 0.05, hullHt + 1.6, 0]} material={chunkyMaterial(WRECK_TRIM, { roughness: 1 })}>
              <cylinderGeometry args={[0.18, 0.22, 3.6, 8]} />
            </mesh>
            <mesh position={[variant.hullLen * 0.05, hullHt + 3.5, 0]} rotation={[0.3, 0, 0.2]} material={chunkyMaterial(WRECK_TRIM, { roughness: 1 })}>
              <coneGeometry args={[0.22, 0.45, 5]} />
            </mesh>
          </group>
        )}
        {variant.mastCount >= 2 && (
          <group rotation={[0, 0, -0.55]}>
            <mesh position={[-variant.hullLen * 0.32, hullHt + 0.8, 0]} material={chunkyMaterial(WRECK_TRIM, { roughness: 1 })}>
              <cylinderGeometry args={[0.15, 0.18, 2.2, 8]} />
            </mesh>
          </group>
        )}
      </group>
      <mesh
        position={[Math.cos(variant.seed * 6.28) * 4.5, 0.1, Math.sin(variant.seed * 6.28) * 4.5]}
        rotation={[0, variant.seed * 6.28, 0.05]}
        material={chunkyMaterial(WRECK_TRIM, { roughness: 1 })}
      >
        <cylinderGeometry args={[0.14, 0.14, 4.5, 6]} />
      </mesh>
    </group>
  );
}

// ── Smuggler's Cove ─────────────────────────────────────────────────────────
//
// A lean-to roof tucked under a stepped cliff face, a stack of wooden crates,
// a small jetty pushing out into the water. Optional watchtower at the cliff
// top. Reads from sea as "someone is hiding things here."

function SmugglersCoveSilhouette({ poiId, position, rotationY }: {
  poiId: string;
  position: [number, number, number];
  rotationY: number;
}) {
  const variant = useMemo(() => {
    const rng = mulberry32(hashStr(poiId) ^ 0x3a3a);
    return {
      hasTower: rng() < 0.55,
      crateCount: 3 + Math.floor(rng() * 4),
      jettyLen: 5 + rng() * 4,
      seed: rng(),
    };
  }, [poiId]);

  const cliff = chunkyMaterial(COVE_CLIFF, { roughness: 1 });
  const cliffDark = chunkyMaterial(COVE_CLIFF_DARK, { roughness: 1 });
  const wood = chunkyMaterial(COVE_WOOD, { roughness: 1 });
  const thatch = chunkyMaterial(COVE_THATCH, { roughness: 1 });

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh position={[-3, 1.6, 0]} material={cliff}>
        <boxGeometry args={[3.5, 3.2, 4]} />
      </mesh>
      <mesh position={[-4, 3.4, 0.5]} material={cliffDark}>
        <boxGeometry args={[2.5, 2.8, 3]} />
      </mesh>
      <mesh position={[-1.5, 0.9, 0]} rotation={[0, 0, -0.32]} material={thatch}>
        <boxGeometry args={[2.6, 0.18, 2.8]} />
      </mesh>
      <mesh position={[-0.4, 0.7, 1.2]} material={wood}>
        <cylinderGeometry args={[0.10, 0.10, 1.4, 6]} />
      </mesh>
      <mesh position={[-0.4, 0.7, -1.2]} material={wood}>
        <cylinderGeometry args={[0.10, 0.10, 1.4, 6]} />
      </mesh>
      {Array.from({ length: variant.crateCount }).map((_, i) => {
        const row = i < 3 ? 0 : 1;
        const col = row === 0 ? i : i - 3;
        const cx = -1.8 + col * 0.95;
        const cy = 0.35 + row * 0.7;
        // Crate-shade jitter — quantized in chunkyMaterial so adjacent crates
        // collapse to ~2-3 cached materials rather than N unique allocations.
        const crateColor: [number, number, number] = [
          COVE_CRATE_BASE[0] - i * 0.02,
          COVE_CRATE_BASE[1] - i * 0.01,
          COVE_CRATE_BASE[2],
        ];
        return (
          <mesh
            key={i}
            position={[cx, cy, -0.6 + (i % 2) * 0.4]}
            rotation={[0, (variant.seed + i * 0.31) * 0.4, 0]}
            material={chunkyMaterial(crateColor)}
          >
            <boxGeometry args={[0.7, 0.6, 0.7]} />
          </mesh>
        );
      })}
      <group position={[2, 0.15, 0]}>
        <mesh position={[variant.jettyLen * 0.5, 0, 0]} material={wood}>
          <boxGeometry args={[variant.jettyLen, 0.18, 1.2]} />
        </mesh>
        <mesh position={[variant.jettyLen, -0.6, 0.5]} material={wood}>
          <cylinderGeometry args={[0.12, 0.14, 1.3, 6]} />
        </mesh>
        <mesh position={[variant.jettyLen, -0.6, -0.5]} material={wood}>
          <cylinderGeometry args={[0.12, 0.14, 1.3, 6]} />
        </mesh>
      </group>
      {variant.hasTower && (
        <group position={[-4, 5.0, 0.5]}>
          <mesh position={[0, 1.0, 0]} material={wood}>
            <boxGeometry args={[1.3, 2.0, 1.3]} />
          </mesh>
          <mesh position={[0, 2.15, 0]} material={thatch}>
            <boxGeometry args={[1.6, 0.18, 1.6]} />
          </mesh>
        </group>
      )}
    </group>
  );
}

// ── Garden ──────────────────────────────────────────────────────────────────
//
// Walled rectangular compound with a small greenhouse, corner gazebo, and a
// grid of low herb beds. Covers any walled cultivated site — Mughal hakim
// physick gardens, Jesuit medicinal plots, monastery cloister gardens,
// company-naturalist gardens — under one silhouette. Variant: wall culture
// (Mughal red sandstone, Jesuit cream, Chinese grey brick, Yemeni adobe),
// greenhouse y/n, herb-bed grid dimensions.

function GardenSilhouette({ poi, position, rotationY }: {
  poi: POIDefinition;
  position: [number, number, number];
  rotationY: number;
}) {
  if (poi.poiVariant === 'tobacco-shed') {
    return <TobaccoShedSilhouette poiId={poi.id} position={position} rotationY={rotationY} />;
  }
  if (poi.poiVariant === 'spice-plantation') {
    return <SpicePlantationSilhouette poiId={poi.id} position={position} rotationY={rotationY} />;
  }
  const variant = useMemo(() => {
    const rng = mulberry32(hashStr(poi.id) ^ 0x7c7c);
    const culture = GARDEN_CULTURES[Math.floor(rng() * GARDEN_CULTURES.length)];
    return {
      culture,
      hasGreenhouse: rng() < 0.7,
      bedRows: 2 + Math.floor(rng() * 2),
      bedCols: 3 + Math.floor(rng() * 2),
    };
  }, [poi.id]);

  const wall = chunkyMaterial(variant.culture.wall);
  const trim = chunkyMaterial(variant.culture.wallTrim);
  const gazebo = chunkyMaterial(variant.culture.gazebo, { roughness: 0.7, metalness: 0.2 });
  const herb = chunkyMaterial(variant.culture.herb, { roughness: 1 });
  const greenhouse = chunkyMaterial(GARDEN_GREENHOUSE, { roughness: 0.4, opacity: 0.78 });
  const path = chunkyMaterial(GARDEN_PATH, { roughness: 1 });

  const W = 12;
  const D = 10;
  const wallH = 1.6;
  const wallT = 0.4;

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh position={[0, wallH * 0.5, -D * 0.5]} material={wall}>
        <boxGeometry args={[W, wallH, wallT]} />
      </mesh>
      <mesh position={[-W * 0.32, wallH * 0.5, D * 0.5]} material={wall}>
        <boxGeometry args={[W * 0.36, wallH, wallT]} />
      </mesh>
      <mesh position={[W * 0.32, wallH * 0.5, D * 0.5]} material={wall}>
        <boxGeometry args={[W * 0.36, wallH, wallT]} />
      </mesh>
      <mesh position={[-W * 0.5, wallH * 0.5, 0]} material={wall}>
        <boxGeometry args={[wallT, wallH, D]} />
      </mesh>
      <mesh position={[W * 0.5, wallH * 0.5, 0]} material={wall}>
        <boxGeometry args={[wallT, wallH, D]} />
      </mesh>
      <mesh position={[-W * 0.13, wallH * 0.7, D * 0.5]} material={trim}>
        <boxGeometry args={[wallT * 1.4, wallH * 1.4, wallT * 1.4]} />
      </mesh>
      <mesh position={[W * 0.13, wallH * 0.7, D * 0.5]} material={trim}>
        <boxGeometry args={[wallT * 1.4, wallH * 1.4, wallT * 1.4]} />
      </mesh>
      <mesh position={[-W * 0.32, 0.9, -D * 0.30]} material={wall}>
        <boxGeometry args={[2.0, 1.8, 2.0]} />
      </mesh>
      <mesh position={[-W * 0.32, 2.1, -D * 0.30]} material={gazebo}>
        <sphereGeometry args={[1.0, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
      </mesh>
      {variant.hasGreenhouse && (
        <group position={[W * 0.22, 0, -D * 0.25]}>
          <mesh position={[0, 0.7, 0]} material={greenhouse}>
            <boxGeometry args={[3.0, 1.4, 4.5]} />
          </mesh>
          <mesh position={[0, 1.55, 0]} material={wall}>
            <boxGeometry args={[3.2, 0.2, 4.7]} />
          </mesh>
        </group>
      )}
      {Array.from({ length: variant.bedRows * variant.bedCols }).map((_, i) => {
        const row = Math.floor(i / variant.bedCols);
        const col = i % variant.bedCols;
        const bx = (col - (variant.bedCols - 1) / 2) * 1.8;
        const bz = D * 0.18 - row * 1.4;
        return (
          <mesh key={i} position={[bx, 0.1, bz]} material={herb}>
            <boxGeometry args={[1.4, 0.20, 0.9]} />
          </mesh>
        );
      })}
      <mesh position={[0, 0.06, 0]} material={path}>
        <boxGeometry args={[1.2, 0.10, D * 0.85]} />
      </mesh>
    </group>
  );
}

function TobaccoShedSilhouette({ poiId, position, rotationY }: {
  poiId: string;
  position: [number, number, number];
  rotationY: number;
}) {
  const sway = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!sway.current) return;
    sway.current.rotation.z = Math.sin(clock.elapsedTime * 1.5 + hashStr(poiId) * 0.001) * 0.025;
  });
  const wood = chunkyMaterial(PROD_WOOD, { roughness: 1 });
  const thatch = chunkyMaterial(PROD_THATCH, { roughness: 1 });
  const leaf = chunkyMaterial(TOBACCO_LEAF, { roughness: 1 });
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh position={[0, 0.12, 0]} material={chunkyMaterial([0.45, 0.36, 0.22], { roughness: 1 })}>
        <boxGeometry args={[9.5, 0.24, 6.2]} />
      </mesh>
      {[-3.7, 0, 3.7].map((x) => (
        <group key={x}>
          <mesh position={[x, 1.45, -2.4]} material={wood}>
            <cylinderGeometry args={[0.12, 0.14, 2.8, 6]} />
          </mesh>
          <mesh position={[x, 1.45, 2.4]} material={wood}>
            <cylinderGeometry args={[0.12, 0.14, 2.8, 6]} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 3.05, 0]} rotation={[0, 0, 0.08]} material={thatch}>
        <boxGeometry args={[10.4, 0.34, 7.0]} />
      </mesh>
      <group ref={sway}>
        {Array.from({ length: 14 }).map((_, i) => {
          const x = -4.0 + (i % 7) * 1.35;
          const z = i < 7 ? -1.0 : 1.0;
          return (
            <mesh key={i} position={[x, 1.7, z]} rotation={[0.15, 0, i % 2 === 0 ? 0.15 : -0.15]} material={leaf}>
              <boxGeometry args={[0.28, 1.15, 0.08]} />
            </mesh>
          );
        })}
      </group>
    </group>
  );
}

function SpicePlantationSilhouette({ poiId, position, rotationY }: {
  poiId: string;
  position: [number, number, number];
  rotationY: number;
}) {
  const rng = useMemo(() => mulberry32(hashStr(poiId) ^ 0x5544), [poiId]);
  const leaf = chunkyMaterial([0.22, 0.42, 0.20], { roughness: 1 });
  const trunk = chunkyMaterial(PROD_WOOD, { roughness: 1 });
  const mat = chunkyMaterial([0.68, 0.48, 0.25], { roughness: 1 });
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh position={[0, 0.08, 0]} material={chunkyMaterial([0.42, 0.34, 0.20], { roughness: 1 })}>
        <boxGeometry args={[11.0, 0.16, 8.0]} />
      </mesh>
      {Array.from({ length: 12 }).map((_, i) => {
        const row = Math.floor(i / 4);
        const col = i % 4;
        const x = -4.2 + col * 2.8;
        const z = -2.5 + row * 2.5;
        const h = 1.7 + rng() * 0.9;
        return (
          <group key={i} position={[x, 0.1, z]}>
            <mesh position={[0, h * 0.5, 0]} material={trunk}>
              <cylinderGeometry args={[0.08, 0.12, h, 6]} />
            </mesh>
            <mesh position={[0.18, h * 0.72, 0]} rotation={[0.2, 0, -0.35]} material={leaf}>
              <boxGeometry args={[0.18, h * 0.75, 0.16]} />
            </mesh>
          </group>
        );
      })}
      <mesh position={[3.9, 0.18, 3.1]} material={mat}>
        <boxGeometry args={[2.1, 0.16, 1.4]} />
      </mesh>
    </group>
  );
}

// ── Caravanserai ────────────────────────────────────────────────────────────
//
// Square fortified courtyard inn — a stone-walled rectangle with crenellated
// walls, two or four corner towers, and an arched main gate. Sits on a flat
// plinth so it reads as a defended camp. Variant: tower count, gate culture,
// corner detail (rounded vs square tower tops).

function CaravanseraiSilhouette({ poiId, position, rotationY }: {
  poiId: string;
  position: [number, number, number];
  rotationY: number;
}) {
  const variant = useMemo(() => {
    const rng = mulberry32(hashStr(poiId) ^ 0x9e9e);
    const isSandstone = rng() < 0.5;
    return {
      towerCount: rng() < 0.6 ? 4 : 2,
      towerRound: rng() < 0.5,
      wallColor: isSandstone ? CARAVANSERAI_WALL_SANDSTONE : CARAVANSERAI_WALL_MUDBRICK,
      trimColor: isSandstone ? CARAVANSERAI_TRIM_SANDSTONE : CARAVANSERAI_TRIM_MUDBRICK,
    };
  }, [poiId]);

  const wall = chunkyMaterial(variant.wallColor);
  const trim = chunkyMaterial(variant.trimColor, { roughness: 1 });
  const gate = chunkyMaterial(CARAVANSERAI_GATE, { roughness: 1 });
  const flagpole = chunkyMaterial(CARAVANSERAI_FLAGPOLE, { roughness: 1 });

  const W = 14;
  const D = 14;
  const wallH = 3.0;
  const wallT = 0.8;
  const towerH = 5.5;
  const towerR = 1.4;

  // Crenellation toothlets along the top of each wall — laid out at runtime.
  const crenellate = (cx: number, cz: number, length: number, axis: 'x' | 'z') => {
    const count = Math.max(3, Math.floor(length / 0.9));
    return Array.from({ length: count }).map((_, i) => {
      const t = (i + 0.5) / count - 0.5;
      const px = axis === 'x' ? cx + t * length : cx;
      const pz = axis === 'z' ? cz + t * length : cz;
      return (
        <mesh key={`${axis}-${cx}-${cz}-${i}`} position={[px, wallH + 0.18, pz]} material={trim}>
          <boxGeometry args={[0.32, 0.36, 0.32]} />
        </mesh>
      );
    });
  };

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh position={[0, 0.18, 0]} material={trim}>
        <boxGeometry args={[W + 1.2, 0.36, D + 1.2]} />
      </mesh>
      <mesh position={[0, wallH * 0.5 + 0.36, -D * 0.5]} material={wall}>
        <boxGeometry args={[W, wallH, wallT]} />
      </mesh>
      <mesh position={[-W * 0.32, wallH * 0.5 + 0.36, D * 0.5]} material={wall}>
        <boxGeometry args={[W * 0.36, wallH, wallT]} />
      </mesh>
      <mesh position={[W * 0.32, wallH * 0.5 + 0.36, D * 0.5]} material={wall}>
        <boxGeometry args={[W * 0.36, wallH, wallT]} />
      </mesh>
      <mesh position={[-W * 0.5, wallH * 0.5 + 0.36, 0]} material={wall}>
        <boxGeometry args={[wallT, wallH, D]} />
      </mesh>
      <mesh position={[W * 0.5, wallH * 0.5 + 0.36, 0]} material={wall}>
        <boxGeometry args={[wallT, wallH, D]} />
      </mesh>
      {crenellate(0, -D * 0.5, W, 'x')}
      {crenellate(-W * 0.32, D * 0.5, W * 0.36, 'x')}
      {crenellate(W * 0.32, D * 0.5, W * 0.36, 'x')}
      {crenellate(-W * 0.5, 0, D, 'z')}
      {crenellate(W * 0.5, 0, D, 'z')}
      <mesh position={[-W * 0.13, wallH * 0.55 + 0.36, D * 0.5]} material={trim}>
        <boxGeometry args={[wallT * 1.6, wallH * 1.1, wallT * 1.6]} />
      </mesh>
      <mesh position={[W * 0.13, wallH * 0.55 + 0.36, D * 0.5]} material={trim}>
        <boxGeometry args={[wallT * 1.6, wallH * 1.1, wallT * 1.6]} />
      </mesh>
      <mesh position={[0, wallH * 0.5 + 0.36, D * 0.5 + 0.05]} material={gate}>
        <boxGeometry args={[2.4, wallH * 0.85, 0.18]} />
      </mesh>
      {(['fl', 'fr', 'bl', 'br'] as const).map((corner) => {
        if (variant.towerCount === 2 && (corner === 'bl' || corner === 'br')) return null;
        const cx = (corner === 'fl' || corner === 'bl') ? -W * 0.5 : W * 0.5;
        const cz = (corner === 'fl' || corner === 'fr') ? D * 0.5 : -D * 0.5;
        return (
          <group key={corner} position={[cx, 0.36, cz]}>
            {variant.towerRound ? (
              <mesh position={[0, towerH * 0.5, 0]} material={wall}>
                <cylinderGeometry args={[towerR, towerR * 1.05, towerH, 10]} />
              </mesh>
            ) : (
              <mesh position={[0, towerH * 0.5, 0]} material={wall}>
                <boxGeometry args={[towerR * 2, towerH, towerR * 2]} />
              </mesh>
            )}
            <mesh position={[0, towerH + 0.22, 0]} material={trim}>
              <boxGeometry args={[towerR * 2.3, 0.36, towerR * 2.3]} />
            </mesh>
            <mesh position={[0, towerH + 0.95, 0]} material={flagpole}>
              <cylinderGeometry args={[0.06, 0.06, 1.2, 6]} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

// ── Naturalist Camp (hinterland silhouette) ────────────────────────────────
//
// Naturalist halls (Apothecaries' Hall, Royal College, etc.) are rendered as
// landmarks in ProceduralCity.tsx, not as POI silhouettes — POIs in this
// project are sites the player travels *to*, so urban halls live in city
// geometry and only their landmark-bound POI metadata routes through here.
// The camp variant below covers itinerant naturalists in the hinterland,
// which is the only `naturalist` POI kind that still needs a silhouette.


function NaturalistCampSilhouette({ poi, position, rotationY }: {
  poi: POIDefinition;
  position: [number, number, number];
  rotationY: number;
}) {
  if (poi.poiVariant === 'indigo-vat') {
    return <IndigoVatSilhouette position={position} rotationY={rotationY} />;
  }
  if (poi.poiVariant === 'sugar-mill') {
    return <SugarMillSilhouette position={position} rotationY={rotationY} />;
  }
  if (poi.poiVariant === 'pearl-bank') {
    return <PearlBankSilhouette poiId={poi.id} position={position} rotationY={rotationY} />;
  }
  const variant = useMemo(() => {
    const rng = mulberry32(hashStr(poi.id) ^ 0x8181);
    const tentCount = 4 + Math.floor(rng() * 2);
    const tents = Array.from({ length: tentCount }).map((_, i) => {
      const angle = (i / tentCount) * Math.PI * 2 + rng() * 0.4;
      const radius = 2.2 + rng() * 1.2;
      return {
        x: Math.cos(angle) * radius,
        z: Math.sin(angle) * radius,
        rot: rng() * Math.PI,
        kind: rng() < 0.65 ? ('goathair' as const) : ('canvas' as const),
        scale: 0.85 + rng() * 0.35,
      };
    });
    return { tents, seed: rng() };
  }, [poi.id]);

  const goathair = chunkyMaterial(CAMP_GOATHAIR, { roughness: 1 });
  const canvas = chunkyMaterial(CAMP_CANVAS, { roughness: 1 });
  const canvasDark = chunkyMaterial(CAMP_CANVAS_DARK, { roughness: 1 });
  const wood = chunkyMaterial(CAMP_WOOD, { roughness: 1 });
  const salt = chunkyMaterial(CAMP_SALT, { roughness: 1 });
  const resin = chunkyMaterial(CAMP_RESIN, { roughness: 1 });
  const ash = chunkyMaterial(CAMP_FIRE_ASH, { roughness: 1 });

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {/* Salt-flat plinth — wide flat circle slightly raised above terrain. */}
      <mesh position={[0, 0.06, 0]} material={salt}>
        <cylinderGeometry args={[7.0, 7.2, 0.12, 16]} />
      </mesh>
      {/* Tents — peaked low cones with a short rectangular awning. */}
      {variant.tents.map((tent, i) => {
        const tentColor = tent.kind === 'goathair' ? goathair : canvas;
        const tentH = 1.8 * tent.scale;
        const tentR = 1.3 * tent.scale;
        return (
          <group
            key={`tent-${i}`}
            position={[tent.x, 0.12, tent.z]}
            rotation={[0, tent.rot, 0]}
          >
            {/* Main peaked tent body. */}
            <mesh position={[0, tentH * 0.5, 0]} material={tentColor}>
              <coneGeometry args={[tentR, tentH, 5]} />
            </mesh>
            {/* Awning — short rectangular flap off the front. */}
            <mesh
              position={[tentR * 0.9, tentH * 0.35, 0]}
              rotation={[0, 0, 0.25]}
              material={tent.kind === 'goathair' ? canvasDark : canvas}
            >
              <boxGeometry args={[1.0, 0.08, tentR * 1.1]} />
            </mesh>
            {/* Awning poles. */}
            <mesh
              position={[tentR * 1.4, tentH * 0.25, tentR * 0.5]}
              material={wood}
            >
              <cylinderGeometry args={[0.06, 0.06, tentH * 0.55, 6]} />
            </mesh>
            <mesh
              position={[tentR * 1.4, tentH * 0.25, -tentR * 0.5]}
              material={wood}
            >
              <cylinderGeometry args={[0.06, 0.06, tentH * 0.55, 6]} />
            </mesh>
          </group>
        );
      })}
      {/* Drying rack — long wood frame on the camp's edge with hanging
          ochre resin strips. */}
      <group position={[4.5, 0.12, 0]}>
        <mesh position={[0, 0.9, -1.3]} material={wood}>
          <cylinderGeometry args={[0.10, 0.10, 1.8, 6]} />
        </mesh>
        <mesh position={[0, 0.9, 1.3]} material={wood}>
          <cylinderGeometry args={[0.10, 0.10, 1.8, 6]} />
        </mesh>
        <mesh position={[0, 1.7, 0]} material={wood}>
          <cylinderGeometry args={[0.08, 0.08, 2.8, 6]} />
        </mesh>
        {Array.from({ length: 5 }).map((_, i) => (
          <mesh
            key={`strip-${i}`}
            position={[0, 1.2, -1.0 + i * 0.5]}
            material={resin}
          >
            <boxGeometry args={[0.10, 0.7, 0.12]} />
          </mesh>
        ))}
      </group>
      {/* Camel post — a single peg with rope tied off. */}
      <mesh position={[-4.6, 0.7, -0.4]} rotation={[0, 0, 0.08]} material={wood}>
        <cylinderGeometry args={[0.10, 0.12, 1.2, 6]} />
      </mesh>
      {/* Fire ring — small ash circle in the camp center. */}
      <mesh position={[0, 0.16, 0]} material={ash}>
        <cylinderGeometry args={[0.6, 0.6, 0.08, 10]} />
      </mesh>
      {/* Cookpot stand — three stones around the fire. */}
      {[0, 1, 2].map((i) => {
        const a = (i / 3) * Math.PI * 2;
        return (
          <mesh
            key={`stone-${i}`}
            position={[Math.cos(a) * 0.5, 0.22, Math.sin(a) * 0.5]}
            material={canvasDark}
          >
            <boxGeometry args={[0.20, 0.20, 0.20]} />
          </mesh>
        );
      })}
    </group>
  );
}

function IndigoVatSilhouette({ position, rotationY }: {
  position: [number, number, number];
  rotationY: number;
}) {
  const liquid = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!liquid.current) return;
    const s = 1 + Math.sin(clock.elapsedTime * 2.4) * 0.035;
    liquid.current.scale.set(s, 1, s);
  });
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh position={[0, 0.45, 0]} material={chunkyMaterial([0.50, 0.43, 0.30], { roughness: 1 })}>
        <cylinderGeometry args={[3.7, 4.0, 0.9, 18]} />
      </mesh>
      <mesh ref={liquid} position={[0, 0.95, 0]} material={chunkyMaterial(INDIGO_LIQUID, { opacity: 0.9, roughness: 0.42 })}>
        <cylinderGeometry args={[3.15, 3.15, 0.08, 18]} />
      </mesh>
      {[-3.0, -1.0, 1.0, 3.0].map((x, i) => (
        <mesh key={i} position={[x, 2.1, -3.9]} material={chunkyMaterial(i % 2 ? [0.22, 0.25, 0.48] : [0.12, 0.16, 0.36], { roughness: 1 })}>
          <boxGeometry args={[0.9, 1.8, 0.08]} />
        </mesh>
      ))}
      <mesh position={[0, 2.7, -3.9]} material={chunkyMaterial(PROD_WOOD, { roughness: 1 })}>
        <cylinderGeometry args={[0.08, 0.08, 6.8, 6]} />
      </mesh>
    </group>
  );
}

function SugarMillSilhouette({ position, rotationY }: {
  position: [number, number, number];
  rotationY: number;
}) {
  const roller = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (roller.current) roller.current.rotation.z = clock.elapsedTime * 0.7;
  });
  const wood = chunkyMaterial(PROD_WOOD, { roughness: 1 });
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh position={[0, 0.16, 0]} material={chunkyMaterial([0.50, 0.40, 0.25], { roughness: 1 })}>
        <boxGeometry args={[9.2, 0.32, 6.6]} />
      </mesh>
      <group ref={roller} position={[0, 1.35, 0]}>
        <mesh position={[-0.7, 0, 0]} rotation={[Math.PI / 2, 0, 0]} material={wood}>
          <cylinderGeometry args={[0.45, 0.45, 3.1, 10]} />
        </mesh>
        <mesh position={[0.7, 0, 0]} rotation={[Math.PI / 2, 0, 0]} material={wood}>
          <cylinderGeometry args={[0.45, 0.45, 3.1, 10]} />
        </mesh>
      </group>
      <mesh position={[-3.3, 1.25, 0]} rotation={[0, 0, -0.25]} material={chunkyMaterial(SUGAR_CANE, { roughness: 1 })}>
        <boxGeometry args={[0.22, 2.4, 0.16]} />
      </mesh>
      <mesh position={[-2.7, 1.2, 0.5]} rotation={[0.2, 0, 0.18]} material={chunkyMaterial(SUGAR_CANE, { roughness: 1 })}>
        <boxGeometry args={[0.22, 2.2, 0.16]} />
      </mesh>
      <mesh position={[3.2, 0.65, 0]} material={chunkyMaterial([0.24, 0.20, 0.16], { roughness: 1 })}>
        <cylinderGeometry args={[0.9, 1.1, 0.7, 12]} />
      </mesh>
    </group>
  );
}

function PearlBankSilhouette({ poiId, position, rotationY }: {
  poiId: string;
  position: [number, number, number];
  rotationY: number;
}) {
  const glint = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!glint.current) return;
    const s = 0.7 + Math.max(0, Math.sin(clock.elapsedTime * 3.0 + hashStr(poiId) * 0.01)) * 0.55;
    glint.current.scale.setScalar(s);
  });
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh position={[0, 0.1, 0]} material={chunkyMaterial([0.70, 0.62, 0.44], { roughness: 1 })}>
        <cylinderGeometry args={[5.2, 5.6, 0.2, 16]} />
      </mesh>
      {[-2.6, -1.2, 1.0, 2.4].map((x, i) => (
        <mesh key={i} position={[x, 0.42, i % 2 ? 0.9 : -0.7]} rotation={[0.2, i * 0.7, 0]} material={chunkyMaterial(PEARL_SHELL, { roughness: 0.62 })}>
          <sphereGeometry args={[0.72, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.48]} />
        </mesh>
      ))}
      <mesh ref={glint} position={[0.7, 0.86, -0.35]} material={chunkyMaterial(PEARL_GLOW, { opacity: 0.9, metalness: 0.15, roughness: 0.25 })}>
        <sphereGeometry args={[0.18, 8, 6]} />
      </mesh>
    </group>
  );
}

function NaturalFeatureSilhouette({ poi, position, rotationY }: {
  poi: POIDefinition;
  position: [number, number, number];
  rotationY: number;
}) {
  const variant = poi.poiVariant ?? 'sacred-mountain';
  if (variant === 'water-source') return <WaterSourceSilhouette position={position} rotationY={rotationY} />;
  if (variant === 'cave') return <CaveSilhouette position={position} rotationY={rotationY} />;
  if (variant === 'reef') return <ReefSilhouette position={position} rotationY={rotationY} />;
  return <SacredMountainSilhouette position={position} rotationY={rotationY} />;
}

function WaterSourceSilhouette({ position, rotationY }: { position: [number, number, number]; rotationY: number }) {
  const shimmer = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!shimmer.current) return;
    const s = 1 + Math.sin(clock.elapsedTime * 2.2) * 0.045;
    shimmer.current.scale.set(s, 1, s);
    shimmer.current.rotation.y = clock.elapsedTime * 0.18;
  });
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh position={[0, 0.08, 0]} material={chunkyMaterial(NATURAL_STONE, { roughness: 1 })}>
        <cylinderGeometry args={[4.2, 4.8, 0.35, 16]} />
      </mesh>
      <mesh ref={shimmer} position={[0, 0.32, 0]} material={chunkyMaterial(NATURAL_WATER, { opacity: 0.82, roughness: 0.35 })}>
        <cylinderGeometry args={[3.0, 3.1, 0.08, 24]} />
      </mesh>
      {[-2.6, -1.2, 1.4, 2.5].map((x, i) => (
        <mesh key={i} position={[x, 0.85, i % 2 === 0 ? -2.8 : 2.7]} rotation={[0, i * 0.7, 0]} material={chunkyMaterial(NATURAL_GREEN)}>
          <coneGeometry args={[0.35, 1.4, 5]} />
        </mesh>
      ))}
    </group>
  );
}

function CaveSilhouette({ position, rotationY }: { position: [number, number, number]; rotationY: number }) {
  const ember = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!ember.current) return;
    const s = 0.85 + Math.sin(clock.elapsedTime * 5.3) * 0.15;
    ember.current.scale.setScalar(s);
  });
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh position={[0, 1.6, 0]} material={chunkyMaterial(NATURAL_STONE, { roughness: 1 })}>
        <boxGeometry args={[7.8, 3.2, 4.8]} />
      </mesh>
      <mesh position={[0, 1.15, -2.45]} material={chunkyMaterial(NATURAL_DARK, { roughness: 1 })}>
        <boxGeometry args={[3.2, 2.25, 0.22]} />
      </mesh>
      <mesh ref={ember} position={[-1.3, 0.45, -2.1]} material={chunkyMaterial(TORCH_FIRE, { opacity: 0.72, roughness: 0.4 })}>
        <sphereGeometry args={[0.25, 8, 6]} />
      </mesh>
      {[-2.9, 2.9].map((x) => (
        <mesh key={x} position={[x, 0.55, -2.6]} material={chunkyMaterial(NATURAL_GREEN)}>
          <coneGeometry args={[0.45, 1.0, 5]} />
        </mesh>
      ))}
    </group>
  );
}

function ReefSilhouette({ position, rotationY }: { position: [number, number, number]; rotationY: number }) {
  const foam = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!foam.current) return;
    foam.current.rotation.y = clock.elapsedTime * 0.22;
    foam.current.scale.setScalar(1 + Math.sin(clock.elapsedTime * 2.8) * 0.04);
  });
  return (
    <group position={[position[0], Math.max(position[1], SEA_LEVEL), position[2]]} rotation={[0, rotationY, 0]}>
      <mesh position={[0, 0.15, 0]} material={chunkyMaterial(NATURAL_STONE, { roughness: 1 })}>
        <boxGeometry args={[6.0, 0.75, 3.2]} />
      </mesh>
      <mesh position={[-1.5, 0.95, 0.1]} material={chunkyMaterial([0.82, 0.55, 0.42], { roughness: 1 })}>
        <coneGeometry args={[0.45, 1.7, 5]} />
      </mesh>
      <mesh position={[1.1, 0.75, -0.5]} material={chunkyMaterial([0.72, 0.42, 0.32], { roughness: 1 })}>
        <coneGeometry args={[0.36, 1.25, 5]} />
      </mesh>
      <group ref={foam}>
        {[0, 1, 2].map((i) => (
          <mesh key={i} position={[Math.cos(i * 2.1) * 3.2, 0.18, Math.sin(i * 2.1) * 1.9]} material={chunkyMaterial([0.84, 0.88, 0.82], { opacity: 0.7, roughness: 0.65 })}>
            <torusGeometry args={[0.7, 0.035, 6, 18]} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function SacredMountainSilhouette({ position, rotationY }: { position: [number, number, number]; rotationY: number }) {
  const smoke = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!smoke.current) return;
    smoke.current.position.y = 4.9 + Math.sin(clock.elapsedTime * 1.1) * 0.2;
    smoke.current.rotation.y = clock.elapsedTime * 0.35;
  });
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh position={[0, 2.1, 0]} material={chunkyMaterial(NATURAL_STONE, { roughness: 1 })}>
        <coneGeometry args={[4.6, 4.2, 5]} />
      </mesh>
      <mesh position={[0, 4.25, 0]} material={chunkyMaterial(NATURAL_DARK, { roughness: 1 })}>
        <coneGeometry args={[1.0, 0.55, 5]} />
      </mesh>
      <mesh position={[0, 0.32, -3.6]} material={chunkyMaterial([0.72, 0.56, 0.36], { roughness: 1 })}>
        <cylinderGeometry args={[0.55, 0.7, 0.45, 10]} />
      </mesh>
      <group ref={smoke}>
        {[0, 1, 2].map((i) => (
          <mesh key={i} position={[Math.cos(i * 2.1) * 0.45, i * 0.42, Math.sin(i * 2.1) * 0.45]} material={chunkyMaterial(NATURAL_SMOKE, { opacity: 0.34, roughness: 1 })}>
            <sphereGeometry args={[0.42 + i * 0.13, 8, 6]} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function RuinSilhouette({ poi, position, rotationY }: {
  poi: POIDefinition;
  position: [number, number, number];
  rotationY: number;
}) {
  const flame = useRef<THREE.Mesh>(null);
  const isFort = poi.poiVariant === 'abandoned-fort';
  useFrame(({ clock }) => {
    if (!flame.current) return;
    flame.current.scale.set(1, 0.82 + Math.sin(clock.elapsedTime * 6.1) * 0.16, 1);
  });
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh position={[0, 0.2, 0]} material={chunkyMaterial(RUIN_SHADOW, { roughness: 1 })}>
        <boxGeometry args={[7.4, 0.4, 5.4]} />
      </mesh>
      <mesh position={[-2.6, 1.45, -1.7]} material={chunkyMaterial(RUIN_STONE, { roughness: 1 })}>
        <boxGeometry args={[1.1, 2.9, 0.9]} />
      </mesh>
      <mesh position={[2.4, 1.05, -1.6]} material={chunkyMaterial(RUIN_STONE, { roughness: 1 })}>
        <boxGeometry args={[1.0, 2.1, 0.9]} />
      </mesh>
      <mesh position={[0, 2.65, -1.7]} material={chunkyMaterial(RUIN_STONE, { roughness: 1 })}>
        <boxGeometry args={[4.6, 0.55, 0.8]} />
      </mesh>
      {isFort && (
        <mesh position={[0, 1.0, 1.6]} material={chunkyMaterial(RUIN_STONE, { roughness: 1 })}>
          <boxGeometry args={[5.8, 2.0, 1.0]} />
        </mesh>
      )}
      <mesh position={[0.6, 0.85, -1.95]} material={chunkyMaterial(RUIN_VINE, { roughness: 1 })}>
        <boxGeometry args={[0.28, 1.55, 0.12]} />
      </mesh>
      <mesh ref={flame} position={[-0.9, 0.82, -2.15]} material={chunkyMaterial(TORCH_FIRE, { opacity: 0.86, roughness: 0.35 })}>
        <coneGeometry args={[0.24, 0.75, 6]} />
      </mesh>
    </group>
  );
}

// ── Top-level dispatcher ────────────────────────────────────────────────────
//
// Reads ports + their POI lists, resolves position per POI, dispatches to
// the archetype-specific silhouette. POIs that already have geometry
// (shrines via synthetic Building, landmark-bound POIs that reuse the
// in-city landmark mesh) are skipped — we look only at archetypes with no
// in-world body of their own.
//
// Garden, wreck, cove, and caravanserai all have authored silhouettes here.
// Bespoke gardens (Oxford, Malabar) get the silhouette automatically since
// they share the kind with procedural gardens — no new code, just new data.

const SILHOUETTE_KINDS = new Set<string>([
  'wreck', 'smugglers_cove', 'garden', 'caravanserai', 'natural', 'ruin',
  // `naturalist` covers itinerant camps only (Mocha aloe camp); permanent
  // halls render as in-city landmarks. `merchant_guild` is landmark-only,
  // no silhouette.
  'naturalist',
]);

export function POISilhouettes({ ports }: { ports: PortsProp }) {
  // POI silhouettes are *world content*, not optional markers — default-true
  // poiVisibility lets a future debug toggle hide them without conflating
  // them with the sacred-marker plumbob system (which still gates beacons).
  const visible = useGameStore((state) => state.renderDebug.poiVisibility);
  const devSoloPort = useGameStore((state) => state.devSoloPort);
  const currentWorldPortId = useGameStore((state) => state.currentWorldPortId);
  const playerPos = useGameStore((state) => state.playerMode === 'walking' ? state.walkingPos : state.playerPos);

  const items = useMemo(() => {
    if (!visible) return [] as Array<{
      poi: POIDefinition;
      position: [number, number, number];
      rotationY: number;
    }>;
    const visiblePorts = devSoloPort
      ? ports.filter((p) => p.id === devSoloPort)
      : ports.filter((p) => {
        if (p.id === currentWorldPortId) return true;
        const dx = p.position[0] - playerPos[0];
        const dz = p.position[2] - playerPos[2];
        return dx * dx + dz * dz <= POI_RENDER_RADIUS_SQ;
      });
    const out: Array<{ poi: POIDefinition; position: [number, number, number]; rotationY: number }> = [];
    for (const port of visiblePorts) {
      for (const poi of getPOIsForPort(port)) {
        if (!SILHOUETTE_KINDS.has(poi.kind)) continue;
        // Landmark-bound POIs reuse the landmark's own mesh — drawing a
        // silhouette on top would double-render (a Tudor hall on Fort Jesus,
        // a merchant compound stamped over the Casa da Índia, etc.).
        if (poi.location.kind === 'landmark') continue;
        // Bespoke POIs (Phase 3+) own their own renderer in BespokePOIs.tsx.
        // Skipping here prevents the generic silhouette stamping over them.
        if (BESPOKE_POI_IDS.has(poi.id)) continue;
        // Unified resolver — same answer the silhouette, beacon, minimap,
        // and walking proximity check all consume. Author coords that land
        // in water snap to the nearest valid cell (≤78u); fully-rejected
        // POIs return null.
        const placed = resolveSnappedPOI(poi, port);
        if (!placed) continue;
        const baseY = poi.kind === 'wreck'
          ? SEA_LEVEL - 0.05
          : poi.kind === 'natural'
            ? Math.max(SEA_LEVEL, getTerrainHeight(placed.x, placed.z))
          : getTerrainHeight(placed.x, placed.z);
        const rng = mulberry32(hashStr(poi.id) ^ 0xbe11);
        const rotationY = rng() * Math.PI * 2;
        out.push({
          poi,
          position: [placed.x, baseY, placed.z],
          rotationY,
        });
      }
    }
    return out;
  }, [currentWorldPortId, devSoloPort, playerPos, ports, visible]);

  if (!visible || items.length === 0) return null;

  return (
    <group>
      {items.map(({ poi, position, rotationY }) => {
        switch (poi.kind) {
          case 'wreck':
            return <WreckSilhouette key={poi.id} poiId={poi.id} position={position} rotationY={rotationY} />;
          case 'smugglers_cove':
            return <SmugglersCoveSilhouette key={poi.id} poiId={poi.id} position={position} rotationY={rotationY} />;
          case 'garden':
            return <GardenSilhouette key={poi.id} poi={poi} position={position} rotationY={rotationY} />;
          case 'caravanserai':
            return <CaravanseraiSilhouette key={poi.id} poiId={poi.id} position={position} rotationY={rotationY} />;
          case 'naturalist':
            return <NaturalistCampSilhouette key={poi.id} poi={poi} position={position} rotationY={rotationY} />;
          case 'natural':
            return <NaturalFeatureSilhouette key={poi.id} poi={poi} position={position} rotationY={rotationY} />;
          case 'ruin':
            return <RuinSilhouette key={poi.id} poi={poi} position={position} rotationY={rotationY} />;
          default:
            return null;
        }
      })}
    </group>
  );
}
