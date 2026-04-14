import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { audioManager } from '../audio/AudioManager';
import { ambientEngine } from '../audio/AmbientEngine';

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

// Colored ASCII span helper
function C({ c, children }: { c: string; children: React.ReactNode }) {
  return <span style={{ color: c }}>{children}</span>;
}

// Twinkling star/sparkle for the ship mast tops
function Twinkle({ char, delay = 0, color = '#ffffff' }: { char: string; delay?: number; color?: string }) {
  return (
    <motion.span
      style={{ color, display: 'inline' }}
      animate={{ opacity: [0.1, 0.85, 0.1] }}
      transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut', delay }}
    >
      {char}
    </motion.span>
  );
}

// Animated water waves beneath the ship — uses innerHTML for performance
function ShipWater() {
  const ref = useRef<HTMLPreElement>(null);
  useEffect(() => {
    let phase = 0;
    const COLS = ['#1a3a4a', '#2a5a6a', '#3a6a7a', '#4a7a8a', '#5a8a9a', '#4a7a8a', '#3a6a7a', '#2a5a6a'];
    const tick = () => {
      if (!ref.current) return;
      phase++;
      let h = '  ';
      // Line 1: continuous waves
      for (let i = 0; i < 30; i++) {
        const col = COLS[(i + phase) % COLS.length];
        const ch = (i + phase) % 5 < 2 ? '\u2248' : '\u223c';
        h += `<span style="color:${col}">${ch}</span>`;
      }
      h += '\n        ';
      // Line 2: scattered wake
      for (let i = 0; i < 7; i++) {
        const col = COLS[(i + phase + 3) % COLS.length];
        h += `<span style="color:${col}">\u223c</span>`;
      }
      h += '         ';
      for (let i = 0; i < 7; i++) {
        const col = COLS[(i + phase + 6) % COLS.length];
        h += `<span style="color:${col}">\u223c</span>`;
      }
      ref.current.innerHTML = h;
    };
    tick();
    const id = setInterval(tick, 550);
    return () => clearInterval(id);
  }, []);
  return <pre ref={ref} className="text-[10px] leading-[1.4] whitespace-pre" style={{ contain: 'content' }} />;
}

// ── Animated wave field ──────────────────────────────────────────────────────
// Renders a column of procedural ASCII waves with a small ship sailing through.
// Uses requestAnimationFrame + innerHTML for performance (~12fps).
// Dimensions are cached via ResizeObserver instead of per-frame getBoundingClientRect.

const WAVE_CHARS = [' ', ' ', '\u00b7', '\u00b7', '~', '\u223c', '\u2248', '\u2248'];
const WAVE_COLORS = [
  '#0d1a22', '#142830', '#1a3a4a', '#2a4a5a',
  '#3a6a7a', '#4a7a8a', '#5a8a9a', '#6a9aaa',
];
// Ship shape: 3 wide, 3 tall — a tiny caravel
const SHIP_SHAPE = [
  [' ', '\u2551', ' '],   //  ║  (mast)
  ['\u2572', '\u2588', '\u2571'],  //  \█/  (hull)
  [' ', '\u2550', ' '],   //  ═  (keel/wake)
];
const SHIP_COLOR = '#b89a6a';
const WAKE_CHAR = '\u2248';
const WAKE_COLOR = '#4a7a8a';

