import { Nationality } from '../store/gameStore';

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }

// ── Ship types by cultural region ────────────────────────────────────────────
const EUROPEAN_NATIONS: Nationality[] = ['English', 'Portuguese', 'Dutch', 'Spanish', 'French', 'Danish'];
const ARABIAN_NATIONS: Nationality[] = ['Omani', 'Persian', 'Ottoman', 'Swahili'];
const INDIAN_NATIONS: Nationality[] = ['Mughal', 'Gujarati'];
const SE_ASIAN_NATIONS: Nationality[] = ['Malay', 'Acehnese', 'Javanese', 'Moluccan', 'Siamese'];
const EAST_ASIAN_NATIONS: Nationality[] = ['Chinese', 'Japanese'];

type ShipType = 'Carrack' | 'Galleon' | 'Dhow' | 'Junk' | 'Pinnace';

function shipTypeForNation(nat: Nationality): ShipType {
  if (EUROPEAN_NATIONS.includes(nat)) return pick(['Carrack', 'Galleon', 'Pinnace'] as ShipType[]);
  if (ARABIAN_NATIONS.includes(nat)) return 'Dhow';
  if (INDIAN_NATIONS.includes(nat)) return pick(['Dhow', 'Dhow', 'Pinnace'] as ShipType[]);
  if (EAST_ASIAN_NATIONS.includes(nat)) return 'Junk';
  if (SE_ASIAN_NATIONS.includes(nat)) return pick(['Dhow', 'Junk', 'Pinnace'] as ShipType[]);
  return 'Dhow';
}

// ── Ship names by type ───────────────────────────────────────────────────────
const SHIP_NAMES: Record<ShipType, string[]> = {
  Carrack: [
    'São Gabriel', 'Santa Maria', 'San Martín', 'Flor de la Mar', 'Madre de Deus',
    'São Sebastião', 'Trinidad', 'Bom Jesus', 'Santa Catarina', 'Esmeralda',
    'Victoria', 'Santiago', 'Conceição', 'Nossa Senhora', 'Esperança',
    'Santa Cruz', 'São Rafael', 'Buen Viaje', 'Rosário', 'Salvação',
  ],
  Galleon: [
    'San Felipe', 'Nuestra Señora', 'Golden Hind', 'Revenge', 'Triumph',
    'Batavia', 'Amsterdam', 'Mauritius', 'Duyfken', 'Eendracht',
    'Prince Royal', 'Sovereign', 'Vanguard', 'Defiance', 'Lion',
    'Gelderland', 'Zeelandia', 'Hollandia', 'Resolution', 'Neptune',
  ],
  Dhow: [
    'al-Rahma', 'Fatih', 'al-Buraq', 'Sambuq', 'Safina',
    'al-Najm', 'Riyah', 'al-Qamar', 'Baghla', 'al-Salam',
    'Zarqa', 'al-Hayat', 'Ghanja', 'al-Ward', 'Maryam',
    'al-Nasr', 'al-Huda', 'Kawthar', 'al-Fath', 'Noor',
  ],
  Junk: [
    'Bao Chuan', 'Fuchuan', 'Haicang', 'Longxing', 'Taiping',
    'Ruyi', 'Fenghuang', 'Shunfeng', 'Mingzhou', 'Baolu',
    'Tenryu', 'Kaiyo', 'Zuiryu', 'Seiryu', 'Kinryu',
    'Nanhai', 'Dongfeng', 'Xingfu', 'Wanli', 'Heping',
  ],
  Pinnace: [
    'Swift', 'Greyhound', 'Discovery', 'Moonshine', 'Messenger',
    'Hopewell', 'Endeavour', 'Speedwell', 'Blessing', 'Gift',
    'Fortune', 'Tiger', 'Falcon', 'Sparrow', 'Lark',
    'Swallow', 'Dolphin', 'Pelican', 'Venture', 'Prospect',
  ],
};

// ── Appearance descriptors ───────────────────────────────────────────────────
// Adjectives for the "approaching" toast — combined to make phrases
const CONDITION_GOOD = [
  'a trim', 'a handsome', 'a well-kept', 'a fine', 'a proud',
  'a freshly-painted', 'a sturdy', 'a sharp-looking', 'a sprightly',
];
const CONDITION_FAIR = [
  'a weathered', 'a salt-crusted', 'an ordinary', 'a modest',
  'a sun-bleached', 'a travel-worn', 'a sea-stained', 'a laden',
];
const CONDITION_POOR = [
  'a battered', 'a bedraggled', 'a barnacled', 'a listing',
  'a patched-up', 'a creaking', 'a ragged', 'a leaking',
];

function appearancePhrase(shipType: ShipType, morale: number): string {
  const pool = morale > 70 ? CONDITION_GOOD : morale > 40 ? CONDITION_FAIR : CONDITION_POOR;
  return `${pick(pool)} ${shipType.toLowerCase()}`;
}

