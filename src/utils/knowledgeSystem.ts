// ── Knowledge & Information Asymmetry System ──
//
// The player doesn't automatically know what trade goods are. Knowledge is
// acquired through tavern gossip, POI visits, and knowledgeable crew hires.
// This mirrors the real historical experience of European merchants in the
// Indian Ocean c. 1600–1650.
//
// Knowledge levels:
//   0 — Unknown: physical description only, price hidden, 20-40% discount (seller exploits ignorance)
//   1 — Identified: real name shown, price visible, fraud risk halved
//   2 — Mastered: sells for 15-20% more, fraud immune, expert info in journal

import type { Commodity } from './commodities';
import { COMMODITY_DEFS } from './commodities';
import type { Nationality, CrewMember } from '../store/gameStore';

export type KnowledgeLevel = 0 | 1 | 2;

// ── Starting knowledge by player nationality ──
// What an English, Portuguese, etc. captain would plausibly recognize at the start.
// Tier 1 bulk goods (rice, timber, iron) are universally known — you don't need
// expertise to identify a sack of grain.

const UNIVERSALLY_KNOWN: Commodity[] = [
  'Rice', 'Timber', 'Iron', 'Munitions',
];

const STARTING_KNOWLEDGE: Partial<Record<Nationality, Commodity[]>> = {
  English: [
    'Cotton Textiles', 'Black Pepper', 'Cinnamon', 'Ginger', 'Sugar',
    'Indigo', 'Ivory', 'Tobacco',
  ],
  Portuguese: [
    'Cotton Textiles', 'Black Pepper', 'Cinnamon', 'Ginger', 'Sugar',
    'Cloves', 'Nutmeg', 'Opium', 'Red Coral', 'Quicksilver',
    'Tobacco', 'Cassia Fistula', 'Lapis de Goa',
  ],
  Dutch: [
    'Cotton Textiles', 'Black Pepper', 'Cinnamon', 'Cloves', 'Nutmeg',
    'Sugar', 'Indigo', 'Camphor',
  ],
  Spanish: [
    'Cotton Textiles', 'Sugar', 'Tobacco', 'Red Coral', 'Quicksilver',
    'Cinnamon',
  ],
  French: [
    'Cotton Textiles', 'Black Pepper', 'Cinnamon', 'Coffee', 'Sugar',
    'Indigo',
  ],
  Danish: [
    'Cotton Textiles', 'Black Pepper', 'Tea', 'Sugar',
  ],
  Gujarati: [
    'Cotton Textiles', 'Black Pepper', 'Cardamom', 'Ginger', 'Sugar',
    'Tamarind', 'Cassia Fistula', 'Indigo', 'Opium', 'Bezoar Stones',
    'Rose Water', 'Saffron', 'Coffee',
  ],
  Mughal: [
    'Cotton Textiles', 'Black Pepper', 'Cardamom', 'Indigo', 'Opium',
    'Saffron', 'Rose Water', 'Bezoar Stones', 'Sugar',
  ],
  Ottoman: [
    'Coffee', 'Frankincense', 'Myrrh', 'Rose Water', 'Saffron',
    'Cotton Textiles', 'Red Coral', 'Sugar',
  ],
  Persian: [
    'Rose Water', 'Saffron', 'Pearls', 'Coffee', 'Frankincense',
    'Myrrh', 'Bezoar Stones', 'Cotton Textiles', 'Rhubarb',
  ],
  Omani: [
    'Frankincense', 'Myrrh', 'Pearls', 'Coffee', 'Ambergris',
    'Cotton Textiles',
  ],
  Swahili: [
    'Ivory', 'Ambergris', 'Aloes', 'Frankincense', 'Cotton Textiles',
    'Tamarind',
  ],
  Malay: [
    'Cloves', 'Nutmeg', 'Camphor', 'Benzoin', 'Black Pepper', 'Sugar',
    'Aloes', 'Ginger',
  ],
  Acehnese: [
    'Black Pepper', 'Camphor', 'Benzoin', 'Sugar', 'Ginger', 'Aloes',
  ],
  Javanese: [
    'Cloves', 'Nutmeg', 'Black Pepper', 'Sugar', 'Benzoin',
    'Camphor', 'Ginger',
  ],
  Chinese: [
    'Chinese Porcelain', 'Tea', 'Musk', 'Rhubarb', 'China Root',
    'Sugar', 'Camphor',
  ],
  Japanese: [
    'Tea', 'Camphor', 'Chinese Porcelain',
  ],
  Siamese: [
    'Benzoin', 'Camphor', 'Aloes', 'Black Pepper', 'Sugar',
  ],
  Moluccan: [
    'Cloves', 'Nutmeg', 'Camphor', 'Benzoin', 'Aloes',
  ],
};

// ── Crew knowledge domains ──
// Maps crew nationality to the commodities they can identify (Level 1)
// and their mastery specialty (Level 2).

export interface CrewKnowledgeProfile {
  identifies: Commodity[];  // goods this background grants Level 1 on
  masters: Commodity[];     // goods this background grants Level 2 on
}

