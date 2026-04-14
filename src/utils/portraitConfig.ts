/**
 * Portrait configuration system — maps CrewMember data to procedural SVG portrait parameters.
 * Uses a deterministic seeded RNG so the same crew member always renders the same face.
 */

import type { CrewMember, Nationality, CrewRole, CrewQuality } from '../store/gameStore';

// ── Seeded PRNG (Mulberry32) ─────────────────────────────
// Deterministic 32-bit RNG. Given the same seed, produces the same sequence.
export function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Generate a stable numeric seed from a string (crew member id + name)
export function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    hash = ((hash << 5) - hash + ch) | 0;
  }
  return hash;
}

// ── Skin tone palettes ───────────────────────────────────
// Each skin tone is a gradient triple: light highlight, mid tone, shadow.
// Designed for warmth and naturalism across the full range of Indian Ocean peoples.

export interface SkinPalette {
  light: string;   // forehead/nose highlight
  mid: string;     // base skin
  dark: string;    // jaw/cheek shadow
  blush: string;   // lips, ears, knuckles
}

export const SKIN_PALETTES: SkinPalette[] = [
  // 0 - Very fair (Northern European)
  { light: '#f7e0ca', mid: '#f0d0b4', dark: '#d4a87a', blush: '#d4917a' },
  // 1 - Fair (Southern European, some Persian)
  { light: '#f0d4b0', mid: '#e0be96', dark: '#c49a6c', blush: '#c48a6c' },
  // 2 - Light olive (Mediterranean, Ottoman, lighter Mughal)
  { light: '#e8c89c', mid: '#d4ae82', dark: '#b08858', blush: '#b87a5a' },
  // 3 - Medium olive (Arab, Persian, Gujarati)
  { light: '#dbb888', mid: '#c49e6e', dark: '#a07a48', blush: '#a87050' },
  // 4 - Warm brown (Indian, Malay, lighter Swahili)
  { light: '#c8985c', mid: '#b48450', dark: '#8c6234', blush: '#9c5c3c' },
  // 5 - Medium brown (South Indian, many Malay/Javanese, Swahili)
  { light: '#b07840', mid: '#9a6834', dark: '#7a4e24', blush: '#8a4c30' },
  // 6 - Dark brown (Swahili, South Indian, Javanese)
  { light: '#946030', mid: '#7e4e24', dark: '#5e381a', blush: '#7a3e24' },
  // 7 - Deep brown (East African)
  { light: '#7e4e24', mid: '#6a3e1c', dark: '#4a2a12', blush: '#6a3420' },
  // 8 - Very deep (darker East African)
  { light: '#6a3e1c', mid: '#583214', dark: '#3e240e', blush: '#5c2e1c' },
  // 9 - East Asian warm
  { light: '#f0d4a8', mid: '#e0c090', dark: '#c09c68', blush: '#c88c68' },
  // 10 - Southeast Asian warm
  { light: '#deb87c', mid: '#c8a068', dark: '#a47c48', blush: '#b07050' },
];

// Nationality → weighted skin tone distribution
// Each entry: [paletteIndex, weight]. Higher weight = more common for that nationality.
const SKIN_DISTRIBUTION: Record<Nationality, [number, number][]> = {
  English:    [[0, 60], [1, 35], [2, 5]],
  Dutch:      [[0, 65], [1, 30], [2, 5]],
  Danish:     [[0, 70], [1, 25], [2, 5]],
  French:     [[0, 30], [1, 50], [2, 20]],
  Spanish:    [[1, 40], [2, 45], [3, 15]],
  Portuguese: [[1, 35], [2, 45], [3, 20]],
  Ottoman:    [[2, 35], [3, 45], [4, 20]],
  Persian:    [[2, 40], [3, 40], [4, 20]],
  Omani:      [[3, 40], [4, 40], [5, 20]],
  Mughal:     [[3, 30], [4, 45], [5, 25]],
  Gujarati:   [[3, 25], [4, 40], [5, 25], [6, 10]],
  Swahili:    [[5, 15], [6, 30], [7, 35], [8, 20]],
  Malay:      [[4, 30], [5, 35], [10, 35]],
  Acehnese:   [[4, 30], [5, 35], [10, 35]],
  Javanese:   [[4, 20], [5, 40], [10, 30], [6, 10]],
  Moluccan:   [[4, 25], [5, 35], [10, 30], [6, 10]],
  Siamese:    [[9, 20], [10, 40], [4, 30], [5, 10]],
  Chinese:    [[9, 55], [10, 30], [4, 15]],
  Japanese:   [[0, 15], [9, 55], [10, 25], [4, 5]],
};

