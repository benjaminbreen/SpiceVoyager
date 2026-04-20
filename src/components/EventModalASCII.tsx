import { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useGameStore } from '../store/gameStore';
import { ALL_COMMODITIES_FULL, COMMODITY_DEFS, type Commodity } from '../utils/commodities';
import { parchment } from '../theme/tokens';

// ── Colors ───────────────────────────────────────────────────────────────────
const GOLD      = parchment.gold;
const DIM_GOLD  = parchment.dimGold;
const WARM      = parchment.warm;
const CRIMSON   = parchment.crimson;
const TEAL      = parchment.teal;
const RULE      = parchment.rule;
const RULE_LT   = parchment.ruleLt;
const DIM       = parchment.dim;
const TXT       = parchment.txt;
const BRIGHT    = parchment.bright;
const BG        = parchment.bgPanel;

// ── Inner width: chars between the ║ borders ─────────────────────────────────
const IW = 48;
const IW_WIDE = 64;

// ── Date formatting ─────────────────────────────────────────────────────────
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

  return { day: ordinal(day), month: MONTH_NAMES_FULL[month], year };
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function C({ c, children }: { c: string; children: React.ReactNode }) {
  return <span style={{ color: c }}>{children}</span>;
}

function pad(s: string, n: number) {
  return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length);
}

function sp(n: number) {
  return ' '.repeat(Math.max(0, n));
}

function skillBar(skill: number, width = 5): React.ReactNode {
  const filled = Math.round((skill / 100) * width);
  const empty = width - filled;
  return (
    <>
      <C c={WARM}>{'\u2593'.repeat(filled)}</C>
      <C c={RULE}>{'\u2591'.repeat(empty)}</C>
    </>
  );
}

function statBar(value: number, max: number, color: string, width = 12): React.ReactNode {
  const filled = Math.round((value / max) * width);
  const empty = width - filled;
  return (
    <>
      <C c={color}>{'\u2588'.repeat(filled)}</C>
      <C c={RULE}>{'\u2591'.repeat(empty)}</C>
    </>
  );
}

// ── Ornamental divider — always exactly `width` chars ────────────────────────
function Divider({ ornChar, width = IW }: { ornChar: string; width?: number }) {
  const innerW = width - 2;
  const leftW = Math.floor((innerW - 1) / 2);
  const rightW = innerW - 1 - leftW;
  const dash = '\u2500';
  const left = (dash + ' ').repeat(Math.ceil(leftW / 2)).slice(0, leftW);
  const right = (' ' + dash).repeat(Math.ceil(rightW / 2)).slice(0, rightW);
  return (
    <span>
      <C c={RULE_LT}>{'  '}{left}</C>
      <C c={GOLD}>{ornChar}</C>
      <C c={RULE_LT}>{right}</C>
    </span>
  );
}

// ── Side border wrapper — every L child must be exactly IW chars ─────────────
function L({ children }: { children: React.ReactNode }) {
  return (
    <span>
      <C c={DIM_GOLD}>{'\u2551 '}</C>
      {children}
      <C c={DIM_GOLD}>{' \u2551'}</C>
      {'\n'}
    </span>
  );
}

// ── Animated wave strip (ref-based, no re-renders) ──────────────────────────
function WaveStripAnimated({ width = IW }: { width?: number }) {
  const spanRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let animId: number;
    let last = 0;
    let tick = 0;
    const waveChars = [' ', '\u00b7', '~', '\u223c', '\u2248'];
    const colors = ['#142830', '#1a3a4a', '#2a5a6a', '#3a7a8a', '#4a8a9a'];
    const frame = (time: number) => {
      animId = requestAnimationFrame(frame);
      if (time - last < 100) return;
      last = time;
      tick++;
      const el = spanRef.current;
      if (!el) return;
      let html = '';
      for (let i = 0; i < width; i++) {
        const t = tick * 0.15;
        const wave = Math.sin(i * 0.4 + t) * 0.4 + Math.sin(i * 0.15 - t * 0.6) * 0.35 + Math.sin(i * 0.8 + t * 1.3) * 0.25;
        const idx = Math.max(0, Math.min(waveChars.length - 1, Math.floor((wave + 1) * 0.5 * waveChars.length)));
        const ch = waveChars[idx];
        html += ch === ' ' ? ' ' : `<span style="color:${colors[idx]}">${ch}</span>`;
      }
      el.innerHTML = html;
    };
    animId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(animId);
  }, [width]);
  return <span ref={spanRef} />;
}

