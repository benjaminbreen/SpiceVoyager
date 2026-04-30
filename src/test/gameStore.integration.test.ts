import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ALL_COMMODITIES_FULL, type Commodity } from '../utils/commodities';
import { estimateSeaTravel } from '../utils/worldPorts';
import { useGameStore, type CargoStack, type CrewMember, type Port } from '../store/gameStore';

type StoreState = ReturnType<typeof useGameStore.getState>;

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

function makePort(overrides: Partial<Port> & Pick<Port, 'id' | 'name'>): Port {
  const inventory = makeCommodityRecord(0);
  const baseInventory = makeCommodityRecord(0);
  const basePrices = makeCommodityRecord(0);

  return {
    id: overrides.id,
    name: overrides.name,
    culture: 'Indian Ocean',
    scale: 'Large',
    position: [0, 0, 0],
    inventory,
    baseInventory,
    basePrices,
    prices: { ...basePrices },
    buildings: [],
    ...overrides,
  };
}

function resetStore() {
  useGameStore.setState(useGameStore.getInitialState(), true);
  useGameStore.setState({
    setCaptainExpression: vi.fn(),
  } as Partial<StoreState>);
}

beforeEach(() => {
  resetStore();
});

afterEach(() => {
  resetStore();
  vi.restoreAllMocks();
});

