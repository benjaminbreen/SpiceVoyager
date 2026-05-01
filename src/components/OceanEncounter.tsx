import { useRef, useMemo, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { useGameStore } from '../store/gameStore';
import { generateEncounterLoot, type OceanEncounterDef } from '../utils/oceanEncounters';
import { SEA_LEVEL } from '../constants/world';
import { getLiveShipTransform } from '../utils/livePlayerTransform';

// ── Whale model ──────────────────────────────────────────────────────────────
function WhaleGeometry() {
  return useMemo(() => {
    // Body — elongated ellipsoid
    const body = new THREE.SphereGeometry(1, 10, 8);
    body.scale(2.5, 0.8, 1.0);
    // Head bump
    const head = new THREE.SphereGeometry(0.6, 8, 6);
    head.translate(-2.2, 0.1, 0);
    // Tail stock — tapered
    const tail = new THREE.CylinderGeometry(0.15, 0.5, 1.5, 6);
    tail.rotateZ(Math.PI / 2);
    tail.translate(2.8, 0.1, 0);
    // Flukes — two flat triangles
    const flukeL = new THREE.PlaneGeometry(1.2, 0.5);
    flukeL.rotateY(Math.PI / 2);
    flukeL.rotateX(0.3);
    flukeL.translate(3.5, 0.1, 0.4);
    const flukeR = new THREE.PlaneGeometry(1.2, 0.5);
    flukeR.rotateY(Math.PI / 2);
    flukeR.rotateX(-0.3);
    flukeR.translate(3.5, 0.1, -0.4);
    // Dorsal fin
    const dorsal = new THREE.ConeGeometry(0.2, 0.5, 4);
    dorsal.translate(0.5, 0.9, 0);
    const merged = mergeGeometries([body, head, tail, flukeL, flukeR, dorsal]);
    [body, head, tail, flukeL, flukeR, dorsal].forEach(g => g.dispose());
    return merged ?? new THREE.SphereGeometry(1);
  }, []);
}

// ── Sea turtle model ─────────────────────────────────────────────────────────
function TurtleGeometry() {
  return useMemo(() => {
    // Shell — flattened sphere
    const shell = new THREE.SphereGeometry(0.8, 8, 6);
    shell.scale(1.2, 0.4, 1.0);
    // Head — small sphere
    const head = new THREE.SphereGeometry(0.2, 6, 4);
    head.translate(-0.9, 0.05, 0);
    // Flippers
    const fl = new THREE.PlaneGeometry(0.7, 0.25);
    fl.rotateX(-0.2);
    fl.translate(-0.3, -0.1, 0.65);
    const fr = new THREE.PlaneGeometry(0.7, 0.25);
    fr.rotateX(0.2);
    fr.translate(-0.3, -0.1, -0.65);
    const bl = new THREE.PlaneGeometry(0.4, 0.18);
    bl.translate(0.6, -0.05, 0.45);
    const br = new THREE.PlaneGeometry(0.4, 0.18);
    br.translate(0.6, -0.05, -0.45);
    const merged = mergeGeometries([shell, head, fl, fr, bl, br]);
    [shell, head, fl, fr, bl, br].forEach(g => g.dispose());
    return merged ?? new THREE.SphereGeometry(0.5);
  }, []);
}

// ── Wreckage model ───────────────────────────────────────────────────────────
function WreckageGeometry() {
  return useMemo(() => {
    // Crate
    const crate = new THREE.BoxGeometry(0.8, 0.6, 0.7);
    crate.rotateY(0.3);
    crate.translate(-0.5, 0, 0);
    // Barrel
    const barrel = new THREE.CylinderGeometry(0.3, 0.3, 0.8, 8);
    barrel.rotateZ(Math.PI / 2 + 0.2);
    barrel.translate(0.6, 0.1, 0.3);
    // Plank
    const plank = new THREE.BoxGeometry(2.0, 0.08, 0.25);
    plank.rotateY(-0.4);
    plank.translate(0.2, -0.15, -0.5);
    // Small crate
    const sm = new THREE.BoxGeometry(0.4, 0.35, 0.4);
    sm.rotateY(0.8);
    sm.translate(0.8, 0, -0.6);
    const merged = mergeGeometries([crate, barrel, plank, sm]);
    [crate, barrel, plank, sm].forEach(g => g.dispose());
    return merged ?? new THREE.BoxGeometry(1, 0.5, 1);
  }, []);
}

// ── Colors ───────────────────────────────────────────────────────────────────
const WHALE_COLOR = '#3a4a55';
const TURTLE_COLOR = '#4a6a3a';
const WRECKAGE_COLOR = '#5a4530';

const WHALE_NOTICE_DIST = 35;
const WHALE_AVOID_DIST = 75;
const WHALE_WARNING_DIST = 30;
const WHALE_DIVE_DIST = 18;
const WHALE_DIVE_SECONDS = 8;
const WHALE_SPOUT_PARTICLES = 18;

type WhaleAiState = {
  x: number;
  z: number;
  heading: number;
  speed: number;
  diveUntil: number;
  spoutUntil: number;
  spoutCooldownUntil: number;
};

function SpoutParticles({
  meshRef,
  material,
}: {
  meshRef: React.RefObject<THREE.InstancedMesh | null>;
  material: THREE.Material;
}) {
  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, WHALE_SPOUT_PARTICLES]} frustumCulled={false}>
      <sphereGeometry args={[0.16, 6, 4]} />
      <primitive object={material} attach="material" />
    </instancedMesh>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export function OceanEncounter({ encounter }: { encounter: OceanEncounterDef }) {
  const group = useRef<THREE.Group>(null);
  const spoutRef = useRef<THREE.InstancedMesh>(null);
  const [collected, setCollected] = useState(false);
  const whaleAi = useRef<WhaleAiState>({
    x: encounter.position[0],
    z: encounter.position[2],
    heading: encounter.rotation,
    speed: 0.025,
    diveUntil: 0,
    spoutUntil: 0,
    spoutCooldownUntil: 0,
  });

  const geometry = encounter.type === 'whale' ? WhaleGeometry()
    : encounter.type === 'turtle' ? TurtleGeometry()
    : WreckageGeometry();

  const material = useMemo(() => {
    const color = encounter.type === 'whale' ? WHALE_COLOR
      : encounter.type === 'turtle' ? TURTLE_COLOR
      : WRECKAGE_COLOR;
    return new THREE.MeshStandardMaterial({
      color,
      roughness: 0.85,
      side: THREE.DoubleSide,
    });
  }, [encounter.type]);

  const spoutMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#d8f4ff',
    emissive: '#7ec8e3',
    emissiveIntensity: 0.25,
    transparent: true,
    opacity: 0.72,
    roughness: 0.25,
    depthWrite: false,
  }), []);

  const hiddenSpoutMatrix = useMemo(() => new THREE.Matrix4().makeScale(0, 0, 0), []);

  // Approach notification (once)
  const notifiedRef = useRef(false);
  const spoutDummy = useMemo(() => new THREE.Object3D(), []);

  useFrame((state, delta) => {
    if (!group.current || collected) return;
    const time = state.clock.elapsedTime;
    const dt = Math.min(delta, 0.05);
    const pos = encounter.position;
    const player = getLiveShipTransform();

    // ── Animation ──
    if (encounter.type === 'whale') {
      const ai = whaleAi.current;
      const dx = ai.x - player.pos[0];
      const dz = ai.z - player.pos[2];
      const distSq = dx * dx + dz * dz;
      const dist = Math.sqrt(distSq) || 1;
      const awayX = dx / dist;
      const awayZ = dz / dist;
      const shipForwardX = Math.sin(player.rot);
      const shipForwardZ = Math.cos(player.rot);
      const shipBearingTowardWhale = (shipForwardX * awayX + shipForwardZ * awayZ) > 0.32;
      const threatened = dist < WHALE_DIVE_DIST || (dist < WHALE_AVOID_DIST && player.vel > 0.04 && shipBearingTowardWhale);

      if (dist < WHALE_WARNING_DIST && time > ai.spoutCooldownUntil) {
        ai.spoutUntil = time + 1.35;
        ai.spoutCooldownUntil = time + 6.5;
      }
      if (dist < WHALE_DIVE_DIST && ai.diveUntil < time) {
        ai.diveUntil = time + WHALE_DIVE_SECONDS;
      }

      const targetHeading = threatened
        ? Math.atan2(awayX, awayZ)
        : encounter.rotation + Math.sin(time * 0.08 + encounter.rotation) * 0.65;
      const turn = Math.atan2(Math.sin(targetHeading - ai.heading), Math.cos(targetHeading - ai.heading));
      ai.heading += THREE.MathUtils.clamp(turn, -dt * 0.85, dt * 0.85);
      const targetSpeed = threatened ? 0.18 : 0.035;
      ai.speed += (targetSpeed - ai.speed) * (threatened ? 0.06 : 0.025);
      ai.x += Math.sin(ai.heading) * ai.speed;
      ai.z += Math.cos(ai.heading) * ai.speed;

      const diveProgress = THREE.MathUtils.clamp((ai.diveUntil - time) / WHALE_DIVE_SECONDS, 0, 1);
      const diving = diveProgress > 0;
      const diveDepth = diving ? Math.sin(diveProgress * Math.PI) * 5.8 + (dist < WHALE_DIVE_DIST ? 1.4 : 0) : 0;
      const surfaceRoll = Math.sin(time * 0.45 + encounter.rotation) * 0.08;
      group.current.position.set(
        ai.x,
        SEA_LEVEL - 0.45 + Math.sin(time * 0.5) * 0.08 - diveDepth,
        ai.z,
      );
      group.current.rotation.set(
        diving ? -0.18 : surfaceRoll,
        ai.heading,
        threatened ? THREE.MathUtils.clamp(turn, -0.22, 0.22) : Math.sin(time * 0.28) * 0.05,
      );

      if (spoutRef.current) {
        const active = time < ai.spoutUntil && !diving;
        for (let i = 0; i < WHALE_SPOUT_PARTICLES; i++) {
          if (!active) {
            spoutRef.current.setMatrixAt(i, hiddenSpoutMatrix);
            continue;
          }
          const t = (time - (ai.spoutUntil - 1.35)) / 1.35;
          const seed = i * 12.989 + encounter.rotation * 7.1;
          const angle = seed % (Math.PI * 2);
          const spread = 0.15 + (i % 5) * 0.09 + t * 0.6;
          const rise = Math.sin(Math.min(t, 1) * Math.PI) * (1.8 + (i % 4) * 0.28);
          const drift = Math.min(t, 1) * 0.65;
          spoutDummy.position.set(
            ai.x + Math.cos(angle) * spread + Math.sin(ai.heading) * drift,
            SEA_LEVEL + 0.55 + rise,
            ai.z + Math.sin(angle) * spread + Math.cos(ai.heading) * drift,
          );
          const s = (0.9 - t * 0.45) * (0.7 + (i % 3) * 0.18);
          spoutDummy.scale.setScalar(Math.max(0.02, s));
          spoutDummy.updateMatrix();
          spoutRef.current.setMatrixAt(i, spoutDummy.matrix);
        }
        spoutRef.current.instanceMatrix.needsUpdate = true;
      }
    } else if (encounter.type === 'turtle') {
      // Gentle drift + flipper paddle — stays below surface
      const turtleY = SEA_LEVEL - 0.7 + Math.sin(time * 0.5) * 0.04;
      group.current.position.set(
        pos[0] + Math.sin(time * 0.12 + 1) * 2,
        turtleY,
        pos[2] + Math.cos(time * 0.12 + 1) * 2,
      );
      group.current.rotation.set(
        Math.sin(time * 1.2) * 0.06, // paddle roll
        encounter.rotation + time * 0.06,
        Math.sin(time * 0.8) * 0.04,
      );
    } else {
      // Wreckage — slow bob, stays at/just below surface
      const wreckY = SEA_LEVEL - 0.2 + Math.sin(time * 0.6) * 0.05;
      group.current.position.set(
        pos[0] + Math.sin(time * 0.05) * 1.5,
        wreckY,
        pos[2] + Math.cos(time * 0.07) * 1.5,
      );
      group.current.rotation.set(
        Math.sin(time * 0.3) * 0.08,
        encounter.rotation + time * 0.01,
        Math.cos(time * 0.25) * 0.06,
      );
    }

    // ── Approach notification ──
    const playerPos = player.pos;
    const dx = group.current.position.x - playerPos[0];
    const dz = group.current.position.z - playerPos[2];
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist < WHALE_NOTICE_DIST && !notifiedRef.current) {
      notifiedRef.current = true;
      const { addNotification } = useGameStore.getState();
      const label = encounter.type === 'whale' ? 'A whale surfaces nearby!'
        : encounter.type === 'turtle' ? 'A sea turtle spotted off the bow.'
        : 'Wreckage sighted in the water.';
      addNotification(label, 'info');
    }
    if (dist > WHALE_NOTICE_DIST * 1.5) {
      notifiedRef.current = false;
    }
  });

  const handleClick = () => {
    if (collected) return;
    setCollected(true);

    const state = useGameStore.getState();
    const loot = generateEncounterLoot(encounter.type);

    // Apply loot
    if (loot.gold > 0) {
      // Add gold directly
      useGameStore.setState({ gold: state.gold + loot.gold });
    }
    if (loot.provisions > 0) {
      useGameStore.setState({ provisions: state.provisions + loot.provisions });
    }
    // Add cargo
    for (const [commodity, amount] of Object.entries(loot.cargo)) {
      if (amount && amount > 0) {
        const newCargo = { ...state.cargo };
        newCargo[commodity as keyof typeof state.cargo] = (newCargo[commodity as keyof typeof state.cargo] || 0) + amount;
        useGameStore.setState({ cargo: newCargo });
      }
    }

    // Grand toast
    const parts: string[] = [];
    if (loot.gold > 0) parts.push(`${loot.gold} gold`);
    if (loot.provisions > 0) parts.push(`${loot.provisions} provisions`);
    for (const [c, a] of Object.entries(loot.cargo)) {
      if (a && a > 0) parts.push(`${a} ${c}`);
    }
    const rewardLine = parts.length > 0 ? `Gained ${parts.join(', ')}.` : '';

    state.addNotification(loot.title, 'success', {
      size: 'grand',
      subtitle: rewardLine,
    });

    // Journal entry
    state.addJournalEntry('encounter', loot.description);
  };

  if (collected) return null;

  return (
    <group ref={group} position={encounter.position}>
      <mesh
        geometry={geometry}
        material={material}
        onClick={(e) => { e.stopPropagation(); handleClick(); }}
        onPointerOver={() => { document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { document.body.style.cursor = ''; }}
      />
      {encounter.type === 'whale' && <SpoutParticles meshRef={spoutRef} material={spoutMaterial} />}
    </group>
  );
}
