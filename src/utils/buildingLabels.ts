import type { BuildingType, Culture, Nationality, CulturalRegion, BuildingHousehold, BuildingInstitution } from '../store/gameStore';
import { authorityForPort } from './portAuthorities';

type EuropeanNationality = 'English' | 'Dutch' | 'Spanish' | 'Portuguese';
const EUROPEAN_NATIONALITIES: EuropeanNationality[] = ['English', 'Dutch', 'Spanish', 'Portuguese'];
function asEuropean(n?: Nationality): EuropeanNationality {
  return n && (EUROPEAN_NATIONALITIES as string[]).includes(n) ? (n as EuropeanNationality) : 'Portuguese';
}

function asRegion(r?: CulturalRegion): CulturalRegion {
  return r ?? 'Arab';
}

type AtlanticNationality = 'Portuguese' | 'Spanish' | 'English';
function asAtlantic(n?: Nationality): AtlanticNationality {
  if (n === 'Spanish') return 'Spanish';
  if (n === 'English') return 'English';
  return 'Portuguese';
}

function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

// ── Culture-specific name pools (c. 1612) ────────────────────────────────────

const EUROPEAN_FAMILIES: Record<EuropeanNationality, string[]> = {
  Portuguese: [
    'da Silva', 'de Souza', 'Pereira', 'Albuquerque', 'Mendonça',
    'Noronha', 'Pinto', 'Rodrigues', 'Bragança', 'Coelho',
    'Mascarenhas', 'Saldanha', 'Corte-Real', 'Lobo', 'Figueiredo',
    'Tavares', 'Cardoso', 'Menezes', 'Teixeira', 'Cabral',
  ],
  English: [
    'Cavendish', 'Russell', 'Howard', 'Drake', 'Cecil',
    'Throckmorton', 'Hawkins', 'Wentworth', 'Stafford', 'Dudley',
    'Clifford', 'Percy', 'Neville', 'Stanley', 'Seymour',
    'Devereux', 'Herbert', 'Walsingham', 'Sidney', 'Raleigh',
  ],
  Dutch: [
    'van der Veen', 'van Dijk', 'de Vries', 'Janssen', 'Coen',
    'Heemskerk', 'Reael', 'Hasselaer', 'Witsen', 'Bicker',
    'de Graeff', 'van Beuningen', 'Hooft', 'Oetgens', 'van Neck',
    'de Houtman', 'Pauw', 'Trip', 'Reynst', 'van Hoorn',
  ],
  Spanish: [
    'de Mendoza', 'Guzmán', 'Pizarro', 'de la Vega', 'de Ribera',
    'Álvarez', 'Núñez', 'de Solís', 'Ponce de León', 'de Cárdenas',
    'Fernández', 'Ortiz', 'de Herrera', 'de Figueroa', 'de Zúñiga',
    'Enríquez', 'de Acuña', 'de Villalobos', 'de Castro', 'de Aragón',
  ],
};

const INDIAN_OCEAN_FAMILIES: Record<CulturalRegion, string[]> = {
  Arab: [
    'al-Hadrami', 'bin Majid', 'al-Rashid', 'bin Sulaiman',
    "al-Ma'mari", 'al-Balushi', 'al-Barwani', 'al-Mughairi',
    'al-Ghailani', 'al-Habsi', 'bin Khalfan', 'al-Busaidi',
    'al-Kathiri', 'al-Shehri', 'bin Abdullah', 'al-Farsi',
    'al-Hadhrami', 'bin Muhammad', 'al-Mutawakkil', 'al-Wahaibi',
  ],
  Swahili: [
    'al-Nabhani', 'al-Shirazi', 'al-Alawi', 'bin Said',
    'bin Omar', 'bin Musa', 'bin Ali', 'Shariff',
    'bin Hamad', 'al-Malindi', 'al-Fakih', 'bin Mwalimu',
    'Mwinyi Chande', 'bin Salim', 'al-Lamu', 'al-Pate',
  ],
  Gujarati: [
    'Mehta', 'Parekh', 'Shah', 'Desai', 'Gandhi',
    'Kothari', 'Modi', 'Kapadia', 'Chokshi', 'Shroff',
    'Vora', 'Nagori', 'Patel', 'Bhansali', 'Sheth',
    'Vakil', 'Jhaveri', 'Mody', 'Dalal', 'Sarraf',
  ],
  Malabari: [
    'Panicker', 'Menon', 'Kurup', 'Kaimal', 'Pillai',
    'Nambudiri', 'Marakkar', 'Koya', 'Musaliyar', 'Shenoy',
    'Pai', 'Kamath', 'Prabhu', 'Tharakan', 'Thampi',
    'Nair', 'Nayak', 'Mathai', 'Varma', 'Kuruvila',
  ],
  Malay: [
    'bin Abdullah', 'bin Hamzah', 'bin Ibrahim', 'bin Yusuf',
    'bin Ahmad', 'bin Hassan', 'bin Musa', 'bin Sulaiman',
    'bin Mansur', 'bin Iskandar', 'bin Daud', 'bin Zainal',
    'bin Ismail', 'Hang Nadim', 'bin Jamal', 'bin Razak',
  ],
  Chinese: [
    'Lin', 'Wang', 'Li', 'Chen', 'Wong', 'Tang',
    'Ho', 'Leung', 'Cheung', 'Tsang', 'Lau', 'Ng',
    'Chow', 'Ma', 'Pun', 'Chu', 'Zheng', 'Huang',
    'Zhou', 'Liu',
  ],
};

const ATLANTIC_FAMILIES: Record<AtlanticNationality, string[]> = {
  Portuguese: [
    'Cavalcanti', 'Albuquerque', 'Lopes', 'Sá', 'Dias',
    'Pereira', 'Gomes', 'Vieira', 'Garcia', 'Soares',
    'Machado', 'Barbosa', 'Martins', 'Rodrigues', 'Melo',
    'Lima', 'Fernandes', 'Mendes', 'Costa', 'Pires',
  ],
  Spanish: [
    'de la Vega', 'de Ribera', 'de Cárdenas', 'Álvarez', 'Núñez',
    'de Quesada', 'de Soto', 'Velázquez', 'de Valdivia', 'de Mendoza',
    'Enríquez', 'de Figueroa', 'de Acuña', 'de Rojas', 'de Sotomayor',
    'de Zúñiga', 'de Aragón', 'Ortiz de Zárate', 'de Toledo', 'Pizarro',
  ],
  // English settler surnames attested at Jamestown in the 1607–1614 cohort.
  English: [
    'Rolfe', 'Percy', 'Smythe', 'Sandys', 'Argall',
    'West', 'Yeardley', 'Wynne', 'Spelman', 'Dale',
    'Newport', 'Wingfield', 'Gosnold', 'Kendall', 'Ratcliffe',
    'Martin', 'Laydon', 'Forrest', 'Waldo', 'Crashaw',
  ],
};

export function getFamilyName(
  culture: Culture,
  rng: () => number,
  nationality?: Nationality,
  region?: CulturalRegion,
): string {
  if (culture === 'European') return pick(EUROPEAN_FAMILIES[asEuropean(nationality)], rng);
  if (culture === 'Atlantic') return pick(ATLANTIC_FAMILIES[asAtlantic(nationality)], rng);
  return pick(INDIAN_OCEAN_FAMILIES[asRegion(region)], rng);
}

// ── Given-name pools (c. 1612) ───────────────────────────────────────────────
// Used to give each pedestrian an individual identity that pairs with their
// home building's family name. Pools are gendered and culture/region-keyed so
// a Gujarati merchant's daughter doesn't end up with a Castilian name.

type NamePool = { male: string[]; female: string[] };

const EUROPEAN_GIVEN: Record<EuropeanNationality, NamePool> = {
  Portuguese: {
    male: ['João', 'Pedro', 'Francisco', 'Manuel', 'António', 'Diogo', 'Bento',
           'Lourenço', 'Sebastião', 'Rui', 'Fernão', 'Vasco', 'Tomé',
           'Cristóvão', 'Henrique', 'Jorge', 'Estêvão', 'Gaspar', 'Inácio'],
    female: ['Maria', 'Catarina', 'Isabel', 'Joana', 'Beatriz', 'Leonor',
             'Ana', 'Inês', 'Helena', 'Margarida', 'Filipa', 'Mariana',
             'Bárbara', 'Luísa', 'Antónia', 'Brígida', 'Branca'],
  },
  English: {
    male: ['William', 'Thomas', 'John', 'Robert', 'Henry', 'Edward', 'Richard',
           'Francis', 'George', 'Walter', 'Christopher', 'James', 'Anthony',
           'Hugh', 'Ralph', 'Nicholas', 'Lawrence', 'Roger', 'Humphrey'],
    female: ['Mary', 'Elizabeth', 'Anne', 'Jane', 'Margaret', 'Katherine',
             'Joan', 'Alice', 'Frances', 'Dorothy', 'Ellen', 'Barbara',
             'Bridget', 'Susan', 'Eleanor', 'Cecily', 'Grace', 'Agnes'],
  },
  Dutch: {
    male: ['Pieter', 'Jan', 'Hendrik', 'Willem', 'Adriaen', 'Cornelis',
           'Joost', 'Maarten', 'Dirck', 'Anthonie', 'Jacob', 'Gerrit',
           'Frederik', 'Reinier', 'Floris', 'Lucas'],
    female: ['Anna', 'Maria', 'Margriet', 'Geertje', 'Hendrickje', 'Trijntje',
             'Aaltje', 'Catharina', 'Geertruyd', 'Lijsbeth', 'Sara',
             'Susanna', 'Magdalena'],
  },
  Spanish: {
    male: ['Juan', 'Pedro', 'Francisco', 'Diego', 'Alonso', 'Hernán',
           'Cristóbal', 'Antonio', 'Miguel', 'Gonzalo', 'Rodrigo', 'Fernando',
           'Bartolomé', 'Sebastián', 'Andrés', 'Luis', 'Tomás', 'Gaspar'],
    female: ['María', 'Isabel', 'Catalina', 'Juana', 'Ana', 'Beatriz',
             'Inés', 'Leonor', 'Constanza', 'Mariana', 'Francisca', 'Luisa',
             'Magdalena'],
  },
};

