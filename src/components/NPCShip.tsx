import { useRef, useMemo, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore, WEAPON_DEFS, type Nationality, type Commodity, type WeaponType } from '../store/gameStore';
import type { NPCShipIdentity, NPCShipVisual } from '../utils/npcShipGenerator';
import { getLiveShipTransform } from '../utils/livePlayerTransform';
import { broadsideQueue, npcLivePositions, spawnProjectile } from '../utils/combatState';
import { getMeshHalf, getTerrainHeight } from '../utils/terrain';
import { sfxCannonFire, sfxShipSink } from '../audio/SoundEffects';
import { spawnSplash } from '../utils/splashState';
import { addCameraImpulse } from '../utils/cameraShakeState';
import { spawnWreckSalvage } from './WreckSalvage';
import { spawnFloatingCombatText } from './FloatingCombatText';
import { SEA_LEVEL } from '../constants/world';
import {
  COLLISION_REPUTATION_TARGET,
  cargoTemptationScore,
  chooseInitiativePosture,
  chooseProvokedPosture,
  npcBowWeapon,
  npcBroadsideCount,
  npcBroadsideWeapon,
  shouldStayHostile,
  type CollisionResponse,
  type WarningResponse,
  type NpcCombatPosture,
} from '../utils/npcCombat';

const APPROACH_RADIUS = 40;  // show "approaching" toast
const HAIL_RADIUS = 14;     // show "Press T to Talk" prompt — bumped with NPC visual scale (1.2×)
const COLLISION_RADIUS = 4.8; // bumped with NPC visual scale (1.2×) to match larger silhouettes
const NPC_NPC_COLLISION_RADIUS = 6;
const NPC_NPC_COLLISION_PUSH = 1.6;
const NPC_DRAFT_BLOCK_HEIGHT = -0.8;
const NPC_COLLISION_DAMAGE = 10;
const NPC_TARGET_RADIUS = 100;
const NPC_FLEE_TARGET_RADIUS = 80;
const WATER_TARGET_ATTEMPTS = 10;
const MAP_EDGE_MARGIN = 0.94;
const NPC_BOW_FIRE_RANGE = 62;
const NPC_BROADSIDE_MIN_RANGE = 24;
const NPC_BROADSIDE_MAX_RANGE = 105;
const NPC_BOW_FIRE_ARC = Math.PI / 6;
const NPC_BROADSIDE_FIRE_ARC = Math.PI / 4.5;
const NPC_LEAD_TIME = 0.7;
const NPC_FIRE_JITTER = 0.095;
const NPC_BROADSIDE_STAGGER_MS = 170;
const NPC_INTENT_LEAD_MS = 550;
const NPC_INTENT_TEXT_COOLDOWN_MS = 2500;

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

function angleDelta(a: number, b: number) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function npcProjectileSpeed(weaponType: WeaponType, distance: number) {
  if (WEAPON_DEFS[weaponType].aimable) return WEAPON_DEFS[weaponType].range * 3.25;
  const gravity = 24;
  const angleRad = THREE.MathUtils.degToRad(7.5);
  const sin2 = Math.max(0.12, Math.sin(angleRad * 2));
  return THREE.MathUtils.clamp(Math.sqrt((distance * gravity) / sin2), 32, 96);
}

