import { useMemo } from 'react';
import * as THREE from 'three';

type SparProps = {
  from: [number, number, number];
  to: [number, number, number];
  radius: number;
  color: string;
  roughness?: number;
  castShadow?: boolean;
};

const UP = new THREE.Vector3(0, 1, 0);

export function Spar({
  from,
  to,
  radius,
  color,
  roughness = 0.85,
  castShadow = true,
}: SparProps) {
  const { position, quaternion, length } = useMemo(() => {
    const start = new THREE.Vector3(...from);
    const end = new THREE.Vector3(...to);
    const delta = end.clone().sub(start);
    const len = delta.length();
    const quat = new THREE.Quaternion();
    if (len > 0.001) quat.setFromUnitVectors(UP, delta.normalize());
    return {
      position: start.add(end).multiplyScalar(0.5),
      quaternion: quat,
      length: len,
    };
  }, [from, to]);

  return (
    <mesh position={position} quaternion={quaternion} castShadow={castShadow}>
      <cylinderGeometry args={[radius, radius, length, 6]} />
      <meshStandardMaterial color={color} roughness={roughness} />
    </mesh>
  );
}
