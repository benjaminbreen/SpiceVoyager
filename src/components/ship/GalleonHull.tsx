import { useEffect, useMemo, type RefObject } from 'react';
import * as THREE from 'three';
import type { ShipProfile } from '../../utils/shipProfiles';
import { Spar } from './Spar';
import {
  createDeckGeometry,
  createHardChineHullGeometry,
  createLineSegmentsGeometry,
  scaleStationSpecs,
  type HullStationSpec,
} from './shipGeometry';

type GalleonHullProps = {
  profile: ShipProfile;
  hullMaterialRef: RefObject<THREE.MeshStandardMaterial | null>;
  deckMaterialRef: RefObject<THREE.MeshStandardMaterial | null>;
};

const stationFractions: HullStationSpec[] = [
  { z: -0.5, width: 0.62, chineWidth: 0.72, deckWidth: 0.56 },
  { z: -0.36, width: 0.96, chineWidth: 1.02, deckWidth: 0.88 },
  { z: -0.1, width: 1.08, chineWidth: 1.0, deckWidth: 0.96 },
  { z: 0.18, width: 1.0, chineWidth: 0.88, deckWidth: 0.88 },
  { z: 0.38, width: 0.68, chineWidth: 0.52, deckWidth: 0.62 },
  { z: 0.5, width: 0.16, chineWidth: 0.1, deckWidth: 0.14 },
];

function createGalleonHullGeometry(profile: ShipProfile) {
  return createHardChineHullGeometry(scaleStationSpecs(profile, stationFractions), profile.hull.height, {
    chineY: 0.32,
    keelY: -0.18,
  });
}

function createGalleonDeckGeometry(profile: ShipProfile) {
  return createDeckGeometry(scaleStationSpecs(profile, stationFractions), profile.hull.height + 0.045);
}