function readablePostureLabel(posture: NpcCombatPosture, committed: boolean) {
  if (committed && (posture === 'engage' || posture === 'pursue' || posture === 'evade')) return 'Won\'t Back Down';
  if (posture === 'engage') return 'Attacking';
  if (posture === 'pursue') return 'Chasing';
  if (posture === 'evade') return 'Keeping Distance';
  if (posture === 'flee') return 'Running Away';
  if (posture === 'warn') return 'Warning';
  return null;
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

  // Boarding/capture may be added later; it is intentionally not implemented here.
  const alertUntil = useRef(0); // timestamp when alert ends
  const postureUntil = useRef(0);
  const combatPosture = useRef<NpcCombatPosture>('neutral');
  const hostileContact = useRef(false);
  const committedHostile = useRef(false);
  const lastProcessedHitAlert = useRef(0);
  const lastCollisionTime = useRef(0); // cooldown to prevent spam
  const collisionGrievanceCount = useRef(0);
  const lastCollisionHailTime = useRef(0);
  const nextInitiativeCheckAt = useRef(0);
  const nextInitiativeWarningAt = useRef(0);
  const nextBowFireAt = useRef(0);
  const nextBroadsideFireAt = useRef(0);
  const bowIntentReadyAt = useRef(0);
  const broadsideIntentReadyAt = useRef(0);
  const nextIntentTextAt = useRef(0);
  const lastShownPosture = useRef<NpcCombatPosture | null>(null);
  const ALERT_DURATION = 14000; // armed ships need time to maneuver into a firing lane
  const COLLISION_COOLDOWN = 2000; // match Ship.tsx's 2-second cooldown
  const INITIATIVE_CHECK_MS = 2200;
  const INITIATIVE_RADIUS = 145;
  const orbitSide = useRef(identity.id.charCodeAt(0) % 2 === 0 ? 1 : -1);

  const speed = useMemo(() => 2 + Math.random() * 3, []);
  const bowWeapon = useMemo(() => npcBowWeapon(identity), [identity]);
  const broadsideWeapon = useMemo(() => npcBroadsideWeapon(identity), [identity]);
  const broadsideCount = useMemo(() => npcBroadsideCount(identity), [identity]);

  const setCombatPosture = (posture: NpcCombatPosture, until: number) => {
    combatPosture.current = posture;
    const effectiveUntil = committedHostile.current && posture !== 'flee' ? Number.POSITIVE_INFINITY : until;
    postureUntil.current = effectiveUntil;
    alertUntil.current = Math.max(alertUntil.current, effectiveUntil);
    nextTargetSearchAt.current = 0;
  };

  const markProvoked = (reputation: number, hullFraction: number) => {
    hostileContact.current = true;
    if (shouldStayHostile(identity, { reputation, hullFraction })) {
      committedHostile.current = true;
    }
  };

  const showIntentText = (now: number, label: string, currentPos: THREE.Vector3) => {
    if (now < nextIntentTextAt.current) return;
    nextIntentTextAt.current = now + NPC_INTENT_TEXT_COOLDOWN_MS;
    spawnFloatingCombatText(currentPos.x, currentPos.y + 2.8, currentPos.z, label, 'intent');
    window.dispatchEvent(new CustomEvent('npc-incoming-fire-intent', {
      detail: {
        label,
        shipName: identity.shipName,
        x: currentPos.x,
        z: currentPos.z,
      },
    }));
  };

  const tryFireAtPlayer = (now: number, currentPos: THREE.Vector3, playerPos: readonly [number, number, number], playerRot: number, playerVel: number, distToPlayer: number) => {
    if (!identity.armed || sinking || hullRef.current <= 0) return;

    const playerForward = _avoidVec.current.set(Math.sin(playerRot), 0, Math.cos(playerRot));
    const predictedTarget = _tmpVec.current.set(
      playerPos[0] + playerForward.x * playerVel * NPC_LEAD_TIME,
      1.25,
      playerPos[2] + playerForward.z * playerVel * NPC_LEAD_TIME,
    );
    const aimVec = predictedTarget.clone().sub(new THREE.Vector3(currentPos.x, 1.25, currentPos.z));
    const horizontalDistance = Math.hypot(aimVec.x, aimVec.z);
    if (horizontalDistance < 0.001) return;

    const bearing = Math.atan2(aimVec.x, aimVec.z);
    const heading = group.current?.rotation.y ?? 0;

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
      sfxCannonFire();
    }
  };

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

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { npcId?: string; response?: CollisionResponse } | undefined;
      if (detail?.npcId !== identity.id) return;
      const now = Date.now();
      const hullFraction = hullRef.current / identity.maxHull;
      let posture: NpcCombatPosture;
      if (detail.response === 'apologize' || detail.response === 'pay') {
        posture = identity.armed && hullFraction > 0.35 ? 'evade' : 'flee';
      } else if (detail.response === 'threaten') {
        markProvoked(useGameStore.getState().getReputation(identity.flag) - 40, hullFraction);
        posture = chooseProvokedPosture(identity, {
          reputation: useGameStore.getState().getReputation(identity.flag) - 40,
          provoked: true,
          hullFraction,
        });
      } else {
        markProvoked(useGameStore.getState().getReputation(identity.flag), hullFraction);
        posture = identity.armed && identity.morale >= 55 && hullFraction > 0.35 ? 'engage' : 'flee';
      }
      setCombatPosture(posture, now + ALERT_DURATION);
      useGameStore.getState().addNotification(
        detail.response === 'apologize' || detail.response === 'pay'
          ? `The ${identity.shipName} keeps clear, still cursing your helm.`
          : posture === 'flee'
          ? `The ${identity.shipName} breaks away, shouting curses.`
          : `The ${identity.shipName} clears for action.`,
        'warning',
      );
    };
    window.addEventListener('npc-collision-response', handler);
    return () => window.removeEventListener('npc-collision-response', handler);
  }, [identity]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { npcId?: string; response?: WarningResponse } | undefined;
      if (detail?.npcId !== identity.id) return;
      const now = Date.now();
      const hullFraction = hullRef.current / identity.maxHull;
      let posture: NpcCombatPosture;
      if (detail.response === 'alterCourse' || detail.response === 'payToll') {
        posture = 'evade';
      } else if (detail.response === 'threaten') {
        markProvoked(useGameStore.getState().getReputation(identity.flag) - 35, hullFraction);
        posture = chooseProvokedPosture(identity, {
          reputation: useGameStore.getState().getReputation(identity.flag) - 35,
          provoked: true,
          hullFraction,
        });
      } else {
        markProvoked(useGameStore.getState().getReputation(identity.flag), hullFraction);
        posture = identity.armed && identity.morale >= 45 && hullFraction > 0.35 ? 'pursue' : 'evade';
      }
      setCombatPosture(posture, now + ALERT_DURATION);
      useGameStore.getState().addNotification(
        posture === 'evade'
          ? `The ${identity.shipName} sheers off but keeps watch.`
          : `The ${identity.shipName} presses closer, ready for violence.`,
        'warning',
      );
    };
    window.addEventListener('npc-warning-response', handler);
    return () => window.removeEventListener('npc-warning-response', handler);
  }, [identity]);

  useFrame((state, delta) => {
    if (!group.current) return;
    // Freeze NPC AI + movement while the game is paused (e.g. hail modal open).
    // Allow the active sinking animation to continue so a ship in its death
    // throes doesn't visibly freeze mid-roll if the player pauses for UI.
    if (useGameStore.getState().paused && !sinking) return;

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
    const playerTransformLive = getLiveShipTransform();
    const playerPos = playerTransformLive.pos;

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

    const { playerMode, timeOfDay, addNotification, interactionPrompt, setInteractionPrompt, adjustReputation, getReputation, setNearestHailableNpc, defeatedNpc, nearestHailableNpc, cargo, stats, ship } = useGameStore.getState();

    // ── Check for hull damage from projectile hits ──
    const liveEntry = npcLivePositions.get(identity.id);
    if (liveEntry && liveEntry.hull < hullRef.current) {
      hullRef.current = liveEntry.hull;
      // Ship destroyed?
      if (hullRef.current <= 0) {
        setSinking(true);
        setBubblesActive(true);
        sfxShipSink();
        spawnWreckSalvage(currentPos.x, currentPos.z, identity.shipName, identity.id, identity.cargo as Partial<Record<Commodity, number>>);
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

      const factionReputation = getReputation(identity.flag);
      const canHail = !hostileContact.current && combatPosture.current === 'neutral' && factionReputation > -60;

      // Hail prompt — only claim the slot if no other NPC already holds it
      if (canHail && distToPlayer < HAIL_RADIUS && !inHailRange.current) {
        if (!nearestHailableNpc) {
          inHailRange.current = true;
          setInteractionPrompt('Press T to Hail');
          setNearestHailableNpc(identity);
        }
      }
      if ((!canHail || distToPlayer > HAIL_RADIUS * 1.2) && inHailRange.current) {
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
        const alreadyHostile = hostileContact.current || getReputation(identity.flag) <= -60;
        window.dispatchEvent(new CustomEvent('ship-collision', {
          detail: {
            appearancePhrase: identity.appearancePhrase,
            nx, nz,
            impulseMag,
            approachSpeed,
          },
        }));
        collisionGrievanceCount.current += 1;
        if (!alreadyHostile && now - lastCollisionHailTime.current > 9000) {
          lastCollisionHailTime.current = now;
          window.dispatchEvent(new CustomEvent('npc-collision-hail', {
            detail: {
              npc: identity,
              collisionCount: collisionGrievanceCount.current,
            },
          }));
        }
        // Camera nudge — one-shot directional push away from the ram point.
        addCameraImpulse(-nx, -nz, Math.min(1.8, 0.45 + approachSpeed * 0.22));
        hullRef.current = Math.max(0, hullRef.current - NPC_COLLISION_DAMAGE);
        if (liveEntry) liveEntry.hull = hullRef.current;
        adjustReputation(identity.flag, COLLISION_REPUTATION_TARGET.ram - getReputation(identity.flag));

        if (hullRef.current <= 0) {
          if (liveEntry) liveEntry.sunk = true;
          setSinking(true);
          setBubblesActive(true);
          sfxShipSink();
          spawnWreckSalvage(currentPos.x, currentPos.z, identity.shipName, identity.id, identity.cargo as Partial<Record<Commodity, number>>);
          defeatedNpc(identity.id, identity.shipName, identity.flag as Nationality, identity.cargo as Partial<Record<Commodity, number>>);
          return;
        }

        const hullPct = Math.round((hullRef.current / identity.maxHull) * 100);
        addNotification(
          collisionGrievanceCount.current > 1
            ? `Rammed the ${identity.shipName} again! They take it as deliberate. Hull: ${hullPct}%`
            : `Rammed the ${identity.shipName}! Hull: ${hullPct}%`,
          'warning',
        );
      }

      const posture = chooseProvokedPosture(identity, {
        reputation: getReputation(identity.flag),
        provoked: true,
        hullFraction: hullRef.current / identity.maxHull,
      });
      markProvoked(getReputation(identity.flag), hullRef.current / identity.maxHull);
      setCombatPosture(posture, now + ALERT_DURATION);
      if (posture === 'flee') {
        targetRef.current.set(
          currentPos.x + nx * 80, 0, currentPos.z + nz * 80
        );
      }
    }

    // Check for projectile hit alert from combat system
    if (liveEntry?.hitAlert && Date.now() < liveEntry.hitAlert && liveEntry.hitAlert > lastProcessedHitAlert.current) {
      lastProcessedHitAlert.current = liveEntry.hitAlert;
      markProvoked(getReputation(identity.flag), hullRef.current / identity.maxHull);
      const posture = chooseProvokedPosture(identity, {
        reputation: getReputation(identity.flag),
        provoked: true,
        hullFraction: hullRef.current / identity.maxHull,
      });
      setCombatPosture(posture, liveEntry.hitAlert);
    }

    const now = Date.now();
    if (now >= postureUntil.current && combatPosture.current !== 'neutral') {
      combatPosture.current = 'neutral';
    }
    const activePosture = combatPosture.current;
    const isAlerted = activePosture !== 'neutral' || now < alertUntil.current;
    if (activePosture !== lastShownPosture.current) {
      lastShownPosture.current = activePosture;
      const postureLabel = readablePostureLabel(activePosture, committedHostile.current);
      if (postureLabel && distToPlayer < 165) {
        spawnFloatingCombatText(currentPos.x, currentPos.y + 3.1, currentPos.z, postureLabel, 'intent');
      }
    }

    if (
      playerMode === 'ship' &&
      activePosture === 'neutral' &&
      distToPlayer < INITIATIVE_RADIUS &&
      now >= nextInitiativeCheckAt.current
    ) {
      nextInitiativeCheckAt.current = now + INITIATIVE_CHECK_MS;
      const initiative = chooseInitiativePosture(identity, {
        reputation: getReputation(identity.flag),
        hullFraction: hullRef.current / identity.maxHull,
        playerFlag: ship.flag,
        cargoTemptation: cargoTemptationScore(cargo, stats.cargoCapacity),
      });
      if (initiative === 'warn' && now >= nextInitiativeWarningAt.current) {
        nextInitiativeWarningAt.current = now + ALERT_DURATION;
        if (hostileContact.current || getReputation(identity.flag) <= -60) {
          setCombatPosture(identity.armed ? 'pursue' : 'flee', now + ALERT_DURATION);
        } else {
          setCombatPosture('pursue', now + ALERT_DURATION);
          window.dispatchEvent(new CustomEvent('npc-warning-hail', {
            detail: { npc: identity },
          }));
        }
      } else if (initiative === 'flee') {
        setCombatPosture('flee', now + ALERT_DURATION);
      }
    }

    if (playerMode === 'ship' && (activePosture === 'engage' || activePosture === 'pursue' || activePosture === 'evade')) {
      tryFireAtPlayer(now, currentPos, playerPos, playerTransformLive.rot, playerTransformLive.vel, distToPlayer);
    }

    // ── Movement AI ──
    if (activePosture === 'flee' || (isAlerted && activePosture === 'neutral')) {
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
    } else if (activePosture === 'evade') {
      // Keep distance, but angle off rather than running straight away. Phase 3
      // will let these ships fire while doing this.
      const awayDir = _tmpVec.current.set(
        currentPos.x - playerPos[0], 0, currentPos.z - playerPos[2]
      ).normalize();
      if (now >= nextTargetSearchAt.current) {
        const evadeAngle = Math.atan2(awayDir.x, awayDir.z) + orbitSide.current * Math.PI * 0.28;
        const waterTarget = findWaterTarget(currentPos.x, currentPos.z, NPC_FLEE_TARGET_RADIUS, evadeAngle);
        if (waterTarget) {
          targetRef.current.set(waterTarget[0], 0, waterTarget[1]);
        } else {
          targetRef.current.set(
            currentPos.x + awayDir.x * 36, 0, currentPos.z + awayDir.z * 36
          );
        }
        nextTargetSearchAt.current = now + 650;
      }
    } else if (activePosture === 'engage' || activePosture === 'pursue') {
      // Hold a rough fighting band instead of fleeing. This is movement-only
      // until the Phase 3 weapon-firing work lands.
      const toPlayer = _tmpVec.current.set(
        playerPos[0] - currentPos.x, 0, playerPos[2] - currentPos.z
      );
      const dist = Math.max(toPlayer.length(), 0.001);
      toPlayer.normalize();
      if (now >= nextTargetSearchAt.current) {
        let targetAngle: number;
        if (dist > 90) {
          targetAngle = Math.atan2(toPlayer.x, toPlayer.z);
        } else if (dist < 45) {
          targetAngle = Math.atan2(-toPlayer.x, -toPlayer.z);
        } else {
          targetAngle = Math.atan2(toPlayer.x, toPlayer.z) + orbitSide.current * Math.PI * 0.5;
        }
        const targetRadius = dist > 90 ? 44 : 30;
        const waterTarget = findWaterTarget(currentPos.x, currentPos.z, targetRadius, targetAngle);
        if (waterTarget) {
          targetRef.current.set(waterTarget[0], 0, waterTarget[1]);
        }
        nextTargetSearchAt.current = now + 650;
      }
    } else {
      const dist = currentPos.distanceTo(targetRef.current);
      if (dist < 5) {
        const waterTarget = findWaterTarget(currentPos.x, currentPos.z, NPC_TARGET_RADIUS);
        if (waterTarget) targetRef.current.set(waterTarget[0], 0, waterTarget[1]);
      }
    }

    const currentSpeed = activePosture === 'flee'
      ? speed * 2.5
      : activePosture === 'evade'
        ? speed * 1.7
        : activePosture === 'engage' || activePosture === 'pursue'
          ? speed * 1.25
          : speed;

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
