import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { ShipProfile } from '../../utils/shipProfiles';

type JunkRiggingProps = {
  profile: ShipProfile;
};

export function JunkRigging({ profile }: JunkRiggingProps) {
  const [main, fore] = profile.masts;
  if (!main || !fore) return null;

  const h = profile.hull.height;
  const w = profile.hull.width;
  const l = profile.hull.length;

  const geometry = useMemo(() => {
    const mainTop: [number, number, number] = [0, main.position[1] + main.height * 0.5, main.position[2]];
    const foreTop: [number, number, number] = [0, fore.position[1] + fore.height * 0.5, fore.position[2]];
    const points: [number, number, number][] = [
      mainTop, [-w * 0.46, h + 0.2, -l * 0.32],
      mainTop, [w * 0.46, h + 0.2, -l * 0.32],
      mainTop, [-w * 0.42, h + 0.18, l * 0.02],
      mainTop, [w * 0.42, h + 0.18, l * 0.02],
      foreTop, [-w * 0.4, h + 0.18, l * 0.08],
      foreTop, [w * 0.4, h + 0.18, l * 0.08],
      foreTop, [-w * 0.36, h + 0.2, l * 0.42],
      foreTop, [w * 0.36, h + 0.2, l * 0.42],
      mainTop, foreTop,
      mainTop, [0, h + 2.14, -l * 0.5],
      foreTop, [0, h + 1.15, l * 0.5],
    ];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(points.flat(), 3));
    return geo;
  }, [fore.height, fore.position, h, l, main.height, main.position, w]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color="#2a2118" />
    </lineSegments>
  );
}
