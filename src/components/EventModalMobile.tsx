import { useEffect, useMemo, useState } from 'react';
import { motion, type Variants } from 'framer-motion';
import { Sailboat } from 'lucide-react';
import { useGameStore } from '../store/gameStore';
import { ALL_COMMODITIES_FULL, COMMODITY_DEFS, type Commodity } from '../utils/commodities';
import { parchment } from '../theme/tokens';
import { FACTIONS } from '../constants/factions';
import { FactionFlag } from './FactionFlag';

const CHARTING_MESSAGES = [
  'Charting harbors…',
  'Surveying shoals and reefs…',
  'Trimming the rigging…',
  'Listening for monsoon shifts…',
];

// Responsive Commission of Voyage modal. Keeps an ASCII parchment aesthetic
// (mono font, corner glyphs, ornament dividers, skill bars) but lets the
// browser reflow everything — no fixed character grid.

const MONO = '"SF Mono", "Fira Code", "Cascadia Code", "Consolas", monospace';
const SERIF = '"Fraunces", serif';
const COMMISSION_EASE = [0.2, 0.8, 0.25, 1] as const;

const panelMotion: Variants = {
  hidden: { opacity: 0, scale: 0.965, y: 14 },
  show: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: {
      duration: 0.44,
      ease: COMMISSION_EASE,
      when: 'beforeChildren',
      staggerChildren: 0.045,
      delayChildren: 0.08,
    },
  },
  exit: { opacity: 0, scale: 0.975, y: 8, transition: { duration: 0.18 } },
};

const revealMotion: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.26, ease: COMMISSION_EASE } },
};

const MONTH_NAMES_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function formatCommissionDate(dayCount: number): { day: string; month: string; year: number } {
  let month = 4;
  let day = dayCount;
  let year = 1612;
  while (day > DAYS_IN_MONTH[month]) {
    day -= DAYS_IN_MONTH[month];
    month++;
    if (month >= 12) { month = 0; year++; }
  }
  return { day: ordinal(day), month: MONTH_NAMES_FULL[month], year };
}

function Divider({ glyph = '✦' }: { glyph?: string }) {
  return (
    <motion.div variants={revealMotion} className="flex items-center gap-3 my-3 select-none" aria-hidden>
      <span className="flex-1 h-px" style={{ background: `linear-gradient(to right, transparent, ${parchment.dimGold}55, ${parchment.dimGold}88)` }} />
      <span style={{ color: parchment.gold, fontFamily: MONO, fontSize: '0.95em' }}>{glyph}</span>
      <span className="flex-1 h-px" style={{ background: `linear-gradient(to left, transparent, ${parchment.dimGold}55, ${parchment.dimGold}88)` }} />
    </motion.div>
  );
}

function SkillBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      className="relative h-[9px] rounded-[1px] overflow-hidden"
      style={{ width: 56, background: `${parchment.rule}` , border: `1px solid ${parchment.rule}` }}
      aria-label={`skill ${pct}`}
    >
      <div
        className="absolute inset-y-0 left-0"
        style={{
          width: `${pct}%`,
          background: `linear-gradient(to right, ${parchment.dimGold}, ${parchment.warm})`,
        }}
      />
    </div>
  );
}

function StatMeter({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100));
  return (
    <div
      className="relative h-[10px] flex-1 min-w-[60px] max-w-[140px] rounded-[1px] overflow-hidden"
      style={{ background: parchment.rule, border: `1px solid ${parchment.ruleLt}` }}
    >
      <div
        className="absolute inset-y-0 left-0"
        style={{ width: `${pct}%`, background: color, opacity: 0.85 }}
      />
    </div>
  );
}

// Corner glyph absolutely positioned inside the panel. Just visual flavor —
// the panel itself is a standard flex/overflow container underneath.
function Corner({ pos }: { pos: 'tl' | 'tr' | 'bl' | 'br' }) {
  const style: React.CSSProperties = {
    position: 'absolute',
    width: 18,
    height: 18,
    pointerEvents: 'none',
    borderColor: `${parchment.gold}99`,
    filter: `drop-shadow(0 0 5px ${parchment.gold}44)`,
  };
  if (pos === 'tl') { style.top = 10; style.left = 10; style.borderTopWidth = 2; style.borderLeftWidth = 2; }
  if (pos === 'tr') { style.top = 10; style.right = 10; style.borderTopWidth = 2; style.borderRightWidth = 2; }
  if (pos === 'bl') { style.bottom = 10; style.left = 10; style.borderBottomWidth = 2; style.borderLeftWidth = 2; }
  if (pos === 'br') { style.bottom = 10; style.right = 10; style.borderBottomWidth = 2; style.borderRightWidth = 2; }
  return <span style={style} />;
}

