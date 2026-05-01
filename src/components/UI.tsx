import { lazy, Suspense, useEffect, useState, useCallback, useRef, useMemo, type ReactNode } from 'react';
import { useGameStore, Port, Building, WEAPON_DEFS, LAND_WEAPON_DEFS, PORT_FACTION } from '../store/gameStore';
import { getWorldPortById } from '../utils/worldPorts';
import type { CrewMember, ShipStats, ShipInfo } from '../store/gameStore';
import type { PlaceTab } from './PortModal';
import { COMMODITY_DEFS, type Commodity } from '../utils/commodities';
import type { NPCShipIdentity } from '../utils/npcShipGenerator';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  Coins, Anchor, Wind, Shield, Map as MapIcon, Users, Fish,
  Settings, Eye, Scroll, HelpCircle, BookOpen, Pause, Play, Compass, GraduationCap, ArrowRight, MoreHorizontal, Diamond, Crosshair, Swords, X
} from 'lucide-react';
import { useIsMobile } from '../utils/useIsMobile';
import { audioManager } from '../audio/AudioManager';
import { sfxClick, sfxHover, sfxOpen, sfxClose, sfxSail, sfxPortArrival, sfxShipHail, sfxBattleStations } from '../audio/SoundEffects';
import { Minimap } from './Minimap';
import { startTerrainPreRender } from '../utils/worldMapTerrainCache';
import { startIntroCinematic } from '../utils/cinematicIntroState';
import { ArrivalCurtain, DepartureCurtain } from './ArrivalCurtain';
import { FactionFlag } from './FactionFlag';
import { FACTIONS } from '../constants/factions';
import { CrewPortraitSquare } from './CrewPortrait';
import { VitalityHeart } from './VitalityHeart';
import { DevRestPreview } from './DevRestPreview';
import { PORT_LATITUDES, getMusicZone } from '../utils/portCoords';
import { HailPanel, type HailContext } from './HailPanel';
import { Opening } from './Opening';
import { ClaudeSplashGlobe } from './ClaudeSplashGlobe';
import { AudioMuteButton } from './AudioMuteButton';
import { EventModalMobile } from './EventModalMobile';
import { ASCIIToast } from './ASCIIToast';
import { QuestsPanel } from './QuestsPanel';
import { QuestToast } from './QuestToast';
import { ValueFlash } from './ValueFlash';
import { resolveWaterPaletteId } from '../utils/waterPalettes';
import { activeBowWeapon, bowWeaponReload, broadsideReload, getCurrentElevationCharge, landWeaponReload } from '../utils/combatState';
import {
  getLiveShipTransform,
  getLiveWalkingTransform,
} from '../utils/livePlayerTransform';
import { getWindTrimInfo, getWindTrimMultiplier } from '../utils/wind';
import { stat as statColors, shadow as shadowTokens } from '../theme/tokens';
import { CITY_FIELD_DESCRIPTIONS, CITY_FIELD_KEYS, CITY_FIELD_LABELS } from '../utils/cityFieldTypes';
import { LUT_PRESETS, LUT_NEUTRAL, type LUTParams, type LUTPresetId } from '../utils/proceduralLUT';
import { DISTRICT_LABELS } from '../utils/cityDistricts';
import { getTestModeConfig } from '../test/testMode';
import { getPOIById, type POIDefinition } from '../utils/poiDefinitions';
import { findNearestPOI } from '../utils/proximityResolution';
import { SEMANTIC_STYLE } from '../utils/semanticClasses';

const PortModal = lazy(() => import('./PortModal').then((module) => ({ default: module.PortModal })));
const POIModal = lazy(() => import('./POIModalV2').then((module) => ({ default: module.POIModalV2 })));
const CrewTroubleModal = lazy(() => import('./CrewTroubleModal').then((module) => ({ default: module.CrewTroubleModal })));
const BuildingDetailModal = lazy(() => import('./BuildingDetailModal').then((module) => ({ default: module.BuildingDetailModal })));
const ASCIIDashboard = lazy(() => import('./ASCIIDashboard').then((module) => ({ default: module.ASCIIDashboard })));
const LearnPanel = lazy(() => import('./LearnPanel').then((module) => ({ default: module.LearnPanel })));
const JournalPanel = lazy(() => import('./Journal').then((module) => ({ default: module.JournalPanel })));
const SettingsModal = lazy(() => import('./SettingsModal').then((module) => ({ default: module.SettingsModal })));
const SettingsModalV2 = lazy(() => import('./SettingsModalV2').then((module) => ({ default: module.SettingsModalV2 })));
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

// Splash variant: Claude is the default. Pass ?splash=legacy in the URL to
// fall back to the original Opening overlay for comparison/testing.
const SPLASH_VARIANT = typeof window !== 'undefined'
  ? (new URLSearchParams(window.location.search).get('splash') ?? 'claude')
  : 'claude';
const SEEN_NUDGES_KEY = 'spice-voyager-seen-nudges';

type NudgeId =
  | 'open-commissions'
  | 'hostile-fight'
  | 'broadside-elevation'
  | 'open-navigation'
  | 'open-dashboard'
  | 'open-journal';

function readSeenNudges(): Set<NudgeId> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(SEEN_NUDGES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function writeSeenNudges(seen: Set<NudgeId>) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(SEEN_NUDGES_KEY, JSON.stringify([...seen]));
}

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
  playerPos: [number, number, number],
  ports: Port[]
): Port | null {
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

function findBuildingAtPoint(
  pointX: number,
  pointZ: number,
  port: Port
): Building | null {
  for (const building of port.buildings) {
    if (building.type === 'dock') continue;
    const dx = pointX - building.position[0];
    const dz = pointZ - building.position[2];
    const cos = Math.cos(-building.rotation);
    const sin = Math.sin(-building.rotation);
    const localX = dx * cos - dz * sin;
    const localZ = dx * sin + dz * cos;
    const halfWidth = building.scale[0] * 0.5 + BUILDING_INTERACTION_PADDING;
    const halfDepth = building.scale[2] * 0.5 + BUILDING_INTERACTION_PADDING;
    if (Math.abs(localX) <= halfWidth && Math.abs(localZ) <= halfDepth) {
      return building;
    }
  }
  return null;
}

/**
 * Find the nearest POI to the player's walking position within the given
 * port's hand-authored set, using a circular radius around each POI's
 * resolved (x, z). Landmark-bound POIs resolve through their bound building.
 *
 * Returns null if no POI is in range, or if the port has no POIs authored.
 */
function findNearbyPortWalking(
  walkingPos: [number, number, number],
  ports: Port[]
): { port: Port; building: Building } | null {
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
  const building = findBuildingAtPoint(walkingPos[0], walkingPos[2], candidate);
  return building ? { port: candidate, building } : null;
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

const FAITH_ICON: Record<string, string> = {
  catholic: '✝', protestant: '✝',
  sunni: '☪', shia: '☪', ibadi: '☪',
  hindu: 'ॐ', buddhist: '☸', 'chinese-folk': '☸',
  jewish: '✡', animist: '◈',
};

function BuildingToast({
  building,
  isMobile,
  onEnter,
}: {
  building: Building;
  isMobile: boolean;
  onEnter: () => void;
}) {
  const hasSemanticEyebrow = !!building.labelEyebrow;
  // Fall back to district label for buildings without a semantic class (most dwellings)
  const displayEyebrow = building.labelEyebrow
    ?? (building.district ? DISTRICT_LABELS[building.district] : null);
  const tagColor = hasSemanticEyebrow ? (building.labelEyebrowColor ?? '#64748b') : '#3d4a5c';
  const glowColor = hasSemanticEyebrow ? `${building.labelEyebrowColor ?? '#64748b'}55` : 'transparent';
  const faithIcon = building.type === 'spiritual' && building.faith
    ? (FAITH_ICON[building.faith] ?? null)
    : null;

  return (
    <motion.div
      data-testid="building-toast"
      key={building.id}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      transition={{ type: 'spring', stiffness: 340, damping: 30 }}
      className="absolute left-1/2 -translate-x-1/2 z-40 pointer-events-auto w-[min(380px,calc(100vw-2rem))] pt-5"
      style={{ bottom: isMobile ? 'calc(8rem + var(--sai-bottom))' : '10rem' }}
    >
      {/* Floating tag — sits above card edge like a door label */}
      {displayEyebrow && (
        <div className="absolute top-0 left-2 flex items-center gap-1.5 pointer-events-none select-none">
          {faithIcon && (
            <span
              className="text-[12px] leading-none"
              style={{ color: tagColor, textShadow: `0 0 8px ${glowColor}` }}
            >
              {faithIcon}
            </span>
          )}
          <span
            className="text-[9px] font-bold tracking-[0.2em] uppercase"
            style={{ color: tagColor, textShadow: `0 0 6px ${glowColor}` }}
          >
            {displayEyebrow}
          </span>
        </div>
      )}

      {/* Card */}
      <div className="bg-[#070c14]/90 backdrop-blur-md border border-white/[0.07] rounded-xl
        shadow-[0_8px_32px_rgba(0,0,0,0.7)] flex items-center gap-3 px-4 py-3">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-white/90 truncate leading-snug">
            {building.label ?? building.type}
          </div>
          {building.labelSub && (
            <div className="text-[11px] text-slate-400/70 truncate mt-0.5 leading-snug">
              {building.labelSub}
            </div>
          )}
        </div>
        <button
          onClick={onEnter}
          className="shrink-0 px-3 py-1.5 rounded-lg bg-white/[0.07] hover:bg-white/[0.12] active:scale-95
            border border-white/10 text-[11px] font-semibold text-white/60 hover:text-white/85
            transition-all duration-150 cursor-pointer"
        >
          Enter
        </button>
      </div>
    </motion.div>
  );
}

/**
 * Walk-up toast for POIs. Mirrors BuildingToast but reads from POIDefinition
 * (semantic class drives the eyebrow color, kind drives the subtitle, lore is
 * truncated for the card). Enter button opens the POI modal via setActivePOI.
 */
function POIToast({
  poi,
  isMobile,
  onEnter,
}: {
  poi: POIDefinition;
  isMobile: boolean;
  onEnter: () => void;
}) {
  const style = SEMANTIC_STYLE[poi.class];
  const tagColor = style.color;
  const glowColor = `${tagColor}55`;

  return (
    <motion.div
      data-testid="poi-toast"
      key={poi.id}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      transition={{ type: 'spring', stiffness: 340, damping: 30 }}
      className="absolute left-1/2 -translate-x-1/2 z-40 pointer-events-auto w-[min(380px,calc(100vw-2rem))] pt-5"
      style={{ bottom: isMobile ? 'calc(8rem + var(--sai-bottom))' : '10rem' }}
    >
      <div className="absolute top-0 left-2 flex items-center gap-1.5 pointer-events-none select-none">
        <span
          className="text-[9px] font-bold tracking-[0.2em] uppercase"
          style={{ color: tagColor, textShadow: `0 0 6px ${glowColor}` }}
        >
          {style.eyebrow}
        </span>
      </div>

      <div className="bg-[#070c14]/90 backdrop-blur-md border border-white/[0.07] rounded-xl
        shadow-[0_8px_32px_rgba(0,0,0,0.7)] flex items-center gap-3 px-4 py-3">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-white/90 truncate leading-snug">
            {poi.name}
          </div>
          {poi.sub && (
            <div className="text-[11px] text-slate-400/70 truncate mt-0.5 leading-snug">
              {poi.sub}
            </div>
          )}
        </div>
        <button
          onClick={onEnter}
          className="shrink-0 px-3 py-1.5 rounded-lg bg-white/[0.07] hover:bg-white/[0.12] active:scale-95
            border border-white/10 text-[11px] font-semibold text-white/60 hover:text-white/85
            transition-all duration-150 cursor-pointer"
        >
          Enter
        </button>
      </div>
    </motion.div>
  );
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
  const common = `absolute left-1/2 -translate-x-1/2 bg-black/80 backdrop-blur-md px-6 py-3 rounded-full border ${t.border} ${t.shadow} ${t.text} font-bold tracking-wider`;
  const bottom = isMobile ? 'calc(6rem + var(--sai-bottom))' : '8rem';

  if (!isMobile) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        className={common}
        style={{ bottom }}
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
      style={{ bottom, touchAction: 'none' }}
    >
      {children}
    </motion.button>
  );
}

// ── Combat Mode Banner ──────────────────────────────────────────────────────
// Animated ASCII alert that appears top-center when fight mode is active
function CombatModeBanner() {
  const [frame, setFrame] = useState(0);
  const [elevCharge, setElevCharge] = useState(0);
  const cannons = useGameStore((state) => state.stats.cannons);
  const smallShot = useGameStore((state) => state.cargo['Small Shot'] ?? 0);
  const cannonShot = useGameStore((state) => state.cargo['Cannon Shot'] ?? 0);
  const rockets = useGameStore((state) => state.cargo['War Rockets'] ?? 0);
  const armament = useGameStore((state) => state.stats.armament);
  const { isMobile } = useIsMobile();

  useEffect(() => {
    const id = setInterval(() => setFrame(f => f + 1), 400);
    return () => clearInterval(id);
  }, []);

  // Poll elevation charge every frame so the meter is responsive
  useEffect(() => {
    let raf: number;
    const tick = () => { setElevCharge(getCurrentElevationCharge()); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Rotating alert icon frames
  const icons = ['⚔', '☠', '⚔', '✴'];
  const icon = icons[frame % icons.length];
  // Pulsing border characters
  const border = frame % 2 === 0 ? '╬' : '╫';
  const bowWeapons = armament.filter((w) => WEAPON_DEFS[w].aimable);
  const mountedWeapon = bowWeapons.includes(activeBowWeapon) ? activeBowWeapon : (bowWeapons[0] ?? 'swivelGun');
  const mountedWeaponName = WEAPON_DEFS[mountedWeapon].name;
  const mountedAmmo = mountedWeapon === 'fireRocket'
    ? `War Rockets: ${rockets}`
    : mountedWeapon === 'falconet'
      ? `Cannon Shot: ${cannonShot}`
      : `Small Shot: ${smallShot}`;
  const cycleHint = bowWeapons.length > 1 ? ' · [TAB] cycle bow weapon' : '';

  const elevDeg = Math.round(5 + elevCharge * 43);
  const elevLabel = elevCharge < 0.15 ? '' : elevCharge < 0.6 ? 'elevated' : 'shore bombardment';

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
            [LMB] bow gun{cycleHint} · [Q]/[R] broadside · hold [SPACE] before [Q/R] to lob · [F] stand down
          </div>
          <div className="text-center text-red-500/40 text-[9px] font-mono tracking-wider mt-0.5">
            ● {mountedWeaponName} · {mountedAmmo}{cannons > 0 ? ` · Cannon Shot: ${cannonShot}` : ''}
          </div>
          {/* Elevation charge meter — only visible while SPACE is held */}
          {elevCharge > 0.01 && (
            <div className="mt-1.5 flex items-center gap-2 font-mono text-[9px]">
              <span className="text-orange-500/70 tracking-wider">ELEVATION</span>
              <div className="flex-1 h-1.5 bg-black/50 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${elevCharge * 100}%`,
                    background: elevCharge < 0.4
                      ? 'rgb(251,146,60)'
                      : elevCharge < 0.75
                        ? 'rgb(239,68,68)'
                        : 'rgb(255,210,50)',
                    transition: 'width 0.05s linear',
                  }}
                />
              </div>
              <span className="text-orange-300 tabular-nums w-7 text-right">{elevDeg}°</span>
              {elevLabel && <span className="text-orange-500/60">{elevLabel}</span>}
            </div>
          )}
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
  const smallShot = useGameStore((s) => s.cargo['Small Shot'] ?? 0);

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 500);
    return () => clearInterval(id);
  }, []);

  // Import dynamically through the module to avoid circular deps in render
  const weaponLabel = activeWeapon === 'musket' ? 'Matchlock Musket' : 'Hunting Bow';
  const ammoLine = activeWeapon === 'musket'
    ? `Small shot: ${smallShot}`
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

