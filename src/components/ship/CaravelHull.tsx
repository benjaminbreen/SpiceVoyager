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

type CaravelHullProps = {
  profile: ShipProfile;
  hullMaterialRef: RefObject<THREE.MeshStandardMaterial | null>;
  deckMaterialRef: RefObject<THREE.MeshStandardMaterial | null>;
};

const stationFractions: HullStationSpec[] = [
  { z: -0.5, width: 0.42, chineWidth: 0.34, deckWidth: 0.36 },
  { z: -0.28, width: 0.78, chineWidth: 0.62, deckWidth: 0.68 },
  { z: 0.02, width: 1.0, chineWidth: 0.76, deckWidth: 0.86 },
  { z: 0.28, width: 0.74, chineWidth: 0.54, deckWidth: 0.62 },
  { z: 0.43, width: 0.36, chineWidth: 0.24, deckWidth: 0.32 },
  { z: 0.5, width: 0.08, chineWidth: 0.06, deckWidth: 0.08 },
];

function createCaravelHullGeometry(profile: ShipProfile) {
  return createHardChineHullGeometry(scaleStationSpecs(profile, stationFractions), profile.hull.height, {
    chineY: 0.26,
    keelY: -0.16,
  });
}

function createCaravelDeckGeometry(profile: ShipProfile) {
  return createDeckGeometry(scaleStationSpecs(profile, stationFractions), profile.hull.height + 0.038);
}

export function CaravelHull({ profile, hullMaterialRef, deckMaterialRef }: CaravelHullProps) {
  const hullGeometry = useMemo(() => createCaravelHullGeometry(profile), [profile]);
  const deckGeometry = useMemo(() => createCaravelDeckGeometry(profile), [profile]);
  const stations = useMemo(() => scaleStationSpecs(profile, stationFractions), [profile]);
  const h = profile.hull.height;
  const w = profile.hull.width;
  const l = profile.hull.length;
  const trim = profile.hull.trimColor;
  const railY = h + 0.2;
  const sternRailY = h + 0.95;

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
    for (const s of stations.slice(1, -1)) {
      points.push(
        [-s.width * 0.52, h + 0.02, s.z], [-s.width * 0.52, railY + 0.035, s.z],
        [s.width * 0.52, h + 0.02, s.z], [s.width * 0.52, railY + 0.035, s.z],
      );
    }
    const cabinZ = -l * 0.32;
    const halfW = w * 0.32;
    const halfL = l * 0.08;
    points.push(
      [-halfW, sternRailY, cabinZ - halfL], [halfW, sternRailY, cabinZ - halfL],
      [-halfW, sternRailY, cabinZ - halfL], [-halfW, sternRailY, cabinZ + halfL],
      [halfW, sternRailY, cabinZ - halfL], [halfW, sternRailY, cabinZ + halfL],
    );
    return createLineSegmentsGeometry(points);
  }, [h, l, railY, sternRailY, stations, w]);

  const darkLineGeometry = useMemo(() => {
    const points: [number, number, number][] = [];
    for (let i = 0; i < stations.length - 1; i++) {
      const s = stations[i];
      const n = stations[i + 1];
      points.push(
        [-s.chineWidth * 0.54, h * 0.48, s.z], [-n.chineWidth * 0.54, h * 0.48, n.z],
        [s.chineWidth * 0.54, h * 0.48, s.z], [n.chineWidth * 0.54, h * 0.48, n.z],
      );
    }
    return createLineSegmentsGeometry(points);
  }, [h, stations]);

  useEffect(() => () => {
    hullGeometry.dispose();
    deckGeometry.dispose();
    trimLineGeometry.dispose();
    darkLineGeometry.dispose();
  }, [darkLineGeometry, deckGeometry, hullGeometry, trimLineGeometry]);

  return (
    <group>
      <mesh geometry={hullGeometry} castShadow receiveShadow>
        <meshStandardMaterial ref={hullMaterialRef} color={profile.hull.hullColor} roughness={0.9} flatShading />
      </mesh>
      <mesh geometry={deckGeometry} castShadow receiveShadow>
        <meshStandardMaterial ref={deckMaterialRef} color={profile.hull.deckColor} roughness={0.8} />
      </mesh>
      <lineSegments geometry={trimLineGeometry}>
        <lineBasicMaterial color={trim} />
      </lineSegments>
      <lineSegments geometry={darkLineGeometry}>
        <lineBasicMaterial color="#2f2118" />
      </lineSegments>

      <Spar from={[0, h + 0.04, l * 0.48]} to={[0, h + 1.12, l * 0.64]} radius={0.045} color={trim} />
      <Spar from={[0, h + 0.12, l * 0.37]} to={[0, h + 0.74, l * 0.48]} radius={0.035} color={trim} />
      <mesh position={[0, h + 1.19, l * 0.65]} castShadow>
        <sphereGeometry args={[0.09, 8, 6]} />
        <meshStandardMaterial color={trim} roughness={0.82} />
      </mesh>
      <mesh position={[0, h + 1.36, l * 0.68]} castShadow>
        <coneGeometry args={[0.06, 0.2, 6]} />
        <meshStandardMaterial color={trim} roughness={0.82} />
      </mesh>
      <mesh position={[0, h + 1.54, l * 0.71]} castShadow>
        <boxGeometry args={[0.035, 0.24, 0.035]} />
        <meshStandardMaterial color={trim} roughness={0.84} />
      </mesh>
      <mesh position={[0, h + 1.58, l * 0.715]} castShadow>
        <boxGeometry args={[0.14, 0.035, 0.035]} />
        <meshStandardMaterial color={trim} roughness={0.84} />
      </mesh>

      <mesh position={[0, h + 0.18, -l * 0.18]} castShadow receiveShadow>
        <boxGeometry args={[w * 0.5, 0.18, l * 0.18]} />
        <meshStandardMaterial color={profile.hull.cabinColor} roughness={0.9} />
      </mesh>
      <mesh position={[0, h + 0.5, -l * 0.32]} castShadow receiveShadow>
        <boxGeometry args={[w * 0.66, 0.68, l * 0.18]} />
        <meshStandardMaterial color={profile.hull.cabinColor} roughness={0.9} />
      </mesh>
      <mesh position={[0, h + 0.87, -l * 0.32]} castShadow>
        <boxGeometry args={[w * 0.72, 0.08, l * 0.2]} />
        <meshStandardMaterial color={trim} roughness={0.88} />
      </mesh>

      <mesh position={[0, h + 0.15, l * 0.08]} castShadow receiveShadow>
        <boxGeometry args={[w * 0.44, 0.13, l * 0.14]} />
        <meshStandardMaterial color={trim} roughness={0.9} />
      </mesh>
      <mesh position={[0, h + 0.23, l * 0.08]} receiveShadow>
        <boxGeometry args={[w * 0.38, 0.035, l * 0.1]} />
        <meshStandardMaterial color={profile.hull.hullColor} roughness={0.96} />
      </mesh>

      {[-0.22, 0, 0.22].map((x) => (
        <mesh key={`caravel-plank-${x}`} position={[x, h + 0.05, 0]} castShadow={false}>
          <boxGeometry args={[0.012, 0.016, l * 0.78]} />
          <meshStandardMaterial color="#4f3826" roughness={1} />
        </mesh>
      ))}
    </group>
  );
}
