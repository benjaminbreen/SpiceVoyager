// ── Commodity definitions for the Indian Ocean trade, c. 1600-1620 ──
//
// Core trade goods + occasional regional items reflecting the real commodity
// networks of the early modern Estado da India and its competitors.

export type Commodity =
  // Tier 1: Bulk staples
  | 'Rice' | 'Timber' | 'Iron' | 'Cotton Textiles'
  // Tier 2: Common spices & stimulants
  | 'Black Pepper' | 'Cinnamon' | 'Cardamom' | 'Coffee' | 'Tea'
  | 'Ginger' | 'Sugar' | 'Tamarind' | 'Cassia Fistula' | 'Tobacco'
  // Tier 3: Luxury trade goods
  | 'Cloves' | 'Nutmeg' | 'Indigo' | 'Chinese Porcelain' | 'Musk'
  | 'Pearls' | 'Ivory' | 'Aloes'
  | 'Frankincense' | 'Myrrh' | 'Saffron' | 'Camphor' | 'Benzoin'
  | 'Red Coral' | 'Rose Water' | 'Rhubarb' | 'China Root' | 'Quicksilver'
  // Tier 4: Precious rarities
  | 'Ambergris' | 'Bezoar Stones' | 'Opium' | 'Bhang' | "Dragon's Blood"
  // Tier 5: Extraordinary
  | 'Mumia' | 'Lapis de Goa'
  // Practical
  | 'Munitions';

export type CommodityTier = 1 | 2 | 3 | 4 | 5;

export interface CommodityDef {
  id: Commodity;
  tier: CommodityTier;
  basePrice: [number, number]; // [min, max] base price range in gold
  weight: number;              // cargo units per item (most are 1)
  spoilable: boolean;          // can spoil on long voyages
  breakable: boolean;          // can break in storms
  fraudRisk: number;           // 0-1, chance goods are counterfeit at purchase
  description: string;         // short flavor text
  color: string;               // UI display color
  icon: string;                // unicode icon for compact display
  iconImage?: string;          // path to icon image in /public/wares/
}

// ── Full commodity catalog ──

