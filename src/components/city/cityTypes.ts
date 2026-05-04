export interface Part {
  geo: 'box' | 'cylinder' | 'cone' | 'roundCone' | 'gableRoof' | 'shedRoof' | 'sphere' | 'dome';
  mat: 'white' | 'mud' | 'wood' | 'terracotta' | 'stone' | 'straw' | 'tileRoof' | 'thatchRoof' | 'woodRoof' | 'dark' | 'litWindow';
  pos: [number, number, number];
  scale: [number, number, number];
  rot: [number, number, number];
  color?: [number, number, number];
  buildingId?: string;
  shakeCenter?: [number, number, number];
  // Ground-hugging surfaces (dock decks, plaza paving) bucket into a parallel
  // material with polygonOffset so they win the depth tie against terrain
  // and water-overlay layers instead of z-fighting.
  overlay?: boolean;
}

export interface TorchSpot {
  pos: [number, number, number];
  buildingId: string;
}

export interface SmokeSpot {
  pos: [number, number, number];
  seed: number; // per-chimney offset for staggered animation
}

export interface DamageSmokeSpot extends SmokeSpot {
  intensity: number;
}

export interface RuinMarker {
  pos: [number, number, number];
  scale: [number, number, number];
  rot: [number, number, number];
  color: [number, number, number];
}

export interface CollapseDustSource {
  pos: [number, number, number];
  scale: [number, number, number];
  buildingId: string;
  seed: number;
}

export interface BuildingFlameSource {
  pos: [number, number, number];
  scale: number;
  seed: number;
}

export interface CityFieldOverlaySample {
  pos: [number, number, number];
  scale: [number, number, number];
  color: [number, number, number];
}
