import * as THREE from 'three';
import { getTerrainData, reseedTerrain, refreshTerrainPaletteCache, setActiveCanals, setMeshHalf, setNaturalIslands, setPlacedArchetypes } from './terrain';
import { generateMap, focusedPortConfig, devModeConfig } from './mapGenerator';
import { setLandCharacterBuildings } from './landCharacter';
import { SEA_LEVEL } from '../constants/world';
import type { WaterPaletteId } from './waterPalettes';
import { resolveCampaignPortId } from './worldPorts';
import { GRAZER_TERRAIN } from './animalTerrain';
import { resetVegetationDamage } from './impactShakeState';
import { buildTerrainSurfaceGeometry, COASTLINE_CLIP_LEVEL } from './terrainClipping';
import { buildBackgroundRingGeometry } from './backgroundRingGeometry';
import { type PalmEntry, palmCanopyCenter } from './flora';
import { generateNpcSpawnPositions } from './npcSpawn';
import { setTreeImpactTargets } from '../state/worldRegistries';
import { CORE_PORTS } from './portArchetypes';
import { generateCanalLayout } from './canalLayout';
import { getPOIsForPort } from './poiDefinitions';
import { nowMs, reportWorldLoadTiming, type WorldLoadTimingSink } from './worldLoadTimings';
import {
  grazerFootOffset,
  PRIMATE_FOOT_OFFSET,
  REPTILE_FOOT_OFFSET,
  type GrazerKind,
  type PrimateEntry,
  type ReptileEntry,
  type SpeciesInfo,
  type WadingBirdEntry,
} from './animalTypes';
import { pickFishType, randomShoalSize, type FishType } from './fishTypes';
import { generateEncounter, type OceanEncounterDef } from './oceanEncounters';

const FISH_SWIM_DEPTH = 0.85;
const TURTLE_SWIM_DEPTH = 0.65;

function appendCliffVertex(
  positions: number[],
  colors: number[],
  x: number,
  y: number,
  z: number,
  shade: number,
) {
  positions.push(x, y, z);
  colors.push(0.50 * shade, 0.36 * shade, 0.24 * shade);
}

