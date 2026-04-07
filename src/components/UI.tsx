import { useEffect, useState, useCallback } from 'react';
import { useGameStore, Port } from '../store/gameStore';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Coins, Anchor, Wind, Shield, Map as MapIcon, X, Users,
  Settings, Eye, Scroll, HelpCircle, BookOpen, Pause, Play, Compass, GraduationCap
} from 'lucide-react';
import { Minimap } from './Minimap';
import { PortModal } from './PortModal';
import { ShipDashboard } from './ShipDashboard';
import { JournalPanel } from './Journal';
import { SettingsModal } from './SettingsModal';

function formatTime(timeOfDay: number): string {
  const hours = Math.floor(timeOfDay) % 24;
  const minutes = Math.floor((timeOfDay % 1) * 60);
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHour = hours % 12 || 12;
  return `${displayHour}:${minutes.toString().padStart(2, '0')} ${period}`;
}

export function UI() {
  const {
    gold, cargo, stats, notifications, removeNotification,
    activePort, setActivePort,
    playerPos, ports, cameraZoom, setCameraZoom, interactionPrompt,
    timeOfDay, crew
  } = useGameStore();

  const [showMap, setShowMap] = useState(false);
  const [showInstructions, setShowInstructions] = useState(true);
  const [showDashboard, setShowDashboard] = useState(false);
  const paused = useGameStore(s => s.paused);
  const setPaused = useGameStore(s => s.setPaused);
  const [showJournal, setShowJournal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [loadingReady, setLoadingReady] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');

  const captain = crew.find(c => c.role === 'Captain');

  // SimCity-style loading messages — cycle until the world is actually ready
  useEffect(() => {
    if (!showInstructions) return;
    const messages = [
      'Charting the Indian Ocean...',
      'Assembling the crew of The Dorada...',
      'Constructing the port of Goa...',
      'Surveying the harbor at Hormuz...',
      'Provisioning supplies at Malacca...',
      'Mapping trade routes to Aden...',
      'Raising the docks at Zanzibar...',
      'Calibrating navigation instruments...',
      'Unfurling the sails...',
      'Reading the monsoon winds...',
      'Briefing Captain Blackwood...',
    ];
    let i = 0;
    setLoadingMessage(messages[0]);
    const interval = setInterval(() => {
      i = (i + 1) % messages.length;
      setLoadingMessage(messages[i]);
    }, 2000);
    return () => clearInterval(interval);
  }, [showInstructions]);

  // Ready when ports have actually loaded
  useEffect(() => {
    if (ports.length > 0 && !loadingReady) {
      // Small delay so the last message doesn't cut off abruptly
      const timer = setTimeout(() => setLoadingReady(true), 800);
      return () => clearTimeout(timer);
    }
  }, [ports.length, loadingReady]);

  // Check for nearby ports
  useEffect(() => {
    const checkPorts = setInterval(() => {
      let nearest: Port | null = null;
      let minDist = 20;

      for (const port of ports) {
        const dx = playerPos[0] - port.position[0];
        const dz = playerPos[2] - port.position[2];
        const dist = Math.sqrt(dx * dx + dz * dz);

        if (dist < minDist) {
          minDist = dist;
          nearest = port;
        }
      }

      if (nearest && nearest.id !== activePort?.id) {
        setActivePort(nearest);
      } else if (!nearest && activePort) {
        setActivePort(null);
      }
    }, 500);

    return () => clearInterval(checkPorts);
  }, [playerPos, ports, activePort, setActivePort]);

  // Escape key closes modals
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showDashboard) setShowDashboard(false);
        else if (showMap) setShowMap(false);
        else if (activePort) setActivePort(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showMap, showDashboard, activePort, setActivePort]);

  // Auto-dismiss notifications after 4 seconds
  useEffect(() => {
    if (notifications.length === 0) return;
    const latest = notifications[notifications.length - 1];
    const timer = setTimeout(() => removeNotification(latest.id), 4000);
    return () => clearTimeout(timer);
  }, [notifications, removeNotification]);

  const toggleMap = useCallback(() => setShowMap(prev => !prev), []);

  return (
    <div className="absolute inset-0 pointer-events-none p-4 flex flex-col justify-between font-sans text-white text-shadow-sm select-none">

      {/* Top Bar */}
      <div className="flex justify-between items-start">
        <div className="bg-slate-900/80 backdrop-blur-md p-4 rounded-xl border border-amber-900/50 pointer-events-auto shadow-xl">
          <div className="flex items-center gap-3 mb-3 border-b border-white/10 pb-2">
            {/* Captain portrait — clickable to open dashboard */}
            <button
              onClick={() => setShowDashboard(true)}
              className="w-10 h-10 rounded-full bg-slate-700 border-2 border-amber-600/60 flex items-center justify-center shrink-0 hover:border-amber-400 hover:shadow-[0_0_10px_rgba(245,158,11,0.3)] transition-all active:scale-95 overflow-hidden"
              title={captain ? `${captain.name} — Click for Ship Dashboard` : 'Ship Dashboard'}
            >
              <span className="text-lg">🧑‍✈️</span>
            </button>

            <div className="flex items-center gap-2 text-yellow-400 font-bold text-2xl drop-shadow-md">
              <Coins size={24} /> {gold.toLocaleString()}
            </div>

            <div className="h-6 w-px bg-white/10" />

            <div className="text-sm text-amber-200/80 font-serif italic">
              {formatTime(timeOfDay)} · 1612 AD
            </div>

            <div className="h-6 w-px bg-white/10" />

            {/* Crew count — also clickable */}
            <button
              onClick={() => setShowDashboard(true)}
              className="flex items-center gap-1.5 text-sm text-slate-300 hover:text-amber-300 transition-colors"
              title="View crew roster"
            >
              <Users size={16} />
              <span className="font-bold">{crew.length}</span>
            </button>
          </div>

          <div className="grid grid-cols-3 gap-x-6 gap-y-2 text-sm font-medium">
            <div className="flex items-center gap-2 text-blue-200"><Shield size={18}/> Hull: {stats.hull}/{stats.maxHull}</div>
            <div className="flex items-center gap-2 text-gray-200"><Wind size={18}/> Sails: {stats.sails}/{stats.maxSails}</div>
            <div className="flex items-center gap-2 text-amber-200"><Anchor size={18}/> Cargo: {Object.values(cargo).reduce((a,b)=>a+b,0)}/{stats.cargoCapacity}</div>
          </div>
        </div>

        {/* Minimap (top-right) — click to open full map */}
        <div className="flex flex-col gap-3 pointer-events-auto items-end">
          <div className="relative">
            <Minimap onClick={toggleMap} />
            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-slate-900/80 px-2 py-0.5 rounded text-[9px] text-amber-400 font-bold uppercase tracking-wider whitespace-nowrap">
              Click for Map
            </div>
          </div>

          <div className="bg-slate-900/80 p-2 rounded-full border border-amber-900/50 flex flex-col items-center gap-2 shadow-xl">
            <button onClick={() => setCameraZoom(cameraZoom - 10)} className="w-10 h-10 flex items-center justify-center hover:bg-white/10 rounded-full text-2xl transition-colors">+</button>
            <div className="text-xs text-amber-400 font-bold uppercase tracking-widest rotate-90 my-2">Zoom</div>
            <button onClick={() => setCameraZoom(cameraZoom + 10)} className="w-10 h-10 flex items-center justify-center hover:bg-white/10 rounded-full text-2xl transition-colors">−</button>
          </div>
        </div>
      </div>

      {/* Interaction Prompt */}
      <AnimatePresence>
        {interactionPrompt && !activePort && !showMap && !showInstructions && !showDashboard && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="absolute bottom-32 left-1/2 -translate-x-1/2 bg-black/80 backdrop-blur-md px-6 py-3 rounded-full border border-amber-500/50 shadow-[0_0_20px_rgba(245,158,11,0.3)] text-amber-400 font-bold tracking-wider"
          >
            {interactionPrompt}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Port Trading Modal */}
      <PortModal />

      {/* Ship Dashboard Modal */}
      <AnimatePresence>
        <ShipDashboard open={showDashboard} onClose={() => setShowDashboard(false)} />
      </AnimatePresence>

      {/* Notifications */}
      <div className="absolute bottom-4 right-4 flex flex-col gap-2 items-end">
        <AnimatePresence>
          {notifications.map(n => (
            <motion.div
              key={n.id}
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className={`px-4 py-2 rounded shadow-lg pointer-events-auto flex items-center gap-2 cursor-pointer ${
                n.type === 'success' ? 'bg-green-600' :
                n.type === 'error' ? 'bg-red-600' :
                n.type === 'warning' ? 'bg-yellow-600' : 'bg-blue-600'
              }`}
              onClick={() => removeNotification(n.id)}
            >
              {n.message}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Fullscreen Map Overlay */}
      <AnimatePresence>
        {showMap && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/80 backdrop-blur-sm pointer-events-auto flex items-center justify-center p-12 z-40"
            onClick={(e) => { if (e.target === e.currentTarget) setShowMap(false); }}
          >
            <div className="bg-[#e6d5ac] w-full max-w-3xl aspect-square rounded-full overflow-hidden relative border-8 border-[#8b5a2b] shadow-[0_0_50px_rgba(0,0,0,0.5)]">
              <div className="absolute inset-0" style={{
                backgroundImage: 'radial-gradient(#c2a878 1px, transparent 1px)',
                backgroundSize: '20px 20px'
              }}>
                {ports.map(p => (
                  <div key={p.id} className="absolute w-4 h-4 bg-red-600 rounded-full -translate-x-1/2 -translate-y-1/2"
                       style={{ left: `${50 + p.position[0]/10}%`, top: `${50 + p.position[2]/10}%` }}>
                    <span className="absolute left-5 top-1/2 -translate-y-1/2 text-xs font-bold text-[#5a3a1a] whitespace-nowrap bg-[#e6d5ac]/80 px-1 rounded">
                      {p.name}
                    </span>
                  </div>
                ))}
                <div className="absolute w-6 h-6 bg-blue-600 rounded-full -translate-x-1/2 -translate-y-1/2 border-2 border-white shadow-lg"
                     style={{ left: `${50 + playerPos[0]/10}%`, top: `${50 + playerPos[2]/10}%` }} />
              </div>
              <button onClick={() => setShowMap(false)} className="absolute top-8 right-8 text-[#8b5a2b] hover:text-black transition-colors">
                <X size={32} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Journal Panel (compact, above button) */}
      <JournalPanel open={showJournal} onClose={() => setShowJournal(false)} />

      {/* Journal Button — lower left, separate */}
      <div className="absolute bottom-4 left-4 pointer-events-auto">
        <button
          onClick={() => setShowJournal(!showJournal)}
          className={`group relative w-11 h-11 rounded-full flex items-center justify-center
            bg-[#1a1e2e] border-2
            shadow-[inset_0_2px_4px_rgba(0,0,0,0.5),inset_0_-1px_2px_rgba(255,255,255,0.05),0_2px_8px_rgba(0,0,0,0.6)]
            transition-all active:scale-95
            ${showJournal
              ? 'border-amber-500/60 text-amber-400 shadow-[inset_0_2px_4px_rgba(0,0,0,0.5),inset_0_-1px_2px_rgba(255,255,255,0.05),0_0_12px_rgba(245,158,11,0.25)]'
              : 'border-[#4a4535]/60 text-[#8a8060] hover:text-amber-400 hover:border-[#6a6545]/80'
            }`}
          title="Journal"
        >
          <BookOpen size={15} />
          <span className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-[#0b1120] border border-slate-700/50 rounded text-[9px] tracking-[0.12em] uppercase text-slate-400 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            Journal
          </span>
        </button>
      </div>

      {/* Bottom Action Bar — Sunless Sea style */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 pointer-events-auto">
        {/* Semi-transparent rectangular landing pad */}
        <div className="relative bg-[#0a0e18]/50 backdrop-blur-md border border-[#2a2d3a]/40 rounded-xl px-4 py-2.5 shadow-[0_4px_20px_rgba(0,0,0,0.4)]">
          {/* Horizontal connecting rail */}
          <div className="absolute top-1/2 left-5 right-5 h-[2px] -translate-y-1/2 bg-gradient-to-r from-[#2a2520]/30 via-[#3a3530]/50 to-[#2a2520]/30 rounded-full" />
          <div className="relative flex items-center gap-3">
            {/* Left group: Learn - Help - Settings */}
            <ActionBarButton icon={<GraduationCap size={13} />} label="Learn" accentColor="#60a5fa" glowColor="96,165,250" />
            <ActionBarButton icon={<HelpCircle size={13} />} label="Help" accentColor="#a78bfa" glowColor="167,139,250" />
            <ActionBarButton icon={<Settings size={13} />} label="Settings" accentColor="#9ca3af" glowColor="156,163,175" onClick={() => setShowSettings(true)} />
            {/* Center — pause/play, bigger */}
            <button
              onClick={() => setPaused(!paused)}
              className={`group relative w-11 h-11 rounded-full flex items-center justify-center transition-all duration-200 active:scale-95
                ${paused
                  ? 'bg-[#1a1e2e] border-2 border-amber-600/70 text-amber-400 shadow-[inset_0_2px_5px_rgba(0,0,0,0.5),inset_0_-1px_2px_rgba(255,255,255,0.08),0_0_14px_rgba(217,169,56,0.3)] hover:border-amber-500/90 hover:shadow-[inset_0_2px_5px_rgba(0,0,0,0.5),inset_0_-1px_2px_rgba(255,255,255,0.1),0_0_20px_rgba(217,169,56,0.45)]'
                  : 'bg-[#1a1e2e] border-2 border-[#5a5540]/70 text-[#9a9070] shadow-[inset_0_2px_5px_rgba(0,0,0,0.5),inset_0_-1px_2px_rgba(255,255,255,0.06),0_2px_8px_rgba(0,0,0,0.5)] hover:text-amber-300 hover:border-amber-700/60 hover:shadow-[inset_0_2px_5px_rgba(0,0,0,0.4),inset_0_-1px_3px_rgba(255,255,255,0.1),0_0_18px_rgba(217,169,56,0.35)]'
                }`}
              title={paused ? 'Resume' : 'Pause'}
            >
              {paused ? <Play size={16} /> : <Pause size={16} />}
              <span className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-[#0b1120] border border-slate-700/50 rounded text-[9px] tracking-[0.12em] uppercase text-slate-400 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                {paused ? 'Resume' : 'Pause'}
              </span>
            </button>
            {/* Right group: View - Quests - Navigate */}
            <ActionBarButton icon={<Eye size={13} />} label="View" accentColor="#34d399" glowColor="52,211,153" />
            <ActionBarButton icon={<Scroll size={13} />} label="Quests" accentColor="#fbbf24" glowColor="251,191,36" />
            <ActionBarButton icon={<Compass size={13} />} label="Navigate" accentColor="#f87171" glowColor="248,113,113" />
          </div>
        </div>
      </div>

      {/* Settings Modal */}
      <SettingsModal open={showSettings} onClose={() => setShowSettings(false)} />

      {/* Instructions Overlay */}
      <AnimatePresence>
        {showInstructions && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/80 backdrop-blur-sm pointer-events-auto flex items-center justify-center p-12 z-50"
          >
            <div className="bg-slate-900/95 p-8 rounded-2xl border-2 border-amber-900/50 max-w-lg text-center shadow-[0_0_50px_rgba(0,0,0,0.5)]">
              <h1 className="text-4xl font-serif text-amber-500 mb-4">Merchant of the Indian Ocean</h1>
              <p className="text-gray-300 mb-6 text-lg">
                Welcome, Captain. The year is 1612. Your fortune awaits in the treacherous waters of the Indian Ocean.
              </p>

              <div className="text-left bg-black/40 p-6 rounded-xl border border-white/10 mb-8 space-y-4">
                <div className="flex items-center gap-4">
                  <div className="flex gap-1">
                    <kbd className="bg-white/10 px-2 py-1 rounded text-amber-400 font-mono">W</kbd>
                    <kbd className="bg-white/10 px-2 py-1 rounded text-amber-400 font-mono">S</kbd>
                  </div>
                  <span className="text-gray-300">Raise / Lower Sails</span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex gap-1">
                    <kbd className="bg-white/10 px-2 py-1 rounded text-amber-400 font-mono">A</kbd>
                    <kbd className="bg-white/10 px-2 py-1 rounded text-amber-400 font-mono">D</kbd>
                  </div>
                  <span className="text-gray-300">Steer Port / Starboard</span>
                </div>
                <div className="flex items-center gap-4">
                  <MapIcon className="text-amber-400" size={24} />
                  <span className="text-gray-300">Click Minimap to open Map</span>
                </div>
                <div className="flex items-center gap-4">
                  <Coins className="text-amber-400" size={24} />
                  <span className="text-gray-300">Sail near Ports to Trade</span>
                </div>
              </div>

              {loadingReady ? (
                <motion.button
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  onClick={() => setShowInstructions(false)}
                  className="bg-amber-600 hover:bg-amber-500 text-white font-bold py-3 px-8 rounded-full text-lg shadow-lg active:scale-95 transition-all"
                >
                  Set Sail
                </motion.button>
              ) : (
                <div className="h-12 flex items-center justify-center">
                  <AnimatePresence mode="wait">
                    <motion.p
                      key={loadingMessage}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.3 }}
                      className="text-amber-400/70 text-sm italic"
                    >
                      {loadingMessage}
                    </motion.p>
                  </AnimatePresence>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}

function ActionBarButton({ icon, label, accentColor = '#b0a880', glowColor = '176,168,128', onClick }: { icon: React.ReactNode; label: string; accentColor?: string; glowColor?: string; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group relative w-8 h-8 rounded-full flex items-center justify-center
        bg-[#1a1e2e] border-2 border-[#3a3530]/50
        shadow-[inset_0_2px_4px_rgba(0,0,0,0.5),inset_0_-1px_2px_rgba(255,255,255,0.05),0_1px_4px_rgba(0,0,0,0.4)]
        transition-all duration-200 active:scale-95"
      style={{
        color: '#6a6550',
      }}
      onMouseEnter={(e) => {
        const btn = e.currentTarget;
        btn.style.color = accentColor;
        btn.style.borderColor = accentColor + '66';
        btn.style.boxShadow = `inset 0 2px 4px rgba(0,0,0,0.4), inset 0 -1px 3px rgba(255,255,255,0.1), 0 0 12px rgba(${glowColor},0.3), 0 0 4px rgba(${glowColor},0.15)`;
      }}
      onMouseLeave={(e) => {
        const btn = e.currentTarget;
        btn.style.color = '#6a6550';
        btn.style.borderColor = 'rgba(58,53,48,0.5)';
        btn.style.boxShadow = 'inset 0 2px 4px rgba(0,0,0,0.5), inset 0 -1px 2px rgba(255,255,255,0.05), 0 1px 4px rgba(0,0,0,0.4)';
      }}
      title={label}
    >
      {icon}
      {/* Tooltip */}
      <span className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-[#0b1120] border border-slate-700/50 rounded text-[9px] tracking-[0.12em] uppercase text-slate-400 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
        {label}
      </span>
    </button>
  );
}
