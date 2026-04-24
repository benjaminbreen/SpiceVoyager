/**
 * hinterlandScenes.ts — Culturally-specific gatherings placed outside the urban core.
 *
 * Each scene is a durable prop (fire-ring, brazier mat, shrine, trough, etc.)
 * with 2–3 dwelling NPCs clustered around it. Placement is deterministic from
 * the world seed so the pedestrian spawner and the scene-prop renderer agree
 * on positions without needing to share state.
 */

import type { Building, Culture } from '../store/gameStore';
import { getTerrainData, getTerrainHeight, BiomeType } from './terrain';
import { getLandCharacter } from './landCharacter';
import { SEA_LEVEL } from '../constants/world';
import type { PedestrianType, FigureType } from './pedestrianSystem';

export type SceneKind =
  | 'shepherds-fire'       // European pastoral — stone fire-ring + sheep
  | 'charcoal-mound'       // European forest — smoldering earth dome
  | 'coffee-mat'           // Indian Ocean arid — brass pot + reed mat
  | 'roadside-shrine'      // Indian Ocean tropical — pillar stone + offerings
  | 'palm-wine-bench'      // West African tropical — palm stump + calabashes
  | 'cattle-trough';       // Atlantic savanna — stone trough + cattle

export interface SceneInstance {
  kind: SceneKind;
  x: number;
  z: number;
  y: number;
  seed: number;
}

export interface SceneLoadout {
  type: PedestrianType;
  figure: FigureType;
}

interface SceneDef {
  kind: SceneKind;
  culture: Culture;
  maxPerPort: number;
  filter: (x: number, z: number) => boolean;
  loadout: SceneLoadout[];
}

const GRASSY_BIOMES = new Set<BiomeType>(['grassland', 'scrubland']);
const ARID_BIOMES = new Set<BiomeType>(['desert', 'scrubland']);
const FORESTED_BIOMES = new Set<BiomeType>(['forest', 'jungle']);
const TROPICAL_BIOMES = new Set<BiomeType>(['jungle', 'forest', 'paddy']);
const SAVANNA_BIOMES = new Set<BiomeType>(['grassland', 'scrubland']);

const SCENES: SceneDef[] = [
  {
    kind: 'shepherds-fire',
    culture: 'European',
    maxPerPort: 2,
    filter: (x, z) => {
      const t = getTerrainData(x, z);
      if (t.height < SEA_LEVEL + 0.5 || t.slope > 0.45) return false;
      if (!GRASSY_BIOMES.has(t.biome)) return false;
      const lc = getLandCharacter(x, z);
      return lc.wilderness > 0.45 && lc.settlement < 0.18;
    },
    loadout: [
      { type: 'farmer', figure: 'man' },
      { type: 'farmer', figure: 'man' },
    ],
  },
  {
    kind: 'charcoal-mound',
    culture: 'European',
    maxPerPort: 1,
    filter: (x, z) => {
      const t = getTerrainData(x, z);
      if (t.height < SEA_LEVEL + 0.5 || t.slope > 0.5) return false;
      if (!FORESTED_BIOMES.has(t.biome)) return false;
      const lc = getLandCharacter(x, z);
      return lc.wilderness > 0.5 && lc.settlement < 0.15;
    },
    loadout: [
      { type: 'laborer', figure: 'man' },
      { type: 'laborer', figure: 'man' },
    ],
  },
  {
    kind: 'coffee-mat',
    culture: 'Indian Ocean',
    maxPerPort: 2,
    filter: (x, z) => {
      const t = getTerrainData(x, z);
      if (t.height < SEA_LEVEL + 0.5 || t.slope > 0.4) return false;
      if (!ARID_BIOMES.has(t.biome)) return false;
      const lc = getLandCharacter(x, z);
      return lc.wilderness > 0.35 && lc.settlement < 0.25;
    },
    loadout: [
      { type: 'religious', figure: 'man' },
      { type: 'religious', figure: 'man' },
      { type: 'merchant', figure: 'man' },
    ],
  },
  {
    kind: 'roadside-shrine',
    culture: 'Indian Ocean',
    maxPerPort: 2,
    filter: (x, z) => {
      const t = getTerrainData(x, z);
      if (t.height < SEA_LEVEL + 0.5 || t.slope > 0.5) return false;
      if (!TROPICAL_BIOMES.has(t.biome)) return false;
      const lc = getLandCharacter(x, z);
      return lc.sanctity > 0.35 && lc.settlement < 0.25;
    },
    loadout: [
      { type: 'religious', figure: 'man' },
      { type: 'farmer', figure: 'woman' },
    ],
  },
  {
    kind: 'palm-wine-bench',
    culture: 'West African',
    maxPerPort: 2,
    filter: (x, z) => {
      const t = getTerrainData(x, z);
      if (t.height < SEA_LEVEL + 0.5 || t.slope > 0.45) return false;
      if (!TROPICAL_BIOMES.has(t.biome)) return false;
      const lc = getLandCharacter(x, z);
      return lc.wilderness > 0.4 && lc.settlement < 0.25;
    },
    loadout: [
      { type: 'laborer', figure: 'man' },
      { type: 'laborer', figure: 'man' },
    ],
  },
  {
    kind: 'cattle-trough',
    culture: 'Atlantic',
    maxPerPort: 2,
    filter: (x, z) => {
      const t = getTerrainData(x, z);
      if (t.height < SEA_LEVEL + 0.5 || t.slope > 0.4) return false;
      if (!SAVANNA_BIOMES.has(t.biome)) return false;
      const lc = getLandCharacter(x, z);
      return lc.wilderness > 0.4 && lc.settlement < 0.2;
    },
    loadout: [
      { type: 'farmer', figure: 'man' },
      { type: 'farmer', figure: 'man' },
    ],
  },
];

