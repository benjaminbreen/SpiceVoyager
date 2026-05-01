import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { EffectComposer, Bloom, Vignette, BrightnessContrast, HueSaturation, N8AO, LUT } from '@react-three/postprocessing';
import { buildLUT, lutParamsKey, lerpLUTParams, LUT_PRESETS, LUT_NEUTRAL, computeMoodDelta, addLUTParams, lutDiffersFromNeutral } from '../utils/proceduralLUT';
import { Ship } from './Ship';
import { Ocean } from './Ocean';
import { RainOverlay } from './RainOverlay';
import { World } from './World';
import { getTreeImpactTargets } from '../state/worldRegistries';
import { Player } from './Player';
import { Pedestrians } from './Pedestrians';
import { HinterlandScenes } from './HinterlandScenes';
import { useGameStore, getCrewByRole, captainHasTrait, captainHasAbility, getRoleBonus, PORT_FACTION, type Building } from '../store/gameStore';
import { resolveCampaignPortId } from '../utils/worldPorts';
import { ambientEngine } from '../audio/AmbientEngine';
import { sfxDisembark, sfxDisembarkBlocked, sfxEmbark, sfxBattleStations, sfxAnchorDrop, sfxAnchorWeigh, sfxCannonFire, sfxCannonImpact, sfxCannonSplash, sfxBroadsideCannon, sfxMusket, sfxBowRelease, sfxHarvest, sfxRocketFire, sfxRocketImpact, sfxRocketWhistle } from '../audio/SoundEffects';
import { audioManager } from '../audio/AudioManager';
import * as THREE from 'three';
import { Suspense, useRef, useEffect, useMemo, useState } from 'react';
import { useIsMobile } from '../utils/useIsMobile';
import { ShiftSelectOverlay } from './ShiftSelectOverlay';
import { TouchSteerRaycaster } from './TouchControls';
import { getTerrainHeight, getTerrainData, BiomeType } from '../utils/terrain';
import { SEA_LEVEL } from '../constants/world';
import {
  getLiveShipTransform,
  getLiveWalkingTransform,
} from '../utils/livePlayerTransform';
import { SplashSystem } from './SplashSystem';
import { FloatingLootSystem, spawnFloatingLoot } from './FloatingLoot';
import { FloatingCombatTextSystem, spawnFloatingCombatText } from './FloatingCombatText';
import { WreckSalvageSystem } from './WreckSalvage';
import { spawnSplash, spawnSplinters, spawnImpactBurst, spawnMuzzleBurst, spawnRocketTrail, spawnRocketFireBurst } from '../utils/splashState';
import { spawnBuildingShake, spawnBuildingCollapse, spawnTreeShake, damagePalm, applyTreeDamage, applyBuildingDamage, isTreeFelled } from '../utils/impactShakeState';
import {
  mouseWorldPos,
  mouseRay,
  projectiles,
  spawnProjectile,
  activeBowWeapon,
  setSwivelAim,
  clearSwivelAim,
  setActiveBowWeapon,
  setHuntAim,
  huntAimTarget,
  huntAimValid,
  swivelAimAngle,
  swivelAimPitch,
  swivelAimTarget,
  swivelAimValid,
  npcLivePositions,
  wildlifeLivePositions,
  wildlifeKillQueue,
  landWeaponReload,
  bowWeaponReload,
  fireHeld,
  setFireHeld,
  broadsideQueue,
  broadsideReload,
  elevationHoldStart,
  setElevationHoldStart,
  getCurrentElevationCharge,
} from '../utils/combatState';
import { WEAPON_DEFS, LAND_WEAPON_DEFS, type WeaponType, type LandWeaponType } from '../store/gameStore';
import { lootForKill } from '../utils/huntLoot';
import { resolveWaterPaletteId } from '../utils/waterPalettes';
import { computeDayMood, MOOD_OVERCAST_WARM_HEX, type DayMood } from '../utils/dayMood';
import {
  PERFORMANCE_STATS_EVENT,
  type PerformanceStats,
  drainPerfSignals,
  reportAtmosphereMs,
  perfSignals,
} from '../utils/performanceStats';
import { addCameraFovPulse, addCameraShake, sampleCameraShake, sampleCameraFovPulse } from '../utils/cameraShakeState';
import { sampleIntroCinematic, skipIntroCinematic, isIntroCinematicActive } from '../utils/cinematicIntroState';
import { pointHitsPedestrian, markKillPedestrian } from '../utils/livePedestrians';

// ── Landfall descriptions keyed to biome + terrain data ──────────────────────
function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function treeDamageForWeapon(weaponType: WeaponType | LandWeaponType) {
  switch (weaponType) {
    case 'musket': return 2.3;
    case 'bow': return 1.2;
    case 'swivelGun':
      return 3.5;
    case 'lantaka':
      return 10.5;
    case 'cetbang':
      return 11.5;
    case 'falconet':
      return 13;
    case 'fireRocket':
      return 12;
    case 'minion':
      return 11;
    case 'saker':
      return 12;
    case 'demiCulverin':
      return 13;
    case 'demiCannon':
      return 15;
    case 'basilisk':
      return 17;
  }
}

function buildingDamageForWeapon(weaponType: WeaponType | LandWeaponType) {
  switch (weaponType) {
    case 'musket': return 0.2;
    case 'bow': return 0.05;
    case 'swivelGun':
      return 1.5;
    case 'lantaka':
      return 3.4;
    case 'cetbang':
      return 4;
    case 'falconet':
      return 10.5;
    case 'fireRocket':
      return 6;
    case 'minion':
      return 7;
    case 'saker':
      return 10;
    case 'demiCulverin':
      return 12;
    case 'demiCannon':
      return 16;
    case 'basilisk':
      return 18;
  }
}

function buildingMaxHp(building: Building) {
  switch (building.type) {
    case 'shack': return 5;
    case 'house':
    case 'farmhouse':
      return 8;
    case 'warehouse':
    case 'market':
      return 11;
    case 'estate':
    case 'spiritual':
    case 'landmark':
    case 'palace':
      return 15;
    case 'fort':
      return 24;
    case 'dock':
    case 'plaza':
    default:
      return 10;
  }
}

const HUNT_AIM_WILDLIFE_BUFFER = 0.45;
const HUNT_AIM_MIN_DISTANCE = 1;
const HUNT_AIM_MAX_DISTANCE = 110;
const HUNT_AIM_FALLBACK_DISTANCE = 42;
const HUNT_AIM_STEP = 1.6;
const HUNT_AIM_REFINE_STEPS = 5;
const HUNT_VISUAL_PITCH_MIN = -0.95;
const HUNT_VISUAL_PITCH_MAX = 0.72;
const HUNT_MARKER_SURFACE_OFFSET = 0.08;
const LAND_PROJECTILE_GRAVITY = 1.5;
const LAND_PROJECTILE_LIFE = 2.5;
const LAND_MARKER_STEP = 1 / 120;
// Swivel-gun ballistic constants — match the in-flight physics in
// ProjectileSystem (gravity 15 for ship weapons, life 2.5s set in spawnProjectile).
const SHIP_PROJECTILE_GRAVITY = 24;
const SHIP_PROJECTILE_LIFE = 2.5;
const SWIVEL_VISUAL_PITCH_MIN = -0.55;
const SWIVEL_VISUAL_PITCH_MAX = 0.7;
// Match Ship.tsx hardcoded bow + barrel offset used for muzzle effects.
const SWIVEL_BOW_FORWARD = 3.0;
const SWIVEL_BARREL_FORWARD = 1.2;
const SWIVEL_MUZZLE_HEIGHT = 1.8;
const HUNT_BUILDING_PORT_RANGE = 220;
const LAND_SHIP_DAMAGE: Record<LandWeaponType, number> = {
  musket: 4,
  bow: 1,
};

const _huntAimSphere = new THREE.Sphere();
const _huntAimHit = new THREE.Vector3();
const _huntAimCenter = new THREE.Vector3();
const _huntAimPoint = new THREE.Vector3();
const _huntAimTarget = new THREE.Vector3();
const _huntAimFireOrigin = new THREE.Vector3();
const _huntAimFireDir = new THREE.Vector3();
const _predictSegmentStart = new THREE.Vector3();
const _landPredictPos = new THREE.Vector3();
const _landPredictVel = new THREE.Vector3();
const _huntMarkerOrigin = new THREE.Vector3();
const _huntMarkerDir = new THREE.Vector3();
const _huntMarkerImpact = new THREE.Vector3();
const _huntMarkerNormal = new THREE.Vector3();
const _swivelAimTarget = new THREE.Vector3();
const _swivelMuzzleOrigin = new THREE.Vector3();
const _swivelFireDir = new THREE.Vector3();
const _swivelMarkerOrigin = new THREE.Vector3();
const _swivelMarkerDir = new THREE.Vector3();
const _swivelMarkerImpact = new THREE.Vector3();
const _swivelMarkerNormal = new THREE.Vector3();
const _aimObjectHit = new THREE.Vector3();
const _aimObjectNormal = new THREE.Vector3();
const _sphereCenter = new THREE.Vector3();
const _segmentDelta = new THREE.Vector3();
const _segmentOffset = new THREE.Vector3();
const _segmentHit = new THREE.Vector3();
const _markerBaseNormal = new THREE.Vector3(0, 0, 1);
// Player world position used by intersect helpers so range-culling is
// measured from the player (not the camera). Updated each frame.
const _aimPlayerOrigin = new THREE.Vector3();
// T-parameter along the current mouse ray at which it hits the aim plane.
// Updated each frame; tells intersectAimSurface where to start marching.
let _aimGroundT = 0;

function bowWeaponGravity(weaponType: WeaponType) {
  switch (weaponType) {
    case 'swivelGun':
      return 0.4;
    case 'falconet':
      return 5.5;
    case 'lantaka':
    case 'cetbang':
      return 8;
    case 'fireRocket':
      return 12;
    default:
      return SHIP_PROJECTILE_GRAVITY;
  }
}

function bowWeaponLaunchSpeed(weaponType: WeaponType) {
  switch (weaponType) {
    case 'fireRocket':
      return WEAPON_DEFS.fireRocket.range * 0.5;
    case 'falconet':
      return WEAPON_DEFS.falconet.range * 3.5;
    default:
      return WEAPON_DEFS[weaponType].range * 4;
  }
}

function bowWeaponUsesBallisticArc(weaponType: WeaponType) {
  return weaponType !== 'swivelGun';
}

function isBroadsideWeapon(weaponType: WeaponType | LandWeaponType): weaponType is WeaponType {
  return weaponType in WEAPON_DEFS && !WEAPON_DEFS[weaponType as WeaponType].aimable;
}

function broadsideImpactScale(weaponType: WeaponType | LandWeaponType) {
  switch (weaponType) {
    case 'demiCannon':
      return 2.0;
    case 'basilisk':
      return 1.85;
    case 'demiCulverin':
      return 1.65;
    case 'saker':
      return 1.45;
    case 'minion':
      return 1.25;
    default:
      return 1.0;
  }
}

function shipWaterSplashScale(weaponType: WeaponType | LandWeaponType) {
  if (isBroadsideWeapon(weaponType)) return broadsideImpactScale(weaponType);
  const shipWeapon = weaponType in WEAPON_DEFS ? weaponType as WeaponType : null;
  return shipWeapon === 'swivelGun' ? 0.45 : 0.75;
}

function ricochetProfile(weaponType: WeaponType | LandWeaponType) {
  switch (weaponType) {
    case 'saker':
      return { maxWater: 2, maxLand: 1, shallow: 0.24, retainWater: 0.58, retainLand: 0.44, carry: 20 };
    case 'basilisk':
      return { maxWater: 3, maxLand: 1, shallow: 0.28, retainWater: 0.62, retainLand: 0.46, carry: 24 };
    case 'demiCulverin':
      return { maxWater: 2, maxLand: 1, shallow: 0.22, retainWater: 0.54, retainLand: 0.42, carry: 18 };
    case 'minion':
      return { maxWater: 1, maxLand: 1, shallow: 0.2, retainWater: 0.48, retainLand: 0.38, carry: 14 };
    case 'demiCannon':
      return { maxWater: 1, maxLand: 0, shallow: 0.18, retainWater: 0.42, retainLand: 0.32, carry: 12 };
    default:
      return null;
  }
}

function projectileDamageScale(p: { damageScale?: number }) {
  return p.damageScale ?? 1;
}

function spawnSplashCombatText(x: number, y: number, z: number) {
  const now = Date.now();
  if (now - lastFloatingSplashAt < FLOATING_SPLASH_COOLDOWN_MS) return;
  lastFloatingSplashAt = now;
  spawnFloatingCombatText(x, y, z, 'Splash', 'splash');
}

function shipHitCombatText(weaponType: WeaponType | LandWeaponType, damage: number, sunk: boolean, directRocket = false) {
  if (sunk) return { label: 'SUNK!', tone: 'sunk' as const };
  if (directRocket || damage >= 18 || weaponType === 'demiCannon' || weaponType === 'basilisk') {
    return { label: 'Critical Hit', tone: 'critical' as const };
  }
  if (damage <= 4) return { label: 'Glancing Hit', tone: 'glance' as const };
  return { label: 'Hit', tone: 'hit' as const };
}

function tryRicochetProjectile(
  p: (typeof projectiles)[number],
  normal: THREE.Vector3,
  material: 'water' | 'land',
) {
  if (!isBroadsideWeapon(p.weaponType) || p.owner === 'npc') return false;
  const profile = ricochetProfile(p.weaponType);
  if (!profile) return false;
  const maxRicochets = material === 'water' ? profile.maxWater : profile.maxLand;
  const ricochets = p.ricochets ?? 0;
  if (ricochets >= maxRicochets) return false;

  const horizontalSpeed = Math.hypot(p.vel.x, p.vel.z);
  if (horizontalSpeed < 16 || p.vel.y >= 0) return false;
  const impactSteepness = Math.abs(p.vel.y) / Math.max(0.001, horizontalSpeed);
  const shallowLimit = profile.shallow * (material === 'water' ? 1 : 0.82);
  if (impactSteepness > shallowLimit) return false;

  const speed = p.vel.length();
  const retain = material === 'water' ? profile.retainWater : profile.retainLand;
  const reflected = _segmentDelta.copy(p.vel).normalize().reflect(normal).normalize();
  const yaw = (Math.random() - 0.5) * (0.1 + ricochets * 0.05);
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const rx = reflected.x;
  const rz = reflected.z;
  reflected.x = rx * cos - rz * sin;
  reflected.z = rx * sin + rz * cos;
  reflected.y = Math.max(0.08, reflected.y + (material === 'water' ? 0.06 : 0.035));
  reflected.normalize();

  p.vel.copy(reflected).multiplyScalar(speed * retain);
  p.ricochets = ricochets + 1;
  p.damageScale = projectileDamageScale(p) * (material === 'water' ? 0.68 : 0.58);
  p.distanceTraveled = 0;
  p.maxDistance = profile.carry * (1 - Math.min(0.45, ricochets * 0.16));
  p.pos.addScaledVector(normal, material === 'water' ? 0.18 : 0.28);
  p.pos.y = Math.max(
    p.pos.y,
    material === 'water' ? SEA_LEVEL + 0.18 : aimSurfaceHeight(p.pos.x, p.pos.z) + 0.28,
  );

  if (material === 'water') {
    spawnSplash(p.pos.x, p.pos.z, shipWaterSplashScale(p.weaponType) * 0.72);
  } else {
    spawnLandSurfaceImpact(p.pos.x, p.pos.z, broadsideImpactScale(p.weaponType) * 0.42);
  }
  spawnFloatingCombatText(p.pos.x, p.pos.y + 0.25, p.pos.z, 'Ricochet', 'glance');
  return true;
}

function aimSurfaceHeight(x: number, z: number) {
  return Math.max(getTerrainHeight(x, z), SEA_LEVEL);
}

type LandImpactKind = 'wildlife' | 'tree' | 'surface' | 'none';

function estimateAimSurfaceNormal(x: number, z: number, out: THREE.Vector3) {
  if (aimSurfaceHeight(x, z) <= SEA_LEVEL + 0.01) {
    out.set(0, 1, 0);
    return out;
  }
  const eps = 0.45;
  const hL = aimSurfaceHeight(x - eps, z);
  const hR = aimSurfaceHeight(x + eps, z);
  const hD = aimSurfaceHeight(x, z - eps);
  const hU = aimSurfaceHeight(x, z + eps);
  out.set(hL - hR, eps * 2, hD - hU).normalize();
  return out;
}

function intersectSegmentSphere(
  start: THREE.Vector3,
  end: THREE.Vector3,
  center: THREE.Vector3,
  radius: number,
  outPoint: THREE.Vector3,
  outNormal: THREE.Vector3,
) {
  _segmentDelta.copy(end).sub(start);
  const a = _segmentDelta.lengthSq();
  if (a < 1e-8) return Infinity;
  _segmentOffset.copy(start).sub(center);
  const b = 2 * _segmentOffset.dot(_segmentDelta);
  const c = _segmentOffset.lengthSq() - radius * radius;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return Infinity;
  const sqrtDisc = Math.sqrt(disc);
  const invDenom = 1 / (2 * a);
  let t = (-b - sqrtDisc) * invDenom;
  if (t < 0 || t > 1) {
    t = (-b + sqrtDisc) * invDenom;
    if (t < 0 || t > 1) return Infinity;
  }
  outPoint.copy(_segmentDelta).multiplyScalar(t).add(start);
  outNormal.copy(outPoint).sub(center).normalize();
  return t;
}

function intersectWildlifeSegment(start: THREE.Vector3, end: THREE.Vector3, outPoint: THREE.Vector3, outNormal: THREE.Vector3) {
  let bestT = Infinity;
  for (const w of wildlifeLivePositions.values()) {
    if (w.dead) continue;
    _sphereCenter.set(w.x, w.y + 0.5, w.z);
    const t = intersectSegmentSphere(start, end, _sphereCenter, Math.max(0.65, w.radius), _segmentHit, _aimObjectNormal);
    if (t < bestT) {
      bestT = t;
      outPoint.copy(_segmentHit);
      outNormal.copy(_aimObjectNormal);
    }
  }
  return bestT;
}

function intersectNpcShipSegment(start: THREE.Vector3, end: THREE.Vector3, outPoint: THREE.Vector3, outNormal: THREE.Vector3) {
  let bestT = Infinity;
  for (const npc of npcLivePositions.values()) {
    if (npc.sunk) continue;
    _sphereCenter.set(npc.x, npc.y, npc.z);
    const t = intersectSegmentSphere(start, end, _sphereCenter, npc.radius, _segmentHit, _aimObjectNormal);
    if (t < bestT) {
      bestT = t;
      outPoint.copy(_segmentHit);
      outNormal.copy(_aimObjectNormal);
    }
  }
  return bestT;
}

