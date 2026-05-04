// ── Semantic classes ─────────────────────────────────────────────────────────
//
// A small, hand-picked taxonomy of "what kind of important thing is this?"
// used to drive hover-label eyebrows, 3D markers, and (later) POI tagging.
// The classes are about civic/cultural *identity*, not gameplay role —
// they're what a player should be able to tell at a glance about a
// building's significance.
//
// Every Building and every POI resolves to at most one class (or null).
// RELIGIOUS is the only class that gets a 3D diamond marker today; the
// others are hover-only until we build tiered visual language. Adding a
// new marker type (e.g. a small floating crown for ROYAL) is a one-line
// change in SEMANTIC_STYLE plus a render branch in SacredBuildingMarkers.
//
// This module is the single source of truth — both the label generator
// (buildingLabels.ts → eyebrow + color) and the renderer (city/renderers/CityMarkers
// → marker dispatch) must read from here. Don't duplicate the list.

import type { Building } from '../store/gameStore';

export type SemanticClass = 'religious' | 'civic' | 'learned' | 'mercantile' | 'royal';

export interface SemanticStyle {
  /** All-caps eyebrow shown above the title on the hover label. */
  eyebrow: string;
  /** Text color for the eyebrow + tint for any attached marker. */
  color: string;
  /**
   * 3D marker type floating above the building. `null` = hover-only (no
   * always-on marker). Only `'diamond'` is implemented today.
   */
  marker: 'diamond' | null;
}

export const SEMANTIC_STYLE: Record<SemanticClass, SemanticStyle> = {
  // Mosques, churches, temples, shrines, monasteries. Sims-style plumbob.
  religious:  { eyebrow: 'RELIGIOUS',  color: '#c4a1ff', marker: 'diamond' },
  // Forts, town halls, plazas, civic markets, customs houses, city gates.
  civic:      { eyebrow: 'CIVIC',      color: '#e8c872', marker: null },
  // Universities, colleges, hospitals, apothecaries, libraries, observatories,
  // naturalist cabinets. Places of structured knowledge.
  learned:    { eyebrow: 'LEARNED',    color: '#9bc4e8', marker: null },
  // Guild halls, factories (VOC/EIC trading posts), counting houses, major
  // private warehouses. Private commercial institutions, distinct from the
  // public market square (which is CIVIC).
  mercantile: { eyebrow: 'MERCANTILE', color: '#6dc3b0', marker: null },
  // Viceroys' palaces, governor's residence, treasury, inquisition tribunals,
  // royal fortresses / mints. Crown-held institutions.
  royal:      { eyebrow: 'ROYAL',      color: '#e89b9b', marker: null },
};

// ── Landmark class assignments ───────────────────────────────────────────────
//
// Single source of truth for which of the 13 named landmarks belongs to
// which semantic class. Read by buildingLabels (to set the eyebrow) and
// by the renderer (to decide which landmarks get the plumbob).
//
// Guidance for adding landmarks:
//   - Classify by the building's *visible civic identity* (what does a
//     sailor entering the harbor see?), not its interior function. A
//     Jesuit college's exterior reads as a cathedral → religious, even if
//     the POI attached to it offers LEARNED conversations about cinchona.
//   - Military fortresses → civic. Crown-administered fortresses (mint,
//     royal prison, etc.) → royal. If both apply, the crown association
//     wins because the architecture signalled it first.
export const LANDMARK_CLASS: Record<string, SemanticClass> = {
  // Religious
  'bom-jesus-basilica':  'religious',
  'oude-kerk-spire':     'religious',
  'giralda-tower':       'religious',
  'al-shadhili-mosque':  'religious',
  'grand-mosque-tiered': 'religious',
  'calicut-gopuram':     'religious',
  'jesuit-college':      'religious',
  // Royal / judicial
  'tower-of-london':     'royal',    // royal fortress, mint, crown prison
  'palacio-inquisicion': 'royal',    // Spanish crown tribunal
  // Civic / military
  'belem-tower':         'civic',    // Portuguese crown tower, but military/ceremonial read
  'fort-jesus':          'civic',    // Portuguese military fortress
  'diu-fortress':        'civic',    // Portuguese military fortress
  'elmina-castle':       'civic',    // Portuguese military fortress
  // Learned
  'colegio-sao-paulo':   'learned',  // Macau Jesuit college + astronomical observatory (1594)
  // Mercantile
  'english-factory-surat': 'mercantile', // English East India Company factory (founded 1612)
};

/**
 * Resolve a building to a semantic class for eyebrow + marker rendering.
 * Returns null for buildings that don't carry a class today — generic
 * houses, shacks, docks, farmhouses, unbranded markets, warehouses.
 *
 * Extending: when a building type or landmarkId starts carrying a class,
 * add it here. The caller (cityGenerator) sets labelEyebrow +
 * labelEyebrowColor on the Building from the resolved style.
 */
export function buildingSemanticClass(b: Building): SemanticClass | null {
  if (b.type === 'spiritual') return 'religious';
  if (b.type === 'palace') return 'royal';
  if (b.type === 'landmark' && b.landmarkId) return LANDMARK_CLASS[b.landmarkId] ?? null;
  if (b.institution === 'factory' || b.institution === 'company-house') return 'mercantile';
  if (b.institution === 'customs' || b.institution === 'captaincy') return 'civic';
  if (b.institution === 'treasury' || b.institution === 'authority') return 'royal';
  // Generic forts are civic/military installations — every port has at most
  // 1-2, so tagging them doesn't flood. Named forts that happen to have a
  // landmarkId are already covered above via LANDMARK_CLASS.
  if (b.type === 'fort') return 'civic';
  // Not yet wired (kept unclassified to preserve the "this is special" signal):
  //   type === 'market'   → 'civic' on grand markets only
  //   type === 'warehouse' → 'mercantile' when tagged as a factory / guild house
  //   type === 'estate'   → 'royal' on governor's residences
  return null;
}
