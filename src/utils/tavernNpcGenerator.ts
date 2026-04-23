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
    knowledgeDomain: ['Indigo', 'Sugar', 'Iron', 'Ivory'],
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
  venice:   ['spice_merchant', 'drug_trader', 'naturalist', 'textile_factor', 'sailor', 'incense_dealer'],
  manila:   ['spice_merchant', 'drug_trader', 'soldier', 'sailor', 'textile_factor', 'naturalist'],
  nagasaki: ['spice_merchant', 'drug_trader', 'sailor', 'soldier', 'naturalist'],
  masulipatnam: ['drug_trader', 'drug_trader', 'textile_factor', 'spice_merchant', 'sailor'],
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
  venice:   ['Venetian', 'Venetian', 'Ottoman', 'Portuguese', 'Spanish', 'English', 'Dutch', 'French', 'Persian'],
  // Manila — Spanish Intramuros plus the Sangley Chinese Parián (the actual
  // commercial majority). Japanese Red Seal traders and Malay merchants
  // round out the bay's polyglot taverns.
  manila:   ['Chinese', 'Chinese', 'Spanish', 'Spanish', 'Portuguese', 'Japanese', 'Malay', 'Javanese'],
  // Nagasaki — Japanese majority with a sizable Portuguese commercial enclave
  // (Jesuits, factors, lascar crews from Goa/Macau) and Chinese traders from Fujian.
  nagasaki: ['Japanese', 'Japanese', 'Japanese', 'Portuguese', 'Portuguese', 'Chinese', 'Chinese', 'Malay'],
  // Masulipatnam — Deccani/Telugu majority read as 'Mughal' in-game, with
  // Persian merchants (strong Safavid-Golconda trade ties), Gujarati brokers,
  // and the new Dutch + English factors.
  masulipatnam: ['Mughal', 'Mughal', 'Persian', 'Gujarati', 'Dutch', 'English', 'Portuguese', 'Ottoman'],
  elmina:   ['Portuguese', 'Dutch', 'English'],
  luanda:   ['Portuguese', 'Spanish'],
  salvador: ['Portuguese', 'Spanish', 'Dutch'],
  havana:   ['Spanish', 'Portuguese', 'English'],
  cartagena:['Spanish', 'Portuguese', 'English'],
  jamestown:['English'],
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

// ── Personality traits ──
// These make NPCs feel like real people with lives beyond trade.

export interface NpcPersonality {
  temperament: string;       // core disposition: "gregarious", "suspicious", "melancholic", etc.
  quirk: string;             // behavioral detail: "keeps glancing at the door", "fidgets with a ring"
  backstoryHook: string;     // one-sentence life detail that colors conversation
  preoccupation: string;     // what's on their mind right now (often non-trade)
  speechStyle: string;       // how they talk: "speaks in proverbs", "whispers everything"
  drinkingHabit: string;     // relationship with alcohol/the tavern setting
  attitude: string;          // disposition toward strangers/the player initially
  crewPotential: boolean;    // could this NPC be recruited as crew? (stub for later)
}

const TEMPERAMENTS = [
  'gregarious and warm', 'guarded and suspicious', 'melancholic and quiet',
  'boisterous and loud', 'calm and philosophical', 'nervous and twitchy',
  'world-weary but kind', 'sharp-tongued and impatient', 'gentle and curious',
  'proud and dignified', 'bitter and resentful', 'cheerful despite hardship',
];

const QUIRKS = [
  'keeps glancing at the door as if expecting someone',
  'fidgets with a worn ring on his little finger',
  'scratches at a scar on his forearm absent-mindedly',
  'hums a tune under her breath between sentences',
  'compulsively arranges small objects on the table',
  'cracks his knuckles when thinking',
  'touches a small amulet at his neck when nervous',
  'squints as if his eyesight is failing',
  'taps the table rhythmically while listening',
  'keeps a hand near his knife out of habit',
  'absent-mindedly braids and unbraids a cord',
  'chews on a piece of dried ginger root',
];

