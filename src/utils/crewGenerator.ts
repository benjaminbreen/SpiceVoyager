import { Nationality, CrewMember, CrewRole, HealthFlag } from '../store/gameStore';

const generateId = () => Math.random().toString(36).substring(2, 9);
function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }

// ── Name pools by nationality ──────────────────────────

interface NamePool {
  first: string[];
  last: string[];
  birthplaces: string[];
}

const NAME_POOLS: Record<Nationality, NamePool> = {
  English: {
    first: ['Thomas', 'William', 'John', 'Edward', 'Richard', 'Henry', 'James', 'Robert', 'George', 'Samuel', 'Humphrey', 'Francis', 'Walter', 'Bartholomew', 'Simon', 'Daniel', 'Nathaniel', 'Edmund', 'Ralph', 'Peter'],
    last: ['Blackwood', 'Hawkins', 'Smith', 'Fletcher', 'Ward', 'Cooper', 'Middleton', 'Lancaster', 'Keeling', 'Downton', 'Best', 'Saris', 'Towerson', 'Floris', 'Adams', 'Roe', 'Bonner', 'Oxley', 'Sharpe', 'Tanner'],
    birthplaces: ['London', 'Bristol', 'Plymouth', 'Southampton', 'Dover', 'Norwich', 'Deptford', 'Woolwich', 'Ipswich', 'Dartmouth'],
  },
  Portuguese: {
    first: ['Rodrigo', 'Fernão', 'Afonso', 'Pedro', 'Diogo', 'Manuel', 'Gaspar', 'António', 'Luís', 'Tomé', 'Vasco', 'Duarte', 'Gonçalo', 'Rui', 'Nuno', 'Jorge', 'Cristóvão', 'Simão', 'Jerónimo', 'Francisco'],
    last: ['da Silva', 'de Albuquerque', 'Pereira', 'Mendes', 'da Gama', 'Coelho', 'Pinto', 'Correia', 'de Brito', 'Barbosa', 'de Noronha', 'Cabral', 'Teixeira', 'Mendonça', 'Figueiredo', 'de Castro', 'Soares', 'Lopes', 'Ferreira', 'Alvares'],
    birthplaces: ['Lisbon', 'Porto', 'Coimbra', 'Goa', 'Cochin', 'Malacca', 'Macau', 'Diu', 'Évora', 'Setúbal'],
  },
  Dutch: {
    first: ['Willem', 'Jan', 'Pieter', 'Cornelis', 'Hendrik', 'Dirk', 'Jacob', 'Gerrit', 'Frederik', 'Adriaan', 'Joost', 'Maarten', 'Simon', 'Abel', 'Laurens', 'Caspar', 'Wouter', 'Reinier', 'Hugo', 'Barend'],
    last: ['de Groot', 'van den Berg', 'Janssen', 'de Vries', 'van Linschoten', 'Houtman', 'van Neck', 'Coen', 'van der Hagen', 'Matelief', 'Both', 'Reael', 'Speex', 'van Diemen', 'Brouwer', 'de Haan', 'Bakker', 'Visser', 'Smit', 'Dekker'],
    birthplaces: ['Amsterdam', 'Rotterdam', 'Delft', 'Leiden', 'Haarlem', 'Middelburg', 'Enkhuizen', 'Hoorn', 'Flushing', 'The Hague'],
  },
  Spanish: {
    first: ['Diego', 'Hernán', 'Juan', 'Pedro', 'Miguel', 'Álvaro', 'Francisco', 'Gonzalo', 'Sebastián', 'Carlos', 'Felipe', 'Andrés', 'Martín', 'Tomás', 'Baltasar', 'Cristóbal', 'Gaspar', 'Rodrigo', 'Alonso', 'Lorenzo'],
    last: ['de Torres', 'Fernández', 'de Quirós', 'Mendoza', 'de Legazpi', 'de Urdaneta', 'Velázquez', 'de Salcedo', 'Morga', 'de Acuña', 'Cervantes', 'del Castillo', 'Vázquez', 'de la Cruz', 'Galván', 'Navarro', 'Romero', 'Guerrero', 'Serrano', 'Delgado'],
    birthplaces: ['Seville', 'Cádiz', 'Manila', 'Acapulco', 'Havana', 'Lima', 'Barcelona', 'Cartagena', 'Veracruz', 'San Juan'],
  },
  French: {
    first: ['Jacques', 'Pierre', 'Jean', 'François', 'Antoine', 'Charles', 'Louis', 'René', 'Guillaume', 'Nicolas', 'Étienne', 'André', 'Claude', 'Philippe', 'Michel', 'Henri', 'Mathieu', 'Gaspard', 'Olivier', 'Armand'],
    last: ['de Vitré', 'Pyrard', 'du Plessis', 'Beaulieu', 'Lefevre', 'Martin', 'Moreau', 'Laurent', 'Bonhomme', 'Dubois', 'Renault', 'de la Roche', 'Blanchard', 'Garnier', 'Mercier', 'Fontaine', 'Barbier', 'Deschamps', 'Arnaud', 'Gauthier'],
    birthplaces: ['Saint-Malo', 'La Rochelle', 'Dieppe', 'Rouen', 'Nantes', 'Marseille', 'Bordeaux', 'Le Havre', 'Brest', 'Honfleur'],
  },
  Danish: {
    first: ['Ove', 'Erik', 'Lars', 'Jens', 'Niels', 'Søren', 'Anders', 'Peder', 'Mikkel', 'Hans', 'Knud', 'Rasmus', 'Christian', 'Frederik', 'Henrik', 'Magnus', 'Sigurd', 'Bjørn', 'Svend', 'Torben'],
    last: ['Gjedde', 'Bille', 'Crappe', 'Hansen', 'Pedersen', 'Andersen', 'Larsen', 'Jørgensen', 'Christensen', 'Rasmussen', 'Sørensen', 'Madsen', 'Mortensen', 'Eriksen', 'Knudsen', 'Olsen', 'Thomsen', 'Lund', 'Bech', 'Dahl'],
    birthplaces: ['Copenhagen', 'Helsingør', 'Aalborg', 'Odense', 'Bergen', 'Tranquebar', 'Aarhus', 'Ribe', 'Roskilde', 'Malmø'],
  },
  Mughal: {
    first: ['Mirza', 'Khwaja', 'Asaf', 'Muqarrab', 'Itimad', 'Nur', 'Sher', 'Dara', 'Aurangzeb', 'Shah', 'Iftikhar', 'Zulfiqar', 'Hakim', 'Qasim', 'Yusuf', 'Ibrahim', 'Salim', 'Rahim', 'Farid', 'Akbar'],
    last: ['Khan', 'Beg', 'ud-Daula', 'Ali', 'Jahan', 'Shah', 'Mirza', 'Bahadur', 'Singh', 'Ahmad', 'Husain', 'Malik', 'Quli', 'Baksh', 'Alam'],
    birthplaces: ['Agra', 'Delhi', 'Lahore', 'Fatehpur Sikri', 'Burhanpur', 'Dhaka', 'Kabul', 'Multan', 'Ahmedabad', 'Surat'],
  },
  Gujarati: {
    first: ['Rajan', 'Virji', 'Mulla', 'Abdul', 'Lakshmi', 'Govind', 'Hari', 'Mohan', 'Kanji', 'Narayan', 'Vasant', 'Devji', 'Premji', 'Raghunath', 'Sheth', 'Jagat', 'Bhimji', 'Tapidas', 'Jairam', 'Rama'],
    last: ['Nair', 'Vora', 'Ghaffur', 'Seth', 'Das', 'Parekh', 'Mehta', 'Chand', 'Parikh', 'Bhatia', 'Shah', 'Patel', 'Trivedi', 'Choksi', 'Shroff'],
    birthplaces: ['Surat', 'Cambay', 'Diu', 'Ahmedabad', 'Broach', 'Mandvi', 'Porbandar', 'Gogha', 'Bharuch', 'Khambhat'],
  },
  Persian: {
    first: ['Abbas', 'Hossein', 'Reza', 'Allahverdi', 'Imam', 'Safi', 'Rostam', 'Mehdi', 'Nader', 'Farhad', 'Jamshid', 'Bahram', 'Dariush', 'Khosrow', 'Parviz', 'Ardeshir', 'Shahrokh', 'Karim', 'Tahmasp', 'Esfandiar'],
    last: ['Khan', 'Beg', 'Mirza', 'Shirazi', 'Isfahani', 'Gilani', 'Tabrizi', 'Khorasani', 'Qajar', 'Afshar', 'Bakhtiari', 'Zand', 'Kashani', 'Tusi', 'Hamadani'],
    birthplaces: ['Isfahan', 'Bandar Abbas', 'Shiraz', 'Tabriz', 'Hormuz', 'Kerman', 'Qom', 'Mashhad', 'Yazd', 'Hamadan'],
  },
  Ottoman: {
    first: ['Hasan', 'Mehmed', 'Ali', 'Mustafa', 'Süleyman', 'Osman', 'Selim', 'Murad', 'Bayezid', 'Ahmed', 'Sinan', 'Piri', 'Hayreddin', 'Turgut', 'Kemal', 'Yusuf', 'Ibrahim', 'Davud', 'Halil', 'Bali'],
    last: ['Reis', 'Pasha', 'Agha', 'Bey', 'Efendi', 'Çelebi', 'Kapudan', 'Beylerbey', 'Defterdar'],
    birthplaces: ['Constantinople', 'Smyrna', 'Alexandria', 'Aleppo', 'Basra', 'Jeddah', 'Mocha', 'Tripoli', 'Tunis', 'Algiers'],
  },
  Omani: {
    first: ['Nasir', 'Said', 'Hamad', 'Sultan', 'Rashid', 'Khalid', 'Majid', 'Salim', 'Saif', 'Abdullah', 'Faisal', 'Thuwaini', 'Azzan', 'Turki', 'Barghash'],
    last: ['bin Said', 'al-Yarubi', 'bin Sultan', 'al-Busaidi', 'bin Ahmed', 'al-Harthi', 'bin Rashid', 'al-Ghafiri', 'al-Hinai', 'bin Hamad'],
    birthplaces: ['Muscat', 'Sohar', 'Sur', 'Nizwa', 'Bahla', 'Rustaq', 'Nakhal', 'Ibri', 'Zanzibar', 'Mombasa'],
  },
  Swahili: {
    first: ['Kwame', 'Yusuf', 'Hassan', 'Bwana', 'Mwinyi', 'Seif', 'Bakari', 'Hamisi', 'Juma', 'Rashid', 'Kombo', 'Mzee', 'Salum', 'Baraka', 'Omari', 'Maulidi', 'Fadhili', 'Khamis', 'Sudi', 'Athumani'],
    last: ['Asante', 'bin Ali', 'Mkuu', 'wa Kilwa', 'bin Bakari', 'al-Mazrui', 'bin Yusuf', 'wa Mombasa', 'Shirazi', 'bin Hassan', 'wa Pate', 'bin Salim', 'wa Lamu', 'wa Malindi', 'bin Hamad'],
    birthplaces: ['Kilwa', 'Mombasa', 'Zanzibar', 'Malindi', 'Pate', 'Lamu', 'Sofala', 'Mogadishu', 'Mozambique', 'Comoros'],
  },
  Malay: {
    first: ['Tun', 'Hang', 'Laksamana', 'Abdul', 'Raja', 'Megat', 'Ahmad', 'Ismail', 'Mahmud', 'Alauddin', 'Muzaffar', 'Mansur', 'Hamzah', 'Zainal', 'Syed'],
    last: ['Perak', 'Tuah', 'Jebat', 'Kasturi', 'Shah', 'Riayat', 'Ibrahim', 'Muda', 'Lela', 'Setia', 'Pahlawan', 'Wira'],
    birthplaces: ['Johor', 'Malacca', 'Pahang', 'Perak', 'Kedah', 'Patani', 'Riau', 'Bintan', 'Terengganu', 'Singapura'],
  },
  Acehnese: {
    first: ['Iskandar', 'Ali', 'Alauddin', 'Safiatuddin', 'Muzaffar', 'Mansur', 'Husain', 'Ibrahim', 'Zainal', 'Firman', 'Teuku', 'Cut', 'Polem', 'Tuanku', 'Teungku'],
    last: ['Muda', 'Riayat', 'Shah', 'Syah', 'Perkasa', 'Alam', 'Johan', 'Pahlawan', 'Malahayati', 'Maharaja'],
    birthplaces: ['Banda Aceh', 'Pidie', 'Pasai', 'Lamuri', 'Daya', 'Pedir', 'Samudera', 'Meulaboh', 'Sigli', 'Lhokseumawe'],
  },
  Javanese: {
    first: ['Raden', 'Pangeran', 'Adipati', 'Senopati', 'Agung', 'Mas', 'Tumenggung', 'Arya', 'Demang', 'Kiai', 'Sunan', 'Wiranata', 'Surya', 'Paku', 'Hamengku'],
    last: ['Mataram', 'Buwono', 'Mangkunegara', 'Senapati', 'Krapyak', 'Seda', 'Agung', 'Amangkurat', 'Prawira', 'Jaya', 'Kusuma', 'Ningrat'],
    birthplaces: ['Mataram', 'Karta', 'Banten', 'Surabaya', 'Demak', 'Cirebon', 'Gresik', 'Tuban', 'Japara', 'Semarang'],
  },
  Moluccan: {
    first: ['Kaicili', 'Sultan', 'Said', 'Nuku', 'Baab', 'Hairun', 'Babullah', 'Mudafar', 'Hamza', 'Zainal', 'Alam', 'Syah', 'Jou', 'Kolano', 'Amsterdam'],
    last: ['Ternate', 'Tidore', 'Bacan', 'Jailolo', 'Sahmardan', 'Abidin', 'Shah', 'Siru', 'Kamaluddin', 'Marsaoli'],
    birthplaces: ['Ternate', 'Tidore', 'Bacan', 'Jailolo', 'Ambon', 'Banda', 'Makian', 'Halmahera', 'Seram', 'Hitu'],
  },
  Siamese: {
    first: ['Naresuan', 'Ekathotsarot', 'Songtham', 'Prasat', 'Okya', 'Chaophraya', 'Phra', 'Luang', 'Khun', 'Nai', 'Chao', 'Mun', 'Pan', 'Sri', 'Nak'],
    last: ['Suriyawong', 'Phrakhlang', 'Chakri', 'Kalahom', 'Mahatthai', 'Pipat', 'Rajamanu', 'Sombat', 'Siwaraksa', 'Phanomwan'],
    birthplaces: ['Ayutthaya', 'Nakhon Si Thammarat', 'Mergui', 'Tenasserim', 'Phitsanulok', 'Lopburi', 'Chiang Mai', 'Pattani', 'Songkhla', 'Bangkok'],
  },
  Japanese: {
    first: ['Yamada', 'Tanaka', 'Hasekura', 'Anjin', 'Matsuura', 'Suetsugu', 'Araki', 'Murayama', 'Nishi', 'Suminokura', 'Funai', 'Itami', 'Kadoya', 'Shirai', 'Harada'],
    last: ['Nagamasa', 'Shiro', 'Tsunenaga', 'Miura', 'Takanobu', 'Heizo', 'Sotaro', 'Toan', 'Ryoi', 'Jinbei', 'Kichibei', 'Jirobe', 'Juzaburo', 'Magoshiro', 'Kiemon'],
    birthplaces: ['Nagasaki', 'Hirado', 'Sakai', 'Kyoto', 'Edo', 'Osaka', 'Hakata', 'Shimabara', 'Dejima', 'Sunpu'],
  },
  Chinese: {
    first: ['Li', 'Zhang', 'Chen', 'Wang', 'Lin', 'Zheng', 'Yang', 'Huang', 'Wu', 'Xu', 'He', 'Ma', 'Guo', 'Luo', 'Tan', 'Cai', 'Zhu', 'Wei', 'Liang', 'Song'],
    last: ['Zhilong', 'Chenggong', 'Dan', 'Feng', 'Qi', 'Wei', 'Hai', 'Ming', 'Jun', 'Guang', 'Rui', 'Yi', 'Shan', 'Bao', 'Jian'],
    birthplaces: ['Fujian', 'Guangzhou', 'Quanzhou', 'Zhangzhou', 'Xiamen', 'Manila', 'Macau', 'Hoi An', 'Batavia', 'Malacca'],
  },
};

