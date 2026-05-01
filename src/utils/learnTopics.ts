import { COMMODITY_DEFS, type Commodity } from './commodities';
import { getWorldPortById } from './worldPorts';
import type { Nationality } from '../store/gameStore';
import type { NPCShipIdentity } from './npcShipGenerator';

export type LearnTopicCategory = 'place' | 'commodity' | 'faction' | 'ship' | 'concept';

export interface LearnTopic {
  id: string;
  title: string;
  wikipediaTitle: string;
  url: string;
  category: LearnTopicCategory;
  contextNote?: string;
}

export interface ResolvedLearnTopic extends LearnTopic {
  reason: string;
  score: number;
}

export interface LearnTopicContext {
  currentWorldPortId: string | null;
  cargo: Partial<Record<Commodity, number>>;
  nearestHailableNpc: NPCShipIdentity | null;
}

function wikiUrl(title: string) {
  return `https://en.wikipedia.org/wiki/${title}`;
}

function topic(
  id: string,
  title: string,
  wikipediaTitle: string,
  category: LearnTopicCategory,
  contextNote?: string
): LearnTopic {
  return {
    id,
    title,
    wikipediaTitle,
    url: wikiUrl(wikipediaTitle),
    category,
    contextNote,
  };
}

export const LEARN_TOPICS: Record<string, LearnTopic> = {
  goa: topic('goa', 'Goa', 'Goa', 'place', 'In 1612 Goa is the capital of the Portuguese Estado da India, still wealthy and fortified but under growing Dutch and English pressure at sea.'),
  calicut: topic('calicut', 'Calicut', 'Kozhikode', 'place', 'Calicut remains the Malabar pepper port associated with the Zamorin, important for trade even after a century of Portuguese attempts to dominate the coast.'),
  surat: topic('surat', 'Surat', 'Surat', 'place', 'Surat is becoming the Mughal Empire\'s major ocean-facing commercial hub; the English factory is newly established in this period.'),
  diu: topic('diu', 'Diu', 'Diu,_India', 'place', 'Diu is a Portuguese fortress island guarding the Gulf of Cambay routes, more strategic than large.'),
  hormuz: topic('hormuz', 'Hormuz', 'Hormuz_Island', 'place', 'In 1612 Hormuz is still Portuguese-held; its fall to an Anglo-Persian force is a decade away.'),
  muscat: topic('muscat', 'Muscat', 'Muscat', 'place', 'Muscat is an Omani port under Portuguese control in 1612, positioned between Arabian and Persian Gulf trade.'),
  aden: topic('aden', 'Aden', 'Aden', 'place', 'Aden sits at the Red Sea gate, politically tied to Ottoman and Yemeni power and commercially linked to coffee and pilgrimage traffic.'),
  mocha: topic('mocha', 'Mocha', 'Mocha,_Yemen', 'place', 'Mocha is the coffee port to watch in this period, as Yemeni coffee spreads through Red Sea and Indian Ocean trade.'),
  socotra: topic('socotra', 'Socotra', 'Socotra', 'place', 'Socotra is remote but valuable for dragon\'s blood, aloes, and its position near the Arabian Sea routes.'),
  masulipatnam: topic('masulipatnam', 'Masulipatnam', 'Machilipatnam', 'place', 'Masulipatnam is the Coromandel gateway to Golconda textiles and dyes; both VOC and EIC interests are newly active there.'),
  bantam: topic('bantam', 'Banten', 'Banten_(town)', 'place', 'Bantam is a pepper entrepot and a practical European access point to the eastern spice trades, including cloves and nutmeg.'),
  malacca: topic('malacca', 'Malacca', 'Malacca', 'place', 'Portuguese Malacca still commands the strait in 1612, though Dutch pressure will eventually break Portuguese control in 1641.'),
  manila: topic('manila', 'Manila', 'Manila', 'place', 'Spanish Manila is the Pacific hinge of Asian silver, Chinese commerce, and the Acapulco galleon system.'),
  macau: topic('macau', 'Macau', 'Macau', 'place', 'Macau is the Portuguese China port and a crucial link in the silver, silk, porcelain, and Japan trades.'),
  nagasaki: topic('nagasaki', 'Nagasaki', 'Nagasaki', 'place', 'Nagasaki is still open to Portuguese trade in 1612, just before Tokugawa restrictions on Christianity intensify.'),
  mombasa: topic('mombasa', 'Mombasa', 'Mombasa', 'place'),
  zanzibar: topic('zanzibar', 'Zanzibar', 'Zanzibar', 'place'),
  lisbon: topic('lisbon', 'Lisbon', 'Lisbon', 'place'),
  amsterdam: topic('amsterdam', 'Amsterdam', 'Amsterdam', 'place'),
  seville: topic('seville', 'Seville', 'Seville', 'place'),
  london: topic('london', 'London', 'London', 'place'),
  venice: topic('venice', 'Venice', 'Venice', 'place'),
  elmina: topic('elmina', 'Elmina', 'Elmina', 'place'),
  luanda: topic('luanda', 'Luanda', 'Luanda', 'place'),
  cape: topic('cape', 'Cape of Good Hope', 'Cape_of_Good_Hope', 'place'),
  salvador: topic('salvador', 'Salvador da Bahia', 'Salvador,_Bahia', 'place'),
  havana: topic('havana', 'Havana', 'Havana', 'place'),
  cartagena: topic('cartagena', 'Cartagena de Indias', 'Cartagena,_Colombia', 'place'),
  jamestown: topic('jamestown', 'Jamestown', 'Jamestown,_Virginia', 'place'),

  banda: topic('banda', 'Banda Islands', 'Banda_Islands', 'place', 'For a 1612 trader, Banda means nutmeg and mace. The islands are small, violent, and central to the Dutch attempt to control the spice trade.'),
  krakatoa: topic('krakatoa', 'Krakatoa', 'Krakatoa', 'place', 'Krakatoa is a navigational landmark in the Sunda Strait. The famous eruption is much later; here it matters as dangerous geography near Bantam.'),
  maluku: topic('maluku', 'Maluku Islands', 'Maluku_Islands', 'place', 'The Maluku Islands are the clove heartland. In 1612, Portuguese, Spanish, Dutch, and local rulers are still contesting these routes.'),
  indianOcean: topic('indianOcean', 'Indian Ocean', 'Indian_Ocean', 'place'),
  arabianSea: topic('arabianSea', 'Arabian Sea', 'Arabian_Sea', 'place'),
  bayOfBengal: topic('bayOfBengal', 'Bay of Bengal', 'Bay_of_Bengal', 'place'),
  straitOfMalacca: topic('straitOfMalacca', 'Strait of Malacca', 'Strait_of_Malacca', 'place'),

  blackPepper: topic('blackPepper', 'Black pepper', 'Black_pepper', 'commodity', 'Black pepper is the bulk spice of the Indian Ocean trade: less spectacular than cloves or nutmeg, but moved in larger quantities.'),
  cinnamon: topic('cinnamon', 'Cinnamon', 'Cinnamon', 'commodity', 'Ceylon cinnamon is tightly contested. In practice, buyers also face substitution and confusion with cassia.'),
  cardamom: topic('cardamom', 'Cardamom', 'Cardamom', 'commodity'),
  coffee: topic('coffee', 'Coffee', 'Coffee', 'commodity'),
  tea: topic('tea', 'Tea', 'Tea', 'commodity'),
  ginger: topic('ginger', 'Ginger', 'Ginger', 'commodity'),
  cloves: topic('cloves', 'Cloves', 'Clove', 'commodity', 'Cloves come from a narrow eastern island ecology, making them lucrative and politically explosive in this period.'),
  nutmeg: topic('nutmeg', 'Nutmeg', 'Nutmeg', 'commodity', 'Nutmeg and mace are Banda products. Their scarcity explains why small islands became targets of extreme European coercion.'),
  saffron: topic('saffron', 'Saffron', 'Saffron', 'commodity'),
  tobacco: topic('tobacco', 'Tobacco', 'Tobacco', 'commodity'),
  opium: topic('opium', 'Opium', 'Opium', 'commodity'),
  camphor: topic('camphor', 'Camphor', 'Camphor', 'commodity'),
  benzoin: topic('benzoin', 'Benzoin resin', 'Benzoin_resin', 'commodity'),
  frankincense: topic('frankincense', 'Frankincense', 'Frankincense', 'commodity'),
  myrrh: topic('myrrh', 'Myrrh', 'Myrrh', 'commodity'),
  indigo: topic('indigo', 'Indigo dye', 'Indigo_dye', 'commodity'),
  sugar: topic('sugar', 'Sugar', 'Sugar', 'commodity'),
  ivory: topic('ivory', 'Ivory', 'Ivory', 'commodity'),
  porcelain: topic('porcelain', 'Chinese porcelain', 'Chinese_porcelain', 'commodity'),
  pearls: topic('pearls', 'Pearl', 'Pearl', 'commodity'),
  ambergris: topic('ambergris', 'Ambergris', 'Ambergris', 'commodity'),
  dragonBlood: topic('dragonBlood', "Dragon's blood", 'Dragon%27s_blood', 'commodity'),
  muranoGlass: topic('muranoGlass', 'Murano glass', 'Murano_glass', 'commodity'),

  portuguese: topic('portuguese', 'Portuguese Empire', 'Portuguese_Empire', 'faction', 'The Portuguese still hold key forts and sea lanes in 1612, but their Estado da India is no longer uncontested.'),
  dutch: topic('dutch', 'Dutch East India Company', 'Dutch_East_India_Company', 'faction', 'The VOC is young in 1612, aggressive, well-capitalized, and focused on breaking Iberian access to the spice islands.'),
  english: topic('english', 'English East India Company', 'East_India_Company', 'faction', 'The English East India Company is still experimental in 1612, seeking footholds at places like Surat rather than ruling territory.'),
  spanish: topic('spanish', 'Spanish Empire', 'Spanish_Empire', 'faction', 'Spain matters here through Manila, American silver, and the Iberian Union with Portugal.'),
  french: topic('french', 'France in the early modern period', 'Early_modern_France', 'faction', 'France has merchants and private ventures, but no durable East India Company presence comparable to the Dutch or English in 1612.'),
  venetian: topic('venetian', 'Republic of Venice', 'Republic_of_Venice', 'faction'),
  mughal: topic('mughal', 'Mughal Empire', 'Mughal_Empire', 'faction', 'The Mughal Empire is the great land power behind Surat, Gujarat, and much of the textile and indigo trade.'),
  persian: topic('persian', 'Safavid Iran', 'Safavid_Iran', 'faction'),
  ottoman: topic('ottoman', 'Ottoman Empire', 'Ottoman_Empire', 'faction'),
  omani: topic('omani', 'Oman', 'Oman', 'faction'),
  swahili: topic('swahili', 'Swahili coast', 'Swahili_coast', 'faction'),
  malay: topic('malay', 'Malay world', 'Malay_world', 'faction'),
  japanese: topic('japanese', 'Tokugawa shogunate', 'Tokugawa_shogunate', 'faction'),
  chinese: topic('chinese', 'Ming dynasty', 'Ming_dynasty', 'faction'),

  carrack: topic('carrack', 'Carrack', 'Carrack', 'ship'),
  galleon: topic('galleon', 'Galleon', 'Galleon', 'ship'),
  dhow: topic('dhow', 'Dhow', 'Dhow', 'ship'),
  junk: topic('junk', 'Junk', 'Junk_(ship)', 'ship'),
  fluyt: topic('fluyt', 'Fluyt', 'Fluyt', 'ship'),
  eastIndiaman: topic('eastIndiaman', 'East Indiaman', 'East_Indiaman', 'ship'),
  monsoon: topic('monsoon', 'Monsoon', 'Monsoon', 'concept'),
  tradeWinds: topic('tradeWinds', 'Trade winds', 'Trade_winds', 'concept'),
};