export const COMMODITY_DEFS: Record<Commodity, CommodityDef> = {
  // ── Tier 1: Bulk Staples ──
  'Rice': {
    id: 'Rice', tier: 1,
    basePrice: [2, 6], weight: 1,
    spoilable: true, breakable: false, fraudRisk: 0,
    description: 'Staple grain. Also consumed as ship provisions.',
    color: '#d4c090', icon: '⁂',
  },
  'Timber': {
    id: 'Timber', tier: 1,
    basePrice: [3, 8], weight: 2,
    spoilable: false, breakable: false, fraudRisk: 0,
    description: 'Teak and hardwoods from Malabar. Essential for ship repair.',
    color: '#8B6914', icon: '≡',
  },
  'Iron': {
    id: 'Iron', tier: 1,
    basePrice: [4, 10], weight: 2,
    spoilable: false, breakable: false, fraudRisk: 0,
    description: 'Bar iron and steel. High demand in East Africa and Southeast Asia.',
    color: '#7a8a9a', icon: '⚒',
  },
  'Cotton Textiles': {
    id: 'Cotton Textiles', tier: 1,
    basePrice: [5, 12], weight: 1,
    spoilable: true, breakable: false, fraudRisk: 0,
    description: 'Gujarati calicoes and chintzes. Functions as currency in East Africa.',
    color: '#e8dcc8', icon: '⚑',
  },

  // ── Tier 2: Common Spices & Stimulants ──
  'Black Pepper': {
    id: 'Black Pepper', tier: 2,
    basePrice: [8, 25], weight: 1,
    spoilable: false, breakable: false, fraudRisk: 0,
    description: 'The king of spices. Malabar Coast monopoly.',
    color: '#4a4a4a', icon: '✦',
    iconImage: '/wares/black_pepper_icon.png',
  },
  'Cinnamon': {
    id: 'Cinnamon', tier: 2,
    basePrice: [12, 30], weight: 1,
    spoilable: false, breakable: false, fraudRisk: 0.06,
    description: 'Ceylon bark. Often adulterated with cassia.',
    color: '#c47a3a', icon: '⌇',
    iconImage: '/wares/cinnamon_icon.png',
  },
  'Cardamom': {
    id: 'Cardamom', tier: 2,
    basePrice: [10, 28], weight: 1,
    spoilable: false, breakable: false, fraudRisk: 0,
    description: 'From the hills of Malabar. Traded alongside pepper.',
    color: '#7cb342', icon: '❧',
    iconImage: '/wares/cardamom_icon.png',
  },
  'Coffee': {
    id: 'Coffee', tier: 2,
    basePrice: [10, 25], weight: 1,
    spoilable: true, breakable: false, fraudRisk: 0,
    description: 'Mocha monopoly. Demand rising rapidly across the Indian Ocean world.',
    color: '#5d4037', icon: '♨',
  },
  'Tea': {
    id: 'Tea', tier: 2,
    basePrice: [8, 20], weight: 1,
    spoilable: true, breakable: false, fraudRisk: 0,
    description: 'Chinese leaf, funneled through Macau.',
    color: '#66bb6a', icon: '♣',
  },
  'Ginger': {
    id: 'Ginger', tier: 2,
    basePrice: [8, 20], weight: 1,
    spoilable: false, breakable: false, fraudRisk: 0,
    description: 'Malabar and Southeast Asian rhizome. Ubiquitous in the spice trade.',
    color: '#e6a830', icon: '⌁',
    iconImage: '/wares/ginger_icon.png',
  },
  'Sugar': {
    id: 'Sugar', tier: 2,
    basePrice: [6, 15], weight: 1,
    spoilable: true, breakable: false, fraudRisk: 0,
    description: 'Increasingly important commodity. Bengal and Southeast Asian production.',
    color: '#f5f0e0', icon: '⬡',
    iconImage: '/wares/sugar_icon.png',
  },
  'Tamarind': {
    id: 'Tamarind', tier: 2,
    basePrice: [5, 12], weight: 1,
    spoilable: true, breakable: false, fraudRisk: 0,
    description: 'Sour fruit used as food preservative and medicine across the Indian Ocean.',
    color: '#8d6e4c', icon: '⌓',
    iconImage: '/wares/tamarind_icon.png',
  },
  'Cassia Fistula': {
    id: 'Cassia Fistula', tier: 2,
    basePrice: [8, 18], weight: 1,
    spoilable: false, breakable: false, fraudRisk: 0,
    description: 'Indian purgative. Black pods prized in European and Islamic medicine.',
    color: '#6d5c3a', icon: '⌐',
    iconImage: '/wares/cassia_fistula_icon.png',
  },
  'Tobacco': {
    id: 'Tobacco', tier: 2,
    basePrice: [10, 25], weight: 1,
    spoilable: true, breakable: false, fraudRisk: 0,
    description: 'New World plant just arriving in the Indian Ocean. Demand spreading fast.',
    color: '#7c6b4f', icon: '⌘',
    iconImage: '/wares/tobacco_icon.png',
  },

  // ── Tier 3: Luxury Trade Goods ──
  'Cloves': {
    id: 'Cloves', tier: 3,
    basePrice: [25, 70], weight: 1,
    spoilable: false, breakable: false, fraudRisk: 0.05,
    description: 'From the Maluku Islands. Available only through Bantam and Malacca.',
    color: '#8b4513', icon: '✿',
    iconImage: '/wares/clove_icon.png',
  },
  'Nutmeg': {
    id: 'Nutmeg', tier: 3,
    basePrice: [20, 55], weight: 1,
    spoilable: false, breakable: false, fraudRisk: 0.06,
    description: 'Banda Islands product. Astronomical markup far from source.',
    color: '#d4a574', icon: '◉',
    iconImage: '/wares/nutmeg_icon.png',
  },
  'Indigo': {
    id: 'Indigo', tier: 3,
    basePrice: [18, 45], weight: 1,
    spoilable: false, breakable: false, fraudRisk: 0,
    description: 'Gujarat dye. Insatiable European demand.',
    color: '#3f51b5', icon: '◆',
  },
  'Chinese Porcelain': {
    id: 'Chinese Porcelain', tier: 3,
    basePrice: [20, 60], weight: 2,
    spoilable: false, breakable: true, fraudRisk: 0,
    description: 'Blue-and-white kraak ware from Jingdezhen. Fragile cargo.',
    color: '#4fc3f7', icon: '⚱',
  },
  'Musk': {
    id: 'Musk', tier: 3,
    basePrice: [30, 80], weight: 1,
    spoilable: false, breakable: false, fraudRisk: 0.10,
    description: 'Tibetan musk deer pods. Perfumery and medicine. Often faked.',
    color: '#9c27b0', icon: '❋',
  },
  'Pearls': {
    id: 'Pearls', tier: 3,
    basePrice: [25, 65], weight: 1,
    spoilable: false, breakable: false, fraudRisk: 0,
    description: 'Persian Gulf pearls. Hormuz and Muscat specialties.',
    color: '#e0d6cc', icon: '○',
  },
  'Ivory': {
    id: 'Ivory', tier: 3,
    basePrice: [20, 50], weight: 2,
    spoilable: false, breakable: false, fraudRisk: 0,
    description: 'East African elephant tusks. Heavy but always in demand.',
    color: '#faf0e6', icon: '⌒',
  },
  'Aloes': {
    id: 'Aloes', tier: 3,
    basePrice: [22, 55], weight: 1,
    spoilable: false, breakable: false, fraudRisk: 0,
    description: 'Aloeswood and agarwood. Precious aromatic resin.',
    color: '#795548', icon: '❦',
    iconImage: '/wares/aloes_icon.png',
  },
  'Frankincense': {
    id: 'Frankincense', tier: 3,
    basePrice: [20, 50], weight: 1,
    spoilable: false, breakable: false, fraudRisk: 0.04,
    description: 'Arabian olibanum. Sacred incense burned from Lisbon to Kyoto.',
    color: '#c9b87a', icon: '△',
    iconImage: '/wares/frankincense_icon.png',
  },
  'Myrrh': {
    id: 'Myrrh', tier: 3,
    basePrice: [22, 55], weight: 1,
    spoilable: false, breakable: false, fraudRisk: 0.04,
    description: 'Resinous gum from Arabia and the Horn of Africa. Medicine and incense.',
    color: '#a07040', icon: '▽',
    iconImage: '/wares/myrrh_icon.png',
  },
  'Saffron': {
    id: 'Saffron', tier: 3,
    basePrice: [30, 75], weight: 1,
    spoilable: false, breakable: false, fraudRisk: 0.12,
    description: 'Persian and Kashmiri crocus stamens. Worth more than gold by weight. Often adulterated.',
    color: '#ff8f00', icon: '❈',
    iconImage: '/wares/saffron_icon.png',
  },
  'Camphor': {
    id: 'Camphor', tier: 3,
    basePrice: [18, 45], weight: 1,
    spoilable: false, breakable: false, fraudRisk: 0.05,
    description: 'Bornean camphor, far superior to the Chinese variety. Medicine and ritual.',
    color: '#b0c4de', icon: '◇',
    iconImage: '/wares/camphor_icon.png',
  },
  'Benzoin': {
    id: 'Benzoin', tier: 3,
    basePrice: [15, 40], weight: 1,
    spoilable: false, breakable: false, fraudRisk: 0,
    description: 'Sumatran aromatic resin. Burned as incense and used in medicine.',
    color: '#9e7c5c', icon: '◐',
    iconImage: '/wares/benzoin_icon.png',
  },
  'Red Coral': {
    id: 'Red Coral', tier: 3,
    basePrice: [25, 60], weight: 1,
    spoilable: false, breakable: true, fraudRisk: 0,
    description: 'Mediterranean coral, traded into India for jewelry and medicine. Fragile.',
    color: '#e53935', icon: '⌗',
    iconImage: '/wares/red_coral_icon.png',
  },
  'Rose Water': {
    id: 'Rose Water', tier: 3,
    basePrice: [12, 30], weight: 1,
    spoilable: false, breakable: true, fraudRisk: 0,
    description: 'Persian distillation. Perfumery, cooking, and medicine. Bottles break easily.',
    color: '#f48fb1', icon: '✾',
    iconImage: '/wares/rose_water_icon.png',
  },
  'Rhubarb': {
    id: 'Rhubarb', tier: 3,
    basePrice: [25, 60], weight: 1,
    spoilable: false, breakable: false, fraudRisk: 0.08,
    description: '"China rhubarb" — one of the most valued materia medica in European pharmacies.',
    color: '#c62828', icon: '⌠',
    iconImage: '/wares/rhubarb_root_icon.png',
  },
  'China Root': {
    id: 'China Root', tier: 3,
    basePrice: [20, 50], weight: 1,
    spoilable: false, breakable: false, fraudRisk: 0.06,
    description: 'Smilax china. Prized as a cure for the French disease. Major Chinese export.',
    color: '#8d6e63', icon: '⌡',
    iconImage: '/wares/china_root_icon.png',
  },
  'Quicksilver': {
    id: 'Quicksilver', tier: 3,
    basePrice: [25, 55], weight: 2,
    spoilable: false, breakable: false, fraudRisk: 0,
    description: 'Mercury. Essential for amalgamation, medicine, and alchemy. Heavy and dangerous.',
    color: '#b0bec5', icon: '☿',
    iconImage: '/wares/quicksilver_icon.png',
  },

  // ── Tier 4: Precious Rarities ──
  'Ambergris': {
    id: 'Ambergris', tier: 4,
    basePrice: [50, 150], weight: 1,
    spoilable: false, breakable: false, fraudRisk: 0.10,
    description: 'Whale secretion. Perfume fixative and medicine. Often counterfeited.',
    color: '#b8860b', icon: '◈',
    iconImage: '/wares/amber_icon.png',
  },
  'Bezoar Stones': {
    id: 'Bezoar Stones', tier: 4,
    basePrice: [80, 200], weight: 1,
    spoilable: false, breakable: false, fraudRisk: 0.20,
    description: 'Calcified stomach stones. Believed to be universal antidote. Frequently faked.',
    color: '#a1887f', icon: '◎',
    iconImage: '/wares/bezoar_stone_icon.png',
  },
  'Opium': {
    id: 'Opium', tier: 4,
    basePrice: [40, 100], weight: 1,
    spoilable: false, breakable: false, fraudRisk: 0,
    description: 'Cambay product. Portuguese carry it eastward. Some factions disapprove.',
    color: '#880e4f', icon: '❀',
    iconImage: '/wares/opium_icon.png',
  },
  'Bhang': {
    id: 'Bhang', tier: 4,
    basePrice: [35, 80], weight: 1,
    spoilable: true, breakable: false, fraudRisk: 0,
    description: 'Cannabis preparation. Appears unpredictably at market.',
    color: '#558b2f', icon: '✽',
  },
  "Dragon's Blood": {
    id: "Dragon's Blood", tier: 4,
    basePrice: [40, 90], weight: 1,
    spoilable: false, breakable: false, fraudRisk: 0.08,
    description: "Deep red resin from Socotra's dragon trees. Dye, varnish, and medicine.",
    color: '#b71c1c', icon: '⬥',
    iconImage: '/wares/dragons_blood_icon.png',
  },

  // ── Tier 5: Extraordinary ──
  'Mumia': {
    id: 'Mumia', tier: 5,
    basePrice: [120, 300], weight: 1,
    spoilable: false, breakable: false, fraudRisk: 0.35,
    description: '"Egyptian mummy" — prized drug in European and Islamic medicine. Most is fake bitumen.',
    color: '#4e342e', icon: '☥',
  },
  'Lapis de Goa': {
    id: 'Lapis de Goa', tier: 5,
    basePrice: [150, 400], weight: 1,
    spoilable: false, breakable: false, fraudRisk: 0,
    description: 'Artificial bezoar made by Jesuits. Gold leaf, gemstone dust, and secret ingredients.',
    color: '#ffd700', icon: '✧',
  },

  // ── Practical ──
  'Munitions': {
    id: 'Munitions', tier: 1,
    basePrice: [5, 18], weight: 2,
    spoilable: false, breakable: false, fraudRisk: 0,
    description: 'Gunpowder, shot, and small arms. Some ports restrict trade.',
    color: '#78909c', icon: '●',
  },
};

