import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { ShipProfile } from '../../utils/shipProfiles';

type PinnaceRiggingProps = {
  profile: ShipProfile;
};

export function PinnaceRigging({ profile }: PinnaceRiggingProps) {
  const main = profile.masts[0];
  const fore = profile.masts[1];
  if (!main || !fore) return null;

  const h = profile.hull.height;
  const w = profile.hull.width;
  const l = profile.hull.length;
  const rope = '#2a2118';
  const geometry = useMemo(() => {
    const mainTop: [number, number, number] = [main.position[0], main.position[1] + main.height * 0.5, main.position[2]];
    const foreTop: [number, number, number] = [fore.position[0], fore.position[1] + fore.height * 0.5, fore.position[2]];
    const points: [number, number, number][] = [
      mainTop, [-w * 0.5, h + 0.18, -l * 0.22],
      mainTop, [w * 0.5, h + 0.18, -l * 0.22],
      mainTop, [-w * 0.45, h + 0.16, l * 0.24],
      mainTop, [w * 0.45, h + 0.16, l * 0.24],
      foreTop, [-w * 0.42, h + 0.15, l * 0.34],
      foreTop, [w * 0.42, h + 0.15, l * 0.34],
      mainTop, foreTop,
      foreTop, [0, h + 0.28, l * 0.5],
      mainTop, [0, h + 0.3, -l * 0.5],
    ];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(points.flat(), 3));
    return geo;
  }, [fore.height, fore.position, h, l, main.height, main.position, w]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color={rope} />
    </lineSegments>
  );
}
