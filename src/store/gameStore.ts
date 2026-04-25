import { create } from 'zustand';
import {
  commerceBuyTemplate, commerceSellTemplate, shipDamageTemplate,
  shipRepairTemplate, portDiscoverTemplate, tavernTemplate,
  fraudRevealTemplate, windfallRevealTemplate,
} from '../utils/journalTemplates';
import { generateStartingCrew, generateStartingCaptain } from '../utils/crewGenerator';
import { sfxCrabCollect, sfxDiscovery } from '../audio/SoundEffects';
import { audioManager } from '../audio/AudioManager';
import { rollLoot, playLootSfx, CRAB_LOOT } from '../utils/lootRoll';
import { NPCShipIdentity, SHIP_NAMES } from '../utils/npcShipGenerator';
import type { OceanEncounterDef } from '../utils/oceanEncounters';
import type { FishType } from '../utils/fishTypes';
import type { WaterPaletteSetting } from '../utils/waterPalettes';
import { canDirectlySail, estimateSeaTravel, getWorldPortById, resolveCampaignPortId, MARKET_TRUST } from '../utils/worldPorts';
import type { DistrictKey } from '../utils/cityDistricts';
export type { DistrictKey };
import {
  syncLiveShipTransform,
  syncLiveWalkingTransform,
  syncLivePlayerMode,
} from '../utils/livePlayerTransform';
import {
  type Commodity, ALL_COMMODITIES, ALL_COMMODITIES_FULL, COMMODITY_DEFS,
  supplyDemandModifier, generateStartingCargo,
} from '../utils/commodities';
import {
  type KnowledgeLevel,
  generateStartingKnowledge,
  getEffectiveKnowledge,
  getUnknownBuyDiscount,
  getMasterySellBonus,
  rollPurchaseOutcome,
} from '../utils/knowledgeSystem';
import type { CityFieldKey } from '../utils/cityFieldTypes';

export type { Commodity } from '../utils/commodities';
export type { KnowledgeLevel } from '../utils/knowledgeSystem';

// Map port IDs to their controlling nationality for reputation
export const PORT_FACTION: Record<string, Nationality> = {
  calicut: 'Gujarati',   // Zamorin kingdom, trade dominated by Gujarati & Mappila merchants
  goa: 'Portuguese',
  hormuz: 'Portuguese',  // Portuguese-occupied
  malacca: 'Portuguese',
  aden: 'Ottoman',
  zanzibar: 'Portuguese', // nominal Portuguese control
  macau: 'Portuguese',
  mombasa: 'Portuguese',
  surat: 'Mughal',
  muscat: 'Portuguese',  // Portuguese fort
  aceh: 'Acehnese',
  bantam: 'Javanese',
  // Nagasaki — Tokugawa shogunate port. Portuguese traders operate here under
  // license in 1612 but the port itself is Japanese-ruled.
  nagasaki: 'Japanese',
  // Masulipatnam — Shia Qutb Shahi sultanate of Golconda. Tagged 'Mughal' as
  // the closest available Nationality; the Deccani sultanates aren't a
  // separate gameplay faction in v1.
  masulipatnam: 'Mughal',
  cochin: 'Portuguese',
  mogadishu: 'Swahili',
  kilwa: 'Swahili',
  socotra: 'Portuguese',
  diu: 'Portuguese',        // key Portuguese fortress off Gujarat
  // European ports
  lisbon: 'Portuguese',
  amsterdam: 'Dutch',
  seville: 'Spanish',
  london: 'English',
  // West Africa
  elmina: 'Portuguese',     // São Jorge da Mina fortress
  luanda: 'Portuguese',     // São Paulo de Luanda
  // Atlantic Americas
  salvador: 'Portuguese',   // capital of Portuguese Brazil
  havana: 'Spanish',        // treasure fleet base
  cartagena: 'Spanish',     // fortified colonial port
  jamestown: 'English',     // Virginia Company colony, ~300 settlers in 1612
  // Cape route
  cape: 'Portuguese',       // no permanent settlement but Portuguese-claimed
};

// Cultural region of the built environment — separate from controlling nationality.
// Used for building labels, market names, family names, etc. A Portuguese-ruled port
// (Goa, Malacca, Mombasa, Macau) still has a local Malabari/Malay/Swahili/Chinese
// street-level culture. Forts and administrative warehouses may still read Portuguese
// at the gameplay layer — see PORT_FACTION for that.
export type CulturalRegion = 'Arab' | 'Swahili' | 'Gujarati' | 'Malabari' | 'Malay' | 'Chinese';

export const PORT_CULTURAL_REGION: Record<string, CulturalRegion> = {
  // Arab
  aden: 'Arab',
  hormuz: 'Arab',       // Persian island but Arab-Hormuzi trading culture
  muscat: 'Arab',       // Omani
  socotra: 'Arab',      // Mahri/Arab
  // Swahili coast
  mombasa: 'Swahili',
  zanzibar: 'Swahili',
  kilwa: 'Swahili',
  mogadishu: 'Swahili',
  // Gujarati
  surat: 'Gujarati',
  diu: 'Gujarati',
  // Masulipatnam — Deccani/Telugu rather than Gujarati, but 'Gujarati' is the
  // closest available CulturalRegion bucket for Indo-Islamic Deccan architecture.
  masulipatnam: 'Gujarati',
  // Malabari (Kerala / Konkani coast)
  calicut: 'Malabari',
  cochin: 'Malabari',
  goa: 'Malabari',      // Konkani — closest match in this taxonomy
  // Malay / insular SE Asia
  malacca: 'Malay',
  aceh: 'Malay',
  bantam: 'Malay',
  // Chinese
  macau: 'Chinese',
};

export type Culture = 'Indian Ocean' | 'European' | 'West African' | 'Atlantic';
export type PortScale = 'Small' | 'Medium' | 'Large' | 'Very Large' | 'Huge';

export type BuildingType = 'dock' | 'warehouse' | 'fort' | 'estate' | 'house' | 'farmhouse' | 'shack' | 'market' | 'plaza' | 'spiritual' | 'landmark' | 'palace';

export type HousingClass = 'poor' | 'common' | 'merchant' | 'elite';

export interface Building {
  id: string;
  type: BuildingType;
  position: [number, number, number];
  rotation: number;
  scale: [number, number, number];
  label?: string;
  labelSub?: string;
  labelEyebrow?: string;        // e.g. "RELIGIOUS" — all-caps glowing prefix on hover label
  labelEyebrowColor?: string;   // hex color for the eyebrow text + glow; paired with labelEyebrow
  district?: DistrictKey;
  stories?: number;          // 1..4; renderer stacks floors on tall buildings
  housingClass?: HousingClass;
  setback?: number;          // 0..1; render-time jitter multiplier
  landmarkId?: string;       // e.g. 'tower-of-london' — triggers unique geometry
  faith?: string;            // for type === 'spiritual'; keys render geometry
  palaceStyle?: string;      // for type === 'palace'; keys render geometry (iberian-colonial, mughal, malay-istana…)
}

export type RoadTier = 'path' | 'road' | 'avenue' | 'bridge';

export interface Road {
  id: string;
  tier: RoadTier;
  /** Polyline of world-space points (x, terrainHeight, z). */
  points: [number, number, number][];
}

/**
 * Lightweight connectivity graph of a port's road network. Built at city
 * generation time by welding endpoints and detecting T-junctions. Nodes are
 * welded positions (degree ≥ 1); edges are the road polylines between them.
 * Consumers don't need this for rendering — it's here so pedestrians, NPC
 * routing, and the ribbon renderer (taper-at-dead-ends) can share one
 * canonical view of "which road endpoints meet where".
 */
export interface RoadGraphNode {
  /** World-space position of the node (x, y, z) — y is terrain or deck. */
  pos: [number, number, number];
  /** Number of incident road endpoints welded to this node. 1 = dead-end,
   *  ≥ 2 = junction. */
  degree: number;
  /** The set of road tiers incident at this node (path/road/avenue/bridge). */
  tiers: RoadTier[];
}

export interface RoadGraphEdge {
  /** Matches the Road.id the edge was derived from. */
  roadId: string;
  tier: RoadTier;
  /** Index into RoadGraph.nodes for each endpoint, or -1 if the endpoint
   *  wasn't welded to any node (isolated segment). */
  fromNode: number;
  toNode: number;
}

export interface RoadGraph {
  nodes: RoadGraphNode[];
  edges: RoadGraphEdge[];
}

export interface Port {
  id: string;
  name: string;
  culture: Culture;
  scale: PortScale;
  buildingStyle?: string;
  flagColor?: [number, number, number];
  landmark?: string;
  position: [number, number, number];
  inventory: Record<Commodity, number>;
  baseInventory: Record<Commodity, number>; // initial stock levels for supply/demand calc
  basePrices: Record<Commodity, number>;    // base prices before supply/demand adjustment
  prices: Record<Commodity, number>;        // current effective prices
  buildings: Building[];
  roads?: Road[];
  /** Generation-time topology: welded endpoints + incidence. Optional so
   *  older save-state loads that predate the graph still boot. */
  roadGraph?: RoadGraph;
}

// ── Armament system ──
// Period-appropriate weapons for c. 1612 Indian Ocean trade:
//   Swivel guns (verso/falconet): small anti-personnel, mounted on rail, aimed by hand.
//     Starting weapon. Range ~50m. Low damage. Can aim with hold-spacebar.
//   Demi-culverin: medium cannon, ~9 lb shot. Common on English/Dutch armed merchantmen.
//   Saker: lighter cannon (~5 lb), fast reload, good range. Portuguese favorite.
//   Minion: small cannon (~4 lb). Cheap, light, good for pinnaces.
//   Demi-cannon: heavy (~32 lb). Galleon-class only. Devastating but slow, heavy.
//   Basilisk: rare Portuguese bronze long gun. Extreme range.
// Future: purchasable at different ports (culverins in Surat, sakers in Goa,
//   basilisks rare in Lisbon-connected ports, etc.)
// Lantaka (Arab/Indian Ocean) and cetbang (Malay/Javanese) are mechanically
// identical to the European swivel gun — same 1–2 lb bronze breech-loader,
// different cultural lineage. Kept as distinct entries so Indian Ocean ports
// can sell a historically-named piece without changing behavior.
export type WeaponType = 'swivelGun' | 'lantaka' | 'cetbang' | 'falconet' | 'fireRocket' | 'minion' | 'saker' | 'demiCulverin' | 'demiCannon' | 'basilisk';

export interface Weapon {
  type: WeaponType;
  name: string;
  damage: number;      // base damage per hit
  range: number;       // effective range in world units
  reloadTime: number;  // seconds between shots
  weight: number;      // cargo capacity cost
  aimable: boolean;    // true = swivel-style, aim with cursor; false = broadside only
}

export const WEAPON_DEFS: Record<WeaponType, Weapon> = {
  swivelGun:    { type: 'swivelGun',    name: 'Swivel Gun',    damage: 5,  range: 90,  reloadTime: 0.5,  weight: 1,  aimable: true },
  lantaka:      { type: 'lantaka',      name: 'Lantaka',       damage: 7,  range: 90,  reloadTime: 0.7,  weight: 1,  aimable: true },
  cetbang:      { type: 'cetbang',      name: 'Cetbang',       damage: 8,  range: 90,  reloadTime: 0.8,  weight: 2,  aimable: true },
  falconet:     { type: 'falconet',     name: 'Falconet',      damage: 11, range: 100, reloadTime: 1.4,  weight: 3,  aimable: true },
  // Bamboo-tube war rocket. Aimed like a swivel but far longer reach, slower
  // to reload, noticeably inaccurate, splash damage at impact.
  fireRocket:   { type: 'fireRocket',   name: 'War Rocket',    damage: 12, range: 90,  reloadTime: 2.8, weight: 3,  aimable: true },
  minion:       { type: 'minion',       name: 'Minion',        damage: 10, range: 55,  reloadTime: 5,  weight: 3,  aimable: false },
  saker:        { type: 'saker',        name: 'Saker',         damage: 12, range: 80,  reloadTime: 6,  weight: 4,  aimable: false },
  demiCulverin: { type: 'demiCulverin', name: 'Demi-Culverin', damage: 18, range: 95,  reloadTime: 8,  weight: 6,  aimable: false },
  demiCannon:   { type: 'demiCannon',   name: 'Demi-Cannon',   damage: 30, range: 50,  reloadTime: 12, weight: 10, aimable: false },
  basilisk:     { type: 'basilisk',     name: 'Basilisk',      damage: 22, range: 110, reloadTime: 10, weight: 8,  aimable: false },
};

// ── Weapon prices & availability ──
// Prices in gold. Not every port sells every weapon.
export const WEAPON_PRICES: Record<WeaponType, number> = {
  swivelGun:    40,
  lantaka:      40,
  cetbang:      40,
  falconet:     560,
  fireRocket:   180,
  minion:       80,
  saker:        120,
  demiCulverin: 200,
  demiCannon:   350,
  basilisk:     500,
};