const INDIAN_OCEAN_GIVEN: Record<CulturalRegion, NamePool> = {
  Arab: {
    male: ['Ahmad', 'Muhammad', 'Ali', 'Hassan', 'Husayn', 'Salim', 'Rashid',
           'Khalid', 'Ibrahim', 'Yusuf', 'Sulayman', 'Saʿid', 'Hamza',
           'ʿUmar', 'Mansur', 'Faisal', 'Hamad', 'Majid'],
    female: ['Fatima', 'ʿAisha', 'Khadija', 'Maryam', 'Zaynab', 'Salma',
             'Layla', 'Hafsa', 'Safiya', 'Sara', 'Amina', 'Hind', 'Ruqayya'],
  },
  Swahili: {
    male: ['Bakari', 'Juma', 'Hamisi', 'Kassim', 'Othman', 'Sefu', 'Faraji',
           'Ali', 'Saidi', 'Hamadi', 'Mwinyi', 'Salim', 'Rashidi', 'Bwana'],
    female: ['Halima', 'Asha', 'Zakia', 'Mwana', 'Subira', 'Bibi', 'Amina',
             'Mwanaisha', 'Khadija', 'Fatuma', 'Mwajuma', 'Salma'],
  },
  Gujarati: {
    male: ['Jagjivan', 'Chandrakant', 'Ramji', 'Premji', 'Devji', 'Lakshmidas',
           'Manilal', 'Vithaldas', 'Govind', 'Hari', 'Mohan', 'Narayan',
           'Bhimji', 'Tribhovan', 'Damodar', 'Madhav', 'Hirji', 'Vallabhji'],
    female: ['Lakshmi', 'Parvati', 'Sita', 'Radha', 'Gauri', 'Indu',
             'Kamala', 'Saraswati', 'Ratan', 'Hira', 'Mukta', 'Ganga',
             'Devi', 'Jamna'],
  },
  Malabari: {
    male: ['Krishnan', 'Achuthan', 'Raman', 'Govindan', 'Narayanan',
           'Sankaran', 'Damodaran', 'Madhavan', 'Kunhi', 'Kumaran', 'Velu',
           'Ananthan', 'Subramanian', 'Kesavan', 'Gopalan'],
    female: ['Lakshmi', 'Parvathi', 'Devaki', 'Yashoda', 'Bhavani', 'Janaki',
             'Kalyani', 'Meenakshi', 'Subhadra', 'Ammini', 'Kaveri'],
  },
  Malay: {
    male: ['Hassan', 'Hamzah', 'Ibrahim', 'Yusuf', 'Iskandar', 'Mansur',
           'Daud', 'Mahmud', 'Sulaiman', 'Razak', 'Jamal', 'Zainal',
           'Ahmad', 'Ismail', 'Hang Jebat', 'Hang Tuah'],
    female: ['Siti', 'Aisyah', 'Fatimah', 'Khadijah', 'Mariam', 'Zainab',
             'Salmah', 'Halimah', 'Rohana', 'Tun Teja', 'Puteri'],
  },
  Chinese: {
    male: ['Chao', 'Xiu', 'Wei', 'Jin', 'Ming', 'Bao', 'Yi', 'Tian',
           'Zhi', 'Lung', 'Cheng', 'Hao', 'Long', 'Zhong', 'Feng', 'Kai'],
    female: ['Mei', 'Hua', 'Lan', 'Yu', 'Xiang', 'Ling', 'Yan', 'Hong',
             'Lian', 'Qing', 'Bing', 'Cui', 'Fang'],
  },
};

const ATLANTIC_GIVEN: Record<AtlanticNationality, NamePool> = {
  Portuguese: EUROPEAN_GIVEN.Portuguese,
  Spanish: EUROPEAN_GIVEN.Spanish,
  // 1607–1614 Jamestown muster was overwhelmingly male; we still need a
  // female pool for the ~10% of female colonists arriving on resupply ships.
  English: {
    male: ['William', 'John', 'Thomas', 'Henry', 'George', 'Edward',
           'Christopher', 'Robert', 'Richard', 'Anthony', 'Bartholomew',
           'Francis', 'James', 'Nicholas', 'Samuel', 'Walter'],
    female: ['Anne', 'Temperance', 'Joan', 'Margaret', 'Mary', 'Elizabeth',
             'Alice', 'Frances', 'Cicely', 'Bridget'],
  },
};

const WEST_AFRICAN_GIVEN: NamePool = {
  // Akan / Yoruba / Mande given-name shapes at 1612. Coast and inland mix
  // would have varied wildly; this pool gives a usable cross-section that
  // reads as period rather than modern Pan-African.
  male: ['Kofi', 'Kwame', 'Yaw', 'Kwadwo', 'Kwabena', 'Kwesi', 'Akwasi',
         'Ade', 'Olu', 'Tunde', 'Sekou', 'Ibrahima', 'Diallo', 'Bakary'],
  female: ['Adwoa', 'Akua', 'Abena', 'Yaa', 'Esi', 'Ama', 'Afia',
           'Ayodele', 'Folake', 'Aisha', 'Mariama', 'Fatoumata'],
};

/** Pick a culture- and gender-appropriate given name. Children fall through
 *  to the female pool half the time and the male pool the rest. */
export function getGivenName(
  culture: Culture,
  figureType: 'man' | 'woman' | 'child',
  rng: () => number,
  nationality?: Nationality,
  region?: CulturalRegion,
): string {
  let pool: NamePool;
  if (culture === 'European') pool = EUROPEAN_GIVEN[asEuropean(nationality)];
  else if (culture === 'Atlantic') pool = ATLANTIC_GIVEN[asAtlantic(nationality)];
  else if (culture === 'West African') pool = WEST_AFRICAN_GIVEN;
  else pool = INDIAN_OCEAN_GIVEN[asRegion(region)];

  const isMale = figureType === 'man' || (figureType === 'child' && rng() < 0.5);
  return pick(isMale ? pool.male : pool.female, rng);
}

// ── Fort names ───────────────────────────────────────────────────────────────

const EUROPEAN_FORTS: Record<EuropeanNationality, string[]> = {
  Portuguese: [
    'Fortaleza de Aguada', 'Forte de São Sebastião', 'Forte dos Reis Magos',
    'Fortaleza da Barra', 'Forte de Rachol', 'Castelo de Guia',
  ],
  English: [
    'The Tower', 'Tilbury Fort', 'Upnor Castle', 'Southsea Castle',
    'Pendennis Castle', 'Deal Castle', 'St Mawes Castle',
  ],
  Dutch: [
    'Montelbaanstoren', 'Schreierstoren', 'Bolwerk Sint Anthonis',
    'Munttoren', 'Oude Schans', 'Bolwerk Jaap Hannes',
  ],
  Spanish: [
    'Torre del Oro', 'Castillo de San Jorge', 'Castillo de Triana',
    'Torre de la Plata', 'Reales Alcázares', 'Torre del Bronce',
  ],
};

const INDIAN_OCEAN_FORTS: Record<CulturalRegion, string[]> = {
  Arab: [
    "Qal'at al-Jalali", "Qal'at al-Mirani", "Qal'at Bahla",
    "Qal'at Nizwa", "Husn al-Ghuwayzi", "Husn al-Ghurab",
    "Qal'at al-Rustaq",
  ],
  Swahili: [
    'Gereza ya Kilwa', 'Husuni Kubwa', 'Ngome Kongwe',
    'Ngome ya Kisiwani', 'Kilwa Citadel', 'Ngome ya Pate',
  ],
  Gujarati: [
    'Surat Qila', 'Bhadra Fort', 'Junagadh Qila',
    'Champaner Qila', 'Ahmedabad Bhadra', 'Qila-e-Surat',
  ],
  Malabari: [
    'Kottakkal Kotta', "Zamorin's Palace", 'Valiyakotta',
    'Kollam Kotta', 'Padmanabha Kotta', 'Angadipuram Kotta',
  ],
  Malay: [
    'Kota Melaka', 'Istana Melaka', 'Kota Aceh',
    'Istana Acheh Darussalam', 'Surosowan', 'Kota Banten',
  ],
  Chinese: [
    'Guancheng', 'Wei Suo', 'Zhen Shou', 'Bei Zhai', 'Guan Bao',
  ],
};

const ATLANTIC_FORTS: Record<AtlanticNationality, string[]> = {
  Portuguese: [
    'Forte de São Marcelo', 'Forte de Santo Antônio', 'Forte do Mar',
    'Forte de Santa Maria', 'Forte de São Diogo', 'Forte dos Jesuítas',
    'Forte de São Felipe',
  ],
  Spanish: [
    'Castillo del Morro', 'Castillo de la Punta', 'Castillo de la Real Fuerza',
    'Castillo de San Matías', 'Fuerte de Bocachica', 'Castillo de San Sebastián',
    'Castillo de San Lorenzo',
  ],
  // 1612 Virginia has essentially one: the triangular palisade at Jamestown.
  // Fort Algernon was built at Point Comfort in 1609.
  English: [
    'James Fort', 'Fort Algernon',
  ],
};

const FORT_NAMES: Record<Culture, string[]> = {
  'European': EUROPEAN_FORTS.Portuguese,
  'Indian Ocean': INDIAN_OCEAN_FORTS.Arab,
  'West African': [
    'São Jorge da Mina', 'Fort Coenraadsburg', 'Fort Nassau',
    'Elmina Castle', 'Fort São Sebastião',
  ],
  'Atlantic': ATLANTIC_FORTS.Portuguese,
};

// ── Market names ─────────────────────────────────────────────────────────────

const EUROPEAN_MARKETS: Record<EuropeanNationality, string[]> = {
  Portuguese: [
    'Mercado Grande', 'Feira da Ribeira', 'Mercado do Peixe',
    'Praça do Comércio', 'Mercado de São Paulo',
  ],
  English: [
    'Cheapside Market', 'Eastcheap', 'Leadenhall Market',
    'Billingsgate Fish Market', 'Smithfield', 'Cornhill', 'The Stocks Market',
  ],
  Dutch: [
    'Dam Square', 'Nieuwmarkt', 'Noordermarkt', 'De Waag',
    'Bloemmarkt', 'Graanmarkt', 'Boerenmarkt',
  ],
  Spanish: [
    'Plaza de San Francisco', 'Mercado de Triana', 'Plaza del Pan',
    'Alcaicería', 'La Lonja', 'Plaza del Salvador',
  ],
};

