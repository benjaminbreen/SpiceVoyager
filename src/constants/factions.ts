import { Nationality } from '../store/gameStore';

export interface FactionInfo {
  id: Nationality;
  displayName: string;
  shortName: string;
  description: string;
  /** Primary flag colors, ordered: background, main device, accent */
  colors: [string, string, string];
  /**
   * Simple flag geometry type for SVG rendering.
   * - 'cross'       : offset cross (e.g. England, Denmark, Portugal)
   * - 'triband-h'   : three horizontal stripes (e.g. Dutch)
   * - 'bicolor-h'   : two horizontal halves
   * - 'bicolor-v'   : two vertical halves (e.g. French)
   * - 'crescent'    : solid field with crescent (Ottoman, Acehnese)
   * - 'disc'        : solid field with central disc (Japan)
   * - 'quartered'   : four quadrants (e.g. Spanish)
   * - 'diamond'     : diamond on solid field (Mughal-inspired)
   * - 'stripe-edge' : horizontal stripe at top or bottom
   * - 'plain'       : solid field, no device
   */
  flagPattern: string;
}

export const FACTIONS: Record<Nationality, FactionInfo> = {
  // ── European Powers ──────────────────────────────────
  English: {
    id: 'English',
    displayName: 'English East India Company',
    shortName: 'English',
    description: 'The Honourable East India Company, chartered 1600. Aggressive newcomers to the Eastern trade.',
    colors: ['#FFFFFF', '#CF142B', '#CF142B'],  // St George's Cross
    flagPattern: 'cross',
  },
  Portuguese: {
    id: 'Portuguese',
    displayName: 'Portuguese Estado da Índia',
    shortName: 'Portuguese',
    description: 'The oldest European empire in the East, builders of fortified trading posts from Goa to Macau.',
    colors: ['#003399', '#FFFFFF', '#006600'],  // blue/white shield + green
    flagPattern: 'cross',
  },
  Dutch: {
    id: 'Dutch',
    displayName: 'Dutch VOC',
    shortName: 'Dutch',
    description: 'The Vereenigde Oost-Indische Compagnie — the richest trading company in the world.',
    colors: ['#AE1C28', '#FFFFFF', '#21468B'],  // red-white-blue Prinsenvlag (actually orange in 1612)
    flagPattern: 'triband-h',
  },
  Spanish: {
    id: 'Spanish',
    displayName: 'Spanish Empire',
    shortName: 'Spanish',
    description: 'Masters of the Manila galleon trade and the Caribbean. The Habsburg sun never sets.',
    colors: ['#AA151B', '#F1BF00', '#AA151B'],  // Cross of Burgundy colors
    flagPattern: 'quartered',
  },
  French: {
    id: 'French',
    displayName: 'Kingdom of France',
    shortName: 'French',
    description: 'The Bourbon monarchy, seeking footholds in the Caribbean and early Eastern ventures.',
    colors: ['#FFFFFF', '#002395', '#ED2939'],  // white Bourbon field with blue/red
    flagPattern: 'bicolor-v',
  },
  Danish: {
    id: 'Danish',
    displayName: 'Danish East India Company',
    shortName: 'Danish',
    description: "Denmark-Norway's ambitious push into Eastern trade, centered on Tranquebar.",
    colors: ['#C8102E', '#FFFFFF', '#C8102E'],  // Dannebrog
    flagPattern: 'cross',
  },
  Venetian: {
    id: 'Venetian',
    displayName: 'Most Serene Republic of Venice',
    shortName: 'Venetian',
    description: 'The Republic of Saint Mark — Levantine spice broker, master of the Adriatic, sustained by Murano glass and the theriac monopoly.',
    colors: ['#A51E1E', '#F4C430', '#A51E1E'],  // crimson field, gold lion of St Mark
    flagPattern: 'plain',
  },
  Pirate: {
    id: 'Pirate',
    displayName: 'Black Flag',
    shortName: 'Pirate',
    description: 'Outlaw captains, deserters, and smugglers sailing outside the protection of any crown or company.',
    colors: ['#050505', '#F2E6C9', '#B01818'],
    flagPattern: 'plain',
  },

  // ── Indian Subcontinent ──────────────────────────────
  Mughal: {
    id: 'Mughal',
    displayName: 'Mughal Empire',
    shortName: 'Mughal',
    description: 'The vast empire of Hindustan under Emperor Jahangir. Fabulously wealthy, indifferent to the sea.',
    colors: ['#2E6B30', '#F4C430', '#FFFFFF'],  // green field, gold
    flagPattern: 'diamond',
  },
  Gujarati: {
    id: 'Gujarati',
    displayName: 'Gujarat Merchants',
    shortName: 'Gujarati',
    description: 'Independent trading networks from Surat, Cambay, and Diu — the backbone of Indian Ocean commerce.',
    colors: ['#FFFFFF', '#FF6600', '#138808'],   // white, saffron, green
    flagPattern: 'stripe-edge',
  },

  // ── Middle East & East Africa ────────────────────────
  Persian: {
    id: 'Persian',
    displayName: 'Safavid Persia',
    shortName: 'Persian',
    description: "Shah Abbas's empire — silk, carpets, and the strategic port of Bandar Abbas.",
    colors: ['#239F40', '#FFFFFF', '#DA0000'],   // green, white lion, red
    flagPattern: 'triband-h',
  },
  Ottoman: {
    id: 'Ottoman',
    displayName: 'Ottoman Empire',
    shortName: 'Ottoman',
    description: 'The vast Islamic empire controlling the Red Sea, eastern Mediterranean, and overland spice routes.',
    colors: ['#E30A17', '#FFFFFF', '#E30A17'],   // red field, white crescent
    flagPattern: 'crescent',
  },
  Omani: {
    id: 'Omani',
    displayName: 'Sultanate of Oman',
    shortName: 'Omani',
    description: 'Rising maritime power based in Muscat, challenging the Portuguese along the Swahili coast.',
    colors: ['#DB161B', '#FFFFFF', '#008000'],   // red, white, green
    flagPattern: 'triband-h',
  },
  Swahili: {
    id: 'Swahili',
    displayName: 'Swahili City-States',
    shortName: 'Swahili',
    description: 'Independent coastal cities — Kilwa, Mombasa, Zanzibar — ancient crossroads of African and Arab trade.',
    colors: ['#006847', '#FCD116', '#000000'],   // green, gold, black
    flagPattern: 'bicolor-h',
  },
  Khoikhoi: {
    id: 'Khoikhoi',
    displayName: 'Khoikhoi Trading Intermediaries',
    shortName: 'Khoikhoi',
    description: 'Pastoral communities around Table Bay; no European fort or governor exists at the Cape in 1612.',
    colors: ['#7A5A36', '#F0D28A', '#2F5D45'],
    flagPattern: 'plain',
  },
  // ── Southeast Asia ───────────────────────────────────
  Malay: {
    id: 'Malay',
    displayName: 'Johor Sultanate',
    shortName: 'Malay',
    description: 'Successor to Malacca, controlling trade through the straits alongside the Acehnese and Dutch.',
    colors: ['#000066', '#FFCC00', '#FFFFFF'],   // dark blue, gold
    flagPattern: 'bicolor-h',
  },
  Acehnese: {
    id: 'Acehnese',
    displayName: 'Sultanate of Aceh',
    shortName: 'Acehnese',
    description: 'The "Gateway to Mecca" — a powerful Islamic sultanate dominating northern Sumatra and the pepper trade.',
    colors: ['#000000', '#FFFFFF', '#006400'],   // black, white crescent, green
    flagPattern: 'crescent',
  },
  Javanese: {
    id: 'Javanese',
    displayName: 'Sultanate of Mataram',
    shortName: 'Javanese',
    description: 'The dominant power of Java, controlling rice, timber, and access to the spice routes eastward.',
    colors: ['#800020', '#F4C430', '#FFFFFF'],   // burgundy, gold
    flagPattern: 'diamond',
  },
  Moluccan: {
    id: 'Moluccan',
    displayName: 'Spice Islands Sultanates',
    shortName: 'Moluccan',
    description: 'Ternate, Tidore, and the clove islands — the ultimate prize of the Eastern spice trade.',
    colors: ['#009639', '#FFFFFF', '#F4C430'],   // green, white, gold
    flagPattern: 'plain',
  },

  // ── East Asia ────────────────────────────────────────
  Siamese: {
    id: 'Siamese',
    displayName: 'Kingdom of Ayutthaya',
    shortName: 'Siamese',
    description: 'A cosmopolitan kingdom welcoming all traders. Ayutthaya rivals any European capital in size.',
    colors: ['#A51931', '#FFFFFF', '#A51931'],   // red field, white elephant area
    flagPattern: 'plain',
  },
  Japanese: {
    id: 'Japanese',
    displayName: 'Tokugawa Japan',
    shortName: 'Japanese',
    description: 'Red Seal ships trade across Southeast Asia — but the window is closing as the Shogun eyes isolation.',
    colors: ['#FFFFFF', '#BC002D', '#FFFFFF'],   // white, red disc (Hinomaru)
    flagPattern: 'disc',
  },
  Chinese: {
    id: 'Chinese',
    displayName: 'Ming Dynasty',
    shortName: 'Chinese',
    description: 'The Middle Kingdom officially bans maritime trade, yet Chinese junks fill every port from Manila to Malacca.',
    colors: ['#FFDE00', '#DE2910', '#FFDE00'],   // yellow, red
    flagPattern: 'diamond',
  },
};

/** Ordered list for UI dropdowns, etc. */
export const NATIONALITY_LIST: Nationality[] = Object.keys(FACTIONS) as Nationality[];

/**
 * Pick a legible pennant / accent color from a nationality's flag palette.
 * Prefers the charge color (index 1); falls back to the background when the
 * charge is white, so the pennant doesn't disappear against a sky backdrop.
 */
export function pickFlagColor(flag?: Nationality | string): string | undefined {
  if (!flag) return undefined;
  const cs = FACTIONS[flag as Nationality]?.colors;
  if (!cs) return undefined;
  const charge = cs[1];
  return /^#f+$/i.test(charge.replace('#', '')) ? cs[0] : charge;
}
