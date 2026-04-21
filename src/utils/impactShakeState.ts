export type TreeImpactKind = 'tree' | 'broadleaf' | 'palm' | 'baobab' | 'acacia' | 'mangrove';

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

const MAX_BUILDING_SHAKES = 24;
const MAX_TREE_SHAKES = 32;

export const buildingShakes: BuildingShakeEvent[] = [];
export const treeShakes: TreeShakeEvent[] = [];
const palmDamage = new Map<number, number>();

function clampIntensity(intensity: number) {
  return Math.min(1, Math.max(0.1, intensity));
}

function nowSeconds() {
  return Date.now() * 0.001;
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

export function resetVegetationDamage() {
  palmDamage.clear();
}
