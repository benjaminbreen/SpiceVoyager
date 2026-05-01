// ── POI Definitions — Phase 1 (bespoke local POIs) ─────────────────────────
//
// Hand-authored Points of Interest tied to specific historical ports. Each
// POI surfaces a modal with a Learn tab (knowledge against cost) and a
// Converse tab (Gemini-powered NPC roleplay).
//
// See AGENTS.md → "POI System" for the full plan, including the procedural
// archetype catalog (shrine / ruin / hermitage / wreck / etc.) which lands
// in Phase 2+. Phase 1's job is to validate the modal, marker, and walk-up
// proximity flow with bespoke data only.
//
// Three location kinds:
//   - landmark   : pinned to an existing in-city landmark by `landmarkId`,
//                  resolved to that building's world position at runtime
//   - coords     : explicit [x, z] in port-local space, in-city
//   - hinterland : explicit [x, z] outside the city exclusion radius
//
// The semantic class drives the eyebrow color + 3D marker in the same way
// it drives buildings (semanticClasses.ts). Religious POIs get the purple
// plumbob; others are hover-only until the marker taxonomy expands.

import type { Commodity } from './commodities';
import type { POIMedallionKey } from './poiMedallions';
import type { SemanticClass } from './semanticClasses';

// Eight kinds total. Four groups:
//   Bespoke-only (hand-authored sites with culturally-specific NPCs):
//     'naturalist'  — covers naturalists, apothecaries, banyan factors, and
//                     other "expert who examines and teaches about goods"
//                     POIs. Class field (learned vs mercantile) carries the
//                     finer distinction; the kind drives the gameplay verb.
//   Both bespoke and procedural:
//     'garden', 'shrine'
//   Procedural-only archetypes:
//     'ruin', 'wreck', 'smugglers_cove', 'caravanserai'
//   Natural features (bespoke only for now):
//     'natural'     — distinctive landscape features (volcanoes, sacred
//                     mountains, distinctive cliffs, hot springs). Unlike
//                     the other kinds these have no NPC keeper and no
//                     commerce — the player walks/sails up and gets a
//                     lore-rich discovery toast. Learn tab is hidden when
//                     knowledgeDomain is empty; Converse tab voices the
//                     site itself or its surrounding folklore.
//
// Earlier drafts had 'temple', 'court', 'hermitage', 'battlefield', 'monastery',
// 'physick_garden', 'merchant_guild' — all folded. Religious sites (including
// Christian monasteries like Bom Jesus) fit under 'shrine'; gardens of any
// tradition fit under 'garden'; palaces/courts already render as in-city
// palace landmarks; merchant guilds collapsed into 'naturalist' since the
// Learn/Converse modal verb is identical.
export type POIKind =
  | 'naturalist'
  | 'garden' | 'shrine'
  | 'ruin' | 'wreck' | 'smugglers_cove' | 'caravanserai'
  | 'natural';

export type POILocation =
  | { kind: 'landmark'; landmarkId: string }
  | { kind: 'coords'; position: [number, number] }
  | { kind: 'hinterland'; position: [number, number] }
  | { kind: 'world'; position: [number, number] };

export interface POICost {
  type: 'gold' | 'commodity' | 'reputation';
  amount?: number;            // gold amount or rep threshold
  commodityId?: Commodity;    // for 'commodity' type
}

export type POIReward =
  | { type: 'none' }
  | { type: 'cargo'; commodityId: Commodity; min: number; max: number; chance: number }
  | { type: 'knowledge'; commodityId: Commodity; level: 1 | 2 }
  | { type: 'journal'; entryKey: string };

export interface POIDefinition {
  id: string;
  name: string;
  /** Short subtitle shown under the name on hover/toast. */
  sub?: string;
  kind: POIKind;
  class: SemanticClass;
  /** Present for local POIs; absent for world-map POIs (Phase 5+). */
  port?: string;
  location: POILocation;
  /** Commodities the player can identify (level 0 → 1) here. */
  knowledgeDomain: Commodity[];
  /** Subset upgradeable to Mastered (level 1 → 2). */
  masteryGoods: Commodity[];
  cost: POICost;
  npcName: string;
  npcRole: string;
  /** Plain first-look description shown before the player enters. */
  arrivalDescription?: string;
  /** Free-form context fed to the LLM in the Converse tab. */
  lore: string;
  /** Optional: visiting unlocks knowledge of another port. */
  unlocksPort?: string;
  /** Optional visual override for modal/map iconography. */
  medallionKey?: POIMedallionKey;
  /** True for generated POIs attached to Port.pois at map generation. */
  generated?: boolean;
  /** Broad visual/content variant within a POI kind. */
  poiVariant?: string;
  /** False for inspectable sites without a named keeper or conversation. */
  hasKeeper?: boolean;
  /** Small deterministic reward hook for generated inspectable sites. */
  reward?: POIReward;
}

// ── Phase 1 data ────────────────────────────────────────────────────────────
//
// 8 POIs across 4 ports (London, Goa, Surat, Mocha). Covers all three
// location kinds and three semantic classes (religious, learned, mercantile).
// Coordinates are first-pass guesses — tune in playtest.

