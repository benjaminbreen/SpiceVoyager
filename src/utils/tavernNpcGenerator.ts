// ── Tavern NPC Generator ──
//
// Generates 1-5 strangers for a tavern visit. The player sees physical
// descriptions only — names and roles are revealed through conversation.
// Each NPC has a knowledge domain that determines what they can teach.

import type { Nationality, Port } from '../store/gameStore';
import { PORT_FACTION } from '../store/gameStore';
import type { Commodity } from './commodities';
import { COMMODITY_DEFS, ALL_COMMODITIES } from './commodities';
import { CREW_KNOWLEDGE_DOMAINS } from './knowledgeSystem';
import { tavernNpcToPortraitConfig, type PortraitConfig } from './portraitConfig';

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }

// ── Appearance fragments by gender and region ──

const MALE_BUILDS = [
  'a heavyset', 'a wiry', 'a tall', 'a short', 'a broad-shouldered',
  'an elderly', 'a young', 'a weathered', 'a gaunt', 'a stout',
];

const FEMALE_BUILDS = [
  'a tall', 'a slight', 'an elderly', 'a young', 'a sharp-eyed',
  'a stout', 'a graceful', 'a weathered',
];

// Clothing and appearance details by nationality group
const APPEARANCE_DETAILS: Record<string, string[]> = {
  european: [
    'in a salt-stained doublet',
    'wearing a battered felt hat',
    'with ink-stained fingers',
    'in a threadbare coat with brass buttons',
    'with a sun-reddened face and calloused hands',
    'wearing a patched linen shirt, sleeves rolled up',
    'with a clay pipe clenched between his teeth',
  ],
  south_asian: [
    'in a white cotton dhoti',
    'wearing a fine silk turban',
    'with henna-stained hands',
    'in a merchants embroidered vest',
    'wearing a simple kurta and prayer beads',
    'with kohl-lined eyes and gold earrings',
    'in indigo-dyed cloth that marks him as a trader',
  ],
  east_african: [
    'in a kanzu of white cotton',
    'wearing a kofia cap',
    'with carved ivory bracelets',
    'in flowing dark robes',
    'with a curved dagger at his belt',
    'wearing a striped kikoi wrapped at the waist',
  ],
  southeast_asian: [
    'in a sarong of batik cloth',
    'with a keris tucked into his sash',
    'wearing a songkok cap',
    'in a loose cotton baju',
    'with betel-stained teeth and bright eyes',
    'with tattoos marking his arms and chest',
  ],
  arab_persian: [
    'in a flowing white thawb',
    'wearing a wound turban',
    'with an amber-bead rosary in his hands',
    'in dark robes trimmed with silver thread',
    'with a neatly oiled beard and sharp eyes',
    'wearing a richly embroidered vest over cotton',
  ],
  chinese_japanese: [
    'in a silk changshan',
    'wearing a round scholar\'s cap',
    'with a jade pendant at his neck',
    'in a plain cotton robe, hands folded',
    'with a long queue braid and calm expression',
    'in dark silk with subtle patterns',
  ],
};

// What they're doing when you first see them
const IDLE_ACTIONS = [
  'staring into his cup',
  'watching the doorway',
  'speaking quietly to the barkeep',
  'examining a small pouch of something',
  'tracing patterns on the table with one finger',
  'eating dried fish and flatbread',
  'counting coins on the table',
  'sitting alone in the corner',
  'warming his hands around a cup',
  'watching the harbor through the window',
  'listening to the conversation at the next table',
  'nursing a drink in silence',
];

const FEMALE_IDLE_ACTIONS = [
  'watching the harbor through the window',
  'speaking quietly with a companion',
  'examining the contents of a cloth bundle',
  'drinking tea in silence',
  'sorting through a pouch of dried herbs',
  'studying a scrap of paper by lamplight',
  'listening to everything, saying nothing',
];

// ── NPC Roles ──
// Determines what they know and how they talk

export interface TavernNpcRole {
  title: string;           // "merchant", "sailor", "physician" — revealed in conversation
  knowledgeDomain: Commodity[];  // what goods they can identify
  conversationTopics: string[];  // what they might bring up
}

