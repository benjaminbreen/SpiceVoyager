// Derives a flat, render-ready appearance object for the 3D player rig from
// the captain's PortraitConfig. Decouples portrait data (eye color indices,
// face shape, etc. used by the 2D SVG portrait) from the 3D primitives.

import type { CrewMember } from '../store/gameStore';
import {
  crewToPortraitConfig,
  getSkin,
  getHairColor,
  type PortraitConfig,
  type CulturalGroup,
  type SocialClass,
  type Gender,
  type AgeRange,
} from './portraitConfig';

// ── Hat catalog ────────────────────────────────────────────────────────────
// 1612-appropriate. Tricorn deliberately excluded (not yet in fashion).
export type HatType =
  | 'monmouth'        // knit cap, North European working class
  | 'felt_wide'       // wide-brimmed felt, European merchant
  | 'felt_plumed'     // wide-brimmed with feather, European noble/captain
  | 'turban_arab'     // small turban, Arab/Persian
  | 'turban_arab_jeweled'  // larger turban with gem, noble
  | 'turban_mughal'   // Mughal-style folded turban
  | 'kufi'            // Swahili cap
  | 'kufi_band'       // embroidered kufi
  | 'songkok'         // Southeast Asian truncated cone cap
  | 'conical_bamboo'  // East Asian working sailor
  | 'east_asian_cap'  // small black cap, East Asian merchant/noble
  | 'kerchief'        // tied head cloth, sailor fallback
  | 'none';

export interface PlayerAppearance {
  // Skin / face
  skinColor: string;
  skinShadow: string;        // for face-bottom / neck shadow if we ever add it
  hairColor: string;
  hasBeard: boolean;
  beardColor: string;
  hasQueue: boolean;          // East Asian braid down the back

  // Clothing
  doubletColor: string;       // upper torso
  doubletTrim: string;        // collar / accent
  breechesColor: string;      // lower torso
  bootColor: string;
  // Cultural override: instead of doublet/breeches, render as a robe
  // (ArabPersian/Indian/EastAsian merchant+noble characters).
  wearsRobe: boolean;
  robeColor: string;
  robeTrim: string;

  // Accessories
  hat: HatType;
  hatColor: string;
  hatAccent: string;          // band, feather, jewel base color
  hasEarring: boolean;
  hasEyePatch: boolean;
  eyePatchSide: -1 | 1;
  hasNeckKerchief: boolean;
  kerchiefColor: string;
  isScarred: boolean;

  // Stable seed (for future random subdetails)
  seed: number;
}

// ── Color palettes for clothing by cultural group + class ──────────────────
// Kept tight — we want regional silhouettes to read at a glance.

const DOUBLET_PALETTES: Record<CulturalGroup, Record<SocialClass, string[]>> = {
  NorthEuropean: {
    Working:  ['#5c4a36', '#4a3a28', '#6a5a40', '#8a7a5a'],   // brown linen, wool
    Merchant: ['#1e3a5a', '#2a3a2a', '#5a2a2a', '#3a2a4a'],   // deep blue, forest, wine, plum
    Noble:    ['#1a1a2a', '#3a1a3a', '#1a2a1a', '#2a1a1a'],   // black, deep purple, dark green, oxblood
  },
  SouthEuropean: {
    Working:  ['#7a6a4a', '#5a4a32', '#8a6a4a', '#6a5a3a'],   // earth tones
    Merchant: ['#5a2030', '#3a2a5a', '#2a4a2a', '#5a4a1a'],   // wine, indigo, olive, ochre
    Noble:    ['#1a0a1a', '#2a0a2a', '#3a1a0a', '#1a1a1a'],   // black, very dark purple, oxblood
  },
  ArabPersian: {
    Working:  ['#7a6840', '#8a7050', '#6a5a40', '#9a8060'],   // earth, camel, ochre
    Merchant: ['#4a3a2a', '#5a2a2a', '#3a3a5a', '#4a4a2a'],   // brown, brick, indigo, mustard
    Noble:    ['#2a1a3a', '#3a0a1a', '#1a2a3a', '#3a2a0a'],   // deep purple, dark crimson, midnight blue
  },
  Indian: {
    Working:  ['#c8b890', '#a89868', '#988858', '#b8a878'],   // off-white, ivory cotton
    Merchant: ['#e8d8a8', '#c8a868', '#a86840', '#d8b888'],   // saffron-cream, gold, copper
    Noble:    ['#3a1a4a', '#5a1a2a', '#3a3a1a', '#4a1a4a'],   // royal purple, ruby, deep gold, magenta
  },
  Swahili: {
    Working:  ['#d8c8a0', '#b8a880', '#9a8a68', '#c8b888'],   // kanga whites and tans
    Merchant: ['#5a4a2a', '#6a3a2a', '#3a4a3a', '#5a5a2a'],   // earth and ochre with patterned trim
    Noble:    ['#1a2a4a', '#3a1a3a', '#2a4a2a', '#4a2a1a'],   // indigo, deep plum, jade
  },
  SoutheastAsian: {
    Working:  ['#5a4a3a', '#6a5a3a', '#7a6a4a', '#8a7a5a'],   // batik browns
    Merchant: ['#4a2a4a', '#3a3a5a', '#5a4a1a', '#3a4a2a'],   // batik wine, indigo, gold
    Noble:    ['#2a1a3a', '#1a1a4a', '#3a1a1a', '#1a2a2a'],   // royal indigo, dark teal
  },
  EastAsian: {
    Working:  ['#3a3a3a', '#4a4a4a', '#2a3a4a', '#5a4a3a'],   // grey hemp, dark cotton
    Merchant: ['#2a3a5a', '#5a2a3a', '#3a4a2a', '#4a3a4a'],   // navy, wine, jade
    Noble:    ['#1a1a1a', '#2a1a3a', '#3a1a1a', '#1a3a3a'],   // black silk, dark purple
  },
};

