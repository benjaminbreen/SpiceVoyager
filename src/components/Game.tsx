import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ContactShadows } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette, BrightnessContrast, HueSaturation, N8AO } from '@react-three/postprocessing';
import { Ship } from './Ship';
import { Ocean } from './Ocean';
import { World } from './World';
import { UI } from './UI';
import { Player } from './Player';
import { GameOverScreen } from './GameOverScreen';
import { CrewDeathModal } from './CrewDeathModal';
import { useGameStore, getCrewByRole, captainHasTrait, captainHasAbility, getRoleBonus } from '../store/gameStore';
import { ambientEngine } from '../audio/AmbientEngine';
import { sfxDisembark, sfxEmbark, sfxBattleStations, sfxAnchorDrop, sfxAnchorWeigh, sfxCannonFire, sfxCannonImpact, sfxCannonSplash, sfxBroadsideCannon } from '../audio/SoundEffects';
import { audioManager } from '../audio/AudioManager';
import * as THREE from 'three';
import { Suspense, useRef, useEffect, useMemo } from 'react';
import { ShiftSelectOverlay } from './ShiftSelectOverlay';
import { getTerrainHeight, getTerrainData, BiomeType } from '../utils/terrain';
import { SEA_LEVEL } from '../constants/world';
import {
  getLiveShipTransform,
  getLiveWalkingTransform,
} from '../utils/livePlayerTransform';
import {
  mouseWorldPos,
  projectiles,
  spawnProjectile,
  setSwivelAimAngle,
  swivelAimAngle,
  npcLivePositions,
  fireHeld,
  setFireHeld,
  broadsideQueue,
  broadsideReload,
} from '../utils/combatState';
import { WEAPON_DEFS, type WeaponType } from '../store/gameStore';

