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

type FluytHullProps = {
  profile: ShipProfile;
  hullMaterialRef: RefObject<THREE.MeshStandardMaterial | null>;
  deckMaterialRef: RefObject<THREE.MeshStandardMaterial | null>;
};

const stationFractions: HullStationSpec[] = [
  { z: -0.5, width: 0.28, chineWidth: 0.46, deckWidth: 0.28 },
  { z: -0.36, width: 0.5, chineWidth: 1.08, deckWidth: 0.5 },
  { z: -0.08, width: 0.64, chineWidth: 1.16, deckWidth: 0.64 },
  { z: 0.2, width: 0.58, chineWidth: 0.96, deckWidth: 0.58 },
  { z: 0.42, width: 0.38, chineWidth: 0.52, deckWidth: 0.38 },
  { z: 0.5, width: 0.16, chineWidth: 0.14, deckWidth: 0.16 },
];

function createFluytHullGeometry(profile: ShipProfile) {
  return createHardChineHullGeometry(scaleStationSpecs(profile, stationFractions), profile.hull.height, {
    chineY: 0.42,
    keelY: -0.14,
  });
}

function createFluytDeckGeometry(profile: ShipProfile) {
  return createDeckGeometry(scaleStationSpecs(profile, stationFractions), profile.hull.height + 0.04);
}

export function FluytHull({ profile, hullMaterialRef, deckMaterialRef }: FluytHullProps) {
  const hullGeometry = useMemo(() => createFluytHullGeometry(profile), [profile]);
  const deckGeometry = useMemo(() => createFluytDeckGeometry(profile), [profile]);
  const stations = useMemo(() => scaleStationSpecs(profile, stationFractions), [profile]);
  const h = profile.hull.height;
  const w = profile.hull.width;
  const l = profile.hull.length;
  const trim = profile.hull.trimColor;

  const mainZ = profile.masts[0]?.position[2] ?? -0.2;
  const foreZ = profile.masts[1]?.position[2] ?? 2.4;
  const hatchZ = (mainZ + foreZ) * 0.5;
  const railY = h + 0.22;
  const sternPanelY = h + 1.08;
  const sternPanelZ = -l * 0.48;
  const sternPanelW = w * 0.42;
  const sternPanelH = 1.58;
  const sternFaceZ = sternPanelZ - 0.09;
  const trimLineGeometry = useMemo(() => {
    const points: [number, number, number][] = [];
    for (let i = 0; i < stations.length - 1; i++) {
      const s = stations[i];
      const n = stations[i + 1];
      points.push(
        [-s.deckWidth * 0.53, railY, s.z], [-n.deckWidth * 0.53, railY, n.z],
        [s.deckWidth * 0.53, railY, s.z], [n.deckWidth * 0.53, railY, n.z],
      );
    }
    for (const s of stations.slice(1, -1)) {
      points.push(
        [-s.deckWidth * 0.53, h + 0.02, s.z], [-s.deckWidth * 0.53, railY + 0.03, s.z],
        [s.deckWidth * 0.53, h + 0.02, s.z], [s.deckWidth * 0.53, railY + 0.03, s.z],
      );
    }
    return createLineSegmentsGeometry(points);
  }, [h, railY, stations]);
  const darkLineGeometry = useMemo(() => {
    const points: [number, number, number][] = [];
    for (let i = 0; i < stations.length - 1; i++) {
      const s = stations[i];
      const n = stations[i + 1];
      points.push(
        [-s.chineWidth * 0.52, h * 0.55, s.z], [-n.chineWidth * 0.52, h * 0.55, n.z],
        [s.chineWidth * 0.52, h * 0.55, s.z], [n.chineWidth * 0.52, h * 0.55, n.z],
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

      <mesh position={[0, h + 0.38, -l * 0.34]} castShadow receiveShadow>
        <boxGeometry args={[w * 0.48, 0.64, l * 0.2]} />
        <meshStandardMaterial color={profile.hull.cabinColor} roughness={0.9} />
      </mesh>
      <mesh position={[0, sternPanelY, sternPanelZ]} castShadow receiveShadow>
        <boxGeometry args={[sternPanelW, sternPanelH, 0.16]} />
        <meshStandardMaterial color={trim} roughness={0.9} />
      </mesh>
      {[-sternPanelW * 0.34, 0, sternPanelW * 0.34].map((x, i) => (
        <mesh key={`stern-trim-${i}`} position={[x, sternPanelY, sternFaceZ - 0.012]}>
          <boxGeometry args={[0.035, sternPanelH * 0.84, 0.02]} />
          <meshStandardMaterial color={profile.hull.hullColor} roughness={0.86} />
        </mesh>
      ))}
      {[-sternPanelW * 0.23, sternPanelW * 0.23].map((x, i) => (
        <group key={`stern-window-${i}`} position={[x, sternPanelY + sternPanelH * 0.2, sternFaceZ - 0.026]}>
          <mesh>
            <boxGeometry args={[0.2, 0.22, 0.018]} />
            <meshStandardMaterial color="#ffe6a8" emissive="#ffae55" emissiveIntensity={0.82} toneMapped={false} />
          </mesh>
          <mesh position={[0, 0, 0.012]}>
            <boxGeometry args={[0.018, 0.23, 0.008]} />
            <meshStandardMaterial color={profile.hull.hullColor} roughness={0.9} />
          </mesh>
          <mesh position={[0, 0, 0.012]}>
            <boxGeometry args={[0.21, 0.018, 0.008]} />
            <meshStandardMaterial color={profile.hull.hullColor} roughness={0.9} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, sternPanelY + sternPanelH * 0.5 + 0.05, sternPanelZ]} castShadow>
        <boxGeometry args={[sternPanelW * 1.12, 0.1, 0.22]} />
        <meshStandardMaterial color={profile.hull.hullColor} roughness={0.85} />
      </mesh>

      <mesh position={[0, h + 0.13, hatchZ]} castShadow receiveShadow>
        <boxGeometry args={[w * 0.54, 0.18, l * 0.2]} />
        <meshStandardMaterial color={trim} roughness={0.9} />
      </mesh>
      <mesh position={[0, h + 0.24, hatchZ]} receiveShadow>
        <boxGeometry args={[w * 0.48, 0.045, l * 0.17]} />
        <meshStandardMaterial color={profile.hull.hullColor} roughness={0.96} />
      </mesh>
      {[-0.16, 0.16].map((dz) => (
        <mesh key={`hatch-seam-${dz}`} position={[0, h + 0.27, hatchZ + dz]}>
          <boxGeometry args={[w * 0.46, 0.01, 0.025]} />
          <meshStandardMaterial color="#23170f" roughness={1} />
        </mesh>
      ))}

      <Spar from={[0, h + 0.12, l * 0.47]} to={[0, h + 0.95, l * 0.72]} radius={0.05} color={trim} />
      <Spar from={[0, h + 0.72, -l * 0.49]} to={[0, h + 0.72, -l * 0.64]} radius={0.045} color={trim} />
      <Spar from={[0, h + 0.72, -l * 0.64]} to={[0, h + 0.28, -l * 0.64]} radius={0.01} color="#261a12" castShadow={false} />

      {[-0.28, 0, 0.28].map((x) => (
        <mesh key={`fluyt-plank-${x}`} position={[x, h + 0.052, 0.05]} castShadow={false}>
          <boxGeometry args={[0.014, 0.018, l * 0.76]} />
          <meshStandardMaterial color="#4a3021" roughness={1} />
        </mesh>
      ))}
    </group>
  );
}
