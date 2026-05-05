import { useMemo, useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { getActivePlayerPos } from '../utils/livePlayerTransform';
import { useGameStore } from '../store/gameStore';
import { getTerrainHeight } from '../utils/terrain';
import { sfxBirdFlap } from '../audio/SoundEffects';
import type { SpeciesInfo, WadingBirdEntry } from '../utils/animalTypes';
import { BODY_RADIUS, PLAYER_RADIUS, computeCirclePush } from '../utils/animalBump';
import { resolveObstaclePush } from '../utils/obstacleGrid';
import { GRAZER_TERRAIN, resolveTerrainStep } from '../utils/animalTerrain';
import { tintFlat, tintGradient } from '../utils/animalTint';
import {
  createStaminaBarGeometry,
  createStaminaBarMaterial,
  setStaminaBarInstance,
  staminaColor,
} from '../utils/animalStaminaBar';

interface FlightState {
  t: number;        // flight progress 0=grounded, 1=full altitude
  theta: number;    // orbit angle (flying birds only)
  dx: number;       // ground flee offset (all birds waddle before flying)
  dz: number;
  fleeing: boolean; // hysteresis flag
  lastFacing: number; // remembered facing for smooth transitions
  flightTriggered: boolean; // true once committed to takeoff
  scaredSince: number;      // clock time when first spooked (0 = calm)
  stamina: number;          // 1=fresh, 0=exhausted — ground-only
  fleeJitter: number;       // heading perturbation while running/waddling on ground
  fleeJitterNext: number;
}

// ── Constants ────────────────────────────────────────────────────────────────
const SCATTER_SQ = 30 * 30;        // spook farther than grazers
const SCATTER_EXIT_SQ = 40 * 40;   // hysteresis exit threshold
const FLUSH_SQ = 14 * 14;          // inner radius — triggers takeoff when player pushes in
const FLIGHT_DELAY = 2.5;          // seconds of ground flee before flock gives up and flies
const TAKEOFF_RATE = 0.018;        // ~1s full takeoff
const LANDING_RATE = 0.008;        // ~2s descent
const CIRCLE_SPEED = 0.8;          // radians/sec while airborne
const ANIM_RANGE_SQ = 100 * 100;
const WADDLE_FLEE_SPEED = 0.045;   // ground waddle — slower than grazers, birds are awkward walkers
const WADDLE_MAX = 8;              // max ground flee distance
const WADDLE_MAX_SQ = WADDLE_MAX * WADDLE_MAX;
const GROUND_RETURN_DECAY = 0.985;

// Flightless runner tuning (ostriches, etc.) — treated as grazer-like ground animals.
// A bird is considered flightless if its maxAltitude never clears roughly a player's head.
const FLIGHTLESS_ALT = 2.0;
const RUNNER_FLEE_SPEED = 0.08;    // ~4.8 u/s base, peaks ~6.2 u/s — slower than player (10 u/s)
const RUNNER_RETURN_DECAY = 0.985;
const RUNNER_MAX_FLEE = 40;
const RUNNER_MAX_FLEE_SQ = RUNNER_MAX_FLEE * RUNNER_MAX_FLEE;
// Fatigue — runners burn out quickly; waddle-then-fly birds barely drain since flight resets them
const FATIGUE_RATE = 0.2;
const RECOVERY_RATE = 0.14;
const MIN_STAMINA_SPEED = 0.35;
const FLEE_JITTER = Math.PI / 12;

// ── Component ────────────────────────────────────────────────────────────────
export function WadingBirds({ data, shadowsActive, species }: { data: WadingBirdEntry[]; shadowsActive: boolean; species?: SpeciesInfo }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummyRef = useRef(new THREE.Object3D());
  const flightRef = useRef<FlightState[]>([]);
  const animAccumRef = useRef(0);
  const airborneCountRef = useRef(0);
  const lastSfxRef = useRef(0);
  const lastBumpRef = useRef(0);
  const staminaBarMeshRef = useRef<THREE.InstancedMesh>(null);
  const staminaBarDummyRef = useRef(new THREE.Object3D());
  const staminaBarGeometry = useMemo(() => createStaminaBarGeometry(), []);
  const staminaBarMaterial = useMemo(() => createStaminaBarMaterial(), []);

  // Geometry: slim body + S-neck + head + pointed beak + 2 long legs + 2 flat wings
  const geometry = useMemo(() => {
    // Body — countershaded; ostriches and flamingos both have paler undersides
    const body = new THREE.SphereGeometry(0.18, 6, 4);
    body.scale(1.6, 0.75, 0.9);
    tintGradient(body, 0.88, 1.2);
    // Neck stepping up — slightly paler than body, reads as exposed throat
    const neck1 = new THREE.SphereGeometry(0.08, 4, 3);
    neck1.translate(0.2, 0.15, 0);
    tintFlat(neck1, 1.05);
    const neck2 = new THREE.SphereGeometry(0.07, 4, 3);
    neck2.translate(0.28, 0.3, 0);
    tintFlat(neck2, 1.1);
    const head = new THREE.SphereGeometry(0.09, 5, 3);
    head.translate(0.36, 0.42, 0);
    tintFlat(head, 1.0);
    // Beak — very dark (keratin), pops against the head
    const beak = new THREE.ConeGeometry(0.025, 0.18, 4);
    beak.rotateZ(-Math.PI / 2);
    beak.translate(0.5, 0.42, 0);
    tintFlat(beak, 0.28);
    // Legs — dark, almost silhouette against sand
    const legL = new THREE.CylinderGeometry(0.02, 0.018, 0.55, 3);
    legL.translate(0.0, -0.45, 0.08);
    tintFlat(legL, 0.6);
    const legR = new THREE.CylinderGeometry(0.02, 0.018, 0.55, 3);
    legR.translate(0.0, -0.45, -0.08);
    tintFlat(legR, 0.6);
    // Wings — a touch darker than body so the folded edge reads
    const wingL = new THREE.SphereGeometry(0.18, 5, 3);
    wingL.scale(1.4, 0.15, 0.7);
    wingL.translate(-0.05, 0.05, 0.22);
    tintFlat(wingL, 0.82);
    const wingR = new THREE.SphereGeometry(0.18, 5, 3);
    wingR.scale(1.4, 0.15, 0.7);
    wingR.translate(-0.05, 0.05, -0.22);
    tintFlat(wingR, 0.82);
    const parts = [body, neck1, neck2, head, beak, legL, legR, wingL, wingR];
    const merged = mergeGeometries(parts);
    parts.forEach(g => g.dispose());
    return merged ?? new THREE.BoxGeometry(0.5, 0.3, 0.3);
  }, []);

  const material = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.8,
    metalness: 0.0,
    vertexColors: true,
  }), []);

  useEffect(() => {
    flightRef.current = data.map((b) => ({
      t: 0, theta: 0, dx: 0, dz: 0,
      fleeing: false, lastFacing: b.rotation,
      flightTriggered: false, scaredSince: 0,
      stamina: 1, fleeJitter: 0, fleeJitterNext: 0,
    }));
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
    if (!meshRef.current || flightRef.current.length !== data.length) return;
    animAccumRef.current += delta;
    if (animAccumRef.current < 1 / 20) return; // throttle to ~20fps
    const dt = Math.min(0.1, animAccumRef.current);
    animAccumRef.current = 0;
    const time = clock.getElapsedTime();
    const dummy = dummyRef.current;
    const playerPos = getActivePlayerPos();
    const px = playerPos[0];
    const pz = playerPos[2];
    let anyUpdated = false;
    const dtScale = dt * 60;
    let airborneNow = 0;
    let playerBumped = false;
    let bumpX = 0, bumpZ = 0;
    let sampleFleeingX = 0, sampleFleeingZ = 0;
    let haveFleeingSample = false;

    data.forEach((b, i) => {
      const state = flightRef.current[i];
      const spawnX = b.position[0];
      const spawnZ = b.position[2];
      const isFlightless = b.maxAltitude < FLIGHTLESS_ALT;

      // All birds use ground offset for distance checks — flyers waddle first
      const curX = spawnX + state.dx;
      const curZ = spawnZ + state.dz;

      const toPlayerX = curX - px;
      const toPlayerZ = curZ - pz;
      const distSq = toPlayerX * toPlayerX + toPlayerZ * toPlayerZ;

      // Skip distant grounded/unmoved birds entirely
      const offSq = state.dx * state.dx + state.dz * state.dz;
      if (distSq > ANIM_RANGE_SQ && state.t < 0.01 && offSq < 1) return;
      anyUpdated = true;

      if (isFlightless) {
        // ── Flightless runner (ostrich): grazer-style ground flee ────────────
        // Stay on the ground, displace via dx/dz, fully bumpable — no orbit.
        const decay = Math.pow(RUNNER_RETURN_DECAY, dtScale);

        // Player contact: snap the bird out of overlap and flag a bump event
        const bumpSumR = BODY_RADIUS.wading * b.scale + PLAYER_RADIUS;
        const push = computeCirclePush(curX, curZ, px, pz, bumpSumR);
        if (push && push.overlap > 0.05) {
          state.dx += push.px;
          state.dz += push.pz;
          playerBumped = true;
          bumpX = curX;
          bumpZ = curZ;
        }

        // Static obstacle collision — flightless runners can't tunnel through
        // acacias or mangroves while scattering.
        const obs = resolveObstaclePush(curX, curZ, BODY_RADIUS.wading * b.scale);
        if (obs.hit) {
          state.dx += obs.px;
          state.dz += obs.pz;
        }

        // Hysteresis for flightless runners
        if (distSq < SCATTER_SQ) state.fleeing = true;
        else if (distSq > SCATTER_EXIT_SQ) state.fleeing = false;

        if (state.fleeing) {
          state.stamina = Math.max(0, state.stamina - FATIGUE_RATE * dt);
          if (!haveFleeingSample) {
            haveFleeingSample = true;
            sampleFleeingX = curX;
            sampleFleeingZ = curZ;
          }
          const dist = Math.sqrt(distSq) || 1;
          if (time >= state.fleeJitterNext) {
            state.fleeJitter = (Math.random() * 2 - 1) * FLEE_JITTER;
            state.fleeJitterNext = time + 1.5 + Math.random() * 1.0;
          }
          const awayX = toPlayerX / dist;
          const awayZ = toPlayerZ / dist;
          const jc = Math.cos(state.fleeJitter);
          const js = Math.sin(state.fleeJitter);
          const fleeX = awayX * jc - awayZ * js;
          const fleeZ = awayX * js + awayZ * jc;
          const staminaMult = Math.max(MIN_STAMINA_SPEED, state.stamina);
          const stepX = fleeX * RUNNER_FLEE_SPEED * b.speedMult * staminaMult * dtScale;
          const stepZ = fleeZ * RUNNER_FLEE_SPEED * b.speedMult * staminaMult * dtScale;
          const move = resolveTerrainStep(
            spawnX + state.dx, spawnZ + state.dz, stepX, stepZ,
            GRAZER_TERRAIN.min, GRAZER_TERRAIN.max,
          );
          state.dx += move.dx;
          state.dz += move.dz;
        } else {
          state.stamina = Math.min(1, state.stamina + RECOVERY_RATE * dt);
          state.dx *= decay;
          state.dz *= decay;
        }

        // Clamp flee distance
        const fleeSq = state.dx * state.dx + state.dz * state.dz;
        if (fleeSq > RUNNER_MAX_FLEE_SQ) {
          const clamp = RUNNER_MAX_FLEE / Math.sqrt(fleeSq);
          state.dx *= clamp;
          state.dz *= clamp;
        }

        const finalX = spawnX + state.dx;
        const finalZ = spawnZ + state.dz;
        const isRunning = state.fleeing && fleeSq > 0.1;
        // Follow terrain so the bird doesn't float off a hill when fleeing.
        const baseY = (state.dx !== 0 || state.dz !== 0)
          ? getTerrainHeight(finalX, finalZ)
          : b.position[1];
        // Running bob; subtle idle otherwise
        const bob = isRunning
          ? Math.sin(time * 10 + i * 1.3) * 0.04
          : Math.sin(time * 1.6 + i * 1.3) * 0.02;
        let facing: number;
        if (isRunning && fleeSq > 0.5) {
          facing = -Math.atan2(state.dz, state.dx);
          state.lastFacing = facing; // sync for smooth transition
        } else {
          facing = state.lastFacing;
        }

        const sc = b.scale;
        dummy.position.set(finalX, baseY + bob, finalZ);
        dummy.rotation.set(0, facing, 0);
        dummy.scale.set(sc, sc, sc);
        dummy.updateMatrix();
        meshRef.current!.setMatrixAt(i, dummy.matrix);

        const bar = staminaBarMeshRef.current;
        if (bar) {
          setStaminaBarInstance(
            staminaBarDummyRef.current,
            finalX, baseY, finalZ,
            sc,
            state.stamina,
            state.fleeing,
          );
          bar.setMatrixAt(i, staminaBarDummyRef.current.matrix);
          if (state.fleeing) bar.setColorAt(i, staminaColor(state.stamina));
        }
        return;
      }

      // ── Flyers (flamingos, herons, gulls): waddle first, then take flight ─
      const groundDecay = Math.pow(GROUND_RETURN_DECAY, dtScale);

      // Ground collision while on or near the ground
      if (state.t < 0.4) {
        const bumpSumR = BODY_RADIUS.wading * b.scale + PLAYER_RADIUS;
        const push = computeCirclePush(curX, curZ, px, pz, bumpSumR);
        if (push && push.overlap > 0.05) {
          state.dx += push.px;
          state.dz += push.pz;
          state.flightTriggered = true; // bump → immediate takeoff
          playerBumped = true;
        }
        // Static obstacles — deflect waddling flyers before they take off.
        const obs = resolveObstaclePush(curX, curZ, BODY_RADIUS.wading * b.scale);
        if (obs.hit) {
          state.dx += obs.px;
          state.dz += obs.pz;
        }
      }

      // Flee hysteresis
      if (distSq < SCATTER_SQ) {
        if (!state.fleeing) state.scaredSince = time;
        state.fleeing = true;
      } else if (distSq > SCATTER_EXIT_SQ) {
        state.fleeing = false;
        state.scaredSince = 0;
      }

      // Ground waddle while not yet committed to flight
      if (state.fleeing && state.t < 0.3) {
        state.stamina = Math.max(0, state.stamina - FATIGUE_RATE * dt);
        if (!haveFleeingSample) {
          haveFleeingSample = true;
          sampleFleeingX = curX;
          sampleFleeingZ = curZ;
        }
        const dist = Math.sqrt(distSq) || 1;
        if (time >= state.fleeJitterNext) {
          state.fleeJitter = (Math.random() * 2 - 1) * FLEE_JITTER;
          state.fleeJitterNext = time + 1.5 + Math.random() * 1.0;
        }
        const awayX = toPlayerX / dist;
        const awayZ = toPlayerZ / dist;
        const jc = Math.cos(state.fleeJitter);
        const js = Math.sin(state.fleeJitter);
        const fleeX = awayX * jc - awayZ * js;
        const fleeZ = awayX * js + awayZ * jc;
        const staminaMult = Math.max(MIN_STAMINA_SPEED, state.stamina);
        const stepX = fleeX * WADDLE_FLEE_SPEED * b.speedMult * staminaMult * dtScale;
        const stepZ = fleeZ * WADDLE_FLEE_SPEED * b.speedMult * staminaMult * dtScale;
        const move = resolveTerrainStep(
          spawnX + state.dx, spawnZ + state.dz, stepX, stepZ,
          GRAZER_TERRAIN.min, GRAZER_TERRAIN.max,
        );
        state.dx += move.dx;
        state.dz += move.dz;
      } else if (!state.fleeing) {
        state.stamina = Math.min(1, state.stamina + RECOVERY_RATE * dt);
      }
      if (!state.fleeing) {
        state.dx *= groundDecay;
        state.dz *= groundDecay;
      }

      // Clamp ground offset
      const groundFleeSq = state.dx * state.dx + state.dz * state.dz;
      if (groundFleeSq > WADDLE_MAX_SQ) {
        const clamp = WADDLE_MAX / Math.sqrt(groundFleeSq);
        state.dx *= clamp;
        state.dz *= clamp;
      }

      // Flight triggers: player pushes too close, lingers too long, or bird hit max waddle
      if (state.fleeing && !state.flightTriggered) {
        const tooClose = distSq < FLUSH_SQ;
        const lingered = state.scaredSince > 0 && time - state.scaredSince > FLIGHT_DELAY;
        const maxedWaddle = groundFleeSq > WADDLE_MAX_SQ * 0.8;
        if (tooClose || lingered || maxedWaddle) state.flightTriggered = true;
      }

      // Flight progress — only ramp up once flight is triggered
      if (state.flightTriggered && state.fleeing) {
        state.t = Math.min(1, state.t + TAKEOFF_RATE * b.speedMult * dtScale);
      } else if (!state.fleeing) {
        state.t = Math.max(0, state.t - LANDING_RATE * dtScale);
        if (state.t < 0.01) {
          state.flightTriggered = false;
          state.scaredSince = 0;
        }
      }
      if (state.t > 0.05) airborneNow++;
      if (state.t > 0.05) {
        state.theta += CIRCLE_SPEED * b.speedMult * dt;
      }

      // Position: blend from current ground position to orbit
      const t = state.t;
      const s = t * t * (3 - 2 * t); // smoothstep
      const groundX = spawnX + state.dx;
      const groundZ = spawnZ + state.dz;
      const airAngle = state.theta + b.circlePhase;
      const cosA = Math.cos(airAngle);
      const sinA = Math.sin(airAngle);
      const airX = b.circleCenter[0] + cosA * b.circleRadius;
      const airZ = b.circleCenter[1] + sinA * b.circleRadius;

      const x = groundX + (airX - groundX) * s;
      const z = groundZ + (airZ - groundZ) * s;
      const groundY = (state.dx !== 0 || state.dz !== 0)
        ? getTerrainHeight(groundX, groundZ)
        : b.position[1];
      const groundBob = (1 - s) * Math.sin(time * 1.6 + i * 1.3) * 0.02;
      const y = groundY + groundBob + b.maxAltitude * s;

      // Facing: orbit tangent when airborne, flee direction when waddling, else hold
      const airFacing = -Math.atan2(cosA, -sinA);
      let facing: number;
      if (s > 0.2) {
        facing = airFacing;
      } else if (state.fleeing && groundFleeSq > 0.5) {
        facing = -Math.atan2(state.dz, state.dx);
        state.lastFacing = facing;
      } else {
        facing = state.lastFacing;
      }

      const sc = b.scale;
      dummy.position.set(x, y, z);
      dummy.rotation.set(0, facing, 0);
      dummy.scale.set(sc, sc, sc);
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);

      // Stamina bar — only while still waddling on the ground, hidden once
      // the flock committed to flight (airborne birds are out of reach).
      const bar = staminaBarMeshRef.current;
      if (bar) {
        const showBar = state.fleeing && state.t < 0.3;
        setStaminaBarInstance(
          staminaBarDummyRef.current,
          groundX, groundY, groundZ,
          sc,
          state.stamina,
          showBar,
        );
        bar.setMatrixAt(i, staminaBarDummyRef.current.matrix);
        if (showBar) bar.setColorAt(i, staminaColor(state.stamina));
      }
    });

    if (anyUpdated) meshRef.current.instanceMatrix.needsUpdate = true;
    if (staminaBarMeshRef.current) {
      staminaBarMeshRef.current.instanceMatrix.needsUpdate = true;
      if (staminaBarMeshRef.current.instanceColor) staminaBarMeshRef.current.instanceColor.needsUpdate = true;
    }

    if (playerBumped && time - lastBumpRef.current > 0.9) {
      lastBumpRef.current = time;
      sfxBirdFlap(bumpX, bumpZ);
      if (species) {
        // Flightless runners (ostriches) bolt; flyers take wing. Reaction text
        // picks based on this flock's flight ceiling.
        const anyFlies = data.some(b => b.maxAltitude >= FLIGHTLESS_ALT);
        const reaction = anyFlies ? 'takes wing with a clatter' : 'bolts in alarm';
        useGameStore.getState().addNotification(species.name, 'info', {
          subtitle: `${species.latin} · ${reaction}`,
        });
      }
    }

    // Scatter SFX: wing flap when the flock starts taking off
    if (airborneNow > airborneCountRef.current && airborneNow >= 2 && time - lastSfxRef.current > 1.2) {
      if (haveFleeingSample) sfxBirdFlap(sampleFleeingX, sampleFleeingZ);
      else sfxBirdFlap();
      lastSfxRef.current = time;
    }
    airborneCountRef.current = airborneNow;
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
