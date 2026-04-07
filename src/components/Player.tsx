import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGameStore } from '../store/gameStore';
import * as THREE from 'three';
import { getTerrainHeight } from '../utils/terrain';

export function Player() {
  const group = useRef<THREE.Group>(null);
  const leftLeg = useRef<THREE.Mesh>(null);
  const rightLeg = useRef<THREE.Mesh>(null);
  const leftArm = useRef<THREE.Mesh>(null);
  const rightArm = useRef<THREE.Mesh>(null);
  
  const { walkingPos, walkingRot, setWalkingPos, setWalkingRot, playerMode, paused } = useGameStore();
  
  const keys = useRef({ w: false, a: false, s: false, d: false });
  const isMoving = useRef(false);

  useState(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() in keys.current) keys.current[e.key.toLowerCase() as keyof typeof keys.current] = true;
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
  });

  useFrame((state, delta) => {
    if (playerMode !== 'walking' || !group.current || paused) return;

    const speed = 10 * delta;
    const turnSpeed = 3 * delta;
    
    let moveX = 0;
    let moveZ = 0;
    
    if (keys.current.w) moveZ -= speed;
    if (keys.current.s) moveZ += speed;
    if (keys.current.a) moveX -= speed;
    if (keys.current.d) moveX += speed;

    isMoving.current = moveX !== 0 || moveZ !== 0;

    if (isMoving.current) {
      // Calculate target rotation
      const targetRot = Math.atan2(moveX, moveZ);
      
      // Smooth rotation
      let rotDiff = targetRot - walkingRot;
      while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
      while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
      
      const newRot = walkingRot + rotDiff * turnSpeed * 5;
      setWalkingRot(newRot);
      group.current.rotation.y = newRot;

      // Update position
      const newX = walkingPos[0] + moveX;
      const newZ = walkingPos[2] + moveZ;
      const newY = getTerrainHeight(newX, newZ);
      
      // Prevent walking deep underwater
      if (newY > -2) {
        setWalkingPos([newX, newY, newZ]);
      }
    }

    group.current.position.set(walkingPos[0], walkingPos[1], walkingPos[2]);

    // Animate limbs
    if (isMoving.current) {
      const t = state.clock.elapsedTime * 10;
      if (leftLeg.current) leftLeg.current.rotation.x = Math.sin(t) * 0.5;
      if (rightLeg.current) rightLeg.current.rotation.x = -Math.sin(t) * 0.5;
      if (leftArm.current) leftArm.current.rotation.x = -Math.sin(t) * 0.5;
      if (rightArm.current) rightArm.current.rotation.x = Math.sin(t) * 0.5;
    } else {
      if (leftLeg.current) leftLeg.current.rotation.x = 0;
      if (rightLeg.current) rightLeg.current.rotation.x = 0;
      if (leftArm.current) leftArm.current.rotation.x = 0;
      if (rightArm.current) rightArm.current.rotation.x = 0;
    }
  });

  if (playerMode !== 'walking') return null;

  return (
    <group ref={group}>
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
