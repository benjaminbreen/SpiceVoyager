import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '../store/gameStore';
import { getEffectiveRainIntensity } from '../store/weather';
import { createMoonDiskTexture, createSunDiskTexture, getClockSunDirection } from '../utils/celestial';

const SKY_DISTANCE = 480;
const SUN_SIZE = 46;
const MOON_SIZE = 30;

const _sunDir = new THREE.Vector3();
const _moonDir = new THREE.Vector3();

function weatherVisibility(): number {
  const state = useGameStore.getState();
  const rain = getEffectiveRainIntensity(state.weather, state.renderDebug.rain);
  const cloudFactor = state.weather.kind === 'cloudy' ? 0.42 : state.weather.kind === 'rain' ? 0.12 : 1;
  return cloudFactor * (1 - THREE.MathUtils.smoothstep(0.08, 0.75, rain));
}

export function CelestialBodies() {
  const sunRef = useRef<THREE.Sprite>(null);
  const moonRef = useRef<THREE.Sprite>(null);
  const sunMatRef = useRef<THREE.SpriteMaterial>(null);
  const moonMatRef = useRef<THREE.SpriteMaterial>(null);

  const sunTex = useMemo(() => createSunDiskTexture(), []);
  const moonTex = useMemo(() => createMoonDiskTexture(), []);

  useFrame(({ camera }) => {
    const state = useGameStore.getState();
    getClockSunDirection(state.timeOfDay, _sunDir);
    _moonDir.copy(_sunDir).multiplyScalar(-1);

    if (sunRef.current) {
      sunRef.current.position.copy(camera.position).addScaledVector(_sunDir, SKY_DISTANCE);
    }
    if (moonRef.current) {
      moonRef.current.position.copy(camera.position).addScaledVector(_moonDir, SKY_DISTANCE);
    }

    const weather = weatherVisibility();
    const sunOpacity = THREE.MathUtils.clamp((_sunDir.y + 0.02) * 3.2, 0, 1) * weather;
    const moonOpacity = THREE.MathUtils.clamp((_moonDir.y + 0.04) * 2.2, 0, 0.68) * Math.max(0.25, weather);

    if (sunMatRef.current) sunMatRef.current.opacity = sunOpacity;
    if (moonMatRef.current) moonMatRef.current.opacity = moonOpacity;
  });

  return (
    <>
      <sprite ref={sunRef} scale={[SUN_SIZE, SUN_SIZE, 1]} renderOrder={-900}>
        <spriteMaterial
          ref={sunMatRef}
          map={sunTex}
          transparent
          depthWrite={false}
          depthTest={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </sprite>
      <sprite ref={moonRef} scale={[MOON_SIZE, MOON_SIZE, 1]} renderOrder={-899}>
        <spriteMaterial
          ref={moonMatRef}
          map={moonTex}
          transparent
          depthWrite={false}
          depthTest={false}
          toneMapped={false}
        />
      </sprite>
    </>
  );
}
