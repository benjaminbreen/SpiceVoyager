import { useEffect, useMemo, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ambientEngine } from '../audio/AmbientEngine';
import { audioManager } from '../audio/AudioManager';
import { ASCII_COLORS, BaroqueBorder, C } from './ascii-ui-kit';

interface OpeningOverlayProps {
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
}

const MONO_FONT = '"SF Mono", "Fira Code", "Cascadia Code", "Consolas", monospace';
const SERIF_FONT = '"Fraunces", "IM Fell English", Georgia, serif';
const SANS_FONT = '"DM Sans", system-ui, sans-serif';

const WAVE_CHARS = [' ', ' ', '.', '.', '~', '~', '\u223c', '\u2248', '\u2248'];
const WAVE_COLORS = [
  '#0d1a22',
  '#142830',
  '#1a303a',
  '#214656',
  '#2d5c6c',
  '#3a6a7a',
  '#4a7a8a',
  '#5a8a9a',
  '#7aaaba',
];

const BACKGROUND_SHIP = [
  '      |      ',
  '     /|\\     ',
  '    /_|_\\    ',
  '   /__|__\\   ',
  '      |      ',
  '  ____|____  ',
  '  \\  o o  /  ',
  '~~~\\_____/~~~',
].map(line => Array.from(line));

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function useSplashAudio() {
  const musicStarted = useRef(false);

  useEffect(() => {
    const tryPlay = () => {
      if (musicStarted.current) return;
      ambientEngine.markInteracted();
      audioManager.playSplash();
      setTimeout(() => {
        musicStarted.current = true;
        window.removeEventListener('click', tryPlay, true);
        window.removeEventListener('keydown', tryPlay, true);
        window.removeEventListener('pointerdown', tryPlay, true);
      }, 100);
    };

    window.addEventListener('click', tryPlay, true);
    window.addEventListener('keydown', tryPlay, true);
    window.addEventListener('pointerdown', tryPlay, true);
    return () => {
      window.removeEventListener('click', tryPlay, true);
      window.removeEventListener('keydown', tryPlay, true);
      window.removeEventListener('pointerdown', tryPlay, true);
    };
  }, []);
}

