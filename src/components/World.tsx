import { useMemo, useEffect, useRef } from 'react';
import { useGameStore, Commodity } from '../store/gameStore';
import * as THREE from 'three';
import { mergeVertices, mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Sky } from '@react-three/drei';
import { NPCShip } from './NPCShip';
import { getTerrainData, reseedTerrain } from '../utils/terrain';
import { useFrame } from '@react-three/fiber';
import { generateMap, singlePortConfig, devModeConfig, findSafeSpawn } from '../utils/mapGenerator';
import { startTerrainPreRender } from './WorldMap';
import { SEA_LEVEL } from '../constants/world';

import { ProceduralCity } from './ProceduralCity';
import { PortIndicators } from './PortIndicators';
import { generateNPCShip } from '../utils/npcShipGenerator';

// ── Shared crab state (readable by Player.tsx for collection) ─────────────────
export type CrabEntry = { position: [number, number, number]; rotation: number };
let _crabData: CrabEntry[] = [];
let _collectedCrabs = new Set<number>();

export function getCrabData() { return _crabData; }
export function getCollectedCrabs() { return _collectedCrabs; }
export function collectCrabAt(index: number) { _collectedCrabs.add(index); }

const COMMODITIES: Commodity[] = ['Spices', 'Silk', 'Tea', 'Wood', 'Cannonballs'];
const COASTLINE_CLIP_LEVEL = SEA_LEVEL - 0.22;

type TerrainVertex = {
  position: THREE.Vector3;
  color: THREE.Color;
};

function cloneTerrainVertex(vertex: TerrainVertex): TerrainVertex {
  return {
    position: vertex.position.clone(),
    color: vertex.color.clone(),
  };
}

function interpolateTerrainVertex(a: TerrainVertex, b: TerrainVertex, clipLevel: number): TerrainVertex {
  const denom = b.position.z - a.position.z;
  const t = denom === 0 ? 0 : (clipLevel - a.position.z) / denom;

  return {
    position: a.position.clone().lerp(b.position, t),
    color: a.color.clone().lerp(b.color, t),
  };
}

function clipTriangleToSeaLevel(vertices: TerrainVertex[], keepAbove: boolean, clipLevel: number): TerrainVertex[] {
  const clipped: TerrainVertex[] = [];

  for (let i = 0; i < vertices.length; i++) {
    const current = vertices[i];
    const next = vertices[(i + 1) % vertices.length];
    const currentInside = keepAbove
      ? current.position.z >= clipLevel
      : current.position.z <= clipLevel;
    const nextInside = keepAbove
      ? next.position.z >= clipLevel
      : next.position.z <= clipLevel;

    if (currentInside && nextInside) {
      clipped.push(cloneTerrainVertex(next));
    } else if (currentInside && !nextInside) {
      clipped.push(interpolateTerrainVertex(current, next, clipLevel));
    } else if (!currentInside && nextInside) {
      clipped.push(interpolateTerrainVertex(current, next, clipLevel));
      clipped.push(cloneTerrainVertex(next));
    }
  }

  return clipped;
}

function appendClippedPolygon(
  polygon: TerrainVertex[],
  positionTarget: number[],
  colorTarget: number[],
) {
  if (polygon.length < 3) return;

  for (let i = 1; i < polygon.length - 1; i++) {
    const triangle = [polygon[0], polygon[i], polygon[i + 1]];
    for (const vertex of triangle) {
      positionTarget.push(vertex.position.x, vertex.position.y, vertex.position.z);
      colorTarget.push(vertex.color.r, vertex.color.g, vertex.color.b);
    }
  }
}

