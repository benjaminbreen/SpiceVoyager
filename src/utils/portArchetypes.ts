import { PortScale, Culture } from '../store/gameStore';
import { createNoise2D } from 'simplex-noise';
import type { CanalLayoutDef } from './canalLayout';

// ── Direction helpers ──────────────────────────────────────────────────────────
export type CardinalDir = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';

const DIR_RADIANS: Record<CardinalDir, number> = {
  N: 0, NE: Math.PI / 4, E: Math.PI / 2, SE: (3 * Math.PI) / 4,
  S: Math.PI, SW: (5 * Math.PI) / 4, W: (3 * Math.PI) / 2, NW: (7 * Math.PI) / 4,
};

/** Resolve a CardinalDir or numeric degrees (0=N, 90=E, clockwise) to radians. */
export function resolveDirRadians(dir: CardinalDir | number): number {
  if (typeof dir === 'number') return (dir * Math.PI) / 180;
  return DIR_RADIANS[dir];
}

// ── Types ──────────────────────────────────────────────────────────────────────
export type GeographicArchetype =
  | 'archipelago'        // current default — pure noise, scattered islands
  | 'inlet'              // channel of water cutting into land (Goa)
  | 'bay'                // concave cove harbor (Mombasa)
  | 'strait'             // water between two landmasses (Malacca)
  | 'tidal_river'        // navigable river running through the map, city on both banks (London)
  | 'island'             // isolated landmass in open sea (Hormuz, Zanzibar)
  | 'coastal_island'     // island nestled in creeks off a continental coast (Mombasa)
  | 'peninsula'          // land jutting into water (Macau)
  | 'estuary'            // river mouth fanning out (Surat)
  | 'crater_harbor'      // volcanic caldera harbor (Aden)
  | 'continental_coast'  // straight coastline (Calicut)
  | 'lagoon';            // shallow basin shielded by barrier islands, city on islets (Venice)

export type ClimateProfile = 'tropical' | 'arid' | 'temperate' | 'monsoon' | 'mediterranean';

/** Visual style family for procedural buildings. Separate from `culture` (gameplay). */
export type BuildingStyle =
  | 'iberian'              // Lisbon, Seville
  | 'dutch-brick'          // Amsterdam
  | 'english-tudor'        // London (pre-1666 half-timber)
  | 'luso-colonial'        // Goa, Diu, Macau
  | 'swahili-coral'        // Mombasa, Zanzibar
  | 'arab-cubic'           // Aden, Mocha, Socotra, Muscat
  | 'persian-gulf'         // Hormuz (wind-catchers)
  | 'malabar-hindu'        // Calicut
  | 'mughal-gujarati'      // Surat
  | 'malay-stilted'        // Malacca, Bantam
  | 'west-african-round'   // Elmina, Luanda
  | 'luso-brazilian'       // Salvador da Bahia
  | 'spanish-caribbean'    // Havana, Cartagena
  | 'venetian-gothic'      // Venice (Istrian stone + brick + ogee windows)
  | 'japanese-tile'        // Nagasaki (post-and-beam timber, white plaster, deep grey-tile hipped roofs)
  | 'khoikhoi-minimal';    // Cape of Good Hope (no permanent settlement)

/**
 * Scaffold for future unique POI buildings (Tower of London, Torre de Belém, etc).
 * Data-only for now — renderer is a planned future phase. When implemented,
 * `cityGenerator.ts` should reserve these grid cells before generic placement.
 */
export interface PortLandmark {
  id: string;
  slot: 'citadel' | 'hilltop' | 'waterfront' | 'bridge' | 'custom';
  /** Local-map coords when slot is 'custom'. */
  anchor?: [number, number];
}

/** Island shape sub-classifications for realistic silhouettes */
export type IslandShape =
  | 'ovoid'       // default — roughly elliptical (Hormuz)
  | 'elongated'   // long and thin with optional taper (Zanzibar, Ceylon)
  | 'barbell'     // two lobes connected by narrow isthmus
  | 'atoll'       // ring-shaped reef enclosing lagoon
  | 'crescent';   // curved arc shape (volcanic remnant)

/** A harbor or bay indentation carved into an island coastline */
export interface IslandHarbor {
  side: CardinalDir;    // which coast the harbor is on
  position: number;     // 0-1 along the long axis (0 = taperEnd, 1 = opposite)
  depth: number;        // how deep the indent (0.1-0.5)
  width: number;        // angular width of the bay (0.1-0.6)
}

/** A headland — a tongue of land jutting toward open water, flanking a harbor */
export interface Headland {
  side: 'left' | 'right';  // which flank (relative to open direction)
  size: number;             // 0.1-0.8, how far toward open water it extends
  width: number;            // 0.1-0.5, lateral width of the headland
  /** Lateral shift along the coast (mesh-normalized). + shifts away from center. */
  offset?: number;
  /** Curl toward (+) or away from (-) the harbor center as the headland extends. */
  curl?: number;
  /** Rotation of the headland's long axis from straight out-to-sea, in degrees. */
  axisAngle?: number;
  /** Per-headland coastal noise multiplier (1 = default, >1 = more jagged). */
  ruggedness?: number;
}

/** A satellite feature — a named offshore island, rock, or outcrop placed at explicit coords. */
export interface SatelliteFeature {
  /** Offset from port center in mesh-normalized coords (roughly -1..1). */
  dx: number;
  dz: number;
  /** Radius in mesh-normalized coords (typical 0.05 - 0.25). */
  size: number;
  aspectRatio?: number;       // length:width ratio
  orientation?: number;       // degrees, long axis relative to N
  shape?: 'ovoid' | 'elongated' | 'rugged';
  ruggedness?: number;        // coastal noise multiplier
}

export interface PortDefinition {
  id: string;
  name: string;
  geography: GeographicArchetype;
  climate: ClimateProfile;
  culture: Culture;
  scale: PortScale;
  description: string;
  openDirection: CardinalDir | number;     // primary water-facing direction; number = degrees (0=N, 90=E)
  /** Where the city sits relative to center (opposite of open direction by default) */
  cityDirection?: CardinalDir;
  /** Archetype-specific params */
  channelWidth?: number;          // inlet/strait width multiplier (0.5-2.0)
  channelTaper?: number;          // 0 = uniform width, 0.5 = narrows to half at one end (rivers)
  landmassSize?: number;          // legacy island size multiplier (use islandCoverage instead)
  coastCurvature?: number;        // bay curvature (0.3 - 1.0)
  /** Global multiplier on coastal noise (jaggedness). 1 = default, 1.5 = rocky, 0.6 = smooth. */
  coastRuggedness?: number;
  /**
   * Harbor/cove carved into the coastline. Works on `bay` (always), and on
   * `continental_coast` / `estuary` when any of harborWidth/harborDepth is set.
   *
   * - harborWidth: half-width of harbor mouth in rotated local coords (~0.15 small, 0.5 wide).
   * - harborDepth: how far the water cuts inland (~0.08 shallow shelf, 0.3 deep). Overrides
   *   the legacy `coastCurvature * 0.35` derivation when explicitly set.
   * - harborOffset: lateral shift along the coast (-1..1). 0 = centered.
   * - harborShape: 'parabolic' (default, smooth round), 'semicircle' (flatter bottom),
   *   'scalloped' (noisy edge).
   */
  harborWidth?: number;
  harborDepth?: number;
  harborOffset?: number;
  harborShape?: 'parabolic' | 'semicircle' | 'scalloped';
  /** Named offshore features: islands, rocks, outcrops placed at explicit offsets. */
  satellites?: SatelliteFeature[];
  /**
   * Estuary river knobs (all in mesh-normalized coords).
   * - riverMouthWidth: half-width at the coast (default ~0.18). Tagus-scale = 0.35+.
   * - riverInlandWidth: half-width well inland, before final taper (default 0.06). Never zero,
   *   so the channel stays connected instead of breaking into puddles.
   * - riverLength: how far inland the river extends before it fully tapers (default 0.5).
   * - riverSinuosity: lateral meander amplitude (0 = straight, 0.1 = gentle, 0.2 = strong).
   */
  riverMouthWidth?: number;
  riverInlandWidth?: number;
  riverLength?: number;
  riverSinuosity?: number;
  /**
   * Which bank to place the city on for `estuary` / `tidal_river` ports, relative
   * to facing inland from the open direction. 'right' = clockwise (default —
   * preserves prior behavior). 'left' = counterclockwise. For Lisbon (open W),
   * 'left' puts the city on the north bank of the Tagus.
   */
  riverBank?: 'left' | 'right';
  /**
   * How far along the river the historical city core sits, as a fraction of
   * `riverLength`. 0 = at the mouth (default — Belém-style), 0.5 = halfway
   * upstream, 1 = at the far inland end. Lisbon's Baixa is ~0.35.
   */
  riverPortPosition?: number;
  /**
   * Number of bridges to attempt to place across the port's river/strait.
   * Only takes effect when the city generator detects two major land components
   * (i.e. a real river bisects the map). Bridges become part of the road network
   * so buildings on both banks connect. Default 0 = no bridges.
   */
  bridgeCount?: number;
  /** Island shape sub-classification system */
  islandShape?: IslandShape;      // silhouette type (default: 'ovoid')
  islandCoverage?: number;        // target fraction of map as land (0.10 - 0.50)
  aspectRatio?: number;           // length:width ratio (1.0 = circular, 3.0 = very elongated)
  orientation?: number;           // degrees for long axis: 0 = N-S, 90 = E-W
  taperEnd?: CardinalDir;         // which end of the island is narrower
  harbors?: IslandHarbor[];       // bays/harbors carved into coastline
  /** Land-based coastline shaping */
  headlands?: Headland[];         // land protrusions flanking harbor/coast
  enclosure?: number;             // 0-1: how much coast wraps around water (0=flat, 1=enclosed)
  /** Visual building style. Falls back to a culture default when absent. */
  buildingStyle?: BuildingStyle;
  /** Future POI slots (data-only scaffold, renderer TBD). */
  landmarks?: PortLandmark[];
  /**
   * Optional urban canal network. When set, the city generator carves canal
   * water strips into the land mask and auto-places bridges at predetermined
   * crossings. Independent of `geography` — the terrain archetype gives natural
   * water (bay, lagoon), and `canalLayout` adds engineered urban canals on top.
   * Used for canal cities (Amsterdam, Venice).
   */
  canalLayout?: CanalLayoutDef;
  /**
   * RGB (0-1) flag flown from fort towers. Falls back to a culture default
   * when absent. Use this to distinguish ports under different flags within
   * the same culture (e.g. London vs Lisbon, both 'European').
   */
  flagColor?: [number, number, number];
  /**
   * Single named landmark rendered once per port near the fort/center.
   * - 'tower-of-london': square white keep, four corner turrets (no chapel/cross)
   * - 'belem-tower': slim tiered Manueline tower on the waterline (Lisbon)
   * - 'oude-kerk-spire': tall slim brick spire (Amsterdam)
   * - 'old-st-pauls': massive truncated tower (London — replaces tower-of-london if both set)
   */
  landmark?:
    | 'tower-of-london'        // London — square Norman keep, four corner turrets
    | 'belem-tower'            // Lisbon — tiered Manueline limestone tower
    | 'oude-kerk-spire'        // Amsterdam — brick church + tall wooden spire
    | 'old-st-pauls'           // London (alt) — truncated Gothic tower
    | 'al-shadhili-mosque'     // Mocha — white minaret over the coffee port
    | 'grand-mosque-tiered'    // Bantam — five stacked Javanese-Chinese roofs, no minaret
    | 'fort-jesus'             // Mombasa — Portuguese star fort with four pointed bastions
    | 'jesuit-college'         // Salvador — Jesuit college dominating the upper-town bluff
    | 'palacio-inquisicion'    // Cartagena — colonial palace of the Holy Office
    | 'bom-jesus-basilica'     // Goa — Portuguese baroque church, facade + single bell tower
    | 'colegio-sao-paulo'      // Macau — Jesuit college + observatory
    | 'diu-fortress'           // Diu — long Portuguese sea-wall with four bastions + keep
    | 'english-factory-surat'  // Surat — English East India Company factory
    | 'giralda-tower'          // Seville — square Almohad brick minaret + Christian belfry
    | 'calicut-gopuram'        // Calicut — tiered-roof Kerala Hindu shrine
    | 'campanile-san-marco'    // Venice — slim brick campanile + pyramidal cap, gold-tipped
    | 'san-agustin-manila'     // Manila — squat Spanish stone church, twin-tower facade (built 1607)
    | 'church-of-the-assumption' // Nagasaki — Jesuit cathedral, largest church in East Asia until the 1614 expulsion
    | 'dutch-factory-masulipatnam' // Masulipatnam — VOC factory, founded 1606
    | 'elmina-castle';         // Elmina — squat white Portuguese coastal castle (São Jorge da Mina)
}

