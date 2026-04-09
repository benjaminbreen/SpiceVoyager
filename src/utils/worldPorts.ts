import { CORE_PORTS } from './portArchetypes';
import type { PortDefinition } from './portArchetypes';

export const WORLD_PORT_COORDS: Record<string, [number, number]> = {
  goa: [73.88, 15.40],
  hormuz: [56.27, 27.06],
  malacca: [102.25, 2.19],
  aden: [45.03, 12.80],
  zanzibar: [39.19, -6.17],
  macau: [113.54, 22.20],
  mombasa: [39.66, -4.04],
  calicut: [75.78, 11.25],
  surat: [72.83, 21.17],
  muscat: [58.59, 23.61],
  mocha: [43.25, 13.32],
  bantam: [106.15, -6.02],
};

export type WorldPortSummary = Pick<PortDefinition, 'id' | 'name' | 'culture' | 'scale' | 'climate'> & {
  coords: [number, number];
};

export interface CampaignPortStateLike {
  worldSeed: number;
  devSoloPort: string | null;
  currentWorldPortId: string | null;
}

export const WORLD_PORTS: WorldPortSummary[] = CORE_PORTS
  .filter((port) => WORLD_PORT_COORDS[port.id])
  .map((port) => ({
    id: port.id,
    name: port.name,
    culture: port.culture,
    scale: port.scale,
    climate: port.climate,
    coords: WORLD_PORT_COORDS[port.id],
  }));

const SEA_LANE_GRAPH: Record<string, string[]> = {
  aden: ['mocha', 'mombasa'],
  bantam: ['calicut', 'macau', 'malacca'],
  calicut: ['bantam', 'goa', 'malacca', 'mocha', 'surat', 'zanzibar'],
  goa: ['calicut', 'hormuz', 'malacca', 'surat', 'zanzibar'],
  hormuz: ['goa', 'muscat', 'surat'],
  macau: ['bantam', 'malacca'],
  malacca: ['bantam', 'calicut', 'goa', 'macau'],
  mombasa: ['aden', 'muscat', 'zanzibar'],
  mocha: ['aden', 'calicut', 'muscat', 'surat'],
  muscat: ['hormuz', 'mombasa', 'mocha', 'surat'],
  surat: ['calicut', 'goa', 'hormuz', 'mocha', 'muscat'],
  zanzibar: ['calicut', 'goa', 'mombasa'],
};

export function getWorldPortById(portId: string | null): WorldPortSummary | null {
  if (!portId) return null;
  return WORLD_PORTS.find((port) => port.id === portId) ?? null;
}

export function getReachableWorldPortIds(portId: string): string[] {
  return SEA_LANE_GRAPH[portId] ?? [];
}

export function canDirectlySail(fromPortId: string, toPortId: string): boolean {
  return getReachableWorldPortIds(fromPortId).includes(toPortId);
}

export function getSeededWorldPortId(seed: number): string {
  if (WORLD_PORTS.length === 0) return 'goa';
  const index = Math.abs(seed) % WORLD_PORTS.length;
  return WORLD_PORTS[index]?.id ?? WORLD_PORTS[0].id;
}

export function resolveCampaignPortId(state: CampaignPortStateLike): string {
  return state.devSoloPort ?? state.currentWorldPortId ?? getSeededWorldPortId(state.worldSeed);
}

function toRadians(value: number): number {
  return value * Math.PI / 180;
}

function greatCircleKm(from: [number, number], to: [number, number]): number {
  const [fromLon, fromLat] = from;
  const [toLon, toLat] = to;
  const dLat = toRadians(toLat - fromLat);
  const dLon = toRadians(toLon - fromLon);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(fromLat)) * Math.cos(toRadians(toLat)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return 6371 * c;
}

export function estimateSeaTravel(fromPortId: string, toPortId: string) {
  const from = getWorldPortById(fromPortId);
  const to = getWorldPortById(toPortId);
  if (!from || !to) return null;

  const distanceKm = greatCircleKm(from.coords, to.coords);
  const days = Math.max(1, Math.round(distanceKm / 550));
  const risk = distanceKm > 4500 ? 'High' : distanceKm > 2200 ? 'Moderate' : 'Low';

  return { days, risk, distanceKm };
}
