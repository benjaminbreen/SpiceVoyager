import { useMemo, useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { getActivePlayerPos } from '../utils/livePlayerTransform';
import { getTerrainHeight } from '../utils/terrain';
import { useGameStore } from '../store/gameStore';
import { sfxPrimateChatter } from '../audio/SoundEffects';
import { PRIMATE_FOOT_OFFSET, type PrimateEntry, type SpeciesInfo } from '../utils/animalTypes';
import { BODY_RADIUS, PLAYER_RADIUS, computeCirclePush, separateHerd } from '../utils/animalBump';
import { resolveObstaclePush } from '../utils/obstacleGrid';
import { PRIMATE_TERRAIN, resolveTerrainStep } from '../utils/animalTerrain';
import { tintFlat, tintGradient } from '../utils/animalTint';
import {
  createStaminaBarGeometry,
  createStaminaBarMaterial,
  setStaminaBarInstance,
  staminaColor,
} from '../utils/animalStaminaBar';

interface PrimateOffset {
  dx: number; dz: number;          // flee offset
  wDx: number; wDz: number;        // idle wander offset
  wDirX: number; wDirZ: number;
  wFacing: number;
  wNextChange: number;
  fleeing: boolean;                 // hysteresis flag
  climb: number;                    // 0 = on ground, 1 = fully up in the canopy
  stamina: number;                  // 1 = fresh, 0 = exhausted
  fleeJitter: number;               // ±π/12 flee-heading perturbation
  fleeJitterNext: number;
}

// ── Constants ────────────────────────────────────────────────────────────────
const SCATTER_SQ = 17 * 17;       // a touch larger than grazers — primates spook slightly earlier
const SCATTER_EXIT_SQ = 24 * 24;  // hysteresis: must move further away before calming down
// Base 4.8 u/s; with speedMult 0.7–1.3 peaks ~6.2 u/s — comfortably slower than the
// player (10 u/s). Combined with coastal/cliff terrain blocks below, troops can be
// cornered near their refuge tree.
const FLEE_SPEED = 0.08;
const RETURN_DECAY = 0.992;        // slower decay than grazers — primates linger near refuge
const MAX_FLEE_DIST = 18;          // smaller — they hide at trees, don't bolt across the map
const MAX_FLEE_SQ = MAX_FLEE_DIST * MAX_FLEE_DIST;
const ANIM_RANGE_SQ = 100 * 100;
// Wander: primates fidget more than grazers but over a smaller radius (stay near refuge)
const WANDER_MAX = 2.5;
const WANDER_MAX_SQ = WANDER_MAX * WANDER_MAX;
const WANDER_BASE_SPEED = 0.55;
const WANDER_WALK_PROB = 0.55;     // more pauses — primates sit and groom
// Tree-climbing escape — primates near their refuge tree scurry up the trunk
// instead of (or rather, at the end of) running along the ground.
const CLIMB_LATCH_SQ = 1.4 * 1.4;  // within this distance of refuge → hug trunk
const CLIMB_RATE = 2.6;            // canopy in ~0.4s — reads as a fast scramble
const DESCEND_RATE = 1.3;          // slower down — they peek before committing
const CANOPY_HEIGHT = 5.0;         // roughly palm/broadleaf canopy above ground
const PIN_LERP_BASE = 0.001;       // frame-rate-independent pull toward refuge XZ
// Fatigue — primates tire a bit faster than grazers; canopy climbs let them rest mid-chase
const FATIGUE_RATE = 0.22;
const RECOVERY_RATE = 0.16;
const MIN_STAMINA_SPEED = 0.4;
const FLEE_JITTER = Math.PI / 12;

// ── Component ────────────────────────────────────────────────────────────────
export function Primates({ data, shadowsActive, species }: { data: PrimateEntry[]; shadowsActive: boolean; species?: SpeciesInfo }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummyRef = useRef(new THREE.Object3D());
  const offsetsRef = useRef<PrimateOffset[]>([]);
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

  // Geometry: upright crouched body + round head + long curved tail + 4 short limbs
  const geometry = useMemo(() => {
    // Body — gradient belly for countershading
    const body = new THREE.SphereGeometry(0.22, 6, 4);
    body.scale(1.1, 0.9, 0.7);
    body.translate(0, -0.05, 0);
    tintGradient(body, 0.9, 1.15);
    // Head slightly lighter — face reads against body
    const head = new THREE.SphereGeometry(0.13, 5, 4);
    head.translate(0.22, 0.18, 0);
    tintFlat(head, 1.1);
    // Tail — fades darker toward the tip, which is the exposed/dirty end
    const tail1 = new THREE.CylinderGeometry(0.025, 0.03, 0.18, 3);
    tail1.rotateZ(Math.PI / 2);
    tail1.translate(-0.28, 0.0, 0);
    tintFlat(tail1, 0.88);
    const tail2 = new THREE.CylinderGeometry(0.02, 0.025, 0.18, 3);
    tail2.rotateZ(Math.PI / 2.5);
    tail2.translate(-0.42, 0.08, 0);
    tintFlat(tail2, 0.78);
    const tail3 = new THREE.CylinderGeometry(0.015, 0.02, 0.16, 3);
    tail3.rotateZ(Math.PI / 3);
    tail3.translate(-0.52, 0.2, 0);
    tintFlat(tail3, 0.68);
    // Limbs — noticeably darker than body, common primate pattern
    const armL = new THREE.CylinderGeometry(0.028, 0.025, 0.22, 3);
    armL.translate(0.12, -0.18, 0.1);
    tintFlat(armL, 0.7);
    const armR = new THREE.CylinderGeometry(0.028, 0.025, 0.22, 3);
    armR.translate(0.12, -0.18, -0.1);
    tintFlat(armR, 0.7);
    const legL = new THREE.CylinderGeometry(0.03, 0.027, 0.24, 3);
    legL.translate(-0.1, -0.2, 0.1);
    tintFlat(legL, 0.7);
    const legR = new THREE.CylinderGeometry(0.03, 0.027, 0.24, 3);
    legR.translate(-0.1, -0.2, -0.1);
    tintFlat(legR, 0.7);
    const merged = mergeGeometries([body, head, tail1, tail2, tail3, armL, armR, legL, legR]);
    [body, head, tail1, tail2, tail3, armL, armR, legL, legR].forEach(g => g.dispose());
    return merged ?? new THREE.BoxGeometry(0.4, 0.3, 0.3);
  }, []);

  const material = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.9,
    metalness: 0.0,
    vertexColors: true,
  }), []);

  useEffect(() => {
    offsetsRef.current = data.map((p) => ({
      dx: 0, dz: 0,
      wDx: 0, wDz: 0,
      wDirX: 0, wDirZ: 0,
      wFacing: p.rotation,
      wNextChange: Math.random() * 3,
      fleeing: false,
      climb: 0,
      stamina: 1,
      fleeJitter: 0,
      fleeJitterNext: 0,
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

      if (distSq < SCATTER_SQ) off.fleeing = true;
      else if (distSq > SCATTER_EXIT_SQ) off.fleeing = false;
      const isFleeing = off.fleeing;

      // ── Climb state ────────────────────────────────────────────────────
      // If the primate is fleeing and close to its refuge tree, ramp climb
      // toward 1 and pin horizontal offset to the refuge XZ so it appears to
      // hug the trunk. Once latched, stay climbed while still fleeing — only
      // descend when the threat passes.
      const toRefX = p.refuge[0] - curX;
      const toRefZ = p.refuge[1] - curZ;
      const refugeDistSq = toRefX * toRefX + toRefZ * toRefZ;
      const alreadyClimbing = off.climb > 0.05;
      const shouldClimb = isFleeing && (alreadyClimbing || refugeDistSq < CLIMB_LATCH_SQ);
      if (shouldClimb) {
        off.climb = Math.min(1, off.climb + CLIMB_RATE * dt);
        // Pull horizontal offset toward refuge anchor at an exponential rate
        const targetDX = p.refuge[0] - spawnX;
        const targetDZ = p.refuge[1] - spawnZ;
        const pinLerp = 1 - Math.pow(PIN_LERP_BASE, dt);
        off.dx += (targetDX - off.dx) * pinLerp;
        off.dz += (targetDZ - off.dz) * pinLerp;
        // Fade out any lingering wander — they're on the trunk, not ambling
        const wanderDecay = Math.pow(0.02, dt);
        off.wDx *= wanderDecay;
        off.wDz *= wanderDecay;
      } else {
        off.climb = Math.max(0, off.climb - DESCEND_RATE * dt);
      }
      const isClimbing = off.climb > 0.05;

      if (isFleeing) fleeingNow++;

      // Stamina: drain while running on the ground; the canopy is a safe rest
      // spot so climbing primates recover as if they were calm.
      if (isFleeing && !isClimbing) {
        off.stamina = Math.max(0, off.stamina - FATIGUE_RATE * dt);
      } else {
        off.stamina = Math.min(1, off.stamina + RECOVERY_RATE * dt);
      }

      if (isFleeing && !isClimbing) {
        if (!haveFleeingSample) {
          haveFleeingSample = true;
          sampleFleeingX = curX;
          sampleFleeingZ = curZ;
        }
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
        let fleeX = awayX * (1 - refugeBias) + refX * refugeBias;
        let fleeZ = awayZ * (1 - refugeBias) + refZ * refugeBias;
        const fleeLen = Math.sqrt(fleeX * fleeX + fleeZ * fleeZ) || 1;
        fleeX /= fleeLen;
        fleeZ /= fleeLen;
        // Heading jitter — break up straight-line bolt with small perturbation
        if (time >= off.fleeJitterNext) {
          off.fleeJitter = (Math.random() * 2 - 1) * FLEE_JITTER;
          off.fleeJitterNext = time + 1.2 + Math.random() * 1.0;
        }
        const jc = Math.cos(off.fleeJitter);
        const js = Math.sin(off.fleeJitter);
        const jx = fleeX * jc - fleeZ * js;
        const jz = fleeX * js + fleeZ * jc;
        const staminaMult = Math.max(MIN_STAMINA_SPEED, off.stamina);
        const stepX = jx * FLEE_SPEED * p.speedMult * staminaMult * dtScale;
        const stepZ = jz * FLEE_SPEED * p.speedMult * staminaMult * dtScale;
        const move = resolveTerrainStep(
          spawnX + off.dx, spawnZ + off.dz, stepX, stepZ,
          PRIMATE_TERRAIN.min, PRIMATE_TERRAIN.max,
        );
        off.dx += move.dx;
        off.dz += move.dz;
      } else if (!isFleeing && !isClimbing) {
        off.dx *= decay;
        off.dz *= decay;
      }
      // When isClimbing: horizontal offset is already being lerped toward the
      // refuge above, so skip both flee and decay branches.

      // While climbing the primate is physically out of reach, so skip ground
      // collisions entirely (they'd just argue with the pin anyway).
      if (!isClimbing) {
        // Player contact: snap primate out of the player's personal space
        const bumpSumR = BODY_RADIUS.primate * p.scale + PLAYER_RADIUS;
        const push = computeCirclePush(curX, curZ, px, pz, bumpSumR);
        if (push && push.overlap > 0.05) {
          off.dx += push.px;
          off.dz += push.pz;
          playerBumped = true;
          bumpX = curX;
          bumpZ = curZ;
        }

        // Static obstacle collision — primates bumping between canopies rather
        // than tunnelling through their own refuge trees.
        const obs = resolveObstaclePush(curX, curZ, BODY_RADIUS.primate * p.scale);
        if (obs.hit) {
          off.dx += obs.px;
          off.dz += obs.pz;
        }
      }

      const fleeDistSq = off.dx * off.dx + off.dz * off.dz;
      if (fleeDistSq > MAX_FLEE_SQ) {
        const clamp = MAX_FLEE_DIST / Math.sqrt(fleeDistSq);
        off.dx *= clamp;
        off.dz *= clamp;
      }

      // Idle wander — only when not fleeing, not clinging to a trunk, and within animation range
      const nearPlayer = distSq < ANIM_RANGE_SQ;
      if (!isFleeing && !isClimbing && nearPlayer) {
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
        const wStepX = off.wDirX * wanderSpeed * dt;
        const wStepZ = off.wDirZ * wanderSpeed * dt;
        const wMove = resolveTerrainStep(
          spawnX + off.dx + off.wDx, spawnZ + off.dz + off.wDz, wStepX, wStepZ,
          PRIMATE_TERRAIN.min, PRIMATE_TERRAIN.max,
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

      const s = p.scale;
      const finalX = spawnX + off.dx + off.wDx;
      const finalZ = spawnZ + off.dz + off.wDz;
      // Airborne primates don't participate in ground separation — they're
      // clustered in a canopy, not in 2D contact with the herd.
      if (nearPlayer && !isClimbing) {
        nearIndices.push(i);
        posX.push(finalX);
        posZ.push(finalZ);
        radii.push(BODY_RADIUS.primate * s);
      }
      const isWalking = (off.wDirX !== 0 || off.wDirZ !== 0) && !isFleeing;
      // Climbing-up: rapid clamber bob; perched: still; fleeing on ground: fast; idle: slow groom bob
      const climbing01 = off.climb;
      let bob: number;
      if (climbing01 >= 0.98) bob = 0;
      else if (climbing01 > 0.05) bob = Math.sin(time * 22 + i) * 0.06; // fast scrabble up the trunk
      else if (isFleeing) bob = Math.sin(time * 12 + i) * 0.04;
      else bob = Math.sin(time * 1.4 + i * 1.7) * 0.02;

      // Position: when climbing, raise Y along the trunk using a smoothstep so
      // the take-off and settling both ease. Ground height is sampled at the
      // refuge anchor (not finalX/Z) so the primate doesn't skitter off-trunk.
      let baseY: number;
      if (climbing01 > 0.01) {
        const ease = climbing01 * climbing01 * (3 - 2 * climbing01); // smoothstep
        baseY = getTerrainHeight(p.refuge[0], p.refuge[1]) + PRIMATE_FOOT_OFFSET * s + ease * CANOPY_HEIGHT;
      } else {
        const displaced = off.dx !== 0 || off.dz !== 0 || off.wDx !== 0 || off.wDz !== 0;
        baseY = displaced ? getTerrainHeight(finalX, finalZ) + PRIMATE_FOOT_OFFSET * s : p.position[1];
      }
      dummy.position.set(finalX, baseY + bob, finalZ);
      let facing: number;
      if (isClimbing) {
        // Peer out from the trunk toward the player — watchful, tracks them
        facing = -Math.atan2(pz - p.refuge[1], px - p.refuge[0]);
        off.wFacing = facing;
      } else if (isFleeing && fleeDistSq > 0.5) {
        facing = -Math.atan2(off.dz, off.dx);
        off.wFacing = facing; // sync so transition out of flee is smooth
      } else {
        facing = off.wFacing;
      }
      dummy.rotation.set(0, facing, 0);
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);

      // Stamina bar — hidden while in the canopy since they're out of combat reach
      const bar = staminaBarMeshRef.current;
      if (bar) {
        const footY = baseY - PRIMATE_FOOT_OFFSET * s;
        const showBar = isFleeing && !isClimbing;
        setStaminaBarInstance(
          staminaBarDummyRef.current,
          finalX, footY, finalZ,
          s,
          off.stamina,
          showBar,
        );
        bar.setMatrixAt(i, staminaBarDummyRef.current.matrix);
        if (showBar) bar.setColorAt(i, staminaColor(off.stamina));
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
      sfxPrimateChatter(bumpX, bumpZ);
      if (species) {
        useGameStore.getState().addNotification(species.name, 'info', {
          subtitle: `${species.latin} · shrieks and scatters`,
        });
      }
    }

    // Scatter SFX: alarm call when troop spooks
    if (fleeingNow > fleeingCountRef.current && fleeingNow >= 2 && time - lastSfxRef.current > 1.5) {
      if (haveFleeingSample) sfxPrimateChatter(sampleFleeingX, sampleFleeingZ);
      else sfxPrimateChatter();
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