function useReadyHotkeys(ready: boolean, onStart: () => void) {
  useEffect(() => {
    if (!ready) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onStart();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [ready, onStart]);
}

function BackgroundShip() {
  const preRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    const el = preRef.current;
    if (!el) return;

    const charW = 6.4;
    const charH = 13;
    let cols = 0;
    let rows = 0;

    const measure = () => {
      const rect = el.getBoundingClientRect();
      cols = Math.max(0, Math.floor(rect.width / charW));
      rows = Math.max(0, Math.floor(rect.height / charH));
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);

    let lastTime = 0;
    let frame = Math.floor(Math.random() * 1000);
    let animId = 0;
    const ship = {
      x: 18 + Math.random() * 16,
      y: 10 + Math.random() * 12,
      vx: (Math.random() - 0.5) * 0.22,
      vy: 0.06 + Math.random() * 0.1,
      phase: Math.random() * Math.PI * 2,
    };

    const tick = (time: number) => {
      animId = requestAnimationFrame(tick);
      if (time - lastTime < 82) return;
      lastTime = time;

      if (cols < 12 || rows < 12) {
        el.innerHTML = '';
        return;
      }

      frame++;
      const t = frame * 0.08;
      if (Math.random() < 0.18) ship.vx += (Math.random() - 0.5) * 0.16;
      if (Math.random() < 0.12) ship.vy += (Math.random() - 0.45) * 0.06;

      ship.vx = clamp(ship.vx, -0.24, 0.24);
      ship.vy = clamp(ship.vy, 0.025, 0.16);
      ship.x += ship.vx + Math.sin(t + ship.phase) * 0.025;
      ship.y += ship.vy;

      if (ship.x < 4 || ship.x > cols - BACKGROUND_SHIP[0].length - 4) ship.vx *= -0.86;
      if (ship.y > rows + 5) {
        ship.y = -BACKGROUND_SHIP.length - Math.random() * 5;
        ship.x = 8 + Math.random() * Math.max(8, cols - BACKGROUND_SHIP[0].length - 16);
        ship.vx = (Math.random() - 0.5) * 0.16;
        ship.vy = 0.05 + Math.random() * 0.1;
      }

      let html = '';
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const wx = x;
          let painted = false;

          const sx = Math.floor(ship.x);
          const sy = Math.floor(ship.y);
          const sr = y - sy;
          const sc = wx - sx;

          if (sr >= 0 && sr < BACKGROUND_SHIP.length && sc >= 0 && sc < BACKGROUND_SHIP[sr].length) {
            const ch = BACKGROUND_SHIP[sr][sc];
            if (ch !== ' ') {
              const color = sr < 4 ? '#d4c8a8' : sr < 6 ? '#b89a6a' : '#8b6940';
              html += `<span style="color:${color};opacity:0.86">${ch}</span>`;
              painted = true;
            }
          }

          const wake = y - (sy + BACKGROUND_SHIP.length);
          const wakeDist = Math.abs(wx - sx - Math.floor(BACKGROUND_SHIP[0].length / 2));
          if (!painted && wake >= 0 && wake < 8 && wakeDist <= wake + 2 && wakeDist > 1) {
            const opacity = (0.34 * (1 - wake / 8)).toFixed(2);
            html += `<span style="color:#5a8a9a;opacity:${opacity}">\u2248</span>`;
            painted = true;
          }

          if (painted) continue;

          const swell =
            Math.sin(wx * 0.28 + y * 0.15 + t) * 0.42 +
            Math.sin(wx * 0.11 - y * 0.35 + t * 0.72) * 0.34 +
            Math.sin(y * 0.54 + t * 1.2 + wx * 0.05) * 0.24;
          const centerFade = 1 - Math.abs((x / Math.max(1, cols - 1)) - 0.5) * 1.5;
          const fade = clamp(centerFade, 0.18, 0.85);
          const sparkle = Math.random() < 0.0025 && fade > 0.65;
          const idx = sparkle
            ? WAVE_CHARS.length - 1
            : clamp(Math.floor((swell + 1) * 0.5 * WAVE_CHARS.length * fade), 0, WAVE_CHARS.length - 1);
          const ch = WAVE_CHARS[idx];

          if (ch === ' ') {
            html += ' ';
          } else {
            html += `<span style="color:${WAVE_COLORS[idx]};opacity:${(0.45 + fade * 0.45).toFixed(2)}">${ch}</span>`;
          }
        }
        html += '\n';
      }

      el.innerHTML = html;
    };

    const delay = window.setTimeout(() => {
      animId = requestAnimationFrame(tick);
    }, 320);

    return () => {
      window.clearTimeout(delay);
      cancelAnimationFrame(animId);
      ro.disconnect();
    };
  }, []);

  return (
    <pre
      ref={preRef}
      className="absolute top-8 bottom-8 hidden overflow-hidden select-none pointer-events-none md:block"
      style={{
        left: '24px',
        right: '24px',
        minWidth: 0,
        fontFamily: MONO_FONT,
        fontSize: '10px',
        lineHeight: '13px',
        opacity: 0.5,
        contain: 'strict',
        maskImage: 'radial-gradient(ellipse at center, black 0%, black 42%, transparent 76%)',
        WebkitMaskImage: 'radial-gradient(ellipse at center, black 0%, black 42%, transparent 76%)',
      }}
    />
  );
}

function SparkleRail({ width = 44 }: { width?: number }) {
  const refs = useRef<(HTMLSpanElement | null)[]>([]);
  const chars = useMemo(() => ['\u2726', '\u00b7', '\u2727', '\u25c7', '\u2727', '\u00b7'], []);

  useEffect(() => {
    const id = window.setInterval(() => {
      const tick = Math.floor(Date.now() / 420);
      refs.current.forEach((el, i) => {
        if (el) el.textContent = chars[(tick + i) % chars.length];
      });
    }, 420);
    return () => window.clearInterval(id);
  }, [chars]);

  const dashCount = Math.max(8, Math.floor((width - 7) / 2));
  return (
    <pre className="text-center text-[10px] leading-none whitespace-pre" style={{ fontFamily: MONO_FONT }}>
      <C c={ASCII_COLORS.ruleLight}>{'\u2576'}{'\u2500'.repeat(dashCount)}</C>
      <C c={ASCII_COLORS.dimGold}>{' '}</C>
      {[0, 1, 2].map((phase) => (
        <span key={phase}>
          <C c={phase === 1 ? ASCII_COLORS.gold : ASCII_COLORS.dimGold}>
            <span ref={(el) => { refs.current[phase] = el; }}>{chars[phase]}</span>
          </C>
          {phase < 2 ? <C c={ASCII_COLORS.dimGold}>{' '}</C> : null}
        </span>
      ))}
      <C c={ASCII_COLORS.ruleLight}>{'\u2500'.repeat(dashCount)}{'\u2574'}</C>
    </pre>
  );
}

