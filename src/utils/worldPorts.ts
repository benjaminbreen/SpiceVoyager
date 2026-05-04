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
  manila: [120.98, 14.60],
  nagasaki: [129.87, 32.75],
  masulipatnam: [81.14, 16.19],
  // Europe
  lisbon: [-9.14, 38.71],
  amsterdam: [4.90, 52.37],
  seville: [-5.99, 37.39],
  london: [-0.08, 51.51],
  venice: [12.34, 45.44],
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
  venice: 'europe',
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
  manila: 'eastIndies',
  nagasaki: 'eastIndies',
  masulipatnam: 'indianOcean',
  salvador: 'atlantic',
  havana: 'atlantic',
  cartagena: 'atlantic',
  jamestown: 'atlantic',
};

/**
 * Market trust per port. Scales fraud risk and serendipitous-upside chance on
 * Unknown (Level 0) purchases.
 *   1.0 = perfectly trustworthy major hub (no fraud, no surprises)
 *   0.0 = total shadiness (maximum fraud, maximum chance of hidden treasure)
 * Default when unset is 0.5. Major hubs have sophisticated regulation AND
 * sophisticated buyers who don't let undervalued goods slip through cheaply —
 * which is why low-trust remote ports are where both scams and finds happen.
 */
export const MARKET_TRUST: Record<string, number> = {
  // Major hubs — regulated, efficient, little fraud but also few surprises
  surat:     0.80,
  lisbon:    0.80,
  amsterdam: 0.85,
  london:    0.80,
  venice:    0.85,  // strict Republic regulation, sophisticated buyers
  goa:       0.75,
  malacca:   0.75,
  macau:     0.75,
  manila:    0.70,  // Spanish customs strict; Sangley Parián less so
  nagasaki:  0.75,  // Shogunate magistrates run a tight dock; Portuguese factors keep honest books
  masulipatnam: 0.60, // Busy but newer European factories — mid-tier market policing
  hormuz:    0.70,
  seville:   0.75,

  // Mid-tier — mixed reputation
  calicut:   0.60,
  muscat:    0.60,
  bantam:    0.60,
  havana:    0.65,
  cartagena: 0.60,
  mombasa:   0.55,
  diu:       0.55,
  zanzibar:  0.50,
  salvador:  0.55,
  mocha:     0.50,

  // Remote / shady — high fraud, high chance of unrecognized treasures
  aden:      0.40,
  socotra:   0.30,
  luanda:    0.35,
  elmina:    0.40,
  jamestown: 0.45,  // colonial frontier; honest but inexpert
  // cape: no market
};