const INDIAN_OCEAN_MARKETS: Record<CulturalRegion, string[]> = {
  Arab: [
    'Souk al-Kabir', 'Souk al-Samak', 'Souk al-Luban',
    'Souk al-Lulu', 'Souk al-Dhahab', 'Souk al-Bazz', 'Souk al-Bahar',
  ],
  Swahili: [
    'Soko Kuu', 'Soko la Samaki', 'Soko la Viungo',
    'Soko la Nguo', 'Soko la Pwani', 'Soko la Watumishi',
  ],
  Gujarati: [
    'Manek Chowk', 'Zaveri Bazaar', 'Kapad Bazar',
    'Mandvi', 'Bhadra Bazaar', 'Anaj Bazar', 'Chowk Bazaar',
  ],
  Malabari: [
    'Valiya Angadi', 'Meen Angadi', 'Pazhayangadi',
    'Kochi Chantha', 'Malakkuppam', 'Theruvangadi',
  ],
  Malay: [
    'Pasar Besar', 'Pasar Rempah', 'Pasar Ikan',
    'Pasar Kain', 'Pasar Lama', 'Pekan Malaka',
  ],
  Chinese: [
    'Da Shichang', 'Yu Shi', 'Xiang Liao Shi',
    'Bu Shi', 'Cha Shi', 'Lao Shichang',
  ],
};

const ATLANTIC_MARKETS: Record<AtlanticNationality, string[]> = {
  Portuguese: [
    'Feira da Praia', 'Mercado da Ribeira', 'Praça do Comércio',
    'Mercado do Açúcar', 'Terreiro de Jesus', 'Feira de Santo Antônio',
  ],
  Spanish: [
    'Plaza de Armas', 'Plaza Vieja', 'Plaza del Cristo',
    'Mercado del Puerto', 'Plaza de la Catedral', 'Plaza del Mercado',
  ],
  // No urban plazas at Jamestown — trade happens on the common ground
  // outside the storehouse and by the landing.
  English: [
    'The Common Ground', 'Storehouse Yard', 'The Landing Market',
  ],
};

const MARKET_NAMES: Record<Culture, string[]> = {
  'European': EUROPEAN_MARKETS.Portuguese,
  'Indian Ocean': INDIAN_OCEAN_MARKETS.Arab,
  'West African': [
    'Gold Market', 'Bead Traders\' Row', 'Cloth Market',
    'Yam Market', 'Salt Market',
  ],
  'Atlantic': ATLANTIC_MARKETS.Portuguese,
};

// ── Dock names ───────────────────────────────────────────────────────────────

const EUROPEAN_DOCKS: Record<EuropeanNationality, string[]> = {
  Portuguese: [
    'Cais do Porto', 'Cais da Ribeira', 'Cais Real', 'Cais dos Pescadores',
    'Embarcadouro', 'Cais Grande',
  ],
  English: [
    'Billingsgate', 'Queenhithe', 'Custom House Quay', 'Legal Quays',
    'Tower Wharf', 'Galley Quay', 'St Katharine\'s Stairs',
  ],
  Dutch: [
    'Damrak', 'Oude Waal', 'Herenwerf', 'Oostelijke Handelskade',
    'Prins Hendrikkade', 'Nieuwe Waal',
  ],
  Spanish: [
    'Muelle de las Mulas', 'Muelle de la Sal', 'Muelle del Arenal',
    'Muelle de los Galeones', 'Muelle de la Aduana',
  ],
};

const INDIAN_OCEAN_DOCKS: Record<CulturalRegion, string[]> = {
  Arab: [
    "Marsa al-Kabir", "Marsa al-Dhaw", "Marsa al-Samak",
    "Marsa al-Tujjar", "Mina' al-Bahr", "Marsa al-Lulu",
  ],
  Swahili: [
    'Bandari Kuu', 'Bandari ya Dhow', 'Gati la Wavuvi',
    'Bandari ya Mashariki', 'Gati la Wafanyabiashara', 'Bandari ya Kale',
  ],
  Gujarati: [
    'Bara Bandar', 'Mandvi Bandar', 'Navsari Bandar',
    'Machchhu Bandar', 'Navigan Bandar', 'Juni Bandar',
  ],
  Malabari: [
    'Valiya Kadavu', 'Meen Kadavu', 'Thuramugham',
    'Varav Kadavu', 'Patthemari Kadavu', 'Pazhaya Kadavu',
  ],
  Malay: [
    'Pelabuhan Besar', 'Pelabuhan Lama', 'Dermaga Dhow',
    'Pelabuhan Ikan', 'Pangkalan', 'Dermaga Rempah',
  ],
  Chinese: [
    'Da Matou', 'Yu Matou', 'Shang Matou', 'Gang Kou', 'Lao Matou',
  ],
};

const ATLANTIC_DOCKS: Record<AtlanticNationality, string[]> = {
  Portuguese: [
    'Cais do Sodré', 'Cais da Preguiça', 'Ancoradouro',
    'Porto da Barra', 'Cais do Açúcar', 'Cais das Flechas',
  ],
  Spanish: [
    'Muelle de la Aduana', 'Muelle del Morro', 'Muelle de los Galeones',
    'Muelle de la Alameda', 'Muelle del Contador', 'Muelle de las Ánimas',
  ],
  // Jamestown had a simple timber landing on the James River.
  English: [
    'The Landing', 'Company Wharf', 'James Quay', 'The Old Stairs',
  ],
};

const DOCK_NAMES: Record<Culture, string[]> = {
  'European': EUROPEAN_DOCKS.Portuguese,
  'Indian Ocean': INDIAN_OCEAN_DOCKS.Arab,
  'West African': [
    'Canoe Landing', 'Trade Beach', 'Surf Landing',
    'Gold Wharf', 'Fisher\'s Landing',
  ],
  'Atlantic': ATLANTIC_DOCKS.Portuguese,
};

// ── Warehouse goods ──────────────────────────────────────────────────────────

const EUROPEAN_WAREHOUSE_GOODS: Record<EuropeanNationality, string[]> = {
  Portuguese: [
    'pepper', 'cinnamon', 'cloves', 'porcelain', 'silk bales',
    'camphor', 'ginger', 'wine casks', 'olive oil', 'salt',
    'cork bales', 'brazilwood',
  ],
  English: [
    'wool bales', 'broadcloth', 'kersey', 'tin ingots', 'lead pigs',
    'hides', 'herring barrels', 'beer casks', 'sea coal', 'timber',
    'pepper', 'indigo', 'calicoes',
  ],
  Dutch: [
    'herring barrels', 'Baltic rye', 'beer casks', 'linen bales',
    'cheese', 'Norwegian timber', 'pepper', 'nutmeg', 'mace',
    'cloves', 'porcelain', 'whale oil',
  ],
  Spanish: [
    'wool bales', 'olive oil', 'wine casks', 'silk bales',
    'mercury flasks', 'silver bars', 'cochineal', 'hides',
    'sugar', 'indigo', 'tobacco', 'soap',
  ],
};

const INDIAN_OCEAN_WAREHOUSE_GOODS: Record<CulturalRegion, string[]> = {
  Arab: [
    'frankincense', 'dates', 'pearls', 'Mocha coffee', 'horses',
    'silk bales', 'aloeswood', 'copper', 'dried fish', 'myrrh',
  ],
  Swahili: [
    'ivory', 'gold dust', 'mangrove poles', 'coconut oil',
    'cloves', 'cowrie shells', 'tortoiseshell', 'ebony',
    'dried fish', 'ambergris', 'cloth bales',
  ],
  Gujarati: [
    'cotton bales', 'indigo', 'opium', 'calicoes', 'saltpeter',
    'dyes', 'silk bales', 'wheat', 'pearls', 'iron', 'sugar',
  ],
  Malabari: [
    'pepper', 'cardamom', 'ginger', 'cinnamon', 'teak logs',
    'coir bundles', 'coconut oil', 'arecanut', 'rice', 'sandalwood',
  ],
  Malay: [
    'pepper', 'tin ingots', 'camphor', 'rattan', 'benzoin',
    'gambier', 'nutmeg', 'cloves', 'sandalwood', 'gold dust',
  ],
  Chinese: [
    'silk bales', 'porcelain', 'tea chests', 'lacquerware',
    'copper cash', 'rhubarb', 'musk', 'ginseng', 'mercury', 'pig iron',
  ],
};

const ATLANTIC_WAREHOUSE_GOODS: Record<AtlanticNationality, string[]> = {
  Portuguese: [
    'sugar chests', 'brazilwood', 'tobacco', 'cotton bales', 'hides',
    'jerked beef', 'cachaça casks', 'manioc flour', 'cacao', 'indigo',
  ],
  Spanish: [
    'silver bars', 'hides', 'tobacco', 'cochineal', 'indigo',
    'sugar', 'emeralds', 'pearls', 'logwood', 'cacao', 'mercury flasks',
  ],
  // 1612 Virginia: sassafras was the main export; Rolfe's first tobacco crop
  // is planted this year. Clapboard, deerskins from Powhatan trade.
  English: [
    'sassafras bundles', 'clapboard', 'tobacco leaf', 'deerskins',
    'barrels of meal', 'salt beef', 'iron tools', 'broadcloth bales',
    'gunpowder kegs',
  ],
};

const WAREHOUSE_GOODS: Record<Culture, string[]> = {
  'European': EUROPEAN_WAREHOUSE_GOODS.Portuguese,
  'Indian Ocean': INDIAN_OCEAN_WAREHOUSE_GOODS.Arab,
  'West African': [
    'gold dust', 'ivory', 'palm oil', 'kola nuts', 'beeswax',
    'hides', 'pepper', 'cotton cloth', 'slaves', 'dyed textiles',
  ],
  'Atlantic': ATLANTIC_WAREHOUSE_GOODS.Portuguese,
};

const EUROPEAN_WAREHOUSE_OWNERS: Record<EuropeanNationality, string[]> = {
  Portuguese: [
    'the Casa da Índia', 'the Crown', 'the Jesuits', 'the Misericórdia',
    'the Câmara', 'private merchants',
  ],
  English: [
    'the East India Company', 'the Levant Company', 'the Muscovy Company',
    'the Merchant Adventurers', 'the Crown', 'the Customs House',
    'private merchants',
  ],
  Dutch: [
    'the VOC', 'the Admiralty', 'the Magistraat', 'the Amsterdam Regents',
    'the Heeren XVII', 'private merchants',
  ],
  Spanish: [
    'the Casa de Contratación', 'the Crown', 'the Consulado de Sevilla',
    'the Inquisition', 'the Audiencia', 'private merchants',
  ],
};

