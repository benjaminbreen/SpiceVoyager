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

type PinnaceHullProps = {
  profile: ShipProfile;
  hullMaterialRef: RefObject<THREE.MeshStandardMaterial | null>;
  deckMaterialRef: RefObject<THREE.MeshStandardMaterial | null>;
};

const stationFractions: HullStationSpec[] = [
  { z: -0.5, width: 0.58, chineWidth: 0.48, deckWidth: 0.52 },
  { z: -0.28, width: 0.88, chineWidth: 0.72, deckWidth: 0.82 },
  { z: 0.08, width: 1.0, chineWidth: 0.82, deckWidth: 0.92 },
  { z: 0.34, width: 0.72, chineWidth: 0.58, deckWidth: 0.66 },
  { z: 0.5, width: 0.24, chineWidth: 0.16, deckWidth: 0.22 },
];

function createPinnaceHullGeometry(profile: ShipProfile) {
  return createHardChineHullGeometry(scaleStationSpecs(profile, stationFractions), profile.hull.height, {
    chineY: 0.24,
    keelY: -0.12,
  });
}

function createPinnaceDeckGeometry(profile: ShipProfile) {
  return createDeckGeometry(scaleStationSpecs(profile, stationFractions), profile.hull.height + 0.035);
}

export function PinnaceHull({ profile, hullMaterialRef, deckMaterialRef }: PinnaceHullProps) {
  const hullGeometry = useMemo(() => createPinnaceHullGeometry(profile), [profile]);
  const deckGeometry = useMemo(() => createPinnaceDeckGeometry(profile), [profile]);
  const stations = useMemo(() => scaleStationSpecs(profile, stationFractions), [profile]);
  const railY = profile.hull.height + 0.22;
  const trim = profile.hull.trimColor;
  const deck = profile.hull.deckColor;
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
        [-s.width * 0.52, profile.hull.height + 0.02, s.z], [-s.width * 0.52, railY + 0.04, s.z],
        [s.width * 0.52, profile.hull.height + 0.02, s.z], [s.width * 0.52, railY + 0.04, s.z],
      );
    }
    return createLineSegmentsGeometry(points);
  }, [profile.hull.height, railY, stations]);
  const darkLineGeometry = useMemo(() => {
    const points: [number, number, number][] = [];
    for (let i = 0; i < stations.length - 1; i++) {
      const s = stations[i];
      const n = stations[i + 1];
      points.push(
        [-s.chineWidth * 0.54, profile.hull.height * 0.48, s.z], [-n.chineWidth * 0.54, profile.hull.height * 0.48, n.z],
        [s.chineWidth * 0.54, profile.hull.height * 0.48, s.z], [n.chineWidth * 0.54, profile.hull.height * 0.48, n.z],
      );
    }
    return createLineSegmentsGeometry(points);
  }, [profile.hull.height, stations]);

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
        <meshStandardMaterial ref={deckMaterialRef} color={deck} roughness={0.8} />
      </mesh>

      <lineSegments geometry={trimLineGeometry}>
        <lineBasicMaterial color={trim} />
      </lineSegments>
      <lineSegments geometry={darkLineGeometry}>
        <lineBasicMaterial color="#2f2118" />
      </lineSegments>

      <mesh position={[0, profile.hull.height + 0.09, -profile.hull.length * 0.18]} castShadow receiveShadow>
        <boxGeometry args={[profile.hull.width * 0.56, 0.16, profile.hull.length * 0.22]} />
        <meshStandardMaterial color={profile.hull.cabinColor} roughness={0.9} />
      </mesh>
      <mesh position={[0, profile.hull.height + 0.18, -profile.hull.length * 0.36]} castShadow receiveShadow>
        <boxGeometry args={[profile.hull.width * 0.66, 0.42, profile.hull.length * 0.16]} />
        <meshStandardMaterial color={profile.hull.cabinColor} roughness={0.9} />
      </mesh>
      <Spar
        from={[0, profile.hull.height + 0.36, -profile.hull.length * 0.42]}
        to={[0.44, profile.hull.height + 0.48, -profile.hull.length * 0.58]}
        radius={0.024}
        color={trim}
      />

      {[-0.24, 0, 0.24].map((x) => (
        <mesh key={`plank-${x}`} position={[x, profile.hull.height + 0.045, 0]} castShadow={false}>
          <boxGeometry args={[0.014, 0.018, profile.hull.length * 0.76]} />
          <meshStandardMaterial color="#4f3826" roughness={1} />
        </mesh>
      ))}
    </group>
  );
}
