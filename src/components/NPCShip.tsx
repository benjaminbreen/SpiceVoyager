import { useRef, useState, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '../store/gameStore';

export function NPCShip({ initialPosition }: { initialPosition: [number, number, number] }) {
  const group = useRef<THREE.Group>(null);
  const { playerPos } = useGameStore();
  
  const [target, setTarget] = useState(new THREE.Vector3(
    initialPosition[0] + (Math.random() - 0.5) * 50,
    0,
    initialPosition[2] + (Math.random() - 0.5) * 50
  ));
  
  const speed = useMemo(() => 2 + Math.random() * 3, []);

  useFrame((state, delta) => {
    if (!group.current) return;

    const currentPos = group.current.position;
    
    // Check collision with player
    const distToPlayer = Math.sqrt(
      (currentPos.x - playerPos[0])**2 + 
      (currentPos.z - playerPos[2])**2
    );
    
    if (distToPlayer < 4) { // Collision radius
      window.dispatchEvent(new CustomEvent('ship-collision'));
      
      // Bounce away slightly
      const bounceDir = new THREE.Vector3(currentPos.x - playerPos[0], 0, currentPos.z - playerPos[2]).normalize();
      currentPos.addScaledVector(bounceDir, 2);
      
      // Pick a new target away from player
      setTarget(new THREE.Vector3(
        currentPos.x + bounceDir.x * 50,
        0,
        currentPos.z + bounceDir.z * 50
      ));
    }

    const dist = currentPos.distanceTo(target);

    if (dist < 5) {
      // Pick a new target
      setTarget(new THREE.Vector3(
        currentPos.x + (Math.random() - 0.5) * 100,
        0,
        currentPos.z + (Math.random() - 0.5) * 100
      ));
    }

    // Move towards target
    const direction = new THREE.Vector3().subVectors(target, currentPos).normalize();
    
    // Calculate rotation to face target
    const targetRotation = Math.atan2(direction.x, direction.z);
    
    // Smoothly rotate towards target
    // Simple lerp for rotation (needs proper quaternion slerp for perfection, but this works for a simple game)
    let rotDiff = targetRotation - group.current.rotation.y;
    // Normalize rotDiff to -PI to PI
    while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
    while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
    
    group.current.rotation.y += rotDiff * delta * 2;

    // Move forward
    group.current.position.x += Math.sin(group.current.rotation.y) * speed * delta;
    group.current.position.z += Math.cos(group.current.rotation.y) * speed * delta;

    // Bobbing
    group.current.position.y = Math.sin(state.clock.elapsedTime * 2 + initialPosition[0]) * 0.2;
    group.current.rotation.z = Math.sin(state.clock.elapsedTime * 1.5 + initialPosition[2]) * 0.05;
    group.current.rotation.x = Math.cos(state.clock.elapsedTime * 1.2 + initialPosition[0]) * 0.05;
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
    </group>
  );
}
