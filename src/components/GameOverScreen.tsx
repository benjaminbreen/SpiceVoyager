import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { audioManager } from '../audio/AudioManager';
import { useGameStore } from '../store/gameStore';

function C({ c, children }: { c: string; children: React.ReactNode }) {
  return <span style={{ color: c }}>{children}</span>;
}

// Animated skull ASCII with dripping effect
function SkullPanel() {
  const preRef = useRef<HTMLPreElement>(null);
  const stateRef = useRef({ frame: 0, lastTime: 0 });

  useEffect(() => {
    const s = stateRef.current;
    let animId: number;
    const DRIP_CHARS = [' ', '.', ':', '\u2502', '\u2551', '\u2588'];
    const DRIP_COLORS = ['#1a0a0a', '#2a1010', '#3a1515', '#4a1a1a', '#5a2020', '#6a2525'];

    function tick(time: number) {
      animId = requestAnimationFrame(tick);
      if (time - s.lastTime < 100) return;
      s.lastTime = time;

      const el = preRef.current;
      if (!el) return;

      const charW = 6.6;
      const charH = 13;
      const rect = el.getBoundingClientRect();
      const cols = Math.floor(rect.width / charW);
      const rows = Math.floor(rect.height / charH);
      if (cols < 4 || rows < 4) { el.innerHTML = ''; return; }

      s.frame++;
      const t = s.frame * 0.04;

      let html = '';
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const n1 = Math.sin(x * 0.15 + t * 0.3) * Math.cos(y * 0.2 - t * 0.5);
          const n2 = Math.sin(y * 0.3 + t * 0.7 + x * 0.05);
          const drip = (n1 + n2) * 0.5;
          // Vertical drip bias
          const dripBias = Math.sin(x * 0.8 + 42.3) * 0.5;
          const combined = drip + dripBias * Math.sin(y * 0.1 - t * 0.2);

          const idx = Math.max(0, Math.min(DRIP_CHARS.length - 1,
            Math.floor((combined + 1) * 0.5 * DRIP_CHARS.length * 0.7)));
          const ch = DRIP_CHARS[idx];
          if (ch === ' ') {
            html += ' ';
          } else {
            html += `<span style="color:${DRIP_COLORS[idx]}">${ch}</span>`;
          }
        }
        html += '\n';
      }
      el.innerHTML = html;
    }

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, []);

  return (
    <pre
      ref={preRef}
      className="absolute inset-0 overflow-hidden pointer-events-none select-none"
      style={{
        fontSize: '10px',
        lineHeight: '13px',
        fontFamily: '"SF Mono", "Fira Code", "Cascadia Code", "Consolas", monospace',
        opacity: 0.4,
      }}
    />
  );
}

// Baroque border
function BaroqueCorner({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg
      className={className}
      width="80" height="80" viewBox="0 0 80 80"
      fill="none" xmlns="http://www.w3.org/2000/svg"
      style={{ overflow: 'visible', ...style }}
    >
      <path d="M4 76 L4 20 Q4 4 20 4 L76 4" stroke="#5a1a1a" strokeWidth="1.5" fill="none" opacity="0.7" />
      <path d="M10 76 L10 24 Q10 10 24 10 L76 10" stroke="#3a1010" strokeWidth="0.75" fill="none" opacity="0.5" />
      <path
        d="M4 20 Q4 4 20 4
           M20 4 C14 4 8 8 8 16 C8 22 12 26 18 24 C22 22 24 18 22 14 C20 10 16 10 14 12
           M4 20 C4 14 8 8 16 8 C22 8 26 12 24 18 C22 22 18 24 14 22 C10 20 10 16 12 14"
        stroke="#7a2a2a" strokeWidth="0.8" fill="none" opacity="0.6"
      />
      <path d="M18 18 C20 14 24 14 24 18 C24 22 20 22 18 18 Z" fill="#5a1a1a" opacity="0.25" />
      <circle cx="40" cy="4" r="1.5" fill="#5a1a1a" opacity="0.4" />
      <circle cx="56" cy="4" r="1" fill="#3a1010" opacity="0.3" />
      <circle cx="4" cy="40" r="1.5" fill="#5a1a1a" opacity="0.4" />
      <circle cx="4" cy="56" r="1" fill="#3a1010" opacity="0.3" />
    </svg>
  );
}

function SideMedallion({ className }: { className?: string }) {
  return (
    <svg className={className} width="60" height="12" viewBox="0 0 60 12" fill="none">
      <path d="M0 6 C8 6 12 2 18 2 L42 2 C48 2 52 6 60 6" stroke="#5a1a1a" strokeWidth="0.75" opacity="0.4" />
      <path d="M0 6 C8 6 12 10 18 10 L42 10 C48 10 52 6 60 6" stroke="#5a1a1a" strokeWidth="0.75" opacity="0.4" />
      <circle cx="30" cy="6" r="2" fill="#5a1a1a" opacity="0.3" />
    </svg>
  );
}