function intersectBuildingSegment(start: THREE.Vector3, end: THREE.Vector3, outPoint: THREE.Vector3, outNormal: THREE.Vector3) {
  let bestT = Infinity;
  eachNearbyBuilding((building) => {
    _sphereCenter.set(
      building.position[0],
      building.position[1] + building.scale[1] * 0.5,
      building.position[2],
    );
    const t = intersectSegmentSphere(start, end, _sphereCenter, buildingAimRadius(building), _segmentHit, _aimObjectNormal);
    if (t < bestT) {
      bestT = t;
      outPoint.copy(_segmentHit);
      outNormal.copy(_aimObjectNormal);
    }
  });
  return bestT;
}

function intersectTreeSegment(start: THREE.Vector3, end: THREE.Vector3, outPoint: THREE.Vector3, outNormal: THREE.Vector3) {
  let bestT = Infinity;
  for (const tree of getTreeImpactTargets()) {
    if (isTreeFelled(tree.kind, tree.index)) continue;
    _sphereCenter.set(tree.x, tree.y, tree.z);
    const t = intersectSegmentSphere(start, end, _sphereCenter, tree.radius, _segmentHit, _aimObjectNormal);
    if (t < bestT) {
      bestT = t;
      outPoint.copy(_segmentHit);
      outNormal.copy(_aimObjectNormal);
    }
  }
  return bestT;
}

function intersectSurfaceSegment(
  start: THREE.Vector3,
  end: THREE.Vector3,
  outPoint: THREE.Vector3,
  outNormal: THREE.Vector3,
) {
  const startDelta = start.y - aimSurfaceHeight(start.x, start.z);
  const endDelta = end.y - aimSurfaceHeight(end.x, end.z);
  if (startDelta <= 0) {
    outPoint.set(start.x, aimSurfaceHeight(start.x, start.z), start.z);
    estimateAimSurfaceNormal(outPoint.x, outPoint.z, outNormal);
    return 0;
  }
  if (endDelta > 0) return Infinity;

  let low = 0;
  let high = 1;
  for (let i = 0; i < HUNT_AIM_REFINE_STEPS + 2; i++) {
    const mid = (low + high) * 0.5;
    _segmentHit.copy(end).sub(start).multiplyScalar(mid).add(start);
    const delta = _segmentHit.y - aimSurfaceHeight(_segmentHit.x, _segmentHit.z);
    if (delta > 0) {
      low = mid;
    } else {
      high = mid;
    }
  }
  outPoint.copy(end).sub(start).multiplyScalar(high).add(start);
  outPoint.y = aimSurfaceHeight(outPoint.x, outPoint.z);
  estimateAimSurfaceNormal(outPoint.x, outPoint.z, outNormal);
  return high;
}

function buildingAimRadius(building: Building) {
  return Math.max(1.2, Math.max(building.scale[0], building.scale[1], building.scale[2]) * 0.65);
}

function eachNearbyBuilding(visitor: (building: Building) => void) {
  const wp = getLiveWalkingTransform().pos;
  const maxDistSq = HUNT_BUILDING_PORT_RANGE * HUNT_BUILDING_PORT_RANGE;
  for (const port of useGameStore.getState().ports) {
    const dx = port.position[0] - wp[0];
    const dz = port.position[2] - wp[2];
    if (dx * dx + dz * dz > maxDistSq) continue;
    for (const building of port.buildings) {
      visitor(building);
    }
  }
}

function intersectWildlifeAimTarget(ray: THREE.Ray, maxDistance: number, out: THREE.Vector3): number {
  const maxDistanceSq = maxDistance * maxDistance;
  let bestDistSq = Infinity;
  for (const w of wildlifeLivePositions.values()) {
    if (w.dead) continue;
    _huntAimCenter.set(w.x, w.y + 0.5, w.z);
    _huntAimSphere.center.copy(_huntAimCenter);
    _huntAimSphere.radius = Math.max(0.65, w.radius + HUNT_AIM_WILDLIFE_BUFFER);
    const hit = ray.intersectSphere(_huntAimSphere, _huntAimHit);
    if (!hit) continue;
    const distSq = _aimPlayerOrigin.distanceToSquared(hit);
    if (distSq > maxDistanceSq) continue;
    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      out.copy(hit);
    }
  }
  return bestDistSq;
}

function intersectNpcShipAimTarget(ray: THREE.Ray, maxDistance: number, out: THREE.Vector3): number {
  const maxDistanceSq = maxDistance * maxDistance;
  let bestDistSq = Infinity;
  for (const npc of npcLivePositions.values()) {
    if (npc.sunk) continue;
    _huntAimSphere.center.set(npc.x, npc.y, npc.z);
    _huntAimSphere.radius = npc.radius;
    const hit = ray.intersectSphere(_huntAimSphere, _huntAimHit);
    if (!hit) continue;
    const distSq = _aimPlayerOrigin.distanceToSquared(hit);
    if (distSq > maxDistanceSq) continue;
    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      out.copy(hit);
    }
  }
  return bestDistSq;
}

function intersectBuildingAimTarget(ray: THREE.Ray, maxDistance: number, out: THREE.Vector3): number {
  const maxDistanceSq = maxDistance * maxDistance;
  let bestDistSq = Infinity;
  eachNearbyBuilding((building) => {
    _huntAimSphere.center.set(
      building.position[0],
      building.position[1] + building.scale[1] * 0.5,
      building.position[2],
    );
    _huntAimSphere.radius = buildingAimRadius(building);
    const hit = ray.intersectSphere(_huntAimSphere, _huntAimHit);
    if (!hit) return;
    const distSq = _aimPlayerOrigin.distanceToSquared(hit);
    if (distSq > maxDistanceSq) return;
    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      out.copy(hit);
    }
  });
  return bestDistSq;
}

function intersectTreeAimTarget(ray: THREE.Ray, maxDistance: number, out: THREE.Vector3): number {
  const maxDistanceSq = maxDistance * maxDistance;
  let bestDistSq = Infinity;
  for (const tree of getTreeImpactTargets()) {
    if (isTreeFelled(tree.kind, tree.index)) continue;
    _huntAimSphere.center.set(tree.x, tree.y, tree.z);
    _huntAimSphere.radius = tree.radius;
    const hit = ray.intersectSphere(_huntAimSphere, _huntAimHit);
    if (!hit) continue;
    const distSq = _aimPlayerOrigin.distanceToSquared(hit);
    if (distSq > maxDistanceSq) continue;
    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      out.copy(hit);
    }
  }
  return bestDistSq;
}

function intersectAimSurface(ray: THREE.Ray, maxDistance: number, out: THREE.Vector3): number {
  // Start the march near where the ray crosses the aim plane so this works
  // correctly at any camera zoom (camera may be hundreds of units from the
  // ground; marching from t=1 would miss it entirely when zoomed out).
  const tNear = Math.max(HUNT_AIM_MIN_DISTANCE, _aimGroundT - maxDistance);
  const tFar  = _aimGroundT + maxDistance;

  let prevT = tNear;
  _huntAimPoint.copy(ray.direction).multiplyScalar(prevT).add(ray.origin);
  let prevDelta = _huntAimPoint.y - aimSurfaceHeight(_huntAimPoint.x, _huntAimPoint.z);
  if (prevDelta <= 0) {
    out.set(_huntAimPoint.x, aimSurfaceHeight(_huntAimPoint.x, _huntAimPoint.z), _huntAimPoint.z);
    return _aimPlayerOrigin.distanceToSquared(out);
  }

  for (let t = prevT + HUNT_AIM_STEP; t <= tFar; t += HUNT_AIM_STEP) {
    _huntAimPoint.copy(ray.direction).multiplyScalar(t).add(ray.origin);
    const surfaceY = aimSurfaceHeight(_huntAimPoint.x, _huntAimPoint.z);
    const delta = _huntAimPoint.y - surfaceY;
    if (delta <= 0) {
      let low = prevT;
      let high = t;
      for (let i = 0; i < HUNT_AIM_REFINE_STEPS; i++) {
        const mid = (low + high) * 0.5;
        _huntAimPoint.copy(ray.direction).multiplyScalar(mid).add(ray.origin);
        if (_huntAimPoint.y > aimSurfaceHeight(_huntAimPoint.x, _huntAimPoint.z)) {
          low = mid;
        } else {
          high = mid;
        }
      }
      out.copy(ray.direction).multiplyScalar(high).add(ray.origin);
      out.y = aimSurfaceHeight(out.x, out.z);
      return _aimPlayerOrigin.distanceToSquared(out);
    }
    prevT = t;
    prevDelta = delta;
  }

  return Infinity;
}

function resolveHuntAimTarget(ray: THREE.Ray, fallbackDistance: number, out: THREE.Vector3): boolean {
  let bestDistSq = Infinity;

  const wildlifeDistSq = intersectWildlifeAimTarget(ray, HUNT_AIM_MAX_DISTANCE, _aimObjectHit);
  if (wildlifeDistSq < bestDistSq) {
    bestDistSq = wildlifeDistSq;
    out.copy(_aimObjectHit);
  }

  const shipDistSq = intersectNpcShipAimTarget(ray, HUNT_AIM_MAX_DISTANCE, _aimObjectHit);
  if (shipDistSq < bestDistSq) {
    bestDistSq = shipDistSq;
    out.copy(_aimObjectHit);
  }

  const buildingDistSq = intersectBuildingAimTarget(ray, HUNT_AIM_MAX_DISTANCE, _aimObjectHit);
  if (buildingDistSq < bestDistSq) {
    bestDistSq = buildingDistSq;
    out.copy(_aimObjectHit);
  }

  const treeDistSq = intersectTreeAimTarget(ray, HUNT_AIM_MAX_DISTANCE, _aimObjectHit);
  if (treeDistSq < bestDistSq) {
    bestDistSq = treeDistSq;
    out.copy(_aimObjectHit);
  }

  const surfaceDistSq = intersectAimSurface(ray, HUNT_AIM_MAX_DISTANCE, _aimObjectHit);
  if (surfaceDistSq < bestDistSq) {
    bestDistSq = surfaceDistSq;
    out.copy(_aimObjectHit);
  }

  if (bestDistSq < Infinity) return true;
  out.copy(ray.direction).multiplyScalar(fallbackDistance).add(ray.origin);
  return true;
}

function predictLandImpactPoint(
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  speed: number,
  out: THREE.Vector3,
  outNormal: THREE.Vector3,
): LandImpactKind {
  _landPredictPos.copy(origin);
  _landPredictVel.copy(direction).multiplyScalar(speed);

  for (let t = 0; t < LAND_PROJECTILE_LIFE; t += LAND_MARKER_STEP) {
    const dt = Math.min(LAND_MARKER_STEP, LAND_PROJECTILE_LIFE - t);
    _predictSegmentStart.copy(_landPredictPos);
    _landPredictVel.y -= LAND_PROJECTILE_GRAVITY * dt;
    _landPredictPos.addScaledVector(_landPredictVel, dt);

    let bestT = Infinity;
    let bestKind: LandImpactKind = 'none';

    const wildlifeT = intersectWildlifeSegment(_predictSegmentStart, _landPredictPos, _segmentHit, _aimObjectNormal);
    if (wildlifeT < bestT) {
      bestT = wildlifeT;
      bestKind = 'wildlife';
      out.copy(_segmentHit);
      outNormal.copy(_aimObjectNormal);
    }

    const treeT = intersectTreeSegment(_predictSegmentStart, _landPredictPos, _segmentHit, _aimObjectNormal);
    if (treeT < bestT) {
      bestT = treeT;
      bestKind = 'tree';
      out.copy(_segmentHit);
      outNormal.copy(_aimObjectNormal);
    }

    const shipT = intersectNpcShipSegment(_predictSegmentStart, _landPredictPos, _segmentHit, _aimObjectNormal);
    if (shipT < bestT) {
      bestT = shipT;
      bestKind = 'surface';
      out.copy(_segmentHit);
      outNormal.copy(_aimObjectNormal);
    }

    const buildingT = intersectBuildingSegment(_predictSegmentStart, _landPredictPos, _segmentHit, _aimObjectNormal);
    if (buildingT < bestT) {
      bestT = buildingT;
      bestKind = 'surface';
      out.copy(_segmentHit);
      outNormal.copy(_aimObjectNormal);
    }

    const surfaceT = intersectSurfaceSegment(_predictSegmentStart, _landPredictPos, _segmentHit, _aimObjectNormal);
    if (surfaceT < bestT) {
      bestT = surfaceT;
      bestKind = 'surface';
      out.copy(_segmentHit);
      outNormal.copy(_aimObjectNormal);
    }

    if (bestKind !== 'none') {
      return bestKind;
    }
  }

  out.copy(_landPredictPos);
  outNormal.set(0, 1, 0);
  return 'none';
}

function spawnLandSurfaceImpact(x: number, z: number, intensity: number) {
  const surfaceY = aimSurfaceHeight(x, z);
  if (surfaceY <= SEA_LEVEL + 0.05) {
    spawnSplash(x, z, Math.min(0.45, intensity));
  } else {
    spawnImpactBurst(x, surfaceY, z, intensity);
  }
}

function pointHitsNpcShip(point: THREE.Vector3) {
  for (const npc of npcLivePositions.values()) {
    if (npc.sunk) continue;
    const dx = point.x - npc.x;
    const dy = point.y - npc.y;
    const dz = point.z - npc.z;
    if (dx * dx + dy * dy + dz * dz < npc.radius * npc.radius) {
      return npc;
    }
  }
  return null;
}

function pointHitsPlayerShip(point: THREE.Vector3) {
  const player = getLiveShipTransform();
  const dx = point.x - player.pos[0];
  const dy = point.y - (player.pos[1] + 1.4);
  const dz = point.z - player.pos[2];
  const radius = 4.5;
  return dx * dx + dz * dz < radius * radius && Math.abs(dy) < 3.2;
}

function npcProjectileDamage(weaponType: WeaponType | LandWeaponType) {
  if (weaponType === 'musket' || weaponType === 'bow') {
    return LAND_WEAPON_DEFS[weaponType].damage;
  }
  return WEAPON_DEFS[weaponType].damage;
}

function pointHitsBuilding(point: THREE.Vector3) {
  let hitBuilding: Building | null = null;
  eachNearbyBuilding((building) => {
    if (hitBuilding) return;
    const cx = building.position[0];
    const cy = building.position[1] + building.scale[1] * 0.5;
    const cz = building.position[2];
    const radius = buildingAimRadius(building);
    const dx = point.x - cx;
    const dy = point.y - cy;
    const dz = point.z - cz;
    if (dx * dx + dy * dy + dz * dz < radius * radius) {
      hitBuilding = building;
    }
  });
  return hitBuilding;
}

function buildingCanDeflect(building: Building) {
  return building.type === 'fort' || building.type === 'landmark' || building.type === 'palace';
}

function estimateBuildingRicochetNormal(building: Building, point: THREE.Vector3, out: THREE.Vector3) {
  out.set(point.x - building.position[0], 0.18, point.z - building.position[2]);
  if (out.lengthSq() < 1e-6) out.set(0, 0.18, 1);
  return out.normalize();
}

function pointHitsTree(point: THREE.Vector3) {
  for (const tree of getTreeImpactTargets()) {
    if (isTreeFelled(tree.kind, tree.index)) continue;
    const dx = point.x - tree.x;
    const dy = point.y - tree.y;
    const dz = point.z - tree.z;
    if (dx * dx + dy * dy + dz * dz < tree.radius * tree.radius) {
      return tree;
    }
  }
  return null;
}

function resolveCurrentHuntFire(origin: THREE.Vector3, direction: THREE.Vector3) {
  if (!huntAimValid) return false;
  const wp = getLiveWalkingTransform().pos;
  origin.set(wp[0], wp[1] + 1.4, wp[2]);
  direction.copy(huntAimTarget).sub(origin);
  if (direction.lengthSq() < 1e-6) return false;
  direction.normalize();
  // Muzzle origin: chest height + a short way along the current aim vector.
  origin.addScaledVector(direction, 0.8);
  return true;
}

// Bow-mounted swivel position in world space — matches the muzzle-flash math
// in Ship.tsx (SWIVEL_BOW_FORWARD along ship heading, SWIVEL_MUZZLE_HEIGHT up).
function getSwivelMountWorld(out: THREE.Vector3) {
  const { pos, rot } = getLiveShipTransform();
  out.set(
    pos[0] + Math.sin(rot) * SWIVEL_BOW_FORWARD,
    SWIVEL_MUZZLE_HEIGHT,
    pos[2] + Math.cos(rot) * SWIVEL_BOW_FORWARD,
  );
}

// Ship-mode aim resolver: naval targets remain valid, but swivel shots can
// also resolve shoreline wildlife, buildings, and trees so near-coast fire
// behaves like the visible world suggests.
function resolveSwivelAimTarget(ray: THREE.Ray, fallbackDistance: number, out: THREE.Vector3): boolean {
  let bestDistSq = Infinity;

  const wildlifeDistSq = intersectWildlifeAimTarget(ray, HUNT_AIM_MAX_DISTANCE, _aimObjectHit);
  if (wildlifeDistSq < bestDistSq) {
    bestDistSq = wildlifeDistSq;
    out.copy(_aimObjectHit);
  }

  const shipDistSq = intersectNpcShipAimTarget(ray, HUNT_AIM_MAX_DISTANCE, _aimObjectHit);
  if (shipDistSq < bestDistSq) {
    bestDistSq = shipDistSq;
    out.copy(_aimObjectHit);
  }

  const buildingDistSq = intersectBuildingAimTarget(ray, HUNT_AIM_MAX_DISTANCE, _aimObjectHit);
  if (buildingDistSq < bestDistSq) {
    bestDistSq = buildingDistSq;
    out.copy(_aimObjectHit);
  }

  const treeDistSq = intersectTreeAimTarget(ray, HUNT_AIM_MAX_DISTANCE, _aimObjectHit);
  if (treeDistSq < bestDistSq) {
    bestDistSq = treeDistSq;
    out.copy(_aimObjectHit);
  }

  const surfaceDistSq = intersectAimSurface(ray, HUNT_AIM_MAX_DISTANCE, _aimObjectHit);
  if (surfaceDistSq < bestDistSq) {
    bestDistSq = surfaceDistSq;
    out.copy(_aimObjectHit);
  }

  if (bestDistSq < Infinity) return true;
  out.copy(ray.direction).multiplyScalar(fallbackDistance).add(ray.origin);
  return true;
}

// Direct-aim solver: given a flat distance and vertical drop, returns the
// launch pitch needed for a projectile of `speed` to land at `(flatDist, dy)`
// under `gravity`. Picks the low (direct) trajectory. Returns null if out of
// reach. Used so the cannonball lands on whatever the player is pointing at.
function solveBallisticPitch(flatDist: number, dy: number, speed: number, gravity: number): number | null {
  const v2 = speed * speed;
  const disc = v2 * v2 - gravity * (gravity * flatDist * flatDist + 2 * dy * v2);
  if (disc < 0) return null;
  const sqrtDisc = Math.sqrt(disc);
  // Lower root → flatter trajectory (preferred).
  const tan = (v2 - sqrtDisc) / (gravity * flatDist);
  return Math.atan(tan);
}

