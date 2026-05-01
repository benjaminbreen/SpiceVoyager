// ── Commodity definitions for the Indian Ocean trade, c. 1600-1620 ──
//
// Core trade goods + occasional regional items reflecting the real commodity
// networks of the early modern Estado da India and its competitors.

export type Commodity =
  // Tier 1: Spices & Stimulants (shown first)
  | 'Black Pepper' | 'Cinnamon' | 'Cardamom' | 'Coffee' | 'Tea'
  | 'Ginger' | 'Cloves' | 'Nutmeg' | 'Saffron' | 'Tobacco'
  | 'Star Anise'
  // Tier 2: Exotic Drugs & Medicines
  | 'Opium' | 'Camphor' | 'Benzoin' | 'Frankincense' | 'Myrrh'
  | 'Rhubarb' | 'China Root' | 'Cassia Fistula' | 'Aloes' | 'Sassafras'
  | 'Musk' | 'Quicksilver' | 'Tamarind'
  | 'Betel Nut'
  // Tier 3: Staples & Trade Goods
  | 'Indigo' | 'Iron' | 'Timber' | 'Sugar'
  | 'Ivory' | 'Chinese Porcelain' | 'Pearls' | 'Red Coral' | 'Rose Water'
  // Tier 3: Hunted goods
  | 'Hides' | 'Wool' | 'Horn'
  // Tier 4: Precious Rarities
  | 'Ambergris' | 'Bezoar Stones' | 'Bhang' | "Dragon's Blood" | 'Virginia Tobacco'
  | 'Murano Glass' | 'Japanese Silver'
  // Tier 5: Extraordinary
  | 'Mumia' | 'Lapis de Goa' | 'Theriac'
  // Venetian export staples
  | 'Venetian Soap'
  // Provisions & ordnance
  | 'Rice' | 'Small Shot' | 'Cannon Shot' | 'Salted Meat'
  // Special munition: ammo for the fireRocket weapon. Macau is the reliable
  // source; Malacca/Bantam carry small trickle stocks via the Chinese
  // diaspora trade. Capped at 20 per hold — see buyCommodity.
  | 'War Rockets';

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
    basePrice: [12, 28], weight: 1,
    spoilable: false, breakable: false, fraudRisk: 0,
    description: 'The king of spices. Malabar Coast monopoly.',
    physicalDescription: 'Small, hard, wrinkled black drupes with a sharp bite',
    color: '#4a4a4a', icon: '✦',
    iconImage: '/wares/black_pepper_icon.png',
  },
  'Cinnamon': {
    id: 'Cinnamon', tier: 1,
    basePrice: [18, 42], weight: 1,
    spoilable: false, breakable: false, fraudRisk: 0.06,
    description: 'Ceylon bark. Often adulterated with cassia.',
    physicalDescription: 'Rolled quills of fragrant reddish bark',
    color: '#c47a3a', icon: '⌇',
    iconImage: '/wares/cinnamon_icon.png',
    commonSubstitute: 'Cassia Fistula',
  },
  'Cardamom': {
    id: 'Cardamom', tier: 1,
    basePrice: [18, 45], weight: 1,
    spoilable: false, breakable: false, fraudRisk: 0,
    description: 'From the hills of Malabar. Traded alongside pepper.',
    physicalDescription: 'Small green pods containing aromatic seeds',
    color: '#7cb342', icon: '❧',
    iconImage: '/wares/cardamom_icon.png',
  },
  'Coffee': {
    id: 'Coffee', tier: 1,
    basePrice: [14, 34], weight: 1,
    spoilable: true, breakable: false, fraudRisk: 0,
    description: 'Mocha monopoly. Demand rising rapidly across the Indian Ocean world.',
    physicalDescription: 'Dark roasted berries with a bitter, stimulating smell',
    color: '#5d4037', icon: '♨',
    iconImage: '/wares/coffee_icon.png',
  },
  'Tea': {
    id: 'Tea', tier: 1,
    basePrice: [14, 32], weight: 1,
    spoilable: true, breakable: false, fraudRisk: 0,
    description: 'Chinese leaf, funneled through Macau.',
    physicalDescription: 'Dried, tightly rolled leaves with a grassy scent',
    color: '#66bb6a', icon: '♣',
    iconImage: '/wares/tea_icon.png',
  },
  'Ginger': {
    id: 'Ginger', tier: 1,
    basePrice: [10, 22], weight: 1,
    spoilable: false, breakable: false, fraudRisk: 0,
    description: 'Malabar and Southeast Asian rhizome. Ubiquitous in the spice trade.',
    physicalDescription: 'Knobby pale rhizomes with a fiery, warming taste',
    color: '#e6a830', icon: '⌁',
    iconImage: '/wares/ginger_icon.png',
  },
  'Cloves': {
    id: 'Cloves', tier: 1,
    basePrice: [80, 220], weight: 1,
    spoilable: false, breakable: false, fraudRisk: 0.05,
    description: 'From the Maluku Islands. Available only through Bantam and Malacca.',
    physicalDescription: 'Tiny dried flower buds, dark brown, intensely aromatic',
    color: '#8b4513', icon: '✿',
    iconImage: '/wares/clove_icon.png',
  },
  'Nutmeg': {
    id: 'Nutmeg', tier: 1,
    basePrice: [90, 240], weight: 1,
    spoilable: false, breakable: false, fraudRisk: 0.06,
    description: 'Banda Islands product. Astronomical markup far from source.',
    physicalDescription: 'Hard brown ovoid seeds with a warm, sweet fragrance',
    color: '#d4a574', icon: '◉',
    iconImage: '/wares/nutmeg_icon.png',
  },
  'Saffron': {
    id: 'Saffron', tier: 1,
    basePrice: [100, 260], weight: 1,
    spoilable: false, breakable: false, fraudRisk: 0.12,
    description: 'Persian and Kashmiri crocus stamens. Worth more than gold by weight. Often adulterated.',
    physicalDescription: 'Tiny crimson threads that stain water brilliant yellow',
    color: '#ff8f00', icon: '❈',
    iconImage: '/wares/saffron_icon.png',
  },
  'Tobacco': {
    id: 'Tobacco', tier: 1,
    basePrice: [16, 38], weight: 1,
    spoilable: true, breakable: false, fraudRisk: 0,
    description: 'New World plant just arriving in the Indian Ocean. Demand spreading fast.',
    physicalDescription: 'Bundles of large dried leaves with an acrid smell',
    color: '#7c6b4f', icon: '⌘',
    iconImage: '/wares/tobacco_icon.png',
  },
  // Chinese spice and stomachic medicine, distinct from European aniseed.
  // 1612 is the period when Star Anise begins flowing east on the Manila
  // galleon to Mexico and onward to Spain, where it becomes the basis of
  // anisette cordials and digestive remedies.
  'Star Anise': {
    id: 'Star Anise', tier: 1,
    basePrice: [24, 60], weight: 1,
    spoilable: false, breakable: false, fraudRisk: 0.04,
    description: 'Chinese spice and stomachic. Funneled through Manila on the galleon trade. Distinct from European aniseed.',
    physicalDescription: 'Dark eight-pointed pods, intensely fragrant of licorice and warm bark',
    color: '#7a3a1c', icon: '✺',
  },

  // ── Tier 2: Exotic Drugs & Medicines ──
  'Opium': {
    id: 'Opium', tier: 2,
    basePrice: [60, 150], weight: 1,
    spoilable: false, breakable: false, fraudRisk: 0,
    description: 'Cambay product. Portuguese carry it eastward. Some factions disapprove.',
    physicalDescription: 'Dark, sticky paste scraped from seed pods, with a heavy smell',
    color: '#880e4f', icon: '❀',
    iconImage: '/wares/opium_icon.png',
  },
  'Camphor': {
    id: 'Camphor', tier: 2,
    basePrice: [35, 85], weight: 1,
    spoilable: false, breakable: false, fraudRisk: 0.05,
    description: 'Bornean camphor, far superior to the Chinese variety. Medicine and ritual.',
    physicalDescription: 'Waxy white crystals with a sharp, penetrating smell',
    color: '#b0c4de', icon: '◇',
    iconImage: '/wares/camphor_icon.png',
    commonSubstitute: 'Benzoin',
  },
  'Benzoin': {
    id: 'Benzoin', tier: 2,
    basePrice: [25, 65], weight: 1,
    spoilable: false, breakable: false, fraudRisk: 0,
    description: 'Sumatran aromatic resin. Burned as incense and used in medicine.',
    physicalDescription: 'Brittle chunks of amber-colored resin with a vanilla scent',
    color: '#9e7c5c', icon: '◐',
    iconImage: '/wares/benzoin_icon.png',
  },
  'Frankincense': {
    id: 'Frankincense', tier: 2,
    basePrice: [28, 70], weight: 1,
    spoilable: false, breakable: false, fraudRisk: 0.04,
    description: 'Arabian olibanum. Sacred incense burned from Lisbon to Kyoto.',
    physicalDescription: 'Pale, translucent tears of hardened tree resin',
    color: '#c9b87a', icon: '△',
    iconImage: '/wares/frankincense_icon.png',
    commonSubstitute: 'Myrrh',
  },
  'Myrrh': {
    id: 'Myrrh', tier: 2,
    basePrice: [30, 75], weight: 1,
    spoilable: false, breakable: false, fraudRisk: 0.04,
    description: 'Resinous gum from Arabia and the Horn of Africa. Medicine and incense.',
    physicalDescription: 'Rough, reddish-brown nuggets of bitter aromatic gum',
    color: '#a07040', icon: '▽',
    iconImage: '/wares/myrrh_icon.png',
  },
  'Rhubarb': {
    id: 'Rhubarb', tier: 2,
    basePrice: [45, 110], weight: 1,
    spoilable: false, breakable: false, fraudRisk: 0.08,
    description: '"China rhubarb" — one of the most valued materia medica in European pharmacies.',
    physicalDescription: 'Thick dried root slices, yellow inside, with a bitter purgative taste',
    color: '#c62828', icon: '⌠',
    iconImage: '/wares/rhubarb_root_icon.png',
    commonSubstitute: 'China Root',
  },
  'China Root': {
    id: 'China Root', tier: 2,
    basePrice: [35, 90], weight: 1,
    spoilable: false, breakable: false, fraudRisk: 0.06,
    description: 'Smilax china. Prized as a cure for the French disease. Major Chinese export.',
    physicalDescription: 'Knotty tubers with reddish skin, sold as a medicinal cure',
    color: '#8d6e63', icon: '⌡',
    iconImage: '/wares/china_root_icon.png',
  },
  'Cassia Fistula': {
    id: 'Cassia Fistula', tier: 2,
    basePrice: [12, 28], weight: 1,
    spoilable: false, breakable: false, fraudRisk: 0,
    description: 'Indian purgative. Black pods prized in European and Islamic medicine.',
    physicalDescription: 'Long, dark, cylindrical pods with a sweet-smelling pulp',
    color: '#6d5c3a', icon: '⌐',
    iconImage: '/wares/cassia_fistula_icon.png',
  },
  'Aloes': {
    id: 'Aloes', tier: 2,
    basePrice: [45, 120], weight: 1,
    spoilable: false, breakable: false, fraudRisk: 0,
    description: 'Aloeswood and agarwood. Precious aromatic resin.',
    physicalDescription: 'Dark, dense, resinous wood that smells sweet when heated',
    color: '#795548', icon: '❦',
    iconImage: '/wares/aloes_icon.png',
  },
  'Musk': {
    id: 'Musk', tier: 2,
    basePrice: [120, 320], weight: 1,
    spoilable: false, breakable: false, fraudRisk: 0.10,
    description: 'Tibetan musk deer pods. Perfumery and medicine. Often faked.',
    physicalDescription: 'Leathery dried pods containing a dark, powerfully scented paste',
    color: '#9c27b0', icon: '❋',
    iconImage: '/wares/musk_icon.png',
  },
  'Quicksilver': {
    id: 'Quicksilver', tier: 2,
    basePrice: [35, 85], weight: 2,
    spoilable: false, breakable: false, fraudRisk: 0,
    description: 'Mercury. Essential for amalgamation, medicine, and alchemy. Heavy and dangerous.',
    physicalDescription: 'A heavy sealed flask of shimmering liquid metal',
    color: '#b0bec5', icon: '☿',
    iconImage: '/wares/quicksilver_icon.png',
  },
  'Sassafras': {
    id: 'Sassafras', tier: 2,
    basePrice: [30, 80], weight: 1,
    spoilable: false, breakable: false, fraudRisk: 0.04,
    description: 'Aromatic root bark from Virginia. Sold in European apothecaries as a treatment for syphilis and a general tonic. The main export of early Jamestown.',
    physicalDescription: 'Reddish-brown dried root bark with a sweet, rooty smell',
    color: '#9a5b3a', icon: '⚶',
    iconImage: '/wares/sassafras_icon.png',
  },
  'Tamarind': {
    id: 'Tamarind', tier: 2,
    basePrice: [8, 18], weight: 1,
    spoilable: true, breakable: false, fraudRisk: 0,
    description: 'Sour fruit used as food preservative and medicine across the Indian Ocean.',
    physicalDescription: 'Sticky brown pulp in brittle pods, powerfully sour',
    color: '#8d6e4c', icon: '⌓',
    iconImage: '/wares/tamarind_icon.png',
  },
  // The great Asian chewing-quid — chewed with slaked lime and betel leaf
  // from the Philippines through India to East Africa. Mild stimulant,
  // digestive aid, social and ritual good. Bulky, lower-value, ubiquitous.
  'Betel Nut': {
    id: 'Betel Nut', tier: 2,
    basePrice: [6, 14], weight: 1,
    spoilable: false, breakable: false, fraudRisk: 0.02,
    description: 'Areca palm seed, chewed with lime and betel leaf as a mild stimulant. Universal across the Indian Ocean and Philippines.',
    physicalDescription: 'Hard reddish-brown nuts the size of a walnut, faintly astringent',
    color: '#a04830', icon: '◉',
  },

  // ── Tier 3: Staples & Trade Goods ──
  'Indigo': {
    id: 'Indigo', tier: 3,
    basePrice: [24, 60], weight: 1,
    spoilable: false, breakable: false, fraudRisk: 0,
    description: 'Gujarat dye. Insatiable European demand.',
    physicalDescription: 'Dense cakes of deep blue dye that stain the fingers',
    color: '#3f51b5', icon: '◆',
    iconImage: '/wares/indigo_icon.png',
  },
  'Iron': {
    id: 'Iron', tier: 3,
    basePrice: [6, 14], weight: 2,
    spoilable: false, breakable: false, fraudRisk: 0,
    description: 'Bar iron and steel. High demand in East Africa and Southeast Asia.',
    physicalDescription: 'Rough bars of grey metal',
    color: '#7a8a9a', icon: '⚒',
    iconImage: '/wares/iron_icon.png',
  },
  'Timber': {
    id: 'Timber', tier: 3,
    basePrice: [4, 10], weight: 2,
    spoilable: false, breakable: false, fraudRisk: 0,
    description: 'Teak and hardwoods from Malabar. Essential for ship repair.',
    physicalDescription: 'Heavy planks of dark, close-grained wood',
    color: '#8B6914', icon: '≡',
    iconImage: '/wares/timber_icon.png',
  },
  'Sugar': {
    id: 'Sugar', tier: 3,
    basePrice: [8, 18], weight: 1,
    spoilable: true, breakable: false, fraudRisk: 0,
    description: 'Increasingly important commodity. Bengal and Southeast Asian production.',
    physicalDescription: 'Coarse brown crystals with an intensely sweet taste',
    color: '#f5f0e0', icon: '⬡',
    iconImage: '/wares/sugar_icon.png',
  },
  'Ivory': {
    id: 'Ivory', tier: 3,
    basePrice: [36, 90], weight: 2,
    spoilable: false, breakable: false, fraudRisk: 0,
    description: 'East African elephant tusks. Heavy but always in demand.',
    physicalDescription: 'Heavy curved tusks of creamy white bone-like material',
    color: '#faf0e6', icon: '⌒',
    iconImage: '/wares/ivory_icon.png',
  },
  'Chinese Porcelain': {
    id: 'Chinese Porcelain', tier: 3,
    basePrice: [38, 110], weight: 2,
    spoilable: false, breakable: true, fraudRisk: 0,
    description: 'Blue-and-white kraak ware from Jingdezhen. Fragile cargo.',
    physicalDescription: 'Delicate vessels of thin white ceramic painted in blue',
    color: '#4fc3f7', icon: '⚱',
    iconImage: '/wares/chinese_porcelain_icon.png',
  },
  'Pearls': {
    id: 'Pearls', tier: 3,
    basePrice: [50, 140], weight: 1,
    spoilable: false, breakable: false, fraudRisk: 0,
    description: 'Persian Gulf pearls. Hormuz and Muscat specialties.',
    physicalDescription: 'Lustrous white spheres harvested from oyster shells',
    color: '#e0d6cc', icon: '○',
    iconImage: '/wares/pearls_icon.png',
  },
  'Red Coral': {
    id: 'Red Coral', tier: 3,
    basePrice: [45, 120], weight: 1,
    spoilable: false, breakable: true, fraudRisk: 0,
    description: 'Mediterranean coral, traded into India for jewelry and medicine. Fragile.',
    physicalDescription: 'Branching formations of vivid red marine growth',
    color: '#e53935', icon: '⌗',
    iconImage: '/wares/red_coral_icon.png',
  },
  'Rose Water': {
    id: 'Rose Water', tier: 3,
    basePrice: [24, 58], weight: 1,
    spoilable: false, breakable: true, fraudRisk: 0,
    description: 'Persian distillation. Perfumery, cooking, and medicine. Bottles break easily.',
    physicalDescription: 'Stoppered glass bottles of clear, floral-scented liquid',
    color: '#f48fb1', icon: '✾',
    iconImage: '/wares/rose_water_icon.png',
  },

  // ── Tier 4: Precious Rarities ──
  'Ambergris': {
    id: 'Ambergris', tier: 4,
    basePrice: [180, 500], weight: 1,
    spoilable: false, breakable: false, fraudRisk: 0.10,
    description: 'Whale secretion. Perfume fixative and medicine. Often counterfeited.',
    physicalDescription: 'A waxy grey-black lump with a strange, sweet marine odor',
    color: '#b8860b', icon: '◈',
    iconImage: '/wares/amber_icon.png',
    commonSubstitute: 'Benzoin',
  },
  'Bezoar Stones': {
    id: 'Bezoar Stones', tier: 4,
    basePrice: [220, 650], weight: 1,
    spoilable: false, breakable: false, fraudRisk: 0.20,
    description: 'Calcified stomach stones. Believed to be universal antidote. Frequently faked.',
    physicalDescription: 'Smooth, layered stones found inside animal stomachs',
    color: '#a1887f', icon: '◎',
    iconImage: '/wares/bezoar_stone_icon.png',
    commonSubstitute: 'Horn',
  },
  'Bhang': {
    id: 'Bhang', tier: 4,
    basePrice: [55, 130], weight: 1,
    spoilable: true, breakable: false, fraudRisk: 0,
    description: 'Cannabis preparation. Appears unpredictably at market.',
    physicalDescription: 'A pungent green paste made from crushed leaves and flowers',
    color: '#558b2f', icon: '✽',
    iconImage: '/wares/bhang_icon.png',
  },
  "Dragon's Blood": {
    id: "Dragon's Blood", tier: 4,
    basePrice: [90, 240], weight: 1,
    spoilable: false, breakable: false, fraudRisk: 0.08,
    description: "Deep red resin from Socotra's dragon trees. Dye, varnish, and medicine.",
    physicalDescription: 'Deep crimson resin that shatters like glass when struck',
    color: '#b71c1c', icon: '⬥',
    iconImage: '/wares/dragons_blood_icon.png',
    commonSubstitute: 'Myrrh',
  },
  'Virginia Tobacco': {
    id: 'Virginia Tobacco', tier: 4,
    basePrice: [120, 320], weight: 1,
    spoilable: true, breakable: false, fraudRisk: 0.05,
    description: 'Rolfe\'s experimental Spanish-seed crop, first planted at Jamestown in 1612. Milder and sweeter than Caribbean leaf; a curiosity in London apothecaries.',
    physicalDescription: 'Small bundles of cured leaves, paler and finer than common tobacco',
    color: '#a78a5c', icon: '⌘',
    iconImage: '/wares/virginia_tobacco_icon.png',
  },

  // ── Tier 5: Extraordinary ──
  'Mumia': {
    id: 'Mumia', tier: 5,
    basePrice: [180, 450], weight: 1,
    spoilable: false, breakable: false, fraudRisk: 0.35,
    description: '"Egyptian mummy" — prized drug in European and Islamic medicine. Most is fake bitumen.',
    physicalDescription: 'Dark, tarry substance sold as ancient embalming material',
    color: '#4e342e', icon: '☥',
    iconImage: '/wares/mumia_icon.png',
  },
  'Lapis de Goa': {
    id: 'Lapis de Goa', tier: 5,
    basePrice: [260, 750], weight: 1,
    spoilable: false, breakable: false, fraudRisk: 0,
    description: 'Artificial bezoar made by Jesuits. Gold leaf, gemstone dust, and secret ingredients.',
    physicalDescription: 'A gilded ball stamped with a cross, said to cure any poison',
    color: '#ffd700', icon: '✧',
    iconImage: '/wares/lapis_de_goa_icon.png',
  },
  // Venetian state-monopoly polypharmacy. ~64 ingredients including opium,
  // viper flesh, and rare resins, compounded publicly once a year on the
  // Piazza San Marco. The most prestigious medicine in early-modern Europe.
  'Theriac': {
    id: 'Theriac', tier: 5,
    basePrice: [320, 900], weight: 1,
    spoilable: false, breakable: false, fraudRisk: 0.25,
    description: 'Venetian state-monopoly compound of sixty-odd ingredients. Reputed cure-all and antidote.',
    physicalDescription: 'A dense, dark brown electuary in a sealed earthenware pot, sweet and resinous',
    color: '#5a3a22', icon: '☤',
    commonSubstitute: 'Mumia',
  },
  'Murano Glass': {
    id: 'Murano Glass', tier: 4,
    basePrice: [80, 180], weight: 1,
    spoilable: false, breakable: true, fraudRisk: 0.10,
    description: 'Cristallo and mirror-glass from the Murano furnaces. Fragile, prized across the Mediterranean and the Levant.',
    physicalDescription: 'Slender goblets and small mirrors wrapped in straw, catching light like clear water',
    color: '#a8d4e8', icon: '◇',
  },
  'Japanese Silver': {
    id: 'Japanese Silver', tier: 4,
    basePrice: [90, 220], weight: 2,
    spoilable: false, breakable: false, fraudRisk: 0,
    description: 'Ingots of refined silver from the Iwami and Ikuno mines. Japan produces roughly a third of the world\'s silver in this period — the engine behind the Macau–Nagasaki trade.',
    physicalDescription: 'Heavy stamped bars of bright, cold-to-the-touch metal',
    color: '#c0c8d0', icon: '❖',
  },
  'Venetian Soap': {
    id: 'Venetian Soap', tier: 3,
    basePrice: [20, 48], weight: 1,
    spoilable: false, breakable: false, fraudRisk: 0.05,
    description: 'Hard olive-oil soap pressed in pale cakes. A Venetian luxury good across the Levant and northern Europe.',
    physicalDescription: 'Pale cream-coloured cakes stamped with a maker\'s mark, faintly perfumed',
    color: '#e8e0c8', icon: '▢',
  },

  // ── Provisions & Ordnance ──
  'Rice': {
    id: 'Rice', tier: 3,
    basePrice: [2, 6], weight: 1,
    spoilable: true, breakable: false, fraudRisk: 0,
    description: 'Staple grain. Also consumed as ship provisions.',
    physicalDescription: 'Sacks of pale grain',
    color: '#d4c090', icon: '⁂',
  },
  'Small Shot': {
    id: 'Small Shot', tier: 3,
    basePrice: [6, 16], weight: 1,
    spoilable: false, breakable: false, fraudRisk: 0,
    description: 'Powder flasks, lead balls, and light swivel shot packed for muskets and rail guns.',
    physicalDescription: 'Kegs of powder and bags of small iron and lead shot',
    color: '#78909c', icon: '●',
  },
  'Cannon Shot': {
    id: 'Cannon Shot', tier: 3,
    basePrice: [14, 36], weight: 2,
    spoilable: false, breakable: false, fraudRisk: 0,
    description: 'Solid iron round shot for shipboard cannon. Heavy, dirty, and always in demand at arsenals.',
    physicalDescription: 'Pyramids of heavy iron cannonballs stacked in rope slings',
    color: '#5f6d78', icon: '⬤',
  },
  'Salted Meat': {
    id: 'Salted Meat', tier: 1,
    basePrice: [4, 9], weight: 1,
    spoilable: true, breakable: false, fraudRisk: 0,
    description: 'Cured meat from hunted animals. Feeds the crew on long voyages.',
    physicalDescription: 'Strips of dark, salt-crusted meat in a cloth bundle',
    color: '#7a3a2a', icon: '◫',
  },
  'Hides': {
    id: 'Hides', tier: 3,
    basePrice: [18, 48], weight: 2,
    spoilable: true, breakable: false, fraudRisk: 0.05,
    description: 'Cured animal hides — leather for boots, saddles, jerkins. Steady demand in every port.',
    physicalDescription: 'Stiff, salted hides folded into stacks',
    color: '#8b5a3c', icon: '▤',
  },
  'Wool': {
    id: 'Wool', tier: 1,
    basePrice: [6, 16], weight: 1,
    spoilable: false, breakable: false, fraudRisk: 0,
    description: 'Raw fleece. European staple — Mediterranean and Atlantic ports buy in bulk.',
    physicalDescription: 'Rough cream-coloured fleece, oily and matted',
    color: '#e8dcc8', icon: '☁',
  },
  'Horn': {
    id: 'Horn', tier: 3,
    basePrice: [14, 40], weight: 1,
    spoilable: false, breakable: true, fraudRisk: 0.1,
    description: 'Polished animal horn — used for combs, powder flasks, ornaments. Light cargo, decent margin.',
    physicalDescription: 'Curved, polished horn pieces tied in a bundle',
    color: '#5c4033', icon: '⌒',
  },
  'War Rockets': {
    id: 'War Rockets', tier: 3,
    basePrice: [55, 130], weight: 1,
    spoilable: false, breakable: false, fraudRisk: 0,
    description: 'Bamboo-tube 火箭 rockets from the Ming arsenals. One consumed per rocket fired. Macau is the reliable source; hold caps at 20.',
    physicalDescription: 'Bundled bamboo tubes, each tipped with an iron head and a paper-wrapped powder charge',
    color: '#a03a25', icon: '⇑',
  },
};

