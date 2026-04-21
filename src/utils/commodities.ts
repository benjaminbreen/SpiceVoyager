// ── Commodity definitions for the Indian Ocean trade, c. 1600-1620 ──
//
// Core trade goods + occasional regional items reflecting the real commodity
// networks of the early modern Estado da India and its competitors.

export type Commodity =
  // Tier 1: Spices & Stimulants (shown first)
  | 'Black Pepper' | 'Cinnamon' | 'Cardamom' | 'Coffee' | 'Tea'
  | 'Ginger' | 'Cloves' | 'Nutmeg' | 'Saffron' | 'Tobacco'
  // Tier 2: Exotic Drugs & Medicines
  | 'Opium' | 'Camphor' | 'Benzoin' | 'Frankincense' | 'Myrrh'
  | 'Rhubarb' | 'China Root' | 'Cassia Fistula' | 'Aloes' | 'Sassafras'
  | 'Musk' | 'Quicksilver' | 'Tamarind'
  // Tier 3: Staples & Trade Goods
  | 'Indigo' | 'Iron' | 'Timber' | 'Sugar'
  | 'Ivory' | 'Chinese Porcelain' | 'Pearls' | 'Red Coral' | 'Rose Water'
  // Tier 3: Hunted goods
  | 'Hides' | 'Wool' | 'Horn'
  // Tier 4: Precious Rarities
  | 'Ambergris' | 'Bezoar Stones' | 'Bhang' | "Dragon's Blood" | 'Virginia Tobacco'
  // Tier 5: Extraordinary
  | 'Mumia' | 'Lapis de Goa'
  // Non-tradable (provisions/supplies, not shown in market)
  | 'Rice' | 'Munitions' | 'Salted Meat';

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
  physicalDescription: string; // Level 0 (unknown) display — what you see before identification
  color: string;               // UI display color
  icon: string;                // unicode icon for compact display
  iconImage?: string;          // path to icon image in /public/wares/
  // Period-accurate adulterant. When fraud hits on an Unknown purchase, this
  // is what the player actually took aboard. Undefined = no specific swap;
  // fraudRisk falls back to "damaged/poor quality" (unused in phase 1).
  commonSubstitute?: Commodity;
}

// ── Full commodity catalog ──

