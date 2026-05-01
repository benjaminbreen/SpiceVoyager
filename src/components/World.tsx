import { useMemo, useEffect, useRef } from 'react';
import { useGameStore, type Building, type Port, type Road } from '../store/gameStore';
import { IS_SAFARI } from '../utils/platform';
import * as THREE from 'three';
import { NPCShip } from './NPCShip';
import { useFrame } from '@react-three/fiber';
import { findSafeSpawn } from '../utils/mapGenerator';
import { SEA_LEVEL } from '../constants/world';
import { resolveWaterPaletteId } from '../utils/waterPalettes';
import { computeDayLighting } from '../utils/dayLighting';
import { ClearSkyDome } from './ClearSkyDome';
import { addObstacle, clearObstacleGrid } from '../utils/obstacleGrid';
import { treeShakes, type TreeImpactKind, getPalmDamage, getFelledTreeState } from '../utils/impactShakeState';
import { updateWindUniforms } from '../utils/windSway';
import { type PalmEntry } from '../utils/flora';
import { generateWorldData } from '../utils/worldGeneration';
import { useFloraAssets } from './useFloraAssets';

import { ProceduralCity } from './ProceduralCity';
import { FarmsteadFields } from './FarmsteadFields';
import { Grazers } from './Grazers';
import { Primates } from './Primates';
import { Reptiles } from './Reptiles';
import { WadingBirds } from './WadingBirds';
import { AnimalMarkers } from './AnimalMarkers';
import { PortIndicators } from './PortIndicators';
import { BuildingTooltip } from './BuildingTooltip';
import { generateNPCShip } from '../utils/npcShipGenerator';
import { OceanEncounter } from './OceanEncounter';
import { getActivePlayerPos, getLiveShipTransform } from '../utils/livePlayerTransform';

import {
  setCrabData,
  setFishShoalData,
  setAnimalMapData,
  getCollectedCrabs,
} from '../state/worldRegistries';

// Commodity list now imported from utils/commodities.ts

const TREE_SHAKE_DURATION = 0.34;
const NPC_PLAYER_START_CLEARANCE_SQ = 70 * 70;

type WearFeature = {
  x: number;
  z: number;
  radius: number;
  strength: number;
  kind: 'road' | 'building';
};

function cityWearColor(waterPaletteId: string, kind: WearFeature['kind']): [number, number, number] {
  switch (waterPaletteId) {
    case 'temperate':
      return kind === 'road' ? [0.64, 0.54, 0.36] : [0.52, 0.44, 0.30];
    case 'mediterranean':
      return kind === 'road' ? [0.84, 0.72, 0.48] : [0.74, 0.62, 0.40];
    case 'tropical':
    case 'monsoon':
      return kind === 'road' ? [0.72, 0.56, 0.34] : [0.62, 0.48, 0.28];
    case 'arid':
      return kind === 'road' ? [0.78, 0.66, 0.42] : [0.68, 0.54, 0.32];
    default:
      return kind === 'road' ? [0.68, 0.54, 0.34] : [0.58, 0.44, 0.28];
  }
}

function addWearFeature(
  grid: Map<string, WearFeature[]>,
  cellSize: number,
  feature: WearFeature,
) {
  const minX = Math.floor((feature.x - feature.radius) / cellSize);
  const maxX = Math.floor((feature.x + feature.radius) / cellSize);
  const minZ = Math.floor((feature.z - feature.radius) / cellSize);
  const maxZ = Math.floor((feature.z + feature.radius) / cellSize);
  for (let gx = minX; gx <= maxX; gx++) {
    for (let gz = minZ; gz <= maxZ; gz++) {
      const key = `${gx},${gz}`;
      const bucket = grid.get(key);
      if (bucket) bucket.push(feature);
      else grid.set(key, [feature]);
    }
  }
}

function addRoadWearFeatures(grid: Map<string, WearFeature[]>, cellSize: number, roads: Road[]) {
  for (const road of roads) {
    const pts = road.points;
    if (!pts || pts.length < 2 || road.tier === 'bridge') continue;
    const radius =
      road.tier === 'avenue' ? 11.0 :
      road.tier === 'road' ? 8.4 :
      6.2;
    const strength =
      road.tier === 'avenue' ? 0.86 :
      road.tier === 'road' ? 0.72 :
      0.54;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, , az] = pts[i];
      const [bx, , bz] = pts[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      const samples = Math.max(1, Math.ceil(len / 5));
      for (let s = 0; s <= samples; s++) {
        const t = s / samples;
        addWearFeature(grid, cellSize, {
          x: ax + (bx - ax) * t,
          z: az + (bz - az) * t,
          radius,
          strength,
          kind: 'road',
        });
      }
    }
  }
}

function addBuildingWearFeatures(grid: Map<string, WearFeature[]>, cellSize: number, buildings: Building[]) {
  for (const b of buildings) {
    const [x, , z] = b.position;
    const footprint = Math.max(b.scale[0], b.scale[2]);
    const anchorBoost =
      b.type === 'dock' || b.type === 'warehouse' || b.type === 'market' || b.type === 'plaza' ? 1.35 :
      b.type === 'fort' || b.type === 'palace' || b.type === 'landmark' ? 1.15 :
      1.0;
    addWearFeature(grid, cellSize, {
      x,
      z,
      radius: footprint * 0.95 + 6.0 * anchorBoost,
      strength:
        b.type === 'plaza' ? 0.92 :
        b.type === 'dock' || b.type === 'warehouse' || b.type === 'market' ? 0.78 :
        b.type === 'house' || b.type === 'shack' || b.type === 'farmhouse' ? 0.56 :
        0.62,
      kind: 'building',
    });
  }
}

function applyCityGroundWear(
  source: THREE.BufferGeometry,
  ports: Port[],
  waterPaletteId: string,
): THREE.BufferGeometry {
  const geometry = source.clone();
  const colors = geometry.getAttribute('color') as THREE.BufferAttribute | undefined;
  const positions = geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
  if (!colors || !positions) return geometry;

  const cellSize = 18;
  const grid = new Map<string, WearFeature[]>();
  for (const port of ports) {
    addRoadWearFeatures(grid, cellSize, port.roads ?? []);
    addBuildingWearFeatures(grid, cellSize, port.buildings ?? []);
  }

  const roadTarget = cityWearColor(waterPaletteId, 'road');
  const buildingTarget = cityWearColor(waterPaletteId, 'building');
  const scratch = new THREE.Color();
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const height = positions.getZ(i);
    if (height < SEA_LEVEL - 0.15) continue;
    const z = -positions.getY(i);
    const gx = Math.floor(x / cellSize);
    const gz = Math.floor(z / cellSize);
    let roadWear = 0;
    let buildingWear = 0;
    for (let ox = -1; ox <= 1; ox++) {
      for (let oz = -1; oz <= 1; oz++) {
        const bucket = grid.get(`${gx + ox},${gz + oz}`);
        if (!bucket) continue;
        for (const feature of bucket) {
          const dx = x - feature.x;
          const dz = z - feature.z;
          const dist = Math.hypot(dx, dz);
          if (dist >= feature.radius) continue;
          const t = 1 - dist / feature.radius;
          const falloff = t * t * (3 - 2 * t);
          if (feature.kind === 'road') roadWear = Math.max(roadWear, falloff * feature.strength);
          else buildingWear = Math.max(buildingWear, falloff * feature.strength);
        }
      }
    }
    const wear = Math.max(roadWear, buildingWear);
    if (wear <= 0.01) continue;
    const heightFade = 1 - Math.min(1, Math.max(0, (height - 9) / 12));
    const amount = Math.min(0.92, wear * heightFade * 1.25);
    const mixTotal = roadWear + buildingWear;
    const roadMix = mixTotal > 0 ? roadWear / mixTotal : 0.5;
    const target: [number, number, number] = [
      buildingTarget[0] + (roadTarget[0] - buildingTarget[0]) * roadMix,
      buildingTarget[1] + (roadTarget[1] - buildingTarget[1]) * roadMix,
      buildingTarget[2] + (roadTarget[2] - buildingTarget[2]) * roadMix,
    ];
    scratch.setRGB(colors.getX(i), colors.getY(i), colors.getZ(i));
    const dustLift = amount * (waterPaletteId === 'temperate' ? 0.035 : 0.06);
    scratch.r = scratch.r + (target[0] - scratch.r) * amount + dustLift;
    scratch.g = scratch.g + (target[1] - scratch.g) * amount + dustLift * 0.82;
    scratch.b = scratch.b + (target[2] - scratch.b) * amount + dustLift * 0.42;
    colors.setXYZ(i, scratch.r, scratch.g, scratch.b);
  }
  colors.needsUpdate = true;
  return geometry;
}