// ── Stagger animation wrapper ───────────────────────────────────────────────
function Stagger({ delay, children }: { delay: number; children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export function EventModalASCII({ onDismiss }: { onDismiss: () => void }) {
  const crew = useGameStore(s => s.crew);
  const ship = useGameStore(s => s.ship);
  const goldAmount = useGameStore(s => s.gold);
  const stats = useGameStore(s => s.stats);
  const ports = useGameStore(s => s.ports);
  const cargo = useGameStore(s => s.cargo);
  const dayCount = useGameStore(s => s.dayCount);

  const [screenSize, setScreenSize] = useState(() => {
    if (typeof window === 'undefined') return 'narrow' as const;
    return window.innerWidth >= 900 ? 'wide' as const : window.innerWidth < 420 ? 'tiny' as const : 'narrow' as const;
  });
  useEffect(() => {
    const onResize = () => {
      const w = window.innerWidth;
      setScreenSize(w >= 900 ? 'wide' : w < 420 ? 'tiny' : 'narrow');
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const isWide = screenSize === 'wide';
  const isTiny = screenSize === 'tiny';

  const captain = crew.find(c => c.role === 'Captain');
  const startPort = ports[0];
  const IW_TINY = 36;
  const iw = isWide ? IW_WIDE : isTiny ? IW_TINY : IW;

  // Format date
  const dateInfo = formatCommissionDate(dayCount);

  // Ornament animation — ref-based to avoid full re-renders
  const ornamentRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const ORNAMENT_CHARS = useMemo(() => ['\u2726', '\u2727', '\u00b7', '\u2727', '\u2726', '\u25c7'], []);
  useEffect(() => {
    const id = setInterval(() => {
      const tick = Math.floor(Date.now() / 350);
      ornamentRefs.current.forEach((el, i) => {
        if (el) el.textContent = ORNAMENT_CHARS[(tick + i) % ORNAMENT_CHARS.length];
      });
    }, 350);
    return () => clearInterval(id);
  }, [ORNAMENT_CHARS]);

  const ornamentSpan = useCallback((phase: number) => {
    return (
      <span ref={el => { ornamentRefs.current[phase] = el; }}>
        {ORNAMENT_CHARS[phase % ORNAMENT_CHARS.length]}
      </span>
    );
  }, [ORNAMENT_CHARS]);

  // Keyboard dismiss
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
        e.preventDefault();
        onDismiss();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onDismiss]);

  // ── Format crew data ──
  const crewLines = crew.map(member => {
    let name = member.name;
    if (name.length > 17) {
      const parts = name.split(' ');
      name = parts.length > 1
        ? (parts[0][0] + '. ' + parts.slice(1).join(' ')).slice(0, 17)
        : name.slice(0, 17);
    }
    return { name, role: member.role, skill: member.skill, isCaptain: member.role === 'Captain' };
  });

  // ── Pre-compute text lines ──
  const captainName = captain?.name ?? 'the Captain';

  const divChar = '\u2726';

  // ── Table column widths (scale with iw) ──
  const nameW = isWide ? 32 : 19;
  const roleW = isWide ? 18 : 13;
  const skillW = 5;
  const tblW = nameW + roleW + skillW;
  const cargoNameW = isWide ? 18 : 12;
  const cargoColW = cargoNameW + 8;
  const cargoGap = iw - 4 - cargoColW * 2;

  // ── Godspeed box geometry ──
  const godW = 26;
  const godBox = godW + 2;
  const godPadL = Math.floor((iw - godBox) / 2);
  const godPadR = iw - godBox - godPadL;

  const monoFont = '"SF Mono", "Fira Code", "Cascadia Code", "Consolas", monospace';

  // ── Stagger timing ──
  const S = { title: 0.15, desc: 0.35, crew: 0.55, stats: 0.8, cargo: 1.0, wave: 1.2, button: 1.35 };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      className="absolute inset-0 z-[60] flex items-center justify-center pointer-events-auto"
      style={{
        backgroundColor: 'rgba(6,5,4,0.6)',
        backdropFilter: 'blur(2px)',
      }}
      onClick={onDismiss}
    >
      {/* Port image as background — fills most of the viewport */}
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.98 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        onClick={e => e.stopPropagation()}
        className="relative select-none"
        style={{
          width: '100vw',
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          willChange: 'opacity, transform',
        }}
      >
        {/* Port painting as outer background */}
        <img
          src={`/ports/${startPort?.id ?? 'bantam'}.png`}
          alt=""
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transform: 'scale(1.15)',
            filter: 'sepia(0.15) contrast(1.05) brightness(0.6) saturate(1.1)',
          }}
        />
        {/* Elegant vignette — soft fade at edges, keeps center visible */}
        <div style={{
          position: 'absolute',
          inset: 0,
          background: `
            radial-gradient(ellipse at center, transparent 35%, rgba(6,5,4,0.45) 70%, rgba(6,5,4,0.85) 100%)
          `,
          pointerEvents: 'none',
        }} />

        {/* ═══ The document itself — dark panel inside the baroque frame ═══ */}
        <div
          className="relative"
          style={{
            backgroundColor: 'rgba(8,7,5,0.94)',
            boxShadow: '0 0 40px rgba(0,0,0,0.8), 0 0 80px rgba(0,0,0,0.35), inset 0 0 30px rgba(0,0,0,0.2)',
            padding: isWide ? '20px 30px' : isTiny ? '12px 10px' : '16px 20px',
            maxHeight: '90vh',
            overflowY: 'auto',
          }}
        >
          <pre
            className={`${isWide ? 'text-[13px]' : isTiny ? 'text-[8.5px]' : 'text-[10.5px]'} leading-[1.55] whitespace-pre`}
            style={{ fontFamily: monoFont, color: TXT, margin: 0, padding: 0 }}
          >
            {/* ═══ Top rail ═══ */}
            <Stagger delay={0.05}>
              <C c={DIM_GOLD}>{'\u2554'}{'\u2550'.repeat(iw + 2)}{'\u2557'}</C>{'\n'}
              <L><C c={BG}>{sp(iw)}</C></L>
            </Stagger>

            {/* ═══ COMMISSION OF VOYAGE title ═══ */}
            <Stagger delay={S.title}>
              {(() => {
                // Spaced title that fits within iw
                const title = isWide
                  ? 'C O M M I S S I O N   O F   V O Y A G E'
                  : 'COMMISSION OF VOYAGE';
                const titleLen = title.length;
                const ruleW = titleLen + 1; // 2 char padding each side
                const padL = Math.floor((iw - ruleW) / 2);
                const padR = iw - ruleW - padL;
                const tPadL = Math.floor((iw - titleLen) / 2);
                const tPadR = iw - titleLen - tPadL;
                return (
                  <>
                    <L><C c={BG}>{sp(iw)}</C></L>
                    <L>
                      <C c={BG}>{sp(padL)}</C>
                      <C c={DIM_GOLD}>{'\u2500'.repeat(ruleW)}</C>
                      <C c={BG}>{sp(padR)}</C>
                    </L>
                    <L>
                      <C c={BG}>{sp(tPadL)}</C>
                      <C c={GOLD}>{title}</C>
                      <C c={BG}>{sp(tPadR)}</C>
                    </L>
                    <L>
                      <C c={BG}>{sp(padL)}</C>
                      <C c={DIM_GOLD}>{'\u2500'.repeat(ruleW)}</C>
                      <C c={BG}>{sp(padR)}</C>
                    </L>
                    <L><C c={BG}>{sp(iw)}</C></L>
                  </>
                );
              })()}
            </Stagger>

            {/* ═══ Ship description with date — rendered larger ═══ */}
            <Stagger delay={S.desc}>
              <L><C c={BG}>{sp(iw)}</C></L>
            </Stagger>
          </pre>
          {/* Break out of <pre> for larger description text */}
          <Stagger delay={S.desc}>
            <div style={{
              textAlign: 'center',
              fontFamily: monoFont,
              fontSize: isWide ? 15 : isTiny ? 11 : 13,
              lineHeight: 1.4,
              color: TXT,
              padding: isWide ? '0px 0 0px' : '2px 0 6px',
              borderLeft: `3px double ${DIM_GOLD}`,
              borderRight: `3px double ${DIM_GOLD}`,
              marginLeft: '0px',
              marginRight: '0px',
            }}>
              <span>The {ship.type.toLowerCase()} </span>
              <span style={{ color: TEAL }}>{ship.name}</span>
              <br />
              <span>{startPort ? `departs ${startPort.name} on the` : 'sets sail on the'}</span>
              <br />
              <span style={{ color: WARM }}>{dateInfo.day} of {dateInfo.month}, {dateInfo.year}</span>
              <br />
              <span>under the command of </span>
              <span style={{ color: CRIMSON }}>{captainName}</span>
              <span>.</span>
            </div>
          </Stagger>
          <pre
            className={`${isWide ? 'text-[13px]' : isTiny ? 'text-[8.5px]' : 'text-[10.5px]'} leading-[1.55] whitespace-pre`}
            style={{ fontFamily: monoFont, color: TXT, margin: 0, padding: 0 }}
          >
            <Stagger delay={S.desc}>
              <L><C c={BG}>{sp(iw)}</C></L>
            </Stagger>

            {/* ═══ Ornamental spacer ═══ */}
            <Stagger delay={S.crew - 0.05}>
              <L>
                {(() => {
                  // Build a centered ornament line:  ✦    ·    ◇    ·    ✦
                  const ornLine = 5 + 4 * 4; // 5 ornaments + 4 gaps of 4 spaces = 21 chars
                  const padL = Math.floor((iw - ornLine) / 2);
                  const padR = iw - ornLine - padL;
                  return (
                    <>
                      <C c={BG}>{sp(padL)}</C>
                      <C c={DIM}>{ornamentSpan(0)}</C>{sp(4)}
                      <C c={DIM}>{ornamentSpan(1)}</C>{sp(4)}
                      <C c={DIM}>{ornamentSpan(2)}</C>{sp(4)}
                      <C c={DIM}>{ornamentSpan(3)}</C>{sp(4)}
                      <C c={DIM}>{ornamentSpan(4)}</C>
                      <C c={BG}>{sp(padR)}</C>
                    </>
                  );
                })()}
              </L>
            </Stagger>

            {/* ═══ Crew table ═══ */}
            <Stagger delay={S.crew}>
              <L><C c={BG}>{sp(iw)}</C></L>
              <L>
                <C c={BG}>{'    '}</C>
                <C c={WARM}>{pad('NAME', nameW)}{pad('ROLE', roleW)}{pad('SKILL', skillW)}</C>
                <C c={BG}>{sp(iw - 4 - tblW)}</C>
              </L>
              <L>
                <C c={BG}>{'    '}</C>
                <C c={RULE}>{'\u2500'.repeat(tblW)}</C>
                <C c={BG}>{sp(iw - 4 - tblW)}</C>
              </L>

              {crewLines.map((m, i) => {
                let name = m.name;
                if (name.length > nameW) name = name.slice(0, nameW - 1) + '\u2026';
                return (
                  <L key={i}>
                    <C c={BG}>{'    '}</C>
                    <C c={m.isCaptain ? CRIMSON : TXT}>{pad(name, nameW)}</C>
                    <C c={DIM}>{pad(m.role, roleW)}</C>
                    {skillBar(m.skill)}
                    <C c={BG}>{sp(iw - 4 - tblW)}</C>
                  </L>
                );
              })}
            </Stagger>

            {/* ═══ Stats divider + Gold/Hull ═══ */}
            <Stagger delay={S.stats}>
              <L><C c={BG}>{sp(iw)}</C></L>
              <L><Divider ornChar={divChar} width={iw} /></L>
              <L><C c={BG}>{sp(iw)}</C></L>

              <L>
                <C c={BG}>{'    '}</C>
                <C c={WARM}>{'Gold '}</C>
                <C c={BRIGHT}>{pad(goldAmount.toLocaleString(), 7)}</C>
                <C c={BG}>{'  '}</C>
                <C c={WARM}>{'Hull '}</C>
                {statBar(stats.hull, stats.maxHull, TEAL)}
                <C c={DIM}>{` ${stats.hull}/${stats.maxHull}`}</C>
                <C c={BG}>{sp(iw - 4 - 5 - 7 - 2 - 5 - 12 - ` ${stats.hull}/${stats.maxHull}`.length)}</C>
              </L>
            </Stagger>

            {/* ═══ Cargo manifest ═══ */}
            <Stagger delay={S.cargo}>
              <L><C c={BG}>{sp(iw)}</C></L>
              <L><Divider ornChar={divChar} width={iw} /></L>
              <L><C c={BG}>{sp(iw)}</C></L>

              {(() => {
                const totalWeight = Object.entries(cargo).reduce(
                  (sum, [c, qty]) => sum + qty * (COMMODITY_DEFS[c as Commodity]?.weight ?? 1), 0
                );
                const capStr = `${totalWeight}/${stats.cargoCapacity}`;
                const headerUsed = 4 + 14 + capStr.length;
                return (
                  <L>
                    <C c={BG}>{'    '}</C>
                    <C c={WARM}>{'CARGO MANIFEST'}</C>
                    <C c={BG}>{sp(iw - headerUsed)}</C>
                    <C c={DIM}>{capStr}</C>
                  </L>
                );
              })()}
              <L>
                <C c={BG}>{'    '}</C>
                <C c={RULE}>{'\u2500'.repeat(iw - 8)}</C>
                <C c={BG}>{sp(4)}</C>
              </L>

              {(() => {
                const items = ALL_COMMODITIES_FULL.filter(c => cargo[c] > 0);
                if (isWide) {
                  const pairs: [string, string | null][] = [];
                  for (let i = 0; i < items.length; i += 2) {
                    pairs.push([items[i], items[i + 1] ?? null]);
                  }
                  const renderCol = (c: string) => {
                    const def = COMMODITY_DEFS[c as Commodity];
                    const qty = cargo[c as Commodity];
                    const nameStr = c.length > cargoNameW ? c.slice(0, cargoNameW - 1) + '\u2026' : c;
                    const tierTag = def.tier >= 4 ? '\u2726' : def.tier === 3 ? '\u00b7' : ' ';
                    return (
                      <>
                        <C c={def.color}>{def.icon}</C>
                        <C c={BG}>{' '}</C>
                        <C c={def.tier >= 4 ? GOLD : def.tier === 3 ? BRIGHT : TXT}>{pad(nameStr, cargoNameW)}</C>
                        <C c={BG}>{' '}</C>
                        <C c={BRIGHT}>{pad(String(qty), 4)}</C>
                        <C c={DIM}>{tierTag}</C>
                      </>
                    );
                  };
                  return pairs.map(([left, right], i) => (
                    <L key={i}>
                      <C c={BG}>{'    '}</C>
                      {renderCol(left)}
                      <C c={BG}>{sp(cargoGap)}</C>
                      {right ? renderCol(right) : <C c={BG}>{sp(cargoColW)}</C>}
                      <C c={BG}>{sp(iw - 4 - cargoColW - cargoGap - cargoColW)}</C>
                    </L>
                  ));
                } else {
                  return items.map((c) => {
                    const def = COMMODITY_DEFS[c];
                    const qty = cargo[c];
                    const nameStr = c.length > 22 ? c.slice(0, 21) + '\u2026' : c;
                    const tierTag = def.tier >= 4 ? '\u2726' : def.tier === 3 ? '\u00b7' : ' ';
                    const usedW = 4 + 1 + 1 + 22 + 1 + 4 + 1;
                    return (
                      <L key={c}>
                        <C c={BG}>{'    '}</C>
                        <C c={def.color}>{def.icon}</C>
                        <C c={BG}>{' '}</C>
                        <C c={def.tier >= 4 ? GOLD : def.tier === 3 ? BRIGHT : TXT}>{pad(nameStr, 22)}</C>
                        <C c={BG}>{' '}</C>
                        <C c={BRIGHT}>{pad(String(qty), 4)}</C>
                        <C c={DIM}>{tierTag}</C>
                        <C c={BG}>{sp(iw - usedW)}</C>
                      </L>
                    );
                  });
                }
              })()}
            </Stagger>

            {/* ═══ Wave + Godspeed button ═══ */}
            <Stagger delay={S.wave}>
              <L><C c={BG}>{sp(iw)}</C></L>
              <L><WaveStripAnimated width={iw} /></L>
              <L><C c={BG}>{sp(iw)}</C></L>
            </Stagger>

            <Stagger delay={S.button}>
              <span
                onClick={onDismiss}
                role="button"
                tabIndex={0}
                className="cursor-pointer"
                style={{ transition: 'filter 0.15s ease' }}
                onMouseEnter={e => { e.currentTarget.style.filter = 'brightness(1.3)'; }}
                onMouseLeave={e => { e.currentTarget.style.filter = ''; }}
              >
                <L>
                  {sp(godPadL)}
                  <C c={GOLD}>{'\u250c'}{'\u2500'.repeat(godW)}{'\u2510'}</C>
                  {sp(godPadR)}
                </L>
                <L>
                  {sp(godPadL)}
                  <C c={GOLD}>{'\u2502  \u25b6 '}</C>
                  <C c={BRIGHT}>{' S E T  S A I L'}</C>
                  <C c={GOLD}>{sp(godW - 4 - 15)}{'\u2502'}</C>
                  {sp(godPadR)}
                </L>
                <L>
                  {sp(godPadL)}
                  <C c={GOLD}>{'\u2514'}{'\u2500'.repeat(godW)}{'\u2518'}</C>
                  {sp(godPadR)}
                </L>
              </span>

              <L><C c={BG}>{sp(iw)}</C></L>

              {/* ═══ Bottom rail ═══ */}
              <C c={DIM_GOLD}>{'\u255a'}{'\u2550'.repeat(iw + 2)}{'\u255d'}</C>{'\n'}
            </Stagger>
          </pre>
        </div>

        {/* ═══ Animated hint — outside the frame ═══ */}
        <Stagger delay={S.button + 0.15}>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.6, 0.4, 0.6] }}
            transition={{ duration: 2, repeat: Infinity, delay: S.button + 0.3 }}
            className="text-center mt-2 text-[9px] tracking-[0.25em] uppercase relative"
            style={{ color: DIM }}
          >
            press enter
          </motion.div>
        </Stagger>
      </motion.div>
    </motion.div>
  );
}
