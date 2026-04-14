import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore, WEAPON_DEFS, PORT_FACTION, type Nationality, type CrewRole, type CrewMember, type CrewQuality } from '../store/gameStore';
import { sfxTab, sfxClose } from '../audio/SoundEffects';
import { FactionFlag } from './FactionFlag';
import { CrewPortraitSquare } from './CrewPortrait';
import { PortraitModal } from './PortraitModal';
import { FACTIONS } from '../constants/factions';
import { sfxClick } from '../audio/SoundEffects';
import {
  ASCII_COLORS as CLR,
  C,
  useSparkle,
  hullColor, moraleColor, cargoColor,
  BaroqueBorder,
} from './ascii-ui-kit';

// ═══════════════════════════════════════════════════════════════════════════
// ASCII Dashboard — baroque-framed game UI with tabbed panels
// ═══════════════════════════════════════════════════════════════════════════

type DashTab = 'overview' | 'ship' | 'crew' | 'cargo' | 'reputation';

const TABS: { id: DashTab; label: string; accent: string }[] = [
  { id: 'overview',   label: 'Overview',    accent: CLR.tabOverview },
  { id: 'ship',       label: 'Ship',        accent: CLR.tabShip },
  { id: 'crew',       label: 'Crew',        accent: CLR.tabCrew },
  { id: 'cargo',      label: 'Cargo',       accent: CLR.tabCargo },
  { id: 'reputation', label: 'Reputation',  accent: CLR.tabReputation },
];

const MONO = '"SF Mono", "Fira Code", "Cascadia Code", "Consolas", monospace';
const SERIF = '"Fraunces", serif';
const SANS = '"DM Sans", sans-serif';

// ── Health flag styling ──────────────────────────────────────────────────

const HEALTH_STYLE: Record<string, { label: string; color: string }> = {
  healthy: { label: 'Fit', color: CLR.green },
  sick:    { label: 'Sick', color: CLR.yellow },
  injured: { label: 'Injured', color: CLR.red },
  scurvy:  { label: 'Scurvy', color: CLR.orange },
  fevered: { label: 'Fever', color: CLR.red },
};

const ROLE_COLOR: Record<string, string> = {
  Captain:   CLR.gold,
  Navigator: CLR.cyan,
  Gunner:    CLR.red,
  Sailor:    CLR.txt,
  Factor:    CLR.teal,
  Surgeon:   '#ec4899',
};

// ═══════════════════════════════════════════════════════════════════════════
// ANIMATED WAVE DIVIDER (from EventModalASCII pattern)
// ═══════════════════════════════════════════════════════════════════════════

function WaveDivider({ width = 48 }: { width?: number }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let animId: number;
    let last = 0;
    const frame = (time: number) => {
      animId = requestAnimationFrame(frame);
      if (time - last < 100) return;
      last = time;
      setTick(t => t + 1);
    };
    animId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(animId);
  }, []);

  const chars: React.ReactNode[] = [];
  const waveChars = [' ', '\u00b7', '~', '\u223c', '\u2248'];
  const colors = ['#142830', '#1a3a4a', '#2a5a6a', '#3a7a8a', '#4a8a9a'];
  for (let i = 0; i < width; i++) {
    const t = tick * 0.15;
    const wave = Math.sin(i * 0.4 + t) * 0.4 + Math.sin(i * 0.15 - t * 0.6) * 0.35 + Math.sin(i * 0.8 + t * 1.3) * 0.25;
    const idx = Math.max(0, Math.min(waveChars.length - 1, Math.floor((wave + 1) * 0.5 * waveChars.length)));
    chars.push(<span key={i} style={{ color: colors[idx] }}>{waveChars[idx]}</span>);
  }

  return (
    <pre className="text-[11px] leading-[1.2] whitespace-pre text-center select-none overflow-hidden" style={{ fontFamily: MONO }}>
      {chars}
    </pre>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ORNATE RULE DIVIDER
// ═══════════════════════════════════════════════════════════════════════════

function OrnateRule({ sparkle, width = 44, className = '' }: { sparkle: (n: number) => string; width?: number; className?: string }) {
  const half = Math.floor((width - 5) / 2);
  return (
    <pre className={`text-[11px] whitespace-pre text-center select-none ${className}`} style={{ fontFamily: MONO }}>
      <C c={CLR.rule}>{'\u2576\u2500'}</C>
      <C c={CLR.rule}>{'\u2500'.repeat(half)}</C>
      <C c={CLR.dimGold}>{` ${sparkle(0)} `}</C>
      <C c={CLR.rule}>{'\u2500'.repeat(half)}</C>
      <C c={CLR.rule}>{'\u2500\u2574'}</C>
    </pre>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// STAT GAUGE — polished bar with label + value
// ═══════════════════════════════════════════════════════════════════════════

function StatGauge({ label, value, numericValue, max, color, suffix, delay = 0 }: {
  label: string; value: string; numericValue: number; max: number; color: string; suffix?: string; delay?: number;
}) {
  const pct = Math.min(100, Math.max(0, (numericValue / max) * 100));

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.35, delay, ease: [0.22, 1, 0.36, 1] }}
      className="flex items-center gap-3"
    >
      <span
        className="text-[10px] tracking-[0.18em] uppercase w-[52px] text-right shrink-0"
        style={{ color: CLR.dim, fontFamily: SANS, fontWeight: 500 }}
      >
        {label}
      </span>
      <div className="flex-1 h-[6px] rounded-full overflow-hidden" style={{ backgroundColor: CLR.rule + '60' }}>
        <motion.div
          className="h-full rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.7, delay: delay + 0.1, ease: [0.22, 1, 0.36, 1] }}
          style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}40` }}
        />
      </div>
      <span
        className="text-[12px] tabular-nums w-[56px] text-right shrink-0"
        style={{ color: CLR.bright, fontFamily: MONO }}
      >
        {value}
      </span>
      {suffix && (
        <span className="text-[10px] shrink-0" style={{ color: CLR.dim, fontFamily: SANS }}>{suffix}</span>
      )}
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MINI SHIP SCHEMATICS
// ═══════════════════════════════════════════════════════════════════════════

function MiniShipSchematic({ shipType }: { shipType: string }) {
  const s = CLR.sail;
  const h = CLR.hull;
  const m = CLR.mast;

  const ships: Record<string, React.ReactNode> = {
    Dhow: (
      <>
        <C c={m}>{'       |'}</C>{'\n'}
        <C c={s}>{'      /|'}</C>{'\n'}
        <C c={s}>{'     / |'}</C>{'\n'}
        <C c={h}>{'   ════════'}</C>
      </>
    ),
    Junk: (
      <>
        <C c={m}>{'      |   |'}</C>{'\n'}
        <C c={s}>{'     ┤│  ┤│'}</C>{'\n'}
        <C c={s}>{'     ┤│  ┤│'}</C>{'\n'}
        <C c={h}>{'   ══════════'}</C>
      </>
    ),
    Pinnace: (
      <>
        <C c={m}>{'        |'}</C>{'\n'}
        <C c={s}>{'       )|'}</C>{'\n'}
        <C c={s}>{'      )_)'}</C>{'\n'}
        <C c={h}>{'    ═══════'}</C>
      </>
    ),
    Galleon: (
      <>
        <C c={m}>{'       |    |    |    |'}</C>{'\n'}
        <C c={s}>{'      )_)  )_)  )_)  )_)'}</C>{'\n'}
        <C c={s}>{'     )___))___))___))___)'}</C><C c={h}>{'\\'}</C>{'\n'}
        <C c={h}>{'   ══════════════════════'}</C>
      </>
    ),
  };

  const carrack = (
    <>
      <C c={m}>{'        |    |    |'}</C>{'\n'}
      <C c={s}>{'       )_)  )_)  )_)'}</C>{'\n'}
      <C c={s}>{'      )___))___))___)'}</C><C c={h}>{'\\'}</C>{'\n'}
      <C c={h}>{'    ════════════════════'}</C>
    </>
  );

  return (
    <pre className="text-[11px] leading-[1.4] whitespace-pre text-center select-none" style={{ fontFamily: MONO }}>
      {ships[shipType] ?? carrack}
    </pre>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// CREW MEMBER ROW
// ═══════════════════════════════════════════════════════════════════════════

function CrewRow({ member, delay }: {
  member: CrewMember; delay: number;
}) {
  const { name, role, health, morale, nationality } = member;
  const hs = HEALTH_STYLE[health] ?? HEALTH_STYLE.healthy;
  const moraleColor_ = morale > 60 ? CLR.green : morale > 30 ? CLR.yellow : CLR.red;
  const roleColor = ROLE_COLOR[role] ?? CLR.txt;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay }}
      className="flex items-center gap-2.5 py-[6px] border-b"
      style={{ borderColor: CLR.rule + '30' }}
    >
      {/* Portrait */}
      <div
        className="w-[36px] h-[36px] rounded-full shrink-0 overflow-hidden flex items-center justify-center"
        style={{
          border: `2px solid ${roleColor}60`,
          backgroundColor: roleColor + '10',
          boxShadow: `inset 0 1px 3px rgba(0,0,0,0.4), 0 0 6px ${roleColor}15`,
        }}
      >
        <CrewPortraitSquare member={member} size={36} />
      </div>
      {/* Name + flag */}
      <div className="flex items-center gap-1.5 flex-1 min-w-0">
        <span
          className="text-[13px] truncate"
          style={{ color: CLR.bright, fontFamily: SANS }}
        >
          {name}
        </span>
        <span className="shrink-0 opacity-80">
          <FactionFlag nationality={nationality} size={14} />
        </span>
      </div>
      {/* Role */}
      <span
        className="text-[11px] w-[72px] shrink-0"
        style={{ color: roleColor, fontFamily: SANS, fontWeight: 500 }}
      >
        {role}
      </span>
      {/* Health */}
      <span
        className="text-[10px] w-[48px] shrink-0 text-right"
        style={{ color: hs.color, fontFamily: SANS, fontWeight: 600 }}
      >
        {hs.label}
      </span>
      {/* Morale mini bar */}
      <div className="w-[40px] h-[4px] rounded-full overflow-hidden shrink-0" style={{ backgroundColor: CLR.rule + '50' }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${morale}%`, backgroundColor: moraleColor_ }}
        />
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// OVERVIEW TAB
// ═══════════════════════════════════════════════════════════════════════════

function reputationTier(rep: number): { label: string; color: string } {
  if (rep >= 50) return { label: 'Allied', color: '#22c55e' };
  if (rep >= 25) return { label: 'Friendly', color: '#4ade80' };
  if (rep >= 5)  return { label: 'Favorable', color: '#86efac' };
  if (rep > -5)  return { label: 'Neutral', color: CLR.txt };
  if (rep > -25) return { label: 'Wary', color: '#fbbf24' };
  if (rep > -50) return { label: 'Hostile', color: '#f97316' };
  return { label: 'Enemy', color: '#ef4444' };
}

