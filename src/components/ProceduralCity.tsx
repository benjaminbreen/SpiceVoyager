import { useMemo, useRef, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore, PORT_FACTION, PORT_CULTURAL_REGION } from '../store/gameStore';
import type { CulturalRegion, Nationality } from '../store/gameStore';
import type { BuildingStyle } from '../utils/portArchetypes';
import { buildingShakes, getBuildingDamageFraction, getBuildingDamageStage, getBuildingDamageVersion } from '../utils/impactShakeState';
import { sampleCityFields, sampleWorldFields } from '../utils/cityFields';
import type { CityFieldKey } from '../utils/cityFieldTypes';
import { DISTRICT_COLORS, classifyDistrict } from '../utils/cityDistricts';
import type { DistrictKey } from '../utils/cityDistricts';
import { buildingSemanticClass, SEMANTIC_STYLE } from '../utils/semanticClasses';
import {
  ROAD_TIER_STYLE,
  ROAD_POLYGON_OFFSET_UNITS,
  FARM_TRACK_WIDTH,
  FARM_TRACK_Y_LIFT,
  FARM_TRACK_OPACITY,
  BRIDGE_DECK_Y,
} from '../utils/roadStyle';
import { getTerrainHeight } from '../utils/terrain';
import { SEA_LEVEL } from '../constants/world';

interface Part {
  geo: 'box' | 'cylinder' | 'cone' | 'sphere' | 'dome';
  mat: 'white' | 'mud' | 'wood' | 'terracotta' | 'stone' | 'straw' | 'dark';
  pos: [number, number, number];
  scale: [number, number, number];
  rot: [number, number, number];
  color?: [number, number, number];
  buildingId?: string;
  shakeCenter?: [number, number, number];
  // Ground-hugging surfaces (dock decks, plaza paving) bucket into a parallel
  // material with polygonOffset so they win the depth tie against terrain
  // and water-overlay layers instead of z-fighting.
  overlay?: boolean;
}

interface TorchSpot {
  pos: [number, number, number];
}

interface SmokeSpot {
  pos: [number, number, number];
  seed: number; // per-chimney offset for staggered animation
}

interface DamageSmokeSpot extends SmokeSpot {
  intensity: number;
}

interface RuinMarker {
  pos: [number, number, number];
  scale: [number, number, number];
  rotY: number;
}

interface CityFieldOverlaySample {
  pos: [number, number, number];
  scale: [number, number, number];
  color: [number, number, number];
}

const BUILDING_SHAKE_DURATION = 0.28;
const BUILDING_SHAKE_SWAY = 0.18;

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

function lerpColor(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  const clamped = Math.max(0, Math.min(1, t));
  return [
    a[0] + (b[0] - a[0]) * clamped,
    a[1] + (b[1] - a[1]) * clamped,
    a[2] + (b[2] - a[2]) * clamped,
  ];
}

function ruinedColor(base: [number, number, number]): [number, number, number] {
  return lerpColor(base, [0.24, 0.22, 0.20], 0.72);
}

function damagedColor(base: [number, number, number], fraction: number): [number, number, number] {
  return lerpColor(base, [0.32, 0.29, 0.25], 0.18 + Math.min(0.45, fraction * 0.4));
}

function applyGroundWeathering(base: [number, number, number], part: Part): [number, number, number] {
  if (!part.buildingId || !part.shakeCenter) return base;
  if (part.mat === 'dark') return base;

  const buildingMidY = part.shakeCenter[1];
  const normalizedHeight = THREE.MathUtils.clamp((part.pos[1] - (buildingMidY - 2.6)) / 3.2, 0, 1);
  const groundFactor = 1 - normalizedHeight;
  if (groundFactor <= 0.01) return base;

  const soilTone: [number, number, number] = part.mat === 'wood'
    ? [0.24, 0.20, 0.16]
    : part.mat === 'stone'
      ? [0.34, 0.32, 0.29]
      : [0.40, 0.33, 0.24];

  const strength = part.mat === 'straw' ? 0.08 : 0.14;
  return lerpColor(base, soilTone, groundFactor * strength);
}

function isRoofLikePart(part: Part, centerY: number) {
  return (
    part.geo === 'cone' ||
    part.geo === 'dome' ||
    part.mat === 'terracotta' ||
    (part.mat === 'straw' && part.pos[1] > centerY - 0.2)
  );
}

function isDelicateDetailPart(part: Part, centerY: number) {
  const volume = part.scale[0] * part.scale[1] * part.scale[2];
  return part.pos[1] > centerY + 0.8 && volume < 0.65;
}

function isWindowLikePart(part: Part, centerY: number) {
  const volume = part.scale[0] * part.scale[1] * part.scale[2];
  return part.mat === 'dark' && volume < 0.08 && part.scale[1] <= 0.8 && part.pos[1] > centerY - 1.2;
}

function cityFieldColor(field: CityFieldKey, value: number): [number, number, number] {
  const t = Math.max(0, Math.min(1, value));
  switch (field) {
    case 'sanctity':
      return lerpColor([0.18, 0.66, 0.28], [0.58, 0.18, 0.82], t);
    case 'risk':
      return lerpColor([0.20, 0.78, 0.42], [0.96, 0.14, 0.10], t);
    case 'centrality':
      return lerpColor([0.14, 0.22, 0.44], [0.28, 0.86, 1.00], t);
    case 'access':
      return lerpColor([0.32, 0.22, 0.52], [0.18, 0.80, 0.98], t);
    case 'waterfront':
      return lerpColor([0.74, 0.58, 0.22], [0.10, 0.42, 0.98], t);
    case 'prominence':
      return lerpColor([0.22, 0.36, 0.54], [0.98, 0.82, 0.22], t);
    case 'nuisance':
      return lerpColor([0.18, 0.60, 0.74], [0.98, 0.38, 0.08], t);
    case 'prestige':
    default:
      return lerpColor([0.28, 0.26, 0.48], [1.00, 0.84, 0.22], t);
  }
}