const PORT_RELATED_TOPICS: Record<string, string[]> = {
  bantam: ['krakatoa', 'banda', 'maluku'],
  malacca: ['straitOfMalacca', 'maluku'],
  goa: ['indianOcean', 'arabianSea'],
  calicut: ['indianOcean', 'arabianSea', 'blackPepper'],
  surat: ['mughal', 'arabianSea', 'indigo'],
  mocha: ['coffee', 'arabianSea'],
  socotra: ['dragonBlood', 'arabianSea'],
  masulipatnam: ['bayOfBengal', 'indigo'],
  macau: ['chinese', 'porcelain'],
  nagasaki: ['japanese'],
  cape: ['indianOcean', 'tradeWinds'],
};

const COMMODITY_TOPIC_ID: Partial<Record<Commodity, string>> = {
  'Black Pepper': 'blackPepper',
  Cinnamon: 'cinnamon',
  Cardamom: 'cardamom',
  Coffee: 'coffee',
  Tea: 'tea',
  Ginger: 'ginger',
  Cloves: 'cloves',
  Nutmeg: 'nutmeg',
  Saffron: 'saffron',
  Tobacco: 'tobacco',
  'Virginia Tobacco': 'tobacco',
  Opium: 'opium',
  Camphor: 'camphor',
  Benzoin: 'benzoin',
  Frankincense: 'frankincense',
  Myrrh: 'myrrh',
  Indigo: 'indigo',
  Sugar: 'sugar',
  Ivory: 'ivory',
  'Chinese Porcelain': 'porcelain',
  Pearls: 'pearls',
  Ambergris: 'ambergris',
  "Dragon's Blood": 'dragonBlood',
  'Murano Glass': 'muranoGlass',
};

