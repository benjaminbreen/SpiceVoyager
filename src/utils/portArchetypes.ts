import { PortScale, Culture } from '../store/gameStore';
import { createNoise2D } from 'simplex-noise';

// ── Direction helpers ──────────────────────────────────────────────────────────
export type CardinalDir = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';

const DIR_RADIANS: Record<CardinalDir, number> = {
  N: 0, NE: Math.PI / 4, E: Math.PI / 2, SE: (3 * Math.PI) / 4,
  S: Math.PI, SW: (5 * Math.PI) / 4, W: (3 * Math.PI) / 2, NW: (7 * Math.PI) / 4,
};

// ── Types ──────────────────────────────────────────────────────────────────────
export type GeographicArchetype =
  | 'archipelago'        // current default — pure noise, scattered islands
  | 'inlet'              // channel of water cutting into land (Goa)
  | 'bay'                // concave cove harbor (Mombasa)
  | 'strait'             // water between two landmasses (Malacca)
  | 'island'             // isolated landmass in open sea (Hormuz, Zanzibar)
  | 'coastal_island'     // island nestled in creeks off a continental coast (Mombasa)
  | 'peninsula'          // land jutting into water (Macau)
  | 'estuary'            // river mouth fanning out (Surat)
  | 'crater_harbor'      // volcanic caldera harbor (Aden)
  | 'continental_coast'; // straight coastline (Calicut)

export type ClimateProfile = 'tropical' | 'arid' | 'temperate' | 'monsoon';

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
}

export interface PortDefinition {
  id: string;
  name: string;
  geography: GeographicArchetype;
  climate: ClimateProfile;
  culture: Culture;
  scale: PortScale;
  description: string;
  openDirection: CardinalDir;     // primary water-facing direction
  /** Where the city sits relative to center (opposite of open direction by default) */
  cityDirection?: CardinalDir;
  /** Archetype-specific params */
  channelWidth?: number;          // inlet/strait width multiplier (0.5-2.0)
  landmassSize?: number;          // legacy island size multiplier (use islandCoverage instead)
  coastCurvature?: number;        // bay curvature (0.3 - 1.0)
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
}

