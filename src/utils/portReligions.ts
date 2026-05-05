// ── Port religions ────────────────────────────────────────────────────────────
//
// Per-port faith list used by the city generator to place spiritual buildings
// (mosques, churches, temples, pagodas, shrines) that reflect each port's
// religious demographics c. 1612. The list order is significant — the first
// entry is the numerically dominant faith and gets the most prominent siting.
//
// This data is parallel to the human-readable `religions` string shown in
// PortModal.tsx; keeping a typed version separate from the UI module avoids
// tying generation logic to UI copy.

export type Faith =
  // Christian branches — distinct enough to warrant separate geometry
  | 'catholic'
  | 'protestant'
  // Islamic branches — all render as mosque but the architectural family
  // (dome+minaret vs plainer Ibadi) can key off the subtype if we want later
  | 'sunni'
  | 'shia'
  | 'ibadi'
  // South / East Asian
  | 'hindu'
  | 'buddhist'
  // Folk / traditional
  | 'chinese-folk'
  | 'animist'
  // Diaspora
  | 'jewish';

/**
 * Faith list per port, in declining order of prominence c. 1612.
 * The generator caps spiritual building count at 3 per port regardless.
 */
export const PORT_FAITHS: Record<string, readonly Faith[]> = {
  calicut:   ['hindu', 'sunni'],                // Hindu Zamorin with Mappila Muslim trade diaspora
  goa:       ['catholic', 'hindu'],             // Portuguese crown city, large Konkani Hindu populace
  hormuz:    ['shia'],                          // Safavid island under Portuguese occupation
  malacca:   ['sunni', 'buddhist', 'catholic'], // post-1511 Portuguese rule over Malay Muslim / Chinese Buddhist
  aden:      ['sunni'],                         // Ottoman Yemen
  zanzibar:  ['sunni'],                         // Swahili coast
  macau:     ['buddhist', 'catholic', 'chinese-folk'], // Chinese majority + Jesuit enclave
  manila:    ['catholic', 'chinese-folk', 'buddhist'], // Spanish Intramuros + Sangley Parián
  nagasaki:  ['buddhist', 'catholic'],                 // Pre-1614 peak of the Kirishitan mission alongside Buddhist majority
  masulipatnam: ['shia', 'hindu', 'sunni'],            // Shia Qutb Shahi sultanate over a mixed Hindu-Muslim port population
  colombo:   ['buddhist', 'catholic', 'hindu'],        // Sinhala Buddhist majority, Portuguese Catholic enclave, Tamil/Hindu presence
  mombasa:   ['sunni'],                         // Swahili coast
  surat:     ['sunni', 'hindu'],                // Mughal imperial port, large Banian Hindu merchant caste
  muscat:    ['ibadi'],                         // Omani Ibadi
  mocha:     ['sunni'],
  bantam:    ['sunni'],                         // Sultanate of Banten
  socotra:   ['sunni'],                         // (Nestorian remnants exist but tiny by 1612)
  diu:       ['hindu', 'sunni', 'catholic'],    // Gujarati + Muslim + Portuguese fortress
  lisbon:    ['catholic'],
  amsterdam: ['protestant', 'jewish'],          // Calvinist Republic + Sephardic refuge
  seville:   ['catholic'],
  london:    ['protestant'],                    // Anglican; Catholicism proscribed
  venice:    ['catholic', 'jewish'],            // Catholic Republic + the Ghetto Vecchio/Nuovo
  elmina:    ['animist', 'catholic'],           // Akan traditional + Portuguese garrison chapel
  luanda:    ['catholic', 'animist'],
  salvador:  ['catholic'],                      // (Candomblé roots not yet visibly institutionalised by 1612)
  havana:    ['catholic'],
  cartagena: ['catholic'],
  veracruz:  ['catholic'],
  cape:      ['animist'],                       // Khoikhoi traditional practice (no permanent settlement yet)
};

/** Returns an empty array for ports without an entry. */
export function faithsForPort(portId: string): readonly Faith[] {
  return PORT_FAITHS[portId] ?? [];
}
