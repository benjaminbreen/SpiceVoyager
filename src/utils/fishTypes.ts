// Fish, sea creatures, and open-water junk/treasure for the fishing system.
// Fish have climate zones and rarity tiers matching the loot system (dud/normal/rare/legendary).
// Auto-catch triggers when sailing through shoals; manual cast (C key) uses the junk table.

import type { Commodity } from '../store/gameStore';

export type ClimateZone = 'tropical' | 'subtropical' | 'temperate';
export type FishRarity = 'common' | 'uncommon' | 'rare' | 'legendary';

export interface FishType {
  id: string;
  name: string;
  latin: string;
  description: string;
  climate: ClimateZone;
  color: [number, number, number]; // RGB 0-1
  scale: number;
  shoalRange: [number, number]; // [min, max] fish per shoal
  rarity: FishRarity;
  provisions: number;           // base provisions per catch
  cargo?: { type: Commodity; amount: number }; // bonus cargo for valuable catches
  ascii: string[];              // ASCII art lines for the grand toast
}

export const FISH_TYPES: FishType[] = [
  // ── Tropical ───────────────────────────────────────────
  {
    id: 'flying_fish',
    name: 'Flying Fish',
    latin: 'Exocoetidae',
    description: 'Slender, blue-finned fish that leap from the waves and glide on outstretched pectoral fins.',
    climate: 'tropical',
    color: [0.35, 0.65, 0.85],
    scale: 0.7,
    shoalRange: [5, 8],
    rarity: 'common',
    provisions: 1,
    ascii: [
      '    _.---._',
      '  /`  ><>  `\\',
      '  \\_ ><> ><>/',
      '    `-----`',
    ],
  },
  {
    id: 'parrotfish',
    name: 'Parrotfish',
    latin: 'Scaridae',
    description: 'Brilliantly colored reef fish with fused teeth like a parrot\'s beak, grinding coral to sand.',
    climate: 'tropical',
    color: [0.2, 0.75, 0.55],
    scale: 1.0,
    shoalRange: [3, 5],
    rarity: 'uncommon',
    provisions: 2,
    ascii: [
      '       _',
      '   ___/ \\___',
      '  <°)))><  >',
      '   ~~~\\_/~~~',
    ],
  },
  {
    id: 'tiger_shark',
    name: 'Tiger Shark',
    latin: 'Galeocerdo cuvier',
    description: 'A solitary apex predator with dark stripes along its flanks. Feared by sailors.',
    climate: 'tropical',
    color: [0.35, 0.35, 0.32],
    scale: 2.5,
    shoalRange: [1, 1],
    rarity: 'rare',
    provisions: 4,
    ascii: [
      '          __',
      '    _____/  \\',
      '   /  °      \\____',
      '  /_______________\\>',
      '      \\______/',
    ],
  },
  // ── Subtropical ────────────────────────────────────────
  {
    id: 'sardine',
    name: 'Sardine',
    latin: 'Sardina pilchardus',
    description: 'Dense shoals of small silver fish, a staple food for larger predators and sailors alike.',
    climate: 'subtropical',
    color: [0.7, 0.75, 0.8],
    scale: 0.5,
    shoalRange: [7, 10],
    rarity: 'common',
    provisions: 1,
    ascii: [
      '  ><> ><>  ><>',
      ' ><>  ><> ><> ><>',
      '  ><> ><>  ><>',
      '   ><>  ><> ><>',
    ],
  },
  {
    id: 'red_snapper',
    name: 'Red Snapper',
    latin: 'Lutjanus campechanus',
    description: 'A prized table fish with rosy scales and firm white flesh. Common near reefs.',
    climate: 'subtropical',
    color: [0.8, 0.35, 0.3],
    scale: 1.1,
    shoalRange: [2, 4],
    rarity: 'uncommon',
    provisions: 2,
    ascii: [
      '      __',
      '    _/  \\__',
      '   <°)))>  >',
      '    \\_____/',
    ],
  },
  {
    id: 'hammerhead',
    name: 'Hammerhead Shark',
    latin: 'Sphyrna mokarran',
    description: 'Unmistakable for its wide, flattened head. Hunts rays and small fish along the coast.',
    climate: 'subtropical',
    color: [0.45, 0.42, 0.38],
    scale: 2.2,
    shoalRange: [1, 2],
    rarity: 'rare',
    provisions: 3,
    ascii: [
      '       ___',
      '  ____/   \\',
      ' |°  °|    \\____',
      '  ~~~~|_________ \\>',
      '       \\_______/',
    ],
  },
  // ── Temperate ──────────────────────────────────────────
  {
    id: 'herring',
    name: 'Herring',
    latin: 'Clupea harengus',
    description: 'Sleek, silver schooling fish found in cooler waters. The foundation of many a sailor\'s meal.',
    climate: 'temperate',
    color: [0.6, 0.68, 0.72],
    scale: 0.6,
    shoalRange: [6, 9],
    rarity: 'common',
    provisions: 1,
    ascii: [
      ' ><>  ><> ><>',
      '><> ><>  ><>',
      ' ><>  ><> ><>',
    ],
  },
  {
    id: 'tuna',
    name: 'Bluefin Tuna',
    latin: 'Thunnus thynnus',
    description: 'Powerful, fast-swimming fish with dark blue backs. Highly valued in every port.',
    climate: 'temperate',
    color: [0.18, 0.25, 0.5],
    scale: 1.4,
    shoalRange: [2, 4],
    rarity: 'uncommon',
    provisions: 3,
    ascii: [
      '       __',
      '   ___/  \\___',
      '  <°))))))>  >',
      '   ~~~\\_/~~~~',
    ],
  },
  {
    id: 'great_white',
    name: 'Great White Shark',
    latin: 'Carcharodon carcharias',
    description: 'The lord of the deep. A massive predator trailing the ship at a wary distance.',
    climate: 'temperate',
    color: [0.4, 0.42, 0.45],
    scale: 3.0,
    shoalRange: [1, 1],
    rarity: 'legendary',
    provisions: 6,
    ascii: [
      '            ___',
      '     ______/   \\',
      '    /  °         \\______',
      '   /____________________\\>',
      '        \\__________/',
    ],
  },
  // ── Sea creatures (non-fish, catchable) ─────────────────
  {
    id: 'hawksbill_turtle',
    name: 'Hawksbill Turtle',
    latin: 'Eretmochelys imbricata',
    description: 'A hawksbill turtle paddles at the surface, its beautiful mottled shell catching the light.',
    climate: 'tropical',
    color: [0.45, 0.55, 0.3],
    scale: 1.8,
    shoalRange: [1, 2],
    rarity: 'rare',
    provisions: 2,
    cargo: { type: 'Aloes', amount: 1 }, // tortoiseshell traded as luxury
    ascii: [
      '        ___....___',
      '      /`  .  .   `\\',
      '   o-( ~~~~~~~~~~~ )-',
      '      \\_ .  .  . _/',
      '        `---°---`',
    ],
  },
  {
    id: 'green_turtle',
    name: 'Green Sea Turtle',
    latin: 'Chelonia mydas',
    description: 'An enormous green turtle drifts alongside, ancient and unhurried. Its meat would feed the crew for days.',
    climate: 'subtropical',
    color: [0.3, 0.5, 0.35],
    scale: 2.0,
    shoalRange: [1, 1],
    rarity: 'rare',
    provisions: 5,
    ascii: [
      '        ___===___',
      '      /`  . ~ .  `\\',
      '   o-( ~~~ ° ~~~~~ )-',
      '      \\_ . ~ .  _/',
      '        `--===--`',
    ],
  },
  {
    id: 'leatherback_turtle',
    name: 'Leatherback Turtle',
    latin: 'Dermochelys coriacea',
    description: 'The largest of all sea turtles, its ridged dark shell breaking the surface like a small island.',
    climate: 'temperate',
    color: [0.25, 0.25, 0.3],
    scale: 2.8,
    shoalRange: [1, 1],
    rarity: 'legendary',
    provisions: 8,
    cargo: { type: 'Aloes', amount: 2 }, // tortoiseshell
    ascii: [
      '       _____===_____',
      '     /`  . ~ . ~ .  `\\',
      '  o-( ~~~~~ ° ~~~~~~~~ )-',
      '     \\_ . ~ . ~ .  _/',
      '       `----===----`',
    ],
  },
];

