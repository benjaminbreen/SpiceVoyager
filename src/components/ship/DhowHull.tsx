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

type DhowHullProps = {
  profile: ShipProfile;
  hullMaterialRef: RefObject<THREE.MeshStandardMaterial | null>;
  deckMaterialRef: RefObject<THREE.MeshStandardMaterial | null>;
};

const stationFractions: HullStationSpec[] = [
  { z: -0.5, width: 0.5, chineWidth: 0.38, deckWidth: 0.42 },
  { z: -0.3, width: 0.82, chineWidth: 0.62, deckWidth: 0.72 },
  { z: 0.0, width: 1.0, chineWidth: 0.74, deckWidth: 0.86 },
  { z: 0.27, width: 0.74, chineWidth: 0.5, deckWidth: 0.62 },
  { z: 0.43, width: 0.3, chineWidth: 0.18, deckWidth: 0.24 },
  { z: 0.5, width: 0.06, chineWidth: 0.04, deckWidth: 0.06 },
];

function createDhowHullGeometry(profile: ShipProfile) {
  return createHardChineHullGeometry(scaleStationSpecs(profile, stationFractions), profile.hull.height, {
    chineY: 0.22,
    keelY: -0.18,
  });
}

function createDhowDeckGeometry(profile: ShipProfile) {
  return createDeckGeometry(scaleStationSpecs(profile, stationFractions), profile.hull.height + 0.035);
}

export function DhowHull({ profile, hullMaterialRef, deckMaterialRef }: DhowHullProps) {
  const hullGeometry = useMemo(() => createDhowHullGeometry(profile), [profile]);
  const deckGeometry = useMemo(() => createDhowDeckGeometry(profile), [profile]);
  const stations = useMemo(() => scaleStationSpecs(profile, stationFractions), [profile]);
  const h = profile.hull.height;
  const w = profile.hull.width;
  const l = profile.hull.length;
  const trim = profile.hull.trimColor;
  const railY = h + 0.15;

  const trimLineGeometry = useMemo(() => {
    const points: [number, number, number][] = [];
    for (let i = 0; i < stations.length - 1; i++) {
      const s = stations[i];
      const n = stations[i + 1];
      points.push(
        [-s.width * 0.52, railY, s.z], [-n.width * 0.52, railY, n.z],
        [s.width * 0.52, railY, s.z], [n.width * 0.52, railY, n.z],
      );
    }
    return createLineSegmentsGeometry(points);
  }, [railY, stations]);

  const plankLineGeometry = useMemo(() => {
    const points: [number, number, number][] = [];
    for (let i = 0; i < stations.length - 1; i++) {
      const s = stations[i];
      const n = stations[i + 1];
      points.push(
        [-s.chineWidth * 0.55, h * 0.48, s.z], [-n.chineWidth * 0.55, h * 0.48, n.z],
        [s.chineWidth * 0.55, h * 0.48, s.z], [n.chineWidth * 0.55, h * 0.48, n.z],
        [-s.chineWidth * 0.44, h * 0.68, s.z], [-n.chineWidth * 0.44, h * 0.68, n.z],
        [s.chineWidth * 0.44, h * 0.68, s.z], [n.chineWidth * 0.44, h * 0.68, n.z],
      );
    }
    return createLineSegmentsGeometry(points);
  }, [h, stations]);

  useEffect(() => () => {
    hullGeometry.dispose();
    deckGeometry.dispose();
    trimLineGeometry.dispose();
    plankLineGeometry.dispose();
  }, [deckGeometry, hullGeometry, plankLineGeometry, trimLineGeometry]);

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
      <lineSegments geometry={plankLineGeometry}>
        <lineBasicMaterial color="#3c2918" />
      </lineSegments>

      <Spar from={[0, h + 0.06, l * 0.48]} to={[0, h + 1.42, l * 0.77]} radius={0.06} color={trim} />
      <mesh position={[0, h + 1.54, l * 0.8]} rotation={[0.46, 0, 0]} castShadow>
        <coneGeometry args={[0.055, 0.2, 6]} />
        <meshStandardMaterial color={trim} roughness={0.85} />
      </mesh>

      <mesh position={[0, h + 0.22, -l * 0.4]} castShadow receiveShadow>
        <boxGeometry args={[w * 0.64, 0.44, l * 0.14]} />
        <meshStandardMaterial color={profile.hull.cabinColor} roughness={0.9} />
      </mesh>
      <mesh position={[0, h + 0.5, -l * 0.49]} castShadow receiveShadow>
        <boxGeometry args={[w * 0.78, 0.58, 0.12]} />
        <meshStandardMaterial color={trim} roughness={0.88} />
      </mesh>
      {[-w * 0.22, w * 0.22].map((x) => (
        <mesh key={`dhow-stern-window-${x}`} position={[x, h + 0.58, -l * 0.56]}>
          <boxGeometry args={[0.16, 0.16, 0.018]} />
          <meshStandardMaterial color="#d8b36c" emissive="#9c5f1e" emissiveIntensity={0.18} toneMapped={false} />
        </mesh>
      ))}

      <mesh position={[0, h + 0.13, 0.05]} castShadow receiveShadow>
        <boxGeometry args={[w * 0.42, 0.12, l * 0.16]} />
        <meshStandardMaterial color={trim} roughness={0.9} />
      </mesh>
      <mesh position={[0, h + 0.205, 0.05]} receiveShadow>
        <boxGeometry args={[w * 0.34, 0.035, l * 0.11]} />
        <meshStandardMaterial color={profile.hull.hullColor} roughness={0.96} />
      </mesh>

      {[-0.18, 0, 0.18].map((x) => (
        <mesh key={`dhow-deck-line-${x}`} position={[x, h + 0.047, 0]} castShadow={false}>
          <boxGeometry args={[0.01, 0.014, l * 0.72]} />
          <meshStandardMaterial color="#5a3a20" roughness={1} />
        </mesh>
      ))}
    </group>
  );
}
