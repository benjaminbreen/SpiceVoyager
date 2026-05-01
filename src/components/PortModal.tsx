import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useGameStore, Culture, WEAPON_DEFS, WEAPON_PRICES, WEAPON_DESCRIPTIONS, SHIP_UPGRADES, getPortArmory, getPortUpgrades, lodgingCost, lodgingLabel } from '../store/gameStore';
import type { ShipUpgradeType, RestSummary } from '../store/gameStore';
import { SleepOverlay } from './SleepOverlay';
import { RestSummaryModal } from './RestSummaryModal';
import type { Commodity } from '../utils/commodities';
import {
  COMMODITY_DEFS,
} from '../utils/commodities';
import { audioManager } from '../audio/AudioManager';
import { sfxTab, sfxCoin, sfxClose, sfxHover, startTabAmbient, stopTabAmbientLoop } from '../audio/SoundEffects';
import { getPortBannerCandidates } from '../utils/portAssets';
import { MarketTabLedger } from './MarketTabLedger';
import { PortBannerScene } from './PortBannerScene';
import { TavernTab } from './TavernTab';
import { LeadResolvePrompt } from './quests/LeadResolvePrompt';
import { useIsMobile } from '../utils/useIsMobile';

// Ports whose banner image is a magenta-keyed silhouette and should render
// behind a live time-of-day sky scene rather than as a static `<img>`.
// `nightTextureUrl` is optional — when present, the overlay crossfades to it
// by sunset so windows light up etc.; without it, the day image gets a
// cool-tone tint at night as a graceful fallback.
const ANIMATED_BANNER_PORTS: Record<
  string,
  { textureUrl: string; imageAspect: number; nightTextureUrl?: string; nightImageAspect?: number }
> = {
  manila: {
    textureUrl: '/ports/manila.png',
    imageAspect: 1536 / 672,
    nightTextureUrl: '/sleep/manila.png',
    nightImageAspect: 1344 / 768,
  },
};
import { modalBackdropMotion, modalContentMotion, modalPanelMotion } from '../utils/uiMotion';
import {
  X, Coins, Shield, Anchor, ShoppingBag,
  Wrench, Beer, Building, Sailboat,
  Package, Wind, Heart, Hammer, Check, Moon,
} from 'lucide-react';

export type PlaceTab = 'market' | 'shipyard' | 'tavern' | 'governor';
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

