import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { PORT_FACTION, useGameStore } from '../../../store/gameStore';
import { sfxCannonFire } from '../../../audio/SoundEffects';
import { buildingSemanticClass, SEMANTIC_STYLE } from '../../../utils/semanticClasses';
import { getPOIsForPort } from '../../../utils/poiDefinitions';
import { resolveSnappedPOI } from '../../../utils/proximityResolution';
import { getTerrainHeight } from '../../../utils/terrain';
import { SEA_LEVEL } from '../../../constants/world';
import { getLiveShipTransform } from '../../../utils/livePlayerTransform';
import { spawnFloatingCombatText } from '../../FloatingCombatText';
import { disabledFortBatteries, registerFortBatteryTarget, setHostileFortThreat, spawnProjectile } from '../../../utils/combatState';
import { spawnMuzzleBurst } from '../../../utils/splashState';

type PortsProp = ReturnType<typeof useGameStore.getState>['ports'];

const FORT_WARNING_THRESHOLD = -60;
const FORT_FIRE_THRESHOLD = -70;
const FORT_SEVERE_THRESHOLD = -85;
const FORT_SHIP_WARNING_RANGE = 390;
const FORT_WALK_WARNING_RANGE = 75;
const FORT_CANNON_RANGE = 360;
const FORT_SWIVEL_RANGE = 135;
const FORT_CANNON_RELOAD_MS = 8200;
const FORT_SWIVEL_RELOAD_MS = 2600;
const FORT_MAX_BATTERIES_PER_PORT = 2;
const FORT_CANNON_SPEED = 110;
const FORT_SWIVEL_SPEED = 72;
const FORT_CANNON_DAMAGE_SCALE = 4.8;
const FORT_SWIVEL_DAMAGE_SCALE = 2.2;

const FORTRESS_LANDMARK_IDS = new Set([
  'fort-jesus',
  'diu-fortress',
  'elmina-castle',
  'belem-tower',
  'tower-of-london',
]);

// ── Sacred Building Markers (Sims-style plumbob) ─────────────────────────────
// Floating glowing purple octahedron above every spiritual building and over
// religious landmarks (Bom Jesus, Oude Kerk, etc.). Toggled by the Display
// tab's "Sacred Site Markers" switch; defaults on. Instanced — one draw call
// for diamonds, one for halos, regardless of port count.