export const COMMODITY_DEFS: Record<Commodity, CommodityDef> = {
  // ── Tier 1: Spices & Stimulants ──
  'Black Pepper': {
    id: 'Black Pepper', tier: 1,
    basePrice: [8, 25], weight: 1,
    spoilable: false, breakable: false, fraudRisk: 0,
    description: 'The king of spices. Malabar Coast monopoly.',
    physicalDescription: 'Small, hard, wrinkled black drupes with a sharp bite',
    color: '#4a4a4a', icon: '✦',
    iconImage: '/wares/black_pepper_icon.png',
  },
  'Cinnamon': {
    id: 'Cinnamon', tier: 1,
    basePrice: [12, 30], weight: 1,
    spoilable: false, breakable: false, fraudRisk: 0.06,
    description: 'Ceylon bark. Often adulterated with cassia.',
    physicalDescription: 'Rolled quills of fragrant reddish bark',
    color: '#c47a3a', icon: '⌇',
    iconImage: '/wares/cinnamon_icon.png',
    commonSubstitute: 'Cassia Fistula',
  },
  'Cardamom': {
    id: 'Cardamom', tier: 1,
    basePrice: [10, 28], weight: 1,
    spoilable: false, breakable: false, fraudRisk: 0,
    description: 'From the hills of Malabar. Traded alongside pepper.',
    physicalDescription: 'Small green pods containing aromatic seeds',
    color: '#7cb342', icon: '❧',
    iconImage: '/wares/cardamom_icon.png',
  },
  'Coffee': {
    id: 'Coffee', tier: 1,
    basePrice: [10, 25], weight: 1,
    spoilable: true, breakable: false, fraudRisk: 0,
    description: 'Mocha monopoly. Demand rising rapidly across the Indian Ocean world.',
    physicalDescription: 'Dark roasted berries with a bitter, stimulating smell',
    color: '#5d4037', icon: '♨',
    iconImage: '/wares/coffee_icon.png',
  },
  'Tea': {
    id: 'Tea', tier: 1,
    basePrice: [8, 20], weight: 1,
    spoilable: true, breakable: false, fraudRisk: 0,
    description: 'Chinese leaf, funneled through Macau.',
    physicalDescription: 'Dried, tightly rolled leaves with a grassy scent',
    color: '#66bb6a', icon: '♣',
    iconImage: '/wares/tea_icon.png',
  },
  'Ginger': {
    id: 'Ginger', tier: 1,
    basePrice: [8, 20], weight: 1,
    spoilable: false, breakable: false, fraudRisk: 0,
    description: 'Malabar and Southeast Asian rhizome. Ubiquitous in the spice trade.',
    physicalDescription: 'Knobby pale rhizomes with a fiery, warming taste',
    color: '#e6a830', icon: '⌁',
    iconImage: '/wares/ginger_icon.png',
  },
  'Cloves': {
    id: 'Cloves', tier: 1,
    basePrice: [25, 70], weight: 1,
    spoilable: false, breakable: false, fraudRisk: 0.05,
    description: 'From the Maluku Islands. Available only through Bantam and Malacca.',
    physicalDescription: 'Tiny dried flower buds, dark brown, intensely aromatic',
    color: '#8b4513', icon: '✿',
    iconImage: '/wares/clove_icon.png',
  },
  'Nutmeg': {
    id: 'Nutmeg', tier: 1,
    basePrice: [20, 55], weight: 1,
    spoilable: false, breakable: false, fraudRisk: 0.06,
    description: 'Banda Islands product. Astronomical markup far from source.',
    physicalDescription: 'Hard brown ovoid seeds with a warm, sweet fragrance',
    color: '#d4a574', icon: '◉',
    iconImage: '/wares/nutmeg_icon.png',
  },
  'Saffron': {
    id: 'Saffron', tier: 1,
    basePrice: [30, 75], weight: 1,
    spoilable: false, breakable: false, fraudRisk: 0.12,
    description: 'Persian and Kashmiri crocus stamens. Worth more than gold by weight. Often adulterated.',
    physicalDescription: 'Tiny crimson threads that stain water brilliant yellow',
    color: '#ff8f00', icon: '❈',
    iconImage: '/wares/saffron_icon.png',
  },
  'Tobacco': {
    id: 'Tobacco', tier: 1,
    basePrice: [10, 25], weight: 1,
    spoilable: true, breakable: false, fraudRisk: 0,
    description: 'New World plant just arriving in the Indian Ocean. Demand spreading fast.',
    physicalDescription: 'Bundles of large dried leaves with an acrid smell',
    color: '#7c6b4f', icon: '⌘',
    iconImage: '/wares/tobacco_icon.png',
  },

  // ── Tier 2: Exotic Drugs & Medicines ──
  'Opium': {
    id: 'Opium', tier: 2,
    basePrice: [40, 100], weight: 1,
    spoilable: false, breakable: false, fraudRisk: 0,
    description: 'Cambay product. Portuguese carry it eastward. Some factions disapprove.',
    physicalDescription: 'Dark, sticky paste scraped from seed pods, with a heavy smell',
    color: '#880e4f', icon: '❀',
    iconImage: '/wares/opium_icon.png',
  },
  'Camphor': {
    id: 'Camphor', tier: 2,
    basePrice: [18, 45], weight: 1,
    spoilable: false, breakable: false, fraudRisk: 0.05,
    description: 'Bornean camphor, far superior to the Chinese variety. Medicine and ritual.',
    physicalDescription: 'Waxy white crystals with a sharp, penetrating smell',
    color: '#b0c4de', icon: '◇',
    iconImage: '/wares/camphor_icon.png',
    commonSubstitute: 'Benzoin',
  },
  'Benzoin': {
    id: 'Benzoin', tier: 2,
    basePrice: [15, 40], weight: 1,
    spoilable: false, breakable: false, fraudRisk: 0,
    description: 'Sumatran aromatic resin. Burned as incense and used in medicine.',
    physicalDescription: 'Brittle chunks of amber-colored resin with a vanilla scent',
    color: '#9e7c5c', icon: '◐',
    iconImage: '/wares/benzoin_icon.png',
  },
  'Frankincense': {
    id: 'Frankincense', tier: 2,
    basePrice: [20, 50], weight: 1,
    spoilable: false, breakable: false, fraudRisk: 0.04,
    description: 'Arabian olibanum. Sacred incense burned from Lisbon to Kyoto.',
    physicalDescription: 'Pale, translucent tears of hardened tree resin',
    color: '#c9b87a', icon: '△',
    iconImage: '/wares/frankincense_icon.png',
    commonSubstitute: 'Myrrh',
  },
  'Myrrh': {
    id: 'Myrrh', tier: 2,
    basePrice: [22, 55], weight: 1,
    spoilable: false, breakable: false, fraudRisk: 0.04,
    description: 'Resinous gum from Arabia and the Horn of Africa. Medicine and incense.',
    physicalDescription: 'Rough, reddish-brown nuggets of bitter aromatic gum',
    color: '#a07040', icon: '▽',
    iconImage: '/wares/myrrh_icon.png',
  },
  'Rhubarb': {
    id: 'Rhubarb', tier: 2,
    basePrice: [25, 60], weight: 1,
    spoilable: false, breakable: false, fraudRisk: 0.08,
    description: '"China rhubarb" — one of the most valued materia medica in European pharmacies.',
    physicalDescription: 'Thick dried root slices, yellow inside, with a bitter purgative taste',
    color: '#c62828', icon: '⌠',
    iconImage: '/wares/rhubarb_root_icon.png',
    commonSubstitute: 'China Root',
  },
  'China Root': {
    id: 'China Root', tier: 2,
    basePrice: [20, 50], weight: 1,
    spoilable: false, breakable: false, fraudRisk: 0.06,
    description: 'Smilax china. Prized as a cure for the French disease. Major Chinese export.',
    physicalDescription: 'Knotty tubers with reddish skin, sold as a medicinal cure',
    color: '#8d6e63', icon: '⌡',
    iconImage: '/wares/china_root_icon.png',
  },
  'Cassia Fistula': {
    id: 'Cassia Fistula', tier: 2,
    basePrice: [8, 18], weight: 1,
    spoilable: false, breakable: false, fraudRisk: 0,
    description: 'Indian purgative. Black pods prized in European and Islamic medicine.',
    physicalDescription: 'Long, dark, cylindrical pods with a sweet-smelling pulp',
    color: '#6d5c3a', icon: '⌐',
    iconImage: '/wares/cassia_fistula_icon.png',
  },
  'Aloes': {
    id: 'Aloes', tier: 2,
    basePrice: [22, 55], weight: 1,
    spoilable: false, breakable: false, fraudRisk: 0,
    description: 'Aloeswood and agarwood. Precious aromatic resin.',
    physicalDescription: 'Dark, dense, resinous wood that smells sweet when heated',
    color: '#795548', icon: '❦',
    iconImage: '/wares/aloes_icon.png',
  },
  'Musk': {
    id: 'Musk', tier: 2,
    basePrice: [30, 80], weight: 1,
    spoilable: false, breakable: false, fraudRisk: 0.10,
    description: 'Tibetan musk deer pods. Perfumery and medicine. Often faked.',
    physicalDescription: 'Leathery dried pods containing a dark, powerfully scented paste',
    color: '#9c27b0', icon: '❋',
    iconImage: '/wares/musk_icon.png',
  },
  'Quicksilver': {
    id: 'Quicksilver', tier: 2,
    basePrice: [25, 55], weight: 2,
    spoilable: false, breakable: false, fraudRisk: 0,
    description: 'Mercury. Essential for amalgamation, medicine, and alchemy. Heavy and dangerous.',
    physicalDescription: 'A heavy sealed flask of shimmering liquid metal',
    color: '#b0bec5', icon: '☿',
    iconImage: '/wares/quicksilver_icon.png',
  },
  'Sassafras': {
    id: 'Sassafras', tier: 2,
    basePrice: [14, 38], weight: 1,
    spoilable: false, breakable: false, fraudRisk: 0.04,
    description: 'Aromatic root bark from Virginia. Sold in European apothecaries as a treatment for syphilis and a general tonic. The main export of early Jamestown.',
    physicalDescription: 'Reddish-brown dried root bark with a sweet, rooty smell',
    color: '#9a5b3a', icon: '⚶',
    iconImage: '/wares/sassafras_icon.png',
  },
  'Tamarind': {
    id: 'Tamarind', tier: 2,
    basePrice: [5, 12], weight: 1,
    spoilable: true, breakable: false, fraudRisk: 0,
    description: 'Sour fruit used as food preservative and medicine across the Indian Ocean.',
    physicalDescription: 'Sticky brown pulp in brittle pods, powerfully sour',
    color: '#8d6e4c', icon: '⌓',
    iconImage: '/wares/tamarind_icon.png',
  },

  // ── Tier 3: Staples & Trade Goods ──
  'Indigo': {
    id: 'Indigo', tier: 3,
    basePrice: [18, 45], weight: 1,
    spoilable: false, breakable: false, fraudRisk: 0,
    description: 'Gujarat dye. Insatiable European demand.',
    physicalDescription: 'Dense cakes of deep blue dye that stain the fingers',
    color: '#3f51b5', icon: '◆',
    iconImage: '/wares/indigo_icon.png',
  },
  'Iron': {
    id: 'Iron', tier: 3,
    basePrice: [4, 10], weight: 2,
    spoilable: false, breakable: false, fraudRisk: 0,
    description: 'Bar iron and steel. High demand in East Africa and Southeast Asia.',
    physicalDescription: 'Rough bars of grey metal',
    color: '#7a8a9a', icon: '⚒',
    iconImage: '/wares/iron_icon.png',
  },
  'Timber': {
    id: 'Timber', tier: 3,
    basePrice: [3, 8], weight: 2,
    spoilable: false, breakable: false, fraudRisk: 0,
    description: 'Teak and hardwoods from Malabar. Essential for ship repair.',
    physicalDescription: 'Heavy planks of dark, close-grained wood',
    color: '#8B6914', icon: '≡',
    iconImage: '/wares/timber_icon.png',
  },
  'Sugar': {
    id: 'Sugar', tier: 3,
    basePrice: [6, 15], weight: 1,
    spoilable: true, breakable: false, fraudRisk: 0,
    description: 'Increasingly important commodity. Bengal and Southeast Asian production.',
    physicalDescription: 'Coarse brown crystals with an intensely sweet taste',
    color: '#f5f0e0', icon: '⬡',
    iconImage: '/wares/sugar_icon.png',
  },
  'Ivory': {
    id: 'Ivory', tier: 3,
    basePrice: [20, 50], weight: 2,
    spoilable: false, breakable: false, fraudRisk: 0,
    description: 'East African elephant tusks. Heavy but always in demand.',
    physicalDescription: 'Heavy curved tusks of creamy white bone-like material',
    color: '#faf0e6', icon: '⌒',
    iconImage: '/wares/ivory_icon.png',
  },
  'Chinese Porcelain': {
    id: 'Chinese Porcelain', tier: 3,
    basePrice: [20, 60], weight: 2,
    spoilable: false, breakable: true, fraudRisk: 0,
    description: 'Blue-and-white kraak ware from Jingdezhen. Fragile cargo.',
    physicalDescription: 'Delicate vessels of thin white ceramic painted in blue',
    color: '#4fc3f7', icon: '⚱',
    iconImage: '/wares/chinese_porcelain_icon.png',
  },
  'Pearls': {
    id: 'Pearls', tier: 3,
    basePrice: [25, 65], weight: 1,
    spoilable: false, breakable: false, fraudRisk: 0,
    description: 'Persian Gulf pearls. Hormuz and Muscat specialties.',
    physicalDescription: 'Lustrous white spheres harvested from oyster shells',
    color: '#e0d6cc', icon: '○',
    iconImage: '/wares/pearls_icon.png',
  },
  'Red Coral': {
    id: 'Red Coral', tier: 3,
    basePrice: [25, 60], weight: 1,
    spoilable: false, breakable: true, fraudRisk: 0,
    description: 'Mediterranean coral, traded into India for jewelry and medicine. Fragile.',
    physicalDescription: 'Branching formations of vivid red marine growth',
    color: '#e53935', icon: '⌗',
    iconImage: '/wares/red_coral_icon.png',
  },
  'Rose Water': {
    id: 'Rose Water', tier: 3,
    basePrice: [12, 30], weight: 1,
    spoilable: false, breakable: true, fraudRisk: 0,
    description: 'Persian distillation. Perfumery, cooking, and medicine. Bottles break easily.',
    physicalDescription: 'Stoppered glass bottles of clear, floral-scented liquid',
    color: '#f48fb1', icon: '✾',
    iconImage: '/wares/rose_water_icon.png',
  },

  // ── Tier 4: Precious Rarities ──
  'Ambergris': {
    id: 'Ambergris', tier: 4,
    basePrice: [50, 150], weight: 1,
    spoilable: false, breakable: false, fraudRisk: 0.10,
    description: 'Whale secretion. Perfume fixative and medicine. Often counterfeited.',
    physicalDescription: 'A waxy grey-black lump with a strange, sweet marine odor',
    color: '#b8860b', icon: '◈',
    iconImage: '/wares/amber_icon.png',
    commonSubstitute: 'Benzoin',
  },
  'Bezoar Stones': {
    id: 'Bezoar Stones', tier: 4,
    basePrice: [80, 200], weight: 1,
    spoilable: false, breakable: false, fraudRisk: 0.20,
    description: 'Calcified stomach stones. Believed to be universal antidote. Frequently faked.',
    physicalDescription: 'Smooth, layered stones found inside animal stomachs',
    color: '#a1887f', icon: '◎',
    iconImage: '/wares/bezoar_stone_icon.png',
    commonSubstitute: 'Horn',
  },
  'Bhang': {
    id: 'Bhang', tier: 4,
    basePrice: [35, 80], weight: 1,
    spoilable: true, breakable: false, fraudRisk: 0,
    description: 'Cannabis preparation. Appears unpredictably at market.',
    physicalDescription: 'A pungent green paste made from crushed leaves and flowers',
    color: '#558b2f', icon: '✽',
    iconImage: '/wares/bhang_icon.png',
  },
  "Dragon's Blood": {
    id: "Dragon's Blood", tier: 4,
    basePrice: [40, 90], weight: 1,
    spoilable: false, breakable: false, fraudRisk: 0.08,
    description: "Deep red resin from Socotra's dragon trees. Dye, varnish, and medicine.",
    physicalDescription: 'Deep crimson resin that shatters like glass when struck',
    color: '#b71c1c', icon: '⬥',
    iconImage: '/wares/dragons_blood_icon.png',
    commonSubstitute: 'Myrrh',
  },
  'Virginia Tobacco': {
    id: 'Virginia Tobacco', tier: 4,
    basePrice: [60, 160], weight: 1,
    spoilable: true, breakable: false, fraudRisk: 0.05,
    description: 'Rolfe\'s experimental Spanish-seed crop, first planted at Jamestown in 1612. Milder and sweeter than Caribbean leaf; a curiosity in London apothecaries.',
    physicalDescription: 'Small bundles of cured leaves, paler and finer than common tobacco',
    color: '#a78a5c', icon: '⌘',
    iconImage: '/wares/virginia_tobacco_icon.png',
  },

  // ── Tier 5: Extraordinary ──
  'Mumia': {
    id: 'Mumia', tier: 5,
    basePrice: [120, 300], weight: 1,
    spoilable: false, breakable: false, fraudRisk: 0.35,
    description: '"Egyptian mummy" — prized drug in European and Islamic medicine. Most is fake bitumen.',
    physicalDescription: 'Dark, tarry substance sold as ancient embalming material',
    color: '#4e342e', icon: '☥',
    iconImage: '/wares/mumia_icon.png',
  },
  'Lapis de Goa': {
    id: 'Lapis de Goa', tier: 5,
    basePrice: [150, 400], weight: 1,
    spoilable: false, breakable: false, fraudRisk: 0,
    description: 'Artificial bezoar made by Jesuits. Gold leaf, gemstone dust, and secret ingredients.',
    physicalDescription: 'A gilded ball stamped with a cross, said to cure any poison',
    color: '#ffd700', icon: '✧',
    iconImage: '/wares/lapis_de_goa_icon.png',
  },

  // ── Non-tradable (provisions/supplies, not shown in market) ──
  'Rice': {
    id: 'Rice', tier: 3,
    basePrice: [2, 6], weight: 1,
    spoilable: true, breakable: false, fraudRisk: 0,
    description: 'Staple grain. Also consumed as ship provisions.',
    physicalDescription: 'Sacks of pale grain',
    color: '#d4c090', icon: '⁂',
  },
  'Munitions': {
    id: 'Munitions', tier: 3,
    basePrice: [5, 18], weight: 2,
    spoilable: false, breakable: false, fraudRisk: 0,
    description: 'Gunpowder, shot, and small arms. Some ports restrict trade.',
    physicalDescription: 'Barrels of powder and crates of iron shot',
    color: '#78909c', icon: '●',
  },
  'Salted Meat': {
    id: 'Salted Meat', tier: 1,
    basePrice: [3, 8], weight: 1,
    spoilable: true, breakable: false, fraudRisk: 0,
    description: 'Cured meat from hunted animals. Feeds the crew on long voyages.',
    physicalDescription: 'Strips of dark, salt-crusted meat in a cloth bundle',
    color: '#7a3a2a', icon: '◫',
  },
  'Hides': {
    id: 'Hides', tier: 3,
    basePrice: [12, 40], weight: 2,
    spoilable: true, breakable: false, fraudRisk: 0.05,
    description: 'Cured animal hides — leather for boots, saddles, jerkins. Steady demand in every port.',
    physicalDescription: 'Stiff, salted hides folded into stacks',
    color: '#8b5a3c', icon: '▤',
  },
  'Wool': {
    id: 'Wool', tier: 1,
    basePrice: [4, 12], weight: 1,
    spoilable: false, breakable: false, fraudRisk: 0,
    description: 'Raw fleece. European staple — Mediterranean and Atlantic ports buy in bulk.',
    physicalDescription: 'Rough cream-coloured fleece, oily and matted',
    color: '#e8dcc8', icon: '☁',
  },
  'Horn': {
    id: 'Horn', tier: 3,
    basePrice: [10, 35], weight: 1,
    spoilable: false, breakable: true, fraudRisk: 0.1,
    description: 'Polished animal horn — used for combs, powder flasks, ornaments. Light cargo, decent margin.',
    physicalDescription: 'Curved, polished horn pieces tied in a bundle',
    color: '#5c4033', icon: '⌒',
  },
};

