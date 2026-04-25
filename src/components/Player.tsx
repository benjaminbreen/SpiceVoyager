import { useRef, useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useGameStore } from '../store/gameStore';
import * as THREE from 'three';
import { getTerrainHeight, getTerrainData } from '../utils/terrain';
import { buildRoadSurfaceIndex, getGroundHeight, RoadSurfaceIndex } from '../utils/roadSurface';
import { getCrabData, getCollectedCrabs, collectCrabAt } from './World';
import { sfxFootstep, sfxThud } from '../audio/SoundEffects';
import {
  getLiveWalkingTransform,
  syncLiveWalkingTransform,
} from '../utils/livePlayerTransform';
import { spawnSplash } from '../utils/splashState';
import { resolveObstaclePush } from '../utils/obstacleGrid';
import { resolvePedestrianPush } from '../utils/livePedestrians';
import { PLAYER_RADIUS } from '../utils/animalBump';
import { huntAimAngle, huntAimPitch, landWeaponReload } from '../utils/combatState';
import { touchWalkInput } from '../utils/touchInput';
import { LAND_WEAPON_DEFS } from '../store/gameStore';
import { derivePlayerAppearance } from '../utils/playerAppearance';
import { Hat } from './playerParts/Hat';
import { applyRimLightToTree, updateRimFromFog } from '../utils/rimLight';

// Max upward step the player's visual Y will take per frame when the
// ground-height query jumps (e.g. stepping from grass onto a road ribbon
// lifted ~0.1u, or walking onto a bridge ramp). Without this, each road
// edge is a visible vertical pop. 2.4 u/s ≈ invisible at 60fps for any
// single-tier step yet still lets bridge abutment ramps feel instant.
const MAX_STEP_UP_PER_SEC = 2.4;
const MAX_STEP_DOWN_PER_SEC = 6.0; // drops are less jarring, allow faster

