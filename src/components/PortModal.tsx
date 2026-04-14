import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useGameStore, Culture, WEAPON_DEFS, WEAPON_PRICES, getPortArmory } from '../store/gameStore';
import type { Commodity } from '../utils/commodities';
import {
  COMMODITY_DEFS,
} from '../utils/commodities';
import { tavernTemplate } from '../utils/journalTemplates';
import { audioManager } from '../audio/AudioManager';
import { sfxTab, sfxCoin, sfxClose, startTabAmbient, stopTabAmbientLoop } from '../audio/SoundEffects';
import { getPortBannerCandidates, getPortIconCandidates } from '../utils/portAssets';
import { MarketTabLedger } from './MarketTabLedger';
import {
  X, Coins, Shield, Anchor, ShoppingBag,
  Wrench, Beer, Building, Sailboat,
} from 'lucide-react';

type PlaceTab = 'market' | 'shipyard' | 'tavern' | 'governor';
type Tab = 'overview' | PlaceTab;
type PortSeason = 'northeast' | 'intermonsoon' | 'southwest' | 'postmonsoon';

const TABS: { id: PlaceTab; icon: typeof ShoppingBag; label: string; accent: string; glow: string }[] = [
  { id: 'market', icon: ShoppingBag, label: 'Market', accent: '#fbbf24', glow: '251,191,36' },
  { id: 'shipyard', icon: Wrench, label: 'Shipyard', accent: '#60a5fa', glow: '96,165,250' },
  { id: 'tavern', icon: Beer, label: 'Tavern', accent: '#34d399', glow: '52,211,153' },
  { id: 'governor', icon: Building, label: 'Governor', accent: '#a78bfa', glow: '167,139,250' },
];

const PLACE_TABS: { id: PlaceTab; icon: typeof ShoppingBag; label: string; action: string }[] = [
  { id: 'market', icon: ShoppingBag, label: 'Market', action: 'Trade goods and watch prices' },
  { id: 'shipyard', icon: Wrench, label: 'Shipyard', action: 'Repair hull and fit guns' },
  { id: 'tavern', icon: Beer, label: 'Tavern', action: 'Buy rounds and gather rumors' },
  { id: 'governor', icon: Building, label: 'Governor', action: 'Seek favor and permissions' },
];

const PORT_MUSIC_TRACKS = {
  mena: { src: '/music/portmusic/MENA%20tavern.mp3', gain: 0.32 },
} as const;

const PORT_MUSIC_REGION: Record<string, keyof typeof PORT_MUSIC_TRACKS> = {
  aden: 'mena',
  hormuz: 'mena',
  mocha: 'mena',
  muscat: 'mena',
  socotra: 'mena',
};

// ── Historical Port Data (c. 1612) ──

interface PortInfo {
  localName?: string;
  sovereign: string;
  sovereignType: string;
  population: string;
  languages: string;
  religions: string;
  tabDescriptions: Record<PlaceTab, { title: string; text: string }>;
}

interface PortOverview {
  text: string;
  historicalNote: string;
  sources: string[];
}

