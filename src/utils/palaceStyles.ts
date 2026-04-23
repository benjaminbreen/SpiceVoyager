// ── Palace styles ────────────────────────────────────────────────────────────
//
// Generic (non-landmark) royal residences / governor's palaces placed per
// port. Keyed to the port's ruling culture c.1612 — mirrors the spiritual
// building system (portReligions.ts), which keys church/mosque/temple
// geometry to the port's faith list.
//
// Every palace placed by the city generator gets `type: 'palace'` +
// `palaceStyle: '<key>'`. The renderer dispatches on palaceStyle for
// bespoke geometry; the semantic class resolver returns 'royal' for all
// palaces regardless of style.
//
// Ports with a `royal`-classified landmark (Tower of London, Palacio de
// la Inquisición) skip the generic palace — the landmark already carries
// the royal identity. See cityGenerator.ts step 2d for the dedupe.

export type PalaceStyle =
  // Portuguese / Spanish colonial — whitewashed walls, terracotta roof,
  // arched loggia, small clocktower. Covers most Iberian-controlled ports.
  | 'iberian-colonial'
  // Mughal — red sandstone, central pishtaq arch, chhatri pavilions,
  // corner domes. Surat, Diu.
  | 'mughal'
  // Malay istana — raised timber pavilion on stilts, multi-tiered tile
  // roof, carved gable. Bantam.
  | 'malay-istana';

/**
 * Per-port palace style. Ports not listed here get no generic palace —
 * either because they have a `royal` landmark already (London, Cartagena),
 * or because their ruling culture's palace style hasn't been implemented
 * yet (Calicut Zamorin, Muscat Omani, Aden Ottoman, Mombasa Swahili, etc.).
 */
export const PORT_PALACE_STYLE: Record<string, PalaceStyle> = {
  // Iberian colonial — Portuguese or Spanish viceroyalty / captaincy
  goa:       'iberian-colonial',  // Palácio do Vice-Rei
  macau:     'iberian-colonial',  // Palácio do Governador
  malacca:   'iberian-colonial',  // Casa do Capitão
  hormuz:    'iberian-colonial',  // Portuguese captain's residence
  elmina:    'iberian-colonial',  // Governor's house inside the castle grounds
  luanda:    'iberian-colonial',  // Palácio do Governador
  salvador:  'iberian-colonial',  // Palácio do Governador-Geral
  havana:    'iberian-colonial',  // Casa de Gobierno
  lisbon:    'iberian-colonial',  // Paço da Ribeira (Tagus-side royal palace)
  seville:   'iberian-colonial',  // Reales Alcázares
  // Mughal
  surat:     'mughal',            // Mughal governor's palace
  diu:       'mughal',            // Mughal/Gujarati governor's quarters
  // Malay
  bantam:    'malay-istana',      // Sultan's istana
};

export function palaceStyleForPort(portId: string): PalaceStyle | null {
  return PORT_PALACE_STYLE[portId] ?? null;
}
