import { useEffect, useState, useCallback, useRef } from 'react';
import { useGameStore, Port } from '../store/gameStore';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Coins, Anchor, Wind, Shield, Map as MapIcon, Users, Fish,
  Settings, Eye, Scroll, HelpCircle, BookOpen, Pause, Play, Compass, GraduationCap, ArrowRight
} from 'lucide-react';
import { audioManager } from '../audio/AudioManager';
import { sfxClick, sfxHover, sfxOpen, sfxClose, sfxSail } from '../audio/SoundEffects';
import { Minimap } from './Minimap';
import { PortModal } from './PortModal';
import { ShipDashboard } from './ShipDashboard';
import { JournalPanel } from './Journal';
import { SettingsModal } from './SettingsModal';
import { WorldMap } from './WorldMap';
import { WorldMapModal } from './WorldMapModal';
import { FactionFlag } from './FactionFlag';
import { OpeningASCII } from './OpeningASCII';
import { EventModalASCII } from './EventModalASCII';
import { ASCIIToast } from './ASCIIToast';
import {
  getLiveShipTransform,
  getLiveWalkingTransform,
} from '../utils/livePlayerTransform';
// import { OpeningPamphlet } from './OpeningPamphlet'; // Option B — swap in to test

const PORT_RADIUS_SQ = 20 * 20;
const WALKING_PORT_SEARCH_RADIUS_SQ = 120 * 120;
const BUILDING_INTERACTION_PADDING = 1.75;

function formatTime(timeOfDay: number): string {
  const hours = Math.floor(timeOfDay) % 24;
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHour = hours % 12 || 12;
  return `${displayHour} ${period}`;
}

const MONTH_NAMES = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const LOADING_MESSAGES = [
  'Charting the Indian Ocean sea lanes...',
  'Briefing Captain Blackwood and officers...',
  'Inspecting the carrack and trimming the rigging...',
  'Surveying harbors from Goa to Malacca...',
  'Weighing cargo against wind and draft...',
  'Marking safe approaches, shoals, and reefs...',
  'Listening for monsoon shifts along the coast...',
  'Loading manifests, ledgers, and cannon stores...',
];

function formatDate(dayCount: number): string {
  // Game starts May 1, 1612
  let month = 4; // May (0-indexed)
  let day = dayCount;
  let year = 1612;

  while (day > DAYS_IN_MONTH[month]) {
    day -= DAYS_IN_MONTH[month];
    month++;
    if (month >= 12) {
      month = 0;
      year++;
    }
  }

  return `${MONTH_NAMES[month]} ${day}, ${year}`;
}

function isInsideBuildingFootprint(
  pointX: number,
  pointZ: number,
  port: Port
): boolean {
  return port.buildings.some((building) => {
    if (building.type === 'road' || building.type === 'dock') return false;

    const dx = pointX - building.position[0];
    const dz = pointZ - building.position[2];
    const cos = Math.cos(-building.rotation);
    const sin = Math.sin(-building.rotation);
    const localX = dx * cos - dz * sin;
    const localZ = dx * sin + dz * cos;
    const halfWidth = building.scale[0] * 0.5 + BUILDING_INTERACTION_PADDING;
    const halfDepth = building.scale[2] * 0.5 + BUILDING_INTERACTION_PADDING;

    return Math.abs(localX) <= halfWidth && Math.abs(localZ) <= halfDepth;
  });
}

function findNearbyPort(
  mode: 'ship' | 'walking',
  playerPos: [number, number, number],
  walkingPos: [number, number, number],
  ports: Port[]
): Port | null {
  if (mode === 'ship') {
    let nearest: Port | null = null;
    let minDistSq = PORT_RADIUS_SQ;

    for (const port of ports) {
      const dx = playerPos[0] - port.position[0];
      const dz = playerPos[2] - port.position[2];
      const distSq = dx * dx + dz * dz;

      if (distSq < minDistSq) {
        minDistSq = distSq;
        nearest = port;
      }
    }

    return nearest;
  }

  let candidate: Port | null = null;
  let candidateDistSq = WALKING_PORT_SEARCH_RADIUS_SQ;

  for (const port of ports) {
    const dx = walkingPos[0] - port.position[0];
    const dz = walkingPos[2] - port.position[2];
    const distSq = dx * dx + dz * dz;

    if (distSq < candidateDistSq) {
      candidateDistSq = distSq;
      candidate = port;
    }
  }

  if (!candidate) return null;

  return isInsideBuildingFootprint(walkingPos[0], walkingPos[2], candidate) ? candidate : null;
}

