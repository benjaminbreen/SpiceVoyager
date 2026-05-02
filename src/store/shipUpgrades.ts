import type { ShipStats } from './gameStore';

export type ShipUpgradeType =
  | 'copperSheathing'
  | 'reinforcedPlanking'
  | 'newCanvas'
  | 'lateenRigging'
  | 'expandedHold'
  | 'surgeonsChest'
  | 'ironKnees'
  | 'betterProvisions';

export interface ShipUpgrade {
  type: ShipUpgradeType;
  name: string;
  description: string;
  effect: string;
  price: number;
  apply: (stats: ShipStats) => Partial<ShipStats>;
}

export const SHIP_UPGRADES: Record<ShipUpgradeType, ShipUpgrade> = {
  copperSheathing: {
    type: 'copperSheathing',
    name: 'Copper Sheathing',
    description: 'Thin copper plates nailed to the hull below the waterline to ward off shipworm and barnacles.',
    effect: '+20 max hull',
    price: 500,
    apply: (s) => ({ maxHull: s.maxHull + 20 }),
  },
  reinforcedPlanking: {
    type: 'reinforcedPlanking',
    name: 'Reinforced Planking',
    description: 'Extra layer of teak or oak planking along the waterline for added protection.',
    effect: '+30 max hull',
    price: 850,
    apply: (s) => ({ maxHull: s.maxHull + 30 }),
  },
  newCanvas: {
    type: 'newCanvas',
    name: 'New Canvas Sails',
    description: 'Fresh sailcloth from local weavers replaces worn and patched canvas.',
    effect: '+2 sailing speed',
    price: 300,
    apply: (s) => ({ speed: s.speed + 2 }),
  },
  lateenRigging: {
    type: 'lateenRigging',
    name: 'Lateen Rigging',
    description: 'Triangular fore-and-aft sails for tacking against the wind.',
    effect: '+0.4 maneuverability',
    price: 380,
    apply: (s) => ({ turnSpeed: s.turnSpeed + 0.4 }),
  },
  expandedHold: {
    type: 'expandedHold',
    name: 'Expanded Hold',
    description: 'Carpenters reconfigure the lower deck to fit more cargo.',
    effect: '+12 cargo capacity',
    price: 650,
    apply: (s) => ({ cargoCapacity: s.cargoCapacity + 12 }),
  },
  surgeonsChest: {
    type: 'surgeonsChest',
    name: "Surgeon's Chest",
    description: 'A locked chest of medicines: theriac, mercury salve, laudanum, and surgical tools.',
    effect: 'Crew heal faster at sea',
    price: 220,
    apply: () => ({}),
  },
  ironKnees: {
    type: 'ironKnees',
    name: 'Iron Knee Braces',
    description: 'Wrought-iron brackets reinforcing the joints between ribs and deck beams.',
    effect: '+15 max hull, +4 cargo capacity',
    price: 700,
    apply: (s) => ({ maxHull: s.maxHull + 15, cargoCapacity: s.cargoCapacity + 4 }),
  },
  betterProvisions: {
    type: 'betterProvisions',
    name: 'Improved Provisions',
    description: 'Sealed casks, dried fruits, and salted fish — better stores mean longer voyages.',
    effect: '+25 provisions',
    price: 80,
    apply: () => ({}),
  },
};

const PORT_UPGRADE_POOLS: Record<string, ShipUpgradeType[]> = {
  goa: ['copperSheathing', 'reinforcedPlanking', 'newCanvas', 'lateenRigging', 'expandedHold', 'surgeonsChest', 'ironKnees', 'betterProvisions'],
  cochin: ['copperSheathing', 'newCanvas', 'lateenRigging', 'expandedHold', 'surgeonsChest', 'betterProvisions'],
  diu: ['copperSheathing', 'reinforcedPlanking', 'newCanvas', 'ironKnees', 'expandedHold', 'betterProvisions'],
  surat: ['reinforcedPlanking', 'newCanvas', 'expandedHold', 'ironKnees', 'betterProvisions'],
  malacca: ['copperSheathing', 'newCanvas', 'lateenRigging', 'expandedHold', 'surgeonsChest', 'betterProvisions'],
  macau: ['copperSheathing', 'reinforcedPlanking', 'newCanvas', 'expandedHold', 'betterProvisions'],
  hormuz: ['newCanvas', 'lateenRigging', 'expandedHold', 'betterProvisions'],
  aden: ['newCanvas', 'lateenRigging', 'betterProvisions'],
  bantam: ['newCanvas', 'lateenRigging', 'expandedHold', 'betterProvisions'],
  mombasa: ['newCanvas', 'lateenRigging', 'betterProvisions'],
  aceh: ['newCanvas', 'expandedHold', 'betterProvisions'],
  muscat: ['newCanvas', 'lateenRigging', 'betterProvisions'],
  calicut: ['newCanvas', 'lateenRigging', 'surgeonsChest', 'betterProvisions'],
  zanzibar: ['newCanvas', 'betterProvisions'],
  socotra: ['betterProvisions'],
  lisbon: ['copperSheathing', 'reinforcedPlanking', 'newCanvas', 'lateenRigging', 'expandedHold', 'surgeonsChest', 'ironKnees', 'betterProvisions'],
  amsterdam: ['copperSheathing', 'reinforcedPlanking', 'newCanvas', 'expandedHold', 'surgeonsChest', 'ironKnees', 'betterProvisions'],
  seville: ['newCanvas', 'expandedHold', 'surgeonsChest', 'betterProvisions'],
  london: ['reinforcedPlanking', 'newCanvas', 'expandedHold', 'surgeonsChest', 'ironKnees', 'betterProvisions'],
  elmina: ['newCanvas', 'betterProvisions'],
  luanda: ['betterProvisions'],
  salvador: ['reinforcedPlanking', 'newCanvas', 'expandedHold', 'betterProvisions'],
  havana: ['copperSheathing', 'reinforcedPlanking', 'newCanvas', 'expandedHold', 'ironKnees', 'betterProvisions'],
  cartagena: ['reinforcedPlanking', 'newCanvas', 'expandedHold', 'betterProvisions'],
  cape: ['betterProvisions'],
};

const DEFAULT_UPGRADE_POOL: ShipUpgradeType[] = ['newCanvas', 'betterProvisions'];

function seededShuffle<T>(arr: T[], seed: number): T[] {
  const result = [...arr];
  let s = seed;
  for (let i = result.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function getPortUpgrades(portId: string, worldSeed: number): ShipUpgradeType[] {
  const pool = PORT_UPGRADE_POOLS[portId] ?? DEFAULT_UPGRADE_POOL;
  let portHash = 0;
  for (let i = 0; i < portId.length; i++) portHash = ((portHash << 5) - portHash + portId.charCodeAt(i)) | 0;
  const shuffled = seededShuffle(pool, worldSeed + portHash);
  const maxCount = pool.length <= 3 ? pool.length : Math.min(4, Math.max(2, Math.floor(pool.length * 0.6)));
  return shuffled.slice(0, maxCount);
}
