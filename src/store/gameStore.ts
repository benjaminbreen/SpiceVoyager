import { create } from 'zustand';
import {
  commerceBuyTemplate, commerceSellTemplate, shipDamageTemplate,
  shipRepairTemplate, portDiscoverTemplate, tavernTemplate,
} from '../utils/journalTemplates';
import { generateStartingCrew } from '../utils/crewGenerator';
import { sfxCrabCollect, sfxDiscovery } from '../audio/SoundEffects';
import { audioManager } from '../audio/AudioManager';
import { rollLoot, playLootSfx, CRAB_LOOT } from '../utils/lootRoll';
import { NPCShipIdentity } from '../utils/npcShipGenerator';
import type { OceanEncounterDef } from '../utils/oceanEncounters';
import type { FishType } from '../utils/fishTypes';
import type { WaterPaletteSetting } from '../utils/waterPalettes';
import { canDirectlySail, estimateSeaTravel, getWorldPortById, resolveCampaignPortId } from '../utils/worldPorts';
import {
  syncLiveShipTransform,
  syncLiveWalkingTransform,
} from '../utils/livePlayerTransform';

export type Commodity = 'Spices' | 'Silk' | 'Tea' | 'Wood' | 'Cannonballs';

export type Culture = 'Indian Ocean' | 'European' | 'Caribbean';
export type PortScale = 'Small' | 'Medium' | 'Large' | 'Very Large';

export type BuildingType = 'dock' | 'warehouse' | 'fort' | 'estate' | 'house' | 'farmhouse' | 'shack' | 'market' | 'road';

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

// ── Armament system ──
// Period-appropriate weapons for c. 1612 Indian Ocean trade:
//   Swivel guns (verso/falconet): small anti-personnel, mounted on rail, aimed by hand.
//     Starting weapon. Range ~50m. Low damage. Can aim with hold-spacebar.
//   Demi-culverin: medium cannon, ~9 lb shot. Common on English/Dutch armed merchantmen.
//   Saker: lighter cannon (~5 lb), fast reload, good range. Portuguese favorite.
//   Minion: small cannon (~4 lb). Cheap, light, good for pinnaces.
//   Demi-cannon: heavy (~32 lb). Galleon-class only. Devastating but slow, heavy.
//   Basilisk: rare Portuguese bronze long gun. Extreme range.
// Future: purchasable at different ports (culverins in Surat, sakers in Goa,
//   basilisks rare in Lisbon-connected ports, etc.)
export type WeaponType = 'swivelGun' | 'minion' | 'saker' | 'demiCulverin' | 'demiCannon' | 'basilisk';

export interface Weapon {
  type: WeaponType;
  name: string;
  damage: number;      // base damage per hit
  range: number;       // effective range in world units
  reloadTime: number;  // seconds between shots
  weight: number;      // cargo capacity cost
  aimable: boolean;    // true = swivel-style, aim with cursor; false = broadside only
}

export const WEAPON_DEFS: Record<WeaponType, Weapon> = {
  swivelGun:    { type: 'swivelGun',    name: 'Swivel Gun',    damage: 5,  range: 8,  reloadTime: 2,  weight: 1,  aimable: true },
  minion:       { type: 'minion',       name: 'Minion',        damage: 10, range: 14, reloadTime: 5,  weight: 3,  aimable: false },
  saker:        { type: 'saker',        name: 'Saker',         damage: 12, range: 18, reloadTime: 6,  weight: 4,  aimable: false },
  demiCulverin: { type: 'demiCulverin', name: 'Demi-Culverin', damage: 18, range: 16, reloadTime: 8,  weight: 6,  aimable: false },
  demiCannon:   { type: 'demiCannon',   name: 'Demi-Cannon',   damage: 30, range: 12, reloadTime: 12, weight: 10, aimable: false },
  basilisk:     { type: 'basilisk',     name: 'Basilisk',      damage: 22, range: 24, reloadTime: 10, weight: 8,  aimable: false },
};

export interface ShipStats {
  hull: number;
  maxHull: number;
  sails: number;
  maxSails: number;
  speed: number;
  turnSpeed: number;
  cargoCapacity: number;
  cannons: number;       // broadside cannon count (0 = no broadsides)
  armament: WeaponType[]; // all mounted weapons
}

export type CrewRole = 'Captain' | 'Navigator' | 'Gunner' | 'Sailor' | 'Factor' | 'Surgeon';
export type HealthFlag = 'healthy' | 'sick' | 'injured' | 'scurvy' | 'fevered';
export type Nationality =
  | 'English' | 'Portuguese' | 'Dutch' | 'Spanish' | 'French' | 'Danish'
  | 'Mughal' | 'Gujarati' | 'Persian' | 'Ottoman' | 'Omani'
  | 'Swahili'
  | 'Malay' | 'Acehnese' | 'Javanese' | 'Moluccan'
  | 'Siamese' | 'Japanese' | 'Chinese';