// ── Ordered list for UI display ──
export const ALL_COMMODITIES: Commodity[] = [
  // Tier 1
  'Rice', 'Timber', 'Iron', 'Cotton Textiles',
  // Tier 2
  'Black Pepper', 'Cinnamon', 'Cardamom', 'Ginger', 'Coffee', 'Tea',
  'Sugar', 'Tamarind', 'Cassia Fistula', 'Tobacco',
  // Tier 3
  'Cloves', 'Nutmeg', 'Indigo', 'Chinese Porcelain', 'Musk',
  'Pearls', 'Ivory', 'Aloes',
  'Frankincense', 'Myrrh', 'Saffron', 'Camphor', 'Benzoin',
  'Red Coral', 'Rose Water', 'Rhubarb', 'China Root', 'Quicksilver',
  // Tier 4
  'Ambergris', 'Bezoar Stones', 'Opium', 'Bhang', "Dragon's Blood",
  // Tier 5
  'Mumia', 'Lapis de Goa',
  // Practical
  'Munitions',
];

export const TIER_LABELS: Record<CommodityTier, string> = {
  1: 'Staples & Materials',
  2: 'Spices & Stimulants',
  3: 'Luxury Goods',
  4: 'Precious Rarities',
  5: 'Extraordinary',
};

// ── Per-port trade profiles ──
// "produces" = very cheap (0.3-0.6x base), high stock
// "trades"   = moderate price (0.8-1.2x), moderate stock
// "demands"  = expensive (1.4-2.0x), low/zero local stock
// Goods not listed in any category are unavailable at that port.