// ── Eye colors ───────────────────────────────────────────

export const EYE_COLORS = [
  '#3b2507',  // 0 - very dark brown (near-black)
  '#5c3a14',  // 1 - dark brown
  '#7a5230',  // 2 - warm brown
  '#6b7a3a',  // 3 - hazel-green
  '#4a6a3a',  // 4 - green
  '#3a5a7a',  // 5 - gray-blue
  '#2a4a6a',  // 6 - blue
  '#1a3a5a',  // 7 - deep blue
  '#5a4a3a',  // 8 - amber/honey
];

const EYE_DISTRIBUTION: Record<Nationality, [number, number][]> = {
  English:    [[1, 15], [2, 20], [3, 10], [5, 25], [6, 20], [7, 10]],
  Dutch:      [[1, 10], [2, 15], [5, 25], [6, 30], [7, 20]],
  Danish:     [[2, 10], [5, 20], [6, 35], [7, 35]],
  French:     [[1, 20], [2, 25], [3, 15], [5, 20], [6, 15], [4, 5]],
  Spanish:    [[0, 20], [1, 35], [2, 25], [3, 10], [8, 10]],
  Portuguese: [[0, 20], [1, 35], [2, 25], [3, 10], [8, 10]],
  Ottoman:    [[0, 30], [1, 35], [2, 20], [3, 10], [8, 5]],
  Persian:    [[0, 20], [1, 30], [2, 20], [3, 15], [4, 5], [8, 10]],
  Omani:      [[0, 35], [1, 40], [2, 15], [8, 10]],
  Mughal:     [[0, 40], [1, 35], [2, 15], [8, 10]],
  Gujarati:   [[0, 45], [1, 35], [2, 15], [8, 5]],
  Swahili:    [[0, 60], [1, 30], [2, 10]],
  Malay:      [[0, 50], [1, 35], [2, 15]],
  Acehnese:   [[0, 50], [1, 35], [2, 15]],
  Javanese:   [[0, 55], [1, 30], [2, 15]],
  Moluccan:   [[0, 55], [1, 30], [2, 15]],
  Siamese:    [[0, 50], [1, 35], [2, 15]],
  Chinese:    [[0, 55], [1, 30], [2, 15]],
  Japanese:   [[0, 55], [1, 30], [2, 15]],
};

// ── Hair colors ──────────────────────────────────────────

export const HAIR_COLORS = [
  '#1a1a1a',  // 0 - black
  '#2a1a0e',  // 1 - very dark brown
  '#4a2a14',  // 2 - dark brown
  '#6a3a1a',  // 3 - medium brown
  '#8a5a28',  // 4 - light brown / chestnut
  '#aa7030',  // 5 - auburn
  '#c47020',  // 6 - ginger/red
  '#d4a860',  // 7 - dark blond
  '#e0c880',  // 8 - blond
  '#888888',  // 9 - gray
  '#b0b0b0',  // 10 - white/silver
];

const HAIR_DISTRIBUTION: Record<Nationality, [number, number][]> = {
  English:    [[1, 10], [2, 20], [3, 25], [4, 20], [5, 5], [6, 5], [7, 10], [8, 5]],
  Dutch:      [[2, 10], [3, 15], [4, 20], [7, 25], [8, 25], [6, 5]],
  Danish:     [[3, 10], [4, 15], [7, 25], [8, 35], [6, 10], [5, 5]],
  French:     [[1, 15], [2, 25], [3, 25], [4, 20], [7, 10], [5, 5]],
  Spanish:    [[0, 30], [1, 35], [2, 25], [3, 10]],
  Portuguese: [[0, 25], [1, 35], [2, 30], [3, 10]],
  Ottoman:    [[0, 50], [1, 35], [2, 15]],
  Persian:    [[0, 45], [1, 35], [2, 15], [3, 5]],
  Omani:      [[0, 55], [1, 35], [2, 10]],
  Mughal:     [[0, 55], [1, 35], [2, 10]],
  Gujarati:   [[0, 60], [1, 30], [2, 10]],
  Swahili:    [[0, 80], [1, 15], [2, 5]],
  Malay:      [[0, 70], [1, 25], [2, 5]],
  Acehnese:   [[0, 70], [1, 25], [2, 5]],
  Javanese:   [[0, 70], [1, 25], [2, 5]],
  Moluccan:   [[0, 70], [1, 25], [2, 5]],
  Siamese:    [[0, 75], [1, 20], [2, 5]],
  Chinese:    [[0, 80], [1, 15], [2, 5]],
  Japanese:   [[0, 80], [1, 15], [2, 5]],
};

