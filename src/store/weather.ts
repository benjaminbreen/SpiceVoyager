import { getWorldPortById } from '../utils/worldPorts';
import type { ClimateProfile } from '../utils/portArchetypes';

export type WeatherKind = 'clear' | 'rain';

export interface WeatherState {
  kind: WeatherKind;
  intensity: number;
  targetIntensity: number;
}

export interface WindState {
  direction: number;
  speed: number;
}

const RAIN_CHANCE_BY_CLIMATE: Record<ClimateProfile, number> = {
  monsoon: 0.65,
  tropical: 0.30,
  temperate: 0.25,
  mediterranean: 0.15,
  arid: 0.05,
};

export function rollWeatherForPortId(portId: string | null): WeatherState {
  const port = getWorldPortById(portId);
  const climate: ClimateProfile = port?.climate ?? 'temperate';
  const chance = RAIN_CHANCE_BY_CLIMATE[climate] ?? 0.2;
  if (Math.random() < chance) {
    const target = 0.3 + Math.pow(Math.random(), 1.5) * 0.7;
    return { kind: 'rain', intensity: 0, targetIntensity: target };
  }
  return { kind: 'clear', intensity: 0, targetIntensity: 0 };
}

export function rollWindForPortId(portId: string | null, weather: WeatherState): WindState {
  const port = getWorldPortById(portId);
  const climate: ClimateProfile = port?.climate ?? 'temperate';
  const climateBase: Record<ClimateProfile, number> = {
    monsoon: 0.58,
    tropical: 0.48,
    temperate: 0.52,
    mediterranean: 0.44,
    arid: 0.42,
  };
  const rainBoost = weather.targetIntensity * 0.25;
  return {
    direction: Math.random() * Math.PI * 2,
    speed: Math.max(0.12, Math.min(1, climateBase[climate] + (Math.random() - 0.5) * 0.28 + rainBoost)),
  };
}