const NPC_ROLES: Record<string, TavernNpcRole> = {
  spice_merchant: {
    title: 'spice merchant',
    knowledgeDomain: ['Black Pepper', 'Cinnamon', 'Cardamom', 'Cloves', 'Nutmeg', 'Ginger', 'Saffron'],
    conversationTopics: ['spice prices', 'trade routes', 'the monsoon', 'competing merchants'],
  },
  drug_trader: {
    title: 'apothecary',
    knowledgeDomain: ['Opium', 'Camphor', 'Benzoin', 'Rhubarb', 'China Root', 'Cassia Fistula', 'Quicksilver', 'Bezoar Stones'],
    conversationTopics: ['medicinal uses', 'adulteration', 'cures', 'Galenic humors'],
  },
  incense_dealer: {
    title: 'incense trader',
    knowledgeDomain: ['Frankincense', 'Myrrh', 'Aloes', 'Musk', 'Benzoin', 'Camphor'],
    conversationTopics: ['religious uses', 'Arabian trade', 'quality grading', 'temple markets'],
  },
  textile_factor: {
    title: 'factor',
    knowledgeDomain: ['Cotton Textiles', 'Indigo', 'Sugar', 'Iron', 'Ivory'],
    conversationTopics: ['cloth quality', 'dyeing techniques', 'the Gujarat trade', 'bulk cargo'],
  },
  sailor: {
    title: 'sailor',
    knowledgeDomain: ['Tobacco', 'Coffee', 'Tea'],
    conversationTopics: ['the sea', 'pirates', 'storms', 'distant ports', 'shipwrecks'],
  },
  naturalist: {
    title: 'naturalist',
    knowledgeDomain: ['Rhubarb', 'China Root', 'Cassia Fistula', 'Camphor', 'Opium', 'Bezoar Stones', 'Mumia', 'Lapis de Goa'],
    conversationTopics: ['natural philosophy', 'the materia medica', 'classification', 'new discoveries'],
  },
  pearl_diver: {
    title: 'pearl diver',
    knowledgeDomain: ['Pearls', 'Red Coral', 'Ambergris'],
    conversationTopics: ['the sea floor', 'diving', 'the pearl banks', 'currents'],
  },
  coffee_merchant: {
    title: 'coffee trader',
    knowledgeDomain: ['Coffee', 'Frankincense', 'Myrrh'],
    conversationTopics: ['Mocha', 'the coffee houses', 'Sufi ritual', 'Ethiopian origins'],
  },
  ivory_trader: {
    title: 'ivory trader',
    knowledgeDomain: ['Ivory', 'Ambergris', "Dragon's Blood", 'Aloes'],
    conversationTopics: ['the interior', 'elephant herds', 'the gold trade', 'Kilwa'],
  },
  soldier: {
    title: 'soldier',
    knowledgeDomain: ['Tobacco'],
    conversationTopics: ['the garrison', 'fortifications', 'local politics', 'pay', 'the war'],
  },
};

