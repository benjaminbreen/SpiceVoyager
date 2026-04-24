import { Language, Nationality } from '../store/gameStore';
import { type Commodity } from './commodities';

type Weighted<T> = [T, number];

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function weightedPick<T>(items: Weighted<T>[]): T {
  const total = items.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = Math.random() * total;
  for (const [item, weight] of items) {
    roll -= weight;
    if (roll <= 0) return item;
  }
  return items[items.length - 1][0];
}

export type ShipTraditionId =
  | 'portuguese_estado'
  | 'dutch_voc'
  | 'english_eic'
  | 'gujarati_merchant'
  | 'mughal_surati'
  | 'omani_dhow'
  | 'swahili_coaster'
  | 'ottoman_red_sea'
  | 'persian_gulf'
  | 'malay_prau'
  | 'acehnese_raider'
  | 'javanese_jong'
  | 'chinese_junk'
  | 'japanese_red_seal'
  | 'spanish_atlantic'
  | 'french_atlantic'
  | 'english_atlantic'
  | 'portuguese_atlantic'
  | 'dutch_atlantic'
  | 'local_caribbean';

export type ShipType =
  | 'Carrack'
  | 'Galleon'
  | 'Dhow'
  | 'Baghla'
  | 'Ghurab'
  | 'Pattamar'
  | 'Junk'
  | 'Jong'
  | 'Prau'
  | 'Pinnace'
  | 'Fluyt'
  | 'Armed Merchantman'
  | 'Dhoni'
  | 'Patacher'
  | 'Manchua'
  | 'Sampan'
  | 'Gallivat'
  | 'Caravel'
  | 'Nao'
  | 'Bark'
  | 'Brigantine'
  | 'Felucca'
  | 'Piragua';

export type RouteRole =
  | 'coastal trader'
  | 'blue-water merchant'
  | 'pilgrim carrier'
  | 'horse transport'
  | 'spice convoy'
  | 'armed patrol'
  | 'privateer'
  | 'smuggler'
  | 'courier'
  | 'fisherman'
  | 'ferry';

type NamePoolId =
  | 'portuguese'
  | 'luso_asian'
  | 'dutch'
  | 'english'
  | 'gujarati_hindu'
  | 'gujarati_muslim'
  | 'mughal'
  | 'omani'
  | 'swahili'
  | 'ottoman'
  | 'persian'
  | 'malay'
  | 'acehnese'
  | 'javanese'
  | 'chinese'
  | 'japanese'
  | 'spanish'
  | 'french'
  | 'caribbean';

export type ShipVisualFamily = 'dhow' | 'junk' | 'prau' | 'european';

export interface NPCShipVisual {
  family: ShipVisualFamily;
  hullColor: string;
  trimColor: string;
  deckColor: string;
  sailColor: string;
  sailTrimColor: string;
  flagColor: string;
  flagAccentColor: string;
  mastCount: number;
  sailPlan: 'lateen' | 'square' | 'junk' | 'lug' | 'mixed';
  hasOutrigger: boolean;
  hasCannonPorts: boolean;
  hasSternCastle: boolean;
  scale: number;
  wear: number;
}

export interface NPCShipGenerationContext {
  portId?: string;
}

interface ShipTradition {
  id: ShipTraditionId;
  label: string;
  factions: Weighted<Nationality>[];
  captainNamePools: Weighted<NamePoolId>[];
  hailLanguages: Weighted<Language>[];
  roles: Weighted<RouteRole>[];
  shipTypes: Weighted<ShipType>[];
  cargo: Weighted<Commodity>[];
  hullPalettes: Weighted<Pick<NPCShipVisual, 'hullColor' | 'trimColor' | 'deckColor'>>[];
  sailPalettes: Weighted<Pick<NPCShipVisual, 'sailColor' | 'sailTrimColor'>>[];
  flagPalettes: Weighted<Pick<NPCShipVisual, 'flagColor' | 'flagAccentColor'>>[];
  armament: number;
  mixedCaptainChance?: number;
}

const NAME_POOLS: Record<NamePoolId, [string[], string[]]> = {
  portuguese: [['Rodrigo', 'Afonso', 'Pedro', 'Diogo', 'Manuel', 'Vasco', 'Tome'], ['da Silva', 'Pereira', 'Correia', 'de Brito', 'Teixeira', 'Alvares', 'Lopes']],
  luso_asian: [['Gaspar', 'Andre', 'Domingos', 'Bento', 'Simiao', 'Estevao'], ['de Goa', 'de Cochim', 'Fernandes', 'Rodrigues', 'Dias', 'da Costa']],
  dutch: [['Willem', 'Jan', 'Pieter', 'Cornelis', 'Hendrik', 'Dirk', 'Jacob'], ['de Groot', 'Janssen', 'de Vries', 'van Neck', 'Both', 'Bakker', 'van der Velde']],
  english: [['Thomas', 'William', 'John', 'Edward', 'Richard', 'Henry', 'James'], ['Blackwood', 'Hawkins', 'Fletcher', 'Ward', 'Cooper', 'Lancaster', 'Middleton']],
  gujarati_hindu: [['Virji', 'Govind', 'Hari', 'Mohan', 'Kanji', 'Premji', 'Kalyan'], ['Vora', 'Seth', 'Mehta', 'Parekh', 'Shah', 'Patel', 'Bhatia']],
  gujarati_muslim: [['Abdul', 'Yusuf', 'Ismail', 'Hasan', 'Rahim', 'Qasim', 'Karim'], ['Vora', 'Surati', 'Memon', 'Bohra', 'Khoja', 'Lakhani', 'Mandvi']],
  mughal: [['Mirza', 'Asaf', 'Nur', 'Sher', 'Qasim', 'Yusuf', 'Ibrahim'], ['Khan', 'Beg', 'Ali', 'Shah', 'Ahmad', 'Malik', 'Husain']],
  omani: [['Nasir', 'Said', 'Hamad', 'Sultan', 'Rashid', 'Khalid', 'Salim'], ['bin Said', 'al-Yarubi', 'al-Harthi', 'bin Rashid', 'al-Hinai', 'bin Ahmed']],
  swahili: [['Yusuf', 'Hassan', 'Bakari', 'Juma', 'Rashid', 'Ali', 'Musa'], ['bin Ali', 'wa Kilwa', 'bin Bakari', 'al-Mazrui', 'Shirazi', 'bin Yusuf', 'wa Pate']],
  ottoman: [['Hasan', 'Mehmed', 'Ali', 'Mustafa', 'Osman', 'Ahmed', 'Piri'], ['Reis', 'Pasha', 'Agha', 'Bey', 'Efendi', 'Kapudan']],
  persian: [['Abbas', 'Hossein', 'Reza', 'Rostam', 'Mehdi', 'Farhad', 'Bahram'], ['Khan', 'Beg', 'Shirazi', 'Isfahani', 'Gilani', 'Tabrizi']],
  malay: [['Tun', 'Hang', 'Abdul', 'Raja', 'Ahmad', 'Ismail', 'Hamzah'], ['Perak', 'Tuah', 'Shah', 'Ibrahim', 'Setia', 'Muda']],
  acehnese: [['Iskandar', 'Abdul', 'Meurah', 'Teuku', 'Malik', 'Jamal'], ['Aceh', 'Pase', 'Perlak', 'Syah', 'al-Din', 'Lamuri']],
  javanese: [['Raden', 'Mas', 'Ki', 'Jaka', 'Surya', 'Wira'], ['Banten', 'Prawira', 'Wijaya', 'Santosa', 'Kusuma', 'Mataram']],
  chinese: [['Li', 'Zhang', 'Chen', 'Wang', 'Zheng', 'Wu', 'Huang'], ['Zhilong', 'Chenggong', 'Feng', 'Wei', 'Hai', 'Ming', 'Guang']],
  japanese: [['Yamada', 'Tanaka', 'Hasekura', 'Matsuura', 'Araki', 'Nishi', 'Harada'], ['Nagamasa', 'Shiro', 'Tsunenaga', 'Takanobu', 'Sotaro', 'Ryoi']],
  spanish: [['Diego', 'Fernando', 'Alonso', 'Pedro', 'Juan', 'Hernando', 'Gonzalo'], ['de Mendoza', 'de Leon', 'Velazquez', 'Cordoba', 'de Zuniga', 'Ramirez', 'Gutierrez']],
  french: [['Jacques', 'Pierre', 'Jean', 'Antoine', 'Francois', 'Louis', 'Rene'], ['de la Roche', 'Dupont', 'Cartier', 'Champlain', 'de Mons', 'Le Clerc', 'Bontemps']],
  caribbean: [['Diego', 'Juan', 'Manuel', 'Tomas', 'Pedro', 'Gaspar', 'Andre'], ['Mulato', 'de Trinidad', 'Cimarron', 'de la Costa', 'Zambo', 'de la Mar']],
};