const INDIAN_OCEAN_WAREHOUSE_OWNERS: Record<CulturalRegion, string[]> = {
  Arab: [
    'the Sultan', 'the Sheikh', 'the Hadrami guild', 'the Nakhuda',
    'the Imam', 'the merchant council', 'private merchants',
  ],
  Swahili: [
    'the Sultan', 'the Mwinyi Mkuu', 'the Jumbe', 'the Liwali',
    'the Sharif', 'Shirazi merchants', 'private traders',
  ],
  Gujarati: [
    'the Nagarsheth', 'the Seth council', 'the Bania guild',
    'the Parsi merchants', 'the Bohra traders', 'the Mughal governor',
  ],
  Malabari: [
    'the Zamorin', 'the Raja', 'the Marakkar', 'the Mappila merchants',
    'the Chettiar moneylenders', 'the Syrian Christian merchants',
  ],
  Malay: [
    'the Sultan', 'the Bendahara', 'the Temenggong', 'the Laksamana',
    'the Shahbandar', 'the Orang Kaya', 'private merchants',
  ],
  Chinese: [
    'the Hong merchants', 'the Shanglin', 'the guild masters',
    'private merchants', 'the Mandarin', 'the Customs Supervisor',
  ],
};

const ATLANTIC_WAREHOUSE_OWNERS: Record<AtlanticNationality, string[]> = {
  Portuguese: [
    'the Crown', 'the Câmara', 'the Jesuits', 'the Benedictines',
    'the Senado da Câmara', 'senhores de engenho', 'private merchants',
  ],
  Spanish: [
    'the Casa de Contratación', 'the Crown', 'the Consulado',
    'the Inquisition', 'the Audiencia', 'the Governor',
    'the Asiento', 'private merchants',
  ],
  English: [
    'the Virginia Company', 'Sir Thomas Smythe', 'the Governor\'s Store',
    'the Cape Merchant', 'the Company Factor', 'private adventurers',
  ],
};

const WAREHOUSE_OWNERS: Record<Culture, string[]> = {
  'European': EUROPEAN_WAREHOUSE_OWNERS.Portuguese,
  'Indian Ocean': INDIAN_OCEAN_WAREHOUSE_OWNERS.Arab,
  'West African': [
    'the Asantehene\'s agents', 'the Portuguese factor', 'the Akan traders',
    'the chief', 'the garrison', 'local merchants',
  ],
  'Atlantic': ATLANTIC_WAREHOUSE_OWNERS.Portuguese,
};

// ── Artisan/shopkeeper trades ────────────────────────────────────────────────

const TRADES_NEAR_WATER = [
  'Shipwright', 'Caulker', 'Rope-maker', 'Sail-mender', 'Net-maker',
  'Ship chandler', 'Anchor smith', 'Oar-maker',
];

const EUROPEAN_TRADES: Record<EuropeanNationality, string[]> = {
  Portuguese: [
    'Goldsmith', 'Tailor', 'Apothecary', 'Money-changer', 'Notary',
    'Barber-surgeon', 'Baker', 'Vintner', 'Candle-maker', 'Coppersmith',
    'Azulejo-maker', 'Cooper', 'Saddler',
  ],
  English: [
    'Goldsmith', 'Tailor', 'Apothecary', 'Money-changer', 'Notary',
    'Barber-surgeon', 'Baker', 'Brewer', 'Pewterer', 'Fletcher',
    'Cutler', 'Haberdasher', 'Chandler', 'Stationer',
  ],
  Dutch: [
    'Goldsmith', 'Tailor', 'Apothecary', 'Money-changer', 'Notary',
    'Barber-surgeon', 'Baker', 'Lacemaker', 'Clockmaker',
    'Diamond-cutter', 'Printer', 'Hatter', 'Cartographer', 'Brewer',
  ],
  Spanish: [
    'Silversmith', 'Tailor', 'Apothecary', 'Money-changer', 'Notary',
    'Barber-surgeon', 'Baker', 'Vintner', 'Candle-maker',
    'Coppersmith', 'Bookbinder', 'Luthier', 'Saddler', 'Tanner',
  ],
};

const INDIAN_OCEAN_TRADES: Record<CulturalRegion, string[]> = {
  Arab: [
    'Goldsmith', 'Coppersmith', 'Perfumer', 'Dhow-builder',
    'Scribe', 'Oil-presser', 'Potter', 'Coffee-roaster',
    'Dyer', "Qadi's clerk", 'Water-carrier',
  ],
  Swahili: [
    'Dhow-builder', 'Coral-mason', 'Goldsmith', 'Kanga-weaver',
    'Potter', 'Mat-maker', 'Rope-spinner', 'Fish-smoker',
    'Herbalist', 'Mwalimu', 'Smith',
  ],
  Gujarati: [
    'Goldsmith', 'Silversmith', 'Jhaveri', 'Calico-printer',
    'Weaver', 'Dyer', 'Money-changer', 'Scribe', 'Sarraf',
    'Diamond-cutter', 'Shroff', 'Tilemaker',
  ],
  Malabari: [
    'Goldsmith', 'Weaver', 'Toddy-tapper', 'Oil-presser',
    'Potter', 'Dyer', 'Coir-spinner', 'Astrologer',
    'Ayurvedic physician', 'Chetty money-changer', 'Carpenter', 'Arrack-distiller',
  ],
  Malay: [
    'Keris-smith', 'Goldsmith', 'Boat-builder', 'Batik-maker',
    'Weaver', 'Perfumer', 'Basket-maker', 'Dyer',
    'Potter', 'Kitab-scribe', 'Spice-grinder', 'Astrologer',
  ],
  Chinese: [
    'Silk-weaver', 'Porcelain-painter', 'Tea merchant', 'Yao-cai apothecary',
    'Blacksmith', 'Lantern-maker', 'Scribe', 'Tailor',
    'Paper-maker', 'Ink-maker', 'Fortune-teller', 'Herbalist', 'Cabinet-maker',
  ],
};

const ATLANTIC_TRADES: Record<AtlanticNationality, string[]> = {
  Portuguese: [
    'Mestre de açúcar', 'Tanoeiro', 'Carpenter', 'Silversmith',
    'Tanner', 'Potter', 'Baker', 'Boticário',
    'Tailor', 'Tabelião', 'Caulker', 'Blacksmith',
  ],
  Spanish: [
    'Sugar-boiler', 'Cooper', 'Tanner', 'Silversmith',
    'Blacksmith', 'Baker', 'Carpenter', 'Escribano',
    'Boticario', 'Shoemaker', 'Tailor', 'Money-changer',
  ],
  // Crafts attested at 1607–1614 Jamestown. The glasshouse (1608–9) is gone
  // by 1612 but tobacco-planting begins the same year.
  English: [
    'Cooper', 'Carpenter', 'Sawyer', 'Gunsmith',
    'Chirurgeon', 'Blacksmith', 'Boat-wright', 'Brewer',
    'Tobacco-planter', 'Cape Merchant', 'Tailor', 'Clerk',
  ],
};

const TRADES_NEAR_MARKET: Record<Culture, string[]> = {
  'European': EUROPEAN_TRADES.Portuguese,
  'Indian Ocean': INDIAN_OCEAN_TRADES.Arab,
  'West African': [
    'Goldsmith', 'Bead-maker', 'Weaver', 'Dyer', 'Blacksmith',
    'Potter', 'Basket-maker', 'Drummer', 'Palm-wine tapper', 'Ivory carver',
  ],
  'Atlantic': ATLANTIC_TRADES.Portuguese,
};

// ── Commoner occupations ─────────────────────────────────────────────────────

const INDIAN_OCEAN_COMMONERS: Record<CulturalRegion, string[]> = {
  Arab: [
    'Fisher\'s dwelling', 'Sailor\'s quarters', 'Porter\'s hut',
    'Water-carrier\'s house', 'Date-picker\'s house',
    'Camel-driver\'s billet', 'Pearl-diver\'s hut',
  ],
  Swahili: [
    'Fisher\'s hut', 'Dhow-sailor\'s dwelling', 'Porter\'s quarters',
    'Palm-climber\'s house', 'Mangrove-cutter\'s hut',
    'Boatman\'s dwelling', 'Washerwoman\'s cottage',
  ],
  Gujarati: [
    'Weaver\'s house', 'Porter\'s quarters', 'Sailor\'s dwelling',
    'Water-carrier\'s house', 'Potter\'s house',
    'Laborer\'s quarters', 'Dhobi\'s cottage',
  ],
  Malabari: [
    'Fisherman\'s hut', 'Toddy-tapper\'s house', 'Boatman\'s dwelling',
    'Palm-climber\'s house', 'Coir-spinner\'s hut',
    'Dhobi\'s cottage', 'Porter\'s quarters',
  ],
  Malay: [
    'Fisher\'s hut', 'Sailor\'s dwelling', 'Porter\'s quarters',
    'Boatman\'s house', 'Water-carrier\'s hut',
    'Kampung laborer\'s house', 'Padi-farmer\'s house',
  ],
  Chinese: [
    'Fisher\'s hut', 'Sailor\'s quarters', 'Porter\'s dwelling',
    'Coolie\'s house', 'Tea-picker\'s dwelling',
    'Washerwoman\'s cottage', 'Boatman\'s hut',
  ],
};

const ATLANTIC_COMMONERS: Record<AtlanticNationality, string[]> = {
  Portuguese: [
    'Fisherman\'s hut', 'Dockhand\'s dwelling', 'Sugar-worker\'s house',
    'Laborer\'s cottage', 'Washwoman\'s house', 'Porter\'s quarters',
    'Slave quarters', 'Sailor\'s billet', 'Mulatto\'s cottage',
  ],
  Spanish: [
    'Fisherman\'s hut', 'Sailor\'s billet', 'Dockhand\'s dwelling',
    'Porter\'s quarters', 'Washwoman\'s house', 'Mulatto\'s cottage',
    'Slave quarters', 'Free black\'s cottage', 'Laborer\'s hut',
  ],
  English: [
    'Settler\'s cottage', 'Soldier\'s billet', 'Planter\'s hut',
    'Laborer\'s quarters', 'Sawyer\'s dwelling', 'Fisherman\'s hut',
    'Indentured servant\'s quarters',
  ],
};

const COMMONER_LABELS: Record<Culture, string[]> = {
  'European': [
    'Fisherman\'s dwelling', 'Sailor\'s quarters', 'Dockworker\'s house',
    'Washerwoman\'s cottage', 'Porter\'s dwelling', 'Soldier\'s billet',
    'Servant\'s quarters', 'Laborer\'s house',
  ],
  'Indian Ocean': INDIAN_OCEAN_COMMONERS.Arab,
  'West African': [
    'Fisher\'s hut', 'Canoe-builder\'s dwelling', 'Gold-washer\'s house',
    'Porter\'s hut', 'Palm-tapper\'s dwelling', 'Farmer\'s compound',
    'Smith\'s quarters', 'Net-maker\'s house',
  ],
  'Atlantic': ATLANTIC_COMMONERS.Portuguese,
};

