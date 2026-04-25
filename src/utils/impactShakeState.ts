export type TreeImpactKind = 'tree' | 'broadleaf' | 'palm' | 'baobab' | 'acacia' | 'mangrove' | 'cypress' | 'datePalm' | 'bamboo' | 'willow' | 'cherry' | 'orange';

export interface BuildingShakeEvent {
  buildingId: string;
  time: number;
  intensity: number;
}

export interface TreeShakeEvent {
  kind: TreeImpactKind;
  index: number;
  time: number;
  intensity: number;
}

export interface FelledTreeState {
  fallAngle: number;
  damage: number;
}

export type BuildingDamageStage = 'intact' | 'damaged' | 'heavilyDamaged' | 'destroyed';

const MAX_BUILDING_SHAKES = 24;
const MAX_TREE_SHAKES = 32;
const TREE_MAX_HP: Record<TreeImpactKind, number> = {
  tree: 10,
  broadleaf: 10,
  palm: 11,
  baobab: 12,
  acacia: 10,
  mangrove: 10,
  cypress: 11,
  datePalm: 11,
  bamboo: 6,
  willow: 9,
  cherry: 9,
  orange: 8,
};

export const buildingShakes: BuildingShakeEvent[] = [];
export const treeShakes: TreeShakeEvent[] = [];
const palmDamage = new Map<number, number>();
const treeDamage = new Map<string, number>();
const felledTrees = new Map<string, FelledTreeState>();
const buildingDamage = new Map<string, number>();
const buildingMaxHp = new Map<string, number>();
const destroyedBuildings = new Set<string>();
let buildingDamageVersion = 0;

function clampIntensity(intensity: number) {
  return Math.min(1, Math.max(0.1, intensity));
}

function nowSeconds() {
  return Date.now() * 0.001;
}

function treeKey(kind: TreeImpactKind, index: number) {
  return `${kind}:${index}`;
}

export function spawnBuildingShake(buildingId: string, intensity = 1) {
  const ev: BuildingShakeEvent = {
    buildingId,
    time: nowSeconds(),
    intensity: clampIntensity(intensity),
  };
  if (buildingShakes.length >= MAX_BUILDING_SHAKES) {
    buildingShakes.shift();
  }
  buildingShakes.push(ev);
}

export function spawnTreeShake(kind: TreeImpactKind, index: number, intensity = 1) {
  const ev: TreeShakeEvent = {
    kind,
    index,
    time: nowSeconds(),
    intensity: clampIntensity(intensity),
  };
  if (treeShakes.length >= MAX_TREE_SHAKES) {
    treeShakes.shift();
  }
  treeShakes.push(ev);
}

export function damagePalm(index: number, amount = 0.45) {
  palmDamage.set(index, Math.min(1, (palmDamage.get(index) ?? 0) + clampIntensity(amount) * 0.55));
}

export function getPalmDamage(index: number) {
  return palmDamage.get(index) ?? 0;
}

export function applyTreeDamage(kind: TreeImpactKind, index: number, amount: number, dirX: number, dirZ: number) {
  const key = treeKey(kind, index);
  const prior = treeDamage.get(key) ?? 0;
  const total = prior + Math.max(0, amount);
  treeDamage.set(key, total);

  if (!felledTrees.has(key) && total >= TREE_MAX_HP[kind]) {
    const len = Math.hypot(dirX, dirZ);
    const fallAngle = len > 1e-4 ? Math.atan2(dirX / len, dirZ / len) : 0;
    felledTrees.set(key, { fallAngle, damage: total });
    return true;
  }
  return false;
}

export function isTreeFelled(kind: TreeImpactKind, index: number) {
  return felledTrees.has(treeKey(kind, index));
}

export function getFelledTreeState(kind: TreeImpactKind, index: number) {
  return felledTrees.get(treeKey(kind, index)) ?? null;
}

export function applyBuildingDamage(buildingId: string, amount: number, maxHp: number) {
  buildingMaxHp.set(buildingId, maxHp);
  const prior = buildingDamage.get(buildingId) ?? 0;
  const total = prior + Math.max(0, amount);
  buildingDamage.set(buildingId, total);
  buildingDamageVersion++;
  if (!destroyedBuildings.has(buildingId) && total >= maxHp) {
    destroyedBuildings.add(buildingId);
    return true;
  }
  return false;
}

export function isBuildingDestroyed(buildingId: string) {
  return destroyedBuildings.has(buildingId);
}

export function isBuildingDamaged(buildingId: string) {
  return (buildingDamage.get(buildingId) ?? 0) > 0;
}

export function getBuildingDamageAmount(buildingId: string) {
  return buildingDamage.get(buildingId) ?? 0;
}

export function getBuildingDamageFraction(buildingId: string) {
  const maxHp = buildingMaxHp.get(buildingId);
  if (!maxHp || maxHp <= 0) return 0;
  return Math.max(0, Math.min(1, (buildingDamage.get(buildingId) ?? 0) / maxHp));
}

export function getBuildingDamageStage(buildingId: string): BuildingDamageStage {
  if (destroyedBuildings.has(buildingId)) return 'destroyed';
  const fraction = getBuildingDamageFraction(buildingId);
  if (fraction >= 0.6) return 'heavilyDamaged';
  if (fraction > 0) return 'damaged';
  return 'intact';
}

export function getBuildingDamageVersion() {
  return buildingDamageVersion;
}

export function resetVegetationDamage() {
  palmDamage.clear();
  treeDamage.clear();
  felledTrees.clear();
  buildingDamage.clear();
  buildingMaxHp.clear();
  destroyedBuildings.clear();
  buildingDamageVersion++;
}
