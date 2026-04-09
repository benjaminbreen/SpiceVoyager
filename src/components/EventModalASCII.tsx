import { useEffect, useState, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useGameStore } from '../store/gameStore';

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

// ── Helpers ──────────────────────────────────────────────────────────────────
function C({ c, children }: { c: string; children: React.ReactNode }) {
  return <span style={{ color: c }}>{children}</span>;
}

function pad(s: string, n: number) {
  return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length);
}

// Safe padding — never goes negative
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

// ── Ornamental divider ───────────────────────────────────────────────────────
function Divider({ ornChar, width = 44 }: { ornChar: string; width?: number }) {
  const sideLen = Math.floor((width - 3) / 2);
  const dash = '\u2500';
  const side = (dash + ' ').repeat(Math.floor(sideLen / 2)).slice(0, sideLen);
  return (
    <span>
      <C c={RULE_LT}>{'  '}{side}</C>
      <C c={GOLD}>{ornChar}</C>
      <C c={RULE_LT}>{side}</C>
    </span>
  );
}

// ── Side border wrapper ──────────────────────────────────────────────────────
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

// ── Small animated wave strip ────────────────────────────────────────────────
function WaveStrip({ tick, width = 48 }: { tick: number; width?: number }) {
  const chars: React.ReactNode[] = [];
  const waveChars = [' ', '\u00b7', '~', '\u223c', '\u2248'];
  const colors = ['#142830', '#1a3a4a', '#2a5a6a', '#3a7a8a', '#4a8a9a'];
  for (let i = 0; i < width; i++) {
    const t = tick * 0.15;
    const wave = Math.sin(i * 0.4 + t) * 0.4 + Math.sin(i * 0.15 - t * 0.6) * 0.35 + Math.sin(i * 0.8 + t * 1.3) * 0.25;
    const idx = Math.max(0, Math.min(waveChars.length - 1, Math.floor((wave + 1) * 0.5 * waveChars.length)));
    chars.push(<span key={i} style={{ color: colors[idx] }}>{waveChars[idx]}</span>);
  }
  return <>{chars}</>;
}

// ── Main component ───────────────────────────────────────────────────────────

