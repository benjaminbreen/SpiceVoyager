import { FACTION_SPAWN_WEIGHTS, type Nationality } from '../store/gameStore';

export type FactionKey =
  | 'english' | 'dutch' | 'portuguese' | 'spanish' | 'venetian'
  | 'omani' | 'gujarati' | 'chinese'
  | 'random' | 'pirate';

// Faction key 'omani' is kept (matches the game's Nationality 'Omani' and the
// existing icon file omani.png), but surfaces as "Arab" to the player.
export const STARTUP_FACTIONS: { key: FactionKey; label: string }[] = [
  { key: 'english',    label: 'English' },
  { key: 'dutch',      label: 'Dutch' },
  { key: 'portuguese', label: 'Portuguese' },
  { key: 'spanish',    label: 'Spanish' },
  { key: 'venetian',   label: 'Venetian' },
  { key: 'omani',      label: 'Arab' },
  { key: 'gujarati',   label: 'Gujarati' },
  { key: 'chinese',    label: 'Chinese' },
  { key: 'random',     label: 'Random' },
  { key: 'pirate',     label: 'Pirate' },
];

export const FACTION_KEY_TO_NATIONALITY: Record<FactionKey, Nationality | null> = {
  english: 'English',
  dutch: 'Dutch',
  portuguese: 'Portuguese',
  spanish: 'Spanish',
  venetian: 'Venetian',
  omani: 'Omani',
  gujarati: 'Gujarati',
  chinese: 'Chinese',
  random: null,
  pirate: 'Pirate',
};

/** Ordered list of port IDs available to a faction, weight-descending. */
export function portsForFaction(factionKey: FactionKey): string[] {
  const nationality = FACTION_KEY_TO_NATIONALITY[factionKey];
  if (nationality) {
    const weights = FACTION_SPAWN_WEIGHTS[nationality];
    if (weights && weights.length) {
      return [...weights]
        .sort((a, b) => b.weight - a.weight)
        .map((w) => w.portId);
    }
  }

  const union = new Set<string>();
  for (const list of Object.values(FACTION_SPAWN_WEIGHTS)) {
    if (!list) continue;
    for (const row of list) union.add(row.portId);
  }
  return Array.from(union);
}

export function getStartupNationality(factionKey: FactionKey, portId: string): Nationality | null {
  const direct = FACTION_KEY_TO_NATIONALITY[factionKey];
  if (direct) return direct;

  for (const [nationality, weights] of Object.entries(FACTION_SPAWN_WEIGHTS) as [Nationality, { portId: string; weight: number }[]][]) {
    if (weights.some((row) => row.portId === portId)) return nationality;
  }
  return null;
}

export const PORT_LABELS: Record<string, string> = {
  london:    'London',
  amsterdam: 'Amsterdam',
  lisbon:    'Lisbon',
  seville:   'Seville',
  venice:    'Venice',
  havana:    'Havana',
  cartagena: 'Cartagena',
  jamestown: 'Jamestown',
  salvador:  'Salvador',
  luanda:    'Luanda',
  cape:      'Cape',
  mombasa:   'Mombasa',
  zanzibar:  'Zanzibar',
  socotra:   'Socotra',
  aden:      'Aden',
  mocha:     'Mocha',
  hormuz:    'Hormuz',
  muscat:    'Muscat',
  surat:     'Surat',
  diu:       'Diu',
  goa:       'Goa',
  calicut:   'Calicut',
  malacca:   'Malacca',
  bantam:    'Bantam',
  manila:    'Manila',
  macau:     'Macau',
};

export const PORT_DESCRIPTIONS: Record<string, string> = {
  london:    'Metropole of Tudor England. The Royal Exchange and the East India Company on Leadenhall Street.',
  amsterdam: 'Heart of the Dutch Republic and the VOC, founded 1602 — the world\'s first stock exchange.',
  lisbon:    'Capital of the Portuguese Estado da Índia. The Casa da Índia oversees the Carreira spice fleets.',
  seville:   'Spanish metropole. The Casa de Contratación monopolises trade with the Indies.',
  venice:    'Most Serene Republic. Levantine pepper still arrives by caravan even as the Cape route reroutes Asia.',
  havana:    'Caribbean treasure-fleet base. Galleons rendezvous here for the Atlantic crossing each summer.',
  cartagena: 'Spanish fortified port on the Tierra Firme coast — silver from Potosí passes through.',
  jamestown: 'Virginia Company colony, ~300 settlers in 1612. Tobacco cultivation begins this year.',
  salvador:  'Capital of Portuguese Brazil — sugar engenhos and the Atlantic trade.',
  luanda:    'São Paulo de Luanda — Portuguese Atlantic entrepôt tied to Brazil and the Caribbean.',
  cape:      'Cape of Good Hope. No permanent settlement; ships water and salt cured meat here.',
  mombasa:   'Portuguese Fort Jesus (completed 1596) on the Swahili coast. Disputed with Omani Arabs.',
  zanzibar:  'Swahili port within the Omani-Portuguese dhow network.',
  socotra:   'Yemeni island in the western Indian Ocean — frankincense, myrrh, and dragon\'s-blood resin.',
  aden:      'Ottoman port at the mouth of the Red Sea — coffee and pepper traffic toward Cairo.',
  mocha:     'Yemeni port through which all Red Sea coffee passes. Arab and Indian merchants dominate.',
  hormuz:    'Portuguese-held island at the Persian Gulf gateway — silks, pearls, and Persian horses.',
  muscat:    'Omani port on the Arabian Sea — base of the Indian Ocean dhow trade.',
  surat:     'Mughal port on the Gujarat coast. The English open their first Indian factory here in 1612.',
  diu:       'Portuguese fortress-island off Gujarat, guarding the Gulf of Cambay route.',
  goa:       'Portuguese viceregal capital of the Estado da Índia. Cathedrals and the Inquisition.',
  calicut:   'Malabar coast port. The Zamorin kingdom; trade run by Gujarati and Mappila merchants.',
  malacca:   'Portuguese fortress on the Strait — chokepoint of the Spice Route since 1511.',
  bantam:    'Pepper port on Java; VOC headquarters in Asia, 1610–1619.',
  manila:    'Spanish capital of the Philippines. The Acapulco galleon and ~30,000 Chinese in the Sangley Parián.',
  macau:     'Luso-Chinese trade hub on the South China coast — the Macau-Nagasaki silver run.',
};

const PORT_ICON_AVAILABLE = new Set<string>([
  'london', 'amsterdam', 'lisbon',
  'seville', 'havana', 'aden',
  'mocha', 'goa', 'macau',
  'surat',
]);

export function portIconUrl(id: string) {
  return PORT_ICON_AVAILABLE.has(id)
    ? `/icons/ports/${id}.png`
    : '/icons/factions/random.png';
}
