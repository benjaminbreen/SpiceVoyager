import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useGameStore } from '../store/gameStore';
import { buildAmbientSources, pickLine, biomeToWindContext, getWindLines, type AmbientSource } from '../utils/ambientText';
import { getTerrainData } from '../utils/terrain';
import { useIsMobile } from '../utils/useIsMobile';

const POLL_MS = 600;
const COOLDOWN_MS = 90_000;
const SHOW_MS = 5_000;
const MIN_GAP_MS = 8_000;

const WIND_EMA_ALPHA = 0.04;        // ~25 polls (~15s) to settle
const WIND_GUST_DELTA = 0.18;       // windSpeed must exceed smoothed baseline by this
const WIND_COOLDOWN_MS = 120_000;   // min gap between wind lines

interface ActiveLine {
  id: string;
  text: string;
  color: string;
  shownAt: number;
  variant: number;
}

export function AmbientText() {
  const ports = useGameStore(s => s.ports);
  const worldSeed = useGameStore(s => s.worldSeed);
  const reduceMotion = useReducedMotion();
  const { isMobile, isTouch } = useIsMobile();

  const sources = useMemo(
    () => buildAmbientSources(ports, worldSeed),
    [ports, worldSeed],
  );

  const [active, setActive] = useState<ActiveLine | null>(null);
  const cooldownsRef = useRef<Map<string, number>>(new Map());
  const lastShownAtRef = useRef<number>(0);
  const windEmaRef = useRef<number | null>(null);
  const lastWindFireRef = useRef<number>(0);
  const activeRef = useRef<ActiveLine | null>(null);
  activeRef.current = active;

  const suppress = isMobile || isTouch;

  useEffect(() => {
    if (suppress) return;

    let disposed = false;
    const tick = () => {
      if (disposed) return;
      const now = performance.now();

      // Auto-clear expired line.
      const cur = activeRef.current;
      if (cur && now - cur.shownAt > SHOW_MS) {
        setActive(null);
      }

      const state = useGameStore.getState();
      const ws = state.windSpeed;

      // Maintain wind EMA every tick so it tracks regardless of UI activity.
      const prev = windEmaRef.current;
      const ema = prev === null ? ws : prev * (1 - WIND_EMA_ALPHA) + ws * WIND_EMA_ALPHA;
      windEmaRef.current = ema;

      // Don't queue a new line if one is showing or we're in the inter-line gap.
      if (activeRef.current) return;
      if (now - lastShownAtRef.current < MIN_GAP_MS) return;

      // 1. Proximity sources (port + hinterland scenes) — only when on ship.
      const onShip = state.playerMode === 'ship';
      const px = onShip ? state.playerPos[0] : state.walkingPos[0];
      const pz = onShip ? state.playerPos[2] : state.walkingPos[2];

      if (sources.length > 0) {
        let best: AmbientSource | null = null;
        let bestDistSq = Infinity;
        for (const src of sources) {
          const last = cooldownsRef.current.get(src.id) ?? -Infinity;
          if (now - last < COOLDOWN_MS) continue;
          const dx = px - src.x;
          const dz = pz - src.z;
          const d2 = dx * dx + dz * dz;
          if (d2 > src.radius * src.radius) continue;
          if (d2 < bestDistSq) {
            best = src;
            bestDistSq = d2;
          }
        }

        if (best) {
          const variant = Math.floor(now / 1000);
          const text = pickLine(best, variant);
          cooldownsRef.current.set(best.id, now);
          lastShownAtRef.current = now;
          setActive({
            id: `${best.id}-${variant}`,
            text,
            color: best.color,
            shownAt: now,
            variant,
          });
          return;
        }
      }

      // 2. Wind gust — windSpeed has risen sharply above the smoothed baseline.
      if (
        prev !== null &&
        ws - ema > WIND_GUST_DELTA &&
        now - lastWindFireRef.current > WIND_COOLDOWN_MS
      ) {
        const ctx = onShip
          ? 'sea'
          : biomeToWindContext(getTerrainData(px, pz).biome);
        const { lines, color } = getWindLines(ctx);
        const variant = Math.floor(now / 1000);
        const text = lines[Math.abs(variant) % lines.length];
        lastWindFireRef.current = now;
        lastShownAtRef.current = now;
        setActive({
          id: `wind-${ctx}-${variant}`,
          text,
          color,
          shownAt: now,
          variant,
        });
      }
    };

    const interval = window.setInterval(tick, POLL_MS);
    return () => {
      disposed = true;
      window.clearInterval(interval);
    };
  }, [sources, suppress]);

  // Auto-clear timer (independent of poll) so the line vanishes promptly.
  useEffect(() => {
    if (!active) return;
    const t = window.setTimeout(() => setActive(null), SHOW_MS);
    return () => window.clearTimeout(t);
  }, [active]);

  const fadeIn = reduceMotion ? 0 : 1.2;
  const fadeOut = reduceMotion ? 0 : 2.0;

  if (suppress) return null;

  return (
    <div
      className="fixed inset-x-0 pointer-events-none select-none z-[60]"
      style={{ bottom: 88 }}
      aria-hidden
    >
      <AnimatePresence>
        {active && (
          <motion.div
            key={active.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: fadeIn, ease: 'easeOut' } }}
            exit={{ opacity: 0, transition: { duration: fadeOut, ease: 'easeIn' } }}
            style={{
              textAlign: 'center',
              fontFamily: '"Cormorant Garamond", "EB Garamond", Georgia, serif',
              fontStyle: 'italic',
              fontWeight: 500,
              fontSize: 'clamp(13px, 1vw, 15px)',
              letterSpacing: '0.02em',
              opacity: 0.92,
              color: active.color,
              textShadow: '0 1px 2px rgba(0,0,0,0.85), 0 0 12px rgba(0,0,0,0.55)',
              paddingInline: 24,
            }}
          >
            {active.text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
