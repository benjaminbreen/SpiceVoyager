import { BuildingType, Culture } from '../store/gameStore';

function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

// ── Culture-specific name pools (c. 1612) ────────────────────────────────────

const PORTUGUESE_FAMILIES = [
  'da Silva', 'de Souza', 'Pereira', 'Albuquerque', 'Mendonça',
  'Noronha', 'Pinto', 'Rodrigues', 'Bragança', 'Coelho',
  'Mascarenhas', 'Saldanha', 'Corte-Real', 'Lobo', 'Figueiredo',
  'Tavares', 'Cardoso', 'Menezes', 'Teixeira', 'Cabral',
];

const INDIAN_OCEAN_FAMILIES = [
  'al-Hadrami', 'bin Majid', 'al-Rashid', 'Nakhuda', 'Shetty',
  'Nair', 'Mappila', 'Chettiar', 'Marakkayar', 'Koya',
  'bin Sulaiman', "al-Ma'mari", 'al-Balushi', 'al-Barwani',
  'Panikkar', 'Menon', 'Kurup', 'Kaimal', 'Tharakan', 'Moosa',
];

const CARIBBEAN_FAMILIES = [
  'de León', 'Oviedo', 'Anacaona', 'Velázquez', 'Cofresi',
  'Montejo', 'Guacanagarí', 'Arawak', 'Taíno', 'Caonabo',
  'Boukman', 'Enriquillo', 'Castellano', 'Boriquén', 'Mayabanex',
];

function getFamilyName(culture: Culture, rng: () => number): string {
  if (culture === 'European') return pick(PORTUGUESE_FAMILIES, rng);
  if (culture === 'Caribbean') return pick(CARIBBEAN_FAMILIES, rng);
  return pick(INDIAN_OCEAN_FAMILIES, rng);
}

// ── Fort names ───────────────────────────────────────────────────────────────

const FORT_NAMES: Record<Culture, string[]> = {
  'European': [
    'Fortaleza de Aguada', 'Forte de São Sebastião', 'Forte dos Reis Magos',
    'Fortaleza da Barra', 'Forte de Rachol', 'Castelo de Guia',
  ],
  'Indian Ocean': [
    "Qal'at al-Jalali", 'Gereza Fort', 'Fort Jesus', 'Kilwa Citadel',
    "Husn al-Ghuwayzi", 'Qal\'at Bahla', 'Fort Mirani',
  ],
  'Caribbean': [
    'Fuerte San Felipe', 'Fortaleza Ozama', 'Castillo del Morro',
    'Fort Charles', 'Fuerte de la Concepción',
  ],
};

// ── Market names ─────────────────────────────────────────────────────────────

const MARKET_NAMES: Record<Culture, string[]> = {
  'European': [
    'Mercado Grande', 'Feira da Ribeira', 'Mercado do Peixe',
    'Praça do Comércio', 'Mercado de São Paulo',
  ],
  'Indian Ocean': [
    'Spice Bazaar', 'Cloth Souk', 'Frankincense Market',
    'Pearl Bazaar', 'Grain Market', 'Fish Souk',
  ],
  'Caribbean': [
    'Plaza del Mercado', 'Market Square', 'Traders\' Yard',
    'Fish Market', 'Provision Ground',
  ],
};

// ── Dock names ───────────────────────────────────────────────────────────────

const DOCK_NAMES: Record<Culture, string[]> = {
  'European': [
    'Cais do Porto', 'Cais da Ribeira', 'Cais Real', 'Cais dos Pescadores',
    'Embarcadouro', 'Cais Grande',
  ],
  'Indian Ocean': [
    'Eastern Wharf', 'Dhow Landing', 'Merchant Quay', 'Fishermen\'s Jetty',
    'Old Stone Wharf', 'Timber Landing',
  ],
  'Caribbean': [
    'Main Wharf', 'Careening Wharf', 'Sugar Dock', 'Trader\'s Landing',
    'Fisherman\'s Pier', 'Long Wharf',
  ],
};

// ── Warehouse goods ──────────────────────────────────────────────────────────

const WAREHOUSE_GOODS: Record<Culture, string[]> = {
  'European': [
    'pepper', 'cinnamon', 'silk bales', 'porcelain', 'indigo',
    'saltpeter', 'camphor', 'cloves', 'ginger', 'wine casks',
  ],
  'Indian Ocean': [
    'pepper', 'cardamom', 'frankincense', 'cotton bales', 'rice',
    'dates', 'pearls', 'dried fish', 'coconut oil', 'sandalwood',
  ],
  'Caribbean': [
    'sugar', 'tobacco', 'hides', 'logwood', 'cacao',
    'salt', 'rum casks', 'cotton bales', 'cassava', 'indigo',
  ],
};

