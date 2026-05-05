import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { ShipProfile } from '../../utils/shipProfiles';

type FluytRiggingProps = {
  profile: ShipProfile;
};

export function FluytRigging({ profile }: FluytRiggingProps) {
  const [main, fore, mizzen] = profile.masts;
  if (!main || !fore || !mizzen) return null;

  const h = profile.hull.height;
  const w = profile.hull.width;
  const l = profile.hull.length;
  const rope = '#241b13';
  const geometry = useMemo(() => {
    const mainTop: [number, number, number] = [0, main.position[1] + main.height * 0.5, main.position[2]];
    const foreTop: [number, number, number] = [0, fore.position[1] + fore.height * 0.5, fore.position[2]];
    const mizzenTop: [number, number, number] = [0, mizzen.position[1] + mizzen.height * 0.5, mizzen.position[2]];
    const points: [number, number, number][] = [
      mainTop, [-w * 0.34, h + 0.2, -l * 0.26],
      mainTop, [w * 0.34, h + 0.2, -l * 0.26],
      mainTop, [-w * 0.36, h + 0.18, l * 0.2],
      mainTop, [w * 0.36, h + 0.18, l * 0.2],
      foreTop, [-w * 0.3, h + 0.16, l * 0.35],
      foreTop, [w * 0.3, h + 0.16, l * 0.35],
      mizzenTop, [-w * 0.24, h + 0.22, -l * 0.43],
      mizzenTop, [w * 0.24, h + 0.22, -l * 0.43],
      foreTop, mainTop,
      mainTop, mizzenTop,
      foreTop, [0, h + 0.54, l * 0.68],
      mizzenTop, [0, h + 1.0, -l * 0.5],
    ];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(points.flat(), 3));
    return geo;
  }, [fore.height, fore.position, h, l, main.height, main.position, mizzen.height, mizzen.position, w]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color={rope} />
    </lineSegments>
  );
}