function resolveCurrentSwivelFire(origin: THREE.Vector3, direction: THREE.Vector3) {
  if (!swivelAimValid) return false;
  getSwivelMountWorld(origin);
  const cosPitch = Math.cos(swivelAimPitch);
  direction.set(
    Math.sin(swivelAimAngle) * cosPitch,
    Math.sin(swivelAimPitch),
    Math.cos(swivelAimAngle) * cosPitch,
  );
  if (direction.lengthSq() < 1e-6) return false;
  direction.normalize();
  // Step forward along barrel so we don't spawn inside the ship hull.
  origin.addScaledVector(direction, SWIVEL_BARREL_FORWARD);
  return true;
}

function predictSwivelImpactPoint(
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  speed: number,
  gravity: number,
  out: THREE.Vector3,
  outNormal: THREE.Vector3,
): LandImpactKind {
  _landPredictPos.copy(origin);
  _landPredictVel.copy(direction).multiplyScalar(speed);

  for (let t = 0; t < SHIP_PROJECTILE_LIFE; t += LAND_MARKER_STEP) {
    const dt = Math.min(LAND_MARKER_STEP, SHIP_PROJECTILE_LIFE - t);
    _predictSegmentStart.copy(_landPredictPos);
    _landPredictVel.y -= gravity * dt;
    _landPredictPos.addScaledVector(_landPredictVel, dt);

    let bestT = Infinity;
    let bestKind: LandImpactKind = 'none';

    const wildlifeT = intersectWildlifeSegment(_predictSegmentStart, _landPredictPos, _segmentHit, _aimObjectNormal);
    if (wildlifeT < bestT) {
      bestT = wildlifeT;
      bestKind = 'wildlife';
      out.copy(_segmentHit);
      outNormal.copy(_aimObjectNormal);
    }

    const shipT = intersectNpcShipSegment(_predictSegmentStart, _landPredictPos, _segmentHit, _aimObjectNormal);
    if (shipT < bestT) {
      bestT = shipT;
      bestKind = 'wildlife'; // re-uses gold marker color for "valid hit"
      out.copy(_segmentHit);
      outNormal.copy(_aimObjectNormal);
    }

    const treeT = intersectTreeSegment(_predictSegmentStart, _landPredictPos, _segmentHit, _aimObjectNormal);
    if (treeT < bestT) {
      bestT = treeT;
      bestKind = 'tree';
      out.copy(_segmentHit);
      outNormal.copy(_aimObjectNormal);
    }

    const buildingT = intersectBuildingSegment(_predictSegmentStart, _landPredictPos, _segmentHit, _aimObjectNormal);
    if (buildingT < bestT) {
      bestT = buildingT;
      bestKind = 'surface';
      out.copy(_segmentHit);
      outNormal.copy(_aimObjectNormal);
    }

    const surfaceT = intersectSurfaceSegment(_predictSegmentStart, _landPredictPos, _segmentHit, _aimObjectNormal);
    if (surfaceT < bestT) {
      bestT = surfaceT;
      bestKind = 'surface';
      out.copy(_segmentHit);
      outNormal.copy(_aimObjectNormal);
    }

    if (bestKind !== 'none') return bestKind;
  }

  out.copy(_landPredictPos);
  outNormal.set(0, 1, 0);
  return 'none';
}

function landfallDescription(x: number, z: number): { title: string; subtitle: string } {
  const td = getTerrainData(x, z);
  const steep = td.coastSteepness > 0.6;
  const high = td.height > 12;

  const phrases: Record<string, { titles: string[]; subtitles: string[] }> = {
    beach: steep
      ? { titles: ['Scrambled ashore on a rocky coast', 'Climbed onto a craggy shoreline', 'Reached a wind-beaten rocky shore'],
          subtitles: ['Sharp stones and tide pools underfoot.', 'Gulls wheel above the spray.', 'The rocks are slick with brine.'] }
      : { titles: ['Made landfall on a sandy shore', 'Waded onto a stretch of white sand', 'Reached a quiet beach'],
          subtitles: ['Warm sand, gentle surf.', 'Crabs scatter at your approach.', 'Shells crunch underfoot.'] },
    desert: {
      titles: ['Stepped onto sun-baked sand', 'Made landfall on a barren coast', 'Reached a parched and dusty shore'],
      subtitles: ['The air shimmers with heat.', 'Not a drop of fresh water in sight.', 'Dry wind carries the scent of dust.'],
    },
    grassland: {
      titles: ['Found footing on a grassy headland', 'Reached a green and windswept shore', 'Made landfall on rolling coastal hills'],
      subtitles: ['Tall grass bends in the breeze.', 'The land smells of earth and rain.', 'A pleasant coast, open and airy.'],
    },
    forest: {
      titles: ['Landed beneath a canopy of trees', 'Made landfall on a wooded coast', 'Reached a forested shore'],
      subtitles: ['Birdsong from the treetops.', 'Dappled light through the leaves.', 'Timber aplenty here.'],
    },
    jungle: {
      titles: ['Pushed ashore through dense foliage', 'Landed on a tangled jungle coast', 'Reached a shore thick with vegetation'],
      subtitles: ['The air is heavy and humid.', 'Insects drone in the undergrowth.', 'Vines and roots crowd the shoreline.'],
    },
    swamp: {
      titles: ['Waded ashore through brackish shallows', 'Made landfall in marshy ground', 'Reached a muddy, waterlogged coast'],
      subtitles: ['The ground squelches underfoot.', 'Stagnant water and buzzing flies.', 'A miserable stretch of bog.'],
    },
    arroyo: {
      titles: ['Climbed onto dry, reddish rock', 'Made landfall on a sun-scorched canyon rim', 'Reached an arid, rocky shore'],
      subtitles: ['Cracked earth and sparse scrub.', 'The rock is warm to the touch.', 'A desolate but striking landscape.'],
    },
    snow: {
      titles: ['Landed on a frost-covered shore', 'Made landfall on frozen ground', 'Reached a bleak and icy coast'],
      subtitles: ['Snow crunches underfoot.', 'The cold bites immediately.', 'A bitter wind off the peaks.'],
    },
    volcano: {
      titles: ['Stepped onto black volcanic rock', 'Made landfall on a smoldering shore', 'Reached a coast of dark basalt'],
      subtitles: ['The ground radiates faint warmth.', 'Sulfur hangs in the air.', 'A forbidding, primordial landscape.'],
    },
    scrubland: {
      titles: ['Stepped onto dry, thorny ground', 'Made landfall on a scrubby coast', 'Reached a dusty shore dotted with thornbush'],
      subtitles: ['Dry twigs snap underfoot.', 'Thorny brush catches at your clothes.', 'The land is parched but not quite barren.'],
    },
    paddy: {
      titles: ['Waded into flooded rice fields', 'Stepped onto a muddy bund between paddies', 'Made landfall among terraced fields'],
      subtitles: ['Ankle-deep in warm, murky water.', 'Green shoots rise from flooded earth.', 'The air hums with insects and birdsong.'],
    },
  };

  const biome: string = td.biome === 'ocean' || td.biome === 'river' || td.biome === 'waterfall'
    ? (steep ? 'beach' : 'grassland') // fallback for water biomes at land edge
    : td.biome;

  const pool = phrases[biome] ?? phrases.beach;
  return { title: pick(pool.titles), subtitle: pick(pool.subtitles) };
}

// Custom camera controller with right-click-drag panning
function CameraController() {
  const setCameraZoom = useGameStore((state) => state.setCameraZoom);
  const setCameraRotation = useGameStore((state) => state.setCameraRotation);
  const { camera, gl } = useThree();
  const currentPos = useRef(new THREE.Vector3());
  const targetPos = useRef(new THREE.Vector3());

  // Pan state — all transient, no store needed
  const panOffset = useRef({ x: 0, z: 0 });
  const lastPlayerPos = useRef({ x: 0, z: 0 });
  const snapBack = useRef(false);

  // Smooth zoom — store a target and lerp toward it each frame
  const zoomTarget = useRef(useGameStore.getState().cameraZoom);

  // Camera orbit rotation — Z/X keys
  const rotationTarget = useRef(useGameStore.getState().cameraRotation);
  const rotationKeys = useRef({ z: false, x: false });

  // Raycaster for mouse→world projection (combat aiming)
  const raycaster = useRef(new THREE.Raycaster());
  const mouseNDC = useRef(new THREE.Vector2());
  const waterPlane = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));
  // Walking-mode aim plane — y constant updated each frame to walker's foot height
  const walkPlane = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));
  const hitVec = useRef(new THREE.Vector3());

  useEffect(() => {
    const el = gl.domElement;

    const handleWheel = (e: WheelEvent) => {
      // Scale step by both the raw wheel delta (trackpads send small deltas;
      // mouse wheels send ~100/detent) and current zoom, so fine trackpad
      // flicks nudge gently while mouse-wheel ticks still feel responsive.
      // DOM_DELTA_LINE (1) reports in lines, not pixels — normalize to ~16px.
      const deltaPx = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      const step = deltaPx * zoomTarget.current * 0.0018;
      zoomTarget.current = Math.max(10, Math.min(300, zoomTarget.current + step));
    };

    const handleContextMenu = (e: MouseEvent) => e.preventDefault();

    // Touch devices don't have a right mouse button for pan and don't fire
    // pointermove until a finger is down. They also shouldn't auto-fire on
    // tap — fire lives on a dedicated button. We detect via pointerType
    // inside each handler so a single listener handles both.
    const isTouchEvent = (e: PointerEvent) =>
      e.pointerType === 'touch' || e.pointerType === 'pen';

    // Multi-touch gesture tracking: pinch = zoom, two-finger drag = pan.
    // While a 2-finger gesture is active we suppress the single-finger aim
    // path so the pinch doesn't also yank the swivel gun around.
    const activeTouches = new Map<number, { x: number; y: number }>();
    let pinchActive = false;
    let pinchPrevDist = 0;
    let pinchPrevMidX = 0;
    let pinchPrevMidY = 0;

    const updateMouseNDC = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      mouseNDC.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouseNDC.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    };

    const pinchSnapshot = () => {
      const pts = Array.from(activeTouches.values());
      const dx = pts[0].x - pts[1].x;
      const dy = pts[0].y - pts[1].y;
      pinchPrevDist = Math.hypot(dx, dy);
      pinchPrevMidX = (pts[0].x + pts[1].x) * 0.5;
      pinchPrevMidY = (pts[0].y + pts[1].y) * 0.5;
    };

    const handlePointerMove = (e: PointerEvent) => {
      // Update touch tracking first so pinch math uses the newest point.
      if (isTouchEvent(e) && activeTouches.has(e.pointerId)) {
        activeTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }

      // Two-finger gesture active → pinch-zoom + two-finger pan.
      if (pinchActive && activeTouches.size === 2) {
        const pts = Array.from(activeTouches.values());
        const dx = pts[0].x - pts[1].x;
        const dy = pts[0].y - pts[1].y;
        const dist = Math.hypot(dx, dy);
        const midX = (pts[0].x + pts[1].x) * 0.5;
        const midY = (pts[0].y + pts[1].y) * 0.5;

        // Zoom: ratio of distance change maps to zoom scalar. Spread fingers
        // apart → zoom in (dist grows → ratio > 1 → zoom shrinks).
        if (pinchPrevDist > 0) {
          const ratio = pinchPrevDist / dist;
          zoomTarget.current = Math.max(10, Math.min(300, zoomTarget.current * ratio));
        }

        // Pan: midpoint delta in world units (same scale as desktop right-drag).
        const scale = zoomTarget.current / el.clientHeight * 2;
        panOffset.current.x -= (midX - pinchPrevMidX) * scale;
        panOffset.current.z -= (midY - pinchPrevMidY) * scale;
        snapBack.current = false;

        pinchPrevDist = dist;
        pinchPrevMidX = midX;
        pinchPrevMidY = midY;
        return;
      }

      // Single pointer — track mouse NDC for combat aiming. For touch, this
      // happens while a finger is dragging — which is the drag-to-aim flow.
      updateMouseNDC(e);

      // Right-button drag (buttons bitmask: 2 = right) for desktop pan.
      if (!(e.buttons & 2)) return;
      const { cameraZoom } = useGameStore.getState();
      const scale = cameraZoom / el.clientHeight * 2;
      panOffset.current.x -= e.movementX * scale;
      panOffset.current.z -= e.movementY * scale;
      snapBack.current = false;
    };

    const handlePointerDown = (e: PointerEvent) => {
      if (isTouchEvent(e)) {
        activeTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (activeTouches.size === 2) {
          pinchActive = true;
          pinchSnapshot();
          // Drop any in-flight single-finger fire state when a second finger
          // lands. (Desktop path already exits here so this is belt-and-braces.)
          setFireHeld(false);
          return;
        }
      }

      // Always sync NDC on down so a tap-and-release (no move) points at
      // whatever the player just touched — without this, a brand-new touch
      // in combat mode fires along the last cursor position.
      updateMouseNDC(e);

      // Desktop: left click in combat = fire.
      // Touch: never auto-fires from the canvas — the fire button in
      // TouchControls owns that so drag-to-aim doesn't also spam shots.
      if (isTouchEvent(e)) return;
      if (e.button === 0 && useGameStore.getState().combatMode) {
        setFireHeld(true);
      }
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (isTouchEvent(e)) {
        activeTouches.delete(e.pointerId);
        if (activeTouches.size < 2) {
          pinchActive = false;
          // If one finger is still down after a pinch, re-seed NDC from it so
          // aim snaps to where the remaining finger is (avoids a weird jump).
          if (activeTouches.size === 1) {
            const remaining = activeTouches.values().next().value;
            if (remaining) {
              const rect = el.getBoundingClientRect();
              mouseNDC.current.x = ((remaining.x - rect.left) / rect.width) * 2 - 1;
              mouseNDC.current.y = -((remaining.y - rect.top) / rect.height) * 2 + 1;
            }
          }
        }
        return;
      }
      if (e.button === 0) setFireHeld(false);
    };

    const handlePointerCancel = (e: PointerEvent) => {
      if (isTouchEvent(e)) {
        activeTouches.delete(e.pointerId);
        if (activeTouches.size < 2) pinchActive = false;
      }
    };

    // Z/X camera rotation keys (use window so they work even when canvas isn't focused)
    const isRotInputTarget = (t: EventTarget | null) =>
      t instanceof HTMLInputElement ||
      t instanceof HTMLTextAreaElement ||
      (t instanceof HTMLElement && t.isContentEditable);
    const isRotModalOpen = () => {
      const s = useGameStore.getState();
      return !!(s.activePort || s.activePOI);
    };
    const handleRotKeyDown = (e: KeyboardEvent) => {
      if (isRotInputTarget(e.target) || isRotModalOpen()) {
        rotationKeys.current.z = false;
        rotationKeys.current.x = false;
        return;
      }
      const k = e.key.toLowerCase();
      if (k === 'z') rotationKeys.current.z = true;
      if (k === 'x') rotationKeys.current.x = true;
      // Enter ends the intro cinematic on demand
      if (e.key === 'Enter' && isIntroCinematicActive()) skipIntroCinematic();
    };
    const handleRotKeyUp = (e: KeyboardEvent) => {
      if (isRotInputTarget(e.target) || isRotModalOpen()) return;
      const k = e.key.toLowerCase();
      if (k === 'z') rotationKeys.current.z = false;
      if (k === 'x') rotationKeys.current.x = false;
    };

    el.addEventListener('wheel', handleWheel);
    el.addEventListener('contextmenu', handleContextMenu);
    el.addEventListener('pointermove', handlePointerMove);
    el.addEventListener('pointerdown', handlePointerDown);
    el.addEventListener('pointerup', handlePointerUp);
    el.addEventListener('pointercancel', handlePointerCancel);
    window.addEventListener('keydown', handleRotKeyDown);
    window.addEventListener('keyup', handleRotKeyUp);
    return () => {
      el.removeEventListener('wheel', handleWheel);
      el.removeEventListener('contextmenu', handleContextMenu);
      el.removeEventListener('pointermove', handlePointerMove);
      el.removeEventListener('pointerdown', handlePointerDown);
      el.removeEventListener('pointerup', handlePointerUp);
      el.removeEventListener('pointercancel', handlePointerCancel);
      window.removeEventListener('keydown', handleRotKeyDown);
      window.removeEventListener('keyup', handleRotKeyUp);
    };
  }, [gl, setCameraZoom]);

  useFrame((_, delta) => {
    // Smooth zoom lerp — gentle ease-out
    const currentZoom = useGameStore.getState().cameraZoom;
    if (Math.abs(zoomTarget.current - currentZoom) > 0.05) {
      const lerpSpeed = 1 - Math.exp(-delta * 4); // gentler convergence so trackpad flicks don't snap
      setCameraZoom(currentZoom + (zoomTarget.current - currentZoom) * lerpSpeed);
    }

    // Camera orbit rotation — continuous while Z/X held
    const rotSpeed = 1.8; // radians per second
    if (rotationKeys.current.z) rotationTarget.current += rotSpeed * delta;
    if (rotationKeys.current.x) rotationTarget.current -= rotSpeed * delta;
    // Smooth lerp toward target
    const currentRot = useGameStore.getState().cameraRotation;
    if (Math.abs(rotationTarget.current - currentRot) > 0.001) {
      const rotLerp = 1 - Math.pow(0.001, delta);
      setCameraRotation(currentRot + (rotationTarget.current - currentRot) * rotLerp);
    }

    const { playerMode, cameraZoom, viewMode, cameraRotation } = useGameStore.getState();
    const shipTransform = getLiveShipTransform();
    const walkingTransform = getLiveWalkingTransform();
    const activePos = playerMode === 'ship' ? shipTransform.pos : walkingTransform.pos;
    const activeRot = playerMode === 'ship' ? shipTransform.rot : walkingTransform.rot;
    targetPos.current.set(activePos[0], activePos[1], activePos[2]);

    // Detect player movement → trigger snap-back
    const dx = activePos[0] - lastPlayerPos.current.x;
    const dz = activePos[2] - lastPlayerPos.current.z;
    if (dx * dx + dz * dz > 0.01) {
      snapBack.current = true;
    }
    lastPlayerPos.current.x = activePos[0];
    lastPlayerPos.current.z = activePos[2];

    // Smooth snap-back
    if (snapBack.current) {
      const a = 1 - Math.exp(-delta * 10);
      panOffset.current.x *= 1 - a;
      panOffset.current.z *= 1 - a;
      if (panOffset.current.x * panOffset.current.x + panOffset.current.z * panOffset.current.z < 0.1) {
        panOffset.current.x = 0;
        panOffset.current.z = 0;
        snapBack.current = false;
      }
    }

    if (playerMode === 'ship') {
      currentPos.current.copy(targetPos.current);
    } else {
      const followAlpha = 1 - Math.exp(-delta * 14);
      currentPos.current.lerp(targetPos.current, followAlpha);
    }

    // Apply pan offset
    currentPos.current.x += panOffset.current.x;
    currentPos.current.z += panOffset.current.z;

    // Pre-compute rotation sin/cos for orbit
    const sinR = Math.sin(cameraRotation);
    const cosR = Math.cos(cameraRotation);

    if (viewMode === 'firstperson') {
      // First-person: camera at eye level, looking in heading direction (rotation not applied — you look where the ship faces)
      camera.position.x = currentPos.current.x;
      camera.position.y = currentPos.current.y + (playerMode === 'ship' ? 4 : 2);
      camera.position.z = currentPos.current.z;
      camera.lookAt(
        currentPos.current.x + Math.sin(activeRot) * 10,
        currentPos.current.y + (playerMode === 'ship' ? 3 : 1.5),
        currentPos.current.z + Math.cos(activeRot) * 10
      );
    } else if (viewMode === 'cinematic') {
      // Cinematic: close behind-and-above follow, rotated by orbit angle
      const dist = Math.min(cameraZoom, 20);
      const behindX = -Math.sin(activeRot + cameraRotation) * dist * 0.8;
      const behindZ = -Math.cos(activeRot + cameraRotation) * dist * 0.8;
      camera.position.x = currentPos.current.x + behindX;
      camera.position.y = currentPos.current.y + dist * 0.5;
      camera.position.z = currentPos.current.z + behindZ;
      camera.lookAt(
        currentPos.current.x + Math.sin(activeRot) * 5,
        currentPos.current.y + 1,
        currentPos.current.z + Math.cos(activeRot) * 5
      );
    } else if (viewMode === 'topdown') {
      // Top-down strategic view — orbit offset so it's not perfectly vertical
      const tinyOffset = 0.01;
      camera.position.x = currentPos.current.x + sinR * tinyOffset;
      camera.position.y = currentPos.current.y + cameraZoom * 1.5;
      camera.position.z = currentPos.current.z + cosR * tinyOffset;
      camera.lookAt(currentPos.current);
    } else {
      // Default: 45-degree diagonal view, rotated around player by orbit angle
      const offsetX = cameraZoom * 0.5;
      const offsetZ = cameraZoom;
      // Rotate the offset vector around Y axis
      const rotatedX = offsetX * cosR + offsetZ * sinR;
      const rotatedZ = -offsetX * sinR + offsetZ * cosR;
      camera.position.x = currentPos.current.x + rotatedX;
      camera.position.y = currentPos.current.y + cameraZoom;
      camera.position.z = currentPos.current.z + rotatedZ;
      camera.lookAt(currentPos.current);
    }

    // Intro cinematic — orbit + dolly-in onto the ship after the Commission
    // modal closes. Reshapes the gameplay pose so the cinematic ends *exactly*
    // at the gameplay pose (no snap on hand-off).
    const intro = sampleIntroCinematic(delta);
    if (intro.active && playerMode === 'ship' && viewMode !== 'firstperson') {
      const targetX = currentPos.current.x;
      const targetY = currentPos.current.y;
      const targetZ = currentPos.current.z;
      // Vector from ship → gameplay camera, rotate it by sweepAngle and
      // extend by distBoost so the intro pose is a wider, swung-around variant.
      const dx = camera.position.x - targetX;
      const dz = camera.position.z - targetZ;
      const len = Math.hypot(dx, dz);
      if (len > 0.001) {
        const nx = dx / len;
        const nz = dz / len;
        const cs = Math.cos(intro.sweepAngle);
        const sn = Math.sin(intro.sweepAngle);
        const rotX = nx * cs - nz * sn;
        const rotZ = nx * sn + nz * cs;
        const newLen = len + intro.distBoost;
        camera.position.x = targetX + rotX * newLen;
        camera.position.z = targetZ + rotZ * newLen;
        camera.position.y += intro.heightBoost;
        camera.lookAt(targetX, targetY + 0.5, targetZ);
      }
    }

    // Camera shake/kick — applied on top of the base position set above.
    // World-space offset so the jitter doesn't rotate with cameraRotation.
    const shake = sampleCameraShake(delta);
    camera.position.x += shake.x;
    camera.position.y += shake.y;
    camera.position.z += shake.z;

    // FOV pulse — sprint engages a forward lurch (+deg), collisions a stop hit (-deg).
    // Lerp toward the pulse target each frame so the swing has shape, not snap.
    // Intro cinematic adds a wider base FOV that eases back to gameplay — the
    // world "exhales" into normal lensing as the dolly settles.
    if (camera instanceof THREE.PerspectiveCamera) {
      const baseFov = 45 + intro.fovBoost;
      const pulseTarget = baseFov + sampleCameraFovPulse(delta);
      // Intro: snap FOV close to its target so the breathe shape isn't
      // smeared by the smoothing lerp; gameplay: keep the gentler ease so
      // pulses still have shape.
      const fovLerp = intro.active
        ? 1 - Math.exp(-delta * 30)
        : 1 - Math.exp(-delta * 12);
      camera.fov += (pulseTarget - camera.fov) * fovLerp;
      camera.updateProjectionMatrix();
    }

    // Raycast mouse onto a horizontal plane — always active so aiming is ready when combat starts.
    // In ship mode, use the y=0 water plane. In walking mode, use a plane at the walker's
    // foot height so aiming on hilly terrain doesn't skew the cursor target.
    raycaster.current.setFromCamera(mouseNDC.current, camera);
    mouseRay.origin.copy(raycaster.current.ray.origin);
    mouseRay.direction.copy(raycaster.current.ray.direction);
    mouseRay.valid = true;

    const inWalkingMode = playerMode === 'walking';
    const aimPlane = inWalkingMode ? walkPlane.current : waterPlane.current;
    if (inWalkingMode) {
      // Update plane height to walker's y each frame (player can climb hills).
      walkPlane.current.constant = -walkingTransform.pos[1];
    }

    mouseWorldPos.valid = false;
    if (raycaster.current.ray.intersectPlane(aimPlane, hitVec.current)) {
      mouseWorldPos.x = hitVec.current.x;
      mouseWorldPos.z = hitVec.current.z;
      mouseWorldPos.valid = true;
    }

    // Update per-frame aim helpers so intersection functions are zoom-independent:
    // _aimGroundT  — T-value along the mouse ray where it crosses the aim plane
    // _aimPlayerOrigin — world position of the player/ship for range culling
    _aimGroundT = mouseWorldPos.valid
      ? raycaster.current.ray.origin.distanceTo(hitVec.current)
      : HUNT_AIM_FALLBACK_DISTANCE;
    if (inWalkingMode) {
      const wp = walkingTransform.pos;
      _aimPlayerOrigin.set(wp[0], wp[1], wp[2]);
    } else {
      const sp = getLiveShipTransform().pos;
      _aimPlayerOrigin.set(sp[0], sp[1], sp[2]);
    }

    if (inWalkingMode && resolveHuntAimTarget(raycaster.current.ray, HUNT_AIM_FALLBACK_DISTANCE, _huntAimTarget)) {
      const wp = walkingTransform.pos;
      const aimSourceY = wp[1] + 1.4;
      const dx = _huntAimTarget.x - wp[0];
      const dy = _huntAimTarget.y - aimSourceY;
      const dz = _huntAimTarget.z - wp[2];
      const flatDist = Math.sqrt(dx * dx + dz * dz);
      const pitch = THREE.MathUtils.clamp(Math.atan2(dy, Math.max(0.001, flatDist)), HUNT_VISUAL_PITCH_MIN, HUNT_VISUAL_PITCH_MAX);
      setHuntAim(Math.atan2(dx, dz), pitch, _huntAimTarget);
    }

    // Ship-mode swivel aim — solve a real 3D target under the cursor, then
    // compute yaw + ballistic pitch from the bow-mounted gun. Pitch comes from
    // a direct-fire ballistic solver so the cannonball lands on the cursor
    // target instead of using the old fixed +0.35 arc.
    if (!inWalkingMode) {
      const combatActive = useGameStore.getState().combatMode;
      if (!combatActive) {
        clearSwivelAim();
      } else if (resolveSwivelAimTarget(raycaster.current.ray, HUNT_AIM_FALLBACK_DISTANCE, _swivelAimTarget)) {
        getSwivelMountWorld(_swivelMuzzleOrigin);
        const dx = _swivelAimTarget.x - _swivelMuzzleOrigin.x;
        const dy = _swivelAimTarget.y - _swivelMuzzleOrigin.y;
        const dz = _swivelAimTarget.z - _swivelMuzzleOrigin.z;
        const flatDist = Math.max(0.001, Math.sqrt(dx * dx + dz * dz) - SWIVEL_BARREL_FORWARD);
        const yaw = Math.atan2(dx, dz);
        const selected = resolveActiveBowWeapon(useGameStore.getState().stats.armament);
        const speed = bowWeaponLaunchSpeed(selected);
        const gravity = bowWeaponGravity(selected);
        const ballistic = bowWeaponUsesBallisticArc(selected)
          ? solveBallisticPitch(Math.max(0.001, flatDist), dy, speed, gravity)
          : null;
        const rawPitch = ballistic ?? Math.atan2(dy, Math.max(0.001, flatDist));
        const pitch = THREE.MathUtils.clamp(rawPitch, SWIVEL_VISUAL_PITCH_MIN, SWIVEL_VISUAL_PITCH_MAX);
        setSwivelAim(yaw, pitch, _swivelAimTarget);
      }
    }
  });

  return null;
}

