import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { EffectComposer, Bloom, Vignette, BrightnessContrast, HueSaturation, N8AO } from '@react-three/postprocessing';
import { Ship } from './Ship';
import { Ocean } from './Ocean';
import { World } from './World';
import { Player } from './Player';
import { Pedestrians } from './Pedestrians';
import { useGameStore, getCrewByRole, captainHasTrait, captainHasAbility, getRoleBonus } from '../store/gameStore';
import { ambientEngine } from '../audio/AmbientEngine';
import { sfxDisembark, sfxEmbark, sfxBattleStations, sfxAnchorDrop, sfxAnchorWeigh, sfxCannonFire, sfxCannonImpact, sfxCannonSplash, sfxBroadsideCannon, sfxMusket, sfxBowRelease } from '../audio/SoundEffects';
import { audioManager } from '../audio/AudioManager';
import * as THREE from 'three';
import { Suspense, useRef, useEffect, useMemo, useState } from 'react';
import { ShiftSelectOverlay } from './ShiftSelectOverlay';
import { TouchSteerRaycaster } from './TouchControls';
import { getTerrainHeight, getTerrainData, BiomeType } from '../utils/terrain';
import { SEA_LEVEL } from '../constants/world';
import {
  getLiveShipTransform,
  getLiveWalkingTransform,
} from '../utils/livePlayerTransform';
import { SplashSystem } from './SplashSystem';
import { spawnSplash, spawnSplinters } from '../utils/splashState';
import {
  mouseWorldPos,
  mouseRay,
  projectiles,
  spawnProjectile,
  setSwivelAimAngle,
  setHuntAimAngle,
  huntAimAngle,
  swivelAimAngle,
  npcLivePositions,
  wildlifeLivePositions,
  wildlifeKillQueue,
  landWeaponReload,
  fireHeld,
  setFireHeld,
  broadsideQueue,
  broadsideReload,
} from '../utils/combatState';
import { WEAPON_DEFS, LAND_WEAPON_DEFS, type WeaponType, type LandWeaponType } from '../store/gameStore';
import { lootForKill } from '../utils/huntLoot';
import { resolveWaterPaletteId } from '../utils/waterPalettes';
import { PERFORMANCE_STATS_EVENT, type PerformanceStats } from '../utils/performanceStats';
import { sampleCameraShake } from '../utils/cameraShakeState';