export const SHIP_NAMES: Record<ShipType, string[]> = {
  Carrack: ['Sao Gabriel', 'Santa Maria', 'Flor de la Mar', 'Madre de Deus', 'Bom Jesus', 'Santa Catarina', 'Esperanca'],
  Galleon: ['San Felipe', 'Nossa Senhora', 'Revenge', 'Triumph', 'Batavia', 'Mauritius', 'Neptune'],
  Dhow: ['al-Rahma', 'al-Buraq', 'Safina', 'al-Najm', 'al-Qamar', 'al-Salam', 'al-Huda', 'Noor'],
  Baghla: ['Baghla al-Fath', 'al-Nasr', 'al-Ward', 'Maryam', 'Zarqa', 'Kawthar'],
  Ghurab: ['Ghurab Surat', 'al-Bahr', 'Fath-i-Darya', 'Rahmani', 'Nur Jahan'],
  Pattamar: ['Malabar Star', 'Calicut Wind', 'Cochin Moon', 'Kanara', 'Monsoon Gift'],
  Junk: ['Bao Chuan', 'Fuchuan', 'Longxing', 'Taiping', 'Ruyi', 'Nanhai', 'Wanli'],
  Jong: ['Majapahit', 'Sunda Kelapa', 'Banten Laut', 'Mataram', 'Java Star'],
  Prau: ['Perahu Muda', 'Layar Merah', 'Selat Wind', 'Harimau', 'Bulan Laut'],
  Pinnace: ['Swift', 'Greyhound', 'Discovery', 'Messenger', 'Hopewell', 'Speedwell', 'Falcon'],
  Fluyt: ['Amsterdam', 'Zeelandia', 'Eendracht', 'Duyfken', 'Gelderland', 'Hollandia'],
  'Armed Merchantman': ['Venture', 'Resolution', 'Santiago', 'Sovereign', 'Endeavour', 'Santa Cruz'],
  Dhoni: ['Maldivi', 'al-Samak', 'Kuda Odi', 'Mas Odi', 'Laamasi', 'Bokkura', 'Jazeera'],
  Patacher: ['Sao Joao', 'Santa Ana', 'Pomba', 'Boa Viagem', 'Rosario', 'Conceicao', 'Graca'],
  Manchua: ['Bhagya', 'Lakshmi', 'Savitri', 'Ganga', 'Narmada', 'Devi', 'Tara'],
  Sampan: ['Xiaochuan', 'Heping', 'Mingzhu', 'Fengshun', 'Wancheng', 'Hehua', 'Yueliang'],
  Gallivat: ['Fath-i-Bahr', 'Qasim', 'Rustam', 'Surya', 'Jahanara', 'Shahin', 'Maratha'],
  Caravel: ['Santa Cruz', 'Sao Cristovao', 'Berrio', 'Boa Esperanca', 'Sao Pantaleao', 'Nina', 'Anunciada'],
  Nao: ['San Antonio', 'Trinidad', 'Victoria', 'Concepcion', 'Santiago', 'Sao Braz', 'Santo Espirito'],
  Bark: ['Merchant Royal', 'Fortune', 'Patience', 'Blessing', 'Providence', 'Industry', 'Endeavour'],
  Brigantine: ['Sea Hawk', 'Chasseur', 'Corsaire', 'Esperanza', 'Aventura', 'Venganza', 'Relampago'],
  Felucca: ['al-Zahr', 'Yasemin', 'al-Falak', 'Maryam', 'Sultana', 'al-Amal'],
  Piragua: ['Caribe', 'Manatee', 'Tortuga', 'Colibri', 'Iguana', 'Guanaha'],
};

const HULL_BY_TYPE: Record<ShipType, [number, number]> = {
  Piragua: [5, 12],
  Sampan: [10, 20],
  Felucca: [10, 22],
  Dhoni: [12, 25],
  Patacher: [15, 30],
  Manchua: [18, 35],
  Gallivat: [20, 40],
  Brigantine: [25, 50],
  Pinnace: [30, 50],
  Caravel: [30, 55],
  Bark: [40, 75],
  Nao: [55, 100],
  Prau: [25, 45],
  Dhow: [40, 70],
  Pattamar: [42, 72],
  Baghla: [55, 90],
  Ghurab: [55, 95],
  Junk: [55, 90],
  Jong: [65, 105],
  Fluyt: [55, 95],
  Carrack: [70, 115],
  'Armed Merchantman': [70, 120],
  Galleon: [90, 140],
};

const CREW_BY_TYPE: Record<ShipType, [number, number]> = {
  Piragua: [1, 3],
  Sampan: [1, 4],
  Felucca: [2, 5],
  Dhoni: [2, 6],
  Patacher: [3, 10],
  Manchua: [4, 12],
  Gallivat: [6, 18],
  Brigantine: [8, 28],
  Pinnace: [8, 22],
  Caravel: [10, 30],
  Bark: [12, 38],
  Nao: [22, 65],
  Prau: [8, 24],
  Dhow: [10, 32],
  Pattamar: [12, 34],
  Baghla: [18, 48],
  Ghurab: [18, 55],
  Junk: [18, 60],
  Jong: [26, 85],
  Fluyt: [18, 55],
  Carrack: [35, 95],
  'Armed Merchantman': [28, 85],
  Galleon: [45, 130],
};

function familyForShipType(shipType: ShipType): ShipVisualFamily {
  if (shipType === 'Junk' || shipType === 'Sampan') return 'junk';
  if (shipType === 'Prau' || shipType === 'Jong' || shipType === 'Piragua') return 'prau';
  if (shipType === 'Carrack' || shipType === 'Galleon' || shipType === 'Pinnace' || shipType === 'Fluyt'
    || shipType === 'Armed Merchantman' || shipType === 'Patacher' || shipType === 'Caravel'
    || shipType === 'Nao' || shipType === 'Bark' || shipType === 'Brigantine') return 'european';
  // Dhoni, Manchua, Gallivat, Felucca, Dhow, Baghla, Ghurab, Pattamar → dhow
  return 'dhow';
}

function mastCountForShipType(shipType: ShipType): number {
  switch (shipType) {
    case 'Carrack':
    case 'Galleon':
    case 'Armed Merchantman':
    case 'Nao':
      return 3;
    case 'Junk':
    case 'Jong':
    case 'Baghla':
    case 'Ghurab':
    case 'Fluyt':
    case 'Bark':
    case 'Brigantine':
    case 'Caravel':
      return 2;
    // All small vessels + single-mast types
    default:
      return 1;
  }
}

function sailPlanForShipType(shipType: ShipType): NPCShipVisual['sailPlan'] {
  if (shipType === 'Junk' || shipType === 'Sampan') return 'junk';
  if (shipType === 'Prau' || shipType === 'Jong' || shipType === 'Piragua') return 'lug';
  if (shipType === 'Carrack' || shipType === 'Galleon' || shipType === 'Armed Merchantman' || shipType === 'Nao') return 'mixed';
  if (shipType === 'Fluyt' || shipType === 'Pinnace' || shipType === 'Patacher' || shipType === 'Bark' || shipType === 'Brigantine') return 'square';
  // Caravel historically used lateen — one of the few European ships to do so
  if (shipType === 'Caravel') return 'lateen';
  return 'lateen';
}