// ── Shack occupations ────────────────────────────────────────────────────────

const INDIAN_OCEAN_SHACKS: Record<CulturalRegion, string[]> = {
  Arab: [
    'Fisher\'s hut', 'Date vendor', 'Porter\'s lean-to',
    'Water-seller\'s stall', 'Beach shelter', 'Pearl-diver\'s hut',
  ],
  Swahili: [
    'Fisher\'s hut', 'Coconut seller', 'Mangrove shelter',
    'Net-mender\'s lean-to', 'Coir-worker\'s hut', 'Charcoal-burner\'s hut',
  ],
  Gujarati: [
    'Coolie\'s lean-to', 'Cloth vendor', 'Porter\'s shelter',
    'Fruit vendor', 'Beach shelter', 'Scribe\'s stall',
  ],
  Malabari: [
    'Fisher\'s hut', 'Coconut seller', 'Toddy-tapper\'s shack',
    'Coir-spinner\'s hut', 'Net-mender\'s lean-to', 'Banana vendor',
  ],
  Malay: [
    'Fisher\'s hut', 'Coconut seller', 'Boatman\'s shack',
    'Shell collector', 'Rattan shelter', 'Kampung lean-to',
  ],
  Chinese: [
    'Fisher\'s hut', 'Tea-seller', 'Porter\'s lean-to',
    'Vegetable vendor', 'Shell collector', 'Fortune-teller\'s stall', 'Rice-seller',
  ],
};

const ATLANTIC_SHACKS: Record<AtlanticNationality, string[]> = {
  Portuguese: [
    'Fisher\'s hut', 'Sugar shed', 'Turtle pen', 'Driftwood shack',
    'Beach vendor', 'Crab-catcher\'s lean-to', 'Palm shelter',
  ],
  Spanish: [
    'Fisher\'s hut', 'Turtle pen', 'Salt-raker\'s shack',
    'Driftwood shack', 'Beach vendor', 'Crab-catcher\'s lean-to', 'Palm shelter',
  ],
  English: [
    'Wattle-and-daub hut', 'Sawyer\'s shack', 'Driftwood shelter',
    'Net-mender\'s lean-to', 'Fishing shack', 'Tobacco-drying shed',
  ],
};

const SHACK_LABELS: Record<Culture, string[]> = {
  'European': [
    'Fisher\'s hut', 'Coconut seller', 'Porter\'s lean-to', 'Driftwood shelter',
    'Washerman\'s shack', 'Beggar\'s shelter', 'Beach vendor',
  ],
  'Indian Ocean': INDIAN_OCEAN_SHACKS.Arab,
  'West African': [
    'Fisher\'s hut', 'Palm-leaf shelter', 'Canoe shelter',
    'Drying rack', 'Beach vendor', 'Net-mender\'s lean-to', 'Shell collector',
  ],
  'Atlantic': ATLANTIC_SHACKS.Portuguese,
};

// ── Farm crops ───────────────────────────────────────────────────────────────

const EUROPEAN_WET_CROPS: Record<EuropeanNationality, string[]> = {
  Portuguese: [
    'Orchard', 'Orange grove', 'Pear orchard', 'Market garden',
    'Fig orchard', 'Willow coppice',
  ],
  English: [
    'Hop garden', 'Hay meadow', 'Orchard', 'Watercress bed',
    'Flax field', 'Pea field', 'Water meadow',
  ],
  Dutch: [
    'Flax field', 'Hemp field', 'Hay meadow', 'Cabbage plot',
    'Tulip garden', 'Willow coppice', 'Peat meadow',
  ],
  Spanish: [
    'Huerta', 'Citrus grove', 'Orchard', 'Mulberry grove',
    'Irrigated garden', 'Pomegranate orchard',
  ],
};

const INDIAN_OCEAN_WET_CROPS: Record<CulturalRegion, string[]> = {
  Arab: [
    'Date palm grove', 'Irrigated garden', 'Pomegranate orchard',
    'Fig orchard', 'Sesame plot', 'Reed plot',
  ],
  Swahili: [
    'Coconut grove', 'Rice paddy', 'Sugarcane plot',
    'Banana grove', 'Mango orchard', 'Cowpea field',
  ],
  Gujarati: [
    'Rice paddy', 'Cotton field', 'Sugarcane plot',
    'Mango orchard', 'Sesame plot', 'Indigo field',
  ],
  Malabari: [
    'Rice paddy', 'Coconut grove', 'Pepper garden',
    'Cardamom plot', 'Banana grove', 'Arecanut grove',
    'Ginger field', 'Jackfruit grove',
  ],
  Malay: [
    'Sawah paddy', 'Pepper garden', 'Coconut grove',
    'Banana grove', 'Durian orchard', 'Sago palm grove',
    'Rattan plot',
  ],
  Chinese: [
    'Rice paddy', 'Mulberry grove', 'Tea garden',
    'Lotus pond', 'Bamboo grove', 'Vegetable garden',
  ],
};

const ATLANTIC_WET_CROPS: Record<AtlanticNationality, string[]> = {
  Portuguese: [
    'Sugar field', 'Tobacco plot', 'Manioc field', 'Cacao grove',
    'Cotton plot', 'Banana grove', 'Pineapple patch',
  ],
  Spanish: [
    'Sugar field', 'Tobacco plot', 'Cassava field', 'Banana grove',
    'Cotton plot', 'Indigo field', 'Cacao grove',
  ],
  // Rolfe plants the first Spanish-seed tobacco in 1612. Maize from Powhatan
  // trade. Sassafras is wild-gathered, not cultivated.
  English: [
    'Tobacco plot', 'Maize field', 'Kitchen garden', 'Pumpkin patch',
    'Bean plot', 'Sassafras stand',
  ],
};

const WET_CROPS: Record<Culture, string[]> = {
  'European': EUROPEAN_WET_CROPS.Portuguese,
  'Indian Ocean': INDIAN_OCEAN_WET_CROPS.Arab,
  'West African': [
    'Yam field', 'Palm oil grove', 'Kola nut trees',
    'Banana grove', 'Rice paddy', 'Cotton plot', 'Cassava field',
  ],
  'Atlantic': ATLANTIC_WET_CROPS.Portuguese,
};

const EUROPEAN_DRY_CROPS: Record<EuropeanNationality, string[]> = {
  Portuguese: [
    'Olive grove', 'Vineyard', 'Wheat field', 'Chestnut grove',
    'Cork oak stand', 'Almond grove', 'Goat pasture',
  ],
  English: [
    'Wheat field', 'Barley field', 'Rye field', 'Sheep pasture',
    'Fallow field', 'Oat field', 'Cattle pasture',
  ],
  Dutch: [
    'Rye field', 'Buckwheat field', 'Cattle pasture', 'Sheep fold',
    'Apple orchard', 'Goat enclosure', 'Poultry yard',
  ],
  Spanish: [
    'Olive grove', 'Vineyard', 'Wheat field', 'Almond grove',
    'Fig orchard', 'Merino pasture', 'Grain field',
  ],
};

const INDIAN_OCEAN_DRY_CROPS: Record<CulturalRegion, string[]> = {
  Arab: [
    'Date palm grove', 'Millet field', 'Sorghum field',
    'Camel enclosure', 'Goat pen', 'Frankincense grove', 'Henna plot',
  ],
  Swahili: [
    'Millet field', 'Sorghum field', 'Cassava plot',
    'Cotton field', 'Cattle enclosure', 'Goat pen', 'Tobacco plot',
  ],
  Gujarati: [
    'Cotton field', 'Bajri millet', 'Groundnut plot',
    'Sesame plot', 'Castor plot', 'Cattle enclosure', 'Goat pen',
  ],
  Malabari: [
    'Cashew plantation', 'Areca garden', 'Tapioca plot',
    'Dry pepper garden', 'Coconut copra yard', 'Jackfruit stand',
  ],
  Malay: [
    'Maize field', 'Millet field', 'Cotton plot',
    'Cassava field', 'Goat pen', 'Fruit orchard',
  ],
  Chinese: [
    'Millet field', 'Wheat field', 'Soybean field',
    'Cabbage plot', 'Mulberry grove', 'Buckwheat field',
  ],
};

const ATLANTIC_DRY_CROPS: Record<AtlanticNationality, string[]> = {
  Portuguese: [
    'Cattle ranch', 'Goat pen', 'Maize field', 'Manioc plot',
    'Provision ground', 'Pineapple patch', 'Jerky yard',
  ],
  Spanish: [
    'Cattle ranch', 'Henequen plot', 'Maize field',
    'Provision ground', 'Goat pen', 'Pineapple patch', 'Tobacco plot',
  ],
  // Very little livestock at 1612 Jamestown — a few hogs on Hog Island.
  // Clapboard cutting and sassafras-gathering dominate the non-tobacco economy.
  English: [
    'Clapboard cutting', 'Hog pen', 'Maize field', 'Sassafras stand',
    'Fallow field', 'Provision ground',
  ],
};

const DRY_CROPS: Record<Culture, string[]> = {
  'European': EUROPEAN_DRY_CROPS.Portuguese,
  'Indian Ocean': INDIAN_OCEAN_DRY_CROPS.Arab,
  'West African': [
    'Millet field', 'Goat pen', 'Groundnut plot',
    'Sorghum field', 'Cattle enclosure', 'Shea tree grove',
  ],
  'Atlantic': ATLANTIC_DRY_CROPS.Portuguese,
};

// ── Elite titles ─────────────────────────────────────────────────────────────

const EUROPEAN_TITLES: Record<EuropeanNationality, string[]> = {
  Portuguese: [
    'Fidalgo', 'Capitão', 'Desembargador', 'Vedor da Fazenda',
    'Ouvidor', 'Factor', 'Senhor',
  ],
  English: [
    'Sir', 'Lord', 'Master', 'Alderman', 'Esquire', 'Captain', 'Goodman',
  ],
  Dutch: [
    'Heer', 'Burgemeester', 'Schepen', 'Regent', 'Koopman', 'Kapitein', 'Vroedschap',
  ],
  Spanish: [
    'Don', 'Hidalgo', 'Alcalde', 'Regidor', 'Capitán', 'Corregidor', 'Oidor',
  ],
};