// ── Portrait config type ─────────────────────────────────

export type Personality = 'Friendly' | 'Stern' | 'Curious' | 'Smug' | 'Melancholy' | 'Neutral' | 'Weathered' | 'Fierce';
export type AgeRange = '20s' | '30s' | '40s' | '50s' | '60s';
export type Gender = 'Male' | 'Female';
export type SocialClass = 'Working' | 'Merchant' | 'Noble';

// Cultural clothing/headwear group — more granular than just nationality
export type CulturalGroup =
  | 'NorthEuropean'    // English, Dutch, Danish
  | 'SouthEuropean'    // Portuguese, Spanish, French
  | 'ArabPersian'      // Ottoman, Persian, Omani
  | 'Indian'           // Mughal, Gujarati
  | 'Swahili'          // East African coast
  | 'SoutheastAsian'   // Malay, Acehnese, Javanese, Moluccan, Siamese
  | 'EastAsian';       // Chinese, Japanese

export interface PortraitConfig {
  seed: number;
  nationality: Nationality;
  culturalGroup: CulturalGroup;
  gender: Gender;
  age: AgeRange;
  personality: Personality;
  socialClass: SocialClass;
  skinIndex: number;
  eyeColorIndex: number;
  hairColorIndex: number;
  role: CrewRole;
  quality: CrewQuality;
  isScarred: boolean;        // gunners, old sailors
  hasEarring: boolean;       // common among sailors
  isSailor: boolean;
  // ── Distinguishing features ──
  hasPipe: boolean;           // clay pipe, common among European/sailor types
  hasEyePatch: boolean;       // battle injury
  hasGoldTooth: boolean;      // visible when smiling
  hasFacialMark: boolean;     // mole, birthmark, or cultural marking
  facialMarkSide: number;     // -1 left, 1 right
  facialMarkY: number;        // 0-1 from eye to chin
  hasNeckJewelry: boolean;    // cross, beads, coin string
  neckJewelryType: 'cross' | 'beads' | 'coins' | 'pendant';
  hasBrokenNose: boolean;     // crooked/flattened nose bridge
  hasFreckles: boolean;       // sun damage, mostly fair-skinned
  hasNeckKerchief: boolean;   // bandana around neck
  kerchiefColor: string;
  hasTattoo: boolean;         // cultural markings
  tattooType: 'forehead' | 'cheek' | 'chin' | 'arm';
}

// ── Distribution picker ──────────────────────────────────

function pickFromDistribution(rng: () => number, dist: [number, number][]): number {
  const total = dist.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [idx, w] of dist) {
    r -= w;
    if (r <= 0) return idx;
  }
  return dist[0][0];
}

// ── Map nationality to cultural group ────────────────────

const CULTURAL_GROUP_MAP: Record<Nationality, CulturalGroup> = {
  English: 'NorthEuropean',
  Dutch: 'NorthEuropean',
  Danish: 'NorthEuropean',
  French: 'SouthEuropean',
  Spanish: 'SouthEuropean',
  Portuguese: 'SouthEuropean',
  Ottoman: 'ArabPersian',
  Persian: 'ArabPersian',
  Omani: 'ArabPersian',
  Mughal: 'Indian',
  Gujarati: 'Indian',
  Swahili: 'Swahili',
  Malay: 'SoutheastAsian',
  Acehnese: 'SoutheastAsian',
  Javanese: 'SoutheastAsian',
  Moluccan: 'SoutheastAsian',
  Siamese: 'SoutheastAsian',
  Chinese: 'EastAsian',
  Japanese: 'EastAsian',
};

// ── Map role/stats to personality ────────────────────────

