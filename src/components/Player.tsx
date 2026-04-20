import { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useGameStore } from '../store/gameStore';
import * as THREE from 'three';
import { getTerrainHeight, getTerrainData } from '../utils/terrain';
import { getCrabData, getCollectedCrabs, collectCrabAt } from './World';
import { sfxFootstep, sfxThud } from '../audio/SoundEffects';
import {
  getLiveWalkingTransform,
  syncLiveWalkingTransform,
} from '../utils/livePlayerTransform';
import { spawnSplash } from '../utils/splashState';
import { resolveObstaclePush } from '../utils/obstacleGrid';
import { PLAYER_RADIUS } from '../utils/animalBump';

const CRAB_COLLECT_RADIUS_SQ = 1.5 * 1.5; // 1.5 units
const STORE_SYNC_INTERVAL = 1 / 12;
const THUD_COOLDOWN = 0.22; // seconds between thuds — prevents sliding-along-trunk chatter

export function Player() {
  const group = useRef<THREE.Group>(null);
  const leftLeg = useRef<THREE.Mesh>(null);
  const rightLeg = useRef<THREE.Mesh>(null);
  const leftArm = useRef<THREE.Mesh>(null);
  const rightArm = useRef<THREE.Mesh>(null);
  
  const setWalkingTransform = useGameStore((state) => state.setWalkingTransform);
  const playerMode = useGameStore((state) => state.playerMode);
  const paused = useGameStore((state) => state.paused);
  const viewMode = useGameStore((state) => state.viewMode);
  
  const { camera } = useThree();
  const keys = useRef({ w: false, a: false, s: false, d: false });
  const isMoving = useRef(false);
  const jumpVelocity = useRef(0);
  const isJumping = useRef(false);
  const jumpHeight = useRef(0); // height above terrain
  const waterTimer = useRef(0); // seconds spent in water
  const waterWarningStage = useRef(0); // 0=none, 1=entered, 2=urgent, 3=final
  const lastFootstepSign = useRef(1); // tracks walk cycle for footstep sounds
  const storeSyncAccum = useRef(0);
  const lastThud = useRef(0);
  const _camForward = useRef(new THREE.Vector3());
  const _camRight = useRef(new THREE.Vector3());

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() in keys.current) keys.current[e.key.toLowerCase() as keyof typeof keys.current] = true;
      if (e.key === ' ' && playerMode === 'walking' && !isJumping.current && !paused) {
        e.preventDefault();
        isJumping.current = true;
        jumpVelocity.current = 12; // initial upward velocity
        jumpHeight.current = 0;
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() in keys.current) keys.current[e.key.toLowerCase() as keyof typeof keys.current] = false;
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [playerMode, paused]);

  useEffect(() => {
    if (!group.current || playerMode !== 'walking') return;
    const { pos, rot } = getLiveWalkingTransform();
    group.current.position.set(pos[0], pos[1], pos[2]);
    group.current.rotation.y = rot;
  }, [playerMode]);

  useEffect(() => {
    if (playerMode === 'walking' || !group.current) return;
    const { pos, rot } = getLiveWalkingTransform();
    group.current.position.set(pos[0], pos[1], pos[2]);
    group.current.rotation.y = rot;
    setWalkingTransform({ pos: [pos[0], pos[1], pos[2]], rot });
    storeSyncAccum.current = 0;
  }, [playerMode, setWalkingTransform]);

  useFrame((state, delta) => {
    if (playerMode !== 'walking' || !group.current || paused) return;
    const store = useGameStore.getState();
    const walking = getLiveWalkingTransform();
    const walkingPos = walking.pos;
    const walkingRot = walking.rot;

    const speed = 10 * delta;
    const GRAVITY = 30;

    // Get camera forward/right projected onto XZ plane
    const camForward = _camForward.current;
    camera.getWorldDirection(camForward);
    camForward.y = 0;
    camForward.normalize();
    const camRight = _camRight.current.set(-camForward.z, 0, camForward.x);

    // Build input vector
    let inputX = 0;
    let inputZ = 0;
    if (keys.current.w) inputZ += 1;
    if (keys.current.s) inputZ -= 1;
    if (keys.current.d) inputX += 1;
    if (keys.current.a) inputX -= 1;

    // Transform input by camera orientation
    let moveX = 0;
    let moveZ = 0;
    const inputLen = Math.sqrt(inputX * inputX + inputZ * inputZ);
    if (inputLen > 0) {
      const nx = inputX / inputLen;
      const nz = inputZ / inputLen;
      moveX = (camRight.x * nx + camForward.x * nz) * speed;
      moveZ = (camRight.z * nx + camForward.z * nz) * speed;
    }

    isMoving.current = moveX !== 0 || moveZ !== 0;

    // Jump physics
    if (isJumping.current) {
      jumpVelocity.current -= GRAVITY * delta;
      jumpHeight.current += jumpVelocity.current * delta;

      if (jumpHeight.current <= 0) {
        // Landing
        jumpHeight.current = 0;
        isJumping.current = false;
        jumpVelocity.current = 0;

        // Check if we landed in water → death
        const terrainH = getTerrainHeight(walkingPos[0], walkingPos[2]);
        if (terrainH < -1) {
          spawnSplash(walkingPos[0], walkingPos[2], 0.7);
          store.triggerGameOver('Drowned after a fatal plunge into the depths.');
          return;
        }
        // Splash on landing near water's edge
        if (terrainH < 0) {
          spawnSplash(walkingPos[0], walkingPos[2], 0.3);
        }
      }
    }

    if (isMoving.current) {
      // Calculate target rotation
      const targetRot = Math.atan2(moveX, moveZ);

      // Smooth rotation — fast lerp so character faces movement direction quickly
      let rotDiff = targetRot - walkingRot;
      while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
      while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;

      const rotLerp = 1 - Math.pow(0.001, delta); // ~exponential ease, frame-rate independent
      const newRot = walkingRot + rotDiff * rotLerp;
      group.current.rotation.y = newRot;

      // Update position
      let newX = walkingPos[0] + moveX;
      let newZ = walkingPos[2] + moveZ;

      // Tree / rock collision — eject out of any overlap and, if the player is
      // actively pressing into the obstacle, play a debounced thud.
      const push = resolveObstaclePush(newX, newZ, PLAYER_RADIUS);
      if (push.hit) {
        newX += push.px;
        newZ += push.pz;
        // Positive dot means the input motion was heading into the obstacle,
        // i.e. the push opposed it — a real collision, not incidental overlap.
        const inwardDot = -(moveX * push.px + moveZ * push.pz);
        if (inwardDot > 0 && push.depth > 0.04) {
          const now = state.clock.elapsedTime;
          if (now - lastThud.current > THUD_COOLDOWN) {
            lastThud.current = now;
            sfxThud();
          }
          // Small extra bounce so the character visibly rebounds rather than
          // sliding flush against the trunk.
          newX += push.px * 0.25;
          newZ += push.pz * 0.25;
        }
      }

      const terrainY = getTerrainHeight(newX, newZ);

      // While jumping, allow movement over water
      if (isJumping.current) {
        const displayY = terrainY + jumpHeight.current;
        const nextPos: [number, number, number] = [newX, terrainY, newZ];
        syncLiveWalkingTransform(nextPos, newRot);
        storeSyncAccum.current += delta;
        if (storeSyncAccum.current >= STORE_SYNC_INTERVAL) {
          setWalkingTransform({ pos: nextPos, rot: newRot });
          storeSyncAccum.current = 0;
        }
        group.current.position.set(newX, displayY, newZ);
      } else if (terrainY > -2) {
        const nextPos: [number, number, number] = [newX, terrainY, newZ];
        syncLiveWalkingTransform(nextPos, newRot);
        storeSyncAccum.current += delta;
        if (storeSyncAccum.current >= STORE_SYNC_INTERVAL) {
          setWalkingTransform({ pos: nextPos, rot: newRot });
          storeSyncAccum.current = 0;
        }
        group.current.position.set(nextPos[0], nextPos[1], nextPos[2]);
      }
    } else {
      const displayY = walkingPos[1] + jumpHeight.current;
      group.current.position.set(walkingPos[0], displayY, walkingPos[2]);
      group.current.rotation.y = walkingRot;
    }

    // Drowning timer — track time spent in water
    const currentTerrainH = getTerrainHeight(walkingPos[0], walkingPos[2]);
    if (currentTerrainH < -0.5 && !isJumping.current) {
      // Splash on first entry into water
      if (waterTimer.current === 0) {
        spawnSplash(walkingPos[0], walkingPos[2], 0.4);
      }
      waterTimer.current += delta;

      if (waterTimer.current >= 30) {
        store.triggerGameOver('Swallowed by the sea. The waves closed overhead and did not part again.');
        return;
      } else if (waterTimer.current >= 22 && waterWarningStage.current < 3) {
        waterWarningStage.current = 3;
        store.addNotification('GET OUT NOW!!!', 'warning', { size: 'grand' });
      } else if (waterTimer.current >= 12 && waterWarningStage.current < 2) {
        waterWarningStage.current = 2;
        store.addNotification('GET OUT BEFORE YOU DROWN, THIS IS NO JOKE!', 'warning', { size: 'grand' });
      } else if (waterTimer.current >= 2 && waterWarningStage.current < 1) {
        waterWarningStage.current = 1;
        store.addNotification('You are wading into dangerous water...', 'warning');
      }
    } else {
      if (waterTimer.current > 0) {
        waterTimer.current = 0;
        waterWarningStage.current = 0;
      }
    }

    // Check crab collection
    const currentPos = getLiveWalkingTransform().pos;
    const crabs = getCrabData();
    const collected = getCollectedCrabs();
    for (let i = 0; i < crabs.length; i++) {
      if (collected.has(i)) continue;
      const dx = crabs[i].position[0] - currentPos[0];
      const dz = crabs[i].position[2] - currentPos[2];
      if (dx * dx + dz * dz < CRAB_COLLECT_RADIUS_SQ) {
        collectCrabAt(i);
        store.collectCrab();
        break; // one per frame max
      }
    }

    // Animate limbs
    if (isJumping.current) {
      // Arms raised overhead, legs tucked
      if (leftArm.current) leftArm.current.rotation.x = -2.2;
      if (rightArm.current) rightArm.current.rotation.x = -2.2;
      if (leftLeg.current) leftLeg.current.rotation.x = 0.4;
      if (rightLeg.current) rightLeg.current.rotation.x = -0.4;
    } else if (isMoving.current) {
      const t = state.clock.elapsedTime * 10;
      const sinT = Math.sin(t);
      if (leftLeg.current) leftLeg.current.rotation.x = sinT * 0.5;
      if (rightLeg.current) rightLeg.current.rotation.x = -sinT * 0.5;
      if (leftArm.current) leftArm.current.rotation.x = -sinT * 0.5;
      if (rightArm.current) rightArm.current.rotation.x = sinT * 0.5;

      // Footstep sound — fires when leg swings through zero (foot strikes ground)
      const currentSign = sinT >= 0 ? 1 : -1;
      if (currentSign !== lastFootstepSign.current) {
        lastFootstepSign.current = currentSign;
        const pos = getLiveWalkingTransform().pos;
        const terrain = getTerrainData(pos[0], pos[2]);
        sfxFootstep(terrain.biome);
      }
    } else {
      if (leftLeg.current) leftLeg.current.rotation.x = 0;
      if (rightLeg.current) rightLeg.current.rotation.x = 0;
      if (leftArm.current) leftArm.current.rotation.x = 0;
      if (rightArm.current) rightArm.current.rotation.x = 0;
    }
  }, -2);

  if (playerMode !== 'walking') return null;

  return (
    <group ref={group} visible={viewMode !== 'firstperson'}>
      {/* Head */}
      <mesh position={[0, 1.8, 0]} castShadow>
        <sphereGeometry args={[0.2, 16, 16]} />
        <meshStandardMaterial color="#ffccaa" />
      </mesh>
      
      {/* Body */}
      <mesh position={[0, 1.1, 0]} castShadow>
        <cylinderGeometry args={[0.15, 0.15, 1]} />
        <meshStandardMaterial color="#3366cc" />
      </mesh>
      
      {/* Arms */}
      <group position={[-0.25, 1.5, 0]}>
        <mesh ref={leftArm} position={[0, -0.3, 0]} castShadow>
          <cylinderGeometry args={[0.08, 0.08, 0.8]} />
          <meshStandardMaterial color="#ffccaa" />
        </mesh>
      </group>
      <group position={[0.25, 1.5, 0]}>
        <mesh ref={rightArm} position={[0, -0.3, 0]} castShadow>
          <cylinderGeometry args={[0.08, 0.08, 0.8]} />
          <meshStandardMaterial color="#ffccaa" />
        </mesh>
      </group>
      
      {/* Legs */}
      <group position={[-0.1, 0.6, 0]}>
        <mesh ref={leftLeg} position={[0, -0.3, 0]} castShadow>
          <cylinderGeometry args={[0.1, 0.1, 0.8]} />
          <meshStandardMaterial color="#222222" />
        </mesh>
      </group>
      <group position={[0.1, 0.6, 0]}>
        <mesh ref={rightLeg} position={[0, -0.3, 0]} castShadow>
          <cylinderGeometry args={[0.1, 0.1, 0.8]} />
          <meshStandardMaterial color="#222222" />
        </mesh>
      </group>
    </group>
  );
}