function OverviewTab() {
  const { ship, stats, crew, cargo, gold, provisions, ports, playerPos, getReputation } = useGameStore();
  const captain = crew.find(c => c.role === 'Captain') ?? crew[0];
  const sparkle = useSparkle();
  const hullPct = Math.round((stats.hull / stats.maxHull) * 100);
  const sailsPct = Math.round((stats.sails / stats.maxSails) * 100);
  const avgMorale = Math.round(crew.reduce((a, c) => a + c.morale, 0) / (crew.length || 1));
  const currentCargo = Object.entries(cargo).reduce(
    (sum, [c, qty]) => sum + qty * (COMMODITY_DEFS[c as Commodity]?.weight ?? 1), 0
  );
  const cargoPct = Math.round((currentCargo / stats.cargoCapacity) * 100);
  const sickCrew = crew.filter(c => c.health !== 'healthy');

  // Nearest port + its controlling faction
  const nearestPort = ports.reduce<{ name: string; id: string; dist: number } | null>((best, p) => {
    const dx = playerPos[0] - p.position[0];
    const dz = playerPos[2] - p.position[2];
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (!best || dist < best.dist) return { name: p.name, id: p.id, dist };
    return best;
  }, null);

  const locationStr = nearestPort
    ? nearestPort.dist < 30 ? `at ${nearestPort.name}`
      : nearestPort.dist < 150 ? `near ${nearestPort.name}`
      : `open sea \u2014 nearest port: ${nearestPort.name}`
    : 'open sea';

  // Contextual reputation — faction controlling nearest port
  const nearFaction = nearestPort ? PORT_FACTION[nearestPort.id] : null;
  const nearRep = nearFaction ? getReputation(nearFaction) : 0;
  const nearRepTier = nearFaction ? reputationTier(nearRep) : null;

  // Weapon summary
  const weaponCounts: Record<string, number> = {};
  stats.armament.forEach(w => {
    const name = WEAPON_DEFS[w].name;
    weaponCounts[name] = (weaponCounts[name] || 0) + 1;
  });
  const weaponStr = Object.entries(weaponCounts).map(([name, count]) =>
    count > 1 ? `${count}\u00d7 ${name}` : name
  ).join(', ') || 'Unarmed';

  // Alerts
  const alerts: { msg: string; color: string }[] = [];
  if (stats.hull < stats.maxHull * 0.5) {
    alerts.push({ msg: `Hull critical \u2014 ${stats.maxHull - stats.hull} pts repair needed`, color: CLR.red });
  } else if (stats.hull < stats.maxHull) {
    alerts.push({ msg: `Hull damaged \u2014 ${stats.maxHull - stats.hull} pts repair needed`, color: CLR.yellow });
  }
  if (provisions < 10) {
    alerts.push({ msg: `Provisions dangerously low: ${provisions} remaining`, color: CLR.red });
  }
  sickCrew.forEach(c => {
    alerts.push({ msg: `${c.name}: ${c.health}`, color: c.health === 'injured' ? CLR.red : CLR.yellow });
  });
  if (stats.sails < stats.maxSails * 0.5) {
    alerts.push({ msg: `Sails damaged \u2014 ${stats.maxSails - stats.sails} pts repair needed`, color: CLR.yellow });
  }

  return (
    <motion.div
      key="overview"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col items-center w-full"
    >
      {/* ── Ship name + flag + type ── */}
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.05 }}
        className="text-center mt-1"
      >
        <div className="flex items-center justify-center gap-3">
          <span className="shrink-0" style={{ filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.5))' }}>
            <FactionFlag nationality={ship.flag as Nationality} size={28} />
          </span>
          <h2
            className="text-[22px] md:text-[26px] tracking-[0.2em] uppercase"
            style={{ color: CLR.gold, fontFamily: MONO, fontWeight: 400 }}
          >
            {ship.name}
          </h2>
        </div>
        <p
          className="text-[13px] mt-1.5 tracking-wide"
          style={{ color: CLR.txt, fontFamily: SERIF, fontStyle: 'italic' }}
        >
          {ship.flag} {ship.type}
          {captain && <> &middot; Captain {captain.name}</>}
        </p>
      </motion.div>

      {/* ── Ornate rule ── */}
      <motion.div
        initial={{ opacity: 0, scaleX: 0.4 }}
        animate={{ opacity: 1, scaleX: 1 }}
        transition={{ duration: 0.4, delay: 0.15 }}
        className="mt-3 w-full max-w-md"
      >
        <OrnateRule sparkle={sparkle} width={50} />
      </motion.div>

      {/* ── SHIP + FLANKING STATS (desktop) ── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="mt-4 w-full max-w-2xl"
      >
        {/* Desktop: three-column — stats | ship | stats */}
        <div className="hidden md:grid grid-cols-[1fr_auto_1fr] gap-6 items-center">
          {/* Left column stats */}
          <div className="space-y-3">
            <StatGauge label="Hull" value={`${stats.hull}/${stats.maxHull}`} numericValue={stats.hull} max={stats.maxHull} color={hullColor(hullPct)} delay={0.25} />
            <StatGauge label="Sails" value={`${stats.sails}/${stats.maxSails}`} numericValue={stats.sails} max={stats.maxSails} color={sailsPct > 50 ? CLR.txt : CLR.yellow} delay={0.3} />
            <StatGauge label="Speed" value={`${stats.speed}`} numericValue={stats.speed} max={25} color={CLR.cyan} delay={0.35} />
          </div>

          {/* Center: ship schematic */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="flex flex-col items-center px-4"
          >
            <MiniShipSchematic shipType={ship.type} />
            <div className="mt-1">
              <WaveDivider width={30} />
            </div>
          </motion.div>

          {/* Right column stats */}
          <div className="space-y-3">
            <StatGauge label="Morale" value={`${avgMorale}%`} numericValue={avgMorale} max={100} color={moraleColor(avgMorale)} delay={0.25} />
            <StatGauge label="Cargo" value={`${currentCargo}/${stats.cargoCapacity}`} numericValue={currentCargo} max={stats.cargoCapacity} color={cargoColor(cargoPct)} delay={0.3} />
            <StatGauge label="Food" value={`${provisions}`} numericValue={provisions} max={60} color={provisions < 10 ? CLR.red : CLR.warm} suffix="-2/day" delay={0.35} />
          </div>
        </div>

        {/* Mobile: ship on top, stats below */}
        <div className="md:hidden flex flex-col items-center">
          <MiniShipSchematic shipType={ship.type} />
          <div className="mt-1 w-full">
            <WaveDivider width={36} />
          </div>
          <div className="mt-4 w-full space-y-2.5 px-2">
            <StatGauge label="Hull" value={`${stats.hull}/${stats.maxHull}`} numericValue={stats.hull} max={stats.maxHull} color={hullColor(hullPct)} delay={0.2} />
            <StatGauge label="Sails" value={`${stats.sails}/${stats.maxSails}`} numericValue={stats.sails} max={stats.maxSails} color={sailsPct > 50 ? CLR.txt : CLR.yellow} delay={0.25} />
            <StatGauge label="Speed" value={`${stats.speed}`} numericValue={stats.speed} max={25} color={CLR.cyan} delay={0.3} />
            <StatGauge label="Morale" value={`${avgMorale}%`} numericValue={avgMorale} max={100} color={moraleColor(avgMorale)} delay={0.35} />
            <StatGauge label="Cargo" value={`${currentCargo}/${stats.cargoCapacity}`} numericValue={currentCargo} max={stats.cargoCapacity} color={cargoColor(cargoPct)} delay={0.4} />
            <StatGauge label="Food" value={`${provisions}`} numericValue={provisions} max={60} color={provisions < 10 ? CLR.red : CLR.warm} suffix="-2/day" delay={0.45} />
          </div>
        </div>
      </motion.div>

      {/* ── Location + contextual reputation ── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.4 }}
        className="mt-4 text-center"
      >
        <p className="text-[13px]" style={{ color: CLR.dim, fontFamily: SERIF, fontStyle: 'italic' }}>
          ~ {locationStr} ~
        </p>
        {nearFaction && nearRepTier && nearestPort && nearestPort.dist < 200 && (
          <div className="flex items-center justify-center gap-2 mt-2">
            <FactionFlag nationality={nearFaction} size={14} />
            <span className="text-[12px]" style={{ color: CLR.dim, fontFamily: SANS }}>
              Standing with <span style={{ color: CLR.txt, fontWeight: 500 }}>{nearFaction}</span>:
            </span>
            <span
              className="text-[12px] font-semibold px-2 py-0.5 rounded"
              style={{
                color: nearRepTier.color,
                backgroundColor: nearRepTier.color + '12',
                border: `1px solid ${nearRepTier.color}25`,
                fontFamily: SANS,
              }}
            >
              {nearRepTier.label}
            </span>
            <span className="text-[10px] tabular-nums" style={{ color: CLR.dim, fontFamily: MONO }}>
              {nearRep > 0 ? '+' : ''}{nearRep}
            </span>
          </div>
        )}
      </motion.div>

      {/* ── Gold / Armament / Captain summary cards ── */}
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.42 }}
        className="mt-4 w-full max-w-lg px-2 md:px-4"
      >
        <div className="grid grid-cols-3 gap-2 md:gap-3">
          {/* Gold */}
          <div
            className="flex flex-col items-center py-2.5 px-2 rounded-lg"
            style={{ backgroundColor: CLR.gold + '08', border: `1px solid ${CLR.gold}20` }}
          >
            <span className="text-[10px] tracking-[0.18em] uppercase mb-1" style={{ color: CLR.dimGold, fontFamily: SANS, fontWeight: 500 }}>
              Treasury
            </span>
            <span className="text-[18px] md:text-[20px] tabular-nums" style={{ color: CLR.gold, fontFamily: MONO, fontWeight: 400 }}>
              {gold.toLocaleString()}
            </span>
            <span className="text-[10px] mt-0.5" style={{ color: CLR.dim, fontFamily: SANS }}>gold</span>
          </div>

          {/* Armament */}
          <div
            className="flex flex-col items-center py-2.5 px-2 rounded-lg"
            style={{ backgroundColor: CLR.red + '06', border: `1px solid ${CLR.red}15` }}
          >
            <span className="text-[10px] tracking-[0.18em] uppercase mb-1" style={{ color: CLR.dim, fontFamily: SANS, fontWeight: 500 }}>
              Armament
            </span>
            <span className="text-[14px] md:text-[15px] text-center leading-tight" style={{ color: CLR.bright, fontFamily: SANS, fontWeight: 500 }}>
              {weaponStr}
            </span>
            <span className="text-[10px] mt-0.5" style={{ color: CLR.dim, fontFamily: SANS }}>
              {stats.cannons > 0 ? `${stats.cannons} broadside` : 'no broadside'}
            </span>
          </div>

          {/* Captain / XP */}
          {captain && (
            <div
              className="flex flex-col items-center py-2.5 px-2 rounded-lg"
              style={{ backgroundColor: CLR.cyan + '06', border: `1px solid ${CLR.cyan}15` }}
            >
              <span className="text-[10px] tracking-[0.18em] uppercase mb-1" style={{ color: CLR.dim, fontFamily: SANS, fontWeight: 500 }}>
                Captain
              </span>
              <span className="text-[16px] md:text-[18px] tabular-nums" style={{ color: CLR.cyan, fontFamily: MONO }}>
                Lvl {captain?.level ?? 1}
              </span>
              <div className="w-full mt-1.5 px-1">
                <div className="h-[3px] rounded-full overflow-hidden" style={{ backgroundColor: CLR.rule + '50' }}>
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${Math.min(100, ((captain?.xp ?? 0) / (captain?.xpToNext ?? 100)) * 100)}%`,
                      backgroundColor: CLR.cyan,
                      boxShadow: `0 0 6px ${CLR.cyan}40`,
                    }}
                  />
                </div>
                <p className="text-[9px] text-center mt-1 tabular-nums" style={{ color: CLR.dim, fontFamily: MONO }}>
                  {captain?.xp ?? 0}/{captain?.xpToNext ?? 100} XP
                </p>
              </div>
            </div>
          )}
        </div>
      </motion.div>

      {/* ── Wave divider ── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.45 }}
        className="mt-4 w-full max-w-lg"
      >
        <WaveDivider width={56} />
      </motion.div>

      {/* ── Crew roster ── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.5 }}
        className="mt-3 w-full max-w-lg px-2 md:px-4"
      >
        <div className="flex items-center justify-between mb-2">
          <h3
            className="text-[11px] tracking-[0.2em] uppercase"
            style={{ color: CLR.dimGold, fontFamily: SANS, fontWeight: 600 }}
          >
            Crew &middot; {crew.length} Souls
          </h3>
          <span className="text-[10px]" style={{ color: CLR.dim, fontFamily: SANS }}>
            Avg morale {avgMorale}%
          </span>
        </div>

        {crew.map((c, i) => (
          <CrewRow
            key={c.id}
            member={c}
            delay={0.52 + i * 0.04}
          />
        ))}
      </motion.div>

      {/* ── Alerts ── */}
      {alerts.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.65 }}
          className="mt-4 w-full max-w-lg px-2 md:px-4"
        >
          <div
            className="rounded-lg p-3 space-y-1.5"
            style={{ backgroundColor: 'rgba(120,60,30,0.08)', border: `1px solid ${CLR.rule}40` }}
          >
            {alerts.map((a, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-[12px]" style={{ color: a.color }}>{'\u26a0'}</span>
                <span className="text-[12px]" style={{ color: a.color, fontFamily: SANS }}>{a.msg}</span>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Bottom breathing room */}
      <div className="h-4" />
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// REPUTATION TAB
// ═══════════════════════════════════════════════════════════════════════════

const FACTION_REGIONS: { label: string; factions: Nationality[] }[] = [
  { label: 'European Powers', factions: ['English', 'Portuguese', 'Dutch', 'Spanish', 'French', 'Danish'] },
  { label: 'Indian Subcontinent', factions: ['Mughal', 'Gujarati'] },
  { label: 'Middle East & East Africa', factions: ['Persian', 'Ottoman', 'Omani', 'Swahili'] },
  { label: 'Southeast Asia', factions: ['Malay', 'Acehnese', 'Javanese', 'Moluccan'] },
  { label: 'East Asia', factions: ['Siamese', 'Japanese', 'Chinese'] },
];

// Reverse lookup: which ports does each faction control?
const FACTION_PORTS: Partial<Record<Nationality, string[]>> = {};
for (const [portId, faction] of Object.entries(PORT_FACTION)) {
  if (!FACTION_PORTS[faction]) FACTION_PORTS[faction] = [];
  FACTION_PORTS[faction]!.push(portId.charAt(0).toUpperCase() + portId.slice(1));
}

function ReputationTab() {
  const { ship, reputation, getReputation } = useGameStore();
  const sparkle = useSparkle();
  const [expanded, setExpanded] = useState<string | null>(null);

  const playerFaction = ship.flag as Nationality;

  // Split factions into encountered (non-zero rep or own faction) and unknown
  const encountered = new Set<Nationality>();
  encountered.add(playerFaction);
  for (const [nat, val] of Object.entries(reputation)) {
    if (val !== 0) encountered.add(nat as Nationality);
  }

  return (
    <motion.div
      key="reputation"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col items-center w-full"
    >
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.05 }}
        className="text-center mt-1"
      >
        <h2
          className="text-[20px] md:text-[22px] tracking-[0.25em] uppercase"
          style={{ color: CLR.tabReputation, fontFamily: MONO }}
        >
          Reputation
        </h2>
        <p className="text-[13px] mt-1" style={{ color: CLR.txt, fontFamily: SERIF, fontStyle: 'italic' }}>
          Your standing among the nations of the Indian Ocean
        </p>
      </motion.div>

      {/* Your allegiance */}
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.12 }}
        className="mt-4 w-full max-w-xl px-2 md:px-4"
      >
        <div
          className="flex items-center gap-3 p-3 rounded-lg"
          style={{
            backgroundColor: CLR.gold + '08',
            border: `1px solid ${CLR.gold}25`,
          }}
        >
          <FactionFlag nationality={playerFaction} size={24} />
          <div className="flex-1 min-w-0">
            <span className="text-[10px] tracking-[0.18em] uppercase" style={{ color: CLR.dimGold, fontFamily: SANS, fontWeight: 500 }}>
              Your Allegiance
            </span>
            <p className="text-[14px] mt-0.5" style={{ color: CLR.gold, fontFamily: SANS, fontWeight: 600 }}>
              {FACTIONS[playerFaction].displayName}
            </p>
          </div>
          <FactionFlag nationality={playerFaction} size={24} />
        </div>
      </motion.div>

      {/* Faction regions */}
      {FACTION_REGIONS.map((region, ri) => {
        const regionFactions = region.factions.filter(f => encountered.has(f));
        const unknownFactions = region.factions.filter(f => !encountered.has(f));
        if (regionFactions.length === 0 && unknownFactions.length === 0) return null;

        return (
          <motion.div
            key={region.label}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.18 + ri * 0.06 }}
            className="mt-5 w-full max-w-xl px-2 md:px-4"
          >
            {/* Region header */}
            <div className="flex items-center gap-3 mb-2">
              <pre className="text-[11px] whitespace-pre select-none" style={{ fontFamily: MONO }}>
                <C c={CLR.rule}>{'\u2500'.repeat(4)}</C>
                <C c={CLR.dimGold}>{` ${sparkle(ri)} `}</C>
                <C c={CLR.rule}>{'\u2500'.repeat(4)}</C>
              </pre>
              <span
                className="text-[11px] tracking-[0.18em] uppercase shrink-0"
                style={{ color: CLR.dimGold, fontFamily: SANS, fontWeight: 600 }}
              >
                {region.label}
              </span>
              <div className="flex-1 h-[1px]" style={{ background: `linear-gradient(90deg, ${CLR.rule}60, transparent)` }} />
            </div>

            {/* Encountered factions */}
            <div className="space-y-1">
              {regionFactions.map((factionId, fi) => (
                <FactionRow
                  key={factionId}
                  factionId={factionId}
                  isPlayerFaction={factionId === playerFaction}
                  rep={getReputation(factionId)}
                  expanded={expanded === factionId}
                  onToggle={() => { sfxClick(); setExpanded(expanded === factionId ? null : factionId); }}
                  delay={0.2 + ri * 0.06 + fi * 0.03}
                />
              ))}
            </div>

            {/* Unknown factions */}
            {unknownFactions.length > 0 && (
              <div className="mt-2 space-y-0.5">
                {unknownFactions.map(factionId => (
                  <div
                    key={factionId}
                    className="flex items-center gap-2.5 py-[5px] px-2 rounded opacity-40"
                  >
                    <FactionFlag nationality={factionId} size={16} />
                    <span className="text-[12px]" style={{ color: CLR.dim, fontFamily: SANS }}>
                      {FACTIONS[factionId].shortName}
                    </span>
                    <span className="text-[10px] ml-auto" style={{ color: CLR.rule, fontFamily: SERIF, fontStyle: 'italic' }}>
                      unknown
                    </span>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        );
      })}

      {/* Effects explanation */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.6 }}
        className="mt-6 w-full max-w-xl px-2 md:px-4 mb-4"
      >
        <div className="p-3 rounded-lg" style={{ backgroundColor: CLR.rule + '15', border: `1px solid ${CLR.rule}25` }}>
          <p className="text-[10px] tracking-[0.15em] uppercase mb-2" style={{ color: CLR.dimGold, fontFamily: SANS, fontWeight: 600 }}>
            How Reputation Works
          </p>
          <div className="space-y-1.5">
            {[
              { tier: 'Allied', color: '#22c55e', effect: 'Best trade prices, safe passage, access to exclusive goods' },
              { tier: 'Friendly', color: '#4ade80', effect: 'Better prices, ships will not attack' },
              { tier: 'Neutral', color: CLR.txt, effect: 'Standard trade terms, unpredictable encounters' },
              { tier: 'Hostile', color: '#f97316', effect: 'Poor prices, ships may attack on sight' },
              { tier: 'Enemy', color: '#ef4444', effect: 'Ports closed, ships will attack' },
            ].map(row => (
              <div key={row.tier} className="flex items-start gap-2">
                <span
                  className="text-[10px] font-semibold w-[56px] shrink-0 text-right px-1.5 py-0.5 rounded"
                  style={{ color: row.color, backgroundColor: row.color + '12', border: `1px solid ${row.color}20`, fontFamily: SANS }}
                >
                  {row.tier}
                </span>
                <span className="text-[11px] leading-relaxed" style={{ color: CLR.dim, fontFamily: SANS }}>
                  {row.effect}
                </span>
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      <div className="h-4" />
    </motion.div>
  );
}

// ── Faction row with expandable detail ───────────────────────────────────

function FactionRow({ factionId, isPlayerFaction, rep, expanded, onToggle, delay }: {
  factionId: Nationality; isPlayerFaction: boolean; rep: number; expanded: boolean; onToggle: () => void; delay: number;
}) {
  const faction = FACTIONS[factionId];
  const tier = reputationTier(rep);
  const ports = FACTION_PORTS[factionId];

  // Bar: -100 to +100 mapped to 0-100% with center at 50%

  return (
    <motion.div
      initial={{ opacity: 0, y: 3 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay }}
    >
      <button
        onClick={onToggle}
        className="w-full text-left rounded-lg px-3 py-2.5 transition-colors hover:bg-white/[0.02]"
        style={{
          backgroundColor: expanded ? 'rgba(255,255,255,0.02)' : 'transparent',
          border: expanded ? `1px solid ${tier.color}20` : '1px solid transparent',
        }}
      >
        <div className="flex items-center gap-2.5">
          {/* Flag */}
          <FactionFlag nationality={factionId} size={20} />

          {/* Name */}
          <span
            className="text-[13px] flex-1 min-w-0 truncate"
            style={{ color: isPlayerFaction ? CLR.gold : CLR.bright, fontFamily: SANS, fontWeight: isPlayerFaction ? 600 : 400 }}
          >
            {faction.shortName}
            {isPlayerFaction && (
              <span className="text-[9px] ml-1.5 tracking-wider uppercase" style={{ color: CLR.dimGold }}>
                (you)
              </span>
            )}
          </span>

          {/* Tier badge */}
          <span
            className="text-[10px] font-semibold px-2 py-0.5 rounded shrink-0"
            style={{
              color: tier.color,
              backgroundColor: tier.color + '12',
              border: `1px solid ${tier.color}25`,
              fontFamily: SANS,
            }}
          >
            {tier.label}
          </span>

          {/* Numeric value */}
          <span
            className="text-[11px] w-[32px] text-right tabular-nums shrink-0"
            style={{ color: tier.color, fontFamily: MONO }}
          >
            {rep > 0 ? '+' : ''}{rep}
          </span>

          {/* Expand chevron */}
          <span
            className="text-[10px] transition-transform duration-200 shrink-0"
            style={{ color: CLR.dim, transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
          >
            ▸
          </span>
        </div>

        {/* Reputation bar — centered at zero */}
        <div className="mt-2 flex items-center gap-2">
          <span className="text-[8px] tabular-nums w-[20px] text-right" style={{ color: CLR.rule, fontFamily: MONO }}>-100</span>
          <div className="flex-1 h-[5px] rounded-full overflow-hidden relative" style={{ backgroundColor: CLR.rule + '40' }}>
            {/* Center line */}
            <div className="absolute left-1/2 top-0 bottom-0 w-[1px]" style={{ backgroundColor: CLR.dim + '60' }} />
            {/* Fill bar */}
            {rep >= 0 ? (
              <div
                className="absolute top-0 bottom-0 rounded-r-full transition-all duration-700"
                style={{
                  left: '50%',
                  width: `${(rep / 100) * 50}%`,
                  backgroundColor: tier.color,
                  boxShadow: `0 0 6px ${tier.color}30`,
                }}
              />
            ) : (
              <div
                className="absolute top-0 bottom-0 rounded-l-full transition-all duration-700"
                style={{
                  right: '50%',
                  width: `${(Math.abs(rep) / 100) * 50}%`,
                  backgroundColor: tier.color,
                  boxShadow: `0 0 6px ${tier.color}30`,
                }}
              />
            )}
          </div>
          <span className="text-[8px] tabular-nums w-[20px]" style={{ color: CLR.rule, fontFamily: MONO }}>+100</span>
        </div>
      </button>

      {/* Expanded detail */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 pt-1 space-y-2">
              {/* Description */}
              <p className="text-[12px] leading-relaxed" style={{ color: CLR.txt, fontFamily: SERIF, fontStyle: 'italic' }}>
                {faction.description}
              </p>

              {/* Controlled ports */}
              {ports && ports.length > 0 && (
                <div className="flex items-start gap-2">
                  <span className="text-[10px] tracking-wider uppercase shrink-0 mt-0.5" style={{ color: CLR.dim, fontFamily: SANS, fontWeight: 500 }}>
                    Controls
                  </span>
                  <span className="text-[11px] leading-relaxed" style={{ color: CLR.warm, fontFamily: SANS }}>
                    {ports.join(', ')}
                  </span>
                </div>
              )}

              {/* Mechanical effect hint */}
              <p className="text-[10px]" style={{ color: CLR.dim, fontFamily: SANS }}>
                {rep >= 25
                  ? 'Their ports offer you favorable trade prices.'
                  : rep >= 5
                    ? 'You are welcome in their waters.'
                    : rep > -5
                      ? 'They regard you with indifference.'
                      : rep > -25
                        ? 'Their merchants charge you premium rates.'
                        : 'Their ships may attack you on sight.'}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// CREW TAB
// ═══════════════════════════════════════════════════════════════════════════

const ASSIGNABLE_ROLES: CrewRole[] = ['Sailor', 'Navigator', 'Gunner', 'Factor', 'Surgeon'];

const QUALITY_STYLE: Record<CrewQuality, { label: string; color: string; bg: string; border: string }> = {
  dud:       { label: 'Dud',       color: '#92400e', bg: 'rgba(120,80,20,0.08)',  border: 'rgba(120,80,20,0.2)' },
  normal:    { label: 'Common',    color: CLR.txt,   bg: 'transparent',            border: CLR.rule + '30' },
  rare:      { label: 'Rare',      color: '#34d399', bg: 'rgba(52,211,153,0.05)',  border: 'rgba(52,211,153,0.2)' },
  legendary: { label: 'Legendary', color: '#a78bfa', bg: 'rgba(167,139,250,0.06)', border: 'rgba(167,139,250,0.25)' },
};

function CrewTab() {
  const { crew, setCrewRole } = useGameStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selectedMember = selectedId ? crew.find(c => c.id === selectedId) : null;

  // If the selected member was removed (dismissed, etc.), go back to roster
  if (selectedId && !selectedMember) {
    // Can't call setState during render, so use effect pattern
    return <CrewRoster crew={crew} onSelect={(id) => setSelectedId(id)} />;
  }

  if (selectedMember) {
    return (
      <CrewDetailView
        member={selectedMember}
        onBack={() => setSelectedId(null)}
        onRoleChange={(role) => { setCrewRole(selectedMember.id, role); }}
      />
    );
  }

  return <CrewRoster crew={crew} onSelect={(id) => { sfxClick(); setSelectedId(id); }} />;
}

// ── Crew roster (list view) ─────────────────────────────────────────────

const ROLE_SORT_ORDER: Record<string, number> = {
  Captain: 0, Navigator: 1, Gunner: 2, Factor: 3, Surgeon: 4, Sailor: 5,
};

function CrewRoster({ crew, onSelect }: { crew: CrewMember[]; onSelect: (id: string) => void }) {
  const { setCrewRole, dayCount } = useGameStore();
  const avgSkill = Math.round(crew.reduce((a, c) => a + c.skill, 0) / (crew.length || 1));
  const avgMorale = Math.round(crew.reduce((a, c) => a + c.morale, 0) / (crew.length || 1));
  const healthyCrew = crew.filter(c => c.health === 'healthy').length;
  const sickCrew = crew.filter(c => c.health !== 'healthy');
  const sortedCrew = [...crew].sort((a, b) => (ROLE_SORT_ORDER[a.role] ?? 9) - (ROLE_SORT_ORDER[b.role] ?? 9));

  return (
    <motion.div
      key="crew-roster"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col items-center w-full"
    >
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.05 }}
        className="text-center mt-1"
      >
        <h2
          className="text-[20px] md:text-[22px] tracking-[0.25em] uppercase"
          style={{ color: CLR.tabCrew, fontFamily: MONO }}
        >
          Crew
        </h2>
        <p className="text-[13px] mt-1" style={{ color: CLR.txt, fontFamily: SERIF, fontStyle: 'italic' }}>
          {crew.length} souls aboard
        </p>
      </motion.div>

      {/* Ornate divider */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="mt-3 w-full max-w-2xl"
      >
        <WaveDivider width={60} />
      </motion.div>

      {/* Column headers */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2, delay: 0.12 }}
        className="mt-3 w-full max-w-2xl px-3 md:px-5"
      >
        <div className="flex items-center gap-3 px-3 pb-1.5" style={{ borderBottom: `1px solid ${CLR.rule}30` }}>
          {/* Portrait spacer */}
          <div className="w-[48px] shrink-0" />
          {/* Name */}
          <span className="flex-1 text-[9px] tracking-[0.2em] uppercase" style={{ color: CLR.dim, fontFamily: SANS, fontWeight: 500 }}>
            Name
          </span>
          {/* Role */}
          <span className="w-[78px] shrink-0 text-[9px] tracking-[0.2em] uppercase" style={{ color: CLR.dim, fontFamily: SANS, fontWeight: 500 }}>
            Role
          </span>
          {/* Skill */}
          <span className="hidden md:block w-[72px] shrink-0 text-[9px] tracking-[0.2em] uppercase" style={{ color: CLR.dim, fontFamily: SANS, fontWeight: 500 }}>
            Skill
          </span>
          {/* Health */}
          <span className="w-[48px] shrink-0 text-right text-[9px] tracking-[0.2em] uppercase" style={{ color: CLR.dim, fontFamily: SANS, fontWeight: 500 }}>
            Health
          </span>
          {/* Morale */}
          <span className="w-[52px] shrink-0 text-right text-[9px] tracking-[0.2em] uppercase" style={{ color: CLR.dim, fontFamily: SANS, fontWeight: 500 }}>
            Morale
          </span>
          {/* Days */}
          <span className="hidden md:block w-[36px] shrink-0 text-right text-[9px] tracking-[0.2em] uppercase" style={{ color: CLR.dim, fontFamily: SANS, fontWeight: 500 }}>
            Days
          </span>
          {/* Chevron spacer */}
          <div className="w-[14px] shrink-0" />
        </div>
      </motion.div>

      {/* Full crew roster */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.15 }}
        className="mt-1 w-full max-w-2xl px-3 md:px-5"
      >
        <div>
          {sortedCrew.map((m, i) => (
            <CrewRosterRow
              key={m.id}
              member={m}
              index={i}
              dayCount={dayCount}
              onClick={() => onSelect(m.id)}
              onRoleChange={(role) => { sfxClick(); setCrewRole(m.id, role); }}
              delay={0.18 + i * 0.03}
            />
          ))}
        </div>
      </motion.div>

      {/* Summary footer */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.4 }}
        className="mt-4 w-full max-w-2xl px-3 md:px-5 mb-4"
      >
        <div
          className="p-3 rounded-lg flex items-center justify-between flex-wrap gap-2"
          style={{ backgroundColor: CLR.rule + '15', border: `1px solid ${CLR.rule}25` }}
        >
          <div className="flex items-center gap-4">
            <SummaryStat label="Avg Skill" value={avgSkill.toString()} color={CLR.cyan} />
            <SummaryStat label="Avg Morale" value={`${avgMorale}%`} color={moraleColor(avgMorale)} />
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[11px]" style={{ color: CLR.green, fontFamily: SANS }}>
              {healthyCrew} fit
            </span>
            {sickCrew.length > 0 && (
              <span className="text-[11px]" style={{ color: CLR.yellow, fontFamily: SANS }}>
                {sickCrew.length} ailing
              </span>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function SummaryStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] tracking-wider uppercase" style={{ color: CLR.dim, fontFamily: SANS }}>{label}</span>
      <span className="text-[13px] tabular-nums font-semibold" style={{ color, fontFamily: MONO }}>{value}</span>
    </div>
  );
}

// ── Captain card ─────────────────────────────────────────────────────────

// ── Shared: D&D stat block ───────────────────────────────────────────────

const STAT_LABELS: { key: keyof import('../store/gameStore').CrewStats; label: string; abbr: string; color: string }[] = [
  { key: 'strength', label: 'Strength', abbr: 'STR', color: '#f87171' },
  { key: 'perception', label: 'Perception', abbr: 'PER', color: '#60a5fa' },
  { key: 'charisma', label: 'Charisma', abbr: 'CHA', color: '#fbbf24' },
  { key: 'luck', label: 'Luck', abbr: 'LCK', color: '#a78bfa' },
];

function StatBlock({ stats }: { stats: import('../store/gameStore').CrewStats }) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {STAT_LABELS.map(({ key, abbr, color }) => (
        <div key={key} className="flex flex-col items-center">
          <span className="text-[9px] tracking-[0.2em] uppercase" style={{ color: CLR.dim, fontFamily: SANS, fontWeight: 500 }}>
            {abbr}
          </span>
          <span className="text-[16px] tabular-nums mt-0.5" style={{ color, fontFamily: MONO, fontWeight: 600 }}>
            {stats[key]}
          </span>
          <div className="w-full h-[3px] rounded-full mt-1 overflow-hidden" style={{ backgroundColor: CLR.rule + '40' }}>
            <div
              className="h-full rounded-full"
              style={{ width: `${(stats[key] / 20) * 100}%`, backgroundColor: color, opacity: 0.7 }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Shared: Event history log ────────────────────────────────────────────

function HistoryLog({ history, maxEntries = 5 }: { history: import('../store/gameStore').CrewHistoryEntry[]; maxEntries?: number }) {
  const recent = history.slice(-maxEntries).reverse();
  if (recent.length === 0) return null;

  return (
    <div>
      <span className="text-[10px] tracking-[0.15em] uppercase" style={{ color: CLR.dim, fontFamily: SANS, fontWeight: 500 }}>
        Recent Events
      </span>
      <div className="mt-1 space-y-0.5">
        {recent.map((entry, i) => (
          <div key={i} className="flex items-start gap-2">
            <span className="text-[9px] tabular-nums shrink-0 mt-[2px]" style={{ color: CLR.rule, fontFamily: MONO }}>
              d{entry.day}
            </span>
            <span className="text-[11px] leading-snug" style={{ color: CLR.txt, fontFamily: SANS }}>
              {entry.event}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Crew roster row (clickable, navigates to detail) ────────────────────

function CrewRosterRow({ member, index, dayCount, onClick, onRoleChange, delay }: {
  member: CrewMember; index: number; dayCount: number; onClick: () => void;
  onRoleChange: (role: CrewRole) => void; delay: number;
}) {
  const [roleOpen, setRoleOpen] = useState(false);
  const hs = HEALTH_STYLE[member.health] ?? HEALTH_STYLE.healthy;
  const roleColor = ROLE_COLOR[member.role] ?? CLR.txt;
  const qs = QUALITY_STYLE[member.quality];
  const moraleColor_ = member.morale > 60 ? CLR.green : member.morale > 30 ? CLR.yellow : CLR.red;
  const isCaptain = member.role === 'Captain';
  const daysServed = Math.max(1, dayCount - member.hireDay);
  const isOdd = index % 2 === 1;
  const stripeBg = isOdd && !isCaptain ? CLR.bright + '03' : 'transparent';

  return (
    <motion.div
      initial={{ opacity: 0, y: 3 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay }}
    >
      {/* Separator after captain */}
      {index === 1 && (
        <div className="mx-3 mb-1" style={{ borderTop: `1px solid ${CLR.rule}25` }} />
      )}
      <div
        className={`w-full rounded-lg transition-all duration-150 cursor-pointer group ${isCaptain ? 'px-3 pt-3 pb-2 mb-0.5' : 'px-3 py-2.5'}`}
        style={{
          backgroundColor: isCaptain ? CLR.gold + '0a' : stripeBg,
          border: `1px solid ${isCaptain ? CLR.gold + '22' : 'transparent'}`,
          boxShadow: isCaptain ? `0 2px 12px ${CLR.gold}08` : undefined,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = isCaptain ? CLR.gold + '12' : CLR.bright + '08'; }}
        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = isCaptain ? CLR.gold + '0a' : stripeBg; }}
        onClick={onClick}
      >
        {/* Main row */}
        <div className="flex items-center gap-3">
          {/* Portrait */}
          <div
            className={`${isCaptain ? 'w-[64px] h-[64px]' : 'w-[48px] h-[48px]'} rounded-full shrink-0 overflow-hidden flex items-center justify-center`}
            style={{
              border: `${isCaptain ? '3' : '2.5'}px solid ${isCaptain ? CLR.gold + '80' : roleColor + '50'}`,
              backgroundColor: (isCaptain ? CLR.gold : roleColor) + '0a',
              boxShadow: isCaptain
                ? `inset 0 2px 6px rgba(0,0,0,0.4), 0 0 16px ${CLR.gold}18`
                : member.quality === 'legendary' ? `0 0 10px ${CLR.purple}25` : member.quality === 'rare' ? `0 0 8px ${CLR.teal}18` : `inset 0 2px 4px rgba(0,0,0,0.35)`,
            }}
          >
            <CrewPortraitSquare member={member} size={isCaptain ? 64 : 48} />
          </div>

          {/* Name + flag + quality */}
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span
              className={`${isCaptain ? 'text-[17px]' : 'text-[15px]'} truncate`}
              style={{ color: isCaptain ? CLR.gold : CLR.bright, fontFamily: SANS, fontWeight: isCaptain ? 600 : 500 }}
            >
              {member.name}
            </span>
            <FactionFlag nationality={member.nationality} size={isCaptain ? 22 : 18} />
            {member.quality !== 'normal' && (
              <span
                className={`${isCaptain ? 'text-[9px]' : 'text-[8px]'} tracking-wider uppercase px-1.5 py-0.5 rounded shrink-0`}
                style={{ color: qs.color, backgroundColor: qs.bg, border: `1px solid ${qs.border}`, fontFamily: SANS, fontWeight: 600 }}
              >
                {qs.label}
              </span>
            )}
            {isCaptain && (
              <span className="text-[10px] tabular-nums shrink-0" style={{ color: CLR.dimGold, fontFamily: MONO }}>
                Lvl {member.level}
              </span>
            )}
          </div>

          {/* Role — clickable dropdown */}
          <div className="relative w-[78px] shrink-0">
            {isCaptain ? (
              <span className="text-[13px] tracking-wide" style={{ color: roleColor, fontFamily: SANS, fontWeight: 700 }}>
                Captain
              </span>
            ) : (
              <button
                onClick={(e) => { e.stopPropagation(); sfxClick(); setRoleOpen(!roleOpen); }}
                className="text-[12px] hover:underline underline-offset-2 transition-colors flex items-center gap-1"
                style={{ color: roleColor, fontFamily: SANS, fontWeight: 500 }}
              >
                {member.role}
                <span className="text-[8px] opacity-50">▾</span>
              </button>
            )}
            {/* Role dropdown */}
            <AnimatePresence>
              {roleOpen && !isCaptain && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.15 }}
                  className="absolute top-full left-0 mt-1 z-30 rounded-lg py-1 min-w-[100px]"
                  style={{ backgroundColor: '#141210', border: `1px solid ${CLR.rule}50`, boxShadow: '0 8px 24px rgba(0,0,0,0.6)' }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {ASSIGNABLE_ROLES.map(role => {
                    const isActive = member.role === role;
                    const rc = ROLE_COLOR[role] ?? CLR.txt;
                    return (
                      <button
                        key={role}
                        onClick={(e) => { e.stopPropagation(); onRoleChange(role); setRoleOpen(false); }}
                        className="w-full text-left px-3 py-1.5 text-[11px] transition-colors hover:bg-white/[0.05]"
                        style={{ color: isActive ? rc : CLR.txt, fontFamily: SANS, fontWeight: isActive ? 600 : 400 }}
                      >
                        {isActive && <span className="mr-1">•</span>}{role}
                      </button>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Skill mini bar */}
          <div className="hidden md:flex items-center gap-1.5 w-[72px] shrink-0">
            <div className="flex-1 h-[4px] rounded-full overflow-hidden" style={{ backgroundColor: CLR.rule + '40' }}>
              <div className="h-full rounded-full" style={{ width: `${member.skill}%`, backgroundColor: CLR.cyan }} />
            </div>
            <span className="text-[11px] tabular-nums w-[22px] text-right" style={{ color: CLR.txt, fontFamily: MONO }}>{member.skill}</span>
          </div>

          {/* Health */}
          <span
            className="text-[11px] w-[48px] text-right shrink-0"
            style={{ color: hs.color, fontFamily: SANS, fontWeight: 600 }}
          >
            {hs.label}
          </span>

          {/* Morale bar + value */}
          <div className="flex items-center gap-1.5 w-[52px] shrink-0 justify-end">
            <div className="w-[28px] h-[4px] rounded-full overflow-hidden" style={{ backgroundColor: CLR.rule + '40' }}>
              <div className="h-full rounded-full" style={{ width: `${member.morale}%`, backgroundColor: moraleColor_ }} />
            </div>
            <span className="text-[10px] tabular-nums" style={{ color: moraleColor_, fontFamily: MONO }}>{member.morale}</span>
          </div>

          {/* Days served */}
          <span
            className="hidden md:block text-[10px] tabular-nums w-[36px] text-right shrink-0"
            style={{ color: CLR.dim, fontFamily: MONO }}
          >
            {daysServed}
          </span>

          {/* Navigate chevron — slides on hover */}
          <span
            className="text-[11px] shrink-0 opacity-25 group-hover:opacity-70 group-hover:translate-x-0.5 transition-all duration-150"
            style={{ color: CLR.bright }}
          >
            ▸
          </span>
        </div>

        {/* Captain extras: traits + XP bar */}
        {isCaptain && (
          <div className="mt-2 ml-[64px] flex items-center gap-3 flex-wrap">
            {/* Traits */}
            {member.traits.map(t => (
              <span
                key={t}
                className="text-[9px] tracking-wide px-2 py-0.5 rounded"
                style={{ color: CLR.teal, backgroundColor: CLR.teal + '10', border: `1px solid ${CLR.teal}18`, fontFamily: SANS, fontWeight: 500 }}
              >
                {t}
              </span>
            ))}
            {member.abilities.map(a => (
              <span
                key={a}
                className="text-[9px] tracking-wide px-2 py-0.5 rounded"
                style={{ color: CLR.gold, backgroundColor: CLR.gold + '10', border: `1px solid ${CLR.gold}18`, fontFamily: SANS, fontWeight: 500 }}
              >
                {a}
              </span>
            ))}
            {/* XP bar */}
            <div className="flex items-center gap-1.5 ml-auto">
              <div className="w-[60px] h-[3px] rounded-full overflow-hidden" style={{ backgroundColor: CLR.rule + '40' }}>
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${Math.min(100, (member.xp / member.xpToNext) * 100)}%`,
                    backgroundColor: CLR.gold,
                    boxShadow: `0 0 4px ${CLR.gold}30`,
                  }}
                />
              </div>
              <span className="text-[9px] tabular-nums" style={{ color: CLR.dimGold, fontFamily: MONO }}>
                {member.xp}/{member.xpToNext}
              </span>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ── Crew detail view (full-page character sheet) ────────────────────────