// ── Crew nationality mix by faction ────────────────────
// Each entry is [nationality, weight]. Weights are relative.

type NatWeight = [Nationality, number];

/**
 * Five playable factions and the typical crew composition of each.
 * Historically, all Indian Ocean ships had mixed crews; the proportions varied.
 */
const CREW_MIX: Record<string, NatWeight[]> = {
  English: [
    ['English', 45],
    ['Gujarati', 12],     // lascars from Surat/Cambay
    ['Swahili', 6],       // picked up on the African coast
    ['Portuguese', 8],    // renegados, pilots who know the waters
    ['Dutch', 5],         // fellow Protestants, occasional hires
    ['French', 3],
    ['Malay', 5],         // local pilots in SE Asian waters
    ['Chinese', 4],       // junk crews, translators in Bantam
    ['Persian', 2],
    ['Mughal', 3],
    ['Danish', 2],
    ['Ottoman', 2],
    ['Japanese', 1],
    ['Omani', 1],
    ['Acehnese', 1],
  ],
  Portuguese: [
    ['Portuguese', 35],
    ['Gujarati', 15],     // huge lascar population on Portuguese ships
    ['Swahili', 8],       // from Mozambique, Kilwa
    ['Malay', 8],         // from Malacca
    ['Chinese', 6],       // Macau connections
    ['Mughal', 5],
    ['Japanese', 4],      // Nagasaki trade connection
    ['Persian', 4],
    ['English', 3],       // occasional Protestant renegades
    ['Dutch', 2],
    ['Moluccan', 3],
    ['Javanese', 3],
    ['Omani', 2],
    ['Ottoman', 1],
    ['Acehnese', 1],
  ],
  Dutch: [
    ['Dutch', 45],
    ['Malay', 10],        // local crews from Bantam, Ambon
    ['Javanese', 7],
    ['Gujarati', 7],      // lascars
    ['Chinese', 5],       // Batavia Chinese population
    ['English', 4],
    ['Danish', 4],        // fellow northern Europeans
    ['Portuguese', 4],    // turncoats and half-castes
    ['Moluccan', 4],
    ['Swahili', 3],
    ['French', 3],
    ['Japanese', 2],
    ['Persian', 1],
    ['Acehnese', 1],
  ],
  Spanish: [
    ['Spanish', 45],
    ['Portuguese', 10],   // Iberian union until 1640
    ['Chinese', 10],      // Manila's huge Chinese community
    ['Malay', 6],         // Filipino crews
    ['Moluccan', 5],
    ['Javanese', 4],
    ['Mughal', 3],
    ['Gujarati', 3],
    ['Japanese', 4],      // Japanese community in Manila
    ['French', 3],
    ['Dutch', 2],
    ['English', 2],
    ['Swahili', 1],
    ['Siamese', 1],
    ['Persian', 1],
  ],
  French: [
    ['French', 45],
    ['Portuguese', 10],   // hired experienced Eastern pilots
    ['Gujarati', 8],      // lascars
    ['English', 5],
    ['Dutch', 5],
    ['Swahili', 5],       // from Madagascar/Comoros
    ['Malay', 4],
    ['Chinese', 3],
    ['Persian', 3],
    ['Ottoman', 3],
    ['Mughal', 3],
    ['Spanish', 3],
    ['Danish', 2],
    ['Omani', 1],
  ],
};

