// Tiered loot roll system for item pickups.
// Returns a tier with amount, message, notification type, and optional toast overrides.

import { sfxPickupNormal, sfxPickupRare, sfxPickupLegendary } from '../audio/SoundEffects';

export type LootTierName = 'dud' | 'normal' | 'rare' | 'legendary';

export interface LootTier {
  tier: LootTierName;
  amount: number;
  message: string;
  type: 'success' | 'warning' | 'legendary';
  toastSize?: 'normal' | 'grand';
  toastSubtitle?: string;
}

/** Play the pickup sound for a loot tier. Duds get no sound. */
export function playLootSfx(tier: LootTierName) {
  switch (tier) {
    case 'legendary': sfxPickupLegendary(); break;
    case 'rare':      sfxPickupRare(); break;
    case 'normal':    sfxPickupNormal(); break;
    // dud: silence
  }
}

export interface LootTable {
  /** 70% — normal pickup */
  normal: { amount: number; messages: string[] };
  /** 20% — dud / low quality */
  dud: { amount: number; messages: string[] };
  /** 9.5% — rare / extra good */
  rare: { amount: number; messages: string[] };
  /** 0.5% — legendary */
  legendary: { amount: number; message: string; title: string };
}

export function rollLoot(table: LootTable): LootTier {
  const roll = Math.random();
  const pick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];

  if (roll < 0.005) {
    return {
      tier: 'legendary',
      amount: table.legendary.amount,
      message: table.legendary.message,
      type: 'legendary',
      toastSize: 'grand',
      toastSubtitle: table.legendary.title,
    };
  }
  if (roll < 0.005 + 0.095) {
    return {
      tier: 'rare',
      amount: table.rare.amount,
      message: pick(table.rare.messages),
      type: 'success',
    };
  }
  if (roll < 0.005 + 0.095 + 0.2) {
    return {
      tier: 'dud',
      amount: table.dud.amount,
      message: pick(table.dud.messages),
      type: 'warning',
    };
  }
  return {
    tier: 'normal',
    amount: table.normal.amount,
    message: pick(table.normal.messages),
    type: 'success',
  };
}

// ── Loot tables ─────────────────────────────────────────────

export const CRAB_LOOT: LootTable = {
  normal: {
    amount: 1,
    messages: [
      'Caught a crab! (+1 provisions)',
      'Snatched a crab! (+1 provisions)',
      'Grabbed a feisty crab! (+1 provisions)',
    ],
  },
  dud: {
    amount: 0,
    messages: [
      "Caught a crab... but it doesn't look so healthy.",
      'This crab has seen better days. (+0 provisions)',
      'Caught a very small, sad crab. (+0 provisions)',
      "Grabbed a crab, but it's mostly shell. (+0 provisions)",
    ],
  },
  rare: {
    amount: 2,
    messages: [
      'Caught an unusually large crab! (+2 provisions)',
      'Caught a very hefty crab! (+2 provisions)',
      'What a specimen! Extremely large crab! (+2 provisions)',
    ],
  },
  legendary: {
    amount: 3,
    message: 'Caught the biggest damn crab you ever saw! (+3 provisions)',
    title: 'LEGENDARY CRAB',
  },
};
