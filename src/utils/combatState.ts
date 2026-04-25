// Shared mutable combat state — kept outside React/Zustand for per-frame perf.
// Ship.tsx writes the swivel aim angle, Game.tsx reads it for the gun visual,
// and the Projectiles component manages cannonball flight + hit detection.

import * as THREE from 'three';
import type { WeaponType, LandWeaponType } from '../store/gameStore';

// Union: projectiles may come from ship or land weapons. Hit detection branches
// on whether the weaponType is a land weapon (targets wildlife) or ship weapon
// (targets NPC ships).
export type ProjectileWeaponType = WeaponType | LandWeaponType;

export interface Projectile {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;       // seconds remaining
  weaponType: ProjectileWeaponType;
  owner: 'player' | 'npc';
  ownerId?: string;
  /** Accumulator for rocket-trail spawning — fires a smoke puff every
   *  ~50ms while positive. Only set for fireRocket projectiles. */
  trailClock?: number;
}

// Mouse world position on the active aim plane, updated by CameraController.
export const mouseWorldPos = { x: 0, z: 0, valid: false };

// Full mouse ray (camera origin + normalized direction), updated each frame.
// Needed when the cursor is over an elevated object — water-plane hit is offset
// from the object's actual screen position by the camera tilt × object height.
export const mouseRay = {
  origin: new THREE.Vector3(),
  direction: new THREE.Vector3(),
  valid: false,
};

// Swivel gun aim angle in world space (radians)
export let swivelAimAngle = 0;
// Pitch angle (radians, +up). Set when CameraController resolves a real 3D
// target under the cursor (NPC ship → water surface → fallback). Mirrors the
// hunting aim plumbing.
export let swivelAimPitch = 0;
export const swivelAimTarget = new THREE.Vector3();
export let swivelAimValid = false;
export let activeBowWeapon: WeaponType = 'swivelGun';

// Active projectiles (max ~30 in flight — broadsides spawn many at once)
export const projectiles: Projectile[] = [];
const MAX_PROJECTILES = 30;

// ── Gunfire alerts ──────────────────────────────────────────────────────────
// Every projectile spawn broadcasts a short-lived alert at its origin.
// Pedestrians and wildlife within `radius` flee for `durationMs`.
export interface GunfireAlert {
  x: number;
  z: number;
  expireAt: number;
  radius: number;
}
export const gunfireAlerts: GunfireAlert[] = [];
const MAX_ALERTS = 8;

export function broadcastGunfire(x: number, z: number, radius = 90, durationMs = 7000): void {
  const now = Date.now();
  for (let i = gunfireAlerts.length - 1; i >= 0; i--) {
    if (gunfireAlerts[i].expireAt < now) gunfireAlerts.splice(i, 1);
  }
  gunfireAlerts.push({ x, z, expireAt: now + durationMs, radius });
  if (gunfireAlerts.length > MAX_ALERTS) gunfireAlerts.shift();
}

export function spawnProjectile(
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  speed: number,
  weaponType: ProjectileWeaponType = 'swivelGun',
  opts: { owner?: 'player' | 'npc'; ownerId?: string } = {},
) {
  // Rockets fly slower but longer — give them more life so they reach the
  // extreme range their damage/reload cost pays for.
  const life = weaponType === 'fireRocket' ? 4.0 : 2.5;
  const p: Projectile = {
    pos: origin.clone(),
    vel: direction.clone().multiplyScalar(speed),
    life,
    weaponType,
    owner: opts.owner ?? 'player',
    ownerId: opts.ownerId,
    trailClock: weaponType === 'fireRocket' ? 0 : undefined,
  };
  if (projectiles.length >= MAX_PROJECTILES) {
    projectiles.shift();
  }
  projectiles.push(p);

  // Heavy guns carry further than a swivel/musket; rockets loudest; a bow is
  // near-silent so it doesn't scatter a whole port when hunting in the hills.
  // Radii are deliberately generous: ships typically fire from 100-200u
  // offshore, so an 80u hearing range would never reach the town.
  const bigCannon = weaponType === 'minion' || weaponType === 'saker'
    || weaponType === 'demiCulverin' || weaponType === 'demiCannon' || weaponType === 'basilisk';
  const radius = weaponType === 'bow' ? 30
    : weaponType === 'fireRocket' ? 320
    : bigCannon ? 300
    : 220;
  broadcastGunfire(origin.x, origin.z, radius);
  if (typeof window !== 'undefined' && (window as unknown as { DEBUG_GUNFIRE?: boolean }).DEBUG_GUNFIRE) {
    console.log('[gunfire]', weaponType, 'at', origin.x.toFixed(1), origin.z.toFixed(1), 'r=', radius);
  }
}

