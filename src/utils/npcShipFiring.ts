import * as THREE from 'three';
import type { MutableRefObject } from 'react';
import { WEAPON_DEFS, type WeaponType } from '../store/gameStore';
import type { NPCShipIdentity } from './npcShipGenerator';
import { broadsideQueue, spawnProjectile } from './combatState';
import { sfxCannonFire } from '../audio/SoundEffects';
import { angleDelta } from './npcShipNavigation';

const NPC_BOW_FIRE_RANGE = 62;
const NPC_BROADSIDE_MIN_RANGE = 24;
const NPC_BROADSIDE_MAX_RANGE = 105;
const NPC_BOW_FIRE_ARC = Math.PI / 6;
const NPC_BROADSIDE_FIRE_ARC = Math.PI / 4.5;
const NPC_LEAD_TIME = 0.7;
const NPC_FIRE_JITTER = 0.095;
const NPC_BROADSIDE_STAGGER_MS = 170;
const NPC_INTENT_LEAD_MS = 550;

export function npcProjectileSpeed(weaponType: WeaponType, distance: number) {
  if (WEAPON_DEFS[weaponType].aimable) return WEAPON_DEFS[weaponType].range * 3.25;
  const gravity = 24;
  const angleRad = THREE.MathUtils.degToRad(7.5);
  const sin2 = Math.max(0.12, Math.sin(angleRad * 2));
  return THREE.MathUtils.clamp(Math.sqrt((distance * gravity) / sin2), 32, 96);
}