const BACKSTORY_HOOKS: Record<string, string[]> = {
  spice_merchant: [
    'Lost his previous cargo to pirates off the Malabar Coast and is starting over',
    'Has a brother who runs a warehouse in another port and they have not spoken in years over a business dispute',
    'Was once wealthy but a ship sinking ruined him; now trades on a smaller scale',
    'Recently converted religions and is navigating the social consequences',
    'Is secretly illiterate and relies on a trusted clerk for all contracts',
  ],
  drug_trader: [
    'Became an apothecary after his wife died of a fever he could not treat',
    'Was trained by a Jesuit physician and carries conflicting loyalties',
    'Addicted to his own supply of opium and tries to hide it',
    'Believes he has discovered a genuine cure for the French disease and wants funding',
    'Fled a plague city and is haunted by what he saw there',
  ],
  incense_dealer: [
    'A devout man who sees his trade as service to God',
    'Was recently widowed and is deeply grieving, praying constantly',
    'Supplies a powerful mosque and worries about losing the contract',
    'Once traveled to Mecca and considers it the defining experience of his life',
    'Suspects his business partner is cheating him but cannot prove it',
  ],
  textile_factor: [
    'Has seven children and worries constantly about providing for them',
    'Was once a weaver himself before his hands were injured in an accident',
    'Keeps meticulous account books and is suspicious of everyone',
    'Is deeply in debt to a local moneylender and desperate for a profitable deal',
    'Has traveled more widely than most and is full of stories, some true',
  ],
  sailor: [
    'Has survived three shipwrecks and is profoundly superstitious about the sea',
    'Drinks heavily to forget something he saw on a voyage he will not discuss',
    'Is saving money to buy a small fishing boat and retire from long voyages',
    'Deserted from a naval ship and fears being recognized',
    'Lost two fingers to frostbite rounding the Cape and shows them freely',
    'Cannot swim despite decades at sea and is secretly terrified of drowning',
  ],
  naturalist: [
    'Is compiling a book of all the plants and medicines of the East',
    'Was expelled from a university for unorthodox ideas about natural philosophy',
    'Collects specimens obsessively and his lodgings are overrun with jars and dried plants',
    'Corresponds with scholars across Europe and guards his letters jealously',
    'Is fascinated by local medical traditions and dismissive of European medicine',
  ],
  pearl_diver: [
    'Has permanent scarring on his eardrums from deep diving and is going deaf',
    'Supports an extended family of twelve on his earnings',
    'Nearly drowned last season and has been drinking heavily since',
    'Knows the pearl banks better than anyone but his body is failing from the work',
    'Dreams of finding a pearl large enough to retire on',
  ],
  coffee_merchant: [
    'Is passionate about coffee almost to the point of obsession',
    'Had a Sufi teacher who introduced him to coffee as a spiritual practice',
    'Worries that coffee will be banned by religious authorities again',
    'Has traveled the route between Mocha and the coffeehouses of Cairo many times',
    'Cannot sleep well and drinks more coffee to compensate, which makes it worse',
  ],
  ivory_trader: [
    'Has spent years in the interior and speaks three African languages',
    'Is haunted by what the ivory trade does to the people who harvest it',
    'Has a network of contacts deep inland that he guards jealously',
    'Was captured by a rival trader and held for ransom; still bears the marks',
    'Is growing old and looking for someone to take over his routes',
  ],
  soldier: [
    'Has fought in several campaigns and is tired of violence but knows nothing else',
    'Drinks to manage pain from an old wound that never healed properly',
    'Was promised land that never materialized and is bitter about it',
    'Sends most of his pay home to a family he has not seen in years',
    'Is deeply religious and struggles with the things he has done in battle',
    'Deserted his post and is hiding here, jumpy and suspicious',
  ],
};

const PREOCCUPATIONS = [
  'worried about a debt that comes due soon',
  'missing his family back home',
  'nursing a grudge against someone who cheated him',
  'contemplating a risky business venture',
  'anxious about political changes that could affect trade',
  'still mourning a friend who died at sea last month',
  'excited about a rumor of a new trade opportunity',
  'suspicious that someone in the tavern is watching him',
  'thinking about whether to stay in this port or move on',
  'troubled by a recurring dream he cannot explain',
  'trying to decide whether to trust a new business partner',
  'wondering whether his ship will survive another monsoon crossing',
  'craving a specific food from home that he cannot find here',
  'planning to visit a healer about a persistent cough',
];