function derivePersonality(rng: () => number, role: CrewRole, quality: CrewQuality, stats: { charisma: number; strength: number; perception: number; luck: number }): Personality {
  // Quality-driven tendencies
  if (quality === 'legendary') {
    const opts: Personality[] = ['Stern', 'Curious', 'Fierce'];
    return opts[Math.floor(rng() * opts.length)];
  }
  if (quality === 'dud') {
    const opts: Personality[] = ['Melancholy', 'Neutral', 'Weathered'];
    return opts[Math.floor(rng() * opts.length)];
  }

  // Stat-driven
  const highest = Math.max(stats.charisma, stats.strength, stats.perception, stats.luck);
  if (stats.charisma === highest && rng() > 0.4) return rng() > 0.5 ? 'Friendly' : 'Smug';
  if (stats.strength === highest && rng() > 0.4) return rng() > 0.5 ? 'Stern' : 'Fierce';
  if (stats.perception === highest && rng() > 0.4) return 'Curious';

  // Role defaults
  switch (role) {
    case 'Captain': return rng() > 0.5 ? 'Stern' : 'Curious';
    case 'Gunner': return rng() > 0.5 ? 'Fierce' : 'Stern';
    case 'Navigator': return 'Curious';
    case 'Factor': return rng() > 0.5 ? 'Friendly' : 'Smug';
    case 'Surgeon': return rng() > 0.5 ? 'Melancholy' : 'Curious';
    default: return 'Neutral';
  }
}

// ── Age range from numeric age ───────────────────────────

function ageToRange(age: number): AgeRange {
  if (age < 30) return '20s';
  if (age < 40) return '30s';
  if (age < 50) return '40s';
  if (age < 60) return '50s';
  return '60s';
}

// ── Social class from role/quality ───────────────────────

function deriveSocialClass(role: CrewRole, quality: CrewQuality): SocialClass {
  if (role === 'Captain') return quality === 'legendary' ? 'Noble' : 'Merchant';
  if (role === 'Factor') return quality === 'rare' || quality === 'legendary' ? 'Noble' : 'Merchant';
  if (role === 'Navigator' || role === 'Surgeon') return 'Merchant';
  if (role === 'Gunner') return 'Working';
  return 'Working'; // Sailor
}

// ── Public API ───────────────────────────────────────────

/**
 * Convert a CrewMember into a deterministic PortraitConfig.
 * The same crew member always produces the same portrait.
 */