// ── The Dozen Core Ports ───────────────────────────────────────────────────────
export const CORE_PORTS: PortDefinition[] = [
  {
    id: 'goa',
    name: 'Goa',
    geography: 'inlet',
    climate: 'tropical',
    culture: 'European',
    buildingStyle: 'luso-colonial',
    scale: 'Large',
    description: 'Portuguese-held tropical port on the Malabar coast. A narrow inlet cuts east from the Arabian Sea, sheltering the harbor.',
    openDirection: 'W',
    channelWidth: 0.85,
    enclosure: 0.4,              // Mandovi estuary flanked by land but open to sea
    coastRuggedness: 0.95,       // low laterite banks, not too jagged
    headlands: [
      // Cabo / Bardez peninsula (north bank) — smaller, with gentle southward curl
      {
        side: 'left',
        size: 0.48,
        width: 0.22,
        offset: 0.06,
        curl: 0.25,              // mild hook south toward the river mouth
        axisAngle: -8,
        ruggedness: 0.9,
      },
      // Mormugao peninsula (south bank) — the dominant headland, hooks north across the mouth
      {
        side: 'right',
        size: 0.7,
        width: 0.28,
        offset: 0.04,
        curl: 0.5,               // prominent northward hook
        axisAngle: 14,
        ruggedness: 1.1,
      },
    ],
    satellites: [
      // Chorão / Divar — an estuarine island upriver of the mouth
      {
        dx: 0.1,
        dz: 0.08,
        size: 0.07,
        aspectRatio: 1.9,
        orientation: 95,
        shape: 'ovoid',
        ruggedness: 0.8,
      },
    ],
    landmark: 'bom-jesus-basilica',
  },
  {
    id: 'hormuz',
    name: 'Hormuz',
    geography: 'island',
    climate: 'arid',
    culture: 'Indian Ocean',
    buildingStyle: 'persian-gulf',
    scale: 'Medium',
    description: 'Barren island fortress guarding the entrance to the Persian Gulf. Strategic chokepoint for the spice trade.',
    openDirection: 'S',
    islandShape: 'ovoid',
    islandCoverage: 0.12,        // small, compact island — ~12% of map
    aspectRatio: 1.3,            // slightly wider than tall
    orientation: 70,             // long axis runs roughly E-W
  },
  {
    id: 'malacca',
    name: 'Malacca',
    geography: 'strait',
    climate: 'tropical',
    culture: 'Indian Ocean',
    buildingStyle: 'malay-stilted',
    scale: 'Very Large',
    description: 'Great emporium on the strait between Sumatra and the Malay peninsula. Gateway between the Indian Ocean and the South China Sea.',
    openDirection: 'E',
    channelWidth: 1.2,
  },
  {
    id: 'aden',
    name: 'Aden',
    geography: 'crater_harbor',
    climate: 'arid',
    culture: 'Indian Ocean',
    buildingStyle: 'arab-cubic',
    scale: 'Medium',
    description: 'Ancient port built within the crater of an extinct volcano. Guards the entrance to the Red Sea.',
    openDirection: 'S',
    enclosure: 0.55,             // Shamsan crater wraps strongly around the harbor
    coastRuggedness: 1.7,        // jagged volcanic cliffs
    headlands: [
      // Jebel Shamsan — massive hooked western arm, dominates the harbor
      {
        side: 'left',
        size: 0.65,
        width: 0.28,
        offset: 0.04,
        curl: 0.45,              // strong hook east toward the harbor mouth
        axisAngle: 12,
        ruggedness: 1.4,
      },
      // Eastern volcanic ridge — much smaller, lower, less curled
      {
        side: 'right',
        size: 0.32,
        width: 0.18,
        offset: 0.06,
        curl: 0.2,
        axisAngle: -6,
        ruggedness: 1.1,
      },
    ],
    satellites: [
      // Sira Island — small rocky islet guarding the harbor entrance
      {
        dx: 0.05,
        dz: 0.22,
        size: 0.055,
        aspectRatio: 1.4,
        orientation: 20,
        shape: 'rugged',
        ruggedness: 1.6,
      },
      // Little Aden (Jebel Ihsan) — large volcanic peninsula across the bay to the SW
      {
        dx: -0.65,
        dz: 0.55,
        size: 0.22,
        aspectRatio: 1.5,
        orientation: 60,
        shape: 'rugged',
        ruggedness: 1.3,
      },
    ],
  },
  {
    id: 'zanzibar',
    name: 'Zanzibar',
    geography: 'island',
    climate: 'tropical',
    culture: 'Indian Ocean',
    buildingStyle: 'swahili-coral',
    scale: 'Small',
    description: 'Lush tropical island off the East African coast. Center of the clove trade and Swahili culture.',
    openDirection: 'W',
    islandShape: 'elongated',
    islandCoverage: 0.22,        // medium island — ~22% of map
    aspectRatio: 2.8,            // long and thin (real Zanzibar is ~85km × 30km)
    orientation: 0,              // long axis runs N-S
    taperEnd: 'N',               // narrower at northern tip
    harbors: [
      { side: 'W', position: 0.35, depth: 0.3, width: 0.35 },  // Stone Town harbor
    ],
  },
  {
    id: 'macau',
    name: 'Macau',
    geography: 'peninsula',
    climate: 'monsoon',
    culture: 'European',
    buildingStyle: 'luso-colonial',
    scale: 'Medium',
    description: 'Portuguese trading post on a narrow peninsula in the Pearl River estuary. Gateway to the China trade.',
    openDirection: 'S',
    aspectRatio: 2.2,            // narrow peninsula, longer than wide
    coastCurvature: 0.7,         // moderate mainland curve
    coastRuggedness: 1.1,        // granite hills, moderately jagged
    harbors: [
      { side: 'E', position: 0.5, depth: 0.25, width: 0.4 },  // Praia Grande bay
    ],
    satellites: [
      // Taipa — closer island SE of the peninsula tip (separate from Macau in 1612)
      {
        dx: 0.14,
        dz: 0.42,
        size: 0.1,
        aspectRatio: 1.5,
        orientation: 70,
        shape: 'ovoid',
        ruggedness: 1.1,
      },
      // Coloane — larger, hillier island further south
      {
        dx: 0.05,
        dz: 0.62,
        size: 0.14,
        aspectRatio: 1.7,
        orientation: 85,
        shape: 'rugged',
        ruggedness: 1.2,
      },
      // Lappa / small islet W of the peninsula in the Pearl River channel
      {
        dx: -0.25,
        dz: 0.2,
        size: 0.07,
        aspectRatio: 1.3,
        orientation: 20,
        shape: 'ovoid',
        ruggedness: 0.9,
      },
    ],
    landmark: 'colegio-sao-paulo',
  },
  {
    id: 'mombasa',
    name: 'Mombasa',
    geography: 'coastal_island',
    climate: 'monsoon',
    culture: 'Indian Ocean',
    buildingStyle: 'swahili-coral',
    scale: 'Medium',
    description: 'Swahili port on a coral island in a coastal creek system. Fort Jesus guards the harbor. Tudor Creek and Kilindini Harbour flank the island.',
    openDirection: 'E',
    channelWidth: 0.8,
    aspectRatio: 1.8,            // Mombasa Island is roughly rectangular, wider E-W
    orientation: 80,             // long axis runs roughly E-W
    harbors: [
      { side: 'SE', position: 0.7, depth: 0.2, width: 0.3 },  // Old Port / Fort Jesus harbor
    ],
    landmark: 'fort-jesus',
  },
  {
    id: 'calicut',
    name: 'Calicut',
    geography: 'continental_coast',
    climate: 'monsoon',
    culture: 'Indian Ocean',
    buildingStyle: 'malabar-hindu',
    scale: 'Large',
    description: 'The Zamorin\'s capital on the Malabar coast. First landfall of Vasco da Gama. Rich in pepper and spices.',
    openDirection: 'W',
    enclosure: 0.15,             // mostly open coast, slight natural bay
    headlands: [
      { side: 'right', size: 0.25, width: 0.2 },  // Kadalundi point to the south
    ],
    landmark: 'calicut-gopuram',
  },
  {
    id: 'surat',
    name: 'Surat',
    geography: 'estuary',
    climate: 'monsoon',
    culture: 'Indian Ocean',
    buildingStyle: 'mughal-gujarati',
    scale: 'Large',
    description: 'Mughal Empire\'s great western port at the mouth of the Tapti River. Hub of the Gujarat textile trade.',
    openDirection: 'W',
    enclosure: 0.25,             // river banks create partial shelter
    riverMouthWidth: 0.2,
    riverInlandWidth: 0.08,
    riverLength: 0.7,
    riverSinuosity: 0.14,        // Tapti meanders moderately
    headlands: [
      { side: 'left', size: 0.35, width: 0.2 },   // Dumas point (north bank)
    ],
    landmark: 'english-factory-surat',
  },
  {
    id: 'muscat',
    name: 'Muscat',
    geography: 'bay',
    climate: 'arid',
    culture: 'Indian Ocean',
    buildingStyle: 'arab-cubic',
    scale: 'Medium',
    description: 'Omani port nestled between jagged mountains, its harbor sheltered by rocky headlands.',
    openDirection: 15,           // harbor faces roughly NNE (real: ~10-20°)
    coastCurvature: 0.75,
    enclosure: 0.45,             // partial enclosure — the eastern flank is mostly open
    harborOffset: -0.08,         // harbor sits slightly west of center
    harborWidth: 0.28,           // narrow mouth, not a wide scallop
    harborDepth: 0.22,           // deep natural inlet behind the flanking forts
    harborShape: 'scalloped',    // irregular rocky rim
    coastRuggedness: 1.55,       // jagged volcanic coastline
    headlands: [
      // Ras Mascat / al-Jalali — large, strongly hooked peninsula curling east around the harbor
      {
        side: 'left',
        size: 0.72,
        width: 0.22,
        offset: 0.05,           // pulled slightly toward center so it dominates the bay
        curl: 0.55,             // strong hook toward the harbor mouth
        axisAngle: 18,          // long axis tilts east from straight out
        ruggedness: 1.4,
      },
      // Mutrah side — softer, smaller, less curled
      {
        side: 'right',
        size: 0.38,
        width: 0.14,
        offset: 0.12,
        curl: 0.15,
        axisAngle: -8,
        ruggedness: 0.9,
      },
    ],
    satellites: [
      // Ras Sirah — elongated rocky island NE of the harbor, running N-S
      {
        dx: 0.55,
        dz: -0.45,
        size: 0.13,
        aspectRatio: 3.2,
        orientation: 10,
        shape: 'elongated',
        ruggedness: 1.3,
      },
      // Small guard rock SE of the harbor entrance (East Fort islet)
      {
        dx: 0.22,
        dz: -0.18,
        size: 0.05,
        aspectRatio: 1.3,
        orientation: 40,
        shape: 'rugged',
        ruggedness: 1.6,
      },
    ],
  },
  {
    id: 'mocha',
    name: 'Mocha',
    geography: 'continental_coast',
    climate: 'arid',
    culture: 'Indian Ocean',
    buildingStyle: 'arab-cubic',
    scale: 'Medium',
    description: 'Yemen\'s coffee port on the Red Sea coast. The finest Arabian coffee passes through its warehouses.',
    openDirection: 'S',
    harborWidth: 0.55,           // broad semicircular roadstead
    harborDepth: 0.14,           // shallow — it was a roadstead, not a deep inlet
    harborShape: 'semicircle',   // flatter-bottomed curve, not a sharp parabola
    coastRuggedness: 0.7,        // low sandy coast, not jagged
    headlands: [
      // Low flanking points of land — small and soft, no strong curl
      { side: 'left',  size: 0.22, width: 0.16, offset: 0.08, curl: 0.05, ruggedness: 0.6 },
      { side: 'right', size: 0.20, width: 0.16, offset: -0.08, curl: 0.05, ruggedness: 0.6 },
    ],
    landmark: 'al-shadhili-mosque',
  },
  {
    id: 'manila',
    name: 'Manila',
    geography: 'bay',
    climate: 'tropical',
    culture: 'European',
    // Reusing spanish-caribbean for v1 — both are whitewashed stone-and-tile
    // colonial Spanish, reads correctly from gameplay distance. A bespoke
    // 'spanish-philippine' style (Intramuros + Chinese-tile Parián) is a
    // future improvement.
    buildingStyle: 'spanish-caribbean',
    scale: 'Large',
    description: 'The Spanish capital of the Philippines, founded barely forty years ago and already the eastern hinge of the Habsburg trade. Within the stone walls of Intramuros, friars, soldiers, and royal officials run a city that is a third European, two-thirds Sangley Chinese — the Parián outside the walls is a teeming quarter of merchants, silk-weavers, and apothecaries. Once a year the Acapulco galleon arrives heavy with Mexican silver and departs heavier with Chinese silk, porcelain, and Asian medicines bound for New Spain. The bay is one of the great natural harbours of the world, sheltered behind the Bataan peninsula and guarded at its mouth by the island of Corregidor. The smell of frangipani and woodsmoke hangs over the Pasig river at evening.',
    openDirection: 'W',
    coastCurvature: 0.85,        // strongly concave — Manila Bay is famously near-enclosed
    enclosure: 0.55,             // largely sheltered behind Bataan + Cavite
    harborWidth: 0.48,           // wide bay mouth
    harborDepth: 0.30,           // deep penetration inland
    harborShape: 'parabolic',
    coastRuggedness: 0.85,       // low alluvial coast around the bay, hills behind
    // The Pasig river bisects the city — a short estuary feeding into the bay
    riverMouthWidth: 0.10,
    riverInlandWidth: 0.06,
    riverLength: 0.45,
    riverSinuosity: 0.10,
    bridgeCount: 1,              // Puente Grande / Puente de España linked Intramuros to Binondo
    headlands: [
      // Bataan peninsula — the dominant western arm sheltering the bay
      {
        side: 'right',
        size: 0.62,
        width: 0.22,
        offset: -0.04,
        curl: 0.50,              // strong hook south across the bay mouth
        axisAngle: -10,
        ruggedness: 1.0,
      },
      // Cavite peninsula — smaller southern arm, the Spanish naval anchorage
      {
        side: 'left',
        size: 0.34,
        width: 0.14,
        offset: 0.05,
        curl: 0.30,
        axisAngle: 8,
        ruggedness: 0.85,
      },
    ],
    satellites: [
      // Corregidor — small fortified island guarding the bay entrance
      {
        dx: -0.55,
        dz: 0.05,
        size: 0.06,
        aspectRatio: 1.8,
        orientation: 100,
        shape: 'rugged',
        ruggedness: 1.2,
      },
    ],
    flagColor: [0.78, 0.10, 0.12],  // Spanish Habsburg crimson (Cross of Burgundy field)
    landmark: 'san-agustin-manila',
  },
  {
    id: 'bantam',
    name: 'Bantam',
    geography: 'bay',
    climate: 'tropical',
    culture: 'Indian Ocean',
    buildingStyle: 'malay-stilted',
    scale: 'Medium',
    description: 'Javanese pepper port on a sheltered bay at the western tip of Java. Contested by English, Dutch, and local sultans.',
    openDirection: 'N',
    coastCurvature: 0.6,
    enclosure: 0.35,             // gentle sheltered bay
    headlands: [
      { side: 'right', size: 0.3, width: 0.25 },  // eastern point sheltering the bay
    ],
    landmark: 'grand-mosque-tiered',
  },
  {
    id: 'socotra',
    name: 'Socotra',
    geography: 'island',
    climate: 'arid',
    culture: 'Indian Ocean',
    buildingStyle: 'arab-cubic',
    scale: 'Small',
    description: 'Remote island at the mouth of the Gulf of Aden, famous for its dragon\'s blood trees and aloe. A waystation between Africa and India, coveted by the Portuguese.',
    openDirection: 'S',
    islandShape: 'elongated',
    islandCoverage: 0.15,        // smallish, isolated island — ~15% of map
    aspectRatio: 2.5,            // real Socotra is ~130km × 40km
    orientation: 80,             // long axis runs roughly E-W
    taperEnd: 'W',               // tapers at western tip
    harbors: [
      { side: 'N', position: 0.35, depth: 0.2, width: 0.3 },  // Hadibo anchorage on north coast
    ],
  },
  {
    id: 'diu',
    name: 'Diu',
    geography: 'island',
    climate: 'arid',
    culture: 'European',
    buildingStyle: 'luso-colonial',
    scale: 'Small',
    description: 'Tiny fortified island off the southern tip of Gujarat. Site of the great Portuguese naval victory of 1509 that secured their dominance of the Indian Ocean.',
    openDirection: 'S',
    islandShape: 'crescent',
    islandCoverage: 0.10,        // very small fortress island — minimum coverage
    aspectRatio: 2.0,            // real Diu is ~11km × 3km, elongated
    orientation: 80,             // runs roughly E-W
    harbors: [
      { side: 'S', position: 0.4, depth: 0.2, width: 0.35 },  // main harbor on south side
    ],
    landmark: 'diu-fortress',
  },

  // ── European Ports ───────────────────────────────────────────────────────────
  {
    id: 'lisbon',
    name: 'Lisbon',
    geography: 'estuary',
    climate: 'mediterranean',
    culture: 'European',
    buildingStyle: 'iberian',
    scale: 'Huge',
    description: 'The Tagus estuary opens wide below the city, crowded with carracks and smaller craft. The Casa da Índia warehouses line the Ribeira waterfront, where stevedores unload pepper, cinnamon, and Chinese porcelain under the eye of customs agents. The streets climbing the hills behind are narrow and steep. Lisbon has been under the Spanish Habsburgs since 1580, and the Carreira da Índia is fraying, but the pepper still flows.',
    openDirection: 'W',
    enclosure: 0.2,
    riverMouthWidth: 0.4,        // Tagus is very wide at Lisbon
    riverInlandWidth: 0.26,      // Mar da Palha inner basin stays wide
    riverLength: 1.2,            // river continues past the east edge of the mesh
    riverSinuosity: 0.05,        // relatively straight in this stretch
    coastRuggedness: 0.9,
    // City sits on the NORTH bank of the Tagus. With openDirection 'W',
    // riverBank 'left' = counterclockwise from open = north.
    riverBank: 'left',
    // Historic Baixa/Castelo core sits upriver from the Atlantic mouth,
    // not at Belém. Push the port marker east along the Tagus.
    riverPortPosition: 0.22,
    headlands: [
      // Almada / south-bank promontory across the river from the city.
      // For openDirection 'W', side 'right' resolves to the south bank.
      { side: 'right', size: 0.35, width: 0.2 },
    ],
    flagColor: [0.85, 0.15, 0.15],  // Portuguese red (Habsburg crown 1580-1640, but red still flown)
    landmark: 'belem-tower',
  },
  {
    id: 'amsterdam',
    name: 'Amsterdam',
    // The IJ is a sheltered tidal bay (arm of the Zuiderzee), not a river through
    // the city — so 'bay' models the natural geography. The distinctive concentric
    // canal grid is layered on top via canalLayout (an urban feature, not natural).
    geography: 'bay',
    climate: 'temperate',
    culture: 'European',
    buildingStyle: 'dutch-brick',
    scale: 'Huge',
    description: 'The IJ waterfront is all activity — cranes swinging bales from lighters into canal-side warehouses, VOC clerks tallying inventories, shipwrights caulking hulls in the yards. The city is flat and wet, and smells of tar and herring. The new Bourse is barely a year old but already thick with merchants trading pepper futures and Baltic grain contracts. Sephardic refugees from Iberia have settled along the canals, and their networks reach from Antwerp to Goa. Even in summer the wind off the Zuiderzee cuts through the rigging.',
    openDirection: 'N',
    harborWidth: 0.7,            // wide IJ tidal bay across the entire north edge
    harborDepth: 0.18,           // shallow — the IJ was navigable but not deep
    harborShape: 'semicircle',   // broad flat-bottomed sweep, not a parabolic cove
    coastRuggedness: 0.4,        // low marshy polderland, not jagged
    // 1612 canal layout (wedge, NOT concentric): the famous Grachtengordel was
    // only being SURVEYED in 1612 — Herengracht digging began 1613. The city
    // was still the medieval wedge between the Damrak/Rokin and the Singel
    // moat, with two parallel "burgwallen" (Oudezijds and Nieuwezijds
    // Voorburgwal) flanking the central inlet. Concentric rings would be
    // ~50 years premature.
    canalLayout: {
      type: 'wedge',
      openDirection: 'N',
      // Damrak/Rokin: the broad central waterway from the IJ inland to
      // Dam square. Wider than the side canals so the central axis
      // dominates visually — historically the Damrak was the heart of
      // mercantile Amsterdam (Bourse on its bank from 1611).
      inletWidth: 14,
      inletDepth: 76,
      // Voorburgwallen: pair of canals flanking the central axis. Offset
      // 40 leaves ~24u of buildable land between inlet and side canal
      // (after the ±10/±6 bank-buffer reservations). Enough for two
      // gable-end house rows plus a quay street on each side.
      sideCanalWidth: 6,
      sideCanalOffsets: [40],
      sideCanalLength: 64,
      // Singel: the medieval moat (1428) wrapping the city core. Radius
      // 110 keeps it clearly outside the side canals (~46u clear strip
      // between side canal end and moat at lat=40), and the moat extent
      // wraps just past the harbor flanks so the city reads as enclosed.
      moatRadius: 110,
      moatWidth: 6,
      moatExtent: Math.PI * 1.05,
      // Authored bridge counts BEFORE the min-distance cull (18u in
      // canalLayout.cullClusteredBridges). The cull eats any extras that
      // land too close to a previously emitted bridge, so the surviving
      // count is what actually appears in-game.
      bridgesOnInlet: 2,
      bridgesPerSideCanal: 1,
      bridgesOnMoat: 4,
    },
    flagColor: [0.92, 0.55, 0.10],  // Prinsenvlag orange (Dutch Republic, c. 1612)
    landmark: 'oude-kerk-spire',
  },
  {
    id: 'seville',
    name: 'Seville',
    geography: 'tidal_river',
    climate: 'mediterranean',
    culture: 'European',
    buildingStyle: 'iberian',
    scale: 'Very Large',
    description: 'The river is shallow — ocean-going ships unload downstream at Sanlúcar de Barrameda, and flat-bottomed barges ferry cargo up the Guadalquivir to the city. The Torre del Oro marks the old river quay where goods from the Americas are landed and tallied by the Casa de Contratación. Genoese bankers have offices near the cathedral, converting Potosí silver into credit. The streets smell of olive oil, tobacco smoke, and orange blossom. Merchants grumble that Cádiz would be better, but the monopoly stays.',
    openDirection: 'S',          // Guadalquivir flows north-south through the city
    // Guadalquivir at Seville was historically narrower than the Thames at
    // London. Capped for Large-scale bridge reach (~54 world units max span).
    channelWidth: 0.38,
    riverSinuosity: 0.2,         // famously meandering
    bridgeCount: 1,              // Puente de Barcas — floating pontoon bridge to Triana (1171–1852)
    landmark: 'giralda-tower',
  },
  {
    id: 'london',
    name: 'London',
    geography: 'tidal_river',
    climate: 'temperate',
    culture: 'European',
    buildingStyle: 'english-tudor',
    scale: 'Huge',
    description: 'The Thames at low tide exposes mudflats and timber pilings below warehouses packed tight along both banks. Lighters and wherries crowd the river — London Bridge blocks larger vessels, so ocean-going ships moor downstream at Deptford and Wapping. The East India Company is barely twelve years old, still fitting out modest voyages. Apothecaries on Bucklersbury sell pepper and nutmeg at steep markups, and Virginia tobacco has just started appearing in the pipes of gentlemen. Sea coal smoke hangs over the rooftops on still days.',
    openDirection: 'E',
    channelWidth: 0.5,         // ≈ Thames proportions at the Pool of London
    channelTaper: 0.4,         // narrows slightly upstream (west)
    riverSinuosity: 0.09,      // gentle Thames bend around the Isle of Dogs
    bridgeCount: 1,            // London Bridge — the only Thames crossing in 1612
    flagColor: [0.95, 0.95, 0.95],  // St George's cross — white field (red bar drawn separately)
    landmark: 'tower-of-london',
  },
  {
    id: 'venice',
    name: 'Venice',
    geography: 'lagoon',
    climate: 'mediterranean',
    culture: 'European',
    buildingStyle: 'venetian-gothic',
    // Venice in 1612 was one of the largest cities in Europe (~140k people),
    // but post-1575-plague decline pulls it just below London/Amsterdam in scale.
    scale: 'Very Large',
    description: 'The Republic\'s shallow-water capital sits on a hundred islands in a brackish lagoon, the Lido shielding it from the Adriatic. Galleys from Alexandria and Aleppo unload sacks of pepper, cardamom, and indigo at the Rialto, where Greek, German, and Jewish merchants haggle in half a dozen tongues. Murano glass, mirrors, and theriac — the city\'s monopoly polypharmacy compound — flow outward in return. The Cape route has been gnawing at the spice trade for a century, but Levantine pepper still arrives in volume, and the Arsenale lays new galleys at a pace no other yard can match. The air smells of canal silt, wet brick, and woodsmoke from the glass furnaces.',
    openDirection: 'E',
    coastRuggedness: 0.55,           // low alluvial coast, gentle noise
    // Canal layout: the Grand Canal as the broad central inlet curving in from
    // the lagoon, plus an inner ring approximating the Cannaregio/Castello arc
    // and four radial cuts for the rii (smaller canals) that thread the sestieri.
    // Wider than Amsterdam's because Venice is more water than land — this is
    // the closest fit the concentric pattern offers until a true lagoon-grid
    // canal type is added.
    canalLayout: {
      type: 'concentric',
      openDirection: 'E',
      innerRadius: 38,
      rings: 2,
      // Wider gap between rings: the previous 26u barely fit one row of
      // houses (~12u including the bank buffer applied in cityGenerator),
      // which made Venice read as a tangle of water with buildings squeezed
      // onto threads of land. 52u leaves a proper sestiere of dense urban
      // fabric between the inner and outer canal.
      ringSpacing: 52,
      radials: 4,
      canalWidth: 8,
      centralInlet: true,
      inletDepth: 60,           // long Grand Canal sweep into the city
      inletWidth: 12,           // the Grand Canal is broad
      bridgesPerRing: 4,
      bridgesPerRadial: 1,
      bridgesOnInlet: 4,        // Rialto + three other crossings
    },
    // Satellite dx/dz are UNROTATED world coords (the satellite loop does not
    // apply openDirection rotation). For openDirection='E', rotateToOpen maps
    // unrotated (lx, lz) → rotated (wrx, wrz) = (lz, -lx). We want the named
    // islands to sit at specific positions in the rotated lagoon frame (where
    // the city is at wrx≈-0.04, wrz≈0.24), so we invert: lx = -wrz, lz = wrx.
    satellites: [
      // Murano — glassworks island, NE of the city in the northern lagoon.
      // Target rotated (wrx=-0.22, wrz=0.08) → unrotated (lx=-0.08, lz=-0.22)
      {
        dx: -0.08,
        dz: -0.22,
        size: 0.050,
        aspectRatio: 1.7,
        orientation: 25,
        shape: 'rugged',
        ruggedness: 0.9,
      },
      // Burano / Torcello — further NE into the northern lagoon.
      // Target rotated (wrx=-0.38, wrz=0.14) → unrotated (lx=-0.14, lz=-0.38)
      {
        dx: -0.14,
        dz: -0.38,
        size: 0.040,
        aspectRatio: 1.5,
        orientation: 10,
        shape: 'rugged',
        ruggedness: 1.0,
      },
      // Giudecca — long island just S of the main Venice cluster, across the
      // Canale della Giudecca. Target rotated (wrx=0.06, wrz=0.38)
      // → unrotated (lx=-0.38, lz=0.06)
      {
        dx: -0.38,
        dz: 0.06,
        size: 0.065,
        aspectRatio: 3.2,
        orientation: 5,              // lz axis ≈ rotated wrx, so runs along the lagoon
        shape: 'ovoid',
        ruggedness: 0.7,
      },
      // San Giorgio Maggiore — small islet just SE of central Venice.
      // Target rotated (wrx=0.10, wrz=0.14) → unrotated (lx=-0.14, lz=0.10)
      {
        dx: -0.14,
        dz: 0.10,
        size: 0.022,
        aspectRatio: 1.1,
        orientation: 0,
        shape: 'ovoid',
        ruggedness: 0.5,
      },
    ],
    flagColor: [0.78, 0.10, 0.12],  // Venetian crimson (St Mark's lion field)
    landmark: 'campanile-san-marco',
  },

  // ── West African Ports ───────────────────────────────────────────────────────
  {
    id: 'elmina',
    name: 'Elmina',
    geography: 'continental_coast',
    climate: 'tropical',
    culture: 'West African',
    buildingStyle: 'west-african-round',
    scale: 'Small',
    description: 'São Jorge da Mina rises white and angular above the rocky headland, its walls stained with tropical damp. Akan traders arrive from the forest interior with gold dust wrapped in leaves, exchanging it for Indian textiles, Venetian beads, and iron bars in the courtyard below the keep. Fishing canoes line the beach on either side of the fortress. The Portuguese garrison is small and nervous — Dutch ships have been probing the coast more often. The forest behind the settlement is dense, pressing up to the cleared ground.',
    openDirection: 'S',
    enclosure: 0.1,
    headlands: [
      { side: 'left', size: 0.3, width: 0.2 },  // fortress headland
    ],
    landmark: 'elmina-castle',
  },
  {
    id: 'luanda',
    name: 'Luanda',
    geography: 'bay',
    climate: 'tropical',
    culture: 'West African',
    buildingStyle: 'west-african-round',
    scale: 'Small',
    description: 'The Ilha de Luanda — a long, low sand spit — shelters the bay from the open Atlantic. The settlement is sparse: a fortress, a Jesuit college, a few streets of stone buildings in dry heat. This is a slaving port — pombeiros march coffles down from the interior to holding pens near the beach, where captives wait for ships bound to Bahia and Pernambuco. Nzimbu shells harvested from the island circulate as currency. The Benguela Current keeps the coast surprisingly cool and arid.',
    openDirection: 'W',
    coastCurvature: 0.4,
    enclosure: 0.2,              // mainland coast is mostly straight — shelter comes from the spit
    harborWidth: 0.45,           // broad anchorage behind the spit
    harborDepth: 0.12,           // shallow — the sheltered water is narrow
    harborShape: 'semicircle',
    coastRuggedness: 0.6,        // low sandy coast
    satellites: [
      // Ilha de Luanda — the defining feature: a long, thin N-S sand spit just offshore
      {
        dx: -0.35,
        dz: 0.05,
        size: 0.2,
        aspectRatio: 5.5,        // very long and thin
        orientation: 5,          // runs nearly N-S, slight tilt
        shape: 'elongated',
        ruggedness: 0.4,         // smooth sandy edges
      },
    ],
  },

  // ── Atlantic American Ports ──────────────────────────────────────────────────
  {
    id: 'salvador',
    name: 'Salvador da Bahia',
    geography: 'bay',
    climate: 'tropical',
    culture: 'Atlantic',
    buildingStyle: 'luso-brazilian',
    scale: 'Large',
    description: 'The city divides between the upper town on the bluff — churches, the governor\'s palace, Jesuit college — and the lower town at the waterline, where warehouses, slave markets, and chandlers\' shops crowd the quay. The Baía de Todos os Santos is enormous, its shores lined with sugar engenhos and tobacco farms. Enslaved Africans far outnumber the Portuguese. The harbor is always busy with coasting vessels bringing sugar chests down from the Recôncavo, and the smell of boiling cane carries across the water before the city comes into view.',
    // City's port quays face west into the Baía de Todos os Santos, not the Atlantic
    openDirection: 'W',
    coastCurvature: 0.65,
    enclosure: 0.35,
    harborWidth: 0.7,            // enormous natural harbor (~1000 km² in reality)
    harborDepth: 0.22,
    harborShape: 'semicircle',   // broad bowl rather than narrow cove
    coastRuggedness: 1.0,
    headlands: [
      // Ponta de Santo Antônio — the city's bluff, a substantial peninsula north of the harbor
      {
        side: 'right',
        size: 0.48,
        width: 0.22,
        offset: 0.08,
        curl: 0.3,
        axisAngle: -12,
        ruggedness: 1.0,
      },
      // Southern rim of the bay — gentler, less developed coast
      {
        side: 'left',
        size: 0.32,
        width: 0.2,
        offset: 0.1,
        curl: 0.15,
        ruggedness: 0.85,
      },
    ],
    satellites: [
      // Itaparica — large island in the middle-south of the bay, a defining feature
      {
        dx: -0.55,
        dz: 0.15,
        size: 0.24,
        aspectRatio: 2.4,
        orientation: 15,
        shape: 'elongated',
        ruggedness: 0.8,
      },
      // Ilha dos Frades / smaller bay island to the north
      {
        dx: -0.38,
        dz: -0.35,
        size: 0.08,
        aspectRatio: 1.3,
        orientation: 40,
        shape: 'ovoid',
        ruggedness: 0.9,
      },
    ],
    landmark: 'jesuit-college',
  },
  {
    id: 'havana',
    name: 'Havana',
    geography: 'inlet',
    climate: 'tropical',
    culture: 'Atlantic',
    buildingStyle: 'spanish-caribbean',
    scale: 'Large',
    description: 'The entrance is narrow — the channel passes directly beneath the guns of Morro Castle on one side and La Punta fortress on the other, then opens into a wide, deep harbor. The treasure fleet assembles here each summer before the Atlantic crossing, and the waterfront is loud with shipwrights and caulkers refitting galleons. Mexican silver, Cuban tobacco, and hides fill the customs warehouses. The fortifications are the strongest in the Americas — Drake raided the city in 1585, and the Spanish have been building walls ever since.',
    openDirection: 'N',
    channelWidth: 0.9,           // wide interior basin (inlet widens inland here)
    enclosure: 0.75,             // deeply enclosed bocachica
    coastRuggedness: 1.1,        // limestone coast, moderate ruggedness
    headlands: [
      // Morro Castle — east side of the mouth (right flank for openDirection N)
      // Strong inward curl nearly closes the entrance
      {
        side: 'right',
        size: 0.55,
        width: 0.16,
        offset: -0.1,            // pulled toward center to pinch the mouth
        curl: 0.7,               // aggressive hook west across the channel
        axisAngle: -15,
        ruggedness: 1.1,
      },
      // La Punta — west side, slightly smaller, also strongly curled
      {
        side: 'left',
        size: 0.45,
        width: 0.14,
        offset: -0.08,
        curl: 0.6,
        axisAngle: 15,
        ruggedness: 1.0,
      },
    ],
  },
  {
    id: 'cartagena',
    name: 'Cartagena de Indias',
    geography: 'bay',
    climate: 'tropical',
    culture: 'Atlantic',
    buildingStyle: 'spanish-caribbean',
    scale: 'Medium',
    description: 'The bay is nearly landlocked — ships enter through a narrow bocachica between low headlands fortified with batteries. Inside, the water is calm and deep. The Inquisition established a tribunal here just two years ago, and its agents are visible in the streets. Emeralds from Muzo, pearls from the Venezuelan coast, and silver transshipped overland from Portobelo pass through guarded warehouses. It is also one of the largest slave markets in the Americas, with thousands of captives arriving annually under the asiento.',
    openDirection: 'W',
    coastCurvature: 0.95,        // strongly concave
    enclosure: 0.7,              // nearly landlocked
    harborWidth: 0.22,           // narrow bocachica mouth
    harborDepth: 0.3,            // deep bay penetration
    harborShape: 'parabolic',
    coastRuggedness: 0.85,       // low tropical coast, not particularly jagged
    headlands: [
      // Walled-city peninsula (north side of the bay mouth) — larger, more hooked
      {
        side: 'right',
        size: 0.58,
        width: 0.2,
        offset: -0.05,
        curl: 0.55,              // hooks south toward bocachica
        axisAngle: -10,
        ruggedness: 1.0,
      },
      // Barú peninsula side (south of the mouth) — smaller, gentler
      {
        side: 'left',
        size: 0.4,
        width: 0.18,
        offset: -0.03,
        curl: 0.3,
        axisAngle: 6,
        ruggedness: 0.9,
      },
    ],
    satellites: [
      // Tierrabomba — large island sitting inside the bay near the entrance
      {
        dx: -0.4,
        dz: -0.05,
        size: 0.17,
        aspectRatio: 1.6,
        orientation: 160,
        shape: 'ovoid',
        ruggedness: 0.7,
      },
    ],
    landmark: 'palacio-inquisicion',
  },
  {
    id: 'jamestown',
    name: 'Jamestown',
    geography: 'estuary',
    climate: 'temperate',
    culture: 'Atlantic',
    // Placeholder — English palisaded outpost has no dedicated style yet.
    // Using english-tudor at Small scale reads approximately right from distance
    // until a proper 'english-colonial-palisade' style is built.
    buildingStyle: 'english-tudor',
    scale: 'Small',
    description: 'A triangular wooden palisade on a marshy peninsula in the James River, five years old and barely surviving. The Starving Time of 1609–10 killed most of the first settlers; the survivors live in wattle-and-daub huts inside the fort walls. John Rolfe has just planted the first experimental crop of Spanish-seed tobacco in cleared ground outside the palisade — most of the colony\'s export trade so far has been sassafras root and clapboard. Supply ships from London arrive once or twice a year. The Powhatan villages along the river are tense, watchful neighbors.',
    openDirection: 'E',
    enclosure: 0.25,
    riverMouthWidth: 0.22,       // James River is a few miles wide here
    riverInlandWidth: 0.12,
    riverLength: 0.75,
    riverSinuosity: 0.15,        // gently meandering
    coastRuggedness: 0.55,       // low tidewater, marshy
    flagColor: [0.95, 0.95, 0.95],  // St George's cross — white field
  },

  // ── Nagasaki ─────────────────────────────────────────────────────────────────
  // Deep narrow fjord cutting inland on the west coast of Kyushu. In 1612 this
  // is the Portuguese Estado's eastern terminus — the Nao do Trato runs between
  // Macau and Nagasaki, exchanging Chinese silk for Japanese silver. The
  // Jesuit mission is at its peak (the Church of the Assumption, dedicated 1601,
  // is the largest Christian church in East Asia) but two years from the 1614
  // expulsion. Dejima does not yet exist; foreigners live among the city.
  {
    id: 'nagasaki',
    name: 'Nagasaki',
    geography: 'inlet',
    climate: 'temperate',
    culture: 'Indian Ocean',
    buildingStyle: 'japanese-tile',
    scale: 'Medium',
    description: 'A deep fjord cuts northeast into steep wooded mountains on the west coast of Kyushu. The Portuguese black ship — the Nao do Trato — anchors here once a year, trading Chinese silk for Japanese silver under license from the Tokugawa shogunate. Jesuit seminaries, the Church of the Assumption, and the mansions of Christian daimyo crowd the harbor slopes; post-and-beam timber houses with deep grey-tile eaves climb the ravines above. The mood in 1612 is watchful: shogunate magistrates walk the docks, and rumors of an impending expulsion of foreign priests harden month by month.',
    openDirection: 'W',
    channelWidth: 0.55,              // narrow fjord, much tighter than Goa
    enclosure: 0.65,                 // steep mountain flanks enclose the harbor
    coastRuggedness: 1.25,           // jagged Kyushu coastline
    headlands: [
      // Nomozaki peninsula (south flank) — the dominant headland curving north
      { side: 'right', size: 0.62, width: 0.24, curl: 0.35, axisAngle: 12, ruggedness: 1.2 },
      // Nishisonogi peninsula (north flank) — smaller, gentler hook
      { side: 'left',  size: 0.48, width: 0.22, curl: 0.2,  axisAngle: -6, ruggedness: 1.15 },
    ],
    landmark: 'church-of-the-assumption',
  },

  // ── Masulipatnam ─────────────────────────────────────────────────────────────
  // Estuary port at the Krishna delta on the Coromandel coast. Capital of the
  // Qutb Shahi sultanate of Golconda's maritime trade in 1612 — Shia-ruled,
  // mixed Hindu-Muslim population. The Dutch VOC factory was established in
  // 1606 and the English EIC factory in 1611, making this the Europeans' second
  // beachhead on the subcontinent after Surat. Famous for cannabis (bhang),
  // premium opium, and hand-painted kalamkari cottons.
  {
    id: 'masulipatnam',
    name: 'Masulipatnam',
    geography: 'estuary',
    climate: 'monsoon',
    culture: 'Indian Ocean',
    // Reusing mughal-gujarati for v1; deccani-sultanate style is a future pass.
    buildingStyle: 'mughal-gujarati',
    scale: 'Large',
    description: 'The Krishna river fans out across a shifting delta of sandbars and braided channels into the Bay of Bengal. Under the Shia Qutb Shahi sultanate of Golconda, this is the Deccan\'s great eastward port — Persian textiles, diamonds from the mines inland, bhang and opium from the Coromandel hinterland all flow through. The Dutch VOC planted a factory in 1606 and the English EIC followed in 1611; both sit among the warehouses of Persian, Armenian, and Telugu Hindu merchants. The monsoon closes the port for months twice a year; the rest of the time the roadstead is packed with dhows, junks, and European yachts riding the tide through the sandbar channels.',
    openDirection: 'E',
    enclosure: 0.2,                  // low delta coast, little natural shelter
    riverMouthWidth: 0.35,           // much broader than Surat's Tapti
    riverInlandWidth: 0.05,          // braids thin upstream
    riverLength: 0.65,
    riverSinuosity: 0.22,            // strong meander across the delta
    coastRuggedness: 0.5,            // soft, low deltaic coast
    satellites: [
      // Two low sandbar islets in the river mouth — the "shifting sandbars"
      { dx:  0.14, dz: 0.02, size: 0.055, aspectRatio: 2.4, orientation: 80, shape: 'elongated', ruggedness: 0.6 },
      { dx: -0.08, dz: 0.09, size: 0.045, aspectRatio: 2.1, orientation: 95, shape: 'elongated', ruggedness: 0.6 },
    ],
    landmark: 'dutch-factory-masulipatnam',
  },

  // ── Cape Route Waypoint ──────────────────────────────────────────────────────
  {
    id: 'cape',
    name: 'Cape of Good Hope',
    geography: 'continental_coast',
    climate: 'mediterranean',
    culture: 'Indian Ocean',
    buildingStyle: 'khoikhoi-minimal',
    scale: 'Small',
    description: 'Table Mountain rises flat-topped above a wide, exposed anchorage in Table Bay. There is no settlement here, no quay — just a stony beach where ships send boats ashore to fill water casks from a stream running off the mountain\'s slopes. Khoikhoi herders sometimes drive cattle down to trade for iron and tobacco, though encounters can turn hostile without warning. The southeast wind blows relentlessly in summer, and ships that linger too long risk dragging anchor onto the rocks.',
    openDirection: 'S',
    enclosure: 0.05,
  },
];

