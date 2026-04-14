import { useRef, useMemo, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore, type Nationality, type Commodity } from '../store/gameStore';
import type { NPCShipIdentity } from '../utils/npcShipGenerator';
import { getLiveShipTransform } from '../utils/livePlayerTransform';
import { npcLivePositions } from '../utils/combatState';
import { getMeshHalf, getTerrainHeight } from '../utils/terrain';
import { sfxShipSink } from '../audio/SoundEffects';

const APPROACH_RADIUS = 40;  // show "approaching" toast
const HAIL_RADIUS = 12;     // show "Press T to Talk" prompt
const COLLISION_RADIUS = 4;
const NPC_DRAFT_BLOCK_HEIGHT = -0.8;
const NPC_COLLISION_DAMAGE = 10;
const NPC_TARGET_RADIUS = 100;
const NPC_FLEE_TARGET_RADIUS = 80;
const WATER_TARGET_ATTEMPTS = 10;
const MAP_EDGE_MARGIN = 0.94;

const NPC_HULL_PROBE_POINTS: [number, number][] = [
  [0, 3.5],   // Bow
  [0, -2],    // Stern
  [-1.5, 0],  // Port
  [1.5, 0],   // Starboard
];

// ── Selection state (shared across all NPCShip instances) ──
let selectedNpcId: string | null = null;
let selectionSetAt = 0;

function isNavigableWater(x: number, z: number) {
  const boundaryDist = getMeshHalf() * MAP_EDGE_MARGIN;
  if (Math.abs(x) > boundaryDist || Math.abs(z) > boundaryDist) return false;
  return getTerrainHeight(x, z) <= NPC_DRAFT_BLOCK_HEIGHT;
}

function findWaterTarget(originX: number, originZ: number, radius: number, preferredAngle?: number): [number, number] | null {
  for (let attempt = 0; attempt < WATER_TARGET_ATTEMPTS; attempt++) {
    const spread = preferredAngle === undefined ? Math.PI * 2 : Math.PI * (0.25 + attempt * 0.12);
    const angle = preferredAngle === undefined
      ? Math.random() * Math.PI * 2
      : preferredAngle + (Math.random() - 0.5) * spread;
    const distance = radius * (0.45 + Math.random() * 0.65);
    const x = originX + Math.sin(angle) * distance;
    const z = originZ + Math.cos(angle) * distance;
    if (isNavigableWater(x, z)) return [x, z];
  }
  return null;
}