// ── Lookup helpers ────────────────────────────────────────

const TROPICAL = FISH_TYPES.filter(f => f.climate === 'tropical');
const SUBTROPICAL = FISH_TYPES.filter(f => f.climate === 'subtropical');
const TEMPERATE = FISH_TYPES.filter(f => f.climate === 'temperate');

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

/** Pick a fish type based on terrain moisture (proxy for climate zone). */
export function pickFishType(moisture: number): FishType {
  if (moisture > 0.55) return pick(TROPICAL);
  if (moisture > 0.3) return pick(SUBTROPICAL);
  return pick(TEMPERATE);
}

export function getFishTypeById(id: string): FishType | undefined {
  return FISH_TYPES.find(f => f.id === id);
}

/** Randomize shoal size within the type's range. */
export function randomShoalSize(ft: FishType): number {
  return ft.shoalRange[0] + Math.floor(Math.random() * (ft.shoalRange[1] - ft.shoalRange[0] + 1));
}

// ── Rarity roll for auto-catch ────────────────────────────
// When the ship sails through a shoal, roll to determine quality.
// Result scales the base provisions/cargo from the fish type.

export type CatchQuality = 'poor' | 'normal' | 'fine' | 'legendary';

export interface CatchResult {
  quality: CatchQuality;
  fishType: FishType;
  provisions: number;
  cargo?: { type: Commodity; amount: number };
  message: string;
  toastType: 'warning' | 'success' | 'legendary';
  toastSize?: 'normal' | 'grand';
  toastSubtitle?: string;
}

