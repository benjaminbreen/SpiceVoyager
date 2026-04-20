import { useMemo, useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { getActivePlayerPos } from '../utils/livePlayerTransform';
import { getTerrainHeight } from '../utils/terrain';
import { useGameStore } from '../store/gameStore';
import { sfxReptileScrabble } from '../audio/SoundEffects';
import type { SpeciesInfo } from './Grazers';
import { BODY_RADIUS, PLAYER_RADIUS, computeCirclePush, separateHerd } from '../utils/animalBump';
import { resolveObstaclePush } from '../utils/obstacleGrid';
import { REPTILE_TERRAIN, resolveTerrainStep } from '../utils/animalTerrain';
import { tintFlat, tintGradient } from '../utils/animalTint';
import {
  createStaminaBarGeometry,
  createStaminaBarMaterial,
  setStaminaBarInstance,
  staminaColor,
} from '../utils/animalStaminaBar';

// ── Types ────────────────────────────────────────────────────────────────────
export interface ReptileEntry {
  position: [number, number, number];
  rotation: number;
  color: [number, number, number];
  scale: number;
  speedMult: number;
  bodyLength: number; // stretch factor — crocodiles are long, iguanas are shorter
}

interface ReptileOffset {
  dx: number; dz: number;
  wDx: number; wDz: number;          // wander offset (slow ambient crawl)
  wDirX: number; wDirZ: number;
  wFacing: number;
  wNextChange: number;
  fleeing: boolean;
  stamina: number;
  fleeJitter: number;
  fleeJitterNext: number;
}

// ── Constants ────────────────────────────────────────────────────────────────
const SCATTER_SQ = 18 * 18;        // reptiles let you get closer than grazers
const SCATTER_EXIT_SQ = 25 * 25;   // hysteresis exit threshold
const FLEE_SPEED = 0.055;          // slow waddle — easy to catch on open sand
const RETURN_DECAY = 0.995;        // barely drift back — they hold ground
const MAX_FLEE_DIST = 14;
// Wander: reptiles barely move — short, lazy crawls with long basking pauses
const WANDER_MAX = 2;
const WANDER_MAX_SQ = WANDER_MAX * WANDER_MAX;
const WANDER_SPEED = 0.15;
const WANDER_WALK_PROB = 0.3;      // 30% crawl, 70% bask
const MAX_FLEE_SQ = MAX_FLEE_DIST * MAX_FLEE_DIST;
const ANIM_RANGE_SQ = 100 * 100;
// Foot-to-pivot distance in base geometry units. Legs at y=-0.2, length 0.22 rotated ±0.35,
// so vertical reach ≈ 0.30 below pivot. Multiply by instance scale.
export const REPTILE_FOOT_OFFSET = 0.30;
// Fatigue — reptiles burst fast but tire quickly
const FATIGUE_RATE = 0.28;
const RECOVERY_RATE = 0.1;
const MIN_STAMINA_SPEED = 0.25;
const FLEE_JITTER = Math.PI / 12;

// ── Component ────────────────────────────────────────────────────────────────
export function Reptiles({ data, shadowsActive, species }: { data: ReptileEntry[]; shadowsActive: boolean; species?: SpeciesInfo }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummyRef = useRef(new THREE.Object3D());
  const offsetsRef = useRef<ReptileOffset[]>([]);
  const animAccumRef = useRef(0);
  const fleeingCountRef = useRef(0);
  const lastSfxRef = useRef(0);
  const lastBumpRef = useRef(0);
  const separationAccumRef = useRef(0);
  const posXRef = useRef<number[]>([]);
  const posZRef = useRef<number[]>([]);
  const radiiRef = useRef<number[]>([]);
  const staminaBarMeshRef = useRef<THREE.InstancedMesh>(null);
  const staminaBarDummyRef = useRef(new THREE.Object3D());
  const staminaBarGeometry = useMemo(() => createStaminaBarGeometry(), []);
  const staminaBarMaterial = useMemo(() => createStaminaBarMaterial(), []);

  // Geometry: low elongated body + tapered snout + 4 splayed stubby legs + segmented long tail
  const geometry = useMemo(() => {
    // Body — strong countershading (reptiles have very pale bellies)
    const body = new THREE.SphereGeometry(0.22, 6, 4);
    body.scale(2.0, 0.5, 0.8);
    tintGradient(body, 0.85, 1.3);
    // Snout — slightly darker, reads as the scaled tip
    const snout = new THREE.SphereGeometry(0.13, 5, 3);
    snout.scale(1.3, 0.7, 0.8);
    snout.translate(0.5, -0.03, 0);
    tintFlat(snout, 0.88);
    // Tail — gradient darkening toward tip
    const tail1 = new THREE.SphereGeometry(0.15, 5, 3);
    tail1.scale(1.6, 0.5, 0.75);
    tail1.translate(-0.48, -0.02, 0);
    tintFlat(tail1, 0.92);
    const tail2 = new THREE.SphereGeometry(0.1, 5, 3);
    tail2.scale(1.8, 0.45, 0.6);
    tail2.translate(-0.78, -0.01, 0);
    tintFlat(tail2, 0.82);
    const tail3 = new THREE.SphereGeometry(0.06, 5, 3);
    tail3.scale(2.0, 0.4, 0.5);
    tail3.translate(-1.02, 0.0, 0);
    tintFlat(tail3, 0.72);
    // Legs — darker than body, close to ground they'd be muddy
    const legFL = new THREE.CylinderGeometry(0.04, 0.035, 0.22, 3);
    legFL.rotateZ(0.35);
    legFL.translate(0.22, -0.2, 0.18);
    tintFlat(legFL, 0.72);
    const legFR = new THREE.CylinderGeometry(0.04, 0.035, 0.22, 3);
    legFR.rotateZ(-0.35);
    legFR.translate(0.22, -0.2, -0.18);
    tintFlat(legFR, 0.72);
    const legBL = new THREE.CylinderGeometry(0.04, 0.035, 0.22, 3);
    legBL.rotateZ(0.35);
    legBL.translate(-0.22, -0.2, 0.18);
    tintFlat(legBL, 0.72);
    const legBR = new THREE.CylinderGeometry(0.04, 0.035, 0.22, 3);
    legBR.rotateZ(-0.35);
    legBR.translate(-0.22, -0.2, -0.18);
    tintFlat(legBR, 0.72);
    const parts = [body, snout, tail1, tail2, tail3, legFL, legFR, legBL, legBR];
    const merged = mergeGeometries(parts);
    parts.forEach(g => g.dispose());
    return merged ?? new THREE.BoxGeometry(0.5, 0.2, 0.3);
  }, []);

  const material = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.7,
    metalness: 0.0,
    vertexColors: true,
  }), []);

  useEffect(() => {
    offsetsRef.current = data.map((r) => ({
      dx: 0, dz: 0,
      wDx: 0, wDz: 0,
      wDirX: 0, wDirZ: 0,
      wFacing: r.rotation,
      wNextChange: Math.random() * 5, // stagger — reptiles are lazy
      fleeing: false,
      stamina: 1,
      fleeJitter: 0,
      fleeJitterNext: 0,
    }));
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

    if (staminaBarMeshRef.current) {
      const barDummy = staminaBarDummyRef.current;
      const barCol = new THREE.Color(0.1, 0.95, 0.15);
      for (let i = 0; i < data.length; i++) {
        setStaminaBarInstance(barDummy, 0, 0, 0, data[i].scale, 1, false);
        staminaBarMeshRef.current.setMatrixAt(i, barDummy.matrix);
        staminaBarMeshRef.current.setColorAt(i, barCol);
      }
      staminaBarMeshRef.current.instanceMatrix.needsUpdate = true;
      if (staminaBarMeshRef.current.instanceColor) staminaBarMeshRef.current.instanceColor.needsUpdate = true;
    }
  }, [data]);

  useFrame(({ clock }, delta) => {
    if (!meshRef.current || offsetsRef.current.length !== data.length) return;
    animAccumRef.current += delta;
    if (animAccumRef.current < 1 / 20) return; // throttle to ~20fps
    const dt = Math.min(0.1, animAccumRef.current);
    animAccumRef.current = 0;
    const time = clock.getElapsedTime();
    const dtScale = dt * 60;
    const decay = Math.pow(RETURN_DECAY, dtScale);
    const dummy = dummyRef.current;
    const playerPos = getActivePlayerPos();
    const px = playerPos[0];
    const pz = playerPos[2];
    let anyUpdated = false;
    let fleeingNow = 0;
    let playerBumped = false;
    let bumpX = 0, bumpZ = 0;
    let sampleFleeingX = 0, sampleFleeingZ = 0;
    let haveFleeingSample = false;

    const posX = posXRef.current;
    const posZ = posZRef.current;
    const radii = radiiRef.current;
    posX.length = 0;
    posZ.length = 0;
    radii.length = 0;
    const nearIndices: number[] = [];

    data.forEach((r, i) => {
      const spawnX = r.position[0];
      const spawnZ = r.position[2];
      const off = offsetsRef.current[i];
      const curX = spawnX + off.dx + off.wDx;
      const curZ = spawnZ + off.dz + off.wDz;

      const toPlayerX = curX - px;
      const toPlayerZ = curZ - pz;
      const distSq = toPlayerX * toPlayerX + toPlayerZ * toPlayerZ;

      const totalOffSq = off.dx * off.dx + off.dz * off.dz + off.wDx * off.wDx + off.wDz * off.wDz;
      if (distSq > ANIM_RANGE_SQ && totalOffSq < 1) return;
      anyUpdated = true;

      // Hysteresis: enter flee at SCATTER_SQ, exit at SCATTER_EXIT_SQ
      if (distSq < SCATTER_SQ) off.fleeing = true;
      else if (distSq > SCATTER_EXIT_SQ) off.fleeing = false;
      const isFleeing = off.fleeing;
      if (isFleeing) {
        fleeingNow++;
        off.stamina = Math.max(0, off.stamina - FATIGUE_RATE * dt);
        if (!haveFleeingSample) {
          haveFleeingSample = true;
          sampleFleeingX = curX;
          sampleFleeingZ = curZ;
        }
        const dist = Math.sqrt(distSq) || 1;
        if (time >= off.fleeJitterNext) {
          off.fleeJitter = (Math.random() * 2 - 1) * FLEE_JITTER;
          off.fleeJitterNext = time + 1.5 + Math.random() * 1.0;
        }
        const awayX = toPlayerX / dist;
        const awayZ = toPlayerZ / dist;
        const jc = Math.cos(off.fleeJitter);
        const js = Math.sin(off.fleeJitter);
        const fleeX = awayX * jc - awayZ * js;
        const fleeZ = awayX * js + awayZ * jc;
        const staminaMult = Math.max(MIN_STAMINA_SPEED, off.stamina);
        const stepX = fleeX * FLEE_SPEED * r.speedMult * staminaMult * dtScale;
        const stepZ = fleeZ * FLEE_SPEED * r.speedMult * staminaMult * dtScale;
        const move = resolveTerrainStep(
          spawnX + off.dx, spawnZ + off.dz, stepX, stepZ,
          REPTILE_TERRAIN.min, REPTILE_TERRAIN.max,
        );
        off.dx += move.dx;
        off.dz += move.dz;
      } else {
        off.stamina = Math.min(1, off.stamina + RECOVERY_RATE * dt);
        off.dx *= decay;
        off.dz *= decay;
      }

      // Player contact: bodyLength stretches the scale along X, so the collider uses
      // the max of the two axes for a more generous hitbox on long crocs.
      const reptileR = BODY_RADIUS.reptile * r.scale * Math.max(1, r.bodyLength * 0.7);
      const bumpSumR = reptileR + PLAYER_RADIUS;
      const push = computeCirclePush(curX, curZ, px, pz, bumpSumR);
      if (push && push.overlap > 0.05) {
        off.dx += push.px;
        off.dz += push.pz;
        playerBumped = true;
        bumpX = curX;
        bumpZ = curZ;
      }

      // Static obstacle collision — reptiles detour around rocks/trunks rather
      // than clipping through them.
      const obs = resolveObstaclePush(curX, curZ, reptileR);
      if (obs.hit) {
        off.dx += obs.px;
        off.dz += obs.pz;
      }

      const fleeDistSq = off.dx * off.dx + off.dz * off.dz;
      if (fleeDistSq > MAX_FLEE_SQ) {
        const clamp = MAX_FLEE_DIST / Math.sqrt(fleeDistSq);
        off.dx *= clamp;
        off.dz *= clamp;
      }

      // Wander — lazy ambient crawl when not spooked
      const nearPlayer = distSq < ANIM_RANGE_SQ;
      if (!isFleeing && nearPlayer) {
        if (time >= off.wNextChange) {
          if (Math.random() < WANDER_WALK_PROB) {
            const ang = Math.random() * Math.PI * 2;
            off.wDirX = Math.cos(ang);
            off.wDirZ = Math.sin(ang);
            off.wFacing = -Math.atan2(off.wDirZ, off.wDirX);
            off.wNextChange = time + 3 + Math.random() * 5; // crawl 3–8s
          } else {
            off.wDirX = 0;
            off.wDirZ = 0;
            off.wNextChange = time + 4 + Math.random() * 8; // bask 4–12s
          }
        }
        const wStepX = off.wDirX * WANDER_SPEED * dt;
        const wStepZ = off.wDirZ * WANDER_SPEED * dt;
        const wMove = resolveTerrainStep(
          spawnX + off.dx + off.wDx, spawnZ + off.dz + off.wDz, wStepX, wStepZ,
          REPTILE_TERRAIN.min, REPTILE_TERRAIN.max,
        );
        off.wDx += wMove.dx;
        off.wDz += wMove.dz;
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

      const s = r.scale;
      const finalX = spawnX + off.dx + off.wDx;
      const finalZ = spawnZ + off.dz + off.wDz;
      if (nearPlayer) {
        nearIndices.push(i);
        posX.push(finalX);
        posZ.push(finalZ);
        radii.push(reptileR);
      }
      const isWalking = (off.wDirX !== 0 || off.wDirZ !== 0) && !isFleeing;
      // Waddle: gentler side-to-side yaw when fleeing; subtle when idle-crawling
      const wiggle = isFleeing
        ? Math.sin(time * 4 + i * 1.3) * 0.12
        : isWalking ? Math.sin(time * 2 + i * 0.7) * 0.06 : Math.sin(time * 0.5 + i * 0.7) * 0.02;

      const displaced = off.dx !== 0 || off.dz !== 0 || off.wDx !== 0 || off.wDz !== 0;
      const baseY = displaced ? getTerrainHeight(finalX, finalZ) + REPTILE_FOOT_OFFSET * s : r.position[1];
      dummy.position.set(finalX, baseY, finalZ);
      let baseFacing: number;
      if (isFleeing && fleeDistSq > 0.5) {
        baseFacing = -Math.atan2(off.dz, off.dx);
        off.wFacing = baseFacing; // sync for smooth transition
      } else {
        baseFacing = off.wFacing;
      }
      dummy.rotation.set(0, baseFacing + wiggle, 0);
      dummy.scale.set(s * r.bodyLength, s, s);
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);

      const bar = staminaBarMeshRef.current;
      if (bar) {
        const footY = baseY - REPTILE_FOOT_OFFSET * s;
        setStaminaBarInstance(
          staminaBarDummyRef.current,
          finalX, footY, finalZ,
          s * Math.max(1, r.bodyLength * 0.7), // stretch bar for long crocs
          off.stamina,
          isFleeing,
        );
        bar.setMatrixAt(i, staminaBarDummyRef.current.matrix);
        if (isFleeing) bar.setColorAt(i, staminaColor(off.stamina));
      }
    });

    if (anyUpdated) meshRef.current.instanceMatrix.needsUpdate = true;
    if (staminaBarMeshRef.current) {
      staminaBarMeshRef.current.instanceMatrix.needsUpdate = true;
      if (staminaBarMeshRef.current.instanceColor) staminaBarMeshRef.current.instanceColor.needsUpdate = true;
    }

    separationAccumRef.current += dt;
    if (nearIndices.length > 1 && separationAccumRef.current >= 0.3) {
      separationAccumRef.current = 0;
      const localOffsets = nearIndices.map(idx => offsetsRef.current[idx]);
      separateHerd(localOffsets, posX, posZ, radii);
    }

    if (playerBumped && time - lastBumpRef.current > 0.9) {
      lastBumpRef.current = time;
      sfxReptileScrabble(bumpX, bumpZ);
      if (species) {
        useGameStore.getState().addNotification(species.name, 'info', {
          subtitle: `${species.latin} · hisses and slinks away`,
        });
      }
    }

    if (fleeingNow > fleeingCountRef.current && time - lastSfxRef.current > 1.0) {
      if (haveFleeingSample) sfxReptileScrabble(sampleFleeingX, sampleFleeingZ);
      else sfxReptileScrabble();
      lastSfxRef.current = time;
    }
    fleeingCountRef.current = fleeingNow;
  });

  if (data.length === 0) return null;

  return (
    <>
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
      <instancedMesh
        ref={staminaBarMeshRef}
        args={[staminaBarGeometry, staminaBarMaterial, data.length]}
        frustumCulled={false}
        renderOrder={2}
      />
    </>
  );
}
