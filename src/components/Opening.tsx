import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { audioManager } from '../audio/AudioManager';
import { ambientEngine } from '../audio/AmbientEngine';
import { useIsMobile } from '../utils/useIsMobile';
import { Info, Settings as SettingsIcon } from 'lucide-react';

const SettingsModalV2 = lazy(() =>
  import('./SettingsModalV2').then((module) => ({ default: module.SettingsModalV2 }))
);

// Responsive opening splash. Keeps the ASCII charm of the original — title
// block letters, the ship, animated waves, pennants, twinkles, SET SAIL
// button — but flows cleanly from 320px phones up to widescreen. Side wave
// panels collapse into a single full-field background on narrow viewports,
// and all type scales with clamp(). Touch target on SET SAIL meets 48px.

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

const MONO = '"SF Mono", "Fira Code", "Cascadia Code", "Consolas", monospace';

const PALETTE = {
  gold:      '#c9a84c',
  dimGold:   '#8a7a4a',
  warm:      '#b89a6a',
  mast:      '#a08060',
  hull:      '#8b6940',
  sail:      '#d4c8a8',
  hullBody:  '#5a4a2a',
  rule:      '#3a3528',
  ruleLight: '#4a4538',
  dim:       '#5a5445',
  txt:       '#9a9080',
  bright:    '#d8ccb0',
  bg:        '#0a0908',
} as const;

function C({ c, children }: { c: string; children: React.ReactNode }) {
  return <span style={{ color: c }}>{children}</span>;
}

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

function Pennant({ color = PALETTE.gold }: { color?: string }) {
  const frames = ['▸▸▸', '▸▸·', '▸· ', '·  '];
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI(x => (x + 1) % frames.length), 260);
    return () => clearInterval(id);
  }, []);
  return <span style={{ color }}>{frames[i]}</span>;
}

// ── Ambient wave field ───────────────────────────────────────────────────────
// On wide viewports this renders as two flanking panels; on narrow viewports
// a single full-width field is placed behind the content at lower opacity.

const WAVE_CHARS = [' ', '·', '·', '∙', '~', '∼', '≈', '≈', '≋', '≋'];
const WAVE_COLORS = [
  '#04101c',  // deep-ocean near-black
  '#081e33',  // dark navy
  '#0e2f4e',  // ocean navy
  '#144870',  // deep sea blue
  '#1a6494',  // ocean blue
  '#2284bb',  // mid-ocean
  '#2ea8d8',  // bright sea
  '#42bce4',  // clear tropical
  '#62cfed',  // turquoise
  '#88dff4',  // surf highlight
];

// Top-down caravel. Matches original dimensions so wave-panel timing behaves
// identically to the legacy splash.
const SHIP_SHAPE = [
  '  ^  ',
  ' /█\\ ',
  ' █o█ ',
  ' █▓█ ',
  ' █O█ ',
  ' █▓█ ',
  ' █o█ ',
  ' \\█/ ',
  '  v  ',
];
const SHIP_H = SHIP_SHAPE.length;
const SHIP_W = 5;
const SHIP_COLORS: Record<string, string> = {
  '^': '#d4c8a8', 'v': '#d4c8a8',
  '/': '#8b6940', '\\': '#8b6940',
  '█': '#6b4f30',
  '▓': '#8a6b3f',
  'o': '#c9a84c', 'O': '#e0bc56',
};
const WAKE_CHAR = '≈';
const WAKE_COLOR = '#4a7a8a';

type WaveVariant = 'side-left' | 'side-right' | 'background';

