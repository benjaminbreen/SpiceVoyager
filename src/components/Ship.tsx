import { useRef, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGameStore } from '../store/gameStore';
import * as THREE from 'three';
import { getTerrainHeight } from '../utils/terrain';
import { Text } from '@react-three/drei';

export function Ship() {
  const group = useRef<THREE.Group>(null);
  const hullMaterialRef = useRef<THREE.MeshStandardMaterial>(null);
  const { setPlayerPos, setPlayerRot, setPlayerVelocity, stats, playerMode, damageShip, addNotification, paused } = useGameStore();
  
  // Physics state
  const velocity = useRef(0);
  const rotation = useRef(0);
  
  // Input state
  const keys = useRef({ w: false, a: false, s: false, d: false });

  // Visual effects state
  const lastDamageTime = useRef(0);
  const [showExclamation, setShowExclamation] = useState(false);
  
  // Particles
  const particlesRef = useRef<THREE.InstancedMesh>(null);
  const particleData = useRef<{pos: THREE.Vector3, vel: THREE.Vector3, life: number}[]>([]);
  const particleCount = 30;

  useEffect(() => {
    // Initialize particles
    for (let i = 0; i < particleCount; i++) {
      particleData.current.push({
        pos: new THREE.Vector3(0, -1000, 0), // Hidden initially
        vel: new THREE.Vector3(),
        life: 0
      });
    }
  }, []);

  const triggerCollision = () => {
    const now = Date.now();
    if (now - lastDamageTime.current > 2000) { // 2 second cooldown
      lastDamageTime.current = now;
      damageShip(10);
      addNotification('Hull damaged!', 'error');
      setShowExclamation(true);
      
      // Hide exclamation after 2 seconds
      setTimeout(() => setShowExclamation(false), 2000);

      // Spawn particles
      if (group.current) {
        for (let i = 0; i < particleCount; i++) {
          const p = particleData.current[i];
          p.pos.copy(group.current.position).add(new THREE.Vector3(
            (Math.random() - 0.5) * 2,
            1 + Math.random(),
            (Math.random() - 0.5) * 2
          ));
          p.vel.set(
            (Math.random() - 0.5) * 10,
            5 + Math.random() * 5,
            (Math.random() - 0.5) * 10
          );
          p.life = 1.0; // 1 second life
        }
      }
    }
  };

  useEffect(() => {
    const handleCollisionEvent = () => triggerCollision();
    window.addEventListener('ship-collision', handleCollisionEvent);
    return () => window.removeEventListener('ship-collision', handleCollisionEvent);
  }, []);

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
    if (!group.current) return;

    if (playerMode === 'ship' && !paused) {
      // Acceleration and Inertia
      const maxSpeed = stats.speed;
      const accel = 5 * delta;
      const drag = 2 * delta;
      
      if (keys.current.w) {
        velocity.current = Math.min(velocity.current + accel, maxSpeed);
      } else if (keys.current.s) {
        velocity.current = Math.max(velocity.current - accel, -maxSpeed / 2);
      } else {
        // Apply drag
        if (velocity.current > 0) velocity.current = Math.max(0, velocity.current - drag);
        if (velocity.current < 0) velocity.current = Math.min(0, velocity.current + drag);
      }

      // Turning (only turn if moving, or turn slowly if stopped)
      const turnFactor = Math.abs(velocity.current) > 0.1 ? 1 : 0.2;
      const turnSpeed = stats.turnSpeed * delta * turnFactor;
      
      if (keys.current.a) rotation.current += turnSpeed;
      if (keys.current.d) rotation.current -= turnSpeed;

      // Apply movement
      const moveX = Math.sin(rotation.current) * velocity.current * delta;
      const moveZ = Math.cos(rotation.current) * velocity.current * delta;

      // Collision detection with land
      const nextX = group.current.position.x + moveX;
      const nextZ = group.current.position.z + moveZ;
      
      // Check multiple points around the ship to prevent clipping
      const points = [
        [0, 3.5],   // Bow
        [0, -2],    // Stern
        [-1.5, 0],  // Port
        [1.5, 0]    // Starboard
      ];
      
      let hitLand = false;
      for (const [px, pz] of points) {
        const worldX = nextX + Math.sin(rotation.current) * pz + Math.cos(rotation.current) * px;
        const worldZ = nextZ + Math.cos(rotation.current) * pz - Math.sin(rotation.current) * px;
        const terrainHeight = getTerrainHeight(worldX, worldZ);
        
        // Water is at y = -0.2. Stop the ship when the water gets too shallow (e.g., terrain > -0.5)
        if (terrainHeight > -0.5) { 
          hitLand = true;
          break;
        }
      }

      if (!hitLand) {
        group.current.position.x = nextX;
        group.current.position.z = nextZ;
      } else {
        if (Math.abs(velocity.current) > 2) {
          triggerCollision();
        }
        velocity.current = 0; // Stop if hitting land
      }
      
      group.current.rotation.y = rotation.current;

      // Update store
      setPlayerPos([group.current.position.x, group.current.position.y, group.current.position.z]);
      setPlayerRot(rotation.current);
      setPlayerVelocity(velocity.current);
    }

    // Bobbing effect (always active)
    group.current.position.y = Math.sin(state.clock.elapsedTime * 2) * 0.2;
    group.current.rotation.z = Math.sin(state.clock.elapsedTime * 1.5) * 0.05;
    group.current.rotation.x = Math.cos(state.clock.elapsedTime * 1.2) * 0.05;

    // Visual Effects Updates
    const now = Date.now();
    const timeSinceDamage = now - lastDamageTime.current;
    
    // Hull glowing red
    if (hullMaterialRef.current) {
      if (timeSinceDamage < 500) {
        hullMaterialRef.current.emissive.setHex(0xff0000);
        hullMaterialRef.current.emissiveIntensity = 1 - (timeSinceDamage / 500);
      } else {
        hullMaterialRef.current.emissive.setHex(0x000000);
        hullMaterialRef.current.emissiveIntensity = 0;
      }
    }

    // Update Particles
    if (particlesRef.current) {
      const dummy = new THREE.Object3D();
      let needsUpdate = false;
      for (let i = 0; i < particleCount; i++) {
        const p = particleData.current[i];
        if (p.life > 0) {
          p.life -= delta;
          p.vel.y -= 15 * delta; // Gravity
          p.pos.addScaledVector(p.vel, delta);
          
          dummy.position.copy(p.pos);
          const scale = Math.max(0, p.life);
          dummy.scale.set(scale, scale, scale);
          dummy.updateMatrix();
          particlesRef.current.setMatrixAt(i, dummy.matrix);
          needsUpdate = true;
        } else if (p.pos.y > -100) {
          // Hide dead particles
          p.pos.set(0, -1000, 0);
          dummy.position.copy(p.pos);
          dummy.updateMatrix();
          particlesRef.current.setMatrixAt(i, dummy.matrix);
          needsUpdate = true;
        }
      }
      if (needsUpdate) {
        particlesRef.current.instanceMatrix.needsUpdate = true;
      }
    }
  });

  return (
    <>
      <group ref={group}>
        {/* Exclamation Point */}
        {showExclamation && (
          <Text
            position={[0, 8, 0]}
            fontSize={3}
            color="red"
            outlineWidth={0.2}
            outlineColor="white"
            fontWeight="bold"
          >
            !
          </Text>
        )}

        {/* Hull */}
        <mesh position={[0, 0.5, 0]} castShadow receiveShadow>
          <boxGeometry args={[2.2, 1.2, 5]} />
          <meshStandardMaterial ref={hullMaterialRef} color="#5C4033" roughness={0.9} />
        </mesh>
        {/* Deck */}
        <mesh position={[0, 1.11, 0]} castShadow receiveShadow>
          <boxGeometry args={[2.0, 0.1, 4.8]} />
          <meshStandardMaterial color="#8B4513" roughness={0.8} />
        </mesh>
        {/* Bow */}
        <mesh position={[0, 0.5, 3.2]} rotation={[0, Math.PI / 4, 0]} castShadow receiveShadow>
          <boxGeometry args={[1.55, 1.2, 1.55]} />
          <meshStandardMaterial color="#5C4033" roughness={0.9} />
        </mesh>
        {/* Bow Deck */}
        <mesh position={[0, 1.11, 3.2]} rotation={[0, Math.PI / 4, 0]} castShadow receiveShadow>
          <boxGeometry args={[1.4, 0.1, 1.4]} />
          <meshStandardMaterial color="#8B4513" roughness={0.8} />
        </mesh>
        {/* Stern cabin */}
        <mesh position={[0, 1.6, -1.5]} castShadow receiveShadow>
          <boxGeometry args={[2, 1, 1.5]} />
          <meshStandardMaterial color="#6B4423" roughness={0.9} />
        </mesh>
        {/* Main Mast */}
        <mesh position={[0, 3.5, 0.5]} castShadow>
          <cylinderGeometry args={[0.15, 0.15, 6]} />
          <meshStandardMaterial color="#3e2723" />
        </mesh>
        {/* Main Sail */}
        <mesh position={[0, 4, 0.6]} castShadow>
          <boxGeometry args={[3.5, 4, 0.1]} />
          <meshStandardMaterial color="#f5f5dc" roughness={1} />
        </mesh>
        {/* Foremast */}
        <mesh position={[0, 2.5, 2.5]} castShadow>
          <cylinderGeometry args={[0.1, 0.1, 4]} />
          <meshStandardMaterial color="#3e2723" />
        </mesh>
        {/* Fore Sail */}
        <mesh position={[0, 3, 2.6]} castShadow>
          <boxGeometry args={[2.5, 3, 0.1]} />
          <meshStandardMaterial color="#f5f5dc" roughness={1} />
        </mesh>
      </group>

      {/* Damage Particles */}
      <instancedMesh ref={particlesRef} args={[undefined, undefined, particleCount]}>
        <boxGeometry args={[0.3, 0.3, 0.3]} />
        <meshStandardMaterial color="#8B4513" roughness={1} />
      </instancedMesh>
    </>
  );
}
