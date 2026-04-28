import { useMemo, useRef, useEffect } from 'react';
import * as THREE from 'three';
import { useGameStore, Building } from '../store/gameStore';
import { mergeCompatibleGeometries } from '../utils/geometryMerge';

// ── Farmstead crop fields ────────────────────────────────────────────────────
// Renders the crop around farmhouses whose `crop` was assigned by
// cityGenerator. Each crop category owns one or two InstancedMesh pools —
// geometry is shared across every farmstead in every visible port. The ring
// of instances skips a ~hut-sized clearing in the center so the building
// stays legible.
//
// Plot variation: cityGenerator assigns each farm a (halfWidth, halfDepth)
// from a weighted variant table. The renderer reads those bounds, computes
// rows/cols from spacing, and drops outer-ring instances with a per-crop
// probability so the visual boundary is organic instead of a perfect
// rectangle. Aggressive dropout for orchards (~30% outer ring); softer for
// vineyards (rows are the point) and grain (sparse already).
//
// Tinting strategy: orchard / vineyard / banana / grain pools split trunk
// from canopy (or stake from leaves) into TWO instanced meshes per crop.
// Trunk meshes carry baked brown vertex color and skip per-instance tint.
// Canopy meshes carry white vertex color and use setColorAt(i, tint) so
// fig orchards look silvery, mango orchards look deep green, wheat fields
// look gold and barley looks paler — all from one shared canopy geometry.

interface FarmInstance {
  position: [number, number, number];
  scale: number;
  rotation: number;
  /** Optional per-instance tint (overrides material color when set via
   *  setColorAt). Only the canopy pool consumes this; trunks ignore it. */
  tint?: [number, number, number];
}

interface FieldData {
  oranges: FarmInstance[];
  rice: FarmInstance[];
  /** Translucent paddy-water plane per rice farm. Now rectangular. */
  ricePaddies: { position: [number, number, number]; halfWidth: number; halfDepth: number }[];
  dates: FarmInstance[];
  palms: FarmInstance[];
  orchard: FarmInstance[];
  vineyard: FarmInstance[];
  banana: FarmInstance[];
  grainStubble: FarmInstance[];
  /** One ground patch per grain field — quad scaled per plot, tinted gold/
   *  pale by crop variant (wheat vs hay vs sorghum etc.). */
  grainGround: { position: [number, number, number]; halfWidth: number; halfDepth: number; tint: [number, number, number] }[];
}

function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h >>> 0;
}

/** How aggressively to drop outer-ring cells per crop. ring0 = outermost
 *  cells (one cell deep from the boundary); ring1 = next ring inward.
 *  Inner rings are never dropped — those represent the dense interior of
 *  the farm. */
type EdgeDropout = { ring0: number; ring1: number };

const DROPOUT_ORCHARD: EdgeDropout = { ring0: 0.32, ring1: 0.10 };
const DROPOUT_DATE:    EdgeDropout = { ring0: 0.28, ring1: 0.08 };
const DROPOUT_PALM:    EdgeDropout = { ring0: 0.25, ring1: 0.08 };
const DROPOUT_BANANA:  EdgeDropout = { ring0: 0.30, ring1: 0.10 };
// Vineyards historically had tight bounded edges (walls / hedges), so the
// outer rows stay mostly intact — only a ~10% nibble.
const DROPOUT_VINEYARD: EdgeDropout = { ring0: 0.10, ring1: 0.0 };
const DROPOUT_RICE:     EdgeDropout = { ring0: 0.20, ring1: 0.05 };

/** Lay out a regular grid sized to the plot's halfWidth/halfDepth. Outer
 *  rings drop a fraction of cells per `edge` so the visible boundary is
 *  irregular. */