function CrewDetailView({ member, onBack, onRoleChange }: {
  member: CrewMember;
  onBack: () => void;
  onRoleChange: (role: CrewRole) => void;
}) {
  const [portraitModalOpen, setPortraitModalOpen] = useState(false);
  const sparkle = useSparkle();
  const qs = QUALITY_STYLE[member.quality];
  const roleColor = ROLE_COLOR[member.role] ?? CLR.txt;
  const moraleColor_ = member.morale > 60 ? CLR.green : member.morale > 30 ? CLR.yellow : CLR.red;
  const isCaptain = member.role === 'Captain';

  return (
    <motion.div
      key={`crew-detail-${member.id}`}
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -12 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col items-center w-full"
    >
      {/* Breadcrumb */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
        className="w-full max-w-xl px-2 md:px-4 mt-1"
      >
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => { sfxClick(); onBack(); }}
            className="text-[11px] tracking-[0.12em] uppercase hover:underline underline-offset-2 transition-colors"
            style={{ color: CLR.tabCrew, fontFamily: SANS, fontWeight: 500 }}
          >
            Crew
          </button>
          <span className="text-[11px]" style={{ color: CLR.dim }}>›</span>
          <span
            className="text-[11px] tracking-[0.08em]"
            style={{ color: CLR.bright, fontFamily: SANS, fontWeight: 500 }}
          >
            {member.name}
          </span>
        </div>
      </motion.div>

      {/* Portrait + Identity */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.05 }}
        className="mt-5 w-full max-w-xl px-2 md:px-4 flex flex-col items-center"
      >
        {/* Large portrait circle — click to open full modal */}
        <div className="relative">
          <div
            className="w-[100px] h-[100px] rounded-full overflow-hidden flex items-center justify-center cursor-pointer transition-transform hover:scale-105 active:scale-95"
            style={{
              border: `3px solid ${isCaptain ? CLR.gold : roleColor}60`,
              backgroundColor: (isCaptain ? CLR.gold : roleColor) + '0c',
              boxShadow: `inset 0 3px 8px rgba(0,0,0,0.5), 0 0 20px ${(isCaptain ? CLR.gold : roleColor)}15`,
            }}
            onClick={(e) => { e.stopPropagation(); setPortraitModalOpen(true); }}
            title="Click to view full portrait"
          >
            <CrewPortraitSquare member={member} size={100} />
          </div>
          {/* Quality glow */}
          {member.quality === 'legendary' && (
            <span className="absolute -top-1 -right-1 text-[12px]" style={{ color: CLR.purple + '80' }}>
              {sparkle(0)}
            </span>
          )}
        </div>

        {/* Name + badges */}
        <div className="flex items-center gap-2 mt-3 flex-wrap justify-center">
          <h2
            className="text-[20px] md:text-[22px]"
            style={{ color: isCaptain ? CLR.gold : CLR.bright, fontFamily: SANS, fontWeight: 600 }}
          >
            {member.name}
          </h2>
          <FactionFlag nationality={member.nationality} size={18} />
        </div>

        {/* Role + Quality badges */}
        <div className="flex items-center gap-2 mt-1.5">
          <span
            className="text-[10px] tracking-[0.18em] uppercase px-2 py-0.5 rounded"
            style={{
              color: roleColor,
              backgroundColor: roleColor + '15',
              border: `1px solid ${roleColor}30`,
              fontFamily: SANS,
              fontWeight: 600,
            }}
          >
            {member.role}
          </span>
          {member.quality !== 'normal' && (
            <span
              className="text-[9px] tracking-wider uppercase px-1.5 py-0.5 rounded"
              style={{ color: qs.color, backgroundColor: qs.bg, border: `1px solid ${qs.border}`, fontFamily: SANS, fontWeight: 600 }}
            >
              {qs.label}
            </span>
          )}
          {isCaptain && (
            <span className="text-[10px] tabular-nums" style={{ color: CLR.gold, fontFamily: MONO }}>
              Lvl {member.level}
            </span>
          )}
        </div>

        {/* Bio line */}
        <p className="text-[12px] mt-2" style={{ color: CLR.dim, fontFamily: SANS }}>
          {member.nationality} &middot; Age {member.age} &middot; {member.birthplace}
        </p>
      </motion.div>

      {/* Backstory */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.12 }}
        className="mt-4 w-full max-w-xl px-4 md:px-6"
      >
        <p
          className="text-[13px] leading-relaxed text-center"
          style={{ color: CLR.txt, fontFamily: SERIF, fontStyle: 'italic' }}
        >
          &ldquo;{member.backstory}&rdquo;
        </p>
      </motion.div>

      {/* Divider */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2, delay: 0.18 }}
        className="mt-4 w-full max-w-xl"
      >
        <WaveDivider width={48} />
      </motion.div>

      {/* Traits & Abilities */}
      {(member.traits.length > 0 || member.abilities.length > 0) && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.25, delay: 0.2 }}
          className="mt-3 w-full max-w-xl px-2 md:px-4"
        >
          <div className="flex items-center gap-2 flex-wrap">
            {member.traits.map(t => (
              <span
                key={t}
                className="text-[10px] tracking-wide px-2.5 py-1 rounded"
                style={{ color: CLR.teal, backgroundColor: CLR.teal + '12', border: `1px solid ${CLR.teal}20`, fontFamily: SANS, fontWeight: 500 }}
              >
                {t}
              </span>
            ))}
            {member.abilities.map(a => (
              <span
                key={a}
                className="text-[10px] tracking-wide px-2.5 py-1 rounded"
                style={{ color: CLR.gold, backgroundColor: CLR.gold + '12', border: `1px solid ${CLR.gold}20`, fontFamily: SANS, fontWeight: 500 }}
              >
                {a}
              </span>
            ))}
          </div>
        </motion.div>
      )}

      {/* Stats section */}
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.22 }}
        className="mt-4 w-full max-w-xl px-2 md:px-4"
      >
        {/* Skill + Morale + Level/XP row */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div
            className="p-3 rounded-lg"
            style={{ backgroundColor: CLR.rule + '12', border: `1px solid ${CLR.rule}20` }}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] tracking-[0.15em] uppercase" style={{ color: CLR.dim, fontFamily: SANS, fontWeight: 500 }}>
                Skill
              </span>
              <span className="text-[14px] tabular-nums" style={{ color: CLR.cyan, fontFamily: MONO, fontWeight: 600 }}>{member.skill}</span>
            </div>
            <div className="h-[5px] rounded-full overflow-hidden" style={{ backgroundColor: CLR.rule + '40' }}>
              <div className="h-full rounded-full" style={{ width: `${member.skill}%`, backgroundColor: CLR.cyan, boxShadow: `0 0 6px ${CLR.cyan}30` }} />
            </div>
          </div>
          <div
            className="p-3 rounded-lg"
            style={{ backgroundColor: CLR.rule + '12', border: `1px solid ${CLR.rule}20` }}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] tracking-[0.15em] uppercase" style={{ color: CLR.dim, fontFamily: SANS, fontWeight: 500 }}>
                Morale
              </span>
              <span className="text-[14px] tabular-nums" style={{ color: moraleColor_, fontFamily: MONO, fontWeight: 600 }}>{member.morale}%</span>
            </div>
            <div className="h-[5px] rounded-full overflow-hidden" style={{ backgroundColor: CLR.rule + '40' }}>
              <div className="h-full rounded-full" style={{ width: `${member.morale}%`, backgroundColor: moraleColor_ }} />
            </div>
          </div>
        </div>

        {/* XP bar (for captain or leveled crew) */}
        {member.level > 1 || isCaptain ? (
          <div
            className="p-3 rounded-lg mb-4"
            style={{ backgroundColor: CLR.rule + '12', border: `1px solid ${CLR.rule}20` }}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] tracking-[0.15em] uppercase" style={{ color: CLR.dim, fontFamily: SANS, fontWeight: 500 }}>
                Experience
              </span>
              <span className="text-[12px] tabular-nums" style={{ color: CLR.gold, fontFamily: MONO }}>
                Lvl {member.level} &middot; {member.xp}/{member.xpToNext} XP
              </span>
            </div>
            <div className="h-[5px] rounded-full overflow-hidden" style={{ backgroundColor: CLR.rule + '40' }}>
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${Math.min(100, (member.xp / member.xpToNext) * 100)}%`,
                  backgroundColor: CLR.gold,
                  boxShadow: `0 0 6px ${CLR.gold}30`,
                }}
              />
            </div>
          </div>
        ) : null}

        {/* D&D Stats */}
        <div
          className="p-3 rounded-lg"
          style={{ backgroundColor: CLR.rule + '12', border: `1px solid ${CLR.rule}20` }}
        >
          <span className="text-[10px] tracking-[0.15em] uppercase block mb-2" style={{ color: CLR.dim, fontFamily: SANS, fontWeight: 500 }}>
            Attributes
          </span>
          <StatBlock stats={member.stats} />
        </div>
      </motion.div>

      {/* Divider */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2, delay: 0.28 }}
        className="mt-4 w-full max-w-xl"
      >
        <WaveDivider width={48} />
      </motion.div>

      {/* History log */}
      {member.history.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.25, delay: 0.3 }}
          className="mt-3 w-full max-w-xl px-2 md:px-4"
        >
          <HistoryLog history={member.history} maxEntries={10} />
        </motion.div>
      )}

      {/* Role assignment */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25, delay: 0.35 }}
        className="mt-4 w-full max-w-xl px-2 md:px-4 mb-4"
      >
        <div
          className="p-3 rounded-lg"
          style={{ backgroundColor: CLR.rule + '12', border: `1px solid ${CLR.rule}20` }}
        >
          {isCaptain ? (
            <p className="text-[11px]" style={{ color: CLR.dim, fontFamily: SANS, fontStyle: 'italic' }}>
              The captain commands the vessel. To change captains, select another crew member and promote them.
            </p>
          ) : (
            <>
              <span className="text-[10px] tracking-[0.15em] uppercase block mb-2" style={{ color: CLR.dim, fontFamily: SANS, fontWeight: 500 }}>
                Assign Role
              </span>
              <div className="flex items-center gap-1.5 flex-wrap">
                {ASSIGNABLE_ROLES.map(role => {
                  const isActive = member.role === role;
                  const rc = ROLE_COLOR[role] ?? CLR.txt;
                  return (
                    <button
                      key={role}
                      onClick={() => { sfxClick(); onRoleChange(role); }}
                      className="text-[11px] tracking-wide px-2.5 py-1 rounded transition-all"
                      style={{
                        color: isActive ? rc : CLR.dim,
                        backgroundColor: isActive ? rc + '15' : 'transparent',
                        border: `1px solid ${isActive ? rc + '40' : CLR.rule + '30'}`,
                        fontFamily: SANS,
                        fontWeight: isActive ? 600 : 400,
                      }}
                    >
                      {role}
                    </button>
                  );
                })}
              </div>

              {/* Promote to Captain */}
              <div className="mt-3 pt-3" style={{ borderTop: `1px solid ${CLR.rule}25` }}>
                <button
                  onClick={() => { sfxClick(); onRoleChange('Captain' as CrewRole); }}
                  className="text-[11px] tracking-[0.12em] uppercase px-3 py-1.5 rounded transition-all hover:bg-amber-500/10"
                  style={{
                    color: CLR.gold,
                    border: `1px solid ${CLR.gold}30`,
                    fontFamily: SANS,
                    fontWeight: 600,
                  }}
                >
                  Promote to Captain
                </button>
                <p className="text-[10px] mt-1.5" style={{ color: CLR.dim, fontFamily: SANS }}>
                  The current captain will be demoted to Sailor.
                </p>
              </div>
            </>
          )}
        </div>
      </motion.div>

      {/* Portrait modal */}
      <PortraitModal member={member} open={portraitModalOpen} onClose={() => setPortraitModalOpen(false)} />
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SHIP TAB
// ═══════════════════════════════════════════════════════════════════════════

const SHIP_DESCRIPTIONS: Record<string, { tagline: string; description: string }> = {
  Carrack: {
    tagline: 'Three-masted ocean trader',
    description: 'The workhorse of the Indian Ocean trade. Sturdy hull, generous cargo space, and enough deck room for a handful of guns. Slow to turn but reliable in heavy seas.',
  },
  Galleon: {
    tagline: 'Heavy armed merchantman',
    description: 'The largest vessel on these waters. Built for war and treasure hauling, with high castles fore and aft. Devastating broadside but sluggish in shallow waters.',
  },
  Dhow: {
    tagline: 'Lateen-rigged coastal trader',
    description: 'Fast and nimble, with a shallow draft perfect for navigating reefs and coastal shallows. The traditional vessel of Arab and Swahili mariners, rigged to ride the monsoon winds.',
  },
  Junk: {
    tagline: 'Battened-sail cargo vessel',
    description: 'Sturdy watertight compartments and distinctive batten sails make the junk an excellent cargo hauler. Chinese shipbuilding at its finest — reliable, capacious, and surprisingly tough.',
  },
  Pinnace: {
    tagline: 'Swift scout vessel',
    description: 'Small, fast, and maneuverable. Ideal for scouting, coastal trading, and quick getaways. Light armament and limited cargo, but nothing on the water can catch her.',
  },
};

// ── Large ship schematics ────────────────────────────────────────────────

function LargeShipSchematic({ shipType, hullPct, armament }: {
  shipType: string; hullPct: number; armament: string[];
}) {
  const s = CLR.sail;
  const m = CLR.mast;
  const w = CLR.water;
  const wl = CLR.waterLight;

  // Hull color based on damage
  const hc = hullPct > 60 ? CLR.hull : hullPct > 30 ? '#b8860b' : '#8b3a3a';
  // Bow/mid/stern derived from single hull value with slight variation
  const bowPct = Math.min(100, Math.max(0, hullPct + (hullPct > 50 ? -8 : -15)));
  const midPct = Math.min(100, hullPct);
  const sternPct = Math.min(100, Math.max(0, hullPct + (hullPct > 50 ? 5 : -5)));
  const bowC = bowPct > 60 ? CLR.green : bowPct > 30 ? CLR.yellow : CLR.red;
  const midC = midPct > 60 ? CLR.green : midPct > 30 ? CLR.yellow : CLR.red;
  const sternC = sternPct > 60 ? CLR.green : sternPct > 30 ? CLR.yellow : CLR.red;

  // Weapon mount marker
  const hasSwivel = armament.includes('swivelGun');
  const broadsideCount = armament.filter(w => w !== 'swivelGun').length;
  const portMark = (i: number) => i < broadsideCount ? '\u2295' : '\u00b7';

  const schematics: Record<string, React.ReactNode> = {
    Carrack: (
      <>
        <C c={m}>{'                |    |    |'}</C>{'\n'}
        <C c={s}>{'               )_)  )_)  )_)'}</C>{'\n'}
        <C c={s}>{'              )___))___))___)\\'}</C>{'\n'}
        <C c={s}>{'             )____)____)_____)\\\\' }</C>{'\n'}
        <C c={hc}>{'          ╔═══════════════════════╗'}</C>{'\n'}
        <C c={hc}>{'          ║'}</C><C c={bowC}>{hasSwivel ? ' \u2295' : '  '}</C><C c={hc}>{'     '}</C><C c={midC}>{portMark(0)}{' '}{portMark(1)}</C><C c={hc}>{'     '}</C><C c={sternC}>{portMark(2)}</C><C c={hc}>{'       ║'}</C>{'\n'}
        <C c={hc}>{'          ║'}</C><C c={bowC}>{'  '}</C><C c={hc}>{'     '}</C><C c={midC}>{portMark(3)}{' '}{portMark(4)}</C><C c={hc}>{'     '}</C><C c={sternC}>{portMark(5)}</C><C c={hc}>{'       ║'}</C>{'\n'}
        <C c={hc}>{'          ╚═══════════════════════╝'}</C>{'\n'}
        <C c={w}>{'        ≈≈≈≈'}</C><C c={wl}>{'≈≈≈≈≈≈≈≈≈≈≈≈'}</C><C c={w}>{'≈≈≈≈≈≈≈≈≈'}</C>{'\n'}
        <C c={wl}>{'         ∼∼∼   ∼∼∼'}</C><C c={w}>{'   ∼∼∼   ∼∼∼   ∼∼∼'}</C>
      </>
    ),
    Galleon: (
      <>
        <C c={m}>{'             |    |    |    |'}</C>{'\n'}
        <C c={s}>{'            )_)  )_)  )_)  )_)'}</C>{'\n'}
        <C c={s}>{'           )___))___))___))___)\\'}</C>{'\n'}
        <C c={s}>{'          )____)____)____)_____)\\\\' }</C>{'\n'}
        <C c={hc}>{'       ╔══════════════════════════════╗'}</C>{'\n'}
        <C c={hc}>{'       ║'}</C><C c={bowC}>{hasSwivel ? ' \u2295' : '  '}</C><C c={hc}>{'    '}</C><C c={midC}>{portMark(0)}{' '}{portMark(1)}{' '}{portMark(2)}</C><C c={hc}>{'    '}</C><C c={sternC}>{portMark(3)}{' '}{portMark(4)}</C><C c={hc}>{'       ║'}</C>{'\n'}
        <C c={hc}>{'       ║'}</C><C c={bowC}>{'  '}</C><C c={hc}>{'    '}</C><C c={midC}>{portMark(5)}{' '}{portMark(6)}{' '}{portMark(7)}</C><C c={hc}>{'    '}</C><C c={sternC}>{portMark(8)}{' '}{portMark(9)}</C><C c={hc}>{'       ║'}</C>{'\n'}
        <C c={hc}>{'       ╚══════════════════════════════╝'}</C>{'\n'}
        <C c={w}>{'     ≈≈≈≈≈'}</C><C c={wl}>{'≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈'}</C><C c={w}>{'≈≈≈≈≈≈≈≈≈≈≈'}</C>{'\n'}
        <C c={wl}>{'      ∼∼∼   ∼∼∼   ∼∼∼'}</C><C c={w}>{'   ∼∼∼   ∼∼∼   ∼∼∼'}</C>
      </>
    ),
    Dhow: (
      <>
        <C c={m}>{'                  |'}</C>{'\n'}
        <C c={s}>{'                 /|'}</C>{'\n'}
        <C c={s}>{'                / |'}</C>{'\n'}
        <C c={s}>{'               /  |'}</C>{'\n'}
        <C c={s}>{'              /   |'}</C>{'\n'}
        <C c={hc}>{'          ╔═══════════════╗'}</C>{'\n'}
        <C c={hc}>{'          ║'}</C><C c={bowC}>{hasSwivel ? ' \u2295' : '  '}</C><C c={hc}>{'    '}</C><C c={midC}>{portMark(0)}</C><C c={hc}>{'    '}</C><C c={sternC}>{portMark(1)}</C><C c={hc}>{'   ║'}</C>{'\n'}
        <C c={hc}>{'          ╚═══════════════╝'}</C>{'\n'}
        <C c={w}>{'        ≈≈≈≈'}</C><C c={wl}>{'≈≈≈≈≈≈≈≈'}</C><C c={w}>{'≈≈≈≈≈≈≈'}</C>{'\n'}
        <C c={wl}>{'          ∼∼∼   ∼∼∼'}</C><C c={w}>{'   ∼∼∼'}</C>
      </>
    ),
    Junk: (
      <>
        <C c={m}>{'              |     |'}</C>{'\n'}
        <C c={s}>{'             ┤│    ┤│'}</C>{'\n'}
        <C c={s}>{'             ┤│    ┤│'}</C>{'\n'}
        <C c={s}>{'             ┤│    ┤│'}</C>{'\n'}
        <C c={hc}>{'          ╔════════════════════╗'}</C>{'\n'}
        <C c={hc}>{'          ║'}</C><C c={bowC}>{hasSwivel ? ' \u2295' : '  '}</C><C c={hc}>{'    '}</C><C c={midC}>{portMark(0)}{' '}{portMark(1)}</C><C c={hc}>{'    '}</C><C c={sternC}>{portMark(2)}</C><C c={hc}>{'    ║'}</C>{'\n'}
        <C c={hc}>{'          ║'}</C><C c={bowC}>{'  '}</C><C c={hc}>{'    '}</C><C c={midC}>{portMark(3)}{' '}{portMark(4)}</C><C c={hc}>{'    '}</C><C c={sternC}>{portMark(5)}</C><C c={hc}>{'    ║'}</C>{'\n'}
        <C c={hc}>{'          ╚════════════════════╝'}</C>{'\n'}
        <C c={w}>{'        ≈≈≈≈'}</C><C c={wl}>{'≈≈≈≈≈≈≈≈≈≈'}</C><C c={w}>{'≈≈≈≈≈≈≈≈'}</C>{'\n'}
        <C c={wl}>{'          ∼∼∼   ∼∼∼'}</C><C c={w}>{'   ∼∼∼   ∼∼'}</C>
      </>
    ),
    Pinnace: (
      <>
        <C c={m}>{'                 |'}</C>{'\n'}
        <C c={s}>{'                )|'}</C>{'\n'}
        <C c={s}>{'               )_)'}</C>{'\n'}
        <C c={s}>{'              )__)'}</C>{'\n'}
        <C c={hc}>{'          ╔══════════════╗'}</C>{'\n'}
        <C c={hc}>{'          ║'}</C><C c={bowC}>{hasSwivel ? ' \u2295' : '  '}</C><C c={hc}>{'   '}</C><C c={midC}>{portMark(0)}</C><C c={hc}>{'   '}</C><C c={sternC}>{portMark(1)}</C><C c={hc}>{'   ║'}</C>{'\n'}
        <C c={hc}>{'          ╚══════════════╝'}</C>{'\n'}
        <C c={w}>{'        ≈≈≈≈'}</C><C c={wl}>{'≈≈≈≈≈≈≈'}</C><C c={w}>{'≈≈≈≈≈≈'}</C>{'\n'}
        <C c={wl}>{'         ∼∼∼   ∼∼∼'}</C><C c={w}>{'   ∼∼∼'}</C>
      </>
    ),
  };

  return (
    <pre className="text-[11px] leading-[1.4] whitespace-pre text-center select-none" style={{ fontFamily: MONO }}>
      {schematics[shipType] ?? schematics.Carrack}
    </pre>
  );
}

// ── Condition stripe ─────────────────────────────────────────────────────

function ConditionStripe({ hullPct, sailsPct, avgMorale, crewHealthPct }: {
  hullPct: number; sailsPct: number; avgMorale: number; crewHealthPct: number;
}) {
  // Weighted composite: hull matters most, then morale, sails, crew health
  const composite = hullPct * 0.4 + avgMorale * 0.25 + sailsPct * 0.2 + crewHealthPct * 0.15;
  const tiers = [
    { label: 'GOOD', min: 70, color: CLR.green },
    { label: 'FAIR', min: 40, color: CLR.yellow },
    { label: 'POOR', min: 20, color: CLR.orange },
    { label: 'CRITICAL', min: 0, color: CLR.red },
  ];
  const active = tiers.find(t => composite >= t.min) ?? tiers[tiers.length - 1];

  return (
    <div
      className="flex items-center justify-center gap-1 py-2 px-4 rounded-lg"
      style={{ backgroundColor: active.color + '0a', border: `1px solid ${active.color}25` }}
    >
      {tiers.map(t => {
        const isActive = t.label === active.label;
        return (
          <div key={t.label} className="flex items-center gap-1.5 px-2">
            <span
              className="w-[10px] h-[10px] rounded-sm transition-all duration-500"
              style={{
                backgroundColor: isActive ? t.color : CLR.rule + '40',
                boxShadow: isActive ? `0 0 8px ${t.color}40` : 'none',
              }}
            />
            <span
              className="text-[10px] tracking-[0.15em] uppercase transition-colors duration-300"
              style={{
                color: isActive ? t.color : CLR.rule,
                fontFamily: SANS,
                fontWeight: isActive ? 700 : 400,
              }}
            >
              {t.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Ship tab main ────────────────────────────────────────────────────────

function ShipTab() {
  const { ship, stats, crew } = useGameStore();
  const sparkle = useSparkle();

  const hullPct = Math.round((stats.hull / stats.maxHull) * 100);
  const sailsPct = Math.round((stats.sails / stats.maxSails) * 100);
  const avgMorale = Math.round(crew.reduce((a, c) => a + c.morale, 0) / (crew.length || 1));
  const healthyCrew = crew.filter(c => c.health === 'healthy').length;
  const crewHealthPct = Math.round((healthyCrew / (crew.length || 1)) * 100);
  const shipDesc = SHIP_DESCRIPTIONS[ship.type] ?? SHIP_DESCRIPTIONS.Carrack;

  // Weapon summary
  const weaponCounts: Record<string, { count: number; weapon: typeof WEAPON_DEFS[keyof typeof WEAPON_DEFS] }> = {};
  stats.armament.forEach(w => {
    const def = WEAPON_DEFS[w];
    if (!weaponCounts[def.name]) weaponCounts[def.name] = { count: 0, weapon: def };
    weaponCounts[def.name].count++;
  });

  // Damage segments
  const bowPct = Math.min(100, Math.max(0, hullPct + (hullPct > 50 ? -8 : -15)));
  const midPct = Math.min(100, hullPct);
  const sternPct = Math.min(100, Math.max(0, hullPct + (hullPct > 50 ? 5 : -5)));

  return (
    <motion.div
      key="ship"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col items-center w-full"
    >
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.05 }}
        className="text-center mt-1"
      >
        <div className="flex items-center justify-center gap-3">
          <FactionFlag nationality={ship.flag as Nationality} size={22} />
          <h2
            className="text-[20px] md:text-[22px] tracking-[0.2em] uppercase"
            style={{ color: CLR.tabShip, fontFamily: MONO }}
          >
            {ship.name}
          </h2>
        </div>
        <p className="text-[13px] mt-1" style={{ color: CLR.txt, fontFamily: SERIF, fontStyle: 'italic' }}>
          {shipDesc.tagline}
        </p>
      </motion.div>

      {/* Large schematic */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.12 }}
        className="mt-4"
      >
        <LargeShipSchematic shipType={ship.type} hullPct={hullPct} armament={stats.armament} />
      </motion.div>

      {/* Damage segments */}
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.22 }}
        className="mt-3 flex items-center gap-3 md:gap-5"
      >
        <DamageSegment label="Bow" pct={bowPct} />
        <DamageSegment label="Midship" pct={midPct} />
        <DamageSegment label="Stern" pct={sternPct} />
      </motion.div>

      {/* Condition stripe */}
      <motion.div
        initial={{ opacity: 0, scaleX: 0.8 }}
        animate={{ opacity: 1, scaleX: 1 }}
        transition={{ duration: 0.35, delay: 0.28 }}
        className="mt-3 w-full max-w-lg px-2 md:px-4"
      >
        <ConditionStripe hullPct={hullPct} sailsPct={sailsPct} avgMorale={avgMorale} crewHealthPct={crewHealthPct} />
      </motion.div>

      {/* Wave divider */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.32 }}
        className="mt-4 w-full max-w-lg"
      >
        <WaveDivider width={52} />
      </motion.div>

      {/* Stats + Armament in two columns on desktop */}
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.36 }}
        className="mt-4 w-full max-w-xl px-2 md:px-4"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Ship stats */}
          <div
            className="p-3 rounded-lg"
            style={{ backgroundColor: CLR.tabShip + '06', border: `1px solid ${CLR.tabShip}20` }}
          >
            <h3 className="text-[10px] tracking-[0.18em] uppercase mb-2" style={{ color: CLR.dimGold, fontFamily: SANS, fontWeight: 600 }}>
              Condition
            </h3>
            <div className="space-y-2.5">
              <ShipStatRow label="Hull" value={`${stats.hull}/${stats.maxHull}`} pct={hullPct} color={hullColor(hullPct)} />
              <ShipStatRow label="Sails" value={`${stats.sails}/${stats.maxSails}`} pct={sailsPct} color={sailsPct > 50 ? CLR.txt : CLR.yellow} />
              <ShipStatRow label="Speed" value={`${stats.speed} kn`} pct={stats.speed / 25 * 100} color={CLR.cyan} />
              <ShipStatRow label="Turn" value={`${stats.turnSpeed}`} pct={stats.turnSpeed / 3 * 100} color={CLR.cyan} />
              <ShipStatRow label="Cargo" value={`${stats.cargoCapacity} units`} pct={stats.cargoCapacity / 150 * 100} color={CLR.teal} />
            </div>
          </div>

          {/* Armament */}
          <div
            className="p-3 rounded-lg"
            style={{ backgroundColor: CLR.red + '05', border: `1px solid ${CLR.red}15` }}
          >
            <h3 className="text-[10px] tracking-[0.18em] uppercase mb-2" style={{ color: CLR.dimGold, fontFamily: SANS, fontWeight: 600 }}>
              Armament
            </h3>
            {Object.entries(weaponCounts).length > 0 ? (
              <div className="space-y-2">
                {Object.entries(weaponCounts).map(([name, { count, weapon }]) => (
                  <div key={name}>
                    <div className="flex items-center justify-between">
                      <span className="text-[13px]" style={{ color: CLR.bright, fontFamily: SANS }}>
                        {count > 1 && <span style={{ color: CLR.dim }}>{count}\u00d7 </span>}
                        {name}
                      </span>
                      <span className="text-[9px] uppercase tracking-wider" style={{ color: weapon.aimable ? CLR.teal : CLR.dim, fontFamily: SANS }}>
                        {weapon.aimable ? 'Aimable' : 'Broadside'}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-[10px]" style={{ color: CLR.red, fontFamily: MONO }}>
                        DMG {weapon.damage}
                      </span>
                      <span className="text-[10px]" style={{ color: CLR.cyan, fontFamily: MONO }}>
                        RNG {weapon.range}
                      </span>
                      <span className="text-[10px]" style={{ color: CLR.dim, fontFamily: MONO }}>
                        RLD {weapon.reloadTime}s
                      </span>
                    </div>
                  </div>
                ))}
                {stats.cannons > 0 && (
                  <p className="text-[10px] mt-1" style={{ color: CLR.dim, fontFamily: SANS }}>
                    {stats.cannons} broadside gun{stats.cannons > 1 ? 's' : ''} mounted
                  </p>
                )}
              </div>
            ) : (
              <p className="text-[12px]" style={{ color: CLR.dim, fontFamily: SERIF, fontStyle: 'italic' }}>
                No weapons mounted. Visit a port shipyard.
              </p>
            )}
          </div>
        </div>
      </motion.div>

      {/* Ship description */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.42 }}
        className="mt-4 w-full max-w-xl px-2 md:px-4"
      >
        <div className="flex items-center gap-3 mb-2">
          <pre className="text-[11px] whitespace-pre select-none" style={{ fontFamily: MONO }}>
            <C c={CLR.rule}>{'\u2500'.repeat(4)}</C>
            <C c={CLR.dimGold}>{` ${sparkle(0)} `}</C>
            <C c={CLR.rule}>{'\u2500'.repeat(4)}</C>
          </pre>
          <span className="text-[10px] tracking-[0.18em] uppercase shrink-0" style={{ color: CLR.dimGold, fontFamily: SANS, fontWeight: 600 }}>
            About the {ship.type}
          </span>
          <div className="flex-1 h-[1px]" style={{ background: `linear-gradient(90deg, ${CLR.rule}60, transparent)` }} />
        </div>
        <p className="text-[12px] leading-relaxed" style={{ color: CLR.txt, fontFamily: SERIF, fontStyle: 'italic' }}>
          {shipDesc.description}
        </p>
      </motion.div>

      <div className="h-4" />
    </motion.div>
  );
}

function DamageSegment({ label, pct }: { label: string; pct: number }) {
  const color = pct > 60 ? CLR.green : pct > 30 ? CLR.yellow : CLR.red;
  return (
    <div className="flex flex-col items-center">
      <span className="text-[9px] tracking-[0.15em] uppercase mb-1" style={{ color: CLR.dim, fontFamily: SANS, fontWeight: 500 }}>
        {label}
      </span>
      <div className="w-[60px] md:w-[72px] h-[8px] rounded-full overflow-hidden" style={{ backgroundColor: CLR.rule + '40' }}>
        <motion.div
          className="h-full rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, delay: 0.3 }}
          style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}30` }}
        />
      </div>
      <span className="text-[11px] tabular-nums mt-0.5" style={{ color, fontFamily: MONO }}>{pct}%</span>
    </div>
  );
}

