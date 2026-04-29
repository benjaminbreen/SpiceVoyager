import { useMemo, useRef, useEffect } from 'react';
import * as THREE from 'three';
import { useGameStore, Building } from '../store/gameStore';
import { mergeCompatibleGeometries } from '../utils/geometryMerge';
import { getTerrainHeight } from '../utils/terrain';

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
  /** Small per-instance lean (radians) on X and Z axes so trees, vines, and
   *  stubble don't all sit dead-vertical. ±0.05 is plenty — beyond that
   *  trunks visibly tip. */
  tiltX: number;
  tiltZ: number;
  /** Optional per-instance tint (overrides material color when set via
   *  setColorAt). Only the canopy pool consumes this; trunks ignore it. */
  tint?: [number, number, number];
}

/** Soil patch under a non-grain, non-rice crop. Reads as cultivated ground
 *  so the plot boundary is visible even where edge-dropout has thinned the
 *  trees. Rice has its own water quad and grain has its own gold quad —
 *  this one covers the rest. */
interface CropGround {
  position: [number, number, number];
  halfWidth: number;
  halfDepth: number;
  tint: [number, number, number];
}

/** Low earthen bund crossing a rice paddy, splitting it into sub-paddies. */
interface RiceBund {
  position: [number, number, number];
  length: number;
  /** True for a bund running along the X axis, false for one running along Z. */
  alongX: boolean;
}

interface FieldData {
  oranges: FarmInstance[];
  rice: FarmInstance[];
  /** Translucent paddy-water plane per rice farm. Now rectangular. */
  ricePaddies: { position: [number, number, number]; halfWidth: number; halfDepth: number }[];
  riceBunds: RiceBund[];
  dates: FarmInstance[];
  palms: FarmInstance[];
  orchard: FarmInstance[];
  vineyard: FarmInstance[];
  banana: FarmInstance[];
  grainStubble: FarmInstance[];
  /** One ground patch per grain field — quad scaled per plot, tinted gold/
   *  pale by crop variant (wheat vs hay vs sorghum etc.). */
  grainGround: { position: [number, number, number]; halfWidth: number; halfDepth: number; tint: [number, number, number] }[];
  /** Soil quad for orchard / vineyard / banana / dates / palms / oranges
   *  so the field reads as cultivated ground rather than green grass. */
  cropGround: CropGround[];
}

/** Per-crop default ground tint. Independent of canopy tint — the canopy
 *  varies (silver fig vs deep-green mango); the soil underneath stays in
 *  the same loam/sand band per crop. */
const GROUND_TINT_ORANGE:   [number, number, number] = [0.42, 0.38, 0.26]; // dark loam
const GROUND_TINT_DATE:     [number, number, number] = [0.78, 0.68, 0.48]; // pale sand
const GROUND_TINT_PALM:     [number, number, number] = [0.72, 0.62, 0.42]; // sandy beige
const GROUND_TINT_ORCHARD:  [number, number, number] = [0.40, 0.34, 0.24]; // dark loam
const GROUND_TINT_VINEYARD: [number, number, number] = [0.62, 0.54, 0.38]; // tilled earth
const GROUND_TINT_BANANA:   [number, number, number] = [0.36, 0.27, 0.17]; // rich tropical brown
const BUND_TINT:            [number, number, number] = [0.55, 0.45, 0.30]; // earthen tan

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
// Grain has the most aggressive boundary dissolve — pairs with the soil
// patch's vertex-faded edges so the field never reads as a sharp rectangle.
const DROPOUT_GRAIN:    EdgeDropout = { ring0: 0.35, ring1: 0.12 };

/** Approximate grassland color used to fade the outer ring of soil patches
 *  back into the surrounding terrain. Sampled visually from the grassland
 *  baseGrass tint in terrain.ts (~[0.40, 0.50, 0.20]); a perfect match
 *  isn't necessary because the fade only needs to blur the patch edge. */
const GRASS_FADE_TINT: [number, number, number] = [0.36, 0.48, 0.22];

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
  const [cx, , cz] = building.position;
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
      const tiltX = (rng() - 0.5) * 0.10;
      const tiltZ = (rng() - 0.5) * 0.10;
      const wx = cx + baseX + jx;
      const wz = cz + baseZ + jz;
      // Per-instance terrain sampling — without this, every tree in a
      // farm sits at the building's center height, which clips into hills
      // and floats over dips on sloped plots.
      const wy = getTerrainHeight(wx, wz);
      out.push({
        position: [wx, wy, wz],
        scale, rotation, tiltX, tiltZ, tint,
      });
    }
  }
  return out;
}