function visualScaleForShipType(shipType: ShipType): number {
  switch (shipType) {
    case 'Piragua': return 0.32;
    case 'Sampan': return 0.42;
    case 'Felucca': return 0.45;
    case 'Dhoni': return 0.5;
    case 'Patacher': return 0.58;
    case 'Manchua': return 0.62;
    case 'Gallivat': return 0.72;
    case 'Caravel': return 0.75;
    case 'Brigantine': return 0.78;
    case 'Prau': return 0.85;
    case 'Pinnace': return 0.92;
    case 'Bark': return 0.95;
    case 'Dhow': return 1;
    case 'Pattamar': return 1.05;
    case 'Nao': return 1.1;
    case 'Baghla':
    case 'Ghurab': return 1.15;
    case 'Junk': return 1.18;
    case 'Jong': return 1.28;
    case 'Carrack':
    case 'Fluyt':
    case 'Armed Merchantman': return 1.3;
    case 'Galleon': return 1.45;
  }
}

const TRADITIONS: Record<ShipTraditionId, ShipTradition> = {
  portuguese_estado: {
    id: 'portuguese_estado',
    label: 'Portuguese',
    factions: [['Portuguese', 100]],
    captainNamePools: [['portuguese', 80], ['luso_asian', 20]],
    hailLanguages: [['Portuguese', 76], ['Arabic', 8], ['Malay', 8], ['Gujarati', 8]],
    roles: [['armed patrol', 30], ['blue-water merchant', 30], ['spice convoy', 22], ['courier', 10], ['privateer', 8]],
    shipTypes: [['Carrack', 16], ['Galleon', 8], ['Armed Merchantman', 18], ['Pinnace', 18], ['Patacher', 28], ['Manchua', 12]],
    cargo: [['Black Pepper', 20], ['Cinnamon', 14], ['Small Shot', 18], ['Cloves', 10], ['Nutmeg', 8], ['Chinese Porcelain', 8], ['Rice', 10]],
    hullPalettes: [[{ hullColor: '#3f3027', trimColor: '#9b2f25', deckColor: '#6d4c32' }, 55], [{ hullColor: '#252527', trimColor: '#d6c18f', deckColor: '#6b4a31' }, 45]],
    sailPalettes: [[{ sailColor: '#d8c7a2', sailTrimColor: '#9b2f25' }, 65], [{ sailColor: '#c9b694', sailTrimColor: '#ddd2b5' }, 35]],
    flagPalettes: [[{ flagColor: '#f3ead8', flagAccentColor: '#b82923' }, 80], [{ flagColor: '#b82923', flagAccentColor: '#f3ead8' }, 20]],
    armament: 0.72,
  },
  dutch_voc: {
    id: 'dutch_voc',
    label: 'Dutch',
    factions: [['Dutch', 100]],
    captainNamePools: [['dutch', 95], ['luso_asian', 5]],
    hailLanguages: [['Dutch', 72], ['Portuguese', 16], ['Malay', 12]],
    roles: [['blue-water merchant', 36], ['spice convoy', 26], ['armed patrol', 18], ['privateer', 12], ['courier', 8]],
    shipTypes: [['Fluyt', 22], ['Armed Merchantman', 16], ['Pinnace', 20], ['Galleon', 6], ['Junk', 6], ['Patacher', 18], ['Sampan', 12]],
    cargo: [['Cloves', 22], ['Nutmeg', 20], ['Black Pepper', 14], ['Small Shot', 12], ['Chinese Porcelain', 10], ['Rice', 12]],
    hullPalettes: [[{ hullColor: '#2d342f', trimColor: '#d29539', deckColor: '#6a563d' }, 60], [{ hullColor: '#30343b', trimColor: '#c8b37c', deckColor: '#67513a' }, 40]],
    sailPalettes: [[{ sailColor: '#d2c3a4', sailTrimColor: '#d29539' }, 70], [{ sailColor: '#bbb3a0', sailTrimColor: '#5d6b74' }, 30]],
    flagPalettes: [[{ flagColor: '#d6673b', flagAccentColor: '#f4e5c6' }, 65], [{ flagColor: '#f4e5c6', flagAccentColor: '#345c85' }, 35]],
    armament: 0.62,
  },
  english_eic: {
    id: 'english_eic',
    label: 'English',
    factions: [['English', 100]],
    captainNamePools: [['english', 96], ['luso_asian', 4]],
    hailLanguages: [['English', 78], ['Portuguese', 16], ['Arabic', 6]],
    roles: [['blue-water merchant', 42], ['armed patrol', 18], ['privateer', 16], ['spice convoy', 16], ['courier', 8]],
    shipTypes: [['Armed Merchantman', 24], ['Pinnace', 22], ['Galleon', 8], ['Carrack', 8], ['Patacher', 26], ['Manchua', 12]],
    cargo: [['Black Pepper', 18], ['Small Shot', 15], ['Indigo', 13], ['Cloves', 10], ['Nutmeg', 8], ['Rice', 18]],
    hullPalettes: [[{ hullColor: '#352d28', trimColor: '#b83b2e', deckColor: '#6d5239' }, 55], [{ hullColor: '#273238', trimColor: '#d0b165', deckColor: '#66513a' }, 45]],
    sailPalettes: [[{ sailColor: '#d1c4a6', sailTrimColor: '#b83b2e' }, 55], [{ sailColor: '#c5b798', sailTrimColor: '#f0e1bb' }, 45]],
    flagPalettes: [[{ flagColor: '#d8e1e8', flagAccentColor: '#b72828' }, 80], [{ flagColor: '#b72828', flagAccentColor: '#d8e1e8' }, 20]],
    armament: 0.6,
  },
  gujarati_merchant: {
    id: 'gujarati_merchant',
    label: 'Gujarati',
    factions: [['Gujarati', 100]],
    captainNamePools: [['gujarati_hindu', 52], ['gujarati_muslim', 48]],
    hailLanguages: [['Gujarati', 50], ['Hindustani', 20], ['Persian', 16], ['Arabic', 14]],
    roles: [['coastal trader', 38], ['blue-water merchant', 24], ['horse transport', 15], ['pilgrim carrier', 12], ['spice convoy', 11]],
    shipTypes: [['Dhow', 22], ['Baghla', 10], ['Ghurab', 8], ['Pattamar', 16], ['Pinnace', 4], ['Armed Merchantman', 3], ['Dhoni', 20], ['Manchua', 17]],
    cargo: [['Indigo', 16], ['Black Pepper', 14], ['Rice', 12], ['Iron', 8], ['Timber', 6], ['Cardamom', 6], ['Pearls', 5], ['Small Shot', 5]],
    hullPalettes: [[{ hullColor: '#4a3323', trimColor: '#3f7c63', deckColor: '#7b5939' }, 50], [{ hullColor: '#2f2a24', trimColor: '#bd8f3a', deckColor: '#765438' }, 50]],
    sailPalettes: [[{ sailColor: '#d9c79d', sailTrimColor: '#9f6e2a' }, 55], [{ sailColor: '#cdb78e', sailTrimColor: '#3f7c63' }, 45]],
    flagPalettes: [[{ flagColor: '#2f7c53', flagAccentColor: '#e7d7a8' }, 50], [{ flagColor: '#d6a33b', flagAccentColor: '#243f35' }, 50]],
    armament: 0.28,
  },
  mughal_surati: {
    id: 'mughal_surati',
    label: 'Mughal',
    factions: [['Mughal', 100]],
    captainNamePools: [['mughal', 82], ['gujarati_muslim', 18]],
    hailLanguages: [['Hindustani', 38], ['Persian', 34], ['Gujarati', 18], ['Arabic', 10]],
    roles: [['blue-water merchant', 28], ['horse transport', 22], ['pilgrim carrier', 20], ['armed patrol', 12], ['coastal trader', 18]],
    shipTypes: [['Ghurab', 14], ['Baghla', 14], ['Dhow', 16], ['Pattamar', 14], ['Armed Merchantman', 5], ['Gallivat', 16], ['Dhoni', 12], ['Manchua', 9]],
    cargo: [['Indigo', 18], ['Iron', 12], ['Opium', 10], ['Rice', 10], ['Pearls', 8], ['Small Shot', 10], ['Black Pepper', 10]],
    hullPalettes: [[{ hullColor: '#453424', trimColor: '#315b78', deckColor: '#7a5637' }, 55], [{ hullColor: '#382d26', trimColor: '#8b6f2a', deckColor: '#6d5035' }, 45]],
    sailPalettes: [[{ sailColor: '#d4c39b', sailTrimColor: '#315b78' }, 60], [{ sailColor: '#c8b48b', sailTrimColor: '#8b6f2a' }, 40]],
    flagPalettes: [[{ flagColor: '#2e6b43', flagAccentColor: '#d6b13b' }, 70], [{ flagColor: '#315b78', flagAccentColor: '#e7d7a8' }, 30]],
    armament: 0.42,
  },
  omani_dhow: {
    id: 'omani_dhow',
    label: 'Omani',
    factions: [['Omani', 100]],
    captainNamePools: [['omani', 100]],
    hailLanguages: [['Arabic', 62], ['Swahili', 16], ['Persian', 12], ['Gujarati', 10]],
    roles: [['coastal trader', 32], ['blue-water merchant', 26], ['pilgrim carrier', 16], ['horse transport', 12], ['smuggler', 8], ['privateer', 6]],
    shipTypes: [['Dhow', 28], ['Baghla', 14], ['Ghurab', 10], ['Pattamar', 6], ['Pinnace', 4], ['Dhoni', 24], ['Manchua', 14]],
    cargo: [['Frankincense', 16], ['Myrrh', 12], ['Coffee', 12], ['Pearls', 10], ['Rice', 12], ['Black Pepper', 12], ['Small Shot', 8], ['Timber', 8]],
    hullPalettes: [[{ hullColor: '#3f3025', trimColor: '#6d8f91', deckColor: '#76563b' }, 50], [{ hullColor: '#2f2b25', trimColor: '#bfb17b', deckColor: '#705339' }, 50]],
    sailPalettes: [[{ sailColor: '#d8cba6', sailTrimColor: '#6d8f91' }, 65], [{ sailColor: '#c7b58e', sailTrimColor: '#bfb17b' }, 35]],
    flagPalettes: [[{ flagColor: '#c9ded9', flagAccentColor: '#b63a32' }, 55], [{ flagColor: '#b63a32', flagAccentColor: '#f0dec0' }, 45]],
    armament: 0.35,
  },
  swahili_coaster: {
    id: 'swahili_coaster',
    label: 'Swahili',
    factions: [['Swahili', 100]],
    captainNamePools: [['swahili', 100]],
    hailLanguages: [['Swahili', 56], ['Arabic', 30], ['Portuguese', 8], ['Gujarati', 6]],
    roles: [['coastal trader', 52], ['blue-water merchant', 16], ['pilgrim carrier', 12], ['smuggler', 12], ['courier', 8]],
    shipTypes: [['Dhow', 30], ['Baghla', 8], ['Pattamar', 8], ['Prau', 6], ['Pinnace', 4], ['Dhoni', 28], ['Manchua', 16]],
    cargo: [['Ivory', 18], ['Ambergris', 12], ['Rice', 14], ['Frankincense', 10], ['Myrrh', 8], ['Timber', 8], ['Black Pepper', 8], ['Small Shot', 10]],
    hullPalettes: [[{ hullColor: '#3a2c22', trimColor: '#497c76', deckColor: '#6d4f36' }, 55], [{ hullColor: '#4a3725', trimColor: '#a56b3f', deckColor: '#755338' }, 45]],
    sailPalettes: [[{ sailColor: '#d1c097', sailTrimColor: '#497c76' }, 55], [{ sailColor: '#bfae87', sailTrimColor: '#a56b3f' }, 45]],
    flagPalettes: [[{ flagColor: '#497c76', flagAccentColor: '#efe0bd' }, 55], [{ flagColor: '#a56b3f', flagAccentColor: '#efe0bd' }, 45]],
    armament: 0.24,
  },
  ottoman_red_sea: {
    id: 'ottoman_red_sea',
    label: 'Ottoman',
    factions: [['Ottoman', 100]],
    captainNamePools: [['ottoman', 100]],
    hailLanguages: [['Turkish', 48], ['Arabic', 34], ['Persian', 18]],
    roles: [['armed patrol', 26], ['pilgrim carrier', 24], ['coastal trader', 22], ['blue-water merchant', 18], ['courier', 10]],
    shipTypes: [['Dhow', 22], ['Baghla', 14], ['Ghurab', 10], ['Pinnace', 8], ['Armed Merchantman', 6], ['Dhoni', 22], ['Gallivat', 10], ['Manchua', 8]],
    cargo: [['Coffee', 24], ['Frankincense', 14], ['Myrrh', 10], ['Rose Water', 8], ['Small Shot', 14], ['Rice', 12], ['Saffron', 8]],
    hullPalettes: [[{ hullColor: '#3a3028', trimColor: '#3c7560', deckColor: '#71543a' }, 50], [{ hullColor: '#2f2825', trimColor: '#a8382e', deckColor: '#6e5139' }, 50]],
    sailPalettes: [[{ sailColor: '#d3c29d', sailTrimColor: '#3c7560' }, 60], [{ sailColor: '#cbb88f', sailTrimColor: '#a8382e' }, 40]],
    flagPalettes: [[{ flagColor: '#a8382e', flagAccentColor: '#f2e6c7' }, 80], [{ flagColor: '#3c7560', flagAccentColor: '#f2e6c7' }, 20]],
    armament: 0.5,
  },
  persian_gulf: {
    id: 'persian_gulf',
    label: 'Persian',
    factions: [['Persian', 100]],
    captainNamePools: [['persian', 100]],
    hailLanguages: [['Persian', 58], ['Arabic', 25], ['Gujarati', 17]],
    roles: [['horse transport', 28], ['blue-water merchant', 24], ['coastal trader', 24], ['pilgrim carrier', 12], ['smuggler', 12]],
    shipTypes: [['Baghla', 18], ['Dhow', 20], ['Ghurab', 12], ['Pattamar', 8], ['Pinnace', 4], ['Dhoni', 22], ['Manchua', 16]],
    cargo: [['Pearls', 18], ['Rose Water', 14], ['Saffron', 12], ['Coffee', 10], ['Rice', 10], ['Small Shot', 8], ['Frankincense', 8], ['Myrrh', 8]],
    hullPalettes: [[{ hullColor: '#3d2d25', trimColor: '#516f8f', deckColor: '#74553a' }, 55], [{ hullColor: '#332923', trimColor: '#9f7737', deckColor: '#6f5038' }, 45]],
    sailPalettes: [[{ sailColor: '#d6c49b', sailTrimColor: '#516f8f' }, 55], [{ sailColor: '#c7b58d', sailTrimColor: '#9f7737' }, 45]],
    flagPalettes: [[{ flagColor: '#516f8f', flagAccentColor: '#f0ddad' }, 50], [{ flagColor: '#9f7737', flagAccentColor: '#f0ddad' }, 50]],
    armament: 0.32,
  },
  malay_prau: {
    id: 'malay_prau',
    label: 'Malay',
    factions: [['Malay', 100]],
    captainNamePools: [['malay', 100]],
    hailLanguages: [['Malay', 64], ['Portuguese', 16], ['Chinese', 10], ['Arabic', 10]],
    roles: [['coastal trader', 36], ['smuggler', 22], ['courier', 16], ['privateer', 12], ['spice convoy', 14]],
    shipTypes: [['Prau', 30], ['Jong', 12], ['Dhow', 8], ['Junk', 8], ['Sampan', 22], ['Dhoni', 20]],
    cargo: [['Cloves', 18], ['Nutmeg', 16], ['Benzoin', 12], ['Camphor', 10], ['Rice', 12], ['Chinese Porcelain', 10], ['Black Pepper', 10], ['Small Shot', 12]],
    hullPalettes: [[{ hullColor: '#342b22', trimColor: '#b54d35', deckColor: '#6d4e34' }, 55], [{ hullColor: '#263331', trimColor: '#d2a348', deckColor: '#665239' }, 45]],
    sailPalettes: [[{ sailColor: '#cfc08f', sailTrimColor: '#b54d35' }, 55], [{ sailColor: '#bfae82', sailTrimColor: '#d2a348' }, 45]],
    flagPalettes: [[{ flagColor: '#b54d35', flagAccentColor: '#f1dfaa' }, 55], [{ flagColor: '#d2a348', flagAccentColor: '#263331' }, 45]],
    armament: 0.38,
  },
  acehnese_raider: {
    id: 'acehnese_raider',
    label: 'Acehnese',
    factions: [['Acehnese', 100]],
    captainNamePools: [['acehnese', 100]],
    hailLanguages: [['Malay', 50], ['Arabic', 28], ['Portuguese', 12], ['Turkish', 10]],
    roles: [['privateer', 36], ['armed patrol', 22], ['spice convoy', 16], ['smuggler', 16], ['coastal trader', 10]],
    shipTypes: [['Prau', 22], ['Jong', 14], ['Ghurab', 10], ['Dhow', 8], ['Pinnace', 6], ['Gallivat', 18], ['Sampan', 12], ['Dhoni', 10]],
    cargo: [['Small Shot', 20], ['Cloves', 16], ['Nutmeg', 12], ['Black Pepper', 12], ['Benzoin', 10], ['Rice', 10], ['Camphor', 10]],
    hullPalettes: [[{ hullColor: '#252a29', trimColor: '#b4362e', deckColor: '#684b34' }, 65], [{ hullColor: '#3b2c22', trimColor: '#d0a035', deckColor: '#705037' }, 35]],
    sailPalettes: [[{ sailColor: '#b9aa86', sailTrimColor: '#b4362e' }, 70], [{ sailColor: '#c9b989', sailTrimColor: '#252a29' }, 30]],
    flagPalettes: [[{ flagColor: '#b4362e', flagAccentColor: '#f0dfb0' }, 70], [{ flagColor: '#252a29', flagAccentColor: '#d0a035' }, 30]],
    armament: 0.68,
  },
  javanese_jong: {
    id: 'javanese_jong',
    label: 'Javanese',
    factions: [['Javanese', 100]],
    captainNamePools: [['javanese', 100]],
    hailLanguages: [['Malay', 58], ['Portuguese', 16], ['Chinese', 14], ['Arabic', 12]],
    roles: [['coastal trader', 32], ['blue-water merchant', 22], ['spice convoy', 20], ['smuggler', 16], ['courier', 10]],
    shipTypes: [['Jong', 22], ['Prau', 16], ['Junk', 10], ['Dhow', 8], ['Pinnace', 4], ['Sampan', 22], ['Dhoni', 18]],
    cargo: [['Rice', 18], ['Cloves', 16], ['Nutmeg', 14], ['Benzoin', 12], ['Camphor', 10], ['Black Pepper', 10], ['Chinese Porcelain', 10], ['Small Shot', 10]],
    hullPalettes: [[{ hullColor: '#3a2c23', trimColor: '#62733f', deckColor: '#715238' }, 50], [{ hullColor: '#292f2c', trimColor: '#b65a36', deckColor: '#694d36' }, 50]],
    sailPalettes: [[{ sailColor: '#c9ba8d', sailTrimColor: '#62733f' }, 55], [{ sailColor: '#b9ab83', sailTrimColor: '#b65a36' }, 45]],
    flagPalettes: [[{ flagColor: '#62733f', flagAccentColor: '#ead9a4' }, 50], [{ flagColor: '#b65a36', flagAccentColor: '#ead9a4' }, 50]],
    armament: 0.36,
  },
  chinese_junk: {
    id: 'chinese_junk',
    label: 'Chinese',
    factions: [['Chinese', 100]],
    captainNamePools: [['chinese', 100]],
    hailLanguages: [['Chinese', 72], ['Malay', 18], ['Portuguese', 10]],
    roles: [['blue-water merchant', 42], ['coastal trader', 28], ['spice convoy', 14], ['smuggler', 10], ['courier', 6]],
    shipTypes: [['Junk', 38], ['Jong', 8], ['Prau', 4], ['Sampan', 34], ['Manchua', 16]],
    cargo: [['Chinese Porcelain', 24], ['Tea', 18], ['Camphor', 12], ['Benzoin', 10], ['Cloves', 8], ['Nutmeg', 8], ['Rice', 12], ['Small Shot', 8]],
    hullPalettes: [[{ hullColor: '#2c302c', trimColor: '#b84232', deckColor: '#6b5037' }, 55], [{ hullColor: '#3b3329', trimColor: '#d6a33a', deckColor: '#73553b' }, 45]],
    sailPalettes: [[{ sailColor: '#c8b98b', sailTrimColor: '#b84232' }, 50], [{ sailColor: '#bfa06f', sailTrimColor: '#2c302c' }, 50]],
    flagPalettes: [[{ flagColor: '#b84232', flagAccentColor: '#e5c35a' }, 70], [{ flagColor: '#e5c35a', flagAccentColor: '#2c302c' }, 30]],
    armament: 0.35,
  },
  japanese_red_seal: {
    id: 'japanese_red_seal',
    label: 'Japanese',
    factions: [['Japanese', 100]],
    captainNamePools: [['japanese', 100]],
    hailLanguages: [['Japanese', 58], ['Chinese', 20], ['Portuguese', 16], ['Malay', 6]],
    roles: [['blue-water merchant', 30], ['armed patrol', 22], ['privateer', 18], ['spice convoy', 18], ['courier', 12]],
    shipTypes: [['Junk', 24], ['Armed Merchantman', 10], ['Pinnace', 10], ['Prau', 8], ['Jong', 6], ['Sampan', 26], ['Manchua', 16]],
    cargo: [['Chinese Porcelain', 16], ['Tea', 14], ['Small Shot', 16], ['Cloves', 12], ['Nutmeg', 10], ['Rice', 12], ['Camphor', 10]],
    hullPalettes: [[{ hullColor: '#2c2a28', trimColor: '#b73832', deckColor: '#6d5138' }, 65], [{ hullColor: '#3b3028', trimColor: '#e1d5b1', deckColor: '#74563c' }, 35]],
    sailPalettes: [[{ sailColor: '#d1c4a4', sailTrimColor: '#b73832' }, 65], [{ sailColor: '#c4b28c', sailTrimColor: '#2c2a28' }, 35]],
    flagPalettes: [[{ flagColor: '#f1e6cf', flagAccentColor: '#b73832' }, 80], [{ flagColor: '#b73832', flagAccentColor: '#f1e6cf' }, 20]],
    armament: 0.48,
  },

  // ── Atlantic & European traditions ───────────────────────────────────────

  spanish_atlantic: {
    id: 'spanish_atlantic',
    label: 'Spanish',
    factions: [['Spanish', 100]],
    captainNamePools: [['spanish', 100]],
    hailLanguages: [['Spanish', 78], ['Portuguese', 12], ['French', 10]],
    roles: [['blue-water merchant', 28], ['armed patrol', 20], ['spice convoy', 16], ['coastal trader', 14], ['privateer', 10], ['courier', 12]],
    shipTypes: [['Galleon', 14], ['Nao', 20], ['Caravel', 18], ['Bark', 12], ['Brigantine', 10], ['Pinnace', 10], ['Patacher', 16]],
    cargo: [['Sugar', 20], ['Tobacco', 14], ['Small Shot', 14], ['Iron', 10], ['Rice', 10], ['Black Pepper', 8], ['Chinese Porcelain', 8], ['Indigo', 6]],
    hullPalettes: [[{ hullColor: '#3a2e24', trimColor: '#a83a2e', deckColor: '#6d5038' }, 55], [{ hullColor: '#2e2a28', trimColor: '#d4b04a', deckColor: '#6a4e35' }, 45]],
    sailPalettes: [[{ sailColor: '#d6c7a2', sailTrimColor: '#a83a2e' }, 60], [{ sailColor: '#c8b894', sailTrimColor: '#d4b04a' }, 40]],
    flagPalettes: [[{ flagColor: '#d4b04a', flagAccentColor: '#a83a2e' }, 70], [{ flagColor: '#a83a2e', flagAccentColor: '#d4b04a' }, 30]],
    armament: 0.62,
  },
  french_atlantic: {
    id: 'french_atlantic',
    label: 'French',
    factions: [['French', 100]],
    captainNamePools: [['french', 100]],
    hailLanguages: [['French', 82], ['Spanish', 10], ['Portuguese', 8]],
    roles: [['privateer', 26], ['blue-water merchant', 22], ['coastal trader', 18], ['smuggler', 16], ['armed patrol', 10], ['courier', 8]],
    shipTypes: [['Bark', 20], ['Brigantine', 22], ['Pinnace', 16], ['Caravel', 12], ['Armed Merchantman', 8], ['Patacher', 14], ['Nao', 8]],
    cargo: [['Sugar', 16], ['Tobacco', 14], ['Small Shot', 14], ['Iron', 10], ['Rice', 10], ['Black Pepper', 8], ['Timber', 8], ['Indigo', 8]],
    hullPalettes: [[{ hullColor: '#32302e', trimColor: '#2e5088', deckColor: '#6b5039' }, 55], [{ hullColor: '#3a342c', trimColor: '#d8d0b8', deckColor: '#705236' }, 45]],
    sailPalettes: [[{ sailColor: '#ddd5c0', sailTrimColor: '#2e5088' }, 60], [{ sailColor: '#c8c0aa', sailTrimColor: '#d4c48a' }, 40]],
    flagPalettes: [[{ flagColor: '#f0eadc', flagAccentColor: '#d4b04a' }, 75], [{ flagColor: '#2e5088', flagAccentColor: '#f0eadc' }, 25]],
    armament: 0.48,
  },
  english_atlantic: {
    id: 'english_atlantic',
    label: 'English',
    factions: [['English', 100]],
    captainNamePools: [['english', 100]],
    hailLanguages: [['English', 82], ['Spanish', 10], ['French', 8]],
    roles: [['privateer', 24], ['blue-water merchant', 24], ['armed patrol', 16], ['smuggler', 14], ['coastal trader', 12], ['courier', 10]],
    shipTypes: [['Armed Merchantman', 14], ['Bark', 18], ['Brigantine', 16], ['Pinnace', 18], ['Galleon', 6], ['Caravel', 8], ['Patacher', 20]],
    cargo: [['Small Shot', 16], ['Iron', 14], ['Tobacco', 12], ['Sugar', 10], ['Rice', 10], ['Timber', 8], ['Black Pepper', 8], ['Indigo', 8]],
    hullPalettes: [[{ hullColor: '#352d28', trimColor: '#b83b2e', deckColor: '#6d5239' }, 55], [{ hullColor: '#273238', trimColor: '#d0b165', deckColor: '#66513a' }, 45]],
    sailPalettes: [[{ sailColor: '#d1c4a6', sailTrimColor: '#b83b2e' }, 55], [{ sailColor: '#c5b798', sailTrimColor: '#f0e1bb' }, 45]],
    flagPalettes: [[{ flagColor: '#d8e1e8', flagAccentColor: '#b72828' }, 80], [{ flagColor: '#b72828', flagAccentColor: '#d8e1e8' }, 20]],
    armament: 0.55,
  },
  portuguese_atlantic: {
    id: 'portuguese_atlantic',
    label: 'Portuguese',
    factions: [['Portuguese', 100]],
    captainNamePools: [['portuguese', 85], ['luso_asian', 15]],
    hailLanguages: [['Portuguese', 82], ['Spanish', 10], ['Arabic', 8]],
    roles: [['blue-water merchant', 30], ['coastal trader', 22], ['armed patrol', 16], ['spice convoy', 14], ['courier', 10], ['smuggler', 8]],
    shipTypes: [['Carrack', 12], ['Nao', 16], ['Caravel', 24], ['Pinnace', 12], ['Patacher', 22], ['Bark', 8], ['Brigantine', 6]],
    cargo: [['Sugar', 22], ['Tobacco', 12], ['Black Pepper', 10], ['Small Shot', 10], ['Rice', 8], ['Iron', 8], ['Timber', 8], ['Ivory', 6], ['Indigo', 4]],
    hullPalettes: [[{ hullColor: '#3f3027', trimColor: '#9b2f25', deckColor: '#6d4c32' }, 55], [{ hullColor: '#252527', trimColor: '#d6c18f', deckColor: '#6b4a31' }, 45]],
    sailPalettes: [[{ sailColor: '#d8c7a2', sailTrimColor: '#9b2f25' }, 65], [{ sailColor: '#c9b694', sailTrimColor: '#ddd2b5' }, 35]],
    flagPalettes: [[{ flagColor: '#f3ead8', flagAccentColor: '#b82923' }, 80], [{ flagColor: '#b82923', flagAccentColor: '#f3ead8' }, 20]],
    armament: 0.52,
  },
  dutch_atlantic: {
    id: 'dutch_atlantic',
    label: 'Dutch',
    factions: [['Dutch', 100]],
    captainNamePools: [['dutch', 100]],
    hailLanguages: [['Dutch', 78], ['Portuguese', 12], ['Spanish', 10]],
    roles: [['blue-water merchant', 32], ['privateer', 20], ['armed patrol', 16], ['smuggler', 14], ['coastal trader', 10], ['courier', 8]],
    shipTypes: [['Fluyt', 22], ['Bark', 18], ['Pinnace', 16], ['Armed Merchantman', 10], ['Brigantine', 12], ['Patacher', 14], ['Galleon', 4], ['Caravel', 4]],
    cargo: [['Sugar', 16], ['Small Shot', 14], ['Iron', 12], ['Tobacco', 10], ['Rice', 10], ['Timber', 10], ['Black Pepper', 8], ['Cloves', 8]],
    hullPalettes: [[{ hullColor: '#2d342f', trimColor: '#d29539', deckColor: '#6a563d' }, 60], [{ hullColor: '#30343b', trimColor: '#c8b37c', deckColor: '#67513a' }, 40]],
    sailPalettes: [[{ sailColor: '#d2c3a4', sailTrimColor: '#d29539' }, 70], [{ sailColor: '#bbb3a0', sailTrimColor: '#5d6b74' }, 30]],
    flagPalettes: [[{ flagColor: '#d6673b', flagAccentColor: '#f4e5c6' }, 65], [{ flagColor: '#f4e5c6', flagAccentColor: '#345c85' }, 35]],
    armament: 0.5,
  },
  local_caribbean: {
    id: 'local_caribbean',
    label: 'Caribbean',
    factions: [['Spanish', 40], ['Portuguese', 30], ['French', 15], ['English', 15]],
    captainNamePools: [['caribbean', 50], ['spanish', 30], ['portuguese', 20]],
    hailLanguages: [['Spanish', 50], ['Portuguese', 20], ['French', 15], ['English', 15]],
    roles: [['fisherman', 30], ['ferry', 20], ['coastal trader', 22], ['smuggler', 16], ['privateer', 12]],
    shipTypes: [['Piragua', 30], ['Brigantine', 14], ['Patacher', 18], ['Pinnace', 12], ['Felucca', 10], ['Caravel', 8], ['Bark', 8]],
    cargo: [['Sugar', 20], ['Tobacco', 20], ['Rice', 14], ['Timber', 12], ['Iron', 8], ['Small Shot', 8], ['Indigo', 8]],
    hullPalettes: [[{ hullColor: '#4a3a28', trimColor: '#6a8b5a', deckColor: '#7a5f3e' }, 50], [{ hullColor: '#3a3028', trimColor: '#b8854a', deckColor: '#6d5035' }, 50]],
    sailPalettes: [[{ sailColor: '#c8b88a', sailTrimColor: '#6a8b5a' }, 55], [{ sailColor: '#b8a87c', sailTrimColor: '#b8854a' }, 45]],
    flagPalettes: [[{ flagColor: '#b8854a', flagAccentColor: '#f0e0bc' }, 50], [{ flagColor: '#6a8b5a', flagAccentColor: '#f0e0bc' }, 50]],
    armament: 0.22,
  },
};

