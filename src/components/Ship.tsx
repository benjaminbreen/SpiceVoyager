import { useRef, useState, useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGameStore } from '../store/gameStore';
import * as THREE from 'three';
import { getTerrainHeight } from '../utils/terrain';
import { Text } from '@react-three/drei';
import { FACTIONS } from '../constants/factions';

const SHIP_ROOT_Y = -0.3;

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
  const windVector = useRef(new THREE.Vector2());
  const shipVelocityVector = useRef(new THREE.Vector2());
  const apparentWindVector = useRef(new THREE.Vector2());
  const shipForwardVector = useRef(new THREE.Vector2());
  const shipRightVector = useRef(new THREE.Vector2());
  
  // Input state
  const keys = useRef({ w: false, a: false, s: false, d: false });

  // Visual effects state
  const lastDamageTime = useRef(0);
  const [showExclamation, setShowExclamation] = useState(false);
  
  // Particles
  const particlesRef = useRef<THREE.InstancedMesh>(null);
  const particleData = useRef<{pos: THREE.Vector3, vel: THREE.Vector3, life: number}[]>([]);
  const particleCount = 30;
  const sailTrim = useRef({ main: 0, fore: 0 });
  const visualSailSet = useRef(0.4);

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

  // Sync ship position from store on mount (safe spawn set by World.tsx)
  const initialized = useRef(false);
  useEffect(() => {
    // Subscribe to store — once playerPos moves away from origin, sync and unsub
    const unsub = useGameStore.subscribe((state) => {
      if (initialized.current) return;
      const pos = state.playerPos;
      // Wait until spawn position is set (non-origin)
      if (pos[0] !== 0 || pos[2] !== 0) {
        if (group.current) {
          group.current.position.set(pos[0], SHIP_ROOT_Y, pos[2]);
          rotation.current = state.playerRot;
          previousHeading.current = state.playerRot;
          initialized.current = true;
        }
        unsub();
      }
    });
    // Also check immediately in case it's already set
    const pos = useGameStore.getState().playerPos;
    if ((pos[0] !== 0 || pos[2] !== 0) && group.current) {
      group.current.position.set(pos[0], SHIP_ROOT_Y, pos[2]);
      rotation.current = useGameStore.getState().playerRot;
      previousHeading.current = rotation.current;
      initialized.current = true;
      unsub();
    }
    return unsub;
  }, []);

  useEffect(() => {
    // Initialize particles
    for (let i = 0; i < particleCount; i++) {
      particleData.current.push({
        pos: new THREE.Vector3(0, -1000, 0), // Hidden initially
        vel: new THREE.Vector3(),
        life: 0
      });
    }
  }, []);

  useEffect(() => {
    return () => {
      mainSailGeometry.dispose();
      foreSailGeometry.dispose();
      flagGeometry.dispose();
    };
  }, [mainSailGeometry, foreSailGeometry, flagGeometry]);

  const triggerCollision = () => {
    const now = Date.now();
    if (now - lastDamageTime.current > 2000) { // 2 second cooldown
      lastDamageTime.current = now;
      damageShip(10);
      addNotification('Hull damaged!', 'error');
      setShowExclamation(true);
      
      // Hide exclamation after 2 seconds
      setTimeout(() => setShowExclamation(false), 2000);

      // Spawn particles
      if (group.current) {
        for (let i = 0; i < particleCount; i++) {
          const p = particleData.current[i];
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
    const handleCollisionEvent = () => triggerCollision();
    window.addEventListener('ship-collision', handleCollisionEvent);
    return () => window.removeEventListener('ship-collision', handleCollisionEvent);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() in keys.current) keys.current[e.key.toLowerCase() as keyof typeof keys.current] = true;
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
  }, []);

  useFrame((state, delta) => {
    if (!group.current) return;
    // Don't run physics until spawn position has been synced
    if (!initialized.current) return;

    if (playerMode === 'ship' && !paused) {
      // Acceleration and Inertia
      const maxSpeed = stats.speed;
      const accel = 5 * delta;
      const drag = 2 * delta;
      
      if (keys.current.w) {
        velocity.current = Math.min(velocity.current + accel, maxSpeed);
      } else if (keys.current.s) {
        velocity.current = Math.max(velocity.current - accel, -maxSpeed / 2);
      } else {
        // Apply drag
        if (velocity.current > 0) velocity.current = Math.max(0, velocity.current - drag);
        if (velocity.current < 0) velocity.current = Math.min(0, velocity.current + drag);
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
      
      group.current.rotation.y = rotation.current;
      group.current.position.y = SHIP_ROOT_Y;

      setPlayerTransform({
        pos: [group.current.position.x, SHIP_ROOT_Y, group.current.position.z],
        rot: rotation.current,
        vel: velocity.current,
      });
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

    const store = useGameStore.getState();
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
      // Wind direction in ship-local space determines which way the flag blows
      // Also factor in ship movement (flag blows backward when moving forward)
      const combinedWindX = localWindX - velocity.current * 0.3;
      const combinedWindZ = localWindForward - velocity.current * 0.8;
      const targetAngle = Math.atan2(combinedWindX, -Math.abs(combinedWindZ));
      flagWindAngle.current = THREE.MathUtils.lerp(flagWindAngle.current, targetAngle, 1 - Math.exp(-delta * 4));
      // Rotate the pivot group so the flag swings from the hoist edge (mast attachment)
      flagPivotRef.current.rotation.y = flagWindAngle.current;

      const windStr = Math.min(apparentSpeed * 0.15 + Math.abs(velocity.current) * 0.08, 1);
      const pos = flagGeometry.attributes.position as THREE.BufferAttribute;
      const arr = pos.array as Float32Array;
      const hw = 0.7; // half width
      const hh = 0.45; // half height

      for (let i = 0; i < arr.length; i += 3) {
        const bx = flagBase[i];
        const by = flagBase[i + 1];
        // Distance from the hoist (left edge) drives the wave amplitude
        const xNorm = (bx + hw) / (hw * 2); // 0 at hoist, 1 at fly
        const wave = Math.sin(state.clock.elapsedTime * 5 + xNorm * 4) * 0.06 * xNorm;
        const flutter = Math.sin(state.clock.elapsedTime * 8.5 + xNorm * 6 + by * 3) * 0.03 * xNorm * xNorm;
        const droop = (1 - windStr) * xNorm * xNorm * 0.15;

        arr[i] = bx;
        arr[i + 1] = by - droop;
        arr[i + 2] = (wave + flutter) * (0.3 + windStr * 0.7);
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
        </group>
      </group>

      {/* Damage Particles */}
      <instancedMesh ref={particlesRef} args={[undefined, undefined, particleCount]}>
        <boxGeometry args={[0.3, 0.3, 0.3]} />
        <meshStandardMaterial color="#8B4513" roughness={1} />
      </instancedMesh>
    </>
  );
}
