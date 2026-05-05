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

type BaghlaHullProps = {
  profile: ShipProfile;
  hullMaterialRef: RefObject<THREE.MeshStandardMaterial | null>;
  deckMaterialRef: RefObject<THREE.MeshStandardMaterial | null>;
};

const stationFractions: HullStationSpec[] = [
  { z: -0.5, width: 0.64, chineWidth: 0.48, deckWidth: 0.5 },
  { z: -0.32, width: 0.96, chineWidth: 0.72, deckWidth: 0.78 },
  { z: -0.04, width: 1.08, chineWidth: 0.82, deckWidth: 0.92 },
  { z: 0.24, width: 0.84, chineWidth: 0.62, deckWidth: 0.68 },
  { z: 0.42, width: 0.38, chineWidth: 0.24, deckWidth: 0.28 },
  { z: 0.5, width: 0.08, chineWidth: 0.05, deckWidth: 0.08 },
];

function createBaghlaHullGeometry(profile: ShipProfile) {
  return createHardChineHullGeometry(scaleStationSpecs(profile, stationFractions), profile.hull.height, {
    chineY: 0.24,
    keelY: -0.16,
  });
}

function createBaghlaDeckGeometry(profile: ShipProfile) {
  return createDeckGeometry(scaleStationSpecs(profile, stationFractions), profile.hull.height + 0.04);
}

export function BaghlaHull({ profile, hullMaterialRef, deckMaterialRef }: BaghlaHullProps) {
  const hullGeometry = useMemo(() => createBaghlaHullGeometry(profile), [profile]);
  const deckGeometry = useMemo(() => createBaghlaDeckGeometry(profile), [profile]);
  const stations = useMemo(() => scaleStationSpecs(profile, stationFractions), [profile]);
  const h = profile.hull.height;
  const w = profile.hull.width;
  const l = profile.hull.length;
  const trim = profile.hull.trimColor;
  const railY = h + 0.18;
  const transomZ = -l * 0.5;
  const transomY = h + 0.54;
  const transomW = w * 0.82;
  const transomH = 0.94;

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
        [-s.chineWidth * 0.55, h * 0.46, s.z], [-n.chineWidth * 0.55, h * 0.46, n.z],
        [s.chineWidth * 0.55, h * 0.46, s.z], [n.chineWidth * 0.55, h * 0.46, n.z],
        [-s.chineWidth * 0.45, h * 0.66, s.z], [-n.chineWidth * 0.45, h * 0.66, n.z],
        [s.chineWidth * 0.45, h * 0.66, s.z], [n.chineWidth * 0.45, h * 0.66, n.z],
      );
    }
    return createLineSegmentsGeometry(points);
  }, [h, stations]);

  const transomLineGeometry = useMemo(() => createLineSegmentsGeometry([
    [-transomW * 0.34, transomY - transomH * 0.36, transomZ - 0.075], [-transomW * 0.34, transomY + transomH * 0.38, transomZ - 0.075],
    [0, transomY - transomH * 0.4, transomZ - 0.077], [0, transomY + transomH * 0.42, transomZ - 0.077],
    [transomW * 0.34, transomY - transomH * 0.36, transomZ - 0.075], [transomW * 0.34, transomY + transomH * 0.38, transomZ - 0.075],
    [-transomW * 0.42, transomY + transomH * 0.28, transomZ - 0.078], [transomW * 0.42, transomY + transomH * 0.28, transomZ - 0.078],
  ]), [transomH, transomW, transomY, transomZ]);

  useEffect(() => () => {
    hullGeometry.dispose();
    deckGeometry.dispose();
    trimLineGeometry.dispose();
    plankLineGeometry.dispose();
    transomLineGeometry.dispose();
  }, [deckGeometry, hullGeometry, plankLineGeometry, transomLineGeometry, trimLineGeometry]);

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

      <Spar from={[0, h + 0.08, l * 0.48]} to={[0, h + 1.68, l * 0.78]} radius={0.07} color={trim} />
      <mesh position={[0, h + 1.82, l * 0.81]} rotation={[0.48, 0, 0]} castShadow>
        <coneGeometry args={[0.065, 0.24, 6]} />
        <meshStandardMaterial color={trim} roughness={0.85} />
      </mesh>

      <mesh position={[0, h + 0.26, -l * 0.36]} castShadow receiveShadow>
        <boxGeometry args={[w * 0.66, 0.5, l * 0.18]} />
        <meshStandardMaterial color={profile.hull.cabinColor} roughness={0.9} />
      </mesh>
      <mesh position={[0, transomY, transomZ]} castShadow receiveShadow>
        <boxGeometry args={[transomW, transomH, 0.14]} />
        <meshStandardMaterial color={trim} roughness={0.88} />
      </mesh>
      <lineSegments geometry={transomLineGeometry}>
        <lineBasicMaterial color={profile.hull.hullColor} />
      </lineSegments>

      {[-transomW * 0.24, transomW * 0.24].map((x) => (
        <group key={`baghla-window-${x}`} position={[x, transomY + transomH * 0.04, transomZ - 0.088]}>
          <mesh>
            <boxGeometry args={[0.2, 0.2, 0.018]} />
            <meshStandardMaterial color="#f0c878" emissive="#9c5f1e" emissiveIntensity={0.22} toneMapped={false} />
          </mesh>
          <mesh position={[0, 0, 0.012]}>
            <boxGeometry args={[0.018, 0.21, 0.008]} />
            <meshStandardMaterial color={profile.hull.hullColor} roughness={0.9} />
          </mesh>
          <mesh position={[0, 0, 0.012]}>
            <boxGeometry args={[0.21, 0.018, 0.008]} />
            <meshStandardMaterial color={profile.hull.hullColor} roughness={0.9} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, transomY + transomH * 0.52 + 0.04, transomZ]} castShadow>
        <boxGeometry args={[transomW * 1.08, 0.08, 0.2]} />
        <meshStandardMaterial color={profile.hull.hullColor} roughness={0.86} />
      </mesh>

      <mesh position={[0, h + 0.14, 0.08]} castShadow receiveShadow>
        <boxGeometry args={[w * 0.44, 0.14, l * 0.18]} />
        <meshStandardMaterial color={trim} roughness={0.9} />
      </mesh>
      <mesh position={[0, h + 0.225, 0.08]} receiveShadow>
        <boxGeometry args={[w * 0.36, 0.04, l * 0.13]} />
        <meshStandardMaterial color={profile.hull.hullColor} roughness={0.96} />
      </mesh>

      {[-0.24, 0, 0.24].map((x) => (
        <mesh key={`baghla-deck-line-${x}`} position={[x, h + 0.052, 0]} castShadow={false}>
          <boxGeometry args={[0.012, 0.016, l * 0.74]} />
          <meshStandardMaterial color="#5a3a20" roughness={1} />
        </mesh>
      ))}
    </group>
  );
}
