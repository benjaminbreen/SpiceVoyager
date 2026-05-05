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
  'Rice', 'Timber', 'Iron', 'Small Shot', 'Cannon Shot',
];

const STARTING_KNOWLEDGE: Partial<Record<Nationality, Commodity[]>> = {
  English: [
    'Black Pepper', 'Cinnamon', 'Ginger', 'Sugar',
    'Indigo', 'Ivory', 'Tobacco',
  ],
  Portuguese: [
    'Black Pepper', 'Cinnamon', 'Ginger', 'Sugar',
    'Cloves', 'Nutmeg', 'Opium', 'Red Coral', 'Quicksilver',
    'Tobacco', 'Cassia Fistula', 'Lapis de Goa', 'Japanese Silver',
  ],
  Dutch: [
    'Black Pepper', 'Cinnamon', 'Cloves', 'Nutmeg',
    'Sugar', 'Indigo', 'Camphor',
  ],
  Spanish: [
    'Sugar', 'Tobacco', 'Red Coral', 'Quicksilver',
    'Cinnamon',
  ],
  French: [
    'Black Pepper', 'Cinnamon', 'Coffee', 'Sugar',
    'Indigo',
  ],
  Danish: [
    'Black Pepper', 'Tea', 'Sugar',
  ],
  Gujarati: [
    'Black Pepper', 'Cardamom', 'Ginger', 'Sugar',
    'Tamarind', 'Cassia Fistula', 'Indigo', 'Opium', 'Bezoar Stones',
    'Rose Water', 'Saffron', 'Coffee',
  ],
  Mughal: [
    'Black Pepper', 'Cardamom', 'Indigo', 'Opium',
    'Saffron', 'Rose Water', 'Bezoar Stones', 'Sugar',
  ],
  Ottoman: [
    'Coffee', 'Frankincense', 'Myrrh', 'Rose Water', 'Saffron',
    'Red Coral', 'Sugar',
  ],
  Persian: [
    'Rose Water', 'Saffron', 'Pearls', 'Coffee', 'Frankincense',
    'Myrrh', 'Bezoar Stones', 'Rhubarb',
  ],
  Omani: [
    'Frankincense', 'Myrrh', 'Pearls', 'Coffee', 'Ambergris',
  ],
  Swahili: [
    'Ivory', 'Ambergris', 'Aloes', 'Frankincense',
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
    'Sugar', 'Camphor', 'Japanese Silver', 'War Rockets',
  ],
  Japanese: [
    'Tea', 'Camphor', 'Chinese Porcelain', 'Japanese Silver',
  ],
  Siamese: [
    'Benzoin', 'Camphor', 'Aloes', 'Black Pepper', 'Sugar',
  ],
  Moluccan: [
    'Cloves', 'Nutmeg', 'Camphor', 'Benzoin', 'Aloes',
  ],
  Venetian: [
    'Black Pepper', 'Cinnamon', 'Ginger', 'Sugar',
    'Indigo', 'Red Coral', 'Theriac', 'Venetian Soap',
    'Murano Glass', 'Frankincense', 'Mumia',
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
    identifies: ['Black Pepper', 'Indigo', 'Opium',
                 'Cassia Fistula', 'Tamarind', 'Sugar', 'Ginger',
                 'Saffron', 'Rose Water', 'Bezoar Stones'],
    masters: ['Indigo'],
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
                 'Cassia Fistula', 'Tobacco', 'Japanese Silver'],
    masters: ['Lapis de Goa', 'Japanese Silver'],
  },
  Japanese: {
    identifies: ['Japanese Silver', 'Tea', 'Camphor', 'Chinese Porcelain',
                 'Musk', 'Rhubarb'],
    masters: ['Japanese Silver'],
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
    identifies: ['Indigo', 'Opium', 'Saffron',
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
                 'Tobacco', 'Sugar'],
    masters: [],
  },
  Dutch: {
    identifies: ['Black Pepper', 'Cinnamon', 'Cloves', 'Nutmeg',
                 'Indigo', 'Sugar', 'Camphor'],
    masters: ['Cloves', 'Nutmeg'],
  },
  Venetian: {
    identifies: ['Black Pepper', 'Cinnamon', 'Indigo', 'Red Coral',
                 'Theriac', 'Venetian Soap', 'Murano Glass',
                 'Frankincense', 'Mumia', 'Sugar'],
    masters: ['Theriac', 'Murano Glass'],
  },
};

// ── Core knowledge functions ──

