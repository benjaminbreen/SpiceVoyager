import { useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { useGameStore } from '../store/gameStore';

const SCALE_RADIUS: Record<string, number> = {
  Small: 12, Medium: 18, Large: 24, 'Very Large': 30,
};

// Generate a radial gradient texture once
function makeGlowTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,207,138,0.6)');
  grad.addColorStop(0.4, 'rgba(255,180,100,0.2)');
  grad.addColorStop(1, 'rgba(255,160,80,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

// ── Ground Glow ──
function PortGlow() {
  const ports = useGameStore((s) => s.ports);
  const discoveredPorts = useGameStore((s) => s.discoveredPorts);
  const timeOfDay = useGameStore((s) => s.timeOfDay);

  const texture = useMemo(makeGlowTexture, []);
  const geometry = useMemo(() => new THREE.CircleGeometry(1, 32), []);
  const material = useMemo(() => new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  }), [texture]);

  // Compute night factor for opacity
  const sunAngle = ((timeOfDay - 6) / 24) * Math.PI * 2;
  const sunH = Math.sin(sunAngle);
  const t = Math.max(0, Math.min(1, (0.1 - sunH) / 0.3));
  material.opacity = 0.06 + t * 0.22;

  const discovered = useMemo(
    () => ports.filter((p) => discoveredPorts.includes(p.id)),
    [ports, discoveredPorts],
  );

  return (
    <group>
      {discovered.map((port) => {
        const r = SCALE_RADIUS[port.scale] ?? 18;
        return (
          <mesh
            key={port.id}
            geometry={geometry}
            material={material}
            position={[port.position[0], 0.5, port.position[2]]}
            rotation={[-Math.PI / 2, 0, 0]}
            scale={[r, r, 1]}
          />
        );
      })}
    </group>
  );
}

// ── Floating Labels ──
const LABEL_SHOW = 80;
const LABEL_FULL = 40;
const LABEL_NEAR = 20;

function PortLabels() {
  const ports = useGameStore((s) => s.ports);
  const discoveredPorts = useGameStore((s) => s.discoveredPorts);
  const activePort = useGameStore((s) => s.activePort);
  const [visible, setVisible] = useState<Map<string, { dist: number }>>(new Map());

  const counterRef = useRef(0);
  useFrame((_, delta) => {
    counterRef.current += delta;
    if (counterRef.current < 0.2) return;
    counterRef.current = 0;

    const { playerPos } = useGameStore.getState();
    const next = new Map<string, { dist: number }>();
    for (const port of ports) {
      if (!discoveredPorts.includes(port.id)) continue;
      const dx = playerPos[0] - port.position[0];
      const dz = playerPos[2] - port.position[2];
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < LABEL_SHOW) {
        next.set(port.id, { dist });
      }
    }
    setVisible(next);
  });

  if (activePort) return null;

  const discovered = ports.filter((p) => discoveredPorts.includes(p.id));

  return (
    <>
      {discovered.map((port) => {
        const entry = visible.get(port.id);
        if (!entry) return null;
        return <PortLabel key={port.id} port={port} dist={entry.dist} />;
      })}
    </>
  );
}

function PortLabel({
  port,
  dist,
}: {
  port: { id: string; name: string; position: [number, number, number] };
  dist: number;
}) {
  const opacity = dist > LABEL_FULL ? (LABEL_SHOW - dist) / (LABEL_SHOW - LABEL_FULL) : 1;
  const isNear = dist < LABEL_NEAR;

  return (
    <Html
      position={[port.position[0], 8, port.position[2]]}
      center
      sprite
      style={{ pointerEvents: 'none', opacity, transition: 'opacity 0.3s' }}
    >
      <div className="select-none text-center whitespace-nowrap">
        <div
          className={`font-bold tracking-[0.15em] uppercase ${isNear ? 'text-[11px] text-slate-200' : 'text-[10px] text-slate-400'}`}
          style={{
            fontFamily: '"DM Sans", sans-serif',
            textShadow: '0 1px 6px rgba(0,0,0,0.9), 0 0 12px rgba(0,0,0,0.6)',
          }}
        >
          {port.name}
        </div>
        {isNear && (
          <div
            className="text-[8px] tracking-[0.12em] uppercase text-slate-500 mt-0.5"
            style={{
              fontFamily: '"DM Sans", sans-serif',
              textShadow: '0 1px 4px rgba(0,0,0,0.9)',
            }}
          >
            Enter Port
          </div>
        )}
      </div>
    </Html>
  );
}

// ── Combined Export ──
export function PortIndicators() {
  return (
    <>
      <PortGlow />
      <PortLabels />
    </>
  );
}