function buildTerrainSurfaceGeometry(
  sourceGeometry: THREE.BufferGeometry,
  keepAbove: boolean,
  clipLevel: number,
): THREE.BufferGeometry {
  const workingGeometry = sourceGeometry.index
    ? sourceGeometry.toNonIndexed()
    : sourceGeometry.clone();
  const positionAttr = workingGeometry.getAttribute('position') as THREE.BufferAttribute;
  const colorAttr = workingGeometry.getAttribute('color') as THREE.BufferAttribute;
  const positions: number[] = [];
  const colors: number[] = [];

  // Reuse triangle vertex objects to avoid millions of allocations
  const triangle: TerrainVertex[] = [
    { position: new THREE.Vector3(), color: new THREE.Color() },
    { position: new THREE.Vector3(), color: new THREE.Color() },
    { position: new THREE.Vector3(), color: new THREE.Color() },
  ];

  for (let i = 0; i < positionAttr.count; i += 3) {
    for (let j = 0; j < 3; j++) {
      const index = i + j;
      triangle[j].position.set(
        positionAttr.getX(index),
        positionAttr.getY(index),
        positionAttr.getZ(index),
      );
      triangle[j].color.setRGB(
        colorAttr.getX(index),
        colorAttr.getY(index),
        colorAttr.getZ(index),
      );
    }

    const clippedPolygon = clipTriangleToSeaLevel(triangle, keepAbove, clipLevel);
    appendClippedPolygon(clippedPolygon, positions, colors);
  }

  workingGeometry.dispose();

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

  // Merge duplicate vertices so computeVertexNormals averages normals across
  // adjacent faces — this produces smooth shading instead of flat polygon facets.
  const merged = mergeVertices(geometry, 0.01);
  merged.computeVertexNormals();

  geometry.dispose();
  return merged;
}