function percentile(sortedValues: number[], t: number): number {
  if (sortedValues.length === 0) return 0;
  if (sortedValues.length === 1) return sortedValues[0];
  const clamped = Math.max(0, Math.min(1, t));
  const index = clamped * (sortedValues.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sortedValues[lower];
  const frac = index - lower;
  return sortedValues[lower] + (sortedValues[upper] - sortedValues[lower]) * frac;
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
      { color: [0.66, 0.36, 0.28], geo: 'cone', h: 0.9 },  // terracotta tile (dominant)
      { color: [0.66, 0.36, 0.28], geo: 'cone', h: 0.9 },
      { color: [0.58, 0.30, 0.24], geo: 'cone', h: 0.9 },  // older weathered tile
      { color: [0.74, 0.44, 0.32], geo: 'cone', h: 0.9 },  // newer brighter tile
    ],
    houseVariants: [
      // Venetian buildings run tall and narrow — every footprint on the lagoon
      // is precious, so even modest case ran 3-4 stories and the merchant
      // palazzi reached 4-5. House base [3,3,3] × Y=1.85 ≈ 5.5u (≈ 3.5 stories);
      // estate base [6,5,6] × Y=1.85 ≈ 9.25u (≈ 4 stories). The narrow campo-
      // edge variant with Y=2.30 gives the occasional house-tower silhouette.
      { weight: 0.40, scaleMul: [0.85, 1.85, 0.90] },     // typical 3-4 story case
      { weight: 0.25, scaleMul: [1.00, 1.55, 1.00] },     // solid 3-story merchant house
      { weight: 0.20, scaleMul: [1.10, 1.75, 1.10] },     // wider merchant palazzo
      { weight: 0.15, scaleMul: [0.70, 2.30, 0.80] },     // tall narrow campo-edge tower house
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
      { weight: 0.55, scaleMul: [1.15, 0.85, 1.15], features: { deepEaves: true } },
      { weight: 0.30,                               features: { deepEaves: true } },
      { weight: 0.15, scaleMul: [1.30, 0.75, 1.30], features: { deepEaves: true } }, // wider low farmhouse
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
  const [damageVersion, setDamageVersion] = useState(getBuildingDamageVersion());
  const damageVersionRef = useRef(damageVersion);

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

    const latestDamageVersion = getBuildingDamageVersion();
    if (latestDamageVersion !== damageVersionRef.current) {
      damageVersionRef.current = latestDamageVersion;
      setDamageVersion(latestDamageVersion);
    }
  });

  // Build all geometry parts + collect torch positions
  const { parts, torchSpots, smokeSpots } = useMemo(() => {
    const allParts: Part[] = [];
    const torches: TorchSpot[] = [];
    const smokeSpots: SmokeSpot[] = [];

    ports.forEach(port => {
      port.buildings.forEach((b, bi) => {
        let [w, h, d] = b.scale;
        const [x, y, z] = b.position;
        const rot = b.rotation;
        const c = port.culture;
        const rng = mulberry32(bi * 7919 + (x * 1000 | 0) + (z * 31 | 0));

        // Phase B form metadata: taller multi-story, setback (shrinks
        // footprint), and waterside warehouse stretch. Big-city urban-core
        // houses already get bumped footprints at generation time (see
        // cityGenerator's houseBaseSizeForCell), so the render-time growth
        // here is modest — just enough to stop 3-4 story buildings looking
        // like towers on a cottage plot.
        const stories = b.stories ?? 1;
        if (stories > 1) {
          h *= 1 + (stories - 1) * 0.55;
          const footprintGrowth = 1 + (stories - 1) * 0.12;
          w *= footprintGrowth;
          d *= footprintGrowth;
        }

        const setback = b.setback ?? 0;
        if (setback > 0.35 && (b.type === 'house' || b.type === 'estate')) {
          const footprintScale = 1 - (setback - 0.35) * 0.4;
          w *= footprintScale;
          d *= footprintScale;
        }

        if (b.type === 'warehouse' && b.district === 'waterside') {
          // Waterside warehouses read as long low sheds along the quay.
          const longAxis = w >= d ? 0 : 1;
          if (longAxis === 0) { w *= 1.5; d *= 0.95; }
          else                { w *= 0.95; d *= 1.5; }
        }

        const shakeCenter: [number, number, number] = [x, y + Math.max(h * 0.5, 1.2), z];
        const addPart = (geo: Part['geo'], mat: Part['mat'], lx: number, ly: number, lz: number, sw: number, sh: number, sd: number, colorOverride?: [number, number, number], overlay?: boolean) => {
          const rx = lx * Math.cos(rot) - lz * Math.sin(rot);
          const rz = lx * Math.sin(rot) + lz * Math.cos(rot);
          allParts.push({
            geo, mat,
            pos: [x + rx, y + ly, z + rz],
            scale: [sw, sh, sd],
            rot: [0, rot, 0],
            color: colorOverride ?? varyColor(BASE_COLORS[mat] ?? BASE_COLORS.dark, rng),
            buildingId: b.id,
            shakeCenter,
            overlay,
          });
        };

        // Helper to add a torch at a local offset from this building.
        // Bracket spans world y = (y + ly) - 0.6 .. (y + ly); flame sits at
        // world y = y + ly. If the building anchors near or below sea level
        // (waterside docks, stilted houses, etc.) the bracket bottom can dip
        // under the water plane and the flame ends up half-submerged. Lift
        // the whole torch by whatever is needed to clear sea level + margin.
        const addTorch = (lx: number, ly: number, lz: number) => {
          const minBracketBottom = SEA_LEVEL + 0.05;
          const bracketBottomWorld = y + ly - 0.6;
          const lift = Math.max(0, minBracketBottom - bracketBottomWorld);
          const lyAdj = ly + lift;
          const rx = lx * Math.cos(rot) - lz * Math.sin(rot);
          const rz = lx * Math.sin(rot) + lz * Math.cos(rot);
          torches.push({ pos: [x + rx, y + lyAdj, z + rz] });
          // Torch bracket (small wood cylinder)
          addPart('cylinder', 'wood', lx, lyAdj - 0.3, lz, 0.08, 0.6, 0.08);
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

        // ── Dedicated landmark buildings ────────────────────────────────
        // type === 'landmark' carries a required landmarkId; draw that
        // landmark's geometry at its own position and skip the generic
        // per-type render below. Each landmark's placement rule lives in
        // cityGenerator.ts (LANDMARK_RULES); the renderer's job is only
        // to draw the shape around local origin (0,0,0) — rotation + world
        // translation are applied by addPart.
        if (b.type === 'landmark' && b.landmarkId) {
          const lm = b.landmarkId;
          const _lmStart = allParts.length;

          if (lm === 'tower-of-london') {
            const stoneColor = varyColor([0.88, 0.86, 0.80], rng, 0.04);
            const keepW = 6;
            const keepH = 10;
            addPart('box', 'stone', 0, 0.6, 0, keepW + 4, 1.2, keepW + 4, varyColor([0.78, 0.76, 0.70], rng, 0.04));
            addPart('box', 'white', 0, keepH / 2 + 1.2, 0, keepW, keepH, keepW, stoneColor);
            const turretH = keepH + 3;
            const turretR = 0.85;
            for (const [cx, cz] of [
              [ keepW / 2 - turretR * 0.4,  keepW / 2 - turretR * 0.4],
              [-keepW / 2 + turretR * 0.4,  keepW / 2 - turretR * 0.4],
              [ keepW / 2 - turretR * 0.4, -keepW / 2 + turretR * 0.4],
              [-keepW / 2 + turretR * 0.4, -keepW / 2 + turretR * 0.4],
            ] as [number, number][]) {
              addPart('cylinder', 'white', cx, turretH / 2 + 1.2, cz, turretR, turretH, turretR, stoneColor);
              addPart('cone', 'stone', cx, turretH + 1.6, cz, turretR + 0.15, 1.1, turretR + 0.15, [0.55, 0.55, 0.58]);
            }
            addPart('box', 'stone', 0, 2.2, keepW / 2 + 1.0, 2.2, 3.4, 0.9, varyColor([0.70, 0.68, 0.62], rng, 0.04));
            addPart('box', 'dark', 0, 1.6, keepW / 2 + 1.5, 1.4, 2.2, 0.2);
            addPart('cylinder', 'wood', 0, keepH + 3.0, 0, 0.1, 3.5, 0.1);
            addPart('box', 'straw', 0.55, keepH + 4.2, 0, 1.1, 0.65, 0.05, [0.85, 0.10, 0.10]);
            addTorch(1.2, 1.2, keepW / 2 + 1.6);
            addTorch(-1.2, 1.2, keepW / 2 + 1.6);
          }

          else if (lm === 'belem-tower') {
            // Torre de Belém — slim 4-tier limestone tower on the waterline.
            const stone = varyColor([0.92, 0.88, 0.78], rng, 0.04);
            addPart('box', 'white', 0, 1.0, 0, 4, 2, 4, stone);
            addPart('box', 'white', 0, 4.0, 0, 2.6, 4, 2.6, stone);
            addPart('box', 'white', 0, 7.5, 0, 2.2, 3, 2.2, stone);
            addPart('box', 'white', 0, 10.0, 0, 1.8, 2, 1.8, stone);
            for (const [cx, cz] of [[1.0, 1.0], [-1.0, 1.0], [1.0, -1.0], [-1.0, -1.0]] as [number, number][]) {
              addPart('cylinder', 'white', cx, 8.5, cz, 0.35, 1.2, 0.35, stone);
              addPart('cone', 'stone', cx, 9.4, cz, 0.45, 0.7, 0.45, [0.60, 0.55, 0.50]);
            }
            addPart('cone', 'stone', 0, 11.5, 0, 0.9, 1.2, 0.9, [0.55, 0.55, 0.55]);
            addPart('box', 'stone', 0, 12.6, 0, 0.10, 0.6, 0.10);
          }

          else if (lm === 'oude-kerk-spire') {
            // Oude Kerk — squat brick nave with tall thin wooden spire at one end.
            const brick = varyColor([0.55, 0.32, 0.24], rng, 0.05);
            const lead: [number, number, number] = [0.40, 0.42, 0.45];
            addPart('box', 'mud', 0, 2.0, 0, 4, 4, 7, brick);
            addPart('cone', 'stone', 0, 5.2, 0, 2.4, 1.8, 4.0, lead);
            addPart('box', 'mud', 0, 3.5, -4.5, 2.4, 7, 2.4, brick);
            addPart('cone', 'wood', 0, 8.5, -4.5, 1.4, 2.0, 1.4, lead);
            addPart('cylinder', 'wood', 0, 10.5, -4.5, 0.5, 2.0, 0.5, lead);
            addPart('cone', 'wood', 0, 12.5, -4.5, 0.7, 1.6, 0.7, lead);
            addPart('cone', 'wood', 0, 14.8, -4.5, 0.25, 3.0, 0.25, lead);
          }

          else if (lm === 'giralda-tower') {
            // Seville — Almohad minaret + Renaissance belfry + Giraldillo.
            const almohad = varyColor([0.82, 0.62, 0.42], rng, 0.04);
            const renaissance = varyColor([0.92, 0.88, 0.78], rng, 0.03);
            const shaftW = 3.2, shaftH = 16;
            addPart('box', 'white', 0, 0.6, 0, shaftW + 0.4, 1.2, shaftW + 0.4, almohad);
            addPart('box', 'white', 0, shaftH / 2 + 1.2, 0, shaftW, shaftH, shaftW, almohad);
            addPart('box', 'white', 0, shaftH + 1.3, 0, shaftW + 0.2, 0.3, shaftW + 0.2, [0.55, 0.45, 0.30]);
            addPart('box', 'white', 0, shaftH + 2.8, 0, shaftW - 0.5, 2.4, shaftW - 0.5, renaissance);
            addPart('box', 'white', 0, shaftH + 4.6, 0, shaftW - 1.0, 1.2, shaftW - 1.0, renaissance);
            addPart('cylinder', 'white', 0, shaftH + 5.8, 0, (shaftW - 1.4) * 0.5, 1.2, (shaftW - 1.4) * 0.5, renaissance);
            addPart('cone', 'stone', 0, shaftH + 7.0, 0, (shaftW - 1.6) * 0.5, 1.6, (shaftW - 1.6) * 0.5, [0.60, 0.55, 0.45]);
            addPart('cylinder', 'wood', 0, shaftH + 8.0, 0, 0.08, 1.2, 0.08, [0.75, 0.65, 0.30]);
            addPart('box', 'straw', 0, shaftH + 8.6, 0, 0.4, 0.4, 0.05, [0.85, 0.75, 0.35]);
          }

          else if (lm === 'bom-jesus-basilica') {
            // Goa — Basilica of Bom Jesus. Jesuit single-nave church.
            const wash = varyColor([0.94, 0.92, 0.86], rng, 0.04);
            const tile: [number, number, number] = [0.52, 0.28, 0.22];
            addPart('box', 'white', 0, 3.0, 0, 4, 6, 9, wash);
            addPart('cone', 'terracotta', 0, 7.0, 0, 2.2, 1.6, 5.0, tile);
            addPart('box', 'white', 0, 4.5, 4.5, 5, 9, 0.4, wash);
            addPart('box', 'white', 0, 9.2, 4.5, 3.4, 0.5, 0.4, wash);
            addPart('cone', 'terracotta', 0, 10.0, 4.5, 1.8, 1.0, 0.4, tile);
            addPart('box', 'white', 0, 10.8, 4.5, 1.8, 0.4, 0.4, wash);
            addPart('cone', 'terracotta', 0, 11.4, 4.5, 0.9, 0.8, 0.4, tile);
            addPart('box', 'dark', 0, 1.8, 4.75, 1.3, 3.2, 0.2);
            addPart('box', 'white', 3.0, 4.0, 3.0, 2, 8, 2, wash);
            addPart('cone', 'terracotta', 3.0, 8.8, 3.0, 1.3, 1.4, 1.3, tile);
            addPart('box', 'stone', 3.0, 10.0, 3.0, 0.10, 0.7, 0.10);
            addPart('box', 'stone', 3.0, 10.1, 3.0, 0.5, 0.10, 0.10);
          }

          else if (lm === 'fort-jesus') {
            // Mombasa — Portuguese star fort with angular bastions, coral-stone.
            const wall = varyColor([0.88, 0.84, 0.74], rng, 0.04);
            const fortW = 7, fortH = 5;
            addPart('box', 'white', 0, fortH / 2, 0, fortW, fortH, fortW, wall);
            const bRad = 1.6;
            for (const [cx, cz] of [
              [ fortW / 2,  fortW / 2], [-fortW / 2,  fortW / 2],
              [ fortW / 2, -fortW / 2], [-fortW / 2, -fortW / 2],
            ] as [number, number][]) {
              addPart('cylinder', 'white', cx, fortH / 2 + 0.5, cz, bRad, fortH + 1, bRad, wall);
              addPart('cone', 'stone', cx, fortH + 1.4, cz, bRad + 0.1, 0.6, bRad + 0.1, [0.55, 0.55, 0.55]);
            }
            addPart('box', 'dark', 0, fortH * 0.35, fortW / 2 + 0.05, 1.6, fortH * 0.55, 0.15);
            addPart('cylinder', 'wood', fortW / 2, fortH + 4, fortW / 2, 0.06, 3, 0.06);
            addPart('box', 'straw', fortW / 2 + 0.45, fortH + 5, fortW / 2, 0.8, 0.5, 0.05, [0.85, 0.15, 0.15]);
          }

          else if (lm === 'calicut-gopuram') {
            // Calicut — Kerala Hindu temple: copper-green tiered roofs + flag mast.
            const laterite = varyColor([0.78, 0.55, 0.38], rng, 0.04);
            const teak = varyColor([0.45, 0.30, 0.20], rng, 0.05);
            const copper: [number, number, number] = [0.32, 0.58, 0.52];
            const brass: [number, number, number] = [0.82, 0.68, 0.28];
            addPart('box', 'mud', 0, 0.4, 0, 6, 0.8, 6, laterite);
            addPart('box', 'mud', 0, 1.1, 0, 5, 0.6, 5, laterite);
            addPart('box', 'wood', 0, 2.5, 0, 4, 2, 4, teak);
            addPart('cone', 'wood', 0, 4.3, 0, 3.2, 1.4, 3.2, copper);
            addPart('box', 'wood', 0, 5.3, 0, 2.4, 0.8, 2.4, teak);
            addPart('cone', 'wood', 0, 6.3, 0, 2.0, 1.0, 2.0, copper);
            addPart('cylinder', 'wood', 0, 7.1, 0, 0.15, 0.6, 0.15, brass);
            addPart('cone', 'wood', 0, 7.7, 0, 0.3, 0.5, 0.3, brass);
            addPart('cylinder', 'wood', 3.6, 3.5, 0, 0.12, 7, 0.12, brass);
            addPart('cone', 'wood', 3.6, 7.2, 0, 0.22, 0.6, 0.22, brass);
          }

          else if (lm === 'al-shadhili-mosque') {
            // Mocha — Sufi shrine of al-Shadhili.
            const wash = varyColor([0.94, 0.92, 0.86], rng, 0.04);
            addPart('box', 'white', 0, 1.5, 0, 1.6, 3, 1.6, wash);
            addPart('cylinder', 'white', 0, 6.5, 0, 0.6, 7, 0.6, wash);
            addPart('cylinder', 'white', 0, 10.2, 0, 0.85, 0.4, 0.85, wash);
            addPart('cylinder', 'white', 0, 11.0, 0, 0.5, 1.0, 0.5, wash);
            addPart('sphere', 'white', 0, 12.0, 0, 0.55, 0.9, 0.55, wash);
            addPart('cone', 'straw', 0, 13.0, 0, 0.12, 0.6, 0.12, [0.85, 0.75, 0.2]);
            addPart('box', 'white', 2.5, 1.5, 0, 4, 3, 4, wash);
            addPart('dome', 'white', 2.5, 3.0, 0, 1.6, 1.6, 1.6, wash);
          }

          else if (lm === 'grand-mosque-tiered') {
            // Bantam — Mesjid Agung with five Javanese stacked roofs.
            const wall = varyColor([0.86, 0.78, 0.62], rng, 0.04);
            const tile: [number, number, number] = [0.30, 0.22, 0.18];
            addPart('box', 'white', 0, 2, 0, 6, 4, 6, wall);
            for (const [yc, hh, hw, hd] of [
              [4.6, 0.5, 4.0, 4.0],
              [5.6, 0.45, 3.3, 3.3],
              [6.5, 0.4, 2.6, 2.6],
              [7.3, 0.35, 1.9, 1.9],
              [8.0, 0.3, 1.3, 1.3],
            ] as [number, number, number, number][]) {
              addPart('cone', 'wood', 0, yc, 0, hw, hh * 2, hd, tile);
            }
            addPart('cylinder', 'wood', 0, 8.5, 0, 0.15, 0.5, 0.15, [0.55, 0.45, 0.30]);
            addPart('box', 'white', 0, 0.4, 4.5, 6, 0.8, 0.3, wall);
            addPart('box', 'white', 0, 0.4, -4.5, 6, 0.8, 0.3, wall);
          }

          else if (lm === 'diu-fortress') {
            // Diu — Portuguese sea-fortress, long coastal wall + four bastions.
            const wall = varyColor([0.88, 0.84, 0.72], rng, 0.04);
            const wallLen = 14, wallH = 4;
            addPart('box', 'white', 0, wallH / 2, 0, 3, wallH, wallLen, wall);
            for (const bz of [-5.0, -1.7, 1.7, 5.0]) {
              addPart('cylinder', 'white', 1.5, wallH / 2 + 0.3, bz, 1.6, wallH + 0.6, 1.6, wall);
              addPart('cone', 'stone', 1.5, wallH + 0.9, bz, 1.7, 0.5, 1.7, [0.55, 0.55, 0.55]);
            }
            addPart('box', 'white', -0.5, wallH + 1.5, 0, 3.5, wallH, 3.5, wall);
            addPart('cone', 'stone', -0.5, wallH * 2 + 1.9, 0, 2.2, 0.8, 2.2, [0.60, 0.58, 0.54]);
            addPart('box', 'dark', 1.5, wallH * 0.3, 0, 0.2, wallH * 0.5, 1.6);
            addPart('cylinder', 'wood', -0.5, wallH * 2 + 3.5, 0, 0.08, 3, 0.08);
            addPart('box', 'straw', -0.05, wallH * 2 + 4.5, 0, 0.9, 0.6, 0.05, [0.85, 0.15, 0.15]);
          }

          else if (lm === 'elmina-castle') {
            // São Jorge da Mina — whitewashed square castle on the headland.
            const wash = varyColor([0.92, 0.88, 0.78], rng, 0.04);
            const castleW = 8, wallH = 4;
            addPart('box', 'white', 0, wallH / 2, 0, castleW, wallH, castleW, wash);
            addPart('box', 'white', 0, wallH + 2, -1, castleW - 3, 4, castleW - 3, wash);
            addPart('box', 'white', 0, wallH + 4.4, -1, castleW - 4.2, 0.8, castleW - 4.2, [0.86, 0.82, 0.72]);
            const bRad = 1.1;
            for (const [cx, cz] of [
              [ castleW / 2,  castleW / 2], [-castleW / 2,  castleW / 2],
              [ castleW / 2, -castleW / 2], [-castleW / 2, -castleW / 2],
            ] as [number, number][]) {
              addPart('cylinder', 'white', cx, wallH / 2 + 0.4, cz, bRad, wallH + 0.8, bRad, wash);
              addPart('cone', 'stone', cx, wallH + 1.2, cz, bRad + 0.1, 0.5, bRad + 0.1, [0.55, 0.55, 0.55]);
            }
            addPart('box', 'dark', 0, wallH * 0.35, castleW / 2 + 0.05, 1.6, wallH * 0.55, 0.15);
            addPart('cylinder', 'wood', 0, wallH + 7.0, -1, 0.08, 3, 0.08);
            addPart('box', 'straw', 0.5, wallH + 8.0, -1, 0.9, 0.6, 0.05, [0.85, 0.15, 0.15]);
          }

          else if (lm === 'jesuit-college') {
            // Salvador — Jesuit College, twin bell towers, long two-story block.
            const wash = varyColor([0.93, 0.91, 0.84], rng, 0.04);
            const tile: [number, number, number] = [0.55, 0.28, 0.22];
            addPart('box', 'white', 0, 3.0, 0, 10, 6, 5, wash);
            addPart('box', 'white', 0, 6.5, 2.5, 4, 1.0, 0.3, wash);
            addPart('cone', 'terracotta', 0, 7.5, 2.4, 2.5, 1.0, 0.4, tile);
            addPart('cone', 'terracotta', 0, 7.0, 0, 5.5, 1.6, 3.0, tile);
            for (const tx of [-3.5, 3.5]) {
              addPart('box', 'white', tx, 4.5, 1.8, 1.6, 9, 1.6, wash);
              addPart('box', 'white', tx, 9.6, 1.8, 1.4, 1.4, 1.4, [0.85, 0.82, 0.74]);
              addPart('cone', 'terracotta', tx, 11.0, 1.8, 1.0, 1.6, 1.0, tile);
              addPart('box', 'stone', tx, 12.4, 1.8, 0.10, 0.8, 0.10);
              addPart('box', 'stone', tx, 12.6, 1.8, 0.5, 0.10, 0.10);
            }
            addPart('box', 'dark', 0, 1.5, 2.55, 1.2, 2.6, 0.10);
          }

          else if (lm === 'palacio-inquisicion') {
            // Cartagena — Tribunal of the Holy Office, long balcony, tall portal.
            const wash = varyColor([0.95, 0.93, 0.86], rng, 0.04);
            const tile: [number, number, number] = [0.62, 0.30, 0.24];
            const woodTrim = varyColor([0.30, 0.20, 0.14], rng, 0.05);
            addPart('box', 'white', 0, 2.5, 0, 9, 5, 6, wash);
            addPart('cone', 'terracotta', 0, 5.7, 0, 5.0, 1.4, 3.5, tile);
            addPart('box', 'white', 0, 3.0, 3.05, 2.2, 6, 0.25, [0.84, 0.78, 0.62]);
            addPart('box', 'dark', 0, 2.0, 3.20, 1.4, 4, 0.10);
            addPart('box', 'dark', 0, 5.4, 3.20, 0.9, 0.9, 0.10);
            addPart('box', 'stone', 0, 5.4, 3.30, 0.10, 0.7, 0.05);
            addPart('box', 'stone', 0, 5.4, 3.30, 0.5, 0.10, 0.05);
            addPart('box', 'wood', 0, 3.4, 3.20, 8, 0.2, 0.7, woodTrim);
            for (const bx of [-3.0, -1.5, 0.0, 1.5, 3.0]) {
              if (Math.abs(bx) < 0.6) continue;
              addPart('cylinder', 'wood', bx, 3.9, 3.45, 0.06, 1.0, 0.06, woodTrim);
            }
            addPart('box', 'wood', 0, 4.4, 3.45, 8, 0.08, 0.08, woodTrim);
            addPart('box', 'white', 3.5, 6.5, -0.5, 0.9, 1.6, 0.9, wash);
            addPart('cone', 'terracotta', 3.5, 7.6, -0.5, 0.7, 0.8, 0.7, tile);
          }

          else if (lm === 'colegio-sao-paulo') {
            // Macau — Jesuit Colégio de São Paulo. Dominant feature is the
            // ornate stone facade (what survived as the Ruins of St. Paul's);
            // behind it, a long monastic college block with tile roofs. A
            // small observatory dome nods to the Jesuit astronomers here.
            const stone = varyColor([0.90, 0.86, 0.74], rng, 0.04);
            const tile: [number, number, number] = [0.58, 0.28, 0.22];
            const dark = varyColor([0.22, 0.16, 0.12], rng, 0.04);
            const lead: [number, number, number] = [0.52, 0.54, 0.56];
            // Main college block behind the facade
            addPart('box', 'white', 0, 2.2, -1.5, 7, 4.4, 5, stone);
            addPart('cone', 'terracotta', 0, 5.2, -1.5, 3.8, 1.3, 3.0, tile);
            // Second wing, lower
            addPart('box', 'white', 3.6, 1.6, -1.5, 3, 3.2, 4, stone);
            addPart('cone', 'terracotta', 3.6, 3.8, -1.5, 1.8, 0.9, 2.4, tile);
            // Ornate carved facade — the iconic survivor
            addPart('box', 'white', 0, 3.4, 1.9, 6.4, 6.8, 0.5, stone);
            // Facade tiers (stepped top)
            addPart('box', 'white', 0, 6.9, 1.9, 5.0, 0.4, 0.6, stone);
            addPart('box', 'white', 0, 7.8, 1.9, 3.6, 1.2, 0.55, stone);
            addPart('box', 'white', 0, 9.0, 1.9, 2.2, 0.8, 0.55, stone);
            // Cross crowning the facade
            addPart('box', 'stone', 0, 10.1, 1.9, 0.12, 0.9, 0.12, dark);
            addPart('box', 'stone', 0, 10.3, 1.9, 0.55, 0.12, 0.12, dark);
            // Arched entry portal + windows (dark rectangles on facade)
            addPart('box', 'dark', 0, 1.6, 2.18, 1.3, 3.0, 0.12);
            addPart('box', 'dark', -2.1, 4.5, 2.18, 0.8, 1.4, 0.10);
            addPart('box', 'dark',  2.1, 4.5, 2.18, 0.8, 1.4, 0.10);
            addPart('box', 'dark', -2.1, 6.4, 2.18, 0.6, 0.9, 0.10);
            addPart('box', 'dark',  2.1, 6.4, 2.18, 0.6, 0.9, 0.10);
            // Observatory dome — small lead-covered cap on the rear wing roof
            addPart('dome', 'white', -3.0, 5.0, -1.5, 0.9, 0.9, 0.9, lead);
            addPart('cylinder', 'wood', -3.0, 5.9, -1.5, 0.08, 0.45, 0.08, dark);
          }

          else if (lm === 'english-factory-surat') {
            // Surat — walled English East India Company compound on the
            // riverside. Rectangular fortified enclosure; two-story main
            // factor's house at the rear; warehouses along the flanks;
            // central yard with flagpole + English cross.
            const brick = varyColor([0.72, 0.52, 0.38], rng, 0.05);
            const whitewash = varyColor([0.92, 0.88, 0.78], rng, 0.04);
            const tile: [number, number, number] = [0.60, 0.32, 0.24];
            const wood = varyColor([0.36, 0.24, 0.16], rng, 0.04);
            // Perimeter walls — four sides around a 8×8 yard
            addPart('box', 'mud', 0, 1.5, 4.0, 9, 3, 0.5, brick);
            addPart('box', 'mud', 0, 1.5, -4.0, 9, 3, 0.5, brick);
            addPart('box', 'mud', 4.5, 1.5, 0, 0.5, 3, 8, brick);
            addPart('box', 'mud', -4.5, 1.5, 0, 0.5, 3, 8, brick);
            // Main factor's house, rear of compound — two stories
            addPart('box', 'white', 0, 2.2, -2.6, 6, 4.4, 2.5, whitewash);
            addPart('cone', 'terracotta', 0, 5.2, -2.6, 3.4, 1.3, 1.8, tile);
            addPart('box', 'dark', 0, 1.6, -1.35, 1.0, 2.2, 0.12);
            // Side warehouses — long and low along the inner walls
            addPart('box', 'mud', -3.4, 1.4, 1.2, 1.6, 2.6, 5, brick);
            addPart('cone', 'wood', -3.4, 3.0, 1.2, 1.0, 0.8, 3.0, tile);
            addPart('box', 'mud', 3.4, 1.4, 1.2, 1.6, 2.6, 5, brick);
            addPart('cone', 'wood', 3.4, 3.0, 1.2, 1.0, 0.8, 3.0, tile);
            // Main gate — wider opening in front wall (sim'd with a darker
            // panel + wooden posts flanking)
            addPart('box', 'dark', 0, 1.3, 4.0, 2.0, 2.2, 0.12);
            addPart('cylinder', 'wood', -1.1, 1.5, 4.0, 0.18, 3.0, 0.18, wood);
            addPart('cylinder', 'wood',  1.1, 1.5, 4.0, 0.18, 3.0, 0.18, wood);
            // Central flagpole in the yard + red-cross of St George
            addPart('cylinder', 'wood', 0, 3.5, 0, 0.10, 7, 0.10, wood);
            addPart('box', 'white', 0.85, 5.6, 0, 1.4, 0.9, 0.06, [0.96, 0.96, 0.96]);
            addPart('box', 'stone', 0.85, 5.6, 0, 1.4, 0.18, 0.07, [0.78, 0.15, 0.15]);
            addPart('box', 'stone', 0.85, 5.6, 0, 0.20, 0.9, 0.07, [0.78, 0.15, 0.15]);
            // A few crates in the yard (trading goods)
            addPart('box', 'wood', -1.8, 0.35, 1.6, 0.7, 0.7, 0.7, wood);
            addPart('box', 'wood', -1.0, 0.30, 1.6, 0.6, 0.6, 0.6, wood);
            addPart('box', 'wood',  1.7, 0.35, 1.8, 0.7, 0.7, 0.7, wood);
          }

          else if (lm === 'san-agustin-manila') {
            // Manila — Iglesia de San Agustín, built 1607 in volcanic adobe
            // and Mexican-baroque limestone. Twin-tower facade flanking a
            // single-nave church with a low tile roof. (One bell tower
            // collapsed in the 1863 earthquake, but in 1612 both stood.)
            const adobe = varyColor([0.86, 0.78, 0.62], rng, 0.05);
            const stone = varyColor([0.92, 0.88, 0.78], rng, 0.04);
            const tile: [number, number, number] = [0.62, 0.34, 0.26];
            const wood = varyColor([0.36, 0.24, 0.16], rng, 0.04);
            // Single long nave
            const naveW = 4.0, naveH = 5.5, naveD = 9.0;
            addPart('box', 'white', 0, naveH / 2, 0, naveW, naveH, naveD, adobe);
            // Low tile roof over the nave
            addPart('cone', 'terracotta', 0, naveH + 0.9, 0, naveW * 0.55, 1.5, naveD * 0.55, tile);
            // Facade slab fronting the nave (slightly taller than the side walls)
            addPart('box', 'white', 0, naveH * 0.55, naveD / 2 + 0.3, naveW + 1.5, naveH + 1.5, 0.5, stone);
            // Twin bell towers flanking the facade
            const towerW = 1.5, towerH = naveH + 4;
            for (const sx of [-1, 1] as const) {
              const tx = sx * (naveW / 2 + 0.6);
              addPart('box', 'white', tx, towerH / 2, naveD / 2 + 0.4, towerW, towerH, towerW, stone);
              addPart('cone', 'terracotta', tx, towerH + 0.7, naveD / 2 + 0.4, towerW * 0.6, 1.4, towerW * 0.6, tile);
              // Tiny cross atop each tower
              addPart('cylinder', 'wood', tx, towerH + 1.6, naveD / 2 + 0.4, 0.07, 0.6, 0.07, wood);
              addPart('box', 'stone', tx, towerH + 1.85, naveD / 2 + 0.4, 0.4, 0.08, 0.08, [0.55, 0.50, 0.45]);
              addPart('box', 'stone', tx, towerH + 1.85, naveD / 2 + 0.4, 0.08, 0.4, 0.08, [0.55, 0.50, 0.45]);
            }
            // Central pediment + cross between the towers
            addPart('cone', 'stone', 0, naveH + 1.8, naveD / 2 + 0.45, 1.2, 0.9, 0.18, stone);
            addPart('cylinder', 'wood', 0, naveH + 2.7, naveD / 2 + 0.45, 0.08, 0.9, 0.08, wood);
            // Heavy wooden church doors at the facade base
            addPart('box', 'dark', 0, 1.4, naveD / 2 + 0.55, 1.4, 2.8, 0.10);
          }

          else if (lm === 'campanile-san-marco') {
            // Venice — slim square brick campanile, terracotta cap with a
            // gilded angel finial. The 1612 tower (the medieval one, not
            // the 1912 reconstruction) was leaner and more weathered.
            const brick = varyColor([0.62, 0.36, 0.28], rng, 0.05);
            const istrian = varyColor([0.92, 0.86, 0.74], rng, 0.04);
            const tile: [number, number, number] = [0.55, 0.30, 0.24];
            const gold: [number, number, number] = [0.92, 0.74, 0.20];
            const shaftW = 1.6, shaftH = 18;
            // Stepped base in pale Istrian stone
            addPart('box', 'white', 0, 0.5, 0, shaftW + 0.9, 1.0, shaftW + 0.9, istrian);
            addPart('box', 'white', 0, 1.3, 0, shaftW + 0.5, 0.6, shaftW + 0.5, istrian);
            // Tall slender brick shaft
            addPart('box', 'mud', 0, shaftH / 2 + 1.6, 0, shaftW, shaftH, shaftW, brick);
            // Belfry — open arched chamber in pale stone at the top of the shaft
            addPart('box', 'white', 0, shaftH + 2.4, 0, shaftW + 0.3, 1.6, shaftW + 0.3, istrian);
            // Cornice band
            addPart('box', 'stone', 0, shaftH + 3.4, 0, shaftW + 0.6, 0.25, shaftW + 0.6, [0.55, 0.50, 0.42]);
            // Pyramidal terracotta cap
            addPart('cone', 'terracotta', 0, shaftH + 4.6, 0, (shaftW + 0.4) * 0.5, 2.4, (shaftW + 0.4) * 0.5, tile);
            // Slim spire and gilded angel weathervane
            addPart('cylinder', 'wood', 0, shaftH + 6.4, 0, 0.08, 1.4, 0.08, [0.45, 0.32, 0.20]);
            addPart('box', 'stone', 0, shaftH + 7.3, 0, 0.45, 0.55, 0.10, gold);
          }

          else if (lm === 'church-of-the-assumption') {
            // Nagasaki — Iglesia de la Assunção, dedicated 1601 by the
            // Society of Jesus. The largest Christian church in East Asia
            // until the 1614 expulsion. Hybrid: European basilica massing
            // executed in Japanese carpentry, with a dark kawara-tile hipped
            // roof and deep eaves over whitewashed plaster walls. A single
            // square bell tower rises at the rear.
            const wash = varyColor([0.92, 0.90, 0.86], rng, 0.04);
            const frame = varyColor([0.32, 0.22, 0.14], rng, 0.04);
            const kawara: [number, number, number] = [0.26, 0.26, 0.28];
            const wood = varyColor([0.40, 0.28, 0.18], rng, 0.04);
            // Long single nave — low and broad under deep eaves
            const naveW = 5.0, naveH = 4.8, naveD = 9.5;
            addPart('box', 'white', 0, naveH / 2, 0, naveW, naveH, naveD, wash);
            // Dark timber sill band along the base (exposed cedar framing)
            addPart('box', 'dark', 0, 0.35, naveD / 2 + 0.01, naveW, 0.7, 0.08, frame);
            addPart('box', 'dark', 0, 0.35, -naveD / 2 - 0.01, naveW, 0.7, 0.08, frame);
            // Deep-eaved hipped tile roof, projecting well beyond the walls
            addPart('cone', 'terracotta', 0, naveH + 1.1, 0, naveW * 0.72, 1.7, naveD * 0.62, kawara);
            // Front gable / facade — slightly taller, whitewashed, with a
            // small pediment and cross
            addPart('box', 'white', 0, naveH * 0.55 + 0.3, naveD / 2 + 0.25, naveW + 0.6, naveH + 1.2, 0.4, wash);
            addPart('cone', 'terracotta', 0, naveH + 1.6, naveD / 2 + 0.25, (naveW + 0.6) * 0.55, 1.0, 0.22, kawara);
            // Facade cross
            addPart('cylinder', 'wood', 0, naveH + 2.7, naveD / 2 + 0.25, 0.08, 0.9, 0.08, wood);
            addPart('box', 'stone', 0, naveH + 3.0, naveD / 2 + 0.28, 0.45, 0.09, 0.09, [0.55, 0.48, 0.40]);
            // Square bell tower at the rear — post-and-beam Japanese style
            const towerW = 1.6, towerH = naveH + 3.8;
            addPart('box', 'white', 0, towerH / 2, -naveD / 2 - 0.3, towerW, towerH, towerW, wash);
            // Exposed corner posts on the tower
            for (const sx of [-1, 1] as const) {
              for (const sz of [-1, 1] as const) {
                addPart('box', 'dark',
                  sx * towerW / 2,
                  towerH / 2,
                  -naveD / 2 - 0.3 + sz * towerW / 2,
                  0.16, towerH, 0.16, frame);
              }
            }
            // Deep-eaved pyramidal tile cap on the tower
            addPart('cone', 'terracotta', 0, towerH + 0.9, -naveD / 2 - 0.3, towerW * 0.95, 1.5, towerW * 0.95, kawara);
            // Tower cross
            addPart('cylinder', 'wood', 0, towerH + 2.1, -naveD / 2 - 0.3, 0.08, 1.1, 0.08, wood);
            addPart('box', 'stone', 0, towerH + 2.5, -naveD / 2 - 0.3, 0.5, 0.10, 0.10, [0.55, 0.48, 0.40]);
            // Heavy timber doors at the facade
            addPart('box', 'dark', 0, 1.5, naveD / 2 + 0.5, 1.4, 3.0, 0.10);
          }

          else if (lm === 'dutch-factory-masulipatnam') {
            // Masulipatnam — VOC factory, established 1606. Rectangular
            // walled compound on the estuary waterfront. Whitewashed brick
            // perimeter; a two-story factor's residence at the rear with
            // the distinctive Dutch stepped gable and dark tile roof; long
            // warehouse blocks along both flanks. Prinsenvlag flies from a
            // central yard mast.
            const brick = varyColor([0.74, 0.54, 0.40], rng, 0.05);
            const whitewash = varyColor([0.92, 0.88, 0.80], rng, 0.04);
            const tile: [number, number, number] = [0.40, 0.28, 0.22];
            const wood = varyColor([0.32, 0.20, 0.14], rng, 0.04);
            // Perimeter walls — 9×8 compound
            addPart('box', 'mud', 0, 1.5, 4.0, 9, 3, 0.5, brick);
            addPart('box', 'mud', 0, 1.5, -4.0, 9, 3, 0.5, brick);
            addPart('box', 'mud', 4.5, 1.5, 0, 0.5, 3, 8, brick);
            addPart('box', 'mud', -4.5, 1.5, 0, 0.5, 3, 8, brick);
            // Factor's residence (rear) — two stories with stepped gable
            addPart('box', 'white', 0, 2.3, -2.6, 5.2, 4.6, 2.4, whitewash);
            // Stepped gable front — three stacked cubes of decreasing width
            addPart('box', 'white', 0, 4.9, -1.45, 5.2, 0.9, 0.25, whitewash);
            addPart('box', 'white', 0, 5.5, -1.45, 3.8, 0.8, 0.25, whitewash);
            addPart('box', 'white', 0, 6.1, -1.45, 2.4, 0.8, 0.25, whitewash);
            addPart('box', 'white', 0, 6.65, -1.45, 1.0, 0.5, 0.25, whitewash);
            // Dark tile roof behind the gable
            addPart('cone', 'terracotta', 0, 5.2, -2.9, 2.8, 1.2, 1.4, tile);
            // Residence door
            addPart('box', 'dark', 0, 1.6, -1.35, 1.0, 2.2, 0.12);
            // Two small upper-story windows
            addPart('box', 'dark', -1.3, 3.6, -1.40, 0.7, 0.9, 0.08);
            addPart('box', 'dark',  1.3, 3.6, -1.40, 0.7, 0.9, 0.08);
            // Long warehouses along the flanks
            addPart('box', 'mud', -3.4, 1.4, 1.2, 1.6, 2.6, 5, brick);
            addPart('cone', 'wood', -3.4, 3.0, 1.2, 1.0, 0.8, 3.0, tile);
            addPart('box', 'mud', 3.4, 1.4, 1.2, 1.6, 2.6, 5, brick);
            addPart('cone', 'wood', 3.4, 3.0, 1.2, 1.0, 0.8, 3.0, tile);
            // Main gate on the front wall
            addPart('box', 'dark', 0, 1.3, 4.0, 2.0, 2.2, 0.12);
            addPart('cylinder', 'wood', -1.1, 1.5, 4.0, 0.18, 3.0, 0.18, wood);
            addPart('cylinder', 'wood',  1.1, 1.5, 4.0, 0.18, 3.0, 0.18, wood);
            // Central flagpole with Prinsenvlag (orange / white / blue)
            addPart('cylinder', 'wood', 0, 3.5, 0, 0.10, 7, 0.10, wood);
            addPart('box', 'straw', 0.85, 5.9, 0, 1.4, 0.3, 0.06, [0.90, 0.48, 0.16]); // orange
            addPart('box', 'straw', 0.85, 5.6, 0, 1.4, 0.3, 0.06, [0.95, 0.94, 0.90]); // white
            addPart('box', 'straw', 0.85, 5.3, 0, 1.4, 0.3, 0.06, [0.10, 0.22, 0.58]); // blue
            // A few bales/crates in the yard
            addPart('box', 'wood', -1.8, 0.35, 1.6, 0.8, 0.7, 0.7, wood);
            addPart('box', 'wood', -1.0, 0.30, 1.6, 0.6, 0.6, 0.6, wood);
            addPart('box', 'wood',  1.7, 0.40, 1.8, 0.8, 0.8, 0.8, wood);
          }

          scaleLandmark(_lmStart, 0, 0, LM_SCALE);
          return; // skip generic building render for this building
        }

        // ── Spiritual buildings (churches, mosques, temples, pagodas) ───
        // Dispatched by faith. Geometry stays within the 8×8 reserved
        // footprint so the building sits in its clearing cleanly.
        if (b.type === 'spiritual') {
          const faith = b.faith ?? 'catholic';

          if (faith === 'catholic') {
            // Single-nave whitewashed church with tile roof and bell tower.
            const wash = varyColor([0.94, 0.92, 0.86], rng, 0.04);
            const tile: [number, number, number] = [0.60, 0.30, 0.24];
            addPart('box', 'white', 0, 2.0, 0, 4, 4, 6, wash);
            addPart('cone', 'terracotta', 0, 5.0, 0, 2.4, 1.6, 3.4, tile);
            // Bell tower on the rear
            addPart('box', 'white', 0, 3.5, -3.2, 1.8, 7, 1.8, wash);
            addPart('cone', 'terracotta', 0, 7.6, -3.2, 1.2, 1.4, 1.2, tile);
            // Cross finial
            addPart('box', 'stone', 0, 9.0, -3.2, 0.10, 0.8, 0.10);
            addPart('box', 'stone', 0, 9.1, -3.2, 0.5, 0.10, 0.10);
            // Arched central doorway
            addPart('box', 'dark', 0, 1.6, 3.05, 1.0, 2.4, 0.15);
          }

          else if (faith === 'protestant') {
            // Plainer Reformed church — no cross on exterior gable, dark
            // timber trim, simpler spire. Dutch brick or English stone.
            const wall = varyColor([0.74, 0.58, 0.42], rng, 0.05);
            const roof: [number, number, number] = [0.42, 0.34, 0.28];
            addPart('box', 'mud', 0, 2.0, 0, 4, 4, 6, wall);
            addPart('cone', 'stone', 0, 5.0, 0, 2.4, 1.6, 3.4, roof);
            // Square tower with pyramid roof (no cross)
            addPart('box', 'mud', 0, 4.0, -3.0, 2.0, 8, 2.0, wall);
            addPart('cone', 'wood', 0, 9.0, -3.0, 1.3, 2.0, 1.3, roof);
            // Slim wooden weathervane
            addPart('cylinder', 'wood', 0, 10.4, -3.0, 0.06, 1.0, 0.06);
            addPart('box', 'dark', 0, 1.6, 3.05, 0.9, 2.2, 0.15);
          }

          else if (faith === 'sunni' || faith === 'shia') {
            // Mosque: square domed prayer hall + slim minaret.
            const wash = varyColor([0.94, 0.92, 0.86], rng, 0.04);
            const dome: [number, number, number] = faith === 'shia'
              ? [0.72, 0.80, 0.86]   // Safavid tile-blue
              : [0.90, 0.88, 0.80];  // plain lime
            addPart('box', 'white', 0, 2.0, 0, 5, 4, 5, wash);
            addPart('dome', 'white', 0, 4.5, 0, 2.5, 2.5, 2.5, dome);
            // Minaret — offset to front-right of the hall
            addPart('box', 'white', 3.0, 1.5, 2.5, 1.2, 3, 1.2, wash);
            addPart('cylinder', 'white', 3.0, 6.5, 2.5, 0.45, 7, 0.45, wash);
            addPart('cylinder', 'white', 3.0, 10.2, 2.5, 0.65, 0.35, 0.65, wash);
            addPart('sphere', 'white', 3.0, 11.0, 2.5, 0.45, 0.7, 0.45, dome);
            addPart('cone', 'straw', 3.0, 11.7, 2.5, 0.10, 0.5, 0.10, [0.85, 0.75, 0.2]);
            // Entrance
            addPart('box', 'dark', 0, 1.4, 2.55, 1.0, 2.0, 0.15);
          }

          else if (faith === 'ibadi') {
            // Plainer Omani mosque — whitewashed cube, short square minaret,
            // no large dome. Distinctive for Muscat / Oman.
            const wash = varyColor([0.92, 0.90, 0.82], rng, 0.04);
            addPart('box', 'white', 0, 2.0, 0, 5, 4, 5, wash);
            addPart('box', 'white', 2.5, 4.5, -2.5, 1.6, 5, 1.6, wash);
            addPart('box', 'white', 2.5, 7.3, -2.5, 1.2, 0.4, 1.2, [0.80, 0.78, 0.70]);
            addPart('box', 'dark', 0, 1.4, 2.55, 1.0, 2.0, 0.15);
          }

          else if (faith === 'hindu') {
            // Kerala / Gujarati Hindu temple: stepped pyramidal shikhara,
            // copper-green roof panels, brass dhvajastambha flag mast.
            const teak = varyColor([0.45, 0.30, 0.20], rng, 0.04);
            const stone = varyColor([0.78, 0.55, 0.38], rng, 0.04);
            const copper: [number, number, number] = [0.32, 0.58, 0.52];
            const brass: [number, number, number] = [0.82, 0.68, 0.28];
            // Plinth
            addPart('box', 'mud', 0, 0.5, 0, 5, 1, 5, stone);
            // Sanctum
            addPart('box', 'wood', 0, 2.2, 0, 3.6, 2.4, 3.6, teak);
            addPart('cone', 'wood', 0, 4.2, 0, 2.8, 1.6, 2.8, copper);
            // Upper tier
            addPart('box', 'wood', 0, 5.4, 0, 2.0, 0.6, 2.0, teak);
            addPart('cone', 'wood', 0, 6.3, 0, 1.5, 1.0, 1.5, copper);
            // Brass finial
            addPart('cylinder', 'wood', 0, 7.1, 0, 0.15, 0.6, 0.15, brass);
            addPart('cone', 'wood', 0, 7.7, 0, 0.3, 0.5, 0.3, brass);
            // Flag mast
            addPart('cylinder', 'wood', 3.0, 3.5, 0, 0.10, 7, 0.10, brass);
          }

          else if (faith === 'buddhist') {
            // Stupa / pagoda — multi-tiered red+gold tower over square base.
            const red = varyColor([0.72, 0.28, 0.22], rng, 0.04);
            const gold: [number, number, number] = [0.82, 0.68, 0.28];
            const wood = varyColor([0.38, 0.25, 0.18], rng, 0.04);
            addPart('box', 'mud', 0, 0.5, 0, 4.6, 1, 4.6, [0.72, 0.66, 0.52]);
            addPart('box', 'wood', 0, 2.0, 0, 3.4, 2, 3.4, red);
            addPart('cone', 'wood', 0, 3.4, 0, 2.8, 0.8, 2.8, wood);
            addPart('box', 'wood', 0, 4.3, 0, 2.4, 1.4, 2.4, red);
            addPart('cone', 'wood', 0, 5.4, 0, 2.0, 0.7, 2.0, wood);
            addPart('box', 'wood', 0, 6.2, 0, 1.6, 1.0, 1.6, red);
            addPart('cone', 'wood', 0, 7.1, 0, 1.2, 0.6, 1.2, wood);
            // Gold spire finial
            addPart('cone', 'wood', 0, 8.0, 0, 0.4, 1.4, 0.4, gold);
            addPart('sphere', 'wood', 0, 8.9, 0, 0.22, 0.4, 0.22, gold);
          }

          else if (faith === 'chinese-folk') {
            // Chinese folk temple — red columns, green-tile sweep roof.
            const red = varyColor([0.72, 0.22, 0.18], rng, 0.05);
            const green: [number, number, number] = [0.30, 0.50, 0.34];
            const wood = varyColor([0.34, 0.22, 0.15], rng, 0.04);
            addPart('box', 'mud', 0, 0.4, 0, 5, 0.8, 5, [0.68, 0.62, 0.50]);
            // Four red pillars at corners
            for (const [cx, cz] of [[1.8, 1.8], [-1.8, 1.8], [1.8, -1.8], [-1.8, -1.8]] as [number, number][]) {
              addPart('cylinder', 'wood', cx, 2.0, cz, 0.25, 3.2, 0.25, red);
            }
            // Main hall body
            addPart('box', 'wood', 0, 2.4, 0, 4.2, 2.8, 4.2, red);
            // Sweeping green tile roof (use cone for the sweep effect)
            addPart('cone', 'wood', 0, 4.6, 0, 3.8, 1.4, 3.8, green);
            addPart('cone', 'wood', 0, 5.8, 0, 2.0, 0.8, 2.0, green);
            // Ridge ornament
            addPart('cylinder', 'wood', 0, 6.4, 0, 0.12, 0.6, 0.12, wood);
          }

          else if (faith === 'animist') {
            // Open-air shrine: raised wooden platform, thatch canopy, vertical
            // fetish pole. Spatial language inherited from West African and
            // Khoikhoi sacred sites.
            const post = varyColor([0.35, 0.25, 0.18], rng, 0.06);
            const thatch = varyColor([0.78, 0.68, 0.42], rng, 0.06);
            // Four corner posts
            for (const [cx, cz] of [[1.2, 1.2], [-1.2, 1.2], [1.2, -1.2], [-1.2, -1.2]] as [number, number][]) {
              addPart('cylinder', 'wood', cx, 1.4, cz, 0.15, 2.8, 0.15, post);
            }
            // Raised plank platform
            addPart('box', 'wood', 0, 0.4, 0, 3.0, 0.2, 3.0, post);
            // Conical thatch canopy
            addPart('cone', 'straw', 0, 3.6, 0, 2.2, 1.8, 2.2, thatch);
            // Central fetish pole with wrappings
            addPart('cylinder', 'wood', 0, 2.0, 0, 0.18, 4.0, 0.18, [0.28, 0.18, 0.12]);
            addPart('box', 'straw', 0, 3.4, 0, 0.9, 0.25, 0.05, [0.82, 0.22, 0.14]);
            // Stone altars at the cardinal posts
            for (const [cx, cz] of [[0, 2.2], [0, -2.2]] as [number, number][]) {
              addPart('box', 'stone', cx, 0.2, cz, 0.6, 0.3, 0.6, [0.58, 0.54, 0.48]);
            }
          }

          else if (faith === 'jewish') {
            // Sephardic / Ashkenazi synagogue — square stone hall, small dome
            // or lantern, arched windows. No exterior cross or minaret.
            const stone = varyColor([0.84, 0.78, 0.66], rng, 0.04);
            const leadDome: [number, number, number] = [0.48, 0.50, 0.52];
            addPart('box', 'white', 0, 2.5, 0, 5, 5, 5, stone);
            // Central small dome
            addPart('dome', 'white', 0, 5.4, 0, 1.6, 1.4, 1.6, leadDome);
            // Four-arched window suggestion via thin dark boxes on the facade
            for (const wx of [-1.8, -0.6, 0.6, 1.8]) {
              addPart('box', 'dark', wx, 3.0, 2.55, 0.45, 1.4, 0.08);
            }
            // Star of David (three thin bars forming a star outline)
            addPart('box', 'stone', 0, 6.5, 0, 0.6, 0.08, 0.08, [0.82, 0.68, 0.28]);
            addPart('box', 'stone', 0, 6.5, 0, 0.08, 0.08, 0.6, [0.82, 0.68, 0.28]);
            addPart('box', 'dark', 0, 1.6, 2.55, 0.9, 2.0, 0.15);
          }

          return; // skip generic per-type render
        }

        // ── Palaces (royal residence / governor's house, generic per style) ─
        if (b.type === 'palace') {
          const style = b.palaceStyle ?? 'iberian-colonial';

          if (style === 'iberian-colonial') {
            // Whitewashed walls, terracotta tile roof, arched loggia on the
            // front, short clocktower on one corner. Reads as a Portuguese
            // or Spanish governor's palace. Footprint is 10×10 inside the
            // 12×12 reservation (1-cell clearance on each side).
            const wash = varyColor([0.94, 0.90, 0.80], rng, 0.04);
            const tile: [number, number, number] = [0.60, 0.30, 0.22];
            const wood = varyColor([0.30, 0.20, 0.14], rng, 0.04);
            // Main block
            addPart('box', 'white', 0, 2.6, 0, 10, 5.2, 8, wash);
            addPart('cone', 'terracotta', 0, 5.8, 0, 5.4, 1.4, 4.4, tile);
            // Front arched loggia — five arches as small dark openings
            addPart('box', 'white', 0, 1.5, 4.05, 10, 3.0, 0.3, wash);
            for (const ax of [-3.8, -1.9, 0, 1.9, 3.8]) {
              addPart('box', 'dark', ax, 1.3, 4.20, 1.1, 2.1, 0.12);
            }
            // Upper-floor balcony rail
            addPart('box', 'wood', 0, 3.3, 4.20, 9.6, 0.15, 0.15, wood);
            // Small clocktower on one corner
            addPart('box', 'white', 4.2, 3.6, -3.0, 1.8, 7.2, 1.8, wash);
            addPart('cone', 'terracotta', 4.2, 7.6, -3.0, 1.25, 1.3, 1.25, tile);
            addPart('cylinder', 'wood', 4.2, 8.5, -3.0, 0.08, 0.6, 0.08, wood);
            // Central portal
            addPart('box', 'dark', 0, 1.5, 4.30, 1.6, 2.7, 0.12);
            // Flagpole on ridge
            addPart('cylinder', 'wood', -3.0, 7.2, 0, 0.08, 1.8, 0.08, wood);
          }

          else if (style === 'mughal') {
            // Red sandstone cube with a dominant central pishtaq (recessed
            // arch entrance), four small chhatri pavilions on the corners
            // of the roof, small dome over the central pishtaq.
            const sand = varyColor([0.74, 0.42, 0.32], rng, 0.04);
            const cream = varyColor([0.90, 0.82, 0.70], rng, 0.03);
            const marble: [number, number, number] = [0.92, 0.90, 0.84];
            // Main cube
            addPart('box', 'mud', 0, 2.6, 0, 10, 5.2, 10, sand);
            // Recessed pishtaq — taller than the main block, lighter sandstone
            addPart('box', 'mud', 0, 3.4, 4.6, 4.2, 6.8, 0.6, cream);
            addPart('box', 'dark', 0, 2.4, 5.0, 2.2, 4.0, 0.15);
            // Small dome over pishtaq
            addPart('dome', 'white', 0, 7.0, 4.6, 1.2, 1.2, 0.8, marble);
            // Corner chhatri pavilions (small domed kiosks on roof)
            for (const [cx, cz] of [[4, 4], [-4, 4], [4, -4], [-4, -4]] as [number, number][]) {
              addPart('cylinder', 'wood', cx, 5.5, cz, 0.10, 0.9, 0.10, cream);
              addPart('cylinder', 'wood', cx + 0.6, 5.5, cz, 0.10, 0.9, 0.10, cream);
              addPart('cylinder', 'wood', cx, 5.5, cz + 0.6, 0.10, 0.9, 0.10, cream);
              addPart('cylinder', 'wood', cx + 0.6, 5.5, cz + 0.6, 0.10, 0.9, 0.10, cream);
              addPart('dome', 'white', cx + 0.3, 6.6, cz + 0.3, 0.55, 0.55, 0.55, cream);
            }
            // Perimeter crenellation (low parapet with merlons suggested by small boxes)
            for (const [mx, mz] of [[0, 5.0], [0, -5.0], [5.0, 0], [-5.0, 0]] as [number, number][]) {
              addPart('box', 'mud', mx, 5.4, mz, mz === 0 ? 0.4 : 8, 0.5, mx === 0 ? 0.4 : 8, sand);
            }
          }

          else if (style === 'malay-istana') {
            // Raised timber pavilion on stilts, steep tiered tile roof,
            // carved gable. Common grammar for Southeast Asian sultans'
            // palaces — Bantam, Aceh, Johor.
            const teak = varyColor([0.42, 0.26, 0.18], rng, 0.05);
            const tileTrop: [number, number, number] = [0.50, 0.36, 0.24];
            const palm: [number, number, number] = [0.82, 0.68, 0.40];
            // Stilts under the platform (16 posts in 4x4 grid)
            for (const sx of [-4, -1.3, 1.3, 4]) {
              for (const sz of [-4, -1.3, 1.3, 4]) {
                addPart('cylinder', 'wood', sx, 0.9, sz, 0.18, 1.8, 0.18, teak);
              }
            }
            // Raised platform
            addPart('box', 'wood', 0, 1.95, 0, 10, 0.4, 10, teak);
            // Main pavilion body
            addPart('box', 'wood', 0, 3.4, 0, 9, 2.6, 9, teak);
            // Steep lower roof
            addPart('cone', 'wood', 0, 5.2, 0, 6.0, 1.8, 6.0, tileTrop);
            // Upper tier (gives the two-tiered look)
            addPart('box', 'wood', 0, 6.4, 0, 5, 1.0, 5, teak);
            addPart('cone', 'wood', 0, 7.6, 0, 3.8, 1.8, 3.8, tileTrop);
            // Ridge ornament (traditional carved gable finial)
            addPart('cylinder', 'wood', 0, 8.8, 0, 0.12, 0.9, 0.12, teak);
            addPart('box', 'wood', 0, 9.4, 0, 0.8, 0.2, 0.2, teak);
            // Front stair — angled boxes suggest a stair
            addPart('box', 'wood', 0, 1.0, 5.4, 2.4, 0.25, 1.8, teak);
            // Thatch detail on gable front
            addPart('box', 'straw', 0, 4.8, 4.05, 2.4, 1.6, 0.15, palm);
          }

          return; // skip generic per-type render
        }

        if (b.type === 'dock') {
          const deckColor = varyColor(BASE_COLORS.wood, rng, 0.06);
          // overlay=true buckets the deck into the polygonOffset material so
          // it doesn't z-fight the terrain mesh it sits flush against.
          addPart('box', 'wood', 0, 0, 0, w, 0.2, d, deckColor, true);
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

        }
        else if (b.type === 'plaza') {
          // Open civic square. The footprint (w × d) is a paved plinth; on top
          // sits one culture-specific centrepiece so each region reads as
          // unmistakably its own. Dispatch prefers the finer-grained
          // CulturalRegion when set, falling back to the 4-way Culture.
          const region: CulturalRegion | undefined = PORT_CULTURAL_REGION[port.id];
          const nat:    Nationality   | undefined = PORT_FACTION[port.id];
          // Iberian colonial override: Portuguese/Spanish ports outside the
          // peninsula (Goa, Macau, Malacca, Salvador, Havana, Cartagena,
          // Luanda) pave and decorate as Iberian colonial plazas. Homeland
          // Lisbon/Seville already hit the Iberian branch via culture +
          // nationality downstream; this just overrides region for the
          // colonial cases so Goa doesn't render a Hindu mandapam.
          const iberianColonial = (nat === 'Portuguese' || nat === 'Spanish') && c !== 'European';

          // ── Paving ──
          // Flagstone for European/Atlantic, lighter stone/coral for Arab &
          // Swahili, packed earth with a stone ring for West African, a
          // tiled plinth for Malabari/Gujarati, granite for Chinese, timber
          // decking for Malay.
          const paveFor = (): { color: [number,number,number]; mat: Part['mat']; geo: Part['geo'] } => {
            if (iberianColonial)        return { color: [0.82, 0.76, 0.62], mat: 'stone', geo: 'box' };
            if (region === 'Malay')     return { color: [0.48, 0.36, 0.24], mat: 'wood',  geo: 'box' };
            if (region === 'Chinese')   return { color: [0.62, 0.60, 0.56], mat: 'stone', geo: 'box' };
            if (region === 'Arab' || region === 'Swahili') return { color: [0.88, 0.82, 0.70], mat: 'stone', geo: 'box' };
            if (region === 'Gujarati' || region === 'Malabari') return { color: [0.74, 0.56, 0.40], mat: 'stone', geo: 'box' };
            if (c === 'West African')   return { color: [0.62, 0.48, 0.32], mat: 'mud',   geo: 'box' };
            if (c === 'Atlantic')       return { color: [0.82, 0.76, 0.62], mat: 'stone', geo: 'box' };
            // Default European flagstone
            return { color: [0.66, 0.62, 0.56], mat: 'stone', geo: 'box' };
          };
          const pave = paveFor();
          // The slab is anchored at the *highest* terrain cell inside the
          // footprint (see cityGenerator's tryReservePlaza) and its bottom
          // is buried ~2m underground. Together that keeps the visible top
          // above every cell underneath while the underside still intersects
          // the lowest cell, so terrain can never poke through or float free.
          // overlay=true also routes the slab through a polygonOffset
          // material so any residual coplanarity at the slab edge wins the
          // depth tie. Visible top stays at building.y + 0.2 (the original
          // height), only the buried portion grew downward.
          addPart(pave.geo, pave.mat, 0, -0.9, 0, w, 2.2, d, varyColor(pave.color, rng, 0.04), true);
          // Subtle inset rim (stone border) for all variants except West African.
          // Same buried-skirt trick: visible top sits at +0.25 (the original
          // 0.05 step above paving top), but the strip extends down to -2.0
          // so it tracks the slab and never z-fights against it at the edge.
          if (c !== 'West African') {
            const rim = varyColor([pave.color[0] * 0.82, pave.color[1] * 0.82, pave.color[2] * 0.82], rng, 0.03);
            addPart('box', pave.mat, 0, -0.875, d/2 - 0.25, w - 0.6, 2.25, 0.5, rim, true);
            addPart('box', pave.mat, 0, -0.875, -d/2 + 0.25, w - 0.6, 2.25, 0.5, rim, true);
            addPart('box', pave.mat, w/2 - 0.25, -0.875, 0, 0.5, 2.25, d - 0.6, rim, true);
            addPart('box', pave.mat, -w/2 + 0.25, -0.875, 0, 0.5, 2.25, d - 0.6, rim, true);
          }

          // ── Centrepiece ──
          // iberianColonial is checked first so Goa/Macau/Malacca/etc. get
          // a colonial plaza rather than their region's indigenous one.
          if (iberianColonial) {
            const stone = varyColor([0.82, 0.76, 0.62], rng, 0.04);
            addPart('box', 'stone', 0, 0.35, 0, 2.0, 0.4, 2.0, stone);
            addPart('box', 'stone', 0, 0.65, 0, 1.4, 0.3, 1.4, varyColor(stone, rng, 0.03));
            const crossColor = varyColor([0.70, 0.64, 0.54], rng, 0.03);
            addPart('cylinder', 'stone', 0, 1.6, 0, 0.18, 1.6, 0.18, crossColor);
            addPart('box', 'stone', 0, 2.25, 0, 1.1, 0.22, 0.22, crossColor);
            addPart('box', 'stone', 0, 2.45, 0, 0.22, 0.22, 0.22, crossColor);
            // Corner bollards
            for (const [px, pz] of [[w/2 - 1, d/2 - 1], [-w/2 + 1, d/2 - 1], [w/2 - 1, -d/2 + 1], [-w/2 + 1, -d/2 + 1]] as const) {
              addPart('cylinder', 'stone', px, 0.35, pz, 0.16, 0.7, 0.16, stone);
              addPart('sphere', 'stone', px, 0.72, pz, 0.18, 0.18, 0.18, stone);
            }
            // Pair of palms flanking the cross axis — a colonial constant
            // from the Largo do Pelourinho to the Plaza de Armas.
            const trunk = varyColor([0.42, 0.32, 0.22], rng, 0.06);
            const fronds = varyColor([0.30, 0.42, 0.18], rng, 0.08);
            for (const pz of [d/2 - 1.4, -d/2 + 1.4] as const) {
              addPart('cylinder', 'wood', 0, 1.6, pz, 0.14, 3.2, 0.14, trunk);
              addPart('sphere', 'straw', 0, 3.4, pz, 1.0, 0.55, 1.0, fronds);
            }
          }
          else if (region === 'Arab' || region === 'Swahili') {
            // Low octagonal fountain. Ring + inner basin + short spouting pillar.
            const coral = varyColor([0.92, 0.86, 0.72], rng, 0.04);
            addPart('cylinder', 'stone', 0, 0.38, 0, 1.6, 0.35, 1.6, coral);
            addPart('cylinder', 'stone', 0, 0.55, 0, 1.2, 0.12, 1.2, varyColor([0.55, 0.72, 0.78], rng, 0.04)); // water
            addPart('cylinder', 'stone', 0, 1.0, 0, 0.18, 1.0, 0.18, varyColor([0.82, 0.76, 0.62], rng, 0.03));
            addPart('sphere', 'stone', 0, 1.6, 0, 0.32, 0.32, 0.32, coral);
            // Four corner date palms — a courtyard staple from Muscat to Lamu.
            const trunk = varyColor([0.42, 0.32, 0.22], rng, 0.06);
            const fronds = varyColor([0.30, 0.42, 0.18], rng, 0.08);
            for (const [px, pz] of [[w/2 - 1, d/2 - 1], [-w/2 + 1, d/2 - 1], [w/2 - 1, -d/2 + 1], [-w/2 + 1, -d/2 + 1]] as const) {
              addPart('cylinder', 'wood', px, 1.4, pz, 0.12, 2.8, 0.12, trunk);
              addPart('sphere', 'straw', px, 2.9, pz, 0.9, 0.5, 0.9, fronds);
            }
          }
          else if (region === 'Gujarati' || region === 'Malabari') {
            // Open mandapam: four slim columns carrying a flat tiled roof, over
            // a low central plinth. A banyan/pipal tree sits off-axis.
            const colColor = varyColor([0.90, 0.84, 0.70], rng, 0.04);
            const roofColor = varyColor([0.62, 0.30, 0.22], rng, 0.05);
            const side = 1.4;
            for (const [cx, cz] of [[side, side], [-side, side], [side, -side], [-side, -side]] as const) {
              addPart('cylinder', 'stone', cx, 1.3, cz, 0.16, 2.6, 0.16, colColor);
            }
            addPart('box', 'stone', 0, 0.35, 0, side * 2 + 0.5, 0.25, side * 2 + 0.5, varyColor([0.78, 0.64, 0.48], rng, 0.04));
            addPart('box', 'terracotta', 0, 2.75, 0, side * 2 + 0.8, 0.18, side * 2 + 0.8, roofColor);
            addPart('cone', 'terracotta', 0, 3.15, 0, side * 1.3, 0.5, side * 1.3, roofColor);
            // Pipal tree at one corner
            const trunk = varyColor([0.38, 0.28, 0.18], rng, 0.05);
            const leaves = varyColor([0.28, 0.48, 0.24], rng, 0.07);
            addPart('cylinder', 'wood', -w/2 + 1.4, 1.0, d/2 - 1.4, 0.25, 2.0, 0.25, trunk);
            addPart('sphere', 'straw', -w/2 + 1.4, 2.6, d/2 - 1.4, 1.3, 1.0, 1.3, leaves);
          }
          else if (region === 'Chinese') {
            // Paifang arch over the plaza axis + a stone lion pair + a bronze urn.
            const pillarColor = varyColor([0.52, 0.14, 0.12], rng, 0.04); // cinnabar red
            const roofColor = varyColor([0.28, 0.24, 0.20], rng, 0.03);
            addPart('cylinder', 'wood', -1.6, 1.5, 0, 0.18, 3.0, 0.18, pillarColor);
            addPart('cylinder', 'wood',  1.6, 1.5, 0, 0.18, 3.0, 0.18, pillarColor);
            addPart('box', 'wood', 0, 3.05, 0, 3.8, 0.2, 0.6, pillarColor);
            addPart('box', 'wood', 0, 3.35, 0, 4.4, 0.15, 0.9, roofColor);
            // Upturned eaves (tiny triangular accents)
            addPart('cone', 'wood', -2.3, 3.55, 0, 0.25, 0.45, 0.35, roofColor);
            addPart('cone', 'wood',  2.3, 3.55, 0, 0.25, 0.45, 0.35, roofColor);
            // Lion pair guarding the far side
            const stone = varyColor([0.58, 0.54, 0.48], rng, 0.04);
            addPart('box', 'stone', -1.2, 0.55, d/2 - 1.0, 0.45, 0.7, 0.7, stone);
            addPart('sphere', 'stone', -1.2, 1.05, d/2 - 1.0, 0.28, 0.28, 0.28, stone);
            addPart('box', 'stone',  1.2, 0.55, d/2 - 1.0, 0.45, 0.7, 0.7, stone);
            addPart('sphere', 'stone',  1.2, 1.05, d/2 - 1.0, 0.28, 0.28, 0.28, stone);
            // Bronze urn at back
            addPart('cylinder', 'stone', 0, 0.55, -d/2 + 1.2, 0.45, 0.9, 0.45, varyColor([0.32, 0.24, 0.14], rng, 0.04));
          }
          else if (region === 'Malay') {
            // Open bangsal pavilion on timber stilts + a banyan tree.
            const wood = varyColor([0.42, 0.30, 0.20], rng, 0.05);
            const thatch = varyColor([0.58, 0.46, 0.28], rng, 0.06);
            // Four stilts carrying a raised deck
            for (const [px, pz] of [[1.2, 1.2], [-1.2, 1.2], [1.2, -1.2], [-1.2, -1.2]] as const) {
              addPart('cylinder', 'wood', px, 0.85, pz, 0.12, 1.7, 0.12, wood);
            }
            addPart('box', 'wood', 0, 1.7, 0, 3.0, 0.18, 3.0, wood);
            // Pitched atap roof
            addPart('box', 'straw', 0, 2.35, 0, 3.4, 0.6, 3.4, thatch);
            addPart('cone', 'straw', 0, 2.95, 0, 1.8, 0.9, 1.8, thatch);
            // Banyan/waringin near the edge
            const trunk = varyColor([0.36, 0.26, 0.18], rng, 0.04);
            const leaves = varyColor([0.26, 0.44, 0.22], rng, 0.06);
            addPart('cylinder', 'wood', -w/2 + 1.6, 1.2, -d/2 + 1.6, 0.35, 2.4, 0.35, trunk);
            addPart('sphere', 'straw', -w/2 + 1.6, 3.0, -d/2 + 1.6, 1.6, 1.2, 1.6, leaves);
          }
          else if (c === 'West African') {
            // Palaver tree + low packed-earth seating ring. No paved rim; the
            // tree IS the civic space.
            const trunk = varyColor([0.48, 0.34, 0.22], rng, 0.05);
            const canopy = varyColor([0.28, 0.42, 0.18], rng, 0.08);
            addPart('cylinder', 'wood', 0, 2.0, 0, 0.55, 4.0, 0.55, trunk);
            addPart('sphere', 'straw', 0, 5.0, 0, 3.2, 2.0, 3.2, canopy);
            // Low circular seating wall under the canopy
            addPart('cylinder', 'mud', 0, 0.25, 0, 2.4, 0.5, 2.4, varyColor([0.66, 0.50, 0.32], rng, 0.05));
            addPart('cylinder', 'mud', 0, 0.26, 0, 2.0, 0.5, 2.0, varyColor([0.58, 0.44, 0.28], rng, 0.04));
          }
          else if (c === 'Atlantic' || nat === 'Spanish' || nat === 'Portuguese') {
            // Iberian-American plaza: stone cross on stepped pedestal + a
            // small central fountain-bowl. Short bollard chain at the rim.
            const stone = varyColor([0.82, 0.76, 0.62], rng, 0.04);
            // Stepped pedestal
            addPart('box', 'stone', 0, 0.35, 0, 2.0, 0.4, 2.0, stone);
            addPart('box', 'stone', 0, 0.65, 0, 1.4, 0.3, 1.4, varyColor(stone, rng, 0.03));
            // Cross shaft
            const crossColor = varyColor([0.70, 0.64, 0.54], rng, 0.03);
            addPart('cylinder', 'stone', 0, 1.6, 0, 0.18, 1.6, 0.18, crossColor);
            addPart('box', 'stone', 0, 2.25, 0, 1.1, 0.22, 0.22, crossColor); // transverse
            addPart('box', 'stone', 0, 2.45, 0, 0.22, 0.22, 0.22, crossColor); // tiny cap
            // Bollards at four corners
            for (const [px, pz] of [[w/2 - 1, d/2 - 1], [-w/2 + 1, d/2 - 1], [w/2 - 1, -d/2 + 1], [-w/2 + 1, -d/2 + 1]] as const) {
              addPart('cylinder', 'stone', px, 0.35, pz, 0.16, 0.7, 0.16, stone);
              addPart('sphere', 'stone', px, 0.72, pz, 0.18, 0.18, 0.18, stone);
            }
          }
          else {
            // European default: market cross + stone well + a few bollards.
            // Works for London, Amsterdam, and any unnamed port.
            const stone = varyColor([0.66, 0.62, 0.56], rng, 0.04);
            // Market cross on a short stepped base
            addPart('box', 'stone', 0, 0.3, 0, 1.6, 0.3, 1.6, stone);
            addPart('cylinder', 'stone', 0, 1.4, 0, 0.15, 2.2, 0.15, varyColor([0.58, 0.54, 0.48], rng, 0.04));
            addPart('box', 'stone', 0, 2.4, 0, 0.9, 0.18, 0.18, varyColor([0.58, 0.54, 0.48], rng, 0.04));
            // Stone well off-centre
            addPart('cylinder', 'stone', w/2 - 1.6, 0.6, -d/2 + 1.6, 0.55, 1.0, 0.55, varyColor([0.54, 0.50, 0.44], rng, 0.04));
            addPart('cylinder', 'stone', w/2 - 1.6, 1.1, -d/2 + 1.6, 0.38, 0.1, 0.38, varyColor([0.30, 0.24, 0.18], rng, 0.04)); // dark water
            // Wooden winch frame over well
            const wood = varyColor([0.40, 0.30, 0.20], rng, 0.06);
            addPart('cylinder', 'wood', w/2 - 1.6 - 0.5, 1.6, -d/2 + 1.6, 0.06, 1.1, 0.06, wood);
            addPart('cylinder', 'wood', w/2 - 1.6 + 0.5, 1.6, -d/2 + 1.6, 0.06, 1.1, 0.06, wood);
            addPart('cylinder', 'wood', w/2 - 1.6, 2.15, -d/2 + 1.6, 0.06, 0.06, 1.1, wood);
            // Torches flanking the cross (lit at night thanks to darkMat glow)
            addTorch(1.2, 1.2, 0);
            addTorch(-1.2, 1.2, 0);
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

            // ── Floor bands (multi-story townhouse read) ──
            // Thin horizontal stone courses between floors. Anchors at
            // 1/stories intervals of the wall height, slightly wider than the
            // wall so they cast a shadow line.
            if (stories > 1) {
              const bandColor = varyColor([0.48, 0.46, 0.42], rng, 0.06);
              for (let f = 1; f < stories; f++) {
                const by = stiltLift + (sh * f) / stories;
                addPart('box', 'stone', 0, by, 0, sw + 0.18, 0.14, sd + 0.18, bandColor);
              }
            }


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
              // One row of windows per floor, vertically centred on each story.
              const floorCount = Math.max(1, stories);
              for (let f = 0; f < floorCount; f++) {
                const wy = stiltLift + (sh * (f + 0.5)) / floorCount;
                const shutterOffsetY = stiltLift + (sh * (f + 0.28)) / floorCount;

                addPart('box', 'dark', sw/2+0.05, wy, 0, 0.1, 0.45, 0.55);
                addPart('box', 'dark', -sw/2-0.05, wy, 0, 0.1, 0.45, 0.55);
                if (shutters) {
                  const shutterBase = shutters[Math.floor(rng() * shutters.length)];
                  const sc = varyColor(shutterBase, rng, 0.06);
                  addPart('box', 'wood', sw/2+0.06, wy, 0.35, 0.06, 0.48, 0.12, sc);
                  addPart('box', 'wood', sw/2+0.06, wy, -0.35, 0.06, 0.48, 0.12, sc);
                  addPart('box', 'wood', -sw/2-0.06, wy, 0.35, 0.06, 0.48, 0.12, sc);
                  addPart('box', 'wood', -sw/2-0.06, wy, -0.35, 0.06, 0.48, 0.12, sc);
                  addPart('box', 'stone', sw/2+0.06, shutterOffsetY, 0, 0.08, 0.06, 0.65);
                  addPart('box', 'stone', -sw/2-0.06, shutterOffsetY, 0, 0.08, 0.06, 0.65);
                } else if (wallMat === 'mud' || wallMat === 'wood') {
                  // Simple wood frames for non-European styles
                  const frameColor = varyColor(BASE_COLORS.wood, rng, 0.08);
                  addPart('box', 'wood', sw/2+0.06, wy, 0, 0.04, 0.52, 0.04, frameColor);
                  addPart('box', 'wood', -sw/2-0.06, wy, 0, 0.04, 0.52, 0.04, frameColor);
                }
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

  const damageSmokeSpots = useMemo(() => {
    const spots: DamageSmokeSpot[] = [];
    ports.forEach((port) => {
      port.buildings.forEach((b, bi) => {
        const stage = getBuildingDamageStage(b.id);
        if (stage === 'intact') return;
        const intensity = stage === 'destroyed' ? 1 : stage === 'heavilyDamaged' ? 0.72 : 0.42;
        const count = stage === 'destroyed' ? 3 : stage === 'heavilyDamaged' ? 2 : 1;
        for (let i = 0; i < count; i++) {
          const spread = count === 1 ? 0 : (i - (count - 1) * 0.5) * Math.min(1.1, b.scale[0] * 0.14);
          spots.push({
            pos: [b.position[0] + spread, b.position[1] + b.scale[1] + 0.5, b.position[2] + spread * 0.4],
            seed: bi * 173 + i * 37 + ((b.position[0] + b.position[2]) * 10 | 0),
            intensity,
          });
        }
      });
    });
    return spots;
  }, [ports, damageVersion]);

  const ruinedBuildingDebris = useMemo(() => {
    const ruins: RuinMarker[] = [];
    ports.forEach((port) => {
      port.buildings.forEach((b) => {
        if (getBuildingDamageStage(b.id) !== 'destroyed') return;
        ruins.push({
          pos: [b.position[0], b.position[1] + Math.max(0.35, b.scale[1] * 0.16), b.position[2]],
          scale: [Math.max(1.1, b.scale[0] * 0.72), Math.max(0.4, b.scale[1] * 0.18), Math.max(1.1, b.scale[2] * 0.6)],
          rotY: b.rotation + 0.35,
        });
        ruins.push({
          pos: [b.position[0] + Math.sin(b.rotation) * 0.7, b.position[1] + Math.max(0.6, b.scale[1] * 0.28), b.position[2] + Math.cos(b.rotation) * 0.7],
          scale: [Math.max(0.5, b.scale[0] * 0.16), Math.max(0.9, b.scale[1] * 0.45), Math.max(0.4, b.scale[2] * 0.12)],
          rotY: b.rotation - 0.4,
        });
      });
    });
    return ruins;
  }, [ports, damageVersion]);

  // Group parts by geo+mat (+ overlay flag). Overlay parts bucket into a
  // parallel material with polygonOffset so flat ground-hugging surfaces
  // (dock decks, plaza paving) don't z-fight with terrain or water layers.
  const groups = useMemo(() => {
    const map = new Map<string, Part[]>();
    parts.forEach(p => {
      const key = `${p.geo}_${p.mat}${p.overlay ? '_overlay' : ''}`;
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

  // Overlay materials for ground-hugging parts (dock decks, plaza paving).
  // Negative polygonOffset pulls the surface toward camera so it wins the
  // depth tie against coplanar terrain and water-overlay layers, mirroring
  // the trick already used by roads and field overlays.
  const overlayMats = useMemo(() => ({
    white: new THREE.MeshStandardMaterial({ color: '#f0f0f0', roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
    mud: new THREE.MeshStandardMaterial({ color: '#c2a077', roughness: 1.0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
    wood: new THREE.MeshStandardMaterial({ color: '#5c4033', roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
    terracotta: new THREE.MeshStandardMaterial({ color: '#cd5c5c', roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
    stone: new THREE.MeshStandardMaterial({ color: '#888888', roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
    straw: new THREE.MeshStandardMaterial({ color: '#d4c07b', roughness: 1.0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
    dark: darkMat,
  }), [darkMat]);

  return (
    <group>
      {Array.from(groups.entries()).map(([key, groupParts]) => {
        const segments = key.split('_');
        const geoName = segments[0] as keyof typeof geos;
        const matName = segments[1] as keyof typeof mats;
        const isOverlay = segments[2] === 'overlay';
        const material = isOverlay ? overlayMats[matName] : mats[matName];
        return (
          <InstancedParts
            key={key}
            parts={groupParts}
            geometry={geos[geoName]}
            material={material}
          />
        );
      })}
      <CityRoads ports={ports} />
      <CityFieldOverlay ports={ports} />
      <SacredBuildingMarkers ports={ports} />
      <CityTorches spots={torchSpots} />
      <ChimneySmoke spots={smokeSpots} />
      <BuildingDamageSmoke spots={damageSmokeSpots} />
      <RuinedBuildingDebris ruins={ruinedBuildingDebris} />
    </group>
  );
}

// ── Roads ────────────────────────────────────────────────────────────────────
// Extrudes each road polyline as a thin ribbon along the ground.

type PortsProp = ReturnType<typeof useGameStore.getState>['ports'];

type RoadTierKey = 'path' | 'road' | 'avenue' | 'bridge';
// ROAD_TIER_STYLE (width / yLift / renderOrder) is imported from
// ../utils/roadStyle so the ground-height resolver stays in lockstep with
// the ribbon renderer. Per-variant colour/roughness tables still live
// below because they're render-only.

// ── Road colour variants by culture ──────────────────────────────────────────
// The tier (path/road/avenue) sets width; the variant sets colour + roughness.
// Dispatch via roadVariantForPort() — falls through to 'european' so any port
// missing from our taxonomy still renders.
type RoadVariantKey =
  | 'european'      // London, Amsterdam — dark earth, flagstone avenues
  | 'iberian'       // Lisbon, Seville, Iberian colonial (Goa, Macau, Salvador…)
  | 'arab'          // Aden, Muscat, Hormuz — pale limestone
  | 'swahili'       // Mombasa, Zanzibar — warm coral sand
  | 'south-india'   // Calicut, Cochin, Surat — red laterite
  | 'chinese'       // Macau (non-Portuguese blocks), generic Chinese
  | 'malay'         // Malacca, Aceh, Bantam — packed tropical earth
  | 'african';      // Elmina, Luanda — ochre/red earth

// Per-variant colour + roughness per tier. Keeping tier widths in
// ROAD_TIER_STYLE above; this table only modulates the material look.
const ROAD_VARIANT_STYLE: Record<RoadVariantKey, Record<'path' | 'road' | 'avenue', { color: string; roughness: number }>> = {
  'european': {
    path:   { color: '#8a6f4a', roughness: 1.00 },
    road:   { color: '#7a6850', roughness: 0.95 },
    avenue: { color: '#938875', roughness: 0.80 }, // weathered flagstone
  },
  'iberian': {
    path:   { color: '#a28968', roughness: 0.95 },
    road:   { color: '#9a8062', roughness: 0.90 },
    avenue: { color: '#b8a886', roughness: 0.78 }, // pale limestone paseo
  },
  'arab': {
    path:   { color: '#b3a17d', roughness: 0.95 },
    road:   { color: '#a8956f', roughness: 0.90 },
    avenue: { color: '#c6b892', roughness: 0.80 }, // whitewashed limestone
  },
  'swahili': {
    path:   { color: '#bfa37a', roughness: 0.95 },
    road:   { color: '#b29368', roughness: 0.90 },
    avenue: { color: '#d4bd94', roughness: 0.82 }, // crushed coral
  },
  'south-india': {
    path:   { color: '#9a6a4a', roughness: 1.00 },
    road:   { color: '#8a5a3d', roughness: 0.95 },
    avenue: { color: '#a87356', roughness: 0.88 }, // laterite red
  },
  'chinese': {
    path:   { color: '#7a7468', roughness: 0.95 },
    road:   { color: '#6d685c', roughness: 0.90 },
    avenue: { color: '#8a8478', roughness: 0.82 }, // grey granite
  },
  'malay': {
    path:   { color: '#8f6f46', roughness: 1.00 },
    road:   { color: '#80633c', roughness: 0.98 }, // packed tropical earth
    avenue: { color: '#9a7a52', roughness: 0.92 },
  },
  'african': {
    path:   { color: '#a06844', roughness: 1.00 },
    road:   { color: '#935a38', roughness: 0.98 },
    avenue: { color: '#ad7550', roughness: 0.92 }, // ochre earth
  },
};

function roadVariantForPort(
  culture: string,
  nationality?: string,
  region?: string,
): RoadVariantKey {
  // Iberian colonial overlay: Portuguese/Spanish control outside the
  // peninsula still paves the quay in pale Iberian stone.
  if (nationality === 'Portuguese' || nationality === 'Spanish') return 'iberian';
  if (region === 'Arab')      return 'arab';
  if (region === 'Swahili')   return 'swahili';
  if (region === 'Gujarati' || region === 'Malabari') return 'south-india';
  if (region === 'Malay')     return 'malay';
  if (region === 'Chinese')   return 'chinese';
  if (culture === 'West African') return 'african';
  if (culture === 'Atlantic') return 'iberian'; // Salvador, Havana, Cartagena
  return 'european';
}

// ── Bridge styles ────────────────────────────────────────────────────────────
// Three cultural variants. Dispatch by port.culture in bridgeStyleForPort().
type BridgeStyleKey = 'stone' | 'timber' | 'plank';

const BRIDGE_STYLE: Record<BridgeStyleKey, {
  deckColor: string;
  deckRoughness: number;
  parapet: { color: string; height: number; thickness: number } | null;
  pier: { radiusTop: number; radiusBot: number; height: number; color: string; segments: number };
  pierStep: number; // sample every Nth interior deck node
}> = {
  // European: weathered grey stone deck, low stone parapet, stout tapered piers.
  stone: {
    deckColor: '#5a5550', deckRoughness: 0.9,
    parapet: { color: '#6b655e', height: 0.5, thickness: 0.3 },
    pier: { radiusTop: 0.6, radiusBot: 0.8, height: 3.4, color: '#4a4540', segments: 8 },
    pierStep: 2,
  },
  // Indian Ocean: dark timber deck, slim wooden rail, closely spaced piles.
  timber: {
    deckColor: '#5a4632', deckRoughness: 1.0,
    parapet: { color: '#3e2f22', height: 0.35, thickness: 0.15 },
    pier: { radiusTop: 0.18, radiusBot: 0.18, height: 3.6, color: '#3a2c20', segments: 6 },
    pierStep: 1,
  },
  // West African / Atlantic / fallback: rough planks on log piers, no railing.
  plank: {
    deckColor: '#6b5230', deckRoughness: 1.0,
    parapet: null,
    pier: { radiusTop: 0.22, radiusBot: 0.28, height: 3.4, color: '#2d231a', segments: 6 },
    pierStep: 2,
  },
};

function bridgeStyleForPort(culture: string): BridgeStyleKey {
  if (culture === 'European') return 'stone';
  if (culture === 'Indian Ocean') return 'timber';
  return 'plank';
}

// Turns sharper than this (measured by dot of adjacent segment tangents)
// trigger a miter break instead of a smooth averaged-tangent vertex. At a
// break the shared vertex is duplicated: one perpendicular pair oriented to
// the incoming segment, one to the outgoing — so the ribbon edge doesn't
// pinch on the outside of a sharp corner.
// cos(75°) ≈ 0.26. Picked empirically: smoother turns than ~75° look fine
// mitered, sharper than that visibly pinch.
const RIBBON_MITER_DOT = 0.26;

function buildRoadRibbon(
  points: [number, number, number][],
  width: number,
  yLift: number,
  taperStart: boolean = true,
  taperEnd: boolean = true,
  sampleEdgeY?: (x: number, z: number) => number,
): THREE.BufferGeometry | null {
  const n = points.length;
  if (n < 2) return null;
  const half = width / 2;
  const startW = half * (taperStart ? 0.85 : 1.0);
  const endW = half * (taperEnd ? 0.85 : 1.0);

  // Precompute per-segment tangents so we can test miter at interior vertices.
  const segTanX: number[] = new Array(n - 1);
  const segTanZ: number[] = new Array(n - 1);
  for (let i = 0; i < n - 1; i++) {
    const dx = points[i + 1][0] - points[i][0];
    const dz = points[i + 1][2] - points[i][2];
    const len = Math.hypot(dx, dz);
    if (len < 1e-5) { segTanX[i] = 1; segTanZ[i] = 0; }
    else { segTanX[i] = dx / len; segTanZ[i] = dz / len; }
  }

  const verts: number[] = [];
  // When sampleEdgeY is provided, the two ribbon edges use that callback's
  // Y instead of inheriting the centerline polyline Y. This lets a road
  // bank with the cross-slope on a hillside instead of cutting horizontally
  // through it (current behaviour for non-bridge tiers, which pass terrain
  // height as the sampler). Bridges leave it undefined so the deck stays
  // a flat plane at BRIDGE_DECK_Y across its full width.
  const pushPair = (
    px: number, py: number, pz: number,
    nx: number, nz: number, w: number,
  ): number => {
    const idx = verts.length / 3;
    const lx = px + nx * w;
    const lz = pz + nz * w;
    const rx = px - nx * w;
    const rz = pz - nz * w;
    let ly = py;
    let ry = py;
    if (sampleEdgeY) {
      const centerTerrainY = sampleEdgeY(px, pz);
      const elevatedCenterline = py > centerTerrainY + 0.25;
      ly = sampleEdgeY(lx, lz);
      ry = sampleEdgeY(rx, rz);
      if (elevatedCenterline) {
        ly = Math.max(ly, py);
        ry = Math.max(ry, py);
      }
    }
    verts.push(lx, ly + yLift, lz);
    verts.push(rx, ry + yLift, rz);
    return idx;
  };

  // For each segment i (from vertex i to i+1), record the left-vertex index
  // of its start pair and end pair. A smooth interior vertex shares one
  // pair between adjacent segments; a mitered interior vertex emits two
  // independent pairs so the segments triangulate separately at the turn.
  const segStart: number[] = new Array(n - 1);
  const segEnd: number[] = new Array(n - 1);

  // Vertex 0 — only "outgoing" pair.
  {
    const [px, py, pz] = points[0];
    const nx = -segTanZ[0], nz = segTanX[0];
    segStart[0] = pushPair(px, py, pz, nx, nz, startW);
  }

  // Interior vertices — decide smooth miter or break.
  for (let i = 1; i < n - 1; i++) {
    const [px, py, pz] = points[i];
    const inX = segTanX[i - 1], inZ = segTanZ[i - 1];
    const outX = segTanX[i], outZ = segTanZ[i];
    const dot = inX * outX + inZ * outZ;

    if (dot >= RIBBON_MITER_DOT) {
      // Smooth turn — one shared pair using the averaged tangent.
      let tx = inX + outX;
      let tz = inZ + outZ;
      const tl = Math.hypot(tx, tz);
      if (tl < 1e-5) { tx = 1; tz = 0; } else { tx /= tl; tz /= tl; }
      const nx = -tz, nz = tx;
      const idx = pushPair(px, py, pz, nx, nz, half);
      segEnd[i - 1] = idx;
      segStart[i] = idx;
    } else {
      // Sharp turn — break the ribbon with two independent pairs so the
      // incoming segment's outer edge doesn't stretch across to the outgoing
      // segment's outer edge (which is what produces the visible pinch).
      segEnd[i - 1] = pushPair(px, py, pz, -inZ, inX, half);
      segStart[i] = pushPair(px, py, pz, -outZ, outX, half);
    }
  }

  // Vertex n-1 — only "incoming" pair.
  {
    const [px, py, pz] = points[n - 1];
    const nx = -segTanZ[n - 2], nz = segTanX[n - 2];
    segEnd[n - 2] = pushPair(px, py, pz, nx, nz, endW);
  }

  const positions = new Float32Array(verts);
  const indices: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const a = segStart[i];      // left start
    const b = a + 1;            // right start
    const c = segEnd[i];        // left end
    const d = c + 1;            // right end
    // Two triangles per segment, CCW viewed from above.
    indices.push(a, c, b);
    indices.push(b, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

// Offset a polyline perpendicular to its tangent in the XZ plane, preserving
// y. Used to build parapet centerlines from a deck centerline.
function offsetPolylineXZ(
  points: [number, number, number][],
  offset: number,
  yLift: number,
): [number, number, number][] {
  const n = points.length;
  const out: [number, number, number][] = new Array(n);
  for (let i = 0; i < n; i++) {
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(n - 1, i + 1)];
    let tx = next[0] - prev[0];
    let tz = next[2] - prev[2];
    const tl = Math.hypot(tx, tz);
    if (tl < 1e-5) { tx = 1; tz = 0; } else { tx /= tl; tz /= tl; }
    const nx = -tz, nz = tx;
    const [px, py, pz] = points[i];
    out[i] = [px + nx * offset, py + yLift, pz + nz * offset];
  }
  return out;
}

// Swept box wall along a polyline. Each polyline vertex emits 4 corners
// (outer-bottom, inner-bottom, inner-top, outer-top). Adjacent segments
// share corners via smooth miter on interior vertices, and the two short
// ends get capped so the wall isn't see-through. Used for bridge parapets
// so railings read as solid walls rather than flat ribbons hovering above
// the deck.
function buildWallRibbon(
  centerline: [number, number, number][],
  thickness: number,
  height: number,
): THREE.BufferGeometry | null {
  const n = centerline.length;
  if (n < 2) return null;
  const halfT = thickness / 2;

  // Per-segment tangents for mitering interior vertices.
  const segTanX: number[] = new Array(n - 1);
  const segTanZ: number[] = new Array(n - 1);
  for (let i = 0; i < n - 1; i++) {
    const dx = centerline[i + 1][0] - centerline[i][0];
    const dz = centerline[i + 1][2] - centerline[i][2];
    const len = Math.hypot(dx, dz);
    if (len < 1e-5) { segTanX[i] = 1; segTanZ[i] = 0; }
    else { segTanX[i] = dx / len; segTanZ[i] = dz / len; }
  }

  const verts: number[] = [];
  for (let i = 0; i < n; i++) {
    let tx: number, tz: number;
    if (i === 0) { tx = segTanX[0]; tz = segTanZ[0]; }
    else if (i === n - 1) { tx = segTanX[n - 2]; tz = segTanZ[n - 2]; }
    else {
      const ax = segTanX[i - 1] + segTanX[i];
      const az = segTanZ[i - 1] + segTanZ[i];
      const al = Math.hypot(ax, az);
      if (al < 1e-5) { tx = segTanX[i]; tz = segTanZ[i]; }
      else { tx = ax / al; tz = az / al; }
    }
    const nx = -tz, nz = tx;
    const [px, py, pz] = centerline[i];
    // 4 corners per sample, in order: outerBottom, innerBottom, innerTop, outerTop.
    verts.push(px + nx * halfT, py,          pz + nz * halfT);
    verts.push(px - nx * halfT, py,          pz - nz * halfT);
    verts.push(px - nx * halfT, py + height, pz - nz * halfT);
    verts.push(px + nx * halfT, py + height, pz + nz * halfT);
  }

  const indices: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const a = i * 4;
    const b = (i + 1) * 4;
    // Outer face (+nx side), CCW viewed from outside.
    indices.push(a + 0, b + 0, b + 3);
    indices.push(a + 0, b + 3, a + 3);
    // Inner face (-nx side), CCW viewed from inside.
    indices.push(a + 1, a + 2, b + 2);
    indices.push(a + 1, b + 2, b + 1);
    // Top face, CCW viewed from above.
    indices.push(a + 3, b + 3, b + 2);
    indices.push(a + 3, b + 2, a + 2);
  }
  // End caps. Start cap faces away from segment direction; end cap with it.
  indices.push(0, 3, 2);
  indices.push(0, 2, 1);
  const e = (n - 1) * 4;
  indices.push(e + 0, e + 1, e + 2);
  indices.push(e + 0, e + 2, e + 3);

  const positions = new Float32Array(verts);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function mergeGeometries(geos: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
  if (geos.length === 0) return null;
  let totalVerts = 0, totalIdx = 0;
  for (const g of geos) {
    totalVerts += g.getAttribute('position').count;
    totalIdx += g.getIndex()!.count;
  }
  const mergedPos = new Float32Array(totalVerts * 3);
  const mergedIdx = new Uint32Array(totalIdx);
  let posOff = 0, idxOff = 0, vertOff = 0;
  for (const g of geos) {
    const pos = g.getAttribute('position').array as Float32Array;
    mergedPos.set(pos, posOff);
    posOff += pos.length;
    const idx = g.getIndex()!.array as ArrayLike<number>;
    for (let k = 0; k < idx.length; k++) mergedIdx[idxOff + k] = idx[k] + vertOff;
    idxOff += idx.length;
    vertOff += g.getAttribute('position').count;
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(mergedPos, 3));
  merged.setIndex(new THREE.BufferAttribute(mergedIdx, 1));
  merged.computeVertexNormals();
  geos.forEach(g => g.dispose());
  return merged;
}

// Farm tracks — narrow dirt footpaths out to hamlets/farmsteads. Rendered as
// a separate mesh so they can be thinner and semi-transparent, visually
// distinct from the port's built road network. Detected by id prefix emitted
// from hinterland.ts. Constants live in ../utils/roadStyle.
function isFarmTrackRoad(id: string): boolean {
  return id.startsWith('farm_track_');
}

function CityRoads({ ports }: { ports: PortsProp }) {
  const { tierVariantMeshes, farmTrackMeshes, bridgeMeshes, bridgePiersByStyle } = useMemo(() => {
    // Non-bridge roads grouped by (tier, variant) so each culture renders with
    // its own colour without re-allocating a material per port.
    type TierKey = Exclude<RoadTierKey, 'bridge'>;
    const byTierVariant = new Map<string, THREE.BufferGeometry[]>();
    const byFarmTrackVariant = new Map<RoadVariantKey, THREE.BufferGeometry[]>();
    const keyFor = (t: TierKey, v: RoadVariantKey) => `${t}|${v}`;
    // Bridges grouped by cultural style. Each style accumulates deck +
    // parapet ribbons separately so they can use distinct materials.
    const bridgeBuckets: Record<BridgeStyleKey, {
      deck: THREE.BufferGeometry[];
      parapet: THREE.BufferGeometry[];
      piers: [number, number, number][];
    }> = {
      stone:  { deck: [], parapet: [], piers: [] },
      timber: { deck: [], parapet: [], piers: [] },
      plank:  { deck: [], parapet: [], piers: [] },
    };

    const deckHalfWidth = ROAD_TIER_STYLE.bridge.width / 2;

    for (const port of ports) {
      if (!port.roads || port.roads.length === 0) continue;
      const bridgeStyle = bridgeStyleForPort(port.culture);
      const bs = BRIDGE_STYLE[bridgeStyle];
      const nat = PORT_FACTION[port.id];
      const reg = PORT_CULTURAL_REGION[port.id];
      const variant = roadVariantForPort(port.culture, nat, reg);
      // Per-road taper flags: a true dead-end (graph node degree 1) keeps
      // the 15% endpoint taper for a soft fade into grass/building anchor;
      // a welded endpoint (degree ≥ 2) stays full width so its ribbon
      // meets the target cleanly. Falls back to "taper both ends" if no
      // graph is available (older saves, malformed port data).
      const endpointTapers = new Map<string, [boolean, boolean]>();
      const graph = port.roadGraph;
      if (graph) {
        for (const edge of graph.edges) {
          const fromDead = edge.fromNode >= 0 && graph.nodes[edge.fromNode].degree === 1;
          const toDead = edge.toNode >= 0 && graph.nodes[edge.toNode].degree === 1;
          endpointTapers.set(edge.roadId, [fromDead, toDead]);
        }
      }
      const taperFor = (roadId: string): [boolean, boolean] =>
        endpointTapers.get(roadId) ?? [true, true];

      for (const r of port.roads) {
        if (r.tier === 'bridge') {
          const [ts, te] = taperFor(r.id);
          const deckGeo = buildRoadRibbon(r.points, ROAD_TIER_STYLE.bridge.width, 0, ts, te);
          if (deckGeo) bridgeBuckets[bridgeStyle].deck.push(deckGeo);
          // Parapets: a solid extruded box wall along each deck edge so the
          // railing reads as a proper parapet rather than a flat strip. The
          // wall base sits on the deck plane and rises by parapet.height.
          if (bs.parapet) {
            const railOffset = deckHalfWidth - bs.parapet.thickness / 2;
            const leftCenter  = offsetPolylineXZ(r.points,  railOffset, 0);
            const rightCenter = offsetPolylineXZ(r.points, -railOffset, 0);
            const lg = buildWallRibbon(leftCenter,  bs.parapet.thickness, bs.parapet.height);
            const rg = buildWallRibbon(rightCenter, bs.parapet.thickness, bs.parapet.height);
            if (lg) bridgeBuckets[bridgeStyle].parapet.push(lg);
            if (rg) bridgeBuckets[bridgeStyle].parapet.push(rg);
          }
          // Piers on interior deck nodes at the style's spacing. Restrict
          // to points sitting on the water-span deck plane — abutment ramp
          // points ride below the deck (terrain Y) and clifftop abutments
          // get clamped up above it, so anything meaningfully off the deck
          // plane is land and would produce a pier stuck in the ground.
          //
          // Bridges over canals use a lower deck (CANAL_BRIDGE_DECK_Y) than
          // bridges over rivers; rather than tracking which is which, we
          // infer the deck plane from the road's MIDDLE point — by the
          // pathToRoad construction it's always a water-span vertex sitting
          // exactly on the deck plane.
          const midIdx = Math.floor(r.points.length / 2);
          const inferredDeckY = r.points[midIdx]?.[1] ?? BRIDGE_DECK_Y;
          for (let i = 1; i < r.points.length - 1; i += bs.pierStep) {
            if (Math.abs(r.points[i][1] - inferredDeckY) > 0.05) continue;
            bridgeBuckets[bridgeStyle].piers.push(r.points[i]);
          }
        } else if (isFarmTrackRoad(r.id)) {
          // Farm tracks render thinner and faded so they read as footpaths
          // rather than built roads. They stay on 'path' tier in the data
          // model so pedestrian corridor-snapping treats them like any road.
          // The terrain edge sampler keeps both flanks pinned to the slope
          // so a track contouring a hillside banks instead of cutting a
          // horizontal sliver through it.
          const [ts, te] = taperFor(r.id);
          const geo = buildRoadRibbon(r.points, FARM_TRACK_WIDTH, FARM_TRACK_Y_LIFT, ts, te, getTerrainHeight);
          if (!geo) continue;
          const bucket = byFarmTrackVariant.get(variant);
          if (bucket) bucket.push(geo); else byFarmTrackVariant.set(variant, [geo]);
        } else {
          // Land roads sample terrain at the lateral offset of each ribbon
          // edge. On a slope the uphill edge rides up the hillside and the
          // downhill edge drops with it, so the cross-section banks with
          // the terrain instead of slicing horizontally through the slope.
          const tierKey = r.tier as TierKey;
          const style = ROAD_TIER_STYLE[tierKey];
          const [ts, te] = taperFor(r.id);
          const geo = buildRoadRibbon(r.points, style.width, style.yLift, ts, te, getTerrainHeight);
          if (!geo) continue;
          const k = keyFor(tierKey, variant);
          const bucket = byTierVariant.get(k);
          if (bucket) bucket.push(geo); else byTierVariant.set(k, [geo]);
        }
      }
    }

    const tierVariantMeshes: { tier: TierKey; variant: RoadVariantKey; geo: THREE.BufferGeometry }[] = [];
    for (const [k, geos] of byTierVariant) {
      const [tier, variant] = k.split('|') as [TierKey, RoadVariantKey];
      const merged = mergeGeometries(geos);
      if (merged) tierVariantMeshes.push({ tier, variant, geo: merged });
    }
    const farmTrackMeshes: { variant: RoadVariantKey; geo: THREE.BufferGeometry }[] = [];
    for (const [variant, geos] of byFarmTrackVariant) {
      const merged = mergeGeometries(geos);
      if (merged) farmTrackMeshes.push({ variant, geo: merged });
    }

    const bridgeMeshes: {
      style: BridgeStyleKey;
      deck: THREE.BufferGeometry | null;
      parapet: THREE.BufferGeometry | null;
    }[] = [];
    const bridgePiersByStyle: Record<BridgeStyleKey, [number, number, number][]> = {
      stone: [], timber: [], plank: [],
    };
    (['stone', 'timber', 'plank'] as const).forEach(style => {
      const b = bridgeBuckets[style];
      bridgeMeshes.push({
        style,
        deck: mergeGeometries(b.deck),
        parapet: mergeGeometries(b.parapet),
      });
      bridgePiersByStyle[style] = b.piers;
    });

    return { tierVariantMeshes, farmTrackMeshes, bridgeMeshes, bridgePiersByStyle };
  }, [ports]);

  const materials = useMemo(() => {
    // One material per (tier, variant). Created lazily via a Map so we only
    // allocate what's actually on screen (most runs hit a small subset).
    const m = new Map<string, THREE.MeshStandardMaterial>();
    const tiers: Array<'path' | 'road' | 'avenue'> = ['path', 'road', 'avenue'];
    const variants = Object.keys(ROAD_VARIANT_STYLE) as RoadVariantKey[];
    for (const t of tiers) {
      for (const v of variants) {
        const s = ROAD_VARIANT_STYLE[v][t];
        m.set(`${t}|${v}`, new THREE.MeshStandardMaterial({
          color: s.color, roughness: s.roughness, metalness: 0,
          polygonOffset: true,
          polygonOffsetFactor: ROAD_TIER_STYLE[t].polygonOffsetFactor,
          polygonOffsetUnits: ROAD_POLYGON_OFFSET_UNITS,
        }));
      }
    }
    return m;
  }, []);

  const farmTrackMaterials = useMemo(() => {
    // Derive farm-track tone from the variant's path color, shifted darker
    // and with some alpha so the track reads as a worn trail blending into
    // the surrounding earth.
    const m = new Map<RoadVariantKey, THREE.MeshStandardMaterial>();
    const variants = Object.keys(ROAD_VARIANT_STYLE) as RoadVariantKey[];
    for (const v of variants) {
      const base = new THREE.Color(ROAD_VARIANT_STYLE[v].path.color);
      base.multiplyScalar(0.78); // slightly darker than the built path
      m.set(v, new THREE.MeshStandardMaterial({
        color: base, roughness: 1.0, metalness: 0,
        transparent: true, opacity: FARM_TRACK_OPACITY, depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: ROAD_TIER_STYLE.path.polygonOffsetFactor,
        polygonOffsetUnits: ROAD_POLYGON_OFFSET_UNITS,
      }));
    }
    return m;
  }, []);

  const bridgeMaterials = useMemo(() => {
    const m: Record<BridgeStyleKey, { deck: THREE.MeshStandardMaterial; parapet: THREE.MeshStandardMaterial; pier: THREE.MeshStandardMaterial }> = {} as never;
    (['stone', 'timber', 'plank'] as const).forEach(k => {
      const s = BRIDGE_STYLE[k];
      m[k] = {
        deck: new THREE.MeshStandardMaterial({
          color: s.deckColor, roughness: s.deckRoughness, metalness: 0,
          polygonOffset: true,
          polygonOffsetFactor: ROAD_TIER_STYLE.bridge.polygonOffsetFactor,
          polygonOffsetUnits: ROAD_POLYGON_OFFSET_UNITS,
        }),
        parapet: new THREE.MeshStandardMaterial({
          color: s.parapet?.color ?? s.deckColor, roughness: 0.95, metalness: 0,
        }),
        pier: new THREE.MeshStandardMaterial({
          color: s.pier.color, roughness: 0.95, metalness: 0,
        }),
      };
    });
    return m;
  }, []);

  const pierGeoms = useMemo(() => {
    const g: Record<BridgeStyleKey, THREE.CylinderGeometry> = {} as never;
    (['stone', 'timber', 'plank'] as const).forEach(k => {
      const p = BRIDGE_STYLE[k].pier;
      g[k] = new THREE.CylinderGeometry(p.radiusTop, p.radiusBot, p.height, p.segments);
    });
    return g;
  }, []);

  return (
    <group>
      {tierVariantMeshes.map(({ tier, variant, geo }) => (
        <mesh
          key={`${tier}|${variant}`}
          geometry={geo}
          material={materials.get(`${tier}|${variant}`)!}
          renderOrder={ROAD_TIER_STYLE[tier].renderOrder}
          receiveShadow
        />
      ))}
      {farmTrackMeshes.map(({ variant, geo }) => (
        <mesh
          key={`farm-track|${variant}`}
          geometry={geo}
          material={farmTrackMaterials.get(variant)!}
          renderOrder={0}
          receiveShadow
        />
      ))}
      {bridgeMeshes.map(({ style, deck, parapet }) => (
        <group key={style}>
          {deck && (
            <mesh
              geometry={deck}
              material={bridgeMaterials[style].deck}
              renderOrder={ROAD_TIER_STYLE.bridge.renderOrder}
              receiveShadow
              castShadow
            />
          )}
          {parapet && <mesh geometry={parapet} material={bridgeMaterials[style].parapet} receiveShadow castShadow />}
        </group>
      ))}
      {(['stone', 'timber', 'plank'] as const).map(style => {
        const piers = bridgePiersByStyle[style];
        if (piers.length === 0) return null;
        return (
          <BridgePiers
            key={style}
            geom={pierGeoms[style]}
            material={bridgeMaterials[style].pier}
            positions={piers}
            height={BRIDGE_STYLE[style].pier.height}
          />
        );
      })}
    </group>
  );
}

function BridgePiers({
  geom, material, positions, height,
}: {
  geom: THREE.CylinderGeometry;
  material: THREE.MeshStandardMaterial;
  positions: [number, number, number][];
  height: number;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    if (!ref.current) return;
    const dummy = new THREE.Object3D();
    // Top of pier sits ~0.2 below deck so it tucks under cleanly.
    const centerOffset = 0.2 + height / 2;
    positions.forEach((p, i) => {
      dummy.position.set(p[0], p[1] - centerOffset, p[2]);
      dummy.updateMatrix();
      ref.current!.setMatrixAt(i, dummy.matrix);
    });
    ref.current.instanceMatrix.needsUpdate = true;
  }, [positions, height]);
  // Piers don't cast shadows: dense rows of thin vertical cylinders (timber
  // bridges use pierStep=1) project a noisy picket-fence of shadow blades
  // onto the transparent water, and since the water surface already sits
  // below them the cast shadows read as visual litter rather than depth cue.
  // The deck + parapet still cast the bridge's main shadow.
  return (
    <instancedMesh ref={ref} args={[geom, material, positions.length]} receiveShadow />
  );
}

function CityFieldOverlay({ ports }: { ports: PortsProp }) {
  const overlayEnabled = useGameStore((state) => state.renderDebug.cityFieldOverlay);
  const overlayMode = useGameStore((state) => state.renderDebug.cityFieldMode);
  const devSoloPort = useGameStore((state) => state.devSoloPort);
  const worldSize = useGameStore((state) => state.worldSize);

  const samples = useMemo(() => {
    if (!overlayEnabled) return [] as CityFieldOverlaySample[];

    const visiblePorts = devSoloPort
      ? ports.filter((port) => port.id === devSoloPort)
      : ports;

    // District mode is categorical — one color per district class, no
    // per-field normalization. Only per-port samples are classified (the
    // out-of-city world samples have no meaningful district identity).
    if (overlayMode === 'district') {
      const overlaySamples: CityFieldOverlaySample[] = [];
      for (const port of visiblePorts) {
        for (const sample of sampleCityFields(port)) {
          const district: DistrictKey = classifyDistrict(sample.values, port.scale);
          overlaySamples.push({
            pos: [sample.x, sample.y + 0.06, sample.z],
            scale: [sample.size * 0.98, sample.size * 0.98, 1],
            color: DISTRICT_COLORS[district],
          });
        }
      }
      return overlaySamples;
    }

    const rawSamples: { x: number; y: number; z: number; size: number; value: number }[] = [];

    for (const worldSample of sampleWorldFields(visiblePorts, worldSize)) {
      rawSamples.push({
        x: worldSample.x,
        y: worldSample.y,
        z: worldSample.z,
        size: worldSample.size,
        value: worldSample.values[overlayMode],
      });
    }

    for (const port of visiblePorts) {
      for (const sample of sampleCityFields(port)) {
        rawSamples.push({
          x: sample.x,
          y: sample.y,
          z: sample.z,
          size: sample.size,
          value: sample.values[overlayMode],
        });
      }
    }

    if (rawSamples.length === 0) return [] as CityFieldOverlaySample[];

    const sortedValues = rawSamples
      .map((sample) => sample.value)
      .sort((a, b) => a - b);
    let minValue = percentile(sortedValues, 0.05);
    let maxValue = percentile(sortedValues, 0.95);
    if (maxValue - minValue < 0.05) {
      minValue = sortedValues[0];
      maxValue = sortedValues[sortedValues.length - 1];
    }

    const overlaySamples: CityFieldOverlaySample[] = [];
    const range = Math.max(0.001, maxValue - minValue);
    for (const sample of rawSamples) {
      const normalizedValue = Math.max(0, Math.min(1, (sample.value - minValue) / range));
      overlaySamples.push({
        pos: [sample.x, sample.y + 0.06, sample.z],
        scale: [sample.size * 0.98, sample.size * 0.98, 1],
        color: cityFieldColor(overlayMode, normalizedValue),
      });
    }

    return overlaySamples;
  }, [devSoloPort, overlayEnabled, overlayMode, ports, worldSize]);

  if (!overlayEnabled || samples.length === 0) return null;
  return <CityFieldOverlayInstances samples={samples} />;
}

function CityFieldOverlayInstances({ samples }: { samples: CityFieldOverlaySample[] }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummyRef = useRef(new THREE.Object3D());
  const colorRef = useRef(new THREE.Color());
  const geometry = useMemo(() => {
    const plane = new THREE.PlaneGeometry(1, 1);
    plane.rotateX(-Math.PI / 2);
    return plane;
  }, []);
  const material = useMemo(() => new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.62,
    depthWrite: false,
    depthTest: true,
    toneMapped: false,
    fog: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  }), []);

  useEffect(() => {
    if (!meshRef.current) return;
    const dummy = dummyRef.current;
    const color = colorRef.current;
    for (let i = 0; i < samples.length; i++) {
      const sample = samples[i];
      dummy.position.set(...sample.pos);
      dummy.scale.set(...sample.scale);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
      color.setRGB(sample.color[0], sample.color[1], sample.color[2]);
      meshRef.current.setColorAt(i, color);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) {
      meshRef.current.instanceColor.needsUpdate = true;
    }
  }, [samples]);

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, samples.length]}
      frustumCulled={false}
      renderOrder={0}
    />
  );
}

// ── Sacred Building Markers (Sims-style plumbob) ─────────────────────────────
// Floating glowing purple octahedron above every spiritual building and over
// religious landmarks (Bom Jesus, Oude Kerk, etc.). Toggled by the Display
// tab's "Sacred Site Markers" switch; defaults on. Instanced — one draw call
// for diamonds, one for halos, regardless of port count.

function SacredBuildingMarkers({ ports }: { ports: PortsProp }) {
  const visible = useGameStore((state) => state.renderDebug.sacredMarkers);
  const devSoloPort = useGameStore((state) => state.devSoloPort);

  const positions = useMemo(() => {
    if (!visible) return [] as [number, number, number][];
    const visiblePorts = devSoloPort
      ? ports.filter((p) => p.id === devSoloPort)
      : ports;
    const out: [number, number, number][] = [];
    for (const port of visiblePorts) {
      for (const b of port.buildings) {
        const cls = buildingSemanticClass(b);
        if (!cls || SEMANTIC_STYLE[cls].marker !== 'diamond') continue;
        // Float the diamond above the roofline so it reads from a distance
        // and clears most landmark spires.
        const topY = b.position[1] + Math.max(b.scale[1] * 2.5, 13);
        out.push([b.position[0], topY, b.position[2]]);
      }
    }
    return out;
  }, [devSoloPort, ports, visible]);

  const diamondGeo = useMemo(() => new THREE.OctahedronGeometry(1.55, 0), []);
  const diamondMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#cc96ff',
    emissive: '#ad55ff',
    emissiveIntensity: 2.3,
    metalness: 0.15,
    roughness: 0.22,
    transparent: true,
    opacity: 0.93,
    toneMapped: false,
  }), []);

  const haloTex = useMemo(() => {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0.0, 'rgba(220, 160, 255, 1.0)');
    grad.addColorStop(0.45, 'rgba(170, 90, 240, 0.45)');
    grad.addColorStop(1.0, 'rgba(140, 70, 220, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, []);
  const haloGeo = useMemo(() => {
    const g = new THREE.PlaneGeometry(1, 1);
    return g;
  }, []);
  const haloMat = useMemo(() => new THREE.MeshBasicMaterial({
    map: haloTex,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    opacity: 0.9,
  }), [haloTex]);

  const diamondRef = useRef<THREE.InstancedMesh>(null);
  const haloRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useRef(new THREE.Object3D());

  useFrame(({ clock, camera }) => {
    if (!visible) return;
    if (!diamondRef.current || !haloRef.current) return;
    const t = clock.elapsedTime;
    const pulse = 0.92 + Math.sin(t * 2.2) * 0.08;
    diamondMat.emissiveIntensity = 2.1 + Math.sin(t * 3.1) * 0.45;
    haloMat.opacity = 0.65 + Math.sin(t * 2.2) * 0.22;
    for (let i = 0; i < positions.length; i++) {
      const [px, py, pz] = positions[i];
      const bob = Math.sin(t * 1.6 + i * 0.7) * 0.38;
      const obj = dummy.current;
      obj.position.set(px, py + bob, pz);
      obj.rotation.set(0, t * 1.1 + i, 0);
      obj.scale.set(pulse, pulse * 1.15, pulse);
      obj.updateMatrix();
      diamondRef.current.setMatrixAt(i, obj.matrix);

      // Halo billboards to the camera so it always reads as a disc.
      obj.position.set(px, py + bob - 0.5, pz);
      obj.quaternion.copy(camera.quaternion);
      const haloPulse = 4.4 + Math.sin(t * 2.2 + i) * 0.5;
      obj.scale.set(haloPulse, haloPulse, haloPulse);
      obj.updateMatrix();
      haloRef.current.setMatrixAt(i, obj.matrix);
    }
    diamondRef.current.instanceMatrix.needsUpdate = true;
    haloRef.current.instanceMatrix.needsUpdate = true;
  });

  if (!visible || positions.length === 0) return null;

  return (
    <group>
      <instancedMesh
        ref={haloRef}
        args={[haloGeo, haloMat, positions.length]}
        frustumCulled={false}
        renderOrder={8}
      />
      <instancedMesh
        ref={diamondRef}
        args={[diamondGeo, diamondMat, positions.length]}
        frustumCulled={false}
        renderOrder={9}
      />
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
      dummy.scale.set(0.225, 0.35, 0.225);
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
        dummy.scale.set(0.225 * f, 0.35 * f, 0.225 * f);
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
  const lastUpdateRef = useRef(0);

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
    if (t - lastUpdateRef.current < 0.05) return; // ~20fps
    lastUpdateRef.current = t;
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

const DAMAGE_PUFFS_PER_SOURCE = 4;
const DAMAGE_PUFF_CYCLE = 3.2;

function BuildingDamageSmoke({ spots }: { spots: DamageSmokeSpot[] }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummyRef = useRef(new THREE.Object3D());
  const lastUpdateRef = useRef(0);

  const puffGeo = useMemo(() => new THREE.SphereGeometry(1, 6, 5), []);
  const puffMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#605c58',
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
    roughness: 1,
  }), []);

  const totalPuffs = spots.length * DAMAGE_PUFFS_PER_SOURCE;

  useFrame(({ clock }) => {
    if (!meshRef.current || totalPuffs === 0) return;
    const t = clock.elapsedTime;
    if (t - lastUpdateRef.current < 0.05) return; // ~20fps
    lastUpdateRef.current = t;
    const dummy = dummyRef.current;

    for (let si = 0; si < spots.length; si++) {
      const spot = spots[si];
      const baseSeed = spot.seed * 0.013;
      for (let p = 0; p < DAMAGE_PUFFS_PER_SOURCE; p++) {
        const idx = si * DAMAGE_PUFFS_PER_SOURCE + p;
        const phase = (t + baseSeed + p * (DAMAGE_PUFF_CYCLE / DAMAGE_PUFFS_PER_SOURCE)) % DAMAGE_PUFF_CYCLE;
        const progress = phase / DAMAGE_PUFF_CYCLE;
        const rise = progress * (4.5 + spot.intensity * 2.8);
        const drift = Math.sin(baseSeed + t * 0.35) * progress * (0.6 + spot.intensity * 0.9);
        const driftZ = Math.cos(baseSeed * 1.9 + t * 0.25) * progress * (0.35 + spot.intensity * 0.5);
        const scale = (0.18 + progress * 0.42) * (0.8 + spot.intensity * 0.9);
        const alpha = progress < 0.12
          ? progress / 0.12
          : 1.0 - (progress - 0.12) / 0.88;

        dummy.position.set(
          spot.pos[0] + drift,
          spot.pos[1] + rise,
          spot.pos[2] + driftZ,
        );
        dummy.scale.setScalar(scale * Math.max(0.01, alpha));
        dummy.updateMatrix();
        meshRef.current.setMatrixAt(idx, dummy.matrix);
      }
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  if (totalPuffs === 0) return null;
  return <instancedMesh ref={meshRef} args={[puffGeo, puffMat, totalPuffs]} frustumCulled={false} />;
}

function RuinedBuildingDebris({ ruins }: { ruins: RuinMarker[] }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummyRef = useRef(new THREE.Object3D());
  const geo = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#3f3b37',
    roughness: 1,
  }), []);

  useEffect(() => {
    if (!meshRef.current) return;
    const dummy = dummyRef.current;
    ruins.forEach((r, i) => {
      dummy.position.set(...r.pos);
      dummy.scale.set(...r.scale);
      dummy.rotation.set(-0.18, r.rotY, 0.14);
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [ruins]);

  if (ruins.length === 0) return null;
  return <instancedMesh ref={meshRef} args={[geo, mat, ruins.length]} frustumCulled={false} />;
}

// ── Instanced Parts Renderer ──────────────────────────────────────────────────

function InstancedParts({ parts, geometry, material }: { parts: Part[]; geometry: THREE.BufferGeometry; material: THREE.Material }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummyRef = useRef(new THREE.Object3D());
  const colorRef = useRef(new THREE.Color());
  const hadShakeRef = useRef(false);
  const damageVersionRef = useRef(-1);

  function applyPartMatrix(dummy: THREE.Object3D, part: Part) {
    const centerY = part.shakeCenter?.[1] ?? part.pos[1];
    const damageStage = part.buildingId ? getBuildingDamageStage(part.buildingId) : 'intact';
    const damageFraction = part.buildingId ? getBuildingDamageFraction(part.buildingId) : 0;

    dummy.position.set(...part.pos);
    dummy.scale.set(...part.scale);
    dummy.rotation.set(...part.rot);

    if (damageStage === 'destroyed') {
      if (isRoofLikePart(part, centerY)) {
        dummy.scale.setScalar(0.0001);
      } else if (isWindowLikePart(part, centerY)) {
        dummy.scale.setScalar(0.0001);
      } else if (isDelicateDetailPart(part, centerY)) {
        dummy.scale.setScalar(0.0001);
      } else if (part.pos[1] > centerY + 0.6) {
        dummy.rotation.z += 0.04;
        dummy.position.y -= Math.min(0.8, damageFraction * 0.6);
      }
    } else if (damageStage === 'heavilyDamaged') {
      if (isDelicateDetailPart(part, centerY)) {
        dummy.scale.multiplyScalar(0.72);
        dummy.position.y -= 0.08;
      } else if (isRoofLikePart(part, centerY)) {
        dummy.rotation.z += 0.08;
        dummy.position.y -= 0.14;
      }
    }

    if (geometry instanceof THREE.CylinderGeometry && geometry.parameters.radialSegments === 4) {
      dummy.rotation.y += Math.PI / 4;
    }
    dummy.updateMatrix();
  }

  function applyInstanceColors() {
    const mesh = meshRef.current;
    if (!mesh) return;
    const color = colorRef.current;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (!p.color) continue;
      let finalColor = applyGroundWeathering(p.color, p);
      if (p.buildingId) {
        const damageStage = getBuildingDamageStage(p.buildingId);
        if (damageStage === 'destroyed') {
          finalColor = ruinedColor(finalColor);
        } else if (damageStage !== 'intact') {
          finalColor = damagedColor(finalColor, getBuildingDamageFraction(p.buildingId));
        }
      }
      color.setRGB(finalColor[0], finalColor[1], finalColor[2]);
      mesh.setColorAt(i, color);
    }
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }
    damageVersionRef.current = getBuildingDamageVersion();
  }

  useEffect(() => {
    if (!meshRef.current) return;
    const dummy = dummyRef.current;
    parts.forEach((p, i) => {
      applyPartMatrix(dummy, p);
      meshRef.current!.setMatrixAt(i, dummy.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
    applyInstanceColors();
  }, [parts, geometry]);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    if (damageVersionRef.current !== getBuildingDamageVersion()) {
      const dummy = dummyRef.current;
      for (let i = 0; i < parts.length; i++) {
        applyPartMatrix(dummy, parts[i]);
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      applyInstanceColors();
    }

    const now = Date.now() * 0.001;
    let hasRecentShake = false;
    for (const shake of buildingShakes) {
      const age = now - shake.time;
      if (age >= 0 && age < BUILDING_SHAKE_DURATION) {
        hasRecentShake = true;
        break;
      }
    }
    if (!hasRecentShake && !hadShakeRef.current) return;

    const dummy = dummyRef.current;
    let needsUpdate = false;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      let offsetX = 0;
      let offsetY = 0;
      let offsetZ = 0;
      if (p.buildingId && p.shakeCenter) {
        for (const shake of buildingShakes) {
          if (shake.buildingId !== p.buildingId) continue;
          const age = now - shake.time;
          if (age < 0 || age >= BUILDING_SHAKE_DURATION) continue;
          const decay = 1 - age / BUILDING_SHAKE_DURATION;
          const amp = BUILDING_SHAKE_SWAY * shake.intensity * decay;
          const radialX = p.pos[0] - p.shakeCenter[0];
          const radialZ = p.pos[2] - p.shakeCenter[2];
          offsetX += Math.sin(age * 62 + i * 0.37) * amp + radialX * 0.018 * amp;
          offsetY += Math.abs(Math.sin(age * 88 + i * 0.21)) * amp * 0.28;
          offsetZ += Math.cos(age * 57 + i * 0.29) * amp + radialZ * 0.018 * amp;
        }
      }

      dummy.position.set(p.pos[0] + offsetX, p.pos[1] + offsetY, p.pos[2] + offsetZ);
      dummy.scale.set(...p.scale);
      dummy.rotation.set(...p.rot);
      if (geometry instanceof THREE.CylinderGeometry && geometry.parameters.radialSegments === 4) {
        dummy.rotation.y += Math.PI / 4;
      }
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      needsUpdate = true;
    }

    if (needsUpdate) {
      mesh.instanceMatrix.needsUpdate = true;
    }
    hadShakeRef.current = hasRecentShake;
  });

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