// ── Climate → moisture range ───────────────────────────────────────────────────
export function getClimateMoisture(climate: ClimateProfile): [number, number] {
  switch (climate) {
    case 'tropical': return [0.6, 0.9];
    case 'arid':     return [0.05, 0.25];
    case 'temperate':return [0.3, 0.6];
    case 'monsoon':  return [0.4, 0.8];
    case 'mediterranean': return [0.15, 0.45];
  }
}

/** Strength of a turbid river plume at world-local (localX, localZ), in [0, 1].
 *  Non-zero only for archetypes with an explicit river mouth (estuary / tidal_river,
 *  or any def that sets riverMouthWidth). Peaks at the mouth and fans seaward and
 *  laterally — anisotropic so the plume reaches further out to sea than it does
 *  sideways along the coast. Used by the terrain shader to silt-tint ocean color
 *  near deltas. */
export function getRiverPlumeStrength(
  localX: number,
  localZ: number,
  def: PortDefinition,
): number {
  const hasExplicitRiver =
    def.geography === 'estuary' ||
    def.geography === 'tidal_river' ||
    def.riverMouthWidth !== undefined;
  if (!hasExplicitRiver) return 0;

  const MESH_HALF = _archetypeMeshHalf;
  const wx = localX / MESH_HALF;
  const wz = localZ / MESH_HALF;
  const [wrx, wrz] = rotateToOpen(wx, wz, def.openDirection);

  const mouthW = def.riverMouthWidth ?? 0.18;
  // Plume reaches ~4× mouth width seaward, ~2.5× laterally — wider rivers carry
  // sediment further. Only counts seaward (negative wrz, where the rotated frame
  // puts the open ocean).
  const lateral = Math.abs(wrx) / Math.max(mouthW * 2.5, 0.04);
  const seaward = Math.max(0, -wrz) / Math.max(mouthW * 4.0, 0.06);
  const radial = Math.sqrt(lateral * lateral + seaward * seaward);
  // Hold strong out to ~0.5, taper to nothing by 1.2.
  return 1 - smoothstep(0.5, 1.2, radial);
}

