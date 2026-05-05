import { PORT_FACTION, PORT_CULTURAL_REGION } from '../../store/gameStore';
import type { Building, CulturalRegion, Nationality } from '../../store/gameStore';
import type { Part } from './cityTypes';
import { BASE_COLORS, varyColor } from './cityRandom';

type AddPart = (
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
  localYRot?: number,
) => void;

interface FortRenderContext {
  port: { id: string; buildingStyle?: string; flagColor?: [number, number, number] };
  building: Building;
  w: number;
  h: number;
  d: number;
  rng: () => number;
  addPart: AddPart;
  addTorch: (lx: number, ly: number, lz: number) => void;
  addGroundSkirt: (sx: number, sz: number, color: [number, number, number], mat?: Part['mat'], thickness?: number) => void;
  addCrateStack: (lx: number, lz: number, size?: number) => void;
  addRopeCoil: (lx: number, lz: number, radius?: number) => void;
  addWorkRack: (lx: number, lz: number, width?: number) => void;
}

export function addFortParts(ctx: FortRenderContext) {
  const { port, w, h, d, rng, addPart, addTorch, addGroundSkirt, addCrateStack, addRopeCoil, addWorkRack } = ctx;
          const region: CulturalRegion | undefined = PORT_CULTURAL_REGION[port.id];
          const nat: Nationality | undefined = PORT_FACTION[port.id];
          const iberian = nat === 'Portuguese' || nat === 'Spanish';
          const northern = nat === 'Dutch' || nat === 'English';
          const gulf = region === 'Arab' || nat === 'Ottoman' || nat === 'Omani' || nat === 'Persian';
          const southAsian = region === 'Gujarati' || region === 'Malabari' || nat === 'Mughal' || nat === 'Gujarati';
          const portugueseWestAfrican = port.buildingStyle === 'west-african-round' && nat === 'Portuguese';
          const noEuropeanFort = port.id === 'cape-of-good-hope';
          const mat: Part['mat'] = noEuropeanFort || region === 'Malay'
            ? 'wood'
            : gulf || southAsian
              ? 'mud'
              : 'stone';
          const baseColor: [number, number, number] = noEuropeanFort
            ? [0.42, 0.32, 0.20]
            : region === 'Swahili'
              ? [0.84, 0.80, 0.68]
              : gulf
                ? [0.72, 0.58, 0.40]
                : southAsian
                  ? [0.72, 0.45, 0.28]
                  : northern
                    ? [0.50, 0.30, 0.22]
                    : iberian
                      ? [0.86, 0.80, 0.66]
                      : BASE_COLORS[mat];
          const wallColor = varyColor(baseColor, rng, 0.055);
          const capColor = varyColor([0.48, 0.46, 0.40], rng, 0.05);
          const flagColor: [number, number, number] = port.flagColor ?? (
            nat === 'Dutch' ? [0.92, 0.42, 0.10] :
            nat === 'English' ? [0.94, 0.92, 0.86] :
            nat === 'Ottoman' || nat === 'Omani' ? [0.55, 0.08, 0.08] :
            nat === 'Mughal' || nat === 'Gujarati' ? [0.12, 0.45, 0.20] :
            iberian ? [0.82, 0.12, 0.10] :
            [0.20, 0.35, 0.65]
          );
          const drawFlag = (px: number, py: number, pz: number, scale = 1, neutral = false) => {
            const clothColor: [number, number, number] = neutral ? [0.78, 0.66, 0.42] : flagColor;
            addPart('cylinder', 'wood', px, py + 1.2 * scale, pz, 0.06, 2.4 * scale, 0.06);
            addPart('box', 'straw', px + 0.48 * scale, py + 2.0 * scale, pz, 0.90 * scale, 0.48 * scale, 0.05, clothColor);
            if (neutral) return;
            if (nat === 'English') {
              const red: [number, number, number] = [0.78, 0.10, 0.10];
              addPart('box', 'straw', px + 0.48 * scale, py + 2.0 * scale, pz - 0.01, 0.90 * scale, 0.11 * scale, 0.05, red);
              addPart('box', 'straw', px + 0.48 * scale, py + 2.0 * scale, pz - 0.01, 0.16 * scale, 0.48 * scale, 0.05, red);
            } else if (nat === 'Dutch') {
              addPart('box', 'straw', px + 0.48 * scale, py + 2.0 * scale, pz - 0.01, 0.90 * scale, 0.16 * scale, 0.05, [0.95, 0.95, 0.92]);
              addPart('box', 'straw', px + 0.48 * scale, py + 1.84 * scale, pz - 0.01, 0.90 * scale, 0.16 * scale, 0.05, [0.10, 0.20, 0.55]);
            } else if (iberian) {
              addPart('box', 'straw', px + 0.48 * scale, py + 2.0 * scale, pz - 0.01, 0.18 * scale, 0.48 * scale, 0.05, [0.95, 0.88, 0.62]);
            }
          };
          const crenellate = (frontZ: number, backZ: number, topY: number, step = 1.7) => {
            for (let bx = -w / 2 + 0.9; bx <= w / 2 - 0.9; bx += step) {
              addPart('box', mat, bx, topY, frontZ, 0.55, 0.75, 0.45, capColor);
              addPart('box', mat, bx, topY, backZ, 0.55, 0.75, 0.45, capColor);
            }
          };
          const addFrontBatteryWall = (
            z: number,
            y: number,
            wallW: number,
            wallH: number,
            wallD: number,
            color: [number, number, number],
            batteryMat: Part['mat'] = mat,
          ) => {
            addPart('box', batteryMat, 0, y, z, wallW, wallH, wallD, color);
            for (const sx of [-1, 1]) {
              const gx = sx * Math.min(2.4, w * 0.24);
              addPart('box', 'dark', gx, y + wallH * 0.10, z + wallD * 0.52, 0.72, wallH * 0.28, 0.12, [0.06, 0.05, 0.04]);
              addPart('box', batteryMat, gx, y + wallH * 0.33, z + wallD * 0.56, 0.98, 0.14, 0.14, varyColor(color, rng, 0.035));
            }
          };
          const addWallCourses = (
            wallW: number,
            wallD: number,
            wallH: number,
            faceZ: number,
            courseMat: Part['mat'],
            color: [number, number, number],
            step = 0.72,
          ) => {
            for (let cy = step; cy < wallH - 0.18; cy += step) {
              addPart('box', courseMat, 0, cy, faceZ, wallW * 0.94, 0.045, 0.065, color);
              if (cy < wallH * 0.82) {
                addPart('box', courseMat, -wallW * 0.50, cy, 0, 0.065, 0.045, wallD * 0.70, color);
                addPart('box', courseMat, wallW * 0.50, cy, 0, 0.065, 0.045, wallD * 0.70, color);
              }
            }
          };
          const addSideSlits = (
            sideX: number,
            y: number,
            zSpan: number,
            count: number,
            color: [number, number, number] = [0.06, 0.05, 0.04],
          ) => {
            for (let i = 0; i < count; i++) {
              const z = -zSpan * 0.34 + (count === 1 ? 0 : (i / (count - 1)) * zSpan * 0.68);
              addPart('box', 'dark', sideX, y, z, 0.08, 0.30, 0.42, color);
            }
          };
          const addGatehouseCap = (
            y: number,
            z: number,
            color: [number, number, number],
            capMat: Part['mat'] = mat,
          ) => {
            addPart('box', capMat, 0, y, z, 2.9, 0.34, 0.72, color);
            addPart('box', capMat, -1.15, y + 0.34, z, 0.42, 0.46, 0.62, color);
            addPart('box', capMat, 1.15, y + 0.34, z, 0.42, 0.46, 0.62, color);
          };
          const addPowderStore = (lx: number, lz: number, storeMat: Part['mat'], color: [number, number, number]) => {
            addPart('box', storeMat, lx, 0.42, lz, 1.05, 0.84, 0.78, color);
            addPart('gableRoof', 'tileRoof', lx, 1.02, lz, 0.78, 0.44, 0.62, varyColor([0.52, 0.28, 0.20], rng, 0.05));
            addPart('box', 'dark', lx, 0.40, lz + 0.41, 0.36, 0.52, 0.07);
          };
          const addBarracksBlock = (lx: number, lz: number, storeMat: Part['mat'], color: [number, number, number], roof: Part['mat'] = 'tileRoof') => {
            addPart('box', storeMat, lx, 0.58, lz, 1.75, 1.16, 0.88, color);
            addPart('gableRoof', roof, lx, 1.36, lz, 1.25, 0.52, 0.76, varyColor(roof === 'woodRoof' ? [0.36, 0.24, 0.16] : [0.58, 0.32, 0.22], rng, 0.055));
            addPart('box', 'dark', lx - 0.44, 0.62, lz + 0.47, 0.28, 0.42, 0.06);
            addPart('box', 'litWindow', lx + 0.38, 0.82, lz + 0.47, 0.22, 0.22, 0.06);
          };
          const addParapetLadder = (lx: number, lz: number, height: number, ladderMat: Part['mat'] = 'wood') => {
            const wood = varyColor([0.30, 0.20, 0.12], rng, 0.045);
            addPart('box', ladderMat, lx - 0.16, height * 0.48, lz, 0.055, height * 0.96, 0.055, wood, false, 0.16);
            addPart('box', ladderMat, lx + 0.16, height * 0.48, lz, 0.055, height * 0.96, 0.055, wood, false, 0.16);
            for (let ry = 0.45; ry < height - 0.18; ry += 0.42) {
              addPart('box', ladderMat, lx, ry, lz, 0.45, 0.045, 0.05, wood, false, 0.16);
            }
          };
          const addFortYard = () => {
            const yard = noEuropeanFort
              ? varyColor([0.44, 0.34, 0.22], rng, 0.04)
              : varyColor(gulf || southAsian ? [0.66, 0.52, 0.36] : [0.62, 0.58, 0.50], rng, 0.04);
            addGroundSkirt(w * 1.22, d * 1.12, yard, noEuropeanFort ? 'mud' : mat, 0.14);
            addPart('box', noEuropeanFort ? 'mud' : 'stone', 0, 0.03, 0, w * 0.58, 0.08, d * 0.42, yard, true);
            addCrateStack(-w * 0.28, -d * 0.18, 0.72);
            addRopeCoil(w * 0.24, -d * 0.18, 0.28);
            if (!noEuropeanFort && rng() < 0.78) {
              addPowderStore(w * 0.26, d * 0.03, mat === 'wood' ? 'wood' : 'stone', varyColor(baseColor, rng, 0.045));
            }
            if (!noEuropeanFort && rng() < 0.70) {
              addBarracksBlock(-w * 0.18, -d * 0.18, mat === 'wood' ? 'wood' : 'stone', varyColor(baseColor, rng, 0.04), mat === 'wood' ? 'woodRoof' : 'tileRoof');
            }
          };
          const addFortGuns = (gunY: number, frontZ: number) => {
            for (const sx of [-1, 1]) {
              const gx = sx * Math.min(2.4, w * 0.24);
              addPart('box', 'dark', gx, gunY, frontZ + 0.28, 0.34, 0.24, 1.05, [0.08, 0.07, 0.06]);
              addPart('box', 'stone', gx, gunY - 0.10, frontZ - 0.12, 0.60, 0.20, 0.36, [0.22, 0.20, 0.18]);
              addPart('cylinder', 'wood', gx - 0.24, gunY - 0.24, frontZ - 0.12, 0.09, 0.12, 0.09, [0.18, 0.13, 0.08]);
              addPart('cylinder', 'wood', gx + 0.24, gunY - 0.24, frontZ - 0.12, 0.09, 0.12, 0.09, [0.18, 0.13, 0.08]);
            }
          };
          const addGun = (gx: number, gy: number, gz: number, rot = 0) => {
            addPart('box', 'dark', gx, gy, gz, 0.28, 0.22, 0.92, [0.08, 0.07, 0.06], false, rot);
            addPart('box', 'stone', gx, gy - 0.12, gz - 0.22, 0.52, 0.18, 0.34, [0.22, 0.20, 0.18], false, rot);
          };
          const customEastIndiesFort =
            port.id === 'manila' ||
            port.id === 'macau' ||
            port.id === 'malacca' ||
            port.id === 'bantam';
          addFortYard();

          if (noEuropeanFort) {
            addPart('box', 'wood', 0, 1.0, 0, w * 0.95, 2.0, d * 0.80, wallColor);
            addPart('box', 'wood', 0, 2.4, 0, w * 0.75, 0.45, d * 0.58, varyColor([0.56, 0.42, 0.24], rng, 0.05));
            for (const sx of [-1, 1]) {
              addPart('cylinder', 'wood', sx * w * 0.42, 2.2, d * 0.32, 0.18, 4.4, 0.18, wallColor);
              addPart('cone', 'straw', sx * w * 0.42, 4.8, d * 0.32, 0.85, 1.0, 0.85, [0.72, 0.60, 0.36]);
            }
            addPart('box', 'wood', 0, 0.78, d * 0.48, w * 0.72, 0.36, 0.34, varyColor([0.34, 0.24, 0.14], rng, 0.05));
            addPart('box', 'dark', 0, 0.9, d * 0.41, 2.2, 1.4, 0.12);
            addWorkRack(-w * 0.22, d * 0.30, 1.1);
            addBarracksBlock(w * 0.20, -d * 0.18, 'wood', varyColor([0.48, 0.36, 0.22], rng, 0.05), 'woodRoof');
            addParapetLadder(-w * 0.30, d * 0.18, 2.7);
            drawFlag(0, 3.5, d * 0.32, 0.75, true);
          } else if (port.id === 'manila') {
            // Manila — early Intramuros-style Spanish fortification: low
            // curtain walls, corner bastions, tile-roofed gatehouse, and
            // harbor-facing batteries rather than medieval round towers.
            const adobe = varyColor([0.76, 0.68, 0.52], rng, 0.045);
            const coping = varyColor([0.88, 0.82, 0.66], rng, 0.035);
            const tile: [number, number, number] = [0.58, 0.30, 0.22];
            addPart('box', 'stone', 0, h * 0.28, 0, w * 1.10, h * 0.56, d * 0.96, adobe);
            addPart('box', 'stone', 0, h * 0.62, 0, w * 1.16, 0.34, d * 1.02, coping);
            addPart('box', 'stone', 0, h * 0.72, d * 0.48, w * 0.92, 0.46, 0.45, coping);
            addPart('box', 'dark', 0, h * 0.28, d * 0.51, 1.7, h * 0.42, 0.12);
            addPart('box', 'stone', 0, h * 0.56, d * 0.56, 2.7, 0.26, 0.46, coping);
            addPart('gableRoof', 'tileRoof', 0, h * 0.92, d * 0.43, 1.9, 0.55, 0.82, tile);
            for (const [cx, cz] of [[w * 0.49, d * 0.43], [-w * 0.49, d * 0.43], [w * 0.49, -d * 0.43], [-w * 0.49, -d * 0.43]] as [number, number][]) {
              addPart('box', 'stone', cx, h * 0.34, cz, 2.4, h * 0.68, 2.0, adobe);
              addPart('box', 'stone', cx, h * 0.72, cz, 2.75, 0.34, 2.35, coping);
            }
            addWallCourses(w * 1.10, d * 0.96, h * 0.56, d * 0.485, 'stone', varyColor([0.56, 0.50, 0.40], rng, 0.035), 0.58);
            for (const gx of [-2.4, 0, 2.4]) addGun(gx, h * 0.78, d * 0.62);
            addBarracksBlock(-w * 0.20, -d * 0.14, 'stone', varyColor([0.72, 0.62, 0.48], rng, 0.04));
            drawFlag(w * 0.48, h * 0.76, d * 0.43, 0.78);
            addTorch(-1.55, h * 0.48, d * 0.58);
            addTorch(1.55, h * 0.48, d * 0.58);
          } else if (port.id === 'macau' || port.id === 'malacca') {
            // Macau / Malacca — Portuguese Asian coastal battery. Whitewashed
            // masonry sits low and broad, with a small tiled guardhouse and a
            // water-facing gun platform instead of castle towers.
            const lime = varyColor([0.88, 0.84, 0.70], rng, 0.04);
            const shadow = varyColor([0.62, 0.56, 0.44], rng, 0.035);
            const tile: [number, number, number] = [0.58, 0.30, 0.20];
            addPart('box', 'white', 0, h * 0.24, 0, w * 1.18, h * 0.48, d * 0.82, lime);
            addPart('box', 'stone', 0, h * 0.54, d * 0.28, w * 1.16, 0.46, d * 0.42, shadow);
            addPart('box', 'white', 0, h * 0.78, d * 0.44, w * 0.96, 0.50, 0.54, lime);
            addPart('box', 'dark', 0, h * 0.30, d * 0.46, 1.8, h * 0.42, 0.12);
            addGatehouseCap(h * 0.56, d * 0.48, lime, 'white');
            for (const sx of [-1, 1] as const) {
              addPart('box', 'white', sx * w * 0.46, h * 0.36, d * 0.34, 1.85, h * 0.72, 1.65, lime);
              addPart('box', 'stone', sx * w * 0.46, h * 0.76, d * 0.34, 2.25, 0.32, 2.0, shadow);
              addPart('box', 'white', sx * w * 0.42, h * 0.32, -d * 0.34, 1.55, h * 0.62, 1.45, lime);
            }
            addPart('box', 'white', -w * 0.18, h * 0.40, -d * 0.18, 2.1, h * 0.80, 1.35, lime);
            addPart('gableRoof', 'tileRoof', -w * 0.18, h * 0.92, -d * 0.18, 1.45, 0.58, 1.00, tile);
            addPart('box', 'dark', -w * 0.18, h * 0.35, d * 0.02, 0.60, 0.78, 0.08);
            for (const gx of [-2.8, -0.9, 0.9, 2.8]) addGun(gx, h * 0.80, d * 0.62);
            addWallCourses(w * 1.18, d * 0.82, h * 0.48, d * 0.415, 'white', varyColor([0.66, 0.61, 0.50], rng, 0.03), 0.55);
            drawFlag(w * 0.46, h * 0.78, d * 0.34, 0.82);
            addTorch(-1.4, h * 0.48, d * 0.52);
            addTorch(1.4, h * 0.48, d * 0.52);
          } else if (port.id === 'bantam') {
            // Bantam — fortified port stockade / court compound. Timber and
            // packed-earth walls, a tiered gate roof, corner watch platforms,
            // and a clear yard plan read better from above than the old block.
            const earth = varyColor([0.54, 0.38, 0.24], rng, 0.045);
            const timber = varyColor([0.30, 0.20, 0.12], rng, 0.045);
            const darkThatch: [number, number, number] = [0.30, 0.24, 0.16];
            addPart('box', 'mud', 0, h * 0.26, 0, w * 1.12, h * 0.52, d * 0.92, earth);
            addPart('box', 'wood', 0, h * 0.58, d * 0.42, w * 0.92, 0.38, 0.32, timber);
            addPart('box', 'wood', 0, h * 0.32, d * 0.48, 2.3, h * 0.50, 0.16, [0.12, 0.08, 0.05]);
            addPart('box', 'wood', 0, h * 0.76, d * 0.43, 2.8, 0.46, 1.0, timber);
            addPart('cone', 'thatchRoof', 0, h * 1.06, d * 0.43, 1.85, 0.70, 0.85, darkThatch);
            addPart('cone', 'thatchRoof', 0, h * 1.46, d * 0.43, 1.25, 0.58, 0.58, darkThatch);
            for (const [cx, cz] of [[w * 0.45, d * 0.38], [-w * 0.45, d * 0.38], [w * 0.45, -d * 0.38], [-w * 0.45, -d * 0.38]] as [number, number][]) {
              addPart('box', 'wood', cx, h * 0.50, cz, 1.55, h, 1.55, timber);
              addPart('cone', 'thatchRoof', cx, h * 1.12, cz, 1.20, 0.82, 1.20, darkThatch);
            }
            addPart('box', 'wood', -w * 0.18, h * 0.38, -d * 0.18, 2.5, h * 0.76, 1.35, timber);
            addPart('cone', 'thatchRoof', -w * 0.18, h * 0.92, -d * 0.18, 1.65, 0.78, 1.05, darkThatch);
            addWorkRack(w * 0.22, -d * 0.12, 1.2);
            addParapetLadder(w * 0.26, d * 0.16, h * 0.70, 'wood');
            drawFlag(w * 0.45, h * 1.02, d * 0.38, 0.78);
            addTorch(-1.4, h * 0.42, d * 0.54);
            addTorch(1.4, h * 0.42, d * 0.54);
          } else if (port.buildingStyle === 'swahili-coral') {
            const coral = varyColor([0.78, 0.73, 0.62], rng, 0.055);
            const lime = varyColor([0.88, 0.84, 0.74], rng, 0.035);
            addPart('box', 'stone', 0, h * 0.34, 0, w * 1.02, h * 0.68, d * 0.92, coral);
            addPart('box', 'white', 0, h * 0.72, 0, w * 1.08, 0.42, d * 0.98, lime);
            addFrontBatteryWall(d * 0.49, h * 0.70, w * 0.86, 0.58, 0.42, lime, 'white');
            addWallCourses(w * 1.02, d * 0.92, h * 0.68, d * 0.465, 'white', varyColor([0.68, 0.64, 0.54], rng, 0.035), 0.62);
            addSideSlits(-w * 0.52, h * 0.55, d * 0.72, 3);
            addSideSlits(w * 0.52, h * 0.55, d * 0.72, 3);
            for (const [cx, cz] of [[w * 0.43, d * 0.38], [-w * 0.43, d * 0.38], [w * 0.43, -d * 0.38], [-w * 0.43, -d * 0.38]] as [number, number][]) {
              addPart('box', 'stone', cx, h * 0.48, cz, 1.65, h * 0.92, 1.65, coral);
              addPart('box', 'white', cx, h * 0.98, cz, 1.95, 0.38, 1.95, lime);
            }
            addPart('box', 'dark', 0, h * 0.30, d * 0.47, 1.8, h * 0.46, 0.12);
            addGatehouseCap(h * 0.56, d * 0.50, lime, 'white');
            addParapetLadder(-w * 0.32, d * 0.20, h * 0.78);
            crenellate(d * 0.46, -d * 0.46, h * 0.88, 1.55);
            drawFlag(w * 0.43, h * 0.9, d * 0.38, 0.85);
          } else if (portugueseWestAfrican) {
            const lime = varyColor([0.88, 0.84, 0.72], rng, 0.045);
            const damp = varyColor([0.42, 0.46, 0.38], rng, 0.04);
            addPart('box', 'stone', 0, h * 0.30, 0, w * 1.12, h * 0.60, d * 0.92, lime);
            addPart('box', 'stone', 0, h * 0.68, -d * 0.08, w * 0.74, h * 0.58, d * 0.62, lime);
            addPart('box', 'stone', 0, h * 0.08, d * 0.02, w * 1.16, 0.18, d * 0.96, damp);
            addPart('box', 'dark', 0, h * 0.28, d * 0.47, 2.0, h * 0.42, 0.12);
            addFrontBatteryWall(d * 0.52, h * 0.78, w * 0.90, 0.62, 0.42, capColor, 'stone');
            addGatehouseCap(h * 0.54, d * 0.51, capColor, 'stone');
            addWallCourses(w * 1.12, d * 0.92, h * 0.60, d * 0.465, 'stone', varyColor([0.64, 0.60, 0.50], rng, 0.035), 0.58);
            addSideSlits(-w * 0.57, h * 0.48, d * 0.70, 3);
            addSideSlits(w * 0.57, h * 0.48, d * 0.70, 3);
            for (const [cx, cz] of [[w * 0.50, d * 0.38], [-w * 0.50, d * 0.38], [w * 0.50, -d * 0.38], [-w * 0.50, -d * 0.38]] as [number, number][]) {
              addPart('box', 'stone', cx, h * 0.42, cz, 1.85, h * 0.82, 1.85, lime);
              addPart('box', 'stone', cx, h * 0.86, cz, 2.25, 0.34, 2.25, capColor);
            }
            addPart('box', 'stone', 0, h * 0.80, d * 0.48, w * 0.9, 0.38, 0.50, capColor);
            for (const sx of [-1.2, 1.2]) {
              addPart('box', 'dark', sx, h * 0.82, d * 0.58, 0.85, 0.16, 0.22, [0.08, 0.07, 0.06]);
            }
            addParapetLadder(-w * 0.34, d * 0.18, h * 0.86);
            drawFlag(w * 0.50, h * 0.9, d * 0.38, 0.85);
          } else if (region === 'Malay') {
            addPart('box', 'wood', 0, h * 0.42, 0, w * 0.88, h * 0.84, d * 0.78, wallColor);
            addPart('cone', 'wood', 0, h + 0.9, 0, w * 0.52, 1.6, d * 0.46, varyColor([0.40, 0.25, 0.15], rng, 0.04));
            for (const sx of [-1, 1]) {
              addPart('box', 'wood', sx * w * 0.38, h * 0.55, d * 0.35, 1.2, h * 1.1, 1.2, wallColor);
              addPart('cone', 'wood', sx * w * 0.38, h * 1.15, d * 0.35, 1.0, 1.1, 1.0, [0.33, 0.21, 0.14]);
            }
            addPart('box', 'wood', 0, h * 0.70, d * 0.43, w * 0.70, 0.46, 0.34, varyColor([0.34, 0.22, 0.14], rng, 0.05));
            addPart('box', 'dark', 0, h * 0.35, d * 0.40, 2.0, h * 0.55, 0.12);
            addGatehouseCap(h * 0.66, d * 0.43, varyColor([0.34, 0.22, 0.14], rng, 0.04), 'wood');
            addBarracksBlock(-w * 0.22, -d * 0.16, 'wood', varyColor([0.42, 0.30, 0.20], rng, 0.05), 'woodRoof');
            addParapetLadder(w * 0.26, d * 0.12, h * 0.76);
            drawFlag(w * 0.38, h * 1.05, d * 0.35);
          } else if (gulf || southAsian) {
            addPart('box', mat, 0, h * 0.45, 0, w, h * 0.9, d, wallColor);
            addPart('box', mat, 0, h + 0.28, 0, w * 0.92, 0.55, d * 0.92, capColor);
            addFrontBatteryWall(d/2 + 0.04, h * 0.68, w * 0.78, 0.62, 0.34, capColor);
            addWallCourses(w, d, h * 0.9, d/2 + 0.02, mat, varyColor([0.48, 0.36, 0.24], rng, 0.045), southAsian ? 0.66 : 0.78);
            addSideSlits(-w * 0.505, h * 0.58, d * 0.74, gulf ? 2 : 3);
            addSideSlits(w * 0.505, h * 0.58, d * 0.74, gulf ? 2 : 3);
            const towerR = gulf ? 1.15 : 1.0;
            for (const [cx, cz] of [[w/2, d/2], [-w/2, d/2], [w/2, -d/2], [-w/2, -d/2]] as [number, number][]) {
              addPart(gulf ? 'cylinder' : 'box', mat, cx, h * 0.55, cz, towerR, h * 1.1, towerR, wallColor);
              addPart('box', mat, cx, h * 1.15, cz, towerR * 1.35, 0.45, towerR * 1.35, capColor);
              if (southAsian && cz > 0) addPart('dome', mat, cx, h * 1.42, cz, towerR * 0.7, 0.45, towerR * 0.7, varyColor(capColor, rng, 0.035));
            }
            addPart('box', 'dark', 0, h * 0.34, d/2 + 0.05, 2.2, h * 0.56, 0.14);
            if (southAsian) addPart('cone', mat, 0, h * 0.78, d/2 + 0.05, 1.35, 1.05, 0.18, capColor);
            addGatehouseCap(h * 0.66, d/2 + 0.08, capColor);
            addParapetLadder(-w * 0.30, d * 0.14, h * 0.84);
            crenellate(d/2, -d/2, h + 0.65);
            drawFlag(w/2, h + 0.6, d/2);
          } else if (northern) {
            addPart('box', 'mud', 0, h * 0.28, 0, w * 1.08, h * 0.56, d * 1.02, varyColor([0.38, 0.28, 0.20], rng, 0.05));
            addPart('box', mat, 0, h * 0.65, 0, w * 0.74, h * 0.72, d * 0.70, wallColor);
            addFrontBatteryWall(d * 0.43, h * 0.56, w * 0.78, 0.52, 0.34, varyColor([0.44, 0.32, 0.24], rng, 0.045), 'mud');
            addWallCourses(w * 0.74, d * 0.70, h * 0.72, d * 0.35, mat, varyColor([0.28, 0.18, 0.14], rng, 0.035), 0.54);
            addSideSlits(-w * 0.38, h * 0.66, d * 0.50, 2);
            addSideSlits(w * 0.38, h * 0.66, d * 0.50, 2);
            for (const [cx, cz] of [[w*0.48, d*0.46], [-w*0.48, d*0.46], [w*0.48, -d*0.46], [-w*0.48, -d*0.46]] as [number, number][]) {
              addPart('box', 'mud', cx, h * 0.42, cz, 2.1, h * 0.82, 2.1, varyColor([0.42, 0.30, 0.20], rng, 0.05));
            }
            addPart('cone', 'wood', 0, h + 0.85, 0, w * 0.36, 1.15, d * 0.32, [0.30, 0.22, 0.17]);
            addPart('box', 'dark', 0, h * 0.40, d * 0.36, 2.0, h * 0.44, 0.14);
            addGatehouseCap(h * 0.64, d * 0.37, varyColor([0.38, 0.26, 0.18], rng, 0.045), 'mud');
            addParapetLadder(w * 0.22, d * 0.10, h * 0.70);
            drawFlag(0, h + 0.9, 0);
          } else {
            addPart('box', mat, 0, h/2, 0, w, h, d, wallColor);
            const towerColor = varyColor(wallColor, rng, 0.04);
            addFrontBatteryWall(d/2 + 0.04, h * 0.68, w * 0.80, 0.62, 0.34, capColor);
            addWallCourses(w, d, h, d/2 + 0.02, mat, varyColor([0.56, 0.52, 0.44], rng, 0.04), 0.70);
            addSideSlits(-w * 0.505, h * 0.60, d * 0.76, 3);
            addSideSlits(w * 0.505, h * 0.60, d * 0.76, 3);
            for (const [cx, cz] of [[w/2, d/2], [-w/2, d/2], [w/2, -d/2], [-w/2, -d/2]] as [number, number][]) {
              addPart('cylinder', mat, cx, h/2 + 1, cz, 1.5, h + 2, 1.5, towerColor);
              addPart('cone', 'stone', cx, h + 2.2, cz, 1.35, 0.8, 1.35, capColor);
            }
            addPart('box', 'dark', 0, h * 0.35, d/2 + 0.05, 2.5, h * 0.6, 0.15);
            addGatehouseCap(h * 0.70, d/2 + 0.07, capColor);
            addParapetLadder(-w * 0.30, d * 0.16, h * 0.82);
            crenellate(d/2, -d/2, h + 0.5, 2);
            drawFlag(w/2, h + 1.7, d/2);
            drawFlag(-w/2, h + 1.7, d/2);
          }

          if (!noEuropeanFort && !portugueseWestAfrican && !customEastIndiesFort) {
            addFortGuns(h * 0.64, d/2 + 0.54);
            addTorch(2.2, h * 0.58, d/2 + 0.3);
            addTorch(-2.2, h * 0.58, d/2 + 0.3);
          } else if (portugueseWestAfrican) {
            addFortGuns(h * 0.82, d * 0.55);
            addTorch(2.1, h * 0.55, d/2 + 0.3);
            addTorch(-2.1, h * 0.55, d/2 + 0.3);
          }

}
