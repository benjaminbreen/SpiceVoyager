import { BuildingType, Culture, Nationality, CulturalRegion } from '../store/gameStore';

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

function getFamilyName(
  culture: Culture,
  rng: () => number,
  nationality?: Nationality,
  region?: CulturalRegion,
): string {
  if (culture === 'European') return pick(EUROPEAN_FAMILIES[asEuropean(nationality)], rng);
  if (culture === 'Atlantic') return pick(ATLANTIC_FAMILIES[asAtlantic(nationality)], rng);
  return pick(INDIAN_OCEAN_FAMILIES[asRegion(region)], rng);
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
}

/**
 * Generate a deterministic label for a building based on its type,
 * culture, and placement characteristics.
 */
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
): BuildingLabelResult {
  const rng = mulberry32(seed);
  // Consume a few values to decorrelate from other uses of same seed
  rng(); rng(); rng();

  const euro = asEuropean(nationality);
  const reg = asRegion(region);
  const atl = asAtlantic(nationality);
  const isEuro = culture === 'European';
  const isIO = culture === 'Indian Ocean';
  const isAtl = culture === 'Atlantic';

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
      const family = getFamilyName(culture, rng, nationality, region);
      const title = pick(titles, rng);
      return {
        label: `Residence of ${title} ${family}`,
        sub: 'estate',
      };
    }

    case 'shack':
      return {
        label: pick(shacks, rng),
        sub: 'dwelling',
      };

    case 'farmhouse': {
      if (moisture > 0.5) {
        return {
          label: pick(wetCrops, rng),
          sub: 'farmstead',
        };
      } else {
        return {
          label: pick(dryCrops, rng),
          sub: 'farmstead',
        };
      }
    }

    case 'house': {
      // Social class heuristics based on placement
      const isNearCenter = distToCenter < 20;
      const isHighElevation = height > 4;
      const isLowElevation = height < 2;
      const isNearWater = distToCenter < 12 && isLowElevation;

      // Near water + low → maritime trades
      if (isNearWater && rng() < 0.6) {
        return {
          label: pick(TRADES_NEAR_WATER, rng),
          sub: 'workshop',
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
          };
        }
        return {
          label: pick(trades, rng),
          sub: 'shop',
        };
      }

      // High elevation → upper class residence
      if (isHighElevation) {
        const family = getFamilyName(culture, rng, nationality, region);
        if (rng() < 0.3) {
          const title = pick(titles, rng);
          return {
            label: `Residence of ${title} ${family}`,
            sub: 'residence',
          };
        }
        return {
          label: `Residence of the ${family} family`,
          sub: 'residence',
        };
      }

      // Low elevation + far → common laborer
      if (isLowElevation) {
        return {
          label: pick(commoners, rng),
          sub: 'dwelling',
        };
      }

      // Default middle-class — mix of trades and residences
      if (rng() < 0.5) {
        return {
          label: pick(trades, rng),
          sub: 'shop',
        };
      }
      const family = getFamilyName(culture, rng, nationality, region);
      return {
        label: `House of ${family}`,
        sub: 'residence',
      };
    }

    default:
      return { label: '', sub: '' };
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