export const POI_DEFINITIONS: POIDefinition[] = [
  // ── London ────────────────────────────────────────────────────────────────
  {
    id: 'london-apothecaries-hall',
    name: "Apothecaries' Hall",
    sub: 'Worshipful Society — Blackfriars',
    kind: 'naturalist',
    class: 'learned',
    port: 'london',
    location: { kind: 'landmark', landmarkId: 'apothecaries-hall' },
    knowledgeDomain: ['Aloes', 'Mumia', 'Cassia Fistula', 'China Root', 'Bezoar Stones', 'Theriac'],
    masteryGoods: ['Mumia', 'Aloes'],
    cost: { type: 'gold', amount: 80 },
    npcName: 'Master Gideon Delaune',
    npcRole: 'Apothecary, warden of the new Society',
    arrivalDescription: "You enter a narrow hall that smells of dried roots, vinegar, and old wood. Shelves hold jars of gums and powders, and a small press stands near the back room. An apothecary's bench is laid out for weighing and cutting samples.",
    lore: "Founded 1617 in our timeline, but in this 1612 the apothecaries are already campaigning for separation from the Grocers' Company. Delaune is Huguenot-born, suspicious of the College of Physicians, fluent in Latin and humoral pharmacy. The hall keeps a small physic garden and a press for Galenic compounds. He'll examine an unidentified gum or resin for a fee, but considers Paracelsian chemistry vulgar.",
  },
  {
    id: 'london-oxford',
    name: 'Oxford Physic Garden',
    sub: "Bodley's scholars — overland from London",
    kind: 'garden',
    class: 'learned',
    port: 'london',
    location: { kind: 'hinterland', position: [-160, -110] },
    knowledgeDomain: ['Theriac', 'China Root', 'Mumia', 'Lapis de Goa', 'Bezoar Stones'],
    masteryGoods: ['Theriac'],
    cost: { type: 'gold', amount: 60 },
    npcName: 'Dr Matthias Holdsworth',
    npcRole: 'Regius reader in physick',
    arrivalDescription: "The garden is laid out in square beds behind a low wall. Labels mark roots, herbs, and foreign plants in a scholar's hand. A cold lecture room stands nearby with books, dried specimens, and a table for visitors' samples.",
    lore: "Geographic licence: in 1612 Oxford lies sixty miles upriver, but on this map it sits at the rural edge of the London hinterland as the educational outpost any visiting captain might be sent to. Holdsworth corresponds with Padua and Leiden, distrusts the new Paracelsian arrivals from Prague, and is hungry for specimens from the Indies — particularly the dried roots and bezoar substitutes the Portuguese ship out of Goa. He'll read a sample for a donation and lecture for as long as the player tolerates it.",
  },

  // ── Goa ───────────────────────────────────────────────────────────────────
  {
    id: 'goa-bom-jesus',
    name: 'Bom Jesus Apothecary',
    sub: 'Jesuit pharmacy of the Casa Professa',
    kind: 'shrine',
    class: 'learned',
    port: 'goa',
    location: { kind: 'landmark', landmarkId: 'bom-jesus-basilica' },
    knowledgeDomain: ['Lapis de Goa', 'Cassia Fistula', 'Aloes', 'Camphor', 'Bezoar Stones', 'China Root'],
    masteryGoods: ['Lapis de Goa', 'Cassia Fistula'],
    cost: { type: 'gold', amount: 100 },
    npcName: 'Padre Francisco Gomes, S.J.',
    npcRole: 'Jesuit boticário',
    arrivalDescription: "A side room of the Jesuit house has been made into a pharmacy. Pellets dry on trays beside small jars of musk, coral, ambergris, and powdered stone. The air is cool, close, and sharp with resin.",
    lore: "The Bom Jesus dispensary is where the famous Lapis de Goa is compounded — Gaspar Antonio's bezoar substitute, a paste of crushed bezoar, ambergris, musk, coral and gold, dried into pellets and stamped with the IHS. Gomes inherited the recipe from old Brother Antonio. He sells the stones to Mughal courts and to Lisbon for absurd prices, and trades remedies for prayers as readily as for reales. The Goan apothecary tradition flows down from Garcia da Orta's Colóquios half a century earlier.",
  },
  {
    id: 'goa-botanical-garden',
    name: 'Malabar Spice Garden',
    sub: 'A walled compound on the Mandovi backwater',
    kind: 'garden',
    class: 'learned',
    port: 'goa',
    location: { kind: 'hinterland', position: [120, 90] },
    knowledgeDomain: ['Black Pepper', 'Ginger', 'Cardamom', 'Cinnamon', 'Cassia Fistula'],
    masteryGoods: ['Black Pepper', 'Cardamom'],
    cost: { type: 'gold', amount: 50 },
    npcName: 'Domingos Rebelo',
    npcRole: 'Mestiço foreman, third-generation Goan',
    arrivalDescription: "Pepper vines climb living poles inside a walled garden. Cardamom grows in the damp shade, and strips of bark and seed pods dry on reed mats. A foreman's shed stands open beside the path.",
    lore: "A working pepper-and-cardamom plantation kept by an old Portuguese-Konkani family, foreman Rebelo speaks four languages and remembers Garcia da Orta's name with reverence. Visitors who pay for a tour see how vines are trained on betel-nut palms, how green pepper is sun-dried into black, and how the inferior bark is sorted out before shipment. He'll grade a sample with practiced fingers.",
  },

  // ── Surat ─────────────────────────────────────────────────────────────────
  {
    id: 'surat-banyan-counting-house',
    name: "Banyan Counting House",
    sub: 'Hira Vora & Sons — Mughlisarai quarter',
    kind: 'naturalist',
    class: 'mercantile',
    port: 'surat',
    location: { kind: 'landmark', landmarkId: 'banyan-counting-house' },
    knowledgeDomain: ['Indigo', 'Bhang', 'Hides', 'Iron', 'Opium'],
    masteryGoods: ['Indigo'],
    cost: { type: 'gold', amount: 70 },
    npcName: 'Hira Vora',
    npcRole: 'Banyan factor and money-changer',
    arrivalDescription: "The counting room is low, whitewashed, and busy. Ledgers lie open on cotton rugs, with strings of accounts, brass weights, and a locked strongbox close at hand. Men sit cross-legged and speak quietly over goods and coin.",
    lore: "Vora's family has financed Mughal-era voyages out of Surat for two generations. The shop is a low whitewashed room with cushions, abacus-strings, ledger books in Gujarati script, and a heavy strongbox. He converts reales-of-eight into mahmudis at the day's rate, will grade indigo cake by snapping a corner and breathing on it, and considers most European captains charmingly ignorant of how Mughal customs duties actually work.",
  },
  {
    id: 'surat-sufi-lodge',
    name: 'Khanqah of Baba Pyare',
    sub: 'Sufi lodge in the date palm groves',
    kind: 'shrine',
    class: 'religious',
    port: 'surat',
    // Surat openDirection 'W' (sea to west, negative X). Placing the
    // hinterland khanqah at positive X keeps it inland in the date-palm
    // groves east of the city, matching the lore.
    location: { kind: 'hinterland', position: [145, 60] },
    knowledgeDomain: ['Bhang', 'Frankincense', 'Myrrh', 'Cassia Fistula'],
    masteryGoods: ['Bhang'],
    cost: { type: 'commodity', commodityId: 'Frankincense', amount: 1 },
    npcName: 'Pir Ghulam Hussain',
    npcRole: 'Chishti shaikh',
    arrivalDescription: "The lodge sits among date palms beyond the crowded streets. Men sit in the shade near a low prayer room, and a stone mortar holds a green paste. Smoke from a small brazier hangs under the trees.",
    lore: "An old Chishti khanqah a half-day's walk inland, where dervishes gather for sama and the slow grinding of bhang into majoon paste. The Pir is half-blind, courteous, and entirely uninterested in money — visitors offer frankincense, dates, or recitation. Cannabis is taken here as a sacrament, not a commodity, and the Pir will speak frankly about its preparation only after the ritual is observed.",
  },

  // ── Mocha ─────────────────────────────────────────────────────────────────
  {
    id: 'mocha-shadhili-coffee',
    name: 'Coffee Lodge of al-Shādhilī',
    sub: 'Sufi tomb, mosque, and qahveh-khane',
    kind: 'shrine',
    class: 'religious',
    port: 'mocha',
    location: { kind: 'landmark', landmarkId: 'al-shadhili-mosque' },
    knowledgeDomain: ['Coffee', 'Frankincense', 'Myrrh', 'Aloes'],
    masteryGoods: ['Coffee'],
    cost: { type: 'commodity', commodityId: 'Myrrh', amount: 1 },
    npcName: 'Shaikh Ali ibn Umar',
    npcRole: 'Servant of the tomb',
    arrivalDescription: "A small mosque and tomb stand beside a coffee room. Beans roast over coals, and the bitter smell carries into the lane. Pilgrims sit with cups before the night prayers.",
    lore: "The shrine of Ali ibn Umar al-Shādhilī, patron saint of coffee — the legend in Mocha holds that he learned of qahwa from goats grazing the ridges of Yemen's interior. Pilgrims drink the bitter brew before midnight prayers; merchants buy it by the camel-load below in the harbor. Shaikh Ali is the saint's namesake and keeper of the boil. He grades beans by smell and grade-roasts a sample on a long iron over coals.",
  },
  // ── Calicut ───────────────────────────────────────────────────────────────
  {
    id: 'calicut-mappila-house',
    name: 'Mappila Trading House',
    sub: 'Kuttichira ward — Mappila merchant compound',
    kind: 'naturalist',
    class: 'mercantile',
    port: 'calicut',
    location: { kind: 'landmark', landmarkId: 'mappila-house' },
    knowledgeDomain: ['Black Pepper', 'Ginger', 'Cardamom', 'Cinnamon', 'Frankincense', 'Ivory'],
    masteryGoods: ['Black Pepper', 'Ginger'],
    cost: { type: 'gold', amount: 75 },
    npcName: 'Kunhi Marakkar',
    npcRole: 'Mappila pepper-broker',
    arrivalDescription: "The compound opens onto a shaded courtyard stacked with pepper sacks. The air is hot and dry with spice dust. Clerks mark bales while brokers test the black corns between finger and teeth.",
    lore: "The Mappilas of Malabar are descendants of Arab traders who settled the coast over centuries and married into the Nair and fisher castes — Sunni Muslims, Malayalam-speaking, fluent in Arabic for the books and the Friday sermon. For three centuries before the Portuguese arrived they ran the pepper trade between the Malabar hinterland and Aden, Hormuz, and Cairo. The Marakkar family is one of the great Mappila houses — Kunhi grades pepper by sniff and snap, knows the upcountry estate by name for every sack in his godown, and remembers vividly how his grandfather's fleet was burned at Cochin. He'll deal civilly with European captains but considers the Estado da Índia a family enemy.",
  },

  // ── Macau ─────────────────────────────────────────────────────────────────
  {
    id: 'macau-colegio-sao-paulo',
    name: 'Colégio de São Paulo',
    sub: 'Jesuit college, gateway of the China mission',
    kind: 'naturalist',
    class: 'learned',
    port: 'macau',
    location: { kind: 'landmark', landmarkId: 'colegio-sao-paulo' },
    knowledgeDomain: ['China Root', 'Camphor', 'Rhubarb', 'Mumia', 'Musk', 'Bezoar Stones', 'Tea'],
    masteryGoods: ['China Root', 'Camphor'],
    cost: { type: 'gold', amount: 110 },
    npcName: 'Padre Manuel Dias, S.J.',
    npcRole: 'Jesuit astronomer and rector',
    arrivalDescription: "The college stands above the harbor with classrooms, a chapel, and a small dispensary. Chinese books and European charts share the same tables. A few students move through the shade carrying paper, roots, and ink.",
    lore: "Founded 1594 on the hill above the Macau peninsula, the Colégio is where new Jesuits to the China mission learn Mandarin, Confucian classics, and the protocols of Beijing before being sent north. Matteo Ricci died in Beijing two years ago (1610) and his successor Niccolò Longobardo runs the inland mission; here in Macau, Padre Manuel Dias the Younger is rector and a competent astronomer. The college keeps a working botanica with Chinese pharmacopoeia texts, a small dispensary of huang-qin, ginseng, and ti-fu-ling (China root), and Ricci's mappa mundi on the wall. Dias is courteous, learned, and cautious — he will trade pharmacological knowledge for European specimens but is wary of revealing too much about the mission's standing in Beijing.",
  },

  // ── Mombasa ───────────────────────────────────────────────────────────────
  {
    id: 'mombasa-fort-apothecary',
    name: 'Garrison Apothecary',
    sub: 'Surgeon-barber of Fort Jesus',
    kind: 'naturalist',
    class: 'learned',
    port: 'mombasa',
    location: { kind: 'landmark', landmarkId: 'fort-jesus' },
    knowledgeDomain: ['Aloes', 'Frankincense', 'Myrrh', 'Ivory', 'Bezoar Stones', 'Cassia Fistula'],
    masteryGoods: ['Aloes', 'Ivory'],
    cost: { type: 'gold', amount: 65 },
    npcName: 'Mestre Jorge Carneiro',
    npcRole: 'Cirurgião-barbeiro of the garrison',
    arrivalDescription: "The dispensary is tucked inside the fort's stone casemate. Bandages, knives, jars of gum resin, and a barber's basin sit on a rough table. Outside the door, soldiers pass in the glare of the courtyard.",
    lore: "Fort Jesus, completed 1593 by the Portuguese on the headland of Mombasa Old Town, holds a permanent garrison of around a hundred soldiers, sailors recovering from scurvy, and a small dispensary in the casamatas where Mestre Carneiro plies the trade of cirurgião-barbeiro — surgeon, blood-letter, tooth-puller, dispenser of Galenic remedies. The Swahili coast supplies aloes, ivory, and Hadhrami gum-resins overland; he buys from Swahili and Hadhrami factors and sells European theriac and quicksilver back. Carneiro has been here eight years, speaks creditable Swahili, lost two fingers to a fever sore, and is bored enough to talk at length to any captain who'll listen.",
  },

  {
    id: 'mocha-aloe-camp',
    name: 'Hadhrami Aloe Camp',
    sub: "Itinerant naturalists' tents on the salt flats",
    kind: 'naturalist',
    class: 'learned',
    port: 'mocha',
    location: { kind: 'hinterland', position: [165, -85] },
    knowledgeDomain: ['Aloes', 'Frankincense', 'Myrrh', 'Camphor'],
    masteryGoods: ['Aloes', 'Frankincense'],
    cost: { type: 'gold', amount: 55 },
    npcName: 'Hakim Saʼid al-Hadhrami',
    npcRole: 'Hadhrami physician, gum-collector',
    arrivalDescription: "A few tents stand on the salt flats beyond Mocha. Bundles of aloe leaves and sacks of resin are kept under shade cloth. The ground is white with salt, and the wind carries dust from the hills.",
    lore: "A seasonal camp of Hadhrami collectors who range up the Tihama coast and across to Socotra each year for aloe and the resin tears of frankincense and myrrh. Sa'id is a hakim trained in Yemeni medicine — he reads the qarurah (urine flask), composes electuaries, and grades resin by snap and color. He'll teach a visitor to tell Socotran aloe (clean amber) from inferior Cape aloe (greenish-black) for a fee.",
  },

  // ── Phase 3 — Bespoke breadth pass (2026-04-29) ────────────────────────────
  // Eight POIs covering the major ports that previously had none. Each is
  // placed in the deep hinterland (≥180u from city center) opposite the
  // port's openDirection so the player has to actually explore inland to
  // reach it. Bespoke geometry lives in src/components/poi/*.tsx and is
  // dispatched by BespokePOIs.tsx — POISilhouettes skips these ids so we
  // don't double-render.

  // ── Socotra ───────────────────────────────────────────────────────────────
  {
    id: 'socotra-dragons-blood-grove',
    name: "Dracaena Cinnabari Grove",
    sub: 'Diksam plateau — keeper of the dragon trees',
    kind: 'garden',
    class: 'learned',
    port: 'socotra',
    // Socotra is a Small-scale island (islandCoverage 0.15, aspectRatio 2.5,
    // orientation 80° → long axis ~E-W). At Small scale the local map only
    // ~600u across, and harbor is on the N coast (city sits north). Coords
    // pulled in to (-95, -10) — well west of city center, on the island's
    // spine, where the real Diksam plateau actually sits. The snapper will
    // pull this onto land if the seed shifts the island slightly.
    location: { kind: 'hinterland', position: [-95, -10] },
    knowledgeDomain: ['Aloes', 'Frankincense', 'Myrrh', 'Bezoar Stones'],
    masteryGoods: ['Aloes'],
    cost: { type: 'gold', amount: 45 },
    npcName: 'Hakim Yusuf bin Ahmad al-Mahri',
    npcRole: 'Mahri tree-tapper, lay physician',
    arrivalDescription: "You come onto a dry limestone shelf dotted with dragon's blood trees. Their pale trunks fork into flat green crowns, and a small stone hut stands inside a low wall. Clay pots near the trees hold dark red resin.",
    lore: "The dragon's blood tree, dam al-akhawayn — \"the blood of the two brothers\" — is a Dracaena that grows only on Socotra's limestone plateau. Yusuf is from the Mahra coast, comes up to Diksam each spring to slit the bark and collect the dark crimson resin in clay pots. The resin sells across the Indian Ocean as a varnish, a wound-staunch, a tooth-paste, a rumored aphrodisiac. He keeps a small stone hut here with a thatched roof of date-palm leaf, brews qishr coffee for visitors, and considers the Portuguese garrison at Hadibo (down the mountain, to the north coast) a noisy nuisance. He's quietly a Sufi of the Ba ʻAlawi tariqa — the island has a long Hadhrami Sufi history that long predates Islam's arrival here in the 9th century.",
  },

  // ── Hormuz ────────────────────────────────────────────────────────────────
  {
    id: 'hormuz-pearl-divers-bazaar',
    name: 'Pearl Divers\' Bazaar',
    sub: "Outer reef of the Strait — Bandar Khun",
    kind: 'naturalist',
    class: 'mercantile',
    port: 'hormuz',
    // Hormuz is a tiny salt-dome island; openDirection 'N' → inland south.
    // Pulled coord in to (50, 90) so it lands on the island even at the
    // smaller Small-scale local map. The snapper will nudge if needed.
    location: { kind: 'hinterland', position: [50, 90] },
    knowledgeDomain: ['Pearls', 'Red Coral', 'Ambergris', 'Bezoar Stones', 'Frankincense'],
    masteryGoods: ['Pearls'],
    cost: { type: 'gold', amount: 90 },
    npcName: 'Sayyid Murad al-Lari',
    npcRole: 'Lari pearl-broker',
    arrivalDescription: "The compound sits on bright sand above the pearl water. Oyster shells dry in heaps, and small dhows lie pulled up near a wooden pier. Inside the sorting house, brass scales wait beside trays lined with cloth.",
    lore: "The pearl banks of the Persian Gulf are worked seasonally by Bahraini, Qatari, and Lari divers; in 1612 the trade is administered out of Hormuz under the Portuguese Estado da Índia, which takes a heavy cut. Sayyid Murad's family runs a beachside compound on the south side of Hormuz island — drying yards, a sorting house with brass scales, a pier where the small dhows beach at dusk to land their oysters. He grades pearls by the lamp-light test (\"a true pearl drinks the candle\") and knows every reef and pearl-bed from Bahrain to Cape Mussandam. He'll explain the ranking system — jiwani, danah, badla — for a fee, and grumbles bitterly about the Portuguese pearl-tax.",
  },

  // ── Masulipatnam ──────────────────────────────────────────────────────────
  {
    id: 'masulipatnam-golconda-broker',
    name: 'Golconda Diamond Brokerage',
    sub: 'Inland from the delta — agent of the Qutb Shahi mines',
    kind: 'naturalist',
    class: 'mercantile',
    port: 'masulipatnam',
    // Masulipatnam openDirection 'E' → inland west (-X). The diamond mines
    // (Kollur, Paritala, etc.) lie west and south of Golconda inland.
    location: { kind: 'hinterland', position: [-220, -40] },
    // Diamonds and saltpeter are central to the lore but not in the trade
    // commodity registry — knowledgeDomain covers the adjacent Coromandel
    // goods Mir Jumla also handles. Diamonds remain a Converse-only topic.
    knowledgeDomain: ['Indigo', 'Bhang', 'Opium', 'Quicksilver', 'Mumia'],
    masteryGoods: ['Indigo', 'Bhang'],
    cost: { type: 'gold', amount: 140 },
    npcName: 'Mir Jumla Ardestani',
    npcRole: 'Persian diamond-broker for the Qutb Shahi crown',
    arrivalDescription: "A whitewashed brokerage house stands behind a high wall. The windows are grilled, and the courtyard is quiet except for water in a small basin. At the back, a teak door bound with iron leads to the strongroom.",
    lore: "The Golconda mines — Kollur on the Krishna, Paritala, Wajra Karur — are the world's only known source of large diamonds in 1612, decades before Brazilian finds. Stones are graded and certified at brokerage houses around Hyderabad, then escorted overland down to Masulipatnam for shipment. Mir Jumla is one of many Persian Shia merchants the Qutb Shahi sultans favor; his brokerage compound here is a low whitewashed building with grilled windows, an inner courtyard with a fountain, and a strongroom of teak and iron. He grades by water-droplet test and candle-flame refraction, weighs in mangalams (a Telugu unit), and considers most European captains not worth speaking to in person — they get an underling. He handles diamonds primarily but also indigo, bhang and opium from the Coromandel hinterland and Persian quicksilver inbound. To buy his time you pay in gold and patience.",
  },

  // ── Bantam ────────────────────────────────────────────────────────────────
  {
    id: 'bantam-pepper-warehouses',
    name: 'Sundanese Pepper Warehouses',
    sub: 'Pasar Karangantu — south of the kraton walls',
    kind: 'naturalist',
    class: 'mercantile',
    port: 'bantam',
    // Bantam openDirection 'N' → inland south (+Z). The pepper-growing
    // hinterland of the Banten sultanate is the Sundanese highlands south.
    location: { kind: 'hinterland', position: [60, 220] },
    knowledgeDomain: ['Black Pepper', 'Cloves', 'Nutmeg', 'Camphor', 'Tobacco', 'Betel Nut'],
    masteryGoods: ['Black Pepper', 'Cloves'],
    cost: { type: 'gold', amount: 85 },
    npcName: 'Pangeran Wijayakusuma',
    npcRole: 'Sundanese pepper-syahbandar',
    arrivalDescription: "Long bamboo warehouses stand south of the kraton walls. Pepper sacks are piled under thatch, and the floor is black with dust from split bags. Porters move between the scales and the shade.",
    lore: "The Sultanate of Banten is the great pepper hub of western Java in 1612 — Sundanese hill-villages send sacks down to the port through a chain of regional collectors, and the syahbandar (harbormaster's commercial agent) controls who buys what. The English EIC and Dutch VOC both have factories on the foreshore but distrust each other so violently that a third party often does better than either. Wijayakusuma's compound is a great bamboo-and-thatch godown south of the kraton, smelling of pepper-dust and clove-smoke. He weighs in pikuls, will sample a bag's pungency by chewing two corns, and considers the European factors quarrelsome children. He has a soft spot for Mappila and Persian merchants, both of whom were here generations before any Dutch arrived.",
  },

  // ── Bantam — Krakatoa ─────────────────────────────────────────────────────
  // Natural-feature POI. Bantam openDirection 'N' → sea is to -Z. Place
  // Krakatoa offshore northwest in the Sunda Strait, far from the harbor
  // approach lanes and well outside the playable city footprint. The cone
  // brings its own island geometry — the snap predicate for 'natural' POIs
  // skips the land-check so a deep-water authored coord is honored verbatim.
  {
    id: 'bantam-krakatoa',
    name: 'Krakatoa',
    sub: 'Smoking island in the Sunda Strait',
    kind: 'natural',
    class: 'civic',                  // no obvious semantic class — 'civic' eyebrow reads as "landmark"
    port: 'bantam',
    location: { kind: 'hinterland', position: [-300, -360] },
    knowledgeDomain: [],             // natural features have no commerce — Learn tab hides when empty
    masteryGoods: [],
    cost: { type: 'gold', amount: 0 },
    npcName: 'The mountain itself',
    npcRole: 'Sentinel of the Sunda strait',
    arrivalDescription: "A dark volcanic island rises out of the strait. Smoke lifts from the high cone, and forest covers the lower slopes. The beach is empty except for stone, driftwood, and the sound of surf.",
    lore: "Pulau Rakata, called Krakatoa by the Dutch — a forested volcanic island in the strait between Java and Sumatra, three peaks stitched together by old lava flows, the tallest reaching some six hundred fathoms above the sea. In 1612 it is quiet; the great cataclysm that will hollow the island and drown its villagers lies more than two and a half centuries off (1883). For now Bantamese fisherfolk and Lampung pepper-traders cross its shadow daily, and Sundanese pilots use the smoking cone as a sea-mark for the strait. The locals say the spirit of the mountain is irritable but slow to wake; offerings of rice and kemenyan (benzoin) are left at a small shrine on the southern shore. The Dutch chartmakers do not yet know what is sleeping under it.",
  },

  // ── Nagasaki ──────────────────────────────────────────────────────────────
  {
    id: 'nagasaki-jesuit-press',
    name: 'Jesuit Press at Todos os Santos',
    sub: 'Hilltop seminary — Christian century, last years',
    kind: 'naturalist',
    class: 'learned',
    port: 'nagasaki',
    // Nagasaki openDirection 'W' → inland east (+X). Hilltop seminary above
    // the harbor on the slopes east of the bay.
    location: { kind: 'hinterland', position: [200, 80] },
    knowledgeDomain: ['China Root', 'Camphor', 'Mumia', 'Musk', 'Theriac', 'Tea'],
    masteryGoods: ['Camphor', 'Tea'],
    cost: { type: 'gold', amount: 130 },
    npcName: 'Padre João Rodrigues Tçuzu, S.J.',
    npcRole: 'Jesuit grammarian, court interpreter',
    arrivalDescription: "The seminary stands on a hill above Nagasaki harbor. A small press room smells of ink, oil, and damp paper. Wooden type, Latin books, and Japanese sheets are stacked beside the chapel wall.",
    lore: "Nagasaki in 1612 is the last great Christian city east of Manila — the Jesuit church of Todos os Santos sits on the hill above the harbor, with a Latin grammar school, a printing press that produces Christian texts in romanized Japanese (rōmaji), and a Tridentine seminary. Padre Rodrigues — \"Tçuzu\" (the interpreter) — was court interpreter to Hideyoshi and Ieyasu, speaks fluent Japanese and Mandarin, has compiled the first Japanese-Portuguese grammar (Arte da Lingoa de Iapam, Nagasaki 1604–08) and dictionary. The shogunate has begun cooling toward foreign clergy; the Edict of Expulsion comes in 1614, and Rodrigues will be exiled to Macau. For now he runs the press, corresponds with the Beijing mission, and trades pharmacological knowledge — Japanese camphor, Chinese ginseng, theriac formulas — for European books. Cautious, learned, melancholy.",
  },

  // ── Manila ────────────────────────────────────────────────────────────────
  {
    id: 'manila-parian-silk-market',
    name: 'Parián de los Sangleys',
    sub: 'Chinese silk-and-porcelain quarter, outside the walls',
    kind: 'naturalist',
    class: 'mercantile',
    port: 'manila',
    // Manila openDirection 'W' → inland east (+X). The historical Parián was
    // just outside Intramuros' eastern wall; here we push it further inland
    // to enforce the explore-for-it feel.
    location: { kind: 'hinterland', position: [220, -40] },
    knowledgeDomain: ['Chinese Porcelain', 'Tea', 'China Root', 'Musk', 'Camphor', 'Japanese Silver'],
    masteryGoods: ['Chinese Porcelain', 'Tea'],
    cost: { type: 'gold', amount: 100 },
    npcName: 'Don Lim Tiong-co',
    npcRole: 'Sangley merchant, baptized in 1601',
    arrivalDescription: "The market quarter stands outside the Spanish walls. Teak galleries look down on stalls of silk, porcelain, roots, and lacquered boxes. Chinese merchants bargain under watchful guards.",
    lore: "The Parián is the quarter of the sangleys — the Hokkien Chinese trader community of Manila — who supply the silk, porcelain, and chinaware that the annual Manila Galleon carries across the Pacific to Acapulco. In 1612 there are roughly twenty thousand sangleys to a few thousand Spanish; the Parián sits outside the city walls under suspicious oversight (the Spanish massacred Chinese twice already, in 1603 and at intervals before). Don Lim Tiong-co runs a silk warehouse and porcelain-display hall, takes Spanish baptism without giving up his Fujianese ancestor altars, and trades with anyone — Spaniards, Portuguese from Macau, Dutch interlopers, Japanese, even the occasional Mughal. The compound has a teakwood gallery, a porcelain showroom with Ming pieces under taut silk, and an inner courtyard where he prefers to negotiate.",
  },

  // ── Aden ──────────────────────────────────────────────────────────────────
  {
    id: 'aden-customs-hakim',
    name: 'Ottoman Customs House',
    sub: "Inland watchtower — Tawila cisterns hakim",
    kind: 'naturalist',
    class: 'learned',
    port: 'aden',
    // Aden openDirection 'S' → inland north (-Z). Tawila cisterns sit
    // inland of the volcanic crater bowl that forms Aden's harbor.
    location: { kind: 'hinterland', position: [60, -200] },
    knowledgeDomain: ['Coffee', 'Frankincense', 'Myrrh', 'Aloes', 'Mumia'],
    masteryGoods: ['Coffee', 'Myrrh'],
    cost: { type: 'gold', amount: 70 },
    npcName: 'Hakim Sulayman al-Adani',
    npcRole: 'Yemeni customs officer and physician',
    arrivalDescription: "The customs house stands near the old cisterns in the volcanic rock. Caravan bales are stacked in the shade, and resin tears sit on trays for inspection. A guard watches the door from a strip of hard sun.",
    lore: "Aden in 1612 has been Ottoman for nearly seventy years — Yemen Eyalet, ruled out of San'a, with a Janissary garrison and a customs administration that taxes everything moving north up the Red Sea or south toward the Gulf. Sulayman is a hakim from a long Adani family; he runs the customs house at the inland edge of the city by the famous Tawila cisterns (rock-cut reservoirs in the volcanic crater walls) and supplements his salary by grading caravan-borne resins for visiting merchants. He drinks qishr (the husk-and-ginger coffee Yemenis prefer to the Mocha bean), reads the qarurah, and has strong opinions about which Ethiopian coffee is superior to the Yemeni ridge crop (he says none are).",
  },

  // ── Malacca ───────────────────────────────────────────────────────────────
  {
    id: 'malacca-chetty-compound',
    name: 'Chetty Trading Compound',
    sub: 'Tamil merchant quarter, inland of the Portuguese fort',
    kind: 'naturalist',
    class: 'mercantile',
    port: 'malacca',
    // Malacca openDirection 'E' → harbor faces east (-X is inland). The
    // Tamil quarter under Portuguese rule sat inland of the bazaar.
    location: { kind: 'hinterland', position: [-200, 30] },
    knowledgeDomain: ['Black Pepper', 'Indigo', 'Tamarind', 'Camphor', 'Benzoin', 'Betel Nut'],
    masteryGoods: ['Indigo', 'Tamarind'],
    cost: { type: 'gold', amount: 90 },
    npcName: 'Murugan Chetty',
    npcRole: 'Nattukottai Chettiar headman',
    arrivalDescription: "A walled Tamil compound sits inland from the Portuguese fort. Cotton bales, indigo cakes, and account books fill the shaded rooms. A small shrine stands near the gate, with oil smoke on the stone.",
    lore: "The Tamil merchants of Malacca — Chettiars, originally from the Chola country in southern India — arrived through the Bay of Bengal trading networks long before the Portuguese took the city in 1511. Under the Estado they kept their Hindu shrines, their account-book Tamil, and a walled quarter inland of the main bazaar. Murugan Chetty handles consignments of indigo-dyed cottons from the Coromandel ports (Pulicat, Masulipatnam) and resells them to Javanese, Bugis, and Chinese buyers, with a moneylending arm running in parallel. He prefers payment in Spanish reales of eight, distrusts the Dutch (whose iconoclasm against Hindu and Catholic shrines he resents in equal measure), and considers the Portuguese garrison a tax he pays for the privilege of doing what his great-great-grandfather did before any European arrived.",
  },

  // ── Lisbon ────────────────────────────────────────────────────────────────
  {
    id: 'lisbon-casa-da-india',
    name: 'Casa da Índia',
    sub: 'Royal warehouses, Ribeira waterfront',
    kind: 'naturalist',
    class: 'mercantile',
    port: 'lisbon',
    // The historical Casa stood on the Ribeira waterfront, central to the
    // main harbor rather than downriver at Belém. Keep it near the city core
    // so the snapper does not pull it onto the western tower site.
    location: { kind: 'coords', position: [28, -36] },
    knowledgeDomain: ['Black Pepper', 'Cinnamon', 'Cloves', 'Nutmeg', 'Chinese Porcelain', 'Camphor'],
    masteryGoods: ['Black Pepper', 'Cinnamon'],
    cost: { type: 'gold', amount: 120 },
    npcName: 'Dom Vasco Aranha',
    npcRole: 'Provedor da Casa da Índia',
    arrivalDescription: "The royal warehouses face the Tagus. Pepper, cinnamon, porcelain, and bales from India pass through guarded doors. Clerks sit at long tables turning cargo into weights, duties, and royal claims.",
    lore: "Every cargo coming home from the Estado da Índia is registered, weighed, and assessed at the Casa da Índia on the Tagus waterfront — the old Casa da Mina expanded into a sprawling complex of three warehouses, the great pepper hall, the porcelain rooms, and the lapidary chamber where Goan diamonds are inventoried. Royal customs guards and Hieronymite friars oversee tithing. Aranha is a fidalgo of modest birth who climbed through the Estado bureaucracy at Cochin and Hormuz before the king recalled him. He is tired, professionally cynical, and can quote pepper prices going back to the 1580s. The union of crowns under Philip III since 1580 has stripped much of the Casa's authority — Madrid wants the spice trade run from Seville — and Aranha takes wry satisfaction in finding small ways to obstruct that.",
  },

  // ── Seville ───────────────────────────────────────────────────────────────
  {
    id: 'seville-casa-contratacion',
    name: 'Casa de la Contratacion',
    sub: 'Royal Indies registry, Alcazar precinct',
    kind: 'naturalist',
    class: 'mercantile',
    port: 'seville',
    // The Casa operated from the Alcazar precinct, near the cathedral and
    // river-facing trade district rather than directly on a wharf. This point
    // sits on generated land with the Guadalquivir still close enough to read.
    location: { kind: 'coords', position: [50, -20] },
    knowledgeDomain: ['Tobacco', 'Virginia Tobacco', 'Sugar', 'Hides', 'Sassafras', 'Quicksilver'],
    masteryGoods: ['Tobacco', 'Sugar'],
    cost: { type: 'gold', amount: 105 },
    npcName: 'Licenciado Alonso de Valdes',
    npcRole: 'Casa examiner and registry clerk',
    arrivalDescription: "The registry rooms are cool and crowded with paper. Pilots, merchants, and clerks wait under painted beams while cargo lists are checked line by line. The smell is ink, wax, leather, and river mud.",
    lore: "The Casa de la Contratacion controls the legal machinery of Spain's Atlantic empire: pilot licensing, cargo registers, passenger permissions, cosmographical charts, bullion tallies, and inspections for goods arriving from the Indies. In 1612 its power still runs through Seville even as merchants complain that the Guadalquivir silts and larger ships work downriver at Sanlucar and Cadiz. Valdes is not a sailor. He is a sharp, ink-stained official who understands tobacco, hides, sugar, quicksilver, and silver accounts because every chest must become a line in a ledger before it becomes royal revenue.",
  },

  // ── Manila ───────────────────────────────────────────────────────────────
  {
    id: 'manila-sangley-parian',
    name: 'Sangley Parian',
    sub: 'Chinese silk and porcelain quarter outside Intramuros',
    kind: 'naturalist',
    class: 'mercantile',
    port: 'manila',
    // The Parian sat outside the Spanish walled city, close to the commercial
    // edge of Manila rather than inside Intramuros. This authored point is on
    // generated land near water, but the renderer owns no fake shoreline.
    location: { kind: 'coords', position: [-90, 60] },
    knowledgeDomain: ['Chinese Porcelain', 'Tea', 'China Root', 'Camphor', 'Rhubarb', 'Star Anise'],
    masteryGoods: ['Chinese Porcelain', 'China Root'],
    cost: { type: 'gold', amount: 95 },
    npcName: 'Don Lim Tiong-co',
    npcRole: 'Sangley broker and porcelain factor',
    arrivalDescription: "The Parian is packed tight against the edge of the Spanish city. Porcelain bowls gleam in open-front rooms, and bolts of silk hang from upper galleries. Guards stand near the lane while brokers call customers inside.",
    lore: "The Parian is Manila's Chinese merchant quarter, where Hokkien-speaking sangleys supply the silk, porcelain, lacquerware, tea, roots, and drugs that Spanish officials move across the Pacific in the Acapulco galleon. It sits outside Intramuros under close supervision after the violence of 1603, but the city cannot function without it. Lim Tiong-co keeps baptismal papers for Spanish officials, ancestor tablets for his household, and two sets of ledgers. He grades porcelain by ring and translucence, knows which roots came through Fujian apothecaries, and bargains as if every question has three prices.",
  },

  // ── Venice ────────────────────────────────────────────────────────────────
  {
    id: 'venice-theriac-spezieria',
    name: 'Spezieria al Cedro',
    sub: 'Theriac workshop on the Riva del Vin, Rialto',
    kind: 'naturalist',
    class: 'learned',
    port: 'venice',
    // Venice openDirection 'E' → lagoon is east (+X), inland sestieri to -X.
    // Keep this inside the built-up Rialto fabric rather than trying to snap
    // the bespoke model to a generated waterline.
    location: { kind: 'coords', position: [-58, 18] },
    knowledgeDomain: ['Theriac', 'Mumia', 'Saffron', 'Rhubarb', 'Frankincense', 'Cardamom'],
    masteryGoods: ['Theriac', 'Saffron'],
    cost: { type: 'gold', amount: 110 },
    npcName: 'Maestro Stefano da Zen',
    npcRole: 'Theriac master under the Provveditori alla Sanità',
    arrivalDescription: "The shop opens onto a narrow Venetian lane near the Rialto. Dried roots, sealed crocks, and hanging viper flesh fill the front room. Behind an iron grille, a worktable waits for the public mixing of theriac.",
    lore: "Theriac is the prestige polypharmacy of European medicine — the Andromachus formula, sixty-four ingredients, mixed once a year in a public ceremony at the Rialto under the eye of the Republic's health magistrates. Maestro da Zen is one of about a dozen Venetian masters licensed to compound it. His shop on the Riva del Vin has the iron-grilled display window where the year's mixing is conducted in view of any passerby, dried viper-flesh hanging from the rafters (vipera carne is one of the prestige ingredients), and a brass scale shipped up from Augsburg. He buys mumia from Cairo, cinnamon from Aleppo, and gentian root from the Tyrolean valleys. The seal of San Marco on a sealed crock of theriac doubles its price in any apothecary from Lyon to Buda. He hates the Genoese.",
  },

  // ── Jamestown ────────────────────────────────────────────────────────────
  {
    id: 'jamestown-rolfe-tobacco-patch',
    name: "Rolfe's Tobacco Patch",
    sub: 'Cleared ground outside the palisade — Trinidad-strain seed, first crop',
    kind: 'garden',
    class: 'mercantile',
    port: 'jamestown',
    // Jamestown openDirection 'E' → river east, inland west (-X). Patch sits
    // in cleared ground on the marshy peninsula outside the palisade.
    location: { kind: 'hinterland', position: [-150, 60] },
    knowledgeDomain: ['Virginia Tobacco', 'Tobacco', 'Sassafras', 'Indigo'],
    masteryGoods: ['Virginia Tobacco'],
    cost: { type: 'gold', amount: 50 },
    npcName: 'John Rolfe',
    npcRole: 'Yeoman planter, recently widowed',
    arrivalDescription: "A small tobacco patch has been cleared outside the palisade. Young plants stand in rough rows above wet ground. A shed nearby holds seed, hoes, and leaves hung to dry.",
    lore: "Rolfe arrived 1610 on the third supply, lost his wife Sarah and infant daughter Bermuda to the crossing, and has just this spring planted a small experimental crop of Spanish-seed tobacco — Nicotiana tabacum, the Trinidad strain, smuggled out at considerable personal risk — on cleared ground just west of the palisade. The native Powhatan tobacco is harsh and unmarketable; the Spanish leaf is what London apothecaries pay for. The first Virginia harvest will go to England next year and will, within a decade, become the colony's only viable export. None of this is yet known. Rolfe is a quiet, methodical man, half-broken by grief, drawn to Pocahontas (the Powhatan chief's daughter, currently held hostage at Henricus) for reasons he has not articulated to himself. He will talk plant-husbandry with anyone who will listen.",
  },

  // ── Havana ────────────────────────────────────────────────────────────────
  {
    id: 'havana-tabaquero-shed',
    name: "Tabaquero's Curing Shed",
    sub: 'Vega outside the city walls, sun-cured Cuban leaf',
    kind: 'naturalist',
    class: 'mercantile',
    port: 'havana',
    // Havana openDirection 'N' → harbor faces north, inland is +Z. The vega
    // sits on the outskirts toward the south, away from the customs walls.
    location: { kind: 'hinterland', position: [80, 200] },
    knowledgeDomain: ['Tobacco', 'Sugar', 'Hides', 'Sassafras'],
    masteryGoods: ['Tobacco'],
    cost: { type: 'gold', amount: 60 },
    npcName: 'Don Diego Mendoza',
    npcRole: 'Vega owner, Canary Islands émigré',
    arrivalDescription: "The curing shed stands beside a sunlit tobacco field. Leaves hang from poles under the eaves, turning brown in the heat. The packed-earth floor smells of smoke, sweat, and green leaf.",
    lore: "Cuban leaf — the real article, sun-cured on long racks under wooden eaves, fermented in pile, cut for chewing or twisted into rolls for smoking — is just becoming the island's signature export in 1612. The Casa de la Contratación in Seville taxes it; English raiders are already trying to intercept the leaf on the run home; and the church remains uncertain whether smoking is licit. Mendoza came across from Tenerife twenty years ago, married into a creole vega-owning family, and runs a small sun-cured plot with hired workers and his three sons. He chews a quid all day, has views on which cabildos are corrupt (most of them), and cuts a discreet deal with Sangley sailors off the Manila Galleon who carry private bales as far as Mexico City.",
  },

  // ── Future / deferred ─────────────────────────────────────────────────────
  // Banda Neira nutmeg grove + orang kaya compound — proposed but not yet
  // wired. Banda is geographically too distant from Bantam (~3000km east in
  // Maluku) to anchor as a Bantam-zone hinterland POI; cleanest path is to
  // add Banda Neira as its own small island port (alongside Socotra/Diu)
  // with the nutmeg grove and a Fort Nassau silhouette across the strait.
  // Decision pending. See AGENTS.md → POI System.
  //
  // Cinco Chagas wreck — was a bespoke entry; removed in favor of the
  // procedural wreck archetype. Wrecks have no recurring named NPC and so
  // get nothing structural from the bespoke slot.
];

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * All POIs visible at a port — bespoke (from POI_DEFINITIONS) merged with
 * procedural ones attached to the port at gen time (Phase 2+ shrines, etc).
 *
 * Accepts either a port id (legacy callers, returns bespoke only) or a
 * port-shaped object (preferred, returns bespoke + procedural).
 */
