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

// Active projectiles (max ~30 in flight — broadsides spawn many at once)
export const projectiles: Projectile[] = [];
const MAX_PROJECTILES = 30;

export function spawnProjectile(
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  speed: number,
  weaponType: ProjectileWeaponType = 'swivelGun',
) {
  const p: Projectile = {
    pos: origin.clone(),
    vel: direction.clone().multiplyScalar(speed),
    life: 2.5,
    weaponType,
  };
  if (projectiles.length >= MAX_PROJECTILES) {
    projectiles.shift();
  }
  projectiles.push(p);
}

export function setSwivelAimAngle(angle: number) {
  swivelAimAngle = angle;
}

// Whether fire button (mouse/space) is currently held
export let fireHeld = false;
export function setFireHeld(held: boolean) { fireHeld = held; }

// ── Broadside state ──────────────────────────────────────────────────────────
// Rolling broadside queue: each entry spawns one cannon shot after a short delay
export interface BroadsideShot {
  fireAt: number;       // Date.now() timestamp to fire
  origin: THREE.Vector3;
  direction: THREE.Vector3;
  speed: number;
  weaponType: ProjectileWeaponType;
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
  hitAlert?: number;    // Date.now() when last hit — animal panics for a while after
  radius: number;       // hit radius in world units
}
export const wildlifeLivePositions: Map<string, WildlifeLiveEntry> = new Map();

// Kill events — wildlife components read & clear these to play death animations.
// Projectile system writes the id of any animal whose HP dropped to 0.
export const wildlifeKillQueue: Set<string> = new Set();