const MOBILE_TAB_LABEL: Record<PlaceTab, string> = {
  market: 'Market',
  shipyard: 'Yard',
  tavern: 'Tavern',
  governor: 'Gov',
};

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

  // ── European Ports ───────────────────────────────────────────────────────────
  lisbon: {
    sovereign: 'Philip III of Spain',
    sovereignType: 'Iberian Union',
    population: '~150,000',
    languages: 'Portuguese · Castilian',
    religions: 'Catholic',
    tabDescriptions: {
      market: { title: 'Rua Nova dos Mercadores', text: 'The covered arcades of the Rua Nova are the commercial heart of the city. Pepper is sold by the quintal, Chinese porcelain by the crate. New Christian merchants dominate the wholesale trade, while smaller dealers crowd the streets running uphill toward the Rossio.' },
      shipyard: { title: 'Ribeira das Naus', text: 'The royal shipyard stretches along the Tagus below the palace. This is where the great carracks of the Carreira da Índia are built and refitted — vessels of 1,000 tons and more. Indian teak supplements local pine and oak. The yard is busy but aging, and skilled shipwrights are harder to find than they were a generation ago.' },
      tavern: { title: 'Taberna do Cais', text: 'A low stone room off the Ribeira docks, dark even at noon. Douro wine by the jug, salt cod on the board. Returned India hands drink alongside Genoese factors, African freedmen, and New Christians keeping a low profile. The Inquisition has informants everywhere, so conversations run carefully.' },
      governor: { title: 'Paço da Ribeira', text: 'The royal palace on the waterfront sits empty of its own king — Portugal has been ruled from Madrid since 1580. A council of governors administers the kingdom on Philip III\'s behalf. The Casa da Índia, which controls all Eastern trade, operates from the ground floor of the palace itself. Petitions for trading licenses can take months.' },
    },
  },
  amsterdam: {
    sovereign: 'States-General',
    sovereignType: 'Dutch Republic',
    population: '~100,000',
    languages: 'Dutch',
    religions: 'Calvinist · Mennonite · Jewish',
    tabDescriptions: {
      market: { title: 'The Bourse', text: 'The new Amsterdam Exchange, opened just last year, is already the busiest trading floor in Europe. Merchants trade futures in pepper, grain, and VOC shares. Prices here set the market for half the continent.' },
      shipyard: { title: 'Admiralty Yard', text: 'The wharves along the IJ can build and outfit anything from a herring buss to a 600-ton East Indiaman. Dutch shipwrights are the best in Europe — their fluyt design carries more cargo with fewer crew than any vessel afloat. Timber comes from the Baltic, canvas from Haarlem, tar from Scandinavia.' },
      tavern: { title: 'De Gouden Haring', text: 'A packed herberg on the Warmoesstraat, warm with pipe smoke and the smell of beer. VOC sailors on shore leave, Baltic skippers, Sephardic merchants speaking Portuguese among themselves. Jenever is cheap, opinions are loud, and the war news from Flanders is always a few weeks old.' },
      governor: { title: 'Stadhuis', text: 'Amsterdam is governed by its burgomasters and the city council, not by a king. The VOC\'s Heeren XVII — the seventeen directors — wield as much power as any prince. Stadholder Maurits of Orange leads the war against Spain but has limited authority here. The city runs on trade, and trade runs on consensus.' },
    },
  },
  seville: {
    sovereign: 'Philip III of Spain',
    sovereignType: 'Kingdom of Castile',
    population: '~120,000',
    languages: 'Castilian',
    religions: 'Catholic',
    tabDescriptions: {
      market: { title: 'Gradas de la Catedral', text: 'The steps of the cathedral serve as an open-air exchange where merchants close deals on American silver, cochineal, indigo, tobacco, and chocolate. Flemish textile dealers, Genoese bankers, and Castilian factors crowd the arcade.' },
      shipyard: { title: 'Atarazanas', text: 'The old Moorish arsenals along the Guadalquivir handle repairs and refitting, but the river is too shallow and silting for serious shipbuilding — most new construction has moved to the coast. Smaller vessels and river barges are maintained here. For anything larger, you go to Cádiz or Sanlúcar.' },
      tavern: { title: 'El Arenal', text: 'A rough wine house in the Arenal district by the river, where sailors, stevedores, and galeón crews crowd the benches. Sherry from Jerez, olives, fried fish. Soldiers waiting for passage to the Indies sit alongside returning colonists spending their first night back in Spain. Card games run late and end badly.' },
      governor: { title: 'Casa de Contratación', text: 'All trade with the Americas passes through the Casa de Contratación, housed in the Alcázar. Royal officials register every ship, every cargo, every passenger bound for the Indies. The bureaucracy is enormous and slow. Genoese bankers have more influence than most of the officials — they finance the Crown\'s debts with American silver.' },
    },
  },
  london: {
    sovereign: 'James I',
    sovereignType: 'Kingdom of England',
    population: '~200,000',
    languages: 'English',
    religions: 'Protestant (Anglican)',
    tabDescriptions: {
      market: { title: 'Royal Exchange', text: 'Gresham\'s Royal Exchange, modeled on the Antwerp Bourse, is where London\'s merchants gather to trade. The ground-floor arcade sells luxury goods — Venetian glass, Spanish gloves, East Indian pepper at prices that would make a Lisbon factor wince. Apothecaries on nearby Bucklersbury sell drugs and spices by the ounce.' },
      shipyard: { title: 'Deptford Dockyard', text: 'The royal dockyard at Deptford, downstream from London Bridge, has built warships since Henry VIII\'s day. Private yards at Rotherhithe and Ratcliffe handle merchant vessels. English ships are smaller than Portuguese carracks or Dutch fluyts, but well-armed and increasingly ambitious.' },
      tavern: { title: 'The Prospect of Whitby', text: 'A low-beamed riverside tavern at Wapping, where the tide slaps against the pilings below the floor. Watermen, EIC sailors, and Ratcliffe shipwrights drink small beer and smoke Virginia tobacco from clay pipes. News from the Virginia colony and the first tentative EIC voyages to the Spice Islands is the talk of the room.' },
      governor: { title: 'Guildhall', text: 'The Lord Mayor and aldermen govern the City of London from the Guildhall, jealously guarding its ancient liberties from the Crown at Westminster. The East India Company holds a royal charter but raises its own capital through joint stock subscriptions. Power here is mercantile — the great livery companies have more practical authority than most earls.' },
    },
  },

  // ── West African Ports ───────────────────────────────────────────────────────
  elmina: {
    localName: 'São Jorge da Mina',
    sovereign: 'Portuguese Crown',
    sovereignType: 'Colonial Fortress',
    population: '~15,000',
    languages: 'Akan (Fante) · Portuguese',
    religions: 'Animist · Catholic',
    tabDescriptions: {
      market: { title: 'Castle Courtyard', text: 'Gold dust is the currency and the commodity. Akan traders arrive from the interior with gold weighed in brass weights shaped like animals and proverbs. They want Indian textiles, Venetian beads, iron bars, and brass manillas. The Portuguese factor mediates every transaction, taking his cut.' },
      shipyard: { title: 'Castle Beach', text: 'There is no proper shipyard — vessels anchor offshore and send boats through the surf. Emergency hull repairs are done on the beach east of the castle, with local timber and pitch brought from the forest. For anything serious, a ship must limp to Lisbon or make do.' },
      tavern: { title: 'The Castle Cellar', text: 'A vaulted room beneath the fortress, lit by tallow candles. The garrison drinks palm wine and whatever Portuguese wine survives the voyage south. Fante traders, mulatto intermediaries, and Portuguese soldiers share the space with less ease than the close quarters require.' },
      governor: { title: 'Captain\'s Quarters', text: 'The Captain of São Jorge da Mina governs from the upper floor of the castle, answering to the Crown in Lisbon. His authority extends about as far as the fortress guns carry. Trade with the Akan kingdoms depends entirely on the goodwill of local chiefs and brokers. The garrison is small, underpaid, and dying of fever at a steady rate.' },
    },
  },
  luanda: {
    localName: 'São Paulo de Luanda',
    sovereign: 'Portuguese Crown',
    sovereignType: 'Colonial',
    population: '~3,000',
    languages: 'Kimbundu · Portuguese',
    religions: 'Catholic · Animist',
    tabDescriptions: {
      market: { title: 'Slave Market', text: 'The trade here is in human beings. Captives brought from the interior are held in barracoons near the shore, inspected, branded, and loaded onto ships for the middle passage to Bahia and Pernambuco. Nzimbu shells from the Ilha de Luanda serve as local currency. There is little else to buy.' },
      shipyard: { title: 'Beach Repair', text: 'There is no shipyard. Ships anchor in the bay and send damaged spars and rigging ashore for patching. Hull work means careening on the beach with whatever materials are at hand. The nearest proper yard is in Salvador, across the Atlantic.' },
      tavern: { title: 'The Ilha', text: 'Less a tavern than a palm-roofed shelter on the sand spit where off-duty soldiers and sailors drink palm wine and aguardente. The breeze off the water is the only relief from the heat. Conversation is limited — the men posted here talk about when their term ends and how many of them will live to see it.' },
      governor: { title: 'Governor\'s Fortress', text: 'The Governor of Angola rules from a stone fortress overlooking the bay. His primary business is the slave trade — securing captives from the wars in the interior and shipping them to Brazil. The Jesuits run a college and baptize the enslaved before embarkation. Relations with the Kingdom of Ndongo shift between uneasy alliance and open war.' },
    },
  },

  // ── Atlantic American Ports ──────────────────────────────────────────────────
  salvador: {
    sovereign: 'Portuguese Crown',
    sovereignType: 'Colonial Capital',
    population: '~25,000',
    languages: 'Portuguese · Tupi · West African languages',
    religions: 'Catholic',
    tabDescriptions: {
      market: { title: 'Praça do Comércio', text: 'Sugar chests, tobacco rolls, and brazilwood logs pile up on the quay waiting for ships to Lisbon. The slave market operates nearby — newly arrived Africans are sold at auction to agents from the Recôncavo plantations. A few apothecaries sell quinine bark, ipecacuanha, and other New World drugs alongside imported European medicines.' },
      shipyard: { title: 'Ribeira Yard', text: 'A working colonial shipyard in the lower town, capable of building coastal vessels and refitting ocean-going ships. Brazilian hardwoods — jacarandá, peroba — are abundant and rot-resistant. The yard stays busy repairing sugar fleet vessels and fitting out ships for the Africa trade.' },
      tavern: { title: 'Taverna do Porto', text: 'A dockside establishment in the lower town, where the smell of cane rum and fried manioc competes with the harbor stench. Sugar planters\' agents, ship captains, slave traders, and freedmen share the crowded tables. Cachaça is cheap and rough.' },
      governor: { title: 'Palácio do Governo', text: 'The Governor-General of Brazil administers the colony from the upper town, overlooking the bay. Sugar is the foundation of everything — the Crown taxes it, the planters grow it, and enslaved Africans produce it. The Jesuits operate missions in the interior and wield considerable influence. The Dutch have been raiding the coast, and the fortifications are being strengthened.' },
    },
  },
  havana: {
    sovereign: 'Philip III of Spain',
    sovereignType: 'Captaincy General of Cuba',
    population: '~10,000',
    languages: 'Castilian',
    religions: 'Catholic',
    tabDescriptions: {
      market: { title: 'Plaza de Armas', text: 'When the fleet is in port, the plaza is a provisioning market — salt beef, biscuit, water casks, ship chandlery. At other times, it trades in tobacco, hides, and local produce. There is little spice or luxury trade here; Havana exists to move silver across the Atlantic and to keep the ships that carry it afloat.' },
      shipyard: { title: 'Royal Shipyard', text: 'Havana\'s shipyard is one of the best in the Americas. Cuban hardwoods — mahogany, cedar, guayacán — produce hulls that outlast European-built vessels by years. The yard builds and repairs galleons for the treasure fleet, and skilled carpenters are always in demand. The Crown subsidizes the operation directly.' },
      tavern: { title: 'La Bodeguita', text: 'A rough stone-walled room near the harbor where fleet sailors, garrison soldiers, and local traders drink cheap Spanish wine and aguardiente. When the treasure fleet is in port, the place is packed and dangerous. When the fleet sails, it\'s half-empty. Cuban tobacco is smoked everywhere.' },
      governor: { title: 'Real Fuerza', text: 'The Captain General governs from the Castillo de la Real Fuerza, the oldest stone fort in the Americas. His primary duty is ensuring the treasure fleet assembles safely and departs on schedule. The garrison is large and expensive, paid for by Mexican silver. Corsairs are a constant preoccupation — every governor lives with the memory of Drake.' },
    },
  },
  cartagena: {
    sovereign: 'Philip III of Spain',
    sovereignType: 'Governorate of Cartagena',
    population: '~20,000',
    languages: 'Castilian',
    religions: 'Catholic',
    tabDescriptions: {
      market: { title: 'Plaza de la Aduana', text: 'The customs house plaza is where legal trade happens — silver bars stamped with the royal quinto, emeralds from the Muzo mines, pearls from Cubagua and Margarita. The slave market operates nearby, supplied by the asiento. Contraband is at least as large as the legal trade, and everyone from the Governor down takes a cut.' },
      shipyard: { title: 'Bahía Yard', text: 'The calm waters of the enclosed bay make for good repair facilities. Galleons from the silver fleet are careened and refitted here before the crossing to Havana. Local timber is adequate for hull patching, and experienced caulkers are available. Full construction is limited — for a new hull, ships are built in Havana.' },
      tavern: { title: 'El Galeón', text: 'A stone-floored tavern near the customs house where Spanish officers, Genoese merchants, and mulatto boatmen drink aguardiente and wine from Andalusia. Enslaved Africans serve the tables. When the silver fleet is in port, the prices double and the crowd triples. Rumors about English and Dutch raiders circulate with every round.' },
      governor: { title: 'Governor\'s Palace', text: 'The Governor of Cartagena answers to the Viceroy of New Granada, but in practice runs the city as a military and commercial stronghold. The Inquisition established its tribunal here in 1610 and has already begun proceedings against accused heretics and crypto-Jews. The fortifications are constantly being expanded — the memory of Drake\'s sacking in 1586 drives every budget decision.' },
    },
  },

  // ── Cape Route Waypoint ──────────────────────────────────────────────────────
  cape: {
    sovereign: 'None',
    sovereignType: 'Khoikhoi territory',
    population: 'Seasonal camps',
    languages: 'Khoikhoi',
    religions: 'Khoikhoi traditional',
    tabDescriptions: {
      market: { title: 'Barter on the Beach', text: 'If the Khoikhoi come, they bring cattle and sheep, which they trade for iron, copper, tobacco, and beads. The exchange is unpredictable — some encounters go well, others end in misunderstanding or theft on both sides. Fresh meat is desperately needed after months at sea, so captains swallow their frustration.' },
      shipyard: { title: 'Beach Careening', text: 'There is no shipyard. Ships that need emergency hull work are careened on the beach at considerable risk — the southeaster can blow up in hours and strand a vessel on its side. Spare timber must come from the ship\'s own stores.' },
      tavern: { title: 'The Watering Place', text: 'Crews gather at the freshwater stream that runs down from the mountain, filling casks and washing clothes while keeping one eye on the weather. When the Khoikhoi come to trade, this is where it happens — cattle and sheep driven down to the stream bank, iron and copper goods laid out on the rocks. On calm evenings, sailors build driftwood fires on the beach.' },
      governor: { title: 'Khoikhoi Chiefs', text: 'The clans that graze their cattle on the slopes below Table Mountain have their own leaders, but there is no single authority a ship captain can negotiate with. One visit you might deal with a cooperative elder willing to trade a dozen head of cattle; the next, a different clan has moved through and wants nothing to do with you. The Dutch and English have both tried leaving letters and gifts to establish ongoing relations. Results have been mixed.' },
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
  'West African': 'from-yellow-950/25 via-yellow-950/10 to-transparent',
  'Atlantic': 'from-emerald-950/25 via-emerald-950/10 to-transparent',
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

export function PortModal({ onDismiss, initialTab }: { onDismiss?: () => void; initialTab?: PlaceTab }) {
  const {
    activePort, setActivePort, gold, cargo, stats, ship, crew,
    buyCommodity, sellCommodity, repairShip, buyWeapon, sellWeapon, buyUpgrade,
    shipUpgrades, worldSeed, ports, dayCount, restAtInn
  } = useGameStore();

  const handleClose = () => { stopTabAmbientLoop(); sfxClose(); (onDismiss ?? (() => setActivePort(null)))(); };
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [imageError, setImageError] = useState<Record<string, boolean>>({});
  const [showSources, setShowSources] = useState(false);
  // Inn rest state — moved up from TavernTab so the trigger lives in the
  // modal footer next to "Set Sail" and works from any tab.
  const [resting, setResting] = useState(false);
  const [restSummary, setRestSummary] = useState<RestSummary | null>(null);
  const { isMobile } = useIsMobile();

  // Start/stop tab ambient soundscape (with regional climate layer)
  useEffect(() => {
    if (activePort) startTabAmbient(activeTab, activePort.id);
    return () => { stopTabAmbientLoop(); };
  }, [activeTab, activePort]);

  useEffect(() => {
    if (!activePort) return;
    setActiveTab(initialTab ?? 'overview');
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
    return () => {
      // If the player rested at the inn during this modal session, play
      // "After the Night" as the morning-departure theme instead of
      // letting the normal overworld rotation resume.
      const justRested = useGameStore.getState().pendingAfterNightMusic;
      if (justRested) {
        useGameStore.getState().setPendingAfterNightMusic(false);
        audioManager.startAfterNightMusic();
      } else {
        audioManager.stopPortMusic();
      }
    };
  }, [activePort?.id]);

  const restCost = activePort ? lodgingCost(activePort.scale) : 0;
  const lodgingName = activePort ? lodgingLabel(activePort.culture) : '';

  const handleRest = () => {
    if (!activePort || gold < restCost || resting) return;
    sfxCoin(restCost);
    setResting(true);
    audioManager.startInnMusic();
    // Same timing dance as the old TavernTab handler — give the SleepOverlay
    // its fade-in before resolving game state, then a beat before the summary.
    setTimeout(() => {
      const summary = restAtInn(activePort);
      setTimeout(() => {
        setResting(false);
        setTimeout(() => {
          if (summary) setRestSummary(summary);
        }, 600);
      }, 3500);
    }, 5000);
  };

  const handleDismissSummary = () => {
    setRestSummary(null);
    audioManager.stopInnMusic();
  };

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

  // Image fallback chain: prefer jpg, then png, before falling back to gradients/text.
  const bannerSrc = getPortBannerCandidates(activePort.id, activeTab).find(src => !imageError[src]) ?? null;
  const bannerHeightClass = isMobile
    ? activeTab === 'overview'
      ? 'h-36'
      : 'h-28'
    : activeTab === 'overview'
      ? 'h-[14rem] md:h-[24rem] lg:h-[28rem] max-h-[38vh]'
      : 'h-44 md:h-64 lg:h-72 max-h-[32vh]';
  const markImageError = (src: string | null) => {
    if (!src) return;
    setImageError(prev => ({ ...prev, [src]: true }));
  };

  return (
    <motion.div
      {...modalBackdropMotion}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-0 md:p-4 pointer-events-auto"
      onClick={handleClose}
    >
      <motion.div
        data-testid="port-modal"
        onClick={(e) => e.stopPropagation()}
        {...modalPanelMotion}
        className={`w-full bg-[#0c1019]/95 backdrop-blur-xl border border-[#2a2d3a]/50 overflow-hidden flex shadow-[0_16px_64px_rgba(0,0,0,0.6)] ${
          isMobile
            ? 'h-[var(--app-height)] max-h-none rounded-none'
            : 'max-w-7xl h-full max-h-[92vh] rounded-2xl'
        }`}
      >
        {/* ═══════ Left Sidebar (desktop) ═══════ */}
        <div className="hidden md:flex flex-col w-[88px] shrink-0 border-r border-white/[0.04] bg-[#080c14] items-center">
          {/* Port Icon */}
          <div className="pt-4 pb-2">
            <button
              type="button"
              onClick={() => { sfxTab(); setActiveTab('overview'); }}
              aria-selected={activeTab === 'overview'}
              title="Overview"
              className={`group w-14 h-14 rounded-full overflow-hidden border-2 bg-white/[0.03] transition-all active:scale-95
                ${activeTab === 'overview'
                  ? 'border-[#c9a84c]/50 shadow-[inset_0_2px_4px_rgba(0,0,0,0.4),0_0_14px_rgba(201,168,76,0.3)]'
                  : 'border-white/[0.08] shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)] hover:border-[#c9a84c]/35'
                }`}
            >
              <div className="w-full h-full flex items-center justify-center">
                <span className={`text-lg font-bold transition-colors ${activeTab === 'overview' ? 'text-[#c9a84c]' : 'text-slate-600 group-hover:text-slate-400'}`} style={{ fontFamily: '"Fraunces", serif' }}>
                  {activePort.name[0]}
                </span>
              </div>
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
                  data-testid={`port-tab-${tab.id}`}
                  onClick={() => { sfxTab(); setActiveTab(tab.id); }}
                  aria-selected={isActive}
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
                    sfxHover();
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
          {/* Active-lead arrival prompt — visible across all tabs. Renders
              nothing if no leads target this port. */}
          <LeadResolvePrompt />
          {/* Banner */}
          <div data-testid="port-modal-banner" className={`relative shrink-0 overflow-hidden bg-[#0a0e18] ${bannerHeightClass}`}>
            {(() => {
              const animated = activeTab === 'overview' ? ANIMATED_BANNER_PORTS[activePort.id] : undefined;
              if (animated) {
                return (
                  <PortBannerScene
                    textureUrl={animated.textureUrl}
                    imageAspect={animated.imageAspect}
                    nightTextureUrl={animated.nightTextureUrl}
                    nightImageAspect={animated.nightImageAspect}
                  />
                );
              }
              return bannerSrc ? (
                <img
                  key={bannerSrc}
                  src={bannerSrc}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover"
                  onError={() => markImageError(bannerSrc)}
                />
              ) : null;
            })()}
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
            <div className="absolute inset-0 flex flex-col justify-end p-4 md:justify-between md:p-6 z-10">
              {/* Historical info panel (desktop — top-left of banner) */}
              {info && (
                <div className="hidden md:flex items-start gap-5 text-[13px]" style={{ fontFamily: '"DM Sans", sans-serif' }}>
                  <div>
                    <div className="font-semibold tracking-[0.15em] uppercase text-white/70 text-[10px]">Sovereign</div>
                    <div className="text-white/100 mt-0.5">{info.sovereign}</div>
                    <div className="text-white/60">{info.sovereignType}</div>
                  </div>
                  <div>
                    <div className="font-semibold tracking-[0.15em] uppercase text-white/70 text-[10px]">Population</div>
                    <div className="text-white/60 font-mono mt-0.5">{info.population}</div>
                  </div>
                  <div>
                    <div className="font-semibold tracking-[0.15em] uppercase text-white/70 text-[10px]">Language</div>
                    <div className="text-white/60 mt-0.5">{info.languages}</div>
                  </div>
                  <div>
                    <div className="font-semibold tracking-[0.15em] uppercase text-white/70 text-[10px]">Religion</div>
                    <div className="text-white/60 mt-0.5">{info.religions}</div>
                  </div>
                </div>
              )}

              {/* Bottom of banner: tab title + description */}
              <div className={`${activeTab === 'overview' ? 'max-w-4xl' : activeTab === 'shipyard' ? 'max-w-5xl' : 'max-w-3xl'} mt-auto`}>
                {/* Mobile: port name */}
                <div className="md:hidden text-[11px] font-bold tracking-[0.15em] uppercase text-white/40 mb-0.5"
                  style={{ fontFamily: '"DM Sans", sans-serif' }}>
                  {activePort.name} · {activePort.culture}
                </div>
                <h3 className="text-2xl md:text-4xl font-bold text-white/90 leading-tight"
                  style={{ fontFamily: '"Fraunces", serif' }}>
                  {bannerTitle}
                </h3>
                {bannerText && (
                  <p className="text-sm md:text-lg text-white/55 mt-1.5 md:mt-2 leading-relaxed overflow-hidden [display:-webkit-box] [-webkit-line-clamp:2] [-webkit-box-orient:vertical] md:[display:block]"
                    style={{ fontFamily: '"Fraunces", serif', fontStyle: 'italic' }}>
                    {bannerText}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Mobile place switcher — outside the image so it remains readable
              and does not compete with the hero copy. */}
          <div className="md:hidden shrink-0 border-b border-white/[0.06] bg-[#080c14]/96 px-2.5 py-2">
            <div className="grid grid-cols-5 gap-1">
              <button
                type="button"
                onClick={() => { sfxTab(); setActiveTab('overview'); }}
                aria-selected={activeTab === 'overview'}
                title="Overview"
                className={`flex h-11 flex-col items-center justify-center gap-0.5 rounded-lg border transition-all active:scale-95 ${
                  activeTab === 'overview'
                    ? 'border-[#c9a84c]/70 bg-[#c9a84c]/12 text-[#c9a84c] shadow-[0_0_12px_rgba(201,168,76,0.18)]'
                    : 'border-white/[0.12] bg-white/[0.04] text-white/48'
                }`}
              >
                <span className="text-[13px] font-bold leading-none" style={{ fontFamily: '"Fraunces", serif' }}>
                  {activePort.name[0]}
                </span>
                <span className="text-[8px] font-bold uppercase tracking-[0.08em]" style={{ fontFamily: '"DM Sans", sans-serif' }}>Info</span>
              </button>
              {TABS.map(tab => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    data-testid={`port-tab-mobile-${tab.id}`}
                    onClick={() => { sfxTab(); setActiveTab(tab.id); }}
                    aria-selected={isActive}
                    className={`flex h-11 flex-col items-center justify-center gap-0.5 rounded-lg border text-[9px] font-bold uppercase tracking-[0.08em] transition-all active:scale-95 ${
                      isActive
                        ? 'border-white/[0.16] bg-white/[0.12] text-white'
                        : 'border-white/[0.07] bg-white/[0.035] text-white/50'
                    }`}
                    style={{ fontFamily: '"DM Sans", sans-serif' }}
                  >
                    <Icon size={13} style={{ color: isActive ? tab.accent : undefined }} />
                    {MOBILE_TAB_LABEL[tab.id]}
                  </button>
                );
              })}
            </div>
            <div className="mt-2 flex items-center justify-between gap-3 px-1 text-[10px] text-white/45" style={{ fontFamily: '"DM Sans", sans-serif' }}>
              <span className="flex items-center gap-1">
                <Coins size={10} className="text-[#fbbf24]" />
                <span className="font-bold font-mono text-white/70">{gold.toLocaleString()}</span>
              </span>
              <span className="flex items-center gap-1">
                <Anchor size={10} className="text-slate-500" />
                <span className={`font-bold font-mono ${isFull ? 'text-red-300' : 'text-white/60'}`}>{currentCargo}/{stats.cargoCapacity}</span>
              </span>
              <span className="flex items-center gap-1">
                <Shield size={10} className={stats.hull < stats.maxHull * 0.3 ? 'text-red-300' : 'text-blue-300'} />
                <span className="font-bold font-mono text-white/60">{stats.hull}/{stats.maxHull}</span>
              </span>
            </div>
          </div>

          {/* Tab Content. Tavern needs a height-constrained flex column so
              its inner chat scrolls in place; other tabs keep block flow with
              their own overflow-y-auto. Without this swap the chat just grew
              the wrapper and pushed the suggestion/input bar below the fold. */}
          <div
            className={`flex-1 min-h-0 px-3 md:px-5 py-3 md:py-4 ${
              activeTab === 'tavern'
                ? 'flex flex-col overflow-hidden'
                : 'overflow-y-auto'
            }`}
          >
            <AnimatePresence mode="wait">

              {/* ── Overview ── */}
              {activeTab === 'overview' && (
                <motion.div
                  key="overview"
                  {...modalContentMotion}
                  className="grid gap-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]"
                >
                  <section>
                    <div className="text-[11px] font-bold tracking-[0.15em] uppercase text-slate-500 mb-2 px-1"
                      style={{ fontFamily: '"DM Sans", sans-serif' }}>
                      Port Places
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:gap-3">
                      {PLACE_TABS.map(place => {
                        const Icon = place.icon;
                        const placeInfo = info?.tabDescriptions[place.id];
                        const placeImage = getPortBannerCandidates(activePort.id, place.id).find(src => !imageError[src]) ?? null;

                        return (
                          <button
                            key={place.id}
                            onMouseEnter={() => sfxHover()}
                            onClick={() => { sfxTab(); setActiveTab(place.id); }}
                            className="group min-h-[76px] rounded-lg border border-white/[0.05] bg-white/[0.025] px-3 py-2.5 text-left transition-all hover:bg-white/[0.055] hover:border-white/[0.11] active:scale-[0.99] md:min-h-[140px] md:py-3"
                          >
                            <div className="flex items-center gap-3 md:gap-4">
                              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-full border border-white/[0.08] bg-[#111827] flex items-center justify-center md:h-[110px] md:w-[110px]">
                                {placeImage ? (
                                  <img
                                    key={placeImage}
                                    src={placeImage}
                                    alt=""
                                    className="h-full w-full object-cover scale-125 opacity-80 transition-opacity group-hover:opacity-100"
                                    onError={() => markImageError(placeImage)}
                                  />
                                ) : (
                                  <Icon size={36} className="text-slate-500 group-hover:text-slate-300 transition-colors" />
                                )}
                              </div>
                              <div className="min-w-0">
                                <div className="text-[15px] md:text-[17px] font-bold text-slate-200 leading-tight"
                                  style={{ fontFamily: '"Fraunces", serif' }}>
                                  {placeInfo?.title ?? place.label}
                                </div>
                                <div className="mt-1 text-[10px] md:mt-1.5 md:text-[12px] uppercase tracking-[0.14em] text-slate-600 group-hover:text-slate-500 transition-colors"
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
                        <div className="text-[11px] font-bold tracking-[0.15em] uppercase text-slate-500"
                          style={{ fontFamily: '"DM Sans", sans-serif' }}>
                          Harbor News
                        </div>
                        <div className="text-[9px] font-bold tracking-[0.14em] uppercase text-slate-700"
                          style={{ fontFamily: '"DM Sans", sans-serif' }}>
                          Day {dayCount} · {getSeasonLabel(season)}
                        </div>
                      </div>
                      <p className="mt-2 text-[13px] leading-relaxed text-slate-400"
                        style={{ fontFamily: '"Fraunces", serif', fontStyle: 'italic' }}>
                        {harborNews}
                      </p>
                    </div>

                    <div className="rounded-lg border border-white/[0.05] bg-white/[0.018] px-3 py-3">
                      <div className="text-[11px] font-bold tracking-[0.15em] uppercase text-slate-500"
                        style={{ fontFamily: '"DM Sans", sans-serif' }}>
                        Historical Note
                      </div>
                      <p className="mt-2 text-[13px] leading-relaxed text-slate-500"
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
                <motion.div key="market" {...modalContentMotion}>
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
                <motion.div key="shipyard" {...modalContentMotion}
                  className="space-y-3">

                  {/* ── Hull Status & Repair ── */}
                  <div className="px-3 py-3 rounded-lg border border-white/[0.04] bg-white/[0.02]">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2.5">
                        <Shield size={16} className={stats.hull < stats.maxHull * 0.3 ? 'text-red-400' : stats.hull < stats.maxHull * 0.6 ? 'text-amber-400' : 'text-blue-400'} />
                        <div>
                          <div className="text-[10px] font-bold tracking-[0.12em] uppercase text-slate-500" style={{ fontFamily: '"DM Sans", sans-serif' }}>Hull Integrity</div>
                          <div className="text-base font-mono font-bold text-slate-300">
                            {stats.hull}<span className="text-slate-600">/{stats.maxHull}</span>
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => { sfxCoin(15); repairShip(10, 15); }}
                        disabled={stats.hull >= stats.maxHull || gold < 15}
                        className="px-3 py-1.5 rounded-lg text-[11px] font-bold
                          bg-white/[0.04] border border-white/[0.06] text-slate-300
                          hover:bg-white/[0.08] hover:text-white
                          disabled:opacity-20 disabled:cursor-not-allowed transition-all active:scale-95
                          flex items-center gap-1.5"
                        style={{ fontFamily: '"DM Sans", sans-serif' }}
                      >
                        <Wrench size={11} /> Repair 10 hull — 15g
                      </button>
                    </div>

                    <div className="h-[5px] bg-white/[0.06] rounded-full overflow-hidden relative">
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

                    {/* Ship stats summary */}
                    <div className="flex gap-4 mt-2.5 text-[11px] text-slate-500" style={{ fontFamily: '"DM Sans", sans-serif' }}>
                      <span className="flex items-center gap-1"><Wind size={10} /> Speed {stats.speed}</span>
                      <span className="flex items-center gap-1"><Anchor size={10} /> Turn {stats.turnSpeed.toFixed(1)}</span>
                      <span className="flex items-center gap-1"><Package size={10} /> Cargo {stats.cargoCapacity}</span>
                    </div>
                  </div>

                  {/* ── Two-column grid: Armory | Ship Upgrades ── */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">

                    {/* ── Armory (left column) ── */}
                    <div className="px-3 py-3 rounded-lg border border-white/[0.04] bg-white/[0.02]">
                      <div className="text-[11px] font-bold tracking-[0.1em] uppercase text-slate-400 mb-2.5"
                        style={{ fontFamily: '"DM Sans", sans-serif' }}>
                        Armory — {ship.type} ({stats.armament.filter(w => !WEAPON_DEFS[w].aimable).length} broadside guns)
                      </div>

                      {/* Currently mounted */}
                      {stats.armament.length > 0 && (
                        <div className="mb-3">
                          <div className="text-[10px] uppercase tracking-widest text-slate-600 mb-1.5">Mounted</div>
                          <div className="flex flex-wrap gap-1.5">
                            {stats.armament.map((wt, i) => {
                              const def = WEAPON_DEFS[wt];
                              return (
                                <div key={`${wt}-${i}`}
                                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-white/[0.04] border border-white/[0.06]">
                                  <span className="text-[12px] font-semibold text-slate-300" style={{ fontFamily: '"DM Sans", sans-serif' }}>
                                    {def.name}
                                  </span>
                                  <span className="text-[10px] text-slate-500">{def.damage} dmg</span>
                                  {wt !== 'swivelGun' && (
                                    <button
                                      onClick={() => { sfxCoin(WEAPON_PRICES[wt] / 2); sellWeapon(wt); }}
                                      className="ml-0.5 text-[10px] text-red-400/60 hover:text-red-400 transition-colors"
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
                      <div className="text-[10px] uppercase tracking-widest text-slate-600 mb-1.5">Available</div>
                      <div className="space-y-1.5">
                        {(activePort ? getPortArmory(activePort.id) : [])
                          .filter(wt => wt !== 'swivelGun')
                          .map(wt => {
                            const def = WEAPON_DEFS[wt];
                            const desc = WEAPON_DESCRIPTIONS[wt];
                            const price = WEAPON_PRICES[wt];
                            const canAfford = gold >= price;
                            return (
                              <div key={wt} className="flex items-center justify-between py-2 px-3 rounded-md bg-white/[0.03] border border-white/[0.05]">
                                <div className="flex-1 mr-3">
                                  <div className="text-[13px] font-bold text-slate-200" style={{ fontFamily: '"DM Sans", sans-serif' }}>
                                    {def.name}
                                  </div>
                                  <div className="text-[10px] text-slate-500 italic mb-1" style={{ fontFamily: '"DM Sans", sans-serif' }}>
                                    {desc.flavor}
                                  </div>
                                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-400" style={{ fontFamily: '"DM Sans", sans-serif' }}>
                                    <span><strong className="text-slate-300">{def.damage}</strong> damage</span>
                                    <span>{desc.rangeLabel} range</span>
                                    <span>Fires every {def.reloadTime}s</span>
                                    <span>{desc.weightLabel}</span>
                                  </div>
                                </div>
                                <button
                                  onClick={() => { sfxCoin(price); buyWeapon(wt); }}
                                  disabled={!canAfford}
                                  className="px-3 py-1.5 rounded-md text-[11px] font-bold whitespace-nowrap
                                    bg-blue-500/10 border border-blue-400/20 text-blue-300
                                    hover:bg-blue-500/20 hover:text-blue-200
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

                    {/* ── Ship Upgrades (right column) ── */}
                    <div className="px-3 py-3 rounded-lg border border-white/[0.04] bg-white/[0.02]">
                      <div className="text-[11px] font-bold tracking-[0.1em] uppercase text-slate-400 mb-2.5"
                        style={{ fontFamily: '"DM Sans", sans-serif' }}>
                        Ship Upgrades
                      </div>

                      {/* Already installed */}
                      {shipUpgrades.length > 0 && (
                        <div className="mb-3">
                          <div className="text-[10px] uppercase tracking-widest text-slate-600 mb-1.5">Installed</div>
                          <div className="flex flex-wrap gap-1.5">
                            {shipUpgrades.map(ut => {
                              const upg = SHIP_UPGRADES[ut];
                              return (
                                <div key={ut}
                                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-emerald-500/5 border border-emerald-400/15">
                                  <Check size={10} className="text-emerald-400" />
                                  <span className="text-[12px] font-semibold text-slate-300" style={{ fontFamily: '"DM Sans", sans-serif' }}>
                                    {upg.name}
                                  </span>
                                  <span className="text-[10px] text-emerald-400/70">{upg.effect}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Available upgrades */}
                      {(() => {
                        const available = activePort ? getPortUpgrades(activePort.id, worldSeed).filter(ut => !shipUpgrades.includes(ut)) : [];
                        if (available.length === 0) return (
                          <div className="text-[11px] text-slate-600 italic py-2" style={{ fontFamily: '"DM Sans", sans-serif' }}>
                            No upgrades available at this port.
                          </div>
                        );
                        return (
                          <div className="space-y-1.5">
                            {available.map(ut => {
                              const upg = SHIP_UPGRADES[ut];
                              const canAfford = gold >= upg.price;
                              return (
                                <div key={ut} className="py-2 px-3 rounded-md bg-white/[0.03] border border-white/[0.05]">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="flex-1">
                                      <div className="text-[13px] font-bold text-slate-200" style={{ fontFamily: '"DM Sans", sans-serif' }}>
                                        {upg.name}
                                      </div>
                                      <div className="text-[10px] text-slate-500 italic mb-1" style={{ fontFamily: '"DM Sans", sans-serif' }}>
                                        {upg.description}
                                      </div>
                                      <div className="text-[11px] font-semibold text-amber-400/80" style={{ fontFamily: '"DM Sans", sans-serif' }}>
                                        {upg.effect}
                                      </div>
                                    </div>
                                    <button
                                      onClick={() => { sfxCoin(upg.price); buyUpgrade(ut); }}
                                      disabled={!canAfford}
                                      className="px-3 py-1.5 rounded-md text-[11px] font-bold whitespace-nowrap
                                        bg-emerald-500/10 border border-emerald-400/20 text-emerald-300
                                        hover:bg-emerald-500/20 hover:text-emerald-200
                                        disabled:opacity-20 disabled:cursor-not-allowed transition-all active:scale-95 shrink-0"
                                      style={{ fontFamily: '"DM Sans", sans-serif' }}
                                    >
                                      {upg.price}g
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </div>

                  </div>
                </motion.div>
              )}

              {/* ── Tavern (always mounted so state persists across tab switches) ── */}
              <div
                style={{ display: activeTab === 'tavern' ? 'flex' : 'none' }}
                className="flex-col flex-1 min-h-0"
              >
                <TavernTab port={activePort} />
              </div>

              {/* ── Governor ── */}
              {activeTab === 'governor' && (
                <motion.div key="governor" {...modalContentMotion}>
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
          <div
            className="shrink-0 border-t border-white/[0.04] px-3 py-2 md:px-5 md:py-2.5 flex items-center justify-end gap-2"
            style={isMobile ? { paddingBottom: 'calc(0.5rem + var(--sai-bottom))' } : undefined}
          >
            <button
              onClick={handleRest}
              disabled={gold < restCost || resting}
              className="flex min-h-11 flex-1 items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-[13px] md:flex-none md:px-6 md:text-[15px] font-bold tracking-[0.08em] uppercase
                text-slate-300 hover:text-white hover:bg-white/[0.08] border border-white/[0.08] hover:border-white/[0.15] transition-all active:scale-95
                disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-300 disabled:hover:border-white/[0.08]"
              style={{ fontFamily: '"DM Sans", sans-serif' }}
              title={`Sleep at the ${lodgingName} until morning`}
            >
              <Moon size={17} /> <span className="truncate">Rest</span><span className="hidden md:inline"> at {lodgingName}</span>
              <span className="ml-1 text-[12px] font-normal text-slate-500 tracking-normal normal-case">
                {restCost}g
              </span>
            </button>
            <button
              onClick={handleClose}
              className="flex min-h-11 flex-1 items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-[13px] md:flex-none md:px-6 md:text-[15px] font-bold tracking-[0.08em] uppercase
                text-slate-300 hover:text-white hover:bg-white/[0.08] border border-white/[0.08] hover:border-white/[0.15] transition-all active:scale-95"
              style={{ fontFamily: '"DM Sans", sans-serif' }}
            >
              <Sailboat size={18} /> Set Sail
            </button>
          </div>
        </div>

        {/* Inn rest overlay + summary — scoped to the port modal so they
            cover the modal but not the rest of the canvas. */}
        <SleepOverlay
          active={resting}
          portId={activePort.id}
          portName={activePort.name}
          lodgingName={lodgingName}
          dayCount={dayCount}
        />
        <RestSummaryModal
          summary={restSummary}
          crew={crew}
          onDismiss={handleDismissSummary}
        />
      </motion.div>
    </motion.div>
  );
}
