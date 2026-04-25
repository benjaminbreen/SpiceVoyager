import { useMemo, useEffect, useRef } from 'react';
import { useGameStore } from '../store/gameStore';
import { IS_SAFARI } from '../utils/platform';
import * as THREE from 'three';
import { NPCShip } from './NPCShip';
import { getTerrainData, reseedTerrain, refreshTerrainPaletteCache, setMeshHalf } from '../utils/terrain';
import { useFrame } from '@react-three/fiber';
import { generateMap, focusedPortConfig, devModeConfig, findSafeSpawn } from '../utils/mapGenerator';
import { setLandCharacterBuildings } from '../utils/landCharacter';
import { SEA_LEVEL } from '../constants/world';
import { resolveWaterPaletteId } from '../utils/waterPalettes';
import { computeDayMood, MOOD_OVERCAST_WARM_HEX } from '../utils/dayMood';
import { resolveCampaignPortId } from '../utils/worldPorts';
import { addObstacle, clearObstacleGrid } from '../utils/obstacleGrid';
import { GRAZER_TERRAIN } from '../utils/animalTerrain';
import { treeShakes, type TreeImpactKind, getPalmDamage, getFelledTreeState, resetVegetationDamage } from '../utils/impactShakeState';
import { applyWindSway, updateWindUniforms } from '../utils/windSway';
import { tintVegetation } from '../utils/vegetationTint';
import { mergeCompatibleGeometries } from '../utils/geometryMerge';
import { buildTerrainSurfaceGeometry, COASTLINE_CLIP_LEVEL } from '../utils/terrainClipping';
import { buildBackgroundRingGeometry } from '../utils/backgroundRingGeometry';
import { type PalmEntry, palmCanopyCenter } from '../utils/flora';
import { generateNpcSpawnPositions } from '../utils/npcSpawn';

import { ProceduralCity } from './ProceduralCity';
import { Grazers, SpeciesInfo, grazerFootOffset } from './Grazers';
import { Primates, PrimateEntry, PRIMATE_FOOT_OFFSET } from './Primates';
import { Reptiles, ReptileEntry, REPTILE_FOOT_OFFSET } from './Reptiles';
import { WadingBirds, WadingBirdEntry } from './WadingBirds';
import { AnimalMarkers } from './AnimalMarkers';
import { tintFlat, tintGradient } from '../utils/animalTint';
import { PortIndicators } from './PortIndicators';
import { BuildingTooltip } from './BuildingTooltip';
import { generateNPCShip } from '../utils/npcShipGenerator';
import { pickFishType, randomShoalSize, type FishType } from '../utils/fishTypes';
import { generateEncounter, type OceanEncounterDef } from '../utils/oceanEncounters';
import { OceanEncounter } from './OceanEncounter';
import { getActivePlayerPos, getLiveShipTransform } from '../utils/livePlayerTransform';

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

// Allocation-free version: writes result into `target`, reuses `_lerpB` scratch.
const _lerpB = new THREE.Color();
function lerpColorHexInto(a: string, b: string, t: number, target: THREE.Color): void {
  target.set(a).lerp(_lerpB.set(b), THREE.MathUtils.clamp(t, 0, 1));
}

// Variant that takes a pre-set Color as the source — used when the source hex
// itself is mood-dependent and already lives in a scratch Color.
function lerpColorInto(src: THREE.Color, destHex: string, t: number, target: THREE.Color): void {
  target.copy(src).lerp(_lerpB.set(destHex), THREE.MathUtils.clamp(t, 0, 1));
}