/** Preset zoom views for the region quick-nav buttons */
export const REGION_VIEWS: Record<WorldRegion | 'world', { center: [number, number]; scale: number }> = {
  world:       { center: [30, 10],   scale: 0.35 },
  europe:      { center: [3, 45],    scale: 1.4  },  // widened east to include Venice
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
  bantam: ['calicut', 'macau', 'malacca', 'manila'],
  calicut: ['bantam', 'diu', 'goa', 'malacca', 'masulipatnam', 'mocha', 'surat', 'zanzibar'],
  diu: ['calicut', 'hormuz', 'muscat', 'surat'],
  goa: ['calicut', 'diu', 'hormuz', 'malacca', 'masulipatnam', 'surat', 'zanzibar'],
  hormuz: ['diu', 'goa', 'muscat', 'surat'],
  macau: ['bantam', 'malacca', 'manila', 'nagasaki'],
  malacca: ['bantam', 'calicut', 'goa', 'macau', 'manila', 'masulipatnam'],
  // Manila — Spanish capital of the Philippines. Reachable from Macau (the
  // Sangley junk trade), Bantam (Dutch competition), Malacca, and Nagasaki
  // (Red Seal junk trade up to Kyushu). The Acapulco-galleon link to Spanish
  // America is not yet modelled.
  manila: ['macau', 'bantam', 'malacca', 'nagasaki'],
  // Nagasaki — Kyushu inlet. Reached via the Nao do Trato from Macau and via
  // Red Seal / junk traffic from Manila. No coastal link down the Ryukyu chain
  // modelled separately.
  nagasaki: ['macau', 'manila'],
  // Masulipatnam — Coromandel. Bay of Bengal traffic to Malacca; around Ceylon
  // to the Malabar ports (Calicut, Goa).
  masulipatnam: ['malacca', 'calicut', 'goa'],
  mocha: ['aden', 'calicut', 'muscat', 'surat'],
  muscat: ['diu', 'hormuz', 'mombasa', 'mocha', 'socotra', 'surat'],
  socotra: ['aden', 'mombasa', 'muscat'],
  surat: ['calicut', 'diu', 'goa', 'hormuz', 'mocha', 'muscat'],
  // East Africa (updated with Cape route)
  mombasa: ['aden', 'muscat', 'socotra', 'zanzibar', 'cape'],
  zanzibar: ['calicut', 'goa', 'mombasa', 'cape'],
  // Cape — the bottleneck connecting two halves
  cape: ['zanzibar', 'mombasa', 'luanda', 'elmina', 'lisbon'],
  // West Africa
  luanda: ['cape', 'elmina', 'salvador'],
  elmina: ['luanda', 'amsterdam', 'lisbon', 'salvador', 'cape'],
  // Europe
  lisbon: ['elmina', 'seville', 'london', 'amsterdam', 'salvador', 'cape', 'venice'],
  amsterdam: ['elmina', 'lisbon', 'london'],
  seville: ['lisbon', 'london', 'havana', 'cartagena', 'venice'],
  london: ['amsterdam', 'lisbon', 'seville', 'jamestown'],
  // Venice — Adriatic terminus. Reachable from any Iberian port via the long
  // Mediterranean passage (Gibraltar → Sicily → Otranto → Adriatic). Levantine
  // ports (Alexandria, Aleppo, Constantinople) are not yet modelled.
  venice: ['lisbon', 'seville'],
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

// ════════════════════════════════════════════════════════════════════════════
// Sea-route gateway graph
//
// Ships funnel through the same historically attested choke points: the
// English Channel, the Bay of Biscay, Gibraltar, the Canaries, the Cape,
// Bab el-Mandeb, Hormuz, Malacca, Sunda. Instead of hand-placing waypoints
// per route, we define ~35 named gateways in deep ocean and a small edge
// graph between them. Any port-to-port route is a Dijkstra shortest path
// through this graph. Edges are hand-picked so the straight line between
// any two connected gateways stays in open water.
//
// Adding a new port = give it 1–2 gateways. Every route to/from it works.
// ════════════════════════════════════════════════════════════════════════════

export interface Gateway {
  coords: [number, number];
  /** Optional display label — rendered as italic text on the chart. */
  label?: string;
  /** Optional offset in pixels for the label, when the coords point isn't the best anchor. */
  labelOffset?: [number, number];
  /**
   * Visibility tier for the label.
   *  - 'primary'   = ocean basin / always visible
   *  - 'secondary' = sea / bay / gulf / iconic feature, visible at moderate zoom
   *  - 'detail'    = strait / small island / named coast, only at high zoom
   * Defaults to 'detail' if omitted.
   */
  labelTier?: 'primary' | 'secondary' | 'detail';
}

export const GATEWAYS: Record<string, Gateway> = {
  // ── Europe & approach ────────────────────────────────────────────
  'channel-w':     { coords: [-5, 49.5],   label: 'English Channel', labelTier: 'secondary' },
  'channel-e':     { coords: [2.5, 51.5] },
  'biscay':        { coords: [-7, 46],     label: 'Bay of Biscay', labelTier: 'secondary' },
  'iberia-nw':     { coords: [-11, 43] },
  'iberia-sw':     { coords: [-10, 37] },
  'gibraltar':     { coords: [-7.5, 36],   label: 'Str. of Gibraltar', labelOffset: [0, 18], labelTier: 'detail' },

  // ── Mediterranean ────────────────────────────────────────────────
  'alboran':       { coords: [-2, 36] },
  'sardinia-s':    { coords: [9, 38] },
  'sicily-strait': { coords: [11.5, 37],   label: 'Str. of Sicily', labelOffset: [0, 14], labelTier: 'detail' },
  'ionian':        { coords: [18, 37],     label: 'Ionian Sea', labelTier: 'detail' },
  'otranto':       { coords: [19, 40],     label: 'Str. of Otranto', labelTier: 'detail' },
  'adriatic-s':    { coords: [17.5, 42] },
  'adriatic-n':    { coords: [13.5, 44.5], label: 'Adriatic Sea', labelTier: 'secondary' },

  // ── Atlantic ─────────────────────────────────────────────────────
  'canaries':      { coords: [-17, 28],    label: 'Canary Is.', labelTier: 'detail' },
  'cape-verde':    { coords: [-22, 13],    label: 'Cape Verde Is.', labelTier: 'detail' },
  'azores':        { coords: [-30, 38],    label: 'Azores', labelTier: 'detail' },
  'atl-narrows':   { coords: [-25, 0] },
  'brazil-ne':     { coords: [-34, -6] },
  'w-africa-bulge':{ coords: [-18, 8] },

  // ── Caribbean & N. America ──────────────────────────────────────
  'windward':      { coords: [-62, 15] },
  'bahamas-e':     { coords: [-72, 23] },
  'florida-str':   { coords: [-80, 25] },
  'bermuda':       { coords: [-65, 32],    label: 'Bermuda', labelTier: 'detail' },
  'virginia-capes':{ coords: [-75, 37] },

  // ── West & South Africa ─────────────────────────────────────────
  'guinea':        { coords: [2, 2],       label: 'Gulf of Guinea', labelTier: 'secondary' },
  'luanda-approach':{ coords: [11, -9] },
  'south-atl-e':   { coords: [11, -22] },
  'cape-gh':       { coords: [18, -36] }, // labeled by the port of the same name

  // ── East Africa ─────────────────────────────────────────────────
  'natal':         { coords: [33, -28] },
  'mozambique':    { coords: [41, -15],    label: 'Mozambique Chan.', labelTier: 'secondary' },
  'zanzibar-app':  { coords: [41, -5] },

  // ── Horn of Africa / Red Sea ────────────────────────────────────
  'socotra-n':     { coords: [54, 14],     label: 'Socotra', labelTier: 'detail' },
  'horn-africa':   { coords: [51, 11],     label: 'Gulf of Aden', labelTier: 'secondary' },
  'bab-mandeb':    { coords: [44, 12.5] },

  // ── Arabian Sea & Persian Gulf ──────────────────────────────────
  'arabian-sea':   { coords: [62, 15],     label: 'Arabian Sea', labelTier: 'primary' },
  'oman':          { coords: [58, 21] },
  'hormuz-mouth':  { coords: [56.5, 26],   label: 'Str. of Hormuz', labelTier: 'detail' },

  // ── India ───────────────────────────────────────────────────────
  'gujarat':       { coords: [68, 22] },
  'malabar':       { coords: [73.5, 10] },

  // ── Eastern Indian Ocean ────────────────────────────────────────
  'ceylon-s':      { coords: [82, 5] },
  'bengal-bay':    { coords: [88, 8],      label: 'Bay of Bengal', labelTier: 'primary' },

  // ── SE Asia & South China Sea ───────────────────────────────────
  'malacca-n':     { coords: [100, 4],     label: 'Str. of Malacca', labelOffset: [-22, -10], labelTier: 'secondary' },
  'java-sea':      { coords: [109, -4],    label: 'Java Sea', labelTier: 'primary' },
  'sunda':         { coords: [105, -6.5],  label: 'Sunda Str.', labelOffset: [-32, 10], labelTier: 'detail' },
  'scs-s':         { coords: [111, 8],     label: 'South China Sea', labelTier: 'primary' },
  'scs-n':         { coords: [115, 18] },
  'manila-app':    { coords: [119, 14] },   // Manila Bay approach off Luzon

  // ── Coromandel (east coast of India) ────────────────────────────
  'coromandel':    { coords: [82, 13],     label: 'Coromandel Coast', labelOffset: [0, 28], labelTier: 'detail' },

  // ── Kyushu corridor — Macau/Manila → Nagasaki ───────────────────
  // Nao do Trato route: along Taiwan's eastern flank, up through the Ryukyu
  // chain, into the approaches of Nagasaki's fjord on the west coast of Kyushu.
  'luzon-n':       { coords: [122, 20.5] },
  'ryukyu':        { coords: [128, 26],    label: 'Ryukyu Is.', labelOffset: [18, 12], labelTier: 'detail' },
  'kyushu-sw':     { coords: [130, 32],    label: 'Kyushu', labelOffset: [24, 22], labelTier: 'detail' },
};

/**
 * Which gateways each edge connects. Each edge must describe a straight-line
 * ocean passage — if the line between two gateways would cross land, add an
 * intermediate gateway instead.
 */
const GATEWAY_EDGES: [string, string][] = [
  // Europe
  ['channel-w', 'channel-e'],
  ['channel-w', 'biscay'],
  ['biscay', 'iberia-nw'],
  ['iberia-nw', 'iberia-sw'],
  ['iberia-sw', 'gibraltar'],
  // Mediterranean — Gibraltar east through to the Adriatic
  ['gibraltar', 'alboran'],
  ['alboran', 'sardinia-s'],
  ['sardinia-s', 'sicily-strait'],
  ['sicily-strait', 'ionian'],
  ['ionian', 'otranto'],
  ['otranto', 'adriatic-s'],
  ['adriatic-s', 'adriatic-n'],
  ['iberia-nw', 'canaries'],
  ['iberia-sw', 'canaries'],
  ['gibraltar', 'canaries'],
  // Atlantic
  ['canaries', 'azores'],
  ['canaries', 'cape-verde'],
  ['cape-verde', 'atl-narrows'],
  ['cape-verde', 'brazil-ne'],
  ['cape-verde', 'w-africa-bulge'],
  ['w-africa-bulge', 'guinea'],
  ['atl-narrows', 'brazil-ne'],
  ['azores', 'bermuda'],
  // Caribbean / N America
  ['brazil-ne', 'windward'],
  ['windward', 'bahamas-e'],
  ['bahamas-e', 'florida-str'],
  ['bahamas-e', 'bermuda'],
  ['bermuda', 'virginia-capes'],
  // West / South Africa
  ['guinea', 'luanda-approach'],
  ['luanda-approach', 'south-atl-e'],
  ['south-atl-e', 'cape-gh'],
  // Transoceanic shortcut: Cape Verde straight to the Cape — the open-sea
  // leg Lisbon- and Elmina-bound voyages use to reach southern Africa without
  // coast-hugging all of West Africa.
  ['cape-verde', 'cape-gh'],
  ['cape-gh', 'natal'],
  ['natal', 'mozambique'],
  ['mozambique', 'zanzibar-app'],
  // Western Indian Ocean
  ['zanzibar-app', 'socotra-n'],
  ['socotra-n', 'horn-africa'],
  ['socotra-n', 'arabian-sea'],
  ['horn-africa', 'bab-mandeb'],
  ['horn-africa', 'arabian-sea'],
  // Arabian Sea / Persian Gulf
  ['arabian-sea', 'oman'],
  ['oman', 'hormuz-mouth'],
  ['hormuz-mouth', 'gujarat'],
  ['arabian-sea', 'gujarat'],
  ['arabian-sea', 'malabar'],
  // India
  ['gujarat', 'malabar'],
  ['malabar', 'ceylon-s'],
  ['ceylon-s', 'bengal-bay'],
  ['ceylon-s', 'malacca-n'],
  ['bengal-bay', 'malacca-n'],
  // SE Asia & SCS
  ['malacca-n', 'java-sea'],
  ['java-sea', 'sunda'],
  ['java-sea', 'scs-s'],
  ['malacca-n', 'scs-s'],
  ['scs-s', 'scs-n'],
  // Manila approach — west across the South China Sea to existing nodes
  ['manila-app', 'scs-n'],
  ['manila-app', 'scs-s'],
  // Coromandel — connects to Ceylon passage and Bay of Bengal for
  // Malacca/Malabar runs to Masulipatnam.
  ['coromandel', 'ceylon-s'],
  ['coromandel', 'bengal-bay'],
  // Kyushu corridor — passes east of Taiwan, up the Ryukyu chain.
  ['manila-app', 'luzon-n'],
  ['luzon-n', 'ryukyu'],
  ['ryukyu', 'kyushu-sw'],
  // Macau funnels up the same corridor (the Nao do Trato line), entering
  // at luzon-n rather than cutting through Taiwan Strait.
  ['scs-n', 'luzon-n'],
];

/** Each port's entry gateway(s). Ports can list multiple — shortest total wins. */
const PORT_GATEWAYS: Record<string, string[]> = {
  // Europe
  london:     ['channel-w'],
  amsterdam:  ['channel-e'],
  lisbon:     ['iberia-sw'],
  seville:    ['gibraltar'],
  venice:     ['adriatic-n'],
  // Atlantic Americas
  jamestown:  ['virginia-capes'],
  havana:     ['florida-str'],
  cartagena:  ['windward'],
  salvador:   ['brazil-ne'],
  // West / South Africa
  elmina:     ['guinea'],
  luanda:     ['luanda-approach'],
  cape:       ['cape-gh'],
  // East Africa
  mombasa:    ['zanzibar-app'],
  zanzibar:   ['zanzibar-app'],
  // Red Sea / Arabian Peninsula
  aden:       ['horn-africa'],
  mocha:      ['bab-mandeb'],
  muscat:     ['hormuz-mouth'],
  socotra:    ['socotra-n'],
  hormuz:     ['hormuz-mouth'],
  // India
  diu:        ['gujarat'],
  surat:      ['gujarat'],
  goa:        ['malabar'],
  calicut:    ['malabar'],
  // SE Asia
  bantam:     ['sunda'],
  malacca:    ['malacca-n'],
  macau:      ['scs-n'],
  manila:     ['manila-app'],
  nagasaki:   ['kyushu-sw'],
  masulipatnam: ['coromandel'],
};

const PASSAGE_FEATURE_LABELS: Record<string, string> = {
  'channel-w': 'the English Channel',
  'biscay': 'the Bay of Biscay',
  'gibraltar': 'the Strait of Gibraltar',
  'adriatic-n': 'the Adriatic',
  canaries: 'the Canaries',
  'cape-verde': 'the Cape Verde passage',
  'atl-narrows': 'the Atlantic narrows',
  'brazil-ne': 'the Brazil current',
  windward: 'the Windward passage',
  bermuda: 'the Bermuda approach',
  guinea: 'the Gulf of Guinea',
  'cape-gh': 'the Cape passage',
  mozambique: 'the Mozambique Channel',
  'horn-africa': 'the Gulf of Aden',
  'bab-mandeb': 'Bab el-Mandeb',
  'arabian-sea': 'the Arabian Sea',
  'hormuz-mouth': 'the Strait of Hormuz',
  gujarat: 'the Gujarat coast',
  malabar: 'the Malabar coast',
  'ceylon-s': 'the Ceylon passage',
  'bengal-bay': 'the Bay of Bengal',
  'malacca-n': 'the Strait of Malacca',
  'java-sea': 'the Java Sea',
  sunda: 'the Sunda Strait',
  'scs-s': 'the South China Sea',
  'luzon-n': 'the Luzon passage',
  ryukyu: 'the Ryukyu Islands',
  'kyushu-sw': 'the Kyushu approach',
  coromandel: 'the Coromandel coast',
};

/** Build adjacency list with great-circle-distance weights. Computed once. */
const GATEWAY_ADJ: Map<string, { to: string; dist: number }[]> = (() => {
  const adj = new Map<string, { to: string; dist: number }[]>();
  for (const id of Object.keys(GATEWAYS)) adj.set(id, []);
  for (const [a, b] of GATEWAY_EDGES) {
    const d = greatCircleKm(GATEWAYS[a].coords, GATEWAYS[b].coords);
    adj.get(a)!.push({ to: b, dist: d });
    adj.get(b)!.push({ to: a, dist: d });
  }
  return adj;
})();

/** Dijkstra from one start gateway; returns distance map and predecessor map. */
function dijkstraFrom(start: string): { dist: Map<string, number>; prev: Map<string, string> } {
  const dist = new Map<string, number>();
  const prev = new Map<string, string>();
  const visited = new Set<string>();
  dist.set(start, 0);
  while (true) {
    let curr: string | null = null;
    let currDist = Infinity;
    for (const [id, d] of dist) {
      if (!visited.has(id) && d < currDist) {
        curr = id;
        currDist = d;
      }
    }
    if (!curr) break;
    visited.add(curr);
    for (const { to, dist: edgeDist } of GATEWAY_ADJ.get(curr)!) {
      const alt = currDist + edgeDist;
      if (alt < (dist.get(to) ?? Infinity)) {
        dist.set(to, alt);
        prev.set(to, curr);
      }
    }
  }
  return { dist, prev };
}

function buildSeaRouteGatewayIds(fromPortId: string, toPortId: string): string[] {
  const fromGateways = PORT_GATEWAYS[fromPortId];
  const toGateways = PORT_GATEWAYS[toPortId];
  if (!fromGateways || !toGateways) return [];
  const fromCoords = WORLD_PORT_COORDS[fromPortId];
  const toCoords = WORLD_PORT_COORDS[toPortId];
  if (!fromCoords || !toCoords) return [];

  // Same gateway — both ports enter/exit through the same choke point.
  // Emit that single gateway so the curve bends through it cleanly.
  const shared = fromGateways.find(g => toGateways.includes(g));
  if (shared) return [shared];

  // Try every (fromGateway, toGateway) pair; pick the lowest total cost
  // including port → gateway and gateway → port legs.
  let bestPath: string[] | null = null;
  let bestCost = Infinity;
  for (const startGw of fromGateways) {
    const { dist, prev } = dijkstraFrom(startGw);
    const portToStart = greatCircleKm(fromCoords, GATEWAYS[startGw].coords);
    for (const endGw of toGateways) {
      const gatewayDist = dist.get(endGw) ?? Infinity;
      if (gatewayDist === Infinity) continue;
      const endToPort = greatCircleKm(GATEWAYS[endGw].coords, toCoords);
      const total = portToStart + gatewayDist + endToPort;
      if (total < bestCost) {
        bestCost = total;
        const path: string[] = [];
        let cur: string | undefined = endGw;
        while (cur) {
          path.unshift(cur);
          cur = prev.get(cur);
        }
        bestPath = path;
      }
    }
  }
  return bestPath ?? [];
}

export function getSeaRouteFeatureLabels(fromPortId: string, toPortId: string): string[] {
  const labels: string[] = [];
  for (const id of buildSeaRouteGatewayIds(fromPortId, toPortId)) {
    const label = PASSAGE_FEATURE_LABELS[id] ?? GATEWAYS[id]?.label;
    if (label && !labels.includes(label)) labels.push(label);
  }
  return labels;
}

/**
 * Build a sea route from one port to another, returning gateway coords in
 * travel order (excluding the port coordinates themselves — callers prepend
 * the source port and append the destination port). Returns `[]` if either
 * port has no assigned gateway.
 */
export function buildSeaRoute(fromPortId: string, toPortId: string): [number, number][] {
  return buildSeaRouteGatewayIds(fromPortId, toPortId).map(id => GATEWAYS[id].coords);
}

/**
 * Compatibility wrapper — preserves the old function signature. Both world
 * map modals call this; internally it now goes through the gateway graph.
 */
export function getSeaLaneWaypoints(fromId: string, toId: string): [number, number][] {
  return buildSeaRoute(fromId, toId);
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
