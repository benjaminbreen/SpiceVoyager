import { useMemo, useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '../store/gameStore';
import type { BuildingStyle } from '../utils/portArchetypes';

interface Part {
  geo: 'box' | 'cylinder' | 'cone' | 'sphere' | 'dome';
  mat: 'white' | 'mud' | 'wood' | 'terracotta' | 'stone' | 'straw' | 'dark';
  pos: [number, number, number];
  scale: [number, number, number];
  rot: [number, number, number];
  color?: [number, number, number];
}

interface TorchSpot {
  pos: [number, number, number];
}

interface SmokeSpot {
  pos: [number, number, number];
  seed: number; // per-chimney offset for staggered animation
}

// Simple seeded random for deterministic color variation
function mulberry32(a: number) {
  return function() {
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const BASE_COLORS: Record<string, [number, number, number]> = {
  white: [0.94, 0.94, 0.94],
  mud: [0.76, 0.63, 0.47],
  wood: [0.36, 0.25, 0.20],
  terracotta: [0.80, 0.36, 0.36],
  stone: [0.53, 0.53, 0.53],
  straw: [0.83, 0.75, 0.48],
  dark: [0.12, 0.10, 0.08],
};

function varyColor(base: [number, number, number], rng: () => number, amount = 0.08): [number, number, number] {
  return [
    Math.max(0, Math.min(1, base[0] + (rng() - 0.5) * amount)),
    Math.max(0, Math.min(1, base[1] + (rng() - 0.5) * amount)),
    Math.max(0, Math.min(1, base[2] + (rng() - 0.5) * amount)),
  ];
}

// ── Culture-specific color palettes ──────────────────────────────────────────
// Each building randomly selects a base wall color from its culture's palette.
// Weighted by repeating common colors. Historically grounded for c. 1612.

const WALL_PALETTES: Record<string, [number, number, number][]> = {
  'Indian Ocean': [
    [0.76, 0.63, 0.47],  // mud brick
    [0.76, 0.63, 0.47],  // mud brick (weighted)
    [0.90, 0.86, 0.78],  // whitewashed lime
    [0.90, 0.86, 0.78],  // whitewashed lime (weighted)
    [0.80, 0.74, 0.68],  // coral stone (Swahili coast)
    [0.84, 0.74, 0.56],  // aged ochre plaster
  ],
  'European': [
    [0.94, 0.92, 0.88],  // clean white
    [0.94, 0.92, 0.88],  // clean white (weighted)
    [0.95, 0.90, 0.78],  // warm cream
    [0.96, 0.88, 0.62],  // Goa golden yellow
    [0.84, 0.87, 0.93],  // Portuguese blue-white
    [0.93, 0.80, 0.76],  // terracotta pink (Macau)
  ],
  'West African': [
    [0.72, 0.55, 0.35],  // banco (sun-dried earth)
    [0.72, 0.55, 0.35],  // banco (weighted)
    [0.68, 0.50, 0.30],  // laterite clay
    [0.80, 0.68, 0.48],  // pale dried mud
    [0.62, 0.48, 0.32],  // dark rammed earth
    [0.75, 0.62, 0.42],  // ochre-washed
  ],
  'Atlantic': [
    [0.92, 0.90, 0.84],  // whitewashed colonial
    [0.92, 0.90, 0.84],  // whitewashed colonial (weighted)
    [0.88, 0.82, 0.68],  // warm stucco
    [0.94, 0.86, 0.62],  // golden plaster
    [0.42, 0.30, 0.22],  // dark tropical wood
    [0.50, 0.40, 0.28],  // weathered hardwood
  ],
};

interface RoofStyle {
  color: [number, number, number];
  geo: 'box' | 'cone';
  h: number;
  mat?: Part['mat'];   // optional material override (defaults to terracotta for cone, mud for box)
}

const ROOF_PALETTES: Record<string, RoofStyle[]> = {
  'Indian Ocean': [
    { color: [0.72, 0.60, 0.45], geo: 'box', h: 0.4 },   // flat mud
    { color: [0.72, 0.60, 0.45], geo: 'box', h: 0.4 },   // flat mud (weighted)
    { color: [0.88, 0.84, 0.76], geo: 'box', h: 0.35 },  // whitewashed flat
    { color: [0.78, 0.70, 0.42], geo: 'cone', h: 1.2 },  // palm thatch
  ],
  'European': [
    { color: [0.80, 0.36, 0.36], geo: 'cone', h: 1.5 },  // classic terracotta
    { color: [0.80, 0.36, 0.36], geo: 'cone', h: 1.5 },  // terracotta (weighted)
    { color: [0.70, 0.30, 0.28], geo: 'cone', h: 1.5 },  // aged dark terracotta
    { color: [0.48, 0.48, 0.55], geo: 'cone', h: 1.3 },  // slate grey
  ],
  'West African': [
    { color: [0.68, 0.55, 0.36], geo: 'box', h: 0.35 },  // flat earthen
    { color: [0.68, 0.55, 0.36], geo: 'box', h: 0.35 },  // flat earthen (weighted)
    { color: [0.74, 0.64, 0.38], geo: 'cone', h: 1.4 },  // conical thatch (Sudano-Sahelian)
    { color: [0.70, 0.58, 0.32], geo: 'cone', h: 1.6 },  // tall thatch
  ],
  'Atlantic': [
    { color: [0.80, 0.36, 0.36], geo: 'cone', h: 1.5 },  // terracotta tile (Iberian influence)
    { color: [0.80, 0.36, 0.36], geo: 'cone', h: 1.5 },  // terracotta tile (weighted)
    { color: [0.36, 0.25, 0.20], geo: 'cone', h: 1.5 },  // dark wood shingle
    { color: [0.78, 0.70, 0.42], geo: 'cone', h: 1.3 },  // palm thatch
  ],
};

// Portuguese colonial shutter colors (Goa, Macau)
const EU_SHUTTER_COLORS: [number, number, number][] = [
  [0.20, 0.35, 0.58],  // Portuguese blue
  [0.22, 0.45, 0.30],  // forest green
  [0.65, 0.50, 0.20],  // ochre
  [0.55, 0.15, 0.12],  // ox-blood red
  [0.35, 0.30, 0.25],  // dark brown
];

// Dyed fabric colors for market awnings
const AWNING_COLORS: Record<string, [number, number, number][]> = {
  'Indian Ocean': [
    [0.72, 0.22, 0.15],  // madder red
    [0.20, 0.35, 0.55],  // indigo
    [0.85, 0.65, 0.15],  // turmeric gold
    [0.60, 0.25, 0.40],  // lac dye purple
  ],
  'European': [
    [0.75, 0.25, 0.20],  // Portuguese red
    [0.80, 0.72, 0.45],  // canvas/linen
    [0.25, 0.35, 0.50],  // navy
  ],
  'West African': [
    [0.20, 0.30, 0.52],  // indigo (kente/adire)
    [0.75, 0.20, 0.12],  // camwood red
    [0.82, 0.70, 0.18],  // kola-nut gold
    [0.55, 0.35, 0.18],  // tanned hide
  ],
  'Atlantic': [
    [0.75, 0.25, 0.20],  // dyed red
    [0.80, 0.72, 0.45],  // raw canvas
    [0.22, 0.38, 0.28],  // dark green
    [0.60, 0.40, 0.22],  // bark cloth
  ],
};

// ── Building Style Registry ──────────────────────────────────────────────────
// Visual sub-styles per port, decoupled from `culture` (which still drives
// gameplay and fort/market/dock rendering). A style picks wall palette, roof
// profile, and a weighted mix of house variants with cheap geometric features.

interface HouseVariant {
  weight: number;
  scaleMul?: [number, number, number];      // multiplier on base [w, h, d]
  roofGeoOverride?: 'box' | 'cone';
  roofHMul?: number;
  features?: {
    stilts?: boolean;              // 4 thin posts under the main box
    roundHut?: boolean;            // cylinder walls + cone roof (replaces rectangle)
    flatRoofParapet?: boolean;     // flat roof with thin parapet lip (no cone)
    deepEaves?: boolean;           // cone radius wider than wall footprint
    windCatcher?: boolean;         // small upright box on top (badgir)
    veranda?: boolean;             // thin slab porch from the front face
  };
}

interface BuildingStyleDef {
  wallPalette: [number, number, number][];
  roofPalette: RoofStyle[];
  houseVariants: HouseVariant[];
  shutterPalette?: [number, number, number][];
  wallMatHint?: Part['mat'];       // material for roughness; color overrides per-instance
}

const DEFAULT_HOUSE_VARIANTS: HouseVariant[] = [{ weight: 1 }];

// Darker shutter set for Dutch / English — no bright Portuguese colors
const NORTHERN_SHUTTERS: [number, number, number][] = [
  [0.18, 0.22, 0.18],  // dark forest green
  [0.22, 0.18, 0.15],  // near-black
  [0.28, 0.22, 0.18],  // dark brown
];

const BUILDING_STYLES: Partial<Record<BuildingStyle, BuildingStyleDef>> = {
  'iberian': {
    wallPalette: [
      [0.94, 0.92, 0.88], [0.94, 0.92, 0.88], [0.94, 0.92, 0.88],
      [0.95, 0.90, 0.78], [0.93, 0.86, 0.74],
    ],
    roofPalette: [
      { color: [0.80, 0.36, 0.36], geo: 'cone', h: 1.1 },
      { color: [0.80, 0.36, 0.36], geo: 'cone', h: 1.1 },
      { color: [0.72, 0.32, 0.28], geo: 'cone', h: 1.0 },
    ],
    houseVariants: [
      { weight: 0.65 },
      { weight: 0.35, scaleMul: [1.2, 0.9, 1.2] },
    ],
    shutterPalette: EU_SHUTTER_COLORS,
    wallMatHint: 'white',
  },
  'dutch-brick': {
    wallPalette: [
      [0.60, 0.32, 0.24], [0.60, 0.32, 0.24], [0.60, 0.32, 0.24],
      [0.68, 0.40, 0.30], [0.52, 0.26, 0.20],
      [0.82, 0.76, 0.66],  // occasional whitewash
    ],
    roofPalette: [
      { color: [0.28, 0.22, 0.20], geo: 'cone', h: 1.7 },
      { color: [0.28, 0.22, 0.20], geo: 'cone', h: 1.7 },
      { color: [0.38, 0.30, 0.26], geo: 'cone', h: 1.6 },
    ],
    houseVariants: [
      { weight: 0.65, scaleMul: [0.7, 1.35, 0.75] },
      { weight: 0.35 },
    ],
    shutterPalette: NORTHERN_SHUTTERS,
    wallMatHint: 'mud',
  },
  'english-tudor': {
    // Pre-1666 London: wattle-and-daub infill between exposed dark oak frames,
    // sooted by sea-coal smoke. Whitewash was uncommon outside wealthy parishes.
    wallPalette: [
      [0.74, 0.66, 0.52],   // sooty cream daub (dominant)
      [0.74, 0.66, 0.52],
      [0.68, 0.60, 0.46],   // grimier daub
      [0.62, 0.54, 0.40],   // smoke-darkened daub
      [0.82, 0.74, 0.58],   // freshly limewashed (rare, wealthier houses)
      [0.34, 0.24, 0.16],   // exposed dark oak frame
    ],
    // Pre-1666 London: thatch and wood shingle dominate. Tile was a luxury,
    // not yet mandated. Soot from sea-coal hearths blackened most roofs.
    roofPalette: [
      { color: [0.46, 0.38, 0.24], geo: 'cone', h: 1.7, mat: 'straw' }, // weathered sooty thatch (dominant)
      { color: [0.46, 0.38, 0.24], geo: 'cone', h: 1.7, mat: 'straw' },
      { color: [0.38, 0.32, 0.22], geo: 'cone', h: 1.8, mat: 'straw' }, // soot-blackened thatch
      { color: [0.55, 0.46, 0.30], geo: 'cone', h: 1.7, mat: 'straw' }, // newer dry thatch (occasional)
      { color: [0.32, 0.26, 0.20], geo: 'cone', h: 1.5, mat: 'wood' },  // dark wood shingle
      { color: [0.40, 0.42, 0.34], geo: 'cone', h: 1.5, mat: 'wood' },  // moss-greened shingle
      { color: [0.52, 0.30, 0.22], geo: 'cone', h: 1.4 },               // clay tile (the wealthy minority)
    ],
    // Variety matters at Huge scale: cramped tall City rowhouses, standard
    // two-bay cottages, and squat outer-parish dwellings.
    houseVariants: [
      { weight: 0.30, scaleMul: [0.75, 1.45, 0.85] },                    // tall narrow jettied rowhouse
      { weight: 0.30 },                                                  // standard two-bay
      { weight: 0.20, scaleMul: [1.15, 1.05, 1.10] },                    // larger merchant house
      { weight: 0.15, scaleMul: [1.30, 0.80, 1.30] },                    // squat outer-parish cottage
      { weight: 0.05, scaleMul: [0.90, 1.70, 1.00] },                    // landmark-tall (church/inn read)
    ],
    shutterPalette: NORTHERN_SHUTTERS,
    wallMatHint: 'white',
  },
  'luso-colonial': {
    wallPalette: [
      [0.94, 0.92, 0.88], [0.94, 0.92, 0.88],
      [0.96, 0.88, 0.62],   // Goa yellow
      [0.84, 0.87, 0.93],   // Portuguese blue-white
      [0.93, 0.80, 0.76],   // Macau pink
    ],
    roofPalette: [
      { color: [0.80, 0.36, 0.36], geo: 'cone', h: 1.3 },
      { color: [0.80, 0.36, 0.36], geo: 'cone', h: 1.3 },
      { color: [0.70, 0.30, 0.28], geo: 'cone', h: 1.3 },
    ],
    houseVariants: [
      { weight: 0.75 },
      { weight: 0.25, features: { veranda: true } },
    ],
    shutterPalette: EU_SHUTTER_COLORS,
    wallMatHint: 'white',
  },
  'swahili-coral': {
    wallPalette: [
      [0.94, 0.92, 0.86], [0.94, 0.92, 0.86],
      [0.82, 0.76, 0.70],
      [0.88, 0.82, 0.72],
    ],
    roofPalette: [
      { color: [0.85, 0.80, 0.70], geo: 'box', h: 0.35 },
    ],
    houseVariants: [
      { weight: 0.7, scaleMul: [1.15, 0.85, 1.15], features: { flatRoofParapet: true } },
      { weight: 0.3, features: { flatRoofParapet: true } },
    ],
    wallMatHint: 'white',
  },
  'arab-cubic': {
    wallPalette: [
      [0.92, 0.88, 0.78], [0.92, 0.88, 0.78],
      [0.84, 0.74, 0.56],
      [0.76, 0.63, 0.47],
    ],
    roofPalette: [
      { color: [0.78, 0.70, 0.58], geo: 'box', h: 0.35 },
    ],
    houseVariants: [
      { weight: 0.6, scaleMul: [0.8, 1.3, 0.8], features: { flatRoofParapet: true } },
      { weight: 0.4, features: { flatRoofParapet: true } },
    ],
    wallMatHint: 'white',
  },
  'persian-gulf': {
    wallPalette: [
      [0.76, 0.63, 0.47], [0.76, 0.63, 0.47],
      [0.80, 0.68, 0.48],
      [0.70, 0.55, 0.40],
    ],
    roofPalette: [
      { color: [0.72, 0.60, 0.42], geo: 'box', h: 0.35 },
    ],
    houseVariants: [
      { weight: 0.70, features: { flatRoofParapet: true } },
      { weight: 0.30, features: { flatRoofParapet: true, windCatcher: true } },
    ],
    wallMatHint: 'mud',
  },
  'malabar-hindu': {
    wallPalette: [
      [0.68, 0.50, 0.35], [0.68, 0.50, 0.35],   // laterite
      [0.78, 0.64, 0.48],
      [0.84, 0.74, 0.56],
    ],
    roofPalette: [
      { color: [0.42, 0.30, 0.22], geo: 'cone', h: 1.2 },
      { color: [0.42, 0.30, 0.22], geo: 'cone', h: 1.2 },
      { color: [0.55, 0.42, 0.28], geo: 'cone', h: 1.3 },
    ],
    houseVariants: [
      { weight: 0.6, features: { deepEaves: true } },
      { weight: 0.4, scaleMul: [1.0, 0.85, 1.0], features: { deepEaves: true } },
    ],
    wallMatHint: 'mud',
  },
  'mughal-gujarati': {
    wallPalette: [
      [0.94, 0.86, 0.62], [0.94, 0.86, 0.62],
      [0.88, 0.82, 0.68],
      [0.90, 0.86, 0.78],
    ],
    roofPalette: [
      { color: [0.70, 0.30, 0.28], geo: 'cone', h: 1.2 },
      { color: [0.80, 0.36, 0.36], geo: 'cone', h: 1.2 },
    ],
    houseVariants: [
      { weight: 0.7 },
      { weight: 0.3, scaleMul: [1.2, 1.0, 1.2] },
    ],
    wallMatHint: 'white',
  },
  'malay-stilted': {
    wallPalette: [
      [0.42, 0.30, 0.22], [0.42, 0.30, 0.22],
      [0.52, 0.40, 0.28],
      [0.62, 0.50, 0.36],
    ],
    roofPalette: [
      { color: [0.78, 0.70, 0.42], geo: 'cone', h: 1.5 },
      { color: [0.70, 0.60, 0.38], geo: 'cone', h: 1.5 },
    ],
    houseVariants: [
      { weight: 0.75, features: { stilts: true } },
      { weight: 0.25, scaleMul: [1.2, 0.9, 1.2], features: { stilts: true } },
    ],
    wallMatHint: 'wood',
  },
  'west-african-round': {
    wallPalette: [
      [0.72, 0.55, 0.35], [0.72, 0.55, 0.35],
      [0.68, 0.50, 0.30], [0.80, 0.68, 0.48],
      [0.62, 0.48, 0.32],
    ],
    roofPalette: [
      { color: [0.74, 0.64, 0.38], geo: 'cone', h: 1.5 },
      { color: [0.70, 0.58, 0.32], geo: 'cone', h: 1.6 },
    ],
    houseVariants: [
      { weight: 0.8, features: { roundHut: true } },
      { weight: 0.2 },
    ],
    wallMatHint: 'mud',
  },
  'luso-brazilian': {
    wallPalette: [
      [0.92, 0.90, 0.84], [0.92, 0.90, 0.84],
      [0.88, 0.82, 0.68],
      [0.94, 0.86, 0.62],
      [0.62, 0.48, 0.32],   // taipa/wattle-daub mix
    ],
    roofPalette: [
      { color: [0.80, 0.36, 0.36], geo: 'cone', h: 1.0 },
      { color: [0.80, 0.36, 0.36], geo: 'cone', h: 1.0 },
      { color: [0.70, 0.58, 0.32], geo: 'cone', h: 1.3 },   // thatch mix
    ],
    houseVariants: [
      { weight: 0.50, scaleMul: [1.25, 0.9, 1.25], features: { veranda: true } },
      { weight: 0.35 },
      { weight: 0.15, scaleMul: [0.9, 0.85, 0.9] },
    ],
    shutterPalette: EU_SHUTTER_COLORS,
    wallMatHint: 'white',
  },
  'spanish-caribbean': {
    wallPalette: [
      [0.92, 0.90, 0.84], [0.92, 0.90, 0.84],
      [0.88, 0.82, 0.68],
      [0.70, 0.55, 0.38],
    ],
    roofPalette: [
      { color: [0.80, 0.36, 0.36], geo: 'cone', h: 1.1 },
      { color: [0.78, 0.70, 0.42], geo: 'cone', h: 1.4 },
      { color: [0.72, 0.60, 0.36], geo: 'cone', h: 1.5 },
    ],
    houseVariants: [
      { weight: 0.35, features: { veranda: true } },
      { weight: 0.30 },
      { weight: 0.35, scaleMul: [0.85, 0.8, 0.85], roofGeoOverride: 'cone', roofHMul: 1.3 },
    ],
    shutterPalette: EU_SHUTTER_COLORS,
    wallMatHint: 'white',
  },
  'khoikhoi-minimal': {
    wallPalette: [
      [0.70, 0.60, 0.45], [0.70, 0.60, 0.45],
      [0.65, 0.55, 0.40],
    ],
    roofPalette: [
      { color: [0.78, 0.70, 0.42], geo: 'cone', h: 1.0 },
    ],
    houseVariants: [
      { weight: 1, scaleMul: [0.7, 0.7, 0.7] },
    ],
    wallMatHint: 'mud',
  },
};

function cultureToFallbackStyle(culture: string): BuildingStyleDef {
  const wallPalette = WALL_PALETTES[culture] ?? WALL_PALETTES['Indian Ocean'];
  const roofPalette = ROOF_PALETTES[culture] ?? ROOF_PALETTES['Indian Ocean'];
  const wallMatHint: Part['mat'] =
    culture === 'Indian Ocean' || culture === 'West African' ? 'mud'
    : culture === 'European' || culture === 'Atlantic' ? 'white'
    : 'wood';
  const shutterPalette = (culture === 'European' || culture === 'Atlantic') ? EU_SHUTTER_COLORS : undefined;
  return { wallPalette, roofPalette, houseVariants: DEFAULT_HOUSE_VARIANTS, shutterPalette, wallMatHint };
}

function resolveStyle(styleId: string | undefined, culture: string): BuildingStyleDef {
  if (styleId && BUILDING_STYLES[styleId as BuildingStyle]) {
    return BUILDING_STYLES[styleId as BuildingStyle]!;
  }
  return cultureToFallbackStyle(culture);
}

function pickVariant(variants: HouseVariant[], rng: () => number): HouseVariant {
  const total = variants.reduce((s, v) => s + v.weight, 0);
  let r = rng() * total;
  for (const v of variants) {
    r -= v.weight;
    if (r <= 0) return v;
  }
  return variants[variants.length - 1];
}

export function ProceduralCity() {
  const ports = useGameStore(s => s.ports);

  // Dark material created separately for per-frame emissive updates (window glow).
  // polygonOffset biases these decal-like parts forward so they don't z-fight with
  // the wall face they sit against (doors/windows are placed at wall + 0.05).
  const darkMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#1e1a14',
    roughness: 0.95,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  }), []);

  // Animate window glow based on time of day
  useFrame(() => {
    const timeOfDay = useGameStore.getState().timeOfDay;
    const sunAngle = ((timeOfDay - 6) / 24) * Math.PI * 2;
    const sunH = Math.sin(sunAngle);
    // Ramp up glow as sun drops below horizon
    const nightFactor = Math.max(0, Math.min(1, (0.1 - sunH) / 0.3));
    darkMat.emissive.setRGB(0.95, 0.6, 0.2);
    darkMat.emissiveIntensity = nightFactor * 0.7;
  });

  // Build all geometry parts + collect torch positions
  const { parts, torchSpots, smokeSpots } = useMemo(() => {
    const allParts: Part[] = [];
    const torches: TorchSpot[] = [];
    const smokeSpots: SmokeSpot[] = [];

    ports.forEach(port => {
      let fortSeen = false;

      port.buildings.forEach((b, bi) => {
        const [w, h, d] = b.scale;
        const [x, y, z] = b.position;
        const rot = b.rotation;
        const c = port.culture;
        const rng = mulberry32(bi * 7919 + (x * 1000 | 0) + (z * 31 | 0));

        const addPart = (geo: Part['geo'], mat: Part['mat'], lx: number, ly: number, lz: number, sw: number, sh: number, sd: number, colorOverride?: [number, number, number]) => {
          const rx = lx * Math.cos(rot) - lz * Math.sin(rot);
          const rz = lx * Math.sin(rot) + lz * Math.cos(rot);
          allParts.push({
            geo, mat,
            pos: [x + rx, y + ly, z + rz],
            scale: [sw, sh, sd],
            rot: [0, rot, 0],
            color: colorOverride ?? varyColor(BASE_COLORS[mat] ?? BASE_COLORS.dark, rng),
          });
        };

        // Helper to add a torch at a local offset from this building
        const addTorch = (lx: number, ly: number, lz: number) => {
          const rx = lx * Math.cos(rot) - lz * Math.sin(rot);
          const rz = lx * Math.sin(rot) + lz * Math.cos(rot);
          torches.push({ pos: [x + rx, y + ly, z + rz] });
          // Torch bracket (small wood cylinder)
          addPart('cylinder', 'wood', lx, ly - 0.3, lz, 0.08, 0.6, 0.08);
        };

        // Uniform-scale a range of parts around a landmark anchor in local coords.
        // Used to bump culture landmarks (minarets, cathedrals, star forts, etc.) so
        // they read more clearly against the surrounding generic buildings.
        const scaleLandmark = (startIdx: number, lax: number, laz: number, S: number) => {
          const rx = lax * Math.cos(rot) - laz * Math.sin(rot);
          const rz = lax * Math.sin(rot) + laz * Math.cos(rot);
          const ax = x + rx, ay = y, az = z + rz;
          for (let i = startIdx; i < allParts.length; i++) {
            const p = allParts[i];
            p.pos = [
              ax + (p.pos[0] - ax) * S,
              ay + (p.pos[1] - ay) * S,
              az + (p.pos[2] - az) * S,
            ];
            p.scale = [p.scale[0] * S, p.scale[1] * S, p.scale[2] * S];
          }
        };
        const LM_SCALE = 1.3;

        if (b.type === 'dock') {
          const deckColor = varyColor(BASE_COLORS.wood, rng, 0.06);
          addPart('box', 'wood', 0, 0, 0, w, 0.2, d, deckColor);
          const pileColor = varyColor(BASE_COLORS.wood, rng, 0.1);
          addPart('cylinder', 'wood', w/2-0.2, -1, d/2-0.2, 0.2, 3, 0.2, pileColor);
          addPart('cylinder', 'wood', -w/2+0.2, -1, d/2-0.2, 0.2, 3, 0.2, pileColor);
          addPart('cylinder', 'wood', w/2-0.2, -1, -d/2+0.2, 0.2, 3, 0.2, pileColor);
          addPart('cylinder', 'wood', -w/2+0.2, -1, -d/2+0.2, 0.2, 3, 0.2, pileColor);
          // Mooring posts
          addPart('cylinder', 'wood', w/2, 0.4, 0, 0.12, 0.8, 0.12);
          addPart('cylinder', 'wood', -w/2, 0.4, 0, 0.12, 0.8, 0.12);
          // Crates on dock
          addPart('box', 'wood', w/4, 0.4, d/4, 0.5, 0.5, 0.5, varyColor(BASE_COLORS.wood, rng, 0.12));
          addPart('box', 'wood', -w/4, 0.4, -d/4, 0.4, 0.4, 0.4, varyColor(BASE_COLORS.wood, rng, 0.12));
          // Moored boat — small hull shape
          const boatSide = rng() > 0.5 ? 1 : -1;
          const boatColor = varyColor(BASE_COLORS.wood, rng, 0.15);
          addPart('box', 'wood', boatSide * (w/2 + 1.5), -0.3, d * 0.2, 0.8, 0.5, 2.5, boatColor);
          // Boat bow (small tapered cone)
          addPart('cone', 'wood', boatSide * (w/2 + 1.5), -0.1, d * 0.2 + 1.4, 0.4, 0.4, 0.3, boatColor);
          // Torch at end of dock
          addTorch(0, 1.4, d/2 - 0.3);
        }
        else if (b.type === 'fort') {
          // West African forts (Elmina, Luanda) are Portuguese-built stone;
          // Indian Ocean forts use mud brick
          const mat = c === 'Indian Ocean' ? 'mud' : 'stone';
          const wallColor = varyColor(BASE_COLORS[mat], rng, 0.06);
          addPart('box', mat, 0, h/2, 0, w, h, d, wallColor);
          // Corner towers
          const towerColor = varyColor(BASE_COLORS[mat], rng, 0.04);
          addPart('cylinder', mat, w/2, h/2+1, d/2, 1.5, h+2, 1.5, towerColor);
          addPart('cylinder', mat, -w/2, h/2+1, d/2, 1.5, h+2, 1.5, towerColor);
          addPart('cylinder', mat, w/2, h/2+1, -d/2, 1.5, h+2, 1.5, towerColor);
          addPart('cylinder', mat, -w/2, h/2+1, -d/2, 1.5, h+2, 1.5, towerColor);
          // Gate
          addPart('box', 'dark', 0, h*0.35, d/2+0.05, 2.5, h*0.6, 0.15);
          // Battlements on top
          for (let bx = -w/2 + 1; bx <= w/2 - 1; bx += 2) {
            addPart('box', mat, bx, h + 0.5, d/2, 0.6, 1, 0.6, towerColor);
            addPart('box', mat, bx, h + 0.5, -d/2, 0.6, 1, 0.6, towerColor);
          }

          // ── Flags on two front towers ──
          // Port-specific flagColor takes precedence over culture default.
          const flagColor: [number, number, number] = port.flagColor ?? (
            c === 'Indian Ocean'
              ? [0.15, 0.55, 0.25]   // green
              : c === 'European' || c === 'West African' || c === 'Atlantic'
                ? [0.85, 0.15, 0.15] // red (Portuguese/Spanish default)
                : [0.2, 0.2, 0.7]    // blue
          );
          const drawFlag = (px: number) => {
            addPart('cylinder', 'wood', px, h + 3.5, d/2, 0.06, 3, 0.06);
            addPart('box', 'straw', px + 0.45, h + 4.5, d/2, 0.8, 0.5, 0.05, flagColor);
            // St George's cross overlay (London) — thin red cross on white field
            if (port.landmark === 'tower-of-london') {
              const red: [number, number, number] = [0.78, 0.10, 0.10];
              addPart('box', 'straw', px + 0.45, h + 4.5, d/2 - 0.01, 0.8, 0.12, 0.05, red); // horizontal bar
              addPart('box', 'straw', px + 0.45, h + 4.5, d/2 - 0.01, 0.18, 0.5, 0.05, red); // vertical bar
            }
            // Prinsenvlag white+blue stripes (Amsterdam) — thin overlay bands
            if (port.landmark === 'oude-kerk-spire') {
              addPart('box', 'straw', px + 0.45, h + 4.5, d/2 - 0.01, 0.8, 0.16, 0.05, [0.95, 0.95, 0.92]); // white middle
              addPart('box', 'straw', px + 0.45, h + 4.34, d/2 - 0.01, 0.8, 0.16, 0.05, [0.10, 0.20, 0.55]); // blue bottom
            }
          };
          drawFlag(w/2);
          drawFlag(-w/2);

          // ── Torches flanking gate ──
          addTorch(1.8, h * 0.7, d/2 + 0.3);
          addTorch(-1.8, h * 0.7, d/2 + 0.3);

          // ── Culture-specific landmark (once per port) ──
          if (!fortSeen) {
            fortSeen = true;
            if (c === 'Indian Ocean') {
              const lm = port.landmark;
              if (lm === 'al-shadhili-mosque') {
                // Mocha — al-Shadhili shrine. Single tall whitewashed minaret with
                // square base + slim cylindrical shaft + onion dome. Low domed
                // prayer hall beside it (Sufi shrine of the man who introduced coffee).
                const wash = varyColor([0.94, 0.92, 0.86], rng, 0.04);
                const lx = w/2 + 4, lz = -d/2;
                const _lmStart = allParts.length;
                // Square minaret base
                addPart('box', 'white', lx, 1.5, lz, 1.6, 3, 1.6, wash);
                // Slim cylindrical shaft
                addPart('cylinder', 'white', lx, 6.5, lz, 0.6, 7, 0.6, wash);
                // Gallery (muezzin's ring)
                addPart('cylinder', 'white', lx, 10.2, lz, 0.85, 0.4, 0.85, wash);
                // Capped pavilion
                addPart('cylinder', 'white', lx, 11.0, lz, 0.5, 1.0, 0.5, wash);
                // Onion dome
                addPart('sphere', 'white', lx, 12.0, lz, 0.55, 0.9, 0.55, wash);
                // Spire finial
                addPart('cone', 'straw', lx, 13.0, lz, 0.12, 0.6, 0.12, [0.85, 0.75, 0.2]);
                // Adjacent low domed prayer hall (the shrine itself)
                addPart('box', 'white', lx + 2.5, 1.5, lz, 4, 3, 4, wash);
                addPart('dome', 'white', lx + 2.5, 3.0, lz, 1.6, 1.6, 1.6, wash);
                scaleLandmark(_lmStart, lx, lz, LM_SCALE);
              } else if (lm === 'grand-mosque-tiered') {
                // Bantam — five stacked Javanese-Chinese roofs over square base, no minaret.
                // Distinctive multi-tiered "meru" silhouette unlike any Arabian mosque.
                const wall = varyColor([0.86, 0.78, 0.62], rng, 0.04);
                const tile: [number, number, number] = [0.30, 0.22, 0.18];
                const lx = w/2 + 5, lz = -d/2;
                const _lmStart = allParts.length;
                // Main square hall
                addPart('box', 'white', lx, 2, lz, 6, 4, 6, wall);
                // Five stacked tapering roofs
                const roofs: [number, number, number, number][] = [
                  // [yCenter, halfH, halfW, halfD]
                  [4.6, 0.5, 4.0, 4.0],
                  [5.6, 0.45, 3.3, 3.3],
                  [6.5, 0.4, 2.6, 2.6],
                  [7.3, 0.35, 1.9, 1.9],
                  [8.0, 0.3, 1.3, 1.3],
                ];
                for (const [yc, hh, hw, hd] of roofs) {
                  addPart('cone', 'wood', lx, yc, lz, hw, hh * 2, hd, tile);
                }
                // Tiny cap finial
                addPart('cylinder', 'wood', lx, 8.5, lz, 0.15, 0.5, 0.15, [0.55, 0.45, 0.30]);
                // Low surrounding wall (sahn)
                addPart('box', 'white', lx, 0.4, lz + 4.5, 6, 0.8, 0.3, wall);
                addPart('box', 'white', lx, 0.4, lz - 4.5, 6, 0.8, 0.3, wall);
                scaleLandmark(_lmStart, lx, lz, LM_SCALE);
              } else if (lm === 'fort-jesus') {
                // Mombasa — Portuguese star fort with four pointed angular bastions.
                // Replaces the generic minaret. Coral-stone color (already swahili-coral),
                // angular bastions distinguish it from the rounded-tower generic fort.
                const wall = varyColor([0.88, 0.84, 0.74], rng, 0.04);
                const lx = w/2 + 6, lz = -d/2;
                const fortW = 7, fortH = 5;
                const _lmStart = allParts.length;
                // Central courtyard block
                addPart('box', 'white', lx, fortH/2, lz, fortW, fortH, fortW, wall);
                // Four angular bastions — boxes rotated 45° (using cylinder w/4 segments)
                // We use square boxes set at corners for the angular star effect.
                const bRad = 1.6;
                const corners: [number, number][] = [
                  [fortW/2, fortW/2], [-fortW/2, fortW/2],
                  [fortW/2, -fortW/2], [-fortW/2, -fortW/2],
                ];
                for (const [cx, cz] of corners) {
                  // Diamond-shaped bastion (4-sided cylinder)
                  addPart('cylinder', 'white', lx + cx, fortH/2 + 0.5, lz + cz, bRad, fortH + 1, bRad, wall);
                  // Cap with low pyramid
                  addPart('cone', 'stone', lx + cx, fortH + 1.4, lz + cz, bRad + 0.1, 0.6, bRad + 0.1, [0.55, 0.55, 0.55]);
                }
                // Main gate
                addPart('box', 'dark', lx, fortH * 0.35, lz + fortW/2 + 0.05, 1.6, fortH * 0.55, 0.15);
                // Portuguese flag on the seafront bastion
                addPart('cylinder', 'wood', lx + fortW/2, fortH + 4, lz + fortW/2, 0.06, 3, 0.06);
                addPart('box', 'straw', lx + fortW/2 + 0.45, fortH + 5, lz + fortW/2, 0.8, 0.5, 0.05, [0.85, 0.15, 0.15]);
                scaleLandmark(_lmStart, lx, lz, LM_SCALE);
              } else if (lm === 'calicut-gopuram') {
                // Calicut — Kerala Hindu shrine. Square teak sanctum on a stone
                // plinth, two pyramidal copper-clad roofs weathered green, and a
                // tall brass dhvajastambha (flag mast) beside the entrance.
                // Distinct from the Bantam meru: fewer tiers, broader eaves,
                // copper-green rather than dark tile, standalone flag mast.
                const laterite = varyColor([0.78, 0.55, 0.38], rng, 0.04);
                const teak = varyColor([0.45, 0.30, 0.20], rng, 0.05);
                const copper: [number, number, number] = [0.32, 0.58, 0.52];
                const brass: [number, number, number] = [0.82, 0.68, 0.28];
                const lx = w/2 + 5, lz = -d/2;
                const _lmStart = allParts.length;
                // Stepped stone plinth (adhisthana)
                addPart('box', 'mud', lx, 0.4, lz, 6, 0.8, 6, laterite);
                addPart('box', 'mud', lx, 1.1, lz, 5, 0.6, 5, laterite);
                // Square teak sanctum
                addPart('box', 'wood', lx, 2.5, lz, 4, 2, 4, teak);
                // First copper-pyramidal roof (deep eaves)
                addPart('cone', 'wood', lx, 4.3, lz, 3.2, 1.4, 3.2, copper);
                // Upper tier
                addPart('box', 'wood', lx, 5.3, lz, 2.4, 0.8, 2.4, teak);
                addPart('cone', 'wood', lx, 6.3, lz, 2.0, 1.0, 2.0, copper);
                // Brass stupi finial
                addPart('cylinder', 'wood', lx, 7.1, lz, 0.15, 0.6, 0.15, brass);
                addPart('cone', 'wood', lx, 7.7, lz, 0.3, 0.5, 0.3, brass);
                // Dhvajastambha — tall brass flag mast beside the sanctum
                addPart('cylinder', 'wood', lx + 3.6, 3.5, lz, 0.12, 7, 0.12, brass);
                addPart('cone', 'wood', lx + 3.6, 7.2, lz, 0.22, 0.6, 0.22, brass);
                scaleLandmark(_lmStart, lx, lz, LM_SCALE);
              } else {
                // Default — minaret (used by all Arab/Persian/Mughal mosque ports without specific landmark)
                const mColor = varyColor([0.88, 0.82, 0.72], rng, 0.05);
                const _lmStart = allParts.length;
                addPart('cylinder', 'white', w/2 + 4, h/2 + 4, -d/2, 0.9, 10, 0.9, mColor);
                addPart('cylinder', 'white', w/2 + 4, h/2 + 8.5, -d/2, 1.2, 0.4, 1.2, mColor);
                addPart('dome', 'white', w/2 + 4, h/2 + 8.7, -d/2, 1.1, 1.1, 1.1, mColor);
                addPart('sphere', 'straw', w/2 + 4, h/2 + 10.0, -d/2, 0.2, 0.2, 0.2, [0.85, 0.75, 0.2]);
                scaleLandmark(_lmStart, w/2 + 4, -d/2, LM_SCALE);
              }
            } else if (c === 'European' || c === 'Atlantic') {
              const lm = port.landmark;
              if (lm === 'tower-of-london') {
                // White Tower — square Norman keep, four corner turrets, no chapel/cross.
                // Placed offset from the generic fort so the silhouette reads separately.
                const stoneColor = varyColor([0.88, 0.86, 0.80], rng, 0.04);
                const lx = -w/2 - 6, lz = 0;
                const keepW = 5, keepH = 9;
                const _lmStart = allParts.length;
                // Main keep
                addPart('box', 'white', lx, keepH/2, lz, keepW, keepH, keepW, stoneColor);
                // Four corner turrets — slightly taller, capped with low pyramid
                const turretH = keepH + 2;
                const turretR = 0.7;
                const corners: [number, number][] = [
                  [keepW/2 - turretR*0.5, keepW/2 - turretR*0.5],
                  [-keepW/2 + turretR*0.5, keepW/2 - turretR*0.5],
                  [keepW/2 - turretR*0.5, -keepW/2 + turretR*0.5],
                  [-keepW/2 + turretR*0.5, -keepW/2 + turretR*0.5],
                ];
                for (const [cx, cz] of corners) {
                  addPart('cylinder', 'white', lx + cx, turretH/2, lz + cz, turretR, turretH, turretR, stoneColor);
                  addPart('cone', 'stone', lx + cx, turretH + 0.4, lz + cz, turretR + 0.1, 0.9, turretR + 0.1, [0.55, 0.55, 0.58]);
                }
                // Royal standard on the central roof
                addPart('cylinder', 'wood', lx, keepH + 1.5, lz, 0.08, 3, 0.08);
                addPart('box', 'straw', lx + 0.5, keepH + 2.5, lz, 1.0, 0.6, 0.05, [0.85, 0.10, 0.10]);
                scaleLandmark(_lmStart, lx, lz, LM_SCALE);
              } else if (lm === 'belem-tower') {
                // Torre de Belém — slim 4-tier limestone tower on the waterline.
                const stone = varyColor([0.92, 0.88, 0.78], rng, 0.04);
                const lx = -w/2 - 5, lz = 0;
                const _lmStart = allParts.length;
                addPart('box', 'white', lx, 1.0, lz, 4, 2, 4, stone);                  // bastion plinth
                addPart('box', 'white', lx, 4.0, lz, 2.6, 4, 2.6, stone);              // main shaft
                addPart('box', 'white', lx, 7.5, lz, 2.2, 3, 2.2, stone);              // upper stage
                addPart('box', 'white', lx, 10.0, lz, 1.8, 2, 1.8, stone);             // belvedere
                // Four corner bartizans on the upper stage
                for (const [cx, cz] of [[1.0, 1.0], [-1.0, 1.0], [1.0, -1.0], [-1.0, -1.0]] as [number, number][]) {
                  addPart('cylinder', 'white', lx + cx, 8.5, lz + cz, 0.35, 1.2, 0.35, stone);
                  addPart('cone', 'stone', lx + cx, 9.4, lz + cz, 0.45, 0.7, 0.45, [0.60, 0.55, 0.50]);
                }
                // Cross-topped finial
                addPart('cone', 'stone', lx, 11.5, lz, 0.9, 1.2, 0.9, [0.55, 0.55, 0.55]);
                addPart('box', 'stone', lx, 12.6, lz, 0.10, 0.6, 0.10);
                scaleLandmark(_lmStart, lx, lz, LM_SCALE);
              } else if (lm === 'oude-kerk-spire') {
                // Oude Kerk — squat brick church body with very tall thin wooden carillon spire.
                const brick = varyColor([0.55, 0.32, 0.24], rng, 0.05);
                const lead: [number, number, number] = [0.40, 0.42, 0.45];
                const lx = -w/2 - 5, lz = 0;
                const _lmStart = allParts.length;
                // Nave block (long rectangle)
                addPart('box', 'mud', lx, 2.0, lz, 4, 4, 7, brick);
                // Pitched lead roof over nave
                addPart('cone', 'stone', lx, 5.2, lz, 2.4, 1.8, 4.0, lead);
                // Square tower at one end
                addPart('box', 'mud', lx, 3.5, lz - 4.5, 2.4, 7, 2.4, brick);
                // Tall slim wooden spire — three stacked tapering segments + needle
                addPart('cone', 'wood', lx, 8.5, lz - 4.5, 1.4, 2.0, 1.4, lead);
                addPart('cylinder', 'wood', lx, 10.5, lz - 4.5, 0.5, 2.0, 0.5, lead);
                addPart('cone', 'wood', lx, 12.5, lz - 4.5, 0.7, 1.6, 0.7, lead);
                addPart('cone', 'wood', lx, 14.8, lz - 4.5, 0.25, 3.0, 0.25, lead);   // needle
                scaleLandmark(_lmStart, lx, lz, LM_SCALE);
              } else if (lm === 'old-st-pauls') {
                // Old St Paul's — massive square Gothic tower (spire lost to lightning 1561).
                const stone = varyColor([0.78, 0.74, 0.66], rng, 0.04);
                const lx = -w/2 - 6, lz = 0;
                const _lmStart = allParts.length;
                addPart('box', 'white', lx, 5, lz, 6, 10, 6, stone);
                addPart('box', 'white', lx, 11.5, lz, 5, 3, 5, stone);     // upper stage
                // Four pinnacles
                for (const [cx, cz] of [[2.2, 2.2], [-2.2, 2.2], [2.2, -2.2], [-2.2, -2.2]] as [number, number][]) {
                  addPart('cone', 'stone', lx + cx, 13.5, lz + cz, 0.3, 1.5, 0.3, [0.55, 0.55, 0.55]);
                }
                scaleLandmark(_lmStart, lx, lz, LM_SCALE);
              } else if (lm === 'jesuit-college') {
                // Salvador — Jesuit college (1583), the dominant upper-town building.
                // Long whitewashed two-story block, central pediment, twin bell towers,
                // distinctive Brazilian baroque cross. Sits inland of the fort.
                const wash = varyColor([0.93, 0.91, 0.84], rng, 0.04);
                const tile: [number, number, number] = [0.55, 0.28, 0.22];
                const lx = -w/2 - 7, lz = 0;
                const _lmStart = allParts.length;
                // Main long block (two stories)
                addPart('box', 'white', lx, 3.0, lz, 10, 6, 5, wash);
                // Central pediment / facade gable
                addPart('box', 'white', lx, 6.5, lz + 2.5, 4, 1.0, 0.3, wash);
                addPart('cone', 'terracotta', lx, 7.5, lz + 2.4, 2.5, 1.0, 0.4, tile);
                // Hipped tile roof over the long block
                addPart('cone', 'terracotta', lx, 7.0, lz, 5.5, 1.6, 3.0, tile);
                // Twin bell towers flanking the facade
                for (const tx of [-3.5, 3.5]) {
                  addPart('box', 'white', lx + tx, 4.5, lz + 1.8, 1.6, 9, 1.6, wash);
                  // Open belfry stage
                  addPart('box', 'white', lx + tx, 9.6, lz + 1.8, 1.4, 1.4, 1.4, [0.85, 0.82, 0.74]);
                  // Pyramidal cap
                  addPart('cone', 'terracotta', lx + tx, 11.0, lz + 1.8, 1.0, 1.6, 1.0, tile);
                  // Cross finial
                  addPart('box', 'stone', lx + tx, 12.4, lz + 1.8, 0.10, 0.8, 0.10);
                  addPart('box', 'stone', lx + tx, 12.6, lz + 1.8, 0.5, 0.10, 0.10);
                }
                // Central facade door
                addPart('box', 'dark', lx, 1.5, lz + 2.55, 1.2, 2.6, 0.10);
                scaleLandmark(_lmStart, lx, lz, LM_SCALE);
              } else if (lm === 'palacio-inquisicion') {
                // Cartagena — Tribunal of the Holy Office (chartered 1610). Whitewashed
                // colonial palace, two stories, deep wooden balcony along the front,
                // tall central portal topped by the Inquisition shield.
                const wash = varyColor([0.95, 0.93, 0.86], rng, 0.04);
                const tile: [number, number, number] = [0.62, 0.30, 0.24];
                const woodTrim = varyColor([0.30, 0.20, 0.14], rng, 0.05);
                const lx = -w/2 - 6, lz = 0;
                const _lmStart = allParts.length;
                // Main palace block
                addPart('box', 'white', lx, 2.5, lz, 9, 5, 6, wash);
                // Hipped tile roof
                addPart('cone', 'terracotta', lx, 5.7, lz, 5.0, 1.4, 3.5, tile);
                // Tall ornamental central portal (carved stone doorway)
                addPart('box', 'white', lx, 3.0, lz + 3.05, 2.2, 6, 0.25, [0.84, 0.78, 0.62]);
                addPart('box', 'dark', lx, 2.0, lz + 3.20, 1.4, 4, 0.10);
                // Inquisition shield above the portal (small dark plaque + cross)
                addPart('box', 'dark', lx, 5.4, lz + 3.20, 0.9, 0.9, 0.10);
                addPart('box', 'stone', lx, 5.4, lz + 3.30, 0.10, 0.7, 0.05);
                addPart('box', 'stone', lx, 5.4, lz + 3.30, 0.5, 0.10, 0.05);
                // Long second-story wooden balcony spanning the front (the famous one)
                addPart('box', 'wood', lx, 3.4, lz + 3.20, 8, 0.2, 0.7, woodTrim);
                // Balcony railing posts
                for (const bx of [-3.0, -1.5, 0.0, 1.5, 3.0]) {
                  if (Math.abs(bx) < 0.6) continue; // skip portal area
                  addPart('cylinder', 'wood', lx + bx, 3.9, lz + 3.45, 0.06, 1.0, 0.06, woodTrim);
                }
                // Balcony top rail
                addPart('box', 'wood', lx, 4.4, lz + 3.45, 8, 0.08, 0.08, woodTrim);
                // Small bell-cote on the roof ridge (no full tower — convent church annex)
                addPart('box', 'white', lx + 3.5, 6.5, lz - 0.5, 0.9, 1.6, 0.9, wash);
                addPart('cone', 'terracotta', lx + 3.5, 7.6, lz - 0.5, 0.7, 0.8, 0.7, tile);
                scaleLandmark(_lmStart, lx, lz, LM_SCALE);
              } else if (lm === 'bom-jesus-basilica') {
                // Goa — Basilica of Bom Jesus (completed 1605), holding
                // Francis Xavier's body. Single-nave Jesuit church: tiled
                // pitched roof, tall facade gable with three stacked pediments,
                // square bell tower on the right flank, central portal.
                // Whitewashed in 1612 (the laterite was only exposed centuries later).
                const wash = varyColor([0.94, 0.92, 0.86], rng, 0.04);
                const tile: [number, number, number] = [0.52, 0.28, 0.22];
                const lx = -w/2 - 7, lz = 0;
                const _lmStart = allParts.length;
                // Long nave block
                addPart('box', 'white', lx, 3.0, lz, 4, 6, 9, wash);
                // Tile pitched roof over nave
                addPart('cone', 'terracotta', lx, 7.0, lz, 2.2, 1.6, 5.0, tile);
                // Tall facade front (raised gable end, taller than nave)
                addPart('box', 'white', lx, 4.5, lz + 4.5, 5, 9, 0.4, wash);
                // Three stacked pediments narrowing upward
                addPart('box', 'white', lx, 9.2, lz + 4.5, 3.4, 0.5, 0.4, wash);
                addPart('cone', 'terracotta', lx, 10.0, lz + 4.5, 1.8, 1.0, 0.4, tile);
                addPart('box', 'white', lx, 10.8, lz + 4.5, 1.8, 0.4, 0.4, wash);
                addPart('cone', 'terracotta', lx, 11.4, lz + 4.5, 0.9, 0.8, 0.4, tile);
                // Central portal
                addPart('box', 'dark', lx, 1.8, lz + 4.75, 1.3, 3.2, 0.2);
                // Bell tower on the right flank
                addPart('box', 'white', lx + 3.0, 4.0, lz + 3.0, 2, 8, 2, wash);
                addPart('cone', 'terracotta', lx + 3.0, 8.8, lz + 3.0, 1.3, 1.4, 1.3, tile);
                // Cross finial on the bell tower
                addPart('box', 'stone', lx + 3.0, 10.0, lz + 3.0, 0.10, 0.7, 0.10);
                addPart('box', 'stone', lx + 3.0, 10.1, lz + 3.0, 0.5, 0.10, 0.10);
                scaleLandmark(_lmStart, lx, lz, LM_SCALE);
              } else if (lm === 'diu-fortress') {
                // Diu — Portuguese sea-fortress (1535). Long linear curtain
                // wall along the shore, four diamond bastions, central square
                // keep. Limestone/coral color. Positioned parallel to the
                // water so it reads as a coastal wall, not a compact fort.
                const wall = varyColor([0.88, 0.84, 0.72], rng, 0.04);
                const lx = w/2 + 6, lz = 0;
                const wallLen = 14, wallH = 4;
                const _lmStart = allParts.length;
                // Long curtain wall running parallel to the shore
                addPart('box', 'white', lx, wallH/2, lz, 3, wallH, wallLen, wall);
                // Four bastions spaced along the wall
                const bastionZ = [-5.0, -1.7, 1.7, 5.0];
                for (const bz of bastionZ) {
                  addPart('cylinder', 'white', lx + 1.5, wallH/2 + 0.3, lz + bz, 1.6, wallH + 0.6, 1.6, wall);
                  addPart('cone', 'stone', lx + 1.5, wallH + 0.9, lz + bz, 1.7, 0.5, 1.7, [0.55, 0.55, 0.55]);
                }
                // Central keep rising above the wall
                addPart('box', 'white', lx - 0.5, wallH + 1.5, lz, 3.5, wallH, 3.5, wall);
                addPart('cone', 'stone', lx - 0.5, wallH * 2 + 1.9, lz, 2.2, 0.8, 2.2, [0.60, 0.58, 0.54]);
                // Seaward gate through the wall
                addPart('box', 'dark', lx + 1.5, wallH * 0.3, lz, 0.2, wallH * 0.5, 1.6);
                // Portuguese flag on the keep
                addPart('cylinder', 'wood', lx - 0.5, wallH * 2 + 3.5, lz, 0.08, 3, 0.08);
                addPart('box', 'straw', lx - 0.05, wallH * 2 + 4.5, lz, 0.9, 0.6, 0.05, [0.85, 0.15, 0.15]);
                scaleLandmark(_lmStart, lx, lz, LM_SCALE);
              } else if (lm === 'giralda-tower') {
                // Seville — the Giralda. 12th-c. Almohad minaret (tall warm-
                // ochre brick square shaft) topped by a Renaissance Christian
                // belfry stage, tapered drum + dome + Giraldillo weathervane.
                const almohad = varyColor([0.82, 0.62, 0.42], rng, 0.04);
                const renaissance = varyColor([0.92, 0.88, 0.78], rng, 0.03);
                const lx = -w/2 - 5, lz = 0;
                const shaftW = 3.2, shaftH = 16;
                const _lmStart = allParts.length;
                // Short square plinth
                addPart('box', 'white', lx, 0.6, lz, shaftW + 0.4, 1.2, shaftW + 0.4, almohad);
                // Tall square Almohad shaft
                addPart('box', 'white', lx, shaftH/2 + 1.2, lz, shaftW, shaftH, shaftW, almohad);
                // String-course band separating Almohad from Christian addition
                addPart('box', 'white', lx, shaftH + 1.3, lz, shaftW + 0.2, 0.3, shaftW + 0.2, [0.55, 0.45, 0.30]);
                // Renaissance belfry stage
                addPart('box', 'white', lx, shaftH + 2.8, lz, shaftW - 0.5, 2.4, shaftW - 0.5, renaissance);
                // Next narrowing stage
                addPart('box', 'white', lx, shaftH + 4.6, lz, shaftW - 1.0, 1.2, shaftW - 1.0, renaissance);
                // Upper circular drum
                addPart('cylinder', 'white', lx, shaftH + 5.8, lz, (shaftW - 1.4) * 0.5, 1.2, (shaftW - 1.4) * 0.5, renaissance);
                // Tapered dome
                addPart('cone', 'stone', lx, shaftH + 7.0, lz, (shaftW - 1.6) * 0.5, 1.6, (shaftW - 1.6) * 0.5, [0.60, 0.55, 0.45]);
                // Giraldillo finial — brass figure on spike
                addPart('cylinder', 'wood', lx, shaftH + 8.0, lz, 0.08, 1.2, 0.08, [0.75, 0.65, 0.30]);
                addPart('box', 'straw', lx, shaftH + 8.6, lz, 0.4, 0.4, 0.05, [0.85, 0.75, 0.35]);
                scaleLandmark(_lmStart, lx, lz, LM_SCALE);
              } else {
                // Default for European/Atlantic colonial ports — small chapel near fort.
                addPart('box', 'stone', w/2, h + 5.5, d/2, 0.15, 1.8, 0.15);
                addPart('box', 'stone', w/2, h + 6.0, d/2, 0.8, 0.15, 0.15);
                const _lmStart = allParts.length;
                const chapelColor = varyColor(BASE_COLORS.white, rng, 0.06);
                addPart('box', 'white', -w/2 - 4, h * 0.4, 0, 3, h * 0.8, 4, chapelColor);
                addPart('cone', 'terracotta', -w/2 - 4, h * 0.8 + 1, 0, 2.5, 2, 3.2, varyColor(BASE_COLORS.terracotta, rng, 0.08));
                addPart('box', 'white', -w/2 - 4, h * 0.8 + 2.5, -2.2, 1, 3, 1, chapelColor);
                addPart('cone', 'stone', -w/2 - 4, h * 0.8 + 4.5, -2.2, 0.8, 1.5, 0.8);
                addPart('box', 'stone', -w/2 - 4, h * 0.8 + 5.5, -2.2, 0.1, 0.8, 0.1);
                addPart('box', 'stone', -w/2 - 4, h * 0.8 + 5.8, -2.2, 0.5, 0.1, 0.1);
                scaleLandmark(_lmStart, -w/2 - 4, 0, LM_SCALE);
              }
            } else if (c === 'West African') {
              const lm = port.landmark;
              if (lm === 'elmina-castle') {
                // Elmina — São Jorge da Mina (1482), oldest European building
                // south of the Sahara. Square whitewashed curtain wall with
                // corner bastions, central keep, seaward gate, Portuguese
                // standard flying over the keep.
                const wash = varyColor([0.92, 0.88, 0.78], rng, 0.04);
                const lx = -w/2 - 7, lz = 0;
                const castleW = 8, wallH = 4;
                const _lmStart = allParts.length;
                // Low curtain wall / courtyard block
                addPart('box', 'white', lx, wallH/2, lz, castleW, wallH, castleW, wash);
                // Central rectangular keep rising above the wall
                addPart('box', 'white', lx, wallH + 2, lz - 1, castleW - 3, 4, castleW - 3, wash);
                // Crenellated upper stage on the keep
                addPart('box', 'white', lx, wallH + 4.4, lz - 1, castleW - 4.2, 0.8, castleW - 4.2, [0.86, 0.82, 0.72]);
                // Four corner bastions
                const bRad = 1.1;
                const corners: [number, number][] = [
                  [castleW/2, castleW/2], [-castleW/2, castleW/2],
                  [castleW/2, -castleW/2], [-castleW/2, -castleW/2],
                ];
                for (const [cx, cz] of corners) {
                  addPart('cylinder', 'white', lx + cx, wallH/2 + 0.4, lz + cz, bRad, wallH + 0.8, bRad, wash);
                  addPart('cone', 'stone', lx + cx, wallH + 1.2, lz + cz, bRad + 0.1, 0.5, bRad + 0.1, [0.55, 0.55, 0.55]);
                }
                // Seaward gate
                addPart('box', 'dark', lx, wallH * 0.35, lz + castleW/2 + 0.05, 1.6, wallH * 0.55, 0.15);
                // Portuguese standard on the keep
                addPart('cylinder', 'wood', lx, wallH + 7.0, lz - 1, 0.08, 3, 0.08);
                addPart('box', 'straw', lx + 0.5, wallH + 8.0, lz - 1, 0.9, 0.6, 0.05, [0.85, 0.15, 0.15]);
                scaleLandmark(_lmStart, lx, lz, LM_SCALE);
              } else {
                // Palaver tree — large trunk with spreading canopy near the fort
                // Central gathering place in Akan/coastal settlements
                const trunkColor = varyColor(BASE_COLORS.wood, rng, 0.08);
                const _lmStart = allParts.length;
                addPart('cylinder', 'wood', -w/2 - 5, 2.5, 0, 0.6, 5, 0.6, trunkColor);
                // Broad canopy (flattened sphere)
                addPart('sphere', 'straw', -w/2 - 5, 6.0, 0, 4.0, 2.5, 4.0, varyColor([0.28, 0.42, 0.18], rng, 0.08));
                // Low circular seating wall around the tree
                const seatColor = varyColor([0.65, 0.50, 0.32], rng, 0.06);
                addPart('cylinder', 'mud', -w/2 - 5, 0.2, 0, 2.8, 0.4, 2.8, seatColor);
                scaleLandmark(_lmStart, -w/2 - 5, 0, LM_SCALE);
              }
            }
          }
        }
        else if (b.type === 'market') {
          addPart('box', 'wood', 0, 0.2, 0, w, 0.4, d);
          addPart('cylinder', 'wood', w/2-0.5, h/2, d/2-0.5, 0.3, h, 0.3);
          addPart('cylinder', 'wood', -w/2+0.5, h/2, d/2-0.5, 0.3, h, 0.3);
          addPart('cylinder', 'wood', w/2-0.5, h/2, -d/2+0.5, 0.3, h, 0.3);
          addPart('cylinder', 'wood', -w/2+0.5, h/2, -d/2+0.5, 0.3, h, 0.3);

          if (c === 'Indian Ocean') {
            addPart('dome', 'mud', 0, h, 0, w/2, w/2, d/2);
          } else if (c === 'European') {
            addPart('cone', 'terracotta', 0, h+1, 0, w/1.5, 2, d/1.5);
          } else if (c === 'West African') {
            // Broad conical thatch canopy — open-air market shelter
            addPart('cone', 'straw', 0, h+0.8, 0, w/1.2, 2.2, d/1.2, varyColor(BASE_COLORS.straw, rng, 0.10));
          } else {
            addPart('cone', 'wood', 0, h+1, 0, w/1.5, 2, d/1.5);
          }
          // Awnings — each side picks from culture-specific dyed fabric colors
          const awningPalette = AWNING_COLORS[c] ?? AWNING_COLORS['Indian Ocean'];
          const awning1 = varyColor(awningPalette[Math.floor(rng() * awningPalette.length)], rng, 0.08);
          const awning2 = varyColor(awningPalette[Math.floor(rng() * awningPalette.length)], rng, 0.08);
          addPart('box', 'straw', w/2-0.5, h*0.55, 0, 1.2, 0.08, d*0.7, awning1);
          addPart('box', 'straw', -w/2+0.5, h*0.55, 0, 1.2, 0.08, d*0.7, awning2);
          // Counter/table
          addPart('box', 'wood', 0, 1.0, 0, w*0.5, 0.15, d*0.4);
          // Goods on counter — varied spice/textile colors
          addPart('box', 'straw', 0.4, 1.2, 0.2, 0.3, 0.25, 0.3, varyColor([0.85, 0.65, 0.2], rng, 0.15));
          addPart('box', 'straw', -0.3, 1.2, -0.1, 0.25, 0.2, 0.25, varyColor([0.6, 0.3, 0.15], rng, 0.15));
          addPart('box', 'straw', 0.1, 1.2, -0.3, 0.2, 0.18, 0.2, varyColor([0.35, 0.55, 0.25], rng, 0.12));

          // Torches at market corners
          addTorch(w/2 - 0.3, h + 0.5, d/2 - 0.3);
          addTorch(-w/2 + 0.3, h + 0.5, d/2 - 0.3);
        }
        else if (b.type === 'shack') {
          // Shacks use rougher, more varied materials
          const shackWallPalette: [number,number,number][] = c === 'Indian Ocean'
            ? [[0.55, 0.40, 0.28], [0.62, 0.48, 0.32], [0.70, 0.58, 0.42], [0.48, 0.38, 0.25]]
            : c === 'West African'
            ? [[0.68, 0.50, 0.30], [0.72, 0.55, 0.35], [0.60, 0.45, 0.28], [0.65, 0.52, 0.33]]
            : [[0.36, 0.25, 0.20], [0.42, 0.30, 0.22], [0.50, 0.38, 0.26], [0.38, 0.28, 0.18]];
          const wallColor = varyColor(shackWallPalette[Math.floor(rng() * shackWallPalette.length)], rng, 0.08);
          const roofColor = varyColor(BASE_COLORS.straw, rng, 0.12);
          if (c === 'West African') {
            // Round mud hut with conical thatch roof
            const radius = Math.min(w, d) / 2;
            addPart('cylinder', 'mud', 0, h/2, 0, radius, h, radius, wallColor);
            addPart('cone', 'straw', 0, h + 0.8, 0, radius * 1.3, 1.6, radius * 1.3, roofColor);
            // Doorway
            addPart('box', 'dark', 0, h*0.3, radius+0.05, 0.5, h*0.55, 0.1);
          } else if (c === 'Indian Ocean') {
            // Stilted shack
            addPart('cylinder', 'wood', w/2-0.2, 0.5, d/2-0.2, 0.1, 1, 0.1);
            addPart('cylinder', 'wood', -w/2+0.2, 0.5, d/2-0.2, 0.1, 1, 0.1);
            addPart('cylinder', 'wood', w/2-0.2, 0.5, -d/2+0.2, 0.1, 1, 0.1);
            addPart('cylinder', 'wood', -w/2+0.2, 0.5, -d/2+0.2, 0.1, 1, 0.1);
            addPart('box', 'wood', 0, 1.5, 0, w, h, d, wallColor);
            addPart('cone', 'straw', 0, 1.5+h/2+0.5, 0, w/1.2, 1, d/1.2, roofColor);
            addPart('box', 'dark', 0, 1.3, d/2+0.05, 0.6, 1.0, 0.1);
          } else {
            addPart('box', 'wood', 0, h/2, 0, w, h, d, wallColor);
            addPart('cone', 'straw', 0, h+0.5, 0, w/1.2, 1, d/1.2, roofColor);
            addPart('box', 'dark', 0, h*0.35, d/2+0.05, 0.6, h*0.6, 0.1);
            addPart('box', 'dark', w/2+0.05, h*0.55, 0, 0.1, 0.4, 0.5);
          }
        }
        else {
          // ── House, Warehouse, Estate, Farmhouse ── (style-driven)
          const style = resolveStyle(port.buildingStyle, c);
          const wallBase = style.wallPalette[Math.floor(rng() * style.wallPalette.length)];
          const wallColor = varyColor(wallBase, rng, 0.05);
          const wallMat: Part['mat'] = style.wallMatHint ?? 'white';
          const shutters = style.shutterPalette;

          // Select a weighted house variant. House/farmhouse respect every
          // feature; estate/warehouse pick a variant for proportions but skip
          // silhouette-changing features (stilts/roundHut/windCatcher) that
          // would look wrong on a large rectangular building.
          let variant: HouseVariant;
          if (b.type === 'house' || b.type === 'farmhouse') {
            variant = pickVariant(style.houseVariants, rng);
          } else if (b.type === 'estate' || b.type === 'warehouse') {
            const picked = pickVariant(style.houseVariants, rng);
            variant = {
              weight: picked.weight,
              scaleMul: picked.scaleMul,
              roofGeoOverride: picked.roofGeoOverride,
              roofHMul: picked.roofHMul,
            };
          } else {
            variant = { weight: 1 };
          }
          const sm = variant.scaleMul ?? [1, 1, 1];
          const sw = w * sm[0];
          const sh = h * sm[1];
          const sd = d * sm[2];

          // Roof: farmhouse always thatch-cone; others draw from style palette
          let roofGeo: Part['geo'];
          let roofH: number;
          let roofColor: [number, number, number];
          let roofMatOverride: Part['mat'] | undefined;
          if (b.type === 'farmhouse') {
            roofGeo = 'cone';
            roofH = 1.2;
            roofColor = varyColor(BASE_COLORS.straw, rng, 0.08);
            roofMatOverride = 'straw';
          } else {
            const roofChoice = style.roofPalette[Math.floor(rng() * style.roofPalette.length)];
            roofGeo = roofChoice.geo;
            roofH = roofChoice.h;
            roofColor = varyColor(roofChoice.color, rng, 0.06);
            roofMatOverride = roofChoice.mat;
          }
          if (variant.roofGeoOverride) roofGeo = variant.roofGeoOverride;
          if (variant.roofHMul) roofH *= variant.roofHMul;
          const roofMat: Part['mat'] = roofMatOverride ?? (roofGeo === 'box' ? 'mud' : 'terracotta');

          const feat = variant.features ?? {};
          const stilted = !!feat.stilts && (b.type === 'house' || b.type === 'farmhouse');
          const stiltLift = stilted ? 1.2 : 0;

          // ── Round hut (house/farmhouse in west-african-round) ──
          if (feat.roundHut && (b.type === 'house' || b.type === 'farmhouse')) {
            const radius = Math.min(sw, sd) / 2;
            addPart('cylinder', wallMat, 0, sh/2, 0, radius, sh, radius, wallColor);
            addPart('cone', 'straw', 0, sh + roofH/2 + 0.1, 0, radius * 1.4, roofH * 1.3, radius * 1.4, roofColor);
            addPart('box', 'dark', 0, sh*0.3, radius+0.05, 0.5, sh*0.55, 0.1);
            const cwColor = varyColor(wallBase, rng, 0.08);
            addPart('box', wallMat, radius+0.8, 0.35, 0, 0.25, 0.7, sd*0.8, cwColor);
            addPart('box', wallMat, 0, 0.35, -radius-0.8, sw*0.8, 0.7, 0.25, cwColor);
            if (b.type === 'farmhouse') {
              const binColor = varyColor(wallBase, rng, 0.1);
              addPart('cylinder', wallMat, -radius-1.2, 0.5, 0.5, 0.5, 1.0, 0.5, binColor);
              addPart('cone', 'straw', -radius-1.2, 1.3, 0.5, 0.65, 0.8, 0.65, roofColor);
            }
          } else {
            // ── Foundation / plinth ──
            if (wallMat === 'mud' && (b.type === 'house' || b.type === 'estate') && !stilted) {
              addPart('box', 'stone', 0, 0.12, 0, sw + 0.3, 0.25, sd + 0.3, varyColor(BASE_COLORS.stone, rng, 0.06));
            } else if (shutters && b.type !== 'farmhouse' && !stilted) {
              addPart('box', 'stone', 0, 0.08, 0, sw + 0.15, 0.16, sd + 0.15, varyColor([0.58, 0.55, 0.52], rng, 0.04));
            }

            // ── Stilts (4 thin posts below the main box) ──
            if (stilted) {
              addPart('cylinder', 'wood', sw/2-0.2, stiltLift/2, sd/2-0.2, 0.1, stiltLift, 0.1);
              addPart('cylinder', 'wood', -sw/2+0.2, stiltLift/2, sd/2-0.2, 0.1, stiltLift, 0.1);
              addPart('cylinder', 'wood', sw/2-0.2, stiltLift/2, -sd/2+0.2, 0.1, stiltLift, 0.1);
              addPart('cylinder', 'wood', -sw/2+0.2, stiltLift/2, -sd/2+0.2, 0.1, stiltLift, 0.1);
            }

            // ── Main walls ──
            addPart('box', wallMat, 0, stiltLift + sh/2, 0, sw, sh, sd, wallColor);

            // ── Roof ──
            const roofBase = stiltLift + sh;
            if (roofGeo === 'box') {
              const parapetLip = feat.flatRoofParapet ? 0.6 : 0.4;
              addPart('box', roofMat, 0, roofBase + roofH/2, 0, sw + parapetLip, roofH, sd + parapetLip, roofColor);
              if (feat.flatRoofParapet) {
                // small raised parapet rim on top of the roof slab
                const parapetColor = varyColor(wallBase, rng, 0.04);
                addPart('box', wallMat, 0, roofBase + roofH + 0.12, 0, sw + 0.3, 0.24, sd + 0.3, parapetColor);
              }
            } else {
              const eaveFactor = feat.deepEaves ? 0.92 : 1.2;
              addPart('cone', roofMat, 0, roofBase + roofH/2, 0, sw/eaveFactor, roofH, sd/eaveFactor, roofColor);
            }

            // ── Wind-catcher (badgir) on top of flat roof ──
            if (feat.windCatcher) {
              const wcColor = varyColor(wallBase, rng, 0.04);
              addPart('box', wallMat, sw/4, roofBase + roofH + 0.7, -sd/4, 0.6, 1.2, 0.6, wcColor);
              // Small open slit on top face (dark) implied by a dark thin box
              addPart('box', 'dark', sw/4, roofBase + roofH + 1.25, -sd/4, 0.5, 0.1, 0.5);
            }

            // ── Door with lintel and step ──
            addPart('box', 'dark', 0, stiltLift + sh*0.3, sd/2+0.05, 0.55, sh*0.55, 0.1);
            addPart('box', wallMat, 0, stiltLift + sh*0.6, sd/2+0.06, 0.75, 0.1, 0.08, varyColor(wallBase, rng, 0.03));
            if (!stilted) {
              addPart('box', 'stone', 0, 0.06, sd/2+0.35, 0.7, 0.12, 0.3);
            }

            // ── Veranda (thin slab porch + 2 posts) ──
            if (feat.veranda) {
              const verandaColor = varyColor(BASE_COLORS.wood, rng, 0.1);
              addPart('box', 'wood', 0, 0.12, sd/2 + 0.8, sw + 0.4, 0.16, 1.4, verandaColor);
              addPart('cylinder', 'wood', sw/2 - 0.2, sh*0.35, sd/2 + 1.3, 0.1, sh*0.7, 0.1, verandaColor);
              addPart('cylinder', 'wood', -sw/2 + 0.2, sh*0.35, sd/2 + 1.3, 0.1, sh*0.7, 0.1, verandaColor);
            }

            // ── Windows + shutters ──
            if (b.type === 'house' || b.type === 'farmhouse') {
              addPart('box', 'dark', sw/2+0.05, stiltLift + sh*0.55, 0, 0.1, 0.45, 0.55);
              addPart('box', 'dark', -sw/2-0.05, stiltLift + sh*0.55, 0, 0.1, 0.45, 0.55);
              if (shutters) {
                const shutterBase = shutters[Math.floor(rng() * shutters.length)];
                const sc = varyColor(shutterBase, rng, 0.06);
                addPart('box', 'wood', sw/2+0.06, stiltLift + sh*0.55, 0.35, 0.06, 0.48, 0.12, sc);
                addPart('box', 'wood', sw/2+0.06, stiltLift + sh*0.55, -0.35, 0.06, 0.48, 0.12, sc);
                addPart('box', 'wood', -sw/2-0.06, stiltLift + sh*0.55, 0.35, 0.06, 0.48, 0.12, sc);
                addPart('box', 'wood', -sw/2-0.06, stiltLift + sh*0.55, -0.35, 0.06, 0.48, 0.12, sc);
                addPart('box', 'stone', sw/2+0.06, stiltLift + sh*0.31, 0, 0.08, 0.06, 0.65);
                addPart('box', 'stone', -sw/2-0.06, stiltLift + sh*0.31, 0, 0.08, 0.06, 0.65);
              } else if (wallMat === 'mud' || wallMat === 'wood') {
                // Simple wood frames for non-European styles
                const frameColor = varyColor(BASE_COLORS.wood, rng, 0.08);
                addPart('box', 'wood', sw/2+0.06, stiltLift + sh*0.55, 0, 0.04, 0.52, 0.04, frameColor);
                addPart('box', 'wood', -sw/2-0.06, stiltLift + sh*0.55, 0, 0.04, 0.52, 0.04, frameColor);
              }
            }
          }

          if (b.type === 'warehouse') {
            addPart('box', 'dark', 0, h*0.35, d/2+0.05, 1.8, h*0.6, 0.1);
            addPart('box', wallMat, 0, h*0.68, d/2+0.06, 2.0, 0.12, 0.08, varyColor(wallBase, rng, 0.03));
            addPart('box', 'dark', w/2+0.05, h*0.7, d/4, 0.1, 0.35, 0.4);
            addPart('box', 'dark', w/2+0.05, h*0.7, -d/4, 0.1, 0.35, 0.4);
            addPart('box', 'wood', w/2+1.0, 0.35, 0, 0.7, 0.7, 0.7, varyColor(BASE_COLORS.wood, rng, 0.15));
            addPart('box', 'wood', w/2+1.0, 0.25, 0.9, 0.5, 0.5, 0.5, varyColor(BASE_COLORS.wood, rng, 0.15));
            addPart('cylinder', 'wood', w/2+1.5, 0.3, -0.4, 0.3, 0.6, 0.3, varyColor(BASE_COLORS.wood, rng, 0.12));
          }

          // Chimney: only on styles with pitched roofs + shutter palettes (European-derived)
          // Skip for flat-roof styles, round-hut, stilted, warehouse
          if (b.type !== 'warehouse' && shutters && roofGeo === 'cone' && !feat.flatRoofParapet && !feat.roundHut && !stilted && rng() < 0.5) {
            addPart('box', 'stone', sw/4, stiltLift + sh + roofH + 0.3, sd/4, 0.4, 0.8, 0.4);
            if (rng() < 0.4) {
              const rx = (sw/4) * Math.cos(rot) - (sd/4) * Math.sin(rot);
              const rz = (sw/4) * Math.sin(rot) + (sd/4) * Math.cos(rot);
              smokeSpots.push({
                pos: [x + rx, y + stiltLift + sh + roofH + 0.8, z + rz],
                seed: bi * 137 + (x * 100 | 0),
              });
            }
          }

          // ── Estates ──
          if (b.type === 'estate') {
            if (c === 'West African') {
              // Compound with round outbuildings (existing behavior)
              const cColor = varyColor(wallBase, rng, 0.06);
              addPart('cylinder', 'mud', w/2+2.5, h*0.4, -d/4, 1.2, h*0.8, 1.2, cColor);
              addPart('cone', 'straw', w/2+2.5, h*0.8+0.6, -d/4, 1.5, 1.4, 1.5, roofColor);
              addPart('cylinder', 'mud', -w/2-2.0, h*0.35, d/4, 1.0, h*0.7, 1.0, varyColor(wallBase, rng, 0.08));
              addPart('cone', 'straw', -w/2-2.0, h*0.7+0.5, d/4, 1.3, 1.2, 1.3, roofColor);
              addPart('box', 'mud', w/2+1.5, 0.5, d/2+1.0, 0.3, 1.0, d+2, cColor);
              addPart('box', 'mud', 0, 0.5, -d/2-1.5, w+3, 1.0, 0.3, cColor);
              addPart('box', 'dark', 0, 0.35, d/2+1.05, 1.0, 0.7, 0.35);
            } else if (shutters) {
              // Two-story European-derived manor with shuttered upper windows + balcony
              addPart('box', wallMat, 0, h + h/2, 0, w-0.5, h, d-0.5, wallColor);
              if (roofGeo === 'box') {
                addPart('box', roofMat, 0, h*2 + roofH/2, 0, w, roofH, d, roofColor);
              } else {
                addPart('cone', roofMat, 0, h*2 + roofH/2, 0, w/1.2, roofH, d/1.2, roofColor);
              }
              const shutterBase = shutters[Math.floor(rng() * shutters.length)];
              const sc = varyColor(shutterBase, rng, 0.06);
              addPart('box', 'dark', w/2-0.2, h*1.55, d/2-0.2+0.05, 0.1, 0.45, 0.5);
              addPart('box', 'dark', -w/2+0.7, h*1.55, d/2-0.2+0.05, 0.1, 0.45, 0.5);
              addPart('box', 'wood', w/2-0.2, h*1.55, d/2+0.12, 0.06, 0.48, 0.12, sc);
              addPart('box', 'wood', -w/2+0.7, h*1.55, d/2+0.12, 0.06, 0.48, 0.12, sc);
              addPart('box', 'stone', 0, h + 0.1, d/2 + 0.5, w * 0.6, 0.1, 0.6);
              addPart('cylinder', 'wood', w*0.25, h + 0.4, d/2 + 0.75, 0.04, 0.5, 0.04);
              addPart('cylinder', 'wood', -w*0.25, h + 0.4, d/2 + 0.75, 0.04, 0.5, 0.04);
            } else {
              // Flat-roof two-story (Indian Ocean / Arab / Swahili / Persian-Gulf)
              addPart('box', wallMat, 0, h + h/2, 0, w-0.5, h, d-0.5, wallColor);
              addPart('box', roofMat, 0, h*2 + 0.2, 0, w, 0.4, d, roofColor);
              addPart('box', 'dark', w/2-0.2, h*1.55, d/2-0.2+0.05, 0.1, 0.4, 0.45);
              addPart('box', 'dark', -w/2+0.7, h*1.55, d/2-0.2+0.05, 0.1, 0.4, 0.45);
            }
            if (c !== 'West African') {
              addPart('box', 'dark', w/3, h*0.55, d/2+0.05, 0.1, 0.5, 0.6);
              addPart('box', 'dark', -w/3, h*0.55, d/2+0.05, 0.1, 0.5, 0.6);
            }
            addTorch(0.8, h * 0.7, d/2 + 0.3);
          }

          // Farmhouse — fence posts + trough
          if (b.type === 'farmhouse' && !feat.roundHut) {
            addPart('cylinder', 'wood', w/2+1.5, 0.35, d/2+1.5, 0.08, 0.7, 0.08);
            addPart('cylinder', 'wood', -w/2-1.5, 0.35, d/2+1.5, 0.08, 0.7, 0.08);
            addPart('cylinder', 'wood', w/2+1.5, 0.35, -d/2-1.5, 0.08, 0.7, 0.08);
            addPart('box', 'wood', -w/2-1.0, 0.25, 0, 0.5, 0.4, 1.0, varyColor(BASE_COLORS.wood, rng, 0.1));
          }
        }
      });
    });

    return { parts: allParts, torchSpots: torches, smokeSpots };
  }, [ports]);

  // Group parts by geo+mat
  const groups = useMemo(() => {
    const map = new Map<string, Part[]>();
    parts.forEach(p => {
      const key = `${p.geo}_${p.mat}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    });
    return map;
  }, [parts]);

  // Geometries
  const geos = useMemo(() => ({
    box: new THREE.BoxGeometry(1, 1, 1),
    cylinder: new THREE.CylinderGeometry(1, 1, 1, 8),
    cone: new THREE.CylinderGeometry(0, 1, 1, 4),
    sphere: new THREE.SphereGeometry(1, 16, 16),
    dome: new THREE.SphereGeometry(1, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2),
  }), []);

  // Materials
  const mats = useMemo(() => ({
    white: new THREE.MeshStandardMaterial({ color: '#f0f0f0', roughness: 0.9 }),
    mud: new THREE.MeshStandardMaterial({ color: '#c2a077', roughness: 1.0 }),
    wood: new THREE.MeshStandardMaterial({ color: '#5c4033', roughness: 0.8 }),
    terracotta: new THREE.MeshStandardMaterial({ color: '#cd5c5c', roughness: 0.7 }),
    stone: new THREE.MeshStandardMaterial({ color: '#888888', roughness: 0.9 }),
    straw: new THREE.MeshStandardMaterial({ color: '#d4c07b', roughness: 1.0 }),
    dark: darkMat,
  }), [darkMat]);

  return (
    <group>
      {Array.from(groups.entries()).map(([key, groupParts]) => {
        const [geoName, matName] = key.split('_') as [keyof typeof geos, keyof typeof mats];
        return (
          <InstancedParts
            key={key}
            parts={groupParts}
            geometry={geos[geoName]}
            material={mats[matName]}
          />
        );
      })}
      <CityRoads ports={ports} />
      <CityTorches spots={torchSpots} />
      <ChimneySmoke spots={smokeSpots} />
    </group>
  );
}

// ── Roads ────────────────────────────────────────────────────────────────────
// Extrudes each road polyline as a thin ribbon along the ground.

type PortsProp = ReturnType<typeof useGameStore.getState>['ports'];

type RoadTierKey = 'path' | 'road' | 'avenue' | 'bridge';

const ROAD_TIER_STYLE: Record<RoadTierKey, {
  width: number;
  color: string;
  roughness: number;
  yLift: number;
}> = {
  path:   { width: 1.0, color: '#8a6f4a', roughness: 1.0, yLift: 0.06 },
  road:   { width: 2.0, color: '#6b5a42', roughness: 0.95, yLift: 0.08 },
  avenue: { width: 3.6, color: '#7a7265', roughness: 0.85, yLift: 0.10 },
  // Bridge deck: slightly wider than an avenue, weathered stone hue, no extra
  // yLift (the generator already places deck points at SEA_LEVEL + 0.8).
  bridge: { width: 3.2, color: '#5a5550', roughness: 0.9,  yLift: 0.0  },
};

function buildRoadRibbon(
  points: [number, number, number][],
  width: number,
  yLift: number,
): THREE.BufferGeometry | null {
  if (points.length < 2) return null;
  const half = width / 2;
  const verts: number[] = [];
  const n = points.length;
  // For each point compute a tangent (average of incoming + outgoing seg)
  for (let i = 0; i < n; i++) {
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(n - 1, i + 1)];
    let tx = next[0] - prev[0];
    let tz = next[2] - prev[2];
    const tl = Math.hypot(tx, tz);
    if (tl < 1e-5) { tx = 1; tz = 0; } else { tx /= tl; tz /= tl; }
    // Perpendicular in XZ plane
    const nx = -tz;
    const nz = tx;
    const [px, py, pz] = points[i];
    // Taper endpoints slightly so ribbons fade into anchor buildings
    const edgeTaper = (i === 0 || i === n - 1) ? 0.85 : 1.0;
    const w = half * edgeTaper;
    verts.push(px + nx * w, py + yLift, pz + nz * w);
    verts.push(px - nx * w, py + yLift, pz - nz * w);
  }
  const positions = new Float32Array(verts);
  const indices: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const a = i * 2;     // left_i
    const b = i * 2 + 1; // right_i
    const c = (i + 1) * 2;     // left_{i+1}
    const d = (i + 1) * 2 + 1; // right_{i+1}
    // Two triangles per segment, CCW viewed from above
    indices.push(a, c, b);
    indices.push(b, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function CityRoads({ ports }: { ports: PortsProp }) {
  const { tierMeshes, bridgePiers } = useMemo(() => {
    const byTier: Record<RoadTierKey, THREE.BufferGeometry[]> = {
      path: [], road: [], avenue: [], bridge: [],
    };
    // Pier positions for bridges. Sampled every 2 deck points so piers read
    // as evenly spaced without one at every segment.
    const piers: [number, number, number][] = [];
    for (const port of ports) {
      if (!port.roads || port.roads.length === 0) continue;
      for (const r of port.roads) {
        const tierKey = r.tier as RoadTierKey;
        const style = ROAD_TIER_STYLE[tierKey];
        const geo = buildRoadRibbon(r.points, style.width, style.yLift);
        if (geo) byTier[tierKey].push(geo);
        if (r.tier === 'bridge') {
          // Skip the two endpoint nodes (those sit on land); place piers on
          // interior deck nodes at every other step.
          for (let i = 1; i < r.points.length - 1; i += 2) {
            piers.push(r.points[i]);
          }
        }
      }
    }
    // Merge per-tier into one geometry each for draw-call efficiency
    const tierMeshes: { tier: RoadTierKey; geo: THREE.BufferGeometry }[] = [];
    (['path', 'road', 'avenue', 'bridge'] as const).forEach(tier => {
      const geos = byTier[tier];
      if (geos.length === 0) return;
      // Merge manually: concatenate positions + offset indices
      let totalVerts = 0;
      let totalIdx = 0;
      for (const g of geos) {
        totalVerts += g.getAttribute('position').count;
        totalIdx += g.getIndex()!.count;
      }
      const mergedPos = new Float32Array(totalVerts * 3);
      const mergedIdx = new Uint32Array(totalIdx);
      let posOff = 0;
      let idxOff = 0;
      let vertOff = 0;
      for (const g of geos) {
        const pos = g.getAttribute('position').array as Float32Array;
        mergedPos.set(pos, posOff);
        posOff += pos.length;
        const idx = g.getIndex()!.array as ArrayLike<number>;
        for (let k = 0; k < idx.length; k++) {
          mergedIdx[idxOff + k] = idx[k] + vertOff;
        }
        idxOff += idx.length;
        vertOff += g.getAttribute('position').count;
      }
      const merged = new THREE.BufferGeometry();
      merged.setAttribute('position', new THREE.BufferAttribute(mergedPos, 3));
      merged.setIndex(new THREE.BufferAttribute(mergedIdx, 1));
      merged.computeVertexNormals();
      tierMeshes.push({ tier, geo: merged });
      // Dispose the per-road geometries since they're no longer needed
      geos.forEach(g => g.dispose());
    });
    return { tierMeshes, bridgePiers: piers };
  }, [ports]);

  const materials = useMemo(() => {
    const m: Record<string, THREE.MeshStandardMaterial> = {};
    (Object.keys(ROAD_TIER_STYLE) as Array<keyof typeof ROAD_TIER_STYLE>).forEach(k => {
      const s = ROAD_TIER_STYLE[k];
      m[k] = new THREE.MeshStandardMaterial({
        color: s.color,
        roughness: s.roughness,
        metalness: 0,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      });
    });
    return m;
  }, []);

  // Pier geometry: a short, chunky stone cylinder standing in the water
  // beneath each interior deck node.
  const pierGeo = useMemo(() => new THREE.CylinderGeometry(0.55, 0.7, 3.2, 8), []);
  const pierMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#4a4540', roughness: 0.95, metalness: 0,
  }), []);
  const pierMeshRef = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    if (!pierMeshRef.current || bridgePiers.length === 0) return;
    const dummy = new THREE.Object3D();
    bridgePiers.forEach((p, i) => {
      // Pier center sits below deck: deck at p[1], top of pier ≈ p[1] - 0.2,
      // height 3.2, so center at p[1] - 0.2 - 1.6 = p[1] - 1.8.
      dummy.position.set(p[0], p[1] - 1.8, p[2]);
      dummy.updateMatrix();
      pierMeshRef.current!.setMatrixAt(i, dummy.matrix);
    });
    pierMeshRef.current.instanceMatrix.needsUpdate = true;
  }, [bridgePiers]);

  return (
    <group>
      {tierMeshes.map(({ tier, geo }) => (
        <mesh key={tier} geometry={geo} material={materials[tier]} receiveShadow />
      ))}
      {bridgePiers.length > 0 && (
        <instancedMesh
          ref={pierMeshRef}
          args={[pierGeo, pierMat, bridgePiers.length]}
          castShadow
          receiveShadow
        />
      )}
    </group>
  );
}

// ── Torch Lights ──────────────────────────────────────────────────────────────
// Renders emissive flame spheres (instanced, all ports) + limited PointLights
// for actual illumination (max 6 to keep draw calls sane).

function CityTorches({ spots }: { spots: TorchSpot[] }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const haloRef = useRef<THREE.InstancedMesh>(null);
  const lightsRef = useRef<(THREE.PointLight | null)[]>([]);

  const flameGeo = useMemo(() => new THREE.SphereGeometry(1, 6, 6), []);
  const flameMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#ff6600',
    emissive: '#ff8822',
    emissiveIntensity: 0,
    toneMapped: false,
    transparent: true,
    opacity: 0,
  }), []);

  // Horizontal disc for each torch halo — reads as a ground-glow in the
  // default top-down camera. Plane is rotated flat and additively blended.
  const haloGeo = useMemo(() => {
    const g = new THREE.PlaneGeometry(1, 1);
    g.rotateX(-Math.PI / 2);
    return g;
  }, []);

  const haloTexture = useMemo(() => {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0.0, 'rgba(255, 190, 110, 1.0)');
    grad.addColorStop(0.35, 'rgba(255, 140, 60, 0.45)');
    grad.addColorStop(1.0, 'rgba(255, 100, 40, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, []);

  const haloMat = useMemo(() => new THREE.MeshBasicMaterial({
    map: haloTexture,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    opacity: 0,
  }), [haloTexture]);

  // Position all flame instances once
  useEffect(() => {
    if (!meshRef.current || spots.length === 0) return;
    const dummy = new THREE.Object3D();
    spots.forEach((s, i) => {
      dummy.position.set(s.pos[0], s.pos[1], s.pos[2]);
      dummy.scale.set(0.18, 0.28, 0.18);
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [spots]);

  // Position halo discs once (per-instance scale wobble happens in useFrame)
  useEffect(() => {
    if (!haloRef.current || spots.length === 0) return;
    const dummy = new THREE.Object3D();
    spots.forEach((s, i) => {
      dummy.position.set(s.pos[0], s.pos[1] + 0.05, s.pos[2]);
      dummy.scale.set(2.6, 2.6, 2.6);
      dummy.updateMatrix();
      haloRef.current!.setMatrixAt(i, dummy.matrix);
    });
    haloRef.current.instanceMatrix.needsUpdate = true;
  }, [spots]);

  // Per-torch phase offsets so each flame flickers independently
  const phaseOffsets = useMemo(
    () => spots.map((_, i) => {
      const h = ((i + 1) * 2654435761) >>> 0;
      return (h / 0xffffffff) * Math.PI * 2;
    }),
    [spots],
  );
  const dummyRef = useRef(new THREE.Object3D());

  // Animate flame intensity + point light brightness based on time of day
  useFrame(({ clock }) => {
    const timeOfDay = useGameStore.getState().timeOfDay;
    const sunAngle = ((timeOfDay - 6) / 24) * Math.PI * 2;
    const sunH = Math.sin(sunAngle);
    const nightFactor = Math.max(0, Math.min(1, (0.1 - sunH) / 0.3));

    const t = clock.elapsedTime;
    // Shared material gets a gentle baseline drift (can't be per-instance without a custom shader)
    const baseFlicker = 0.9 + Math.sin(t * 2.3) * 0.05;
    flameMat.emissiveIntensity = nightFactor * 3.0 * baseFlicker;
    flameMat.opacity = nightFactor * 0.85;
    haloMat.opacity = nightFactor * 0.45 * baseFlicker;

    // Per-instance scale flicker reads as brightness variation since the flame is a small glow
    if (meshRef.current && nightFactor > 0) {
      const dummy = dummyRef.current;
      for (let i = 0; i < spots.length; i++) {
        const phase = phaseOffsets[i];
        const f =
          0.78 +
          Math.sin(t * 7.3 + phase) * 0.12 +
          Math.sin(t * 13.1 + phase * 1.7) * 0.07 +
          Math.sin(t * 3.7 + phase * 0.5) * 0.05;
        const s = spots[i].pos;
        dummy.position.set(s[0], s[1], s[2]);
        dummy.scale.set(0.18 * f, 0.28 * f, 0.18 * f);
        dummy.updateMatrix();
        meshRef.current.setMatrixAt(i, dummy.matrix);
      }
      meshRef.current.instanceMatrix.needsUpdate = true;
    }

    // Halo discs: gentler per-instance wobble so the warm bleed around each torch breathes
    if (haloRef.current && nightFactor > 0) {
      const dummy = dummyRef.current;
      for (let i = 0; i < spots.length; i++) {
        const phase = phaseOffsets[i];
        const h =
          0.92 +
          Math.sin(t * 4.1 + phase * 0.8) * 0.06 +
          Math.sin(t * 9.3 + phase * 1.3) * 0.03;
        const s = spots[i].pos;
        dummy.position.set(s[0], s[1] + 0.05, s[2]);
        const scale = 2.6 * h;
        dummy.scale.set(scale, scale, scale);
        dummy.updateMatrix();
        haloRef.current.setMatrixAt(i, dummy.matrix);
      }
      haloRef.current.instanceMatrix.needsUpdate = true;
    }

    // PointLights each get their own phase
    for (let i = 0; i < lightsRef.current.length; i++) {
      const light = lightsRef.current[i];
      if (!light) continue;
      const phase = phaseOffsets[i];
      const lf =
        0.82 +
        Math.sin(t * 7.3 + phase) * 0.09 +
        Math.sin(t * 13.1 + phase * 1.7) * 0.05 +
        Math.sin(t * 3.7 + phase) * 0.04;
      light.intensity = nightFactor * 4 * lf;
    }
  });

  if (spots.length === 0) return null;

  // Only create PointLights for first 6 torch spots (performance budget)
  const lightCount = Math.min(spots.length, 6);

  return (
    <group>
      <instancedMesh
        ref={haloRef}
        args={[haloGeo, haloMat, spots.length]}
        frustumCulled={false}
        renderOrder={1}
      />
      <instancedMesh ref={meshRef} args={[flameGeo, flameMat, spots.length]} frustumCulled={false} />
      {spots.slice(0, lightCount).map((s, i) => (
        <pointLight
          key={i}
          ref={(el) => { lightsRef.current[i] = el; }}
          position={s.pos}
          color="#ff8833"
          intensity={0}
          distance={18}
          decay={2}
        />
      ))}
    </group>
  );
}

// ── Chimney Smoke ─────────────────────────────────────────────────────────────
// Each smoking chimney spawns 3 instanced puffs that rise, drift, expand, and
// fade in a looping cycle. Uses a single InstancedMesh for all puffs.

const PUFFS_PER_CHIMNEY = 3;
const PUFF_CYCLE = 4.0; // seconds for one puff to rise and fade

function ChimneySmoke({ spots }: { spots: SmokeSpot[] }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummyRef = useRef(new THREE.Object3D());

  const puffGeo = useMemo(() => new THREE.SphereGeometry(1, 6, 5), []);
  const puffMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#9a9590',
    transparent: true,
    opacity: 0.25,
    depthWrite: false,
    roughness: 1,
  }), []);

  const totalPuffs = spots.length * PUFFS_PER_CHIMNEY;

  useFrame(({ clock }) => {
    if (!meshRef.current || totalPuffs === 0) return;
    const t = clock.elapsedTime;
    const dummy = dummyRef.current;

    for (let si = 0; si < spots.length; si++) {
      const spot = spots[si];
      const baseSeed = spot.seed * 0.01;

      for (let p = 0; p < PUFFS_PER_CHIMNEY; p++) {
        const idx = si * PUFFS_PER_CHIMNEY + p;
        // Stagger each puff's phase
        const phase = (t + baseSeed + p * (PUFF_CYCLE / PUFFS_PER_CHIMNEY)) % PUFF_CYCLE;
        const progress = phase / PUFF_CYCLE; // 0..1

        // Rise upward, drift slightly in wind
        const rise = progress * 3.5;
        const drift = Math.sin(baseSeed + t * 0.3) * progress * 0.8;
        const driftZ = Math.cos(baseSeed * 1.7 + t * 0.2) * progress * 0.4;

        // Expand as it rises
        const scale = 0.15 + progress * 0.35;

        // Fade out toward end of cycle
        const alpha = progress < 0.15
          ? progress / 0.15           // fade in
          : 1.0 - (progress - 0.15) / 0.85; // fade out

        dummy.position.set(
          spot.pos[0] + drift,
          spot.pos[1] + rise,
          spot.pos[2] + driftZ,
        );
        dummy.scale.setScalar(scale * Math.max(0.01, alpha));
        dummy.updateMatrix();
        meshRef.current!.setMatrixAt(idx, dummy.matrix);
      }
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  if (totalPuffs === 0) return null;

  return (
    <instancedMesh ref={meshRef} args={[puffGeo, puffMat, totalPuffs]} />
  );
}

// ── Instanced Parts Renderer ──────────────────────────────────────────────────

function InstancedParts({ parts, geometry, material }: { parts: Part[]; geometry: THREE.BufferGeometry; material: THREE.Material }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  useEffect(() => {
    if (!meshRef.current) return;
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    parts.forEach((p, i) => {
      dummy.position.set(...p.pos);
      dummy.scale.set(...p.scale);
      dummy.rotation.set(...p.rot);
      if (geometry instanceof THREE.CylinderGeometry && geometry.parameters.radialSegments === 4) {
        dummy.rotation.y += Math.PI / 4;
      }
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);
      if (p.color) {
        color.setRGB(p.color[0], p.color[1], p.color[2]);
        meshRef.current!.setColorAt(i, color);
      }
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) {
      meshRef.current.instanceColor.needsUpdate = true;
    }
  }, [parts, geometry]);

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, parts.length]}
      castShadow
      receiveShadow
      frustumCulled={false}
    />
  );
}
