import { getWorldPortById } from '../utils/worldPorts';
import type { ClimateProfile } from '../utils/portArchetypes';

export type WeatherKind = 'clear' | 'cloudy' | 'rain';

export interface WeatherState {
  kind: WeatherKind;
  intensity: number;
  targetIntensity: number;
}

export interface WindState {
  direction: number;
  speed: number;
}

export function getEffectiveRainIntensity(weather: WeatherState, forceRain = false): number {
  if (forceRain) return 1;
  if (weather.kind === 'rain') {
    return Math.max(weather.intensity, weather.targetIntensity * 0.45);
  }
  return weather.intensity;
}

const RAIN_CHANCE_BY_CLIMATE: Record<ClimateProfile, number> = {
  monsoon: 0.65,
  tropical: 0.30,
  temperate: 0.25,
  mediterranean: 0.15,
  arid: 0.05,
};

const CLOUDY_CHANCE_BY_CLIMATE: Record<ClimateProfile, number> = {
  monsoon: 0.08,
  tropical: 0.12,
  temperate: 0.15,
  mediterranean: 0.10,
  arid: 0.04,
};

export function rollWeatherForPortId(portId: string | null): WeatherState {
  const port = getWorldPortById(portId);
  const climate: ClimateProfile = port?.climate ?? 'temperate';
  const rainChance = RAIN_CHANCE_BY_CLIMATE[climate] ?? 0.2;
  const roll = Math.random();
  if (roll < rainChance) {
    const target = 0.3 + Math.pow(Math.random(), 1.5) * 0.7;
    return { kind: 'rain', intensity: 0, targetIntensity: target };
  }
  const cloudyChance = CLOUDY_CHANCE_BY_CLIMATE[climate] ?? 0.3;
  if (roll < rainChance + cloudyChance) {
    return { kind: 'cloudy', intensity: 0, targetIntensity: 0 };
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