const PORT_INFO: Record<string, PortInfo> = {
  calicut: {
    localName: 'Kozhikode',
    sovereign: 'Zamorin',
    sovereignType: 'Hindu Kingdom',
    population: '~200,000',
    languages: 'Malayalam',
    religions: 'Hindu · Muslim',
    tabDescriptions: {
      market: { title: 'Local Market', text: 'Merchants jostle beneath palm-leaf canopies, weighing pepper by the maund. Mappila brokers call out prices in a babel of Malayalam, Arabic, and Portuguese.' },
      shipyard: { title: 'Shipyard', text: 'Calicut\'s shipwrights are master builders of the dhow and the pattamar, working teakwood with techniques passed down through generations.' },
      tavern: { title: 'The Pepper Vine', text: 'A low-ceilinged arrack house near the docks, its walls stained with decades of toddy and tobacco smoke. Nair soldiers drink beside Mappila sailors.' },
      governor: { title: 'Court of the Zamorin', text: 'The Zamorin\'s wooden palace overlooks the harbor. His court manages trade through hereditary Muslim brokers called the Koya. Foreign merchants need his seal to trade freely in Malabar ports.' },
    },
  },
  goa: {
    sovereign: 'Portuguese Crown',
    sovereignType: 'Colonial',
    population: '~75,000',
    languages: 'Konkani · Portuguese',
    religions: 'Catholic · Hindu',
    tabDescriptions: {
      market: { title: 'Bazaar de Goa', text: 'Under the vaulted arcades of the Rua Direita, Portuguese factors compete with local Banian merchants for the finest pepper, gems, and Chinese silk.' },
      shipyard: { title: 'Royal Shipyard', text: 'The Ribeira das Naus is the finest shipyard east of Lisbon. Carracks and galleons are built and refitted here for the Carreira da Índia.' },
      tavern: { title: 'The Golden Anchor', text: 'A rowdy taverna near the waterfront where Portuguese soldiers, Goan merchants, and sailors of every nation mingle over arrack and feni.' },
      governor: { title: 'Viceroy\'s Palace', text: 'The Palácio do Governo overlooks the Mandovi River. The Viceroy governs all Portuguese possessions from Mozambique to Macau from this seat.' },
    },
  },
  hormuz: {
    sovereign: 'Safavid Persia',
    sovereignType: 'Portuguese-occupied',
    population: '~40,000',
    languages: 'Persian · Arabic',
    religions: 'Muslim (Shia)',
    tabDescriptions: {
      market: { title: 'Pearl Market', text: 'The bazaar of Hormuz deals in pearls from Bahrain, horses from Arabia, and spices from every corner of the Indian Ocean. Heat shimmers off the salt flats.' },
      shipyard: { title: 'Dry Docks', text: 'Ship repair on this barren island relies on imported timber. The Portuguese fortress overshadows the cramped docks where dhows are caulked and patched.' },
      tavern: { title: 'The Salt Wind', text: 'A spartan drinking house sheltered from the relentless sun. Persian wine and dates are the only luxuries on this scorched island.' },
      governor: { title: 'Portuguese Fortress', text: 'The imposing Fort of Our Lady commands the strait. Though nominally Safavid territory, the Portuguese captain collects customs on all passing trade.' },
    },
  },
  malacca: {
    sovereign: 'Portuguese Crown',
    sovereignType: 'Colonial',
    population: '~50,000',
    languages: 'Malay · Portuguese',
    religions: 'Muslim · Buddhist',
    tabDescriptions: {
      market: { title: 'Great Emporium', text: 'Malacca\'s markets overflow with cloves from the Moluccas, sandalwood from Timor, porcelain from China, and textiles from Gujarat. The crossroads of all Asian trade.' },
      shipyard: { title: 'Straits Yard', text: 'Junks, praus, and European carracks crowd the repair yards. Malay shipwrights work alongside Portuguese carpenters in the shadow of A Famosa.' },
      tavern: { title: 'The Straits House', text: 'A multilingual chaos of Malay, Tamil, Chinese, and Portuguese fills this waterfront establishment. Arrack flows freely, and so does information.' },
      governor: { title: 'A Famosa', text: 'The great stone fortress built by Afonso de Albuquerque a century ago still dominates the hillside. The Captain of Malacca rules the most valuable trading post in Asia.' },
    },
  },
  aden: {
    sovereign: 'Ottoman Empire',
    sovereignType: 'Ottoman',
    population: '~30,000',
    languages: 'Arabic',
    religions: 'Muslim (Sunni)',
    tabDescriptions: {
      market: { title: 'Crater Bazaar', text: 'Sheltered within the volcanic crater, Aden\'s market trades in Mocha coffee, frankincense, myrrh, and the goods of ships passing through the Bab-el-Mandeb.' },
      shipyard: { title: 'Harbor Works', text: 'The natural crater harbor offers shelter but limited space. Repairs are basic but adequate, with timber brought by dhow from the East African coast.' },
      tavern: { title: 'The Incense House', text: 'A qahwa house overlooking the harbor, thick with the smoke of frankincense. Ottoman soldiers and Yemeni traders share coffee and news.' },
      governor: { title: 'Ottoman Garrison', text: 'The Ottoman Pasha governs from the fortress above the crater. Aden\'s strategic position at the mouth of the Red Sea makes it a prized possession of the Sultan.' },
    },
  },
  zanzibar: {
    localName: 'Unguja',
    sovereign: 'Portuguese',
    sovereignType: 'Nominal control',
    population: '~20,000',
    languages: 'Swahili · Arabic',
    religions: 'Muslim',
    tabDescriptions: {
      market: { title: 'Stone Town Market', text: 'The scent of cloves and copra drifts through narrow coral-stone alleys. Swahili and Arab traders deal in ivory, tortoiseshell, and ambergris.' },
      shipyard: { title: 'Beach Yards', text: 'Dhows are hauled onto white sand beaches for repair. Local craftsmen build the swift mtepe, sewn-plank boats that need no nails.' },
      tavern: { title: 'The Coral House', text: 'A breezy establishment built of coral rag and lime, its veranda overlooking the turquoise shallows. Palm wine and Swahili poetry flow in equal measure.' },
      governor: { title: 'Sultan\'s Residence', text: 'Portuguese authority here is thin. The local Mwinyi Mkuu holds true power, governing through a network of clan elders and Omani trading families.' },
    },
  },
  macau: {
    localName: 'Aomen',
    sovereign: 'Portuguese Crown',
    sovereignType: 'Leased territory',
    population: '~25,000',
    languages: 'Cantonese · Portuguese',
    religions: 'Buddhist · Catholic',
    tabDescriptions: {
      market: { title: 'Praia Grande Market', text: 'Chinese silk, porcelain, and lacquerware fill the godowns. Portuguese merchants broker the fabulously profitable Japan-China-India triangle trade.' },
      shipyard: { title: 'Inner Harbor Yard', text: 'The sheltered Inner Harbor services both Chinese junks and Portuguese carracks. Repair materials come from Guangdong timber merchants.' },
      tavern: { title: 'The Dragon & Cross', text: 'A smoky taverna where Portuguese fidalgos, Chinese compradors, and Japanese ronin drink rice wine and play cards. The most cosmopolitan dive in Asia.' },
      governor: { title: 'Senate House', text: 'The Leal Senado governs this narrow peninsula by permission of the Ming Emperor. Macau thrives on being useful to both empires without belonging fully to either.' },
    },
  },
  mombasa: {
    sovereign: 'Portuguese',
    sovereignType: 'Fort Jesus garrison',
    population: '~15,000',
    languages: 'Swahili',
    religions: 'Muslim',
    tabDescriptions: {
      market: { title: 'Old Town Market', text: 'Trade in ivory, mangrove poles, and ambergris sustains this island port. Swahili merchants maintain networks stretching from Madagascar to Mogadishu.' },
      shipyard: { title: 'Fort Jesus Docks', text: 'The Portuguese maintain a small yard in the shadow of Fort Jesus. Most repairs are handled by Swahili boatbuilders on the town beaches.' },
      tavern: { title: 'The Lighthouse', text: 'A Swahili coffee house near the old harbor, where sailors share news from the coast. The Portuguese garrison keeps a suspicious distance.' },
      governor: { title: 'Fort Jesus', text: 'The massive coral-stone fortress designed by Giovanni Battista Cairato dominates the harbor entrance. The Portuguese Captain rules from within its walls, though his authority rarely extends beyond their shadow.' },
    },
  },
  surat: {
    sovereign: 'Mughal Empire',
    sovereignType: 'Mughal',
    population: '~200,000',
    languages: 'Gujarati',
    religions: 'Muslim · Hindu',
    tabDescriptions: {
      market: { title: 'Gujarat Textile Market', text: 'Surat\'s famed textiles — chintz, calico, brocade — are prized from Cairo to Manila. Banian merchants run the largest trading houses in the Indian Ocean world.' },
      shipyard: { title: 'Tapti Riveryard', text: 'At the mouth of the Tapti, skilled Gujarati shipwrights build everything from coastal dhows to ocean-going ghurabs. The Mughal fleet is maintained here.' },
      tavern: { title: 'The Banian House', text: 'More a sarai than a tavern — a resting house for merchants where deals are struck over sweet chai and betel. Alcohol is scarce; information is the real currency.' },
      governor: { title: 'Mughal Governor\'s Court', text: 'The Mutasaddi of Surat represents the Emperor Jahangir. All foreign trade passes under his authority. The English are petitioning for a factory here.' },
    },
  },
  muscat: {
    sovereign: 'Portuguese',
    sovereignType: 'Portuguese-occupied',
    population: '~15,000',
    languages: 'Arabic',
    religions: 'Muslim (Ibadi)',
    tabDescriptions: {
      market: { title: 'Harbor Souk', text: 'Wedged between jagged mountains and the sea, Muscat\'s compact souk trades in dates, dried fish, horses from the interior, and frankincense from Dhofar.' },
      shipyard: { title: 'Cove Yards', text: 'Protected by twin forts, the small harbor offers basic repair facilities. Omani sailors are renowned navigators of the monsoon routes.' },
      tavern: { title: 'The Date Palm', text: 'A whitewashed qahwa house overlooking the harbor. Date wine and strong coffee are served beneath a canopy of palm fronds.' },
      governor: { title: 'Fort Jalali', text: 'The Portuguese captain governs from Fort Jalali, one of twin fortresses flanking the harbor entrance. But Omani resentment grows — the Yaruba dynasty plots liberation.' },
    },
  },
  mocha: {
    localName: 'Al-Mukha',
    sovereign: 'Ottoman Empire',
    sovereignType: 'Ottoman',
    population: '~25,000',
    languages: 'Arabic',
    religions: 'Muslim (Sunni)',
    tabDescriptions: {
      market: { title: 'Coffee Exchange', text: 'The world\'s finest coffee passes through Mocha\'s warehouses. Yemeni coffee merchants guard their monopoly fiercely — no viable plant has left Arabia.' },
      shipyard: { title: 'Red Sea Yard', text: 'The shallow approach and coral reefs make Mocha treacherous for large ships. Lighters ferry cargo to vessels anchored offshore; repairs are basic.' },
      tavern: { title: 'The Qahwa House', text: 'The original coffeehouse — dark, aromatic, and alive with debate. Sufi mystics sit alongside merchants, all animated by the stimulating brew.' },
      governor: { title: 'Ottoman Custom House', text: 'The Ottoman tax collector extracts duties on every bale of coffee leaving the port. The English and Dutch are both eager to establish factories here.' },
    },
  },
  bantam: {
    localName: 'Banten',
    sovereign: 'Sultan of Banten',
    sovereignType: 'Sultanate',
    population: '~30,000',
    languages: 'Javanese · Malay',
    religions: 'Muslim',
    tabDescriptions: {
      market: { title: 'Pepper Market', text: 'Bantam is the pepper capital of Java. English, Dutch, and Chinese merchants compete fiercely for the harvest. The Sultan plays each against the others.' },
      shipyard: { title: 'Sunda Strait Yard', text: 'Javanese prau builders and Chinese junk craftsmen share the busy waterfront. The strait location means a constant flow of vessels needing repair.' },
      tavern: { title: 'The Pepper Vine', text: 'A raucous waterfront warung where English factors, Dutch merchants, and Javanese traders drink arak and eye each other warily.' },
      governor: { title: 'Sultan\'s Court', text: 'The young Sultan of Banten rules a fiercely independent kingdom. He grants trading privileges to the English and Dutch to counterbalance Portuguese power.' },
    },
  },
  socotra: {
    localName: 'Suqutra',
    sovereign: 'Mahra Sultanate',
    sovereignType: 'Portuguese garrison',
    population: '~5,000',
    languages: 'Socotri · Arabic',
    religions: 'Muslim · Christian (Nestorian remnant)',
    tabDescriptions: {
      market: { title: 'Dragon\'s Blood Market', text: 'A sparse market beneath the alien shapes of dragon\'s blood trees. Aloe, ambergris, and the precious red resin are the island\'s chief exports. Passing ships trade provisions for these rarities.' },
      shipyard: { title: 'Careenage Beach', text: 'No proper shipyard exists here, only a sheltered beach where vessels can be careened for hull scraping. The Portuguese garrison maintains a small stores depot.' },
      tavern: { title: 'The Anchorage', text: 'A crude shelter of palm thatch and driftwood near the landing beach. Portuguese soldiers, Socotri fishermen, and the occasional Arab pilot share bitter coffee and stale news.' },
      governor: { title: 'Portuguese Garrison', text: 'A crumbling stone fort overlooks the anchorage. The tiny Portuguese garrison clings to this remote outpost mainly to deny it to the Ottomans. The Mahra sultan\'s authority is nominal at best.' },
    },
  },
  diu: {
    sovereign: 'Portuguese Crown',
    sovereignType: 'Colonial Fortress',
    population: '~25,000',
    languages: 'Gujarati · Portuguese',
    religions: 'Hindu · Muslim · Catholic',
    tabDescriptions: {
      market: { title: 'Fortress Bazaar', text: 'Within the shadow of massive stone walls, merchants trade Gujarati textiles, Arabian horses, and African ivory. The Portuguese customs house takes its cut of everything that passes through.' },
      shipyard: { title: 'Diu Dockyard', text: 'A well-equipped Portuguese naval yard, capable of refitting the largest carracks. The fortress guns protect vessels under repair from any approaching threat.' },
      tavern: { title: 'The Cannon\'s Mouth', text: 'A stone-walled tavern built into the fortress ramparts. Portuguese soldiers, Gujarati merchants, and visiting sailors drink wine shipped from Lisbon alongside local toddy.' },
      governor: { title: 'Captain\'s Fortress', text: 'The great fortress of Diu, built after the decisive naval victory of 1509, is the most powerful fortification on India\'s western coast. The Captain governs with an iron hand, controlling all maritime trade between Gujarat and the Arabian Sea.' },
    },
  },
};