function WavePanel({ side }: { side: 'left' | 'right' }) {
  const preRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    const el = preRef.current;
    if (!el) return;

    // ── Cache dimensions — only recalculate on resize ──
    const charW = 6.6;  // approximate monospace char width at 10px
    const charH = 13;   // line-height
    let cols = 0, rows = 0;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      cols = Math.floor(rect.width / charW);
      rows = Math.floor(rect.height / charH);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);

    let frame = 0;
    let shipY = Math.random() * 20;
    let shipXf = 0; // will init on first frame when cols is known
    let shipVelX = (Math.random() - 0.5) * 0.08;
    let shipVelY = 0.06 + Math.random() * 0.05;
    let lastTime = 0;
    let animId: number;

    function tick(time: number) {
      animId = requestAnimationFrame(tick);
      // Throttle to ~12fps
      if (time - lastTime < 80) return;
      lastTime = time;

      if (cols < 4 || rows < 8) { el.innerHTML = ''; return; }

      frame++;
      const t = frame * 0.06;

      // Ship position — random walk with gentle downward drift
      if (shipXf === 0) shipXf = cols * 0.25 + Math.random() * cols * 0.5;
      if (frame % 12 === 0) {
        shipVelX += (Math.random() - 0.5) * 0.06;
        shipVelY += (Math.random() - 0.35) * 0.01;
      }
      shipVelX *= 0.998;
      shipVelY = Math.max(0.04, Math.min(0.14, shipVelY));
      shipXf += shipVelX;
      if (shipXf < 3) { shipXf = 3; shipVelX = Math.abs(shipVelX) * 0.5; }
      if (shipXf > cols - 5) { shipXf = cols - 5; shipVelX = -Math.abs(shipVelX) * 0.5; }
      shipY += shipVelY;
      if (shipY > rows + 5) {
        shipY = -4;
        shipXf = cols * 0.2 + Math.random() * cols * 0.6;
        shipVelX = (Math.random() - 0.5) * 0.06;
      }
      const shipX = Math.floor(shipXf);
      const shipRow = Math.floor(shipY);

      let html = '';
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          // Mirror x for right panel so waves flow inward
          const wx = side === 'right' ? cols - 1 - x : x;

          // Check ship overlay
          const sr = y - shipRow;
          const sc = wx - shipX;
          if (sr >= 0 && sr < 3 && sc >= -1 && sc <= 1) {
            const ch = SHIP_SHAPE[sr][sc + 1];
            if (ch !== ' ') {
              html += `<span style="color:${SHIP_COLOR}">${ch}</span>`;
              continue;
            }
          }

          // Wake — V-shape trailing behind ship (below it)
          const wakeOffset = y - (shipRow + 3);
          if (wakeOffset >= 0 && wakeOffset < 6) {
            const wakeCenterDist = Math.abs(wx - shipX);
            const wakeWidth = Math.floor(wakeOffset * 0.8) + 1;
            if (wakeCenterDist <= wakeWidth && wakeCenterDist > 0) {
              const wakeAlpha = 1 - wakeOffset / 6;
              html += `<span style="color:${WAKE_COLOR};opacity:${(wakeAlpha * 0.7).toFixed(2)}">${WAKE_CHAR}</span>`;
              continue;
            }
          }

          // Wave field — overlapping sine waves at different scales
          const n1 = Math.sin(wx * 0.35 + y * 0.12 + t);
          const n2 = Math.sin(wx * 0.18 - y * 0.25 + t * 0.7);
          const n3 = Math.sin(y * 0.4 + t * 1.1 + wx * 0.08);
          const wave = n1 * 0.45 + n2 * 0.3 + n3 * 0.25;

          // Distance from edge — fade out near the content center
          const edgeDist = side === 'left' ? (cols - x) / cols : x / cols;
          const fade = Math.min(1, edgeDist * 2.5);

          const idx = Math.max(0, Math.min(
            WAVE_CHARS.length - 1,
            Math.floor((wave + 1) * 0.5 * WAVE_CHARS.length * fade),
          ));
          const ch = WAVE_CHARS[idx];
          if (ch === ' ') {
            html += ' ';
          } else {
            const color = WAVE_COLORS[idx];
            html += `<span style="color:${color}">${ch}</span>`;
          }
        }
        html += '\n';
      }
      el.innerHTML = html;
    }

    // Delay start so wave rendering doesn't compete with entry animations
    const delay = setTimeout(() => {
      animId = requestAnimationFrame(tick);
    }, 500);

    return () => {
      clearTimeout(delay);
      cancelAnimationFrame(animId);
      ro.disconnect();
    };
  }, [side]);

  return (
    <pre
      ref={preRef}
      className="absolute top-[20px] bottom-[20px] overflow-hidden pointer-events-none select-none"
      style={{
        [side]: '20px',
        width: 'calc(50% - 340px)', // fills space between border and content
        minWidth: 0,
        fontSize: '10px',
        lineHeight: '13px',
        fontFamily: '"SF Mono", "Fira Code", "Cascadia Code", "Consolas", monospace',
        opacity: 0.5,
        contain: 'strict',
        maskImage: side === 'left'
          ? 'linear-gradient(to right, transparent 0%, black 15%, black 70%, transparent 100%)'
          : 'linear-gradient(to left, transparent 0%, black 15%, black 70%, transparent 100%)',
        WebkitMaskImage: side === 'left'
          ? 'linear-gradient(to right, transparent 0%, black 15%, black 70%, transparent 100%)'
          : 'linear-gradient(to left, transparent 0%, black 15%, black 70%, transparent 100%)',
      }}
    />
  );
}

