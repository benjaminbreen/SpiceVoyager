// Per-type geometry profiles for the player ship. Ship.tsx reads the profile
// that matches the current ship.type and swaps hull, masts, sails, and
// equipment anchor points accordingly. Equipment (swivel gun, torch, flag,
// fishing net) stays shared across types — only anchor points vary.

import type { ShipInfo } from '../store/gameStore';

export type BowStyle = 'angled' | 'tapered' | 'bluff';
export type SternStyle = 'cabin' | 'castle' | 'transom' | 'tuck';
export type SailPlan = 'square' | 'lateen' | 'junk_batten';

export interface MastConfig {
  position: [number, number, number]; // mast center (base at y = hullTop, top at y + height/2)
  height: number;
  radius: number;
  rake?: number; // x-axis rotation in radians; forward/aft rake
}

export interface SailConfig {
  // Mesh position (world-local to ship root).
  position: [number, number, number];
  width: number;
  height: number;
  plan: SailPlan;
  /** Camber depth multiplier. 1 = full, <1 = tighter. */
  fullnessScale: number;
  /** Phase offset for flutter noise — keeps sails from synchronizing. */
  flutterPhase: number;
  /** Y-distance the sail lowers when furled (visualSailSet → 0). */
  lowerAmount: number;
  /** Extra Z-rotation applied to the mesh (lateen yard tilt, etc.). */
  roll?: number;
  /** Number of rigid panels (junk batten). 1 = smooth cloth. */
  numPanels?: number;
  /** Sail color (cloth). Falls back to profile.sailColor. */
  color?: string;
  /** Geometry subdivision. More = smoother deformation, more CPU. */
  segmentsX?: number;
  segmentsY?: number;
  /** If true, this sail is driven by the "main" trim input; otherwise by "fore". */
  trimsWithMain?: boolean;
  /** Optional painted device on the sail canvas. Only renders when the
   *  ship's flag matches the decal's faction (e.g. Order of Christ only
   *  paints on Portuguese ships). */
  decal?: 'cross_of_christ';
}

export interface EquipmentAnchors {
  swivel: [number, number, number];
  torch: [number, number, number];
  fishingNet: [number, number, number];
  flagHoist: [number, number, number];
  /** Stowed anchor position at the bow. Swings to +X starboard and drops on weigh. */
  anchor: [number, number, number];
}

