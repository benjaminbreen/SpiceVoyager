import { create } from 'zustand';
import {
  commerceBuyTemplate, commerceSellTemplate, shipDamageTemplate,
  shipRepairTemplate, portDiscoverTemplate, tavernTemplate,
} from '../utils/journalTemplates';

export type Commodity = 'Spices' | 'Silk' | 'Tea' | 'Wood' | 'Cannonballs';

export type Culture = 'Indian Ocean' | 'European' | 'Caribbean';
export type PortScale = 'Small' | 'Medium' | 'Large' | 'Very Large';

export type BuildingType = 'dock' | 'warehouse' | 'fort' | 'estate' | 'house' | 'farmhouse' | 'shack' | 'market';

export interface Building {
  id: string;
  type: BuildingType;
  position: [number, number, number];
  rotation: number;
  scale: [number, number, number];
}

export interface Port {
  id: string;
  name: string;
  culture: Culture;
  scale: PortScale;
  position: [number, number, number];
  inventory: Record<Commodity, number>;
  prices: Record<Commodity, number>;
  buildings: Building[];
}

export interface ShipStats {
  hull: number;
  maxHull: number;
  sails: number;
  maxSails: number;
  speed: number;
  turnSpeed: number;
  cargoCapacity: number;
  cannons: number;
}

export type CrewRole = 'Captain' | 'Navigator' | 'Gunner' | 'Sailor' | 'Factor' | 'Surgeon';
export type HealthFlag = 'healthy' | 'sick' | 'injured' | 'scurvy' | 'fevered';
export type Nationality = 'English' | 'Portuguese' | 'Dutch' | 'Mughal' | 'Swahili' | 'Malay' | 'Chinese' | 'Ottoman' | 'Persian' | 'Gujarati';
export type CaptainTrait =
  | 'Silver Tongue'   // better prices at port
  | 'Iron Will'       // slower morale decay
  | 'Sea Legs'        // faster sailing speed
  | 'Keen Eye'        // discovers ports from further away
  | 'Battle Hardened' // reduced hull damage
  | 'Lucky Star';     // random bonus events

export interface CrewMember {
  id: string;
  name: string;
  role: CrewRole;
  skill: number;       // 1-100
  morale: number;      // 1-100
  age: number;
  nationality: Nationality;
  birthplace: string;
  health: HealthFlag;
}

export interface ShipInfo {
  name: string;
  type: 'Carrack' | 'Galleon' | 'Dhow' | 'Junk' | 'Pinnace';
  flag: Nationality;
  armed: boolean;
}

export interface CaptainInfo {
  traits: CaptainTrait[];
  level: number;       // 1+
  xp: number;          // current XP toward next level
  xpToNext: number;    // XP needed for next level
}

export interface Notification {
  id: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  timestamp: number;
}

export type JournalCategory = 'navigation' | 'commerce' | 'ship' | 'crew' | 'encounter';

export interface JournalNote {
  id: string;
  text: string;
  timestamp: number;
}

export interface JournalEntry {
  id: string;
  day: number;
  timeOfDay: number;
  category: JournalCategory;
  message: string;
  portName?: string;
  notes: JournalNote[];
}

interface GameState {
  playerPos: [number, number, number];
  playerRot: number;
  playerVelocity: number;
  gold: number;
  cargo: Record<Commodity, number>;
  stats: ShipStats;
  crew: CrewMember[];
  ship: ShipInfo;
  captainInfo: CaptainInfo;
  ports: Port[];
  timeOfDay: number; // 0 to 24
  weather: 'clear' | 'rain' | 'storm';
  notifications: Notification[];
  activePort: Port | null;
  cameraZoom: number;
  
  // New state for walking
  playerMode: 'ship' | 'walking';
  walkingPos: [number, number, number];
  walkingRot: number;
  interactionPrompt: string | null;
  discoveredPorts: string[];
  npcPositions: [number, number, number][];

  // Journal
  journalEntries: JournalEntry[];
  dayCount: number;

  // World
  worldSeed: number;
  paused: boolean;
  
  setPlayerPos: (pos: [number, number, number]) => void;
  setPlayerRot: (rot: number) => void;
  setPlayerVelocity: (vel: number) => void;
  setPlayerMode: (mode: 'ship' | 'walking') => void;
  setWalkingPos: (pos: [number, number, number]) => void;
  setWalkingRot: (rot: number) => void;
  setInteractionPrompt: (prompt: string | null) => void;
  discoverPort: (id: string) => void;
  setNpcPositions: (positions: [number, number, number][]) => void;
  damageShip: (amount: number) => void;
  repairShip: (amount: number, cost: number) => void;
  setCrewRole: (crewId: string, role: CrewRole) => void;
  