function ShipStatRow({ label, value, pct, color }: { label: string; value: string; pct: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] tracking-[0.12em] uppercase w-[40px] shrink-0" style={{ color: CLR.dim, fontFamily: SANS, fontWeight: 500 }}>
        {label}
      </span>
      <div className="flex-1 h-[5px] rounded-full overflow-hidden" style={{ backgroundColor: CLR.rule + '40' }}>
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, backgroundColor: color }} />
      </div>
      <span className="text-[11px] tabular-nums w-[56px] text-right shrink-0" style={{ color: CLR.bright, fontFamily: MONO }}>
        {value}
      </span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// CARGO TAB
// ═══════════════════════════════════════════════════════════════════════════

import { ALL_COMMODITIES, COMMODITY_DEFS, type Commodity } from '../utils/commodities';

// Derive colors and icons from the central commodity definitions
const COMMODITY_COLORS: Record<string, string> = Object.fromEntries(
  ALL_COMMODITIES.map(c => [c, COMMODITY_DEFS[c].color])
);
const COMMODITY_ICONS: Record<string, string> = Object.fromEntries(
  ALL_COMMODITIES.map(c => [c, COMMODITY_DEFS[c].icon])
);

function CargoTab() {
  const { cargo, stats, provisions, crew, ports, playerPos, activePort } = useGameStore();
  const sparkle = useSparkle();

  const currentCargo = Object.entries(cargo).reduce(
    (sum, [c, qty]) => sum + qty * (COMMODITY_DEFS[c as Commodity]?.weight ?? 1), 0
  );
  const freeCargo = stats.cargoCapacity - currentCargo;
  const usedPct = Math.round((currentCargo / stats.cargoCapacity) * 100);
  const isEmpty = currentCargo === 0;

  // Find nearest port for price estimates
  const nearPort = activePort ?? ports.reduce<typeof ports[0] | null>((best, p) => {
    const dx = playerPos[0] - p.position[0];
    const dz = playerPos[2] - p.position[2];
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < 80 && (!best || dist < Math.sqrt((playerPos[0] - best.position[0]) ** 2 + (playerPos[2] - best.position[2]) ** 2))) return p;
    return best;
  }, null);

  // Provisions: estimate days remaining
  const dailyConsumption = Math.max(1, Math.ceil(crew.length * 0.5));
  const daysRemaining = dailyConsumption > 0 ? Math.floor(provisions / dailyConsumption) : 999;

  // Total estimated sell value at nearest port
  const totalValue = nearPort
    ? ALL_COMMODITIES.reduce((sum, c) => sum + (cargo[c as keyof typeof cargo] ?? 0) * Math.floor((nearPort.prices[c as keyof typeof nearPort.prices] ?? 0) * 0.8), 0)
    : null;

  return (
    <motion.div
      key="cargo"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col items-center w-full"
    >
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.05 }}
        className="text-center mt-1"
      >
        <h2
          className="text-[20px] md:text-[22px] tracking-[0.25em] uppercase"
          style={{ color: CLR.tabCargo, fontFamily: MONO }}
        >
          Cargo
        </h2>
        <p className="text-[13px] mt-1" style={{ color: CLR.txt, fontFamily: SERIF, fontStyle: 'italic' }}>
          Hold Manifest &amp; Provisions
        </p>
      </motion.div>

      {/* Hold capacity gauge */}
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.12 }}
        className="mt-4 w-full max-w-xl px-2 md:px-4"
      >
        <div
          className="p-4 rounded-lg"
          style={{ backgroundColor: CLR.tabCargo + '06', border: `1px solid ${CLR.tabCargo}20` }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] tracking-[0.15em] uppercase" style={{ color: CLR.dimGold, fontFamily: SANS, fontWeight: 600 }}>
              Hold Capacity
            </span>
            <span className="text-[14px] tabular-nums" style={{ color: CLR.bright, fontFamily: MONO }}>
              {currentCargo} <span style={{ color: CLR.dim }}>/</span> {stats.cargoCapacity}
            </span>
          </div>

          {/* Segmented hold bar */}
          <div className="h-[10px] rounded-full overflow-hidden flex" style={{ backgroundColor: CLR.rule + '40' }}>
            {ALL_COMMODITIES.map(c => {
              const qty = cargo[c as keyof typeof cargo] ?? 0;
              if (qty === 0) return null;
              const pct = (qty / stats.cargoCapacity) * 100;
              return (
                <motion.div
                  key={c}
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.6, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
                  className="h-full"
                  style={{ backgroundColor: COMMODITY_COLORS[c], opacity: 0.85 }}
                  title={`${c}: ${qty}`}
                />
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            {ALL_COMMODITIES.map(c => {
              const qty = cargo[c as keyof typeof cargo] ?? 0;
              if (qty === 0) return null;
              return (
                <div key={c} className="flex items-center gap-1">
                  <span className="w-[8px] h-[8px] rounded-sm" style={{ backgroundColor: COMMODITY_COLORS[c] }} />
                  <span className="text-[10px]" style={{ color: CLR.dim, fontFamily: SANS }}>{c}</span>
                </div>
              );
            })}
            {freeCargo > 0 && (
              <span className="text-[10px] ml-auto" style={{ color: CLR.dim, fontFamily: SANS }}>
                {freeCargo} units free ({100 - usedPct}%)
              </span>
            )}
          </div>
        </div>
      </motion.div>

      {/* Commodity manifest */}
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.2 }}
        className="mt-4 w-full max-w-xl px-2 md:px-4"
      >
        {/* Table header */}
        <div className="flex items-center gap-2 px-3 py-2 mb-1">
          <span className="text-[10px] tracking-[0.15em] uppercase flex-1" style={{ color: CLR.dim, fontFamily: SANS, fontWeight: 500 }}>
            Commodity
          </span>
          <span className="text-[10px] tracking-[0.15em] uppercase w-[100px] text-center hidden md:block" style={{ color: CLR.dim, fontFamily: SANS, fontWeight: 500 }}>
            Load
          </span>
          <span className="text-[10px] tracking-[0.15em] uppercase w-[44px] text-right" style={{ color: CLR.dim, fontFamily: SANS, fontWeight: 500 }}>
            Qty
          </span>
          {nearPort && (
            <span className="text-[10px] tracking-[0.15em] uppercase w-[60px] text-right" style={{ color: CLR.dim, fontFamily: SANS, fontWeight: 500 }}>
              Value
            </span>
          )}
        </div>

        <div className="h-[1px]" style={{ background: `linear-gradient(90deg, transparent, ${CLR.rule}60, transparent)` }} />

        {/* Commodity rows */}
        {ALL_COMMODITIES.map((c, i) => {
          const qty = cargo[c as keyof typeof cargo] ?? 0;
          const pct = stats.cargoCapacity > 0 ? Math.round((qty / stats.cargoCapacity) * 100) : 0;
          const color = COMMODITY_COLORS[c];
          const icon = COMMODITY_ICONS[c];
          const sellPrice = nearPort ? Math.floor((nearPort.prices[c as keyof typeof nearPort.prices] ?? 0) * 0.8) : null;
          const lineValue = sellPrice !== null && qty > 0 ? qty * sellPrice : null;

          return (
            <motion.div
              key={c}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.25, delay: 0.22 + i * 0.04 }}
              className="flex items-center gap-2 px-3 py-2.5 border-b transition-colors"
              style={{
                borderColor: CLR.rule + '20',
                opacity: qty > 0 ? 1 : 0.35,
              }}
            >
              {/* Icon + name */}
              <span className="text-[13px] w-[18px] text-center" style={{ color, fontFamily: MONO }}>{icon}</span>
              <span className="text-[13px] flex-1" style={{ color: qty > 0 ? CLR.bright : CLR.dim, fontFamily: SANS }}>
                {c}
                {sellPrice !== null && qty > 0 && (
                  <span className="text-[10px] ml-1.5" style={{ color: CLR.dim }}>
                    @{sellPrice}g
                  </span>
                )}
              </span>

              {/* Mini bar */}
              <div className="w-[100px] hidden md:flex items-center gap-1.5">
                <div className="flex-1 h-[5px] rounded-full overflow-hidden" style={{ backgroundColor: CLR.rule + '40' }}>
                  <motion.div
                    className="h-full rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.5, delay: 0.3 + i * 0.04 }}
                    style={{ backgroundColor: color, boxShadow: qty > 0 ? `0 0 4px ${color}30` : 'none' }}
                  />
                </div>
                <span className="text-[9px] tabular-nums w-[24px] text-right" style={{ color: CLR.dim, fontFamily: MONO }}>
                  {pct}%
                </span>
              </div>

              {/* Quantity */}
              <span
                className="text-[14px] tabular-nums w-[44px] text-right"
                style={{ color: qty > 0 ? CLR.bright : CLR.dim, fontFamily: MONO }}
              >
                {qty}
              </span>

              {/* Sell value at port */}
              {nearPort && (
                <span
                  className="text-[12px] tabular-nums w-[60px] text-right"
                  style={{ color: lineValue ? CLR.gold : CLR.rule, fontFamily: MONO }}
                >
                  {lineValue ? `${lineValue}g` : '\u2014'}
                </span>
              )}
            </motion.div>
          );
        })}

        {/* Total value row */}
        {nearPort && totalValue !== null && totalValue > 0 && (
          <div className="flex items-center gap-2 px-3 py-2.5 mt-1">
            <span className="flex-1 text-[12px]" style={{ color: CLR.dim, fontFamily: SANS }}>
              Total sell value at <span style={{ color: CLR.txt }}>{nearPort.name}</span>
            </span>
            <span className="text-[15px] tabular-nums font-semibold" style={{ color: CLR.gold, fontFamily: MONO }}>
              {totalValue.toLocaleString()}g
            </span>
          </div>
        )}

        {/* Empty state */}
        {isEmpty && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.3 }}
            className="text-center py-8"
          >
            <pre className="text-[11px] whitespace-pre mb-3" style={{ fontFamily: MONO }}>
              <C c={CLR.rule}>{'  \u250c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510'}</C>{'\n'}
              <C c={CLR.rule}>{'  \u2502'}</C><C c={CLR.dim}>{'  hold empty    '}</C><C c={CLR.rule}>{'\u2502'}</C>{'\n'}
              <C c={CLR.rule}>{'  \u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518'}</C>
            </pre>
            <p className="text-[12px]" style={{ color: CLR.dim, fontFamily: SANS }}>
              Visit a port to buy and sell goods.
            </p>
          </motion.div>
        )}
      </motion.div>

      {/* Wave divider */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.4 }}
        className="mt-5 w-full max-w-xl"
      >
        <WaveDivider width={52} />
      </motion.div>

      {/* Provisions section */}
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.45 }}
        className="mt-4 w-full max-w-xl px-2 md:px-4 mb-4"
      >
        <div
          className="p-4 rounded-lg"
          style={{
            backgroundColor: provisions < 10 ? CLR.red + '08' : CLR.warm + '06',
            border: `1px solid ${provisions < 10 ? CLR.red : CLR.warm}20`,
          }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] tracking-[0.15em] uppercase" style={{ color: CLR.dimGold, fontFamily: SANS, fontWeight: 600 }}>
              Provisions
            </span>
            <span className="text-[14px] tabular-nums" style={{ color: provisions < 10 ? CLR.red : CLR.bright, fontFamily: MONO }}>
              {provisions}
            </span>
          </div>

          {/* Bar */}
          <div className="h-[6px] rounded-full overflow-hidden" style={{ backgroundColor: CLR.rule + '40' }}>
            <motion.div
              className="h-full rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(100, (provisions / 60) * 100)}%` }}
              transition={{ duration: 0.6, delay: 0.5 }}
              style={{
                backgroundColor: provisions < 10 ? CLR.red : CLR.warm,
                boxShadow: `0 0 6px ${provisions < 10 ? CLR.red : CLR.warm}30`,
              }}
            />
          </div>

          {/* Details */}
          <div className="flex items-center justify-between mt-2">
            <span className="text-[11px]" style={{ color: CLR.dim, fontFamily: SANS }}>
              ~{dailyConsumption}/day for {crew.length} crew
            </span>
            <span
              className="text-[12px] font-semibold"
              style={{ color: daysRemaining < 5 ? CLR.red : daysRemaining < 10 ? CLR.yellow : CLR.txt, fontFamily: SANS }}
            >
              {daysRemaining} days remaining
            </span>
          </div>

          {provisions < 10 && (
            <p className="text-[11px] mt-2" style={{ color: CLR.red, fontFamily: SERIF, fontStyle: 'italic' }}>
              The crew grows restless. Resupply urgently at any port.
            </p>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// STUB TABS
// ═══════════════════════════════════════════════════════════════════════════

function TabStub({ tabKey, title, subtitle, accent, description }: {
  tabKey: string; title: string; subtitle: string; accent: string; description: string;
}) {
  const sparkle = useSparkle();
  return (
    <motion.div
      key={tabKey}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.25 }}
      className="flex flex-col items-center pt-10"
    >
      <h2
        className="text-[20px] tracking-[0.25em] uppercase"
        style={{ color: accent, fontFamily: MONO }}
      >
        {title}
      </h2>
      <p className="text-[13px] mt-1" style={{ color: CLR.txt, fontFamily: SERIF, fontStyle: 'italic' }}>
        {subtitle}
      </p>
      <div className="mt-4">
        <OrnateRule sparkle={sparkle} width={36} />
      </div>
      <p className="text-[12px] mt-4 text-center leading-relaxed max-w-xs" style={{ color: CLR.dim, fontFamily: SANS }}>
        {description}
      </p>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB BAR
// ═══════════════════════════════════════════════════════════════════════════

function ASCIITabBar({ active, onChange }: { active: DashTab; onChange: (tab: DashTab) => void }) {
  return (
    <div className="flex items-end justify-center gap-0 select-none px-2">
      {TABS.map(t => {
        const isActive = t.id === active;
        return (
          <button
            key={t.id}
            onClick={() => { sfxTab(); onChange(t.id); }}
            className="relative transition-all duration-150 active:scale-[0.97] px-0.5"
          >
            {isActive ? (
              <div
                className="px-4 md:px-5 py-2 rounded-t-lg border border-b-0 transition-colors"
                style={{
                  borderColor: t.accent + '40',
                  backgroundColor: t.accent + '0a',
                }}
              >
                <span
                  className="text-[11px] md:text-[12px] tracking-[0.15em] uppercase"
                  style={{ color: t.accent, fontFamily: SANS, fontWeight: 600 }}
                >
                  {t.label}
                </span>
              </div>
            ) : (
              <div className="px-4 md:px-5 py-2 border-b" style={{ borderColor: CLR.rule + '40' }}>
                <span
                  className="text-[11px] md:text-[12px] tracking-[0.12em] uppercase transition-colors hover:text-[#9a9080]"
                  style={{ color: CLR.dim, fontFamily: SANS, fontWeight: 500 }}
                >
                  {t.label}
                </span>
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN DASHBOARD COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function ASCIIDashboard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<DashTab>('overview');
  const activeAccent = TABS.find(t => t.id === tab)?.accent ?? CLR.tabOverview;

  // Escape to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { sfxClose(); onClose(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Reset to overview on open
  useEffect(() => {
    if (open) setTab('overview');
  }, [open]);

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-2 md:p-6 pointer-events-auto"
        style={{ backgroundColor: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(4px)' }}
        onClick={(e) => { if (e.target === e.currentTarget) { sfxClose(); onClose(); } }}
      >
        <motion.div
          initial={{ scale: 0.96, y: 16 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.96, y: 16 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="relative w-full max-w-4xl h-full max-h-[88vh] overflow-hidden flex flex-col"
          style={{
            background: 'linear-gradient(180deg, #0e0d0a 0%, #0a0908 40%, #080807 100%)',
            boxShadow: `0 30px 100px rgba(0,0,0,0.8), inset 0 1px 0 ${activeAccent}15, 0 0 1px ${activeAccent}20`,
            borderRadius: '6px',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Baroque border */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            <BaroqueBorder accentColor={activeAccent} />
          </motion.div>

          {/* Close button */}
          <button
            onClick={() => { sfxClose(); onClose(); }}
            className="absolute top-3 right-4 z-30 flex items-center gap-1.5 px-2 py-1 rounded transition-all hover:bg-white/[0.04]"
          >
            <span className="text-[10px] tracking-widest uppercase" style={{ color: CLR.dim, fontFamily: SANS }}>ESC</span>
            <span className="text-[14px]" style={{ color: CLR.dim }}>&times;</span>
          </button>

          {/* Tab bar */}
          <div className="relative z-10 shrink-0 pt-5 md:pt-4">
            <ASCIITabBar active={tab} onChange={setTab} />
            {/* Separator line */}
            <div className="h-[1px] mx-6" style={{ background: `linear-gradient(90deg, transparent, ${activeAccent}25, transparent)` }} />
          </div>

          {/* Content area */}
          <div className="relative z-10 flex-1 overflow-y-auto px-4 md:px-8 py-4 scrollbar-thin">
            <AnimatePresence mode="wait">
              {tab === 'overview' && <OverviewTab />}
              {tab === 'ship' && <ShipTab />}
              {tab === 'crew' && <CrewTab />}
              {tab === 'cargo' && <CargoTab />}
              {tab === 'reputation' && <ReputationTab />}
            </AnimatePresence>
          </div>

          {/* Bottom gradient fade */}
          <div
            className="absolute bottom-0 left-0 right-0 h-10 pointer-events-none z-10"
            style={{ background: 'linear-gradient(to top, #0a0908, transparent)' }}
          />
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
