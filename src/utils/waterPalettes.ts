import { useGameStore } from '../store/gameStore';
import { CORE_PORTS } from './portArchetypes';
import { resolveCampaignPortId } from './worldPorts';

export type WaterPaletteId = 'tropical' | 'mediterranean' | 'temperate';
export type WaterPaletteSetting = 'auto' | WaterPaletteId;
export type WaterColor = [number, number, number];

type ClimateLike = 'tropical' | 'arid' | 'temperate' | 'monsoon';

export interface WaterPalette {
  id: WaterPaletteId;
  label: string;
  description: string;
  terrain: {
    deep: WaterColor;
    shallow: WaterColor;
    surf: WaterColor;
  };
  oceanOverlay: {
    base: WaterColor;
    outerShallow: WaterColor;
    paleSurf: WaterColor;
  };
  surface: {
    day: WaterColor;
    dusk: WaterColor;
    night: WaterColor;
    fallbackHex: number;
  };
  map: {
    deep: WaterColor;
    shallow: WaterColor;
  };
}

type WaterPaletteStateLike = {
  worldSeed: number;
  devSoloPort: string | null;
  currentWorldPortId: string | null;
  waterPaletteSetting: WaterPaletteSetting;
};

export const WATER_PALETTES: Record<WaterPaletteId, WaterPalette> = {
  tropical: {
    id: 'tropical',
    label: 'Tropical',
    description: 'Electric cyan-turquoise water with bright lagoon shallows.',
    terrain: {
      deep: [0.0, 0.52, 0.68],
      shallow: [0.18, 0.78, 0.82],
      surf: [0.72, 0.96, 0.95],
    },
    oceanOverlay: {
      base: [0.12, 0.82, 0.85],
      outerShallow: [0.06, 0.68, 0.78],
      paleSurf: [0.65, 0.96, 0.96],
    },
    surface: {
      day: [0.0, 0.58, 0.82],
      dusk: [0.02, 0.38, 0.56],
      night: [0.01, 0.04, 0.09],
      fallbackHex: 0x0094d1,
    },
    map: {
      deep: [0.0, 0.48, 0.68],
      shallow: [0.15, 0.72, 0.82],
    },
  },
  mediterranean: {
    id: 'mediterranean',
    label: 'Mediterranean',
    description: 'Cleaner mid-blue water between tropical and temperate.',
    terrain: {
      deep: [0.09, 0.24, 0.36],
      shallow: [0.28, 0.56, 0.60],
      surf: [0.82, 0.84, 0.74],
    },
    oceanOverlay: {
      base: [0.42, 0.78, 0.76],
      outerShallow: [0.22, 0.56, 0.60],
      paleSurf: [0.78, 0.88, 0.82],
    },
    surface: {
      day: [0.02, 0.20, 0.52],
      dusk: [0.01, 0.13, 0.38],
      night: [0.00, 0.01, 0.07],
      fallbackHex: 0x08388a,
    },
    map: {
      deep: [0.10, 0.26, 0.44],
      shallow: [0.16, 0.35, 0.56],
    },
  },
  temperate: {
    id: 'temperate',
    label: 'Temperate',
    description: 'Richer deeper blue close to the previous default.',
    terrain: {
      deep: [0.07, 0.17, 0.28],
      shallow: [0.20, 0.46, 0.44],
      surf: [0.78, 0.80, 0.68],
    },
    oceanOverlay: {
      base: [0.34, 0.72, 0.67],
      outerShallow: [0.16, 0.47, 0.53],
      paleSurf: [0.72, 0.84, 0.72],
    },
    surface: {
      day: [0.00, 0.12, 0.44],
      dusk: [0.00, 0.09, 0.33],
      night: [0.00, 0.01, 0.06],
      fallbackHex: 0x001e6f,
    },
    map: {
      deep: [0.08, 0.22, 0.40],
      shallow: [0.12, 0.28, 0.48],
    },
  },
};

export function getWaterPalette(id: WaterPaletteId): WaterPalette {
  return WATER_PALETTES[id];
}

export function getDefaultWaterPaletteForClimate(climate: ClimateLike): WaterPaletteId {
  switch (climate) {
    case 'tropical':
    case 'monsoon':
    case 'arid':
      return 'tropical';
    case 'temperate':
      return 'temperate';
  }
}

function getPaletteForPortId(portId: string | null): WaterPaletteId | null {
  if (!portId) return null;
  const portDef = CORE_PORTS.find((port) => port.id === portId);
  return portDef ? getDefaultWaterPaletteForClimate(portDef.climate) : null;
}

function getSeededDefaultPortId(seed: number): string | null {
  if (CORE_PORTS.length === 0) return null;
  const index = Math.abs(seed) % CORE_PORTS.length;
  return CORE_PORTS[index]?.id ?? null;
}

export function resolveWaterPaletteId(state: WaterPaletteStateLike): WaterPaletteId {
  if (state.waterPaletteSetting !== 'auto') {
    return state.waterPaletteSetting;
  }

  const activePortId = resolveCampaignPortId(state) ?? getSeededDefaultPortId(state.worldSeed);
  return getPaletteForPortId(activePortId) ?? 'tropical';
}

export function getResolvedWaterPaletteId(): WaterPaletteId {
  return resolveWaterPaletteId(useGameStore.getState());
}

export function getResolvedWaterPalette(): WaterPalette {
  return getWaterPalette(getResolvedWaterPaletteId());
}