const PORT_TRADITIONS: Record<string, Weighted<ShipTraditionId>[]> = {
  calicut: [['gujarati_merchant', 28], ['omani_dhow', 16], ['swahili_coaster', 9], ['portuguese_estado', 10], ['mughal_surati', 12], ['english_eic', 4], ['dutch_voc', 3], ['malay_prau', 3]],
  goa: [['portuguese_estado', 35], ['gujarati_merchant', 18], ['omani_dhow', 10], ['swahili_coaster', 7], ['english_eic', 5], ['dutch_voc', 5], ['mughal_surati', 6]],
  hormuz: [['portuguese_estado', 26], ['persian_gulf', 24], ['omani_dhow', 20], ['gujarati_merchant', 14], ['mughal_surati', 8], ['english_eic', 4], ['dutch_voc', 4]],
  malacca: [['malay_prau', 26], ['chinese_junk', 20], ['javanese_jong', 14], ['portuguese_estado', 12], ['gujarati_merchant', 6], ['dutch_voc', 5], ['japanese_red_seal', 4], ['acehnese_raider', 7]],
  aden: [['ottoman_red_sea', 28], ['omani_dhow', 22], ['swahili_coaster', 10], ['gujarati_merchant', 10], ['persian_gulf', 8], ['portuguese_estado', 4]],
  zanzibar: [['swahili_coaster', 34], ['omani_dhow', 20], ['gujarati_merchant', 12], ['portuguese_estado', 12], ['ottoman_red_sea', 4], ['english_eic', 3]],
  macau: [['chinese_junk', 34], ['portuguese_estado', 24], ['japanese_red_seal', 12], ['malay_prau', 10], ['dutch_voc', 4], ['english_eic', 4]],
  mombasa: [['swahili_coaster', 30], ['omani_dhow', 18], ['portuguese_estado', 18], ['gujarati_merchant', 12], ['ottoman_red_sea', 4], ['english_eic', 3]],
  surat: [['mughal_surati', 34], ['gujarati_merchant', 28], ['persian_gulf', 10], ['omani_dhow', 8], ['portuguese_estado', 5], ['english_eic', 5], ['dutch_voc', 3]],
  muscat: [['omani_dhow', 34], ['portuguese_estado', 18], ['persian_gulf', 16], ['gujarati_merchant', 12], ['swahili_coaster', 8], ['ottoman_red_sea', 5]],
  mocha: [['ottoman_red_sea', 30], ['omani_dhow', 20], ['persian_gulf', 12], ['gujarati_merchant', 10], ['swahili_coaster', 8], ['portuguese_estado', 3]],
  bantam: [['javanese_jong', 26], ['malay_prau', 22], ['chinese_junk', 18], ['dutch_voc', 10], ['portuguese_estado', 6], ['english_eic', 4], ['acehnese_raider', 8]],
  socotra: [['omani_dhow', 28], ['swahili_coaster', 18], ['ottoman_red_sea', 14], ['gujarati_merchant', 12], ['portuguese_estado', 10], ['persian_gulf', 8]],
  diu: [['portuguese_estado', 28], ['gujarati_merchant', 24], ['mughal_surati', 14], ['persian_gulf', 10], ['omani_dhow', 8], ['english_eic', 4], ['dutch_voc', 4]],

  // ── European home ports ──
  lisbon: [['portuguese_atlantic', 40], ['spanish_atlantic', 14], ['english_atlantic', 8], ['dutch_atlantic', 8], ['french_atlantic', 6], ['gujarati_merchant', 6], ['omani_dhow', 4], ['portuguese_estado', 8], ['local_caribbean', 6]],
  seville: [['spanish_atlantic', 45], ['portuguese_atlantic', 14], ['french_atlantic', 8], ['english_atlantic', 6], ['dutch_atlantic', 4], ['local_caribbean', 8], ['ottoman_red_sea', 4], ['gujarati_merchant', 4], ['portuguese_estado', 7]],
  amsterdam: [['dutch_atlantic', 38], ['dutch_voc', 12], ['english_atlantic', 12], ['french_atlantic', 8], ['portuguese_atlantic', 6], ['spanish_atlantic', 6], ['local_caribbean', 4], ['gujarati_merchant', 4], ['portuguese_estado', 4], ['omani_dhow', 3], ['chinese_junk', 3]],
  london: [['english_atlantic', 36], ['english_eic', 10], ['dutch_atlantic', 12], ['french_atlantic', 10], ['spanish_atlantic', 6], ['portuguese_atlantic', 6], ['local_caribbean', 4], ['gujarati_merchant', 4], ['portuguese_estado', 4], ['omani_dhow', 4], ['dutch_voc', 4]],
  // Venice — no dedicated 'venetian_galley' archetype yet; using Mediterranean
  // analogues. Ottoman Red-Sea ships proxy the Levantine galleys arriving from
  // Alexandria; Iberian/French/English Atlantic ships handle the rest.
  venice: [['ottoman_red_sea', 28], ['portuguese_atlantic', 14], ['spanish_atlantic', 12], ['french_atlantic', 10], ['english_atlantic', 8], ['dutch_atlantic', 6], ['gujarati_merchant', 8], ['persian_gulf', 6], ['omani_dhow', 4], ['portuguese_estado', 4]],
  // Manila — Spanish capital plus the dominant Sangley Chinese junk trade.
  // Japanese Red Seal ships were a real fixture in this period. No dedicated
  // 'spanish_manila' archetype yet; spanish_atlantic stands in.
  manila: [['chinese_junk', 32], ['spanish_atlantic', 22], ['javanese_jong', 10], ['malay_prau', 10], ['portuguese_estado', 8], ['portuguese_atlantic', 6], ['dutch_voc', 6], ['english_eic', 4], ['gujarati_merchant', 2]],
  // Nagasaki — dominated by the Portuguese Nao do Trato (Macau–Nagasaki silver
  // run) and Chinese junks bringing silk. Japanese Red Seal vessels aren't a
  // dedicated archetype yet; chinese_junk and malay_prau stand in visually.
  nagasaki: [['portuguese_estado', 34], ['chinese_junk', 30], ['malay_prau', 10], ['portuguese_atlantic', 8], ['dutch_voc', 6], ['english_eic', 4], ['javanese_jong', 4], ['spanish_atlantic', 4]],
  // Masulipatnam — Gujarati merchant ships dominate, with growing Dutch and
  // English factor presence (factories founded 1606 and 1611 respectively).
  masulipatnam: [['gujarati_merchant', 32], ['dutch_voc', 16], ['english_eic', 14], ['portuguese_estado', 10], ['omani_dhow', 10], ['persian_gulf', 6], ['chinese_junk', 6], ['malay_prau', 6]],

  // ── West Africa ──
  elmina: [['portuguese_atlantic', 30], ['dutch_atlantic', 18], ['english_atlantic', 12], ['spanish_atlantic', 8], ['french_atlantic', 6], ['local_caribbean', 16], ['swahili_coaster', 4], ['omani_dhow', 3], ['portuguese_estado', 3]],
  luanda: [['portuguese_atlantic', 42], ['local_caribbean', 18], ['dutch_atlantic', 10], ['spanish_atlantic', 6], ['english_atlantic', 4], ['french_atlantic', 4], ['swahili_coaster', 6], ['omani_dhow', 4], ['portuguese_estado', 6]],

  // ── Cape of Good Hope ──
  cape: [['portuguese_atlantic', 22], ['dutch_atlantic', 18], ['portuguese_estado', 14], ['english_eic', 10], ['dutch_voc', 10], ['english_atlantic', 6], ['spanish_atlantic', 4], ['french_atlantic', 4], ['omani_dhow', 4], ['gujarati_merchant', 4], ['swahili_coaster', 4]],

  // ── Atlantic Americas ──
  salvador: [['portuguese_atlantic', 40], ['local_caribbean', 22], ['dutch_atlantic', 8], ['spanish_atlantic', 8], ['english_atlantic', 6], ['french_atlantic', 6], ['portuguese_estado', 6], ['omani_dhow', 2], ['swahili_coaster', 2]],
  havana: [['spanish_atlantic', 42], ['local_caribbean', 20], ['english_atlantic', 10], ['french_atlantic', 8], ['dutch_atlantic', 6], ['portuguese_atlantic', 6], ['portuguese_estado', 4], ['omani_dhow', 2], ['dutch_voc', 2]],
  cartagena: [['spanish_atlantic', 38], ['local_caribbean', 22], ['english_atlantic', 10], ['french_atlantic', 10], ['dutch_atlantic', 6], ['portuguese_atlantic', 6], ['portuguese_estado', 4], ['omani_dhow', 2], ['dutch_voc', 2]],
};

