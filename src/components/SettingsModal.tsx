import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '../store/gameStore';
import {
  X, Globe, Monitor, Volume2, Gamepad2, Info,
  Copy, Shuffle, Rocket, Check,
} from 'lucide-react';

type SettingsTab = 'world' | 'display' | 'audio' | 'gameplay' | 'about';

const TABS: { id: SettingsTab; label: string; icon: typeof Globe }[] = [
  { id: 'world',    label: 'World',    icon: Globe },
  { id: 'display',  label: 'Display',  icon: Monitor },
  { id: 'audio',    label: 'Audio',    icon: Volume2 },
  { id: 'gameplay', label: 'Gameplay', icon: Gamepad2 },
  { id: 'about',    label: 'About',    icon: Info },
];

export function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const worldSeed = useGameStore(s => s.worldSeed);
  const setWorldSeed = useGameStore(s => s.setWorldSeed);
  const [tab, setTab] = useState<SettingsTab>('world');
  const [newSeed, setNewSeed] = useState('');
  const [copied, setCopied] = useState(false);

  const handleCopySeed = () => {
    navigator.clipboard.writeText(String(worldSeed));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleRandomSeed = () => {
    setNewSeed(String(Math.floor(Math.random() * 100000)));
  };

  const handleLaunchVoyage = () => {
    const seed = parseInt(newSeed, 10);
    if (!isNaN(seed) && seed > 0) {
      setWorldSeed(seed);
      onClose();
      // Reload to regenerate world with new seed
      window.location.reload();
    }
  };

  if (!open) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-6 pointer-events-auto"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ scale: 0.95, y: 20, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.95, y: 20, opacity: 0 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-3xl h-[520px] flex rounded-xl overflow-hidden
          bg-[#0c1019]/95 backdrop-blur-xl border border-[#2a2d3a]/50
          shadow-[0_16px_64px_rgba(0,0,0,0.6)]"
      >
        {/* Left tab strip */}
        <div className="w-[180px] bg-[#080c14] border-r border-white/[0.06] flex flex-col">
          <div className="px-5 py-4 border-b border-white/[0.06]">
            <span className="text-[11px] font-bold tracking-[0.15em] uppercase text-slate-400">
              Settings
            </span>
          </div>
          <nav className="flex-1 py-2 px-2 space-y-0.5">
            {TABS.map(t => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`group w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all duration-150
                    ${active
                      ? 'bg-white/[0.07] text-slate-200'
                      : 'text-slate-500 hover:text-slate-300 hover:bg-white/[0.03]'
                    }`}
                >
                  <Icon size={15} className={active ? 'text-amber-400' : 'text-slate-600 group-hover:text-slate-400 transition-colors'} />
                  {t.label}
                </button>
              );
            })}
          </nav>
          <div className="px-4 py-3 border-t border-white/[0.06]">
            <span className="text-[9px] text-slate-600 tracking-wider uppercase">
              Seed: {worldSeed}
            </span>
          </div>
        </div>

        {/* Right content area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
            <h2 className="text-sm font-bold tracking-wide text-slate-300">
              {TABS.find(t => t.id === tab)?.label}
            </h2>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-full flex items-center justify-center text-slate-500
                hover:text-slate-300 hover:bg-white/[0.06] transition-all"
            >
              <X size={14} />
            </button>
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto px-6 py-5">
            <AnimatePresence mode="wait">
              <motion.div
                key={tab}
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.2 }}
              >
                {tab === 'world' && (
                  <WorldTab
                    worldSeed={worldSeed}
                    newSeed={newSeed}
                    setNewSeed={setNewSeed}
                    copied={copied}
                    onCopy={handleCopySeed}
                    onRandom={handleRandomSeed}
                    onLaunch={handleLaunchVoyage}
                  />
                )}
                {tab === 'display' && <PlaceholderTab title="Display" description="Graphics quality, UI scale, and minimap settings will appear here." />}
                {tab === 'audio' && <PlaceholderTab title="Audio" description="Master volume, music, and sound effects controls will appear here." />}
                {tab === 'gameplay' && <PlaceholderTab title="Gameplay" description="Time speed, auto-pause, and difficulty settings will appear here." />}
                {tab === 'about' && <AboutTab />}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function WorldTab({ worldSeed, newSeed, setNewSeed, copied, onCopy, onRandom, onLaunch }: {
  worldSeed: number;
  newSeed: string;
  setNewSeed: (s: string) => void;
  copied: boolean;
  onCopy: () => void;
  onRandom: () => void;
  onLaunch: () => void;
}) {
  const validSeed = newSeed.trim() !== '' && !isNaN(parseInt(newSeed, 10)) && parseInt(newSeed, 10) > 0;

  return (
    <div className="space-y-8">
      {/* Current seed */}
      <SettingsSection title="Current Seed" description="This world was generated from this seed. Share it to let others explore the same map.">
        <div className="flex items-center gap-2">
          <div className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-lg px-4 py-2.5
            text-slate-300 text-sm font-mono tracking-wider">
            {worldSeed}
          </div>
          <button
            onClick={onCopy}
            className="h-10 px-3 rounded-lg border border-white/[0.08] bg-white/[0.04]
              text-slate-400 hover:text-slate-200 hover:bg-white/[0.07] transition-all
              flex items-center gap-2 text-xs font-medium"
          >
            {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </SettingsSection>

      {/* New voyage */}
      <SettingsSection title="New Voyage" description="Enter a seed or generate a random one. This will restart the game with a new world.">
        <div className="flex items-center gap-2 mb-3">
          <input
            type="text"
            value={newSeed}
            onChange={e => setNewSeed(e.target.value.replace(/[^0-9]/g, ''))}
            placeholder="Enter a seed number..."
            className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-lg px-4 py-2.5
              text-slate-300 text-sm font-mono tracking-wider placeholder-slate-600
              focus:outline-none focus:border-amber-700/50 focus:bg-white/[0.06] transition-all"
          />
          <button
            onClick={onRandom}
            className="h-10 px-3 rounded-lg border border-white/[0.08] bg-white/[0.04]
              text-slate-400 hover:text-amber-400 hover:bg-amber-500/[0.07] hover:border-amber-700/30 transition-all
              flex items-center gap-2 text-xs font-medium"
          >
            <Shuffle size={13} />
            Random
          </button>
        </div>
        <button
          onClick={onLaunch}
          disabled={!validSeed}
          className="w-full py-3 rounded-lg font-bold text-sm tracking-wide transition-all duration-200
            flex items-center justify-center gap-2
            disabled:opacity-30 disabled:cursor-not-allowed
            bg-amber-600/20 border border-amber-600/30 text-amber-400
            hover:bg-amber-600/30 hover:border-amber-500/50 hover:shadow-[0_0_20px_rgba(217,169,56,0.15)]
            active:scale-[0.98]"
        >
          <Rocket size={14} />
          Launch New Voyage
        </button>
      </SettingsSection>
    </div>
  );
}

