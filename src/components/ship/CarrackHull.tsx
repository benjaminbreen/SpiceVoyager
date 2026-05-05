import { useEffect, useMemo, type RefObject } from 'react';
import * as THREE from 'three';
import type { ShipProfile } from '../../utils/shipProfiles';
import { Spar } from './Spar';
import {
  addQuad,
  createDeckGeometry,
  createHardChineHullGeometry,
  createLineSegmentsGeometry,
  scaleStationSpecs,
  type HullStationSpec,
} from './shipGeometry';

type CarrackHullProps = {
  profile: ShipProfile;
  hullMaterialRef: RefObject<THREE.MeshStandardMaterial | null>;
  deckMaterialRef: RefObject<THREE.MeshStandardMaterial | null>;
};

const stationFractions: HullStationSpec[] = [
  { z: -0.5, width: 0.72, chineWidth: 0.82, deckWidth: 0.64 },
  { z: -0.34, width: 1.06, chineWidth: 1.08, deckWidth: 0.92 },
  { z: -0.08, width: 1.14, chineWidth: 1.02, deckWidth: 0.98 },
  { z: 0.18, width: 1.02, chineWidth: 0.84, deckWidth: 0.86 },
  { z: 0.38, width: 0.66, chineWidth: 0.48, deckWidth: 0.56 },
  { z: 0.5, width: 0.22, chineWidth: 0.14, deckWidth: 0.18 },
];

function createCarrackHullGeometry(profile: ShipProfile) {
  return createHardChineHullGeometry(scaleStationSpecs(profile, stationFractions), profile.hull.height, {
    chineY: 0.3,
    keelY: -0.2,
  });
}

function createCarrackDeckGeometry(profile: ShipProfile) {
  return createDeckGeometry(scaleStationSpecs(profile, stationFractions), profile.hull.height + 0.045);
}

