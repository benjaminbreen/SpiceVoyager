import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '../../../store/gameStore';
import { buildingCollapseEvents, getBuildingDamageStage } from '../../../utils/impactShakeState';
import { hashString, mulberry32, varyColor } from '../cityRandom';
import type { BuildingFlameSource, CollapseDustSource, DamageSmokeSpot, RuinMarker, SmokeSpot, TorchSpot } from '../cityTypes';

type PortsProp = ReturnType<typeof useGameStore.getState>['ports'];

export function collectDamageSmokeSpots(ports: PortsProp): DamageSmokeSpot[] {
  const spots: DamageSmokeSpot[] = [];
  ports.forEach((port) => {
    port.buildings.forEach((b, bi) => {
      const stage = getBuildingDamageStage(b.id);
      if (stage === 'intact') return;
      const intensity = stage === 'destroyed' ? 1 : stage === 'heavilyDamaged' ? 0.72 : 0.42;
      const count = stage === 'destroyed' ? 3 : stage === 'heavilyDamaged' ? 2 : 1;
      for (let i = 0; i < count; i++) {
        const spread = count === 1 ? 0 : (i - (count - 1) * 0.5) * Math.min(1.1, b.scale[0] * 0.14);
        spots.push({
          pos: [b.position[0] + spread, b.position[1] + b.scale[1] + 0.5, b.position[2] + spread * 0.4],
          seed: bi * 173 + i * 37 + ((b.position[0] + b.position[2]) * 10 | 0),
          intensity,
        });
      }
    });
  });
  return spots;
}

export function collectRuinedBuildingDebris(ports: PortsProp): RuinMarker[] {
  const ruins: RuinMarker[] = [];
  ports.forEach((port) => {
    port.buildings.forEach((b) => {
      if (getBuildingDamageStage(b.id) !== 'destroyed') return;
      const rng = mulberry32(hashString(b.id));
      const wallColor = varyColor([0.055, 0.050, 0.045], rng, 0.035);
      const roofColor = varyColor([0.070, 0.045, 0.030], rng, 0.035);
      ruins.push({
        pos: [b.position[0], b.position[1] + Math.max(0.35, b.scale[1] * 0.16), b.position[2]],
        scale: [Math.max(1.1, b.scale[0] * 0.72), Math.max(0.4, b.scale[1] * 0.18), Math.max(1.1, b.scale[2] * 0.6)],
        rot: [-0.18, b.rotation + 0.35, 0.14],
        color: wallColor,
      });
      ruins.push({
        pos: [b.position[0] + Math.sin(b.rotation) * 0.7, b.position[1] + Math.max(0.6, b.scale[1] * 0.28), b.position[2] + Math.cos(b.rotation) * 0.7],
        scale: [Math.max(0.5, b.scale[0] * 0.16), Math.max(0.9, b.scale[1] * 0.45), Math.max(0.4, b.scale[2] * 0.12)],
        rot: [0.22, b.rotation - 0.4, -0.12],
        color: wallColor,
      });
      for (let i = 0; i < 7; i++) {
        const lx = (rng() - 0.5) * b.scale[0] * 0.9;
        const lz = (rng() - 0.5) * b.scale[2] * 0.85;
        const rx = lx * Math.cos(b.rotation) - lz * Math.sin(b.rotation);
        const rz = lx * Math.sin(b.rotation) + lz * Math.cos(b.rotation);
        const isRoof = i < 3;
        ruins.push({
          pos: [
            b.position[0] + rx,
            b.position[1] + 0.18 + rng() * Math.max(0.35, b.scale[1] * 0.18),
            b.position[2] + rz,
          ],
          scale: [
            0.28 + rng() * Math.max(0.55, b.scale[0] * 0.18),
            isRoof ? 0.10 + rng() * 0.12 : 0.18 + rng() * 0.24,
            0.24 + rng() * Math.max(0.5, b.scale[2] * 0.16),
          ],
          rot: [
            (rng() - 0.5) * 0.65,
            b.rotation + (rng() - 0.5) * Math.PI,
            (rng() - 0.5) * 0.55,
          ],
          color: isRoof ? roofColor : wallColor,
        });
      }
    });
  });
  return ruins;
}