/** Tight rows for rice paddies — denser, smaller tufts than orchards. */
function riceRows(building: Building): FarmInstance[] {
  if (!building.cropPlot) return [];
  const [cx, , cz] = building.position;
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
      const wx = cx + baseX + jx;
      const wz = cz + baseZ + jz;
      const wy = getTerrainHeight(wx, wz);
      out.push({
        position: [wx, wy, wz],
        scale: 0.55 + rng() * 0.35,
        rotation: rng() * Math.PI * 2,
        tiltX: (rng() - 0.5) * 0.16,
        tiltZ: (rng() - 0.5) * 0.16,
      });
    }
  }
  return out;
}

/** Vineyard rows: tight inside-row spacing along one axis, looser between
 *  rows. Reads as parallel lines of vines rather than a square grid. */
function vineyardRows(building: Building, tint: [number, number, number]): FarmInstance[] {
  if (!building.cropPlot) return [];
  const [cx, , cz] = building.position;
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
      const wx = cx + dx;
      const wz = cz + dz;
      const wy = getTerrainHeight(wx, wz);
      out.push({
        position: [wx, wy, wz],
        scale: 0.85 + rng() * 0.30,
        rotation: flip ? Math.PI / 2 : 0,
        tiltX: (rng() - 0.5) * 0.12,
        tiltZ: (rng() - 0.5) * 0.12,
        tint,
      });
    }
  }
  return out;
}

/** Build a single merged BufferGeometry for a list of ground patches, with
 *  each patch tessellated into a (subdivs+1)² vertex grid and y-sampled
 *  from terrain so the soil follows the hillside instead of clipping
 *  into / floating above it. Per-patch tint is baked into vertex colors,
 *  letting the whole landscape's farm soil render in one draw call.
 *
 *  Boundary dissolve: outer-ring vertices are jittered *inward* (random
 *  fraction of the cell size) and their vertex color is faded toward the
 *  surrounding grass tint, so the visible field perimeter is irregular
 *  instead of a hard rectangle. The next ring inward gets a softer fade
 *  for a gradient transition. Without this, plots read as paper cut-outs.
 *
 *  Z-fight mitigation: a small lift plus polygonOffset on the soil
 *  material handles the rest — relying on lift alone caused visible
 *  flicker on slopes.
 *
 *  Subdivs default = 6 (49 verts/patch), giving more terrain conformance
 *  on the larger plots while keeping the per-port sampling cost moderate. */
