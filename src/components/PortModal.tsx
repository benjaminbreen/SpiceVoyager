import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useGameStore, Commodity, Culture } from '../store/gameStore';
import { CORE_PORTS } from '../utils/portArchetypes';
import { tavernTemplate } from '../utils/journalTemplates';
import { sfxTab, sfxCoin, sfxClick, sfxClose, startTabAmbient, stopTabAmbientLoop } from '../audio/SoundEffects';
import {
  X, Coins, Shield, Anchor, ShoppingBag,
  Wrench, Beer, Building, Sailboat, ChevronDown, ChevronUp,
} from 'lucide-react';

// ── Constants ──

const COMMODITIES: Commodity[] = ['Spices', 'Silk', 'Tea', 'Wood', 'Cannonballs'];

const AVG_PRICES: Record<Commodity, number> = {
  Spices: 28, Silk: 40, Tea: 20, Wood: 10, Cannonballs: 14,
};

type Tab = 'market' | 'shipyard' | 'tavern' | 'governor';

const TABS: { id: Tab; icon: typeof ShoppingBag; label: string; accent: string; glow: string }[] = [
  { id: 'market', icon: ShoppingBag, label: 'Market', accent: '#fbbf24', glow: '251,191,36' },
  { id: 'shipyard', icon: Wrench, label: 'Shipyard', accent: '#60a5fa', glow: '96,165,250' },
  { id: 'tavern', icon: Beer, label: 'Tavern', accent: '#34d399', glow: '52,211,153' },
  { id: 'governor', icon: Building, label: 'Governor', accent: '#a78bfa', glow: '167,139,250' },
];

// ── Historical Port Data (c. 1612) ──

interface PortInfo {
  localName?: string;
  sovereign: string;
  sovereignType: string;
  population: string;
  languages: string;
  religions: string;
  tabDescriptions: Record<Tab, { title: string; text: string }>;
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
};

const CULTURE_GRADIENT: Record<Culture, string> = {
  'Indian Ocean': 'from-amber-950/70 via-amber-950/30 to-transparent',
  'European': 'from-slate-900/70 via-slate-800/30 to-transparent',
  'Caribbean': 'from-emerald-950/70 via-emerald-950/30 to-transparent',
};

// ── Helpers ──

/** Resolve banner image: tab-specific → port default → null (use gradient) */
function getBannerSrc(portId: string, tab: Tab): string | null {
  // Will try: /ports/calicut-market.jpg → /ports/calicut.jpg → null
  // For now all images are optional; the component handles missing images via onError
  return `/ports/${portId}-${tab}.jpg`;
}

function getDefaultBannerSrc(portId: string): string {
  return `/ports/${portId}.jpg`;
}

function getIconSrc(portId: string): string {
  return `/ports/${portId}-icon.jpg`;
}

// ── Main Component ──