// ── Baroque border ───────────────────────────────────────────────────────────

function BaroqueCorner({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg
      className={className}
      width="80" height="80" viewBox="0 0 80 80"
      fill="none" xmlns="http://www.w3.org/2000/svg"
      style={{ overflow: 'visible', ...style }}
    >
      <path d="M4 76 L4 20 Q4 4 20 4 L76 4" stroke="#6a5d3a" strokeWidth="1.5" fill="none" opacity="0.7" />
      <path d="M10 76 L10 24 Q10 10 24 10 L76 10" stroke="#4a4030" strokeWidth="0.75" fill="none" opacity="0.5" />
      <path
        d="M4 20 Q4 4 20 4
           M20 4 C14 4 8 8 8 16 C8 22 12 26 18 24 C22 22 24 18 22 14 C20 10 16 10 14 12
           M4 20 C4 14 8 8 16 8 C22 8 26 12 24 18 C22 22 18 24 14 22 C10 20 10 16 12 14"
        stroke="#8a7a4a" strokeWidth="0.8" fill="none" opacity="0.6"
      />
      <path d="M18 18 C20 14 24 14 24 18 C24 22 20 22 18 18 Z" fill="#6a5d3a" opacity="0.25" />
      <circle cx="40" cy="4" r="1.5" fill="#6a5d3a" opacity="0.4" />
      <circle cx="56" cy="4" r="1" fill="#4a4030" opacity="0.3" />
      <circle cx="4" cy="40" r="1.5" fill="#6a5d3a" opacity="0.4" />
      <circle cx="4" cy="56" r="1" fill="#4a4030" opacity="0.3" />
    </svg>
  );
}

function SideMedallion({ className }: { className?: string }) {
  return (
    <svg className={className} width="60" height="12" viewBox="0 0 60 12" fill="none">
      <path d="M0 6 C8 6 12 2 18 2 L42 2 C48 2 52 6 60 6" stroke="#6a5d3a" strokeWidth="0.75" opacity="0.4" />
      <path d="M0 6 C8 6 12 10 18 10 L42 10 C48 10 52 6 60 6" stroke="#6a5d3a" strokeWidth="0.75" opacity="0.4" />
      <circle cx="30" cy="6" r="2" fill="#6a5d3a" opacity="0.3" />
    </svg>
  );
}

function SideMedallionV({ className }: { className?: string }) {
  return (
    <svg className={className} width="12" height="60" viewBox="0 0 12 60" fill="none">
      <path d="M6 0 C6 8 2 12 2 18 L2 42 C2 48 6 52 6 60" stroke="#6a5d3a" strokeWidth="0.75" opacity="0.4" />
      <path d="M6 0 C6 8 10 12 10 18 L10 42 C10 48 6 52 6 60" stroke="#6a5d3a" strokeWidth="0.75" opacity="0.4" />
      <circle cx="6" cy="30" r="2" fill="#6a5d3a" opacity="0.3" />
    </svg>
  );
}