export function SacredBuildingMarkers({ ports }: { ports: PortsProp }) {
  const visible = useGameStore((state) => state.renderDebug.sacredMarkers);
  const devSoloPort = useGameStore((state) => state.devSoloPort);

  const positions = useMemo(() => {
    if (!visible) return [] as [number, number, number][];
    const visiblePorts = devSoloPort
      ? ports.filter((p) => p.id === devSoloPort)
      : ports;
    const out: [number, number, number][] = [];
    for (const port of visiblePorts) {
      for (const b of port.buildings) {
        const cls = buildingSemanticClass(b);
        if (!cls || SEMANTIC_STYLE[cls].marker !== 'diamond') continue;
        // Float the diamond above the roofline so it reads from a distance
        // and clears most landmark spires.
        const topY = b.position[1] + Math.max(b.scale[1] * 2.5, 13);
        out.push([b.position[0], topY, b.position[2]]);
      }
      // POIs share the same marker pipeline. Religious POIs (shrines,
      // monasteries, sufi lodges) get the same purple plumbob as in-city
      // spirituals. Skip POIs whose marker is already drawn by the buildings
      // loop above: landmark-bound POIs (the landmark itself carries the
      // marker) and procedural shrines (which inject a synthetic spiritual
      // building with poiId === poi.id, also covered above).
      for (const poi of getPOIsForPort(port)) {
        if (SEMANTIC_STYLE[poi.class].marker !== 'diamond') continue;
        if (poi.location.kind === 'landmark') continue;
        if (port.buildings.some((b) => b.poiId === poi.id)) continue;
        // Unified resolver — same snapped position the silhouettes use,
        // so the purple plumbob can't disagree with the silhouette below.
        const placed = resolveSnappedPOI(poi, port);
        if (!placed) continue;
        const terrainY = getTerrainHeight(placed.x, placed.z);
        const topY = Math.max(terrainY, SEA_LEVEL) + 14;
        out.push([placed.x, topY, placed.z]);
      }
    }
    return out;
  }, [devSoloPort, ports, visible]);

  const diamondGeo = useMemo(() => new THREE.OctahedronGeometry(2.325, 0), []);
  const diamondMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#cc96ff',
    emissive: '#ad55ff',
    emissiveIntensity: 2.3,
    metalness: 0.15,
    roughness: 0.22,
    transparent: true,
    opacity: 0.93,
    toneMapped: false,
  }), []);

  const haloTex = useMemo(() => {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0.0, 'rgba(220, 160, 255, 1.0)');
    grad.addColorStop(0.45, 'rgba(170, 90, 240, 0.45)');
    grad.addColorStop(1.0, 'rgba(140, 70, 220, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, []);
  const haloGeo = useMemo(() => {
    const g = new THREE.PlaneGeometry(1, 1);
    return g;
  }, []);
  const haloMat = useMemo(() => new THREE.MeshBasicMaterial({
    map: haloTex,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    opacity: 0.9,
  }), [haloTex]);

  const diamondRef = useRef<THREE.InstancedMesh>(null);
  const haloRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useRef(new THREE.Object3D());

  useFrame(({ clock, camera }) => {
    if (!visible) return;
    if (!diamondRef.current || !haloRef.current) return;
    const t = clock.elapsedTime;
    const pulse = 0.92 + Math.sin(t * 2.2) * 0.08;
    diamondMat.emissiveIntensity = 2.1 + Math.sin(t * 3.1) * 0.45;
    haloMat.opacity = 0.65 + Math.sin(t * 2.2) * 0.22;
    for (let i = 0; i < positions.length; i++) {
      const [px, py, pz] = positions[i];
      const bob = Math.sin(t * 1.6 + i * 0.7) * 0.38;
      const obj = dummy.current;
      obj.position.set(px, py + bob, pz);
      obj.rotation.set(0, t * 1.1 + i, 0);
      obj.scale.set(pulse, pulse * 1.15, pulse);
      obj.updateMatrix();
      diamondRef.current.setMatrixAt(i, obj.matrix);

      // Halo billboards to the camera so it always reads as a disc.
      obj.position.set(px, py + bob - 0.5, pz);
      obj.quaternion.copy(camera.quaternion);
      const haloPulse = 6.6 + Math.sin(t * 2.2 + i) * 0.75;
      obj.scale.set(haloPulse, haloPulse, haloPulse);
      obj.updateMatrix();
      haloRef.current.setMatrixAt(i, obj.matrix);
    }
    diamondRef.current.instanceMatrix.needsUpdate = true;
    haloRef.current.instanceMatrix.needsUpdate = true;
  });

  if (!visible || positions.length === 0) return null;

  return (
    <group>
      <instancedMesh
        ref={haloRef}
        args={[haloGeo, haloMat, positions.length]}
        frustumCulled={false}
        renderOrder={8}
      />
      <instancedMesh
        ref={diamondRef}
        args={[diamondGeo, diamondMat, positions.length]}
        frustumCulled={false}
        renderOrder={9}
      />
    </group>
  );
}

// ── Hostile Fort Warnings ──────────────────────────────────────────────────
// Fortified ports begin warning the player at low reputation and open fire at
// severe hostility. Named fortress landmarks are preferred as batteries; a
// second generic fort may join them where the city generated one.

export function FortHostilityWarnings({ ports }: { ports: PortsProp }) {
  const playerMode = useGameStore((state) => state.playerMode);
  const shipPos = useGameStore((state) => state.playerPos);
  const walkingPos = useGameStore((state) => state.walkingPos);
  const reputation = useGameStore((state) => state.reputation);
  const devSoloPort = useGameStore((state) => state.devSoloPort);
  const warnedBatteryIds = useRef(new Set<string>());
  const cannonReloadAt = useRef<Record<string, number>>({});
  const swivelReloadAt = useRef<Record<string, number>>({});
  const notifiedAt = useRef<Record<string, number>>({});

  const batteries = useMemo(() => {
    const visiblePorts = devSoloPort
      ? ports.filter((p) => p.id === devSoloPort)
      : ports;
    const out: Array<{
      id: string;
      portName: string;
      pos: [number, number, number];
      rep: number;
      range: number;
    }> = [];
    for (const port of visiblePorts) {
      const faction = PORT_FACTION[port.id];
      if (!faction) continue;
      const rep = reputation[faction] ?? 0;
      if (rep > FORT_WARNING_THRESHOLD) continue;
      const portBatteries = [];
      for (const building of port.buildings) {
        const isFortress = building.type === 'fort'
          || (building.type === 'landmark' && !!building.landmarkId && FORTRESS_LANDMARK_IDS.has(building.landmarkId));
        if (!isFortress) continue;
        const topY = building.position[1] + Math.max(building.scale[1] * 1.6, 6);
        portBatteries.push({
          id: `fort:${port.id}:${building.id}`,
          portName: port.name,
          pos: [building.position[0], topY, building.position[2]],
          rep,
          range: playerMode === 'ship' ? FORT_SHIP_WARNING_RANGE : FORT_WALK_WARNING_RANGE,
          priority: building.type === 'landmark' ? 0 : 1,
        });
      }
      portBatteries
        .sort((a, b) => a.priority - b.priority)
        .slice(0, FORT_MAX_BATTERIES_PER_PORT)
        .forEach(({ priority: _priority, ...battery }) => out.push(battery));
    }
    return out;
  }, [devSoloPort, playerMode, ports, reputation]);

  const active = useMemo(() => {
    const pos = playerMode === 'walking' ? walkingPos : shipPos;
    return batteries.filter((battery) => {
      const dx = battery.pos[0] - pos[0];
      const dz = battery.pos[2] - pos[2];
      return dx * dx + dz * dz <= battery.range * battery.range;
    });
  }, [batteries, playerMode, shipPos, walkingPos]);

  const ringGeo = useMemo(() => new THREE.RingGeometry(4.4, 5.2, 48), []);
  const barrelGeo = useMemo(() => new THREE.BoxGeometry(0.7, 0.7, 5.4), []);
  const ringMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#ff8a24',
    transparent: true,
    opacity: 0.54,
    side: THREE.DoubleSide,
    depthWrite: false,
    toneMapped: false,
  }), []);
  const barrelMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#2b2924',
    emissive: '#ff7a1a',
    emissiveIntensity: 0.22,
    metalness: 0.35,
    roughness: 0.62,
  }), []);
  const ringRef = useRef<THREE.InstancedMesh>(null);
  const barrelRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useRef(new THREE.Object3D());
  const lastFireAt = useRef<Record<string, number>>({});

  useFrame(({ clock }) => {
    if (!ringRef.current || !barrelRef.current) return;
    const t = clock.elapsedTime;
    const now = Date.now();
    const targetPos = playerMode === 'ship' ? shipPos : walkingPos;
    ringMat.opacity = 0.36 + Math.sin(t * 4.8) * 0.16;
    const firingBatteryIds = new Set<string>();
    let firing = false;
    for (let i = 0; i < active.length; i++) {
      const battery = active[i];
      const [x, y, z] = battery.pos;
      const obj = dummy.current;
      if (disabledFortBatteries.has(battery.id)) {
        obj.position.set(0, -1000, 0);
        obj.scale.set(0, 0, 0);
        obj.updateMatrix();
        ringRef.current.setMatrixAt(i, obj.matrix);
        barrelRef.current.setMatrixAt(i, obj.matrix);
        continue;
      }
      const dx = targetPos[0] - x;
      const dz = targetPos[2] - z;
      const distSq = dx * dx + dz * dz;
      const pulse = 1 + Math.sin(t * 3.6 + i) * 0.08;
      obj.position.set(x, 0.18, z);
      obj.rotation.set(-Math.PI / 2, 0, 0);
      obj.scale.set(pulse, pulse, pulse);
      obj.updateMatrix();
      ringRef.current.setMatrixAt(i, obj.matrix);

      const origin = new THREE.Vector3(x, Math.max(y - 1.2, 2.2), z);
      const dist = Math.sqrt(distSq);
      const targetLift = Math.min(5.2, Math.max(1.1, dist * 0.028));
      const targetY = playerMode === 'ship' ? 1.4 + targetLift : targetPos[1] + 1.4;
      const target = new THREE.Vector3(targetPos[0], targetY, targetPos[2]);
      if (playerMode === 'ship') {
        const ship = getLiveShipTransform();
        const leadTime = Math.min(3.1, Math.max(0, dist / FORT_CANNON_SPEED) * 0.72);
        target.x += Math.sin(ship.rot) * ship.vel * leadTime;
        target.z += Math.cos(ship.rot) * ship.vel * leadTime;
      }
      const dir = target.clone().sub(origin).normalize();
      const recoilAge = now - (lastFireAt.current[battery.id] ?? 0);
      const recoil = recoilAge < 220 ? (1 - recoilAge / 220) * 1.05 : 0;
      obj.position.set(
        origin.x + dir.x * (2.0 - recoil),
        origin.y + dir.y * (2.0 - recoil),
        origin.z + dir.z * (2.0 - recoil),
      );
      obj.lookAt(origin.x + dir.x * 16, origin.y + dir.y * 16, origin.z + dir.z * 16);
      const barrelPulse = recoilAge < 220 ? 1.18 : 1;
      obj.scale.set(barrelPulse, barrelPulse, 1);
      obj.updateMatrix();
      barrelRef.current.setMatrixAt(i, obj.matrix);
      registerFortBatteryTarget({
        id: battery.id,
        portName: battery.portName,
        buildingId: battery.id.split(':').slice(2).join(':'),
        x: obj.position.x,
        y: obj.position.y,
        z: obj.position.z,
        radius: 2.0,
        updatedAt: now,
      });

      if (!warnedBatteryIds.current.has(battery.id)) {
        warnedBatteryIds.current.add(battery.id);
        const label = playerMode === 'ship'
          ? battery.rep <= FORT_SEVERE_THRESHOLD ? 'Harbor Guns Run Out' : 'Harbor Guns Watching'
          : 'Garrison Warning';
        spawnFloatingCombatText(x, y + 1.5, z, label, 'intent');
      }

      if (playerMode !== 'ship' || battery.rep > FORT_FIRE_THRESHOLD) continue;

      const notify = (label: string) => {
        const nextNotify = notifiedAt.current[battery.id] ?? 0;
        if (now < nextNotify) return;
        notifiedAt.current[battery.id] = now + 12000;
        useGameStore.getState().addNotification(label, 'warning', { subtitle: 'HOSTILE FORT' });
      };

      if (distSq <= FORT_CANNON_RANGE * FORT_CANNON_RANGE && now >= (cannonReloadAt.current[battery.id] ?? 0)) {
        cannonReloadAt.current[battery.id] = now + FORT_CANNON_RELOAD_MS;
        spawnProjectile(origin, dir, FORT_CANNON_SPEED, 'basilisk', {
          owner: 'npc',
          ownerId: battery.id,
          maxDistance: FORT_CANNON_RANGE + 35,
          damageScale: FORT_CANNON_DAMAGE_SCALE,
        });
        spawnMuzzleBurst(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, 1.35);
        sfxCannonFire('basilisk');
        lastFireAt.current[battery.id] = now;
        firingBatteryIds.add(battery.id);
        firing = true;
        spawnFloatingCombatText(x, y + 2.0, z, 'Fort Battery Fires', 'intent');
        window.dispatchEvent(new CustomEvent('npc-incoming-fire-intent', {
          detail: { label: 'Fort Battery', shipName: battery.portName, x, z },
        }));
        notify('The port battery opens fire.');
      } else if (distSq <= FORT_SWIVEL_RANGE * FORT_SWIVEL_RANGE && now >= (swivelReloadAt.current[battery.id] ?? 0)) {
        swivelReloadAt.current[battery.id] = now + FORT_SWIVEL_RELOAD_MS;
        spawnProjectile(origin, dir, FORT_SWIVEL_SPEED, 'swivelGun', {
          owner: 'npc',
          ownerId: battery.id,
          maxDistance: FORT_SWIVEL_RANGE + 25,
          damageScale: FORT_SWIVEL_DAMAGE_SCALE,
        });
        spawnMuzzleBurst(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, 0.85);
        sfxCannonFire('swivelGun');
        lastFireAt.current[battery.id] = now;
        firingBatteryIds.add(battery.id);
        firing = true;
        spawnFloatingCombatText(x, y + 1.8, z, 'Swivel Gun', 'intent');
        window.dispatchEvent(new CustomEvent('npc-incoming-fire-intent', {
          detail: { label: 'Fort Swivel', shipName: battery.portName, x, z },
        }));
        notify('The fort swivel guns fire from the wall.');
      }
    }
    ringRef.current.instanceMatrix.needsUpdate = true;
    barrelRef.current.instanceMatrix.needsUpdate = true;

    if (active.length > 0) {
      const nearest = active.reduce((best, battery) => {
        const bdx = targetPos[0] - battery.pos[0];
        const bdz = targetPos[2] - battery.pos[2];
        const bDistSq = bdx * bdx + bdz * bdz;
        return !best || bDistSq < best.distSq ? { battery, distSq: bDistSq } : best;
      }, null as { battery: typeof active[number]; distSq: number } | null);
      if (nearest) {
        setHostileFortThreat({
          portName: nearest.battery.portName,
          reputation: nearest.battery.rep,
          firing: firing || active.some((battery) => now - (lastFireAt.current[battery.id] ?? 0) < 900 || firingBatteryIds.has(battery.id)),
          batteryCount: active.length,
          x: nearest.battery.pos[0],
          z: nearest.battery.pos[2],
          updatedAt: now,
        });
      }
    } else {
      setHostileFortThreat(null);
    }
  });

  if (active.length === 0) {
    setHostileFortThreat(null);
    return null;
  }

  return (
    <group>
      <instancedMesh
        ref={ringRef}
        args={[ringGeo, ringMat, active.length]}
        frustumCulled={false}
        renderOrder={10}
      />
      <instancedMesh
        ref={barrelRef}
        args={[barrelGeo, barrelMat, active.length]}
        frustumCulled={false}
        renderOrder={11}
      />
    </group>
  );
}