export type PortTradeRole = 'produces' | 'trades' | 'demands';

export interface PortTradeProfile {
  produces: Commodity[];
  trades: Commodity[];
  demands: Commodity[];
}

export const PORT_TRADE_PROFILES: Record<string, PortTradeProfile> = {
  calicut: {
    produces: ['Black Pepper', 'Cardamom', 'Cinnamon', 'Timber', 'Rice', 'Ginger',
               'Tamarind', 'Cassia Fistula'],
    trades:   ['Cotton Textiles', 'Iron', 'Aloes', 'Tea', 'Munitions', 'Sugar'],
    demands:  ['Chinese Porcelain', 'Cloves', 'Nutmeg', 'Pearls', 'Musk', 'Ivory',
               'Red Coral', 'Rose Water', 'Quicksilver', 'Saffron'],
  },
  goa: {
    produces: ['Lapis de Goa', 'Black Pepper', 'Rice'],
    trades:   ['Opium', 'Iron', 'Munitions', 'Indigo', 'Cinnamon', 'Cotton Textiles', 'Timber',
               'Bezoar Stones', 'Cardamom', 'Ginger', 'Tamarind', 'Cassia Fistula',
               'Tobacco', 'Quicksilver', 'Red Coral', 'Sugar'],
    demands:  ['Cloves', 'Nutmeg', 'Chinese Porcelain', 'Musk', 'Tea',
               'Ambergris', 'Mumia', 'Camphor', 'Saffron', 'Rhubarb', 'China Root'],
  },
  surat: {
    produces: ['Cotton Textiles', 'Indigo', 'Opium', 'Rice', 'Sugar'],
    trades:   ['Iron', 'Black Pepper', 'Cardamom', 'Munitions', 'Timber', 'Bezoar Stones',
               'Ginger', 'Saffron', 'Rose Water', 'Tamarind'],
    demands:  ['Cloves', 'Nutmeg', 'Chinese Porcelain', 'Tea', 'Musk', 'Ivory', 'Coffee',
               'Camphor', 'Rhubarb', 'China Root', 'Frankincense'],
  },
  diu: {
    produces: ['Cotton Textiles', 'Indigo'],
    trades:   ['Opium', 'Iron', 'Munitions', 'Black Pepper', 'Rice', 'Sugar',
               'Rose Water'],
    demands:  ['Cloves', 'Nutmeg', 'Chinese Porcelain', 'Tea', 'Pearls', 'Coffee',
               'Camphor', 'Saffron', 'Rhubarb'],
  },
  hormuz: {
    produces: ['Pearls', 'Rose Water'],
    trades:   ['Iron', 'Cotton Textiles', 'Black Pepper', 'Cinnamon', 'Indigo', 'Munitions',
               'Musk', 'Opium', 'Bezoar Stones', 'Coffee', 'Ambergris',
               'Saffron', 'Frankincense', 'Myrrh', 'Red Coral', 'Rhubarb'],
    demands:  ['Timber', 'Rice', 'Cloves', 'Nutmeg', 'Chinese Porcelain', 'Ivory',
               'Tea', 'Mumia', 'Camphor', 'Quicksilver', 'China Root'],
  },
  muscat: {
    produces: ['Pearls', 'Ambergris', 'Frankincense'],
    trades:   ['Iron', 'Cotton Textiles', 'Aloes', 'Munitions', 'Coffee',
               'Rose Water', 'Myrrh'],
    demands:  ['Black Pepper', 'Cloves', 'Chinese Porcelain', 'Timber', 'Rice', 'Ivory',
               'Saffron', 'Camphor', 'Rhubarb'],
  },
  mocha: {
    produces: ['Coffee'],
    trades:   ['Mumia', 'Ambergris', 'Iron', 'Aloes', 'Frankincense', 'Myrrh',
               'Red Coral'],
    demands:  ['Cotton Textiles', 'Black Pepper', 'Cloves', 'Chinese Porcelain', 'Rice',
               'Indigo', 'Nutmeg', 'Ivory', 'Munitions', 'Sugar', 'Tobacco',
               'Saffron', 'Camphor'],
  },
  aden: {
    produces: ['Coffee', 'Frankincense', 'Myrrh'],
    trades:   ['Mumia', 'Ivory', 'Iron', 'Aloes', 'Ambergris'],
    demands:  ['Cotton Textiles', 'Black Pepper', 'Cloves', 'Chinese Porcelain', 'Rice',
               'Indigo', 'Nutmeg', 'Munitions', 'Musk', 'Sugar', 'Tobacco',
               'Camphor', 'Rhubarb'],
  },
  zanzibar: {
    produces: ['Ivory', 'Ambergris'],
    trades:   ['Aloes', 'Rice', 'Tamarind', 'Frankincense'],
    demands:  ['Cotton Textiles', 'Iron', 'Munitions', 'Black Pepper', 'Chinese Porcelain',
               'Bezoar Stones', 'Opium', 'Cloves', 'Sugar', 'Tobacco',
               'Red Coral', 'Quicksilver'],
  },
  mombasa: {
    produces: ['Ivory'],
    trades:   ['Iron', 'Rice', 'Ambergris', 'Aloes', 'Frankincense', 'Myrrh'],
    demands:  ['Cotton Textiles', 'Munitions', 'Chinese Porcelain', 'Black Pepper',
               'Cloves', 'Opium', 'Bezoar Stones', 'Sugar', 'Tobacco',
               'Red Coral', 'Quicksilver'],
  },
  socotra: {
    produces: ['Aloes', 'Ambergris', "Dragon's Blood"],
    trades:   ['Frankincense', 'Myrrh'],
    demands:  ['Rice', 'Iron', 'Cotton Textiles', 'Munitions', 'Black Pepper', 'Tea',
               'Sugar'],
  },
  malacca: {
    produces: ['Cloves', 'Nutmeg', 'Aloes', 'Timber', 'Camphor', 'Benzoin'],
    trades:   ['Black Pepper', 'Tea', 'Rice', 'Iron', 'Munitions', 'Opium', 'Bhang',
               'Ginger', 'Sugar', 'Tobacco', 'China Root'],
    demands:  ['Cotton Textiles', 'Indigo', 'Bezoar Stones', 'Ivory', 'Coffee',
               'Pearls', 'Musk', 'Saffron', 'Red Coral', 'Quicksilver',
               'Frankincense', 'Rose Water'],
  },
  bantam: {
    produces: ['Cloves', 'Nutmeg', 'Rice', 'Timber', 'Camphor', 'Benzoin', 'Sugar'],
    trades:   ['Black Pepper', 'Aloes', 'Iron', 'Bhang', 'Ginger', 'Tobacco'],
    demands:  ['Cotton Textiles', 'Indigo', 'Chinese Porcelain', 'Opium', 'Munitions',
               'Ivory', 'Pearls', 'Musk', 'Coffee', 'Saffron', 'Red Coral',
               'Quicksilver', 'Frankincense', 'Rose Water'],
  },
  macau: {
    produces: ['Chinese Porcelain', 'Tea', 'Musk', 'Rhubarb', 'China Root'],
    trades:   ['Bhang', 'Iron', 'Munitions', 'Aloes', 'Nutmeg', 'Sugar',
               'Tobacco', 'Quicksilver', 'Camphor'],
    demands:  ['Black Pepper', 'Cloves', 'Opium', 'Bezoar Stones', 'Cotton Textiles',
               'Cinnamon', 'Ivory', 'Coffee', 'Ambergris', 'Saffron',
               'Frankincense', 'Red Coral', 'Rose Water'],
  },
};

