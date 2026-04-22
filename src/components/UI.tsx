import { lazy, Suspense, useEffect, useState, useCallback, useRef, useMemo, type ReactNode } from 'react';
import { useGameStore, Port, WEAPON_DEFS, PORT_FACTION } from '../store/gameStore';
import { getWorldPortById } from '../utils/worldPorts';
import type { CrewMember, Language, ShipStats, ShipInfo } from '../store/gameStore';
import { COMMODITY_DEFS, type Commodity } from '../utils/commodities';
import type { NPCShipIdentity } from '../utils/npcShipGenerator';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  Coins, Anchor, Wind, Shield, Map as MapIcon, Users, Fish,
  Settings, Eye, Scroll, HelpCircle, BookOpen, Pause, Play, Compass, GraduationCap, ArrowRight, MoreHorizontal
} from 'lucide-react';
import { useIsMobile } from '../utils/useIsMobile';
import { audioManager } from '../audio/AudioManager';
import { sfxClick, sfxHover, sfxOpen, sfxClose, sfxSail, sfxPortArrival, sfxShipHail } from '../audio/SoundEffects';
import { Minimap } from './Minimap';
import { startTerrainPreRender } from '../utils/worldMapTerrainCache';
import { ArrivalCurtain } from './ArrivalCurtain';
import { FactionFlag } from './FactionFlag';
import { FACTIONS } from '../constants/factions';
import { CrewPortraitSquare } from './CrewPortrait';
import { Opening } from './Opening';
import { EventModalMobile } from './EventModalMobile';
import { ASCIIToast } from './ASCIIToast';
import { ValueFlash } from './ValueFlash';
import { resolveWaterPaletteId } from '../utils/waterPalettes';
import { floatingPanelMotion } from '../utils/uiMotion';
import {
  getLiveShipTransform,
  getLiveWalkingTransform,
} from '../utils/livePlayerTransform';
import { getDefaultPortImageCandidates } from '../utils/portAssets';
import { getWindTrimInfo, getWindTrimMultiplier } from '../utils/wind';
import { stat as statColors, shadow as shadowTokens } from '../theme/tokens';
import { CITY_FIELD_DESCRIPTIONS, CITY_FIELD_KEYS, CITY_FIELD_LABELS } from '../utils/cityFieldTypes';

const PortModal = lazy(() => import('./PortModal').then((module) => ({ default: module.PortModal })));
const ASCIIDashboard = lazy(() => import('./ASCIIDashboard').then((module) => ({ default: module.ASCIIDashboard })));
const JournalPanel = lazy(() => import('./Journal').then((module) => ({ default: module.JournalPanel })));
const SettingsModal = lazy(() => import('./SettingsModal').then((module) => ({ default: module.SettingsModal })));
const WorldMap = lazy(() => import('./WorldMap').then((module) => ({ default: module.WorldMap })));
const WorldMapModal = lazy(() => import('./WorldMapModal').then((module) => ({ default: module.WorldMapModal })));
const WorldMapModalChart = lazy(() => import('./WorldMapModalChart').then((module) => ({ default: module.WorldMapModalChart })));

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
    if (building.type === 'dock') return false;

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

// ── Prompt bubble (SPACE / E / T) ───────────────────────────────────────────
// The anchor and interaction prompts share layout + animation. On mobile the
// whole bubble is tappable and dispatches a synthetic keyboard event so the
// existing keydown handlers in GameScene.tsx / UI.tsx stay the single source
// of truth for what SPACE/E/T actually do.

function dispatchPromptKey(key: string) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  if (key === ' ') {
    // Some ship-fire code paths also listen for keyup to release fireHeld.
    // Anchor toggle doesn't care, but fire it anyway for symmetry.
    window.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }));
  }
}

function keyFromPrompt(prompt: string): string {
  if (prompt.includes('T to Hail') || prompt.includes('t to hail')) return 't';
  if (prompt.includes('SPACE to Harvest')) return ' ';
  return 'e';
}

function mobilePromptLabel(prompt: string): string {
  if (prompt.includes('T to Hail')) return 'Tap to hail';
  if (prompt.includes('E to Embark')) return 'Tap to embark';
  if (prompt.includes('E to Disembark')) return 'Tap to disembark';
  if (prompt.includes('SPACE to Harvest')) return 'Tap to harvest';
  if (prompt.includes('too steep')) return 'Shore too steep';
  return prompt;
}

const PROMPT_TONE: Record<'cyan' | 'amber' | 'red', { border: string; shadow: string; text: string }> = {
  cyan: {
    border: 'border-cyan-500/50',
    shadow: 'shadow-[0_0_20px_rgba(34,211,238,0.2)]',
    text: 'text-cyan-400',
  },
  amber: {
    border: 'border-amber-500/50',
    shadow: 'shadow-[0_0_20px_rgba(245,158,11,0.3)]',
    text: 'text-amber-400',
  },
  red: {
    border: 'border-red-500/60',
    shadow: 'shadow-[0_0_20px_rgba(239,68,68,0.35)]',
    text: 'text-red-400',
  },
};

function PromptBubble({
  children,
  tone,
  isMobile,
  onTap,
}: {
  children: ReactNode;
  tone: 'cyan' | 'amber' | 'red';
  isMobile: boolean;
  onTap: () => void;
}) {
  const t = PROMPT_TONE[tone];
  const common = `absolute left-1/2 -translate-x-1/2 bg-black/80 backdrop-blur-md px-6 py-3 rounded-full border ${t.border} ${t.shadow} ${t.text} font-bold tracking-wider ${isMobile ? 'bottom-24' : 'bottom-32'}`;

  if (!isMobile) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        className={common}
      >
        {children}
      </motion.div>
    );
  }

  return (
    <motion.button
      type="button"
      onPointerDown={(e) => {
        // Prevent the press from bubbling to the canvas (which would otherwise
        // queue a tap-to-steer heading). pointerdown gives the snappiest feel.
        e.stopPropagation();
        onTap();
      }}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className={`${common} pointer-events-auto cursor-pointer active:scale-95 transition-transform select-none`}
      style={{ touchAction: 'none' }}
    >
      {children}
    </motion.button>
  );
}