const DEFAULT_TRADITIONS: Weighted<ShipTraditionId>[] = [
  ['gujarati_merchant', 18],
  ['omani_dhow', 16],
  ['portuguese_estado', 14],
  ['swahili_coaster', 10],
  ['malay_prau', 10],
  ['chinese_junk', 9],
  ['mughal_surati', 8],
  ['persian_gulf', 6],
  ['dutch_voc', 4],
  ['english_eic', 4],
  ['japanese_red_seal', 1],
];

function generateCaptainName(poolId: NamePoolId): string {
  const pool = NAME_POOLS[poolId];
  return `${pick(pool[0])} ${pick(pool[1])}`;
}

function generateCargo(profile: Weighted<Commodity>[]): Partial<Record<Commodity, number>> {
  const cargo: Partial<Record<Commodity, number>> = {};
  const numTypes = randInt(2, 4);
  for (let i = 0; i < numTypes; i++) {
    const commodity = weightedPick(profile);
    cargo[commodity] = (cargo[commodity] ?? 0) + randInt(2, 14);
  }
  return cargo;
}

/**
 * Clamp a tradition-rolled hail language so it stays plausible for the
 * captain's flag. Tradition pools can mix in non-native lingua francas
 * (a Dutch VOC ship rolling Malay makes sense in the Indies), but when
 * a European-flagged captain turns up in London speaking Malay it reads
 * as a bug. This filter keeps European captains to European languages.
 */