// ── The Dozen Core Ports ───────────────────────────────────────────────────────
export const CORE_PORTS: PortDefinition[] = [
  {
    id: 'goa',
    name: 'Goa',
    geography: 'inlet',
    climate: 'tropical',
    culture: 'European',
    scale: 'Large',
    description: 'Portuguese-held tropical port on the Malabar coast. A narrow inlet cuts east from the Arabian Sea, sheltering the harbor.',
    openDirection: 'W',
    channelWidth: 0.8,
    enclosure: 0.5,              // moderate enclosure — Mandovi estuary flanked by land
    headlands: [
      { side: 'left', size: 0.55, width: 0.25 },   // Cabo headland (north bank)
      { side: 'right', size: 0.45, width: 0.2 },    // Mormugao headland (south bank)
    ],
  },
  {
    id: 'hormuz',
    name: 'Hormuz',
    geography: 'island',
    climate: 'arid',
    culture: 'Indian Ocean',
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
    scale: 'Medium',
    description: 'Ancient port built within the crater of an extinct volcano. Guards the entrance to the Red Sea.',
    openDirection: 'S',
    enclosure: 0.4,              // Shamsan crater partially encloses the harbor
    headlands: [
      { side: 'left', size: 0.4, width: 0.3 },   // Jebel Shamsan western arm
      { side: 'right', size: 0.35, width: 0.25 }, // eastern volcanic ridge
    ],
  },
  {
    id: 'zanzibar',
    name: 'Zanzibar',
    geography: 'island',
    climate: 'tropical',
    culture: 'Indian Ocean',
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
    climate: 'temperate',
    culture: 'European',
    scale: 'Medium',
    description: 'Portuguese trading post on a narrow peninsula in the Pearl River estuary. Gateway to the China trade.',
    openDirection: 'S',
    aspectRatio: 2.2,            // narrow peninsula, longer than wide
    coastCurvature: 0.7,        // moderate mainland curve
    harbors: [
      { side: 'E', position: 0.5, depth: 0.25, width: 0.4 },  // Praia Grande bay
    ],
  },
  {
    id: 'mombasa',
    name: 'Mombasa',
    geography: 'coastal_island',
    climate: 'monsoon',
    culture: 'Indian Ocean',
    scale: 'Medium',
    description: 'Swahili port on a coral island in a coastal creek system. Fort Jesus guards the harbor. Tudor Creek and Kilindini Harbour flank the island.',
    openDirection: 'E',
    channelWidth: 0.8,
    aspectRatio: 1.8,            // Mombasa Island is roughly rectangular, wider E-W
    orientation: 80,             // long axis runs roughly E-W
    harbors: [
      { side: 'SE', position: 0.7, depth: 0.2, width: 0.3 },  // Old Port / Fort Jesus harbor
    ],
  },
  {
    id: 'calicut',
    name: 'Calicut',
    geography: 'continental_coast',
    climate: 'monsoon',
    culture: 'Indian Ocean',
    scale: 'Large',
    description: 'The Zamorin\'s capital on the Malabar coast. First landfall of Vasco da Gama. Rich in pepper and spices.',
    openDirection: 'W',
    enclosure: 0.15,             // mostly open coast, slight natural bay
    headlands: [
      { side: 'right', size: 0.25, width: 0.2 },  // Kadalundi point to the south
    ],
  },
  {
    id: 'surat',
    name: 'Surat',
    geography: 'estuary',
    climate: 'monsoon',
    culture: 'Indian Ocean',
    scale: 'Large',
    description: 'Mughal Empire\'s great western port at the mouth of the Tapti River. Hub of the Gujarat textile trade.',
    openDirection: 'W',
    enclosure: 0.25,             // river banks create partial shelter
    headlands: [
      { side: 'left', size: 0.35, width: 0.2 },   // Dumas point (north bank)
    ],
  },
  {
    id: 'muscat',
    name: 'Muscat',
    geography: 'bay',
    climate: 'arid',
    culture: 'Indian Ocean',
    scale: 'Medium',
    description: 'Omani port nestled between jagged mountains, its harbor sheltered by rocky headlands.',
    openDirection: 'N',
    coastCurvature: 0.9,
    enclosure: 0.7,              // deeply enclosed — dramatic headlands nearly close the harbor
    headlands: [
      { side: 'left', size: 0.65, width: 0.2 },   // al-Jalali fort headland
      { side: 'right', size: 0.6, width: 0.18 },   // Mutrah corniche headland
    ],
  },
  {
    id: 'mocha',
    name: 'Mocha',
    geography: 'continental_coast',
    climate: 'arid',
    culture: 'Indian Ocean',
    scale: 'Small',
    description: 'Yemen\'s coffee port on the Red Sea coast. The finest Arabian coffee passes through its warehouses.',
    openDirection: 'S',
  },
  {
    id: 'bantam',
    name: 'Bantam',
    geography: 'bay',
    climate: 'tropical',
    culture: 'Indian Ocean',
    scale: 'Medium',
    description: 'Javanese pepper port on a sheltered bay at the western tip of Java. Contested by English, Dutch, and local sultans.',
    openDirection: 'N',
    coastCurvature: 0.6,
    enclosure: 0.35,             // gentle sheltered bay
    headlands: [
      { side: 'right', size: 0.3, width: 0.25 },  // eastern point sheltering the bay
    ],
  },
  {
    id: 'socotra',
    name: 'Socotra',
    geography: 'island',
    climate: 'arid',
    culture: 'Indian Ocean',
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
  },
];

