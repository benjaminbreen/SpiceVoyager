import { useEffect, useMemo, type RefObject } from 'react';
import * as THREE from 'three';
import type { ShipProfile } from '../../utils/shipProfiles';
import {
  createDeckGeometry,
  createHardChineHullGeometry,
  createLineSegmentsGeometry,
  scaleStationSpecs,
  type HullStationSpec,
} from './shipGeometry';

type JunkHullProps = {
  profile: ShipProfile;
  hullMaterialRef: RefObject<THREE.MeshStandardMaterial | null>;
  deckMaterialRef: RefObject<THREE.MeshStandardMaterial | null>;
  oculusTexture: THREE.CanvasTexture | null;
};

const stationFractions: HullStationSpec[] = [
  { z: -0.5, width: 0.84, chineWidth: 0.72, deckWidth: 0.76 },
  { z: -0.34, width: 1.0, chineWidth: 0.88, deckWidth: 0.94 },
  { z: -0.08, width: 1.05, chineWidth: 0.92, deckWidth: 1.0 },
  { z: 0.2, width: 0.98, chineWidth: 0.84, deckWidth: 0.9 },
  { z: 0.4, width: 0.82, chineWidth: 0.68, deckWidth: 0.74 },
  { z: 0.5, width: 0.72, chineWidth: 0.58, deckWidth: 0.64 },
];

function createJunkHullGeometry(profile: ShipProfile) {
  return createHardChineHullGeometry(scaleStationSpecs(profile, stationFractions), profile.hull.height, {
    chineY: 0.34,
    keelY: -0.1,
  });
}

function createJunkDeckGeometry(profile: ShipProfile) {
  return createDeckGeometry(scaleStationSpecs(profile, stationFractions), profile.hull.height + 0.04);
}