// ── Archetype Radius ───────────────────────────────────────────────────────────
export const ARCHETYPE_RADIUS = 120;

// ── Mesh half-size (synced from terrain.ts via setArchetypeMeshHalf) ──────────
let _archetypeMeshHalf = 450; // default matches World.tsx's 900/2

export function setArchetypeMeshHalf(half: number) {
  _archetypeMeshHalf = half;
}

// ── Shape Functions ────────────────────────────────────────────────────────────
// Each returns a value from -1 (definitely water) to +1 (definitely land).
// The terrain system blends this with noise based on distance from port center.

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Rotate local coordinates by the open direction so "open" always faces local -Y */
function rotateToOpen(lx: number, lz: number, openDir: CardinalDir | number): [number, number] {
  const angle = resolveDirRadians(openDir);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [lx * cos + lz * sin, -lx * sin + lz * cos];
}

// ── Coastal detail noise ─────────────────────────────────────────────────────
function _seed(a: number) {
  return function() {
    var t = a += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

let _coastNoise = createNoise2D(_seed(31415));
let _featureNoise = createNoise2D(_seed(27182));
let _ridgeNoise = createNoise2D(_seed(14142));

/** Re-seed archetype noise functions so coastlines vary per game seed. */
export function reseedArchetypeNoise(seed: number) {
  _coastNoise = createNoise2D(_seed(seed * 13 + 31415));
  _featureNoise = createNoise2D(_seed(seed * 17 + 27182));
  _ridgeNoise = createNoise2D(_seed(seed * 19 + 14142));
}

/** Multi-octave noise for irregular coastlines */
function coastNoise(x: number, z: number): number {
  return (
    _coastNoise(x * 0.012, z * 0.012) * 0.14 +
    _coastNoise(x * 0.03, z * 0.03) * 0.07 +
    _coastNoise(x * 0.07, z * 0.07) * 0.03
  );
}

/** Directional fade — only fades toward open water (negative wrz in rotated space).
 *  Land extends fully on the inland side and lateral edges. */
function radialFade(wrx: number, wrz: number, _inlandShift: number = 0.5): number {
  // Fade toward open water: only when wrz is negative (open direction)
  const openFade = wrz < -0.3 ? smoothstep(-0.3, -1.1, wrz) : 0;
  return 1 - openFade;
}

// ── Coastline base with headlands and enclosure ──────────────────────────────
/**
 * Shared coastline generator for all land-based archetypes.
 * Replaces the old parabola + smoothstep pattern with:
 *   1. Enclosure: coast curves around the water on the sides
 *   2. Headlands: tongues of land protruding toward open water
 *   3. Coastal noise: irregularity at multiple scales
 *
 * Returns land strength (0 = water, ~0.85 = solid land) with radialFade applied.
 * Archetype-specific features (channels, rivers, craters) subtract from this.
 */
function coastlineBase(
  wrx: number, wrz: number,
  cn: number,
  def: PortDefinition,
): number {
  const enc = def.enclosure ?? 0;

  // ── Base coastline position ──
  // With enclosure=0, this is a straight line across the map (old behavior).
  // As enclosure increases, the coastline wraps inward at the flanks,
  // creating a U-shape that pushes land around both sides of the water.
  const baseCurve = wrx * wrx * (0.10 + enc * 0.35);
  // Enclosure also brings the lateral edges of coast forward toward open water
  const lateralWrap = enc * 0.5 * (Math.abs(wrx) > 0.3 ?
    smoothstep(0.3, 0.9, Math.abs(wrx)) : 0);
  const coastPos = cn * 0.55 - baseCurve - lateralWrap;
  let landStrength = smoothstep(coastPos - 0.05, coastPos + 0.12, wrz);

  // ── Headlands: tongues of land protruding toward open water ──
  if (def.headlands) {
    for (const h of def.headlands) {
      const hx = h.side === 'left' ? -1 : 1;
      const baseCenterX = hx * (0.2 + h.width * 0.6) + (h.offset ?? 0);
      const extent = h.size * 0.9;
      const axisAngle = ((h.axisAngle ?? 0) * Math.PI) / 180;
      const curl = h.curl ?? 0;
      const rugg = h.ruggedness ?? 1.0;

      // Anchor the headland at (baseCenterX, coastPos) on the coastline. Local frame:
      //   u = along-axis distance into water (0 at coast, extent at tip)
      //   v = perpendicular to axis (lateral width)
      // When axisAngle = 0, u = intoWater and v = wrx - baseCenterX (old behavior).
      const dxP = wrx - baseCenterX;
      const dzP = wrz - coastPos;
      const cosA = Math.cos(axisAngle);
      const sinA = Math.sin(axisAngle);
      const u = dxP * sinA + (-dzP) * cosA;
      const vRaw = dxP * cosA + dzP * sinA;

      const headlandT = u / extent;
      if (headlandT > 0 && headlandT < 1.0) {
        // Curl: bend the headland toward (+) or away from (-) the harbor center.
        // "Toward harbor" means opposite of the flank side.
        const curlShift = -hx * curl * headlandT * headlandT * 0.35;
        const v = vRaw - curlShift;
        const narrowing = 1 - headlandT * 0.6;
        const lateralDist = Math.abs(v) / (h.width * narrowing);
        const crossSection = Math.exp(-lateralDist * lateralDist * 3);
        const tipFade = 1 - smoothstep(0.75, 1.0, headlandT);
        const headlandStr = crossSection * tipFade * 0.85;
        const edgeNoise = cn * 0.3 * headlandT * rugg;
        landStrength = Math.max(landStrength, headlandStr - edgeNoise);
      }
    }
  }

  // ── Apply radial fade ──
  const fade = radialFade(wrx, wrz, 0.45);
  return landStrength * fade;
}

/**
 * Carve a harbor/cove into a land-strength field. Returns reduction amount to subtract.
 * - rx: rotated local x in archetype-normalized coords (-1..1 at archetype radius)
 * - wrz: rotated mesh-normalized z (negative = open water side)
 * - localX, localZ: world-space coords (for noise sampling)
 * - R, MESH_HALF: to convert between coord spaces
 * Returns a value in [0, ~0.5] representing how much to subtract from landStrength.
 */
function carveHarbor(
  rx: number,
  wrz: number,
  localX: number,
  localZ: number,
  def: PortDefinition,
  R: number,
  MESH_HALF: number,
): number {
  const width = def.harborWidth ?? 0.4;
  const offset = def.harborOffset ?? 0;
  // Depth: explicit override, or fall back to curvature-derived value
  const depth = def.harborDepth ?? (def.coastCurvature ?? 0.6) * 0.35;
  const shape = def.harborShape ?? 'parabolic';

  const rxH = rx - offset;
  if (Math.abs(rxH) >= width) return 0;

  const t = rxH / width; // -1..1
  let profile: number;
  switch (shape) {
    case 'semicircle':
      // Circular-ish arc: sqrt profile gives a flatter bottom
      profile = Math.sqrt(Math.max(0, 1 - t * t));
      break;
    case 'scalloped': {
      // Parabolic with noise modulation on the rim
      const rim = _coastNoise(localX * 0.04 + 77, localZ * 0.04 + 77) * 0.25;
      profile = Math.max(0, (1 - t * t) * (1 + rim));
      break;
    }
    case 'parabolic':
    default:
      profile = 1 - t * t;
      break;
  }

  const coveIndent = depth * profile;
  const carveStrength = coveIndent * (R / MESH_HALF) * 2.5;
  // Only carve near the coastline, not deep inland
  const nearCoast = smoothstep(0.3, -0.1, wrz) * smoothstep(-0.6, -0.2, wrz);
  return carveStrength * nearCoast;
}

/** Interior ridge/valley modulation for terrain height variety */
function interiorVariety(lx: number, lz: number, shape: number): number {
  if (shape < 0.15) return shape;
  const r1 = _ridgeNoise(lx * 0.006, lz * 0.008);
  const r2 = _ridgeNoise(lx * 0.015 + 50, lz * 0.012 + 50);
  const ridge = (1 - Math.abs(r1)) * 0.15;
  const valley = r2 * 0.1;
  const landDepth = smoothstep(0.15, 0.5, shape);
  return shape * (0.78 + (ridge + valley) * landDepth * 0.28);
}

/** Offshore islands and rocky outcrops — sparse, irregular, realistic.
 *  Low-frequency noise produces few large blobs; high threshold ensures only
 *  the strongest peaks become islands (typically 3-8 per map). */
function offshoreFeatures(lx: number, lz: number, shape: number): number {
  if (shape > 0.1 || shape < -0.55) return 0;
  // Very low frequency → few, widely-spaced island candidates
  const fn = _featureNoise(lx * 0.007, lz * 0.007);
  // High threshold — only the top ~5% of noise peaks qualify
  const peak = smoothstep(0.72, 0.88, fn);
  if (peak < 0.01) return 0;
  // Shape the island with a second noise layer for irregular outline
  const detail = _featureNoise(lx * 0.04 + 200, lz * 0.04 + 200) * 0.3;
  // Only in the near-shore band (slightly underwater shapes)
  const nearCoast = smoothstep(-0.5, -0.08, shape) * smoothstep(0.1, -0.02, shape);
  return peak * (0.45 + detail) * nearCoast;
}

export function getArchetypeShape(
  localX: number,
  localZ: number,
  def: PortDefinition
): number {
  const R = ARCHETYPE_RADIUS;

  // Normalize to -1..1 range within archetype radius
  const nx = localX / R;
  const nz = localZ / R;
  const [rx, rz] = rotateToOpen(nx, nz, def.openDirection);

  // Mesh-scale coords (normalized to ±1 within actual mesh half-size)
  const MESH_HALF = _archetypeMeshHalf;
  const wx = localX / MESH_HALF;
  const wz = localZ / MESH_HALF;
  const [wrx, wrz] = rotateToOpen(wx, wz, def.openDirection);

  // Multi-octave coastal noise at this position, scaled per-port
  const cn = coastNoise(localX, localZ) * (def.coastRuggedness ?? 1.0);

  let shape: number;

  switch (def.geography) {
    case 'archipelago':
      shape = 0;
      break;

    case 'inlet': {
      // Continental land with a channel/inlet cutting in from the open direction.
      // Uses coastlineBase for the land shape (with headlands flanking the inlet).
      const landBase = coastlineBase(wrx, wrz, cn, def);
      // Channel narrows inland, smoothly tapering to nothing
      const cw = (def.channelWidth ?? 1.0) * 0.22;
      const inlandTaper = 1 - smoothstep(-0.1, 0.5, rz);
      const channelW = cw * inlandTaper;
      const channelDist = channelW > 0.001 ? Math.abs(rx) / channelW : 999;
      const channelStrength = channelDist < 1.0 ? (1 - channelDist * channelDist) * 0.8 * inlandTaper : 0;
      shape = landBase - channelStrength * 1.4;
      break;
    }

    case 'bay': {
      // Continental coastline with a curved harbor indentation.
      // Uses coastlineBase for the land + headland shape, then carves a cove.
      const landBase = coastlineBase(wrx, wrz, cn, def);
      const carve = carveHarbor(rx, wrz, localX, localZ, def, R, MESH_HALF);
      shape = landBase - carve - 0.05;
      break;
    }

    case 'strait': {
      // Two landmasses separated by a navigable channel — land extends off all edges
      // Optional taper: channel narrows toward +z (upstream end), for river-like ports
      const taperFactor = def.channelTaper ?? 0;
      const taper = 1.0 - taperFactor * (wrz * 0.5 + 0.5);
      const cw = (def.channelWidth ?? 1.0) * 0.25 * taper;
      const channelNoise = cn * 0.5;
      const channelEdge = cw + channelNoise;
      const absWrx = Math.abs(wrx);
      const isLand = absWrx > channelEdge;
      const landStrength = isLand ? smoothstep(channelEdge, channelEdge + 0.12, absWrx) : 0;
      shape = landStrength * 0.9 - (isLand ? 0 : 0.5);
      break;
    }

    case 'tidal_river': {
      // A navigable tidal river threads through the map with city on both banks.
      // Topology matches strait, but the baseline channel is roughly half as wide
      // and a sine-based meander offsets the centerline for Thames-like curvature.
      // - channelWidth: scales the river's half-width (0.5 ≈ Thames at London).
      // - channelTaper: narrows upstream (toward +z).
      // - riverSinuosity: lateral meander amplitude in mesh-normalized units
      //   (0 = straight, ~0.08 = gentle S-curve, ~0.15 = pronounced).
      const taperFactor = def.channelTaper ?? 0;
      const taper = 1.0 - taperFactor * (wrz * 0.5 + 0.5);
      const cw = (def.channelWidth ?? 1.0) * 0.14 * taper;
      // S-curve centerline: one full meander across the map length.
      const meander = (def.riverSinuosity ?? 0) * Math.sin(wrz * Math.PI * 1.2);
      const channelNoise = cn * 0.35;
      const shiftedX = wrx - meander;
      const channelEdge = cw + channelNoise;
      const absShifted = Math.abs(shiftedX);
      const isLand = absShifted > channelEdge;
      const landStrength = isLand ? smoothstep(channelEdge, channelEdge + 0.10, absShifted) : 0;
      shape = landStrength * 0.9 - (isLand ? 0 : 0.5);
      break;
    }

    case 'island': {
      // ── Island shape sub-classification system ──────────────────────────
      // Converts islandCoverage (fraction of map) + aspectRatio + orientation
      // into a shaped landmass with optional taper, harbors, and shape variants.

      const shapeType = def.islandShape ?? 'ovoid';
      const coverage = Math.max(0.10, Math.min(0.50, def.islandCoverage ?? 0.20));
      const ar = def.aspectRatio ?? 1.0;
      const orientDeg = def.orientation ?? 0;

      // Convert coverage to base radius in mesh-normalized coords.
      // coverage ≈ π·a·b / 4 where a,b are visual semi-axes.
      // The smoothstep coastline sits at islandDist ≈ 0.6, so visual = 0.6 * ellipse_divisor.
      // Solve: R = sqrt(4·coverage / π), then split by aspect ratio.
      const baseR = Math.sqrt(4 * coverage / Math.PI);
      const semiLong = baseR * Math.sqrt(ar);   // half-length along long axis
      const semiShort = baseR / Math.sqrt(ar);   // half-width perpendicular

      // Rotate world coords by island orientation (independent of openDirection)
      const orientRad = (orientDeg * Math.PI) / 180;
      const cosO = Math.cos(orientRad);
      const sinO = Math.sin(orientRad);
      // ix = across the island (short axis), iz = along the island (long axis)
      const ix = wx * cosO + wz * sinO;
      const iz = -wx * sinO + wz * cosO;

      // ── Taper: narrow one end ──────────────────────────────────────────
      let taperMult = 1.0;
      if (def.taperEnd) {
        // Map taperEnd direction to sign along iz axis
        const taperAngle = DIR_RADIANS[def.taperEnd];
        // Project taper direction onto the long axis to determine which end
        const taperSign = -Math.sin(taperAngle - orientRad);
        // Normalize iz to -1..1 range within the island length
        const izNorm = iz / (semiLong * 0.6);  // 0.6 = coastline distance
        // Taper reduces width toward the specified end
        const taperPos = izNorm * Math.sign(taperSign);
        taperMult = 1.0 - 0.4 * smoothstep(0.0, 1.0, taperPos);
      }

      const effShort = semiShort * taperMult;

      // ── Distance function varies by shape type ─────────────────────────
      let islandDist: number;
      const islandNoise = cn * 0.25;

      switch (shapeType) {
        case 'elongated': {
          // Superellipse (squircle-ish) for flatter ends on elongated islands
          const px = Math.abs(ix / effShort);
          const pz = Math.abs(iz / semiLong);
          // Exponent > 2 gives flatter sides; 2.5 for elongated feel
          islandDist = Math.pow(Math.pow(px, 2.5) + Math.pow(pz, 2.5), 1 / 2.5);
          break;
        }
        case 'barbell': {
          // Two lobes connected by an isthmus
          const lobeOffset = semiLong * 0.45;
          const lobeR = semiShort * 1.3;
          const d1 = Math.sqrt(ix * ix + (iz - lobeOffset) ** 2) / lobeR;
          const d2 = Math.sqrt(ix * ix + (iz + lobeOffset) ** 2) / lobeR;
          const isthmusW = effShort * 0.4;
          const isthmusDist = Math.abs(ix) / isthmusW;
          const izInIsthmus = Math.abs(iz) < lobeOffset ? 1.0 : 0.0;
          islandDist = Math.min(d1, d2, isthmusDist + (1 - izInIsthmus) * 10);
          break;
        }
        case 'atoll': {
          // Ring shape — land exists in annular band
          const ringDist = Math.sqrt((ix / effShort) ** 2 + (iz / semiLong) ** 2);
          const ringCenter = 0.55;
          const ringWidth = 0.2;
          islandDist = Math.abs(ringDist - ringCenter) / ringWidth;
          break;
        }
        case 'crescent': {
          // Offset circles — outer minus inner shifted sideways
          const outerDist = Math.sqrt((ix / effShort) ** 2 + (iz / semiLong) ** 2);
          const innerShift = effShort * 0.4;
          const innerDist = Math.sqrt(((ix - innerShift) / (effShort * 0.9)) ** 2 + (iz / (semiLong * 0.85)) ** 2);
          // Land where inside outer but outside inner
          islandDist = outerDist + smoothstep(0.7, 0.4, innerDist) * 0.6;
          break;
        }
        case 'ovoid':
        default: {
          // Standard ellipse (original behavior, but with proper sizing)
          islandDist = Math.sqrt((ix / effShort) ** 2 + (iz / semiLong) ** 2);
          break;
        }
      }

      // ── Harbor indentations ────────────────────────────────────────────
      let harborIndent = 0;
      if (def.harbors) {
        for (const h of def.harbors) {
          // Convert harbor side direction to angle, then to ix/iz position
          const hAngle = DIR_RADIANS[h.side] - orientRad;
          const hDirX = Math.sin(hAngle);   // across short axis
          const hDirZ = -Math.cos(hAngle);  // along long axis

          // Harbor position along long axis: 0-1 mapped to -semiLong..+semiLong
          const hPosZ = (h.position - 0.5) * 2 * semiLong * 0.6;

          // Distance from this point to the harbor center (in island-local coords)
          const dAlong = (iz - hPosZ) / (semiLong * h.width);
          const dAcross = hDirX > 0 ? Math.max(0, ix * 0.8) : Math.max(0, -ix * 0.8);

          // Gaussian-ish indent: strongest at harbor center, fades along coast
          const harborStrength = Math.exp(-dAlong * dAlong * 4) * h.depth;
          // Only carve into the side the harbor is on
          const sideFactor = smoothstep(0.0, 0.3, dAcross / effShort);
          harborIndent = Math.max(harborIndent, harborStrength * (0.5 + sideFactor * 0.5));
        }
      }

      // Apply harbor as reduction in land strength
      const landStrength = smoothstep(0.9 + islandNoise, 0.3, islandDist) * (1 - harborIndent * 1.2);

      // ── Scattered islets (same as before) ──────────────────────────────
      const smallFn = _featureNoise(localX * 0.012, localZ * 0.012);
      const smallDetail = _coastNoise(localX * 0.045, localZ * 0.045) * 0.15;
      const isletBand = smoothstep(0.5, 0.8, islandDist) * smoothstep(1.8, 1.2, islandDist);
      const isletStrength = smoothstep(0.35, 0.6, smallFn) * isletBand * (0.5 + smallDetail);

      const meshDist = Math.sqrt(wx * wx + wz * wz);
      const edgeFade = 1 - smoothstep(0.8, 1.0, meshDist);
      shape = Math.max(landStrength, isletStrength) * edgeFade - 0.05;
      break;
    }

    case 'coastal_island': {
      // SUBTRACTIVE approach: start with land everywhere, carve two wide
      // creek channels that diverge inland from the open-water side.
      // The island is the land left between the creeks; mainland is the
      // outer banks. Now supports aspectRatio for island shape and harbors.

      const cw = (def.channelWidth ?? 1.0);
      const ciAr = def.aspectRatio ?? 1.0;
      const fade = radialFade(wrx, wrz, 0.45);

      // ── Base land: everything is land except far open water ──
      const openOcean = smoothstep(-0.15, -0.55, wrz);
      const baseLand = (1 - openOcean) * fade;

      // ── Creek geometry ──
      // Creek spread scales inversely with aspect ratio — wider island = creeks further apart
      const spreadAngle = 0.35 * cw * Math.sqrt(ciAr);
      const creekSpread = smoothstep(-0.15, 0.5, wrz) * spreadAngle;

      const c1Center = -creekSpread - 0.04;
      const c2Center = creekSpread + 0.04;

      // Creek width scales with aspect ratio too
      const baseWidth = 0.10 * cw;
      const mouthWidth = 0.16 * cw;
      const creekW = mouthWidth + (baseWidth - mouthWidth) * smoothstep(-0.2, 0.45, wrz);

      // Noisy creek banks
      const bankNoise1 = _coastNoise(localX * 0.022 + 300, localZ * 0.03) * 0.025;
      const bankNoise2 = _coastNoise(localX * 0.025, localZ * 0.022 + 300) * 0.025;

      const creekStart = -0.3;
      const creekEnd = 0.55;
      const creekExtent = smoothstep(creekStart, creekStart + 0.12, wrz)
                        * (1 - smoothstep(creekEnd - 0.1, creekEnd, wrz));

      const d1 = Math.abs(wrx - c1Center + bankNoise1);
      const d2 = Math.abs(wrx - c2Center + bankNoise2);
      const creek1 = smoothstep(creekW, creekW * 0.15, d1) * creekExtent;
      const creek2 = smoothstep(creekW, creekW * 0.15, d2) * creekExtent;

      // Harbor mouth
      const mouthZone = smoothstep(0.0, -0.2, wrz) * smoothstep(-0.45, -0.25, wrz);
      const mouthHalfW = (creekSpread + creekW * 1.5 + 0.02);
      const inMouth = Math.abs(wrx) < mouthHalfW ? 1 : 0;
      const mouthStr = inMouth * mouthZone * smoothstep(mouthHalfW, mouthHalfW * 0.2, Math.abs(wrx));

      const waterCarve = Math.max(creek1, creek2, mouthStr);

      // ── Small inlets and irregularity along creek banks ──
      const inletNoise = _featureNoise(localX * 0.035, localZ * 0.035);
      const nearCreek = Math.max(
        smoothstep(creekW * 2.5, creekW, d1),
        smoothstep(creekW * 2.5, creekW, d2)
      ) * creekExtent;
      const inlets = smoothstep(0.45, 0.7, inletNoise) * nearCreek * 0.4;

      // ── Harbor indentations on the island itself ──
      let ciHarborIndent = 0;
      if (def.harbors) {
        for (const h of def.harbors) {
          const hAngle = DIR_RADIANS[h.side];
          const hRad = hAngle - resolveDirRadians(def.openDirection);
          const hDirX = Math.sin(hRad);
          // Position along the island (mapped to wrx since island sits between creeks)
          const hPosX = (h.position - 0.5) * 2 * spreadAngle;
          const dAlong = (wrx - hPosX) / (spreadAngle * h.width * 2);
          const dToward = hDirX > 0 ? Math.max(0, -wrz) : Math.max(0, wrz);
          const str = Math.exp(-dAlong * dAlong * 4) * h.depth;
          const side = smoothstep(0.0, 0.15, dToward);
          ciHarborIndent = Math.max(ciHarborIndent, str * (0.5 + side * 0.5));
        }
      }

      shape = baseLand - waterCarve * 1.15 - inlets - ciHarborIndent * 0.8 - 0.05;
      break;
    }

    case 'peninsula': {
      // Prominent finger of land extending toward open water from a curved mainland.
      // Now supports aspectRatio for width control and harbors for bay indentations.
      const penAr = def.aspectRatio ?? 1.0;
      const penCurve = def.coastCurvature ?? 0.6;

      // Mainland: curved headland on inland side
      const coastCurveVal = wrx * wrx * (0.08 + penCurve * 0.08);
      const mainCoast = 0.05 + cn - coastCurveVal;
      const mainStrength = smoothstep(mainCoast - 0.05, mainCoast + 0.1, wrz);
      const fade = radialFade(wrx, wrz, 0.5);
      const mainland = mainStrength * fade;

      // Peninsula: tapered strip — width inversely proportional to aspect ratio
      const penLength = 1.0;
      const penStart = mainCoast + 0.05;
      const penEnd = penStart - penLength;
      const inPenRange = wrz < penStart && wrz > penEnd;
      const t = inPenRange ? (penStart - wrz) / penLength : 0;
      // Higher aspect ratio = narrower peninsula
      const baseW = 0.22 / Math.sqrt(penAr);
      const tipW = 0.04 / Math.sqrt(penAr);
      const taperW = baseW + (tipW - baseW) * t;
      const penCN = _coastNoise(localX * 0.035, localZ * 0.035) * 0.02;
      let hw = taperW + penCN;

      // ── Harbor indentations along the peninsula ──
      let penHarborIndent = 0;
      if (def.harbors) {
        for (const h of def.harbors) {
          // Harbor position along the peninsula length (0 = base, 1 = tip)
          const hT = h.position;
          const dAlong = (t - hT) / h.width;
          const bayStr = Math.exp(-dAlong * dAlong * 4) * h.depth;
          // Determine which side of the peninsula
          const hAngle = DIR_RADIANS[h.side] - resolveDirRadians(def.openDirection);
          const hSide = Math.sin(hAngle);
          // Only indent from the correct side
          if ((hSide > 0 && wrx > 0) || (hSide < 0 && wrx < 0) || hSide === 0) {
            penHarborIndent = Math.max(penHarborIndent, bayStr);
          }
        }
      }
      // Narrow the peninsula where harbors indent
      hw *= (1 - penHarborIndent * 0.6);

      const inPen = inPenRange && Math.abs(wrx) < hw;
      const penEdge = inPen ? smoothstep(hw, hw * 0.15, Math.abs(wrx)) : 0;
      const tipFade = t > 0.82 ? 1 - smoothstep(0.82, 1.0, t) : 1;
      const penStrength = penEdge * tipFade * 0.7;
      shape = Math.max(mainland, penStrength) - 0.1;
      break;
    }

    case 'estuary': {
      // Continental coast with a meandering river.
      // The river has a mouth width and a minimum inland width, so it stays
      // connected instead of breaking into puddles. Centerline shifts with
      // low-frequency noise for sinuosity.
      const landBase = coastlineBase(wrx, wrz, cn, def);
      const mouthW = def.riverMouthWidth ?? 0.18;
      const inlandW = def.riverInlandWidth ?? 0.06;
      const riverLen = def.riverLength ?? 0.5;
      const sinuosity = def.riverSinuosity ?? 0.08;

      // Width profile: mouthW at coast (wrz = coastPos ≈ 0), lerp to inlandW at wrz ≈ 0.3,
      // then final taper to zero over riverLen.
      const tWidth = smoothstep(-0.1, 0.35, wrz);
      let rw = mouthW * (1 - tWidth) + inlandW * tWidth;
      // Hard final taper beyond riverLength so the channel ends cleanly
      const endTaper = 1 - smoothstep(riverLen - 0.12, riverLen, wrz);
      rw *= endTaper;
      // Subtle width noise (keeps banks irregular without breaking continuity)
      rw += _coastNoise(localX * 0.02, localZ * 0.015) * 0.02;

      // Meandering centerline: low-frequency lateral shift, stronger further inland
      const meander = _coastNoise(localX * 0.006 + 500, localZ * 0.008 + 500) * sinuosity * smoothstep(-0.1, 0.4, wrz);
      const dFromCenter = Math.abs(wrx - meander);

      const riverStrength = rw > 0.005 && dFromCenter < rw
        ? smoothstep(rw, rw * 0.25, dFromCenter)
        : 0;

      shape = landBase - riverStrength * 1.3;
      break;
    }

    case 'crater_harbor': {
      // Continental headland with a volcanic caldera harbor.
      // Uses coastlineBase for the surrounding land + headlands.
      const landBase = coastlineBase(wrx, wrz, cn, def);
      // Ensure solid land behind the crater (boost inland area)
      const inlandBoost = smoothstep(0.0, 0.3, wrz) * 0.3;
      // Crater basin carved into the headland
      const basinCenterZ = -0.2;
      const basinDist = Math.sqrt(rx * rx + (rz - basinCenterZ) ** 2);
      const basinRadius = 0.25;
      const inBasin = basinDist < basinRadius;
      const basinStrength = inBasin ? smoothstep(basinRadius, basinRadius * 0.35, basinDist) : 0;
      const channelW = 0.1;
      const inChannel = Math.abs(rx) < channelW && rz < basinCenterZ;
      const channelStr = inChannel ? smoothstep(channelW, 0, Math.abs(rx)) : 0;
      const rimBoost = (!inBasin && !inChannel)
        ? smoothstep(basinRadius + 0.25, basinRadius, basinDist) * 0.25
        : 0;
      const carved = Math.max(basinStrength, channelStr) * 1.4;
      shape = Math.max(landBase, 0.5 * radialFade(wrx, wrz, 0.45)) * 0.85 + inlandBoost + rimBoost - carved;
      break;
    }

    case 'continental_coast': {
      // Coastline with noise — land on one side, ocean on the other.
      // Uses coastlineBase which now handles headlands and enclosure.
      const baseLand = coastlineBase(wrx, wrz, cn, def) * 0.85;
      // Opt-in harbor carve when any harbor knob is set
      const hasHarbor = def.harborWidth !== undefined
        || def.harborDepth !== undefined
        || def.harborOffset !== undefined;
      const carve = hasHarbor ? carveHarbor(rx, wrz, localX, localZ, def, R, MESH_HALF) : 0;
      shape = baseLand - carve - 0.08;
      break;
    }

    case 'lagoon': {
      // Shallow basin shielded by a barrier-island chain (Lido), with the city
      // as a solid contiguous mass of closely-packed islands in the middle and
      // a marshy mainland coast on the back side (terra firma). All coords use
      // rotated wrx/wrz: open sea sits at wrz < ~0, mainland at wrz > ~0.55.
      //
      // Composed of three coherent landmasses with organic outlines:
      //  1. Lido — curved barrier chain near wrz ≈ -0.05, broken into several
      //     islands by three porti (tidal inlets).
      //  2. City — one solid cluster at (~-0.04, 0.24), carved by a sinuous
      //     Grand Canal and thin ridge-noise rii, not fragmented into scraps.
      //  3. Mainland — terra firma beyond wrz ≈ 0.58, with marshy inlets.

      // ── Lido (barrier chain) ─────────────────────────────────────────────
      // Gentle arc: slightly bows seaward near the ends so the chain reads as
      // a curved barrier rather than a ruler-straight strip.
      const lidoArcZ = -0.05 - 0.03 * (wrx * wrx) * 4;
      // Width varies along length — fattest near center (the Lido proper),
      // thinning toward Pellestrina and Sottomarina at the ends.
      const lidoHalfW = 0.075 * (1 - 0.45 * Math.abs(wrx));
      const lidoNoise = cn * 0.35;
      const lidoDist = Math.abs(wrz - lidoArcZ);
      // Three porti (historical Lido, Malamocco, Chioggia inlets)
      const porto1 = 1 - smoothstep(0.0, 0.045, Math.abs(wrx - 0.30));
      const porto2 = 1 - smoothstep(0.0, 0.035, Math.abs(wrx + 0.05));
      const porto3 = 1 - smoothstep(0.0, 0.045, Math.abs(wrx + 0.42));
      const portiMax = Math.max(porto1, Math.max(porto2, porto3));
      const lidoEnv = 1 - smoothstep(lidoHalfW * 0.25, lidoHalfW + Math.abs(lidoNoise), lidoDist);
      // Low-freq dropout gives natural width variation without hollowing it.
      const lidoWobble = 0.85 + _coastNoise(localX * 0.018 + 77, localZ * 0.022) * 0.15;
      const lidoStrength = lidoEnv * lidoWobble * (1 - 0.95 * portiMax) * 0.85;

      // ── Mainland (terra firma) with marshy inlets ────────────────────────
      // Coast offset by low-freq noise so shoreline has peninsulas and bays
      // rather than a single ruler-straight smoothstep transition.
      const marshOffset = _featureNoise(localX * 0.009 + 420, localZ * 0.011 - 160) * 0.14;
      const coastLine = 0.58 + cn * 0.45 + marshOffset;
      const mainland = smoothstep(coastLine, coastLine + 0.22, wrz) * 0.95;

      // ── City core (solid contiguous mass) ────────────────────────────────
      const cityCx = -0.04;
      const cityCz = 0.24;
      const dCx = wrx - cityCx;
      const dCz = wrz - cityCz;
      // Elliptical envelope — elongated along lagoon axis, slightly larger
      // than before so building density has room to breathe.
      const cityRadius = Math.sqrt(dCx * dCx * 0.80 + dCz * dCz * 1.50);
      // Organic outline: modulate the envelope with coast noise so the island
      // silhouette wobbles rather than reading as a clean ellipse.
      const outlineWobble = _coastNoise(localX * 0.022 + 60, localZ * 0.022 - 40) * 0.06;
      const cityEnv = smoothstep(0.36 + outlineWobble, 0.12 + outlineWobble, cityRadius);
      // Solid mass — no fragmentation noise. Peak stays at 0.90 so even the
      // outline is comfortably buildable, not teetering near sea level.
      const cityMass = cityEnv * 0.90;

      // Grand Canal: a single sinuous S-cut running through the city core,
      // dividing it roughly into sestieri. Width ~0.018 in normalized coords.
      const gcPhase = (wrz - cityCz) * 5.2;
      const gcCenterline = cityCx + Math.sin(gcPhase) * 0.07;
      const gcDist = Math.abs(wrx - gcCenterline);
      const gcWidth = 0.020 + Math.sin(gcPhase * 0.6) * 0.004;
      const grandCanal = (1 - smoothstep(gcWidth * 0.4, gcWidth, gcDist)) * cityEnv * 0.55;

      // Thin rii (secondary canals) carved by ridge noise — narrow lines, not
      // blobs. These create texture without dissecting the island.
      const riiRidge = 1 - Math.abs(_ridgeNoise(localX * 0.048 + 120, localZ * 0.052 - 80));
      const riiCarve = smoothstep(0.88, 0.98, riiRidge) * cityEnv * 0.30;

      shape = Math.max(lidoStrength, mainland, cityMass) - grandCanal - riiCarve - 0.05;
      break;
    }
  }

  // Interior variety: ridges and valleys across all land areas
  shape = interiorVariety(localX, localZ, shape);

  // Offshore features: small islands and rocky outcrops near coastlines.
  // Skip for lagoon — a sheltered basin shouldn't be sprinkled with random
  // rocks; all its land is authored explicitly (Lido, city, mainland, satellites).
  if (def.geography !== 'lagoon') {
    const offshore = offshoreFeatures(localX, localZ, shape);
    if (offshore > 0) shape = Math.max(shape, offshore);
  }

  // Named satellite features: explicit offshore islands/rocks
  if (def.satellites && def.satellites.length > 0) {
    const MESH_HALF2 = _archetypeMeshHalf;
    const wx2 = localX / MESH_HALF2;
    const wz2 = localZ / MESH_HALF2;
    for (const s of def.satellites) {
      const ldx = wx2 - s.dx;
      const ldz = wz2 - s.dz;
      const oRad = ((s.orientation ?? 0) * Math.PI) / 180;
      const cosO = Math.cos(oRad);
      const sinO = Math.sin(oRad);
      const ix = ldx * cosO + ldz * sinO;
      const iz = -ldx * sinO + ldz * cosO;
      const ar = s.aspectRatio ?? 1.0;
      const semiLong = s.size * Math.sqrt(ar);
      const semiShort = s.size / Math.sqrt(ar);
      const rugg = s.ruggedness ?? 1.0;
      const sn = _coastNoise(localX * 0.04 + s.dx * 200, localZ * 0.04 + s.dz * 200) * 0.22 * rugg;
      const shapeType = s.shape ?? 'ovoid';
      let d: number;
      if (shapeType === 'elongated') {
        // Pow 2.0 is a pure ellipse; higher powers read as a rounded rectangle
        // ("squircle") which looks unnaturally geometric for an island. We add
        // noise to the distance metric to break up the outline as well.
        const px = Math.abs(ix / semiShort);
        const pz = Math.abs(iz / semiLong);
        d = Math.pow(Math.pow(px, 2.0) + Math.pow(pz, 2.0), 1 / 2.0) + sn * 0.35;
      } else if (shapeType === 'rugged') {
        d = Math.sqrt((ix / semiShort) ** 2 + (iz / semiLong) ** 2) + sn * 1.8;
      } else {
        // ovoid: still add a touch of outline noise so the silhouette isn't
        // a textbook-perfect ellipse.
        d = Math.sqrt((ix / semiShort) ** 2 + (iz / semiLong) ** 2) + sn * 0.45;
      }
      const satStrength = smoothstep(1.0 + sn, 0.4, d) * 0.75;
      if (satStrength > 0.02) shape = Math.max(shape, satStrength);
    }
  }

  return shape;
}

// ── World Size Presets ─────────────────────────────────────────────────────────
export type WorldSize = 'Small' | 'Medium' | 'Large';

export const WORLD_SIZE_VALUES: Record<WorldSize, number> = {
  'Small': 75,
  'Medium': 150,
  'Large': 300,
};
