import { useGameStore } from '../store/gameStore';
import { CORE_PORTS } from './portArchetypes';
import { resolveCampaignPortId } from './worldPorts';

export type WaterPaletteId = 'tropical' | 'monsoon' | 'arid' | 'temperate' | 'mediterranean';
export type WaterPaletteSetting = 'auto' | WaterPaletteId;
export type WaterColor = [number, number, number];

type ClimateLike = 'tropical' | 'arid' | 'temperate' | 'monsoon' | 'mediterranean';

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
      deep: [0.00, 0.34, 0.74],
      shallow: [0.02, 0.90, 0.78],
      surf: [0.65, 0.98, 0.88],
    },
    oceanOverlay: {
      base: [0.00, 0.76, 0.82],
      outerShallow: [0.04, 0.82, 0.72],
      paleSurf: [0.52, 0.98, 0.86],
    },
    surface: {
      day: [0.00, 0.44, 0.80],
      dusk: [0.00, 0.28, 0.54],
      night: [0.00, 0.03, 0.10],
      fallbackHex: 0x0070cc,
    },
    map: {
      deep: [0.00, 0.32, 0.70],
      shallow: [0.08, 0.78, 0.78],
    },
  },
  monsoon: {
    id: 'monsoon',
    label: 'Monsoon',
    description: 'Dark green coastal water and rain-heavy ocean tones.',
    terrain: {
      deep: [0.00, 0.22, 0.34],
      shallow: [0.06, 0.54, 0.38],
      surf: [0.42, 0.70, 0.48],
    },
    oceanOverlay: {
      base: [0.03, 0.44, 0.34],
      outerShallow: [0.05, 0.38, 0.32],
      paleSurf: [0.38, 0.66, 0.44],
    },
    surface: {
      day: [0.00, 0.30, 0.38],
      dusk: [0.00, 0.20, 0.28],
      night: [0.00, 0.03, 0.06],
      fallbackHex: 0x004d61,
    },
    map: {
      deep: [0.00, 0.20, 0.30],
      shallow: [0.10, 0.42, 0.34],
    },
  },
  arid: {
    id: 'arid',
    label: 'Arid',
    description: 'Bright electric cobalt water for dry Red Sea and Arabian Sea ports.',
    terrain: {
      deep: [0.0, 0.52, 0.68],
      shallow: [0.12, 0.84, 0.80],
      surf: [0.68, 0.97, 0.92],
    },
    oceanOverlay: {
      base: [0.08, 0.86, 0.84],
      outerShallow: [0.04, 0.76, 0.76],
      paleSurf: [0.58, 0.97, 0.94],
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
    description: 'Muddy brown-green tidal water with silty estuary shallows.',
    terrain: {
      deep: [0.03, 0.06, 0.05],
      shallow: [0.10, 0.13, 0.09],
      surf: [0.24, 0.27, 0.22],
    },
    oceanOverlay: {
      base: [0.07, 0.11, 0.08],
      outerShallow: [0.06, 0.09, 0.07],
      paleSurf: [0.22, 0.25, 0.20],
    },
    surface: {
      day: [0.06, 0.09, 0.06],
      dusk: [0.03, 0.06, 0.05],
      night: [0.01, 0.02, 0.02],
      fallbackHex: 0x101510,
    },
    map: {
      deep: [0.04, 0.08, 0.07],
      shallow: [0.10, 0.14, 0.10],
    },
  },
  mediterranean: {
    id: 'mediterranean',
    label: 'Tagus Blue',
    description: 'Clear Atlantic-blue estuary water with restrained turquoise shallows.',
    terrain: {
      deep: [0.01, 0.36, 0.64],
      shallow: [0.05, 0.64, 0.74],
      surf: [0.58, 0.88, 0.90],
    },
    oceanOverlay: {
      base: [0.08, 0.44, 0.58],
      outerShallow: [0.07, 0.36, 0.48],
      paleSurf: [0.48, 0.74, 0.78],
    },
    surface: {
      day: [0.00, 0.40, 0.72],
      dusk: [0.02, 0.26, 0.50],
      night: [0.00, 0.03, 0.08],
      fallbackHex: 0x0066b8,
    },
    map: {
      deep: [0.02, 0.34, 0.62],
      shallow: [0.09, 0.56, 0.72],
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
    case 'mediterranean':
      return 'mediterranean';
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
