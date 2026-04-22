import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore, Building, Port } from '../store/gameStore';
import { mouseWorldPos, mouseRay } from '../utils/combatState';
import { createWorldLabelTexture, worldHeightForScreenPixels } from '../utils/worldLabelTextures';
import { useWaterOverlayLayer } from '../utils/waterOverlayLayer';

const HOVER_MIN_RADIUS = 4;
const HOVER_BUFFER = 1.6;
const CHECK_INTERVAL = 0.12;
const PORT_RANGE = 80;
const FADE_IN_SEC = 0.14;
const FADE_OUT_SEC = 0.22;

const BASE_WORLD_HEIGHT = 4.1;
const MAX_WORLD_HEIGHT = 26;
const MIN_READABLE_SCREEN_PX = 78;

// Glow overlay: additive-blended box around the hovered building
const GLOW_COLOR = '#ffd89a';
const GLOW_MAX_OPACITY = 0.32;
const GLOW_X_PAD = 1.06;
const GLOW_Y_PAD = 1.35; // taller than building so roofs/towers stay within
const GLOW_Z_PAD = 1.06;
const GLOW_PULSE_RATE = 2.4;  // radians/sec
const GLOW_PULSE_AMP = 0.12;  // fraction of max opacity

export function BuildingTooltip() {
  const ports = useGameStore(s => s.ports);
  const { camera, size } = useThree();
  const [displayed, setDisplayed] = useState<Building | null>(null);
  const detectedRef = useRef<Building | null>(null);
  const checkTimerRef = useRef(0);
  const opacityRef = useRef(0);
  const pulseRef = useRef(0);
  const materialRef = useRef<THREE.SpriteMaterial>(null);
  const spriteRef = useRef<THREE.Sprite>(null);
  const glowMeshRef = useRef<THREE.Mesh>(null);
  const glowMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const positionRef = useMemo(() => new THREE.Vector3(), []);

  // Keep both sprite and glow out of water reflections
  useWaterOverlayLayer(spriteRef);
  useWaterOverlayLayer(glowMeshRef);

  const label = useMemo(() => createWorldLabelTexture({
    title: displayed?.label ?? '',
    subtitle: displayed?.labelSub,
    eyebrow: displayed?.labelEyebrow,
    eyebrowColor: displayed?.labelEyebrowColor,
    accent: '#c9a84c',
    variant: 'building',
  }), [displayed?.label, displayed?.labelSub, displayed?.labelEyebrow, displayed?.labelEyebrowColor]);

  useEffect(() => () => label.texture.dispose(), [label]);

  useFrame((_, delta) => {
    checkTimerRef.current += delta;
    if (checkTimerRef.current >= CHECK_INTERVAL) {
      checkTimerRef.current = 0;
      detectedRef.current = detectHoveredBuilding(ports);
    }

    const active = detectedRef.current;
    const current = displayed;
    const sameBuilding = !!active && !!current && active.id === current.id;
    const target = sameBuilding ? 1 : 0;

    const rate = target > opacityRef.current ? 1 / FADE_IN_SEC : 1 / FADE_OUT_SEC;
    const step = delta * rate;
    if (opacityRef.current < target) {
      opacityRef.current = Math.min(target, opacityRef.current + step);
    } else if (opacityRef.current > target) {
      opacityRef.current = Math.max(target, opacityRef.current - step);
    }

    // Once fully faded out, swap to the new detection (or unmount)
    if (opacityRef.current <= 0.001 && active !== current) {
      setDisplayed(active);
    }

    if (materialRef.current) {
      materialRef.current.opacity = opacityRef.current;
    }

    if (glowMatRef.current) {
      pulseRef.current += delta * GLOW_PULSE_RATE;
      const pulse = 1 + Math.sin(pulseRef.current) * GLOW_PULSE_AMP;
      glowMatRef.current.opacity = opacityRef.current * GLOW_MAX_OPACITY * pulse;
    }

    // Clamp world-size so the sprite stays readable when zoomed out
    const sprite = spriteRef.current;
    if (sprite && current) {
      positionRef.set(
        current.position[0],
        current.position[1] + current.scale[1] + 2.5,
        current.position[2],
      );
      const minReadable = worldHeightForScreenPixels(
        camera,
        size.height,
        positionRef,
        MIN_READABLE_SCREEN_PX,
      );
      const worldHeight = THREE.MathUtils.clamp(
        Math.max(BASE_WORLD_HEIGHT, minReadable),
        BASE_WORLD_HEIGHT,
        MAX_WORLD_HEIGHT,
      );
      sprite.scale.set(worldHeight * label.aspect, worldHeight, 1);
    }
  });

  if (!displayed || !displayed.label) return null;

  const tooltipY = displayed.position[1] + displayed.scale[1] + 2.5;
  const glowY = displayed.position[1] + displayed.scale[1] * 0.55;

  return (
    <>
      <mesh
        ref={glowMeshRef}
        position={[displayed.position[0], glowY, displayed.position[2]]}
        rotation={[0, displayed.rotation, 0]}
        scale={[
          displayed.scale[0] * GLOW_X_PAD,
          displayed.scale[1] * GLOW_Y_PAD,
          displayed.scale[2] * GLOW_Z_PAD,
        ]}
        renderOrder={998}
        raycast={() => null}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial
          ref={glowMatRef}
          color={GLOW_COLOR}
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <sprite
        ref={spriteRef}
        position={[displayed.position[0], tooltipY, displayed.position[2]]}
        scale={[BASE_WORLD_HEIGHT * label.aspect, BASE_WORLD_HEIGHT, 1]}
        renderOrder={1001}
        raycast={() => null}
      >
        <spriteMaterial
          ref={materialRef}
          map={label.texture}
          transparent
          opacity={0}
          depthTest={false}
          depthWrite={false}
          toneMapped={false}
        />
      </sprite>
    </>
  );
}

