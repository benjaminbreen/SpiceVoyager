import { useGameStore } from '../store/gameStore';
import { CORE_PORTS } from './portArchetypes';
import { resolveCampaignPortId } from './worldPorts';

export type WaterPaletteId = 'tropical' | 'monsoon' | 'arid' | 'temperate' | 'mediterranean';
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
    description: 'Electric cyan-turquoise water with vivid white-sand-beach lagoon shallows.',
    terrain: {
      deep: [0.00, 0.42, 0.72],
      shallow: [0.08, 0.82, 0.85],
      surf: [0.75, 0.97, 0.95],
    },
    oceanOverlay: {
      base: [0.00, 0.80, 0.88],
      outerShallow: [0.00, 0.62, 0.78],
      paleSurf: [0.62, 0.96, 0.95],
    },
    surface: {
      day: [0.00, 0.52, 0.82],
      dusk: [0.01, 0.32, 0.54],
      night: [0.00, 0.03, 0.10],
      fallbackHex: 0x0085d1,
    },
    map: {
      deep: [0.00, 0.40, 0.68],
      shallow: [0.06, 0.72, 0.82],
    },
  },
  monsoon: {
    id: 'monsoon',
    label: 'Monsoon',
    description: 'Saturated teal and ocean-green water deepening to rich blue offshore.',
    terrain: {
      deep: [0.00, 0.30, 0.42],
      shallow: [0.04, 0.68, 0.62],
      surf: [0.64, 0.92, 0.80],
    },
    oceanOverlay: {
      base: [0.02, 0.64, 0.60],
      outerShallow: [0.00, 0.48, 0.50],
      paleSurf: [0.58, 0.90, 0.78],
    },
    surface: {
      day: [0.00, 0.42, 0.54],
      dusk: [0.00, 0.28, 0.38],
      night: [0.00, 0.03, 0.07],
      fallbackHex: 0x006b8a,
    },
    map: {
      deep: [0.00, 0.28, 0.40],
      shallow: [0.04, 0.58, 0.56],
    },
  },
  arid: {
    id: 'arid',
    label: 'Arid',
    description: 'Bright electric cobalt water for dry Red Sea and Arabian Sea ports.',
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
  mediterranean: {
    id: 'mediterranean',
    label: 'Mediterranean',
    description: 'Clear warm blue water, close to arid seas but darker and less electric.',
    terrain: {
      deep: [0.02, 0.44, 0.70],
      shallow: [0.14, 0.72, 0.82],
      surf: [0.70, 0.94, 0.94],
    },
    oceanOverlay: {
      base: [0.08, 0.74, 0.86],
      outerShallow: [0.04, 0.58, 0.76],
      paleSurf: [0.66, 0.94, 0.96],
    },
    surface: {
      day: [0.00, 0.46, 0.78],
      dusk: [0.02, 0.30, 0.54],
      night: [0.00, 0.03, 0.09],
      fallbackHex: 0x0075c7,
    },
    map: {
      deep: [0.02, 0.40, 0.68],
      shallow: [0.12, 0.66, 0.80],
    },
  },
};

export function getWaterPalette(id: WaterPaletteId): WaterPalette {
  return WATER_PALETTES[id];
}

export function getDefaultWaterPaletteForClimate(climate: ClimateLike): WaterPaletteId {
  switch (climate) {
    case 'tropical':
      return 'tropical';
    case 'monsoon':
      return 'monsoon';
    case 'arid':
      return 'arid';
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
