import { useMemo, useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { getActivePlayerPos } from '../utils/livePlayerTransform';
import { getTerrainHeight } from '../utils/terrain';
import { useGameStore } from '../store/gameStore';
import { sfxReptileScrabble } from '../audio/SoundEffects';
import type { SpeciesInfo } from './Grazers';

// ── Types ────────────────────────────────────────────────────────────────────
export interface ReptileEntry {
  position: [number, number, number];
  rotation: number;
  color: [number, number, number];
  scale: number;
  speedMult: number;
  bodyLength: number; // stretch factor — crocodiles are long, iguanas are shorter
}

interface ReptileOffset { dx: number; dz: number; }

// ── Constants ────────────────────────────────────────────────────────────────
const SCATTER_SQ = 18 * 18;        // reptiles let you get closer than grazers
const FLEE_SPEED = 0.08;           // slow waddle
const RETURN_DECAY = 0.995;        // barely drift back — they hold ground
const MAX_FLEE_DIST = 14;
const MAX_FLEE_SQ = MAX_FLEE_DIST * MAX_FLEE_DIST;
const ANIM_RANGE_SQ = 120 * 120;

// ── Component ────────────────────────────────────────────────────────────────
export function Reptiles({ data, shadowsActive, species }: { data: ReptileEntry[]; shadowsActive: boolean; species?: SpeciesInfo }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummyRef = useRef(new THREE.Object3D());
  const offsetsRef = useRef<ReptileOffset[]>([]);
  const lastTimeRef = useRef(0);
  const fleeingCountRef = useRef(0);
  const lastSfxRef = useRef(0);

  // Geometry: low elongated body + tapered snout + 4 splayed stubby legs + segmented long tail
  const geometry = useMemo(() => {
    const body = new THREE.SphereGeometry(0.22, 6, 4);
    body.scale(2.0, 0.5, 0.8); // long and flat
    const snout = new THREE.SphereGeometry(0.13, 5, 3);
    snout.scale(1.3, 0.7, 0.8);
    snout.translate(0.5, -0.03, 0);
    // Tail in 3 tapering segments curving slightly
    const tail1 = new THREE.SphereGeometry(0.15, 5, 3);
    tail1.scale(1.6, 0.5, 0.75);
    tail1.translate(-0.48, -0.02, 0);
    const tail2 = new THREE.SphereGeometry(0.1, 5, 3);
    tail2.scale(1.8, 0.45, 0.6);
    tail2.translate(-0.78, -0.01, 0);
    const tail3 = new THREE.SphereGeometry(0.06, 5, 3);
    tail3.scale(2.0, 0.4, 0.5);
    tail3.translate(-1.02, 0.0, 0);
    // Legs — splayed outward, short stubby cylinders
    const legFL = new THREE.CylinderGeometry(0.04, 0.035, 0.22, 3);
    legFL.rotateZ(0.35); // splay out
    legFL.translate(0.22, -0.2, 0.18);
    const legFR = new THREE.CylinderGeometry(0.04, 0.035, 0.22, 3);
    legFR.rotateZ(-0.35);
    legFR.translate(0.22, -0.2, -0.18);
    const legBL = new THREE.CylinderGeometry(0.04, 0.035, 0.22, 3);
    legBL.rotateZ(0.35);
    legBL.translate(-0.22, -0.2, 0.18);
    const legBR = new THREE.CylinderGeometry(0.04, 0.035, 0.22, 3);
    legBR.rotateZ(-0.35);
    legBR.translate(-0.22, -0.2, -0.18);
    const parts = [body, snout, tail1, tail2, tail3, legFL, legFR, legBL, legBR];
    const merged = mergeGeometries(parts);
    parts.forEach(g => g.dispose());
    return merged ?? new THREE.BoxGeometry(0.5, 0.2, 0.3);
  }, []);

  const material = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.7,
    metalness: 0.0,
  }), []);

  useEffect(() => {
    offsetsRef.current = data.map(() => ({ dx: 0, dz: 0 }));
    if (!meshRef.current) return;
    const dummy = dummyRef.current;
    const col = new THREE.Color();
    data.forEach((r, i) => {
      const s = r.scale;
      dummy.position.set(r.position[0], r.position[1], r.position[2]);
      dummy.scale.set(s * r.bodyLength, s, s);
      dummy.rotation.set(0, r.rotation, 0);
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);
      col.setRGB(r.color[0], r.color[1], r.color[2]);
      meshRef.current!.setColorAt(i, col);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
  }, [data]);

  useFrame(({ clock }) => {
    if (!meshRef.current || offsetsRef.current.length !== data.length) return;
    const time = clock.getElapsedTime();
    const dt = Math.min(0.1, time - lastTimeRef.current);
    lastTimeRef.current = time;
    const dtScale = dt * 60;
    const decay = Math.pow(RETURN_DECAY, dtScale);
    const dummy = dummyRef.current;
    const playerPos = getActivePlayerPos();
    const px = playerPos[0];
    const pz = playerPos[2];
    let anyUpdated = false;
    let fleeingNow = 0;

    data.forEach((r, i) => {
      const spawnX = r.position[0];
      const spawnZ = r.position[2];
      const off = offsetsRef.current[i];
      const curX = spawnX + off.dx;
      const curZ = spawnZ + off.dz;

      const toPlayerX = curX - px;
      const toPlayerZ = curZ - pz;
      const distSq = toPlayerX * toPlayerX + toPlayerZ * toPlayerZ;

      if (distSq > ANIM_RANGE_SQ && off.dx * off.dx + off.dz * off.dz < 1) return;
      anyUpdated = true;

      if (distSq < SCATTER_SQ) {
        fleeingNow++;
        const dist = Math.sqrt(distSq) || 1;
        off.dx += (toPlayerX / dist) * FLEE_SPEED * r.speedMult * dtScale;
        off.dz += (toPlayerZ / dist) * FLEE_SPEED * r.speedMult * dtScale;
      } else {
        off.dx *= decay;
        off.dz *= decay;
      }

      const fleeDistSq = off.dx * off.dx + off.dz * off.dz;
      if (fleeDistSq > MAX_FLEE_SQ) {
        const clamp = MAX_FLEE_DIST / Math.sqrt(fleeDistSq);
        off.dx *= clamp;
        off.dz *= clamp;
      }

      const s = r.scale;
      const finalX = spawnX + off.dx;
      const finalZ = spawnZ + off.dz;
      const isFleeing = distSq < SCATTER_SQ * 2;
      // Waddle: side-to-side yaw wiggle while moving; nearly still when idle
      const wiggle = isFleeing ? Math.sin(time * 6 + i * 1.3) * 0.18 : Math.sin(time * 0.5 + i * 0.7) * 0.02;

      const displaced = off.dx !== 0 || off.dz !== 0;
      const baseY = displaced ? getTerrainHeight(finalX, finalZ) + 0.05 : r.position[1];
      dummy.position.set(finalX, baseY, finalZ);
      const baseFacing = isFleeing && fleeDistSq > 0.5
        ? -Math.atan2(off.dz, off.dx)
        : r.rotation;
      dummy.rotation.set(0, baseFacing + wiggle, 0);
      dummy.scale.set(s * r.bodyLength, s, s);
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);
    });

    if (anyUpdated) meshRef.current.instanceMatrix.needsUpdate = true;

    if (fleeingNow > fleeingCountRef.current && time - lastSfxRef.current > 1.0) {
      sfxReptileScrabble();
      lastSfxRef.current = time;
    }
    fleeingCountRef.current = fleeingNow;
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