const PORT_OVERVIEWS: Record<string, PortOverview> = {
  calicut: {
    text: 'Calicut is still a pepper port of formidable reach, even after a century of Portuguese pressure along the Malabar coast. Muslim brokers, Hindu rulers, Arab pilots, and European factors all pass through its harbor, each trying to secure the monsoon\'s best cargoes. The Zamorin\'s authority rests less on shutting outsiders out than on making them bargain through the port\'s established merchant networks.',
    historicalNote: 'Calicut was famous to European visitors from the late fifteenth century onward, but it was already embedded in older Indian Ocean trade routes. Its politics were shaped by competition between the Zamorin, Malabar merchants, and Portuguese attempts to redirect pepper through their fortified ports.',
    sources: ['Sanjay Subrahmanyam, The Political Economy of Commerce: Southern India 1500-1650', 'K. N. Chaudhuri, Trade and Civilisation in the Indian Ocean', 'M. N. Pearson, The Indian Ocean'],
  },
  goa: {
    text: 'Goa is the nerve center of the Estado da India, where river traffic, customs clerks, shipwrights, and foreign brokers crowd the Mandovi. Its arcades carry pepper, silk, gems, and news from every sea lane between Mozambique, Hormuz, Malacca, and Macau. A captain can find profit and repairs here, but nothing passes the riverfront without being noticed by crown officials or rival merchants.',
    historicalNote: 'Portuguese Goa functioned as an imperial capital as much as a trading city. By the early seventeenth century it linked military administration, ship repair, missionary institutions, and private commerce across Portugal\'s Asian possessions.',
    sources: ['Sanjay Subrahmanyam, The Portuguese Empire in Asia, 1500-1700', 'Anthony Disney, A History of Portugal and the Portuguese Empire', 'C. R. Boxer, The Portuguese Seaborne Empire'],
  },
  hormuz: {
    text: 'Hormuz is a hot, austere hinge of the Persian Gulf, richer in tolls than in soil or timber. Horses, pearls, dates, silk, and spices pass through its markets while the Portuguese fortress watches the strait. Every repair plank must be imported, but every ship that passes close enough can be counted, taxed, or threatened.',
    historicalNote: 'Hormuz was one of the most valuable chokepoints in the western Indian Ocean before its capture by Anglo-Persian forces in 1622. Portuguese control depended on fortress power, local intermediaries, and the customs revenue of Gulf traffic.',
    sources: ['Sanjay Subrahmanyam, The Portuguese Empire in Asia, 1500-1700', 'M. N. Pearson, The Indian Ocean', 'R. J. Barendse, The Arabian Seas'],
  },
  malacca: {
    text: 'Malacca is a crowded hinge of Asian commerce, where the strait funnels junks, praus, carracks, and coastal traders into one restless harbor. The Portuguese hold the fortress, but Malay, Tamil, Chinese, Javanese, and Gujarati merchants still make the place work. Whoever controls prices here hears news from China, Java, the Moluccas, India, and the South China Sea before most captains know the wind has changed.',
    historicalNote: 'After the Portuguese conquest of 1511, Malacca remained a strategic entrepot rather than a simple colonial town. Its value came from the strait, but its politics were shaped by rival Malay powers, Asian merchant communities, and Dutch competition.',
    sources: ['Anthony Reid, Southeast Asia in the Age of Commerce', 'Barbara Watson Andaya and Leonard Andaya, A History of Malaysia', 'Sanjay Subrahmanyam, The Portuguese Empire in Asia, 1500-1700'],
  },
  aden: {
    text: 'Aden sits inside volcanic stone at the mouth of the Red Sea, a guarded harbor for coffee, incense, myrrh, and ships bound toward Egypt or India. Ottoman authority is strongest at the fortress and customs house, but the bazaar belongs to brokers who understand both desert caravans and monsoon routes. The anchorage offers shelter, though never enough room for a careless captain.',
    historicalNote: 'Aden\'s importance came from its position near Bab-el-Mandeb and the Red Sea trade. Ottoman control connected it to imperial politics in Arabia and Egypt while local merchants tied it to Indian Ocean circuits.',
    sources: ['K. N. Chaudhuri, Trade and Civilisation in the Indian Ocean', 'R. J. Barendse, The Arabian Seas', 'Nancy Um, The Merchant Houses of Mocha'],
  },
  zanzibar: {
    text: 'Zanzibar is a coral-stone harbor where Swahili, Arab, and Indian Ocean traders move cloves, copra, ivory, tortoiseshell, and ambergris through narrow lanes. Portuguese authority is thin here, more a shadow cast by forts elsewhere than a daily fact in every market. The island rewards captains who listen to local pilots and do not mistake nominal control for obedience.',
    historicalNote: 'The Swahili coast was never simply a Portuguese possession, even where Portuguese influence was present. Coastal cities maintained older commercial and religious networks linking East Africa to Arabia, Gujarat, and the wider Indian Ocean.',
    sources: ['Abdul Sheriff, Dhow Cultures of the Indian Ocean', 'Edward A. Alpers, The Indian Ocean in World History', 'Randall Pouwels, Horn and Crescent'],
  },
  macau: {
    text: 'Macau is a narrow, useful compromise at the edge of Ming China, crowded with silk, porcelain, silver, Jesuits, compradors, and Portuguese merchants. Its harbor looks outward to Japan and India while its survival depends on permission from Chinese officials. Profits can be astonishing here, but a captain must learn which doors are Portuguese, which are Chinese, and which are both at once.',
    historicalNote: 'Macau grew from negotiated Portuguese residence rather than conquest. Its early modern importance came from intermediary trade linking China, Japan, Southeast Asia, and Portuguese networks across the Indian Ocean.',
    sources: ['C. R. Boxer, The Great Ship from Amacon', 'Liam Matthew Brockey, Journey to the East', 'M. N. Pearson, The Indian Ocean'],
  },
  mombasa: {
    text: 'Mombasa faces the sea behind coral walls and the hard silhouette of Fort Jesus. Swahili merchants keep trading networks alive from Madagascar to the Horn, while the Portuguese garrison guards a narrower claim from the fortress. The old harbor is a good place for ivory, mangrove poles, ambergris, and news that travels faster by dhow than by decree.',
    historicalNote: 'Fort Jesus made Mombasa a major Portuguese military position, but the surrounding Swahili coast retained its own commercial logic. Local merchants, Muslim networks, and regional rivalries often mattered as much as European fortifications.',
    sources: ['Randall Pouwels, Horn and Crescent', 'Abdul Sheriff, Dhow Cultures of the Indian Ocean', 'Edward A. Alpers, The Indian Ocean in World History'],
  },
  surat: {
    text: 'Surat is the Mughal Empire\'s western sea gate, thick with textiles, bills of exchange, pilgrims, brokers, and foreign petitioners. Banian merchants and Mughal officials shape the terms of trade before any outsider reaches the quay. A captain can buy cloth here for half the ocean, but the richest deals pass through ledgers before they reach a hold.',
    historicalNote: 'Surat rose as a major Mughal port for Red Sea, Persian Gulf, and Southeast Asian trade. European companies depended heavily on Indian merchants, credit, and political permission rather than simply imposing trade on their own terms.',
    sources: ['M. N. Pearson, Merchants and Rulers in Gujarat', 'Om Prakash, European Commercial Enterprise in Pre-Colonial India', 'Ashin Das Gupta, Indian Merchants and the Decline of Surat'],
  },
  muscat: {
    text: 'Muscat is a compact harbor pinned between jagged mountains and a hard blue sea. Portuguese forts command the entrance, but Omani sailors know the monsoon routes, the coves, and the inland trade better than any garrison. Dates, frankincense, horses, dried fish, and rumor move through a port where occupation and resistance share the same narrow streets.',
    historicalNote: 'Muscat\'s strategic value came from its position on routes between the Persian Gulf, Arabia, East Africa, and India. Portuguese control in the early seventeenth century was real but contested, foreshadowing Omani expansion later in the century.',
    sources: ['R. J. Barendse, The Arabian Seas', 'Sanjay Subrahmanyam, The Portuguese Empire in Asia, 1500-1700', 'M. N. Pearson, The Indian Ocean'],
  },
  mocha: {
    text: 'Mocha is a Red Sea coffee port where warehouses smell of roasted beans, dust, rope, and salt. Ottoman tax collectors watch the bales while Yemeni merchants guard the routes and knowledge that make coffee valuable. The shallow anchorage is awkward for large ships, but the right cargo here can set prices far beyond the harbor.',
    historicalNote: 'Mocha became closely associated with the early modern coffee trade, especially through Yemeni merchant houses and Red Sea connections. European companies entered the trade through negotiation with local commercial and Ottoman administrative structures.',
    sources: ['Nancy Um, The Merchant Houses of Mocha', 'K. N. Chaudhuri, Trade and Civilisation in the Indian Ocean', 'R. J. Barendse, The Arabian Seas'],
  },
  bantam: {
    text: 'Bantam is a pepper port where the Sultan plays foreign merchants against one another with practiced confidence. English and Dutch factors bargain hard, Chinese traders keep accounts, and Javanese officials know the harvest better than any outsider. The harbor rewards patience, but every pepper sack carries politics.',
    historicalNote: 'Bantam was a major western Javanese port in the age of commerce and a key site for early English and Dutch activity. Its rulers used foreign competition to strengthen their own bargaining position.',
    sources: ['Anthony Reid, Southeast Asia in the Age of Commerce', 'M. C. Ricklefs, A History of Modern Indonesia since c.1200', 'Sanjay Subrahmanyam, The Portuguese Empire in Asia, 1500-1700'],
  },
  socotra: {
    text: 'Socotra is remote, spare, and strange, a waystation of dragon\'s blood trees, aloe, ambergris, fishermen, and passing pilots. The anchorage can save a damaged ship, but it offers little comfort and fewer luxuries. Its value lies in location: a hard island near the routes between Arabia, Africa, and India.',
    historicalNote: 'Socotra attracted outside attention because of its position near the Gulf of Aden and its distinctive island products. Portuguese ambitions there were limited by distance, supply problems, and the strength of surrounding regional networks.',
    sources: ['R. J. Barendse, The Arabian Seas', 'M. N. Pearson, The Indian Ocean', 'Edward A. Alpers, The Indian Ocean in World History'],
  },
  diu: {
    text: 'Diu is a fortified island of stone, cannon, customs, and Gujarati commerce. Portuguese walls protect carracks and intimidate rivals, but the bazaar depends on textiles, horses, ivory, and merchants who know the coast better than the garrison does. Every profitable passage between Gujarat and the Arabian Sea leaves a trace in Diu\'s accounts.',
    historicalNote: 'Diu became a crucial Portuguese fortress after the naval conflicts of the early sixteenth century. Its importance lay in controlling access to Gujarat\'s maritime trade while negotiating with powerful Indian merchant communities.',
    sources: ['M. N. Pearson, Merchants and Rulers in Gujarat', 'K. S. Mathew, Portuguese Trade with India', 'Sanjay Subrahmanyam, The Portuguese Empire in Asia, 1500-1700'],
  },
};

