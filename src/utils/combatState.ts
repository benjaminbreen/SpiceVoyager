// Shared mutable combat state — kept outside React/Zustand for per-frame perf.
// Ship.tsx writes the swivel aim angle, Game.tsx reads it for the gun visual,
// and the Projectiles component manages cannonball flight + hit detection.

import * as THREE from 'three';
import type { WeaponType } from '../store/gameStore';

export interface Projectile {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;       // seconds remaining
  weaponType: WeaponType; // determines damage on hit
}

// Mouse world position on the water plane (y=0), updated by CameraController raycaster
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
  weaponType: WeaponType = 'swivelGun',
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
  weaponType: WeaponType;
  fired: boolean;
}
export const broadsideQueue: BroadsideShot[] = [];

// Per-side reload: timestamp when that side can fire again
export const broadsideReload = { port: 0, starboard: 0 };

// Live NPC positions — updated by each NPCShip every frame
// Keyed by NPCShipIdentity.id
export interface NpcLiveEntry {
  x: number;
  z: number;
  flag: string;
  shipName: string;
  hitAlert?: number;
  hull: number;
  maxHull: number;
  sunk?: boolean;
}
export const npcLivePositions: Map<string, NpcLiveEntry> = new Map();