function SideMedallionV({ className }: { className?: string }) {
  return (
    <svg className={className} width="12" height="60" viewBox="0 0 12 60" fill="none">
      <path d="M6 0 C6 8 2 12 2 18 L2 42 C2 48 6 52 6 60" stroke="#5a1a1a" strokeWidth="0.75" opacity="0.4" />
      <path d="M6 0 C6 8 10 12 10 18 L10 42 C10 48 6 52 6 60" stroke="#5a1a1a" strokeWidth="0.75" opacity="0.4" />
      <circle cx="6" cy="30" r="2" fill="#5a1a1a" opacity="0.3" />
    </svg>
  );
}

function DeathBorder() {
  return (
    <div className="absolute inset-0 pointer-events-none z-20" style={{ padding: '12px' }}>
      <div className="absolute inset-[12px]" style={{ border: '1px solid rgba(90, 26, 26, 0.45)' }}>
        <div className="absolute inset-[5px]" style={{ border: '0.5px solid rgba(58, 16, 16, 0.3)' }} />
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

function formatGameDate(dayCount: number, timeOfDay: number): string {
  // Start date: January 1, 1580, advance by dayCount
  const startYear = 1580;
  const daysPerYear = 365;
  const year = startYear + Math.floor((dayCount - 1) / daysPerYear);
  const dayOfYear = ((dayCount - 1) % daysPerYear) + 1;

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  let remaining = dayOfYear;
  let month = 0;
  for (let i = 0; i < 12; i++) {
    if (remaining <= daysInMonth[i]) { month = i; break; }
    remaining -= daysInMonth[i];
  }

  const hours = Math.floor(timeOfDay);
  const minutes = Math.floor((timeOfDay % 1) * 60);
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const h12 = hours % 12 || 12;

  return `${months[month]} ${remaining}, ${year} \u2014 ${h12}:${minutes.toString().padStart(2, '0')} ${ampm}`;
}

export function GameOverScreen() {
  const gameOver = useGameStore((s) => s.gameOver);
  const gameOverCause = useGameStore((s) => s.gameOverCause);
  const crew = useGameStore((s) => s.crew);
  const ship = useGameStore((s) => s.ship);
  const dayCount = useGameStore((s) => s.dayCount);
  const timeOfDay = useGameStore((s) => s.timeOfDay);

  const musicStarted = useRef(false);

  useEffect(() => {
    if (!gameOver || musicStarted.current) return;
    musicStarted.current = true;
    // Play the splash/title music as a requiem
    audioManager.playSplash();
  }, [gameOver]);

  if (!gameOver) return null;

  const captainName = crew[0]?.name ?? 'Unknown Captain';
  const shipName = ship.name;
  const dateStr = formatGameDate(dayCount, timeOfDay);

  const crimson = '#8a2020';
  const blood = '#6a1515';
  const dimBlood = '#4a1010';
  const bone = '#c8b89a';
  const dimBone = '#7a7060';
  const dark = '#2a0808';
  const rule = '#3a1515';
  const dim = '#5a4a3a';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 2.5, ease: 'easeIn' }}
      className="absolute inset-0 z-[100] flex items-center justify-center overflow-hidden"
      style={{ backgroundColor: '#0a0404' }}
    >
      {/* Animated background */}
      <SkullPanel />

      {/* Baroque border in crimson */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.5, delay: 1 }}
      >
        <DeathBorder />
      </motion.div>

      {/* Main content */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.5, delay: 0.8, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 w-full max-w-[520px] px-6 py-8 select-none"
        style={{ fontFamily: '"SF Mono", "Fira Code", "Cascadia Code", "Consolas", monospace' }}
      >
        {/* Skull */}
        <motion.pre
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1, delay: 1.2 }}
          className="text-center text-[10px] leading-[1.3] whitespace-pre mb-4"
        >
          <C c={bone}>{'        _______________\n'}</C>
          <C c={bone}>{'       /               \\\n'}</C>
          <C c={bone}>{'      /                 \\\n'}</C>
          <C c={bone}>{'     |  '}</C><C c={dark}>{'  ___     ___  '}</C><C c={bone}>{'|\n'}</C>
          <C c={bone}>{'     | '}</C><C c={dark}>{' |   |   |   | '}</C><C c={bone}>{'|\n'}</C>
          <C c={bone}>{'     |  '}</C><C c={dark}>{'  \u203e\u203e\u203e     \u203e\u203e\u203e  '}</C><C c={bone}>{'|\n'}</C>
          <C c={bone}>{'     |       '}</C><C c={dimBone}>{'\u25bd'}</C><C c={bone}>{'       |\n'}</C>
          <C c={bone}>{'      \\    '}</C><C c={dimBone}>{'\u2500\u2500\u2500\u2500\u2500'}</C><C c={bone}>{'    /\n'}</C>
          <C c={bone}>{'       \\___'}</C><C c={dimBone}>{'\u2502\u2502\u2502\u2502\u2502'}</C><C c={bone}>{'___/\n'}</C>
          <C c={dimBone}>{'           \u2502\u2502\u2502\u2502\u2502'}</C>
        </motion.pre>

        {/* Ornamental rule */}
        <pre className="text-center text-[11px]" style={{ color: rule }}>
{' \u2500\u2500\u2500\u2500\u2500\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2500\u2500\u2500\u2500\u2500'}
        </pre>

        {/* GAME OVER in large ASCII block letters */}
        <motion.pre
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 0.7, 1] }}
          transition={{ duration: 3, delay: 1.5 }}
          className="text-center text-[9px] leading-[1.2] whitespace-pre my-4"
        >
          <C c={crimson}>
{'  \u2588\u2588\u2588\u2588\u2588\u2588   \u2588\u2588\u2588\u2588\u2588    \u2588\u2588\u2588\u2588\u2588\u2588\u2588 \u2588\u2588\u2588\u2588\u2588\u2588\u2588\n'
+ '  \u2588\u2588        \u2588\u2588   \u2588\u2588   \u2588\u2588\u2588\u2588    \u2588\u2588\n'
+ '  \u2588\u2588  \u2588\u2588\u2588   \u2588\u2588\u2588\u2588\u2588\u2588\u2588   \u2588\u2588\u2588\u2588\u2588   \u2588\u2588\u2588\u2588\u2588\n'
+ '  \u2588\u2588   \u2588\u2588   \u2588\u2588   \u2588\u2588   \u2588\u2588\u2588\u2588    \u2588\u2588\n'
+ '  \u2588\u2588\u2588\u2588\u2588\u2588   \u2588\u2588   \u2588\u2588   \u2588\u2588      \u2588\u2588\u2588\u2588\u2588\u2588\u2588\n'}
          </C>
          {'\n'}
          <C c={blood}>
{'   \u2588\u2588\u2588\u2588\u2588\u2588   \u2588\u2588    \u2588\u2588 \u2588\u2588\u2588\u2588\u2588\u2588\u2588 \u2588\u2588\u2588\u2588\u2588\u2588\n'
+ '  \u2588\u2588    \u2588\u2588  \u2588\u2588    \u2588\u2588 \u2588\u2588      \u2588\u2588   \u2588\u2588\n'
+ '  \u2588\u2588    \u2588\u2588   \u2588\u2588  \u2588\u2588  \u2588\u2588\u2588\u2588\u2588   \u2588\u2588\u2588\u2588\u2588\u2588\n'
+ '  \u2588\u2588    \u2588\u2588    \u2588\u2588\u2588\u2588   \u2588\u2588      \u2588\u2588  \u2588\u2588\n'
+ '   \u2588\u2588\u2588\u2588\u2588\u2588      \u2588\u2588    \u2588\u2588\u2588\u2588\u2588\u2588\u2588 \u2588\u2588   \u2588\u2588\n'}
          </C>
        </motion.pre>

        {/* Ornamental rule */}
        <pre className="text-center text-[11px]" style={{ color: rule }}>
{' \u2500\u2500\u2500\u2500\u2500\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2500\u2500\u2500\u2500\u2500'}
        </pre>

        {/* Cause of death */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 2.5 }}
          className="text-center mt-4 text-[13px] leading-[1.8]"
          style={{ color: bone, fontFamily: '"Fraunces", serif', fontStyle: 'italic' }}
        >
          {gameOverCause}
        </motion.div>

        {/* Player info */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 3 }}
          className="mt-6"
        >
          <pre className="text-center text-[11px]" style={{ color: rule }}>
{'          \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500'}
          </pre>

          <div className="text-center mt-3 space-y-1">
            <div className="text-[12px] tracking-[0.15em]" style={{ color: bone }}>
              <span style={{ color: dimBone }}>Captain </span>
              {captainName}
            </div>
            <div className="text-[11px] tracking-[0.1em]" style={{ color: dimBone }}>
              of <span style={{ color: bone }}>{shipName}</span>
            </div>
          </div>

          <pre className="text-center text-[11px] mt-3" style={{ color: rule }}>
{'          \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500'}
          </pre>

          <div className="text-center mt-3 text-[10px] tracking-[0.2em] uppercase"
               style={{ color: dim, fontFamily: '"Fraunces", serif' }}>
            {dateStr}
          </div>
        </motion.div>

        {/* Restart prompt */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.6, 0.4, 0.6] }}
          transition={{ duration: 2.5, delay: 4, repeat: Infinity }}
          className="text-center mt-8 text-[9px] tracking-[0.25em] uppercase"
          style={{ color: dim }}
        >
          refresh to try again
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
