import { useMemo, useEffect, useRef } from 'react';
import { useGameStore, Port, Commodity } from '../store/gameStore';
import * as THREE from 'three';
import { Sky, useGLTF } from '@react-three/drei';
import { NPCShip } from './NPCShip';
import { getTerrainData, getTerrainHeight, noise2D, reseedTerrain } from '../utils/terrain';
import { useFrame } from '@react-three/fiber';
import { generateMap, DEFAULT_MAP_CONFIG } from '../utils/mapGenerator';

import { ProceduralCity } from './ProceduralCity';

const COMMODITIES: Commodity[] = ['Spices', 'Silk', 'Tea', 'Wood', 'Cannonballs'];

export function World() {
  const { initWorld, ports, timeOfDay, setNpcPositions, npcPositions, worldSeed } = useGameStore();
  const terrainRef = useRef<THREE.Mesh>(null);

  // Generate world data once
  const { 
    terrainGeometry, terrainColors, generatedPorts, generatedNpcs, 
    treeData, deadTreeData, cactusData, crabData, fishData 
  } = useMemo(() => {
    // Reseed terrain noise before generating
    reseedTerrain(worldSeed);
    // Generate ports using our new intelligent placement algorithm
    const portsData = generateMap({ ...DEFAULT_MAP_CONFIG, seed: worldSeed });
    
    const npcs: [number, number, number][] = [];
    const trees: { position: [number, number, number], scale: number }[] = [];
    const deadTrees: { position: [number, number, number], scale: number }[] = [];
    const cacti: { position: [number, number, number], scale: number }[] = [];
    const crabs: { position: [number, number, number], rotation: number }[] = [];
    const fishes: { position: [number, number, number], rotation: number }[] = [];
    
    // Create custom terrain geometry
    const size = 1000;
    const segments = 256;
    const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
    const colors = new Float32Array(geometry.attributes.position.count * 3);
    
    const posAttribute = geometry.attributes.position;
    
    for (let i = 0; i < posAttribute.count; i++) {
      const x = posAttribute.getX(i);
      const y_orig = posAttribute.getY(i); // Plane is created in XY
      const worldZ = -y_orig; // We rotate it -90 degrees on X later
      
      const { height, biome, color } = getTerrainData(x, worldZ);
      posAttribute.setZ(i, height);
      
      colors[i * 3] = color[0];
      colors[i * 3 + 1] = color[1];
      colors[i * 3 + 2] = color[2];
      
      // Flora & Fauna placement
      const rand = Math.random();
      
      if (biome === 'forest' || biome === 'jungle') {
        if (rand > (biome === 'jungle' ? 0.9 : 0.98)) {
          trees.push({ position: [x, height, worldZ], scale: 0.5 + Math.random() * 1.5 });
        }
      } else if (biome === 'swamp') {
        if (rand > 0.97) {
          deadTrees.push({ position: [x, height, worldZ], scale: 0.5 + Math.random() * 1.0 });
        }
      } else if (biome === 'desert' || biome === 'arroyo') {
        if (rand > 0.99) {
          cacti.push({ position: [x, height, worldZ], scale: 0.5 + Math.random() * 1.0 });
        }
      } else if (biome === 'beach') {
        if (rand > 0.95) {
          crabs.push({ position: [x, height, worldZ], rotation: Math.random() * Math.PI * 2 });
        }
      } else if (biome === 'ocean' && height > -3 && height < -0.5) {
        if (rand > 0.98) {
          // Shoal of fish
          for (let f = 0; f < 3 + Math.random() * 5; f++) {
            fishes.push({ 
              position: [x + (Math.random()-0.5)*2, height - Math.random(), worldZ + (Math.random()-0.5)*2], 
              rotation: Math.random() * Math.PI * 2 
            });
          }
        }
      }
      
      // Spawn NPCs in deep water
      if (height < -10 && rand > 0.9995 && npcs.length < 20) {
        npcs.push([x, 0, worldZ]);
      }
    }
    
    geometry.computeVertexNormals();
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    
    return { 
      terrainGeometry: geometry, 
      terrainColors: colors,
      generatedPorts: portsData, 
      generatedNpcs: npcs,
      treeData: trees,
      deadTreeData: deadTrees,
      cactusData: cacti,
      crabData: crabs,
      fishData: fishes
    };
  }, [worldSeed]);

  useEffect(() => {
    initWorld(generatedPorts);
    setNpcPositions(generatedNpcs);
  }, [generatedPorts, generatedNpcs, initWorld, setNpcPositions]);

  // Calculate sun position based on time of day (0-24)
  const sunPosition = useMemo(() => {
    const angle = ((timeOfDay - 6) / 24) * Math.PI * 2; // 6 AM is sunrise
    return new THREE.Vector3(Math.cos(angle) * 100, Math.sin(angle) * 100, 0);
  }, [timeOfDay]);

  // Instanced Meshes Setup
  const treeTrunkGeometry = useMemo(() => new THREE.CylinderGeometry(0.2, 0.3, 2, 5), []);
  const treeLeavesGeometry = useMemo(() => new THREE.ConeGeometry(1.5, 4, 5), []);
  const treeTrunkMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: '#4a3b32' }), []);
  const treeLeavesMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: '#2d4c1e' }), []);

  const deadTreeMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: '#3a3a3a' }), []);
  const cactusGeometry = useMemo(() => new THREE.CylinderGeometry(0.3, 0.3, 2, 6), []);
  const cactusMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: '#2E8B57' }), []);
  
  const crabGeometry = useMemo(() => new THREE.BoxGeometry(0.3, 0.1, 0.2), []);
  const crabMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: '#ff4444' }), []);
  
  const fishGeometry = useMemo(() => new THREE.ConeGeometry(0.1, 0.4, 4), []);
  const fishMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: '#44aaff' }), []);

  const trunkMeshRef = useRef<THREE.InstancedMesh>(null);
  const leavesMeshRef = useRef<THREE.InstancedMesh>(null);
  const deadTreeMeshRef = useRef<THREE.InstancedMesh>(null);
  const cactusMeshRef = useRef<THREE.InstancedMesh>(null);
  const crabMeshRef = useRef<THREE.InstancedMesh>(null);
  const fishMeshRef = useRef<THREE.InstancedMesh>(null);

  useEffect(() => {
    const dummy = new THREE.Object3D();
    
    if (trunkMeshRef.current && leavesMeshRef.current) {
      treeData.forEach((tree, i) => {
        dummy.position.set(tree.position[0], tree.position[1] + 1 * tree.scale, tree.position[2]);
        dummy.scale.set(tree.scale, tree.scale, tree.scale);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        trunkMeshRef.current!.setMatrixAt(i, dummy.matrix);
        
        dummy.position.set(tree.position[0], tree.position[1] + 3 * tree.scale, tree.position[2]);
        dummy.updateMatrix();
        leavesMeshRef.current!.setMatrixAt(i, dummy.matrix);
      });
      trunkMeshRef.current.instanceMatrix.needsUpdate = true;
      leavesMeshRef.current.instanceMatrix.needsUpdate = true;
    }

    if (deadTreeMeshRef.current) {
      deadTreeData.forEach((tree, i) => {
        dummy.position.set(tree.position[0], tree.position[1] + 1 * tree.scale, tree.position[2]);
        dummy.scale.set(tree.scale, tree.scale, tree.scale);
        dummy.rotation.set(0.2, Math.random() * Math.PI, 0.1);
        dummy.updateMatrix();
        deadTreeMeshRef.current!.setMatrixAt(i, dummy.matrix);
      });
      deadTreeMeshRef.current.instanceMatrix.needsUpdate = true;
    }

    if (cactusMeshRef.current) {
      cactusData.forEach((cactus, i) => {
        dummy.position.set(cactus.position[0], cactus.position[1] + 1 * cactus.scale, cactus.position[2]);
        dummy.scale.set(cactus.scale, cactus.scale, cactus.scale);
        dummy.rotation.set(0, Math.random() * Math.PI, 0);
        dummy.updateMatrix();
        cactusMeshRef.current!.setMatrixAt(i, dummy.matrix);
      });
      cactusMeshRef.current.instanceMatrix.needsUpdate = true;
    }

    if (crabMeshRef.current) {
      crabData.forEach((crab, i) => {
        dummy.position.set(crab.position[0], crab.position[1] + 0.05, crab.position[2]);
        dummy.scale.set(1, 1, 1);
        dummy.rotation.set(0, crab.rotation, 0);
        dummy.updateMatrix();
        crabMeshRef.current!.setMatrixAt(i, dummy.matrix);
      });
      crabMeshRef.current.instanceMatrix.needsUpdate = true;
    }

    if (fishMeshRef.current) {
      fishData.forEach((fish, i) => {
        dummy.position.set(fish.position[0], fish.position[1], fish.position[2]);
        dummy.scale.set(1, 1, 1);
        dummy.rotation.set(Math.PI / 2, fish.rotation, 0); // Point forward
        dummy.updateMatrix();
        fishMeshRef.current!.setMatrixAt(i, dummy.matrix);
      });
      fishMeshRef.current.instanceMatrix.needsUpdate = true;
    }
  }, [treeData, deadTreeData, cactusData, crabData, fishData]);

  // Animate fish and crabs slightly
  useFrame((state) => {
    const time = state.clock.elapsedTime;
    const dummy = new THREE.Object3D();
    
    if (fishMeshRef.current) {
      fishData.forEach((fish, i) => {
        // Swim in circles
        const angle = fish.rotation + time * 0.5;
        const radius = 0.5;
        dummy.position.set(
          fish.position[0] + Math.cos(angle) * radius,
          fish.position[1] + Math.sin(time * 2 + i) * 0.1, // Bob up and down
          fish.position[2] + Math.sin(angle) * radius
        );
        dummy.rotation.set(Math.PI / 2, -angle, 0);
        dummy.updateMatrix();
        fishMeshRef.current!.setMatrixAt(i, dummy.matrix);
      });
      fishMeshRef.current.instanceMatrix.needsUpdate = true;
    }

    if (crabMeshRef.current) {
      crabData.forEach((crab, i) => {
        // Scuttle side to side
        const offset = Math.sin(time + i) * 0.2;
        dummy.position.set(
          crab.position[0] + Math.cos(crab.rotation + Math.PI/2) * offset,
          crab.position[1] + 0.05,
          crab.position[2] + Math.sin(crab.rotation + Math.PI/2) * offset
        );
        dummy.rotation.set(0, crab.rotation, 0);
        dummy.updateMatrix();
        crabMeshRef.current!.setMatrixAt(i, dummy.matrix);
      });
      crabMeshRef.current.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <group>
      <Sky sunPosition={sunPosition} turbidity={0.1} rayleigh={0.5} mieCoefficient={0.005} mieDirectionalG={0.8} />
      
      <ambientLight intensity={Math.max(0.1, Math.sin(((timeOfDay - 6) / 24) * Math.PI * 2))} />
      <directionalLight 
        position={sunPosition} 
        intensity={Math.max(0, Math.sin(((timeOfDay - 6) / 24) * Math.PI * 2)) * 2} 
        castShadow 
        shadow-mapSize={[2048, 2048]}
      >
        <orthographicCamera attach="shadow-camera" args={[-200, 200, 200, -200, 1, 500]} />
      </directionalLight>

      {/* Procedural Terrain */}
      <mesh 
        ref={terrainRef} 
        geometry={terrainGeometry} 
        rotation={[-Math.PI / 2, 0, 0]} 
        receiveShadow 
        castShadow
      >
        <meshStandardMaterial vertexColors roughness={0.8} />
      </mesh>

      {/* Instanced Flora & Fauna */}
      {treeData.length > 0 && (
        <>
          <instancedMesh ref={trunkMeshRef} args={[treeTrunkGeometry, treeTrunkMaterial, treeData.length]} castShadow receiveShadow />
          <instancedMesh ref={leavesMeshRef} args={[treeLeavesGeometry, treeLeavesMaterial, treeData.length]} castShadow receiveShadow />
        </>
      )}
      {deadTreeData.length > 0 && (
        <instancedMesh ref={deadTreeMeshRef} args={[treeTrunkGeometry, deadTreeMaterial, deadTreeData.length]} castShadow receiveShadow />
      )}
      {cactusData.length > 0 && (
        <instancedMesh ref={cactusMeshRef} args={[cactusGeometry, cactusMaterial, cactusData.length]} castShadow receiveShadow />
      )}
      {crabData.length > 0 && (
        <instancedMesh ref={crabMeshRef} args={[crabGeometry, crabMaterial, crabData.length]} castShadow receiveShadow />
      )}
      {fishData.length > 0 && (
        <instancedMesh ref={fishMeshRef} args={[fishGeometry, fishMaterial, fishData.length]} castShadow />
      )}

      {/* Ports */}
      <ProceduralCity />

      {/* NPC Ships */}
      {npcPositions.map((pos, i) => (
        <NPCShip key={i} initialPosition={pos} />
      ))}
    </group>
  );
}