// ── Ordered list for market/UI display (excludes non-tradable Rice & Munitions) ──
export const ALL_COMMODITIES: Commodity[] = [
  // Tier 1: Spices & Stimulants
  'Black Pepper', 'Cinnamon', 'Cardamom', 'Ginger', 'Coffee', 'Tea',
  'Cloves', 'Nutmeg', 'Saffron', 'Tobacco',
  // Tier 2: Exotic Drugs & Medicines
  'Opium', 'Camphor', 'Benzoin', 'Frankincense', 'Myrrh',
  'Rhubarb', 'China Root', 'Cassia Fistula', 'Aloes', 'Sassafras',
  'Musk', 'Quicksilver', 'Tamarind',
  // Tier 3: Staples & Trade Goods
  'Indigo', 'Iron', 'Timber', 'Sugar',
  'Ivory', 'Chinese Porcelain', 'Pearls', 'Red Coral', 'Rose Water',
  'Hides', 'Wool', 'Horn',
  // Tier 4: Precious Rarities
  'Ambergris', 'Bezoar Stones', 'Bhang', "Dragon's Blood", 'Virginia Tobacco',
  // Tier 5: Extraordinary
  'Mumia', 'Lapis de Goa',
];

// Full list including non-tradable items (for cargo tracking, NPC loot, etc.)
export const ALL_COMMODITIES_FULL: Commodity[] = [
  ...ALL_COMMODITIES,
  'Rice', 'Munitions', 'Salted Meat',
];

