import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useGameStore } from '../store/gameStore';
import { ALL_COMMODITIES_FULL, COMMODITY_DEFS, type Commodity } from '../utils/commodities';
import { parchment } from '../theme/tokens';

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
    <div className="flex items-center gap-3 my-3 select-none" aria-hidden>
      <span className="flex-1 h-px" style={{ background: `linear-gradient(to right, transparent, ${parchment.dimGold}55, ${parchment.dimGold}88)` }} />
      <span style={{ color: parchment.gold, fontFamily: MONO, fontSize: '0.95em' }}>{glyph}</span>
      <span className="flex-1 h-px" style={{ background: `linear-gradient(to left, transparent, ${parchment.dimGold}55, ${parchment.dimGold}88)` }} />
    </div>
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
function Corner({ glyph, pos }: { glyph: string; pos: 'tl' | 'tr' | 'bl' | 'br' }) {
  const style: React.CSSProperties = {
    position: 'absolute',
    color: parchment.gold,
    fontFamily: MONO,
    fontSize: '18px',
    lineHeight: 1,
    pointerEvents: 'none',
    textShadow: `0 0 6px ${parchment.gold}55`,
  };
  if (pos === 'tl') { style.top = 6; style.left = 8; }
  if (pos === 'tr') { style.top = 6; style.right = 8; }
  if (pos === 'bl') { style.bottom = 6; style.left = 8; }
  if (pos === 'br') { style.bottom = 6; style.right = 8; }
  return <span style={style}>{glyph}</span>;
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
      <img
        src={`/ports/${startPort?.id ?? 'bantam'}.png`}
        alt=""
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transform: 'scale(1.1)',
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
        initial={{ opacity: 0, scale: 0.97, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        onClick={e => e.stopPropagation()}
        className="relative flex flex-col overflow-hidden"
        style={{
          width: 'min(560px, calc(100vw - 1rem))',
          maxHeight: 'min(90vh, 880px)',
          backgroundColor: 'rgba(10,9,7,0.96)',
          border: `1px solid ${parchment.dimGold}55`,
          borderRadius: 6,
          boxShadow: `0 25px 70px rgba(0,0,0,0.8), 0 0 40px rgba(0,0,0,0.45), inset 0 0 28px rgba(0,0,0,0.35), 0 0 0 1px ${parchment.rule}`,
          fontFamily: MONO,
          color: parchment.txt,
        }}
      >
        {/* Decorative corner glyphs (box-drawing) */}
        <Corner glyph="╔" pos="tl" />
        <Corner glyph="╗" pos="tr" />
        <Corner glyph="╚" pos="bl" />
        <Corner glyph="╝" pos="br" />

        {/* Scrolling body */}
        <div
          className="flex-1 overflow-y-auto"
          style={{
            padding: 'clamp(18px, 4vw, 28px) clamp(14px, 4vw, 28px) 14px',
          }}
        >
          {/* Title */}
          <div className="text-center">
            <div
              className="tracking-[0.35em] uppercase"
              style={{
                color: parchment.gold,
                fontSize: 'clamp(12px, 3.2vw, 15px)',
                fontWeight: 500,
                textShadow: `0 0 12px ${parchment.gold}40`,
              }}
            >
              Commission of Voyage
            </div>
            <div className="mx-auto mt-2" style={{ width: 'min(240px, 70%)', height: 1, background: `linear-gradient(to right, transparent, ${parchment.gold}80, transparent)` }} />
          </div>

          {/* Commission narrative */}
          <div
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
          </div>

          <Divider glyph="✦" />

          {/* Crew manifest */}
          <div>
            <div
              className="uppercase tracking-[0.28em] mb-2"
              style={{ color: parchment.warm, fontSize: 'clamp(10px, 2.4vw, 11.5px)' }}
            >
              Crew Manifest
            </div>
            <div className="flex flex-col" style={{ fontSize: 'clamp(11.5px, 2.9vw, 13px)', rowGap: 4 }}>
              {crew.map((m, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2"
                  style={{
                    paddingBottom: 3,
                    borderBottom: i === crew.length - 1 ? 'none' : `1px solid ${parchment.rule}`,
                  }}
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
                </div>
              ))}
            </div>
          </div>

          <Divider glyph="·" />

          {/* Stats row */}
          <div
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
          </div>

          <Divider glyph="✦" />

          {/* Cargo manifest */}
          <div>
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
                    <div key={c} className="flex items-center gap-2 min-w-0" style={{ paddingBottom: 2 }}>
                      <span style={{ color: def.color, flexShrink: 0 }}>{def.icon}</span>
                      <span className="truncate" style={{ color: nameColor, flex: 1, minWidth: 0 }}>{c}</span>
                      <span style={{ color: parchment.bright, fontVariantNumeric: 'tabular-nums' }}>{qty}</span>
                      <span style={{ color: parchment.dim, width: '1ch', textAlign: 'center' }}>{tierTag}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <Divider glyph="✦" />
        </div>

        {/* Sticky footer — always-visible action */}
        <div
          className="flex items-center justify-center"
          style={{
            padding: 'clamp(10px, 2.5vw, 14px) clamp(14px, 4vw, 28px) clamp(14px, 3.5vw, 20px)',
            borderTop: `1px solid ${parchment.rule}`,
            background: 'linear-gradient(to bottom, rgba(10,9,7,0), rgba(10,9,7,0.6))',
          }}
        >
          <button
            onClick={worldReady ? onDismiss : undefined}
            disabled={!worldReady}
            aria-disabled={!worldReady}
            className="group relative flex items-center justify-center gap-2 w-full transition-[filter,transform,opacity,box-shadow,border-color] active:scale-[0.98]"
            style={{
              minHeight: 52,
              maxWidth: 360,
              padding: '10px 18px',
              fontFamily: MONO,
              fontSize: 'clamp(13px, 3.4vw, 15px)',
              letterSpacing: '0.32em',
              color: worldReady ? parchment.bright : parchment.dim,
              backgroundColor: 'rgba(20,16,10,0.85)',
              border: `1px solid ${worldReady ? parchment.gold : parchment.dimGold}66`,
              borderRadius: 3,
              boxShadow: worldReady
                ? `0 0 0 1px ${parchment.dimGold}55 inset, 0 0 18px ${parchment.gold}22, 0 2px 8px rgba(0,0,0,0.5)`
                : `0 0 0 1px ${parchment.rule} inset, 0 2px 8px rgba(0,0,0,0.3)`,
              cursor: worldReady ? 'pointer' : 'default',
              opacity: worldReady ? 1 : 0.55,
              textTransform: 'uppercase',
            }}
            onMouseEnter={e => { if (worldReady) e.currentTarget.style.filter = 'brightness(1.2)'; }}
            onMouseLeave={e => { e.currentTarget.style.filter = ''; }}
          >
            {worldReady ? (
              <>
                <span style={{ color: parchment.gold }}>▶</span>
                <span>Set Sail</span>
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
          </button>
        </div>

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
