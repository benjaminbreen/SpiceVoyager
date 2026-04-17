import { useMemo, useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { getActivePlayerPos } from '../utils/livePlayerTransform';
import { useGameStore } from '../store/gameStore';
import { sfxBirdFlap } from '../audio/SoundEffects';
import type { SpeciesInfo } from './Grazers';

// ── Types ────────────────────────────────────────────────────────────────────
export interface WadingBirdEntry {
  position: [number, number, number];   // ground spawn
  rotation: number;                      // grounded facing
  color: [number, number, number];
  scale: number;
  speedMult: number;
  circleCenter: [number, number];        // flock orbit center (x,z)
  circleRadius: number;                  // this bird's orbit radius
  circlePhase: number;                   // initial angle around orbit (radians)
  maxAltitude: number;                   // flight apex height above spawn
}

interface FlightState { t: number; theta: number; }

// ── Constants ────────────────────────────────────────────────────────────────
const SCATTER_SQ = 30 * 30;        // spook farther than grazers
const TAKEOFF_RATE = 0.018;        // ~1s full takeoff
const LANDING_RATE = 0.008;        // ~2s descent
const CIRCLE_SPEED = 0.8;          // radians/sec while airborne
const ANIM_RANGE_SQ = 150 * 150;   // flying birds are visible from farther than ground animals

// ── Component ────────────────────────────────────────────────────────────────
export function WadingBirds({ data, shadowsActive, species }: { data: WadingBirdEntry[]; shadowsActive: boolean; species?: SpeciesInfo }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummyRef = useRef(new THREE.Object3D());
  const flightRef = useRef<FlightState[]>([]);
  const lastTimeRef = useRef(0);
  const airborneCountRef = useRef(0);
  const lastSfxRef = useRef(0);

  // Geometry: slim body + S-neck + head + pointed beak + 2 long legs + 2 flat wings
  const geometry = useMemo(() => {
    const body = new THREE.SphereGeometry(0.18, 6, 4);
    body.scale(1.6, 0.75, 0.9);
    // S-neck: two small spheres stepped up and forward
    const neck1 = new THREE.SphereGeometry(0.08, 4, 3);
    neck1.translate(0.2, 0.15, 0);
    const neck2 = new THREE.SphereGeometry(0.07, 4, 3);
    neck2.translate(0.28, 0.3, 0);
    const head = new THREE.SphereGeometry(0.09, 5, 3);
    head.translate(0.36, 0.42, 0);
    // Beak: thin forward cone
    const beak = new THREE.ConeGeometry(0.025, 0.18, 4);
    beak.rotateZ(-Math.PI / 2);
    beak.translate(0.5, 0.42, 0);
    // Legs: two tall thin cylinders
    const legL = new THREE.CylinderGeometry(0.02, 0.018, 0.55, 3);
    legL.translate(0.0, -0.45, 0.08);
    const legR = new THREE.CylinderGeometry(0.02, 0.018, 0.55, 3);
    legR.translate(0.0, -0.45, -0.08);
    // Wings: flat ellipsoids at sides, swept slightly back
    const wingL = new THREE.SphereGeometry(0.18, 5, 3);
    wingL.scale(1.4, 0.15, 0.7);
    wingL.translate(-0.05, 0.05, 0.22);
    const wingR = new THREE.SphereGeometry(0.18, 5, 3);
    wingR.scale(1.4, 0.15, 0.7);
    wingR.translate(-0.05, 0.05, -0.22);
    const parts = [body, neck1, neck2, head, beak, legL, legR, wingL, wingR];
    const merged = mergeGeometries(parts);
    parts.forEach(g => g.dispose());
    return merged ?? new THREE.BoxGeometry(0.5, 0.3, 0.3);
  }, []);

  const material = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.8,
    metalness: 0.0,
  }), []);

  useEffect(() => {
    flightRef.current = data.map(() => ({ t: 0, theta: 0 }));
    if (!meshRef.current) return;
    const dummy = dummyRef.current;
    const col = new THREE.Color();
    data.forEach((b, i) => {
      const s = b.scale;
      dummy.position.set(b.position[0], b.position[1], b.position[2]);
      dummy.scale.set(s, s, s);
      dummy.rotation.set(0, b.rotation, 0);
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);
      col.setRGB(b.color[0], b.color[1], b.color[2]);
      meshRef.current!.setColorAt(i, col);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
  }, [data]);

  useFrame(({ clock }) => {
    if (!meshRef.current || flightRef.current.length !== data.length) return;
    const time = clock.getElapsedTime();
    const dt = Math.min(0.1, time - lastTimeRef.current);
    lastTimeRef.current = time;
    const dummy = dummyRef.current;
    const playerPos = getActivePlayerPos();
    const px = playerPos[0];
    const pz = playerPos[2];
    let anyUpdated = false;
    const dtScale = dt * 60;
    let airborneNow = 0;

    data.forEach((b, i) => {
      const state = flightRef.current[i];
      const spawnX = b.position[0];
      const spawnZ = b.position[2];

      const toPlayerX = spawnX - px;
      const toPlayerZ = spawnZ - pz;
      const distSq = toPlayerX * toPlayerX + toPlayerZ * toPlayerZ;

      // Skip distant grounded birds entirely
      if (distSq > ANIM_RANGE_SQ && state.t < 0.01) return;
      anyUpdated = true;

      // Update flight progress
      if (distSq < SCATTER_SQ) {
        state.t = Math.min(1, state.t + TAKEOFF_RATE * b.speedMult * dtScale);
      } else {
        state.t = Math.max(0, state.t - LANDING_RATE * dtScale);
      }
      if (state.t > 0.05) airborneNow++;
      // Advance orbit angle whenever airborne
      if (state.t > 0.05) {
        state.theta += CIRCLE_SPEED * b.speedMult * dt;
      }

      // Smoothstep easing on flight progress
      const t = state.t;
      const s = t * t * (3 - 2 * t);

      // Airborne orbit position (around flock center)
      const airAngle = state.theta + b.circlePhase;
      const cosA = Math.cos(airAngle);
      const sinA = Math.sin(airAngle);
      const airX = b.circleCenter[0] + cosA * b.circleRadius;
      const airZ = b.circleCenter[1] + sinA * b.circleRadius;

      // Interpolate ground→air
      const x = spawnX + (airX - spawnX) * s;
      const z = spawnZ + (airZ - spawnZ) * s;
      // Slight idle neck bob when grounded; altitude rises with s
      const groundBob = (1 - s) * Math.sin(time * 1.6 + i * 1.3) * 0.02;
      const y = b.position[1] + groundBob + b.maxAltitude * s;

      // Facing: tangent to orbit when airborne, spawn rotation when grounded
      // Velocity vector at airAngle is (-sinA, cosA) → three.js Y rotation: -atan2(dz, dx)
      const airFacing = -Math.atan2(cosA, -sinA);
      const facing = s > 0.2 ? airFacing : b.rotation;

      const sc = b.scale;
      dummy.position.set(x, y, z);
      dummy.rotation.set(0, facing, 0);
      dummy.scale.set(sc, sc, sc);
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);
    });

    if (anyUpdated) meshRef.current.instanceMatrix.needsUpdate = true;

    // Scatter SFX: wing flap when the flock starts taking off
    if (airborneNow > airborneCountRef.current && airborneNow >= 2 && time - lastSfxRef.current > 1.2) {
      sfxBirdFlap();
      lastSfxRef.current = time;
    }
    airborneCountRef.current = airborneNow;
  });

  if (data.length === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, data.length]}
      castShadow={shadowsActive}
      receiveShadow={shadowsActive}
      frustumCulled={false}
      onPointerDown={(e) => {
        if (!species) return;
        e.stopPropagation();
        useGameStore.getState().addNotification(species.name, 'info', {
          size: 'grand',
          subtitle: `${species.latin} · ${species.info}`,
        });
      }}
      onPointerOver={() => { if (species) document.body.style.cursor = 'pointer'; }}
      onPointerOut={() => { document.body.style.cursor = ''; }}
    />
  );
}
