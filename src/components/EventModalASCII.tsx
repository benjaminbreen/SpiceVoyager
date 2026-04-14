import { useEffect, useRef, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useGameStore } from '../store/gameStore';
import { ALL_COMMODITIES, COMMODITY_DEFS, type Commodity } from '../utils/commodities';

// ── Colors ───────────────────────────────────────────────────────────────────
const GOLD      = '#c9a84c';
const DIM_GOLD  = '#8a7a4a';
const WARM      = '#b89a6a';
const CRIMSON   = '#a05050';
const TEAL      = '#5a9aaa';
const RULE      = '#3a3528';
const RULE_LT   = '#4a4538';
const DIM       = '#5a5445';
const TXT       = '#9a9080';
const BRIGHT    = '#d8ccb0';
const BG        = '#0c0b08';

// ── Inner width: chars between the ║ borders ─────────────────────────────────
// Total line width = 2 (║ + space) + IW + 2 (space + ║) = IW + 4 = 52
const IW = 48;

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
  const innerW = width - 2; // leading 2 spaces
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

// ── Main component ───────────────────────────────────────────────────────────

export function EventModalASCII({ onDismiss }: { onDismiss: () => void }) {
  const crew = useGameStore(s => s.crew);
  const ship = useGameStore(s => s.ship);
  const goldAmount = useGameStore(s => s.gold);
  const stats = useGameStore(s => s.stats);
  const ports = useGameStore(s => s.ports);
  const cargo = useGameStore(s => s.cargo);

  const captain = crew.find(c => c.role === 'Captain');
  const startPort = ports[0];

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
  const shipDesc = `The ${ship.type.toLowerCase()} `;
  const portLine = startPort ? `departs ${startPort.name} under the` : 'sets sail under the';
  const captainName = captain?.name ?? 'the Captain';
  const cmdLine = `command of `;

  const divChar = '\u2726';

  // ── Cartouche geometry ──
  const cartInner = IW - 8; // inner width of the ╭───╮ box (3 margin + 1 border each side)

  // ── Godspeed box geometry ──
  const godW = 26; // inner width of the ┌───┐ box
  const godBox = godW + 2; // including │ borders
  const godPadL = Math.floor((IW - godBox) / 2);
  const godPadR = IW - godBox - godPadL;

  const monoFont = '"SF Mono", "Fira Code", "Cascadia Code", "Consolas", monospace';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      className="absolute inset-0 z-[60] flex items-center justify-center pointer-events-auto"
      style={{ backgroundColor: 'rgba(6,5,4,0.88)', backdropFilter: 'blur(4px)' }}
      onClick={onDismiss}
    >
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: 0.05 }}
        onClick={e => e.stopPropagation()}
        className="relative select-none"
        style={{
          backgroundColor: 'rgba(8,7,5,0.92)',
          padding: '12px 16px',
          borderRadius: '4px',
          boxShadow: '0 0 40px rgba(0,0,0,0.6), 0 0 80px rgba(0,0,0,0.3)',
          willChange: 'opacity, transform',
        }}
      >
        <pre
          className="text-[10.5px] leading-[1.55] whitespace-pre"
          style={{ fontFamily: monoFont, color: TXT }}
        >
          {/* ═══ Floating ornaments above ═══ */}
          {'   '}<C c={DIM}>{ornamentSpan(0)}</C>
          {'        '}<C c={DIM}>{ornamentSpan(1)}</C>
          {'              '}<C c={DIM}>{ornamentSpan(2)}</C>
          {'              '}<C c={DIM}>{ornamentSpan(3)}</C>
          {'        '}<C c={DIM}>{ornamentSpan(4)}</C>{'\n'}

          {/* ═══ Top rail — total IW+4 = 52 chars ═══ */}
          <C c={GOLD}>{ornamentSpan(5)}</C>
          <C c={DIM_GOLD}>{'\u2500'}{'\u2550'.repeat(IW)}{'\u2500'}</C>
          <C c={GOLD}>{ornamentSpan(6)}</C>{'\n'}

          <L><C c={BG}>{sp(IW)}</C></L>

          {/* ═══ Title cartouche ═══ */}
          <L>
            <C c={BG}>{'   '}</C>
            <C c={DIM_GOLD}>{'\u256d'}{'\u2500'.repeat(cartInner)}{'\u256e'}</C>
            <C c={BG}>{'   '}</C>
          </L>
          <L>
            <C c={BG}>{'   '}</C>
            <C c={DIM_GOLD}>{'\u2502'}</C>
            <C c={BG}>{' '}</C>
            <C c={GOLD}>{'C O M M I S S I O N  O F  V O Y A G E'}</C>
            <C c={BG}>{sp(cartInner - 1 - 37)}</C>
            <C c={DIM_GOLD}>{'\u2502'}</C>
            <C c={BG}>{'   '}</C>
          </L>
          <L>
            <C c={BG}>{'   '}</C>
            <C c={DIM_GOLD}>{'\u2570'}{'\u2500'.repeat(cartInner)}{'\u256f'}</C>
            <C c={BG}>{'   '}</C>
          </L>

          <L><C c={BG}>{sp(IW)}</C></L>
          <L><Divider ornChar={divChar} /></L>
          <L><C c={BG}>{sp(IW)}</C></L>

          {/* ═══ Ship & Captain ═══ */}
          <L>
            <C c={BG}>{'    '}</C>
            <C c={TXT}>{shipDesc}</C>
            <C c={TEAL}>{ship.name}</C>
            <C c={BG}>{sp(IW - 4 - shipDesc.length - ship.name.length)}</C>
          </L>
          <L>
            <C c={BG}>{'    '}</C>
            <C c={TXT}>{portLine}</C>
            <C c={BG}>{sp(IW - 4 - portLine.length)}</C>
          </L>
          <L>
            <C c={BG}>{'    '}</C>
            <C c={TXT}>{cmdLine}</C>
            <C c={CRIMSON}>{captainName}</C>
            <C c={TXT}>{'.'}</C>
            <C c={BG}>{sp(IW - 4 - cmdLine.length - captainName.length - 1)}</C>
          </L>

          <L><C c={BG}>{sp(IW)}</C></L>
          <L><Divider ornChar={divChar} /></L>
          <L><C c={BG}>{sp(IW)}</C></L>

          {/* ═══ Crew table ═══ */}
          <L>
            <C c={BG}>{'    '}</C>
            <C c={WARM}>{pad('NAME', 19)}{pad('ROLE', 13)}{pad('SKILL', 5)}</C>
            <C c={BG}>{sp(IW - 4 - 19 - 13 - 5)}</C>
          </L>
          <L>
            <C c={BG}>{'    '}</C>
            <C c={RULE}>{'\u2500'.repeat(37)}</C>
            <C c={BG}>{sp(IW - 4 - 37)}</C>
          </L>

          {crewLines.map((m, i) => (
            <L key={i}>
              <C c={BG}>{'    '}</C>
              <C c={m.isCaptain ? CRIMSON : TXT}>{pad(m.name, 19)}</C>
              <C c={DIM}>{pad(m.role, 13)}</C>
              {skillBar(m.skill)}
              <C c={BG}>{sp(IW - 4 - 19 - 13 - 5)}</C>
            </L>
          ))}

          <L><C c={BG}>{sp(IW)}</C></L>
          <L><Divider ornChar={divChar} /></L>
          <L><C c={BG}>{sp(IW)}</C></L>

          {/* ═══ Stats ═══ */}
          <L>
            <C c={BG}>{'    '}</C>
            <C c={WARM}>{'Gold '}</C>
            <C c={BRIGHT}>{pad(goldAmount.toLocaleString(), 7)}</C>
            <C c={BG}>{'  '}</C>
            <C c={WARM}>{'Hull '}</C>
            {statBar(stats.hull, stats.maxHull, TEAL)}
            <C c={DIM}>{` ${stats.hull}/${stats.maxHull}`}</C>
            <C c={BG}>{sp(IW - 4 - 5 - 7 - 2 - 5 - 12 - ` ${stats.hull}/${stats.maxHull}`.length)}</C>
          </L>
          <L>
            <C c={BG}>{'    '}</C>
            <C c={WARM}>{'Crew '}</C>
            <C c={BRIGHT}>{pad(`${crew.length} souls`, 7)}</C>
            <C c={BG}>{'  '}</C>
            <C c={WARM}>{'Sail '}</C>
            {statBar(stats.sails, stats.maxSails, TEAL)}
            <C c={DIM}>{` ${stats.sails}/${stats.maxSails}`}</C>
            <C c={BG}>{sp(IW - 4 - 5 - 7 - 2 - 5 - 12 - ` ${stats.sails}/${stats.maxSails}`.length)}</C>
          </L>

          <L><C c={BG}>{sp(IW)}</C></L>
          <L><Divider ornChar={divChar} /></L>
          <L><C c={BG}>{sp(IW)}</C></L>

          {/* ═══ Cargo manifest ═══ */}
          <L>
            <C c={BG}>{'    '}</C>
            <C c={WARM}>{'CARGO MANIFEST'}</C>
            <C c={BG}>{sp(IW - 4 - 14)}</C>
          </L>
          <L>
            <C c={BG}>{'    '}</C>
            <C c={RULE}>{'\u2500'.repeat(37)}</C>
            <C c={BG}>{sp(IW - 4 - 37)}</C>
          </L>

          {ALL_COMMODITIES.filter(c => cargo[c] > 0).map((c, i) => {
            const def = COMMODITY_DEFS[c];
            const qty = cargo[c];
            const qtyStr = String(qty);
            const nameStr = c.length > 22 ? c.slice(0, 21) + '\u2026' : c;
            const tierTag = def.tier >= 4 ? '\u2726' : def.tier === 3 ? '\u00b7' : ' ';
            // Layout: 4 margin + icon(1) + space(1) + name(22) + space(1) + qty(4) + tier(1) + fill
            const usedW = 4 + 1 + 1 + 22 + 1 + 4 + 1;
            return (
              <L key={c}>
                <C c={BG}>{'    '}</C>
                <C c={def.color}>{def.icon}</C>
                <C c={BG}>{' '}</C>
                <C c={def.tier >= 4 ? GOLD : def.tier === 3 ? BRIGHT : TXT}>{pad(nameStr, 22)}</C>
                <C c={BG}>{' '}</C>
                <C c={BRIGHT}>{pad(qtyStr, 4)}</C>
                <C c={DIM}>{tierTag}</C>
                <C c={BG}>{sp(IW - usedW)}</C>
              </L>
            );
          })}

          {/* Cargo weight summary */}
          {(() => {
            const totalWeight = Object.entries(cargo).reduce(
              (sum, [c, qty]) => sum + qty * (COMMODITY_DEFS[c as Commodity]?.weight ?? 1), 0
            );
            const summaryStr = `${totalWeight}/${stats.cargoCapacity} hold capacity`;
            return (
              <>
                <L>
                  <C c={BG}>{'    '}</C>
                  <C c={RULE}>{'\u2500'.repeat(37)}</C>
                  <C c={BG}>{sp(IW - 4 - 37)}</C>
                </L>
                <L>
                  <C c={BG}>{'    '}</C>
                  <C c={DIM}>{summaryStr}</C>
                  <C c={BG}>{sp(IW - 4 - summaryStr.length)}</C>
                </L>
              </>
            );
          })()}

          <L><C c={BG}>{sp(IW)}</C></L>
          <L><WaveStripAnimated /></L>
          <L><C c={BG}>{sp(IW)}</C></L>

          {/* ═══ Godspeed button ═══ */}
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
              <C c={BRIGHT}>{'G O D S P E E D'}</C>
              <C c={GOLD}>{sp(godW - 4 - 15)}{'\u2502'}</C>
              {sp(godPadR)}
            </L>
            <L>
              {sp(godPadL)}
              <C c={GOLD}>{'\u2514'}{'\u2500'.repeat(godW)}{'\u2518'}</C>
              {sp(godPadR)}
            </L>
          </span>

          <L><C c={BG}>{sp(IW)}</C></L>

          {/* ═══ Bottom rail — total IW+4 = 52 chars ═══ */}
          <C c={GOLD}>{ornamentSpan(7)}</C>
          <C c={DIM_GOLD}>{'\u2500'}{'\u2550'.repeat(IW)}{'\u2500'}</C>
          <C c={GOLD}>{ornamentSpan(8)}</C>{'\n'}

          {/* ═══ Floating ornaments below ═══ */}
          {'   '}<C c={DIM}>{ornamentSpan(9)}</C>
          {'        '}<C c={DIM}>{ornamentSpan(10)}</C>
          {'              '}<C c={DIM}>{ornamentSpan(11)}</C>
          {'              '}<C c={DIM}>{ornamentSpan(12)}</C>
          {'        '}<C c={DIM}>{ornamentSpan(13)}</C>
        </pre>

        {/* ═══ Animated hint ═══ */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.6, 0.4, 0.6] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="text-center mt-1 text-[9px] tracking-[0.25em] uppercase"
          style={{ color: DIM }}
        >
          press enter
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