export function crewToPortraitConfig(member: CrewMember): PortraitConfig {
  const seed = hashString(member.id + member.name);
  const rng = mulberry32(seed);

  // Consume a few RNG values for consistent ordering
  const skinIndex = pickFromDistribution(rng, SKIN_DISTRIBUTION[member.nationality]);
  const eyeColorIndex = pickFromDistribution(rng, EYE_DISTRIBUTION[member.nationality]);
  const hairColorIndex = pickFromDistribution(rng, HAIR_DISTRIBUTION[member.nationality]);

  const personality = derivePersonality(rng, member.role, member.quality, member.stats);
  const age = ageToRange(member.age);
  const socialClass = deriveSocialClass(member.role, member.quality);
  const culturalGroup = CULTURAL_GROUP_MAP[member.nationality];

  // Gender: ~90% male for historical accuracy (women did serve on some vessels but rarely)
  const gender: Gender = rng() > 0.92 ? 'Female' : 'Male';

  // Scars for combat veterans and old salts
  const isScarred = (member.role === 'Gunner' && rng() > 0.4) ||
                    (member.role === 'Sailor' && member.age > 40 && rng() > 0.5) ||
                    (member.role === 'Captain' && rng() > 0.7);

  const hasEarring = (member.role === 'Sailor' && rng() > 0.5) ||
                     (member.role === 'Gunner' && rng() > 0.6) ||
                     rng() > 0.85;

  const isSailor = member.role === 'Sailor' || member.role === 'Gunner';

  // ── Distinguishing features (each rolled independently) ──

  // Clay pipe — sailors and older crew, especially European
  const hasPipe = isSailor && gender === 'Male' &&
    (culturalGroup === 'NorthEuropean' || culturalGroup === 'SouthEuropean' || rng() > 0.7) &&
    rng() > 0.65;

  // Eye patch — rare, more common for gunners/captains with scars
  const hasEyePatch = isScarred && rng() > 0.82;

  // Gold tooth — visible in smiles, more common among veterans and merchants
  const hasGoldTooth = (personality === 'Friendly' || personality === 'Smug') &&
    (member.age > 30) && rng() > 0.7;

  // Facial mark (mole, beauty mark, birthmark)
  const hasFacialMark = rng() > 0.72;
  const facialMarkSide = rng() > 0.5 ? 1 : -1;
  const facialMarkY = 0.2 + rng() * 0.6;

  // Neck jewelry
  const jewelryRoll = rng();
  const hasNeckJewelry = (socialClass !== 'Working' && jewelryRoll > 0.6) ||
    (culturalGroup === 'Swahili' && jewelryRoll > 0.4) ||
    (culturalGroup === 'Indian' && jewelryRoll > 0.5) ||
    jewelryRoll > 0.85;
  const neckJewelryType: 'cross' | 'beads' | 'coins' | 'pendant' =
    (culturalGroup === 'NorthEuropean' || culturalGroup === 'SouthEuropean') ? (rng() > 0.3 ? 'cross' : 'pendant') :
    culturalGroup === 'Swahili' ? (rng() > 0.5 ? 'beads' : 'coins') :
    culturalGroup === 'Indian' ? 'beads' :
    culturalGroup === 'ArabPersian' ? (rng() > 0.5 ? 'pendant' : 'coins') :
    rng() > 0.5 ? 'coins' : 'pendant';

  // Broken nose — fighters
  const hasBrokenNose = (member.role === 'Gunner' || member.role === 'Sailor') &&
    member.stats.strength >= 12 && rng() > 0.75;

  // Freckles/sun damage — mostly fair-skinned Europeans
  const hasFreckles = skinIndex <= 2 && rng() > 0.55;

  // Neck kerchief — sailors and working class
  const hasNeckKerchief = isSailor && rng() > 0.55;
  const kerchiefColors = ['#8b2020', '#1a3a5a', '#2a4a2a', '#5a3a1a', '#4a2a4a', '#1a4a4a'];
  const kerchiefColor = kerchiefColors[Math.floor(rng() * kerchiefColors.length)];

  // Tattoo — cultural markings (Swahili scarification, Japanese irezumi, Malay/Polynesian)
  const tattooRoll = rng();
  const hasTattoo = (culturalGroup === 'SoutheastAsian' && tattooRoll > 0.6) ||
    (culturalGroup === 'Swahili' && tattooRoll > 0.55) ||
    (member.nationality === 'Japanese' && tattooRoll > 0.5) ||
    (isSailor && tattooRoll > 0.85);
  const tattooTypes: Array<'forehead' | 'cheek' | 'chin' | 'arm'> = ['forehead', 'cheek', 'chin', 'arm'];
  const tattooType = culturalGroup === 'Swahili' ? (rng() > 0.5 ? 'cheek' : 'forehead') :
    culturalGroup === 'SoutheastAsian' ? (rng() > 0.5 ? 'arm' : 'chin') :
    tattooTypes[Math.floor(rng() * tattooTypes.length)];

  return {
    seed,
    nationality: member.nationality,
    culturalGroup,
    gender,
    age,
    personality,
    socialClass,
    skinIndex,
    eyeColorIndex,
    hairColorIndex,
    role: member.role,
    quality: member.quality,
    isScarred,
    hasEarring,
    isSailor,
    hasPipe,
    hasEyePatch,
    hasGoldTooth,
    hasFacialMark,
    facialMarkSide,
    facialMarkY,
    hasNeckJewelry,
    neckJewelryType,
    hasBrokenNose,
    hasFreckles,
    hasNeckKerchief,
    kerchiefColor,
    hasTattoo,
    tattooType,
  };
}

/** Get the resolved skin palette for a config */
export function getSkin(config: PortraitConfig): SkinPalette {
  return SKIN_PALETTES[config.skinIndex] ?? SKIN_PALETTES[4];
}

/** Get the resolved eye color hex for a config */
export function getEyeColor(config: PortraitConfig): string {
  return EYE_COLORS[config.eyeColorIndex] ?? EYE_COLORS[0];
}

/** Get the resolved hair color hex for a config, with age-based graying */
export function getHairColor(config: PortraitConfig): string {
  const base = HAIR_COLORS[config.hairColorIndex] ?? HAIR_COLORS[0];
  const rng = mulberry32(config.seed + 999);
  if (config.age === '60s') return rng() > 0.3 ? HAIR_COLORS[10] : HAIR_COLORS[9];
  if (config.age === '50s') return rng() > 0.5 ? HAIR_COLORS[9] : base;
  return base;
}