  addNotification: (message: string, type?: Notification['type']) => void;
  removeNotification: (id: string) => void;
  addJournalEntry: (category: JournalCategory, message: string, portName?: string) => void;
  addJournalNote: (entryId: string, text: string) => void;
  setActivePort: (port: Port | null) => void;
  buyCommodity: (commodity: Commodity, amount: number) => void;
  sellCommodity: (commodity: Commodity, amount: number) => void;
  advanceTime: (delta: number) => void;
  setCameraZoom: (zoom: number) => void;
  setWorldSeed: (seed: number) => void;
  setPaused: (paused: boolean) => void;
  initWorld: (ports: Port[]) => void;
}

const generateId = () => Math.random().toString(36).substring(2, 9);

export const useGameStore = create<GameState>((set, get) => ({
  playerPos: [0, 0, 0],
  playerRot: 0,
  playerVelocity: 0,
  gold: 1000,
  cargo: {
    Spices: 0,
    Silk: 0,
    Tea: 0,
    Wood: 10,
    Cannonballs: 20,
  },
  stats: {
    hull: 100,
    maxHull: 100,
    sails: 100,
    maxSails: 100,
    speed: 15,
    turnSpeed: 1.5,
    cargoCapacity: 100,
    cannons: 4,
  },
  crew: [
    { id: generateId(), name: 'Captain Blackwood', role: 'Captain', skill: 80, morale: 100, age: 42, nationality: 'English', birthplace: 'Bristol', health: 'healthy' },
    { id: generateId(), name: 'Rodrigo da Silva', role: 'Navigator', skill: 65, morale: 85, age: 34, nationality: 'Portuguese', birthplace: 'Lisbon', health: 'healthy' },
    { id: generateId(), name: 'Kwame Asante', role: 'Gunner', skill: 55, morale: 90, age: 28, nationality: 'Swahili', birthplace: 'Kilwa', health: 'healthy' },
    { id: generateId(), name: 'Smitty', role: 'Sailor', skill: 40, morale: 80, age: 22, nationality: 'English', birthplace: 'London', health: 'healthy' },
    { id: generateId(), name: 'Rajan Nair', role: 'Sailor', skill: 45, morale: 75, age: 30, nationality: 'Gujarati', birthplace: 'Surat', health: 'healthy' },
    { id: generateId(), name: 'Willem de Groot', role: 'Factor', skill: 70, morale: 82, age: 38, nationality: 'Dutch', birthplace: 'Amsterdam', health: 'healthy' },
  ],
  ship: {
    name: 'The Dorada',
    type: 'Carrack',
    flag: 'English',
    armed: true,
  },
  captainInfo: {
    traits: ['Silver Tongue'],
    level: 1,
    xp: 0,
    xpToNext: 100,
  },
  ports: [],
  timeOfDay: 8, // Start at 8 AM
  weather: 'clear',
  notifications: [],
  activePort: null,
  cameraZoom: 50,
  playerMode: 'ship',
  walkingPos: [0, 5, 0],
  walkingRot: 0,
  interactionPrompt: null,
  discoveredPorts: [],
  npcPositions: [],
  journalEntries: [],
  dayCount: 1,
  worldSeed: Math.floor(Math.random() * 100000),
  paused: false,

  setPlayerPos: (pos) => set({ playerPos: pos }),
  setPlayerRot: (rot) => set({ playerRot: rot }),
  setPlayerVelocity: (vel) => set({ playerVelocity: vel }),
  setPlayerMode: (mode) => set({ playerMode: mode }),
  setWalkingPos: (pos) => set({ walkingPos: pos }),
  setWalkingRot: (rot) => set({ walkingRot: rot }),
  setInteractionPrompt: (prompt) => set({ interactionPrompt: prompt }),
  setNpcPositions: (positions) => set({ npcPositions: positions }),
  
  damageShip: (amount) => {
    const state = get();
    const newHull = Math.max(0, state.stats.hull - amount);
    set({ stats: { ...state.stats, hull: newHull } });
    get().addJournalEntry('ship', shipDamageTemplate(amount, newHull));
  },

  repairShip: (amount, cost) => {
    const state = get();
    if (state.gold >= cost && state.stats.hull < state.stats.maxHull) {
      const newHull = Math.min(state.stats.maxHull, state.stats.hull + amount);
      set({
        gold: state.gold - cost,
        stats: { ...state.stats, hull: newHull }
      });
      const portName = state.activePort?.name ?? 'port';
      get().addJournalEntry('ship', shipRepairTemplate(amount, cost, portName), portName);
    }
  },
  
  setCrewRole: (crewId, role) => set((state) => ({
    crew: state.crew.map(c => c.id === crewId ? { ...c, role } : c)
  })),

  discoverPort: (id) => {
    const state = get();
    if (!state.discoveredPorts.includes(id)) {
      const port = state.ports.find(p => p.id === id);
      set({ discoveredPorts: [...state.discoveredPorts, id] });
      if (port) {
        get().addNotification(`Discovered ${port.name}!`, 'success');
        get().addJournalEntry('navigation', portDiscoverTemplate(port.name), port.name);
      }
    }
  },
  
  addNotification: (message, type = 'info') => set((state) => ({
    notifications: [...state.notifications, { id: generateId(), message, type, timestamp: Date.now() }].slice(-5)
  })),
  
  removeNotification: (id) => set((state) => ({
    notifications: state.notifications.filter(n => n.id !== id)
  })),

  addJournalEntry: (category, message, portName) => set((state) => ({
    journalEntries: [...state.journalEntries, {
      id: generateId(),
      day: state.dayCount,
      timeOfDay: state.timeOfDay,
      category,
      message,
      portName,
      notes: [],
    }]
  })),

  addJournalNote: (entryId, text) => set((state) => ({
    journalEntries: state.journalEntries.map(e =>
      e.id === entryId
        ? { ...e, notes: [...e.notes, { id: generateId(), text, timestamp: Date.now() }] }
        : e
    )
  })),
  
  setActivePort: (port) => set({ activePort: port }),
  
  buyCommodity: (commodity, amount) => {
    const state = get();
    const port = state.activePort;
    if (!port) return;

    const price = port.prices[commodity];
    const totalCost = price * amount;

    const currentCargoAmount = Object.values(state.cargo).reduce((a, b) => a + b, 0);
    if (currentCargoAmount + amount > state.stats.cargoCapacity) {
      get().addNotification('Not enough cargo space!', 'warning');
      return;
    }

    if (state.gold >= totalCost && port.inventory[commodity] >= amount) {
      set({
        gold: state.gold - totalCost,
        cargo: { ...state.cargo, [commodity]: state.cargo[commodity] + amount },
        activePort: {
          ...port,
          inventory: { ...port.inventory, [commodity]: port.inventory[commodity] - amount }
        },
        ports: state.ports.map(p => p.id === port.id ? {
          ...p,
          inventory: { ...p.inventory, [commodity]: p.inventory[commodity] - amount }
        } : p)
      });
      get().addNotification(`Bought ${amount} ${commodity} for ${totalCost} gold.`, 'success');
      get().addJournalEntry('commerce', commerceBuyTemplate(commodity, amount, totalCost, port.name), port.name);
    } else {
      get().addNotification('Not enough gold or port inventory!', 'error');
    }
  },
  
  sellCommodity: (commodity, amount) => {
    const state = get();
    const port = state.activePort;
    if (!port) return;

    if (state.cargo[commodity] >= amount) {
      const price = Math.floor(port.prices[commodity] * 0.8);
      const totalGain = price * amount;

      set({
        gold: state.gold + totalGain,
        cargo: { ...state.cargo, [commodity]: state.cargo[commodity] - amount },
        activePort: {
          ...port,
          inventory: { ...port.inventory, [commodity]: port.inventory[commodity] + amount }
        },
        ports: state.ports.map(p => p.id === port.id ? {
          ...p,
          inventory: { ...p.inventory, [commodity]: p.inventory[commodity] + amount }
        } : p)
      });
      get().addNotification(`Sold ${amount} ${commodity} for ${totalGain} gold.`, 'success');
      get().addJournalEntry('commerce', commerceSellTemplate(commodity, amount, totalGain, port.name), port.name);
    }
  },
  
  advanceTime: (delta) => set((state) => {
    const newTime = state.timeOfDay + delta;
    const wrapped = newTime >= 24;
    return {
      timeOfDay: newTime % 24,
      dayCount: wrapped ? state.dayCount + 1 : state.dayCount,
    };
  }),
  
  setCameraZoom: (zoom) => set({ cameraZoom: Math.max(10, Math.min(150, zoom)) }),
  
  setWorldSeed: (seed) => set({ worldSeed: seed }),
  setPaused: (paused) => set({ paused }),
  initWorld: (ports) => set({ ports })
}));