// Which roles are common at which kinds of ports
const PORT_ROLE_WEIGHTS: Record<string, string[]> = {
  calicut:  ['spice_merchant', 'spice_merchant', 'drug_trader', 'textile_factor', 'sailor'],
  goa:      ['soldier', 'naturalist', 'drug_trader', 'spice_merchant', 'sailor', 'textile_factor'],
  surat:    ['textile_factor', 'textile_factor', 'drug_trader', 'spice_merchant', 'sailor'],
  hormuz:   ['pearl_diver', 'incense_dealer', 'spice_merchant', 'soldier', 'sailor'],
  malacca:  ['spice_merchant', 'spice_merchant', 'drug_trader', 'sailor', 'textile_factor'],
  bantam:   ['spice_merchant', 'spice_merchant', 'sailor', 'drug_trader'],
  macau:    ['drug_trader', 'naturalist', 'spice_merchant', 'sailor', 'textile_factor'],
  aden:     ['coffee_merchant', 'incense_dealer', 'sailor', 'soldier'],
  muscat:   ['pearl_diver', 'incense_dealer', 'sailor', 'soldier'],
  zanzibar: ['ivory_trader', 'ivory_trader', 'sailor', 'incense_dealer'],
  mombasa:  ['ivory_trader', 'sailor', 'soldier', 'incense_dealer'],
  socotra:  ['sailor', 'sailor', 'incense_dealer'],
  cochin:   ['spice_merchant', 'drug_trader', 'sailor', 'textile_factor'],
  diu:      ['textile_factor', 'soldier', 'drug_trader', 'sailor'],
  aceh:     ['spice_merchant', 'drug_trader', 'sailor'],
  mocha:    ['coffee_merchant', 'coffee_merchant', 'incense_dealer', 'sailor'],
  lisbon:   ['naturalist', 'soldier', 'drug_trader', 'spice_merchant', 'sailor', 'textile_factor'],
  amsterdam:['spice_merchant', 'spice_merchant', 'sailor', 'naturalist', 'textile_factor'],
  seville:  ['soldier', 'sailor', 'drug_trader', 'textile_factor'],
  london:   ['naturalist', 'sailor', 'spice_merchant', 'drug_trader'],
  elmina:   ['soldier', 'sailor', 'ivory_trader'],
  luanda:   ['soldier', 'sailor'],
  salvador: ['sailor', 'drug_trader', 'textile_factor'],
  havana:   ['soldier', 'soldier', 'sailor'],
  cartagena:['soldier', 'drug_trader', 'sailor'],
  cape:     ['sailor', 'sailor'],
};

// Nationalities likely to be found in each port's tavern
const PORT_TAVERN_NATIONALITIES: Record<string, Nationality[]> = {
  calicut:  ['Gujarati', 'Portuguese', 'Malay', 'Ottoman', 'English', 'Chinese'],
  goa:      ['Portuguese', 'Gujarati', 'English', 'Dutch', 'Mughal', 'Japanese'],
  surat:    ['Gujarati', 'Mughal', 'Portuguese', 'English', 'Dutch', 'Ottoman', 'Persian'],
  hormuz:   ['Persian', 'Portuguese', 'Ottoman', 'Gujarati', 'Omani'],
  malacca:  ['Malay', 'Chinese', 'Portuguese', 'Gujarati', 'Japanese', 'Javanese'],
  bantam:   ['Javanese', 'English', 'Dutch', 'Malay', 'Chinese', 'Gujarati'],
  macau:    ['Chinese', 'Portuguese', 'Japanese', 'Malay'],
  aden:     ['Ottoman', 'Gujarati', 'Swahili', 'Portuguese', 'Omani'],
  muscat:   ['Omani', 'Persian', 'Portuguese', 'Gujarati', 'Swahili'],
  zanzibar: ['Swahili', 'Portuguese', 'Gujarati', 'Omani'],
  mombasa:  ['Swahili', 'Portuguese', 'Omani', 'Gujarati'],
  socotra:  ['Portuguese', 'Omani', 'Swahili'],
  cochin:   ['Portuguese', 'Gujarati', 'Dutch', 'Malay'],
  diu:      ['Portuguese', 'Gujarati', 'Mughal', 'Ottoman'],
  aceh:     ['Acehnese', 'Gujarati', 'Ottoman', 'Malay', 'Portuguese'],
  mocha:    ['Ottoman', 'Gujarati', 'Swahili', 'Portuguese', 'Omani'],
  lisbon:   ['Portuguese', 'Spanish', 'English', 'Dutch', 'French'],
  amsterdam:['Dutch', 'English', 'Portuguese', 'Danish', 'French'],
  seville:  ['Spanish', 'Portuguese', 'French', 'English'],
  london:   ['English', 'Dutch', 'Portuguese', 'French', 'Danish'],
  elmina:   ['Portuguese', 'Dutch', 'English'],
  luanda:   ['Portuguese', 'Spanish'],
  salvador: ['Portuguese', 'Spanish', 'Dutch'],
  havana:   ['Spanish', 'Portuguese', 'English'],
  cartagena:['Spanish', 'Portuguese', 'English'],
  cape:     ['Portuguese', 'Dutch', 'English'],
};