// ── Price & inventory generation ──

/** Price multiplier based on port's relationship to the commodity */
function roleMultiplier(role: PortTradeRole, prng: () => number): number {
  switch (role) {
    case 'produces': return 0.3 + prng() * 0.3;   // 0.3–0.6x
    case 'trades':   return 0.8 + prng() * 0.4;   // 0.8–1.2x
    case 'demands':  return 1.4 + prng() * 0.6;   // 1.4–2.0x
  }
}

/** Inventory amount based on role */
function roleInventory(role: PortTradeRole, tier: CommodityTier, prng: () => number): number {
  const base = tier <= 2 ? 80 : tier <= 3 ? 40 : tier <= 4 ? 12 : 4;
  switch (role) {
    case 'produces': return Math.floor(base * (0.6 + prng() * 0.6));   // 60-120% of base
    case 'trades':   return Math.floor(base * (0.2 + prng() * 0.4));   // 20-60% of base
    case 'demands':  return Math.floor(base * prng() * 0.15);          // 0-15% of base (often 0)
  }
}

/** Get the trade role for a commodity at a given port */
export function getTradeRole(portId: string, commodity: Commodity): PortTradeRole | null {
  const profile = PORT_TRADE_PROFILES[portId];
  if (!profile) return null;
  if (profile.produces.includes(commodity)) return 'produces';
  if (profile.trades.includes(commodity)) return 'trades';
  if (profile.demands.includes(commodity)) return 'demands';
  return null; // not available at this port
}

