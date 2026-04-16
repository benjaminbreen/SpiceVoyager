import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore, CrewMember, CrewRole, CrewQuality, WEAPON_DEFS } from '../store/gameStore';
import type { Commodity } from '../utils/commodities';
import { ALL_COMMODITIES_FULL, COMMODITY_DEFS } from '../utils/commodities';
import {
  X, Shield, Coins, Users, Package,
  Wrench, Heart, Star, ChevronDown, Crosshair, Sailboat, Flag,
  Navigation, Swords, Briefcase, Activity
} from 'lucide-react';
import { FactionFlag } from './FactionFlag';
import { CrewPortrait, CrewPortraitSquare } from './CrewPortrait';

type DashboardTab = 'overview' | 'crew' | 'cargo' | 'ship';

const ASSIGNABLE_ROLES: CrewRole[] = ['Sailor', 'Navigator', 'Gunner', 'Factor', 'Surgeon'];

const ROLE_ABBR: Record<string, string> = {
  Captain: 'CPT', Navigator: 'NAV', Gunner: 'GNR', Sailor: 'SAI', Factor: 'FCT', Surgeon: 'SRG',
};

const ROLE_ACCENT: Record<string, string> = {
  Captain: 'text-amber-400',
  Navigator: 'text-cyan-400',
  Gunner: 'text-red-400',
  Sailor: 'text-slate-400',
  Factor: 'text-emerald-400',
  Surgeon: 'text-pink-400',
};

const ROLE_BG: Record<string, string> = {
  Captain: 'bg-amber-400/10 border-amber-400/20',
  Navigator: 'bg-cyan-400/10 border-cyan-400/20',
  Gunner: 'bg-red-400/10 border-red-400/20',
  Sailor: 'bg-slate-400/10 border-slate-500/20',
  Factor: 'bg-emerald-400/10 border-emerald-400/20',
  Surgeon: 'bg-pink-400/10 border-pink-400/20',
};

const HEALTH_LABEL: Record<string, { text: string; color: string }> = {
  healthy: { text: 'FIT', color: 'text-green-500' },
  sick: { text: 'SICK', color: 'text-yellow-400' },
  injured: { text: 'INJ', color: 'text-red-400' },
  scurvy: { text: 'SCRVY', color: 'text-orange-400' },
  fevered: { text: 'FEVER', color: 'text-red-300' },
};

// Quality tier → portrait border + card accent
const QUALITY_PORTRAIT: Record<CrewQuality, { border: string; cardBorder: string; cardBg: string; glow?: string }> = {
  dud:       { border: 'border-amber-800/50',    cardBorder: 'border-amber-900/25',   cardBg: 'bg-amber-950/10' },
  normal:    { border: 'border-slate-600',        cardBorder: 'border-white/[0.06]',   cardBg: 'bg-white/[0.015]' },
  rare:      { border: 'border-emerald-500/60',   cardBorder: 'border-emerald-800/30', cardBg: 'bg-emerald-950/15', glow: 'shadow-[0_0_6px_rgba(52,211,153,0.15)]' },
  legendary: { border: 'border-purple-400/70',    cardBorder: 'border-purple-800/35',  cardBg: 'bg-purple-950/15',  glow: 'shadow-[0_0_10px_rgba(168,85,247,0.2)]' },
};

// --- SHARED PRIMITIVES ---

function Bar({ value, max = 100, color = 'bg-teal-500', height = 'h-1', bg = 'bg-white/[0.06]' }: {
  value: number; max?: number; color?: string; height?: string; bg?: string;
}) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className={`w-full ${height} ${bg} overflow-hidden`}>
      <motion.div
        className={`${height} ${color}`}
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      />
    </div>
  );
}

function StatRow({ label, value, bar, barColor, barMax = 100 }: {
  label: string; value: string | number; bar?: number; barColor?: string; barMax?: number;
}) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="text-[10px] tracking-[0.15em] uppercase text-slate-500 w-16 shrink-0">{label}</span>
      {bar !== undefined && (
        <div className="flex-1">
          <Bar value={bar} max={barMax} color={barColor} height="h-[5px]" />
        </div>
      )}
      <span className="font-mono text-xs text-slate-200 w-14 text-right shrink-0">{value}</span>
    </div>
  );
}

// --- PERSISTENT HEADER (ship banner) ---