function BaroqueBorder() {
  return (
    <div className="absolute inset-0 pointer-events-none z-20" style={{ padding: '12px' }}>
      <div className="absolute inset-[12px]" style={{ border: '1px solid rgba(106, 93, 58, 0.35)' }}>
        <div className="absolute inset-[5px]" style={{ border: '0.5px solid rgba(74, 64, 48, 0.25)' }} />
      </div>
      <SideMedallion className="absolute top-[8px] left-1/2 -translate-x-1/2" />
      <SideMedallion className="absolute bottom-[8px] left-1/2 -translate-x-1/2" />
      <SideMedallionV className="absolute left-[8px] top-1/2 -translate-y-1/2" />
      <SideMedallionV className="absolute right-[8px] top-1/2 -translate-y-1/2" />
      <BaroqueCorner className="absolute top-[0px] left-[0px]" />
      <BaroqueCorner className="absolute top-[0px] right-[0px]" style={{ transform: 'scaleX(-1)' }} />
      <BaroqueCorner className="absolute bottom-[0px] left-[0px]" style={{ transform: 'scaleY(-1)' }} />
      <BaroqueCorner className="absolute bottom-[0px] right-[0px]" style={{ transform: 'scale(-1, -1)' }} />
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export function OpeningASCII({
  ready,
  loadingMessage,
  loadingProgress,
  onStart,
}: OpeningOverlayProps) {

  // Start splash music on first user interaction (browser autoplay policy).
  // We retry playSplash() on every click/key until it succeeds.
  const musicStarted = useRef(false);
  useEffect(() => {
    const tryPlay = (e?: Event) => {
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

  // Enter key to start when ready
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

  // Colors
  const gold = '#c9a84c';
  const dimGold = '#8a7a4a';
  const warm = '#b89a6a';
  const mast = '#a08060';
  const hull = '#8b6940';
  const sail = '#d4c8a8';
  const water = '#3a6a7a';
  const waterLight = '#5a8a9a';
  const foam = '#7aaaba';
  const hullBody = '#5a4a2a';
  const rule = '#3a3528';
  const ruleLight = '#4a4538';
  const dim = '#5a5445';
  const txt = '#9a9080';
  const bright = '#d8ccb0';

  // ── SET SAIL button ──
  const btnW = 24;
  const [btnHovered, setBtnHovered] = useState(false);

  const monoFont = '"SF Mono", "Fira Code", "Cascadia Code", "Consolas", monospace';

  return (
    <motion.div
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
      className="absolute inset-0 z-50 flex items-center justify-center overflow-y-auto pointer-events-auto"
      style={{ backgroundColor: '#0a0908' }}
    >
      {/* Baroque border — fast appear */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.15 }}
      >
        <BaroqueBorder />
      </motion.div>

      {/* Animated wave fields — flanking the content */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.5, delay: 0.3 }}
        className="absolute inset-0 z-0 pointer-events-none"
      >
        <WavePanel side="left" />
        <WavePanel side="right" />
      </motion.div>

      {/* Main content */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 w-full max-w-[640px] px-8 py-6 select-none"
        style={{ fontFamily: monoFont, willChange: 'opacity, transform' }}
      >
        {/* Title — ASCII block letters */}
        <motion.div
          animate={ready ? { filter: 'drop-shadow(0 0 10px rgba(201, 168, 76, 0.35))' } : { filter: 'none' }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
          className="flex justify-center"
        >
          <div className="relative inline-block px-8 py-5" style={{ border: `1px solid ${dimGold}44`, borderRadius: '3px' }}>
            <div className="absolute inset-[3px]" style={{ border: `0.5px solid ${dimGold}22`, borderRadius: '2px' }} />
            <pre className="text-center text-[14px] leading-[1.45] whitespace-pre">
              <C c={gold}>{'╔═╗  ╔═╗  ╦  ╔═╗  ╔═╗'}</C>{'\n'}
              <C c={gold}>{'╚═╗  ╠═╝  ║  ║    ╠═ '}</C>{'\n'}
              <C c={gold}>{'╚═╝  ╩    ╩  ╚═╝  ╚═╝'}</C>
            </pre>
            <pre className="text-center text-[10px] mt-2 mb-2 whitespace-pre" style={{ color: dimGold }}>
{'\u2500'.repeat(40)}
            </pre>
            <pre className="text-center text-[14px] leading-[1.45] whitespace-pre">
              <C c={bright}>{'╦  ╦  ╔═╗  ╦ ╦  ╔═╗  ╔═╗  ╔═╗  ╦═╗'}</C>{'\n'}
              <C c={bright}>{'╚╗╔╝  ║ ║  ╚╦╝  ╠═╣  ║ ╦  ╠═   ╠╦╝'}</C>{'\n'}
              <C c={bright}>{' ╚╝   ╚═╝   ╩   ╩ ╩  ╚═╝  ╚═╝  ╩╚═'}</C>
            </pre>
          </div>
        </motion.div>

        {/* Subtitle */}
        <div className="text-center mt-4 text-[13px]" style={{ color: txt, fontFamily: '"Fraunces", serif', fontStyle: 'italic' }}>
          A Game of Oceanic Trade, 1580&ndash;1620
        </div>

        <pre className="text-center text-[11px] mt-4" style={{ color: rule }}>
{'\u2500'.repeat(36)}
        </pre>

        {/* Ship — refined design with animated elements */}
        <div className="flex justify-center mt-3">
          <div style={{ display: 'inline-block' }}>
            <pre className="text-[10px] leading-[1.4] whitespace-pre">
              {'          '}<Twinkle char={'\u00b7'} delay={0} />{'     '}<Twinkle char={'\u2726'} delay={0.8} color={gold} />{'     '}<Twinkle char={'\u00b7'} delay={1.6} />{'\n'}
              <C c={warm}>{'          \u25b5    \u25b5    \u25b5'}</C>{'\n'}
              <C c={mast}>{'          |    |    |'}</C>{'\n'}
              <C c={sail}>{'         )_)  )_)  )_)'}</C>{'\n'}
              <C c={sail}>{'        )___))___))___)'}</C><C c={hull}>{'\\'}</C>{'\n'}
              <C c={sail}>{'       )____)____)_____)'}</C><C c={hull}>{'\\\\\\'}</C>{'\n'}
              <C c={hull}>{'   _____|____|____|____\\\\\\__'}</C>{'\n'}
              <C c={hullBody}>{'  |'}</C>{'  '}<C c={gold}>{'\u25e6'}</C>{'    '}<C c={gold}>{'\u25e6'}</C>{'    '}<C c={gold}>{'\u25e6'}</C>{'    '}<C c={gold}>{'\u25e6'}</C>{'   '}<C c={hullBody}>{'|'}</C>{'\n'}
              <C c={hullBody}>{'   \\_________________________/'}</C>
            </pre>
            <ShipWater />
          </div>
        </div>

        <pre className="text-center text-[11px] mt-3" style={{ color: rule }}>
{'\u2500'.repeat(36)}
        </pre>

        {/* Description */}
        <div className="text-center mt-4 text-[13px] leading-[1.8]" style={{ color: txt, fontFamily: '"DM Sans", sans-serif' }}>
          Trade goods between ports across the<br />
          Indian, Atlantic &amp; Pacific Oceans.
        </div>

        <pre className="text-center text-[11px] mt-4" style={{ color: ruleLight }}>
{'\u2550'.repeat(36)}
        </pre>

        {/* Loading state */}
        <div className="mt-3 text-center">
          <AnimatePresence mode="wait">
            <motion.div
              key={ready ? 'ready' : loadingMessage}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="text-[11px]"
              style={{
                color: ready ? warm : dim,
                fontFamily: '"Fraunces", serif',
                fontStyle: 'italic',
                textShadow: ready ? `0 0 10px ${warm}60` : 'none',
              }}
            >
              {ready ? 'Ready to depart.' : loadingMessage}
            </motion.div>
          </AnimatePresence>

          <div className="flex justify-center mt-2">
            <div
              className="relative"
              style={{
                width: '42ch',
                height: '14px',
                fontFamily: monoFont,
                fontSize: '10px',
              }}
            >
              <div className="absolute inset-0 border" style={{ borderColor: rule, borderRadius: '2px' }} />
              <div className="absolute top-[1px] left-[1px] right-[1px] bottom-[1px] overflow-hidden" style={{ borderRadius: '1px' }}>
                <motion.div
                  className="h-full"
                  style={{
                    backgroundColor: ready ? '#5a9a5a' : dimGold,
                    borderRadius: '1px',
                    boxShadow: ready ? '0 0 12px rgba(90, 154, 90, 0.5)' : 'none',
                  }}
                  initial={{ width: 0 }}
                  animate={{ width: `${loadingProgress}%` }}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                />
                {ready && (
                  <motion.div
                    className="absolute inset-0"
                    initial={{ opacity: 0, x: '-100%' }}
                    animate={{ opacity: [0, 0.5, 0], x: '100%' }}
                    transition={{ duration: 0.8, delay: 0.3, ease: 'easeOut' }}
                    style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)' }}
                  />
                )}
              </div>
            </div>
          </div>
        </div>

        <pre className="text-center text-[11px] mt-3" style={{ color: ruleLight }}>
{'\u2550'.repeat(36)}
        </pre>

        {/* Start button — corners morph thin→thick on hover */}
        <div className="flex justify-center mt-5">
          <motion.button
            whileTap={ready ? { scale: 0.97 } : undefined}
            onClick={onStart}
            disabled={!ready}
            onMouseEnter={() => ready && setBtnHovered(true)}
            onMouseLeave={() => setBtnHovered(false)}
          >
            {(() => {
              const hov = ready && btnHovered;
              const tl = hov ? '\u2554' : '\u2553';  // ╔ : ╓
              const tr = hov ? '\u2557' : '\u2556';  // ╗ : ╖
              const bl = hov ? '\u255a' : '\u2559';  // ╚ : ╙
              const br = hov ? '\u255d' : '\u255c';  // ╝ : ╜
              const h  = hov ? '\u2550' : '\u2500';  // ═ : ─
              const borderC = ready ? (hov ? bright : gold) : rule;
              const textC   = ready ? (hov ? '#ffffff' : bright) : dim;
              return (
                <pre
                  className="text-[13px] leading-[1.55] whitespace-pre"
                  style={{
                    cursor: ready ? 'pointer' : 'default',
                    transition: 'filter 0.25s ease',
                    filter: hov ? `drop-shadow(0 0 14px ${gold}50)` : 'none',
                  }}
                >
                  <C c={borderC}>{tl}{h.repeat(btnW)}{tr}</C>{'\n'}
                  <C c={borderC}>{'\u2551'}</C>{'   '}
                  {hov ? (
                    <motion.span
                      style={{ color: '#ffffff' }}
                      animate={{ opacity: [1, 0.4, 1] }}
                      transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
                    >{'\u25c6'}</motion.span>
                  ) : (
                    <C c={ready ? gold : dim}>{ready ? '\u25c6' : '\u00b7'}</C>
                  )}
                  {'  '}<C c={textC}>{ready ? 'S E T   S A I L' : 'PREPARING...   '}</C>
                  {'   '}<C c={borderC}>{'\u2551'}</C>{'\n'}
                  <C c={borderC}>{bl}{h.repeat(btnW)}{br}</C>
                </pre>
              );
            })()}
          </motion.button>
        </div>

        {ready && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: [0.25, 0.7, 0.25] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
            className="text-center mt-2 text-[10px] tracking-[0.25em] uppercase"
            style={{ color: dim }}
          >
            press enter
          </motion.div>
        )}

        <pre className="text-center text-[11px] mt-4" style={{ color: rule }}>
{'\u2500'.repeat(36)}
        </pre>

        {/* Controls */}
        <div className="mt-4 flex justify-center">
          <div className="relative px-6 py-3" style={{ border: `1px solid ${rule}`, borderRadius: '3px' }}>
            <div className="absolute -top-[7px] left-1/2 -translate-x-1/2 px-2 text-[9px] tracking-[0.2em] uppercase" style={{ color: dimGold, backgroundColor: '#0a0908' }}>
              controls
            </div>
            <pre className="text-[11px] leading-[2] whitespace-pre text-left">
              <C c={warm}>{'W/S '}</C><C c={dim}>{'sails    '}</C>
              <C c={warm}>{'A/D '}</C><C c={dim}>{'helm     '}</C>
              <C c={warm}>{'E '}</C><C c={dim}>{'port'}</C>{'\n'}
              <C c={warm}>{'SPC '}</C><C c={dim}>{'cannon   '}</C>
              <C c={warm}>{'M   '}</C><C c={dim}>{'chart    '}</C>
              <C c={warm}>{'F '}</C><C c={dim}>{'stand down'}</C>
            </pre>
          </div>
        </div>

        <div className="text-center mt-3 text-[9px] tracking-[0.3em] uppercase" style={{ color: rule }}>
          v0.1
        </div>
      </motion.div>
    </motion.div>
  );
}