const EUROPEAN_FLAGS: Nationality[] = ['English', 'Portuguese', 'Dutch', 'Spanish', 'French', 'Danish', 'Venetian'];
const EUROPEAN_LANGUAGES: Language[] = ['Portuguese', 'Dutch', 'English', 'Spanish', 'French', 'Italian'];
const FLAG_NATIVE_LANGUAGE: Partial<Record<Nationality, Language>> = {
  English: 'English',
  Portuguese: 'Portuguese',
  Dutch: 'Dutch',
  Spanish: 'Spanish',
  French: 'French',
  Danish: 'Dutch',       // closest represented; Danish isn't in Language type
  Venetian: 'Italian',
  Mughal: 'Hindustani',
  Gujarati: 'Gujarati',
  Persian: 'Persian',
  Ottoman: 'Turkish',
  Omani: 'Arabic',
  Swahili: 'Swahili',
  Malay: 'Malay',
  Acehnese: 'Malay',
  Javanese: 'Malay',
  Moluccan: 'Malay',
  Siamese: 'Malay',
  Japanese: 'Japanese',
  Chinese: 'Chinese',
};

function clampHailLanguage(rolled: Language, flag: Nationality): Language {
  if (EUROPEAN_FLAGS.includes(flag) && !EUROPEAN_LANGUAGES.includes(rolled)) {
    return FLAG_NATIVE_LANGUAGE[flag] ?? rolled;
  }
  return rolled;
}

