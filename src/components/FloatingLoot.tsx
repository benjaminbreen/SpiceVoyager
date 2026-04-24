import { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { useGameStore } from '../store/gameStore';

export interface FloatingLoot {
  id: number;
  x: number;
  y: number;
  z: number;
  spawnTime: number;
  lines: string[];
}

const DURATION = 1.6;
const RISE = 1.5;
const events: FloatingLoot[] = [];
let nextId = 1;
let clock = 0;

export function spawnFloatingLoot(x: number, y: number, z: number, lines: string[]) {
  events.push({ id: nextId++, x, y, z, spawnTime: clock, lines });
}

export function FloatingLootSystem() {
  const [, setTick] = useState(0);
  const tickAccum = useRef(0);
  const enabled = useGameStore(s => s.renderDebug.animalMarkers);

  // Clear module-scope events on unmount so stale labels don't pop in after
  // a scene swap.
  useEffect(() => () => { events.length = 0; }, []);

  useFrame((_, delta) => {
    clock = _.clock.getElapsedTime();
    // Expire old events
    let expired = false;
    while (events.length > 0 && clock - events[0].spawnTime > DURATION) {
      events.shift();
      expired = true;
    }
    // Re-render at ~30Hz while any event is alive, or when an entry expired,
    // so Html nodes update position/opacity. Idle when nothing is visible.
    tickAccum.current += delta;
    if ((events.length > 0 && tickAccum.current > 1 / 30) || expired) {
      tickAccum.current = 0;
      setTick((n) => (n + 1) % 1_000_000);
    }
  });

  if (!enabled) return null;
  if (events.length === 0) return null;

  return (
    <>
      {events.map((ev) => {
        const t = Math.max(0, Math.min(1, (clock - ev.spawnTime) / DURATION));
        // Quick pop in, slow fade out
        const opacity = t < 0.1 ? t / 0.1 : 1 - (t - 0.1) / 0.9;
        const riseY = ev.y + t * RISE;
        const scale = t < 0.15 ? 0.6 + (t / 0.15) * 0.4 : 1.0;
        return (
          <Html
            key={ev.id}
            position={[ev.x, riseY + 0.5, ev.z]}
            center
            zIndexRange={[50, 0]}
            style={{ pointerEvents: 'none', userSelect: 'none' }}
          >
            <div
              style={{
                opacity,
                transform: `scale(${scale})`,
                transformOrigin: 'center',
                whiteSpace: 'nowrap',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                fontSize: '13px',
                fontWeight: 600,
                color: '#fde68a',
                textShadow: '0 0 6px rgba(0,0,0,0.85), 0 1px 2px rgba(0,0,0,0.9)',
                letterSpacing: '0.02em',
                textAlign: 'center',
                lineHeight: 1.2,
              }}
            >
              {ev.lines.map((line, i) => (
                <div key={i}>{line}</div>
              ))}
            </div>
          </Html>
        );
      })}
    </>
  );
}