const DEFAULT_OVERVIEW: PortOverview = {
  text: 'The harbor is a crossroads of cargo, pilots, gossip, and official scrutiny. Local merchants know which warehouses are full, which captains are desperate, and which authorities can make trade easy or expensive. A careful captain should read the port before opening the hold.',
  historicalNote: 'Indian Ocean ports were shaped by overlapping political authorities, merchant communities, and monsoon rhythms. European forts and companies mattered, but they operated inside older commercial systems rather than replacing them overnight.',
  sources: ['K. N. Chaudhuri, Trade and Civilisation in the Indian Ocean', 'M. N. Pearson, The Indian Ocean', 'Sanjay Subrahmanyam, The Portuguese Empire in Asia, 1500-1700'],
};

const CULTURE_GRADIENT: Record<Culture, string> = {
  'Indian Ocean': 'from-amber-950/25 via-amber-950/10 to-transparent',
  'European': 'from-slate-900/25 via-slate-800/10 to-transparent',
  'Caribbean': 'from-emerald-950/25 via-emerald-950/10 to-transparent',
};

// ── Helpers ──

function isPlaceTab(tab: Tab): tab is PlaceTab {
  return tab !== 'overview';
}

function getPortOverview(portId: string): PortOverview {
  return PORT_OVERVIEWS[portId] ?? DEFAULT_OVERVIEW;
}

function getSeason(dayCount: number): PortSeason {
  const day = ((dayCount - 1) % 365) + 1;
  if (day <= 59 || day >= 306) return 'northeast';
  if (day <= 151) return 'intermonsoon';
  if (day <= 273) return 'southwest';
  return 'postmonsoon';
}