// ── Landfall descriptions keyed to biome + terrain data ──────────────────────
function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

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
  const { camera, gl } = useThree();
  const currentPos = useRef(new THREE.Vector3());
  const targetPos = useRef(new THREE.Vector3());

  // Pan state — all transient, no store needed
  const panOffset = useRef({ x: 0, z: 0 });
  const lastPlayerPos = useRef({ x: 0, z: 0 });
  const snapBack = useRef(false);

  // Smooth zoom — store a target and lerp toward it each frame
  const zoomTarget = useRef(useGameStore.getState().cameraZoom);

  // Raycaster for mouse→world projection (combat aiming)
  const raycaster = useRef(new THREE.Raycaster());
  const mouseNDC = useRef(new THREE.Vector2());
  const waterPlane = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));

  useEffect(() => {
    const el = gl.domElement;

    const handleWheel = (e: WheelEvent) => {
      // Accumulate into target; actual zoom lerps in useFrame
      zoomTarget.current = Math.max(10, Math.min(150,
        zoomTarget.current + (e.deltaY > 0 ? 4 : -4)
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

    el.addEventListener('wheel', handleWheel);
    el.addEventListener('contextmenu', handleContextMenu);
    el.addEventListener('pointermove', handlePointerMove);
    el.addEventListener('pointerdown', handlePointerDown);
    el.addEventListener('pointerup', handlePointerUp);
    return () => {
      el.removeEventListener('wheel', handleWheel);
      el.removeEventListener('contextmenu', handleContextMenu);
      el.removeEventListener('pointermove', handlePointerMove);
      el.removeEventListener('pointerdown', handlePointerDown);
      el.removeEventListener('pointerup', handlePointerUp);
    };
  }, [gl, setCameraZoom]);

  useFrame((_, delta) => {
    // Smooth zoom lerp
    const currentZoom = useGameStore.getState().cameraZoom;
    if (Math.abs(zoomTarget.current - currentZoom) > 0.05) {
      const lerpSpeed = 1 - Math.pow(0.001, delta); // ~6x per second smoothing
      setCameraZoom(currentZoom + (zoomTarget.current - currentZoom) * lerpSpeed);
    }

    const { playerMode, cameraZoom, viewMode } = useGameStore.getState();
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

    if (viewMode === 'firstperson') {
      // First-person: camera at eye level, looking in heading direction
      camera.position.x = currentPos.current.x;
      camera.position.y = currentPos.current.y + (playerMode === 'ship' ? 4 : 2);
      camera.position.z = currentPos.current.z;
      camera.lookAt(
        currentPos.current.x + Math.sin(activeRot) * 10,
        currentPos.current.y + (playerMode === 'ship' ? 3 : 1.5),
        currentPos.current.z + Math.cos(activeRot) * 10
      );
    } else if (viewMode === 'cinematic') {
      // Cinematic: close behind-and-above follow with offset behind the heading
      const dist = Math.min(cameraZoom, 20);
      camera.position.x = currentPos.current.x - Math.sin(activeRot) * dist * 0.8;
      camera.position.y = currentPos.current.y + dist * 0.5;
      camera.position.z = currentPos.current.z - Math.cos(activeRot) * dist * 0.8;
      camera.lookAt(
        currentPos.current.x + Math.sin(activeRot) * 5,
        currentPos.current.y + 1,
        currentPos.current.z + Math.cos(activeRot) * 5
      );
    } else if (viewMode === 'topdown') {
      // Top-down strategic view
      camera.position.x = currentPos.current.x;
      camera.position.y = currentPos.current.y + cameraZoom * 1.5;
      camera.position.z = currentPos.current.z + 0.01; // tiny offset to avoid gimbal lock
      camera.lookAt(currentPos.current);
    } else {
      // Default: original 45-degree diagonal view
      camera.position.x = currentPos.current.x + cameraZoom * 0.5;
      camera.position.y = currentPos.current.y + cameraZoom;
      camera.position.z = currentPos.current.z + cameraZoom;
      camera.lookAt(currentPos.current);
    }

    // Raycast mouse onto water plane — always active so aiming is ready when combat starts
    raycaster.current.setFromCamera(mouseNDC.current, camera);
    const hit = new THREE.Vector3();
    if (raycaster.current.ray.intersectPlane(waterPlane.current, hit)) {
      mouseWorldPos.x = hit.x;
      mouseWorldPos.z = hit.z;
      mouseWorldPos.valid = true;
      if (useGameStore.getState().combatMode) {
        const shipPos = getLiveShipTransform().pos;
        setSwivelAimAngle(Math.atan2(hit.x - shipPos[0], hit.z - shipPos[2]));
      }
    }
  });

  return null;
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

    // Auto-fire while mouse is held in combat mode
    if (fireHeld) tryFireSwivel();

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
      p.vel.y -= 15 * delta;
      p.pos.addScaledVector(p.vel, delta);

      if (p.pos.y < 0) {
        sfxCannonSplash();
        projectiles.splice(i, 1);
        continue;
      }

      let hit = false;
      for (const [, npc] of npcLivePositions) {
        if (npc.sunk) continue;
        const dx = p.pos.x - npc.x;
        const dz = p.pos.z - npc.z;
        if (dx * dx + dz * dz < NPC_HIT_RADIUS * NPC_HIT_RADIUS) {
          sfxCannonImpact();
          // Deal damage based on projectile's weapon type + gunner/ability bonuses
          const gState = useGameStore.getState();
          const gunner = getCrewByRole(gState, 'Gunner');
          const gunnerMod = gunner ? 1.0 + (gunner.stats.strength / 200) + (gunner.stats.perception / 400) : 1.0;
          const abilityMod = captainHasAbility(gState, 'Broadside Master') ? 1.15 : 1.0;
          const damage = Math.floor(WEAPON_DEFS[p.weaponType].damage * gunnerMod * abilityMod);
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

    // Update instanced mesh — scale broadside cannonballs larger
    for (let i = 0; i < PROJECTILE_COUNT; i++) {
      if (i < projectiles.length) {
        dummy.position.copy(projectiles[i].pos);
        // Broadside projectiles are visually bigger
        const s = projectiles[i].weaponType === 'swivelGun' ? 1 : 1.6;
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

  useFrame((_, delta) => {
    if (paused) return;
    accumulatedDelta.current += delta;
    if (accumulatedDelta.current < 0.05) return;

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

  return useMemo(() => {
    const angle = ((timeOfDay - 6) / 24) * Math.PI * 2;
    const sunH = Math.sin(angle);
    const horizonFactor = Math.exp(-sunH * sunH * 10);

    // Sky and fog are related, but fog should be less saturated than the sky
    // or distant views turn uniformly blue when zoomed out.
    let skyColor: THREE.Color;
    let fogColor: THREE.Color;
    if (sunH > 0.3) {
      // Full day
      skyColor = new THREE.Color('#87CEEB');
      fogColor = new THREE.Color('#b2c3c9');
    } else if (sunH > 0.05) {
      // Golden hour — warm sky
      const t = (sunH - 0.05) / 0.25;
      skyColor = new THREE.Color().lerpColors(
        new THREE.Color('#d4845a'),
        new THREE.Color('#87CEEB'),
        t
      );
      fogColor = new THREE.Color().lerpColors(
        new THREE.Color('#c5a48f'),
        new THREE.Color('#b2c3c9'),
        t
      );
    } else if (sunH > -0.15) {
      // Sunset/sunrise — warm to midnight blue
      const t = (sunH + 0.15) / 0.2;
      skyColor = new THREE.Color().lerpColors(
        new THREE.Color('#1a2a52'),
        new THREE.Color('#d4845a'),
        t
      );
      fogColor = new THREE.Color().lerpColors(
        new THREE.Color('#1a2338'),
        new THREE.Color('#c5a48f'),
        t
      );
    } else {
      // Night — lush midnight blue
      skyColor = new THREE.Color('#0f1f42');
      fogColor = new THREE.Color('#121b2f');
    }

    // Daytime haze should sit farther out so wide ocean views stay clearer.
    const fogNear = sunH > 0 ? 340 : 120 + Math.max(0, sunH + 0.3) * 420;
    const fogFar = sunH > 0 ? 1100 : 360 + Math.max(0, sunH + 0.3) * 1100;

    // Postprocessing — golden hour warm, night cool/desaturated
    let brightness = 0;
    let contrast = 0;
    let hue = 0;
    let saturation = 0;

    if (sunH > 0.3) {
      // Day — neutral
      brightness = 0;
      contrast = 0;
      saturation = 0.05;
    } else if (sunH > -0.05) {
      // Golden hour — warm, slightly saturated
      const t = Math.max(0, Math.min(1, (0.3 - sunH) / 0.35));
      brightness = -0.02 * t;
      contrast = 0.05 * t;
      hue = 0.05 * t;
      saturation = 0.15 * t;
    } else {
      // Night — blue-shifted, slightly saturated for lush midnight feel
      const t = Math.max(0, Math.min(1, (-0.05 - sunH) / 0.3));
      brightness = -0.03 * t;
      contrast = 0;
      hue = -0.12 * t;
      saturation = 0.1 * t;
    }

    return { skyColor, fogColor, fogNear, fogFar, brightness, contrast, hue, saturation };
  }, [timeOfDay]);
}

// Syncs Three.js fog and background with computed atmosphere colors
function AtmosphereSync() {
  const { skyColor, fogColor, fogNear, fogFar } = useAtmosphere();
  const { scene } = useThree();

  useFrame(() => {
    if (scene.background instanceof THREE.Color) {
      scene.background.copy(skyColor);
    }
    if (scene.fog instanceof THREE.Fog) {
      scene.fog.color.copy(fogColor);
      scene.fog.near = fogNear;
      scene.fog.far = fogFar;
    }
  });

  return null;
}

export function Game() {
  const postprocessingEnabled = useGameStore((state) => state.renderDebug.postprocessing);
  const bloomEnabled = useGameStore((state) => state.renderDebug.bloom);
  const vignetteEnabled = useGameStore((state) => state.renderDebug.vignette);

  return (
    <div className="w-full h-screen bg-black overflow-hidden relative">
      <Canvas
        dpr={[1, 2]}
        gl={{ antialias: true, powerPreference: 'high-performance', toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.1 }}
        shadows={{ type: THREE.PCFSoftShadowMap }}
        camera={{ position: [0, 50, 50], fov: 45 }}
      >
        <Suspense fallback={null}>
          <color attach="background" args={['#87CEEB']} />
          <fog attach="fog" args={['#87CEEB', 200, 600]} />

          <World />
          <Ocean />
          <Ship />
          <Player />
          <GroundContactShadows />

          <CameraController />
          <InteractionController />
          <ProjectileSystem />
          <TimeController />
          <AtmosphereSync />
          <ShiftSelectOverlay />

          {postprocessingEnabled && (
            <PostProcessing bloomEnabled={bloomEnabled} vignetteEnabled={vignetteEnabled} />
          )}
        </Suspense>
      </Canvas>
      <UI />
      <CrewDeathModal />
      <GameOverScreen />
    </div>
  );
}

/** Soft pooled shadows at object bases — follows the player, only active during daytime */
function GroundContactShadows() {
  const groupRef = useRef<THREE.Group>(null);
  const shadowsActive = useGameStore((state) => {
    if (!state.renderDebug.shadows) return false;
    const angle = ((state.timeOfDay - 6) / 24) * Math.PI * 2;
    return Math.sin(angle) > 0.13;
  });

  useFrame(() => {
    if (!groupRef.current) return;
    const pos = getLiveShipTransform().pos;
    groupRef.current.position.set(pos[0], 0.05, pos[2]);
  });

  if (!shadowsActive) return null;

  return (
    <group ref={groupRef}>
      <ContactShadows
        resolution={512}
        frames={1}
        scale={80}
        blur={2.5}
        opacity={0.35}
        far={15}
        color="#2a3a5c"
      />
    </group>
  );
}

function PostProcessing({ bloomEnabled, vignetteEnabled }: { bloomEnabled: boolean; vignetteEnabled: boolean }) {
  const { brightness, contrast, hue, saturation } = useAtmosphere();

  return (
    <EffectComposer>
      <N8AO
        aoRadius={1.4}
        intensity={1.4}
        aoSamples={8}
        denoiseSamples={4}
        denoiseRadius={12}
        distanceFalloff={1.2}
        halfRes
      />
      {bloomEnabled && <Bloom luminanceThreshold={0.65} luminanceSmoothing={0.9} height={300} intensity={0.8} />}
      <BrightnessContrast brightness={brightness} contrast={contrast} />
      <HueSaturation hue={hue} saturation={saturation} />
      {vignetteEnabled && <Vignette eskil={false} offset={0.18} darkness={0.85} />}
    </EffectComposer>
  );
}
