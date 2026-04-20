import { CORE_PORTS } from './portArchetypes';
import type { PortDefinition } from './portArchetypes';

export const WORLD_PORT_COORDS: Record<string, [number, number]> = {
  // Indian Ocean
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
  socotra: [53.87, 12.47],
  diu: [70.92, 20.71],
  // Europe
  lisbon: [-9.14, 38.71],
  amsterdam: [4.90, 52.37],
  seville: [-5.99, 37.39],
  london: [-0.08, 51.51],
  // West Africa
  elmina: [-1.35, 5.08],
  luanda: [13.23, -8.84],
  // Atlantic Americas
  salvador: [-38.51, -12.97],
  havana: [-82.36, 23.14],
  cartagena: [-75.51, 10.39],
  jamestown: [-76.78, 37.21],
  // Cape route
  cape: [18.42, -33.93],
};

/** Region groupings for the world map sidebar and quick-nav */
export type WorldRegion = 'europe' | 'westAfrica' | 'eastAfrica' | 'indianOcean' | 'eastIndies' | 'atlantic';

export const REGION_LABELS: Record<WorldRegion, string> = {
  europe: 'Europe',
  westAfrica: 'West Africa',
  eastAfrica: 'East Africa',
  indianOcean: 'Indian Ocean',
  eastIndies: 'East Indies',
  atlantic: 'Atlantic',
};

export const PORT_REGIONS: Record<string, WorldRegion> = {
  lisbon: 'europe',
  amsterdam: 'europe',
  seville: 'europe',
  london: 'europe',
  elmina: 'westAfrica',
  luanda: 'westAfrica',
  cape: 'westAfrica',
  mombasa: 'eastAfrica',
  zanzibar: 'eastAfrica',
  aden: 'eastAfrica',
  mocha: 'eastAfrica',
  socotra: 'eastAfrica',
  goa: 'indianOcean',
  calicut: 'indianOcean',
  surat: 'indianOcean',
  diu: 'indianOcean',
  hormuz: 'indianOcean',
  muscat: 'indianOcean',
  malacca: 'eastIndies',
  bantam: 'eastIndies',
  macau: 'eastIndies',
  salvador: 'atlantic',
  havana: 'atlantic',
  cartagena: 'atlantic',
  jamestown: 'atlantic',
};

/** Preset zoom views for the region quick-nav buttons */
export const REGION_VIEWS: Record<WorldRegion | 'world', { center: [number, number]; scale: number }> = {
  world:       { center: [30, 10],   scale: 0.35 },
  europe:      { center: [-2, 45],   scale: 1.8  },
  westAfrica:  { center: [10, -5],   scale: 0.9  },
  eastAfrica:  { center: [44, 5],    scale: 1.2  },
  indianOcean: { center: [72, 15],   scale: 0.9  },
  eastIndies:  { center: [105, 5],   scale: 1.4  },
  atlantic:    { center: [-55, 5],   scale: 0.5  },
};

export type WorldPortSummary = Pick<PortDefinition, 'id' | 'name' | 'culture' | 'scale' | 'climate'> & {
  coords: [number, number];
  region: WorldRegion;
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
    region: PORT_REGIONS[port.id] ?? 'indianOcean',
  }));