function weightedPick(weights: NatWeight[]): Nationality {
  const total = weights.reduce((sum, [, w]) => sum + w, 0);
  let r = Math.random() * total;
  for (const [nat, w] of weights) {
    r -= w;
    if (r <= 0) return nat;
  }
  return weights[0][0];
}

// ── Skill ranges by role ───────────────────────────────

const SKILL_RANGE: Record<CrewRole, [number, number]> = {
  Captain:   [65, 95],
  Navigator: [55, 85],
  Gunner:    [40, 75],
  Factor:    [50, 80],
  Surgeon:   [45, 80],
  Sailor:    [25, 60],
};

// ── Public API ─────────────────────────────────────────

/** Generate a single crew member of a given nationality and role. */
export function generateCrewMember(
  nationality: Nationality,
  role: CrewRole,
): CrewMember {
  const pool = NAME_POOLS[nationality];
  const first = pick(pool.first);
  const last = pick(pool.last);
  const [minSkill, maxSkill] = SKILL_RANGE[role];

  return {
    id: generateId(),
    name: `${first} ${last}`,
    role,
    skill: randInt(minSkill, maxSkill),
    morale: randInt(65, 100),
    age: randInt(role === 'Captain' ? 32 : 18, role === 'Captain' ? 55 : 50),
    nationality,
    birthplace: pick(pool.birthplaces),
    health: 'healthy' as HealthFlag,
  };
}