export function EventModalASCII({ onDismiss }: { onDismiss: () => void }) {
  const crew = useGameStore(s => s.crew);
  const ship = useGameStore(s => s.ship);
  const goldAmount = useGameStore(s => s.gold);
  const stats = useGameStore(s => s.stats);
  const ports = useGameStore(s => s.ports);

  const captain = crew.find(c => c.role === 'Captain');
  const startPort = ports[0];

  // ── Inner width: total chars between the ║ borders ──
  const IW = 48;

  // Twinkling ornament animation
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 350);
    return () => clearInterval(id);
  }, []);

  // Wave animation
  const [waveTick, setWaveTick] = useState(0);
  useEffect(() => {
    let animId: number;
    let last = 0;
    const frame = (time: number) => {
      animId = requestAnimationFrame(frame);
      if (time - last < 100) return;
      last = time;
      setWaveTick(t => t + 1);
    };
    animId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(animId);
  }, []);

  const ornamentAt = useCallback((phase: number) => {
    const chars = ['\u2726', '\u2727', '\u00b7', '\u2727', '\u2726', '\u25c7'];
    return chars[(tick + phase) % chars.length];
  }, [tick]);

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

  // ── Top border total width: IW + 4 (for ║ + space on each side) = 52 chars ──
  const railW = IW; // inner rail between the two ═ bookends

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
        initial={{ opacity: 0, y: 16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
        onClick={e => e.stopPropagation()}
        className="relative select-none"
      >
        <pre
          className="text-[10.5px] leading-[1.55] whitespace-pre"
          style={{
            fontFamily: '"SF Mono", "Fira Code", "Cascadia Code", "Consolas", monospace',
            color: TXT,
          }}
        >
          {/* ═══ Floating ornaments above border ═══ */}
          {'   '}<C c={DIM}>{ornamentAt(0)}</C>
          {'        '}<C c={DIM}>{ornamentAt(1)}</C>
          {'              '}<C c={DIM}>{ornamentAt(2)}</C>
          {'              '}<C c={DIM}>{ornamentAt(3)}</C>
          {'        '}<C c={DIM}>{ornamentAt(4)}</C>{'\n'}

          {/* ═══ Top rail ═══ */}
          <C c={GOLD}>{ornamentAt(5)}</C>
          <C c={DIM_GOLD}>{'\u2500'}</C>
          <C c={DIM_GOLD}>{'\u2550'.repeat(railW + 2)}</C>
          <C c={DIM_GOLD}>{'\u2500'}</C>
          <C c={GOLD}>{ornamentAt(0)}</C>{'\n'}

          {/* ═══ Empty ═══ */}
          <L><C c={BG}>{sp(IW)}</C></L>

          {/* ═══ Title cartouche ═══ */}
          <L>
            <C c={BG}>{'   '}</C>
            <C c={DIM_GOLD}>{'\u256d'}{'\u2500'.repeat(IW - 8)}{'\u256e'}</C>
            <C c={BG}>{'   '}</C>
          </L>
          <L>
            <C c={BG}>{'   '}</C>
            <C c={DIM_GOLD}>{'\u2502'}</C>
            <C c={BG}>{' '}</C>
            <C c={GOLD}>{'C O M M I S S I O N  O F  V O Y A G E'}</C>
            <C c={BG}>{sp(IW - 8 - 2 - 37)}</C>
            <C c={DIM_GOLD}>{'\u2502'}</C>
            <C c={BG}>{'   '}</C>
          </L>
          <L>
            <C c={BG}>{'   '}</C>
            <C c={DIM_GOLD}>{'\u2570'}{'\u2500'.repeat(IW - 8)}{'\u256f'}</C>
            <C c={BG}>{'   '}</C>
          </L>

          {/* ═══ Empty ═══ */}
          <L><C c={BG}>{sp(IW)}</C></L>

          {/* ═══ Divider ═══ */}
          <L><Divider ornChar={ornamentAt(1)} width={IW} /></L>

          {/* ═══ Empty ═══ */}
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

          {/* ═══ Empty ═══ */}
          <L><C c={BG}>{sp(IW)}</C></L>

          {/* ═══ Divider ═══ */}
          <L><Divider ornChar={ornamentAt(3)} width={IW} /></L>

          {/* ═══ Empty ═══ */}
          <L><C c={BG}>{sp(IW)}</C></L>

          {/* ═══ Crew table header ═══ */}
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

          {/* ═══ Crew rows ═══ */}
          {crewLines.map((m, i) => (
            <L key={i}>
              <C c={BG}>{'    '}</C>
              <C c={m.isCaptain ? CRIMSON : TXT}>{pad(m.name, 19)}</C>
              <C c={DIM}>{pad(m.role, 13)}</C>
              {skillBar(m.skill)}
              <C c={BG}>{sp(IW - 4 - 19 - 13 - 5)}</C>
            </L>
          ))}

          {/* ═══ Empty ═══ */}
          <L><C c={BG}>{sp(IW)}</C></L>

          {/* ═══ Divider ═══ */}
          <L><Divider ornChar={ornamentAt(5)} width={IW} /></L>

          {/* ═══ Empty ═══ */}
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

          {/* ═══ Empty ═══ */}
          <L><C c={BG}>{sp(IW)}</C></L>

          {/* ═══ Wave strip ═══ */}
          <L><WaveStrip tick={waveTick} width={IW} /></L>

          {/* ═══ Empty ═══ */}
          <L><C c={BG}>{sp(IW)}</C></L>

          {/* ═══ Godspeed button ═══ */}
          <L>
            <C c={BG}>{sp(10)}</C>
            <C c={GOLD}>{'\u250c'}{'\u2500'.repeat(26)}{'\u2510'}</C>
            <C c={BG}>{sp(IW - 10 - 28)}</C>
          </L>
          <L>
            <C c={BG}>{sp(10)}</C>
            <C c={GOLD}>{'\u2502  \u25b6 '}</C>
            <C c={BRIGHT}>{'G O D S P E E D'}</C>
            <C c={GOLD}>{sp(26 - 4 - 15)}{'\u2502'}</C>
            <C c={BG}>{sp(IW - 10 - 28)}</C>
          </L>
          <L>
            <C c={BG}>{sp(10)}</C>
            <C c={GOLD}>{'\u2514'}{'\u2500'.repeat(26)}{'\u2518'}</C>
            <C c={BG}>{sp(IW - 10 - 28)}</C>
          </L>

          {/* ═══ Hint ═══ */}
          <L>
            <C c={BG}>{sp(14)}</C>
            <C c={DIM}>{'press enter'}</C>
            <C c={BG}>{sp(IW - 14 - 11)}</C>
          </L>

          {/* ═══ Empty ═══ */}
          <L><C c={BG}>{sp(IW)}</C></L>

          {/* ═══ Bottom rail ═══ */}
          <C c={GOLD}>{ornamentAt(0)}</C>
          <C c={DIM_GOLD}>{'\u2500'}</C>
          <C c={DIM_GOLD}>{'\u2550'.repeat(railW + 2)}</C>
          <C c={DIM_GOLD}>{'\u2500'}</C>
          <C c={GOLD}>{ornamentAt(5)}</C>{'\n'}

          {/* ═══ Floating ornaments below border ═══ */}
          {'   '}<C c={DIM}>{ornamentAt(4)}</C>
          {'        '}<C c={DIM}>{ornamentAt(3)}</C>
          {'              '}<C c={DIM}>{ornamentAt(2)}</C>
          {'              '}<C c={DIM}>{ornamentAt(1)}</C>
          {'        '}<C c={DIM}>{ornamentAt(0)}</C>
        </pre>

        {/* Invisible click target over the button area */}
        <button
          onClick={onDismiss}
          className="absolute bottom-[70px] left-1/2 -translate-x-1/2 w-[200px] h-[50px] cursor-pointer opacity-0"
          aria-label="Dismiss"
        />
      </motion.div>
    </motion.div>
  );
}