// Which weapon types each port sells (by port id).
// Ports not listed sell only minions and swivelGuns.
export const PORT_ARMORY: Record<string, WeaponType[]> = {
  goa:      ['swivelGun', 'minion', 'saker', 'demiCulverin', 'basilisk'],  // Portuguese arsenal
  malacca:  ['cetbang', 'fireRocket', 'swivelGun', 'minion', 'saker', 'demiCulverin'],   // Luso-Malay mix after 1511
  hormuz:   ['lantaka', 'swivelGun', 'minion', 'saker'],                   // Luso-held but Arab armorers present
  surat:    ['lantaka', 'minion', 'demiCulverin', 'demiCannon'],           // Mughal heavy guns
  cochin:   ['swivelGun', 'minion', 'saker', 'demiCulverin'],
  macau:    ['cetbang', 'fireRocket', 'swivelGun', 'minion', 'saker', 'demiCannon'],
  bantam:   ['cetbang', 'fireRocket', 'swivelGun', 'minion', 'saker'],
  mombasa:  ['lantaka', 'minion', 'saker'],                                // Swahili coast
  muscat:   ['lantaka', 'minion'],                                          // Omani armorers
  aceh:     ['cetbang', 'swivelGun', 'minion', 'saker'],
  aden:     ['lantaka', 'minion', 'demiCulverin'],                          // Ottoman garrison
  zanzibar: ['lantaka', 'minion'],
  calicut:  ['lantaka', 'minion'],
  socotra:  ['lantaka', 'minion'],                                          // remote outpost, minimal arms
  diu:      ['swivelGun', 'minion', 'saker', 'demiCulverin', 'demiCannon'], // major Portuguese fortress
  mocha:    ['lantaka', 'minion'],                                          // Red Sea Arab port
  // European ports
  lisbon:    ['swivelGun', 'minion', 'saker', 'demiCulverin', 'demiCannon', 'basilisk'],  // imperial arsenal
  amsterdam: ['swivelGun', 'falconet', 'minion', 'saker', 'demiCulverin', 'demiCannon', 'basilisk'],  // VOC arsenal
  seville:   ['swivelGun', 'minion', 'saker', 'demiCulverin', 'demiCannon'],
  london:    ['swivelGun', 'falconet', 'minion', 'saker', 'demiCulverin', 'demiCannon'],
  // West African ports
  elmina:    ['swivelGun', 'minion'],                                                      // fortress garrison, limited stock
  luanda:    [],                                                                           // no weapons trade
  // Atlantic American ports
  salvador:  ['swivelGun', 'minion', 'saker'],
  havana:    ['swivelGun', 'minion', 'saker', 'demiCulverin', 'demiCannon'],               // treasure fleet arsenal
  cartagena: ['swivelGun', 'minion', 'saker', 'demiCulverin'],
  // Cape route
  cape:      [],                                                                           // no settlement, no weapons
};
const DEFAULT_PORT_ARMORY: WeaponType[] = ['swivelGun', 'minion'];

export function getPortArmory(portId: string): WeaponType[] {
  return PORT_ARMORY[portId] ?? DEFAULT_PORT_ARMORY;
}

// ── Human-readable weapon descriptions ──
export const WEAPON_DESCRIPTIONS: Record<WeaponType, { flavor: string; rangeLabel: string; reloadLabel: string; weightLabel: string }> = {
  swivelGun:    { flavor: 'Light anti-personnel gun, aimed by hand',     rangeLabel: 'Close',   reloadLabel: 'Rapid',     weightLabel: 'Negligible' },
  lantaka:      { flavor: 'Bronze breech-loader of the Arab and Indian Ocean coasts', rangeLabel: 'Close',   reloadLabel: 'Rapid',     weightLabel: 'Negligible' },
  cetbang:      { flavor: 'Javanese bronze swivel — light, swift, deadly at close quarters', rangeLabel: 'Close',   reloadLabel: 'Rapid',     weightLabel: 'Negligible' },
  falconet:     { flavor: 'Light European cannon adapted as a bow chaser — costly, but strong enough to batter buildings', rangeLabel: 'Long', reloadLabel: 'Moderate', weightLabel: 'Light' },
  fireRocket:   { flavor: 'Bamboo-tube rocket — long reach and a fireball on impact, but flies wild', rangeLabel: 'Extreme', reloadLabel: 'Slow',      weightLabel: 'Light' },
  minion:       { flavor: 'Small iron cannon, cheap and reliable',        rangeLabel: 'Medium',  reloadLabel: 'Moderate',  weightLabel: 'Light' },
  saker:        { flavor: 'Fast-loading bronze gun favored by the Portuguese', rangeLabel: 'Long',    reloadLabel: 'Moderate',  weightLabel: 'Light' },
  demiCulverin: { flavor: 'Versatile medium cannon with good range',     rangeLabel: 'Long',    reloadLabel: 'Slow',      weightLabel: 'Medium' },
  demiCannon:   { flavor: 'Heavy siege gun — devastating at close range', rangeLabel: 'Medium',  reloadLabel: 'Very slow', weightLabel: 'Heavy' },
  basilisk:     { flavor: 'Rare bronze long gun with extreme reach',      rangeLabel: 'Extreme', reloadLabel: 'Slow',      weightLabel: 'Medium' },
};

// ── Land Weapons (hunting) ──
// Separate from ship armament: no broadside slot, no weight, carried by the
// walking character. Extend this union to add new hunting weapons.
export type LandWeaponType = 'musket' | 'bow';

export interface LandWeapon {
  type: LandWeaponType;
  name: string;
  damage: number;             // per-shot damage vs animals
  range: number;              // effective range in world units (accuracy falls off past this)
  reloadTime: number;         // seconds between shots
  projectileSpeed: number;    // world units/sec
  spread: number;             // random cone in radians added to aim
  noise: number;              // 0-1, how much this scares animals within earshot
  ammoCommodity: Commodity | null;  // null = no ammo consumed
  ammoPerShot: number;
  description: string;
}

export const LAND_WEAPON_DEFS: Record<LandWeaponType, LandWeapon> = {
  musket: {
    type: 'musket',
    name: 'Matchlock Musket',
    damage: 100,
    range: 60,
    reloadTime: 2.0,
    projectileSpeed: 60,
    spread: 0.035,
    noise: 1.0,
    ammoCommodity: 'Small Shot',
    ammoPerShot: 1,
    description: 'A matchlock firearm. Loud, slow to reload, but one ball can drop a buffalo.',
  },
  bow: {
    type: 'bow',
    name: 'Hunting Bow',
    damage: 55,
    range: 22,
    reloadTime: 1.0,
    projectileSpeed: 40,
    spread: 0.05,
    noise: 0.2,
    ammoCommodity: null,
    ammoPerShot: 0,
    description: 'A simple hunting bow. Quiet, quick to draw, no powder required.',
  },
};

// ── Ship Upgrades ──
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
  effect: string;          // human-readable effect description
  price: number;
  apply: (stats: ShipStats) => Partial<ShipStats>;
}

export const SHIP_UPGRADES: Record<ShipUpgradeType, ShipUpgrade> = {
  copperSheathing: {
    type: 'copperSheathing',
    name: 'Copper Sheathing',
    description: 'Thin copper plates nailed to the hull below the waterline to ward off shipworm and barnacles.',
    effect: '+20 max hull',
    price: 200,
    apply: (s) => ({ maxHull: s.maxHull + 20 }),
  },
  reinforcedPlanking: {
    type: 'reinforcedPlanking',
    name: 'Reinforced Planking',
    description: 'Extra layer of teak or oak planking along the waterline for added protection.',
    effect: '+30 max hull',
    price: 350,
    apply: (s) => ({ maxHull: s.maxHull + 30 }),
  },
  newCanvas: {
    type: 'newCanvas',
    name: 'New Canvas Sails',
    description: 'Fresh sailcloth from local weavers replaces worn and patched canvas.',
    effect: '+2 sailing speed',
    price: 150,
    apply: (s) => ({ speed: s.speed + 2 }),
  },
  lateenRigging: {
    type: 'lateenRigging',
    name: 'Lateen Rigging',
    description: 'Triangular fore-and-aft sails for tacking against the wind.',
    effect: '+0.4 maneuverability',
    price: 220,
    apply: (s) => ({ turnSpeed: s.turnSpeed + 0.4 }),
  },
  expandedHold: {
    type: 'expandedHold',
    name: 'Expanded Hold',
    description: 'Carpenters reconfigure the lower deck to fit more cargo.',
    effect: '+12 cargo capacity',
    price: 280,
    apply: (s) => ({ cargoCapacity: s.cargoCapacity + 12 }),
  },
  surgeonsChest: {
    type: 'surgeonsChest',
    name: "Surgeon's Chest",
    description: 'A locked chest of medicines: theriac, mercury salve, laudanum, and surgical tools.',
    effect: 'Crew heal faster at sea',
    price: 160,
    apply: () => ({}), // effect handled by crew health system
  },
  ironKnees: {
    type: 'ironKnees',
    name: 'Iron Knee Braces',
    description: 'Wrought-iron brackets reinforcing the joints between ribs and deck beams.',
    effect: '+15 max hull, +4 cargo capacity',
    price: 300,
    apply: (s) => ({ maxHull: s.maxHull + 15, cargoCapacity: s.cargoCapacity + 4 }),
  },
  betterProvisions: {
    type: 'betterProvisions',
    name: 'Improved Provisions',
    description: 'Sealed casks, dried fruits, and salted fish — better stores mean longer voyages.',
    effect: '+25 provisions',
    price: 100,
    apply: () => ({}), // handled specially — adds provisions
  },
};

// Which upgrades each port might offer (pool to randomize from)
const PORT_UPGRADE_POOLS: Record<string, ShipUpgradeType[]> = {
  goa:      ['copperSheathing', 'reinforcedPlanking', 'newCanvas', 'lateenRigging', 'expandedHold', 'surgeonsChest', 'ironKnees', 'betterProvisions'],
  cochin:   ['copperSheathing', 'newCanvas', 'lateenRigging', 'expandedHold', 'surgeonsChest', 'betterProvisions'],
  diu:      ['copperSheathing', 'reinforcedPlanking', 'newCanvas', 'ironKnees', 'expandedHold', 'betterProvisions'],
  surat:    ['reinforcedPlanking', 'newCanvas', 'expandedHold', 'ironKnees', 'betterProvisions'],
  malacca:  ['copperSheathing', 'newCanvas', 'lateenRigging', 'expandedHold', 'surgeonsChest', 'betterProvisions'],
  macau:    ['copperSheathing', 'reinforcedPlanking', 'newCanvas', 'expandedHold', 'betterProvisions'],
  hormuz:   ['newCanvas', 'lateenRigging', 'expandedHold', 'betterProvisions'],
  aden:     ['newCanvas', 'lateenRigging', 'betterProvisions'],
  bantam:   ['newCanvas', 'lateenRigging', 'expandedHold', 'betterProvisions'],
  mombasa:  ['newCanvas', 'lateenRigging', 'betterProvisions'],
  aceh:     ['newCanvas', 'expandedHold', 'betterProvisions'],
  muscat:   ['newCanvas', 'lateenRigging', 'betterProvisions'],
  calicut:  ['newCanvas', 'lateenRigging', 'surgeonsChest', 'betterProvisions'],
  zanzibar: ['newCanvas', 'betterProvisions'],
  socotra:  ['betterProvisions'],
  // European ports
  lisbon:    ['copperSheathing', 'reinforcedPlanking', 'newCanvas', 'lateenRigging', 'expandedHold', 'surgeonsChest', 'ironKnees', 'betterProvisions'],
  amsterdam: ['copperSheathing', 'reinforcedPlanking', 'newCanvas', 'expandedHold', 'surgeonsChest', 'ironKnees', 'betterProvisions'],
  seville:   ['newCanvas', 'expandedHold', 'surgeonsChest', 'betterProvisions'],
  london:    ['reinforcedPlanking', 'newCanvas', 'expandedHold', 'surgeonsChest', 'ironKnees', 'betterProvisions'],
  // West African ports
  elmina:    ['newCanvas', 'betterProvisions'],
  luanda:    ['betterProvisions'],
  // Atlantic American ports
  salvador:  ['reinforcedPlanking', 'newCanvas', 'expandedHold', 'betterProvisions'],
  havana:    ['copperSheathing', 'reinforcedPlanking', 'newCanvas', 'expandedHold', 'ironKnees', 'betterProvisions'],
  cartagena: ['reinforcedPlanking', 'newCanvas', 'expandedHold', 'betterProvisions'],
  // Cape route
  cape:      ['betterProvisions'],
};
const DEFAULT_UPGRADE_POOL: ShipUpgradeType[] = ['newCanvas', 'betterProvisions'];

// Deterministic shuffle based on port id + world seed
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
  // Hash portId into a number for seeding
  let portHash = 0;
  for (let i = 0; i < portId.length; i++) portHash = ((portHash << 5) - portHash + portId.charCodeAt(i)) | 0;
  const shuffled = seededShuffle(pool, worldSeed + portHash);
  // Offer 2-4 upgrades depending on port size, always include betterProvisions if in pool
  const maxCount = pool.length <= 3 ? pool.length : Math.min(4, Math.max(2, Math.floor(pool.length * 0.6)));
  return shuffled.slice(0, maxCount);
}

