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
  // 11 - Ruddy/pinkish fair (sunburned redhead, flushed Northern European)
  { light: '#f5d4c0', mid: '#e8bca0', dark: '#cc967a', blush: '#d88070' },
  // 12 - Golden olive (lighter South Indian, Sri Lankan, coastal Arab)
  { light: '#d4a870', mid: '#c09058', dark: '#987040', blush: '#a06848' },
  // 13 - Warm reddish-brown (East African, some Malay)
  { light: '#a06838', mid: '#8c5830', dark: '#6c4020', blush: '#884428' },
  // 14 - Tanned/weathered fair (deeply sun-darkened European sailor)
  { light: '#e0c09a', mid: '#cca878', dark: '#a88058', blush: '#b87860' },
];

// Nationality → weighted skin tone distribution
// Each entry: [paletteIndex, weight]. Higher weight = more common for that nationality.
const SKIN_DISTRIBUTION: Record<Nationality, [number, number][]> = {
  // Northern Europeans: mostly fair, but sailors tan deeply; rare olive ("Black Irish")
  English:    [[0, 40], [1, 25], [11, 12], [14, 15], [2, 5], [3, 3]],
  Dutch:      [[0, 45], [1, 25], [11, 10], [14, 12], [2, 5], [3, 3]],
  Danish:     [[0, 50], [1, 22], [11, 12], [14, 10], [2, 4], [3, 2]],
  // Southern Europeans: wider range, Mediterranean olive common
  French:     [[0, 20], [1, 35], [2, 25], [14, 10], [3, 7], [11, 3]],
  Spanish:    [[1, 25], [2, 35], [3, 20], [14, 8], [4, 7], [0, 5]],
  Portuguese: [[1, 22], [2, 32], [3, 22], [14, 10], [4, 8], [0, 6]],
  // Middle Eastern: wide range from fair-skinned urbanites to dark-skinned traders
  Ottoman:    [[1, 8], [2, 30], [3, 35], [4, 15], [12, 8], [5, 4]],
  Persian:    [[1, 12], [2, 30], [3, 30], [4, 15], [12, 8], [5, 5]],
  Omani:      [[3, 25], [4, 30], [12, 15], [5, 15], [2, 8], [6, 7]],
  // South Asian: broad range reflecting enormous internal diversity
  Mughal:     [[2, 8], [3, 22], [4, 30], [12, 15], [5, 18], [6, 7]],
  Gujarati:   [[3, 15], [4, 28], [12, 15], [5, 22], [6, 12], [2, 5], [7, 3]],
  // East African: wide range — coastal Swahili had Arab/Persian admixture
  Swahili:    [[4, 5], [5, 12], [13, 15], [6, 25], [7, 28], [8, 15]],
  // Southeast Asian: warm tones with more range
  Malay:      [[10, 30], [4, 25], [5, 25], [12, 10], [6, 7], [3, 3]],
  Acehnese:   [[10, 28], [4, 25], [5, 25], [12, 12], [3, 5], [6, 5]],
  Javanese:   [[10, 25], [4, 18], [5, 30], [12, 10], [6, 12], [3, 5]],
  Moluccan:   [[10, 22], [4, 20], [5, 28], [13, 10], [6, 14], [3, 6]],
  // East/mainland SE Asian
  Siamese:    [[9, 15], [10, 32], [4, 25], [12, 12], [5, 10], [3, 6]],
  Chinese:    [[9, 42], [10, 28], [4, 15], [0, 5], [12, 5], [5, 5]],
  Japanese:   [[0, 10], [9, 42], [10, 22], [4, 8], [1, 10], [12, 5], [5, 3]],
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
  English:    [[1, 12], [2, 18], [3, 12], [4, 5], [5, 22], [6, 18], [7, 8], [8, 5]],
  Dutch:      [[1, 8], [2, 12], [3, 5], [5, 25], [6, 28], [7, 18], [8, 4]],
  Danish:     [[2, 8], [3, 5], [5, 18], [6, 32], [7, 30], [4, 4], [8, 3]],
  French:     [[1, 15], [2, 22], [3, 15], [4, 8], [5, 18], [6, 12], [8, 5], [7, 5]],
  Spanish:    [[0, 18], [1, 30], [2, 22], [3, 12], [8, 10], [4, 5], [5, 3]],
  Portuguese: [[0, 18], [1, 28], [2, 22], [3, 14], [8, 10], [4, 5], [5, 3]],
  Ottoman:    [[0, 25], [1, 28], [2, 20], [3, 12], [8, 8], [4, 4], [5, 3]],
  Persian:    [[0, 15], [1, 25], [2, 20], [3, 18], [4, 8], [8, 10], [5, 4]],
  Omani:      [[0, 30], [1, 35], [2, 15], [8, 12], [3, 5], [4, 3]],
  Mughal:     [[0, 35], [1, 30], [2, 15], [8, 12], [3, 5], [4, 3]],
  Gujarati:   [[0, 38], [1, 30], [2, 15], [8, 8], [3, 5], [4, 4]],
  // Swahili: mostly dark, but amber eyes occur in East Africa
  Swahili:    [[0, 48], [1, 25], [2, 10], [8, 12], [3, 5]],
  // SE Asian: dark dominant but amber/warm brown more common than previously modeled
  Malay:      [[0, 40], [1, 30], [2, 15], [8, 10], [3, 5]],
  Acehnese:   [[0, 40], [1, 30], [2, 15], [8, 10], [3, 5]],
  Javanese:   [[0, 42], [1, 28], [2, 15], [8, 10], [3, 5]],
  Moluccan:   [[0, 42], [1, 28], [2, 15], [8, 10], [3, 5]],
  Siamese:    [[0, 40], [1, 30], [2, 15], [8, 10], [3, 5]],
  Chinese:    [[0, 42], [1, 28], [2, 18], [8, 8], [3, 4]],
  Japanese:   [[0, 42], [1, 28], [2, 18], [8, 8], [3, 4]],
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
  // English: full Celtic/Anglo-Saxon range — black "Black Irish" to ginger to blond
  English:    [[0, 5], [1, 10], [2, 18], [3, 22], [4, 18], [5, 8], [6, 8], [7, 7], [8, 4]],
  // Dutch: famously blond, but brown is common too
  Dutch:      [[1, 5], [2, 10], [3, 14], [4, 18], [6, 5], [7, 22], [8, 22], [5, 4]],
  // Danish/Scandinavian: lightest range, but dark hair exists (Sami influence)
  Danish:     [[1, 3], [2, 5], [3, 10], [4, 12], [5, 5], [6, 12], [7, 22], [8, 28], [0, 3]],
  // French: brown-dominated but full range
  French:     [[0, 5], [1, 12], [2, 22], [3, 22], [4, 18], [5, 8], [6, 3], [7, 7], [8, 3]],
  // Spanish: dark-dominated, but lighter browns and rare auburn (Visigothic heritage)
  Spanish:    [[0, 25], [1, 30], [2, 22], [3, 12], [5, 5], [4, 4], [7, 2]],
  // Portuguese: similar to Spanish
  Portuguese: [[0, 22], [1, 30], [2, 25], [3, 12], [5, 5], [4, 4], [7, 2]],
  // Ottoman: mostly dark, but auburn/brown exists in Anatolia
  Ottoman:    [[0, 40], [1, 30], [2, 15], [3, 8], [5, 4], [6, 3]],
  // Persian: dark with occasional lighter brown, rare auburn
  Persian:    [[0, 35], [1, 30], [2, 18], [3, 8], [5, 5], [6, 4]],
  Omani:      [[0, 48], [1, 30], [2, 12], [3, 5], [5, 5]],
  Mughal:     [[0, 48], [1, 30], [2, 12], [3, 5], [5, 5]],
  Gujarati:   [[0, 52], [1, 28], [2, 12], [3, 5], [5, 3]],
  // Swahili: mostly black, but dark reddish-brown exists
  Swahili:    [[0, 65], [1, 20], [2, 8], [5, 4], [3, 3]],
  // SE Asian: black-dominant with dark brown
  Malay:      [[0, 60], [1, 25], [2, 10], [3, 5]],
  Acehnese:   [[0, 60], [1, 25], [2, 10], [3, 5]],
  Javanese:   [[0, 62], [1, 23], [2, 10], [3, 5]],
  Moluccan:   [[0, 62], [1, 23], [2, 10], [3, 5]],
  Siamese:    [[0, 65], [1, 22], [2, 8], [3, 5]],
  // East Asian: overwhelmingly dark, but dark brown is real
  Chinese:    [[0, 70], [1, 18], [2, 8], [3, 4]],
  Japanese:   [[0, 68], [1, 18], [2, 8], [3, 4], [5, 2]],
};

