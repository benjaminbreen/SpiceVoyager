import { useRef, useEffect, useMemo } from 'react';
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
import { huntAimAngle, landWeaponReload } from '../utils/combatState';
import { LAND_WEAPON_DEFS } from '../store/gameStore';
import { derivePlayerAppearance } from '../utils/playerAppearance';
import { Hat } from './playerParts/Hat';

const CRAB_COLLECT_RADIUS_SQ = 1.5 * 1.5; // 1.5 units
const STORE_SYNC_INTERVAL = 1 / 12;
const THUD_COOLDOWN = 0.22; // seconds between thuds — prevents sliding-along-trunk chatter

// ── Rig measurements (single source of truth — change here to scale the figure) ──
const RIG = {
  pelvisY: 0.95,        // hip joint height
  torsoLen: 0.55,       // top of pelvis → base of neck
  torsoR: 0.165,        // body cylinder radius
  shoulderHalfWidth: 0.21,
  shoulderY: 0.5,       // height above pelvis
  upperArmLen: 0.34,
  upperArmR: 0.07,
  forearmLen: 0.32,
  forearmR: 0.06,
  handR: 0.07,
  hipHalfWidth: 0.1,
  upperLegLen: 0.42,
  upperLegR: 0.095,
  lowerLegLen: 0.42,
  lowerLegR: 0.085,
  bootR: 0.1,
  bootH: 0.12,
  neckLen: 0.1,
  neckR: 0.075,
  headR: 0.2,
};