function detectHoveredBuilding(ports: Port[]): Building | null {
  if (!mouseWorldPos.valid || !mouseRay.valid) return null;

  // Closest port via water-plane hit (ports sit near sea level — this is fine)
  const wx = mouseWorldPos.x;
  const wz = mouseWorldPos.z;
  let nearPort: Port | null = null;
  let nearPortDistSq = PORT_RANGE * PORT_RANGE;
  for (const p of ports) {
    const dx = p.position[0] - wx;
    const dz = p.position[2] - wz;
    const d = dx * dx + dz * dz;
    if (d < nearPortDistSq) {
      nearPortDistSq = d;
      nearPort = p;
    }
  }
  if (!nearPort) return null;

  // For buildings, project the mouse ray to each one's own mid-height so the
  // cursor lines up with the roof the player actually sees, not the water
  // plane behind it.
  const ox = mouseRay.origin.x;
  const oy = mouseRay.origin.y;
  const oz = mouseRay.origin.z;
  const dx = mouseRay.direction.x;
  const dy = mouseRay.direction.y;
  const dz = mouseRay.direction.z;
  if (Math.abs(dy) < 1e-5) return null;

  let best: Building | null = null;
  let bestScore = Infinity;
  for (const b of nearPort.buildings) {
    if (!b.label) continue;
    const planeY = b.position[1] + b.scale[1] * 0.5;
    const t = (planeY - oy) / dy;
    if (t <= 0) continue;
    const hx = ox + dx * t;
    const hz = oz + dz * t;
    const ddx = b.position[0] - hx;
    const ddz = b.position[2] - hz;
    const distSq = ddx * ddx + ddz * ddz;
    const halfFootprint = Math.max(b.scale[0], b.scale[2]) * 0.5;
    const effRadius = Math.max(HOVER_MIN_RADIUS, halfFootprint + HOVER_BUFFER);
    const effRadiusSq = effRadius * effRadius;
    if (distSq < effRadiusSq) {
      // Rank by how "deep" the cursor sits inside the hover zone, so small
      // buildings overlapping a big one still win when you point at them.
      const score = distSq / effRadiusSq;
      if (score < bestScore) {
        bestScore = score;
        best = b;
      }
    }
  }
  return best;
}
