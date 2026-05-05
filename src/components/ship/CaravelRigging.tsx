import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { ShipProfile } from '../../utils/shipProfiles';

type CaravelRiggingProps = {
  profile: ShipProfile;
};

export function CaravelRigging({ profile }: CaravelRiggingProps) {
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
      mainTop, [-w * 0.42, h + 0.18, -l * 0.16],
      mainTop, [w * 0.42, h + 0.18, -l * 0.16],
      mainTop, [-w * 0.4, h + 0.16, l * 0.2],
      mainTop, [w * 0.4, h + 0.16, l * 0.2],
      foreTop, [-w * 0.34, h + 0.15, l * 0.33],
      foreTop, [w * 0.34, h + 0.15, l * 0.33],
      mizzenTop, [-w * 0.28, h + 0.2, -l * 0.4],
      mizzenTop, [w * 0.28, h + 0.2, -l * 0.4],
      foreTop, mainTop,
      mainTop, mizzenTop,
      foreTop, [0, h + 0.9, l * 0.63],
      mizzenTop, [0, h + 0.75, -l * 0.49],
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
