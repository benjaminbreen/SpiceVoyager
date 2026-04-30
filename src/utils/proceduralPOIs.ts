// ── Procedural Secular / Natural POIs ──────────────────────────────────────
//
// Complements proceduralShrines.ts. Shrines own religious sites; this
// generator adds a small number of non-shrine discoveries: natural features,
// production sites, and hazards/remnants.

import type { Building } from '../store/gameStore';
import type { Commodity } from './commodities';
import type { POIDefinition, POIKind, POILocation, POIReward } from './poiDefinitions';
import type { ClimateProfile, GeographicArchetype, PortDefinition } from './portArchetypes';
import type { PortScale } from './mapGenerator';
import type { POIMedallionKey } from './poiMedallions';
import { countBarrierCrossings, isPOIOnLand, isWreckShallow } from './proximityResolution';
import { getTerrainHeight } from './terrain';
import { SEA_LEVEL } from '../constants/world';

type Bucket = 'natural' | 'production' | 'hazard';

interface PortInput {
  id: string;
  name: string;
  scale: PortScale;
  position: [number, number, number];
  buildings: Building[];
  portDef?: Pick<PortDefinition, 'climate' | 'geography'>;
  inventory: Partial<Record<Commodity, number>>;
}

interface Archetype {
  bucket: Bucket;
  kind: POIKind;
  variant: string;
  name: string;
  sub: string;
  medallionKey: POIMedallionKey;
  knowledgeDomain: Commodity[];
  masteryGoods?: Commodity[];
  reward?: POIReward;
  climates?: ClimateProfile[];
  geographies?: GeographicArchetype[];
  commodities?: Commodity[];
  className?: POIDefinition['class'];
  prefersWater?: boolean;
}

export interface GeneratedProceduralPOIs {
  pois: POIDefinition[];
}

const SCALE_COUNTS: Record<PortScale, number> = {
  Small: 1,
  Medium: 1,
  Large: 1,
  'Very Large': 2,
  Huge: 2,
};

