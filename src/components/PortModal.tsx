import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useGameStore, Commodity } from '../store/gameStore';
import { tavernTemplate } from '../utils/journalTemplates';
import { 
  X, Coins, Shield, Anchor, ShoppingBag, 
  Wrench, Beer, Building, MapPin 
} from 'lucide-react';

const COMMODITIES: Commodity[] = ['Spices', 'Silk', 'Tea', 'Wood', 'Cannonballs'];

type Tab = 'market' | 'shipyard' | 'tavern' | 'governor';

export function PortModal() {
  const { 
    activePort, setActivePort, gold, cargo, stats, 
    buyCommodity, sellCommodity, repairShip 
  } = useGameStore();

  const [activeTab, setActiveTab] = useState<Tab>('market');
  const [rumor, setRumor] = useState<string | null>(null);

  if (!activePort) return null;

  const currentCargo = Object.values(cargo).reduce((a, b) => a + b, 0);
  const isFull = currentCargo >= stats.cargoCapacity;

  // Determine banner image based on culture
  let bannerSeed = 'port';
  if (activePort.culture === 'Indian Ocean') bannerSeed = 'indianocean,spice';
  if (activePort.culture === 'European') bannerSeed = 'european,harbor';
  if (activePort.culture === 'Caribbean') bannerSeed = 'caribbean,colonial';

  const handleBuyDrink = () => {
    if (gold >= 5) {
      useGameStore.setState({ gold: gold - 5 });
      setRumor("I heard the Sultan is taxing silk heavily these days. And watch out for pirates in the deep waters to the south!");
      useGameStore.getState().addJournalEntry('crew', tavernTemplate(activePort.name), activePort.name);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 md:p-8"
    >
      <motion.div 
        initial={{ scale: 0.95, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 20 }}
        className="w-full max-w-4xl h-full max-h-[90vh] bg-slate-900 border border-amber-700/50 rounded-xl overflow-hidden flex flex-col shadow-2xl"
      >
        {/* Header / Banner */}
        <div className="relative h-40 md:h-56 shrink-0">
          <img 
            src={`https://picsum.photos/seed/${bannerSeed}/1200/400`} 
            alt="Port Banner" 
            className="absolute inset-0 w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/60 to-transparent" />
          
          <button 
            onClick={() => setActivePort(null)}
            className="absolute top-4 right-4 p-2 bg-black/50 hover:bg-red-500/80 text-white rounded-full backdrop-blur-md transition-colors"
          >
            <X size={24} />
          </button>

          <div className="absolute bottom-4 left-4 md:left-8 right-4">
            <div className="flex items-center gap-2 text-amber-400 mb-1">
              <MapPin size={16} />
              <span className="text-sm font-bold tracking-widest uppercase">{activePort.culture} • {activePort.scale}</span>
            </div>
            <h2 className="text-3xl md:text-5xl font-serif font-bold text-white drop-shadow-lg">
              {activePort.name}
            </h2>
            <p className="text-slate-300 text-sm md:text-base mt-1 max-w-2xl hidden md:block">
              A bustling hub of commerce and culture. The docks are crowded with merchants, sailors, and opportunists looking to make their fortune.
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex overflow-x-auto border-b border-white/10 shrink-0 bg-slate-900/50">
          <TabButton active={activeTab === 'market'} onClick={() => setActiveTab('market')} icon={<ShoppingBag size={18} />} label="Market" />
          <TabButton active={activeTab === 'shipyard'} onClick={() => setActiveTab('shipyard')} icon={<Wrench size={18} />} label="Shipyard" />
          <TabButton active={activeTab === 'tavern'} onClick={() => setActiveTab('tavern')} icon={<Beer size={18} />} label="Tavern" />
          <TabButton active={activeTab === 'governor'} onClick={() => setActiveTab('governor')} icon={<Building size={18} />} label="Governor" />
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-slate-900">
          <AnimatePresence mode="wait">
            {activeTab === 'market' && (
              <motion.div key="market" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="space-y-4">
                <div className="flex justify-between items-end mb-6 border-b border-white/10 pb-4">
                  <div>
                    <h3 className="text-2xl font-serif text-amber-400">Local Market</h3>
                    <p className="text-sm text-slate-400">Trade goods to increase your wealth.</p>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-slate-400">Cargo Space</div>
                    <div className={`font-bold ${isFull ? 'text-red-400' : 'text-white'}`}>{currentCargo} / {stats.cargoCapacity}</div>
                  </div>
                </div>

                <div className="grid gap-3">
                  {COMMODITIES.map(c => {
                    const price = activePort.prices[c];
                    const portInv = activePort.inventory[c];
                    const playerInv = cargo[c];
                    const canBuy = gold >= price && portInv > 0 && !isFull;
                    const canSell = playerInv > 0;

                    return (
                      <div key={c} className="flex flex-col md:flex-row md:items-center justify-between p-4 bg-slate-800/50 rounded-xl border border-white/5 hover:border-amber-500/30 transition-colors">
                        <div className="flex justify-between md:w-1/3 mb-3 md:mb-0">
                          <span className="font-bold text-lg text-amber-100">{c}</span>
                          <span className="text-amber-400 font-mono text-lg">{price}g</span>
                        </div>
                        
                        <div className="flex justify-between md:w-1/3 text-sm text-slate-400 mb-4 md:mb-0 md:px-8">
                          <div className="flex flex-col items-center">
                            <span className="text-xs uppercase tracking-wider">Ship</span>
                            <span className="font-bold text-white text-base">{playerInv}</span>
                          </div>
                          <div className="flex flex-col items-center">
                            <span className="text-xs uppercase tracking-wider">Port</span>
                            <span className="font-bold text-white text-base">{portInv}</span>
                          </div>
                        </div>

                        <div className="flex gap-2 md:w-1/3 justify-end">
                          <button 
                            onClick={() => sellCommodity(c, 1)} 
                            disabled={!canSell}
                            className="flex-1 md:flex-none px-6 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg font-bold text-white transition-colors"
                          >
                            Sell
                          </button>
                          <button 
                            onClick={() => buyCommodity(c, 1)} 
                            disabled={!canBuy}
                            className="flex-1 md:flex-none px-6 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg font-bold text-white transition-colors"
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

            {activeTab === 'shipyard' && (
              <motion.div key="shipyard" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
                <h3 className="text-2xl font-serif text-amber-400 mb-6">Shipyard</h3>
                
                <div className="p-6 bg-slate-800/50 rounded-xl border border-white/5 flex flex-col md:flex-row items-center justify-between gap-6">
                  <div className="flex items-center gap-6">
                    <div className="w-16 h-16 rounded-full bg-slate-900 flex items-center justify-center border border-amber-900/50">
                      <Shield size={32} className={stats.hull < stats.maxHull / 2 ? 'text-red-400' : 'text-blue-400'} />
                    </div>
                    <div>
                      <h4 className="text-lg font-bold text-white">Hull Integrity</h4>
                      <div className="text-slate-400">{stats.hull} / {stats.maxHull}</div>
                    </div>
                  </div>
                  
                  <button 
                    onClick={() => repairShip(10, 15)}
                    disabled={stats.hull >= stats.maxHull || gold < 15}
                    className="w-full md:w-auto px-8 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg font-bold text-white transition-colors flex items-center justify-center gap-2"
                  >
                    <Wrench size={18} /> Repair 10 Hull (15g)
                  </button>
                </div>
              </motion.div>
            )}

            {activeTab === 'tavern' && (
              <motion.div key="tavern" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
                <h3 className="text-2xl font-serif text-amber-400 mb-6">The Rusty Anchor Tavern</h3>
                
                <div className="p-6 bg-slate-800/50 rounded-xl border border-white/5">
                  <p className="text-slate-300 italic mb-8 text-lg leading-relaxed">
                    The tavern is loud, smelling strongly of stale ale, sweat, and sea salt. 
                    A grizzled barkeep wipes down a sticky table while eyeing your coin purse.
                  </p>

                  {rumor ? (
                    <div className="p-4 bg-slate-900 rounded-lg border border-amber-900/50 text-amber-200">
                      <span className="font-bold text-amber-500">Barkeep says:</span> "{rumor}"
                    </div>
                  ) : (
                    <button 
                      onClick={handleBuyDrink}
                      disabled={gold < 5}
                      className="px-6 py-3 bg-amber-700 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg font-bold text-white transition-colors flex items-center gap-2"
                    >
                      <Beer size={18} /> Buy a round of drinks (5g)
                    </button>
                  )}
                </div>
              </motion.div>
            )}

            {activeTab === 'governor' && (
              <motion.div key="governor" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
                <h3 className="text-2xl font-serif text-amber-400 mb-6">Governor's Mansion</h3>
                
                <div className="p-12 bg-slate-800/50 rounded-xl border border-white/5 text-center">
                  <Building size={48} className="mx-auto text-slate-600 mb-4" />
                  <h4 className="text-xl font-bold text-slate-300 mb-2">No Audience Granted</h4>
                  <p className="text-slate-500 max-w-md mx-auto">
                    The guards cross their halberds as you approach. "The Governor is currently dealing with matters of state. Return later, Captain."
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="h-20 bg-slate-950 border-t border-white/10 shrink-0 flex items-center justify-between px-4 md:px-8">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 text-yellow-400 font-bold text-xl">
              <Coins size={24} /> {gold.toLocaleString()}
            </div>
            <div className="hidden md:flex items-center gap-2 text-blue-300">
              <Shield size={20} /> {stats.hull}/{stats.maxHull}
            </div>
            <div className="hidden md:flex items-center gap-2 text-amber-300">
              <Anchor size={20} /> {currentCargo}/{stats.cargoCapacity}
            </div>
          </div>
          
          <button 
            onClick={() => setActivePort(null)}
            className="px-8 py-3 bg-slate-100 hover:bg-white text-slate-900 rounded-lg font-bold transition-colors uppercase tracking-wider"
          >
            Set Sail
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-6 py-4 font-bold transition-colors border-b-2 whitespace-nowrap ${
        active 
          ? 'border-amber-400 text-amber-400 bg-amber-400/10' 
          : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-white/5'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
