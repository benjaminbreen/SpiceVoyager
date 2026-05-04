import { PORT_CULTURAL_REGION } from '../../store/gameStore';
import type { Building, CulturalRegion, Port } from '../../store/gameStore';
import type { Faith } from '../../utils/portReligions';
import type { Part } from './cityTypes';
import { varyColor } from './cityRandom';
import type { CityPartBuilder } from './cityPartBuilder';

type Rgb = [number, number, number];

interface ReligiousPrecinctArgs {
  builder: CityPartBuilder;
  building: Building;
  port: Port;
  rng: () => number;
}

interface PrecinctPalette {
  groundMat: Part['mat'];
  ground: Rgb;
  wallMat: Part['mat'];
  wall: Rgb;
  accent: Rgb;
  wood: Rgb;
  green: Rgb;
}

function isAridRegion(region?: CulturalRegion, style?: string): boolean {
  return region === 'Arab' || style === 'arab-cubic' || style === 'persian-gulf';
}

function isTropicalStyle(style?: string): boolean {
  return style === 'luso-colonial' || style === 'malabar-hindu' || style === 'malay-stilted' ||
    style === 'swahili-coral' || style === 'luso-brazilian' || style === 'spanish-caribbean';
}

function paletteFor(port: Port, faith: Faith | string): PrecinctPalette {
  const region = PORT_CULTURAL_REGION[port.id];
  const style = port.buildingStyle;

  if (region === 'Swahili' || style === 'swahili-coral') {
    return {
      groundMat: 'stone',
      ground: [0.82, 0.76, 0.64],
      wallMat: 'stone',
      wall: [0.86, 0.82, 0.72],
      accent: [0.68, 0.78, 0.76],
      wood: [0.30, 0.20, 0.14],
      green: [0.28, 0.42, 0.24],
    };
  }

  if (isAridRegion(region, style) || faith === 'ibadi' || faith === 'shia') {
    return {
      groundMat: 'mud',
      ground: [0.72, 0.62, 0.46],
      wallMat: 'white',
      wall: [0.90, 0.86, 0.74],
      accent: faith === 'shia' ? [0.54, 0.68, 0.78] : [0.78, 0.72, 0.58],
      wood: [0.34, 0.24, 0.16],
      green: [0.32, 0.42, 0.22],
    };
  }

  if (region === 'Malabari' || region === 'Gujarati' || style === 'malabar-hindu' || style === 'mughal-gujarati') {
    return {
      groundMat: 'stone',
      ground: [0.68, 0.48, 0.32],
      wallMat: 'mud',
      wall: [0.74, 0.52, 0.36],
      accent: [0.78, 0.60, 0.28],
      wood: [0.34, 0.20, 0.12],
      green: [0.24, 0.44, 0.28],
    };
  }

  if (region === 'Malay' || region === 'Chinese' || style === 'malay-stilted') {
    return {
      groundMat: 'wood',
      ground: [0.46, 0.34, 0.22],
      wallMat: 'wood',
      wall: [0.38, 0.24, 0.16],
      accent: [0.70, 0.20, 0.16],
      wood: [0.32, 0.20, 0.12],
      green: [0.26, 0.46, 0.30],
    };
  }

  if (port.culture === 'European') {
    return {
      groundMat: 'stone',
      ground: [0.62, 0.58, 0.52],
      wallMat: 'stone',
      wall: [0.70, 0.68, 0.62],
      accent: [0.76, 0.66, 0.46],
      wood: [0.24, 0.16, 0.10],
      green: [0.22, 0.34, 0.20],
    };
  }

  return {
    groundMat: 'stone',
    ground: [0.78, 0.70, 0.56],
    wallMat: 'white',
    wall: [0.88, 0.84, 0.74],
    accent: [0.72, 0.60, 0.36],
    wood: [0.34, 0.22, 0.14],
    green: [0.28, 0.44, 0.24],
  };
}

function addGround(builder: CityPartBuilder, w: number, d: number, palette: PrecinctPalette, rng: () => number) {
  builder.addPart('box', palette.groundMat, 0, -0.88, 0, w, 1.85, d, varyColor(palette.ground, rng, 0.035), true);
}