function conditionForMorale(morale: number): string {
  if (morale > 74) return pick(['trim', 'well-kept', 'freshly painted', 'proud']);
  if (morale > 42) return pick(['weathered', 'salt-crusted', 'laden', 'sun-bleached']);
  return pick(['battered', 'patched-up', 'creaking', 'ragged']);
}

function makeAppearancePhrase(tradition: ShipTradition, role: RouteRole, shipType: ShipType, morale: number): string {
  const roleText = role === 'blue-water merchant' ? 'merchant'
    : role === 'fisherman' ? 'fishing'
    : role === 'ferry' ? 'passenger'
    : role;
  return `a ${conditionForMorale(morale)} ${tradition.label} ${roleText} ${shipType.toLowerCase()}`;
}

function generateVisual(tradition: ShipTradition, shipType: ShipType, morale: number): NPCShipVisual {
  const hull = weightedPick(tradition.hullPalettes);
  const sail = weightedPick(tradition.sailPalettes);
  const flag = weightedPick(tradition.flagPalettes);
  return {
    family: familyForShipType(shipType),
    hullColor: hull.hullColor,
    trimColor: hull.trimColor,
    deckColor: hull.deckColor,
    sailColor: sail.sailColor,
    sailTrimColor: sail.sailTrimColor,
    flagColor: flag.flagColor,
    flagAccentColor: flag.flagAccentColor,
    mastCount: mastCountForShipType(shipType),
    sailPlan: sailPlanForShipType(shipType),
    hasOutrigger: shipType === 'Prau' || shipType === 'Piragua',
    hasCannonPorts: (tradition.armament > 0.5 && shipType !== 'Dhoni' && shipType !== 'Sampan' && shipType !== 'Manchua'
        && shipType !== 'Felucca' && shipType !== 'Piragua')
      || shipType === 'Galleon' || shipType === 'Armed Merchantman' || shipType === 'Ghurab'
      || shipType === 'Gallivat' || shipType === 'Brigantine' || shipType === 'Nao',
    hasSternCastle: shipType === 'Carrack' || shipType === 'Galleon' || shipType === 'Junk'
      || shipType === 'Jong' || shipType === 'Nao',
    scale: visualScaleForShipType(shipType),
    wear: Math.max(0.05, Math.min(0.9, 1 - morale / 100 + Math.random() * 0.2)),
  };
}