// Max broadside cannons based on ship type
const MAX_CANNONS: Record<string, number> = {
  Pinnace: 4,
  Caravel: 4,
  Dhow: 4,
  Fluyt: 6,
  Junk: 6,
  Baghla: 8,
  Jong: 10,
  Carrack: 8,
  Galleon: 12,
};

export interface ShipStats {
  hull: number;
  maxHull: number;
  sails: number;
  maxSails: number;
  speed: number;
  turnSpeed: number;
  /** 0–1. How well the ship sails upwind. Lateens ≈ 0.9, galleons ≈ 0.35.
   *  Used by getWindTrimInfo to widen or narrow the usable wind arc. */
  windward: number;
  /** How shallow a reef or coastal shoal the ship can pass. */
  draft: 'shallow' | 'medium' | 'deep';
  /** Maximum berth — upper bound on hireable crew. Distinct from current
   *  crew count; a ship can sail undermanned but not overmanned. */
  maxCrew: number;
  cargoCapacity: number;
  cannons: number;       // broadside cannon count (0 = no broadsides)
  armament: WeaponType[]; // all mounted weapons
}

export type CrewRole = 'Captain' | 'Navigator' | 'Gunner' | 'Sailor' | 'Factor' | 'Surgeon';
export type HealthFlag = 'healthy' | 'sick' | 'injured' | 'scurvy' | 'fevered';
export type Nationality =
  | 'English' | 'Portuguese' | 'Dutch' | 'Spanish' | 'French' | 'Danish'
  | 'Venetian'
  | 'Mughal' | 'Gujarati' | 'Persian' | 'Ottoman' | 'Omani'
  | 'Swahili'
  | 'Malay' | 'Acehnese' | 'Javanese' | 'Moluccan'
  | 'Siamese' | 'Japanese' | 'Chinese';
export type Language =
  | 'Arabic' | 'Persian' | 'Gujarati' | 'Hindustani'
  | 'Portuguese' | 'Dutch' | 'English' | 'Spanish' | 'French' | 'Italian'
  | 'Turkish' | 'Malay' | 'Swahili' | 'Chinese' | 'Japanese';
export type CaptainTrait =
  | 'Silver Tongue'   // better prices at port
  | 'Iron Will'       // slower morale decay
  | 'Sea Legs'        // faster sailing speed
  | 'Keen Eye'        // discovers ports from further away
  | 'Battle Hardened' // reduced hull damage
  | 'Lucky Star';     // random bonus events

export type CrewQuality =
  | 'disaster'  // bottom ~3%, actively harmful
  | 'dud'       // ~15%, unreliable
  | 'untried'   // ~20%, green / unproven
  | 'passable'  // ~24%, serviceable, unremarkable
  | 'able'      // ~20%, competent
  | 'seasoned'  // ~12%, experienced
  | 'renowned'  // ~4.5%, famed in ports
  | 'legendary';// ~1.5%, peerless

export interface CrewStats {
  strength: number;    // 1-20, physical power — boarding, repairs, hauling
  perception: number;  // 1-20, awareness — navigation, spotting, fishing
  charisma: number;    // 1-20, social — trading, morale, diplomacy
  luck: number;        // 1-20, fortune — random events, loot, survival
}

export interface Humours {
  sanguine: number;    // 1-10, sociability, optimism, morale recovery
  choleric: number;    // 1-10, drive, initiative, but conflict risk
  melancholic: number; // 1-10, introspection, perception, but fragile morale
  phlegmatic: number;  // 1-10, steadiness, loyalty, crew harmony
  curiosity: number;   // 1-10, openness, language learning, adaptability
}

export interface CrewHistoryEntry {
  day: number;         // game day count
  event: string;       // short description
}

export interface CrewMember {
  id: string;
  name: string;
  role: CrewRole;
  skill: number;       // 1-100
  morale: number;      // 1-100
  age: number;
  nationality: Nationality;
  languages: Language[];
  birthplace: string;
  health: HealthFlag;
  quality: CrewQuality;
  stats: CrewStats;
  humours: Humours;
  backstory: string;
  history: CrewHistoryEntry[];
  hireDay: number;     // game day when they joined the crew
  traits: CaptainTrait[];
  abilities: CaptainAbility[];
  level: number;       // 1+
  xp: number;          // current XP toward next level
  xpToNext: number;    // XP needed for next level
}

export interface ShipInfo {
  name: string;
  type: 'Carrack' | 'Galleon' | 'Dhow' | 'Baghla' | 'Junk' | 'Jong' | 'Pinnace' | 'Fluyt' | 'Caravel';
  flag: Nationality;
  armed: boolean;
}

export type CaptainAbility =
  | 'Broadside Master'   // improved cannon accuracy
  | 'Storm Rider'        // reduced storm damage
  | 'Port Diplomat'      // reputation gains doubled
  | 'Treasure Nose'      // better loot drops
  | 'Crew Whisperer'     // morale decay halved
  | 'Chart Reader';      // reveals hidden ports

// Captain portrait expression (mirrors portraitConfig.Personality)
export type Personality = 'Friendly' | 'Stern' | 'Curious' | 'Smug' | 'Melancholy' | 'Neutral' | 'Weathered' | 'Fierce';

export type NotificationTier = 'port' | 'event' | 'ticker';

export interface Notification {
  id: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error' | 'legendary';
  tier: NotificationTier;
  subtitle?: string;
  imageCandidates?: string[];
  openPortId?: string;
  timestamp: number;
}

export type JournalCategory = 'navigation' | 'commerce' | 'ship' | 'crew' | 'encounter';

export interface JournalNote {
  id: string;
  text: string;
  timestamp: number;
}

export interface JournalEntry {
  id: string;
  day: number;
  timeOfDay: number;
  category: JournalCategory;
  message: string;
  portName?: string;
  notes: JournalNote[];
}

/**
 * Per-stack provenance for cargo. Every buy creates one. Sells consume FIFO.
 * When `actualCommodity !== commodity`, the stack is mislabeled — reveal fires
 * on sale. Provenance is kept in sync with the `cargo` bucket counts.
 */
export interface CargoStack {
  id: string;
  commodity: Commodity;        // claimed / bucket identity
  actualCommodity: Commodity;  // what it really is (equals commodity for genuine stacks)
  amount: number;
  acquiredPort: string;        // port id
  acquiredPortName: string;
  acquiredDay: number;
  purchasePrice: number;       // per-unit gold paid
  knowledgeAtPurchase: KnowledgeLevel;
}

export interface FishShoalEntry {
  center: [number, number, number];
  fishType: FishType;
  startIdx: number;
  count: number;        // current fish count (depletes on catch)
  maxCount: number;     // original count (for respawn)
  lastFished: number;   // timestamp of last catch (0 = never fished)
  scattered: boolean;   // temporarily depleted
}

export interface RenderDebugSettings {
  showDevPanel: boolean;
  minimap: boolean;
  shadows: boolean;
  postprocessing: boolean;
  bloom: boolean;
  vignette: boolean;
  ao: boolean;
  brightnessContrast: boolean;
  hueSaturation: boolean;
  advancedWater: boolean;
  shipWake: boolean;
  algae: boolean;
  coralReefs: boolean;
  wildlifeMotion: boolean;
  cloudShadows: boolean;
  animalMarkers: boolean;
  disableTransitions: boolean;
  worldMapChart: boolean;
  cityFieldOverlay: boolean;
  cityFieldMode: CityFieldKey | 'district';
  sacredMarkers: boolean;
  settingsV2: boolean;
}

interface GameState {
  playerPos: [number, number, number];
  playerRot: number;
  playerVelocity: number;
  gold: number;
  cargo: Record<Commodity, number>;
  cargoProvenance: CargoStack[];
  stats: ShipStats;
  crew: CrewMember[];
  ship: ShipInfo;
  ports: Port[];
  timeOfDay: number; // 0 to 24
  notifications: Notification[];
  activePort: Port | null;
  cameraZoom: number;
  cameraRotation: number; // radians, orbits around player on Y axis
  viewMode: 'default' | 'cinematic' | 'topdown' | 'firstperson';
  cycleViewMode: () => void;
  
  // New state for walking
  playerMode: 'ship' | 'walking';
  walkingPos: [number, number, number];
  walkingRot: number;
  interactionPrompt: string | null;
  nearestHailableNpc: NPCShipIdentity | null;
  discoveredPorts: string[];

  // Reputation per nationality (-100 to +100, starts at 0)
  reputation: Partial<Record<Nationality, number>>;
  npcPositions: [number, number, number][];
  npcShips: NPCShipIdentity[];
  oceanEncounters: OceanEncounterDef[];
  fishShoals: FishShoalEntry[];
  fishNetCooldown: number; // seconds remaining before next auto/manual catch

  // Journal
  journalEntries: JournalEntry[];
  dayCount: number;

  // Wind
  windDirection: number; // radians, 0 = north, PI/2 = east
  windSpeed: number;     // 0-1 normalized

  // Knowledge system — tracks what the player knows about trade goods
  knowledgeState: Record<string, KnowledgeLevel>;

  // Provisions (food/supplies for crew)
  provisions: number;

  // Crew death modal
  deadCrew: CrewMember | null; // set when a crew member dies, cleared when modal dismissed
  dismissDeadCrew: () => void;
  killCrewMember: (crewId: string, cause: string) => void;

  // Game over
  gameOver: boolean;
  gameOverCause: string;
  triggerGameOver: (cause: string) => void;

  // World
  worldSeed: number;
  worldSize: number;
  devSoloPort: string | null;
  currentWorldPortId: string | null;
  waterPaletteSetting: WaterPaletteSetting;
  forceMobileLayout: boolean;
  setForceMobileLayout: (v: boolean) => void;
  shipSteeringMode: 'tap' | 'joystick';
  setShipSteeringMode: (mode: 'tap' | 'joystick') => void;
  // Mirrors touchShipInput.sailRaised but lives in the store so SailToggleButton
  // re-renders when TouchSteerRaycaster auto-raises the sail on ocean tap.
  touchSailRaised: boolean;
  setTouchSailRaised: (v: boolean) => void;
  renderDebug: RenderDebugSettings;
  paused: boolean;
  anchored: boolean;
  combatMode: boolean;

  // Hunting (land combat)
  landWeapons: LandWeaponType[];        // weapons the player owns and can switch between
  activeLandWeapon: LandWeaponType;     // currently equipped land weapon
  setActiveLandWeapon: (w: LandWeaponType) => void;
  cycleLandWeapon: () => void;          // tab key handler — cycles through owned weapons
  requestWorldMap: boolean;
  setRequestWorldMap: (v: boolean) => void;
  voyageBegun: boolean;
  setVoyageBegun: () => void;

  // Captain expression override — temporary expression for game events
  captainExpression: Personality | null;
  setCaptainExpression: (expr: Personality | null, durationMs?: number) => void;

  setPlayerPos: (pos: [number, number, number]) => void;
  setPlayerRot: (rot: number) => void;
  setPlayerVelocity: (vel: number) => void;
  setPlayerTransform: (transform: {
    pos: [number, number, number];
    rot: number;
    vel: number;
  }) => void;
  setPlayerMode: (mode: 'ship' | 'walking') => void;
  setWalkingPos: (pos: [number, number, number]) => void;
  setWalkingRot: (rot: number) => void;
  setWalkingTransform: (transform: {
    pos: [number, number, number];
    rot: number;
  }) => void;
  setInteractionPrompt: (prompt: string | null) => void;
  setNearestHailableNpc: (npc: NPCShipIdentity | null) => void;
  adjustReputation: (nationality: Nationality, delta: number) => void;
  getReputation: (nationality: Nationality) => number;
  discoverPort: (id: string) => void;
  setNpcPositions: (positions: [number, number, number][]) => void;
  setNpcShips: (ships: NPCShipIdentity[]) => void;
  setOceanEncounters: (encounters: OceanEncounterDef[]) => void;
  setFishShoals: (shoals: FishShoalEntry[]) => void;
  scatterShoal: (shoalIdx: number) => void;
  tickFishRespawn: () => void;
  damageShip: (amount: number) => void;
  repairShip: (amount: number, cost: number) => void;
  setCrewRole: (crewId: string, role: CrewRole) => void;
  addCrewHistory: (crewId: string, event: string) => void;

