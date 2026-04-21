import { Nationality, CrewMember, CrewRole, CrewQuality, CrewStats, Humours, HealthFlag, Language } from '../store/gameStore';

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

const NATIVE_LANGUAGE: Record<Nationality, Language> = {
  English: 'English',
  Portuguese: 'Portuguese',
  Dutch: 'Dutch',
  Spanish: 'Spanish',
  French: 'French',
  Danish: 'Dutch',
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

const CONTACT_LANGUAGES: Record<Nationality, Language[]> = {
  English: ['Portuguese', 'Dutch', 'Gujarati', 'Arabic', 'Malay'],
  Portuguese: ['Arabic', 'Gujarati', 'Malay', 'Swahili', 'Persian'],
  Dutch: ['Portuguese', 'Malay', 'Chinese', 'Gujarati', 'English'],
  Spanish: ['Portuguese', 'Chinese', 'Malay', 'Japanese'],
  French: ['Portuguese', 'Arabic', 'Gujarati', 'Swahili'],
  Danish: ['Dutch', 'English', 'Portuguese', 'Malay'],
  Mughal: ['Persian', 'Gujarati', 'Arabic', 'Portuguese'],
  Gujarati: ['Hindustani', 'Persian', 'Arabic', 'Portuguese'],
  Persian: ['Arabic', 'Turkish', 'Gujarati', 'Hindustani'],
  Ottoman: ['Arabic', 'Persian', 'Portuguese'],
  Omani: ['Persian', 'Swahili', 'Gujarati', 'Portuguese'],
  Swahili: ['Arabic', 'Portuguese', 'Persian'],
  Malay: ['Portuguese', 'Chinese', 'Arabic', 'Japanese'],
  Acehnese: ['Arabic', 'Portuguese', 'Gujarati'],
  Javanese: ['Portuguese', 'Chinese', 'Arabic'],
  Moluccan: ['Portuguese', 'Malay', 'Chinese'],
  Siamese: ['Malay', 'Chinese', 'Portuguese'],
  Japanese: ['Chinese', 'Portuguese', 'Malay'],
  Chinese: ['Malay', 'Portuguese', 'Japanese'],
};

function rollLanguages(nationality: Nationality, role: CrewRole, stats: CrewStats, quality: CrewQuality): Language[] {
  const languages = new Set<Language>([NATIVE_LANGUAGE[nationality]]);
  const contacts = CONTACT_LANGUAGES[nationality] ?? [];
  const extraChance = role === 'Factor' ? 0.82
    : role === 'Navigator' ? 0.58
    : role === 'Captain' ? 0.48
    : role === 'Surgeon' ? 0.34
    : 0.22;
  const charismaBonus = Math.max(0, stats.charisma - 10) * 0.025;
  const qualityBonus =
      quality === 'legendary' ? 0.24
    : quality === 'renowned'  ? 0.18
    : quality === 'seasoned'  ? 0.12
    : quality === 'able'      ? 0.05
    : 0;

  if (contacts.length && Math.random() < extraChance + charismaBonus + qualityBonus) {
    languages.add(pick(contacts));
  }
  if (contacts.length > 1 && Math.random() < extraChance * 0.32 + charismaBonus) {
    languages.add(pick(contacts));
  }
  if (role === 'Factor' && languages.size < 3 && contacts.length) {
    languages.add(pick(contacts));
  }

  return [...languages];
}

// ── Quality tiers ──────────────────────────────────────
// Based on a composite score of skill + morale (range ~90-200).
// Eight-tier ladder running from disaster → legendary, with rough weights:
//   disaster ~3% · dud ~15% · untried ~20% · passable ~24%
//   able ~20% · seasoned ~12% · renowned ~4.5% · legendary ~1.5%
// We roll quality directly rather than computing percentiles across the crew,
// so each crew member's quality is independent.

function rollCrewQuality(skill: number, morale: number): CrewQuality {
  // Composite score: higher = better. Skill is weighted slightly more.
  const composite = skill * 1.2 + morale;
  // Normalize to 0-1 range roughly (min ~78, max ~214)
  const normalized = Math.min(1, Math.max(0, (composite - 78) / (214 - 78)));

  // Use normalized score as a *tendency* but add randomness so a mediocre-stat
  // crew member can still be legendary (lucky find) and vice versa.
  const roll = normalized * 0.6 + Math.random() * 0.4;

  if (roll >= 0.985) return 'legendary';
  if (roll >= 0.94)  return 'renowned';
  if (roll >= 0.82)  return 'seasoned';
  if (roll >= 0.62)  return 'able';
  if (roll >= 0.38)  return 'passable';
  if (roll >= 0.18)  return 'untried';
  if (roll >= 0.03)  return 'dud';
  return 'disaster';
}

// ── Backstory archetypes ───────────────────────────────
// ~25% of crew roll a life-shaping archetype that colours stats, humours,
// morale, language, and prepends a sentence to the backstory. The other 75%
// stay generic. Keeps archetypes feeling special when they appear.

type HumourKey = keyof Humours;

interface Archetype {
  id: string;
  label: string;
  statNudge?: Partial<Record<keyof CrewStats, number>>;
  humourNudge?: Partial<Record<HumourKey, number>>;
  moraleShift?: number;
  addLanguage?: boolean;
  roles?: CrewRole[];    // if set, only these roles can roll this archetype
  minAge?: number;
  backstoryPrefix: string[];
}

const ARCHETYPES: Archetype[] = [
  {
    id: 'freedman',
    label: 'Freedman',
    statNudge: { perception: 1 },
    humourNudge: { phlegmatic: 1, melancholic: 1 },
    moraleShift: -12,
    roles: ['Sailor', 'Gunner', 'Surgeon'],
    backstoryPrefix: [
      'Born into bondage; earned or stole his freedom and took to sea.',
      'A freedman of some years; keeps a written certificate of manumission in a wax-sealed pouch.',
      'Freed after a master\'s death, with no family and nothing ashore to go back to.',
    ],
  },
  {
    id: 'fugitive',
    label: 'Fugitive',
    statNudge: { luck: 1, charisma: -1 },
    humourNudge: { choleric: 2, melancholic: 1 },
    moraleShift: -10,
    backstoryPrefix: [
      'Left one port for another a step ahead of the law.',
      'There is a warrant for him somewhere, though he will not say where.',
      'Signed aboard under a name that is almost certainly not his own.',
    ],
  },
  {
    id: 'noble',
    label: 'Exile',
    statNudge: { charisma: 2, strength: -1 },
    humourNudge: { curiosity: 2, melancholic: 1 },
    addLanguage: true,
    minAge: 24,
    roles: ['Captain', 'Navigator', 'Factor', 'Surgeon'],
    backstoryPrefix: [
      'Once of a noble house; some reversal of fortune put him to sea.',
      'A younger son of consequence, left his inheritance to a brother and his name to a ship\'s register.',
      'Carries himself with the manners of court, and will not say which court.',
    ],
  },
  {
    id: 'convert',
    label: 'Convert',
    statNudge: { perception: 1 },
    humourNudge: { melancholic: 2, curiosity: 1 },
    addLanguage: true,
    minAge: 22,
    backstoryPrefix: [
      'Took the faith of a foreign port, for reasons of conscience or convenience.',
      'Wears a new name and an older soul; the old faith is not wholly gone.',
      'Converted in middle life; the men mock him gently, and he lets them.',
    ],
  },
  {
    id: 'debtor',
    label: 'Debtor',
    statNudge: { luck: -2, charisma: 1 },
    humourNudge: { choleric: 1, melancholic: 1 },
    moraleShift: -14,
    backstoryPrefix: [
      'Left behind a ledger of debts no wage will clear.',
      'The factors in his last port still send letters; he reads none of them.',
      'Took ship to outrun creditors; watches every new sail for the bailiff\'s flag.',
    ],
  },
  {
    id: 'deserter',
    label: 'Deserter',
    statNudge: { strength: 2, charisma: -1 },
    humourNudge: { choleric: 1, phlegmatic: 1 },
    moraleShift: -8,
    roles: ['Sailor', 'Gunner', 'Navigator', 'Surgeon'],
    backstoryPrefix: [
      'Slipped away from a king\'s ship in a friendly port and has kept moving since.',
      'Once wore another flag\'s uniform; will not speak of what ended his service.',
      'A deserter from military service — the scars are military, the discipline is not.',
    ],
  },
  {
    id: 'pirate',
    label: 'Ex-Pirate',
    statNudge: { strength: 2, luck: 1, charisma: -1 },
    humourNudge: { choleric: 2 },
    moraleShift: 4,
    roles: ['Sailor', 'Gunner', 'Navigator', 'Captain'],
    backstoryPrefix: [
      'Sailed under a black flag for a season and came ashore when the purse was spent.',
      'Has forgotten more about rigging and close-quarters work than most of the crew will learn.',
      'The tattoos are pirate work; the smile is not entirely pleasant.',
    ],
  },
  {
    id: 'merchant_son',
    label: 'Merchant\'s Son',
    statNudge: { charisma: 2, strength: -2 },
    humourNudge: { curiosity: 2, sanguine: 1 },
    moraleShift: 8,
    addLanguage: true,
    minAge: 18,
    roles: ['Factor', 'Sailor', 'Surgeon', 'Navigator'],
    backstoryPrefix: [
      'The restless son of a counting-house; signed on to see the ports his father only writes letters to.',
      'Left a comfortable clerkship out of boredom and a cousin\'s taunt.',
      'A merchant\'s son playing at mariner — keen, green, and liable to surprise.',
    ],
  },
  {
    id: 'scholar',
    label: 'Scholar',
    statNudge: { perception: 2, strength: -2 },
    humourNudge: { curiosity: 3, melancholic: 1 },
    addLanguage: true,
    minAge: 22,
    roles: ['Navigator', 'Surgeon', 'Factor', 'Sailor'],
    backstoryPrefix: [
      'Studied letters before he studied the sea, and carries a travelling library of some kind.',
      'A self-taught philosopher who took to voyages for what the books could not tell him.',
      'Keeps a notebook of observations on winds, plants, and the words of foreign tongues.',
    ],
  },
  {
    id: 'pressganged',
    label: 'Press-ganged',
    humourNudge: { choleric: 2, melancholic: 2 },
    moraleShift: -28,
    roles: ['Sailor', 'Gunner'],
    backstoryPrefix: [
      'Taken aboard against his will in a waterfront tavern, and has not forgiven it.',
      'Signed on at the point of a cudgel; the bruise is gone and the mood is not.',
      'Woke up aboard with no memory of signing articles and every intention of leaving at the first port.',
    ],
  },
  {
    id: 'castaway',
    label: 'Castaway',
    statNudge: { perception: 1, luck: 1 },
    humourNudge: { phlegmatic: 2, melancholic: 1 },
    moraleShift: -12,
    minAge: 20,
    backstoryPrefix: [
      'Sole survivor of a wreck that took everyone else; was found clinging to a spar two days later.',
      'Lost a ship, a crew, and most of his kit to the reef; signed on with what he could carry.',
      'The only man alive who knows exactly what happened to his last ship, and he will not speak of it.',
    ],
  },
];

function rollArchetype(role: CrewRole): Archetype | null {
  if (Math.random() > 0.25) return null;
  const eligible = ARCHETYPES.filter(a => !a.roles || a.roles.includes(role));
  if (!eligible.length) return null;
  return pick(eligible);
}

function applyArchetypeStats(stats: CrewStats, a: Archetype | null): CrewStats {
  if (!a?.statNudge) return stats;
  const clamp = (v: number) => Math.max(1, Math.min(20, v));
  return {
    strength:   clamp(stats.strength   + (a.statNudge.strength   ?? 0)),
    perception: clamp(stats.perception + (a.statNudge.perception ?? 0)),
    charisma:   clamp(stats.charisma   + (a.statNudge.charisma   ?? 0)),
    luck:       clamp(stats.luck       + (a.statNudge.luck       ?? 0)),
  };
}

function applyArchetypeHumours(h: Humours, a: Archetype | null): Humours {
  if (!a?.humourNudge) return h;
  const clamp = (v: number) => Math.max(1, Math.min(10, v));
  return {
    sanguine:    clamp(h.sanguine    + (a.humourNudge.sanguine    ?? 0)),
    choleric:    clamp(h.choleric    + (a.humourNudge.choleric    ?? 0)),
    melancholic: clamp(h.melancholic + (a.humourNudge.melancholic ?? 0)),
    phlegmatic:  clamp(h.phlegmatic  + (a.humourNudge.phlegmatic  ?? 0)),
    curiosity:   clamp(h.curiosity   + (a.humourNudge.curiosity   ?? 0)),
  };
}

// ── Age ────────────────────────────────────────────────
// Tied to quality: veterans skew older, untried skew younger. Rare tails (prodigy
// teenagers for able+, venerable 65+ for seasoned+) give age genuine meaning.

function rollAge(role: CrewRole, quality: CrewQuality, archetype: Archetype | null): number {
  const captainFloor = 28;
  let minAge = role === 'Captain' ? captainFloor : 16;
  let maxAge = 50;

  switch (quality) {
    case 'legendary':
    case 'renowned':
      minAge = Math.max(minAge, 40);
      maxAge = 65;
      if (Math.random() < 0.10) maxAge = 72;
      break;
    case 'seasoned':
      minAge = Math.max(minAge, 30);
      maxAge = 58;
      break;
    case 'able':
    case 'passable':
      minAge = Math.max(minAge, role === 'Captain' ? captainFloor : 22);
      maxAge = 48;
      break;
    case 'untried':
      minAge = Math.max(minAge, role === 'Captain' ? captainFloor : 16);
      maxAge = role === 'Captain' ? 36 : 30;
      break;
    case 'dud':
      minAge = Math.max(minAge, role === 'Captain' ? captainFloor : 18);
      maxAge = 60;
      break;
    case 'disaster':
      minAge = Math.max(minAge, role === 'Captain' ? captainFloor : 18);
      maxAge = 62;
      break;
  }

  // Rare prodigy — non-captain able/seasoned occasionally very young.
  if (role !== 'Captain' && (quality === 'able' || quality === 'seasoned') && Math.random() < 0.05) {
    return randInt(16, 19);
  }

  if (archetype?.minAge) minAge = Math.max(minAge, archetype.minAge);
  if (minAge > maxAge) [minAge, maxAge] = [maxAge, minAge];
  return randInt(minAge, maxAge);
}

// ── Stat generation (D&D-style 1-20) ─────────────────

// Role bonuses: each role has primary/secondary stats that get a boost
const ROLE_STAT_BONUS: Record<CrewRole, Partial<Record<keyof CrewStats, number>>> = {
  Captain:   { charisma: 3, perception: 2, luck: 1 },
  Navigator: { perception: 4, luck: 1 },
  Gunner:    { strength: 3, perception: 2 },
  Sailor:    { strength: 3, luck: 1 },
  Factor:    { charisma: 4, luck: 1 },
  Surgeon:   { perception: 3, charisma: 1, luck: 1 },
};

const QUALITY_STAT_BONUS: Record<CrewQuality, number> = {
  disaster: -4,
  dud:      -2,
  untried:  -1,
  passable:  0,
  able:      1,
  seasoned:  2,
  renowned:  3,
  legendary: 5,
};

function rollStats(role: CrewRole, quality: CrewQuality): CrewStats {
  const base = () => randInt(5, 14); // base roll 5-14
  const bonus = ROLE_STAT_BONUS[role];
  const qBonus = QUALITY_STAT_BONUS[quality];

  const clamp = (v: number) => Math.max(1, Math.min(20, v));
  const stats: CrewStats = {
    strength:   clamp(base() + (bonus.strength ?? 0) + qBonus),
    perception: clamp(base() + (bonus.perception ?? 0) + qBonus),
    charisma:   clamp(base() + (bonus.charisma ?? 0) + qBonus),
    luck:       clamp(base() + (bonus.luck ?? 0) + qBonus),
  };

  // Spike + flaw: one stat gets +3, a different one gets -3. Creates memorable
  // specialists instead of averaged-out crew — the navigator who can read the
  // stars but can't hold a fistfight, the brawler with a keen eye but no luck.
  const keys: (keyof CrewStats)[] = ['strength', 'perception', 'charisma', 'luck'];
  const spikeKey = pick(keys);
  const flawKey = pick(keys.filter(k => k !== spikeKey));
  stats[spikeKey] = clamp(stats[spikeKey] + 3);
  stats[flawKey]  = clamp(stats[flawKey]  - 3);

  return stats;
}

// Apply age-related decay: old hands trade strength for perception.
function applyAgeToStats(stats: CrewStats, age: number): CrewStats {
  const clamp = (v: number) => Math.max(1, Math.min(20, v));
  if (age >= 60) {
    return {
      ...stats,
      strength:   clamp(stats.strength - randInt(2, 3)),
      perception: clamp(stats.perception + 1),
    };
  }
  if (age >= 52) {
    return {
      ...stats,
      strength:   clamp(stats.strength - 1),
      perception: clamp(stats.perception + 1),
    };
  }
  return stats;
}

// ── Humour generation (historicized Big 5 personality) ──────────────────

// Role tendencies: what temperaments are drawn to each profession
const ROLE_HUMOUR_BIAS: Record<CrewRole, Partial<Record<HumourKey, number>>> = {
  Captain:   { choleric: 2, sanguine: 1 },
  Navigator: { melancholic: 2, curiosity: 2 },
  Gunner:    { choleric: 2, phlegmatic: 1 },
  Sailor:    { phlegmatic: 2, sanguine: 1 },
  Factor:    { sanguine: 2, curiosity: 1 },
  Surgeon:   { melancholic: 1, phlegmatic: 1, curiosity: 2 },
};

// Regional tendencies — stereotypes of the era (how Europeans and others perceived each other)
type RegionKey = 'european' | 'indian' | 'southeast_asian' | 'east_asian' | 'african';
const NAT_REGION: Record<Nationality, RegionKey> = {
  English: 'european', Portuguese: 'european', Dutch: 'european', Spanish: 'european', French: 'european', Danish: 'european',
  Mughal: 'indian', Gujarati: 'indian', Persian: 'indian', Ottoman: 'indian', Omani: 'indian',
  Swahili: 'african',
  Malay: 'southeast_asian', Acehnese: 'southeast_asian', Javanese: 'southeast_asian', Moluccan: 'southeast_asian', Siamese: 'southeast_asian',
  Japanese: 'east_asian', Chinese: 'east_asian',
};

const REGION_HUMOUR_BIAS: Record<RegionKey, Partial<Record<HumourKey, number>>> = {
  european:       { choleric: 1, curiosity: 1 },
  indian:         { phlegmatic: 1, sanguine: 1 },
  southeast_asian:{ sanguine: 1, phlegmatic: 1 },
  east_asian:     { melancholic: 1, phlegmatic: 1 },
  african:        { sanguine: 1, curiosity: 1 },
};

function rollHumours(role: CrewRole, nationality: Nationality, stats: CrewStats): Humours {
  const clamp = (v: number) => Math.max(1, Math.min(10, v));
  const base = () => randInt(2, 7);
  const roleBias = ROLE_HUMOUR_BIAS[role];
  const regionBias = REGION_HUMOUR_BIAS[NAT_REGION[nationality]] ?? {};

  // Stats influence humours slightly
  const statNudge = {
    sanguine: Math.floor((stats.charisma - 10) / 4),
    choleric: Math.floor((stats.strength - 10) / 4),
    melancholic: Math.floor((stats.perception - 10) / 4),
    phlegmatic: Math.floor((20 - stats.strength) / 6), // inverse of strength
    curiosity: Math.floor((stats.perception + stats.charisma - 20) / 6),
  };

  return {
    sanguine:    clamp(base() + (roleBias.sanguine ?? 0) + (regionBias.sanguine ?? 0) + statNudge.sanguine),
    choleric:    clamp(base() + (roleBias.choleric ?? 0) + (regionBias.choleric ?? 0) + statNudge.choleric),
    melancholic: clamp(base() + (roleBias.melancholic ?? 0) + (regionBias.melancholic ?? 0) + statNudge.melancholic),
    phlegmatic:  clamp(base() + (roleBias.phlegmatic ?? 0) + (regionBias.phlegmatic ?? 0) + statNudge.phlegmatic),
    curiosity:   clamp(base() + (roleBias.curiosity ?? 0) + (regionBias.curiosity ?? 0) + statNudge.curiosity),
  };
}

// ── Backstory generation ─────────────────────────────

const BACKSTORY_TEMPLATES: Record<CrewRole, string[]> = {
  Captain: [
    'Rose through the ranks after years commanding smaller vessels in the {region}.',
    'A veteran of {count} voyages, known for {trait} and an iron nerve.',
    'Earned a captain\'s commission after a daring exploit near {place}.',
    'Comes from a family of mariners in {place}. Has sailed these waters since youth.',
    'Once served aboard a {nationality} warship before taking up the merchant trade.',
  ],
  Navigator: [
    'Learned celestial navigation from {nationality} masters in {place}.',
    'Can read the stars and currents like a book. Trained in {place}.',
    'Served as pilot on three previous voyages through the Indian Ocean.',
    'A quiet scholar of charts and tides, born in {place}.',
    'Self-taught navigator who learned the monsoon winds by bitter experience.',
  ],
  Gunner: [
    'Served as a gunner\'s mate aboard a {nationality} man-of-war.',
    'Learned powder and shot in the arsenals of {place}.',
    'A steady hand with a cannon. Survived two engagements at sea.',
    'Fled military service in {place} and took to merchant vessels.',
    'Known for cool nerves under fire. Has the scars to prove it.',
  ],
  Sailor: [
    'Signed on at the docks of {place}, seeking fortune overseas.',
    'A common seaman with strong arms and no complaints.',
    'Has worked the rigging since the age of twelve in {place}.',
    'Drifted between ships across the Indian Ocean for years.',
    'Quiet but reliable. The other hands respect the work.',
  ],
  Factor: [
    'Trained as a merchant\'s apprentice in the counting-houses of {place}.',
    'Speaks three languages and knows the price of pepper in every port.',
    'A shrewd negotiator. Previously traded on behalf of {nationality} merchants.',
    'Has contacts in ports from {place} to the Spice Islands.',
    'A keen eye for quality goods and a silver tongue at the bargaining table.',
  ],
  Surgeon: [
    'Studied medicine in {place} before shipping out for better pay.',
    'A barber-surgeon who learned anatomy through hard experience at sea.',
    'Carries a worn medical chest and a knowledge of tropical fevers.',
    'Trained under {nationality} physicians. Knows herbs and remedies from many lands.',
    'Quietly competent. Has saved more lives than most captains have lost.',
  ],
};

const REGION_NAMES = ['Indian Ocean', 'Arabian Sea', 'Bay of Bengal', 'South China Sea', 'Strait of Malacca', 'East African coast', 'Red Sea'];
const TRAIT_ADJECTIVES = ['steady judgment', 'bold tactics', 'careful planning', 'shrewd diplomacy', 'fierce loyalty', 'relentless ambition'];

// Personality sentences keyed to dominant humour
const HUMOUR_CHARACTER_LINES: Record<HumourKey, string[]> = {
  sanguine: [
    'Quick to laugh and generous with drink, a welcome presence in any company.',
    'Possesses an easy warmth that puts strangers at ease.',
    'Known for an infectious good humor that lifts the spirits of those nearby.',
    'A sociable soul who collects friends as readily as some collect debts.',
    'Rarely without a smile, even in difficult circumstances.',
  ],
  choleric: [
    'Driven by a restless energy that tolerates neither delay nor half-measures.',
    'Possessed of a fierce will that brooks little argument.',
    'Ambitious and impatient, always pushing for the next advantage.',
    'A hard taskmaster, but one who demands no less of himself.',
    'Hot-tempered when provoked, but channels that fire into action.',
  ],
  melancholic: [
    'Given to long silences and careful observation of the world around him.',
    'A brooding temperament, prone to solitary reflection.',
    'Sees what others miss, though the seeing sometimes weighs on him.',
    'Cautious and deliberate, trusting experience over optimism.',
    'Carries a quiet gravity that commands respect without raising his voice.',
  ],
  phlegmatic: [
    'Steady as the tides and about as easily provoked.',
    'A calming presence aboard ship, rarely troubled by what alarms others.',
    'Patient and methodical, preferring routine to improvisation.',
    'Loyal to the bone, once trust is given it is not easily withdrawn.',
    'Content to do his duty without complaint or fanfare.',
  ],
  curiosity: [
    'Fascinated by foreign customs, forever asking questions of strangers.',
    'Collects words in other tongues the way a magpie collects bright things.',
    'Drawn to the unfamiliar, happiest when learning something new.',
    'Studies the natural world with the eye of a self-taught philosopher.',
    'Adapts to foreign ports more readily than most, finding wonder where others find only strangeness.',
  ],
};

// Incident sentences keyed to role + stat highlights
type IncidentSet = {
  high_luck: string[]; high_charisma: string[]; high_strength: string[]; high_perception: string[];
  low_luck: string[]; low_charisma: string[]; low_strength: string[]; low_perception: string[];
  default: string[];
};
const INCIDENT_LINES: Record<CrewRole, IncidentSet> = {
  Captain: {
    high_luck: ['Once narrowly escaped a shipwreck that claimed two other vessels.', 'Survived a mutiny through an extraordinary stroke of fortune.'],
    high_charisma: ['Talked down a hostile port garrison with nothing but words and nerve.', 'Once convinced a pirate captain to release his ship without a shot fired.'],
    high_strength: ['Personally led a boarding action that decided a battle at sea.', 'Hauled a drowning man from the sea in a storm that should have killed them both.'],
    high_perception: ['Spotted a hidden reef that would have torn the hull apart.', 'Noticed the signs of a coming storm a full day before it struck.'],
    low_luck: ['Has buried two ships already; the factors in Surat mutter when his name is entered in the ledger.'],
    low_charisma: ['Struggles to hold the quarterdeck — more than one hand has walked off the moment shore was sighted.'],
    low_strength: ['A soft body for the work; leaves the rough of it to the mates and tires quickly at the pumps.'],
    low_perception: ['Has run aground twice in charted waters, and once blamed the pilot for it.'],
    default: ['Has weathered more than one crisis of command at sea.', 'Carries the quiet confidence of a man who has faced the worst and endured.'],
  },
  Navigator: {
    high_luck: ['Once found a passage through uncharted waters that saved the entire voyage.'],
    high_charisma: ['Learned secret routes from a local pilot through patient friendship.'],
    high_strength: ['Swam to shore through heavy surf to take bearings when the ship could not approach.'],
    high_perception: ['Can determine latitude by starlight alone with uncanny accuracy.'],
    low_luck: ['Last voyage put his ship on a reef off Socotra; still blames the chart.'],
    low_charisma: ['Keeps to himself and to his rutter; the mates find his silences unnerving rather than wise.'],
    low_strength: ['Thin and ink-stained; of little use when the ship needs hands more than heads.'],
    low_perception: ['His reckonings wander by leagues in a week, though he will not admit as much.'],
    default: ['Has guided ships safely through waters that have wrecked lesser navigators.'],
  },
  Gunner: {
    high_luck: ['Survived an explosion in the powder magazine that killed three others.'],
    high_charisma: ['Keeps the gun crew loyal and sharp through rough humour and steady praise.'],
    high_strength: ['Can single-handedly shift a cannon that normally requires four men.'],
    high_perception: ['Landed a shot on a distant target that seasoned gunners called impossible.'],
    low_luck: ['Lost two fingers to a burst breech and expects the third any day now.'],
    low_charisma: ['Snaps at the powder boys and quarrels with the mates; no one volunteers to serve his gun.'],
    low_strength: ['Run-down and short-winded; struggles to run out a nine-pounder without a mate\'s help.'],
    low_perception: ['Wastes powder at ranges no seasoned gunner would attempt.'],
    default: ['Has seen action enough to know the cost of both good and poor gunnery.'],
  },
  Sailor: {
    high_luck: ['Fell from the rigging in a storm and landed in the sea, only to be hauled back alive.'],
    high_charisma: ['The other hands look to him when spirits are low.'],
    high_strength: ['Can climb the mainmast faster than any man aboard.'],
    high_perception: ['Has a gift for reading the wind before it shifts.'],
    low_luck: ['Has been flogged on three ships and shipwrecked on a fourth; bad fortune follows him aboard.'],
    low_charisma: ['Slow to speak and quick to sulk; the watch keeps him at arm\'s length.'],
    low_strength: ['Scrawny and slow at the halyards; better kept off the yards in a blow.'],
    low_perception: ['Sleeps through his watch as often as not, and misses the hail when he doesn\'t.'],
    default: ['An experienced hand who knows the ways of rope and canvas.'],
  },
  Factor: {
    high_luck: ['Once bought a cargo of indigo at a pittance that later tripled in value.'],
    high_charisma: ['Has contacts in ports spanning three oceans.'],
    high_strength: ['Survived a robbery in a foreign port by fighting off the assailants.'],
    high_perception: ['Can spot adulterated spices by smell alone.'],
    low_luck: ['Lost his last master\'s capital to a Gujarati broker and fled the consequences by sea.'],
    low_charisma: ['Gives offence without meaning to; haggles badly and takes it personally.'],
    low_strength: ['A soft merchant\'s body that has never shifted a bale without help.'],
    low_perception: ['Has been cheated on weights and measures more than once, and will be again.'],
    default: ['Has a merchant\'s instinct for where profit lies and where danger hides.'],
  },
  Surgeon: {
    high_luck: ['Once cured a fever with a remedy he mixed by guesswork, having lost his medical chest overboard.'],
    high_charisma: ['Has a bedside manner that reassures even the most frightened patient.'],
    high_strength: ['Performed an amputation at sea in heavy weather without losing his footing or the patient.'],
    high_perception: ['Diagnoses ailments with an almost uncanny swiftness.'],
    low_luck: ['Has buried more patients than he has saved, by the crew\'s reckoning.'],
    low_charisma: ['Brusque and bitter at the bedside; men prefer the bottle to his care.'],
    low_strength: ['Hands shake at the amputation saw, and the work shows it.'],
    low_perception: ['Mistakes one fever for another and dosing accordingly, with uneven results.'],
    default: ['Has treated enough wounds and fevers to know that nature is the true physician.'],
  },
};

function generateBackstory(role: CrewRole, nationality: Nationality, birthplace: string, age: number, quality: CrewQuality, humours: Humours, stats: CrewStats, archetype: Archetype | null = null): string {
  // 1. Origin sentence (role template)
  const templates = BACKSTORY_TEMPLATES[role];
  let origin = pick(templates);
  origin = origin.replace('{place}', birthplace);
  origin = origin.replace('{nationality}', nationality);
  origin = origin.replace('{region}', pick(REGION_NAMES));
  origin = origin.replace('{count}', randInt(3, 12).toString());
  origin = origin.replace('{trait}', pick(TRAIT_ADJECTIVES));

  // 2. Character sentence (dominant humour)
  const humourEntries: [HumourKey, number][] = [
    ['sanguine', humours.sanguine], ['choleric', humours.choleric],
    ['melancholic', humours.melancholic], ['phlegmatic', humours.phlegmatic],
    ['curiosity', humours.curiosity],
  ];
  humourEntries.sort((a, b) => b[1] - a[1]);
  const dominant = humourEntries[0][0];
  const character = pick(HUMOUR_CHARACTER_LINES[dominant]);

  // 3. Incident sentence — high-stat feat for competent tiers, low-stat blemish for poor tiers.
  const incidents = INCIDENT_LINES[role];
  const isLowTier  = quality === 'disaster' || quality === 'dud' || quality === 'untried';
  const isHighTier = quality === 'legendary' || quality === 'renowned' || quality === 'seasoned';
  let incident = '';
  if (isLowTier) {
    // Lowest *role-relevant* stat drives the blemish; disaster/dud always get one, untried sometimes.
    const show = quality === 'disaster' || quality === 'dud' || Math.random() < 0.6;
    if (show) {
      const lowest = Math.min(stats.strength, stats.perception, stats.charisma, stats.luck);
      if (stats.luck === lowest && stats.luck <= 8) incident = pick(incidents.low_luck);
      else if (stats.charisma === lowest && stats.charisma <= 8) incident = pick(incidents.low_charisma);
      else if (stats.strength === lowest && stats.strength <= 8) incident = pick(incidents.low_strength);
      else if (stats.perception === lowest && stats.perception <= 8) incident = pick(incidents.low_perception);
      else incident = pick(incidents.default);
    }
  } else if (isHighTier || Math.random() < 0.4) {
    const highest = Math.max(stats.strength, stats.perception, stats.charisma, stats.luck);
    if (stats.luck === highest && stats.luck >= 12) incident = pick(incidents.high_luck);
    else if (stats.charisma === highest && stats.charisma >= 12) incident = pick(incidents.high_charisma);
    else if (stats.strength === highest && stats.strength >= 12) incident = pick(incidents.high_strength);
    else if (stats.perception === highest && stats.perception >= 12) incident = pick(incidents.high_perception);
    else incident = pick(incidents.default);
  }

  // Combine — archetype sentence comes first, as the shaping life event.
  const archetypeLine = archetype ? pick(archetype.backstoryPrefix) : '';
  let text = archetypeLine ? archetypeLine + ' ' + origin + ' ' + character : origin + ' ' + character;
  if (incident) text += ' ' + incident;

  // Tier suffix — closing note keyed to quality.
  const tierSuffix: Partial<Record<CrewQuality, string>> = {
    legendary: ' Spoken of with reverence by those who\'ve sailed with them.',
    renowned:  ' A name the factors know in every port from Aden to Malacca.',
    seasoned:  ' The kind of hand you hope to find when the weather turns.',
    able:      ' Solid work, steadily done — the sort a voyage is built on.',
    untried:   ' Still green; the voyage itself will be the making or breaking of him.',
    dud:       ' Though somewhat unreliable, they were the best available.',
    disaster:  ' Signed on only because no one else would — a liability, plainly.',
  };
  if (tierSuffix[quality]) text += tierSuffix[quality];

  return text;
}

// ── Public API ─────────────────────────────────────────

/** Generate a single crew member of a given nationality and role. */
export function generateCrewMember(
  nationality: Nationality,
  role: CrewRole,
  hireDay: number = 0,
): CrewMember {
  const pool = NAME_POOLS[nationality];
  const first = pick(pool.first);
  const last = pick(pool.last);
  const [minSkill, maxSkill] = SKILL_RANGE[role];
  const skill = randInt(minSkill, maxSkill);

  // Base morale: widened from the old 45-85 band so new hires cover a
  // realistic range from the broken-in-spirit to the eager. Archetype shift
  // and final clamp happen after.
  const baseMorale = randInt(30, 90);
  const quality = rollCrewQuality(skill, baseMorale);

  // Archetype roll — ~25% of crew carry a life-shaping backstory archetype.
  const archetype = rollArchetype(role);
  const morale = Math.max(10, Math.min(98, baseMorale + (archetype?.moraleShift ?? 0)));

  const age = rollAge(role, quality, archetype);
  const birthplace = pick(pool.birthplaces);

  // Stats: base roll → spike/flaw → archetype nudge → age decay.
  let stats = rollStats(role, quality);
  stats = applyArchetypeStats(stats, archetype);
  stats = applyAgeToStats(stats, age);

  // Humours: base roll → archetype nudge.
  let humours = rollHumours(role, nationality, stats);
  humours = applyArchetypeHumours(humours, archetype);

  // Languages — archetype may add a contact language (nobles, merchants,
  // scholars, converts all tend to pick up a second tongue through class or travel).
  let languages = rollLanguages(nationality, role, stats, quality);
  if (archetype?.addLanguage) {
    const contacts = CONTACT_LANGUAGES[nationality] ?? [];
    const unused = contacts.filter(l => !languages.includes(l));
    if (unused.length) languages = [...languages, pick(unused)];
  }

  const backstory = generateBackstory(role, nationality, birthplace, age, quality, humours, stats, archetype);

  // Randomize starting level (1-3) with weighted distribution
  // Higher quality and older crew are more likely to be experienced
  const levelRoll = Math.random();
  const ageBonus = age > 35 ? 0.15 : age > 25 ? 0.05 : 0;
  const qualityBonus =
      quality === 'legendary' ?  0.30
    : quality === 'renowned'  ?  0.22
    : quality === 'seasoned'  ?  0.15
    : quality === 'able'      ?  0.05
    : quality === 'untried'   ? -0.10
    : quality === 'dud'       ? -0.18
    : quality === 'disaster'  ? -0.28
    : 0;
  const lvl3Chance = 0.1 + ageBonus + qualityBonus;
  const lvl2Chance = 0.3 + ageBonus + qualityBonus;
  const startLevel = levelRoll < lvl3Chance ? 3 : levelRoll < lvl3Chance + lvl2Chance ? 2 : 1;
  // XP toward next level — random progress
  const xpToNext = startLevel === 1 ? 100 : startLevel === 2 ? 150 : 225;
  const xp = randInt(0, Math.floor(xpToNext * 0.7));
  // Skill bump for higher starting levels
  const levelSkillBonus = (startLevel - 1) * randInt(2, 4);

  return {
    id: generateId(),
    name: `${first} ${last}`,
    role,
    skill: Math.min(100, skill + levelSkillBonus),
    morale,
    age,
    nationality,
    languages,
    birthplace,
    health: 'healthy' as HealthFlag,
    quality,
    stats,
    humours,
    backstory,
    history: [{ day: hireDay, event: `Joined the crew as ${role}` }],
    hireDay,
    traits: [],
    abilities: [],
    level: startLevel,
    xp,
    xpToNext,
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

  // Captain is always from the faction, starts with Silver Tongue trait
  const captain = generateCrewMember(factionFlag, 'Captain');
  captain.traits = ['Silver Tongue'];
  crew.push(captain);

  // Assign officer roles first, then fill with sailors
  const officerRoles: CrewRole[] = ['Navigator', 'Gunner', 'Factor'];
  const remaining = crewSize - 1;

  for (let i = 0; i < remaining; i++) {
    const role = i < officerRoles.length ? officerRoles[i] : 'Sailor';
    const nat = weightedPick(mix);
    crew.push(generateCrewMember(nat, role));
  }

  // Ensure captain is always the highest level in the group
  const maxCrewLevel = Math.max(...crew.filter(c => c.role !== 'Captain').map(c => c.level));
  if (captain.level < maxCrewLevel) {
    captain.level = maxCrewLevel + (Math.random() < 0.5 ? 1 : 0);
    if (captain.level > 3) captain.level = 3;
    captain.xpToNext = captain.level === 1 ? 100 : captain.level === 2 ? 150 : 225;
    captain.xp = randInt(0, Math.floor(captain.xpToNext * 0.7));
    captain.skill = Math.min(100, captain.skill + (captain.level - 1) * randInt(2, 4));
  } else if (captain.level === maxCrewLevel && Math.random() < 0.7) {
    // Give captain more XP progress if tied
    captain.xp = Math.max(captain.xp, randInt(Math.floor(captain.xpToNext * 0.4), Math.floor(captain.xpToNext * 0.8)));
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
