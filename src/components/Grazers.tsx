import { useMemo, useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { getLiveShipTransform } from '../utils/livePlayerTransform';

// ── Types ────────────────────────────────────────────────────────────────────
export interface GrazerEntry {
  position: [number, number, number];
  rotation: number;
  color: [number, number, number];
  scale: number;
  speedMult: number;
}

// ── Mutable runtime state for scatter behavior ───────────────────────────────
interface GrazerOffset { dx: number; dz: number; }
let _offsets: GrazerOffset[] = [];

// ── Constants ────────────────────────────────────────────────────────────────
const SCATTER_SQ = 22 * 22;      // flee when player within 22 units
const FLEE_SPEED = 0.18;
const RETURN_DECAY = 0.985;       // how fast they drift back to spawn
const MAX_FLEE_DIST = 40;
const MAX_FLEE_SQ = MAX_FLEE_DIST * MAX_FLEE_DIST;
const ANIM_RANGE_SQ = 120 * 120;

// ── Component ────────────────────────────────────────────────────────────────
export function Grazers({ data, shadowsActive }: { data: GrazerEntry[]; shadowsActive: boolean }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummyRef = useRef(new THREE.Object3D());

  // Quadruped geometry: body ellipsoid + head + 4 legs + tail nub
  const geometry = useMemo(() => {
    const body = new THREE.SphereGeometry(0.3, 6, 4);
    body.scale(1.5, 0.75, 0.8);
    const head = new THREE.SphereGeometry(0.11, 5, 3);
    head.translate(0.48, 0.1, 0);
    const legFL = new THREE.CylinderGeometry(0.035, 0.03, 0.38, 3);
    legFL.translate(0.2, -0.28, 0.12);
    const legFR = new THREE.CylinderGeometry(0.035, 0.03, 0.38, 3);
    legFR.translate(0.2, -0.28, -0.12);
    const legBL = new THREE.CylinderGeometry(0.035, 0.03, 0.38, 3);
    legBL.translate(-0.22, -0.28, 0.12);
    const legBR = new THREE.CylinderGeometry(0.035, 0.03, 0.38, 3);
    legBR.translate(-0.22, -0.28, -0.12);
    const tail = new THREE.ConeGeometry(0.03, 0.12, 3);
    tail.rotateX(0.4);
    tail.translate(-0.45, 0.08, 0);
    const merged = mergeGeometries([body, head, legFL, legFR, legBL, legBR, tail]);
    [body, head, legFL, legFR, legBL, legBR, tail].forEach(g => g.dispose());
    return merged ?? new THREE.BoxGeometry(0.5, 0.3, 0.3);
  }, []);

  const material = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.85,
    metalness: 0.0,
  }), []);

  // Init offsets + set initial matrices and per-instance colors
  useEffect(() => {
    _offsets = data.map(() => ({ dx: 0, dz: 0 }));
    if (!meshRef.current) return;
    const dummy = dummyRef.current;
    const col = new THREE.Color();
    data.forEach((g, i) => {
      const s = g.scale;
      dummy.position.set(g.position[0], g.position[1], g.position[2]);
      dummy.scale.set(s, s, s);
      dummy.rotation.set(0, g.rotation, 0);
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);
      col.setRGB(g.color[0], g.color[1], g.color[2]);
      meshRef.current!.setColorAt(i, col);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
  }, [data]);

  // Scatter animation
  useFrame(({ clock }) => {
    if (!meshRef.current || _offsets.length !== data.length) return;
    const time = clock.getElapsedTime();
    const dummy = dummyRef.current;
    const playerPos = getLiveShipTransform().pos;
    const px = playerPos[0];
    const pz = playerPos[2];
    let anyUpdated = false;

    data.forEach((g, i) => {
      const spawnX = g.position[0];
      const spawnZ = g.position[2];
      const off = _offsets[i];
      const curX = spawnX + off.dx;
      const curZ = spawnZ + off.dz;

      const toPlayerX = curX - px;
      const toPlayerZ = curZ - pz;
      const distSq = toPlayerX * toPlayerX + toPlayerZ * toPlayerZ;

      // Skip distant grazers that aren't displaced
      if (distSq > ANIM_RANGE_SQ && off.dx * off.dx + off.dz * off.dz < 1) return;
      anyUpdated = true;

      if (distSq < SCATTER_SQ) {
        const dist = Math.sqrt(distSq) || 1;
        off.dx += (toPlayerX / dist) * FLEE_SPEED * g.speedMult;
        off.dz += (toPlayerZ / dist) * FLEE_SPEED * g.speedMult;
      } else {
        off.dx *= RETURN_DECAY;
        off.dz *= RETURN_DECAY;
      }

      // Clamp max flee distance
      const fleeDistSq = off.dx * off.dx + off.dz * off.dz;
      if (fleeDistSq > MAX_FLEE_SQ) {
        const clamp = MAX_FLEE_DIST / Math.sqrt(fleeDistSq);
        off.dx *= clamp;
        off.dz *= clamp;
      }

      const s = g.scale;
      const finalX = spawnX + off.dx;
      const finalZ = spawnZ + off.dz;
      const isFleeing = distSq < SCATTER_SQ * 2;
      const headBob = isFleeing ? 0 : Math.sin(time * 0.8 + i * 2.1) * 0.03;

      dummy.position.set(finalX, g.position[1] + headBob, finalZ);
      const facing = isFleeing && fleeDistSq > 0.5
        ? -Math.atan2(off.dz, off.dx)
        : g.rotation;
      dummy.rotation.set(0, facing, 0);
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);
    });

    if (anyUpdated) meshRef.current.instanceMatrix.needsUpdate = true;
  });

  if (data.length === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, data.length]}
      castShadow={shadowsActive}
      receiveShadow={shadowsActive}
      frustumCulled={false}
    />
  );
}