function addLowWall(
  builder: CityPartBuilder,
  w: number,
  d: number,
  palette: PrecinctPalette,
  rng: () => number,
  options: { openFront?: boolean; rightWallMode?: 'full' | 'rear-half' } = {},
) {
  const openFront = options.openFront ?? true;
  const rightWallMode = options.rightWallMode ?? 'full';
  const h = 0.75;
  const t = 0.25;
  const wall = varyColor(palette.wall, rng, 0.035);
  const frontHalf = openFront ? (w - 2.6) / 4 : w / 2;
  if (openFront) {
    builder.addPart('box', palette.wallMat, -w / 2 + frontHalf / 2, h / 2, d / 2, frontHalf, h, t, wall);
    builder.addPart('box', palette.wallMat,  w / 2 - frontHalf / 2, h / 2, d / 2, frontHalf, h, t, wall);
    builder.addPart('box', palette.wallMat, -1.45, 0.65, d / 2 + 0.05, 0.35, 1.3, 0.35, wall);
    builder.addPart('box', palette.wallMat,  1.45, 0.65, d / 2 + 0.05, 0.35, 1.3, 0.35, wall);
  } else {
    builder.addPart('box', palette.wallMat, 0, h / 2, d / 2, w, h, t, wall);
  }
  builder.addPart('box', palette.wallMat, 0, h / 2, -d / 2, w, h, t, wall);
  if (rightWallMode === 'rear-half') {
    builder.addPart('box', palette.wallMat, w / 2, h / 2, -d / 4, t, h, d / 2, wall);
  } else {
    builder.addPart('box', palette.wallMat, w / 2, h / 2, 0, t, h, d, wall);
  }
  builder.addPart('box', palette.wallMat, -w / 2, h / 2, 0, t, h, d, wall);
}

function addApproach(builder: CityPartBuilder, palette: PrecinctPalette, rng: () => number) {
  builder.addPart('box', palette.groundMat, 0, -0.82, 4.55, 1.5, 1.75, 2.0, varyColor(palette.ground, rng, 0.03), true);
}

function addBasin(builder: CityPartBuilder, palette: PrecinctPalette, rng: () => number, x = -2.0, z = 1.6) {
  const stone = varyColor(palette.wall, rng, 0.03);
  builder.addPart('cylinder', palette.wallMat, x, 0.22, z, 0.72, 0.32, 0.72, stone);
  builder.addPart('cylinder', 'stone', x, 0.43, z, 0.48, 0.08, 0.48, varyColor([0.38, 0.62, 0.70], rng, 0.04));
}

function addShadeStrip(builder: CityPartBuilder, palette: PrecinctPalette, rng: () => number, x: number) {
  const wood = varyColor(palette.wood, rng, 0.05);
  const shade = varyColor([0.70, 0.58, 0.36], rng, 0.05);
  for (const z of [-1.9, 0, 1.9]) {
    builder.addPart('cylinder', 'wood', x, 1.0, z, 0.09, 2.0, 0.09, wood);
  }
  builder.addPart('box', 'straw', x, 2.1, 0, 0.25, 0.16, 4.7, shade);
}

function addTree(builder: CityPartBuilder, palette: PrecinctPalette, rng: () => number, x: number, z: number, sparse = false) {
  const trunk = varyColor(palette.wood, rng, 0.06);
  const green = varyColor(palette.green, rng, 0.08);
  const h = sparse ? 2.4 : 3.0;
  builder.addPart('cylinder', 'wood', x, h / 2, z, 0.13, h, 0.13, trunk);
  builder.addPart('sphere', 'straw', x, h + 0.35, z, sparse ? 0.7 : 0.95, sparse ? 0.45 : 0.60, sparse ? 0.7 : 0.95, green);
}

function addGraves(builder: CityPartBuilder, palette: PrecinctPalette, rng: () => number, protestant = false) {
  const stone = varyColor(palette.wall, rng, 0.04);
  const slots: [number, number][] = [[-2.6, -2.6], [-1.5, -2.6], [1.7, -2.7], [2.6, -1.8]];
  for (const [x, z] of slots) {
    if (rng() < 0.18) continue;
    builder.addPart('box', palette.wallMat, x, 0.15, z, 0.45, 0.12, 0.95, stone);
    if (!protestant && rng() < 0.55) {
      builder.addPart('box', palette.wallMat, x, 0.55, z - 0.38, 0.08, 0.65, 0.08, stone);
      builder.addPart('box', palette.wallMat, x, 0.72, z - 0.38, 0.38, 0.08, 0.08, stone);
    }
  }
}

function addLampPair(builder: CityPartBuilder, palette: PrecinctPalette) {
  for (const x of [-1.25, 1.25]) {
    builder.addPart('cylinder', 'wood', x, 0.8, 3.1, 0.08, 1.6, 0.08, palette.wood);
    builder.addPart('sphere', 'straw', x, 1.65, 3.1, 0.16, 0.16, 0.16, palette.accent);
  }
}

function addHinduAccents(builder: CityPartBuilder, palette: PrecinctPalette, rng: () => number) {
  builder.addPart('cylinder', 'wood', 2.6, 1.6, 0.4, 0.10, 3.2, 0.10, varyColor([0.78, 0.62, 0.26], rng, 0.03));
  builder.addPart('cone', 'straw', 2.6, 3.35, 0.4, 0.20, 0.45, 0.20, palette.accent);
  builder.addPart('box', palette.wallMat, -2.7, 0.45, -1.8, 0.9, 0.9, 0.9, varyColor(palette.wall, rng, 0.04));
  addTree(builder, palette, rng, -2.8, 2.3, false);
}