function WaveField({ variant, withShip, active }: { variant: WaveVariant; withShip: boolean; active: boolean }) {
  const preRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    const el = preRef.current;
    if (!el) return;

    const charW = 6.6;
    const charH = 13;
    let cols = 0, rows = 0;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      cols = Math.floor(rect.width / charW);
      rows = Math.floor(rect.height / charH);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);

    let shipYf = 0;
    let initialized = false;
    let lastTime = 0;
    let animId = 0;

    function renderFrame(time: number) {
      if (cols < 8 || rows < 12) { el.innerHTML = ''; return; }

      if (!initialized) { shipYf = rows + 6; initialized = true; }
      const t = time * 0.0005;

      const amp = Math.min(cols * 0.12, (cols - SHIP_W) / 2 - 1);
      const baseCol = cols * 0.5;
      const shipCenterX = baseCol + Math.sin(t * 0.6) * amp;
      const shipX = Math.floor(shipCenterX - SHIP_W / 2);
      shipYf -= 0.18;
      if (shipYf < -SHIP_H - 4) shipYf = rows + 6;
      const shipRow = Math.floor(shipYf);

      let html = '';
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          // For side-right, mirror x so waves flow inward
          const wx = variant === 'side-right' ? cols - 1 - x : x;

          if (withShip) {
            const sr = y - shipRow;
            const sc = x - shipX;
            if (sr >= 0 && sr < SHIP_H && sc >= 0 && sc < SHIP_W) {
              const ch = SHIP_SHAPE[sr].charAt(sc);
              if (ch !== ' ') {
                const color = SHIP_COLORS[ch] ?? '#8b6940';
                const safe = ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : ch === '&' ? '&amp;' : ch;
                html += `<span style="color:${color}">${safe}</span>`;
                continue;
              }
            }
            const wakeOffset = y - (shipRow + SHIP_H);
            if (wakeOffset >= 0 && wakeOffset < 9) {
              const wakeCenterDist = Math.abs(x - (shipX + Math.floor(SHIP_W / 2)));
              const wakeWidth = Math.floor(wakeOffset * 0.55) + 1;
              if (wakeCenterDist <= wakeWidth && wakeCenterDist > 0) {
                const wakeAlpha = 1 - wakeOffset / 9;
                html += `<span style="color:${WAKE_COLOR};opacity:${(wakeAlpha * 0.65).toFixed(2)}">${WAKE_CHAR}</span>`;
                continue;
              }
            }
          }

          const n1 = Math.sin(wx * 0.35 + y * 0.12 + t * 3.2);
          const n2 = Math.sin(wx * 0.18 - y * 0.25 + t * 2.2);
          const n3 = Math.sin(y * 0.4 + t * 3.6 + wx * 0.08);
          const wave = n1 * 0.45 + n2 * 0.3 + n3 * 0.25;

          // Side panels fade toward the content column; background fades
          // toward the vertical midline (so the content sits in calmer water).
          let fade: number;
          if (variant === 'side-left') fade = Math.min(1, ((cols - x) / cols) * 2.5);
          else if (variant === 'side-right') fade = Math.min(1, (x / cols) * 2.5);
          else {
            const midY = Math.abs(y / rows - 0.5) * 2;
            fade = Math.min(1, midY * 1.4);
          }

          const idx = Math.max(0, Math.min(
            WAVE_CHARS.length - 1,
            Math.floor((wave + 1) * 0.5 * WAVE_CHARS.length * fade),
          ));
          const ch = WAVE_CHARS[idx];
          if (ch === ' ') html += ' ';
          else html += `<span style="color:${WAVE_COLORS[idx]}">${ch}</span>`;
        }
        html += '\n';
      }
      el.innerHTML = html;
    }

    renderFrame(0);

    if (active) {
      const tick = (time: number) => {
        animId = requestAnimationFrame(tick);
        if (time - lastTime < 80) return;
        lastTime = time;
        renderFrame(time);
      };
      animId = requestAnimationFrame(tick);
    }

    return () => {
      cancelAnimationFrame(animId);
      ro.disconnect();
    };
  }, [variant, withShip, active]);

  const baseStyle: React.CSSProperties = {
    fontSize: '10px',
    lineHeight: '13px',
    fontFamily: MONO,
    contain: 'strict',
  };
  if (variant === 'side-left' || variant === 'side-right') {
    const side = variant === 'side-left' ? 'left' : 'right';
    return (
      <pre
        ref={preRef}
        className="absolute top-[20px] bottom-[20px] overflow-hidden pointer-events-none select-none"
        style={{
          ...baseStyle,
          [side]: '20px',
          width: 'min(calc(50vw - 300px), 40vw)',
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
  // background: full-bleed, lower opacity
  return (
    <pre
      ref={preRef}
      className="absolute inset-0 overflow-hidden pointer-events-none select-none"
      style={{
        ...baseStyle,
        opacity: 0.28,
        maskImage: 'radial-gradient(ellipse at center, transparent 25%, black 80%)',
        WebkitMaskImage: 'radial-gradient(ellipse at center, transparent 25%, black 80%)',
      }}
    />
  );
}

// ── Player ship overlay — WASD-controllable during loading ──────────────────
// Rendered as an absolute element above the wave panels (z-5) but below the
// content column (z-10). Position is tracked in a ref to avoid re-renders.

type ShipPos = { x: number; y: number; heading: number; vx: number; vy: number };

function PlayerShip({ posRef }: { posRef: React.MutableRefObject<ShipPos> }) {
  const { isMobile } = useIsMobile();
  const wrapRef = useRef<HTMLDivElement>(null);
  const rotRef  = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isMobile) return;
    let animId: number;
    const tick = () => {
      if (wrapRef.current && rotRef.current) {
        const { x, y, heading } = posRef.current;
        wrapRef.current.style.left = `${x}%`;
        wrapRef.current.style.top  = `${y}%`;
        rotRef.current.style.transform = `translate(-50%, -50%) rotate(${heading}rad)`;
      }
      animId = requestAnimationFrame(tick);
    };
    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [posRef, isMobile]);

  if (isMobile) return null;

  return (
    <div
      ref={wrapRef}
      className="absolute pointer-events-none select-none"
      style={{ zIndex: 5 }}
    >
      <div
        ref={rotRef}
        style={{
          fontFamily: MONO,
          fontSize: 10,
          lineHeight: '13px',
          filter: 'drop-shadow(0 0 5px rgba(74,122,138,0.75))',
          transform: 'translate(-50%, -50%)',
        }}
      >
        {SHIP_SHAPE.map((row, ri) => (
          <div key={ri} style={{ whiteSpace: 'pre' }}>
            {row.split('').map((ch, ci) => {
              const color = SHIP_COLORS[ch];
              return color
                ? <span key={ci} style={{ color }}>{ch}</span>
                : ch;
            })}
          </div>
        ))}
        {/* Wake — always south in local space, so it trails behind in any heading */}
        <div style={{ whiteSpace: 'pre', color: WAKE_COLOR, opacity: 0.65 }}>{'  ≈ ≈'}</div>
        <div style={{ whiteSpace: 'pre', color: WAKE_COLOR, opacity: 0.38 }}>{' ≈   ≈'}</div>
        <div style={{ whiteSpace: 'pre', color: WAKE_COLOR, opacity: 0.18 }}>{'≈     ≈'}</div>
      </div>
    </div>
  );
}

// ── Baroque border — scales down padding on narrow viewports ────────────────

function BaroqueCorner({ style }: { style?: React.CSSProperties }) {
  const size = 'clamp(48px, 10vw, 80px)';
  return (
    <svg
      width="80" height="80" viewBox="0 0 80 80"
      fill="none" xmlns="http://www.w3.org/2000/svg"
      style={{ overflow: 'visible', width: size, height: size, ...style }}
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

function BaroqueBorder() {
  const pad = 'clamp(6px, 1.5vw, 12px)';
  return (
    <div className="absolute inset-0 pointer-events-none z-20" style={{ padding: pad }}>
      <div className="absolute" style={{ inset: pad, border: '1px solid rgba(106, 93, 58, 0.35)' }}>
        <div className="absolute inset-[5px]" style={{ border: '0.5px solid rgba(74, 64, 48, 0.25)' }} />
      </div>
      <BaroqueCorner style={{ position: 'absolute', top: 0, left: 0 }} />
      <BaroqueCorner style={{ position: 'absolute', top: 0, right: 0, transform: 'scaleX(-1)' }} />
      <BaroqueCorner style={{ position: 'absolute', bottom: 0, left: 0, transform: 'scaleY(-1)' }} />
      <BaroqueCorner style={{ position: 'absolute', bottom: 0, right: 0, transform: 'scale(-1, -1)' }} />
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export function Opening({
  ready,
  loadingMessage,
  loadingProgress,
  onStart,
}: OpeningOverlayProps) {
  const { isMobile } = useIsMobile();

  // Wide viewport → dual side panels; narrow → single ambient background.
  // Independent of isMobile so narrow desktop windows also get the background.
  const [useSidePanels, setUseSidePanels] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 820 : true
  );
  useEffect(() => {
    const update = () => setUseSidePanels(window.innerWidth >= 820);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // Audio: first-interaction unlock (autoplay policy).
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

  const [btnHovered, setBtnHovered] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'world' | 'display' | 'audio' | 'gameplay' | 'dev' | 'about'>('world');
  const [hoveredSecBtn, setHoveredSecBtn] = useState<null | 'about' | 'settings'>(null);

  // WASD: let the player navigate the ship across the wave panels while loading.
  const shipPos = useRef<ShipPos>({ x: 20, y: 50, heading: 0, vx: 0, vy: 0 });
  const keysHeld = useRef({ w: false, a: false, s: false, d: false });

  useEffect(() => {
    if (isMobile) return;
    const onDown = (e: KeyboardEvent) => {
      if (e.key === 'w' || e.key === 'W') { keysHeld.current.w = true; e.preventDefault(); }
      if (e.key === 's' || e.key === 'S') { keysHeld.current.s = true; e.preventDefault(); }
      if (e.key === 'a' || e.key === 'A') { keysHeld.current.a = true; e.preventDefault(); }
      if (e.key === 'd' || e.key === 'D') { keysHeld.current.d = true; e.preventDefault(); }
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.key === 'w' || e.key === 'W') keysHeld.current.w = false;
      if (e.key === 's' || e.key === 'S') keysHeld.current.s = false;
      if (e.key === 'a' || e.key === 'A') keysHeld.current.a = false;
      if (e.key === 'd' || e.key === 'D') keysHeld.current.d = false;
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);

    // Nautical heading physics: A/D turns, W thrusts forward, S brakes.
    // heading=0 → bow points north (up); positive heading = clockwise.
    const TURN_RATE = 2.8;   // rad/s
    const THRUST    = 70;    // %/s² forward acceleration
    const DRAG      = 1.6;   // velocity damping (exp decay coefficient)
    const MAX_SPEED = 30;    // %/s

    let last = 0;
    let animId: number;
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.08);
      last = now;
      const k = keysHeld.current;
      const s = shipPos.current;

      // Turn helm
      if (k.a) s.heading -= TURN_RATE * dt;
      if (k.d) s.heading += TURN_RATE * dt;

      // Bow direction vector (heading 0 = pointing up, y-axis inverted in CSS)
      const fx = Math.sin(s.heading);
      const fy = -Math.cos(s.heading);

      // Thrust / brake
      if (k.w) {
        s.vx += fx * THRUST * dt;
        s.vy += fy * THRUST * dt;
      } else if (k.s) {
        s.vx -= fx * THRUST * 0.55 * dt;
        s.vy -= fy * THRUST * 0.55 * dt;
      } else if (k.a || k.d) {
        // Auto-creep forward when turning without W/S
        s.vx += fx * THRUST * 0.4 * dt;
        s.vy += fy * THRUST * 0.4 * dt;
      }

      // Drag (exponential — frame-rate independent)
      const drag = Math.exp(-DRAG * dt);
      s.vx *= drag;
      s.vy *= drag;

      // Speed cap
      const spd = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
      if (spd > MAX_SPEED) { s.vx = s.vx / spd * MAX_SPEED; s.vy = s.vy / spd * MAX_SPEED; }

      // Integrate position
      s.x = Math.max(3, Math.min(97, s.x + s.vx * dt));
      s.y = Math.max(3, Math.min(97, s.y + s.vy * dt));

      animId = requestAnimationFrame(tick);
    };
    animId = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      cancelAnimationFrame(animId);
    };
  }, [isMobile]);

  // Local progress — decoupled from the parent's rAF loop so main-thread
  // blocking (from 3D world-gen mounting underneath) can't stall the bar.
  // The bar fill uses a CSS transition on transform:scaleX — composited on
  // the GPU, so it completes smoothly even if JS frames are dropped. The
  // percentage readout ticks off the same clock and snaps to 100% when the
  // parent says we're ready.
  const BAR_FILL_MS = 2300;
  const [barFilled, setBarFilled] = useState(false);
  const [displayPct, setDisplayPct] = useState(0);
  useEffect(() => {
    // Kick the CSS transition on the next frame after mount
    const raf1 = requestAnimationFrame(() => setBarFilled(true));
    return () => cancelAnimationFrame(raf1);
  }, []);
  useEffect(() => {
    if (ready) { setDisplayPct(100); return; }
    const STEP_MS = 120;
    const steps = Math.ceil(BAR_FILL_MS / STEP_MS);
    let step = 0;
    const timer = window.setInterval(() => {
      step = Math.min(steps, step + 1);
      const t = step / steps;
      // Match the bar's cubic-bezier(0.25, 1, 0.5, 1) roughly
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplayPct(Math.round(eased * 95));
      if (step >= steps) window.clearInterval(timer);
    }, STEP_MS);
    return () => window.clearInterval(timer);
  }, [ready]);

  return (
    <motion.div
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto pointer-events-auto"
      style={{ height: 'var(--app-height)', backgroundColor: PALETTE.bg }}
    >
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.15 }}
      >
        <BaroqueBorder />
      </motion.div>

      {/* Wave field — side panels slide in from their respective edges after a
          brief pause; background variant just fades on narrow viewports. */}
      {useSidePanels ? (
        <>
          <motion.div
            className="absolute inset-0 z-0 pointer-events-none"
            initial={{ opacity: 0, x: -90 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 1.3, ease: [0.22, 1, 0.36, 1], delay: 2.2 }}
          >
            <WaveField variant="side-left" withShip={false} active />
          </motion.div>
          <motion.div
            className="absolute inset-0 z-0 pointer-events-none"
            initial={{ opacity: 0, x: 90 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 1.3, ease: [0.22, 1, 0.36, 1], delay: 2.2 }}
          >
            <WaveField variant="side-right" withShip={false} active />
          </motion.div>
        </>
      ) : (
        <motion.div
          className="absolute inset-0 z-0 pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.4, ease: 'easeOut', delay: 1.8 }}
        >
          <WaveField variant="background" withShip={false} active />
        </motion.div>
      )}

      {/* Player-controlled ship (desktop only) */}
      <PlayerShip posRef={shipPos} />

      {/* Content column */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 select-none flex flex-col items-center"
        style={{
          width: 'min(640px, calc(100vw - clamp(32px, 8vw, 64px)))',
          padding: 'clamp(16px, 4vw, 28px) clamp(12px, 3.5vw, 24px)',
          fontFamily: MONO,
          willChange: 'opacity, transform',
        }}
      >
        {/* Title block */}
        <motion.div
          animate={ready ? { filter: `drop-shadow(0 0 10px ${PALETTE.gold}55)` } : { filter: 'none' }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
          className="flex justify-center w-full"
        >
          <div
            className="relative inline-block"
            style={{
              padding: 'clamp(10px, 3vw, 20px) clamp(14px, 4vw, 28px)',
              border: `1px solid ${PALETTE.dimGold}44`,
              borderRadius: 3,
            }}
          >
            <div className="absolute inset-[3px]" style={{ border: `0.5px solid ${PALETTE.dimGold}22`, borderRadius: 2 }} />
            <pre
              className="text-center whitespace-pre leading-[1.45]"
              style={{ fontSize: 'clamp(10px, 3.2vw, 14px)' }}
            >
              <C c={PALETTE.gold}>{'╔═╗  ╔═╗  ╦  ╔═╗  ╔═╗'}</C>{'\n'}
              <C c={PALETTE.gold}>{'╚═╗  ╠═╝  ║  ║    ╠═ '}</C>{'\n'}
              <C c={PALETTE.gold}>{'╚═╝  ╩    ╩  ╚═╝  ╚═╝'}</C>
            </pre>
            <pre
              className="text-center whitespace-pre"
              style={{ color: PALETTE.dimGold, fontSize: 'clamp(8px, 2.4vw, 10px)', margin: 'clamp(4px, 1.2vw, 8px) 0' }}
            >
              {'─'.repeat(32)}
            </pre>
            <pre
              className="text-center whitespace-pre leading-[1.45]"
              style={{ fontSize: 'clamp(10px, 3.2vw, 14px)' }}
            >
              <C c={PALETTE.bright}>{'╦  ╦  ╔═╗  ╦ ╦  ╔═╗  ╔═╗  ╔═╗  ╦═╗'}</C>{'\n'}
              <C c={PALETTE.bright}>{'╚╗╔╝  ║ ║  ╚╦╝  ╠═╣  ║ ╦  ╠═   ╠╦╝'}</C>{'\n'}
              <C c={PALETTE.bright}>{' ╚╝   ╚═╝   ╩   ╩ ╩  ╚═╝  ╚═╝  ╩╚═'}</C>
            </pre>
          </div>
        </motion.div>

        {/* Subtitle */}
        <div
          className="text-center"
          style={{
            color: PALETTE.txt,
            fontFamily: '"Fraunces", serif',
            fontStyle: 'italic',
            fontSize: 'clamp(11px, 3vw, 13px)',
            marginTop: 'clamp(10px, 2.5vw, 16px)',
            letterSpacing: '0.02em',
          }}
        >
          A Game of Oceanic Trade, Anno 1612
        </div>

        <pre
          className="text-center whitespace-pre"
          style={{ color: PALETTE.rule, fontSize: 'clamp(9px, 2.6vw, 11px)', marginTop: 'clamp(10px, 2.5vw, 16px)' }}
        >
          {'─'.repeat(30)}
        </pre>

        {/* Description */}
        <div
          className="text-center"
          style={{
            color: PALETTE.txt,
            fontFamily: '"DM Sans", sans-serif',
            lineHeight: 1.75,
            fontSize: 'clamp(12px, 3vw, 13px)',
            marginTop: 'clamp(12px, 3vw, 18px)',
            maxWidth: 420,
          }}
        >
          Trade goods between ports across the<br />
          Indian, Atlantic &amp; Pacific Oceans.
        </div>

        <pre
          className="text-center whitespace-pre"
          style={{ color: PALETTE.ruleLight, fontSize: 'clamp(9px, 2.6vw, 11px)', marginTop: 'clamp(12px, 3vw, 18px)' }}
        >
          {'═'.repeat(30)}
        </pre>

        {/* Loading state */}
        <div className="text-center w-full flex flex-col items-center" style={{ marginTop: 'clamp(12px, 3vw, 18px)' }}>
          {/* Eyebrow status label */}
          <motion.div
            animate={{ opacity: ready ? 1 : [0.55, 0.95, 0.55] }}
            transition={ready
              ? { duration: 0.3 }
              : { duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
            className="uppercase"
            style={{
              color: ready ? PALETTE.gold : PALETTE.dimGold,
              fontFamily: MONO,
              fontSize: 'clamp(9px, 2.2vw, 10px)',
              letterSpacing: '0.35em',
              marginBottom: 'clamp(4px, 1.2vw, 6px)',
              textShadow: ready ? `0 0 10px ${PALETTE.gold}66` : 'none',
            }}
          >
            {ready ? '◆  Departure Ready  ◆' : '·  Preparing Voyage  ·'}
          </motion.div>

          {/* Message — larger, brighter, with reserved height so the bar doesn't jump */}
          <div style={{ minHeight: 'clamp(20px, 4.5vw, 22px)', display: 'flex', alignItems: 'center' }}>
            <AnimatePresence mode="wait">
              <motion.div
                key={ready ? 'ready' : loadingMessage}
                initial={{ opacity: 0, y: 2 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -2 }}
                transition={{ duration: 0.28 }}
                style={{
                  color: ready ? PALETTE.bright : PALETTE.txt,
                  fontFamily: '"Fraunces", serif',
                  fontStyle: 'italic',
                  fontSize: 'clamp(13px, 3.4vw, 15px)',
                  lineHeight: 1.4,
                  textShadow: ready ? `0 0 14px ${PALETTE.warm}80` : 'none',
                }}
              >
                {ready ? 'Ready to depart.' : loadingMessage}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Bar + percentage */}
          <div
            className="flex items-center"
            style={{ marginTop: 'clamp(10px, 2.5vw, 14px)', gap: 'clamp(8px, 2vw, 12px)' }}
          >
            <div
              className="relative"
              style={{
                width: 'min(320px, 68vw)',
                height: 12,
                background: 'rgba(8,7,5,0.75)',
                border: `1px solid ${PALETTE.dimGold}66`,
                borderRadius: 2,
                overflow: 'hidden',
                boxShadow: `inset 0 1px 2px rgba(0,0,0,0.6), 0 0 0 1px ${PALETTE.rule}`,
              }}
            >
              {/* Quarter tick marks — subtle dial feel */}
              {[25, 50, 75].map(pct => (
                <div
                  key={pct}
                  className="absolute top-0 bottom-0"
                  style={{
                    left: `${pct}%`,
                    width: 1,
                    background: `${PALETTE.dimGold}33`,
                    pointerEvents: 'none',
                  }}
                />
              ))}

              {/* Fill — composited via transform:scaleX so it stays smooth even
                  when world-gen hogs the main thread. Dull amber while loading,
                  shifts to bright green on ready. */}
              <div
                className="absolute inset-y-0 left-0 w-full origin-left"
                style={{
                  transform: `scaleX(${ready ? 1 : barFilled ? 0.95 : 0})`,
                  background: ready
                    ? 'linear-gradient(to right, #3f6b3a, #6fae4a 45%, #9ed85a 85%, #caf188)'
                    : `linear-gradient(to right, ${PALETTE.dimGold}, ${PALETTE.warm} 45%, ${PALETTE.gold} 85%, ${PALETTE.bright})`,
                  boxShadow: ready
                    ? '0 0 14px rgba(158,216,90,0.75), inset 0 1px 0 rgba(220,255,180,0.28), inset 0 -1px 0 rgba(0,0,0,0.35)'
                    : `0 0 10px ${PALETTE.gold}66, inset 0 1px 0 rgba(255,240,200,0.22), inset 0 -1px 0 rgba(0,0,0,0.35)`,
                  transition: `transform ${ready ? 300 : BAR_FILL_MS}ms cubic-bezier(0.25, 1, 0.5, 1), background 0.6s ease, box-shadow 0.6s ease`,
                  willChange: 'transform',
                }}
              />

              {/* Continuous shimmer while loading */}
              {!ready && (
                <motion.div
                  className="absolute top-0 bottom-0 pointer-events-none"
                  animate={{ x: ['-30%', '130%'] }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: 'linear' }}
                  style={{
                    width: '28%',
                    background: 'linear-gradient(90deg, transparent, rgba(255,235,180,0.22), transparent)',
                    mixBlendMode: 'screen',
                  }}
                />
              )}

              {/* One-time sweep on ready */}
              {ready && (
                <motion.div
                  className="absolute inset-0 pointer-events-none"
                  initial={{ opacity: 0, x: '-100%' }}
                  animate={{ opacity: [0, 0.7, 0], x: '100%' }}
                  transition={{ duration: 0.9, delay: 0.2, ease: 'easeOut' }}
                  style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.55), transparent)' }}
                />
              )}
            </div>

            {/* Percentage readout */}
            <div
              style={{
                fontFamily: MONO,
                fontSize: 'clamp(11px, 2.8vw, 13px)',
                color: ready ? '#9ed85a' : PALETTE.warm,
                fontVariantNumeric: 'tabular-nums',
                minWidth: '3.5ch',
                textAlign: 'right',
                textShadow: ready ? '0 0 10px rgba(158,216,90,0.7)' : 'none',
                transition: 'color 0.5s ease, text-shadow 0.5s ease',
              }}
            >
              {ready ? '100%' : '...'}
            </div>
          </div>
        </div>

        <pre
          className="text-center whitespace-pre"
          style={{ color: PALETTE.ruleLight, fontSize: 'clamp(9px, 2.6vw, 11px)', marginTop: 'clamp(10px, 2.5vw, 14px)' }}
        >
          {'═'.repeat(30)}
        </pre>

        {/* SET SAIL button — thumb-friendly */}
        <div className="flex justify-center w-full" style={{ marginTop: 'clamp(14px, 3.5vw, 22px)' }}>
          <motion.button
            whileTap={ready ? { scale: 0.97 } : undefined}
            onClick={onStart}
            disabled={!ready}
            onMouseEnter={() => ready && setBtnHovered(true)}
            onMouseLeave={() => setBtnHovered(false)}
            style={{
              minHeight: 52,
              width: 'min(320px, 90%)',
              padding: '12px 20px',
              fontFamily: MONO,
              fontSize: 'clamp(13px, 3.2vw, 15px)',
              letterSpacing: '0.32em',
              textTransform: 'uppercase',
              color: ready ? (btnHovered ? '#ffffff' : PALETTE.bright) : PALETTE.dim,
              backgroundColor: ready ? 'rgba(20,16,10,0.85)' : 'rgba(10,9,7,0.6)',
              border: `1px solid ${ready ? (btnHovered ? PALETTE.bright : PALETTE.gold) : PALETTE.rule}`,
              borderRadius: 3,
              boxShadow: ready
                ? `0 0 0 1px ${PALETTE.dimGold}55 inset, 0 0 ${btnHovered ? 24 : 16}px ${PALETTE.gold}${btnHovered ? '44' : '22'}, 0 2px 8px rgba(0,0,0,0.5)`
                : `0 0 0 1px ${PALETTE.rule} inset`,
              cursor: ready ? 'pointer' : 'default',
              transition: 'all 0.2s ease',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            }}
          >
            {ready ? (
              <motion.span
                animate={{ opacity: [1, 0.4, 1] }}
                transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
                style={{ color: btnHovered ? '#ffffff' : PALETTE.gold }}
              >{'◆'}</motion.span>
            ) : (
              <span style={{ color: PALETTE.dim }}>{'·'}</span>
            )}
            <span>{ready ? 'Set Sail' : 'Preparing…'}</span>
          </motion.button>
        </div>

        {ready && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: [0.25, 0.7, 0.25] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
            className="text-center uppercase"
            style={{
              color: PALETTE.dim,
              fontSize: 10,
              letterSpacing: '0.25em',
              marginTop: 'clamp(6px, 1.8vw, 10px)',
            }}
          >
            {isMobile ? 'tap to begin' : 'press enter'}
          </motion.div>
        )}

        {/* Secondary buttons — About + Settings */}
        <div className="flex justify-center w-full" style={{ marginTop: 'clamp(10px, 2.5vw, 14px)', gap: 'clamp(8px, 2vw, 12px)' }}>
          {(['about', 'settings'] as const).map(btn => (
            <button
              key={btn}
              onClick={() => {
                setSettingsTab(btn === 'about' ? 'about' : 'world');
                setShowSettings(true);
              }}
              onMouseEnter={() => setHoveredSecBtn(btn)}
              onMouseLeave={() => setHoveredSecBtn(null)}
              style={{
                flex: isMobile ? '0 0 auto' : 1,
                width: isMobile ? 38 : undefined,
                maxWidth: isMobile ? undefined : 'min(155px, 43%)',
                minHeight: 38,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: MONO,
                fontSize: 'clamp(10px, 2.6vw, 11px)',
                letterSpacing: '0.22em',
                textTransform: 'uppercase',
                color: hoveredSecBtn === btn ? PALETTE.txt : PALETTE.dim,
                backgroundColor: 'transparent',
                border: `1px solid ${hoveredSecBtn === btn ? PALETTE.dimGold + '88' : PALETTE.rule}`,
                borderRadius: isMobile ? 19 : 3,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
              aria-label={btn === 'about' ? 'About' : 'Settings'}
              title={btn === 'about' ? 'About' : 'Settings'}
            >
              {isMobile
                ? btn === 'about'
                  ? <Info size={16} strokeWidth={2.2} />
                  : <SettingsIcon size={16} strokeWidth={2.2} />
                : btn}
            </button>
          ))}
        </div>

        <pre
          className="text-center whitespace-pre"
          style={{ color: PALETTE.rule, fontSize: 'clamp(9px, 2.6vw, 11px)', marginTop: 'clamp(12px, 3vw, 18px)' }}
        >
          {'─'.repeat(30)}
        </pre>

        {/* Controls hint — swaps between keyboard shortcuts and touch hints */}
        <div className="flex justify-center" style={{ marginTop: 'clamp(10px, 2.5vw, 14px)' }}>
          <div
            className="relative"
            style={{
              padding: 'clamp(10px, 2.5vw, 14px) clamp(18px, 4vw, 28px)',
              border: `1px solid ${PALETTE.rule}`,
              borderRadius: 3,
            }}
          >
            <div
              className="absolute left-1/2 -translate-x-1/2 uppercase"
              style={{
                top: -7,
                padding: '0 8px',
                color: PALETTE.dimGold,
                backgroundColor: PALETTE.bg,
                fontSize: 9,
                letterSpacing: '0.2em',
              }}
            >
              controls
            </div>
            {isMobile ? (
              <div
                className="grid grid-cols-2 gap-x-5 gap-y-2 text-left"
                style={{ fontSize: 'clamp(11px, 2.8vw, 12px)', color: PALETTE.dim }}
              >
                <div><C c={PALETTE.warm}>tap water</C> to sail</div>
                <div><C c={PALETTE.warm}>tap port</C> to dock</div>
                <div><C c={PALETTE.warm}>pinch</C> to zoom</div>
                <div><C c={PALETTE.warm}>fight</C> button in bar</div>
              </div>
            ) : (
              <pre className="whitespace-pre text-left leading-[2]" style={{ fontSize: 'clamp(10px, 2.6vw, 11px)' }}>
                <C c={PALETTE.warm}>{'W/S '}</C><C c={PALETTE.dim}>{'sails    '}</C>
                <C c={PALETTE.warm}>{'A/D '}</C><C c={PALETTE.dim}>{'helm     '}</C>
                <C c={PALETTE.warm}>{'E '}</C><C c={PALETTE.dim}>{'port'}</C>{'\n'}
                <C c={PALETTE.warm}>{'SPC '}</C><C c={PALETTE.dim}>{'cannon   '}</C>
                <C c={PALETTE.warm}>{'M   '}</C><C c={PALETTE.dim}>{'chart    '}</C>
                <C c={PALETTE.warm}>{'F '}</C><C c={PALETTE.dim}>{'stand down'}</C>
              </pre>
            )}
          </div>
        </div>

        <div
          className="text-center uppercase"
          style={{
            color: PALETTE.rule,
            fontSize: 9,
            letterSpacing: '0.3em',
            marginTop: 'clamp(8px, 2vw, 12px)',
          }}
        >
          v0.1
        </div>
      </motion.div>

      {showSettings && (
        <Suspense fallback={null}>
          <SettingsModalV2 open={showSettings} onClose={() => setShowSettings(false)} initialTab={settingsTab} />
        </Suspense>
      )}
    </motion.div>
  );
}