// ── Ordered list for market/UI display ──
export const ALL_COMMODITIES: Commodity[] = [
  // Tier 1: Spices & Stimulants
  'Black Pepper', 'Cinnamon', 'Cardamom', 'Ginger', 'Coffee', 'Tea',
  'Cloves', 'Nutmeg', 'Saffron', 'Star Anise', 'Tobacco',
  // Tier 2: Exotic Drugs & Medicines
  'Opium', 'Camphor', 'Benzoin', 'Frankincense', 'Myrrh',
  'Rhubarb', 'China Root', 'Cassia Fistula', 'Aloes', 'Sassafras',
  'Musk', 'Quicksilver', 'Tamarind', 'Betel Nut',
  // Tier 3: Staples & Trade Goods
  'Indigo', 'Iron', 'Timber', 'Sugar',
  'Ivory', 'Chinese Porcelain', 'Pearls', 'Red Coral', 'Rose Water',
  'Venetian Soap',
  'Hides', 'Wool', 'Horn', 'Small Shot', 'Cannon Shot', 'War Rockets',
  // Tier 4: Precious Rarities
  'Ambergris', 'Bezoar Stones', 'Bhang', "Dragon's Blood", 'Virginia Tobacco',
  'Murano Glass', 'Japanese Silver',
  // Tier 5: Extraordinary
  'Mumia', 'Lapis de Goa', 'Theriac',
];