function addEastAsianAccents(builder: CityPartBuilder, palette: PrecinctPalette, rng: () => number, chinese = false) {
  const red: Rgb = chinese ? [0.70, 0.18, 0.14] : palette.accent;
  builder.addPart('cylinder', 'wood', 0, 0.6, 2.25, 0.45, 0.45, 0.45, varyColor([0.45, 0.36, 0.28], rng, 0.04));
  builder.addPart('cylinder', 'stone', 0, 0.95, 2.25, 0.24, 0.28, 0.24, varyColor([0.20, 0.18, 0.16], rng, 0.03));
  for (const x of [-1.9, 1.9]) {
    builder.addPart('cylinder', 'wood', x, 1.2, 3.35, 0.12, 2.4, 0.12, varyColor(red, rng, 0.04));
    builder.addPart('box', 'wood', x, 2.45, 3.35, 0.42, 0.18, 0.42, varyColor(red, rng, 0.04));
  }
  addTree(builder, palette, rng, -2.8, -2.4, false);
}

function addAnimistAccents(builder: CityPartBuilder, palette: PrecinctPalette, rng: () => number) {
  for (const [x, z] of [[-2.2, 0], [2.1, -0.7], [0.4, 2.3]] as [number, number][]) {
    builder.addPart('box', 'stone', x, 0.22, z, 0.55, 0.35, 0.45, varyColor([0.42, 0.38, 0.32], rng, 0.06));
  }
  builder.addPart('cylinder', 'wood', 0, 1.4, 0, 0.16, 2.8, 0.16, varyColor(palette.wood, rng, 0.05));
  addTree(builder, palette, rng, -2.5, -2.2, false);
}

function addSynagogueAccents(builder: CityPartBuilder, palette: PrecinctPalette, rng: () => number) {
  for (const x of [-2.1, 2.1]) {
    builder.addPart('box', 'stone', x, 0.35, -2.4, 1.1, 0.3, 0.35, varyColor(palette.wall, rng, 0.035));
  }
  addBasin(builder, palette, rng, -2.4, 1.5);
  if (rng() < 0.65) addTree(builder, palette, rng, 2.7, -2.2, true);
}

export function addReligiousPrecinct({ builder, building, port, rng }: ReligiousPrecinctArgs) {
  const faith = (building.faith ?? 'catholic') as Faith;
  const palette = paletteFor(port, faith);
  const region = PORT_CULTURAL_REGION[port.id];
  const arid = isAridRegion(region, port.buildingStyle) || faith === 'ibadi' || faith === 'shia';
  const tropical = isTropicalStyle(port.buildingStyle);
  const courtW = Math.min(7.6, building.scale[0] * 0.92);
  const courtD = Math.min(7.6, building.scale[2] * 0.92);

  addGround(builder, courtW, courtD, palette, rng);
  addApproach(builder, palette, rng);

  if (faith === 'animist') {
    addAnimistAccents(builder, palette, rng);
    return;
  }

  if (faith === 'sunni' || faith === 'shia' || faith === 'ibadi') {
    addLowWall(builder, courtW, courtD, palette, rng, { rightWallMode: 'rear-half' });
    addBasin(builder, palette, rng, faith === 'ibadi' ? -2.15 : -2.35, 1.65);
    addShadeStrip(builder, palette, rng, faith === 'ibadi' ? 3.25 : -3.25);
    if (!arid || rng() < 0.55) addTree(builder, palette, rng, 2.6, -2.4, arid);
    if (faith === 'shia') {
      builder.addPart('box', 'stone', 0, 0.04, -3.15, 3.2, 0.08, 0.18, varyColor(palette.accent, rng, 0.03), true);
      builder.addPart('box', 'stone', 3.15, 0.04, 0, 0.18, 0.08, 3.2, varyColor(palette.accent, rng, 0.03), true);
    }
    addLampPair(builder, palette);
    return;
  }

  addLowWall(builder, courtW, courtD, palette, rng);

  if (faith === 'catholic' || faith === 'protestant') {
    addGraves(builder, palette, rng, faith === 'protestant');
    if (faith === 'catholic') {
      builder.addPart('box', palette.wallMat, 0, 0.85, 2.65, 0.10, 1.5, 0.10, varyColor(palette.wall, rng, 0.035));
      builder.addPart('box', palette.wallMat, 0, 1.25, 2.65, 0.75, 0.10, 0.10, varyColor(palette.wall, rng, 0.035));
    }
    if (tropical) {
      addTree(builder, palette, rng, -2.7, 2.2, false);
      addTree(builder, palette, rng, 2.7, -2.3, false);
    } else if (rng() < 0.75) {
      addTree(builder, palette, rng, -2.8, -2.4, true);
    }
    return;
  }

  if (faith === 'hindu') {
    addHinduAccents(builder, palette, rng);
    return;
  }

  if (faith === 'buddhist' || faith === 'chinese-folk') {
    addEastAsianAccents(builder, palette, rng, faith === 'chinese-folk');
    return;
  }

  if (faith === 'jewish') {
    addSynagogueAccents(builder, palette, rng);
  }
}