const INDIAN_OCEAN_TITLES: Record<CulturalRegion, string[]> = {
  Arab: [
    'Sheikh', 'Imam', 'Sayyid', 'Emir', 'Qadi', 'Nakhuda', 'Hajji', 'Sharif',
  ],
  Swahili: [
    'Sheikh', 'Mwinyi', 'Liwali', 'Diwan', 'Sharif', 'Jumbe', 'Mwalimu', 'Sayyid',
  ],
  Gujarati: [
    'Seth', 'Nagarsheth', 'Diwan', 'Nawab', 'Sardar', 'Jagirdar', 'Shah', 'Vakil',
  ],
  Malabari: [
    'Raja', 'Swami', 'Thampuran', 'Panicker', 'Karnavar', 'Nambudiri', 'Eradi', 'Tharakan',
  ],
  Malay: [
    'Tun', 'Tengku', 'Raja', 'Datuk', 'Bendahara', 'Temenggong', 'Laksamana', 'Shahbandar', 'Orang Kaya',
  ],
  Chinese: [
    'Laoye', 'Xiansheng', 'Shangren', 'Daren', 'Gong', 'Shaoye', 'Shifu',
  ],
};

const ATLANTIC_TITLES: Record<AtlanticNationality, string[]> = {
  Portuguese: [
    'Senhor de engenho', 'Capitão-mor', 'Ouvidor', 'Desembargador',
    'Fidalgo', 'Provedor', 'Governador', 'Vigário-geral',
  ],
  Spanish: [
    'Don', 'Hidalgo', 'Alcalde', 'Oidor', 'Encomendero',
    'Regidor', 'Corregidor', 'Hacendado', 'Gobernador', 'Adelantado',
  ],
  English: [
    'Sir', 'Master', 'Captain', 'Governor',
    'Deputy Governor', 'Cape Merchant', 'Council-member', 'Goodman',
  ],
};

const ELITE_TITLES: Record<Culture, string[]> = {
  'European': EUROPEAN_TITLES.Portuguese,
  'Indian Ocean': INDIAN_OCEAN_TITLES.Arab,
  'West African': [
    'Ohene', 'Asantehene\'s envoy', 'Okyeame', 'Chief', 'Elder', 'Linguist',
  ],
  'Atlantic': ATLANTIC_TITLES.Portuguese,
};

// ── Merchant specialties ─────────────────────────────────────────────────────

const INDIAN_OCEAN_MERCHANT_GOODS: Record<CulturalRegion, string[]> = {
  Arab: [
    'frankincense', 'dates', 'coffee', 'horses', 'pearls',
    'silk', 'aloeswood', 'copper', 'myrrh', 'incense',
  ],
  Swahili: [
    'ivory', 'gold', 'cloves', 'mangrove', 'cowries',
    'ambergris', 'coconut oil', 'tortoiseshell', 'cloth', 'ebony',
  ],
  Gujarati: [
    'cotton', 'calicoes', 'indigo', 'opium', 'saltpeter',
    'pearls', 'silk', 'dyes', 'gems', 'iron',
  ],
  Malabari: [
    'pepper', 'cardamom', 'ginger', 'cinnamon', 'teak',
    'coir', 'coconut oil', 'arecanut', 'sandalwood', 'gems',
  ],
  Malay: [
    'pepper', 'tin', 'camphor', 'rattan', 'benzoin',
    'nutmeg', 'cloves', 'sandalwood', 'gold', 'keris',
  ],
  Chinese: [
    'silk', 'porcelain', 'tea', 'lacquerware', 'copper cash',
    'rhubarb', 'musk', 'ginseng', 'mercury', 'paper',
  ],
};

const ATLANTIC_MERCHANT_GOODS: Record<AtlanticNationality, string[]> = {
  Portuguese: [
    'sugar', 'brazilwood', 'tobacco', 'hides', 'cacao',
    'cotton', 'cachaça', 'manioc flour', 'jerked beef', 'indigo',
  ],
  Spanish: [
    'silver', 'hides', 'tobacco', 'cochineal', 'indigo',
    'sugar', 'emeralds', 'pearls', 'logwood', 'cacao',
  ],
  English: [
    'sassafras', 'tobacco', 'clapboard', 'deerskins',
    'iron tools', 'broadcloth', 'glass beads', 'salt beef',
  ],
};

const MERCHANT_GOODS: Record<Culture, string[]> = {
  'European': [
    'cloth', 'spices', 'gems', 'ivory', 'porcelain',
    'wine', 'weapons', 'horses', 'silk', 'coral',
  ],
  'Indian Ocean': INDIAN_OCEAN_MERCHANT_GOODS.Arab,
  'West African': [
    'gold dust', 'ivory', 'kola nuts', 'cloth', 'beads',
    'palm oil', 'slaves', 'hides', 'pepper', 'iron',
  ],
  'Atlantic': ATLANTIC_MERCHANT_GOODS.Portuguese,
};

// ═══════════════════════════════════════════════════════════════════════════════
// Main label generator
// ═══════════════════════════════════════════════════════════════════════════════

export interface BuildingLabelResult {
  label: string;
  sub: string;
  /** Surname of the household occupying this building, when residential.
   *  Pedestrians anchored to this building inherit it as their family name. */
  familyName?: string;
  /** Honorific (Fidalgo, Sheikh, Seth …) for elite residences. */
  title?: string;
  household?: BuildingHousehold;
}

// ── Named landmark labels ────────────────────────────────────────────────────
// `type: 'landmark'` buildings always carry a `landmarkId` that names the
// specific monument. This table supplies the real historical name and
// subtitle so hover labels don't fall back to a generic name pool. The
// eyebrow (RELIGIOUS / CIVIC / ROYAL) comes from the semanticClasses module
// via LANDMARK_CLASS — see cityGenerator.ts where it's resolved and set on
// the Building.
const LANDMARK_LABELS: Record<string, { label: string; sub: string }> = {
  // Religious
  'bom-jesus-basilica':  { label: 'Basílica do Bom Jesus',     sub: 'Jesuit basilica' },
  'oude-kerk-spire':     { label: 'Oude Kerk',                 sub: 'Calvinist church' },
  'giralda-tower':       { label: 'La Giralda',                sub: 'cathedral belltower' },
  'al-shadhili-mosque':  { label: 'Al-Shādhilī Mosque',        sub: 'masjid jāmiʿ' },
  'grand-mosque-tiered': { label: 'Mesjid Agung Banten',       sub: 'grand mosque' },
  'calicut-gopuram':     { label: 'Tali Śiva Temple',          sub: 'Malabar gopuram' },
  'jesuit-college':      { label: 'Colégio dos Jesuítas',      sub: 'Jesuit college' },
  // Royal / judicial
  'tower-of-london':     { label: 'Tower of London',           sub: 'royal fortress & mint' },
  'palacio-inquisicion': { label: 'Palacio de la Inquisición', sub: 'tribunal del Santo Oficio' },
  // Civic / military
  'belem-tower':           { label: 'Torre de Belém',              sub: 'river fortification' },
  'fort-jesus':            { label: 'Fort Jesus',                  sub: 'Portuguese coastal fort' },
  'diu-fortress':          { label: 'Fortaleza de Diu',            sub: 'bastioned coastal fort' },
  'elmina-castle':         { label: 'São Jorge da Mina',           sub: 'Portuguese castle' },
  // Learned
  'colegio-sao-paulo':     { label: 'Colégio de São Paulo',        sub: 'Jesuit college & observatory' },
  // Mercantile
  'english-factory-surat': { label: 'English East India Factory',  sub: 'Surat factory, est. 1612' },
};

// ── Palace (generic royal/governor's residence) naming ──────────────────────
// Mirrors the spiritual system — palaceStyle drives culturally-appropriate
// naming. Each port gets at most one palace; the ROYAL eyebrow comes from
// the semantic class resolver, not from here.
function palaceLabel(
  style: string,
  portName: string,
  nationality: Nationality | undefined,
  portId?: string,
): { label: string; sub: string } {
  const authority = portId ? authorityForPort(portId) : null;
  if (authority) {
    return { label: authority.buildingLabel, sub: authority.buildingSub };
  }

  switch (style) {
    case 'iberian-colonial': {
      // Portuguese or Spanish colonial governor's palace / viceroyalty.
      if (nationality === 'Spanish') {
        return { label: `Casa de Gobierno de ${portName}`, sub: 'gobernación' };
      }
      return { label: `Palácio do Governador`, sub: 'Portuguese governor\'s palace' };
    }
    case 'mughal': {
      return { label: `Diwan-i-Khas of ${portName}`, sub: 'Mughal governor\'s palace' };
    }
    case 'malay-istana': {
      return { label: `Istana of ${portName}`, sub: 'Sultan\'s palace' };
    }
    default:
      return { label: `Palace of ${portName}`, sub: 'royal residence' };
  }
}