export interface ShipProfile {
  hull: {
    width: number;
    height: number;
    length: number;
    bowStyle: BowStyle;
    sternStyle: SternStyle;
    /** Diagonal spar projecting forward-up from the bow. */
    hasBowsprit: boolean;
    /** Raked upright spar at the forward tip of the hull (Caravel-style). */
    hasStempost: boolean;
    /** Stempost finial style. 'plain' = simple sphere; 'ornate' = stacked
     *  finial + cross (Portuguese caravel / Order of Christ style);
     *  'raked_beak' = long steeply-raked spar projecting forward-up with a
     *  plain tapered tip (dhow signature silhouette). */
    stempostStyle?: 'plain' | 'ornate' | 'raked_beak';
    /** Secondary shorter stempost forward of the main one, giving the bow
     *  a doubled/curved silhouette (caravela latina detail). */
    doubleStem?: boolean;
    /** Thin railing around the aft cabin roof (caravel aftercastle cue). */
    cabinRail?: boolean;
    /** Round fighting top (platform + low railing) on the main masthead.
     *  Iconic carrack feature; also fits galleons. */
    hasRoundTop?: boolean;
    /** Row of painted shields (pavesades) along the gunwale — medieval/Tudor
     *  carrack livery detail. Renders in the ship's faction colors. */
    pavesadeRow?: boolean;
    /** Thin railing around the upper sterncastle tier. */
    sterncastleRail?: boolean;
    /** Small glowing lanterns on the aft corners of the sterncastle. */
    sterncastleLanterns?: boolean;
    /** Narrow high transom above the tuck stern — a tall thin vertical
     *  panel with small windows. Completes the fluyt's pear-drop profile. */
    hasNarrowTransom?: boolean;
    /** Raised cargo hatch amidships on the deck (fluyt bulk-carrier cue). */
    hasCargoHatch?: boolean;
    /** Shorter transom panel (dhow variant). Scales the 'transom' stern's
     *  vertical panel down so it doesn't read as a carrack aftercastle. */
    lowTransom?: boolean;
    /** Carved windows on the transom panel — Indo-Portuguese baghla detail.
     *  Paints two lit stern windows + vertical trim bars onto the existing
     *  transom mesh (distinct from the fluyt's tall narrowTransom panel). */
    hasCarvedTransom?: boolean;
    /** Horizontal spar / boom projecting aft from the transom, used
     *  historically to handle tenders and cargo over the stern. */
    hasSternDavit?: boolean;
    /** Painted eye (oculus) on each side of the bluff bow — universal
     *  Chinese junk detail. Generates a canvas texture (white sclera +
     *  black iris + red rim) mirrored onto port/starboard planes. */
    hasOculus?: boolean;
    /** Tall narrow plank rising from the transom above the stern cabin —
     *  the distinctive high-stern silhouette of a Chinese junk. */
    hasHighSternpost?: boolean;
    /** Second low deckhouse amidships (forward of the stern cabin). Junks
     *  often carried multiple deckhouses; adds layered rooflines. */
    hasMidshipDeckhouse?: boolean;
    /** Oversized hoistable rudder hanging off the transom. Junks had
     *  massive fenestrated rudders that defined their stern silhouette. */
    hasLargeRudder?: boolean;
    /** Raised forecastle (European carrack/galleon). */
    hasForecastle: boolean;
    hullColor: string;
    deckColor: string;
    trimColor: string;
    cabinColor: string;
    sailColor: string;
  };
  masts: MastConfig[];
  sails: SailConfig[];
  equipment: EquipmentAnchors;
  /** Small triangular streamers on fore/mizzen mast tops. */
  hasPennants: boolean;
}

// ── Color palettes ──────────────────────────────────────────────────────────
const EUROPEAN_COLORS = {
  hullColor: '#5C4033',
  deckColor: '#8B4513',
  trimColor: '#6B4423',
  cabinColor: '#6B4423',
  sailColor: '#f5f1dc',
};

const WEATHERED_COLORS = {
  hullColor: '#4a352a',
  deckColor: '#7a5a3a',
  trimColor: '#5a3e28',
  cabinColor: '#604030',
  sailColor: '#ede2c4',
};

const DHOW_COLORS = {
  hullColor: '#6a4a28',
  deckColor: '#8a6a3a',
  trimColor: '#8a5f3a',
  cabinColor: '#6a4a28',
  sailColor: '#e8dcb8',
};

const JUNK_COLORS = {
  hullColor: '#3f2a1a',
  deckColor: '#6a4228',
  trimColor: '#8a2a1a',
  cabinColor: '#5a2a1a',
  sailColor: '#c09060',
};

// ── Profile factory helpers ─────────────────────────────────────────────────
// Conventions: ship root at origin, +Z = forward (bow), -Z = stern.
// Hull baseline at y=0; deck surface roughly y=hullHeight-ish.