export function setSwivelAimAngle(angle: number) {
  swivelAimAngle = angle;
}

export function setSwivelAim(angle: number, pitch: number, target: THREE.Vector3) {
  swivelAimAngle = angle;
  swivelAimPitch = pitch;
  swivelAimTarget.copy(target);
  swivelAimValid = true;
}

export function clearSwivelAim() {
  swivelAimValid = false;
}

export function setActiveBowWeapon(weapon: WeaponType) {
  activeBowWeapon = weapon;
}

// Whether fire button (mouse/space) is currently held
export let fireHeld = false;
export function setFireHeld(held: boolean) { fireHeld = held; }

// Broadside elevation charge — space held in combat ship mode fills this.
// 0 = flat fire (ship-to-ship); 1 = maximum loft (shore bombardment).
// Charge builds over 2.5 seconds, resets on key release.
export let elevationHoldStart: number | null = null;
export function setElevationHoldStart(t: number | null): void { elevationHoldStart = t; }
export function getCurrentElevationCharge(): number {
  if (elevationHoldStart === null) return 0;
  return Math.min(1, (Date.now() - elevationHoldStart) / 2500);
}

// ── Broadside state ──────────────────────────────────────────────────────────
// Rolling broadside queue: each entry spawns one cannon shot after a short delay
export interface BroadsideShot {
  fireAt: number;       // Date.now() timestamp to fire
  origin: THREE.Vector3;
  direction: THREE.Vector3;
  speed: number;
  weaponType: ProjectileWeaponType;
  owner?: 'player' | 'npc';
  ownerId?: string;
  fired: boolean;
}
export const broadsideQueue: BroadsideShot[] = [];

// Per-side reload: timestamp when that side can fire again
export const broadsideReload = { port: 0, starboard: 0 };

// Live NPC positions — updated by each NPCShip every frame
// Keyed by NPCShipIdentity.id
export interface NpcLiveEntry {
  x: number;
  y: number;
  z: number;
  radius: number;
  flag: string;
  shipName: string;
  hitAlert?: number;
  hull: number;
  maxHull: number;
  sunk?: boolean;
}
export const npcLivePositions: Map<string, NpcLiveEntry> = new Map();

// ── Hunting (land combat) ───────────────────────────────────────────────────
// Mirrors the swivel gun's aim/reload plumbing but for the walking character.

// Hunt aim state. CameraController solves a real 3D target under the cursor
// (wildlife → terrain/water surface → fixed-distance fallback), then stores a
// yaw for torso twist, a pitch for upper-body pose, and the exact target point
// for projectile direction.
export let huntAimAngle = 0;
export let huntAimPitch = 0;
export const huntAimTarget = new THREE.Vector3();
export let huntAimValid = false;
export function setHuntAim(angle: number, pitch: number, target: THREE.Vector3) {
  huntAimAngle = angle;
  huntAimPitch = pitch;
  huntAimTarget.copy(target);
  huntAimValid = true;
}

// Per-weapon reload timestamps (Date.now() ms). Keyed by land weapon id so
// switching between musket and bow tracks independent cooldowns.
export const landWeaponReload: Record<string, number> = {};

// Live positions of shootable wildlife instances. Each animal component
// (Grazers, eventually Primates/Reptiles/WadingBirds) writes its per-instance
// state here every frame so the projectile system can find hits without
// walking React tree refs.
export interface WildlifeLiveEntry {
  x: number;
  y: number;
  z: number;
  hp: number;
  maxHp: number;
  template: 'grazer' | 'primate' | 'reptile' | 'wadingBird';
  variant: string;      // e.g. 'goat', 'sheep' — drives loot table lookup
  dead: boolean;
  harvested?: boolean;  // Once true, the carcass is gone and loot has been awarded
  hitAlert?: number;    // Date.now() when last hit — animal panics for a while after
  radius: number;       // hit radius in world units
}
export const wildlifeLivePositions: Map<string, WildlifeLiveEntry> = new Map();

// Kill events — wildlife components read & clear these to play death animations.
// Projectile system writes the id of any animal whose HP dropped to 0.
export const wildlifeKillQueue: Set<string> = new Set();