// ── Landfall descriptions keyed to biome + terrain data ──────────────────────
function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
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
      // Step scales with current zoom so it feels consistent at all distances
      const step = Math.max(1.5, zoomTarget.current * 0.06);
      zoomTarget.current = Math.max(10, Math.min(150,
        zoomTarget.current + (e.deltaY > 0 ? step : -step)
      ));
    };

    const handleContextMenu = (e: MouseEvent) => e.preventDefault();

    const handlePointerMove = (e: PointerEvent) => {
      // Track mouse NDC for combat aiming
      const rect = el.getBoundingClientRect();
      mouseNDC.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouseNDC.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      // Right-button drag (buttons bitmask: 2 = right)
      if (!(e.buttons & 2)) return;
      const { cameraZoom } = useGameStore.getState();
      const scale = cameraZoom / el.clientHeight * 2;
      panOffset.current.x -= e.movementX * scale;
      panOffset.current.z -= e.movementY * scale;
      snapBack.current = false;
    };

    const handlePointerDown = (e: PointerEvent) => {
      // Left click (button 0) in combat mode = fire
      if (e.button === 0 && useGameStore.getState().combatMode) {
        setFireHeld(true);
      }
    };
    const handlePointerUp = (e: PointerEvent) => {
      if (e.button === 0) setFireHeld(false);
    };

    // Z/X camera rotation keys (use window so they work even when canvas isn't focused)
    const handleRotKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === 'z') rotationKeys.current.z = true;
      if (k === 'x') rotationKeys.current.x = true;
    };
    const handleRotKeyUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === 'z') rotationKeys.current.z = false;
      if (k === 'x') rotationKeys.current.x = false;
    };

    el.addEventListener('wheel', handleWheel);
    el.addEventListener('contextmenu', handleContextMenu);
    el.addEventListener('pointermove', handlePointerMove);
    el.addEventListener('pointerdown', handlePointerDown);
    el.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('keydown', handleRotKeyDown);
    window.addEventListener('keyup', handleRotKeyUp);
    return () => {
      el.removeEventListener('wheel', handleWheel);
      el.removeEventListener('contextmenu', handleContextMenu);
      el.removeEventListener('pointermove', handlePointerMove);
      el.removeEventListener('pointerdown', handlePointerDown);
      el.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('keydown', handleRotKeyDown);
      window.removeEventListener('keyup', handleRotKeyUp);
    };
  }, [gl, setCameraZoom]);

  useFrame((_, delta) => {
    // Smooth zoom lerp — gentle ease-out
    const currentZoom = useGameStore.getState().cameraZoom;
    if (Math.abs(zoomTarget.current - currentZoom) > 0.05) {
      const lerpSpeed = 1 - Math.exp(-delta * 6); // smooth ~6/s convergence
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

    // Camera shake/kick — applied on top of the base position set above.
    // World-space offset so the jitter doesn't rotate with cameraRotation.
    const shake = sampleCameraShake(delta);
    camera.position.x += shake.x;
    camera.position.y += shake.y;
    camera.position.z += shake.z;

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

    if (raycaster.current.ray.intersectPlane(aimPlane, hitVec.current)) {
      mouseWorldPos.x = hitVec.current.x;
      mouseWorldPos.z = hitVec.current.z;
      mouseWorldPos.valid = true;
      const combat = useGameStore.getState().combatMode;
      if (combat && !inWalkingMode) {
        const shipPos = getLiveShipTransform().pos;
        setSwivelAimAngle(Math.atan2(hitVec.current.x - shipPos[0], hitVec.current.z - shipPos[2]));
      } else if (combat && inWalkingMode) {
        const wp = walkingTransform.pos;
        setHuntAimAngle(Math.atan2(hitVec.current.x - wp[0], hitVec.current.z - wp[2]));
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
  if (!mouseWorldPos.valid) return;

  const weaponId = state.activeLandWeapon;
  const def = LAND_WEAPON_DEFS[weaponId];
  const now = Date.now();
  const readyAt = landWeaponReload[weaponId] ?? 0;
  if (now < readyAt) return;

  // Ammo check (musket needs Munitions, bow is free)
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

  const wp = getLiveWalkingTransform().pos;
  // Muzzle origin: chest height + a short way along aim direction
  const aimX = Math.sin(huntAimAngle);
  const aimZ = Math.cos(huntAimAngle);
  const origin = new THREE.Vector3(
    wp[0] + aimX * 0.8,
    wp[1] + 1.4,
    wp[2] + aimZ * 0.8,
  );

  // Direction with slight random spread cone
  const spread = (Math.random() - 0.5) * 2 * def.spread;
  const angle = huntAimAngle + spread;
  const dir = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle)).normalize();

  spawnProjectile(origin, dir, def.projectileSpeed, weaponId);

  if (weaponId === 'musket') {
    sfxMusket();
    window.dispatchEvent(new CustomEvent('musket-fired', {
      detail: { x: origin.x, y: origin.y, z: origin.z, dirX: dir.x, dirZ: dir.z },
    }));
  } else {
    sfxBowRelease();
    window.dispatchEvent(new CustomEvent('bow-fired', {
      detail: { x: origin.x, y: origin.y, z: origin.z },
    }));
  }
}

// Interaction controller
// Shared fire logic — called by both spacebar and mouse hold
const lastFireTimeGlobal = { current: 0 };
function tryFireSwivel() {
  const now = Date.now();
  const reloadMs = WEAPON_DEFS.swivelGun.reloadTime * 1000;
  if (now - lastFireTimeGlobal.current < reloadMs) return;
  if (!mouseWorldPos.valid) return;
  const state = useGameStore.getState();
  if (!state.combatMode || state.playerMode !== 'ship') return;

  lastFireTimeGlobal.current = now;
  const { pos: shipPos, rot: shipRot } = getLiveShipTransform();
  // Barrel tip: bow (3 units forward along ship heading) + 1.2 along aim direction
  const bowX = shipPos[0] + Math.sin(shipRot) * 3.0;
  const bowZ = shipPos[2] + Math.cos(shipRot) * 3.0;
  const flatDir = new THREE.Vector3(
    mouseWorldPos.x - shipPos[0], 0, mouseWorldPos.z - shipPos[2]
  ).normalize();
  const origin = new THREE.Vector3(
    bowX + flatDir.x * 1.2, 1.8, bowZ + flatDir.z * 1.2
  );
  const dir = new THREE.Vector3(flatDir.x, 0.35, flatDir.z).normalize();
  spawnProjectile(origin, dir, WEAPON_DEFS.swivelGun.range * 4, 'swivelGun');
  sfxCannonFire();
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
  if (state.cargo.Munitions < broadsideWeapons.length) {
    state.addNotification('Not enough shot! Need munitions.', 'warning');
    return;
  }

  // Consume munitions
  const newCargo = { ...state.cargo, Munitions: state.cargo.Munitions - broadsideWeapons.length };
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

  // Queue rolling broadside — stagger each cannon by ~150ms
  const STAGGER_MS = 150;
  broadsideWeapons.forEach((weaponType, idx) => {
    // Position along ship length: spread guns evenly from stern to bow
    const t = broadsideWeapons.length === 1 ? 0.5 : idx / (broadsideWeapons.length - 1);
    const alongShip = (t - 0.5) * SHIP_LENGTH;

    const originX = shipPos[0] + Math.sin(shipRot) * alongShip + sideDir.x * HULL_HALF_WIDTH;
    const originZ = shipPos[2] + Math.cos(shipRot) * alongShip + sideDir.z * HULL_HALF_WIDTH;
    const origin = new THREE.Vector3(originX, 1.2, originZ);

    // Direction: perpendicular + slight random spread (±5°)
    const spread = (Math.random() - 0.5) * 0.17; // ~±5 degrees
    const dirAngle = sideAngle + spread;
    const dir = new THREE.Vector3(
      Math.sin(dirAngle),
      0.15 + Math.random() * 0.1, // slight upward arc
      Math.cos(dirAngle),
    ).normalize();

    const speed = WEAPON_DEFS[weaponType].range * 3.5;

    broadsideQueue.push({
      fireAt: now + idx * STAGGER_MS,
      origin,
      direction: dir,
      speed,
      weaponType,
      fired: false,
    });
  });

  // Notify Ship.tsx for smoke effects
  window.dispatchEvent(new CustomEvent('broadside-fired', { detail: { side } }));
  state.addNotification(
    `${side === 'port' ? 'Port' : 'Starboard'} broadside! (${broadsideWeapons.length} guns)`,
    'info',
  );
}

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

      nearestLandRef.current = foundLand;

      const nextPrompt = foundLand ? 'Press E to Disembark' : null;
      if (promptRef.current !== nextPrompt) {
        promptRef.current = nextPrompt;
        setInteractionPrompt(nextPrompt);
      }
    } else {
      // Check if near ship to embark
      const dx = walkingPos[0] - playerPos[0];
      const dz = walkingPos[2] - playerPos[2];
      const dist = Math.sqrt(dx * dx + dz * dz);

      const nextPrompt = dist < 15 ? 'Press E to Embark' : null;
      if (promptRef.current !== nextPrompt) {
        promptRef.current = nextPrompt;
        setInteractionPrompt(nextPrompt);
      }
    }
  }, -1);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      const state = useGameStore.getState();
      if (key === 'e') {
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
        } else if (state.interactionPrompt === 'Press E to Embark') {
          state.setPlayerMode('ship');
          state.setInteractionPrompt(null);
          sfxEmbark();
        }
      } else if (key === 't') {
        // Hailing is handled by the HUD HailPanel so it can present choices.
      } else if (key === 'q' && state.playerMode === 'ship' && state.combatMode) {
        tryFireBroadside('port');
      } else if (key === 'r' && state.playerMode === 'ship' && state.combatMode) {
        tryFireBroadside('starboard');
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
      } else if (key === ' ' && state.playerMode === 'ship') {
        e.preventDefault();
        if (state.combatMode) {
          setFireHeld(true);
          tryFireSwivel();
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
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ') setFireHeld(false);
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

function ProjectileSystem() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame((_, delta) => {
    if (!meshRef.current) return;

    // Auto-fire while mouse is held in combat mode — routes to the right weapon
    // based on player mode. Each weapon's own reload timer prevents spam.
    if (fireHeld) {
      const pm = useGameStore.getState().playerMode;
      if (pm === 'ship') tryFireSwivel();
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
        spawnProjectile(shot.origin, shot.direction, shot.speed, shot.weaponType);
        sfxBroadsideCannon();
        shot.fired = true;
      }
    }

    const { adjustReputation, addNotification } = useGameStore.getState();

    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      p.life -= delta;
      if (p.life <= 0) {
        projectiles.splice(i, 1);
        continue;
      }

      const isLandWeapon = p.weaponType === 'musket' || p.weaponType === 'bow';

      // Land weapons fly mostly flat — only a tiny droop at distance.
      // Ship weapons keep their existing gravity arc.
      p.vel.y -= (isLandWeapon ? 1.5 : 15) * delta;
      p.pos.addScaledVector(p.vel, delta);

      // Out-of-bounds drop: water for ship shots, terrain miss for land shots.
      if (p.pos.y < 0) {
        if (isLandWeapon) {
          // Hit ground / vegetation — small puff, no splash sound.
          spawnSplash(p.pos.x, p.pos.z, 0.2);
        } else {
          spawnSplash(p.pos.x, p.pos.z, p.weaponType === 'swivelGun' ? 0.5 : 0.9);
          sfxCannonSplash();
        }
        projectiles.splice(i, 1);
        continue;
      }

      let hit = false;

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
            // Splatter puff — reuse splinter system for now
            spawnSplinters(p.pos.x, p.pos.y, p.pos.z, 0.4);
            if (w.hp <= 0) {
              w.dead = true;
              wildlifeKillQueue.add(id);
              // Award loot
              const loot = lootForKill(w.template, w.variant);
              if (loot) {
                const gs = useGameStore.getState();
                const newCargo = { ...gs.cargo };
                const dropParts: string[] = [];
                for (const drop of loot.drops) {
                  newCargo[drop.commodity] = (newCargo[drop.commodity] ?? 0) + drop.amount;
                  dropParts.push(`+${drop.amount} ${drop.commodity}`);
                }
                useGameStore.setState({ cargo: newCargo });
                addNotification(`Killed a ${loot.commonName}.`, 'success', {
                  subtitle: dropParts.join(' · '),
                });
              } else {
                addNotification(`Killed a ${w.variant}.`, 'success');
              }
            } else {
              const hpPct = Math.round((w.hp / w.maxHp) * 100);
              addNotification(`Hit the ${w.variant}. (${hpPct}% HP)`, 'warning');
            }
            projectiles.splice(i, 1);
            hit = true;
            break;
          }
        }
        if (hit) continue;
        // Land weapons don't hit ships — skip the NPC-ship hit test.
        continue;
      }

      // ── Ship weapon: hit-test against NPC ships ──
      for (const [, npc] of npcLivePositions) {
        if (npc.sunk) continue;
        const dx = p.pos.x - npc.x;
        const dz = p.pos.z - npc.z;
        if (dx * dx + dz * dz < NPC_HIT_RADIUS * NPC_HIT_RADIUS) {
          sfxCannonImpact();
          spawnSplinters(p.pos.x, p.pos.y, p.pos.z, p.weaponType === 'swivelGun' ? 0.5 : 0.9);
          // Deal damage based on projectile's weapon type + gunner/ability bonuses
          const gState = useGameStore.getState();
          const gunner = getCrewByRole(gState, 'Gunner');
          const gunnerMod = gunner ? 1.0 + (gunner.stats.strength / 200) + (gunner.stats.perception / 400) : 1.0;
          const abilityMod = captainHasAbility(gState, 'Broadside Master') ? 1.15 : 1.0;
          const damage = Math.floor(WEAPON_DEFS[p.weaponType as WeaponType].damage * gunnerMod * abilityMod);
          npc.hull = Math.max(0, npc.hull - damage);
          // Reputation penalty scaled: swivel = -5, broadside = -15
          const repPenalty = p.weaponType === 'swivelGun' ? -5 : -15;
          adjustReputation(npc.flag as any, repPenalty);
          const hullPct = Math.round((npc.hull / npc.maxHull) * 100);
          if (npc.hull > 0) {
            addNotification(`Hit the ${npc.shipName}! Hull: ${hullPct}%`, 'warning');
          }
          npc.hitAlert = Date.now() + 10000;
          projectiles.splice(i, 1);
          hit = true;
          break;
        }
      }
      if (hit) continue;
    }

    // Update instanced mesh — broadside cannonballs larger, musket/bow smaller
    for (let i = 0; i < PROJECTILE_COUNT; i++) {
      if (i < projectiles.length) {
        dummy.position.copy(projectiles[i].pos);
        const wt = projectiles[i].weaponType;
        const s = wt === 'musket' ? 0.35
                : wt === 'bow' ? 0.4
                : wt === 'swivelGun' ? 1
                : 1.6;
        dummy.scale.setScalar(s);
      } else {
        dummy.position.set(0, -1000, 0);
        dummy.scale.setScalar(0);
      }
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
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
  );
}