function getNationalityGroup(nat: Nationality): string {
  if (['English', 'Portuguese', 'Dutch', 'Spanish', 'French', 'Danish'].includes(nat)) return 'european';
  if (['Mughal', 'Gujarati'].includes(nat)) return 'south_asian';
  if (['Swahili'].includes(nat)) return 'east_african';
  if (['Malay', 'Acehnese', 'Javanese', 'Moluccan', 'Siamese'].includes(nat)) return 'southeast_asian';
  if (['Ottoman', 'Omani', 'Persian'].includes(nat)) return 'arab_persian';
  if (['Chinese', 'Japanese'].includes(nat)) return 'chinese_japanese';
  return 'european';
}

// ── Name generation (minimal, from crewGenerator patterns) ──

const FIRST_NAMES: Partial<Record<Nationality, { male: string[]; female: string[] }>> = {
  English:    { male: ['Thomas', 'William', 'John', 'Edward', 'Richard', 'Henry', 'James', 'Samuel'], female: ['Mary', 'Elizabeth', 'Anne', 'Margaret'] },
  Portuguese: { male: ['Rodrigo', 'Fernão', 'Afonso', 'Pedro', 'Diogo', 'Manuel', 'António', 'Luís'], female: ['Maria', 'Ana', 'Isabel', 'Leonor'] },
  Dutch:      { male: ['Willem', 'Jan', 'Pieter', 'Cornelis', 'Hendrik', 'Dirk', 'Jacob'], female: ['Johanna', 'Catharina', 'Maria'] },
  Spanish:    { male: ['Diego', 'Juan', 'Pedro', 'Miguel', 'Francisco', 'Gonzalo', 'Sebastián'], female: ['Juana', 'María', 'Isabel'] },
  French:     { male: ['Jacques', 'Pierre', 'Jean', 'François', 'Antoine', 'Charles'], female: ['Marie', 'Jeanne', 'Catherine'] },
  Danish:     { male: ['Ove', 'Erik', 'Lars', 'Jens', 'Niels', 'Søren'], female: ['Kirsten', 'Anna'] },
  Gujarati:   { male: ['Virji', 'Mohan', 'Govind', 'Rajan', 'Kanji', 'Narayan', 'Devji', 'Premji'], female: ['Lakshmi', 'Devi', 'Ratan'] },
  Mughal:     { male: ['Mirza', 'Khwaja', 'Asaf', 'Qasim', 'Yusuf', 'Ibrahim'], female: ['Nur', 'Jahanara'] },
  Persian:    { male: ['Abbas', 'Hossein', 'Reza', 'Rostam', 'Farhad', 'Dariush'], female: ['Parisa', 'Shirin'] },
  Ottoman:    { male: ['Mehmed', 'Süleyman', 'Osman', 'Yusuf', 'Mustafa', 'Hasan'], female: ['Fatima', 'Ayşe'] },
  Omani:      { male: ['Salim', 'Rashid', 'Said', 'Hamad', 'Nasir', 'Abdullah'], female: ['Khadija', 'Maryam'] },
  Swahili:    { male: ['Bakari', 'Hamisi', 'Juma', 'Mwinyi', 'Rashidi', 'Selemani'], female: ['Mwana', 'Zainab', 'Khadija', 'Bi'] },
  Malay:      { male: ['Ahmad', 'Ibrahim', 'Iskandar', 'Tengku', 'Hang', 'Laksamana'], female: ['Siti', 'Aminah'] },
  Chinese:    { male: ['Lim', 'Chen', 'Wang', 'Zhang', 'Li', 'Huang'], female: ['Mei', 'Lan', 'Xiu'] },
  Japanese:   { male: ['Tanaka', 'Yamamoto', 'Nakamura', 'Takeda', 'Watanabe'], female: ['Yuki', 'Hana'] },
  Javanese:   { male: ['Raden', 'Kyai', 'Adipati', 'Tumenggung', 'Demang'], female: ['Ratu', 'Nyi'] },
  Acehnese:   { male: ['Teuku', 'Cut', 'Abdullah', 'Ibrahim', 'Iskandar'], female: ['Cut', 'Putri'] },
  Moluccan:   { male: ['Sultan', 'Kaicili', 'Babu', 'Nuku'], female: ['Boki'] },
  Siamese:    { male: ['Somchai', 'Prasert', 'Chai', 'Narong'], female: ['Mali', 'Siri'] },
};

// ── Public types ──