export function rollFishCatch(ft: FishType, shoalCount: number): CatchResult {
  if (shoalCount < 1) {
    return { quality: 'poor', fishType: ft, provisions: 0, message: 'The net came up empty.', toastType: 'warning' };
  }

  const roll = Math.random();
  const baseProv = ft.provisions * Math.min(shoalCount, 5);

  // Rarity-dependent thresholds (cleaner than || chains)
  //                   common    uncommon   rare    legendary
  // legendary tier:   0.5%      1%         3%      8%
  // fine tier:        9%        12%        18%     25%
  // poor tier:        15%       12%        8%      5%
  // normal tier:      remainder
  const legendaryThresh = ft.rarity === 'legendary' ? 0.08
    : ft.rarity === 'rare' ? 0.03
    : ft.rarity === 'uncommon' ? 0.01
    : 0.005;
  const fineThresh = legendaryThresh + (
    ft.rarity === 'legendary' ? 0.25
    : ft.rarity === 'rare' ? 0.18
    : ft.rarity === 'uncommon' ? 0.12
    : 0.09
  );
  const poorThresh = fineThresh + (
    ft.rarity === 'legendary' ? 0.05
    : ft.rarity === 'rare' ? 0.08
    : ft.rarity === 'uncommon' ? 0.12
    : 0.15
  );

  if (roll < legendaryThresh) {
    const prov = Math.ceil(baseProv * 2);
    const cargo = ft.cargo ? { type: ft.cargo.type, amount: ft.cargo.amount * 2 } : undefined;
    return {
      quality: 'legendary',
      fishType: ft,
      provisions: prov,
      cargo,
      message: `Caught a magnificent ${ft.name}! (+${prov} provisions${cargo ? `, +${cargo.amount} ${cargo.type}` : ''})`,
      toastType: 'legendary',
      toastSize: 'grand',
      toastSubtitle: `LEGENDARY ${ft.name.toUpperCase()}`,
    };
  }

  if (roll < fineThresh) {
    const prov = Math.ceil(baseProv * 1.5);
    const cargo = ft.cargo ? { type: ft.cargo.type, amount: ft.cargo.amount } : undefined;
    return {
      quality: 'fine',
      fishType: ft,
      provisions: prov,
      cargo,
      message: `Excellent ${ft.name} haul! (+${prov} provisions${cargo ? `, +${cargo.amount} ${cargo.type}` : ''})`,
      toastType: 'success',
    };
  }

  if (roll < poorThresh) {
    const prov = Math.max(1, Math.floor(baseProv * 0.4));
    return {
      quality: 'poor',
      fishType: ft,
      provisions: prov,
      message: `Slim pickings — ${prov} ${ft.name.toLowerCase()}. (+${prov} provisions)`,
      toastType: 'warning',
    };
  }

  // Normal catch
  const prov = baseProv;
  const cargo = ft.cargo ? { type: ft.cargo.type, amount: ft.cargo.amount } : undefined;
  return {
    quality: 'normal',
    fishType: ft,
    provisions: prov,
    cargo,
    message: `Caught ${shoalCount} ${ft.name.toLowerCase()}! (+${prov} provisions${cargo ? `, +${cargo.amount} ${cargo.type}` : ''})`,
    toastType: 'success',
  };
}

// ── Manual cast (open water) junk/treasure table ──────────
// Press C in open water with no shoal nearby. Mostly junk, occasionally gold.