function ManifestRow({ children, last = false }: { children: React.ReactNode; last?: boolean }) {
  return (
    <motion.div
      variants={revealMotion}
      className="group flex items-center gap-2 rounded-[4px] transition-[background,box-shadow,transform] duration-150 hover:translate-x-[2px]"
      style={{
        padding: '3px 5px 5px',
        borderBottom: last ? 'none' : `1px solid ${parchment.rule}`,
      }}
      whileHover={{
        backgroundColor: 'rgba(201,168,76,0.07)',
        boxShadow: `inset 2px 0 0 ${parchment.gold}88`,
      }}
    >
      {children}
    </motion.div>
  );
}

function FactionSeal({ factionId }: { factionId: typeof FACTIONS[keyof typeof FACTIONS]['id'] }) {
  const faction = FACTIONS[factionId];
  const [field, device, accent] = faction.colors;
  const sealColor = factionId === 'Pirate' ? '#1b1714' : field;
  const readableDevice = /^#f+$/i.test(device.replace('#', '')) ? parchment.bright : device;

  return (
    <motion.div
      variants={revealMotion}
      className="absolute right-7 top-7 z-20 hidden select-none sm:block"
      title={faction.displayName}
      whileHover={{ rotate: -2, scale: 1.035 }}
      transition={{ duration: 0.18 }}
      style={{ filter: 'drop-shadow(0 12px 18px rgba(0,0,0,0.48))' }}
    >
      <div
        className="relative grid h-[82px] w-[82px] place-items-center rounded-full"
        style={{
          background: `radial-gradient(circle at 34% 28%, rgba(255,236,190,0.36), transparent 22%), radial-gradient(circle at 50% 54%, ${sealColor} 0%, ${sealColor} 44%, #4c261e 72%, #1a0d0a 100%)`,
          boxShadow: `inset 0 3px 5px rgba(255,231,176,0.24), inset 0 -10px 14px rgba(0,0,0,0.46), 0 0 0 1px rgba(255,218,138,0.18), 0 0 0 4px rgba(87,42,28,0.82)`,
        }}
      >
        <div
          className="absolute inset-[7px] rounded-full border"
          style={{ borderColor: `${accent}99`, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.42)' }}
        />
        <div
          className="absolute inset-[13px] rounded-full"
          style={{
            background: 'radial-gradient(circle at 40% 28%, rgba(255,240,190,0.18), transparent 42%), rgba(6,5,4,0.28)',
            boxShadow: 'inset 0 4px 10px rgba(0,0,0,0.58)',
          }}
        />
        <div className="relative z-10 flex flex-col items-center gap-1">
          <div
            className="grid h-7 w-10 place-items-center rounded-[2px]"
            style={{ boxShadow: '0 2px 5px rgba(0,0,0,0.45)' }}
          >
            <FactionFlag nationality={factionId} size={34} />
          </div>
          <div
            className="max-w-[58px] truncate uppercase"
            style={{
              color: readableDevice,
              fontFamily: MONO,
              fontSize: 8,
              fontWeight: 700,
              letterSpacing: '0.12em',
              textShadow: '0 1px 2px rgba(0,0,0,0.8)',
            }}
          >
            {faction.shortName}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export function EventModalMobile({ onDismiss, worldReady }: { onDismiss: () => void; worldReady: boolean }) {
  const crew = useGameStore(s => s.crew);
  const ship = useGameStore(s => s.ship);
  const goldAmount = useGameStore(s => s.gold);
  const stats = useGameStore(s => s.stats);
  const ports = useGameStore(s => s.ports);
  const cargo = useGameStore(s => s.cargo);
  const dayCount = useGameStore(s => s.dayCount);

  const captain = crew.find(c => c.role === 'Captain');
  const captainName = captain?.name ?? 'the Captain';
  const startPort = ports[0];
  const date = formatCommissionDate(dayCount);

  const cargoItems = useMemo(
    () => ALL_COMMODITIES_FULL.filter(c => (cargo[c] ?? 0) > 0),
    [cargo]
  );

  const totalWeight = useMemo(
    () => Object.entries(cargo).reduce(
      (sum, [c, qty]) => sum + qty * (COMMODITY_DEFS[c as Commodity]?.weight ?? 1), 0
    ),
    [cargo]
  );

  useEffect(() => {
    if (!worldReady) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
        e.preventDefault();
        onDismiss();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onDismiss, worldReady]);

  // Cycle a "charting harbors" message until world-gen finishes, so the
  // footer hint communicates progress rather than looking frozen.
  const [chartingIdx, setChartingIdx] = useState(0);
  useEffect(() => {
    if (worldReady) return;
    const id = setInterval(() => {
      setChartingIdx(i => (i + 1) % CHARTING_MESSAGES.length);
    }, 900);
    return () => clearInterval(id);
  }, [worldReady]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
      className="absolute inset-0 z-[60] flex items-center justify-center pointer-events-auto"
      style={{ backgroundColor: 'rgba(6,5,4,0.65)', backdropFilter: 'blur(3px)' }}
      onClick={worldReady ? onDismiss : undefined}
    >
      {/* Port painting background */}
      <motion.img
        src={`/ports/${startPort?.id ?? 'bantam'}.png`}
        alt=""
        initial={{ scale: 1.1 }}
        animate={{ scale: 1.045 }}
        transition={{ duration: 1.2, ease: [0.2, 0.8, 0.25, 1] }}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          filter: 'sepia(0.2) contrast(1.05) brightness(0.55) saturate(1.05)',
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'radial-gradient(ellipse at center, transparent 30%, rgba(6,5,4,0.55) 72%, rgba(6,5,4,0.9) 100%)',
        }}
      />

      {/* Panel */}
      <motion.div
        variants={panelMotion}
        initial="hidden"
        animate="show"
        exit="exit"
        onClick={e => e.stopPropagation()}
        className="relative flex flex-col overflow-hidden"
        style={{
          width: 'min(610px, calc(100vw - 1rem))',
          maxHeight: 'min(90vh, 880px)',
          backgroundColor: 'rgba(12,11,8,0.96)',
          backgroundImage: `linear-gradient(115deg, rgba(201,168,76,0.13), transparent 34%), linear-gradient(180deg, rgba(255,255,255,0.035), transparent 24%)`,
          border: `1px solid rgba(201,168,76,0.24)`,
          borderRadius: 10,
          boxShadow: `0 25px 70px rgba(0,0,0,0.78), inset 0 1px 0 rgba(255,232,164,0.08), inset 0 0 28px rgba(0,0,0,0.38)`,
          fontFamily: MONO,
          color: parchment.txt,
        }}
      >
        <div
          className="pointer-events-none absolute inset-[9px] rounded-[7px] border"
          style={{ borderColor: 'rgba(201,168,76,0.22)' }}
        />
        <Corner pos="tl" />
        <Corner pos="tr" />
        <Corner pos="bl" />
        <Corner pos="br" />
        <FactionSeal factionId={ship.flag} />

        {/* Scrolling body */}
        <div
          className="flex-1 overflow-y-auto"
          style={{
            padding: 'clamp(18px, 4vw, 28px) clamp(14px, 4vw, 28px) 14px',
          }}
        >
          {/* Title */}
          <motion.div variants={revealMotion} className="relative text-center">
            <div
              className="mx-auto mb-3 flex max-w-[430px] items-center justify-center gap-3 uppercase"
              style={{
                color: parchment.dimGold,
                fontFamily: MONO,
                fontSize: 'clamp(8.5px, 2.1vw, 10px)',
                letterSpacing: '0.16em',
              }}
            >
              <span className="h-px flex-1" style={{ background: `linear-gradient(to right, transparent, ${parchment.dimGold}70)` }} />
              <span>Warrant No. {String(dayCount).padStart(2, '0')}</span>
              <span className="h-px flex-1" style={{ background: `linear-gradient(to left, transparent, ${parchment.dimGold}70)` }} />
            </div>

            <div
              aria-label="Commission of Voyage"
              className="relative mx-auto max-w-[520px]"
              style={{
                color: '#d9cfad',
                fontFamily: SERIF,
                textShadow: '0 1px 0 rgba(255,238,190,0.16), 0 10px 22px rgba(0,0,0,0.62)',
              }}
            >
              <div
                className="relative z-10 uppercase"
                style={{
                  fontSize: 'clamp(18px, 4.8vw, 31px)',
                  fontWeight: 650,
                  lineHeight: 1.05,
                  letterSpacing: '0.24em',
                  fontVariantCaps: 'small-caps',
                  fontVariationSettings: '"opsz" 48, "SOFT" 18, "WONK" 1',
                }}
              >
                Commission
              </div>
              <div className="mt-2 flex items-center justify-center gap-3">
                <span className="h-px w-[19%]" style={{ background: `linear-gradient(to right, transparent, ${parchment.gold}95)` }} />
                <span
                  style={{
                    color: parchment.gold,
                    fontSize: 'clamp(14px, 3.5vw, 19px)',
                    fontStyle: 'italic',
                    fontWeight: 520,
                    lineHeight: 1,
                    letterSpacing: 0,
                    fontVariationSettings: '"opsz" 48, "SOFT" 42, "WONK" 1',
                  }}
                >
                  of
                </span>
                <span
                  className="uppercase"
                  style={{
                    fontSize: 'clamp(26px, 7vw, 45px)',
                    fontWeight: 680,
                    lineHeight: 0.92,
                    letterSpacing: '0.08em',
                    fontVariantCaps: 'small-caps',
                    fontVariationSettings: '"opsz" 72, "SOFT" 24, "WONK" 1',
                  }}
                >
                  Voyage
                </span>
                <span className="h-px w-[18%]" style={{ background: `linear-gradient(to left, transparent, ${parchment.gold}95)` }} />
              </div>
              <div
                className="mx-auto mt-3 h-px max-w-[330px]"
                style={{ background: `linear-gradient(to right, transparent, ${parchment.ruleLt}, ${parchment.gold}70, ${parchment.ruleLt}, transparent)` }}
              />
              <div
                className="pointer-events-none absolute inset-x-8 top-[34%] h-8 opacity-40"
                style={{
                  background: `radial-gradient(ellipse at center, ${parchment.gold}30, transparent 70%)`,
                  filter: 'blur(10px)',
                }}
                aria-hidden
              />
            </div>

            <div
              className="mx-auto mt-3 flex max-w-[380px] items-center justify-center gap-2 uppercase"
              style={{
                color: parchment.gold,
                fontFamily: MONO,
                fontSize: 'clamp(9px, 2.2vw, 10.5px)',
                letterSpacing: '0.12em',
              }}
            >
              <span>{startPort?.name ?? 'Port of departure'}</span>
              <span style={{ color: parchment.dimGold }}>◆</span>
              <span>{date.month} {date.year}</span>
            </div>
            <div className="mx-auto mt-3" style={{ width: 'min(300px, 76%)', height: 1, background: `linear-gradient(to right, transparent, ${parchment.gold}80, transparent)` }} />
          </motion.div>

          {/* Commission narrative */}
          <motion.div
            variants={revealMotion}
            className="text-center mt-5 mb-4 mx-auto"
            style={{
              fontFamily: MONO,
              fontSize: 'clamp(13px, 3.5vw, 15px)',
              lineHeight: 1.6,
              color: parchment.txt,
              maxWidth: 460,
              padding: '0 10px',
              borderLeft: `2px double ${parchment.dimGold}`,
              borderRight: `2px double ${parchment.dimGold}`,
            }}
          >
            <span>The {ship.type.toLowerCase()} </span>
            <span style={{ color: parchment.teal }}>{ship.name}</span>
            <br />
            <span>{startPort ? `departs ${startPort.name} on the` : 'sets sail on the'}</span>
            <br />
            <span style={{ color: parchment.warm }}>{date.day} of {date.month}, {date.year}</span>
            <br />
            <span>under the command of </span>
            <span style={{ color: parchment.crimson }}>{captainName}</span>
            <span>.</span>
          </motion.div>

          <Divider glyph="✦" />

          {/* Crew manifest */}
          <motion.div variants={revealMotion}>
            <div
              className="uppercase tracking-[0.28em] mb-2"
              style={{ color: parchment.warm, fontSize: 'clamp(10px, 2.4vw, 11.5px)' }}
            >
              Crew Manifest
            </div>
            <div className="flex flex-col" style={{ fontSize: 'clamp(11.5px, 2.9vw, 13px)', rowGap: 4 }}>
              {crew.map((m, i) => (
                <ManifestRow
                  key={i}
                  last={i === crew.length - 1}
                >
                  <span
                    className="truncate"
                    style={{
                      color: m.role === 'Captain' ? parchment.crimson : parchment.txt,
                      flex: '1 1 50%',
                      minWidth: 0,
                    }}
                  >
                    {m.name}
                  </span>
                  <span
                    className="truncate"
                    style={{ color: parchment.dim, flex: '0 1 32%', minWidth: 0, fontSize: '0.9em' }}
                  >
                    {m.role}
                  </span>
                  <SkillBar value={m.skill} />
                </ManifestRow>
              ))}
            </div>
          </motion.div>

          <Divider glyph="·" />

          {/* Stats row */}
          <motion.div
            variants={revealMotion}
            className="flex items-center justify-between gap-4 flex-wrap"
            style={{ fontSize: 'clamp(12px, 3vw, 14px)' }}
          >
            <div className="flex items-center gap-2">
              <span className="uppercase tracking-[0.22em]" style={{ color: parchment.warm, fontSize: '0.78em' }}>Gold</span>
              <span style={{ color: parchment.bright, fontVariantNumeric: 'tabular-nums' }}>
                {goldAmount.toLocaleString()}
              </span>
            </div>
            <div className="flex items-center gap-2 flex-1 min-w-[160px] justify-end">
              <span className="uppercase tracking-[0.22em]" style={{ color: parchment.warm, fontSize: '0.78em' }}>Hull</span>
              <StatMeter value={stats.hull} max={stats.maxHull} color={parchment.teal} />
              <span style={{ color: parchment.dim, fontSize: '0.85em', fontVariantNumeric: 'tabular-nums' }}>
                {stats.hull}/{stats.maxHull}
              </span>
            </div>
          </motion.div>

          <Divider glyph="✦" />

          {/* Cargo manifest */}
          <motion.div variants={revealMotion}>
            <div className="flex items-baseline justify-between mb-2">
              <span
                className="uppercase tracking-[0.28em]"
                style={{ color: parchment.warm, fontSize: 'clamp(10px, 2.4vw, 11.5px)' }}
              >
                Cargo Manifest
              </span>
              <span style={{ color: parchment.dim, fontSize: 'clamp(10px, 2.3vw, 11.5px)', fontVariantNumeric: 'tabular-nums' }}>
                {totalWeight}/{stats.cargoCapacity}
              </span>
            </div>

            {cargoItems.length === 0 ? (
              <div style={{ color: parchment.dim, fontStyle: 'italic', fontSize: 'clamp(11px, 2.7vw, 12.5px)', padding: '6px 0' }}>
                — holds empty —
              </div>
            ) : (
              <div
                className="grid gap-x-4 gap-y-1"
                style={{
                  gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                  fontSize: 'clamp(11px, 2.8vw, 12.5px)',
                }}
              >
                {cargoItems.map((c) => {
                  const def = COMMODITY_DEFS[c];
                  const qty = cargo[c];
                  const nameColor =
                    def.tier >= 4 ? parchment.gold
                    : def.tier === 3 ? parchment.bright
                    : parchment.txt;
                  const tierTag = def.tier >= 4 ? '✦' : def.tier === 3 ? '·' : ' ';
                  return (
                    <motion.div
                      key={c}
                      variants={revealMotion}
                      className="group flex items-center gap-2 min-w-0 rounded-[4px] transition-colors"
                      style={{ padding: '2px 5px' }}
                      whileHover={{
                        backgroundColor: 'rgba(201,168,76,0.07)',
                        boxShadow: `inset 2px 0 0 ${def.color}`,
                      }}
                    >
                      <span style={{ color: def.color, flexShrink: 0 }}>{def.icon}</span>
                      <span className="truncate" style={{ color: nameColor, flex: 1, minWidth: 0 }}>{c}</span>
                      <span style={{ color: parchment.bright, fontVariantNumeric: 'tabular-nums' }}>{qty}</span>
                      <span style={{ color: parchment.dim, width: '1ch', textAlign: 'center' }}>{tierTag}</span>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </motion.div>

          <Divider glyph="✦" />
        </div>

        {/* Sticky footer — always-visible action */}
        <motion.div
          variants={revealMotion}
          className="flex items-center justify-center"
          style={{
            padding: 'clamp(10px, 2.5vw, 14px) clamp(14px, 4vw, 28px) clamp(14px, 3.5vw, 20px)',
            borderTop: `1px solid ${parchment.rule}`,
            background: 'linear-gradient(to bottom, rgba(10,9,7,0), rgba(10,9,7,0.6))',
          }}
        >
          <motion.button
            onClick={worldReady ? onDismiss : undefined}
            disabled={!worldReady}
            aria-disabled={!worldReady}
            className="group relative flex items-center justify-center gap-3 w-full overflow-hidden transition-[filter,opacity,box-shadow,border-color] active:scale-[0.98]"
            style={{
              minHeight: 52,
              maxWidth: 360,
              padding: '10px 18px',
              fontFamily: MONO,
              fontSize: 'clamp(13px, 3.4vw, 15px)',
              letterSpacing: '0.24em',
              color: worldReady ? parchment.bright : parchment.dim,
              background: worldReady
                ? `linear-gradient(180deg, rgba(43,34,16,0.98), rgba(17,14,9,0.98))`
                : 'rgba(20,16,10,0.72)',
              border: `1px solid ${worldReady ? parchment.gold : parchment.dimGold}66`,
              borderRadius: 8,
              boxShadow: worldReady
                ? `0 0 0 1px ${parchment.dimGold}55 inset, 0 0 24px ${parchment.gold}28, 0 8px 22px rgba(0,0,0,0.45)`
                : `0 0 0 1px ${parchment.rule} inset, 0 2px 8px rgba(0,0,0,0.3)`,
              cursor: worldReady ? 'pointer' : 'default',
              opacity: worldReady ? 1 : 0.55,
              textTransform: 'uppercase',
            }}
            whileHover={worldReady ? {
              y: -1,
              boxShadow: `0 0 0 1px ${parchment.gold}88 inset, 0 0 30px ${parchment.gold}35, 0 12px 26px rgba(0,0,0,0.52)`,
            } : undefined}
          >
            {worldReady && (
              <motion.span
                className="pointer-events-none absolute inset-y-0 w-16 -skew-x-12 bg-white/10 opacity-0"
                initial={false}
                whileHover={{ x: '360%', opacity: 1 }}
                transition={{ duration: 0.7, ease: [0.2, 0.8, 0.25, 1] }}
                style={{ left: '-5rem' }}
                aria-hidden
              />
            )}
            {worldReady ? (
              <>
                <span
                  className="grid h-7 w-7 place-items-center rounded-full"
                  style={{
                    color: '#141109',
                    background: `linear-gradient(180deg, ${parchment.gold}, ${parchment.warm})`,
                    boxShadow: `0 0 16px ${parchment.gold}35`,
                  }}
                >
                  <Sailboat size={15} strokeWidth={2.2} />
                </span>
                <span>Continue</span>
              </>
            ) : (
              <>
                <motion.span
                  animate={{ opacity: [0.35, 0.9, 0.35] }}
                  transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
                  style={{ color: parchment.dimGold }}
                >
                  ◌
                </motion.span>
                <span>{CHARTING_MESSAGES[chartingIdx]}</span>
              </>
            )}
          </motion.button>
        </motion.div>

        {/* Hint line */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.5, 0.35, 0.5] }}
          transition={{ duration: 2.5, repeat: Infinity, delay: 0.6 }}
          className="text-center uppercase tracking-[0.25em]"
          style={{
            color: parchment.dim,
            fontSize: 10,
            padding: '0 0 10px',
            fontFamily: MONO,
          }}
        >
          {worldReady ? 'press enter or tap' : 'preparing the voyage'}
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