function gridPlot(
  building: Building,
  spacing: number,
  hutClearRadius: number,
  jitterFraction: number,
  scaleRange: [number, number],
  edge: EdgeDropout,
  tint?: [number, number, number],
): FarmInstance[] {
  if (!building.cropPlot) return [];
  const [cx, cy, cz] = building.position;
  const { halfWidth, halfDepth } = building.cropPlot;
  // cols = along width (X), rows = along depth (Z)
  const cols = Math.max(2, Math.floor((halfWidth * 2) / spacing));
  const rows = Math.max(2, Math.floor((halfDepth * 2) / spacing));
  const startX = -((cols - 1) * spacing) / 2;
  const startZ = -((rows - 1) * spacing) / 2;
  const rng = mulberry32(hashStr(building.id) + 1);
  const out: FarmInstance[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const baseX = startX + c * spacing;
      const baseZ = startZ + r * spacing;
      // Hut clearance — keep the building visible inside the field.
      if (Math.abs(baseX) < hutClearRadius && Math.abs(baseZ) < hutClearRadius) continue;

      // Edge dropout — break up the boundary so the field doesn't read as a
      // perfect rectangle. Ring depth = how far this cell is from the edge.
      const ring = Math.min(c, r, cols - 1 - c, rows - 1 - r);
      if (ring === 0 && rng() < edge.ring0) continue;
      if (ring === 1 && rng() < edge.ring1) continue;

      // Slightly more jitter on outer rings so the silhouette has organic
      // bumps at the boundary even where cells survive.
      const ringJitterMul = ring === 0 ? 1.6 : ring === 1 ? 1.2 : 1.0;
      const jx = (rng() - 0.5) * spacing * jitterFraction * ringJitterMul;
      const jz = (rng() - 0.5) * spacing * jitterFraction * ringJitterMul;

      const scale = scaleRange[0] + rng() * (scaleRange[1] - scaleRange[0]);
      const rotation = rng() * Math.PI * 2;
      out.push({ position: [cx + baseX + jx, cy, cz + baseZ + jz], scale, rotation, tint });
    }
  }
  return out;
}

/** Tight rows for rice paddies — denser, smaller tufts than orchards. */
function riceRows(building: Building): FarmInstance[] {
  if (!building.cropPlot) return [];
  const [cx, cy, cz] = building.position;
  const rng = mulberry32(hashStr(building.id) + 2);
  const out: FarmInstance[] = [];
  const { halfWidth, halfDepth } = building.cropPlot;
  const spacing = 0.7;
  const cols = Math.max(2, Math.floor((halfWidth * 2) / spacing));
  const rows = Math.max(2, Math.floor((halfDepth * 2) / spacing));
  const startX = -((cols - 1) * spacing) / 2;
  const startZ = -((rows - 1) * spacing) / 2;
  const hutClear = 2.4;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const baseX = startX + c * spacing;
      const baseZ = startZ + r * spacing;
      if (Math.abs(baseX) < hutClear && Math.abs(baseZ) < hutClear) continue;
      const ring = Math.min(c, r, cols - 1 - c, rows - 1 - r);
      if (ring === 0 && rng() < DROPOUT_RICE.ring0) continue;
      if (ring === 1 && rng() < DROPOUT_RICE.ring1) continue;
      const jx = (rng() - 0.5) * spacing * 0.25;
      const jz = (rng() - 0.5) * spacing * 0.25;
      out.push({
        position: [cx + baseX + jx, cy, cz + baseZ + jz],
        scale: 0.55 + rng() * 0.35,
        rotation: rng() * Math.PI * 2,
      });
    }
  }
  return out;
}

/** Vineyard rows: tight inside-row spacing along one axis, looser between
 *  rows. Reads as parallel lines of vines rather than a square grid. */
