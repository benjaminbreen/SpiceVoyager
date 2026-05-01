// Ship type definitions shared between exterior + cutaway renderers.
// The game uses capitalised ship names (Carrack, Galleon, Dhow, Junk, Pinnace).
// The renderer uses lowercase keys; a few renderer-only historic variants are also supported.

export type GameShipType = 'Carrack' | 'Galleon' | 'Dhow' | 'Junk' | 'Pinnace' | 'Fluyt' | 'Caravel';
export type RendererShipType =
  | 'carrack'
  | 'galleon'
  | 'dhow'
  | 'junk'
  | 'pinnace'
  | 'fluyt'
  | 'xebec'
  | 'baghla'
  | 'merchant_cog';

export function mapShipType(t: GameShipType | string): RendererShipType {
  switch (t) {
    case 'Carrack':
      return 'carrack';
    case 'Galleon':
      return 'galleon';
    case 'Dhow':
      return 'dhow';
    case 'Junk':
      return 'junk';
    case 'Pinnace':
      return 'pinnace';
    case 'Fluyt':
      return 'fluyt';
    case 'Caravel':
      // No dedicated caravel silhouette yet — pinnace is the closest small
      // single-deck European match. A proper variant can come later.
      return 'pinnace';
    default:
      return 'carrack';
  }
}

export interface DamageConfig {
  bow: number; // 0-1
  mid: number;
  stern: number;
  foreMast: number;
  mainMast: number;
  aftMast: number;
  sails: number; // 0-1 overall sail damage multiplier
}

export interface RenderConfig {
  shipType: RendererShipType;
  damage: DamageConfig;
  wind: number; // 0-1
  width: number;
  height: number;
  /** Masthead pennant color. Defaults to gold when absent. */
  flagColor?: string;
}

/**
 * Build per-section damage from unified gameStore values. Distributes
 * the single hull value across bow/mid/stern with a stylised profile
 * (mid is hit hardest, bow second, stern least) so the renderer shows
 * variation rather than uniform rot.
 */
export function buildDamageFromGameState(params: {
  hull: number;
  maxHull: number;
  sails: number;
  maxSails: number;
}): DamageConfig {
  const hullLoss = 1 - Math.max(0, Math.min(1, params.hull / Math.max(1, params.maxHull)));
  const sailLoss = 1 - Math.max(0, Math.min(1, params.sails / Math.max(1, params.maxSails)));

  // Visibility floor: scrapes, paint wear, and minor dings aren't worth
  // rendering. Only when the hull has lost more than 25% do we start
  // showing breached planks or char marks.
  const VISIBLE_FLOOR = 0.25;
  const visibleHull = Math.max(0, (hullLoss - VISIBLE_FLOOR) / (1 - VISIBLE_FLOOR));
  const visibleSails = Math.max(0, (sailLoss - 0.2) / 0.8);

  const mid = Math.min(1, visibleHull * 1.1);
  const bow = Math.min(1, visibleHull * 0.85);
  const stern = Math.min(1, visibleHull * 0.6);

  const mainMast = Math.min(1, visibleSails * 0.9);
  const foreMast = Math.min(1, visibleSails * 0.5);
  const aftMast = Math.min(1, visibleSails * 0.3);

  return { bow, mid, stern, foreMast, mainMast, aftMast, sails: visibleSails };
}

// ── Cutaway interior schema ────────────────────────────────────────────────

export type CompartmentKind =
  | 'cargoHold'
  | 'lowerHold'
  | 'berths'
  | 'captainCabin'
  | 'galley'
  | 'powder'
  | 'forecastle'
  | 'gunDeck'
  | 'bilge';

export interface Compartment {
  kind: CompartmentKind;
  // All values are fractions of the ship's interior bounding box.
  // x: 0 = stern, 1 = bow. y: 0 = deck (top), 1 = keel (bottom).
  xStart: number;
  xEnd: number;
  yStart: number;
  yEnd: number;
  label?: string;
}

export interface InteriorLayout {
  decks: number[]; // y-fractions where horizontal deck lines run (0 = main deck)
  compartments: Compartment[];
}

/**
 * Default interior layout for a three-decked ocean trader. Specific ship
 * types override this via getInterior() below.
 */
