import { PortScale, Culture } from '../store/gameStore';

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
  | 'island'             // isolated landmass (Hormuz, Zanzibar)
  | 'peninsula'          // land jutting into water (Macau)
  | 'estuary'            // river mouth fanning out (Surat)
  | 'crater_harbor'      // volcanic caldera harbor (Aden)
  | 'continental_coast'; // straight coastline (Calicut)

export type ClimateProfile = 'tropical' | 'arid' | 'temperate' | 'monsoon';

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
  landmassSize?: number;          // island size multiplier
  coastCurvature?: number;        // bay curvature (0.3 - 1.0)
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
    landmassSize: 0.6,
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
    landmassSize: 1.2,
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
  },
  {
    id: 'mombasa',
    name: 'Mombasa',
    geography: 'bay',
    climate: 'monsoon',
    culture: 'Indian Ocean',
    scale: 'Medium',
    description: 'Swahili port on an island in a sheltered bay. Fort Jesus guards the harbor entrance.',
    openDirection: 'E',
    coastCurvature: 0.7,
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
    geography: 'inlet',
    climate: 'tropical',
    culture: 'Indian Ocean',
    scale: 'Medium',
    description: 'Javanese pepper port on the Sunda Strait. Contested by English, Dutch, and local sultans.',
    openDirection: 'N',
    channelWidth: 1.0,
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
export const ARCHETYPE_RADIUS = 250;

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

export function getArchetypeShape(
  localX: number,
  localZ: number,
  def: PortDefinition
): number {
  const R = ARCHETYPE_RADIUS;
  const dist = Math.sqrt(localX * localX + localZ * localZ);

  // Normalize to -1..1 range within radius
  const nx = localX / R;
  const nz = localZ / R;

  // Rotate so open direction faces -Z in local space (toward "south" in rotated frame)
  const [rx, rz] = rotateToOpen(nx, nz, def.openDirection);

  switch (def.geography) {
    case 'archipelago':
      // No shape override — pure noise
      return 0;

    case 'inlet': {
      // Land everywhere, with a channel cutting in from the open direction
      const cw = (def.channelWidth ?? 1.0) * 0.25; // channel half-width in normalized space
      const channelDist = Math.abs(rx) / cw;
      // Channel exists where rz < 0 (toward open direction) and narrows toward center
      const channelDepth = smoothstep(-0.1, 0.0, rz); // 1 at center, 0 toward open
      const inChannel = channelDist < 1.0 && rz < 0.3;
      const channelStrength = inChannel ? (1 - channelDist) * (1 - channelDepth * 0.7) : 0;
      // Base: land, carved by channel
      const landBase = smoothstep(1.0, 0.7, dist / R); // fade to nothing at edge
      return landBase - channelStrength * 1.5;
    }

    case 'bay': {
      // Concave cove — large landmass with a curved indentation for the harbor
      const curvature = def.coastCurvature ?? 0.6;
      const ndist = dist / R;
      // Base: solid land that fills the inland half
      const landBase = smoothstep(1.0, 0.65, ndist);
      // The coastline curves inward: land exists where rz > threshold
      // Threshold is lower at center (rx≈0) creating the cove indent
      const coveDepth = curvature * 0.4; // how far the cove cuts in
      const coveWidth = 0.5; // lateral extent of the cove
      const coveIndent = coveDepth * (1 - (rx / coveWidth) ** 2); // parabolic indent
      const coastThreshold = Math.abs(rx) < coveWidth ? -coveIndent : -0.05;
      // Land where we're inland of the coast threshold
      const isInland = rz > coastThreshold;
      const coastGrad = isInland ? smoothstep(coastThreshold, coastThreshold + 0.25, rz) : 0;
      return (landBase * coastGrad * 0.9) - (isInland ? 0 : 0.3);
    }

    case 'strait': {
      // Two parallel landmasses with water between
      const cw = (def.channelWidth ?? 1.0) * 0.3;
      const channelDist = Math.abs(rx); // distance from center line
      // Water in the middle, land on both sides
      const isLand = channelDist > cw;
      const landStrength = isLand ? smoothstep(cw, cw + 0.2, channelDist) : 0;
      const edgeFade = smoothstep(1.0, 0.7, dist / R);
      return (landStrength * 0.9 - (isLand ? 0 : 0.5)) * edgeFade;
    }

    case 'island': {
      // Isolated landmass, ocean all around
      const size = (def.landmassSize ?? 1.0) * 0.5;
      const ndist = dist / R;
      // Elliptical island
      const islandDist = Math.sqrt((rx / (size * 1.3)) ** 2 + (rz / size) ** 2);
      const landStrength = smoothstep(1.0, 0.6, islandDist);
      // Ensure ocean at edges
      const edgeFade = 1 - smoothstep(0.6, 0.9, ndist);
      return landStrength * edgeFade - 0.2;
    }

    case 'peninsula': {
      // Land on one side (rz > 0), narrowing to a point toward open direction
      const ndist = dist / R;
      // Peninsula narrows as rz decreases (toward open water)
      const width = 0.4 * smoothstep(-0.5, 0.5, rz); // gets narrow toward water
      const inPeninsula = Math.abs(rx) < width && rz > -0.6;
      // Mainland behind the peninsula
      const mainland = rz > 0.3 ? smoothstep(0.3, 0.6, rz) : 0;
      const peninsulaStrength = inPeninsula ? smoothstep(width, width * 0.5, Math.abs(rx)) * 0.7 : 0;
      const edgeFade = smoothstep(1.0, 0.7, ndist);
      return (Math.max(peninsulaStrength, mainland * 0.8) - 0.15) * edgeFade;
    }

    case 'estuary': {
      // River mouth fanning out toward open direction
      const ndist = dist / R;
      // The "river" widens toward the open direction (rz < 0)
      const riverWidth = 0.15 + Math.max(0, -rz) * 0.4; // narrow inland, wide at mouth
      const inRiver = Math.abs(rx) < riverWidth && rz < 0.4;
      const riverStrength = inRiver ? smoothstep(riverWidth, riverWidth * 0.3, Math.abs(rx)) : 0;
      // Land on both sides
      const landBase = smoothstep(1.0, 0.65, ndist);
      // Delta islands near the mouth
      const deltaX = rx * 8, deltaZ = (rz + 0.3) * 6;
      const deltaNoise = Math.sin(deltaX * 2.1) * Math.cos(deltaZ * 1.7) * 0.3;
      const nearMouth = rz < -0.2 ? deltaNoise : 0;
      return (landBase - riverStrength * 1.3 + nearMouth) * smoothstep(1.0, 0.8, ndist);
    }

    case 'crater_harbor': {
      // Volcanic headland with an enclosed harbor basin
      // Large landmass with a deep circular bite taken out of it on the open side
      const ndist = dist / R;
      // Solid land base
      const landBase = smoothstep(1.0, 0.6, ndist);
      // Harbor basin: a circular depression centered slightly toward open direction
      const basinCenterZ = -0.2; // offset toward the sea
      const basinDist = Math.sqrt(rx * rx + (rz - basinCenterZ) ** 2);
      const basinRadius = 0.25;
      const inBasin = basinDist < basinRadius;
      const basinStrength = inBasin ? smoothstep(basinRadius, basinRadius * 0.4, basinDist) : 0;
      // Narrow entrance channel from basin to open water
      const channelWidth = 0.1;
      const inChannel = Math.abs(rx) < channelWidth && rz < basinCenterZ;
      const channelStrength = inChannel ? smoothstep(channelWidth, 0, Math.abs(rx)) : 0;
      // Higher terrain around the basin (volcanic rim) — adds elevation, not a ring
      const rimBoost = (inBasin || inChannel) ? 0 : smoothstep(basinRadius + 0.2, basinRadius, basinDist) * 0.3;
      // Combine: land everywhere, basin and channel carved out
      const carved = Math.max(basinStrength, channelStrength) * 1.4;
      return (landBase * 0.85 + rimBoost - carved) * smoothstep(1.0, 0.8, ndist);
    }

    case 'continental_coast': {
      // Land on one side, ocean on the other
      // rz > 0 = inland (land), rz < 0 = ocean
      const coastLine = rx * 0.15; // slight curvature
      const isLand = rz > coastLine;
      const landStrength = isLand ? smoothstep(coastLine, coastLine + 0.3, rz) : 0;
      const edgeFade = smoothstep(1.0, 0.7, dist / R);
      return (landStrength * 0.8 - 0.1) * edgeFade;
    }
  }
}

// ── World Size Presets ─────────────────────────────────────────────────────────
export type WorldSize = 'Small' | 'Medium' | 'Large';

export const WORLD_SIZE_VALUES: Record<WorldSize, number> = {
  'Small': 150,
  'Medium': 300,
  'Large': 600,
};