function RouteTrace() {
  return (
    <svg className="absolute inset-0 h-full w-full pointer-events-none" viewBox="0 0 640 720" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="opening-route-alt" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#8a7a4a" stopOpacity="0.05" />
          <stop offset="0.48" stopColor="#7aaaba" stopOpacity="0.18" />
          <stop offset="1" stopColor="#c9a84c" stopOpacity="0.08" />
        </linearGradient>
      </defs>
      <motion.path
        d="M-20 520 C90 440 110 590 220 500 C335 405 304 270 430 245 C535 224 560 134 660 90"
        fill="none"
        stroke="url(#opening-route-alt)"
        strokeWidth="2"
        strokeDasharray="4 14"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 2.2, delay: 0.35, ease: 'easeOut' }}
      />
      {[120, 260, 410, 545].map((x, i) => (
        <motion.circle
          key={x}
          cx={x}
          cy={[468, 404, 253, 162][i]}
          r={i === 2 ? 2.5 : 1.8}
          fill={i === 2 ? ASCII_COLORS.gold : ASCII_COLORS.waterLight}
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: [0.15, 0.55, 0.22], scale: [0.8, 1.25, 0.9] }}
          transition={{ duration: 2.8 + i * 0.3, repeat: Infinity, delay: 0.8 + i * 0.2 }}
        />
      ))}
    </svg>
  );
}

function TitleLockup() {
  return (
    <div className="text-center">
      <div
        className="inline-block px-5 py-2 text-[24px] leading-none sm:text-[30px]"
        style={{
          color: ASCII_COLORS.bright,
          fontFamily: SERIF_FONT,
          letterSpacing: '0',
          borderTop: `1px solid ${ASCII_COLORS.dimGold}`,
          borderBottom: `1px solid ${ASCII_COLORS.ruleLight}`,
          textShadow: '0 0 22px rgba(201,168,76,0.18)',
        }}
      >
        <span style={{ color: ASCII_COLORS.dimGold, fontFamily: MONO_FONT }}>[ </span>
        SPICE VOYAGER
        <span style={{ color: ASCII_COLORS.dimGold, fontFamily: MONO_FONT }}> ]</span>
      </div>
      <div className="mt-2 text-[12px]" style={{ color: ASCII_COLORS.txt, fontFamily: SERIF_FONT, fontStyle: 'italic' }}>
        A game of oceanic trade, 1580-1620
      </div>
    </div>
  );
}

function ShipPortrait() {
  return (
    <div className="relative mx-auto mt-5 w-full max-w-[430px] overflow-hidden py-1">
      <svg className="absolute left-1/2 top-0 h-[150px] w-[320px] -translate-x-1/2 pointer-events-none" viewBox="0 0 320 150" aria-hidden="true">
        <motion.path
          d="M142 10 C106 48 86 88 74 128 C110 106 132 68 142 10 Z"
          fill="#d4c8a8"
          opacity="0.09"
          animate={{ opacity: [0.06, 0.13, 0.08] }}
          transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.path
          d="M158 12 C194 50 218 88 244 130 C202 110 174 72 158 12 Z"
          fill="#c9a84c"
          opacity="0.08"
          animate={{ opacity: [0.04, 0.11, 0.05] }}
          transition={{ duration: 5.4, repeat: Infinity, ease: 'easeInOut', delay: 0.4 }}
        />
        <path d="M52 118 C112 139 214 139 268 116 C248 146 86 148 52 118 Z" fill="#3a6a7a" opacity="0.1" />
      </svg>

      <pre className="relative text-center text-[10px] leading-[1.24] whitespace-pre sm:text-[11px]" style={{ fontFamily: MONO_FONT }}>
        <C c={ASCII_COLORS.dim}>{'        .             '}</C><C c={ASCII_COLORS.dimGold}>{'\u2726'}</C><C c={ASCII_COLORS.dim}>{'       .'}</C>{'\n'}
        <C c={ASCII_COLORS.mast}>{'              |\\'}</C>{'\n'}
        <C c={ASCII_COLORS.mast}>{'          |   || \\        |'}</C>{'\n'}
        <C c={ASCII_COLORS.sail}>{'         /|\\  ||  \\      /|\\'}</C>{'\n'}
        <C c={ASCII_COLORS.sail}>{'        /_|_\\ ||___\\    /_|_\\'}</C>{'\n'}
        <C c={ASCII_COLORS.sail}>{'       /____\\||____\\  /____\\'}</C>{'\n'}
        <C c={ASCII_COLORS.mast}>{'             ||'}</C>{'\n'}
        <C c={ASCII_COLORS.hull}>{'     ________||________________'}</C>{'\n'}
        <C c={ASCII_COLORS.water}>{' ~~~ '}</C><C c={ASCII_COLORS.hull}>{'\\  o    o    o    o    o  /'}</C><C c={ASCII_COLORS.water}>{' ~~~'}</C>{'\n'}
        <C c={ASCII_COLORS.waterLight}>{' \u2248\u2248\u2248  '}</C><C c={ASCII_COLORS.hull}>{"`-.___._____________.-'"}</C><C c={ASCII_COLORS.waterLight}>{'  \u2248\u2248\u2248'}</C>{'\n'}
        <C c={ASCII_COLORS.water}>{'     \u223c \u223c  '}</C><C c={ASCII_COLORS.foam}>{'\u2248\u2248\u2248\u2248\u2248\u2248\u2248\u2248\u2248\u2248\u2248\u2248\u2248'}</C><C c={ASCII_COLORS.water}>{'  \u223c \u223c'}</C>
      </pre>
    </div>
  );
}

