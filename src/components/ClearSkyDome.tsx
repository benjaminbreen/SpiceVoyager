import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '../store/gameStore';
import { resolveWaterPaletteId } from '../utils/waterPalettes';
import { computeDayMood, MOOD_OVERCAST_WARM_HEX } from '../utils/dayMood';

const SKY_DOME_VS = `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_DOME_FS = `
  uniform vec3 uZenithColor;
  uniform vec3 uHorizonColor;
  uniform vec3 uLowerColor;
  varying vec3 vDir;
  void main() {
    float skyT = smoothstep(-0.04, 0.82, vDir.y);
    float lowerT = smoothstep(-0.55, 0.18, vDir.y);
    vec3 sky = mix(uHorizonColor, uZenithColor, skyT);
    vec3 col = mix(uLowerColor, sky, lowerT);
    gl_FragColor = vec4(col, 1.0);
  }
`;

// Allocation-free lerp helpers — write into `target`, reuse `_lerpB` scratch.
const _lerpB = new THREE.Color();

function lerpColorHexInto(a: string, b: string, t: number, target: THREE.Color): void {
  target.set(a).lerp(_lerpB.set(b), THREE.MathUtils.clamp(t, 0, 1));
}

// Variant that takes a pre-set Color as the source — used when the source hex
// itself is mood-dependent and already lives in a scratch Color.
function lerpColorInto(src: THREE.Color, destHex: string, t: number, target: THREE.Color): void {
  target.copy(src).lerp(_lerpB.set(destHex), THREE.MathUtils.clamp(t, 0, 1));
}

export function ClearSkyDome() {
  const meshRef = useRef<THREE.Mesh>(null);
  const uniforms = useMemo(() => ({
    uZenithColor: { value: new THREE.Color('#0794f2') },
    uHorizonColor: { value: new THREE.Color('#55c6ff') },
    uLowerColor: { value: new THREE.Color('#7fcff4') },
  }), []);

  // Pre-allocated scratch colors — avoids `new THREE.Color()` every frame.
  const scratch = useMemo(() => ({
    zenith: new THREE.Color(),
    horizon: new THREE.Color(),
    lower: new THREE.Color(),
    warm: new THREE.Color(),
  }), []);

  useFrame(({ camera }) => {
    if (!meshRef.current) return;
    meshRef.current.position.copy(camera.position);

    const state = useGameStore.getState();
    const waterPaletteId = resolveWaterPaletteId(state);
    const mood = computeDayMood(state.timeOfDay, state.worldSeed);
    const angle = ((state.timeOfDay - 6) / 24) * Math.PI * 2;
    const sunH = Math.sin(angle);

    const { zenith, horizon, lower, warm } = scratch;
    // Mood-adjusted warm band: blend the saturated sunset orange toward an
    // overcast gray as warmth drops. warmth=1 → '#f0a36b', warmth=0 → overcast.
    warm.set(MOOD_OVERCAST_WARM_HEX).lerp(_lerpB.set('#f0a36b'), mood.warmth);

    if (sunH > 0.3) {
      if (waterPaletteId === 'monsoon') {
        zenith.set('#3d9fbb'); horizon.set('#75bfc9'); lower.set('#9acdcf');
      } else if (waterPaletteId === 'tropical') {
        zenith.set('#0289e8'); horizon.set('#50c7ff'); lower.set('#7ed5ff');
      } else if (waterPaletteId === 'temperate') {
        zenith.set('#6f8894'); horizon.set('#9fb4bc'); lower.set('#b5c3c8');
      } else {
        zenith.set('#158bd8'); horizon.set('#68c4f2'); lower.set('#94d6f4');
      }
    } else if (sunH > 0.0) {
      const t = sunH / 0.3;
      const dayZenith = waterPaletteId === 'temperate'
        ? '#6f8894'
        : waterPaletteId === 'monsoon'
        ? '#3d9fbb'
        : waterPaletteId === 'tropical'
        ? '#0289e8'
        : '#0693e3';
      const dayHorizon = waterPaletteId === 'temperate'
        ? '#9fb4bc'
        : waterPaletteId === 'monsoon'
        ? '#75bfc9'
        : waterPaletteId === 'tropical'
        ? '#50c7ff'
        : '#4ec2ee';
      lerpColorHexInto('#223a68', dayZenith, t, zenith);
      lerpColorInto(warm, dayHorizon, t, horizon);
      lerpColorInto(warm, dayHorizon, t, lower);
    } else if (sunH > -0.15) {
      const t = (sunH + 0.15) / 0.15;
      lerpColorHexInto('#101f42', '#223a68', t, zenith);
      // Deep-dusk side blends the night color up toward the mood-adjusted warm.
      horizon.set('#172747');
      horizon.lerp(warm, THREE.MathUtils.clamp(t, 0, 1));
      lower.copy(horizon);
    } else {
      zenith.set('#081833'); horizon.set('#102241'); lower.set('#102241');
    }

    uniforms.uZenithColor.value.copy(zenith);
    uniforms.uHorizonColor.value.copy(horizon);
    uniforms.uLowerColor.value.copy(lower);
  });

  return (
    <mesh ref={meshRef} raycast={() => null} renderOrder={-1000}>
      <sphereGeometry args={[5000, 48, 24]} />
      <shaderMaterial
        side={THREE.BackSide}
        depthWrite={false}
        depthTest={false}
        fog={false}
        uniforms={uniforms}
        vertexShader={SKY_DOME_VS}
        fragmentShader={SKY_DOME_FS}
      />
    </mesh>
  );
}