type IncomingFireIndicator = {
  id: number;
  label: string;
  shipName: string;
  x: number;
  z: number;
  createdAt: number;
};

function IncomingFireIndicatorHud() {
  const [indicator, setIndicator] = useState<IncomingFireIndicator | null>(null);

  useEffect(() => {
    const handleIntent = (e: Event) => {
      const detail = (e as CustomEvent).detail as Partial<IncomingFireIndicator> | undefined;
      if (typeof detail?.x !== 'number' || typeof detail?.z !== 'number') return;
      setIndicator({
        id: Date.now(),
        label: detail.label ?? 'Incoming Fire',
        shipName: detail.shipName ?? 'Unknown ship',
        x: detail.x,
        z: detail.z,
        createdAt: Date.now(),
      });
    };
    window.addEventListener('npc-incoming-fire-intent', handleIntent);
    return () => window.removeEventListener('npc-incoming-fire-intent', handleIntent);
  }, []);

  useEffect(() => {
    if (!indicator) return;
    const timer = setTimeout(() => setIndicator((current) => current?.id === indicator.id ? null : current), 1400);
    return () => clearTimeout(timer);
  }, [indicator]);

  if (!indicator) return null;

  const ship = getLiveShipTransform();
  const dx = indicator.x - ship.pos[0];
  const dz = indicator.z - ship.pos[2];
  const rel = Math.atan2(dx, dz) - ship.rot;
  const x = 50 + Math.sin(rel) * 42;
  const y = 50 - Math.cos(rel) * 38;

  return (
    <motion.div
      key={indicator.id}
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.92 }}
      transition={{ duration: 0.16 }}
      className="pointer-events-none fixed z-[70]"
      style={{
        left: `${Math.max(9, Math.min(91, x))}%`,
        top: `${Math.max(12, Math.min(88, y))}%`,
        transform: 'translate(-50%, -50%)',
      }}
    >
      <div className="flex flex-col items-center gap-1">
        <div
          className="h-9 w-9 rounded-full border border-amber-300/45 bg-black/45 backdrop-blur-sm
            shadow-[0_0_18px_rgba(168,139,83,0.22)] flex items-center justify-center"
        >
          <div
            className="h-0 w-0 border-l-[6px] border-r-[6px] border-b-[13px] border-l-transparent border-r-transparent border-b-amber-200/85"
            style={{ transform: `rotate(${rel}rad)` }}
          />
        </div>
        <div className="rounded border border-amber-300/30 bg-black/50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-100/85 shadow-[0_2px_10px_rgba(0,0,0,0.35)]">
          {indicator.label}
        </div>
      </div>
    </motion.div>
  );
}

type CombatTone = 'ship' | 'hunt';

function CombatChip({ children, tone = 'ship', strong = false }: { children: ReactNode; tone?: CombatTone; strong?: boolean }) {
  const border = strong
    ? tone === 'ship' ? 'border-red-200/28' : 'border-amber-200/30'
    : 'border-[#d7c08a]/16';
  const text = strong
    ? tone === 'ship' ? 'text-red-50' : 'text-amber-50'
    : 'text-[#c6cbd6]';
  const bg = strong
    ? tone === 'ship' ? 'bg-red-950/32' : 'bg-amber-950/28'
    : 'bg-[#090d15]/42';

  return (
    <span className={`inline-flex h-7 items-center rounded-md border ${border} ${bg} px-2.5 font-mono text-[10px] font-semibold tracking-[0.08em] ${text}`}>
      {children}
    </span>
  );
}

function CombatKey({ value, label }: { value: string; label: ReactNode }) {
  return (
    <span className="inline-flex h-7 items-center gap-1.5 rounded-md border border-[#d7c08a]/16 bg-[#090d15]/42 px-2.5 font-mono text-[10px] font-semibold tracking-[0.08em] text-[#c6cbd6]">
      <span className="rounded-[4px] border border-[#d7c08a]/22 bg-[#e8c872]/9 px-1.5 py-[1px] text-[9px] font-bold uppercase tracking-[0.12em] text-[#f3d78a]">{value}</span>
      <span>{label}</span>
    </span>
  );
}

function ReadinessPip({ state }: { state: 'ready' | 'empty' | 'reload' }) {
  const color = state === 'ready' ? 'bg-emerald-300 shadow-[0_0_10px_rgba(110,231,183,0.55)]'
    : state === 'reload' ? 'bg-amber-300 shadow-[0_0_10px_rgba(252,211,77,0.45)]'
    : 'bg-red-300 shadow-[0_0_10px_rgba(252,165,165,0.55)]';
  return <span className={`h-2 w-2 rounded-full ${color}`} />;
}

function CombatStatusBadge({ state, label }: { state: 'ready' | 'empty' | 'reload'; label: string }) {
  return (
    <span className={`shrink-0 rounded-md border px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.16em] ${state === 'ready' ? 'border-emerald-300/25 bg-emerald-400/10 text-emerald-200' : state === 'reload' ? 'border-amber-300/25 bg-amber-400/10 text-amber-200' : 'border-red-300/30 bg-red-500/12 text-red-200'}`}>
      {label}
    </span>
  );
}

function ShipSideIcon({ side }: { side: 'port' | 'starboard' }) {
  return (
    <span className="relative inline-flex h-5 w-8 items-center justify-center" aria-hidden>
      <span className="h-1.5 w-5 rounded-full bg-[#d7c08a]/28" />
      <span className={`absolute top-1/2 h-3 w-1 -translate-y-1/2 rounded-full bg-red-200/75 shadow-[0_0_7px_rgba(252,165,165,0.35)] ${side === 'port' ? 'left-1' : 'right-1'}`} />
    </span>
  );
}