export function tryNpcFireAtPlayer({
  now,
  identity,
  currentPos,
  heading,
  playerPos,
  playerRot,
  playerVel,
  distToPlayer,
  bowWeapon,
  broadsideWeapon,
  broadsideCount,
  nextBowFireAt,
  nextBroadsideFireAt,
  bowIntentReadyAt,
  broadsideIntentReadyAt,
  showIntentText,
}: {
  now: number;
  identity: NPCShipIdentity;
  currentPos: THREE.Vector3;
  heading: number;
  playerPos: readonly [number, number, number];
  playerRot: number;
  playerVel: number;
  distToPlayer: number;
  bowWeapon: WeaponType;
  broadsideWeapon: WeaponType;
  broadsideCount: number;
  nextBowFireAt: MutableRefObject<number>;
  nextBroadsideFireAt: MutableRefObject<number>;
  bowIntentReadyAt: MutableRefObject<number>;
  broadsideIntentReadyAt: MutableRefObject<number>;
  showIntentText: (now: number, label: string, currentPos: THREE.Vector3) => void;
}) {
  const playerForward = new THREE.Vector3(Math.sin(playerRot), 0, Math.cos(playerRot));
  const predictedTarget = new THREE.Vector3(
    playerPos[0] + playerForward.x * playerVel * NPC_LEAD_TIME,
    1.25,
    playerPos[2] + playerForward.z * playerVel * NPC_LEAD_TIME,
  );
  const aimVec = predictedTarget.sub(new THREE.Vector3(currentPos.x, 1.25, currentPos.z));
  const horizontalDistance = Math.hypot(aimVec.x, aimVec.z);
  if (horizontalDistance < 0.001) return;

  const bearing = Math.atan2(aimVec.x, aimVec.z);

  if (broadsideCount > 0 && distToPlayer >= NPC_BROADSIDE_MIN_RANGE && distToPlayer <= NPC_BROADSIDE_MAX_RANGE && now >= nextBroadsideFireAt.current) {
    const portAngle = heading + Math.PI / 2;
    const starboardAngle = heading - Math.PI / 2;
    const portDiff = Math.abs(angleDelta(bearing, portAngle));
    const starboardDiff = Math.abs(angleDelta(bearing, starboardAngle));
    const sideAngle = portDiff < starboardDiff ? portAngle : starboardAngle;
    const sideDiff = Math.min(portDiff, starboardDiff);
    if (sideDiff <= NPC_BROADSIDE_FIRE_ARC) {
      if (broadsideIntentReadyAt.current === 0 || now > broadsideIntentReadyAt.current + 1000) {
        broadsideIntentReadyAt.current = now + NPC_INTENT_LEAD_MS;
        showIntentText(now, 'Guns Run Out', currentPos);
        return;
      }
      if (now < broadsideIntentReadyAt.current) return;
      broadsideIntentReadyAt.current = 0;
      const def = WEAPON_DEFS[broadsideWeapon];
      nextBroadsideFireAt.current = now + def.reloadTime * 1000 * THREE.MathUtils.lerp(0.9, 1.25, Math.random());
      const sideDir = new THREE.Vector3(Math.sin(sideAngle), 0, Math.cos(sideAngle)).normalize();
      const hullHalfWidth = Math.max(1.1, identity.visual.scale * 1.15);
      const shipLength = Math.max(4.5, identity.visual.scale * 5.0);
      for (let idx = 0; idx < broadsideCount; idx++) {
        const t = broadsideCount === 1 ? 0.5 : idx / (broadsideCount - 1);
        const alongShip = (t - 0.5) * shipLength;
        const origin = new THREE.Vector3(
          currentPos.x + Math.sin(heading) * alongShip + sideDir.x * hullHalfWidth,
          1.2,
          currentPos.z + Math.cos(heading) * alongShip + sideDir.z * hullHalfWidth,
        );
        const spread = (Math.random() - 0.5) * NPC_FIRE_JITTER;
        const dirAngle = sideAngle + spread;
        const angleRad = THREE.MathUtils.degToRad(7.5 + (Math.random() - 0.5) * 2.2);
        const horizontal = Math.cos(angleRad);
        const direction = new THREE.Vector3(
          Math.sin(dirAngle) * horizontal,
          Math.sin(angleRad),
          Math.cos(dirAngle) * horizontal,
        ).normalize();
        broadsideQueue.push({
          fireAt: now + idx * NPC_BROADSIDE_STAGGER_MS,
          origin,
          direction,
          speed: npcProjectileSpeed(broadsideWeapon, horizontalDistance),
          weaponType: broadsideWeapon,
          owner: 'npc',
          ownerId: identity.id,
          maxDistance: Math.min(def.range * 1.25, horizontalDistance * 1.3),
          fired: false,
        });
      }
      return;
    }
  }

  if (distToPlayer <= NPC_BOW_FIRE_RANGE && now >= nextBowFireAt.current && Math.abs(angleDelta(bearing, heading)) <= NPC_BOW_FIRE_ARC) {
    if (bowIntentReadyAt.current === 0 || now > bowIntentReadyAt.current + 1000) {
      bowIntentReadyAt.current = now + NPC_INTENT_LEAD_MS;
      showIntentText(now, 'Taking Aim', currentPos);
      return;
    }
    if (now < bowIntentReadyAt.current) return;
    bowIntentReadyAt.current = 0;
    const def = WEAPON_DEFS[bowWeapon];
    nextBowFireAt.current = now + def.reloadTime * 1000 * THREE.MathUtils.lerp(1.4, 2.4, Math.random());
    const yaw = bearing + (Math.random() - 0.5) * NPC_FIRE_JITTER;
    const pitch = THREE.MathUtils.degToRad(3 + Math.random() * 2);
    const horizontal = Math.cos(pitch);
    const origin = new THREE.Vector3(
      currentPos.x + Math.sin(heading) * Math.max(2.6, identity.visual.scale * 2.8),
      1.45,
      currentPos.z + Math.cos(heading) * Math.max(2.6, identity.visual.scale * 2.8),
    );
    const direction = new THREE.Vector3(
      Math.sin(yaw) * horizontal,
      Math.sin(pitch),
      Math.cos(yaw) * horizontal,
    ).normalize();
    spawnProjectile(origin, direction, npcProjectileSpeed(bowWeapon, horizontalDistance), bowWeapon, {
      owner: 'npc',
      ownerId: identity.id,
      maxDistance: Math.min(def.range * 1.15, horizontalDistance * 1.35),
    });
    sfxCannonFire(bowWeapon);
  }
}