const WAREHOUSE_OWNERS: Record<Culture, string[]> = {
  'European': [
    'the Casa da Índia', 'the Crown', 'the Jesuits', 'the Misericórdia',
    'the Câmara', 'private merchants',
  ],
  'Indian Ocean': [
    'the Nakhuda guild', 'the Sultan', 'the Bania traders', 'the Mappila merchants',
    'the Chettiar moneylenders', 'the Sheikh',
  ],
  'Caribbean': [
    'the Governor', 'the Audiencia', 'the friars', 'the encomendero',
    'private traders', 'the garrison',
  ],
};

// ── Artisan/shopkeeper trades ────────────────────────────────────────────────

const TRADES_NEAR_WATER = [
  'Shipwright', 'Caulker', 'Rope-maker', 'Sail-mender', 'Net-maker',
  'Ship chandler', 'Anchor smith', 'Oar-maker',
];

const TRADES_NEAR_MARKET: Record<Culture, string[]> = {
  'European': [
    'Goldsmith', 'Tailor', 'Apothecary', 'Money-changer', 'Notary',
    'Barber-surgeon', 'Baker', 'Vintner', 'Candle-maker', 'Coppersmith',
    'Ivory carver', 'Printer', 'Saddler',
  ],
  'Indian Ocean': [
    'Goldsmith', 'Weaver', 'Dyer', 'Money-changer', 'Dalal',
    'Barber-surgeon', 'Potter', 'Coppersmith', 'Scribe',
    'Perfumer', 'Bead-maker', 'Oil-presser', 'Tanner',
  ],
  'Caribbean': [
    'Carpenter', 'Blacksmith', 'Tanner', 'Potter', 'Weaver',
    'Charcoal-burner', 'Canoe-builder', 'Dyer', 'Lime-burner',
    'Basket-maker', 'Hammock-maker',
  ],
};

// ── Commoner occupations ─────────────────────────────────────────────────────

const COMMONER_LABELS: Record<Culture, string[]> = {
  'European': [
    'Fisherman\'s dwelling', 'Sailor\'s quarters', 'Dockworker\'s house',
    'Washerwoman\'s cottage', 'Porter\'s dwelling', 'Soldier\'s billet',
    'Servant\'s quarters', 'Laborer\'s house',
  ],
  'Indian Ocean': [
    'Fisherman\'s hut', 'Sailor\'s dwelling', 'Porter\'s quarters',
    'Water-carrier\'s house', 'Toddy-tapper\'s house', 'Boatman\'s dwelling',
    'Palm-climber\'s house', 'Diver\'s hut',
  ],
  'Caribbean': [
    'Fisherman\'s hut', 'Dockhand\'s dwelling', 'Charcoal-burner\'s house',
    'Canoe-man\'s hut', 'Laborer\'s cottage', 'Hunter\'s dwelling',
    'Salt-raker\'s house', 'Turtle-catcher\'s hut',
  ],
};

// ── Shack occupations ────────────────────────────────────────────────────────

const SHACK_LABELS: Record<Culture, string[]> = {
  'European': [
    'Fisher\'s hut', 'Coconut seller', 'Porter\'s lean-to', 'Driftwood shelter',
    'Washerman\'s shack', 'Beggar\'s shelter', 'Beach vendor',
  ],
  'Indian Ocean': [
    'Fisher\'s hut', 'Coconut seller', 'Shell collector', 'Toddy-tapper\'s shack',
    'Net-mender\'s lean-to', 'Coir-spinner\'s hut', 'Oyster-shucker',
  ],
  'Caribbean': [
    'Fisher\'s hut', 'Turtle pen', 'Canoe shelter', 'Driftwood shack',
    'Salt-raker\'s hut', 'Crab-catcher\'s lean-to', 'Beach shelter',
  ],
};

// ── Farm crops ───────────────────────────────────────────────────────────────

const WET_CROPS: Record<Culture, string[]> = {
  'European': [
    'Rice paddy', 'Pepper garden', 'Coconut grove', 'Betel garden',
    'Sugarcane plot', 'Mango orchard', 'Cashew plantation',
  ],
  'Indian Ocean': [
    'Rice paddy', 'Pepper garden', 'Coconut grove', 'Cardamom plot',
    'Clove garden', 'Banana grove', 'Arecanut garden', 'Ginger field',
  ],
  'Caribbean': [
    'Sugar field', 'Tobacco plot', 'Cacao grove', 'Cassava field',
    'Banana grove', 'Cotton plot', 'Indigo field',
  ],
};

const DRY_CROPS: Record<Culture, string[]> = {
  'European': [
    'Goat herder', 'Cattle ranch', 'Dry garden', 'Millet field',
    'Fodder plot', 'Sheep pen',
  ],
  'Indian Ocean': [
    'Goat herder', 'Date palm grove', 'Millet field', 'Cotton field',
    'Sesame plot', 'Frankincense grove', 'Cattle enclosure',
  ],
  'Caribbean': [
    'Goat pen', 'Cattle ranch', 'Maize field', 'Provision ground',
    'Henequen plot', 'Pineapple patch',
  ],
};

// ── Elite titles ─────────────────────────────────────────────────────────────

