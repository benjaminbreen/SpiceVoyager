import * as THREE from 'three';
import { getBackgroundHeightColor } from './terrain';

// Background terrain ring that extends visible land well beyond the playable
// area. Matches the main mesh sampler so minimap and main view agree, but uses
// coarse segments and skips all gameplay systems (flora, fauna, obstacles).
// A square hole in the middle keeps it from overlapping the high-density
// playable mesh, so the two surfaces never fight for the same pixels.
export function buildBackgroundRingGeometry(
  outerHalf: number,
  innerHalf: number,
  step: number,
): THREE.BufferGeometry {
  const segs = Math.ceil((outerHalf * 2) / step);
  const vertsPerSide = segs + 1;
  const vertIndex = new Int32Array(vertsPerSide * vertsPerSide).fill(-1);
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  const getOrAddVert = (ix: number, iy: number) => {
    const key = iy * vertsPerSide + ix;
    const existing = vertIndex[key];
    if (existing !== -1) return existing;
    const x = -outerHalf + ix * step;
    const y = -outerHalf + iy * step; // plane's local Y; world Z is -y after rotation
    const worldZ = -y;
    const t = getBackgroundHeightColor(x, worldZ);
    const idx = positions.length / 3;
    positions.push(x, y, t.height);
    colors.push(t.color[0], t.color[1], t.color[2]);
    vertIndex[key] = idx;
    return idx;
  };

  for (let iy = 0; iy < segs; iy++) {
    for (let ix = 0; ix < segs; ix++) {
      const x0 = -outerHalf + ix * step;
      const y0 = -outerHalf + iy * step;
      const x1 = x0 + step;
      const y1 = y0 + step;
      // Skip quads fully inside the inner hole — the high-density mesh covers these.
      if (
        Math.max(Math.abs(x0), Math.abs(x1)) < innerHalf &&
        Math.max(Math.abs(y0), Math.abs(y1)) < innerHalf
      ) continue;
      const i00 = getOrAddVert(ix, iy);
      const i10 = getOrAddVert(ix + 1, iy);
      const i01 = getOrAddVert(ix, iy + 1);
      const i11 = getOrAddVert(ix + 1, iy + 1);
      indices.push(i00, i10, i11, i00, i11, i01);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  return geo;
}