// ── Portrait config type ─────────────────────────────────

export type Personality = 'Friendly' | 'Stern' | 'Curious' | 'Smug' | 'Melancholy' | 'Neutral' | 'Weathered' | 'Fierce';
export type AgeRange = '20s' | '30s' | '40s' | '50s' | '60s';
export type Gender = 'Male' | 'Female';
export type SocialClass = 'Working' | 'Merchant' | 'Noble';
export type FaceShape = 'round' | 'oval' | 'long' | 'square' | 'heart' | 'diamond';

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
  faceShape: FaceShape;       // overall face archetype
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
  let skinIndex = pickFromDistribution(rng, SKIN_DISTRIBUTION[member.nationality]);
  let eyeColorIndex = pickFromDistribution(rng, EYE_DISTRIBUTION[member.nationality]);
  let hairColorIndex = pickFromDistribution(rng, HAIR_DISTRIBUTION[member.nationality]);

  // ── Phenotype correlation — nudge unlikely combinations toward realism ──
  const corrRng = rng(); // single roll for all corrections to keep determinism clean
  const isEuropean = ['English', 'Dutch', 'Danish', 'French', 'Spanish', 'Portuguese'].includes(member.nationality);
  const isNorthEuropean = ['English', 'Dutch', 'Danish'].includes(member.nationality);

  // Ginger/red hair (6) + dark skin is very rare — nudge skin fairer
  if (hairColorIndex === 6 && skinIndex > 2) {
    skinIndex = corrRng > 0.5 ? 0 : 11; // very fair or ruddy
  }
  // Blond hair (7,8) + dark skin — nudge fairer
  if ((hairColorIndex === 7 || hairColorIndex === 8) && skinIndex > 2) {
    skinIndex = corrRng > 0.6 ? 0 : 1;
  }
  // Very fair skin (0,11) on European + dark hair (0,1) = "Black Irish" type — boost green/hazel eyes
  if (isEuropean && skinIndex <= 1 && hairColorIndex <= 1 && corrRng > 0.5) {
    eyeColorIndex = corrRng > 0.75 ? 4 : 3; // green or hazel
  }
  // Ruddy skin (11) correlates with ginger/auburn hair in N. Europe
  if (isNorthEuropean && skinIndex === 11 && corrRng > 0.4) {
    hairColorIndex = corrRng > 0.7 ? 6 : 5; // ginger or auburn
  }
  // Weathered/tanned skin (14) on Europeans — they're outdoor sailors, boost older hair fading
  if (isEuropean && skinIndex === 14 && member.age > 40 && corrRng > 0.5) {
    // Sun-bleached streaking effect — shift hair one step lighter
    hairColorIndex = Math.min(hairColorIndex + 1, 8);
  }
  // Very fair Europeans occasionally get light eyes even if not initially rolled
  if (isNorthEuropean && skinIndex === 0 && eyeColorIndex <= 2 && corrRng > 0.7) {
    eyeColorIndex = corrRng > 0.85 ? 7 : 5; // deep blue or gray-blue
  }
  // Age → gray/white hair override for older crew
  if (member.age >= 55 && corrRng > 0.4) {
    hairColorIndex = corrRng > 0.7 ? 10 : 9; // white or gray
  } else if (member.age >= 45 && corrRng > 0.7) {
    hairColorIndex = 9; // gray
  }

  const personality = derivePersonality(rng, member.role, member.quality, member.stats);
  const age = ageToRange(member.age);
  const socialClass = deriveSocialClass(member.role, member.quality);
  const faceShapes: FaceShape[] = ['round', 'oval', 'long', 'square', 'heart', 'diamond'];
  const faceShape = faceShapes[Math.floor(rng() * faceShapes.length)];
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
    faceShape,
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
