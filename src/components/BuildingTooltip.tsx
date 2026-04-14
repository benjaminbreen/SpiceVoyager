import { useState, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { useGameStore, Building, Port } from '../store/gameStore';
import { mouseWorldPos } from '../utils/combatState';

const HOVER_RADIUS = 4; // world units — how close the cursor must be
const CHECK_INTERVAL = 0.08; // seconds between spatial lookups
const PORT_RANGE = 80; // only check buildings if mouse is within this range of a port

export function BuildingTooltip() {
  const ports = useGameStore(s => s.ports);
  const [hovered, setHovered] = useState<Building | null>(null);
  const timerRef = useRef(0);
  const prevIdRef = useRef<string | null>(null);

  useFrame((_, delta) => {
    timerRef.current += delta;
    if (timerRef.current < CHECK_INTERVAL) return;
    timerRef.current = 0;

    if (!mouseWorldPos.valid) {
      if (prevIdRef.current !== null) {
        prevIdRef.current = null;
        setHovered(null);
      }
      return;
    }

    const mx = mouseWorldPos.x;
    const mz = mouseWorldPos.z;

    // Find which port (if any) the mouse is near
    let nearPort: Port | null = null;
    for (const p of ports) {
      const dx = p.position[0] - mx;
      const dz = p.position[2] - mz;
      if (dx * dx + dz * dz < PORT_RANGE * PORT_RANGE) {
        nearPort = p;
        break;
      }
    }

    if (!nearPort) {
      if (prevIdRef.current !== null) {
        prevIdRef.current = null;
        setHovered(null);
      }
      return;
    }

    let closest: Building | null = null;
    let closestDist = HOVER_RADIUS;

    for (const b of nearPort.buildings) {
      if (!b.label) continue; // skip roads and unlabeled
      const dx = b.position[0] - mx;
      const dz = b.position[2] - mz;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < closestDist) {
        closestDist = dist;
        closest = b;
      }
    }

    const newId = closest?.id ?? null;
    if (newId !== prevIdRef.current) {
      prevIdRef.current = newId;
      setHovered(closest);
    }
  });

  if (!hovered || !hovered.label) return null;

  // Position tooltip above the building's roof
  const tooltipY = hovered.position[1] + hovered.scale[1] + 2.5;

  return (
    <Html
      position={[hovered.position[0], tooltipY, hovered.position[2]]}
      center
      sprite
      zIndexRange={[20, 0]}
      style={{
        pointerEvents: 'none',
        transition: 'opacity 0.2s ease',
      }}
    >
      <div
        style={{
          background: 'rgba(12, 10, 8, 0.88)',
          border: '1px solid rgba(180, 150, 90, 0.35)',
          borderRadius: '3px',
          padding: '5px 10px',
          textAlign: 'center',
          whiteSpace: 'nowrap',
          fontFamily: '"DM Sans", "Segoe UI", sans-serif',
          maxWidth: '220px',
        }}
      >
        <div
          style={{
            fontSize: '10px',
            fontWeight: 600,
            letterSpacing: '0.06em',
            color: 'rgba(235, 225, 205, 0.95)',
            lineHeight: 1.3,
          }}
        >
          {hovered.label}
        </div>
        {hovered.labelSub && (
          <div
            style={{
              fontSize: '8px',
              letterSpacing: '0.1em',
              color: 'rgba(180, 155, 100, 0.7)',
              textTransform: 'uppercase',
              marginTop: '2px',
            }}
          >
            {hovered.labelSub}
          </div>
        )}
      </div>
    </Html>
  );
}