export const TIER_LABELS: Record<CommodityTier, string> = {
  1: 'Spices & Stimulants',
  2: 'Exotic Drugs & Medicines',
  3: 'Staples & Trade Goods',
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
    trades:   ['Iron', 'Aloes', 'Munitions', 'Sugar'],
    demands:  ['Chinese Porcelain', 'Cloves', 'Nutmeg', 'Tea', 'Pearls', 'Musk', 'Ivory',
               'Red Coral', 'Rose Water', 'Quicksilver', 'Saffron'],
  },
  goa: {
    produces: ['Lapis de Goa', 'Black Pepper', 'Rice'],
    trades:   ['Opium', 'Iron', 'Munitions', 'Indigo', 'Cinnamon', 'Timber',
               'Bezoar Stones', 'Cardamom', 'Ginger', 'Tamarind', 'Cassia Fistula',
               'Tobacco', 'Quicksilver', 'Red Coral', 'Sugar'],
    demands:  ['Cloves', 'Nutmeg', 'Chinese Porcelain', 'Musk', 'Tea',
               'Ambergris', 'Mumia', 'Camphor', 'Saffron', 'Rhubarb', 'China Root'],
  },
  surat: {
    produces: ['Indigo', 'Opium', 'Rice', 'Sugar'],
    trades:   ['Iron', 'Black Pepper', 'Cardamom', 'Munitions', 'Timber', 'Bezoar Stones',
               'Ginger', 'Saffron', 'Rose Water', 'Tamarind'],
    demands:  ['Cloves', 'Nutmeg', 'Chinese Porcelain', 'Tea', 'Musk', 'Ivory', 'Coffee',
               'Camphor', 'Rhubarb', 'China Root', 'Frankincense'],
  },
  diu: {
    produces: ['Indigo'],
    trades:   ['Opium', 'Iron', 'Munitions', 'Black Pepper', 'Rice', 'Sugar',
               'Rose Water'],
    demands:  ['Cloves', 'Nutmeg', 'Chinese Porcelain', 'Tea', 'Pearls', 'Coffee',
               'Camphor', 'Saffron', 'Rhubarb'],
  },
  hormuz: {
    produces: ['Pearls', 'Rose Water'],
    trades:   ['Iron', 'Black Pepper', 'Cinnamon', 'Indigo', 'Munitions',
               'Musk', 'Opium', 'Bezoar Stones', 'Coffee', 'Ambergris',
               'Saffron', 'Frankincense', 'Myrrh', 'Red Coral', 'Rhubarb'],
    demands:  ['Timber', 'Rice', 'Cloves', 'Nutmeg', 'Chinese Porcelain', 'Ivory',
               'Tea', 'Mumia', 'Camphor', 'Quicksilver', 'China Root'],
  },
  muscat: {
    produces: ['Pearls', 'Ambergris', 'Frankincense'],
    trades:   ['Iron', 'Aloes', 'Munitions', 'Coffee',
               'Rose Water', 'Myrrh'],
    demands:  ['Black Pepper', 'Cloves', 'Chinese Porcelain', 'Timber', 'Rice', 'Ivory',
               'Saffron', 'Camphor', 'Rhubarb'],
  },
  mocha: {
    produces: ['Coffee'],
    trades:   ['Mumia', 'Ambergris', 'Iron', 'Aloes', 'Frankincense', 'Myrrh',
               'Red Coral'],
    demands:  ['Black Pepper', 'Cloves', 'Chinese Porcelain', 'Rice',
               'Indigo', 'Nutmeg', 'Ivory', 'Munitions', 'Sugar', 'Tobacco',
               'Saffron', 'Camphor'],
  },
  aden: {
    produces: ['Coffee', 'Frankincense', 'Myrrh'],
    trades:   ['Mumia', 'Ivory', 'Iron', 'Aloes', 'Ambergris'],
    demands:  ['Black Pepper', 'Cloves', 'Chinese Porcelain', 'Rice',
               'Indigo', 'Nutmeg', 'Munitions', 'Musk', 'Sugar', 'Tobacco',
               'Camphor', 'Rhubarb'],
  },
  zanzibar: {
    produces: ['Ivory', 'Ambergris'],
    trades:   ['Aloes', 'Rice', 'Tamarind', 'Frankincense'],
    demands:  ['Iron', 'Munitions', 'Black Pepper', 'Chinese Porcelain',
               'Bezoar Stones', 'Opium', 'Cloves', 'Sugar', 'Tobacco',
               'Red Coral', 'Quicksilver'],
  },
  mombasa: {
    produces: ['Ivory'],
    trades:   ['Iron', 'Rice', 'Ambergris', 'Aloes', 'Frankincense', 'Myrrh'],
    demands:  ['Munitions', 'Chinese Porcelain', 'Black Pepper',
               'Cloves', 'Opium', 'Bezoar Stones', 'Sugar', 'Tobacco',
               'Red Coral', 'Quicksilver'],
  },
  socotra: {
    produces: ['Aloes', 'Ambergris', "Dragon's Blood"],
    trades:   ['Frankincense', 'Myrrh'],
    demands:  ['Rice', 'Iron', 'Munitions', 'Black Pepper', 'Tea',
               'Sugar'],
  },
  malacca: {
    // Transshipment hub for Maluku spices, not a production site — cloves/nutmeg
    // are here as `trades` (0.8–1.2×) so Bantam remains the cheap source.
    produces: ['Aloes', 'Timber', 'Camphor', 'Benzoin'],
    trades:   ['Cloves', 'Nutmeg', 'Black Pepper', 'Tea', 'Rice', 'Iron', 'Munitions',
               'Opium', 'Bhang', 'Ginger', 'Sugar', 'Tobacco', 'China Root'],
    demands:  ['Indigo', 'Bezoar Stones', 'Ivory', 'Coffee',
               'Pearls', 'Musk', 'Saffron', 'Red Coral', 'Quicksilver',
               'Frankincense', 'Rose Water'],
  },
  bantam: {
    produces: ['Cloves', 'Nutmeg', 'Rice', 'Timber', 'Camphor', 'Benzoin', 'Sugar'],
    trades:   ['Black Pepper', 'Aloes', 'Iron', 'Bhang', 'Ginger', 'Tobacco'],
    demands:  ['Indigo', 'Chinese Porcelain', 'Opium', 'Munitions',
               'Ivory', 'Pearls', 'Musk', 'Coffee', 'Saffron', 'Red Coral',
               'Quicksilver', 'Frankincense', 'Rose Water'],
  },
  macau: {
    produces: ['Chinese Porcelain', 'Tea', 'Musk', 'Rhubarb', 'China Root'],
    trades:   ['Bhang', 'Iron', 'Munitions', 'Aloes', 'Sugar',
               'Tobacco', 'Quicksilver', 'Camphor'],
    demands:  ['Black Pepper', 'Cloves', 'Nutmeg', 'Opium', 'Bezoar Stones',
               'Cinnamon', 'Ivory', 'Coffee', 'Ambergris', 'Saffron',
               'Frankincense', 'Red Coral', 'Rose Water'],
  },
  // ── European terminal markets ──
  london: {
    produces: ['Iron', 'Timber'],
    trades:   ['Indigo', 'Munitions', 'Rice', 'Aloes'],
    demands:  ['Black Pepper', 'Cloves', 'Nutmeg', 'Cinnamon', 'Chinese Porcelain',
               'Tea', 'Coffee', 'Tobacco', 'Virginia Tobacco', 'Sugar',
               'Sassafras', 'Opium', 'Ambergris', 'Musk', 'Saffron', 'Pearls',
               'Rose Water', 'Mumia'],
  },
  // ── Jamestown — 1612 English colony, accessible only from London ──
  // Tiny, precarious, ~300 people. Rolfe's first tobacco crop planted this year;
  // sassafras is the main existing export. Demands everything.
  jamestown: {
    produces: ['Sassafras', 'Timber', 'Virginia Tobacco', 'Tobacco'],
    trades:   [],
    demands:  ['Iron', 'Munitions', 'Sugar', 'Rice',
               'Cinnamon', 'Black Pepper', 'Aloes', 'Quicksilver',
               'Indigo', 'Rose Water'],
  },

  // ── European terminal markets (cont.) ──

  // Lisbon — metropole of the Portuguese Estado da Índia. The endpoint of the
  // Carreira. Produces Iberian iron, wool, munitions (royal arsenal). Trades
  // Brazilian and Mediterranean goods passing through. Demands every Asian
  // spice and drug at the highest prices in the game.
  lisbon: {
    produces: ['Iron', 'Wool', 'Munitions', 'Hides'],
    trades:   ['Tobacco', 'Sugar', 'Cassia Fistula', 'Red Coral', 'Rose Water',
               'Tamarind', 'Timber'],
    demands:  ['Black Pepper', 'Cinnamon', 'Cloves', 'Nutmeg', 'Ginger',
               'Chinese Porcelain', 'Tea', 'Coffee', 'Musk', 'Saffron',
               'Opium', 'Ambergris', 'Mumia', 'Bezoar Stones', 'Rhubarb',
               'China Root', 'Camphor', 'Benzoin', 'Frankincense', 'Myrrh',
               'Pearls', 'Indigo', 'Sassafras', 'Virginia Tobacco'],
  },

  // Amsterdam — VOC headquarters, rising challenger to the Portuguese. Strong
  // appetite for fine spices (their main trade focus). Produces Dutch cloth
  // and munitions. Somewhat hostile to Iberian flags (gameplay reputation).
  amsterdam: {
    produces: ['Iron', 'Wool', 'Munitions', 'Hides'],
    trades:   ['Indigo', 'Sugar', 'Tobacco', 'Timber', 'Tamarind'],
    demands:  ['Cloves', 'Nutmeg', 'Black Pepper', 'Cinnamon', 'Ginger',
               'Chinese Porcelain', 'Tea', 'Coffee', 'Camphor', 'Benzoin',
               'Musk', 'Saffron', 'Rhubarb', 'China Root', 'Opium',
               'Pearls', 'Ambergris', 'Frankincense', 'Rose Water',
               'Virginia Tobacco'],
  },

  // Seville — Spanish Atlantic gateway. Almadén mercury funnels through here
  // on its way to New Spain's silver amalgamation mines — historically the
  // defining local export. Demands Asian luxuries for Atlantic re-export.
  seville: {
    produces: ['Quicksilver', 'Wool', 'Iron', 'Munitions'],
    trades:   ['Tobacco', 'Sugar', 'Red Coral', 'Timber', 'Hides'],
    demands:  ['Black Pepper', 'Cinnamon', 'Cloves', 'Nutmeg', 'Chinese Porcelain',
               'Rose Water', 'Saffron', 'Ambergris', 'Musk', 'Cassia Fistula',
               'Mumia', 'Bezoar Stones', 'Rhubarb', 'Pearls', 'Indigo'],
  },

  // ── Other Indian Ocean / Spice Islands (cont.) ──

  // Cochin — Portuguese-controlled Malabar port, the original Estado foothold
  // before Goa eclipsed it. Still a major pepper and cardamom producer.
  cochin: {
    produces: ['Black Pepper', 'Cardamom', 'Ginger', 'Cassia Fistula', 'Timber',
               'Rice', 'Tamarind'],
    trades:   ['Cinnamon', 'Iron', 'Munitions', 'Aloes', 'Sugar'],
    demands:  ['Chinese Porcelain', 'Cloves', 'Nutmeg', 'Musk', 'Saffron',
               'Red Coral', 'Rose Water', 'Tea', 'Quicksilver'],
  },

  // Aceh — powerful Sumatran sultanate, a major pepper producer and a
  // challenger to the Portuguese. Home of camphor and benzoin.
  aceh: {
    produces: ['Black Pepper', 'Camphor', 'Benzoin', 'Timber', 'Rice'],
    trades:   ['Ginger', 'Aloes', 'Sugar', 'Bhang'],
    demands:  ['Indigo', 'Chinese Porcelain', 'Iron', 'Munitions', 'Opium',
               'Rose Water', 'Saffron', 'Red Coral', 'Tea', 'Ivory'],
  },

  // ── East African Swahili coast (cont.) ──

  // Mogadishu — Somali Swahili port. Historically a major producer of
  // frankincense and myrrh (Horn of Africa), plus ambergris from the beaches.
  mogadishu: {
    produces: ['Frankincense', 'Myrrh', 'Ivory', 'Ambergris'],
    trades:   ['Aloes', 'Hides', 'Tamarind', 'Rice'],
    demands:  ['Black Pepper', 'Chinese Porcelain', 'Iron', 'Munitions',
               'Indigo', 'Cloves', 'Sugar', 'Red Coral', 'Opium'],
  },

  // Kilwa — once the greatest city of the Swahili coast, in decline by 1612
  // under Portuguese rule. Ivory trade persists. Sparser market, shadier feel.
  kilwa: {
    produces: ['Ivory'],
    trades:   ['Ambergris', 'Aloes', 'Tamarind', 'Hides', 'Rice'],
    demands:  ['Black Pepper', 'Iron', 'Munitions', 'Chinese Porcelain',
               'Sugar', 'Red Coral', 'Indigo', 'Cloves'],
  },

  // ── West Africa ──

  // Elmina — Portuguese São Jorge da Mina on the Gold Coast. Iron had
  // astonishing demand in West African trade; Akan hinterland supplied hides,
  // horn, and forest products traded to the fort.
  elmina: {
    produces: ['Hides', 'Horn', 'Ivory', 'Timber'],
    trades:   ['Tamarind', 'Rice'],
    demands:  ['Iron', 'Munitions', 'Sugar', 'Indigo', 'Red Coral',
               'Rose Water', 'Cassia Fistula', 'Black Pepper', 'Cinnamon',
               'Wool'],
  },

  // Luanda — Portuguese São Paulo de Luanda in Angola. Ivory, wax, and
  // forest products traded inland. Iron and textiles in high demand.
  luanda: {
    produces: ['Ivory', 'Hides', 'Horn', 'Timber'],
    trades:   ['Tamarind', 'Aloes', 'Rice'],
    demands:  ['Iron', 'Munitions', 'Sugar', 'Wool', 'Indigo', 'Red Coral',
               'Black Pepper', 'Cinnamon', 'Cassia Fistula'],
  },

  // ── Atlantic Americas ──

  // Salvador da Bahia — capital of Portuguese Brazil, the engine of the
  // early sugar trade. Brazilian tobacco is also in ascendancy.
  salvador: {
    produces: ['Sugar', 'Tobacco', 'Timber', 'Hides'],
    trades:   ['Tamarind', 'Rice'],
    demands:  ['Iron', 'Munitions', 'Wool', 'Cinnamon', 'Black Pepper',
               'Red Coral', 'Cassia Fistula', 'Chinese Porcelain',
               'Rose Water', 'Opium', 'Quicksilver', 'Indigo'],
  },

  // Havana — Spanish treasure-fleet staging point. Cuban tobacco is already
  // famous in 1612. Hides and sugar also abundant; a busy re-export hub.
  havana: {
    produces: ['Tobacco', 'Sugar', 'Hides'],
    trades:   ['Timber', 'Quicksilver', 'Rice'],
    demands:  ['Iron', 'Munitions', 'Wool', 'Cinnamon', 'Black Pepper',
               'Chinese Porcelain', 'Rose Water', 'Saffron', 'Cloves',
               'Red Coral', 'Indigo'],
  },

  // Cartagena de Indias — Spanish fortified port, the transshipment point
  // for Potosí silver coming up from Panama. Quicksilver from Seville passes
  // through here on its way to Peru. Tobacco and sugar from the hinterland.
  cartagena: {
    produces: ['Tobacco', 'Sugar'],
    trades:   ['Hides', 'Timber', 'Quicksilver', 'Rice'],
    demands:  ['Iron', 'Munitions', 'Wool', 'Black Pepper', 'Cinnamon',
               'Chinese Porcelain', 'Red Coral', 'Rose Water', 'Cloves',
               'Cassia Fistula', 'Indigo'],
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

/** Inventory amount based on role — adjusted for new tier layout */
function roleInventory(role: PortTradeRole, tier: CommodityTier, prng: () => number): number {
  // Tier 1 (spices): moderate stock. Tier 2 (drugs): lower stock.
  // Tier 3 (staples): bulk. Tier 4 (rarities): scarce. Tier 5: almost none.
  const base = tier === 3 ? 80 : tier === 1 ? 50 : tier === 2 ? 30 : tier === 4 ? 6 : 2;
  switch (role) {
    case 'produces': return Math.floor(base * (0.6 + prng() * 0.6));   // 60-120% of base
    case 'trades':   return Math.floor(base * (0.2 + prng() * 0.4));   // 20-60% of base
    case 'demands':  return Math.floor(base * prng() * 0.15);          // 0-15% of base (often 0)
  }
}

/** Max tradable goods shown at a port. Ports feel curated, not overwhelming. */
const MAX_PORT_GOODS = 10;

/** Get the trade role for a commodity at a given port */
export function getTradeRole(portId: string, commodity: Commodity): PortTradeRole | null {
  const profile = PORT_TRADE_PROFILES[portId];
  if (!profile) return null;
  if (profile.produces.includes(commodity)) return 'produces';
  if (profile.trades.includes(commodity)) return 'trades';
  if (profile.demands.includes(commodity)) return 'demands';
  return null; // not available at this port
}

/** Generate prices for a port based on its trade profile.
 *  Caps the number of available goods at MAX_PORT_GOODS.
 *  Tier 4/5 rarities only appear ~30% / ~15% of the time. */
export function generatePortPrices(
  portId: string,
  prng: () => number,
): Record<Commodity, number> {
  const prices = {} as Record<Commodity, number>;

  // First pass: determine which goods *could* be available
  const candidates: { commodity: Commodity; price: number; tier: CommodityTier }[] = [];

  for (const commodity of ALL_COMMODITIES_FULL) {
    const def = COMMODITY_DEFS[commodity];
    const role = getTradeRole(portId, commodity);
    if (!role) {
      prices[commodity] = 0;
      continue;
    }

    // Rarities have a chance of not appearing
    if (def.tier === 4 && prng() > 0.30) { prices[commodity] = 0; continue; }
    if (def.tier === 5 && prng() > 0.15) { prices[commodity] = 0; continue; }

    const [minP, maxP] = def.basePrice;
    const midPrice = (minP + maxP) / 2;
    const mult = roleMultiplier(role, prng);
    const price = Math.max(1, Math.round(midPrice * mult));

    candidates.push({ commodity, price, tier: def.tier });
  }

  // Cap at MAX_PORT_GOODS: prioritize lower tiers (more interesting goods first)
  // Sort by tier (spices/drugs first), then randomly within tier
  candidates.sort((a, b) => a.tier - b.tier || prng() - 0.5);
  const selected = candidates.slice(0, MAX_PORT_GOODS);
  const selectedSet = new Set(selected.map(s => s.commodity));

  // Write prices: selected goods get their price, rest get 0
  for (const commodity of ALL_COMMODITIES_FULL) {
    if (!selectedSet.has(commodity)) {
      prices[commodity] = prices[commodity] ?? 0;
    }
  }
  for (const s of selected) {
    prices[s.commodity] = s.price;
  }

  return prices;
}

/** Generate inventory for a port based on its trade profile */
export function generatePortInventory(
  portId: string,
  prng: () => number,
): Record<Commodity, number> {
  const inventory = {} as Record<Commodity, number>;

  for (const commodity of ALL_COMMODITIES_FULL) {
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
    'Cloves', 'Nutmeg', 'Indigo',
  ],
  Dutch: [
    'Iron', 'Munitions', 'Rice', 'Timber',
    'Black Pepper', 'Cloves', 'Nutmeg', 'Cinnamon',
    'Indigo', 'Sugar', 'Camphor',
  ],
  Portuguese: [
    'Munitions', 'Iron', 'Rice', 'Timber',
    'Black Pepper', 'Cinnamon', 'Ginger', 'Sugar',
    'Opium', 'Red Coral', 'Quicksilver',
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
    'Indigo',
  ],
  Danish: [
    'Iron', 'Munitions', 'Rice', 'Timber',
    'Black Pepper', 'Tea', 'Sugar',
  ],
  Gujarati: [
    'Rice', 'Indigo', 'Sugar',
    'Black Pepper', 'Cardamom', 'Ginger', 'Tamarind', 'Cassia Fistula',
    'Opium', 'Bezoar Stones', 'Rose Water', 'Saffron',
  ],
  Mughal: [
    'Rice', 'Indigo', 'Iron', 'Sugar',
    'Black Pepper', 'Cardamom', 'Opium', 'Saffron',
    'Rose Water', 'Bezoar Stones',
  ],
  Ottoman: [
    'Coffee', 'Rice', 'Iron', 'Munitions',
    'Frankincense', 'Myrrh', 'Rose Water', 'Saffron',
    'Red Coral',
  ],
  Persian: [
    'Rose Water', 'Saffron', 'Pearls', 'Rice',
    'Iron', 'Coffee',
    'Frankincense', 'Myrrh', 'Bezoar Stones',
  ],
  Omani: [
    'Frankincense', 'Pearls', 'Rice', 'Iron',
    'Coffee', 'Myrrh', 'Ambergris',
  ],
  Swahili: [
    'Ivory', 'Rice', 'Iron',
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
  'Rice', 'Iron', 'Timber', 'Munitions',
  'Black Pepper', 'Cinnamon', 'Sugar',
];

// Draw weight by tier — spices & drugs most likely in starting cargo
const TIER_DRAW_WEIGHT: Record<CommodityTier, number> = {
  1: 10,  // spices — common
  2: 7,   // drugs — moderate
  3: 5,   // staples — moderate (bulk trade goods)
  4: 1,   // rarities — very unlikely
  5: 0,   // never start with tier 5
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
    ALL_COMMODITIES_FULL.map(c => [c, 0])
  ) as Record<Commodity, number>;

  const targetWeight = Math.floor(cargoCapacity * 0.5);
  const pool = FACTION_CARGO_POOLS[faction] ?? DEFAULT_CARGO_POOL;

  // Starting hold size varies: 2-8 distinct commodity stacks
  const targetStacks = 2 + Math.floor(Math.random() * 7);
  const stackCount = () => Object.values(cargo).filter(v => v > 0).length;

  // Always start with some Rice and Munitions (these count toward targetStacks)
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
  while (currentWeight < targetWeight && draws < maxDraws && stackCount() < targetStacks) {
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

  // Lucky captain bonus: guaranteed exotic drug (tier 2)
  if (captainLuck >= 11 && currentWeight < targetWeight + 4 && stackCount() < targetStacks) {
    const drugPool = pool.filter(c => {
      const d = COMMODITY_DEFS[c];
      return d && d.tier === 2 && cargo[c] === 0;
    }) as Commodity[];
    if (drugPool.length > 0) {
      const pick = drugPool[Math.floor(Math.random() * drugPool.length)];
      cargo[pick] = Math.max(1, Math.ceil(Math.random() * 2));
    }
  }

  // Very lucky captain: chance of a rarity (tier 4)
  if (captainLuck >= 16 && stackCount() < targetStacks) {
    const rarityPool = pool.filter(c => {
      const d = COMMODITY_DEFS[c];
      return d && d.tier === 4 && cargo[c] === 0;
    }) as Commodity[];
    if (rarityPool.length > 0 && Math.random() < 0.4 + (captainLuck - 16) * 0.1) {
      const pick = rarityPool[Math.floor(Math.random() * rarityPool.length)];
      cargo[pick] = 1;
    }
  }

  return cargo;
}