export function World() {
  const initWorld = useGameStore((state) => state.initWorld);
  const timeOfDay = useGameStore((state) => state.timeOfDay);
  const setNpcPositions = useGameStore((state) => state.setNpcPositions);
  const setNpcShips = useGameStore((state) => state.setNpcShips);
  const npcShips = useGameStore((state) => state.npcShips);
  const worldSeed = useGameStore((state) => state.worldSeed);
  const worldSize = useGameStore((state) => state.worldSize);
  const devSoloPort = useGameStore((state) => state.devSoloPort);
  const setPlayerPos = useGameStore((state) => state.setPlayerPos);
  const shadowsEnabled = useGameStore((state) => state.renderDebug.shadows);
  const wildlifeMotionEnabled = useGameStore((state) => state.renderDebug.wildlifeMotion);

  // Generate world data once
  const { 
    landTerrainGeometry, seabedTerrainGeometry, generatedPorts, generatedNpcs,
    treeData, deadTreeData, cactusData, crabData, fishData 
  } = useMemo(() => {
    // Reseed terrain noise before generating
    reseedTerrain(worldSeed);
    // Generate ports — use dev mode config if a solo port is selected
    const mapConfig = devSoloPort
      ? devModeConfig(devSoloPort, worldSeed)
      : singlePortConfig(worldSeed, worldSize);
    const portsData = generateMap(mapConfig);
    
    const npcs: [number, number, number][] = [];
    const trees: { position: [number, number, number], scale: number }[] = [];
    const deadTrees: { position: [number, number, number], scale: number }[] = [];
    const cacti: { position: [number, number, number], scale: number }[] = [];
    const crabs: { position: [number, number, number], rotation: number }[] = [];
    const fishes: { position: [number, number, number], rotation: number }[] = [];
    
    // Single port at center: mesh just needs to cover the archetype zone + some ocean margin
    const size = devSoloPort ? 1000 : Math.max(mapConfig.worldSize || 300, 600);
    // Scale segments with world size — keeps ~constant vertex density, caps at 512
    const segments = Math.min(512, Math.round(size * 0.43));
    const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
    const colors = new Float32Array(geometry.attributes.position.count * 3);
    
    const posAttribute = geometry.attributes.position;
    
    const isLand = new Uint8Array(posAttribute.count);
    for (let i = 0; i < posAttribute.count; i++) {
      const x = posAttribute.getX(i);
      const y_orig = posAttribute.getY(i); // Plane is created in XY
      const worldZ = -y_orig; // We rotate it -90 degrees on X later

      const { height, biome, color } = getTerrainData(x, worldZ);
      posAttribute.setZ(i, height);
      if (height > SEA_LEVEL - 2) isLand[i] = 1;
      
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
      } else if (biome === 'ocean' && height > -3 && height < SEA_LEVEL - 0.5) {
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
        npcs.push([x, SEA_LEVEL, worldZ]);
      }
    }
    
    // Smooth biome color transitions — only for land-adjacent vertices
    const stride = segments + 1;
    const smoothed = new Float32Array(colors.length);
    for (let iz = 0; iz < stride; iz++) {
      for (let ix = 0; ix < stride; ix++) {
        const idx = iz * stride + ix;
        // Skip deep ocean vertices — no visible color transitions
        if (!isLand[idx]) {
          smoothed[idx * 3] = colors[idx * 3];
          smoothed[idx * 3 + 1] = colors[idx * 3 + 1];
          smoothed[idx * 3 + 2] = colors[idx * 3 + 2];
          continue;
        }
        let r = 0, g = 0, b = 0, count = 0;
        for (let dz = -1; dz <= 1; dz++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = ix + dx, nz = iz + dz;
            if (nx >= 0 && nx < stride && nz >= 0 && nz < stride) {
              const ni = (nz * stride + nx) * 3;
              r += colors[ni]; g += colors[ni + 1]; b += colors[ni + 2];
              count++;
            }
          }
        }
        smoothed[idx * 3] = r / count;
        smoothed[idx * 3 + 1] = g / count;
        smoothed[idx * 3 + 2] = b / count;
      }
    }

    geometry.setAttribute('color', new THREE.BufferAttribute(smoothed, 3));
    const landGeometry = buildTerrainSurfaceGeometry(geometry, true, COASTLINE_CLIP_LEVEL);
    const seabedGeometry = buildTerrainSurfaceGeometry(geometry, false, COASTLINE_CLIP_LEVEL);
    geometry.dispose();
    
    return { 
      landTerrainGeometry: landGeometry,
      seabedTerrainGeometry: seabedGeometry,
      generatedPorts: portsData, 
      generatedNpcs: npcs,
      treeData: trees,
      deadTreeData: deadTrees,
      cactusData: cacti,
      crabData: crabs,
      fishData: fishes
    };
  }, [worldSeed, worldSize, devSoloPort]);

  // Sync module-level crab state for Player.tsx to read
  useEffect(() => {
    _crabData = crabData;
    _collectedCrabs = new Set();
  }, [crabData]);

  useEffect(() => {
    initWorld(generatedPorts);
    setNpcPositions(generatedNpcs);
    // Generate rich NPC ship identities
    const ships = generatedNpcs.map(pos => generateNPCShip(pos));
    setNpcShips(ships);
    // Spawn player in safe water near the first port
    const spawn = findSafeSpawn(generatedPorts);
    setPlayerPos(spawn);
    // Start pre-rendering the local map terrain in the background
    startTerrainPreRender();
  }, [generatedPorts, generatedNpcs, initWorld, setNpcPositions, setNpcShips, setPlayerPos]);

  // Calculate sun position and all time-of-day lighting parameters
  const { sunPosition, ambientColor, groundColor, ambientIntensity, sunColor, sunIntensity, moonPosition, moonIntensity, skyTurbidity, skyRayleigh } = useMemo(() => {
    const angle = ((timeOfDay - 6) / 24) * Math.PI * 2; // 6 AM is sunrise
    const sunH = Math.sin(angle); // -1 to 1, how high the sun is
    const horizonFactor = Math.exp(-sunH * sunH * 10); // peaks when sun is near horizon

    // Sun position — offset on Z axis for angled tropical light that creates terrain shadows
    const sunPos = new THREE.Vector3(
      Math.cos(angle) * 100,
      Math.sin(angle) * 100,
      -40 // south offset — sun comes from an angle, not directly overhead
    );

    // Hemisphere light — sky color (top) + ground bounce color (bottom)
    let ambInt: number, ambCol: THREE.Color, groundCol: THREE.Color;
    if (sunH > 0.35) {
      // Day — keep some sky coolness, but avoid washing the world in blue.
      ambInt = 0.22 + sunH * 0.16;
      ambCol = new THREE.Color(0.72, 0.79, 0.88);
      groundCol = new THREE.Color(0.35, 0.28, 0.2); // warm brown earth bounce
    } else if (sunH > -0.15) {
      const t = (sunH + 0.15) / 0.5;
      ambInt = 0.18 + t * 0.12;
      ambCol = new THREE.Color().lerpColors(
        new THREE.Color(0.15, 0.18, 0.38),
        new THREE.Color(0.95, 0.6, 0.35),
        t
      );
      groundCol = new THREE.Color().lerpColors(
        new THREE.Color(0.08, 0.06, 0.12),
        new THREE.Color(0.4, 0.25, 0.12),
        t
      );
    } else {
      ambInt = 0.2;
      ambCol = new THREE.Color(0.15, 0.18, 0.38);
      groundCol = new THREE.Color(0.06, 0.05, 0.1);
    }

    // Directional sun light — distinctly warm, stronger for shadow definition
    let sInt: number, sCol: THREE.Color;
    if (sunH > 0.35) {
      sInt = sunH * 2.5; // stronger direct light
      sCol = new THREE.Color(1.0, 0.94, 0.82); // warmer tropical sun
    } else if (sunH > -0.05) {
      const t = (sunH + 0.05) / 0.4;
      sInt = t * 1.0;
      sCol = new THREE.Color().lerpColors(
        new THREE.Color(1.0, 0.35, 0.08),
        new THREE.Color(1.0, 0.82, 0.6),
        t
      );
    } else {
      sInt = 0;
      sCol = new THREE.Color(0, 0, 0);
    }

    // Fill light — subtle opposite-side light to prevent pure black shadows
    // (handled as hemisphere-style via the ambient + moon)

    // Moonlight — opposite the sun, cool silver-blue
    const moonPos = new THREE.Vector3(-Math.cos(angle) * 80, Math.max(10, -Math.sin(angle) * 80), 30);
    const moonInt = sunH < 0.1 ? Math.max(0, Math.min(0.4, (0.1 - sunH) * 1.5)) : 0;

    // Sky — tropical haze: slightly higher Mie for sun halo, more turbidity at sunset
    const turbid = sunH > 0 ? 0.3 + horizonFactor * 8 : 0.5;
    const rayl = sunH > 0 ? 0.6 + horizonFactor * 2.5 : 0.3;

    return {
      sunPosition: sunPos,
      ambientColor: ambCol,
      groundColor: groundCol,
      ambientIntensity: ambInt,
      sunColor: sCol,
      sunIntensity: sInt,
      moonPosition: moonPos,
      moonIntensity: moonInt,
      skyTurbidity: turbid,
      skyRayleigh: rayl,
    };
  }, [timeOfDay]);

  // Instanced Meshes Setup
  const treeTrunkGeometry = useMemo(() => new THREE.CylinderGeometry(0.2, 0.3, 2, 5), []);
  const treeLeavesGeometry = useMemo(() => new THREE.ConeGeometry(1.5, 4, 5), []);
  const treeTrunkMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: '#4a3b32' }), []);
  const treeLeavesMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: '#2d4c1e' }), []);

  const deadTreeMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: '#3a3a3a' }), []);
  const cactusGeometry = useMemo(() => new THREE.CylinderGeometry(0.3, 0.3, 2, 6), []);
  const cactusMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: '#2E8B57' }), []);
  
  const crabGeometry = useMemo(() => {
    // Body — flat wide ellipsoid
    const body = new THREE.SphereGeometry(0.18, 8, 4);
    body.scale(1, 0.35, 0.8);
    // Left claw
    const clawL = new THREE.SphereGeometry(0.07, 5, 3);
    clawL.translate(-0.2, 0.02, -0.12);
    // Right claw
    const clawR = new THREE.SphereGeometry(0.07, 5, 3);
    clawR.translate(0.2, 0.02, -0.12);
    const merged = mergeGeometries([body, clawL, clawR]);
    body.dispose(); clawL.dispose(); clawR.dispose();
    return merged ?? new THREE.BoxGeometry(0.3, 0.1, 0.2);
  }, []);
  const crabMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: '#ff4444' }), []);
  
  const fishGeometry = useMemo(() => new THREE.ConeGeometry(0.1, 0.4, 4), []);
  const fishMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: '#44aaff' }), []);

  const sunLightRef = useRef<THREE.DirectionalLight>(null);
  const trunkMeshRef = useRef<THREE.InstancedMesh>(null);
  const leavesMeshRef = useRef<THREE.InstancedMesh>(null);
  const deadTreeMeshRef = useRef<THREE.InstancedMesh>(null);
  const cactusMeshRef = useRef<THREE.InstancedMesh>(null);
  const crabMeshRef = useRef<THREE.InstancedMesh>(null);
  const fishMeshRef = useRef<THREE.InstancedMesh>(null);
  const dummyRef = useRef(new THREE.Object3D());

  useEffect(() => {
    const dummy = dummyRef.current;
    
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

  // Stabilize shadow camera — snap target to texel grid to prevent shimmer
  useFrame(() => {
    const light = sunLightRef.current;
    if (!light || !light.shadow?.camera) return;
    const { playerPos } = useGameStore.getState();
    const cam = light.shadow.camera as THREE.OrthographicCamera;
    // Texel size = shadow frustum width / shadow map resolution
    const frustumWidth = cam.right - cam.left;
    const texelSize = frustumWidth / 2048;
    // Snap the light target (and thus the shadow camera center) to the texel grid
    const snappedX = Math.floor(playerPos[0] / texelSize) * texelSize;
    const snappedZ = Math.floor(playerPos[2] / texelSize) * texelSize;
    light.target.position.set(snappedX, 0, snappedZ);
    light.target.updateMatrixWorld();
  });

  // Animate fish and crabs slightly
  useFrame((state) => {
    if (!wildlifeMotionEnabled) return;
    const time = state.clock.elapsedTime;
    const dummy = dummyRef.current;
    
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
        if (_collectedCrabs.has(i)) {
          // Hide collected crabs by scaling to zero
          dummy.position.set(0, -100, 0);
          dummy.scale.set(0, 0, 0);
          dummy.updateMatrix();
          crabMeshRef.current!.setMatrixAt(i, dummy.matrix);
          return;
        }
        dummy.scale.set(1, 1, 1);
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
      <Sky sunPosition={sunPosition} turbidity={skyTurbidity} rayleigh={skyRayleigh} mieCoefficient={0.012} mieDirectionalG={0.85} />

      <hemisphereLight intensity={ambientIntensity} color={ambientColor} groundColor={groundColor} />
      <directionalLight
        ref={sunLightRef}
        position={sunPosition}
        intensity={sunIntensity}
        color={sunColor}
        castShadow={shadowsEnabled && sunIntensity > 0.05}
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
      >
        <orthographicCamera attach="shadow-camera" args={[-200, 200, 200, -200, 1, 500]} />
      </directionalLight>

      {/* Moonlight — cool silver-blue from opposite side */}
      <directionalLight
        position={moonPosition}
        intensity={moonIntensity}
        color={new THREE.Color(0.55, 0.65, 0.9)}
      />

      {/* Procedural Terrain */}
      <mesh geometry={seabedTerrainGeometry} rotation={[-Math.PI / 2, 0, 0]}>
        <meshStandardMaterial vertexColors roughness={0.9} />
      </mesh>
      <mesh
        geometry={landTerrainGeometry}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow={shadowsEnabled}
        castShadow={shadowsEnabled}
      >
        <meshStandardMaterial vertexColors roughness={0.8} />
      </mesh>

      {/* Instanced Flora & Fauna */}
      {treeData.length > 0 && (
        <>
          <instancedMesh ref={trunkMeshRef} args={[treeTrunkGeometry, treeTrunkMaterial, treeData.length]} castShadow={shadowsEnabled} receiveShadow={shadowsEnabled} />
          <instancedMesh ref={leavesMeshRef} args={[treeLeavesGeometry, treeLeavesMaterial, treeData.length]} castShadow={shadowsEnabled} receiveShadow={shadowsEnabled} />
        </>
      )}
      {deadTreeData.length > 0 && (
        <instancedMesh ref={deadTreeMeshRef} args={[treeTrunkGeometry, deadTreeMaterial, deadTreeData.length]} castShadow={shadowsEnabled} receiveShadow={shadowsEnabled} />
      )}
      {cactusData.length > 0 && (
        <instancedMesh ref={cactusMeshRef} args={[cactusGeometry, cactusMaterial, cactusData.length]} castShadow={shadowsEnabled} receiveShadow={shadowsEnabled} />
      )}
      {crabData.length > 0 && (
        <instancedMesh ref={crabMeshRef} args={[crabGeometry, crabMaterial, crabData.length]} castShadow={shadowsEnabled} receiveShadow={shadowsEnabled} />
      )}
      {fishData.length > 0 && (
        <instancedMesh ref={fishMeshRef} args={[fishGeometry, fishMaterial, fishData.length]} castShadow={shadowsEnabled} />
      )}

      {/* Ports */}
      <ProceduralCity />
      <PortIndicators />

      {/* NPC Ships */}
      {npcShips.map((ship) => (
        <NPCShip key={ship.id} identity={ship} initialPosition={ship.position} />
      ))}
    </group>
  );
}