export function Player() {
  // ── Refs for the joint hierarchy ──
  const group = useRef<THREE.Group>(null);
  const pelvis = useRef<THREE.Group>(null);
  const torso = useRef<THREE.Group>(null);
  const headGroup = useRef<THREE.Group>(null);
  const lShoulder = useRef<THREE.Group>(null);
  const rShoulder = useRef<THREE.Group>(null);
  const lElbow = useRef<THREE.Group>(null);
  const rElbow = useRef<THREE.Group>(null);
  const lHip = useRef<THREE.Group>(null);
  const rHip = useRef<THREE.Group>(null);
  const lKnee = useRef<THREE.Group>(null);
  const rKnee = useRef<THREE.Group>(null);
  const weaponPivot = useRef<THREE.Group>(null);
  const musketGroup = useRef<THREE.Group>(null);
  const bowGroup = useRef<THREE.Group>(null);

  const setWalkingTransform = useGameStore((state) => state.setWalkingTransform);
  const playerMode = useGameStore((state) => state.playerMode);
  const paused = useGameStore((state) => state.paused);
  const viewMode = useGameStore((state) => state.viewMode);

  // ── Captain identity → appearance ──
  // Subscribe to the captain. Keep the selector cheap by only returning the
  // identity-relevant fields so unrelated captain mutations (XP, morale)
  // don't re-derive the appearance.
  const captainKey = useGameStore((s) => {
    const c = s.crew.find((m) => m.role === 'Captain');
    return c ? `${c.id}|${c.nationality}|${c.quality}|${c.age}` : null;
  });
  const appearance = useMemo(() => {
    const captain = useGameStore.getState().crew.find((m) => m.role === 'Captain');
    return derivePlayerAppearance(captain);
  }, [captainKey]);

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

    // ── Hunting weapon pivot ─────────────────────────────────────────────────
    // Visible only in combat mode. Rotated to face the cursor (huntAimAngle is
    // in world space; subtract walker rotation for local space). Switches
    // between musket / bow based on activeLandWeapon. While reloading, the
    // pivot droops slightly so the player can read the cooldown without UI.
    if (weaponPivot.current && musketGroup.current && bowGroup.current) {
      const showWeapon = store.combatMode;
      weaponPivot.current.visible = showWeapon;
      if (showWeapon) {
        const localAim = huntAimAngle - walkingRot;
        weaponPivot.current.rotation.y = localAim;
        const active = store.activeLandWeapon;
        musketGroup.current.visible = active === 'musket';
        bowGroup.current.visible = active === 'bow';
        // Reload droop — pivot tilts down while reloading, levels off when ready
        const def = LAND_WEAPON_DEFS[active];
        const readyAt = landWeaponReload[active] ?? 0;
        const remaining = Math.max(0, readyAt - Date.now());
        const reloadFrac = Math.min(1, remaining / (def.reloadTime * 1000));
        weaponPivot.current.rotation.x = reloadFrac * 0.7;  // 0 = level, 0.7 = pointing down
      }
    }

    // ── Limb animation ───────────────────────────────────────────────────────
    // Drives shoulders/hips for walk, jump, and idle. Pose system (Step 2)
    // will replace this branch with a unified pose blend.
    const lSh = lShoulder.current;
    const rSh = rShoulder.current;
    const lHi = lHip.current;
    const rHi = rHip.current;
    const lKn = lKnee.current;
    const rKn = rKnee.current;

    if (isJumping.current) {
      if (lSh) lSh.rotation.x = -2.2;
      if (rSh) rSh.rotation.x = -2.2;
      if (lHi) lHi.rotation.x = 0.4;
      if (rHi) rHi.rotation.x = -0.4;
      if (lKn) lKn.rotation.x = -0.6;
      if (rKn) rKn.rotation.x = -0.6;
    } else if (isMoving.current) {
      const t = state.clock.elapsedTime * 10;
      const sinT = Math.sin(t);
      if (lHi) lHi.rotation.x = sinT * 0.5;
      if (rHi) rHi.rotation.x = -sinT * 0.5;
      // Bend knees on backswing for a slightly more natural step
      if (lKn) lKn.rotation.x = Math.max(0, -sinT) * 0.4;
      if (rKn) rKn.rotation.x = Math.max(0, sinT) * 0.4;
      if (lSh) lSh.rotation.x = -sinT * 0.5;
      if (rSh) rSh.rotation.x = sinT * 0.5;

      // Footstep sound — fires when leg swings through zero (foot strikes ground)
      const currentSign = sinT >= 0 ? 1 : -1;
      if (currentSign !== lastFootstepSign.current) {
        lastFootstepSign.current = currentSign;
        const pos = getLiveWalkingTransform().pos;
        const terrain = getTerrainData(pos[0], pos[2]);
        sfxFootstep(terrain.biome);
      }
    } else {
      if (lSh) lSh.rotation.x = 0;
      if (rSh) rSh.rotation.x = 0;
      if (lHi) lHi.rotation.x = 0;
      if (rHi) rHi.rotation.x = 0;
      if (lKn) lKn.rotation.x = 0;
      if (rKn) rKn.rotation.x = 0;
    }
  }, -2);

  if (playerMode !== 'walking') return null;

  // ── Geometry / material helpers (memoize-friendly via JSX) ──
  const skin = appearance.skinColor;
  const torsoColor = appearance.wearsRobe ? appearance.robeColor : appearance.doubletColor;
  const torsoTrim = appearance.wearsRobe ? appearance.robeTrim : appearance.doubletTrim;
  const legColor = appearance.wearsRobe ? appearance.robeColor : appearance.breechesColor;
  const torsoLowerLen = appearance.wearsRobe ? RIG.torsoLen + 0.4 : RIG.torsoLen; // robe reaches lower
  const torsoLowerR = appearance.wearsRobe ? RIG.torsoR * 1.25 : RIG.torsoR;

  return (
    <group ref={group} visible={viewMode !== 'firstperson'}>
      {/* ── Pelvis (root of locomotion + posture) ───────────────────────── */}
      <group ref={pelvis} position={[0, RIG.pelvisY, 0]}>

        {/* ── Torso ───────────────────────────────────────────────────── */}
        <group ref={torso}>
          {/* Doublet / robe body — tapered cylinder */}
          <mesh position={[0, RIG.torsoLen * 0.5, 0]} castShadow>
            <cylinderGeometry args={[torsoLowerR * 0.85, torsoLowerR, torsoLowerLen, 12]} />
            <meshStandardMaterial color={torsoColor} roughness={0.85} />
          </mesh>
          {/* Collar / neckline trim */}
          <mesh position={[0, RIG.torsoLen - 0.04, 0]} castShadow>
            <cylinderGeometry args={[RIG.torsoR * 0.95, RIG.torsoR * 0.95, 0.04, 12]} />
            <meshStandardMaterial color={torsoTrim} roughness={0.7} metalness={appearance.wearsRobe ? 0.2 : 0.0} />
          </mesh>
          {/* Belt / sash at waist */}
          <mesh position={[0, RIG.torsoLen * 0.18, 0]} castShadow>
            <cylinderGeometry args={[torsoLowerR * 1.02, torsoLowerR * 1.02, 0.07, 12]} />
            <meshStandardMaterial color={appearance.wearsRobe ? appearance.robeTrim : '#2a1a0e'} roughness={0.85} />
          </mesh>

          {/* Neck kerchief — small flat ring around base of neck */}
          {appearance.hasNeckKerchief && (
            <mesh position={[0, RIG.torsoLen + 0.02, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
              <torusGeometry args={[RIG.neckR * 1.4, 0.025, 6, 14]} />
              <meshStandardMaterial color={appearance.kerchiefColor} roughness={0.85} />
            </mesh>
          )}

          {/* ── Neck → Head ───────────────────────────────────────── */}
          <mesh position={[0, RIG.torsoLen + RIG.neckLen * 0.5, 0]} castShadow>
            <cylinderGeometry args={[RIG.neckR, RIG.neckR, RIG.neckLen, 10]} />
            <meshStandardMaterial color={skin} roughness={0.85} />
          </mesh>
          <group ref={headGroup} position={[0, RIG.torsoLen + RIG.neckLen + RIG.headR, 0]}>
            {/* Skull */}
            <mesh castShadow>
              <sphereGeometry args={[RIG.headR, 16, 14]} />
              <meshStandardMaterial color={skin} roughness={0.85} />
            </mesh>
            {/* Hair — half-sphere cap visible at sides/back when hat is small */}
            <mesh position={[0, 0.02, 0]} castShadow>
              <sphereGeometry args={[RIG.headR * 1.02, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
              <meshStandardMaterial color={appearance.hairColor} roughness={0.95} />
            </mesh>
            {/* Beard */}
            {appearance.hasBeard && (
              <mesh position={[0, -RIG.headR * 0.55, RIG.headR * 0.55]} castShadow>
                <sphereGeometry args={[RIG.headR * 0.62, 10, 8, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.45]} />
                <meshStandardMaterial color={appearance.beardColor} roughness={0.95} />
              </mesh>
            )}
            {/* Earring (right side) */}
            {appearance.hasEarring && (
              <mesh position={[-RIG.headR * 0.92, -RIG.headR * 0.15, 0]} castShadow>
                <sphereGeometry args={[0.022, 6, 6]} />
                <meshStandardMaterial color="#c8a040" metalness={0.85} roughness={0.2} />
              </mesh>
            )}
            {/* Eye patch */}
            {appearance.hasEyePatch && (
              <mesh
                position={[
                  appearance.eyePatchSide * RIG.headR * 0.4,
                  RIG.headR * 0.18,
                  RIG.headR * 0.86,
                ]}
                castShadow
              >
                <boxGeometry args={[0.1, 0.08, 0.02]} />
                <meshStandardMaterial color="#0a0a0a" roughness={0.95} />
              </mesh>
            )}
            {/* Scar — thin red line on cheek */}
            {appearance.isScarred && (
              <mesh position={[RIG.headR * 0.76, -RIG.headR * 0.05, RIG.headR * 0.55]} rotation={[0, 0, -0.4]}>
                <boxGeometry args={[0.008, 0.09, 0.005]} />
                <meshStandardMaterial color="#7a2e1a" roughness={0.9} />
              </mesh>
            )}
            {/* East-Asian queue (braid down the back) */}
            {appearance.hasQueue && (
              <mesh position={[0, -RIG.headR * 0.4, -RIG.headR * 0.95]} rotation={[0.2, 0, 0]} castShadow>
                <cylinderGeometry args={[0.022, 0.012, 0.55, 6]} />
                <meshStandardMaterial color={appearance.hairColor} roughness={0.95} />
              </mesh>
            )}
            {/* Hat */}
            <Hat type={appearance.hat} color={appearance.hatColor} accent={appearance.hatAccent} />
          </group>

          {/* ── Shoulders → Arms ────────────────────────────────────── */}
          <group ref={lShoulder} position={[-RIG.shoulderHalfWidth, RIG.shoulderY, 0]}>
            {/* Upper arm — pivots from shoulder */}
            <mesh position={[0, -RIG.upperArmLen * 0.5, 0]} castShadow>
              <cylinderGeometry args={[RIG.upperArmR, RIG.upperArmR * 0.95, RIG.upperArmLen, 8]} />
              <meshStandardMaterial color={torsoColor} roughness={0.85} />
            </mesh>
            <group ref={lElbow} position={[0, -RIG.upperArmLen, 0]}>
              <mesh position={[0, -RIG.forearmLen * 0.5, 0]} castShadow>
                <cylinderGeometry args={[RIG.forearmR, RIG.forearmR * 0.85, RIG.forearmLen, 8]} />
                <meshStandardMaterial color={skin} roughness={0.85} />
              </mesh>
              {/* Hand */}
              <mesh position={[0, -RIG.forearmLen - RIG.handR * 0.7, 0]} castShadow>
                <sphereGeometry args={[RIG.handR, 8, 6]} />
                <meshStandardMaterial color={skin} roughness={0.85} />
              </mesh>
            </group>
          </group>

          <group ref={rShoulder} position={[RIG.shoulderHalfWidth, RIG.shoulderY, 0]}>
            <mesh position={[0, -RIG.upperArmLen * 0.5, 0]} castShadow>
              <cylinderGeometry args={[RIG.upperArmR, RIG.upperArmR * 0.95, RIG.upperArmLen, 8]} />
              <meshStandardMaterial color={torsoColor} roughness={0.85} />
            </mesh>
            <group ref={rElbow} position={[0, -RIG.upperArmLen, 0]}>
              <mesh position={[0, -RIG.forearmLen * 0.5, 0]} castShadow>
                <cylinderGeometry args={[RIG.forearmR, RIG.forearmR * 0.85, RIG.forearmLen, 8]} />
                <meshStandardMaterial color={skin} roughness={0.85} />
              </mesh>
              <mesh position={[0, -RIG.forearmLen - RIG.handR * 0.7, 0]} castShadow>
                <sphereGeometry args={[RIG.handR, 8, 6]} />
                <meshStandardMaterial color={skin} roughness={0.85} />
              </mesh>
            </group>
          </group>
        </group>

        {/* ── Hips → Legs ──────────────────────────────────────────────── */}
        {/* Robe characters: skip leg meshes — the long robe covers them. */}
        {!appearance.wearsRobe && (
          <>
            <group ref={lHip} position={[-RIG.hipHalfWidth, 0, 0]}>
              <mesh position={[0, -RIG.upperLegLen * 0.5, 0]} castShadow>
                <cylinderGeometry args={[RIG.upperLegR, RIG.upperLegR * 0.9, RIG.upperLegLen, 8]} />
                <meshStandardMaterial color={legColor} roughness={0.9} />
              </mesh>
              <group ref={lKnee} position={[0, -RIG.upperLegLen, 0]}>
                <mesh position={[0, -RIG.lowerLegLen * 0.5, 0]} castShadow>
                  <cylinderGeometry args={[RIG.lowerLegR, RIG.lowerLegR * 0.85, RIG.lowerLegLen, 8]} />
                  <meshStandardMaterial color={legColor} roughness={0.9} />
                </mesh>
                {/* Boot */}
                <mesh position={[0, -RIG.lowerLegLen - RIG.bootH * 0.4, 0.04]} castShadow>
                  <boxGeometry args={[RIG.bootR * 1.6, RIG.bootH, RIG.bootR * 2.2]} />
                  <meshStandardMaterial color={appearance.bootColor} roughness={0.85} />
                </mesh>
              </group>
            </group>

            <group ref={rHip} position={[RIG.hipHalfWidth, 0, 0]}>
              <mesh position={[0, -RIG.upperLegLen * 0.5, 0]} castShadow>
                <cylinderGeometry args={[RIG.upperLegR, RIG.upperLegR * 0.9, RIG.upperLegLen, 8]} />
                <meshStandardMaterial color={legColor} roughness={0.9} />
              </mesh>
              <group ref={rKnee} position={[0, -RIG.upperLegLen, 0]}>
                <mesh position={[0, -RIG.lowerLegLen * 0.5, 0]} castShadow>
                  <cylinderGeometry args={[RIG.lowerLegR, RIG.lowerLegR * 0.85, RIG.lowerLegLen, 8]} />
                  <meshStandardMaterial color={legColor} roughness={0.9} />
                </mesh>
                <mesh position={[0, -RIG.lowerLegLen - RIG.bootH * 0.4, 0.04]} castShadow>
                  <boxGeometry args={[RIG.bootR * 1.6, RIG.bootH, RIG.bootR * 2.2]} />
                  <meshStandardMaterial color={appearance.bootColor} roughness={0.85} />
                </mesh>
              </group>
            </group>
          </>
        )}
        {/* Robe characters need a hint of feet under the hem so they don't
            look like floating bells. Two small dark boxes do the trick. */}
        {appearance.wearsRobe && (
          <>
            <mesh position={[-RIG.hipHalfWidth - 0.02, -RIG.upperLegLen - RIG.lowerLegLen + 0.02, 0.05]} castShadow>
              <boxGeometry args={[RIG.bootR * 1.6, 0.08, RIG.bootR * 2.0]} />
              <meshStandardMaterial color={appearance.bootColor} roughness={0.85} />
            </mesh>
            <mesh position={[RIG.hipHalfWidth + 0.02, -RIG.upperLegLen - RIG.lowerLegLen + 0.02, 0.05]} castShadow>
              <boxGeometry args={[RIG.bootR * 1.6, 0.08, RIG.bootR * 2.0]} />
              <meshStandardMaterial color={appearance.bootColor} roughness={0.85} />
            </mesh>
          </>
        )}
      </group>

      {/* ── Hunting weapon pivot ─────────────────────────────────────────────
          Anchored at chest height — Step 2 (pose system) will move this onto
          the right hand for the musket and left hand for the bow.            */}
      <group ref={weaponPivot} position={[0, 1.4, 0]} visible={false}>
        {/* Musket: long stock + barrel along +Z */}
        <group ref={musketGroup}>
          <mesh position={[0, -0.05, -0.2]} castShadow>
            <boxGeometry args={[0.08, 0.12, 0.35]} />
            <meshStandardMaterial color="#5a3a20" roughness={0.9} />
          </mesh>
          <mesh position={[0, 0, 0.55]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.025, 0.025, 1.1, 8]} />
            <meshStandardMaterial color="#2a2a2a" roughness={0.4} metalness={0.7} />
          </mesh>
          <mesh position={[0.04, -0.02, 0.15]} castShadow>
            <boxGeometry args={[0.04, 0.06, 0.1]} />
            <meshStandardMaterial color="#666" metalness={0.6} roughness={0.5} />
          </mesh>
        </group>

        {/* Bow */}
        <group ref={bowGroup} visible={false}>
          <mesh position={[0, 0.18, 0.05]} rotation={[0, 0, -0.35]} castShadow>
            <cylinderGeometry args={[0.018, 0.014, 0.42, 6]} />
            <meshStandardMaterial color="#4a2a18" roughness={0.85} />
          </mesh>
          <mesh position={[0, -0.18, 0.05]} rotation={[0, 0, 0.35]} castShadow>
            <cylinderGeometry args={[0.014, 0.018, 0.42, 6]} />
            <meshStandardMaterial color="#4a2a18" roughness={0.85} />
          </mesh>
          <mesh position={[0, 0, 0.06]} castShadow>
            <boxGeometry args={[0.04, 0.12, 0.04]} />
            <meshStandardMaterial color="#3a1f10" roughness={0.95} />
          </mesh>
          <mesh position={[0, 0, -0.08]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.005, 0.005, 0.36, 4]} />
            <meshStandardMaterial color="#e8dcb0" roughness={0.9} />
          </mesh>
          <mesh position={[0, 0, 0.35]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.008, 0.008, 0.7, 5]} />
            <meshStandardMaterial color="#c8a878" roughness={0.8} />
          </mesh>
        </group>
      </group>
    </group>
  );
}