// ── Combat Mode Banner ──────────────────────────────────────────────────────
// Animated ASCII alert that appears top-center when fight mode is active
function CombatModeBanner() {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setFrame(f => f + 1), 400);
    return () => clearInterval(id);
  }, []);

  // Rotating alert icon frames
  const icons = ['⚔', '☠', '⚔', '✴'];
  const icon = icons[frame % icons.length];
  // Pulsing border characters
  const border = frame % 2 === 0 ? '╬' : '╫';

  return (
    <motion.div
      initial={{ opacity: 0, y: -20, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.9 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      className="absolute top-3 left-1/2 -translate-x-1/2 z-50"
    >
      <div className="relative">
        {/* Glow backdrop */}
        <div className="absolute inset-0 rounded-lg bg-red-600/20 blur-xl animate-pulse" />
        <div className="relative bg-[#1a0808]/90 backdrop-blur-md border border-red-500/60 rounded-lg px-5 py-2
          shadow-[0_0_30px_rgba(220,38,38,0.3),inset_0_1px_0_rgba(255,100,100,0.1)]">
          <pre className="text-center font-mono text-[11px] leading-tight select-none" style={{ textShadow: '0 0 8px rgba(239,68,68,0.6)' }}>
            <span className="text-red-400/60">{border}{'═'.repeat(3)}{border}</span>
            <span className="text-red-300 font-bold mx-2">{icon}</span>
            <motion.span
              animate={{ opacity: [1, 0.6, 1] }}
              transition={{ duration: 1.2, repeat: Infinity }}
              className="text-red-400 font-bold tracking-[0.3em]"
            >FIGHT MODE</motion.span>
            <span className="text-red-300 font-bold mx-2">{icon}</span>
            <span className="text-red-400/60">{border}{'═'.repeat(3)}{border}</span>
          </pre>
          <div className="text-center text-red-500/50 text-[9px] font-mono tracking-wider mt-0.5">
            [SPACE] fire · [F] stand down
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ── Anchor Banner ───────────────────────────────────────────────────────────
// ASCII-style top-center indicator when at anchor — calmer counterpart to fight mode
function AnchorBanner() {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setFrame(f => f + 1), 800);
    return () => clearInterval(id);
  }, []);

  const chain = frame % 2 === 0 ? '⚓' : '⚓';
  const wave = frame % 3 === 0 ? '~' : frame % 3 === 1 ? '≈' : '~';

  return (
    <motion.div
      initial={{ opacity: 0, y: -15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -15 }}
      transition={{ type: 'spring', stiffness: 200, damping: 18 }}
      className="absolute top-3 left-1/2 -translate-x-1/2 z-50"
    >
      <div className="relative">
        <div className="absolute inset-0 rounded-lg bg-cyan-600/10 blur-lg" />
        <div className="relative bg-[#081218]/90 backdrop-blur-md border border-cyan-500/30 rounded-lg px-5 py-2
          shadow-[0_0_20px_rgba(34,211,238,0.15),inset_0_1px_0_rgba(100,200,230,0.08)]">
          <pre className="text-center font-mono text-[11px] leading-tight select-none" style={{ textShadow: '0 0 6px rgba(34,211,238,0.4)' }}>
            <span className="text-cyan-500/50">{wave}{'─'.repeat(3)}╼</span>
            <span className="text-cyan-300 mx-2">{chain}</span>
            <motion.span
              animate={{ opacity: [1, 0.7, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="text-cyan-300 font-bold tracking-[0.25em]"
            >AT ANCHOR</motion.span>
            <span className="text-cyan-300 mx-2">{chain}</span>
            <span className="text-cyan-500/50">╾{'─'.repeat(3)}{wave}</span>
          </pre>
          <div className="text-center text-cyan-500/40 text-[9px] font-mono tracking-wider mt-0.5">
            [F] battle stations
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ── Collision Warning Banner ────────────────────────────────────────────────
// Temporary orange warning that flashes when you crash into an NPC ship
function CollisionBanner({ shipDesc }: { shipDesc: string }) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setFrame(f => f + 1), 350);
    return () => clearInterval(id);
  }, []);

  const icons = ['⚠', '💥', '⚠', '✦'];
  const icon = icons[frame % icons.length];
  const border = frame % 2 === 0 ? '╬' : '╫';

  return (
    <motion.div
      initial={{ opacity: 0, y: -20, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.9 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      className="absolute top-3 left-1/2 -translate-x-1/2 z-50"
    >
      <div className="relative">
        <div className="absolute inset-0 rounded-lg bg-orange-600/20 blur-xl animate-pulse" />
        <div className="relative bg-[#1a1208]/90 backdrop-blur-md border border-orange-500/60 rounded-lg px-5 py-2
          shadow-[0_0_30px_rgba(234,138,30,0.3),inset_0_1px_0_rgba(255,180,80,0.1)]">
          <pre className="text-center font-mono text-[11px] leading-tight select-none" style={{ textShadow: '0 0 8px rgba(234,138,30,0.6)' }}>
            <span className="text-orange-400/60">{border}{'═'.repeat(2)}{border}</span>
            <span className="text-orange-300 font-bold mx-2">{icon}</span>
            <motion.span
              animate={{ opacity: [1, 0.6, 1] }}
              transition={{ duration: 1, repeat: Infinity }}
              className="text-orange-400 font-bold tracking-[0.2em]"
            >COLLISION</motion.span>
            <span className="text-orange-300 font-bold mx-2">{icon}</span>
            <span className="text-orange-400/60">{border}{'═'.repeat(2)}{border}</span>
          </pre>
          <div className="text-center text-orange-400/60 text-[9px] font-mono tracking-wider mt-0.5">
            You crashed into {shipDesc}. Watch out!
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export function UI() {
  const gold = useGameStore((state) => state.gold);
  const cargo = useGameStore((state) => state.cargo);
  const stats = useGameStore((state) => state.stats);
  const notifications = useGameStore((state) => state.notifications);
  const removeNotification = useGameStore((state) => state.removeNotification);
  const activePort = useGameStore((state) => state.activePort);
  const setActivePort = useGameStore((state) => state.setActivePort);
  const dismissedPortRef = useRef<string | null>(null);
  const approachedPortsRef = useRef<Set<string>>(new Set());
  const interactionPrompt = useGameStore((state) => state.interactionPrompt);
  const timeOfDay = useGameStore((state) => state.timeOfDay);
  const crew = useGameStore((state) => state.crew);
  const dayCount = useGameStore((state) => state.dayCount);
  const provisions = useGameStore((state) => state.provisions);
  const ship = useGameStore((state) => state.ship);
  const anchored = useGameStore((state) => state.anchored);
  const combatMode = useGameStore((state) => state.combatMode);
  const playerMode = useGameStore((state) => state.playerMode);
  const portCount = useGameStore((state) => state.ports.length);
  const showDevPanel = useGameStore((state) => state.renderDebug.showDevPanel);
  const minimapEnabled = useGameStore((state) => state.renderDebug.minimap);

  const [showLocalMap, setShowLocalMap] = useState(false);
  const [showWorldMap, setShowWorldMap] = useState(false);
  const [showInstructions, setShowInstructions] = useState(true);
  const [showDashboard, setShowDashboard] = useState(false);
  const paused = useGameStore(s => s.paused);
  const setPaused = useGameStore(s => s.setPaused);
  const [showJournal, setShowJournal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showWind, setShowWind] = useState(false);
  const [showCommission, setShowCommission] = useState(false);
  const [loadingReady, setLoadingReady] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState(LOADING_MESSAGES[0]);
  const [loadingProgress, setLoadingProgress] = useState(10);

  // Collision warning banner state
  const [collisionShipDesc, setCollisionShipDesc] = useState<string | null>(null);
  const collisionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handleCollisionWarning = (e: Event) => {
      const desc = (e as CustomEvent).detail?.appearancePhrase ?? 'another vessel';
      setCollisionShipDesc(desc);
      if (collisionTimerRef.current) clearTimeout(collisionTimerRef.current);
      collisionTimerRef.current = setTimeout(() => setCollisionShipDesc(null), 3500);
    };
    window.addEventListener('ship-collision-warning', handleCollisionWarning);
    return () => {
      window.removeEventListener('ship-collision-warning', handleCollisionWarning);
      if (collisionTimerRef.current) clearTimeout(collisionTimerRef.current);
    };
  }, []);

  const captain = crew.find(c => c.role === 'Captain');
  const closeOpeningOverlay = useCallback(() => {
    if (loadingReady) {
      sfxSail();
      setShowInstructions(false);
      setShowCommission(true);
    }
  }, [loadingReady]);

  const closeCommission = useCallback(() => {
    setShowCommission(false);
    audioManager.transitionToOverworld();
  }, []);

  // SimCity-style loading messages — cycle until the world is actually ready
  useEffect(() => {
    if (!showInstructions) return;

    let i = 0;
    setLoadingMessage(LOADING_MESSAGES[0]);
    setLoadingProgress(10);
    const interval = setInterval(() => {
      i = (i + 1) % LOADING_MESSAGES.length;
      setLoadingMessage(LOADING_MESSAGES[i]);
      setLoadingProgress((current) => Math.min(current + 7, 88));
    }, 1800);
    return () => clearInterval(interval);
  }, [showInstructions]);

  // Ready when ports have actually loaded
  useEffect(() => {
    if (portCount > 0 && !loadingReady) {
      // Small delay so the last message doesn't cut off abruptly
      const timer = setTimeout(() => setLoadingReady(true), 800);
      return () => clearTimeout(timer);
    }
  }, [portCount, loadingReady]);

  useEffect(() => {
    if (!loadingReady) return;
    setLoadingMessage('Harbors charted. Holds secured. The monsoon favors departure.');
    setLoadingProgress(100);
  }, [loadingReady]);

  useEffect(() => {
    if (!showInstructions || !loadingReady) return;

    const handleLaunchKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        closeOpeningOverlay();
      }
    };

    window.addEventListener('keydown', handleLaunchKey);
    return () => window.removeEventListener('keydown', handleLaunchKey);
  }, [showInstructions, loadingReady, closeOpeningOverlay]);

  // Check for nearby ports — approach toast + activation
  const PORT_APPROACH_RADIUS_SQ = 60 * 60; // grand toast at ~60 units
  useEffect(() => {
    const checkPorts = setInterval(() => {
      const {
        playerMode,
        ports,
        activePort: currentActivePort,
        addNotification: notify,
      } = useGameStore.getState();
      const playerPos = getLiveShipTransform().pos;
      const walkingPos = getLiveWalkingTransform().pos;
      const nearest = findNearbyPort(playerMode, playerPos, walkingPos, ports);

      if (nearest && nearest.id !== currentActivePort?.id && nearest.id !== dismissedPortRef.current) {
        setActivePort(nearest);
      } else if (!nearest && currentActivePort) {
        setActivePort(null);
      }
      // Clear dismissed port when player leaves the area
      if (!nearest) {
        dismissedPortRef.current = null;
      }

      // Port approach grand toast (ship mode only, wider radius)
      if (playerMode === 'ship') {
        for (const port of ports) {
          const dx = playerPos[0] - port.position[0];
          const dz = playerPos[2] - port.position[2];
          const distSq = dx * dx + dz * dz;
          if (distSq < PORT_APPROACH_RADIUS_SQ && !approachedPortsRef.current.has(port.id)) {
            approachedPortsRef.current.add(port.id);
            notify(
              port.name,
              'info',
              { size: 'grand', subtitle: `${port.scale} port \u00b7 ${port.culture}` },
            );
          }
          // Clear approach flag when far enough away
          if (distSq > PORT_APPROACH_RADIUS_SQ * 2.5) {
            approachedPortsRef.current.delete(port.id);
          }
        }
      }
    }, 250);

    return () => clearInterval(checkPorts);
  }, [setActivePort]);

  // Escape key closes modals
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showDashboard) { sfxClose(); setShowDashboard(false); }
        else if (showLocalMap) { sfxClose(); setShowLocalMap(false); }
        else if (showWorldMap) { sfxClose(); setShowWorldMap(false); }
        else if (activePort) {
          sfxClose();
          dismissedPortRef.current = activePort.id;
          setActivePort(null);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showLocalMap, showWorldMap, showDashboard, activePort, setActivePort]);

  // Auto-dismiss notifications — grand toasts last longer
  useEffect(() => {
    if (notifications.length === 0) return;
    const latest = notifications[notifications.length - 1];
    const duration = latest.type === 'legendary' ? 8000 : latest.size === 'grand' ? 6000 : 4000;
    const timer = setTimeout(() => removeNotification(latest.id), duration);
    return () => clearTimeout(timer);
  }, [notifications, removeNotification]);

  const toggleLocalMap = useCallback(() => { sfxOpen(); setShowLocalMap(prev => !prev); }, []);
  const toggleWorldMap = useCallback(() => { sfxOpen(); setShowWorldMap(prev => !prev); }, []);

  return (
    <div className="absolute inset-0 pointer-events-none p-4 flex flex-col justify-between font-sans text-white text-shadow-sm select-none">

      {/* Top Bar */}
      <div className="flex justify-between items-start">
        <div className="bg-[#0a0e18]/70 backdrop-blur-xl rounded-xl border border-[#2a2d3a]/50 pointer-events-auto shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
          {/* Top row: captain, gold, time, crew */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.06]">
            <button
              onClick={() => { sfxOpen(); setShowDashboard(true); }}
              className="w-11 h-11 rounded-full bg-[#1a1e2e] border-2 border-[#3a3530]/50 flex items-center justify-center shrink-0
                shadow-[inset_0_2px_4px_rgba(0,0,0,0.5),inset_0_-1px_2px_rgba(255,255,255,0.05)]
                hover:border-amber-600/50 hover:shadow-[inset_0_2px_4px_rgba(0,0,0,0.5),0_0_10px_rgba(245,158,11,0.2)] transition-all active:scale-95"
              title={captain ? `${captain.name} — Ship Dashboard` : 'Ship Dashboard'}
            >
              <Users size={16} className="text-amber-400/80" />
            </button>

            <div className="flex flex-col items-start" style={{ fontFamily: '"DM Sans", sans-serif' }}>
              <div className="flex items-center gap-1.5 text-amber-400 font-bold text-lg">
                <Coins size={18} className="text-amber-500" /> {gold.toLocaleString()}
              </div>
              <div className="flex items-center gap-1 text-[10px] text-emerald-400/70 -mt-0.5">
                <Fish size={10} className="text-emerald-500/60" />
                <span>{provisions} food</span>
              </div>
            </div>

            <div className="h-5 w-px bg-white/[0.08]" />

            <div className="flex flex-col items-start" style={{ fontFamily: '"DM Sans", sans-serif' }}>
              <div className="text-[12px] text-slate-300 font-medium">
                {formatTime(timeOfDay)} <span className="text-slate-600">·</span> <span className="text-slate-500">Day {dayCount}</span>
              </div>
              <div className="text-[9px] font-bold tracking-[0.15em] uppercase text-slate-500">
                {formatDate(dayCount)}
              </div>
            </div>

            <div className="h-5 w-px bg-white/[0.08]" />

            <button
              onClick={() => setShowDashboard(true)}
              className="flex flex-col items-start text-[12px] text-slate-400 hover:text-amber-300 transition-colors"
              title="View crew roster"
              style={{ fontFamily: '"DM Sans", sans-serif' }}
            >
              <span className="flex items-center gap-1.5 leading-none mb-0.5">
                <FactionFlag nationality={ship.flag} size={16} />
                <span className="text-[9px] font-medium tracking-[0.08em] uppercase text-slate-500">{ship.name}</span>
              </span>
              <span><span className="font-bold text-slate-300">{crew.length}</span> crew</span>
            </button>
          </div>

          {/* Bottom row: stat bars */}
          <div className="flex items-center gap-5 px-4 py-2.5">
            <StatBar icon={<Shield size={15} />} label="Hull" value={stats.hull} max={stats.maxHull} color="#60a5fa" />
            <StatBar icon={<Users size={15} />} label="Morale" value={Math.round(crew.reduce((sum, c) => sum + c.morale, 0) / (crew.length || 1))} max={100} color="#a78bfa" />
            <StatBar icon={<Anchor size={15} />} label="Cargo" value={Object.values(cargo).reduce((a,b)=>a+b,0)} max={stats.cargoCapacity} color="#fbbf24" />
          </div>
        </div>

        {/* Minimap (top-right) — click to open full map */}
        <div className="flex flex-col gap-3 pointer-events-auto items-end">
          {minimapEnabled && (
            <div className="relative">
              <Minimap onClick={toggleLocalMap} />
              <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-slate-900/80 px-2 py-0.5 rounded text-[9px] text-amber-400 font-bold uppercase tracking-wider whitespace-nowrap">
                Click for Map
              </div>
            </div>
          )}

          {/* Wind button + collapsible panel */}
          <div className="flex flex-col items-end gap-2">
            <button
              onClick={() => { sfxClick(); setShowWind(!showWind); }}
              className={`group relative w-11 h-11 rounded-full flex items-center justify-center
                bg-[#1a1e2e] border-2
                shadow-[inset_0_2px_4px_rgba(0,0,0,0.5),inset_0_-1px_2px_rgba(255,255,255,0.05),0_2px_8px_rgba(0,0,0,0.6)]
                transition-all active:scale-95
                ${showWind
                  ? 'border-[#34d399]/50 text-[#34d399] shadow-[inset_0_2px_4px_rgba(0,0,0,0.5),inset_0_-1px_2px_rgba(255,255,255,0.05),0_0_12px_rgba(52,211,153,0.2)]'
                  : 'border-[#4a4535]/60 text-[#8a8060] hover:text-[#34d399] hover:border-[#34d399]/40'
                }`}
              title="Wind & Navigation"
            >
              <Wind size={15} />
            </button>
            <AnimatePresence>
              {showWind && (
                <motion.div
                  initial={{ opacity: 0, y: -8, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                  className="bg-[#0a0e18]/70 backdrop-blur-xl border border-[#2a2d3a]/50 rounded-xl
                    shadow-[0_8px_32px_rgba(0,0,0,0.4)] p-3 min-w-[180px]"
                >
                  <WindPanel />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Combat Mode Banner */}
      <AnimatePresence>
        {combatMode && playerMode === 'ship' && (
          <CombatModeBanner />
        )}
      </AnimatePresence>

      {/* Anchor Indicator — top-center ASCII banner */}
      <AnimatePresence>
        {anchored && playerMode === 'ship' && !combatMode && (
          <AnchorBanner />
        )}
      </AnimatePresence>

      {/* Collision Warning — top-center ASCII banner */}
      <AnimatePresence>
        {collisionShipDesc && !combatMode && !anchored && playerMode === 'ship' && (
          <CollisionBanner shipDesc={collisionShipDesc} />
        )}
      </AnimatePresence>

      {/* Anchor — bottom-center prompt (matches E to Embark style) */}
      <AnimatePresence>
        {anchored && playerMode === 'ship' && !combatMode && !activePort && !showLocalMap && !showWorldMap && !showDashboard && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="absolute bottom-32 left-1/2 -translate-x-1/2 bg-black/80 backdrop-blur-md px-6 py-3 rounded-full border border-cyan-500/50 shadow-[0_0_20px_rgba(34,211,238,0.2)] text-cyan-400 font-bold tracking-wider"
          >
            Press SPACE BAR to weigh anchor
          </motion.div>
        )}
      </AnimatePresence>

      {/* Interaction Prompt */}
      <AnimatePresence>
        {interactionPrompt && !activePort && !showLocalMap && !showWorldMap && !showInstructions && !showDashboard && (
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
      <PortModal onDismiss={() => {
        if (activePort) dismissedPortRef.current = activePort.id;
        setActivePort(null);
      }} />

      {/* Ship Dashboard Modal */}
      <AnimatePresence>
        <ShipDashboard open={showDashboard} onClose={() => setShowDashboard(false)} />
      </AnimatePresence>

      {/* Notifications */}
      <div className="absolute bottom-20 right-4 flex flex-col gap-2 items-end">
        <AnimatePresence>
          {notifications.map(n => (
            <ASCIIToast
              key={n.id}
              notification={n}
              onDismiss={() => removeNotification(n.id)}
            />
          ))}
        </AnimatePresence>
      </div>

      {showDevPanel && !showInstructions && <RenderTestPanel />}

      {/* Fullscreen Map Overlay */}
      <AnimatePresence>
        {showLocalMap && <WorldMap onClose={() => setShowLocalMap(false)} />}
        {showWorldMap && <WorldMapModal onClose={() => setShowWorldMap(false)} />}
      </AnimatePresence>

      {/* Journal Panel (compact, above button) */}
      <JournalPanel open={showJournal} onClose={() => setShowJournal(false)} />

      {/* Journal Button — lower left, separate */}
      <div className="absolute bottom-4 left-4 pointer-events-auto">
        <button
          onClick={() => { sfxClick(); setShowJournal(!showJournal); }}
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
            <ActionBarButton icon={<Settings size={13} />} label="Settings" accentColor="#9ca3af" glowColor="156,163,175" onClick={() => { sfxOpen(); setShowSettings(true); }} />
            {/* Center — pause/play, bigger */}
            <button
              onClick={() => { sfxClick(); setPaused(!paused); }}
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
            <ViewModeButton />
            <ActionBarButton icon={<Scroll size={13} />} label="Quests" accentColor="#fbbf24" glowColor="251,191,36" />
            <ActionBarButton icon={<Compass size={13} />} label="Navigate" accentColor="#f87171" glowColor="248,113,113" onClick={toggleWorldMap} />
          </div>
        </div>
      </div>

      {/* Settings Modal */}
      <SettingsModal open={showSettings} onClose={() => setShowSettings(false)} />

      {/* Instructions Overlay — swap OpeningASCII / OpeningPamphlet here */}
      <AnimatePresence>
        {showInstructions && (
          <OpeningASCII
            ready={loadingReady}
            loadingMessage={loadingMessage}
            loadingProgress={loadingProgress}
            shipName={ship.name}
            captainName={captain?.name ?? 'Captain Blackwood'}
            crewCount={crew.length}
            portCount={portCount}
            dayCount={dayCount}
            gold={gold}
            onStart={closeOpeningOverlay}
          />
        )}
      </AnimatePresence>

      {/* Commission of Voyage — shown after splash dismisses */}
      <AnimatePresence>
        {showCommission && (
          <EventModalASCII onDismiss={closeCommission} />
        )}
      </AnimatePresence>

    </div>
  );
}

function OpeningOverlay({
  ready,
  loadingMessage,
  loadingProgress,
  shipName,
  captainName,
  crewCount,
  portCount,
  dayCount,
  gold,
  onStart,
}: {
  ready: boolean;
  loadingMessage: string;
  loadingProgress: number;
  shipName: string;
  captainName: string;
  crewCount: number;
  portCount: number;
  dayCount: number;
  gold: number;
  onStart: () => void;
}) {
  const departureDate = formatDate(dayCount);
  const voyageSummary = [
    shipName,
    captainName,
    `${crewCount} crew`,
    `${gold.toLocaleString()} gold`,
    portCount > 0 ? `${portCount} harbors charted` : 'Surveying harbors',
    departureDate,
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[#030811]/90 px-4 py-6 backdrop-blur-md pointer-events-auto sm:px-6"
    >
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `
            radial-gradient(circle at 50% 18%, rgba(245,158,11,0.1), transparent 22%),
            radial-gradient(circle at 50% 78%, rgba(56,189,248,0.12), transparent 26%),
            linear-gradient(180deg, rgba(5,10,18,0.2) 0%, rgba(3,7,17,0.96) 100%)
          `,
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(148,163,184,0.18) 1px, transparent 1px),
            linear-gradient(90deg, rgba(148,163,184,0.12) 1px, transparent 1px)
          `,
          backgroundSize: '56px 56px',
          maskImage: 'radial-gradient(circle at center, black 32%, transparent 78%)',
        }}
      />
      <motion.section
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 12 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 w-full max-w-4xl overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(10,18,30,0.94),rgba(6,10,18,0.84))] px-6 py-8 shadow-[0_28px_80px_rgba(0,0,0,0.42)] sm:px-10 sm:py-10"
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(245,158,11,0.12),transparent_26%),radial-gradient(circle_at_bottom,rgba(56,189,248,0.08),transparent_28%)]" />
        <div className="relative z-10">
          <p className="text-[10px] uppercase tracking-[0.34em] text-slate-500">
            Indian Ocean Mercantile Voyage
          </p>

          <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1
                className="text-5xl leading-none text-[#f5ebd5] sm:text-6xl lg:text-7xl"
                style={{ fontFamily: '"IM Fell English", serif' }}
              >
                Spice Voyager
              </h1>
              <p className="mt-3 text-sm uppercase tracking-[0.3em] text-amber-200/70">
                1612
              </p>
            </div>

            <div className="text-sm text-slate-400 sm:max-w-xs sm:text-right">
              Sail harbor to harbor, trade cleanly, and keep the ship intact long enough to turn a route into a fortune.
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-2 text-[11px] uppercase tracking-[0.2em] text-slate-400">
            {voyageSummary.map((item, index) => (
              <div key={item} className="flex items-center gap-3 whitespace-nowrap">
                {index > 0 && <span className="text-slate-700">·</span>}
                <span>{item}</span>
              </div>
            ))}
          </div>

          <div className="mt-8 border-t border-white/8 pt-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[10px] uppercase tracking-[0.28em] text-slate-500">
                  {ready ? 'Ready To Depart' : 'Preparing Voyage'}
                </div>
                <AnimatePresence mode="wait">
                  <motion.p
                    key={loadingMessage}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.24 }}
                    className="mt-3 max-w-2xl text-sm leading-7 text-slate-200 sm:text-base"
                  >
                    {loadingMessage}
                  </motion.p>
                </AnimatePresence>
              </div>

              <motion.div
                className={`mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border ${ready ? 'border-emerald-300/25 text-emerald-200' : 'border-amber-300/20 text-amber-200'}`}
                animate={ready ? { scale: [1, 1.05, 1] } : { rotate: 360 }}
                transition={ready ? { duration: 2.4, repeat: Infinity, ease: 'easeInOut' } : { duration: 18, repeat: Infinity, ease: 'linear' }}
              >
                <Anchor size={17} />
              </motion.div>
            </div>

            <div className="mt-5 h-px overflow-hidden bg-white/8">
              <motion.div
                className={`h-full ${ready ? 'bg-emerald-300' : 'bg-[linear-gradient(90deg,#f59e0b,#f97316,#38bdf8)]'}`}
                animate={{ width: `${loadingProgress}%` }}
                transition={{ duration: ready ? 0.35 : 0.75, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>
          </div>

          <div className="mt-8 flex flex-col gap-5 border-t border-white/8 pt-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-slate-400">
              <span className="inline-flex items-center gap-1.5">
                <OpeningKeycap>W</OpeningKeycap>
                <OpeningKeycap>S</OpeningKeycap>
                sails
              </span>
              <span className="inline-flex items-center gap-1.5">
                <OpeningKeycap>A</OpeningKeycap>
                <OpeningKeycap>D</OpeningKeycap>
                helm
              </span>
              <span className="inline-flex items-center gap-1.5">
                <OpeningKeycap>E</OpeningKeycap>
                embark
              </span>
              <span>click minimap to chart</span>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-slate-500">
                <OpeningKeycap>Enter</OpeningKeycap>
                <span>{ready ? 'Begin' : 'Stand By'}</span>
              </div>

              <motion.button
                whileHover={ready ? { scale: 1.01, y: -1 } : undefined}
                whileTap={ready ? { scale: 0.99 } : undefined}
                onClick={onStart}
                disabled={!ready}
                className={`inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] transition-all ${
                  ready
                    ? 'bg-[linear-gradient(135deg,#f59e0b,#ea580c)] text-white shadow-[0_14px_30px_rgba(234,88,12,0.28)]'
                    : 'cursor-not-allowed border border-white/10 bg-white/6 text-slate-500'
                }`}
              >
                {ready ? 'Set Sail' : 'Preparing Fleet'}
                {ready && <ArrowRight size={16} />}
              </motion.button>
            </div>
          </div>
        </div>
      </motion.section>
    </motion.div>
  );
}

function OpeningKeycap({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex min-w-8 items-center justify-center rounded-lg border border-white/12 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-100 shadow-[inset_0_-2px_0_rgba(0,0,0,0.35)]">
      {children}
    </span>
  );
}

function RenderTestPanel() {
  const renderDebug = useGameStore((state) => state.renderDebug);
  const updateRenderDebug = useGameStore((state) => state.updateRenderDebug);
  const resetRenderDebug = useGameStore((state) => state.resetRenderDebug);

  return (
    <div className="absolute left-4 top-24 z-40 w-[280px] rounded-2xl border border-white/[0.08] bg-[#08101a]/88 p-4 shadow-[0_18px_42px_rgba(0,0,0,0.45)] backdrop-blur-md pointer-events-auto">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Dev Panel</div>
          <div className="mt-1 text-sm font-semibold text-slate-100">Render Testing</div>
        </div>
        <button
          onClick={() => updateRenderDebug({ showDevPanel: false })}
          className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-[10px] uppercase tracking-[0.16em] text-slate-400 transition-all hover:bg-white/[0.06] hover:text-slate-200"
        >
          Hide
        </button>
      </div>

      <div className="mt-4 flex gap-2">
        <button
          onClick={() => updateRenderDebug({
            minimap: false,
            shadows: false,
            postprocessing: false,
            bloom: false,
            vignette: false,
            advancedWater: false,
            shipWake: false,
            bowFoam: false,
            algae: false,
            wildlifeMotion: false,
          })}
          className="flex-1 rounded-lg border border-amber-600/20 bg-amber-600/10 px-3 py-2 text-[11px] font-medium text-amber-300 transition-all hover:bg-amber-600/15"
        >
          Minimal
        </button>
        <button
          onClick={resetRenderDebug}
          className="flex-1 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[11px] font-medium text-slate-300 transition-all hover:bg-white/[0.06]"
        >
          Defaults
        </button>
      </div>

      <div className="mt-4 space-y-2">
        <RenderToggleRow
          label="Minimap"
          enabled={renderDebug.minimap}
          onToggle={() => updateRenderDebug({ minimap: !renderDebug.minimap })}
        />
        <RenderToggleRow
          label="Shadows"
          enabled={renderDebug.shadows}
          onToggle={() => updateRenderDebug({ shadows: !renderDebug.shadows })}
        />
        <RenderToggleRow
          label="Post FX"
          enabled={renderDebug.postprocessing}
          onToggle={() => updateRenderDebug({ postprocessing: !renderDebug.postprocessing })}
        />
        <RenderToggleRow
          label="Bloom"
          enabled={renderDebug.bloom}
          disabled={!renderDebug.postprocessing}
          onToggle={() => updateRenderDebug({ bloom: !renderDebug.bloom })}
        />
        <RenderToggleRow
          label="Vignette"
          enabled={renderDebug.vignette}
          disabled={!renderDebug.postprocessing}
          onToggle={() => updateRenderDebug({ vignette: !renderDebug.vignette })}
        />
        <RenderToggleRow
          label="Advanced Water"
          enabled={renderDebug.advancedWater}
          onToggle={() => updateRenderDebug({ advancedWater: !renderDebug.advancedWater })}
        />
        <RenderToggleRow
          label="Ship Wake"
          enabled={renderDebug.shipWake}
          onToggle={() => updateRenderDebug({ shipWake: !renderDebug.shipWake })}
        />
        <RenderToggleRow
          label="Bow Foam"
          enabled={renderDebug.bowFoam}
          onToggle={() => updateRenderDebug({ bowFoam: !renderDebug.bowFoam })}
        />
        <RenderToggleRow
          label="Algae"
          enabled={renderDebug.algae}
          onToggle={() => updateRenderDebug({ algae: !renderDebug.algae })}
        />
        <RenderToggleRow
          label="Wildlife Motion"
          enabled={renderDebug.wildlifeMotion}
          onToggle={() => updateRenderDebug({ wildlifeMotion: !renderDebug.wildlifeMotion })}
        />
      </div>
    </div>
  );
}

function RenderToggleRow({
  label,
  enabled,
  onToggle,
  disabled = false,
}: {
  label: string;
  enabled: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onToggle}
      disabled={disabled}
      className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left transition-all ${
        disabled
          ? 'cursor-not-allowed border-white/[0.05] bg-white/[0.02] text-slate-600'
          : 'border-white/[0.07] bg-white/[0.03] hover:bg-white/[0.05]'
      }`}
    >
      <span className={`text-[12px] ${disabled ? 'text-slate-600' : 'text-slate-300'}`}>{label}</span>
      <span
        className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${
          disabled
            ? 'bg-white/[0.03] text-slate-600'
            : enabled
              ? 'bg-emerald-500/15 text-emerald-300'
              : 'bg-slate-700/40 text-slate-400'
        }`}
      >
        {enabled ? 'On' : 'Off'}
      </span>
    </button>
  );
}

const VIEW_MODE_LABELS: Record<string, string> = {
  default: 'Default',
  cinematic: 'Cinematic',
  topdown: 'Top-Down',
  firstperson: 'First Person',
};

function ViewModeButton() {
  const viewMode = useGameStore((state) => state.viewMode);
  const cycleViewMode = useGameStore((state) => state.cycleViewMode);
  const accentColor = '#34d399';
  const glowColor = '52,211,153';

  return (
    <button
      onClick={cycleViewMode}
      className="group relative w-8 h-8 rounded-full flex items-center justify-center
        bg-[#1a1e2e] border-2 border-[#3a3530]/50
        shadow-[inset_0_2px_4px_rgba(0,0,0,0.5),inset_0_-1px_2px_rgba(255,255,255,0.05),0_1px_4px_rgba(0,0,0,0.4)]
        transition-all duration-200 active:scale-95"
      style={{
        color: viewMode !== 'default' ? accentColor : '#6a6550',
        borderColor: viewMode !== 'default' ? accentColor + '66' : undefined,
      }}
      onMouseEnter={(e) => {
        const btn = e.currentTarget;
        btn.style.color = accentColor;
        btn.style.borderColor = accentColor + '66';
        btn.style.boxShadow = `inset 0 2px 4px rgba(0,0,0,0.4), inset 0 -1px 3px rgba(255,255,255,0.1), 0 0 12px rgba(${glowColor},0.3), 0 0 4px rgba(${glowColor},0.15)`;
      }}
      onMouseLeave={(e) => {
        const btn = e.currentTarget;
        if (viewMode === 'default') {
          btn.style.color = '#6a6550';
          btn.style.borderColor = 'rgba(58,53,48,0.5)';
          btn.style.boxShadow = 'inset 0 2px 4px rgba(0,0,0,0.5), inset 0 -1px 2px rgba(255,255,255,0.05), 0 1px 4px rgba(0,0,0,0.4)';
        }
      }}
      title={`View: ${VIEW_MODE_LABELS[viewMode]}`}
    >
      <Eye size={13} />
      <span className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-[#0b1120] border border-slate-700/50 rounded text-[9px] tracking-[0.12em] uppercase text-slate-400 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
        {VIEW_MODE_LABELS[viewMode]}
      </span>
    </button>
  );
}

function ActionBarButton({ icon, label, accentColor = '#b0a880', glowColor = '176,168,128', onClick }: { icon: React.ReactNode; label: string; accentColor?: string; glowColor?: string; onClick?: () => void }) {
  return (
    <button
      onClick={() => { sfxClick(); onClick?.(); }}
      className="group relative w-8 h-8 rounded-full flex items-center justify-center
        bg-[#1a1e2e] border-2 border-[#3a3530]/50
        shadow-[inset_0_2px_4px_rgba(0,0,0,0.5),inset_0_-1px_2px_rgba(255,255,255,0.05),0_1px_4px_rgba(0,0,0,0.4)]
        transition-all duration-200 active:scale-95"
      style={{
        color: '#6a6550',
      }}
      onMouseEnter={(e) => {
        sfxHover();
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

function StatBar({ icon, label, value, max, color }: { icon: React.ReactNode; label: string; value: number; max: number; color: string }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  const low = pct < 30;
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <div className="shrink-0" style={{ color: low ? '#f87171' : color }}>{icon}</div>
      <div className="flex flex-col gap-0.5 min-w-[88px]">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[10px] font-bold tracking-[0.1em] uppercase text-slate-500" style={{ fontFamily: '"DM Sans", sans-serif' }}>{label}</span>
          <span className="text-[10px] font-mono text-slate-400">{value}/{max}</span>
        </div>
        <div className="h-[4px] w-full bg-white/[0.06] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${pct}%`,
              backgroundColor: low ? '#f87171' : color,
              boxShadow: `0 0 6px ${low ? 'rgba(248,113,113,0.4)' : color + '40'}`,
            }}
          />
        </div>
      </div>
    </div>
  );
}