export type CaptainTrait =
  | 'Silver Tongue'   // better prices at port
  | 'Iron Will'       // slower morale decay
  | 'Sea Legs'        // faster sailing speed
  | 'Keen Eye'        // discovers ports from further away
  | 'Battle Hardened' // reduced hull damage
  | 'Lucky Star';     // random bonus events

export type CrewQuality = 'dud' | 'normal' | 'rare' | 'legendary';

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
  quality: CrewQuality;
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
  type: 'info' | 'success' | 'warning' | 'error' | 'legendary';
  size?: 'normal' | 'grand';
  subtitle?: string;
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

export interface FishShoalEntry {
  center: [number, number, number];
  fishType: FishType;
  startIdx: number;
  count: number;        // current fish count (depletes on catch)
  maxCount: number;     // original count (for respawn)
  lastFished: number;   // timestamp of last catch (0 = never fished)
  scattered: boolean;   // temporarily depleted
}

export interface RenderDebugSettings {
  showDevPanel: boolean;
  minimap: boolean;
  shadows: boolean;
  postprocessing: boolean;
  bloom: boolean;
  vignette: boolean;
  advancedWater: boolean;
  shipWake: boolean;
  bowFoam: boolean;
  algae: boolean;
  wildlifeMotion: boolean;
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
  viewMode: 'default' | 'cinematic' | 'topdown' | 'firstperson';
  cycleViewMode: () => void;
  
  // New state for walking
  playerMode: 'ship' | 'walking';
  walkingPos: [number, number, number];
  walkingRot: number;
  interactionPrompt: string | null;
  discoveredPorts: string[];
  npcPositions: [number, number, number][];
  npcShips: NPCShipIdentity[];
  oceanEncounters: OceanEncounterDef[];
  fishShoals: FishShoalEntry[];
  fishNetCooldown: number; // seconds remaining before next auto/manual catch

  // Journal
  journalEntries: JournalEntry[];
  dayCount: number;

  // Wind
  windDirection: number; // radians, 0 = north, PI/2 = east
  windSpeed: number;     // 0-1 normalized

  // Provisions (food/supplies for crew)
  provisions: number;

  // Game over
  gameOver: boolean;
  gameOverCause: string;
  triggerGameOver: (cause: string) => void;

  // World
  worldSeed: number;
  worldSize: number;
  devSoloPort: string | null;
  currentWorldPortId: string | null;
  waterPaletteSetting: WaterPaletteSetting;
  renderDebug: RenderDebugSettings;
  paused: boolean;
  anchored: boolean;
  combatMode: boolean;

  setPlayerPos: (pos: [number, number, number]) => void;
  setPlayerRot: (rot: number) => void;
  setPlayerVelocity: (vel: number) => void;
  setPlayerTransform: (transform: {
    pos: [number, number, number];
    rot: number;
    vel: number;
  }) => void;
  setPlayerMode: (mode: 'ship' | 'walking') => void;
  setWalkingPos: (pos: [number, number, number]) => void;
  setWalkingRot: (rot: number) => void;
  setWalkingTransform: (transform: {
    pos: [number, number, number];
    rot: number;
  }) => void;
  setInteractionPrompt: (prompt: string | null) => void;
  discoverPort: (id: string) => void;
  setNpcPositions: (positions: [number, number, number][]) => void;
  setNpcShips: (ships: NPCShipIdentity[]) => void;
  setOceanEncounters: (encounters: OceanEncounterDef[]) => void;
  setFishShoals: (shoals: FishShoalEntry[]) => void;
  scatterShoal: (shoalIdx: number) => void;
  tickFishRespawn: () => void;
  damageShip: (amount: number) => void;
  repairShip: (amount: number, cost: number) => void;
  setCrewRole: (crewId: string, role: CrewRole) => void;
  
  addNotification: (message: string, type?: Notification['type'], opts?: { size?: 'normal' | 'grand'; subtitle?: string }) => void;
  removeNotification: (id: string) => void;
  addJournalEntry: (category: JournalCategory, message: string, portName?: string) => void;
  addJournalNote: (entryId: string, text: string) => void;
  setActivePort: (port: Port | null) => void;
  buyCommodity: (commodity: Commodity, amount: number) => void;
  sellCommodity: (commodity: Commodity, amount: number) => void;
  advanceTime: (delta: number) => void;
  setCameraZoom: (zoom: number) => void;
  setViewMode: (mode: 'default' | 'cinematic' | 'topdown' | 'firstperson') => void;
  setWorldSeed: (seed: number) => void;
  setWorldSize: (size: number) => void;
  setDevSoloPort: (portId: string | null) => void;
  setWaterPaletteSetting: (setting: WaterPaletteSetting) => void;
  updateRenderDebug: (patch: Partial<RenderDebugSettings>) => void;
  resetRenderDebug: () => void;
  collectCrab: () => void;
  fastTravel: (portId: string) => void;
  setPaused: (paused: boolean) => void;
  setAnchored: (anchored: boolean) => void;
  setCombatMode: (combatMode: boolean) => void;
  initWorld: (ports: Port[]) => void;
}