const SPEECH_STYLES = [
  'speaks in short, clipped sentences',
  'tends to ramble and go off on tangents',
  'speaks in proverbs and old sayings',
  'whispers conspiratorially even about mundane things',
  'has a dry, sardonic sense of humor',
  'speaks formally and precisely, like a man used to contracts',
  'tells stories instead of giving straight answers',
  'asks as many questions as he answers',
  'speaks bluntly, sometimes rudely, but means no harm',
  'chooses words carefully, with long pauses between thoughts',
  'laughs frequently, even at dark things',
  'has a gentle, almost paternal way of speaking',
];

const DRINKING_HABITS = [
  'nurses a single drink all evening',
  'drinks steadily and heavily, showing little effect',
  'is already visibly drunk when you arrive',
  'drinks only tea or coffee, citing religious principles',
  'keeps asking others to buy him drinks',
  'drinks moderately but becomes more talkative with each cup',
  'is drinking to celebrate something',
  'is drinking to forget something',
  'has a flask of something strong he adds to his cup when he thinks no one is looking',
  'orders drinks for everyone around him with exaggerated generosity',
];

const ATTITUDES = [
  'curious about strangers — eager to hear news from elsewhere',
  'wary of strangers — has been cheated before',
  'indifferent — lost in his own thoughts until engaged',
  'friendly and welcoming — enjoys the company',
  'sizing you up — trying to figure out if you are useful',
  'hostile toward Europeans — they have caused him grief',
  'overly familiar — treats everyone like an old friend',
  'respectful but reserved — waits to see your character before opening up',
];

function generatePersonality(roleKey: string, nationality: Nationality): NpcPersonality {
  const hooks = BACKSTORY_HOOKS[roleKey] ?? BACKSTORY_HOOKS.sailor;
  return {
    temperament: pick(TEMPERAMENTS),
    quirk: pick(QUIRKS),
    backstoryHook: pick(hooks),
    preoccupation: pick(PREOCCUPATIONS),
    speechStyle: pick(SPEECH_STYLES),
    drinkingHabit: pick(DRINKING_HABITS),
    attitude: pick(ATTITUDES),
    crewPotential: Math.random() < 0.2, // 20% chance — stub for future recruitment feature
  };
}

// ── Public types ──

export interface TavernNpc {
  id: string;
  nationality: Nationality;
  name: string;
  isFemale: boolean;
  appearance: string;       // what you see: "A heavyset Chinese man in fine silk"
  idleAction: string;       // what they're doing: "staring into his cup"
  role: TavernNpcRole;
  personality: NpcPersonality; // rich personality details for LLM conversations
  revealed: boolean;        // has the player talked to them?
  willApproach: boolean;    // will they approach if you buy a drink?
  approachLine: string;     // what they say when they approach
  portraitConfig: PortraitConfig; // procedural portrait data
}

// ── Approach line generation ──
// Two-part system: a cultural greeting + a role-appropriate opener,
// picked independently and combined. Some are standalone.
// ~100 fragments yielding thousands of effective combinations.

// Cultural greetings by nationality group.
// These are the first thing the NPC says — the social gesture.
// Some are warm, some curt, some wary. Varies by culture.