// ── Captain names (reuses the pattern from crewGenerator) ────────────────────
// Compact subset — enough for variety without duplicating the full pool
const CAPTAIN_NAMES: Partial<Record<Nationality, [string[], string[]]>> = {
  English:    [['Thomas', 'William', 'John', 'Edward', 'Richard', 'Henry', 'James'], ['Blackwood', 'Hawkins', 'Fletcher', 'Ward', 'Cooper', 'Lancaster', 'Middleton']],
  Portuguese: [['Rodrigo', 'Afonso', 'Pedro', 'Diogo', 'Manuel', 'Vasco', 'Tomé'], ['da Silva', 'Pereira', 'Correia', 'de Brito', 'Teixeira', 'Alvares', 'Lopes']],
  Dutch:      [['Willem', 'Jan', 'Pieter', 'Cornelis', 'Hendrik', 'Dirk', 'Jacob'], ['de Groot', 'Janssen', 'de Vries', 'van Neck', 'Coen', 'Both', 'Bakker']],
  Spanish:    [['Diego', 'Juan', 'Pedro', 'Miguel', 'Francisco', 'Gonzalo', 'Sebastián'], ['de Torres', 'Fernández', 'Mendoza', 'del Castillo', 'Navarro', 'Romero', 'Serrano']],
  French:     [['Jacques', 'Pierre', 'Jean', 'François', 'Antoine', 'Charles', 'Louis'], ['Pyrard', 'Beaulieu', 'Martin', 'Moreau', 'Dubois', 'Mercier', 'Blanchard']],
  Mughal:     [['Mirza', 'Asaf', 'Nur', 'Sher', 'Qasim', 'Yusuf', 'Ibrahim'], ['Khan', 'Beg', 'Ali', 'Shah', 'Ahmad', 'Malik', 'Husain']],
  Gujarati:   [['Virji', 'Abdul', 'Govind', 'Hari', 'Mohan', 'Kanji', 'Premji'], ['Vora', 'Seth', 'Mehta', 'Parekh', 'Shah', 'Patel', 'Bhatia']],
  Ottoman:    [['Hasan', 'Mehmed', 'Ali', 'Mustafa', 'Osman', 'Ahmed', 'Piri'], ['Reis', 'Pasha', 'Agha', 'Bey', 'Efendi', 'Kapudan', 'Çelebi']],
  Omani:      [['Nasir', 'Said', 'Hamad', 'Sultan', 'Rashid', 'Khalid', 'Salim'], ['bin Said', 'al-Yarubi', 'al-Busaidi', 'al-Harthi', 'bin Rashid', 'al-Hinai', 'bin Ahmed']],
  Swahili:    [['Kwame', 'Yusuf', 'Hassan', 'Bwana', 'Bakari', 'Juma', 'Rashid'], ['bin Ali', 'wa Kilwa', 'bin Bakari', 'al-Mazrui', 'Shirazi', 'bin Yusuf', 'wa Pate']],
  Chinese:    [['Li', 'Zhang', 'Chen', 'Wang', 'Zheng', 'Wu', 'Huang'], ['Zhilong', 'Chenggong', 'Feng', 'Wei', 'Hai', 'Ming', 'Guang']],
  Japanese:   [['Yamada', 'Tanaka', 'Hasekura', 'Matsuura', 'Araki', 'Nishi', 'Harada'], ['Nagamasa', 'Shiro', 'Tsunenaga', 'Takanobu', 'Sotaro', 'Ryoi', 'Jinbei']],
  Malay:      [['Tun', 'Hang', 'Abdul', 'Raja', 'Ahmad', 'Ismail', 'Hamzah'], ['Perak', 'Tuah', 'Shah', 'Ibrahim', 'Setia', 'Muda', 'Pahlawan']],
  Persian:    [['Abbas', 'Hossein', 'Reza', 'Rostam', 'Mehdi', 'Farhad', 'Bahram'], ['Khan', 'Beg', 'Shirazi', 'Isfahani', 'Gilani', 'Tabrizi', 'Khorasani']],
};

function generateCaptainName(nat: Nationality): string {
  const pool = CAPTAIN_NAMES[nat] ?? CAPTAIN_NAMES.English!;
  return `${pick(pool[0])} ${pick(pool[1])}`;
}

// ── Cargo types ──────────────────────────────────────────────────────────────
type Commodity = 'Spices' | 'Silk' | 'Tea' | 'Wood' | 'Cannonballs';
const ALL_COMMODITIES: Commodity[] = ['Spices', 'Silk', 'Tea', 'Wood', 'Cannonballs'];

function generateCargo(): Partial<Record<Commodity, number>> {
  const cargo: Partial<Record<Commodity, number>> = {};
  const numTypes = randInt(1, 3);
  const shuffled = [...ALL_COMMODITIES].sort(() => Math.random() - 0.5);
  for (let i = 0; i < numTypes; i++) {
    cargo[shuffled[i]] = randInt(2, 20);
  }
  return cargo;
}

// ── Main export ──────────────────────────────────────────────────────────────

export interface NPCShipIdentity {
  id: string;
  captainName: string;
  shipName: string;
  shipType: ShipType;
  flag: Nationality;
  crewCount: number;
  morale: number; // 0-100
  armed: boolean;
  cargo: Partial<Record<Commodity, number>>;
  appearancePhrase: string;
  position: [number, number, number];
}

const ALL_NATIONALITIES: Nationality[] = [
  'English', 'Portuguese', 'Dutch', 'Spanish', 'French', 'Danish',
  'Mughal', 'Gujarati', 'Persian', 'Ottoman', 'Omani', 'Swahili',
  'Malay', 'Acehnese', 'Javanese', 'Moluccan', 'Siamese', 'Japanese', 'Chinese',
];

export function generateNPCShip(position: [number, number, number]): NPCShipIdentity {
  const flag = pick(ALL_NATIONALITIES);
  const shipType = shipTypeForNation(flag);
  const morale = randInt(20, 95);
  const crewCount = shipType === 'Pinnace' ? randInt(8, 20)
    : shipType === 'Dhow' ? randInt(10, 30)
    : shipType === 'Junk' ? randInt(15, 50)
    : randInt(20, 80);

  return {
    id: Math.random().toString(36).substring(2, 9),
    captainName: generateCaptainName(flag),
    shipName: pick(SHIP_NAMES[shipType]),
    shipType,
    flag,
    crewCount,
    morale,
    armed: shipType === 'Galleon' ? true : Math.random() > 0.6,
    cargo: generateCargo(),
    appearancePhrase: appearancePhrase(shipType, morale),
    position,
  };
}