// ── Climate → moisture range ───────────────────────────────────────────────────
export function getClimateMoisture(climate: ClimateProfile): [number, number] {
  switch (climate) {
    case 'tropical': return [0.6, 0.9];
    case 'arid':     return [0.05, 0.25];
    case 'temperate':return [0.3, 0.6];
    case 'monsoon':  return [0.4, 0.8];
  }
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
function rotateToOpen(lx: number, lz: number, openDir: CardinalDir): [number, number] {
  const angle = DIR_RADIANS[openDir];
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
      // Position headland on left or right flank
      const hx = h.side === 'left' ? -1 : 1;
      // Center of headland base along the coast
      const centerX = hx * (0.2 + h.width * 0.6);
      // Distance across the headland (lateral)
      const dx = (wrx - centerX) / h.width;
      // How far the headland extends toward open water (negative wrz)
      const extent = h.size * 0.9;
      // Headland profile: extends from coastline toward open water
      // Tapers from full width at base to point at tip
      const intoWater = -wrz + coastPos;  // how far past the coastline (positive = in water)
      const headlandT = intoWater / extent; // 0 at coast, 1 at tip
      if (headlandT > 0 && headlandT < 1.0) {
        // Width narrows toward the tip
        const narrowing = 1 - headlandT * 0.6;
        const lateralDist = Math.abs(dx) / narrowing;
        // Smooth headland shape: Gaussian cross-section that tapers to tip
        const crossSection = Math.exp(-lateralDist * lateralDist * 3);
        const tipFade = 1 - smoothstep(0.75, 1.0, headlandT);
        const headlandStr = crossSection * tipFade * 0.85;
        // Noisy edge
        const edgeNoise = cn * 0.3 * headlandT;
        landStrength = Math.max(landStrength, headlandStr - edgeNoise);
      }
    }
  }

  // ── Apply radial fade ──
  const fade = radialFade(wrx, wrz, 0.45);
  return landStrength * fade;
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

  // Multi-octave coastal noise at this position
  const cn = coastNoise(localX, localZ);

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
      // Cove carved into the coastline center
      const curvature = def.coastCurvature ?? 0.6;
      const coveDepth = curvature * 0.35;
      const coveWidth = 0.4;
      const coveIndent = Math.abs(rx) < coveWidth
        ? coveDepth * (1 - (rx / coveWidth) ** 2)
        : 0;
      // Convert indent to mesh-space and carve from land
      const carveStrength = coveIndent * (R / MESH_HALF) * 2.5;
      // Only carve near the coastline, not deep inland
      const nearCoast = smoothstep(0.3, -0.1, wrz) * smoothstep(-0.6, -0.2, wrz);
      shape = landBase - carveStrength * nearCoast - 0.05;
      break;
    }

    case 'strait': {
      // Two landmasses separated by a navigable channel — land extends off all edges
      const cw = (def.channelWidth ?? 1.0) * 0.25;
      const channelNoise = cn * 0.5;
      const channelEdge = cw + channelNoise;
      const absWrx = Math.abs(wrx);
      const isLand = absWrx > channelEdge;
      const landStrength = isLand ? smoothstep(channelEdge, channelEdge + 0.12, absWrx) : 0;
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
          const hRad = hAngle - DIR_RADIANS[def.openDirection];
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
          const hAngle = DIR_RADIANS[h.side] - DIR_RADIANS[def.openDirection];
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
      // Continental coast with a river mouth fanning out into a delta.
      // Uses coastlineBase for the land + headland shape, then carves the river.
      const landBase = coastlineBase(wrx, wrz, cn, def);
      // River: widens toward the mouth, tapers to nothing inland
      const inlandTaper = 1 - smoothstep(0.1, 0.4, wrz);
      const riverWidth = (0.08 + Math.max(0, -wrz) * 0.22) * inlandTaper;
      const riverNoise = _coastNoise(localX * 0.02, localZ * 0.015) * 0.03;
      const rw = riverWidth + riverNoise;
      const riverStrength = rw > 0.005 && Math.abs(wrx) < rw
        ? smoothstep(rw, rw * 0.15, Math.abs(wrx))
        : 0;
      // Delta islands near the mouth
      const deltaX = rx * 7, deltaZ = (rz + 0.3) * 5;
      const deltaNoise = Math.sin(deltaX * 2.1) * Math.cos(deltaZ * 1.7) * 0.25;
      const nearMouth = wrz < -0.1 && wrz > -0.5 ? deltaNoise * smoothstep(-0.5, -0.2, wrz) : 0;
      shape = landBase - riverStrength * 1.2 + nearMouth;
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
      shape = coastlineBase(wrx, wrz, cn, def) * 0.85 - 0.08;
      break;
    }
  }

  // Interior variety: ridges and valleys across all land areas
  shape = interiorVariety(localX, localZ, shape);

  // Offshore features: small islands and rocky outcrops near coastlines
  const offshore = offshoreFeatures(localX, localZ, shape);
  if (offshore > 0) shape = Math.max(shape, offshore);

  return shape;
}

// ── World Size Presets ─────────────────────────────────────────────────────────
export type WorldSize = 'Small' | 'Medium' | 'Large';

export const WORLD_SIZE_VALUES: Record<WorldSize, number> = {
  'Small': 75,
  'Medium': 150,
  'Large': 300,
};