// ── Faith-specific spiritual building naming ─────────────────────────────────
// Generic spiritual buildings placed by the city generator. These sit
// alongside any named landmark (the landmark owns the prominent site; these
// fill in the second/third faith for religiously plural ports like Goa or
// Malacca).
function spiritualLabel(
  faith: string,
  portName: string,
  nationality: Nationality | undefined,
  region: CulturalRegion | undefined,
  rng: () => number,
): { label: string; sub: string } {
  switch (faith) {
    case 'catholic': {
      const saints = ['São Francisco', 'Nossa Senhora do Rosário', 'São Sebastião', 'Santo António', 'São Tomé', 'São Paulo', 'Bom Jesus'];
      return { label: `Igreja de ${pick(saints, rng)}`, sub: 'parish church' };
    }
    case 'protestant': {
      if (nationality === 'Dutch') {
        const names = ['Zuider', 'Wester', 'Nieuwe', 'Noorder', 'Ooster'];
        return { label: `${pick(names, rng)}kerk`, sub: 'Calvinist church' };
      }
      const patrons = ['St Mary', 'St James', 'Christ', 'Holy Trinity', 'St Olave'];
      return { label: `${pick(patrons, rng)}'s Church`, sub: 'Anglican parish' };
    }
    case 'sunni':
    case 'shia': {
      if (region === 'Swahili' || region === 'Arab') {
        const nouns = ['al-Jāmiʿ', 'al-Kabīr', 'al-Nūr', 'al-Fatḥ', 'al-Rawḍa'];
        return { label: `Masjid ${pick(nouns, rng)}`, sub: faith === 'shia' ? 'Shiʿa mosque' : 'Friday mosque' };
      }
      if (region === 'Malay') {
        const places = ['Agung', 'Raya', 'Jamek', 'Besar'];
        return { label: `Mesjid ${pick(places, rng)}`, sub: 'jāmiʿ mosque' };
      }
      if (region === 'Gujarati') {
        return { label: `Jāmaʿ Masjid of ${portName}`, sub: 'Friday mosque' };
      }
      return { label: `Masjid of ${portName}`, sub: 'congregational mosque' };
    }
    case 'ibadi': {
      const names = ['al-Khūr', 'al-Muṭraḥ', 'al-Bāṭina', 'al-Ḥāra'];
      return { label: `Masjid ${pick(names, rng)}`, sub: 'Ibāḍī mosque' };
    }
    case 'hindu': {
      if (region === 'Malabari') {
        const deities = ['Śiva', 'Durgā', 'Kṛṣṇa', 'Hanumān', 'Gaṇeśa'];
        return { label: `${pick(deities, rng)} Kōvil`, sub: 'Malabar temple' };
      }
      const deities = ['Jagannātha', 'Viṣṇu', 'Kṛṣṇa', 'Rāma', 'Devī'];
      return { label: `${pick(deities, rng)} Mandir`, sub: 'Hindu temple' };
    }
    case 'buddhist': {
      if (region === 'Chinese') {
        const names = ['Pú-jì', 'Wén-chāng', 'Tiān-wáng', 'Guān-yīn'];
        return { label: `${pick(names, rng)} Sì`, sub: 'Buddhist temple' };
      }
      const names = ['Sanghārāma', 'Vihāra', 'Caitya'];
      return { label: `${pick(names, rng)} of ${portName}`, sub: 'Buddhist monastery' };
    }
    case 'chinese-folk': {
      const deities = ['Tiān-hòu', 'Guān-dì', 'Tǔ-dì-gōng', 'Mǎ-zǔ'];
      return { label: `${pick(deities, rng)} Miào`, sub: 'popular shrine' };
    }
    case 'animist': {
      const forms = ['Grove', 'Shrine', 'Altar', 'Spirit House'];
      return { label: `${portName} ${pick(forms, rng)}`, sub: 'sacred ground' };
    }
    case 'jewish': {
      if (nationality === 'Dutch') {
        return { label: 'Bet Yaʿaqov Synagogue', sub: 'Sephardic esnoga' };
      }
      return { label: `Synagogue of ${portName}`, sub: 'Jewish congregation' };
    }
    default:
      return { label: 'House of Prayer', sub: 'sanctuary' };
  }
}

/**
 * Generate a deterministic label for a building based on its type,
 * culture, and placement characteristics.
 */
// ── Farmstead crop classifier ────────────────────────────────────────────────
// Maps a label string to one of the renderable crop categories. When a match
// hits, cityGenerator stores the crop + tint on the building and the field
// renderer (FarmsteadFields.tsx) draws the actual orchard / paddy / vineyard /
// grain field around the hut. Unmatched farmsteads still get the plain hut
// and label — they just won't grow geometry yet.
export type FarmCrop = 'orange' | 'rice' | 'date' | 'palm' | 'orchard' | 'vineyard' | 'grain' | 'banana';

export interface FarmCropPick {
  crop?: FarmCrop;
  /** Optional canopy / ground tint for the renderer. Drives the visual
   *  difference between e.g. an olive grove (silvery) and a mango orchard
   *  (deep green) from the same shared orchard geometry. */
  tint?: [number, number, number];
  label: string;
  sub: string;
}

/**
 * Per-fruit canopy tints for orchards. Keys are the lowercased substring we
 * look for in the label. First match wins, so order matters where labels
 * overlap (e.g. "cork oak" before "oak").
 */
const ORCHARD_TINTS: [string, [number, number, number]][] = [
  // Mediterranean — silvery, dusty greens
  ['fig',         [0.62, 0.70, 0.48]],
  ['olive',       [0.58, 0.66, 0.46]],
  ['cork oak',    [0.55, 0.62, 0.45]],
  ['almond',      [0.62, 0.72, 0.50]],
  ['pomegranate', [0.50, 0.58, 0.32]],
  ['chestnut',    [0.45, 0.58, 0.28]],
  ['willow',      [0.55, 0.68, 0.42]],
  ['frankincense',[0.60, 0.65, 0.45]],
  ['henna',       [0.50, 0.62, 0.35]],
  // Tropical / South Asian — saturated deep greens
  ['mango',       [0.20, 0.42, 0.18]],
  ['jackfruit',   [0.18, 0.40, 0.18]],
  ['cashew',      [0.42, 0.55, 0.34]],
  ['cacao',       [0.25, 0.45, 0.22]],
  ['tea garden',  [0.30, 0.52, 0.28]],
  ['mulberry',    [0.32, 0.50, 0.25]],
  ['breadfruit',  [0.25, 0.46, 0.22]],
  // Temperate fruit
  ['pear',        [0.42, 0.62, 0.30]],
  ['apple',       [0.42, 0.62, 0.30]],
  ['fruit',       [0.40, 0.60, 0.30]],
  // Catch-all for "Orchard" / "Hop garden tree" etc.
  ['orchard',     [0.38, 0.58, 0.28]],
];

/** Grain field tints — gold for ripe cereal, paler for fallow / hay. */
const GRAIN_TINTS: [string, [number, number, number]][] = [
  ['wheat',     [0.78, 0.65, 0.30]],
  ['barley',    [0.78, 0.66, 0.34]],
  ['rye',       [0.74, 0.62, 0.32]],
  ['oat',       [0.80, 0.70, 0.36]],
  ['maize',     [0.72, 0.70, 0.30]],
  ['sorghum',   [0.70, 0.55, 0.28]],
  ['millet',    [0.74, 0.62, 0.32]],
  ['bajri',     [0.72, 0.60, 0.30]],
  ['buckwheat', [0.72, 0.62, 0.40]],
  ['soybean',   [0.62, 0.68, 0.30]],
  ['hay',       [0.78, 0.72, 0.42]],
  ['fallow',    [0.66, 0.62, 0.42]],
  ['grain',     [0.76, 0.64, 0.32]],
];

function matchTint(label: string, table: [string, [number, number, number]][]): [number, number, number] | undefined {
  for (const [key, tint] of table) if (label.includes(key)) return tint;
  return undefined;
}

/**
 * Decide both the crop type (if any) and the label for a farmhouse, given
 * its environmental + cultural inputs. Centralizes the wet/dry → crop logic
 * so the renderer and the label can never disagree.
 *
 * Returns crop=undefined for any farmstead whose picked label doesn't map to
 * one of the rendered crop types — those still get a plain hut + label, just
 * no field geometry.
 */
export function pickFarmCrop(
  culture: Culture,
  moisture: number,
  seed: number,
  nationality?: Nationality,
  region?: CulturalRegion,
): FarmCropPick {
  const rng = mulberry32(seed);
  rng(); rng(); rng();

  const euro = asEuropean(nationality);
  const reg = asRegion(region);
  const atl = asAtlantic(nationality);
  const isEuro = culture === 'European';
  const isIO = culture === 'Indian Ocean';
  const isAtl = culture === 'Atlantic';

  const wetCrops = isEuro ? EUROPEAN_WET_CROPS[euro] : isIO ? INDIAN_OCEAN_WET_CROPS[reg] : isAtl ? ATLANTIC_WET_CROPS[atl] : WET_CROPS[culture];
  const dryCrops = isEuro ? EUROPEAN_DRY_CROPS[euro] : isIO ? INDIAN_OCEAN_DRY_CROPS[reg] : isAtl ? ATLANTIC_DRY_CROPS[atl] : DRY_CROPS[culture];

  const wet = moisture > 0.5;
  const label = pick(wet ? wetCrops : dryCrops, rng);
  const sub = 'farmstead';

  // Specific-first matching: rice/date/orange were the v1 categories with
  // their own dedicated geometry, so they win over the broader 'orchard'
  // catch-all. Within each branch we hand back any tint the renderer can use.
  const lower = label.toLowerCase();
  let crop: FarmCrop | undefined;
  let tint: [number, number, number] | undefined;

  if (lower.includes('rice') || lower.includes('paddy') || lower.includes('sawah') || lower.includes('lotus')) {
    crop = 'rice';
  } else if (lower.includes('date palm')) {
    crop = 'date';
  } else if (lower.includes('coconut') || lower.includes('sago palm') || lower.includes('arecanut') || lower.includes('areca')) {
    crop = 'palm';
  } else if (lower.includes('orange') || lower.includes('citrus') || lower.includes('huerta') || lower.includes('citrus grove')) {
    crop = 'orange';
  } else if (lower.includes('vineyard') || lower.includes('hop garden')) {
    crop = 'vineyard';
    tint = [0.40, 0.58, 0.28];
  } else if (lower.includes('banana') || lower.includes('plantain') || lower.includes('sugarcane') || lower.includes('bamboo')) {
    crop = 'banana';
    tint = [0.35, 0.58, 0.24];
  } else {
    const orchardTint = matchTint(lower, ORCHARD_TINTS);
    if (orchardTint) {
      crop = 'orchard';
      tint = orchardTint;
    } else {
      const grainTint = matchTint(lower, GRAIN_TINTS);
      if (grainTint) {
        crop = 'grain';
        tint = grainTint;
      }
    }
  }

  return { crop, tint, label, sub };
}