export interface ManualCastResult {
  message: string;
  provisions: number;
  gold: number;
  cargo?: { type: Commodity; amount: number };
  toastType: 'warning' | 'success' | 'legendary';
  toastSize?: 'normal' | 'grand';
  toastSubtitle?: string;
  ascii?: string[];
}

interface JunkEntry {
  name: string;
  message: string;
  provisions: number;
}

const JUNK_TABLE: JunkEntry[] = [
  { name: 'Seaweed', message: 'Hauled up a tangle of seaweed.', provisions: 0 },
  { name: 'Jellyfish', message: 'A translucent jellyfish. Beautiful but useless.', provisions: 0 },
  { name: 'Driftwood', message: 'Nothing but waterlogged driftwood.', provisions: 0 },
  { name: 'Empty Shell', message: 'A large conch shell. Pretty, but empty.', provisions: 0 },
  { name: 'Tangled Rope', message: 'Old rope and fishing line. Someone else\'s bad luck.', provisions: 0 },
  { name: 'Dead Fish', message: 'One sad, bloated fish. The crew declines to eat it.', provisions: 0 },
  { name: 'Barnacles', message: 'The net comes back crusted with barnacles.', provisions: 0 },
];

const MODEST_TABLE: JunkEntry[] = [
  { name: 'Sea Cucumber', message: 'Hauled up a sea cucumber — trepang. Edible, barely. (+1 provisions)', provisions: 1 },
  { name: 'Edible Kelp', message: 'A thick bunch of edible kelp. The cook eyes it thoughtfully. (+1 provisions)', provisions: 1 },
  { name: 'Small Octopus', message: 'A small octopus writhes in the net. Dinner. (+1 provisions)', provisions: 1 },
  { name: 'Barnacled Bottle', message: 'A bottle, crusted with barnacles. It contains stale wine. (+1 provisions)', provisions: 1 },
];

export function rollManualCast(): ManualCastResult {
  const roll = Math.random();

  // 0.3% — Ambergris (legendary)
  if (roll < 0.003) {
    return {
      message: 'The net comes up heavy with a strange, waxy mass — ambergris! Worth a fortune to the right buyer.',
      provisions: 0,
      gold: 150 + Math.floor(Math.random() * 150),
      toastType: 'legendary',
      toastSize: 'grand',
      toastSubtitle: 'AMBERGRIS',
      ascii: [
        '     .-"""-.',
        '   /`  . .  `\\',
        '  ( ~ ~ ~ ~ ~ )',
        '   \\  . ~ .  /',
        '    `-.___.-`',
      ],
    };
  }

  // 1.2% — Pearl oyster
  if (roll < 0.015) {
    const gold = 60 + Math.floor(Math.random() * 80);
    return {
      message: `Pulled up a cluster of oysters — and inside, a pearl! (+${gold} gold)`,
      provisions: 0,
      gold,
      toastType: 'legendary',
      toastSize: 'grand',
      toastSubtitle: 'PEARL',
      ascii: [
        '      _____',
        '    /`  .  `\\',
        '   (   °    )',
        '    \\_____/',
      ],
    };
  }

  // 3% — Coral branch
  if (roll < 0.045) {
    return {
      message: 'A branch of red coral tangled in the net. Valuable in any market.',
      provisions: 0,
      gold: 30 + Math.floor(Math.random() * 40),
      cargo: { type: 'Pearls', amount: 1 },
      toastType: 'success',
    };
  }

  // 5% — Waterlogged chest
  if (roll < 0.095) {
    const gold = 10 + Math.floor(Math.random() * 30);
    return {
      message: `Dragged up a small waterlogged chest. Inside: ${gold} coins and damp nothing.`,
      provisions: 0,
      gold,
      toastType: 'success',
    };
  }

  // 15% — Modest finds
  if (roll < 0.245) {
    const entry = pick(MODEST_TABLE);
    return {
      message: entry.message,
      provisions: entry.provisions,
      gold: 0,
      toastType: 'success',
    };
  }

  // 20% — Empty net
  if (roll < 0.445) {
    return {
      message: 'The net came back empty.',
      provisions: 0,
      gold: 0,
      toastType: 'warning',
    };
  }

  // 55.5% — Junk
  const entry = pick(JUNK_TABLE);
  return {
    message: entry.message,
    provisions: entry.provisions,
    gold: 0,
    toastType: 'warning',
  };
}