function LoadingGauge({
  ready,
  loadingProgress,
  loadingMessage,
}: {
  ready: boolean;
  loadingProgress: number;
  loadingMessage: string;
}) {
  const pct = ready ? 100 : clamp(loadingProgress, 0, 96);
  const label = ready ? 'Harbors charted. Holds secured.' : loadingMessage;
  const segments = 30;
  const filled = ready ? segments : Math.round((pct / 100) * segments);

  return (
    <div className="mt-5 text-center">
      <AnimatePresence mode="wait">
        <motion.div
          key={label}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.22 }}
          className="min-h-[18px] text-[11px]"
          style={{ color: ready ? ASCII_COLORS.green : ASCII_COLORS.txt, fontFamily: SERIF_FONT, fontStyle: 'italic' }}
        >
          {label}
        </motion.div>
      </AnimatePresence>

      <pre className="mt-2 text-[10px] leading-none whitespace-pre" style={{ fontFamily: MONO_FONT }}>
        <C c={ready ? ASCII_COLORS.green : ASCII_COLORS.ruleLight}>{'['}</C>
        <C c={ready ? ASCII_COLORS.green : ASCII_COLORS.gold}>{'\u2588'.repeat(filled)}</C>
        <C c={ASCII_COLORS.rule}>{'\u2591'.repeat(segments - filled)}</C>
        <C c={ready ? ASCII_COLORS.green : ASCII_COLORS.ruleLight}>{']'}</C>
        <C c={ready ? ASCII_COLORS.green : ASCII_COLORS.dim}>{` ${Math.round(pct).toString().padStart(3, ' ')}%`}</C>
      </pre>
    </div>
  );
}

function StartButton({ ready, onStart }: { ready: boolean; onStart: () => void }) {
  return (
    <motion.button
      whileHover={ready ? { y: -1, scale: 1.015 } : undefined}
      whileTap={ready ? { scale: 0.985 } : undefined}
      disabled={!ready}
      onClick={onStart}
      className="mt-4 transition-colors"
      style={{ cursor: ready ? 'pointer' : 'default' }}
    >
      <pre className="text-[11px] leading-[1.35] whitespace-pre" style={{ fontFamily: MONO_FONT }}>
        <C c={ready ? ASCII_COLORS.green : ASCII_COLORS.ruleLight}>{'  \u250c'}{'\u2500'.repeat(24)}{'\u2510'}</C>{'\n'}
        <C c={ready ? ASCII_COLORS.green : ASCII_COLORS.ruleLight}>{'  \u2502'}</C>
        <C c={ready ? ASCII_COLORS.bright : ASCII_COLORS.dim}>{ready ? '  \u25b6  S E T   S A I L  ' : '  \u00b7   P R E P A R I N G '}</C>
        <C c={ready ? ASCII_COLORS.green : ASCII_COLORS.ruleLight}>{'\u2502'}</C>{'\n'}
        <C c={ready ? ASCII_COLORS.green : ASCII_COLORS.ruleLight}>{'  \u2514'}{'\u2500'.repeat(24)}{'\u2518'}</C>
      </pre>
    </motion.button>
  );
}