// ── Land weapon fire ────────────────────────────────────────────────────────
// Mirrors the swivel gun fire path, but originates from the walking player
// and targets wildlife. Reload is per-weapon (musket and bow tracked
// independently in landWeaponReload).
function tryFireLandWeapon() {
  const state = useGameStore.getState();
  if (!state.combatMode || state.playerMode !== 'walking') return;
  if (!huntAimValid) return;

  const weaponId = state.activeLandWeapon;
  const def = LAND_WEAPON_DEFS[weaponId];
  const now = Date.now();
  const readyAt = landWeaponReload[weaponId] ?? 0;
  if (now < readyAt) return;

  if (!resolveCurrentHuntFire(_huntAimFireOrigin, _huntAimFireDir)) return;

  // Ammo check (musket needs Small Shot, bow is free)
  if (def.ammoCommodity) {
    const have = state.cargo[def.ammoCommodity] ?? 0;
    if (have < def.ammoPerShot) {
      state.addNotification(`Out of ${def.ammoCommodity}!`, 'warning');
      // Penalty cooldown so we don't spam the warning
      landWeaponReload[weaponId] = now + 1000;
      return;
    }
    useGameStore.setState({
      cargo: { ...state.cargo, [def.ammoCommodity]: have - def.ammoPerShot },
    });
  }

  landWeaponReload[weaponId] = now + def.reloadTime * 1000;

  spawnProjectile(_huntAimFireOrigin, _huntAimFireDir, def.projectileSpeed, weaponId);
  if (weaponId === 'musket') {
    spawnMuzzleBurst(
      _huntAimFireOrigin.x,
      _huntAimFireOrigin.y,
      _huntAimFireOrigin.z,
      _huntAimFireDir.x,
      _huntAimFireDir.y,
      _huntAimFireDir.z,
      0.85,
    );
  }

  if (weaponId === 'musket') {
    sfxMusket();
    window.dispatchEvent(new CustomEvent('musket-fired', {
      detail: {
        x: _huntAimFireOrigin.x,
        y: _huntAimFireOrigin.y,
        z: _huntAimFireOrigin.z,
        dirX: _huntAimFireDir.x,
        dirY: _huntAimFireDir.y,
        dirZ: _huntAimFireDir.z,
      },
    }));
  } else {
    sfxBowRelease();
    window.dispatchEvent(new CustomEvent('bow-fired', {
      detail: {
        x: _huntAimFireOrigin.x,
        y: _huntAimFireOrigin.y,
        z: _huntAimFireOrigin.z,
        dirX: _huntAimFireDir.x,
        dirY: _huntAimFireDir.y,
        dirZ: _huntAimFireDir.z,
      },
    }));
  }
}

// Interaction controller
// Shared fire logic — called by held mouse/touch fire
const lastFireTimeGlobal = { current: 0 };

function mountedBowWeapons(armament: WeaponType[]) {
  return armament.filter((w) => WEAPON_DEFS[w].aimable);
}

function resolveActiveBowWeapon(armament: WeaponType[]): WeaponType {
  const bowWeapons = mountedBowWeapons(armament);
  if (bowWeapons.length === 0) return 'swivelGun';
  if (bowWeapons.includes(activeBowWeapon)) return activeBowWeapon;
  // Prefer the rocket rack on first resolve — it's the signature aimable on
  // Junk/Jong, so defaulting to the swivel feels wrong on a fresh Chinese run.
  const next = bowWeapons.includes('fireRocket') ? 'fireRocket' : bowWeapons[0];
  setActiveBowWeapon(next);
  return next;
}

function cycleActiveBowWeapon(armament: WeaponType[]) {
  const bowWeapons = mountedBowWeapons(armament);
  if (bowWeapons.length <= 1) return null;
  const current = resolveActiveBowWeapon(armament);
  const idx = bowWeapons.indexOf(current);
  const next = bowWeapons[(idx + 1) % bowWeapons.length];
  setActiveBowWeapon(next);
  return next;
}

function tryFireBowWeapon() {
  const now = Date.now();
  const state = useGameStore.getState();
  if (!state.combatMode || state.playerMode !== 'ship') return;
  const bowWeapon = resolveActiveBowWeapon(state.stats.armament);
  const reloadMs = WEAPON_DEFS[bowWeapon].reloadTime * 1000;
  if (now - lastFireTimeGlobal.current < reloadMs) return;
  const ammoCommodity = bowWeapon === 'fireRocket'
    ? 'War Rockets'
    : bowWeapon === 'falconet'
      ? 'Cannon Shot'
      : 'Small Shot';
  if (bowWeapon === 'fireRocket') {
    const rocketsOnHand = state.cargo['War Rockets'] ?? 0;
    if (rocketsOnHand < 1) {
      state.addNotification('No war rockets loaded! Resupply at Macau.', 'warning');
      lastFireTimeGlobal.current = now;
      bowWeaponReload[bowWeapon] = now + reloadMs;
      return;
    }
  } else if (bowWeapon === 'falconet') {
    const cannonShot = state.cargo['Cannon Shot'] ?? 0;
    if (cannonShot < 1) {
      state.addNotification('Out of Cannon Shot!', 'warning');
      lastFireTimeGlobal.current = now;
      bowWeaponReload[bowWeapon] = now + reloadMs;
      return;
    }
  } else {
    const smallShot = state.cargo['Small Shot'] ?? 0;
    if (smallShot < 1) {
      state.addNotification('Out of Small Shot!', 'warning');
      lastFireTimeGlobal.current = now;
      bowWeaponReload[bowWeapon] = now + reloadMs;
      return;
    }
  }
  // Fire along the resolved 3D aim — pitch is set by the ballistic solver in
  // CameraController so the round lands where the marker shows.
  if (!resolveCurrentSwivelFire(_swivelMuzzleOrigin, _swivelFireDir)) return;

  const targetDistance = _swivelMuzzleOrigin.distanceTo(swivelAimTarget);
  const effectiveRange = WEAPON_DEFS[bowWeapon].range;
  if (targetDistance > effectiveRange) {
    const overshoot = Math.min(1, (targetDistance - effectiveRange) / Math.max(1, effectiveRange));
    const yawDrift = (Math.random() - 0.5) * overshoot * (bowWeapon === 'swivelGun' ? 0.08 : 0.2);
    const pitchDrift = (Math.random() - 0.5) * overshoot * (bowWeapon === 'swivelGun' ? 0.04 : 0.12);
    const driftedYaw = swivelAimAngle + yawDrift;
    const driftedPitch = THREE.MathUtils.clamp(swivelAimPitch + pitchDrift, SWIVEL_VISUAL_PITCH_MIN, SWIVEL_VISUAL_PITCH_MAX);
    const cosPitch = Math.cos(driftedPitch);
    _swivelFireDir.set(
      Math.sin(driftedYaw) * cosPitch,
      Math.sin(driftedPitch),
      Math.cos(driftedYaw) * cosPitch,
    ).normalize();
  }

  lastFireTimeGlobal.current = now;
  bowWeaponReload[bowWeapon] = now + reloadMs;
  if (bowWeapon === 'fireRocket') {
    const yawDrift = (Math.random() - 0.5) * (Math.PI / 55);
    const pitchDrift = (Math.random() - 0.5) * (Math.PI / 70);
    const cosY = Math.cos(yawDrift);
    const sinY = Math.sin(yawDrift);
    const dx = _swivelFireDir.x;
    const dz = _swivelFireDir.z;
    _swivelFireDir.x = dx * cosY - dz * sinY;
    _swivelFireDir.z = dx * sinY + dz * cosY;
    _swivelFireDir.y += pitchDrift;
    _swivelFireDir.normalize();
    useGameStore.setState({
      cargo: { ...state.cargo, 'War Rockets': (state.cargo['War Rockets'] ?? 0) - 1 },
    });
    spawnProjectile(_swivelMuzzleOrigin, _swivelFireDir, bowWeaponLaunchSpeed(bowWeapon), bowWeapon);
    sfxRocketFire();
    const estFlightTime = Math.min(2.3, targetDistance / (bowWeaponLaunchSpeed(bowWeapon) * 0.8));
    sfxRocketWhistle(estFlightTime);
  } else {
    useGameStore.setState({
      cargo: { ...state.cargo, [ammoCommodity]: (state.cargo[ammoCommodity] ?? 0) - 1 },
    });
    spawnProjectile(_swivelMuzzleOrigin, _swivelFireDir, bowWeaponLaunchSpeed(bowWeapon), bowWeapon);
    sfxCannonFire();
  }
  // Notify Ship.tsx to spawn muzzle flash particles
  window.dispatchEvent(new CustomEvent('swivel-fired'));
}