// Time controller
function TimeController() {
  const advanceTime = useGameStore((state) => state.advanceTime);
  const paused = useGameStore((state) => state.paused);
  const accumulatedDelta = useRef(0);
  const ambientAccum = useRef(0);
  const STORE_TIME_STEP = 0.2;

  useFrame((_, delta) => {
    if (paused) return;
    accumulatedDelta.current += delta;
    if (accumulatedDelta.current < STORE_TIME_STEP) return;

    // 1 real second = 0.1 game hours
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

// Syncs fog color, background color, and computes postprocessing params from timeOfDay
function useAtmosphere() {
  const timeOfDay = useGameStore((state) => state.timeOfDay);
  const waterPaletteId = useGameStore((state) => resolveWaterPaletteId(state));

  return useMemo(() => {
    const angle = ((timeOfDay - 6) / 24) * Math.PI * 2;
    const sunH = Math.sin(angle);
    const horizonFactor = Math.exp(-sunH * sunH * 10);

    // The Sky dome handles most visible sky color. These colors primarily
    // drive fallback background and distant atmospheric fog.
    let skyColor: THREE.Color;
    let fogColor: THREE.Color;
    const climateSky = {
      daySky: waterPaletteId === 'monsoon' ? '#5aaec0' : waterPaletteId === 'temperate' ? '#8fa8b2' : waterPaletteId === 'tropical' ? '#5aade6' : '#6ab2dc',
      dayFog: waterPaletteId === 'monsoon' ? '#9ccfd0' : waterPaletteId === 'temperate' ? '#a9b9bf' : waterPaletteId === 'tropical' ? '#a0ccde' : '#a8cede',
      duskSky: waterPaletteId === 'monsoon' ? '#24445a' : waterPaletteId === 'temperate' ? '#354852' : '#1d3158',
      duskFog: waterPaletteId === 'monsoon' ? '#263b46' : waterPaletteId === 'temperate' ? '#46565b' : '#202b42',
      warmSky: waterPaletteId === 'monsoon' ? '#e6a06c' : waterPaletteId === 'temperate' ? '#c8a58a' : '#f0a36b',
      warmFog: waterPaletteId === 'monsoon' ? '#bca887' : waterPaletteId === 'temperate' ? '#b5aa99' : '#d9b59a',
      nightSky: waterPaletteId === 'monsoon' ? '#122b3d' : waterPaletteId === 'temperate' ? '#182832' : '#14284a',
      nightFog: waterPaletteId === 'monsoon' ? '#142633' : waterPaletteId === 'temperate' ? '#1a2a31' : '#18243a',
    };
    if (sunH > 0.3) {
      // Full day — cheerful tropical blue with a little humid warmth.
      skyColor = new THREE.Color(climateSky.daySky);
      fogColor = new THREE.Color(climateSky.dayFog);
    } else if (sunH > 0.05) {
      // Golden hour — more theatrical warmth, less realistic gray.
      const t = (sunH - 0.05) / 0.25;
      skyColor = new THREE.Color().lerpColors(
        new THREE.Color(climateSky.warmSky),
        new THREE.Color(climateSky.daySky),
        t
      );
      fogColor = new THREE.Color().lerpColors(
        new THREE.Color(climateSky.warmFog),
        new THREE.Color(climateSky.dayFog),
        t
      );
    } else if (sunH > -0.15) {
      // Sunset/sunrise — warm amber into a readable blue night.
      const t = (sunH + 0.15) / 0.2;
      skyColor = new THREE.Color().lerpColors(
        new THREE.Color(climateSky.duskSky),
        new THREE.Color(climateSky.warmSky),
        t
      );
      fogColor = new THREE.Color().lerpColors(
        new THREE.Color(climateSky.duskFog),
        new THREE.Color(climateSky.warmFog),
        t
      );
    } else {
      // Night — still blue, but not grim.
      skyColor = new THREE.Color(climateSky.nightSky);
      fogColor = new THREE.Color(climateSky.nightFog);
    }

    // Keep a faint baseline haze everywhere so the world is not unnaturally
    // crisp, then let AtmosphereSync add stronger fog near map edges.
    const clearDayPalette = waterPaletteId === 'tropical'
      || waterPaletteId === 'monsoon'
      || waterPaletteId === 'arid'
      || waterPaletteId === 'mediterranean';
    const fogNear = sunH > 0
      ? clearDayPalette ? 300 : 280
      : 100 + Math.max(0, sunH + 0.3) * 200;
    const fogFar = sunH > 0
      ? clearDayPalette ? 1000 : 880
      : 300 + Math.max(0, sunH + 0.3) * 580;

    // Postprocessing — golden hour warm, night cool/desaturated
    let brightness = 0;
    let contrast = 0;
    let hue = 0;
    let saturation = 0;

    if (sunH > 0.3) {
      // Day — gentle with restrained saturation for a period-painterly feel.
      brightness = 0.01;
      contrast = 0.02;
      saturation = 0.02;
    } else if (sunH > -0.05) {
      // Golden hour — warm, slightly saturated
      const t = Math.max(0, Math.min(1, (0.3 - sunH) / 0.35));
      brightness = -0.005 * t;
      contrast = 0.04 * t;
      hue = 0.05 * t;
      saturation = 0.18 * t;
    } else {
      // Night — blue-shifted, slightly saturated for lush midnight feel
      const t = Math.max(0, Math.min(1, (-0.05 - sunH) / 0.3));
      brightness = -0.02 * t;
      contrast = 0;
      hue = -0.12 * t;
      saturation = 0.06 * t;
    }

    return { skyColor, fogColor, fogNear, fogFar, brightness, contrast, hue, saturation };
  }, [timeOfDay, waterPaletteId]);
}

// Syncs Three.js fog and background with computed atmosphere colors
function AtmosphereSync() {
  const { skyColor, fogColor, fogNear, fogFar } = useAtmosphere();
  const devSoloPort = useGameStore((state) => state.devSoloPort);
  const { scene } = useThree();

  useFrame(() => {
    if (scene.background instanceof THREE.Color) {
      scene.background.copy(skyColor);
    }
    if (scene.fog instanceof THREE.Fog) {
      const shipTransform = getLiveShipTransform();
      const mapHalf = (devSoloPort ? 1000 : 900) / 2;
      const edgeDistance = mapHalf - Math.max(
        Math.abs(shipTransform.pos[0]),
        Math.abs(shipTransform.pos[2]),
      );
      const edgeFog = 1 - smoothstep(45, 185, edgeDistance);
      const edgeNear = THREE.MathUtils.lerp(fogNear, 70, edgeFog);
      const edgeFar = THREE.MathUtils.lerp(fogFar, 260, edgeFog);

      scene.fog.color.copy(fogColor);
      scene.fog.near = edgeNear;
      scene.fog.far = Math.max(edgeNear + 80, edgeFar);
    }
  });

  return null;
}

function PerformanceSampler() {
  const { gl } = useThree();
  const sampleRef = useRef({ elapsed: 0, frames: 0, maxDelta: 0 });

  useFrame((_, delta) => {
    const sample = sampleRef.current;
    sample.elapsed += delta;
    sample.frames++;
    sample.maxDelta = Math.max(sample.maxDelta, delta);

    if (sample.elapsed < 0.5) return;

    const state = useGameStore.getState();
    const info = gl.info;
    const stats: PerformanceStats = {
      fps: sample.frames / sample.elapsed,
      avgFrameMs: (sample.elapsed / sample.frames) * 1000,
      maxFrameMs: sample.maxDelta * 1000,
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
  });

  return null;
}

export function GameScene() {
  const postprocessingEnabled = useGameStore((state) => state.renderDebug.postprocessing);
  const bloomEnabled = useGameStore((state) => state.renderDebug.bloom);
  const vignetteEnabled = useGameStore((state) => state.renderDebug.vignette);
  const [canvasReadyToMount, setCanvasReadyToMount] = useState(false);

  useEffect(() => {
    const frameId = requestAnimationFrame(() => setCanvasReadyToMount(true));
    return () => cancelAnimationFrame(frameId);
  }, []);

  return (
    <>
      {canvasReadyToMount && (
        <Canvas
          dpr={[1, 1.25]}
          gl={{ antialias: true, powerPreference: 'high-performance', toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 0.97 }}
          shadows={{ type: THREE.PCFShadowMap }}
          camera={{ position: [0, 50, 50], fov: 45 }}
        >
          <Suspense fallback={null}>
            <color attach="background" args={['#87CEEB']} />
            <fog attach="fog" args={['#87CEEB', 200, 600]} />

            <World />
            <Ocean />
            <Ship />
            <Player />
            <Pedestrians />

            <CameraController />
            <TouchSteerRaycaster />
            <InteractionController />
            <ProjectileSystem />
            <SplashSystem />
            <TimeController />
            <AtmosphereSync />
            <PerformanceSampler />
            <ShiftSelectOverlay />

            {postprocessingEnabled && (
              <PostProcessing bloomEnabled={bloomEnabled} vignetteEnabled={vignetteEnabled} />
            )}
          </Suspense>
        </Canvas>
      )}
      <NightVignetteOverlay enabled={vignetteEnabled} />
    </>
  );
}


function PostProcessing({ bloomEnabled, vignetteEnabled }: { bloomEnabled: boolean; vignetteEnabled: boolean }) {
  const { brightness, contrast, hue, saturation } = useAtmosphere();
  const timeOfDay = useGameStore((state) => state.timeOfDay);
  const sunH = Math.sin(((timeOfDay - 6) / 24) * Math.PI * 2);
  const nightFactor = THREE.MathUtils.smoothstep((0.12 - sunH) / 0.42, 0, 1);
  const vignetteOffset = THREE.MathUtils.lerp(0.18, 0.12, nightFactor);
  const vignetteDarkness = THREE.MathUtils.lerp(0.85, 1.12, nightFactor);

  return (
    <EffectComposer>
      <N8AO
        aoRadius={1.2}
        intensity={1.5}
        aoSamples={4}
        denoiseSamples={2}
        denoiseRadius={8}
        distanceFalloff={1.0}
        halfRes
      />
      {bloomEnabled && <Bloom luminanceThreshold={0.35} luminanceSmoothing={0.9} height={300} intensity={1.0} />}
      <BrightnessContrast brightness={brightness} contrast={contrast} />
      <HueSaturation hue={hue} saturation={saturation} />
      {vignetteEnabled && <Vignette eskil={false} offset={vignetteOffset} darkness={vignetteDarkness} />}
    </EffectComposer>
  );
}

function NightVignetteOverlay({ enabled }: { enabled: boolean }) {
  const timeOfDay = useGameStore((state) => state.timeOfDay);

  if (!enabled) return null;

  const sunH = Math.sin(((timeOfDay - 6) / 24) * Math.PI * 2);
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
