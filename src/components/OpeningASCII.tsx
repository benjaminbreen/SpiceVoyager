import { useEffect, useRef } from 'react';
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

// ── Animated wave field ──────────────────────────────────────────────────────
// Renders a column of procedural ASCII waves with a small ship sailing through.
// Uses requestAnimationFrame + innerHTML for performance (~12fps).

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
  const stateRef = useRef({ frame: 0, shipY: 5, lastTime: 0 });

  useEffect(() => {
    const s = stateRef.current;
    let animId: number;

    function tick(time: number) {
      animId = requestAnimationFrame(tick);
      // Throttle to ~12fps
      if (time - s.lastTime < 80) return;
      s.lastTime = time;

      const el = preRef.current;
      if (!el) return;

      // Measure available space
      const charW = 6.6; // approximate monospace char width at 10px
      const charH = 13;  // line-height
      const rect = el.getBoundingClientRect();
      const cols = Math.floor(rect.width / charW);
      const rows = Math.floor(rect.height / charH);
      if (cols < 4 || rows < 8) { el.innerHTML = ''; return; }

      s.frame++;
      const t = s.frame * 0.06;

      // Ship position — gentle sine drift, wraps vertically
      s.shipY = (s.shipY + 0.12) % (rows + 6);
      const shipX = Math.floor(cols * 0.45 + Math.sin(t * 0.18) * cols * 0.2);
      const shipRow = Math.floor(s.shipY);

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

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [side]);

  return (
    <pre
      ref={preRef}
      className="absolute top-[20px] bottom-[20px] overflow-hidden pointer-events-none select-none"
      style={{
        [side]: '20px',
        width: 'calc(50% - 260px)', // fills space between border and content
        minWidth: 0,
        fontSize: '10px',
        lineHeight: '13px',
        fontFamily: '"SF Mono", "Fira Code", "Cascadia Code", "Consolas", monospace',
        opacity: 0.5,
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
    const tryPlay = () => {
      if (musicStarted.current) return;
      ambientEngine.markInteracted();
      audioManager.playSplash();
      // Check after a tick if it started (playSplash sets internal flag)
      setTimeout(() => {
        musicStarted.current = true;
        window.removeEventListener('click', tryPlay, true);
        window.removeEventListener('keydown', tryPlay, true);
        window.removeEventListener('pointerdown', tryPlay, true);
      }, 100);
    };
    // Use capture phase so we get it even when pointer-events-auto divs intercept
    window.addEventListener('click', tryPlay, true);
    window.addEventListener('keydown', tryPlay, true);
    window.addEventListener('pointerdown', tryPlay, true);
    // Also try immediately
    audioManager.playSplash();
    return () => {
      window.removeEventListener('click', tryPlay, true);
      window.removeEventListener('keydown', tryPlay, true);
      window.removeEventListener('pointerdown', tryPlay, true);
    };
  }, []);

  const barW = 36;
  const filled = Math.round((loadingProgress / 100) * barW);
  const bar = '\u2588'.repeat(filled) + '\u2500'.repeat(barW - filled);

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
  const rule = '#3a3528';
  const ruleLight = '#4a4538';
  const dim = '#5a5445';
  const txt = '#9a9080';
  const bright = '#d8ccb0';

  return (
    <motion.div
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-50 flex items-center justify-center overflow-y-auto pointer-events-auto"
      style={{ backgroundColor: '#0a0908' }}
    >
      {/* Baroque border */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.2, delay: 0.3 }}
      >
        <BaroqueBorder />
      </motion.div>

      {/* Animated wave fields — flanking the content */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 2, delay: 0.8 }}
        className="absolute inset-0 z-0 pointer-events-none"
      >
        <WavePanel side="left" />
        <WavePanel side="right" />
      </motion.div>

      {/* Main content */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 w-full max-w-[480px] px-6 py-6 select-none"
        style={{ fontFamily: '"SF Mono", "Fira Code", "Cascadia Code", "Consolas", monospace' }}
      >
        {/* Title cartouche */}
        <pre className="text-center text-[11px] leading-[1.45] whitespace-pre">
          <C c={dimGold}>{'      \u256d\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u256e'}</C>{'\n'}
          <C c={dimGold}>{'      \u2502'}</C><C c={gold}>{'  S P I C E    V O Y A G E R  '}</C><C c={dimGold}>{'\u2502'}</C>{'\n'}
          <C c={dimGold}>{'      \u2570\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u256f'}</C>
        </pre>

        {/* Subtitle */}
        <div className="text-center mt-3 text-[12px]" style={{ color: txt, fontFamily: '"Fraunces", serif', fontStyle: 'italic' }}>
          A Game of Oceanic Trade, 1580&ndash;1620
        </div>

        <pre className="text-center text-[11px] mt-3" style={{ color: rule }}>
{'        \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500'}
        </pre>

        {/* Ship — selectively colored */}
        <pre className="text-center text-[10px] leading-[1.35] mt-3 whitespace-pre">
          {'              '}<C c={mast}>{'|    |    |'}</C>{'\n'}
          {'             '}<C c={sail}>{')_)  )_)  )_)'}</C>{'\n'}
          {'            '}<C c={sail}>{')___))___))___)'}</C><C c={hull}>{'\\'}</C>{'\n'}
          {'           '}<C c={sail}>{')____)____)_____)'}</C><C c={hull}>{'\\\\'}</C>{'\n'}
          {'         '}<C c={hull}>{'_____|____|____|____\\\\\\'}</C><C c={hull}>{'__'}</C>{'\n'}
          <C c={water}>{'\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500'}</C><C c={hull}>{'\\'}</C><C c={water}>{'                   '}</C><C c={hull}>{'/'}</C><C c={water}>{'\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500'}</C>{'\n'}
          <C c={waterLight}>{'    \u223c\u223c\u223c'}</C><C c={foam}>{' \u223c\u223c\u223c\u223c\u223c'}</C><C c={waterLight}>{'\u223c\u223c\u223c\u223c\u223c\u223c\u223c\u223c\u223c\u223c\u223c\u223c\u223c\u223c'}</C><C c={foam}>{'\u223c\u223c\u223c'}</C>{'\n'}
          <C c={water}>{'       \u223c\u223c\u223c\u223c'}</C><C c={waterLight}>{'      \u223c\u223c\u223c\u223c'}</C><C c={water}>{'     \u223c\u223c\u223c'}</C>
        </pre>

        <pre className="text-center text-[11px] mt-3" style={{ color: rule }}>
{'        \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500'}
        </pre>

        {/* Description */}
        <div className="text-center mt-3 text-[12px] leading-[1.8]" style={{ color: txt, fontFamily: '"DM Sans", sans-serif' }}>
          Trade goods between ports across the<br />
          Indian, Atlantic &amp; Pacific Oceans.
        </div>

        <pre className="text-center text-[11px] mt-4" style={{ color: ruleLight }}>
{'        \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550'}
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
              className="text-[10px]"
              style={{ color: ready ? warm : dim, fontFamily: '"Fraunces", serif', fontStyle: 'italic' }}
            >
              {ready ? 'Ready to depart.' : loadingMessage}
            </motion.div>
          </AnimatePresence>

          <pre className="text-center text-[10px] mt-2 whitespace-pre">
            <C c={rule}>{'  \u2502'}</C>
            <C c={ready ? gold : dimGold}>{bar}</C>
            <C c={rule}>{'\u2502'}</C>
          </pre>
        </div>

        <pre className="text-center text-[11px] mt-3" style={{ color: ruleLight }}>
{'        \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550'}
        </pre>

        {/* Start button */}
        <div className="flex justify-center mt-4">
          <motion.button
            whileHover={ready ? { scale: 1.03 } : undefined}
            whileTap={ready ? { scale: 0.97 } : undefined}
            onClick={onStart}
            disabled={!ready}
            className="transition-colors"
          >
            <pre className="text-[11px] leading-[1.4] whitespace-pre" style={{ cursor: ready ? 'pointer' : 'default' }}>
              <C c={ready ? gold : rule}>{'  \u250c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u250e'}</C>{'\n'}
              <C c={ready ? gold : rule}>{`  \u2502  ${ready ? '\u25b6' : '\u00b7'} `}</C>
              <C c={ready ? bright : dim}>{ready ? 'S E T  S A I L' : 'PREPARING...'}</C>
              <C c={ready ? gold : rule}>{' \u2502'}</C>{'\n'}
              <C c={ready ? gold : rule}>{'  \u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2516'}</C>
            </pre>
          </motion.button>
        </div>

        {ready && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.6, 0.4, 0.6] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="text-center mt-1 text-[9px] tracking-[0.25em] uppercase"
            style={{ color: dim }}
          >
            press enter
          </motion.div>
        )}

        <pre className="text-center text-[11px] mt-4" style={{ color: rule }}>
{'        \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500'}
        </pre>

        {/* Controls */}
        <div className="mt-3 flex justify-center">
          <pre className="text-[10px] leading-[1.9] whitespace-pre text-left">
            <C c={warm}>{'  W/S '}</C><C c={dim}>{'sails    '}</C>
            <C c={warm}>{'A/D '}</C><C c={dim}>{'helm'}</C>{'\n'}
            <C c={warm}>{'  E   '}</C><C c={dim}>{'port     '}</C>
            <C c={warm}>{'M   '}</C><C c={dim}>{'chart'}</C>
          </pre>
        </div>

        <pre className="text-center text-[11px] mt-3" style={{ color: rule }}>
{'        \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500'}
        </pre>

        <div className="text-center mt-2 text-[8px] tracking-[0.3em] uppercase" style={{ color: rule }}>
          v0.1
        </div>
      </motion.div>
    </motion.div>
  );
}
