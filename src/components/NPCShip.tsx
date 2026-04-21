import { useRef, useMemo, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore, type Nationality, type Commodity } from '../store/gameStore';
import type { NPCShipIdentity, NPCShipVisual } from '../utils/npcShipGenerator';
import { getLiveShipTransform } from '../utils/livePlayerTransform';
import { npcLivePositions } from '../utils/combatState';
import { getMeshHalf, getTerrainHeight } from '../utils/terrain';
import { sfxShipSink } from '../audio/SoundEffects';
import { spawnSplash } from '../utils/splashState';
import { addCameraImpulse } from '../utils/cameraShakeState';
import { SEA_LEVEL } from '../constants/world';

const APPROACH_RADIUS = 40;  // show "approaching" toast
const HAIL_RADIUS = 12;     // show "Press T to Talk" prompt
const COLLISION_RADIUS = 4;
const NPC_NPC_COLLISION_RADIUS = 6;
const NPC_NPC_COLLISION_PUSH = 1.6;
const NPC_DRAFT_BLOCK_HEIGHT = -0.8;
const NPC_COLLISION_DAMAGE = 10;
const NPC_TARGET_RADIUS = 100;
const NPC_FLEE_TARGET_RADIUS = 80;
const WATER_TARGET_ATTEMPTS = 10;
const MAP_EDGE_MARGIN = 0.94;

const NPC_HULL_PROBE_POINTS: [number, number][] = [
  [0, 3.5],   // Bow
  [0, -2],    // Stern
  [-1.5, 0],  // Port
  [1.5, 0],   // Starboard
];

// ── Selection state (shared across all NPCShip instances) ──
let selectedNpcId: string | null = null;
let selectionSetAt = 0;

function isNavigableWater(x: number, z: number) {
  const boundaryDist = getMeshHalf() * MAP_EDGE_MARGIN;
  if (Math.abs(x) > boundaryDist || Math.abs(z) > boundaryDist) return false;
  return getTerrainHeight(x, z) <= NPC_DRAFT_BLOCK_HEIGHT;
}

function findWaterTarget(originX: number, originZ: number, radius: number, preferredAngle?: number): [number, number] | null {
  for (let attempt = 0; attempt < WATER_TARGET_ATTEMPTS; attempt++) {
    const spread = preferredAngle === undefined ? Math.PI * 2 : Math.PI * (0.25 + attempt * 0.12);
    const angle = preferredAngle === undefined
      ? Math.random() * Math.PI * 2
      : preferredAngle + (Math.random() - 0.5) * spread;
    const distance = radius * (0.45 + Math.random() * 0.65);
    const x = originX + Math.sin(angle) * distance;
    const z = originZ + Math.cos(angle) * distance;
    if (isNavigableWater(x, z)) return [x, z];
  }
  return null;
}

function canNpcMoveTo(x: number, z: number, rotation: number) {
  for (const [px, pz] of NPC_HULL_PROBE_POINTS) {
    const worldX = x + Math.sin(rotation) * pz + Math.cos(rotation) * px;
    const worldZ = z + Math.cos(rotation) * pz - Math.sin(rotation) * px;
    if (!isNavigableWater(worldX, worldZ)) return false;
  }
  return true;
}

function CannonPorts({ visual, zPositions }: { visual: NPCShipVisual; zPositions: number[] }) {
  if (!visual.hasCannonPorts) return null;
  return (
    <>
      {zPositions.map((z) => (
        <group key={z}>
          <mesh position={[-1.22, 0.7, z]}>
            <boxGeometry args={[0.06, 0.16, 0.28]} />
            <meshStandardMaterial color="#101010" roughness={0.8} />
          </mesh>
          <mesh position={[1.22, 0.7, z]}>
            <boxGeometry args={[0.06, 0.16, 0.28]} />
            <meshStandardMaterial color="#101010" roughness={0.8} />
          </mesh>
        </group>
      ))}
    </>
  );
}

function SternFlag({ visual }: { visual: NPCShipVisual }) {
  return (
    <group position={[0, 2.9, -2.45]}>
      <mesh position={[0, 0.35, 0]} rotation={[0, 0, 0.18]}>
        <boxGeometry args={[0.05, 0.9, 0.05]} />
        <meshStandardMaterial color="#3e2723" />
      </mesh>
      <mesh position={[0.28, 0.65, 0]} rotation={[0, 0, 0.08]}>
        <boxGeometry args={[0.55, 0.34, 0.035]} />
        <meshStandardMaterial color={visual.flagColor} roughness={0.8} />
      </mesh>
      <mesh position={[0.28, 0.65, 0.025]} rotation={[0, 0, 0.08]}>
        <boxGeometry args={[0.3, 0.06, 0.04]} />
        <meshStandardMaterial color={visual.flagAccentColor} roughness={0.8} />
      </mesh>
    </group>
  );
}

function LateenSail({ visual, position, scale = 1, angle = -0.46 }: { visual: NPCShipVisual; position: [number, number, number]; scale?: number; angle?: number }) {
  return (
    <group position={position} rotation={[0, 0, angle]}>
      <mesh>
        <boxGeometry args={[2.7 * scale, 1.55 * scale, 0.08]} />
        <meshStandardMaterial color={visual.sailColor} roughness={1} />
      </mesh>
      <mesh position={[0, 0.82 * scale, 0.03]}>
        <boxGeometry args={[2.85 * scale, 0.08, 0.09]} />
        <meshStandardMaterial color={visual.sailTrimColor} roughness={1} />
      </mesh>
    </group>
  );
}

