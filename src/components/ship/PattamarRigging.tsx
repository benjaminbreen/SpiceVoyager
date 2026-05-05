import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { ShipProfile } from '../../utils/shipProfiles';

type PattamarRiggingProps = {
  profile: ShipProfile;
};

export function PattamarRigging({ profile }: PattamarRiggingProps) {
  const [main, mizzen] = profile.masts;
  if (!main || !mizzen) return null;

  const h = profile.hull.height;
  const w = profile.hull.width;
  const l = profile.hull.length;

  const geometry = useMemo(() => {
    const mainTop: [number, number, number] = [0, main.position[1] + main.height * 0.5, main.position[2]];
    const mizzenTop: [number, number, number] = [0, mizzen.position[1] + mizzen.height * 0.5, mizzen.position[2]];
    const points: [number, number, number][] = [
      mainTop, [-w * 0.44, h + 0.13, l * 0.18],
      mainTop, [w * 0.44, h + 0.13, l * 0.18],
      mainTop, [-w * 0.4, h + 0.12, -l * 0.1],
      mainTop, [w * 0.4, h + 0.12, -l * 0.1],
      mizzenTop, [-w * 0.34, h + 0.15, -l * 0.42],
      mizzenTop, [w * 0.34, h + 0.15, -l * 0.42],
      mainTop, mizzenTop,
      mainTop, [0, h + 1.42, l * 0.74],
      mizzenTop, [0, h + 0.46, -l * 0.5],
    ];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(points.flat(), 3));
    return geo;
  }, [h, l, main.height, main.position, mizzen.height, mizzen.position, w]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color="#2a2118" />
    </lineSegments>
  );
}
