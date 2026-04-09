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

// ── Main component ───────────────────────────────────────────────────────────

export function OceanEncounter({ encounter }: { encounter: OceanEncounterDef }) {
  const group = useRef<THREE.Group>(null);
  const [collected, setCollected] = useState(false);

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

  // Approach notification (once)
  const notifiedRef = useRef(false);
  const APPROACH_DIST = 35;

  useFrame((state) => {
    if (!group.current || collected) return;
    const time = state.clock.elapsedTime;
    const pos = encounter.position;

    // ── Animation ──
    if (encounter.type === 'whale') {
      // Slow surface roll + occasional breach
      const breathCycle = Math.sin(time * 0.15 + encounter.rotation) * 0.5 + 0.5; // 0–1
      const breachHeight = breathCycle > 0.85 ? (breathCycle - 0.85) * 12 : 0;
      group.current.position.set(
        pos[0] + Math.sin(time * 0.08) * 3,
        SEA_LEVEL - 0.3 + Math.sin(time * 0.3) * 0.15 + breachHeight,
        pos[2] + Math.cos(time * 0.08) * 3,
      );
      group.current.rotation.set(
        Math.sin(time * 0.2) * 0.08,
        encounter.rotation + time * 0.04,
        breachHeight > 0.1 ? -0.15 : Math.sin(time * 0.25) * 0.05,
      );
    } else if (encounter.type === 'turtle') {
      // Gentle drift + flipper paddle (rotation wiggle)
      group.current.position.set(
        pos[0] + Math.sin(time * 0.12 + 1) * 2,
        SEA_LEVEL - 0.05 + Math.sin(time * 0.5) * 0.08,
        pos[2] + Math.cos(time * 0.12 + 1) * 2,
      );
      group.current.rotation.set(
        Math.sin(time * 1.2) * 0.06, // paddle roll
        encounter.rotation + time * 0.06,
        Math.sin(time * 0.8) * 0.04,
      );
    } else {
      // Wreckage — slow bob and drift
      group.current.position.set(
        pos[0] + Math.sin(time * 0.05) * 1.5,
        SEA_LEVEL - 0.1 + Math.sin(time * 0.6) * 0.1,
        pos[2] + Math.cos(time * 0.07) * 1.5,
      );
      group.current.rotation.set(
        Math.sin(time * 0.3) * 0.08,
        encounter.rotation + time * 0.01,
        Math.cos(time * 0.25) * 0.06,
      );
    }

    // ── Approach notification ──
    const playerPos = getLiveShipTransform().pos;
    const dx = group.current.position.x - playerPos[0];
    const dz = group.current.position.z - playerPos[2];
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist < APPROACH_DIST && !notifiedRef.current) {
      notifiedRef.current = true;
      const { addNotification } = useGameStore.getState();
      const label = encounter.type === 'whale' ? 'A whale surfaces nearby!'
        : encounter.type === 'turtle' ? 'A sea turtle spotted off the bow.'
        : 'Wreckage sighted in the water.';
      addNotification(label, 'info');
    }
    if (dist > APPROACH_DIST * 1.5) {
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
    </group>
  );
}