const CULTURAL_GREETINGS: Record<string, { male: string[]; female: string[] }> = {
  european: {
    male: [
      'He raises his cup an inch in greeting.',
      'He glances up from his drink.',
      'He nods once, sizing you up.',
      'He shifts on his bench to make room, uninvited.',
      'He looks you over, then waves you closer.',
      'He scratches his chin, watching you.',
      'He pushes a cup across the table toward you.',
      'He grunts.',
    ],
    female: [
      'She looks up from her drink with sharp eyes.',
      'She nods, neither friendly nor hostile.',
      'She studies you a moment before speaking.',
      'She makes room at the table without a word.',
      'She watches you approach, arms folded.',
    ],
  },
  south_asian: {
    male: [
      'He presses his palms together briefly.',
      'He inclines his head politely.',
      'He gestures to the seat across from him.',
      'He watches you with calm, appraising eyes.',
      'He puts down his cup and turns to face you.',
      'He adjusts his turban and smiles faintly.',
      'He looks up from a ledger he was studying.',
    ],
    female: [
      'She greets you with a slight bow of her head.',
      'She looks up from her accounts and gestures for you to sit.',
      'She regards you steadily, unhurried.',
      'She sets down her tea and meets your eye.',
    ],
  },
  east_african: {
    male: [
      'He clasps your hand warmly.',
      'He greets you with an open palm raised.',
      'He shifts his stool closer and leans in.',
      'He smiles broadly, showing a gap in his teeth.',
      'He clicks his tongue approvingly.',
      'He nods slowly, watching the harbor through the window.',
    ],
    female: [
      'She greets you with a wide, easy smile.',
      'She gestures you closer with a wave of her hand.',
      'She pauses her conversation to look you over.',
      'She raises her cup in greeting.',
    ],
  },
  southeast_asian: {
    male: [
      'He offers you a piece of betel from a brass box.',
      'He bows his head slightly, hands together.',
      'He watches you from the corner, then beckons.',
      'He shifts aside on the bench without a word.',
      'He nods, chewing betel, eyes bright.',
      'He taps the table twice — sit here.',
    ],
    female: [
      'She nods with quiet courtesy.',
      'She glances up, assessing, then smiles.',
      'She gestures to the empty seat with a tilt of her chin.',
      'She pauses her weaving to look at you.',
    ],
  },
  arab_persian: {
    male: [
      'He touches his chest and inclines his head.',
      'He gestures to the seat beside him with an open hand.',
      '"Peace be upon you." He slides a cup of coffee toward you.',
      'He strokes his beard, watching.',
      'He nods gravely.',
      'He waves you over with quiet authority.',
      '"Sit. You look as though you have traveled far."',
    ],
    female: [
      'She greets you with a measured nod.',
      'She inclines her head, watchful.',
      'She gestures you to sit with calm authority.',
    ],
  },
  chinese_japanese: {
    male: [
      'He bows his head slightly over his cup.',
      'He regards you with careful, neutral eyes.',
      'He gestures to the seat with a spare, precise movement.',
      'He looks up from his tea, unhurried.',
      'He studies you for a long moment before speaking.',
    ],
    female: [
      'She bows her head slightly.',
      'She looks up from her cup with an expression that gives nothing away.',
      'She gestures to the seat, composed.',
    ],
  },
};

// Role-appropriate openers — what comes after the greeting.
// These reflect what someone of this occupation would notice or care about.

type RoleCategory = 'merchant' | 'sailor' | 'soldier' | 'scholar' | 'diver';

const ROLE_CATEGORY_MAP: Record<string, RoleCategory> = {
  spice_merchant: 'merchant',
  drug_trader: 'merchant',
  incense_dealer: 'merchant',
  textile_factor: 'merchant',
  coffee_merchant: 'merchant',
  ivory_trader: 'merchant',
  sailor: 'sailor',
  pearl_diver: 'diver',
  soldier: 'soldier',
  naturalist: 'scholar',
};