export interface TavernNpc {
  id: string;
  nationality: Nationality;
  name: string;
  isFemale: boolean;
  appearance: string;       // what you see: "A heavyset Chinese man in fine silk"
  idleAction: string;       // what they're doing: "staring into his cup"
  role: TavernNpcRole;
  revealed: boolean;        // has the player talked to them?
  willApproach: boolean;    // will they approach if you buy a drink?
  approachLine: string;     // what they say when they approach
  portraitConfig: PortraitConfig; // procedural portrait data
}

export function generateTavernNpcs(port: Port, timeOfDay: number): TavernNpc[] {
  const portId = port.id;

  // 1-5 NPCs, weighted toward 2-3. Fewer late at night, more in evening.
  const isEvening = timeOfDay >= 17 || timeOfDay < 6;
  const isDay = timeOfDay >= 8 && timeOfDay < 17;
  const baseCount = isEvening ? randInt(2, 5) : isDay ? randInt(1, 3) : randInt(1, 2);
  const count = Math.min(5, Math.max(1, baseCount));

  const availableNats = PORT_TAVERN_NATIONALITIES[portId] ?? ['Portuguese', 'English', 'Dutch'];
  const availableRoles = PORT_ROLE_WEIGHTS[portId] ?? ['sailor', 'spice_merchant', 'soldier'];

  // One NPC will approach on drink purchase (randomly chosen)
  const approachIdx = Math.floor(Math.random() * count);

  const npcs: TavernNpc[] = [];
  const usedRoles = new Set<string>();

  for (let i = 0; i < count; i++) {
    const nationality = pick(availableNats);
    // Avoid duplicate roles when possible
    let roleKey = pick(availableRoles);
    if (usedRoles.has(roleKey) && availableRoles.length > 1) {
      const remaining = availableRoles.filter(r => !usedRoles.has(r));
      if (remaining.length > 0) roleKey = pick(remaining);
    }
    usedRoles.add(roleKey);

    const role = NPC_ROLES[roleKey] ?? NPC_ROLES.sailor;
    const group = getNationalityGroup(nationality);
    const isFemale = Math.random() < 0.15; // ~15% chance, historically plausible
    const namePool = FIRST_NAMES[nationality];
    const name = namePool
      ? pick(isFemale ? namePool.female : namePool.male)
      : 'Stranger';

    const builds = isFemale ? FEMALE_BUILDS : MALE_BUILDS;
    const details = APPEARANCE_DETAILS[group] ?? APPEARANCE_DETAILS.european;
    const build = pick(builds);
    const detail = pick(details);
    const appearance = `${build} ${nationality === 'Chinese' || nationality === 'Japanese' ? nationality : group === 'european' ? 'European' : group === 'south_asian' ? 'Indian' : group === 'east_african' ? 'African' : group === 'arab_persian' ? 'Arab' : 'man'} ${isFemale ? 'woman' : 'man'} ${detail}`;
    const idles = isFemale ? FEMALE_IDLE_ACTIONS : IDLE_ACTIONS;
    const idleAction = pick(idles);

    // Generate approach line based on role and what the player might be carrying
    const approachLines = [
      `He nods at your drink. "You are new here, yes?"`,
      `She sits down uninvited. "I see you came off a ship."`,
      `He raises his cup. "A fellow traveler. What brings you to ${port.name}?"`,
      `"You have the look of a man with cargo to sell."`,
      `He leans forward. "What are you carrying? I may know a buyer."`,
      `"Sit, sit. Tell me where you have sailed from."`,
      `She studies you. "You are not from here. What do you seek?"`,
    ];

    const npcId = Math.random().toString(36).substring(2, 9);
    const portraitConfig = tavernNpcToPortraitConfig({
      id: npcId,
      name,
      nationality,
      isFemale,
      roleTitle: role.title,
    });

    npcs.push({
      id: npcId,
      nationality,
      name,
      isFemale,
      appearance,
      idleAction,
      role,
      revealed: false,
      willApproach: i === approachIdx,
      approachLine: pick(isFemale ? approachLines.filter(l => l.includes('She') || !l.includes('He')) : approachLines),
      portraitConfig,
    });
  }

  return npcs;
}