// ── Broadside fire ─────────────────────────────────────────────────────────
// side: 'port' (left) or 'starboard' (right)
function tryFireBroadside(side: 'port' | 'starboard') {
  const now = Date.now();
  if (now < broadsideReload[side]) return;

  const state = useGameStore.getState();
  if (!state.combatMode || state.playerMode !== 'ship') return;

  // Collect broadside weapons (everything non-aimable in armament)
  const broadsideWeapons = state.stats.armament.filter(w => !WEAPON_DEFS[w].aimable);
  if (broadsideWeapons.length === 0) {
    state.addNotification('No broadside cannons mounted!', 'warning');
    return;
  }

  // Check ammo
  if ((state.cargo['Cannon Shot'] ?? 0) < broadsideWeapons.length) {
    state.addNotification('Not enough Cannon Shot loaded.', 'warning');
    return;
  }

  // Consume round shot
  const newCargo = { ...state.cargo, 'Cannon Shot': (state.cargo['Cannon Shot'] ?? 0) - broadsideWeapons.length };
  // Use direct set via store — can't call buyCommodity here
  useGameStore.setState({ cargo: newCargo });

  const { pos: shipPos, rot: shipRot } = getLiveShipTransform();

  // Perpendicular direction: port = left of heading, starboard = right
  const sideAngle = side === 'port'
    ? shipRot + Math.PI / 2   // left
    : shipRot - Math.PI / 2;  // right
  const sideDir = new THREE.Vector3(Math.sin(sideAngle), 0, Math.cos(sideAngle)).normalize();

  // Ship hull half-width for gun port positions
  const HULL_HALF_WIDTH = 1.2;
  // Gun ports are spaced along the ship's length
  const SHIP_LENGTH = 6;

  // Determine reload time from the slowest weapon in the broadside
  let maxReload = 0;
  for (const wt of broadsideWeapons) {
    maxReload = Math.max(maxReload, WEAPON_DEFS[wt].reloadTime);
  }
  // Gunner skill bonus: find best gunner, reduce reload by up to 20%
  const gunner = state.crew.find(c => c.role === 'Gunner');
  const gunnerBonus = gunner ? 1 - (gunner.skill / 500) : 1; // skill 100 → 20% faster
  broadsideReload[side] = now + maxReload * 1000 * gunnerBonus;

  // Elevation charge: hold SPACE in combat mode to loft cannonballs at shore targets.
  // At charge=0: low, fast, ship-to-ship fire. As charge rises, angle rises and
  // intended range shortens so misses visibly splash/drop near the fight instead
  // of sailing out to the horizon.
  const elevCharge = getCurrentElevationCharge();

  // Queue rolling broadside — stagger each cannon by ~150ms
  const STAGGER_MS = 150;
  broadsideWeapons.forEach((weaponType, idx) => {
    // Position along ship length: spread guns evenly from stern to bow
    const t = broadsideWeapons.length === 1 ? 0.5 : idx / (broadsideWeapons.length - 1);
    const alongShip = (t - 0.5) * SHIP_LENGTH;

    const originX = shipPos[0] + Math.sin(shipRot) * alongShip + sideDir.x * HULL_HALF_WIDTH;
    const originZ = shipPos[2] + Math.cos(shipRot) * alongShip + sideDir.z * HULL_HALF_WIDTH;
    const origin = new THREE.Vector3(originX, 1.2, originZ);

    // Direction: perpendicular + slight random spread (±5°, tightens at elevation)
    const spread = (Math.random() - 0.5) * (0.17 - elevCharge * 0.08);
    const dirAngle = sideAngle + spread;
    const angleDeg = THREE.MathUtils.lerp(5, 48, Math.pow(elevCharge, 0.85));
    const angleRad = THREE.MathUtils.degToRad(angleDeg + (Math.random() - 0.5) * 2.2);
    const horizontal = Math.cos(angleRad);
    const dir = new THREE.Vector3(
      Math.sin(dirAngle) * horizontal,
      Math.sin(angleRad),
      Math.cos(dirAngle) * horizontal,
    ).normalize();

    const lowRange = WEAPON_DEFS[weaponType].range * THREE.MathUtils.lerp(0.95, 1.18, Math.random());
    const lobRange = THREE.MathUtils.lerp(24, 42, Math.random());
    const intendedRange = THREE.MathUtils.lerp(lowRange, lobRange, Math.pow(elevCharge, 0.72));
    const sin2 = Math.max(0.12, Math.sin(angleRad * 2));
    const speed = THREE.MathUtils.clamp(
      Math.sqrt((intendedRange * SHIP_PROJECTILE_GRAVITY) / sin2),
      24,
      125,
    );

    broadsideQueue.push({
      fireAt: now + idx * STAGGER_MS,
      origin,
      direction: dir,
      speed,
      weaponType,
      maxDistance: intendedRange * 1.08,
      fired: false,
    });
  });

  // Notify Ship.tsx for smoke effects
  window.dispatchEvent(new CustomEvent('broadside-fired', { detail: { side } }));
  addCameraShake(Math.min(0.62, 0.28 + broadsideWeapons.length * 0.045));
  addCameraFovPulse(-1.4);
  const elevMsg = elevCharge > 0.15 ? ` — elevated ${Math.round(THREE.MathUtils.lerp(5, 48, Math.pow(elevCharge, 0.85)))}°` : '';
  state.addNotification(
    `${side === 'port' ? 'Port' : 'Starboard'} broadside! (${broadsideWeapons.length} guns)${elevMsg}`,
    'info',
  );
}

// Shared between InteractionController (which detects the nearest un-harvested
// carcass) and the keydown handler (which consumes it when the player hits
// SPACE). Lives at module scope so the ref survives re-renders.
const harvestTargetIdRef = { current: null as string | null };
const HARVEST_RADIUS_SQ = 3.0 * 3.0;