const ROLE_OPENERS: Record<RoleCategory, { male: string[]; female: string[] }> = {
  merchant: {
    male: [
      '"You came in off that ship in the harbor, no? What are you carrying?"',
      '"Looking to buy or sell? I might know a thing or two."',
      '"New face. New cargo, I hope."',
      '"Business or pleasure? Both cost money here."',
      '"I could not help noticing your ship. She sits low in the water — heavy cargo?"',
      '"The market has been slow this week. Maybe you will change that."',
      '"What do you trade in? I can tell you if it is worth anything here."',
      '"Are you buying? The prices just shifted."',
      '"I have been waiting for a ship with something interesting. Have you got anything interesting?"',
      '"You are either very brave or very foolish to sail into this port right now. Which is it?"',
    ],
    female: [
      '"You came off that ship, yes? What are you carrying?"',
      '"New face. Are you buying or selling?"',
      '"The market is slow. I hope you have brought something worth buying."',
      '"I deal in goods, not gossip. What do you have?"',
      '"You look like a man with something to sell. Am I wrong?"',
      '"Tell me what you are carrying and I will tell you what it is worth."',
    ],
  },
  sailor: {
    male: [
      '"Where did you sail in from? Those waters can be rough this time of year."',
      '"That your ship out there? Not bad. Not bad at all."',
      '"Another sailor. Good. I am tired of talking to merchants."',
      '"How was the crossing? We lost a man to fever on our last run."',
      '"You look like you have been at sea a while. I know the feeling."',
      '"Buy me a drink and I will tell you which routes will kill you."',
      '"Your crew looks rough. How long have you been out?"',
      '"I was about to ship out myself, but the captain drank the advance."',
    ],
    female: [
      '"Where did you sail in from? Those waters have been ugly lately."',
      '"Another ship. I was wondering when the next one would come in."',
      '"You have been at sea. I can always tell."',
      '"Buy me something and I will tell you about the currents south of here."',
    ],
  },
  soldier: {
    male: [
      '"What is your business here?" He says it like a question that is also a warning.',
      '"Armed ship. I noticed. What is your business in this port?"',
      '"You are not the first stranger this week. The last one caused trouble."',
      '"Keep your hands where I can see them and we will get along fine."',
      '"If you are here to trade, fine. If you are here to cause trouble, you picked the wrong port."',
      '"Relax. I am off duty." He does not look relaxed.',
      '"You want information? Everything costs something."',
    ],
    female: [
      '"State your business."',
      '"You do not look like the usual crowd. What brings you here?"',
      '"I have seen enough strangers come through here to know which ones are trouble. Jury is out on you."',
    ],
  },
  scholar: {
    male: [
      '"Forgive me — I could not help but notice. Where have you sailed from? I am collecting observations."',
      '"A new arrival. Tell me, have you seen anything unusual in your travels?"',
      '"Are you a learned man? You have the look of someone who has seen more than most."',
      '"I am studying the natural products of these regions. Have you carried any specimens?"',
      '"Sit. I have a question about something and you may be the one to answer it."',
      '"I do not often meet fellow travelers with any curiosity. Prove me wrong."',
    ],
    female: [
      '"Where have you sailed from? I am always looking for new accounts of distant places."',
      '"You look like you have stories. I collect stories."',
      '"Have you carried anything unusual in your travels? I study the natural products of the East."',
    ],
  },
  diver: {
    male: [
      '"You came in on that ship? The water out there today — very bad."',
      '"I do not go out on ships. Too deep. I go down, not across."',
      '"You are not a diver, are you? No. I can always tell."',
      '"Buy me a drink. My ears are ringing and the arrack helps."',
      '"The banks are thin this season. Everyone is feeling it."',
    ],
    female: [
      '"You are from a ship? The harbor has been busy this week."',
      '"You do not know the sea the way I do. Sit and I will tell you."',
    ],
  },
};

