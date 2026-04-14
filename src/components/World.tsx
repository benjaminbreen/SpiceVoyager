import { useMemo, useEffect, useRef } from 'react';
import { useGameStore } from '../store/gameStore';
import * as THREE from 'three';
import { mergeVertices, mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Sky } from '@react-three/drei';
import { NPCShip } from './NPCShip';
import { getTerrainData, reseedTerrain, refreshTerrainPaletteCache, setMeshHalf } from '../utils/terrain';
import { useFrame } from '@react-three/fiber';
import { generateMap, focusedPortConfig, devModeConfig, findSafeSpawn } from '../utils/mapGenerator';
import { registerTerrainMapCanvas, terrainChartColor } from './WorldMap';
import { SEA_LEVEL } from '../constants/world';
import { getWaterPalette, resolveWaterPaletteId } from '../utils/waterPalettes';
import { resolveCampaignPortId } from '../utils/worldPorts';

import { ProceduralCity } from './ProceduralCity';
import { PortIndicators } from './PortIndicators';
import { BuildingTooltip } from './BuildingTooltip';
import { generateNPCShip } from '../utils/npcShipGenerator';
import { pickFishType, randomShoalSize, type FishType } from '../utils/fishTypes';
import { generateEncounter, type OceanEncounterDef } from '../utils/oceanEncounters';
import { OceanEncounter } from './OceanEncounter';
import { getLiveShipTransform } from '../utils/livePlayerTransform';

// ── Shared crab state (readable by Player.tsx for collection) ─────────────────
export type CrabEntry = { position: [number, number, number]; rotation: number };
let _crabData: CrabEntry[] = [];
let _collectedCrabs = new Set<number>();

export function getCrabData() { return _crabData; }
export function getCollectedCrabs() { return _collectedCrabs; }
export function collectCrabAt(index: number) { _collectedCrabs.add(index); }

// Module-level fish shoal data for shift-select overlay (synced from store)
import type { FishShoalEntry } from '../store/gameStore';
export type { FishShoalEntry };
let _fishShoalData: FishShoalEntry[] = [];
export function getFishShoalData() { return _fishShoalData; }

// Commodity list now imported from utils/commodities.ts
type PalmEntry = { position: [number, number, number], scale: number, lean: number, rotation: number };

const FISH_SWIM_DEPTH = 0.85;
const TURTLE_SWIM_DEPTH = 0.65;

// ── Edge fog overlay ──────────────────────────────────────────────────────────
// A massive flat plane that's transparent in the playable center and fades to
// fully opaque haze at map edges. Extends far beyond the mesh so the fog
// covers the horizon. Color adapts to time of day (bright haze → dark night).
const EDGE_FOG_VS = `
  varying vec2 vWorldXZ;
  void main() {
    vWorldXZ = (modelMatrix * vec4(position, 1.0)).xz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const EDGE_FOG_FS = `
  uniform float uHalfSize;
  uniform vec3 uFogColor;
  varying vec2 vWorldXZ;
  void main() {
    float edgeDist = max(abs(vWorldXZ.x), abs(vWorldXZ.y));
    float fogStart = uHalfSize * 0.88;
    float fogFull = uHalfSize * 1.0;
    float t = clamp((edgeDist - fogStart) / (fogFull - fogStart), 0.0, 1.0);
    float alpha = t * t * 0.92;
    gl_FragColor = vec4(uFogColor, alpha);
  }