function WindPanel() {
  const windDirection = useGameStore((state) => state.windDirection);
  const windSpeed = useGameStore((state) => state.windSpeed);
  const playerRot = useGameStore((state) => state.playerRot);
  const playerVelocity = useGameStore((state) => state.playerVelocity);
  const relAngle = ((windDirection - playerRot) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);

  let windLabel: string;
  let windColor: string;
  if (relAngle < Math.PI * 0.25 || relAngle > Math.PI * 1.75) {
    windLabel = 'Tailwind';
    windColor = '#34d399';
  } else if (relAngle > Math.PI * 0.75 && relAngle < Math.PI * 1.25) {
    windLabel = 'Headwind';
    windColor = '#f87171';
  } else if (relAngle >= Math.PI * 0.25 && relAngle <= Math.PI * 0.75) {
    windLabel = 'Cross · Port';
    windColor = '#60a5fa';
  } else {
    windLabel = 'Cross · Stbd';
    windColor = '#60a5fa';
  }

  const cardinals = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const windCardinal = cardinals[Math.round(windDirection / (Math.PI / 4)) % 8];
  const headingCardinal = cardinals[Math.round(((playerRot % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) / (Math.PI / 4)) % 8];

  const windDeg = windDirection * 180 / Math.PI;
  const speedKnots = Math.round(windSpeed * 20);
  const shipSpeed = Math.abs(Math.round(playerVelocity * 10) / 10);

  return (
    <div className="space-y-3" style={{ fontFamily: '"DM Sans", sans-serif' }}>
      {/* Wind compass + arrow */}
      <div className="flex items-center gap-3">
        <div className="relative w-12 h-12 rounded-full bg-white/[0.04] border border-white/[0.08] flex items-center justify-center shrink-0">
          {/* Cardinal marks */}
          <span className="absolute top-0.5 left-1/2 -translate-x-1/2 text-[7px] font-bold text-slate-500">N</span>
          <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 text-[7px] font-bold text-slate-600">S</span>
          <span className="absolute left-1 top-1/2 -translate-y-1/2 text-[7px] font-bold text-slate-600">W</span>
          <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[7px] font-bold text-slate-600">E</span>
          {/* Wind arrow */}
          <svg
            width="20" height="20" viewBox="0 0 20 20"
            style={{ transform: `rotate(${windDeg}deg)`, transition: 'transform 1.5s ease' }}
          >
            <path d="M10 2 L13 14 L10 11.5 L7 14 Z" fill={windColor} opacity="0.9" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-bold text-slate-300">{windLabel}</div>
          <div className="text-[10px] text-slate-500">Wind from {windCardinal} · {speedKnots} kn</div>
        </div>
      </div>

      <div className="h-px bg-white/[0.06]" />

      {/* Ship info */}
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-slate-500">Heading</span>
        <span className="text-slate-300 font-bold">{headingCardinal}</span>
      </div>
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-slate-500">Speed</span>
        <span className="text-slate-300 font-bold">{shipSpeed} kn</span>
      </div>

      {/* Wind strength bar */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[9px] font-bold tracking-[0.1em] uppercase text-slate-500">Wind Strength</span>
        </div>
        <div className="h-[4px] w-full bg-white/[0.06] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-1000"
            style={{
              width: `${Math.round(windSpeed * 100)}%`,
              backgroundColor: windColor,
              boxShadow: `0 0 6px ${windColor}40`,
            }}
          />
        </div>
      </div>
    </div>
  );
}
