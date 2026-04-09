import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '../store/gameStore';
import type { NPCShipIdentity } from '../utils/npcShipGenerator';

const APPROACH_RADIUS = 40;  // show "approaching" toast
const HAIL_RADIUS = 12;     // show "Press T to Talk" prompt
const COLLISION_RADIUS = 4;

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
  const targetRef = useRef(new THREE.Vector3(
    initialPosition[0] + (Math.random() - 0.5) * 50,
    0,
    initialPosition[2] + (Math.random() - 0.5) * 50
  ));

  // Track proximity state to avoid spamming
  const approachNotified = useRef(false);
  const inHailRange = useRef(false);

  const speed = useMemo(() => 2 + Math.random() * 3, []);

  useFrame((state, delta) => {
    if (!group.current) return;

    const currentPos = group.current.position;
    const { playerPos, playerMode, timeOfDay, addNotification, interactionPrompt, setInteractionPrompt } = useGameStore.getState();

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

      // Hail prompt
      if (distToPlayer < HAIL_RADIUS && !inHailRange.current) {
        inHailRange.current = true;
        setInteractionPrompt('Press T to Hail');
      }
      if (distToPlayer > HAIL_RADIUS * 1.2 && inHailRange.current) {
        inHailRange.current = false;
        // Only clear if we're the ones who set it
        if (interactionPrompt === 'Press T to Hail') {
          setInteractionPrompt(null);
        }
      }
    }

    // ── Collision ──
    if (distToPlayer < COLLISION_RADIUS) {
      window.dispatchEvent(new CustomEvent('ship-collision'));
      const bounceDir = new THREE.Vector3(
        currentPos.x - playerPos[0], 0, currentPos.z - playerPos[2]
      ).normalize();
      currentPos.addScaledVector(bounceDir, 2);
      targetRef.current.set(
        currentPos.x + bounceDir.x * 50, 0, currentPos.z + bounceDir.z * 50
      );
    }

    // ── Movement AI ──
    const dist = currentPos.distanceTo(targetRef.current);
    if (dist < 5) {
      targetRef.current.set(
        currentPos.x + (Math.random() - 0.5) * 100,
        0,
        currentPos.z + (Math.random() - 0.5) * 100
      );
    }

    const direction = new THREE.Vector3().subVectors(targetRef.current, currentPos).normalize();
    const targetRotation = Math.atan2(direction.x, direction.z);

    let rotDiff = targetRotation - group.current.rotation.y;
    while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
    while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
    group.current.rotation.y += rotDiff * delta * 2;

    group.current.position.x += Math.sin(group.current.rotation.y) * speed * delta;
    group.current.position.z += Math.cos(group.current.rotation.y) * speed * delta;

    // Bobbing
    group.current.position.y = Math.sin(state.clock.elapsedTime * 2 + initialPosition[0]) * 0.2;
    group.current.rotation.z = Math.sin(state.clock.elapsedTime * 1.5 + initialPosition[2]) * 0.05;
    group.current.rotation.x = Math.cos(state.clock.elapsedTime * 1.2 + initialPosition[0]) * 0.05;

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
  });

  return (
    <group ref={group} position={initialPosition}>
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