/**
 * Generate a full starting crew for a playable faction.
 * Returns a captain + a balanced set of officers and sailors.
 */
export function generateStartingCrew(
  factionFlag: Nationality,
  crewSize: number = 6,
): CrewMember[] {
  const mix = CREW_MIX[factionFlag] ?? CREW_MIX['English'];
  const crew: CrewMember[] = [];

  // Captain is always from the faction
  crew.push(generateCrewMember(factionFlag, 'Captain'));

  // Assign officer roles first, then fill with sailors
  const officerRoles: CrewRole[] = ['Navigator', 'Gunner', 'Factor'];
  const remaining = crewSize - 1;

  for (let i = 0; i < remaining; i++) {
    const role = i < officerRoles.length ? officerRoles[i] : 'Sailor';
    const nat = weightedPick(mix);
    crew.push(generateCrewMember(nat, role));
  }

  return crew;
}

/**
 * Generate a single crew member appropriate for hiring at a port.
 * Nationality is weighted by the port's dominant culture + the global mix.
 */
export function generateHireableCrewMember(
  portNationality: Nationality,
  role: CrewRole = 'Sailor',
): CrewMember {
  // 60% chance local, 40% chance cosmopolitan mix
  const nat = Math.random() < 0.6
    ? portNationality
    : weightedPick(CREW_MIX['English']); // fallback to generic Indian Ocean mix
  return generateCrewMember(nat, role);
}