/** Generate prices for a port based on its trade profile */
export function generatePortPrices(
  portId: string,
  prng: () => number,
): Record<Commodity, number> {
  const prices = {} as Record<Commodity, number>;

  for (const commodity of ALL_COMMODITIES) {
    const def = COMMODITY_DEFS[commodity];
    const role = getTradeRole(portId, commodity);
    if (!role) {
      // Not available at this port — set price to 0 as sentinel
      prices[commodity] = 0;
      continue;
    }
    const [minP, maxP] = def.basePrice;
    const midPrice = (minP + maxP) / 2;
    const mult = roleMultiplier(role, prng);
    prices[commodity] = Math.max(1, Math.round(midPrice * mult));
  }

  return prices;
}

/** Generate inventory for a port based on its trade profile */
export function generatePortInventory(
  portId: string,
  prng: () => number,
): Record<Commodity, number> {
  const inventory = {} as Record<Commodity, number>;

  for (const commodity of ALL_COMMODITIES) {
    const def = COMMODITY_DEFS[commodity];
    const role = getTradeRole(portId, commodity);
    if (!role) {
      inventory[commodity] = 0;
      continue;
    }
    inventory[commodity] = roleInventory(role, def.tier, prng);
  }

  return inventory;
}

/** Calculate a global average price for a commodity across all ports (for UI comparison) */
export function getGlobalAveragePrice(commodity: Commodity): number {
  const def = COMMODITY_DEFS[commodity];
  return Math.round((def.basePrice[0] + def.basePrice[1]) / 2);
}

