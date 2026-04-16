import { useMemo, useEffect, useRef } from 'react';
import { useGameStore } from '../store/gameStore';
import * as THREE from 'three';
import { mergeVertices, mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { NPCShip } from './NPCShip';
import { getTerrainData, reseedTerrain, refreshTerrainPaletteCache, setMeshHalf } from '../utils/terrain';
import { useFrame } from '@react-three/fiber';
import { generateMap, focusedPortConfig, devModeConfig, findSafeSpawn } from '../utils/mapGenerator';
import { setLandCharacterBuildings } from '../utils/landCharacter';
import { registerTerrainMapCanvas, terrainChartColor } from './WorldMap';
import { SEA_LEVEL } from '../constants/world';
import { getWaterPalette, resolveWaterPaletteId, type WaterPaletteId } from '../utils/waterPalettes';
import { resolveCampaignPortId } from '../utils/worldPorts';

/** Shift a hex color's HSL to match the current climate palette.
 *  Tropical is the baseline — other climates desaturate and hue-shift. */
function tintVegetation(baseHex: string, paletteId: WaterPaletteId): string {
  const col = new THREE.Color(baseHex);
  const hsl = { h: 0, s: 0, l: 0 };
  col.getHSL(hsl);
  switch (paletteId) {
    case 'temperate':
      hsl.s *= 0.60; hsl.l = hsl.l * 0.96 + 0.04; hsl.h += 0.02; break;
    case 'arid':
      hsl.s *= 0.70; hsl.h -= 0.03; break;
    case 'mediterranean':
      hsl.s *= 0.78; hsl.h -= 0.01; hsl.l *= 1.02; break;
    case 'monsoon':
      hsl.s *= 0.88; hsl.l *= 0.92; break;
    case 'tropical': default: break;
  }
  col.setHSL(hsl.h, Math.min(1, hsl.s), Math.min(1, hsl.l));
  return '#' + col.getHexString();
}

import { ProceduralCity } from './ProceduralCity';
import { Grazers } from './Grazers';
import { PortIndicators } from './PortIndicators';
import { BuildingTooltip } from './BuildingTooltip';
import { generateNPCShip } from '../utils/npcShipGenerator';
import { pickFishType, randomShoalSize, type FishType } from '../utils/fishTypes';
import { generateEncounter, type OceanEncounterDef } from '../utils/oceanEncounters';
import { OceanEncounter } from './OceanEncounter';
import { getLiveShipTransform } from '../utils/livePlayerTransform';

const SKY_DOME_VS = `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_DOME_FS = `
  uniform vec3 uZenithColor;
  uniform vec3 uHorizonColor;
  uniform vec3 uLowerColor;
  varying vec3 vDir;
  void main() {
    float skyT = smoothstep(-0.04, 0.82, vDir.y);
    float lowerT = smoothstep(-0.55, 0.18, vDir.y);
    vec3 sky = mix(uHorizonColor, uZenithColor, skyT);
    vec3 col = mix(uLowerColor, sky, lowerT);
    gl_FragColor = vec4(col, 1.0);
  }
`;

function lerpColorHex(a: string, b: string, t: number): THREE.Color {
  return new THREE.Color(a).lerp(new THREE.Color(b), THREE.MathUtils.clamp(t, 0, 1));
}

function ClearSkyDome() {
  const meshRef = useRef<THREE.Mesh>(null);
  const uniforms = useMemo(() => ({
    uZenithColor: { value: new THREE.Color('#0794f2') },
    uHorizonColor: { value: new THREE.Color('#55c6ff') },
    uLowerColor: { value: new THREE.Color('#7fcff4') },
  }), []);

  useFrame(({ camera }) => {
    if (!meshRef.current) return;
    meshRef.current.position.copy(camera.position);

    const state = useGameStore.getState();
    const waterPaletteId = resolveWaterPaletteId(state);
    const angle = ((state.timeOfDay - 6) / 24) * Math.PI * 2;
    const sunH = Math.sin(angle);

    let zenith: THREE.Color;
    let horizon: THREE.Color;
    let lower: THREE.Color;

    if (sunH > 0.3) {
      if (waterPaletteId === 'monsoon') {
        zenith = new THREE.Color('#3d9fbb');
        horizon = new THREE.Color('#75bfc9');
        lower = new THREE.Color('#9acdcf');
      } else if (waterPaletteId === 'tropical') {
        zenith = new THREE.Color('#0289e8');
        horizon = new THREE.Color('#50c7ff');
        lower = new THREE.Color('#7ed5ff');
      } else if (waterPaletteId === 'temperate') {
        zenith = new THREE.Color('#6f8894');
        horizon = new THREE.Color('#9fb4bc');
        lower = new THREE.Color('#b5c3c8');
      } else {
        zenith = new THREE.Color('#158bd8');
        horizon = new THREE.Color('#68c4f2');
        lower = new THREE.Color('#94d6f4');
      }
    } else if (sunH > 0.0) {
      const t = sunH / 0.3;
      const dayZenith = waterPaletteId === 'temperate'
        ? '#6f8894'
        : waterPaletteId === 'monsoon'
        ? '#3d9fbb'
        : waterPaletteId === 'tropical'
        ? '#0289e8'
        : '#0693e3';
      const dayHorizon = waterPaletteId === 'temperate'
        ? '#9fb4bc'
        : waterPaletteId === 'monsoon'
        ? '#75bfc9'
        : waterPaletteId === 'tropical'
        ? '#50c7ff'
        : '#4ec2ee';
      zenith = lerpColorHex('#223a68', dayZenith, t);
      horizon = lerpColorHex('#f0a36b', dayHorizon, t);
      lower = lerpColorHex('#f0a36b', dayHorizon, t);
    } else if (sunH > -0.15) {
      const t = (sunH + 0.15) / 0.15;
      zenith = lerpColorHex('#101f42', '#223a68', t);
      horizon = lerpColorHex('#172747', '#f0a36b', t);
      lower = lerpColorHex('#172747', '#f0a36b', t);
    } else {
      zenith = new THREE.Color('#081833');
      horizon = new THREE.Color('#102241');
      lower = new THREE.Color('#102241');
    }

    uniforms.uZenithColor.value.copy(zenith);
    uniforms.uHorizonColor.value.copy(horizon);
    uniforms.uLowerColor.value.copy(lower);
  });

  return (
    <mesh ref={meshRef} raycast={() => null} renderOrder={-1000}>
      <sphereGeometry args={[5000, 48, 24]} />
      <shaderMaterial
        side={THREE.BackSide}
        depthWrite={false}
        depthTest={false}
        fog={false}
        uniforms={uniforms}
        vertexShader={SKY_DOME_VS}
        fragmentShader={SKY_DOME_FS}
      />
    </mesh>
  );
}

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
const NPC_SPAWN_TARGET_COUNT = 8;
const NPC_SPAWN_MIN_SEPARATION = 38;
const NPC_SPAWN_EDGE_MARGIN = 0.82;
const NPC_SPAWN_MAX_ATTEMPTS = 900;
const NPC_SPAWN_WATER_HEIGHT = SEA_LEVEL - 2.2;

type NpcSpawnCandidate = {
  position: [number, number, number];
  score: number;
};

function isClearNpcSpawnWater(x: number, z: number, halfSize: number): boolean {
  const edgeLimit = halfSize * NPC_SPAWN_EDGE_MARGIN;
  if (Math.abs(x) > edgeLimit || Math.abs(z) > edgeLimit) return false;

  const centerHeight = getTerrainData(x, z).height;
  if (centerHeight > NPC_SPAWN_WATER_HEIGHT) return false;

  for (const radius of [8, 18]) {
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const cx = x + Math.cos(angle) * radius;
      const cz = z + Math.sin(angle) * radius;
      if (Math.abs(cx) > edgeLimit || Math.abs(cz) > edgeLimit) return false;
      if (getTerrainData(cx, cz).height > SEA_LEVEL - 1.0) return false;
    }
  }

  return true;
}

function addNpcSpawnCandidate(
  candidates: NpcSpawnCandidate[],
  x: number,
  z: number,
  halfSize: number,
  score: number,
) {
  if (!isClearNpcSpawnWater(x, z, halfSize)) return;
  candidates.push({ position: [x, SEA_LEVEL, z], score });
}

function generateNpcSpawnPositions(
  ports: { position: [number, number, number] }[],
  halfSize: number,
): [number, number, number][] {
  const candidates: NpcSpawnCandidate[] = [];
  const anchors = ports.length ? ports.map(port => port.position) : [[0, SEA_LEVEL, 0] as [number, number, number]];
  const maxLocalRadius = Math.min(halfSize * 0.72, 320);

  for (const anchor of anchors) {
    for (let radius = 55; radius <= maxLocalRadius; radius += 18) {
      for (let i = 0; i < 18; i++) {
        if (candidates.length > NPC_SPAWN_MAX_ATTEMPTS) break;
        const angle = (i / 18) * Math.PI * 2 + (Math.random() - 0.5) * 0.24;
        const jitteredRadius = radius + (Math.random() - 0.5) * 14;
        const x = anchor[0] + Math.cos(angle) * jitteredRadius;
        const z = anchor[2] + Math.sin(angle) * jitteredRadius;
        const routeBand = 1 - Math.min(1, Math.abs(jitteredRadius - 155) / 180);
        addNpcSpawnCandidate(candidates, x, z, halfSize, 20 + routeBand * 30 + Math.random() * 8);
      }
    }
  }

  // Fallback for ports whose nearby coast is too shallow or landlocked: scan the
  // playable center, still excluding the foggy edge band.
  for (let x = -halfSize * 0.74; x <= halfSize * 0.74 && candidates.length < NPC_SPAWN_MAX_ATTEMPTS; x += 28) {
    for (let z = -halfSize * 0.74; z <= halfSize * 0.74 && candidates.length < NPC_SPAWN_MAX_ATTEMPTS; z += 28) {
      addNpcSpawnCandidate(
        candidates,
        x + (Math.random() - 0.5) * 12,
        z + (Math.random() - 0.5) * 12,
        halfSize,
        8 + Math.random() * 12,
      );
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  const positions: [number, number, number][] = [];

  for (const candidate of candidates) {
    const tooClose = positions.some(pos => {
      const dx = pos[0] - candidate.position[0];
      const dz = pos[2] - candidate.position[2];
      return dx * dx + dz * dz < NPC_SPAWN_MIN_SEPARATION * NPC_SPAWN_MIN_SEPARATION;
    });
    if (tooClose) continue;
    positions.push(candidate.position);
    if (positions.length >= NPC_SPAWN_TARGET_COUNT) break;
  }

  return positions;
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
    treeData, deadTreeData, cactusData, crabData, palmData, mangroveData, reedBedData, siltPatchData, saltStainData, thornbushData, riceShootData, driftwoodData, beachRockData, coralData, fishData, turtleData, fishShoalData, gullData, grazerData, encounterData,
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

    // Register all buildings for the land character overlay
    const allBuildings = portsData.flatMap(p => p.buildings);
    setLandCharacterBuildings(allBuildings);

    const npcs: [number, number, number][] = [];
    const trees: { position: [number, number, number], scale: number }[] = [];
    const deadTrees: { position: [number, number, number], scale: number }[] = [];
    const cacti: { position: [number, number, number], scale: number }[] = [];
    const crabs: { position: [number, number, number], rotation: number }[] = [];
    const palms: PalmEntry[] = [];
    const mangroves: { position: [number, number, number], scale: number, rotation: number }[] = [];
    const reedBeds: { position: [number, number, number], scale: number, rotation: number }[] = [];
    const siltPatches: { position: [number, number, number], scale: number, rotation: number }[] = [];
    const saltStains: { position: [number, number, number], scale: number, rotation: number }[] = [];
    const thornbushes: { position: [number, number, number], scale: number, rotation: number }[] = [];
    const riceShoots: { position: [number, number, number], scale: number, rotation: number }[] = [];
    const driftwood: { position: [number, number, number], scale: number, rotation: number }[] = [];
    const beachRocks: { position: [number, number, number], scale: number, rotation: number }[] = [];
    const corals: { position: [number, number, number], scale: number, rotation: number, type: number }[] = [];
    const fishes: { position: [number, number, number], rotation: number, scale: number, color: [number, number, number], shoalIdx: number }[] = [];
    const turtles: { position: [number, number, number], rotation: number, scale: number, color: [number, number, number], shoalIdx: number }[] = [];
    const fishShoals: { center: [number, number, number], fishType: FishType, startIdx: number, count: number, maxCount: number, lastFished: number, scattered: boolean }[] = [];
    const gulls: { position: [number, number, number], phase: number, radius: number }[] = [];
    const grazers: { position: [number, number, number], rotation: number, color: [number, number, number], scale: number, speedMult: number }[] = [];
    const encounters: OceanEncounterDef[] = [];

    // ── Grazer variant config per port ──────────────────────────────────────
    const portId = resolveCampaignPortId({ worldSeed, devSoloPort, currentWorldPortId });
    const GRAZER_VARIANTS: { color: [number, number, number]; scale: number; herdMin: number; herdMax: number; spawnChance: number; biomes: Set<string> }[] = (() => {
      const col = (hex: string): [number, number, number] => {
        const c = new THREE.Color(hex);
        return [c.r, c.g, c.b];
      };
      const grass = new Set(['grassland', 'scrubland']);
      const arid = new Set(['scrubland', 'desert', 'arroyo']);
      const lush = new Set(['grassland', 'forest', 'scrubland']);
      const wet = new Set(['grassland', 'swamp', 'scrubland']);
      switch (portId) {
        case 'cape':
          return [{ color: col('#c8a060'), scale: 1.0, herdMin: 5, herdMax: 9, spawnChance: 0.003, biomes: grass }];
        case 'mombasa': case 'zanzibar':
          return [{ color: col('#a06840'), scale: 0.9, herdMin: 4, herdMax: 7, spawnChance: 0.0025, biomes: lush }];
        case 'hormuz': case 'diu': case 'socotra':
          return [{ color: col('#8a7a6a'), scale: 0.65, herdMin: 3, herdMax: 5, spawnChance: 0.003, biomes: arid }];
        case 'muscat': case 'mocha': case 'aden':
          return [{ color: col('#7a6a5a'), scale: 0.7, herdMin: 3, herdMax: 5, spawnChance: 0.003, biomes: arid }];
        case 'london': case 'amsterdam':
          return [{ color: col('#e8dcc8'), scale: 0.6, herdMin: 4, herdMax: 8, spawnChance: 0.002, biomes: grass }];
        case 'lisbon': case 'seville':
          return [{ color: col('#d8c8a8'), scale: 0.65, herdMin: 3, herdMax: 6, spawnChance: 0.002, biomes: grass }];
        case 'goa': case 'calicut': case 'surat':
          return [{ color: col('#4a4a4a'), scale: 1.2, herdMin: 2, herdMax: 3, spawnChance: 0.0015, biomes: wet }];
        case 'malacca': case 'bantam': case 'macau':
          return [{ color: col('#5a4a3a'), scale: 1.1, herdMin: 2, herdMax: 3, spawnChance: 0.001, biomes: wet }];
        case 'salvador': case 'cartagena':
          return [{ color: col('#8a6848'), scale: 0.8, herdMin: 3, herdMax: 5, spawnChance: 0.002, biomes: wet }];
        case 'elmina': case 'luanda':
          return [{ color: col('#9a7050'), scale: 0.85, herdMin: 3, herdMax: 5, spawnChance: 0.002, biomes: lush }];
        case 'havana':
          return []; // no grazers — iguanas later
        default:
          return [{ color: col('#b09060'), scale: 0.8, herdMin: 3, herdMax: 5, spawnChance: 0.002, biomes: grass }];
      }
    })();
    const CITY_EXCLUSION_SQ = 90 * 90; // no grazers within 90 units of port center
    const MAX_GRAZERS = 60;
    
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
      const { height, biome, color, moisture, reefFactor, paddyFlooded, coastSteepness, shallowFactor, surfFactor, wetSandFactor, beachFactor, slope } = terrain;
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
      } else if (biome === 'mangrove') {
        const flatness = Math.max(0, 1 - slope * 3.2);
        const edgeWetness = Math.max(wetSandFactor, surfFactor * 0.7);
        const mangroveDensity = flatness * (0.45 + moisture * 0.45) * (0.55 + edgeWetness * 0.45);
        if (rand < 0.32 * mangroveDensity && mangroves.length < 340) {
          mangroves.push({
            position: [x, height, worldZ],
            scale: 0.75 + Math.random() * 0.7,
            rotation: Math.random() * Math.PI * 2,
          });
        }
        if (rand > 0.88 && edgeWetness > 0.16 && reedBeds.length < 500) {
          reedBeds.push({
            position: [x, height + 0.03, worldZ],
            scale: 0.7 + Math.random() * 0.7,
            rotation: Math.random() * Math.PI * 2,
          });
        }
        if (rand > 0.94 && siltPatches.length < 320) {
          siltPatches.push({
            position: [x, height + 0.035, worldZ],
            scale: 0.55 + Math.random() * 0.65,
            rotation: Math.random() * Math.PI * 2,
          });
        }
        if (rand < 0.08) {
          crabs.push({ position: [x, height, worldZ], rotation: Math.random() * Math.PI * 2 });
        }
      } else if (biome === 'tidal_flat') {
        const flatness = Math.max(0, 1 - slope * 4);
        const reedEdge = Math.max(wetSandFactor, moisture * 0.45);
        if (rand > 0.91 && reedEdge > 0.22 && reedBeds.length < 500) {
          reedBeds.push({
            position: [x, height + 0.03, worldZ],
            scale: 0.45 + Math.random() * 0.55,
            rotation: Math.random() * Math.PI * 2,
          });
        }
        if (rand < 0.16 * flatness && siltPatches.length < 320) {
          siltPatches.push({
            position: [x, height + 0.035, worldZ],
            scale: 0.45 + Math.random() * 0.8,
            rotation: Math.random() * Math.PI * 2,
          });
        }
        if (rand < 0.06) {
          crabs.push({ position: [x, height, worldZ], rotation: Math.random() * Math.PI * 2 });
        }
        if (rand > 0.965 && driftwood.length < 200) {
          driftwood.push({
            position: [x, height + 0.04, worldZ],
            scale: 0.12 + Math.random() * 0.18,
            rotation: Math.random() * Math.PI * 2,
          });
        }
      } else if (biome === 'rocky_shore') {
        const rockDensity = Math.min(1, coastSteepness * 0.65 + slope * 1.7);
        if (rand < 0.22 * rockDensity && beachRocks.length < 350) {
          beachRocks.push({
            position: [x, height + 0.1, worldZ],
            scale: 0.25 + Math.random() * 0.55,
            rotation: Math.random() * Math.PI * 2,
          });
        }
        if (rand > 0.94 && surfFactor > 0.12 && saltStains.length < 220) {
          saltStains.push({
            position: [x, height + 0.04, worldZ],
            scale: 0.35 + Math.random() * 0.45,
            rotation: Math.random() * Math.PI * 2,
          });
        }
        if (rand > 0.985 && gulls.length < 80) {
          gulls.push({
            position: [
              x + (Math.random() - 0.5) * 16,
              height + 10 + Math.random() * 12,
              worldZ + (Math.random() - 0.5) * 16,
            ],
            phase: Math.random() * Math.PI * 2,
            radius: 8 + Math.random() * 12,
          });
        }
      } else if (biome === 'beach') {
        // Palm trees on tropical/monsoon beaches
        const stableSand = beachFactor > wetSandFactor && slope < 0.32;
        if (stableSand && moisture > 0.35 && rand > 0.94 && palms.length < 500) {
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
        if (rand2 > 0.95 && coastSteepness > 0.3 && beachRocks.length < 350) {
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
      } // end beach biome

      // ── Grazer herd spawning ──────────────────────────────────────────
      if (GRAZER_VARIANTS.length > 0 && grazers.length < MAX_GRAZERS && height > SEA_LEVEL + 0.5) {
        const variant = GRAZER_VARIANTS[0];
        if (variant.biomes.has(biome)) {
          // Exclude city zone — portCenter is near (0,0) for focused maps
          const portCX = portsData[0]?.position[0] ?? 0;
          const portCZ = portsData[0]?.position[2] ?? 0;
          const dpx = x - portCX;
          const dpz = worldZ - portCZ;
          if (dpx * dpx + dpz * dpz > CITY_EXCLUSION_SQ && rand < variant.spawnChance) {
            // Seed a herd — cluster several animals around this point
            const herdSize = variant.herdMin + Math.floor(Math.random() * (variant.herdMax - variant.herdMin + 1));
            for (let h = 0; h < herdSize && grazers.length < MAX_GRAZERS; h++) {
              const jx = x + (Math.random() - 0.5) * 12;
              const jz = worldZ + (Math.random() - 0.5) * 12;
              // Slight color variation within herd
              const cv = 0.92 + Math.random() * 0.16;
              grazers.push({
                position: [jx, height + 0.2, jz],
                rotation: Math.random() * Math.PI * 2,
                color: [variant.color[0] * cv, variant.color[1] * cv, variant.color[2] * cv],
                scale: variant.scale * (0.85 + Math.random() * 0.3),
                speedMult: 0.7 + Math.random() * 0.6,
              });
            }
          }
        }
      }

      if ((biome === 'ocean' || biome === 'lagoon') && height < SEA_LEVEL - 0.3) {
        // Coral reef 3D instances — in reef zones, capped for performance
        if ((reefFactor > 0.15 || biome === 'lagoon') && rand > (biome === 'lagoon' ? 0.985 : 0.96) && corals.length < 400) {
          corals.push({
            position: [x, Math.max(height + 0.1, SEA_LEVEL - 0.25), worldZ],
            scale: 0.5 + Math.random() * 0.8,
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

      // Rare ocean encounters — whales, turtles, wreckage
      if (height < -5 && rand > 0.99997 && encounters.length < 5) {
        encounters.push(generateEncounter([x, SEA_LEVEL, worldZ]));
      }
    }

    npcs.push(...generateNpcSpawnPositions(portsData, size / 2));

    // Height smoothing pass — average each land vertex with its neighbors for rounder hills
    const stride = segments + 1;
    const origHeights = new Float32Array(posAttribute.count);
    for (let i = 0; i < posAttribute.count; i++) origHeights[i] = posAttribute.getZ(i);
    for (let iz = 0; iz < stride; iz++) {
      for (let ix = 0; ix < stride; ix++) {
        const idx = iz * stride + ix;
        if (!isLand[idx]) continue;
        let sum = 0, cnt = 0;
        for (let dz = -1; dz <= 1; dz++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dz === 0) continue;
            const nx = ix + dx, nz = iz + dz;
            if (nx >= 0 && nx < stride && nz >= 0 && nz < stride) {
              sum += origHeights[nz * stride + nx];
              cnt++;
            }
          }
        }
        posAttribute.setZ(idx, origHeights[idx] * 0.6 + (sum / cnt) * 0.4);
      }
    }

    // Smooth biome color transitions — only for land-adjacent vertices
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
      mangroveData: mangroves,
      reedBedData: reedBeds,
      siltPatchData: siltPatches,
      saltStainData: saltStains,
      thornbushData: thornbushes,
      riceShootData: riceShoots,
      driftwoodData: driftwood,
      beachRockData: beachRocks,
      coralData: corals,
      fishData: fishes,
      turtleData: turtles,
      fishShoalData: fishShoals,
      gullData: gulls,
      grazerData: grazers,
      encounterData: encounters,
    };
  }, [currentWorldPortId, waterPaletteId, worldSeed, worldSize, devSoloPort]);

  // Sync module-level crab/fish/grazer state
  useEffect(() => {
    _crabData = crabData;
    _collectedCrabs = new Set();
    _fishShoalData = fishShoalData;
  }, [crabData, fishShoalData]);

  useEffect(() => {
    initWorld(generatedPorts);
    setNpcPositions(generatedNpcs);
    // Generate rich NPC ship identities
    const localPortId = generatedPorts[0]?.id;
    const ships = generatedNpcs.map(pos => generateNPCShip(pos, { portId: localPortId }));
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
  const {
    sunPosition,
    ambientColor,
    groundColor,
    ambientIntensity,
    sunColor,
    sunIntensity,
    moonPosition,
    moonIntensity,
    shadowRadius,
  } = useMemo(() => {
    const angle = ((timeOfDay - 6) / 24) * Math.PI * 2; // 6 AM is sunrise
    const sunH = Math.sin(angle); // -1 to 1, how high the sun is

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

    // ── Climate-dependent lighting profiles ────────────────────────────────────
    // Each climate gets distinct sky fill, ground bounce, sun color, and
    // ambient-to-sun ratio — this controls shadow color/softness per region.
    type LightProfile = {
      ambCol: THREE.Color; groundCol: THREE.Color; ambBase: number; ambScale: number;
      sunCol: THREE.Color; sunBase: number; sunScale: number; shadowRadius: number;
    };
    const profiles: Record<string, LightProfile> = {
      tropical: {
        ambCol: new THREE.Color(0.42, 0.72, 0.96), groundCol: new THREE.Color(0.30, 0.44, 0.24),
        ambBase: 0.44, ambScale: 0.12,
        sunCol: new THREE.Color(1.0, 0.92, 0.72), sunBase: 1.15, sunScale: 0.85,
        shadowRadius: 5.0,
      },
      monsoon: {
        ambCol: new THREE.Color(0.42, 0.80, 0.76), groundCol: new THREE.Color(0.28, 0.44, 0.20),
        ambBase: 0.48, ambScale: 0.10,
        sunCol: new THREE.Color(0.92, 0.96, 0.76), sunBase: 1.0, sunScale: 0.70,
        shadowRadius: 6.0,
      },
      temperate: {
        ambCol: new THREE.Color(0.62, 0.68, 0.78), groundCol: new THREE.Color(0.38, 0.34, 0.28),
        ambBase: 0.52, ambScale: 0.08,
        sunCol: new THREE.Color(0.90, 0.88, 0.84), sunBase: 0.90, sunScale: 0.65,
        shadowRadius: 7.0,
      },
      arid: {
        ambCol: new THREE.Color(0.58, 0.56, 0.50), groundCol: new THREE.Color(0.50, 0.40, 0.26),
        ambBase: 0.38, ambScale: 0.12,
        sunCol: new THREE.Color(1.0, 0.88, 0.65), sunBase: 1.30, sunScale: 0.90,
        shadowRadius: 4.0,
      },
      mediterranean: {
        ambCol: new THREE.Color(0.50, 0.66, 0.88), groundCol: new THREE.Color(0.42, 0.36, 0.24),
        ambBase: 0.44, ambScale: 0.11,
        sunCol: new THREE.Color(1.0, 0.90, 0.70), sunBase: 1.10, sunScale: 0.80,
        shadowRadius: 4.5,
      },
    };
    const lp = profiles[waterPaletteId] ?? profiles.tropical;

    // Hemisphere light — sky color (top) + ground bounce color (bottom)
    let ambInt: number, ambCol: THREE.Color, groundCol: THREE.Color;
    if (sunH > 0.35) {
      ambInt = lp.ambBase + sunH * lp.ambScale;
      ambCol = lp.ambCol;
      groundCol = lp.groundCol;
    } else if (sunH > -0.15) {
      const t = (sunH + 0.15) / 0.5;
      ambInt = 0.22 + t * (lp.ambBase - 0.22);
      ambCol = new THREE.Color().lerpColors(
        new THREE.Color(0.18, 0.22, 0.42),
        new THREE.Color().lerpColors(new THREE.Color(1.0, 0.70, 0.44), lp.ambCol, 0.3),
        t
      );
      groundCol = new THREE.Color().lerpColors(
        new THREE.Color(0.08, 0.07, 0.14),
        lp.groundCol,
        t
      );
    } else {
      ambInt = 0.24;
      ambCol = new THREE.Color(0.18, 0.23, 0.43);
      groundCol = new THREE.Color(0.07, 0.07, 0.13);
    }

    // Directional sun light — intensity and color shaped by climate
    let sInt: number, sCol: THREE.Color;
    if (sunH > 0.35) {
      sInt = lp.sunBase + sunH * lp.sunScale;
      sCol = lp.sunCol;
    } else if (sunH > -0.05) {
      const t = (sunH + 0.05) / 0.4;
      sInt = t * lp.sunBase;
      sCol = new THREE.Color().lerpColors(
        new THREE.Color(1.0, 0.42, 0.12),
        lp.sunCol,
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

    return {
      sunPosition: sunPos,
      ambientColor: ambCol,
      groundColor: groundCol,
      ambientIntensity: ambInt,
      sunColor: sCol,
      sunIntensity: sInt,
      moonPosition: moonPos,
      moonIntensity: moonInt,
      shadowRadius: lp.shadowRadius,
    };
  }, [timeOfDay, waterPaletteId]);

  // ── Terrain material with procedural detail noise ──────────────────────────
  const terrainShaderUniformsRef = useRef<{ uPlayerPos: { value: THREE.Vector3 } } | null>(null);
  const terrainMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uPlayerPos = { value: new THREE.Vector3() };
      terrainShaderUniformsRef.current = shader.uniforms as { uPlayerPos: { value: THREE.Vector3 } };

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
        uniform vec3 uPlayerPos;
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

      // Fade shadow contribution to zero at distance — hides blocky edges in the
      // far field and mimics atmospheric softening. Near the ship, full shadow.
      shader.fragmentShader = shader.fragmentShader.replace(
        'directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;',
        `{
          float _shadowFactor = ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
          float _shadowFade = smoothstep(50.0, 110.0, distance(vWorldPos.xz, uPlayerPos.xz));
          directLight.color *= mix(_shadowFactor, 1.0, _shadowFade);
        }`
      );
    };
    return mat;
  }, []);

  // Instanced Meshes Setup
  const treeTrunkGeometry = useMemo(() => new THREE.CylinderGeometry(0.2, 0.3, 2, 5), []);
  const treeLeavesGeometry = useMemo(() => new THREE.ConeGeometry(1.5, 4, 5), []);
  const treeTrunkMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: tintVegetation('#4a3b32', waterPaletteId) }), [waterPaletteId]);
  const treeLeavesMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: tintVegetation('#2d4c1e', waterPaletteId) }), [waterPaletteId]);

  const deadTreeMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: tintVegetation('#3a3a3a', waterPaletteId) }), [waterPaletteId]);

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
  const palmTrunkMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: tintVegetation('#6b5a3e', waterPaletteId) }), [waterPaletteId]);

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
    color: tintVegetation('#2a6e1e', waterPaletteId),
    side: THREE.DoubleSide,
  }), [waterPaletteId]);

  // Mangrove cluster — separate prop roots and canopy so the silhouette reads at distance.
  const mangroveRootGeometry = useMemo(() => {
    const trunk = new THREE.CylinderGeometry(0.08, 0.12, 1.1, 5);
    trunk.translate(0, 0.55, 0);
    const roots: THREE.BufferGeometry[] = [];
    for (let r = 0; r < 8; r++) {
      const angle = (r / 8) * Math.PI * 2;
      const root = new THREE.CylinderGeometry(0.018, 0.038, 1.0 + (r % 3) * 0.12, 4);
      root.rotateZ(0.72 + (r % 2) * 0.12);
      root.rotateY(angle);
      root.translate(Math.sin(angle) * 0.34, 0.34, Math.cos(angle) * 0.34);
      roots.push(root);
    }
    const merged = mergeGeometries([trunk, ...roots]);
    [trunk, ...roots].forEach(g => g.dispose());
    return merged ?? new THREE.CylinderGeometry(0.08, 0.12, 1.1, 5);
  }, []);
  const mangroveRootMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: tintVegetation('#4a3324', waterPaletteId),
    roughness: 0.95,
  }), [waterPaletteId]);

  const mangroveCanopyGeometry = useMemo(() => {
    const canopyA = new THREE.IcosahedronGeometry(0.55, 0);
    canopyA.scale(1.25, 0.62, 1.0);
    canopyA.translate(-0.18, 1.28, 0.02);
    const canopyB = new THREE.IcosahedronGeometry(0.48, 0);
    canopyB.scale(1.15, 0.58, 0.95);
    canopyB.translate(0.32, 1.2, -0.1);
    const merged = mergeGeometries([canopyA, canopyB]);
    canopyA.dispose(); canopyB.dispose();
    return merged ?? new THREE.IcosahedronGeometry(0.6, 0);
  }, []);
  const mangroveCanopyMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: tintVegetation('#1f4b2b', waterPaletteId),
    roughness: 0.95,
  }), [waterPaletteId]);

  // Reed bed — a small fan of vertical blades, used on tidal flats and mangrove edges
  const reedBedGeometry = useMemo(() => {
    const reeds: THREE.BufferGeometry[] = [];
    for (let r = 0; r < 7; r++) {
      const reed = new THREE.CylinderGeometry(0.012, 0.018, 0.7 + (r % 3) * 0.14, 3);
      const angle = (r / 7) * Math.PI * 2;
      reed.rotateZ((r % 2 === 0 ? 1 : -1) * 0.1);
      reed.translate(Math.sin(angle) * 0.16, 0.35, Math.cos(angle) * 0.16);
      reeds.push(reed);
    }
    const merged = mergeGeometries(reeds);
    reeds.forEach(g => g.dispose());
    return merged ?? new THREE.CylinderGeometry(0.02, 0.02, 0.7, 3);
  }, []);
  const reedBedMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: tintVegetation('#6f7d3d', waterPaletteId),
    roughness: 0.9,
  }), [waterPaletteId]);

  const siltPatchGeometry = useMemo(() => {
    const geo = new THREE.CircleGeometry(0.55, 9);
    geo.scale(1.35, 0.62, 1);
    geo.rotateX(-Math.PI / 2);
    return geo;
  }, []);
  const siltPatchMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#7a725a',
    roughness: 1,
    transparent: true,
    opacity: 0.58,
    depthWrite: false,
  }), []);

  const saltStainGeometry = useMemo(() => {
    const geo = new THREE.CircleGeometry(0.45, 8);
    geo.scale(1.45, 0.5, 1);
    geo.rotateX(-Math.PI / 2);
    return geo;
  }, []);
  const saltStainMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#b7b0a0',
    roughness: 1,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
  }), []);

  const cactusGeometry = useMemo(() => new THREE.CylinderGeometry(0.3, 0.3, 2, 6), []);
  const cactusMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: tintVegetation('#2E8B57', waterPaletteId) }), [waterPaletteId]);

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
    color: tintVegetation('#6b7a4a', waterPaletteId), roughness: 0.9,
  }), [waterPaletteId]);

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
    color: tintVegetation('#8a7560', waterPaletteId), roughness: 0.95,
  }), [waterPaletteId]);

  // Beach rocks — flattened irregular stones
  const beachRockGeometry = useMemo(() => {
    const geo = new THREE.IcosahedronGeometry(0.3, 0);
    geo.scale(1.0, 0.45, 0.8); // flat and wide
    return geo;
  }, []);
  const beachRockMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: tintVegetation('#6e6860', waterPaletteId), roughness: 0.85,
  }), [waterPaletteId]);

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
    color: tintVegetation('#5a8c2a', waterPaletteId), side: THREE.DoubleSide,
  }), [waterPaletteId]);
  
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
    color: '#c46478', emissive: '#c46478', emissiveIntensity: 0.3, roughness: 0.8, metalness: 0.0,
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
    color: '#d8854a', emissive: '#d8854a', emissiveIntensity: 0.3, roughness: 0.7, metalness: 0.0,
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
    color: '#7b52a0', emissive: '#7b52a0', emissiveIntensity: 0.3, roughness: 0.6, metalness: 0.0, side: THREE.DoubleSide,
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
  const mangroveRootMeshRef = useRef<THREE.InstancedMesh>(null);
  const mangroveCanopyMeshRef = useRef<THREE.InstancedMesh>(null);
  const reedBedMeshRef = useRef<THREE.InstancedMesh>(null);
  const siltPatchMeshRef = useRef<THREE.InstancedMesh>(null);
  const saltStainMeshRef = useRef<THREE.InstancedMesh>(null);
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

    if (mangroveRootMeshRef.current && mangroveCanopyMeshRef.current) {
      mangroveData.forEach((mangrove, i) => {
        dummy.position.set(mangrove.position[0], mangrove.position[1], mangrove.position[2]);
        dummy.scale.set(mangrove.scale, mangrove.scale, mangrove.scale);
        dummy.rotation.set(0, mangrove.rotation, 0);
        dummy.updateMatrix();
        mangroveRootMeshRef.current!.setMatrixAt(i, dummy.matrix);
        mangroveCanopyMeshRef.current!.setMatrixAt(i, dummy.matrix);
      });
      mangroveRootMeshRef.current.instanceMatrix.needsUpdate = true;
      mangroveCanopyMeshRef.current.instanceMatrix.needsUpdate = true;
    }

    if (reedBedMeshRef.current) {
      reedBedData.forEach((reed, i) => {
        dummy.position.set(reed.position[0], reed.position[1], reed.position[2]);
        dummy.scale.set(reed.scale, reed.scale * (0.8 + Math.random() * 0.4), reed.scale);
        dummy.rotation.set(0, reed.rotation, 0);
        dummy.updateMatrix();
        reedBedMeshRef.current!.setMatrixAt(i, dummy.matrix);
      });
      reedBedMeshRef.current.instanceMatrix.needsUpdate = true;
    }

    if (siltPatchMeshRef.current) {
      siltPatchData.forEach((patch, i) => {
        dummy.position.set(patch.position[0], patch.position[1], patch.position[2]);
        dummy.scale.set(patch.scale, patch.scale, patch.scale);
        dummy.rotation.set(0, patch.rotation, 0);
        dummy.updateMatrix();
        siltPatchMeshRef.current!.setMatrixAt(i, dummy.matrix);
      });
      siltPatchMeshRef.current.instanceMatrix.needsUpdate = true;
    }

    if (saltStainMeshRef.current) {
      saltStainData.forEach((patch, i) => {
        dummy.position.set(patch.position[0], patch.position[1], patch.position[2]);
        dummy.scale.set(patch.scale, patch.scale, patch.scale);
        dummy.rotation.set(0, patch.rotation, 0);
        dummy.updateMatrix();
        saltStainMeshRef.current!.setMatrixAt(i, dummy.matrix);
      });
      saltStainMeshRef.current.instanceMatrix.needsUpdate = true;
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

  }, [treeData, deadTreeData, palmData, mangroveData, reedBedData, siltPatchData, saltStainData, cactusData, thornbushData, riceShootData, driftwoodData, beachRockData, crabData, coralData, fishData, turtleData, gullData]);

  // Stabilize shadow camera — snap target to texel grid to prevent shimmer,
  // and move the light position with the player so shadow direction stays constant.
  useFrame(() => {
    const light = sunLightRef.current;
    if (!light || !light.shadow?.camera) return;
    const playerPos = getLiveShipTransform().pos;

    // Feed player position to terrain shader for distance-based shadow fade
    if (terrainShaderUniformsRef.current) {
      terrainShaderUniformsRef.current.uPlayerPos.value.set(playerPos[0], playerPos[1], playerPos[2]);
    }

    const cam = light.shadow.camera as THREE.OrthographicCamera;
    const frustumWidth = cam.right - cam.left;
    const texelSize = frustumWidth / light.shadow.mapSize.x;
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
      <ClearSkyDome />

      <hemisphereLight intensity={ambientIntensity} color={ambientColor} groundColor={groundColor} />
      <directionalLight
        ref={sunLightRef}
        position={sunPosition}
        intensity={sunIntensity}
        color={sunColor}
        castShadow={shadowsActive}
        shadow-mapSize={[4096, 4096]}
        shadow-bias={-0.0000}
        shadow-normalBias={0.0}
        shadow-radius={shadowRadius}
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


      {/* Instanced Flora & Fauna */}
      {treeData.length > 0 && (
        <>
          <instancedMesh ref={trunkMeshRef} args={[treeTrunkGeometry, treeTrunkMaterial, treeData.length]} castShadow={shadowsActive} receiveShadow={shadowsActive} frustumCulled={false} />
          <instancedMesh ref={leavesMeshRef} args={[treeLeavesGeometry, treeLeavesMaterial, treeData.length]} castShadow={shadowsActive} receiveShadow={shadowsActive} frustumCulled={false} />
        </>
      )}
      {deadTreeData.length > 0 && (
        <instancedMesh ref={deadTreeMeshRef} args={[treeTrunkGeometry, deadTreeMaterial, deadTreeData.length]} castShadow={shadowsActive} receiveShadow={shadowsActive} frustumCulled={false} />
      )}
      {palmData.length > 0 && (
        <>
          <instancedMesh ref={palmTrunkMeshRef} args={[palmTrunkGeometry, palmTrunkMaterial, palmData.length]} castShadow={shadowsActive} receiveShadow={shadowsActive} frustumCulled={false} />
          {/* Fronds are thin planes — skip cast to avoid cost and spiderweb artifacts */}
          <instancedMesh ref={palmFrondMeshRef} args={[palmFrondGeometry, palmFrondMaterial, palmData.length]} receiveShadow={shadowsActive} frustumCulled={false} />
        </>
      )}
      {mangroveData.length > 0 && (
        <>
          <instancedMesh ref={mangroveRootMeshRef} args={[mangroveRootGeometry, mangroveRootMaterial, mangroveData.length]} receiveShadow={shadowsActive} frustumCulled={false} />
          <instancedMesh ref={mangroveCanopyMeshRef} args={[mangroveCanopyGeometry, mangroveCanopyMaterial, mangroveData.length]} receiveShadow={shadowsActive} frustumCulled={false} />
        </>
      )}
      {reedBedData.length > 0 && (
        <instancedMesh ref={reedBedMeshRef} args={[reedBedGeometry, reedBedMaterial, reedBedData.length]} receiveShadow={shadowsActive} frustumCulled={false} />
      )}
      {siltPatchData.length > 0 && (
        <instancedMesh ref={siltPatchMeshRef} args={[siltPatchGeometry, siltPatchMaterial, siltPatchData.length]} renderOrder={2} frustumCulled={false} />
      )}
      {saltStainData.length > 0 && (
        <instancedMesh ref={saltStainMeshRef} args={[saltStainGeometry, saltStainMaterial, saltStainData.length]} renderOrder={2} frustumCulled={false} />
      )}
      {cactusData.length > 0 && (
        <instancedMesh ref={cactusMeshRef} args={[cactusGeometry, cactusMaterial, cactusData.length]} receiveShadow={shadowsActive} frustumCulled={false} />
      )}
      {thornbushData.length > 0 && (
        <instancedMesh ref={thornbushMeshRef} args={[thornbushGeometry, thornbushMaterial, thornbushData.length]} receiveShadow={shadowsActive} frustumCulled={false} />
      )}
      {riceShootData.length > 0 && (
        <instancedMesh ref={riceShootMeshRef} args={[riceShootGeometry, riceShootMaterial, riceShootData.length]} frustumCulled={false} />
      )}
      {driftwoodData.length > 0 && (
        <instancedMesh ref={driftwoodMeshRef} args={[driftwoodGeometry, driftwoodMaterial, driftwoodData.length]} receiveShadow={shadowsActive} frustumCulled={false} />
      )}
      {beachRockData.length > 0 && (
        <instancedMesh ref={beachRockMeshRef} args={[beachRockGeometry, beachRockMaterial, beachRockData.length]} receiveShadow={shadowsActive} frustumCulled={false} />
      )}

      {crabData.length > 0 && (
        <instancedMesh
          ref={crabMeshRef}
          args={[crabGeometry, crabMaterial, crabData.length]}
          receiveShadow={shadowsActive}
          frustumCulled={false}
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
          frustumCulled={false}
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
          frustumCulled={false}
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
        <instancedMesh ref={gullMeshRef} args={[gullGeometry, gullMaterial, gullData.length]} frustumCulled={false} />
      )}
      <Grazers data={grazerData} shadowsActive={shadowsActive} />

      {/* Coral Reefs — 3 instanced mesh types rendered below water surface */}
      {coralReefEnabled && (() => {
        const counts = [0, 0, 0];
        for (const c of coralData) counts[c.type]++;
        return (
          <>
            {counts[0] > 0 && <instancedMesh ref={coralBrainRef} args={[brainCoralGeo, brainCoralMat, counts[0]]} frustumCulled={false} />}
            {counts[1] > 0 && <instancedMesh ref={coralStagRef} args={[stagCoralGeo, stagCoralMat, counts[1]]} frustumCulled={false} />}
            {counts[2] > 0 && <instancedMesh ref={coralFanRef} args={[fanCoralGeo, fanCoralMat, counts[2]]} frustumCulled={false} />}
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