function carrackProfile(): ShipProfile {
  // Baseline ship — visually matches the pre-refactor default, now with
  // raised forecastle (historically iconic for carracks).
  return {
    hull: {
      width: 2.2,
      height: 1.2,
      length: 5.0,
      bowStyle: 'angled',
      sternStyle: 'castle',
      hasBowsprit: true,
      hasStempost: false,
      hasForecastle: true,
      hasRoundTop: true,
      pavesadeRow: true,
      sterncastleRail: true,
      sterncastleLanterns: true,
      ...EUROPEAN_COLORS,
    },
    masts: [
      { position: [0, 3.5, 0.5], height: 6.0, radius: 0.15 },     // main
      { position: [0, 2.5, 2.5], height: 4.0, radius: 0.1 },      // fore
    ],
    sails: [
      {
        position: [0, 4, 0.6],
        width: 3.5,
        height: 4,
        plan: 'square',
        fullnessScale: 1,
        flutterPhase: 0.3,
        lowerAmount: 1.55,
        segmentsX: 12,
        segmentsY: 14,
        trimsWithMain: true,
      },
      {
        position: [0, 3, 2.6],
        width: 2.5,
        height: 3,
        plan: 'square',
        fullnessScale: 0.82,
        flutterPhase: 1.1,
        lowerAmount: 1.05,
        segmentsX: 10,
        segmentsY: 12,
        trimsWithMain: false,
      },
    ],
    equipment: {
      swivel: [0, 1.5, 3.0],
      torch: [0.6, 2.8, -1.5],
      fishingNet: [1.1, 1.2, 0],
      flagHoist: [0, 6.6, 0.5],
      anchor: [1.2, 1.0, 2.5],
    },
    hasPennants: true,
  };
}

function galleonProfile(): ShipProfile {
  return {
    hull: {
      width: 2.35,
      height: 1.35,
      length: 6.0,
      bowStyle: 'tapered',
      sternStyle: 'castle',
      hasBowsprit: true,
      hasStempost: false,
      hasForecastle: true,
      ...EUROPEAN_COLORS,
    },
    masts: [
      { position: [0, 3.8, -0.4], height: 6.5, radius: 0.16 },   // main
      { position: [0, 3.3, 2.6], height: 5.2, radius: 0.13 },    // fore
      { position: [0, 2.9, -2.3], height: 4.2, radius: 0.11 },   // mizzen (lateen)
    ],
    sails: [
      {
        position: [0, 4.3, -0.3],
        width: 3.8,
        height: 4.5,
        plan: 'square',
        fullnessScale: 1.1,
        flutterPhase: 0.3,
        lowerAmount: 1.7,
        segmentsX: 12,
        segmentsY: 14,
        trimsWithMain: true,
      },
      {
        position: [0, 3.7, 2.7],
        width: 3.0,
        height: 3.6,
        plan: 'square',
        fullnessScale: 0.9,
        flutterPhase: 1.1,
        lowerAmount: 1.3,
        segmentsX: 10,
        segmentsY: 12,
        trimsWithMain: false,
      },
      {
        // Group origin at yard/mast intersection — upper third of mizzen mast.
        position: [0, 3.7, -2.3],
        // height = yard length, width = leech extent (clew sweep).
        width: 2.4,
        height: 2.0,
        plan: 'lateen',
        fullnessScale: 0.72,
        flutterPhase: 2.1,
        lowerAmount: 0.9,
        roll: -0.46,
        trimsWithMain: true,
      },
    ],
    equipment: {
      swivel: [0, 1.7, 3.4],
      torch: [0.7, 3.0, -1.8],
      fishingNet: [1.2, 1.3, 0],
      flagHoist: [0, 7.0, -0.3],
      anchor: [1.3, 1.15, 2.9],
    },
    hasPennants: true,
  };
}