function ShipHeader() {
  const { ship, stats, gold, crew } = useGameStore();
  const captain = crew.find(c => c.role === 'Captain');
  const hullPct = Math.round((stats.hull / stats.maxHull) * 100);

  return (
    <div className="relative shrink-0 overflow-hidden">
      {/* Banner background — gradient placeholder for ship type image */}
      {/* Drop images into /public/ships/{type}.jpg to replace */}
      <div
        className="absolute inset-0"
        style={{
          background: `
            linear-gradient(135deg, #0a1628 0%, #0d2847 40%, #132e4a 60%, #0a1628 100%)
          `,
        }}
      />
      {/* Subtle wave pattern overlay */}
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: `repeating-linear-gradient(
            90deg,
            transparent,
            transparent 40px,
            rgba(255,255,255,0.5) 40px,
            rgba(255,255,255,0.5) 41px
          ), repeating-linear-gradient(
            0deg,
            transparent,
            transparent 40px,
            rgba(255,255,255,0.3) 40px,
            rgba(255,255,255,0.3) 41px
          )`,
        }}
      />
      {/* Fade to panel color at bottom */}
      <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-[#0b1120] to-transparent" />

      {/* Content */}
      <div className="relative px-4 md:px-5 pt-4 pb-3">
        <div className="flex items-start gap-3">
          {/* Ship type icon */}
          <div className="w-10 h-10 md:w-11 md:h-11 border border-cyan-800/50 bg-cyan-950/40 flex items-center justify-center shrink-0">
            <Sailboat size={20} className="text-cyan-400" />
          </div>

          <div className="flex-1 min-w-0">
            {/* Ship name & type */}
            <div className="flex items-baseline gap-2">
              <h2 className="text-base md:text-lg font-bold text-slate-100 tracking-wide">{ship.name}</h2>
              <span className="text-[10px] tracking-[0.15em] uppercase text-cyan-500/70">{ship.type}</span>
            </div>
            {/* Quick info strip */}
            <div className="flex items-center gap-2 md:gap-4 mt-1 text-[10px] md:text-[11px] tracking-wide text-slate-500">
              <span className="flex items-center gap-1"><Flag size={9} className="text-slate-600" /> {ship.flag}</span>
              <span className="text-slate-700">|</span>
              <span>{ship.armed ? (stats.armament.length === 1 && stats.armament[0] === 'swivelGun' ? '1 Swivel Gun' : `${stats.armament.length} Guns`) : 'Unarmed'}</span>
              <span className="text-slate-700">|</span>
              <span className={hullPct > 50 ? 'text-slate-500' : hullPct > 25 ? 'text-yellow-500' : 'text-red-400'}>Hull {hullPct}%</span>
              {captain && (
                <>
                  <span className="text-slate-700">|</span>
                  <span className="text-amber-500/70 hidden md:inline">
                    Cpt. {captain.name.split(' ').pop()} · Lvl {captain.level}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Gold display */}
          <div className="shrink-0 text-right">
            <div className="flex items-center gap-1 text-yellow-500 font-mono text-sm md:text-base font-bold">
              <Coins size={14} className="text-yellow-600" />
              {gold.toLocaleString()}
            </div>
            <div className="text-[9px] tracking-[0.2em] uppercase text-slate-600 mt-0.5">Treasury</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- OVERVIEW TAB ---

function OverviewTab() {
  const { crew, stats, cargo, ship, playerPos } = useGameStore();
  const captain = crew.find(c => c.role === 'Captain');
  const currentCargo = Object.entries(cargo).reduce(
    (sum, [c, qty]) => sum + qty * (COMMODITY_DEFS[c as Commodity]?.weight ?? 1), 0
  );
  const hullPct = Math.round((stats.hull / stats.maxHull) * 100);
  const sailsPct = Math.round((stats.sails / stats.maxSails) * 100);
  const avgMorale = Math.round(crew.reduce((a, c) => a + c.morale, 0) / crew.length);

  return (
    <motion.div
      key="overview"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2 }}
      className="space-y-4"
    >
      {/* Captain card */}
      {captain && (() => {
        const cq = QUALITY_PORTRAIT[captain.quality];
        return (
        <div className={`border ${cq.cardBorder} ${cq.cardBg} ${cq.glow ?? ''} p-3 md:p-4`}>
          <div className="flex items-center gap-3">
            {/* Procedural captain portrait */}
            <div className={`w-14 h-14 md:w-16 md:h-16 bg-slate-800 border ${cq.border} flex items-center justify-center shrink-0 overflow-hidden`}>
              <CrewPortraitSquare member={captain} size={64} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-sm text-amber-200 tracking-wide">{captain.name}</span>
                <span className="text-[9px] tracking-[0.2em] uppercase font-bold text-amber-500 bg-amber-500/10 px-1.5 py-px border border-amber-500/20">CAPTAIN</span>
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5 tracking-wide">
                {captain.nationality} · Age {captain.age} · {captain.birthplace}
              </div>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <span className="text-[10px] text-cyan-500 flex items-center gap-0.5">
                  <Star size={9} /> LVL {captain?.level ?? 1}
                </span>
                <span className="text-[9px] tracking-wide text-slate-600">
                  {captain?.xp ?? 0}/{captain?.xpToNext ?? 100} XP
                </span>
                {(captain?.traits ?? []).map(t => (
                  <span key={t} className="text-[9px] tracking-[0.1em] uppercase text-teal-400 bg-teal-500/10 border border-teal-500/15 px-1.5 py-px">
                    {t}
                  </span>
                ))}
              </div>
            </div>
            <div className="hidden md:flex flex-col items-end gap-1 shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-[9px] tracking-widest uppercase text-slate-600">Skill</span>
                <span className="font-mono text-sm text-white font-bold">{captain.skill}</span>
              </div>
              <div className="w-20"><Bar value={captain.skill} color="bg-amber-500" height="h-[3px]" /></div>
            </div>
          </div>
        </div>
        );
      })()}

      {/* Status gauges */}
      <div className="border border-white/[0.06] bg-white/[0.02] p-3 md:p-4">
        <div className="text-[9px] tracking-[0.2em] uppercase text-slate-600 mb-2 pb-1.5 border-b border-white/[0.04]">
          Status
        </div>
        <div className="space-y-0.5">
          <StatRow label="Hull" value={`${stats.hull}/${stats.maxHull}`} bar={stats.hull} barMax={stats.maxHull} barColor={hullPct > 50 ? 'bg-hull' : hullPct > 25 ? 'bg-yellow-500' : 'bg-danger'} />
          <StatRow label="Sails" value={`${stats.sails}/${stats.maxSails}`} bar={stats.sails} barMax={stats.maxSails} barColor="bg-slate-400" />
          <StatRow label="Cargo" value={`${currentCargo}/${stats.cargoCapacity}`} bar={currentCargo} barMax={stats.cargoCapacity} barColor={currentCargo >= stats.cargoCapacity ? 'bg-danger' : 'bg-cargo'} />
          <StatRow label="Morale" value={`${avgMorale}%`} bar={avgMorale} barColor={avgMorale > 60 ? 'bg-morale' : avgMorale > 30 ? 'bg-yellow-500' : 'bg-danger'} />
          <StatRow label="Guns" value={stats.armament.length.toString()} bar={stats.armament.length} barMax={12} barColor="bg-orange-500" />
        </div>
      </div>

      {/* Crew quick list */}
      <div className="border border-white/[0.06] bg-white/[0.02] p-3 md:p-4">
        <div className="text-[9px] tracking-[0.2em] uppercase text-slate-600 mb-2 pb-1.5 border-b border-white/[0.04]">
          Crew · {crew.length} Aboard
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1">
          {crew.map(c => (
            <div key={c.id} className="flex items-center gap-2 py-1 text-xs">
              <span className={`font-mono text-[10px] w-7 ${ROLE_ACCENT[c.role]}`}>{ROLE_ABBR[c.role]}</span>
              <span className="text-slate-300 flex-1 truncate">{c.name}</span>
              <span className="font-mono text-[10px] text-slate-500">{c.skill}</span>
              <span className={`text-[9px] font-mono ${HEALTH_LABEL[c.health].color}`}>{HEALTH_LABEL[c.health].text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Cargo quick list */}
      {currentCargo > 0 && (
        <div className="border border-white/[0.06] bg-white/[0.02] p-3 md:p-4">
          <div className="text-[9px] tracking-[0.2em] uppercase text-slate-600 mb-2 pb-1.5 border-b border-white/[0.04]">
            Cargo Hold
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            {ALL_COMMODITIES_FULL.filter(c => cargo[c] > 0).map(c => (
              <div key={c} className="flex items-center gap-2 text-xs">
                <span className="text-slate-400">{c}</span>
                <span className="font-mono text-slate-200">{cargo[c]}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Alerts */}
      {stats.hull < stats.maxHull && (
        <div className="flex items-center gap-2 p-2 border border-red-900/40 bg-red-950/20 text-[11px]">
          <Wrench size={12} className="text-red-500 shrink-0" />
          <span className="text-red-300">{stats.maxHull - stats.hull} hull damage — repairs needed</span>
        </div>
      )}
      {crew.filter(c => c.health !== 'healthy').map(c => (
        <div key={c.id} className="flex items-center gap-2 p-2 border border-yellow-900/40 bg-yellow-950/20 text-[11px]">
          <Heart size={12} className="text-yellow-500 shrink-0" />
          <span className="text-yellow-300">{c.name}: {c.health}</span>
        </div>
      ))}
    </motion.div>
  );
}

// --- CREW TAB ---

function CrewTab() {
  const { crew, setCrewRole } = useGameStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const captain = crew.find(c => c.role === 'Captain');
  const others = crew.filter(c => c.role !== 'Captain');

  return (
    <motion.div
      key="crew"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2 }}
      className="space-y-3"
    >
      {/* Table header — desktop */}
      <div className="hidden md:flex items-center gap-2 px-3 py-1.5 text-[9px] tracking-[0.15em] uppercase text-slate-600 border-b border-white/[0.04]">
        <span className="w-8"></span>
        <span className="w-7">Role</span>
        <span className="flex-1 ml-2">Name</span>
        <span className="w-20">Origin</span>
        <span className="w-8 text-center">Age</span>
        <span className="w-10 text-center">Skill</span>
        <span className="w-10 text-center">Moral</span>
        <span className="w-10 text-center">Health</span>
        <span className="w-6"></span>
      </div>

      {captain && <CrewRow member={captain} isCaptain />}
      {others.map(m => (
        <CrewRow
          key={m.id}
          member={m}
          editing={editingId === m.id}
          onToggle={() => setEditingId(editingId === m.id ? null : m.id)}
          onRoleChange={(role) => { setCrewRole(m.id, role); setEditingId(null); }}
        />
      ))}

      <div className="text-[10px] text-slate-600 pt-2 border-t border-white/[0.04]">
        {crew.length} crew · Avg skill {Math.round(crew.reduce((a, c) => a + c.skill, 0) / crew.length)} · Avg morale {Math.round(crew.reduce((a, c) => a + c.morale, 0) / crew.length)}%
      </div>
    </motion.div>
  );
}

function CrewRow({ member, isCaptain, editing, onToggle, onRoleChange }: {
  member: CrewMember; isCaptain?: boolean; editing?: boolean;
  onToggle?: () => void; onRoleChange?: (role: CrewRole) => void;
}) {
  const health = HEALTH_LABEL[member.health];
  const q = QUALITY_PORTRAIT[member.quality];
  return (
    <div className={`border transition-colors ${q.cardBorder} ${q.cardBg} ${q.glow ?? ''} hover:bg-white/[0.03]`}>
      {/* Desktop layout */}
      <div className="hidden md:flex items-center gap-2 px-3 py-2.5">
        {/* Portrait */}
        <div className={`w-8 h-8 flex items-center justify-center shrink-0 bg-slate-800 border ${q.border} overflow-hidden`}>
          <CrewPortraitSquare member={member} size={32} />
        </div>
        {/* Role badge */}
        <span className={`font-mono text-[10px] font-bold w-7 ${ROLE_ACCENT[member.role]}`}>
          {ROLE_ABBR[member.role]}
        </span>
        {/* Flag + Name */}
        <span className={`flex-1 flex items-center gap-1.5 text-sm truncate ml-1 ${isCaptain ? 'text-amber-200 font-bold' : 'text-slate-200'}`}>
          <FactionFlag nationality={member.nationality} size={14} />
          <span className="truncate">{member.name}</span>
        </span>
        {/* Origin */}
        <span className="text-[11px] text-slate-500 w-20 truncate">{member.birthplace}</span>
        {/* Age */}
        <span className="font-mono text-[11px] text-slate-500 w-8 text-center">{member.age}</span>
        {/* Skill */}
        <div className="w-10 flex flex-col items-center gap-0.5">
          <span className="font-mono text-[11px] text-slate-200">{member.skill}</span>
          <div className="w-full"><Bar value={member.skill} color="bg-cyan-500" height="h-[2px]" /></div>
        </div>
        {/* Morale */}
        <div className="w-10 flex flex-col items-center gap-0.5">
          <span className={`font-mono text-[11px] ${member.morale > 60 ? 'text-green-400' : member.morale > 30 ? 'text-yellow-400' : 'text-red-400'}`}>
            {member.morale}
          </span>
          <div className="w-full">
            <Bar value={member.morale} color={member.morale > 60 ? 'bg-green-500' : member.morale > 30 ? 'bg-yellow-500' : 'bg-red-500'} height="h-[2px]" />
          </div>
        </div>
        {/* Health */}
        <span className={`font-mono text-[9px] w-10 text-center tracking-wider ${health.color}`}>{health.text}</span>
        {/* Expand */}
        {!isCaptain && onToggle ? (
          <button onClick={onToggle} className="w-6 h-6 flex items-center justify-center hover:bg-white/[0.06] transition-colors">
            <ChevronDown size={12} className={`text-slate-500 transition-transform duration-200 ${editing ? 'rotate-180' : ''}`} />
          </button>
        ) : <div className="w-6" />}
      </div>

      {/* Mobile layout */}
      <div className="flex md:hidden items-center gap-2 px-3 py-2.5" onClick={!isCaptain ? onToggle : undefined}>
        <div className={`w-9 h-9 flex items-center justify-center shrink-0 bg-slate-800 border ${q.border} overflow-hidden`}>
          <CrewPortraitSquare member={member} size={36} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className={`font-mono text-[9px] font-bold ${ROLE_ACCENT[member.role]}`}>{ROLE_ABBR[member.role]}</span>
            <FactionFlag nationality={member.nationality} size={12} />
            <span className={`text-sm truncate ${isCaptain ? 'text-amber-200 font-bold' : 'text-slate-200'}`}>{member.name}</span>
          </div>
          <div className="text-[10px] text-slate-500">{member.birthplace} · {member.age}y</div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="font-mono text-xs text-slate-300">{member.skill}</span>
          <span className={`font-mono text-xs ${member.morale > 60 ? 'text-green-400' : 'text-yellow-400'}`}>{member.morale}</span>
          <span className={`text-[9px] font-mono ${health.color}`}>{health.text}</span>
        </div>
      </div>

      {/* Role reassignment panel */}
      <AnimatePresence>
        {editing && onRoleChange && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-2.5 pt-1 flex items-center gap-1.5 flex-wrap border-t border-white/[0.04]">
              <span className="text-[9px] tracking-[0.15em] uppercase text-slate-600 mr-1">Assign role:</span>
              {ASSIGNABLE_ROLES.map(role => (
                <button
                  key={role}
                  onClick={() => onRoleChange(role)}
                  className={`text-[10px] tracking-wide px-2 py-1 border transition-all ${
                    member.role === role
                      ? ROLE_BG[role] + ' ' + ROLE_ACCENT[role] + ' font-bold'
                      : 'border-slate-700 text-slate-500 hover:text-slate-300 hover:border-slate-500'
                  }`}
                >
                  {role}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// --- CARGO TAB ---

function CargoTab() {
  const { cargo, stats } = useGameStore();
  const currentCargo = Object.entries(cargo).reduce(
    (sum, [c, qty]) => sum + qty * (COMMODITY_DEFS[c as Commodity]?.weight ?? 1), 0
  );
  const freePct = Math.round(((stats.cargoCapacity - currentCargo) / stats.cargoCapacity) * 100);

  return (
    <motion.div
      key="cargo"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2 }}
      className="space-y-4"
    >
      {/* Summary */}
      <div className="border border-white/[0.06] bg-white/[0.02] p-3 md:p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[9px] tracking-[0.2em] uppercase text-slate-600">Hold Capacity</span>
          <span className="font-mono text-xs text-slate-300">{currentCargo} / {stats.cargoCapacity}</span>
        </div>
        <Bar value={currentCargo} max={stats.cargoCapacity} color={currentCargo >= stats.cargoCapacity ? 'bg-red-500' : 'bg-teal-500'} height="h-2" />
        <div className="text-[10px] text-slate-600 mt-1.5">{stats.cargoCapacity - currentCargo} units free ({freePct}%)</div>
      </div>

      {/* Manifest table */}
      <div className="border border-white/[0.06] bg-white/[0.02]">
        <div className="flex items-center gap-2 px-3 py-2 text-[9px] tracking-[0.15em] uppercase text-slate-600 border-b border-white/[0.04]">
          <span className="flex-1">Commodity</span>
          <span className="w-24 text-center hidden md:block">Load</span>
          <span className="w-12 text-right">Qty</span>
          <span className="w-10 text-right">%</span>
        </div>
        {ALL_COMMODITIES_FULL.map((c, i) => {
          const qty = cargo[c];
          const pct = stats.cargoCapacity > 0 ? Math.round((qty / stats.cargoCapacity) * 100) : 0;
          return (
            <div
              key={c}
              className={`flex items-center gap-2 px-3 py-2 transition-colors ${
                qty > 0 ? 'hover:bg-white/[0.02]' : 'opacity-40'
              } ${i < ALL_COMMODITIES_FULL.length - 1 ? 'border-b border-white/[0.03]' : ''}`}
            >
              <span className={`flex-1 text-sm ${qty > 0 ? 'text-slate-200' : 'text-slate-600'}`}>{c}</span>
              <div className="w-24 hidden md:block">
                <Bar value={qty} max={stats.cargoCapacity} color="bg-teal-500/80" height="h-[4px]" />
              </div>
              <span className="font-mono text-sm text-slate-200 w-12 text-right">{qty}</span>
              <span className="font-mono text-[10px] text-slate-500 w-10 text-right">{pct}%</span>
            </div>
          );
        })}
      </div>

      {currentCargo === 0 && (
        <div className="text-center py-6">
          <Package size={24} className="mx-auto text-slate-700 mb-2" />
          <div className="text-[11px] text-slate-600 tracking-wide">Hold empty. Trade at a port to fill cargo.</div>
        </div>
      )}
    </motion.div>
  );
}

// --- SHIP TAB ---

function ShipTab() {
  const { stats, ship } = useGameStore();
  const hullPct = Math.round((stats.hull / stats.maxHull) * 100);
  const sailsPct = Math.round((stats.sails / stats.maxSails) * 100);

  return (
    <motion.div
      key="ship"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2 }}
      className="space-y-4"
    >
      {/* Condition */}
      <div className="border border-white/[0.06] bg-white/[0.02] p-3 md:p-4">
        <div className="text-[9px] tracking-[0.2em] uppercase text-slate-600 mb-3 pb-1.5 border-b border-white/[0.04]">
          Condition
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-slate-400 flex items-center gap-1.5"><Shield size={12} className="text-cyan-500" /> Hull</span>
              <span className={`font-mono text-xs font-bold ${hullPct > 50 ? 'text-cyan-400' : hullPct > 25 ? 'text-yellow-400' : 'text-red-400'}`}>
                {hullPct}%
              </span>
            </div>
            <Bar value={stats.hull} max={stats.maxHull} color={hullPct > 50 ? 'bg-cyan-500' : hullPct > 25 ? 'bg-yellow-500' : 'bg-red-500'} height="h-2" />
            <div className="text-[10px] text-slate-600 mt-1">{stats.hull}/{stats.maxHull} · {stats.maxHull - stats.hull > 0 ? `${stats.maxHull - stats.hull} dmg` : 'No damage'}</div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-slate-400 flex items-center gap-1.5"><Navigation size={12} className="text-slate-400" /> Sails</span>
              <span className="font-mono text-xs font-bold text-slate-300">{sailsPct}%</span>
            </div>
            <Bar value={stats.sails} max={stats.maxSails} color="bg-slate-400" height="h-2" />
            <div className="text-[10px] text-slate-600 mt-1">{stats.sails}/{stats.maxSails}</div>
          </div>
        </div>
      </div>

      {/* Specifications */}
      <div className="border border-white/[0.06] bg-white/[0.02] p-3 md:p-4">
        <div className="text-[9px] tracking-[0.2em] uppercase text-slate-600 mb-3 pb-1.5 border-b border-white/[0.04]">
          Specifications
        </div>
        <div className="grid grid-cols-2 gap-x-8 gap-y-2.5 text-sm">
          <SpecLine icon={<Sailboat size={11} />} label="Vessel" value={ship.type} />
          <SpecLine icon={<Flag size={11} />} label="Flag" value={ship.flag} />
          <SpecLine icon={<Activity size={11} />} label="Top Speed" value={`${stats.speed} kn`} />
          <SpecLine icon={<Navigation size={11} />} label="Handling" value={`${stats.turnSpeed}`} />
          <SpecLine icon={<Package size={11} />} label="Cargo Cap." value={`${stats.cargoCapacity} units`} />
          <SpecLine icon={<Crosshair size={11} />} label="Armament" value={stats.armament.map(w => WEAPON_DEFS[w].name).join(', ')} />
        </div>
      </div>

      {/* Armament detail */}
      <div className="border border-white/[0.06] bg-white/[0.02] p-3 md:p-4">
        <div className="text-[9px] tracking-[0.2em] uppercase text-slate-600 mb-3 pb-1.5 border-b border-white/[0.04]">
          Armament
        </div>
        <div className="flex items-center gap-3">
          <Swords size={16} className="text-orange-500/70" />
          <div className="flex-1">
            <div className="text-sm text-slate-300">{stats.armament.map(w => WEAPON_DEFS[w].name).join(', ')} · {ship.armed ? 'Combat ready' : 'Not armed'}</div>
            <div className="text-[10px] text-slate-600 mt-0.5">{stats.cannons > 0 ? `Broadside capacity: ${Math.floor(stats.cannons / 2)} per side` : 'No broadside cannons'}</div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function SpecLine({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-slate-600">{icon}</span>
      <span className="text-[11px] text-slate-500 flex-1">{label}</span>
      <span className="text-[11px] text-slate-200 font-mono">{value}</span>
    </div>
  );
}

// --- MAIN DASHBOARD MODAL ---

const TAB_CONFIG: { id: DashboardTab; label: string; icon: React.ReactNode }[] = [
  { id: 'overview', label: 'Overview', icon: <Briefcase size={13} /> },
  { id: 'crew', label: 'Crew', icon: <Users size={13} /> },
  { id: 'cargo', label: 'Cargo', icon: <Package size={13} /> },
  { id: 'ship', label: 'Ship', icon: <Wrench size={13} /> },
];

export function ShipDashboard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<DashboardTab>('overview');

  if (!open) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-2 md:p-8 pointer-events-auto"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ scale: 0.97, y: 12 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.97, y: 12 }}
        transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
        className="w-full max-w-3xl h-full max-h-[90vh] md:max-h-[85vh] bg-[#0b1120] border border-slate-700/50 overflow-hidden flex flex-col shadow-panel"
      >
        {/* Close button — floating */}
        <button
          onClick={onClose}
          className="absolute top-2 right-2 md:top-3 md:right-3 z-10 w-7 h-7 flex items-center justify-center text-slate-500 hover:text-slate-300 hover:bg-white/[0.06] transition-colors"
        >
          <X size={14} />
        </button>

        {/* Persistent ship header */}
        <ShipHeader />

        {/* Tab bar */}
        <div className="flex shrink-0 border-y border-slate-700/40 bg-[#0a0f1d]">
          {TAB_CONFIG.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`relative flex items-center gap-1.5 px-4 md:px-5 py-2.5 text-[11px] md:text-xs tracking-[0.1em] uppercase font-bold transition-colors ${
                tab === t.id
                  ? 'text-cyan-400 bg-cyan-400/[0.06]'
                  : 'text-slate-500 hover:text-slate-300 hover:bg-white/[0.03]'
              }`}
            >
              {t.icon}
              <span className="hidden md:inline">{t.label}</span>
              {/* Active indicator */}
              {tab === t.id && (
                <motion.div
                  layoutId="dashTab"
                  className="absolute bottom-0 left-0 right-0 h-[2px] bg-cyan-400"
                  transition={{ duration: 0.2 }}
                />
              )}
            </button>
          ))}
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-3 md:p-5 scrollbar-thin">
          <AnimatePresence mode="wait">
            {tab === 'overview' && <OverviewTab />}
            {tab === 'crew' && <CrewTab />}
            {tab === 'cargo' && <CargoTab />}
            {tab === 'ship' && <ShipTab />}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
}