const CRAB_COLLECT_RADIUS_SQ = 1.5 * 1.5; // 1.5 units
const STORE_SYNC_INTERVAL = 1 / 12;
const THUD_COOLDOWN = 0.22; // seconds between thuds — prevents sliding-along-trunk chatter
const TORSO_PITCH_FACTOR = 0.3;
const WEAPON_PITCH_FACTOR = 0.72;

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

  // Build a spatial index of the current port's roads once per port load.
  // The useFrame loop hits this for every ground-height query; bucketing by
  // XZ cell keeps it O(~segs in cell) instead of O(total segs).
  const portRoads = useGameStore((s) => s.ports[0]?.roads);
  const roadIndexRef = useRef<RoadSurfaceIndex>(buildRoadSurfaceIndex(undefined));
  useEffect(() => {
    roadIndexRef.current = buildRoadSurfaceIndex(portRoads);
  }, [portRoads]);

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
  const rimPatchedFrames = useRef(0);

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
    // Rim-light patch + uniform sync. Patch repeatedly for the first few
    // frames so materials added by child components after mount get caught;
    // applyRimLight is idempotent. Uniform update runs every frame.
    if (group.current && rimPatchedFrames.current < 8) {
      applyRimLightToTree(group.current, { intensityMul: 0.85 });
      rimPatchedFrames.current += 1;
    }
    updateRimFromFog(state.scene);
    if (playerMode !== 'walking' || !group.current || paused) return;
    const store = useGameStore.getState();
    const walking = getLiveWalkingTransform();
    const walkingPos = walking.pos;
    let walkingRot = walking.rot;

    const speed = 10 * delta;
    const GRAVITY = 30;

    // Get camera forward/right projected onto XZ plane
    const camForward = _camForward.current;
    camera.getWorldDirection(camForward);
    camForward.y = 0;
    camForward.normalize();
    const camRight = _camRight.current.set(-camForward.z, 0, camForward.x);

    // Input scheme depends on camera mode. Firstperson uses tank-style
    // controls (A/D yaw the character, W/S drive along its facing) so the
    // camera doesn't whip when you strafe. Other modes keep camera-relative
    // strafe since the camera isn't locked to the character's heading.
    const isFirstPerson = viewMode === 'firstperson';
    let moveX = 0;
    let moveZ = 0;
    let firstPersonYawedRot = walkingRot;
    let firstPersonYawInput = 0;

    if (isFirstPerson) {
      const YAW_SPEED = 2.0; // rad/s — ~115°/s, tunable feel
      if (keys.current.a) firstPersonYawInput += 1;
      if (keys.current.d) firstPersonYawInput -= 1;
      firstPersonYawedRot = walkingRot + firstPersonYawInput * YAW_SPEED * delta;

      let fwdInput = 0;
      if (keys.current.w) fwdInput += 1;
      if (keys.current.s) fwdInput -= 1;
      if (Math.abs(touchWalkInput.y) > Math.abs(fwdInput)) fwdInput = touchWalkInput.y;
      // Touch joystick X still strafes (mobile has no separate yaw stick here).
      const strafeInput = touchWalkInput.x;

      moveX = (Math.sin(firstPersonYawedRot) * fwdInput + Math.cos(firstPersonYawedRot) * strafeInput) * speed;
      moveZ = (Math.cos(firstPersonYawedRot) * fwdInput - Math.sin(firstPersonYawedRot) * strafeInput) * speed;
    } else {
      let inputX = 0;
      let inputZ = 0;
      if (keys.current.w) inputZ += 1;
      if (keys.current.s) inputZ -= 1;
      if (keys.current.d) inputX += 1;
      if (keys.current.a) inputX -= 1;
      if (Math.abs(touchWalkInput.x) > Math.abs(inputX)) inputX = touchWalkInput.x;
      if (Math.abs(touchWalkInput.y) > Math.abs(inputZ)) inputZ = touchWalkInput.y;

      const inputLen = Math.sqrt(inputX * inputX + inputZ * inputZ);
      if (inputLen > 0) {
        const nx = inputX / inputLen;
        const nz = inputZ / inputLen;
        moveX = (camRight.x * nx + camForward.x * nz) * speed;
        moveZ = (camRight.z * nx + camForward.z * nz) * speed;
      }
    }

    isMoving.current = moveX !== 0 || moveZ !== 0;

    // Firstperson yaw without translation — persist the rotation so the
    // character (and first-person camera that rides on activeRot) actually
    // turns while stationary.
    if (isFirstPerson && !isMoving.current && firstPersonYawInput !== 0) {
      group.current.rotation.y = firstPersonYawedRot;
      syncLiveWalkingTransform(walkingPos, firstPersonYawedRot);
      walkingRot = firstPersonYawedRot;
      storeSyncAccum.current += delta;
      if (storeSyncAccum.current >= STORE_SYNC_INTERVAL) {
        setWalkingTransform({ pos: [walkingPos[0], walkingPos[1], walkingPos[2]], rot: firstPersonYawedRot });
        storeSyncAccum.current = 0;
      }
    }

    // Jump physics
    if (isJumping.current) {
      jumpVelocity.current -= GRAVITY * delta;
      jumpHeight.current += jumpVelocity.current * delta;

      if (jumpHeight.current <= 0) {
        // Landing
        jumpHeight.current = 0;
        isJumping.current = false;
        jumpVelocity.current = 0;

        // Check if we landed in water → death. Bridges count as solid
        // ground so you can jump onto a deck without drowning.
        const terrainH = getGroundHeight(walkingPos[0], walkingPos[2], roadIndexRef.current);
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
      let newRot: number;
      if (isFirstPerson) {
        // Tank controls: facing is whatever yaw input set this frame.
        newRot = firstPersonYawedRot;
      } else {
        // Face the movement direction. Cinematic uses a gentler lerp because
        // the chase cam rides on this rotation — a snap would whip the view.
        const targetRot = Math.atan2(moveX, moveZ);
        let rotDiff = targetRot - walkingRot;
        while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
        while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
        const rotBase = viewMode === 'cinematic' ? 0.1 : 0.001;
        const rotLerp = 1 - Math.pow(rotBase, delta);
        newRot = walkingRot + rotDiff * rotLerp;
      }
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

      // Pedestrians — soft one-way push; player slides around NPCs without thud.
      const pedPush = resolvePedestrianPush(newX, newZ, PLAYER_RADIUS);
      if (pedPush.hit) {
        newX += pedPush.px;
        newZ += pedPush.pz;
      }

      const terrainYNew = getTerrainHeight(newX, newZ);
      const targetY = getGroundHeight(newX, newZ, roadIndexRef.current);

      // Smooth only the *artificial* lift above terrain — road ribbons
      // (yLift ~0.1u) and bridge decks. Natural terrain has lift == 0, so
      // the character tracks hillsides exactly. Without this split, walking
      // up a steep slope at 10u/s outpaces the 2.4u/s clamp and the figure
      // sinks into the hill until the slope levels off.
      const liftNew = Math.max(0, targetY - terrainYNew);
      const terrainYPrev = getTerrainHeight(walkingPos[0], walkingPos[2]);
      const prevLift = Math.max(0, walkingPos[1] - terrainYPrev);
      const dLift = liftNew - prevLift;
      const maxUp = MAX_STEP_UP_PER_SEC * delta;
      const maxDown = MAX_STEP_DOWN_PER_SEC * delta;
      let smoothedLift: number;
      if (dLift > maxUp) smoothedLift = prevLift + maxUp;
      else if (dLift < -maxDown) smoothedLift = prevLift - maxDown;
      else smoothedLift = liftNew;
      const groundY = terrainYNew + smoothedLift;

      // While jumping, allow movement over water
      if (isJumping.current) {
        const displayY = targetY + jumpHeight.current;
        const nextPos: [number, number, number] = [newX, targetY, newZ];
        syncLiveWalkingTransform(nextPos, newRot);
        storeSyncAccum.current += delta;
        if (storeSyncAccum.current >= STORE_SYNC_INTERVAL) {
          setWalkingTransform({ pos: nextPos, rot: newRot });
          storeSyncAccum.current = 0;
        }
        group.current.position.set(newX, displayY, newZ);
      } else if (targetY > -2) {
        const nextPos: [number, number, number] = [newX, groundY, newZ];
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

    // Drowning timer — track time spent in water. Bridges override so
    // standing on a deck over water doesn't drown the player.
    const currentTerrainH = getGroundHeight(walkingPos[0], walkingPos[2], roadIndexRef.current);
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

    // ── Combat aim: upper body tracks the cursor ────────────────────────────
    // The torso (and everything parented to it — head, arms, weapons) rotates
    // to face huntAimAngle. Pelvis/legs keep facing the movement direction.
    // The aim delta is clamped to ±100° so the torso doesn't do a full
    // backwards twist relative to the hips when you aim behind you while
    // moving forward.
    const showWeapon = store.combatMode;
    if (torso.current) {
      if (showWeapon) {
        let aimDelta = huntAimAngle - walkingRot;
        while (aimDelta > Math.PI) aimDelta -= Math.PI * 2;
        while (aimDelta < -Math.PI) aimDelta += Math.PI * 2;
        const TORSO_TWIST_LIMIT = 1.75;  // ≈100°
        aimDelta = Math.max(-TORSO_TWIST_LIMIT, Math.min(TORSO_TWIST_LIMIT, aimDelta));
        torso.current.rotation.x = huntAimPitch * TORSO_PITCH_FACTOR;
        torso.current.rotation.y = aimDelta;
      } else {
        torso.current.rotation.x = 0;
        torso.current.rotation.y = 0;
      }
    }
    if (weaponPivot.current && musketGroup.current && bowGroup.current) {
      weaponPivot.current.visible = showWeapon;
      if (showWeapon) {
        weaponPivot.current.rotation.x = huntAimPitch * WEAPON_PITCH_FACTOR;
        const active = store.activeLandWeapon;
        musketGroup.current.visible = active === 'musket';
        bowGroup.current.visible = active === 'bow';
        // Reload droop — tilt the *active* weapon around its own anchor
        // (grip for musket, riser for bow) so the muzzle/arrow dips while
        // reloading and levels off when ready.
        const def = LAND_WEAPON_DEFS[active];
        const readyAt = landWeaponReload[active] ?? 0;
        const remaining = Math.max(0, readyAt - Date.now());
        const reloadFrac = Math.min(1, remaining / (def.reloadTime * 1000));
        const droop = reloadFrac * 0.7;
        musketGroup.current.rotation.x = active === 'musket' ? droop : 0;
        bowGroup.current.rotation.x = active === 'bow' ? droop : 0;
      } else {
        weaponPivot.current.rotation.x = 0;
      }
    }

    // ── Limb animation ───────────────────────────────────────────────────────
    // Drives shoulders/elbows/hips for jump, combat aim, walk, and idle.
    // Combat pose overrides the walk cycle so the shot holds steady.
    const lSh = lShoulder.current;
    const rSh = rShoulder.current;
    const lEl = lElbow.current;
    const rEl = rElbow.current;
    const lHi = lHip.current;
    const rHi = rHip.current;
    const lKn = lKnee.current;
    const rKn = rKnee.current;

    if (isJumping.current) {
      if (lSh) { lSh.rotation.x = -2.2; lSh.rotation.z = 0; }
      if (rSh) { rSh.rotation.x = -2.2; rSh.rotation.z = 0; }
      if (lEl) lEl.rotation.x = 0;
      if (rEl) rEl.rotation.x = 0;
      if (lHi) lHi.rotation.x = 0.4;
      if (rHi) rHi.rotation.x = -0.4;
      if (lKn) lKn.rotation.x = -0.6;
      if (rKn) rKn.rotation.x = -0.6;
    } else if (showWeapon) {
      // Aiming pose. Hand-positions were computed analytically from these
      // angles (forward kinematics through shoulder→elbow with Euler XYZ),
      // then each weapon was anchored at the resulting hand point so the
      // grip actually lands under the hand instead of floating in space.
      if (store.activeLandWeapon === 'musket') {
        // Right hand on the grip. Upper arm tilts forward + down; forearm
        // folds sharply so the hand comes up near the right shoulder.
        // Resulting right-hand position ≈ torso-local (0.21, 0.56, 0.43).
        if (rSh) { rSh.rotation.x = -0.9; rSh.rotation.z = 0.0; }
        if (rEl) rEl.rotation.x = -1.7;
        // Left hand forward on the barrel, reaching across the body.
        // Resulting left-hand position ≈ torso-local (0.22, 0.56, 0.50) —
        // 7cm forward of the right hand, so both hands align along +Z.
        if (lSh) { lSh.rotation.x = -1.6; lSh.rotation.z = 0.7; }
        if (lEl) lEl.rotation.x = -0.2;
      } else {
        // Bow: left arm extended forward to hold the riser.
        // Resulting left-hand position ≈ torso-local (-0.11, 0.53, 0.65).
        if (lSh) { lSh.rotation.x = -1.57; lSh.rotation.z = 0.15; }
        if (lEl) lEl.rotation.x = -0.1;
        // Right hand drawn back. The arm can't reach fully to the face
        // given the rig's shoulder width, so the draw anchors off the
        // right temple — it reads as "drawing" without cheating the skeleton.
        if (rSh) { rSh.rotation.x = -1.3; rSh.rotation.z = 0.3; }
        if (rEl) rEl.rotation.x = -2.3;
      }
      // Legs stay planted — no walk cycle while the shot is held.
      if (lHi) lHi.rotation.x = 0;
      if (rHi) rHi.rotation.x = 0;
      if (lKn) lKn.rotation.x = 0;
      if (rKn) rKn.rotation.x = 0;
    } else if (isMoving.current) {
      const t = state.clock.elapsedTime * 10;
      const sinT = Math.sin(t);
      if (lHi) lHi.rotation.x = sinT * 0.5;
      if (rHi) rHi.rotation.x = -sinT * 0.5;
      // Bend knees on backswing for a slightly more natural step
      if (lKn) lKn.rotation.x = Math.max(0, -sinT) * 0.4;
      if (rKn) rKn.rotation.x = Math.max(0, sinT) * 0.4;
      if (lSh) { lSh.rotation.x = -sinT * 0.5; lSh.rotation.z = 0; }
      if (rSh) { rSh.rotation.x = sinT * 0.5; rSh.rotation.z = 0; }
      if (lEl) lEl.rotation.x = 0;
      if (rEl) rEl.rotation.x = 0;

      // Footstep sound — fires when leg swings through zero (foot strikes ground)
      const currentSign = sinT >= 0 ? 1 : -1;
      if (currentSign !== lastFootstepSign.current) {
        lastFootstepSign.current = currentSign;
        const pos = getLiveWalkingTransform().pos;
        const terrain = getTerrainData(pos[0], pos[2]);
        sfxFootstep(terrain.biome);
      }
    } else {
      if (lSh) { lSh.rotation.x = 0; lSh.rotation.z = 0; }
      if (rSh) { rSh.rotation.x = 0; rSh.rotation.z = 0; }
      if (lEl) lEl.rotation.x = 0;
      if (rEl) rEl.rotation.x = 0;
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

          {/* ── Hunting weapons ─────────────────────────────────────────
              Parented to the torso so the whole upper body + weapon rotates
              together under torso.rotation.y (combat aim). Each weapon group
              is anchored at the torso-local point where the holding hand
              actually lands given the combat pose — so the grip/riser sits
              under the hand instead of floating. Each weapon's own mesh
              origin is the grip/riser; its local +Z is the barrel / arrow
              direction; rotation.x on the weapon group is the reload droop. */}
          <group ref={weaponPivot} visible={false}>
            {/* Musket — anchored at right-hand grip position.
                Grip at origin; stock extends along -Z behind the grip; barrel
                extends along +Z forward. When the combat pose fires, this
                point coincides with the right hand and the barrel runs
                forward through the left hand's cradle position. */}
            <group ref={musketGroup} position={[0.21, 0.56, 0.43]}>
              {/* Stock — butt is behind the grip, tucked toward the front
                  of the right shoulder. */}
              <mesh position={[0, -0.04, -0.24]} castShadow>
                <boxGeometry args={[0.08, 0.11, 0.34]} />
                <meshStandardMaterial color="#5a3a20" roughness={0.9} />
              </mesh>
              {/* Wrist of stock — narrow connector between stock and lock */}
              <mesh position={[0, -0.02, -0.04]} castShadow>
                <boxGeometry args={[0.05, 0.07, 0.1]} />
                <meshStandardMaterial color="#6a4626" roughness={0.9} />
              </mesh>
              {/* Lock / trigger housing — right where the grip is */}
              <mesh position={[0.04, -0.03, 0.02]} castShadow>
                <boxGeometry args={[0.035, 0.07, 0.1]} />
                <meshStandardMaterial color="#6a6a6a" metalness={0.65} roughness={0.45} />
              </mesh>
              {/* Trigger itself — thin loop under the lock */}
              <mesh position={[0, -0.08, 0.02]} castShadow>
                <boxGeometry args={[0.012, 0.04, 0.03]} />
                <meshStandardMaterial color="#3a3a3a" metalness={0.7} roughness={0.4} />
              </mesh>
              {/* Barrel — long, forward of the grip */}
              <mesh position={[0, 0.01, 0.5]} rotation={[Math.PI / 2, 0, 0]} castShadow>
                <cylinderGeometry args={[0.022, 0.02, 0.95, 10]} />
                <meshStandardMaterial color="#2a2a2a" roughness={0.35} metalness={0.75} />
              </mesh>
              {/* Muzzle ring */}
              <mesh position={[0, 0.01, 0.97]} rotation={[Math.PI / 2, 0, 0]} castShadow>
                <cylinderGeometry args={[0.027, 0.027, 0.03, 10]} />
                <meshStandardMaterial color="#1a1a1a" roughness={0.5} metalness={0.6} />
              </mesh>
            </group>

            {/* Bow — anchored at left-hand riser position.
                Riser at origin, limbs along ±Y, arrow along +Z pointing at
                the target. String is pulled back into a V toward the right
                hand's anchor (no single cylinder reads as "drawn", so the
                string is omitted — the pulled-back arrow sells the pose). */}
            <group ref={bowGroup} position={[-0.11, 0.53, 0.65]} visible={false}>
              {/* Upper limb — tapered, curving back from riser */}
              <mesh position={[0, 0.22, -0.02]} rotation={[0.25, 0, -0.3]} castShadow>
                <cylinderGeometry args={[0.018, 0.012, 0.46, 6]} />
                <meshStandardMaterial color="#4a2a18" roughness={0.85} />
              </mesh>
              {/* Lower limb */}
              <mesh position={[0, -0.22, -0.02]} rotation={[-0.25, 0, 0.3]} castShadow>
                <cylinderGeometry args={[0.012, 0.018, 0.46, 6]} />
                <meshStandardMaterial color="#4a2a18" roughness={0.85} />
              </mesh>
              {/* Riser / grip — short box centered at origin */}
              <mesh position={[0, 0, 0]} castShadow>
                <boxGeometry args={[0.04, 0.14, 0.05]} />
                <meshStandardMaterial color="#3a1f10" roughness={0.95} />
              </mesh>
              {/* String — two segments forming a V, apex pulled back toward
                  the drawing hand. Upper and lower halves meet at the nock. */}
              <mesh position={[0, 0.18, -0.14]} rotation={[0.9, 0, 0]}>
                <cylinderGeometry args={[0.004, 0.004, 0.52, 4]} />
                <meshStandardMaterial color="#e8dcb0" roughness={0.9} />
              </mesh>
              <mesh position={[0, -0.18, -0.14]} rotation={[-0.9, 0, 0]}>
                <cylinderGeometry args={[0.004, 0.004, 0.52, 4]} />
                <meshStandardMaterial color="#e8dcb0" roughness={0.9} />
              </mesh>
              {/* Arrow — shaft runs from nock (drawn back) forward past the
                  riser. Shaft centered at z=-0.1 so ~55cm is behind the
                  riser (drawn) and ~25cm forward (toward the target). */}
              <mesh position={[0, 0, -0.1]} rotation={[Math.PI / 2, 0, 0]} castShadow>
                <cylinderGeometry args={[0.007, 0.007, 0.80, 5]} />
                <meshStandardMaterial color="#c8a878" roughness={0.8} />
              </mesh>
              {/* Arrowhead — small cone at the tip */}
              <mesh position={[0, 0, 0.30]} rotation={[Math.PI / 2, 0, 0]} castShadow>
                <coneGeometry args={[0.012, 0.05, 5]} />
                <meshStandardMaterial color="#4a4038" metalness={0.5} roughness={0.5} />
              </mesh>
              {/* Fletching — three small fins near the nock */}
              <mesh position={[0, 0.015, -0.44]} rotation={[0, 0, 0]} castShadow>
                <boxGeometry args={[0.002, 0.025, 0.06]} />
                <meshStandardMaterial color="#c8b890" roughness={0.95} />
              </mesh>
              <mesh position={[0.013, -0.008, -0.44]} rotation={[0, 0, 1.05]} castShadow>
                <boxGeometry args={[0.002, 0.025, 0.06]} />
                <meshStandardMaterial color="#c8b890" roughness={0.95} />
              </mesh>
              <mesh position={[-0.013, -0.008, -0.44]} rotation={[0, 0, -1.05]} castShadow>
                <boxGeometry args={[0.002, 0.025, 0.06]} />
                <meshStandardMaterial color="#c8b890" roughness={0.95} />
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

    </group>
  );
}