const ARCHETYPES: Archetype[] = [
  {
    bucket: 'natural',
    kind: 'natural',
    variant: 'water-source',
    name: 'Freshwater Spring',
    sub: 'clear water at the edge of the settlement',
    medallionKey: 'poi-water-source',
    knowledgeDomain: [],
    reward: { type: 'journal', entryKey: 'freshwater-spring' },
    climates: ['arid', 'mediterranean', 'temperate'],
    className: 'civic',
  },
  {
    bucket: 'natural',
    kind: 'natural',
    variant: 'cave',
    name: 'Limestone Cave',
    sub: 'cool shade beyond the road',
    medallionKey: 'poi-cave-spring',
    knowledgeDomain: [],
    reward: { type: 'cargo', commodityId: 'Ambergris', min: 1, max: 1, chance: 0.12 },
    geographies: ['island', 'coastal_island', 'crater_harbor', 'bay'],
    className: 'civic',
  },
  {
    bucket: 'natural',
    kind: 'natural',
    variant: 'sacred-mountain',
    name: 'Hill of Offerings',
    sub: 'a high place watched from the harbor road',
    medallionKey: 'poi-sacred-mountain',
    knowledgeDomain: [],
    reward: { type: 'journal', entryKey: 'sacred-mountain' },
    geographies: ['island', 'coastal_island', 'crater_harbor', 'bay', 'inlet'],
    className: 'civic',
  },
  {
    bucket: 'natural',
    kind: 'natural',
    variant: 'reef',
    name: 'Outer Reef',
    sub: 'broken water and bright coral heads',
    medallionKey: 'poi-reef-shoal',
    knowledgeDomain: ['Red Coral'],
    reward: { type: 'knowledge', commodityId: 'Red Coral', level: 1 },
    geographies: ['island', 'coastal_island', 'bay', 'strait'],
    className: 'civic',
    prefersWater: true,
  },
  {
    bucket: 'production',
    kind: 'garden',
    variant: 'spice-plantation',
    name: 'Spice Garden',
    sub: 'trained vines and drying mats',
    medallionKey: 'poi-spice-plantation',
    knowledgeDomain: ['Black Pepper', 'Ginger', 'Cardamom'],
    masteryGoods: ['Black Pepper'],
    reward: { type: 'knowledge', commodityId: 'Black Pepper', level: 1 },
    climates: ['tropical', 'monsoon'],
    commodities: ['Black Pepper', 'Ginger', 'Cardamom'],
    className: 'learned',
  },
  {
    bucket: 'production',
    kind: 'garden',
    variant: 'tobacco-shed',
    name: 'Tobacco Curing Shed',
    sub: 'hanging leaf under a low roof',
    medallionKey: 'poi-tobacco-shed',
    knowledgeDomain: ['Tobacco', 'Virginia Tobacco'],
    masteryGoods: ['Tobacco'],
    reward: { type: 'knowledge', commodityId: 'Tobacco', level: 1 },
    commodities: ['Tobacco', 'Virginia Tobacco'],
    className: 'mercantile',
  },
  {
    bucket: 'production',
    kind: 'naturalist',
    variant: 'indigo-vat',
    name: 'Indigo Vat',
    sub: 'dye liquor darkening in the heat',
    medallionKey: 'poi-indigo-vat',
    knowledgeDomain: ['Indigo'],
    masteryGoods: ['Indigo'],
    reward: { type: 'knowledge', commodityId: 'Indigo', level: 1 },
    commodities: ['Indigo'],
    className: 'mercantile',
  },
  {
    bucket: 'production',
    kind: 'naturalist',
    variant: 'sugar-mill',
    name: 'Sugar Press',
    sub: 'rollers, cane, and boiling pans',
    medallionKey: 'poi-sugar-mill',
    knowledgeDomain: ['Sugar'],
    masteryGoods: ['Sugar'],
    reward: { type: 'knowledge', commodityId: 'Sugar', level: 1 },
    commodities: ['Sugar'],
    className: 'mercantile',
  },
  {
    bucket: 'production',
    kind: 'naturalist',
    variant: 'pearl-bank',
    name: 'Pearl Bank',
    sub: 'shell heaps above the tide line',
    medallionKey: 'poi-pearl-bank',
    knowledgeDomain: ['Pearls'],
    masteryGoods: ['Pearls'],
    reward: { type: 'knowledge', commodityId: 'Pearls', level: 1 },
    commodities: ['Pearls'],
    geographies: ['island', 'coastal_island', 'bay', 'strait'],
    className: 'mercantile',
    prefersWater: true,
  },
  {
    bucket: 'hazard',
    kind: 'wreck',
    variant: 'shipwreck',
    name: 'Grounded Wreck',
    sub: 'a broken hull in shallow water',
    medallionKey: 'poi-shipwreck',
    knowledgeDomain: [],
    reward: { type: 'cargo', commodityId: 'Hides', min: 1, max: 2, chance: 0.25 },
    geographies: ['island', 'coastal_island', 'bay', 'strait', 'continental_coast'],
    className: 'civic',
    prefersWater: true,
  },
  {
    bucket: 'hazard',
    kind: 'ruin',
    variant: 'abandoned-fort',
    name: 'Abandoned Fort',
    sub: 'old walls above the roadstead',
    medallionKey: 'poi-abandoned-fort',
    knowledgeDomain: [],
    reward: { type: 'journal', entryKey: 'abandoned-fort' },
    geographies: ['island', 'coastal_island', 'bay', 'inlet', 'crater_harbor'],
    className: 'civic',
  },
  {
    bucket: 'hazard',
    kind: 'smugglers_cove',
    variant: 'cove',
    name: "Smugglers' Cove",
    sub: 'cargo hidden below the rocks',
    medallionKey: 'poi-caravanserai-cove',
    knowledgeDomain: [],
    reward: { type: 'cargo', commodityId: 'Black Pepper', min: 1, max: 2, chance: 0.18 },
    geographies: ['island', 'coastal_island', 'bay', 'inlet', 'continental_coast'],
    className: 'mercantile',
  },
  {
    bucket: 'hazard',
    kind: 'caravanserai',
    variant: 'roadside-caravanserai',
    name: 'Roadside Caravanserai',
    sub: 'a walled halt beyond the city track',
    medallionKey: 'poi-caravanserai-cove',
    knowledgeDomain: ['Frankincense', 'Myrrh'],
    reward: { type: 'knowledge', commodityId: 'Frankincense', level: 1 },
    climates: ['arid', 'mediterranean'],
    className: 'mercantile',
  },
];

export function generateProceduralPOIsForPort(port: PortInput, worldSeed: number): GeneratedProceduralPOIs {
  const rng = mulberry32((worldSeed * 13007) ^ hashStr(port.id) ^ 0x51f15e);
  const target = rollCount(port.scale, rng);
  if (target === 0) return { pois: [] };

  const picked: Archetype[] = [];
  const bucketOrder = shuffledBuckets(rng);
  for (const bucket of bucketOrder) {
    if (picked.length >= target) break;
    const candidate = pickArchetype(port, bucket, rng, picked);
    if (candidate) picked.push(candidate);
  }
  while (picked.length < target) {
    const candidate = pickArchetype(port, bucketOrder[picked.length % bucketOrder.length], rng, picked);
    if (!candidate) break;
    picked.push(candidate);
  }

  const pois: POIDefinition[] = [];
  const occupied = port.buildings.map((b) => ({ x: b.position[0], z: b.position[2], radius: 34 }));
  for (const archetype of picked) {
    const placed = placeArchetype(port, archetype, rng, occupied);
    if (!placed) continue;
    occupied.push({ x: placed[0], z: placed[1], radius: 70 });
    const id = `${port.id}-proc-${pois.length}-${archetype.variant}`;
    const location: POILocation = { kind: 'hinterland', position: placed };
    pois.push({
      id,
      name: archetype.name,
      sub: archetype.sub,
      kind: archetype.kind,
      class: archetype.className ?? 'civic',
      port: port.id,
      location,
      knowledgeDomain: archetype.knowledgeDomain,
      masteryGoods: archetype.masteryGoods ?? [],
      cost: { type: 'gold', amount: 0 },
      npcName: 'The site itself',
      npcRole: 'unattended place',
      lore: generatedLore(archetype, port.name),
      medallionKey: archetype.medallionKey,
      generated: true,
      poiVariant: archetype.variant,
      hasKeeper: false,
      reward: archetype.reward ?? { type: 'none' },
    });
  }

  return { pois };
}