function DhowLikeModel({ visual, shipType }: { visual: NPCShipVisual; shipType: string }) {
  const large = shipType === 'Baghla' || shipType === 'Ghurab';
  const hw = large ? 1.95 : 1.6; // hull width
  const hl = large ? 5.2 : 4.4;  // hull length
  return (
    <group scale={visual.scale}>
      {/* Main hull — shortened to make room for tapered bow */}
      <mesh position={[0, 0.45, -0.3]} castShadow receiveShadow>
        <boxGeometry args={[hw, 0.8, hl * 0.78]} />
        <meshStandardMaterial color={visual.hullColor} roughness={0.9} />
      </mesh>
      {/* Tapered bow — cone tapering to a sharp prow, raked slightly upward */}
      <mesh position={[0, 0.55, hl * 0.32]} rotation={[-0.15, 0, 0]} castShadow receiveShadow>
        <coneGeometry args={[hw * 0.52, hl * 0.38, 4]} />
        <meshStandardMaterial color={visual.hullColor} roughness={0.9} />
      </mesh>
      {/* Curved stem post — thin upward-raking spar at the prow tip */}
      <mesh position={[0, 1.05, hl * 0.46]} rotation={[-0.4, 0, 0]} castShadow>
        <cylinderGeometry args={[0.04, 0.06, 1.2, 6]} />
        <meshStandardMaterial color={visual.trimColor} roughness={0.85} />
      </mesh>
      {/* Stern rail */}
      <mesh position={[0, 0.95, -1.8]} castShadow receiveShadow>
        <boxGeometry args={[large ? 1.8 : 1.45, 0.28, 0.22]} />
        <meshStandardMaterial color={visual.trimColor} roughness={0.85} />
      </mesh>
      {/* Main mast — raked slightly forward (characteristic of dhows) */}
      <mesh position={[0, 2.4, 0.4]} rotation={[0.08, 0, 0]} castShadow>
        <cylinderGeometry args={[0.08, 0.1, 3.7, 7]} />
        <meshStandardMaterial color="#3e2723" />
      </mesh>
      <LateenSail visual={visual} position={[0.45, 2.85, 0.65]} scale={large ? 1.1 : 0.95} />
      {visual.mastCount > 1 && (
        <>
          <mesh position={[0, 2.0, -1.25]} castShadow>
            <cylinderGeometry args={[0.06, 0.08, 2.7, 7]} />
            <meshStandardMaterial color="#3e2723" />
          </mesh>
          <LateenSail visual={visual} position={[-0.35, 2.25, -1.1]} scale={0.7} angle={0.42} />
        </>
      )}
      <CannonPorts visual={visual} zPositions={[-1.3, -0.35, 0.6]} />
      <SternFlag visual={visual} />
    </group>
  );
}

function JunkModel({ visual }: { visual: NPCShipVisual }) {
  return (
    <group scale={visual.scale}>
      {/* Main hull — wider at waterline (flat-bottomed junk characteristic) */}
      <mesh position={[0, 0.35, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.55, 0.6, 5.0]} />
        <meshStandardMaterial color={visual.hullColor} roughness={0.9} />
      </mesh>
      {/* Upper hull — slightly narrower (tumblehome) */}
      <mesh position={[0, 0.78, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.25, 0.4, 4.8]} />
        <meshStandardMaterial color={visual.hullColor} roughness={0.9} />
      </mesh>
      {/* High flat transom — the junk's most distinctive feature */}
      <mesh position={[0, 1.25, -2.45]} castShadow receiveShadow>
        <boxGeometry args={[2.35, 1.4, 0.2]} />
        <meshStandardMaterial color={visual.trimColor} roughness={0.9} />
      </mesh>
      {/* Stern cabin */}
      <mesh position={[0, 1.1, -1.85]} castShadow receiveShadow>
        <boxGeometry args={[2.0, 0.7, 0.9]} />
        <meshStandardMaterial color={visual.deckColor} roughness={0.9} />
      </mesh>
      {/* Bluff bow platform (kept flat — historically accurate) */}
      <mesh position={[0, 0.92, 2.35]} castShadow receiveShadow>
        <boxGeometry args={[1.9, 0.35, 0.42]} />
        <meshStandardMaterial color={visual.deckColor} roughness={0.9} />
      </mesh>
      {/* Masts with batten sails */}
      {[-0.85, 0.95].map((z, mastIdx) => (
        <group key={z} position={[0, 0, z]}>
          <mesh position={[0, 2.35, 0]} castShadow>
            <cylinderGeometry args={[0.08, 0.1, 3.5 - mastIdx * 0.25, 7]} />
            <meshStandardMaterial color="#3e2723" />
          </mesh>
          {/* Sail panels with bamboo batten ribs between them */}
          {[-0.55, 0, 0.55].map((y, panelIdx) => (
            <group key={y}>
              <mesh position={[0.05, 2.6 + y - mastIdx * 0.15, 0]} rotation={[0, 0, 0.05]}>
                <boxGeometry args={[2.15 - panelIdx * 0.18, 0.38, 0.08]} />
                <meshStandardMaterial color={panelIdx === 1 ? visual.sailColor : visual.sailTrimColor} roughness={1} />
              </mesh>
              {/* Bamboo batten rib */}
              <mesh position={[0.05, 2.38 + y - mastIdx * 0.15, 0]} rotation={[0, 0, 0.05]}>
                <boxGeometry args={[2.2 - panelIdx * 0.16, 0.04, 0.1]} />
                <meshStandardMaterial color="#5c4a2e" roughness={0.8} />
              </mesh>
            </group>
          ))}
        </group>
      ))}
      <CannonPorts visual={visual} zPositions={[-1.2, 0, 1.2]} />
      <SternFlag visual={visual} />
    </group>
  );
}