const generateId = () => Math.random().toString(36).substring(2, 9);

const DEFAULT_RENDER_DEBUG: RenderDebugSettings = {
  showDevPanel: false,
  minimap: true,
  shadows: false,
  postprocessing: true,
  bloom: true,
  vignette: true,
  advancedWater: true,
  shipWake: true,
  bowFoam: true,
  algae: true,
  wildlifeMotion: true,
};

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
    cannons: 0,
    armament: ['swivelGun'],
  },
  crew: generateStartingCrew('English', 6),
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
  viewMode: 'default',
  cycleViewMode: () => set((state) => {
    const modes: Array<'default' | 'cinematic' | 'topdown' | 'firstperson'> = ['default', 'cinematic', 'topdown', 'firstperson'];
    const idx = modes.indexOf(state.viewMode);
    return { viewMode: modes[(idx + 1) % modes.length] };
  }),
  playerMode: 'ship',
  walkingPos: [0, 5, 0],
  walkingRot: 0,
  interactionPrompt: null,
  discoveredPorts: [],
  npcPositions: [],
  npcShips: [],
  oceanEncounters: [],
  fishShoals: [],
  fishNetCooldown: 0,
  journalEntries: [],
  dayCount: 1,
  windDirection: Math.PI * 0.75, // start SW
  windSpeed: 0.5,
  provisions: 30, // starting food supply
  worldSeed: Math.floor(Math.random() * 100000),
  worldSize: 300,
  devSoloPort: null,
  currentWorldPortId: null,
  waterPaletteSetting: 'auto',
  renderDebug: DEFAULT_RENDER_DEBUG,
  paused: false,
  anchored: false,
  combatMode: false,
  gameOver: false,
  gameOverCause: '',

  setPlayerPos: (pos) => {
    const state = get();
    syncLiveShipTransform(pos, state.playerRot, state.playerVelocity);
    set({ playerPos: pos });
  },
  setPlayerRot: (rot) => {
    const state = get();
    syncLiveShipTransform(state.playerPos, rot, state.playerVelocity);
    set({ playerRot: rot });
  },
  setPlayerVelocity: (vel) => {
    const state = get();
    syncLiveShipTransform(state.playerPos, state.playerRot, vel);
    set({ playerVelocity: vel });
  },
  setPlayerTransform: ({ pos, rot, vel }) => {
    syncLiveShipTransform(pos, rot, vel);
    set({
      playerPos: pos,
      playerRot: rot,
      playerVelocity: vel,
    });
  },
  setPlayerMode: (mode) => set({ playerMode: mode }),
  setWalkingPos: (pos) => {
    const state = get();
    syncLiveWalkingTransform(pos, state.walkingRot);
    set({ walkingPos: pos });
  },
  setWalkingRot: (rot) => {
    const state = get();
    syncLiveWalkingTransform(state.walkingPos, rot);
    set({ walkingRot: rot });
  },
  setWalkingTransform: ({ pos, rot }) => {
    syncLiveWalkingTransform(pos, rot);
    set({
      walkingPos: pos,
      walkingRot: rot,
    });
  },
  setInteractionPrompt: (prompt) => set({ interactionPrompt: prompt }),
  setNpcPositions: (positions) => set({ npcPositions: positions }),
  setNpcShips: (ships) => set({ npcShips: ships }),
  setOceanEncounters: (encounters) => set({ oceanEncounters: encounters }),
  setFishShoals: (shoals) => set({ fishShoals: shoals }),
  scatterShoal: (shoalIdx) => set((state) => ({
    fishShoals: state.fishShoals.map((s, i) =>
      i === shoalIdx ? { ...s, scattered: true, lastFished: Date.now(), count: Math.max(0, s.count - Math.ceil(s.maxCount * 0.6)) } : s
    ),
  })),
  tickFishRespawn: () => {
    const state = get();
    if (!state.fishShoals.some((shoal) => shoal.scattered && shoal.lastFished > 0)) return;
    const now = Date.now();
    const RESPAWN_MS = 60_000; // 60 real-time seconds
    let changed = false;
    const updated = state.fishShoals.map((s) => {
      if (s.scattered && s.lastFished > 0 && now - s.lastFished > RESPAWN_MS) {
        changed = true;
        return { ...s, scattered: false, count: s.maxCount };
      }
      return s;
    });
    if (changed) set({ fishShoals: updated });
  },

  damageShip: (amount) => {
    const state = get();
    const newHull = Math.max(0, state.stats.hull - amount);
    // Crew morale drops by 1 each time the hull takes damage
    const updatedCrew = state.crew.map(c => ({
      ...c,
      morale: Math.max(0, c.morale - 1),
    }));
    set({ stats: { ...state.stats, hull: newHull }, crew: updatedCrew });
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
        sfxDiscovery();
      }
    }
  },
  
  addNotification: (message, type = 'info', opts) => set((state) => ({
    notifications: [...state.notifications, {
      id: generateId(), message, type, timestamp: Date.now(),
      size: opts?.size, subtitle: opts?.subtitle,
    }].slice(-5)
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

    // Wind drifts slowly over time using sine waves at different frequencies
    // for a natural, non-random feel that still varies
    const t = state.dayCount + newTime / 24;
    const dirDrift = Math.sin(t * 0.7) * 0.3 + Math.sin(t * 1.9) * 0.15 + Math.sin(t * 4.3) * 0.05;
    const newWindDir = (state.windDirection + dirDrift * delta * 0.02) % (Math.PI * 2);

    // Speed oscillates between 0.15 and 0.95
    const speedBase = 0.55 + Math.sin(t * 0.5) * 0.25 + Math.sin(t * 1.7) * 0.1 + Math.sin(t * 3.1) * 0.05;
    const newWindSpeed = Math.max(0.1, Math.min(1, speedBase));

    return {
      timeOfDay: newTime % 24,
      dayCount: wrapped ? state.dayCount + 1 : state.dayCount,
      windDirection: newWindDir < 0 ? newWindDir + Math.PI * 2 : newWindDir,
      windSpeed: newWindSpeed,
    };
  }),
  
  setCameraZoom: (zoom) => set({ cameraZoom: Math.max(10, Math.min(150, zoom)) }),
  setViewMode: (mode) => set({ viewMode: mode }),
  
  setWorldSeed: (seed) => set({ worldSeed: seed, currentWorldPortId: null }),
  setWorldSize: (size) => set({ worldSize: size }),
  setDevSoloPort: (portId) => set({ devSoloPort: portId }),
  setWaterPaletteSetting: (setting) => set({ waterPaletteSetting: setting }),
  updateRenderDebug: (patch) => set((state) => ({
    renderDebug: { ...state.renderDebug, ...patch }
  })),
  resetRenderDebug: () => set({ renderDebug: DEFAULT_RENDER_DEBUG }),
  collectCrab: () => {
    const state = get();
    const loot = rollLoot(CRAB_LOOT);
    set({ provisions: state.provisions + loot.amount });
    get().addNotification(loot.message, loot.type, {
      size: loot.toastSize,
      subtitle: loot.toastSubtitle,
    });
    sfxCrabCollect();
    playLootSfx(loot.tier);
  },
  fastTravel: (portId) => {
    const state = get();
    const port = getWorldPortById(portId);
    if (!port) return;
    const currentPortId = resolveCampaignPortId(state);
    if (portId === currentPortId) return;
    if (!canDirectlySail(currentPortId, portId)) {
      get().addNotification(`No direct sea lane to ${port.name} from this harbor.`, 'warning');
      return;
    }
    const travel = estimateSeaTravel(currentPortId, portId);
    const travelDays = travel?.days ?? 1;
    set({
      currentWorldPortId: portId,
      playerVelocity: 0,
      playerMode: 'ship',
      activePort: null,
      interactionPrompt: null,
      dayCount: state.dayCount + travelDays,
      timeOfDay: 8, // arrive in the morning
    });
    syncLiveShipTransform(state.playerPos, state.playerRot, 0);
    get().addNotification(`Arrived at ${port.name} after ${travelDays} days at sea.`, 'success');
    get().addJournalEntry(
      'navigation',
      `After ${travelDays} days sailing, we have arrived at ${port.name}. The crew is relieved to see land again.`,
      port.name,
    );
  },
  setPaused: (paused) => set({ paused }),
  setAnchored: (anchored) => set({ anchored }),
  setCombatMode: (combatMode) => set({ combatMode }),
  triggerGameOver: (cause) => {
    set({ gameOver: true, gameOverCause: cause, paused: true });
    audioManager.stopAll();
  },
  initWorld: (ports) => set((state) => ({
    ports,
    discoveredPorts: Array.from(new Set([...state.discoveredPorts, ...ports.map((port) => port.id)])),
  }))
}));