  addNotification: (message: string, type?: Notification['type'], opts?: { size?: 'normal' | 'grand'; tier?: NotificationTier; subtitle?: string; imageCandidates?: string[]; openPortId?: string }) => void;
  removeNotification: (id: string) => void;
  addJournalEntry: (category: JournalCategory, message: string, portName?: string) => void;
  addJournalNote: (entryId: string, text: string) => void;
  setActivePort: (port: Port | null) => void;
  buyCommodity: (commodity: Commodity, amount: number) => void;
  sellCommodity: (commodity: Commodity, amount: number) => void;
  advanceTime: (delta: number) => void;
  setCameraZoom: (zoom: number) => void;
  setCameraRotation: (rotation: number) => void;
  setViewMode: (mode: 'default' | 'cinematic' | 'topdown' | 'firstperson') => void;
  setWorldSeed: (seed: number) => void;
  setWorldSize: (size: number) => void;
  setDevSoloPort: (portId: string | null) => void;
  setWaterPaletteSetting: (setting: WaterPaletteSetting) => void;
  updateRenderDebug: (patch: Partial<RenderDebugSettings>) => void;
  resetRenderDebug: () => void;
  learnAboutCommodity: (commodityId: string, newLevel: KnowledgeLevel, source: string) => void;
  collectCrab: () => void;
  fastTravel: (portId: string, opts?: { force?: boolean }) => void;
  setPaused: (paused: boolean) => void;
  setAnchored: (anchored: boolean) => void;
  setCombatMode: (combatMode: boolean) => void;
  shipUpgrades: ShipUpgradeType[];
  buyUpgrade: (upgradeType: ShipUpgradeType) => void;
  buyWeapon: (weaponType: WeaponType) => void;
  sellWeapon: (weaponType: WeaponType) => void;
  defeatedNpc: (npcId: string, shipName: string, flag: Nationality, cargo: Partial<Record<Commodity, number>>) => void;
  initWorld: (ports: Port[]) => void;
}

const generateId = () => Math.random().toString(36).substring(2, 9);

const DEFAULT_RENDER_DEBUG: RenderDebugSettings = {
  showDevPanel: false,
  minimap: true,
  shadows: true,
  postprocessing: true,
  bloom: true,
  vignette: true,
  ao: true,
  brightnessContrast: true,
  hueSaturation: true,
  advancedWater: true,
  shipWake: true,
  algae: true,
  coralReefs: false,
  wildlifeMotion: true,
  cloudShadows: true,
  animalMarkers: true,
  disableTransitions: false,
  worldMapChart: true,
  cityFieldOverlay: false,
  cityFieldMode: 'prestige',
  sacredMarkers: true,
  settingsV2: true,
};

// ── Crew helper functions ──────────────────────────────────────────────
export function getCaptain(state: { crew: CrewMember[] }): CrewMember | undefined {
  return state.crew.find(c => c.role === 'Captain') ?? state.crew[0];
}

export function getCrewByRole(state: { crew: CrewMember[] }, role: CrewRole): CrewMember | undefined {
  return state.crew.find(c => c.role === role);
}

/** Returns a multiplier (1.0–1.10) based on a crew member's stat in a given role. */
export function getRoleBonus(state: { crew: CrewMember[] }, role: CrewRole, stat: keyof CrewStats): number {
  const member = getCrewByRole(state, role);
  if (!member) return 1.0;
  return 1.0 + (member.stats[stat] / 200); // stat 1→1.005, stat 10→1.05, stat 20→1.10
}

export function captainHasTrait(state: { crew: CrewMember[] }, trait: CaptainTrait): boolean {
  return getCaptain(state)?.traits.includes(trait) ?? false;
}

export function captainHasAbility(state: { crew: CrewMember[] }, ability: CaptainAbility): boolean {
  return getCaptain(state)?.abilities.includes(ability) ?? false;
}

export function updateCrewMember(
  crew: CrewMember[], id: string, updater: (m: CrewMember) => CrewMember
): CrewMember[] {
  return crew.map(c => c.id === id ? updater(c) : c);
}

/** Grant XP to a crew member, handling level-ups with skill bumps.
 *  Returns { crew, levelledUp } where levelledUp is the member's name if they levelled. */
export function grantCrewXp(
  crew: CrewMember[], memberId: string, xp: number
): { crew: CrewMember[]; levelledUp: string | null; newLevel: number } {
  let levelledUp: string | null = null;
  let newLevel = 0;
  const updated = crew.map(c => {
    if (c.id !== memberId) return c;
    const totalXp = c.xp + xp;
    if (totalXp >= c.xpToNext) {
      // Level up — bump skill by 2-4 points and a random stat by 1
      const skillBump = 2 + Math.floor(Math.random() * 3);
      const statKeys: (keyof CrewStats)[] = ['strength', 'perception', 'charisma', 'luck'];
      const bumpStat = statKeys[Math.floor(Math.random() * statKeys.length)];
      levelledUp = c.name;
      newLevel = c.level + 1;
      return {
        ...c,
        xp: totalXp - c.xpToNext,
        level: c.level + 1,
        xpToNext: Math.floor(c.xpToNext * 1.5),
        skill: Math.min(100, c.skill + skillBump),
        stats: { ...c.stats, [bumpStat]: Math.min(20, c.stats[bumpStat] + 1) },
      };
    }
    return { ...c, xp: totalXp };
  });
  return { crew: updated, levelledUp, newLevel };
}

// Playable factions. Each has a humble starter (the common case) and a grand
// one the captain's luck unlocks. Picking tier from the captain roll avoids
// an extra dice and ties ship quality to a stat the player can see. Omani
// and Chinese were added in phase 2 once the dhow/junk/baghla/jong meshes
// landed in shipProfiles.ts.
const PLAYABLE_FACTION_STARTS: Array<{
  faction: Nationality;
  humble: ShipInfo['type'];
  grand: ShipInfo['type'];
  homePortId: string;
}> = [
  { faction: 'English',    humble: 'Pinnace', grand: 'Galleon', homePortId: 'london'    },
  { faction: 'Portuguese', humble: 'Caravel', grand: 'Carrack', homePortId: 'lisbon'    },
  { faction: 'Dutch',      humble: 'Fluyt',   grand: 'Carrack', homePortId: 'amsterdam' },
  { faction: 'Spanish',    humble: 'Caravel', grand: 'Galleon', homePortId: 'seville'   },
  { faction: 'Venetian',   humble: 'Carrack', grand: 'Galleon', homePortId: 'venice'    },
  { faction: 'Omani',      humble: 'Dhow',    grand: 'Baghla',  homePortId: 'muscat'    },
  { faction: 'Chinese',    humble: 'Junk',    grand: 'Jong',    homePortId: 'macau'     },
];

// Weighted spawn distributions for c. 1612. A captain usually begins in the
// metropole, but overseas factories, Estado da Índia strongholds, and colonial
// entrepôts are all plausible points of origin — a Portuguese merchant might
// already be seasoned in Goa, a Dutch factor in Bantam, etc. Weights are
// historically shaped (Portuguese Estado at full stretch; VOC founded 1602;
// EIC's Surat factory opens 1612; Spanish network anchored in the Caribbean).
const FACTION_SPAWN_WEIGHTS: Partial<Record<Nationality, Array<{ portId: string; weight: number }>>> = {
  Portuguese: [
    { portId: 'lisbon',   weight: 53 },
    { portId: 'goa',      weight: 20 },
    { portId: 'macau',    weight: 10 },
    { portId: 'salvador', weight: 5  },
    { portId: 'luanda',   weight: 4  },
    { portId: 'mombasa',  weight: 3  },
    { portId: 'cape',     weight: 3  },
    // A handful of Portuguese New Christian / Sephardic merchant houses had
    // factors resident in Venice — pepper buyers working the Levantine route.
    { portId: 'venice',   weight: 2  },
  ],
  Dutch: [
    { portId: 'amsterdam', weight: 70 },
    { portId: 'bantam',    weight: 15 },
    { portId: 'surat',     weight: 8  },
    { portId: 'cape',      weight: 4  },
    { portId: 'mocha',     weight: 3  },
  ],
  English: [
    { portId: 'london',    weight: 68 },
    { portId: 'surat',     weight: 15 },
    { portId: 'bantam',    weight: 8  },
    { portId: 'jamestown', weight: 4  },
    { portId: 'cape',      weight: 3  },
    // The Levant Company (chartered 1592) maintained an English consul and
    // merchant presence in Venice through the early 17c.
    { portId: 'venice',    weight: 2  },
  ],
  Spanish: [
    { portId: 'seville',   weight: 53 },
    { portId: 'havana',    weight: 16 },
    { portId: 'cartagena', weight: 15 },
    // Manila — Spanish capital of the Philippines and Asian end of the
    // Acapulco galleon. A meaningful share of Spanish merchant captains
    // in 1612 were Pacific-side rather than Atlantic-side.
    { portId: 'manila',    weight: 14 },
    { portId: 'venice',    weight: 2  },
  ],
  Venetian: [
    { portId: 'venice',    weight: 70 },
    { portId: 'hormuz',    weight: 8  },   // Venetian merchants in Hormuz via the Levant
    { portId: 'aden',      weight: 6  },   // Red Sea pepper / coffee runs
    { portId: 'mocha',     weight: 5  },
    { portId: 'goa',       weight: 5  },   // few Venetian factors in Estado ports
    { portId: 'lisbon',    weight: 3  },
    { portId: 'surat',     weight: 3  },
  ],
  // Omani captains in 1612 sailed out of Muscat, Sur, and the Gulf/Red Sea
  // entrepôts. Hormuz is still Portuguese-held (falls 1622) but lascar
  // captains operated from it; Zanzibar/Mombasa reflect the Swahili-coast
  // dhow network. A few captains start in Surat via Gujarati-Omani links.
  Omani: [
    { portId: 'muscat',   weight: 40 },
    { portId: 'mocha',    weight: 15 },
    { portId: 'aden',     weight: 12 },
    { portId: 'hormuz',   weight: 10 },
    { portId: 'zanzibar', weight: 9  },
    { portId: 'mombasa',  weight: 6  },
    { portId: 'socotra',  weight: 4  },
    { portId: 'surat',    weight: 4  },
  ],
  // Chinese junk captains c. 1612 operated largely out of Fujian via Macau
  // (Luso-Chinese hub) and the East Indies hubs with large Chinese
  // communities. Bantam and Malacca reflect overseas-Chinese trade routes.
  Chinese: [
    { portId: 'macau',   weight: 45 },
    { portId: 'manila',  weight: 20 },  // Sangley Parián was huge — c. 20–30k Chinese in 1612
    { portId: 'bantam',  weight: 18 },
    { portId: 'malacca', weight: 12 },
    { portId: 'goa',     weight: 3  },
    { portId: 'calicut', weight: 2  },
  ],
};

function pickSpawnPort(faction: Nationality, fallback: string): string {
  const table = FACTION_SPAWN_WEIGHTS[faction];
  if (!table || table.length === 0) return fallback;
  const total = table.reduce((sum, row) => sum + row.weight, 0);
  let roll = Math.random() * total;
  for (const row of table) {
    roll -= row.weight;
    if (roll <= 0) return row.portId;
  }
  return table[table.length - 1].portId;
}

// Per-hull handling baseline. Speed is 0–25 (kn at top trim), turnSpeed is
// the existing 0–3 scale Ship.tsx already reads, windward is 0–1 (1.0 =
// can sail straight into the wind — none of these hulls hit that). Draft
// gates shallow-water crossings. maxHull is per-type so a Pinnace is less
// durable than a Galleon. maxCrew is the upper limit on hires; startMin/
// startMax give the random starting crew range for a fresh run.
const SHIP_BASE_STATS: Record<ShipInfo['type'], {
  speed: number;
  turnSpeed: number;
  windward: number;
  draft: 'shallow' | 'medium' | 'deep';
  maxHull: number;
  maxCrew: number;
  startMin: number;
  startMax: number;
}> = {
  Pinnace: { speed: 24, turnSpeed: 2.6, windward: 0.55, draft: 'shallow', maxHull:  60, maxCrew:  4, startMin: 3, startMax: 4  },
  Dhow:    { speed: 22, turnSpeed: 2.8, windward: 0.90, draft: 'shallow', maxHull:  70, maxCrew:  4, startMin: 3, startMax: 4  },
  Caravel: { speed: 21, turnSpeed: 2.5, windward: 0.78, draft: 'shallow', maxHull:  80, maxCrew:  5, startMin: 3, startMax: 5  },
  Baghla:  { speed: 18, turnSpeed: 2.2, windward: 0.82, draft: 'medium',  maxHull: 100, maxCrew:  8, startMin: 4, startMax: 7  },
  Fluyt:   { speed: 18, turnSpeed: 1.8, windward: 0.48, draft: 'medium',  maxHull: 110, maxCrew:  6, startMin: 4, startMax: 6  },
  Junk:    { speed: 17, turnSpeed: 2.0, windward: 0.65, draft: 'medium',  maxHull:  95, maxCrew:  6, startMin: 4, startMax: 6  },
  Galleon: { speed: 16, turnSpeed: 1.3, windward: 0.35, draft: 'deep',    maxHull: 160, maxCrew: 12, startMin: 6, startMax: 10 },
  Carrack: { speed: 20, turnSpeed: 1.8, windward: 0.50, draft: 'deep',    maxHull: 130, maxCrew:  8, startMin: 5, startMax: 8  },
  Jong:    { speed: 15, turnSpeed: 1.4, windward: 0.60, draft: 'deep',    maxHull: 140, maxCrew: 12, startMin: 6, startMax: 10 },
};