export function generateBuildingLabel(
  buildingId: string,
  type: BuildingType,
  culture: Culture,
  portName: string,
  height: number,
  distToCenter: number,
  moisture: number,
  seed: number,
  nationality?: Nationality,
  region?: CulturalRegion,
  opts?: { faith?: string; landmarkId?: string; palaceStyle?: string; portId?: string; institution?: BuildingInstitution },
): BuildingLabelResult {
  const rng = mulberry32(seed);
  // Consume a few values to decorrelate from other uses of same seed
  rng(); rng(); rng();

  // Named landmarks get a fixed historical label from LANDMARK_LABELS. This
  // runs before the type switch so `type: 'landmark'` dispatch never has to
  // reinvent the lookup. The eyebrow (RELIGIOUS / ROYAL / CIVIC) is set by
  // cityGenerator.ts from LANDMARK_CLASS, not here.
  if (opts?.landmarkId) {
    const lm = LANDMARK_LABELS[opts.landmarkId];
    if (lm) return { label: lm.label, sub: lm.sub };
  }

  if (type === 'landmark') {
    // Fallback for a landmark missing from LANDMARK_LABELS — shouldn't happen
    // in practice, but keeps the label non-empty so BuildingTooltip still
    // renders something.
    return { label: 'Monument', sub: 'landmark' };
  }

  if (type === 'spiritual') {
    const faith = opts?.faith ?? 'catholic';
    return spiritualLabel(faith, portName, nationality, region, rng);
  }

  if (type === 'palace') {
    const style = opts?.palaceStyle ?? 'iberian-colonial';
    return palaceLabel(style, portName, nationality, opts?.portId);
  }

  if (opts?.institution) {
    const authority = opts.portId ? authorityForPort(opts.portId) : null;
    switch (opts.institution) {
      case 'authority':
        if (authority) return { label: authority.buildingLabel, sub: authority.buildingSub };
        break;
      case 'captaincy':
        if (authority?.authorityKind === 'fort-captain') {
          return { label: authority.buildingLabel, sub: authority.buildingSub };
        }
        return { label: `${portName} Captaincy`, sub: 'captaincy office' };
      case 'customs':
        if (authority?.authorityKind === 'customs' || authority?.commissionStyle === 'customs') {
          return { label: authority.buildingLabel, sub: authority.buildingSub };
        }
        return { label: `${portName} Custom House`, sub: 'customs office' };
      case 'factory':
        return { label: `${portName} Factory`, sub: 'merchant factory' };
      case 'company-house':
        return { label: `${portName} Company House`, sub: 'company office' };
      case 'treasury':
        return { label: `${portName} Treasury`, sub: 'royal accounts' };
    }
  }

  const euro = asEuropean(nationality);
  const reg = asRegion(region);
  const atl = asAtlantic(nationality);
  const isEuro = culture === 'European';
  const isIO = culture === 'Indian Ocean';
  const isAtl = culture === 'Atlantic';

  // Forked RNG for household identity. Picking the family name from the main
  // rng would shuffle every other label downstream when the residential
  // branch is added, so we keep it on its own seed-stream. Every house /
  // shack / estate / farmhouse gets a family even when the label string
  // doesn't surface it — pedestrians anchored to that building inherit it.
  const householdRng = mulberry32(seed + 7919);
  householdRng(); householdRng(); householdRng();
  const isResidential = type === 'house' || type === 'shack' || type === 'estate' || type === 'farmhouse';
  const householdFamily = isResidential
    ? getFamilyName(culture, householdRng, nationality, region)
    : undefined;

  const forts = isEuro ? EUROPEAN_FORTS[euro] : isIO ? INDIAN_OCEAN_FORTS[reg] : isAtl ? ATLANTIC_FORTS[atl] : FORT_NAMES[culture];
  const markets = isEuro ? EUROPEAN_MARKETS[euro] : isIO ? INDIAN_OCEAN_MARKETS[reg] : isAtl ? ATLANTIC_MARKETS[atl] : MARKET_NAMES[culture];
  const docks = isEuro ? EUROPEAN_DOCKS[euro] : isIO ? INDIAN_OCEAN_DOCKS[reg] : isAtl ? ATLANTIC_DOCKS[atl] : DOCK_NAMES[culture];
  const owners = isEuro ? EUROPEAN_WAREHOUSE_OWNERS[euro] : isIO ? INDIAN_OCEAN_WAREHOUSE_OWNERS[reg] : isAtl ? ATLANTIC_WAREHOUSE_OWNERS[atl] : WAREHOUSE_OWNERS[culture];
  const titles = isEuro ? EUROPEAN_TITLES[euro] : isIO ? INDIAN_OCEAN_TITLES[reg] : isAtl ? ATLANTIC_TITLES[atl] : ELITE_TITLES[culture];
  const goods = isEuro ? EUROPEAN_WAREHOUSE_GOODS[euro] : isIO ? INDIAN_OCEAN_WAREHOUSE_GOODS[reg] : isAtl ? ATLANTIC_WAREHOUSE_GOODS[atl] : WAREHOUSE_GOODS[culture];
  const trades = isEuro ? EUROPEAN_TRADES[euro] : isIO ? INDIAN_OCEAN_TRADES[reg] : isAtl ? ATLANTIC_TRADES[atl] : TRADES_NEAR_MARKET[culture];
  const wetCrops = isEuro ? EUROPEAN_WET_CROPS[euro] : isIO ? INDIAN_OCEAN_WET_CROPS[reg] : isAtl ? ATLANTIC_WET_CROPS[atl] : WET_CROPS[culture];
  const dryCrops = isEuro ? EUROPEAN_DRY_CROPS[euro] : isIO ? INDIAN_OCEAN_DRY_CROPS[reg] : isAtl ? ATLANTIC_DRY_CROPS[atl] : DRY_CROPS[culture];
  const commoners = isIO ? INDIAN_OCEAN_COMMONERS[reg] : isAtl ? ATLANTIC_COMMONERS[atl] : COMMONER_LABELS[culture];
  const shacks = isIO ? INDIAN_OCEAN_SHACKS[reg] : isAtl ? ATLANTIC_SHACKS[atl] : SHACK_LABELS[culture];
  const merchantGoods = isIO ? INDIAN_OCEAN_MERCHANT_GOODS[reg] : isAtl ? ATLANTIC_MERCHANT_GOODS[atl] : MERCHANT_GOODS[culture];

  switch (type) {
    case 'fort':
      return {
        label: pick(forts, rng),
        sub: 'fortification',
      };

    case 'market':
      return {
        label: pick(markets, rng),
        sub: 'marketplace',
      };

    case 'plaza': {
      // Pick a culture-appropriate term for the square itself.
      let label = 'Town square';
      let sub = 'public square';
      // Iberian colonial override — Goa, Macau, Malacca (when Portuguese-
      // controlled) and any Spanish colonial port outside Iberia keeps the
      // praça/plaza vocabulary rather than the indigenous term.
      const iberianColonial = (nationality === 'Portuguese' || nationality === 'Spanish') && !isEuro;
      if (iberianColonial) {
        if (nationality === 'Portuguese') { label = 'Largo da Matriz'; sub = 'praça'; }
        else                               { label = 'Plaza de Armas'; sub = 'plaza'; }
      }
      else if (isEuro) {
        if (euro === 'Portuguese')      { label = 'Largo do Pelourinho'; sub = 'praça'; }
        else if (euro === 'Spanish')    { label = 'Plaza Mayor';         sub = 'plaza'; }
        else if (euro === 'Dutch')      { label = 'Dam';                 sub = 'stadsplein'; }
        else if (euro === 'English')    { label = 'Market cross';        sub = 'town square'; }
      } else if (isAtl) {
        if (atl === 'Portuguese')       { label = 'Largo da Matriz';     sub = 'praça'; }
        else if (atl === 'Spanish')     { label = 'Plaza de Armas';      sub = 'plaza'; }
        else                             { label = 'Town common';         sub = 'square'; }
      } else if (isIO) {
        if (reg === 'Arab')             { label = 'Maydan al-Jāmiʿ';     sub = 'maydan'; }
        else if (reg === 'Swahili')     { label = 'Baraza';              sub = 'public ground'; }
        else if (reg === 'Gujarati')    { label = 'Chowk';               sub = 'market square'; }
        else if (reg === 'Malabari')    { label = 'Ampalam';             sub = 'temple square'; }
        else if (reg === 'Malay')       { label = 'Padang';              sub = 'open field'; }
        else if (reg === 'Chinese')     { label = 'Paifang plaza';       sub = 'square'; }
        else                             { label = 'Maydan';              sub = 'square'; }
      } else if (culture === 'West African') {
        label = 'Palaver ground';
        sub = 'meeting place';
      }
      return { label, sub };
    }

    case 'dock':
      return {
        label: pick(docks, rng),
        sub: 'wharf',
      };

    case 'warehouse': {
      const good = pick(goods, rng);
      const owner = pick(owners, rng);
      return {
        label: `${capitalize(good)} warehouse`,
        sub: `property of ${owner}`,
      };
    }

    case 'estate': {
      const title = pick(titles, householdRng);
      return {
        label: `Residence of ${title} ${householdFamily}`,
        sub: 'estate',
        familyName: householdFamily,
        title,
        household: { kind: 'elite', title },
      };
    }

    case 'shack':
      return {
        label: pick(shacks, rng),
        sub: 'dwelling',
        familyName: householdFamily,
        household: { kind: 'laboring' },
      };

    case 'farmhouse': {
      const label = pick(moisture > 0.5 ? wetCrops : dryCrops, rng);
      return { label, sub: 'farmstead', familyName: householdFamily, household: { kind: 'farmstead', crop: undefined, good: label } };
    }

    case 'house': {
      // Social class heuristics based on placement
      const isNearCenter = distToCenter < 20;
      const isHighElevation = height > 4;
      const isLowElevation = height < 2;
      const isNearWater = distToCenter < 12 && isLowElevation;

      // Near water + low → maritime trades
      if (isNearWater && rng() < 0.6) {
        const trade = pick(TRADES_NEAR_WATER, rng);
        return {
          label: trade,
          sub: 'workshop',
          familyName: householdFamily,
          household: { kind: 'workshop', profession: trade },
        };
      }

      // Near center → artisan or shopkeeper
      if (isNearCenter) {
        if (rng() < 0.4) {
          // Minor merchant
          const good = pick(merchantGoods, rng);
          return {
            label: `${capitalize(good)} merchant`,
            sub: 'shop',
            familyName: householdFamily,
            household: { kind: 'shop', profession: 'merchant', good },
          };
        }
        const trade = pick(trades, rng);
        return {
          label: trade,
          sub: 'shop',
          familyName: householdFamily,
          household: { kind: 'shop', profession: trade },
        };
      }

      // High elevation → upper class residence
      if (isHighElevation) {
        if (rng() < 0.3) {
          const title = pick(titles, householdRng);
          return {
            label: `Residence of ${title} ${householdFamily}`,
            sub: 'residence',
            familyName: householdFamily,
            title,
            household: { kind: 'elite', title },
          };
        }
        return {
          label: `Residence of the ${householdFamily} family`,
          sub: 'residence',
          familyName: householdFamily,
          household: { kind: 'residence' },
        };
      }

      // Low elevation + far → common laborer
      if (isLowElevation) {
        return {
          label: pick(commoners, rng),
          sub: 'dwelling',
          familyName: householdFamily,
          household: { kind: 'laboring' },
        };
      }

      // Default middle-class — mix of trades and residences
      if (rng() < 0.5) {
        const trade = pick(trades, rng);
        return {
          label: trade,
          sub: 'shop',
          familyName: householdFamily,
          household: { kind: 'shop', profession: trade },
        };
      }
      return {
        label: `House of ${householdFamily}`,
        sub: 'residence',
        familyName: householdFamily,
        household: { kind: 'residence' },
      };
    }

    default:
      return { label: '', sub: '' };
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
