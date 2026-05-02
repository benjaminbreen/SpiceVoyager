import type { Commodity } from '../utils/commodities';

export type WeaponType = 'swivelGun' | 'lantaka' | 'cetbang' | 'falconet' | 'fireRocket' | 'minion' | 'saker' | 'demiCulverin' | 'demiCannon' | 'basilisk';

export interface Weapon {
  type: WeaponType;
  name: string;
  damage: number;
  range: number;
  reloadTime: number;
  weight: number;
  aimable: boolean;
}

export const WEAPON_DEFS: Record<WeaponType, Weapon> = {
  swivelGun:    { type: 'swivelGun',    name: 'Swivel Gun',    damage: 5,  range: 90,  reloadTime: 0.5,  weight: 1,  aimable: true },
  lantaka:      { type: 'lantaka',      name: 'Lantaka',       damage: 7,  range: 90,  reloadTime: 0.7,  weight: 1,  aimable: true },
  cetbang:      { type: 'cetbang',      name: 'Cetbang',       damage: 8,  range: 90,  reloadTime: 0.8,  weight: 2,  aimable: true },
  falconet:     { type: 'falconet',     name: 'Falconet',      damage: 11, range: 100, reloadTime: 1.4,  weight: 3,  aimable: true },
  fireRocket:   { type: 'fireRocket',   name: 'War Rocket',    damage: 12, range: 90,  reloadTime: 2.8, weight: 3,  aimable: true },
  minion:       { type: 'minion',       name: 'Minion',        damage: 10, range: 55,  reloadTime: 5,  weight: 3,  aimable: false },
  saker:        { type: 'saker',        name: 'Saker',         damage: 12, range: 80,  reloadTime: 6,  weight: 4,  aimable: false },
  demiCulverin: { type: 'demiCulverin', name: 'Demi-Culverin', damage: 18, range: 95,  reloadTime: 8,  weight: 6,  aimable: false },
  demiCannon:   { type: 'demiCannon',   name: 'Demi-Cannon',   damage: 30, range: 50,  reloadTime: 12, weight: 10, aimable: false },
  basilisk:     { type: 'basilisk',     name: 'Basilisk',      damage: 22, range: 110, reloadTime: 10, weight: 8,  aimable: false },
};

export const WEAPON_PRICES: Record<WeaponType, number> = {
  swivelGun: 60,
  lantaka: 60,
  cetbang: 60,
  falconet: 420,
  fireRocket: 240,
  minion: 180,
  saker: 320,
  demiCulverin: 650,
  demiCannon: 1100,
  basilisk: 1600,
};

export const PORT_ARMORY: Record<string, WeaponType[]> = {
  goa: ['swivelGun', 'minion', 'saker', 'demiCulverin', 'basilisk'],
  malacca: ['cetbang', 'fireRocket', 'swivelGun', 'minion', 'saker', 'demiCulverin'],
  hormuz: ['lantaka', 'swivelGun', 'minion', 'saker'],
  surat: ['lantaka', 'minion', 'demiCulverin', 'demiCannon'],
  cochin: ['swivelGun', 'minion', 'saker', 'demiCulverin'],
  macau: ['cetbang', 'fireRocket', 'swivelGun', 'minion', 'saker', 'demiCannon'],
  bantam: ['cetbang', 'fireRocket', 'swivelGun', 'minion', 'saker'],
  mombasa: ['lantaka', 'minion', 'saker'],
  muscat: ['lantaka', 'minion'],
  aceh: ['cetbang', 'swivelGun', 'minion', 'saker'],
  aden: ['lantaka', 'minion', 'demiCulverin'],
  zanzibar: ['lantaka', 'minion'],
  calicut: ['lantaka', 'minion'],
  socotra: ['lantaka', 'minion'],
  diu: ['swivelGun', 'minion', 'saker', 'demiCulverin', 'demiCannon'],
  mocha: ['lantaka', 'minion'],
  lisbon: ['swivelGun', 'minion', 'saker', 'demiCulverin', 'demiCannon', 'basilisk'],
  amsterdam: ['swivelGun', 'falconet', 'minion', 'saker', 'demiCulverin', 'demiCannon', 'basilisk'],
  seville: ['swivelGun', 'minion', 'saker', 'demiCulverin', 'demiCannon'],
  london: ['swivelGun', 'falconet', 'minion', 'saker', 'demiCulverin', 'demiCannon'],
  elmina: ['swivelGun', 'minion'],
  luanda: [],
  salvador: ['swivelGun', 'minion', 'saker'],
  havana: ['swivelGun', 'minion', 'saker', 'demiCulverin', 'demiCannon'],
  cartagena: ['swivelGun', 'minion', 'saker', 'demiCulverin'],
  cape: [],
};

const DEFAULT_PORT_ARMORY: WeaponType[] = ['swivelGun', 'minion'];

export function getPortArmory(portId: string): WeaponType[] {
  return PORT_ARMORY[portId] ?? DEFAULT_PORT_ARMORY;
}

export const WEAPON_DESCRIPTIONS: Record<WeaponType, { flavor: string; rangeLabel: string; reloadLabel: string; weightLabel: string }> = {
  swivelGun: { flavor: 'Light anti-personnel gun, aimed by hand', rangeLabel: 'Close', reloadLabel: 'Rapid', weightLabel: 'Negligible' },
  lantaka: { flavor: 'Bronze breech-loader of the Arab and Indian Ocean coasts', rangeLabel: 'Close', reloadLabel: 'Rapid', weightLabel: 'Negligible' },
  cetbang: { flavor: 'Javanese bronze swivel — light, swift, deadly at close quarters', rangeLabel: 'Close', reloadLabel: 'Rapid', weightLabel: 'Negligible' },
  falconet: { flavor: 'Light European cannon adapted as a bow chaser — costly, but strong enough to batter buildings', rangeLabel: 'Long', reloadLabel: 'Moderate', weightLabel: 'Light' },
  fireRocket: { flavor: 'Bamboo-tube rocket — long reach and a fireball on impact, but flies wild', rangeLabel: 'Extreme', reloadLabel: 'Slow', weightLabel: 'Light' },
  minion: { flavor: 'Small iron cannon, cheap and reliable', rangeLabel: 'Medium', reloadLabel: 'Moderate', weightLabel: 'Light' },
  saker: { flavor: 'Fast-loading bronze gun favored by the Portuguese', rangeLabel: 'Long', reloadLabel: 'Moderate', weightLabel: 'Light' },
  demiCulverin: { flavor: 'Versatile medium cannon with good range', rangeLabel: 'Long', reloadLabel: 'Slow', weightLabel: 'Medium' },
  demiCannon: { flavor: 'Heavy siege gun — devastating at close range', rangeLabel: 'Medium', reloadLabel: 'Very slow', weightLabel: 'Heavy' },
  basilisk: { flavor: 'Rare bronze long gun with extreme reach', rangeLabel: 'Extreme', reloadLabel: 'Slow', weightLabel: 'Medium' },
};

export type LandWeaponType = 'musket' | 'bow';

export interface LandWeapon {
  type: LandWeaponType;
  name: string;
  damage: number;
  range: number;
  reloadTime: number;
  projectileSpeed: number;
  spread: number;
  noise: number;
  ammoCommodity: Commodity | null;
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