function canNpcMoveTo(x: number, z: number, rotation: number) {
  for (const [px, pz] of NPC_HULL_PROBE_POINTS) {
    const worldX = x + Math.sin(rotation) * pz + Math.cos(rotation) * px;
    const worldZ = z + Math.cos(rotation) * pz - Math.sin(rotation) * px;
    if (!isNavigableWater(worldX, worldZ)) return false;
  }
  return true;
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

  // Hull state
  const hullRef = useRef(identity.maxHull);
  const [sinking, setSinking] = useState(false);
  const sinkProgress = useRef(0); // 0→1 over sink animation

  // Track proximity state to avoid spamming
  const approachNotified = useRef(false);
  const inHailRange = useRef(false);
  const lastClickToast = useRef(0);
  const nextTargetSearchAt = useRef(0);

  // Alert mode: triggered by collision, ship flees from player
  const alertUntil = useRef(0); // timestamp when alert ends
  const lastCollisionTime = useRef(0); // cooldown to prevent spam
  const ALERT_DURATION = 8000; // 8 seconds of fleeing
  const COLLISION_COOLDOWN = 2000; // match Ship.tsx's 2-second cooldown

  const speed = useMemo(() => 2 + Math.random() * 3, []);

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

  useFrame((state, delta) => {
    if (!group.current) return;

    // ── Sinking animation ──
    if (sinking) {
      sinkProgress.current += delta * 0.4; // ~2.5 seconds to sink
      group.current.position.y = -sinkProgress.current * 6;
      group.current.rotation.z = sinkProgress.current * 0.8;
      group.current.rotation.x = sinkProgress.current * 0.3;
      if (sinkProgress.current >= 1) {
        // Fully sunk — remove from live positions
        npcLivePositions.delete(identity.id);
        group.current.visible = false;
      }
      return; // skip all other logic while sinking
    }

    const currentPos = group.current.position;
    const { playerMode, timeOfDay, addNotification, interactionPrompt, setInteractionPrompt, adjustReputation, setNearestHailableNpc, defeatedNpc } = useGameStore.getState();
    const playerPos = getLiveShipTransform().pos;

    // ── Check for hull damage from projectile hits ──
    const liveEntry = npcLivePositions.get(identity.id);
    if (liveEntry && liveEntry.hull < hullRef.current) {
      hullRef.current = liveEntry.hull;
      // Ship destroyed?
      if (hullRef.current <= 0) {
        setSinking(true);
        sfxShipSink();
        defeatedNpc(identity.id, identity.shipName, identity.flag as Nationality, identity.cargo as Partial<Record<Commodity, number>>);
        liveEntry.sunk = true;
        return;
      }
    }

    // Distance to player
    const distToPlayer = Math.sqrt(
      (currentPos.x - playerPos[0]) ** 2 +
      (currentPos.z - playerPos[2]) ** 2
    );

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

      // Hail prompt — only claim the slot if no other NPC already holds it
      if (distToPlayer < HAIL_RADIUS && !inHailRange.current) {
        const currentHailable = useGameStore.getState().nearestHailableNpc;
        if (!currentHailable) {
          inHailRange.current = true;
          setInteractionPrompt('Press T to Hail');
          setNearestHailableNpc(identity);
        }
      }
      if (distToPlayer > HAIL_RADIUS * 1.2 && inHailRange.current) {
        inHailRange.current = false;
        // Only clear if we're the ones who set it
        const currentHailable = useGameStore.getState().nearestHailableNpc;
        if (currentHailable?.id === identity.id) {
          setInteractionPrompt(null);
          setNearestHailableNpc(null);
        }
      }
    }

    // ── Collision ──
    if (distToPlayer < COLLISION_RADIUS) {
      const now = Date.now();
      const bounceDir = new THREE.Vector3(
        currentPos.x - playerPos[0], 0, currentPos.z - playerPos[2]
      ).normalize();
      currentPos.addScaledVector(bounceDir, 2);

      // Only fire events/reputation once per cooldown (matches Ship.tsx's 2s gate)
      if (now - lastCollisionTime.current > COLLISION_COOLDOWN) {
        lastCollisionTime.current = now;
        window.dispatchEvent(new CustomEvent('ship-collision', {
          detail: { appearancePhrase: identity.appearancePhrase },
        }));
        hullRef.current = Math.max(0, hullRef.current - NPC_COLLISION_DAMAGE);
        if (liveEntry) liveEntry.hull = hullRef.current;
        adjustReputation(identity.flag, -5);

        if (hullRef.current <= 0) {
          if (liveEntry) liveEntry.sunk = true;
          setSinking(true);
          sfxShipSink();
          defeatedNpc(identity.id, identity.shipName, identity.flag as Nationality, identity.cargo as Partial<Record<Commodity, number>>);
          return;
        }

        const hullPct = Math.round((hullRef.current / identity.maxHull) * 100);
        addNotification(`Rammed the ${identity.shipName}! Hull: ${hullPct}%`, 'warning');
      }

      // Always refresh alert mode so the ship keeps fleeing
      alertUntil.current = now + ALERT_DURATION;
      targetRef.current.set(
        currentPos.x + bounceDir.x * 80, 0, currentPos.z + bounceDir.z * 80
      );
    }

    // Check for projectile hit alert from combat system
    if (liveEntry?.hitAlert && Date.now() < liveEntry.hitAlert) {
      alertUntil.current = Math.max(alertUntil.current, liveEntry.hitAlert);
    }

    const isAlerted = Date.now() < alertUntil.current;

    const now = Date.now();

    // ── Movement AI ──
    if (isAlerted) {
      // While alerted, keep fleeing away from the player
      const fleeDir = new THREE.Vector3(
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
    } else {
      const dist = currentPos.distanceTo(targetRef.current);
      if (dist < 5) {
        const waterTarget = findWaterTarget(currentPos.x, currentPos.z, NPC_TARGET_RADIUS);
        if (waterTarget) targetRef.current.set(waterTarget[0], 0, waterTarget[1]);
      }
    }

    const currentSpeed = isAlerted ? speed * 2.5 : speed; // flee faster when alerted

    const direction = new THREE.Vector3().subVectors(targetRef.current, currentPos).normalize();
    const targetRotation = Math.atan2(direction.x, direction.z);

    let rotDiff = targetRotation - group.current.rotation.y;
    while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
    while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
    group.current.rotation.y += rotDiff * delta * 2;

    const moveX = Math.sin(group.current.rotation.y) * currentSpeed * delta;
    const moveZ = Math.cos(group.current.rotation.y) * currentSpeed * delta;
    const nextX = currentPos.x + moveX;
    const nextZ = currentPos.z + moveZ;

    if (canNpcMoveTo(nextX, nextZ, group.current.rotation.y)) {
      group.current.position.x = nextX;
      group.current.position.z = nextZ;
    } else if (now >= nextTargetSearchAt.current) {
      const sampleDist = 2;
      const hL = getTerrainHeight(currentPos.x - sampleDist, currentPos.z);
      const hR = getTerrainHeight(currentPos.x + sampleDist, currentPos.z);
      const hF = getTerrainHeight(currentPos.x, currentPos.z + sampleDist);
      const hB = getTerrainHeight(currentPos.x, currentPos.z - sampleDist);
      const awayFromLandAngle = Math.atan2(hL - hR, hB - hF);
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

    // Bobbing
    group.current.position.y = Math.sin(state.clock.elapsedTime * 2 + initialPosition[0]) * 0.2;
    group.current.rotation.z = Math.sin(state.clock.elapsedTime * 1.5 + initialPosition[2]) * 0.05;
    group.current.rotation.x = Math.cos(state.clock.elapsedTime * 1.2 + initialPosition[0]) * 0.05;

    // Alert ring visibility
    if (alertRingRef.current) {
      alertRingRef.current.visible = isAlerted;
      if (isAlerted) {
        // Pulse the ring opacity
        const pulse = 0.5 + Math.sin(state.clock.elapsedTime * 6) * 0.3;
        (alertRingRef.current.material as THREE.MeshBasicMaterial).opacity = pulse;
      }
    }

    // Selection ring visibility
    if (selectRingRef.current) {
      const isSelected = selectedNpcId === identity.id;
      selectRingRef.current.visible = isSelected;
      if (isSelected) {
        selectRingRef.current.rotation.z = state.clock.elapsedTime * 0.5;
        const pulse = 0.4 + Math.sin(state.clock.elapsedTime * 3) * 0.15;
        (selectRingRef.current.material as THREE.MeshBasicMaterial).opacity = pulse;
      }
    }

    // Torch at night
    const theta = ((timeOfDay - 6) / 24) * Math.PI * 2;
    const sunH = Math.sin(theta);
    const torchIntensity = sunH < 0.15 ? Math.min(1, (0.15 - sunH) * 3) : 0;
    if (torchRef.current) {
      torchRef.current.intensity = torchIntensity * 2;
      torchRef.current.visible = torchIntensity > 0.01;
    }
    if (torchMeshRef.current) {
      torchMeshRef.current.emissiveIntensity = torchIntensity * 3;
      torchMeshRef.current.visible = torchIntensity > 0.01;
    }

    // Update live position for projectile hit detection
    npcLivePositions.set(identity.id, {
      x: currentPos.x,
      z: currentPos.z,
      flag: identity.flag,
      shipName: identity.shipName,
      hull: hullRef.current,
      maxHull: identity.maxHull,
      hitAlert: liveEntry?.hitAlert,
    });

    // ── Health bar (billboard toward camera) ──
    if (healthBarGroupRef.current) {
      const hullFrac = hullRef.current / identity.maxHull;
      const showBar = hullFrac < 1 && distToPlayer < 60;
      healthBarGroupRef.current.visible = showBar;
      if (showBar && healthBarFgRef.current) {
        healthBarFgRef.current.scale.x = Math.max(0.01, hullFrac);
        healthBarFgRef.current.position.x = -(1 - hullFrac) * 1.5;
        // Color: green → yellow → red
        const mat = healthBarFgRef.current.material as THREE.MeshBasicMaterial;
        if (hullFrac > 0.5) {
          mat.color.setRGB(1 - (hullFrac - 0.5) * 2, 1, 0);
        } else {
          mat.color.setRGB(1, hullFrac * 2, 0);
        }
        // Billboard: face camera
        healthBarGroupRef.current.lookAt(state.camera.position);
      }
    }
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
      {/* Hull */}
      <mesh position={[0, 0.5, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.8, 1, 4]} />
        <meshStandardMaterial color="#4a3b32" roughness={0.9} />
      </mesh>
      {/* Bow */}
      <mesh position={[0, 0.5, 2.5]} rotation={[0, Math.PI / 4, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.27, 1, 1.27]} />
        <meshStandardMaterial color="#4a3b32" roughness={0.9} />
      </mesh>
      {/* Mast */}
      <mesh position={[0, 2.5, 0.5]} castShadow>
        <cylinderGeometry args={[0.1, 0.1, 4]} />
        <meshStandardMaterial color="#3e2723" />
      </mesh>
      {/* Sail */}
      <mesh position={[0, 3, 0.6]} castShadow>
        <boxGeometry args={[2.5, 3, 0.1]} />
        <meshStandardMaterial color="#d2b48c" roughness={1} />
      </mesh>
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
  );
}
