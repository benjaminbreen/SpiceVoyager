import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { NPCShipVisual } from '../../utils/npcShipGenerator';

const SPAR_WOOD = '#3e2723';
const HULL_TRIM_MIX = '#4a352a';

export function mutedHullTrim(color: string, amount = 0.42) {
  return new THREE.Color(color).lerp(new THREE.Color(HULL_TRIM_MIX), amount).getStyle();
}

function SailMaterial({ color }: { color: string }) {
  return (
    <meshStandardMaterial
      color={color}
      emissive={color}
      emissiveIntensity={0.07}
      roughness={1}
      side={THREE.DoubleSide}
    />
  );
}

export function CannonPorts({ visual, zPositions }: { visual: NPCShipVisual; zPositions: number[] }) {
  if (!visual.hasCannonPorts) return null;
  return (
    <>
      {zPositions.map((z) => (
        <group key={z}>
          <mesh position={[-1.22, 0.7, z]}>
            <boxGeometry args={[0.06, 0.16, 0.28]} />
            <meshStandardMaterial color="#101010" roughness={0.8} />
          </mesh>
          <mesh position={[1.22, 0.7, z]}>
            <boxGeometry args={[0.06, 0.16, 0.28]} />
            <meshStandardMaterial color="#101010" roughness={0.8} />
          </mesh>
        </group>
      ))}
    </>
  );
}

export function SternFlag({ visual }: { visual: NPCShipVisual }) {
  return (
    <group position={[0, 2.9, -2.45]}>
      <mesh position={[0, 0.35, 0]} rotation={[0, 0, 0.18]}>
        <boxGeometry args={[0.05, 0.9, 0.05]} />
        <meshStandardMaterial color={SPAR_WOOD} />
      </mesh>
      <mesh position={[0.28, 0.65, 0]} rotation={[0, 0, 0.08]}>
        <boxGeometry args={[0.55, 0.34, 0.035]} />
        <meshStandardMaterial color={visual.flagColor} roughness={0.8} />
      </mesh>
      <mesh position={[0.28, 0.65, 0.025]} rotation={[0, 0, 0.08]}>
        <boxGeometry args={[0.3, 0.06, 0.04]} />
        <meshStandardMaterial color={visual.flagAccentColor} roughness={0.8} />
      </mesh>
    </group>
  );
}

export function LateenSail({
  visual,
  position,
  scale = 1,
  angle = -0.46,
}: {
  visual: NPCShipVisual;
  position: [number, number, number];
  scale?: number;
  angle?: number;
}) {
  const geometry = useMemo(() => {
    const width = 2.45 * scale;
    const height = 1.7 * scale;
    const shape = new THREE.Shape();
    shape.moveTo(0, height * 0.5);
    shape.lineTo(0, -height * 0.5);
    shape.lineTo(width, -height * 0.18);
    shape.closePath();
    return new THREE.ShapeGeometry(shape);
  }, [scale]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <group position={position} rotation={[0, 0, angle]}>
      <mesh geometry={geometry} castShadow>
        <SailMaterial color={visual.sailColor} />
      </mesh>
      <mesh position={[0, 0, 0.035]}>
        <cylinderGeometry args={[0.04 * scale, 0.05 * scale, 1.9 * scale, 7]} />
        <meshStandardMaterial color={SPAR_WOOD} roughness={0.85} />
      </mesh>
    </group>
  );
}

export function LugSail({
  color,
  width,
  height,
}: {
  color: string;
  width: number;
  height: number;
}) {
  const geometry = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(-width * 0.54, height * 0.5);
    shape.lineTo(width * 0.43, height * 0.43);
    shape.lineTo(width * 0.5, -height * 0.42);
    shape.lineTo(-width * 0.48, -height * 0.5);
    shape.closePath();
    return new THREE.ShapeGeometry(shape);
  }, [height, width]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <mesh geometry={geometry} castShadow>
      <SailMaterial color={color} />
    </mesh>
  );
}

function buildCamberedPlane(width: number, height: number, segmentsX: number, segmentsY: number, camber: number) {
  const geometry = new THREE.PlaneGeometry(width, height, segmentsX, segmentsY);
  const positions = geometry.attributes.position.array as Float32Array;
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i] / (width * 0.5);
    const y = positions[i + 1] / (height * 0.5);
    positions[i + 2] = (1 - x * x) * (0.65 + 0.35 * (1 - Math.abs(y))) * camber;
  }
  geometry.attributes.position.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

export function SquareSail({
  color,
  width,
  height,
  camber = 0.08,
}: {
  color: string;
  width: number;
  height: number;
  camber?: number;
}) {
  const geometry = useMemo(() => buildCamberedPlane(width, height, 4, 3, camber), [camber, height, width]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <mesh geometry={geometry} castShadow>
      <SailMaterial color={color} />
    </mesh>
  );
}