function getSeasonLabel(season: PortSeason): string {
  switch (season) {
    case 'northeast': return 'Northeast monsoon';
    case 'intermonsoon': return 'Intermonsoon';
    case 'southwest': return 'Southwest monsoon';
    case 'postmonsoon': return 'Post-monsoon';
  }
}

function getSeasonalNews(portId: string, season: PortSeason): string {
  const seasonal = {
    northeast: 'The fairer northeasterly winds have brought fresh sails into the roads, and warehouses are beginning to fill before the next outward passages.',
    intermonsoon: 'The air is unsettled and brokers are cautious; captains with good pilots are waiting for the wind to declare itself.',
    southwest: 'The southwest monsoon is making every arrival look hard-won, and repair crews are quoting higher prices for storm-battered hulls.',
    postmonsoon: 'The sea lanes are opening again, and merchants are moving quickly before rivals return with full holds.',
  } satisfies Record<PortSeason, string>;

  const local = {
    calicut: 'Pepper brokers are arguing over weights near the landing steps.',
    goa: 'Customs clerks are watching silk and pepper bales closely along the Mandovi.',
    hormuz: 'Pearl dealers report that Gulf traffic is thin but profitable.',
    malacca: 'News from the strait says cloves and porcelain are changing hands before dawn.',
    aden: 'Coffee and incense caravans have reached the crater bazaar.',
    zanzibar: 'Dhow captains are asking after ivory and ambergris along the coral quays.',
    macau: 'Compradors are holding back silk until the next Japan-bound ship is named.',
    mombasa: 'Swahili pilots say the coast is quiet, but Fort Jesus is not.',
    surat: 'Banian merchants are extending credit to captains with clean reputations.',
    muscat: 'Omani sailors are reading the wind while Portuguese guards count arrivals.',
    mocha: 'Coffee brokers are watching every lighter that leaves the shallows.',
    bantam: 'Pepper factors are bidding before the Sultan\'s agents close the day\'s accounts.',
    socotra: 'Passing pilots are trading news for water, aloe, and resin.',
    diu: 'The fortress customs house is busy with textiles and horse cargoes.',
  } satisfies Record<string, string>;

  return `${seasonal[season]} ${local[portId] ?? 'The harbor is full of small signals: delayed cargo, cautious pilots, and officials asking sharper questions than usual.'}`;
}

function getPortMusicTrack(portId: string) {
  const region = PORT_MUSIC_REGION[portId];
  return region ? PORT_MUSIC_TRACKS[region] : null;
}

// ── Main Component ──

