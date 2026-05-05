// Real-world latitude per historical port, used for night-sky constellation
// rendering during the sleep/rest overlay. Positive = north, negative = south.
// Approximate degrees, rounded to nearest tenth.
export const PORT_LATITUDES: Record<string, number> = {
  // European
  london: 51.5,
  amsterdam: 52.4,
  lisbon: 38.7,
  seville: 37.4,
  venice: 45.4,

  // Indian Ocean — Arabian peninsula / Red Sea / Persian Gulf
  hormuz: 27.1,
  muscat: 23.6,
  aden: 12.8,
  mocha: 13.3,
  socotra: 12.5,

  // Indian Ocean — South Asia
  surat: 21.2,
  diu: 20.7,
  goa: 15.5,
  calicut: 11.3,
  masulipatnam: 16.2,
  colombo: 6.9,

  // Indian Ocean — East Africa
  mombasa: -4.0,
  zanzibar: -6.2,

  // Indian Ocean — Southeast Asia / East Asia
  malacca: 2.2,
  bantam: -6.0,
  manila: 14.6,
  macau: 22.2,
  nagasaki: 32.7,

  // West African
  elmina: 5.1,
  luanda: -8.8,

  // Atlantic — Americas
  havana: 23.1,
  cartagena: 10.4,
  veracruz: 19.2,
  salvador: -13.0,
  jamestown: 37.2,

  // Cape route
  cape: -33.9,
};

export function getPortLatitude(portId: string): number | null {
  return PORT_LATITUDES[portId] ?? null;
}

import type { Nationality, Culture } from '../store/gameStore';

// Music zone — a finer-grained classification than `Culture` used by the
// soundtrack rotation to gate region-specific tracks. Each port belongs to
// exactly one zone; tracks tagged with a zone only play when the player's
// current world port is in that zone. Tracks without zone tags play
// anywhere (the default global pool).
export type MusicZone =
  | 'east-asia'       // Nagasaki, Manila, Bantam, Macau (per game grouping)
  | 'southeast-asia'  // Malacca and adjacent
  | 'south-asia'      // Mughal/Coromandel/Malabar coast
  | 'arabia'          // Red Sea + Persian Gulf + Socotra
  | 'east-africa'     // Swahili coast
  | 'europe'          // Atlantic & Mediterranean Europe
  | 'west-africa'     // Gulf of Guinea, Angolan coast
  | 'americas'        // Caribbean + Brazil + Virginia
  | 'cape';           // Cape of Good Hope

export const PORT_MUSIC_ZONES: Record<string, MusicZone> = {
  // East Asia (per user's grouping — includes Java/PH for Pacific monsoon-trade
  // soundscape grouping, even though geographically broader than "East Asia")
  nagasaki: 'east-asia', manila: 'east-asia', bantam: 'east-asia', macau: 'east-asia',
  // Southeast Asia
  malacca: 'southeast-asia',
  // South Asia
  surat: 'south-asia', diu: 'south-asia', goa: 'south-asia',
  calicut: 'south-asia', masulipatnam: 'south-asia', colombo: 'south-asia',
  // Arabia / Red Sea / Persian Gulf
  hormuz: 'arabia', muscat: 'arabia', aden: 'arabia',
  mocha: 'arabia', socotra: 'arabia',
  // East Africa (Swahili coast)
  mombasa: 'east-africa', zanzibar: 'east-africa',
  // Europe
  london: 'europe', amsterdam: 'europe', lisbon: 'europe',
  seville: 'europe', venice: 'europe',
  // West Africa
  elmina: 'west-africa', luanda: 'west-africa',
  // Americas
  havana: 'americas', cartagena: 'americas',
  salvador: 'americas', jamestown: 'americas', veracruz: 'americas',
  // Cape
  cape: 'cape',
};

export function getMusicZone(portId: string | null | undefined): MusicZone | null {
  if (!portId) return null;
  return PORT_MUSIC_ZONES[portId] ?? null;
}

// Map a crew member's nationality to the broad cultural region they think of
// as home. Used by the rest mechanic to grant a bonus XP when sleeping in a
// port outside their cultural sphere — crossing the Indian Ocean / Europe
// divide is genuinely formative for a 1612 sailor.
export function nationalityToCulture(nationality: Nationality): Culture {
  switch (nationality) {
    case 'English': case 'Portuguese': case 'Dutch': case 'Spanish':
    case 'French': case 'Danish': case 'Venetian':
      return 'European';
    case 'Mughal': case 'Gujarati': case 'Persian': case 'Ottoman':
    case 'Omani': case 'Swahili': case 'Khoikhoi': case 'Malay': case 'Acehnese':
    case 'Javanese': case 'Moluccan': case 'Siamese': case 'Japanese':
    case 'Chinese':
      return 'Indian Ocean';
  }
}
