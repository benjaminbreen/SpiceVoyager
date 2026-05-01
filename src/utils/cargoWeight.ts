import type { Commodity } from './commodities';
import { COMMODITY_DEFS } from './commodities';

export const MAGAZINE_COMMODITIES = new Set<Commodity>([
  'Small Shot',
  'Cannon Shot',
  'War Rockets',
]);

export function cargoUnitWeight(commodity: Commodity) {
  return MAGAZINE_COMMODITIES.has(commodity) ? 0 : COMMODITY_DEFS[commodity].weight;
}

export function calculateCargoWeight(cargo: Partial<Record<Commodity, number>>) {
  return (Object.entries(cargo) as [Commodity, number][])
    .reduce((sum, [commodity, qty]) => sum + qty * cargoUnitWeight(commodity), 0);
}
