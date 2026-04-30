import { describe, expect, it } from 'vitest';
import { quoteBuyCommodity, quoteSellCommodity, settleSellCommodity } from '../utils/tradeQuotes';
import { ALL_COMMODITIES_FULL, type Commodity } from '../utils/commodities';
import type { CargoStack, CrewMember, Port } from '../store/gameStore';

function makeCommodityRecord(value = 0): Record<Commodity, number> {
  return ALL_COMMODITIES_FULL.reduce((acc, commodity) => {
    acc[commodity] = value;
    return acc;
  }, {} as Record<Commodity, number>);
}

function makeCrewMember(overrides: Partial<CrewMember>): CrewMember {
  return {
    id: 'crew-1',
    name: 'Test Crew',
    role: 'Captain',
    skill: 10,
    morale: 50,
    age: 30,
    nationality: 'Portuguese',
    languages: [],
    birthplace: 'Goa',
    health: 'healthy',
    quality: 'able',
    stats: { strength: 10, perception: 10, charisma: 10, luck: 10 },
    humours: { sanguine: 0, choleric: 0, melancholic: 0, phlegmatic: 0, curiosity: 0 },
    backstory: '',
    history: [],
    hireDay: 1,
    traits: [],
    abilities: [],
    level: 1,
    xp: 0,
    xpToNext: 10,
    hearts: { current: 3, max: 3 },
    ...overrides,
  };
}

function makePort(): Port {
  return {
    id: 'goa',
    name: 'Goa',
    culture: 'Indian Ocean',
    scale: 'Large',
    position: [0, 0, 0],
    inventory: { ...makeCommodityRecord(0), 'Black Pepper': 10, Cinnamon: 10, 'Cassia Fistula': 10 },
    baseInventory: { ...makeCommodityRecord(0), 'Black Pepper': 10, Cinnamon: 10, 'Cassia Fistula': 10 },
    basePrices: { ...makeCommodityRecord(0), 'Black Pepper': 100, Cinnamon: 100, 'Cassia Fistula': 25 },
    prices: { ...makeCommodityRecord(0), 'Black Pepper': 100, Cinnamon: 100, 'Cassia Fistula': 25 },
    buildings: [],
  };
}

describe('tradeQuotes', () => {
  it('quotes buy cost with factor and Silver Tongue modifiers', () => {
    const cargo = makeCommodityRecord(0);
    const crew = [
      makeCrewMember({ role: 'Captain', traits: ['Silver Tongue'] }),
      makeCrewMember({ id: 'factor', role: 'Factor', stats: { strength: 10, perception: 10, charisma: 20, luck: 10 } }),
    ];

    const quote = quoteBuyCommodity({
      commodity: 'Black Pepper',
      amount: 2,
      port: makePort(),
      cargo,
      cargoWeight: 0,
      cargoCapacity: 100,
      gold: 1000,
      crew,
      knowledgeState: { 'Black Pepper': 1 },
    });

    expect(quote.unitPrice).toBe(86);
    expect(quote.total).toBe(172);
    expect(quote.maxAmount).toBe(10);
  });

  it('quotes sell cost with mastery and crew modifiers', () => {
    const cargo = { ...makeCommodityRecord(0), 'Black Pepper': 3 };
    const crew = [
      makeCrewMember({ role: 'Captain', traits: ['Silver Tongue'] }),
      makeCrewMember({ id: 'factor', role: 'Factor', stats: { strength: 10, perception: 10, charisma: 20, luck: 10 } }),
    ];

    const quote = quoteSellCommodity({
      commodity: 'Black Pepper',
      amount: 2,
      port: makePort(),
      cargo,
      cargoWeight: 3,
      cargoCapacity: 100,
      gold: 100,
      crew,
      knowledgeState: { 'Black Pepper': 2 },
    });

    expect(quote.unitPrice).toBeGreaterThan(80);
    expect(quote.total).toBe(quote.unitPrice * 2);
    expect(quote.maxAmount).toBe(3);
  });

  it('settles mislabeled cargo using actual commodity price and reveals it', () => {
    const stack: CargoStack = {
      id: 'stack-1',
      commodity: 'Cinnamon',
      actualCommodity: 'Cassia Fistula',
      amount: 2,
      acquiredPort: 'aceh',
      acquiredPortName: 'Aceh',
      acquiredDay: 1,
      purchasePrice: 50,
      knowledgeAtPurchase: 0,
    };

    const settlement = settleSellCommodity({
      commodity: 'Cinnamon',
      amount: 2,
      port: makePort(),
      crew: [makeCrewMember({ role: 'Captain' })],
      knowledgeState: {},
      cargoProvenance: [stack],
    });

    expect(settlement.total).toBe(40);
    expect(settlement.provenanceAfter).toHaveLength(0);
    expect(settlement.reveals).toHaveLength(1);
    expect(settlement.knowledgeAfter['Cassia Fistula']).toBe(1);
  });
});