// Port-specific interjections — occasionally mixed in for flavor.
// These replace the role opener ~20% of the time.
const PORT_COLOR: Record<string, string[]> = {
  calicut: [
    '"The Zamorin has been in a mood lately. Something about the Portuguese."',
    '"The pepper harvest was poor this year. Prices are up."',
    '"Have you tried the toddy? It will make you forget you ever had legs."',
  ],
  goa: [
    '"The Viceroy is taxing everything that moves. Welcome to Goa."',
    '"The Jesuits are building another church. They never stop."',
    '"There is sickness in the lower town. Stay away from the water near the fort."',
  ],
  surat: [
    '"The caravans from the interior have been late. Nobody knows why."',
    '"This is the busiest port in India and it shows. Terrible parking for ships."',
    '"The English have been pushing for more trading rights. The Mughal governor is not pleased."',
  ],
  hormuz: [
    '"The heat will kill you before the Persians do."',
    '"Everything passes through Hormuz. Everything."',
    '"The Portuguese hold the fort but the Persians hold grudges."',
  ],
  malacca: [
    '"The straits have been quiet. Too quiet."',
    '"Every nation in the world passes through this port. You can buy anything here."',
    '"There were pirates off the coast last week. Two junks taken."',
  ],
  bantam: [
    '"The pepper is cheap here but the competition is killing everyone."',
    '"The Dutch have been throwing their weight around again."',
    '"It rains every afternoon. You learn to live with it."',
  ],
  macau: [
    '"The Canton trade is the most profitable in the world. Also the most frustrating."',
    '"The Portuguese cling to this rock like barnacles. For good reason."',
    '"If you have silver, you can have anything here. If not, do not waste my time."',
  ],
  aden: [
    '"The coffee from Mocha comes through here. Everything else is secondary."',
    '"The Ottomans run this port and they run it hard."',
    '"The heat, the dust, the flies. But the trade is worth it."',
  ],
  muscat: [
    '"The Imam keeps order here. That is more than you can say for most ports."',
    '"The frankincense trade made this town. Fish and incense. That is Muscat."',
  ],
  zanzibar: [
    '"The ivory comes from deep in the interior. Months of travel."',
    '"Clove trees are new here. Someone planted them. Could change everything."',
    '"The monsoon will turn soon. Then the Arabs come."',
  ],
  mombasa: [
    '"Fort Jesus looms over everything. The Portuguese are watching."',
    '"The Swahili traders here know the coast better than any chart."',
  ],
  mocha: [
    '"Coffee. That is all anyone here cares about. Coffee and God."',
    '"The Ottomans tax the coffee but they cannot stop it."',
    '"Have you tried the coffee? No? You must."',
  ],
  lisbon: [
    '"Everyone comes back from the East with stories. Half of them are lies."',
    '"The Ribeira Palace is full of men who have never been further than Sintra telling you about India."',
    '"The Casa da India controls everything. Good luck getting a fair price without connections."',
  ],
  amsterdam: [
    '"The VOC is hiring. They are always hiring. You know why? Because men keep dying."',
    '"This city runs on money and herring. In that order."',
    '"They are building new warehouses on the Keizersgracht. For spices. Always spices."',
  ],
  venice: [
    '"The Cape route was supposed to ruin us. And yet here we are, still selling pepper."',
    '"The theriac will be compounded on the Piazza this autumn. They will need a witness from the College of Physicians."',
    '"Every Jew in the Ghetto knows three languages. The Council of Ten knows them all."',
    '"Murano glass goes to Constantinople and comes back as silk. That is the trade."',
    '"The Arsenale launches a galley a day when the Republic wills it. Most days it does not will it."',
  ],
  manila: [
    '"The galleon from Acapulco is late again. Half the Parián is waiting on silver to make next year\'s shipment."',
    '"The Sangleys do all the work and most of the trade. The friars complain. The friars always complain."',
    '"Star anise from Fujian, betel from Mindanao, silk from Hangzhou — and none of it grown by a Spaniard."',
    '"Have you seen the new church? Stone, not bamboo. The friars say it will outlast us all."',
    '"They massacred eight thousand Sangleys nine years ago and still can\'t do business without them."',
  ],
  cochin: [
    '"The pepper here is the best in the world and everyone knows it."',
    '"The Raja and the Portuguese have an understanding. Do not get in the middle of it."',
  ],
  aceh: [
    '"The Sultan does not trust Europeans. Can you blame him?"',
    '"Pepper and camphor. That is what built this place."',
    '"The Ottoman guns are new. A gift, they say. I say nothing is a gift."',
  ],
};

/**
 * Generate a culturally appropriate, role-specific approach line.
 * Two-part: cultural greeting + role opener. ~20% chance of port-specific color.
 */
function generateApproachLine(
  nationality: Nationality,
  group: string,
  roleKey: string,
  isFemale: boolean,
  portName: string,
): string {
  const greetings = CULTURAL_GREETINGS[group] ?? CULTURAL_GREETINGS.european;
  const greeting = pick(isFemale ? greetings.female : greetings.male);

  // ~20% chance of port-specific color instead of role opener
  const portId = portName.toLowerCase().replace(/\s+/g, '');
  const portLines = PORT_COLOR[portId];
  if (portLines && Math.random() < 0.2) {
    return `${greeting} ${pick(portLines)}`;
  }

  const roleCategory = ROLE_CATEGORY_MAP[roleKey] ?? 'sailor';
  const openers = ROLE_OPENERS[roleCategory];
  const opener = pick(isFemale ? openers.female : openers.male);

  return `${greeting} ${opener}`;
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

    const approachLine = generateApproachLine(nationality, group, roleKey, isFemale, port.name);

    const npcId = Math.random().toString(36).substring(2, 9);
    const portraitConfig = tavernNpcToPortraitConfig({
      id: npcId,
      name,
      nationality,
      isFemale,
      roleTitle: role.title,
    });

    const personality = generatePersonality(roleKey, nationality);

    npcs.push({
      id: npcId,
      nationality,
      name,
      isFemale,
      appearance,
      idleAction,
      role,
      personality,
      revealed: false,
      willApproach: i === approachIdx,
      approachLine,
      portraitConfig,
    });
  }

  return npcs;
}
