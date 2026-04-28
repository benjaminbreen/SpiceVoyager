/**
 * pedestrianArchetypes.ts — Culture/class/profession-aware NPC silhouettes
 *
 * Each pedestrian assembles up to six instanced meshes:
 *   - body archetype  (clothing silhouette, clothing color)
 *   - head            (per figure type, skin-tone color)
 *   - headwear        (optional — turban, felt hat, etc.)
 *   - arms × 2        (per arm type, animated via shoulder rotation)
 *   - prop            (optional — bundle/basket/rope/jar)
 *
 * Bodies are torso + legs/skirt only. Arms are separate meshes so they can
 * swing with walk phase. Height target ~1.95 units (player is ~2.0).
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Culture } from '../store/gameStore';
import { FigureType, PedestrianType } from './pedestrianSystem';

// ── Types ───────────────────────────────────────────────────────────────────

export type BodyArchetype =
  | 'euro-man'
  | 'robe-long'
  | 'tunic-wrap'
  | 'african-wrap-man'
  | 'euro-woman'
  | 'sari-woman'
  | 'wrap-woman'
  | 'child';

export type HeadwearType =
  | 'none'
  | 'felt-hat'
  | 'turban'
  | 'kufi'
  | 'straw-hat'
  | 'mantilla'
  | 'head-wrap'
  | 'scarf';

export type ArmType =
  | 'male-long'   // standard male arm with sleeve
  | 'male-robe'   // baggier sleeve for robe-long
  | 'female'      // thinner arm
  | 'child';

export type PropType =
  | 'none'
  | 'bundle'      // cloth bolt, merchant
  | 'basket'      // woven, farmer
  | 'rope-coil'   // sailor
  | 'jar';        // laborer

export interface VisualProfile {
  body: BodyArchetype;
  headwear: HeadwearType;
  prop: PropType;
}

// ── Geometry helpers ────────────────────────────────────────────────────────

function sph(r: number, wSeg: number, hSeg: number, y: number, x = 0, z = 0): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(r, wSeg, hSeg);
  g.translate(x, y, z);
  return g;
}
function cyl(rTop: number, rBot: number, h: number, seg: number, y: number, x = 0, z = 0): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, seg, 1);
  g.translate(x, y, z);
  return g;
}
function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const m = mergeGeometries(parts)!;
  parts.forEach(p => p.dispose());
  return m;
}

// ── Body archetype geometries (no arms) ─────────────────────────────────────

function createEuroMan(): THREE.BufferGeometry {
  const p: THREE.BufferGeometry[] = [];
  // Doublet
  p.push(cyl(0.17, 0.15, 0.50, 7, 1.30));
  // Breeches
  p.push(cyl(0.13, 0.10, 0.22, 6, 0.92, -0.08));
  p.push(cyl(0.13, 0.10, 0.22, 6, 0.92, 0.08));
  // Stockings
  p.push(cyl(0.07, 0.065, 0.42, 5, 0.57, -0.08));
  p.push(cyl(0.07, 0.065, 0.42, 5, 0.57, 0.08));
  // Boots
  p.push(cyl(0.09, 0.09, 0.10, 5, 0.30, -0.08));
  p.push(cyl(0.09, 0.09, 0.10, 5, 0.30, 0.08));
  return merge(p);
}

function createRobeLong(): THREE.BufferGeometry {
  const p: THREE.BufferGeometry[] = [];
  p.push(cyl(0.17, 0.16, 0.38, 7, 1.36));
  p.push(cyl(0.16, 0.28, 1.00, 8, 0.67));
  p.push(cyl(0.08, 0.08, 0.08, 5, 0.14, -0.08));
  p.push(cyl(0.08, 0.08, 0.08, 5, 0.14, 0.08));
  return merge(p);
}

function createTunicWrap(): THREE.BufferGeometry {
  const p: THREE.BufferGeometry[] = [];
  p.push(cyl(0.16, 0.17, 0.60, 7, 1.25));
  p.push(cyl(0.08, 0.07, 0.40, 5, 0.75, -0.08));
  p.push(cyl(0.08, 0.07, 0.40, 5, 0.75, 0.08));
  p.push(cyl(0.07, 0.065, 0.35, 5, 0.38, -0.08));
  p.push(cyl(0.07, 0.065, 0.35, 5, 0.38, 0.08));
  p.push(cyl(0.08, 0.07, 0.06, 5, 0.17, -0.08));
  p.push(cyl(0.08, 0.07, 0.06, 5, 0.17, 0.08));
  return merge(p);
}

function createAfricanWrapMan(): THREE.BufferGeometry {
  const p: THREE.BufferGeometry[] = [];
  p.push(cyl(0.16, 0.15, 0.30, 7, 1.40));
  p.push(cyl(0.15, 0.22, 0.85, 8, 0.82));
  p.push(cyl(0.07, 0.065, 0.30, 5, 0.25, -0.08));
  p.push(cyl(0.07, 0.065, 0.30, 5, 0.25, 0.08));
  p.push(cyl(0.08, 0.07, 0.06, 5, 0.08, -0.08));
  p.push(cyl(0.08, 0.07, 0.06, 5, 0.08, 0.08));
  return merge(p);
}

function createEuroWoman(): THREE.BufferGeometry {
  const p: THREE.BufferGeometry[] = [];
  p.push(cyl(0.14, 0.12, 0.35, 7, 1.33));
  p.push(cyl(0.12, 0.28, 1.00, 10, 0.66));
  return merge(p);
}

function createSariWoman(): THREE.BufferGeometry {
  const p: THREE.BufferGeometry[] = [];
  p.push(cyl(0.13, 0.12, 0.40, 7, 1.30));
  p.push(cyl(0.12, 0.17, 1.10, 8, 0.55));
  p.push(cyl(0.06, 0.06, 0.04, 5, 0.02, -0.06));
  p.push(cyl(0.06, 0.06, 0.04, 5, 0.02, 0.06));
  return merge(p);
}

function createWrapWoman(): THREE.BufferGeometry {
  const p: THREE.BufferGeometry[] = [];
  p.push(cyl(0.13, 0.12, 0.35, 7, 1.33));
  p.push(cyl(0.12, 0.22, 0.90, 8, 0.70));
  p.push(cyl(0.06, 0.06, 0.06, 5, 0.20, -0.07));
  p.push(cyl(0.06, 0.06, 0.06, 5, 0.20, 0.07));
  return merge(p);
}

function createChild(): THREE.BufferGeometry {
  const p: THREE.BufferGeometry[] = [];
  p.push(cyl(0.11, 0.09, 0.30, 6, 0.90));
  p.push(cyl(0.06, 0.055, 0.32, 5, 0.59, -0.06));
  p.push(cyl(0.06, 0.055, 0.32, 5, 0.59, 0.06));
  p.push(cyl(0.055, 0.05, 0.30, 5, 0.28, -0.06));
  p.push(cyl(0.055, 0.05, 0.30, 5, 0.28, 0.06));
  p.push(cyl(0.07, 0.065, 0.08, 5, 0.09, -0.06));
  p.push(cyl(0.07, 0.065, 0.08, 5, 0.09, 0.06));
  return merge(p);
}

export const BODY_ARCHETYPES: BodyArchetype[] = [
  'euro-man', 'robe-long', 'tunic-wrap', 'african-wrap-man',
  'euro-woman', 'sari-woman', 'wrap-woman', 'child',
];

export function createBodyGeometry(a: BodyArchetype): THREE.BufferGeometry {
  switch (a) {
    case 'euro-man': return createEuroMan();
    case 'robe-long': return createRobeLong();
    case 'tunic-wrap': return createTunicWrap();
    case 'african-wrap-man': return createAfricanWrapMan();
    case 'euro-woman': return createEuroWoman();
    case 'sari-woman': return createSariWoman();
    case 'wrap-woman': return createWrapWoman();
    case 'child': return createChild();
  }
}

// ── Trim bands ──────────────────────────────────────────────────────────────
// A thin contrasting band baked at sash/hem/pallu height for archetypes where
// 1612-period dress has an obvious accent. Renders as its own InstancedMesh
// using the body's matrix, so each ped gets a two-tone outfit read without
// needing per-instance textures.

export type TrimArchetype = Exclude<BodyArchetype, 'euro-man' | 'euro-woman' | 'child'>;

export const TRIM_ARCHETYPES: TrimArchetype[] = [
  'robe-long', 'tunic-wrap', 'african-wrap-man', 'sari-woman', 'wrap-woman',
];

export function isTrimArchetype(a: BodyArchetype): a is TrimArchetype {
  return a !== 'euro-man' && a !== 'euro-woman' && a !== 'child';
}

export function createTrimGeometry(a: TrimArchetype): THREE.BufferGeometry {
  switch (a) {
    // Sash at waist — slightly larger radius so it sits proud of the robe.
    case 'robe-long': {
      return cyl(0.18, 0.18, 0.07, 8, 1.10);
    }
    // Sash at waist for tunic+wrap.
    case 'tunic-wrap': {
      return cyl(0.18, 0.18, 0.06, 7, 1.00);
    }
    // Hem band on skirt — kente/kanga-style horizontal stripe near the bottom.
    case 'african-wrap-man': {
      return cyl(0.20, 0.215, 0.08, 8, 0.46);
    }
    // Pallu band — diagonal shoulder drape would need real geometry, so we
    // approximate with a horizontal stripe at upper-skirt height (where the
    // sari border falls when wrapped).
    case 'sari-woman': {
      return cyl(0.165, 0.155, 0.06, 8, 0.95);
    }
    // Hem band on the skirt for wrap-woman.
    case 'wrap-woman': {
      return cyl(0.205, 0.215, 0.06, 8, 0.32);
    }
  }
}

// ── Arm geometries (shoulder at local origin, arm hanging down -Y) ──────────
// One mesh per arm type, used for BOTH left and right via runtime matrix.

function createArm(upLen: number, upR: number, loLen: number, loR: number): THREE.BufferGeometry {
  const p: THREE.BufferGeometry[] = [];
  // Shoulder ball at origin
  p.push(sph(upR * 1.15, 6, 5, 0));
  // Upper arm — hangs from 0 to -upLen
  p.push(cyl(upR, upR * 0.9, upLen, 6, -upLen / 2));
  // Forearm — from -upLen to -(upLen+loLen)
  p.push(cyl(loR, loR * 0.85, loLen, 5, -upLen - loLen / 2));
  // Hand
  p.push(sph(loR * 1.1, 5, 4, -upLen - loLen));
  return merge(p);
}

export const ARM_TYPES: ArmType[] = ['male-long', 'male-robe', 'female', 'child'];

export function createArmGeometry(a: ArmType): THREE.BufferGeometry {
  switch (a) {
    case 'male-long': return createArm(0.36, 0.065, 0.34, 0.055);
    case 'male-robe': return createArm(0.36, 0.085, 0.34, 0.07);  // baggier sleeve
    case 'female': return createArm(0.32, 0.055, 0.30, 0.048);
    case 'child': return createArm(0.22, 0.04, 0.20, 0.035);
  }
}

// ── Per-archetype shoulder rig (arm attachment points + arm type) ───────────

export interface ShoulderRig {
  armType: ArmType;
  shoulderY: number;
  shoulderHalf: number;    // x offset (±)
  swingAmp: number;        // max swing amplitude (radians)
  armColorFromSkin: boolean; // true = arms use skin tone (bare arms)
}

export const ARCHETYPE_SHOULDER: Record<BodyArchetype, ShoulderRig> = {
  'euro-man':         { armType: 'male-long', shoulderY: 1.55, shoulderHalf: 0.22, swingAmp: 0.40, armColorFromSkin: false },
  'robe-long':        { armType: 'male-robe', shoulderY: 1.55, shoulderHalf: 0.21, swingAmp: 0.22, armColorFromSkin: false },
  'tunic-wrap':       { armType: 'male-long', shoulderY: 1.55, shoulderHalf: 0.21, swingAmp: 0.40, armColorFromSkin: false },
  'african-wrap-man': { armType: 'male-long', shoulderY: 1.55, shoulderHalf: 0.20, swingAmp: 0.40, armColorFromSkin: true  },
  'euro-woman':       { armType: 'female',    shoulderY: 1.50, shoulderHalf: 0.18, swingAmp: 0.28, armColorFromSkin: false },
  'sari-woman':       { armType: 'female',    shoulderY: 1.50, shoulderHalf: 0.17, swingAmp: 0.28, armColorFromSkin: true  },
  'wrap-woman':       { armType: 'female',    shoulderY: 1.50, shoulderHalf: 0.18, swingAmp: 0.28, armColorFromSkin: true  },
  'child':            { armType: 'child',     shoulderY: 1.05, shoulderHalf: 0.13, swingAmp: 0.45, armColorFromSkin: false },
};

// ── Head geometries (skin-tone colored) ─────────────────────────────────────

function createManHead(): THREE.BufferGeometry {
  return merge([
    sph(0.17, 10, 7, 1.78),
    cyl(0.075, 0.075, 0.12, 6, 1.64),
  ]);
}
function createWomanHead(): THREE.BufferGeometry {
  return merge([
    sph(0.155, 10, 7, 1.72),
    cyl(0.065, 0.065, 0.10, 6, 1.59),
  ]);
}
function createChildHead(): THREE.BufferGeometry {
  return merge([
    sph(0.15, 10, 7, 1.22),
    cyl(0.05, 0.05, 0.08, 6, 1.10),
  ]);
}

export function createHeadGeometry(f: FigureType): THREE.BufferGeometry {
  switch (f) {
    case 'man': return createManHead();
    case 'woman': return createWomanHead();
    case 'child': return createChildHead();
  }
}

export const HEAD_TOP_Y: Record<FigureType, number> = {
  man: 1.95, woman: 1.88, child: 1.37,
};

// ── Headwear geometries (centered at man head top y≈1.95) ───────────────────

function createFeltHat(): THREE.BufferGeometry {
  return merge([
    cyl(0.28, 0.28, 0.025, 12, 1.965),
    cyl(0.16, 0.17, 0.13, 10, 2.05),
    sph(0.02, 5, 4, 2.12),
  ]);
}
function createTurban(): THREE.BufferGeometry {
  const lower = new THREE.SphereGeometry(0.22, 12, 8); lower.scale(1, 0.55, 1); lower.translate(0, 1.98, 0);
  const upper = new THREE.SphereGeometry(0.19, 10, 7); upper.scale(1, 0.55, 1); upper.translate(0, 2.08, 0);
  return merge([lower, upper]);
}
function createKufi(): THREE.BufferGeometry {
  const dome = new THREE.SphereGeometry(0.19, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  dome.translate(0, 1.92, 0);
  return merge([dome, cyl(0.19, 0.19, 0.04, 10, 1.935)]);
}
function createStrawHat(): THREE.BufferGeometry {
  return merge([cyl(0.04, 0.32, 0.22, 12, 2.02)]);
}
function createMantilla(): THREE.BufferGeometry {
  const dome = new THREE.SphereGeometry(0.22, 12, 7, 0, Math.PI * 2, 0, Math.PI * 0.6);
  dome.scale(1.05, 0.95, 1.15);
  dome.translate(0, 1.84, -0.02);
  return merge([dome]);
}
function createHeadWrap(): THREE.BufferGeometry {
  const main = new THREE.SphereGeometry(0.21, 12, 8); main.scale(1, 0.75, 0.95); main.translate(0, 1.99, 0);
  const knot = sph(0.05, 6, 5, 2.11, 0, 0.08);
  return merge([main, knot]);
}
function createScarf(): THREE.BufferGeometry {
  return merge([cyl(0.19, 0.19, 0.09, 12, 1.83)]);
}

export const HEADWEAR_TYPES: Exclude<HeadwearType, 'none'>[] = [
  'felt-hat', 'turban', 'kufi', 'straw-hat', 'mantilla', 'head-wrap', 'scarf',
];

export function createHeadwearGeometry(h: Exclude<HeadwearType, 'none'>): THREE.BufferGeometry {
  switch (h) {
    case 'felt-hat': return createFeltHat();
    case 'turban': return createTurban();
    case 'kufi': return createKufi();
    case 'straw-hat': return createStrawHat();
    case 'mantilla': return createMantilla();
    case 'head-wrap': return createHeadWrap();
    case 'scarf': return createScarf();
  }
}

// ── Prop geometries (centered at man-reference carry points) ────────────────

function createBundle(): THREE.BufferGeometry {
  // Cloth roll — cylinder rotated to horizontal, held under right arm at waist
  const roll = new THREE.CylinderGeometry(0.09, 0.09, 0.28, 8, 1);
  roll.rotateZ(Math.PI / 2);
  roll.translate(0.27, 1.15, 0.05);
  const bind = new THREE.TorusGeometry(0.09, 0.015, 6, 10);
  bind.rotateY(Math.PI / 2);
  bind.translate(0.27, 1.15, 0.05);
  return merge([roll, bind]);
}
function createBasket(): THREE.BufferGeometry {
  // Woven basket at right hip, slightly tapered
  const body = new THREE.CylinderGeometry(0.13, 0.10, 0.18, 10, 1);
  body.translate(0.26, 1.02, 0);
  const rim = new THREE.TorusGeometry(0.13, 0.013, 6, 14);
  rim.rotateX(Math.PI / 2);
  rim.translate(0.26, 1.11, 0);
  return merge([body, rim]);
}
function createRopeCoil(): THREE.BufferGeometry {
  // Coiled rope draped over left shoulder
  const coil = new THREE.TorusGeometry(0.11, 0.025, 6, 14);
  coil.rotateZ(Math.PI / 2);
  coil.translate(-0.24, 1.48, 0.08);
  const coil2 = new THREE.TorusGeometry(0.10, 0.022, 6, 14);
  coil2.rotateZ(Math.PI / 2);
  coil2.translate(-0.24, 1.42, 0.08);
  return merge([coil, coil2]);
}
function createJar(): THREE.BufferGeometry {
  // Ceramic jar on right shoulder/upper chest
  const body = new THREE.SphereGeometry(0.10, 8, 6);
  body.scale(1, 1.15, 1);
  body.translate(0.24, 1.35, 0.06);
  const neck = cyl(0.05, 0.06, 0.08, 6, 1.48, 0.24, 0.06);
  return merge([body, neck]);
}

export const PROP_TYPES: Exclude<PropType, 'none'>[] = ['bundle', 'basket', 'rope-coil', 'jar'];

export function createPropGeometry(p: Exclude<PropType, 'none'>): THREE.BufferGeometry {
  switch (p) {
    case 'bundle': return createBundle();
    case 'basket': return createBasket();
    case 'rope-coil': return createRopeCoil();
    case 'jar': return createJar();
  }
}

// ── Clothing palettes per archetype ─────────────────────────────────────────

type ClothingEntry = { color: [number, number, number]; weight: number };

// Reweighted to push undyed cottons/linens down to ~20-25% (working/poor) and
// give dyed colors the majority. Real port crowds in 1612 had a lot more
// indigo, madder red, turmeric yellow, and saffron than the previous
// pale-dominant palettes implied. Per-region accent layering happens at
// sample time in Pedestrians.tsx (CLOTHING_ACCENTS_BY_REGION).
export const CLOTHING_BY_ARCHETYPE: Record<BodyArchetype, ClothingEntry[]> = {
  // European doublet+breeches — earthy browns/blacks with occasional dyes.
  'euro-man': [
    { color: [0.42, 0.36, 0.28], weight: 3 },  // brown wool
    { color: [0.18, 0.15, 0.12], weight: 3 },  // black
    { color: [0.30, 0.18, 0.16], weight: 2 },  // madder red
    { color: [0.20, 0.28, 0.42], weight: 2 },  // woad blue
    { color: [0.55, 0.18, 0.22], weight: 1 },  // crimson
    { color: [0.32, 0.40, 0.28], weight: 1 },  // muted green
    { color: [0.50, 0.48, 0.44], weight: 1 },  // grey
    { color: [0.62, 0.52, 0.35], weight: 1 },  // tan/buff
  ],
  // Long robe — Arab thawb / Persian khalat / Indian jama. Whites still
  // common for hot climates but no longer dominant.
  'robe-long': [
    { color: [0.92, 0.88, 0.80], weight: 3 },  // off-white cotton
    { color: [0.15, 0.22, 0.45], weight: 3 },  // indigo
    { color: [0.24, 0.40, 0.32], weight: 2 },  // forest green
    { color: [0.88, 0.58, 0.14], weight: 2 },  // saffron
    { color: [0.62, 0.18, 0.20], weight: 2 },  // madder red
    { color: [0.18, 0.15, 0.12], weight: 1 },  // black
    { color: [0.62, 0.38, 0.22], weight: 1 },  // ochre
    { color: [0.45, 0.30, 0.55], weight: 1 },  // logwood violet (rare/expensive)
  ],
  // Tunic + wrap — workwear + traders. Drop the heavy beige weighting.
  'tunic-wrap': [
    { color: [0.88, 0.82, 0.70], weight: 2 },  // undyed cotton
    { color: [0.55, 0.45, 0.32], weight: 2 },  // raw earth
    { color: [0.15, 0.22, 0.45], weight: 3 },  // indigo
    { color: [0.62, 0.30, 0.18], weight: 3 },  // madder
    { color: [0.85, 0.62, 0.15], weight: 2 },  // turmeric
    { color: [0.24, 0.40, 0.32], weight: 1 },  // myrobalan green
    { color: [0.78, 0.40, 0.18], weight: 1 },  // brick orange
    { color: [0.30, 0.22, 0.18], weight: 1 },  // dark brown
  ],
  // West African wrap — strong indigo + madder traditions, lots of yellow.
  'african-wrap-man': [
    { color: [0.15, 0.22, 0.45], weight: 4 },  // indigo (Yoruba/Soninke)
    { color: [0.62, 0.30, 0.18], weight: 3 },  // madder/camwood red
    { color: [0.85, 0.55, 0.15], weight: 3 },  // earth yellow
    { color: [0.82, 0.76, 0.62], weight: 2 },  // undyed
    { color: [0.55, 0.42, 0.28], weight: 1 },  // earth brown
    { color: [0.20, 0.55, 0.45], weight: 1 },  // teal (rare)
    { color: [0.72, 0.20, 0.18], weight: 1 },  // bright red
  ],
  // European bodice + skirt — dark dyes dominated for everyday, with deep
  // colors for merchants/middle class.
  'euro-woman': [
    { color: [0.20, 0.18, 0.15], weight: 3 },  // black
    { color: [0.38, 0.32, 0.26], weight: 2 },  // brown wool
    { color: [0.52, 0.18, 0.22], weight: 2 },  // crimson
    { color: [0.22, 0.30, 0.48], weight: 2 },  // woad blue
    { color: [0.30, 0.22, 0.32], weight: 1 },  // logwood/aubergine
    { color: [0.32, 0.40, 0.28], weight: 1 },  // muted green
    { color: [0.62, 0.32, 0.30], weight: 1 },  // dusty rose
    { color: [0.75, 0.68, 0.55], weight: 1 },  // linen apron color
  ],
  // Sari — dyed bright was normative across India. White only for widows
  // and ascetics; bumped down hard.
  'sari-woman': [
    { color: [0.78, 0.18, 0.20], weight: 3 },  // bright madder red
    { color: [0.85, 0.62, 0.12], weight: 3 },  // turmeric/saffron
    { color: [0.14, 0.20, 0.48], weight: 3 },  // indigo
    { color: [0.62, 0.18, 0.35], weight: 2 },  // lac pink
    { color: [0.24, 0.55, 0.40], weight: 2 },  // emerald green
    { color: [0.80, 0.40, 0.10], weight: 2 },  // marigold
    { color: [0.55, 0.20, 0.50], weight: 1 },  // royal purple
    { color: [0.92, 0.86, 0.74], weight: 1 },  // off-white (widow/ascetic)
  ],
  // Wrap-style skirt + bodice — used across Swahili/Malay/Arab women.
  'wrap-woman': [
    { color: [0.62, 0.22, 0.18], weight: 3 },  // madder red
    { color: [0.14, 0.20, 0.40], weight: 3 },  // indigo
    { color: [0.85, 0.62, 0.15], weight: 2 },  // turmeric
    { color: [0.78, 0.40, 0.18], weight: 2 },  // brick orange
    { color: [0.24, 0.55, 0.42], weight: 1 },  // green
    { color: [0.55, 0.20, 0.45], weight: 1 },  // purple
    { color: [0.80, 0.74, 0.60], weight: 1 },  // undyed
    { color: [0.45, 0.30, 0.20], weight: 1 },  // earth brown
  ],
  // Children — simpler clothes, often hand-me-downs in muted tones, but
  // some bright dyed pieces too.
  'child': [
    { color: [0.78, 0.72, 0.60], weight: 2 },  // undyed
    { color: [0.55, 0.44, 0.32], weight: 2 },  // earth brown
    { color: [0.72, 0.25, 0.22], weight: 2 },  // madder red
    { color: [0.30, 0.36, 0.55], weight: 2 },  // indigo
    { color: [0.85, 0.60, 0.18], weight: 1 },  // turmeric
    { color: [0.45, 0.35, 0.25], weight: 1 },  // wool brown
  ],
};

export const HEADWEAR_COLORS: Record<Exclude<HeadwearType, 'none'>, ClothingEntry[]> = {
  'felt-hat': [
    { color: [0.18, 0.15, 0.12], weight: 3 },
    { color: [0.35, 0.28, 0.20], weight: 2 },
    { color: [0.45, 0.38, 0.30], weight: 1 },
  ],
  'turban': [
    { color: [0.92, 0.88, 0.80], weight: 4 },
    { color: [0.15, 0.22, 0.45], weight: 1 },
    { color: [0.72, 0.20, 0.18], weight: 1 },
    { color: [0.24, 0.40, 0.32], weight: 1 },
    { color: [0.85, 0.62, 0.12], weight: 1 },
  ],
  'kufi': [
    { color: [0.92, 0.88, 0.80], weight: 3 },
    { color: [0.18, 0.15, 0.12], weight: 1 },
    { color: [0.24, 0.40, 0.32], weight: 1 },
    { color: [0.62, 0.30, 0.18], weight: 1 },
  ],
  'straw-hat': [
    { color: [0.82, 0.70, 0.42], weight: 3 },
    { color: [0.70, 0.58, 0.35], weight: 2 },
    { color: [0.88, 0.78, 0.55], weight: 1 },
  ],
  'mantilla': [
    { color: [0.12, 0.10, 0.10], weight: 4 },
    { color: [0.22, 0.18, 0.25], weight: 1 },
    { color: [0.80, 0.74, 0.62], weight: 1 },
  ],
  'head-wrap': [
    { color: [0.72, 0.20, 0.18], weight: 2 },
    { color: [0.15, 0.22, 0.45], weight: 2 },
    { color: [0.92, 0.88, 0.80], weight: 2 },
    { color: [0.85, 0.62, 0.12], weight: 1 },
    { color: [0.62, 0.30, 0.18], weight: 1 },
  ],
  'scarf': [
    { color: [0.72, 0.20, 0.18], weight: 2 },
    { color: [0.15, 0.22, 0.45], weight: 2 },
    { color: [0.55, 0.45, 0.32], weight: 1 },
    { color: [0.92, 0.88, 0.80], weight: 1 },
  ],
};

export const PROP_COLORS: Record<Exclude<PropType, 'none'>, ClothingEntry[]> = {
  'bundle': [
    { color: [0.88, 0.82, 0.70], weight: 3 },  // undyed cotton
    { color: [0.15, 0.22, 0.45], weight: 2 },  // indigo
    { color: [0.72, 0.20, 0.18], weight: 2 },  // madder red
    { color: [0.85, 0.62, 0.12], weight: 1 },  // turmeric
    { color: [0.45, 0.38, 0.28], weight: 1 },  // brown sack
  ],
  'basket': [
    { color: [0.70, 0.55, 0.32], weight: 3 },  // wicker tan
    { color: [0.60, 0.45, 0.25], weight: 2 },  // darker reed
    { color: [0.82, 0.68, 0.40], weight: 1 },  // pale straw
  ],
  'rope-coil': [
    { color: [0.75, 0.62, 0.40], weight: 3 },  // hemp tan
    { color: [0.62, 0.50, 0.32], weight: 2 },  // weathered
    { color: [0.55, 0.42, 0.28], weight: 1 },  // dark tar
  ],
  'jar': [
    { color: [0.58, 0.38, 0.25], weight: 3 },  // terracotta
    { color: [0.42, 0.30, 0.22], weight: 2 },  // dark ceramic
    { color: [0.72, 0.55, 0.38], weight: 1 },  // pale clay
  ],
};

// ── Profile assignment (culture × figureType × pedestrianType → archetype) ──

type Weighted<T> = { value: T; weight: number };

function pickWeighted<T>(opts: Weighted<T>[], rng: () => number): T {
  let total = 0;
  for (const o of opts) total += o.weight;
  let r = rng() * total;
  for (const o of opts) {
    r -= o.weight;
    if (r <= 0) return o.value;
  }
  return opts[opts.length - 1].value;
}

function bodyOptions(culture: Culture, fig: FigureType, ped: PedestrianType): Weighted<BodyArchetype>[] {
  if (fig === 'child') return [{ value: 'child', weight: 1 }];

  if (culture === 'European') {
    if (fig === 'man') {
      if (ped === 'religious') return [{ value: 'robe-long', weight: 3 }, { value: 'euro-man', weight: 1 }];
      return [{ value: 'euro-man', weight: 1 }];
    }
    return [{ value: 'euro-woman', weight: 1 }];
  }

  if (culture === 'Indian Ocean') {
    if (fig === 'man') {
      if (ped === 'merchant' || ped === 'religious') {
        return [{ value: 'robe-long', weight: 3 }, { value: 'tunic-wrap', weight: 1 }];
      }
      return [{ value: 'tunic-wrap', weight: 3 }, { value: 'robe-long', weight: 1 }];
    }
    return [{ value: 'sari-woman', weight: 1 }];
  }

  if (culture === 'West African') {
    if (fig === 'man') {
      if (ped === 'religious') return [{ value: 'robe-long', weight: 2 }, { value: 'african-wrap-man', weight: 1 }];
      return [{ value: 'african-wrap-man', weight: 3 }, { value: 'tunic-wrap', weight: 1 }];
    }
    return [{ value: 'wrap-woman', weight: 1 }];
  }

  // Atlantic
  if (fig === 'man') {
    if (ped === 'religious') return [{ value: 'robe-long', weight: 2 }, { value: 'euro-man', weight: 1 }];
    if (ped === 'farmer' || ped === 'laborer') {
      return [{ value: 'tunic-wrap', weight: 2 }, { value: 'euro-man', weight: 1 }];
    }
    return [{ value: 'euro-man', weight: 1 }];
  }
  return [{ value: 'euro-woman', weight: 2 }, { value: 'wrap-woman', weight: 1 }];
}

function headwearOptions(culture: Culture, fig: FigureType, ped: PedestrianType): Weighted<HeadwearType>[] {
  if (fig === 'child') {
    return [{ value: 'none', weight: 4 }, { value: 'straw-hat', weight: 1 }];
  }

  if (culture === 'European') {
    if (fig === 'man') {
      if (ped === 'farmer') return [{ value: 'straw-hat', weight: 3 }, { value: 'felt-hat', weight: 1 }, { value: 'none', weight: 1 }];
      if (ped === 'sailor') return [{ value: 'scarf', weight: 2 }, { value: 'none', weight: 2 }, { value: 'felt-hat', weight: 1 }];
      if (ped === 'religious') return [{ value: 'none', weight: 1 }];
      return [{ value: 'felt-hat', weight: 3 }, { value: 'none', weight: 2 }];
    }
    return [{ value: 'mantilla', weight: 3 }, { value: 'head-wrap', weight: 1 }, { value: 'none', weight: 1 }];
  }

  if (culture === 'Indian Ocean') {
    if (fig === 'man') {
      if (ped === 'farmer') return [{ value: 'straw-hat', weight: 2 }, { value: 'head-wrap', weight: 2 }, { value: 'none', weight: 1 }];
      if (ped === 'merchant') return [{ value: 'turban', weight: 3 }, { value: 'kufi', weight: 1 }];
      if (ped === 'religious') return [{ value: 'turban', weight: 2 }, { value: 'kufi', weight: 2 }];
      if (ped === 'sailor') return [{ value: 'scarf', weight: 2 }, { value: 'turban', weight: 1 }, { value: 'none', weight: 1 }];
      return [{ value: 'head-wrap', weight: 2 }, { value: 'kufi', weight: 1 }, { value: 'none', weight: 1 }];
    }
    return [{ value: 'head-wrap', weight: 3 }, { value: 'none', weight: 2 }];
  }

  if (culture === 'West African') {
    if (fig === 'man') {
      if (ped === 'farmer') return [{ value: 'straw-hat', weight: 2 }, { value: 'none', weight: 2 }];
      if (ped === 'merchant') return [{ value: 'kufi', weight: 2 }, { value: 'none', weight: 2 }];
      if (ped === 'religious') return [{ value: 'kufi', weight: 3 }, { value: 'none', weight: 1 }];
      return [{ value: 'none', weight: 3 }, { value: 'kufi', weight: 1 }];
    }
    return [{ value: 'head-wrap', weight: 4 }, { value: 'none', weight: 1 }];
  }

  // Atlantic
  if (fig === 'man') {
    if (ped === 'farmer') return [{ value: 'straw-hat', weight: 3 }, { value: 'none', weight: 2 }];
    if (ped === 'sailor') return [{ value: 'scarf', weight: 2 }, { value: 'none', weight: 2 }];
    if (ped === 'merchant') return [{ value: 'felt-hat', weight: 2 }, { value: 'none', weight: 2 }];
    if (ped === 'religious') return [{ value: 'none', weight: 1 }];
    return [{ value: 'none', weight: 2 }, { value: 'scarf', weight: 1 }, { value: 'straw-hat', weight: 1 }];
  }
  return [{ value: 'head-wrap', weight: 2 }, { value: 'mantilla', weight: 1 }, { value: 'none', weight: 2 }];
}

function propOptions(fig: FigureType, ped: PedestrianType): Weighted<PropType>[] {
  if (fig === 'child') return [{ value: 'none', weight: 1 }];
  switch (ped) {
    case 'merchant':  return [{ value: 'bundle', weight: 3 }, { value: 'none', weight: 2 }];
    case 'farmer':    return [{ value: 'basket', weight: 3 }, { value: 'none', weight: 2 }];
    case 'sailor':    return [{ value: 'rope-coil', weight: 2 }, { value: 'none', weight: 3 }];
    case 'laborer':   return [{ value: 'jar', weight: 2 }, { value: 'bundle', weight: 1 }, { value: 'none', weight: 3 }];
    case 'religious': return [{ value: 'none', weight: 1 }];
  }
}

export function assignVisualProfile(
  culture: Culture, fig: FigureType, ped: PedestrianType, rng: () => number,
): VisualProfile {
  return {
    body: pickWeighted(bodyOptions(culture, fig, ped), rng),
    headwear: pickWeighted(headwearOptions(culture, fig, ped), rng),
    prop: pickWeighted(propOptions(fig, ped), rng),
  };
}
