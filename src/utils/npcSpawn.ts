import { SEA_LEVEL } from '../constants/world';
import { getTerrainData } from './terrain';

const NPC_SPAWN_TARGET_COUNT = 5;
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

export function generateNpcSpawnPositions(
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