describe('gameStore integration', () => {
  it('buys a known commodity and updates cargo, gold, port stock, and reputation', () => {
    const cargo = makeCommodityRecord(0);
    const port = makePort({
      id: 'goa',
      name: 'Goa',
      inventory: { ...makeCommodityRecord(0), 'Black Pepper': 10 },
      baseInventory: { ...makeCommodityRecord(0), 'Black Pepper': 10 },
      basePrices: { ...makeCommodityRecord(0), 'Black Pepper': 100 },
      prices: { ...makeCommodityRecord(0), 'Black Pepper': 100 },
    });

    useGameStore.setState({
      gold: 1000,
      cargo,
      cargoProvenance: [],
      crew: [makeCrewMember({ role: 'Captain', traits: [] })],
      knowledgeState: { 'Black Pepper': 1 },
      ports: [port],
      activePort: port,
      reputation: {},
      notifications: [],
      journalEntries: [],
    } as Partial<StoreState>);

    useGameStore.getState().buyCommodity('Black Pepper', 2);
    const state = useGameStore.getState();

    expect(state.gold).toBe(800);
    expect(state.cargo['Black Pepper']).toBe(2);
    expect(state.activePort?.inventory['Black Pepper']).toBe(8);
    expect(state.ports[0]?.inventory['Black Pepper']).toBe(8);
    expect(state.getReputation('Portuguese')).toBe(2);
    expect(state.cargoProvenance).toHaveLength(1);
    expect(state.cargoProvenance[0]).toMatchObject({
      commodity: 'Black Pepper',
      actualCommodity: 'Black Pepper',
      amount: 2,
      purchasePrice: 100,
      acquiredPort: 'goa',
    });
  });

  it('sells mislabeled cargo using the actual commodity price and reveals the fraud', () => {
    const cargo = makeCommodityRecord(0);
    cargo.Cinnamon = 2;

    const port = makePort({
      id: 'goa',
      name: 'Goa',
      inventory: { ...makeCommodityRecord(0), Cinnamon: 10, 'Cassia Fistula': 10 },
      baseInventory: { ...makeCommodityRecord(0), Cinnamon: 10, 'Cassia Fistula': 10 },
      basePrices: { ...makeCommodityRecord(0), Cinnamon: 100, 'Cassia Fistula': 25 },
      prices: { ...makeCommodityRecord(0), Cinnamon: 100, 'Cassia Fistula': 25 },
    });

    const fraudulentStack: CargoStack = {
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

    useGameStore.setState({
      gold: 100,
      cargo,
      cargoProvenance: [fraudulentStack],
      crew: [makeCrewMember({ role: 'Captain', traits: [] })],
      knowledgeState: {},
      ports: [port],
      activePort: port,
      reputation: {},
      notifications: [],
      journalEntries: [],
    } as Partial<StoreState>);

    useGameStore.getState().sellCommodity('Cinnamon', 2);
    const state = useGameStore.getState();

    expect(state.gold).toBe(140);
    expect(state.cargo.Cinnamon).toBe(0);
    expect(state.cargoProvenance).toHaveLength(0);
    expect(state.knowledgeState['Cassia Fistula']).toBe(1);
    expect(state.getReputation('Portuguese')).toBe(2);
    expect(state.notifications.some((n) => n.subtitle === 'FRAUD REVEALED')).toBe(true);
    expect(state.journalEntries.some((entry) => entry.message.includes('Cassia Fistula') && entry.message.includes('Cinnamon'))).toBe(true);
  });

  it('records reputation threshold crossings in the journal', () => {
    useGameStore.setState({
      reputation: {},
      journalEntries: [],
    } as Partial<StoreState>);

    useGameStore.getState().adjustReputation('Portuguese', -30);
    const state = useGameStore.getState();

    expect(state.getReputation('Portuguese')).toBe(-30);
    expect(state.journalEntries).toHaveLength(1);
    expect(state.journalEntries[0]?.message).toContain('not to be trusted');
  });

  it('starts a pirate run with a black flag, armed ship, and mixed crew', () => {
    useGameStore.getState().startNewGame({ faction: 'Pirate', portId: 'socotra' });
    const state = useGameStore.getState();

    expect(state.ship.flag).toBe('Pirate');
    expect(state.currentWorldPortId).toBe('socotra');
    expect(state.stats.armament.length).toBeGreaterThan(0);
    expect(state.gold).toBeLessThan(1000);
    expect(state.cargo['Small Shot']).toBeGreaterThan(0);
    expect(state.ship.armed).toBe(true);
    expect(state.crew.every((member) => member.nationality !== 'Pirate')).toBe(true);
    expect(state.getReputation('Portuguese')).toBeLessThan(0);
  });

  it('damages the ship, lowers crew morale, and triggers game over on destruction', () => {
    const crew = [
      makeCrewMember({ id: 'captain', role: 'Captain', morale: 8 }),
      makeCrewMember({ id: 'sailor', role: 'Sailor', morale: 6 }),
    ];

    useGameStore.setState({
      crew,
      stats: { ...useGameStore.getState().stats, hull: 5, maxHull: 100 },
      journalEntries: [],
      gameOver: false,
      gameOverCause: '',
      paused: false,
    } as Partial<StoreState>);

    useGameStore.getState().damageShip(10);
    const state = useGameStore.getState();

    expect(state.stats.hull).toBe(0);
    expect(state.crew.map((member) => member.morale)).toEqual([7, 5]);
    expect(state.gameOver).toBe(true);
    expect(state.paused).toBe(true);
    expect(state.gameOverCause).toContain('destroyed');
    expect(state.journalEntries.at(-1)?.category).toBe('ship');
  });

  it('fast travels on a direct sea lane and consumes provisions by voyage length', () => {
    const travel = estimateSeaTravel('london', 'jamestown');
    expect(travel).not.toBeNull();

    useGameStore.setState({
      currentWorldPortId: 'london',
      crew: [
        makeCrewMember({ id: 'captain', role: 'Captain' }),
        makeCrewMember({ id: 'navigator', role: 'Navigator' }),
        makeCrewMember({ id: 'sailor-a', role: 'Sailor' }),
        makeCrewMember({ id: 'sailor-b', role: 'Sailor' }),
      ],
      provisions: 20,
      playerMode: 'walking',
      playerVelocity: 4,
      activePort: makePort({ id: 'london', name: 'London' }),
      notifications: [],
      journalEntries: [],
    } as Partial<StoreState>);

    useGameStore.getState().fastTravel('jamestown');
    const state = useGameStore.getState();
    const expectedConsumption = Math.ceil(state.crew.length * 0.5) * (travel?.days ?? 1);

    expect(state.currentWorldPortId).toBe('jamestown');
    expect(state.playerMode).toBe('ship');
    expect(state.playerVelocity).toBe(0);
    expect(state.activePort).toBeNull();
    expect(state.timeOfDay).toBe(8);
    expect(state.provisions).toBe(Math.max(0, 20 - expectedConsumption));
    expect(state.notifications.at(-1)?.message).toContain('Arrived at Jamestown');
    expect(state.journalEntries.at(-1)?.category).toBe('navigation');
  });

  it('kills the captain, pauses the game, and promotes the most skilled survivor', () => {
    const captain = makeCrewMember({ id: 'captain', name: 'Captain', role: 'Captain', skill: 8 });
    const sailor = makeCrewMember({ id: 'sailor', name: 'Mateo', role: 'Sailor', skill: 18 });

    useGameStore.setState({
      crew: [captain, sailor],
      notifications: [],
      journalEntries: [],
      deadCrew: null,
      paused: false,
    } as Partial<StoreState>);

    useGameStore.getState().killCrewMember('captain', 'He was swept overboard in a squall.');
    const state = useGameStore.getState();

    expect(state.deadCrew?.id).toBe('captain');
    expect(state.paused).toBe(true);
    expect(state.crew).toHaveLength(1);
    expect(state.crew[0]?.id).toBe('sailor');
    expect(state.crew[0]?.role).toBe('Captain');
    expect(state.notifications.some((n) => n.message.includes('promoted to Captain'))).toBe(true);
    expect(state.journalEntries.at(-1)?.category).toBe('crew');
  });

  it('learns a new commodity at level 1 and records the source', () => {
    useGameStore.setState({
      activePort: makePort({ id: 'goa', name: 'Goa' }),
      knowledgeState: {},
      notifications: [],
      journalEntries: [],
    } as Partial<StoreState>);

    useGameStore.getState().learnAboutCommodity('Tea', 1, 'a dockside broker');
    const state = useGameStore.getState();

    expect(state.knowledgeState.Tea).toBe(1);
    expect(state.notifications.at(-1)?.message).toBe('Identified: Tea');
    expect(state.journalEntries.at(-1)?.message).toContain('Through a dockside broker');
  });
});