export interface NPCShipIdentity {
  id: string;
  traditionId: ShipTraditionId;
  role: RouteRole;
  captainName: string;
  shipName: string;
  shipType: ShipType;
  flag: Nationality;
  hailLanguage: Language;
  crewCount: number;
  morale: number;
  armed: boolean;
  cargo: Partial<Record<Commodity, number>>;
  appearancePhrase: string;
  position: [number, number, number];
  maxHull: number;
  visual: NPCShipVisual;
}

export function generateNPCShip(
  position: [number, number, number],
  context: NPCShipGenerationContext = {},
): NPCShipIdentity {
  const traditionId = weightedPick(PORT_TRADITIONS[context.portId ?? ''] ?? DEFAULT_TRADITIONS);
  const tradition = TRADITIONS[traditionId];
  const shipType = weightedPick(tradition.shipTypes);
  const flag = weightedPick(tradition.factions);
  const namePool = weightedPick(tradition.captainNamePools);
  const captainName = generateCaptainName(namePool);
  const role = weightedPick(tradition.roles);
  const morale = randInt(24, 96);
  const [minCrew, maxCrew] = CREW_BY_TYPE[shipType];
  const [minHull, maxHull] = HULL_BY_TYPE[shipType];
  const armed = Math.random() < tradition.armament
    || role === 'armed patrol'
    || role === 'privateer'
    || shipType === 'Galleon';

  return {
    id: Math.random().toString(36).substring(2, 9),
    traditionId,
    role,
    captainName,
    shipName: pick(SHIP_NAMES[shipType]),
    shipType,
    flag,
    hailLanguage: clampHailLanguage(weightedPick(tradition.hailLanguages), flag),
    crewCount: randInt(minCrew, maxCrew),
    morale,
    armed,
    cargo: generateCargo(tradition.cargo),
    appearancePhrase: makeAppearancePhrase(tradition, role, shipType, morale),
    position,
    maxHull: randInt(minHull, maxHull),
    visual: generateVisual(tradition, shipType, morale),
  };
}