function CombatStationRow({
  label,
  primary,
  secondary,
  actions,
  muted = false,
}: {
  label: string;
  primary: string;
  secondary?: string;
  actions?: ReactNode;
  muted?: boolean;
}) {
  return (
    <div className={`grid items-center gap-2 border-t border-[#d7c08a]/10 py-1.5 first:border-t-0 first:pt-0 last:pb-0 ${muted ? 'opacity-60' : ''} ${actions ? 'grid-cols-[5.75rem_minmax(0,1fr)_auto]' : 'grid-cols-[5.75rem_minmax(0,1fr)]'}`}>
      <div className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-[#d7c08a]/68">{label}</div>
      <div className="min-w-0">
        <div className="truncate text-[13px] font-semibold text-[#f8ead0]">{primary}</div>
        {secondary && <div className="mt-0.5 truncate font-mono text-[9px] font-semibold tracking-[0.08em] text-slate-400/85">{secondary}</div>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap justify-end gap-1.5">{actions}</div>}
    </div>
  );
}

function CombatHud() {
  const combatMode = useGameStore((s) => s.combatMode);
  const playerMode = useGameStore((s) => s.playerMode);
  const cargo = useGameStore((s) => s.cargo);
  const armament = useGameStore((s) => s.stats.armament);
  const activeLandWeapon = useGameStore((s) => s.activeLandWeapon);
  const landWeapons = useGameStore((s) => s.landWeapons);
  const { isMobile } = useIsMobile();
  const [now, setNow] = useState(() => Date.now());
  const [elevCharge, setElevCharge] = useState(0);

  useEffect(() => {
    if (!combatMode) return;
    const id = setInterval(() => setNow(Date.now()), 120);
    return () => clearInterval(id);
  }, [combatMode]);

  useEffect(() => {
    if (!combatMode || playerMode !== 'ship') return;
    let raf: number;
    const tick = () => {
      setElevCharge(getCurrentElevationCharge());
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [combatMode, playerMode]);

  if (!combatMode) return null;

  if (playerMode === 'walking') {
    const def = LAND_WEAPON_DEFS[activeLandWeapon];
    const ammoName = def.ammoCommodity;
    const ammoCount = ammoName ? cargo[ammoName] ?? 0 : null;
    const readyAt = landWeaponReload[activeLandWeapon] ?? 0;
    const reloadLeft = Math.max(0, readyAt - now);
    const empty = ammoName !== null && ammoCount !== null && ammoCount < def.ammoPerShot;
    const readiness: 'ready' | 'empty' | 'reload' = empty ? 'empty' : reloadLeft > 0 ? 'reload' : 'ready';
    const readinessLabel = empty ? 'EMPTY' : reloadLeft > 0 ? `${(reloadLeft / 1000).toFixed(1)}s` : 'READY';
    const ammoLabel = ammoName ? `${ammoName} ${ammoCount}` : 'No ammunition';
    const actionLabel = activeLandWeapon === 'bow' ? 'Loose' : 'Fire';
    const tone: CombatTone = 'hunt';

    return (
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.97 }}
        transition={{ type: 'spring', stiffness: 360, damping: 28 }}
        className="absolute left-1/2 z-40 -translate-x-1/2 pointer-events-none"
        style={{ bottom: isMobile ? 'calc(6.1rem + var(--sai-bottom))' : 'calc(6.15rem + var(--sai-bottom))', width: isMobile ? 'min(23rem, calc(100vw - 1.5rem))' : 'min(37rem, calc(100vw - 2rem))' }}
      >
        <div className="relative overflow-hidden rounded-[10px] border border-[#d7c08a]/20 bg-[#111722]/86 shadow-[0_16px_36px_rgba(0,0,0,0.46),inset_0_1px_0_rgba(255,255,255,0.075)] backdrop-blur-xl">
          <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-amber-200/70 to-transparent" />
          <div className={`${isMobile ? 'px-3.5 py-3' : 'px-[18px] py-3.5'}`}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <ReadinessPip state={readiness} />
                <span className="font-serif text-[12px] font-bold uppercase tracking-[0.2em] text-amber-100">Hunting</span>
                <span className="h-4 w-px bg-[#d7c08a]/20" />
                <span className="truncate text-[15px] font-semibold text-[#f8ead0]">{def.name}</span>
              </div>
              <span className={`shrink-0 rounded-md border px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.16em] ${readiness === 'ready' ? 'border-emerald-300/25 bg-emerald-400/10 text-emerald-200' : readiness === 'reload' ? 'border-amber-300/25 bg-amber-400/10 text-amber-200' : 'border-red-300/30 bg-red-500/12 text-red-200'}`}>
                {readinessLabel}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <CombatChip tone={tone} strong>{ammoLabel}</CombatChip>
              <CombatChip tone={tone}>{def.range}m range</CombatChip>
              {!isMobile && <CombatKey value="Click" label={actionLabel.toLowerCase()} />}
              {!isMobile && landWeapons.length > 1 && <CombatKey value="Tab" label="change weapon" />}
              {!isMobile && <CombatKey value="F" label="holster" />}
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

  const bowWeapons = armament.filter((w) => WEAPON_DEFS[w].aimable);
  const mountedWeapon = bowWeapons.includes(activeBowWeapon) ? activeBowWeapon : (bowWeapons[0] ?? 'swivelGun');
  const mountedDef = WEAPON_DEFS[mountedWeapon];
  const broadsideWeapons = armament.filter((w) => !WEAPON_DEFS[w].aimable);
  const ammoName = mountedWeapon === 'fireRocket' ? 'War Rockets' : mountedWeapon === 'falconet' ? 'Cannon Shot' : 'Small Shot';
  const ammoCount = cargo[ammoName] ?? 0;
  const cannonShot = cargo['Cannon Shot'] ?? 0;
  const empty = ammoCount <= 0;
  const bowReloadLeft = Math.max(0, (bowWeaponReload[mountedWeapon] ?? 0) - now);
  const portLeft = Math.max(0, broadsideReload.port - now);
  const starboardLeft = Math.max(0, broadsideReload.starboard - now);
  const readiness: 'ready' | 'empty' | 'reload' = empty ? 'empty' : bowReloadLeft > 0 ? 'reload' : 'ready';
  const readinessLabel = empty ? 'BOW EMPTY' : bowReloadLeft > 0 ? `${(bowReloadLeft / 1000).toFixed(1)}s` : 'BOW READY';
  const elevationVisible = elevCharge > 0.01;
  const elevationDeg = Math.round(5 + elevCharge * 43);
  const broadsideSummary = broadsideWeapons.length === 0
    ? 'No cannon mounted'
    : `${broadsideWeapons.length} cannon${broadsideWeapons.length === 1 ? '' : 's'}`;
  const broadsideTypes = Array.from(new Set(broadsideWeapons.map((w) => WEAPON_DEFS[w].name))).join(', ');
  const broadsideNeedsShot = broadsideWeapons.length > 0 && cannonShot < broadsideWeapons.length;
  const hasBroadside = broadsideWeapons.length > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 16, scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 360, damping: 28 }}
      className="absolute left-1/2 z-40 -translate-x-1/2 pointer-events-none"
      style={{ bottom: isMobile ? 'calc(5.35rem + var(--sai-bottom))' : 'calc(5.15rem + var(--sai-bottom))', width: isMobile ? 'min(23rem, calc(100vw - 1.5rem))' : hasBroadside ? 'min(45rem, calc(100vw - 2rem))' : 'min(39rem, calc(100vw - 2rem))' }}
    >
      <div className="relative overflow-hidden rounded-[10px] border border-[#d7c08a]/18 bg-[#111722]/88 shadow-[0_16px_36px_rgba(0,0,0,0.48),inset_0_1px_0_rgba(255,255,255,0.075)] backdrop-blur-xl">
        <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-red-200/60 to-transparent" />
        <div className={`${isMobile ? 'px-3.5 py-3' : 'px-[18px] py-3'}`}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <ReadinessPip state={readiness} />
              <span className="font-serif text-[12px] font-bold uppercase tracking-[0.2em] text-red-100">Fight Mode</span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {!isMobile && <CombatKey value="F" label="stand down" />}
              <CombatStatusBadge state={readiness} label={readinessLabel} />
            </div>
          </div>
          <div className="mt-2">
            <CombatStationRow
              label="Bow Gun"
              primary={mountedDef.name}
              secondary={`${ammoName} ${ammoCount} · ${mountedDef.range}m range`}
              actions={!isMobile && (
                <>
                  <CombatKey value="Click" label="fire" />
                  {bowWeapons.length > 1 && <CombatKey value="Tab" label="change" />}
                </>
              )}
            />
            {hasBroadside && (
              <CombatStationRow
                label="Broadside"
                primary={broadsideSummary}
                secondary={`${broadsideNeedsShot ? 'Need' : 'Cannon Shot'} ${cannonShot}/${broadsideWeapons.length} · ${broadsideTypes}`}
                actions={!isMobile && (
                  <div className="flex flex-col items-end gap-1.5">
                    <div className="flex flex-wrap justify-end gap-1.5">
                      <CombatKey value="Q" label={<span className="inline-flex items-center gap-1"><ShipSideIcon side="port" />{portLeft > 0 ? `${(portLeft / 1000).toFixed(1)}s` : 'ready'}</span>} />
                      <CombatKey value="R" label={<span className="inline-flex items-center gap-1"><ShipSideIcon side="starboard" />{starboardLeft > 0 ? `${(starboardLeft / 1000).toFixed(1)}s` : 'ready'}</span>} />
                    </div>
                    <span data-nudge-target="broadside-elevation">
                      <CombatKey value="Space" label="hold to aim" />
                    </span>
                  </div>
                )}
              />
            )}
            {isMobile && (
              <div className="mt-1.5 flex justify-end">
                <CombatKey value="F" label="stand down" />
              </div>
            )}
          </div>
          {elevationVisible && (
            <div className="mt-2 flex items-center gap-2">
              <span className="font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-orange-200/80">Elevation</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/45">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-orange-300 via-red-300 to-yellow-200"
                  style={{ width: `${Math.max(3, elevCharge * 100)}%`, transition: 'width 0.05s linear' }}
                />
              </div>
              <span className="w-8 text-right font-mono text-[10px] font-bold text-orange-100">{elevationDeg}°</span>
            </div>
          )}
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

// Sister to the Journal button at bottom-left; toggles QuestsPanel.
function QuestsBarButton({ active, onClick }: { active: boolean; onClick: () => void }) {
  const activeLeadCount = useGameStore(s => s.leads.filter(l => l.status === 'active').length);
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      data-nudge-target="commissions"
      className={`group relative w-11 h-11 rounded-full flex items-center justify-center
        bg-[#1a1e2e] border-2
        shadow-[inset_0_2px_4px_rgba(0,0,0,0.5),inset_0_-1px_2px_rgba(255,255,255,0.05),0_2px_8px_rgba(0,0,0,0.6)]
        transition-all active:scale-95
        ${active
          ? 'border-amber-500/60 text-amber-400 shadow-[inset_0_2px_4px_rgba(0,0,0,0.5),inset_0_-1px_2px_rgba(255,255,255,0.05),0_0_12px_rgba(245,158,11,0.25)]'
          : 'border-[#4a4535]/60 text-[#8a8060] hover:text-amber-400 hover:border-[#6a6545]/80'
        }`}
      title="Commissions"
    >
      <Scroll size={15} />
      {!active && activeLeadCount > 0 && (
        <span
          className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-amber-400/90 shadow-[0_0_4px_rgba(245,158,11,0.8)]"
          aria-hidden
        />
      )}
      <span className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-[#0b1120] border border-slate-700/50 rounded text-[9px] tracking-[0.12em] uppercase text-slate-400 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
        Commissions<span className="ml-1 text-slate-500">[6]</span>
      </span>
    </button>
  );
}

export function UI() {
  const testMode = getTestModeConfig();
  const gold = useGameStore((state) => state.gold);
  const cargo = useGameStore((state) => state.cargo);
  const stats = useGameStore((state) => state.stats);
  const notifications = useGameStore((state) => state.notifications);
  const removeNotification = useGameStore((state) => state.removeNotification);
  const addNotification = useGameStore((state) => state.addNotification);
  const activePort = useGameStore((state) => state.activePort);
  const setActivePort = useGameStore((state) => state.setActivePort);
  const dismissedPortRef = useRef<string | null>(null);
  const interactionPrompt = useGameStore((state) => state.interactionPrompt);
  const timeOfDay = useGameStore((state) => state.timeOfDay);
  const crew = useGameStore((state) => state.crew);
  const dayCount = useGameStore((state) => state.dayCount);
  const provisions = useGameStore((state) => state.provisions);
  const ship = useGameStore((state) => state.ship);
  const anchored = useGameStore((state) => state.anchored);
  const combatMode = useGameStore((state) => state.combatMode);
  const playerMode = useGameStore((state) => state.playerMode);
  const setCombatMode = useGameStore((state) => state.setCombatMode);
  const setAnchored = useGameStore((state) => state.setAnchored);
  const activeLandWeapon = useGameStore((state) => state.activeLandWeapon);
  const portCount = useGameStore((state) => state.ports.length);
  const showDevPanel = useGameStore((state) => state.renderDebug.showDevPanel);
  const settingsV2 = useGameStore((state) => state.renderDebug.settingsV2);
  const minimapEnabled = useGameStore((state) => state.renderDebug.minimap);
  const useWorldMapChart = useGameStore((state) => state.renderDebug.worldMapChart);
  const cityFieldOverlayEnabled = useGameStore((state) => state.renderDebug.cityFieldOverlay);
  const cityFieldMode = useGameStore((state) => state.renderDebug.cityFieldMode);
  const plumbBobsEnabled = useGameStore((state) => state.renderDebug.sacredMarkers);
  const poiBeaconsEnabled = useGameStore((state) => state.renderDebug.poiBeacons);
  const updateRenderDebug = useGameStore((state) => state.updateRenderDebug);
  const waterPaletteId = useGameStore((state) => resolveWaterPaletteId(state));
  const captainExpression = useGameStore((state) => state.captainExpression);
  const reputation = useGameStore((state) => state.reputation);
  const currentWorldPortId = useGameStore((state) => state.currentWorldPortId);
  const voyageBegun = useGameStore((state) => state.voyageBegun);
  const combatHudTone = combatMode
    ? playerMode === 'ship'
      ? {
          ring: '#ef4444',
          glow: 'rgba(239,68,68,0.58)',
          border: 'rgba(248,113,113,0.42)',
          soft: 'rgba(127,29,29,0.18)',
          label: 'Battle stations',
        }
      : {
          ring: '#f59e0b',
          glow: 'rgba(245,158,11,0.52)',
          border: 'rgba(251,191,36,0.38)',
          soft: 'rgba(120,53,15,0.16)',
          label: 'Hunting',
        }
    : null;
  const leads = useGameStore((state) => state.leads);
  const knowledgeState = useGameStore((state) => state.knowledgeState);
  const journalEntries = useGameStore((state) => state.journalEntries);

  const [showLocalMap, setShowLocalMap] = useState(false);
  const [showWorldMap, setShowWorldMap] = useState(false);
  const [showInstructions, setShowInstructions] = useState(() => !testMode.skipOpening);
  const [arrivalCurtainPort, setArrivalCurtainPort] = useState<string | null>(null);
  // When skipping the opening (dev/test mode), begin the voyage immediately
  // so GameScene mounts without waiting for the splash screen flow.
  const _setVoyageBegunOnce = useGameStore(s => s.setVoyageBegun);
  useEffect(() => {
    if (testMode.skipOpening) _setVoyageBegunOnce();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  useEffect(() => {
    if (!testMode.enabled) return;
    const openWorldMapForTest = () => setShowWorldMap(true);
    const openLocalMapForTest = () => setShowLocalMap(true);
    window.addEventListener('__SPICE_VOYAGER_TEST_OPEN_WORLD_MAP__', openWorldMapForTest);
    window.addEventListener('__SPICE_VOYAGER_TEST_OPEN_LOCAL_MAP__', openLocalMapForTest);
    return () => {
      window.removeEventListener('__SPICE_VOYAGER_TEST_OPEN_WORLD_MAP__', openWorldMapForTest);
      window.removeEventListener('__SPICE_VOYAGER_TEST_OPEN_LOCAL_MAP__', openLocalMapForTest);
    };
  }, [testMode.enabled]);
  const [dashboardState, setDashboardState] = useState<{ tab?: string; crewId?: string; commodity?: string } | null>(null);
  const showDashboard = !!dashboardState;
  const setShowDashboard = (v: boolean) => setDashboardState(v ? {} : null);
  const [expandedStat, setExpandedStat] = useState<'hull' | 'morale' | 'cargo' | null>(null);
  const paused = useGameStore(s => s.paused);
  const setPaused = useGameStore(s => s.setPaused);
  const [showLearn, setShowLearn] = useState(false);
  const [showJournal, setShowJournal] = useState(false);
  const [showQuests, setShowQuests] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [seenNudges, setSeenNudges] = useState<Set<NudgeId>>(() => readSeenNudges());
  const [showWind, setShowWind] = useState(false);
  const [showOverlayMenu, setShowOverlayMenu] = useState(false);
  const [showOverflowMenu, setShowOverflowMenu] = useState(false);
  const [hailNpc, setHailNpc] = useState<NPCShipIdentity | null>(null);
  const [hailContext, setHailContext] = useState<HailContext>('normal');
  const overlayMenuRef = useRef<HTMLDivElement | null>(null);

  // Mobile layout branching. `isMobile` is true on coarse-pointer viewports
  // ≤900px, or when Settings → Force Mobile Layout is on. See `useIsMobile.ts`.
  const { isMobile } = useIsMobile();
  const [hullDamagePulse, setHullDamagePulse] = useState<{ key: number; severity: number } | null>(null);
  const [showCommission, setShowCommission] = useState(false);
  const [showVoyageCurtain, setShowVoyageCurtain] = useState(false);
  // Intro fade phases:
  //   'idle' — overlay invisible
  //   'in'   — fading commission → black (modal still mounted underneath)
  //   'out'  — black → cinematic (modal unmounted, camera is dollying)
  const [introFadePhase, setIntroFadePhase] = useState<'idle' | 'in' | 'out'>('idle');
  const setVoyageBegun = useGameStore(s => s.setVoyageBegun);
  const [splashComplete, setSplashComplete] = useState(false);
  const [splashMinElapsed, setSplashMinElapsed] = useState(false);
  const worldReady = portCount > 0;
  const [loadingMessage, setLoadingMessage] = useState(LOADING_MESSAGES[0]);
  const [loadingProgress, setLoadingProgress] = useState(10);
  const mapPreRenderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hailWasPausedRef = useRef(false);
  const portWasPausedRef = useRef(false);
  const previousHullRef = useRef(stats.hull);
  const initialCargoUsedRef = useRef<number | null>(null);
  const initialCrewCountRef = useRef<number | null>(null);
  const initialJournalCountRef = useRef<number | null>(null);
  const initialKnownCommodityCountRef = useRef<number | null>(null);
  const hullDamagePulseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reduceMotion = useReducedMotion();
  const startupOverlayActive = showInstructions || showCommission || showVoyageCurtain;

  const dismissNudge = useCallback((id: NudgeId) => {
    setSeenNudges((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      writeSeenNudges(next);
      return next;
    });
  }, []);

  const toggleCombatMode = useCallback(() => {
    const next = !combatMode;
    dismissNudge('hostile-fight');
    setCombatMode(next);

    if (playerMode === 'ship') {
      if (next) {
        if (anchored) setAnchored(false);
        sfxBattleStations();
        audioManager.startFightMusic();
        addNotification('Battle stations!', 'info');
      } else {
        audioManager.stopFightMusic();
        addNotification('Standing down.', 'info');
      }
      return;
    }

    if (next) {
      addNotification(`${LAND_WEAPON_DEFS[activeLandWeapon].name} drawn. Click to fire.`, 'info');
    } else {
      addNotification('Weapon lowered.', 'info');
    }
  }, [activeLandWeapon, addNotification, anchored, combatMode, dismissNudge, playerMode, setAnchored, setCombatMode]);

  useEffect(() => {
    if (!voyageBegun || startupOverlayActive) return;
    if (typeof window === 'undefined') return;

    const key = 'spice-voyager-control-hint-ship';
    if (window.sessionStorage.getItem(key)) return;
    window.sessionStorage.setItem(key, '1');
    addNotification('WASD or arrow keys move the ship. Space drops anchor near shore. E goes ashore when prompted.', 'info', {
      tier: 'ticker',
      subtitle: 'SHIP CONTROLS',
    });
  }, [addNotification, startupOverlayActive, voyageBegun]);

  useEffect(() => {
    if (!voyageBegun || startupOverlayActive || playerMode !== 'walking') return;
    if (typeof window === 'undefined') return;

    const timers: ReturnType<typeof setTimeout>[] = [];
    const scheduleHint = (key: string, delayMs: number, message: string, subtitle: string) => {
      if (window.sessionStorage.getItem(key)) return;
      timers.push(setTimeout(() => {
        if (useGameStore.getState().playerMode !== 'walking') return;
        if (window.sessionStorage.getItem(key)) return;
        window.sessionStorage.setItem(key, '1');
        addNotification(message, 'info', { tier: 'ticker', subtitle });
      }, delayMs));
    };

    scheduleHint(
      'spice-voyager-control-hint-walking-run',
      3_000,
      'Hold Shift to run while ashore. Drawing a weapon slows you back to a walk.',
      'ASHORE'
    );
    scheduleHint(
      'spice-voyager-control-hint-walking-jump',
      7_000,
      'Press Space to jump. Near fresh game, Space harvests instead.',
      'ASHORE'
    );

    return () => {
      timers.forEach(clearTimeout);
    };
  }, [addNotification, playerMode, startupOverlayActive, voyageBegun]);

  // Building entry toast (walking mode, non-market buildings)
  const [portEntryTab, setPortEntryTab] = useState<PlaceTab | undefined>(undefined);
  const [activeBuildingToast, setActiveBuildingToastState] = useState<{ building: Building; port: Port } | null>(null);
  const activeBuildingToastRef = useRef<{ building: Building; port: Port } | null>(null);
  const setActiveBuildingToast = useCallback((val: { building: Building; port: Port } | null) => {
    activeBuildingToastRef.current = val;
    setActiveBuildingToastState(val);
  }, []);
  const [activeBuildingDetail, setActiveBuildingDetail] = useState<{ building: Building; port: Port } | null>(null);

  // POI walk-up toast (parallel to building toast). The toast is local UI;
  // the modal-open state lives on gameStore as `activePOI` so any system can
  // open it.
  const [activePOIToast, setActivePOIToastState] = useState<{ poi: POIDefinition; port: Port } | null>(null);
  const activePOIToastRef = useRef<{ poi: POIDefinition; port: Port } | null>(null);
  const setActivePOIToast = useCallback((val: { poi: POIDefinition; port: Port } | null) => {
    activePOIToastRef.current = val;
    setActivePOIToastState(val);
  }, []);
  const setActivePOI = useGameStore((state) => state.setActivePOI);
  const activePOI = useGameStore((state) => state.activePOI);
  const activeCrewTrouble = useGameStore((state) => state.activeCrewTrouble);

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
      setVoyageBegun();       // triggers GameScene mount in Game.tsx
      setShowVoyageCurtain(true);
    }
  }, [splashComplete, setVoyageBegun]);

  const closeCommission = useCallback(() => {
    // Begin fade to black with the commission still visible underneath.
    // When the fade-in transition ends, we hide the modal and start the
    // cinematic in handleIntroFadeEnd, then fade back out.
    setIntroFadePhase('in');
    if (mapPreRenderTimerRef.current) clearTimeout(mapPreRenderTimerRef.current);
    mapPreRenderTimerRef.current = setTimeout(() => {
      startTerrainPreRender(waterPaletteId);
      mapPreRenderTimerRef.current = null;
    }, 600);
  }, [waterPaletteId]);

  const handleIntroFadeEnd = useCallback(() => {
    setIntroFadePhase((phase) => {
      if (phase === 'in') {
        // Fully black — swap modal off, drop camera to a tight gameplay zoom
        // (the cinematic ends at whatever cameraZoom is now), start the
        // cinematic, then begin fading out.
        setShowCommission(false);
        useGameStore.getState().setCameraZoom(28);
        audioManager.transitionToOverworld();
        startIntroCinematic();
        return 'out';
      }
      if (phase === 'out') return 'idle';
      return phase;
    });
  }, []);

  // Keep AudioManager's music zone synced to the player's current world
  // port so zone-restricted tracks (e.g. Monsoon Ledger in East Asian
  // ports) only enter the rotation when contextually appropriate.
  useEffect(() => {
    audioManager.setCurrentZone(getMusicZone(currentWorldPortId));
  }, [currentWorldPortId]);

  useEffect(() => {
    return () => {
      if (mapPreRenderTimerRef.current) clearTimeout(mapPreRenderTimerRef.current);
    };
  }, []);

  // Splash loader — wait for the world to be ready, but enforce a minimum
  // curtain so the opening screen never flashes away instantly.
  useEffect(() => {
    if (!showInstructions) return;

    const SPLASH_MIN_DURATION_MS = 1600;
    setSplashComplete(false);
    setSplashMinElapsed(false);
    setLoadingMessage(LOADING_MESSAGES[0]);
    setLoadingProgress(10);
    const minTimer = setTimeout(() => setSplashMinElapsed(true), SPLASH_MIN_DURATION_MS);

    return () => {
      clearTimeout(minTimer);
    };
  }, [showInstructions]);

  useEffect(() => {
    if (!showInstructions || splashComplete) return;

    const MESSAGE_INTERVAL_MS = 380;
    let i = 0;
    const msgTimer = setInterval(() => {
      i = (i + 1) % LOADING_MESSAGES.length;
      setLoadingMessage(LOADING_MESSAGES[i]);
    }, MESSAGE_INTERVAL_MS);

    return () => clearInterval(msgTimer);
  }, [showInstructions, splashComplete]);

  // Splash is ready once the minimum timer elapses — no longer waiting for
  // worldReady, since the canvas now mounts only after Set Sail is clicked.
  useEffect(() => {
    if (!showInstructions || splashComplete || !splashMinElapsed) return;
    setLoadingProgress(100);
    setLoadingMessage('Harbors charted. Holds secured. The monsoon favors departure.');
    setSplashComplete(true);
  }, [showInstructions, splashComplete, splashMinElapsed]);

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

  // Dismiss the voyage curtain once the world finishes generating behind it.
  useEffect(() => {
    if (!showVoyageCurtain || !worldReady) return;
    setShowVoyageCurtain(false);
    setShowCommission(true);
  }, [showVoyageCurtain, worldReady]);

  // Check for nearby ports — auto-open on approach + keep open while in label range
  const PORT_LABEL_RADIUS_SQ = 80 * 80; // matches LABEL_SHOW in PortIndicators
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
      } = useGameStore.getState();
      const playerPos = getLiveShipTransform().pos;
      const walkingPos = getLiveWalkingTransform().pos;

      if (playerMode === 'ship') {
        // Ship mode: port proximity opens the market modal (original behavior)
        const nearest = findNearbyPort(playerPos, ports);

        if (nearest && nearest.id !== currentActivePort?.id && nearest.id !== dismissedPortRef.current) {
          sfxPortArrival();
          setActiveBuildingToast(null);
          setActivePort(nearest);
        } else if (!nearest && currentActivePort) {
          // Keep the modal open while the player is still within label range of
          // the active port — covers both proximity-opens and label clicks.
          const dx = playerPos[0] - currentActivePort.position[0];
          const dz = playerPos[2] - currentActivePort.position[2];
          if (dx * dx + dz * dz >= PORT_LABEL_RADIUS_SQ) {
            setActivePort(null);
          }
        }
        if (!findNearbyPort(playerPos, ports)) dismissedPortRef.current = null;

        // Ship-accessible POIs (wrecks, smuggler's coves, offshore natural
        // features like Krakatoa) toast in ship mode. findNearestPOI's
        // per-kind radius means inland hinterland POIs (gardens, naturalist
        // camps) naturally can't fire here — the player would never be
        // within ~12u of an inland garden while sailing — so no need to
        // filter by kind here.
        const shipPoiHit = findNearestPOI(playerPos, ports);
        if (shipPoiHit) {
          const current = activePOIToastRef.current;
          if (!current || current.poi.id !== shipPoiHit.poi.id) {
            setActivePOIToast({ poi: shipPoiHit.poi, port: shipPoiHit.port });
          }
        } else if (activePOIToastRef.current) {
          setActivePOIToast(null);
        }
      } else {
        // Walking mode: per-building detection
        // Market buildings open the full port modal; everything else gets a lightweight toast.
        const result = findNearbyPortWalking(walkingPos, ports);

        // POI proximity (no-building case) uses the shared per-kind radius
        // resolver. Hinterland POIs at 200u from port center are picked up
        // here even though that exceeds WALKING_PORT_SEARCH_RADIUS_SQ —
        // findNearestPOI scans all ports' POIs by world position, not by
        // port-distance gate. A building hit on the same step wins (handled
        // in the `if (result)` branch below).
        if (!result) {
          const walkingPoiHit = findNearestPOI(walkingPos, ports);
          if (walkingPoiHit) {
            const current = activePOIToastRef.current;
            if (!current || current.poi.id !== walkingPoiHit.poi.id) {
              setActivePOIToast({ poi: walkingPoiHit.poi, port: walkingPoiHit.port });
            }
          } else if (activePOIToastRef.current) {
            setActivePOIToast(null);
          }
        } else if (activePOIToastRef.current) {
          setActivePOIToast(null);
        }

        if (result) {
          const { port, building } = result;
          const tabForBuilding: PlaceTab | undefined =
            building.type === 'market' ? 'market' :
            building.type === 'fort' || building.type === 'palace' || building.labelEyebrow === 'ROYAL' ? 'governor' :
            undefined;

          if (tabForBuilding !== undefined) {
            // Buildings that open the full port modal
            if (port.id !== currentActivePort?.id && port.id !== dismissedPortRef.current) {
              sfxPortArrival();
              setPortEntryTab(tabForBuilding);
              setActiveBuildingToast(null);
              setActivePort(port);
            }
            if (activeBuildingToastRef.current) setActiveBuildingToast(null);
          } else if (building.poiId) {
            // POI-tagged buildings (procedural shrines, future ruins, etc.)
            // surface the same POI walk-up toast as bespoke POIs do, so the
            // player gets one consistent "Enter" affordance for any POI.
            const poi = getPOIById(building.poiId, port);
            if (poi) {
              if (currentActivePort) setActivePort(null);
              if (activeBuildingToastRef.current) setActiveBuildingToast(null);
              const current = activePOIToastRef.current;
              if (!current || current.poi.id !== poi.id) {
                setActivePOIToast({ poi, port });
              }
            }
          } else {
            // All other buildings: lightweight toast
            if (currentActivePort) {
              setActivePort(null);
            }
            const current = activeBuildingToastRef.current;
            if (!current || current.building.id !== building.id) {
              setActiveBuildingToast({ building, port });
            }
          }
        } else {
          if (currentActivePort) {
            setActivePort(null);
          }
          if (activeBuildingToastRef.current) setActiveBuildingToast(null);
          // Only clear the dismissed-port memory once the player has left the port's search radius
          if (dismissedPortRef.current) {
            const dismissedPort = ports.find(p => p.id === dismissedPortRef.current);
            if (!dismissedPort) {
              dismissedPortRef.current = null;
            } else {
              const dx = walkingPos[0] - dismissedPort.position[0];
              const dz = walkingPos[2] - dismissedPort.position[2];
              if (dx * dx + dz * dz > WALKING_PORT_SEARCH_RADIUS_SQ) {
                dismissedPortRef.current = null;
              }
            }
          }
        }
      }
    }, 100);

    return () => clearInterval(checkPorts);
  }, [setActivePort, setActiveBuildingToast, startupOverlayActive]);

  const closeHail = useCallback(() => {
    setHailNpc(null);
    setHailContext('normal');
    if (!hailWasPausedRef.current) {
      setPaused(false);
    }
  }, [setPaused]);

  useEffect(() => {
    const handleCollisionHail = (e: Event) => {
      if (showInstructions || showSettings || showDashboard || showLocalMap || showWorldMap || activePort || hailNpc) return;
      const npc = (e as CustomEvent).detail?.npc as NPCShipIdentity | undefined;
      if (!npc) return;
      const state = useGameStore.getState();
      if (state.playerMode !== 'ship') return;
      hailWasPausedRef.current = state.paused;
      state.setPaused(true);
      setHailContext('collision');
      setHailNpc(npc);
      sfxShipHail(npc.hailLanguage);
    };
    window.addEventListener('npc-collision-hail', handleCollisionHail);
    return () => window.removeEventListener('npc-collision-hail', handleCollisionHail);
  }, [activePort, hailNpc, showDashboard, showInstructions, showLocalMap, showSettings, showWorldMap]);

  useEffect(() => {
    const handleWarningHail = (e: Event) => {
      if (showInstructions || showSettings || showDashboard || showLocalMap || showWorldMap || activePort || hailNpc) return;
      const npc = (e as CustomEvent).detail?.npc as NPCShipIdentity | undefined;
      if (!npc) return;
      const state = useGameStore.getState();
      if (state.playerMode !== 'ship') return;
      hailWasPausedRef.current = state.paused;
      state.setPaused(true);
      setHailContext('warning');
      setHailNpc(npc);
      sfxShipHail(npc.hailLanguage);
    };
    window.addEventListener('npc-warning-hail', handleWarningHail);
    return () => window.removeEventListener('npc-warning-hail', handleWarningHail);
  }, [activePort, hailNpc, showDashboard, showInstructions, showLocalMap, showSettings, showWorldMap]);

  useEffect(() => {
    if (activePort) {
      portWasPausedRef.current = useGameStore.getState().paused;
      setPaused(true);
      return () => {
        if (!portWasPausedRef.current) setPaused(false);
      };
    }
  }, [activePort, setPaused]);

  // Escape key closes modals
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showOverlayMenu) { sfxClose(); setShowOverlayMenu(false); }
        else if (hailNpc) { sfxClose(); closeHail(); }
        else if (showLearn) { sfxClose(); setShowLearn(false); }
        else if (showHelp) { sfxClose(); setShowHelp(false); }
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
  }, [showOverlayMenu, showLocalMap, showWorldMap, showLearn, showHelp, showDashboard, activePort, setActivePort, hailNpc, closeHail]);

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
    if (showLocalMap || showWorldMap || showSettings || showLearn || showHelp || showDashboard || activePort || hailNpc) {
      setShowOverlayMenu(false);
    }
  }, [activePort, hailNpc, showDashboard, showHelp, showLearn, showLocalMap, showSettings, showWorldMap]);

  useEffect(() => {
    const handleHailKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 't') return;
      if (showInstructions || showSettings || showHelp || showDashboard || showLocalMap || showWorldMap || activePort) return;
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
      setHailContext('normal');
      sfxShipHail(npc.hailLanguage);
    };

    window.addEventListener('keydown', handleHailKey);
    return () => window.removeEventListener('keydown', handleHailKey);
  }, [showInstructions, showSettings, showHelp, showDashboard, showLocalMap, showWorldMap, activePort]);

  // Keep nearestHailableNpc subscribed so it stays reactive, but don't auto-close
  // the hail panel when the NPC drifts out of range — player closes it manually.
  useGameStore((state) => state.nearestHailableNpc);

  // Auto-dismiss is handled per-toast inside <ASCIIToast> via useAutoDismiss.
  // That fixes the "only the latest toast auto-dismisses" bug and enables pause-on-hover.

  const toggleLocalMap = useCallback(() => { sfxOpen(); setShowLocalMap(prev => !prev); }, []);
  const toggleWorldMap = useCallback(() => {
    dismissNudge('open-navigation');
    sfxOpen();
    setShowWorldMap(prev => !prev);
  }, [dismissNudge]);
  const cycleViewMode = useGameStore((state) => state.cycleViewMode);

  // SHIFT + ` toggles the dev render panel. Bypasses the modal guard so it
  // can be opened on top of any UI; still ignored while typing in inputs.
  useEffect(() => {
    const handleDevToggle = (e: KeyboardEvent) => {
      if (!e.shiftKey) return;
      if (e.key !== '`' && e.key !== '~') return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      e.preventDefault();
      const cur = useGameStore.getState().renderDebug.showDevPanel;
      updateRenderDebug({ showDevPanel: !cur });
    };
    window.addEventListener('keydown', handleDevToggle);
    return () => window.removeEventListener('keydown', handleDevToggle);
  }, [updateRenderDebug]);

  // Number key hotkeys for bottom action bar
  useEffect(() => {
    const handleHotkey = (e: KeyboardEvent) => {
      // Don't fire hotkeys when a modal is open or typing in an input
      if (showInstructions || showSettings || activePort || hailNpc) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.key) {
        case '1': // Learn
          sfxClick();
          setShowLearn(true);
          break;
        case '2': // Help
          sfxClick();
          setShowHelp(true);
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
          setShowQuests(prev => !prev);
          break;
        case '7': // Navigate (world map)
          toggleWorldMap();
          break;
      }
    };
    window.addEventListener('keydown', handleHotkey);
    return () => window.removeEventListener('keydown', handleHotkey);
  }, [showInstructions, showSettings, activePort, hailNpc, paused, setPaused, cycleViewMode, toggleWorldMap]);

  const activeLeadCount = leads.filter((lead) => lead.status === 'active').length;
  const knownCommodityCount = Object.values(knowledgeState).filter((level) => level > 0).length;
  const cargoUsed = Object.values(cargo).reduce((sum, qty) => sum + qty, 0);
  if (initialCargoUsedRef.current === null) initialCargoUsedRef.current = cargoUsed;
  if (initialCrewCountRef.current === null) initialCrewCountRef.current = crew.length;
  if (initialJournalCountRef.current === null) initialJournalCountRef.current = journalEntries.length;
  if (initialKnownCommodityCountRef.current === null) initialKnownCommodityCountRef.current = knownCommodityCount;
  const currentPortName = getWorldPortById(currentWorldPortId)?.name ?? 'this coast';
  const suppressNudges = startupOverlayActive || showLearn || showHelp || showSettings || showDashboard || showLocalMap || showWorldMap || !!activePort || !!hailNpc;
  const hasBroadsideCannons = stats.armament.some((weapon) => !WEAPON_DEFS[weapon].aimable);
  const initialJournalCount = initialJournalCountRef.current ?? journalEntries.length;
  const initialKnownCommodityCount = initialKnownCommodityCountRef.current ?? knownCommodityCount;
  const dashboardChanged = stats.hull < stats.maxHull
    || cargoUsed !== initialCargoUsedRef.current
    || crew.length !== initialCrewCountRef.current;
  const journalChanged = knownCommodityCount > initialKnownCommodityCount
    || journalEntries.length > initialJournalCount;
  const activeNudge: NudgeId | null = !suppressNudges && collisionShipDesc && !combatMode && !anchored && playerMode === 'ship' && !seenNudges.has('hostile-fight')
    ? 'hostile-fight'
    : !suppressNudges && combatMode && playerMode === 'ship' && hasBroadsideCannons && !seenNudges.has('broadside-elevation')
      ? 'broadside-elevation'
      : !suppressNudges && voyageBegun && activeLeadCount > 0 && !showQuests && !seenNudges.has('open-commissions')
        ? 'open-commissions'
        : !suppressNudges && voyageBegun && activeLeadCount > 0 && seenNudges.has('open-commissions') && !seenNudges.has('open-navigation')
          ? 'open-navigation'
          : !suppressNudges && isMobile && voyageBegun && dashboardChanged && !seenNudges.has('open-dashboard')
            ? 'open-dashboard'
            : !suppressNudges && voyageBegun && journalChanged && !seenNudges.has('open-journal')
              ? 'open-journal'
              : null;

  const hullDamageSeverity = hullDamagePulse?.severity ?? 0;
  const hullDamageHudMotion = hullDamagePulse && !reduceMotion
    ? {
        x: [0, -4 * hullDamageSeverity, 3 * hullDamageSeverity, -2 * hullDamageSeverity, 0],
        y: [0, 1.5 * hullDamageSeverity, -1 * hullDamageSeverity, 0],
      }
    : { x: 0, y: 0 };

  return (
    <div
      className="absolute inset-0 z-[60] pointer-events-none flex flex-col justify-between font-sans text-white text-shadow-sm select-none"
      style={{
        paddingTop: 'calc(1rem + var(--sai-top))',
        paddingRight: 'calc(1rem + var(--sai-right))',
        paddingBottom: 'calc(1rem + var(--sai-bottom))',
        paddingLeft: 'calc(1rem + var(--sai-left))',
        transform: 'translateZ(0)',
        willChange: 'transform',
      }}
    >
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
      <div className={isMobile ? 'flex flex-col items-stretch gap-2' : 'flex justify-between items-start'}>
        {isMobile && (
          <div className="pointer-events-auto grid grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-2">
            <AudioMuteButton />
            <button
              type="button"
              onClick={() => { sfxOpen(); setShowWorldMap(true); }}
              className="min-w-0 justify-self-center rounded-full border border-[#d7c08a]/25 bg-[#0a0e18]/62 px-4 py-2 text-center shadow-[0_6px_18px_rgba(0,0,0,0.35)] backdrop-blur-md active:scale-[0.99] transition-transform"
              title={`${currentPortName} — open world map`}
            >
              <span className="flex min-w-0 items-center justify-center gap-2">
                <span className="h-3 w-4 shrink-0 rounded-[1px] bg-red-700 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.16)]" />
                <span className="truncate text-[18px] font-bold leading-none text-[#f5ebd5]" style={{ fontFamily: '"Fraunces", serif' }}>
                  {currentPortName}
                </span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => { sfxOpen(); setShowSettings(true); }}
              aria-label="Settings"
              title="Settings"
              className="relative h-11 w-11 rounded-full flex items-center justify-center justify-self-end
                bg-[#1a1e2e]/90 border-2 border-[#4a4535]/60 text-[#9a9070]
                shadow-[inset_0_2px_4px_rgba(0,0,0,0.5),0_2px_8px_rgba(0,0,0,0.55)]
                transition-all active:scale-95"
            >
              <Settings size={16} />
            </button>
          </div>
        )}
        <motion.div
          animate={hullDamageHudMotion}
          transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}
          className={`relative overflow-hidden bg-[#0a0e18]/70 backdrop-blur-xl rounded-xl border pointer-events-auto
            shadow-[0_8px_32px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.04)]
            ${isMobile ? 'w-full' : ''}`}
          style={{
            borderColor: combatHudTone?.border ?? 'rgba(42,45,58,0.5)',
            boxShadow: combatHudTone
              ? `0 8px 32px rgba(0,0,0,0.42), 0 0 24px ${combatHudTone.soft}, inset 0 1px 0 rgba(255,255,255,0.05)`
              : '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)',
          }}
        >
          {combatHudTone && (
            <div
              className="pointer-events-none absolute inset-x-0 top-0 h-[2px]"
              style={{ background: `linear-gradient(90deg, transparent, ${combatHudTone.border}, transparent)` }}
            />
          )}
          {isMobile ? (
            <button
              type="button"
              onClick={() => { sfxOpen(); setDashboardState({}); }}
              className="block w-full text-left active:scale-[0.99] transition-transform"
              title="Open ship dashboard"
            >
              <div className="flex items-center gap-2 px-2.5 py-2">
                {(() => {
                  const moodRingColor = captainExpression === 'Friendly' ? '#22c55e'
                    : captainExpression === 'Smug' ? '#eab308'
                    : captainExpression === 'Fierce' ? '#ef4444'
                    : captainExpression === 'Rage' ? '#dc2626'
                    : captainExpression === 'Stern' ? '#f97316'
                    : captainExpression === 'Melancholy' ? '#6366f1'
                    : captainExpression === 'Curious' ? '#06b6d4'
                    : captain && captain.morale >= 85 ? '#22c55e'
                    : captain && captain.morale <= 25 ? '#ef4444'
                    : '#8b7a5e';
                  const ringColor = combatHudTone?.ring ?? moodRingColor;
                  return (
                    <div
                      className="rounded-full bg-[#1a1e2e] flex items-center justify-center shrink-0 overflow-hidden"
                      style={{
                        width: 42,
                        height: 42,
                        border: `2px solid ${ringColor}`,
                        boxShadow: `0 0 10px ${ringColor}55`,
                      }}
                    >
                      {captain ? (
                        <CrewPortraitSquare
                          member={captain}
                          size={38}
                          expressionOverride={combatMode && playerMode === 'ship' ? 'Rage' : captainExpression}
                        />
                      ) : (
                        <Users size={18} className="text-amber-400/80" />
                      )}
                    </div>
                  );
                })()}

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <FactionFlag nationality={ship.flag} size={11} />
                    <span className="text-[9px] font-semibold tracking-[0.14em] uppercase text-amber-200/85 truncate">
                      {FACTIONS[ship.flag].shortName}
                    </span>
                    <span className="text-slate-600" aria-hidden>·</span>
                    <span className="text-[11px] font-medium text-slate-300 tabular-nums whitespace-nowrap">
                      {formatTime(timeOfDay)}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 text-amber-400 font-bold tabular-nums">
                    <Coins size={14} className="text-amber-500" />
                    <ValueFlash value={gold} upColor="#fde68a" downColor="#f59e0b">
                      {gold.toLocaleString()}
                    </ValueFlash>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-1.5 border-t border-[#3a3530]/30 px-2.5 py-1.5">
                <MobileStatBar icon={<Shield size={11} />} value={stats.hull} max={stats.maxHull} color={statColors.hull} />
                <MobileStatBar icon={<Users size={11} />} value={Math.round(crew.reduce((sum, c) => sum + c.morale, 0) / (crew.length || 1))} max={100} color={statColors.morale} />
                <MobileStatBar icon={<Anchor size={11} />} value={cargoUsed} max={stats.cargoCapacity} color={statColors.cargo} />
              </div>
            </button>
          ) : (
            <>
          {/* Top section — portrait on the left, right column holds the
              identity strip over the info row (gold/food · time · crew). */}
          <div className="flex items-stretch border-b border-[#3a3530]/30 gap-3 px-4 py-3">
            {(() => {
              // Ring color reflects captain's current expression/mood
              const moodRingColor = captainExpression === 'Friendly' ? '#22c55e'
                : captainExpression === 'Smug' ? '#eab308'
                : captainExpression === 'Fierce' ? '#ef4444'
                : captainExpression === 'Rage' ? '#dc2626'
                : captainExpression === 'Stern' ? '#f97316'
                : captainExpression === 'Melancholy' ? '#6366f1'
                : captainExpression === 'Curious' ? '#06b6d4'
                : captain && captain.morale >= 85 ? '#22c55e'
                : captain && captain.morale <= 25 ? '#ef4444'
                : '#8b7a5e';
              const ringColor = combatHudTone?.ring ?? moodRingColor;
              const glowColor = combatHudTone?.glow ?? (captainExpression ? ringColor + '60' : 'transparent');
              const idleGlowSize = combatHudTone ? '22px' : captainExpression ? '12px' : '4px';
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
                    btn.style.boxShadow = `inset 0 2px 4px rgba(0,0,0,0.5), 0 0 ${idleGlowSize} ${glowColor}`;
                    btn.style.transform = 'scale(1)';
                  }}
                  className="rounded-full bg-[#1a1e2e] flex items-center justify-center shrink-0 overflow-hidden
                    transition-all duration-300 active:scale-95"
                  style={{
                    width: isMobile ? 52 : 72,
                    height: isMobile ? 52 : 72,
                    border: `3px solid ${ringColor}`,
                    boxShadow: `inset 0 2px 4px rgba(0,0,0,0.5), 0 0 ${idleGlowSize} ${glowColor}`,
                  }}
                  title={captain ? `${captain.name} — Ship Dashboard` : 'Ship Dashboard'}
                >
                  {captain ? (
                    <CrewPortraitSquare
                      member={captain}
                      size={isMobile ? 46 : 64}
                      expressionOverride={combatMode && playerMode === 'ship' ? 'Rage' : captainExpression}
                    />
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
                  data-testid="open-world-map"
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
          <div className="flex items-center gap-5 px-4 py-2.5">
            <StatBar icon={<Shield size={15} />} label="Ship" value={stats.hull} max={stats.maxHull} color={statColors.hull}
              active={expandedStat === 'hull'} onClick={() => setExpandedStat(expandedStat === 'hull' ? null : 'hull')} />
            <StatBar icon={<Users size={15} />} label="Morale" value={Math.round(crew.reduce((sum, c) => sum + c.morale, 0) / (crew.length || 1))} max={100} color={statColors.morale}
              active={expandedStat === 'morale'} onClick={() => setExpandedStat(expandedStat === 'morale' ? null : 'morale')} />
            <StatBar icon={<Anchor size={15} />} label="Cargo" value={cargoUsed} max={stats.cargoCapacity} color={statColors.cargo}
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
            </>
          )}
        </motion.div>

        {/* Minimap (top-right) — desktop keeps the full navigation/debug
            control stack. Mobile hides the minimap by default and uses the
            header + bottom Navigate button instead. */}
        {!isMobile && (
        <div className="flex flex-col pointer-events-auto items-end gap-3">
          <div className="flex items-center gap-2">
            <AudioMuteButton />
            <button
              type="button"
              onClick={() => { sfxOpen(); setShowSettings(true); }}
              onMouseEnter={sfxHover}
              aria-label="Settings"
              title="Settings"
              className="group relative w-11 h-11 rounded-full flex items-center justify-center
                bg-[#1a1e2e] border-2 border-[#4a4535]/60 text-[#8a8060] hover:text-slate-200 hover:border-slate-400/45
                shadow-[inset_0_2px_4px_rgba(0,0,0,0.5),inset_0_-1px_2px_rgba(255,255,255,0.05),0_2px_8px_rgba(0,0,0,0.6)]
                transition-all active:scale-95"
            >
              <Settings size={16} />
              <span className="absolute z-[80] -bottom-7 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-[#0b1120] border border-slate-700/50 rounded text-[9px] tracking-[0.12em] uppercase text-slate-400 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                Settings
              </span>
            </button>
          </div>
          {minimapEnabled && (
            <div
              className="relative group rounded-full transition-shadow duration-300"
              style={combatHudTone ? { boxShadow: `0 0 18px ${combatHudTone.soft}, 0 0 0 1px ${combatHudTone.border}` } : undefined}
            >
              <Minimap onClick={toggleLocalMap} size={172} />
              <div
                className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-slate-900/80 rounded text-amber-400 font-bold uppercase tracking-wider whitespace-nowrap pointer-events-none px-2 py-0.5 text-[9px] opacity-0 group-hover:opacity-100 transition-opacity duration-200"
              >
                Click for Map
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
                <RotatingWindIcon />
                <span className="absolute z-[80] -bottom-7 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-[#0b1120] border border-slate-700/50 rounded text-[9px] tracking-[0.12em] uppercase text-slate-400 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                  Wind
                </span>
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
                  <span className="absolute z-[80] -bottom-7 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-[#0b1120] border border-slate-700/50 rounded text-[9px] tracking-[0.12em] uppercase text-slate-400 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                    {cityFieldOverlayEnabled ? 'Overlay On' : 'Overlay'}
                  </span>
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
              <button
                onClick={() => {
                  sfxClick();
                  if (plumbBobsEnabled && poiBeaconsEnabled) {
                    updateRenderDebug({ poiBeacons: false });
                  } else if (plumbBobsEnabled) {
                    updateRenderDebug({ sacredMarkers: false });
                  } else {
                    updateRenderDebug({ sacredMarkers: true, poiBeacons: true });
                  }
                }}
                aria-pressed={plumbBobsEnabled || poiBeaconsEnabled}
                className={`group relative w-11 h-11 rounded-full flex items-center justify-center
                  bg-[#1a1e2e] border-2 border-[#4a4535]/60 text-[#8a8060] hover:text-[#c084fc] hover:border-[#c084fc]/40
                  shadow-[inset_0_2px_4px_rgba(0,0,0,0.5),inset_0_-1px_2px_rgba(255,255,255,0.05),0_2px_8px_rgba(0,0,0,0.6)]
                  transition-all active:scale-95`}
                title={
                  plumbBobsEnabled && poiBeaconsEnabled
                    ? 'Hide POI beacons'
                    : plumbBobsEnabled
                      ? 'Hide all beacons'
                      : 'Show all beacons'
                }
              >
                <Diamond size={15} />
                <span className="absolute z-[80] -bottom-7 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-[#0b1120] border border-slate-700/50 rounded text-[9px] tracking-[0.12em] uppercase text-slate-400 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                  {plumbBobsEnabled || poiBeaconsEnabled ? 'Hide Beacons' : 'Show Beacons'}
                </span>
              </button>
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

        </div>
        )}
      </div>

      {/* Port-map marker (top-center, desktop only) — tells the player which
          local port map they're on, plus faction standing and heading. Reads
          like a caption on a period sea chart: minimal frame, hierarchy in
          typography. Hidden on mobile and whenever any modal overlay is up. */}
      <AnimatePresence>
        {!isMobile && !startupOverlayActive && !showLocalMap && !showWorldMap
          && !activePort && !showDashboard && (playerMode === 'ship' || playerMode === 'walking')
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
                  style={combatHudTone ? { background: `linear-gradient(90deg, transparent, ${combatHudTone.border})` } : undefined}
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
                      combatHudTone
                        ? `0 1px 2px rgba(0,0,0,0.9), 0 0 10px rgba(0,0,0,0.75), 0 0 22px ${combatHudTone.glow}`
                        : '0 1px 2px rgba(0,0,0,0.9), 0 0 10px rgba(0,0,0,0.75), 0 0 24px rgba(0,0,0,0.45)',
                    paddingLeft: '0.26em', // optically center the letter-spaced word
                    color: combatHudTone ? '#fff2f2' : undefined,
                  }}
                >
                  {port.name}
                </span>
                <span
                  className="h-px w-12 bg-gradient-to-l from-transparent to-slate-300/35
                    group-hover:to-amber-300/55 transition-colors duration-300"
                  style={combatHudTone ? { background: `linear-gradient(270deg, transparent, ${combatHudTone.border})` } : undefined}
                  aria-hidden
                />
              </span>
              {combatHudTone && (
                <span
                  className="rounded-md border px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.18em]"
                  style={{
                    borderColor: combatHudTone.border,
                    background: combatHudTone.soft,
                    color: combatHudTone.ring,
                    textShadow: `0 0 8px ${combatHudTone.glow}`,
                  }}
                >
                  {combatHudTone.label}
                </span>
              )}
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

      {/* Combat / Hunting HUD */}
      <AnimatePresence>
        {combatMode && <CombatHud />}
      </AnimatePresence>

      <AnimatePresence>
        {!startupOverlayActive && playerMode === 'ship' && <IncomingFireIndicatorHud />}
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

      {/* Building Entry Toast — walking mode, non-market buildings */}
      <AnimatePresence>
        {activeBuildingToast && playerMode === 'walking' && !activePort && !activeBuildingDetail && (
          <BuildingToast
            key={activeBuildingToast.building.id}
            building={activeBuildingToast.building}
            isMobile={isMobile}
            onEnter={() => {
              sfxOpen();
              setActiveBuildingDetail(activeBuildingToast);
              setActiveBuildingToast(null);
            }}
          />
        )}
      </AnimatePresence>

      {!startupOverlayActive && activeBuildingDetail && (
        <Suspense fallback={null}>
          <BuildingDetailModal
            building={activeBuildingDetail.building}
            port={activeBuildingDetail.port}
            onDismiss={() => setActiveBuildingDetail(null)}
          />
        </Suspense>
      )}

      {/* POI Walk-up Toast — walking mode, hand-authored sites */}
      <AnimatePresence>
        {activePOIToast && playerMode === 'walking' && !activePort && !activePOI && (
          <POIToast
            key={activePOIToast.poi.id}
            poi={activePOIToast.poi}
            isMobile={isMobile}
            onEnter={() => setActivePOI(activePOIToast.poi)}
          />
        )}
      </AnimatePresence>

      {/* POI Modal — opened from POIToast, closed via setActivePOI(null) */}
      {!startupOverlayActive && activePOI && (
        <Suspense fallback={null}>
          <POIModal poi={activePOI} onDismiss={() => setActivePOI(null)} />
        </Suspense>
      )}

      {!startupOverlayActive && activeCrewTrouble && (
        <Suspense fallback={null}>
          <CrewTroubleModal event={activeCrewTrouble} />
        </Suspense>
      )}

      {/* Port Trading Modal */}
      {!startupOverlayActive && activePort && (
        <Suspense fallback={null}>
          <PortModal
            initialTab={portEntryTab}
            onDismiss={() => {
              if (activePort) dismissedPortRef.current = activePort.id;
              setPortEntryTab(undefined);
              setActivePort(null);
            }}
          />
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
            context={hailContext}
            onClose={() => {
              sfxClose();
              closeHail();
            }}
          />
        )}
      </AnimatePresence>

      <UiNudge
        id="open-commissions"
        active={activeNudge === 'open-commissions'}
        title="First Route"
        body="Open Commissions for a concrete trade goal."
        targetSelector="[data-nudge-target='commissions']"
        tone="amber"
        onDismiss={dismissNudge}
      />
      <UiNudge
        id="hostile-fight"
        active={activeNudge === 'hostile-fight'}
        title="Threat Nearby"
        body="Use Fight to arm your weapons. Stand down when the danger passes."
        targetSelector="[data-nudge-target='fight']"
        tone="red"
        onDismiss={dismissNudge}
      />
      <UiNudge
        id="broadside-elevation"
        active={activeNudge === 'broadside-elevation'}
        title="Hold Space to Aim"
        body="Hold SPACE and use Q or R to fire to port or starboard with cannon."
        targetSelector="[data-nudge-target='broadside-elevation']"
        tone="red"
        onDismiss={dismissNudge}
      />
      <UiNudge
        id="open-navigation"
        active={activeNudge === 'open-navigation'}
        title="Choose a Route"
        body="Open Navigate to plot the next leg after choosing a commission."
        targetSelector="[data-nudge-target='navigation']"
        tone="amber"
        onDismiss={dismissNudge}
      />
      <UiNudge
        id="open-dashboard"
        active={activeNudge === 'open-dashboard'}
        title="Check the Ship"
        body="Open Dashboard to review hull, crew, cargo, and mounted weapons."
        targetSelector="[data-nudge-target='dashboard']"
        tone="amber"
        onDismiss={dismissNudge}
      />
      <UiNudge
        id="open-journal"
        active={activeNudge === 'open-journal'}
        title="Read the Journal"
        body="Open Journal to review discoveries, leads, and important notices."
        targetSelector="[data-nudge-target='journal']"
        tone="amber"
        onDismiss={dismissNudge}
      />

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
          />
        );

        return (
          <div
            className="absolute right-4 flex flex-col gap-3 items-end pointer-events-none"
            style={{
              right: 'calc(1rem + var(--sai-right))',
              bottom: isMobile ? 'calc(5.75rem + var(--sai-bottom))' : '5rem',
            }}
          >
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

      {/* Dev: rest-at-inn preview, triggered from RenderTestPanel */}
      <DevRestPreview />


      {/* Fullscreen Map Overlay */}
      <AnimatePresence>
        {showLocalMap && (
          <Suspense fallback={null}>
            <WorldMap
              onClose={() => setShowLocalMap(false)}
              onOpenWorldMap={() => {
                setShowLocalMap(false);
                setShowWorldMap(true);
              }}
            />
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

      {/* Departure curtain — masks canvas mount + terrain gen after Set Sail */}
      <DepartureCurtain active={showVoyageCurtain} />

      {/* Learn Panel — contextual Wikipedia reader */}
      {showLearn && (
        <Suspense fallback={null}>
          <LearnPanel open={showLearn} onClose={() => setShowLearn(false)} />
        </Suspense>
      )}

      {/* Journal Panel (compact, above button) */}
      {showJournal && (
        <Suspense fallback={null}>
          <JournalPanel open={showJournal} onClose={() => setShowJournal(false)} />
        </Suspense>
      )}

      {/* Quests Panel — slide-out, sister to Journal. Renders above the
          Quests button. */}
      <QuestsPanel
        open={showQuests}
        onClose={() => setShowQuests(false)}
        dockOffset={!isMobile && showJournal}
        onOpenChart={() => {
          dismissNudge('open-navigation');
          setShowQuests(false);
          setShowWorldMap(true);
        }}
      />

      <HelpModal
        open={showHelp}
        onClose={() => setShowHelp(false)}
        playerMode={playerMode}
        combatMode={combatMode}
        anchored={anchored}
        isMobile={isMobile}
        activePortName={activePort?.name ?? currentPortName}
        hull={stats.hull}
        maxHull={stats.maxHull}
        provisions={provisions}
        cargoUsed={cargoUsed}
        cargoCapacity={stats.cargoCapacity}
        gold={gold}
        activeLeadCount={activeLeadCount}
        knownCommodityCount={knownCommodityCount}
      />

      {/* Quest Toast — top-center event announcements (resolved / expired /
          failed for now; offers wired in once sources land). */}
      <QuestToast />

      {/* Journal + Quests Buttons — desktop: lower-left pair. Mobile journal
          is in the top-right cluster; mobile quests is in the action-bar
          overflow popover. */}
      {!isMobile && (
        <div
          className="absolute pointer-events-auto flex items-center gap-2"
          style={{
            left: 'calc(1rem + var(--sai-left))',
            bottom: 'calc(1rem + var(--sai-bottom))',
          }}
        >
          <button
            onClick={() => { sfxClick(); dismissNudge('open-journal'); setShowJournal(!showJournal); }}
            aria-pressed={showJournal}
            data-nudge-target="journal"
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

          <QuestsBarButton
            active={showQuests}
            onClick={() => { sfxClick(); setShowQuests(!showQuests); }}
          />
        </div>
      )}

      {/* Bottom Action Bar — Sunless Sea style.
          Desktop: 7 buttons in one row.
          Mobile keeps the core controls visible and tucks secondary panels into
          the overflow popover. */}
      <div
        data-testid="mobile-action-bar"
        className="absolute left-1/2 -translate-x-1/2 pointer-events-auto"
        style={{
          bottom: 'calc(0.75rem + var(--sai-bottom))',
          maxWidth: 'calc(100vw - var(--sai-left) - var(--sai-right) - 1rem)',
        }}
      >
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
                <ActionBarButton icon={<GraduationCap size={13} />} label="Learn" accentColor="#60a5fa" glowColor="96,165,250" onClick={() => { setShowLearn(true); setShowOverflowMenu(false); }} />
                <ActionBarButton icon={<HelpCircle size={13} />} label="Help" accentColor="#a78bfa" glowColor="167,139,250" onClick={() => { setShowHelp(true); setShowOverflowMenu(false); }} />
                <ViewModeButton />
                <ActionBarButton icon={<BookOpen size={13} />} label="Journal" accentColor="#f59e0b" glowColor="245,158,11" nudgeTarget="journal" onClick={() => { sfxClick(); dismissNudge('open-journal'); setShowJournal(prev => !prev); setShowOverflowMenu(false); }} />
                <ActionBarButton icon={<Scroll size={13} />} label="Commissions" accentColor="#fbbf24" glowColor="251,191,36" nudgeTarget="commissions" onClick={() => { sfxClick(); dismissNudge('open-commissions'); setShowQuests(prev => !prev); setShowOverflowMenu(false); }} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Semi-transparent rectangular landing pad */}
        <div className={`relative bg-[#0a0e18]/50 backdrop-blur-md border border-[#2a2d3a]/40 rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.4)] ${isMobile ? 'px-2.5 py-2' : 'px-4 py-2.5'}`}>
          {/* Horizontal connecting rail */}
          <div className="absolute top-1/2 left-5 right-5 h-[2px] -translate-y-1/2 bg-gradient-to-r from-[#2a2520]/30 via-[#3a3530]/50 to-[#2a2520]/30 rounded-full" />
          <div className={`relative flex items-center ${isMobile ? 'gap-1.5' : 'gap-3'}`}>
            {!isMobile && (
              <>
                {/* Left group: Learn - Help - combat stance */}
                <ActionBarButton icon={<GraduationCap size={13} />} label="Learn" hotkey="1" accentColor="#60a5fa" glowColor="96,165,250" onClick={() => setShowLearn(true)} />
                <ActionBarButton icon={<HelpCircle size={13} />} label="Help" hotkey="2" accentColor="#a78bfa" glowColor="167,139,250" onClick={() => setShowHelp(true)} />
                <ActionBarButton
                  icon={playerMode === 'ship' ? <Swords size={13} /> : <Crosshair size={13} />}
                  label={playerMode === 'ship' ? (combatMode ? 'Stand Down' : 'Fight') : (combatMode ? 'Holster' : 'Hunt')}
                  hotkey="F"
                  accentColor={playerMode === 'ship' ? '#f87171' : '#f59e0b'}
                  glowColor={playerMode === 'ship' ? '248,113,113' : '245,158,11'}
                  active={combatMode}
                  nudgeTarget="fight"
                  onClick={toggleCombatMode}
                />
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
                <ActionBarButton icon={<Scroll size={13} />} label="Commissions" hotkey="6" accentColor="#fbbf24" glowColor="251,191,36" nudgeTarget="commissions" onClick={() => { sfxClick(); dismissNudge('open-commissions'); setShowQuests(prev => !prev); }} />
                <ActionBarButton icon={<Compass size={13} />} label="Navigate" hotkey="7" accentColor="#f87171" glowColor="248,113,113" nudgeTarget="navigation" onClick={() => { dismissNudge('open-navigation'); toggleWorldMap(); }} />
              </>
            )}
            {isMobile && (
              <>
                <ActionBarButton
                  icon={playerMode === 'ship' ? <Swords size={13} /> : <Crosshair size={13} />}
                  label={playerMode === 'ship' ? (combatMode ? 'Stand Down' : 'Fight') : (combatMode ? 'Holster' : 'Hunt')}
                  accentColor={playerMode === 'ship' ? '#f87171' : '#f59e0b'}
                  glowColor={playerMode === 'ship' ? '248,113,113' : '245,158,11'}
                  active={combatMode}
                  nudgeTarget="fight"
                  onClick={toggleCombatMode}
                />
                <ActionBarButton icon={<Compass size={13} />} label="Navigate" accentColor="#f87171" glowColor="248,113,113" nudgeTarget="navigation" onClick={() => { dismissNudge('open-navigation'); toggleWorldMap(); }} />
                <ActionBarButton icon={<Users size={13} />} label="Dashboard" accentColor="#fbbf24" glowColor="251,191,36" nudgeTarget="dashboard" onClick={() => { dismissNudge('open-dashboard'); sfxOpen(); setDashboardState({}); }} />
                <ActionBarButton icon={<MoreHorizontal size={13} />} label="More" accentColor="#9ca3af" glowColor="156,163,175" onClick={() => setShowOverflowMenu(v => !v)} />
              </>
            )}
          </div>
        </div>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <Suspense fallback={null}>
          {settingsV2
            ? <SettingsModalV2 open={showSettings} onClose={() => setShowSettings(false)} />
            : <SettingsModal open={showSettings} onClose={() => setShowSettings(false)} />
          }
        </Suspense>
      )}

      {startupOverlayActive && (
        <div
          className="fixed inset-0 z-40 pointer-events-none"
          style={{ background: '#0a0908' }}
        />
      )}

      {/* Instructions Overlay */}
      <AnimatePresence>
        {showInstructions && (
          SPLASH_VARIANT !== 'legacy' ? (
            <ClaudeSplashGlobe
              ready={splashComplete}
              loadingMessage={loadingMessage}
              loadingProgress={loadingProgress}
              shipName={ship.name}
              captainName={captain?.name ?? 'Captain Blackwood'}
              crewCount={crew.length}
              portCount={portCount}
              gold={gold}
              onStart={closeOpeningOverlay}
            />
          ) : (
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
          )

        )}
      </AnimatePresence>

      {/* Commission of Voyage — shown after splash dismisses */}
      <AnimatePresence>
        {showCommission && (
          <EventModalMobile onDismiss={closeCommission} worldReady={worldReady} />
        )}
      </AnimatePresence>

      {/* Intro fade — always mounted (so the in/out transitions actually run),
          but invisible + click-through when idle. Sits above the commission
          modal so the modal fades through black with the rest of the world. */}
      <div
        aria-hidden
        onTransitionEnd={handleIntroFadeEnd}
        style={{
          position: 'fixed',
          inset: 0,
          background: '#000',
          opacity: introFadePhase === 'in' ? 1 : 0,
          // Asymmetric: snappy fade-in to black, slow elegant fade-out to game
          transition: introFadePhase === 'in'
            ? 'opacity 0.9s cubic-bezier(0.4, 0, 0.6, 1)'
            : 'opacity 2.6s cubic-bezier(0.33, 0, 0.45, 1)',
          pointerEvents: introFadePhase === 'in' ? 'auto' : 'none',
          zIndex: 9999,
        }}
      />
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
    <div className="absolute left-4 top-24 z-40 flex max-h-[calc(100vh-7rem)] w-[280px] flex-col overflow-y-auto overscroll-contain rounded-2xl border border-white/[0.08] bg-[#08101a]/88 p-4 shadow-[0_18px_42px_rgba(0,0,0,0.45)] backdrop-blur-md pointer-events-auto [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.18)_transparent]">
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
            rain: false,
            algae: false,
            wildlifeMotion: false,
            cloudShadows: false,
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
          label="AO (N8AO)"
          enabled={renderDebug.ao}
          disabled={!renderDebug.postprocessing}
          onToggle={() => updateRenderDebug({ ao: !renderDebug.ao })}
        />
        <RenderToggleRow
          label="Brightness/Contrast"
          enabled={renderDebug.brightnessContrast}
          disabled={!renderDebug.postprocessing}
          onToggle={() => updateRenderDebug({ brightnessContrast: !renderDebug.brightnessContrast })}
        />
        <RenderToggleRow
          label="Hue/Saturation"
          enabled={renderDebug.hueSaturation}
          disabled={!renderDebug.postprocessing}
          onToggle={() => updateRenderDebug({ hueSaturation: !renderDebug.hueSaturation })}
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
          label="Rain"
          enabled={renderDebug.rain}
          onToggle={() => updateRenderDebug({ rain: !renderDebug.rain })}
        />
        <RenderToggleRow
          label="Algae"
          enabled={renderDebug.algae}
          onToggle={() => updateRenderDebug({ algae: !renderDebug.algae })}
        />
        <RenderToggleRow
          label="Reef Caustics"
          enabled={renderDebug.reefCaustics}
          onToggle={() => updateRenderDebug({ reefCaustics: !renderDebug.reefCaustics })}
        />
        <RenderToggleRow
          label="Wildlife Motion"
          enabled={renderDebug.wildlifeMotion}
          onToggle={() => updateRenderDebug({ wildlifeMotion: !renderDebug.wildlifeMotion })}
        />
        <RenderToggleRow
          label="Cloud Shadows"
          enabled={renderDebug.cloudShadows}
          onToggle={() => updateRenderDebug({ cloudShadows: !renderDebug.cloudShadows })}
        />
        <RenderToggleRow
          label="Animal Markers"
          enabled={renderDebug.animalMarkers}
          onToggle={() => updateRenderDebug({ animalMarkers: !renderDebug.animalMarkers })}
        />
        <RenderToggleRow
          label="Kill Transitions (diag)"
          enabled={renderDebug.disableTransitions}
          onToggle={() => updateRenderDebug({ disableTransitions: !renderDebug.disableTransitions })}
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

      <WeatherPanel />
      <ColorGradingPanel />
      <DevRestTester />
    </div>
  );
}

// Weather panel — dev-only override of the climate-rolled weather state. The
// store's RainOverlay + (auto-mode) LUT both read `weather.intensity` and ease
// toward `targetIntensity` in advanceTime, so dragging the target slider gives
// you a live fade. "Snap" skips the easing for instant comparisons; "Re-roll"
// runs the climate dice for the current port.
function WeatherPanel() {
  const weather = useGameStore((s) => s.weather);
  const setWeather = useGameStore((s) => s.setWeather);
  const rerollWeather = useGameStore((s) => s.rerollWeather);
  const currentWorldPortId = useGameStore((s) => s.currentWorldPortId);
  const port = getWorldPortById(currentWorldPortId);
  const climate = port?.climate ?? 'temperate';

  const setKind = (kind: 'clear' | 'rain') => {
    if (kind === 'clear') {
      setWeather({ kind: 'clear', targetIntensity: 0 });
    } else {
      // Default to a moderate downpour when forcing rain on; user can dial in.
      const target = weather.targetIntensity > 0 ? weather.targetIntensity : 0.7;
      setWeather({ kind: 'rain', targetIntensity: target });
    }
  };

  const snap = () => setWeather({ intensity: weather.targetIntensity });

  return (
    <div className="mt-4 rounded-xl border border-white/[0.07] bg-white/[0.03] p-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Weather</div>
          <div className="mt-0.5 text-[11px] text-slate-400">
            <span className="text-slate-200">{port?.name ?? 'open sea'}</span>
            {' · '}
            <span className="text-slate-300">{climate}</span>
            {' · live '}
            <span className="font-mono text-slate-200">{weather.intensity.toFixed(2)}</span>
          </div>
        </div>
        <button
          onClick={rerollWeather}
          className="rounded-full bg-sky-500/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-sky-300 hover:bg-sky-500/25"
        >
          Re-roll
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-1.5">
        {(['clear', 'rain'] as const).map((k) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            className={`rounded-md border px-2 py-1.5 text-[10px] font-medium uppercase tracking-[0.14em] transition-all ${
              weather.kind === k
                ? 'border-amber-600/30 bg-amber-600/18 text-amber-300'
                : 'border-white/[0.08] bg-white/[0.03] text-slate-400 hover:bg-white/[0.06] hover:text-slate-200'
            }`}
          >
            {k}
          </button>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <span className="w-[112px] shrink-0 text-[10px] text-slate-400">Target intensity</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={weather.targetIntensity}
          onChange={(e) => {
            const v = Number(e.target.value);
            // Slider implicitly chooses kind: anything > 0 means rain.
            setWeather({ kind: v > 0 ? 'rain' : 'clear', targetIntensity: v });
          }}
          className="flex-1 accent-amber-500"
        />
        <span className="w-[40px] text-right font-mono text-[10px] text-slate-500">
          {weather.targetIntensity.toFixed(2)}
        </span>
      </div>

      <div className="mt-2 flex justify-end">
        <button
          onClick={snap}
          className="rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-slate-400 hover:bg-white/[0.06] hover:text-slate-200"
        >
          Snap to target
        </button>
      </div>
    </div>
  );
}

// Procedural LUT panel — opt-in color grading. Off by default so the shipped
// look is unchanged. Presets are tuned for Indian Ocean / Atlantic seasons;
// each slider is a direct parameter into buildLUT().
const LUT_SLIDERS: { key: keyof LUTParams; label: string; min: number; max: number; step: number }[] = [
  { key: 'temperature',     label: 'Temperature',      min: -1,   max: 1,   step: 0.01 },
  { key: 'tint',            label: 'Tint (mag↔grn)',   min: -1,   max: 1,   step: 0.01 },
  { key: 'saturation',      label: 'Saturation',       min:  0,   max: 2,   step: 0.01 },
  { key: 'contrast',        label: 'Contrast',         min:  0,   max: 2,   step: 0.01 },
  { key: 'shadowWarmth',    label: 'Shadow Warmth',    min: -1,   max: 1,   step: 0.01 },
  { key: 'highlightWarmth', label: 'Highlight Warmth', min: -1,   max: 1,   step: 0.01 },
  { key: 'shadowLift',      label: 'Shadow Lift',      min: -0.5, max: 0.5, step: 0.005 },
  { key: 'highlightRoll',   label: 'Highlight Roll',   min: -0.5, max: 0.5, step: 0.005 },
];

function ColorGradingPanel() {
  const lutEnabled = useGameStore((s) => s.renderDebug.lutEnabled);
  const lutPreset = useGameStore((s) => s.renderDebug.lutPreset);
  const lutParams = useGameStore((s) => s.renderDebug.lutParams);
  const lutMode = useGameStore((s) => s.renderDebug.lutMode);
  const weatherIntensity = useGameStore((s) => s.weather.intensity);
  const weatherKind = useGameStore((s) => s.weather.kind);
  const updateRenderDebug = useGameStore((s) => s.updateRenderDebug);
  const isAuto = lutMode === 'auto';

  const applyPreset = (id: LUTPresetId) => {
    updateRenderDebug({
      lutEnabled: true,
      lutPreset: id,
      lutParams: { ...LUT_PRESETS[id] },
    });
  };

  const setParam = (key: keyof LUTParams, value: number) => {
    updateRenderDebug({
      lutPreset: 'custom',
      lutParams: { ...lutParams, [key]: value },
    });
  };

  return (
    <div className="mt-4 rounded-xl border border-white/[0.07] bg-white/[0.03] p-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Color Grading (LUT)</div>
          <div className="mt-0.5 text-[11px] text-slate-400">
            {isAuto ? (
              <>Auto: weather drives the grade. <span className="text-slate-200">{weatherKind}</span> · intensity <span className="font-mono text-slate-200">{weatherIntensity.toFixed(2)}</span></>
            ) : (
              <>Manual: Preset <span className="text-slate-200">{lutPreset}</span></>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => updateRenderDebug({ lutMode: isAuto ? 'manual' : 'auto' })}
            aria-pressed={isAuto}
            className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${
              isAuto ? 'bg-sky-500/15 text-sky-300' : 'bg-slate-700/40 text-slate-400'
            }`}
          >
            {isAuto ? 'Auto' : 'Manual'}
          </button>
          <button
            onClick={() => updateRenderDebug({ lutEnabled: !lutEnabled })}
            aria-pressed={lutEnabled}
            disabled={isAuto}
            className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${
              lutEnabled ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-700/40 text-slate-400'
            } disabled:opacity-40`}
          >
            {lutEnabled ? 'On' : 'Off'}
          </button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-1.5">
        {(['tropical', 'temperate', 'monsoon'] as LUTPresetId[]).map((id) => (
          <button
            key={id}
            onClick={() => applyPreset(id)}
            disabled={isAuto}
            className={`rounded-md border px-2 py-1.5 text-[10px] font-medium uppercase tracking-[0.14em] transition-all disabled:opacity-40 ${
              lutPreset === id && lutEnabled
                ? 'border-amber-600/30 bg-amber-600/18 text-amber-300'
                : 'border-white/[0.08] bg-white/[0.03] text-slate-400 hover:bg-white/[0.06] hover:text-slate-200'
            }`}
          >
            {id}
          </button>
        ))}
        <button
          onClick={() => updateRenderDebug({
            lutPreset: 'custom',
            lutParams: { ...LUT_NEUTRAL },
          })}
          disabled={isAuto}
          className="rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-slate-400 transition-all hover:bg-white/[0.06] hover:text-slate-200 disabled:opacity-40"
        >
          neutral
        </button>
      </div>

      <div className="mt-3 space-y-1.5" aria-disabled={!lutEnabled || isAuto}>
        {LUT_SLIDERS.map((s) => (
          <div key={s.key} className="flex items-center gap-2">
            <span className="w-[112px] shrink-0 text-[10px] text-slate-400">{s.label}</span>
            <input
              type="range"
              min={s.min}
              max={s.max}
              step={s.step}
              value={lutParams[s.key]}
              onChange={(e) => setParam(s.key, Number(e.target.value))}
              disabled={!lutEnabled || isAuto}
              className="flex-1 accent-amber-500 disabled:opacity-40"
            />
            <span className="w-[40px] text-right font-mono text-[10px] text-slate-500">
              {lutParams[s.key].toFixed(2)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Dev tool — preview the rest-at-inn flow for any port without
// mutating game state. Useful for inspecting per-port night images,
// constellations, and the summary modal.
const REST_TEST_PORT_IDS = Object.keys(PORT_LATITUDES).sort();
function DevRestTester() {
  const setDevRestPreview = useGameStore(s => s.setDevRestPreview);
  const [selectedId, setSelectedId] = useState<string>(REST_TEST_PORT_IDS[0] ?? '');

  return (
    <div className="mt-4 rounded-xl border border-white/[0.07] bg-white/[0.03] p-3">
      <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Rest At Inn</div>
      <div className="mt-1 text-[11px] text-slate-400">
        Preview the sleep overlay + summary for any port. State is not modified.
      </div>
      <div className="mt-2.5 flex gap-2">
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="flex-1 rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-1.5 text-[11px] text-slate-200 outline-none transition-colors hover:bg-white/[0.06] focus:border-amber-400/30"
        >
          {REST_TEST_PORT_IDS.map(id => (
            <option key={id} value={id} className="bg-slate-900">
              {id}
            </option>
          ))}
        </select>
        <button
          onClick={() => { sfxClick(); setDevRestPreview(selectedId); }}
          onMouseEnter={() => sfxHover()}
          className="rounded-md border border-amber-600/30 bg-amber-600/18 px-3 py-1.5 text-[11px] font-medium text-amber-300 transition-all hover:bg-amber-600/25"
        >
          Run
        </button>
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

function HelpModal({
  open,
  onClose,
  playerMode,
  combatMode,
  anchored,
  isMobile,
  activePortName,
  hull,
  maxHull,
  provisions,
  cargoUsed,
  cargoCapacity,
  gold,
  activeLeadCount,
  knownCommodityCount,
}: {
  open: boolean;
  onClose: () => void;
  playerMode: 'ship' | 'walking';
  combatMode: boolean;
  anchored: boolean;
  isMobile: boolean;
  activePortName: string;
  hull: number;
  maxHull: number;
  provisions: number;
  cargoUsed: number;
  cargoCapacity: number;
  gold: number;
  activeLeadCount: number;
  knownCommodityCount: number;
}) {
  const hullRatio = maxHull > 0 ? hull / maxHull : 1;
  const cargoRatio = cargoCapacity > 0 ? cargoUsed / cargoCapacity : 0;

  const advice: string[] = [];
  if (hullRatio < 0.45) advice.push('Repair before a long passage. A damaged hull turns ordinary weather and collisions into a voyage-ending risk.');
  if (provisions < 18) advice.push('Buy provisions soon. Food is a quiet timer: running short hurts crew survival before it looks dramatic.');
  if (cargoRatio > 0.85) advice.push('Sell or lighten cargo before buying more. Full holds make good prices useless.');
  if (activeLeadCount > 0) advice.push('Open Commissions and pick one delivery or sale target. Commissions are the clearest early route to profit.');
  if (knownCommodityCount < 5) advice.push('Prioritize learning goods in ports and conversations. Unknown cargo sells badly and is more vulnerable to fraud.');
  if (combatMode) advice.push(playerMode === 'ship' ? 'Fight mode is for deliberate engagements. Press F again to stand down before docking or navigating.' : 'Hunting mode is useful near wildlife, but lower the weapon before entering buildings.');
  if (anchored) advice.push(isMobile ? 'You are at anchor. Use the sail button or movement controls when you are ready to move again.' : 'You are at anchor. Press Space or W/S when you are ready to move again.');
  if (advice.length === 0) {
    advice.push(playerMode === 'ship'
      ? `You are off ${activePortName}. Dock, check market prices, then use Navigate to choose a short route with goods you recognize.`
      : `You are ashore at ${activePortName}. Walk into markets, forts, shrines, and marked places; prompts appear when you are close enough.`);
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[120] flex items-end justify-center bg-black/35 px-3 pb-[calc(5.25rem+var(--sai-bottom))] pt-[calc(1rem+var(--sai-top))] backdrop-blur-[2px] pointer-events-auto sm:items-center sm:pb-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-modal-title"
            className="w-full max-w-2xl overflow-hidden rounded-xl border border-violet-300/20 bg-[#0a0e18]/95 text-slate-100 shadow-[0_24px_80px_rgba(0,0,0,0.65),inset_0_1px_0_rgba(255,255,255,0.08)]"
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 360, damping: 32 }}
          >
            <div className="flex items-start justify-between gap-4 border-b border-white/10 px-4 py-3">
              <div>
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-violet-300">
                  <HelpCircle size={13} />
                  Captain's Help
                </div>
                <h2 id="help-modal-title" className="mt-1 font-serif text-xl font-semibold text-[#f8ead0]">What to do next</h2>
              </div>
              <button
                onClick={onClose}
                className="rounded-full border border-white/10 bg-white/[0.04] p-2 text-slate-400 transition-colors hover:border-violet-300/30 hover:text-violet-200"
                aria-label="Close help"
              >
                <X size={16} />
              </button>
            </div>

            <div className="grid gap-3 px-4 py-4 sm:grid-cols-[1.05fr_0.95fr]">
              <section className="rounded-lg border border-violet-300/15 bg-violet-300/[0.06] p-3">
                <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-violet-200">Advice now</h3>
                <div className="mt-3 space-y-2">
                  {advice.slice(0, 4).map((item) => (
                    <p key={item} className="rounded-md border border-white/8 bg-black/18 px-3 py-2 text-[13px] leading-relaxed text-slate-200">
                      {item}
                    </p>
                  ))}
                </div>
              </section>

              <section className="rounded-lg border border-white/10 bg-white/[0.035] p-3">
                <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-amber-200">Core loop</h3>
                <ol className="mt-3 space-y-2 text-[13px] leading-relaxed text-slate-300">
                  <li><span className="font-bold text-slate-100">1.</span> Learn what goods are, then what they are worth.</li>
                  <li><span className="font-bold text-slate-100">2.</span> Buy recognized goods where the ledger price is favorable.</li>
                  <li><span className="font-bold text-slate-100">3.</span> Sail to a port that wants them.</li>
                  <li><span className="font-bold text-slate-100">4.</span> Sell, repair, provision the crew, and follow commissions.</li>
                </ol>
              </section>

              <section className="rounded-lg border border-white/10 bg-white/[0.035] p-3 sm:col-span-2">
                <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-200">Controls</h3>
                <div className="mt-3 grid gap-2 text-[12px] text-slate-300 sm:grid-cols-3">
                  {isMobile ? (
                    <>
                      <HelpKey keys="Joystick" label={playerMode === 'ship' ? 'Steer and throttle in joystick mode' : 'Walk'} />
                      {playerMode === 'ship' && <HelpKey keys="Tap water" label="Set heading in tap-steer mode" />}
                      <HelpKey keys="+ / -" label="Zoom camera" />
                    </>
                  ) : (
                    <>
                      <HelpKey keys="W / S" label={playerMode === 'ship' ? 'Sail ahead / reverse' : 'Move forward / back'} />
                      <HelpKey keys="A / D" label={playerMode === 'ship' ? 'Turn port / starboard' : 'Strafe'} />
                      <HelpKey keys="Shift" label={playerMode === 'ship' ? 'Trim sails and tighter turns' : 'Run'} />
                      <HelpKey keys="Z / X" label="Rotate camera" />
                      <HelpKey keys="Mouse wheel" label="Zoom camera" />
                    </>
                  )}
                  <HelpKey keys="E" label={playerMode === 'ship' ? 'Disembark at safe shore' : 'Embark when near ship'} />
                  <HelpKey keys="Space" label={playerMode === 'ship' ? (combatMode ? 'Hold broadside elevation' : 'Drop or weigh anchor') : 'Jump; harvest when prompted'} />
                  <HelpKey keys="F" label="Fight or stand down" />
                  {combatMode && playerMode === 'ship' && <HelpKey keys="Q / R" label="Port / starboard broadside" />}
                  {combatMode && <HelpKey keys="LMB / Fire" label={playerMode === 'ship' ? 'Fire bow weapon' : 'Fire hunting weapon'} />}
                  {combatMode && <HelpKey keys="Tab" label={playerMode === 'ship' ? 'Cycle bow weapon' : 'Swap hunting weapon'} />}
                  {playerMode === 'ship' && <HelpKey keys="C" label="Cast fishing net" />}
                  {playerMode === 'ship' && <HelpKey keys="T" label="Hail nearby ship" />}
                  <HelpKey keys="1-7" label="Bottom action bar" />
                  <HelpKey keys="7" label="Open navigation" />
                  <HelpKey keys="Esc" label="Close panels" />
                </div>
              </section>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function HelpKey({ keys, label }: { keys: string; label: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-white/8 bg-black/16 px-3 py-2">
      <span className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-amber-200">{keys}</span>
      <span className="text-right text-slate-300">{label}</span>
    </div>
  );
}

function UiNudge({
  id,
  active,
  title,
  body,
  targetSelector,
  tone,
  onDismiss,
}: {
  id: NudgeId;
  active: boolean;
  title: string;
  body: string;
  targetSelector: string;
  tone: 'amber' | 'red';
  onDismiss: (id: NudgeId) => void;
}) {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!active) return;

    const update = () => {
      const target = document.querySelector<HTMLElement>(targetSelector);
      setRect(target?.getBoundingClientRect() ?? null);
    };

    update();
    const id = window.setInterval(update, 250);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [active, targetSelector]);

  if (!active || !rect) return null;

  const color = tone === 'red' ? '#f87171' : '#fbbf24';
  const ringPad = 7;
  const ring = {
    left: rect.left - ringPad,
    top: rect.top - ringPad,
    width: rect.width + ringPad * 2,
    height: rect.height + ringPad * 2,
  };
  const tooltipWidth = Math.min(260, Math.max(210, window.innerWidth - 24));
  const placeAbove = rect.top > 120;
  const tooltipLeft = Math.max(12, Math.min(window.innerWidth - tooltipWidth - 12, rect.left + rect.width / 2 - tooltipWidth / 2));
  const tooltipTop = placeAbove ? Math.max(12, rect.top - 96) : Math.min(window.innerHeight - 112, rect.bottom + 18);
  const arrowLeft = Math.max(18, Math.min(tooltipWidth - 18, rect.left + rect.width / 2 - tooltipLeft));

  return (
    <div className="fixed inset-0 z-[115] pointer-events-none">
      <motion.div
        className="absolute rounded-full border-2"
        style={{
          left: ring.left,
          top: ring.top,
          width: ring.width,
          height: ring.height,
          borderColor: `${color}d9`,
          boxShadow: `0 0 0 5px ${color}1c, 0 0 22px ${color}85, inset 0 0 16px ${color}2e`,
        }}
        initial={{ opacity: 0, scale: 0.86 }}
        animate={{ opacity: [0.7, 1, 0.72], scale: [0.96, 1.08, 0.96] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute pointer-events-auto rounded-lg border bg-[#0a0e18]/96 p-3 text-slate-100 shadow-[0_16px_44px_rgba(0,0,0,0.62)] backdrop-blur-xl"
        style={{
          left: tooltipLeft,
          top: tooltipTop,
          width: tooltipWidth,
          borderColor: `${color}66`,
        }}
        initial={{ opacity: 0, y: placeAbove ? 8 : -8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: placeAbove ? 8 : -8, scale: 0.98 }}
      >
        <div
          className={`absolute h-3 w-3 rotate-45 border ${placeAbove ? '-bottom-[7px] border-l-0 border-t-0' : '-top-[7px] border-r-0 border-b-0'} bg-[#0a0e18]`}
          style={{
            left: arrowLeft - 6,
            borderColor: `${color}66`,
          }}
        />
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color }}>
              {title}
            </div>
            <p className="mt-1 text-[13px] leading-snug text-slate-200">{body}</p>
          </div>
          <button
            onClick={() => onDismiss(id)}
            className="shrink-0 rounded-full border border-white/10 bg-white/[0.04] p-1 text-slate-400 transition-colors hover:text-slate-100"
            aria-label="Dismiss tip"
          >
            <X size={13} />
          </button>
        </div>
      </motion.div>
    </div>
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
  const { isMobile } = useIsMobile();
  const accentColor = '#34d399';
  const glowColor = '52,211,153';
  const sizeClass = isMobile ? 'w-10 h-10' : 'w-8 h-8';

  return (
    <button
      onClick={cycleViewMode}
      aria-pressed={viewMode !== 'default'}
      aria-label={`View: ${VIEW_MODE_LABELS[viewMode]}`}
      className={`group relative ${sizeClass} rounded-full flex items-center justify-center
        bg-[#1a1e2e] border-2 border-[#3a3530]/50
        shadow-[inset_0_2px_4px_rgba(0,0,0,0.5),inset_0_-1px_2px_rgba(255,255,255,0.05),0_1px_4px_rgba(0,0,0,0.4)]
        transition-all duration-200 active:scale-95`}
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

function ActionBarButton({
  icon,
  label,
  hotkey,
  accentColor = '#b0a880',
  glowColor = '176,168,128',
  active = false,
  nudgeTarget,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  hotkey?: string;
  accentColor?: string;
  glowColor?: string;
  active?: boolean;
  nudgeTarget?: string;
  onClick?: () => void;
}) {
  const { isMobile } = useIsMobile();
  const sizeClass = isMobile ? 'w-10 h-10' : 'w-8 h-8';

  return (
    <button
      onClick={() => { sfxClick(); onClick?.(); }}
      data-nudge-target={nudgeTarget}
      aria-label={label}
      className={`group relative ${sizeClass} rounded-full flex items-center justify-center
        bg-[#1a1e2e] border-2
        shadow-[inset_0_2px_4px_rgba(0,0,0,0.5),inset_0_-1px_2px_rgba(255,255,255,0.05),0_1px_4px_rgba(0,0,0,0.4)]
        transition-all duration-200 active:scale-95`}
      style={{
        color: active ? accentColor : '#6a6550',
        borderColor: active ? `${accentColor}99` : 'rgba(58,53,48,0.5)',
        boxShadow: active
          ? `inset 0 2px 4px rgba(0,0,0,0.4), inset 0 -1px 3px rgba(255,255,255,0.1), 0 0 14px rgba(${glowColor},0.35), 0 0 4px rgba(${glowColor},0.18)`
          : undefined,
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
        btn.style.color = active ? accentColor : '#6a6550';
        btn.style.borderColor = active ? `${accentColor}99` : 'rgba(58,53,48,0.5)';
        btn.style.boxShadow = active
          ? `inset 0 2px 4px rgba(0,0,0,0.4), inset 0 -1px 3px rgba(255,255,255,0.1), 0 0 14px rgba(${glowColor},0.35), 0 0 4px rgba(${glowColor},0.18)`
          : 'inset 0 2px 4px rgba(0,0,0,0.5), inset 0 -1px 2px rgba(255,255,255,0.05), 0 1px 4px rgba(0,0,0,0.4)';
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
  const cargo = useGameStore((s) => s.cargo);
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
  const armamentLines = Object.entries(armamentSummary);
  const hasRocketRack = stats.armament.includes('fireRocket');
  const hasFalconet = stats.armament.includes('falconet');
  const munitionLines: ReadonlyArray<readonly [string, number, boolean]> = [
    ['Small Shot', cargo['Small Shot'] ?? 0, true],
    ['Cannon Shot', cargo['Cannon Shot'] ?? 0, hasFalconet || stats.armament.some(w => !WEAPON_DEFS[w].aimable)],
    ['War Rockets', cargo['War Rockets'] ?? 0, hasRocketRack],
  ];

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
        {/* Left: armament and ammunition */}
        <div className="flex-1 space-y-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500 mb-1.5">Armament</div>
            <div className="space-y-1">
              {armamentLines.map(([name, count]) => (
                <div key={name} className="flex items-center justify-between gap-3">
                  <span className="text-[11px] text-slate-300 leading-none">{name}</span>
                  <span className="text-[11px] font-mono text-cyan-300 tabular-nums shrink-0">{count}x</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500 mb-1.5">Munitions</div>
            <div className="space-y-1">
              {munitionLines.map(([name, count, usable]) => (
                <div key={name} className="flex items-center justify-between gap-3">
                  <span
                    className="text-[11px] leading-none"
                    style={{ color: usable ? '#cbd5e1' : '#64748b' }}
                  >
                    {name}
                    {!usable && count > 0 && (
                      <span className="ml-1 text-[9px] italic text-slate-500">no launcher</span>
                    )}
                  </span>
                  <span
                    className="text-[11px] font-mono tabular-nums shrink-0"
                    style={{ color: usable ? '#fcd34d' : '#64748b' }}
                  >
                    {count}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: ship stats and condition */}
        <div className="flex-1 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-slate-500">Speed</span>
            <span className="text-[11px] font-mono text-slate-300">{typeInfo.speed}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-slate-500">Cargo capacity</span>
            <span className="text-[11px] font-mono text-slate-300">{stats.cargoCapacity}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-slate-500">Crew berths</span>
            <span className="text-[11px] font-mono text-slate-300">{typeInfo.crew}</span>
          </div>
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
              {/* Vitality */}
              <span className="shrink-0" title={member.health}>
                <VitalityHeart current={member.hearts.current} max={member.hearts.max} size={12} />
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

function MobileStatBar({ icon, value, max, color }: { icon: React.ReactNode; value: number; max: number; color: string }) {
  const pct = Math.max(0, Math.min(100, Math.round((value / max) * 100)));

  return (
    <div className="min-w-0">
      <div className="mb-1 flex items-center justify-between gap-1">
        <span className="text-slate-400">{icon}</span>
        <span className="text-[9px] font-mono text-slate-300 tabular-nums">{value}</span>
      </div>
      <div className="h-[5px] w-full overflow-hidden rounded-full bg-white/[0.08]">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${pct}%`,
            backgroundColor: color,
            boxShadow: `0 0 7px ${color}50`,
          }}
        />
      </div>
    </div>
  );
}


function getTrimCueColor(grade: ReturnType<typeof getWindTrimInfo>['grade']): string {
  if (grade === 'full') return '#22c55e';
  if (grade === 'good') return '#86efac';
  if (grade === 'reach') return '#bbf7d0';
  return '#64748b';
}

function RotatingWindIcon() {
  // windDirection is the direction the wind blows toward. The lucide Wind
  // glyph reads as flowing east at 0°, so offset by -90° to align it.
  const windDirection = useGameStore((state) => state.windDirection);
  const rotation = windDirection * 180 / Math.PI - 90;
  return (
    <Wind
      size={15}
      style={{
        transform: `rotate(${rotation}deg)`,
        transformOrigin: 'center',
        transition: 'transform 1.5s ease',
      }}
    />
  );
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
          <div className="text-[10px] text-slate-500">Wind toward {windCardinal} · {speedKnots} kn</div>
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