function fluytProfile(): ShipProfile {
  // Dutch fluyt: pear-shaped tuck stern, tall narrow rig, no castle —
  // purpose-built bulk carrier. The rounded tuck stern is the signature
  // silhouette cue that distinguishes it from other European types.
  return {
    hull: {
      width: 2.25,
      height: 1.3,
      length: 5.7,
      bowStyle: 'tapered',
      sternStyle: 'tuck',
      hasBowsprit: true,
      hasStempost: false,
      hasNarrowTransom: true,
      hasCargoHatch: true,
      hasSternDavit: true,
      hasForecastle: false,
      hullColor: '#4a3220',
      deckColor: '#7a5233',
      trimColor: '#5a3e28',
      cabinColor: '#5a3e28',
      sailColor: '#ebe0c2',
    },
    masts: [
      { position: [0, 3.6, -0.2], height: 6.8, radius: 0.13 },   // main (tall/narrow)
      { position: [0, 3.1, 2.4], height: 5.6, radius: 0.11 },    // fore
      // Mizzen stepped aft of the tuck cabin so lateen/mast don't clip it.
      { position: [0, 2.7, -2.85], height: 3.8, radius: 0.1 },   // mizzen
    ],
    sails: [
      {
        position: [0, 4.2, -0.1],
        width: 3.2,
        height: 4.2,
        plan: 'square',
        fullnessScale: 1,
        flutterPhase: 0.3,
        lowerAmount: 1.6,
        segmentsX: 12,
        segmentsY: 14,
        trimsWithMain: true,
      },
      {
        position: [0, 3.6, 2.5],
        width: 2.7,
        height: 3.4,
        plan: 'square',
        fullnessScale: 0.88,
        flutterPhase: 1.1,
        lowerAmount: 1.2,
        segmentsX: 10,
        segmentsY: 12,
        trimsWithMain: false,
      },
      {
        // Yard crosses mizzen mast at upper third; mast is aft of tuck cabin.
        position: [0, 3.3, -2.85],
        width: 2.0,
        height: 1.8,
        plan: 'lateen',
        fullnessScale: 0.65,
        flutterPhase: 2.1,
        lowerAmount: 0.8,
        roll: -0.46,
        trimsWithMain: true,
      },
    ],
    equipment: {
      swivel: [0, 1.6, 3.2],
      torch: [0.65, 2.6, -1.7],
      fishingNet: [1.15, 1.3, 0],
      flagHoist: [0, 7.1, -0.1],
      anchor: [1.25, 1.1, 2.75],
    },
    hasPennants: true,
  };
}

function pinnaceProfile(): ShipProfile {
  // Small fast European trader / scout. Two masts, no castle, low profile.
  return {
    hull: {
      width: 1.8,
      height: 1.0,
      length: 4.2,
      bowStyle: 'angled',
      sternStyle: 'cabin',
      hasBowsprit: false,
      hasStempost: false,
      hasForecastle: false,
      ...WEATHERED_COLORS,
    },
    masts: [
      { position: [0, 2.9, 0.2], height: 5.0, radius: 0.1 },     // main
      { position: [0, 2.3, 2.1], height: 3.6, radius: 0.08 },    // fore
    ],
    sails: [
      {
        position: [0, 3.3, 0.3],
        width: 2.7,
        height: 3.2,
        plan: 'square',
        fullnessScale: 0.95,
        flutterPhase: 0.5,
        lowerAmount: 1.25,
        segmentsX: 10,
        segmentsY: 12,
        trimsWithMain: true,
      },
      {
        position: [0, 2.75, 2.2],
        width: 2.0,
        height: 2.4,
        plan: 'square',
        fullnessScale: 0.75,
        flutterPhase: 1.4,
        lowerAmount: 0.85,
        segmentsX: 8,
        segmentsY: 10,
        trimsWithMain: false,
      },
    ],
    equipment: {
      swivel: [0, 1.3, 2.5],
      torch: [0.5, 2.3, -1.3],
      fishingNet: [0.95, 1.1, 0],
      flagHoist: [0, 5.5, 0.2],
      anchor: [1.0, 0.9, 2.1],
    },
    hasPennants: true,
  };
}

