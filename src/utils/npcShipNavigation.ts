import { getMeshHalf, getTerrainHeight } from './terrain';
import type { NpcCombatPosture } from './npcCombat';

const NPC_DRAFT_BLOCK_HEIGHT = -0.8;
const WATER_TARGET_ATTEMPTS = 10;
const MAP_EDGE_MARGIN = 0.94;

const NPC_HULL_PROBE_POINTS: [number, number][] = [
  [0, 3.5],
  [0, -2],
  [-1.5, 0],
  [1.5, 0],
];

export function isNavigableWater(x: number, z: number) {
  const boundaryDist = getMeshHalf() * MAP_EDGE_MARGIN;
  if (Math.abs(x) > boundaryDist || Math.abs(z) > boundaryDist) return false;
  return getTerrainHeight(x, z) <= NPC_DRAFT_BLOCK_HEIGHT;
}

export function findWaterTarget(originX: number, originZ: number, radius: number, preferredAngle?: number): [number, number] | null {
  for (let attempt = 0; attempt < WATER_TARGET_ATTEMPTS; attempt++) {
    const spread = preferredAngle === undefined ? Math.PI * 2 : Math.PI * (0.25 + attempt * 0.12);
    const angle = preferredAngle === undefined
      ? Math.random() * Math.PI * 2
      : preferredAngle + (Math.random() - 0.5) * spread;
    const distance = radius * (0.45 + Math.random() * 0.65);
    const x = originX + Math.sin(angle) * distance;
    const z = originZ + Math.cos(angle) * distance;
    if (isNavigableWater(x, z)) return [x, z];
  }
  return null;
}

export function canNpcMoveTo(x: number, z: number, rotation: number) {
  for (const [px, pz] of NPC_HULL_PROBE_POINTS) {
    const worldX = x + Math.sin(rotation) * pz + Math.cos(rotation) * px;
    const worldZ = z + Math.cos(rotation) * pz - Math.sin(rotation) * px;
    if (!isNavigableWater(worldX, worldZ)) return false;
  }
  return true;
}

export function angleDelta(a: number, b: number) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function speedForNpcPosture(posture: NpcCombatPosture, baseSpeed: number) {
  if (posture === 'flee') return baseSpeed * 2.5;
  if (posture === 'evade') return baseSpeed * 1.7;
  if (posture === 'engage' || posture === 'pursue') return baseSpeed * 1.25;
  return baseSpeed;
}

export function angleAwayFromLand(x: number, z: number, sampleDist = 2) {
  const hL = getTerrainHeight(x - sampleDist, z);
  const hR = getTerrainHeight(x + sampleDist, z);
  const hF = getTerrainHeight(x, z + sampleDist);
  const hB = getTerrainHeight(x, z - sampleDist);
  return Math.atan2(hL - hR, hB - hF);
}