export const CREW_KNOWLEDGE_DOMAINS: Partial<Record<Nationality, CrewKnowledgeProfile>> = {
  Gujarati: {
    identifies: ['Black Pepper', 'Cotton Textiles', 'Indigo', 'Opium',
                 'Cassia Fistula', 'Tamarind', 'Sugar', 'Ginger',
                 'Saffron', 'Rose Water', 'Bezoar Stones'],
    masters: ['Cotton Textiles', 'Indigo'],
  },
  Malay: {
    identifies: ['Cloves', 'Nutmeg', 'Camphor', 'Benzoin',
                 'Aloes', 'Black Pepper', 'Ginger'],
    masters: ['Cloves', 'Nutmeg'],
  },
  Omani: {
    identifies: ['Frankincense', 'Myrrh', 'Coffee', 'Ambergris',
                 'Pearls'],
    masters: ['Frankincense', 'Myrrh'],
  },
  Persian: {
    identifies: ['Rose Water', 'Saffron', 'Pearls', 'Rhubarb',
                 'Coffee', 'Frankincense', 'Bezoar Stones'],
    masters: ['Saffron', 'Rose Water'],
  },
  Chinese: {
    identifies: ['Chinese Porcelain', 'Tea', 'Rhubarb', 'China Root',
                 'Musk', 'Camphor'],
    masters: ['Chinese Porcelain', 'Tea'],
  },
  Swahili: {
    identifies: ['Ivory', 'Ambergris', 'Aloes', 'Frankincense',
                 'Tamarind'],
    masters: ['Ivory'],
  },
  Portuguese: {
    identifies: ['Black Pepper', 'Cinnamon', 'Cloves', 'Nutmeg',
                 'Opium', 'Red Coral', 'Quicksilver', 'Lapis de Goa',
                 'Cassia Fistula', 'Tobacco'],
    masters: ['Lapis de Goa'],
  },
  Ottoman: {
    identifies: ['Coffee', 'Frankincense', 'Myrrh', 'Rose Water',
                 'Saffron', 'Red Coral', 'Mumia'],
    masters: ['Coffee'],
  },
  Javanese: {
    identifies: ['Cloves', 'Nutmeg', 'Black Pepper', 'Benzoin',
                 'Camphor'],
    masters: ['Cloves', 'Nutmeg'],
  },
  Moluccan: {
    identifies: ['Cloves', 'Nutmeg', 'Camphor', 'Benzoin', 'Aloes'],
    masters: ['Cloves', 'Nutmeg'],
  },
  Mughal: {
    identifies: ['Cotton Textiles', 'Indigo', 'Opium', 'Saffron',
                 'Rose Water', 'Bezoar Stones', 'Bhang'],
    masters: ['Opium', 'Indigo'],
  },
  Acehnese: {
    identifies: ['Black Pepper', 'Camphor', 'Benzoin', 'Ginger',
                 'Aloes'],
    masters: ['Camphor', 'Benzoin'],
  },
  English: {
    identifies: ['Black Pepper', 'Cinnamon', 'Ginger', 'Indigo',
                 'Cotton Textiles', 'Tobacco', 'Sugar'],
    masters: [],
  },
  Dutch: {
    identifies: ['Black Pepper', 'Cinnamon', 'Cloves', 'Nutmeg',
                 'Indigo', 'Sugar', 'Camphor'],
    masters: ['Cloves', 'Nutmeg'],
  },
};

// ── Core knowledge functions ──

/** Generate starting knowledge state for a new game */
export function generateStartingKnowledge(
  nationality: Nationality,
  crew: CrewMember[],
): Record<string, KnowledgeLevel> {
  const state: Record<string, KnowledgeLevel> = {};

  // Universally known goods
  for (const c of UNIVERSALLY_KNOWN) {
    state[c] = 1;
  }

  // Nationality-based knowledge
  const natKnowledge = STARTING_KNOWLEDGE[nationality];
  if (natKnowledge) {
    for (const c of natKnowledge) {
      state[c] = Math.max(state[c] ?? 0, 1) as KnowledgeLevel;
    }
  }

  // Crew contributions
  for (const member of crew) {
    const profile = CREW_KNOWLEDGE_DOMAINS[member.nationality];
    if (!profile) continue;
    for (const c of profile.identifies) {
      state[c] = Math.max(state[c] ?? 0, 1) as KnowledgeLevel;
    }
    for (const c of profile.masters) {
      state[c] = Math.max(state[c] ?? 0, 2) as KnowledgeLevel;
    }
  }

  return state;
}

/** Get the effective knowledge level for a commodity, considering crew contributions */
export function getEffectiveKnowledge(
  commodityId: string,
  playerKnowledge: Record<string, KnowledgeLevel>,
  crew: CrewMember[],
): KnowledgeLevel {
  let level = playerKnowledge[commodityId] ?? 0;

  // Check crew contributions
  for (const member of crew) {
    const profile = CREW_KNOWLEDGE_DOMAINS[member.nationality];
    if (!profile) continue;
    if (profile.masters.includes(commodityId as Commodity)) {
      level = Math.max(level, 2) as KnowledgeLevel;
    } else if (profile.identifies.includes(commodityId as Commodity)) {
      level = Math.max(level, 1) as KnowledgeLevel;
    }
  }

  return level as KnowledgeLevel;
}

/** Get display name for a commodity based on knowledge level */
export function getDisplayName(commodityId: Commodity, level: KnowledgeLevel): string {
  if (level >= 1) return commodityId;
  const def = COMMODITY_DEFS[commodityId];
  return def?.physicalDescription ?? commodityId;
}

/**
 * Price modifier when buying unknown goods.
 * Sellers exploit the buyer's ignorance — unknown goods cost 20-40% of true value
 * because the seller knows you don't know what you're buying.
 * This means the player gets a DISCOUNT (the goods are cheap because the seller
 * assumes you'll overpay elsewhere or that you might not know the value).
 */
export function getUnknownBuyDiscount(): number {
  return 0.2 + Math.random() * 0.2; // 20-40% of true price
}

/**
 * Mastery sell bonus — a mastered trader knows the best buyers.
 * Level 2 goods sell for 15-20% more.
 */
export function getMasterySellBonus(): number {
  return 1.15 + Math.random() * 0.05; // 1.15-1.20x
}
