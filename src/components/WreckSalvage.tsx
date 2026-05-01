import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { useGameStore, type CargoStack, type Commodity } from '../store/gameStore';
import { getLiveShipTransform } from '../utils/livePlayerTransform';
import { spawnFloatingCombatText } from './FloatingCombatText';
import { spawnFloatingLoot } from './FloatingLoot';
import { playLootSfx } from '../utils/lootRoll';

interface WreckSalvage {
  id: number;
  npcId: string;
  shipName: string;
  x: number;
  z: number;
  spawnTime: number;
  gold: number;
  cargo: Partial<Record<Commodity, number>>;
  bobSeed: number;
}

const PICKUP_RADIUS_SQ = 5.5 * 5.5;
const DESPAWN_AFTER = 90;
const MAX_SALVAGE = 8;
const events: WreckSalvage[] = [];
let nextId = 1;
let clock = 0;

const makeId = () => Math.random().toString(36).substring(2, 9);

export function spawnWreckSalvage(
  x: number,
  z: number,
  shipName: string,
  npcId: string,
  cargo: Partial<Record<Commodity, number>>,
) {
  const totalGold = 24 + Math.floor(Math.random() * 58);
  const chestCount = Math.random() < 0.38 ? 2 : 1;
  for (let i = 0; i < chestCount; i++) {
    const share = chestCount === 1 ? 1 : i === 0 ? 0.62 : 0.38;
    const chestCargo: Partial<Record<Commodity, number>> = {};
    for (const [comm, qty] of Object.entries(cargo)) {
      if (!qty || qty <= 0) continue;
      const splitQty = Math.max(1, Math.floor(qty * share));
      chestCargo[comm as Commodity] = splitQty;
    }
    const angle = Math.random() * Math.PI * 2;
    const radius = chestCount === 1 ? Math.random() * 2.5 : 2.4 + Math.random() * 2.2;
    events.push({
      id: nextId++,
      npcId,
      shipName,
      x: x + Math.cos(angle) * radius,
      z: z + Math.sin(angle) * radius,
      spawnTime: clock,
      gold: Math.max(8, Math.floor(totalGold * share)),
      cargo: chestCargo,
      bobSeed: Math.random() * Math.PI * 2,
    });
  }
  while (events.length > MAX_SALVAGE) events.shift();
}

function collectSalvage(ev: WreckSalvage) {
  const state = useGameStore.getState();
  const currentCargo = { ...state.cargo };
  const currentTotal = Object.values(currentCargo).reduce((a, b) => a + b, 0);
  const capacity = state.stats.cargoCapacity;
  let usedSpace = currentTotal;
  const salvaged: string[] = [];
  const provenance: CargoStack[] = [];

  for (const [comm, qty] of Object.entries(ev.cargo)) {
    if (!qty || qty <= 0 || usedSpace >= capacity) continue;
    const salvageAmt = Math.max(1, Math.floor(qty * (0.12 + Math.random() * 0.2)));
    const taken = Math.min(salvageAmt, capacity - usedSpace);
    if (taken <= 0) continue;
    const commodity = comm as Commodity;
    currentCargo[commodity] = (currentCargo[commodity] ?? 0) + taken;
    usedSpace += taken;
    salvaged.push(`${taken} ${comm}`);
    provenance.push({
      id: makeId(),
      commodity,
      actualCommodity: commodity,
      amount: taken,
      acquiredPort: `wreck:${ev.npcId}`,
      acquiredPortName: `the ${ev.shipName}`,
      acquiredDay: state.dayCount,
      purchasePrice: 0,
      knowledgeAtPurchase: 1,
    });
  }

  useGameStore.setState({
    gold: state.gold + ev.gold,
    cargo: currentCargo,
    cargoProvenance: [...state.cargoProvenance, ...provenance],
  });

  const subtitle = salvaged.length > 0 ? salvaged.join(' · ') : 'No usable cargo found';
  state.addNotification(`Recovered wreckage from the ${ev.shipName}. +${ev.gold} gold.`, 'success', {
    subtitle,
  });
  state.addJournalEntry(
    'encounter',
    `We recovered a small floating chest from the wreck of the ${ev.shipName}: ${ev.gold} gold${salvaged.length ? ` and ${salvaged.join(', ')}` : ''}.`,
  );
  spawnFloatingLoot(ev.x, 1.2, ev.z, [`+${ev.gold} gold`, ...salvaged.slice(0, 2)]);
  spawnFloatingCombatText(ev.x, 1.2, ev.z, 'Salvage Recovered', 'critical');
  playLootSfx(salvaged.length > 0 || ev.gold > 60 ? 'rare' : 'normal');
}

