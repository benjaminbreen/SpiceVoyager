export type GrazerKind = 'antelope' | 'deer' | 'goat' | 'camel' | 'sheep' | 'bovine' | 'pig' | 'capybara';

export interface GrazerEntry {
  position: [number, number, number];
  rotation: number;
  color: [number, number, number];
  scale: number;
  speedMult: number;
}

export interface PrimateEntry {
  position: [number, number, number];
  rotation: number;
  color: [number, number, number];
  scale: number;
  speedMult: number;
  refuge: [number, number];
}

export interface ReptileEntry {
  position: [number, number, number];
  rotation: number;
  color: [number, number, number];
  scale: number;
  speedMult: number;
  bodyLength: number;
}

export interface WadingBirdEntry {
  position: [number, number, number];
  rotation: number;
  color: [number, number, number];
  scale: number;
  speedMult: number;
  circleCenter: [number, number];
  circleRadius: number;
  circlePhase: number;
  maxAltitude: number;
}

export interface SpeciesInfo {
  name: string;
  latin: string;
  info: string;
}

const GRAZER_FOOT_OFFSET: Record<GrazerKind, number> = {
  antelope: 0.49,
  deer: 0.55,
  goat: 0.41,
  camel: 0.73,
  sheep: 0.37,
  bovine: 0.49,
  pig: 0.33,
  capybara: 0.27,
};

export function grazerFootOffset(kind: GrazerKind): number {
  return GRAZER_FOOT_OFFSET[kind];
}

export const PRIMATE_FOOT_OFFSET = 0.32;
export const REPTILE_FOOT_OFFSET = 0.30;
