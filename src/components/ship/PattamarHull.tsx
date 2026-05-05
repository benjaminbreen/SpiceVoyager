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

type PattamarHullProps = {
  profile: ShipProfile;
  hullMaterialRef: RefObject<THREE.MeshStandardMaterial | null>;
  deckMaterialRef: RefObject<THREE.MeshStandardMaterial | null>;
};

const stationFractions: HullStationSpec[] = [
  { z: -0.5, width: 0.5, chineWidth: 0.36, deckWidth: 0.42 },
  { z: -0.28, width: 0.82, chineWidth: 0.62, deckWidth: 0.72 },
  { z: 0.04, width: 1.0, chineWidth: 0.76, deckWidth: 0.88 },
  { z: 0.3, width: 0.68, chineWidth: 0.48, deckWidth: 0.58 },
  { z: 0.44, width: 0.28, chineWidth: 0.16, deckWidth: 0.22 },
  { z: 0.5, width: 0.07, chineWidth: 0.04, deckWidth: 0.06 },
];

function createPattamarHullGeometry(profile: ShipProfile) {
  return createHardChineHullGeometry(scaleStationSpecs(profile, stationFractions), profile.hull.height, {
    chineY: 0.22,
    keelY: -0.2,
  });
}

function createPattamarDeckGeometry(profile: ShipProfile) {
  return createDeckGeometry(scaleStationSpecs(profile, stationFractions), profile.hull.height + 0.032);
}

export function PattamarHull({ profile, hullMaterialRef, deckMaterialRef }: PattamarHullProps) {
  const hullGeometry = useMemo(() => createPattamarHullGeometry(profile), [profile]);
  const deckGeometry = useMemo(() => createPattamarDeckGeometry(profile), [profile]);
  const stations = useMemo(() => scaleStationSpecs(profile, stationFractions), [profile]);
  const h = profile.hull.height;
  const w = profile.hull.width;
  const l = profile.hull.length;
  const trim = profile.hull.trimColor;
  const railY = h + 0.13;
  const sternZ = -l * 0.49;
  const sternW = w * 0.8;
  const sternH = 0.58;
  const sternY = h + 0.32;

  const trimLineGeometry = useMemo(() => {
    const points: [number, number, number][] = [];
    for (let i = 0; i < stations.length - 1; i++) {
      const s = stations[i];
      const n = stations[i + 1];
      points.push(
        [-s.width * 0.52, railY, s.z], [-n.width * 0.52, railY, n.z],
        [s.width * 0.52, railY, s.z], [n.width * 0.52, railY, n.z],
        [-s.chineWidth * 0.54, h * 0.5, s.z], [-n.chineWidth * 0.54, h * 0.5, n.z],
        [s.chineWidth * 0.54, h * 0.5, s.z], [n.chineWidth * 0.54, h * 0.5, n.z],
      );
    }
    return createLineSegmentsGeometry(points);
  }, [h, railY, stations]);

  const deckLineGeometry = useMemo(() => createLineSegmentsGeometry([
    [-w * 0.22, h + 0.045, -l * 0.36], [-w * 0.22, h + 0.045, l * 0.34],
    [0, h + 0.048, -l * 0.38], [0, h + 0.048, l * 0.36],
    [w * 0.22, h + 0.045, -l * 0.36], [w * 0.22, h + 0.045, l * 0.34],
    [-w * 0.34, h + 0.05, -l * 0.1], [w * 0.34, h + 0.05, -l * 0.1],
    [-w * 0.3, h + 0.05, l * 0.28], [w * 0.3, h + 0.05, l * 0.28],
  ]), [h, l, w]);

  const transomLineGeometry = useMemo(() => createLineSegmentsGeometry([
    [-sternW * 0.36, sternY - sternH * 0.34, sternZ - 0.065], [-sternW * 0.36, sternY + sternH * 0.36, sternZ - 0.065],
    [0, sternY - sternH * 0.38, sternZ - 0.067], [0, sternY + sternH * 0.4, sternZ - 0.067],
    [sternW * 0.36, sternY - sternH * 0.34, sternZ - 0.065], [sternW * 0.36, sternY + sternH * 0.36, sternZ - 0.065],
  ]), [sternH, sternW, sternY, sternZ]);

  useEffect(() => () => {
    hullGeometry.dispose();
    deckGeometry.dispose();
    trimLineGeometry.dispose();
    deckLineGeometry.dispose();
    transomLineGeometry.dispose();
  }, [deckGeometry, deckLineGeometry, hullGeometry, transomLineGeometry, trimLineGeometry]);

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
        <lineBasicMaterial color="#5c3c24" />
      </lineSegments>

      <Spar from={[0, h + 0.04, l * 0.48]} to={[0, h + 1.55, l * 0.78]} radius={0.055} color={trim} />
      <Spar from={[0, h + 0.02, l * 0.36]} to={[0, h + 1.0, l * 0.58]} radius={0.04} color={trim} />
      <mesh position={[0, h + 1.66, l * 0.81]} rotation={[0.5, 0, 0]} castShadow>
        <coneGeometry args={[0.055, 0.2, 6]} />
        <meshStandardMaterial color={trim} roughness={0.85} />
      </mesh>

      <mesh position={[0, sternY, sternZ]} castShadow receiveShadow>
        <boxGeometry args={[sternW, sternH, 0.12]} />
        <meshStandardMaterial color={trim} roughness={0.88} />
      </mesh>
      <lineSegments geometry={transomLineGeometry}>
        <lineBasicMaterial color={profile.hull.hullColor} />
      </lineSegments>
      <mesh position={[0, h + 0.2, -l * 0.34]} castShadow receiveShadow>
        <boxGeometry args={[w * 0.58, 0.34, l * 0.16]} />
        <meshStandardMaterial color={profile.hull.cabinColor} roughness={0.9} />
      </mesh>
      <mesh position={[0, h + 0.43, -l * 0.34]} castShadow>
        <boxGeometry args={[w * 0.66, 0.08, l * 0.2]} />
        <meshStandardMaterial color={trim} roughness={0.88} />
      </mesh>

      <mesh position={[0, h + 0.1, 0.08]} castShadow receiveShadow>
        <boxGeometry args={[w * 0.38, 0.1, l * 0.18]} />
        <meshStandardMaterial color={trim} roughness={0.9} />
      </mesh>
      <mesh position={[0, h + 0.165, 0.08]} receiveShadow>
        <boxGeometry args={[w * 0.3, 0.03, l * 0.13]} />
        <meshStandardMaterial color={profile.hull.hullColor} roughness={0.96} />
      </mesh>

      {[-w * 0.34, w * 0.34].map((x) => (
        <mesh key={`pattamar-outrigger-cleat-${x}`} position={[x, h + 0.12, l * 0.08]} castShadow>
          <boxGeometry args={[0.05, 0.1, l * 0.36]} />
          <meshStandardMaterial color={trim} roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}
