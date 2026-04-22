export const CITY_FIELD_KEYS = [
  'sanctity',
  'risk',
  'centrality',
  'access',
  'waterfront',
  'prominence',
  'nuisance',
  'prestige',
] as const;

export type CityFieldKey = typeof CITY_FIELD_KEYS[number];

export interface CityFieldSample {
  x: number;
  y: number;
  z: number;
  size: number;
  values: Record<CityFieldKey, number>;
}

export const CITY_FIELD_LABELS: Record<CityFieldKey, string> = {
  sanctity: 'Sacred / Profane',
  risk: 'Safe / Dangerous',
  centrality: 'Centrality',
  access: 'Access',
  waterfront: 'Waterfront',
  prominence: 'Prominence',
  nuisance: 'Nuisance',
  prestige: 'Prestige',
};

export const CITY_FIELD_DESCRIPTIONS: Record<CityFieldKey, string> = {
  sanctity: 'Quiet, elevated, and ritually resonant ground versus profane or taboo space.',
  risk: 'Low-surveillance or exposed cells versus ordered, defended, and watched cells.',
  centrality: 'How much a cell reads as part of the urban center rather than the fringe.',
  access: 'How well connected a cell is to roads, docks, bridges, and civic circulation.',
  waterfront: 'Harbor-edge or riverfront pull, regardless of whether the site is prestigious.',
  prominence: 'Topographic command and visual presence within the local city footprint.',
  nuisance: 'Noise, labor, smell, and dockside churn rather than danger alone.',
  prestige: 'Composite field for elite siting: central, connected, safe, and mildly elevated.',
};