/** Generate starting knowledge state for a new game */
export function generateStartingKnowledge(
  nationality: Nationality,
  crew: CrewMember[],
  armament: string[] = [],
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

  // Armament-based knowledge: if you start with a weapon, you know its trade commodity.
  if (armament.includes('fireRocket')) {
    state['War Rockets'] = Math.max(state['War Rockets'] ?? 0, 1) as KnowledgeLevel;
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

// ── Fraud & serendipity on Unknown (Level 0) purchases ────────────────────
//
// Three outcomes when buying blind:
//   - genuine      — it's what the seller claimed
//   - substituted  — it's the commodity's commonSubstitute (fraud, downside)
//   - windfall     — it's something from the port's regional rarity pool (upside)
//
// Chance scales inversely with port market trust. Major hubs are efficient
// in both directions: low fraud, but also no undervalued finds. Remote ports
// are where both the scams and the serendipitous treasures happen.

export type PurchaseOutcome =
  | { kind: 'genuine' }
  | { kind: 'substituted'; actual: Commodity }
  | { kind: 'windfall'; actual: Commodity };

/**
 * Pools of tier-4/5 rarities that might plausibly surface as windfalls at
 * each region's ports. Keeping these tight and period-specific: the player
 * should feel like the surprise could only have come from *this* coast.
 */
const WINDFALL_POOLS: Record<string, Commodity[]> = {
  // East African / Arabian coast — Socotra is the canonical source
  socotra:   ["Dragon's Blood", 'Ambergris', 'Aloes'],
  aden:      ['Ambergris', 'Mumia'],
  mocha:     ['Ambergris'],
  mogadishu: ['Ambergris', 'Aloes'],
  kilwa:     ['Ambergris', 'Ivory'],
  zanzibar:  ['Ambergris', 'Ivory'],
  mombasa:   ['Ambergris', 'Ivory'],
  // Arabian Peninsula
  muscat:    ['Ambergris', 'Pearls'],
  // Spice islands / East Indies — Banda-proximate traders dump odd lots
  aceh:      ['Bhang'],
  bantam:    ['Bhang'],
  // South Asia — court-adjacent rarities
  diu:       ['Bezoar Stones'],
  calicut:   ['Bezoar Stones'],
  // Coromandel — Golconda diamond dust / off-grade opium can surface as rarities
  masulipatnam: ['Bhang', 'Bezoar Stones'],
  colombo: ['Cinnamon', 'Bezoar Stones'],
  // Kyushu — overstocked silver sometimes moves blind at favorable rates
  nagasaki: ['Japanese Silver'],
  // Atlantic / colonial frontier
  jamestown: ['Virginia Tobacco'],
  veracruz: ['Cochineal', 'Cacao'],
  luanda:    ['Ivory'],
  elmina:    ['Ivory'],
};

/**
 * Roll for purchase outcome when buying blind (knowledge level 0).
 * @param claimed - what the seller is claiming to sell
 * @param portId - current port (determines trust + windfall pool)
 * @param marketTrust - 0-1 trust level for this port (default 0.5)
 */
export function rollPurchaseOutcome(
  claimed: Commodity,
  portId: string,
  marketTrust: number,
): PurchaseOutcome {
  const def = COMMODITY_DEFS[claimed];
  const trust = Math.max(0, Math.min(1, marketTrust));

  // Fraud chance: base commodity risk amplified at low-trust ports. Capped.
  // At a port with trust 0.3 and a commodity with fraudRisk 0.20:
  //   fraudChance = 0.20 * (1 - 0.3) = 0.14
  // At the same commodity at trust 0.85: 0.20 * 0.15 = 0.03
  const rawFraudChance = def.fraudRisk * (1 - trust);
  const fraudChance = Math.min(0.6, rawFraudChance);

  // Windfall chance: only meaningful at low-trust ports. Max ~5% at trust 0.
  const windfallPool = WINDFALL_POOLS[portId];
  const windfallChance = windfallPool && windfallPool.length > 0
    ? 0.05 * (1 - trust)
    : 0;

  const roll = Math.random();

  if (roll < fraudChance && def.commonSubstitute) {
    return { kind: 'substituted', actual: def.commonSubstitute };
  }
  if (roll < fraudChance + windfallChance && windfallPool) {
    // Don't let the windfall be the same as what was claimed (pointless).
    const candidates = windfallPool.filter(c => c !== claimed);
    if (candidates.length > 0) {
      const pick = candidates[Math.floor(Math.random() * candidates.length)];
      return { kind: 'windfall', actual: pick };
    }
  }
  return { kind: 'genuine' };
}
