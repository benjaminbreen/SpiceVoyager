import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore, type Port } from '../store/gameStore';
import { getLiveShipTransform } from '../utils/livePlayerTransform';
import { createWorldLabelTexture, worldHeightForScreenPixels } from '../utils/worldLabelTextures';
import { useWaterOverlayLayer } from '../utils/waterOverlayLayer';

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
const LABEL_SHOW = 80;
const LABEL_FULL = 40;
const LABEL_NEAR = 20;
const LABEL_Y = 10.4;
const LABEL_ACCENT = '#c9a84c';
type LabelMode = 'far' | 'mid' | 'near';

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
  const spriteRef = useRef<THREE.Sprite>(null);
  useWaterOverlayLayer(spriteRef);
  const { camera, size } = useThree();
  const opacity = dist > LABEL_FULL ? (LABEL_SHOW - dist) / (LABEL_SHOW - LABEL_FULL) : 1;
  const labelMode: LabelMode = dist < LABEL_NEAR ? 'near' : dist < LABEL_FULL ? 'mid' : 'far';
  const label = useMemo(() => createWorldLabelTexture({
    title: port.name,
    subtitle: labelMode === 'far' ? undefined : `${port.scale} harbor`,
    accent: LABEL_ACCENT,
    variant: labelMode,
  }), [labelMode, port.name, port.scale]);
  const labelPosition = useMemo(
    () => new THREE.Vector3(port.position[0], LABEL_Y, port.position[2]),
    [port.position],
  );
  const baseWorldHeight = labelMode === 'near' ? 10.8 : labelMode === 'mid' ? 9.4 : 8.6;
  const minReadableScreenHeight = labelMode === 'near' ? 74 : labelMode === 'mid' ? 60 : 46;
  const maxReadableScreenHeight = labelMode === 'near' ? 170 : labelMode === 'mid' ? 135 : 105;
  const maxWorldHeight = labelMode === 'near' ? 26 : labelMode === 'mid' ? 23 : 20;
  const labelOpacity = labelMode === 'far' ? Math.max(0.58, opacity) : opacity;

  useFrame(() => {
    const sprite = spriteRef.current;
    if (!sprite) return;

    const minReadableWorldHeight = worldHeightForScreenPixels(
      camera,
      size.height,
      labelPosition,
      minReadableScreenHeight,
    );
    const maxReadableWorldHeight = worldHeightForScreenPixels(
      camera,
      size.height,
      labelPosition,
      maxReadableScreenHeight,
    );
    const desired = Math.max(baseWorldHeight, minReadableWorldHeight);
    const upperBound = Math.min(maxWorldHeight, maxReadableWorldHeight);
    const worldHeight = Math.min(desired, upperBound);
    sprite.scale.set(worldHeight * label.aspect, worldHeight, 1);
  });

  useEffect(() => () => label.texture.dispose(), [label]);

  return (
    <sprite
      ref={spriteRef}
      position={[port.position[0], LABEL_Y, port.position[2]]}
      scale={[baseWorldHeight * label.aspect, baseWorldHeight, 1]}
      renderOrder={1000}
      raycast={() => null}
    >
      <spriteMaterial
        map={label.texture}
        transparent
        opacity={labelOpacity}
        depthTest={false}
        depthWrite={false}
        toneMapped={false}
      />
    </sprite>
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
