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
import type { SemanticClass } from './semanticClasses';

// Eight kinds total. Three groups:
//   Bespoke-only (hand-authored sites with culturally-specific NPCs):
//     'naturalist', 'merchant_guild'
//   Both bespoke and procedural:
//     'garden', 'shrine'
//   Procedural-only archetypes:
//     'ruin', 'wreck', 'smugglers_cove', 'caravanserai'
//
// Earlier drafts had 'temple', 'court', 'hermitage', 'battlefield', 'monastery',
// 'physick_garden' — all cut. Religious sites (including Christian monasteries
// like Bom Jesus) fit under 'shrine'; gardens of any tradition fit under
// 'garden'; palaces/courts already render as in-city palace landmarks.
export type POIKind =
  | 'naturalist' | 'merchant_guild'
  | 'garden' | 'shrine'
  | 'ruin' | 'wreck' | 'smugglers_cove' | 'caravanserai';

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
  /** Free-form context fed to the LLM in the Converse tab. */
  lore: string;
  /** Optional: visiting unlocks knowledge of another port. */
  unlocksPort?: string;
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
    location: { kind: 'coords', position: [22, -38] },
    knowledgeDomain: ['Aloes', 'Mumia', 'Cassia Fistula', 'China Root', 'Bezoar Stones', 'Theriac'],
    masteryGoods: ['Mumia', 'Aloes'],
    cost: { type: 'gold', amount: 80 },
    npcName: 'Master Gideon Delaune',
    npcRole: 'Apothecary, warden of the new Society',
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
    lore: "A working pepper-and-cardamom plantation kept by an old Portuguese-Konkani family, foreman Rebelo speaks four languages and remembers Garcia da Orta's name with reverence. Visitors who pay for a tour see how vines are trained on betel-nut palms, how green pepper is sun-dried into black, and how the inferior bark is sorted out before shipment. He'll grade a sample with practiced fingers.",
  },

  // ── Surat ─────────────────────────────────────────────────────────────────
  {
    id: 'surat-banyan-counting-house',
    name: "Banyan Counting House",
    sub: 'Hira Vora & Sons — Mughlisarai quarter',
    kind: 'merchant_guild',
    class: 'mercantile',
    port: 'surat',
    location: { kind: 'coords', position: [-30, 18] },
    knowledgeDomain: ['Indigo', 'Bhang', 'Hides', 'Iron', 'Opium'],
    masteryGoods: ['Indigo'],
    cost: { type: 'gold', amount: 70 },
    npcName: 'Hira Vora',
    npcRole: 'Banyan factor and money-changer',
    lore: "Vora's family has financed Mughal-era voyages out of Surat for two generations. The shop is a low whitewashed room with cushions, abacus-strings, ledger books in Gujarati script, and a heavy strongbox. He converts reales-of-eight into mahmudis at the day's rate, will grade indigo cake by snapping a corner and breathing on it, and considers most European captains charmingly ignorant of how Mughal customs duties actually work.",
  },
  {
    id: 'surat-sufi-lodge',
    name: 'Khanqah of Baba Pyare',
    sub: 'Sufi lodge in the date palm groves',
    kind: 'shrine',
    class: 'religious',
    port: 'surat',
    location: { kind: 'hinterland', position: [-145, 60] },
    knowledgeDomain: ['Bhang', 'Frankincense', 'Myrrh', 'Cassia Fistula'],
    masteryGoods: ['Bhang'],
    cost: { type: 'commodity', commodityId: 'Frankincense', amount: 1 },
    npcName: 'Pir Ghulam Hussain',
    npcRole: 'Chishti shaikh',
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
    lore: "The shrine of Ali ibn Umar al-Shādhilī, patron saint of coffee — the legend in Mocha holds that he learned of qahwa from goats grazing the ridges of Yemen's interior. Pilgrims drink the bitter brew before midnight prayers; merchants buy it by the camel-load below in the harbor. Shaikh Ali is the saint's namesake and keeper of the boil. He grades beans by smell and grade-roasts a sample on a long iron over coals.",
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
    lore: "A seasonal camp of Hadhrami collectors who range up the Tihama coast and across to Socotra each year for aloe and the resin tears of frankincense and myrrh. Sa'id is a hakim trained in Yemeni medicine — he reads the qarurah (urine flask), composes electuaries, and grades resin by snap and color. He'll teach a visitor to tell Socotran aloe (clean amber) from inferior Cape aloe (greenish-black) for a fee.",
  },
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