const SEA_LANE_GRAPH: Record<string, string[]> = {
  // Indian Ocean (existing)
  aden: ['mocha', 'mombasa', 'socotra'],
  bantam: ['calicut', 'macau', 'malacca'],
  calicut: ['bantam', 'diu', 'goa', 'malacca', 'mocha', 'surat', 'zanzibar'],
  diu: ['calicut', 'hormuz', 'muscat', 'surat'],
  goa: ['calicut', 'diu', 'hormuz', 'malacca', 'surat', 'zanzibar'],
  hormuz: ['diu', 'goa', 'muscat', 'surat'],
  macau: ['bantam', 'malacca'],
  malacca: ['bantam', 'calicut', 'goa', 'macau'],
  mocha: ['aden', 'calicut', 'muscat', 'surat'],
  muscat: ['diu', 'hormuz', 'mombasa', 'mocha', 'socotra', 'surat'],
  socotra: ['aden', 'mombasa', 'muscat'],
  surat: ['calicut', 'diu', 'goa', 'hormuz', 'mocha', 'muscat'],
  // East Africa (updated with Cape route)
  mombasa: ['aden', 'muscat', 'socotra', 'zanzibar', 'cape'],
  zanzibar: ['calicut', 'goa', 'mombasa', 'cape'],
  // Cape — the bottleneck connecting two halves
  cape: ['zanzibar', 'mombasa', 'luanda'],
  // West Africa
  luanda: ['cape', 'elmina', 'salvador'],
  elmina: ['luanda', 'amsterdam', 'lisbon', 'salvador'],
  // Europe
  lisbon: ['elmina', 'seville', 'london', 'amsterdam', 'salvador'],
  amsterdam: ['elmina', 'lisbon', 'london'],
  seville: ['lisbon', 'london', 'havana', 'cartagena'],
  london: ['amsterdam', 'lisbon', 'seville', 'jamestown'],
  // Atlantic Americas
  salvador: ['luanda', 'elmina', 'lisbon', 'havana'],
  havana: ['salvador', 'seville', 'cartagena'],
  cartagena: ['havana', 'seville'],
  // Jamestown is deliberately reachable only from London — this models the
  // Virginia Company monopoly on English Virginia trade (chartered 1606).
  // No other port has 'jamestown' in its adjacency.
  jamestown: ['london'],
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

/**
 * Waypoints for sea lanes that need to route around land.
 * Keys are sorted "portA:portB". Values are [lon, lat] waypoints
 * that the route passes through between the two ports.
 * Routes without waypoints use a simple curve.
 */
const SEA_LANE_WAYPOINTS: Record<string, [number, number][]> = {
  // ── Cape route: Africa circumnavigation ──────────────────────────
  // Cape → Mombasa: up the East African coast, staying offshore
  'cape:mombasa':   [[35, -28], [40, -18], [41, -8]],
  // Cape → Zanzibar: similar but cutting in earlier
  'cape:zanzibar':  [[33, -30], [38, -20], [39, -12]],
  // Cape → Luanda: up the West African coast
  'cape:luanda':    [[14, -30], [12, -22], [13, -14]],
  // Luanda → Elmina: along the Gulf of Guinea coast
  'elmina:luanda':  [[8, -4], [6, 0], [3, 3]],

  // ── European coastal routes ──────────────────────────────────────
  // Lisbon → London: around Iberian NW coast, across Bay of Biscay, through Channel
  'lisbon:london':  [[-9, 43], [-5, 48], [-2, 50]],
  // Lisbon → Amsterdam: same route but continues north
  'amsterdam:lisbon': [[-9, 43], [-5, 48], [0, 51]],
  // London → Amsterdam: short North Sea hop — no waypoints needed (it's over water)
  // Seville → London: out of Mediterranean, up Atlantic coast
  'london:seville': [[-8, 38], [-9, 43], [-5, 48], [-2, 50]],
  // Elmina → Amsterdam: along West African coast, past Iberia, up to Netherlands
  'amsterdam:elmina': [[-5, 10], [-12, 20], [-10, 35], [-9, 43], [-5, 48], [0, 51]],
  // Elmina → Lisbon: up the West African coast, past Canaries/Madeira
  'elmina:lisbon': [[-8, 10], [-14, 18], [-14, 28], [-10, 35]],

  // ── Atlantic crossings ───────────────────────────────────────────
  // Lisbon → Salvador: follows the volta do mar — south to Canaries, then west with trade winds
  'lisbon:salvador': [[-18, 30], [-25, 20], [-30, 8], [-35, -5]],
  // Elmina → Salvador: across the Atlantic narrows (shortest ocean crossing)
  'elmina:salvador': [[-10, 2], [-20, -2], [-30, -6]],
  // Seville → Havana: Canaries, then trade winds west across Atlantic
  'havana:seville': [[-15, 32], [-25, 28], [-45, 25], [-65, 24]],
  // Seville → Cartagena: similar route via Canaries and trade winds
  'cartagena:seville': [[-15, 32], [-25, 28], [-42, 22], [-58, 15]],
  // Salvador → Havana: up the Brazilian coast, through Caribbean
  'havana:salvador': [[-38, -8], [-42, 0], [-55, 8], [-68, 15], [-78, 20]],
  // Luanda → Salvador: straight across the South Atlantic (actually fairly direct)
  'luanda:salvador': [[5, -10], [-10, -12], [-25, -13]],
  // London → Jamestown: 1612 English crossings used the southern route (down
  // past the Canaries, west with the trade winds, then north up the Atlantic
  // coast of North America). Return via the Gulf Stream back north.
  'jamestown:london': [[-5, 48], [-12, 36], [-25, 28], [-50, 24], [-65, 28], [-75, 35]],

  // ── Indian Ocean long-haul routes ────────────────────────────────
  // Calicut → Zanzibar: across the western Indian Ocean
  'calicut:zanzibar': [[68, 8], [58, 2], [48, -3]],
  // Goa → Zanzibar: similar
  'goa:zanzibar': [[65, 10], [55, 2], [45, -3]],
  // Goa → Malacca: south of Sri Lanka, across Bay of Bengal, through strait
  'goa:malacca': [[76, 10], [80, 6], [85, 4], [92, 3], [98, 2]],
  // Calicut → Malacca: around Sri Lanka, across Bay of Bengal
  'calicut:malacca': [[78, 8], [82, 5], [88, 3], [95, 2], [99, 2]],
  // Calicut → Bantam: south of Sri Lanka, across Indian Ocean, through Sunda Strait
  'bantam:calicut': [[80, 6], [86, 3], [92, 1], [98, -1], [103, -4]],
  // Muscat → Mombasa: down the East African coast
  'mombasa:muscat': [[57, 20], [52, 14], [46, 5], [42, -2]],

  // ── Southeast Asia routes ────────────────────────────────────────
  // Malacca → Macau: through the South China Sea, east of Indochina
  'macau:malacca': [[104, 4], [107, 8], [110, 14], [112, 18]],
  // Bantam → Macau: north through Java Sea, east of Borneo, up to South China Sea
  'bantam:macau': [[108, -3], [110, 2], [112, 8], [113, 14]],

  // ── Arabian Peninsula routes (must go around, not through) ──────
  // Mocha → Muscat: out of Red Sea, around Arabian Peninsula south coast
  'mocha:muscat': [[45, 12], [48, 11.5], [52, 13], [56, 17], [58, 21]],
  // Mocha → Surat: out of Red Sea, across Arabian Sea
  'mocha:surat': [[46, 13], [50, 14], [58, 18], [65, 20]],
  // Diu → Hormuz: offshore, around the Makran coast
  'diu:hormuz': [[66, 22], [62, 24], [58, 26]],
  // Diu → Muscat: south along the coast, around to Oman
  'diu:muscat': [[66, 22], [62, 23]],
  // Goa → Hormuz: across the Arabian Sea, staying offshore
  'goa:hormuz': [[70, 18], [64, 22], [58, 25]],
  // Hormuz → Surat: out of the Gulf, along the Makran/Balochistan coast
  'hormuz:surat': [[58, 25], [62, 24], [66, 22], [70, 21]],

  // ── East African coast routes ────────────────────────────────────
  // Aden → Mombasa: down the Somali coast, staying offshore
  'aden:mombasa': [[46, 11], [48, 6], [44, 0], [41, -3]],
};

/** Look up waypoints for a sea lane edge. Returns empty array if none defined. */
export function getSeaLaneWaypoints(fromId: string, toId: string): [number, number][] {
  const key = [fromId, toId].sort().join(':');
  const waypoints = SEA_LANE_WAYPOINTS[key];
  if (!waypoints) return [];
  // If the sorted key has fromId first, waypoints are in the right order.
  // If reversed, we need to reverse the waypoints.
  const sorted = [fromId, toId].sort();
  return sorted[0] === fromId ? waypoints : [...waypoints].reverse();
}

/** Get all sea lane edges as [fromId, toId] pairs (deduplicated) */
export function getAllSeaLaneEdges(): [string, string][] {
  const seen = new Set<string>();
  const edges: [string, string][] = [];
  for (const [from, tos] of Object.entries(SEA_LANE_GRAPH)) {
    for (const to of tos) {
      const key = [from, to].sort().join(':');
      if (!seen.has(key)) {
        seen.add(key);
        edges.push([from, to]);
      }
    }
  }
  return edges;
}

/** Get the region of the player's current port */
export function getPortRegion(portId: string): WorldRegion {
  return PORT_REGIONS[portId] ?? 'indianOcean';
}