function caravelProfile(): ShipProfile {
  // Caravela latina / redonda hybrid. Historically long, narrow, low-slung —
  // emphasize slender proportions vs. carrack. Mizzen mast steps aft of the
  // (now shorter) cabin so the lateen reads clearly from astern.
  return {
    hull: {
      width: 1.65,
      height: 0.95,
      length: 5.2,
      bowStyle: 'tapered',
      sternStyle: 'cabin',
      hasBowsprit: false,
      hasStempost: true,
      stempostStyle: 'ornate',
      doubleStem: true,
      cabinRail: true,
      hasForecastle: false,
      ...WEATHERED_COLORS,
    },
    masts: [
      { position: [0, 3.1, 0.1], height: 5.6, radius: 0.11 },    // main
      { position: [0, 2.55, 2.35], height: 4.1, radius: 0.09 },  // fore
      { position: [0, 2.3, -2.05], height: 3.3, radius: 0.08 },  // mizzen (lateen)
    ],
    sails: [
      {
        position: [0, 3.5, 0.2],
        width: 2.6,
        height: 3.3,
        plan: 'square',
        fullnessScale: 0.95,
        flutterPhase: 0.5,
        lowerAmount: 1.3,
        segmentsX: 10,
        segmentsY: 12,
        trimsWithMain: true,
        decal: 'cross_of_christ',
      },
      {
        position: [0, 2.95, 2.45],
        width: 2.0,
        height: 2.5,
        plan: 'square',
        fullnessScale: 0.78,
        flutterPhase: 1.4,
        lowerAmount: 0.9,
        segmentsX: 8,
        segmentsY: 10,
        trimsWithMain: false,
      },
      {
        // Yard crosses mizzen mast at upper third; x=0 so yard stays on mast.
        position: [0, 2.95, -2.05],
        width: 1.9,
        height: 1.6,
        plan: 'lateen',
        fullnessScale: 0.62,
        flutterPhase: 2.4,
        lowerAmount: 0.7,
        roll: -0.46,
        trimsWithMain: true,
      },
    ],
    equipment: {
      swivel: [0, 1.2, 3.1],
      torch: [0.5, 2.25, -1.55],
      fishingNet: [0.87, 1.05, 0],
      flagHoist: [0, 6.0, 0.1],
      anchor: [0.88, 0.75, 2.3],
    },
    hasPennants: true,
  };
}

function dhowProfile(): ShipProfile {
  // Arab/Indian Ocean dhow (baghla/sambuq): small, narrow, low-freeboard,
  // dominated by a long raked stempost and an oversized lateen yard on a
  // forward-raked main mast. Second mast stepped well aft so the main
  // reads as the signature sail.
  return {
    hull: {
      width: 1.45,
      height: 0.8,
      length: 4.4,
      bowStyle: 'tapered',
      sternStyle: 'transom',
      hasBowsprit: false,
      hasStempost: true,
      stempostStyle: 'raked_beak',
      lowTransom: true,
      hasForecastle: false,
      ...DHOW_COLORS,
    },
    masts: [
      // Main — stepped forward of center, heavily forward-raked.
      { position: [0, 2.5, 0.55], height: 4.4, radius: 0.1, rake: 0.22 },
      // Mizzen — stepped well astern, smaller, slight forward rake.
      { position: [0, 1.95, -1.85], height: 2.9, radius: 0.075, rake: 0.12 },
    ],
    sails: [
      {
        // Main lateen — tall narrow triangle on a very long yard. Shifted
        // slightly forward to follow the raked mast's upper third.
        position: [0, 3.15, 0.8],
        width: 2.0,
        height: 3.8,
        plan: 'lateen',
        fullnessScale: 1.05,
        flutterPhase: 0.3,
        lowerAmount: 1.15,
        roll: -0.52,
        trimsWithMain: true,
      },
      {
        // Mizzen lateen — smaller triangle, mirrored so clew swings to port.
        position: [0, 2.35, -1.7],
        width: 1.45,
        height: 2.5,
        plan: 'lateen',
        fullnessScale: 0.78,
        flutterPhase: 1.3,
        lowerAmount: 0.75,
        roll: 0.48,
        trimsWithMain: false,
      },
    ],
    equipment: {
      swivel: [0, 1.1, 2.55],
      torch: [0.45, 1.85, -1.55],
      fishingNet: [0.82, 0.95, 0],
      flagHoist: [0, 4.8, -1.85],
      anchor: [0.82, 0.75, 2.1],
    },
    hasPennants: true,
  };
}