const ELITE_TITLES: Record<Culture, string[]> = {
  'European': [
    'Fidalgo', 'Capitão', 'Desembargador', 'Vedor da Fazenda',
    'Ouvidor', 'Factor', 'Senhor',
  ],
  'Indian Ocean': [
    'Sheikh', 'Nakhuda', 'Sahib', 'Hajji', 'Maulana', 'Rao', 'Thakur',
  ],
  'Caribbean': [
    'Cacique', 'Alcalde', 'Encomendero', 'Regidor', 'Hacendado',
  ],
};

// ── Merchant specialties ─────────────────────────────────────────────────────

const MERCHANT_GOODS: Record<Culture, string[]> = {
  'European': [
    'cloth', 'spices', 'gems', 'ivory', 'porcelain',
    'wine', 'weapons', 'horses', 'silk', 'coral',
  ],
  'Indian Ocean': [
    'cloth', 'spices', 'pearls', 'sandalwood', 'incense',
    'cotton', 'dried fish', 'dates', 'coffee', 'coral',
  ],
  'Caribbean': [
    'hides', 'tobacco', 'sugar', 'cacao', 'logwood',
    'cotton', 'hammocks', 'cassava', 'salt', 'turtle shell',
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// Main label generator
// ═══════════════════════════════════════════════════════════════════════════════

export interface BuildingLabelResult {
  label: string;
  sub: string;
}

/**
 * Generate a deterministic label for a building based on its type,
 * culture, and placement characteristics.
 */
export function generateBuildingLabel(
  buildingId: string,
  type: BuildingType,
  culture: Culture,
  portName: string,
  height: number,
  distToCenter: number,
  moisture: number,
  seed: number,
): BuildingLabelResult {
  const rng = mulberry32(seed);
  // Consume a few values to decorrelate from other uses of same seed
  rng(); rng(); rng();

  switch (type) {
    case 'fort':
      return {
        label: pick(FORT_NAMES[culture], rng),
        sub: 'fortification',
      };

    case 'market':
      return {
        label: pick(MARKET_NAMES[culture], rng),
        sub: 'marketplace',
      };

    case 'dock':
      return {
        label: pick(DOCK_NAMES[culture], rng),
        sub: 'wharf',
      };

    case 'warehouse': {
      const goods = pick(WAREHOUSE_GOODS[culture], rng);
      const owner = pick(WAREHOUSE_OWNERS[culture], rng);
      return {
        label: `${capitalize(goods)} warehouse`,
        sub: `property of ${owner}`,
      };
    }

    case 'estate': {
      const family = getFamilyName(culture, rng);
      const title = pick(ELITE_TITLES[culture], rng);
      return {
        label: `Residence of ${title} ${family}`,
        sub: 'estate',
      };
    }

    case 'shack':
      return {
        label: pick(SHACK_LABELS[culture], rng),
        sub: 'dwelling',
      };

    case 'farmhouse': {
      if (moisture > 0.5) {
        return {
          label: pick(WET_CROPS[culture], rng),
          sub: 'farmstead',
        };
      } else {
        return {
          label: pick(DRY_CROPS[culture], rng),
          sub: 'farmstead',
        };
      }
    }

    case 'house': {
      // Social class heuristics based on placement
      const isNearCenter = distToCenter < 20;
      const isHighElevation = height > 4;
      const isLowElevation = height < 2;
      const isNearWater = distToCenter < 12 && isLowElevation;

      // Near water + low → maritime trades
      if (isNearWater && rng() < 0.6) {
        return {
          label: pick(TRADES_NEAR_WATER, rng),
          sub: 'workshop',
        };
      }

      // Near center → artisan or shopkeeper
      if (isNearCenter) {
        if (rng() < 0.4) {
          // Minor merchant
          const goods = pick(MERCHANT_GOODS[culture], rng);
          return {
            label: `${capitalize(goods)} merchant`,
            sub: 'shop',
          };
        }
        return {
          label: pick(TRADES_NEAR_MARKET[culture], rng),
          sub: 'shop',
        };
      }

      // High elevation → upper class residence
      if (isHighElevation) {
        const family = getFamilyName(culture, rng);
        if (rng() < 0.3) {
          const title = pick(ELITE_TITLES[culture], rng);
          return {
            label: `Residence of ${title} ${family}`,
            sub: 'residence',
          };
        }
        return {
          label: `Residence of the ${family} family`,
          sub: 'residence',
        };
      }

      // Low elevation + far → common laborer
      if (isLowElevation) {
        return {
          label: pick(COMMONER_LABELS[culture], rng),
          sub: 'dwelling',
        };
      }

      // Default middle-class — mix of trades and residences
      if (rng() < 0.5) {
        return {
          label: pick(TRADES_NEAR_MARKET[culture], rng),
          sub: 'shop',
        };
      }
      const family = getFamilyName(culture, rng);
      return {
        label: `House of ${family}`,
        sub: 'residence',
      };
    }

    default:
      return { label: '', sub: '' };
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