// ── POI Beacons ──────────────────────────────────────────────────────────────
// One floating plumbob per enterable Point of Interest. It reuses the same
// diamond size and clearance as SacredBuildingMarkers, but colors each marker
// by semantic class so learned, mercantile, civic, royal, and religious POIs
// read differently at a glance.

type POIBeacon = {
  pos: [number, number, number];
  discovered: boolean;
  color: string;
  emissive: string;
  haloInner: string;
  haloMid: string;
  haloOuter: string;
};

const POI_BEACON_COLORS: Record<string, {
  color: string;
  emissive: string;
  haloInner: string;
  haloMid: string;
  haloOuter: string;
}> = {
  '#c4a1ff': {
    color: '#cc96ff',
    emissive: '#ad55ff',
    haloInner: 'rgba(220, 160, 255, 1.0)',
    haloMid: 'rgba(170, 90, 240, 0.45)',
    haloOuter: 'rgba(140, 70, 220, 0.0)',
  },
  '#e8c872': {
    color: '#f0d27f',
    emissive: '#d69b36',
    haloInner: 'rgba(255, 225, 145, 1.0)',
    haloMid: 'rgba(230, 175, 75, 0.46)',
    haloOuter: 'rgba(180, 120, 45, 0.0)',
  },
  '#9bc4e8': {
    color: '#9fd8ff',
    emissive: '#5fc8ff',
    haloInner: 'rgba(185, 235, 255, 1.0)',
    haloMid: 'rgba(95, 200, 255, 0.48)',
    haloOuter: 'rgba(60, 140, 220, 0.0)',
  },
  '#6dc3b0': {
    color: '#72d6c0',
    emissive: '#25aa93',
    haloInner: 'rgba(150, 245, 220, 1.0)',
    haloMid: 'rgba(80, 205, 175, 0.46)',
    haloOuter: 'rgba(40, 150, 125, 0.0)',
  },
  '#e89b9b': {
    color: '#f0aaa8',
    emissive: '#cf5e64',
    haloInner: 'rgba(255, 190, 185, 1.0)',
    haloMid: 'rgba(220, 100, 105, 0.46)',
    haloOuter: 'rgba(160, 55, 65, 0.0)',
  },
};

