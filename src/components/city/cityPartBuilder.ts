import { SEA_LEVEL } from '../../constants/world';
import type { Part, TorchSpot } from './cityTypes';
import { BASE_COLORS, varyColor } from './cityRandom';

interface CityPartBuilderOptions {
  parts: Part[];
  torches: TorchSpot[];
  buildingId: string;
  origin: [number, number, number];
  rotation: number;
  shakeCenter: [number, number, number];
  rng: () => number;
}

export class CityPartBuilder {
  constructor(private readonly options: CityPartBuilderOptions) {}

  addPart = (
    geo: Part['geo'],
    mat: Part['mat'],
    lx: number,
    ly: number,
    lz: number,
    sw: number,
    sh: number,
    sd: number,
    colorOverride?: [number, number, number],
    overlay?: boolean,
    localYRot = 0,
  ) => {
    const { parts, buildingId, origin, rotation, shakeCenter, rng } = this.options;
    const [x, y, z] = origin;
    const rx = lx * Math.cos(rotation) - lz * Math.sin(rotation);
    const rz = lx * Math.sin(rotation) + lz * Math.cos(rotation);
    parts.push({
      geo,
      mat,
      pos: [x + rx, y + ly, z + rz],
      scale: [sw, sh, sd],
      rot: [0, rotation + localYRot, 0],
      color: colorOverride ?? varyColor(BASE_COLORS[mat] ?? BASE_COLORS.dark, rng),
      buildingId,
      shakeCenter,
      overlay,
    });
  };

  addTorch = (lx: number, ly: number, lz: number) => {
    const { torches, buildingId, origin, rotation } = this.options;
    const [x, y, z] = origin;
    const minBracketBottom = SEA_LEVEL + 0.05;
    const bracketBottomWorld = y + ly - 0.6;
    const lyAdj = ly + Math.max(0, minBracketBottom - bracketBottomWorld);
    const rx = lx * Math.cos(rotation) - lz * Math.sin(rotation);
    const rz = lx * Math.sin(rotation) + lz * Math.cos(rotation);
    torches.push({ pos: [x + rx, y + lyAdj, z + rz], buildingId });
    this.addPart('cylinder', 'wood', lx, lyAdj - 0.3, lz, 0.08, 0.6, 0.08);
  };

  scalePartsSince = (startIdx: number, lax: number, laz: number, scale: number) => {
    const { parts, origin, rotation } = this.options;
    const [x, y, z] = origin;
    const rx = lax * Math.cos(rotation) - laz * Math.sin(rotation);
    const rz = lax * Math.sin(rotation) + laz * Math.cos(rotation);
    const ax = x + rx;
    const az = z + rz;
    for (let i = startIdx; i < parts.length; i++) {
      const p = parts[i];
      p.pos = [
        ax + (p.pos[0] - ax) * scale,
        y + (p.pos[1] - y) * scale,
        az + (p.pos[2] - az) * scale,
      ];
      p.scale = [p.scale[0] * scale, p.scale[1] * scale, p.scale[2] * scale];
    }
  };
}