const DEFAULT_LAYOUT: InteriorLayout = {
  decks: [0.42, 0.72],
  compartments: [
    // Upper works.
    { kind: 'captainCabin', xStart: 0.0, xEnd: 0.22, yStart: 0.0, yEnd: 0.42, label: "CAPT'N" },
    { kind: 'gunDeck', xStart: 0.22, xEnd: 0.77, yStart: 0.0, yEnd: 0.42, label: 'GUNS' },
    { kind: 'forecastle', xStart: 0.77, xEnd: 1.0, yStart: 0.0, yEnd: 0.42, label: 'FORE' },
    // Main working deck.
    { kind: 'powder', xStart: 0.0, xEnd: 0.18, yStart: 0.42, yEnd: 0.72, label: 'POWDER' },
    { kind: 'berths', xStart: 0.18, xEnd: 0.45, yStart: 0.42, yEnd: 0.72, label: 'BERTHS' },
    { kind: 'cargoHold', xStart: 0.45, xEnd: 0.78, yStart: 0.42, yEnd: 0.72, label: 'CARGO' },
    { kind: 'galley', xStart: 0.78, xEnd: 0.94, yStart: 0.42, yEnd: 0.72, label: 'GALLEY' },
    // Lower hold and bilge.
    { kind: 'lowerHold', xStart: 0.18, xEnd: 0.78, yStart: 0.72, yEnd: 1.0, label: 'LOWER HOLD' },
    { kind: 'bilge', xStart: 0.78, xEnd: 1.0, yStart: 0.72, yEnd: 1.0, label: 'BILGE' },
  ],
};

// Smaller ships get a single-deck interior.
const SINGLE_DECK_LAYOUT: InteriorLayout = {
  decks: [0.55],
  compartments: [
    { kind: 'captainCabin', xStart: 0.0, xEnd: 0.25, yStart: 0.0, yEnd: 0.55, label: "CAPT'N" },
    { kind: 'berths', xStart: 0.25, xEnd: 0.5, yStart: 0.0, yEnd: 0.55, label: 'BERTHS' },
    { kind: 'galley', xStart: 0.75, xEnd: 0.9, yStart: 0.0, yEnd: 0.55, label: 'GALLEY' },
    { kind: 'forecastle', xStart: 0.9, xEnd: 1.0, yStart: 0.0, yEnd: 0.55, label: 'FORE' },
    { kind: 'cargoHold', xStart: 0.15, xEnd: 0.85, yStart: 0.55, yEnd: 1.0, label: 'HOLD' },
  ],
};

// Junks traditionally have watertight bulkheads dividing the cargo hold into cells.
const JUNK_LAYOUT: InteriorLayout = {
  decks: [0.38, 0.66],
  compartments: [
    { kind: 'captainCabin', xStart: 0.0, xEnd: 0.22, yStart: 0.0, yEnd: 0.38, label: "CAPT'N" },
    { kind: 'berths', xStart: 0.22, xEnd: 0.46, yStart: 0.0, yEnd: 0.38, label: 'BERTHS' },
    { kind: 'gunDeck', xStart: 0.46, xEnd: 0.78, yStart: 0.0, yEnd: 0.38, label: 'GUNS' },
    { kind: 'galley', xStart: 0.78, xEnd: 0.92, yStart: 0.0, yEnd: 0.38, label: 'GALLEY' },
    { kind: 'forecastle', xStart: 0.92, xEnd: 1.0, yStart: 0.0, yEnd: 0.38, label: 'FORE' },
    // Five watertight cargo cells
    { kind: 'cargoHold', xStart: 0.08, xEnd: 0.26, yStart: 0.38, yEnd: 1.0 },
    { kind: 'cargoHold', xStart: 0.26, xEnd: 0.44, yStart: 0.38, yEnd: 1.0 },
    { kind: 'cargoHold', xStart: 0.44, xEnd: 0.62, yStart: 0.38, yEnd: 1.0, label: 'CARGO' },
    { kind: 'cargoHold', xStart: 0.62, xEnd: 0.8, yStart: 0.38, yEnd: 1.0 },
    { kind: 'cargoHold', xStart: 0.8, xEnd: 0.96, yStart: 0.38, yEnd: 1.0 },
  ],
};

export function getInterior(t: RendererShipType): InteriorLayout {
  switch (t) {
    case 'galleon':
    case 'carrack':
    case 'fluyt':
    case 'merchant_cog':
      return DEFAULT_LAYOUT;
    case 'junk':
      return JUNK_LAYOUT;
    case 'dhow':
    case 'baghla':
    case 'xebec':
    case 'pinnace':
      return SINGLE_DECK_LAYOUT;
    default:
      return DEFAULT_LAYOUT;
  }
}