export function JunkHull({ profile, hullMaterialRef, deckMaterialRef, oculusTexture }: JunkHullProps) {
  const hullGeometry = useMemo(() => createJunkHullGeometry(profile), [profile]);
  const deckGeometry = useMemo(() => createJunkDeckGeometry(profile), [profile]);
  const stations = useMemo(() => scaleStationSpecs(profile, stationFractions), [profile]);
  const h = profile.hull.height;
  const w = profile.hull.width;
  const l = profile.hull.length;
  const trim = profile.hull.trimColor;
  const railY = h + 0.2;
  const sternZ = -l * 0.5;
  const sternPanelW = w * 0.72;
  const sternPanelH = 1.55;
  const sternPanelY = h + 1.18;
  const sternFaceZ = sternZ - 0.085;
  const mainZ = profile.masts[0]?.position[2] ?? -0.8;
  const foreZ = profile.masts[1]?.position[2] ?? 1.5;
  const deckhouseZ = (mainZ + foreZ) * 0.5 + 0.16;

  const trimLineGeometry = useMemo(() => {
    const points: [number, number, number][] = [];
    for (let i = 0; i < stations.length - 1; i++) {
      const s = stations[i];
      const n = stations[i + 1];
      points.push(
        [-s.deckWidth * 0.52, railY, s.z], [-n.deckWidth * 0.52, railY, n.z],
        [s.deckWidth * 0.52, railY, s.z], [n.deckWidth * 0.52, railY, n.z],
        [-s.chineWidth * 0.54, h * 0.58, s.z], [-n.chineWidth * 0.54, h * 0.58, n.z],
        [s.chineWidth * 0.54, h * 0.58, s.z], [n.chineWidth * 0.54, h * 0.58, n.z],
      );
    }
    for (const s of stations.slice(1, -1)) {
      points.push(
        [-s.deckWidth * 0.52, h + 0.04, s.z], [-s.deckWidth * 0.52, railY + 0.04, s.z],
        [s.deckWidth * 0.52, h + 0.04, s.z], [s.deckWidth * 0.52, railY + 0.04, s.z],
      );
    }
    return createLineSegmentsGeometry(points);
  }, [h, railY, stations]);

  const deckLineGeometry = useMemo(() => createLineSegmentsGeometry([
    [-w * 0.32, h + 0.058, -l * 0.38], [-w * 0.32, h + 0.058, l * 0.38],
    [0, h + 0.06, -l * 0.4], [0, h + 0.06, l * 0.4],
    [w * 0.32, h + 0.058, -l * 0.38], [w * 0.32, h + 0.058, l * 0.38],
    [-w * 0.42, h + 0.062, l * 0.36], [w * 0.42, h + 0.062, l * 0.36],
    [-w * 0.45, h + 0.062, -l * 0.34], [w * 0.45, h + 0.062, -l * 0.34],
  ]), [h, l, w]);

  const sternLineGeometry = useMemo(() => createLineSegmentsGeometry([
    [-sternPanelW * 0.36, sternPanelY - sternPanelH * 0.38, sternFaceZ], [-sternPanelW * 0.36, sternPanelY + sternPanelH * 0.42, sternFaceZ],
    [0, sternPanelY - sternPanelH * 0.42, sternFaceZ], [0, sternPanelY + sternPanelH * 0.44, sternFaceZ],
    [sternPanelW * 0.36, sternPanelY - sternPanelH * 0.38, sternFaceZ], [sternPanelW * 0.36, sternPanelY + sternPanelH * 0.42, sternFaceZ],
    [-sternPanelW * 0.48, sternPanelY + sternPanelH * 0.14, sternFaceZ], [sternPanelW * 0.48, sternPanelY + sternPanelH * 0.14, sternFaceZ],
    [-sternPanelW * 0.48, sternPanelY - sternPanelH * 0.16, sternFaceZ], [sternPanelW * 0.48, sternPanelY - sternPanelH * 0.16, sternFaceZ],
  ]), [sternFaceZ, sternPanelH, sternPanelW, sternPanelY]);

  useEffect(() => () => {
    hullGeometry.dispose();
    deckGeometry.dispose();
    trimLineGeometry.dispose();
    deckLineGeometry.dispose();
    sternLineGeometry.dispose();
  }, [deckGeometry, deckLineGeometry, hullGeometry, sternLineGeometry, trimLineGeometry]);

  const eyeSize = Math.min(w * 0.43, h * 0.68);
  const eyeY = h * 0.54;
  const eyeZ = l * 0.36;
  const sideX = w * 0.5 + 0.012;
  const rudderH = 2.38;
  const rudderL = l * 0.15;
  const rudderZ = -l * 0.5 - rudderL * 0.28;
  const rudderY = h * 0.08;

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
        <lineBasicMaterial color="#4a3020" />
      </lineSegments>

      <mesh position={[0, h + 0.32, l * 0.41]} castShadow receiveShadow>
        <boxGeometry args={[w * 0.68, 0.46, l * 0.14]} />
        <meshStandardMaterial color={trim} roughness={0.9} />
      </mesh>
      <mesh position={[0, h + 0.18, -l * 0.33]} castShadow receiveShadow>
        <boxGeometry args={[w * 0.72, 0.34, l * 0.18]} />
        <meshStandardMaterial color={profile.hull.cabinColor} roughness={0.9} />
      </mesh>

      <mesh position={[0, h + 0.38, deckhouseZ]} castShadow receiveShadow>
        <boxGeometry args={[w * 0.66, 0.68, l * 0.2]} />
        <meshStandardMaterial color={profile.hull.cabinColor} roughness={0.9} />
      </mesh>
      <mesh position={[0, h + 0.78, deckhouseZ]} castShadow>
        <boxGeometry args={[w * 0.78, 0.12, l * 0.25]} />
        <meshStandardMaterial color={trim} roughness={0.88} />
      </mesh>
      <mesh position={[0, h + 0.32, deckhouseZ + l * 0.105]} castShadow={false}>
        <circleGeometry args={[0.15, 14]} />
        <meshStandardMaterial color={profile.hull.hullColor} roughness={0.95} />
      </mesh>
      {[-w * 0.34, w * 0.34].map((x) => (
        <mesh key={`junk-deckhouse-panel-${x}`} position={[x, h + 0.42, deckhouseZ]}>
          <boxGeometry args={[0.025, 0.3, l * 0.17]} />
          <meshStandardMaterial color={trim} roughness={0.9} />
        </mesh>
      ))}

      <mesh position={[0, sternPanelY, sternZ]} castShadow receiveShadow>
        <boxGeometry args={[sternPanelW, sternPanelH, 0.16]} />
        <meshStandardMaterial color={trim} roughness={0.9} />
      </mesh>
      <lineSegments geometry={sternLineGeometry}>
        <lineBasicMaterial color={profile.hull.hullColor} />
      </lineSegments>
      {[-sternPanelH * 0.28, sternPanelH * 0.05, sternPanelH * 0.32].map((dy, i) => (
        <mesh key={`junk-stern-band-${i}`} position={[0, sternPanelY + dy, sternFaceZ - 0.014]}>
          <boxGeometry args={[sternPanelW * 1.04, 0.07, 0.02]} />
          <meshStandardMaterial color={profile.hull.deckColor} roughness={0.9} />
        </mesh>
      ))}
      <mesh position={[0, sternPanelY + sternPanelH * 0.5 + 0.08, sternZ]} castShadow>
        <boxGeometry args={[sternPanelW * 1.16, 0.16, 0.24]} />
        <meshStandardMaterial color={profile.hull.cabinColor} roughness={0.9} />
      </mesh>
      {[-sternPanelW * 0.54, sternPanelW * 0.54].map((x, i) => (
        <mesh
          key={`junk-stern-horn-${i}`}
          position={[x, sternPanelY + sternPanelH * 0.5 + 0.24, sternZ]}
          rotation={[0, 0, (i === 0 ? -1 : 1) * 0.4]}
          castShadow
        >
          <coneGeometry args={[0.08, 0.28, 5]} />
          <meshStandardMaterial color={profile.hull.cabinColor} roughness={0.85} />
        </mesh>
      ))}

      {oculusTexture && (
        <group>
          <mesh position={[-sideX, eyeY, eyeZ]} rotation={[0, -Math.PI / 2, 0]}>
            <planeGeometry args={[eyeSize, eyeSize]} />
            <meshStandardMaterial map={oculusTexture} roughness={0.9} />
          </mesh>
          <mesh position={[sideX, eyeY, eyeZ]} rotation={[0, Math.PI / 2, 0]}>
            <planeGeometry args={[eyeSize, eyeSize]} />
            <meshStandardMaterial map={oculusTexture} roughness={0.9} />
          </mesh>
        </group>
      )}

      <mesh position={[0, rudderY, rudderZ]} castShadow receiveShadow>
        <boxGeometry args={[0.13, rudderH, rudderL]} />
        <meshStandardMaterial color={profile.hull.hullColor} roughness={0.95} />
      </mesh>
      {[-rudderH * 0.28, 0, rudderH * 0.28].map((dy, i) => (
        <mesh key={`junk-rudder-hole-${i}`} position={[0.07, rudderY + dy, rudderZ]} rotation={[0, Math.PI / 2, 0]}>
          <circleGeometry args={[0.08, 10]} />
          <meshStandardMaterial color="#1a0f08" roughness={1} side={THREE.DoubleSide} />
        </mesh>
      ))}
      <mesh position={[0, rudderY + rudderH * 0.5 + 0.08, rudderZ - rudderL * 0.16]} castShadow>
        <boxGeometry args={[0.24, 0.16, rudderL * 0.36]} />
        <meshStandardMaterial color={trim} roughness={0.9} />
      </mesh>
    </group>
  );
}
