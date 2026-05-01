import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ALL_COMMODITIES_FULL, type Commodity } from '../utils/commodities';
import { estimateSeaTravel } from '../utils/worldPorts';
import { useGameStore, type CargoStack, type CrewMember, type Port } from '../store/gameStore';
import type { POIDefinition, POIReward } from '../utils/poiDefinitions';

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

function makeGeneratedPOI(reward: POIReward, id = 'goa-proc-0-test'): POIDefinition {
  return {
    id,
    name: 'Test Site',
    kind: 'wreck',
    class: 'civic',
    port: 'goa',
    location: { kind: 'hinterland', position: [40, 40] },
    knowledgeDomain: [],
    masteryGoods: [],
    cost: { type: 'gold', amount: 0 },
    npcName: 'The site itself',
    npcRole: 'unattended place',
    lore: 'A test site beyond the road.',
    generated: true,
    hasKeeper: false,
    reward,
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

  it('tightens rations as a captain order and reduces the next daily provision consumption', () => {
    useGameStore.setState({
      crew: [
        makeCrewMember({ id: 'cap', role: 'Captain', morale: 60 }),
        makeCrewMember({ id: 'sailor', role: 'Sailor', morale: 60 }),
      ],
      provisions: 10,
      rationingDays: 0,
      dayCount: 1,
      timeOfDay: 8,
      notifications: [],
      journalEntries: [],
      lastCrewTroubleDay: 1,
      crewTroubleCooldowns: {},
    } as Partial<StoreState>);

    useGameStore.getState().issueCaptainOrder('tighten-rations');
    expect(useGameStore.getState().rationingDays).toBe(5);
    expect(useGameStore.getState().crew.every(member => member.morale === 56)).toBe(true);

    useGameStore.getState().advanceTime(24);
    const state = useGameStore.getState();
    expect(state.provisions).toBe(9);
    expect(state.rationingDays).toBe(4);
  });

  it('public punishment can raise wider morale when the punished hand is disliked', () => {
    useGameStore.setState({
      crew: [
        makeCrewMember({ id: 'cap', name: 'Captain', role: 'Captain', morale: 60 }),
        makeCrewMember({ id: 'target', name: 'Target', role: 'Sailor', morale: 60, hearts: { current: 3, max: 3 } }),
        makeCrewMember({ id: 'mate', name: 'Mate', role: 'Sailor', morale: 60 }),
      ],
      crewRelations: [{
        id: 'mate:target',
        aId: 'mate',
        bId: 'target',
        affinity: -20,
        tension: 90,
        tags: ['rations'],
        lastEventDay: 1,
      }],
      crewStatuses: [],
      notifications: [],
      journalEntries: [],
      dayCount: 5,
      lastCrewTroubleDay: 5,
      crewTroubleCooldowns: {},
    } as Partial<StoreState>);

    useGameStore.getState().issueCaptainOrder('punish-publicly', 'target');
    const state = useGameStore.getState();
    const target = state.crew.find(member => member.id === 'target')!;
    const mate = state.crew.find(member => member.id === 'mate')!;

    expect(target.morale).toBe(42);
    expect(target.hearts.current).toBe(2);
    expect(mate.morale).toBe(63);
    expect(state.crewStatuses.some(status => status.crewId === 'target')).toBe(true);
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

  it('applies resolved voyage effects during fast travel', () => {
    useGameStore.setState({
      currentWorldPortId: 'goa',
      provisions: 20,
      crew: [
        makeCrewMember({ id: 'captain', role: 'Captain', morale: 50 }),
        makeCrewMember({ id: 'sailor', role: 'Sailor', morale: 45 }),
      ],
      stats: { ...useGameStore.getState().stats, hull: 70, maxHull: 100 },
      journalEntries: [],
      notifications: [],
    } as Partial<StoreState>);

    useGameStore.getState().fastTravel('malacca', {
      voyage: {
        fromPortId: 'goa',
        toPortId: 'malacca',
        routeKey: 'goa:malacca',
        routeKnown: false,
        chartedRoute: true,
        fromPortName: 'Goa',
        toPortName: 'Malacca',
        fromRegion: 'indianOcean',
        toRegion: 'eastIndies',
        stance: 'press',
        baseDays: 6,
        actualDays: 5,
        distanceKm: 3000,
        risk: 'Moderate',
        provisionCost: 7,
        hullDamage: 4,
        moraleDelta: -1,
        roleEffects: ['No navigator aboard: kept a wider margin for error.'],
        incident: {
          title: 'Squall Line',
          text: 'A dark wall of rain crosses the course.',
          choices: [
            { id: 'reef', label: 'Reef sails', detail: 'Lose time, spare the hull.', resultText: 'The crew shortened sail.' },
            { id: 'drive', label: 'Drive through', detail: 'Save time, risk damage.', resultText: 'The helmsman held course.' },
          ],
        },
        events: [{ day: 1, title: 'Press Sail', text: 'The captain pressed sail.', tone: 'warning' }],
      },
    });

    const state = useGameStore.getState();
    expect(state.currentWorldPortId).toBe('malacca');
    expect(state.dayCount).toBe(6);
    expect(state.provisions).toBe(13);
    expect(state.stats.hull).toBe(66);
    expect(state.crew.map((member) => member.morale)).toEqual([49, 44]);
    expect(state.journalEntries.at(-1)?.message).toContain('pressed sail');
    expect(state.chartedRoutes).toContain('goa:malacca');
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

  it('claims a generated journal POI reward only once', () => {
    const poi = makeGeneratedPOI({ type: 'journal', entryKey: 'test-site' });
    useGameStore.setState({
      claimedPOIRewards: [],
      poiRewardResults: {},
      journalEntries: [],
      notifications: [],
    } as Partial<StoreState>);

    const first = useGameStore.getState().claimPOIReward(poi);
    const second = useGameStore.getState().claimPOIReward(poi);
    const state = useGameStore.getState();

    expect(first.status).toBe('journal');
    expect(second.status).toBe('journal');
    expect(state.claimedPOIRewards).toEqual([poi.id]);
    expect(state.journalEntries).toHaveLength(1);
  });

  it('claims a generated cargo reward with deterministic amount and provenance', () => {
    const poi = makeGeneratedPOI({ type: 'cargo', commodityId: 'Black Pepper', min: 1, max: 3, chance: 1 }, 'goa-proc-0-cargo');
    useGameStore.setState({
      cargo: makeCommodityRecord(0),
      cargoProvenance: [],
      claimedPOIRewards: [],
      poiRewardResults: {},
      stats: { ...useGameStore.getState().stats, cargoCapacity: 10 },
      journalEntries: [],
      notifications: [],
    } as Partial<StoreState>);

    const first = useGameStore.getState().claimPOIReward(poi);
    const amount = first.status === 'cargo' ? first.amount : 0;
    const second = useGameStore.getState().claimPOIReward(poi);
    const state = useGameStore.getState();

    expect(first.status).toBe('cargo');
    expect(second).toEqual(first);
    expect(amount).toBeGreaterThanOrEqual(1);
    expect(amount).toBeLessThanOrEqual(3);
    expect(state.cargo['Black Pepper']).toBe(amount);
    expect(state.cargoProvenance).toMatchObject([
      { commodity: 'Black Pepper', actualCommodity: 'Black Pepper', amount, acquiredPort: `poi:${poi.id}` },
    ]);
  });

  it('does not claim a generated cargo reward when the hold lacks weight capacity', () => {
    const poi = makeGeneratedPOI({ type: 'cargo', commodityId: 'Hides', min: 1, max: 1, chance: 1 }, 'goa-proc-0-heavy-cargo');
    useGameStore.setState({
      cargo: makeCommodityRecord(0),
      cargoProvenance: [],
      claimedPOIRewards: [],
      poiRewardResults: {},
      stats: { ...useGameStore.getState().stats, cargoCapacity: 1 },
      notifications: [],
    } as Partial<StoreState>);

    const result = useGameStore.getState().claimPOIReward(poi);
    const state = useGameStore.getState();

    expect(result).toEqual({ status: 'full', commodityId: 'Hides' });
    expect(state.claimedPOIRewards).toEqual([]);
    expect(state.cargo.Hides).toBe(0);
    expect(state.cargoProvenance).toEqual([]);
  });

  it('claims generated knowledge rewards without downgrading known commodities', () => {
    const poi = makeGeneratedPOI({ type: 'knowledge', commodityId: 'Indigo', level: 1 }, 'goa-proc-0-knowledge');
    useGameStore.setState({
      knowledgeState: { Indigo: 2 },
      claimedPOIRewards: [],
      poiRewardResults: {},
      journalEntries: [],
      notifications: [],
    } as Partial<StoreState>);

    const result = useGameStore.getState().claimPOIReward(poi);
    const state = useGameStore.getState();

    expect(result).toEqual({ status: 'knowledge', commodityId: 'Indigo', learned: false });
    expect(state.knowledgeState.Indigo).toBe(2);
    expect(state.claimedPOIRewards).toEqual([poi.id]);
    expect(state.journalEntries.at(-1)?.message).toContain('already knew');
  });
});