function buildShoreCliffGeometry(
  posAttribute: THREE.BufferAttribute,
  stride: number,
  step: number,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];

  for (let iz = 1; iz < stride - 1; iz++) {
    for (let ix = 1; ix < stride - 1; ix++) {
      const idx = iz * stride + ix;
      const height = posAttribute.getZ(idx);
      if (height < SEA_LEVEL + 0.85) continue;

      const x = posAttribute.getX(idx);
      const y = posAttribute.getY(idx);
      const worldZ = -y;
      const terrain = getTerrainData(x, worldZ);
      const steepBank = terrain.coastSteepness > 0.62 || terrain.slope > 0.34;
      const sandyOrFlatEdge = terrain.beachFactor > 0.25 || terrain.wetSandFactor > 0.42 || terrain.coastSteepness < 0.48;
      if (!steepBank || sandyOrFlatEdge || terrain.coastFactor < 0.16 || height < SEA_LEVEL + 1.65) continue;

      const neighbors = [
        { dx: 1, dz: 0, tangentX: 0, tangentY: 1 },
        { dx: -1, dz: 0, tangentX: 0, tangentY: 1 },
        { dx: 0, dz: 1, tangentX: 1, tangentY: 0 },
        { dx: 0, dz: -1, tangentX: 1, tangentY: 0 },
      ];

      for (const n of neighbors) {
        const ni = (iz + n.dz) * stride + ix + n.dx;
        const neighborHeight = posAttribute.getZ(ni);
        if (neighborHeight > SEA_LEVEL + 0.15) continue;

        const drop = height - Math.max(neighborHeight, SEA_LEVEL - 0.25);
        if (drop < 1.8) continue;

        const half = step * 0.44;
        const topY = Math.max(height - 0.06, SEA_LEVEL + 0.75);
        const bottomY = Math.max(SEA_LEVEL - 0.18, Math.min(height - 0.65, neighborHeight + 0.12));
        const waterPush = step * 0.18;
        const ax = x - n.tangentX * half;
        const ay = y - n.tangentY * half;
        const bx = x + n.tangentX * half;
        const by = y + n.tangentY * half;
        const cx = bx + n.dx * waterPush;
        const cy = by + n.dz * waterPush;
        const dx = ax + n.dx * waterPush;
        const dy = ay + n.dz * waterPush;
        const shade = 0.78 + Math.min(0.26, drop * 0.035) + terrain.coastSteepness * 0.12;

        appendCliffVertex(positions, colors, ax, ay, topY, shade);
        appendCliffVertex(positions, colors, dx, dy, bottomY, shade * 0.70);
        appendCliffVertex(positions, colors, cx, cy, bottomY, shade * 0.66);
        appendCliffVertex(positions, colors, ax, ay, topY, shade);
        appendCliffVertex(positions, colors, cx, cy, bottomY, shade * 0.66);
        appendCliffVertex(positions, colors, bx, by, topY, shade * 0.92);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

export interface GenerateWorldDataArgs {
  worldSeed: number;
  worldSize: number;
  devSoloPort: string | null;
  currentWorldPortId: string | null;
  waterPaletteId: WaterPaletteId;
  onTiming?: WorldLoadTimingSink;
}

export function generateWorldData({
  worldSeed,
  worldSize,
  devSoloPort,
  currentWorldPortId,
  waterPaletteId,
  onTiming,
}: GenerateWorldDataArgs) {
  const totalStart = nowMs();
  let phaseStart = totalStart;
  // Reseed terrain noise before generating
  reseedTerrain(worldSeed);
  refreshTerrainPaletteCache();
  reportWorldLoadTiming(onTiming, 'terrain-reseed', phaseStart);
  phaseStart = nowMs();
  // Generate ports — use dev mode config if a solo port is selected
  const mapConfig = devSoloPort
    ? devModeConfig(devSoloPort, worldSeed)
    : focusedPortConfig(
        resolveCampaignPortId({ worldSeed, devSoloPort, currentWorldPortId }),
        worldSeed,
        worldSize
      );
  const portsData = generateMap(mapConfig);
  reportWorldLoadTiming(onTiming, 'map-and-city', phaseStart);
  phaseStart = nowMs();

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
  const oaks: { position: [number, number, number], scale: number, rotation: number }[] = [];
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
  const veniceCypressPort = portId === 'venice';
  // Date palm — every arid-palette port is plausible (oases + irrigated coast).
  const datePalmPort = waterPaletteId === 'arid';
  // Bamboo — native across all of monsoon/tropical Asia plus East Africa coast.
  // Atlantic colonial ports excluded (bamboo did spread there but later, and
  // the silhouette would read as anachronistic in 1612).
  const bambooPort = new Set([
    'nagasaki', 'macau',                      // East Asia
    'goa', 'calicut', 'surat', 'masulipatnam', 'colombo', 'diu', // Indian coast / Ceylon
    'malacca', 'manila', 'bantam',            // Southeast Asia
    'mombasa', 'zanzibar',                    // East African coast (Bambusa vulgaris)
  ]).has(portId);
  const cherryPort = portId === 'nagasaki';
  // Orange tree — Iberian + Spanish-Caribbean ports. Citrus aurantium (sour
  // orange) was already centuries-naturalized in Andalusia and Portugal by
  // 1612; sweet oranges (C. sinensis) had reached Iberia from Goa c.1500
  // and were planted in Cuba/Caribbean orchards within decades of contact.
  const orangePort = new Set(['seville', 'lisbon', 'havana', 'cartagena', 'veracruz']).has(portId);
  // Oak — temperate hardwood ports. Quercus robur (English oak) covered most
  // of southern England in 1612; Q. alba (white oak) and Q. rubra (red oak)
  // dominated Tidewater Virginia woodland that Jamestown was carved out of.
  // Amsterdam fits geographically too, but its riparian/willow signature is
  // already doing the marquee work, so keep oak to England + Virginia for now.
  const oakPort = new Set(['london', 'jamestown']).has(portId);
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
      case 'goa': case 'calicut': case 'surat': case 'colombo':
        return [{ color: col('#4a4a4a'), scale: 1.2, herdMin: 2, herdMax: 3, spawnChance: 0.0015, biomes: wet, kind: 'bovine',
          species: sp('Water buffalo', 'Bubalus bubalis', 'Yoked for paddy plowing; ghee from its milk is a trade staple.') }];
      case 'malacca': case 'bantam':
        return [{ color: col('#5a4a3a'), scale: 1.1, herdMin: 2, herdMax: 3, spawnChance: 0.001, biomes: wet, kind: 'bovine',
          species: sp('Javan banteng', 'Bos javanicus', 'Wild forest cattle of the archipelago; hide and horn are prized.') }];
      case 'macau':
        return [{ color: col('#2a2a28'), scale: 0.75, herdMin: 3, herdMax: 5, spawnChance: 0.0025, biomes: wet, kind: 'pig',
          species: sp('Chinese pig', 'Sus scrofa domesticus', 'Black-bristled domestic pig, kept by every Cantonese household; main fresh meat for ships at Macau.') }];
      case 'salvador': case 'cartagena': case 'veracruz':
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
  // Port center for proximity-biased spawns (orange groves, etc.). The map
  // origin is not necessarily the port location.
  const ORANGE_PORT_CX = portsData[0]?.position[0] ?? 0;
  const ORANGE_PORT_CZ = portsData[0]?.position[2] ?? 0;
  // Startup is CPU-bound on terrain/world generation. A slightly coarser
  // mesh keeps the local-port terrain readable while cutting mount-time
  // vertex work materially.
  const segments = Math.min(360, Math.round(size * 0.36));
  const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
  const colors = new Float32Array(geometry.attributes.position.count * 3);
  const posAttribute = geometry.attributes.position;

  const isLand = new Uint8Array(posAttribute.count);
  const shoreColorPreserve = new Float32Array(posAttribute.count);
  for (let i = 0; i < posAttribute.count; i++) {
    const x = posAttribute.getX(i);
    const y_orig = posAttribute.getY(i); // Plane is created in XY
    const worldZ = -y_orig; // We rotate it -90 degrees on X later

    const terrain = getTerrainData(x, worldZ);
    const { height, biome, color, moisture, coastFactor, reefFactor, paddyFlooded, coastSteepness, shallowFactor, surfFactor, wetSandFactor, beachFactor, slope } = terrain;
    posAttribute.setZ(i, height);
    if (height > SEA_LEVEL - 2) isLand[i] = 1;

    colors[i * 3] = color[0];
    colors[i * 3 + 1] = color[1];
    colors[i * 3 + 2] = color[2];
    const lowShoreShelf = coastFactor * Math.max(0, 1 - Math.min(1, (height - (SEA_LEVEL + 0.35)) / 4.85));
    shoreColorPreserve[i] = Math.max(wetSandFactor, beachFactor, surfFactor * 0.72, lowShoreShelf * 0.58);

    // Flora & Fauna placement
    const rand = Math.random();
    // Per-vertex tree exclusion: only one woody tree per vertex. Without this,
    // a vertex with high rand passes multiple tree-type thresholds (e.g. cypress
    // 0.992 + orange 0.995) and two trees end up sharing the same trunk position.
    // Set when any tall tree is placed; later checks short-circuit on it.
    // Bushes/decals (thornbushes, reeds, rocks, etc.) are exempt.
    let treePlaced = false;

    if (biome === 'forest' || biome === 'jungle') {
      // In tropical/monsoon lowlands, palms replace most cone trees.
      // Skip palms entirely in temperate ports (London, Amsterdam, etc.)
      const isTropicalLow = moisture > 0.45 && height < 8 && waterPaletteId !== 'temperate';
      if (isTropicalLow) {
        // Palms dominate — dense in jungle, moderate in forest
        if (!treePlaced && rand > (biome === 'jungle' ? 0.88 : 0.95) && palms.length < 500) {
          palms.push({
            position: [x, height, worldZ],
            scale: 1.008 + Math.random() * 1.44,
            lean: 0.03 + Math.random() * 0.15,
            rotation: Math.random() * Math.PI * 2,
          });
          treePlaced = true;
        }
        // Broadleaf tropical hardwoods (mango, teak, jackfruit) fill the canopy
        if (!treePlaced && rand > 0.97 && broadleafs.length < 400) {
          broadleafs.push({ position: [x, height, worldZ], scale: 0.5 + Math.random() * 1.2 });
          treePlaced = true;
        }
      } else if (waterPaletteId === 'temperate') {
        if (oakPort) {
          // Oak-dominated temperate woodland. Most spawns are oaks; conifers
          // remain as a sparse accent so the canopy isn't a monoculture.
          if (!treePlaced && rand > 0.978 && oaks.length < 280) {
            oaks.push({
              position: [x, height, worldZ],
              scale: 0.75 + Math.random() * 0.85,
              rotation: Math.random() * Math.PI * 2,
            });
            treePlaced = true;
          } else if (!treePlaced && rand > 0.995) {
            trees.push({ position: [x, height, worldZ], scale: 0.5 + Math.random() * 1.5 });
            treePlaced = true;
          }
        } else if (!treePlaced && rand > (biome === 'jungle' ? 0.9 : 0.98)) {
          // Temperate highlands — standard cone trees (fir, pine)
          trees.push({ position: [x, height, worldZ], scale: 0.5 + Math.random() * 1.5 });
          treePlaced = true;
        }
      } else {
        // Non-temperate highlands — broadleaf (cork oak, olive, cloud forest)
        if (!treePlaced && rand > (biome === 'jungle' ? 0.9 : 0.98) && broadleafs.length < 400) {
          broadleafs.push({ position: [x, height, worldZ], scale: 0.5 + Math.random() * 1.5 });
          treePlaced = true;
        }
      }
      // Bamboo groves across monsoon/tropical Asia + East African coast
      if (!treePlaced && bambooPort && rand > 0.965 && bamboos.length < 200 && height < 14) {
        bamboos.push({
          position: [x, height, worldZ],
          scale: 0.55 + Math.random() * 0.6,
          rotation: Math.random() * Math.PI * 2,
        });
        treePlaced = true;
      }
      // Cherry blossoms — only Nagasaki, scattered through forest. Bumped
      // density so the pink canopy actually reads as a Nagasaki signature
      // rather than a once-per-walk surprise.
      if (!treePlaced && cherryPort && rand > 0.987 && cherries.length < 110 && height < 12) {
        cherries.push({ position: [x, height, worldZ], scale: 0.6 + Math.random() * 0.5 });
        treePlaced = true;
      }
      // Cypress in Mediterranean + Persian Gulf forest — sparse, on slopes
      if (!treePlaced && cypressPort && rand > (veniceCypressPort ? 0.986 : 0.992) && cypresses.length < (veniceCypressPort ? 130 : 80)) {
        cypresses.push({ position: [x, height, worldZ], scale: 1.02 + Math.random() * 0.66 });
        treePlaced = true;
      }
      // Orange grove — Iberian/Caribbean cultivated lowlands. Forest biome
      // sits at biomeHeight > 10, so finalHeight is rarely under 9; widen
      // the cap to catch the lower-elevation hillside groves.
      if (!treePlaced && orangePort && oranges.length < 120 && height < 14) {
        const dx = x - ORANGE_PORT_CX;
        const dz = worldZ - ORANGE_PORT_CZ;
        const distSq = dx * dx + dz * dz;
        // Soft 420-unit envelope around the port — scattered, not a tight ring.
        if (distSq < 420 * 420 && rand > 0.995) {
          oranges.push({
            position: [x, height, worldZ],
            scale: 1.05 + Math.random() * 0.65,
            rotation: Math.random() * Math.PI * 2,
          });
          treePlaced = true;
        }
      }
      // Willow — temperate/Mediterranean low-elevation moist forest (riparian)
      if (!treePlaced && (waterPaletteId === 'temperate' || mediterraneanPort)
          && height < 5 && moisture > 0.55 && rand > 0.992 && willows.length < 60) {
        willows.push({
          position: [x, height, worldZ],
          scale: 0.7 + Math.random() * 0.5,
          rotation: Math.random() * Math.PI * 2,
        });
        treePlaced = true;
      }
    } else if (biome === 'swamp') {
      if (!treePlaced && rand > 0.997) {
        deadTrees.push({ position: [x, height, worldZ], scale: 0.5 + Math.random() * 1.0 });
        treePlaced = true;
      }
    } else if (biome === 'desert' || biome === 'arroyo') {
      if (!treePlaced && rand > 0.99) {
        cacti.push({ position: [x, height, worldZ], scale: 0.5 + Math.random() * 1.0 });
        treePlaced = true;
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
      if (!treePlaced && rand > 0.998) {
        cacti.push({ position: [x, height, worldZ], scale: 0.3 + Math.random() * 0.6 });
        treePlaced = true;
      }
      // Umbrella acacia in scrubland (African + arid ports)
      if (!treePlaced && usesAcacia && rand > 0.993 && acacias.length < 120) {
        acacias.push({ position: [x, height, worldZ], scale: 0.6 + Math.random() * 0.8, rotation: Math.random() * Math.PI * 2 });
        treePlaced = true;
      }
      // Baobab in African scrubland — sparse, majestic
      if (!treePlaced && africanPort && rand > 0.997 && baobabs.length < 40) {
        baobabs.push({ position: [x, height, worldZ], scale: 0.7 + Math.random() * 0.6, rotation: Math.random() * Math.PI * 2 });
        treePlaced = true;
      }
      // Cypress dotting Mediterranean + Persian scrubland
      if (!treePlaced && cypressPort && rand > (veniceCypressPort ? 0.988 : 0.994) && cypresses.length < (veniceCypressPort ? 130 : 80)) {
        cypresses.push({ position: [x, height, worldZ], scale: 0.96 + Math.random() * 0.66 });
        treePlaced = true;
      }
      // Orange grove edge — Iberian/Caribbean dry-lowland
      if (!treePlaced && orangePort && oranges.length < 120) {
        const dx = x - ORANGE_PORT_CX;
        const dz = worldZ - ORANGE_PORT_CZ;
        const distSq = dx * dx + dz * dz;
        if (distSq < 420 * 420 && rand > 0.9955) {
          oranges.push({
            position: [x, height, worldZ],
            scale: 1.05 + Math.random() * 0.55,
            rotation: Math.random() * Math.PI * 2,
          });
          treePlaced = true;
        }
      }
      // Date palm in arid scrubland (oasis hint)
      if (!treePlaced && datePalmPort && rand > 0.996 && datePalms.length < 200 && moisture > 0.25) {
        datePalms.push({
          position: [x, height, worldZ],
          scale: 1.18 + Math.random() * 0.94,
          lean: (Math.random() - 0.5) * 0.04, // nearly upright
          rotation: Math.random() * Math.PI * 2,
        });
        treePlaced = true;
      }
    } else if (biome === 'grassland') {
      // Umbrella acacia dotting the savanna
      if (!treePlaced && usesAcacia && rand > 0.994 && acacias.length < 120) {
        acacias.push({ position: [x, height, worldZ], scale: 0.6 + Math.random() * 0.8, rotation: Math.random() * Math.PI * 2 });
        treePlaced = true;
      }
      // Scattered baobabs on African grassland
      if (!treePlaced && africanPort && rand > 0.998 && baobabs.length < 40) {
        baobabs.push({ position: [x, height, worldZ], scale: 0.8 + Math.random() * 0.7, rotation: Math.random() * Math.PI * 2 });
        treePlaced = true;
      }
      // Parkland / hedgerow oaks — the lone-tree-in-pasture silhouette of
      // English commons and Virginia clearings. Sparser than woodland oaks.
      if (!treePlaced && oakPort && rand > 0.9955 && oaks.length < 280) {
        oaks.push({
          position: [x, height, worldZ],
          scale: 0.85 + Math.random() * 0.95,
          rotation: Math.random() * Math.PI * 2,
        });
        treePlaced = true;
      }
      // Cherry orchards on cultivated rural plains around Nagasaki.
      if (!treePlaced && cherryPort && rand > 0.993 && cherries.length < 110) {
        cherries.push({ position: [x, height, worldZ], scale: 0.65 + Math.random() * 0.45 });
        treePlaced = true;
      }
      // Orange groves on cultivated lowland — the canonical orchard biome
      // for Seville's Guadalquivir floodplain and Cuban / Cartagenan plains.
      // Density boost inside ~260 units of the city core so the orchard belt
      // actually reads as a ring of yellow-fruited trees around the harbor.
      if (!treePlaced && orangePort && oranges.length < 120) {
        const dx = x - ORANGE_PORT_CX;
        const dz = worldZ - ORANGE_PORT_CZ;
        const distSq = dx * dx + dz * dz;
        // Grassland is the canonical orchard biome — slightly denser than
        // forest/scrubland, but still scattered.
        if (distSq < 420 * 420 && rand > 0.9935) {
          oranges.push({
            position: [x, height, worldZ],
            scale: 1.05 + Math.random() * 0.65,
            rotation: Math.random() * Math.PI * 2,
          });
          treePlaced = true;
        }
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
          scale: 1.512 + Math.random() * 1.4112,
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
      if (rand > 0.88 && reedEdge > 0.20 && reedBeds.length < 560) {
        reedBeds.push({
          position: [x, height + 0.03, worldZ],
          scale: 0.45 + Math.random() * 0.55,
          rotation: Math.random() * Math.PI * 2,
        });
      }
      if (rand < 0.24 * flatness && siltPatches.length < 420) {
        siltPatches.push({
          position: [x, height + 0.035, worldZ],
          scale: 0.62 + Math.random() * 0.95,
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
      // Palm trees on tropical/monsoon beaches only.
      // Arid palm ports (Hormuz, Aden, etc.) get date palms instead of coconut palms.
      const stableSand = beachFactor > wetSandFactor && slope < 0.32;
      const palmBeachClimate = waterPaletteId === 'tropical' || waterPaletteId === 'monsoon' || waterPaletteId === 'arid';
      if (stableSand && moisture > 0.35 && palmBeachClimate && rand > 0.94) {
        if (datePalmPort && datePalms.length < 200) {
          datePalms.push({
            position: [x, height, worldZ],
            scale: 1.24 + Math.random() * 1.08,
            lean: (Math.random() - 0.5) * 0.06,
            rotation: Math.random() * Math.PI * 2,
          });
        } else if (!datePalmPort && palms.length < 500) {
          palms.push({
            position: [x, height, worldZ],
            scale: 1.008 + Math.random() * 1.152,
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

    const broadTidalFlat =
      biome !== 'tidal_flat'
      && biome !== 'mangrove'
      && height > SEA_LEVEL - 0.05
      && height < SEA_LEVEL + 4.8
      && slope < 0.24
      && coastSteepness < 0.52
      && coastFactor > 0.16
      && wetSandFactor + surfFactor + beachFactor * 0.45 > 0.14;
    if (broadTidalFlat) {
      const flatness = Math.max(0, 1 - slope * 4);
      if (rand < 0.18 * flatness && siltPatches.length < 520) {
        siltPatches.push({
          position: [x, height + 0.04, worldZ],
          scale: 0.75 + Math.random() * 1.05,
          rotation: Math.random() * Math.PI * 2,
        });
      }
      if (rand > 0.92 && moisture > 0.44 && reedBeds.length < 620) {
        reedBeds.push({
          position: [x, height + 0.03, worldZ],
          scale: 0.4 + Math.random() * 0.5,
          rotation: Math.random() * Math.PI * 2,
        });
      }
    }

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
          const rInstanceScale = variant.scale * (0.9 + Math.random() * 0.3) * 2.4;
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
              scale: variant.scale * (0.9 + Math.random() * 0.2) * 2.25,
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
            const instanceScale = variant.scale * (0.85 + Math.random() * 0.3) * 2.4;
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
  reportWorldLoadTiming(onTiming, 'terrain-vertices-and-spawns', phaseStart);
  phaseStart = nowMs();

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
        const pInstanceScale = variant.scale * (0.85 + Math.random() * 0.3) * 2.25;
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
  reportWorldLoadTiming(onTiming, 'animal-postpasses', phaseStart);
  phaseStart = nowMs();

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
  reportWorldLoadTiming(onTiming, 'height-smoothing', phaseStart);
  phaseStart = nowMs();

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
      const preserve = shoreColorPreserve[idx];
      const originalIndex = idx * 3;
      if (preserve > 0.08) {
        const originalKeep = Math.min(0.82, preserve * 0.72);
        smoothed[originalIndex] = r / count * (1 - originalKeep) + colors[originalIndex] * originalKeep;
        smoothed[originalIndex + 1] = g / count * (1 - originalKeep) + colors[originalIndex + 1] * originalKeep;
        smoothed[originalIndex + 2] = b / count * (1 - originalKeep) + colors[originalIndex + 2] * originalKeep;
      } else {
        smoothed[originalIndex] = r / count;
        smoothed[originalIndex + 1] = g / count;
        smoothed[originalIndex + 2] = b / count;
      }
    }
  }
  reportWorldLoadTiming(onTiming, 'color-smoothing', phaseStart);
  phaseStart = nowMs();

  geometry.setAttribute('color', new THREE.BufferAttribute(smoothed, 3));
  const cliffFaceGeometry = buildShoreCliffGeometry(posAttribute as THREE.BufferAttribute, stride, size / segments);
  const landGeometry = buildTerrainSurfaceGeometry(geometry, true, COASTLINE_CLIP_LEVEL);
  geometry.dispose();
  reportWorldLoadTiming(onTiming, 'terrain-geometry-build', phaseStart);
  phaseStart = nowMs();

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
  reportWorldLoadTiming(onTiming, 'background-ring', phaseStart);
  phaseStart = nowMs();
  resetVegetationDamage();
  const palmCenter = new THREE.Vector3();

  setTreeImpactTargets([
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
    ...oaks.map((tree, index) => ({
      kind: 'oak' as const,
      index,
      x: tree.position[0],
      y: tree.position[1] + tree.scale * 3.0,
      z: tree.position[2],
      radius: Math.max(1.2, tree.scale * 1.7),
    })),
    ...mangroves.map((tree, index) => ({
      kind: 'mangrove' as const,
      index,
      x: tree.position[0],
      y: tree.position[1] + tree.scale * 1.1,
      z: tree.position[2],
      radius: Math.max(0.8, tree.scale * 1.1),
    })),
  ]);
  reportWorldLoadTiming(onTiming, 'impact-targets', phaseStart);
  reportWorldLoadTiming(onTiming, 'total', totalStart);

  return {
    landTerrainGeometry: landGeometry,
    cliffFaceGeometry,
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
    oakData: oaks,
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
}

export type GeneratedWorldData = ReturnType<typeof generateWorldData>;

export function registerGeneratedWorldRuntime(args: GenerateWorldDataArgs, data: GeneratedWorldData) {
  reseedTerrain(args.worldSeed);
  refreshTerrainPaletteCache();
  const size = args.devSoloPort ? 1000 : 900;
  setMeshHalf(size / 2);

  const portId = resolveCampaignPortId(args);
  const portDef = CORE_PORTS.find((p) => p.id === portId);
  setPlacedArchetypes(portDef && portDef.geography !== 'archipelago'
    ? [{ def: portDef, cx: 0, cz: 0 }]
    : []);

  setActiveCanals(data.generatedPorts.flatMap((port) => {
    const def = CORE_PORTS.find((p) => p.id === port.id);
    return def?.canalLayout
      ? [{ layout: generateCanalLayout(port.position[0], port.position[2], def.canalLayout), cx: port.position[0], cz: port.position[2] }]
      : [];
  }));

  setNaturalIslands(data.generatedPorts.flatMap((port) =>
    getPOIsForPort(port)
      .filter((poi) => poi.kind === 'natural'
        && !poi.generated
        && (poi.location.kind === 'hinterland' || poi.location.kind === 'coords'))
      .map((poi) => {
        const [lx, lz] = (poi.location as { position: [number, number] }).position;
        return {
          cx: port.position[0] + lx,
          cz: port.position[2] + lz,
          innerRadius: 30,
          outerRadius: 60,
          peakHeight: 2.5,
        };
      })
  ));

  setLandCharacterBuildings(data.generatedPorts.flatMap((p) => p.buildings));

  const palmCenter = new THREE.Vector3();
  setTreeImpactTargets([
    ...data.treeData.map((tree, index) => ({
      kind: 'tree' as const,
      index,
      x: tree.position[0],
      y: tree.position[1] + tree.scale * 2.2,
      z: tree.position[2],
      radius: Math.max(0.85, tree.scale * 1.35),
    })),
    ...data.broadleafData.map((tree, index) => ({
      kind: 'broadleaf' as const,
      index,
      x: tree.position[0],
      y: tree.position[1] + tree.scale * 2.3,
      z: tree.position[2],
      radius: Math.max(1.0, tree.scale * 1.45),
    })),
    ...data.palmData.map((tree, index) => ({
      kind: 'palm' as const,
      index,
      x: palmCanopyCenter(tree, palmCenter).x,
      y: palmCenter.y,
      z: palmCenter.z,
      radius: Math.max(1.05, tree.scale * 1.65),
    })),
    ...data.baobabData.map((tree, index) => ({
      kind: 'baobab' as const,
      index,
      x: tree.position[0],
      y: tree.position[1] + tree.scale * 2.4,
      z: tree.position[2],
      radius: Math.max(1.1, tree.scale * 1.6),
    })),
    ...data.acaciaData.map((tree, index) => ({
      kind: 'acacia' as const,
      index,
      x: tree.position[0],
      y: tree.position[1] + tree.scale * 2.5,
      z: tree.position[2],
      radius: Math.max(1.0, tree.scale * 1.65),
    })),
    ...data.mangroveData.map((tree, index) => ({
      kind: 'mangrove' as const,
      index,
      x: tree.position[0],
      y: tree.position[1] + tree.scale * 1.1,
      z: tree.position[2],
      radius: Math.max(0.8, tree.scale * 1.1),
    })),
    ...data.cypressData.map((tree, index) => ({
      kind: 'cypress' as const,
      index,
      x: tree.position[0],
      y: tree.position[1] + tree.scale * 2.6,
      z: tree.position[2],
      radius: Math.max(0.8, tree.scale * 1.1),
    })),
    ...data.datePalmData.map((tree, index) => ({
      kind: 'datePalm' as const,
      index,
      x: tree.position[0],
      y: tree.position[1] + tree.scale * 4.5,
      z: tree.position[2],
      radius: Math.max(1.0, tree.scale * 1.4),
    })),
    ...data.bambooData.map((tree, index) => ({
      kind: 'bamboo' as const,
      index,
      x: tree.position[0],
      y: tree.position[1] + tree.scale * 2.0,
      z: tree.position[2],
      radius: Math.max(0.7, tree.scale * 1.0),
    })),
    ...data.willowData.map((tree, index) => ({
      kind: 'willow' as const,
      index,
      x: tree.position[0],
      y: tree.position[1] + tree.scale * 2.0,
      z: tree.position[2],
      radius: Math.max(1.0, tree.scale * 1.5),
    })),
    ...data.cherryData.map((tree, index) => ({
      kind: 'cherry' as const,
      index,
      x: tree.position[0],
      y: tree.position[1] + tree.scale * 2.3,
      z: tree.position[2],
      radius: Math.max(0.95, tree.scale * 1.4),
    })),
    ...data.orangeData.map((tree, index) => ({
      kind: 'orange' as const,
      index,
      x: tree.position[0],
      y: tree.position[1] + tree.scale * 1.7,
      z: tree.position[2],
      radius: Math.max(0.85, tree.scale * 1.2),
    })),
    ...data.oakData.map((tree, index) => ({
      kind: 'oak' as const,
      index,
      x: tree.position[0],
      y: tree.position[1] + tree.scale * 3.0,
      z: tree.position[2],
      radius: Math.max(1.2, tree.scale * 1.7),
    })),
  ]);
}
