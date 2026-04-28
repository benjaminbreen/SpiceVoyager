import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { useGameStore, Building, Port } from '../store/gameStore';
import { mouseWorldPos, mouseRay } from '../utils/combatState';
import { useWaterOverlayLayer } from '../utils/waterOverlayLayer';
import { getBuildingDamageStage, getBuildingDamageVersion } from '../utils/impactShakeState';

const HOVER_MIN_RADIUS = 4;
const HOVER_BUFFER = 1.6;
const CHECK_INTERVAL = 0.12;
const PORT_RANGE = 200;
const FADE_IN_SEC = 0.14;
const FADE_OUT_SEC = 0.22;

// Glow overlay: additive-blended box around the hovered building (kept from
// the previous implementation — the only 3D part of the tooltip).
const GLOW_COLOR = '#ffd89a';
const GLOW_MAX_OPACITY = 0.32;
const GLOW_X_PAD = 1.06;
const GLOW_Y_PAD = 1.35;
const GLOW_Z_PAD = 1.06;
const GLOW_PULSE_RATE = 2.4;
const GLOW_PULSE_AMP = 0.12;

const FONT_STACK = '"DM Sans", system-ui, -apple-system, sans-serif';

export function BuildingTooltip() {
  const ports = useGameStore(s => s.ports);
  const [displayed, setDisplayed] = useState<Building | null>(null);
  const [damageVersion, setDamageVersion] = useState(0);
  const detectedRef = useRef<Building | null>(null);
  const checkTimerRef = useRef(0);
  const opacityRef = useRef(0);
  const pulseRef = useRef(0);
  const damageVersionRef = useRef(getBuildingDamageVersion());
  const wrapperRef = useRef<HTMLDivElement>(null);
  const glowMeshRef = useRef<THREE.Mesh>(null);
  const glowMatRef = useRef<THREE.MeshBasicMaterial>(null);

  useWaterOverlayLayer(glowMeshRef);

  const damageStage = displayed ? getBuildingDamageStage(displayed.id) : 'intact';
  const eyebrow = damageStage === 'destroyed'
    ? 'DESTROYED'
    : damageStage === 'heavilyDamaged'
      ? 'HEAVILY DAMAGED'
      : damageStage === 'damaged'
        ? 'DAMAGED'
        : displayed?.labelEyebrow;
  const eyebrowColor = damageStage === 'destroyed'
    ? '#7b7b7b'
    : damageStage === 'heavilyDamaged'
      ? '#9b6d46'
      : damageStage === 'damaged'
        ? '#d18b4a'
        : displayed?.labelEyebrowColor ?? '#c4a1ff';

  // Recompute eyebrow text on damage changes via this dependency.
  useMemo(() => damageVersion, [damageVersion]);

  useFrame((_, delta) => {
    const latestDamageVersion = getBuildingDamageVersion();
    if (latestDamageVersion !== damageVersionRef.current) {
      damageVersionRef.current = latestDamageVersion;
      setDamageVersion(latestDamageVersion);
    }

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

    // Once fully faded out, swap to the new detection (or unmount).
    if (opacityRef.current <= 0.001 && active !== current) {
      setDisplayed(active);
    }

    // CSS opacity drives the label fade — no React re-renders needed.
    if (wrapperRef.current) {
      wrapperRef.current.style.opacity = String(opacityRef.current);
    }

    if (glowMatRef.current) {
      pulseRef.current += delta * GLOW_PULSE_RATE;
      const pulse = 1 + Math.sin(pulseRef.current) * GLOW_PULSE_AMP;
      glowMatRef.current.opacity = opacityRef.current * GLOW_MAX_OPACITY * pulse;
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
      <Html
        position={[displayed.position[0], tooltipY, displayed.position[2]]}
        center
        zIndexRange={[20, 0]}
        pointerEvents="none"
        // `transform={false}` (the default) projects the world position to the
        // screen and renders fixed CSS-pixel sized HTML there. Means text uses
        // native browser font rasterization at 1:1 pixels — pixel-perfect at
        // any zoom level. The wrapper opacity is driven by useFrame above.
      >
        <div
          ref={wrapperRef}
          style={{
            opacity: 0,
            pointerEvents: 'none',
            userSelect: 'none',
            fontFamily: FONT_STACK,
            // Wrapping the panel in a flex container lets us anchor it via
            // translate so its bottom edge sits at the world point — i.e. the
            // panel grows upward from the anchor instead of straddling it.
            display: 'flex',
            justifyContent: 'center',
            transform: 'translateY(-50%)',
            filter: 'drop-shadow(0 6px 14px rgba(0, 0, 0, 0.38))',
          }}
        >
          <div
            style={{
              position: 'relative',
              minWidth: 112,
              maxWidth: 264,
              padding: eyebrow ? '8px 16px 9px' : '7px 16px 8px',
              borderRadius: 7,
              background: 'linear-gradient(to bottom, rgba(255, 255, 255, 0.055) 0%, rgba(10, 14, 24, 0.72) 52%, rgba(8, 11, 18, 0.78) 100%)',
              border: '1px solid rgba(100, 116, 139, 0.34)',
              boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.04)',
              textAlign: 'center',
              whiteSpace: 'nowrap',
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
                opacity: 0.5,
                pointerEvents: 'none',
              }}
            />

            {eyebrow && (
              <div
                style={{
                  fontSize: 9,
                  fontWeight: 800,
                  letterSpacing: '0.16em',
                  textTransform: 'uppercase',
                  color: eyebrowColor,
                  textShadow: `0 0 8px ${eyebrowColor}80`,
                  marginBottom: 3,
                  lineHeight: 1,
                }}
              >
                {eyebrow}
              </div>
            )}

            <div
              style={{
                fontSize: displayed.labelSub ? 16 : 17,
                fontWeight: 700,
                color: 'rgba(248, 250, 252, 0.98)',
                lineHeight: 1.1,
                letterSpacing: '-0.005em',
                textShadow: '0 1px 2px rgba(2, 6, 10, 0.55)',
              }}
            >
              {displayed.label}
            </div>

            {displayed.labelSub && (
              <div
                style={{
                  fontSize: 10.5,
                  fontWeight: 500,
                  color: 'rgba(224, 231, 241, 0.78)',
                  letterSpacing: '0.02em',
                  marginTop: 2,
                  lineHeight: 1,
                }}
              >
                {displayed.labelSub}
              </div>
            )}
          </div>
        </div>
      </Html>
    </>
  );
}

function detectHoveredBuilding(ports: Port[]): Building | null {
  if (!mouseWorldPos.valid || !mouseRay.valid) return null;

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
      const score = distSq / effRadiusSq;
      if (score < bestScore) {
        bestScore = score;
        best = b;
      }
    }
  }
  return best;
}
