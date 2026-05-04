import type { BuildingStyle } from '../../utils/portArchetypes';
import type { Part } from './cityTypes';

// ── Culture-specific color palettes ──────────────────────────────────────────
// Each building randomly selects a base wall color from its culture's palette.
// Weighted by repeating common colors. Historically grounded for c. 1612.

export const WALL_PALETTES: Record<string, [number, number, number][]> = {
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

export interface RoofStyle {
  color: [number, number, number];
  geo: 'box' | 'cone' | 'roundCone' | 'gableRoof' | 'shedRoof';
  h: number;
  mat?: Part['mat'];   // optional material override (defaults to terracotta for cone, mud for box)
}

export const ROOF_PALETTES: Record<string, RoofStyle[]> = {
  'Indian Ocean': [
    { color: [0.72, 0.60, 0.45], geo: 'box', h: 0.4 },   // flat mud
    { color: [0.72, 0.60, 0.45], geo: 'box', h: 0.4 },   // flat mud (weighted)
    { color: [0.88, 0.84, 0.76], geo: 'box', h: 0.35 },  // whitewashed flat
    { color: [0.78, 0.70, 0.42], geo: 'cone', h: 1.2 },  // palm thatch
  ],
  'European': [
    { color: [0.82, 0.34, 0.31], geo: 'cone', h: 1.45 }, // red clay tile
    { color: [0.82, 0.34, 0.31], geo: 'cone', h: 1.45 }, // red clay tile (weighted)
    { color: [0.72, 0.27, 0.24], geo: 'cone', h: 1.4 },  // older dark red tile
    { color: [0.52, 0.50, 0.54], geo: 'cone', h: 1.25 }, // weathered slate/lead grey
  ],
  'West African': [
    { color: [0.68, 0.55, 0.36], geo: 'box', h: 0.35 },  // flat earthen
    { color: [0.68, 0.55, 0.36], geo: 'box', h: 0.35 },  // flat earthen (weighted)
    { color: [0.74, 0.64, 0.38], geo: 'cone', h: 1.4 },  // conical thatch (Sudano-Sahelian)
    { color: [0.70, 0.58, 0.32], geo: 'cone', h: 1.6 },  // tall thatch
  ],
  'Atlantic': [
    { color: [0.82, 0.33, 0.30], geo: 'cone', h: 1.25 }, // red Iberian tile
    { color: [0.82, 0.33, 0.30], geo: 'cone', h: 1.25 }, // red Iberian tile (weighted)
    { color: [0.58, 0.24, 0.20], geo: 'cone', h: 1.2 },  // damp darkened tile
    { color: [0.39, 0.27, 0.19], geo: 'cone', h: 1.35, mat: 'wood' }, // dark wood shingle
    { color: [0.74, 0.66, 0.38], geo: 'cone', h: 1.25, mat: 'straw' }, // palm thatch
  ],
};

// Portuguese colonial shutter colors (Goa, Macau)
export const EU_SHUTTER_COLORS: [number, number, number][] = [
  [0.20, 0.35, 0.58],  // Portuguese blue
  [0.22, 0.45, 0.30],  // forest green
  [0.65, 0.50, 0.20],  // ochre
  [0.55, 0.15, 0.12],  // ox-blood red
  [0.35, 0.30, 0.25],  // dark brown
];

// Dyed fabric colors for market awnings
export const AWNING_COLORS: Record<string, [number, number, number][]> = {
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

export interface HouseVariant {
  weight: number;
  scaleMul?: [number, number, number];      // multiplier on base [w, h, d]
  roofGeoOverride?: 'box' | 'cone' | 'roundCone' | 'gableRoof' | 'shedRoof';
  roofHMul?: number;
  roofScaleMul?: [number, number, number];  // multiplier on final roof [w, h, d]
  roofYOffset?: number;
  features?: {
    stilts?: boolean;              // 4 thin posts under the main box
    roundHut?: boolean;            // cylinder walls + cone roof (replaces rectangle)
    flatRoofParapet?: boolean;     // flat roof with thin parapet lip (no cone)
    deepEaves?: boolean;           // cone radius wider than wall footprint
    ridgeCap?: boolean;            // thin ridge strip on pitched roofs
    windCatcher?: boolean;         // small upright box on top (badgir)
    veranda?: boolean;             // thin slab porch from the front face
  };
}

export interface BuildingStyleDef {
  wallPalette: [number, number, number][];
  roofPalette: RoofStyle[];
  houseVariants: HouseVariant[];
  facadeKit?:
    | 'iberian-colonial'
    | 'northern-european'
    | 'swahili-coral'
    | 'west-african-compound'
    | 'mughal-gujarati'
    | 'malay-stilted'
    | 'malabar-veranda';
  shutterPalette?: [number, number, number][];
  wallMatHint?: Part['mat'];       // material for roughness; color overrides per-instance
}

export const DEFAULT_HOUSE_VARIANTS: HouseVariant[] = [{ weight: 1 }];

// Darker shutter set for Dutch / English — no bright Portuguese colors
export const NORTHERN_SHUTTERS: [number, number, number][] = [
  [0.18, 0.22, 0.18],  // dark forest green
  [0.22, 0.18, 0.15],  // near-black
  [0.28, 0.22, 0.18],  // dark brown
];

export const BUILDING_STYLES: Partial<Record<BuildingStyle, BuildingStyleDef>> = {
  'iberian': {
    wallPalette: [
      [0.99, 0.985, 0.95], [0.99, 0.985, 0.95], [0.99, 0.985, 0.95],
      [0.98, 0.955, 0.88], [0.965, 0.925, 0.82],
    ],
    roofPalette: [
      { color: [0.86, 0.32, 0.30], geo: 'cone', h: 1.25 },
      { color: [0.84, 0.30, 0.27], geo: 'cone', h: 1.12 },
      { color: [0.74, 0.24, 0.22], geo: 'cone', h: 1.05 },
      { color: [0.92, 0.42, 0.34], geo: 'cone', h: 1.32 },
    ],
    houseVariants: [
      { weight: 0.30, roofScaleMul: [1.00, 1.08, 1.00] },
      { weight: 0.22, roofScaleMul: [1.08, 0.98, 1.08] },
      { weight: 0.25, scaleMul: [1.2, 0.9, 1.2], roofScaleMul: [1.04, 1.00, 1.04] },
      { weight: 0.15, scaleMul: [0.86, 1.18, 0.90], roofScaleMul: [0.92, 1.24, 0.94] },
      { weight: 0.08, scaleMul: [1.28, 0.82, 1.20], roofScaleMul: [1.14, 0.86, 1.12] },
    ],
    facadeKit: 'iberian-colonial',
    shutterPalette: EU_SHUTTER_COLORS,
    wallMatHint: 'white',
  },
  'dutch-brick': {
    wallPalette: [
      [0.56, 0.27, 0.20], [0.56, 0.27, 0.20], [0.56, 0.27, 0.20],
      [0.64, 0.34, 0.25], [0.48, 0.22, 0.17],
      [0.70, 0.42, 0.30], [0.78, 0.70, 0.60],  // occasional pale-rendered facade
    ],
    roofPalette: [
      { color: [0.22, 0.20, 0.18], geo: 'cone', h: 1.35 },
      { color: [0.25, 0.22, 0.20], geo: 'cone', h: 1.35 },
      { color: [0.32, 0.27, 0.24], geo: 'cone', h: 1.28 },
      { color: [0.18, 0.18, 0.17], geo: 'cone', h: 1.30, mat: 'wood' },
    ],
    houseVariants: [
      { weight: 0.38, scaleMul: [0.98, 1.42, 1.08], roofScaleMul: [1.00, 0.82, 1.08], roofYOffset: -0.08, features: { ridgeCap: true } },
      { weight: 0.36, scaleMul: [1.08, 1.26, 1.14], roofScaleMul: [1.06, 0.80, 1.12], roofYOffset: -0.08, features: { ridgeCap: true } },
      { weight: 0.26, scaleMul: [1.18, 1.12, 1.20], roofScaleMul: [1.12, 0.78, 1.16], roofYOffset: -0.06, features: { ridgeCap: true } },
    ],
    facadeKit: 'northern-european',
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
    // not yet mandated. Soot from sea-coal hearths darkened most roofs.
    roofPalette: [
      { color: [0.42, 0.35, 0.24], geo: 'cone', h: 1.85, mat: 'straw' }, // weathered thatch (dominant)
      { color: [0.42, 0.35, 0.24], geo: 'cone', h: 1.85, mat: 'straw' },
      { color: [0.34, 0.29, 0.21], geo: 'cone', h: 1.95, mat: 'straw' }, // soot-darkened thatch
      { color: [0.50, 0.42, 0.29], geo: 'cone', h: 1.8, mat: 'straw' },  // newer dry thatch (occasional)
      { color: [0.30, 0.25, 0.20], geo: 'cone', h: 1.62, mat: 'wood' },  // dark wood shingle
      { color: [0.36, 0.37, 0.31], geo: 'cone', h: 1.62, mat: 'wood' },  // moss-greened shingle
      { color: [0.50, 0.29, 0.22], geo: 'cone', h: 1.5 },                // clay tile (the wealthy minority)
    ],
    // Variety matters at Huge scale: cramped tall City rowhouses, standard
    // two-bay cottages, and squat outer-parish dwellings.
    houseVariants: [
      { weight: 0.22, scaleMul: [1.08, 1.24, 1.26], roofScaleMul: [1.02, 1.12, 1.24], features: { ridgeCap: true } }, // tall jettied rowhouse
      { weight: 0.28, scaleMul: [1.20, 0.96, 1.34], roofScaleMul: [1.10, 1.10, 1.30], features: { ridgeCap: true } }, // standard two-bay
      { weight: 0.25, scaleMul: [1.34, 0.96, 1.46], roofScaleMul: [1.18, 1.08, 1.40], features: { ridgeCap: true } }, // larger merchant house
      { weight: 0.15, scaleMul: [1.28, 0.76, 1.46], roofScaleMul: [1.16, 1.08, 1.38], features: { ridgeCap: true } }, // squat outer-parish cottage
      { weight: 0.10, scaleMul: [1.14, 1.34, 1.30], roofScaleMul: [1.00, 1.14, 1.26], features: { ridgeCap: true } }, // landmark-tall (church/inn read)
    ],
    facadeKit: 'northern-european',
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
      { color: [0.86, 0.32, 0.29], geo: 'cone', h: 1.32 },
      { color: [0.84, 0.30, 0.27], geo: 'cone', h: 1.18 },
      { color: [0.70, 0.23, 0.21], geo: 'cone', h: 1.10 },
      { color: [0.62, 0.27, 0.22], geo: 'cone', h: 1.26 },
    ],
    houseVariants: [
      { weight: 0.30, roofScaleMul: [1.04, 1.02, 1.04] },
      { weight: 0.26, roofScaleMul: [1.12, 0.94, 1.10] },
      { weight: 0.22, roofScaleMul: [1.10, 0.98, 1.12], features: { veranda: true } },
      { weight: 0.14, scaleMul: [0.88, 1.15, 0.92], roofScaleMul: [0.94, 1.20, 0.96] },
      { weight: 0.08, scaleMul: [1.28, 0.82, 1.24], roofScaleMul: [1.16, 0.86, 1.14], features: { veranda: true } },
    ],
    facadeKit: 'iberian-colonial',
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
      { color: [0.86, 0.82, 0.72], geo: 'box', h: 0.32 },
      { color: [0.74, 0.70, 0.62], geo: 'box', h: 0.34 },
    ],
    houseVariants: [
      { weight: 0.7, scaleMul: [1.15, 0.85, 1.15], roofScaleMul: [1.08, 1.0, 1.08], features: { flatRoofParapet: true } },
      { weight: 0.3, roofScaleMul: [0.98, 1.0, 0.98], features: { flatRoofParapet: true } },
    ],
    facadeKit: 'swahili-coral',
    wallMatHint: 'white',
  },
  'arab-cubic': {
    wallPalette: [
      [0.92, 0.88, 0.78], [0.92, 0.88, 0.78],
      [0.84, 0.74, 0.56],
      [0.76, 0.63, 0.47],
    ],
    roofPalette: [
      { color: [0.80, 0.72, 0.58], geo: 'box', h: 0.32 },
      { color: [0.70, 0.62, 0.48], geo: 'box', h: 0.36 },
    ],
    houseVariants: [
      { weight: 0.6, scaleMul: [0.8, 1.3, 0.8], roofScaleMul: [1.06, 1.0, 1.06], features: { flatRoofParapet: true } },
      { weight: 0.4, roofScaleMul: [0.96, 1.0, 0.96], features: { flatRoofParapet: true } },
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
      { color: [0.72, 0.58, 0.40], geo: 'box', h: 0.34 },
      { color: [0.60, 0.48, 0.34], geo: 'box', h: 0.36 },
    ],
    houseVariants: [
      { weight: 0.62, roofScaleMul: [1.04, 1.0, 1.04], features: { flatRoofParapet: true } },
      { weight: 0.38, roofScaleMul: [0.96, 1.0, 0.96], features: { flatRoofParapet: true, windCatcher: true } },
    ],
    facadeKit: 'malabar-veranda',
    wallMatHint: 'mud',
  },
  'malabar-hindu': {
    wallPalette: [
      [0.68, 0.50, 0.35], [0.68, 0.50, 0.35],   // laterite
      [0.78, 0.64, 0.48],
      [0.84, 0.74, 0.56],
    ],
    roofPalette: [
      { color: [0.36, 0.25, 0.18], geo: 'cone', h: 1.12, mat: 'wood' },
      { color: [0.40, 0.28, 0.20], geo: 'cone', h: 1.15, mat: 'wood' },
      { color: [0.50, 0.38, 0.24], geo: 'cone', h: 1.18, mat: 'wood' },
      { color: [0.33, 0.48, 0.42], geo: 'cone', h: 1.1, mat: 'wood' },
    ],
    houseVariants: [
      { weight: 0.55, roofScaleMul: [1.20, 0.82, 1.20], roofYOffset: -0.08, features: { deepEaves: true } },
      { weight: 0.35, scaleMul: [1.0, 0.85, 1.0], roofScaleMul: [1.26, 0.78, 1.26], roofYOffset: -0.10, features: { deepEaves: true } },
      { weight: 0.10, roofScaleMul: [1.12, 0.88, 1.12], features: { deepEaves: true, ridgeCap: true } },
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
      { color: [0.74, 0.28, 0.24], geo: 'cone', h: 1.1 },
      { color: [0.86, 0.34, 0.30], geo: 'cone', h: 1.12 },
      { color: [0.58, 0.28, 0.22], geo: 'cone', h: 1.06 },
    ],
    houseVariants: [
      { weight: 0.45, roofScaleMul: [1.06, 0.95, 1.06], features: { ridgeCap: true } },
      { weight: 0.30, roofScaleMul: [1.12, 0.90, 1.12] },
      { weight: 0.25, scaleMul: [1.2, 1.0, 1.2], roofScaleMul: [1.05, 0.92, 1.05] },
    ],
    facadeKit: 'mughal-gujarati',
    wallMatHint: 'white',
  },
  'malay-stilted': {
    wallPalette: [
      [0.42, 0.30, 0.22], [0.42, 0.30, 0.22],
      [0.52, 0.40, 0.28],
      [0.62, 0.50, 0.36],
    ],
    roofPalette: [
      { color: [0.76, 0.68, 0.40], geo: 'cone', h: 1.45, mat: 'straw' },
      { color: [0.66, 0.56, 0.34], geo: 'cone', h: 1.5, mat: 'straw' },
      { color: [0.42, 0.30, 0.22], geo: 'cone', h: 1.35, mat: 'wood' },
    ],
    houseVariants: [
      { weight: 0.62, roofScaleMul: [1.18, 0.92, 1.18], features: { stilts: true, deepEaves: true } },
      { weight: 0.28, scaleMul: [1.2, 0.9, 1.2], roofScaleMul: [1.24, 0.88, 1.24], features: { stilts: true, deepEaves: true } },
      { weight: 0.10, scaleMul: [0.95, 1.05, 0.95], roofScaleMul: [1.08, 1.0, 1.08], features: { stilts: true } },
    ],
    facadeKit: 'malay-stilted',
    wallMatHint: 'wood',
  },
  'west-african-round': {
    wallPalette: [
      [0.72, 0.55, 0.35], [0.76, 0.58, 0.36],
      [0.68, 0.50, 0.30], [0.82, 0.64, 0.42],
      [0.62, 0.48, 0.32], [0.84, 0.46, 0.26],
      [0.70, 0.34, 0.20], [0.88, 0.54, 0.30],
    ],
    roofPalette: [
      { color: [0.72, 0.62, 0.36], geo: 'roundCone', h: 1.55, mat: 'straw' },
      { color: [0.82, 0.68, 0.34], geo: 'roundCone', h: 1.62, mat: 'straw' },
      { color: [0.92, 0.76, 0.40], geo: 'roundCone', h: 1.50, mat: 'straw' },
      { color: [0.64, 0.52, 0.30], geo: 'roundCone', h: 1.45, mat: 'straw' },
    ],
    houseVariants: [
      { weight: 0.38, scaleMul: [0.88, 0.88, 0.88], roofScaleMul: [1.16, 0.88, 1.16], features: { roundHut: true } },
      { weight: 0.34, scaleMul: [0.98, 0.82, 0.98], roofScaleMul: [1.22, 0.82, 1.22], features: { roundHut: true } },
      { weight: 0.28, scaleMul: [0.82, 0.96, 0.82], roofScaleMul: [1.10, 0.94, 1.10], features: { roundHut: true } },
    ],
    facadeKit: 'west-african-compound',
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
      { color: [0.86, 0.31, 0.28], geo: 'cone', h: 1.12 },
      { color: [0.84, 0.30, 0.27], geo: 'cone', h: 1.02 },
      { color: [0.66, 0.23, 0.20], geo: 'cone', h: 0.96 },
      { color: [0.70, 0.58, 0.32], geo: 'cone', h: 1.25, mat: 'straw' },   // thatch mix
    ],
    houseVariants: [
      { weight: 0.34, scaleMul: [1.25, 0.9, 1.25], roofScaleMul: [1.12, 0.90, 1.12], features: { veranda: true } },
      { weight: 0.28, roofScaleMul: [1.04, 1.02, 1.04] },
      { weight: 0.22, scaleMul: [0.9, 0.85, 0.9], roofScaleMul: [1.10, 0.96, 1.10] },
      { weight: 0.16, scaleMul: [0.84, 1.12, 0.88], roofScaleMul: [0.94, 1.18, 0.96] },
    ],
    facadeKit: 'iberian-colonial',
    shutterPalette: EU_SHUTTER_COLORS,
    wallMatHint: 'white',
  },
  'venetian-gothic': {
    // Istrian-stone whites, warm ochre and salmon stuccoes, weathered brick.
    // Roofs are flat-pitched terracotta tile; no thatch.
    wallPalette: [
      [0.92, 0.86, 0.74],   // pale Istrian limestone
      [0.92, 0.86, 0.74],
      [0.88, 0.74, 0.52],   // warm Venetian ochre stucco
      [0.86, 0.62, 0.48],   // salmon / coral stucco
      [0.78, 0.50, 0.40],   // weathered brick red
      [0.70, 0.42, 0.32],   // darker exposed brick
      [0.84, 0.78, 0.66],   // pale grey-cream stucco
    ],
    roofPalette: [
      { color: [0.68, 0.34, 0.25], geo: 'cone', h: 0.82 }, // low red-orange tile
      { color: [0.64, 0.30, 0.23], geo: 'cone', h: 0.82 },
      { color: [0.54, 0.24, 0.19], geo: 'cone', h: 0.8 },  // older weathered tile
      { color: [0.76, 0.40, 0.29], geo: 'cone', h: 0.84 }, // newer brighter tile
    ],
    houseVariants: [
      // Venetian buildings run tall and narrow — every footprint on the lagoon
      // is precious, so even modest case ran 3-4 stories and the merchant
      // palazzi reached 4-5. House base [3,3,3] × Y=1.85 ≈ 5.5u (≈ 3.5 stories);
      // estate base [6,5,6] × Y=1.85 ≈ 9.25u (≈ 4 stories). The narrow campo-
      // edge variant with Y=2.30 gives the occasional house-tower silhouette.
      { weight: 0.40, scaleMul: [0.85, 1.85, 0.90], roofScaleMul: [1.16, 0.70, 1.12], roofYOffset: -0.10, features: { ridgeCap: true } },
      { weight: 0.25, scaleMul: [1.00, 1.55, 1.00], roofScaleMul: [1.12, 0.74, 1.10], roofYOffset: -0.08, features: { ridgeCap: true } },
      { weight: 0.20, scaleMul: [1.10, 1.75, 1.10], roofScaleMul: [1.10, 0.72, 1.08], roofYOffset: -0.08, features: { ridgeCap: true } },
      { weight: 0.15, scaleMul: [0.70, 2.30, 0.80], roofScaleMul: [1.05, 0.68, 1.02], roofYOffset: -0.12, features: { ridgeCap: true } },
    ],
    facadeKit: 'iberian-colonial',
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
      { color: [0.86, 0.32, 0.29], geo: 'cone', h: 1.22 },
      { color: [0.66, 0.24, 0.20], geo: 'cone', h: 1.08 },
      { color: [0.76, 0.66, 0.38], geo: 'cone', h: 1.35, mat: 'straw' },
      { color: [0.68, 0.56, 0.32], geo: 'cone', h: 1.45, mat: 'straw' },
    ],
    houseVariants: [
      { weight: 0.28, roofScaleMul: [1.14, 0.92, 1.14], features: { veranda: true } },
      { weight: 0.24, roofScaleMul: [1.02, 1.04, 1.02] },
      { weight: 0.34, scaleMul: [0.85, 0.8, 0.85], roofGeoOverride: 'cone', roofHMul: 1.2, roofScaleMul: [1.10, 0.98, 1.10] },
      { weight: 0.14, scaleMul: [0.82, 1.10, 0.86], roofScaleMul: [0.94, 1.18, 0.96] },
    ],
    shutterPalette: EU_SHUTTER_COLORS,
    wallMatHint: 'white',
  },
  'japanese-tile': {
    // Nagasaki / Kyushu in 1612: white shikkui plaster and pale sand-toned
    // earthen walls framed by dark exposed timber posts and beams. Roofs are
    // deep-pitched hipped forms tiled in dark grey kawara; eaves run long.
    wallPalette: [
      [0.92, 0.90, 0.86],   // white shikkui plaster (dominant)
      [0.92, 0.90, 0.86],
      [0.88, 0.84, 0.76],   // pale earthen plaster
      [0.80, 0.72, 0.60],   // sand-toned daub
      [0.36, 0.26, 0.18],   // exposed dark cedar framing
      [0.48, 0.36, 0.24],   // weathered timber wall
    ],
    roofPalette: [
      { color: [0.26, 0.26, 0.28], geo: 'cone', h: 1.1 }, // dark grey kawara tile (dominant)
      { color: [0.26, 0.26, 0.28], geo: 'cone', h: 1.1 },
      { color: [0.30, 0.30, 0.32], geo: 'cone', h: 1.1 }, // slightly weathered tile
      { color: [0.22, 0.22, 0.24], geo: 'cone', h: 1.2 }, // soot-darkened older tile
      { color: [0.38, 0.32, 0.24], geo: 'cone', h: 1.3 }, // occasional cedar-shingle hip (poorer houses)
    ],
    houseVariants: [
      // Japanese vernacular runs low and long under deep eaves.
      { weight: 0.50, scaleMul: [1.15, 0.85, 1.15], roofScaleMul: [1.24, 0.78, 1.24], roofYOffset: -0.10, features: { deepEaves: true, ridgeCap: true } },
      { weight: 0.32, roofScaleMul: [1.18, 0.82, 1.18], roofYOffset: -0.08, features: { deepEaves: true, ridgeCap: true } },
      { weight: 0.18, scaleMul: [1.30, 0.75, 1.30], roofScaleMul: [1.30, 0.74, 1.30], roofYOffset: -0.12, features: { deepEaves: true, ridgeCap: true } },
    ],
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

export function cultureToFallbackStyle(culture: string): BuildingStyleDef {
  const wallPalette = WALL_PALETTES[culture] ?? WALL_PALETTES['Indian Ocean'];
  const roofPalette = ROOF_PALETTES[culture] ?? ROOF_PALETTES['Indian Ocean'];
  const wallMatHint: Part['mat'] =
    culture === 'Indian Ocean' || culture === 'West African' ? 'mud'
    : culture === 'European' || culture === 'Atlantic' ? 'white'
    : 'wood';
  const shutterPalette = (culture === 'European' || culture === 'Atlantic') ? EU_SHUTTER_COLORS : undefined;
  return { wallPalette, roofPalette, houseVariants: DEFAULT_HOUSE_VARIANTS, shutterPalette, wallMatHint };
}

export function resolveStyle(styleId: string | undefined, culture: string): BuildingStyleDef {
  if (styleId && BUILDING_STYLES[styleId as BuildingStyle]) {
    return BUILDING_STYLES[styleId as BuildingStyle]!;
  }
  return cultureToFallbackStyle(culture);
}

export function pickVariant(variants: HouseVariant[], rng: () => number): HouseVariant {
  const total = variants.reduce((s, v) => s + v.weight, 0);
  let r = rng() * total;
  for (const v of variants) {
    r -= v.weight;
    if (r <= 0) return v;
  }
  return variants[variants.length - 1];
}