function ClearSkyDome() {
  const meshRef = useRef<THREE.Mesh>(null);
  const uniforms = useMemo(() => ({
    uZenithColor: { value: new THREE.Color('#0794f2') },
    uHorizonColor: { value: new THREE.Color('#55c6ff') },
    uLowerColor: { value: new THREE.Color('#7fcff4') },
  }), []);

  // Pre-allocated scratch colors — avoids `new THREE.Color()` every frame.
  const scratch = useMemo(() => ({
    zenith: new THREE.Color(),
    horizon: new THREE.Color(),
    lower: new THREE.Color(),
    warm: new THREE.Color(),
  }), []);

  useFrame(({ camera }) => {
    if (!meshRef.current) return;
    meshRef.current.position.copy(camera.position);

    const state = useGameStore.getState();
    const waterPaletteId = resolveWaterPaletteId(state);
    const mood = computeDayMood(state.timeOfDay, state.worldSeed);
    const angle = ((state.timeOfDay - 6) / 24) * Math.PI * 2;
    const sunH = Math.sin(angle);

    const { zenith, horizon, lower, warm } = scratch;
    // Mood-adjusted warm band: blend the saturated sunset orange toward an
    // overcast gray as warmth drops. warmth=1 → '#f0a36b', warmth=0 → overcast.
    warm.set(MOOD_OVERCAST_WARM_HEX).lerp(_lerpB.set('#f0a36b'), mood.warmth);

    if (sunH > 0.3) {
      if (waterPaletteId === 'monsoon') {
        zenith.set('#3d9fbb'); horizon.set('#75bfc9'); lower.set('#9acdcf');
      } else if (waterPaletteId === 'tropical') {
        zenith.set('#0289e8'); horizon.set('#50c7ff'); lower.set('#7ed5ff');
      } else if (waterPaletteId === 'temperate') {
        zenith.set('#6f8894'); horizon.set('#9fb4bc'); lower.set('#b5c3c8');
      } else {
        zenith.set('#158bd8'); horizon.set('#68c4f2'); lower.set('#94d6f4');
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
      lerpColorHexInto('#223a68', dayZenith, t, zenith);
      lerpColorInto(warm, dayHorizon, t, horizon);
      lerpColorInto(warm, dayHorizon, t, lower);
    } else if (sunH > -0.15) {
      const t = (sunH + 0.15) / 0.15;
      lerpColorHexInto('#101f42', '#223a68', t, zenith);
      // Deep-dusk side blends the night color up toward the mood-adjusted warm.
      horizon.set('#172747');
      horizon.lerp(warm, THREE.MathUtils.clamp(t, 0, 1));
      lower.copy(horizon);
    } else {
      zenith.set('#081833'); horizon.set('#102241'); lower.set('#102241');
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

// Module-level animal data + species info for the full-size map overlay
export interface AnimalMarker { position: [number, number, number] }
let _grazerMapData: AnimalMarker[] = [];
let _primateMapData: AnimalMarker[] = [];
let _reptileMapData: AnimalMarker[] = [];
let _wadingBirdMapData: AnimalMarker[] = [];
let _grazerSpeciesMap: SpeciesInfo | undefined;
let _primateSpeciesMap: SpeciesInfo | undefined;
let _reptileSpeciesMap: SpeciesInfo | undefined;
let _wadingSpeciesMap: SpeciesInfo | undefined;
export function getAnimalMapData() {
  return {
    grazers: _grazerMapData, primates: _primateMapData, reptiles: _reptileMapData, wadingBirds: _wadingBirdMapData,
    grazerSpecies: _grazerSpeciesMap, primateSpecies: _primateSpeciesMap,
    reptileSpecies: _reptileSpeciesMap, wadingSpecies: _wadingSpeciesMap,
  };
}

export interface TreeImpactTarget {
  kind: TreeImpactKind;
  index: number;
  x: number;
  y: number;
  z: number;
  radius: number;
}

let _treeImpactTargets: TreeImpactTarget[] = [];
export function getTreeImpactTargets() { return _treeImpactTargets; }


// Commodity list now imported from utils/commodities.ts

const FISH_SWIM_DEPTH = 0.85;
const TURTLE_SWIM_DEPTH = 0.65;
const TREE_SHAKE_DURATION = 0.34;

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
  const waterPaletteId = useGameStore((state) => resolveWaterPaletteId(state));

  // Generate world data once
  const {
    landTerrainGeometry, backgroundRingTerrainGeometry, generatedPorts, generatedNpcs,
    treeData, deadTreeData, broadleafData, baobabData, acaciaData, cactusData, crabData, palmData, mangroveData, cypressData, datePalmData, bambooData, willowData, cherryData, orangeData, reedBedData, siltPatchData, saltStainData, thornbushData, riceShootData, driftwoodData, beachRockData, coralData, fishData, turtleData, fishShoalData, gullData, grazerData, primateData, reptileData, wadingBirdData, grazerSpecies, grazerKind, primateSpecies, reptileSpecies, wadingSpecies, encounterData,
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
    const broadleafs: { position: [number, number, number], scale: number }[] = [];
    const baobabs: { position: [number, number, number], scale: number, rotation: number }[] = [];
    const acacias: { position: [number, number, number], scale: number, rotation: number }[] = [];
    const mangroves: { position: [number, number, number], scale: number, rotation: number }[] = [];
    const cypresses: { position: [number, number, number], scale: number }[] = [];
    const datePalms: PalmEntry[] = [];
    const bamboos: { position: [number, number, number], scale: number, rotation: number }[] = [];
    const willows: { position: [number, number, number], scale: number, rotation: number }[] = [];
    const cherries: { position: [number, number, number], scale: number }[] = [];
    const oranges: { position: [number, number, number], scale: number, rotation: number }[] = [];
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
    const primates: PrimateEntry[] = [];
    const reptiles: ReptileEntry[] = [];
    const wadingBirds: WadingBirdEntry[] = [];
    const encounters: OceanEncounterDef[] = [];

    // ── Grazer variant config per port ──────────────────────────────────────
    const portId = resolveCampaignPortId({ worldSeed, devSoloPort, currentWorldPortId });
    // Tree profile — which tree types appear at this port
    const africanPort = new Set(['mombasa', 'zanzibar', 'cape', 'elmina', 'luanda']).has(portId);
    const usesAcacia = africanPort || waterPaletteId === 'arid';
    const mediterraneanPort = waterPaletteId === 'mediterranean';
    // Persian-Gulf / Levantine ports — cypress is iconic here too (Cupressus
    // sempervirens; Sarv-e Abarkuh on the Iranian plateau is the canonical example).
    const persianCypressPort = new Set(['hormuz', 'muscat', 'aden']).has(portId);
    const cypressPort = mediterraneanPort || persianCypressPort;
    // Date palm — every arid-palette port is plausible (oases + irrigated coast).
    const datePalmPort = waterPaletteId === 'arid';
    // Bamboo — native across all of monsoon/tropical Asia plus East Africa coast.
    // Atlantic colonial ports excluded (bamboo did spread there but later, and
    // the silhouette would read as anachronistic in 1612).
    const bambooPort = new Set([
      'nagasaki', 'macau',                      // East Asia
      'goa', 'calicut', 'surat', 'masulipatnam', 'diu', // Indian coast
      'malacca', 'manila', 'bantam',            // Southeast Asia
      'mombasa', 'zanzibar',                    // East African coast (Bambusa vulgaris)
    ]).has(portId);
    const cherryPort = portId === 'nagasaki';
    // Orange tree — Iberian + Spanish-Caribbean ports. Citrus aurantium (sour
    // orange) was already centuries-naturalized in Andalusia and Portugal by
    // 1612; sweet oranges (C. sinensis) had reached Iberia from Goa c.1500
    // and were planted in Cuba/Caribbean orchards within decades of contact.
    const orangePort = new Set(['seville', 'lisbon', 'havana', 'cartagena']).has(portId);
    type GrazerKind = 'antelope' | 'deer' | 'goat' | 'camel' | 'sheep' | 'bovine' | 'pig' | 'capybara';
    type GrazerVariant = { color: [number, number, number]; scale: number; herdMin: number; herdMax: number; spawnChance: number; biomes: Set<string>; species: SpeciesInfo; kind: GrazerKind };
    const GRAZER_VARIANTS: GrazerVariant[] = (() => {
      const col = (hex: string): [number, number, number] => {
        const c = new THREE.Color(hex);
        return [c.r, c.g, c.b];
      };
      const grass = new Set(['grassland', 'scrubland']);
      const arid = new Set(['scrubland', 'desert', 'arroyo']);
      const lush = new Set(['grassland', 'forest', 'scrubland']);
      const wet = new Set(['grassland', 'swamp', 'scrubland']);
      const capeBiomes = new Set(['grassland', 'scrubland', 'forest']);
      const sp = (name: string, latin: string, info: string): SpeciesInfo => ({ name, latin, info });
      switch (portId) {
        case 'cape':
          return [{ color: col('#c8a060'), scale: 1.0, herdMin: 6, herdMax: 12, spawnChance: 0.012, biomes: capeBiomes, kind: 'antelope',
            species: sp('Springbok', 'Antidorcas marsupialis', 'Herds of hundreds still roam the Cape veld in 1612.') }];
        case 'mombasa': case 'zanzibar':
          return [{ color: col('#a06840'), scale: 0.9, herdMin: 4, herdMax: 7, spawnChance: 0.0025, biomes: lush, kind: 'antelope',
            species: sp('Impala', 'Aepyceros melampus', 'East African antelope; meat dried for trade with inland caravans.') }];
        case 'hormuz': case 'muscat': case 'mocha': case 'aden':
          return [{ color: col('#c8a878'), scale: 1.4, herdMin: 2, herdMax: 4, spawnChance: 0.002, biomes: arid, kind: 'camel',
            species: sp('Dromedary camel', 'Camelus dromedarius', 'The pack animal that made Arabian ports function — caravans arrive here before their goods do.') }];
        case 'diu': case 'socotra':
          return [{ color: col('#8a7a6a'), scale: 0.65, herdMin: 3, herdMax: 5, spawnChance: 0.003, biomes: arid, kind: 'goat',
            species: sp('Island goat', 'Capra aegagrus hircus', 'Island stock kept for milk and meat; Socotran flocks noted by Ptolemy.') }];
        case 'london':
          return [{ color: col('#8a5a3a'), scale: 0.85, herdMin: 3, herdMax: 6, spawnChance: 0.0025, biomes: lush, kind: 'deer',
            species: sp('Fallow deer', 'Dama dama', 'Kept in royal and noble parks around London; venison a prestige gift.') }];
        case 'amsterdam':
          return [{ color: col('#e8dcc8'), scale: 0.6, herdMin: 4, herdMax: 8, spawnChance: 0.002, biomes: grass, kind: 'sheep',
            species: sp('Sheep', 'Ovis aries', 'Dutch wool and mutton flocks — a staple of the polder economy.') }];
        case 'lisbon': case 'seville':
          return [{ color: col('#d8c8a8'), scale: 0.65, herdMin: 3, herdMax: 6, spawnChance: 0.002, biomes: grass, kind: 'sheep',
            species: sp('Merino sheep', 'Ovis aries', 'Iberian fine-wool breed, tightly controlled by the Mesta.') }];
        case 'goa': case 'calicut': case 'surat':
          return [{ color: col('#4a4a4a'), scale: 1.2, herdMin: 2, herdMax: 3, spawnChance: 0.0015, biomes: wet, kind: 'bovine',
            species: sp('Water buffalo', 'Bubalus bubalis', 'Yoked for paddy plowing; ghee from its milk is a trade staple.') }];
        case 'malacca': case 'bantam':
          return [{ color: col('#5a4a3a'), scale: 1.1, herdMin: 2, herdMax: 3, spawnChance: 0.001, biomes: wet, kind: 'bovine',
            species: sp('Javan banteng', 'Bos javanicus', 'Wild forest cattle of the archipelago; hide and horn are prized.') }];
        case 'macau':
          return [{ color: col('#2a2a28'), scale: 0.75, herdMin: 3, herdMax: 5, spawnChance: 0.0025, biomes: wet, kind: 'pig',
            species: sp('Chinese pig', 'Sus scrofa domesticus', 'Black-bristled domestic pig, kept by every Cantonese household; main fresh meat for ships at Macau.') }];
        case 'salvador': case 'cartagena':
          return [{ color: col('#8a6848'), scale: 0.8, herdMin: 3, herdMax: 5, spawnChance: 0.002, biomes: wet, kind: 'capybara',
            species: sp('Capybara', 'Hydrochoerus hydrochaeris', 'Largest rodent in the world; Portuguese Jesuits classed it as fish for Lent.') }];
        case 'elmina': case 'luanda':
          return [{ color: col('#9a7050'), scale: 1.15, herdMin: 3, herdMax: 5, spawnChance: 0.002, biomes: lush, kind: 'antelope',
            species: sp('Duiker', 'Cephalophus sp.', 'Forest antelope of the Guinea coast; smoked meat traded inland for gold.') }];
        case 'havana':
          return [];
        default:
          return [{ color: col('#b09060'), scale: 0.8, herdMin: 3, herdMax: 5, spawnChance: 0.002, biomes: grass, kind: 'antelope',
            species: sp('Grazing herd', 'Bovidae sp.', 'Common livestock kept for meat, milk, and hide.') }];
      }
    })();
    const GRAZER_KIND = GRAZER_VARIANTS[0]?.kind;
    const GRAZER_SPECIES = GRAZER_VARIANTS[0]?.species;
    // City exclusion & grazer cap — looser at Cape (Khoikhoi camp, not a walled city)
    const cityExclusionRadius = portId === 'cape' ? 25 : 90;
    const CITY_EXCLUSION_SQ = cityExclusionRadius * cityExclusionRadius;
    const MAX_GRAZERS = portId === 'cape' ? 140 : 60;

    // ── Primate variant config per port ─────────────────────────────────────
    type PrimateVariant = { color: [number, number, number]; scale: number; troopMin: number; troopMax: number; spawnChance: number; species: SpeciesInfo };
    const PRIMATE_VARIANTS: PrimateVariant[] = (() => {
      const col = (hex: string): [number, number, number] => {
        const c = new THREE.Color(hex);
        return [c.r, c.g, c.b];
      };
      const sp = (name: string, latin: string, info: string): SpeciesInfo => ({ name, latin, info });
      switch (portId) {
        case 'goa': case 'calicut': case 'surat':
          return [{ color: col('#7a5538'), scale: 0.5, troopMin: 4, troopMax: 6, spawnChance: 0.008,
            species: sp('Bonnet macaque', 'Macaca radiata', 'Temple-dwelling troops raid grain sheds and harbor stores alike.') }];
        case 'malacca': case 'bantam':
          return [{ color: col('#8a7a6a'), scale: 0.5, troopMin: 4, troopMax: 6, spawnChance: 0.008,
            species: sp('Long-tailed macaque', 'Macaca fascicularis', 'Crab-eating monkey of the mangroves — bold around harbors.') }];
        case 'cape': case 'mombasa':
          return [{ color: col('#6a6048'), scale: 0.65, troopMin: 3, troopMax: 5, spawnChance: 0.01,
            species: sp('Chacma baboon', 'Papio ursinus', 'Large aggressive troops; feared by Khoikhoi herders for raiding flocks.') }];
        case 'zanzibar': case 'elmina':
          return [{ color: col('#2a2a2a'), scale: 0.55, troopMin: 3, troopMax: 4, spawnChance: 0.008,
            species: sp('Colobus monkey', 'Colobus guereza', 'Long white fur capes prized by Swahili and later European traders.') }];
        default:
          return [];
      }
    })();
    const MAX_PRIMATES = 35;
    const PRIMATE_SPECIES = PRIMATE_VARIANTS[0]?.species;

    // ── Reptile variant config per port ─────────────────────────────────────
    type ReptileVariant = { color: [number, number, number]; scale: number; bodyLength: number; spawnChance: number; biomes: Set<string>; maxHeight: number; species: SpeciesInfo };
    const REPTILE_VARIANTS: ReptileVariant[] = (() => {
      const col = (hex: string): [number, number, number] => {
        const c = new THREE.Color(hex);
        return [c.r, c.g, c.b];
      };
      const waterEdge = new Set(['mangrove', 'beach', 'tidal_flat', 'swamp']);
      const tropicalEdge = new Set(['beach', 'mangrove', 'scrubland', 'forest']);
      const aridGround = new Set(['scrubland', 'desert', 'grassland', 'arroyo']);
      const sp = (name: string, latin: string, info: string): SpeciesInfo => ({ name, latin, info });
      switch (portId) {
        case 'bantam': case 'malacca':
          return [{ color: col('#3a4028'), scale: 0.7, bodyLength: 1.1, spawnChance: 0.0006, biomes: waterEdge, maxHeight: 0.6,
            species: sp('Water monitor', 'Varanus salvator', 'Largest lizard of the archipelago; swims rivers and hunts the mangroves.') }];
        case 'havana': case 'cartagena':
          return [{ color: col('#5a7848'), scale: 0.55, bodyLength: 1.0, spawnChance: 0.0012, biomes: tropicalEdge, maxHeight: 4.0,
            species: sp('Green iguana', 'Iguana iguana', 'Locally eaten ("gallina de palo"); sought by Spanish friars as a Lenten fish-analogue.') }];
        case 'luanda': case 'salvador': case 'surat':
          return [{ color: col('#2a3828'), scale: 1.0, bodyLength: 1.4, spawnChance: 0.0004, biomes: waterEdge, maxHeight: 0.4,
            species: sp('Crocodile', 'Crocodylus sp.', 'A real danger at river-mouth ports — the cause of many lost lascars.') }];
        case 'socotra':
          // Body squished short and wide (low bodyLength, larger scale) to approximate a domed shell silhouette
          return [{ color: col('#3a2e24'), scale: 1.1, bodyLength: 0.55, spawnChance: 0.0008, biomes: aridGround, maxHeight: 6.0,
            species: sp('Aldabra giant tortoise', 'Aldabrachelys gigantea', 'Loaded alive as fresh meat for long voyages — the reason ship crews prized Indian Ocean islands.') }];
        default:
          return [];
      }
    })();
    const MAX_REPTILES = 15;
    const REPTILE_SPECIES = REPTILE_VARIANTS[0]?.species;

    // ── Wading bird variant config per port ─────────────────────────────────
    type WadingVariant = {
      color: [number, number, number]; scale: number; flockMin: number; flockMax: number;
      spawnChance: number; biomes: Set<string>; species: SpeciesInfo;
      altitudeBase?: number; radiusBase?: number; heightMax?: number;
    };
    const WADING_BIRD_VARIANTS: WadingVariant[] = (() => {
      const col = (hex: string): [number, number, number] => {
        const c = new THREE.Color(hex);
        return [c.r, c.g, c.b];
      };
      const shoreline = new Set(['mangrove', 'tidal_flat', 'beach']);
      const wetMeadow = new Set(['grassland', 'scrubland', 'mangrove', 'tidal_flat']);
      const runScrub = new Set(['grassland', 'scrubland', 'beach']);
      const sp = (name: string, latin: string, info: string): SpeciesInfo => ({ name, latin, info });
      switch (portId) {
        case 'mombasa': case 'zanzibar': case 'surat':
          return [{ color: col('#e88a95'), scale: 0.85, flockMin: 6, flockMax: 12, spawnChance: 0.0012, biomes: shoreline,
            species: sp('Greater flamingo', 'Phoenicopterus roseus', 'Feeds on brine shrimp in coastal shallows; pink from its diet.') }];
        case 'salvador':
          return [{ color: col('#c02828'), scale: 0.75, flockMin: 5, flockMax: 8, spawnChance: 0.0015, biomes: shoreline,
            species: sp('Scarlet ibis', 'Eudocimus ruber', 'The colour astonished Portuguese chroniclers; feathers traded north to Europe.') }];
        case 'goa': case 'calicut': case 'luanda': case 'elmina':
          return [{ color: col('#f2f2ee'), scale: 0.65, flockMin: 2, flockMax: 4, spawnChance: 0.0018, biomes: shoreline,
            species: sp('Great egret', 'Ardea alba', 'Stalks shallow water for fish; nests in mangrove trees.') }];
        case 'amsterdam': case 'lisbon': case 'seville':
          return [{ color: col('#f4f0e8'), scale: 0.8, flockMin: 2, flockMax: 4, spawnChance: 0.0016, biomes: wetMeadow, heightMax: 2.5,
            species: sp('White stork', 'Ciconia ciconia', 'Nests on chimneys and church towers — Iberian and Dutch lowland icon; herald of spring.') }];
        case 'cape':
          // Flightless: low altitude, tight orbit — they run in circles rather than lift off.
          return [{ color: col('#4a4848'), scale: 1.4, flockMin: 2, flockMax: 4, spawnChance: 0.0012, biomes: runScrub, heightMax: 4.0,
            altitudeBase: 0.3, radiusBase: 4,
            species: sp('Ostrich', 'Struthio camelus', 'Cannot fly but sprints at 40 mph; plumes traded to Europe for court fashion.') }];
        default:
          return [];
      }
    })();
    const MAX_WADING_BIRDS = 60;
    const WADING_SPECIES = WADING_BIRD_VARIANTS[0]?.species;
    
    // Single port at center: mesh covers the archetype zone + generous ocean margin
    const size = devSoloPort ? 1000 : 900;
    // Register mesh extent so terrain queries beyond the boundary fade to ocean
    setMeshHalf(size / 2);
    // Startup is CPU-bound on terrain/world generation. A slightly coarser
    // mesh keeps the local-port terrain readable while cutting mount-time
    // vertex work materially.
    const segments = Math.min(360, Math.round(size * 0.36));
    const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
    const colors = new Float32Array(geometry.attributes.position.count * 3);
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

      colors[i * 3] = color[0];
      colors[i * 3 + 1] = color[1];
      colors[i * 3 + 2] = color[2];
      
      // Flora & Fauna placement
      const rand = Math.random();
      
      if (biome === 'forest' || biome === 'jungle') {
        // In tropical/monsoon lowlands, palms replace most cone trees.
        // Skip palms entirely in temperate ports (London, Amsterdam, etc.)
        const isTropicalLow = moisture > 0.45 && height < 8 && waterPaletteId !== 'temperate';
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
          // Broadleaf tropical hardwoods (mango, teak, jackfruit) fill the canopy
          if (rand > 0.97 && broadleafs.length < 400) {
            broadleafs.push({ position: [x, height, worldZ], scale: 0.5 + Math.random() * 1.2 });
          }
        } else if (waterPaletteId === 'temperate') {
          // Temperate highlands — standard cone trees (fir, pine)
          if (rand > (biome === 'jungle' ? 0.9 : 0.98)) {
            trees.push({ position: [x, height, worldZ], scale: 0.5 + Math.random() * 1.5 });
          }
        } else {
          // Non-temperate highlands — broadleaf (cork oak, olive, cloud forest)
          if (rand > (biome === 'jungle' ? 0.9 : 0.98) && broadleafs.length < 400) {
            broadleafs.push({ position: [x, height, worldZ], scale: 0.5 + Math.random() * 1.5 });
          }
        }
        // Bamboo groves across monsoon/tropical Asia + East African coast
        if (bambooPort && rand > 0.965 && bamboos.length < 200 && height < 14) {
          bamboos.push({
            position: [x, height, worldZ],
            scale: 0.55 + Math.random() * 0.6,
            rotation: Math.random() * Math.PI * 2,
          });
        }
        // Cherry blossoms — only Nagasaki, scattered through forest
        if (cherryPort && rand > 0.992 && cherries.length < 60 && height < 12) {
          cherries.push({ position: [x, height, worldZ], scale: 0.6 + Math.random() * 0.5 });
        }
        // Cypress in Mediterranean + Persian Gulf forest — sparse, on slopes
        if (cypressPort && rand > 0.992 && cypresses.length < 80) {
          cypresses.push({ position: [x, height, worldZ], scale: 0.85 + Math.random() * 0.55 });
        }
        // Orange grove — Iberian/Caribbean cultivated lowlands. Forest biome
        // sits at biomeHeight > 10, so finalHeight is rarely under 9; widen
        // the cap to catch the lower-elevation hillside groves.
        if (orangePort && rand > 0.985 && oranges.length < 160 && height < 14) {
          oranges.push({
            position: [x, height, worldZ],
            scale: 0.65 + Math.random() * 0.45,
            rotation: Math.random() * Math.PI * 2,
          });
        }
        // Willow — temperate/Mediterranean low-elevation moist forest (riparian)
        if ((waterPaletteId === 'temperate' || mediterraneanPort)
            && height < 5 && moisture > 0.55 && rand > 0.992 && willows.length < 60) {
          willows.push({
            position: [x, height, worldZ],
            scale: 0.7 + Math.random() * 0.5,
            rotation: Math.random() * Math.PI * 2,
          });
        }
      } else if (biome === 'swamp') {
        if (rand > 0.997) {
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
        // Umbrella acacia in scrubland (African + arid ports)
        if (usesAcacia && rand > 0.993 && acacias.length < 120) {
          acacias.push({ position: [x, height, worldZ], scale: 0.6 + Math.random() * 0.8, rotation: Math.random() * Math.PI * 2 });
        }
        // Baobab in African scrubland — sparse, majestic
        if (africanPort && rand > 0.997 && baobabs.length < 40) {
          baobabs.push({ position: [x, height, worldZ], scale: 0.7 + Math.random() * 0.6, rotation: Math.random() * Math.PI * 2 });
        }
        // Cypress dotting Mediterranean + Persian scrubland
        if (cypressPort && rand > 0.994 && cypresses.length < 80) {
          cypresses.push({ position: [x, height, worldZ], scale: 0.8 + Math.random() * 0.55 });
        }
        // Orange grove edge — Iberian/Caribbean dry-lowland
        if (orangePort && rand > 0.994 && oranges.length < 100) {
          oranges.push({
            position: [x, height, worldZ],
            scale: 0.6 + Math.random() * 0.4,
            rotation: Math.random() * Math.PI * 2,
          });
        }
        // Date palm in arid scrubland (oasis hint)
        if (datePalmPort && rand > 0.996 && datePalms.length < 200 && moisture > 0.25) {
          datePalms.push({
            position: [x, height, worldZ],
            scale: 0.75 + Math.random() * 0.6,
            lean: (Math.random() - 0.5) * 0.04, // nearly upright
            rotation: Math.random() * Math.PI * 2,
          });
        }
      } else if (biome === 'grassland') {
        // Umbrella acacia dotting the savanna
        if (usesAcacia && rand > 0.994 && acacias.length < 120) {
          acacias.push({ position: [x, height, worldZ], scale: 0.6 + Math.random() * 0.8, rotation: Math.random() * Math.PI * 2 });
        }
        // Scattered baobabs on African grassland
        if (africanPort && rand > 0.998 && baobabs.length < 40) {
          baobabs.push({ position: [x, height, worldZ], scale: 0.8 + Math.random() * 0.7, rotation: Math.random() * Math.PI * 2 });
        }
        // Orange groves on cultivated lowland — the canonical orchard biome
        // for Seville's Guadalquivir floodplain and Cuban / Cartagenan plains.
        if (orangePort && rand > 0.982 && oranges.length < 160) {
          oranges.push({
            position: [x, height, worldZ],
            scale: 0.65 + Math.random() * 0.45,
            rotation: Math.random() * Math.PI * 2,
          });
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
        // Palm trees on tropical/monsoon beaches (never in temperate climates).
        // Arid palm ports (Hormuz, Aden, etc.) get date palms instead of coconut palms.
        const stableSand = beachFactor > wetSandFactor && slope < 0.32;
        if (stableSand && moisture > 0.35 && waterPaletteId !== 'temperate' && rand > 0.94) {
          if (datePalmPort && datePalms.length < 200) {
            datePalms.push({
              position: [x, height, worldZ],
              scale: 0.8 + Math.random() * 0.7,
              lean: (Math.random() - 0.5) * 0.06,
              rotation: Math.random() * Math.PI * 2,
            });
          } else if (!datePalmPort && palms.length < 500) {
            palms.push({
              position: [x, height, worldZ],
              scale: 0.7 + Math.random() * 0.8,
              lean: 0.1 + Math.random() * 0.25,
              rotation: Math.random() * Math.PI * 2,
            });
          }
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

      // ── Reptile spawn (solitary; water-edge gate — stay low by the shore)
      if (REPTILE_VARIANTS.length > 0 && reptiles.length < MAX_REPTILES && height > SEA_LEVEL + 0.05) {
        const variant = REPTILE_VARIANTS[0];
        const belowMaxHeight = height < SEA_LEVEL + variant.maxHeight;
        if (belowMaxHeight && variant.biomes.has(biome) && rand < variant.spawnChance) {
          const portCX = portsData[0]?.position[0] ?? 0;
          const portCZ = portsData[0]?.position[2] ?? 0;
          const dpx = x - portCX;
          const dpz = worldZ - portCZ;
          if (dpx * dpx + dpz * dpz > CITY_EXCLUSION_SQ) {
            const cv = 0.88 + Math.random() * 0.22;
            // Reptiles scaled up ~1.6x — at the game's zoomed-out view, realistic iguana/croc sizes read as specks.
            const rInstanceScale = variant.scale * (0.9 + Math.random() * 0.3) * 2.0;
            reptiles.push({
              position: [x, height + REPTILE_FOOT_OFFSET * rInstanceScale, worldZ],
              rotation: Math.random() * Math.PI * 2,
              color: [variant.color[0] * cv, variant.color[1] * cv, variant.color[2] * cv],
              scale: rInstanceScale,
              speedMult: 0.7 + Math.random() * 0.5,
              bodyLength: variant.bodyLength * (0.9 + Math.random() * 0.2),
            });
          }
        }
      }

      // ── Wading bird flock spawning (shoreline biomes) ─────────────────
      if (WADING_BIRD_VARIANTS.length > 0 && wadingBirds.length < MAX_WADING_BIRDS && height > SEA_LEVEL - 0.1) {
        const variant = WADING_BIRD_VARIANTS[0];
        const maxH = variant.heightMax ?? 0.4;
        if (height < SEA_LEVEL + maxH && variant.biomes.has(biome) && rand < variant.spawnChance) {
          const portCX = portsData[0]?.position[0] ?? 0;
          const portCZ = portsData[0]?.position[2] ?? 0;
          const dpx = x - portCX;
          const dpz = worldZ - portCZ;
          if (dpx * dpx + dpz * dpz > CITY_EXCLUSION_SQ) {
            const flockSize = variant.flockMin + Math.floor(Math.random() * (variant.flockMax - variant.flockMin + 1));
            // Flock orbits around this seed vertex; birds spread evenly around the circle phase
            const flockRadius = (variant.radiusBase ?? 9) + Math.random() * 4;
            const flockAltitude = (variant.altitudeBase ?? 6) + Math.random() * 3;
            for (let h = 0; h < flockSize && wadingBirds.length < MAX_WADING_BIRDS; h++) {
              const jx = x + (Math.random() - 0.5) * 5;
              const jz = worldZ + (Math.random() - 0.5) * 5;
              const cv = 0.92 + Math.random() * 0.16;
              wadingBirds.push({
                position: [jx, Math.max(height, SEA_LEVEL) + 0.05, jz],
                rotation: Math.random() * Math.PI * 2,
                color: [variant.color[0] * cv, variant.color[1] * cv, variant.color[2] * cv],
                // Birds scaled up ~1.5x to match the game's zoomed-out silhouette language.
                scale: variant.scale * (0.9 + Math.random() * 0.2) * 1.875,
                speedMult: 0.85 + Math.random() * 0.3,
                circleCenter: [x, worldZ],
                circleRadius: flockRadius * (0.85 + Math.random() * 0.3),
                circlePhase: (h / flockSize) * Math.PI * 2 + Math.random() * 0.3,
                maxAltitude: flockAltitude * (0.85 + Math.random() * 0.3),
              });
            }
          }
        }
      }

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
              // Resample terrain at jittered position so animals don't float on water near the coast
              // and don't land on mountain tops where GRAZER_TERRAIN would freeze their flee step.
              const jtd = getTerrainData(jx, jz);
              if (jtd.height < GRAZER_TERRAIN.min || jtd.height > GRAZER_TERRAIN.max) continue;
              // Slight color variation within herd
              const cv = 0.92 + Math.random() * 0.16;
              // Grazers scaled up ~1.6x — at this camera pitch realistic antelope/sheep sizes disappear.
              const instanceScale = variant.scale * (0.85 + Math.random() * 0.3) * 2.0;
              // Foot offset depends on kind — camels have long legs, capybaras are nearly on the ground.
              const foot = grazerFootOffset(variant.kind);
              grazers.push({
                position: [jx, jtd.height + foot * instanceScale, jz],
                rotation: Math.random() * Math.PI * 2,
                color: [variant.color[0] * cv, variant.color[1] * cv, variant.color[2] * cv],
                scale: instanceScale,
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
        if (rand > 0.99993) {
          const ft = pickFishType(moisture);
          const count = randomShoalSize(ft);
          const isTurtle = ft.id.includes('turtle');
          const targetArr = isTurtle ? turtles : fishes;
          const startIdx = targetArr.length;
          const spread = ft.scale > 2.5 ? 1.5 : 3 + count * 0.3; // sharks stay tight, shoals spread
          const swimDepth = isTurtle ? TURTLE_SWIM_DEPTH : FISH_SWIM_DEPTH;
          for (let f = 0; f < count; f++) {
            targetArr.push({
              position: [
                x + (Math.random() - 0.5) * spread,
                SEA_LEVEL - swimDepth - Math.random() * 0.25,
                worldZ + (Math.random() - 0.5) * spread,
              ],
              rotation: Math.random() * Math.PI * 2,
              scale: ft.scale * 1.25,
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

    // ── Primate troop spawning (post-pass over tree positions) ──────────────
    if (PRIMATE_VARIANTS.length > 0) {
      const variant = PRIMATE_VARIANTS[0];
      const portCX = portsData[0]?.position[0] ?? 0;
      const portCZ = portsData[0]?.position[2] ?? 0;
      // Pool of refuge trees outside the city zone — primates roost in both palms and cone trees
      const candidatePool: { x: number; y: number; z: number }[] = [];
      const considerTree = (x: number, y: number, z: number) => {
        const dpx = x - portCX;
        const dpz = z - portCZ;
        if (dpx * dpx + dpz * dpz > CITY_EXCLUSION_SQ) candidatePool.push({ x, y, z });
      };
      palms.forEach(p => considerTree(p.position[0], p.position[1], p.position[2]));
      trees.forEach(t => considerTree(t.position[0], t.position[1], t.position[2]));
      broadleafs.forEach(t => considerTree(t.position[0], t.position[1], t.position[2]));
      baobabs.forEach(t => considerTree(t.position[0], t.position[1], t.position[2]));

      for (let i = 0; i < candidatePool.length && primates.length < MAX_PRIMATES; i++) {
        if (Math.random() >= variant.spawnChance) continue;
        const refugeTree = candidatePool[i];
        const troopSize = variant.troopMin + Math.floor(Math.random() * (variant.troopMax - variant.troopMin + 1));
        for (let h = 0; h < troopSize && primates.length < MAX_PRIMATES; h++) {
          const jx = refugeTree.x + (Math.random() - 0.5) * 6;
          const jz = refugeTree.z + (Math.random() - 0.5) * 6;
          const cv = 0.92 + Math.random() * 0.16;
          // Primates scaled up ~1.5x to match the game's zoomed-out silhouette language.
          const pInstanceScale = variant.scale * (0.85 + Math.random() * 0.3) * 1.875;
          primates.push({
            position: [jx, refugeTree.y + PRIMATE_FOOT_OFFSET * pInstanceScale, jz],
            rotation: Math.random() * Math.PI * 2,
            color: [variant.color[0] * cv, variant.color[1] * cv, variant.color[2] * cv],
            scale: pInstanceScale,
            speedMult: 0.9 + Math.random() * 0.5,
            refuge: [refugeTree.x, refugeTree.z],
          });
        }
      }
    }

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

    // Background ring: distant terrain beyond the playable mesh. Sized so its
    // outer edge sits at or past the day-fog far plane (~1000 units), so the
    // mesh's square silhouette is naturally hidden by atmospheric haze rather
    // than reading as a straight cut. Playable confinement is unchanged —
    // this is purely decorative.
    const ringOuterHalf = 1100;
    const ringInnerHalf = size / 2;
    const ringStep = 5;
    const ringRawGeometry = buildBackgroundRingGeometry(ringOuterHalf, ringInnerHalf, ringStep);
    const backgroundRingGeometry = buildTerrainSurfaceGeometry(ringRawGeometry, true, COASTLINE_CLIP_LEVEL);
    ringRawGeometry.dispose();
    resetVegetationDamage();
    const palmCenter = new THREE.Vector3();

    _treeImpactTargets = [
      ...trees.map((tree, index) => ({
        kind: 'tree' as const,
        index,
        x: tree.position[0],
        y: tree.position[1] + tree.scale * 2.2,
        z: tree.position[2],
        radius: Math.max(0.85, tree.scale * 1.35),
      })),
      ...broadleafs.map((tree, index) => ({
        kind: 'broadleaf' as const,
        index,
        x: tree.position[0],
        y: tree.position[1] + tree.scale * 2.3,
        z: tree.position[2],
        radius: Math.max(1.0, tree.scale * 1.45),
      })),
      ...palms.map((tree, index) => ({
        kind: 'palm' as const,
        index,
        x: palmCanopyCenter(tree, palmCenter).x,
        y: palmCenter.y,
        z: palmCenter.z,
        radius: Math.max(1.05, tree.scale * 1.65),
      })),
      ...baobabs.map((tree, index) => ({
        kind: 'baobab' as const,
        index,
        x: tree.position[0],
        y: tree.position[1] + tree.scale * 2.4,
        z: tree.position[2],
        radius: Math.max(1.1, tree.scale * 1.6),
      })),
      ...acacias.map((tree, index) => ({
        kind: 'acacia' as const,
        index,
        x: tree.position[0],
        y: tree.position[1] + tree.scale * 2.5,
        z: tree.position[2],
        radius: Math.max(1.0, tree.scale * 1.65),
      })),
      ...cypresses.map((tree, index) => ({
        kind: 'cypress' as const,
        index,
        x: tree.position[0],
        y: tree.position[1] + tree.scale * 2.6,
        z: tree.position[2],
        radius: Math.max(0.8, tree.scale * 1.1),
      })),
      ...datePalms.map((tree, index) => ({
        kind: 'datePalm' as const,
        index,
        x: tree.position[0],
        y: tree.position[1] + tree.scale * 4.5,
        z: tree.position[2],
        radius: Math.max(1.0, tree.scale * 1.4),
      })),
      ...bamboos.map((tree, index) => ({
        kind: 'bamboo' as const,
        index,
        x: tree.position[0],
        y: tree.position[1] + tree.scale * 2.0,
        z: tree.position[2],
        radius: Math.max(0.7, tree.scale * 1.0),
      })),
      ...willows.map((tree, index) => ({
        kind: 'willow' as const,
        index,
        x: tree.position[0],
        y: tree.position[1] + tree.scale * 2.0,
        z: tree.position[2],
        radius: Math.max(1.0, tree.scale * 1.5),
      })),
      ...cherries.map((tree, index) => ({
        kind: 'cherry' as const,
        index,
        x: tree.position[0],
        y: tree.position[1] + tree.scale * 2.3,
        z: tree.position[2],
        radius: Math.max(0.95, tree.scale * 1.4),
      })),
      ...oranges.map((tree, index) => ({
        kind: 'orange' as const,
        index,
        x: tree.position[0],
        y: tree.position[1] + tree.scale * 1.7,
        z: tree.position[2],
        radius: Math.max(0.85, tree.scale * 1.2),
      })),
      ...mangroves.map((tree, index) => ({
        kind: 'mangrove' as const,
        index,
        x: tree.position[0],
        y: tree.position[1] + tree.scale * 1.1,
        z: tree.position[2],
        radius: Math.max(0.8, tree.scale * 1.1),
      })),
    ];

    return {
      landTerrainGeometry: landGeometry,
      backgroundRingTerrainGeometry: backgroundRingGeometry,
      generatedPorts: portsData,
      generatedNpcs: npcs,
      treeData: trees,
      deadTreeData: deadTrees,
      broadleafData: broadleafs,
      baobabData: baobabs,
      acaciaData: acacias,
      cactusData: cacti,
      crabData: crabs,
      palmData: palms,
      mangroveData: mangroves,
      cypressData: cypresses,
      datePalmData: datePalms,
      bambooData: bamboos,
      willowData: willows,
      cherryData: cherries,
      orangeData: oranges,
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
      primateData: primates,
      reptileData: reptiles,
      wadingBirdData: wadingBirds,
      grazerSpecies: GRAZER_SPECIES,
      grazerKind: GRAZER_KIND,
      primateSpecies: PRIMATE_SPECIES,
      reptileSpecies: REPTILE_SPECIES,
      wadingSpecies: WADING_SPECIES,
      encounterData: encounters,
    };
  }, [currentWorldPortId, waterPaletteId, worldSeed, worldSize, devSoloPort]);

  // Sync module-level crab/fish/grazer state
  useEffect(() => {
    _crabData = crabData;
    _collectedCrabs = new Set();
    _fishShoalData = fishShoalData;
    _grazerMapData = grazerData;
    _primateMapData = primateData;
    _reptileMapData = reptileData;
    _wadingBirdMapData = wadingBirdData;
    _grazerSpeciesMap = grazerSpecies;
    _primateSpeciesMap = primateSpecies;
    _reptileSpeciesMap = reptileSpecies;
    _wadingSpeciesMap = wadingSpecies;
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
  }, [palmData, treeData, broadleafData, baobabData, acaciaData, deadTreeData, cactusData, thornbushData, mangroveData, beachRockData, cypressData, datePalmData, bambooData, willowData, cherryData, orangeData]);

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
  } = useMemo(() => {
    const angle = ((timeOfDay - 6) / 24) * Math.PI * 2; // 6 AM is sunrise
    const sunH = Math.sin(angle); // -1 to 1, how high the sun is
    const mood = computeDayMood(timeOfDay, worldSeed);

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
        ambBase: 0.30, ambScale: 0.10,
        sunCol: new THREE.Color(1.0, 0.92, 0.72), sunBase: 1.15, sunScale: 0.85,
        shadowRadius: 5.0,
      },
      monsoon: {
        ambCol: new THREE.Color(0.42, 0.80, 0.76), groundCol: new THREE.Color(0.28, 0.44, 0.20),
        ambBase: 0.32, ambScale: 0.09,
        sunCol: new THREE.Color(0.92, 0.96, 0.76), sunBase: 1.0, sunScale: 0.70,
        shadowRadius: 6.0,
      },
      temperate: {
        ambCol: new THREE.Color(0.62, 0.68, 0.78), groundCol: new THREE.Color(0.38, 0.34, 0.28),
        ambBase: 0.36, ambScale: 0.07,
        sunCol: new THREE.Color(0.90, 0.88, 0.84), sunBase: 0.90, sunScale: 0.65,
        shadowRadius: 7.0,
      },
      arid: {
        ambCol: new THREE.Color(0.58, 0.56, 0.50), groundCol: new THREE.Color(0.50, 0.40, 0.26),
        ambBase: 0.26, ambScale: 0.10,
        sunCol: new THREE.Color(1.0, 0.88, 0.65), sunBase: 1.30, sunScale: 0.90,
        shadowRadius: 4.0,
      },
      mediterranean: {
        ambCol: new THREE.Color(0.50, 0.66, 0.88), groundCol: new THREE.Color(0.42, 0.36, 0.24),
        ambBase: 0.30, ambScale: 0.10,
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

    // Directional sun light — intensity and color shaped by climate, with the
    // low-sun warm color biased by daymood warmth (overcast dawns drop the
    // aggressive orange toward a silver-gray).
    let sInt: number, sCol: THREE.Color;
    if (sunH > 0.35) {
      sInt = lp.sunBase + sunH * lp.sunScale;
      sCol = lp.sunCol;
    } else if (sunH > -0.05) {
      const t = (sunH + 0.05) / 0.4;
      sInt = t * lp.sunBase;
      const moodWarmSun = new THREE.Color(0.86, 0.84, 0.80).lerp(
        new THREE.Color(1.0, 0.42, 0.12),
        mood.warmth,
      );
      sCol = new THREE.Color().lerpColors(moodWarmSun, lp.sunCol, t);
    } else {
      sInt = 0;
      sCol = new THREE.Color(0, 0, 0);
    }

    // Fill light — subtle opposite-side light to prevent pure black shadows
    // (handled as hemisphere-style via the ambient + moon)

    // Moonlight — opposite the sun, cool silver-blue
    const moonPos = new THREE.Vector3(-Math.cos(angle) * 100, Math.max(10, -Math.sin(angle) * 80), 30);
    const moonInt = sunH < 0.1 ? Math.max(0, Math.min(0.3, (0.1 - sunH) * 1.5)) : 0;

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
  }, [timeOfDay, waterPaletteId, worldSeed]);

  // ── Terrain material with procedural detail noise ──────────────────────────
  const terrainShaderUniformsRef = useRef<{
    uPlayerPos: { value: THREE.Vector3 };
    uCloudTime: { value: number };
    uCloudWindDir: { value: THREE.Vector2 };
    uCloudStrength: { value: number };
  } | null>(null);
  const terrainMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uPlayerPos = { value: new THREE.Vector3() };
      shader.uniforms.uCloudTime = { value: 0 };
      shader.uniforms.uCloudWindDir = { value: new THREE.Vector2(1, 0) };
      shader.uniforms.uCloudStrength = { value: 0 };
      terrainShaderUniformsRef.current = shader.uniforms as any;

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
        uniform float uCloudTime;
        uniform vec2 uCloudWindDir;
        uniform float uCloudStrength;
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

  // Instanced Meshes Setup
  const treeTrunkGeometry = useMemo(() => new THREE.CylinderGeometry(0.2, 0.3, 2, 5), []);
  const treeLeavesGeometry = useMemo(() => new THREE.ConeGeometry(1.5, 4, 5), []);
  const treeTrunkMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: tintVegetation('#4a3b32', waterPaletteId) }), [waterPaletteId]);
  const treeLeavesMaterial = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ color: tintVegetation('#2d4c1e', waterPaletteId) });
    applyWindSway(m, { anchorY: -2.0, spanY: 4.0, amplitude: 0.18, flutter: 0.04 });
    return m;
  }, [waterPaletteId]);

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
    const merged = mergeCompatibleGeometries(fronds);
    fronds.forEach(f => f.dispose());
    return merged ?? new THREE.SphereGeometry(1, 4, 4);
  }, []);
  const palmFrondMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: tintVegetation('#2a6e1e', waterPaletteId),
    side: THREE.DoubleSide,
  }), [waterPaletteId]);

  // Broadleaf tree — rounded canopy tropical/subtropical hardwood (mango, teak, cork oak)
  const broadleafTrunkGeometry = useMemo(() => new THREE.CylinderGeometry(0.25, 0.35, 2.5, 5), []);
  const broadleafCanopyGeometry = useMemo(() => {
    const canopy = new THREE.IcosahedronGeometry(1.8, 1);
    canopy.scale(1.0, 0.7, 1.0);
    return canopy;
  }, []);
  const broadleafTrunkMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: tintVegetation('#5a4530', waterPaletteId) }), [waterPaletteId]);
  const broadleafCanopyMaterial = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ color: tintVegetation('#2a5e1a', waterPaletteId) });
    applyWindSway(m, { anchorY: -1.3, spanY: 2.6, amplitude: 0.15, flutter: 0.03 });
    return m;
  }, [waterPaletteId]);

  // Baobab — fat bottle trunk with sparse, gnarly crown blobs
  const baobabTrunkGeometry = useMemo(() => {
    const geo = new THREE.CylinderGeometry(0.3, 0.7, 3.5, 6);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const t = (y + 1.75) / 3.5;
      const bulge = 1 + 0.25 * Math.sin(t * Math.PI);
      pos.setX(i, pos.getX(i) * bulge);
      pos.setZ(i, pos.getZ(i) * bulge);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    return geo;
  }, []);
  const baobabCanopyGeometry = useMemo(() => {
    const blobs: THREE.BufferGeometry[] = [];
    const offsets: [number, number, number][] = [
      [0.7, 3.3, 0.1], [-0.3, 3.5, 0.6], [0.1, 3.1, -0.7],
      [-0.6, 3.4, -0.2], [0.4, 3.6, -0.5],
    ];
    for (const [ox, oy, oz] of offsets) {
      const blob = new THREE.IcosahedronGeometry(0.45, 0);
      blob.scale(1.3, 0.7, 1.1);
      blob.translate(ox, oy, oz);
      blobs.push(blob);
    }
    const merged = mergeCompatibleGeometries(blobs);
    blobs.forEach(b => b.dispose());
    return merged ?? new THREE.IcosahedronGeometry(0.8, 0);
  }, []);
  const baobabTrunkMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: tintVegetation('#7a6b55', waterPaletteId) }), [waterPaletteId]);
  const baobabCanopyMaterial = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ color: tintVegetation('#4a6e30', waterPaletteId) });
    applyWindSway(m, { anchorY: 2.8, spanY: 1.0, amplitude: 0.08, flutter: 0.02 });
    return m;
  }, [waterPaletteId]);

  // Umbrella acacia — thin trunk with a wide flat-topped canopy
  const acaciaTrunkGeometry = useMemo(() => new THREE.CylinderGeometry(0.08, 0.14, 3, 5), []);
  const acaciaCanopyGeometry = useMemo(() => {
    const canopy = new THREE.SphereGeometry(1.8, 6, 4);
    canopy.scale(1.0, 0.25, 1.0);
    canopy.translate(0, 3.0, 0);
    return canopy;
  }, []);
  const acaciaTrunkMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: tintVegetation('#5a4a30', waterPaletteId) }), [waterPaletteId]);
  const acaciaCanopyMaterial = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ color: tintVegetation('#3a6628', waterPaletteId) });
    applyWindSway(m, { anchorY: 2.5, spanY: 1.0, amplitude: 0.20, flutter: 0.04 });
    return m;
  }, [waterPaletteId]);

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
    const merged = mergeCompatibleGeometries([trunk, ...roots]);
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
    const merged = mergeCompatibleGeometries([canopyA, canopyB]);
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
    const merged = mergeCompatibleGeometries(reeds);
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
    const merged = mergeCompatibleGeometries([bush, thorn1, thorn2, thorn3]);
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
    const merged = mergeCompatibleGeometries([stalk, leaf1, leaf2]);
    stalk.dispose(); leaf1.dispose(); leaf2.dispose();
    return merged ?? new THREE.CylinderGeometry(0.02, 0.02, 0.5, 3);
  }, []);
  const riceShootMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: tintVegetation('#5a8c2a', waterPaletteId), side: THREE.DoubleSide,
  }), [waterPaletteId]);

  // Cypress — tall columnar conifer (Mediterranean + Persian Gulf).
  // Trunk base sits at y=0; canopy is a stack of cones from y=0 up to ~y=10,
  // with subtle vertex perturbation to break the perfectly-smooth silhouette.
  const cypressTrunkGeometry = useMemo(() => {
    const geo = new THREE.CylinderGeometry(0.16, 0.24, 2.0, 6);
    geo.translate(0, 1.0, 0); // base at y=0
    return geo;
  }, []);
  const cypressCanopyGeometry = useMemo(() => {
    // Four overlapping cones, each rotated and perturbed differently.
    const layers = [
      { radius: 1.10, height: 4.2, baseY: 0.4,  twist: 0.0,  noiseSeed: 1.3 },
      { radius: 0.85, height: 5.0, baseY: 2.6,  twist: 0.45, noiseSeed: 2.7 },
      { radius: 0.55, height: 5.0, baseY: 5.0,  twist: 0.95, noiseSeed: 4.1 },
      { radius: 0.28, height: 3.6, baseY: 7.4,  twist: 1.55, noiseSeed: 5.9 },
    ];
    const cones: THREE.BufferGeometry[] = [];
    for (const l of layers) {
      const c = new THREE.ConeGeometry(l.radius, l.height, 9, 2);
      const pos = c.attributes.position;
      // Perturb radius per-vertex for organic edge — keeps centerline straight.
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), z = pos.getZ(i);
        const r = Math.hypot(x, z);
        if (r > 0.01) {
          const angle = Math.atan2(z, x);
          const noise =
            Math.sin(angle * 7.0 + l.noiseSeed * 5) * 0.08 +
            Math.cos(angle * 13.0 + l.noiseSeed * 3) * 0.05;
          const newR = r * (1 + noise);
          pos.setX(i, Math.cos(angle) * newR);
          pos.setZ(i, Math.sin(angle) * newR);
        }
      }
      pos.needsUpdate = true;
      c.rotateY(l.twist);
      // Cone is centered at y=0 by default; lift so its base sits at l.baseY
      c.translate(0, l.baseY + l.height / 2, 0);
      cones.push(c);
    }
    const merged = mergeCompatibleGeometries(cones);
    cones.forEach(g => g.dispose());
    if (merged) merged.computeVertexNormals();
    return merged ?? new THREE.ConeGeometry(0.7, 5.5, 7);
  }, []);
  const cypressTrunkMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: tintVegetation('#3e2f24', waterPaletteId) }), [waterPaletteId]);
  const cypressCanopyMaterial = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      color: tintVegetation('#243f1f', waterPaletteId),
      roughness: 0.92,
    });
    applyWindSway(m, { anchorY: 1.0, spanY: 9.0, amplitude: 0.07, flutter: 0.015 });
    return m;
  }, [waterPaletteId]);

  // Orange tree — short rounded canopy with baked-in fruit via vertex colors,
  // so a single InstancedMesh shows green leaves + bright orange fruit. The
  // material is white with vertexColors:true; instanceColor jitter is skipped
  // here so the orange stays orange across instances.
  const orangeTrunkGeometry = useMemo(() => {
    const geo = new THREE.CylinderGeometry(0.14, 0.20, 1.4, 5);
    geo.translate(0, 0.7, 0);
    return geo;
  }, []);
  const orangeCanopyGeometry = useMemo(() => {
    const leafColor = new THREE.Color('#3e6f24');
    const fruitColor = new THREE.Color('#f0892a');
    const paint = (geo: THREE.BufferGeometry, color: THREE.Color) => {
      const c = new Float32Array(geo.attributes.position.count * 3);
      for (let i = 0; i < geo.attributes.position.count; i++) {
        c[i * 3] = color.r;
        c[i * 3 + 1] = color.g;
        c[i * 3 + 2] = color.b;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
    };
    const main = new THREE.IcosahedronGeometry(0.95, 1);
    main.scale(1.0, 0.85, 1.0);
    main.translate(0, 0.85, 0); // canopy base ~y=0
    paint(main, leafColor);
    const parts: THREE.BufferGeometry[] = [main];
    // 9 fruits clustered on the upper hemisphere — deterministic so all
    // canopies share one geometry, but rotated differently per instance.
    for (let f = 0; f < 9; f++) {
      const fruit = new THREE.IcosahedronGeometry(0.10, 0);
      const theta = (f * 2.39996) % (Math.PI * 2); // golden-angle spacing
      const phi = 0.25 + ((f * 0.611) % 1) * 0.9;  // 0.25..1.15 rad from top
      const r = 0.85;
      fruit.translate(
        Math.cos(theta) * Math.sin(phi) * r,
        0.85 + Math.cos(phi) * r * 0.78,
        Math.sin(theta) * Math.sin(phi) * r,
      );
      paint(fruit, fruitColor);
      parts.push(fruit);
    }
    const merged = mergeCompatibleGeometries(parts);
    parts.forEach(g => g.dispose());
    if (merged) merged.computeVertexNormals();
    return merged ?? new THREE.IcosahedronGeometry(1.0, 1);
  }, []);
  const orangeTrunkMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: tintVegetation('#4a3424', waterPaletteId) }), [waterPaletteId]);
  const orangeCanopyMaterial = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: true,
      roughness: 0.85,
    });
    applyWindSway(m, { anchorY: -0.4, spanY: 1.8, amplitude: 0.10, flutter: 0.025 });
    return m;
  }, []);


  // Date palm — straighter, taller trunk than coconut palm, denser frond cluster.
  const datePalmTrunkGeometry = useMemo(() => {
    // Slight ringed taper, no quadratic lean
    const geo = new THREE.CylinderGeometry(0.10, 0.16, 5, 6, 12);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, pos.getY(i) + 2.5); // base at y=0
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    return geo;
  }, []);
  const datePalmTrunkMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: tintVegetation('#7a6243', waterPaletteId) }), [waterPaletteId]);
  const datePalmFrondGeometry = useMemo(() => {
    const fronds: THREE.BufferGeometry[] = [];
    for (let f = 0; f < 9; f++) {
      const angle = (f / 9) * Math.PI * 2 + (f % 2) * 0.12;
      const frond = new THREE.PlaneGeometry(0.30, 1.9, 1, 4);
      const fPos = frond.attributes.position;
      for (let i = 0; i < fPos.count; i++) {
        const fy = fPos.getY(i);
        const t = (fy + 0.95) / 1.9;
        fPos.setZ(i, -t * t * 0.55); // less droop than coconut palm
      }
      fPos.needsUpdate = true;
      frond.rotateX(-0.55); // more upright
      frond.rotateY(angle);
      frond.translate(Math.sin(angle) * 0.30, 0, Math.cos(angle) * 0.30);
      fronds.push(frond);
    }
    const merged = mergeCompatibleGeometries(fronds);
    fronds.forEach(f => f.dispose());
    return merged ?? new THREE.SphereGeometry(1, 4, 4);
  }, []);
  const datePalmFrondMaterial = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      color: tintVegetation('#3a5a2a', waterPaletteId),
      side: THREE.DoubleSide,
    });
    applyWindSway(m, { anchorY: -0.5, spanY: 1.8, amplitude: 0.14, flutter: 0.04 });
    return m;
  }, [waterPaletteId]);

  // Bamboo — thin clustered canes for East Asian ports.
  const bambooGeometry = useMemo(() => {
    const canes: THREE.BufferGeometry[] = [];
    const count = 7;
    for (let c = 0; c < count; c++) {
      const angle = (c / count) * Math.PI * 2 + Math.random() * 0.4;
      const radius = 0.08 + Math.random() * 0.18;
      const height = 3.6 + Math.random() * 1.6;
      const cane = new THREE.CylinderGeometry(0.025, 0.035, height, 4, 1);
      cane.translate(0, height * 0.5, 0);
      // Tiny lean for each cane
      const lean = (Math.random() - 0.5) * 0.18;
      cane.rotateZ(lean);
      cane.translate(Math.sin(angle) * radius, 0, Math.cos(angle) * radius);
      canes.push(cane);
    }
    const merged = mergeCompatibleGeometries(canes);
    canes.forEach(g => g.dispose());
    return merged ?? new THREE.CylinderGeometry(0.03, 0.04, 4, 4);
  }, []);
  const bambooMaterial = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      color: tintVegetation('#8aa84a', waterPaletteId),
      roughness: 0.85,
    });
    applyWindSway(m, { anchorY: 1.0, spanY: 3.5, amplitude: 0.22, flutter: 0.06 });
    return m;
  }, [waterPaletteId]);

  // Willow — short stocky trunk + drooping canopy planes for temperate riparian zones.
  const willowTrunkGeometry = useMemo(() => new THREE.CylinderGeometry(0.22, 0.34, 2.2, 5), []);
  const willowTrunkMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: tintVegetation('#4a3a2c', waterPaletteId) }), [waterPaletteId]);
  const willowCanopyGeometry = useMemo(() => {
    // Drooping curtain of leaf planes radiating from the crown
    const fronds: THREE.BufferGeometry[] = [];
    for (let f = 0; f < 8; f++) {
      const angle = (f / 8) * Math.PI * 2;
      const frond = new THREE.PlaneGeometry(0.55, 2.4, 1, 5);
      const fPos = frond.attributes.position;
      for (let i = 0; i < fPos.count; i++) {
        const fy = fPos.getY(i);
        const t = (fy + 1.2) / 2.4;
        // Strong downward droop along the frond
        fPos.setY(i, fy - t * t * 1.1);
      }
      fPos.needsUpdate = true;
      frond.rotateX(0.2);
      frond.rotateY(angle);
      frond.translate(Math.sin(angle) * 0.55, 0, Math.cos(angle) * 0.55);
      fronds.push(frond);
    }
    const merged = mergeCompatibleGeometries(fronds);
    fronds.forEach(f => f.dispose());
    return merged ?? new THREE.SphereGeometry(1, 4, 4);
  }, []);
  const willowCanopyMaterial = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      color: tintVegetation('#6e8a3a', waterPaletteId),
      side: THREE.DoubleSide,
    });
    applyWindSway(m, { anchorY: -0.8, spanY: 2.2, amplitude: 0.22, flutter: 0.05 });
    return m;
  }, [waterPaletteId]);

  // Cherry blossom — pink-tinted broadleaf canopy for Nagasaki (spring).
  const cherryTrunkGeometry = useMemo(() => new THREE.CylinderGeometry(0.18, 0.28, 2.0, 5), []);
  const cherryCanopyGeometry = useMemo(() => {
    const canopy = new THREE.IcosahedronGeometry(1.5, 1);
    canopy.scale(1.0, 0.75, 1.0);
    return canopy;
  }, []);
  const cherryTrunkMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: tintVegetation('#3a2a22', waterPaletteId) }), [waterPaletteId]);
  const cherryCanopyMaterial = useMemo(() => {
    // Don't tint by palette — blossoms read pink regardless
    const m = new THREE.MeshStandardMaterial({ color: '#e8b8c8' });
    applyWindSway(m, { anchorY: -1.2, spanY: 2.4, amplitude: 0.14, flutter: 0.04 });
    return m;
  }, []);


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
    const merged = mergeCompatibleGeometries([body, clawL, clawR]);
    body.dispose(); clawL.dispose(); clawR.dispose();
    return merged ?? new THREE.BoxGeometry(0.3, 0.1, 0.2);
  }, []);
  const crabMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: '#ff4444' }), []);

  // Fish — tapered body + forked tail + dorsal fin (reads as fish even at distance)
  const fishGeometry = useMemo(() => {
    // Tapered body — wider head, narrow tail
    const body = new THREE.CylinderGeometry(0.06, 0.16, 0.5, 5);
    body.rotateZ(Math.PI / 2); // orient along X axis
    tintGradient(body, 0.78, 1.3); // countershading: dark back, bright belly
    // Forked tail — two small angled planes
    const tailL = new THREE.PlaneGeometry(0.14, 0.08);
    tailL.rotateY(Math.PI / 2);
    tailL.rotateX(0.35);
    tailL.translate(-0.32, 0.03, 0);
    tintFlat(tailL, 0.65);
    const tailR = new THREE.PlaneGeometry(0.14, 0.08);
    tailR.rotateY(Math.PI / 2);
    tailR.rotateX(-0.35);
    tailR.translate(-0.32, -0.03, 0);
    tintFlat(tailR, 0.65);
    // Dorsal fin — thin triangle on top
    const dorsal = new THREE.ConeGeometry(0.03, 0.1, 3);
    dorsal.translate(0.04, 0.13, 0);
    tintFlat(dorsal, 0.6); // darkest — reads as silhouette
    // Pectoral fin — small plane breaking the silhouette
    const pect = new THREE.PlaneGeometry(0.08, 0.05);
    pect.rotateX(-0.5);
    pect.translate(0.08, -0.04, 0.07);
    tintFlat(pect, 0.68);
    const merged = mergeCompatibleGeometries([body, tailL, tailR, dorsal, pect]);
    [body, tailL, tailR, dorsal, pect].forEach(g => g.dispose());
    return merged ?? new THREE.CylinderGeometry(0.1, 0.1, 0.4, 5);
  }, []);
  const fishMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#ffffff',
    metalness: 0.4,
    roughness: 0.25,       // glossy wet scales catch light as fish rotate
    side: THREE.DoubleSide,
    vertexColors: true,
    emissive: '#101820',
    emissiveIntensity: 0.15, // faint lift so fish are visible in dark water
  }), []);

  // Sea turtle — flattened shell + head + four paddle flippers
  const turtleGeometry = useMemo(() => {
    // Shell — flattened sphere
    const shell = new THREE.SphereGeometry(0.25, 6, 4);
    shell.scale(1.3, 0.35, 1.0);
    tintGradient(shell, 0.82, 1.18); // darker carapace, lighter plastron
    // Head — small sphere poking forward
    const head = new THREE.SphereGeometry(0.07, 5, 3);
    head.translate(-0.3, 0.02, 0);
    tintFlat(head, 1.12); // lighter skin vs shell
    // Front flippers — elongated planes angled out
    const fl = new THREE.PlaneGeometry(0.22, 0.08);
    fl.rotateX(-0.25);
    fl.translate(-0.08, -0.03, 0.2);
    tintFlat(fl, 0.68);
    const fr = new THREE.PlaneGeometry(0.22, 0.08);
    fr.rotateX(0.25);
    fr.translate(-0.08, -0.03, -0.2);
    tintFlat(fr, 0.68);
    // Rear flippers — smaller
    const bl = new THREE.PlaneGeometry(0.12, 0.06);
    bl.translate(0.2, -0.02, 0.14);
    tintFlat(bl, 0.7);
    const br = new THREE.PlaneGeometry(0.12, 0.06);
    br.translate(0.2, -0.02, -0.14);
    tintFlat(br, 0.7);
    const merged = mergeCompatibleGeometries([shell, head, fl, fr, bl, br]);
    [shell, head, fl, fr, bl, br].forEach(g => g.dispose());
    return merged ?? new THREE.SphereGeometry(0.2, 6, 4);
  }, []);
  const turtleMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#ffffff',
    metalness: 0.15,
    roughness: 0.5,        // moderate wet sheen on shell
    side: THREE.DoubleSide,
    vertexColors: true,
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
    const merged = mergeCompatibleGeometries([branch1, branch2, branch3, branch4]);
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
    const merged = mergeCompatibleGeometries([body, wingL, wingR]);
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

  }, [treeData, deadTreeData, broadleafData, baobabData, acaciaData, palmData, mangroveData, cypressData, datePalmData, bambooData, willowData, cherryData, orangeData, reedBedData, siltPatchData, saltStainData, cactusData, thornbushData, riceShootData, driftwoodData, beachRockData, crabData, coralData, fishData, turtleData, gullData]);

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
      const cloudsOn = useGameStore.getState().renderDebug.cloudShadows;
      const { windDirection, windSpeed } = useGameStore.getState();
      u.uCloudTime.value = state.clock.elapsedTime;
      u.uCloudWindDir.value.set(Math.sin(windDirection), Math.cos(windDirection));
      // Strength scales with wind speed so calm days have weaker, slower shadows.
      // Peak ~0.55: cloud patches darken sunlit ground by up to 55%.
      u.uCloudStrength.value = cloudsOn ? 0.35 + 0.20 * THREE.MathUtils.clamp(windSpeed, 0, 1) : 0;
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
        geometry={landTerrainGeometry}
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