export function GalleonHull({ profile, hullMaterialRef, deckMaterialRef }: GalleonHullProps) {
  const hullGeometry = useMemo(() => createGalleonHullGeometry(profile), [profile]);
  const deckGeometry = useMemo(() => createGalleonDeckGeometry(profile), [profile]);
  const stations = useMemo(() => scaleStationSpecs(profile, stationFractions), [profile]);
  const h = profile.hull.height;
  const w = profile.hull.width;
  const l = profile.hull.length;
  const trim = profile.hull.trimColor;
  const railY = h + 0.22;
  const sternZ = -l * 0.39;
  const sternFaceZ = -l * 0.535;
  const foreZ = l * 0.36;

  const trimLineGeometry = useMemo(() => {
    const points: [number, number, number][] = [];
    for (let i = 0; i < stations.length - 1; i++) {
      const s = stations[i];
      const n = stations[i + 1];
      points.push(
        [-s.deckWidth * 0.53, railY, s.z], [-n.deckWidth * 0.53, railY, n.z],
        [s.deckWidth * 0.53, railY, s.z], [n.deckWidth * 0.53, railY, n.z],
        [-s.chineWidth * 0.52, h * 0.52, s.z], [-n.chineWidth * 0.52, h * 0.52, n.z],
        [s.chineWidth * 0.52, h * 0.52, s.z], [n.chineWidth * 0.52, h * 0.52, n.z],
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
    [-w * 0.34, h + 0.85, sternFaceZ], [-w * 0.34, h + 2.58, sternFaceZ],
    [0, h + 0.72, sternFaceZ], [0, h + 2.68, sternFaceZ],
    [w * 0.34, h + 0.85, sternFaceZ], [w * 0.34, h + 2.58, sternFaceZ],
    [-w * 0.46, h + 1.28, sternFaceZ], [w * 0.46, h + 1.28, sternFaceZ],
    [-w * 0.42, h + 1.82, sternFaceZ], [w * 0.42, h + 1.82, sternFaceZ],
    [-w * 0.34, h + 2.34, sternFaceZ], [w * 0.34, h + 2.34, sternFaceZ],
  ]), [h, sternFaceZ, w]);

  const deckLineGeometry = useMemo(() => createLineSegmentsGeometry([
    [-w * 0.34, h + 0.062, -l * 0.28], [-w * 0.34, h + 0.062, l * 0.31],
    [0, h + 0.064, -l * 0.31], [0, h + 0.064, l * 0.34],
    [w * 0.34, h + 0.062, -l * 0.28], [w * 0.34, h + 0.062, l * 0.31],
    [-w * 0.42, h + 0.066, -l * 0.16], [w * 0.42, h + 0.066, -l * 0.16],
    [-w * 0.38, h + 0.066, l * 0.18], [w * 0.38, h + 0.066, l * 0.18],
  ]), [h, l, w]);

  useEffect(() => () => {
    hullGeometry.dispose();
    deckGeometry.dispose();
    trimLineGeometry.dispose();
    sternLineGeometry.dispose();
    deckLineGeometry.dispose();
  }, [deckGeometry, deckLineGeometry, hullGeometry, sternLineGeometry, trimLineGeometry]);

  return (
    <group>
      <mesh geometry={hullGeometry} castShadow receiveShadow>
        <meshStandardMaterial ref={hullMaterialRef} color={profile.hull.hullColor} roughness={0.9} flatShading />
      </mesh>
      <mesh geometry={deckGeometry} castShadow receiveShadow>
        <meshStandardMaterial ref={deckMaterialRef} color={profile.hull.deckColor} roughness={0.82} />
      </mesh>
      <lineSegments geometry={trimLineGeometry}>
        <lineBasicMaterial color={trim} />
      </lineSegments>
      <lineSegments geometry={deckLineGeometry}>
        <lineBasicMaterial color="#3a2619" />
      </lineSegments>

      <Spar from={[0, h + 0.12, l * 0.46]} to={[0, h + 1.18, l * 0.74]} radius={0.065} color={trim} />
      <Spar from={[0, h + 0.5, l * 0.47]} to={[0, h + 1.62, l * 0.58]} radius={0.045} color={trim} />
      <mesh position={[0, h + 1.77, l * 0.59]} castShadow>
        <sphereGeometry args={[0.11, 8, 6]} />
        <meshStandardMaterial color={trim} roughness={0.82} />
      </mesh>

      <mesh position={[0, h + 0.7, foreZ]} castShadow receiveShadow>
        <boxGeometry args={[w * 0.68, 1.15, l * 0.19]} />
        <meshStandardMaterial color={trim} roughness={0.9} />
      </mesh>
      <mesh position={[0, h + 1.31, foreZ - l * 0.015]} castShadow>
        <boxGeometry args={[w * 0.76, 0.14, l * 0.22]} />
        <meshStandardMaterial color={profile.hull.hullColor} roughness={0.88} />
      </mesh>
      <mesh position={[0, h + 0.2, l * 0.22]} castShadow receiveShadow>
        <boxGeometry args={[w * 0.48, 0.18, l * 0.14]} />
        <meshStandardMaterial color={trim} roughness={0.9} />
      </mesh>

      <mesh position={[0, h + 0.55, sternZ]} castShadow receiveShadow>
        <boxGeometry args={[w * 0.92, 0.9, l * 0.28]} />
        <meshStandardMaterial color={profile.hull.cabinColor} roughness={0.9} />
      </mesh>
      <mesh position={[0, h + 1.22, sternZ - l * 0.04]} castShadow receiveShadow>
        <boxGeometry args={[w * 0.82, 0.62, l * 0.23]} />
        <meshStandardMaterial color={trim} roughness={0.9} />
      </mesh>
      <mesh position={[0, h + 1.76, sternZ - l * 0.08]} castShadow receiveShadow>
        <boxGeometry args={[w * 0.68, 0.52, l * 0.17]} />
        <meshStandardMaterial color={profile.hull.cabinColor} roughness={0.9} />
      </mesh>
      <mesh position={[0, h + 2.08, sternZ - l * 0.08]} castShadow>
        <boxGeometry args={[w * 0.76, 0.12, l * 0.19]} />
        <meshStandardMaterial color={profile.hull.hullColor} roughness={0.86} />
      </mesh>

      <mesh position={[0, h + 1.72, sternFaceZ + 0.03]} castShadow receiveShadow>
        <boxGeometry args={[w * 0.9, 1.78, 0.14]} />
        <meshStandardMaterial color={trim} roughness={0.9} />
      </mesh>
      <lineSegments geometry={sternLineGeometry}>
        <lineBasicMaterial color={profile.hull.hullColor} />
      </lineSegments>
      {[-w * 0.27, 0, w * 0.27].map((x, i) => (
        <group key={`galleon-stern-window-${i}`} position={[x, h + 1.68, sternFaceZ - 0.055]}>
          <mesh>
            <boxGeometry args={[0.24, 0.26, 0.02]} />
            <meshStandardMaterial color="#ffe6a8" emissive="#ffae55" emissiveIntensity={0.72} toneMapped={false} />
          </mesh>
          <mesh position={[0, 0, 0.012]}>
            <boxGeometry args={[0.018, 0.27, 0.008]} />
            <meshStandardMaterial color={profile.hull.hullColor} roughness={0.9} />
          </mesh>
          <mesh position={[0, 0, 0.012]}>
            <boxGeometry args={[0.25, 0.018, 0.008]} />
            <meshStandardMaterial color={profile.hull.hullColor} roughness={0.9} />
          </mesh>
        </group>
      ))}
      {[-w * 0.22, w * 0.22].map((x, i) => (
        <group key={`galleon-upper-window-${i}`} position={[x, h + 2.23, sternFaceZ - 0.056]}>
          <mesh>
            <boxGeometry args={[0.2, 0.2, 0.02]} />
            <meshStandardMaterial color="#ffe6a8" emissive="#ffae55" emissiveIntensity={0.62} toneMapped={false} />
          </mesh>
          <mesh position={[0, 0, 0.012]}>
            <boxGeometry args={[0.014, 0.21, 0.008]} />
            <meshStandardMaterial color={profile.hull.hullColor} roughness={0.9} />
          </mesh>
        </group>
      ))}

      {[-1, 1].map((side) => (
        <group key={`galleon-gallery-${side}`}>
          <mesh position={[side * w * 0.55, h + 1.38, sternZ - l * 0.06]} castShadow receiveShadow>
            <boxGeometry args={[0.18, 0.48, l * 0.18]} />
            <meshStandardMaterial color={trim} roughness={0.9} />
          </mesh>
          <mesh position={[side * w * 0.56, h + 1.42, sternZ - l * 0.06]}>
            <boxGeometry args={[0.025, 0.24, l * 0.13]} />
            <meshStandardMaterial color="#ffe6a8" emissive="#ffae55" emissiveIntensity={0.38} toneMapped={false} />
          </mesh>
        </group>
      ))}

      {[-1, 1].map((side) => (
        <group key={`galleon-guns-${side}`}>
          {[-0.22, -0.06, 0.1, 0.26].map((zf, i) => (
            <mesh
              key={`gunport-${side}-${i}`}
              position={[side * (w * 0.52 + 0.018), h * 0.56, l * zf]}
              castShadow={false}
            >
              <boxGeometry args={[0.035, 0.18, 0.24]} />
              <meshStandardMaterial color="#1b120c" roughness={1} />
            </mesh>
          ))}
        </group>
      ))}

      <mesh position={[0, h + 0.15, -l * 0.02]} castShadow receiveShadow>
        <boxGeometry args={[w * 0.5, 0.16, l * 0.18]} />
        <meshStandardMaterial color={trim} roughness={0.9} />
      </mesh>
      <mesh position={[0, h + 0.25, -l * 0.02]} receiveShadow>
        <boxGeometry args={[w * 0.44, 0.04, l * 0.145]} />
        <meshStandardMaterial color={profile.hull.hullColor} roughness={0.96} />
      </mesh>

      {[-0.38, 0, 0.38].map((x) => (
        <mesh key={`galleon-plank-${x}`} position={[x, h + 0.056, 0.02]} castShadow={false}>
          <boxGeometry args={[0.016, 0.018, l * 0.72]} />
          <meshStandardMaterial color="#4f3826" roughness={1} />
        </mesh>
      ))}
    </group>
  );
}