/** Supply/demand price adjustment: returns a modifier (< 1.0 if flooded, > 1.0 if scarce) */
export function supplyDemandModifier(
  currentInventory: number,
  baseInventory: number,
): number {
  if (baseInventory <= 0) return 1.0;
  const ratio = currentInventory / baseInventory;
  // Inventory at 200% of base → price drops to 0.7x
  // Inventory at 0% of base → price rises to 1.5x
  // Inventory at 100% → price at 1.0x
  return Math.max(0.5, Math.min(2.0, 1.0 + (1.0 - ratio) * 0.5));
}

// ── Starting cargo generation ──

// What each faction would plausibly be carrying at the start of a voyage.
// Goods are weighted by tier during selection — these pools just define
// what's *eligible* for each faction's starting hold.
const FACTION_CARGO_POOLS: Record<string, Commodity[]> = {
  English: [
    'Iron', 'Munitions', 'Rice', 'Timber',
    'Black Pepper', 'Cinnamon', 'Ginger', 'Tea',
    'Cloves', 'Nutmeg', 'Cotton Textiles', 'Indigo',
  ],
  Dutch: [
    'Iron', 'Munitions', 'Rice', 'Timber',
    'Black Pepper', 'Cloves', 'Nutmeg', 'Cinnamon',
    'Cotton Textiles', 'Indigo', 'Sugar', 'Camphor',
  ],
  Portuguese: [
    'Munitions', 'Iron', 'Rice', 'Timber',
    'Black Pepper', 'Cinnamon', 'Ginger', 'Sugar',
    'Opium', 'Red Coral', 'Quicksilver', 'Cotton Textiles',
    'Cassia Fistula', 'Tobacco',
  ],
  Spanish: [
    'Iron', 'Munitions', 'Rice', 'Timber',
    'Cinnamon', 'Sugar', 'Tobacco',
    'Red Coral', 'Quicksilver',
  ],
  French: [
    'Iron', 'Munitions', 'Rice', 'Timber',
    'Black Pepper', 'Cinnamon', 'Coffee', 'Sugar',
    'Cotton Textiles', 'Indigo',
  ],
  Danish: [
    'Iron', 'Munitions', 'Rice', 'Timber',
    'Black Pepper', 'Tea', 'Cotton Textiles', 'Sugar',
  ],
  Gujarati: [
    'Cotton Textiles', 'Rice', 'Indigo', 'Sugar',
    'Black Pepper', 'Cardamom', 'Ginger', 'Tamarind', 'Cassia Fistula',
    'Opium', 'Bezoar Stones', 'Rose Water', 'Saffron',
  ],
  Mughal: [
    'Cotton Textiles', 'Rice', 'Indigo', 'Iron', 'Sugar',
    'Black Pepper', 'Cardamom', 'Opium', 'Saffron',
    'Rose Water', 'Bezoar Stones',
  ],
  Ottoman: [
    'Coffee', 'Rice', 'Iron', 'Munitions',
    'Frankincense', 'Myrrh', 'Rose Water', 'Saffron',
    'Cotton Textiles', 'Red Coral',
  ],
  Persian: [
    'Rose Water', 'Saffron', 'Pearls', 'Rice',
    'Cotton Textiles', 'Iron', 'Coffee',
    'Frankincense', 'Myrrh', 'Bezoar Stones',
  ],
  Omani: [
    'Frankincense', 'Pearls', 'Rice', 'Iron',
    'Coffee', 'Myrrh', 'Ambergris', 'Cotton Textiles',
  ],
  Swahili: [
    'Ivory', 'Rice', 'Iron', 'Cotton Textiles',
    'Ambergris', 'Aloes', 'Frankincense', 'Tamarind',
  ],
  Malay: [
    'Cloves', 'Nutmeg', 'Camphor', 'Benzoin', 'Rice', 'Timber',
    'Black Pepper', 'Sugar', 'Aloes', 'Ginger',
  ],
  Acehnese: [
    'Black Pepper', 'Camphor', 'Benzoin', 'Rice', 'Timber',
    'Sugar', 'Ginger', 'Aloes',
  ],
  Javanese: [
    'Cloves', 'Nutmeg', 'Rice', 'Timber', 'Sugar',
    'Black Pepper', 'Benzoin', 'Camphor', 'Ginger',
  ],
  Chinese: [
    'Chinese Porcelain', 'Tea', 'Rice', 'Iron',
    'Musk', 'Rhubarb', 'China Root', 'Sugar',
  ],
  Japanese: [
    'Iron', 'Rice', 'Tea', 'Camphor',
    'Chinese Porcelain', 'Timber',
  ],
  Siamese: [
    'Rice', 'Timber', 'Sugar', 'Benzoin',
    'Camphor', 'Aloes', 'Black Pepper', 'Iron',
  ],
  Moluccan: [
    'Cloves', 'Nutmeg', 'Rice', 'Timber',
    'Camphor', 'Benzoin', 'Aloes',
  ],
};