export function PortModal({ onDismiss }: { onDismiss?: () => void }) {
  const {
    activePort, setActivePort, gold, cargo, stats, ship,
    buyCommodity, sellCommodity, repairShip, buyWeapon, sellWeapon, ports, dayCount
  } = useGameStore();

  const handleClose = () => { stopTabAmbientLoop(); sfxClose(); (onDismiss ?? (() => setActivePort(null)))(); };
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [rumor, setRumor] = useState<string | null>(null);
  const [imageError, setImageError] = useState<Record<string, boolean>>({});
  const [showSources, setShowSources] = useState(false);

  // Start/stop tab ambient soundscape
  useEffect(() => {
    if (activePort) startTabAmbient(activeTab);
    return () => { stopTabAmbientLoop(); };
  }, [activeTab, activePort]);

  useEffect(() => {
    if (!activePort) return;
    setActiveTab('overview');
    setRumor(null);
    setShowSources(false);
  }, [activePort?.id]);

  useEffect(() => {
    if (!activePort) return;
    const track = getPortMusicTrack(activePort.id);
    if (track) {
      audioManager.startPortMusic(track.src, track.gain);
    } else {
      audioManager.stopPortMusic();
    }
    return () => { audioManager.stopPortMusic(); };
  }, [activePort?.id]);

  if (!activePort) return null;

  const currentCargo = Object.entries(cargo).reduce(
    (sum, [c, qty]) => sum + qty * (COMMODITY_DEFS[c as Commodity]?.weight ?? 1), 0
  );
  const isFull = currentCargo >= stats.cargoCapacity;
  const info = PORT_INFO[activePort.id];
  const overview = getPortOverview(activePort.id);
  const tabInfo = info && isPlaceTab(activeTab) ? info.tabDescriptions[activeTab] : null;
  const bannerTitle = activeTab === 'overview'
    ? activePort.name
    : tabInfo?.title || activeTab.charAt(0).toUpperCase() + activeTab.slice(1);
  const bannerText = activeTab === 'overview' ? overview.text : tabInfo?.text;
  const season = getSeason(dayCount);
  const harborNews = getSeasonalNews(activePort.id, season);
  const gradient = CULTURE_GRADIENT[activePort.culture] || CULTURE_GRADIENT['Indian Ocean'];

  const handleBuyDrink = () => {
    if (gold >= 5) {
      useGameStore.setState({ gold: gold - 5 });
      setRumor("I heard the Sultan is taxing silk heavily these days. And watch out for pirates in the deep waters to the south!");
      useGameStore.getState().addJournalEntry('crew', tavernTemplate(activePort.name), activePort.name);
    }
  };

  // Image fallback chain: prefer jpg, then png, before falling back to gradients/text.
  const bannerSrc = getPortBannerCandidates(activePort.id, activeTab).find(src => !imageError[src]) ?? null;
  const iconSrc = getPortIconCandidates(activePort.id).find(src => !imageError[src]) ?? null;
  const markImageError = (src: string | null) => {
    if (!src) return;
    setImageError(prev => ({ ...prev, [src]: true }));
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-2 md:p-4 pointer-events-auto"
      onClick={handleClose}
    >
      <motion.div
        onClick={(e) => e.stopPropagation()}
        initial={{ scale: 0.96, y: 12, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.96, y: 12, opacity: 0 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-7xl h-full max-h-[92vh] bg-[#0c1019]/95 backdrop-blur-xl border border-[#2a2d3a]/50 rounded-2xl overflow-hidden flex shadow-[0_16px_64px_rgba(0,0,0,0.6)]"
      >
        {/* ═══════ Left Sidebar (desktop) ═══════ */}
        <div className="hidden md:flex flex-col w-[88px] shrink-0 border-r border-white/[0.04] bg-[#080c14] items-center">
          {/* Port Icon */}
          <div className="pt-4 pb-2">
            <button
              type="button"
              onClick={() => { sfxTab(); setActiveTab('overview'); }}
              title="Overview"
              className={`group w-14 h-14 rounded-full overflow-hidden border-2 bg-white/[0.03] transition-all active:scale-95
                ${activeTab === 'overview'
                  ? 'border-[#c9a84c]/50 shadow-[inset_0_2px_4px_rgba(0,0,0,0.4),0_0_14px_rgba(201,168,76,0.3)]'
                  : 'border-white/[0.08] shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)] hover:border-[#c9a84c]/35'
                }`}
            >
              {iconSrc ? (
                <img
                  key={iconSrc}
                  src={iconSrc}
                  alt=""
                  className="w-full h-full object-cover transition-opacity group-hover:opacity-90"
                  onError={() => markImageError(iconSrc)}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <span className={`text-lg font-bold transition-colors ${activeTab === 'overview' ? 'text-[#c9a84c]' : 'text-slate-600 group-hover:text-slate-400'}`} style={{ fontFamily: '"Fraunces", serif' }}>
                    {activePort.name[0]}
                  </span>
                </div>
              )}
            </button>
          </div>

          {/* Port Name */}
          <div className="px-2 pb-3 text-center border-b border-white/[0.04] w-full">
            <h2 className="text-[12px] font-bold text-slate-200 leading-tight"
              style={{ fontFamily: '"Fraunces", serif' }}>
              {activePort.name}
            </h2>
            {info?.localName && (
              <div className="text-[8px] text-slate-600 mt-0.5" style={{ fontFamily: '"DM Sans", sans-serif' }}>
                {info.localName}
              </div>
            )}
          </div>

          {/* Tab Navigation — glassmorphic circular buttons */}
          <nav className="flex-1 flex flex-col items-center gap-2.5 py-4">
            {TABS.map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => { sfxTab(); setActiveTab(tab.id); }}
                  className={`group relative w-10 h-10 rounded-full flex items-center justify-center
                    transition-all duration-200 active:scale-95
                    ${isActive
                      ? 'bg-[#1a1e2e] border-2 text-slate-200 shadow-[inset_0_2px_4px_rgba(0,0,0,0.4),inset_0_-1px_3px_rgba(255,255,255,0.1),0_0_12px_var(--glow)]'
                      : 'bg-[#1a1e2e] border-2 border-[#3a3530]/50 shadow-[inset_0_2px_4px_rgba(0,0,0,0.5),inset_0_-1px_2px_rgba(255,255,255,0.05),0_1px_4px_rgba(0,0,0,0.4)]'
                    }`}
                  style={{
                    color: isActive ? tab.accent : '#6a6550',
                    borderColor: isActive ? tab.accent + '66' : undefined,
                    '--glow': `rgba(${tab.glow},0.3)`,
                  } as React.CSSProperties}
                  onMouseEnter={(e) => {
                    if (isActive) return;
                    const btn = e.currentTarget;
                    btn.style.color = tab.accent;
                    btn.style.borderColor = tab.accent + '66';
                    btn.style.boxShadow = `inset 0 2px 4px rgba(0,0,0,0.4), inset 0 -1px 3px rgba(255,255,255,0.1), 0 0 12px rgba(${tab.glow},0.3), 0 0 4px rgba(${tab.glow},0.15)`;
                  }}
                  onMouseLeave={(e) => {
                    if (isActive) return;
                    const btn = e.currentTarget;
                    btn.style.color = '#6a6550';
                    btn.style.borderColor = 'rgba(58,53,48,0.5)';
                    btn.style.boxShadow = 'inset 0 2px 4px rgba(0,0,0,0.5), inset 0 -1px 2px rgba(255,255,255,0.05), 0 1px 4px rgba(0,0,0,0.4)';
                  }}
                  title={tab.label}
                >
                  <Icon size={16} />
                  <span className="absolute left-full ml-2 px-2 py-0.5 bg-[#0b1120] border border-slate-700/50 rounded text-[9px] tracking-[0.12em] uppercase text-slate-400 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20">
                    {tab.label}
                  </span>
                </button>
              );
            })}
          </nav>

          {/* Sidebar Stats */}
          <div className="pb-3 pt-2 border-t border-white/[0.04] w-full flex flex-col items-center gap-1.5 text-[9px]" style={{ fontFamily: '"DM Sans", sans-serif' }}>
            <div className="flex items-center gap-1">
              <Coins size={9} className="text-[#fbbf24]" />
              <span className="font-bold text-slate-300 font-mono">{gold.toLocaleString()}</span>
            </div>
            <div className="flex items-center gap-1">
              <Anchor size={9} className="text-slate-500" />
              <span className={`font-bold font-mono ${isFull ? 'text-red-400' : 'text-slate-400'}`}>{currentCargo}/{stats.cargoCapacity}</span>
            </div>
            <div className="flex items-center gap-1">
              <Shield size={9} className={stats.hull < stats.maxHull * 0.3 ? 'text-red-400' : 'text-blue-400'} />
              <span className="font-bold text-slate-400 font-mono">{stats.hull}/{stats.maxHull}</span>
            </div>
          </div>
        </div>

        {/* ═══════ Main Content Area ═══════ */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Banner */}
          <div className={`relative shrink-0 overflow-hidden bg-[#0a0e18] ${
            activeTab === 'overview' ? 'h-[20rem] md:h-[24rem] lg:h-[28rem]' : 'h-44 md:h-52 lg:h-60'
          }`}>
            {bannerSrc ? (
              <img
                key={bannerSrc}
                src={bannerSrc}
                alt=""
                className="absolute inset-0 w-full h-full object-cover"
                onError={() => markImageError(bannerSrc)}
              />
            ) : null}
            {/* Gradient overlays */}
            <div className={`absolute inset-0 bg-gradient-to-t ${gradient}`} />
            <div className="absolute inset-0 bg-gradient-to-t from-[#080c14]/55 via-[#080c14]/12 to-transparent" />
            {/* Left-side darkening for info readability */}
            <div className="absolute inset-0 bg-gradient-to-r from-[#080c14]/35 via-[#080c14]/10 to-transparent hidden md:block" />

            {/* Close button */}
            <button
              onClick={handleClose}
              className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center text-white/50 hover:text-white hover:bg-white/[0.1] rounded-full transition-all z-10"
            >
              <X size={16} />
            </button>

            {/* Banner content — left: historical info, bottom: tab title and description */}
            <div className="absolute inset-0 flex flex-col justify-between p-4 pb-14 md:p-6 z-10">
              {/* Historical info panel (desktop — top-left of banner) */}
              {info && (
                <div className="hidden md:flex items-start gap-5 text-[9px]" style={{ fontFamily: '"DM Sans", sans-serif' }}>
                  <div>
                    <div className="font-bold tracking-[0.12em] uppercase text-white/30">Sovereign</div>
                    <div className="text-white/60 mt-0.5">{info.sovereign}</div>
                    <div className="text-white/30">{info.sovereignType}</div>
                  </div>
                  <div>
                    <div className="font-bold tracking-[0.12em] uppercase text-white/30">Population</div>
                    <div className="text-white/60 font-mono mt-0.5">{info.population}</div>
                  </div>
                  <div>
                    <div className="font-bold tracking-[0.12em] uppercase text-white/30">Language</div>
                    <div className="text-white/60 mt-0.5">{info.languages}</div>
                  </div>
                  <div>
                    <div className="font-bold tracking-[0.12em] uppercase text-white/30">Religion</div>
                    <div className="text-white/60 mt-0.5">{info.religions}</div>
                  </div>
                </div>
              )}

              {/* Bottom of banner: tab title + description */}
              <div className={`${activeTab === 'overview' ? 'max-w-4xl' : 'max-w-3xl'} mt-auto`}>
                {/* Mobile: port name */}
                <div className="md:hidden text-[9px] font-bold tracking-[0.15em] uppercase text-white/40 mb-0.5"
                  style={{ fontFamily: '"DM Sans", sans-serif' }}>
                  {activePort.name} · {activePort.culture}
                </div>
                <h3 className="text-xl md:text-2xl font-bold text-white/90 leading-tight"
                  style={{ fontFamily: '"Fraunces", serif' }}>
                  {bannerTitle}
                </h3>
                {bannerText && (
                  <p className="text-[13px] md:text-sm text-white/55 mt-2 leading-relaxed"
                    style={{ fontFamily: '"Fraunces", serif', fontStyle: 'italic' }}>
                    {bannerText}
                  </p>
                )}
              </div>
            </div>

            {/* Mobile tab bar overlapping banner bottom */}
            <div className="absolute bottom-0 left-0 right-0 md:hidden flex items-center gap-1 px-3 pb-2 pt-8 overflow-x-auto
              bg-gradient-to-t from-[#080c14]/70 to-transparent z-20">
              <button
                type="button"
                onClick={() => { sfxTab(); setActiveTab('overview'); }}
                title="Overview"
                className={`h-7 w-7 shrink-0 rounded-full border flex items-center justify-center overflow-hidden transition-all active:scale-95 ${
                  activeTab === 'overview'
                    ? 'border-[#c9a84c]/60 bg-[#c9a84c]/10 text-[#c9a84c]'
                    : 'border-white/[0.12] bg-white/[0.04] text-white/45 hover:text-white/75'
                }`}
              >
                {iconSrc ? (
                  <img
                    key={`mobile-${iconSrc}`}
                    src={iconSrc}
                    alt=""
                    className="h-full w-full object-cover"
                    onError={() => markImageError(iconSrc)}
                  />
                ) : (
                  <span className="text-[11px] font-bold" style={{ fontFamily: '"Fraunces", serif' }}>
                    {activePort.name[0]}
                  </span>
                )}
              </button>
              {TABS.map(tab => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => { sfxTab(); setActiveTab(tab.id); }}
                    className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold tracking-wider transition-all whitespace-nowrap
                      ${isActive ? 'text-white bg-white/[0.12]' : 'text-white/40 hover:text-white/70'}`}
                    style={{ fontFamily: '"DM Sans", sans-serif' }}
                  >
                    <Icon size={11} />
                    {tab.label}
                  </button>
                );
              })}
              <div className="ml-auto flex items-center gap-2 text-[9px]">
                <span className="flex items-center gap-1 text-white/40">
                  <Coins size={8} className="text-[#fbbf24]" />
                  <span className="font-bold font-mono text-white/60">{gold.toLocaleString()}</span>
                </span>
              </div>
            </div>
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto min-h-0 px-4 md:px-5 py-4">
            <AnimatePresence mode="wait">

              {/* ── Overview ── */}
              {activeTab === 'overview' && (
                <motion.div
                  key="overview"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="grid gap-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]"
                >
                  <section>
                    <div className="text-[9px] font-bold tracking-[0.15em] uppercase text-slate-500 mb-2 px-1"
                      style={{ fontFamily: '"DM Sans", sans-serif' }}>
                      Port Places
                    </div>
                    <div className="grid grid-cols-2 gap-2 md:gap-3">
                      {PLACE_TABS.map(place => {
                        const Icon = place.icon;
                        const placeInfo = info?.tabDescriptions[place.id];
                        const placeImage = getPortBannerCandidates(activePort.id, place.id).find(src => !imageError[src]) ?? null;

                        return (
                          <button
                            key={place.id}
                            onClick={() => { sfxTab(); setActiveTab(place.id); }}
                            className="group min-h-[126px] rounded-lg border border-white/[0.05] bg-white/[0.025] px-3 py-3 text-left transition-all hover:bg-white/[0.055] hover:border-white/[0.11] active:scale-[0.99]"
                          >
                            <div className="flex items-center gap-4">
                              <div className="h-[88px] w-[88px] shrink-0 overflow-hidden rounded-full border border-white/[0.08] bg-[#111827] flex items-center justify-center">
                                {placeImage ? (
                                  <img
                                    key={placeImage}
                                    src={placeImage}
                                    alt=""
                                    className="h-full w-full object-cover opacity-80 transition-opacity group-hover:opacity-100"
                                    onError={() => markImageError(placeImage)}
                                  />
                                ) : (
                                  <Icon size={30} className="text-slate-500 group-hover:text-slate-300 transition-colors" />
                                )}
                              </div>
                              <div className="min-w-0">
                                <div className="text-[12px] md:text-[13px] font-bold text-slate-200 leading-tight"
                                  style={{ fontFamily: '"Fraunces", serif' }}>
                                  {placeInfo?.title ?? place.label}
                                </div>
                                <div className="mt-1 text-[9px] md:text-[10px] uppercase tracking-[0.14em] text-slate-600 group-hover:text-slate-500 transition-colors"
                                  style={{ fontFamily: '"DM Sans", sans-serif' }}>
                                  {place.action}
                                </div>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </section>

                  <aside className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                    <div className="rounded-lg border border-white/[0.05] bg-white/[0.018] px-3 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-[9px] font-bold tracking-[0.15em] uppercase text-slate-500"
                          style={{ fontFamily: '"DM Sans", sans-serif' }}>
                          Harbor News
                        </div>
                        <div className="text-[8px] font-bold tracking-[0.14em] uppercase text-slate-700"
                          style={{ fontFamily: '"DM Sans", sans-serif' }}>
                          Day {dayCount} · {getSeasonLabel(season)}
                        </div>
                      </div>
                      <p className="mt-2 text-[12px] leading-relaxed text-slate-400"
                        style={{ fontFamily: '"Fraunces", serif', fontStyle: 'italic' }}>
                        {harborNews}
                      </p>
                    </div>

                    <div className="rounded-lg border border-white/[0.05] bg-white/[0.018] px-3 py-3">
                      <div className="text-[9px] font-bold tracking-[0.15em] uppercase text-slate-500"
                        style={{ fontFamily: '"DM Sans", sans-serif' }}>
                        Historical Note
                      </div>
                      <p className="mt-2 text-[11px] leading-relaxed text-slate-500"
                        style={{ fontFamily: '"Fraunces", serif', fontStyle: 'italic' }}>
                        {overview.historicalNote}
                      </p>
                      <button
                        onClick={() => setShowSources(v => !v)}
                        className="mt-2 text-[9px] font-bold uppercase tracking-[0.16em] text-slate-500 hover:text-slate-300 transition-colors"
                        style={{ fontFamily: '"DM Sans", sans-serif' }}
                      >
                        {showSources ? 'Hide reading' : 'Read more'}
                      </button>
                      <AnimatePresence>
                        {showSources && (
                          <motion.ul
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.18 }}
                            className="mt-2 space-y-1 overflow-hidden text-[10px] leading-relaxed text-slate-600"
                            style={{ fontFamily: '"DM Sans", sans-serif' }}
                          >
                            {overview.sources.map(source => (
                              <li key={source}>· {source}</li>
                            ))}
                          </motion.ul>
                        )}
                      </AnimatePresence>
                    </div>
                  </aside>
                </motion.div>
              )}

              {/* ── Market ── */}
              {activeTab === 'market' && (
                <motion.div key="market" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                  <MarketTabLedger
                    port={activePort}
                    cargo={cargo}
                    gold={gold}
                    cargoWeight={currentCargo}
                    cargoCapacity={stats.cargoCapacity}
                    ports={ports}
                    buyCommodity={buyCommodity}
                    sellCommodity={sellCommodity}
                  />
                </motion.div>
              )}

              {/* ── Shipyard ── */}
              {activeTab === 'shipyard' && (
                <motion.div key="shipyard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                  <div className="px-3 py-3 rounded-lg border border-white/[0.04] bg-white/[0.02]">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2.5">
                        <Shield size={14} className={stats.hull < stats.maxHull * 0.3 ? 'text-red-400' : stats.hull < stats.maxHull * 0.6 ? 'text-amber-400' : 'text-blue-400'} />
                        <div>
                          <div className="text-[9px] font-bold tracking-[0.12em] uppercase text-slate-500" style={{ fontFamily: '"DM Sans", sans-serif' }}>Hull</div>
                          <div className="text-sm font-mono font-bold text-slate-300">
                            {stats.hull}<span className="text-slate-600">/{stats.maxHull}</span>
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => { sfxCoin(15); repairShip(10, 15); }}
                        disabled={stats.hull >= stats.maxHull || gold < 15}
                        className="px-3 py-1.5 rounded-lg text-[10px] font-bold
                          bg-white/[0.04] border border-white/[0.06] text-slate-300
                          hover:bg-white/[0.08] hover:text-white
                          disabled:opacity-20 disabled:cursor-not-allowed transition-all active:scale-95
                          flex items-center gap-1.5"
                        style={{ fontFamily: '"DM Sans", sans-serif' }}
                      >
                        <Wrench size={10} /> Repair 10 — 15g
                      </button>
                    </div>

                    <div className="h-[4px] bg-white/[0.06] rounded-full overflow-hidden relative">
                      {stats.hull < stats.maxHull && (
                        <div
                          className="absolute top-0 h-full bg-blue-400/10"
                          style={{
                            left: `${(stats.hull / stats.maxHull) * 100}%`,
                            width: `${(Math.min(10, stats.maxHull - stats.hull) / stats.maxHull) * 100}%`,
                          }}
                        />
                      )}
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${(stats.hull / stats.maxHull) * 100}%` }}
                        transition={{ duration: 0.5, ease: 'easeOut' }}
                        className={`h-full rounded-full ${
                          stats.hull < stats.maxHull * 0.3 ? 'bg-red-500 shadow-[0_0_4px_rgba(239,68,68,0.3)]'
                          : stats.hull < stats.maxHull * 0.6 ? 'bg-amber-500 shadow-[0_0_4px_rgba(245,158,11,0.3)]'
                          : 'bg-blue-500 shadow-[0_0_4px_rgba(59,130,246,0.3)]'
                        }`}
                      />
                    </div>
                  </div>

                  {/* ── Armory ── */}
                  <div className="mt-4 px-3 py-3 rounded-lg border border-white/[0.04] bg-white/[0.02]">
                    <div className="text-[9px] font-bold tracking-[0.12em] uppercase text-slate-500 mb-2"
                      style={{ fontFamily: '"DM Sans", sans-serif' }}>
                      Armory — {ship.type} ({stats.armament.filter(w => !WEAPON_DEFS[w].aimable).length} broadside guns)
                    </div>

                    {/* Currently mounted */}
                    {stats.armament.length > 0 && (
                      <div className="mb-3">
                        <div className="text-[8px] uppercase tracking-widest text-slate-600 mb-1">Mounted</div>
                        <div className="flex flex-wrap gap-1">
                          {stats.armament.map((wt, i) => {
                            const def = WEAPON_DEFS[wt];
                            return (
                              <div key={`${wt}-${i}`}
                                className="flex items-center gap-1 px-2 py-1 rounded bg-white/[0.04] border border-white/[0.06]">
                                <span className="text-[10px] text-slate-300" style={{ fontFamily: '"DM Sans", sans-serif' }}>
                                  {def.name}
                                </span>
                                <span className="text-[8px] text-slate-600">dmg:{def.damage}</span>
                                {wt !== 'swivelGun' && (
                                  <button
                                    onClick={() => { sfxCoin(WEAPON_PRICES[wt] / 2); sellWeapon(wt); }}
                                    className="ml-1 text-[8px] text-red-400/60 hover:text-red-400 transition-colors"
                                    title={`Sell for ${Math.floor(WEAPON_PRICES[wt] * 0.5)}g`}
                                  >
                                    ✕
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Available for purchase */}
                    <div className="text-[8px] uppercase tracking-widest text-slate-600 mb-1">Available</div>
                    <div className="space-y-1">
                      {(activePort ? getPortArmory(activePort.id) : [])
                        .filter(wt => wt !== 'swivelGun') // swivel gun comes free, no need to buy
                        .map(wt => {
                          const def = WEAPON_DEFS[wt];
                          const price = WEAPON_PRICES[wt];
                          const canAfford = gold >= price;
                          return (
                            <div key={wt} className="flex items-center justify-between py-1 px-2 rounded bg-white/[0.03] border border-white/[0.04]">
                              <div className="flex-1">
                                <div className="text-[10px] font-bold text-slate-300" style={{ fontFamily: '"DM Sans", sans-serif' }}>
                                  {def.name}
                                </div>
                                <div className="text-[8px] text-slate-500 flex gap-2">
                                  <span>dmg:{def.damage}</span>
                                  <span>rng:{def.range}</span>
                                  <span>reload:{def.reloadTime}s</span>
                                  <span>wt:{def.weight}</span>
                                </div>
                              </div>
                              <button
                                onClick={() => { sfxCoin(price); buyWeapon(wt); }}
                                disabled={!canAfford}
                                className="px-2.5 py-1 rounded text-[9px] font-bold
                                  bg-white/[0.04] border border-white/[0.06] text-slate-300
                                  hover:bg-white/[0.08] hover:text-white
                                  disabled:opacity-20 disabled:cursor-not-allowed transition-all active:scale-95"
                                style={{ fontFamily: '"DM Sans", sans-serif' }}
                              >
                                {price}g
                              </button>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                </motion.div>
              )}

              {/* ── Tavern ── */}
              {activeTab === 'tavern' && (
                <motion.div key="tavern" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                  <div className="px-3 py-4 rounded-lg border border-white/[0.04] bg-white/[0.015]">
                    {rumor ? (
                      <motion.div
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3 }}
                        className="pl-3 border-l-2 border-slate-700"
                      >
                        <div className="text-[9px] font-bold tracking-[0.12em] uppercase text-slate-600 mb-1"
                          style={{ fontFamily: '"DM Sans", sans-serif' }}>
                          Barkeep whispers
                        </div>
                        <p className="text-[12px] text-slate-400 leading-relaxed"
                          style={{ fontFamily: '"Fraunces", serif', fontStyle: 'italic' }}>
                          "{rumor}"
                        </p>
                      </motion.div>
                    ) : (
                      <div className="text-center py-4">
                        <p className="text-[12px] text-slate-500 mb-4 leading-relaxed max-w-md mx-auto"
                          style={{ fontFamily: '"Fraunces", serif', fontStyle: 'italic' }}>
                          The barkeep eyes your purse. A round of drinks might loosen some tongues.
                        </p>
                        <button
                          onClick={() => { sfxCoin(5); handleBuyDrink(); }}
                          disabled={gold < 5}
                          className="px-4 py-2 rounded-lg text-[10px] font-bold
                            bg-white/[0.04] border border-white/[0.06] text-slate-300
                            hover:bg-white/[0.08] hover:text-white
                            disabled:opacity-20 disabled:cursor-not-allowed transition-all active:scale-95
                            inline-flex items-center gap-1.5"
                          style={{ fontFamily: '"DM Sans", sans-serif' }}
                        >
                          <Beer size={11} /> Buy a round — 5g
                        </button>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}

              {/* ── Governor ── */}
              {activeTab === 'governor' && (
                <motion.div key="governor" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                  <div className="px-4 py-6 rounded-lg border border-white/[0.04] bg-white/[0.015] text-center">
                    <Building size={20} className="mx-auto text-slate-700 mb-3" />
                    <div className="text-[10px] font-bold tracking-[0.12em] uppercase text-slate-600 mb-1.5"
                      style={{ fontFamily: '"DM Sans", sans-serif' }}>
                      No Audience Granted
                    </div>
                    <p className="text-[11px] text-slate-600 max-w-sm mx-auto leading-relaxed"
                      style={{ fontFamily: '"Fraunces", serif', fontStyle: 'italic' }}>
                      {info
                        ? `The guards note your approach. "${info.sovereign === 'Portuguese Crown' ? 'The Governor' : 'The ' + info.sovereign} does not grant audiences to unknown captains. Perhaps if your reputation preceded you..."`
                        : 'The guards cross their halberds. "Return later, Captain."'}
                    </p>
                  </div>
                </motion.div>
              )}

            </AnimatePresence>
          </div>

          {/* Footer */}
          <div className="shrink-0 border-t border-white/[0.04] px-5 py-2.5 flex items-center justify-end">
            <button
              onClick={handleClose}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[10px] font-bold tracking-[0.1em] uppercase
                text-slate-400 hover:text-slate-200 hover:bg-white/[0.06] transition-all active:scale-95"
              style={{ fontFamily: '"DM Sans", sans-serif' }}
            >
              <Sailboat size={11} /> Set Sail
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