function PrauModel({ visual, shipType }: { visual: NPCShipVisual; shipType: string }) {
  const jong = shipType === 'Jong';
  const hw = jong ? 2.15 : 1.2;
  const hl = jong ? 5.2 : 4.6;
  return (
    <group scale={visual.scale}>
      {/* Main hull — shortened for tapered bow */}
      <mesh position={[0, 0.42, -0.2]} castShadow receiveShadow>
        <boxGeometry args={[hw, 0.72, hl * 0.75]} />
        <meshStandardMaterial color={visual.hullColor} roughness={0.9} />
      </mesh>
      {/* Sharp pointed bow — narrow cone, praus had very fine entries */}
      <mesh position={[0, 0.42, hl * 0.3]} rotation={[-Math.PI / 2, 0, 0]} castShadow receiveShadow>
        <coneGeometry args={[hw * 0.38, hl * 0.35, 4]} />
        <meshStandardMaterial color={visual.hullColor} roughness={0.9} />
      </mesh>
      {/* Raised bow platform / carved prow ornament */}
      <mesh position={[0, 0.85, hl * 0.42]} rotation={[-0.3, 0, 0]} castShadow>
        <boxGeometry args={[hw * 0.35, 0.5, 0.6]} />
        <meshStandardMaterial color={visual.trimColor} roughness={0.85} />
      </mesh>
      {/* Stern — slightly tapered */}
      <mesh position={[0, 0.52, -hl * 0.42]} rotation={[-Math.PI / 2, 0, 0]} castShadow>
        <coneGeometry args={[hw * 0.45, hl * 0.18, 4]} />
        <meshStandardMaterial color={visual.hullColor} roughness={0.9} />
      </mesh>
      {visual.hasOutrigger && (
        <>
          {/* Outrigger floats */}
          {[-1.45, 1.45].map((x) => (
            <mesh key={x} position={[x, 0.22, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
              <cylinderGeometry args={[0.08, 0.08, 4.1, 8]} />
              <meshStandardMaterial color={visual.trimColor} roughness={0.9} />
            </mesh>
          ))}
          {/* Cross-spars */}
          {[-1.2, 0.6].map((z) => (
            <mesh key={z} position={[0, 0.48, z]} rotation={[0, 0, Math.PI / 2]} castShadow>
              <cylinderGeometry args={[0.035, 0.035, 3.1, 6]} />
              <meshStandardMaterial color="#3e2723" roughness={0.9} />
            </mesh>
          ))}
        </>
      )}
      {/* Mast — slightly canted (characteristic of tanja rig) */}
      <mesh position={[0, 2.15, 0.35]} rotation={[0.06, 0, 0.04]} castShadow>
        <cylinderGeometry args={[0.07, 0.09, 3.2, 7]} />
        <meshStandardMaterial color="#3e2723" />
      </mesh>
      {/* Lug sail */}
      <mesh position={[0.35, 2.7, 0.45]} rotation={[0, 0, -0.25]}>
        <boxGeometry args={[2.05, 1.45, 0.08]} />
        <meshStandardMaterial color={visual.sailColor} roughness={1} />
      </mesh>
      {jong && (
        <LateenSail visual={visual} position={[-0.35, 2.25, -1.25]} scale={0.72} angle={0.36} />
      )}
      <SternFlag visual={visual} />
    </group>
  );
}

function EuropeanModel({ visual, shipType }: { visual: NPCShipVisual; shipType: string }) {
  const galleon = shipType === 'Galleon' || shipType === 'Carrack' || shipType === 'Armed Merchantman';
  const hw = galleon ? 2.35 : 1.85;
  const hl = galleon ? 5.9 : 4.9;
  return (
    <group scale={visual.scale}>
      {/* Main hull — shortened to leave room for bow taper */}
      <mesh position={[0, 0.58, -0.25]} castShadow receiveShadow>
        <boxGeometry args={[hw, 1.05, hl * 0.8]} />
        <meshStandardMaterial color={visual.hullColor} roughness={0.9} />
      </mesh>
      {/* Bow taper — wedge narrowing to the beakhead */}
      <mesh position={[0, 0.5, hl * 0.3]} rotation={[-Math.PI / 2, 0, 0]} castShadow receiveShadow>
        <coneGeometry args={[hw * 0.52, hl * 0.28, 4]} />
        <meshStandardMaterial color={visual.hullColor} roughness={0.9} />
      </mesh>
      {/* Beakhead — the pointed spar projecting forward below the bowsprit */}
      <mesh position={[0, 0.65, hl * 0.46]} castShadow receiveShadow>
        <boxGeometry args={[hw * 0.35, 0.45, 0.55]} />
        <meshStandardMaterial color={visual.trimColor} roughness={0.9} />
      </mesh>
      {/* Bowsprit — angled spar projecting forward and upward from the bow */}
      <mesh position={[0, 1.35, hl * 0.42]} rotation={[-0.55, 0, 0]} castShadow>
        <cylinderGeometry args={[0.05, 0.07, galleon ? 2.8 : 2.0, 6]} />
        <meshStandardMaterial color="#3e2723" />
      </mesh>
      {/* Forecastle */}
      <mesh position={[0, 1.15, hl * 0.28]} castShadow receiveShadow>
        <boxGeometry args={[galleon ? 1.75 : 1.25, 0.55, 0.75]} />
        <meshStandardMaterial color={visual.trimColor} roughness={0.9} />
      </mesh>
      {/* Stern castle */}
      {visual.hasSternCastle && (
        <mesh position={[0, 1.4, -2.35]} castShadow receiveShadow>
          <boxGeometry args={[galleon ? 2.2 : 1.65, galleon ? 1.35 : 1.15, 0.9]} />
          <meshStandardMaterial color={visual.deckColor} roughness={0.9} />
        </mesh>
      )}
      {/* Masts and sails */}
      {[-1.45, 0.2, 1.55].slice(0, visual.mastCount).map((z, idx) => (
        <group key={z} position={[0, 0, z]}>
          <mesh position={[0, 2.45, 0]} castShadow>
            <cylinderGeometry args={[0.08, 0.11, idx === 1 ? 4.3 : 3.7, 8]} />
            <meshStandardMaterial color="#3e2723" />
          </mesh>
          <mesh position={[0, 3.0, 0]} rotation={[0, 0, idx === 2 ? 0.18 : 0]}>
            <boxGeometry args={[idx === 1 ? 2.35 : 1.9, idx === 2 ? 1.05 : 1.25, 0.08]} />
            <meshStandardMaterial color={visual.sailColor} roughness={1} />
          </mesh>
          <mesh position={[0, 3.68, 0]}>
            <boxGeometry args={[idx === 1 ? 2.5 : 2.05, 0.08, 0.1]} />
            <meshStandardMaterial color={visual.sailTrimColor} roughness={1} />
          </mesh>
        </group>
      ))}
      <CannonPorts visual={visual} zPositions={[-1.8, -0.8, 0.2, 1.2]} />
      <SternFlag visual={visual} />
    </group>
  );
}

function NPCShipModel({ identity }: { identity: NPCShipIdentity }) {
  switch (identity.visual.family) {
    case 'junk':
      return <JunkModel visual={identity.visual} />;
    case 'prau':
      return <PrauModel visual={identity.visual} shipType={identity.shipType} />;
    case 'european':
      return <EuropeanModel visual={identity.visual} shipType={identity.shipType} />;
    case 'dhow':
    default:
      return <DhowLikeModel visual={identity.visual} shipType={identity.shipType} />;
  }
}

export function NPCShip({
  identity,
  initialPosition,
}: {
  identity: NPCShipIdentity;
  initialPosition: [number, number, number];
}) {
  const group = useRef<THREE.Group>(null);
  const torchRef = useRef<THREE.PointLight>(null);
  const torchMeshRef = useRef<THREE.MeshStandardMaterial>(null);
  const alertRingRef = useRef<THREE.Mesh>(null);
  const selectRingRef = useRef<THREE.Mesh>(null);
  const healthBarFgRef = useRef<THREE.Mesh>(null);
  const healthBarGroupRef = useRef<THREE.Group>(null);
  const targetRef = useRef(new THREE.Vector3(
    initialPosition[0] + (Math.random() - 0.5) * 50,
    0,
    initialPosition[2] + (Math.random() - 0.5) * 50
  ));
  const _tmpVec = useRef(new THREE.Vector3());
  const _avoidVec = useRef(new THREE.Vector3());

  // Hull state
  const hullRef = useRef(identity.maxHull);
  const [sinking, setSinking] = useState(false);
  const sinkProgress = useRef(0); // 0→1 over sink animation
  const sinkSplashFired = useRef(false);

  // Damage visual state
  const damageTilt = useRef(0); // persistent list angle from hull damage
  const damageTiltTarget = useRef(0);
  const damageTiltSide = useRef(Math.random() > 0.5 ? 1 : -1); // which side they list to

  // Smoke particles for damaged ships — mesh only mounts once damage begins
  const smokeMeshRef = useRef<THREE.InstancedMesh>(null);
  const smokeParticles = useRef<{ pos: THREE.Vector3; vel: THREE.Vector3; life: number; maxLife: number }[]>([]);
  const SMOKE_COUNT = 12;
  const smokeInitialized = useRef(false);
  const smokeDummy = useMemo(() => new THREE.Object3D(), []);
  const [smokeActive, setSmokeActive] = useState(false);

  // Bubble particles for sinking — mesh only mounts once the ship starts to sink
  const bubbleMeshRef = useRef<THREE.InstancedMesh>(null);
  const bubbleParticles = useRef<{ pos: THREE.Vector3; vel: THREE.Vector3; life: number }[]>([]);
  const BUBBLE_COUNT = 16;
  const bubbleInitialized = useRef(false);
  const bubbleDummy = useMemo(() => new THREE.Object3D(), []);
  const [bubblesActive, setBubblesActive] = useState(false);

  // Frame-rate throttle for distant NPCs
  const frameSkipCounter = useRef(0);
  const accumulatedDelta = useRef(0);

  // Track proximity state to avoid spamming
  const approachNotified = useRef(false);
  const inHailRange = useRef(false);
  const lastClickToast = useRef(0);
  const nextTargetSearchAt = useRef(0);

  // Alert mode: triggered by collision, ship flees from player
  const alertUntil = useRef(0); // timestamp when alert ends
  const lastCollisionTime = useRef(0); // cooldown to prevent spam
  const ALERT_DURATION = 8000; // 8 seconds of fleeing
  const COLLISION_COOLDOWN = 2000; // match Ship.tsx's 2-second cooldown

  const speed = useMemo(() => 2 + Math.random() * 3, []);

  // Deselect when clicking elsewhere (deferred so R3F onClick fires first)
  useEffect(() => {
    const handler = () => {
      requestAnimationFrame(() => {
        if (Date.now() - selectionSetAt > 100) {
          selectedNpcId = null;
        }
      });
    };
    window.addEventListener('pointerdown', handler);
    return () => window.removeEventListener('pointerdown', handler);
  }, []);

  useFrame((state, delta) => {
    if (!group.current) return;

    // ── Sinking animation (3 phases) ──
    if (sinking) {
      sinkProgress.current += delta * 0.22; // ~4.5 seconds total
      const t = sinkProgress.current;
      const side = damageTiltSide.current;

      if (t < 0.3) {
        // Phase 1: settle low in water, heavy list
        const p = t / 0.3;
        const ease = p * p; // ease-in
        group.current.position.y = -ease * 1.5;
        group.current.rotation.z = side * ease * 0.6;
        group.current.rotation.x = ease * 0.15;
      } else if (t < 0.7) {
        // Phase 2: capsize — roll hard, bow rises
        const p = (t - 0.3) / 0.4;
        const ease = 1 - (1 - p) * (1 - p); // ease-out
        group.current.position.y = -1.5 - ease * 3.0;
        group.current.rotation.z = side * (0.6 + ease * 0.8);
        group.current.rotation.x = 0.15 + ease * 0.5;
      } else {
        // Phase 3: slip beneath the surface
        const p = Math.min(1, (t - 0.7) / 0.3);
        const ease = p * p;
        group.current.position.y = -4.5 - ease * 4;
        group.current.rotation.z = side * 1.4;
        group.current.rotation.x = 0.65 + ease * 0.2;
      }

      // Spawn splash when hull meets waterline
      if (t > 0.25 && !sinkSplashFired.current) {
        sinkSplashFired.current = true;
        const pos = group.current.position;
        spawnSplash(pos.x, pos.z, 0.8);
      }

      // Bubble particles while sinking
      if (bubbleMeshRef.current) {
        if (!bubbleInitialized.current) {
          bubbleInitialized.current = true;
          for (let i = 0; i < BUBBLE_COUNT; i++) {
            bubbleParticles.current.push({
              pos: new THREE.Vector3(0, -1000, 0),
              vel: new THREE.Vector3(),
              life: 0,
            });
          }
        }
        const shipPos = group.current.position;
        // Continuously spawn bubbles while sinking
        for (let i = 0; i < BUBBLE_COUNT; i++) {
          const bp = bubbleParticles.current[i];
          if (bp.life <= 0 && t > 0.15 && t < 0.95) {
            bp.pos.set(
              shipPos.x + (Math.random() - 0.5) * 4,
              SEA_LEVEL - 0.1,
              shipPos.z + (Math.random() - 0.5) * 4,
            );
            bp.vel.set(
              (Math.random() - 0.5) * 0.5,
              1.5 + Math.random() * 2,
              (Math.random() - 0.5) * 0.5,
            );
            bp.life = 0.4 + Math.random() * 0.6;
            break; // one spawn per frame
          }
        }
        let needsUpdate = false;
        for (let i = 0; i < BUBBLE_COUNT; i++) {
          const bp = bubbleParticles.current[i];
          if (bp.life > 0) {
            bp.life -= delta;
            bp.pos.addScaledVector(bp.vel, delta);
            bp.vel.x *= 1 - 2 * delta;
            bp.vel.z *= 1 - 2 * delta;
            bubbleDummy.position.copy(bp.pos);
            const s = Math.max(0, bp.life) * 0.25;
            bubbleDummy.scale.set(s, s, s);
            bubbleDummy.updateMatrix();
            bubbleMeshRef.current.setMatrixAt(i, bubbleDummy.matrix);
            needsUpdate = true;
          } else if (bp.pos.y > -100) {
            bp.pos.set(0, -1000, 0);
            bubbleDummy.position.copy(bp.pos);
            bubbleDummy.scale.set(0, 0, 0);
            bubbleDummy.updateMatrix();
            bubbleMeshRef.current.setMatrixAt(i, bubbleDummy.matrix);
            needsUpdate = true;
          }
        }
        if (needsUpdate) bubbleMeshRef.current.instanceMatrix.needsUpdate = true;
      }

      if (t >= 1) {
        npcLivePositions.delete(identity.id);
        group.current.visible = false;
      }
      return; // skip all other logic while sinking
    }

    const currentPos = group.current.position;
    const playerPos = getLiveShipTransform().pos;

    const dxPlayer = currentPos.x - playerPos[0];
    const dzPlayer = currentPos.z - playerPos[2];
    const distToPlayer = Math.sqrt(dxPlayer * dxPlayer + dzPlayer * dzPlayer);

    // Distant ships update every 3rd frame; accumulate delta so motion stays smooth.
    if (distToPlayer > 200) {
      accumulatedDelta.current += delta;
      frameSkipCounter.current = (frameSkipCounter.current + 1) % 3;
      if (frameSkipCounter.current !== 0) return;
      delta = accumulatedDelta.current;
      accumulatedDelta.current = 0;
    }

    const { playerMode, timeOfDay, addNotification, interactionPrompt, setInteractionPrompt, adjustReputation, setNearestHailableNpc, defeatedNpc, nearestHailableNpc } = useGameStore.getState();

    // ── Check for hull damage from projectile hits ──
    const liveEntry = npcLivePositions.get(identity.id);
    if (liveEntry && liveEntry.hull < hullRef.current) {
      hullRef.current = liveEntry.hull;
      // Ship destroyed?
      if (hullRef.current <= 0) {
        setSinking(true);
        setBubblesActive(true);
        sfxShipSink();
        defeatedNpc(identity.id, identity.shipName, identity.flag as Nationality, identity.cargo as Partial<Record<Commodity, number>>);
        liveEntry.sunk = true;
        return;
      }
    }

    // ── Proximity detection (only in ship mode) ──
    if (playerMode === 'ship') {
      // Approach toast
      if (distToPlayer < APPROACH_RADIUS && !approachNotified.current) {
        approachNotified.current = true;
        addNotification(`Approaching ${identity.appearancePhrase}.`, 'info');
      }
      if (distToPlayer > APPROACH_RADIUS * 1.3) {
        approachNotified.current = false;
      }

      // Hail prompt — only claim the slot if no other NPC already holds it
      if (distToPlayer < HAIL_RADIUS && !inHailRange.current) {
        if (!nearestHailableNpc) {
          inHailRange.current = true;
          setInteractionPrompt('Press T to Hail');
          setNearestHailableNpc(identity);
        }
      }
      if (distToPlayer > HAIL_RADIUS * 1.2 && inHailRange.current) {
        inHailRange.current = false;
        // Only clear if we're the ones who set it
        if (nearestHailableNpc?.id === identity.id) {
          setInteractionPrompt(null);
          setNearestHailableNpc(null);
        }
      }
    }

    // ── Collision — elastic bounce with restitution ──
    if (distToPlayer < COLLISION_RADIUS) {
      const now = Date.now();
      // Contact normal points from player → NPC.
      const rawDx = currentPos.x - playerPos[0];
      const rawDz = currentPos.z - playerPos[2];
      const rawLen = Math.max(0.001, Math.sqrt(rawDx * rawDx + rawDz * rawDz));
      const nx = rawDx / rawLen;
      const nz = rawDz / rawLen;

      // Relative velocity along the contact normal (NPC minus player, dotted with n).
      // Negative means ships are closing; positive means separating.
      const playerTransform = getLiveShipTransform();
      const pvx = Math.sin(playerTransform.rot) * playerTransform.vel;
      const pvz = Math.cos(playerTransform.rot) * playerTransform.vel;
      // Effective NPC speed this frame (alertMode not yet computed this frame — approximate).
      const npcSpeed = Date.now() < alertUntil.current ? speed * 2.5 : speed;
      const nvx = Math.sin(group.current.rotation.y) * npcSpeed;
      const nvz = Math.cos(group.current.rotation.y) * npcSpeed;
      const relN = (nvx - pvx) * nx + (nvz - pvz) * nz;
      const approachSpeed = Math.max(0, -relN);

      // Equal-mass elastic impulse with restitution.
      const RESTITUTION = 0.7;
      const impulseMag = (1 + RESTITUTION) * approachSpeed * 0.5;

      // Kick NPC outward along +n (guaranteed minimum so a grazing touch is still felt).
      const npcKick = Math.max(impulseMag * 0.8, 1.8);
      currentPos.x += nx * npcKick * 0.35;
      currentPos.z += nz * npcKick * 0.35;

      // Only fire events/reputation/damage once per cooldown (matches Ship.tsx's 2s gate)
      if (now - lastCollisionTime.current > COLLISION_COOLDOWN) {
        lastCollisionTime.current = now;
        window.dispatchEvent(new CustomEvent('ship-collision', {
          detail: {
            appearancePhrase: identity.appearancePhrase,
            nx, nz,
            impulseMag,
            approachSpeed,
          },
        }));
        // Camera nudge — one-shot directional push away from the ram point.
        addCameraImpulse(-nx, -nz, Math.min(1.8, 0.45 + approachSpeed * 0.22));
        hullRef.current = Math.max(0, hullRef.current - NPC_COLLISION_DAMAGE);
        if (liveEntry) liveEntry.hull = hullRef.current;
        adjustReputation(identity.flag, -5);

        if (hullRef.current <= 0) {
          if (liveEntry) liveEntry.sunk = true;
          setSinking(true);
          setBubblesActive(true);
          sfxShipSink();
          defeatedNpc(identity.id, identity.shipName, identity.flag as Nationality, identity.cargo as Partial<Record<Commodity, number>>);
          return;
        }

        const hullPct = Math.round((hullRef.current / identity.maxHull) * 100);
        addNotification(`Rammed the ${identity.shipName}! Hull: ${hullPct}%`, 'warning');
      }

      // Always refresh alert mode so the ship keeps fleeing
      alertUntil.current = now + ALERT_DURATION;
      targetRef.current.set(
        currentPos.x + nx * 80, 0, currentPos.z + nz * 80
      );
    }

    // Check for projectile hit alert from combat system
    if (liveEntry?.hitAlert && Date.now() < liveEntry.hitAlert) {
      alertUntil.current = Math.max(alertUntil.current, liveEntry.hitAlert);
    }

    const isAlerted = Date.now() < alertUntil.current;

    const now = Date.now();

    // ── Movement AI ──
    if (isAlerted) {
      // While alerted, keep fleeing away from the player
      const fleeDir = _tmpVec.current.set(
        currentPos.x - playerPos[0], 0, currentPos.z - playerPos[2]
      ).normalize();
      if (now >= nextTargetSearchAt.current) {
        const fleeAngle = Math.atan2(fleeDir.x, fleeDir.z);
        const waterTarget = findWaterTarget(currentPos.x, currentPos.z, NPC_FLEE_TARGET_RADIUS, fleeAngle);
        if (waterTarget) {
          targetRef.current.set(waterTarget[0], 0, waterTarget[1]);
        } else {
          targetRef.current.set(
            currentPos.x + fleeDir.x * 20, 0, currentPos.z + fleeDir.z * 20
          );
        }
        nextTargetSearchAt.current = now + 500;
      }
    } else {
      const dist = currentPos.distanceTo(targetRef.current);
      if (dist < 5) {
        const waterTarget = findWaterTarget(currentPos.x, currentPos.z, NPC_TARGET_RADIUS);
        if (waterTarget) targetRef.current.set(waterTarget[0], 0, waterTarget[1]);
      }
    }

    const currentSpeed = isAlerted ? speed * 2.5 : speed; // flee faster when alerted

    const direction = _tmpVec.current.subVectors(targetRef.current, currentPos).normalize();
    const targetRotation = Math.atan2(direction.x, direction.z);

    let rotDiff = targetRotation - group.current.rotation.y;
    while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
    while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
    group.current.rotation.y += rotDiff * delta * 2;

    const moveX = Math.sin(group.current.rotation.y) * currentSpeed * delta;
    const moveZ = Math.cos(group.current.rotation.y) * currentSpeed * delta;
    let nextX = currentPos.x + moveX;
    let nextZ = currentPos.z + moveZ;

    // ── NPC-to-NPC collision/separation ──
    // Use the live position map as a lightweight broad phase. Ships steer/push
    // apart instead of passing through each other.
    const avoid = _avoidVec.current.set(0, 0, 0);
    let avoidCount = 0;
    for (const [otherId, other] of npcLivePositions) {
      if (otherId === identity.id || other.sunk) continue;
      const dx = currentPos.x - other.x;
      const dz = currentPos.z - other.z;
      const distSq = dx * dx + dz * dz;
      if (distSq >= NPC_NPC_COLLISION_RADIUS * NPC_NPC_COLLISION_RADIUS) continue;

      const dist = Math.max(Math.sqrt(distSq), 0.001);
      const overlap = (NPC_NPC_COLLISION_RADIUS - dist) / NPC_NPC_COLLISION_RADIUS;
      avoid.x += (dx / dist) * overlap;
      avoid.z += (dz / dist) * overlap;
      avoidCount++;
    }

    if (avoidCount > 0) {
      avoid.normalize();
      currentPos.x += avoid.x * NPC_NPC_COLLISION_PUSH * delta * 8;
      currentPos.z += avoid.z * NPC_NPC_COLLISION_PUSH * delta * 8;
      nextX = currentPos.x + avoid.x * NPC_NPC_COLLISION_PUSH;
      nextZ = currentPos.z + avoid.z * NPC_NPC_COLLISION_PUSH;
      if (now >= nextTargetSearchAt.current) {
        const avoidAngle = Math.atan2(avoid.x, avoid.z);
        const waterTarget = findWaterTarget(currentPos.x, currentPos.z, 36, avoidAngle);
        if (waterTarget) {
          targetRef.current.set(waterTarget[0], 0, waterTarget[1]);
        } else {
          targetRef.current.set(currentPos.x + avoid.x * 24, 0, currentPos.z + avoid.z * 24);
        }
        nextTargetSearchAt.current = now + 500;
      }
    }

    if (canNpcMoveTo(nextX, nextZ, group.current.rotation.y)) {
      group.current.position.x = nextX;
      group.current.position.z = nextZ;
    } else if (now >= nextTargetSearchAt.current) {
      const sampleDist = 2;
      const hL = getTerrainHeight(currentPos.x - sampleDist, currentPos.z);
      const hR = getTerrainHeight(currentPos.x + sampleDist, currentPos.z);
      const hF = getTerrainHeight(currentPos.x, currentPos.z + sampleDist);
      const hB = getTerrainHeight(currentPos.x, currentPos.z - sampleDist);
      const awayFromLandAngle = Math.atan2(hL - hR, hB - hF);
      const waterTarget = findWaterTarget(currentPos.x, currentPos.z, NPC_TARGET_RADIUS, awayFromLandAngle);
      if (waterTarget) {
        targetRef.current.set(waterTarget[0], 0, waterTarget[1]);
      } else {
        targetRef.current.set(
          currentPos.x - Math.sin(group.current.rotation.y) * 20,
          0,
          currentPos.z - Math.cos(group.current.rotation.y) * 20
        );
      }
      nextTargetSearchAt.current = now + 350;
    }

    // ── Damage tilt — ships list as they take damage ──
    const hullFrac = hullRef.current / identity.maxHull;
    if (hullFrac < 0.85) {
      // Target tilt increases as hull drops: 0 at 85%, up to ~0.35 rad at 0%
      damageTiltTarget.current = (1 - hullFrac / 0.85) * 0.35;
    } else {
      damageTiltTarget.current = 0;
    }
    // Smooth approach to target tilt
    damageTilt.current += (damageTiltTarget.current - damageTilt.current) * delta * 2;

    // Bobbing — damage adds persistent list + lower waterline
    const sinkOffset = damageTilt.current * 1.2; // settle lower as damage increases
    group.current.position.y = Math.sin(state.clock.elapsedTime * 2 + initialPosition[0]) * 0.2 - sinkOffset;
    group.current.rotation.z = Math.sin(state.clock.elapsedTime * 1.5 + initialPosition[2]) * 0.05
      + damageTilt.current * damageTiltSide.current;
    group.current.rotation.x = Math.cos(state.clock.elapsedTime * 1.2 + initialPosition[0]) * 0.05
      + damageTilt.current * 0.15;

    // ── Damage smoke — rising from damaged ships ──
    if (hullFrac < 0.7 && !smokeActive) {
      setSmokeActive(true);
    }
    if (hullFrac < 0.7 && distToPlayer < 120 && smokeMeshRef.current) {
      if (!smokeInitialized.current) {
        smokeInitialized.current = true;
        for (let i = 0; i < SMOKE_COUNT; i++) {
          smokeParticles.current.push({
            pos: new THREE.Vector3(0, -1000, 0),
            vel: new THREE.Vector3(),
            life: 0,
            maxLife: 1,
          });
        }
      }
      // Spawn rate increases with damage
      const spawnRate = hullFrac < 0.3 ? 3 : hullFrac < 0.5 ? 2 : 1; // particles per frame attempt
      let spawned = 0;
      for (let i = 0; i < SMOKE_COUNT && spawned < spawnRate; i++) {
        const sp = smokeParticles.current[i];
        if (sp.life <= 0) {
          const shipPos = currentPos;
          sp.pos.set(
            shipPos.x + (Math.random() - 0.5) * 2.5,
            shipPos.y + 1.5 + Math.random() * 1.5,
            shipPos.z + (Math.random() - 0.5) * 2.5,
          );
          sp.vel.set(
            (Math.random() - 0.5) * 0.4,
            1.2 + Math.random() * 1.5,
            (Math.random() - 0.5) * 0.4,
          );
          sp.maxLife = 1.5 + Math.random() * 1.5;
          sp.life = sp.maxLife;
          spawned++;
        }
      }
      // Update smoke particles
      let needsUpdate = false;
      for (let i = 0; i < SMOKE_COUNT; i++) {
        const sp = smokeParticles.current[i];
        if (!sp) continue;
        if (sp.life > 0) {
          sp.life -= delta;
          sp.pos.addScaledVector(sp.vel, delta);
          // Slow drift and spread
          sp.vel.x += (Math.random() - 0.5) * delta * 0.8;
          sp.vel.z += (Math.random() - 0.5) * delta * 0.8;
          sp.vel.y *= 1 - 0.3 * delta; // decelerate upward
          smokeDummy.position.copy(sp.pos);
          // Grow then fade: start small, expand to max, then shrink
          const lifeRatio = sp.life / sp.maxLife;
          const growPhase = Math.min(1, (1 - lifeRatio) * 4); // quick grow at start
          const fadePhase = Math.max(0, lifeRatio); // fade toward end
          const s = growPhase * fadePhase * 0.8;
          smokeDummy.scale.set(s, s, s);
          smokeDummy.updateMatrix();
          smokeMeshRef.current!.setMatrixAt(i, smokeDummy.matrix);
          needsUpdate = true;
        } else if (sp.pos.y > -100) {
          sp.pos.set(0, -1000, 0);
          smokeDummy.position.copy(sp.pos);
          smokeDummy.scale.set(0, 0, 0);
          smokeDummy.updateMatrix();
          smokeMeshRef.current!.setMatrixAt(i, smokeDummy.matrix);
          needsUpdate = true;
        }
      }
      if (needsUpdate) smokeMeshRef.current.instanceMatrix.needsUpdate = true;
    }

    // Alert ring visibility
    if (alertRingRef.current) {
      const showAlert = isAlerted && distToPlayer < 180;
      alertRingRef.current.visible = showAlert;
      if (showAlert) {
        const pulse = 0.5 + Math.sin(state.clock.elapsedTime * 6) * 0.3;
        (alertRingRef.current.material as THREE.MeshBasicMaterial).opacity = pulse;
      }
    }

    // Selection ring visibility
    if (selectRingRef.current) {
      const isSelected = selectedNpcId === identity.id;
      selectRingRef.current.visible = isSelected;
      if (isSelected) {
        selectRingRef.current.rotation.z = state.clock.elapsedTime * 0.5;
        const pulse = 0.4 + Math.sin(state.clock.elapsedTime * 3) * 0.15;
        (selectRingRef.current.material as THREE.MeshBasicMaterial).opacity = pulse;
      }
    }

    // Torch at night
    const theta = ((timeOfDay - 6) / 24) * Math.PI * 2;
    const sunH = Math.sin(theta);
    const torchIntensity = sunH < 0.15 ? Math.min(1, (0.15 - sunH) * 3) : 0;
    if (torchRef.current) {
      torchRef.current.intensity = torchIntensity * 2;
      torchRef.current.visible = torchIntensity > 0.01;
    }
    if (torchMeshRef.current) {
      torchMeshRef.current.emissiveIntensity = torchIntensity * 3;
      torchMeshRef.current.visible = torchIntensity > 0.01;
    }

    // Update live position for projectile hit detection
    npcLivePositions.set(identity.id, {
      x: currentPos.x,
      y: currentPos.y + 1.4,
      z: currentPos.z,
      radius: Math.max(3.2, identity.visual.scale * 4.0),
      flag: identity.flag,
      shipName: identity.shipName,
      hull: hullRef.current,
      maxHull: identity.maxHull,
      hitAlert: liveEntry?.hitAlert,
    });

    // ── Health bar (billboard toward camera) ──
    if (healthBarGroupRef.current) {
      const showBar = hullFrac < 1 && distToPlayer < 60;
      healthBarGroupRef.current.visible = showBar;
      if (showBar && healthBarFgRef.current) {
        healthBarFgRef.current.scale.x = Math.max(0.01, hullFrac);
        healthBarFgRef.current.position.x = -(1 - hullFrac) * 1.5;
        // Color: green → yellow → red
        const mat = healthBarFgRef.current.material as THREE.MeshBasicMaterial;
        if (hullFrac > 0.5) {
          mat.color.setRGB(1 - (hullFrac - 0.5) * 2, 1, 0);
        } else {
          mat.color.setRGB(1, hullFrac * 2, 0);
        }
        // Billboard: face camera
        healthBarGroupRef.current.lookAt(state.camera.position);
      }
    }
  });

  const handleClick = (e: any) => {
    e.stopPropagation();
    const now = Date.now();
    const { addNotification, playerMode } = useGameStore.getState();
    if (playerMode !== 'ship') return;
    // Toggle: click again to deselect
    if (selectedNpcId === identity.id) {
      selectedNpcId = null;
      return;
    }
    selectedNpcId = identity.id;
    selectionSetAt = now;
    if (now - lastClickToast.current < 2000) return; // debounce toast only
    lastClickToast.current = now;
    addNotification(`You see ${identity.appearancePhrase}.`, 'info');
  };

  return (
    <>
      <group ref={group} position={initialPosition} onClick={handleClick}>
        {/* Alert ring - orange circle when fleeing */}
        <mesh ref={alertRingRef} position={[0, 0.1, 0]} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
          <ringGeometry args={[3.5, 4, 32]} />
          <meshBasicMaterial color="#ff8800" transparent opacity={0.6} side={THREE.DoubleSide} />
        </mesh>
        {/* Selection ring - white circle when clicked */}
        <mesh ref={selectRingRef} position={[0, 0.15, 0]} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
          <ringGeometry args={[4, 4.4, 48]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.45} side={THREE.DoubleSide} />
        </mesh>
        {/* Health bar — appears when damaged */}
        <group ref={healthBarGroupRef} position={[0, 5.5, 0]} visible={false}>
          {/* Background (dark) */}
          <mesh position={[0, 0, -0.01]}>
            <planeGeometry args={[3, 0.3]} />
            <meshBasicMaterial color="#220000" transparent opacity={0.7} />
          </mesh>
          {/* Foreground (colored) */}
          <mesh ref={healthBarFgRef}>
            <planeGeometry args={[3, 0.25]} />
            <meshBasicMaterial color="#00ff00" />
          </mesh>
        </group>
        <NPCShipModel identity={identity} />
        {/* Night torch */}
        <group position={[0.5, 2.2, -1]}>
          <pointLight
            ref={torchRef}
            color="#ff8833"
            intensity={0}
            distance={15}
            decay={2}
          />
          <mesh>
            <sphereGeometry args={[0.08, 6, 6]} />
            <meshStandardMaterial
              ref={torchMeshRef}
              color="#ff6600"
              emissive="#ff8822"
              emissiveIntensity={0}
              toneMapped={false}
            />
          </mesh>
          <mesh position={[0, -0.3, 0]}>
            <cylinderGeometry args={[0.025, 0.025, 0.5]} />
            <meshStandardMaterial color="#3e2723" />
          </mesh>
        </group>
      </group>

      {/* Damage smoke — world-space particles rising from burning ship */}
      {smokeActive && (
        <instancedMesh ref={smokeMeshRef} args={[undefined, undefined, SMOKE_COUNT]} frustumCulled={false}>
          <sphereGeometry args={[0.8, 6, 6]} />
          <meshStandardMaterial
            color="#222222"
            transparent
            opacity={0.45}
            depthWrite={false}
          />
        </instancedMesh>
      )}

      {/* Sinking bubbles — world-space */}
      {bubblesActive && (
        <instancedMesh ref={bubbleMeshRef} args={[undefined, undefined, BUBBLE_COUNT]} frustumCulled={false}>
          <sphereGeometry args={[0.3, 6, 6]} />
          <meshStandardMaterial
            color="#aaddee"
            emissive="#668899"
            emissiveIntensity={0.3}
            transparent
            opacity={0.7}
          />
        </instancedMesh>
      )}
    </>
  );
}