function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Pure, deterministic placement. Same inputs always produce the same list, so
 * the pedestrian spawner and the renderer can call this independently.
 */
export function placeHinterlandScenes(
  portX: number,
  portZ: number,
  culture: Culture,
  buildings: Building[],
  seed: number,
): SceneInstance[] {
  const rng = mulberry32(seed * 97 + 2027);
  const out: SceneInstance[] = [];
  const MIN_DIST = 110;
  const MAX_DIST = 210;
  const BUILDING_CLEAR = 35;
  const SCENE_SPACING = 55;

  for (const def of SCENES) {
    if (def.culture !== culture) continue;
    let placed = 0;
    for (let attempt = 0; attempt < 80 && placed < def.maxPerPort; attempt++) {
      const angle = rng() * Math.PI * 2;
      const dist = MIN_DIST + rng() * (MAX_DIST - MIN_DIST);
      const x = portX + Math.cos(angle) * dist;
      const z = portZ + Math.sin(angle) * dist;

      let tooClose = false;
      for (let i = 0; i < buildings.length; i++) {
        const dx = buildings[i].position[0] - x;
        const dz = buildings[i].position[2] - z;
        if (dx * dx + dz * dz < BUILDING_CLEAR * BUILDING_CLEAR) { tooClose = true; break; }
      }
      if (tooClose) continue;

      for (let i = 0; i < out.length; i++) {
        const dx = out[i].x - x;
        const dz = out[i].z - z;
        if (dx * dx + dz * dz < SCENE_SPACING * SCENE_SPACING) { tooClose = true; break; }
      }
      if (tooClose) continue;

      if (!def.filter(x, z)) continue;

      const y = Math.max(getTerrainHeight(x, z), SEA_LEVEL + 0.3);
      out.push({
        kind: def.kind,
        x, z, y,
        seed: Math.floor(rng() * 1_000_000),
      });
      placed++;
    }
  }

  return out;
}

export function getSceneLoadout(kind: SceneKind): SceneLoadout[] {
  const def = SCENES.find(s => s.kind === kind);
  return def ? def.loadout : [];
}

export function getSceneLabel(kind: SceneKind): string {
  switch (kind) {
    case 'shepherds-fire':  return 'Shepherds';
    case 'charcoal-mound':  return 'Charcoal Kiln';
    case 'coffee-mat':      return 'Coffee Circle';
    case 'roadside-shrine': return 'Shrine';
    case 'palm-wine-bench': return 'Palm Wine';
    case 'cattle-trough':   return 'Cattle';
  }
}
