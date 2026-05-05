import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { ShipProfile } from '../../utils/shipProfiles';

type BaghlaRiggingProps = {
  profile: ShipProfile;
};

export function BaghlaRigging({ profile }: BaghlaRiggingProps) {
  const [main, mizzen] = profile.masts;
  if (!main || !mizzen) return null;

  const h = profile.hull.height;
  const w = profile.hull.width;
  const l = profile.hull.length;
  const rope = '#2a2118';

  const geometry = useMemo(() => {
    const mainTop: [number, number, number] = [0, main.position[1] + main.height * 0.5, main.position[2]];
    const mizzenTop: [number, number, number] = [0, mizzen.position[1] + mizzen.height * 0.5, mizzen.position[2]];
    const points: [number, number, number][] = [
      mainTop, [-w * 0.42, h + 0.18, l * 0.2],
      mainTop, [w * 0.42, h + 0.18, l * 0.2],
      mainTop, [-w * 0.42, h + 0.16, -l * 0.08],
      mainTop, [w * 0.42, h + 0.16, -l * 0.08],
      mizzenTop, [-w * 0.36, h + 0.2, -l * 0.4],
      mizzenTop, [w * 0.36, h + 0.2, -l * 0.4],
      mainTop, mizzenTop,
      mainTop, [0, h + 1.42, l * 0.74],
      mizzenTop, [0, h + 0.72, -l * 0.5],
    ];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(points.flat(), 3));
    return geo;
  }, [h, l, main.height, main.position, mizzen.height, mizzen.position, w]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color={rope} />
    </lineSegments>
  );
}