const BREECHES_COLORS = ['#2a2418', '#3a2a18', '#4a3a28', '#1a1a1a', '#2a1a0a'];
const BOOT_COLORS = ['#1a0e08', '#2a1a0e', '#3a2a18', '#0a0a0a'];

const KUFI_COLORS = ['#1a1a1a', '#2a1a3a', '#1a2a3a', '#3a2a1a'];
const SONGKOK_COLORS = ['#0a0a0a', '#1a1a1a', '#2a1a2a', '#1a2a3a'];
const TURBAN_COLORS_WORKING = ['#d8c8a0', '#b8a880', '#a89878', '#c8b890'];
const TURBAN_COLORS_NOBLE = ['#3a1a4a', '#5a2a3a', '#1a2a4a', '#4a4a2a', '#5a4a1a'];
const FELT_HAT_COLORS = ['#2a1a0e', '#1a1a1a', '#3a2a18', '#2a1a1a'];
const FEATHER_COLORS = ['#d8c8a0', '#5a2a3a', '#3a4a5a', '#1a1a1a'];

// Deterministic small RNG using the portrait seed
function lcg(seed: number) {
  let s = seed | 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) | 0;
    return ((s >>> 0) / 0xFFFFFFFF);
  };
}

function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

// ── Hat selection ──────────────────────────────────────────────────────────
function pickHat(rng: () => number, group: CulturalGroup, klass: SocialClass, gender: Gender): HatType {
  // Female captains rarely wear hats in this period; default to kerchief.
  if (gender === 'Female') {
    if (group === 'ArabPersian' || group === 'Indian') return 'kerchief';
    return rng() > 0.5 ? 'kerchief' : 'none';
  }

  switch (group) {
    case 'NorthEuropean':
      if (klass === 'Noble') return 'felt_plumed';
      if (klass === 'Merchant') return rng() > 0.4 ? 'felt_wide' : 'felt_plumed';
      return rng() > 0.5 ? 'monmouth' : 'kerchief';

    case 'SouthEuropean':
      if (klass === 'Noble') return 'felt_plumed';
      if (klass === 'Merchant') return rng() > 0.5 ? 'felt_wide' : 'felt_plumed';
      return rng() > 0.6 ? 'monmouth' : 'kerchief';

    case 'ArabPersian':
      if (klass === 'Noble') return 'turban_arab_jeweled';
      return 'turban_arab';

    case 'Indian':
      return 'turban_mughal';

    case 'Swahili':
      return klass === 'Working' ? 'kufi' : 'kufi_band';

    case 'SoutheastAsian':
      return 'songkok';

    case 'EastAsian':
      if (klass === 'Working') return 'conical_bamboo';
      return 'east_asian_cap';
  }
}

// ── Beard heuristic ────────────────────────────────────────────────────────
function pickBeard(rng: () => number, gender: Gender, age: AgeRange, group: CulturalGroup): boolean {
  if (gender === 'Female') return false;
  // Cultural baseline rates — reflect typical 1612 facial-hair fashions.
  // East Asian men were typically clean-shaven or wispy; not representative
  // here as a fully-rendered beard mesh.
  let base = 0.5;
  switch (group) {
    case 'NorthEuropean':  base = 0.55; break;
    case 'SouthEuropean':  base = 0.65; break;
    case 'ArabPersian':    base = 0.85; break;
    case 'Indian':         base = 0.7;  break;
    case 'Swahili':        base = 0.4;  break;
    case 'SoutheastAsian': base = 0.25; break;
    case 'EastAsian':      base = 0.15; break;
  }
  // Older men more likely
  if (age === '50s') base = Math.min(1, base + 0.1);
  if (age === '60s') base = Math.min(1, base + 0.2);
  return rng() < base;
}

