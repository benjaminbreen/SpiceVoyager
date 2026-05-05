import { useRef, useMemo, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore, type Nationality, type Commodity } from '../store/gameStore';
import type { NPCShipIdentity } from '../utils/npcShipGenerator';
import { getLiveShipTransform } from '../utils/livePlayerTransform';
import { npcLivePositions } from '../utils/combatState';
import { sfxShipSink } from '../audio/SoundEffects';
import { addCameraImpulse } from '../utils/cameraShakeState';
import { spawnWreckSalvage } from './WreckSalvage';
import { spawnFloatingCombatText } from './FloatingCombatText';
import { NPCShipModel } from './npcShip/NPCShipModel';
import { detailLevelForDistance, type NPCShipDetailLevel } from './npcShip/detailLevel';
import { useNpcShipEvents } from './npcShip/useNpcShipEvents';
import {
  updateAlertRing,
  updateDamageMotion,
  updateHealthBar,
  updateSelectionRing,
  updateSinkingShip,
  updateSmokeParticles,
  updateTorch,
} from './npcShip/npcShipFrameEffects';
import {
  angleAwayFromLand,
  canNpcMoveTo,
  findWaterTarget,
  speedForNpcPosture,
} from '../utils/npcShipNavigation';
import { tryNpcFireAtPlayer } from '../utils/npcShipFiring';
import {
  COLLISION_REPUTATION_TARGET,
  cargoTemptationScore,
  chooseInitiativePosture,
  chooseProvokedPosture,
  npcBowWeapon,
  npcBroadsideCount,
  npcBroadsideWeapon,
  shouldStayHostile,
  type NpcCombatPosture,
} from '../utils/npcCombat';

const APPROACH_RADIUS = 40;  // show "approaching" toast
const HAIL_RADIUS = 14;     // show "Press T to Talk" prompt — bumped with NPC visual scale (1.2×)
const COLLISION_RADIUS = 4.8; // bumped with NPC visual scale (1.2×) to match larger silhouettes
const NPC_NPC_COLLISION_RADIUS = 6;
const NPC_NPC_COLLISION_PUSH = 1.6;
const NPC_COLLISION_DAMAGE = 10;
const NPC_TARGET_RADIUS = 100;
const NPC_FLEE_TARGET_RADIUS = 80;
const NPC_INTENT_TEXT_COOLDOWN_MS = 2500;
const NPC_TORCH_LIGHT_RANGE = 70;

// ── Selection state (shared across all NPCShip instances) ──
let selectedNpcId: string | null = null;
let selectionSetAt = 0;

function readablePostureLabel(posture: NpcCombatPosture, committed: boolean) {
  if (committed && (posture === 'engage' || posture === 'pursue' || posture === 'evade')) return 'Won\'t Back Down';
  if (posture === 'engage') return 'Attacking';
  if (posture === 'pursue') return 'Chasing';
  if (posture === 'evade') return 'Keeping Distance';
  if (posture === 'flee') return 'Running Away';
  if (posture === 'warn') return 'Warning';
  return null;
}