export function World() {
  const initWorld = useGameStore((state) => state.initWorld);
  // Quantize timeOfDay to 0.05 game-hour steps (~3 game-min ≈ 0.5s real time
  // at the current tick rate). The raw value updates every 200ms; quantizing
  // cuts World's re-render cadence from 5 Hz to ~2 Hz without any visible
  // difference in the lighting ramp (which already stepped at 0.2s chunks).
  const timeOfDay = useGameStore((state) => Math.round(state.timeOfDay * 20) / 20);
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
  const coralReefEnabled = useGameStore((state) => state.renderDebug.coralReefs);
  const cityGroundWearEnabled = useGameStore((state) => state.renderDebug.cityGroundWear);
  const waterPaletteId = useGameStore((state) => resolveWaterPaletteId(state));

  // Generate world data once
  const {
    landTerrainGeometry, backgroundRingTerrainGeometry, generatedPorts, generatedNpcs,
    treeData, deadTreeData, broadleafData, baobabData, acaciaData, cactusData, crabData, palmData, mangroveData, cypressData, datePalmData, bambooData, willowData, cherryData, orangeData, oakData, reedBedData, siltPatchData, saltStainData, thornbushData, riceShootData, driftwoodData, beachRockData, coralData, fishData, turtleData, fishShoalData, gullData, grazerData, primateData, reptileData, wadingBirdData, grazerSpecies, grazerKind, primateSpecies, reptileSpecies, wadingSpecies, encounterData,
  } = useMemo(
    () => generateWorldData({ worldSeed, worldSize, devSoloPort, currentWorldPortId, waterPaletteId }),
    [currentWorldPortId, waterPaletteId, worldSeed, worldSize, devSoloPort],
  );

  const visibleLandTerrainGeometry = useMemo(
    () => cityGroundWearEnabled
      ? applyCityGroundWear(landTerrainGeometry, generatedPorts, waterPaletteId)
      : landTerrainGeometry,
    [cityGroundWearEnabled, generatedPorts, landTerrainGeometry, waterPaletteId],
  );
  useEffect(() => {
    return () => {
      if (visibleLandTerrainGeometry !== landTerrainGeometry) {
        visibleLandTerrainGeometry.dispose();
      }
    };
  }, [landTerrainGeometry, visibleLandTerrainGeometry]);

  // Sync module-level crab/fish/grazer state
  useEffect(() => {
    setCrabData(crabData);
    setFishShoalData(fishShoalData);
    setAnimalMapData({
      grazers: grazerData,
      primates: primateData,
      reptiles: reptileData,
      wadingBirds: wadingBirdData,
      grazerSpecies,
      primateSpecies,
      reptileSpecies,
      wadingSpecies,
    });
  }, [crabData, fishShoalData, grazerData, primateData, reptileData, wadingBirdData, grazerSpecies, primateSpecies, reptileSpecies, wadingSpecies]);

  // Register static obstacles in the spatial grid for walking-player + animal
  // collision. Rebuilt from scratch each map — per-species radii are small
  // multiples of per-instance scale, tuned against each prop's trunk thickness.
  useEffect(() => {
    clearObstacleGrid();
    // Tree trunks
    palmData.forEach(p => addObstacle(p.position[0], p.position[2], 0.25 * p.scale));
    treeData.forEach(t => addObstacle(t.position[0], t.position[2], 0.35 * t.scale));
    broadleafData.forEach(t => addObstacle(t.position[0], t.position[2], 0.45 * t.scale));
    baobabData.forEach(t => addObstacle(t.position[0], t.position[2], 0.9 * t.scale));
    acaciaData.forEach(t => addObstacle(t.position[0], t.position[2], 0.3 * t.scale));
    deadTreeData.forEach(t => addObstacle(t.position[0], t.position[2], 0.3 * t.scale));
    // Low but solid props
    cactusData.forEach(c => addObstacle(c.position[0], c.position[2], 0.25 * c.scale));
    thornbushData.forEach(b => addObstacle(b.position[0], b.position[2], 0.4 * b.scale));
    mangroveData.forEach(m => addObstacle(m.position[0], m.position[2], 0.5 * m.scale));
    beachRockData.forEach(r => addObstacle(r.position[0], r.position[2], 0.8 * r.scale));
    // New species
    cypressData.forEach(t => addObstacle(t.position[0], t.position[2], 0.22 * t.scale));
    datePalmData.forEach(p => addObstacle(p.position[0], p.position[2], 0.22 * p.scale));
    bambooData.forEach(b => addObstacle(b.position[0], b.position[2], 0.35 * b.scale));
    willowData.forEach(t => addObstacle(t.position[0], t.position[2], 0.5 * t.scale));
    cherryData.forEach(t => addObstacle(t.position[0], t.position[2], 0.4 * t.scale));
    orangeData.forEach(t => addObstacle(t.position[0], t.position[2], 0.35 * t.scale));
    oakData.forEach(t => addObstacle(t.position[0], t.position[2], 0.6 * t.scale));
  }, [palmData, treeData, broadleafData, baobabData, acaciaData, deadTreeData, cactusData, thornbushData, mangroveData, beachRockData, cypressData, datePalmData, bambooData, willowData, cherryData, orangeData, oakData]);

  useEffect(() => {
    initWorld(generatedPorts);
    // Spawn player before mounting NPC ships, so their first frame cannot
    // collision-test against the store's reset [0, 0, 0] position.
    const spawn = findSafeSpawn(generatedPorts);
    setPlayerPos(spawn);
    const safeNpcs = generatedNpcs.filter(pos => {
      const dx = pos[0] - spawn[0];
      const dz = pos[2] - spawn[2];
      return dx * dx + dz * dz >= NPC_PLAYER_START_CLEARANCE_SQ;
    });
    setNpcPositions(safeNpcs);
    // Generate rich NPC ship identities
    const localPortId = generatedPorts[0]?.id;
    const ships = safeNpcs.map(pos => generateNPCShip(pos, { portId: localPortId }));
    setNpcShips(ships);
    setOceanEncounters(encounterData);
    setFishShoals(fishShoalData);
  }, [generatedPorts, generatedNpcs, encounterData, fishShoalData, initWorld, setNpcPositions, setNpcShips, setOceanEncounters, setFishShoals, setPlayerPos]);

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
  } = useMemo(
    () => computeDayLighting({ timeOfDay, worldSeed, waterPaletteId }),
    [timeOfDay, waterPaletteId, worldSeed],
  );

  // ── Terrain material with procedural detail noise ──────────────────────────
  const terrainShaderUniformsRef = useRef<{
    uPlayerPos: { value: THREE.Vector3 };
    uCloudTime: { value: number };
    uCloudWindDir: { value: THREE.Vector2 };
    uCloudStrength: { value: number };
    uWetness: { value: number };
  } | null>(null);
  const terrainMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uPlayerPos = { value: new THREE.Vector3() };
      shader.uniforms.uCloudTime = { value: 0 };
      shader.uniforms.uCloudWindDir = { value: new THREE.Vector2(1, 0) };
      shader.uniforms.uCloudStrength = { value: 0 };
      shader.uniforms.uWetness = { value: 0 };
      terrainShaderUniformsRef.current = shader.uniforms as any;

      // Pass world-position varying from vertex to fragment shader
      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        `#include <common>
        varying vec3 vWorldPos;
        varying vec3 vTerrainWorldNormal;`
      );
      shader.vertexShader = shader.vertexShader.replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
        vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
        vTerrainWorldNormal = normalize(mat3(modelMatrix) * normal);`
      );

      // Inject noise functions and detail modulation into fragment shader
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>
        uniform vec3 uPlayerPos;
        uniform float uCloudTime;
        uniform vec2 uCloudWindDir;
        uniform float uCloudStrength;
        uniform float uWetness;
        varying vec3 vWorldPos;
        varying vec3 vTerrainWorldNormal;

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

          // Slope and foot-of-hill shading — cheap terrain massing without
          // extra geometry. Lower slopes get a slight occluded/damp read;
          // ridge shoulders lift a little so hills stop looking uniformly
          // painted. The height gates keep beaches and flat roads from
          // turning muddy.
          vec3 terrainN = normalize(vTerrainWorldNormal);
          float slopeAmt = smoothstep(0.10, 0.62, 1.0 - clamp(terrainN.y, 0.0, 1.0));
          float aboveWater = smoothstep(0.25, 1.8, vWorldPos.y);
          float lowerGround = 1.0 - smoothstep(4.0, 18.0, vWorldPos.y);
          float highShoulder = smoothstep(7.0, 26.0, vWorldPos.y) * (1.0 - slopeAmt * 0.35);
          float brokenSlope = terrainFBM(wp * 0.18 + vec2(41.0, 17.0));

          float footShade = slopeAmt * lowerGround * aboveWater * (0.085 + brokenSlope * 0.075);
          diffuseColor.rgb *= 1.0 - footShade;

          float earthExpose = slopeAmt * aboveWater * smoothstep(0.36, 0.82, brokenSlope);
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.10, 0.93, 0.76), earthExpose * 0.13);

          float ridgeLift = highShoulder * aboveWater * (0.04 + terrainNoise(wp * 0.09 - 23.5) * 0.055);
          diffuseColor.rgb += ridgeLift * noiseMask;

          // Wet ground — darken albedo and pull a touch of saturation up so
          // soaked dirt/grass reads correctly. Single uniform, no extra textures.
          // 0.78 multiplier at full rain matches the look of damp earth without
          // crushing color into mud.
          if (uWetness > 0.001) {
            float wet = uWetness;
            // Wetness lingers in low spots (dark luminance) more than highlights.
            float wetMask = mix(0.6, 1.0, smoothstep(0.05, 0.4, lum));
            diffuseColor.rgb *= mix(1.0, 0.78, wet * wetMask);
            // Slight cool tint on wet surfaces — water absorbs warm wavelengths.
            diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.94, 0.98, 1.04), wet * 0.5);
          }
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

          // Cloud shadows — drift along wind direction; reuses terrainFBM/terrainNoise.
          // Uniform branch is free (all threads take same path), so when toggle is off
          // cost collapses to a single comparison per fragment.
          if (uCloudStrength > 0.001) {
            vec2 _cloudP = vWorldPos.xz * 0.013 - uCloudWindDir * uCloudTime * 0.6;
            float _cloud = terrainFBM(_cloudP);
            _cloud += terrainNoise(_cloudP * 2.7 + 13.7) * 0.25;
            // Threshold so most ground stays sunlit; soft edges so patches feel volumetric
            float _cloudMask = smoothstep(0.42, 0.72, _cloud);
            directLight.color *= 1.0 - _cloudMask * uCloudStrength;
          }
        }`
      );
    };
    return mat;
  }, []);

  // Flora & fauna geometries + materials (~75 assets) — extracted into a hook
  // so that climate-tinted materials get properly disposed when the palette
  // changes (Three.js materials hold WebGL state outside JS GC).
  const {
    treeTrunkGeometry, treeLeavesGeometry,
    treeTrunkMaterial, treeLeavesMaterial,
    deadTreeMaterial,
    palmTrunkGeometry, palmFrondGeometry,
    palmTrunkMaterial, palmFrondMaterial,
    broadleafTrunkGeometry, broadleafCanopyGeometry,
    broadleafTrunkMaterial, broadleafCanopyMaterial,
    baobabTrunkGeometry, baobabCanopyGeometry,
    baobabTrunkMaterial, baobabCanopyMaterial,
    acaciaTrunkGeometry, acaciaCanopyGeometry,
    acaciaTrunkMaterial, acaciaCanopyMaterial,
    mangroveRootGeometry, mangroveCanopyGeometry,
    mangroveRootMaterial, mangroveCanopyMaterial,
    reedBedGeometry, reedBedMaterial,
    siltPatchGeometry, siltPatchMaterial,
    saltStainGeometry, saltStainMaterial,
    cactusGeometry, cactusMaterial,
    thornbushGeometry, thornbushMaterial,
    driftwoodGeometry, driftwoodMaterial,
    beachRockGeometry, beachRockMaterial,
    riceShootGeometry, riceShootMaterial,
    cypressTrunkGeometry, cypressCanopyGeometry,
    cypressTrunkMaterial, cypressCanopyMaterial,
    orangeTrunkGeometry, orangeCanopyGeometry,
    orangeTrunkMaterial, orangeCanopyMaterial,
    datePalmTrunkGeometry, datePalmFrondGeometry,
    datePalmTrunkMaterial, datePalmFrondMaterial,
    bambooGeometry, bambooMaterial,
    willowTrunkGeometry, willowCanopyGeometry,
    willowTrunkMaterial, willowCanopyMaterial,
    cherryTrunkGeometry, cherryCanopyGeometry,
    cherryTrunkMaterial, cherryCanopyMaterial,
    oakTrunkGeometry, oakCanopyGeometry,
    oakTrunkMaterial, oakCanopyMaterial,
    crabGeometry, crabMaterial,
    fishGeometry, fishMaterial,
    turtleGeometry, turtleMaterial,
    brainCoralGeo, brainCoralMat,
    stagCoralGeo, stagCoralMat,
    fanCoralGeo, fanCoralMat,
    gullGeometry, gullMaterial,
  } = useFloraAssets(waterPaletteId);

  const sunLightRef = useRef<THREE.DirectionalLight>(null);
  const hemiLightRef = useRef<THREE.HemisphereLight>(null);
  const trunkMeshRef = useRef<THREE.InstancedMesh>(null);
  const leavesMeshRef = useRef<THREE.InstancedMesh>(null);
  const deadTreeMeshRef = useRef<THREE.InstancedMesh>(null);
  const palmTrunkMeshRef = useRef<THREE.InstancedMesh>(null);
  const palmFrondMeshRef = useRef<THREE.InstancedMesh>(null);
  const broadleafTrunkMeshRef = useRef<THREE.InstancedMesh>(null);
  const broadleafCanopyMeshRef = useRef<THREE.InstancedMesh>(null);
  const baobabTrunkMeshRef = useRef<THREE.InstancedMesh>(null);
  const baobabCanopyMeshRef = useRef<THREE.InstancedMesh>(null);
  const acaciaTrunkMeshRef = useRef<THREE.InstancedMesh>(null);
  const acaciaCanopyMeshRef = useRef<THREE.InstancedMesh>(null);
  const mangroveRootMeshRef = useRef<THREE.InstancedMesh>(null);
  const mangroveCanopyMeshRef = useRef<THREE.InstancedMesh>(null);
  const cypressTrunkMeshRef = useRef<THREE.InstancedMesh>(null);
  const cypressCanopyMeshRef = useRef<THREE.InstancedMesh>(null);
  const datePalmTrunkMeshRef = useRef<THREE.InstancedMesh>(null);
  const datePalmFrondMeshRef = useRef<THREE.InstancedMesh>(null);
  const bambooMeshRef = useRef<THREE.InstancedMesh>(null);
  const willowTrunkMeshRef = useRef<THREE.InstancedMesh>(null);
  const willowCanopyMeshRef = useRef<THREE.InstancedMesh>(null);
  const cherryTrunkMeshRef = useRef<THREE.InstancedMesh>(null);
  const cherryCanopyMeshRef = useRef<THREE.InstancedMesh>(null);
  const orangeTrunkMeshRef = useRef<THREE.InstancedMesh>(null);
  const orangeCanopyMeshRef = useRef<THREE.InstancedMesh>(null);
  const oakTrunkMeshRef = useRef<THREE.InstancedMesh>(null);
  const oakCanopyMeshRef = useRef<THREE.InstancedMesh>(null);
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
  const fishShimmerCol = useRef(new THREE.Color());
  const turtleShimmerCol = useRef(new THREE.Color());
  const coralBrainRef = useRef<THREE.InstancedMesh>(null);
  const coralStagRef = useRef<THREE.InstancedMesh>(null);
  const coralFanRef = useRef<THREE.InstancedMesh>(null);
  const gullMeshRef = useRef<THREE.InstancedMesh>(null);
  const dummyRef = useRef(new THREE.Object3D());
  const palmTopLocalRef = useRef(new THREE.Vector3());
  const palmEulerRef = useRef(new THREE.Euler());
  const palmWindVectorRef = useRef(new THREE.Vector2());
  const fallDirRef = useRef(new THREE.Vector3());
  const fallAxisRef = useRef(new THREE.Vector3());
  const fallQuatRef = useRef(new THREE.Quaternion());
  const palmAnimatedIndicesRef = useRef(new Set<number>());
  const activeTreeShakeRef = useRef(new Set<string>());
  const nextTreeShakeRef = useRef(new Set<string>());
  const palmSwayAccum = useRef(0);
  const respawnCheckAccum = useRef(0);

  function setFelledVerticalMesh(
    mesh: THREE.InstancedMesh,
    index: number,
    baseX: number,
    baseY: number,
    baseZ: number,
    scale: number,
    fallAngle: number,
    forward: number,
    lift: number,
  ) {
    const dummy = dummyRef.current;
    const fallDir = fallDirRef.current;
    const fallAxis = fallAxisRef.current;
    const fallQuat = fallQuatRef.current;
    fallDir.set(Math.sin(fallAngle), 0, Math.cos(fallAngle));
    fallAxis.set(fallDir.z, 0, -fallDir.x).normalize();
    fallQuat.setFromAxisAngle(fallAxis, Math.PI * 0.48);
    dummy.position.set(
      baseX + fallDir.x * forward * scale,
      baseY + lift * scale,
      baseZ + fallDir.z * forward * scale,
    );
    dummy.scale.set(scale, scale, scale);
    dummy.quaternion.copy(fallQuat);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  }

  function setTreeMatricesAt(tree: { position: [number, number, number], scale: number }, index: number, xOffset = 0, zOffset = 0) {
    if (!trunkMeshRef.current || !leavesMeshRef.current) return;
    const felled = getFelledTreeState('tree', index);
    if (felled) {
      setFelledVerticalMesh(trunkMeshRef.current, index, tree.position[0], tree.position[1], tree.position[2], tree.scale, felled.fallAngle, 0.95, 0.22);
      setFelledVerticalMesh(leavesMeshRef.current, index, tree.position[0], tree.position[1], tree.position[2], tree.scale, felled.fallAngle, 2.1, 0.55);
      return;
    }
    const dummy = dummyRef.current;
    dummy.position.set(tree.position[0] + xOffset, tree.position[1] + 1 * tree.scale, tree.position[2] + zOffset);
    dummy.scale.set(tree.scale, tree.scale, tree.scale);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    trunkMeshRef.current.setMatrixAt(index, dummy.matrix);

    dummy.position.set(tree.position[0] + xOffset, tree.position[1] + 3 * tree.scale, tree.position[2] + zOffset);
    dummy.updateMatrix();
    leavesMeshRef.current.setMatrixAt(index, dummy.matrix);
  }

  function setBroadleafMatricesAt(tree: { position: [number, number, number], scale: number }, index: number, xOffset = 0, zOffset = 0) {
    if (!broadleafTrunkMeshRef.current || !broadleafCanopyMeshRef.current) return;
    const felled = getFelledTreeState('broadleaf', index);
    if (felled) {
      setFelledVerticalMesh(broadleafTrunkMeshRef.current, index, tree.position[0], tree.position[1], tree.position[2], tree.scale, felled.fallAngle, 1.05, 0.28);
      setFelledVerticalMesh(broadleafCanopyMeshRef.current, index, tree.position[0], tree.position[1], tree.position[2], tree.scale, felled.fallAngle, 2.0, 0.75);
      return;
    }
    const dummy = dummyRef.current;
    dummy.position.set(tree.position[0] + xOffset, tree.position[1] + 1.25 * tree.scale, tree.position[2] + zOffset);
    dummy.scale.set(tree.scale, tree.scale, tree.scale);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    broadleafTrunkMeshRef.current.setMatrixAt(index, dummy.matrix);

    dummy.position.set(tree.position[0] + xOffset, tree.position[1] + 3.0 * tree.scale, tree.position[2] + zOffset);
    dummy.updateMatrix();
    broadleafCanopyMeshRef.current.setMatrixAt(index, dummy.matrix);
  }

  function setBaobabMatricesAt(tree: { position: [number, number, number], scale: number, rotation: number }, index: number, xOffset = 0, zOffset = 0) {
    if (!baobabTrunkMeshRef.current || !baobabCanopyMeshRef.current) return;
    const felled = getFelledTreeState('baobab', index);
    if (felled) {
      setFelledVerticalMesh(baobabTrunkMeshRef.current, index, tree.position[0], tree.position[1], tree.position[2], tree.scale, felled.fallAngle, 1.0, 0.42);
      setFelledVerticalMesh(baobabCanopyMeshRef.current, index, tree.position[0], tree.position[1], tree.position[2], tree.scale, felled.fallAngle, 1.8, 0.7);
      return;
    }
    const dummy = dummyRef.current;
    dummy.position.set(tree.position[0] + xOffset, tree.position[1] + 1.75 * tree.scale, tree.position[2] + zOffset);
    dummy.scale.set(tree.scale, tree.scale, tree.scale);
    dummy.rotation.set(0, tree.rotation, 0);
    dummy.updateMatrix();
    baobabTrunkMeshRef.current.setMatrixAt(index, dummy.matrix);

    dummy.position.set(tree.position[0] + xOffset, tree.position[1], tree.position[2] + zOffset);
    dummy.updateMatrix();
    baobabCanopyMeshRef.current.setMatrixAt(index, dummy.matrix);
  }

  function setAcaciaMatricesAt(tree: { position: [number, number, number], scale: number, rotation: number }, index: number, xOffset = 0, zOffset = 0) {
    if (!acaciaTrunkMeshRef.current || !acaciaCanopyMeshRef.current) return;
    const felled = getFelledTreeState('acacia', index);
    if (felled) {
      setFelledVerticalMesh(acaciaTrunkMeshRef.current, index, tree.position[0], tree.position[1], tree.position[2], tree.scale, felled.fallAngle, 0.95, 0.28);
      setFelledVerticalMesh(acaciaCanopyMeshRef.current, index, tree.position[0], tree.position[1], tree.position[2], tree.scale, felled.fallAngle, 1.75, 0.55);
      return;
    }
    const dummy = dummyRef.current;
    dummy.position.set(tree.position[0] + xOffset, tree.position[1] + 1.5 * tree.scale, tree.position[2] + zOffset);
    dummy.scale.set(tree.scale, tree.scale, tree.scale);
    dummy.rotation.set(0, tree.rotation, 0);
    dummy.updateMatrix();
    acaciaTrunkMeshRef.current.setMatrixAt(index, dummy.matrix);

    dummy.position.set(tree.position[0] + xOffset, tree.position[1], tree.position[2] + zOffset);
    dummy.updateMatrix();
    acaciaCanopyMeshRef.current.setMatrixAt(index, dummy.matrix);
  }

  function setMangroveMatricesAt(tree: { position: [number, number, number], scale: number, rotation: number }, index: number, xOffset = 0, zOffset = 0) {
    if (!mangroveRootMeshRef.current || !mangroveCanopyMeshRef.current) return;
    const felled = getFelledTreeState('mangrove', index);
    if (felled) {
      setFelledVerticalMesh(mangroveRootMeshRef.current, index, tree.position[0], tree.position[1], tree.position[2], tree.scale, felled.fallAngle, 0.8, 0.18);
      setFelledVerticalMesh(mangroveCanopyMeshRef.current, index, tree.position[0], tree.position[1], tree.position[2], tree.scale, felled.fallAngle, 1.35, 0.42);
      return;
    }
    const dummy = dummyRef.current;
    dummy.position.set(tree.position[0] + xOffset, tree.position[1], tree.position[2] + zOffset);
    dummy.scale.set(tree.scale, tree.scale, tree.scale);
    dummy.rotation.set(0, tree.rotation, 0);
    dummy.updateMatrix();
    mangroveRootMeshRef.current.setMatrixAt(index, dummy.matrix);
    mangroveCanopyMeshRef.current.setMatrixAt(index, dummy.matrix);
  }

  function setCypressMatricesAt(tree: { position: [number, number, number], scale: number }, index: number, xOffset = 0, zOffset = 0) {
    if (!cypressTrunkMeshRef.current || !cypressCanopyMeshRef.current) return;
    const felled = getFelledTreeState('cypress', index);
    if (felled) {
      setFelledVerticalMesh(cypressTrunkMeshRef.current, index, tree.position[0], tree.position[1], tree.position[2], tree.scale, felled.fallAngle, 1.0, 0.20);
      setFelledVerticalMesh(cypressCanopyMeshRef.current, index, tree.position[0], tree.position[1], tree.position[2], tree.scale, felled.fallAngle, 5.0, 0.85);
      return;
    }
    const dummy = dummyRef.current;
    // Trunk and canopy geometries are both authored from y=0 upward — share matrix.
    dummy.position.set(tree.position[0] + xOffset, tree.position[1], tree.position[2] + zOffset);
    dummy.scale.set(tree.scale, tree.scale, tree.scale);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    cypressTrunkMeshRef.current.setMatrixAt(index, dummy.matrix);
    cypressCanopyMeshRef.current.setMatrixAt(index, dummy.matrix);
  }

  function setOrangeMatricesAt(tree: { position: [number, number, number], scale: number, rotation: number }, index: number, xOffset = 0, zOffset = 0) {
    if (!orangeTrunkMeshRef.current || !orangeCanopyMeshRef.current) return;
    const felled = getFelledTreeState('orange', index);
    if (felled) {
      setFelledVerticalMesh(orangeTrunkMeshRef.current, index, tree.position[0], tree.position[1], tree.position[2], tree.scale, felled.fallAngle, 0.85, 0.20);
      setFelledVerticalMesh(orangeCanopyMeshRef.current, index, tree.position[0], tree.position[1], tree.position[2], tree.scale, felled.fallAngle, 1.5, 0.45);
      return;
    }
    const dummy = dummyRef.current;
    dummy.position.set(tree.position[0] + xOffset, tree.position[1], tree.position[2] + zOffset);
    dummy.scale.set(tree.scale, tree.scale, tree.scale);
    dummy.rotation.set(0, tree.rotation, 0);
    dummy.updateMatrix();
    orangeTrunkMeshRef.current.setMatrixAt(index, dummy.matrix);
    // Canopy sits on trunk top (~y=1.4 in geometry units) — geometry already
    // baked at the right offset.
    dummy.position.set(tree.position[0] + xOffset, tree.position[1] + 1.4 * tree.scale, tree.position[2] + zOffset);
    dummy.updateMatrix();
    orangeCanopyMeshRef.current.setMatrixAt(index, dummy.matrix);
  }

  function setDatePalmMatrixAt(palm: PalmEntry, index: number, trunkPitchOffset = 0, trunkRollOffset = 0, frondPitchOffset = 0, frondRollOffset = 0) {
    if (!datePalmTrunkMeshRef.current || !datePalmFrondMeshRef.current) return;
    const felled = getFelledTreeState('datePalm', index);
    if (felled) {
      setFelledVerticalMesh(datePalmTrunkMeshRef.current, index, palm.position[0], palm.position[1], palm.position[2], palm.scale, felled.fallAngle, 2.5, 0.22);
      setFelledVerticalMesh(datePalmFrondMeshRef.current, index, palm.position[0], palm.position[1], palm.position[2], palm.scale, felled.fallAngle, 5.0, 0.55);
      return;
    }
    const dummy = dummyRef.current;
    const s = palm.scale;
    dummy.position.set(palm.position[0], palm.position[1], palm.position[2]);
    dummy.scale.set(s, s, s);
    dummy.rotation.set(palm.lean + trunkPitchOffset, palm.rotation, trunkRollOffset);
    dummy.updateMatrix();
    datePalmTrunkMeshRef.current.setMatrixAt(index, dummy.matrix);

    dummy.position.set(palm.position[0], palm.position[1] + 5 * s, palm.position[2]);
    dummy.scale.set(s, s, s);
    dummy.rotation.set(palm.lean * 0.4 + frondPitchOffset, palm.rotation, frondRollOffset);
    dummy.updateMatrix();
    datePalmFrondMeshRef.current.setMatrixAt(index, dummy.matrix);
  }

  function setBambooMatrixAt(b: { position: [number, number, number], scale: number, rotation: number }, index: number, xOffset = 0, zOffset = 0) {
    if (!bambooMeshRef.current) return;
    const felled = getFelledTreeState('bamboo', index);
    if (felled) {
      setFelledVerticalMesh(bambooMeshRef.current, index, b.position[0], b.position[1], b.position[2], b.scale, felled.fallAngle, 1.6, 0.24);
      return;
    }
    const dummy = dummyRef.current;
    dummy.position.set(b.position[0] + xOffset, b.position[1], b.position[2] + zOffset);
    dummy.scale.set(b.scale, b.scale, b.scale);
    dummy.rotation.set(0, b.rotation, 0);
    dummy.updateMatrix();
    bambooMeshRef.current.setMatrixAt(index, dummy.matrix);
  }

  function setWillowMatricesAt(tree: { position: [number, number, number], scale: number, rotation: number }, index: number, xOffset = 0, zOffset = 0) {
    if (!willowTrunkMeshRef.current || !willowCanopyMeshRef.current) return;
    const felled = getFelledTreeState('willow', index);
    if (felled) {
      setFelledVerticalMesh(willowTrunkMeshRef.current, index, tree.position[0], tree.position[1], tree.position[2], tree.scale, felled.fallAngle, 1.0, 0.26);
      setFelledVerticalMesh(willowCanopyMeshRef.current, index, tree.position[0], tree.position[1], tree.position[2], tree.scale, felled.fallAngle, 1.8, 0.55);
      return;
    }
    const dummy = dummyRef.current;
    dummy.position.set(tree.position[0] + xOffset, tree.position[1] + 1.1 * tree.scale, tree.position[2] + zOffset);
    dummy.scale.set(tree.scale, tree.scale, tree.scale);
    dummy.rotation.set(0, tree.rotation, 0);
    dummy.updateMatrix();
    willowTrunkMeshRef.current.setMatrixAt(index, dummy.matrix);

    dummy.position.set(tree.position[0] + xOffset, tree.position[1] + 2.3 * tree.scale, tree.position[2] + zOffset);
    dummy.updateMatrix();
    willowCanopyMeshRef.current.setMatrixAt(index, dummy.matrix);
  }

  function setOakMatricesAt(tree: { position: [number, number, number], scale: number, rotation: number }, index: number, xOffset = 0, zOffset = 0) {
    if (!oakTrunkMeshRef.current || !oakCanopyMeshRef.current) return;
    const felled = getFelledTreeState('oak', index);
    if (felled) {
      setFelledVerticalMesh(oakTrunkMeshRef.current, index, tree.position[0], tree.position[1], tree.position[2], tree.scale, felled.fallAngle, 1.5, 0.45);
      setFelledVerticalMesh(oakCanopyMeshRef.current, index, tree.position[0], tree.position[1], tree.position[2], tree.scale, felled.fallAngle, 2.5, 0.85);
      return;
    }
    const dummy = dummyRef.current;
    // Trunk geometry has its base baked at y=0 (translated up by 1.5 inside
    // the cylinder), so position the trunk at the terrain height directly.
    dummy.position.set(tree.position[0] + xOffset, tree.position[1], tree.position[2] + zOffset);
    dummy.scale.set(tree.scale, tree.scale, tree.scale);
    dummy.rotation.set(0, tree.rotation, 0);
    dummy.updateMatrix();
    oakTrunkMeshRef.current.setMatrixAt(index, dummy.matrix);
    // Canopy sits on top of the 3-unit trunk.
    dummy.position.set(tree.position[0] + xOffset, tree.position[1] + 3.0 * tree.scale, tree.position[2] + zOffset);
    dummy.updateMatrix();
    oakCanopyMeshRef.current.setMatrixAt(index, dummy.matrix);
  }

  function setCherryMatricesAt(tree: { position: [number, number, number], scale: number }, index: number, xOffset = 0, zOffset = 0) {
    if (!cherryTrunkMeshRef.current || !cherryCanopyMeshRef.current) return;
    const felled = getFelledTreeState('cherry', index);
    if (felled) {
      setFelledVerticalMesh(cherryTrunkMeshRef.current, index, tree.position[0], tree.position[1], tree.position[2], tree.scale, felled.fallAngle, 0.95, 0.24);
      setFelledVerticalMesh(cherryCanopyMeshRef.current, index, tree.position[0], tree.position[1], tree.position[2], tree.scale, felled.fallAngle, 1.7, 0.55);
      return;
    }
    const dummy = dummyRef.current;
    dummy.position.set(tree.position[0] + xOffset, tree.position[1] + 1.0 * tree.scale, tree.position[2] + zOffset);
    dummy.scale.set(tree.scale, tree.scale, tree.scale);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    cherryTrunkMeshRef.current.setMatrixAt(index, dummy.matrix);

    dummy.position.set(tree.position[0] + xOffset, tree.position[1] + 2.6 * tree.scale, tree.position[2] + zOffset);
    dummy.updateMatrix();
    cherryCanopyMeshRef.current.setMatrixAt(index, dummy.matrix);
  }

  function setPalmMatrixAt(
    palm: PalmEntry,
    index: number,
    trunkPitchOffset = 0,
    trunkRollOffset = 0,
    frondPitchOffset = 0,
    frondRollOffset = 0
  ) {
    if (!palmTrunkMeshRef.current || !palmFrondMeshRef.current) return;
    const felled = getFelledTreeState('palm', index);
    if (felled) {
      setFelledVerticalMesh(palmTrunkMeshRef.current, index, palm.position[0], palm.position[1], palm.position[2], palm.scale, felled.fallAngle, 2.0, 0.2);
      setFelledVerticalMesh(palmFrondMeshRef.current, index, palm.position[0], palm.position[1], palm.position[2], palm.scale, felled.fallAngle, 4.0, 0.48);
      return;
    }
    const dummy = dummyRef.current;
    const topLocal = palmTopLocalRef.current;
    const palmEuler = palmEulerRef.current;
    const s = palm.scale;
    const damage = getPalmDamage(index);
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
    dummy.position.set(
      bx + topLocal.x + damage * s * 0.18,
      by + topLocal.y - damage * s * 0.45,
      bz + topLocal.z,
    );
    dummy.scale.set(
      s * (1 - damage * 0.16),
      s * (1 - damage * 0.42),
      s * (1 - damage * 0.22),
    );
    dummy.rotation.set(
      palm.lean * 0.3 + frondPitchOffset + damage * 0.7,
      palm.rotation + damage * 0.18,
      frondRollOffset + damage * 0.28,
    );
    dummy.updateMatrix();
    palmFrondMeshRef.current.setMatrixAt(index, dummy.matrix);
  }

  useEffect(() => {
    const dummy = dummyRef.current;

    // Per-instance color jitter — multiplies the material base color by a
    // near-1 RGB so identical canopies stop reading as clones. Deterministic
    // hash from the instance index keeps results stable across re-populations.
    const jitterCol = new THREE.Color();
    const applyFoliageJitter = (
      mesh: THREE.InstancedMesh,
      count: number,
      valRange = 0.18,
      hueRange = 0.06,
    ) => {
      for (let i = 0; i < count; i++) {
        const r1 = Math.sin(i * 127.1 + 311.7) * 43758.5453;
        const r2 = Math.sin(i * 269.5 + 183.3) * 43758.5453;
        const v = (r1 - Math.floor(r1)) - 0.5;
        const u = (r2 - Math.floor(r2)) - 0.5;
        const value = 1 + v * valRange;
        const tilt = u * hueRange;
        jitterCol.setRGB(value * (1 + tilt), value, value * (1 - tilt));
        mesh.setColorAt(i, jitterCol);
      }
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    };

    if (trunkMeshRef.current && leavesMeshRef.current) {
      treeData.forEach((tree, i) => {
        setTreeMatricesAt(tree, i);
      });
      trunkMeshRef.current.instanceMatrix.needsUpdate = true;
      leavesMeshRef.current.instanceMatrix.needsUpdate = true;
      applyFoliageJitter(leavesMeshRef.current, treeData.length);
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

    // Broadleaf trees — rounded canopy tropical hardwoods
    if (broadleafTrunkMeshRef.current && broadleafCanopyMeshRef.current) {
      broadleafData.forEach((tree, i) => {
        setBroadleafMatricesAt(tree, i);
      });
      broadleafTrunkMeshRef.current.instanceMatrix.needsUpdate = true;
      broadleafCanopyMeshRef.current.instanceMatrix.needsUpdate = true;
      applyFoliageJitter(broadleafCanopyMeshRef.current, broadleafData.length);
    }

    // Baobab trees — fat trunk, sparse crown
    if (baobabTrunkMeshRef.current && baobabCanopyMeshRef.current) {
      baobabData.forEach((tree, i) => {
        setBaobabMatricesAt(tree, i);
      });
      baobabTrunkMeshRef.current.instanceMatrix.needsUpdate = true;
      baobabCanopyMeshRef.current.instanceMatrix.needsUpdate = true;
      // Baobab crowns are sparse and dusty — narrower hue tilt, wider value range
      applyFoliageJitter(baobabCanopyMeshRef.current, baobabData.length, 0.22, 0.04);
    }

    // Umbrella acacia — thin trunk, flat disc canopy
    if (acaciaTrunkMeshRef.current && acaciaCanopyMeshRef.current) {
      acaciaData.forEach((tree, i) => {
        setAcaciaMatricesAt(tree, i);
      });
      acaciaTrunkMeshRef.current.instanceMatrix.needsUpdate = true;
      acaciaCanopyMeshRef.current.instanceMatrix.needsUpdate = true;
      applyFoliageJitter(acaciaCanopyMeshRef.current, acaciaData.length, 0.20, 0.05);
    }

    // Palm trees — trunk and fronds as separate instanced meshes (like regular trees)
    if (palmTrunkMeshRef.current && palmFrondMeshRef.current) {
      palmData.forEach((palm, i) => {
        setPalmMatrixAt(palm, i);
      });
      palmTrunkMeshRef.current.instanceMatrix.needsUpdate = true;
      palmFrondMeshRef.current.instanceMatrix.needsUpdate = true;
      applyFoliageJitter(palmFrondMeshRef.current, palmData.length, 0.16, 0.07);
    }

    if (mangroveRootMeshRef.current && mangroveCanopyMeshRef.current) {
      mangroveData.forEach((mangrove, i) => {
        setMangroveMatricesAt(mangrove, i);
      });
      mangroveRootMeshRef.current.instanceMatrix.needsUpdate = true;
      mangroveCanopyMeshRef.current.instanceMatrix.needsUpdate = true;
      applyFoliageJitter(mangroveCanopyMeshRef.current, mangroveData.length, 0.14, 0.05);
    }

    if (cypressTrunkMeshRef.current && cypressCanopyMeshRef.current) {
      cypressData.forEach((tree, i) => setCypressMatricesAt(tree, i));
      cypressTrunkMeshRef.current.instanceMatrix.needsUpdate = true;
      cypressCanopyMeshRef.current.instanceMatrix.needsUpdate = true;
      applyFoliageJitter(cypressCanopyMeshRef.current, cypressData.length, 0.14, 0.04);
    }

    if (datePalmTrunkMeshRef.current && datePalmFrondMeshRef.current) {
      datePalmData.forEach((palm, i) => setDatePalmMatrixAt(palm, i));
      datePalmTrunkMeshRef.current.instanceMatrix.needsUpdate = true;
      datePalmFrondMeshRef.current.instanceMatrix.needsUpdate = true;
      applyFoliageJitter(datePalmFrondMeshRef.current, datePalmData.length, 0.16, 0.06);
    }

    if (bambooMeshRef.current) {
      bambooData.forEach((b, i) => setBambooMatrixAt(b, i));
      bambooMeshRef.current.instanceMatrix.needsUpdate = true;
      applyFoliageJitter(bambooMeshRef.current, bambooData.length, 0.20, 0.08);
    }

    if (willowTrunkMeshRef.current && willowCanopyMeshRef.current) {
      willowData.forEach((tree, i) => setWillowMatricesAt(tree, i));
      willowTrunkMeshRef.current.instanceMatrix.needsUpdate = true;
      willowCanopyMeshRef.current.instanceMatrix.needsUpdate = true;
      applyFoliageJitter(willowCanopyMeshRef.current, willowData.length, 0.18, 0.06);
    }

    if (cherryTrunkMeshRef.current && cherryCanopyMeshRef.current) {
      cherryData.forEach((tree, i) => setCherryMatricesAt(tree, i));
      cherryTrunkMeshRef.current.instanceMatrix.needsUpdate = true;
      cherryCanopyMeshRef.current.instanceMatrix.needsUpdate = true;
      // Tighter jitter on cherry — pink should stay pink, not greenish
      applyFoliageJitter(cherryCanopyMeshRef.current, cherryData.length, 0.10, 0.03);
    }

    if (orangeTrunkMeshRef.current && orangeCanopyMeshRef.current) {
      orangeData.forEach((tree, i) => setOrangeMatricesAt(tree, i));
      orangeTrunkMeshRef.current.instanceMatrix.needsUpdate = true;
      orangeCanopyMeshRef.current.instanceMatrix.needsUpdate = true;
      // Skip jitter on orange — vertex colors carry the leaf/fruit split,
      // and a hue tilt would muddy the orange.
    }

    if (oakTrunkMeshRef.current && oakCanopyMeshRef.current) {
      oakData.forEach((tree, i) => setOakMatricesAt(tree, i));
      oakTrunkMeshRef.current.instanceMatrix.needsUpdate = true;
      oakCanopyMeshRef.current.instanceMatrix.needsUpdate = true;
      applyFoliageJitter(oakCanopyMeshRef.current, oakData.length, 0.16, 0.05);
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
      applyFoliageJitter(reedBedMeshRef.current, reedBedData.length, 0.20, 0.05);
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
      applyFoliageJitter(thornbushMeshRef.current, thornbushData.length, 0.22, 0.04);
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
      applyFoliageJitter(riceShootMeshRef.current, riceShootData.length, 0.18, 0.06);
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

  }, [treeData, deadTreeData, broadleafData, baobabData, acaciaData, palmData, mangroveData, cypressData, datePalmData, bambooData, willowData, cherryData, orangeData, oakData, reedBedData, siltPatchData, saltStainData, cactusData, thornbushData, riceShootData, driftwoodData, beachRockData, crabData, coralData, fishData, turtleData, gullData]);

  // Stabilize shadow camera — snap target to texel grid to prevent shimmer,
  // and move the light position with the player so shadow direction stays constant.
  // Uses active player pos (walker when disembarked, ship otherwise) so shadows
  // follow whichever avatar the camera is on.
  useFrame((state) => {
    const light = sunLightRef.current;
    if (!light || !light.shadow?.camera) return;
    const playerPos = getActivePlayerPos();

    // Feed player position to terrain shader for distance-based shadow fade.
    // Cloud shadow uniforms reuse the existing wind direction/speed; strength
    // is gated by the renderDebug.cloudShadows toggle.
    if (terrainShaderUniformsRef.current) {
      const u = terrainShaderUniformsRef.current;
      u.uPlayerPos.value.set(playerPos[0], playerPos[1], playerPos[2]);
      const storeState = useGameStore.getState();
      const cloudsOn = storeState.renderDebug.cloudShadows;
      const rainOn = storeState.renderDebug.rain;
      const { windDirection, windSpeed } = storeState;
      const weatherIntensity = storeState.weather.intensity;
      // Dev rain toggle (forces full strength) overrides the eased value so the
      // wet-ground look matches what the streak overlay does.
      const effectiveWetness = rainOn ? Math.max(weatherIntensity, 1) : weatherIntensity;
      u.uCloudTime.value = state.clock.elapsedTime;
      u.uCloudWindDir.value.set(Math.sin(windDirection), Math.cos(windDirection));
      // Strength scales with wind speed so calm days have weaker, slower shadows.
      // Peak ~0.55: cloud patches darken sunlit ground by up to 55%.
      // Rain also boosts cloud darkness — overcast skies cast deeper shadow patches.
      const cloudBase = cloudsOn ? 0.35 + 0.20 * THREE.MathUtils.clamp(windSpeed, 0, 1) : 0;
      u.uCloudStrength.value = Math.min(0.85, cloudBase + effectiveWetness * 0.25);
      u.uWetness.value = effectiveWetness;
    }

    // Dim the scene lights with weather. The LUT lerps hue/saturation; this
    // pulls actual luminance down so heavy rain reads as overcast rather than
    // "sunny day with a green filter." Sun takes a bigger hit than ambient.
    {
      const storeState = useGameStore.getState();
      const rainOn = storeState.renderDebug.rain;
      const wi = storeState.weather.intensity;
      const w = rainOn ? Math.max(wi, 1) : wi;
      const sun = sunLightRef.current;
      const hemi = hemiLightRef.current;
      if (sun) sun.intensity = sunIntensity * (1.0 - 0.38 * w);
      if (hemi) hemi.intensity = ambientIntensity * (1.0 - 0.12 * w);
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
  const ANIM_RANGE_SQ = 100 * 100;
  const PALM_SWAY_RANGE_SQ = 100 * 100;

  useFrame((state, delta) => {
    updateWindUniforms(state.clock.elapsedTime);
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
      const col = fishShimmerCol.current;
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
        // Shimmer — small fish flash brightly, sharks barely glint
        const shimmerAmp = s < 1.2 ? 0.14 : s > 2.5 ? 0.03 : 0.08;
        const shimmerFactor = 1.0 + Math.sin(time * 3.0 + i * 1.7 + fish.rotation) * shimmerAmp;
        col.setRGB(
          fish.color[0] * shimmerFactor,
          fish.color[1] * shimmerFactor,
          fish.color[2] * shimmerFactor,
        );
        fishMeshRef.current!.setColorAt(i, col);
      });
      if (anyUpdated) {
        fishMeshRef.current.instanceMatrix.needsUpdate = true;
        if (fishMeshRef.current.instanceColor) fishMeshRef.current.instanceColor.needsUpdate = true;
      }
    }

    // Turtles — slow graceful glide with flipper-stroke roll
    if (turtleMeshRef.current) {
      const storeShoals = useGameStore.getState().fishShoals;
      const tCol = turtleShimmerCol.current;
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
        // Gentle shimmer — wet shell catching light
        const tShimmer = 1.0 + Math.sin(time * 1.5 + i * 2.1) * 0.04;
        tCol.setRGB(
          turtle.color[0] * tShimmer,
          turtle.color[1] * tShimmer,
          turtle.color[2] * tShimmer,
        );
        turtleMeshRef.current!.setColorAt(i, tCol);
      });
      if (anyUpdated) {
        turtleMeshRef.current.instanceMatrix.needsUpdate = true;
        if (turtleMeshRef.current.instanceColor) turtleMeshRef.current.instanceColor.needsUpdate = true;
      }
    }

    if (crabMeshRef.current) {
      let anyUpdated = false;
      const collected = getCollectedCrabs();
      crabData.forEach((crab, i) => {
        if (collected.has(i)) {
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

  useFrame(() => {
    const now = Date.now() * 0.001;
    const active = activeTreeShakeRef.current;
    const next = nextTreeShakeRef.current;
    next.clear();

    let treeDirty = false;
    let broadleafDirty = false;
    let palmDirty = false;
    let baobabDirty = false;
    let acaciaDirty = false;
    let mangroveDirty = false;
    let cypressDirty = false;
    let datePalmDirty = false;
    let bambooDirty = false;
    let willowDirty = false;
    let cherryDirty = false;
    let orangeDirty = false;
    let oakDirty = false;

    for (const shake of treeShakes) {
      const age = now - shake.time;
      if (age < 0 || age >= TREE_SHAKE_DURATION) continue;
      const decay = 1 - age / TREE_SHAKE_DURATION;
      const sway = decay * shake.intensity;
      const key = `${shake.kind}:${shake.index}`;
      next.add(key);

      switch (shake.kind) {
        case 'tree': {
          const tree = treeData[shake.index];
          if (!tree) break;
          const xOffset = Math.sin(age * 56 + shake.index * 0.43) * tree.scale * 0.16 * sway;
          const zOffset = Math.cos(age * 49 + shake.index * 0.37) * tree.scale * 0.13 * sway;
          setTreeMatricesAt(tree, shake.index, xOffset, zOffset);
          treeDirty = true;
          break;
        }
        case 'broadleaf': {
          const tree = broadleafData[shake.index];
          if (!tree) break;
          const xOffset = Math.sin(age * 52 + shake.index * 0.31) * tree.scale * 0.18 * sway;
          const zOffset = Math.cos(age * 47 + shake.index * 0.28) * tree.scale * 0.15 * sway;
          setBroadleafMatricesAt(tree, shake.index, xOffset, zOffset);
          broadleafDirty = true;
          break;
        }
        case 'palm': {
          const palm = palmData[shake.index];
          if (!palm) break;
          const pitch = Math.sin(age * 40 + shake.index * 0.51) * 0.18 * sway;
          const roll = Math.cos(age * 36 + shake.index * 0.44) * 0.16 * sway;
          setPalmMatrixAt(palm, shake.index, pitch, roll, pitch * 1.3, roll * 1.35);
          palmDirty = true;
          break;
        }
        case 'baobab': {
          const tree = baobabData[shake.index];
          if (!tree) break;
          const xOffset = Math.sin(age * 44 + shake.index * 0.23) * tree.scale * 0.14 * sway;
          const zOffset = Math.cos(age * 41 + shake.index * 0.19) * tree.scale * 0.12 * sway;
          setBaobabMatricesAt(tree, shake.index, xOffset, zOffset);
          baobabDirty = true;
          break;
        }
        case 'acacia': {
          const tree = acaciaData[shake.index];
          if (!tree) break;
          const xOffset = Math.sin(age * 46 + shake.index * 0.27) * tree.scale * 0.16 * sway;
          const zOffset = Math.cos(age * 42 + shake.index * 0.22) * tree.scale * 0.14 * sway;
          setAcaciaMatricesAt(tree, shake.index, xOffset, zOffset);
          acaciaDirty = true;
          break;
        }
        case 'mangrove': {
          const tree = mangroveData[shake.index];
          if (!tree) break;
          const xOffset = Math.sin(age * 50 + shake.index * 0.29) * tree.scale * 0.12 * sway;
          const zOffset = Math.cos(age * 45 + shake.index * 0.26) * tree.scale * 0.1 * sway;
          setMangroveMatricesAt(tree, shake.index, xOffset, zOffset);
          mangroveDirty = true;
          break;
        }
        case 'cypress': {
          const tree = cypressData[shake.index];
          if (!tree) break;
          const xOffset = Math.sin(age * 58 + shake.index * 0.41) * tree.scale * 0.10 * sway;
          const zOffset = Math.cos(age * 51 + shake.index * 0.35) * tree.scale * 0.08 * sway;
          setCypressMatricesAt(tree, shake.index, xOffset, zOffset);
          cypressDirty = true;
          break;
        }
        case 'datePalm': {
          const palm = datePalmData[shake.index];
          if (!palm) break;
          const pitch = Math.sin(age * 38 + shake.index * 0.49) * 0.14 * sway;
          const roll = Math.cos(age * 34 + shake.index * 0.43) * 0.12 * sway;
          setDatePalmMatrixAt(palm, shake.index, pitch, roll, pitch * 1.2, roll * 1.25);
          datePalmDirty = true;
          break;
        }
        case 'bamboo': {
          const b = bambooData[shake.index];
          if (!b) break;
          // Bamboo whips more violently than rigid trees
          const xOffset = Math.sin(age * 64 + shake.index * 0.33) * b.scale * 0.22 * sway;
          const zOffset = Math.cos(age * 57 + shake.index * 0.29) * b.scale * 0.20 * sway;
          setBambooMatrixAt(b, shake.index, xOffset, zOffset);
          bambooDirty = true;
          break;
        }
        case 'willow': {
          const tree = willowData[shake.index];
          if (!tree) break;
          const xOffset = Math.sin(age * 50 + shake.index * 0.32) * tree.scale * 0.16 * sway;
          const zOffset = Math.cos(age * 45 + shake.index * 0.27) * tree.scale * 0.13 * sway;
          setWillowMatricesAt(tree, shake.index, xOffset, zOffset);
          willowDirty = true;
          break;
        }
        case 'cherry': {
          const tree = cherryData[shake.index];
          if (!tree) break;
          const xOffset = Math.sin(age * 53 + shake.index * 0.30) * tree.scale * 0.17 * sway;
          const zOffset = Math.cos(age * 48 + shake.index * 0.26) * tree.scale * 0.14 * sway;
          setCherryMatricesAt(tree, shake.index, xOffset, zOffset);
          cherryDirty = true;
          break;
        }
        case 'orange': {
          const tree = orangeData[shake.index];
          if (!tree) break;
          const xOffset = Math.sin(age * 56 + shake.index * 0.34) * tree.scale * 0.16 * sway;
          const zOffset = Math.cos(age * 50 + shake.index * 0.28) * tree.scale * 0.13 * sway;
          setOrangeMatricesAt(tree, shake.index, xOffset, zOffset);
          orangeDirty = true;
          break;
        }
        case 'oak': {
          const tree = oakData[shake.index];
          if (!tree) break;
          // Oaks are massive and rigid — small sway amplitude, slower frequency.
          const xOffset = Math.sin(age * 38 + shake.index * 0.21) * tree.scale * 0.10 * sway;
          const zOffset = Math.cos(age * 34 + shake.index * 0.18) * tree.scale * 0.08 * sway;
          setOakMatricesAt(tree, shake.index, xOffset, zOffset);
          oakDirty = true;
          break;
        }
      }
    }

    active.forEach((key) => {
      if (next.has(key)) return;
      const split = key.indexOf(':');
      if (split < 0) return;
      const kind = key.slice(0, split) as TreeImpactKind;
      const index = Number(key.slice(split + 1));
      switch (kind) {
        case 'tree':
          if (treeData[index]) {
            setTreeMatricesAt(treeData[index], index);
            treeDirty = true;
          }
          break;
        case 'broadleaf':
          if (broadleafData[index]) {
            setBroadleafMatricesAt(broadleafData[index], index);
            broadleafDirty = true;
          }
          break;
        case 'palm':
          if (palmData[index]) {
            setPalmMatrixAt(palmData[index], index);
            palmDirty = true;
          }
          break;
        case 'baobab':
          if (baobabData[index]) {
            setBaobabMatricesAt(baobabData[index], index);
            baobabDirty = true;
          }
          break;
        case 'acacia':
          if (acaciaData[index]) {
            setAcaciaMatricesAt(acaciaData[index], index);
            acaciaDirty = true;
          }
          break;
        case 'mangrove':
          if (mangroveData[index]) {
            setMangroveMatricesAt(mangroveData[index], index);
            mangroveDirty = true;
          }
          break;
        case 'cypress':
          if (cypressData[index]) {
            setCypressMatricesAt(cypressData[index], index);
            cypressDirty = true;
          }
          break;
        case 'datePalm':
          if (datePalmData[index]) {
            setDatePalmMatrixAt(datePalmData[index], index);
            datePalmDirty = true;
          }
          break;
        case 'bamboo':
          if (bambooData[index]) {
            setBambooMatrixAt(bambooData[index], index);
            bambooDirty = true;
          }
          break;
        case 'willow':
          if (willowData[index]) {
            setWillowMatricesAt(willowData[index], index);
            willowDirty = true;
          }
          break;
        case 'cherry':
          if (cherryData[index]) {
            setCherryMatricesAt(cherryData[index], index);
            cherryDirty = true;
          }
          break;
        case 'orange':
          if (orangeData[index]) {
            setOrangeMatricesAt(orangeData[index], index);
            orangeDirty = true;
          }
          break;
        case 'oak':
          if (oakData[index]) {
            setOakMatricesAt(oakData[index], index);
            oakDirty = true;
          }
          break;
      }
    });

    active.clear();
    next.forEach((key) => active.add(key));

    if (treeDirty && trunkMeshRef.current && leavesMeshRef.current) {
      trunkMeshRef.current.instanceMatrix.needsUpdate = true;
      leavesMeshRef.current.instanceMatrix.needsUpdate = true;
    }
    if (broadleafDirty && broadleafTrunkMeshRef.current && broadleafCanopyMeshRef.current) {
      broadleafTrunkMeshRef.current.instanceMatrix.needsUpdate = true;
      broadleafCanopyMeshRef.current.instanceMatrix.needsUpdate = true;
    }
    if (palmDirty && palmTrunkMeshRef.current && palmFrondMeshRef.current) {
      palmTrunkMeshRef.current.instanceMatrix.needsUpdate = true;
      palmFrondMeshRef.current.instanceMatrix.needsUpdate = true;
    }
    if (baobabDirty && baobabTrunkMeshRef.current && baobabCanopyMeshRef.current) {
      baobabTrunkMeshRef.current.instanceMatrix.needsUpdate = true;
      baobabCanopyMeshRef.current.instanceMatrix.needsUpdate = true;
    }
    if (acaciaDirty && acaciaTrunkMeshRef.current && acaciaCanopyMeshRef.current) {
      acaciaTrunkMeshRef.current.instanceMatrix.needsUpdate = true;
      acaciaCanopyMeshRef.current.instanceMatrix.needsUpdate = true;
    }
    if (mangroveDirty && mangroveRootMeshRef.current && mangroveCanopyMeshRef.current) {
      mangroveRootMeshRef.current.instanceMatrix.needsUpdate = true;
      mangroveCanopyMeshRef.current.instanceMatrix.needsUpdate = true;
    }
    if (cypressDirty && cypressTrunkMeshRef.current && cypressCanopyMeshRef.current) {
      cypressTrunkMeshRef.current.instanceMatrix.needsUpdate = true;
      cypressCanopyMeshRef.current.instanceMatrix.needsUpdate = true;
    }
    if (datePalmDirty && datePalmTrunkMeshRef.current && datePalmFrondMeshRef.current) {
      datePalmTrunkMeshRef.current.instanceMatrix.needsUpdate = true;
      datePalmFrondMeshRef.current.instanceMatrix.needsUpdate = true;
    }
    if (bambooDirty && bambooMeshRef.current) {
      bambooMeshRef.current.instanceMatrix.needsUpdate = true;
    }
    if (willowDirty && willowTrunkMeshRef.current && willowCanopyMeshRef.current) {
      willowTrunkMeshRef.current.instanceMatrix.needsUpdate = true;
      willowCanopyMeshRef.current.instanceMatrix.needsUpdate = true;
    }
    if (cherryDirty && cherryTrunkMeshRef.current && cherryCanopyMeshRef.current) {
      cherryTrunkMeshRef.current.instanceMatrix.needsUpdate = true;
      cherryCanopyMeshRef.current.instanceMatrix.needsUpdate = true;
    }
    if (orangeDirty && orangeTrunkMeshRef.current && orangeCanopyMeshRef.current) {
      orangeTrunkMeshRef.current.instanceMatrix.needsUpdate = true;
      orangeCanopyMeshRef.current.instanceMatrix.needsUpdate = true;
    }
    if (oakDirty && oakTrunkMeshRef.current && oakCanopyMeshRef.current) {
      oakTrunkMeshRef.current.instanceMatrix.needsUpdate = true;
      oakCanopyMeshRef.current.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <group>
      <ClearSkyDome />

      <hemisphereLight ref={hemiLightRef} intensity={ambientIntensity} color={ambientColor} groundColor={groundColor} />
      <directionalLight
        ref={sunLightRef}
        position={sunPosition}
        intensity={sunIntensity}
        color={sunColor}
        castShadow={shadowsActive}
        shadow-mapSize={IS_SAFARI ? [1024, 1024] : [2048, 2048]}
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
        geometry={visibleLandTerrainGeometry}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow={shadowsActive}
        castShadow={shadowsActive}
        raycast={() => null}
        material={terrainMaterial}
      />

      {/* Background terrain ring — distant land visible through atmospheric
          haze, outside the playable mesh. No flora, no shadows, no collision. */}
      <mesh
        geometry={backgroundRingTerrainGeometry}
        rotation={[-Math.PI / 2, 0, 0]}
        raycast={() => null}
        material={terrainMaterial}
        frustumCulled={false}
      />


      {/* Instanced Flora & Fauna */}
      {treeData.length > 0 && (
        <>
          <instancedMesh ref={trunkMeshRef} args={[treeTrunkGeometry, treeTrunkMaterial, treeData.length]} castShadow={shadowsActive} receiveShadow={shadowsActive} frustumCulled={false} />
          <instancedMesh ref={leavesMeshRef} args={[treeLeavesGeometry, treeLeavesMaterial, treeData.length]} receiveShadow={shadowsActive} frustumCulled={false} />
        </>
      )}
      {deadTreeData.length > 0 && (
        <instancedMesh ref={deadTreeMeshRef} args={[treeTrunkGeometry, deadTreeMaterial, deadTreeData.length]} castShadow={shadowsActive} receiveShadow={shadowsActive} frustumCulled={false} />
      )}
      {broadleafData.length > 0 && (
        <>
          <instancedMesh ref={broadleafTrunkMeshRef} args={[broadleafTrunkGeometry, broadleafTrunkMaterial, broadleafData.length]} castShadow={shadowsActive} receiveShadow={shadowsActive} frustumCulled={false} />
          <instancedMesh ref={broadleafCanopyMeshRef} args={[broadleafCanopyGeometry, broadleafCanopyMaterial, broadleafData.length]} receiveShadow={shadowsActive} frustumCulled={false} />
        </>
      )}
      {baobabData.length > 0 && (
        <>
          <instancedMesh ref={baobabTrunkMeshRef} args={[baobabTrunkGeometry, baobabTrunkMaterial, baobabData.length]} castShadow={shadowsActive} receiveShadow={shadowsActive} frustumCulled={false} />
          <instancedMesh ref={baobabCanopyMeshRef} args={[baobabCanopyGeometry, baobabCanopyMaterial, baobabData.length]} receiveShadow={shadowsActive} frustumCulled={false} />
        </>
      )}
      {acaciaData.length > 0 && (
        <>
          <instancedMesh ref={acaciaTrunkMeshRef} args={[acaciaTrunkGeometry, acaciaTrunkMaterial, acaciaData.length]} castShadow={shadowsActive} receiveShadow={shadowsActive} frustumCulled={false} />
          <instancedMesh ref={acaciaCanopyMeshRef} args={[acaciaCanopyGeometry, acaciaCanopyMaterial, acaciaData.length]} receiveShadow={shadowsActive} frustumCulled={false} />
        </>
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
      {cypressData.length > 0 && (
        <>
          <instancedMesh ref={cypressTrunkMeshRef} args={[cypressTrunkGeometry, cypressTrunkMaterial, cypressData.length]} castShadow={shadowsActive} receiveShadow={shadowsActive} frustumCulled={false} />
          <instancedMesh ref={cypressCanopyMeshRef} args={[cypressCanopyGeometry, cypressCanopyMaterial, cypressData.length]} receiveShadow={shadowsActive} frustumCulled={false} />
        </>
      )}
      {datePalmData.length > 0 && (
        <>
          <instancedMesh ref={datePalmTrunkMeshRef} args={[datePalmTrunkGeometry, datePalmTrunkMaterial, datePalmData.length]} castShadow={shadowsActive} receiveShadow={shadowsActive} frustumCulled={false} />
          <instancedMesh ref={datePalmFrondMeshRef} args={[datePalmFrondGeometry, datePalmFrondMaterial, datePalmData.length]} receiveShadow={shadowsActive} frustumCulled={false} />
        </>
      )}
      {bambooData.length > 0 && (
        <instancedMesh ref={bambooMeshRef} args={[bambooGeometry, bambooMaterial, bambooData.length]} receiveShadow={shadowsActive} frustumCulled={false} />
      )}
      {willowData.length > 0 && (
        <>
          <instancedMesh ref={willowTrunkMeshRef} args={[willowTrunkGeometry, willowTrunkMaterial, willowData.length]} castShadow={shadowsActive} receiveShadow={shadowsActive} frustumCulled={false} />
          <instancedMesh ref={willowCanopyMeshRef} args={[willowCanopyGeometry, willowCanopyMaterial, willowData.length]} receiveShadow={shadowsActive} frustumCulled={false} />
        </>
      )}
      {cherryData.length > 0 && (
        <>
          <instancedMesh ref={cherryTrunkMeshRef} args={[cherryTrunkGeometry, cherryTrunkMaterial, cherryData.length]} castShadow={shadowsActive} receiveShadow={shadowsActive} frustumCulled={false} />
          <instancedMesh ref={cherryCanopyMeshRef} args={[cherryCanopyGeometry, cherryCanopyMaterial, cherryData.length]} receiveShadow={shadowsActive} frustumCulled={false} />
        </>
      )}
      {oakData.length > 0 && (
        <>
          <instancedMesh ref={oakTrunkMeshRef} args={[oakTrunkGeometry, oakTrunkMaterial, oakData.length]} castShadow={shadowsActive} receiveShadow={shadowsActive} frustumCulled={false} />
          <instancedMesh ref={oakCanopyMeshRef} args={[oakCanopyGeometry, oakCanopyMaterial, oakData.length]} castShadow={shadowsActive} receiveShadow={shadowsActive} frustumCulled={false} />
        </>
      )}
      {orangeData.length > 0 && (
        <>
          <instancedMesh ref={orangeTrunkMeshRef} args={[orangeTrunkGeometry, orangeTrunkMaterial, orangeData.length]} castShadow={shadowsActive} receiveShadow={shadowsActive} frustumCulled={false} />
          <instancedMesh ref={orangeCanopyMeshRef} args={[orangeCanopyGeometry, orangeCanopyMaterial, orangeData.length]} receiveShadow={shadowsActive} frustumCulled={false} />
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
      <Grazers data={grazerData} shadowsActive={shadowsActive} species={grazerSpecies} kind={grazerKind} />
      <Primates data={primateData} shadowsActive={shadowsActive} species={primateSpecies} />
      <Reptiles data={reptileData} shadowsActive={shadowsActive} species={reptileSpecies} />
      <WadingBirds data={wadingBirdData} shadowsActive={shadowsActive} species={wadingSpecies} />
      <AnimalMarkers
        grazerData={grazerData}
        grazerKind={grazerKind}
        grazerSpecies={grazerSpecies}
        primateData={primateData}
        primateSpecies={primateSpecies}
        reptileData={reptileData}
        reptileSpecies={reptileSpecies}
        wadingBirdData={wadingBirdData}
        wadingSpecies={wadingSpecies}
      />

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
      <FarmsteadFields />
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