// Default pool for factions not explicitly listed
const DEFAULT_CARGO_POOL: Commodity[] = [
  'Rice', 'Iron', 'Timber', 'Munitions', 'Cotton Textiles',
  'Black Pepper', 'Cinnamon', 'Sugar',
];

// Draw weight by tier — lower tiers far more likely to appear in starting cargo
const TIER_DRAW_WEIGHT: Record<CommodityTier, number> = {
  1: 10,
  2: 7,
  3: 3,
  4: 1,
  5: 0, // never start with tier 5
};

/**
 * Generate a randomized starting cargo appropriate for the player's faction
 * and captain luck. Fills ~50% of cargo capacity.
 */
export function generateStartingCargo(
  faction: string,
  cargoCapacity: number,
  captainLuck: number, // 1-20
): Record<Commodity, number> {
  const cargo = Object.fromEntries(
    ALL_COMMODITIES.map(c => [c, 0])
  ) as Record<Commodity, number>;

  const targetWeight = Math.floor(cargoCapacity * 0.5);
  const pool = FACTION_CARGO_POOLS[faction] ?? DEFAULT_CARGO_POOL;

  // Always start with some Rice and Munitions
  cargo['Rice'] = Math.min(5, targetWeight);
  cargo['Munitions'] = 8;
  let currentWeight = cargo['Rice'] * COMMODITY_DEFS['Rice'].weight
                    + cargo['Munitions'] * COMMODITY_DEFS['Munitions'].weight;

  // Build weighted draw list from the faction pool
  const drawList: { commodity: Commodity; weight: number }[] = [];
  for (const c of pool) {
    if (c === 'Rice' || c === 'Munitions') continue; // already placed
    const def = COMMODITY_DEFS[c];
    if (!def) continue;
    let w = TIER_DRAW_WEIGHT[def.tier];
    // Captain luck shifts weights: luck 15 → +2 to all tier weights, luck 20 → +4
    if (captainLuck > 10) {
      w += Math.floor((captainLuck - 10) * 0.4);
    }
    if (w > 0) drawList.push({ commodity: c, weight: w });
  }

  if (drawList.length === 0) return cargo;

  // Weighted random pick helper
  const totalWeight = drawList.reduce((sum, d) => sum + d.weight, 0);
  const pickFromPool = (): Commodity => {
    let roll = Math.random() * totalWeight;
    for (const d of drawList) {
      roll -= d.weight;
      if (roll <= 0) return d.commodity;
    }
    return drawList[drawList.length - 1].commodity;
  };

  // Fill cargo with random draws
  const maxDraws = 12; // prevent infinite loops on edge cases
  let draws = 0;
  while (currentWeight < targetWeight && draws < maxDraws) {
    const commodity = pickFromPool();
    const def = COMMODITY_DEFS[commodity];

    // Quantity scales inversely with tier
    const maxQty = def.tier <= 1 ? 8 : def.tier <= 2 ? 5 : def.tier <= 3 ? 3 : 1;
    const qty = Math.max(1, Math.ceil(Math.random() * maxQty));
    const addWeight = qty * def.weight;

    // Don't overshoot
    if (currentWeight + addWeight > targetWeight + 4) {
      draws++;
      continue;
    }

    cargo[commodity] += qty;
    currentWeight += addWeight;
    draws++;
  }

  // Lucky captain bonus: guaranteed tier 3 item
  if (captainLuck >= 11 && currentWeight < targetWeight + 4) {
    const tier3pool = pool.filter(c => {
      const d = COMMODITY_DEFS[c];
      return d && d.tier === 3 && cargo[c] === 0;
    }) as Commodity[];
    if (tier3pool.length > 0) {
      const pick = tier3pool[Math.floor(Math.random() * tier3pool.length)];
      cargo[pick] = Math.max(1, Math.ceil(Math.random() * 2));
    }
  }

  // Very lucky captain: chance of a tier 4 item
  if (captainLuck >= 16) {
    const tier4pool = pool.filter(c => {
      const d = COMMODITY_DEFS[c];
      return d && d.tier === 4 && cargo[c] === 0;
    }) as Commodity[];
    if (tier4pool.length > 0 && Math.random() < 0.4 + (captainLuck - 16) * 0.1) {
      const pick = tier4pool[Math.floor(Math.random() * tier4pool.length)];
      cargo[pick] = 1;
    }
  }

  return cargo;
}