// Starting armament by ship type. Swivels are the universal anti-personnel
// piece and are renamed to lantaka/cetbang in Arab and Malay/Javanese
// contexts respectively — we pick the name by the starting faction in
// buildStartingArmament(). `mounted` holds broadside cannons plus any
// fixed aimable pieces (rocket racks); stats.cannons then counts only
// the non-aimable entries via WEAPON_DEFS[w].aimable. Pinnace/Dhow/
// Caravel/Fluyt carry light armaments; Carrack and Baghla walk out as
// real armed merchants; Galleon and Jong are state-scale.
const SHIP_STARTING_ARMAMENT: Record<ShipInfo['type'], {
  swivelMin: number;
  swivelMax: number;
  mounted: WeaponType[];
}> = {
  Pinnace: { swivelMin: 1, swivelMax: 1, mounted: [] },
  Dhow:    { swivelMin: 0, swivelMax: 1, mounted: [] },
  Caravel: { swivelMin: 1, swivelMax: 2, mounted: ['minion', 'minion'] },
  Fluyt:   { swivelMin: 1, swivelMax: 1, mounted: ['minion', 'minion'] },
  // Junk/Jong come off the dock with a rocket rack — a small one on the
  // junk, a proper launcher on the Jong. Signature ranged weapon.
  Junk:    { swivelMin: 1, swivelMax: 2, mounted: ['minion', 'fireRocket'] },
  Baghla:  { swivelMin: 2, swivelMax: 2, mounted: ['minion', 'minion'] },
  Carrack: { swivelMin: 2, swivelMax: 2, mounted: ['minion', 'minion', 'saker'] },
  Jong:    { swivelMin: 2, swivelMax: 3, mounted: ['minion', 'minion', 'fireRocket'] },
  Galleon: { swivelMin: 3, swivelMax: 3, mounted: ['minion', 'minion', 'saker', 'saker', 'demiCulverin'] },
};

/** Pick the swivel-family weapon appropriate to the ship's faction — Omani
 *  captains carry lantakas, Chinese captains carry cetbangs, everyone else
 *  gets the generic European swivel gun. Purely cosmetic: stats are the
 *  same for all three. */
function factionSwivelType(faction: Nationality): WeaponType {
  if (faction === 'Omani') return 'lantaka';
  if (faction === 'Chinese') return 'cetbang';
  return 'swivelGun';
}

function buildStartingArmament(type: ShipInfo['type'], faction: Nationality): WeaponType[] {
  const cfg = SHIP_STARTING_ARMAMENT[type];
  const range = cfg.swivelMax - cfg.swivelMin + 1;
  const swivelCount = cfg.swivelMin + Math.floor(Math.random() * range);
  const swivelType = factionSwivelType(faction);
  return [
    ...Array(swivelCount).fill(swivelType),
    ...cfg.mounted,
  ];
}

// Per-ship starting hold (tons) and purse (reals). Humble ships reflect a
// minor merchant's capital; grand ships imply investor/state backing and a
// fuller hold. Dhow/Baghla (Omani) and Junk/Jong (Chinese) are the
// non-European playable tiers.
const SHIP_START_PROFILE: Record<ShipInfo['type'], { cargoCapacity: number; gold: number }> = {
  Pinnace: { cargoCapacity: 50,  gold: 600  },
  Caravel: { cargoCapacity: 65,  gold: 700  },
  Fluyt:   { cargoCapacity: 120, gold: 1050 },
  Carrack: { cargoCapacity: 140, gold: 1400 },
  Galleon: { cargoCapacity: 130, gold: 1500 },
  Dhow:    { cargoCapacity: 60,  gold: 600  },
  Baghla:  { cargoCapacity: 110, gold: 1200 },
  Junk:    { cargoCapacity: 95,  gold: 800  },
  Jong:    { cargoCapacity: 150, gold: 1400 },
};

const _factionStart = PLAYABLE_FACTION_STARTS[Math.floor(Math.random() * PLAYABLE_FACTION_STARTS.length)];
const _startingFaction: Nationality = _factionStart.faction;
const _startingPortId = pickSpawnPort(_startingFaction, _factionStart.homePortId);

// Roll the captain first so we can check luck before picking the ship tier,
// then use the same captain in the full crew (keeps luck consistent across
// ship-tier selection and the cargo roll).
const _startingCaptain = generateStartingCaptain(_startingFaction);
const _captainLuck = _startingCaptain.stats.luck ?? 10;

// Captain luck is 1–20. Threshold 17 ≈ top ~20% of rolls upgrades the starter.
const _luckyStart = _captainLuck >= 17;
const _startingShipType: ShipInfo['type'] = _luckyStart ? _factionStart.grand : _factionStart.humble;

const _baseStats = SHIP_BASE_STATS[_startingShipType];
const _crewRangeSize = _baseStats.startMax - _baseStats.startMin + 1;
const _startingCrewSize = _baseStats.startMin + Math.floor(Math.random() * _crewRangeSize);
const _startingCrew = generateStartingCrew(_startingFaction, _startingCrewSize, _startingCaptain);

const _shipNamePool = SHIP_NAMES[_startingShipType];
const _startingShipName = _shipNamePool[Math.floor(Math.random() * _shipNamePool.length)];

const _shipProfile = SHIP_START_PROFILE[_startingShipType];
const _startingCargoCapacity = _shipProfile.cargoCapacity;
const _startingGold = _shipProfile.gold;

const _startingCargo = generateStartingCargo(_startingFaction, _startingCargoCapacity, _captainLuck);
const _startingArmament = buildStartingArmament(_startingShipType, _startingFaction);
const _startingBroadsides = _startingArmament.filter(w => !WEAPON_DEFS[w].aimable).length;

// Seed the hold with 10 war rockets if the starting ship mounts a rocket rack
// (Junk / Jong). Without this the Chinese-start player would have an inert
// weapon until reaching Macau.
if (_startingArmament.includes('fireRocket')) {
  _startingCargo['War Rockets'] = 10;
}

/** Build provenance stacks matching starting cargo. Treated as genuine goods
 *  taken on before the voyage began — no acquisition port, no fraud roll. */
function buildStartingProvenance(cargo: Record<Commodity, number>): CargoStack[] {
  const stacks: CargoStack[] = [];
  for (const [c, qty] of Object.entries(cargo)) {
    if (qty > 0) {
      stacks.push({
        id: generateId(),
        commodity: c as Commodity,
        actualCommodity: c as Commodity,
        amount: qty,
        acquiredPort: 'home',
        acquiredPortName: 'home port',
        acquiredDay: 0,
        purchasePrice: 0,
        knowledgeAtPurchase: 1,
      });
    }
  }
  return stacks;
}

