import { useRef, useState, useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGameStore, getRoleBonus, captainHasTrait } from '../store/gameStore';
import * as THREE from 'three';
import { getTerrainHeight, getMeshHalf } from '../utils/terrain';
import { Billboard, Text } from '@react-three/drei';
import { FACTIONS } from '../constants/factions';
import { sfxShoreCollision, sfxShipCollision, sfxCastNet, sfxHaulNet, sfxAnchorWeigh, sfxSailsCatch, sfxTreasureFind } from '../audio/SoundEffects';
import { rollFishCatch, rollManualCast } from '../utils/fishTypes';
import { playLootSfx } from '../utils/lootRoll';
import { syncLiveShipTransform } from '../utils/livePlayerTransform';
import { swivelAimAngle, swivelAimPitch, broadsideReload, getCurrentElevationCharge } from '../utils/combatState';
import { touchShipInput } from '../utils/touchInput';
import { spawnSplash } from '../utils/splashState';
import { getWindTrimInfo, getWindTrimMultiplier } from '../utils/wind';
import { useIsMobile } from '../utils/useIsMobile';
import { getShipProfile, type SailConfig } from '../utils/shipProfiles';
import { COMMODITY_DEFS, type Commodity } from '../utils/commodities';

// Mobile tap-to-steer feels unmanageable at full desktop speed — scale down so
// course corrections actually have time to register. Tuned by playtest.
const MOBILE_SPEED_SCALE = 0.55;

const SHIP_ROOT_Y = -0.3;
const STORE_SYNC_INTERVAL = 1 / 12;

/**
 * Triangular lateen sail + diagonal yard. The yard runs through the group
 * ORIGIN (local x=0, spanning ±height/2 along Y). The whole group tilts by
 * `sail.roll` around Z — since the yard passes through the origin, it stays
 * attached to the mast regardless of roll angle. The clew extends along +X
 * (flipped to -X for positive roll, i.e. the Dhow mizzen mirror).
 *
 * `sail.height` is the yard length (long axis of the triangle).
 * `sail.width`  is the leech extent (how far the clew sweeps from the yard).
 *
 * Position the group at the point where the yard crosses the mast — usually
 * about 1/3 from the masthead.
 */
function LateenSailMesh({
  sail,
  fallbackColor,
  yardColor,
}: {
  sail: SailConfig;
  fallbackColor: string;
  yardColor: string;
}) {
  const roll = sail.roll ?? -0.46;
  const mirrored = roll > 0;

  const geometry = useMemo(() => {
    const w = sail.width;
    const h = sail.height;
    const clewX = mirrored ? -w : w;
    const shape = new THREE.Shape();
    shape.moveTo(0, h * 0.5);          // head — top of yard
    shape.lineTo(0, -h * 0.5);         // tack — bottom of yard
    shape.lineTo(clewX, -h * 0.15);    // clew — extends lateral, slightly low
    shape.closePath();
    return new THREE.ShapeGeometry(shape);
  }, [sail.width, sail.height, mirrored]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <group position={sail.position} rotation={[0, 0, roll]}>
      <mesh geometry={geometry} castShadow>
        <meshStandardMaterial
          color={sail.color ?? fallbackColor}
          roughness={1}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Yard — vertical cylinder at the origin, crosses the mast after the
          group's Z-rotation tilts it into a diagonal spar. */}
      <mesh position={[0, 0, 0.02]} castShadow>
        <cylinderGeometry args={[0.05, 0.05, sail.height * 1.08, 7]} />
        <meshStandardMaterial color={yardColor} roughness={0.85} />
      </mesh>
    </group>
  );
}

/**
 * Build a narrow triangular pennant as a subdivided PlaneGeometry tapered to
 * a point. Hoist along local X=0; fly tip at X=length. Enough segments along
 * X for a visible travelling wave; 1 segment in Y (pennants are skinny so the
 * vertical bend is negligible).
 */
function buildPennantGeometry(length: number, height: number) {
  const geo = new THREE.PlaneGeometry(length, height, 10, 1);
  const arr = geo.attributes.position.array as Float32Array;
  const halfLen = length * 0.5;
  // Taper: scale each vert's Y by (1 - xNorm) so the fly end collapses to a
  // point, leaving a triangular silhouette while keeping the subdivision grid.
  for (let i = 0; i < arr.length; i += 3) {
    const bx = arr[i];
    const xNorm = (bx + halfLen) / length; // 0 at hoist, 1 at fly
    arr[i + 1] *= 1 - xNorm;
    // Shift so hoist edge sits at local x=0 (group position is the hoist point)
    arr[i] = bx + halfLen;
  }
  geo.attributes.position.needsUpdate = true;
  return geo;
}