function baghlaProfile(): ShipProfile {
  // Large ocean-going dhow of the Arabian Sea / Gulf — "mule" in Arabic,
  // after its heavy build. Shares the dhow's raked-beak stem but adds a
  // square carved transom (Indo-Portuguese influence), bigger hull, and
  // larger lateen yards. Two masts both lateen.
  return {
    hull: {
      width: 1.95,
      height: 1.05,
      length: 5.5,
      bowStyle: 'tapered',
      sternStyle: 'transom',
      hasBowsprit: false,
      hasStempost: true,
      stempostStyle: 'raked_beak',
      hasCarvedTransom: true,
      hasForecastle: false,
      hullColor: '#6a4628',
      deckColor: '#8b6839',
      trimColor: '#a07033',
      cabinColor: '#6a4628',
      sailColor: '#ede0b8',
    },
    masts: [
      // Main — stepped fore of center, heavily forward-raked.
      { position: [0, 3.1, 0.7], height: 5.6, radius: 0.12, rake: 0.2 },
      // Mizzen — stepped well astern, smaller, slight forward rake.
      { position: [0, 2.5, -2.2], height: 4.0, radius: 0.1, rake: 0.1 },
    ],
    sails: [
      {
        // Main lateen — long yard, tall narrow triangle.
        position: [0, 3.85, 1.0],
        width: 2.4,
        height: 4.8,
        plan: 'lateen',
        fullnessScale: 1.05,
        flutterPhase: 0.3,
        lowerAmount: 1.35,
        roll: -0.52,
        trimsWithMain: true,
      },
      {
        // Mizzen lateen — mirrored.
        position: [0, 3.0, -2.05],
        width: 1.8,
        height: 3.4,
        plan: 'lateen',
        fullnessScale: 0.82,
        flutterPhase: 1.3,
        lowerAmount: 0.9,
        roll: 0.48,
        trimsWithMain: false,
      },
    ],
    equipment: {
      swivel: [0, 1.35, 3.05],
      torch: [0.55, 2.2, -1.9],
      fishingNet: [1.05, 1.15, 0],
      flagHoist: [0, 5.9, -2.2],
      anchor: [1.05, 0.95, 2.55],
    },
    hasPennants: true,
  };
}

function jongProfile(): ShipProfile {
  // Javanese ocean trader — a larger, mixed-rig relative of the Chinese
  // junk. Three masts (two battened, one lateen), no painted oculus, and
  // a warmer palette distinguish it from the Chinese junk's silhouette.
  // Historically a Javanese type; used here as the grand-tier hull for a
  // Chinese captain who traded out of the East Indies.
  return {
    hull: {
      width: 2.75,
      height: 1.35,
      length: 6.0,
      bowStyle: 'bluff',
      sternStyle: 'transom',
      hasBowsprit: false,
      hasStempost: false,
      hasOculus: false, // distinguish from Chinese junk
      hasHighSternpost: false,
      hasMidshipDeckhouse: true,
      hasLargeRudder: true,
      hasForecastle: false,
      hullColor: '#4a3322',
      deckColor: '#7a5432',
      trimColor: '#7a4a22',
      cabinColor: '#5a3a22',
      sailColor: '#b08455',
    },
    masts: [
      // Main (batten) — amidships, tallest.
      { position: [0, 3.5, -0.4], height: 6.2, radius: 0.14 },
      // Fore (batten) — forward of center.
      { position: [0, 3.0, 2.05], height: 5.0, radius: 0.11 },
      // Mizzen (lateen) — small, aft, slight forward rake.
      { position: [0, 2.6, -2.55], height: 3.6, radius: 0.09, rake: 0.1 },
    ],
    sails: [
      {
        position: [0, 4.1, -0.4],
        width: 3.7,
        height: 4.3,
        plan: 'junk_batten',
        fullnessScale: 0.55,
        flutterPhase: 0.3,
        lowerAmount: 1.45,
        segmentsX: 10,
        segmentsY: 12,
        numPanels: 5,
        trimsWithMain: true,
      },
      {
        position: [0, 3.45, 2.1],
        width: 2.9,
        height: 3.5,
        plan: 'junk_batten',
        fullnessScale: 0.5,
        flutterPhase: 1.1,
        lowerAmount: 1.15,
        segmentsX: 8,
        segmentsY: 10,
        numPanels: 4,
        trimsWithMain: false,
      },
      {
        // Mizzen lateen — mirrored clew so it sweeps opposite the main.
        position: [0, 2.95, -2.4],
        width: 1.8,
        height: 2.8,
        plan: 'lateen',
        fullnessScale: 0.72,
        flutterPhase: 2.0,
        lowerAmount: 0.85,
        roll: 0.48,
        trimsWithMain: false,
      },
    ],
    equipment: {
      swivel: [0, 1.6, 3.3],
      torch: [0.75, 2.55, -2.35],
      fishingNet: [1.3, 1.3, 0],
      flagHoist: [0, 6.7, -0.4],
      anchor: [1.4, 1.1, 2.7],
    },
    hasPennants: true,
  };
}