function SalvageMarker({ ev, now }: { ev: WreckSalvage; now: number }) {
  const groupRef = useRef<THREE.Group>(null);
  const age = now - ev.spawnTime;
  const labelVisible = age < 14;

  useFrame((state, delta) => {
    if (!groupRef.current) return;
    const t = state.clock.elapsedTime + ev.bobSeed;
    groupRef.current.position.y = 0.22 + Math.sin(t * 1.8) * 0.12;
    groupRef.current.rotation.y += 0.35 * delta;
    groupRef.current.rotation.z = Math.sin(t * 1.3) * 0.08;
  });

  return (
    <group ref={groupRef} position={[ev.x, 0.25, ev.z]}>
      <group scale={[1.15, 0.72, 0.82]}>
        <mesh castShadow>
          <boxGeometry args={[1.5, 0.7, 1]} />
          <meshStandardMaterial color="#5b351d" roughness={0.72} metalness={0.05} />
        </mesh>
        <mesh position={[0, 0.38, 0]} castShadow>
          <boxGeometry args={[1.56, 0.16, 1.06]} />
          <meshStandardMaterial color="#7b4a24" roughness={0.66} metalness={0.04} />
        </mesh>
        <mesh position={[0, 0.02, 0.53]}>
          <boxGeometry args={[1.64, 0.12, 0.06]} />
          <meshStandardMaterial color="#c9a84c" roughness={0.42} metalness={0.65} />
        </mesh>
        <mesh position={[0, 0.02, -0.53]}>
          <boxGeometry args={[1.64, 0.12, 0.06]} />
          <meshStandardMaterial color="#c9a84c" roughness={0.42} metalness={0.65} />
        </mesh>
        <mesh position={[0, 0.02, 0.57]}>
          <boxGeometry args={[0.28, 0.22, 0.08]} />
          <meshStandardMaterial color="#d8bd72" roughness={0.35} metalness={0.75} />
        </mesh>
      </group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.19, 0]}>
        <ringGeometry args={[1.05, 1.35, 32]} />
        <meshBasicMaterial color="#f6c75a" transparent opacity={0.22} depthWrite={false} />
      </mesh>
      {labelVisible && (
        <Html position={[0, 1.25, 0]} center style={{ pointerEvents: 'none', userSelect: 'none' }}>
          <div
            style={{
              whiteSpace: 'nowrap',
              fontFamily: '"Fraunces", Georgia, serif',
              fontSize: 13,
              fontWeight: 680,
              color: '#f6d78d',
              textShadow: '0 2px 7px rgba(0,0,0,0.86), 0 0 12px rgba(246,199,90,0.35)',
            }}
          >
            Floating salvage
          </div>
        </Html>
      )}
    </group>
  );
}

export function WreckSalvageSystem() {
  const [, setTick] = useState(0);
  const tickAccum = useRef(0);
  const pickupIds = useMemo(() => new Set<number>(), []);

  useEffect(() => () => { events.length = 0; }, []);

  useFrame((state, delta) => {
    clock = state.clock.getElapsedTime();
    const shipPos = getLiveShipTransform().pos;
    let changed = false;

    for (let i = events.length - 1; i >= 0; i--) {
      const ev = events[i];
      if (clock - ev.spawnTime > DESPAWN_AFTER) {
        events.splice(i, 1);
        changed = true;
        continue;
      }
      const dx = shipPos[0] - ev.x;
      const dz = shipPos[2] - ev.z;
      if (dx * dx + dz * dz <= PICKUP_RADIUS_SQ && !pickupIds.has(ev.id)) {
        pickupIds.add(ev.id);
        collectSalvage(ev);
        events.splice(i, 1);
        changed = true;
      }
    }

    tickAccum.current += delta;
    if ((events.length > 0 && tickAccum.current > 1 / 30) || changed) {
      tickAccum.current = 0;
      setTick((n) => (n + 1) % 1_000_000);
    }
  });

  if (events.length === 0) return null;

  return (
    <>
      {events.map((ev) => <SalvageMarker key={ev.id} ev={ev} now={clock} />)}
    </>
  );
}
