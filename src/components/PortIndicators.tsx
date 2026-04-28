import { useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { useGameStore, PORT_FACTION, type Port } from '../store/gameStore';
import { getLiveShipTransform } from '../utils/livePlayerTransform';
import { FactionFlag } from './FactionFlag';

const SCALE_RADIUS: Record<string, number> = {
  Small: 12, Medium: 18, Large: 24, 'Very Large': 30, Huge: 38,
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

  const texture = useMemo(makeGlowTexture, []);
  const geometry = useMemo(() => new THREE.CircleGeometry(1, 32), []);
  const material = useMemo(() => new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    opacity: 0.06,
  }), [texture]);

  // Mutate opacity in useFrame — no React render needed. Subscribing to
  // timeOfDay would re-render every 200ms and flush all PortGlow meshes.
  useFrame(() => {
    const timeOfDay = useGameStore.getState().timeOfDay;
    const sunH = Math.sin(((timeOfDay - 6) / 24) * Math.PI * 2);
    const t = Math.max(0, Math.min(1, (0.1 - sunH) / 0.3));
    material.opacity = 0.06 + t * 0.22;
  });

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
const LABEL_SHOW = 80;   // start fading in
const LABEL_FULL = 40;   // fully opaque + show subtitle
const LABEL_NEAR = 20;   // closer styling cue
const LABEL_Y = 10.4;    // height above sea level

const FONT_STACK = '"DM Sans", system-ui, -apple-system, sans-serif';

function PortLabels() {
  const ports = useGameStore((s) => s.ports);
  const discoveredPorts = useGameStore((s) => s.discoveredPorts);
  const activePort = useGameStore((s) => s.activePort);
  const [visible, setVisible] = useState<Map<string, { dist: number }>>(new Map());

  const counterRef = useRef(0);
  useFrame((_, delta) => {
    counterRef.current += delta;
    if (counterRef.current < 0.25) return;
    counterRef.current = 0;

    const playerPos = getLiveShipTransform().pos;
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
  port: Port;
  dist: number;
}) {
  const playerMode = useGameStore((s) => s.playerMode);
  const setActivePort = useGameStore((s) => s.setActivePort);

  const fade = dist > LABEL_FULL ? (LABEL_SHOW - dist) / (LABEL_SHOW - LABEL_FULL) : 1;
  const isFar = dist >= LABEL_FULL;
  const isNear = dist < LABEL_NEAR;
  const opacity = isFar ? Math.max(0.58, fade) : fade;
  const showSubtitle = !isFar;
  const faction = PORT_FACTION[port.id];
  const clickable = playerMode === 'ship';

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!clickable) return;
    setActivePort(port);
  };

  return (
    <Html
      position={[port.position[0], LABEL_Y, port.position[2]]}
      center
      zIndexRange={[15, 0]}
      pointerEvents={clickable ? 'auto' : 'none'}
    >
      <div
        style={{
          opacity,
          transition: 'opacity 0.28s ease-out',
          pointerEvents: 'none',
          userSelect: 'none',
          fontFamily: FONT_STACK,
          display: 'flex',
          justifyContent: 'center',
          transform: 'translateY(-50%)',
          filter: 'drop-shadow(0 6px 14px rgba(0, 0, 0, 0.42))',
        }}
      >
        <div
          onClick={clickable ? handleClick : undefined}
          style={{
            position: 'relative',
            minWidth: 130,
            padding: showSubtitle ? '8px 14px 9px' : '6px 14px 7px',
            borderRadius: 7,
            background: 'linear-gradient(to bottom, rgba(255, 255, 255, 0.06) 0%, rgba(10, 14, 24, 0.74) 52%, rgba(8, 11, 18, 0.82) 100%)',
            border: '1px solid rgba(100, 116, 139, 0.36)',
            boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05)',
            textAlign: 'center',
            whiteSpace: 'nowrap',
            pointerEvents: clickable ? 'auto' : 'none',
            cursor: clickable ? 'pointer' : 'default',
          }}
        >
          {/* Gold hairline along the top edge */}
          <div
            style={{
              position: 'absolute',
              top: 1,
              left: 14,
              right: 14,
              height: 1,
              background: '#c9a84c',
              opacity: 0.55,
              pointerEvents: 'none',
            }}
          />

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            {faction && <FactionFlag nationality={faction} size={isNear ? 18 : 16} />}
            <div
              style={{
                fontSize: isNear ? 19 : 17,
                fontWeight: 700,
                color: 'rgba(248, 250, 252, 0.98)',
                lineHeight: 1.1,
                letterSpacing: '-0.005em',
                textShadow: '0 1px 2px rgba(2, 6, 10, 0.55)',
              }}
            >
              {port.name}
            </div>
          </div>

          {showSubtitle && (
            <div
              style={{
                fontSize: 10.5,
                fontWeight: 500,
                color: 'rgba(224, 231, 241, 0.78)',
                letterSpacing: '0.04em',
                marginTop: 3,
                lineHeight: 1,
              }}
            >
              {port.scale} harbor
            </div>
          )}
        </div>
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