function pattamarProfile(): ShipProfile {
  // Konkani / Malabar coastal lateener. Long, narrow, low-freeboard hull
  // with two heavily forward-raked masts carrying tall lateens. Smaller
  // and lighter than the dhow; sits between Dhow and Caravel in size.
  // Distinguishing cue is the doubled raked stempost (sharper bow rake
  // than the Arabian dhow) and the lighter palette of Konkani teak.
  return {
    hull: {
      width: 1.4,
      height: 0.78,
      length: 4.6,
      bowStyle: 'tapered',
      sternStyle: 'transom',
      hasBowsprit: false,
      hasStempost: true,
      stempostStyle: 'raked_beak',
      doubleStem: true,
      lowTransom: true,
      hasForecastle: false,
      hullColor: '#7a5638',
      deckColor: '#9a7548',
      trimColor: '#6a3f22',
      cabinColor: '#7a5638',
      sailColor: '#ece2c0',
    },
    masts: [
      // Main — stepped near amidships, heavily forward-raked.
      { position: [0, 2.55, 0.45], height: 4.5, radius: 0.095, rake: 0.24 },
      // Mizzen — small, aft.
      { position: [0, 2.0, -1.7], height: 3.0, radius: 0.075, rake: 0.14 },
    ],
    sails: [
      {
        position: [0, 3.25, 0.7],
        width: 1.95,
        height: 3.9,
        plan: 'lateen',
        fullnessScale: 1.0,
        flutterPhase: 0.4,
        lowerAmount: 1.15,
        roll: -0.52,
        trimsWithMain: true,
      },
      {
        position: [0, 2.4, -1.55],
        width: 1.4,
        height: 2.5,
        plan: 'lateen',
        fullnessScale: 0.78,
        flutterPhase: 1.4,
        lowerAmount: 0.75,
        roll: 0.48,
        trimsWithMain: false,
      },
    ],
    equipment: {
      swivel: [0, 1.05, 2.55],
      torch: [0.45, 1.85, -1.5],
      fishingNet: [0.8, 0.92, 0],
      flagHoist: [0, 4.85, -1.7],
      anchor: [0.8, 0.72, 2.1],
    },
    hasPennants: true,
  };
}