export function NPCShip({
  identity,
  initialPosition,
}: {
  identity: NPCShipIdentity;
  initialPosition: [number, number, number];
}) {
  const group = useRef<THREE.Group>(null);
  const torchRef = useRef<THREE.PointLight>(null);
  const torchMeshRef = useRef<THREE.MeshStandardMaterial>(null);
  const alertRingRef = useRef<THREE.Mesh>(null);
  const selectRingRef = useRef<THREE.Mesh>(null);
  const healthBarFgRef = useRef<THREE.Mesh>(null);
  const healthBarGroupRef = useRef<THREE.Group>(null);
  const targetRef = useRef(new THREE.Vector3(
    initialPosition[0] + (Math.random() - 0.5) * 50,
    0,
    initialPosition[2] + (Math.random() - 0.5) * 50
  ));
  const _tmpVec = useRef(new THREE.Vector3());
  const _avoidVec = useRef(new THREE.Vector3());

  // Hull state
  const hullRef = useRef(identity.maxHull);
  const [sinking, setSinking] = useState(false);
  const [detailLevel, setDetailLevel] = useState<NPCShipDetailLevel>('near');
  const detailLevelRef = useRef<NPCShipDetailLevel>('near');
  const sinkProgress = useRef(0); // 0→1 over sink animation
  const sinkSplashFired = useRef(false);

  // Damage visual state
  const damageTilt = useRef(0); // persistent list angle from hull damage
  const damageTiltTarget = useRef(0);
  const damageTiltSide = useRef(Math.random() > 0.5 ? 1 : -1); // which side they list to

  // Smoke particles for damaged ships — mesh only mounts once damage begins
  const smokeMeshRef = useRef<THREE.InstancedMesh>(null);
  const smokeParticles = useRef<{ pos: THREE.Vector3; vel: THREE.Vector3; life: number; maxLife: number }[]>([]);
  const SMOKE_COUNT = 12;
  const smokeInitialized = useRef(false);
  const smokeDummy = useMemo(() => new THREE.Object3D(), []);
  const [smokeActive, setSmokeActive] = useState(false);

  // Bubble particles for sinking — mesh only mounts once the ship starts to sink
  const bubbleMeshRef = useRef<THREE.InstancedMesh>(null);
  const bubbleParticles = useRef<{ pos: THREE.Vector3; vel: THREE.Vector3; life: number }[]>([]);
  const BUBBLE_COUNT = 16;
  const bubbleInitialized = useRef(false);
  const bubbleDummy = useMemo(() => new THREE.Object3D(), []);
  const [bubblesActive, setBubblesActive] = useState(false);

  // Frame-rate throttle for distant NPCs
  const frameSkipCounter = useRef(0);
  const accumulatedDelta = useRef(0);

  // Track proximity state to avoid spamming
  const approachNotified = useRef(false);
  const inHailRange = useRef(false);
  const lastClickToast = useRef(0);
  const nextTargetSearchAt = useRef(0);

  // Boarding/capture may be added later; it is intentionally not implemented here.
  const alertUntil = useRef(0); // timestamp when alert ends
  const postureUntil = useRef(0);
  const combatPosture = useRef<NpcCombatPosture>('neutral');
  const hostileContact = useRef(false);
  const committedHostile = useRef(false);
  const lastProcessedHitAlert = useRef(0);
  const lastCollisionTime = useRef(0); // cooldown to prevent spam
  const collisionGrievanceCount = useRef(0);
  const lastCollisionHailTime = useRef(0);
  const nextInitiativeCheckAt = useRef(0);
  const nextInitiativeWarningAt = useRef(0);
  const nextBowFireAt = useRef(0);
  const nextBroadsideFireAt = useRef(0);
  const bowIntentReadyAt = useRef(0);
  const broadsideIntentReadyAt = useRef(0);
  const nextIntentTextAt = useRef(0);
  const lastShownPosture = useRef<NpcCombatPosture | null>(null);
  const ALERT_DURATION = 14000; // armed ships need time to maneuver into a firing lane
  const COLLISION_COOLDOWN = 2000; // match Ship.tsx's 2-second cooldown
  const INITIATIVE_CHECK_MS = 2200;
  const INITIATIVE_RADIUS = 145;
  const orbitSide = useRef(identity.id.charCodeAt(0) % 2 === 0 ? 1 : -1);

  const speed = useMemo(() => 2 + Math.random() * 3, []);
  const bowWeapon = useMemo(() => npcBowWeapon(identity), [identity]);
  const broadsideWeapon = useMemo(() => npcBroadsideWeapon(identity), [identity]);
  const broadsideCount = useMemo(() => npcBroadsideCount(identity), [identity]);

  useEffect(() => {
    const root = group.current;
    if (!root) return;
    root.traverse((obj) => {
      obj.castShadow = false;
      obj.receiveShadow = false;
    });
  }, [detailLevel]);

  const setCombatPosture = useMemo(() => (posture: NpcCombatPosture, until: number) => {
    combatPosture.current = posture;
    const effectiveUntil = committedHostile.current && posture !== 'flee' ? Number.POSITIVE_INFINITY : until;
    postureUntil.current = effectiveUntil;
    alertUntil.current = Math.max(alertUntil.current, effectiveUntil);
    nextTargetSearchAt.current = 0;
  }, []);

  const markProvoked = (reputation: number, hullFraction: number) => {
    hostileContact.current = true;
    if (shouldStayHostile(identity, { reputation, hullFraction })) {
      committedHostile.current = true;
    }
  };

  const showIntentText = (now: number, label: string, currentPos: THREE.Vector3) => {
    if (now < nextIntentTextAt.current) return;
    nextIntentTextAt.current = now + NPC_INTENT_TEXT_COOLDOWN_MS;
    spawnFloatingCombatText(currentPos.x, currentPos.y + 2.8, currentPos.z, label, 'intent');
    window.dispatchEvent(new CustomEvent('npc-incoming-fire-intent', {
      detail: {
        label,
        shipName: identity.shipName,
        x: currentPos.x,
        z: currentPos.z,
      },
    }));
  };

  // Deselect when clicking elsewhere (deferred so R3F onClick fires first)
  useEffect(() => {
    const handler = () => {
      requestAnimationFrame(() => {
        if (Date.now() - selectionSetAt > 100) {
          selectedNpcId = null;
        }
      });
    };
    window.addEventListener('pointerdown', handler);
    return () => window.removeEventListener('pointerdown', handler);
  }, []);

  useNpcShipEvents({
    identity,
    hullRef,
    hostileContact,
    committedHostile,
    setCombatPosture,
    alertDuration: ALERT_DURATION,
  });

  useFrame((state, delta) => {
    if (!group.current) return;
    // Freeze NPC AI + movement while the game is paused (e.g. hail modal open).
    // Allow the active sinking animation to continue so a ship in its death
    // throes doesn't visibly freeze mid-roll if the player pauses for UI.
    if (useGameStore.getState().paused && !sinking) return;

    // ── Sinking animation (3 phases) ──
    if (sinking) {
      if (!bubbleInitialized.current) {
        bubbleInitialized.current = true;
        for (let i = 0; i < BUBBLE_COUNT; i++) {
          bubbleParticles.current.push({
            pos: new THREE.Vector3(0, -1000, 0),
            vel: new THREE.Vector3(),
            life: 0,
          });
        }
      }
      const doneSinking = updateSinkingShip({
        group: group.current,
        delta,
        sinkProgress,
        sinkSplashFired,
        damageTiltSide,
        bubbleMesh: bubbleMeshRef.current,
        bubbleParticles: bubbleParticles.current,
        bubbleDummy,
        bubbleCount: BUBBLE_COUNT,
      });
      if (doneSinking) {
        npcLivePositions.delete(identity.id);
        group.current.visible = false;
      }
      return; // skip all other logic while sinking
    }

    const currentPos = group.current.position;
    const playerTransformLive = getLiveShipTransform();
    const playerPos = playerTransformLive.pos;

    const dxPlayer = currentPos.x - playerPos[0];
    const dzPlayer = currentPos.z - playerPos[2];
    const distToPlayer = Math.sqrt(dxPlayer * dxPlayer + dzPlayer * dzPlayer);
    const nextDetailLevel = detailLevelForDistance(distToPlayer);
    if (nextDetailLevel !== detailLevelRef.current) {
      detailLevelRef.current = nextDetailLevel;
      setDetailLevel(nextDetailLevel);
    }

    // Distant ships update every 3rd frame; accumulate delta so motion stays smooth.
    if (distToPlayer > 200) {
      accumulatedDelta.current += delta;
      frameSkipCounter.current = (frameSkipCounter.current + 1) % 3;
      if (frameSkipCounter.current !== 0) return;
      delta = accumulatedDelta.current;
      accumulatedDelta.current = 0;
    }

    const { playerMode, timeOfDay, addNotification, interactionPrompt, setInteractionPrompt, adjustReputation, getReputation, setNearestHailableNpc, defeatedNpc, nearestHailableNpc, cargo, stats, ship } = useGameStore.getState();

    // ── Check for hull damage from projectile hits ──
    const liveEntry = npcLivePositions.get(identity.id);
    if (liveEntry && liveEntry.hull < hullRef.current) {
      hullRef.current = liveEntry.hull;
      // Ship destroyed?
      if (hullRef.current <= 0) {
        setSinking(true);
        setBubblesActive(true);
        sfxShipSink();
        spawnWreckSalvage(currentPos.x, currentPos.z, identity.shipName, identity.id, identity.cargo as Partial<Record<Commodity, number>>);
        defeatedNpc(identity.id, identity.shipName, identity.flag as Nationality, identity.cargo as Partial<Record<Commodity, number>>);
        liveEntry.sunk = true;
        return;
      }
    }

    // ── Proximity detection (only in ship mode) ──
    if (playerMode === 'ship') {
      // Approach toast
      if (distToPlayer < APPROACH_RADIUS && !approachNotified.current) {
        approachNotified.current = true;
        addNotification(`Approaching ${identity.appearancePhrase}.`, 'info');
      }
      if (distToPlayer > APPROACH_RADIUS * 1.3) {
        approachNotified.current = false;
      }

      const factionReputation = getReputation(identity.flag);
      const canHail = !hostileContact.current && combatPosture.current === 'neutral' && factionReputation > -60;

      // Hail prompt — only claim the slot if no other NPC already holds it
      if (canHail && distToPlayer < HAIL_RADIUS && !inHailRange.current) {
        if (!nearestHailableNpc) {
          inHailRange.current = true;
          setInteractionPrompt('Press T to Hail');
          setNearestHailableNpc(identity);
        }
      }
      if ((!canHail || distToPlayer > HAIL_RADIUS * 1.2) && inHailRange.current) {
        inHailRange.current = false;
        // Only clear if we're the ones who set it
        if (nearestHailableNpc?.id === identity.id) {
          setInteractionPrompt(null);
          setNearestHailableNpc(null);
        }
      }
    }

    // ── Collision — elastic bounce with restitution ──
    if (distToPlayer < COLLISION_RADIUS) {
      const now = Date.now();
      // Contact normal points from player → NPC.
      const rawDx = currentPos.x - playerPos[0];
      const rawDz = currentPos.z - playerPos[2];
      const rawLen = Math.max(0.001, Math.sqrt(rawDx * rawDx + rawDz * rawDz));
      const nx = rawDx / rawLen;
      const nz = rawDz / rawLen;

      // Relative velocity along the contact normal (NPC minus player, dotted with n).
      // Negative means ships are closing; positive means separating.
      const playerTransform = getLiveShipTransform();
      const pvx = Math.sin(playerTransform.rot) * playerTransform.vel;
      const pvz = Math.cos(playerTransform.rot) * playerTransform.vel;
      // Effective NPC speed this frame (alertMode not yet computed this frame — approximate).
      const npcSpeed = Date.now() < alertUntil.current ? speed * 2.5 : speed;
      const nvx = Math.sin(group.current.rotation.y) * npcSpeed;
      const nvz = Math.cos(group.current.rotation.y) * npcSpeed;
      const relN = (nvx - pvx) * nx + (nvz - pvz) * nz;
      const approachSpeed = Math.max(0, -relN);

      // Equal-mass elastic impulse with restitution.
      const RESTITUTION = 0.7;
      const impulseMag = (1 + RESTITUTION) * approachSpeed * 0.5;

      // Kick NPC outward along +n (guaranteed minimum so a grazing touch is still felt).
      const npcKick = Math.max(impulseMag * 0.8, 1.8);
      currentPos.x += nx * npcKick * 0.35;
      currentPos.z += nz * npcKick * 0.35;

      // Only fire events/reputation/damage once per cooldown (matches Ship.tsx's 2s gate)
      if (now - lastCollisionTime.current > COLLISION_COOLDOWN) {
        lastCollisionTime.current = now;
        const alreadyHostile = hostileContact.current || getReputation(identity.flag) <= -60;
        window.dispatchEvent(new CustomEvent('ship-collision', {
          detail: {
            appearancePhrase: identity.appearancePhrase,
            nx, nz,
            impulseMag,
            approachSpeed,
          },
        }));
        collisionGrievanceCount.current += 1;
        if (!alreadyHostile && now - lastCollisionHailTime.current > 9000) {
          lastCollisionHailTime.current = now;
          window.dispatchEvent(new CustomEvent('npc-collision-hail', {
            detail: {
              npc: identity,
              collisionCount: collisionGrievanceCount.current,
            },
          }));
        }
        // Camera nudge — one-shot directional push away from the ram point.
        addCameraImpulse(-nx, -nz, Math.min(1.8, 0.45 + approachSpeed * 0.22));
        hullRef.current = Math.max(0, hullRef.current - NPC_COLLISION_DAMAGE);
        if (liveEntry) liveEntry.hull = hullRef.current;
        adjustReputation(identity.flag, COLLISION_REPUTATION_TARGET.ram - getReputation(identity.flag));

        if (hullRef.current <= 0) {
          if (liveEntry) liveEntry.sunk = true;
          setSinking(true);
          setBubblesActive(true);
          sfxShipSink();
          spawnWreckSalvage(currentPos.x, currentPos.z, identity.shipName, identity.id, identity.cargo as Partial<Record<Commodity, number>>);
          defeatedNpc(identity.id, identity.shipName, identity.flag as Nationality, identity.cargo as Partial<Record<Commodity, number>>);
          return;
        }

        const hullPct = Math.round((hullRef.current / identity.maxHull) * 100);
        addNotification(
          collisionGrievanceCount.current > 1
            ? `Rammed the ${identity.shipName} again! They take it as deliberate. Hull: ${hullPct}%`
            : `Rammed the ${identity.shipName}! Hull: ${hullPct}%`,
          'warning',
        );
      }

      const posture = chooseProvokedPosture(identity, {
        reputation: getReputation(identity.flag),
        provoked: true,
        hullFraction: hullRef.current / identity.maxHull,
      });
      markProvoked(getReputation(identity.flag), hullRef.current / identity.maxHull);
      setCombatPosture(posture, now + ALERT_DURATION);
      if (posture === 'flee') {
        targetRef.current.set(
          currentPos.x + nx * 80, 0, currentPos.z + nz * 80
        );
      }
    }

    // Check for projectile hit alert from combat system
    if (liveEntry?.hitAlert && Date.now() < liveEntry.hitAlert && liveEntry.hitAlert > lastProcessedHitAlert.current) {
      lastProcessedHitAlert.current = liveEntry.hitAlert;
      markProvoked(getReputation(identity.flag), hullRef.current / identity.maxHull);
      const posture = chooseProvokedPosture(identity, {
        reputation: getReputation(identity.flag),
        provoked: true,
        hullFraction: hullRef.current / identity.maxHull,
      });
      setCombatPosture(posture, liveEntry.hitAlert);
    }

    const now = Date.now();
    if (now >= postureUntil.current && combatPosture.current !== 'neutral') {
      combatPosture.current = 'neutral';
    }
    const activePosture = combatPosture.current;
    const isAlerted = activePosture !== 'neutral' || now < alertUntil.current;
    if (activePosture !== lastShownPosture.current) {
      lastShownPosture.current = activePosture;
      const postureLabel = readablePostureLabel(activePosture, committedHostile.current);
      if (postureLabel && distToPlayer < 165) {
        spawnFloatingCombatText(currentPos.x, currentPos.y + 3.1, currentPos.z, postureLabel, 'intent');
      }
    }

    if (
      playerMode === 'ship' &&
      activePosture === 'neutral' &&
      distToPlayer < INITIATIVE_RADIUS &&
      now >= nextInitiativeCheckAt.current
    ) {
      nextInitiativeCheckAt.current = now + INITIATIVE_CHECK_MS;
      const initiative = chooseInitiativePosture(identity, {
        reputation: getReputation(identity.flag),
        hullFraction: hullRef.current / identity.maxHull,
        playerFlag: ship.flag,
        cargoTemptation: cargoTemptationScore(cargo, stats.cargoCapacity),
      });
      if (initiative === 'warn' && now >= nextInitiativeWarningAt.current) {
        nextInitiativeWarningAt.current = now + ALERT_DURATION;
        if (hostileContact.current || getReputation(identity.flag) <= -60) {
          setCombatPosture(identity.armed ? 'pursue' : 'flee', now + ALERT_DURATION);
        } else {
          setCombatPosture('pursue', now + ALERT_DURATION);
          window.dispatchEvent(new CustomEvent('npc-warning-hail', {
            detail: { npc: identity },
          }));
        }
      } else if (initiative === 'flee') {
        setCombatPosture('flee', now + ALERT_DURATION);
      }
    }

    if (playerMode === 'ship' && (activePosture === 'engage' || activePosture === 'pursue' || activePosture === 'evade')) {
      if (identity.armed && !sinking && hullRef.current > 0) {
        tryNpcFireAtPlayer({
          now,
          identity,
          currentPos,
          heading: group.current.rotation.y,
          playerPos,
          playerRot: playerTransformLive.rot,
          playerVel: playerTransformLive.vel,
          distToPlayer,
          bowWeapon,
          broadsideWeapon,
          broadsideCount,
          nextBowFireAt,
          nextBroadsideFireAt,
          bowIntentReadyAt,
          broadsideIntentReadyAt,
          showIntentText,
        });
      }
    }

    // ── Movement AI ──
    if (activePosture === 'flee' || (isAlerted && activePosture === 'neutral')) {
      // While alerted, keep fleeing away from the player
      const fleeDir = _tmpVec.current.set(
        currentPos.x - playerPos[0], 0, currentPos.z - playerPos[2]
      ).normalize();
      if (now >= nextTargetSearchAt.current) {
        const fleeAngle = Math.atan2(fleeDir.x, fleeDir.z);
        const waterTarget = findWaterTarget(currentPos.x, currentPos.z, NPC_FLEE_TARGET_RADIUS, fleeAngle);
        if (waterTarget) {
          targetRef.current.set(waterTarget[0], 0, waterTarget[1]);
        } else {
          targetRef.current.set(
            currentPos.x + fleeDir.x * 20, 0, currentPos.z + fleeDir.z * 20
          );
        }
        nextTargetSearchAt.current = now + 500;
      }
    } else if (activePosture === 'evade') {
      // Keep distance, but angle off rather than running straight away. Phase 3
      // will let these ships fire while doing this.
      const awayDir = _tmpVec.current.set(
        currentPos.x - playerPos[0], 0, currentPos.z - playerPos[2]
      ).normalize();
      if (now >= nextTargetSearchAt.current) {
        const evadeAngle = Math.atan2(awayDir.x, awayDir.z) + orbitSide.current * Math.PI * 0.28;
        const waterTarget = findWaterTarget(currentPos.x, currentPos.z, NPC_FLEE_TARGET_RADIUS, evadeAngle);
        if (waterTarget) {
          targetRef.current.set(waterTarget[0], 0, waterTarget[1]);
        } else {
          targetRef.current.set(
            currentPos.x + awayDir.x * 36, 0, currentPos.z + awayDir.z * 36
          );
        }
        nextTargetSearchAt.current = now + 650;
      }
    } else if (activePosture === 'engage' || activePosture === 'pursue') {
      // Hold a rough fighting band instead of fleeing. This is movement-only
      // until the Phase 3 weapon-firing work lands.
      const toPlayer = _tmpVec.current.set(
        playerPos[0] - currentPos.x, 0, playerPos[2] - currentPos.z
      );
      const dist = Math.max(toPlayer.length(), 0.001);
      toPlayer.normalize();
      if (now >= nextTargetSearchAt.current) {
        let targetAngle: number;
        if (dist > 90) {
          targetAngle = Math.atan2(toPlayer.x, toPlayer.z);
        } else if (dist < 45) {
          targetAngle = Math.atan2(-toPlayer.x, -toPlayer.z);
        } else {
          targetAngle = Math.atan2(toPlayer.x, toPlayer.z) + orbitSide.current * Math.PI * 0.5;
        }
        const targetRadius = dist > 90 ? 44 : 30;
        const waterTarget = findWaterTarget(currentPos.x, currentPos.z, targetRadius, targetAngle);
        if (waterTarget) {
          targetRef.current.set(waterTarget[0], 0, waterTarget[1]);
        }
        nextTargetSearchAt.current = now + 650;
      }
    } else {
      const dist = currentPos.distanceTo(targetRef.current);
      if (dist < 5) {
        const waterTarget = findWaterTarget(currentPos.x, currentPos.z, NPC_TARGET_RADIUS);
        if (waterTarget) targetRef.current.set(waterTarget[0], 0, waterTarget[1]);
      }
    }

    const currentSpeed = speedForNpcPosture(activePosture, speed);

    const direction = _tmpVec.current.subVectors(targetRef.current, currentPos).normalize();
    const targetRotation = Math.atan2(direction.x, direction.z);

    let rotDiff = targetRotation - group.current.rotation.y;
    while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
    while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
    group.current.rotation.y += rotDiff * delta * 2;

    const moveX = Math.sin(group.current.rotation.y) * currentSpeed * delta;
    const moveZ = Math.cos(group.current.rotation.y) * currentSpeed * delta;
    let nextX = currentPos.x + moveX;
    let nextZ = currentPos.z + moveZ;

    if (liveEntry?.impulseUntil && now < liveEntry.impulseUntil) {
      const impulseX = liveEntry.impulseX ?? 0;
      const impulseZ = liveEntry.impulseZ ?? 0;
      nextX += impulseX * delta * 1.6;
      nextZ += impulseZ * delta * 1.6;
      const damping = Math.exp(-delta * 1.25);
      liveEntry.impulseX = Math.abs(impulseX) < 0.04 ? 0 : impulseX * damping;
      liveEntry.impulseZ = Math.abs(impulseZ) < 0.04 ? 0 : impulseZ * damping;
      damageTilt.current += THREE.MathUtils.clamp((impulseX * Math.cos(group.current.rotation.y) - impulseZ * Math.sin(group.current.rotation.y)) * 0.012, -0.08, 0.08);
    }

    // ── NPC-to-NPC collision/separation ──
    // Use the live position map as a lightweight broad phase. Ships steer/push
    // apart instead of passing through each other.
    const avoid = _avoidVec.current.set(0, 0, 0);
    let avoidCount = 0;
    for (const [otherId, other] of npcLivePositions) {
      if (otherId === identity.id || other.sunk) continue;
      const dx = currentPos.x - other.x;
      const dz = currentPos.z - other.z;
      const distSq = dx * dx + dz * dz;
      if (distSq >= NPC_NPC_COLLISION_RADIUS * NPC_NPC_COLLISION_RADIUS) continue;

      const dist = Math.max(Math.sqrt(distSq), 0.001);
      const overlap = (NPC_NPC_COLLISION_RADIUS - dist) / NPC_NPC_COLLISION_RADIUS;
      avoid.x += (dx / dist) * overlap;
      avoid.z += (dz / dist) * overlap;
      avoidCount++;
    }

    if (avoidCount > 0) {
      avoid.normalize();
      currentPos.x += avoid.x * NPC_NPC_COLLISION_PUSH * delta * 8;
      currentPos.z += avoid.z * NPC_NPC_COLLISION_PUSH * delta * 8;
      nextX = currentPos.x + avoid.x * NPC_NPC_COLLISION_PUSH;
      nextZ = currentPos.z + avoid.z * NPC_NPC_COLLISION_PUSH;
      if (now >= nextTargetSearchAt.current) {
        const avoidAngle = Math.atan2(avoid.x, avoid.z);
        const waterTarget = findWaterTarget(currentPos.x, currentPos.z, 36, avoidAngle);
        if (waterTarget) {
          targetRef.current.set(waterTarget[0], 0, waterTarget[1]);
        } else {
          targetRef.current.set(currentPos.x + avoid.x * 24, 0, currentPos.z + avoid.z * 24);
        }
        nextTargetSearchAt.current = now + 500;
      }
    }

    if (canNpcMoveTo(nextX, nextZ, group.current.rotation.y)) {
      group.current.position.x = nextX;
      group.current.position.z = nextZ;
    } else if (now >= nextTargetSearchAt.current) {
      const awayFromLandAngle = angleAwayFromLand(currentPos.x, currentPos.z);
      const waterTarget = findWaterTarget(currentPos.x, currentPos.z, NPC_TARGET_RADIUS, awayFromLandAngle);
      if (waterTarget) {
        targetRef.current.set(waterTarget[0], 0, waterTarget[1]);
      } else {
        targetRef.current.set(
          currentPos.x - Math.sin(group.current.rotation.y) * 20,
          0,
          currentPos.z - Math.cos(group.current.rotation.y) * 20
        );
      }
      nextTargetSearchAt.current = now + 350;
    }

    // ── Damage tilt — ships list as they take damage ──
    const hullFrac = hullRef.current / identity.maxHull;
    updateDamageMotion({
      group: group.current,
      hullFrac,
      delta,
      elapsedTime: state.clock.elapsedTime,
      initialPosition,
      damageTilt,
      damageTiltTarget,
      damageTiltSide,
    });

    // ── Damage smoke — rising from damaged ships ──
    if (hullFrac < 0.7 && !smokeActive) {
      setSmokeActive(true);
    }
    if (hullFrac < 0.7 && distToPlayer < 120 && smokeMeshRef.current) {
      if (!smokeInitialized.current) {
        smokeInitialized.current = true;
        for (let i = 0; i < SMOKE_COUNT; i++) {
          smokeParticles.current.push({
            pos: new THREE.Vector3(0, -1000, 0),
            vel: new THREE.Vector3(),
            life: 0,
            maxLife: 1,
          });
        }
      }
      updateSmokeParticles({
        mesh: smokeMeshRef.current,
        particles: smokeParticles.current,
        dummy: smokeDummy,
        count: SMOKE_COUNT,
        hullFrac,
        delta,
        shipPos: currentPos,
      });
    }

    // Alert ring visibility
    updateAlertRing(alertRingRef.current, isAlerted, distToPlayer, state.clock.elapsedTime);

    // Selection ring visibility
    updateSelectionRing(selectRingRef.current, selectedNpcId === identity.id, state.clock.elapsedTime);

    // Torch at night
    updateTorch({
      light: torchRef.current,
      material: torchMeshRef.current,
      timeOfDay,
      distToPlayer,
      range: NPC_TORCH_LIGHT_RANGE,
    });

    // Update live position for projectile hit detection
    npcLivePositions.set(identity.id, {
      x: currentPos.x,
      y: currentPos.y + 1.4,
      z: currentPos.z,
      heading: group.current.rotation.y,
      radius: Math.max(3.2, identity.visual.scale * 4.0),
      flag: identity.flag,
      shipName: identity.shipName,
      hull: hullRef.current,
      maxHull: identity.maxHull,
      hitAlert: liveEntry?.hitAlert,
      impulseX: liveEntry?.impulseX,
      impulseZ: liveEntry?.impulseZ,
      impulseUntil: liveEntry?.impulseUntil,
    });

    // ── Health bar (billboard toward camera) ──
    updateHealthBar({
      group: healthBarGroupRef.current,
      foreground: healthBarFgRef.current,
      hullFrac,
      distToPlayer,
      camera: state.camera,
    });
  });

  const handleClick = (e: any) => {
    e.stopPropagation();
    const now = Date.now();
    const { addNotification, playerMode } = useGameStore.getState();
    if (playerMode !== 'ship') return;
    // Toggle: click again to deselect
    if (selectedNpcId === identity.id) {
      selectedNpcId = null;
      return;
    }
    selectedNpcId = identity.id;
    selectionSetAt = now;
    if (now - lastClickToast.current < 2000) return; // debounce toast only
    lastClickToast.current = now;
    addNotification(`You see ${identity.appearancePhrase}.`, 'info');
  };

  return (
    <>
      <group ref={group} position={initialPosition} onClick={handleClick}>
        {/* Alert ring - orange circle when fleeing */}
        <mesh ref={alertRingRef} position={[0, 0.1, 0]} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
          <ringGeometry args={[3.5, 4, 32]} />
          <meshBasicMaterial color="#ff8800" transparent opacity={0.6} side={THREE.DoubleSide} />
        </mesh>
        {/* Selection ring - white circle when clicked */}
        <mesh ref={selectRingRef} position={[0, 0.15, 0]} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
          <ringGeometry args={[4, 4.4, 48]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.45} side={THREE.DoubleSide} />
        </mesh>
        {/* Health bar — appears when damaged */}
        <group ref={healthBarGroupRef} position={[0, 5.5, 0]} visible={false}>
          {/* Background (dark) */}
          <mesh position={[0, 0, -0.01]}>
            <planeGeometry args={[3, 0.3]} />
            <meshBasicMaterial color="#220000" transparent opacity={0.7} />
          </mesh>
          {/* Foreground (colored) */}
          <mesh ref={healthBarFgRef}>
            <planeGeometry args={[3, 0.25]} />
            <meshBasicMaterial color="#00ff00" />
          </mesh>
        </group>
        <NPCShipModel identity={identity} detailLevel={detailLevel} />
        {/* Night torch */}
        <group position={[0.5, 2.2, -1]}>
          <pointLight
            ref={torchRef}
            color="#ff8833"
            intensity={0}
            distance={15}
            decay={2}
          />
          <mesh>
            <sphereGeometry args={[0.08, 6, 6]} />
            <meshStandardMaterial
              ref={torchMeshRef}
              color="#ff6600"
              emissive="#ff8822"
              emissiveIntensity={0}
              toneMapped={false}
            />
          </mesh>
          <mesh position={[0, -0.3, 0]}>
            <cylinderGeometry args={[0.025, 0.025, 0.5]} />
            <meshStandardMaterial color="#3e2723" />
          </mesh>
        </group>
      </group>

      {/* Damage smoke — world-space particles rising from burning ship */}
      {smokeActive && (
        <instancedMesh ref={smokeMeshRef} args={[undefined, undefined, SMOKE_COUNT]} frustumCulled={false}>
          <sphereGeometry args={[0.8, 6, 6]} />
          <meshStandardMaterial
            color="#222222"
            transparent
            opacity={0.45}
            depthWrite={false}
          />
        </instancedMesh>
      )}

      {/* Sinking bubbles — world-space */}
      {bubblesActive && (
        <instancedMesh ref={bubbleMeshRef} args={[undefined, undefined, BUBBLE_COUNT]} frustumCulled={false}>
          <sphereGeometry args={[0.3, 6, 6]} />
          <meshStandardMaterial
            color="#aaddee"
            emissive="#668899"
            emissiveIntensity={0.3}
            transparent
            opacity={0.7}
          />
        </instancedMesh>
      )}
    </>
  );
}