const NATIONALITY_TOPIC_ID: Partial<Record<Nationality, string>> = {
  Portuguese: 'portuguese',
  Dutch: 'dutch',
  English: 'english',
  Spanish: 'spanish',
  French: 'french',
  Venetian: 'venetian',
  Mughal: 'mughal',
  Gujarati: 'mughal',
  Persian: 'persian',
  Ottoman: 'ottoman',
  Omani: 'omani',
  Swahili: 'swahili',
  Malay: 'malay',
  Acehnese: 'malay',
  Javanese: 'malay',
  Moluccan: 'maluku',
  Japanese: 'japanese',
  Chinese: 'chinese',
};

const SHIP_TOPIC_ID: Record<string, string> = {
  Carrack: 'carrack',
  Galleon: 'galleon',
  Dhow: 'dhow',
  Baghla: 'dhow',
  Ghurab: 'dhow',
  Junk: 'junk',
  Jong: 'junk',
  Fluyt: 'fluyt',
};

function addCandidate(
  candidates: Map<string, ResolvedLearnTopic>,
  id: string | undefined,
  score: number,
  reason: string
) {
  if (!id) return;
  const topic = LEARN_TOPICS[id];
  if (!topic) return;
  const existing = candidates.get(id);
  if (existing && existing.score >= score) return;
  candidates.set(id, { ...topic, score, reason });
}