export function collectCollapseDustSources(ports: PortsProp): CollapseDustSource[] {
  const sources: CollapseDustSource[] = [];
  ports.forEach((port) => {
    port.buildings.forEach((b) => {
      sources.push({
        pos: [b.position[0], b.position[1] + Math.max(0.45, b.scale[1] * 0.2), b.position[2]],
        scale: b.scale,
        buildingId: b.id,
        seed: hashString(b.id),
      });
    });
  });
  return sources;
}

export function collectDestructionFlames(ports: PortsProp): BuildingFlameSource[] {
  const flames: BuildingFlameSource[] = [];
  ports.forEach((port) => {
    port.buildings.forEach((b) => {
      if (getBuildingDamageStage(b.id) !== 'destroyed') return;
      const seed = hashString(b.id);
      if ((seed & 1) !== 0) return;
      const rng = mulberry32(seed ^ 0xa53c9e2d);
      const count = b.scale[0] * b.scale[2] > 28 ? 2 : 1;
      for (let i = 0; i < count; i++) {
        const lx = (rng() - 0.5) * b.scale[0] * 0.45;
        const lz = (rng() - 0.5) * b.scale[2] * 0.45;
        const rx = lx * Math.cos(b.rotation) - lz * Math.sin(b.rotation);
        const rz = lx * Math.sin(b.rotation) + lz * Math.cos(b.rotation);
        flames.push({
          pos: [
            b.position[0] + rx,
            b.position[1] + Math.max(0.75, b.scale[1] * 0.42) + rng() * 0.45,
            b.position[2] + rz,
          ],
          scale: Math.max(0.75, Math.min(1.45, Math.max(b.scale[0], b.scale[2]) * 0.18)) * (0.85 + rng() * 0.35),
          seed: seed + i * 911,
        });
      }
    });
  });
  return flames;
}

// ── Torch Lights ──────────────────────────────────────────────────────────────
// Renders emissive flame spheres (instanced, all ports) + limited PointLights
// for actual illumination (max 6 to keep draw calls sane).