// Full list including non-tradable items (for cargo tracking, NPC loot, etc.)
export const ALL_COMMODITIES_FULL: Commodity[] = [
  ...ALL_COMMODITIES,
  'Rice', 'Salted Meat',
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

const SMALL_SHOT_PORTS = new Set([
  'calicut', 'goa', 'surat', 'diu', 'hormuz', 'muscat', 'mocha', 'aden',
  'zanzibar', 'mombasa', 'socotra', 'malacca', 'bantam', 'macau',
  'london', 'jamestown', 'lisbon', 'amsterdam', 'seville', 'cochin',
  'aceh', 'mogadishu', 'kilwa', 'elmina', 'luanda', 'salvador', 'havana', 'cartagena',
  'nagasaki', 'masulipatnam',
]);

const CANNON_SHOT_PRODUCERS = new Set([
  'goa', 'diu', 'macau', 'lisbon', 'amsterdam', 'seville', 'london', 'havana',
]);

const CANNON_SHOT_TRADERS = new Set([
  'calicut', 'surat', 'hormuz', 'muscat', 'malacca', 'cochin', 'aceh',
  'mombasa', 'elmina', 'luanda', 'salvador', 'cartagena',
  'nagasaki', 'masulipatnam',
]);

export const PORT_TRADE_PROFILES: Record<string, PortTradeProfile> = {
  calicut: {
    produces: ['Black Pepper', 'Cardamom', 'Cinnamon', 'Timber', 'Rice', 'Ginger',
               'Tamarind', 'Cassia Fistula'],
    trades:   ['Iron', 'Aloes', 'Small Shot', 'Sugar'],
    demands:  ['Chinese Porcelain', 'Cloves', 'Nutmeg', 'Tea', 'Pearls', 'Musk', 'Ivory',
               'Red Coral', 'Rose Water', 'Quicksilver', 'Saffron'],
  },
  goa: {
    produces: ['Lapis de Goa', 'Black Pepper', 'Rice'],
    trades:   ['Opium', 'Iron', 'Small Shot', 'Indigo', 'Cinnamon', 'Timber',
               'Bezoar Stones', 'Cardamom', 'Ginger', 'Tamarind', 'Cassia Fistula',
               'Tobacco', 'Quicksilver', 'Red Coral', 'Sugar'],
    demands:  ['Cloves', 'Nutmeg', 'Chinese Porcelain', 'Musk', 'Tea',
               'Ambergris', 'Mumia', 'Camphor', 'Saffron', 'Rhubarb', 'China Root'],
  },
  surat: {
    produces: ['Indigo', 'Opium', 'Rice', 'Sugar'],
    trades:   ['Iron', 'Black Pepper', 'Cardamom', 'Small Shot', 'Timber', 'Bezoar Stones',
               'Ginger', 'Saffron', 'Rose Water', 'Tamarind'],
    demands:  ['Cloves', 'Nutmeg', 'Chinese Porcelain', 'Tea', 'Musk', 'Ivory', 'Coffee',
               'Camphor', 'Rhubarb', 'China Root', 'Frankincense'],
  },
  diu: {
    produces: ['Indigo'],
    trades:   ['Opium', 'Iron', 'Small Shot', 'Black Pepper', 'Rice', 'Sugar',
               'Rose Water'],
    demands:  ['Cloves', 'Nutmeg', 'Chinese Porcelain', 'Tea', 'Pearls', 'Coffee',
               'Camphor', 'Saffron', 'Rhubarb'],
  },
  hormuz: {
    produces: ['Pearls', 'Rose Water'],
    trades:   ['Iron', 'Black Pepper', 'Cinnamon', 'Indigo', 'Small Shot',
               'Musk', 'Opium', 'Bezoar Stones', 'Coffee', 'Ambergris',
               'Saffron', 'Frankincense', 'Myrrh', 'Red Coral', 'Rhubarb'],
    demands:  ['Timber', 'Rice', 'Cloves', 'Nutmeg', 'Chinese Porcelain', 'Ivory',
               'Tea', 'Mumia', 'Camphor', 'Quicksilver', 'China Root'],
  },
  muscat: {
    produces: ['Pearls', 'Ambergris', 'Frankincense'],
    trades:   ['Iron', 'Aloes', 'Small Shot', 'Coffee',
               'Rose Water', 'Myrrh'],
    demands:  ['Black Pepper', 'Cloves', 'Chinese Porcelain', 'Timber', 'Rice', 'Ivory',
               'Saffron', 'Camphor', 'Rhubarb'],
  },
  mocha: {
    produces: ['Coffee'],
    trades:   ['Mumia', 'Ambergris', 'Iron', 'Aloes', 'Frankincense', 'Myrrh',
               'Red Coral'],
    demands:  ['Black Pepper', 'Cloves', 'Chinese Porcelain', 'Rice',
               'Indigo', 'Nutmeg', 'Ivory', 'Small Shot', 'Sugar', 'Tobacco',
               'Saffron', 'Camphor'],
  },
  aden: {
    produces: ['Coffee', 'Frankincense', 'Myrrh'],
    trades:   ['Mumia', 'Ivory', 'Iron', 'Aloes', 'Ambergris'],
    demands:  ['Black Pepper', 'Cloves', 'Chinese Porcelain', 'Rice',
               'Indigo', 'Nutmeg', 'Small Shot', 'Musk', 'Sugar', 'Tobacco',
               'Camphor', 'Rhubarb'],
  },
  zanzibar: {
    produces: ['Ivory', 'Ambergris'],
    trades:   ['Aloes', 'Rice', 'Tamarind', 'Frankincense'],
    demands:  ['Iron', 'Small Shot', 'Black Pepper', 'Chinese Porcelain',
               'Bezoar Stones', 'Opium', 'Cloves', 'Sugar', 'Tobacco',
               'Red Coral', 'Quicksilver'],
  },
  mombasa: {
    produces: ['Ivory'],
    trades:   ['Iron', 'Rice', 'Ambergris', 'Aloes', 'Frankincense', 'Myrrh'],
    demands:  ['Small Shot', 'Chinese Porcelain', 'Black Pepper',
               'Cloves', 'Opium', 'Bezoar Stones', 'Sugar', 'Tobacco',
               'Red Coral', 'Quicksilver'],
  },
  socotra: {
    produces: ['Aloes', 'Ambergris', "Dragon's Blood"],
    trades:   ['Frankincense', 'Myrrh'],
    demands:  ['Rice', 'Iron', 'Small Shot', 'Black Pepper', 'Tea',
               'Sugar'],
  },
  malacca: {
    // Transshipment hub for Maluku spices, not a production site — cloves/nutmeg
    // are here as `trades` (0.8–1.2×) so Bantam remains the cheap source.
    produces: ['Aloes', 'Timber', 'Camphor', 'Benzoin'],
    trades:   ['Cloves', 'Nutmeg', 'Black Pepper', 'Tea', 'Rice', 'Iron', 'Small Shot',
               'Opium', 'Ginger', 'Sugar', 'Tobacco', 'China Root', 'War Rockets'],
    demands:  ['Indigo', 'Bezoar Stones', 'Ivory', 'Coffee',
               'Pearls', 'Musk', 'Saffron', 'Red Coral', 'Quicksilver',
               'Frankincense', 'Rose Water'],
  },
  bantam: {
    produces: ['Cloves', 'Nutmeg', 'Rice', 'Timber', 'Camphor', 'Benzoin', 'Sugar', 'Betel Nut'],
    trades:   ['Black Pepper', 'Aloes', 'Iron', 'Ginger', 'Tobacco', 'War Rockets'],
    demands:  ['Indigo', 'Chinese Porcelain', 'Opium', 'Small Shot',
               'Ivory', 'Pearls', 'Musk', 'Coffee', 'Saffron', 'Red Coral',
               'Quicksilver', 'Frankincense', 'Rose Water'],
  },
  macau: {
    produces: ['Chinese Porcelain', 'Tea', 'Musk', 'Rhubarb', 'China Root', 'Star Anise', 'War Rockets'],
    trades:   ['Bhang', 'Iron', 'Small Shot', 'Aloes', 'Sugar',
               'Tobacco', 'Quicksilver', 'Camphor'],
    demands:  ['Black Pepper', 'Cloves', 'Nutmeg', 'Opium', 'Bezoar Stones',
               'Cinnamon', 'Ivory', 'Coffee', 'Ambergris', 'Saffron',
               'Frankincense', 'Red Coral', 'Rose Water'],
  },
  // Manila — Spanish capital of the Philippines and the Asian terminus of
  // the Acapulco galleon. Functions as the eastern hinge of the Habsburg
  // trade: Mexican silver in, Chinese and Asian goods out (eastward to New
  // Spain, but Manila itself doesn't *produce* most of it — the Sangley
  // Chinese Parián is the actual workshop). Star Anise is the canonical
  // Manila-galleon spice. Betel nut is the local Philippine product.
  manila: {
    produces: ['Star Anise', 'Betel Nut', 'Tobacco', 'Camphor'],
    trades:   ['Chinese Porcelain', 'Tea', 'Musk', 'Rhubarb', 'China Root',
               'Bezoar Stones', 'Cinnamon', 'Ginger', 'Sugar', 'Iron',
               'Small Shot', 'Aloes', 'Quicksilver'],
    demands:  ['Cloves', 'Nutmeg', 'Black Pepper', 'Indigo', 'Opium',
               'Ivory', 'Cardamom', 'Frankincense', 'Coffee', 'Pearls',
               'Saffron', 'Red Coral', 'Rose Water'],
  },

  // ── European terminal markets ──
  london: {
    produces: ['Iron', 'Timber'],
    trades:   ['Indigo', 'Small Shot', 'Rice', 'Aloes'],
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
    demands:  ['Iron', 'Small Shot', 'Sugar', 'Rice',
               'Cinnamon', 'Black Pepper', 'Aloes', 'Quicksilver',
               'Indigo', 'Rose Water'],
  },

  // ── European terminal markets (cont.) ──

  // Lisbon — metropole of the Portuguese Estado da Índia. The endpoint of the
  // Carreira. Produces Iberian iron, wool, munitions (royal arsenal). Trades
  // Brazilian and Mediterranean goods passing through. Demands every Asian
  // spice and drug at the highest prices in the game.
  lisbon: {
    produces: ['Iron', 'Wool', 'Small Shot', 'Hides'],
    trades:   ['Tobacco', 'Sugar', 'Cassia Fistula', 'Red Coral', 'Rose Water',
               'Tamarind', 'Timber'],
    demands:  ['Black Pepper', 'Cinnamon', 'Cloves', 'Nutmeg', 'Ginger',
               'Chinese Porcelain', 'Tea', 'Coffee', 'Musk', 'Saffron',
               'Opium', 'Ambergris', 'Mumia', 'Bezoar Stones', 'Rhubarb',
               'China Root', 'Camphor', 'Benzoin', 'Frankincense', 'Myrrh',
               'Pearls', 'Indigo', 'Sassafras', 'Virginia Tobacco', 'Star Anise'],
  },

  // Amsterdam — VOC headquarters, rising challenger to the Portuguese. Strong
  // appetite for fine spices (their main trade focus). Produces Dutch cloth
  // and munitions. Somewhat hostile to Iberian flags (gameplay reputation).
  amsterdam: {
    produces: ['Iron', 'Wool', 'Small Shot', 'Hides'],
    trades:   ['Indigo', 'Sugar', 'Tobacco', 'Timber', 'Tamarind'],
    demands:  ['Cloves', 'Nutmeg', 'Black Pepper', 'Cinnamon', 'Ginger',
               'Chinese Porcelain', 'Tea', 'Coffee', 'Camphor', 'Benzoin',
               'Musk', 'Saffron', 'Rhubarb', 'China Root', 'Opium',
               'Pearls', 'Ambergris', 'Frankincense', 'Rose Water',
               'Virginia Tobacco', 'Star Anise'],
  },

  // Venice — Republic still receiving Levantine pepper, indigo, and silk via
  // Alexandria and Aleppo despite a century of Cape-route competition. Produces
  // the city's signature monopolies: theriac (state-compounded polypharmacy),
  // Murano glass, hard olive-oil soap. Demands every Asian luxury for re-export
  // into German and central European markets.
  venice: {
    produces: ['Theriac', 'Murano Glass', 'Venetian Soap', 'Red Coral'],
    trades:   ['Black Pepper', 'Cinnamon', 'Ginger', 'Indigo', 'Cardamom',
               'Rose Water', 'Frankincense', 'Myrrh', 'Mumia', 'Saffron',
               'Iron', 'Small Shot', 'Sugar', 'Tobacco', 'Wool', 'Hides'],
    demands:  ['Cloves', 'Nutmeg', 'Chinese Porcelain', 'Tea', 'Coffee',
               'Musk', 'Camphor', 'Benzoin', 'Rhubarb', 'China Root',
               'Opium', 'Bezoar Stones', 'Pearls', 'Ambergris', 'Bhang',
               'Virginia Tobacco', 'Sassafras'],
  },

  // Seville — Spanish Atlantic gateway. Almadén mercury funnels through here
  // on its way to New Spain's silver amalgamation mines — historically the
  // defining local export. Demands Asian luxuries for Atlantic re-export.
  seville: {
    produces: ['Quicksilver', 'Wool', 'Iron', 'Small Shot'],
    trades:   ['Tobacco', 'Sugar', 'Red Coral', 'Timber', 'Hides'],
    demands:  ['Black Pepper', 'Cinnamon', 'Cloves', 'Nutmeg', 'Chinese Porcelain',
               'Rose Water', 'Saffron', 'Ambergris', 'Musk', 'Cassia Fistula',
               'Mumia', 'Bezoar Stones', 'Rhubarb', 'Pearls', 'Indigo',
               // Seville is the natural sink for Manila-galleon Star Anise
               // arriving via Acapulco — biggest demand in Europe.
               'Star Anise'],
  },

  // ── Other Indian Ocean / Spice Islands (cont.) ──

  // Cochin — Portuguese-controlled Malabar port, the original Estado foothold
  // before Goa eclipsed it. Still a major pepper and cardamom producer.
  cochin: {
    produces: ['Black Pepper', 'Cardamom', 'Ginger', 'Cassia Fistula', 'Timber',
               'Rice', 'Tamarind'],
    trades:   ['Cinnamon', 'Iron', 'Small Shot', 'Aloes', 'Sugar'],
    demands:  ['Chinese Porcelain', 'Cloves', 'Nutmeg', 'Musk', 'Saffron',
               'Red Coral', 'Rose Water', 'Tea', 'Quicksilver'],
  },

  // Aceh — powerful Sumatran sultanate, a major pepper producer and a
  // challenger to the Portuguese. Home of camphor and benzoin.
  aceh: {
    produces: ['Black Pepper', 'Camphor', 'Benzoin', 'Timber', 'Rice'],
    trades:   ['Ginger', 'Aloes', 'Sugar'],
    demands:  ['Indigo', 'Chinese Porcelain', 'Iron', 'Small Shot', 'Opium',
               'Rose Water', 'Saffron', 'Red Coral', 'Tea', 'Ivory'],
  },

  // ── East African Swahili coast (cont.) ──

  // Mogadishu — Somali Swahili port. Historically a major producer of
  // frankincense and myrrh (Horn of Africa), plus ambergris from the beaches.
  mogadishu: {
    produces: ['Frankincense', 'Myrrh', 'Ivory', 'Ambergris'],
    trades:   ['Aloes', 'Hides', 'Tamarind', 'Rice'],
    demands:  ['Black Pepper', 'Chinese Porcelain', 'Iron', 'Small Shot',
               'Indigo', 'Cloves', 'Sugar', 'Red Coral', 'Opium'],
  },

  // Kilwa — once the greatest city of the Swahili coast, in decline by 1612
  // under Portuguese rule. Ivory trade persists. Sparser market, shadier feel.
  kilwa: {
    produces: ['Ivory'],
    trades:   ['Ambergris', 'Aloes', 'Tamarind', 'Hides', 'Rice'],
    demands:  ['Black Pepper', 'Iron', 'Small Shot', 'Chinese Porcelain',
               'Sugar', 'Red Coral', 'Indigo', 'Cloves'],
  },

  // ── West Africa ──

  // Elmina — Portuguese São Jorge da Mina on the Gold Coast. Iron had
  // astonishing demand in West African trade; Akan hinterland supplied hides,
  // horn, and forest products traded to the fort.
  elmina: {
    produces: ['Hides', 'Horn', 'Ivory', 'Timber'],
    trades:   ['Tamarind', 'Rice'],
    demands:  ['Iron', 'Small Shot', 'Sugar', 'Indigo', 'Red Coral',
               'Rose Water', 'Cassia Fistula', 'Black Pepper', 'Cinnamon',
               'Wool'],
  },

  // Luanda — Portuguese São Paulo de Luanda in Angola. Ivory, wax, and
  // forest products traded inland. Iron and textiles in high demand.
  luanda: {
    produces: ['Ivory', 'Hides', 'Horn', 'Timber'],
    trades:   ['Tamarind', 'Aloes', 'Rice'],
    demands:  ['Iron', 'Small Shot', 'Sugar', 'Wool', 'Indigo', 'Red Coral',
               'Black Pepper', 'Cinnamon', 'Cassia Fistula'],
  },

  // ── Atlantic Americas ──

  // Salvador da Bahia — capital of Portuguese Brazil, the engine of the
  // early sugar trade. Brazilian tobacco is also in ascendancy.
  salvador: {
    produces: ['Sugar', 'Tobacco', 'Timber', 'Hides'],
    trades:   ['Tamarind', 'Rice'],
    demands:  ['Iron', 'Small Shot', 'Wool', 'Cinnamon', 'Black Pepper',
               'Red Coral', 'Cassia Fistula', 'Chinese Porcelain',
               'Rose Water', 'Opium', 'Quicksilver', 'Indigo'],
  },

  // Havana — Spanish treasure-fleet staging point. Cuban tobacco is already
  // famous in 1612. Hides and sugar also abundant; a busy re-export hub.
  havana: {
    produces: ['Tobacco', 'Sugar', 'Hides'],
    trades:   ['Timber', 'Quicksilver', 'Rice'],
    demands:  ['Iron', 'Small Shot', 'Wool', 'Cinnamon', 'Black Pepper',
               'Chinese Porcelain', 'Rose Water', 'Saffron', 'Cloves',
               'Red Coral', 'Indigo'],
  },

  // Cartagena de Indias — Spanish fortified port, the transshipment point
  // for Potosí silver coming up from Panama. Quicksilver from Seville passes
  // through here on its way to Peru. Tobacco and sugar from the hinterland.
  cartagena: {
    produces: ['Tobacco', 'Sugar'],
    trades:   ['Hides', 'Timber', 'Quicksilver', 'Rice'],
    demands:  ['Iron', 'Small Shot', 'Wool', 'Black Pepper', 'Cinnamon',
               'Chinese Porcelain', 'Red Coral', 'Rose Water', 'Cloves',
               'Cassia Fistula', 'Indigo'],
  },

  // Nagasaki — the Portuguese Nao do Trato terminus. Japan produces ~1/3 of
  // world silver in this period; the whole port economy in 1612 is built
  // around exchanging Chinese silk and European goods for Iwami silver. Tea,
  // camphor, and lacquer ship out as secondary exports. Demands Chinese
  // porcelain (Japan is a porcelain *importer* before the Arita kilns fire up
  // in the 1610s–20s), Southeast Asian spices, and European luxuries.
  nagasaki: {
    produces: ['Japanese Silver', 'Tea', 'Camphor', 'Rice', 'Timber'],
    trades:   ['Iron', 'Small Shot', 'Sugar', 'Aloes'],
    demands:  ['Chinese Porcelain', 'Black Pepper', 'Cloves', 'Nutmeg',
               'Cinnamon', 'Ginger', 'Sugar', 'Opium', 'Ivory',
               'Red Coral', 'Saffron', 'Musk', 'Rhubarb',
               'Virginia Tobacco', 'Tobacco'],
  },

  // Masulipatnam — Qutb Shahi Golconda's maritime outlet on the Coromandel.
  // Premier source of bhang (cannabis) in the game world, and the best opium
  // on the subcontinent. Indigo and hand-painted Coromandel cottons (handled
  // under generic Indigo for v1) round out the export slate. Demands European
  // munitions and specie, and Southeast Asian / Chinese luxuries for the
  // Golconda court inland.
  masulipatnam: {
    produces: ['Bhang', 'Opium', 'Indigo', 'Rice', 'Tamarind'],
    trades:   ['Black Pepper', 'Iron', 'Small Shot', 'Sugar', 'Cassia Fistula',
               'Ginger'],
    demands:  ['Chinese Porcelain', 'Cloves', 'Nutmeg', 'Tea', 'Musk',
               'Saffron', 'Rose Water', 'Red Coral', 'Quicksilver',
               'Frankincense', 'Camphor', 'Wool'],
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
  if (commodity === 'Small Shot') {
    return SMALL_SHOT_PORTS.has(portId) ? 'trades' : null;
  }
  if (commodity === 'Cannon Shot') {
    if (CANNON_SHOT_PRODUCERS.has(portId)) return 'produces';
    if (CANNON_SHOT_TRADERS.has(portId)) return 'trades';
    return null;
  }
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

  // Ammo (Small Shot / Cannon Shot) and War Rockets at Macau are curated via
  // dedicated port sets and must never be culled by the tier cap — otherwise
  // inventory can outlive price and strand unbuyable stock at the quay.
  const isPinned = (c: { commodity: Commodity }) =>
    c.commodity === 'Small Shot' ||
    c.commodity === 'Cannon Shot' ||
    (c.commodity === 'War Rockets' && portId === 'macau');
  const ammo = candidates.filter(isPinned);
  const rest = candidates.filter(c => !isPinned(c));
  rest.sort((a, b) => a.tier - b.tier || prng() - 0.5);
  const selected = [...ammo, ...rest.slice(0, Math.max(0, MAX_PORT_GOODS - ammo.length))];
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

  // War Rockets are hold-capped at 20 and shouldn't flood Macau either —
  // override the generic tier-3 stock to feel curated.
  //   Macau (produces): 14–24 rockets, always present.
  //   Malacca/Bantam (trades): 0–6 rockets, often 0 — occasional trickle only.
  if (inventory['Small Shot'] > 0) {
    inventory['Small Shot'] = 18 + Math.floor(prng() * 25);
  }

  if (inventory['Cannon Shot'] > 0) {
    if (CANNON_SHOT_PRODUCERS.has(portId)) {
      inventory['Cannon Shot'] = 10 + Math.floor(prng() * 15);
    } else {
      inventory['Cannon Shot'] = 4 + Math.floor(prng() * 8);
    }
  }

  if (inventory['War Rockets'] > 0) {
    if (portId === 'macau') {
      inventory['War Rockets'] = 14 + Math.floor(prng() * 11);
    } else {
      inventory['War Rockets'] = prng() < 0.5 ? 0 : 1 + Math.floor(prng() * 6);
    }
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
    'Iron', 'Small Shot', 'Cannon Shot', 'Rice', 'Timber',
    'Black Pepper', 'Cinnamon', 'Ginger', 'Tea',
    'Cloves', 'Nutmeg', 'Indigo',
  ],
  Dutch: [
    'Iron', 'Small Shot', 'Cannon Shot', 'Rice', 'Timber',
    'Black Pepper', 'Cloves', 'Nutmeg', 'Cinnamon',
    'Indigo', 'Sugar', 'Camphor',
  ],
  Portuguese: [
    'Small Shot', 'Cannon Shot', 'Iron', 'Rice', 'Timber',
    'Black Pepper', 'Cinnamon', 'Ginger', 'Sugar',
    'Opium', 'Red Coral', 'Quicksilver',
    'Cassia Fistula', 'Tobacco',
  ],
  Spanish: [
    'Iron', 'Small Shot', 'Cannon Shot', 'Rice', 'Timber',
    'Cinnamon', 'Sugar', 'Tobacco',
    'Red Coral', 'Quicksilver',
  ],
  French: [
    'Iron', 'Small Shot', 'Cannon Shot', 'Rice', 'Timber',
    'Black Pepper', 'Cinnamon', 'Coffee', 'Sugar',
    'Indigo',
  ],
  Danish: [
    'Iron', 'Small Shot', 'Rice', 'Timber',
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
    'Coffee', 'Rice', 'Iron', 'Small Shot', 'Cannon Shot',
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
  'Rice', 'Iron', 'Timber', 'Small Shot',
  'Black Pepper', 'Cinnamon', 'Sugar',
];

// Tier draw weight keyed by captain luck band.
// Low luck → mostly staples; high luck → drugs, then rarities.
// Faction pool still gates *which* items are eligible — this just biases
// toward cheaper or more valuable goods within that pool.
function luckTierWeight(tier: CommodityTier, luck: number): number {
  if (luck <= 8)  return ({ 1: 3,  2: 1,  3: 8, 4: 0, 5: 0 } as const)[tier] ?? 0;
  if (luck <= 14) return ({ 1: 10, 2: 4,  3: 4, 4: 0, 5: 0 } as const)[tier] ?? 0;
  if (luck <= 18) return ({ 1: 9,  2: 8,  3: 3, 4: 1, 5: 0 } as const)[tier] ?? 0;
  return           ({ 1: 6,  2: 10, 3: 2, 4: 4, 5: 0 } as const)[tier] ?? 0;
}

/**
 * Generate a randomized starting cargo appropriate for the player's faction
 * and captain luck.
 *
 * luck 1-5:  rice + ammo only
 * luck 6-9:  +1 cheap faction item (staples/light spice)
 * luck 10-14: +1-2 items, mostly spices
 * luck 15-18: +2-4 items, spices and drugs
 * luck 19-20: +4-6 items, drugs and rarities prominent
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

  // Each point of luck above 5 unlocks more weight and more stacks.
  // luck ≤5 → budget 0 / 3 stacks (just rice + ammo).
  const effectiveLuck = Math.max(0, captainLuck - 5);
  const factionBudget = Math.floor(effectiveLuck * 1.8);   // 0–27 weight
  const targetStacks = effectiveLuck > 0
    ? 4 + Math.floor(effectiveLuck * 0.3 + Math.random() * 1.5)  // 4-9
    : 3;

  const stackCount = () => Object.values(cargo).filter(v => v > 0).length;

  cargo['Rice'] = Math.min(5, targetWeight);
  cargo['Small Shot'] = 24;
  cargo['Cannon Shot'] = 6;

  if (factionBudget === 0) return cargo;

  // Build weighted draw list using luck-scaled tier weights
  const drawList: { commodity: Commodity; weight: number }[] = [];
  for (const c of pool) {
    if (c === 'Rice' || c === 'Small Shot' || c === 'Cannon Shot') continue;
    const def = COMMODITY_DEFS[c];
    if (!def) continue;
    const w = luckTierWeight(def.tier, captainLuck);
    if (w > 0) drawList.push({ commodity: c, weight: w });
  }

  if (drawList.length === 0) return cargo;

  const totalDrawWeight = drawList.reduce((sum, d) => sum + d.weight, 0);
  const pickFromPool = (): Commodity => {
    let roll = Math.random() * totalDrawWeight;
    for (const d of drawList) {
      roll -= d.weight;
      if (roll <= 0) return d.commodity;
    }
    return drawList[drawList.length - 1].commodity;
  };

  let currentWeight = 0;
  const maxDraws = 12;
  let draws = 0;
  while (currentWeight < factionBudget && draws < maxDraws && stackCount() < targetStacks) {
    const commodity = pickFromPool();
    const def = COMMODITY_DEFS[commodity];

    const maxQty = def.tier <= 1 ? 8 : def.tier <= 2 ? 5 : def.tier <= 3 ? 3 : 1;
    const qty = Math.max(1, Math.ceil(Math.random() * maxQty));
    const addWeight = qty * def.weight;

    if (currentWeight + addWeight > factionBudget + 4) {
      draws++;
      continue;
    }

    cargo[commodity] += qty;
    currentWeight += addWeight;
    draws++;
  }

  return cargo;
}