export const useGameStore = create<GameState>((set, get) => ({
  playerPos: [0, 0, 0],
  playerRot: 0,
  playerVelocity: 0,
  gold: _startingGold,
  cargo: _startingCargo,
  cargoProvenance: buildStartingProvenance(_startingCargo),
  stats: {
    hull: _baseStats.maxHull,
    maxHull: _baseStats.maxHull,
    sails: 100,
    maxSails: 100,
    speed: _baseStats.speed,
    turnSpeed: _baseStats.turnSpeed,
    windward: _baseStats.windward,
    draft: _baseStats.draft,
    maxCrew: _baseStats.maxCrew,
    cargoCapacity: _startingCargoCapacity,
    cannons: _startingBroadsides,
    armament: _startingArmament,
  },
  crew: _startingCrew,
  ship: {
    name: _startingShipName,
    type: _startingShipType,
    flag: _startingFaction,
    armed: true,
  },
  ports: [],
  timeOfDay: 8, // Start at 8 AM
  notifications: [],
  activePort: null,
  cameraZoom: 50,
  cameraRotation: 0,
  viewMode: 'default',
  cycleViewMode: () => set((state) => {
    const modes: Array<'default' | 'cinematic' | 'topdown' | 'firstperson'> = ['default', 'cinematic', 'topdown', 'firstperson'];
    const idx = modes.indexOf(state.viewMode);
    return { viewMode: modes[(idx + 1) % modes.length] };
  }),
  playerMode: 'ship',
  walkingPos: [0, 5, 0],
  walkingRot: 0,
  interactionPrompt: null,
  nearestHailableNpc: null,
  discoveredPorts: [],
  reputation: {},
  npcPositions: [],
  npcShips: [],
  oceanEncounters: [],
  fishShoals: [],
  fishNetCooldown: 0,
  shipUpgrades: [],
  journalEntries: [],
  dayCount: 1,
  windDirection: Math.PI * 0.75, // start SW
  windSpeed: 0.5,
  knowledgeState: generateStartingKnowledge(_startingFaction, _startingCrew),
  provisions: 30, // starting food supply
  worldSeed: Math.floor(Math.random() * 100000),
  worldSize: 150,
  devSoloPort: null,
  currentWorldPortId: _startingPortId,
  waterPaletteSetting: 'auto',
  forceMobileLayout: false,
  shipSteeringMode: 'tap',
  touchSailRaised: false,
  renderDebug: DEFAULT_RENDER_DEBUG,
  paused: false,
  anchored: false,
  combatMode: false,
  landWeapons: ['musket', 'bow'],
  activeLandWeapon: 'musket',
  requestWorldMap: false,
  setRequestWorldMap: (v) => set({ requestWorldMap: v }),
  voyageBegun: false,
  setVoyageBegun: () => set({ voyageBegun: true }),
  captainExpression: null,
  setCaptainExpression: (expr, durationMs = 4000) => {
    set({ captainExpression: expr });
    if (expr !== null) {
      setTimeout(() => {
        // Only clear if still the same expression (avoid clobbering a newer one)
        if (get().captainExpression === expr) set({ captainExpression: null });
      }, durationMs);
    }
  },
  deadCrew: null,
  gameOver: false,
  gameOverCause: '',

  setPlayerPos: (pos) => {
    const state = get();
    syncLiveShipTransform(pos, state.playerRot, state.playerVelocity);
    set({ playerPos: pos });
  },
  setPlayerRot: (rot) => {
    const state = get();
    syncLiveShipTransform(state.playerPos, rot, state.playerVelocity);
    set({ playerRot: rot });
  },
  setPlayerVelocity: (vel) => {
    const state = get();
    syncLiveShipTransform(state.playerPos, state.playerRot, vel);
    set({ playerVelocity: vel });
  },
  setPlayerTransform: ({ pos, rot, vel }) => {
    syncLiveShipTransform(pos, rot, vel);
    set({
      playerPos: pos,
      playerRot: rot,
      playerVelocity: vel,
    });
  },
  setPlayerMode: (mode) => {
    syncLivePlayerMode(mode);
    set({ playerMode: mode });
  },
  setWalkingPos: (pos) => {
    const state = get();
    syncLiveWalkingTransform(pos, state.walkingRot);
    set({ walkingPos: pos });
  },
  setWalkingRot: (rot) => {
    const state = get();
    syncLiveWalkingTransform(state.walkingPos, rot);
    set({ walkingRot: rot });
  },
  setWalkingTransform: ({ pos, rot }) => {
    syncLiveWalkingTransform(pos, rot);
    set({
      walkingPos: pos,
      walkingRot: rot,
    });
  },
  setInteractionPrompt: (prompt) => set({ interactionPrompt: prompt }),
  setNearestHailableNpc: (npc) => set({ nearestHailableNpc: npc }),
  adjustReputation: (nationality, delta) => {
    const state = get();
    const current = state.reputation[nationality] ?? 0;
    const clamped = Math.max(-100, Math.min(100, current + delta));
    const prev = current;
    set({ reputation: { ...state.reputation, [nationality]: clamped } });
    // Journal entries at reputation thresholds
    if (prev >= -25 && clamped < -25) {
      get().addJournalEntry('encounter',
        `Word has spread among the ${nationality} that we are not to be trusted. Their ships give us a wide berth.`);
    } else if (prev >= -60 && clamped < -60) {
      get().addJournalEntry('encounter',
        `The ${nationality} now regard us with open hostility. We must tread carefully in their waters.`);
    } else if (prev <= 25 && clamped > 25) {
      get().addJournalEntry('encounter',
        `We are gaining a reputation as fair dealers among the ${nationality}. Their captains greet us warmly.`);
    } else if (prev <= 60 && clamped > 60) {
      get().addJournalEntry('encounter',
        `The ${nationality} hold us in high esteem. Their harbors welcome us as trusted allies.`);
    }
  },
  getReputation: (nationality) => get().reputation[nationality] ?? 0,
  setNpcPositions: (positions) => set({ npcPositions: positions }),
  setNpcShips: (ships) => set({ npcShips: ships }),
  setOceanEncounters: (encounters) => set({ oceanEncounters: encounters }),
  setFishShoals: (shoals) => set({ fishShoals: shoals }),
  scatterShoal: (shoalIdx) => set((state) => ({
    fishShoals: state.fishShoals.map((s, i) =>
      i === shoalIdx ? { ...s, scattered: true, lastFished: Date.now(), count: Math.max(0, s.count - Math.ceil(s.maxCount * 0.6)) } : s
    ),
  })),
  tickFishRespawn: () => {
    const state = get();
    if (!state.fishShoals.some((shoal) => shoal.scattered && shoal.lastFished > 0)) return;
    const now = Date.now();
    const RESPAWN_MS = 60_000; // 60 real-time seconds
    let changed = false;
    const updated = state.fishShoals.map((s) => {
      if (s.scattered && s.lastFished > 0 && now - s.lastFished > RESPAWN_MS) {
        changed = true;
        return { ...s, scattered: false, count: s.maxCount };
      }
      return s;
    });
    if (changed) set({ fishShoals: updated });
  },

  damageShip: (amount) => {
    const state = get();
    const reduction = captainHasTrait(state, 'Battle Hardened') ? 0.85 : 1.0;
    const effectiveAmount = Math.max(1, Math.floor(amount * reduction));
    const newHull = Math.max(0, state.stats.hull - effectiveAmount);
    // Crew morale drops by 1 each time the hull takes damage
    const updatedCrew = state.crew.map(c => ({
      ...c,
      morale: Math.max(0, c.morale - 1),
    }));
    set({ stats: { ...state.stats, hull: newHull }, crew: updatedCrew });
    get().addJournalEntry('ship', shipDamageTemplate(amount, newHull));
    // Log event to a random crew member
    if (state.crew.length > 0) {
      const witness = state.crew[Math.floor(Math.random() * state.crew.length)];
      get().addCrewHistory(witness.id, `Ship took ${amount} hull damage in an engagement`);
    }
    // Captain reacts to damage
    get().setCaptainExpression(newHull < 30 ? 'Stern' : 'Fierce', 3000);
    if (newHull <= 0) {
      get().triggerGameOver('The ship has been destroyed and sank beneath the waves.');
    }
  },

  repairShip: (amount, cost) => {
    const state = get();
    if (state.gold >= cost && state.stats.hull < state.stats.maxHull) {
      const newHull = Math.min(state.stats.maxHull, state.stats.hull + amount);
      set({
        gold: state.gold - cost,
        stats: { ...state.stats, hull: newHull }
      });
      const portName = state.activePort?.name ?? 'port';
      get().addJournalEntry('ship', shipRepairTemplate(amount, cost, portName), portName);
    }
  },
  
  setCrewRole: (crewId, role) => {
    const state = get();
    const member = state.crew.find(c => c.id === crewId);
    const oldRole = member?.role;
    // If promoting to Captain, demote the current captain to Sailor
    const updatedCrew = state.crew.map(c => {
      if (c.id === crewId) return { ...c, role };
      if (role === 'Captain' && c.role === 'Captain') return { ...c, role: 'Sailor' as CrewRole };
      return c;
    });
    set({ crew: updatedCrew });
    if (member && oldRole && oldRole !== role) {
      get().addCrewHistory(crewId, `Reassigned from ${oldRole} to ${role}`);
      if (role === 'Captain') {
        const demoted = state.crew.find(c => c.role === 'Captain' && c.id !== crewId);
        if (demoted) get().addCrewHistory(demoted.id, `Demoted from Captain to Sailor`);
      }
    }
  },

  addCrewHistory: (crewId, event) => set((state) => ({
    crew: state.crew.map(c => c.id === crewId
      ? { ...c, history: [...c.history, { day: state.dayCount, event }] }
      : c
    )
  })),

  discoverPort: (id) => {
    const state = get();
    if (!state.discoveredPorts.includes(id)) {
      const port = state.ports.find(p => p.id === id);
      set({ discoveredPorts: [...state.discoveredPorts, id] });
      if (port) {
        get().addNotification(`Discovered ${port.name}!`, 'success');
        get().addJournalEntry('navigation', portDiscoverTemplate(port.name), port.name);
        get().setCaptainExpression('Curious', 4000);
        sfxDiscovery();
        // Navigator and captain gain XP for discovery
        const nav = state.crew.find(c => c.role === 'Navigator');
        const cap = getCaptain(state);
        let crew = state.crew;
        if (nav) {
          const r = grantCrewXp(crew, nav.id, 15 + Math.floor(Math.random() * 10));
          crew = r.crew;
          if (r.levelledUp) get().addNotification(`${r.levelledUp} leveled up to Lvl ${r.newLevel}!`, 'success', { tier: 'event', subtitle: 'LEVEL UP' });
        }
        if (cap && cap.id !== nav?.id) {
          const r = grantCrewXp(crew, cap.id, 10);
          crew = r.crew;
          if (r.levelledUp) get().addNotification(`${r.levelledUp} leveled up to Lvl ${r.newLevel}!`, 'success', { tier: 'event', subtitle: 'LEVEL UP' });
        }
        set({ crew });
      }
    }
  },
  
  addNotification: (message, type = 'info', opts) => set((state) => {
    // Derive tier: explicit > openPortId → port > size:'grand' → event > ticker
    const tier: NotificationTier = opts?.tier
      ?? (opts?.openPortId ? 'port' : (opts?.size === 'grand' ? 'event' : 'ticker'));

    const now = Date.now();

    // Dedupe: if an identical toast is already live, refresh its timestamp
    // (bumps its visible duration) instead of stacking a duplicate.
    // - port: same openPortId within 10s
    // - other: same message+tier within 2s (strict-mode double-fire guard)
    const DEDUPE_PORT_MS = 10_000;
    const DEDUPE_MSG_MS = 2_000;
    const dupIdx = state.notifications.findIndex(n => {
      if (opts?.openPortId && n.openPortId === opts.openPortId && now - n.timestamp < DEDUPE_PORT_MS) return true;
      if (n.message === message && n.tier === tier && now - n.timestamp < DEDUPE_MSG_MS) return true;
      return false;
    });
    if (dupIdx >= 0) {
      const bumped = state.notifications.map((n, i) => i === dupIdx ? { ...n, timestamp: now } : n);
      return { notifications: bumped };
    }

    const incoming: Notification = {
      id: generateId(), message, type, tier, timestamp: now,
      subtitle: opts?.subtitle, imageCandidates: opts?.imageCandidates, openPortId: opts?.openPortId,
    };

    // Per-tier cap: port 1, event 2, ticker 3. Evict oldest within tier.
    const CAPS: Record<NotificationTier, number> = { port: 1, event: 2, ticker: 3 };
    const next = [...state.notifications, incoming];
    const byTier: Record<NotificationTier, Notification[]> = { port: [], event: [], ticker: [] };
    for (const n of next) byTier[n.tier].push(n);
    const trimmed = (['port', 'event', 'ticker'] as NotificationTier[])
      .flatMap(t => byTier[t].slice(-CAPS[t]))
      .sort((a, b) => a.timestamp - b.timestamp);

    return { notifications: trimmed };
  }),
  
  removeNotification: (id) => set((state) => ({
    notifications: state.notifications.filter(n => n.id !== id)
  })),

  addJournalEntry: (category, message, portName) => set((state) => ({
    journalEntries: [...state.journalEntries, {
      id: generateId(),
      day: state.dayCount,
      timeOfDay: state.timeOfDay,
      category,
      message,
      portName,
      notes: [],
    }]
  })),

  addJournalNote: (entryId, text) => set((state) => ({
    journalEntries: state.journalEntries.map(e =>
      e.id === entryId
        ? { ...e, notes: [...e.notes, { id: generateId(), text, timestamp: Date.now() }] }
        : e
    )
  })),
  
  setActivePort: (port) => set({ activePort: port }),
  
  buyCommodity: (commodity, amount) => {
    const state = get();
    const port = state.activePort;
    if (!port) return;

    // Knowledge-aware pricing
    const knowledgeLevel = getEffectiveKnowledge(commodity, state.knowledgeState, state.crew);

    // Calculate effective price with supply/demand + crew bonuses
    const sdMod = supplyDemandModifier(port.inventory[commodity], port.baseInventory[commodity]);
    const effectiveBase = Math.max(1, Math.round(port.basePrices[commodity] * sdMod));
    const factorDiscount = getRoleBonus(state, 'Factor', 'charisma');
    const traitDiscount = captainHasTrait(state, 'Silver Tongue') ? 0.95 : 1.0;

    // Unknown goods are cheap — sellers exploit your ignorance by offering low prices
    // (they assume you don't know the value and will accept any price)
    const unknownDiscount = knowledgeLevel === 0 ? getUnknownBuyDiscount() : 1.0;

    const price = Math.max(1, Math.floor(effectiveBase / factorDiscount * traitDiscount * unknownDiscount));
    const totalCost = price * amount;

    const commodityWeight = COMMODITY_DEFS[commodity].weight;
    const currentCargoWeight = Object.entries(state.cargo).reduce(
      (sum, [c, qty]) => sum + qty * COMMODITY_DEFS[c as Commodity].weight, 0
    );
    if (currentCargoWeight + amount * commodityWeight > state.stats.cargoCapacity) {
      get().addNotification('Not enough cargo space!', 'warning');
      return;
    }

    // War Rockets are bulky and volatile — the hold can only take 20 before
    // the magazine is considered full.
    if (commodity === 'War Rockets' && (state.cargo['War Rockets'] ?? 0) + amount > 20) {
      get().addNotification('Magazine full — hold caps at 20 war rockets.', 'warning');
      return;
    }

    if (state.gold >= totalCost && port.inventory[commodity] >= amount) {
      const newInventory = { ...port.inventory, [commodity]: port.inventory[commodity] - amount };
      // Recalculate prices based on new inventory levels
      const newPrices = { ...port.prices };
      for (const c of ALL_COMMODITIES_FULL) {
        if (port.basePrices[c] > 0) {
          const mod = supplyDemandModifier(newInventory[c], port.baseInventory[c]);
          newPrices[c] = Math.max(1, Math.round(port.basePrices[c] * mod));
        }
      }

      // Roll purchase outcome: only blind (Level 0) buys can be fraudulent or
      // serendipitous. Identified buys are always genuine.
      const outcome = knowledgeLevel === 0
        ? rollPurchaseOutcome(commodity, port.id, MARKET_TRUST[port.id] ?? 0.5)
        : { kind: 'genuine' as const };
      const actualCommodity = outcome.kind === 'genuine' ? commodity : outcome.actual;

      const newStack: CargoStack = {
        id: generateId(),
        commodity,
        actualCommodity,
        amount,
        acquiredPort: port.id,
        acquiredPortName: port.name,
        acquiredDay: state.dayCount,
        purchasePrice: price,
        knowledgeAtPurchase: knowledgeLevel,
      };

      set({
        gold: state.gold - totalCost,
        cargo: { ...state.cargo, [commodity]: state.cargo[commodity] + amount },
        cargoProvenance: [...state.cargoProvenance, newStack],
        activePort: { ...port, inventory: newInventory, prices: newPrices },
        ports: state.ports.map(p => p.id === port.id
          ? { ...p, inventory: newInventory, prices: newPrices }
          : p
        ),
      });

      const displayName = knowledgeLevel >= 1
        ? commodity
        : COMMODITY_DEFS[commodity].physicalDescription;
      get().addNotification(`Bought ${amount} ${displayName} for ${totalCost}g`, 'success');
      get().addJournalEntry('commerce', commerceBuyTemplate(commodity, amount, totalCost, port.name), port.name);
      const faction = PORT_FACTION[port.id];
      if (faction) get().adjustReputation(faction, 2);
      const factor = state.crew.find(c => c.role === 'Factor') ?? state.crew.find(c => c.role === 'Captain');
      if (factor) {
        get().addCrewHistory(factor.id, `Negotiated purchase of ${amount} ${displayName} at ${port.name}`);
        const tradeXp = 3 + Math.floor(totalCost / 100);
        const r = grantCrewXp(get().crew, factor.id, tradeXp);
        set({ crew: r.crew });
        if (r.levelledUp) get().addNotification(`${r.levelledUp} leveled up to Lvl ${r.newLevel}!`, 'success', { tier: 'event', subtitle: 'LEVEL UP' });
      }
    } else {
      get().addNotification('Not enough gold or port inventory!', 'error');
    }
  },
  
  sellCommodity: (commodity, amount) => {
    const state = get();
    const port = state.activePort;
    if (!port) return;
    if (state.cargo[commodity] < amount) return;

    const factorBonus = getRoleBonus(state, 'Factor', 'charisma');
    const traitBonus = captainHasTrait(state, 'Silver Tongue') ? 1.05 : 1.0;

    /** Compute per-unit sell price for any commodity at this port, applying
     *  the standard factor/trait/mastery modifiers. Used for both the claimed
     *  good and (on fraud/windfall) the revealed actual good. */
    const perUnitSellPrice = (c: Commodity): number => {
      const level = getEffectiveKnowledge(c, state.knowledgeState, state.crew);
      const portHas = port.basePrices[c] > 0;
      const sdMod = portHas
        ? supplyDemandModifier(port.inventory[c], port.baseInventory[c])
        : 1.0;
      const base = portHas
        ? Math.max(1, Math.round(port.basePrices[c] * sdMod))
        : Math.max(1, Math.round(
            (COMMODITY_DEFS[c].basePrice[0] + COMMODITY_DEFS[c].basePrice[1]) / 2 * 0.5
          ));
      const mastery = level >= 2 ? getMasterySellBonus() : 1.0;
      return Math.max(1, Math.floor(base * 0.8 * factorBonus * traitBonus * mastery));
    };

    // Walk provenance stacks FIFO, consume `amount` total units, group by
    // actualCommodity so reveals can be priced and announced per-revealed-good.
    const consumed: { stack: CargoStack; taken: number }[] = [];
    const newProvenance: CargoStack[] = [];
    let remaining = amount;
    for (const stack of state.cargoProvenance) {
      if (stack.commodity !== commodity || remaining <= 0) {
        newProvenance.push(stack);
        continue;
      }
      const take = Math.min(stack.amount, remaining);
      consumed.push({ stack, taken: take });
      remaining -= take;
      const left = stack.amount - take;
      if (left > 0) newProvenance.push({ ...stack, amount: left });
    }
    // Safety: if provenance is out of sync (shouldn't happen), fall back to
    // treating the shortfall as genuine at the claimed price.
    if (remaining > 0) {
      consumed.push({
        stack: {
          id: generateId(), commodity, actualCommodity: commodity,
          amount: remaining, acquiredPort: 'unknown', acquiredPortName: 'unknown',
          acquiredDay: 0, purchasePrice: 0, knowledgeAtPurchase: 1,
        },
        taken: remaining,
      });
      remaining = 0;
    }

    // Compute actual gain and collect reveal events.
    let totalGain = 0;
    type Reveal = { stack: CargoStack; taken: number; claimedUnitPrice: number; actualUnitPrice: number };
    const reveals: Reveal[] = [];
    const claimedUnitPrice = perUnitSellPrice(commodity);
    const newKnowledge = { ...state.knowledgeState };
    for (const { stack, taken } of consumed) {
      const actual = stack.actualCommodity;
      if (actual === commodity) {
        totalGain += claimedUnitPrice * taken;
      } else {
        const actualUnitPrice = perUnitSellPrice(actual);
        totalGain += actualUnitPrice * taken;
        reveals.push({ stack, taken, claimedUnitPrice, actualUnitPrice });
        // A reveal teaches the player what the actual good is.
        if ((newKnowledge[actual] ?? 0) < 1) newKnowledge[actual] = 1;
      }
    }

    // Port inventory increases by the CLAIMED commodity — the buyer still
    // thinks that's what they received (the player only learns on sale). This
    // is a small simplification we can tighten later.
    const newInventory = { ...port.inventory, [commodity]: port.inventory[commodity] + amount };
    const newPrices = { ...port.prices };
    for (const c of ALL_COMMODITIES_FULL) {
      if (port.basePrices[c] > 0) {
        const mod = supplyDemandModifier(newInventory[c], port.baseInventory[c]);
        newPrices[c] = Math.max(1, Math.round(port.basePrices[c] * mod));
      }
    }

    set({
      gold: state.gold + totalGain,
      cargo: { ...state.cargo, [commodity]: state.cargo[commodity] - amount },
      cargoProvenance: newProvenance,
      knowledgeState: newKnowledge,
      activePort: { ...port, inventory: newInventory, prices: newPrices },
      ports: state.ports.map(p => p.id === port.id
        ? { ...p, inventory: newInventory, prices: newPrices }
        : p
      ),
    });

    // Standard sell notification + journal for the honest portion.
    get().addNotification(`Sold ${amount} ${commodity} for ${totalGain}g`, 'success');
    get().addJournalEntry('commerce', commerceSellTemplate(commodity, amount, totalGain, port.name), port.name);

    // Reveals: one notification + journal entry per mislabeled stack consumed.
    for (const r of reveals) {
      const { stack, taken, claimedUnitPrice, actualUnitPrice } = r;
      const delta = (actualUnitPrice - claimedUnitPrice) * taken;
      if (delta < 0) {
        const loss = -delta;
        get().addNotification(
          `"${stack.commodity}" from ${stack.acquiredPortName} was actually ${stack.actualCommodity} — ${loss}g lost`,
          'warning',
          { tier: 'event', subtitle: 'FRAUD REVEALED' },
        );
        get().addJournalEntry(
          'commerce',
          fraudRevealTemplate(stack.commodity, stack.actualCommodity, taken, stack.acquiredPortName, port.name, loss),
          port.name,
        );
      } else {
        get().addNotification(
          `"${stack.commodity}" from ${stack.acquiredPortName} was actually ${stack.actualCommodity} — +${delta}g beyond expectation`,
          'success',
          { tier: 'event', subtitle: 'WINDFALL' },
        );
        get().addJournalEntry(
          'commerce',
          windfallRevealTemplate(stack.commodity, stack.actualCommodity, taken, stack.acquiredPortName, port.name, delta),
          port.name,
        );
      }
    }

    const faction = PORT_FACTION[port.id];
    if (faction) get().adjustReputation(faction, 2);
    const factor = state.crew.find(c => c.role === 'Factor') ?? state.crew.find(c => c.role === 'Captain');
    if (factor) {
      get().addCrewHistory(factor.id, `Sold ${amount} ${commodity} for ${totalGain}g at ${port.name}`);
      const tradeXp = 3 + Math.floor(totalGain / 80);
      const r = grantCrewXp(get().crew, factor.id, tradeXp);
      set({ crew: r.crew });
      if (r.levelledUp) get().addNotification(`${r.levelledUp} leveled up to Lvl ${r.newLevel}!`, 'success', { tier: 'event', subtitle: 'LEVEL UP' });
    }
    // Captain reacts to profitable sale
    get().setCaptainExpression(totalGain >= 200 ? 'Smug' : 'Friendly', 3000);
  },
  
  advanceTime: (delta) => {
    const state = get();
    const newTime = state.timeOfDay + delta;
    const wrapped = newTime >= 24;

    // Wind drifts slowly over time using sine waves at different frequencies
    const t = state.dayCount + newTime / 24;
    const dirDrift = Math.sin(t * 0.7) * 0.3 + Math.sin(t * 1.9) * 0.15 + Math.sin(t * 4.3) * 0.05;
    const newWindDir = (state.windDirection + dirDrift * delta * 0.02) % (Math.PI * 2);
    const speedBase = 0.55 + Math.sin(t * 0.5) * 0.25 + Math.sin(t * 1.7) * 0.1 + Math.sin(t * 3.1) * 0.05;
    const newWindSpeed = Math.max(0.1, Math.min(1, speedBase));

    set({
      timeOfDay: newTime % 24,
      dayCount: wrapped ? state.dayCount + 1 : state.dayCount,
      windDirection: newWindDir < 0 ? newWindDir + Math.PI * 2 : newWindDir,
      windSpeed: newWindSpeed,
    });

    // ── Daily tick: port restock (goods drift back toward baseline) ──
    if (wrapped) {
      const restockedPorts = state.ports.map(p => {
        let changed = false;
        const newInv = { ...p.inventory };
        for (const c of ALL_COMMODITIES_FULL) {
          const base = p.baseInventory[c as Commodity];
          if (base <= 0) continue;
          const current = newInv[c as Commodity];
          if (current < base) {
            // Restock ~3-5% of deficit per day (cheaper goods restock faster)
            const def = COMMODITY_DEFS[c as Commodity];
            const rate = def.tier <= 2 ? 0.05 : def.tier <= 3 ? 0.03 : 0.01;
            const restock = Math.max(1, Math.ceil((base - current) * rate));
            newInv[c as Commodity] = Math.min(base, current + restock);
            changed = true;
          }
        }
        if (!changed) return p;
        const newPrices = { ...p.prices };
        for (const c of ALL_COMMODITIES_FULL) {
          if (p.basePrices[c as Commodity] > 0) {
            const mod = supplyDemandModifier(newInv[c as Commodity], p.baseInventory[c as Commodity]);
            newPrices[c as Commodity] = Math.max(1, Math.round(p.basePrices[c as Commodity] * mod));
          }
        }
        return { ...p, inventory: newInv, prices: newPrices };
      });
      set({ ports: restockedPorts });
      if (state.activePort) {
        const updated = restockedPorts.find(p => p.id === state.activePort!.id);
        if (updated) set({ activePort: updated });
      }
    }

    // ── Daily tick: provisions & crew health (runs once per game-day) ──
    if (wrapped && state.crew.length > 0) {
      const crewCount = state.crew.length;
      // Each crew member eats ~0.5 provisions per day
      const dailyConsumption = Math.ceil(crewCount * 0.5);
      const hasSurgeon = state.crew.some(c => c.role === 'Surgeon' && c.health === 'healthy');
      const newProvisions = Math.max(0, state.provisions - dailyConsumption);
      const starving = newProvisions === 0;

      // Update crew health & morale
      let deadCrewId: string | null = null;
      let deadCause = '';
      let healedBySurgeon = false;
      const updatedCrew = state.crew.map(c => {
        if (deadCrewId) return c; // only one death per day

        let { health, morale } = c;

        // Starvation effects
        if (starving) {
          morale = Math.max(0, morale - 3);
          // Healthy crew get scurvy; already-sick crew worsen
          if (health === 'healthy' && Math.random() < 0.15) {
            health = 'scurvy';
          } else if (health === 'scurvy' && Math.random() < 0.12) {
            health = 'fevered';
          }
        }

        // Sick/injured crew degrade over time (even with food)
        if (health === 'fevered' && Math.random() < 0.08) {
          deadCrewId = c.id;
          deadCause = 'A burning fever took hold and would not break.';
          return c;
        }
        if (health === 'scurvy' && starving && Math.random() < 0.04) {
          deadCrewId = c.id;
          deadCause = 'Weakened by scurvy and starvation, the sea claimed another.';
          return c;
        }

        // Surgeon heals one sick crew member per day (not starvation-related)
        if (hasSurgeon && health !== 'healthy' && !starving && Math.random() < 0.2) {
          health = 'healthy';
          healedBySurgeon = true;
        }

        // Natural morale recovery when well-fed and healthy
        if (!starving && health === 'healthy') {
          morale = Math.min(100, morale + 1);
        }

        // Zero morale + sick = death risk
        if (morale === 0 && health !== 'healthy' && Math.random() < 0.06) {
          deadCrewId = c.id;
          deadCause = 'Broken in spirit and wracked by illness, he could endure no more.';
          return c;
        }

        return { ...c, health, morale };
      });

      set({ provisions: newProvisions, crew: updatedCrew });

      // Surgeon gains XP for healing
      if (healedBySurgeon) {
        const surgeon = get().crew.find(c => c.role === 'Surgeon');
        if (surgeon) {
          const r = grantCrewXp(get().crew, surgeon.id, 8 + Math.floor(Math.random() * 5));
          set({ crew: r.crew });
          if (r.levelledUp) get().addNotification(`${r.levelledUp} leveled up to Lvl ${r.newLevel}!`, 'success', { tier: 'event', subtitle: 'LEVEL UP' });
        }
      }

      // Starvation warning
      if (starving && state.provisions > 0) {
        get().addNotification('Provisions exhausted! The crew goes hungry.', 'error');
      } else if (newProvisions > 0 && newProvisions <= crewCount * 2) {
        get().addNotification(`Provisions running low (${newProvisions} remaining).`, 'warning');
      }

      // Process death (after state update so modal shows correctly)
      if (deadCrewId) {
        // Use setTimeout to avoid nested set() issues
        setTimeout(() => get().killCrewMember(deadCrewId!, deadCause), 0);
      }
    }
  },
  
  setCameraZoom: (zoom) => set({ cameraZoom: Math.max(10, Math.min(300, zoom)) }),
  setCameraRotation: (rotation) => set({ cameraRotation: rotation }),
  setViewMode: (mode) => set({ viewMode: mode }),
  
  setWorldSeed: (seed) => set({ worldSeed: seed, currentWorldPortId: null }),
  setWorldSize: (size) => set({ worldSize: size }),
  setDevSoloPort: (portId) => set({ devSoloPort: portId }),
  setWaterPaletteSetting: (setting) => set({ waterPaletteSetting: setting }),
  setForceMobileLayout: (v) => set({ forceMobileLayout: v }),
  setShipSteeringMode: (mode) => set({ shipSteeringMode: mode }),
  setTouchSailRaised: (v) => set({ touchSailRaised: v }),
  updateRenderDebug: (patch) => set((state) => ({
    renderDebug: { ...state.renderDebug, ...patch }
  })),
  resetRenderDebug: () => set({ renderDebug: DEFAULT_RENDER_DEBUG }),
  learnAboutCommodity: (commodityId, newLevel, source) => {
    const state = get();
    const current = state.knowledgeState[commodityId] ?? 0;
    if (newLevel <= current) return; // no downgrade

    const commodityName = commodityId;
    const def = COMMODITY_DEFS[commodityId as Commodity];

    set({
      knowledgeState: { ...state.knowledgeState, [commodityId]: newLevel },
    });

    if (newLevel === 1 && current === 0) {
      // Dramatic identification reveal
      get().addNotification(
        `Identified: ${commodityName}`,
        'success',
        {
          size: 'grand',
          subtitle: def?.description ?? `You now recognize this good.`,
          imageCandidates: def?.iconImage ? [def.iconImage] : undefined,
        },
      );
      get().addJournalEntry(
        'commerce',
        `Through ${source}, we identified the mysterious goods as ${commodityName}. ${def?.description ?? ''}`,
        state.activePort?.name,
      );
    } else if (newLevel === 2) {
      get().addNotification(
        `Mastered: ${commodityName}`,
        'legendary',
        {
          size: 'grand',
          subtitle: 'You know the best markets and can spot any fraud.',
          imageCandidates: def?.iconImage ? [def.iconImage] : undefined,
        },
      );
      get().addJournalEntry(
        'commerce',
        `Our expertise in ${commodityName} is now complete. We know the finest grades, the best buyers, and every trick of adulteration.`,
        state.activePort?.name,
      );
    }
  },
  collectCrab: () => {
    const state = get();
    const loot = rollLoot(CRAB_LOOT);
    set({ provisions: state.provisions + loot.amount });
    get().addNotification(loot.message, loot.type, {
      size: loot.toastSize,
      subtitle: loot.toastSubtitle,
    });
    sfxCrabCollect();
    playLootSfx(loot.tier);
  },
  fastTravel: (portId, opts) => {
    const state = get();
    const port = getWorldPortById(portId);
    if (!port) return;
    const currentPortId = resolveCampaignPortId(state);
    if (portId === currentPortId) return;
    if (!opts?.force && !canDirectlySail(currentPortId, portId)) {
      get().addNotification(`No direct sea lane to ${port.name} from this harbor.`, 'warning');
      return;
    }
    const travel = estimateSeaTravel(currentPortId, portId);
    const travelDays = travel?.days ?? 1;
    // Consume provisions for the journey
    const dailyConsumption = Math.ceil(state.crew.length * 0.5);
    const travelProvisions = dailyConsumption * travelDays;
    const newProvisions = Math.max(0, state.provisions - travelProvisions);
    set({
      currentWorldPortId: portId,
      playerVelocity: 0,
      playerMode: 'ship',
      activePort: null,
      interactionPrompt: null,
      dayCount: state.dayCount + travelDays,
      timeOfDay: 8,
      provisions: newProvisions,
    });
    syncLiveShipTransform(state.playerPos, state.playerRot, 0);
    const provWarn = newProvisions === 0 ? ' Provisions exhausted!' : newProvisions <= state.crew.length * 2 ? ` Provisions low (${newProvisions}).` : '';
    get().addNotification(`Arrived at ${port.name} after ${travelDays} days at sea.${provWarn}`, newProvisions === 0 ? 'warning' : 'success');
    get().addJournalEntry(
      'navigation',
      `After ${travelDays} days sailing, we have arrived at ${port.name}. The crew is relieved to see land again.`,
      port.name,
    );
  },
  setPaused: (paused) => set({ paused }),
  setAnchored: (anchored) => set({ anchored }),
  setCombatMode: (combatMode) => set({ combatMode }),
  setActiveLandWeapon: (w) => {
    const state = get();
    if (!state.landWeapons.includes(w)) return;
    set({ activeLandWeapon: w });
  },
  cycleLandWeapon: () => {
    const state = get();
    if (state.landWeapons.length < 2) return;
    const idx = state.landWeapons.indexOf(state.activeLandWeapon);
    const next = state.landWeapons[(idx + 1) % state.landWeapons.length];
    set({ activeLandWeapon: next });
  },
  buyUpgrade: (upgradeType) => {
    const state = get();
    const upgrade = SHIP_UPGRADES[upgradeType];
    if (state.gold < upgrade.price) {
      get().addNotification('Not enough gold!', 'warning');
      return;
    }
    if (state.shipUpgrades.includes(upgradeType)) {
      get().addNotification('Already installed!', 'warning');
      return;
    }
    // Apply stat changes
    const statChanges = upgrade.apply(state.stats);
    const newStats = { ...state.stats, ...statChanges };
    // Special case: betterProvisions adds provisions directly
    const provBonus = upgradeType === 'betterProvisions' ? 25 : 0;
    set({
      gold: state.gold - upgrade.price,
      stats: newStats,
      shipUpgrades: [...state.shipUpgrades, upgradeType],
      provisions: state.provisions + provBonus,
    });
    get().addNotification(`Installed ${upgrade.name}. ${upgrade.effect}.`, 'success');
    const portName = state.activePort?.name ?? 'port';
    get().addJournalEntry('ship', `Purchased ${upgrade.name} at ${portName} for ${upgrade.price} gold. ${upgrade.description}`, portName);
  },
  buyWeapon: (weaponType) => {
    const state = get();
    const price = WEAPON_PRICES[weaponType];
    const def = WEAPON_DEFS[weaponType];
    if (state.gold < price) {
      get().addNotification('Not enough gold!', 'warning');
      return;
    }
    // Check max cannon slots
    const broadsideCount = state.stats.armament.filter(w => !WEAPON_DEFS[w].aimable).length;
    const maxCannons = MAX_CANNONS[state.ship.type] ?? 6;
    if (!def.aimable && broadsideCount >= maxCannons) {
      get().addNotification(`No room! ${state.ship.type} can mount ${maxCannons} broadside guns max.`, 'warning');
      return;
    }
    // Check cargo weight
    const currentWeight = state.stats.armament.reduce((sum, w) => sum + WEAPON_DEFS[w].weight, 0);
    if (currentWeight + def.weight > state.stats.cargoCapacity * 0.5) {
      get().addNotification('Too heavy — guns would overload the ship.', 'warning');
      return;
    }
    const newArmament = [...state.stats.armament, weaponType];
    const newCannons = newArmament.filter(w => !WEAPON_DEFS[w].aimable).length;
    set({
      gold: state.gold - price,
      stats: { ...state.stats, armament: newArmament, cannons: newCannons },
    });
    get().addNotification(`Mounted a ${def.name}. (${newCannons} broadside guns)`, 'success');
    get().addJournalEntry('ship', `Purchased and mounted a ${def.name} at the shipyard for ${price} gold.`);
  },
  sellWeapon: (weaponType) => {
    const state = get();
    const idx = state.stats.armament.indexOf(weaponType);
    if (idx === -1) return;
    // Can't sell your only swivel gun
    if (weaponType === 'swivelGun' && state.stats.armament.filter(w => w === 'swivelGun').length <= 1) {
      get().addNotification("Can't sell your only swivel gun!", 'warning');
      return;
    }
    const sellPrice = Math.floor(WEAPON_PRICES[weaponType] * 0.5);
    const newArmament = [...state.stats.armament];
    newArmament.splice(idx, 1);
    const newCannons = newArmament.filter(w => !WEAPON_DEFS[w].aimable).length;
    set({
      gold: state.gold + sellPrice,
      stats: { ...state.stats, armament: newArmament, cannons: newCannons },
    });
    get().addNotification(`Sold a ${WEAPON_DEFS[weaponType].name} for ${sellPrice} gold.`, 'success');
  },
  defeatedNpc: (npcId, shipName, flag, npcCargo) => {
    const state = get();
    // Gold reward based on cargo value
    const goldReward = 50 + Math.floor(Math.random() * 100);
    // Transfer salvageable cargo (30-60% of each commodity)
    const currentCargo = { ...state.cargo };
    const currentTotal = Object.values(currentCargo).reduce((a, b) => a + b, 0);
    const capacity = state.stats.cargoCapacity;
    const salvaged: string[] = [];
    const salvageProvenance: CargoStack[] = [];
    for (const [comm, qty] of Object.entries(npcCargo)) {
      if (qty && qty > 0) {
        const salvageAmt = Math.max(1, Math.floor(qty * (0.3 + Math.random() * 0.3)));
        const spaceLeft = capacity - (currentTotal + salvaged.length);
        const taken = Math.min(salvageAmt, spaceLeft);
        if (taken > 0) {
          currentCargo[comm as Commodity] = (currentCargo[comm as Commodity] || 0) + taken;
          salvaged.push(`${taken} ${comm}`);
          // Salvaged goods are always genuine — the player sees what was in the hold.
          salvageProvenance.push({
            id: generateId(),
            commodity: comm as Commodity,
            actualCommodity: comm as Commodity,
            amount: taken,
            acquiredPort: `wreck:${npcId}`,
            acquiredPortName: `the ${shipName}`,
            acquiredDay: state.dayCount,
            purchasePrice: 0,
            knowledgeAtPurchase: 1,
          });
        }
      }
    }
    // XP reward — captain and gunner both gain combat XP, all crew get a small share
    const captainXp = 20 + Math.floor(Math.random() * 30);
    const combatXp = 15 + Math.floor(Math.random() * 20);
    const crewXp = 5 + Math.floor(Math.random() * 10);
    let updatedCrew = state.crew;
    const levelUps: string[] = [];

    // Captain XP
    const captain = getCaptain(state);
    if (captain) {
      const r = grantCrewXp(updatedCrew, captain.id, captainXp);
      updatedCrew = r.crew;
      if (r.levelledUp) levelUps.push(`${r.levelledUp} (Lvl ${r.newLevel})`);
    }
    // Gunner gets combat XP
    const gunnerMember = updatedCrew.find(c => c.role === 'Gunner');
    if (gunnerMember) {
      const r = grantCrewXp(updatedCrew, gunnerMember.id, combatXp);
      updatedCrew = r.crew;
      if (r.levelledUp) levelUps.push(`${r.levelledUp} (Lvl ${r.newLevel})`);
    }
    // All other crew get a small XP share
    for (const c of updatedCrew) {
      if (c.id === captain?.id || c.id === gunnerMember?.id) continue;
      const r = grantCrewXp(updatedCrew, c.id, crewXp);
      updatedCrew = r.crew;
      if (r.levelledUp) levelUps.push(`${r.levelledUp} (Lvl ${r.newLevel})`);
    }

    set({
      gold: state.gold + goldReward,
      cargo: currentCargo,
      cargoProvenance: [...state.cargoProvenance, ...salvageProvenance],
      crew: updatedCrew,
    });
    // Remove from npcShips
    set((s) => ({ npcShips: s.npcShips.filter(n => n.id !== npcId) }));
    // Notifications
    const salvagedStr = salvaged.length > 0 ? ` Salvaged: ${salvaged.join(', ')}.` : '';
    get().addNotification(`Sank the ${shipName}! +${goldReward} gold.${salvagedStr}`, 'success', { size: 'grand', subtitle: 'SHIP DEFEATED' });
    for (const lu of levelUps) get().addNotification(`${lu} leveled up!`, 'success', { tier: 'event', subtitle: 'LEVEL UP' });
    // Captain savors victory
    get().setCaptainExpression('Smug', 5000);
    // Journal
    get().addJournalEntry('encounter',
      `After a fierce exchange, the ${flag} vessel ${shipName} slipped beneath the waves. We recovered ${goldReward} gold${salvagedStr ? ' and' + salvagedStr.toLowerCase() : ''}.`);
    // Major reputation hit with that faction
    get().adjustReputation(flag, -25);
    // Crew history
    const gunner = state.crew.find(c => c.role === 'Gunner') ?? state.crew[0];
    if (gunner) get().addCrewHistory(gunner.id, `Helped sink the ${flag} ${shipName}`);
  },
  dismissDeadCrew: () => set({ deadCrew: null }),
  killCrewMember: (crewId, cause) => {
    const state = get();
    const member = state.crew.find(c => c.id === crewId);
    if (!member) return;
    // Freeze the member snapshot for the death modal before removing
    const snapshot = { ...member, history: [...member.history, { day: state.dayCount, event: cause }] };
    const remaining = state.crew.filter(c => c.id !== crewId);
    // Morale hit for all surviving crew
    const moraleHit = member.role === 'Captain' ? 15 : 5;
    const updatedCrew = remaining.map(c => ({
      ...c,
      morale: Math.max(0, c.morale - moraleHit),
    }));
    set({ crew: updatedCrew, deadCrew: snapshot, paused: true });
    // Captain mourns the loss
    get().setCaptainExpression('Melancholy', 6000);
    get().addJournalEntry('crew',
      `${member.name}, our ${member.role.toLowerCase()}, has perished. ${cause} The crew is shaken.`,
    );
    // If captain dies, promote best crew member
    if (member.role === 'Captain' && updatedCrew.length > 0) {
      const best = [...updatedCrew].sort((a, b) => b.skill - a.skill)[0];
      get().setCrewRole(best.id, 'Captain');
      get().addNotification(`${best.name} has been promoted to Captain.`, 'warning');
    }
    // Game over if no crew left
    if (updatedCrew.length === 0) {
      get().triggerGameOver('The last of your crew has perished. The ship drifts unmanned upon the waves.');
    }
  },
  triggerGameOver: (cause) => {
    set({ gameOver: true, gameOverCause: cause, paused: true });
    audioManager.stopAll();
  },
  initWorld: (ports) => set((state) => ({
    ports,
    discoveredPorts: Array.from(new Set([...state.discoveredPorts, ...ports.map((port) => port.id)])),
  }))
}));
