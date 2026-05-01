import { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';

type CombatTextTone =
  | 'hit'
  | 'critical'
  | 'glance'
  | 'sunk'
  | 'player'
  | 'splash'
  | 'structure';

export interface FloatingCombatText {
  id: number;
  x: number;
  y: number;
  z: number;
  spawnTime: number;
  label: string;
  tone: CombatTextTone;
  driftX: number;
  driftZ: number;
  lift: number;
}

const DURATION = 1.35;
const MAX_EVENTS = 18;
const events: FloatingCombatText[] = [];
let nextId = 1;
let clock = 0;

const TONE_STYLE: Record<CombatTextTone, { color: string; glow: string; size: number; weight: number }> = {
  hit: { color: '#ef6b5d', glow: 'rgba(239, 68, 68, 0.46)', size: 15, weight: 650 },
  critical: { color: '#f6c75a', glow: 'rgba(246, 199, 90, 0.62)', size: 19, weight: 760 },
  glance: { color: '#b6bfca', glow: 'rgba(148, 163, 184, 0.28)', size: 13, weight: 560 },
  sunk: { color: '#ffdf9a', glow: 'rgba(185, 28, 28, 0.85)', size: 24, weight: 860 },
  player: { color: '#fb8a52', glow: 'rgba(249, 115, 22, 0.55)', size: 17, weight: 720 },
  splash: { color: '#9bd8df', glow: 'rgba(139, 211, 221, 0.34)', size: 13, weight: 560 },
  structure: { color: '#d6d3c4', glow: 'rgba(214, 211, 196, 0.34)', size: 14, weight: 610 },
};

export function spawnFloatingCombatText(
  x: number,
  y: number,
  z: number,
  label: string,
  tone: CombatTextTone = 'hit',
) {
  const angle = Math.random() * Math.PI * 2;
  const drift = 0.22 + Math.random() * 0.38;
  events.push({
    id: nextId++,
    x,
    y,
    z,
    spawnTime: clock,
    label,
    tone,
    driftX: Math.cos(angle) * drift,
    driftZ: Math.sin(angle) * drift,
    lift: 1.2 + Math.random() * 0.45,
  });
  while (events.length > MAX_EVENTS) events.shift();
}

export function FloatingCombatTextSystem() {
  const [, setTick] = useState(0);
  const tickAccum = useRef(0);

  useEffect(() => () => { events.length = 0; }, []);

  useFrame((state, delta) => {
    clock = state.clock.getElapsedTime();
    let expired = false;
    while (events.length > 0 && clock - events[0].spawnTime > DURATION) {
      events.shift();
      expired = true;
    }
    tickAccum.current += delta;
    if ((events.length > 0 && tickAccum.current > 1 / 45) || expired) {
      tickAccum.current = 0;
      setTick((n) => (n + 1) % 1_000_000);
    }
  });

  if (events.length === 0) return null;

  return (
    <>
      {events.map((ev) => {
        const t = Math.max(0, Math.min(1, (clock - ev.spawnTime) / DURATION));
        const style = TONE_STYLE[ev.tone];
        const easeOut = 1 - Math.pow(1 - t, 3);
        const opacity = t < 0.08 ? t / 0.08 : 1 - Math.max(0, t - 0.26) / 0.74;
        const pop = ev.tone === 'sunk'
          ? 0.72 + Math.sin(Math.min(1, t / 0.3) * Math.PI) * 0.52 + easeOut * 0.12
          : ev.tone === 'critical'
            ? 0.82 + Math.sin(Math.min(1, t / 0.22) * Math.PI) * 0.28 + easeOut * 0.08
          : 0.86 + Math.sin(Math.min(1, t / 0.18) * Math.PI) * 0.14;
        const sunkShake = ev.tone === 'sunk' && t < 0.42 ? Math.sin(t * 95) * (1 - t / 0.42) * 2.6 : 0;
        return (
          <Html
            key={ev.id}
            position={[
              ev.x + ev.driftX * easeOut,
              ev.y + 0.85 + ev.lift * easeOut,
              ev.z + ev.driftZ * easeOut,
            ]}
            center
            zIndexRange={[80, 0]}
            style={{ pointerEvents: 'none', userSelect: 'none' }}
          >
            <div
              style={{
                opacity,
                transform: `translate(${sunkShake}px, ${-4 * easeOut}px) scale(${pop})`,
                transformOrigin: 'center',
                whiteSpace: 'nowrap',
                fontFamily: '"Fraunces", Georgia, serif',
                fontVariationSettings: '"opsz" 48, "SOFT" 18, "WONK" 1',
                fontSize: style.size,
                fontWeight: style.weight,
                color: style.color,
                textShadow: [
                  '0 1px 1px rgba(17, 10, 6, 0.95)',
                  '0 3px 8px rgba(0, 0, 0, 0.82)',
                  ev.tone === 'sunk' ? '0 0 2px rgba(255, 244, 214, 0.95)' : '',
                  `0 0 14px ${style.glow}`,
                ].filter(Boolean).join(', '),
                letterSpacing: '0',
                lineHeight: 1,
                textAlign: 'center',
                filter: 'drop-shadow(0 1px 0 rgba(255, 235, 190, 0.12))',
              }}
            >
              {ev.label}
            </div>
          </Html>
        );
      })}
    </>
  );
}