function ghurabProfile(): ShipProfile {
  // Surat-built armed merchantman ("ghurab" = raven). Hybrid hull combining
  // a deep dhow-style raked stem with a square European-influenced transom
  // and a heavier carrack-grade build. Two masts, both square-rigged in the
  // Indo-Portuguese pattern (some carried lateen mizzens; using square here
  // distinguishes the silhouette from the Baghla's double-lateen). Carved
  // stern windows are the Surat trademark.
  return {
    hull: {
      width: 2.05,
      height: 1.12,
      length: 5.6,
      bowStyle: 'tapered',
      sternStyle: 'transom',
      hasBowsprit: true,
      hasStempost: true,
      stempostStyle: 'raked_beak',
      hasCarvedTransom: true,
      hasForecastle: false,
      hullColor: '#5a3a22',
      deckColor: '#8b6839',
      trimColor: '#a05030',
      cabinColor: '#5a3a22',
      sailColor: '#ebe0bc',
    },
    masts: [
      // Main — central, slight forward rake.
      { position: [0, 3.3, 0.2], height: 6.0, radius: 0.13, rake: 0.08 },
      // Fore — short, more upright.
      { position: [0, 2.85, 2.45], height: 4.6, radius: 0.1 },
    ],
    sails: [
      {
        position: [0, 4.0, 0.3],
        width: 3.1,
        height: 4.0,
        plan: 'square',
        fullnessScale: 1.0,
        flutterPhase: 0.3,
        lowerAmount: 1.5,
        segmentsX: 12,
        segmentsY: 14,
        trimsWithMain: true,
      },
      {
        position: [0, 3.25, 2.55],
        width: 2.4,
        height: 3.0,
        plan: 'square',
        fullnessScale: 0.85,
        flutterPhase: 1.2,
        lowerAmount: 1.1,
        segmentsX: 10,
        segmentsY: 12,
        trimsWithMain: false,
      },
    ],
    equipment: {
      swivel: [0, 1.45, 3.15],
      torch: [0.6, 2.35, -1.85],
      fishingNet: [1.1, 1.2, 0],
      flagHoist: [0, 6.35, 0.2],
      anchor: [1.15, 1.0, 2.65],
    },
    hasPennants: true,
  };
}

function junkProfile(): ShipProfile {
  // Chinese junk: boxy hull, high flat transom, batten-rigged square sails.
  return {
    hull: {
      width: 2.5,
      height: 1.2,
      length: 5.2,
      bowStyle: 'bluff',
      sternStyle: 'transom',
      hasBowsprit: false,
      hasStempost: false,
      hasOculus: true,
      hasHighSternpost: true,
      hasMidshipDeckhouse: true,
      hasLargeRudder: true,
      hasForecastle: false,
      ...JUNK_COLORS,
    },
    masts: [
      { position: [0, 3.2, -0.8], height: 5.4, radius: 0.13 },    // main
      { position: [0, 2.8, 1.5], height: 4.4, radius: 0.1 },      // fore
    ],
    sails: [
      {
        position: [0, 3.8, -0.75],
        width: 3.3,
        height: 3.8,
        plan: 'junk_batten',
        fullnessScale: 0.55, // stiff — panels don't billow much
        flutterPhase: 0.3,
        lowerAmount: 1.3,
        segmentsX: 10,
        segmentsY: 12,
        numPanels: 4,
        trimsWithMain: true,
      },
      {
        position: [0, 3.25, 1.55],
        width: 2.6,
        height: 3.0,
        plan: 'junk_batten',
        fullnessScale: 0.5,
        flutterPhase: 1.1,
        lowerAmount: 1.0,
        segmentsX: 8,
        segmentsY: 10,
        numPanels: 4,
        trimsWithMain: false,
      },
    ],
    equipment: {
      swivel: [0, 1.5, 2.9],
      torch: [0.7, 2.4, -2.1],
      fishingNet: [1.25, 1.2, 0],
      flagHoist: [0, 5.95, -0.8],
      anchor: [1.35, 1.0, 2.4],
    },
    hasPennants: true,
  };
}

export const SHIP_PROFILES: Record<ShipInfo['type'], ShipProfile> = {
  Carrack: carrackProfile(),
  Galleon: galleonProfile(),
  Fluyt: fluytProfile(),
  Pinnace: pinnaceProfile(),
  Caravel: caravelProfile(),
  Dhow: dhowProfile(),
  Baghla: baghlaProfile(),
  Pattamar: pattamarProfile(),
  Ghurab: ghurabProfile(),
  Junk: junkProfile(),
  Jong: jongProfile(),
};

export function getShipProfile(type: ShipInfo['type']): ShipProfile {
  return SHIP_PROFILES[type] ?? SHIP_PROFILES.Carrack;
}