// ── Robe vs doublet ────────────────────────────────────────────────────────
// Some cultural groups use a long robe silhouette instead of European
// doublet+breeches — read as instantly distinct in the 3D rig.
function wearsRobe(group: CulturalGroup, klass: SocialClass): boolean {
  if (group === 'ArabPersian') return true;                         // thawb / kaftan
  if (group === 'Indian' && klass !== 'Working') return true;       // jama
  if (group === 'EastAsian' && klass !== 'Working') return true;    // changshan
  return false;
}

// ── Public API ─────────────────────────────────────────────────────────────
export function derivePlayerAppearance(captain: CrewMember | null | undefined): PlayerAppearance {
  if (!captain) return defaultAppearance();
  const portrait = crewToPortraitConfig(captain);
  return appearanceFromPortrait(portrait);
}

export function appearanceFromPortrait(portrait: PortraitConfig): PlayerAppearance {
  const skin = getSkin(portrait);
  const hairColor = getHairColor(portrait);
  const rng = lcg(portrait.seed + 7919);

  const robe = wearsRobe(portrait.culturalGroup, portrait.socialClass);
  const doubletPool = DOUBLET_PALETTES[portrait.culturalGroup][portrait.socialClass];
  const doubletColor = pick(rng, doubletPool);
  const robeColor = doubletColor; // reuse the picked color for the robe
  // Trim is a slightly lifted variant — for now just a fixed bright accent
  const robeTrim = portrait.socialClass === 'Noble' ? '#c8a040' : '#8a7050';
  const doubletTrim = portrait.socialClass === 'Noble' ? '#c8a040' : skin.dark;

  const hat = pickHat(rng, portrait.culturalGroup, portrait.socialClass, portrait.gender);
  const hatColor = (() => {
    switch (hat) {
      case 'monmouth':        return pick(rng, ['#3a2a18', '#1a1a1a', '#4a3a28']);
      case 'felt_wide':
      case 'felt_plumed':     return pick(rng, FELT_HAT_COLORS);
      case 'turban_arab':     return pick(rng, TURBAN_COLORS_WORKING);
      case 'turban_arab_jeweled': return pick(rng, TURBAN_COLORS_NOBLE);
      case 'turban_mughal':   return pick(rng, [...TURBAN_COLORS_WORKING, ...TURBAN_COLORS_NOBLE]);
      case 'kufi':            return pick(rng, KUFI_COLORS);
      case 'kufi_band':       return pick(rng, KUFI_COLORS);
      case 'songkok':         return pick(rng, SONGKOK_COLORS);
      case 'conical_bamboo':  return '#a87a48';
      case 'east_asian_cap':  return '#1a1a1a';
      case 'kerchief':        return portrait.kerchiefColor;
      default:                return '#000000';
    }
  })();
  const hatAccent = hat === 'felt_plumed' ? pick(rng, FEATHER_COLORS)
                  : hat === 'turban_arab_jeweled' ? '#3a4a8a'  // gem
                  : hat === 'kufi_band' ? '#c8a040'
                  : '#000000';

  const hasBeard = pickBeard(rng, portrait.gender, portrait.age, portrait.culturalGroup);
  const beardColor = hairColor;
  const hasQueue = portrait.culturalGroup === 'EastAsian' && portrait.gender === 'Male';

  return {
    skinColor: skin.mid,
    skinShadow: skin.dark,
    hairColor,
    hasBeard,
    beardColor,
    hasQueue,
    doubletColor,
    doubletTrim,
    breechesColor: pick(rng, BREECHES_COLORS),
    bootColor: pick(rng, BOOT_COLORS),
    wearsRobe: robe,
    robeColor,
    robeTrim,
    hat,
    hatColor,
    hatAccent,
    hasEarring: portrait.hasEarring,
    hasEyePatch: portrait.hasEyePatch,
    eyePatchSide: portrait.facialMarkSide as -1 | 1,
    hasNeckKerchief: portrait.hasNeckKerchief,
    kerchiefColor: portrait.kerchiefColor,
    isScarred: portrait.isScarred,
    seed: portrait.seed,
  };
}

function defaultAppearance(): PlayerAppearance {
  return {
    skinColor: '#d4ae82',
    skinShadow: '#a07a48',
    hairColor: '#2a1a0e',
    hasBeard: true,
    beardColor: '#2a1a0e',
    hasQueue: false,
    doubletColor: '#1e3a5a',
    doubletTrim: '#a07a48',
    breechesColor: '#2a2418',
    bootColor: '#1a0e08',
    wearsRobe: false,
    robeColor: '#1e3a5a',
    robeTrim: '#8a7050',
    hat: 'felt_wide',
    hatColor: '#2a1a0e',
    hatAccent: '#1a1a1a',
    hasEarring: false,
    hasEyePatch: false,
    eyePatchSide: 1,
    hasNeckKerchief: false,
    kerchiefColor: '#8b2020',
    isScarred: false,
    seed: 0,
  };
}