function InteractionController() {
  const nearestLandRef = useRef<[number, number, number] | null>(null);
  const nextCheckRef = useRef(0);
  const promptRef = useRef<string | null>(null);

  useFrame((_, delta) => {
    nextCheckRef.current -= delta;
    if (nextCheckRef.current > 0) return;
    nextCheckRef.current = 0.1;

    const {
      playerMode,
      ports,
      discoverPort,
      setInteractionPrompt,
    } = useGameStore.getState();
    const shipTransform = getLiveShipTransform();
    const walkingTransform = getLiveWalkingTransform();
    const playerPos = shipTransform.pos;
    const playerRot = shipTransform.rot;
    const walkingPos = walkingTransform.pos;
    const activePos = playerMode === 'ship' ? playerPos : walkingPos;
    
    // Check for nearby ports to discover (Navigator perception + Keen Eye trait extend range)
    const discState = useGameStore.getState();
    const navDiscBonus = getRoleBonus(discState, 'Navigator', 'perception');
    const keenEyeBonus = captainHasTrait(discState, 'Keen Eye') ? 1.25 : 1.0;
    const discoveryRange = 60 * navDiscBonus * keenEyeBonus;
    ports.forEach(port => {
      const dist = Math.sqrt((port.position[0] - activePos[0])**2 + (port.position[2] - activePos[2])**2);
      if (dist < discoveryRange) {
        discoverPort(port.id);
      }
    });

    if (playerMode === 'ship') {
      // Find nearest land — require height well above sea level so we don't
      // detect tiny noise spikes that the rendered terrain grid doesn't show.
      let foundLand: [number, number, number] | null = null;
      let minDist = Infinity;
      const LAND_THRESHOLD = SEA_LEVEL + 0.6;

      // Scan in a radius around the ship
      for (let r = 3; r <= 12; r += 3) {
        for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
          const cx = playerPos[0] + Math.cos(a) * r;
          const cz = playerPos[2] + Math.sin(a) * r;
          const height = getTerrainHeight(cx, cz);

          if (height > LAND_THRESHOLD) {
            const d = Math.sqrt((cx - playerPos[0])**2 + (cz - playerPos[2])**2);
            if (d < minDist) {
              minDist = d;
              foundLand = [cx, height, cz];
            }
          }
        }
      }

      // Slope check — cliff shores reject disembark. Sample 4 cardinal
      // neighbors 3m inland and compare to the landing point. A rise of
      // >4m over 3m (~53°) is treated as a cliff face.
      let tooSteep = false;
      if (foundLand) {
        const [lx, ly, lz] = foundLand;
        const SAMPLE = 3;
        const STEEP_RISE = 4.0;
        const hN = getTerrainHeight(lx, lz - SAMPLE);
        const hS = getTerrainHeight(lx, lz + SAMPLE);
        const hE = getTerrainHeight(lx + SAMPLE, lz);
        const hW = getTerrainHeight(lx - SAMPLE, lz);
        const maxInland = Math.max(hN, hS, hE, hW);
        if (maxInland - ly > STEEP_RISE) tooSteep = true;
      }

      nearestLandRef.current = tooSteep ? null : foundLand;

      const nextPrompt = foundLand
        ? (tooSteep ? 'Shore too steep — find lower ground' : 'Press E to Disembark')
        : null;
      if (promptRef.current !== nextPrompt) {
        promptRef.current = nextPrompt;
        setInteractionPrompt(nextPrompt);
      }
    } else {
      // Walking: prefer a nearby un-harvested carcass over the embark prompt.
      let harvestId: string | null = null;
      let harvestDistSq = HARVEST_RADIUS_SQ;
      for (const [id, w] of wildlifeLivePositions) {
        if (!w.dead || w.harvested) continue;
        const wx = w.x - walkingPos[0];
        const wz = w.z - walkingPos[2];
        const dsq = wx * wx + wz * wz;
        if (dsq < harvestDistSq) {
          harvestDistSq = dsq;
          harvestId = id;
        }
      }
      harvestTargetIdRef.current = harvestId;

      let nextPrompt: string | null = null;
      if (harvestId) {
        nextPrompt = 'Press SPACE to Harvest';
      } else {
        const dx = walkingPos[0] - playerPos[0];
        const dz = walkingPos[2] - playerPos[2];
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < 15) nextPrompt = 'Press E to Embark';
      }
      if (promptRef.current !== nextPrompt) {
        promptRef.current = nextPrompt;
        setInteractionPrompt(nextPrompt);
      }
    }
  }, -1);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const t = e.target;
      if (
        t instanceof HTMLInputElement ||
        t instanceof HTMLTextAreaElement ||
        (t instanceof HTMLElement && t.isContentEditable)
      ) return;
      const state = useGameStore.getState();
      if (state.activePort || state.activePOI) return;
      const key = e.key.toLowerCase();
      if (key === 'e') {
        if (state.interactionPrompt === 'Shore too steep — find lower ground') {
          sfxDisembarkBlocked();
          return;
        }
        if (state.interactionPrompt === 'Press E to Disembark' && nearestLandRef.current) {
          const landPos = nearestLandRef.current;
          const { rot } = getLiveShipTransform();
          state.setWalkingPos(landPos);
          state.setWalkingRot(rot);
          state.setPlayerMode('walking');
          state.setInteractionPrompt(null);
          sfxDisembark();
          // Landfall toast based on terrain biome
          const desc = landfallDescription(landPos[0], landPos[2]);
          state.addNotification(desc.title, 'info', { size: 'grand', subtitle: desc.subtitle });
        } else if (state.playerMode === 'walking') {
          // Embark works whenever the player is walking and near the ship,
          // even if the prompt currently advertises a different action (e.g.
          // a fresh carcass sitting near the shore stole the harvest prompt).
          const shipPos = getLiveShipTransform().pos;
          const walkPos = getLiveWalkingTransform().pos;
          const dxe = walkPos[0] - shipPos[0];
          const dze = walkPos[2] - shipPos[2];
          if (dxe * dxe + dze * dze < 15 * 15) {
            state.setPlayerMode('ship');
            state.setInteractionPrompt(null);
            sfxEmbark();
          }
        }
      } else if (e.key === ' ') {
        if (state.interactionPrompt === 'Press SPACE to Harvest' && state.playerMode === 'walking') {
          const id = harvestTargetIdRef.current;
          if (!id) return;
          const w = wildlifeLivePositions.get(id);
          if (!w || !w.dead || w.harvested) return;
          // Re-verify proximity. The scan runs at 10Hz, so the player can
          // drift out of range in the gap — check against the live walking
          // transform (plus a small grace buffer) before committing.
          const walkPos = getLiveWalkingTransform().pos;
          const dxh = w.x - walkPos[0];
          const dzh = w.z - walkPos[2];
          if (dxh * dxh + dzh * dzh > HARVEST_RADIUS_SQ * 1.5) return;
          w.harvested = true;
          harvestTargetIdRef.current = null;
          state.setInteractionPrompt(null);
          // Delightful feedback: spatial SFX + dust cloud at the carcass
          sfxHarvest(w.x, w.z);
          spawnImpactBurst(w.x, w.y + 0.1, w.z, 0.55);
          // A second, offset puff a beat later — reads as the animal "going down"
          setTimeout(() => spawnImpactBurst(w.x, w.y + 0.05, w.z, 0.3), 180);
          const loot = lootForKill(w.template, w.variant);
          const name = loot?.commonName ?? w.variant;
          if (loot) {
            const newCargo = { ...state.cargo };
            const dropParts: string[] = [];
            for (const drop of loot.drops) {
              newCargo[drop.commodity] = (newCargo[drop.commodity] ?? 0) + drop.amount;
              dropParts.push(`+${drop.amount} ${drop.commodity}`);
            }
            useGameStore.setState({ cargo: newCargo });
            state.addNotification(`Harvested the ${name}.`, 'success', {
              subtitle: dropParts.join(' · '),
            });
            spawnFloatingLoot(w.x, w.y + 0.6, w.z, dropParts);
          } else {
            state.addNotification(`Harvested the ${name}.`, 'success');
            spawnFloatingLoot(w.x, w.y + 0.6, w.z, [`+ ${name}`]);
          }
        } else if (state.playerMode === 'ship') {
          e.preventDefault();
          if (state.combatMode) {
            // Hold SPACE to charge broadside elevation for shore bombardment.
            // Q/R fired while held uses the built-up elevation angle.
            if (elevationHoldStart === null) setElevationHoldStart(Date.now());
          } else {
            // Spacebar in normal mode = toggle anchor
            const nextAnchored = !state.anchored;
            state.setAnchored(nextAnchored);
            if (nextAnchored) {
              sfxAnchorDrop();
              state.addNotification('Anchor dropped.', 'info');
            } else {
              sfxAnchorWeigh();
              state.addNotification('Weighing anchor.', 'info');
            }
          }
        }
      } else if (key === 't') {
        // Hailing is handled by the HUD HailPanel so it can present choices.
      } else if (key === 'q' && state.playerMode === 'ship' && state.combatMode) {
        tryFireBroadside('port');
      } else if (key === 'r' && state.playerMode === 'ship' && state.combatMode) {
        tryFireBroadside('starboard');
      } else if (key === 'tab' && state.playerMode === 'ship' && state.combatMode) {
        e.preventDefault();
        const next = cycleActiveBowWeapon(state.stats.armament);
        if (next) {
          state.addNotification(`Mounted weapon: ${WEAPON_DEFS[next].name}.`, 'info');
        } else {
          const current = resolveActiveBowWeapon(state.stats.armament);
          state.addNotification(`Only ${WEAPON_DEFS[current].name} mounted — visit a shipyard to add another bow weapon.`, 'warning');
        }
      } else if (key === 'f' && state.playerMode === 'ship') {
        // Toggle combat mode
        const next = !state.combatMode;
        state.setCombatMode(next);
        if (next) {
          // Entering fight mode unanchors
          if (state.anchored) state.setAnchored(false);
          sfxBattleStations();
          audioManager.startFightMusic();
          state.addNotification('Battle stations!', 'info');
        } else {
          audioManager.stopFightMusic();
          state.addNotification('Standing down.', 'info');
        }
      } else if (key === 'f' && state.playerMode === 'walking') {
        // Toggle hunting mode on land
        const next = !state.combatMode;
        state.setCombatMode(next);
        if (next) {
          const weaponName = LAND_WEAPON_DEFS[state.activeLandWeapon].name;
          state.addNotification(`${weaponName} drawn. Click to fire.`, 'info');
        } else {
          state.addNotification('Weapon lowered.', 'info');
        }
      } else if (key === 'tab' && state.playerMode === 'walking' && state.combatMode) {
        // Cycle through owned land weapons (musket → bow → musket …)
        e.preventDefault();
        state.cycleLandWeapon();
        const next = useGameStore.getState().activeLandWeapon;
        state.addNotification(`Switched to ${LAND_WEAPON_DEFS[next].name}.`, 'info');
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ') {
        setElevationHoldStart(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  return null;
}

// ── Projectile renderer + hit detection ─────────────────────────────────────
const NPC_HIT_RADIUS = 4;
const PROJECTILE_COUNT = 30; // increased for broadsides
const ROCKET_COUNT = 8;
const ROCKET_NEAR_MISS_RADIUS = 6.5;
const FLOATING_SPLASH_COOLDOWN_MS = 260;
let lastFloatingSplashAt = 0;
const _rocketBodyUp = new THREE.Vector3(0, 1, 0);
const _rocketBodyDir = new THREE.Vector3();

function ProjectileSystem() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const broadsideMeshRef = useRef<THREE.InstancedMesh>(null);
  const rocketMeshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const broadsideDummy = useMemo(() => new THREE.Object3D(), []);
  const rocketDummy = useMemo(() => new THREE.Object3D(), []);

  useFrame((_, delta) => {
    if (!meshRef.current || !broadsideMeshRef.current) return;

    // Auto-fire while mouse is held in combat mode — routes to the right weapon
    // based on player mode. Each weapon's own reload timer prevents spam.
    if (fireHeld) {
      const pm = useGameStore.getState().playerMode;
      if (pm === 'ship') tryFireBowWeapon();
      else if (pm === 'walking') tryFireLandWeapon();
    }

    // ── Process broadside queue (rolling fire) ──
    const now = Date.now();
    for (let i = broadsideQueue.length - 1; i >= 0; i--) {
      const shot = broadsideQueue[i];
      if (shot.fired) {
        broadsideQueue.splice(i, 1);
        continue;
      }
      if (now >= shot.fireAt) {
        spawnProjectile(shot.origin, shot.direction, shot.speed, shot.weaponType, {
          owner: shot.owner,
          ownerId: shot.ownerId,
          maxDistance: shot.maxDistance,
        });
        spawnMuzzleBurst(shot.origin.x, shot.origin.y, shot.origin.z, shot.direction.x, shot.direction.y, shot.direction.z, 1.35);
        sfxBroadsideCannon();
        shot.fired = true;
      }
    }

    const { adjustReputation, addNotification, damageShip } = useGameStore.getState();

    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      p.life -= delta;
      if (p.life <= 0) {
        projectiles.splice(i, 1);
        continue;
      }

      const isLandWeapon = p.weaponType === 'musket' || p.weaponType === 'bow';
      const isRocket = p.weaponType === 'fireRocket';

      // Land weapons fly mostly flat. Mounted bow weapons use per-weapon
      // gravity so the swivel stays direct-fire while rockets/lantakas/cetbangs
      // keep a visible arc. Broadsides retain their heavier drop.
      const shipGravity = WEAPON_DEFS[p.weaponType as WeaponType]?.aimable
        ? bowWeaponGravity(p.weaponType as WeaponType)
        : SHIP_PROJECTILE_GRAVITY;
      const g = isLandWeapon ? LAND_PROJECTILE_GRAVITY : shipGravity;
      p.vel.y -= g * delta;
      const stepDistance = p.vel.length() * delta;
      p.pos.addScaledVector(p.vel, delta);
      if (p.maxDistance !== undefined) {
        p.distanceTraveled = (p.distanceTraveled ?? 0) + stepDistance;
      }

      // Continuous smoke trail for rockets — ~20 Hz throttle.
      if (isRocket) {
        p.trailClock = (p.trailClock ?? 0) + delta;
        while (p.trailClock >= 0.05) {
          p.trailClock -= 0.05;
          const spd = p.vel.length();
          const invSpd = spd > 0.01 ? 1 / spd : 0;
          spawnRocketTrail(p.pos.x, p.pos.y, p.pos.z, p.vel.x * invSpd, p.vel.y * invSpd, p.vel.z * invSpd);
        }
      }

      // Ship weapons still die at the water plane; land weapons handle terrain
      // collision separately so hills and shorelines stop them correctly.
      if (!isLandWeapon && p.pos.y < 0) {
        if (tryRicochetProjectile(p, _aimObjectNormal.set(0, 1, 0), 'water')) {
          continue;
        }
        if (isRocket) {
          // Rockets detonate on water too — bigger splash + fire FX.
          spawnSplash(p.pos.x, p.pos.z, 1.3);
          spawnRocketFireBurst(p.pos.x, 0.2, p.pos.z, 1.2);
          sfxRocketImpact();
        } else {
          spawnSplash(p.pos.x, p.pos.z, shipWaterSplashScale(p.weaponType));
          sfxCannonSplash();
        }
        spawnSplashCombatText(p.pos.x, p.pos.y, p.pos.z);
        projectiles.splice(i, 1);
        continue;
      }

      if (!isLandWeapon && p.maxDistance !== undefined && (p.distanceTraveled ?? 0) >= p.maxDistance) {
        const surfaceY = aimSurfaceHeight(p.pos.x, p.pos.z);
        if (surfaceY <= SEA_LEVEL + 0.2) {
          if (tryRicochetProjectile(p, _aimObjectNormal.set(0, 1, 0), 'water')) {
            continue;
          }
          spawnSplash(p.pos.x, p.pos.z, shipWaterSplashScale(p.weaponType));
          sfxCannonSplash();
          spawnSplashCombatText(p.pos.x, p.pos.y, p.pos.z);
        } else {
          estimateAimSurfaceNormal(p.pos.x, p.pos.z, _aimObjectNormal);
          if (tryRicochetProjectile(p, _aimObjectNormal, 'land')) {
            continue;
          }
        spawnLandSurfaceImpact(p.pos.x, p.pos.z, WEAPON_DEFS[p.weaponType as WeaponType]?.aimable ? 0.45 : broadsideImpactScale(p.weaponType) * 0.65);
        }
        projectiles.splice(i, 1);
        continue;
      }

      let hit = false;

      // NPC-owned shots are hostile fire: they can damage the player's ship,
      // but they must not reuse player hit logic that damages NPCs/buildings
      // or applies player reputation penalties.
      if ((p.owner ?? 'player') === 'npc') {
        if (pointHitsPlayerShip(p.pos)) {
          const isAimable = WEAPON_DEFS[p.weaponType as WeaponType]?.aimable;
          const damage = npcProjectileDamage(p.weaponType);
          if (isRocket) {
            sfxRocketImpact();
            spawnRocketFireBurst(p.pos.x, p.pos.y + 0.4, p.pos.z, 1.2);
          } else {
            sfxCannonImpact();
          }
          spawnSplinters(p.pos.x, p.pos.y, p.pos.z, isAimable ? 0.55 : broadsideImpactScale(p.weaponType) * 0.8);
          damageShip(damage);
          spawnFloatingCombatText(p.pos.x, p.pos.y + 0.7, p.pos.z, 'Hull Breach', 'player');
          addNotification(`Enemy shot strikes the hull! -${damage} hull`, 'warning');
          projectiles.splice(i, 1);
          continue;
        }

        const surfaceY = aimSurfaceHeight(p.pos.x, p.pos.z);
        if (p.pos.y <= surfaceY) {
          spawnLandSurfaceImpact(p.pos.x, p.pos.z, WEAPON_DEFS[p.weaponType as WeaponType]?.aimable ? 0.45 : 0.7);
          projectiles.splice(i, 1);
          continue;
        }

        continue;
      }

      // ── Land weapon: hit-test against wildlife ──
      if (isLandWeapon) {
        for (const [id, w] of wildlifeLivePositions) {
          if (w.dead) continue;
          const dx = p.pos.x - w.x;
          const dz = p.pos.z - w.z;
          // Vertical tolerance — animal centers sit roughly at terrain height + 0.5
          const dy = p.pos.y - (w.y + 0.5);
          const r = w.radius;
          if (dx * dx + dz * dz < r * r && Math.abs(dy) < 1.5) {
            const def = LAND_WEAPON_DEFS[p.weaponType as LandWeaponType];
            const damage = def.damage;
            w.hp = Math.max(0, w.hp - damage);
            w.hitAlert = Date.now() + 8000;
            spawnImpactBurst(p.pos.x, p.pos.y, p.pos.z, p.weaponType === 'musket' ? 0.65 : 0.4);
            if (w.hp <= 0) {
              w.dead = true;
              // Snap the stored y to the actual terrain at the death position
              // so the carcass (and any later harvest FX) sit on the ground
              // even if the animal had wandered up or down a slope.
              w.y = getTerrainHeight(w.x, w.z);
              wildlifeKillQueue.add(id);
              const loot = lootForKill(w.template, w.variant);
              const name = loot?.commonName ?? w.variant;
              addNotification(`Killed a ${name}.`, 'success', {
                subtitle: 'Walk over to harvest.',
              });
              spawnFloatingCombatText(p.pos.x, p.pos.y + 0.4, p.pos.z, 'Killed', 'critical');
            } else {
              const hpPct = Math.round((w.hp / w.maxHp) * 100);
              addNotification(`Hit the ${w.variant}. (${hpPct}% HP)`, 'warning');
              spawnFloatingCombatText(p.pos.x, p.pos.y + 0.4, p.pos.z, 'Hit', 'hit');
            }
            projectiles.splice(i, 1);
            hit = true;
            break;
          }
        }
        if (hit) continue;
        const npc = pointHitsNpcShip(p.pos);
        if (npc) {
          spawnSplinters(p.pos.x, p.pos.y, p.pos.z, p.weaponType === 'musket' ? 0.35 : 0.18);
          npc.hull = Math.max(0, npc.hull - LAND_SHIP_DAMAGE[p.weaponType as LandWeaponType]);
          npc.hitAlert = Date.now() + 10000;
          adjustReputation(npc.flag as any, -5);
          const hullPct = Math.round((npc.hull / npc.maxHull) * 100);
          const combatText = shipHitCombatText(p.weaponType, LAND_SHIP_DAMAGE[p.weaponType as LandWeaponType], npc.hull <= 0);
          spawnFloatingCombatText(p.pos.x, p.pos.y + 0.5, p.pos.z, combatText.label, combatText.tone);
          addNotification(`Hit the ${npc.shipName}. Hull: ${hullPct}%`, 'warning');
          projectiles.splice(i, 1);
          continue;
        }
        const pedIdx = pointHitsPedestrian(p.pos.x, p.pos.y, p.pos.z);
        if (pedIdx >= 0) {
          spawnImpactBurst(p.pos.x, p.pos.y + 0.8, p.pos.z, 0.5);
          markKillPedestrian(pedIdx);
          const portFaction = PORT_FACTION[resolveCampaignPortId(useGameStore.getState())];
          if (portFaction) adjustReputation(portFaction, -50);
          addNotification('A bystander has been shot down.', 'error');
          projectiles.splice(i, 1);
          continue;
        }
        const building = pointHitsBuilding(p.pos);
        if (building) {
          const impactIntensity = p.weaponType === 'musket' ? 0.9 : 0.55;
          spawnSplinters(p.pos.x, p.pos.y, p.pos.z, impactIntensity);
          spawnImpactBurst(p.pos.x, p.pos.y, p.pos.z, impactIntensity * 0.65);
          const destroyed = applyBuildingDamage(building.id, buildingDamageForWeapon(p.weaponType), buildingMaxHp(building));
          spawnBuildingShake(building.id, impactIntensity);
          if (destroyed) {
            spawnBuildingCollapse(building.id, impactIntensity);
            spawnImpactBurst(p.pos.x, p.pos.y + 0.6, p.pos.z, impactIntensity * 1.4);
            spawnSplinters(p.pos.x, p.pos.y + 0.4, p.pos.z, impactIntensity * 1.3);
          }
          const portFaction = PORT_FACTION[resolveCampaignPortId(useGameStore.getState())];
          if (portFaction) adjustReputation(portFaction, -20);
          spawnFloatingCombatText(p.pos.x, p.pos.y + 0.45, p.pos.z, 'Structure Hit', 'structure');
          projectiles.splice(i, 1);
          continue;
        }
        const tree = pointHitsTree(p.pos);
        if (tree) {
          const impactIntensity = tree.kind === 'palm'
            ? (p.weaponType === 'musket' ? 1.2 : 0.78)
            : (p.weaponType === 'musket' ? 0.95 : 0.6);
          spawnSplinters(p.pos.x, p.pos.y, p.pos.z, impactIntensity);
          spawnImpactBurst(p.pos.x, p.pos.y, p.pos.z, impactIntensity * (tree.kind === 'palm' ? 0.6 : 0.45));
          applyTreeDamage(tree.kind, tree.index, treeDamageForWeapon(p.weaponType), p.vel.x, p.vel.z);
          spawnTreeShake(tree.kind, tree.index, impactIntensity);
          if (tree.kind === 'palm') {
            damagePalm(tree.index, impactIntensity);
          }
          projectiles.splice(i, 1);
          continue;
        }
        const surfaceY = aimSurfaceHeight(p.pos.x, p.pos.z);
        if (p.pos.y <= surfaceY) {
          spawnLandSurfaceImpact(p.pos.x, p.pos.z, p.weaponType === 'musket' ? 0.55 : 0.35);
          projectiles.splice(i, 1);
          continue;
        }
        // No further ship-weapon hit logic applies to land projectiles.
        continue;
      }

      // ── Ship weapon: hit-test against NPC ships ──
      // Rockets resolve differently: they explode on direct hit AND then
      // splash-damage everything within ROCKET_AOE_RADIUS, so even
      // near-misses reward the player when ships are clustered.
      if (isRocket) {
        let hitAnyone = false;
        let directHitNpc: typeof npcLivePositions extends Map<any, infer V> ? V | null : null = null as any;
        let nearMissNpc: typeof npcLivePositions extends Map<any, infer V> ? V | null : null = null as any;
        for (const [, npc] of npcLivePositions) {
          if (npc.sunk) continue;
          const dx = p.pos.x - npc.x;
          const dz = p.pos.z - npc.z;
          const distSq = dx * dx + dz * dz;
          if (distSq < NPC_HIT_RADIUS * NPC_HIT_RADIUS) {
            directHitNpc = npc;
            break;
          }
          if (distSq < ROCKET_NEAR_MISS_RADIUS * ROCKET_NEAR_MISS_RADIUS && !nearMissNpc) {
            nearMissNpc = npc;
          }
        }
        // Keep travelling unless we have a direct hit or are passing within near-miss radius.
        if (!directHitNpc && !nearMissNpc) {
          continue;
        }
        // Detonation: fire burst + splinters.
        sfxRocketImpact();
        spawnSplinters(p.pos.x, p.pos.y, p.pos.z, 1.35);
        spawnRocketFireBurst(p.pos.x, p.pos.y + 0.4, p.pos.z, directHitNpc ? 1.4 : 0.9);
        const gState = useGameStore.getState();
        const gunner = getCrewByRole(gState, 'Gunner');
        const gunnerMod = gunner ? 1.0 + (gunner.stats.strength / 200) + (gunner.stats.perception / 400) : 1.0;
        const abilityMod = captainHasAbility(gState, 'Broadside Master') ? 1.15 : 1.0;
        const baseDamage = WEAPON_DEFS.fireRocket.damage * gunnerMod * abilityMod;
        // Near-miss detonations use the wider near-miss radius so the
        // ship that triggered proximity actually takes damage.
        const ROCKET_AOE_RADIUS = directHitNpc ? 4.5 : ROCKET_NEAR_MISS_RADIUS;
        const AOE_SQR = ROCKET_AOE_RADIUS * ROCKET_AOE_RADIUS;
        for (const [, npc] of npcLivePositions) {
          if (npc.sunk) continue;
          const dx = p.pos.x - npc.x;
          const dz = p.pos.z - npc.z;
          const distSqr = dx * dx + dz * dz;
          if (distSqr > AOE_SQR) continue;
          const dist = Math.sqrt(distSqr);
          // Falloff: direct hit gets full damage, edge of AOE ~30%.
          const falloff = 1 - 0.7 * (dist / ROCKET_AOE_RADIUS);
          const damage = Math.floor(baseDamage * falloff);
          if (damage <= 0) continue;
          npc.hull = Math.max(0, npc.hull - damage);
          adjustReputation(npc.flag as any, -10);
          const hullPct = Math.round((npc.hull / npc.maxHull) * 100);
          const combatText = shipHitCombatText(p.weaponType, damage, npc.hull <= 0, npc === directHitNpc);
          spawnFloatingCombatText(p.pos.x, p.pos.y + 0.5, p.pos.z, combatText.label, combatText.tone);
          if (npc.hull > 0) {
            addNotification(
              npc === directHitNpc
                ? `Rocket strike on the ${npc.shipName}! Hull: ${hullPct}%`
                : npc === nearMissNpc
                  ? `Rocket detonates near the ${npc.shipName}! Hull: ${hullPct}%`
                  : `Rocket blast catches the ${npc.shipName}. Hull: ${hullPct}%`,
              'warning',
            );
          }
          npc.hitAlert = Date.now() + 10000;
          hitAnyone = true;
        }
        if (hitAnyone) {
          projectiles.splice(i, 1);
          continue;
        }
        projectiles.splice(i, 1);
        continue;
      }

      for (const [id, w] of wildlifeLivePositions) {
        if (w.dead) continue;
        const dx = p.pos.x - w.x;
        const dz = p.pos.z - w.z;
        const dy = p.pos.y - (w.y + 0.5);
        const r = Math.max(w.radius, 0.8);
        if (dx * dx + dz * dz < r * r && Math.abs(dy) < 2.1) {
          const projectileDef = WEAPON_DEFS[p.weaponType as WeaponType];
          const impactScale = projectileDef?.aimable ? 0.65 : 1.0;
          const damage = Math.max(1, Math.floor((projectileDef?.damage ?? 1) * 0.5 * projectileDamageScale(p)));
          w.hp = Math.max(0, w.hp - damage);
          w.hitAlert = Date.now() + 8000;
          spawnImpactBurst(p.pos.x, p.pos.y, p.pos.z, impactScale);
          spawnSplinters(p.pos.x, p.pos.y, p.pos.z, impactScale * 0.7);
          if (w.hp <= 0) {
            w.dead = true;
            w.y = getTerrainHeight(w.x, w.z);
            wildlifeKillQueue.add(id);
            const loot = lootForKill(w.template, w.variant);
            const name = loot?.commonName ?? w.variant;
            addNotification(`Killed a ${name}.`, 'success', {
              subtitle: 'Walk over to harvest.',
            });
            spawnFloatingCombatText(p.pos.x, p.pos.y + 0.4, p.pos.z, 'Killed', 'critical');
          } else {
            const hpPct = Math.round((w.hp / w.maxHp) * 100);
            addNotification(`Hit the ${w.variant}. (${hpPct}% HP)`, 'warning');
            spawnFloatingCombatText(p.pos.x, p.pos.y + 0.4, p.pos.z, 'Hit', 'hit');
          }
          projectiles.splice(i, 1);
          hit = true;
          break;
        }
      }
      if (hit) continue;

      const building = pointHitsBuilding(p.pos);
      if (building) {
        if (buildingCanDeflect(building) && tryRicochetProjectile(p, estimateBuildingRicochetNormal(building, p.pos, _aimObjectNormal), 'land')) {
          continue;
        }
        const impactIntensity = WEAPON_DEFS[p.weaponType as WeaponType]?.aimable ? 0.8 : broadsideImpactScale(p.weaponType) * 0.85;
        spawnSplinters(p.pos.x, p.pos.y, p.pos.z, impactIntensity);
        spawnImpactBurst(p.pos.x, p.pos.y, p.pos.z, impactIntensity * 0.7);
        const destroyed = applyBuildingDamage(building.id, buildingDamageForWeapon(p.weaponType as WeaponType) * projectileDamageScale(p), buildingMaxHp(building));
        spawnBuildingShake(building.id, impactIntensity);
        if (destroyed) {
          spawnBuildingCollapse(building.id, impactIntensity);
          spawnImpactBurst(p.pos.x, p.pos.y + 0.6, p.pos.z, impactIntensity * 1.4);
          spawnSplinters(p.pos.x, p.pos.y + 0.4, p.pos.z, impactIntensity * 1.3);
        }
        const portFaction = PORT_FACTION[resolveCampaignPortId(useGameStore.getState())];
        const isAimable = WEAPON_DEFS[p.weaponType as WeaponType]?.aimable;
        if (portFaction) adjustReputation(portFaction, isAimable ? -10 : -25);
        spawnFloatingCombatText(p.pos.x, p.pos.y + 0.45, p.pos.z, 'Structure Hit', 'structure');
        projectiles.splice(i, 1);
        continue;
      }

      const tree = pointHitsTree(p.pos);
      if (tree) {
        const baseImpact = WEAPON_DEFS[p.weaponType as WeaponType]?.aimable ? 0.95 : broadsideImpactScale(p.weaponType);
        const impactIntensity = tree.kind === 'palm' ? baseImpact * 1.15 : baseImpact;
        spawnSplinters(p.pos.x, p.pos.y, p.pos.z, impactIntensity * 0.85);
        spawnImpactBurst(p.pos.x, p.pos.y, p.pos.z, impactIntensity * (tree.kind === 'palm' ? 0.62 : 0.48));
        applyTreeDamage(tree.kind, tree.index, treeDamageForWeapon(p.weaponType as WeaponType), p.vel.x, p.vel.z);
        spawnTreeShake(tree.kind, tree.index, impactIntensity);
        if (tree.kind === 'palm') {
          damagePalm(tree.index, impactIntensity);
        }
        projectiles.splice(i, 1);
        continue;
      }

      const surfaceY = aimSurfaceHeight(p.pos.x, p.pos.z);
      if (p.pos.y <= surfaceY) {
        estimateAimSurfaceNormal(p.pos.x, p.pos.z, _aimObjectNormal);
        if (tryRicochetProjectile(p, _aimObjectNormal, surfaceY <= SEA_LEVEL + 0.2 ? 'water' : 'land')) {
          continue;
        }
          spawnLandSurfaceImpact(p.pos.x, p.pos.z, WEAPON_DEFS[p.weaponType as WeaponType]?.aimable ? 0.45 : broadsideImpactScale(p.weaponType) * 0.65);
        if (surfaceY <= SEA_LEVEL + 0.2) {
          spawnSplashCombatText(p.pos.x, p.pos.y, p.pos.z);
        }
        projectiles.splice(i, 1);
        continue;
      }

      for (const [, npc] of npcLivePositions) {
        if (npc.sunk) continue;
        const dx = p.pos.x - npc.x;
        const dz = p.pos.z - npc.z;
        if (dx * dx + dz * dz < NPC_HIT_RADIUS * NPC_HIT_RADIUS) {
          sfxCannonImpact();
          const isAimable = WEAPON_DEFS[p.weaponType as WeaponType]?.aimable;
          spawnSplinters(p.pos.x, p.pos.y, p.pos.z, isAimable ? 0.5 : broadsideImpactScale(p.weaponType) * 0.9);
          // Deal damage based on projectile's weapon type + gunner/ability bonuses
          const gState = useGameStore.getState();
          const gunner = getCrewByRole(gState, 'Gunner');
          const gunnerMod = gunner ? 1.0 + (gunner.stats.strength / 200) + (gunner.stats.perception / 400) : 1.0;
          const abilityMod = captainHasAbility(gState, 'Broadside Master') ? 1.15 : 1.0;
          const damage = Math.max(1, Math.floor(WEAPON_DEFS[p.weaponType as WeaponType].damage * gunnerMod * abilityMod * projectileDamageScale(p)));
          npc.hull = Math.max(0, npc.hull - damage);
          // Reputation penalty scaled: swivel = -5, broadside = -15
          const repPenalty = isAimable ? -5 : -15;
          adjustReputation(npc.flag as any, repPenalty);
          const hullPct = Math.round((npc.hull / npc.maxHull) * 100);
          if (npc.hull > 0) {
            addNotification(`Hit the ${npc.shipName}! Hull: ${hullPct}%`, 'warning');
          }
          const combatText = shipHitCombatText(p.weaponType, damage, npc.hull <= 0);
          spawnFloatingCombatText(p.pos.x, p.pos.y + 0.5, p.pos.z, combatText.label, combatText.tone);
          npc.hitAlert = Date.now() + 10000;
          projectiles.splice(i, 1);
          hit = true;
          break;
        }
      }
      if (hit) continue;
    }

    // Light sphere mesh: land weapons + aimable ship weapons.
    // Heavy sphere mesh: broadside cannonballs, rendered dark and larger.
    // Rocket capsule mesh: rockets only, oriented along velocity.
    if (meshRef.current) {
      for (let i = 0; i < PROJECTILE_COUNT; i++) {
        const proj = i < projectiles.length ? projectiles[i] : null;
        if (proj && proj.weaponType !== 'fireRocket' && !isBroadsideWeapon(proj.weaponType)) {
          dummy.position.copy(proj.pos);
          const wt = proj.weaponType;
          const s = wt === 'musket' ? 0.28
                  : wt === 'bow' ? 0.22
                  : wt === 'falconet' ? 0.72
                  : (wt === 'swivelGun' || wt === 'lantaka' || wt === 'cetbang') ? 0.55
                  : 0.9;
          dummy.scale.setScalar(s);
          dummy.rotation.set(0, 0, 0);
        } else {
          dummy.position.set(0, -1000, 0);
          dummy.scale.setScalar(0);
        }
        dummy.updateMatrix();
        meshRef.current.setMatrixAt(i, dummy.matrix);
      }
      meshRef.current.instanceMatrix.needsUpdate = true;
    }

    if (broadsideMeshRef.current) {
      let slot = 0;
      for (let i = 0; i < projectiles.length && slot < PROJECTILE_COUNT; i++) {
        const proj = projectiles[i];
        if (!isBroadsideWeapon(proj.weaponType)) continue;
        broadsideDummy.position.copy(proj.pos);
        const s = proj.weaponType === 'demiCannon' ? 1.35
          : proj.weaponType === 'basilisk' ? 1.25
            : proj.weaponType === 'demiCulverin' ? 1.15
              : proj.weaponType === 'saker' ? 1.05
                : 0.95;
        broadsideDummy.scale.setScalar(s);
        broadsideDummy.rotation.set(0, 0, 0);
        broadsideDummy.updateMatrix();
        broadsideMeshRef.current.setMatrixAt(slot, broadsideDummy.matrix);
        slot++;
      }
      for (; slot < PROJECTILE_COUNT; slot++) {
        broadsideDummy.position.set(0, -1000, 0);
        broadsideDummy.scale.setScalar(0);
        broadsideDummy.updateMatrix();
        broadsideMeshRef.current.setMatrixAt(slot, broadsideDummy.matrix);
      }
      broadsideMeshRef.current.instanceMatrix.needsUpdate = true;
    }

    if (rocketMeshRef.current) {
      let slot = 0;
      for (let i = 0; i < projectiles.length && slot < ROCKET_COUNT; i++) {
        const proj = projectiles[i];
        if (proj.weaponType !== 'fireRocket') continue;
        rocketDummy.position.copy(proj.pos);
        const spd = proj.vel.length();
        if (spd > 0.01) {
          _rocketBodyDir.set(proj.vel.x / spd, proj.vel.y / spd, proj.vel.z / spd);
          rocketDummy.quaternion.setFromUnitVectors(_rocketBodyUp, _rocketBodyDir);
        }
        rocketDummy.scale.setScalar(1);
        rocketDummy.updateMatrix();
        rocketMeshRef.current.setMatrixAt(slot, rocketDummy.matrix);
        slot++;
      }
      for (; slot < ROCKET_COUNT; slot++) {
        rocketDummy.position.set(0, -1000, 0);
        rocketDummy.scale.setScalar(0);
        rocketDummy.updateMatrix();
        rocketMeshRef.current.setMatrixAt(slot, rocketDummy.matrix);
      }
      rocketMeshRef.current.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <>
    <instancedMesh ref={meshRef} args={[undefined, undefined, PROJECTILE_COUNT]} frustumCulled={false}>
      <sphereGeometry args={[0.35, 8, 8]} />
      <meshStandardMaterial
        color="#aaa"
        emissive="#ff6600"
        emissiveIntensity={2}
        roughness={0.3}
        metalness={0.5}
        toneMapped={false}
      />
    </instancedMesh>
    <instancedMesh ref={broadsideMeshRef} args={[undefined, undefined, PROJECTILE_COUNT]} frustumCulled={false}>
      <sphereGeometry args={[0.35, 10, 10]} />
      <meshStandardMaterial
        color="#171512"
        emissive="#3b2114"
        emissiveIntensity={0.25}
        roughness={0.72}
        metalness={0.85}
      />
    </instancedMesh>
    {/* Rocket capsule — oriented along velocity each frame */}
    <instancedMesh ref={rocketMeshRef} args={[undefined, undefined, ROCKET_COUNT]} frustumCulled={false}>
      <capsuleGeometry args={[0.18, 0.85, 4, 8]} />
      <meshStandardMaterial
        color="#cc8822"
        emissive="#ff4400"
        emissiveIntensity={2.5}
        roughness={0.4}
        metalness={0.3}
        toneMapped={false}
      />
    </instancedMesh>
    </>
  );
}

function HuntAimMarker() {
  const groupRef = useRef<THREE.Group>(null);
  const ringMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const dotMatRef = useRef<THREE.MeshBasicMaterial>(null);

  useFrame((state) => {
    const group = groupRef.current;
    const ringMat = ringMatRef.current;
    const dotMat = dotMatRef.current;
    if (!group || !ringMat || !dotMat) return;

    const gs = useGameStore.getState();
    if (gs.playerMode !== 'walking' || !gs.combatMode || !huntAimValid) {
      group.visible = false;
      return;
    }

    const def = LAND_WEAPON_DEFS[gs.activeLandWeapon];
    if (!resolveCurrentHuntFire(_huntMarkerOrigin, _huntMarkerDir)) {
      group.visible = false;
      return;
    }

    const hitKind = predictLandImpactPoint(
      _huntMarkerOrigin,
      _huntMarkerDir,
      def.projectileSpeed,
      _huntMarkerImpact,
      _huntMarkerNormal,
    );
    if (hitKind === 'none') {
      group.visible = false;
      return;
    }

    group.visible = true;
    group.position.copy(_huntMarkerImpact).addScaledVector(_huntMarkerNormal, HUNT_MARKER_SURFACE_OFFSET);
    group.quaternion.setFromUnitVectors(_markerBaseNormal, _huntMarkerNormal);

    const distance = _huntMarkerOrigin.distanceTo(_huntMarkerImpact);
    const inRange = distance <= def.range;
    const pulse = 1 + Math.sin(state.clock.elapsedTime * 8) * 0.08;
    const zoomScale = THREE.MathUtils.clamp(gs.cameraZoom / 18, 0.5, 7);
    group.scale.setScalar((inRange ? pulse : pulse * 1.04) * zoomScale);

    if (inRange) {
      if (hitKind === 'wildlife') {
        ringMat.color.set('#f6d78d');
        dotMat.color.set('#fff2c4');
        ringMat.opacity = 0.72;
      } else if (hitKind === 'tree') {
        ringMat.color.set('#8ca96b');
        dotMat.color.set('#cfe3a9');
        ringMat.opacity = 0.62;
      } else {
        ringMat.color.set('#d8c39b');
        dotMat.color.set('#f3e2b8');
        ringMat.opacity = 0.52;
      }
      dotMat.opacity = 0.88;
    } else {
      ringMat.color.set('#b25a32');
      dotMat.color.set('#d68954');
      ringMat.opacity = 0.44;
      dotMat.opacity = 0.62;
    }
  });

  return (
    <group ref={groupRef} visible={false}>
      <mesh renderOrder={1002} raycast={() => null}>
        <ringGeometry args={[0.22, 0.34, 20]} />
        <meshBasicMaterial
          ref={ringMatRef}
          color="#d8c39b"
          transparent
          opacity={0.6}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <mesh position={[0, 0, 0.02]} renderOrder={1003} raycast={() => null}>
        <sphereGeometry args={[0.08, 8, 8]} />
        <meshBasicMaterial
          ref={dotMatRef}
          color="#fff2c4"
          transparent
          opacity={0.88}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

function SwivelAimMarker() {
  const groupRef = useRef<THREE.Group>(null);
  const ringMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const dotMatRef = useRef<THREE.MeshBasicMaterial>(null);

  useFrame((state) => {
    const group = groupRef.current;
    const ringMat = ringMatRef.current;
    const dotMat = dotMatRef.current;
    if (!group || !ringMat || !dotMat) return;

    const gs = useGameStore.getState();
    if (gs.playerMode !== 'ship' || !gs.combatMode || !swivelAimValid) {
      group.visible = false;
      return;
    }

    if (!resolveCurrentSwivelFire(_swivelMarkerOrigin, _swivelMarkerDir)) {
      group.visible = false;
      return;
    }

    const selected = resolveActiveBowWeapon(gs.stats.armament);
    const speed = bowWeaponLaunchSpeed(selected);
    const gravity = bowWeaponGravity(selected);
    const hitKind = predictSwivelImpactPoint(
      _swivelMarkerOrigin,
      _swivelMarkerDir,
      speed,
      gravity,
      _swivelMarkerImpact,
      _swivelMarkerNormal,
    );
    if (hitKind === 'none') {
      group.visible = false;
      return;
    }

    group.visible = true;
    group.position.copy(_swivelMarkerImpact).addScaledVector(_swivelMarkerNormal, HUNT_MARKER_SURFACE_OFFSET);
    group.quaternion.setFromUnitVectors(_markerBaseNormal, _swivelMarkerNormal);

    const pulse = 1 + Math.sin(state.clock.elapsedTime * 8) * 0.08;
    // Markers are bigger at distance so they remain visible against the sea.
    const distance = _swivelMarkerOrigin.distanceTo(_swivelMarkerImpact);
    const distScale = THREE.MathUtils.clamp(0.5 + distance * 0.04, 0.6, 2.0);
    group.scale.setScalar(pulse * distScale);

    if (hitKind === 'wildlife') {
      // ship hit — gold
      ringMat.color.set('#f6d78d');
      dotMat.color.set('#fff2c4');
      ringMat.opacity = 0.78;
      dotMat.opacity = 0.92;
    } else {
      // water/shore — pale tan
      ringMat.color.set('#d8c39b');
      dotMat.color.set('#f3e2b8');
      ringMat.opacity = 0.5;
      dotMat.opacity = 0.78;
    }
  });

  return (
    <group ref={groupRef} visible={false}>
      <mesh renderOrder={1002} raycast={() => null}>
        <ringGeometry args={[0.32, 0.5, 24]} />
        <meshBasicMaterial
          ref={ringMatRef}
          color="#d8c39b"
          transparent
          opacity={0.6}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <mesh position={[0, 0, 0.02]} renderOrder={1003} raycast={() => null}>
        <sphereGeometry args={[0.12, 8, 8]} />
        <meshBasicMaterial
          ref={dotMatRef}
          color="#fff2c4"
          transparent
          opacity={0.88}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

// Time controller
function TimeController() {
  const advanceTime = useGameStore((state) => state.advanceTime);
  const paused = useGameStore((state) => state.paused);
  const accumulatedDelta = useRef(0);
  const ambientAccum = useRef(0);
  const STORE_TIME_STEP = 0.1;

  useFrame((_, delta) => {
    if (paused) return;
    accumulatedDelta.current += delta;
    if (accumulatedDelta.current < STORE_TIME_STEP) return;

    // 1 real second = 0.1 game hours → 4 real minutes per in-game day.
    advanceTime(accumulatedDelta.current * 0.1);
    accumulatedDelta.current = 0;

    // Update ambient soundscape at ~500ms intervals
    ambientAccum.current += delta;
    if (ambientAccum.current > 0.5) {
      ambientAccum.current = 0;
      const s = useGameStore.getState();
      ambientEngine.update({
        playerMode: s.playerMode,
        playerPos: s.playerPos,
        walkingPos: s.walkingPos,
        ports: s.ports,
        speed: s.stats.speed,
        playerRot: s.playerRot,
        timeOfDay: s.timeOfDay,
        paused: s.paused,
      });
    }
  });
  return null;
}

// Output bag for computeAtmosphere — callers preallocate once and we mutate
// in place each call. Avoids per-frame THREE.Color allocations in AtmosphereSync.
interface AtmosphereOut {
  skyColor: THREE.Color;
  fogColor: THREE.Color;
  fogNear: number;
  fogFar: number;
  brightness: number;
  contrast: number;
  hue: number;
  saturation: number;
}

function makeAtmosphereOut(): AtmosphereOut {
  return {
    skyColor: new THREE.Color(),
    fogColor: new THREE.Color(),
    fogNear: 0,
    fogFar: 0,
    brightness: 0,
    contrast: 0,
    hue: 0,
    saturation: 0,
  };
}

// Scratch colors for lerp — kept module-local so computeAtmosphere doesn't
// allocate. Safe because this runs only on the render thread.
const _atmScratchA = new THREE.Color();
const _atmScratchB = new THREE.Color();
const _atmMoodWarmSky = new THREE.Color();
const _atmMoodWarmFog = new THREE.Color();

// Pure function — no hooks. Mutates `out`. Callable from useFrame without
// any React subscription, which is how we avoid the 5Hz re-render wave.
function computeAtmosphere(
  timeOfDay: number,
  waterPaletteId: ReturnType<typeof resolveWaterPaletteId>,
  mood: DayMood,
  out: AtmosphereOut,
): void {
  const t0 = perfSignals.enabled ? performance.now() : 0;
  const angle = ((timeOfDay - 6) / 24) * Math.PI * 2;
  const sunH = Math.sin(angle);

  // Climate-conditioned palette lookups. Strings only — cheap.
  const daySky = waterPaletteId === 'monsoon' ? '#5aaec0' : waterPaletteId === 'temperate' ? '#2d78a8' : waterPaletteId === 'tropical' ? '#5aade6' : '#6ab2dc';
  const dayFog = waterPaletteId === 'monsoon' ? '#9ccfd0' : waterPaletteId === 'temperate' ? '#78a8bb' : waterPaletteId === 'tropical' ? '#a0ccde' : '#a8cede';
  const duskSky = waterPaletteId === 'monsoon' ? '#24445a' : waterPaletteId === 'temperate' ? '#354852' : '#1d3158';
  const duskFog = waterPaletteId === 'monsoon' ? '#263b46' : waterPaletteId === 'temperate' ? '#46565b' : '#202b42';
  const warmSky = waterPaletteId === 'monsoon' ? '#e6a06c' : waterPaletteId === 'temperate' ? '#c8a58a' : '#f0a36b';
  const warmFog = waterPaletteId === 'monsoon' ? '#bca887' : waterPaletteId === 'temperate' ? '#b5aa99' : '#d9b59a';
  const nightSky = waterPaletteId === 'monsoon' ? '#122b3d' : waterPaletteId === 'temperate' ? '#182832' : '#14284a';
  const nightFog = waterPaletteId === 'monsoon' ? '#142633' : waterPaletteId === 'temperate' ? '#1a2a31' : '#18243a';

  // Blend each climate's warm sky/fog hex toward the overcast gray as warmth
  // drops. warmth=1 keeps the saturated hex; warmth=0 fully desaturates.
  _atmMoodWarmSky.set(MOOD_OVERCAST_WARM_HEX).lerp(_atmScratchA.set(warmSky), mood.warmth);
  _atmMoodWarmFog.set(MOOD_OVERCAST_WARM_HEX).lerp(_atmScratchA.set(warmFog), mood.warmth);

  if (sunH > 0.3) {
    out.skyColor.set(daySky);
    out.fogColor.set(dayFog);
  } else if (sunH > 0.05) {
    const t = (sunH - 0.05) / 0.25;
    out.skyColor.copy(_atmMoodWarmSky).lerp(_atmScratchB.set(daySky), t);
    out.fogColor.copy(_atmMoodWarmFog).lerp(_atmScratchB.set(dayFog), t);
  } else if (sunH > -0.15) {
    const t = (sunH + 0.15) / 0.2;
    out.skyColor.copy(_atmScratchA.set(duskSky)).lerp(_atmMoodWarmSky, t);
    out.fogColor.copy(_atmScratchA.set(duskFog)).lerp(_atmMoodWarmFog, t);
  } else {
    out.skyColor.set(nightSky);
    out.fogColor.set(nightFog);
  }

  const clearDayPalette = waterPaletteId === 'tropical'
    || waterPaletteId === 'monsoon'
    || waterPaletteId === 'arid'
    || waterPaletteId === 'mediterranean';
  // Smoothly interpolate fog distances across the horizon band so there's
  // no cliff at sunH = 0 (i.e. 6am/6pm). The old piecewise formula dropped
  // fogFar from ~1000 to ~474 in a single tick at dusk, producing a visible
  // fog wall when zoomed out.
  const dayNear = clearDayPalette ? 300 : 280;
  const dayFar = clearDayPalette ? 1000 : 880;
  const nightNear = 260;
  const nightFar = 900;
  const dayT = smoothstep(-0.15, 0.25, sunH);
  out.fogNear = THREE.MathUtils.lerp(nightNear, dayNear, dayT);
  out.fogFar = THREE.MathUtils.lerp(nightFar, dayFar, dayT);

  // Mood-driven haze on the daytime band only. Confined to sunH > 0.05 so
  // the per-day haze multiplier never compounds with the dusk transition,
  // which is what made hazy seeds especially walled-in at 6pm.
  if (sunH > 0.05 && sunH < 0.5) {
    const bandT = 1 - Math.min(1, Math.abs(sunH - 0.25) / 0.3);
    const densityMul = 1 - (1 - mood.fogDensity) * bandT;
    out.fogFar *= densityMul;
    out.fogNear *= densityMul;
  }

  if (sunH > 0.3) {
    out.brightness = 0.01;
    out.contrast = 0.02;
    out.hue = 0;
    out.saturation = 0.02;
  } else if (sunH > -0.05) {
    const t = Math.max(0, Math.min(1, (0.3 - sunH) / 0.35));
    out.brightness = -0.005 * t;
    out.contrast = 0.04 * t;
    out.hue = 0.05 * t * mood.saturation;
    out.saturation = 0.18 * t * mood.saturation;
  } else {
    const t = Math.max(0, Math.min(1, (-0.05 - sunH) / 0.3));
    out.brightness = -0.02 * t;
    out.contrast = 0;
    out.hue = -0.12 * t;
    out.saturation = 0.06 * t;
  }

  if (perfSignals.enabled) reportAtmosphereMs(performance.now() - t0);
}

// Hook used by React consumers that can't mutate (BrightnessContrast and
// HueSaturation need JSX props). Quantizes timeOfDay to 0.25 game-hours —
// ~2.5s of real time — so the subscriber only re-renders a handful of times
// per in-game hour. The postprocessing visuals ramp slowly enough that the
// coarser cadence is imperceptible.
function useQuantizedAtmosphere(): AtmosphereOut {
  const quantizedTime = useGameStore((state) => Math.round(state.timeOfDay * 4) / 4);
  const waterPaletteId = useGameStore((state) => resolveWaterPaletteId(state));
  const worldSeed = useGameStore((state) => state.worldSeed);

  return useMemo(() => {
    const out = makeAtmosphereOut();
    const mood = computeDayMood(quantizedTime, worldSeed);
    computeAtmosphere(quantizedTime, waterPaletteId, mood, out);
    return out;
  }, [quantizedTime, waterPaletteId, worldSeed]);
}

// Syncs Three.js fog and background with computed atmosphere colors. Reads
// timeOfDay / waterPaletteId via getState() inside useFrame so the component
// does not subscribe — no React re-renders per time tick. Mutates a
// pre-allocated AtmosphereOut bag so there are no per-frame THREE.Color allocs.
function AtmosphereSync() {
  const { scene } = useThree();
  const atmosphereOut = useMemo(makeAtmosphereOut, []);
  // Pre-allocated working colors so we don't allocate per frame when lerping
  // toward the rain fog tint. Stored on the closure rather than reassigned.
  const rainFog = useMemo(() => new THREE.Color(0.58, 0.64, 0.62), []);
  const tmpFogColor = useMemo(() => new THREE.Color(), []);
  const tmpSkyColor = useMemo(() => new THREE.Color(), []);

  useFrame(() => {
    const state = useGameStore.getState();
    const mood = computeDayMood(state.timeOfDay, state.worldSeed);
    computeAtmosphere(state.timeOfDay, resolveWaterPaletteId(state), mood, atmosphereOut);
    const { skyColor, fogColor, fogNear, fogFar } = atmosphereOut;

    // Weather pulls the fog/sky toward a desaturated cool gray-green and pulls
    // the far plane in so heavy rain feels enclosed. Reuses the existing eased
    // weather.intensity so transitions match the LUT and rain overlay.
    const rainOn = state.renderDebug.rain;
    const wIntensity = rainOn ? Math.max(state.weather.intensity, 1) : state.weather.intensity;
    const fogTint = wIntensity * 0.7; // cap blend so noon stays recognizable
    const fogPull = THREE.MathUtils.lerp(1.0, 0.72, wIntensity); // far plane shrink
    tmpFogColor.copy(fogColor).lerp(rainFog, fogTint);
    tmpSkyColor.copy(skyColor).lerp(rainFog, fogTint * 0.85);

    if (scene.background instanceof THREE.Color) {
      scene.background.copy(tmpSkyColor);
    }
    if (scene.fog instanceof THREE.Fog) {
      const shipTransform = getLiveShipTransform();
      const mapHalf = (state.devSoloPort ? 1000 : 900) / 2;
      const edgeDistance = mapHalf - Math.max(
        Math.abs(shipTransform.pos[0]),
        Math.abs(shipTransform.pos[2]),
      );
      const edgeFog = 1 - smoothstep(45, 185, edgeDistance);
      // Edge-fog floor scales with the current fog distance so it can't pull
      // fogFar in below ~60% of base — keeps night/zoomed-out from collapsing
      // into a wall near the world boundary while still cueing the edge.
      const edgeNear = THREE.MathUtils.lerp(fogNear, Math.max(70, fogNear * 0.55), edgeFog);
      const edgeFar = THREE.MathUtils.lerp(fogFar, Math.max(260, fogFar * 0.6), edgeFog);

      scene.fog.color.copy(tmpFogColor);
      scene.fog.near = edgeNear;
      scene.fog.far = Math.max(edgeNear + 80, edgeFar * fogPull);
    }
  });

  return null;
}

// Rolling buffer length — 10 samples × 0.5s each = 5s of history. Long enough
// that a one-frame spike stays on screen for several reads before aging out.
const PERF_RING_SIZE = 10;
const LONG_FRAME_THRESHOLD_S = 1 / 30; // 33.3ms — drop below 30fps

function PerformanceSampler() {
  const { gl } = useThree();
  const sampleRef = useRef({ elapsed: 0, frames: 0, maxDelta: 0, longFrames: 0 });
  // Ring buffer of per-sample peaks. Write index wraps modulo PERF_RING_SIZE.
  const ringRef = useRef({
    maxMs: new Float32Array(PERF_RING_SIZE),
    longFrames: new Int16Array(PERF_RING_SIZE),
    idx: 0,
  });

  useFrame((_, delta) => {
    const sample = sampleRef.current;
    sample.elapsed += delta;
    sample.frames++;
    sample.maxDelta = Math.max(sample.maxDelta, delta);
    if (delta > LONG_FRAME_THRESHOLD_S) sample.longFrames++;

    if (sample.elapsed < 0.5) return;

    const ring = ringRef.current;
    ring.maxMs[ring.idx] = sample.maxDelta * 1000;
    ring.longFrames[ring.idx] = sample.longFrames;
    ring.idx = (ring.idx + 1) % PERF_RING_SIZE;

    let peakFrameMs5s = 0;
    let longFrames5s = 0;
    for (let i = 0; i < PERF_RING_SIZE; i++) {
      if (ring.maxMs[i] > peakFrameMs5s) peakFrameMs5s = ring.maxMs[i];
      longFrames5s += ring.longFrames[i];
    }

    const drained = drainPerfSignals();
    const collisionAvgMs = drained.collisionChecks > 0
      ? drained.collisionMsSum / drained.collisionChecks
      : 0;
    const atmosphereAvgMs = drained.atmosphereRecomputes > 0
      ? drained.atmosphereMsSum / drained.atmosphereRecomputes
      : 0;

    const state = useGameStore.getState();
    const info = gl.info;
    const stats: PerformanceStats = {
      fps: sample.frames / sample.elapsed,
      avgFrameMs: (sample.elapsed / sample.frames) * 1000,
      maxFrameMs: sample.maxDelta * 1000,
      peakFrameMs5s,
      longFrames5s,
      collisionAvgMs,
      collisionMaxMs: drained.collisionMaxMs,
      collisionChecksPerSec: drained.collisionChecks / sample.elapsed,
      atmosphereRecomputesPerSec: drained.atmosphereRecomputes / sample.elapsed,
      atmosphereAvgMs,
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      lines: info.render.lines,
      points: info.render.points,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      dpr: gl.getPixelRatio(),
      npcShips: state.npcShips.length,
      projectiles: projectiles.length,
      postprocessing: state.renderDebug.postprocessing,
      shadows: state.renderDebug.shadows,
      advancedWater: state.renderDebug.advancedWater,
    };

    window.dispatchEvent(new CustomEvent<PerformanceStats>(PERFORMANCE_STATS_EVENT, { detail: stats }));
    sample.elapsed = 0;
    sample.frames = 0;
    sample.maxDelta = 0;
    sample.longFrames = 0;
  });

  return null;
}

export function GameScene() {
  const { isMobile } = useIsMobile();
  const worldSeed = useGameStore((state) => state.worldSeed);
  const worldSize = useGameStore((state) => state.worldSize);
  const currentWorldPortId = useGameStore((state) => state.currentWorldPortId);
  const devSoloPort = useGameStore((state) => state.devSoloPort);
  const postprocessingEnabled = useGameStore((state) => state.renderDebug.postprocessing);
  const bloomEnabled = useGameStore((state) => state.renderDebug.bloom);
  const vignetteEnabled = useGameStore((state) => state.renderDebug.vignette);
  const aoEnabled = useGameStore((state) => state.renderDebug.ao);
  const brightnessContrastEnabled = useGameStore((state) => state.renderDebug.brightnessContrast);
  const hueSaturationEnabled = useGameStore((state) => state.renderDebug.hueSaturation);
  const rainEnabled = useGameStore((state) => state.renderDebug.rain);
  const weatherIntensity = useGameStore((state) => state.weather.intensity);
  // Dev toggle forces full-strength rain regardless of weather state; otherwise
  // intensity comes from the climate-driven roll (eased in advanceTime).
  const effectiveRainIntensity = rainEnabled ? Math.max(weatherIntensity, 1) : weatherIntensity;
  const showRain = effectiveRainIntensity > 0.01;
  const [canvasReadyToMount, setCanvasReadyToMount] = useState(false);
  const canvasDpr: [number, number] = isMobile ? [1.5, 2] : [1, 2];

  useEffect(() => {
    const frameId = requestAnimationFrame(() => setCanvasReadyToMount(true));
    return () => cancelAnimationFrame(frameId);
  }, []);

  return (
    <>
      {canvasReadyToMount && (
        <Canvas
          dpr={canvasDpr}
          gl={{ antialias: true, powerPreference: 'high-performance', toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 0.97 }}
          shadows={{ type: THREE.PCFShadowMap }}
          camera={{ position: [0, 50, 50], fov: 45 }}
        >
          <Suspense fallback={null}>
            <color attach="background" args={['#87CEEB']} />
            <fog attach="fog" args={['#87CEEB', 200, 600]} />

            <World key={`${worldSeed}:${worldSize}:${currentWorldPortId ?? 'world'}:${devSoloPort ?? 'all'}`} />
            <Ocean />
            <Ship />
            <Player />
            <Pedestrians />
            <HinterlandScenes />

            <CameraController />
            <TouchSteerRaycaster />
            <InteractionController />
            <ProjectileSystem />
            <HuntAimMarker />
            <SwivelAimMarker />
            <SplashSystem />
            <FloatingLootSystem />
            <FloatingCombatTextSystem />
            <WreckSalvageSystem />
            <TimeController />
            <AtmosphereSync />
            <PerformanceSampler />
            <ShiftSelectOverlay />

            {showRain && <RainOverlay intensity={effectiveRainIntensity} />}

            {postprocessingEnabled && (
              <PostProcessing
                bloomEnabled={bloomEnabled}
                vignetteEnabled={vignetteEnabled}
                aoEnabled={aoEnabled}
                brightnessContrastEnabled={brightnessContrastEnabled}
                hueSaturationEnabled={hueSaturationEnabled}
              />
            )}
          </Suspense>
        </Canvas>
      )}
      <NightVignetteOverlay enabled={vignetteEnabled} />
    </>
  );
}


function PostProcessing({
  bloomEnabled,
  vignetteEnabled,
  aoEnabled,
  brightnessContrastEnabled,
  hueSaturationEnabled,
}: {
  bloomEnabled: boolean;
  vignetteEnabled: boolean;
  aoEnabled: boolean;
  brightnessContrastEnabled: boolean;
  hueSaturationEnabled: boolean;
}) {
  const { brightness, contrast, hue, saturation } = useQuantizedAtmosphere();
  // Vignette strength ramps slowly — quantize to 0.25h so this subscriber
  // wakes at ~2.5s intervals instead of every 200ms.
  const quantizedTime = useGameStore((state) => Math.round(state.timeOfDay * 4) / 4);
  const sunH = Math.sin(((quantizedTime - 6) / 24) * Math.PI * 2);
  const nightFactor = THREE.MathUtils.smoothstep((0.12 - sunH) / 0.42, 0, 1);
  const vignetteOffset = THREE.MathUtils.lerp(0.18, 0.12, nightFactor);
  const vignetteDarkness = THREE.MathUtils.lerp(0.85, 1.12, nightFactor);

  // Procedural color-grading LUT.
  //
  // Two modes:
  //   - 'manual' — exactly the legacy behavior: LUT is on iff lutEnabled, params
  //     come from the dev-panel sliders. This is what the artist tunes with.
  //   - 'auto'   — climate + weather drive the look. Today's sunny default is
  //     untouched (no LUT when intensity is 0); rain lerps toward the monsoon
  //     preset so the world desaturates and goes overcast as the rain fades in.
  // Texture rebuilds when the lerped params change; the fixed-precision key
  // debounces sub-1e-3 jitter from intensity easing, so a 3-second fade
  // rebuilds the LUT a couple dozen times — well under a millisecond total.
  const lutEnabled = useGameStore((state) => state.renderDebug.lutEnabled);
  const lutParamsManual = useGameStore((state) => state.renderDebug.lutParams);
  const lutMode = useGameStore((state) => state.renderDebug.lutMode);
  const weatherIntensityForLut = useGameStore((state) => state.weather.intensity);

  const lutAuto = lutMode === 'auto';
  // Auto mode: layer two signals onto the neutral base —
  //   1. Mood delta — subtle time-of-day grade (sunny noon, golden dusk,
  //      cool night). All clear-sky signals are scaled by (1 - rain) inside
  //      computeMoodDelta, so weather suppresses them.
  //   2. Rain shift — full lerp toward the monsoon preset by intensity.
  // Quantized hour drives the mood so the LUT only rebuilds at ~0.25h steps,
  // not every frame; weather intensity changes slowly anyway.
  const moodDelta = lutAuto
    ? computeMoodDelta(quantizedTime, weatherIntensityForLut)
    : LUT_NEUTRAL;
  const lutParams = lutAuto
    ? lerpLUTParams(addLUTParams(LUT_NEUTRAL, moodDelta), LUT_PRESETS.monsoon, weatherIntensityForLut)
    : lutParamsManual;
  const lutEffectiveOn = lutAuto
    ? lutDiffersFromNeutral(lutParams)
    : lutEnabled;

  const lutKey = lutParamsKey(lutParams);
  const lutTex = useMemo(
    () => (lutEffectiveOn ? buildLUT(lutParams) : null),
    // lutKey already covers the params; explicit dep keeps lint happy.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lutKey, lutEffectiveOn],
  );
  useEffect(() => () => { lutTex?.dispose(); }, [lutTex]);

  // EffectComposer builds its pass chain once at mount and does not cleanly
  // rebuild when effect children are added/removed. Force a remount whenever
  // the set of enabled effects changes so toggles in the dev panel don't
  // freeze the canvas.
  const composerKey =
    (aoEnabled ? 'a' : '-') +
    (bloomEnabled ? 'b' : '-') +
    (brightnessContrastEnabled ? 'c' : '-') +
    (hueSaturationEnabled ? 'h' : '-') +
    (vignetteEnabled ? 'v' : '-') +
    (lutEffectiveOn ? 'l' : '-');

  return (
    <EffectComposer key={composerKey}>
      {aoEnabled ? (
        <N8AO
          aoRadius={1.25}
          intensity={1.05}
          aoSamples={4}
          denoiseSamples={2}
          denoiseRadius={7}
          distanceFalloff={1.25}
          halfRes
        />
      ) : <></>}

      {bloomEnabled ? (
        <Bloom
          mipmapBlur
          luminanceThreshold={0.26}
          luminanceSmoothing={0.45}
          height={360}
          intensity={0.65}
        />
      ) : <></>}
      {brightnessContrastEnabled ? <BrightnessContrast brightness={brightness} contrast={contrast} /> : <></>}
      {hueSaturationEnabled ? <HueSaturation hue={hue} saturation={saturation} /> : <></>}
      {vignetteEnabled ? <Vignette eskil={false} offset={vignetteOffset} darkness={vignetteDarkness} /> : <></>}
      {lutEffectiveOn && lutTex ? <LUT lut={lutTex} tetrahedralInterpolation /> : <></>}
    </EffectComposer>
  );
}

function NightVignetteOverlay({ enabled }: { enabled: boolean }) {
  // DOM overlay — has to stay reactive, but only the alpha values matter and
  // they ramp slowly. Quantize to 0.25h steps (~2.5s real) so we re-render
  // the overlay far less often than the 5Hz time tick.
  const quantizedTime = useGameStore((state) => Math.round(state.timeOfDay * 4) / 4);

  if (!enabled) return null;

  const sunH = Math.sin(((quantizedTime - 6) / 24) * Math.PI * 2);
  const nightFactor = THREE.MathUtils.smoothstep((0.14 - sunH) / 0.48, 0, 1);
  const bottomAlpha = THREE.MathUtils.lerp(0.10, 0.36, nightFactor);
  const sideAlpha = THREE.MathUtils.lerp(0.05, 0.18, nightFactor);
  const topAlpha = THREE.MathUtils.lerp(0.04, 0.13, nightFactor);

  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{
        background: [
          `linear-gradient(to top, rgba(0,0,0,${bottomAlpha}) 0%, rgba(0,0,0,${bottomAlpha * 0.82}) 12%, rgba(0,0,0,${bottomAlpha * 0.28}) 24%, transparent 38%)`,
          `linear-gradient(to bottom, rgba(0,0,0,${topAlpha}) 0%, rgba(0,0,0,${topAlpha * 0.45}) 14%, transparent 30%)`,
          `radial-gradient(ellipse at center, transparent 48%, rgba(0,0,0,${sideAlpha * 0.42}) 74%, rgba(0,0,0,${sideAlpha}) 100%)`,
        ].join(', '),
      }}
    />
  );
}