export function Ship() {
  const group = useRef<THREE.Group>(null);
  const visualGroup = useRef<THREE.Group>(null);
  const hullMaterialRef = useRef<THREE.MeshStandardMaterial>(null);
  const torchLightRef = useRef<THREE.PointLight>(null);
  const torchMeshRef = useRef<THREE.MeshStandardMaterial>(null);
  const sailRefs = useRef<(THREE.Mesh | null)[]>([]);
  const setPlayerTransform = useGameStore((state) => state.setPlayerTransform);
  const stats = useGameStore((state) => state.stats);
  const playerMode = useGameStore((state) => state.playerMode);
  const damageShip = useGameStore((state) => state.damageShip);
  const addNotification = useGameStore((state) => state.addNotification);
  const paused = useGameStore((state) => state.paused);
  const shipType = useGameStore((state) => state.ship.type);
  const profile = useMemo(() => getShipProfile(shipType), [shipType]);
  // Cargo-based draft: heavier loads make the ship sit deeper in the water.
  // Empty = full lift (+0.22), fully loaded = no lift (hull rides at SHIP_ROOT_Y,
  // which is tuned so water laps the deck on the dhow).
  const cargo = useGameStore((state) => state.cargo);
  const cargoDraftLift = useMemo(() => {
    const weight = Object.entries(cargo).reduce(
      (sum, [c, qty]) => sum + (qty as number) * COMMODITY_DEFS[c as Commodity].weight,
      0,
    );
    const frac = Math.min(1, weight / Math.max(1, stats.cargoCapacity));
    return (1 - frac) * 0.22;
  }, [cargo, stats.cargoCapacity]);
  const { isMobile } = useIsMobile();
  
  // Physics state
  const velocity = useRef(0);
  const rotation = useRef(0);
  const previousHeading = useRef(0);
  const heel = useRef(0);
  const heelVelocity = useRef(0);
  const yawSlide = useRef(0); // visual drift slip — hull lags physics heading
  const prevVelocity = useRef(0); // for throttle weight-transfer pitch
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
  // Inner pivot for barrel pitch — kept separate so the mounting post stays
  // vertical while the barrel tilts up/down with the cursor.
  const swivelPitchRef = useRef<THREE.Group>(null);
  const muzzleFlashRef = useRef<THREE.InstancedMesh>(null);
  const muzzleParticles = useRef<{ pos: THREE.Vector3; vel: THREE.Vector3; life: number }[]>([]);
  const MUZZLE_PARTICLE_COUNT = 20;

  // Broadside arc indicators
  const portArcPivotRef = useRef<THREE.Group>(null);
  const starboardArcPivotRef = useRef<THREE.Group>(null);
  const portArcRef = useRef<THREE.Mesh>(null);
  const starboardArcRef = useRef<THREE.Mesh>(null);

  // Sailing sound triggers (cooldown-gated one-shots)
  const sailsCaughtRef = useRef(false); // true once we pass 40% speed, resets when below 20%
  const lastCreakTime = useRef(0);

  // Hard-turn spray — arcade feel when banking at speed.
  // Two particle kinds share the pool: 'arc' (high spray plume) and
  // 'foam' (low, wide patches that cling to the waterline).
  const spraySideRef = useRef<THREE.InstancedMesh>(null);
  const sprayData = useRef<{pos: THREE.Vector3, vel: THREE.Vector3, life: number, maxLife: number, foam: boolean}[]>([]);
  const SPRAY_COUNT = 44;

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

  // Mast flag — geometry scales with hull length so Pinnaces don't fly
  // Galleon-sized banners. Baseline 1.4 × 0.9 tuned for a ~5m hull.
  const flagMeshRef = useRef<THREE.Mesh>(null);
  const flagPivotRef = useRef<THREE.Group>(null);
  const flagScale = useMemo(
    () => THREE.MathUtils.clamp(profile.hull.length / 5.0, 0.75, 1.25),
    [profile],
  );
  const flagGeometry = useMemo(
    () => new THREE.PlaneGeometry(1.4 * flagScale, 0.9 * flagScale, 10, 6),
    [flagScale],
  );
  const flagBase = useMemo(
    () => Float32Array.from(flagGeometry.attributes.position.array as Float32Array),
    [flagGeometry]
  );
  const flagWindAngle = useRef(0);

  // Pennant color — use the faction's base flag color so streamers read as
  // the captain's colors. If that color is too light to show against sky
  // (e.g. English/French/Japanese white fields), fall back to the device
  // color so the pennant stays visible.
  const pennantColor = useMemo(() => {
    const faction = FACTIONS[shipFlag];
    if (!faction) return profile.hull.trimColor;
    const [c1, c2] = faction.colors;
    const lum = (hex: string) => {
      const n = parseInt(hex.slice(1), 16);
      const r = (n >> 16) & 0xff;
      const g = (n >> 8) & 0xff;
      const b = n & 0xff;
      return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    };
    return lum(c1) > 0.82 ? c2 : c1;
  }, [shipFlag, profile.hull.trimColor]);

  // Per-sail painted decals. Only renders a texture when the sail has a
  // matching decal declared in the profile AND the ship's flag allows it
  // (Order of Christ is Portuguese-only — an English caravel just flies plain
  // canvas). Returns an array aligned with profile.sails: each entry is a
  // THREE.CanvasTexture or null.
  const sailTextures = useMemo(() => {
    return profile.sails.map((sail) => {
      if (sail.decal !== 'cross_of_christ') return null;
      if (shipFlag !== 'Portuguese') return null;
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 160;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      // Canvas field — match the sail cloth color so seams disappear
      ctx.fillStyle = sail.color ?? profile.hull.sailColor;
      ctx.fillRect(0, 0, 128, 160);
      // Order of Christ cross — broad red cross with flared arm ends, white
      // inlay bar down the middle. Centered on the sail, sized ~60% of width.
      const cx = 64;
      const cy = 80;
      const armLen = 40;
      const armThick = 14;
      const flareOut = 6;
      ctx.fillStyle = '#B4161B'; // deep crimson
      // Vertical arm
      ctx.beginPath();
      ctx.moveTo(cx - armThick / 2 - flareOut, cy - armLen);
      ctx.lineTo(cx + armThick / 2 + flareOut, cy - armLen);
      ctx.lineTo(cx + armThick / 2, cy - armLen + flareOut);
      ctx.lineTo(cx + armThick / 2, cy + armLen - flareOut);
      ctx.lineTo(cx + armThick / 2 + flareOut, cy + armLen);
      ctx.lineTo(cx - armThick / 2 - flareOut, cy + armLen);
      ctx.lineTo(cx - armThick / 2, cy + armLen - flareOut);
      ctx.lineTo(cx - armThick / 2, cy - armLen + flareOut);
      ctx.closePath();
      ctx.fill();
      // Horizontal arm
      ctx.beginPath();
      ctx.moveTo(cx - armLen, cy - armThick / 2 - flareOut);
      ctx.lineTo(cx - armLen, cy + armThick / 2 + flareOut);
      ctx.lineTo(cx - armLen + flareOut, cy + armThick / 2);
      ctx.lineTo(cx + armLen - flareOut, cy + armThick / 2);
      ctx.lineTo(cx + armLen, cy + armThick / 2 + flareOut);
      ctx.lineTo(cx + armLen, cy - armThick / 2 - flareOut);
      ctx.lineTo(cx + armLen - flareOut, cy - armThick / 2);
      ctx.lineTo(cx - armLen + flareOut, cy - armThick / 2);
      ctx.closePath();
      ctx.fill();
      // White inlay — thin cross inside the red one
      ctx.fillStyle = '#F5F1DC';
      ctx.fillRect(cx - 2, cy - armLen + 4, 4, armLen * 2 - 8);
      ctx.fillRect(cx - armLen + 4, cy - 2, armLen * 2 - 8, 4);
      const tex = new THREE.CanvasTexture(canvas);
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      return tex;
    });
  }, [profile, shipFlag]);

  useEffect(() => {
    return () => {
      sailTextures.forEach((t) => t?.dispose());
    };
  }, [sailTextures]);

  // Oculus (painted eye) texture for junks. White sclera + dark pupil with
  // a red surround ring, painted over a hull-colored plank background so it
  // reads as paint on the hull rather than a decal stuck on top.
  const oculusTexture = useMemo(() => {
    if (!profile.hull.hasOculus) return null;
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = profile.hull.hullColor;
    ctx.fillRect(0, 0, 128, 128);
    // Red rim (almond shape)
    ctx.fillStyle = '#8a2a1a';
    ctx.beginPath();
    ctx.ellipse(64, 64, 58, 42, 0, 0, Math.PI * 2);
    ctx.fill();
    // White sclera
    ctx.fillStyle = '#f0e8d2';
    ctx.beginPath();
    ctx.ellipse(64, 64, 48, 34, 0, 0, Math.PI * 2);
    ctx.fill();
    // Iris ring (dark amber)
    ctx.fillStyle = '#3a1a0a';
    ctx.beginPath();
    ctx.arc(64, 64, 22, 0, Math.PI * 2);
    ctx.fill();
    // Pupil (black)
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.arc(64, 64, 11, 0, Math.PI * 2);
    ctx.fill();
    // Highlight fleck
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(58, 58, 3, 0, Math.PI * 2);
    ctx.fill();
    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    return tex;
  }, [profile]);
  useEffect(() => () => oculusTexture?.dispose(), [oculusTexture]);

  // Pennants — one per non-main mast when profile.hasPennants. Each gets its
  // own subdivided geometry and a cached base array so the animation loop can
  // rewrite Z without reallocating. Pivot groups rotate around Y to trail the
  // same apparent wind the main flag uses.
  const pennants = useMemo(() => {
    if (!profile.hasPennants) return [];
    return profile.masts.slice(1).map((mast) => {
      const length = THREE.MathUtils.clamp(mast.height * 0.18, 0.55, 1.1);
      const height = length * 0.22;
      const geometry = buildPennantGeometry(length, height);
      const base = Float32Array.from(geometry.attributes.position.array as Float32Array);
      return {
        mastIdx: null as number | null,
        length,
        height,
        geometry,
        base,
        topY: mast.position[1] + mast.height * 0.5 + 0.12,
        z: mast.position[2],
      };
    });
  }, [profile]);
  const pennantMeshRefs = useRef<(THREE.Mesh | null)[]>([]);
  const pennantPivotRefs = useRef<(THREE.Group | null)[]>([]);

  // Per-sail geometry + cached base positions, keyed to profile.sails order.
  const sailGeometries = useMemo(
    () =>
      profile.sails.map(
        (s) =>
          new THREE.PlaneGeometry(s.width, s.height, s.segmentsX ?? 10, s.segmentsY ?? 12),
      ),
    [profile],
  );
  const sailBases = useMemo(
    () =>
      sailGeometries.map(
        (g) => Float32Array.from(g.attributes.position.array as Float32Array),
      ),
    [sailGeometries],
  );
  const normalFrame = useRef(0);

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
    // Initialize hard-turn spray particles
    for (let i = 0; i < SPRAY_COUNT; i++) {
      sprayData.current.push({
        pos: new THREE.Vector3(0, -1000, 0),
        vel: new THREE.Vector3(),
        life: 0,
        maxLife: 1,
        foam: false,
      });
    }
  }, []);

  useEffect(() => {
    return () => {
      sailGeometries.forEach((g) => g.dispose());
      flagGeometry.dispose();
      pennants.forEach((p) => p.geometry.dispose());
      if (exclamationTimer.current) clearTimeout(exclamationTimer.current);
    };
  }, [sailGeometries, flagGeometry, pennants]);

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

      // Elastic bounce: NPCShip supplies a contact normal (from player → NPC)
      // plus the impulse magnitude. Push the player along -n so both ships
      // separate realistically, bleed forward speed, heel into the impact.
      if (
        typeof detail?.nx === 'number' &&
        typeof detail?.nz === 'number' &&
        typeof detail?.impulseMag === 'number'
      ) {
        const nx = detail.nx as number;
        const nz = detail.nz as number;
        const approachSpeed = (detail.approachSpeed as number) ?? 0;
        // Minimum felt bounce so even a soft touch registers.
        const pushMag = Math.max(detail.impulseMag as number, 3);
        recoilVelX.current += -nx * pushMag;
        recoilVelZ.current += -nz * pushMag;
        // Bleed forward speed — not to zero (that's for shore); ship keeps inertia.
        velocity.current *= 0.55;
        // Heel away from impact side for a "knocked sideways" read.
        const rotHere = rotation.current;
        const localRight = nx * Math.cos(rotHere) - nz * Math.sin(rotHere);
        heelVelocity.current += -localRight * Math.min(0.35, 0.12 + approachSpeed * 0.06);
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
      const aimPitch = swivelAimPitch;
      // Gun mount is at bow (z=3.0 in local space); barrel tip is 1.2 units
      // along the aim direction, lifted by sin(pitch) so muzzle effects come
      // from the actual barrel mouth instead of below it on a high-arc shot.
      const bowX = shipPos.x + Math.sin(shipRot) * 3.0;
      const bowZ = shipPos.z + Math.cos(shipRot) * 3.0;
      const cosP = Math.cos(aimPitch);
      const sinP = Math.sin(aimPitch);
      const muzzleX = bowX + Math.sin(aimAngle) * cosP * 1.2;
      const muzzleZ = bowZ + Math.cos(aimAngle) * cosP * 1.2;
      const muzzleY = 1.8 + sinP * 1.2;

      // Spark/smoke velocity follows the barrel direction (yaw + pitch).
      const dirX = Math.sin(aimAngle) * cosP;
      const dirY = sinP;
      const dirZ = Math.cos(aimAngle) * cosP;

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
          dirX * speed + (Math.random() - 0.5) * spread * speed,
          dirY * speed + (isSpark ? 2 + Math.random() * 3 : 1 + Math.random() * 2),
          dirZ * speed + (Math.random() - 0.5) * spread * speed
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

    // Effective input: touch overlays keyboard (keyboard wins when held).
    // In 'tap' mode, a target heading synthesises A/D. In 'joystick' mode,
    // the joystick's x/y axes map directly onto A/D/W/S.
    const steerMode = store.shipSteeringMode;
    let touchW = false, touchS = false, touchA = false, touchD = false;
    if (steerMode === 'tap') {
      touchW = store.touchSailRaised;
      if (touchShipInput.targetHeading !== null) {
        const diff = Math.atan2(
          Math.sin(touchShipInput.targetHeading - rotation.current),
          Math.cos(touchShipInput.targetHeading - rotation.current),
        );
        if (diff > 0.03) touchA = true;
        else if (diff < -0.03) touchD = true;
        else {
          // Heading matched — clear the target so the ship stops micro-correcting.
          touchShipInput.targetHeading = null;
        }
      }
    } else {
      const JOY_DEAD = 0.2;
      if (touchShipInput.throttleInput > JOY_DEAD) touchW = true;
      else if (touchShipInput.throttleInput < -JOY_DEAD) touchS = true;
      if (touchShipInput.turnInput < -JOY_DEAD) touchA = true;
      else if (touchShipInput.turnInput > JOY_DEAD) touchD = true;
    }
    const inW = keys.current.w || touchW;
    const inS = keys.current.s || touchS;
    const inA = keys.current.a || touchA;
    const inD = keys.current.d || touchD;
    const inShift = keys.current.shift;

    if (playerMode === 'ship' && !paused && !store.activePort) {
      // Acceleration and Inertia
      const navBonus = getRoleBonus(store, 'Navigator', 'perception');
      const seaLegsBonus = captainHasTrait(store, 'Sea Legs') ? 1.05 : 1.0;
      const mobileScale = isMobile ? MOBILE_SPEED_SCALE : 1;
      const baseMaxSpeed = stats.speed * navBonus * seaLegsBonus * mobileScale;
      const windTrim = getWindTrimInfo(store.windDirection, rotation.current, stats.windward);
      // Wind trim requires going straight — Shift while turning is drift, not boost.
      const wantsWindTrim = inShift && inW && velocity.current > 0.5
        && !inA && !inD;
      const windTrimActive = wantsWindTrim && windTrim.score > 0;
      const windTrimLerp = 1 - Math.exp(-delta * (windTrimActive ? 2.4 : 4.2));
      windTrimCharge.current = THREE.MathUtils.lerp(
        windTrimCharge.current,
        windTrimActive ? 1 : 0,
        windTrimLerp,
      );
      const windTrimMultiplier = getWindTrimMultiplier(store.windSpeed, windTrim.score, windTrimCharge.current);
      // Close-hauled penalty — when the bow is pointed beyond the ship's
      // reach angle (windTrim.score === 0, i.e. "in irons"), speed floors at
      // a windward-dependent fraction of top speed. A lateen dhow still
      // makes real progress beating upwind (~55%); a square-rigged galleon
      // is reduced to a crawl (~31%). Within the reach/good/full trim
      // zones, the penalty is 1.0 and current behavior is unchanged.
      const ironsFactor = windTrim.score > 0
        ? 1.0
        : 0.15 + stats.windward * 0.45;
      const maxSpeed = baseMaxSpeed * windTrimMultiplier * ironsFactor;
      const accel = 7.5 * delta;
      const drag = 2.4 * delta;

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
      } else if (inW) {
        const trimAcceleration = windTrimActive ? 1 + windTrim.score * 0.6 : 1;
        // Only accelerate up to maxSpeed — don't snap velocity down if we're
        // already overspeed (e.g. boost just ended). The overspeed handler
        // below ramps that case smoothly via drag.
        if (velocity.current < maxSpeed) {
          velocity.current = Math.min(velocity.current + accel * trimAcceleration, maxSpeed);
        }
      } else if (inS) {
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

      // Turning (only turn if moving, or turn slowly if stopped).
      // Drift: Shift+A/D gives a tighter turn radius — no speed penalty,
      // just a sharper response for expressive piloting.
      const isDrifting = inShift && (inA || inD);
      const turnFactor = Math.abs(velocity.current) > 0.1 ? 1 : 0.2;
      const driftTurnMult = isDrifting ? 1.3 : 1;
      const turnSpeed = stats.turnSpeed * delta * turnFactor * driftTurnMult;

      if (inA) rotation.current += turnSpeed;
      if (inD) rotation.current -= turnSpeed;

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

      // ── Hard turn: spray + hull foam ──
      // Intensity combines turn input and speed so it only fires when the
      // player is actively banking at pace. Drifting (Shift+A/D) lowers the
      // bar and amplifies the effect — even mid-speed drifts throw big spray.
      const turnKey = (inA ? 1 : 0) - (inD ? 1 : 0);
      const turnIntensity = Math.abs(turnKey) * spdRatio;
      const HARD_TURN_THRESH = isDrifting ? 0.15 : 0.4;
      if (turnIntensity > HARD_TURN_THRESH && !store.anchored) {
        const rawStrength = (turnIntensity - HARD_TURN_THRESH) / Math.max(0.01, 1 - HARD_TURN_THRESH);
        const emitStrength = Math.min(1, isDrifting ? rawStrength + 0.45 : rawStrength);
        const outerSide = turnKey; // +1 = starboard (left turn), -1 = port (right turn)
        const rot = rotation.current;
        const shipRightX = Math.cos(rot);
        const shipRightZ = -Math.sin(rot);
        const fwdX = Math.sin(rot);
        const fwdZ = Math.cos(rot);
        const baseX = group.current.position.x + fwdX * -0.5;
        const baseZ = group.current.position.z + fwdZ * -0.5;

        // Mix arc spray (upward plume) with hull-hugging foam patches.
        // Foam particles outnumber arc 2:1 — they're the waterline kick that
        // reads as real hydrodynamic displacement; arc adds sparkle on top.
        const maxSpawns = isDrifting ? 4 : 3;
        const spawns = Math.random() < (0.3 + emitStrength * 0.6) ? maxSpawns : Math.max(1, maxSpawns - 1);
        for (let s = 0; s < spawns; s++) {
          let slot = -1;
          for (let i = 0; i < SPRAY_COUNT; i++) {
            if (sprayData.current[i].life <= 0) { slot = i; break; }
          }
          if (slot < 0) break;
          const p = sprayData.current[slot];
          const isFoam = s !== 0; // first spawn per frame is arc, rest are foam
          const alongScatter = (Math.random() - 0.5) * 3.5;
          const sideDist = 1.25 + Math.random() * 0.35;
          if (isFoam) {
            // Foam clings to the waterline and spreads outward along the hull.
            p.pos.set(
              baseX + fwdX * alongScatter + shipRightX * outerSide * sideDist,
              0.04 + Math.random() * 0.05,
              baseZ + fwdZ * alongScatter + shipRightZ * outerSide * sideDist,
            );
            const outward = 0.9 + emitStrength * 1.1 + Math.random() * 0.5;
            // Slight along-hull drift (toward stern) so foam trails the turn
            const trail = -0.5 - emitStrength * 0.6;
            p.vel.set(
              shipRightX * outerSide * outward + fwdX * trail,
              0.15 + Math.random() * 0.2,
              shipRightZ * outerSide * outward + fwdZ * trail,
            );
            p.maxLife = 0.9 + Math.random() * 0.5;
            p.foam = true;
          } else {
            p.pos.set(
              baseX + fwdX * alongScatter + shipRightX * outerSide * sideDist,
              0.15 + Math.random() * 0.15,
              baseZ + fwdZ * alongScatter + shipRightZ * outerSide * sideDist,
            );
            const outward = 2.2 + emitStrength * 2.0 + Math.random() * 1.5;
            const upward = 2.3 + emitStrength * 1.7 + Math.random() * 1.4;
            p.vel.set(
              shipRightX * outerSide * outward + (Math.random() - 0.5) * 0.6,
              upward,
              shipRightZ * outerSide * outward + (Math.random() - 0.5) * 0.6,
            );
            p.maxLife = 0.55 + Math.random() * 0.25;
            p.foam = false;
          }
          p.life = p.maxLife;
        }

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
    const steerIntent = (inD ? 1 : 0) - (inA ? 1 : 0); // right turn = positive
    const heelDrifting = inShift && steerIntent !== 0;
    const driftHeelBonus = heelDrifting ? 1.4 : 1;
    // Steering input → base bank (scales strongly with speed for arcade feel).
    const steerHeel = -steerIntent * (0.14 + speedRatio * 0.28) * driftHeelBonus;
    // Actual rotation rate → secondary bank component (captures sustained turns).
    const angularHeel = THREE.MathUtils.clamp(angularVelocity * 0.085, -0.32, 0.32);
    // Final target: up to ~28° at full-speed hard turns, ~38° while drifting.
    const heelClamp = heelDrifting ? 0.66 : 0.48;
    const targetHeel = THREE.MathUtils.clamp(steerHeel + angularHeel, -heelClamp, heelClamp);

    // Spring the hull into turns, then let it settle once the helm straightens.
    const heelStiffness = 18 + speedRatio * 10;
    const heelDamping = 8 + speedRatio * 2;
    heelVelocity.current += (targetHeel - heel.current) * heelStiffness * delta;
    heelVelocity.current *= Math.exp(-heelDamping * delta);
    heel.current += heelVelocity.current * delta;

    // Pitch: planing lift at speed + throttle dig when reversing.
    const throttle = inW ? 1 : inS ? -1 : 0;
    const throttlePitch = -throttle * speedRatio * 0.06; // W lifts bow, S digs bow
    const planingPitch = -speedRatio * 0.04;             // sustained bow-up at cruise

    // Wave-coupled bob: sample a cheap analytic swell at bow, stern, and beam
    // so the ship genuinely rides crests — pitches over fronts, rolls with
    // beam seas. Also drives heel sink, drift yaw-slide, and throttle
    // weight transfer. All effects share 6 sin evaluations total.
    if (visualGroup.current && group.current) {
      const t = state.clock.elapsedTime;
      const sx = group.current.position.x;
      const sz = group.current.position.z;
      const rot = rotation.current;
      // Ship-local forward (sin,cos) and right (cos,-sin) in world space.
      const fwdX = Math.sin(rot);
      const fwdZ = Math.cos(rot);
      const rightX = Math.cos(rot);
      const rightZ = -Math.sin(rot);
      // Wave probe points scale with hull dimensions so bigger ships sample a
      // wider footprint and smaller ones bob more responsively.
      const bowProbe = profile.hull.length * 0.5;
      const sternProbe = profile.hull.length * 0.3;
      const beamProbe = profile.hull.width * 0.59;
      const bowX = sx + fwdX * bowProbe;
      const bowZ = sz + fwdZ * bowProbe;
      const sternX = sx - fwdX * sternProbe;
      const sternZ = sz - fwdZ * sternProbe;
      const portX = sx - rightX * beamProbe;
      const portZ = sz - rightZ * beamProbe;
      const stbdX = sx + rightX * beamProbe;
      const stbdZ = sz + rightZ * beamProbe;
      // Two-component swell: long primary + shorter cross-chop.
      const sampleWave = (x: number, z: number) =>
          Math.sin(t * 1.1 + x * 0.18 + z * 0.12) * 0.17
        + Math.sin(t * 1.8 - x * 0.09 + z * 0.28) * 0.09;
      const bowY = sampleWave(bowX, bowZ);
      const sternY = sampleWave(sternX, sternZ);
      const portY = sampleWave(portX, portZ);
      const stbdY = sampleWave(stbdX, stbdZ);
      const centerY = (bowY + sternY) * 0.5;
      // Divisors match the probe spacings so the pitch/roll output stays in
      // the same visual range regardless of ship size.
      const pitchFromWave = (bowY - sternY) / (bowProbe + sternProbe);
      const rollFromWave = (stbdY - portY) / (beamProbe * 2) * 0.6;

      // Low side of the hull settles deeper when banking.
      const heelSink = Math.abs(heel.current) * 0.22;

      // Throttle weight transfer — acceleration spikes give a momentary pitch
      // kick (bow up on W press, bow down on S press / decel). Clamped small.
      const frameAccel = (velocity.current - prevVelocity.current) / Math.max(delta, 1 / 120);
      prevVelocity.current = velocity.current;
      const weightPitch = THREE.MathUtils.clamp(-frameAccel * 0.008, -0.08, 0.08);

      // Drift yaw-slide — visual hull angles outward from physics heading.
      const yawSlideTarget = heelDrifting ? -steerIntent * 0.09 * speedRatio : 0;
      yawSlide.current = THREE.MathUtils.lerp(
        yawSlide.current,
        yawSlideTarget,
        1 - Math.exp(-delta * 5),
      );

      visualGroup.current.position.y = centerY - heelSink + cargoDraftLift;
      visualGroup.current.rotation.y = yawSlide.current;
      visualGroup.current.rotation.z = heel.current + rollFromWave
        + Math.sin(t * 1.5) * (0.008 + speedRatio * 0.006);
      visualGroup.current.rotation.x =
        pitchFromWave + planingPitch + throttlePitch + weightPitch;
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

    // Live wind-heading score — well-trimmed sails visibly puff harder.
    const sailTrimScore = getWindTrimInfo(store.windDirection, rotation.current, stats.windward).score;

    const recomputeNormals = (++normalFrame.current % 4) === 0;
    // Apparent-wind X sign: +1 when wind crosses from port (xNorm<0 is luff),
    // -1 when from starboard (xNorm>0 is luff). Asymmetric camber & leech
    // flutter flip with it so the belly always leans downwind.
    const windSide = normalizedWindX >= 0 ? 1 : -1;
    const elapsed = state.clock.elapsedTime;

    const updateSailShape = (
      mesh: THREE.Mesh | null,
      geometry: THREE.PlaneGeometry,
      basePositions: Float32Array,
      sail: SailConfig,
      baseY: number,
      trim: number,
    ) => {
      if (!mesh) return;

      mesh.rotation.y = trim;
      mesh.position.y = baseY - (1 - visualSailSet.current) * sail.lowerAmount;
      mesh.scale.y = 0.72 + visualSailSet.current * 0.28;

      const position = geometry.attributes.position as THREE.BufferAttribute;
      const array = position.array as Float32Array;
      const halfWidth = sail.width * 0.5;
      const halfHeight = sail.height * 0.5;
      const setScale = 0.72 + visualSailSet.current * 0.28;
      const camberDepth =
        (0.12 + fill * 0.5 + speedRatio * 0.08 + sailTrimScore * 0.22) *
        sail.fullnessScale *
        setScale;
      const flutterAmount = (0.01 + speedRatio * 0.005) * luff;
      const flutterFreq = 1.8 + speedRatio * 1.2;

      const plan = sail.plan;
      const numPanels = sail.numPanels ?? 1;

      for (let i = 0; i < array.length; i += 3) {
        const bx = basePositions[i];
        const by = basePositions[i + 1];
        const xNorm = bx / halfWidth;                 // -1 luff-side .. +1 leech-side (depends on windSide)
        const yNorm = (by + halfHeight) / sail.height; // 0 foot .. 1 head
        const xAbs = Math.abs(xNorm);

        let belly = 0;
        let ripple = 0;
        let sag = 0;

        if (plan === 'square') {
          // Asymmetric camber: fuller on the luff side (upwind edge), tighter
          // on the leech. xSigned > 0 ⇒ leech side for current windSide.
          const xSigned = xNorm * windSide;
          // Base bell-curve, then shift peak toward luff by biasing with
          // smoothstep of xSigned. Belly depth * shape(y) * fullness_curve(x)
          const bowShape = (1 - xNorm * xNorm);
          const luffBias = 1 - THREE.MathUtils.smoothstep(xSigned, -0.2, 1);
          // Taper head & foot so the sail sits flush at yards & gaskets
          const yShape = Math.sin(Math.PI * yNorm);
          belly = bowShape * yShape * (0.6 + luffBias * 0.6);

          // Luff bubble: when luffing, the upwind edge caves inward. Subtract
          // a small reverse curve concentrated near xSigned ≈ -1.
          if (luff > 0.01) {
            const bubble = THREE.MathUtils.smoothstep(-xSigned, 0.65, 1.0);
            belly -= bubble * yShape * luff * 0.35;
          }

          // Leech-biased flutter (stronger on the downwind edge, near the top)
          const leechWeight = THREE.MathUtils.smoothstep(xSigned, 0.1, 1.0);
          const top = THREE.MathUtils.smoothstep(yNorm, 0.15, 1);
          ripple =
            Math.sin(elapsed * flutterFreq + yNorm * 3 + sail.flutterPhase) *
            flutterAmount *
            (0.25 + leechWeight * 0.9) *
            (0.3 + top * 0.7);

          sag = (0.012 + luff * 0.02) * Math.pow(xAbs, 1.6) * yNorm;
        } else if (plan === 'lateen') {
          // Triangular cut: mask deformation outside the triangle. Treat the
          // mesh as a rectangle with a virtual triangle running from head
          // (top-luff corner) to clew (bottom-leech corner). For a
          // belly-weighted-toward-clew feel, push camber toward low-y,
          // high-x-signed side.
          const xSigned = xNorm * windSide;
          const triMask = THREE.MathUtils.clamp(yNorm + (1 - xSigned) * 0.5 - 0.2, 0, 1);
          const clewWeight = (1 - yNorm) * (0.5 + xSigned * 0.5);
          const yShape = Math.sin(Math.PI * Math.min(1, yNorm * 1.15));
          belly = triMask * (0.4 + clewWeight * 0.9) * yShape;

          if (luff > 0.01) {
            // Luff edge along the yard (top): when pinched, the whole leading
            // edge trembles instead of bubbling.
            const yardEdge = THREE.MathUtils.smoothstep(yNorm, 0.75, 1.0);
            belly -= yardEdge * luff * 0.2;
          }

          const leechEdge = THREE.MathUtils.smoothstep(xSigned, 0.2, 1.0);
          ripple =
            Math.sin(elapsed * (flutterFreq + 0.6) + yNorm * 2.4 + sail.flutterPhase) *
            flutterAmount *
            (0.4 + leechEdge * 0.8);

          sag = (0.01 + luff * 0.015) * xAbs * yNorm;
        } else {
          // junk_batten: panelized. Each panel deforms as a small symmetric
          // belly; battens (panel boundaries) stay near-flat.
          const panelY = yNorm * numPanels;
          const panelT = panelY - Math.floor(panelY);
          const panelShape = Math.sin(Math.PI * panelT); // 0 at battens, 1 mid-panel
          const bowShape = (1 - xNorm * xNorm);
          belly = bowShape * panelShape * 0.55;

          // Battens dampen flutter to almost nothing; only gentle shimmer.
          ripple =
            Math.sin(elapsed * (flutterFreq * 0.6) + panelY * 4 + sail.flutterPhase) *
            flutterAmount *
            panelShape *
            0.25;

          sag = (0.006 + luff * 0.008) * xAbs * yNorm;
        }

        array[i] = bx;
        array[i + 1] = by - sag;
        array[i + 2] = belly * camberDepth + ripple;
      }

      position.needsUpdate = true;
      if (recomputeNormals) {
        geometry.computeVertexNormals();
        geometry.attributes.normal.needsUpdate = true;
      }
    };

    for (let i = 0; i < profile.sails.length; i++) {
      const sail = profile.sails[i];
      // Lateen sails render as rigid slabs, no vertex deformation.
      if (sail.plan === 'lateen') continue;
      const mesh = sailRefs.current[i];
      const geom = sailGeometries[i];
      const base = sailBases[i];
      if (!geom || !base) continue;
      const trim = sail.trimsWithMain ? sailTrim.current.main : sailTrim.current.fore;
      updateSailShape(mesh ?? null, geom, base, sail, sail.position[1], trim);
    }

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
      const hw = 0.7 * flagScale; // half width — scales with ship flag size

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
      if (recomputeNormals) {
        flagGeometry.computeVertexNormals();
      }
    }

    // ── Mast-top pennants ──
    // Trail on the same apparent-wind heading as the main flag, with a small
    // lag so the shorter streamers read as lighter / more responsive. Each
    // pennant gets its own travelling wave (phase offset by mastIdx).
    if (pennants.length > 0) {
      const windStr = Math.min(
        apparentSpeed * 0.18 + Math.abs(velocity.current) * 0.09,
        1,
      );
      const t = state.clock.elapsedTime;
      for (let pi = 0; pi < pennants.length; pi++) {
        const pen = pennants[pi];
        const pivot = pennantPivotRefs.current[pi];
        if (pivot) pivot.rotation.y = flagWindAngle.current;
        const mesh = pennantMeshRefs.current[pi];
        if (!mesh) continue;
        const arr = pen.geometry.attributes.position.array as Float32Array;
        const base = pen.base;
        const phase = pi * 1.3;
        for (let i = 0; i < arr.length; i += 3) {
          const bx = base[i];       // 0 at hoist, length at fly
          const by = base[i + 1];
          const xNorm = bx / pen.length;
          const xCube = xNorm * xNorm * xNorm;
          const wave = Math.sin(t * 7 - xNorm * 4.5 + phase) * 0.05 * xNorm;
          const flutter = Math.sin(t * 13 - xNorm * 6 + phase * 0.7) * 0.025 * xCube;
          const droop = (1 - windStr) * xCube * 0.18;
          arr[i] = bx;
          arr[i + 1] = by - droop;
          arr[i + 2] = (wave + flutter) * (0.25 + windStr * 0.85);
        }
        pen.geometry.attributes.position.needsUpdate = true;
        if (recomputeNormals) pen.geometry.computeVertexNormals();
      }
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
      const [anchorStowX, anchorStowY, anchorStowZ] = profile.equipment.anchor;
      const anchorSwungX = anchorStowX + 0.8; // full starboard extent

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
            anchorStowX + easeSwing * 0.8,   // swing to starboard
            anchorStowY - easePlunge * 3.5,  // drop from deck level into water
            anchorStowZ,                      // bow area
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
          const splashX = shipPos.x + Math.sin(rot) * anchorStowZ + Math.cos(rot) * anchorSwungX;
          const splashZ = shipPos.z + Math.cos(rot) * anchorStowZ - Math.sin(rot) * anchorSwungX;
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
          anchorGroupRef.current.position.set(anchorSwungX, -2.5, anchorStowZ);
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
            anchorSwungX - eased * 0.8,
            -2.5 + eased * (anchorStowY + 2.5),
            anchorStowZ,
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

    // ── Hard-turn spray particles ──
    if (spraySideRef.current) {
      const dummy = new THREE.Object3D();
      let needsUpdate = false;
      for (let i = 0; i < SPRAY_COUNT; i++) {
        const p = sprayData.current[i];
        if (!p) continue;
        if (p.life > 0) {
          p.life -= delta;
          const lifeRatio = p.life / p.maxLife;
          if (p.foam) {
            // Near-zero gravity, heavy lateral drag — foam sheets flatten
            // onto the surface and fade. Keep height clamped to waterline.
            p.vel.y -= 1.2 * delta;
            const drag = Math.exp(-delta * 2.8);
            p.vel.x *= drag;
            p.vel.z *= drag;
            p.pos.addScaledVector(p.vel, delta);
            if (p.pos.y < 0.02) { p.pos.y = 0.02; if (p.vel.y < 0) p.vel.y = 0; }
            dummy.position.copy(p.pos);
            // Foam expands wider and flatter than arc spray
            const grow = 0.28 + (1 - lifeRatio) * 0.55;
            const fade = Math.pow(Math.max(0, lifeRatio), 0.6);
            const sXZ = grow * fade;
            const sY = sXZ * 0.35;
            dummy.scale.set(sXZ, sY, sXZ);
          } else {
            p.vel.y -= 8 * delta; // lighter gravity — spray hangs briefly
            const drag = Math.exp(-delta * 1.4);
            p.vel.x *= drag;
            p.vel.z *= drag;
            p.pos.addScaledVector(p.vel, delta);
            dummy.position.copy(p.pos);
            const s = (0.16 + (1 - lifeRatio) * 0.22) * Math.pow(Math.max(0, lifeRatio), 0.4);
            dummy.scale.set(s, s, s);
          }
          dummy.updateMatrix();
          spraySideRef.current.setMatrixAt(i, dummy.matrix);
          needsUpdate = true;
        } else if (p.pos.y > -100) {
          p.pos.set(0, -1000, 0);
          dummy.position.copy(p.pos);
          dummy.scale.set(0, 0, 0);
          dummy.updateMatrix();
          spraySideRef.current.setMatrixAt(i, dummy.matrix);
          needsUpdate = true;
        }
      }
      if (needsUpdate) {
        spraySideRef.current.instanceMatrix.needsUpdate = true;
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
      // Pitch: barrel sits along local +Z, so a negative X rotation tilts it up.
      if (swivelPitchRef.current) {
        swivelPitchRef.current.rotation.x = -swivelAimPitch;
      }
    } else if (swivelPivotRef.current) {
      swivelPivotRef.current.visible = false;
    }

    // ── Broadside arc indicators ──
    const hasBroadside = store.stats.armament.some(w => w !== 'swivelGun');
    const nowMs = Date.now();
    const elevCharge = getCurrentElevationCharge();
    const wingLift = elevCharge * 0.7;
    if (portArcPivotRef.current) {
      portArcPivotRef.current.visible = store.combatMode && hasBroadside;
      portArcPivotRef.current.position.set(0, 0.1 + elevCharge * 0.2, 0);
      portArcPivotRef.current.rotation.set(0, 0, wingLift);
    }
    if (starboardArcPivotRef.current) {
      starboardArcPivotRef.current.visible = store.combatMode && hasBroadside;
      starboardArcPivotRef.current.position.set(0, 0.1 + elevCharge * 0.2, 0);
      starboardArcPivotRef.current.rotation.set(0, 0, -wingLift);
    }
    if (portArcRef.current) {
      if (portArcPivotRef.current?.visible) {
        const portReady = nowMs >= broadsideReload.port;
        (portArcRef.current.material as THREE.MeshBasicMaterial).opacity = portReady
          ? 0.18 - elevCharge * 0.05
          : 0.06 - elevCharge * 0.015;
      }
    }
    if (starboardArcRef.current) {
      if (starboardArcPivotRef.current?.visible) {
        const starReady = nowMs >= broadsideReload.starboard;
        (starboardArcRef.current.material as THREE.MeshBasicMaterial).opacity = starReady
          ? 0.18 - elevCharge * 0.05
          : 0.06 - elevCharge * 0.015;
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

          {/* Hull — box at waterline; bow/stern shapes vary per ship type */}
          <mesh position={[0, profile.hull.height * 0.5, 0]} castShadow receiveShadow>
            <boxGeometry args={[profile.hull.width, profile.hull.height, profile.hull.length]} />
            <meshStandardMaterial ref={hullMaterialRef} color={profile.hull.hullColor} roughness={0.9} />
          </mesh>
          {/* Deck */}
          <mesh position={[0, profile.hull.height + 0.01, 0]} castShadow receiveShadow>
            <boxGeometry args={[profile.hull.width * 0.91, 0.1, profile.hull.length * 0.96]} />
            <meshStandardMaterial color={profile.hull.deckColor} roughness={0.8} />
          </mesh>
          {/* Bow — shape depends on bowStyle */}
          {profile.hull.bowStyle === 'angled' && (
            <>
              <mesh position={[0, profile.hull.height * 0.5, profile.hull.length * 0.64]} rotation={[0, Math.PI / 4, 0]} castShadow receiveShadow>
                <boxGeometry args={[profile.hull.width * 0.7, profile.hull.height, profile.hull.width * 0.7]} />
                <meshStandardMaterial color={profile.hull.hullColor} roughness={0.9} />
              </mesh>
              <mesh position={[0, profile.hull.height + 0.01, profile.hull.length * 0.64]} rotation={[0, Math.PI / 4, 0]} castShadow receiveShadow>
                <boxGeometry args={[profile.hull.width * 0.64, 0.1, profile.hull.width * 0.64]} />
                <meshStandardMaterial color={profile.hull.deckColor} roughness={0.8} />
              </mesh>
            </>
          )}
          {profile.hull.bowStyle === 'tapered' && (
            <>
              {/* Forward wedge — diamond cross-section pointing +Z, narrower
                  than the hull so it reads as a tapered prow */}
              <mesh
                position={[0, profile.hull.height * 0.5, profile.hull.length * 0.56]}
                rotation={[0, Math.PI / 4, 0]}
                castShadow
                receiveShadow
              >
                <boxGeometry args={[profile.hull.width * 0.5, profile.hull.height, profile.hull.width * 0.5]} />
                <meshStandardMaterial color={profile.hull.hullColor} roughness={0.9} />
              </mesh>
              {/* Deck triangle atop the wedge so there's no gap with the main deck */}
              <mesh
                position={[0, profile.hull.height + 0.01, profile.hull.length * 0.56]}
                rotation={[0, Math.PI / 4, 0]}
                castShadow
                receiveShadow
              >
                <boxGeometry args={[profile.hull.width * 0.46, 0.1, profile.hull.width * 0.46]} />
                <meshStandardMaterial color={profile.hull.deckColor} roughness={0.8} />
              </mesh>
            </>
          )}
          {profile.hull.bowStyle === 'bluff' && (
            <mesh position={[0, profile.hull.height * 0.6, profile.hull.length * 0.52]} castShadow receiveShadow>
              <boxGeometry args={[profile.hull.width * 0.82, profile.hull.height * 0.6, profile.hull.length * 0.12]} />
              <meshStandardMaterial color={profile.hull.hullColor} roughness={0.9} />
            </mesh>
          )}
          {/* Bowsprit — angled spar projecting forward-up from the bow.
              Rotation +0.5 around X so the thin top end (+Y local) rotates
              forward-and-up and the thick base (-Y local) sits aft-and-low
              against the forecastle/bow deck. Position is chosen so the base
              rests on the bow deck tip, not floating beyond it. */}
          {profile.hull.hasBowsprit && (() => {
            const sprit = profile.hull.length * 0.38;
            // For rotation +0.5: bottom end local offset rotates to
            // (y = -cos(0.5)*L/2, z = -sin(0.5)*L/2) from the group center.
            // Pick the center so bottom end lands at (y = hull.height + 0.05,
            // z = hull.length * 0.48) — just inside the bow deck tip.
            const halfL = sprit * 0.5;
            const cy = profile.hull.height + 0.05 + Math.cos(0.5) * halfL;
            const cz = profile.hull.length * 0.48 + Math.sin(0.5) * halfL;
            return (
              <mesh
                position={[0, cy, cz]}
                rotation={[0.5, 0, 0]}
                castShadow
              >
                <cylinderGeometry args={[0.05, 0.08, sprit, 6]} />
                <meshStandardMaterial color={profile.hull.trimColor} roughness={0.9} />
              </mesh>
            );
          })()}
          {/* Stempost — raked upright at the forward tip of the hull. Plain
              style ends in a sphere; ornate style adds a stacked cone plus a
              small Latin cross, echoing the Order of Christ finials on
              Portuguese caravels. Rake is applied to the group so the finial
              stays aligned with the cylinder. */}
          {profile.hull.hasStempost && profile.hull.stempostStyle !== 'raked_beak' && (
            <group
              position={[0, profile.hull.height + 0.02, profile.hull.length * 0.66]}
              rotation={[0.22, 0, 0]}
            >
              <mesh position={[0, profile.hull.height * 0.45, 0]} castShadow>
                <cylinderGeometry args={[0.05, 0.07, profile.hull.height * 0.9, 6]} />
                <meshStandardMaterial color={profile.hull.trimColor} roughness={0.85} />
              </mesh>
              {profile.hull.stempostStyle === 'ornate' ? (
                <group position={[0, profile.hull.height * 0.9, 0]}>
                  {/* Base bead */}
                  <mesh castShadow>
                    <sphereGeometry args={[0.09, 8, 6]} />
                    <meshStandardMaterial color={profile.hull.trimColor} roughness={0.8} />
                  </mesh>
                  {/* Stacked cone finial */}
                  <mesh position={[0, 0.12, 0]} castShadow>
                    <coneGeometry args={[0.07, 0.18, 6]} />
                    <meshStandardMaterial color={profile.hull.trimColor} roughness={0.8} />
                  </mesh>
                  {/* Latin cross — vertical + horizontal arms */}
                  <mesh position={[0, 0.33, 0]} castShadow>
                    <boxGeometry args={[0.035, 0.22, 0.035]} />
                    <meshStandardMaterial color={profile.hull.trimColor} roughness={0.8} />
                  </mesh>
                  <mesh position={[0, 0.36, 0]} castShadow>
                    <boxGeometry args={[0.14, 0.035, 0.035]} />
                    <meshStandardMaterial color={profile.hull.trimColor} roughness={0.8} />
                  </mesh>
                </group>
              ) : (
                <mesh position={[0, profile.hull.height * 0.9, 0]} castShadow>
                  <sphereGeometry args={[0.11, 8, 6]} />
                  <meshStandardMaterial color={profile.hull.trimColor} roughness={0.8} />
                </mesh>
              )}
            </group>
          )}
          {/* Raked beak stempost — dhow signature. A long spar tilted sharply
              forward-up from the bow tip, with a plain tapered finial. No
              cross or bead (distinguishes it from the ornate caravel stem). */}
          {profile.hull.hasStempost && profile.hull.stempostStyle === 'raked_beak' && (() => {
            const beakLen = profile.hull.height * 2.2;
            const rake = 0.58;
            return (
              <group
                position={[0, profile.hull.height + 0.05, profile.hull.length * 0.5]}
                rotation={[rake, 0, 0]}
              >
                {/* Main spar — cylinder extending +Y from the base */}
                <mesh position={[0, beakLen * 0.5, 0]} castShadow>
                  <cylinderGeometry args={[0.05, 0.09, beakLen, 6]} />
                  <meshStandardMaterial color={profile.hull.trimColor} roughness={0.85} />
                </mesh>
                {/* Plain tapered tip */}
                <mesh position={[0, beakLen + 0.08, 0]} castShadow>
                  <coneGeometry args={[0.055, 0.18, 6]} />
                  <meshStandardMaterial color={profile.hull.trimColor} roughness={0.85} />
                </mesh>
              </group>
            );
          })()}
          {/* Secondary (inner) stempost — shorter, less raked, sits just aft
              of the main stempost to give the bow a doubled-curve silhouette
              typical of caravela latina prows. */}
          {profile.hull.hasStempost && profile.hull.doubleStem && (
            <group
              position={[0, profile.hull.height + 0.02, profile.hull.length * 0.56]}
              rotation={[0.1, 0, 0]}
            >
              <mesh position={[0, profile.hull.height * 0.32, 0]} castShadow>
                <cylinderGeometry args={[0.045, 0.06, profile.hull.height * 0.64, 6]} />
                <meshStandardMaterial color={profile.hull.trimColor} roughness={0.85} />
              </mesh>
            </group>
          )}
          {/* Raised forecastle — Carrack/Galleon bow structure. Box extends
              down into the hull (bottom at hull mid-height) so it reads as
              integrated with the hull rather than floating on the deck. */}
          {profile.hull.hasForecastle && (
            <mesh
              position={[0, profile.hull.height + 0.15, profile.hull.length * 0.4]}
              castShadow
              receiveShadow
            >
              <boxGeometry args={[profile.hull.width * 0.78, 1.25, profile.hull.length * 0.22]} />
              <meshStandardMaterial color={profile.hull.trimColor} roughness={0.9} />
            </mesh>
          )}
          {/* Stern structure — cabin / castle / transom. Cabin is kept short
              in z so mizzen masts (when present) can step aft of it without
              clipping through the cabin roof. */}
          {profile.hull.sternStyle === 'cabin' && (
            <mesh position={[0, profile.hull.height + 0.45, -profile.hull.length * 0.22]} castShadow receiveShadow>
              <boxGeometry args={[profile.hull.width * 0.9, 0.9, profile.hull.length * 0.22]} />
              <meshStandardMaterial color={profile.hull.cabinColor} roughness={0.9} />
            </mesh>
          )}
          {/* Aftercastle rail — thin perimeter railing sitting on the cabin
              roof (four corner posts + three spanning rails). Caravel detail;
              ship.cabinRail gates it so it won't appear on dhow/pinnace. */}
          {profile.hull.sternStyle === 'cabin' && profile.hull.cabinRail && (() => {
            const railY = profile.hull.height + 0.92; // cabin top + small gap
            const cabinZ = -profile.hull.length * 0.22;
            const halfW = profile.hull.width * 0.42;
            const halfL = profile.hull.length * 0.11;
            const postH = 0.18;
            const postR = 0.025;
            const railR = 0.02;
            const posts: [number, number][] = [
              [-halfW, cabinZ - halfL],
              [halfW, cabinZ - halfL],
              [-halfW, cabinZ + halfL],
              [halfW, cabinZ + halfL],
            ];
            return (
              <group>
                {posts.map(([x, z], i) => (
                  <mesh key={`post-${i}`} position={[x, railY + postH * 0.5, z]} castShadow>
                    <cylinderGeometry args={[postR, postR, postH, 5]} />
                    <meshStandardMaterial color={profile.hull.trimColor} roughness={0.9} />
                  </mesh>
                ))}
                {/* Port rail (along -X side) */}
                <mesh position={[-halfW, railY + postH, cabinZ]} rotation={[Math.PI / 2, 0, 0]} castShadow>
                  <cylinderGeometry args={[railR, railR, halfL * 2, 5]} />
                  <meshStandardMaterial color={profile.hull.trimColor} roughness={0.9} />
                </mesh>
                {/* Starboard rail */}
                <mesh position={[halfW, railY + postH, cabinZ]} rotation={[Math.PI / 2, 0, 0]} castShadow>
                  <cylinderGeometry args={[railR, railR, halfL * 2, 5]} />
                  <meshStandardMaterial color={profile.hull.trimColor} roughness={0.9} />
                </mesh>
                {/* Aft rail (across -Z, stern-facing) */}
                <mesh position={[0, railY + postH, cabinZ - halfL]} rotation={[0, 0, Math.PI / 2]} castShadow>
                  <cylinderGeometry args={[railR, railR, halfW * 2, 5]} />
                  <meshStandardMaterial color={profile.hull.trimColor} roughness={0.9} />
                </mesh>
              </group>
            );
          })()}
          {profile.hull.sternStyle === 'castle' && (
            <>
              <mesh position={[0, profile.hull.height + 0.45, -profile.hull.length * 0.26]} castShadow receiveShadow>
                <boxGeometry args={[profile.hull.width * 0.95, 0.95, profile.hull.length * 0.34]} />
                <meshStandardMaterial color={profile.hull.cabinColor} roughness={0.9} />
              </mesh>
              <mesh position={[0, profile.hull.height + 1.2, -profile.hull.length * 0.34]} castShadow receiveShadow>
                <boxGeometry args={[profile.hull.width * 0.8, 0.6, profile.hull.length * 0.22]} />
                <meshStandardMaterial color={profile.hull.trimColor} roughness={0.9} />
              </mesh>
            </>
          )}
          {profile.hull.sternStyle === 'transom' && (() => {
            // Low transom (dhow) uses a shorter panel and lower cabin so the
            // stern reads as modest rather than carrack-like. Junk keeps the
            // full-height panel.
            const low = profile.hull.lowTransom;
            const panelH = low ? 0.85 : 1.4;
            const panelY = profile.hull.height + (low ? 0.38 : 0.7);
            const cabinH = low ? 0.55 : 0.8;
            const cabinY = profile.hull.height + (low ? 0.35 : 0.55);
            const panelW = profile.hull.width * (low ? 0.88 : 0.95);
            const cabinW = profile.hull.width * (low ? 0.78 : 0.85);
            const panelZ = -profile.hull.length * 0.48;
            const carved = profile.hull.hasCarvedTransom;
            const frontFaceZ = panelZ + 0.09 + 0.005; // panel front +Z face
            const winSize = Math.min(0.24, panelH * 0.3);
            const winY = panelY + panelH * 0.18;
            const winOffsetX = panelW * 0.26;
            return (
              <>
                <mesh position={[0, panelY, panelZ]} castShadow receiveShadow>
                  <boxGeometry args={[panelW, panelH, 0.18]} />
                  <meshStandardMaterial color={profile.hull.trimColor} roughness={0.9} />
                </mesh>
                <mesh position={[0, cabinY, -profile.hull.length * 0.36]} castShadow receiveShadow>
                  <boxGeometry args={[cabinW, cabinH, profile.hull.length * 0.2]} />
                  <meshStandardMaterial color={profile.hull.cabinColor} roughness={0.9} />
                </mesh>
                {carved && (
                  <>
                    {/* Vertical trim bars — three carved panels across the
                        transom, echoing the Indo-Portuguese baghla stern. */}
                    {[-panelW * 0.36, 0, panelW * 0.36].map((x, i) => (
                      <mesh key={`carve-trim-${i}`} position={[x, panelY, frontFaceZ + 0.008]}>
                        <boxGeometry args={[0.035, panelH * 0.85, 0.02]} />
                        <meshStandardMaterial color={profile.hull.hullColor} roughness={0.85} />
                      </mesh>
                    ))}
                    {/* Stern windows — two lit squares with mullions. */}
                    {[-winOffsetX, winOffsetX].map((x, i) => (
                      <group key={`carve-win-${i}`} position={[x, winY, frontFaceZ + 0.016]}>
                        <mesh>
                          <boxGeometry args={[winSize, winSize, 0.02]} />
                          <meshStandardMaterial
                            color="#ffe6a8"
                            emissive="#ffae55"
                            emissiveIntensity={0.75}
                            toneMapped={false}
                          />
                        </mesh>
                        <mesh position={[0, 0, 0.012]}>
                          <boxGeometry args={[0.018, winSize * 1.04, 0.008]} />
                          <meshStandardMaterial color={profile.hull.hullColor} roughness={0.9} />
                        </mesh>
                        <mesh position={[0, 0, 0.012]}>
                          <boxGeometry args={[winSize * 1.04, 0.018, 0.008]} />
                          <meshStandardMaterial color={profile.hull.hullColor} roughness={0.9} />
                        </mesh>
                      </group>
                    ))}
                    {/* Top cornice — thin horizontal cap */}
                    <mesh position={[0, panelY + panelH * 0.5 + 0.04, panelZ]}>
                      <boxGeometry args={[panelW * 1.06, 0.07, 0.22]} />
                      <meshStandardMaterial color={profile.hull.hullColor} roughness={0.85} />
                    </mesh>
                  </>
                )}
              </>
            );
          })()}
          {/* Tuck stern — Fluyt's signature pinched pear shape. A narrow
              diamond-section wedge aft (like the bow, mirrored) gives the
              tapered tuck, with a low cabin sitting on top. */}
          {profile.hull.sternStyle === 'tuck' && (
            <>
              <mesh
                position={[0, profile.hull.height * 0.5, -profile.hull.length * 0.52]}
                rotation={[0, Math.PI / 4, 0]}
                castShadow
                receiveShadow
              >
                <boxGeometry args={[profile.hull.width * 0.45, profile.hull.height, profile.hull.width * 0.45]} />
                <meshStandardMaterial color={profile.hull.hullColor} roughness={0.9} />
              </mesh>
              <mesh
                position={[0, profile.hull.height + 0.4, -profile.hull.length * 0.34]}
                castShadow
                receiveShadow
              >
                <boxGeometry args={[profile.hull.width * 0.7, 0.7, profile.hull.length * 0.24]} />
                <meshStandardMaterial color={profile.hull.cabinColor} roughness={0.9} />
              </mesh>
            </>
          )}
          {/* Narrow high transom — fluyt pear-drop stern. Rises directly
              off the cabin's aft face, overlapping the cabin top so the two
              read as one continuous vertical stern rather than stacked
              blocks. Keyed on tuck+hasNarrowTransom so other sternStyles
              don't accidentally inherit it. */}
          {profile.hull.sternStyle === 'tuck' && profile.hull.hasNarrowTransom && (() => {
            const panelW = profile.hull.width * 0.46;
            const panelH = 1.6;
            // Overlap the cabin (which tops out at hull.height + 0.75) by
            // starting the panel at hull.height + 0.35 — that fills the gap
            // and lets the transom visually continue the cabin upward.
            const panelY = profile.hull.height + 0.35 + panelH * 0.5;
            // Sit just aft of the cabin (cabin aft face ≈ -length*0.46) so
            // the panel stacks fore-to-aft instead of interpenetrating.
            const panelZ = -profile.hull.length * 0.465;
            const panelDepth = 0.14;
            // Windows: two larger lit squares in the upper third of the
            // panel, with mullions dividing each into 4 panes.
            const winSize = 0.22;
            const winY = panelY + panelH * 0.22;
            const winOffsetX = panelW * 0.24;
            const frontFaceZ = panelZ - panelDepth * 0.5 - 0.005;
            return (
              <group>
                {/* Transom panel */}
                <mesh position={[0, panelY, panelZ]} castShadow receiveShadow>
                  <boxGeometry args={[panelW, panelH, panelDepth]} />
                  <meshStandardMaterial color={profile.hull.trimColor} roughness={0.9} />
                </mesh>
                {/* Vertical trim bars — suggest carved panels */}
                {[-panelW * 0.34, 0, panelW * 0.34].map((x, i) => (
                  <mesh key={`trim-${i}`} position={[x, panelY, frontFaceZ - 0.02]}>
                    <boxGeometry args={[0.035, panelH * 0.85, 0.025]} />
                    <meshStandardMaterial color={profile.hull.hullColor} roughness={0.85} />
                  </mesh>
                ))}
                {/* Stern windows — emissive squares with mullions (a thin
                    cross across each window). Brighter than before so they
                    read against the trim-colored panel in daylight too. */}
                {[-winOffsetX, winOffsetX].map((x, i) => (
                  <group key={`win-${i}`} position={[x, winY, frontFaceZ - 0.03]}>
                    <mesh>
                      <boxGeometry args={[winSize, winSize, 0.02]} />
                      <meshStandardMaterial
                        color="#ffe6a8"
                        emissive="#ffae55"
                        emissiveIntensity={0.85}
                        toneMapped={false}
                      />
                    </mesh>
                    {/* Vertical mullion */}
                    <mesh position={[0, 0, 0.012]}>
                      <boxGeometry args={[0.018, winSize * 1.04, 0.008]} />
                      <meshStandardMaterial color={profile.hull.hullColor} roughness={0.9} />
                    </mesh>
                    {/* Horizontal mullion */}
                    <mesh position={[0, 0, 0.012]}>
                      <boxGeometry args={[winSize * 1.04, 0.018, 0.008]} />
                      <meshStandardMaterial color={profile.hull.hullColor} roughness={0.9} />
                    </mesh>
                  </group>
                ))}
                {/* Top cap — thin horizontal cornice */}
                <mesh position={[0, panelY + panelH * 0.5 + 0.045, panelZ]}>
                  <boxGeometry args={[panelW * 1.1, 0.09, panelDepth + 0.06]} />
                  <meshStandardMaterial color={profile.hull.hullColor} roughness={0.85} />
                </mesh>
              </group>
            );
          })()}
          {/* Cargo hatch — raised coaming amidships. Fluyts were bulk
              carriers; a visible hatch between the masts reads as "merchant
              ship" more than any other single cue. Placed between main and
              fore masts (profile-driven z) to avoid clipping either. */}
          {profile.hull.hasCargoHatch && profile.masts.length >= 2 && (() => {
            // Midpoint between main (idx 0) and fore (idx 1) masts.
            const mainZ = profile.masts[0].position[2];
            const foreZ = profile.masts[1].position[2];
            const hatchZ = (mainZ + foreZ) * 0.5;
            const hatchW = profile.hull.width * 0.55;
            const hatchL = profile.hull.length * 0.22;
            const coamingH = 0.16;
            const coamingY = profile.hull.height + coamingH * 0.5 + 0.02;
            return (
              <group>
                {/* Raised coaming frame */}
                <mesh position={[0, coamingY, hatchZ]} castShadow receiveShadow>
                  <boxGeometry args={[hatchW, coamingH, hatchL]} />
                  <meshStandardMaterial color={profile.hull.trimColor} roughness={0.9} />
                </mesh>
                {/* Hatch cover — darker plank cover, slightly inset */}
                <mesh position={[0, coamingY + coamingH * 0.5 + 0.01, hatchZ]} receiveShadow>
                  <boxGeometry args={[hatchW * 0.92, 0.04, hatchL * 0.92]} />
                  <meshStandardMaterial color={profile.hull.hullColor} roughness={0.95} />
                </mesh>
                {/* Plank seams — two dark lines across the cover */}
                {[-hatchL * 0.22, hatchL * 0.22].map((dz, i) => (
                  <mesh
                    key={`plank-${i}`}
                    position={[0, coamingY + coamingH * 0.5 + 0.035, hatchZ + dz]}
                  >
                    <boxGeometry args={[hatchW * 0.9, 0.008, 0.03]} />
                    <meshStandardMaterial color="#2a1d12" roughness={1} />
                  </mesh>
                ))}
              </group>
            );
          })()}
          {/* Stern davit — short horizontal spar projecting aft from the
              transom. Minimal but unmistakably a cargo-handling boom. */}
          {profile.hull.hasSternDavit && (() => {
            const spanZ = -profile.hull.length * 0.6;
            const baseZ = -profile.hull.length * 0.48;
            const y = profile.hull.height + 0.7;
            const spar = spanZ - baseZ; // negative length
            return (
              <group>
                {/* The spar itself — horizontal cylinder along Z, so rotate X by 90° */}
                <mesh
                  position={[0, y, (baseZ + spanZ) * 0.5]}
                  rotation={[Math.PI / 2, 0, 0]}
                  castShadow
                >
                  <cylinderGeometry args={[0.05, 0.05, Math.abs(spar) * 1.05, 6]} />
                  <meshStandardMaterial color={profile.hull.trimColor} roughness={0.9} />
                </mesh>
                {/* Outboard knob at the aft tip */}
                <mesh position={[0, y, spanZ]} castShadow>
                  <sphereGeometry args={[0.08, 8, 6]} />
                  <meshStandardMaterial color={profile.hull.trimColor} roughness={0.85} />
                </mesh>
                {/* Short drop line — suggests a lanyard/block hanging from tip */}
                <mesh position={[0, y - 0.22, spanZ]}>
                  <cylinderGeometry args={[0.012, 0.012, 0.44, 4]} />
                  <meshStandardMaterial color="#2a1d12" roughness={1} />
                </mesh>
              </group>
            );
          })()}
          {/* Oculus — painted eye on each side of the bluff bow. Two flat
              planes hugging the hull sides, normals pointing outward; the
              canvas texture does all the work. Positioned low-and-forward
              like real junks. */}
          {profile.hull.hasOculus && oculusTexture && (() => {
            const eyeSize = Math.min(profile.hull.width * 0.45, profile.hull.height * 0.72);
            const eyeY = profile.hull.height * 0.55;
            const eyeZ = profile.hull.length * 0.36;
            const sideX = profile.hull.width * 0.5 + 0.005;
            return (
              <group>
                {/* Port side — plane normal faces -X */}
                <mesh position={[-sideX, eyeY, eyeZ]} rotation={[0, -Math.PI / 2, 0]}>
                  <planeGeometry args={[eyeSize, eyeSize]} />
                  <meshStandardMaterial map={oculusTexture} roughness={0.9} />
                </mesh>
                {/* Starboard side — plane normal faces +X */}
                <mesh position={[sideX, eyeY, eyeZ]} rotation={[0, Math.PI / 2, 0]}>
                  <planeGeometry args={[eyeSize, eyeSize]} />
                  <meshStandardMaterial map={oculusTexture} roughness={0.9} />
                </mesh>
              </group>
            );
          })()}
          {/* High sternpost — tall narrow plank rising above the transom.
              The "Chinese junk" silhouette comes from this asymmetry between
              the bluff squared bow and the tall squared stern rising far
              above the cabin roof. */}
          {profile.hull.hasHighSternpost && (() => {
            const plankW = profile.hull.width * 0.55;
            const plankH = 1.5;
            const plankD = 0.14;
            // Existing transom wall tops out at hull.height + 1.4; start the
            // sternpost 0.05 lower so it overlaps (no floating gap).
            const plankY = profile.hull.height + 1.35 + plankH * 0.5;
            const plankZ = -profile.hull.length * 0.46;
            return (
              <group>
                {/* Main plank */}
                <mesh position={[0, plankY, plankZ]} castShadow receiveShadow>
                  <boxGeometry args={[plankW, plankH, plankD]} />
                  <meshStandardMaterial color={profile.hull.trimColor} roughness={0.9} />
                </mesh>
                {/* Painted horizontal bands — classic junk decoration */}
                {[-plankH * 0.28, plankH * 0.05, plankH * 0.32].map((dy, i) => (
                  <mesh key={`band-${i}`} position={[0, plankY + dy, plankZ - plankD * 0.5 - 0.005]}>
                    <boxGeometry args={[plankW * 1.02, 0.07, 0.015]} />
                    <meshStandardMaterial color={profile.hull.deckColor} roughness={0.9} />
                  </mesh>
                ))}
                {/* Top finial — small squared cap mimicking the upturned
                    sternpost caps seen on Fujianese junks */}
                <mesh position={[0, plankY + plankH * 0.5 + 0.08, plankZ]}>
                  <boxGeometry args={[plankW * 1.15, 0.16, plankD + 0.08]} />
                  <meshStandardMaterial color={profile.hull.cabinColor} roughness={0.9} />
                </mesh>
                {/* Two small curled "horn" finials at top corners */}
                {[-plankW * 0.52, plankW * 0.52].map((x, i) => (
                  <mesh
                    key={`horn-${i}`}
                    position={[x, plankY + plankH * 0.5 + 0.24, plankZ]}
                    rotation={[0, 0, (i === 0 ? -1 : 1) * 0.4]}
                  >
                    <coneGeometry args={[0.08, 0.28, 5]} />
                    <meshStandardMaterial color={profile.hull.cabinColor} roughness={0.85} />
                  </mesh>
                ))}
              </group>
            );
          })()}
          {/* Midship deckhouse — second low cabin between the masts, giving
              junks the characteristic multi-roof deck silhouette. Positioned
              at the midpoint between main and fore masts so it scales with
              the rig layout. */}
          {profile.hull.hasMidshipDeckhouse && profile.masts.length >= 2 && (() => {
            const mainZ = profile.masts[0].position[2];
            const foreZ = profile.masts[1].position[2];
            const dhZ = (mainZ + foreZ) * 0.5 + 0.2;
            const dhW = profile.hull.width * 0.7;
            const dhH = 0.7;
            const dhL = profile.hull.length * 0.22;
            const dhY = profile.hull.height + dhH * 0.5 + 0.03;
            return (
              <group>
                {/* Main box */}
                <mesh position={[0, dhY, dhZ]} castShadow receiveShadow>
                  <boxGeometry args={[dhW, dhH, dhL]} />
                  <meshStandardMaterial color={profile.hull.cabinColor} roughness={0.9} />
                </mesh>
                {/* Roof — slightly oversized, different color, curved profile
                    suggested via a flatter box on top */}
                <mesh position={[0, dhY + dhH * 0.5 + 0.06, dhZ]} castShadow>
                  <boxGeometry args={[dhW * 1.08, 0.12, dhL * 1.08]} />
                  <meshStandardMaterial color={profile.hull.trimColor} roughness={0.9} />
                </mesh>
                {/* Two painted side panels (trim color horizontal bands) */}
                {[-dhW * 0.5 - 0.01, dhW * 0.5 + 0.01].map((x, i) => (
                  <mesh key={`side-${i}`} position={[x, dhY, dhZ]}>
                    <boxGeometry args={[0.02, dhH * 0.35, dhL * 0.9]} />
                    <meshStandardMaterial color={profile.hull.trimColor} roughness={0.9} />
                  </mesh>
                ))}
                {/* Small round doorway on the forward face (hint of entry) */}
                <mesh position={[0, dhY - dhH * 0.05, dhZ + dhL * 0.5 + 0.01]}>
                  <circleGeometry args={[dhH * 0.24, 12]} />
                  <meshStandardMaterial color={profile.hull.hullColor} roughness={0.95} />
                </mesh>
              </group>
            );
          })()}
          {/* Large fenestrated rudder — oversized hoistable rudder hanging
              from the transom. A defining junk silhouette element; we draw
              it vertically with 3 "fenestra" holes as small hull-colored
              inserts so the shape reads as the famous perforated rudder. */}
          {profile.hull.hasLargeRudder && (() => {
            const rudW = 0.12;
            // Tall enough for the rudder head to rise above deck level so
            // the tiller cap is visible, while the blade hangs well below
            // waterline (junks were famous for massive deep rudders).
            const rudH = 2.4;
            const rudL = profile.hull.length * 0.14;
            const rudY = profile.hull.height * 0.1;
            // Sit just aft of the hull stern face, not floating way back.
            const rudZ = -profile.hull.length * 0.5 - rudL * 0.25;
            return (
              <group>
                {/* Rudder blade — tall vertical plank hanging below waterline */}
                <mesh position={[0, rudY, rudZ]} castShadow receiveShadow>
                  <boxGeometry args={[rudW, rudH, rudL]} />
                  <meshStandardMaterial color={profile.hull.hullColor} roughness={0.95} />
                </mesh>
                {/* Fenestra — three darker inserts suggesting the famous
                    Chinese perforated rudder holes (they reduced helm load) */}
                {[-rudH * 0.28, 0, rudH * 0.28].map((dy, i) => (
                  <mesh key={`fen-${i}`} position={[rudW * 0.52, rudY + dy, rudZ]} rotation={[0, Math.PI / 2, 0]}>
                    <circleGeometry args={[0.08, 10]} />
                    <meshStandardMaterial color="#1a0f08" roughness={1} side={THREE.DoubleSide} />
                  </mesh>
                ))}
                {/* Rudder head — small cap where the tiller would attach */}
                <mesh position={[0, rudY + rudH * 0.5 + 0.08, rudZ - rudL * 0.15]} castShadow>
                  <boxGeometry args={[rudW * 1.8, 0.16, rudL * 0.35]} />
                  <meshStandardMaterial color={profile.hull.trimColor} roughness={0.9} />
                </mesh>
              </group>
            );
          })()}
          {/* Masts — slight taper (narrower at top) so they don't read as
              cardboard tubes. 60% masthead radius is a natural rigger's taper. */}
          {profile.masts.map((mast, idx) => (
            <mesh
              key={`mast-${idx}`}
              position={mast.position}
              rotation={mast.rake ? [mast.rake, 0, 0] : undefined}
              castShadow
            >
              <cylinderGeometry args={[mast.radius * 0.6, mast.radius, mast.height]} />
              <meshStandardMaterial color="#3e2723" />
            </mesh>
          ))}
          {/* Round top — circular platform at ~78% up the main mast with a
              short perimeter rail. Iconic carrack / galleon masthead detail. */}
          {profile.hull.hasRoundTop && profile.masts[0] && (() => {
            const main = profile.masts[0];
            const platformR = Math.max(0.36, main.radius * 2.6);
            const platformY = main.position[1] + main.height * 0.28;
            const railH = 0.16;
            const postR = 0.025;
            // 6 posts around the perimeter
            const postCount = 6;
            return (
              <group position={[main.position[0], platformY, main.position[2]]}>
                {/* Platform disc */}
                <mesh castShadow receiveShadow>
                  <cylinderGeometry args={[platformR, platformR * 0.92, 0.08, 14]} />
                  <meshStandardMaterial color={profile.hull.deckColor} roughness={0.9} />
                </mesh>
                {/* Perimeter rail — thin torus above the platform */}
                <mesh position={[0, railH, 0]} castShadow>
                  <torusGeometry args={[platformR * 0.95, 0.022, 5, 16]} />
                  <meshStandardMaterial color={profile.hull.trimColor} roughness={0.9} />
                </mesh>
                {/* Short posts supporting the rail */}
                {Array.from({ length: postCount }, (_, i) => {
                  const a = (i / postCount) * Math.PI * 2;
                  return (
                    <mesh
                      key={`rt-post-${i}`}
                      position={[Math.cos(a) * platformR * 0.95, railH * 0.5 + 0.04, Math.sin(a) * platformR * 0.95]}
                      castShadow
                    >
                      <cylinderGeometry args={[postR, postR, railH, 4]} />
                      <meshStandardMaterial color={profile.hull.trimColor} roughness={0.9} />
                    </mesh>
                  );
                })}
              </group>
            );
          })()}
          {/* Pavesades — row of painted shields along the gunwale in faction
              livery. Cheap boxes hugging the outside of the hull, alternating
              primary/device colors so the row reads as heraldry not solid paint. */}
          {profile.hull.pavesadeRow && (() => {
            const faction = FACTIONS[shipFlag];
            const c1 = faction?.colors[0] ?? profile.hull.trimColor;
            const c2 = faction?.colors[1] ?? profile.hull.sailColor;
            const shieldCount = 10;
            const shieldW = 0.22;
            const shieldH = 0.26;
            const shieldT = 0.04;
            // Run shields from just aft of the bow to just forward of the stern
            const zStart = -profile.hull.length * 0.32;
            const zEnd = profile.hull.length * 0.32;
            const zStep = (zEnd - zStart) / (shieldCount - 1);
            const sideX = profile.hull.width * 0.5 + shieldT * 0.5;
            const y = profile.hull.height + 0.12;
            return (
              <group>
                {Array.from({ length: shieldCount }, (_, i) => {
                  const z = zStart + zStep * i;
                  const color = i % 2 === 0 ? c1 : c2;
                  return (
                    <group key={`pav-${i}`}>
                      <mesh position={[sideX, y, z]} castShadow>
                        <boxGeometry args={[shieldT, shieldH, shieldW]} />
                        <meshStandardMaterial color={color} roughness={0.95} />
                      </mesh>
                      <mesh position={[-sideX, y, z]} castShadow>
                        <boxGeometry args={[shieldT, shieldH, shieldW]} />
                        <meshStandardMaterial color={color} roughness={0.95} />
                      </mesh>
                    </group>
                  );
                })}
              </group>
            );
          })()}
          {/* Sterncastle rail — thin perimeter railing around the upper tier
              of the stern castle. Only meaningful when sternStyle is 'castle'. */}
          {profile.hull.sternStyle === 'castle' && profile.hull.sterncastleRail && (() => {
            // Upper tier sits at y = hull.height + 1.2, width*0.8, length*0.22
            const tierY = profile.hull.height + 1.5;
            const tierZ = -profile.hull.length * 0.34;
            const halfW = profile.hull.width * 0.4;
            const halfL = profile.hull.length * 0.11;
            const postH = 0.18;
            const postR = 0.022;
            const railR = 0.018;
            const posts: [number, number][] = [
              [-halfW, tierZ - halfL],
              [halfW, tierZ - halfL],
              [-halfW, tierZ + halfL],
              [halfW, tierZ + halfL],
            ];
            return (
              <group>
                {posts.map(([x, z], i) => (
                  <mesh key={`sc-post-${i}`} position={[x, tierY + postH * 0.5, z]} castShadow>
                    <cylinderGeometry args={[postR, postR, postH, 5]} />
                    <meshStandardMaterial color={profile.hull.trimColor} roughness={0.9} />
                  </mesh>
                ))}
                <mesh position={[-halfW, tierY + postH, tierZ]} rotation={[Math.PI / 2, 0, 0]} castShadow>
                  <cylinderGeometry args={[railR, railR, halfL * 2, 5]} />
                  <meshStandardMaterial color={profile.hull.trimColor} roughness={0.9} />
                </mesh>
                <mesh position={[halfW, tierY + postH, tierZ]} rotation={[Math.PI / 2, 0, 0]} castShadow>
                  <cylinderGeometry args={[railR, railR, halfL * 2, 5]} />
                  <meshStandardMaterial color={profile.hull.trimColor} roughness={0.9} />
                </mesh>
                <mesh position={[0, tierY + postH, tierZ - halfL]} rotation={[0, 0, Math.PI / 2]} castShadow>
                  <cylinderGeometry args={[railR, railR, halfW * 2, 5]} />
                  <meshStandardMaterial color={profile.hull.trimColor} roughness={0.9} />
                </mesh>
              </group>
            );
          })()}
          {/* Sterncastle lanterns — small emissive cages on the aft corners
              of the upper tier. Low-intensity warm light; complements the
              existing stern torch without doubling its brightness. */}
          {profile.hull.sternStyle === 'castle' && profile.hull.sterncastleLanterns && (() => {
            const tierY = profile.hull.height + 1.5;
            const tierZ = -profile.hull.length * 0.34;
            const halfW = profile.hull.width * 0.42;
            const aftZ = tierZ - profile.hull.length * 0.11 - 0.05;
            const positions: [number, number, number][] = [
              [-halfW, tierY + 0.2, aftZ],
              [halfW, tierY + 0.2, aftZ],
            ];
            return (
              <group>
                {positions.map((pos, i) => (
                  <group key={`lant-${i}`} position={pos}>
                    {/* Cage cube */}
                    <mesh castShadow>
                      <boxGeometry args={[0.12, 0.16, 0.12]} />
                      <meshStandardMaterial color="#2a1f14" roughness={0.8} />
                    </mesh>
                    {/* Glowing glass */}
                    <mesh>
                      <boxGeometry args={[0.08, 0.1, 0.08]} />
                      <meshStandardMaterial
                        color="#ffcc66"
                        emissive="#ff9933"
                        emissiveIntensity={0.55}
                        toneMapped={false}
                      />
                    </mesh>
                    {/* Bracket down to the deck */}
                    <mesh position={[0, -0.12, 0]}>
                      <cylinderGeometry args={[0.018, 0.018, 0.14, 4]} />
                      <meshStandardMaterial color="#2a1f14" roughness={0.8} />
                    </mesh>
                  </group>
                ))}
              </group>
            );
          })()}
          {/* Mast-top pennants — animated streamers on non-main masts. Pivot
              rotates around Y to trail apparent wind (same heading as main
              flag); mesh vertex positions are deformed in useFrame. */}
          {pennants.map((pen, i) => (
            <group
              key={`pennant-${i}`}
              ref={(el) => { pennantPivotRefs.current[i] = el; }}
              position={[0, pen.topY, pen.z]}
            >
              <mesh
                ref={(el) => { pennantMeshRefs.current[i] = el; }}
                geometry={pen.geometry}
              >
                <meshStandardMaterial
                  color={pennantColor}
                  roughness={1}
                  side={THREE.DoubleSide}
                />
              </mesh>
            </group>
          ))}
          {/* Mast Flag — pivot at profile.equipment.flagHoist */}
          {flagTexture && (
            <group ref={flagPivotRef} position={profile.equipment.flagHoist}>
              <mesh ref={flagMeshRef} geometry={flagGeometry} position={[0.7 * flagScale, 0, 0]}>
                <meshStandardMaterial
                  map={flagTexture}
                  side={THREE.DoubleSide}
                  roughness={0.9}
                />
              </mesh>
            </group>
          )}
          {/* Sails — array driven by profile.sails. Lateen sails render as
              rigid box slabs with a proper diagonal yard (matching the NPC
              LateenSail style); square and junk sails render as deformable
              PlaneGeometry driven by updateSailShape. */}
          {profile.sails.map((sail, idx) => {
            if (sail.plan === 'lateen') {
              return (
                <LateenSailMesh
                  key={`sail-${idx}`}
                  sail={sail}
                  fallbackColor={profile.hull.sailColor}
                  yardColor={profile.hull.trimColor}
                />
              );
            }
            const decalTex = sailTextures[idx];
            return (
              <group key={`sail-${idx}`}>
                <mesh
                  ref={(el) => { sailRefs.current[idx] = el; }}
                  geometry={sailGeometries[idx]}
                  position={sail.position}
                  rotation={sail.roll ? [0, 0, sail.roll] : undefined}
                  castShadow
                >
                  <meshStandardMaterial
                    map={decalTex ?? undefined}
                    color={decalTex ? '#ffffff' : (sail.color ?? profile.hull.sailColor)}
                    roughness={0.95}
                    side={THREE.DoubleSide}
                  />
                </mesh>
                {/* Yard — horizontal spar across the top of the sail.
                    cylinderGeometry's default axis is Y, so rotate 90° around Z
                    to run it along X (port-starboard). */}
                <mesh
                  position={[
                    sail.position[0],
                    sail.position[1] + sail.height * 0.5,
                    sail.position[2],
                  ]}
                  rotation={[0, 0, Math.PI / 2]}
                  castShadow
                >
                  <cylinderGeometry args={[0.055, 0.055, sail.width * 1.12, 6]} />
                  <meshStandardMaterial color={profile.hull.trimColor} roughness={0.85} />
                </mesh>
              </group>
            );
          })}
          {/* Junk sail battens — visible horizontal ribs in front of panelized sails */}
          {profile.sails.map((sail, idx) =>
            sail.plan === 'junk_batten' && sail.numPanels
              ? Array.from({ length: sail.numPanels + 1 }, (_, p) => {
                  const yOffset = -sail.height * 0.5 + (p / sail.numPanels!) * sail.height;
                  return (
                    <mesh
                      key={`batten-${idx}-${p}`}
                      position={[sail.position[0], sail.position[1] + yOffset, sail.position[2] + 0.06]}
                    >
                      <boxGeometry args={[sail.width * 1.02, 0.05, 0.06]} />
                      <meshStandardMaterial color="#5c4a2e" roughness={0.85} />
                    </mesh>
                  );
                })
              : null,
          )}
          {/* Swivel gun — bow-mounted, rotates toward cursor in combat mode */}
          <group ref={swivelPivotRef} position={profile.equipment.swivel} visible={false}>
            {/* Mounting post — stays vertical regardless of pitch */}
            <mesh position={[0, -0.15, 0]}>
              <cylinderGeometry args={[0.08, 0.1, 0.3, 6]} />
              <meshStandardMaterial color="#555" roughness={0.5} metalness={0.7} />
            </mesh>
            {/* Pitch pivot — barrel + muzzle ring tilt together */}
            <group ref={swivelPitchRef}>
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
          </group>
          {/* Broadside firing arcs — translucent wedges on port & starboard */}
          {/* Port (left) arc — red tint */}
          <group ref={portArcPivotRef} visible={false}>
            <mesh ref={portArcRef} rotation={[-Math.PI / 2, 0, 0]}>
              <circleGeometry args={[12, 16, Math.PI * 0.7, Math.PI * 0.6]} />
              <meshBasicMaterial color="#ff4444" transparent opacity={0.18} side={THREE.DoubleSide} depthWrite={false} />
            </mesh>
          </group>
          {/* Starboard (right) arc — blue tint */}
          <group ref={starboardArcPivotRef} visible={false}>
            <mesh ref={starboardArcRef} rotation={[-Math.PI / 2, 0, 0]}>
              <circleGeometry args={[12, 16, -Math.PI * 0.3, Math.PI * 0.6]} />
              <meshBasicMaterial color="#4488ff" transparent opacity={0.18} side={THREE.DoubleSide} depthWrite={false} />
            </mesh>
          </group>
          {/* Night torch on stern cabin */}
          <group position={profile.equipment.torch}>
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
          <group ref={netGroupRef} visible={false} position={profile.equipment.fishingNet}>
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
          <group ref={anchorGroupRef} visible={false} position={profile.equipment.anchor}>
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

      {/* Hard-turn spray — white foam kicking off the outer hull when banking */}
      <instancedMesh ref={spraySideRef} args={[undefined, undefined, SPRAY_COUNT]} frustumCulled={false}>
        <sphereGeometry args={[0.22, 5, 5]} />
        <meshStandardMaterial color="#eef6fb" roughness={0.2} transparent opacity={0.8} />
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