function vineyardRows(building: Building, tint: [number, number, number]): FarmInstance[] {
  if (!building.cropPlot) return [];
  const [cx, cy, cz] = building.position;
  const rng = mulberry32(hashStr(building.id) + 3);
  const { halfWidth, halfDepth } = building.cropPlot;
  const rowSpacing = 1.4;
  const inRowSpacing = 0.6;
  // Random row orientation per farm — sometimes rows along X, sometimes Z.
  const sideways = rng() > 0.5;
  // The "row direction" follows the longer axis when not flipped, so the
  // vineyard reads visually correct on rectangular plots.
  const longAxis = halfWidth >= halfDepth ? 'x' : 'z';
  const flip = sideways !== (longAxis === 'x');
  const spanAlong  = flip ? halfDepth * 2 : halfWidth * 2;
  const spanAcross = flip ? halfWidth * 2 : halfDepth * 2;
  const numAlong   = Math.max(2, Math.floor(spanAlong / inRowSpacing));
  const numAcross  = Math.max(2, Math.floor(spanAcross / rowSpacing));
  const startA = -((numAlong  - 1) * inRowSpacing) / 2;
  const startC = -((numAcross - 1) * rowSpacing)  / 2;
  const hutClear = 2.6;
  const out: FarmInstance[] = [];
  for (let r = 0; r < numAcross; r++) {
    for (let c = 0; c < numAlong; c++) {
      const along  = startA + c * inRowSpacing;
      const across = startC + r * rowSpacing;
      const dx = flip ? across : along;
      const dz = flip ? along  : across;
      if (Math.abs(dx) < hutClear && Math.abs(dz) < hutClear) continue;
      const ring = Math.min(r, numAcross - 1 - r);
      if (ring === 0 && rng() < DROPOUT_VINEYARD.ring0) continue;
      out.push({
        position: [cx + dx, cy, cz + dz],
        scale: 0.85 + rng() * 0.30,
        rotation: flip ? Math.PI / 2 : 0,
        tint,
      });
    }
  }
  return out;
}

/** Sparse stubble for grain fields — small cone tufts scattered randomly
 *  across the plot, NOT in a grid (grain fields read as a continuous tone
 *  with a few stalks rather than orderly objects). Stubble count scales
 *  with plot area so big fields still look filled. */
function grainStubble(building: Building, tint: [number, number, number]): FarmInstance[] {
  if (!building.cropPlot) return [];
  const [cx, cy, cz] = building.position;
  const rng = mulberry32(hashStr(building.id) + 4);
  const { halfWidth, halfDepth } = building.cropPlot;
  // Density: ~0.5 stubbles per square world unit.
  const count = Math.max(12, Math.floor(halfWidth * halfDepth * 0.5));
  const hutClear = 2.6;
  const out: FarmInstance[] = [];
  for (let i = 0; i < count; i++) {
    const dx = (rng() - 0.5) * (halfWidth * 1.85);
    const dz = (rng() - 0.5) * (halfDepth * 1.85);
    if (Math.abs(dx) < hutClear && Math.abs(dz) < hutClear) continue;
    out.push({
      position: [cx + dx, cy, cz + dz],
      scale: 0.6 + rng() * 0.5,
      rotation: rng() * Math.PI * 2,
      tint,
    });
  }
  return out;
}

