import { useMemo, useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '../store/gameStore';
import type { BuildingStyle } from '../utils/portArchetypes';

interface Part {
  geo: 'box' | 'cylinder' | 'cone' | 'sphere';
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
  'Caribbean': [
    [0.36, 0.25, 0.20],  // dark hardwood
    [0.36, 0.25, 0.20],  // dark hardwood (weighted)
    [0.46, 0.36, 0.28],  // lighter weathered wood
    [0.42, 0.30, 0.22],  // reddish tropical wood
    [0.52, 0.44, 0.32],  // sun-bleached planks
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
  'Caribbean': [
    { color: [0.36, 0.25, 0.20], geo: 'cone', h: 1.5 },  // wood shingle
    { color: [0.36, 0.25, 0.20], geo: 'cone', h: 1.5 },  // wood shingle (weighted)
    { color: [0.78, 0.70, 0.42], geo: 'cone', h: 1.3 },  // palm thatch
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
  'Caribbean': [
    [0.78, 0.70, 0.42],  // natural palm
    [0.60, 0.40, 0.22],  // bark cloth
    [0.45, 0.55, 0.30],  // dyed green
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
    wallPalette: [
      [0.88, 0.82, 0.70], [0.88, 0.82, 0.70],
      [0.80, 0.72, 0.58],
      [0.42, 0.30, 0.20],   // dark timber (half-timber read)
    ],
    // Pre-1666 London: thatch dominant, some clay tile, a few slate/wood shingle roofs
    roofPalette: [
      { color: [0.78, 0.66, 0.38], geo: 'cone', h: 1.7, mat: 'straw' }, // weathered thatch
      { color: [0.78, 0.66, 0.38], geo: 'cone', h: 1.7, mat: 'straw' }, // thatch (weighted)
      { color: [0.68, 0.56, 0.30], geo: 'cone', h: 1.8, mat: 'straw' }, // darker aged thatch
      { color: [0.55, 0.32, 0.22], geo: 'cone', h: 1.4 },                // clay tile (terracotta)
      { color: [0.38, 0.30, 0.24], geo: 'cone', h: 1.5, mat: 'wood' },  // wood shingle
    ],
    houseVariants: [
      { weight: 0.55 },
      { weight: 0.35, scaleMul: [1.15, 1.1, 1.1] },
      { weight: 0.10, scaleMul: [1.25, 0.9, 1.25] },
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
  const timeOfDay = useGameStore(s => s.timeOfDay);

  // Dark material created separately for per-frame emissive updates (window glow)
  const darkMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#1e1a14', roughness: 0.95,
  }), []);

  // Animate window glow based on time of day
  useFrame(() => {
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
          const flagColor: [number, number, number] = c === 'Indian Ocean'
            ? [0.15, 0.55, 0.25]   // green
            : c === 'European' || c === 'West African' || c === 'Atlantic'
              ? [0.85, 0.15, 0.15] // red (Portuguese/Spanish)
              : [0.2, 0.2, 0.7];   // blue
          // Right tower flagpole + flag
          addPart('cylinder', 'wood', w/2, h + 3.5, d/2, 0.06, 3, 0.06);
          addPart('box', 'straw', w/2 + 0.45, h + 4.5, d/2, 0.8, 0.5, 0.05, flagColor);
          // Left tower flagpole + flag
          addPart('cylinder', 'wood', -w/2, h + 3.5, d/2, 0.06, 3, 0.06);
          addPart('box', 'straw', -w/2 + 0.45, h + 4.5, d/2, 0.8, 0.5, 0.05, flagColor);

          // ── Torches flanking gate ──
          addTorch(1.8, h * 0.7, d/2 + 0.3);
          addTorch(-1.8, h * 0.7, d/2 + 0.3);

          // ── Culture-specific landmark (once per port) ──
          if (!fortSeen) {
            fortSeen = true;
            if (c === 'Indian Ocean') {
              // Minaret near the fort
              const mColor = varyColor([0.88, 0.82, 0.72], rng, 0.05);
              addPart('cylinder', 'white', w/2 + 4, h/2 + 4, -d/2, 0.9, 10, 0.9, mColor);
              // Minaret gallery (slightly wider ring)
              addPart('cylinder', 'white', w/2 + 4, h/2 + 8.5, -d/2, 1.2, 0.4, 1.2, mColor);
              // Dome on top
              addPart('sphere', 'white', w/2 + 4, h/2 + 9.5, -d/2, 0.7, 0.9, 0.7, mColor);
              // Crescent finial (tiny sphere offset)
              addPart('sphere', 'straw', w/2 + 4, h/2 + 10.5, -d/2, 0.2, 0.2, 0.2, [0.85, 0.75, 0.2]);
            } else if (c === 'European' || c === 'Atlantic') {
              // Stone cross on the tallest tower
              addPart('box', 'stone', w/2, h + 5.5, d/2, 0.15, 1.8, 0.15);
              addPart('box', 'stone', w/2, h + 6.0, d/2, 0.8, 0.15, 0.15);
              // Small chapel nearby — box + pitched roof + cross
              const chapelColor = varyColor(BASE_COLORS.white, rng, 0.06);
              addPart('box', 'white', -w/2 - 4, h * 0.4, 0, 3, h * 0.8, 4, chapelColor);
              addPart('cone', 'terracotta', -w/2 - 4, h * 0.8 + 1, 0, 2.5, 2, 3.2, varyColor(BASE_COLORS.terracotta, rng, 0.08));
              // Chapel bell tower
              addPart('box', 'white', -w/2 - 4, h * 0.8 + 2.5, -2.2, 1, 3, 1, chapelColor);
              addPart('cone', 'stone', -w/2 - 4, h * 0.8 + 4.5, -2.2, 0.8, 1.5, 0.8);
              // Cross on chapel
              addPart('box', 'stone', -w/2 - 4, h * 0.8 + 5.5, -2.2, 0.1, 0.8, 0.1);
              addPart('box', 'stone', -w/2 - 4, h * 0.8 + 5.8, -2.2, 0.5, 0.1, 0.1);
            } else if (c === 'West African') {
              // Palaver tree — large trunk with spreading canopy near the fort
              // Central gathering place in Akan/coastal settlements
              const trunkColor = varyColor(BASE_COLORS.wood, rng, 0.08);
              addPart('cylinder', 'wood', -w/2 - 5, 2.5, 0, 0.6, 5, 0.6, trunkColor);
              // Broad canopy (flattened sphere)
              addPart('sphere', 'straw', -w/2 - 5, 6.0, 0, 4.0, 2.5, 4.0, varyColor([0.28, 0.42, 0.18], rng, 0.08));
              // Low circular seating wall around the tree
              const seatColor = varyColor([0.65, 0.50, 0.32], rng, 0.06);
              addPart('cylinder', 'mud', -w/2 - 5, 0.2, 0, 2.8, 0.4, 2.8, seatColor);
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
            addPart('sphere', 'mud', 0, h, 0, w/2, w/2, d/2);
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

          // Select a weighted house variant. Only house/farmhouse respect
          // silhouette-changing features (stilts / roundHut / windCatcher);
          // warehouse and estate keep rectangular rigid structure.
          const variant = (b.type === 'house' || b.type === 'farmhouse')
            ? pickVariant(style.houseVariants, rng)
            : { weight: 1 };
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
      <CityTorches spots={torchSpots} timeOfDay={timeOfDay} />
      <ChimneySmoke spots={smokeSpots} />
    </group>
  );
}

// ── Torch Lights ──────────────────────────────────────────────────────────────
// Renders emissive flame spheres (instanced, all ports) + limited PointLights
// for actual illumination (max 6 to keep draw calls sane).

function CityTorches({ spots, timeOfDay }: { spots: TorchSpot[]; timeOfDay: number }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
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

  // Animate flame intensity + point light brightness based on time of day
  useFrame(({ clock }) => {
    const sunAngle = ((timeOfDay - 6) / 24) * Math.PI * 2;
    const sunH = Math.sin(sunAngle);
    const nightFactor = Math.max(0, Math.min(1, (0.1 - sunH) / 0.3));

    // Organic flicker from overlapping sine waves
    const t = clock.elapsedTime;
    const flicker = 0.82 + Math.sin(t * 7.3) * 0.09 + Math.sin(t * 13.1) * 0.05 + Math.sin(t * 3.7) * 0.04;

    flameMat.emissiveIntensity = nightFactor * 3.0 * flicker;
    flameMat.opacity = nightFactor * 0.85;

    for (const light of lightsRef.current) {
      if (light) {
        light.intensity = nightFactor * 4 * flicker;
      }
    }
  });

  if (spots.length === 0) return null;

  // Only create PointLights for first 6 torch spots (performance budget)
  const lightCount = Math.min(spots.length, 6);

  return (
    <group>
      <instancedMesh ref={meshRef} args={[flameGeo, flameMat, spots.length]} />
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
    />
  );
}
