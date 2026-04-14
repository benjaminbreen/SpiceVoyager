import { Nationality, CrewMember, CrewRole, CrewQuality, CrewStats, HealthFlag, Language } from '../store/gameStore';

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
  const qualityBonus = quality === 'legendary' ? 0.24 : quality === 'rare' ? 0.12 : 0;

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
// The percentile thresholds match the loot tier distribution:
//   bottom 20% = dud, middle 70% = normal, top 10% = rare, top 1% = legendary.
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

  if (roll >= 0.99) return 'legendary';
  if (roll >= 0.90) return 'rare';
  if (roll < 0.20) return 'dud';
  return 'normal';
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
  dud: -2, normal: 0, rare: 2, legendary: 4,
};

function rollStats(role: CrewRole, quality: CrewQuality): CrewStats {
  const base = () => randInt(5, 14); // base roll 5-14
  const bonus = ROLE_STAT_BONUS[role];
  const qBonus = QUALITY_STAT_BONUS[quality];

  const clamp = (v: number) => Math.max(1, Math.min(20, v));
  return {
    strength:   clamp(base() + (bonus.strength ?? 0) + qBonus),
    perception: clamp(base() + (bonus.perception ?? 0) + qBonus),
    charisma:   clamp(base() + (bonus.charisma ?? 0) + qBonus),
    luck:       clamp(base() + (bonus.luck ?? 0) + qBonus),
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

function generateBackstory(role: CrewRole, nationality: Nationality, birthplace: string, age: number, quality: CrewQuality): string {
  const templates = BACKSTORY_TEMPLATES[role];
  let text = pick(templates);

  text = text.replace('{place}', birthplace);
  text = text.replace('{nationality}', nationality);
  text = text.replace('{region}', pick(REGION_NAMES));
  text = text.replace('{count}', randInt(3, 12).toString());
  text = text.replace('{trait}', pick(TRAIT_ADJECTIVES));

  // Add quality flavor
  if (quality === 'legendary') {
    text += ' Spoken of with reverence by those who\'ve sailed with them.';
  } else if (quality === 'rare') {
    text += ' Has a reputation that precedes them in many ports.';
  } else if (quality === 'dud') {
    text += ' Though somewhat unreliable, they were the best available.';
  }

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
  const morale = randInt(65, 100);
  const age = randInt(role === 'Captain' ? 32 : 18, role === 'Captain' ? 55 : 50);
  const birthplace = pick(pool.birthplaces);
  const quality = rollCrewQuality(skill, morale);
  const stats = rollStats(role, quality);
  const backstory = generateBackstory(role, nationality, birthplace, age, quality);

  return {
    id: generateId(),
    name: `${first} ${last}`,
    role,
    skill,
    morale,
    age,
    nationality,
    languages: rollLanguages(nationality, role, stats, quality),
    birthplace,
    health: 'healthy' as HealthFlag,
    quality,
    stats,
    backstory,
    history: [{ day: hireDay, event: `Joined the crew as ${role}` }],
    hireDay,
    traits: [],
    abilities: [],
    level: 1,
    xp: 0,
    xpToNext: 100,
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
