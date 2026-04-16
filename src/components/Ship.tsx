import { useRef, useState, useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGameStore, getRoleBonus, captainHasTrait } from '../store/gameStore';
import * as THREE from 'three';
import { getTerrainHeight, getMeshHalf } from '../utils/terrain';
import { Billboard, Text } from '@react-three/drei';
import { FACTIONS } from '../constants/factions';
import { sfxShoreCollision, sfxShipCollision, sfxCastNet, sfxHaulNet, sfxAnchorWeigh, sfxSailsCatch, sfxRiggingCreak, sfxTreasureFind } from '../audio/SoundEffects';
import { rollFishCatch, rollManualCast } from '../utils/fishTypes';
import { playLootSfx } from '../utils/lootRoll';
import { syncLiveShipTransform } from '../utils/livePlayerTransform';
import { swivelAimAngle, broadsideReload } from '../utils/combatState';
import { spawnSplash } from '../utils/splashState';
import { getWindTrimInfo, getWindTrimMultiplier } from '../utils/wind';

const SHIP_ROOT_Y = -0.3;
const STORE_SYNC_INTERVAL = 1 / 12;

export function Ship() {
  const group = useRef<THREE.Group>(null);
  const visualGroup = useRef<THREE.Group>(null);
  const hullMaterialRef = useRef<THREE.MeshStandardMaterial>(null);
  const torchLightRef = useRef<THREE.PointLight>(null);
  const torchMeshRef = useRef<THREE.MeshStandardMaterial>(null);
  const mainSailRef = useRef<THREE.Mesh>(null);
  const foreSailRef = useRef<THREE.Mesh>(null);
  const setPlayerTransform = useGameStore((state) => state.setPlayerTransform);
  const stats = useGameStore((state) => state.stats);
  const playerMode = useGameStore((state) => state.playerMode);
  const damageShip = useGameStore((state) => state.damageShip);
  const addNotification = useGameStore((state) => state.addNotification);
  const paused = useGameStore((state) => state.paused);
  
  // Physics state
  const velocity = useRef(0);
  const rotation = useRef(0);
  const previousHeading = useRef(0);
  const heel = useRef(0);
  const heelVelocity = useRef(0);
  // Recoil state: slow drift away from land after collision
  const recoilVelX = useRef(0);
  const recoilVelZ = useRef(0);
  const edgePressTime = useRef(0); // seconds spent pressed against map edge
  const windVector = useRef(new THREE.Vector2());
  const shipVelocityVector = useRef(new THREE.Vector2());
  const apparentWindVector = useRef(new THREE.Vector2());
  const shipForwardVector = useRef(new THREE.Vector2());
  const shipRightVector = useRef(new THREE.Vector2());
  
  // Input state
  const keys = useRef({ w: false, a: false, s: false, d: false, shift: false });

  // Visual effects state
  const lastDamageTime = useRef(0);
  const [showExclamation, setShowExclamation] = useState(false);
  const [showSpeedBoost, setShowSpeedBoost] = useState(false);
  const exclamationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Particles
  const particlesRef = useRef<THREE.InstancedMesh>(null);
  const particleData = useRef<{pos: THREE.Vector3, vel: THREE.Vector3, life: number}[]>([]);
  const particleCount = 30;
  const sailTrim = useRef({ main: 0, fore: 0 });
  const visualSailSet = useRef(0.4);
  const windTrimCharge = useRef(0);
  const windTrimWasActive = useRef(false);
  const speedBoostVisible = useRef(false);
  const speedBoostRef = useRef<THREE.Group>(null);
  const storeSyncAccum = useRef(0);

  // Anchor animation state
  const anchorGroupRef = useRef<THREE.Group>(null);
  const anchorChainRef = useRef<THREE.Mesh>(null);
  const anchorState = useRef<'stowed' | 'dropping' | 'down' | 'weighing'>('stowed');
  const anchorClock = useRef(0);
  const prevAnchored = useRef(false);
  const ANCHOR_DROP_DUR = 1.2;
  const ANCHOR_WEIGH_DUR = 1.4;
  // Splash particles for anchor
  const anchorSplashRef = useRef<THREE.InstancedMesh>(null);
  const anchorSplashData = useRef<{pos: THREE.Vector3, vel: THREE.Vector3, life: number}[]>([]);
  const ANCHOR_SPLASH_COUNT = 15;

  // Swivel gun pivot ref + muzzle flash
  const swivelPivotRef = useRef<THREE.Group>(null);
  const muzzleFlashRef = useRef<THREE.InstancedMesh>(null);
  const muzzleParticles = useRef<{ pos: THREE.Vector3; vel: THREE.Vector3; life: number }[]>([]);
  const MUZZLE_PARTICLE_COUNT = 20;

  // Broadside arc indicators
  const portArcRef = useRef<THREE.Mesh>(null);
  const starboardArcRef = useRef<THREE.Mesh>(null);

  // Sailing sound triggers (cooldown-gated one-shots)
  const sailsCaughtRef = useRef(false); // true once we pass 40% speed, resets when below 20%
  const lastCreakTime = useRef(0);

  // Fishing net state — unified auto-catch + manual cast
  const netState = useRef<'idle' | 'casting' | 'hauling'>('idle');
  const netClock = useRef(0);
  const netGroupRef = useRef<THREE.Group>(null);
  const netRopeRef = useRef<THREE.Mesh>(null);
  const netMeshRef = useRef<THREE.Mesh>(null);
  const netCooldown = useRef(0);
  const pendingCatchShoalIdx = useRef<number | null>(null); // which shoal triggered auto-catch
  const pendingManualCast = useRef(false); // true = manual C key cast
  const NET_CAST_DUR = 0.6;
  const NET_HAUL_DUR = 0.8;
  const NET_COOLDOWN = 8; // seconds between any catch

  // Generate flag texture from faction colors
  const shipFlag = useGameStore((state) => state.ship.flag);
  const flagTexture = useMemo(() => {
    const faction = FACTIONS[shipFlag];
    if (!faction) return null;
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 42;
    const ctx = canvas.getContext('2d')!;
    const [c1, c2, c3] = faction.colors;

    switch (faction.flagPattern) {
      case 'cross': {
        ctx.fillStyle = c1;
        ctx.fillRect(0, 0, 64, 42);
        ctx.fillStyle = c2;
        const cw = 6;
        const ox = shipFlag === 'Portuguese' ? 32 : 22;
        ctx.fillRect(0, 21 - cw / 2, 64, cw);
        ctx.fillRect(ox - cw / 2, 0, cw, 42);
        break;
      }
      case 'triband-h': {
        const top = shipFlag === 'Dutch' ? '#FF7F00' : c1;
        ctx.fillStyle = top;  ctx.fillRect(0, 0, 64, 14);
        ctx.fillStyle = c2;   ctx.fillRect(0, 14, 64, 14);
        ctx.fillStyle = c3;   ctx.fillRect(0, 28, 64, 14);
        break;
      }
      case 'bicolor-h': {
        ctx.fillStyle = c1; ctx.fillRect(0, 0, 64, 21);
        ctx.fillStyle = c2; ctx.fillRect(0, 21, 64, 21);
        break;
      }
      case 'bicolor-v': {
        // French: white with gold dots
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, 64, 42);
        ctx.fillStyle = '#C9B037';
        ctx.beginPath(); ctx.arc(32, 14, 3, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(22, 28, 3, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(42, 28, 3, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'quartered': {
        ctx.fillStyle = '#F1BF00';
        ctx.fillRect(0, 0, 64, 42);
        ctx.strokeStyle = '#AA151B';
        ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(5, 5); ctx.lineTo(59, 37); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(59, 5); ctx.lineTo(5, 37); ctx.stroke();
        break;
      }
      case 'crescent': {
        ctx.fillStyle = c1;
        ctx.fillRect(0, 0, 64, 42);
        ctx.fillStyle = c2;
        ctx.beginPath(); ctx.arc(28, 21, 10, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = c1;
        ctx.beginPath(); ctx.arc(32, 21, 8, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = c2;
        ctx.beginPath(); ctx.arc(40, 21, 2.5, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'disc': {
        ctx.fillStyle = c1;
        ctx.fillRect(0, 0, 64, 42);
        ctx.fillStyle = c2;
        ctx.beginPath(); ctx.arc(32, 21, 10, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'diamond': {
        ctx.fillStyle = c1;
        ctx.fillRect(0, 0, 64, 42);
        ctx.fillStyle = c2;
        ctx.beginPath();
        ctx.moveTo(32, 5); ctx.lineTo(50, 21); ctx.lineTo(32, 37); ctx.lineTo(14, 21);
        ctx.closePath(); ctx.fill();
        break;
      }
      case 'stripe-edge': {
        ctx.fillStyle = c1;
        ctx.fillRect(0, 0, 64, 42);
        ctx.fillStyle = c2;
        ctx.fillRect(0, 0, 64, 10);
        ctx.fillStyle = c3;
        ctx.fillRect(0, 32, 64, 10);
        break;
      }
      default: {
        ctx.fillStyle = c1;
        ctx.fillRect(0, 0, 64, 42);
        break;
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    return tex;
  }, [shipFlag]);

  // Mast flag
  const flagMeshRef = useRef<THREE.Mesh>(null);
  const flagPivotRef = useRef<THREE.Group>(null);
  const flagGeometry = useMemo(() => new THREE.PlaneGeometry(1.4, 0.9, 10, 6), []);
  const flagBase = useMemo(
    () => Float32Array.from(flagGeometry.attributes.position.array as Float32Array),
    [flagGeometry]
  );
  const flagWindAngle = useRef(0);

  const mainSailGeometry = useMemo(() => new THREE.PlaneGeometry(3.5, 4, 12, 14), []);
  const foreSailGeometry = useMemo(() => new THREE.PlaneGeometry(2.5, 3, 10, 12), []);
  const mainSailBase = useMemo(
    () => Float32Array.from(mainSailGeometry.attributes.position.array as Float32Array),
    [mainSailGeometry]
  );
  const foreSailBase = useMemo(
    () => Float32Array.from(foreSailGeometry.attributes.position.array as Float32Array),
    [foreSailGeometry]
  );

  // Sync ship position from store on mount; later teleports are handled in-frame.
  const initialized = useRef(false);
  useEffect(() => {
    if (group.current) {
      const state = useGameStore.getState();
      group.current.position.set(state.playerPos[0], SHIP_ROOT_Y, state.playerPos[2]);
      rotation.current = state.playerRot;
      previousHeading.current = state.playerRot;
      velocity.current = state.playerVelocity;
      syncLiveShipTransform(state.playerPos, state.playerRot, state.playerVelocity);
      initialized.current = true;
    }
  }, []);

  useEffect(() => {
    if (playerMode === 'ship' || !group.current) return;
    setPlayerTransform({
      pos: [group.current.position.x, SHIP_ROOT_Y, group.current.position.z],
      rot: rotation.current,
      vel: velocity.current,
    });
    storeSyncAccum.current = 0;
  }, [playerMode, setPlayerTransform]);

  useEffect(() => {
    // Initialize particles
    for (let i = 0; i < particleCount; i++) {
      particleData.current.push({
        pos: new THREE.Vector3(0, -1000, 0), // Hidden initially
        vel: new THREE.Vector3(),
        life: 0
      });
    }
    // Initialize anchor splash particles
    for (let i = 0; i < ANCHOR_SPLASH_COUNT; i++) {
      anchorSplashData.current.push({
        pos: new THREE.Vector3(0, -1000, 0),
        vel: new THREE.Vector3(),
        life: 0,
      });
    }
    // Initialize muzzle flash particles
    for (let i = 0; i < MUZZLE_PARTICLE_COUNT; i++) {
      muzzleParticles.current.push({
        pos: new THREE.Vector3(0, -1000, 0),
        vel: new THREE.Vector3(),
        life: 0,
      });
    }
  }, []);

  useEffect(() => {
    return () => {
      mainSailGeometry.dispose();
      foreSailGeometry.dispose();
      flagGeometry.dispose();
      if (exclamationTimer.current) clearTimeout(exclamationTimer.current);
    };
  }, [mainSailGeometry, foreSailGeometry, flagGeometry]);

  const triggerCollision = (source: 'shore' | 'ship' = 'shore') => {
    const now = Date.now();
    if (now - lastDamageTime.current > 2000) { // 2 second cooldown
      lastDamageTime.current = now;
      damageShip(10);
      addNotification('Hull damaged!', 'error');
      if (source === 'shore') sfxShoreCollision(); else sfxShipCollision();
      setShowExclamation(true);

      // Hide exclamation after 2 seconds
      if (exclamationTimer.current) clearTimeout(exclamationTimer.current);
      exclamationTimer.current = setTimeout(() => setShowExclamation(false), 2000);

      // Spawn particles
      if (group.current) {
        for (let i = 0; i < particleCount; i++) {
          const p = particleData.current[i];
          if (!p) continue;
          p.pos.copy(group.current.position).add(new THREE.Vector3(
            (Math.random() - 0.5) * 2,
            1 + Math.random(),
            (Math.random() - 0.5) * 2
          ));
          p.vel.set(
            (Math.random() - 0.5) * 10,
            5 + Math.random() * 5,
            (Math.random() - 0.5) * 10
          );
          p.life = 1.0; // 1 second life
        }
      }
    }
  };

  useEffect(() => {
    const handleCollisionEvent = (e: Event) => {
      triggerCollision('ship');
      const detail = (e as CustomEvent).detail;
      if (detail?.appearancePhrase) {
        window.dispatchEvent(new CustomEvent('ship-collision-warning', {
          detail: { appearancePhrase: detail.appearancePhrase },
        }));
      }
    };
    window.addEventListener('ship-collision', handleCollisionEvent);
    return () => window.removeEventListener('ship-collision', handleCollisionEvent);
  }, []);

  // Muzzle flash on swivel gun fire
  useEffect(() => {
    const handleFired = () => {
      if (!group.current) return;
      const shipPos = group.current.position;
      const shipRot = rotation.current;
      const aimAngle = swivelAimAngle;
      // Gun mount is at bow (z=3.0 in local space), barrel extends ~1 unit along aim
      const bowX = shipPos.x + Math.sin(shipRot) * 3.0;
      const bowZ = shipPos.z + Math.cos(shipRot) * 3.0;
      const muzzleX = bowX + Math.sin(aimAngle) * 1.2;
      const muzzleZ = bowZ + Math.cos(aimAngle) * 1.2;
      const muzzleY = 1.8;

      for (let i = 0; i < MUZZLE_PARTICLE_COUNT; i++) {
        const p = muzzleParticles.current[i];
        // Mix of smoke (slow, rising) and sparks (fast, directional)
        const isSpark = i < 8;
        const spread = isSpark ? 0.3 : 0.8;
        const speed = isSpark ? (8 + Math.random() * 12) : (1 + Math.random() * 3);
        p.pos.set(
          muzzleX + (Math.random() - 0.5) * 0.3,
          muzzleY + (Math.random() - 0.5) * 0.3,
          muzzleZ + (Math.random() - 0.5) * 0.3
        );
        p.vel.set(
          Math.sin(aimAngle) * speed + (Math.random() - 0.5) * spread * speed,
          (isSpark ? 2 + Math.random() * 3 : 1 + Math.random() * 2),
          Math.cos(aimAngle) * speed + (Math.random() - 0.5) * spread * speed
        );
        p.life = isSpark ? 0.2 + Math.random() * 0.3 : 0.5 + Math.random() * 0.6;
      }
    };
    window.addEventListener('swivel-fired', handleFired);
    return () => window.removeEventListener('swivel-fired', handleFired);
  }, []);

  // Broadside smoke — reuse muzzle particles with side-directed burst
  useEffect(() => {
    const handleBroadside = (e: Event) => {
      if (!group.current) return;
      const side = (e as CustomEvent).detail?.side as 'port' | 'starboard';
      const shipPos = group.current.position;
      const shipRot = rotation.current;
      // Perpendicular direction
      const sideAngle = side === 'port' ? shipRot + Math.PI / 2 : shipRot - Math.PI / 2;
      const sideX = Math.sin(sideAngle);
      const sideZ = Math.cos(sideAngle);

      // Burst particles outward from the firing side
      for (let i = 0; i < MUZZLE_PARTICLE_COUNT; i++) {
        const p = muzzleParticles.current[i];
        // Spread along ship length
        const along = (Math.random() - 0.5) * 6;
        const startX = shipPos.x + Math.sin(shipRot) * along + sideX * 1.2;
        const startZ = shipPos.z + Math.cos(shipRot) * along + sideZ * 1.2;
        p.pos.set(
          startX + (Math.random() - 0.5) * 0.5,
          1.2 + Math.random() * 0.5,
          startZ + (Math.random() - 0.5) * 0.5,
        );
        const speed = 2 + Math.random() * 4;
        p.vel.set(
          sideX * speed + (Math.random() - 0.5) * 2,
          1.5 + Math.random() * 2,
          sideZ * speed + (Math.random() - 0.5) * 2,
        );
        p.life = 0.6 + Math.random() * 0.8;
      }
    };
    window.addEventListener('broadside-fired', handleBroadside);
    return () => window.removeEventListener('broadside-fired', handleBroadside);
  }, []);

  // Reset net state on unmount (world reload / teleport)
  useEffect(() => () => {
    netState.current = 'idle';
    netCooldown.current = 0;
    pendingCatchShoalIdx.current = null;
    pendingManualCast.current = false;
    if (netGroupRef.current) netGroupRef.current.visible = false;
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (key in keys.current) keys.current[key as keyof typeof keys.current] = true;
      // Auto-weigh anchor when pressing movement keys
      if ((key === 'w' || key === 's') && playerMode === 'ship' && !paused && !useGameStore.getState().activePort) {
        const store = useGameStore.getState();
        if (store.anchored) {
          store.setAnchored(false);
          sfxAnchorWeigh();
          store.addNotification('Weighing anchor.', 'info');
        }
      }
      if (key === 'c' && playerMode === 'ship' && !paused && !useGameStore.getState().activePort) {
        if (netState.current === 'idle' && netCooldown.current <= 0) {
          // Manual cast in open water
          pendingManualCast.current = true;
          pendingCatchShoalIdx.current = null;
          netState.current = 'casting';
          netClock.current = 0;
          sfxCastNet();
          addNotification('Casting net...', 'info');
        }
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() in keys.current) keys.current[e.key.toLowerCase() as keyof typeof keys.current] = false;
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [playerMode, paused]);

  useFrame((state, delta) => {
    if (!group.current) return;
    const store = useGameStore.getState();

    // External teleports/world reloads update the store directly; snap the ship to them here.
    const storeDx = store.playerPos[0] - group.current.position.x;
    const storeDz = store.playerPos[2] - group.current.position.z;
    const storeDistSq = storeDx * storeDx + storeDz * storeDz;
    const rotDeltaToStore = Math.atan2(
      Math.sin(store.playerRot - rotation.current),
      Math.cos(store.playerRot - rotation.current)
    );
    if (!initialized.current || storeDistSq > 9 || Math.abs(rotDeltaToStore) > 0.25) {
      group.current.position.set(store.playerPos[0], SHIP_ROOT_Y, store.playerPos[2]);
      rotation.current = store.playerRot;
      previousHeading.current = store.playerRot;
      velocity.current = store.playerVelocity;
      recoilVelX.current = 0;
      recoilVelZ.current = 0;
      initialized.current = true;
    }

    if (playerMode === 'ship' && !paused && !store.activePort) {
      // Acceleration and Inertia
      const navBonus = getRoleBonus(store, 'Navigator', 'perception');
      const seaLegsBonus = captainHasTrait(store, 'Sea Legs') ? 1.05 : 1.0;
      const baseMaxSpeed = stats.speed * navBonus * seaLegsBonus;
      const windTrim = getWindTrimInfo(store.windDirection, rotation.current);
      const wantsWindTrim = keys.current.shift && keys.current.w && velocity.current > 0.5;
      const windTrimActive = wantsWindTrim && windTrim.score > 0;
      const windTrimLerp = 1 - Math.exp(-delta * (windTrimActive ? 2.4 : 4.2));
      windTrimCharge.current = THREE.MathUtils.lerp(
        windTrimCharge.current,
        windTrimActive ? 1 : 0,
        windTrimLerp,
      );
      const windTrimMultiplier = getWindTrimMultiplier(store.windSpeed, windTrim.score, windTrimCharge.current);
      const maxSpeed = baseMaxSpeed * windTrimMultiplier;
      const accel = 5 * delta;
      const drag = 2 * delta;

      if (windTrimActive && windTrimCharge.current > 0.35 && !windTrimWasActive.current) {
        windTrimWasActive.current = true;
        sfxSailsCatch();
      } else if (!windTrimActive || windTrimCharge.current < 0.08) {
        windTrimWasActive.current = false;
      }

      // When anchored, rapidly decelerate to zero and ignore movement input
      if (store.anchored) {
        if (Math.abs(velocity.current) > 0.01) {
          velocity.current *= Math.max(0, 1 - delta * 6);
        } else {
          velocity.current = 0;
        }
      } else if (keys.current.w) {
        const trimAcceleration = windTrimActive ? 1 + windTrim.score * 0.6 : 1;
        velocity.current = Math.min(velocity.current + accel * trimAcceleration, maxSpeed);
      } else if (keys.current.s) {
        velocity.current = Math.max(velocity.current - accel, -baseMaxSpeed / 2);
      } else {
        // Apply drag
        if (velocity.current > 0) velocity.current = Math.max(0, velocity.current - drag);
        if (velocity.current < 0) velocity.current = Math.min(0, velocity.current + drag);
      }

      if (velocity.current > maxSpeed) {
        velocity.current = Math.max(maxSpeed, velocity.current - drag * 2.5);
      }

      const shouldShowSpeedBoost = windTrimActive && windTrimCharge.current > 0.35;
      if (shouldShowSpeedBoost !== speedBoostVisible.current) {
        speedBoostVisible.current = shouldShowSpeedBoost;
        setShowSpeedBoost(shouldShowSpeedBoost);
      }

      // Turning (only turn if moving, or turn slowly if stopped)
      const turnFactor = Math.abs(velocity.current) > 0.1 ? 1 : 0.2;
      const turnSpeed = stats.turnSpeed * delta * turnFactor;
      
      if (keys.current.a) rotation.current += turnSpeed;
      if (keys.current.d) rotation.current -= turnSpeed;

      // Apply movement
      const moveX = Math.sin(rotation.current) * velocity.current * delta;
      const moveZ = Math.cos(rotation.current) * velocity.current * delta;

      // Collision detection with land
      const nextX = group.current.position.x + moveX;
      const nextZ = group.current.position.z + moveZ;
      
      // Check multiple points around the ship to prevent clipping
      const points = [
        [0, 3.5],   // Bow
        [0, -2],    // Stern
        [-1.5, 0],  // Port
        [1.5, 0]    // Starboard
      ];
      
      let hitLand = false;
      let hitNormalX = 0;
      let hitNormalZ = 0;
      for (const [px, pz] of points) {
        const worldX = nextX + Math.sin(rotation.current) * pz + Math.cos(rotation.current) * px;
        const worldZ = nextZ + Math.cos(rotation.current) * pz - Math.sin(rotation.current) * px;
        const terrainHeight = getTerrainHeight(worldX, worldZ);

        // Stop the ship when the seabed rises into the hull's draft.
        if (terrainHeight > -0.8) {
          hitLand = true;
          // Approximate terrain normal from gradient
          const sampleDist = 1.5;
          const hL = getTerrainHeight(worldX - sampleDist, worldZ);
          const hR = getTerrainHeight(worldX + sampleDist, worldZ);
          const hF = getTerrainHeight(worldX, worldZ + sampleDist);
          const hB = getTerrainHeight(worldX, worldZ - sampleDist);
          hitNormalX += (hL - hR);
          hitNormalZ += (hB - hF);
          break;
        }
      }

      // Apply recoil drift from previous collisions (water-like slow push)
      const recoilDamping = Math.exp(-delta * 1.8); // slow decay — feels like water drag
      recoilVelX.current *= recoilDamping;
      recoilVelZ.current *= recoilDamping;
      // Kill tiny residual drift
      if (Math.abs(recoilVelX.current) < 0.01) recoilVelX.current = 0;
      if (Math.abs(recoilVelZ.current) < 0.01) recoilVelZ.current = 0;

      if (!hitLand) {
        group.current.position.x = nextX + recoilVelX.current * delta;
        group.current.position.z = nextZ + recoilVelZ.current * delta;
      } else {
        const impactSpeed = Math.abs(velocity.current);
        if (impactSpeed > 2) {
          triggerCollision();
        }

        // Normalize terrain normal
        const nLen = Math.sqrt(hitNormalX * hitNormalX + hitNormalZ * hitNormalZ);
        if (nLen > 0.001) {
          hitNormalX /= nLen;
          hitNormalZ /= nLen;
        } else {
          hitNormalX = -Math.sin(rotation.current);
          hitNormalZ = -Math.cos(rotation.current);
        }

        // Nudge out of collision so ship doesn't stick
        group.current.position.x += hitNormalX * 0.5;
        group.current.position.z += hitNormalZ * 0.5;

        // Set recoil: a slow drift impulse along the terrain normal.
        // Stronger impacts produce more drift, but capped to feel heavy, not pinball-y.
        const recoilStrength = Math.min(impactSpeed * 0.6, 8);
        recoilVelX.current = hitNormalX * recoilStrength;
        recoilVelZ.current = hitNormalZ * recoilStrength;

        // Kill forward velocity on impact — the ship crunches to a halt, then drifts back
        velocity.current = 0;

        // Gentle rotation nudge toward the deflected angle
        const velX = Math.sin(rotation.current);
        const velZ = Math.cos(rotation.current);
        const dot = velX * hitNormalX + velZ * hitNormalZ;
        const reflectX = velX - 2 * dot * hitNormalX;
        const reflectZ = velZ - 2 * dot * hitNormalZ;
        const reflectedHeading = Math.atan2(reflectX, reflectZ);
        const headingDiff = reflectedHeading - rotation.current;
        const normalizedDiff = Math.atan2(Math.sin(headingDiff), Math.cos(headingDiff));
        rotation.current += normalizedDiff * 0.15; // subtle — ship slowly turns away

        // Heel kick for visual impact
        heelVelocity.current += (Math.sign(normalizedDiff) || 1) * Math.min(impactSpeed * 0.06, 0.4);
      }
      
      // ── Map-edge boundary ──
      // Prevent ship from sailing off the terrain mesh. Nudge it back and
      // prompt the player to open the sea chart for fast travel.
      const meshHalf = getMeshHalf();
      const boundaryDist = meshHalf * 0.96;
      const px = group.current.position.x;
      const pz = group.current.position.z;
      const edgeDist = Math.max(Math.abs(px), Math.abs(pz));

      if (edgeDist > boundaryDist) {
        // Push ship back toward center along the outward axis
        const nx = Math.abs(px) > boundaryDist ? -Math.sign(px) : 0;
        const nz = Math.abs(pz) > boundaryDist ? -Math.sign(pz) : 0;
        const nLen = Math.sqrt(nx * nx + nz * nz) || 1;
        group.current.position.x += (nx / nLen) * 0.6;
        group.current.position.z += (nz / nLen) * 0.6;
        // Clamp to boundary
        group.current.position.x = Math.max(-boundaryDist, Math.min(boundaryDist, group.current.position.x));
        group.current.position.z = Math.max(-boundaryDist, Math.min(boundaryDist, group.current.position.z));

        velocity.current *= 0.85; // bleed speed
        recoilVelX.current = (nx / nLen) * 2;
        recoilVelZ.current = (nz / nLen) * 2;

        edgePressTime.current += delta;
        if (edgePressTime.current > 1.5) {
          // Sustained edge press → open world map for fast travel
          useGameStore.getState().setRequestWorldMap(true);
          edgePressTime.current = 0;
        } else if (edgePressTime.current > 0.1 && edgePressTime.current < 0.2) {
          useGameStore.getState().addNotification(
            'Open waters ahead — consult your sea chart',
            'info'
          );
        }
      } else {
        edgePressTime.current = Math.max(0, edgePressTime.current - delta * 2);
      }

      group.current.rotation.y = rotation.current;
      group.current.position.y = SHIP_ROOT_Y;

      const livePos: [number, number, number] = [
        group.current.position.x,
        SHIP_ROOT_Y,
        group.current.position.z,
      ];
      syncLiveShipTransform(livePos, rotation.current, velocity.current);
      storeSyncAccum.current += delta;
      if (storeSyncAccum.current >= STORE_SYNC_INTERVAL) {
        setPlayerTransform({
          pos: livePos,
          rot: rotation.current,
          vel: velocity.current,
        });
        storeSyncAccum.current = 0;
      }

      // ── Sailing water sounds ──
      const spdRatio = Math.abs(velocity.current) / Math.max(stats.speed, 1);
      const now = state.clock.elapsedTime;

      // Bow wave splash — fires when accelerating past 50%, cooldown 2s
      if (spdRatio > 0.5 && !sailsCaughtRef.current && now - lastCreakTime.current > 2) {
        sailsCaughtRef.current = true;
        sfxSailsCatch();
      } else if (spdRatio < 0.3) {
        sailsCaughtRef.current = false;
      }

      // Turn splash — water churning on turns at speed (cooldown: 1.8s)
      const turnRate = Math.abs((keys.current.a ? 1 : 0) - (keys.current.d ? 1 : 0));
      if (turnRate > 0 && spdRatio > 0.25 && now - lastCreakTime.current > 1.8) {
        lastCreakTime.current = now;
        sfxRiggingCreak();
      }
    } else if (speedBoostVisible.current) {
      speedBoostVisible.current = false;
      setShowSpeedBoost(false);
    }

    let headingDelta = rotation.current - previousHeading.current;
    while (headingDelta > Math.PI) headingDelta -= Math.PI * 2;
    while (headingDelta < -Math.PI) headingDelta += Math.PI * 2;
    const angularVelocity = headingDelta / Math.max(delta, 1 / 120);
    previousHeading.current = rotation.current;

    const speedRatio = Math.min(Math.abs(velocity.current) / Math.max(stats.speed, 1), 1);
    const sailSetTarget = THREE.MathUtils.lerp(0.18, 1, speedRatio);
    const sailSetLerp = 1 - Math.exp(-delta * 8);
    visualSailSet.current = THREE.MathUtils.lerp(visualSailSet.current, sailSetTarget, sailSetLerp);
    const steerIntent = (keys.current.d ? 1 : 0) - (keys.current.a ? 1 : 0); // right turn = positive
    const steerHeel = -steerIntent * (0.08 + speedRatio * 0.1);
    const angularHeel = THREE.MathUtils.clamp(angularVelocity * 0.045, -0.18, 0.18);
    const targetHeel = THREE.MathUtils.clamp(steerHeel + angularHeel, -0.22, 0.22);

    // Spring the hull into turns, then let it settle once the helm straightens.
    const heelStiffness = 18 + speedRatio * 10;
    const heelDamping = 8 + speedRatio * 2;
    heelVelocity.current += (targetHeel - heel.current) * heelStiffness * delta;
    heelVelocity.current *= Math.exp(-heelDamping * delta);
    heel.current += heelVelocity.current * delta;

    // Keep a little wave motion under the turn-driven heel so the ship stays lively.
    if (visualGroup.current) {
      visualGroup.current.position.y = Math.sin(state.clock.elapsedTime * 2) * 0.15;
      visualGroup.current.rotation.z = heel.current + Math.sin(state.clock.elapsedTime * 1.5) * (0.018 + speedRatio * 0.012);
      visualGroup.current.rotation.x = Math.cos(state.clock.elapsedTime * 1.2) * 0.04 - speedRatio * 0.015;
    }

    if (speedBoostRef.current) {
      const pulse = 1 + Math.sin(state.clock.elapsedTime * 9) * 0.08;
      speedBoostRef.current.scale.setScalar(pulse);
      speedBoostRef.current.position.y = 8.9 + Math.sin(state.clock.elapsedTime * 5) * 0.18;
    }

    windVector.current
      .set(Math.sin(store.windDirection), Math.cos(store.windDirection))
      .multiplyScalar(store.windSpeed * 10);
    shipVelocityVector.current
      .set(Math.sin(rotation.current), Math.cos(rotation.current))
      .multiplyScalar(Math.max(velocity.current, 0));
    apparentWindVector.current.copy(windVector.current).sub(shipVelocityVector.current);
    const apparentSpeed = apparentWindVector.current.length();
    shipForwardVector.current.set(Math.sin(rotation.current), Math.cos(rotation.current));
    shipRightVector.current.set(Math.cos(rotation.current), -Math.sin(rotation.current));
    const localWindX = apparentWindVector.current.dot(shipRightVector.current);
    const localWindForward = apparentWindVector.current.dot(shipForwardVector.current);
    const normalizedWindX = apparentSpeed > 0.001 ? localWindX / apparentSpeed : 0;
    const normalizedWindForward = apparentSpeed > 0.001 ? localWindForward / apparentSpeed : 0;
    const tailDrive = Math.max(0, normalizedWindForward);
    const beamDrive = Math.abs(normalizedWindX);
    const headwindPenalty = Math.max(0, -normalizedWindForward);
    const fill = THREE.MathUtils.clamp(beamDrive * 0.75 + tailDrive * 0.95 - headwindPenalty * 1.15, 0, 1);
    const luff = THREE.MathUtils.clamp(headwindPenalty * 1.1 + (1 - fill) * 0.18, 0, 1);
    const trimTarget = THREE.MathUtils.clamp(normalizedWindX * 0.62, -0.62, 0.62) * (0.35 + fill * 0.65);
    const trimLerp = 1 - Math.exp(-delta * 6);
    sailTrim.current.main = THREE.MathUtils.lerp(sailTrim.current.main, trimTarget, trimLerp);
    sailTrim.current.fore = THREE.MathUtils.lerp(sailTrim.current.fore, trimTarget * 1.08, trimLerp);

    const updateSailShape = (
      mesh: THREE.Mesh | null,
      geometry: THREE.PlaneGeometry,
      basePositions: Float32Array,
      width: number,
      height: number,
      baseY: number,
      lowerAmount: number,
      trim: number,
      fullnessScale: number,
      flutterPhase: number
    ) => {
      if (!mesh) return;

      mesh.rotation.y = trim;
      mesh.position.y = baseY - (1 - visualSailSet.current) * lowerAmount;
      mesh.scale.y = 0.72 + visualSailSet.current * 0.28;
      const position = geometry.attributes.position as THREE.BufferAttribute;
      const array = position.array as Float32Array;
      const halfWidth = width * 0.5;
      const halfHeight = height * 0.5;
      const camberDepth =
        (0.12 + fill * 0.5 + speedRatio * 0.08) *
        fullnessScale *
        (0.72 + visualSailSet.current * 0.28);
      const flutterAmount = (0.01 + speedRatio * 0.005) * luff;

      for (let i = 0; i < array.length; i += 3) {
        const baseX = basePositions[i];
        const baseY = basePositions[i + 1];
        const xNorm = baseX / halfWidth;
        const yNorm = (baseY + halfHeight) / height;
        const belly = (1 - xNorm * xNorm) * Math.sin(Math.PI * yNorm);
        const edge = Math.pow(Math.abs(xNorm), 1.6);
        const top = THREE.MathUtils.smoothstep(yNorm, 0.12, 1);
        const ripple =
          Math.sin(state.clock.elapsedTime * (1.8 + speedRatio * 1.2) + yNorm * 3 + flutterPhase) *
          flutterAmount *
          edge *
          top *
          0.45;
        const sag = (0.012 + luff * 0.02) * edge * yNorm;

        array[i] = baseX;
        array[i + 1] = baseY - sag;
        array[i + 2] = belly * camberDepth + ripple;
      }

      position.needsUpdate = true;
      geometry.computeVertexNormals();
      geometry.attributes.normal.needsUpdate = true;
    };

    updateSailShape(mainSailRef.current, mainSailGeometry, mainSailBase, 3.5, 4, 4, 1.55, sailTrim.current.main, 1, 0.3);
    updateSailShape(foreSailRef.current, foreSailGeometry, foreSailBase, 2.5, 3, 3, 1.05, sailTrim.current.fore, 0.82, 1.1);

    // ── Mast flag cloth sim ──
    if (flagMeshRef.current && flagPivotRef.current) {
      // Apparent wind in ship-local space: real wind minus ship motion
      // When moving forward with no wind, apparent wind blows from the bow (negative forward)
      const apparentX = localWindX;
      const apparentZ = localWindForward - velocity.current * 1.2;
      // Flag trails downwind: pivot rotation maps +X to the flag direction,
      // so -π/2 = flag points aft (+Z apparent wind → flag blows -Z)
      const targetAngle = Math.atan2(-apparentZ, apparentX);

      // Angular velocity with drag for natural swing (not snapping)
      const angleDiff = Math.atan2(
        Math.sin(targetAngle - flagWindAngle.current),
        Math.cos(targetAngle - flagWindAngle.current),
      );
      flagWindAngle.current += angleDiff * (1 - Math.exp(-delta * 2.5));
      flagPivotRef.current.rotation.y = flagWindAngle.current;

      const windStr = Math.min(apparentSpeed * 0.15 + Math.abs(velocity.current) * 0.08, 1);
      const t = state.clock.elapsedTime;
      const pos = flagGeometry.attributes.position as THREE.BufferAttribute;
      const arr = pos.array as Float32Array;
      const hw = 0.7; // half width

      for (let i = 0; i < arr.length; i += 3) {
        const bx = flagBase[i];
        const by = flagBase[i + 1];
        // 0 at hoist (mast), 1 at fly (free end)
        const xNorm = (bx + hw) / (hw * 2);
        const xCube = xNorm * xNorm * xNorm;

        // Wave propagates from hoist to fly (negative phase = traveling outward)
        const wave = Math.sin(t * 5 - xNorm * 3.5) * 0.08 * xNorm;
        // Higher-frequency flutter, stronger at the fly end
        const flutter = Math.sin(t * 9 - xNorm * 5 + by * 4) * 0.04 * xCube;
        const droop = (1 - windStr) * xCube * 0.2;

        arr[i] = bx;
        arr[i + 1] = by - droop;
        arr[i + 2] = (wave + flutter) * (0.2 + windStr * 0.8);
      }
      pos.needsUpdate = true;
      flagGeometry.computeVertexNormals();
    }

    // Visual Effects Updates
    const now = Date.now();
    const timeSinceDamage = now - lastDamageTime.current;
    
    // Hull glowing red
    if (hullMaterialRef.current) {
      if (timeSinceDamage < 500) {
        hullMaterialRef.current.emissive.setHex(0xff0000);
        hullMaterialRef.current.emissiveIntensity = 1 - (timeSinceDamage / 500);
      } else {
        hullMaterialRef.current.emissive.setHex(0x000000);
        hullMaterialRef.current.emissiveIntensity = 0;
      }
    }

    // Update Particles
    if (particlesRef.current) {
      const dummy = new THREE.Object3D();
      let needsUpdate = false;
      for (let i = 0; i < particleCount; i++) {
        const p = particleData.current[i];
        if (!p) continue;
        if (p.life > 0) {
          p.life -= delta;
          p.vel.y -= 15 * delta; // Gravity
          p.pos.addScaledVector(p.vel, delta);

          dummy.position.copy(p.pos);
          const scale = Math.max(0, p.life);
          dummy.scale.set(scale, scale, scale);
          dummy.updateMatrix();
          particlesRef.current.setMatrixAt(i, dummy.matrix);
          needsUpdate = true;
        } else if (p.pos.y > -100) {
          // Hide dead particles
          p.pos.set(0, -1000, 0);
          dummy.position.copy(p.pos);
          dummy.updateMatrix();
          particlesRef.current.setMatrixAt(i, dummy.matrix);
          needsUpdate = true;
        }
      }
      if (needsUpdate) {
        particlesRef.current.instanceMatrix.needsUpdate = true;
      }
    }

    // ── Anchor animation ──
    {
      const isAnchored = store.anchored;
      // Detect transitions
      if (isAnchored && !prevAnchored.current) {
        anchorState.current = 'dropping';
        anchorClock.current = 0;
      } else if (!isAnchored && prevAnchored.current) {
        anchorState.current = 'weighing';
        anchorClock.current = 0;
      }
      prevAnchored.current = isAnchored;

      const ac = anchorClock.current;

      if (anchorState.current === 'stowed') {
        // Anchor stowed — hidden
        if (anchorGroupRef.current) anchorGroupRef.current.visible = false;
      } else if (anchorState.current === 'dropping') {
        anchorClock.current += delta;
        const progress = Math.min(ac / ANCHOR_DROP_DUR, 1);
        if (anchorGroupRef.current) {
          anchorGroupRef.current.visible = true;
          // Swing out from bow starboard, then plunge down
          const swingOut = Math.min(progress * 3, 1); // first third: swing out
          const plunge = Math.max(0, (progress - 0.33) / 0.67); // last two-thirds: sink
          const easeSwing = 1 - (1 - swingOut) * (1 - swingOut);
          const easePlunge = plunge * plunge;

          anchorGroupRef.current.position.set(
            1.2 + easeSwing * 0.8,   // swing to starboard
            1.0 - easePlunge * 3.5,  // drop from deck level into water
            2.5                       // bow area
          );
          anchorGroupRef.current.rotation.z = -easeSwing * 0.4 - easePlunge * 0.8;
          anchorGroupRef.current.rotation.x = easePlunge * 0.3;
        }
        // Chain lengthens as anchor drops
        if (anchorChainRef.current) {
          const chainLen = 0.5 + progress * 3.0;
          anchorChainRef.current.scale.y = chainLen;
          anchorChainRef.current.position.y = chainLen * 0.5;
        }
        // Spawn splash particles when anchor hits water (~40% through)
        if (progress > 0.38 && progress < 0.45 && group.current) {
          const shipPos = group.current.position;
          const rot = rotation.current;
          const splashX = shipPos.x + Math.sin(rot) * 2.5 + Math.cos(rot) * 1.8;
          const splashZ = shipPos.z + Math.cos(rot) * 2.5 - Math.sin(rot) * 1.8;
          // Trigger water ripple for anchor splash
          if (progress < 0.40) spawnSplash(splashX, splashZ, 0.6);
          for (let i = 0; i < ANCHOR_SPLASH_COUNT; i++) {
            const p = anchorSplashData.current[i];
            if (p.life <= 0) {
              p.pos.set(
                splashX + (Math.random() - 0.5) * 0.8,
                0.2 + Math.random() * 0.3,
                splashZ + (Math.random() - 0.5) * 0.8
              );
              p.vel.set(
                (Math.random() - 0.5) * 4,
                3 + Math.random() * 4,
                (Math.random() - 0.5) * 4
              );
              p.life = 0.6 + Math.random() * 0.4;
            }
          }
        }
        if (progress >= 1) {
          anchorState.current = 'down';
        }
      } else if (anchorState.current === 'down') {
        // Anchor hanging below waterline, chain taut, gentle sway
        if (anchorGroupRef.current) {
          anchorGroupRef.current.visible = true;
          anchorGroupRef.current.position.set(2.0, -2.5, 2.5);
          anchorGroupRef.current.rotation.z = -1.2 + Math.sin(state.clock.elapsedTime * 1.2) * 0.04;
          anchorGroupRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.8) * 0.03;
        }
        if (anchorChainRef.current) {
          anchorChainRef.current.scale.y = 3.5;
          anchorChainRef.current.position.y = 1.75;
        }
      } else if (anchorState.current === 'weighing') {
        anchorClock.current += delta;
        const progress = Math.min(ac / ANCHOR_WEIGH_DUR, 1);
        if (anchorGroupRef.current) {
          anchorGroupRef.current.visible = true;
          const eased = 1 - (1 - progress) * (1 - progress); // ease-out
          // Rise from underwater back up to deck
          anchorGroupRef.current.position.set(
            2.0 - eased * 0.8,
            -2.5 + eased * 3.5,
            2.5
          );
          anchorGroupRef.current.rotation.z = -1.2 + eased * 1.2;
          anchorGroupRef.current.rotation.x = 0.3 - eased * 0.3;
        }
        // Chain shortens
        if (anchorChainRef.current) {
          const chainLen = 3.5 - progress * 3.0;
          anchorChainRef.current.scale.y = Math.max(0.5, chainLen);
          anchorChainRef.current.position.y = Math.max(0.5, chainLen) * 0.5;
        }
        // Dripping water particles when anchor breaks surface
        if (progress > 0.55 && progress < 0.65 && group.current) {
          const shipPos = group.current.position;
          const rot = rotation.current;
          const dripX = shipPos.x + Math.sin(rot) * 2.5 + Math.cos(rot) * 1.5;
          const dripZ = shipPos.z + Math.cos(rot) * 2.5 - Math.sin(rot) * 1.5;
          for (let i = 0; i < ANCHOR_SPLASH_COUNT; i++) {
            const p = anchorSplashData.current[i];
            if (p.life <= 0) {
              p.pos.set(
                dripX + (Math.random() - 0.5) * 0.5,
                0.5 + Math.random() * 1.0,
                dripZ + (Math.random() - 0.5) * 0.5
              );
              p.vel.set(
                (Math.random() - 0.5) * 1.5,
                -1 - Math.random() * 2,  // drip downward
                (Math.random() - 0.5) * 1.5
              );
              p.life = 0.4 + Math.random() * 0.3;
            }
          }
        }
        if (progress >= 1) {
          anchorState.current = 'stowed';
          if (anchorGroupRef.current) anchorGroupRef.current.visible = false;
        }
      }
    }

    // ── Anchor splash particles ──
    if (anchorSplashRef.current) {
      const dummy = new THREE.Object3D();
      let needsUpdate = false;
      for (let i = 0; i < ANCHOR_SPLASH_COUNT; i++) {
        const p = anchorSplashData.current[i];
        if (!p) continue;
        if (p.life > 0) {
          p.life -= delta;
          p.vel.y -= 12 * delta;
          p.pos.addScaledVector(p.vel, delta);
          dummy.position.copy(p.pos);
          const s = Math.max(0, p.life) * 0.8;
          dummy.scale.set(s, s, s);
          dummy.updateMatrix();
          anchorSplashRef.current.setMatrixAt(i, dummy.matrix);
          needsUpdate = true;
        } else if (p.pos.y > -100) {
          p.pos.set(0, -1000, 0);
          dummy.position.copy(p.pos);
          dummy.updateMatrix();
          anchorSplashRef.current.setMatrixAt(i, dummy.matrix);
          needsUpdate = true;
        }
      }
      if (needsUpdate) {
        anchorSplashRef.current.instanceMatrix.needsUpdate = true;
      }
    }

    // ── Muzzle flash particles ──
    if (muzzleFlashRef.current) {
      const dummy = new THREE.Object3D();
      let needsUpdate = false;
      for (let i = 0; i < MUZZLE_PARTICLE_COUNT; i++) {
        const p = muzzleParticles.current[i];
        if (!p) continue;
        if (p.life > 0) {
          p.life -= delta;
          p.vel.y -= 6 * delta; // light gravity — smoke drifts
          p.pos.addScaledVector(p.vel, delta);
          dummy.position.copy(p.pos);
          // Sparks (first 8) shrink fast; smoke (rest) expand then fade
          const isSpark = i < 8;
          const s = isSpark
            ? Math.max(0, p.life * 2) * 0.15
            : (0.2 + (1 - p.life) * 0.4) * Math.max(0, p.life);
          dummy.scale.set(s, s, s);
          dummy.updateMatrix();
          muzzleFlashRef.current.setMatrixAt(i, dummy.matrix);
          needsUpdate = true;
        } else if (p.pos.y > -100) {
          p.pos.set(0, -1000, 0);
          dummy.position.copy(p.pos);
          dummy.updateMatrix();
          muzzleFlashRef.current.setMatrixAt(i, dummy.matrix);
          needsUpdate = true;
        }
      }
      if (needsUpdate) {
        muzzleFlashRef.current.instanceMatrix.needsUpdate = true;
      }
    }

    // ── Fishing: auto-catch proximity check ──
    if (netCooldown.current > 0) netCooldown.current -= delta;

    if (netState.current === 'idle' && netCooldown.current <= 0 && !store.anchored && Math.abs(velocity.current) > 0.5) {
      const shipX = group.current.position.x;
      const shipZ = group.current.position.z;
      const shoals = store.fishShoals;
      const CATCH_RADIUS_SQ = 64; // 8 units
      for (let si = 0; si < shoals.length; si++) {
        const s = shoals[si];
        if (s.scattered || s.count <= 0) continue;
        const dx = s.center[0] - shipX;
        const dz = s.center[2] - shipZ;
        if (dx * dx + dz * dz < CATCH_RADIUS_SQ) {
          // Auto-catch! Start the net animation
          pendingCatchShoalIdx.current = si;
          pendingManualCast.current = false;
          netState.current = 'casting';
          netClock.current = 0;
          sfxCastNet();
          break;
        }
      }
    }

    // ── Fishing net animation (shared by auto-catch and manual cast) ──
    if (netState.current !== 'idle') {
      netClock.current += delta;
      const nc = netClock.current;

      if (netState.current === 'casting') {
        const progress = Math.min(nc / NET_CAST_DUR, 1);
        const eased = 1 - (1 - progress) * (1 - progress);
        if (netGroupRef.current) {
          netGroupRef.current.visible = true;
          // Start at gunwale (x~1.1), arc out ~2.5 units to starboard
          netGroupRef.current.position.set(
            1.1 + eased * 2.5,        // gunwale → ~3.6 out
            1.2 - eased * 1.5,        // deck height → near waterline
            0
          );
          netGroupRef.current.rotation.z = -eased * Math.PI * 0.35;
        }
        if (netRopeRef.current) netRopeRef.current.scale.x = 0.5 + eased * 0.5;
        if (netMeshRef.current) netMeshRef.current.scale.set(eased, eased, eased);
        if (progress >= 1) {
          // Skip settling — go straight to hauling
          netState.current = 'hauling';
          netClock.current = 0;
          sfxHaulNet();
        }
      } else if (netState.current === 'hauling') {
        const progress = Math.min(nc / NET_HAUL_DUR, 1);
        const eased = progress * progress;
        if (netGroupRef.current) {
          // Pull back from ~3.6 to gunwale
          netGroupRef.current.position.set(
            3.6 - eased * 2.5,        // back to ~1.1
            -0.3 + eased * 1.5,       // waterline → deck
            0
          );
          netGroupRef.current.rotation.z = -Math.PI * 0.35 + eased * Math.PI * 0.35;
        }
        if (netMeshRef.current) {
          netMeshRef.current.scale.set(1 - eased * 0.5, 1 - eased * 0.5, 1 - eased * 0.5);
        }
        if (progress >= 1) {
          // ── Catch resolution ──
          netState.current = 'idle';
          netClock.current = 0;
          netCooldown.current = NET_COOLDOWN;
          if (netGroupRef.current) netGroupRef.current.visible = false;

          const st = useGameStore.getState();

          if (pendingManualCast.current) {
            // Manual cast — junk/treasure table
            pendingManualCast.current = false;
            const result = rollManualCast();
            useGameStore.setState({
              provisions: st.provisions + result.provisions,
              gold: st.gold + result.gold,
              ...(result.cargo ? {
                cargo: { ...st.cargo, [result.cargo.type]: st.cargo[result.cargo.type] + result.cargo.amount }
              } : {}),
            });
            st.addNotification(result.message, result.toastType, {
              size: result.toastSize,
              subtitle: result.toastSubtitle,
            });
            // Tiered audio: ambergris = legendary fanfare, gold/cargo = treasure clink, modest = normal ping, junk = silence
            if (result.toastType === 'legendary') {
              playLootSfx('legendary');
            } else if (result.gold > 0 || result.cargo) {
              sfxTreasureFind();
            } else if (result.provisions > 0) {
              playLootSfx('normal');
            }
          } else if (pendingCatchShoalIdx.current !== null) {
            // Auto-catch — fish from a shoal
            const shoalIdx = pendingCatchShoalIdx.current;
            pendingCatchShoalIdx.current = null;
            const shoal = st.fishShoals?.[shoalIdx];
            if (shoal && !shoal.scattered && shoal.count > 0) {
              const result = rollFishCatch(shoal.fishType, shoal.count);
              useGameStore.setState({
                provisions: st.provisions + result.provisions,
                ...(result.cargo ? {
                  cargo: { ...st.cargo, [result.cargo.type]: st.cargo[result.cargo.type] + result.cargo.amount }
                } : {}),
              });
              st.addNotification(result.message, result.toastType, {
                size: result.toastSize,
                subtitle: result.toastSubtitle,
              });
              // Scatter the shoal
              useGameStore.getState().scatterShoal(shoalIdx);
              // Play sound based on catch quality
              if (result.quality === 'legendary') playLootSfx('legendary');
              else if (result.quality === 'fine') playLootSfx('rare');
              else playLootSfx('normal');
            }
          }
        }
      }
    }

    // ── Swivel gun aim ──
    if (swivelPivotRef.current && store.combatMode) {
      // swivelAimAngle is in world space; subtract ship heading to get local rotation
      const localAim = swivelAimAngle - rotation.current;
      swivelPivotRef.current.rotation.y = localAim;
      swivelPivotRef.current.visible = true;
    } else if (swivelPivotRef.current) {
      swivelPivotRef.current.visible = false;
    }

    // ── Broadside arc indicators ──
    const hasBroadside = store.stats.armament.some(w => w !== 'swivelGun');
    const nowMs = Date.now();
    if (portArcRef.current) {
      portArcRef.current.visible = store.combatMode && hasBroadside;
      if (portArcRef.current.visible) {
        const portReady = nowMs >= broadsideReload.port;
        (portArcRef.current.material as THREE.MeshBasicMaterial).opacity = portReady ? 0.18 : 0.06;
      }
    }
    if (starboardArcRef.current) {
      starboardArcRef.current.visible = store.combatMode && hasBroadside;
      if (starboardArcRef.current.visible) {
        const starReady = nowMs >= broadsideReload.starboard;
        (starboardArcRef.current.material as THREE.MeshBasicMaterial).opacity = starReady ? 0.18 : 0.06;
      }
    }

    // Update torch intensity based on time of day
    const tod = useGameStore.getState().timeOfDay;
    const thetaTorch = ((tod - 6) / 24) * Math.PI * 2;
    const sunHTorch = Math.sin(thetaTorch);
    const torchIntensity = sunHTorch < 0.15 ? Math.min(1, (0.15 - sunHTorch) * 3) : 0;
    if (torchLightRef.current) {
      torchLightRef.current.intensity = torchIntensity * 3;
      torchLightRef.current.visible = torchIntensity > 0.01;
    }
    if (torchMeshRef.current) {
      torchMeshRef.current.emissiveIntensity = torchIntensity * 3;
      torchMeshRef.current.visible = torchIntensity > 0.01;
    }
  }, -2);

  const viewMode = useGameStore((state) => state.viewMode);

  return (
    <>
      <group ref={group} visible={viewMode !== 'firstperson'}>
        <group ref={visualGroup}>
          {/* Exclamation Point */}
          {showExclamation && (
            <Text
              position={[0, 8, 0]}
              fontSize={3}
              color="red"
              outlineWidth={0.2}
              outlineColor="white"
              fontWeight="bold"
            >
              !
            </Text>
          )}

          {showSpeedBoost && (
            <Billboard ref={speedBoostRef} position={[0, 8.9, 0]}>
              <Text
                fontSize={0.72}
                color="#86efac"
                outlineWidth={0.08}
                outlineColor="#052e16"
                fontWeight="bold"
                anchorX="center"
                anchorY="middle"
              >
                SPEED BOOST!
              </Text>
            </Billboard>
          )}

          {/* Hull */}
          <mesh position={[0, 0.5, 0]} castShadow receiveShadow>
            <boxGeometry args={[2.2, 1.2, 5]} />
            <meshStandardMaterial ref={hullMaterialRef} color="#5C4033" roughness={0.9} />
          </mesh>
          {/* Deck */}
          <mesh position={[0, 1.11, 0]} castShadow receiveShadow>
            <boxGeometry args={[2.0, 0.1, 4.8]} />
            <meshStandardMaterial color="#8B4513" roughness={0.8} />
          </mesh>
          {/* Bow */}
          <mesh position={[0, 0.5, 3.2]} rotation={[0, Math.PI / 4, 0]} castShadow receiveShadow>
            <boxGeometry args={[1.55, 1.2, 1.55]} />
            <meshStandardMaterial color="#5C4033" roughness={0.9} />
          </mesh>
          {/* Bow Deck */}
          <mesh position={[0, 1.11, 3.2]} rotation={[0, Math.PI / 4, 0]} castShadow receiveShadow>
            <boxGeometry args={[1.4, 0.1, 1.4]} />
            <meshStandardMaterial color="#8B4513" roughness={0.8} />
          </mesh>
          {/* Stern cabin */}
          <mesh position={[0, 1.6, -1.5]} castShadow receiveShadow>
            <boxGeometry args={[2, 1, 1.5]} />
            <meshStandardMaterial color="#6B4423" roughness={0.9} />
          </mesh>
          {/* Main Mast */}
          <mesh position={[0, 3.5, 0.5]} castShadow>
            <cylinderGeometry args={[0.15, 0.15, 6]} />
            <meshStandardMaterial color="#3e2723" />
          </mesh>
          {/* Mast Flag — pivot group at the hoist (mast attachment point) */}
          {flagTexture && (
            <group ref={flagPivotRef} position={[0, 6.6, 0.5]}>
              <mesh ref={flagMeshRef} geometry={flagGeometry} position={[0.7, 0, 0]}>
                <meshStandardMaterial
                  map={flagTexture}
                  side={THREE.DoubleSide}
                  roughness={0.9}
                />
              </mesh>
            </group>
          )}
          {/* Main Sail */}
          <mesh ref={mainSailRef} geometry={mainSailGeometry} position={[0, 4, 0.6]} castShadow>
            <meshStandardMaterial color="#f5f1dc" roughness={0.95} side={THREE.DoubleSide} />
          </mesh>
          {/* Foremast */}
          <mesh position={[0, 2.5, 2.5]} castShadow>
            <cylinderGeometry args={[0.1, 0.1, 4]} />
            <meshStandardMaterial color="#3e2723" />
          </mesh>
          {/* Fore Sail */}
          <mesh ref={foreSailRef} geometry={foreSailGeometry} position={[0, 3, 2.6]} castShadow>
            <meshStandardMaterial color="#ece4cf" roughness={0.95} side={THREE.DoubleSide} />
          </mesh>
          {/* Swivel gun — bow-mounted, rotates toward cursor in combat mode */}
          <group ref={swivelPivotRef} position={[0, 1.5, 3.0]} visible={false}>
            {/* Mounting post */}
            <mesh position={[0, -0.15, 0]}>
              <cylinderGeometry args={[0.08, 0.1, 0.3, 6]} />
              <meshStandardMaterial color="#555" roughness={0.5} metalness={0.7} />
            </mesh>
            {/* Barrel */}
            <mesh position={[0, 0, 0.5]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.06, 0.08, 1.0, 8]} />
              <meshStandardMaterial color="#333" roughness={0.4} metalness={0.8} />
            </mesh>
            {/* Muzzle flare ring */}
            <mesh position={[0, 0, 1.0]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.09, 0.025, 6, 8]} />
              <meshStandardMaterial color="#444" roughness={0.4} metalness={0.8} />
            </mesh>
          </group>
          {/* Broadside firing arcs — translucent wedges on port & starboard */}
          {/* Port (left) arc — red tint */}
          <mesh ref={portArcRef} position={[0, 0.1, 0]} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
            <circleGeometry args={[12, 16, Math.PI * 0.7, Math.PI * 0.6]} />
            <meshBasicMaterial color="#ff4444" transparent opacity={0.18} side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
          {/* Starboard (right) arc — blue tint */}
          <mesh ref={starboardArcRef} position={[0, 0.1, 0]} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
            <circleGeometry args={[12, 16, -Math.PI * 0.3, Math.PI * 0.6]} />
            <meshBasicMaterial color="#4488ff" transparent opacity={0.18} side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
          {/* Night torch on stern cabin */}
          <group position={[0.6, 2.8, -1.5]}>
            <pointLight
              ref={torchLightRef}
              color="#ff8833"
              intensity={0}
              distance={20}
              decay={2}
            />
            <mesh>
              <sphereGeometry args={[0.1, 6, 6]} />
              <meshStandardMaterial
                ref={torchMeshRef}
                color="#ff6600"
                emissive="#ff8822"
                emissiveIntensity={0}
                toneMapped={false}
              />
            </mesh>
            <mesh position={[0, -0.4, 0]}>
              <cylinderGeometry args={[0.03, 0.03, 0.7]} />
              <meshStandardMaterial color="#3e2723" />
            </mesh>
          </group>
          {/* Fishing Net */}
          <group ref={netGroupRef} visible={false} position={[1.1, 1.2, 0]}>
            {/* Rope line — connects net back toward gunwale */}
            <mesh ref={netRopeRef} position={[-0.8, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.03, 0.03, 1.6, 4]} />
              <meshStandardMaterial color="#8B7355" roughness={1} />
            </mesh>
            {/* Net mesh — simple circle of crossing lines */}
            <group ref={netMeshRef}>
              {/* Net body — flat torus to suggest the circular net shape */}
              <mesh rotation={[Math.PI / 2, 0, 0]}>
                <torusGeometry args={[0.8, 0.03, 4, 12]} />
                <meshStandardMaterial color="#8B7355" roughness={1} />
              </mesh>
              {/* Cross lines */}
              <mesh rotation={[Math.PI / 2, 0, 0]}>
                <torusGeometry args={[0.4, 0.02, 4, 12]} />
                <meshStandardMaterial color="#8B7355" roughness={1} />
              </mesh>
              {/* Weights — small dark spheres at the rim */}
              {[0, 1, 2, 3, 4, 5].map(i => {
                const angle = (i / 6) * Math.PI * 2;
                return (
                  <mesh key={i} position={[Math.cos(angle) * 0.8, 0, Math.sin(angle) * 0.8]}>
                    <sphereGeometry args={[0.06, 4, 4]} />
                    <meshStandardMaterial color="#444" roughness={1} />
                  </mesh>
                );
              })}
            </group>
          </group>
          {/* 3D Anchor — stowed at bow, animates on drop/weigh */}
          <group ref={anchorGroupRef} visible={false} position={[1.2, 1.0, 2.5]}>
            {/* Chain — cylinder that scales dynamically */}
            <mesh ref={anchorChainRef} position={[0, 0.25, 0]}>
              <cylinderGeometry args={[0.04, 0.04, 1, 6]} />
              <meshStandardMaterial color="#555" roughness={0.6} metalness={0.7} />
            </mesh>
            {/* Anchor body — shank (vertical bar) */}
            <mesh position={[0, -0.3, 0]}>
              <boxGeometry args={[0.1, 0.7, 0.1]} />
              <meshStandardMaterial color="#333" roughness={0.5} metalness={0.8} />
            </mesh>
            {/* Ring at top */}
            <mesh position={[0, 0.05, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.1, 0.03, 6, 8]} />
              <meshStandardMaterial color="#444" roughness={0.5} metalness={0.8} />
            </mesh>
            {/* Crown — horizontal bar at bottom */}
            <mesh position={[0, -0.65, 0]}>
              <boxGeometry args={[0.6, 0.08, 0.08]} />
              <meshStandardMaterial color="#333" roughness={0.5} metalness={0.8} />
            </mesh>
            {/* Left fluke */}
            <mesh position={[-0.28, -0.55, 0]} rotation={[0, 0, Math.PI / 6]}>
              <coneGeometry args={[0.12, 0.3, 4]} />
              <meshStandardMaterial color="#333" roughness={0.5} metalness={0.8} />
            </mesh>
            {/* Right fluke */}
            <mesh position={[0.28, -0.55, 0]} rotation={[0, 0, -Math.PI / 6]}>
              <coneGeometry args={[0.12, 0.3, 4]} />
              <meshStandardMaterial color="#333" roughness={0.5} metalness={0.8} />
            </mesh>
          </group>
        </group>
      </group>

      {/* Damage Particles */}
      <instancedMesh ref={particlesRef} args={[undefined, undefined, particleCount]}>
        <boxGeometry args={[0.3, 0.3, 0.3]} />
        <meshStandardMaterial color="#8B4513" roughness={1} />
      </instancedMesh>

      {/* Anchor Splash Particles */}
      <instancedMesh ref={anchorSplashRef} args={[undefined, undefined, ANCHOR_SPLASH_COUNT]}>
        <sphereGeometry args={[0.15, 6, 6]} />
        <meshStandardMaterial color="#88ccdd" roughness={0.3} transparent opacity={0.7} />
      </instancedMesh>

      {/* Muzzle Flash — sparks + smoke from swivel gun */}
      <instancedMesh ref={muzzleFlashRef} args={[undefined, undefined, MUZZLE_PARTICLE_COUNT]} frustumCulled={false}>
        <sphereGeometry args={[0.25, 5, 5]} />
        <meshStandardMaterial
          color="#ccaa77"
          emissive="#ff8833"
          emissiveIntensity={3}
          transparent
          opacity={0.9}
          toneMapped={false}
        />
      </instancedMesh>
    </>
  );
}