function buildGroundGeometry(
  patches: { position: [number, number, number]; halfWidth: number; halfDepth: number; tint: [number, number, number] }[],
  subdivs = 6,
  lift = 0.06,
): THREE.BufferGeometry | null {
  if (patches.length === 0) return null;
  const stride = subdivs + 1;
  const vertsPerPatch = stride * stride;
  const trisPerPatch = subdivs * subdivs * 2;
  const positions = new Float32Array(patches.length * vertsPerPatch * 3);
  const colors = new Float32Array(patches.length * vertsPerPatch * 3);
  const indices = new Uint32Array(patches.length * trisPerPatch * 3);
  let vOff = 0;
  let iOff = 0;
  let patchIdx = 0;
  for (const patch of patches) {
    const [cx, , cz] = patch.position;
    const { halfWidth, halfDepth, tint } = patch;
    const baseVert = vOff / 3;
    // Per-patch RNG seeded from the patch position so the boundary jitter
    // and color noise are stable across rebuilds (same farm → same shape).
    const rng = mulberry32(((cx * 73856093) ^ (cz * 19349663) ^ patchIdx) >>> 0);
    const cellW = (halfWidth * 2) / subdivs;
    const cellD = (halfDepth * 2) / subdivs;

    for (let r = 0; r <= subdivs; r++) {
      for (let c = 0; c <= subdivs; c++) {
        let x = cx - halfWidth + (c / subdivs) * halfWidth * 2;
        let z = cz - halfDepth + (r / subdivs) * halfDepth * 2;
        // Distance from this vertex to the nearest patch edge, in cells.
        const ring = Math.min(c, r, subdivs - c, subdivs - r);
        // Jitter outer rings inward — turns the rectangle's edge into a
        // slightly bumpy organic boundary. ring0 is pulled hard inward,
        // ring1 only a little.
        if (ring === 0) {
          // Direction inward depends on which edge this vert sits on.
          const onLeft  = c === 0;
          const onRight = c === subdivs;
          const onTop   = r === 0;
          const onBot   = r === subdivs;
          const inwardX = onLeft ? 1 : onRight ? -1 : 0;
          const inwardZ = onTop  ? 1 : onBot   ? -1 : 0;
          x += inwardX * cellW * (0.20 + rng() * 0.55);
          z += inwardZ * cellD * (0.20 + rng() * 0.55);
          // Light tangential drift along the edge as well, so the silhouette
          // doesn't read as evenly-spaced bumps.
          if (inwardX !== 0) z += (rng() - 0.5) * cellD * 0.8;
          if (inwardZ !== 0) x += (rng() - 0.5) * cellW * 0.8;
        } else if (ring === 1) {
          x += (rng() - 0.5) * cellW * 0.30;
          z += (rng() - 0.5) * cellD * 0.30;
        }
        const y = getTerrainHeight(x, z) + lift;
        positions[vOff++] = x;
        positions[vOff++] = y;
        positions[vOff++] = z;

        // Vertex color fade — outer ring blends mostly to grass, ring 1
        // partially. Inner verts keep the full crop tint.
        const colorOff = (baseVert + r * stride + c) * 3;
        if (ring === 0) {
          const t = 0.70;
          colors[colorOff]     = tint[0] * (1 - t) + GRASS_FADE_TINT[0] * t;
          colors[colorOff + 1] = tint[1] * (1 - t) + GRASS_FADE_TINT[1] * t;
          colors[colorOff + 2] = tint[2] * (1 - t) + GRASS_FADE_TINT[2] * t;
        } else if (ring === 1) {
          const t = 0.30;
          colors[colorOff]     = tint[0] * (1 - t) + GRASS_FADE_TINT[0] * t;
          colors[colorOff + 1] = tint[1] * (1 - t) + GRASS_FADE_TINT[1] * t;
          colors[colorOff + 2] = tint[2] * (1 - t) + GRASS_FADE_TINT[2] * t;
        } else {
          // Inner verts get a small per-vertex tint jitter so the field
          // surface isn't a flat slab of single color.
          const j = (rng() - 0.5) * 0.06;
          colors[colorOff]     = Math.max(0, Math.min(1, tint[0] + j));
          colors[colorOff + 1] = Math.max(0, Math.min(1, tint[1] + j));
          colors[colorOff + 2] = Math.max(0, Math.min(1, tint[2] + j * 0.5));
        }
      }
    }
    for (let r = 0; r < subdivs; r++) {
      for (let c = 0; c < subdivs; c++) {
        const a = baseVert + r * stride + c;
        const b = a + 1;
        const cc = a + stride;
        const d = cc + 1;
        indices[iOff++] = a;  indices[iOff++] = cc; indices[iOff++] = b;
        indices[iOff++] = b;  indices[iOff++] = cc; indices[iOff++] = d;
      }
    }
    patchIdx++;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  geo.computeVertexNormals();
  return geo;
}

/** Dense rows of grain stalks. Mirrors historical drilled / broadcast-then-
 *  harrowed grain fields: long parallel rows along the field's longer axis,
 *  tightly packed along the row, looser between rows. The previous random
 *  scatter at ~0.5 stalks/u² read as bare ground with a handful of cones —
 *  rows + 6× density turn the field into a continuous golden mass.
 *
 *  Per-stalk tint varies ±15% around the field's base tint so the surface
 *  has natural patchiness (greener stalks where grain is unripe, paler
 *  stalks where it's drying). */
function grainRows(building: Building, tint: [number, number, number]): FarmInstance[] {
  if (!building.cropPlot) return [];
  const [cx, , cz] = building.position;
  const rng = mulberry32(hashStr(building.id) + 4);
  const { halfWidth, halfDepth } = building.cropPlot;
  const rowSpacing = 0.55;     // between rows (perpendicular to row direction)
  const inRowSpacing = 0.32;   // along the row — stalks crowd together
  // Run rows along the longer axis so the field reads as drilled strips on
  // rectangular plots.
  const flip = halfDepth > halfWidth;
  const spanAlong  = flip ? halfDepth * 2 : halfWidth * 2;
  const spanAcross = flip ? halfWidth * 2 : halfDepth * 2;
  const numAlong   = Math.max(2, Math.floor(spanAlong  / inRowSpacing));
  const numAcross  = Math.max(2, Math.floor(spanAcross / rowSpacing));
  const startA = -((numAlong  - 1) * inRowSpacing) / 2;
  const startC = -((numAcross - 1) * rowSpacing)  / 2;
  const hutClear = 3.0;
  const out: FarmInstance[] = [];
  for (let r = 0; r < numAcross; r++) {
    for (let c = 0; c < numAlong; c++) {
      const along  = startA + c * inRowSpacing;
      const across = startC + r * rowSpacing;
      const dx = flip ? across : along;
      const dz = flip ? along  : across;
      if (Math.abs(dx) < hutClear && Math.abs(dz) < hutClear) continue;
      // Edge dropout — softens the rectangular boundary. Pairs with the
      // soil patch's vertex-color/position fade so the rectangle dissolves.
      const ringR = Math.min(r, numAcross - 1 - r);
      const ringC = Math.min(c, numAlong  - 1 - c);
      const ring = Math.min(ringR, ringC);
      if (ring === 0 && rng() < DROPOUT_GRAIN.ring0) continue;
      if (ring === 1 && rng() < DROPOUT_GRAIN.ring1) continue;
      // Light position jitter so rows aren't perfectly mechanical.
      const jx = (rng() - 0.5) * inRowSpacing * 0.35;
      const jz = (rng() - 0.5) * inRowSpacing * 0.35;
      const wx = cx + dx + jx;
      const wz = cz + dz + jz;
      const wy = getTerrainHeight(wx, wz);
      // Per-stalk tint variation — pull each component toward 1.0 (paler)
      // or 0.0 (deeper) by ±15% to suggest patches at different ripeness.
      const variation = 0.85 + rng() * 0.30;
      const stalkTint: [number, number, number] = [
        Math.min(1, tint[0] * variation),
        Math.min(1, tint[1] * variation),
        Math.min(1, tint[2] * variation),
      ];
      out.push({
        position: [wx, wy, wz],
        scale: 0.85 + rng() * 0.30,
        // Stalks all face roughly upright with small rotational drift —
        // not 360° random, since drilled grain rows looked aligned.
        rotation: (rng() - 0.5) * 0.6,
        tiltX: (rng() - 0.5) * 0.18,
        tiltZ: (rng() - 0.5) * 0.18,
        tint: stalkTint,
      });
    }
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
    const riceBunds: RiceBund[] = [];
    const dates: FarmInstance[] = [];
    const palms: FarmInstance[] = [];
    const orchard: FarmInstance[] = [];
    const vineyard: FarmInstance[] = [];
    const banana: FarmInstance[] = [];
    const grainStubbleArr: FarmInstance[] = [];
    const grainGround: FieldData['grainGround'] = [];
    const cropGround: CropGround[] = [];

    for (const port of ports) {
      for (const b of port.buildings) {
        if (b.type !== 'farmhouse' || !b.crop || !b.cropPlot) continue;
        const tint = b.cropPlot.tint;
        const { halfWidth, halfDepth } = b.cropPlot;
        // Soil quad sits just above terrain but below the trees/vines so the
        // field reads as cultivated ground. y-0.03 keeps it clear of the
        // grain (-0.04) and rice paddy (-0.05) layers.
        const groundPos: [number, number, number] = [b.position[0], b.position[1] - 0.03, b.position[2]];
        switch (b.crop) {
          case 'orange':
            cropGround.push({ position: groundPos, halfWidth, halfDepth, tint: GROUND_TINT_ORANGE });
            oranges.push(...gridPlot(b, 2.4, 2.6, 0.14, [0.85, 1.15], DROPOUT_ORCHARD));
            break;
          case 'date':
            cropGround.push({ position: groundPos, halfWidth, halfDepth, tint: GROUND_TINT_DATE });
            dates.push(...gridPlot(b, 2.6, 2.6, 0.10, [0.9, 1.2], DROPOUT_DATE));
            break;
          case 'palm':
            cropGround.push({ position: groundPos, halfWidth, halfDepth, tint: GROUND_TINT_PALM });
            palms.push(...gridPlot(b, 2.7, 2.8, 0.10, [0.9, 1.2], DROPOUT_PALM));
            break;
          case 'rice': {
            rice.push(...riceRows(b));
            ricePaddies.push({
              position: [b.position[0], b.position[1] - 0.05, b.position[2]],
              halfWidth, halfDepth,
            });
            // One bund along each axis through the paddy center, splitting it
            // into 4 sub-paddies. For larger paddies (≥14 along an axis) add
            // a second offset bund so the grid stays believable.
            const bundY = b.position[1] - 0.02;
            riceBunds.push(
              { position: [b.position[0], bundY, b.position[2]], length: halfWidth * 2, alongX: true },
              { position: [b.position[0], bundY, b.position[2]], length: halfDepth * 2, alongX: false },
            );
            if (halfWidth >= 7) {
              riceBunds.push(
                { position: [b.position[0], bundY, b.position[2] + halfDepth * 0.5], length: halfWidth * 2, alongX: true },
                { position: [b.position[0], bundY, b.position[2] - halfDepth * 0.5], length: halfWidth * 2, alongX: true },
              );
            }
            if (halfDepth >= 7) {
              riceBunds.push(
                { position: [b.position[0] + halfWidth * 0.5, bundY, b.position[2]], length: halfDepth * 2, alongX: false },
                { position: [b.position[0] - halfWidth * 0.5, bundY, b.position[2]], length: halfDepth * 2, alongX: false },
              );
            }
            break;
          }
          case 'orchard':
            cropGround.push({ position: groundPos, halfWidth, halfDepth, tint: GROUND_TINT_ORCHARD });
            orchard.push(...gridPlot(b, 2.4, 2.6, 0.16, [0.85, 1.15], DROPOUT_ORCHARD, tint));
            break;
          case 'vineyard':
            cropGround.push({ position: groundPos, halfWidth, halfDepth, tint: GROUND_TINT_VINEYARD });
            vineyard.push(...vineyardRows(b, tint ?? [0.40, 0.58, 0.28]));
            break;
          case 'banana':
            cropGround.push({ position: groundPos, halfWidth, halfDepth, tint: GROUND_TINT_BANANA });
            banana.push(...gridPlot(b, 2.2, 2.6, 0.18, [0.85, 1.20], DROPOUT_BANANA, tint));
            break;
          case 'grain':
            grainGround.push({
              position: [b.position[0], b.position[1] - 0.04, b.position[2]],
              halfWidth, halfDepth,
              tint: tint ?? [0.76, 0.64, 0.32],
            });
            grainStubbleArr.push(...grainRows(b, tint ?? [0.78, 0.65, 0.30]));
            break;
        }
      }
    }
    return {
      oranges, rice, ricePaddies, riceBunds, dates, palms,
      orchard, vineyard, banana,
      grainGround, grainStubble: grainStubbleArr,
      cropGround,
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

    // Grain stalk — slim stem with a fattened seedhead at the top. Built
    // as a small clump (3 stalks per instance) so each grid cell looks
    // like a tuft rather than a single line. White vertex color so the
    // per-instance setColorAt drives all the tint variation.
    const grainStubbleGeo = (() => {
      const parts: THREE.BufferGeometry[] = [];
      const stalkCount = 3;
      for (let i = 0; i < stalkCount; i++) {
        const a = (i / stalkCount) * Math.PI * 2 + 0.4;
        const ox = Math.sin(a) * 0.06;
        const oz = Math.cos(a) * 0.06;
        // Stem — tall, slim cylinder.
        const stem = new THREE.CylinderGeometry(0.012, 0.018, 0.85, 4, 1);
        stem.translate(ox, 0.42, oz);
        paint(stem, [1, 1, 1]);
        parts.push(stem);
        // Seedhead — slightly fatter ovoid at the top of each stem.
        // Slight asymmetric scale so the head reads as a wheat ear and
        // not a sphere.
        const head = new THREE.IcosahedronGeometry(0.055, 0);
        head.scale(1, 1.7, 1);
        head.translate(ox, 0.95, oz);
        paint(head, [1, 1, 1]);
        parts.push(head);
      }
      const merged = mergeCompatibleGeometries(parts) ?? new THREE.ConeGeometry(0.05, 0.4, 4, 1);
      parts.forEach(g => g.dispose());
      merged.computeVertexNormals();
      return merged;
    })();

    // Flat ground quad — used for rice paddies (water), grain fields, and
    // every other crop's soil patch. White vertex color so instance color
    // drives the per-crop tint.
    const flatQuad = (() => {
      const g = new THREE.PlaneGeometry(1, 1);
      g.rotateX(-Math.PI / 2);
      paint(g, [1, 1, 1]);
      return g;
    })();

    // Rice bund — unit-sized box, scaled per-instance to span a paddy axis.
    // Painted earthen tan directly so we don't need per-instance tinting.
    const bundBox = (() => {
      const g = new THREE.BoxGeometry(1, 1, 1);
      paint(g, BUND_TINT);
      g.computeVertexNormals();
      return g;
    })();

    return {
      orangeTree, datePalm, tallPalm,
      orchardTrunk, orchardCanopy,
      vineyardVine, bananaClump,
      riceTuft, grainStubbleGeo, flatQuad, bundBox,
    };
  }, []);

  // ── Materials ──────────────────────────────────────────────────────────────
  const mats = useMemo(() => {
    const veg = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.85,
      side: THREE.DoubleSide,
    });
    // Soil patches sit just above the terrain mesh and z-fight with it on
    // slopes. polygonOffset pushes the soil forward in the depth buffer so
    // it always wins the depth test against the underlying terrain — much
    // more reliable than relying on a visible y-lift, which has to grow
    // with the slope and creates floating edges. The lift in
    // buildGroundGeometry remains as a small belt-and-braces nudge.
    const soil = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.92,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const water = new THREE.MeshStandardMaterial({
      color: '#2d5a6b',
      transparent: true,
      opacity: 0.55,
      roughness: 0.4,
      metalness: 0.1,
    });
    return { veg, soil, water };
  }, []);

  useEffect(() => {
    return () => {
      Object.values(geos).forEach(g => g.dispose());
      mats.veg.dispose();
      mats.soil.dispose();
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
  const grainStubbleRef = useRef<THREE.InstancedMesh>(null);
  const bundRef = useRef<THREE.InstancedMesh>(null);

  // Terrain-conforming soil geometry. Each patch is tessellated and its
  // verts sampled against the terrain heightfield so the field follows
  // the slope instead of submerging on hills / floating in dips. Rebuilt
  // whenever the port roster changes; previous geometry is disposed in
  // the cleanup effect below.
  const groundGeos = useMemo(() => ({
    cropGround: buildGroundGeometry(data.cropGround),
    grainGround: buildGroundGeometry(data.grainGround),
  }), [data]);
  useEffect(() => {
    return () => {
      groundGeos.cropGround?.dispose();
      groundGeos.grainGround?.dispose();
    };
  }, [groundGeos]);

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
        // X/Z tilt makes the trunk lean — Y stays the canopy spin. Order
        // doesn't matter visually for tilts this small.
        dummy.rotation.set(it.tiltX, it.rotation, it.tiltZ);
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

    if (bundRef.current) {
      // Bunds are unit boxes scaled to length × 0.32 high × 0.40 wide so
      // they sit a touch above the rice tufts and read as raised earthen
      // dividers. alongX rotates 0; crossing bunds rotate 90° around Y.
      data.riceBunds.forEach((it, i) => {
        dummy.position.set(it.position[0], it.position[1] + 0.16, it.position[2]);
        dummy.rotation.set(0, it.alongX ? 0 : Math.PI / 2, 0);
        dummy.scale.set(it.length, 0.32, 0.40);
        dummy.updateMatrix();
        bundRef.current!.setMatrixAt(i, dummy.matrix);
      });
      bundRef.current.instanceMatrix.needsUpdate = true;
    }
  }, [data]);

  return (
    <group>
      {groundGeos.cropGround && (
        <mesh
          geometry={groundGeos.cropGround}
          material={mats.soil}
          receiveShadow
          frustumCulled={false}
        />
      )}
      {groundGeos.grainGround && (
        <mesh
          geometry={groundGeos.grainGround}
          material={mats.soil}
          receiveShadow
          frustumCulled={false}
        />
      )}
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
      {data.riceBunds.length > 0 && (
        <instancedMesh
          ref={bundRef}
          args={[geos.bundBox, mats.veg, data.riceBunds.length]}
          castShadow
          receiveShadow
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