function createCarrackBulwarkGeometry(profile: ShipProfile) {
  const stations = scaleStationSpecs(profile, stationFractions);
  const h = profile.hull.height;
  const vertices: number[] = [];
  const indices: number[] = [];

  for (const s of stations) {
    const x = s.deckWidth * 0.53;
    vertices.push(
      -x, h + 0.03, s.z,
      -x, h + 0.36, s.z,
      x, h + 0.03, s.z,
      x, h + 0.36, s.z,
    );
  }

  for (let i = 0; i < stations.length - 1; i++) {
    const a = i * 4;
    const b = (i + 1) * 4;
    addQuad(indices, a, b, b + 1, a + 1);
    addQuad(indices, a + 2, a + 3, b + 3, b + 2);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

export function CarrackHull({ profile, hullMaterialRef, deckMaterialRef }: CarrackHullProps) {
  const hullGeometry = useMemo(() => createCarrackHullGeometry(profile), [profile]);
  const deckGeometry = useMemo(() => createCarrackDeckGeometry(profile), [profile]);
  const bulwarkGeometry = useMemo(() => createCarrackBulwarkGeometry(profile), [profile]);
  const stations = useMemo(() => scaleStationSpecs(profile, stationFractions), [profile]);
  const h = profile.hull.height;
  const w = profile.hull.width;
  const l = profile.hull.length;
  const trim = profile.hull.trimColor;
  const railY = h + 0.22;
  const foreZ = l * 0.36;
  const sternZ = -l * 0.34;
  const sternFaceZ = -l * 0.52;

  const trimLineGeometry = useMemo(() => {
    const points: [number, number, number][] = [];
    for (let i = 0; i < stations.length - 1; i++) {
      const s = stations[i];
      const n = stations[i + 1];
      points.push(
        [-s.deckWidth * 0.53, railY, s.z], [-n.deckWidth * 0.53, railY, n.z],
        [s.deckWidth * 0.53, railY, s.z], [n.deckWidth * 0.53, railY, n.z],
        [-s.chineWidth * 0.53, h * 0.5, s.z], [-n.chineWidth * 0.53, h * 0.5, n.z],
        [s.chineWidth * 0.53, h * 0.5, s.z], [n.chineWidth * 0.53, h * 0.5, n.z],
      );
    }
    for (const s of stations.slice(1, -1)) {
      points.push(
        [-s.deckWidth * 0.53, h + 0.03, s.z], [-s.deckWidth * 0.53, railY + 0.04, s.z],
        [s.deckWidth * 0.53, h + 0.03, s.z], [s.deckWidth * 0.53, railY + 0.04, s.z],
      );
    }
    return createLineSegmentsGeometry(points);
  }, [h, railY, stations]);

  const sternLineGeometry = useMemo(() => createLineSegmentsGeometry([
    [-w * 0.38, h + 0.82, sternFaceZ], [-w * 0.38, h + 2.25, sternFaceZ],
    [0, h + 0.7, sternFaceZ], [0, h + 2.35, sternFaceZ],
    [w * 0.38, h + 0.82, sternFaceZ], [w * 0.38, h + 2.25, sternFaceZ],
    [-w * 0.5, h + 1.18, sternFaceZ], [w * 0.5, h + 1.18, sternFaceZ],
    [-w * 0.44, h + 1.72, sternFaceZ], [w * 0.44, h + 1.72, sternFaceZ],
  ]), [h, sternFaceZ, w]);

  useEffect(() => () => {
    hullGeometry.dispose();
    deckGeometry.dispose();
    bulwarkGeometry.dispose();
    trimLineGeometry.dispose();
    sternLineGeometry.dispose();
  }, [bulwarkGeometry, deckGeometry, hullGeometry, sternLineGeometry, trimLineGeometry]);

  return (
    <group>
      <mesh geometry={hullGeometry} castShadow receiveShadow>
        <meshStandardMaterial ref={hullMaterialRef} color={profile.hull.hullColor} roughness={0.9} flatShading />
      </mesh>
      <mesh geometry={deckGeometry} castShadow receiveShadow>
        <meshStandardMaterial ref={deckMaterialRef} color={profile.hull.deckColor} roughness={0.82} />
      </mesh>
      <mesh geometry={bulwarkGeometry} castShadow receiveShadow>
        <meshStandardMaterial color={profile.hull.hullColor} roughness={0.92} flatShading />
      </mesh>
      <lineSegments geometry={trimLineGeometry}>
        <lineBasicMaterial color={trim} />
      </lineSegments>

      <Spar from={[0, h + 0.12, l * 0.45]} to={[0, h + 1.1, l * 0.7]} radius={0.06} color={trim} />

      <mesh position={[0, h + 0.72, foreZ]} castShadow receiveShadow>
        <boxGeometry args={[w * 0.78, 1.2, l * 0.24]} />
        <meshStandardMaterial color={trim} roughness={0.9} />
      </mesh>
      <mesh position={[0, h + 1.36, foreZ - l * 0.015]} castShadow>
        <boxGeometry args={[w * 0.88, 0.16, l * 0.27]} />
        <meshStandardMaterial color={profile.hull.hullColor} roughness={0.88} />
      </mesh>

      <mesh position={[0, h + 0.6, sternZ]} castShadow receiveShadow>
        <boxGeometry args={[w * 0.96, 1.0, l * 0.34]} />
        <meshStandardMaterial color={profile.hull.cabinColor} roughness={0.9} />
      </mesh>
      <mesh position={[0, h + 1.34, sternZ - l * 0.06]} castShadow receiveShadow>
        <boxGeometry args={[w * 0.82, 0.72, l * 0.24]} />
        <meshStandardMaterial color={trim} roughness={0.9} />
      </mesh>
      <mesh position={[0, h + 1.72, sternFaceZ + 0.04]} castShadow receiveShadow>
        <boxGeometry args={[w * 0.92, 1.28, 0.16]} />
        <meshStandardMaterial color={trim} roughness={0.9} />
      </mesh>
      <lineSegments geometry={sternLineGeometry}>
        <lineBasicMaterial color={profile.hull.hullColor} />
      </lineSegments>
      {[-w * 0.24, w * 0.24].map((x, i) => (
        <group key={`carrack-window-${i}`} position={[x, h + 1.62, sternFaceZ - 0.055]}>
          <mesh>
            <boxGeometry args={[0.22, 0.24, 0.02]} />
            <meshStandardMaterial color="#ffe6a8" emissive="#ffae55" emissiveIntensity={0.65} toneMapped={false} />
          </mesh>
          <mesh position={[0, 0, 0.012]}>
            <boxGeometry args={[0.016, 0.25, 0.008]} />
            <meshStandardMaterial color={profile.hull.hullColor} roughness={0.9} />
          </mesh>
          <mesh position={[0, 0, 0.012]}>
            <boxGeometry args={[0.23, 0.016, 0.008]} />
            <meshStandardMaterial color={profile.hull.hullColor} roughness={0.9} />
          </mesh>
        </group>
      ))}

      <mesh position={[0, h + 0.17, -l * 0.02]} castShadow receiveShadow>
        <boxGeometry args={[w * 0.52, 0.16, l * 0.2]} />
        <meshStandardMaterial color={trim} roughness={0.9} />
      </mesh>
      <mesh position={[0, h + 0.27, -l * 0.02]} receiveShadow>
        <boxGeometry args={[w * 0.46, 0.04, l * 0.16]} />
        <meshStandardMaterial color={profile.hull.hullColor} roughness={0.96} />
      </mesh>

      {[-0.34, 0, 0.34].map((x) => (
        <mesh key={`carrack-plank-${x}`} position={[x, h + 0.056, 0.02]} castShadow={false}>
          <boxGeometry args={[0.016, 0.018, l * 0.66]} />
          <meshStandardMaterial color="#4f3826" roughness={1} />
        </mesh>
      ))}
    </group>
  );
}