function makeHaloTexture(colors: POIBeacon['haloInner' | 'haloMid' | 'haloOuter'][]) {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0.0, colors[0]);
  grad.addColorStop(0.45, colors[1]);
  grad.addColorStop(1.0, colors[2]);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function POIBeacons({ ports }: { ports: PortsProp }) {
  const visible = useGameStore((state) => state.renderDebug.poiBeacons);
  const devSoloPort = useGameStore((state) => state.devSoloPort);
  const discoveredPOIs = useGameStore((state) => state.discoveredPOIs);

  const beacons = useMemo(() => {
    if (!visible) return [] as POIBeacon[];
    const visiblePorts = devSoloPort
      ? ports.filter((p) => p.id === devSoloPort)
      : ports;
    const out: POIBeacon[] = [];
    for (const port of visiblePorts) {
      for (const poi of getPOIsForPort(port)) {
        // Natural features (volcanoes, etc.) bring their own self-evident
        // visual marker — a glowing emissive crater + smoke column makes the
        // cyan pillar redundant and visually noisy. Skip the beacon; the
        // minimap dot + walk/sail proximity toast still fire.
        if (poi.kind === 'natural') continue;
        // Unified resolver — same snapped position the silhouettes,
        // bespoke renderers, and minimap all consume. Returns null when
        // no valid cell exists within 78u, in which case skip the beacon
        // entirely (matches the silhouette's own skip).
        const placed = resolveSnappedPOI(poi, port);
        if (!placed) continue;
        let baseY: number;
        if (poi.location.kind === 'landmark') {
          // Lift to roofline of the bound landmark so the pillar reads above
          // it instead of clipping through. Buildings carry a [w, h, d] scale
          // and the y-component is height. Look the building back up — the
          // unified resolver only returns x/z.
          const lid = poi.location.landmarkId;
          const b = port.buildings.find((bb) => bb.type === 'landmark' && bb.landmarkId === lid) as
            | { position: [number, number, number]; scale?: [number, number, number] }
            | undefined;
          if (!b) continue;
          baseY = b.position[1] + (b.scale ? b.scale[1] * 2 : 8);
        } else if (poi.kind === 'wreck') {
          baseY = SEA_LEVEL;
        } else {
          baseY = getTerrainHeight(placed.x, placed.z);
        }
        const style = SEMANTIC_STYLE[poi.class];
        const colors = POI_BEACON_COLORS[style.color] ?? POI_BEACON_COLORS['#9bc4e8'];
        out.push({
          pos: [placed.x, Math.max(baseY, SEA_LEVEL) + 14, placed.z],
          discovered: discoveredPOIs.includes(poi.id),
          ...colors,
        });
      }
    }
    return out;
  }, [devSoloPort, ports, visible, discoveredPOIs]);

  const groupedBeacons = useMemo(() => {
    const groups = new Map<string, POIBeacon[]>();
    for (const beacon of beacons) {
      const key = beacon.color;
      groups.set(key, [...(groups.get(key) ?? []), beacon]);
    }
    return Array.from(groups.values());
  }, [beacons]);

  const diamondGeo = useMemo(() => new THREE.OctahedronGeometry(1.55, 0), []);
  const haloGeo = useMemo(() => new THREE.PlaneGeometry(1, 1), []);
  const materials = useMemo(() => groupedBeacons.map((group) => {
    const colors = group[0];
    const haloTex = makeHaloTexture([colors.haloInner, colors.haloMid, colors.haloOuter]);
    return {
      diamond: new THREE.MeshStandardMaterial({
        color: colors.color,
        emissive: colors.emissive,
        emissiveIntensity: 2.3,
        metalness: 0.15,
        roughness: 0.22,
        transparent: true,
        opacity: 0.93,
        toneMapped: false,
      }),
      halo: new THREE.MeshBasicMaterial({
        map: haloTex,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
        opacity: 0.9,
      }),
    };
  }), [groupedBeacons]);

  const diamondRefs = useRef<Array<THREE.InstancedMesh | null>>([]);
  const haloRefs = useRef<Array<THREE.InstancedMesh | null>>([]);
  const dummy = useRef(new THREE.Object3D());

  useFrame(({ clock, camera }) => {
    if (!visible) return;
    const t = clock.elapsedTime;
    for (let groupIndex = 0; groupIndex < groupedBeacons.length; groupIndex++) {
      const group = groupedBeacons[groupIndex];
      const diamondRef = diamondRefs.current[groupIndex];
      const haloRef = haloRefs.current[groupIndex];
      if (!diamondRef || !haloRef) continue;
      const material = materials[groupIndex];
      material.diamond.emissiveIntensity = 2.1 + Math.sin(t * 3.1) * 0.45;
      material.halo.opacity = 0.65 + Math.sin(t * 2.2) * 0.22;

      for (let i = 0; i < group.length; i++) {
        const b = group[i];
        const pulse = b.discovered
          ? 0.92 + Math.sin(t * 2.2) * 0.08
          : 0.96 + Math.sin(t * 2.6 + i * 0.5) * 0.13;
        const [px, py, pz] = b.pos;
        const bob = Math.sin(t * 1.6 + i * 0.7) * 0.38;
        const obj = dummy.current;
        obj.position.set(px, py + bob, pz);
        obj.rotation.set(0, t * 1.1 + i, 0);
        obj.scale.set(pulse, pulse * 1.15, pulse);
        obj.updateMatrix();
        diamondRef.setMatrixAt(i, obj.matrix);

        obj.position.set(px, py + bob - 0.5, pz);
        obj.quaternion.copy(camera.quaternion);
        const haloPulse = 4.4 + Math.sin(t * 2.2 + i) * 0.5;
        obj.scale.set(haloPulse, haloPulse, haloPulse);
        obj.updateMatrix();
        haloRef.setMatrixAt(i, obj.matrix);
      }
      diamondRef.instanceMatrix.needsUpdate = true;
      haloRef.instanceMatrix.needsUpdate = true;
    }
  });

  if (!visible || beacons.length === 0) return null;

  return (
    <group>
      {groupedBeacons.map((group, index) => (
        <group key={group[0].color}>
          <instancedMesh
            ref={(ref) => { haloRefs.current[index] = ref; }}
            args={[haloGeo, materials[index].halo, group.length]}
            frustumCulled={false}
            renderOrder={8}
          />
          <instancedMesh
            ref={(ref) => { diamondRefs.current[index] = ref; }}
            args={[diamondGeo, materials[index].diamond, group.length]}
            frustumCulled={false}
            renderOrder={9}
          />
        </group>
      ))}
    </group>
  );
}