export function CityTorches({ spots }: { spots: TorchSpot[] }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const haloRef = useRef<THREE.InstancedMesh>(null);
  const lightsRef = useRef<(THREE.PointLight | null)[]>([]);

  const flameGeo = useMemo(() => new THREE.SphereGeometry(1, 6, 6), []);
  const flameMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#ff6600',
    emissive: '#ff8822',
    emissiveIntensity: 0,
    toneMapped: false,
    transparent: true,
    opacity: 0,
  }), []);

  // Horizontal disc for each torch halo — reads as a ground-glow in the
  // default top-down camera. Plane is rotated flat and additively blended.
  const haloGeo = useMemo(() => {
    const g = new THREE.PlaneGeometry(1, 1);
    g.rotateX(-Math.PI / 2);
    return g;
  }, []);

  const haloTexture = useMemo(() => {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0.0, 'rgba(255, 190, 110, 1.0)');
    grad.addColorStop(0.35, 'rgba(255, 140, 60, 0.45)');
    grad.addColorStop(1.0, 'rgba(255, 100, 40, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, []);

  const haloMat = useMemo(() => new THREE.MeshBasicMaterial({
    map: haloTexture,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    opacity: 0,
  }), [haloTexture]);

  // Position all flame instances once
  useEffect(() => {
    if (!meshRef.current || spots.length === 0) return;
    const dummy = new THREE.Object3D();
    spots.forEach((s, i) => {
      const destroyed = getBuildingDamageStage(s.buildingId) === 'destroyed';
      dummy.position.set(s.pos[0], s.pos[1], s.pos[2]);
      dummy.scale.set(destroyed ? 0.0001 : 0.225, destroyed ? 0.0001 : 0.35, destroyed ? 0.0001 : 0.225);
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [spots]);

  // Position halo discs once (per-instance scale wobble happens in useFrame)
  useEffect(() => {
    if (!haloRef.current || spots.length === 0) return;
    const dummy = new THREE.Object3D();
    spots.forEach((s, i) => {
      const destroyed = getBuildingDamageStage(s.buildingId) === 'destroyed';
      dummy.position.set(s.pos[0], s.pos[1] + 0.05, s.pos[2]);
      dummy.scale.setScalar(destroyed ? 0.0001 : 2.6);
      dummy.updateMatrix();
      haloRef.current!.setMatrixAt(i, dummy.matrix);
    });
    haloRef.current.instanceMatrix.needsUpdate = true;
  }, [spots]);

  // Per-torch phase offsets so each flame flickers independently
  const phaseOffsets = useMemo(
    () => spots.map((_, i) => {
      const h = ((i + 1) * 2654435761) >>> 0;
      return (h / 0xffffffff) * Math.PI * 2;
    }),
    [spots],
  );
  const dummyRef = useRef(new THREE.Object3D());

  // Animate flame intensity + point light brightness based on time of day
  useFrame(({ clock }) => {
    const timeOfDay = useGameStore.getState().timeOfDay;
    const sunAngle = ((timeOfDay - 6) / 24) * Math.PI * 2;
    const sunH = Math.sin(sunAngle);
    const nightFactor = Math.max(0, Math.min(1, (0.1 - sunH) / 0.3));

    const t = clock.elapsedTime;
    // Shared material gets a gentle baseline drift (can't be per-instance without a custom shader)
    const baseFlicker = 0.9 + Math.sin(t * 2.3) * 0.05;
    flameMat.emissiveIntensity = nightFactor * 3.0 * baseFlicker;
    flameMat.opacity = nightFactor * 0.85;
    haloMat.opacity = nightFactor * 0.45 * baseFlicker;

    // Per-instance scale flicker reads as brightness variation since the flame is a small glow
    if (meshRef.current && nightFactor > 0) {
      const dummy = dummyRef.current;
      for (let i = 0; i < spots.length; i++) {
        const destroyed = getBuildingDamageStage(spots[i].buildingId) === 'destroyed';
        const phase = phaseOffsets[i];
        const f =
          0.78 +
          Math.sin(t * 7.3 + phase) * 0.12 +
          Math.sin(t * 13.1 + phase * 1.7) * 0.07 +
          Math.sin(t * 3.7 + phase * 0.5) * 0.05;
        const s = spots[i].pos;
        dummy.position.set(s[0], s[1], s[2]);
        dummy.scale.set(
          destroyed ? 0.0001 : 0.225 * f,
          destroyed ? 0.0001 : 0.35 * f,
          destroyed ? 0.0001 : 0.225 * f,
        );
        dummy.updateMatrix();
        meshRef.current.setMatrixAt(i, dummy.matrix);
      }
      meshRef.current.instanceMatrix.needsUpdate = true;
    }

    // Halo discs: gentler per-instance wobble so the warm bleed around each torch breathes
    if (haloRef.current && nightFactor > 0) {
      const dummy = dummyRef.current;
      for (let i = 0; i < spots.length; i++) {
        const destroyed = getBuildingDamageStage(spots[i].buildingId) === 'destroyed';
        const phase = phaseOffsets[i];
        const h =
          0.92 +
          Math.sin(t * 4.1 + phase * 0.8) * 0.06 +
          Math.sin(t * 9.3 + phase * 1.3) * 0.03;
        const s = spots[i].pos;
        dummy.position.set(s[0], s[1] + 0.05, s[2]);
        const scale = destroyed ? 0.0001 : 2.6 * h;
        dummy.scale.set(scale, scale, scale);
        dummy.updateMatrix();
        haloRef.current.setMatrixAt(i, dummy.matrix);
      }
      haloRef.current.instanceMatrix.needsUpdate = true;
    }

    // PointLights each get their own phase
    for (let i = 0; i < lightsRef.current.length; i++) {
      const light = lightsRef.current[i];
      if (!light) continue;
      const phase = phaseOffsets[i];
      const destroyed = getBuildingDamageStage(spots[i].buildingId) === 'destroyed';
      const lf =
        0.82 +
        Math.sin(t * 7.3 + phase) * 0.09 +
        Math.sin(t * 13.1 + phase * 1.7) * 0.05 +
        Math.sin(t * 3.7 + phase) * 0.04;
      light.intensity = destroyed ? 0 : nightFactor * 4 * lf;
    }
  });

  if (spots.length === 0) return null;

  // Only create PointLights for first 6 torch spots (performance budget)
  const lightCount = Math.min(spots.length, 6);

  return (
    <group>
      <instancedMesh
        ref={haloRef}
        args={[haloGeo, haloMat, spots.length]}
        frustumCulled={false}
        renderOrder={1}
      />
      <instancedMesh ref={meshRef} args={[flameGeo, flameMat, spots.length]} frustumCulled={false} />
      {spots.slice(0, lightCount).map((s, i) => (
        <pointLight
          key={i}
          ref={(el) => { lightsRef.current[i] = el; }}
          position={s.pos}
          color="#ff8833"
          intensity={0}
          distance={18}
          decay={2}
        />
      ))}
    </group>
  );
}

// ── Chimney Smoke ─────────────────────────────────────────────────────────────
// Each smoking chimney spawns 3 instanced puffs that rise, drift, expand, and
// fade in a looping cycle. Uses a single InstancedMesh for all puffs.

const PUFFS_PER_CHIMNEY = 3;
const PUFF_CYCLE = 4.0; // seconds for one puff to rise and fade

export function ChimneySmoke({ spots }: { spots: SmokeSpot[] }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummyRef = useRef(new THREE.Object3D());
  const lastUpdateRef = useRef(0);

  const puffGeo = useMemo(() => new THREE.SphereGeometry(1, 6, 5), []);
  const puffMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#9a9590',
    transparent: true,
    opacity: 0.25,
    depthWrite: false,
    roughness: 1,
  }), []);

  const totalPuffs = spots.length * PUFFS_PER_CHIMNEY;

  useFrame(({ clock }) => {
    if (!meshRef.current || totalPuffs === 0) return;
    const t = clock.elapsedTime;
    if (t - lastUpdateRef.current < 0.05) return; // ~20fps
    lastUpdateRef.current = t;
    const dummy = dummyRef.current;

    for (let si = 0; si < spots.length; si++) {
      const spot = spots[si];
      const baseSeed = spot.seed * 0.01;

      for (let p = 0; p < PUFFS_PER_CHIMNEY; p++) {
        const idx = si * PUFFS_PER_CHIMNEY + p;
        // Stagger each puff's phase
        const phase = (t + baseSeed + p * (PUFF_CYCLE / PUFFS_PER_CHIMNEY)) % PUFF_CYCLE;
        const progress = phase / PUFF_CYCLE; // 0..1

        // Rise upward, drift slightly in wind
        const rise = progress * 3.5;
        const drift = Math.sin(baseSeed + t * 0.3) * progress * 0.8;
        const driftZ = Math.cos(baseSeed * 1.7 + t * 0.2) * progress * 0.4;

        // Expand as it rises
        const scale = 0.15 + progress * 0.35;

        // Fade out toward end of cycle
        const alpha = progress < 0.15
          ? progress / 0.15           // fade in
          : 1.0 - (progress - 0.15) / 0.85; // fade out

        dummy.position.set(
          spot.pos[0] + drift,
          spot.pos[1] + rise,
          spot.pos[2] + driftZ,
        );
        dummy.scale.setScalar(scale * Math.max(0.01, alpha));
        dummy.updateMatrix();
        meshRef.current!.setMatrixAt(idx, dummy.matrix);
      }
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  if (totalPuffs === 0) return null;

  return (
    <instancedMesh ref={meshRef} args={[puffGeo, puffMat, totalPuffs]} />
  );
}

const DAMAGE_PUFFS_PER_SOURCE = 4;
const DAMAGE_PUFF_CYCLE = 3.2;

export function BuildingDamageSmoke({ spots }: { spots: DamageSmokeSpot[] }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummyRef = useRef(new THREE.Object3D());
  const lastUpdateRef = useRef(0);

  const puffGeo = useMemo(() => new THREE.SphereGeometry(1, 6, 5), []);
  const puffMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#605c58',
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
    roughness: 1,
  }), []);

  const totalPuffs = spots.length * DAMAGE_PUFFS_PER_SOURCE;

  useFrame(({ clock }) => {
    if (!meshRef.current || totalPuffs === 0) return;
    const t = clock.elapsedTime;
    if (t - lastUpdateRef.current < 0.05) return; // ~20fps
    lastUpdateRef.current = t;
    const dummy = dummyRef.current;

    for (let si = 0; si < spots.length; si++) {
      const spot = spots[si];
      const baseSeed = spot.seed * 0.013;
      for (let p = 0; p < DAMAGE_PUFFS_PER_SOURCE; p++) {
        const idx = si * DAMAGE_PUFFS_PER_SOURCE + p;
        const phase = (t + baseSeed + p * (DAMAGE_PUFF_CYCLE / DAMAGE_PUFFS_PER_SOURCE)) % DAMAGE_PUFF_CYCLE;
        const progress = phase / DAMAGE_PUFF_CYCLE;
        const rise = progress * (4.5 + spot.intensity * 2.8);
        const drift = Math.sin(baseSeed + t * 0.35) * progress * (0.6 + spot.intensity * 0.9);
        const driftZ = Math.cos(baseSeed * 1.9 + t * 0.25) * progress * (0.35 + spot.intensity * 0.5);
        const scale = (0.18 + progress * 0.42) * (0.8 + spot.intensity * 0.9);
        const alpha = progress < 0.12
          ? progress / 0.12
          : 1.0 - (progress - 0.12) / 0.88;

        dummy.position.set(
          spot.pos[0] + drift,
          spot.pos[1] + rise,
          spot.pos[2] + driftZ,
        );
        dummy.scale.setScalar(scale * Math.max(0.01, alpha));
        dummy.updateMatrix();
        meshRef.current.setMatrixAt(idx, dummy.matrix);
      }
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  if (totalPuffs === 0) return null;
  return <instancedMesh ref={meshRef} args={[puffGeo, puffMat, totalPuffs]} frustumCulled={false} />;
}

export function RuinedBuildingDebris({ ruins }: { ruins: RuinMarker[] }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummyRef = useRef(new THREE.Object3D());
  const colorRef = useRef(new THREE.Color());
  const geo = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 1,
  }), []);

  useEffect(() => {
    if (!meshRef.current) return;
    const dummy = dummyRef.current;
    const color = colorRef.current;
    ruins.forEach((r, i) => {
      dummy.position.set(...r.pos);
      dummy.scale.set(...r.scale);
      dummy.rotation.set(...r.rot);
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);
      color.setRGB(r.color[0], r.color[1], r.color[2]);
      meshRef.current!.setColorAt(i, color);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
  }, [ruins]);

  if (ruins.length === 0) return null;
  return <instancedMesh ref={meshRef} args={[geo, mat, ruins.length]} frustumCulled={false} />;
}

const COLLAPSE_DUST_PUFFS = 12;
const COLLAPSE_DUST_DURATION = 1.8;
const MAX_BUILDING_COLLAPSE_PUFFS = COLLAPSE_DUST_PUFFS * 12;

export function BuildingCollapseDust({ sources }: { sources: CollapseDustSource[] }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummyRef = useRef(new THREE.Object3D());
  const lastUpdateRef = useRef(0);

  const sourceById = useMemo(() => {
    const map = new Map<string, CollapseDustSource>();
    sources.forEach((s) => map.set(s.buildingId, s));
    return map;
  }, [sources]);

  const puffGeo = useMemo(() => new THREE.SphereGeometry(1, 7, 5), []);
  const puffMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#756c62',
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
    roughness: 1,
  }), []);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const dummy = dummyRef.current;
    dummy.scale.setScalar(0.0001);
    dummy.updateMatrix();
    for (let i = 0; i < MAX_BUILDING_COLLAPSE_PUFFS; i++) {
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, []);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const now = Date.now() * 0.001;
    if (now - lastUpdateRef.current < 0.035) return;
    lastUpdateRef.current = now;

    const dummy = dummyRef.current;
    let idx = 0;
    for (const ev of buildingCollapseEvents) {
      const src = sourceById.get(ev.buildingId);
      if (!src) continue;
      const age = now - ev.time;
      if (age < 0 || age > COLLAPSE_DUST_DURATION) continue;
      const progress = age / COLLAPSE_DUST_DURATION;
      const alpha = progress < 0.18 ? progress / 0.18 : 1 - (progress - 0.18) / 0.82;
      const rng = mulberry32(src.seed);
      for (let p = 0; p < COLLAPSE_DUST_PUFFS; p++) {
        const angle = rng() * Math.PI * 2;
        const radius = (0.35 + rng() * 0.75) * Math.max(src.scale[0], src.scale[2]) * (0.28 + progress * 0.55);
        const lift = progress * (1.4 + rng() * 1.8) * ev.intensity;
        const sx = 0.65 + rng() * 0.9;
        dummy.position.set(
          src.pos[0] + Math.cos(angle) * radius,
          src.pos[1] + lift + rng() * 0.4,
          src.pos[2] + Math.sin(angle) * radius,
        );
        dummy.scale.setScalar((0.25 + progress * 0.9) * sx * ev.intensity * Math.max(0.01, alpha));
        dummy.updateMatrix();
        mesh.setMatrixAt(idx, dummy.matrix);
        idx++;
      }
    }
    for (; idx < MAX_BUILDING_COLLAPSE_PUFFS; idx++) {
      dummy.scale.setScalar(0.0001);
      dummy.updateMatrix();
      mesh.setMatrixAt(idx, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return <instancedMesh ref={meshRef} args={[puffGeo, puffMat, MAX_BUILDING_COLLAPSE_PUFFS]} frustumCulled={false} />;
}

export function BuildingDestructionFlames({ sources }: { sources: BuildingFlameSource[] }) {
  const flameRef = useRef<THREE.InstancedMesh>(null);
  const haloRef = useRef<THREE.InstancedMesh>(null);
  const lightsRef = useRef<(THREE.PointLight | null)[]>([]);
  const dummyRef = useRef(new THREE.Object3D());

  const flameGeo = useMemo(() => new THREE.SphereGeometry(1, 7, 7), []);
  const flameMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#ff7a18',
    transparent: true,
    opacity: 0.92,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  }), []);
  const haloGeo = useMemo(() => {
    const g = new THREE.PlaneGeometry(1, 1);
    g.rotateX(-Math.PI / 2);
    return g;
  }, []);
  const haloTexture = useMemo(() => {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0.0, 'rgba(255, 180, 70, 1.0)');
    grad.addColorStop(0.38, 'rgba(255, 85, 18, 0.50)');
    grad.addColorStop(1.0, 'rgba(255, 40, 0, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, []);
  const haloMat = useMemo(() => new THREE.MeshBasicMaterial({
    map: haloTexture,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    opacity: 0.7,
    toneMapped: false,
  }), [haloTexture]);

  useFrame(({ clock }) => {
    const flameMesh = flameRef.current;
    const haloMesh = haloRef.current;
    if (!flameMesh || !haloMesh) return;
    const dummy = dummyRef.current;
    const t = clock.elapsedTime;
    for (let i = 0; i < sources.length; i++) {
      const s = sources[i];
      const phase = (s.seed % 997) * 0.031;
      const flicker = 0.84
        + Math.sin(t * 9.4 + phase) * 0.13
        + Math.sin(t * 16.7 + phase * 1.7) * 0.07;
      dummy.position.set(s.pos[0], s.pos[1], s.pos[2]);
      dummy.scale.set(0.33 * s.scale * flicker, 0.68 * s.scale * (0.9 + flicker * 0.25), 0.33 * s.scale * flicker);
      dummy.updateMatrix();
      flameMesh.setMatrixAt(i, dummy.matrix);

      dummy.position.set(s.pos[0], s.pos[1] - 0.45 * s.scale, s.pos[2]);
      const haloScale = 3.2 * s.scale * (0.88 + flicker * 0.12);
      dummy.scale.set(haloScale, haloScale, haloScale);
      dummy.updateMatrix();
      haloMesh.setMatrixAt(i, dummy.matrix);
    }
    flameMesh.instanceMatrix.needsUpdate = true;
    haloMesh.instanceMatrix.needsUpdate = true;

    for (let i = 0; i < lightsRef.current.length; i++) {
      const light = lightsRef.current[i];
      if (!light) continue;
      const s = sources[i];
      const phase = (s.seed % 997) * 0.031;
      const flicker = 0.8 + Math.sin(t * 8.7 + phase) * 0.16 + Math.sin(t * 18.1 + phase) * 0.06;
      light.intensity = 3.8 * flicker * s.scale;
    }
  });

  if (sources.length === 0) return null;
  const lightCount = Math.min(sources.length, 5);
  return (
    <group>
      <instancedMesh ref={haloRef} args={[haloGeo, haloMat, sources.length]} frustumCulled={false} renderOrder={2} />
      <instancedMesh ref={flameRef} args={[flameGeo, flameMat, sources.length]} frustumCulled={false} renderOrder={3} />
      {sources.slice(0, lightCount).map((s, i) => (
        <pointLight
          key={i}
          ref={(el) => { lightsRef.current[i] = el; }}
          position={s.pos}
          color="#ff7a24"
          intensity={0}
          distance={14}
          decay={2}
        />
      ))}
    </group>
  );
}