function ControlChit({ code, label }: { code: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span
        className="inline-flex min-w-6 items-center justify-center px-1.5 py-0.5 text-[10px]"
        style={{
          border: `1px solid ${ASCII_COLORS.ruleLight}`,
          borderRadius: 3,
          color: ASCII_COLORS.warm,
          backgroundColor: 'rgba(10,9,8,0.7)',
          fontFamily: MONO_FONT,
        }}
      >
        {code}
      </span>
      <span>{label}</span>
    </span>
  );
}

export function OpeningASCIIAlt({
  ready,
  loadingMessage,
  loadingProgress,
  onStart,
}: OpeningOverlayProps) {
  useSplashAudio();
  useReadyHotkeys(ready, onStart);

  return (
    <motion.div
      exit={{ opacity: 0 }}
      transition={{ duration: 0.55, ease: 'easeOut' }}
      className="absolute inset-0 z-50 flex items-center justify-center overflow-y-auto px-4 py-6 pointer-events-auto"
      style={{
        background:
          'linear-gradient(180deg, #070605 0%, #0a0908 48%, #050606 100%)',
      }}
    >
      <RouteTrace />

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.75, delay: 0.1 }}>
        <BaroqueBorder accentColor={ready ? ASCII_COLORS.green : ASCII_COLORS.dimGold} />
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.4, delay: 0.25 }}
        className="absolute inset-0 z-0 pointer-events-none"
      >
        <BackgroundShip />
      </motion.div>

      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.48, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 w-full max-w-[590px] select-none"
        style={{
          fontFamily: MONO_FONT,
          color: ASCII_COLORS.txt,
          willChange: 'opacity, transform',
        }}
      >
        <div
          className="relative overflow-hidden px-5 py-6 sm:px-8"
          style={{
            border: `1px solid ${ASCII_COLORS.ruleLight}`,
            borderRadius: 4,
            background:
              'linear-gradient(180deg, rgba(13,12,9,0.86), rgba(7,7,6,0.76))',
            boxShadow:
              '0 24px 80px rgba(0,0,0,0.58), inset 0 0 60px rgba(201,168,76,0.035)',
            backdropFilter: 'blur(2px)',
          }}
        >
          <div
            className="absolute inset-x-0 top-0 h-px"
            style={{ background: `linear-gradient(90deg, transparent, ${ASCII_COLORS.dimGold}, transparent)` }}
          />
          <div
            className="absolute inset-x-0 bottom-0 h-px"
            style={{ background: `linear-gradient(90deg, transparent, ${ASCII_COLORS.water}, transparent)` }}
          />

          <TitleLockup />

          <SparkleRail width={44} />

          <ShipPortrait />

          <div className="mx-auto mt-4 max-w-[470px] text-center text-[11px] leading-6" style={{ fontFamily: SANS_FONT, color: ASCII_COLORS.txt }}>
            Trade carefully, make port before the hold runs thin, and mind the colors on the horizon.
          </div>

          <LoadingGauge ready={ready} loadingProgress={loadingProgress} loadingMessage={loadingMessage} />

          <div className="flex justify-center">
            <StartButton ready={ready} onStart={onStart} />
          </div>

          {ready && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: [0.28, 0.7, 0.35] }}
              transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
              className="mt-1 text-center text-[9px]"
              style={{ color: ASCII_COLORS.dim, fontFamily: MONO_FONT }}
            >
              press enter
            </motion.div>
          )}

          <div
            className="mx-auto mt-4 flex max-w-[470px] flex-wrap items-center justify-center gap-x-3 gap-y-2 text-[10px]"
            style={{ color: ASCII_COLORS.dim, fontFamily: SANS_FONT }}
          >
            <ControlChit code="W/S" label="sails" />
            <ControlChit code="A/D" label="helm" />
            <ControlChit code="E" label="port" />
            <ControlChit code="M" label="chart" />
            <ControlChit code="SPC" label="cannon" />
            <ControlChit code="F" label="stand down" />
          </div>

          <div className="mt-3 text-center text-[8px]" style={{ color: ASCII_COLORS.rule, fontFamily: MONO_FONT }}>
            v0.1
          </div>
        </div>
      </motion.section>
    </motion.div>
  );
}