function topCargo(cargo: Partial<Record<Commodity, number>>): Commodity | null {
  let best: Commodity | null = null;
  let bestValue = 0;
  for (const [commodity, qty] of Object.entries(cargo) as [Commodity, number][]) {
    if (!qty || qty <= 0) continue;
    if (commodity === 'Small Shot' || commodity === 'Cannon Shot' || commodity === 'War Rockets') continue;
    const def = COMMODITY_DEFS[commodity];
    const midPrice = def ? (def.basePrice[0] + def.basePrice[1]) / 2 : 1;
    const value = midPrice * qty;
    if (value > bestValue) {
      bestValue = value;
      best = commodity;
    }
  }
  return best;
}

export function resolveLearnTopics(context: LearnTopicContext): ResolvedLearnTopic[] {
  const candidates = new Map<string, ResolvedLearnTopic>();
  const port = context.currentWorldPortId ? getWorldPortById(context.currentWorldPortId) : null;

  if (port) {
    addCandidate(candidates, port.id, 100, `Current port: ${port.name}`);
    for (const related of PORT_RELATED_TOPICS[port.id] ?? []) {
      addCandidate(candidates, related, 78, `Near ${port.name}`);
    }
  } else {
    addCandidate(candidates, 'indianOcean', 55, 'At sea');
  }

  const npc = context.nearestHailableNpc;
  if (npc) {
    addCandidate(candidates, NATIONALITY_TOPIC_ID[npc.flag], 94, `${npc.flag} vessel nearby`);
    addCandidate(candidates, SHIP_TOPIC_ID[npc.shipType], 74, `${npc.shipType} nearby`);
    const npcCargo = topCargo(npc.cargo);
    if (npcCargo) addCandidate(candidates, COMMODITY_TOPIC_ID[npcCargo], 72, `${npc.shipName} carries ${npcCargo}`);
  }

  const cargo = topCargo(context.cargo);
  if (cargo) addCandidate(candidates, COMMODITY_TOPIC_ID[cargo], 70, `In your hold: ${cargo}`);

  addCandidate(candidates, 'monsoon', 35, 'Indian Ocean sailing');
  addCandidate(candidates, 'tradeWinds', 30, 'Long-distance navigation');

  return [...candidates.values()].sort((a, b) => b.score - a.score).slice(0, 6);
}
