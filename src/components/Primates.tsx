import { useMemo, useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { getActivePlayerPos } from '../utils/livePlayerTransform';
import { getTerrainHeight } from '../utils/terrain';
import { useGameStore } from '../store/gameStore';
import { sfxPrimateChatter } from '../audio/SoundEffects';
import type { SpeciesInfo } from './Grazers';

// ── Types ────────────────────────────────────────────────────────────────────
export interface PrimateEntry {
  position: [number, number, number];
  rotation: number;
  color: [number, number, number];
  scale: number;
  speedMult: number;
  refuge: [number, number]; // x,z of nearest tree — flee target
}

interface PrimateOffset {
  dx: number; dz: number;          // flee offset
  wDx: number; wDz: number;        // idle wander offset
  wDirX: number; wDirZ: number;
  wFacing: number;
  wNextChange: number;
}

// ── Constants ────────────────────────────────────────────────────────────────
const SCATTER_SQ = 17 * 17;       // a touch larger than grazers — primates spook slightly earlier
// Base 6.6 u/s; with speedMult 0.7–1.3 peaks ~8.6 u/s — player (10 u/s) can always catch up.
const FLEE_SPEED = 0.11;
const RETURN_DECAY = 0.992;        // slower decay than grazers — primates linger near refuge
const MAX_FLEE_DIST = 18;          // smaller — they hide at trees, don't bolt across the map
const MAX_FLEE_SQ = MAX_FLEE_DIST * MAX_FLEE_DIST;
const ANIM_RANGE_SQ = 120 * 120;
const Y_OFFSET = 0.15;
// Wander: primates fidget more than grazers but over a smaller radius (stay near refuge)
const WANDER_MAX = 2.5;
const WANDER_MAX_SQ = WANDER_MAX * WANDER_MAX;
const WANDER_BASE_SPEED = 0.55;
const WANDER_WALK_PROB = 0.55;     // more pauses — primates sit and groom

// ── Component ────────────────────────────────────────────────────────────────
export function Primates({ data, shadowsActive, species }: { data: PrimateEntry[]; shadowsActive: boolean; species?: SpeciesInfo }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummyRef = useRef(new THREE.Object3D());
  const offsetsRef = useRef<PrimateOffset[]>([]);
  const lastTimeRef = useRef(0);
  const fleeingCountRef = useRef(0);
  const lastSfxRef = useRef(0);

  // Geometry: upright crouched body + round head + long curved tail + 4 short limbs
  const geometry = useMemo(() => {
    const body = new THREE.SphereGeometry(0.22, 6, 4);
    body.scale(1.1, 0.9, 0.7);
    body.translate(0, -0.05, 0);
    const head = new THREE.SphereGeometry(0.13, 5, 4);
    head.translate(0.22, 0.18, 0);
    // long curved tail — three short cylinders sweeping back and up
    const tail1 = new THREE.CylinderGeometry(0.025, 0.03, 0.18, 3);
    tail1.rotateZ(Math.PI / 2);
    tail1.translate(-0.28, 0.0, 0);
    const tail2 = new THREE.CylinderGeometry(0.02, 0.025, 0.18, 3);
    tail2.rotateZ(Math.PI / 2.5);
    tail2.translate(-0.42, 0.08, 0);
    const tail3 = new THREE.CylinderGeometry(0.015, 0.02, 0.16, 3);
    tail3.rotateZ(Math.PI / 3);
    tail3.translate(-0.52, 0.2, 0);
    // limbs — short stubby
    const armL = new THREE.CylinderGeometry(0.028, 0.025, 0.22, 3);
    armL.translate(0.12, -0.18, 0.1);
    const armR = new THREE.CylinderGeometry(0.028, 0.025, 0.22, 3);
    armR.translate(0.12, -0.18, -0.1);
    const legL = new THREE.CylinderGeometry(0.03, 0.027, 0.24, 3);
    legL.translate(-0.1, -0.2, 0.1);
    const legR = new THREE.CylinderGeometry(0.03, 0.027, 0.24, 3);
    legR.translate(-0.1, -0.2, -0.1);
    const merged = mergeGeometries([body, head, tail1, tail2, tail3, armL, armR, legL, legR]);
    [body, head, tail1, tail2, tail3, armL, armR, legL, legR].forEach(g => g.dispose());
    return merged ?? new THREE.BoxGeometry(0.4, 0.3, 0.3);
  }, []);

  const material = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.9,
    metalness: 0.0,
  }), []);

  useEffect(() => {
    offsetsRef.current = data.map((p) => ({
      dx: 0, dz: 0,
      wDx: 0, wDz: 0,
      wDirX: 0, wDirZ: 0,
      wFacing: p.rotation,
      wNextChange: Math.random() * 3,
    }));
    if (!meshRef.current) return;
    const dummy = dummyRef.current;
    const col = new THREE.Color();
    data.forEach((p, i) => {
      const s = p.scale;
      dummy.position.set(p.position[0], p.position[1], p.position[2]);
      dummy.scale.set(s, s, s);
      dummy.rotation.set(0, p.rotation, 0);
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);
      col.setRGB(p.color[0], p.color[1], p.color[2]);
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

    data.forEach((p, i) => {
      const spawnX = p.position[0];
      const spawnZ = p.position[2];
      const off = offsetsRef.current[i];
      const curX = spawnX + off.dx + off.wDx;
      const curZ = spawnZ + off.dz + off.wDz;

      const toPlayerX = curX - px;
      const toPlayerZ = curZ - pz;
      const distSq = toPlayerX * toPlayerX + toPlayerZ * toPlayerZ;

      const totalOffSq = off.dx * off.dx + off.dz * off.dz + off.wDx * off.wDx + off.wDz * off.wDz;
      if (distSq > ANIM_RANGE_SQ && totalOffSq < 1) return;
      anyUpdated = true;

      const isFleeing = distSq < SCATTER_SQ;
      if (isFleeing) {
        fleeingNow++;
        // Flee direction = primarily away from player, biased toward the refuge tree.
        // Previously flee was 100% toward refuge, which meant primates ran at the player
        // whenever the player approached from beyond the refuge.
        const dist = Math.sqrt(distSq) || 1;
        const awayX = toPlayerX / dist;
        const awayZ = toPlayerZ / dist;
        const toRefugeX = p.refuge[0] - curX;
        const toRefugeZ = p.refuge[1] - curZ;
        const refugeDist = Math.sqrt(toRefugeX * toRefugeX + toRefugeZ * toRefugeZ) || 1;
        const refX = toRefugeX / refugeDist;
        const refZ = toRefugeZ / refugeDist;
        // If refuge lies on the far side of the player (refuge vector points back at player),
        // drop the refuge pull entirely for this frame.
        const refugeBias = (refX * awayX + refZ * awayZ) > 0 ? 0.35 : 0;
        const fleeX = awayX * (1 - refugeBias) + refX * refugeBias;
        const fleeZ = awayZ * (1 - refugeBias) + refZ * refugeBias;
        const fleeLen = Math.sqrt(fleeX * fleeX + fleeZ * fleeZ) || 1;
        off.dx += (fleeX / fleeLen) * FLEE_SPEED * p.speedMult * dtScale;
        off.dz += (fleeZ / fleeLen) * FLEE_SPEED * p.speedMult * dtScale;
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

      // Idle wander — only when not fleeing and within animation range
      const nearPlayer = distSq < ANIM_RANGE_SQ;
      if (!isFleeing && nearPlayer) {
        if (time >= off.wNextChange) {
          if (Math.random() < WANDER_WALK_PROB) {
            const ang = Math.random() * Math.PI * 2;
            off.wDirX = Math.cos(ang);
            off.wDirZ = Math.sin(ang);
            off.wFacing = -Math.atan2(off.wDirZ, off.wDirX);
            off.wNextChange = time + 1.5 + Math.random() * 2.5;
          } else {
            off.wDirX = 0;
            off.wDirZ = 0;
            off.wNextChange = time + 2 + Math.random() * 3; // long grooming pauses
          }
        }
        const wanderSpeed = WANDER_BASE_SPEED / p.scale;
        off.wDx += off.wDirX * wanderSpeed * dt;
        off.wDz += off.wDirZ * wanderSpeed * dt;
        const wDistSq = off.wDx * off.wDx + off.wDz * off.wDz;
        if (wDistSq > WANDER_MAX_SQ) {
          const clamp = WANDER_MAX / Math.sqrt(wDistSq);
          off.wDx *= clamp;
          off.wDz *= clamp;
          off.wDirX = -off.wDirX;
          off.wDirZ = -off.wDirZ;
          if (off.wDirX !== 0 || off.wDirZ !== 0) off.wFacing = -Math.atan2(off.wDirZ, off.wDirX);
        }
      }

      const s = p.scale;
      const finalX = spawnX + off.dx + off.wDx;
      const finalZ = spawnZ + off.dz + off.wDz;
      const isWalking = (off.wDirX !== 0 || off.wDirZ !== 0) && !isFleeing;
      // Idle: small bouncy bob; fleeing: fast bounce
      const bob = isFleeing ? Math.sin(time * 12 + i) * 0.04 : Math.sin(time * 1.4 + i * 1.7) * 0.02;

      const displaced = off.dx !== 0 || off.dz !== 0 || off.wDx !== 0 || off.wDz !== 0;
      const baseY = displaced ? getTerrainHeight(finalX, finalZ) + Y_OFFSET : p.position[1];
      dummy.position.set(finalX, baseY + bob, finalZ);
      let facing: number;
      if (isFleeing && fleeDistSq > 0.5) {
        facing = -Math.atan2(off.dz, off.dx);
      } else if (isWalking) {
        facing = off.wFacing;
      } else {
        facing = off.wFacing;
      }
      dummy.rotation.set(0, facing, 0);
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);
    });

    if (anyUpdated) meshRef.current.instanceMatrix.needsUpdate = true;

    // Scatter SFX: alarm call when troop spooks
    if (fleeingNow > fleeingCountRef.current && fleeingNow >= 2 && time - lastSfxRef.current > 1.5) {
      sfxPrimateChatter();
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