export function FarmsteadFields() {
  const ports = useGameStore(s => s.ports);

  // ── Aggregate instance data across every port ──────────────────────────────
  const data = useMemo<FieldData>(() => {
    const oranges: FarmInstance[] = [];
    const rice: FarmInstance[] = [];
    const ricePaddies: FieldData['ricePaddies'] = [];
    const dates: FarmInstance[] = [];
    const palms: FarmInstance[] = [];
    const orchard: FarmInstance[] = [];
    const vineyard: FarmInstance[] = [];
    const banana: FarmInstance[] = [];
    const grainStubbleArr: FarmInstance[] = [];
    const grainGround: FieldData['grainGround'] = [];

    for (const port of ports) {
      for (const b of port.buildings) {
        if (b.type !== 'farmhouse' || !b.crop || !b.cropPlot) continue;
        const tint = b.cropPlot.tint;
        switch (b.crop) {
          case 'orange':
            oranges.push(...gridPlot(b, 2.4, 2.6, 0.14, [0.85, 1.15], DROPOUT_ORCHARD));
            break;
          case 'date':
            dates.push(...gridPlot(b, 2.6, 2.6, 0.10, [0.9, 1.2], DROPOUT_DATE));
            break;
          case 'palm':
            palms.push(...gridPlot(b, 2.7, 2.8, 0.10, [0.9, 1.2], DROPOUT_PALM));
            break;
          case 'rice':
            rice.push(...riceRows(b));
            ricePaddies.push({
              position: [b.position[0], b.position[1] - 0.05, b.position[2]],
              halfWidth: b.cropPlot.halfWidth,
              halfDepth: b.cropPlot.halfDepth,
            });
            break;
          case 'orchard':
            orchard.push(...gridPlot(b, 2.4, 2.6, 0.16, [0.85, 1.15], DROPOUT_ORCHARD, tint));
            break;
          case 'vineyard':
            vineyard.push(...vineyardRows(b, tint ?? [0.40, 0.58, 0.28]));
            break;
          case 'banana':
            banana.push(...gridPlot(b, 2.2, 2.6, 0.18, [0.85, 1.20], DROPOUT_BANANA, tint));
            break;
          case 'grain':
            grainGround.push({
              position: [b.position[0], b.position[1] - 0.04, b.position[2]],
              halfWidth: b.cropPlot.halfWidth,
              halfDepth: b.cropPlot.halfDepth,
              tint: tint ?? [0.76, 0.64, 0.32],
            });
            grainStubbleArr.push(...grainStubble(b, tint ?? [0.78, 0.65, 0.30]));
            break;
        }
      }
    }
    return {
      oranges, rice, ricePaddies, dates, palms,
      orchard, vineyard, banana,
      grainGround, grainStubble: grainStubbleArr,
    };
  }, [ports]);

  // ── Geometry (built once) ──────────────────────────────────────────────────
  const geos = useMemo(() => {
    // Orange tree — small canopy + sprinkle of fruit dots. Self-contained so
    // it can stay tint-free (the orange color IS its identity).
    const orangeTree = (() => {
      const parts: THREE.BufferGeometry[] = [];
      const trunk = new THREE.CylinderGeometry(0.08, 0.12, 0.9, 5, 1);
      trunk.translate(0, 0.45, 0);
      paint(trunk, [0.30, 0.22, 0.16]);
      parts.push(trunk);
      const canopy = new THREE.IcosahedronGeometry(0.85, 0);
      canopy.translate(0, 1.25, 0);
      paint(canopy, [0.18, 0.42, 0.15]);
      parts.push(canopy);
      const rng = mulberry32(101);
      for (let i = 0; i < 6; i++) {
        const a = rng() * Math.PI * 2;
        const r = 0.6 + rng() * 0.25;
        const y = 1.0 + rng() * 0.5;
        const fruit = new THREE.IcosahedronGeometry(0.10, 0);
        fruit.translate(Math.sin(a) * r, y, Math.cos(a) * r);
        paint(fruit, [0.95, 0.55, 0.15]);
        parts.push(fruit);
      }
      const merged = mergeCompatibleGeometries(parts) ?? new THREE.IcosahedronGeometry(1, 0);
      parts.forEach(g => g.dispose());
      merged.computeVertexNormals();
      return merged;
    })();

    // Date palm — short stout palm with drooping fronds.
    const datePalm = (() => {
      const parts: THREE.BufferGeometry[] = [];
      const trunk = new THREE.CylinderGeometry(0.10, 0.16, 2.4, 5, 1);
      trunk.translate(0, 1.2, 0);
      paint(trunk, [0.42, 0.34, 0.22]);
      parts.push(trunk);
      for (let f = 0; f < 7; f++) {
        const angle = (f / 7) * Math.PI * 2;
        const frond = new THREE.PlaneGeometry(0.25, 1.4, 1, 3);
        const pos = frond.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          const y = pos.getY(i);
          const t = (y + 0.7) / 1.4;
          pos.setZ(i, -t * t * 0.45);
        }
        pos.needsUpdate = true;
        frond.rotateX(-0.5);
        frond.rotateY(angle);
        frond.translate(Math.sin(angle) * 0.2, 2.4, Math.cos(angle) * 0.2);
        paint(frond, [0.20, 0.45, 0.12]);
        parts.push(frond);
      }
      const merged = mergeCompatibleGeometries(parts) ?? new THREE.IcosahedronGeometry(1, 0);
      parts.forEach(g => g.dispose());
      merged.computeVertexNormals();
      return merged;
    })();

    // Tall palm — coconut/sago/areca: slimmer, taller, longer fronds.
    const tallPalm = (() => {
      const parts: THREE.BufferGeometry[] = [];
      const trunk = new THREE.CylinderGeometry(0.08, 0.14, 4.2, 5, 1);
      trunk.translate(0, 2.1, 0);
      paint(trunk, [0.45, 0.38, 0.26]);
      parts.push(trunk);
      for (let f = 0; f < 7; f++) {
        const angle = (f / 7) * Math.PI * 2 + 0.15;
        const frond = new THREE.PlaneGeometry(0.30, 2.1, 1, 4);
        const pos = frond.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          const y = pos.getY(i);
          const t = (y + 1.05) / 2.1;
          pos.setZ(i, -t * t * 0.7);
        }
        pos.needsUpdate = true;
        frond.rotateX(-0.65);
        frond.rotateY(angle);
        frond.translate(Math.sin(angle) * 0.25, 4.2, Math.cos(angle) * 0.25);
        paint(frond, [0.18, 0.42, 0.14]);
        parts.push(frond);
      }
      const merged = mergeCompatibleGeometries(parts) ?? new THREE.IcosahedronGeometry(1, 0);
      parts.forEach(g => g.dispose());
      merged.computeVertexNormals();
      return merged;
    })();

    // Generic orchard tree — split trunk + canopy so the canopy can take a
    // per-instance tint via setColorAt while the trunk stays brown.
    const orchardTrunk = (() => {
      const g = new THREE.CylinderGeometry(0.08, 0.13, 1.0, 5, 1);
      g.translate(0, 0.50, 0);
      paint(g, [0.30, 0.22, 0.16]);
      g.computeVertexNormals();
      return g;
    })();
    const orchardCanopy = (() => {
      const parts: THREE.BufferGeometry[] = [];
      const main = new THREE.IcosahedronGeometry(0.85, 0);
      main.translate(0, 1.35, 0);
      paint(main, [1, 1, 1]);
      parts.push(main);
      const cap = new THREE.IcosahedronGeometry(0.55, 0);
      cap.translate(0, 1.85, 0);
      paint(cap, [1, 1, 1]);
      parts.push(cap);
      const merged = mergeCompatibleGeometries(parts) ?? new THREE.IcosahedronGeometry(1, 0);
      parts.forEach(g => g.dispose());
      merged.computeVertexNormals();
      return merged;
    })();

    // Vineyard vine — short stake + low canopy. White vertex color so
    // instance color drives the green tint.
    const vineyardVine = (() => {
      const parts: THREE.BufferGeometry[] = [];
      const stake = new THREE.CylinderGeometry(0.025, 0.030, 0.55, 4, 1);
      stake.translate(0, 0.275, 0);
      paint(stake, [0.55, 0.45, 0.32]);
      parts.push(stake);
      const cluster = new THREE.IcosahedronGeometry(0.30, 0);
      cluster.scale(1.2, 0.6, 0.6);
      cluster.translate(0, 0.75, 0);
      paint(cluster, [1, 1, 1]);
      parts.push(cluster);
      const merged = mergeCompatibleGeometries(parts) ?? new THREE.IcosahedronGeometry(1, 0);
      parts.forEach(g => g.dispose());
      merged.computeVertexNormals();
      return merged;
    })();

    // Banana / plantain / sugarcane / bamboo clump — trunk + broad leaves.
    const bananaClump = (() => {
      const parts: THREE.BufferGeometry[] = [];
      const trunk = new THREE.CylinderGeometry(0.08, 0.10, 1.4, 4, 1);
      trunk.translate(0, 0.7, 0);
      paint(trunk, [0.45, 0.38, 0.22]);
      parts.push(trunk);
      for (let l = 0; l < 6; l++) {
        const angle = (l / 6) * Math.PI * 2 + 0.2;
        const leaf = new THREE.PlaneGeometry(0.55, 1.2, 1, 2);
        leaf.rotateX(-0.4);
        leaf.rotateY(angle);
        leaf.translate(Math.sin(angle) * 0.15, 1.5, Math.cos(angle) * 0.15);
        paint(leaf, [1, 1, 1]);
        parts.push(leaf);
      }
      const merged = mergeCompatibleGeometries(parts) ?? new THREE.IcosahedronGeometry(1, 0);
      parts.forEach(g => g.dispose());
      merged.computeVertexNormals();
      return merged;
    })();

    // Rice tuft — small cluster of vertical green planes.
    const riceTuft = (() => {
      const parts: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.3;
        const blade = new THREE.PlaneGeometry(0.08, 0.45);
        blade.translate(0, 0.22, 0);
        blade.rotateY(a);
        blade.translate(Math.sin(a) * 0.05, 0, Math.cos(a) * 0.05);
        paint(blade, [0.45, 0.62, 0.22]);
        parts.push(blade);
      }
      const merged = mergeCompatibleGeometries(parts) ?? new THREE.PlaneGeometry(0.1, 0.4);
      parts.forEach(g => g.dispose());
      return merged;
    })();

    // Grain stubble — tiny upward cluster of cones, ~0.4u tall.
    const grainStubbleGeo = (() => {
      const parts: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + 0.15;
        const stalk = new THREE.ConeGeometry(0.05, 0.42, 4, 1);
        stalk.translate(Math.sin(a) * 0.08, 0.21, Math.cos(a) * 0.08);
        paint(stalk, [1, 1, 1]);
        parts.push(stalk);
      }
      const merged = mergeCompatibleGeometries(parts) ?? new THREE.ConeGeometry(0.05, 0.4, 4, 1);
      parts.forEach(g => g.dispose());
      merged.computeVertexNormals();
      return merged;
    })();

    // Flat ground quad — used for both rice paddies (water) and grain fields
    // (gold/pale tint). White vertex color so instance color sets the tone.
    const flatQuad = (() => {
      const g = new THREE.PlaneGeometry(1, 1);
      g.rotateX(-Math.PI / 2);
      paint(g, [1, 1, 1]);
      return g;
    })();

    return {
      orangeTree, datePalm, tallPalm,
      orchardTrunk, orchardCanopy,
      vineyardVine, bananaClump,
      riceTuft, grainStubbleGeo, flatQuad,
    };
  }, []);

  // ── Materials ──────────────────────────────────────────────────────────────
  const mats = useMemo(() => {
    const veg = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.85,
      side: THREE.DoubleSide,
    });
    const water = new THREE.MeshStandardMaterial({
      color: '#2d5a6b',
      transparent: true,
      opacity: 0.55,
      roughness: 0.4,
      metalness: 0.1,
    });
    return { veg, water };
  }, []);

  useEffect(() => {
    return () => {
      Object.values(geos).forEach(g => g.dispose());
      mats.veg.dispose();
      mats.water.dispose();
    };
  }, [geos, mats]);

  // ── Instance refs ──────────────────────────────────────────────────────────
  const orangeRef = useRef<THREE.InstancedMesh>(null);
  const dateRef = useRef<THREE.InstancedMesh>(null);
  const palmRef = useRef<THREE.InstancedMesh>(null);
  const riceRef = useRef<THREE.InstancedMesh>(null);
  const paddyRef = useRef<THREE.InstancedMesh>(null);
  const orchardTrunkRef = useRef<THREE.InstancedMesh>(null);
  const orchardCanopyRef = useRef<THREE.InstancedMesh>(null);
  const vineyardRef = useRef<THREE.InstancedMesh>(null);
  const bananaRef = useRef<THREE.InstancedMesh>(null);
  const grainGroundRef = useRef<THREE.InstancedMesh>(null);
  const grainStubbleRef = useRef<THREE.InstancedMesh>(null);

  useEffect(() => {
    const dummy = new THREE.Object3D();
    const tmpColor = new THREE.Color();

    const writeMatrices = (
      mesh: THREE.InstancedMesh | null,
      items: FarmInstance[],
      tinted: boolean,
    ) => {
      if (!mesh) return;
      items.forEach((it, i) => {
        dummy.position.set(...it.position);
        dummy.rotation.set(0, it.rotation, 0);
        dummy.scale.setScalar(it.scale);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        if (tinted && it.tint) {
          tmpColor.setRGB(it.tint[0], it.tint[1], it.tint[2]);
          mesh.setColorAt(i, tmpColor);
        }
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (tinted && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    };

    writeMatrices(orangeRef.current, data.oranges, false);
    writeMatrices(dateRef.current, data.dates, false);
    writeMatrices(palmRef.current, data.palms, false);
    writeMatrices(riceRef.current, data.rice, false);
    writeMatrices(orchardTrunkRef.current, data.orchard, false);
    writeMatrices(orchardCanopyRef.current, data.orchard, true);
    writeMatrices(vineyardRef.current, data.vineyard, true);
    writeMatrices(bananaRef.current, data.banana, true);
    writeMatrices(grainStubbleRef.current, data.grainStubble, true);

    if (paddyRef.current) {
      data.ricePaddies.forEach((it, i) => {
        dummy.position.set(it.position[0], it.position[1], it.position[2]);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(it.halfWidth * 2, 1, it.halfDepth * 2);
        dummy.updateMatrix();
        paddyRef.current!.setMatrixAt(i, dummy.matrix);
      });
      paddyRef.current.instanceMatrix.needsUpdate = true;
    }

    if (grainGroundRef.current) {
      data.grainGround.forEach((it, i) => {
        dummy.position.set(it.position[0], it.position[1], it.position[2]);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(it.halfWidth * 2, 1, it.halfDepth * 2);
        dummy.updateMatrix();
        grainGroundRef.current!.setMatrixAt(i, dummy.matrix);
        tmpColor.setRGB(it.tint[0], it.tint[1], it.tint[2]);
        grainGroundRef.current!.setColorAt(i, tmpColor);
      });
      grainGroundRef.current.instanceMatrix.needsUpdate = true;
      if (grainGroundRef.current.instanceColor) {
        grainGroundRef.current.instanceColor.needsUpdate = true;
      }
    }
  }, [data]);

  return (
    <group>
      {data.oranges.length > 0 && (
        <instancedMesh
          ref={orangeRef}
          args={[geos.orangeTree, mats.veg, data.oranges.length]}
          castShadow
          receiveShadow
          frustumCulled={false}
        />
      )}
      {data.dates.length > 0 && (
        <instancedMesh
          ref={dateRef}
          args={[geos.datePalm, mats.veg, data.dates.length]}
          castShadow
          receiveShadow
          frustumCulled={false}
        />
      )}
      {data.palms.length > 0 && (
        <instancedMesh
          ref={palmRef}
          args={[geos.tallPalm, mats.veg, data.palms.length]}
          castShadow
          receiveShadow
          frustumCulled={false}
        />
      )}
      {data.orchard.length > 0 && (
        <>
          <instancedMesh
            ref={orchardTrunkRef}
            args={[geos.orchardTrunk, mats.veg, data.orchard.length]}
            castShadow
            receiveShadow
            frustumCulled={false}
          />
          <instancedMesh
            ref={orchardCanopyRef}
            args={[geos.orchardCanopy, mats.veg, data.orchard.length]}
            castShadow
            receiveShadow
            frustumCulled={false}
          />
        </>
      )}
      {data.vineyard.length > 0 && (
        <instancedMesh
          ref={vineyardRef}
          args={[geos.vineyardVine, mats.veg, data.vineyard.length]}
          receiveShadow
          frustumCulled={false}
        />
      )}
      {data.banana.length > 0 && (
        <instancedMesh
          ref={bananaRef}
          args={[geos.bananaClump, mats.veg, data.banana.length]}
          castShadow
          receiveShadow
          frustumCulled={false}
        />
      )}
      {data.grainGround.length > 0 && (
        <instancedMesh
          ref={grainGroundRef}
          args={[geos.flatQuad, mats.veg, data.grainGround.length]}
          receiveShadow
          frustumCulled={false}
        />
      )}
      {data.grainStubble.length > 0 && (
        <instancedMesh
          ref={grainStubbleRef}
          args={[geos.grainStubbleGeo, mats.veg, data.grainStubble.length]}
          frustumCulled={false}
        />
      )}
      {data.rice.length > 0 && (
        <instancedMesh
          ref={riceRef}
          args={[geos.riceTuft, mats.veg, data.rice.length]}
          frustumCulled={false}
        />
      )}
      {data.ricePaddies.length > 0 && (
        <instancedMesh
          ref={paddyRef}
          args={[geos.flatQuad, mats.water, data.ricePaddies.length]}
          frustumCulled={false}
        />
      )}
    </group>
  );
}

/** Bake a flat color into a geometry's vertex colors so we can keep all
 *  crop parts on a single MeshStandardMaterial with vertexColors=true.
 *  For tinted pools we paint white here and use setColorAt per instance. */
function paint(geo: THREE.BufferGeometry, rgb: [number, number, number]) {
  const count = geo.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = rgb[0];
    colors[i * 3 + 1] = rgb[1];
    colors[i * 3 + 2] = rgb[2];
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}