export function getPOIsForPort(
  port: string | { id: string; pois?: POIDefinition[] },
): POIDefinition[] {
  if (typeof port === 'string') {
    return POI_DEFINITIONS.filter((poi) => poi.port === port);
  }
  const bespoke = POI_DEFINITIONS.filter((poi) => poi.port === port.id);
  return port.pois && port.pois.length > 0
    ? [...bespoke, ...port.pois]
    : bespoke;
}

/** Lookup a POI by id. Searches bespoke definitions first, then the optional
 *  port's procedural list. */
export function getPOIById(
  id: string,
  port?: { pois?: POIDefinition[] },
): POIDefinition | undefined {
  const bespoke = POI_DEFINITIONS.find((poi) => poi.id === id);
  if (bespoke) return bespoke;
  return port?.pois?.find((poi) => poi.id === id);
}

/**
 * Resolve a POI's local-map (x, z) position. For `landmark` POIs we look up
 * the bound building on the port; if missing, returns null. Caller is
 * responsible for adding the terrain Y when rendering.
 */
export function resolvePOIPosition(
  poi: POIDefinition,
  port: { buildings: { type: string; landmarkId?: string; position: [number, number, number] }[] },
): { x: number; z: number; building?: { position: [number, number, number] } } | null {
  switch (poi.location.kind) {
    case 'coords':
    case 'hinterland':
    case 'world':
      return { x: poi.location.position[0], z: poi.location.position[1] };
    case 'landmark': {
      const id = poi.location.landmarkId;
      const b = port.buildings.find((b) => b.type === 'landmark' && b.landmarkId === id);
      if (!b) return null;
      return { x: b.position[0], z: b.position[2], building: b };
    }
  }
}