function AboutTab() {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-2xl font-serif text-amber-400 mb-2">Merchant of the Indian Ocean</h3>
        <p className="text-slate-400 text-sm leading-relaxed">
          A sailing and trading game set in the Indian Ocean, 1612 AD.
          Navigate treacherous waters, trade exotic goods between ports,
          and build your fortune in the age of exploration.
        </p>
      </div>
      <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-4 space-y-2">
        <InfoRow label="Version" value="0.1.0" />
        <InfoRow label="Engine" value="Three.js + React" />
        <InfoRow label="Terrain" value="Procedural (Simplex Noise)" />
      </div>
    </div>
  );
}

function PlaceholderTab({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-12 h-12 rounded-full bg-white/[0.04] border border-white/[0.06] flex items-center justify-center mb-4">
        <Gamepad2 size={20} className="text-slate-600" />
      </div>
      <h3 className="text-slate-400 font-medium mb-1">{title}</h3>
      <p className="text-slate-600 text-sm max-w-xs">
        {description}
      </p>
    </div>
  );
}

function SettingsSection({ title, description, children }: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="text-[13px] font-bold text-slate-300 mb-0.5">{title}</h3>
      <p className="text-[11px] text-slate-500 mb-3 leading-relaxed">{description}</p>
      {children}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="text-slate-300 font-mono text-xs">{value}</span>
    </div>
  );
}