function rollCount(scale: PortScale, rng: () => number): number {
  const cap = SCALE_COUNTS[scale];
  if (cap <= 1) return rng() < (scale === 'Small' ? 0.45 : 0.7) ? 1 : 0;
  return rng() < 0.45 ? 1 : cap;
}

function pickArchetype(port: PortInput, bucket: Bucket, rng: () => number, picked: Archetype[]): Archetype | null {
  const options = ARCHETYPES
    .filter((a) => a.bucket === bucket)
    .filter((a) => !picked.some((p) => p.variant === a.variant))
    .map((a) => ({ archetype: a, weight: archetypeWeight(a, port) }))
    .filter((entry) => entry.weight > 0);
  if (options.length === 0) return null;
  const total = options.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = rng() * total;
  for (const entry of options) {
    roll -= entry.weight;
    if (roll <= 0) return entry.archetype;
  }
  return options[options.length - 1].archetype;
}

function archetypeWeight(archetype: Archetype, port: PortInput): number {
  const climate = port.portDef?.climate;
  const geography = port.portDef?.geography;
  let weight = 1;
  if (archetype.climates) {
    if (!climate || !archetype.climates.includes(climate)) return 0;
    weight += 2;
  }
  if (archetype.geographies) {
    if (!geography || !archetype.geographies.includes(geography)) return 0;
    weight += 1.5;
  }
  if (archetype.commodities) {
    const hasCommodity = archetype.commodities.some((commodity) => (port.inventory[commodity] ?? 0) > 0);
    if (!hasCommodity) return 0;
    weight += 4;
  }
  return weight;
}

function placeArchetype(
  port: PortInput,
  archetype: Archetype,
  rng: () => number,
  occupied: Array<{ x: number; z: number; radius: number }>,
): [number, number] | null {
  const [portX, , portZ] = port.position;
  const minDist = archetype.prefersWater ? 120 : 135;
  const maxDist = archetype.prefersWater ? 250 : 275;
  for (let attempt = 0; attempt < 90; attempt++) {
    const angle = rng() * Math.PI * 2;
    const dist = minDist + Math.sqrt(rng()) * (maxDist - minDist);
    const x = portX + Math.cos(angle) * dist;
    const z = portZ + Math.sin(angle) * dist;
    if (occupied.some((item) => {
      const dx = item.x - x;
      const dz = item.z - z;
      return dx * dx + dz * dz < item.radius * item.radius;
    })) continue;

    if (archetype.kind === 'wreck') {
      if (!isWreckShallow(x, z)) continue;
    } else if (archetype.kind === 'natural' && archetype.prefersWater) {
      const h = getTerrainHeight(x, z);
      if (h > SEA_LEVEL + 0.5 || h < SEA_LEVEL - 6) continue;
    } else if (!isPOIOnLand(x, z, archetype.kind === 'caravanserai' ? 14 : 12)) {
      continue;
    }

    if (!archetype.prefersWater && attempt < 45 && countBarrierCrossings(portX, portZ, x, z) < 2) continue;
    return [x, z];
  }
  return null;
}

function shuffledBuckets(rng: () => number): Bucket[] {
  const buckets: Bucket[] = ['natural', 'production', 'hazard'];
  for (let i = buckets.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [buckets[i], buckets[j]] = [buckets[j], buckets[i]];
  }
  return buckets;
}

function generatedLore(archetype: Archetype, portName: string): string {
  if (archetype.bucket === 'production') {
    return `A working site outside ${portName}, useful for reading how goods are prepared before they reach the harbor.`;
  }
  if (archetype.bucket === 'hazard') {
    return `A place at the edge of ${portName}'s routes, noticed by sailors and road guides more often than by officials.`;
  }
  return `A natural feature near ${portName}, known locally as a landmark and a place to pause before returning to the road.`;
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6D2B79F5) >>> 0;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