`;

function EdgeFogPlane({ halfSize }: { halfSize: number }) {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const timeOfDay = useGameStore((s) => s.timeOfDay);

  // Update fog color each frame to match atmosphere
  useFrame(() => {
    if (!matRef.current) return;
    const angle = ((timeOfDay - 6) / 24) * Math.PI * 2;
    const sunH = Math.sin(angle);
    let r: number, g: number, b: number;
    if (sunH > 0.3) {
      // Day — light blue-gray haze
      r = 0.70; g = 0.76; b = 0.80;
    } else if (sunH > 0.0) {
      // Golden hour — warm mist
      const t = sunH / 0.3;
      r = 0.70 + (1 - t) * 0.12; g = 0.68 + t * 0.08; b = 0.65 + t * 0.15;
    } else if (sunH > -0.15) {
      // Dusk/dawn — muted blue
      const t = (sunH + 0.15) / 0.15;
      r = 0.25 + t * 0.57; g = 0.28 + t * 0.40; b = 0.38 + t * 0.27;
    } else {
      // Night — dark blue-gray
      r = 0.12; g = 0.15; b = 0.22;
    }
    matRef.current.uniforms.uFogColor.value.set(r, g, b);
  });

  // Plane is 5x mesh size so it extends well past the horizon
  const planeSize = halfSize * 5;

  return (
    <mesh position={[0, 12, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null} renderOrder={999}>
      <planeGeometry args={[planeSize, planeSize, 1, 1]} />
      <shaderMaterial
        ref={matRef}
        transparent
        depthWrite={false}
        uniforms={{
          uHalfSize: { value: halfSize },
          uFogColor: { value: new THREE.Vector3(0.70, 0.76, 0.80) },
        }}
        vertexShader={EDGE_FOG_VS}
        fragmentShader={EDGE_FOG_FS}
      />
    </mesh>
  );
}

// Clip land geometry at the water surface so no land triangles exist below
// the water plane — this eliminates z-fighting at the coastline.
const COASTLINE_CLIP_LEVEL = SEA_LEVEL - 0.05;

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
  const setOceanEncounters = useGameStore((state) => state.setOceanEncounters);
  const setFishShoals = useGameStore((state) => state.setFishShoals);
  const tickFishRespawn = useGameStore((state) => state.tickFishRespawn);
  const npcShips = useGameStore((state) => state.npcShips);
  const oceanEncounters = useGameStore((state) => state.oceanEncounters);
  const worldSeed = useGameStore((state) => state.worldSeed);
  const worldSize = useGameStore((state) => state.worldSize);
  const devSoloPort = useGameStore((state) => state.devSoloPort);
  const currentWorldPortId = useGameStore((state) => state.currentWorldPortId);
  const setPlayerPos = useGameStore((state) => state.setPlayerPos);
  const shadowsEnabled = useGameStore((state) => state.renderDebug.shadows);
  // Only cast shadows during solid daytime (~1h after sunrise to ~1h before sunset)
  // sunH > 0.13 ≈ hour 7 to hour 17
  const shadowsActive = shadowsEnabled && (() => {
    const angle = ((timeOfDay - 6) / 24) * Math.PI * 2;
    return Math.sin(angle) > 0.13;
  })();
  const wildlifeMotionEnabled = useGameStore((state) => state.renderDebug.wildlifeMotion);
  const waterPaletteId = useGameStore((state) => resolveWaterPaletteId(state));

  // Generate world data once
  const { 
    landTerrainGeometry, generatedPorts, generatedNpcs, terrainMapCanvas, terrainMapWorldHalf,
    treeData, deadTreeData, cactusData, crabData, palmData, thornbushData, riceShootData, driftwoodData, beachRockData, coralData, fishData, turtleData, fishShoalData, gullData, encounterData,
  } = useMemo(() => {
    // Reseed terrain noise before generating
    reseedTerrain(worldSeed);
    refreshTerrainPaletteCache();
    // Generate ports — use dev mode config if a solo port is selected
    const mapConfig = devSoloPort
      ? devModeConfig(devSoloPort, worldSeed)
      : focusedPortConfig(
          resolveCampaignPortId({ worldSeed, devSoloPort, currentWorldPortId }),
          worldSeed,
          worldSize
        );
    const portsData = generateMap(mapConfig);
    
    const npcs: [number, number, number][] = [];
    const trees: { position: [number, number, number], scale: number }[] = [];
    const deadTrees: { position: [number, number, number], scale: number }[] = [];
    const cacti: { position: [number, number, number], scale: number }[] = [];
    const crabs: { position: [number, number, number], rotation: number }[] = [];
    const palms: PalmEntry[] = [];
    const thornbushes: { position: [number, number, number], scale: number, rotation: number }[] = [];
    const riceShoots: { position: [number, number, number], scale: number, rotation: number }[] = [];
    const driftwood: { position: [number, number, number], scale: number, rotation: number }[] = [];
    const beachRocks: { position: [number, number, number], scale: number, rotation: number }[] = [];
    const corals: { position: [number, number, number], scale: number, rotation: number, type: number }[] = [];
    const fishes: { position: [number, number, number], rotation: number, scale: number, color: [number, number, number], shoalIdx: number }[] = [];
    const turtles: { position: [number, number, number], rotation: number, scale: number, color: [number, number, number], shoalIdx: number }[] = [];
    const fishShoals: { center: [number, number, number], fishType: FishType, startIdx: number, count: number, maxCount: number, lastFished: number, scattered: boolean }[] = [];
    const gulls: { position: [number, number, number], phase: number, radius: number }[] = [];
    const encounters: OceanEncounterDef[] = [];
    
    // Single port at center: mesh covers the archetype zone + generous ocean margin
    const size = devSoloPort ? 1000 : 900;
    // Register mesh extent so terrain queries beyond the boundary fade to ocean
    setMeshHalf(size / 2);
    // Scale segments with world size — keeps ~constant vertex density, caps at 512
    const segments = Math.min(512, Math.round(size * 0.43));
    const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
    const colors = new Float32Array(geometry.attributes.position.count * 3);
    const mapResolution = segments + 1;
    const mapPalette = getWaterPalette(waterPaletteId);
    const mapImageData = new ImageData(mapResolution, mapResolution);
    
    const posAttribute = geometry.attributes.position;
    
    const isLand = new Uint8Array(posAttribute.count);
    for (let i = 0; i < posAttribute.count; i++) {
      const x = posAttribute.getX(i);
      const y_orig = posAttribute.getY(i); // Plane is created in XY
      const worldZ = -y_orig; // We rotate it -90 degrees on X later

      const terrain = getTerrainData(x, worldZ);
      const { height, biome, color, moisture, reefFactor, paddyFlooded, coastSteepness, shallowFactor } = terrain;
      posAttribute.setZ(i, height);
      if (height > SEA_LEVEL - 2) isLand[i] = 1;

      const [mapR, mapG, mapB] = terrainChartColor(terrain, mapPalette);
      const mapIdx = i * 4;
      mapImageData.data[mapIdx] = mapR * 255;
      mapImageData.data[mapIdx + 1] = mapG * 255;
      mapImageData.data[mapIdx + 2] = mapB * 255;
      mapImageData.data[mapIdx + 3] = 255;

      colors[i * 3] = color[0];
      colors[i * 3 + 1] = color[1];
      colors[i * 3 + 2] = color[2];
      
      // Flora & Fauna placement
      const rand = Math.random();
      
      if (biome === 'forest' || biome === 'jungle') {
        // In tropical/monsoon lowlands, palms replace most cone trees
        const isTropicalLow = moisture > 0.45 && height < 8;
        if (isTropicalLow) {
          // Palms dominate — dense in jungle, moderate in forest
          if (rand > (biome === 'jungle' ? 0.88 : 0.95) && palms.length < 500) {
            palms.push({
              position: [x, height, worldZ],
              scale: 0.7 + Math.random() * 1.0,
              lean: 0.03 + Math.random() * 0.15,
              rotation: Math.random() * Math.PI * 2,
            });
          }
          // Sparse cone trees still appear — not every tropical tree is a palm
          if (rand > 0.98) {
            trees.push({ position: [x, height, worldZ], scale: 0.5 + Math.random() * 1.2 });
          }
        } else {
          // Highland or drier zones — standard cone trees
          if (rand > (biome === 'jungle' ? 0.9 : 0.98)) {
            trees.push({ position: [x, height, worldZ], scale: 0.5 + Math.random() * 1.5 });
          }
        }
      } else if (biome === 'swamp') {
        if (rand > 0.97) {
          deadTrees.push({ position: [x, height, worldZ], scale: 0.5 + Math.random() * 1.0 });
        }
      } else if (biome === 'desert' || biome === 'arroyo') {
        if (rand > 0.99) {
          cacti.push({ position: [x, height, worldZ], scale: 0.5 + Math.random() * 1.0 });
        }
      } else if (biome === 'scrubland') {
        if (rand > 0.96 && thornbushes.length < 400) {
          thornbushes.push({
            position: [x, height, worldZ],
            scale: 0.4 + Math.random() * 0.8,
            rotation: Math.random() * Math.PI * 2,
          });
        }
        // Occasional cactus in scrubland too
        if (rand > 0.998) {
          cacti.push({ position: [x, height, worldZ], scale: 0.3 + Math.random() * 0.6 });
        }
      } else if (biome === 'paddy') {
        // Dense rice shoots on non-flooded bund areas only
        if (!paddyFlooded && rand > 0.88 && riceShoots.length < 600) {
          riceShoots.push({
            position: [x, height + 0.05, worldZ],
            scale: 0.5 + Math.random() * 0.5,
            rotation: Math.random() * Math.PI * 2,
          });
        }
      } else if (biome === 'beach') {
        // Palm trees on tropical/monsoon beaches
        if (moisture > 0.35 && rand > 0.94 && palms.length < 500) {
          palms.push({
            position: [x, height, worldZ],
            scale: 0.7 + Math.random() * 0.8,
            lean: 0.1 + Math.random() * 0.25,
            rotation: Math.random() * Math.PI * 2,
          });
        }
        // Food score: higher near shallow water, sheltered coasts, river mouths
        // coastSteepness < 0.4 = sheltered/flat = more food; shallow nearby = tidal zone
        const shelterBonus = coastSteepness < 0.4 ? 0.06 : 0;
        const shallowBonus = shallowFactor > 0.3 ? 0.04 : 0;
        const moistureBonus = moisture > 0.5 ? 0.03 : 0;
        const foodScore = 0.02 + shelterBonus + shallowBonus + moistureBonus; // 0.02–0.15
        if (rand < foodScore) {
          crabs.push({ position: [x, height, worldZ], rotation: Math.random() * Math.PI * 2 });
        }
        // Beach debris — driftwood and rocks scattered along the shore
        const rand2 = Math.random();
        if (rand2 > 0.97 && driftwood.length < 200) {
          driftwood.push({
            position: [x, height + 0.05, worldZ],
            scale: 0.15 + Math.random() * 0.25,
            rotation: Math.random() * Math.PI * 2,
          });
        }
        if (rand2 > 0.95 && coastSteepness > 0.3 && beachRocks.length < 250) {
          beachRocks.push({
            position: [x, height + 0.1, worldZ],
            scale: 0.2 + Math.random() * 0.4,
            rotation: Math.random() * Math.PI * 2,
          });
        }
        // Seagulls — loosely correlated with food-rich areas, not exact
        // Spawn above the beach with jitter so they don't pinpoint crabs
        if (rand < foodScore * 0.4 && gulls.length < 80) {
          gulls.push({
            position: [
              x + (Math.random() - 0.5) * 15,
              height + 8 + Math.random() * 12,
              worldZ + (Math.random() - 0.5) * 15,
            ],
            phase: Math.random() * Math.PI * 2,
            radius: 3 + Math.random() * 8,
          });
        }
      } else if (biome === 'ocean' && height < SEA_LEVEL - 0.3) {
        // Coral reef 3D instances — in reef zones, capped for performance
        if (reefFactor > 0.15 && rand > 0.96 && corals.length < 400) {
          corals.push({
            position: [x, height + 0.1, worldZ],
            scale: 0.3 + Math.random() * 0.7,
            rotation: Math.random() * Math.PI * 2,
            type: Math.floor(Math.random() * 3), // 0=brain, 1=staghorn, 2=fan
          });
        }
        // Fish shoals — very rare, submerged but close enough to read through the water.
        if (rand > 0.9998) {
          const ft = pickFishType(moisture);
          const count = randomShoalSize(ft);
          const isTurtle = ft.id.includes('turtle');
          const targetArr = isTurtle ? turtles : fishes;
          const startIdx = targetArr.length;
          const spread = ft.scale > 2 ? 1.5 : 3 + count * 0.3; // sharks stay tight, shoals spread
          const swimDepth = isTurtle ? TURTLE_SWIM_DEPTH : FISH_SWIM_DEPTH;
          for (let f = 0; f < count; f++) {
            targetArr.push({
              position: [
                x + (Math.random() - 0.5) * spread,
                SEA_LEVEL - swimDepth - Math.random() * 0.25,
                worldZ + (Math.random() - 0.5) * spread,
              ],
              rotation: Math.random() * Math.PI * 2,
              scale: ft.scale,
              color: ft.color,
              shoalIdx: fishShoals.length,
            });
          }
          fishShoals.push({ center: [x, SEA_LEVEL, worldZ], fishType: ft, startIdx, count, maxCount: count, lastFished: 0, scattered: false });
        }
      }

      // Spawn NPCs in deep water
      if (height < -10 && rand > 0.9995 && npcs.length < 20) {
        npcs.push([x, SEA_LEVEL, worldZ]);
      }
      // Rare ocean encounters — whales, turtles, wreckage
      if (height < -5 && rand > 0.99997 && encounters.length < 5) {
        encounters.push(generateEncounter([x, SEA_LEVEL, worldZ]));
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
    geometry.dispose();
    const terrainCanvas = document.createElement('canvas');
    terrainCanvas.width = mapResolution;
    terrainCanvas.height = mapResolution;
    terrainCanvas.getContext('2d')!.putImageData(mapImageData, 0, 0);

    return {
      landTerrainGeometry: landGeometry,
      terrainMapCanvas: terrainCanvas,
      terrainMapWorldHalf: size / 2,
      generatedPorts: portsData, 
      generatedNpcs: npcs,
      treeData: trees,
      deadTreeData: deadTrees,
      cactusData: cacti,
      crabData: crabs,
      palmData: palms,
      thornbushData: thornbushes,
      riceShootData: riceShoots,
      driftwoodData: driftwood,
      beachRockData: beachRocks,
      coralData: corals,
      fishData: fishes,
      turtleData: turtles,
      fishShoalData: fishShoals,
      gullData: gulls,
      encounterData: encounters,
    };
  }, [currentWorldPortId, waterPaletteId, worldSeed, worldSize, devSoloPort]);

  // Sync module-level crab/fish state for Player.tsx and ShiftSelectOverlay
  useEffect(() => {
    _crabData = crabData;
    _collectedCrabs = new Set();
    _fishShoalData = fishShoalData;
  }, [crabData, fishShoalData]);

  useEffect(() => {
    initWorld(generatedPorts);
    setNpcPositions(generatedNpcs);
    // Generate rich NPC ship identities
    const ships = generatedNpcs.map(pos => generateNPCShip(pos));
    setNpcShips(ships);
    setOceanEncounters(encounterData);
    setFishShoals(fishShoalData);
    // Spawn player in safe water near the first port
    const spawn = findSafeSpawn(generatedPorts);
    setPlayerPos(spawn);
    // Reuse the terrain pass for the navigation chart instead of sampling terrain again later.
    registerTerrainMapCanvas(terrainMapCanvas, waterPaletteId, terrainMapWorldHalf);
  }, [generatedPorts, generatedNpcs, encounterData, fishShoalData, initWorld, setNpcPositions, setNpcShips, setOceanEncounters, setFishShoals, setPlayerPos, terrainMapCanvas, terrainMapWorldHalf, waterPaletteId]);

  // Calculate sun position and all time-of-day lighting parameters
  const { sunPosition, ambientColor, groundColor, ambientIntensity, sunColor, sunIntensity, moonPosition, moonIntensity, skyTurbidity, skyRayleigh } = useMemo(() => {
    const angle = ((timeOfDay - 6) / 24) * Math.PI * 2; // 6 AM is sunrise
    const sunH = Math.sin(angle); // -1 to 1, how high the sun is
    const horizonFactor = Math.exp(-sunH * sunH * 10); // peaks when sun is near horizon

    // Tropical sun path — arcs from east, very high overhead at midday, to west.
    // Height uses a flattened curve so the sun stays near-overhead for hours (short shadows).
    // Z varies sinusoidally so shadows rotate through the day like a real sundial.
    const clampedSunH = Math.max(0, sunH);
    const tropicalHeight = Math.pow(clampedSunH, 0.55) * 100; // flattened peak: stays high longer
    const sunPos = new THREE.Vector3(
      Math.cos(angle) * 100,                    // east-west arc
      tropicalHeight,                            // height: nearly overhead for wide midday window
      -Math.sin(angle) * 15                      // north-south: shadows rotate through the day
    );

    // Hemisphere light — sky color (top) + ground bounce color (bottom)
    // Strong blue ambient fills shadows with realistic sky-bounce light
    let ambInt: number, ambCol: THREE.Color, groundCol: THREE.Color;
    if (sunH > 0.35) {
      ambInt = 0.35 + sunH * 0.15;
      ambCol = new THREE.Color(0.58, 0.68, 0.92); // blue sky fill — tints shadows blue
      groundCol = new THREE.Color(0.32, 0.26, 0.18); // warm brown earth bounce
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

    // Directional sun light — warm but not overpowering; ambient fills the shadows
    let sInt: number, sCol: THREE.Color;
    if (sunH > 0.35) {
      sInt = sunH * 1.8; // softer direct light — less harsh shadow contrast
      sCol = new THREE.Color(1.0, 0.95, 0.85); // warm tropical sun
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

  // ── Terrain material with procedural detail noise ──────────────────────────
  const terrainMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true });
    mat.onBeforeCompile = (shader) => {
      // Pass world-position varying from vertex to fragment shader
      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        `#include <common>
        varying vec3 vWorldPos;`
      );
      shader.vertexShader = shader.vertexShader.replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
        vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;`
      );

      // Inject noise functions and detail modulation into fragment shader
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>
        varying vec3 vWorldPos;

        // Hash-based noise — fast, no texture lookups
        float terrainHash(vec2 p) {
          vec3 p3 = fract(vec3(p.xyx) * 0.1031);
          p3 += dot(p3, p3.yzx + 33.33);
          return fract((p3.x + p3.y) * p3.z);
        }

        float terrainNoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f); // smoothstep
          float a = terrainHash(i);
          float b = terrainHash(i + vec2(1.0, 0.0));
          float c = terrainHash(i + vec2(0.0, 1.0));
          float d = terrainHash(i + vec2(1.0, 1.0));
          return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }

        float terrainFBM(vec2 p) {
          float v = 0.0;
          v += terrainNoise(p) * 0.5;
          v += terrainNoise(p * 2.13) * 0.25;
          v += terrainNoise(p * 4.37) * 0.125;
          return v;
        }
        `
      );

      // Modulate diffuseColor after vertex color is applied
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          vec2 wp = vWorldPos.xz;

          // Medium-frequency terrain grain — visible at play distance
          float grain = terrainFBM(wp * 0.35) * 2.0 - 0.875;

          // Fine stipple — subtle close-up detail
          float stipple = terrainNoise(wp * 1.8) * 2.0 - 1.0;

          // Very coarse variation — large-scale color drift
          float broad = terrainNoise(wp * 0.06) * 2.0 - 1.0;

          // Luminance of the vertex color — darks get less noise to avoid washing out
          float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
          float noiseMask = smoothstep(0.08, 0.35, lum);

          // Composite: medium grain dominates, fine stipple adds crunch, broad adds variety
          float detail = grain * 0.07 + stipple * 0.03 + broad * 0.04;
          diffuseColor.rgb += detail * noiseMask;

          // Slight warm/cool color shift — breaks monochrome feel in large biomes
          float colorShift = terrainNoise(wp * 0.12 + 77.7) - 0.5;
          diffuseColor.r += colorShift * 0.018 * noiseMask;
          diffuseColor.b -= colorShift * 0.012 * noiseMask;
        }
        `
      );

      // Perturb normals for micro-relief — makes lighting catch bumps
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        {
          vec2 wp = vWorldPos.xz;
          float eps = 0.5;
          float hC = terrainFBM(wp * 0.35);
          float hR = terrainFBM((wp + vec2(eps, 0.0)) * 0.35);
          float hU = terrainFBM((wp + vec2(0.0, eps)) * 0.35);
          // Bump strength — subtle enough to not create visible facets
          float bumpScale = 0.12;
          vec3 bump = normalize(vec3(
            (hC - hR) * bumpScale,
            (hC - hU) * bumpScale,
            1.0
          ));
          // Blend bump with existing normal (in tangent space)
          normal = normalize(normal + bump.x * vec3(1,0,0) + bump.y * vec3(0,1,0));
        }
        `
      );
    };
    return mat;
  }, []);

  // Instanced Meshes Setup
  const treeTrunkGeometry = useMemo(() => new THREE.CylinderGeometry(0.2, 0.3, 2, 5), []);
  const treeLeavesGeometry = useMemo(() => new THREE.ConeGeometry(1.5, 4, 5), []);
  const treeTrunkMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: '#4a3b32' }), []);
  const treeLeavesMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: '#2d4c1e' }), []);

  const deadTreeMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: '#3a3a3a' }), []);

  // Palm tree — curved trunk + radiating fronds
  // Geometry is shifted so base is at y=0, top at y=4. Built-in curve bakes into vertices.
  const palmTrunkGeometry = useMemo(() => {
    const geo = new THREE.CylinderGeometry(0.08, 0.14, 4, 5, 8);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      // Shift up so base is at y=0 (geometry goes from 0 to 4)
      const shifted = y + 2;
      pos.setY(i, shifted);
      // Bend trunk: quadratic lean along X, proportional to height
      const t = shifted / 4; // 0 at base, 1 at top
      pos.setX(i, pos.getX(i) + t * t * 0.6);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    return geo;
  }, []);
  const palmTrunkMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: '#6b5a3e' }), []);

  const palmFrondGeometry = useMemo(() => {
    // 6 fronds radiating from center, drooping outward
    const fronds: THREE.BufferGeometry[] = [];
    for (let f = 0; f < 6; f++) {
      const angle = (f / 6) * Math.PI * 2 + (f % 2) * 0.15;
      const frond = new THREE.PlaneGeometry(0.35, 2.2, 1, 4);
      // Droop the frond: curve vertices downward toward tip
      const fPos = frond.attributes.position;
      for (let i = 0; i < fPos.count; i++) {
        const fy = fPos.getY(i);
        const t = (fy + 1.1) / 2.2; // 0 at base, 1 at tip
        fPos.setZ(i, -t * t * 1.0); // droop downward
      }
      fPos.needsUpdate = true;
      frond.rotateX(-0.3); // tilt outward
      frond.rotateY(angle);
      frond.translate(
        Math.sin(angle) * 0.4,
        0,
        Math.cos(angle) * 0.4
      );
      fronds.push(frond);
    }
    const merged = mergeGeometries(fronds);
    fronds.forEach(f => f.dispose());
    return merged ?? new THREE.SphereGeometry(1, 4, 4);
  }, []);
  const palmFrondMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#2a6e1e',
    side: THREE.DoubleSide,
  }), []);
  const cactusGeometry = useMemo(() => new THREE.CylinderGeometry(0.3, 0.3, 2, 6), []);
  const cactusMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: '#2E8B57' }), []);

  // Thornbush — low, wide, spiky cluster for scrubland
  const thornbushGeometry = useMemo(() => {
    const bush = new THREE.IcosahedronGeometry(0.45, 0);
    bush.scale(1.2, 0.55, 1.0); // wide and low
    const thorn1 = new THREE.ConeGeometry(0.035, 0.5, 3);
    thorn1.rotateZ(0.8); thorn1.translate(0.38, 0.18, 0.1);
    const thorn2 = new THREE.ConeGeometry(0.035, 0.45, 3);
    thorn2.rotateZ(-0.6); thorn2.rotateY(1.2); thorn2.translate(-0.28, 0.12, 0.22);
    const thorn3 = new THREE.ConeGeometry(0.03, 0.4, 3);
    thorn3.rotateX(0.7); thorn3.translate(0.1, 0.22, -0.3);
    const merged = mergeGeometries([bush, thorn1, thorn2, thorn3]);
    bush.dispose(); thorn1.dispose(); thorn2.dispose(); thorn3.dispose();
    return merged ?? new THREE.IcosahedronGeometry(0.4, 0);
  }, []);
  const thornbushMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#6b7a4a', roughness: 0.9,
  }), []);

  // Driftwood — small weathered log
  const driftwoodGeometry = useMemo(() => {
    const log = new THREE.CylinderGeometry(0.06, 0.08, 1.2, 4);
    log.rotateZ(Math.PI / 2); // lay flat
    // Slight bend
    const pos = log.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const px = pos.getX(i);
      pos.setY(i, pos.getY(i) + px * px * 0.15);
    }
    pos.needsUpdate = true;
    return log;
  }, []);
  const driftwoodMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#8a7560', roughness: 0.95,
  }), []);

  // Beach rocks — flattened irregular stones
  const beachRockGeometry = useMemo(() => {
    const geo = new THREE.IcosahedronGeometry(0.3, 0);
    geo.scale(1.0, 0.45, 0.8); // flat and wide
    return geo;
  }, []);
  const beachRockMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#6e6860', roughness: 0.85,
  }), []);

  // Rice shoots — thin stalk + two tiny leaf planes for paddy fields
  const riceShootGeometry = useMemo(() => {
    const stalk = new THREE.CylinderGeometry(0.015, 0.02, 0.55, 3);
    const leaf1 = new THREE.PlaneGeometry(0.14, 0.035);
    leaf1.rotateZ(0.3); leaf1.translate(0.06, 0.12, 0);
    const leaf2 = new THREE.PlaneGeometry(0.11, 0.035);
    leaf2.rotateZ(-0.4); leaf2.rotateY(Math.PI * 0.6); leaf2.translate(-0.04, 0.03, 0.03);
    const merged = mergeGeometries([stalk, leaf1, leaf2]);
    stalk.dispose(); leaf1.dispose(); leaf2.dispose();
    return merged ?? new THREE.CylinderGeometry(0.02, 0.02, 0.5, 3);
  }, []);
  const riceShootMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#5a8c2a', side: THREE.DoubleSide,
  }), []);
  
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
  
  // Fish — tapered body + forked tail + dorsal fin (reads as fish even at distance)
  const fishGeometry = useMemo(() => {
    // Tapered body — wider head, narrow tail
    const body = new THREE.CylinderGeometry(0.06, 0.16, 0.5, 5);
    body.rotateZ(Math.PI / 2); // orient along X axis
    // Forked tail — two small angled planes
    const tailL = new THREE.PlaneGeometry(0.14, 0.08);
    tailL.rotateY(Math.PI / 2);
    tailL.rotateX(0.35);
    tailL.translate(-0.32, 0.03, 0);
    const tailR = new THREE.PlaneGeometry(0.14, 0.08);
    tailR.rotateY(Math.PI / 2);
    tailR.rotateX(-0.35);
    tailR.translate(-0.32, -0.03, 0);
    // Dorsal fin — thin triangle on top
    const dorsal = new THREE.ConeGeometry(0.03, 0.1, 3);
    dorsal.translate(0.04, 0.13, 0);
    // Pectoral fin — small plane breaking the silhouette
    const pect = new THREE.PlaneGeometry(0.08, 0.05);
    pect.rotateX(-0.5);
    pect.translate(0.08, -0.04, 0.07);
    const merged = mergeGeometries([body, tailL, tailR, dorsal, pect]);
    [body, tailL, tailR, dorsal, pect].forEach(g => g.dispose());
    return merged ?? new THREE.CylinderGeometry(0.1, 0.1, 0.4, 5);
  }, []);
  const fishMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#ffffff', // base white — per-instance color tints this
    metalness: 0.3,
    roughness: 0.4,
    side: THREE.DoubleSide, // fins/tail are thin planes
  }), []);

  // Sea turtle — flattened shell + head + four paddle flippers
  const turtleGeometry = useMemo(() => {
    // Shell — flattened sphere
    const shell = new THREE.SphereGeometry(0.25, 6, 4);
    shell.scale(1.3, 0.35, 1.0);
    // Head — small sphere poking forward
    const head = new THREE.SphereGeometry(0.07, 5, 3);
    head.translate(-0.3, 0.02, 0);
    // Front flippers — elongated planes angled out
    const fl = new THREE.PlaneGeometry(0.22, 0.08);
    fl.rotateX(-0.25);
    fl.translate(-0.08, -0.03, 0.2);
    const fr = new THREE.PlaneGeometry(0.22, 0.08);
    fr.rotateX(0.25);
    fr.translate(-0.08, -0.03, -0.2);
    // Rear flippers — smaller
    const bl = new THREE.PlaneGeometry(0.12, 0.06);
    bl.translate(0.2, -0.02, 0.14);
    const br = new THREE.PlaneGeometry(0.12, 0.06);
    br.translate(0.2, -0.02, -0.14);
    const merged = mergeGeometries([shell, head, fl, fr, bl, br]);
    [shell, head, fl, fr, bl, br].forEach(g => g.dispose());
    return merged ?? new THREE.SphereGeometry(0.2, 6, 4);
  }, []);
  const turtleMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#ffffff', // per-instance color tints
    metalness: 0.1,
    roughness: 0.7,
    side: THREE.DoubleSide,
  }), []);

  // Coral reef geometry — 3 types, all low-poly for instancing
  const coralReefEnabled = useGameStore((state) => state.renderDebug.coralReefs);

  const brainCoralGeo = useMemo(() => {
    const geo = new THREE.SphereGeometry(0.5, 6, 4);
    geo.scale(1, 0.55, 1); // flattened dome
    return geo;
  }, []);
  const brainCoralMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#c46478', roughness: 0.8, metalness: 0.0,
  }), []);

  const stagCoralGeo = useMemo(() => {
    const branch1 = new THREE.CylinderGeometry(0.04, 0.07, 0.7, 4);
    const branch2 = new THREE.CylinderGeometry(0.04, 0.06, 0.55, 4);
    branch2.rotateZ(0.5); branch2.translate(0.15, 0.1, 0.05);
    const branch3 = new THREE.CylinderGeometry(0.03, 0.06, 0.5, 4);
    branch3.rotateZ(-0.4); branch3.translate(-0.12, 0.05, -0.08);
    const branch4 = new THREE.CylinderGeometry(0.03, 0.05, 0.45, 4);
    branch4.rotateX(0.4); branch4.translate(0.05, 0.08, 0.14);
    const merged = mergeGeometries([branch1, branch2, branch3, branch4]);
    branch1.dispose(); branch2.dispose(); branch3.dispose(); branch4.dispose();
    return merged ?? new THREE.CylinderGeometry(0.05, 0.08, 0.7, 4);
  }, []);
  const stagCoralMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#d8854a', roughness: 0.7, metalness: 0.0,
  }), []);

  const fanCoralGeo = useMemo(() => {
    const geo = new THREE.PlaneGeometry(0.7, 0.9, 3, 3);
    // Warp vertices slightly for organic look
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      pos.setZ(i, (Math.random() - 0.5) * 0.08);
    }
    return geo;
  }, []);
  const fanCoralMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#7b52a0', roughness: 0.6, metalness: 0.0, side: THREE.DoubleSide,
  }), []);

  // Seagull — simple bird shape: body + two angled wings
  const gullGeometry = useMemo(() => {
    const body = new THREE.ConeGeometry(0.08, 0.5, 4);
    body.rotateX(Math.PI / 2);
    const wingL = new THREE.PlaneGeometry(0.7, 0.12);
    wingL.translate(-0.35, 0, 0);
    wingL.rotateZ(0.15); // slight upward angle
    const wingR = new THREE.PlaneGeometry(0.7, 0.12);
    wingR.translate(0.35, 0, 0);
    wingR.rotateZ(-0.15);
    const merged = mergeGeometries([body, wingL, wingR]);
    body.dispose(); wingL.dispose(); wingR.dispose();
    return merged ?? new THREE.ConeGeometry(0.1, 0.4, 4);
  }, []);
  const gullMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#e8e0d0',
    side: THREE.DoubleSide,
  }), []);

  const sunLightRef = useRef<THREE.DirectionalLight>(null);
  const trunkMeshRef = useRef<THREE.InstancedMesh>(null);
  const leavesMeshRef = useRef<THREE.InstancedMesh>(null);
  const deadTreeMeshRef = useRef<THREE.InstancedMesh>(null);
  const palmTrunkMeshRef = useRef<THREE.InstancedMesh>(null);
  const palmFrondMeshRef = useRef<THREE.InstancedMesh>(null);
  const cactusMeshRef = useRef<THREE.InstancedMesh>(null);
  const thornbushMeshRef = useRef<THREE.InstancedMesh>(null);
  const riceShootMeshRef = useRef<THREE.InstancedMesh>(null);
  const driftwoodMeshRef = useRef<THREE.InstancedMesh>(null);
  const beachRockMeshRef = useRef<THREE.InstancedMesh>(null);
  const crabMeshRef = useRef<THREE.InstancedMesh>(null);
  const fishMeshRef = useRef<THREE.InstancedMesh>(null);
  const turtleMeshRef = useRef<THREE.InstancedMesh>(null);
  const coralBrainRef = useRef<THREE.InstancedMesh>(null);
  const coralStagRef = useRef<THREE.InstancedMesh>(null);
  const coralFanRef = useRef<THREE.InstancedMesh>(null);
  const gullMeshRef = useRef<THREE.InstancedMesh>(null);
  const dummyRef = useRef(new THREE.Object3D());
  const palmTopLocalRef = useRef(new THREE.Vector3());
  const palmEulerRef = useRef(new THREE.Euler());
  const palmWindVectorRef = useRef(new THREE.Vector2());
  const palmAnimatedIndicesRef = useRef(new Set<number>());
  const palmSwayAccum = useRef(0);
  const respawnCheckAccum = useRef(0);

  function setPalmMatrixAt(
    palm: PalmEntry,
    index: number,
    trunkPitchOffset = 0,
    trunkRollOffset = 0,
    frondPitchOffset = 0,
    frondRollOffset = 0
  ) {
    if (!palmTrunkMeshRef.current || !palmFrondMeshRef.current) return;
    const dummy = dummyRef.current;
    const topLocal = palmTopLocalRef.current;
    const palmEuler = palmEulerRef.current;
    const s = palm.scale;
    const bx = palm.position[0], by = palm.position[1], bz = palm.position[2];
    const trunkPitch = palm.lean + trunkPitchOffset;

    // Trunk: geometry base is already at y=0, top at y=4.
    // Position at ground level, rotate for lean (pivots around base since geo starts at y=0).
    dummy.position.set(bx, by, bz);
    dummy.scale.set(s, s, s);
    dummy.rotation.set(trunkPitch, palm.rotation, trunkRollOffset);
    dummy.updateMatrix();
    palmTrunkMeshRef.current.setMatrixAt(index, dummy.matrix);

    // Fronds: trunk top in local space is ~(0.6, 4, 0) due to the baked-in bend.
    // Transform that point by the same rotation+scale to find world position.
    topLocal.set(0.6 * s, 4 * s, 0);
    palmEuler.set(trunkPitch, palm.rotation, trunkRollOffset);
    topLocal.applyEuler(palmEuler);
    dummy.position.set(bx + topLocal.x, by + topLocal.y, bz + topLocal.z);
    dummy.scale.set(s, s, s);
    dummy.rotation.set(palm.lean * 0.3 + frondPitchOffset, palm.rotation, frondRollOffset);
    dummy.updateMatrix();
    palmFrondMeshRef.current.setMatrixAt(index, dummy.matrix);
  }

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

    // Palm trees — trunk and fronds as separate instanced meshes (like regular trees)
    if (palmTrunkMeshRef.current && palmFrondMeshRef.current) {
      palmData.forEach((palm, i) => {
        setPalmMatrixAt(palm, i);
      });
      palmTrunkMeshRef.current.instanceMatrix.needsUpdate = true;
      palmFrondMeshRef.current.instanceMatrix.needsUpdate = true;
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

    if (thornbushMeshRef.current) {
      thornbushData.forEach((bush, i) => {
        dummy.position.set(bush.position[0], bush.position[1] + 0.2 * bush.scale, bush.position[2]);
        dummy.scale.set(bush.scale, bush.scale, bush.scale);
        dummy.rotation.set(0, bush.rotation, 0);
        dummy.updateMatrix();
        thornbushMeshRef.current!.setMatrixAt(i, dummy.matrix);
      });
      thornbushMeshRef.current.instanceMatrix.needsUpdate = true;
    }

    if (riceShootMeshRef.current) {
      riceShootData.forEach((shoot, i) => {
        dummy.position.set(shoot.position[0], shoot.position[1] + 0.25 * shoot.scale, shoot.position[2]);
        dummy.scale.set(shoot.scale, shoot.scale * (0.8 + Math.random() * 0.4), shoot.scale);
        dummy.rotation.set(0, shoot.rotation, 0);
        dummy.updateMatrix();
        riceShootMeshRef.current!.setMatrixAt(i, dummy.matrix);
      });
      riceShootMeshRef.current.instanceMatrix.needsUpdate = true;
    }

    if (driftwoodMeshRef.current) {
      driftwoodData.forEach((dw, i) => {
        dummy.position.set(dw.position[0], dw.position[1], dw.position[2]);
        dummy.scale.set(dw.scale, dw.scale, dw.scale);
        dummy.rotation.set(0, dw.rotation, Math.random() * 0.2 - 0.1); // slight tilt
        dummy.updateMatrix();
        driftwoodMeshRef.current!.setMatrixAt(i, dummy.matrix);
      });
      driftwoodMeshRef.current.instanceMatrix.needsUpdate = true;
    }

    if (beachRockMeshRef.current) {
      beachRockData.forEach((rock, i) => {
        dummy.position.set(rock.position[0], rock.position[1], rock.position[2]);
        dummy.scale.set(rock.scale, rock.scale * (0.6 + Math.random() * 0.4), rock.scale);
        dummy.rotation.set(Math.random() * 0.3, rock.rotation, Math.random() * 0.3);
        dummy.updateMatrix();
        beachRockMeshRef.current!.setMatrixAt(i, dummy.matrix);
      });
      beachRockMeshRef.current.instanceMatrix.needsUpdate = true;
    }

    // Coral reef instances — split by type into 3 instanced meshes
    {
      const coralsByType: typeof coralData[] = [[], [], []];
      for (const c of coralData) coralsByType[c.type].push(c);
      const coralRefs = [coralBrainRef, coralStagRef, coralFanRef];
      coralsByType.forEach((group, ti) => {
        const ref = coralRefs[ti];
        if (ref.current && group.length > 0) {
          group.forEach((coral, i) => {
            dummy.position.set(coral.position[0], coral.position[1], coral.position[2]);
            dummy.scale.set(coral.scale, coral.scale, coral.scale);
            dummy.rotation.set(0, coral.rotation, 0);
            dummy.updateMatrix();
            ref.current!.setMatrixAt(i, dummy.matrix);
          });
          ref.current.instanceMatrix.needsUpdate = true;
        }
      });
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
      const col = new THREE.Color();
      fishData.forEach((fish, i) => {
        dummy.position.set(fish.position[0], fish.position[1], fish.position[2]);
        const s = fish.scale;
        dummy.scale.set(s, s, s);
        dummy.rotation.set(0, fish.rotation, 0);
        dummy.updateMatrix();
        fishMeshRef.current!.setMatrixAt(i, dummy.matrix);
        col.setRGB(fish.color[0], fish.color[1], fish.color[2]);
        fishMeshRef.current!.setColorAt(i, col);
      });
      fishMeshRef.current.instanceMatrix.needsUpdate = true;
      if (fishMeshRef.current.instanceColor) fishMeshRef.current.instanceColor.needsUpdate = true;
    }

    if (turtleMeshRef.current) {
      const col = new THREE.Color();
      turtleData.forEach((t, i) => {
        dummy.position.set(t.position[0], t.position[1], t.position[2]);
        const s = t.scale;
        dummy.scale.set(s, s, s);
        dummy.rotation.set(0, t.rotation, 0);
        dummy.updateMatrix();
        turtleMeshRef.current!.setMatrixAt(i, dummy.matrix);
        col.setRGB(t.color[0], t.color[1], t.color[2]);
        turtleMeshRef.current!.setColorAt(i, col);
      });
      turtleMeshRef.current.instanceMatrix.needsUpdate = true;
      if (turtleMeshRef.current.instanceColor) turtleMeshRef.current.instanceColor.needsUpdate = true;
    }

    if (gullMeshRef.current) {
      gullData.forEach((gull, i) => {
        dummy.position.set(gull.position[0], gull.position[1], gull.position[2]);
        dummy.scale.set(1, 1, 1);
        dummy.rotation.set(0, gull.phase, 0);
        dummy.updateMatrix();
        gullMeshRef.current!.setMatrixAt(i, dummy.matrix);
      });
      gullMeshRef.current.instanceMatrix.needsUpdate = true;
    }
  }, [treeData, deadTreeData, palmData, cactusData, thornbushData, riceShootData, driftwoodData, beachRockData, crabData, coralData, fishData, turtleData, gullData]);

  // Stabilize shadow camera — snap target to texel grid to prevent shimmer,
  // and move the light position with the player so shadow direction stays constant.
  useFrame(() => {
    const light = sunLightRef.current;
    if (!light || !light.shadow?.camera) return;
    const playerPos = getLiveShipTransform().pos;
    const cam = light.shadow.camera as THREE.OrthographicCamera;
    const frustumWidth = cam.right - cam.left;
    const texelSize = frustumWidth / 4096;
    const snappedX = Math.floor(playerPos[0] / texelSize) * texelSize;
    const snappedZ = Math.floor(playerPos[2] / texelSize) * texelSize;
    // Move both target and light together — keeps shadow direction constant everywhere
    light.target.position.set(snappedX, 0, snappedZ);
    light.target.updateMatrixWorld();
    light.position.set(
      snappedX + sunPosition.x,
      sunPosition.y,
      snappedZ + sunPosition.z
    );
  });

  // Animate fish, crabs, gulls, and wind-reactive palms; tick fish respawn
  // Only animate wildlife within this range of the camera (squared, to skip sqrt)
  const ANIM_RANGE_SQ = 120 * 120;
  const PALM_SWAY_RANGE_SQ = 180 * 180;

  useFrame((state, delta) => {
    respawnCheckAccum.current += delta;
    if (respawnCheckAccum.current >= 1) {
      tickFishRespawn();
      respawnCheckAccum.current = 0;
    }
    const time = state.clock.elapsedTime;
    const dummy = dummyRef.current;
    const playerPos = getLiveShipTransform().pos;
    const px = playerPos[0];
    const pz = playerPos[2];

    if (!wildlifeMotionEnabled) {
      const activePalms = palmAnimatedIndicesRef.current;
      if (activePalms.size > 0 && palmTrunkMeshRef.current && palmFrondMeshRef.current) {
        activePalms.forEach((i) => setPalmMatrixAt(palmData[i], i));
        activePalms.clear();
        palmTrunkMeshRef.current.instanceMatrix.needsUpdate = true;
        palmFrondMeshRef.current.instanceMatrix.needsUpdate = true;
      }
      return;
    }

    if (palmTrunkMeshRef.current && palmFrondMeshRef.current) {
      palmSwayAccum.current += delta;
      if (palmSwayAccum.current >= 1 / 24) {
        palmSwayAccum.current = 0;
        const { windDirection, windSpeed } = useGameStore.getState();
        const wind = palmWindVectorRef.current
          .set(Math.sin(windDirection), Math.cos(windDirection))
          .normalize();
        const speed = THREE.MathUtils.clamp(windSpeed, 0, 1);
        const activePalms = palmAnimatedIndicesRef.current;
        let anyUpdated = false;

        palmData.forEach((palm, i) => {
          const pdx = palm.position[0] - px;
          const pdz = palm.position[2] - pz;
          const inRange = pdx * pdx + pdz * pdz <= PALM_SWAY_RANGE_SQ;
          if (!inRange) {
            if (activePalms.has(i)) {
              setPalmMatrixAt(palm, i);
              activePalms.delete(i);
              anyUpdated = true;
            }
            return;
          }

          activePalms.add(i);
          anyUpdated = true;
          const phase = i * 1.618 + palm.rotation * 2.7 + palm.position[0] * 0.013 + palm.position[2] * 0.017;
          const gust = Math.sin(time * (0.8 + (i % 5) * 0.04) + phase) * 0.55
            + Math.sin(time * 1.9 + phase * 1.7) * 0.25;
          const sway = (0.35 + gust) * speed;
          const trunkLean = THREE.MathUtils.clamp(sway * 0.045, -0.02, 0.06);
          const frondLean = THREE.MathUtils.clamp(sway * 0.16, -0.05, 0.18);
          const localWindX = Math.cos(palm.rotation) * wind.x - Math.sin(palm.rotation) * wind.y;
          const localWindZ = Math.sin(palm.rotation) * wind.x + Math.cos(palm.rotation) * wind.y;
          const flutter = Math.sin(time * (2.4 + (i % 7) * 0.08) + phase * 0.6) * speed * 0.018;
          setPalmMatrixAt(
            palm,
            i,
            localWindZ * trunkLean,
            -localWindX * trunkLean,
            localWindZ * frondLean + flutter,
            -localWindX * frondLean + flutter * 0.7
          );
        });

        if (anyUpdated) {
          palmTrunkMeshRef.current.instanceMatrix.needsUpdate = true;
          palmFrondMeshRef.current.instanceMatrix.needsUpdate = true;
        }
      }
    }

    if (fishMeshRef.current) {
      const storeShoals = useGameStore.getState().fishShoals;
      let anyUpdated = false;
      fishData.forEach((fish, i) => {
        // Hide fish from scattered/depleted shoals
        const shoal = storeShoals[fish.shoalIdx];
        if (shoal?.scattered) {
          dummy.position.set(0, -100, 0);
          dummy.scale.set(0, 0, 0);
          dummy.updateMatrix();
          fishMeshRef.current!.setMatrixAt(i, dummy.matrix);
          anyUpdated = true;
          return;
        }
        // Skip animation for distant fish
        const fdx = fish.position[0] - px;
        const fdz = fish.position[2] - pz;
        if (fdx * fdx + fdz * fdz > ANIM_RANGE_SQ) return;
        anyUpdated = true;
        // Shoal-coherent figure-8 swim with per-fish offset
        const shoalBase = fish.shoalIdx * 1.7; // shared phase per shoal
        const fishOffset = (i - (shoal?.startIdx ?? 0)) * 0.35; // small stagger within shoal
        const speed = 0.3 + (i % 5) * 0.05;
        const angle = shoalBase + fishOffset + time * speed;
        const radius = 1.0 + (i % 3) * 0.4;
        const wobble = Math.sin(angle * 2 + fish.rotation) * 0.3; // figure-8 cross-term
        const baseY = fish.position[1];
        dummy.position.set(
          fish.position[0] + Math.cos(angle) * radius + Math.sin(angle * 2) * wobble,
          baseY + Math.sin(time * 1.5 + i) * 0.05,
          fish.position[2] + Math.sin(angle) * radius * 0.7
        );
        const s = fish.scale;
        // Heading follows path tangent; gentle body shimmy
        const shimmy = Math.sin(time * 2.5 + i * 0.9) * 0.12;
        dummy.rotation.set(shimmy * 0.35, -angle + wobble * 0.5, shimmy);
        dummy.scale.set(s, s, s);
        dummy.updateMatrix();
        fishMeshRef.current!.setMatrixAt(i, dummy.matrix);
      });
      if (anyUpdated) fishMeshRef.current.instanceMatrix.needsUpdate = true;
    }

    // Turtles — slow graceful glide with flipper-stroke roll
    if (turtleMeshRef.current) {
      const storeShoals = useGameStore.getState().fishShoals;
      let anyUpdated = false;
      turtleData.forEach((turtle, i) => {
        const shoal = storeShoals[turtle.shoalIdx];
        if (shoal?.scattered) {
          dummy.position.set(0, -100, 0);
          dummy.scale.set(0, 0, 0);
          dummy.updateMatrix();
          turtleMeshRef.current!.setMatrixAt(i, dummy.matrix);
          anyUpdated = true;
          return;
        }
        // Skip animation for distant turtles
        const tdx = turtle.position[0] - px;
        const tdz = turtle.position[2] - pz;
        if (tdx * tdx + tdz * tdz > ANIM_RANGE_SQ) return;
        anyUpdated = true;
        // Slow lazy drift — wide gentle arcs
        const speed = 0.08 + (i % 3) * 0.02;
        const angle = turtle.rotation + time * speed;
        const radius = 2.0 + (i % 3) * 0.8;
        const baseY = turtle.position[1];
        dummy.position.set(
          turtle.position[0] + Math.cos(angle) * radius,
          baseY + Math.sin(time * 0.4 + i) * 0.04,
          turtle.position[2] + Math.sin(angle) * radius
        );
        const s = turtle.scale;
        // Flipper stroke — periodic roll oscillation
        const flipperStroke = Math.sin(time * 0.8 + i * 2.3) * 0.1;
        dummy.rotation.set(flipperStroke, -angle, Math.sin(time * 0.3 + i) * 0.04);
        dummy.scale.set(s, s, s);
        dummy.updateMatrix();
        turtleMeshRef.current!.setMatrixAt(i, dummy.matrix);
      });
      if (anyUpdated) turtleMeshRef.current.instanceMatrix.needsUpdate = true;
    }

    if (crabMeshRef.current) {
      let anyUpdated = false;
      crabData.forEach((crab, i) => {
        if (_collectedCrabs.has(i)) {
          dummy.position.set(0, -100, 0);
          dummy.scale.set(0, 0, 0);
          dummy.updateMatrix();
          crabMeshRef.current!.setMatrixAt(i, dummy.matrix);
          anyUpdated = true;
          return;
        }
        // Skip animation for distant crabs
        const cdx = crab.position[0] - px;
        const cdz = crab.position[2] - pz;
        if (cdx * cdx + cdz * cdz > ANIM_RANGE_SQ) return;
        anyUpdated = true;
        dummy.scale.set(1, 1, 1);
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
      if (anyUpdated) crabMeshRef.current.instanceMatrix.needsUpdate = true;
    }

    // Seagulls — lazy circling with altitude bobbing
    if (gullMeshRef.current) {
      let anyUpdated = false;
      gullData.forEach((gull, i) => {
        // Skip animation for distant gulls
        const gdx = gull.position[0] - px;
        const gdz = gull.position[2] - pz;
        if (gdx * gdx + gdz * gdz > ANIM_RANGE_SQ) return;
        anyUpdated = true;
        const t = time * (0.3 + (i % 5) * 0.06) + gull.phase; // varied speed per bird
        const cx = gull.position[0]; // orbit center
        const cz = gull.position[2];
        const r = gull.radius;
        // Circular orbit
        const gx = cx + Math.cos(t) * r;
        const gz = cz + Math.sin(t) * r;
        // Gentle altitude bob — longer period than the orbit
        const gy = gull.position[1] + Math.sin(t * 0.4 + i) * 1.5;
        // Face direction of travel (tangent to circle)
        const heading = t + Math.PI / 2;
        // Slight wing-bank into the turn
        const bank = Math.sin(t * 1.2) * 0.15;
        dummy.position.set(gx, gy, gz);
        dummy.rotation.set(bank, heading, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        gullMeshRef.current!.setMatrixAt(i, dummy.matrix);
      });
      if (anyUpdated) gullMeshRef.current.instanceMatrix.needsUpdate = true;
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
        castShadow={shadowsActive}
        shadow-mapSize={[4096, 4096]}
        shadow-bias={-0.0003}
        shadow-normalBias={0.02}
        shadow-radius={3.5}
      >
        <orthographicCamera attach="shadow-camera" args={[-120, 120, 120, -120, 1, 400]} />
      </directionalLight>

      {/* Moonlight — cool silver-blue from opposite side */}
      <directionalLight
        position={moonPosition}
        intensity={moonIntensity}
        color={new THREE.Color(0.55, 0.65, 0.9)}
      />

      {/* Procedural Terrain */}
      <mesh
        geometry={landTerrainGeometry}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow={shadowsActive}
        castShadow={shadowsActive}
        raycast={() => null}
        material={terrainMaterial}
      />


      {/* Edge fog — transparent center, opaque past map edges, extends to horizon */}
      <EdgeFogPlane halfSize={(devSoloPort ? 1000 : 900) / 2} />

      {/* Instanced Flora & Fauna */}
      {treeData.length > 0 && (
        <>
          <instancedMesh ref={trunkMeshRef} args={[treeTrunkGeometry, treeTrunkMaterial, treeData.length]} castShadow={shadowsActive} receiveShadow={shadowsActive} />
          <instancedMesh ref={leavesMeshRef} args={[treeLeavesGeometry, treeLeavesMaterial, treeData.length]} castShadow={shadowsActive} receiveShadow={shadowsActive} />
        </>
      )}
      {deadTreeData.length > 0 && (
        <instancedMesh ref={deadTreeMeshRef} args={[treeTrunkGeometry, deadTreeMaterial, deadTreeData.length]} castShadow={shadowsActive} receiveShadow={shadowsActive} />
      )}
      {palmData.length > 0 && (
        <>
          <instancedMesh ref={palmTrunkMeshRef} args={[palmTrunkGeometry, palmTrunkMaterial, palmData.length]} castShadow={shadowsActive} receiveShadow={shadowsActive} />
          <instancedMesh ref={palmFrondMeshRef} args={[palmFrondGeometry, palmFrondMaterial, palmData.length]} castShadow={shadowsActive} receiveShadow={shadowsActive} />
        </>
      )}
      {cactusData.length > 0 && (
        <instancedMesh ref={cactusMeshRef} args={[cactusGeometry, cactusMaterial, cactusData.length]} castShadow={shadowsActive} receiveShadow={shadowsActive} />
      )}
      {thornbushData.length > 0 && (
        <instancedMesh ref={thornbushMeshRef} args={[thornbushGeometry, thornbushMaterial, thornbushData.length]} castShadow={shadowsActive} receiveShadow={shadowsActive} />
      )}
      {riceShootData.length > 0 && (
        <instancedMesh ref={riceShootMeshRef} args={[riceShootGeometry, riceShootMaterial, riceShootData.length]} />
      )}
      {driftwoodData.length > 0 && (
        <instancedMesh ref={driftwoodMeshRef} args={[driftwoodGeometry, driftwoodMaterial, driftwoodData.length]} receiveShadow={shadowsActive} />
      )}
      {beachRockData.length > 0 && (
        <instancedMesh ref={beachRockMeshRef} args={[beachRockGeometry, beachRockMaterial, beachRockData.length]} castShadow={shadowsActive} receiveShadow={shadowsActive} />
      )}

      {crabData.length > 0 && (
        <instancedMesh
          ref={crabMeshRef}
          args={[crabGeometry, crabMaterial, crabData.length]}
          castShadow={shadowsActive}
          receiveShadow={shadowsActive}
          onPointerDown={(e) => {
            e.stopPropagation();
            const { addNotification } = useGameStore.getState();
            addNotification('Shore Crab', 'info', {
              size: 'grand',
              subtitle: 'Grapsidae · Walk over to collect (+1 provisions)',
            });
          }}
        />
      )}
      {fishData.length > 0 && (
        <instancedMesh
          ref={fishMeshRef}
          args={[fishGeometry, fishMaterial, fishData.length]}
          castShadow={false}
          onPointerDown={(e) => {
            e.stopPropagation();
            const idx = e.instanceId;
            if (idx == null) return;
            const fish = fishData[idx];
            if (!fish) return;
            const shoal = fishShoalData[fish.shoalIdx];
            if (!shoal) return;
            const ft = shoal.fishType;
            const { addNotification } = useGameStore.getState();
            addNotification(
              ft.name,
              'info',
              { size: 'grand', subtitle: `${ft.latin} \u00b7 ${ft.climate} waters` },
            );
          }}
          onPointerOver={() => { document.body.style.cursor = 'pointer'; }}
          onPointerOut={() => { document.body.style.cursor = ''; }}
        />
      )}
      {turtleData.length > 0 && (
        <instancedMesh
          ref={turtleMeshRef}
          args={[turtleGeometry, turtleMaterial, turtleData.length]}
          castShadow={false}
          onPointerDown={(e) => {
            e.stopPropagation();
            const idx = e.instanceId;
            if (idx == null) return;
            const turtle = turtleData[idx];
            if (!turtle) return;
            const shoal = fishShoalData[turtle.shoalIdx];
            if (!shoal) return;
            const ft = shoal.fishType;
            const { addNotification } = useGameStore.getState();
            addNotification(
              ft.name,
              'info',
              { size: 'grand', subtitle: `${ft.latin} · ${ft.climate} waters` },
            );
          }}
          onPointerOver={() => { document.body.style.cursor = 'pointer'; }}
          onPointerOut={() => { document.body.style.cursor = ''; }}
        />
      )}
      {gullData.length > 0 && (
        <instancedMesh ref={gullMeshRef} args={[gullGeometry, gullMaterial, gullData.length]} />
      )}

      {/* Coral Reefs — 3 instanced mesh types rendered below water surface */}
      {coralReefEnabled && (() => {
        const counts = [0, 0, 0];
        for (const c of coralData) counts[c.type]++;
        return (
          <>
            {counts[0] > 0 && <instancedMesh ref={coralBrainRef} args={[brainCoralGeo, brainCoralMat, counts[0]]} />}
            {counts[1] > 0 && <instancedMesh ref={coralStagRef} args={[stagCoralGeo, stagCoralMat, counts[1]]} />}
            {counts[2] > 0 && <instancedMesh ref={coralFanRef} args={[fanCoralGeo, fanCoralMat, counts[2]]} />}
          </>
        );
      })()}

      {/* Ports */}
      <ProceduralCity />
      <PortIndicators />
      <BuildingTooltip />

      {/* NPC Ships */}
      {npcShips.map((ship) => (
        <NPCShip key={ship.id} identity={ship} initialPosition={ship.position} />
      ))}

      {/* Rare ocean encounters — whales, turtles, wreckage */}
      {oceanEncounters.map((enc) => (
        <OceanEncounter key={enc.id} encounter={enc} />
      ))}
    </group>
  );
}