// ── Combat Mode Banner ──────────────────────────────────────────────────────
// Animated ASCII alert that appears top-center when fight mode is active
function CombatModeBanner() {
  const [frame, setFrame] = useState(0);
  const cannons = useGameStore((state) => state.stats.cannons);
  const cannonballs = useGameStore((state) => state.cargo.Munitions);
  const { isMobile } = useIsMobile();

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
      className={`absolute ${isMobile ? 'top-3' : 'top-20'} left-1/2 -translate-x-1/2 z-50`}
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
          <div className="text-center text-red-500/40 text-[9px] font-mono tracking-wider mt-0.5">
            ● Swivel Gun{cannons > 0 ? ` · Munitions: ${cannonballs}` : ''}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ── Hunting Mode Banner ─────────────────────────────────────────────────────
// Land counterpart to CombatModeBanner. Earthy palette so the player can feel
// the mode shift between sea-combat (red) and hunting (amber/forest).
function HuntingModeBanner() {
  const [tick, setTick] = useState(0);
  const activeWeapon = useGameStore((s) => s.activeLandWeapon);
  const ownedWeapons = useGameStore((s) => s.landWeapons);
  const munitions = useGameStore((s) => s.cargo.Munitions ?? 0);

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 500);
    return () => clearInterval(id);
  }, []);

  // Import dynamically through the module to avoid circular deps in render
  const weaponLabel = activeWeapon === 'musket' ? 'Matchlock Musket' : 'Hunting Bow';
  const ammoLine = activeWeapon === 'musket'
    ? `Powder & shot: ${munitions}`
    : 'No ammunition required';
  const swapHint = ownedWeapons.length > 1 ? ' · [TAB] swap weapon' : '';
  const icon = tick % 2 === 0 ? '⌖' : '◎';

  return (
    <motion.div
      initial={{ opacity: 0, y: -20, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.9 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      className="absolute top-3 left-1/2 -translate-x-1/2 z-50"
    >
      <div className="relative">
        <div className="absolute inset-0 rounded-lg bg-amber-700/15 blur-xl" />
        <div className="relative bg-[#1a1208]/90 backdrop-blur-md border border-amber-600/50 rounded-lg px-5 py-2
          shadow-[0_0_24px_rgba(180,120,40,0.25),inset_0_1px_0_rgba(220,170,90,0.1)]">
          <pre className="text-center font-mono text-[11px] leading-tight select-none" style={{ textShadow: '0 0 8px rgba(217,150,60,0.5)' }}>
            <span className="text-amber-500/60">╫{'═'.repeat(3)}╫</span>
            <span className="text-amber-300 font-bold mx-2">{icon}</span>
            <motion.span
              animate={{ opacity: [1, 0.7, 1] }}
              transition={{ duration: 1.4, repeat: Infinity }}
              className="text-amber-300 font-bold tracking-[0.3em]"
            >HUNTING</motion.span>
            <span className="text-amber-300 font-bold mx-2">{icon}</span>
            <span className="text-amber-500/60">╫{'═'.repeat(3)}╫</span>
          </pre>
          <div className="text-center text-amber-500/60 text-[9px] font-mono tracking-wider mt-0.5">
            [CLICK] fire · [F] holster{swapHint}
          </div>
          <div className="text-center text-amber-500/45 text-[9px] font-mono tracking-wider mt-0.5">
            ● {weaponLabel} · {ammoLine}
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
  const { isMobile } = useIsMobile();
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
      className={`absolute ${isMobile ? 'top-3' : 'top-20'} left-1/2 -translate-x-1/2 z-50`}
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
  const { isMobile } = useIsMobile();
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
      className={`absolute ${isMobile ? 'top-3' : 'top-20'} left-1/2 -translate-x-1/2 z-50`}
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
  const openedFromToastPortRef = useRef<string | null>(null);
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
  const useWorldMapChart = useGameStore((state) => state.renderDebug.worldMapChart);
  const cityFieldOverlayEnabled = useGameStore((state) => state.renderDebug.cityFieldOverlay);
  const cityFieldMode = useGameStore((state) => state.renderDebug.cityFieldMode);
  const updateRenderDebug = useGameStore((state) => state.updateRenderDebug);
  const waterPaletteId = useGameStore((state) => resolveWaterPaletteId(state));
  const captainExpression = useGameStore((state) => state.captainExpression);
  const reputation = useGameStore((state) => state.reputation);
  const currentWorldPortId = useGameStore((state) => state.currentWorldPortId);

  const [showLocalMap, setShowLocalMap] = useState(false);
  const [showWorldMap, setShowWorldMap] = useState(false);
  const [showInstructions, setShowInstructions] = useState(true);
  const [arrivalCurtainPort, setArrivalCurtainPort] = useState<string | null>(null);

  // Voyage arrival → cinematic curtain that masks the world-map → port swap.
  // Caller passes the destination port name and the swap closure (fastTravel +
  // close world map). We fade the curtain in, run the swap under cover, then
  // fade out to reveal the new port.
  const handleArrival = useCallback(async (portName: string, swap: () => void) => {
    setArrivalCurtainPort(portName);
    // Wait for curtain to reach opaque (fade-in is 550ms) before swapping
    // the world map → port underneath.
    await new Promise(r => setTimeout(r, 600));
    swap();
    // Brief hold so the new port has a frame to mount before we reveal it.
    await new Promise(r => setTimeout(r, 550));
    setArrivalCurtainPort(null);
  }, []);

  // Ship hitting map edge can request the world map be opened
  const requestWorldMap = useGameStore(s => s.requestWorldMap);
  const setRequestWorldMap = useGameStore(s => s.setRequestWorldMap);
  useEffect(() => {
    if (requestWorldMap) {
      setShowWorldMap(true);
      setRequestWorldMap(false);
    }
  }, [requestWorldMap, setRequestWorldMap]);
  const [dashboardState, setDashboardState] = useState<{ tab?: string; crewId?: string; commodity?: string } | null>(null);
  const showDashboard = !!dashboardState;
  const setShowDashboard = (v: boolean) => setDashboardState(v ? {} : null);
  const [expandedStat, setExpandedStat] = useState<'hull' | 'morale' | 'cargo' | null>(null);
  const paused = useGameStore(s => s.paused);
  const setPaused = useGameStore(s => s.setPaused);
  const [showJournal, setShowJournal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showWind, setShowWind] = useState(false);
  const [showOverlayMenu, setShowOverlayMenu] = useState(false);
  const [showOverflowMenu, setShowOverflowMenu] = useState(false);
  const [hailNpc, setHailNpc] = useState<NPCShipIdentity | null>(null);
  const overlayMenuRef = useRef<HTMLDivElement | null>(null);

  // Mobile layout branching. `isMobile` is true on coarse-pointer viewports
  // ≤900px, or when Settings → Force Mobile Layout is on. See `useIsMobile.ts`.
  const { isMobile } = useIsMobile();
  const [hullDamagePulse, setHullDamagePulse] = useState<{ key: number; severity: number } | null>(null);
  const [showCommission, setShowCommission] = useState(false);
  const [splashComplete, setSplashComplete] = useState(false);
  const worldReady = portCount > 0;
  const [loadingMessage, setLoadingMessage] = useState(LOADING_MESSAGES[0]);
  const [loadingProgress, setLoadingProgress] = useState(10);
  const mapPreRenderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hailWasPausedRef = useRef(false);
  const previousHullRef = useRef(stats.hull);
  const hullDamagePulseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reduceMotion = useReducedMotion();
  const startupOverlayActive = showInstructions || showCommission;

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

  useEffect(() => {
    const previousHull = previousHullRef.current;
    if (stats.hull < previousHull) {
      const damage = previousHull - stats.hull;
      const severity = Math.min(1, Math.max(0.35, damage / Math.max(1, stats.maxHull) * 4));

      setHullDamagePulse((current) => ({
        key: (current?.key ?? 0) + 1,
        severity,
      }));

      if (hullDamagePulseTimerRef.current) {
        clearTimeout(hullDamagePulseTimerRef.current);
      }
      hullDamagePulseTimerRef.current = setTimeout(() => setHullDamagePulse(null), 520);
    }

    previousHullRef.current = stats.hull;
  }, [stats.hull, stats.maxHull]);

  useEffect(() => {
    return () => {
      if (hullDamagePulseTimerRef.current) {
        clearTimeout(hullDamagePulseTimerRef.current);
      }
    };
  }, []);

  const captain = crew.find(c => c.role === 'Captain');
  const closeOpeningOverlay = useCallback(() => {
    if (splashComplete) {
      sfxSail();
      setShowInstructions(false);
      setShowCommission(true);
    }
  }, [splashComplete]);

  const closeCommission = useCallback(() => {
    setShowCommission(false);
    audioManager.transitionToOverworld();
    if (mapPreRenderTimerRef.current) clearTimeout(mapPreRenderTimerRef.current);
    mapPreRenderTimerRef.current = setTimeout(() => {
      startTerrainPreRender(waterPaletteId);
      mapPreRenderTimerRef.current = null;
    }, 10_000);
  }, [waterPaletteId]);

  useEffect(() => {
    return () => {
      if (mapPreRenderTimerRef.current) clearTimeout(mapPreRenderTimerRef.current);
    };
  }, []);

  // Splash loader — purely cosmetic, fully decoupled from world-gen. The
  // world renders behind the commission modal (which comes next), so the
  // splash only needs to feel like a brief curtain. We use setTimeout (not
  // rAF) to flip splashComplete, because rAF callbacks are starved during
  // heavy GameScene initialization — setTimeout fires reliably from the
  // timer queue as soon as the main thread yields.
  useEffect(() => {
    if (!showInstructions || splashComplete) return;

    const SPLASH_DURATION_MS = 2400;
    const MESSAGE_INTERVAL_MS = 380;

    setLoadingMessage(LOADING_MESSAGES[0]);
    setLoadingProgress(100); // Opening.tsx drives its own bar via CSS; this is kept for the legacy splash path.

    let i = 0;
    const msgTimer = setInterval(() => {
      i = (i + 1) % LOADING_MESSAGES.length;
      setLoadingMessage(LOADING_MESSAGES[i]);
    }, MESSAGE_INTERVAL_MS);

    const doneTimer = setTimeout(() => {
      setLoadingMessage('Harbors charted. Holds secured. The monsoon favors departure.');
      setSplashComplete(true);
    }, SPLASH_DURATION_MS);

    return () => {
      clearInterval(msgTimer);
      clearTimeout(doneTimer);
    };
  }, [showInstructions, splashComplete]);

  useEffect(() => {
    if (!showInstructions || !splashComplete) return;

    const handleLaunchKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        closeOpeningOverlay();
      }
    };

    window.addEventListener('keydown', handleLaunchKey);
    return () => window.removeEventListener('keydown', handleLaunchKey);
  }, [showInstructions, splashComplete, closeOpeningOverlay]);

  // Check for nearby ports — approach toast + activation
  const PORT_APPROACH_RADIUS_SQ = 60 * 60; // grand toast at ~60 units
  useEffect(() => {
    if (startupOverlayActive) {
      if (useGameStore.getState().activePort) setActivePort(null);
      return;
    }

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
        openedFromToastPortRef.current = null;
        sfxPortArrival();
        setActivePort(nearest);
      } else if (!nearest && currentActivePort) {
        const openedFromToastPort = openedFromToastPortRef.current
          ? ports.find(port => port.id === openedFromToastPortRef.current)
          : null;
        const keepToastPortOpen = openedFromToastPort && currentActivePort.id === openedFromToastPort.id && (() => {
          const dx = playerPos[0] - openedFromToastPort.position[0];
          const dz = playerPos[2] - openedFromToastPort.position[2];
          return dx * dx + dz * dz < PORT_APPROACH_RADIUS_SQ;
        })();

        if (!keepToastPortOpen) {
          openedFromToastPortRef.current = null;
          setActivePort(null);
        }
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
              {
                subtitle: `${port.scale} port · ${port.culture}`,
                imageCandidates: getDefaultPortImageCandidates(port.id),
                openPortId: port.id,
              },
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
  }, [setActivePort, startupOverlayActive]);

  const closeHail = useCallback(() => {
    setHailNpc(null);
    if (!hailWasPausedRef.current) {
      setPaused(false);
    }
  }, [setPaused]);

  // Escape key closes modals
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showOverlayMenu) { sfxClose(); setShowOverlayMenu(false); }
        else if (hailNpc) { sfxClose(); closeHail(); }
        else if (showDashboard) { sfxClose(); setShowDashboard(false); }
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
  }, [showOverlayMenu, showLocalMap, showWorldMap, showDashboard, activePort, setActivePort, hailNpc, closeHail]);

  useEffect(() => {
    if (!showOverlayMenu) return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (overlayMenuRef.current?.contains(target)) return;
      setShowOverlayMenu(false);
    };
    window.addEventListener('mousedown', handlePointerDown);
    return () => window.removeEventListener('mousedown', handlePointerDown);
  }, [showOverlayMenu]);

  useEffect(() => {
    if (showLocalMap || showWorldMap || showSettings || showDashboard || activePort || hailNpc) {
      setShowOverlayMenu(false);
    }
  }, [activePort, hailNpc, showDashboard, showLocalMap, showSettings, showWorldMap]);

  useEffect(() => {
    const handleHailKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 't') return;
      if (showInstructions || showSettings || showDashboard || showLocalMap || showWorldMap || activePort) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const state = useGameStore.getState();
      if (state.interactionPrompt !== 'Press T to Hail') return;
      e.preventDefault();

      const npc = state.nearestHailableNpc;
      if (!npc) {
        state.addNotification('They signal back but keep their distance.', 'info');
        return;
      }

      hailWasPausedRef.current = state.paused;
      state.setPaused(true);
      setHailNpc(npc);
      sfxShipHail(npc.hailLanguage);
    };

    window.addEventListener('keydown', handleHailKey);
    return () => window.removeEventListener('keydown', handleHailKey);
  }, [showInstructions, showSettings, showDashboard, showLocalMap, showWorldMap, activePort]);

  // Keep nearestHailableNpc subscribed so it stays reactive, but don't auto-close
  // the hail panel when the NPC drifts out of range — player closes it manually.
  useGameStore((state) => state.nearestHailableNpc);

  // Auto-dismiss is handled per-toast inside <ASCIIToast> via useAutoDismiss.
  // That fixes the "only the latest toast auto-dismisses" bug and enables pause-on-hover.

  const toggleLocalMap = useCallback(() => { sfxOpen(); setShowLocalMap(prev => !prev); }, []);
  const toggleWorldMap = useCallback(() => { sfxOpen(); setShowWorldMap(prev => !prev); }, []);
  const cycleViewMode = useGameStore((state) => state.cycleViewMode);

  // Number key hotkeys for bottom action bar
  useEffect(() => {
    const handleHotkey = (e: KeyboardEvent) => {
      // Don't fire hotkeys when a modal is open or typing in an input
      if (showInstructions || showSettings || activePort || hailNpc) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.key) {
        case '1': // Learn
          sfxClick();
          break;
        case '2': // Help
          sfxClick();
          break;
        case '3': // Settings
          sfxOpen();
          setShowSettings(true);
          break;
        case '4': // Pause/Play
          sfxClick();
          setPaused(!paused);
          break;
        case '5': // View Mode
          sfxClick();
          cycleViewMode();
          break;
        case '6': // Quests
          sfxClick();
          break;
        case '7': // Navigate (world map)
          toggleWorldMap();
          break;
      }
    };
    window.addEventListener('keydown', handleHotkey);
    return () => window.removeEventListener('keydown', handleHotkey);
  }, [showInstructions, showSettings, activePort, hailNpc, paused, setPaused, cycleViewMode, toggleWorldMap]);

  const hullDamageSeverity = hullDamagePulse?.severity ?? 0;
  const hullDamageHudMotion = hullDamagePulse && !reduceMotion
    ? {
        x: [0, -4 * hullDamageSeverity, 3 * hullDamageSeverity, -2 * hullDamageSeverity, 0],
        y: [0, 1.5 * hullDamageSeverity, -1 * hullDamageSeverity, 0],
      }
    : { x: 0, y: 0 };

  return (
    <div className="absolute inset-0 pointer-events-none p-4 flex flex-col justify-between font-sans text-white text-shadow-sm select-none">
      <AnimatePresence>
        {hullDamagePulse && (
          <motion.div
            key={hullDamagePulse.key}
            className="absolute inset-0 z-30 pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.75 * hullDamageSeverity, 0.18 * hullDamageSeverity, 0] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.52, ease: 'easeOut' }}
            style={{
              background: 'radial-gradient(circle at center, rgba(127,29,29,0) 48%, rgba(220,38,38,0.18) 78%, rgba(127,29,29,0.46) 100%)',
              boxShadow: `inset 0 0 ${90 + hullDamageSeverity * 80}px rgba(220,38,38,${0.28 + hullDamageSeverity * 0.18})`,
            }}
          />
        )}
      </AnimatePresence>

      {/* Top Bar */}
      <div className="flex justify-between items-start">
        <motion.div
          animate={hullDamageHudMotion}
          transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}
          className="bg-[#0a0e18]/70 backdrop-blur-xl rounded-xl border border-[#2a2d3a]/50 pointer-events-auto
            shadow-[0_8px_32px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.04)]"
        >
          {/* Top section — portrait on the left, right column holds the
              identity strip over the info row (gold/food · time · crew). */}
          <div className={`flex items-stretch border-b border-[#3a3530]/30 ${isMobile ? 'gap-2 px-2.5 py-2' : 'gap-3 px-4 py-3'}`}>
            {(() => {
              // Ring color reflects captain's current expression/mood
              const ringColor = captainExpression === 'Friendly' ? '#22c55e'
                : captainExpression === 'Smug' ? '#eab308'
                : captainExpression === 'Fierce' ? '#ef4444'
                : captainExpression === 'Stern' ? '#f97316'
                : captainExpression === 'Melancholy' ? '#6366f1'
                : captainExpression === 'Curious' ? '#06b6d4'
                : captain && captain.morale >= 85 ? '#22c55e'
                : captain && captain.morale <= 25 ? '#ef4444'
                : '#8b7a5e';
              const glowColor = captainExpression
                ? ringColor + '60'
                : 'transparent';
              return (
                <button
                  onClick={() => { sfxOpen(); setDashboardState({ tab: 'crew', crewId: captain?.id }); }}
                  onMouseEnter={(e) => {
                    sfxHover();
                    const btn = e.currentTarget;
                    btn.style.borderColor = ringColor;
                    btn.style.boxShadow = `inset 0 2px 4px rgba(0,0,0,0.4), 0 0 18px ${ringColor}50, 0 0 6px ${ringColor}30`;
                    btn.style.transform = 'scale(1.06)';
                  }}
                  onMouseLeave={(e) => {
                    const btn = e.currentTarget;
                    btn.style.borderColor = ringColor;
                    btn.style.boxShadow = `inset 0 2px 4px rgba(0,0,0,0.5), 0 0 ${captainExpression ? '12px' : '4px'} ${glowColor}`;
                    btn.style.transform = 'scale(1)';
                  }}
                  className="rounded-full bg-[#1a1e2e] flex items-center justify-center shrink-0 overflow-hidden
                    transition-all duration-300 active:scale-95"
                  style={{
                    width: isMobile ? 52 : 72,
                    height: isMobile ? 52 : 72,
                    border: `3px solid ${ringColor}`,
                    boxShadow: `inset 0 2px 4px rgba(0,0,0,0.5), 0 0 ${captainExpression ? '12px' : '4px'} ${glowColor}`,
                  }}
                  title={captain ? `${captain.name} — Ship Dashboard` : 'Ship Dashboard'}
                >
                  {captain ? (
                    <CrewPortraitSquare member={captain} size={isMobile ? 46 : 64} expressionOverride={captainExpression} />
                  ) : (
                    <Users size={22} className="text-amber-400/80" />
                  )}
                </button>
              );
            })()}

            {/* Right column: identity strip over the info row */}
            <div className={`flex flex-col justify-center flex-1 min-w-0 ${isMobile ? 'gap-1' : 'gap-2'}`}>
              {/* Identity strip — captain · faction · ship.
                  Ship names use italic (traditional print convention for
                  vessels); faction gets a warm heraldic tint.
                  On mobile, the captain button is dropped (tap portrait). */}
              <div
                className={`flex items-baseline gap-2 border-b border-[#3a3530]/40
                  text-[11px] leading-none whitespace-nowrap min-w-0
                  ${isMobile ? 'pb-1' : 'pb-1.5'}`}
                style={{ fontFamily: '"DM Sans", sans-serif' }}
              >
                {!isMobile && (captain ? (
                  <>
                    <button
                      onClick={() => { sfxOpen(); setDashboardState({ tab: 'crew', crewId: captain.id }); }}
                      onMouseEnter={() => sfxHover()}
                      className="group flex items-baseline gap-1 text-slate-200 hover:text-amber-200 transition-colors duration-200
                        decoration-dotted decoration-slate-600 underline-offset-[3px] hover:underline"
                      title={`${captain.name} — open captain dashboard`}
                    >
                      <span className="text-[9px] font-semibold tracking-[0.14em] uppercase text-slate-500 group-hover:text-amber-500/80 transition-colors duration-200">
                        Capt.
                      </span>
                      <span className="font-medium">{captain.name}</span>
                    </button>
                    <span className="text-slate-600/80" aria-hidden>·</span>
                  </>
                ) : (
                  <>
                    <span className="text-slate-600">Capt. —</span>
                    <span className="text-slate-600/80" aria-hidden>·</span>
                  </>
                ))}
                <button
                  onClick={() => { sfxOpen(); setShowWorldMap(true); }}
                  onMouseEnter={() => sfxHover()}
                  className="group flex items-center gap-1.5 text-amber-200/80 hover:text-amber-200 transition-colors duration-200
                    decoration-dotted decoration-amber-600/60 underline-offset-[3px] hover:underline"
                  title={`${FACTIONS[ship.flag].displayName} — open world map`}
                >
                  <span className="transition-transform duration-200 group-hover:scale-110">
                    <FactionFlag nationality={ship.flag} size={12} />
                  </span>
                  <span className="text-[10px] font-semibold tracking-[0.14em] uppercase">
                    {FACTIONS[ship.flag].shortName}
                  </span>
                </button>
                <span className="text-slate-600/80" aria-hidden>·</span>
                <button
                  onClick={() => { sfxOpen(); setDashboardState({ tab: 'ship' }); }}
                  onMouseEnter={() => sfxHover()}
                  className="group flex items-baseline gap-[3px] text-amber-100/90 hover:text-amber-200 transition-colors duration-200"
                  title={`${ship.name} — open ship dashboard`}
                >
                  <span className="text-[10px] text-amber-100/55 group-hover:text-amber-200/80 transition-colors duration-200"
                    style={{ fontFamily: '"Fraunces", serif' }}>
                    the
                  </span>
                  <span className="italic text-[13px] decoration-dotted decoration-amber-600/60 underline-offset-[3px] group-hover:underline"
                    style={{ fontFamily: '"Fraunces", serif', fontWeight: 500 }}>
                    {ship.name}
                  </span>
                </button>
              </div>

              {/* Info row — gold/food · time · crew.
                  Mobile: drop food sub-line, drop date sub-line, hide crew
                  button (crew roster is reachable via the portrait tap). */}
              <div className={`flex items-center ${isMobile ? 'gap-2' : 'gap-3'}`}>
                <div className="flex flex-col items-start" style={{ fontFamily: '"DM Sans", sans-serif' }}>
                  <div className={`flex items-center gap-1.5 text-amber-400 font-bold tabular-nums ${isMobile ? 'text-base' : 'text-lg'}`}>
                    <Coins size={isMobile ? 15 : 18} className="text-amber-500" />
                    <ValueFlash value={gold} upColor="#fde68a" downColor="#f59e0b">
                      {gold.toLocaleString()}
                    </ValueFlash>
                  </div>
                  {!isMobile && (
                    <div className="flex items-center gap-1.5 text-[11px] text-emerald-400/80 -mt-0.5">
                      <Fish size={11} className="text-emerald-500/70" />
                      <ValueFlash value={provisions} upColor="#86efac" downColor="#f87171">
                        {provisions}
                      </ValueFlash>
                      <span className="text-emerald-400/60">food</span>
                    </div>
                  )}
                </div>

                <div className="h-8 w-px bg-gradient-to-b from-transparent via-white/[0.1] to-transparent" />

                <div className="flex flex-col items-start" style={{ fontFamily: '"DM Sans", sans-serif' }}>
                  <div className={`text-slate-300 font-medium ${isMobile ? 'text-[12px]' : 'text-[13px]'}`}>
                    {formatTime(timeOfDay)} <span className="text-slate-600">·</span> <span className="text-slate-400">Day {dayCount}</span>
                  </div>
                  {!isMobile && (
                    <div className="text-[10px] font-bold tracking-[0.12em] uppercase text-slate-500">
                      {formatDate(dayCount)}
                    </div>
                  )}
                </div>

                {!isMobile && (
                  <>
                    <div className="h-8 w-px bg-gradient-to-b from-transparent via-white/[0.1] to-transparent" />

                    <button
                      onClick={() => { sfxOpen(); setDashboardState({ tab: 'crew' }); }}
                      onMouseEnter={() => sfxHover()}
                      className="flex flex-col items-start text-slate-400 hover:text-amber-300 transition-colors duration-200"
                      title="View crew roster"
                      style={{ fontFamily: '"DM Sans", sans-serif' }}
                    >
                      <span className="text-[13px] leading-none">
                        <span className="font-bold text-slate-200 tabular-nums">{crew.length}</span>
                        <span className="ml-1 text-slate-400">crew</span>
                      </span>
                      <span className="mt-1 text-[10px] font-semibold tracking-[0.12em] uppercase text-slate-500">
                        {ship.type}
                      </span>
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Bottom row: stat bars */}
          <div className={`flex items-center ${isMobile ? 'gap-2 px-2.5 py-1.5' : 'gap-5 px-4 py-2.5'}`}>
            <StatBar icon={<Shield size={isMobile ? 12 : 15} />} label="Hull" value={stats.hull} max={stats.maxHull} color={statColors.hull}
              active={expandedStat === 'hull'} onClick={() => setExpandedStat(expandedStat === 'hull' ? null : 'hull')} />
            <StatBar icon={<Users size={isMobile ? 12 : 15} />} label="Morale" value={Math.round(crew.reduce((sum, c) => sum + c.morale, 0) / (crew.length || 1))} max={100} color={statColors.morale}
              active={expandedStat === 'morale'} onClick={() => setExpandedStat(expandedStat === 'morale' ? null : 'morale')} />
            <StatBar icon={<Anchor size={isMobile ? 12 : 15} />} label="Cargo" value={Object.values(cargo).reduce((a,b)=>a+b,0)} max={stats.cargoCapacity} color={statColors.cargo}
              active={expandedStat === 'cargo'} onClick={() => setExpandedStat(expandedStat === 'cargo' ? null : 'cargo')} />
          </div>

          {/* Expandable stat detail panels */}
          <AnimatePresence>
            {expandedStat && (
              <motion.div
                key={expandedStat}
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ type: 'spring', damping: 28, stiffness: 350 }}
                className="overflow-hidden"
              >
                <div className="border-t border-[#3a3530]/30">
                  {expandedStat === 'hull' && <HullDetailPanel stats={stats} ship={ship}
                    onOpenDashboard={() => { setExpandedStat(null); setDashboardState({ tab: 'ship' }); }} />}
                  {expandedStat === 'morale' && <MoraleDetailPanel crew={crew}
                    onSelectCrew={(crewId) => { setExpandedStat(null); setDashboardState({ tab: 'crew', crewId }); }} />}
                  {expandedStat === 'cargo' && <CargoDetailPanel cargo={cargo} capacity={stats.cargoCapacity}
                    onOpenDashboard={() => { setExpandedStat(null); setDashboardState({ tab: 'cargo' }); }}
                    onSelectCommodity={(commodity) => { setExpandedStat(null); setDashboardState({ tab: 'cargo', commodity }); }} />}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Minimap (top-right) — click to open full map */}
        <div className={`flex flex-col pointer-events-auto items-end ${isMobile ? 'gap-2' : 'gap-3'}`}>
          {minimapEnabled && (
            <div className="relative group">
              <Minimap onClick={toggleLocalMap} size={isMobile ? 104 : 172} />
              <div
                className={`absolute -bottom-1 left-1/2 -translate-x-1/2 bg-slate-900/80 rounded text-amber-400 font-bold uppercase tracking-wider whitespace-nowrap pointer-events-none ${isMobile ? 'px-1.5 py-0 text-[8px]' : 'px-2 py-0.5 text-[9px] opacity-0 group-hover:opacity-100 transition-opacity duration-200'}`}
              >
                {isMobile ? 'Map' : 'Click for Map'}
              </div>
            </div>
          )}

          {/* Wind button + collapsible panel */}
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              <WindQuickMeter />
              <button
                onClick={() => { sfxClick(); setShowWind(!showWind); }}
                aria-pressed={showWind}
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
              <div ref={overlayMenuRef} className="relative">
                <button
                  onClick={() => { sfxClick(); setShowOverlayMenu((prev) => !prev); }}
                  aria-pressed={showOverlayMenu || cityFieldOverlayEnabled}
                  className={`group relative w-11 h-11 rounded-full flex items-center justify-center
                    bg-[#1a1e2e] border-2
                    shadow-[inset_0_2px_4px_rgba(0,0,0,0.5),inset_0_-1px_2px_rgba(255,255,255,0.05),0_2px_8px_rgba(0,0,0,0.6)]
                    transition-all active:scale-95
                    ${showOverlayMenu || cityFieldOverlayEnabled
                      ? 'border-[#60a5fa]/50 text-[#60a5fa] shadow-[inset_0_2px_4px_rgba(0,0,0,0.5),inset_0_-1px_2px_rgba(255,255,255,0.05),0_0_12px_rgba(96,165,250,0.2)]'
                      : 'border-[#4a4535]/60 text-[#8a8060] hover:text-[#60a5fa] hover:border-[#60a5fa]/40'
                    }`}
                  title={cityFieldOverlayEnabled ? `Overlay: ${cityFieldMode === 'district' ? 'District' : CITY_FIELD_LABELS[cityFieldMode]}` : 'Overlay'}
                >
                  <MapIcon size={15} />
                </button>
                <AnimatePresence>
                  {showOverlayMenu && (
                    <motion.div
                      initial={{ opacity: 0, y: -8, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -8, scale: 0.95 }}
                      transition={{ duration: 0.2 }}
                      className="absolute right-0 top-14 z-40 min-w-[220px] rounded-xl border border-[#2a2d3a]/50 bg-[#0a0e18]/82 p-3 shadow-card backdrop-blur-xl pointer-events-auto"
                    >
                      <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Overlay</div>
                      <div className="mt-1 text-[11px] text-slate-400">Shows the selected field as a heatmap across all generated land.</div>
                      <div className="mt-3 space-y-1.5">
                        <OverlayMenuRow
                          label="Off"
                          description="Hide all overlay heatmaps."
                          active={!cityFieldOverlayEnabled}
                          onClick={() => {
                            updateRenderDebug({ cityFieldOverlay: false });
                            setShowOverlayMenu(false);
                          }}
                        />
                        <OverlayMenuRow
                          key="district"
                          label="District"
                          description="Classified districts: citadel, sacred, urban core, elite residential, artisan, waterside, fringe."
                          active={cityFieldOverlayEnabled && cityFieldMode === 'district'}
                          onClick={() => {
                            updateRenderDebug({ cityFieldOverlay: true, cityFieldMode: 'district' });
                            setShowOverlayMenu(false);
                          }}
                        />
                        {CITY_FIELD_KEYS.map((field) => (
                          <OverlayMenuRow
                            key={field}
                            label={CITY_FIELD_LABELS[field]}
                            description={CITY_FIELD_DESCRIPTIONS[field]}
                            active={cityFieldOverlayEnabled && cityFieldMode === field}
                            onClick={() => {
                              updateRenderDebug({ cityFieldOverlay: true, cityFieldMode: field });
                              setShowOverlayMenu(false);
                            }}
                          />
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
            <AnimatePresence>
              {showWind && (
                <motion.div
                  initial={{ opacity: 0, y: -8, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                  className="bg-[#0a0e18]/70 backdrop-blur-xl border border-[#2a2d3a]/50 rounded-xl
                    shadow-card p-3 min-w-[180px]"
                >
                  <WindPanel />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Mobile-only Journal button — lives in the top-right cluster to
              avoid colliding with the 5-button action bar at the bottom. */}
          {isMobile && (
            <button
              onClick={() => { sfxClick(); setShowJournal(!showJournal); }}
              aria-pressed={showJournal}
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
            </button>
          )}
        </div>
      </div>

      {/* Port-map marker (top-center, desktop only) — tells the player which
          local port map they're on, plus faction standing and heading. Reads
          like a caption on a period sea chart: minimal frame, hierarchy in
          typography. Hidden on mobile and whenever any modal overlay is up. */}
      <AnimatePresence>
        {!isMobile && !startupOverlayActive && !showLocalMap && !showWorldMap
          && !activePort && !showDashboard && playerMode === 'ship'
          && currentWorldPortId && (() => {
          const port = getWorldPortById(currentWorldPortId);
          if (!port) return null;
          const faction = PORT_FACTION[port.id];
          const rep = faction ? (reputation[faction] ?? 0) : 0;
          const repColor = rep >= 60 ? 'text-amber-300'
            : rep >= 25 ? 'text-emerald-300/90'
            : rep <= -60 ? 'text-red-400'
            : rep <= -25 ? 'text-orange-400/90'
            : 'text-slate-400/80';
          return (
            <motion.button
              key="port-marker"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.3 }}
              onClick={() => { sfxOpen(); setShowWorldMap(true); }}
              onMouseEnter={() => sfxHover()}
              className="group absolute top-5 left-1/2 -translate-x-1/2 pointer-events-auto
                flex flex-col items-center gap-[7px]
                transition-opacity duration-300"
              title={`${port.name} — open world map`}
            >
              {/* Port name flanked by hairlines — period sea-chart cartouche */}
              <span className="flex items-center gap-3">
                <span
                  className="h-px w-12 bg-gradient-to-r from-transparent to-slate-300/35
                    group-hover:to-amber-300/55 transition-colors duration-300"
                  aria-hidden
                />
                <span
                  className="text-slate-50 group-hover:text-amber-50 transition-colors duration-200"
                  style={{
                    fontFamily: '"Fraunces", serif',
                    fontSize: 18,
                    fontWeight: 400,
                    letterSpacing: '0.26em',
                    textTransform: 'uppercase',
                    fontVariationSettings: '"opsz" 48',
                    textShadow:
                      '0 1px 2px rgba(0,0,0,0.9), 0 0 10px rgba(0,0,0,0.75), 0 0 24px rgba(0,0,0,0.45)',
                    paddingLeft: '0.26em', // optically center the letter-spaced word
                  }}
                >
                  {port.name}
                </span>
                <span
                  className="h-px w-12 bg-gradient-to-l from-transparent to-slate-300/35
                    group-hover:to-amber-300/55 transition-colors duration-300"
                  aria-hidden
                />
              </span>
              {/* Meta line — faction · reputation */}
              <span
                className="flex items-center gap-2 text-[10px] uppercase leading-none"
                style={{
                  fontFamily: '"DM Sans", sans-serif',
                  fontWeight: 600,
                  letterSpacing: '0.14em',
                  textShadow: '0 1px 2px rgba(0,0,0,0.85), 0 0 8px rgba(0,0,0,0.55)',
                }}
              >
                {faction && (
                  <>
                    <span className="text-amber-200/80 group-hover:text-amber-200 transition-colors duration-200">
                      {faction}
                    </span>
                    <span className="text-slate-500/70" aria-hidden>·</span>
                    <span className={`${repColor} tabular-nums normal-case tracking-normal`}>
                      {rep >= 0 ? '+' : ''}{rep}
                      <span className="ml-1 text-slate-400/80 uppercase tracking-[0.14em]">reputation</span>
                    </span>
                  </>
                )}
              </span>
            </motion.button>
          );
        })()}
      </AnimatePresence>

      {/* Combat Mode Banner */}
      <AnimatePresence>
        {combatMode && playerMode === 'ship' && (
          <CombatModeBanner />
        )}
      </AnimatePresence>

      {/* Hunting Mode Banner — land equivalent of CombatModeBanner */}
      <AnimatePresence>
        {combatMode && playerMode === 'walking' && (
          <HuntingModeBanner />
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

      {/* Anchor — bottom-center prompt (matches E to Embark style).
          On mobile, the bubble itself is tappable and dispatches the SPACE
          handler that lives in GameScene.tsx — keeps a single source of truth. */}
      <AnimatePresence>
        {anchored && playerMode === 'ship' && !combatMode && !activePort && !showLocalMap && !showWorldMap && !showDashboard && (
          <PromptBubble
            key="anchor-prompt"
            tone="cyan"
            isMobile={isMobile}
            onTap={() => dispatchPromptKey(' ')}
          >
            {isMobile ? 'Tap to weigh anchor' : 'Press SPACE BAR to weigh anchor'}
          </PromptBubble>
        )}
      </AnimatePresence>

      {/* Interaction Prompt (Press E to Embark/Disembark, Press T to Hail). */}
      <AnimatePresence>
        {interactionPrompt && !activePort && !showLocalMap && !showWorldMap && !startupOverlayActive && !showDashboard && (
          <PromptBubble
            key="interact-prompt"
            tone={interactionPrompt.includes('too steep') ? 'red' : 'amber'}
            isMobile={isMobile}
            onTap={() => dispatchPromptKey(keyFromPrompt(interactionPrompt))}
          >
            {isMobile ? mobilePromptLabel(interactionPrompt) : interactionPrompt}
          </PromptBubble>
        )}
      </AnimatePresence>

      {/* Port Trading Modal */}
      {!startupOverlayActive && activePort && (
        <Suspense fallback={null}>
          <PortModal onDismiss={() => {
            openedFromToastPortRef.current = null;
            if (activePort) dismissedPortRef.current = activePort.id;
            setActivePort(null);
          }} />
        </Suspense>
      )}

      {/* Ship Dashboard Modal */}
      <AnimatePresence>
        {showDashboard && (
          <Suspense fallback={null}>
            <ASCIIDashboard open={showDashboard} onClose={() => setDashboardState(null)} initialTab={dashboardState?.tab} initialCrewId={dashboardState?.crewId} initialCommodity={dashboardState?.commodity} />
          </Suspense>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {hailNpc && (
          <HailPanel
            npc={hailNpc}
            onClose={() => {
              sfxClose();
              closeHail();
            }}
          />
        )}
      </AnimatePresence>

      {/* Notifications — three tiered stacks, each right-aligned */}
      {(() => {
        const portNotes   = notifications.filter(n => n.tier === 'port');
        const eventNotes  = notifications.filter(n => n.tier === 'event');
        const tickerNotes = notifications.filter(n => n.tier === 'ticker');

        const renderToast = (n: typeof notifications[number]) => (
          <ASCIIToast
            key={n.id}
            notification={n}
            onDismiss={() => removeNotification(n.id)}
            onClick={n.openPortId ? () => {
              const port = useGameStore.getState().ports.find(p => p.id === n.openPortId);
              if (port) {
                openedFromToastPortRef.current = port.id;
                dismissedPortRef.current = null;
                setActivePort(port);
              }
              removeNotification(n.id);
            } : undefined}
          />
        );

        return (
          <div className="absolute bottom-20 right-4 flex flex-col gap-3 items-end pointer-events-none">
            {/* Port tier (top) — max 1 */}
            <div className="flex flex-col gap-2 items-end">
              <AnimatePresence>{portNotes.map(renderToast)}</AnimatePresence>
            </div>
            {/* Event tier (middle) — max 2 */}
            <div className="flex flex-col gap-2 items-end">
              <AnimatePresence>{eventNotes.map(renderToast)}</AnimatePresence>
            </div>
            {/* Ticker tier (bottom) — max 3 */}
            <div className="flex flex-col gap-1 items-end">
              <AnimatePresence>{tickerNotes.map(renderToast)}</AnimatePresence>
            </div>
          </div>
        );
      })()}

      {showDevPanel && !showInstructions && <RenderTestPanel />}

      {/* Fullscreen Map Overlay */}
      <AnimatePresence>
        {showLocalMap && (
          <Suspense fallback={null}>
            <WorldMap onClose={() => setShowLocalMap(false)} />
          </Suspense>
        )}
        {showWorldMap && (
          <Suspense fallback={null}>
            {useWorldMapChart ? (
              <WorldMapModalChart
                onClose={() => setShowWorldMap(false)}
                onArrival={handleArrival}
              />
            ) : (
              <WorldMapModal
                onClose={() => setShowWorldMap(false)}
                onArrival={handleArrival}
              />
            )}
          </Suspense>
        )}
      </AnimatePresence>

      {/* Arrival curtain — masks the world-map → port swap after a voyage */}
      <ArrivalCurtain portName={arrivalCurtainPort} />

      {/* Journal Panel (compact, above button) */}
      {showJournal && (
        <Suspense fallback={null}>
          <JournalPanel open={showJournal} onClose={() => setShowJournal(false)} />
        </Suspense>
      )}

      {/* Journal Button — desktop: lower-left. Mobile version is rendered
          inside the top-right cluster to avoid colliding with the action bar. */}
      {!isMobile && (
        <div className="absolute bottom-4 left-4 pointer-events-auto">
          <button
            onClick={() => { sfxClick(); setShowJournal(!showJournal); }}
            aria-pressed={showJournal}
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
      )}

      {/* Bottom Action Bar — Sunless Sea style.
          Desktop: 7 buttons in one row.
          Mobile: 4 buttons [Pause][Navigate][Dashboard][⋯] with the remaining
          five (Learn/Help/Settings/View/Quests) tucked into the overflow popover. */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 pointer-events-auto">
        {/* Mobile overflow popover — opens above the action bar */}
        <AnimatePresence>
          {isMobile && showOverflowMenu && (
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.95 }}
              transition={{ duration: 0.18 }}
              className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-[#0a0e18]/80 backdrop-blur-xl border border-[#2a2d3a]/60 rounded-xl px-3 py-2 shadow-[0_8px_24px_rgba(0,0,0,0.5)]"
            >
              <div className="flex items-center gap-3">
                <ActionBarButton icon={<GraduationCap size={13} />} label="Learn" accentColor="#60a5fa" glowColor="96,165,250" onClick={() => setShowOverflowMenu(false)} />
                <ActionBarButton icon={<HelpCircle size={13} />} label="Help" accentColor="#a78bfa" glowColor="167,139,250" onClick={() => setShowOverflowMenu(false)} />
                <ActionBarButton icon={<Settings size={13} />} label="Settings" accentColor="#9ca3af" glowColor="156,163,175" onClick={() => { sfxOpen(); setShowSettings(true); setShowOverflowMenu(false); }} />
                <ViewModeButton />
                <ActionBarButton icon={<Scroll size={13} />} label="Quests" accentColor="#fbbf24" glowColor="251,191,36" onClick={() => setShowOverflowMenu(false)} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Semi-transparent rectangular landing pad */}
        <div className={`relative bg-[#0a0e18]/50 backdrop-blur-md border border-[#2a2d3a]/40 rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.4)] ${isMobile ? 'px-3 py-2' : 'px-4 py-2.5'}`}>
          {/* Horizontal connecting rail */}
          <div className="absolute top-1/2 left-5 right-5 h-[2px] -translate-y-1/2 bg-gradient-to-r from-[#2a2520]/30 via-[#3a3530]/50 to-[#2a2520]/30 rounded-full" />
          <div className={`relative flex items-center ${isMobile ? 'gap-2' : 'gap-3'}`}>
            {!isMobile && (
              <>
                {/* Left group: Learn - Help - Settings */}
                <ActionBarButton icon={<GraduationCap size={13} />} label="Learn" hotkey="1" accentColor="#60a5fa" glowColor="96,165,250" />
                <ActionBarButton icon={<HelpCircle size={13} />} label="Help" hotkey="2" accentColor="#a78bfa" glowColor="167,139,250" />
                <ActionBarButton icon={<Settings size={13} />} label="Settings" hotkey="3" accentColor="#9ca3af" glowColor="156,163,175" onClick={() => { sfxOpen(); setShowSettings(true); }} />
              </>
            )}
            {/* Center — pause/play, bigger */}
            <button
              onClick={() => { sfxClick(); setPaused(!paused); }}
              aria-pressed={paused}
              className={`group relative w-11 h-11 rounded-full flex items-center justify-center transition-all duration-200 active:scale-95
                ${paused
                  ? 'bg-[#1a1e2e] border-2 border-amber-600/70 text-amber-400 shadow-[inset_0_2px_5px_rgba(0,0,0,0.5),inset_0_-1px_2px_rgba(255,255,255,0.08),0_0_14px_rgba(217,169,56,0.3)] hover:border-amber-500/90 hover:shadow-[inset_0_2px_5px_rgba(0,0,0,0.5),inset_0_-1px_2px_rgba(255,255,255,0.1),0_0_20px_rgba(217,169,56,0.45)]'
                  : 'bg-[#1a1e2e] border-2 border-[#5a5540]/70 text-[#9a9070] shadow-[inset_0_2px_5px_rgba(0,0,0,0.5),inset_0_-1px_2px_rgba(255,255,255,0.06),0_2px_8px_rgba(0,0,0,0.5)] hover:text-amber-300 hover:border-amber-700/60 hover:shadow-[inset_0_2px_5px_rgba(0,0,0,0.4),inset_0_-1px_3px_rgba(255,255,255,0.1),0_0_18px_rgba(217,169,56,0.35)]'
                }`}
              title={paused ? 'Resume [4]' : 'Pause [4]'}
            >
              {paused ? <Play size={16} /> : <Pause size={16} />}
              <span className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-[#0b1120] border border-slate-700/50 rounded text-[9px] tracking-[0.12em] uppercase text-slate-400 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                {paused ? 'Resume' : 'Pause'}<span className="ml-1 text-slate-500">[4]</span>
              </span>
            </button>
            {!isMobile && (
              <>
                {/* Right group: View - Quests - Navigate */}
                <ViewModeButton />
                <ActionBarButton icon={<Scroll size={13} />} label="Quests" hotkey="6" accentColor="#fbbf24" glowColor="251,191,36" />
                <ActionBarButton icon={<Compass size={13} />} label="Navigate" hotkey="7" accentColor="#f87171" glowColor="248,113,113" onClick={toggleWorldMap} />
              </>
            )}
            {isMobile && (
              <>
                <ActionBarButton icon={<Compass size={13} />} label="Navigate" accentColor="#f87171" glowColor="248,113,113" onClick={toggleWorldMap} />
                <ActionBarButton icon={<Users size={13} />} label="Dashboard" accentColor="#fbbf24" glowColor="251,191,36" onClick={() => { sfxOpen(); setDashboardState({}); }} />
                <ActionBarButton icon={<MoreHorizontal size={13} />} label="More" accentColor="#9ca3af" glowColor="156,163,175" onClick={() => setShowOverflowMenu(v => !v)} />
              </>
            )}
          </div>
        </div>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <Suspense fallback={null}>
          <SettingsModal open={showSettings} onClose={() => setShowSettings(false)} />
        </Suspense>
      )}

      {/* Instructions Overlay */}
      <AnimatePresence>
        {showInstructions && (
          <Opening
            ready={splashComplete}
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
          <EventModalMobile onDismiss={closeCommission} worldReady={worldReady} />
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
          label="Algae"
          enabled={renderDebug.algae}
          onToggle={() => updateRenderDebug({ algae: !renderDebug.algae })}
        />
        <RenderToggleRow
          label="Wildlife Motion"
          enabled={renderDebug.wildlifeMotion}
          onToggle={() => updateRenderDebug({ wildlifeMotion: !renderDebug.wildlifeMotion })}
        />
        <RenderToggleRow
          label="City Fields"
          enabled={renderDebug.cityFieldOverlay}
          onToggle={() => updateRenderDebug({ cityFieldOverlay: !renderDebug.cityFieldOverlay })}
        />
      </div>

      <div className="mt-4 rounded-xl border border-white/[0.07] bg-white/[0.03] p-3">
        <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">City Field Mode</div>
        <div className="mt-1 text-[11px] text-slate-400">
          {renderDebug.cityFieldMode === 'district'
            ? 'Classified districts: citadel, sacred, urban core, elite residential, artisan, waterside, fringe.'
            : CITY_FIELD_DESCRIPTIONS[renderDebug.cityFieldMode]}
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <button
            key="district"
            onClick={() => updateRenderDebug({ cityFieldMode: 'district', cityFieldOverlay: true })}
            className={`rounded-md border px-2 py-1 text-[10px] font-medium transition-all ${
              renderDebug.cityFieldMode === 'district'
                ? 'border-amber-600/30 bg-amber-600/18 text-amber-300'
                : 'border-white/[0.08] bg-white/[0.03] text-slate-400 hover:bg-white/[0.06] hover:text-slate-200'
            }`}
          >
            District
          </button>
          {CITY_FIELD_KEYS.map((field) => (
            <button
              key={field}
              onClick={() => updateRenderDebug({ cityFieldMode: field, cityFieldOverlay: true })}
              className={`rounded-md border px-2 py-1 text-[10px] font-medium transition-all ${
                renderDebug.cityFieldMode === field
                  ? 'border-amber-600/30 bg-amber-600/18 text-amber-300'
                  : 'border-white/[0.08] bg-white/[0.03] text-slate-400 hover:bg-white/[0.06] hover:text-slate-200'
              }`}
            >
              {CITY_FIELD_LABELS[field]}
            </button>
          ))}
        </div>
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
      aria-pressed={enabled}
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

function OverlayMenuRow({
  label,
  description,
  active,
  onClick,
}: {
  label: string;
  description: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-start justify-between gap-3 rounded-xl border px-3 py-2 text-left transition-all ${
        active
          ? 'border-sky-500/30 bg-sky-500/12'
          : 'border-white/[0.07] bg-white/[0.03] hover:bg-white/[0.05]'
      }`}
    >
      <div>
        <div className={`text-[12px] font-medium ${active ? 'text-sky-200' : 'text-slate-200'}`}>{label}</div>
        <div className="mt-1 text-[10px] leading-snug text-slate-500">{description}</div>
      </div>
      <span
        className={`mt-0.5 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.16em] ${
          active
            ? 'bg-sky-500/18 text-sky-200'
            : 'bg-white/[0.04] text-slate-500'
        }`}
      >
        {active ? 'On' : 'Off'}
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
      aria-pressed={viewMode !== 'default'}
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
      title={`View: ${VIEW_MODE_LABELS[viewMode]} [5]`}
    >
      <Eye size={13} />
      <span className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-[#0b1120] border border-slate-700/50 rounded text-[9px] tracking-[0.12em] uppercase text-slate-400 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
        {VIEW_MODE_LABELS[viewMode]}<span className="ml-1 text-slate-500">[5]</span>
      </span>
    </button>
  );
}

function ActionBarButton({ icon, label, hotkey, accentColor = '#b0a880', glowColor = '176,168,128', onClick }: { icon: React.ReactNode; label: string; hotkey?: string; accentColor?: string; glowColor?: string; onClick?: () => void }) {
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
      title={hotkey ? `${label} [${hotkey}]` : label}
    >
      {icon}
      {/* Tooltip */}
      <span className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-[#0b1120] border border-slate-700/50 rounded text-[9px] tracking-[0.12em] uppercase text-slate-400 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
        {label}{hotkey && <span className="ml-1 text-slate-500">[{hotkey}]</span>}
      </span>
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Slide-down stat detail panels
// ═══════════════════════════════════════════════════════════════════════════

const SHIP_TYPE_INFO: Record<string, { crew: number; speed: string; desc: string }> = {
  Carrack:  { crew: 8,  speed: 'Medium',  desc: 'Sturdy trading vessel, good cargo capacity' },
  Galleon:  { crew: 12, speed: 'Slow',    desc: 'Heavy warship, massive hold and gun decks' },
  Dhow:     { crew: 4,  speed: 'Fast',    desc: 'Lateen-rigged coaster, nimble in shallow waters' },
  Junk:     { crew: 6,  speed: 'Medium',  desc: 'Chinese deep-sea trader, balanced and reliable' },
  Pinnace:  { crew: 4,  speed: 'Fast',    desc: 'Small, swift scout vessel, limited cargo' },
  Fluyt:    { crew: 6,  speed: 'Medium',  desc: 'Dutch bulk merchantman, outsize hold for a small crew' },
  Caravel:  { crew: 5,  speed: 'Fast',    desc: 'Lateen-rigged trader, agile in coastal waters' },
  Baghla:   { crew: 8,  speed: 'Medium',  desc: 'Ocean-going dhow, heavy build, carved transom' },
  Jong:     { crew: 12, speed: 'Slow',    desc: 'Javanese deep-sea trader, three-masted with mixed rigging' },
};

function HullDetailPanel({ stats, ship, onOpenDashboard }: { stats: ShipStats; ship: ShipInfo; onOpenDashboard: () => void }) {
  const hullPct = Math.round((stats.hull / stats.maxHull) * 100);
  const sailPct = Math.round((stats.sails / stats.maxSails) * 100);
  const typeInfo = SHIP_TYPE_INFO[ship.type] ?? { crew: 6, speed: 'Medium', desc: '' };

  const conditionLabel = (pct: number) =>
    pct >= 90 ? 'Excellent' : pct >= 70 ? 'Good' : pct >= 50 ? 'Fair' : pct >= 25 ? 'Poor' : 'Critical';
  const conditionColor = (pct: number) =>
    pct >= 70 ? '#34d399' : pct >= 40 ? '#fbbf24' : '#f87171';

  const armamentSummary = stats.armament.reduce<Record<string, number>>((acc, w) => {
    const name = WEAPON_DEFS[w].name;
    acc[name] = (acc[name] || 0) + 1;
    return acc;
  }, {});

  return (
    <div
      className="px-4 py-3 cursor-pointer hover:bg-white/[0.02] transition-colors duration-200"
      style={{ fontFamily: '"DM Sans", sans-serif' }}
      onClick={() => { sfxOpen(); onOpenDashboard(); }}
    >
      {/* Ship type header */}
      <div className="flex items-center justify-between mb-2.5">
        <div>
          <span className="text-[10px] font-bold tracking-[0.12em] uppercase" style={{ color: '#22d3ee90' }}>Ship Condition</span>
          <div className="text-[13px] font-semibold text-slate-200 mt-0.5">{ship.type} <span className="text-slate-500 font-normal">— {typeInfo.desc}</span></div>
        </div>
        <span className="text-[9px] text-slate-600 tracking-wider uppercase">Details →</span>
      </div>

      <div className="flex gap-4">
        {/* Left: ship specs */}
        <div className="flex-1 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-slate-500">Cargo capacity</span>
            <span className="text-[11px] font-mono text-slate-300">{stats.cargoCapacity}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-slate-500">Crew berths</span>
            <span className="text-[11px] font-mono text-slate-300">{typeInfo.crew}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-slate-500">Speed</span>
            <span className="text-[11px] font-mono text-slate-300">{typeInfo.speed}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-slate-500">Armament</span>
            <span className="text-[11px] font-mono text-slate-300">{Object.entries(armamentSummary).map(([n, c]) => `${c}× ${n}`).join(', ')}</span>
          </div>
        </div>

        {/* Right: condition */}
        <div className="flex-1 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-slate-500">Hull</span>
            <span className="text-[11px] font-mono" style={{ color: conditionColor(hullPct) }}>{conditionLabel(hullPct)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-slate-500">Sails</span>
            <span className="text-[11px] font-mono" style={{ color: conditionColor(sailPct) }}>{conditionLabel(sailPct)}</span>
          </div>
          {hullPct < 100 && (
            <div className="mt-1.5 text-[10px] italic text-slate-500" style={{ fontFamily: '"Fraunces", serif' }}>
              {hullPct < 30 ? 'Taking on water — seek repairs urgently'
                : hullPct < 60 ? 'Hull showing battle scars — repairs advised'
                : 'Minor wear, seaworthy'}
            </div>
          )}
          {hullPct < 100 && (
            <div className="text-[10px] text-cyan-400/60 mt-0.5">
              Repair est. ~{Math.ceil((stats.maxHull - stats.hull) * 1.5)} gold
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MoraleDetailPanel({ crew, onSelectCrew }: { crew: CrewMember[]; onSelectCrew: (crewId: string) => void }) {
  const sorted = [...crew].sort((a, b) => {
    if (a.role === 'Captain') return -1;
    if (b.role === 'Captain') return 1;
    return b.morale - a.morale;
  });
  const lowest = sorted.length > 1 ? sorted[sorted.length - 1] : null;
  const avg = crew.length > 0 ? Math.round(crew.reduce((s, c) => s + c.morale, 0) / crew.length) : 0;

  const healthIcon = (h: string) =>
    h === 'healthy' ? '♥' : h === 'sick' ? '♥' : h === 'injured' ? '♥' : h === 'scurvy' ? '♥' : '♥';
  const healthColor = (h: string) =>
    h === 'healthy' ? '#34d399' : h === 'sick' ? '#fbbf24' : h === 'injured' ? '#f87171' : h === 'scurvy' ? '#a78bfa' : '#f97316';

  const ROLE_COLORS: Record<string, string> = {
    Captain: 'text-amber-400 border-amber-400/30 bg-amber-400/10',
    Navigator: 'text-cyan-400 border-cyan-400/30 bg-cyan-400/10',
    Gunner: 'text-red-400 border-red-400/30 bg-red-400/10',
    Sailor: 'text-slate-400 border-slate-500/30 bg-slate-400/10',
    Factor: 'text-emerald-400 border-emerald-400/30 bg-emerald-400/10',
    Surgeon: 'text-pink-400 border-pink-400/30 bg-pink-400/10',
  };

  return (
    <div className="px-4 py-3" style={{ fontFamily: '"DM Sans", sans-serif' }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold tracking-[0.12em] uppercase" style={{ color: '#34d39990' }}>Crew Roster</span>
        <span className="text-[10px] text-slate-500">{crew.length} aboard</span>
      </div>

      <div className="space-y-0">
        {sorted.map((member) => {
          const moralePct = Math.min(100, Math.round(member.morale));
          const moraleColor = moralePct >= 60 ? '#34d399' : moralePct >= 30 ? '#fbbf24' : '#f87171';
          return (
            <div
              key={member.id}
              className="flex items-center gap-2.5 py-[5px] border-b border-white/[0.04] last:border-b-0
                cursor-pointer rounded-sm hover:bg-white/[0.04] transition-colors duration-150 px-1 -mx-1"
              onClick={() => { sfxOpen(); onSelectCrew(member.id); }}
              onMouseEnter={() => sfxHover()}
            >
              {/* Portrait */}
              <div className="w-[22px] h-[22px] rounded-full overflow-hidden shrink-0 bg-[#1a1e2e]">
                <CrewPortraitSquare member={member} size={22} />
              </div>
              {/* Name + role */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-slate-300 truncate">{member.name}</span>
                  <span className={`text-[8px] font-bold tracking-[0.08em] uppercase px-1.5 py-0.5 rounded-full border ${ROLE_COLORS[member.role] ?? ROLE_COLORS.Sailor}`}>
                    {member.role}
                  </span>
                </div>
              </div>
              {/* Morale bar */}
              <div className="w-[60px] shrink-0">
                <div className="h-[3px] w-full bg-white/[0.06] rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-500" style={{ width: `${moralePct}%`, backgroundColor: moraleColor }} />
                </div>
              </div>
              <span className="text-[10px] font-mono w-[24px] text-right shrink-0" style={{ color: moraleColor }}>{moralePct}</span>
              {/* Health */}
              <span className="text-[10px] shrink-0" style={{ color: healthColor(member.health) }} title={member.health}>
                {healthIcon(member.health)}
              </span>
            </div>
          );
        })}
      </div>

      {lowest && lowest.morale < 50 && (
        <div className="mt-2 text-[10px] italic text-slate-500" style={{ fontFamily: '"Fraunces", serif' }}>
          Lowest: {lowest.name} ({lowest.morale} — {lowest.health !== 'healthy' ? lowest.health : 'discontented'})
        </div>
      )}
    </div>
  );
}

function CargoDetailPanel({ cargo, capacity, onOpenDashboard, onSelectCommodity }: { cargo: Record<string, number>; capacity: number; onOpenDashboard: () => void; onSelectCommodity: (commodity: string) => void }) {
  const entries = Object.entries(cargo).filter(([, qty]) => qty > 0).sort((a, b) => b[1] - a[1]);
  const totalUnits = entries.reduce((s, [, qty]) => s + qty, 0);
  const pct = capacity > 0 ? Math.min(100, Math.round((totalUnits / capacity) * 100)) : 0;

  const estimateValue = (commodity: string, qty: number) => {
    const def = COMMODITY_DEFS[commodity as Commodity];
    if (!def) return 0;
    return Math.round(((def.basePrice[0] + def.basePrice[1]) / 2) * qty);
  };

  const totalValue = entries.reduce((s, [c, q]) => s + estimateValue(c, q), 0);

  return (
    <div
      className="px-4 py-3 cursor-pointer hover:bg-white/[0.02] transition-colors duration-200"
      style={{ fontFamily: '"DM Sans", sans-serif' }}
      onClick={() => { sfxOpen(); onOpenDashboard(); }}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold tracking-[0.12em] uppercase" style={{ color: '#fbbf2490' }}>Ship&apos;s Hold</span>
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-slate-500">{totalUnits} / {capacity} units</span>
          <span className="text-[9px] text-slate-600 tracking-wider uppercase">Details →</span>
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="text-[11px] italic text-slate-600 py-2" style={{ fontFamily: '"Fraunces", serif' }}>
          The hold is empty.
        </div>
      ) : (
        <div className="space-y-0">
          {entries.map(([commodity, qty]) => {
            const def = COMMODITY_DEFS[commodity as Commodity];
            const est = estimateValue(commodity, qty);
            return (
              <div
                key={commodity}
                className="group flex items-center gap-2 py-[7px] border-b border-white/[0.04] last:border-b-0 cursor-pointer rounded-sm transition-colors hover:bg-white/[0.03]"
                onClick={(e) => { e.stopPropagation(); sfxClick(); onSelectCommodity(commodity); }}
              >
                {/* Icon image or fallback */}
                {def?.iconImage ? (
                  <span
                    className="w-[28px] h-[28px] rounded-md overflow-hidden shrink-0 border border-white/[0.06] bg-white/[0.025] flex items-center justify-center transition-all duration-200 group-hover:border-white/[0.18] group-hover:bg-white/[0.05] group-hover:scale-[1.35] group-hover:z-10 relative"
                    style={{ transformOrigin: 'center' }}
                  >
                    <img src={def.iconImage} alt="" className="w-[110%] h-[110%] object-cover transition-all duration-200 group-hover:drop-shadow-[0_0_6px_rgba(251,191,36,0.45)]" />
                  </span>
                ) : (
                  <span
                    className="w-[28px] h-[28px] rounded-md bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-[12px] shrink-0 transition-all duration-200 group-hover:border-white/[0.18] group-hover:scale-[1.35] group-hover:z-10 relative"
                    style={{ color: def?.color, transformOrigin: 'center' }}
                  >{def?.icon ?? '?'}</span>
                )}
                {/* Name */}
                <span className="text-[11px] text-slate-300 flex-1 min-w-0 truncate" style={{ fontFamily: '"Fraunces", serif' }}>{commodity}</span>
                {/* Qty */}
                <span className="text-[11px] font-mono text-slate-300 shrink-0 w-[36px] text-right">{qty}</span>
                {/* Est value */}
                <span className="text-[10px] text-amber-400/50 shrink-0 w-[50px] text-right">~{est}g</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Capacity bar + total */}
      {entries.length > 0 && (
        <div className="mt-2.5 flex items-center gap-3">
          <div className="flex-1 h-[4px] bg-white/[0.06] rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-500" style={{
              width: `${pct}%`,
              backgroundColor: pct > 90 ? '#f87171' : '#fbbf24',
              boxShadow: `0 0 6px ${pct > 90 ? '#f8717140' : '#fbbf2440'}`,
            }} />
          </div>
          <span className="text-[10px] font-mono text-slate-500">{pct}%</span>
          <span className="text-[10px] text-amber-400/60">~{totalValue.toLocaleString()}g total</span>
        </div>
      )}
    </div>
  );
}

function StatBar({ icon, label, value, max, color, active, onClick }: { icon: React.ReactNode; label: string; value: number; max: number; color: string; active?: boolean; onClick?: () => void }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  const low = pct < 30;
  const barColor = low ? statColors.danger : color;
  const downColor = label === 'Hull' ? '#f87171' : label === 'Morale' ? '#f59e0b' : '#38bdf8';
  const upColor = label === 'Hull' ? '#67e8f9' : label === 'Morale' ? '#c4b5fd' : '#fbbf24';

  return (
    <button
      onClick={() => { sfxClick(); onClick?.(); }}
      onMouseEnter={() => sfxHover()}
      className={`flex items-center gap-2.5 min-w-0 rounded-md px-1.5 py-1 -mx-1.5 -my-1 transition-all duration-200 ${
        active
          ? 'bg-white/[0.06]'
          : 'hover:bg-white/[0.04]'
      }`}
      style={active ? { boxShadow: `inset 2px 0 0 ${barColor}` } : undefined}
    >
      <div className="shrink-0" style={{ color: barColor }}>{icon}</div>
      <div className="flex flex-col gap-0.5 min-w-[92px]">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] font-bold tracking-[0.08em] uppercase text-slate-400" style={{ fontFamily: '"DM Sans", sans-serif' }}>
            {label}
            {active && <span className="ml-1 text-[8px] text-slate-600">▾</span>}
          </span>
          <span className="text-[11px] font-mono text-slate-400">
            <ValueFlash value={value} upColor={upColor} downColor={downColor}>
              {value}
            </ValueFlash>
            <span className="text-slate-600">/{max}</span>
          </span>
        </div>
        <div className="h-[5px] w-full bg-white/[0.06] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${pct}%`,
              backgroundColor: barColor,
              boxShadow: `0 0 8px ${barColor}40`,
            }}
          />
        </div>
      </div>
    </button>
  );
}

type HailMood = 'HOSTILE' | 'COLD' | 'WARY' | 'CORDIAL' | 'WARM';
type HailAction = 'news' | 'trade' | 'bearing' | 'leave';

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function pickStable<T>(items: T[], key: string): T {
  return items[hashString(key) % items.length];
}

function getHailMood(rep: number): HailMood {
  if (rep <= -60) return 'HOSTILE';
  if (rep <= -25) return 'COLD';
  if (rep >= 60) return 'WARM';
  if (rep >= 25) return 'CORDIAL';
  return 'WARY';
}

function getHailMoodColor(mood: HailMood): string {
  if (mood === 'HOSTILE') return '#f87171';
  if (mood === 'COLD') return '#f59e0b';
  if (mood === 'CORDIAL') return '#86efac';
  if (mood === 'WARM') return '#34d399';
  return '#cbd5e1';
}

function getHailGreeting(npc: NPCShipIdentity, mood: HailMood): string {
  const name = npc.captainName.split(' ')[0] || npc.captainName;
  const lines: Record<HailMood, string[]> = {
    HOSTILE: [
      `"Keep off. One more cable and we fire."`,
      `"We know your flag. Hold your course away from us."`,
      `"No talk. No trade. Stand clear."`,
    ],
    COLD: [
      `"State your business and keep your guns quiet."`,
      `"We will answer once. Make it useful."`,
      `"Speak plainly. We have no wish to linger."`,
    ],
    WARY: [
      `"Fair water. What do you need?"`,
      `"We hear you. Keep a respectful distance."`,
      `"Captain ${name} answers. Be quick about it."`,
    ],
    CORDIAL: [
      `"Fair winds. We have news if you need it."`,
      `"Good sailing to you. What word do you seek?"`,
      `"Come no closer, friend, but speak freely."`,
    ],
    WARM: [
      `"Well met. We will help where we can."`,
      `"A welcome sail. Ask what you need."`,
      `"Good fortune to you. Our deck has news and spare stores."`,
    ],
  };
  return pickStable(lines[mood], npc.id + mood);
}

function bearingFromTo(from: [number, number, number], to: [number, number, number]): string {
  const dx = to[0] - from[0];
  const dz = to[2] - from[2];
  const angle = (Math.atan2(dx, dz) + Math.PI * 2) % (Math.PI * 2);
  const points = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
  return points[Math.round(angle / (Math.PI / 4)) % points.length];
}

const UNTRANSLATED_HAIL: Record<Language, string> = {
  Arabic: 'لا أفهمك. سأمضي في طريقي.',
  Persian: 'سخنت را نمی‌فهمم. راه خود را می‌روم.',
  Gujarati: 'હું તમને સમજતો નથી. હું મારા રસ્તે જાઉં છું.',
  Hindustani: 'मैं तुम्हारी बात नहीं समझता। मैं अपने रास्ते जाऊँगा।',
  Portuguese: 'Não vos entendo. Sigo o meu caminho.',
  Dutch: 'Ik versta u niet. Ik vaar verder.',
  English: "I cannot understand you. I'll be on my way.",
  Spanish: 'No os entiendo. Seguiré mi rumbo.',
  French: 'Je ne vous comprends pas. Je poursuis ma route.',
  Turkish: 'Sizi anlamıyorum. Yoluma devam edeceğim.',
  Malay: 'Aku tidak faham. Aku akan meneruskan pelayaran.',
  Swahili: 'Sikuelewi. Nitaendelea na safari yangu.',
  Chinese: '我听不懂你。我继续走我的航路。',
  Japanese: '何を言っているかわからぬ。このまま進む。',
};

function getCrewLanguages(member: CrewMember): Language[] {
  return member.languages ?? [];
}

function pickTranslator(crew: CrewMember[], language: Language): CrewMember | null {
  const roleRank: Record<string, number> = {
    Factor: 5,
    Navigator: 4,
    Captain: 3,
    Surgeon: 2,
    Sailor: 1,
    Gunner: 1,
  };
  return crew
    .filter((member) => getCrewLanguages(member).includes(language))
    .sort((a, b) =>
      (roleRank[b.role] ?? 0) - (roleRank[a.role] ?? 0) ||
      b.stats.charisma - a.stats.charisma ||
      b.skill - a.skill
    )[0] ?? null;
}

function HailPanel({ npc, onClose }: { npc: NPCShipIdentity; onClose: () => void }) {
  const rep = useGameStore((state) => state.getReputation(npc.flag));
  const gold = useGameStore((state) => state.gold);
  const crew = useGameStore((state) => state.crew);
  const hailLanguage = npc.hailLanguage ?? 'Portuguese';
  const translator = useMemo(() => pickTranslator(crew, hailLanguage), [crew, hailLanguage]);
  const canUnderstand = Boolean(translator);
  const mood = getHailMood(rep);
  const moodColor = getHailMoodColor(mood);
  const greeting = useMemo(() => getHailGreeting(npc, mood), [npc, mood]);
  const tradeOffer = useMemo(() => {
    const seed = hashString(npc.id + npc.shipName);
    const amount = 4 + (seed % 5);
    const cost = amount * (mood === 'WARM' ? 2 : mood === 'CORDIAL' ? 3 : 4);
    return { amount, cost };
  }, [npc.id, npc.shipName, mood]);
  const [used, setUsed] = useState<Record<string, boolean>>({});
  const [result, setResult] = useState<{ tone: 'good' | 'warn' | 'neutral'; text: string; impact?: string } | null>(null);
  const awardedTranslationRef = useRef(false);

  useEffect(() => {
    if (!translator || awardedTranslationRef.current) return;
    awardedTranslationRef.current = true;
    useGameStore.getState().adjustReputation(npc.flag, 1);
    useGameStore.setState((state) => ({
      crew: state.crew.map((member) => member.id === translator.id
        ? {
            ...member,
            xp: member.xp + 1,
            history: [
              ...member.history,
              { day: state.dayCount, event: `Translated ${hailLanguage} during a hail with a ${npc.flag} ${npc.shipType}` },
            ],
          }
        : member
      ),
    }));
  }, [hailLanguage, npc.flag, npc.shipType, translator]);

  const canTrade = canUnderstand && mood !== 'HOSTILE' && mood !== 'COLD';
  const availableActions = useMemo(() => [
    canUnderstand && !used.news ? { id: 'news' as HailAction, label: 'News' } : null,
    canTrade && !used.trade ? { id: 'trade' as HailAction, label: 'Trade' } : null,
    canUnderstand && !used.bearing ? { id: 'bearing' as HailAction, label: 'Bearing' } : null,
  ].filter(Boolean) as { id: HailAction; label: string }[], [canTrade, canUnderstand, used]);

  const resolveAction = useCallback((action: HailAction) => {
    sfxClick();
    const state = useGameStore.getState();

    if (action === 'leave') {
      onClose();
      return;
    }

    if (!canUnderstand) return;

    if (action === 'news') {
      const news = pickStable([
        `${npc.flag} captains report patrols searching holds near the next busy anchorage.`,
        `A damaged trader was seen drifting downwind before dawn. Gulls marked the water behind her.`,
        `Fresh water is dear along this coast. Captains are paying hard coin for sound casks.`,
        `Two armed sails were seen shadowing merchantmen beyond the headland.`,
        `The monsoon has been holding steady. Fast passages favor captains who trim their canvas cleanly.`,
      ], npc.id + state.dayCount + 'news');
      state.addJournalEntry('encounter', `Hailed the ${npc.shipName}: ${news}`);
      setUsed((prev) => ({ ...prev, news: true }));
      setResult({ tone: 'good', text: `"${news}"`, impact: '+ journal updated' });
      return;
    }

    if (action === 'bearing') {
      const shipPos = getLiveShipTransform().pos;
      const byDistance = (a: Port, b: Port) => {
        const adx = a.position[0] - shipPos[0];
        const adz = a.position[2] - shipPos[2];
        const bdx = b.position[0] - shipPos[0];
        const bdz = b.position[2] - shipPos[2];
        return adx * adx + adz * adz - (bdx * bdx + bdz * bdz);
      };
      const target = state.ports
        .filter((port) => !state.discoveredPorts.includes(port.id))
        .sort(byDistance)[0] ?? state.ports
        .filter((port) => port.id !== state.currentWorldPortId)
        .sort(byDistance)[0];

      if (!target) {
        setResult({ tone: 'neutral', text: `"No useful bearing. Only open water from here."` });
        return;
      }

      const bearing = bearingFromTo(shipPos, target.position);
      const line = `They mark ${target.name} ${bearing} by their reckoning.`;
      state.addJournalEntry('navigation', `Bearing from the ${npc.shipName}: ${target.name} lies ${bearing}.`, target.name);
      setUsed((prev) => ({ ...prev, bearing: true }));
      setResult({ tone: 'good', text: `"${line}"`, impact: '+ bearing noted' });
      return;
    }

    if (action === 'trade') {
      if (!canTrade) {
        setResult({ tone: 'warn', text: `"No trade. Keep clear."` });
        return;
      }
      if (gold < tradeOffer.cost) {
        setResult({ tone: 'warn', text: `"Dried fish and water, ${tradeOffer.cost} gold. You lack the coin."` });
        return;
      }

      useGameStore.setState((prev) => ({
        gold: prev.gold - tradeOffer.cost,
        provisions: prev.provisions + tradeOffer.amount,
      }));
      state.addJournalEntry('commerce', `Bought ${tradeOffer.amount} provisions from the ${npc.shipName} for ${tradeOffer.cost} gold.`);
      setUsed((prev) => ({ ...prev, trade: true }));
      setResult({
        tone: 'good',
        text: `"We can spare dried fish and water casks."`,
        impact: `+${tradeOffer.amount} provisions · -${tradeOffer.cost} gold`,
      });
    }
  }, [canTrade, canUnderstand, gold, npc, onClose, tradeOffer]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      const idx = Number(e.key) - 1;
      if (!Number.isInteger(idx) || idx < 0 || idx >= availableActions.length) return;
      e.preventDefault();
      resolveAction(availableActions[idx].id);
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [availableActions, onClose, resolveAction]);

  const resultColor = result?.tone === 'warn' ? '#f59e0b' : result?.tone === 'good' ? '#86efac' : '#cbd5e1';
  const displayText = canUnderstand
    ? (result ? result.text : greeting)
    : `"${UNTRANSLATED_HAIL[hailLanguage]}"`;

  return (
    <motion.div
      {...floatingPanelMotion}
      className="absolute bottom-24 left-1/2 z-40 w-[min(520px,calc(100vw-2rem))] -translate-x-1/2 pointer-events-auto"
    >
      <div className="bg-[#050812]/78 backdrop-blur-md border border-[#2a2d3a]/45 rounded-xl px-4 py-3 shadow-[0_10px_34px_rgba(0,0,0,0.45)]">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#8a8060]">
              HAIL // {npc.flag} {npc.shipType}{canUnderstand && <> // <span style={{ color: moodColor }}>{mood}</span></>}
            </div>
            <div className="mt-1 truncate text-sm font-semibold text-slate-100">
              {canUnderstand
                ? <>{npc.shipName} <span className="text-slate-500">·</span> <span className="text-slate-300">Capt. {npc.captainName}</span></>
                : <span className="text-slate-300">Unknown vessel</span>}
            </div>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-600">
            PAUSED
          </span>
        </div>

        <div className="my-3 h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />

        <div className="text-[13px] leading-relaxed text-slate-200">
          {displayText}
        </div>
        {canUnderstand && translator && !result && (
          <div className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-emerald-300/80">
            {translator.name} translates from {hailLanguage}. +1 xp
          </div>
        )}
        {!canUnderstand && (
          <div className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-amber-300/85">
            No one aboard understands {hailLanguage}.
          </div>
        )}
        {result?.impact && (
          <div className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.12em]" style={{ color: resultColor }}>
            {result.impact}
          </div>
        )}

        {availableActions.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
            {availableActions.map((action, index) => (
              <button
                key={action.id}
                onClick={() => resolveAction(action.id)}
                className="font-mono text-[11px] uppercase tracking-[0.12em] text-slate-400 hover:text-amber-300 transition-colors"
              >
                <span className="text-[#8a8060]">[{index + 1}]</span> {action.label}
                {action.id === 'trade' && <span className="text-slate-600"> {tradeOffer.cost}g</span>}
              </button>
            ))}
          </div>
        )}

        <div className="mt-4 flex justify-center">
          <button
            onClick={onClose}
            className="font-mono text-[11px] uppercase tracking-[0.16em] px-6 py-2 rounded border border-slate-600/50 text-slate-300 hover:text-amber-300 hover:border-amber-500/50 transition-colors bg-white/[0.04]"
          >
            Sail On <span className="text-slate-500 ml-1">[Esc]</span>
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function getTrimCueColor(grade: ReturnType<typeof getWindTrimInfo>['grade']): string {
  if (grade === 'full') return '#22c55e';
  if (grade === 'good') return '#86efac';
  if (grade === 'reach') return '#bbf7d0';
  return '#64748b';
}

function WindQuickMeter() {
  const windDirection = useGameStore((state) => state.windDirection);
  const windSpeed = useGameStore((state) => state.windSpeed);
  const playerRot = useGameStore((state) => state.playerRot);
  const windward = useGameStore((state) => state.stats.windward);
  const trimInfo = getWindTrimInfo(windDirection, playerRot, windward);
  const cueColor = getTrimCueColor(trimInfo.grade);
  const speedKnots = Math.round(windSpeed * 20);
  const hasShiftCue = trimInfo.score > 0;

  return (
    <div
      className="h-11 min-w-[42px] flex items-center justify-center"
      title="Wind direction, speed, and sail trim cue"
    >
      <span
        className="font-mono text-[11px] font-semibold tabular-nums transition-colors"
        style={{
          color: hasShiftCue ? cueColor : '#cbd5e1',
          textShadow: hasShiftCue ? `0 0 8px ${cueColor}55` : 'none',
        }}
      >
        {speedKnots} kn
      </span>
    </div>
  );
}

function WindPanel() {
  const windDirection = useGameStore((state) => state.windDirection);
  const windSpeed = useGameStore((state) => state.windSpeed);
  const playerRot = useGameStore((state) => state.playerRot);
  const playerVelocity = useGameStore((state) => state.playerVelocity);
  const windward = useGameStore((state) => state.stats.windward);
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
  const trimInfo = getWindTrimInfo(windDirection, playerRot, windward);
  const trimPotential = getWindTrimMultiplier(windSpeed, trimInfo.score, 1);
  const trimBonus = Math.round((trimPotential - 1) * 100);
  const trimColor = getTrimCueColor(trimInfo.grade);
  const trimHint = trimInfo.score > 0
    ? `Hold Shift: +${trimBonus}%`
    : 'Turn with wind';

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

      <div className="rounded-md border border-white/[0.07] bg-white/[0.03] px-2 py-1.5">
        <div className="flex items-center justify-between gap-3 text-[10px]">
          <span className="font-bold" style={{ color: trimColor }}>{trimInfo.label}</span>
          <span className="text-slate-400">{trimHint}</span>
        </div>
        <div className="mt-1.5 h-[4px] w-full bg-white/[0.06] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${Math.round(trimInfo.score * 100)}%`,
              backgroundColor: trimColor,
              boxShadow: `0 0 6px ${trimColor}40`,
            }}
          />
        </div>
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
