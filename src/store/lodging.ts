import type { Culture, PortScale } from './gameStore';

export function lodgingCost(scale: PortScale): number {
  switch (scale) {
    case 'Small': return 4;
    case 'Medium': return 6;
    case 'Large': return 8;
    case 'Very Large': return 12;
    case 'Huge': return 16;
  }
}

export function lodgingLabel(culture: Culture): string {
  switch (culture) {
    case 'Indian Ocean': return 'sarai';
    case 'European': return 'inn';
    case 'West African': return 'guesthouse';
    case 'Atlantic': return 'tavern lodgings';
  }
}
