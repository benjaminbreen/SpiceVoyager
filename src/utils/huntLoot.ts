// Loot tables for wildlife kills. Phase 1 covers grazer variants only;
// primates / wading birds / reptiles get added when those templates ship.
//
// Keep entries small — most animals drop 1–2 stacks. Phase 3 will add a
// rare/legendary roll on top of these (bezoar from a legendary goat, etc.).

import type { Commodity } from './commodities';

export interface LootDrop {
  commodity: Commodity;
  amount: number;
}

export interface LootEntry {
  commonName: string;       // shown in the kill toast
  drops: LootDrop[];
}

// Keyed by `${template}_${variant}` — e.g. `grazer_goat`, `grazer_buffalo`.
const LOOT_TABLE: Record<string, LootEntry> = {
  grazer_antelope: {
    commonName: 'antelope',
    drops: [
      { commodity: 'Hides', amount: 1 },
      { commodity: 'Salted Meat', amount: 2 },
      { commodity: 'Horn', amount: 1 },
    ],
  },
  grazer_deer: {
    commonName: 'deer',
    drops: [
      { commodity: 'Hides', amount: 1 },
      { commodity: 'Salted Meat', amount: 2 },
      { commodity: 'Horn', amount: 1 },
    ],
  },
  grazer_goat: {
    commonName: 'goat',
    drops: [
      { commodity: 'Hides', amount: 1 },
      { commodity: 'Salted Meat', amount: 1 },
    ],
  },
  grazer_camel: {
    commonName: 'camel',
    drops: [
      { commodity: 'Hides', amount: 2 },
      { commodity: 'Salted Meat', amount: 4 },
    ],
  },
  grazer_sheep: {
    commonName: 'sheep',
    drops: [
      { commodity: 'Hides', amount: 1 },
      { commodity: 'Wool', amount: 2 },
      { commodity: 'Salted Meat', amount: 1 },
    ],
  },
  grazer_bovine: {
    commonName: 'water buffalo',
    drops: [
      { commodity: 'Hides', amount: 2 },
      { commodity: 'Salted Meat', amount: 4 },
      { commodity: 'Horn', amount: 1 },
    ],
  },
  grazer_pig: {
    commonName: 'wild pig',
    drops: [
      { commodity: 'Hides', amount: 1 },
      { commodity: 'Salted Meat', amount: 3 },
    ],
  },
  grazer_capybara: {
    commonName: 'capybara',
    drops: [
      { commodity: 'Hides', amount: 1 },
      { commodity: 'Salted Meat', amount: 1 },
    ],
  },
};

export function lootForKill(template: string, variant: string): LootEntry | null {
  return LOOT_TABLE[`${template}_${variant}`] ?? null;
}