export function PortModal({ onDismiss }: { onDismiss?: () => void }) {
  const {
    activePort, setActivePort, gold, cargo, stats,
    buyCommodity, sellCommodity, repairShip, ports
  } = useGameStore();

  const handleClose = () => { stopTabAmbientLoop(); sfxClose(); (onDismiss ?? (() => setActivePort(null)))(); };
  const [activeTab, setActiveTab] = useState<Tab>('market');
  const [rumor, setRumor] = useState<string | null>(null);
  const [descExpanded, setDescExpanded] = useState(false);
  const [bannerError, setBannerError] = useState<Record<string, boolean>>({});

  // Start/stop tab ambient soundscape
  useEffect(() => {
    if (activePort) startTabAmbient(activeTab);
    return () => { stopTabAmbientLoop(); };
  }, [activeTab, activePort]);

  if (!activePort) return null;

  const currentCargo = Object.values(cargo).reduce((a, b) => a + b, 0);
  const isFull = currentCargo >= stats.cargoCapacity;
  const portDef = CORE_PORTS.find(p => p.id === activePort.id);
  const info = PORT_INFO[activePort.id];
  const tabInfo = info?.tabDescriptions[activeTab];
  const gradient = CULTURE_GRADIENT[activePort.culture] || CULTURE_GRADIENT['Indian Ocean'];

  const handleBuyDrink = () => {
    if (gold >= 5) {
      useGameStore.setState({ gold: gold - 5 });
      setRumor("I heard the Sultan is taxing silk heavily these days. And watch out for pirates in the deep waters to the south!");
      useGameStore.getState().addJournalEntry('crew', tavernTemplate(activePort.name), activePort.name);
    }
  };

  const getAvg = (c: Commodity) => {
    if (ports.length > 1) return ports.reduce((s, p) => s + p.prices[c], 0) / ports.length;
    return AVG_PRICES[c];
  };

  // Banner image fallback chain
  const tabBannerKey = `${activePort.id}-${activeTab}`;
  const defaultBannerKey = activePort.id;
  const showTabBanner = !bannerError[tabBannerKey];
  const showDefaultBanner = !showTabBanner && !bannerError[defaultBannerKey];
  const bannerSrc = showTabBanner
    ? getBannerSrc(activePort.id, activeTab)
    : showDefaultBanner
      ? getDefaultBannerSrc(activePort.id)
      : null;

  const onBannerError = () => {
    if (showTabBanner) {
      setBannerError(prev => ({ ...prev, [tabBannerKey]: true }));
    } else if (showDefaultBanner) {
      setBannerError(prev => ({ ...prev, [defaultBannerKey]: true }));
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-3 md:p-5 pointer-events-auto"
      onClick={handleClose}
    >
      <motion.div
        onClick={(e) => e.stopPropagation()}
        initial={{ scale: 0.96, y: 12, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.96, y: 12, opacity: 0 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-6xl h-full max-h-[88vh] bg-[#0c1019]/95 backdrop-blur-xl border border-[#2a2d3a]/50 rounded-2xl overflow-hidden flex shadow-[0_16px_64px_rgba(0,0,0,0.6)]"
      >
        {/* ═══════ Left Sidebar (desktop) ═══════ */}
        <div className="hidden md:flex flex-col w-[88px] shrink-0 border-r border-white/[0.04] bg-[#080c14] items-center">
          {/* Port Icon */}
          <div className="pt-4 pb-2">
            <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-white/[0.08] bg-white/[0.03]
              shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)]">
              <img
                src={getIconSrc(activePort.id)}
                alt=""
                className="w-full h-full object-cover"
                onError={(e) => {
                  const el = e.currentTarget;
                  el.style.display = 'none';
                  el.parentElement!.classList.add('flex', 'items-center', 'justify-center');
                  const span = document.createElement('span');
                  span.className = 'text-lg font-bold text-slate-600';
                  span.style.fontFamily = '"Fraunces", serif';
                  span.textContent = activePort.name[0];
                  el.parentElement!.appendChild(span);
                }}
              />
            </div>
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
                  onClick={() => { sfxTab(); setActiveTab(tab.id); setDescExpanded(false); }}
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
          <div className="relative h-48 md:h-60 shrink-0 overflow-hidden bg-[#0a0e18]">
            {bannerSrc ? (
              <img
                key={bannerSrc}
                src={bannerSrc}
                alt=""
                className="absolute inset-0 w-full h-full object-cover"
                onError={onBannerError}
              />
            ) : null}
            {/* Gradient overlays */}
            <div className={`absolute inset-0 bg-gradient-to-t ${gradient}`} />
            <div className="absolute inset-0 bg-gradient-to-t from-[#080c14] via-[#080c14]/40 to-transparent" />
            {/* Left-side darkening for info readability */}
            <div className="absolute inset-0 bg-gradient-to-r from-[#080c14]/80 via-[#080c14]/30 to-transparent hidden md:block" />

            {/* Close button */}
            <button
              onClick={handleClose}
              className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center text-white/50 hover:text-white hover:bg-white/[0.1] rounded-full transition-all z-10"
            >
              <X size={16} />
            </button>

            {/* Banner content — left: historical info, bottom-right: tab title */}
            <div className="absolute inset-0 flex flex-col justify-between p-4 md:p-5 z-10">
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

              {/* Bottom of banner: tab title + port description */}
              <div className="mt-auto">
                {/* Mobile: port name */}
                <div className="md:hidden text-[9px] font-bold tracking-[0.15em] uppercase text-white/40 mb-0.5"
                  style={{ fontFamily: '"DM Sans", sans-serif' }}>
                  {activePort.name} · {activePort.culture}
                </div>
                <h3 className="text-lg md:text-xl font-bold text-white/90 leading-tight"
                  style={{ fontFamily: '"Fraunces", serif' }}>
                  {tabInfo?.title || activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}
                </h3>
                {portDef && (
                  <p className="text-[10px] text-white/30 mt-0.5 hidden md:block max-w-lg"
                    style={{ fontFamily: '"Fraunces", serif', fontStyle: 'italic' }}>
                    {portDef.description}
                  </p>
                )}
              </div>
            </div>

            {/* Mobile tab bar overlapping banner bottom */}
            <div className="absolute bottom-0 left-0 right-0 md:hidden flex items-center gap-1 px-3 pb-2 pt-8
              bg-gradient-to-t from-[#080c14] to-transparent z-20">
              {TABS.map(tab => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => { sfxTab(); setActiveTab(tab.id); setDescExpanded(false); }}
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

          {/* Description (collapsible) */}
          {tabInfo && (
            <button
              onClick={() => setDescExpanded(!descExpanded)}
              className="w-full text-left px-5 py-2.5 border-b border-white/[0.04] flex items-start gap-2 hover:bg-white/[0.02] transition-colors group"
            >
              <p className={`text-[11px] text-slate-500 leading-relaxed flex-1 ${descExpanded ? '' : 'line-clamp-2'}`}
                style={{ fontFamily: '"Fraunces", serif', fontStyle: 'italic' }}>
                {tabInfo.text}
              </p>
              <span className="text-slate-600 group-hover:text-slate-400 transition-colors shrink-0 mt-0.5">
                {descExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </span>
            </button>
          )}

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto min-h-0 px-4 md:px-5 py-4">
            <AnimatePresence mode="wait">

              {/* ── Market ── */}
              {activeTab === 'market' && (
                <motion.div key="market" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                  <div className="text-[9px] font-bold tracking-[0.15em] uppercase text-slate-500 mb-2 px-1"
                    style={{ fontFamily: '"DM Sans", sans-serif' }}>
                    Trade Goods
                  </div>

                  <div className="space-y-0.5">
                    {COMMODITIES.map(c => {
                      const price = activePort.prices[c];
                      const avg = getAvg(c);
                      const portInv = activePort.inventory[c];
                      const playerInv = cargo[c];
                      const canBuy = gold >= price && portInv > 0 && !isFull;
                      const canSell = playerInv > 0;

                      const ratio = price / avg;
                      const isCheap = ratio < 0.85;
                      const isPricey = ratio > 1.15;
                      const barPct = Math.min(100, Math.max(8, (price / (avg * 2)) * 100));
                      const pipColor = isCheap ? '#34d399' : isPricey ? '#f87171' : '#475569';
                      const barBg = isCheap ? 'bg-emerald-500/40' : isPricey ? 'bg-red-500/30' : 'bg-slate-500/25';

                      return (
                        <div key={c} className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-white/[0.03] transition-colors">
                          <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: pipColor }} />
                          <span className="text-[12px] text-slate-300 font-medium w-24 shrink-0" style={{ fontFamily: '"DM Sans", sans-serif' }}>{c}</span>
                          <span className="text-[11px] font-mono font-bold text-slate-300 w-10 text-right shrink-0">{price}g</span>

                          <div className="w-20 h-[3px] bg-white/[0.06] rounded-full overflow-hidden shrink-0 relative">
                            <div className="absolute top-0 bottom-0 w-px bg-white/[0.12]" style={{ left: '50%' }} />
                            <div className={`h-full rounded-full ${barBg}`} style={{ width: `${barPct}%` }} />
                          </div>

                          <span className="text-[8px] font-bold tracking-wider w-8 shrink-0" style={{ color: pipColor }}>
                            {isCheap ? 'LOW' : isPricey ? 'HIGH' : ''}
                          </span>

                          <div className="flex items-center gap-3 text-[9px] text-slate-600 ml-auto shrink-0" style={{ fontFamily: '"DM Sans", sans-serif' }}>
                            <span>{playerInv}<span className="text-slate-700"> ship</span></span>
                            <span>{portInv}<span className="text-slate-700"> port</span></span>
                          </div>

                          <div className="flex gap-1 shrink-0">
                            <button
                              onClick={() => { sfxCoin(); sellCommodity(c, 1); }}
                              disabled={!canSell}
                              className="px-2.5 py-1 text-[10px] font-bold rounded text-slate-400
                                hover:bg-white/[0.06] hover:text-slate-200
                                disabled:opacity-20 disabled:cursor-not-allowed transition-all active:scale-95"
                            >
                              Sell
                            </button>
                            <button
                              onClick={() => { sfxCoin(); buyCommodity(c, 1); }}
                              disabled={!canBuy}
                              className="px-2.5 py-1 text-[10px] font-bold rounded text-slate-300
                                hover:bg-white/[0.08] hover:text-white
                                disabled:opacity-20 disabled:cursor-not-allowed transition-all active:scale-95"
                            >
                              Buy
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
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
                        onClick={() => { sfxCoin(); repairShip(10, 15); }}
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
                          onClick={() => { sfxCoin(); handleBuyDrink(); }}
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
