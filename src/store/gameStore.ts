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
import {
  type Commodity, ALL_COMMODITIES, COMMODITY_DEFS,
  supplyDemandModifier, generateStartingCargo,
} from '../utils/commodities';

export type { Commodity } from '../utils/commodities';

// Map port IDs to their controlling nationality for reputation
export const PORT_FACTION: Record<string, Nationality> = {
  calicut: 'Gujarati',   // Zamorin kingdom, trade dominated by Gujarati & Mappila merchants
  goa: 'Portuguese',
  hormuz: 'Portuguese',  // Portuguese-occupied
  malacca: 'Portuguese',
  aden: 'Ottoman',
  zanzibar: 'Portuguese', // nominal Portuguese control
  macau: 'Portuguese',
  mombasa: 'Portuguese',
  surat: 'Mughal',
  muscat: 'Portuguese',  // Portuguese fort
  aceh: 'Acehnese',
  bantam: 'Javanese',
  cochin: 'Portuguese',
  mogadishu: 'Swahili',
  kilwa: 'Swahili',
  socotra: 'Portuguese',
  diu: 'Portuguese',        // key Portuguese fortress off Gujarat
};

export type Culture = 'Indian Ocean' | 'European' | 'Caribbean';
export type PortScale = 'Small' | 'Medium' | 'Large' | 'Very Large';

export type BuildingType = 'dock' | 'warehouse' | 'fort' | 'estate' | 'house' | 'farmhouse' | 'shack' | 'market';

export interface Building {
  id: string;
  type: BuildingType;
  position: [number, number, number];
  rotation: number;
  scale: [number, number, number];
  label?: string;
  labelSub?: string;
}

export interface Port {
  id: string;
  name: string;
  culture: Culture;
  scale: PortScale;
  position: [number, number, number];
  inventory: Record<Commodity, number>;
  baseInventory: Record<Commodity, number>; // initial stock levels for supply/demand calc
  basePrices: Record<Commodity, number>;    // base prices before supply/demand adjustment
  prices: Record<Commodity, number>;        // current effective prices
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
  swivelGun:    { type: 'swivelGun',    name: 'Swivel Gun',    damage: 5,  range: 8,  reloadTime: 0.5,  weight: 1,  aimable: true },
  minion:       { type: 'minion',       name: 'Minion',        damage: 10, range: 14, reloadTime: 5,  weight: 3,  aimable: false },
  saker:        { type: 'saker',        name: 'Saker',         damage: 12, range: 18, reloadTime: 6,  weight: 4,  aimable: false },
  demiCulverin: { type: 'demiCulverin', name: 'Demi-Culverin', damage: 18, range: 16, reloadTime: 8,  weight: 6,  aimable: false },
  demiCannon:   { type: 'demiCannon',   name: 'Demi-Cannon',   damage: 30, range: 12, reloadTime: 12, weight: 10, aimable: false },
  basilisk:     { type: 'basilisk',     name: 'Basilisk',      damage: 22, range: 24, reloadTime: 10, weight: 8,  aimable: false },
};

// ── Weapon prices & availability ──
// Prices in gold. Not every port sells every weapon.
export const WEAPON_PRICES: Record<WeaponType, number> = {
  swivelGun:    40,
  minion:       80,
  saker:        120,
  demiCulverin: 200,
  demiCannon:   350,
  basilisk:     500,
};

// Which weapon types each port sells (by port id).
// Ports not listed sell only minions and swivelGuns.
export const PORT_ARMORY: Record<string, WeaponType[]> = {
  goa:      ['swivelGun', 'minion', 'saker', 'demiCulverin', 'basilisk'],  // Portuguese arsenal
  malacca:  ['swivelGun', 'minion', 'saker', 'demiCulverin'],
  hormuz:   ['swivelGun', 'minion', 'saker'],
  surat:    ['swivelGun', 'minion', 'demiCulverin', 'demiCannon'],         // Mughal heavy guns
  cochin:   ['swivelGun', 'minion', 'saker', 'demiCulverin'],
  macau:    ['swivelGun', 'minion', 'saker', 'demiCannon'],
  bantam:   ['swivelGun', 'minion', 'saker'],
  mombasa:  ['swivelGun', 'minion', 'saker'],
  muscat:   ['swivelGun', 'minion'],
  aceh:     ['swivelGun', 'minion', 'saker'],
  aden:     ['swivelGun', 'minion', 'demiCulverin'],
  zanzibar: ['swivelGun', 'minion'],
  calicut:  ['swivelGun', 'minion'],
  socotra:  ['swivelGun', 'minion'],                                         // remote outpost, minimal arms
  diu:      ['swivelGun', 'minion', 'saker', 'demiCulverin', 'demiCannon'],  // major Portuguese fortress
};
const DEFAULT_PORT_ARMORY: WeaponType[] = ['swivelGun', 'minion'];

export function getPortArmory(portId: string): WeaponType[] {
  return PORT_ARMORY[portId] ?? DEFAULT_PORT_ARMORY;
}

// Max broadside cannons based on ship type
const MAX_CANNONS: Record<string, number> = {
  Pinnace: 4,
  Dhow: 4,
  Junk: 6,
  Carrack: 8,
  Galleon: 12,
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
export type Language =
  | 'Arabic' | 'Persian' | 'Gujarati' | 'Hindustani'
  | 'Portuguese' | 'Dutch' | 'English' | 'Spanish' | 'French'
  | 'Turkish' | 'Malay' | 'Swahili' | 'Chinese' | 'Japanese';
export type CaptainTrait =
  | 'Silver Tongue'   // better prices at port
  | 'Iron Will'       // slower morale decay
  | 'Sea Legs'        // faster sailing speed
  | 'Keen Eye'        // discovers ports from further away
  | 'Battle Hardened' // reduced hull damage
  | 'Lucky Star';     // random bonus events

export type CrewQuality = 'dud' | 'normal' | 'rare' | 'legendary';

export interface CrewStats {
  strength: number;    // 1-20, physical power — boarding, repairs, hauling
  perception: number;  // 1-20, awareness — navigation, spotting, fishing
  charisma: number;    // 1-20, social — trading, morale, diplomacy
  luck: number;        // 1-20, fortune — random events, loot, survival
}

export interface CrewHistoryEntry {
  day: number;         // game day count
  event: string;       // short description
}

export interface CrewMember {
  id: string;
  name: string;
  role: CrewRole;
  skill: number;       // 1-100
  morale: number;      // 1-100
  age: number;
  nationality: Nationality;
  languages: Language[];
  birthplace: string;
  health: HealthFlag;
  quality: CrewQuality;
  stats: CrewStats;
  backstory: string;
  history: CrewHistoryEntry[];
  hireDay: number;     // game day when they joined the crew
  traits: CaptainTrait[];
  abilities: CaptainAbility[];
  level: number;       // 1+
  xp: number;          // current XP toward next level
  xpToNext: number;    // XP needed for next level
}

export interface ShipInfo {
  name: string;
  type: 'Carrack' | 'Galleon' | 'Dhow' | 'Junk' | 'Pinnace';
  flag: Nationality;
  armed: boolean;
}

export type CaptainAbility =
  | 'Broadside Master'   // improved cannon accuracy
  | 'Storm Rider'        // reduced storm damage
  | 'Port Diplomat'      // reputation gains doubled
  | 'Treasure Nose'      // better loot drops
  | 'Crew Whisperer'     // morale decay halved
  | 'Chart Reader';      // reveals hidden ports


export interface Notification {
  id: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error' | 'legendary';
  size?: 'normal' | 'grand';
  subtitle?: string;
  imageCandidates?: string[];
  openPortId?: string;
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
  coralReefs: boolean;
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
  nearestHailableNpc: NPCShipIdentity | null;
  discoveredPorts: string[];

  // Reputation per nationality (-100 to +100, starts at 0)
  reputation: Partial<Record<Nationality, number>>;
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

  // Crew death modal
  deadCrew: CrewMember | null; // set when a crew member dies, cleared when modal dismissed
  dismissDeadCrew: () => void;
  killCrewMember: (crewId: string, cause: string) => void;

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
  requestWorldMap: boolean;
  setRequestWorldMap: (v: boolean) => void;

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
  setNearestHailableNpc: (npc: NPCShipIdentity | null) => void;
  adjustReputation: (nationality: Nationality, delta: number) => void;
  getReputation: (nationality: Nationality) => number;
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
  addCrewHistory: (crewId: string, event: string) => void;

  addNotification: (message: string, type?: Notification['type'], opts?: { size?: 'normal' | 'grand'; subtitle?: string; imageCandidates?: string[]; openPortId?: string }) => void;
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
  buyWeapon: (weaponType: WeaponType) => void;
  sellWeapon: (weaponType: WeaponType) => void;
  defeatedNpc: (npcId: string, shipName: string, flag: Nationality, cargo: Partial<Record<Commodity, number>>) => void;
  initWorld: (ports: Port[]) => void;
}

const generateId = () => Math.random().toString(36).substring(2, 9);

const DEFAULT_RENDER_DEBUG: RenderDebugSettings = {
  showDevPanel: false,
  minimap: true,
  shadows: true,
  postprocessing: true,
  bloom: true,
  vignette: true,
  advancedWater: true,
  shipWake: true,
  bowFoam: true,
  algae: true,
  coralReefs: true,
  wildlifeMotion: true,
};

// ── Crew helper functions ──────────────────────────────────────────────
export function getCaptain(state: { crew: CrewMember[] }): CrewMember | undefined {
  return state.crew.find(c => c.role === 'Captain') ?? state.crew[0];
}

export function getCrewByRole(state: { crew: CrewMember[] }, role: CrewRole): CrewMember | undefined {
  return state.crew.find(c => c.role === role);
}

/** Returns a multiplier (1.0–1.10) based on a crew member's stat in a given role. */
export function getRoleBonus(state: { crew: CrewMember[] }, role: CrewRole, stat: keyof CrewStats): number {
  const member = getCrewByRole(state, role);
  if (!member) return 1.0;
  return 1.0 + (member.stats[stat] / 200); // stat 1→1.005, stat 10→1.05, stat 20→1.10
}

export function captainHasTrait(state: { crew: CrewMember[] }, trait: CaptainTrait): boolean {
  return getCaptain(state)?.traits.includes(trait) ?? false;
}

export function captainHasAbility(state: { crew: CrewMember[] }, ability: CaptainAbility): boolean {
  return getCaptain(state)?.abilities.includes(ability) ?? false;
}

export function updateCrewMember(
  crew: CrewMember[], id: string, updater: (m: CrewMember) => CrewMember
): CrewMember[] {
  return crew.map(c => c.id === id ? updater(c) : c);
}

// Generate crew first so we can read captain's luck for cargo generation
const _startingFaction: Nationality = 'English';
const _startingCrew = generateStartingCrew(_startingFaction, 6);
const _captainLuck = _startingCrew.find(c => c.role === 'Captain')?.stats.luck ?? 10;
const _startingCargoCapacity = 100;

export const useGameStore = create<GameState>((set, get) => ({
  playerPos: [0, 0, 0],
  playerRot: 0,
  playerVelocity: 0,
  gold: 1000,
  cargo: generateStartingCargo(_startingFaction, _startingCargoCapacity, _captainLuck),
  stats: {
    hull: 100,
    maxHull: 100,
    sails: 100,
    maxSails: 100,
    speed: 15,
    turnSpeed: 1.5,
    cargoCapacity: _startingCargoCapacity,
    cannons: 0,
    armament: ['swivelGun'],
  },
  crew: _startingCrew,
  ship: {
    name: 'The Dorada',
    type: 'Carrack',
    flag: _startingFaction,
    armed: true,
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
  nearestHailableNpc: null,
  discoveredPorts: [],
  reputation: {},
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
  worldSize: 150,
  devSoloPort: null,
  currentWorldPortId: null,
  waterPaletteSetting: 'auto',
  renderDebug: DEFAULT_RENDER_DEBUG,
  paused: false,
  anchored: false,
  combatMode: false,
  requestWorldMap: false,
  setRequestWorldMap: (v) => set({ requestWorldMap: v }),
  deadCrew: null,
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
  setNearestHailableNpc: (npc) => set({ nearestHailableNpc: npc }),
  adjustReputation: (nationality, delta) => {
    const state = get();
    const current = state.reputation[nationality] ?? 0;
    const clamped = Math.max(-100, Math.min(100, current + delta));
    const prev = current;
    set({ reputation: { ...state.reputation, [nationality]: clamped } });
    // Journal entries at reputation thresholds
    if (prev >= -25 && clamped < -25) {
      get().addJournalEntry('encounter',
        `Word has spread among the ${nationality} that we are not to be trusted. Their ships give us a wide berth.`);
    } else if (prev >= -60 && clamped < -60) {
      get().addJournalEntry('encounter',
        `The ${nationality} now regard us with open hostility. We must tread carefully in their waters.`);
    } else if (prev <= 25 && clamped > 25) {
      get().addJournalEntry('encounter',
        `We are gaining a reputation as fair dealers among the ${nationality}. Their captains greet us warmly.`);
    } else if (prev <= 60 && clamped > 60) {
      get().addJournalEntry('encounter',
        `The ${nationality} hold us in high esteem. Their harbors welcome us as trusted allies.`);
    }
  },
  getReputation: (nationality) => get().reputation[nationality] ?? 0,
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
    const reduction = captainHasTrait(state, 'Battle Hardened') ? 0.85 : 1.0;
    const effectiveAmount = Math.max(1, Math.floor(amount * reduction));
    const newHull = Math.max(0, state.stats.hull - effectiveAmount);
    // Crew morale drops by 1 each time the hull takes damage
    const updatedCrew = state.crew.map(c => ({
      ...c,
      morale: Math.max(0, c.morale - 1),
    }));
    set({ stats: { ...state.stats, hull: newHull }, crew: updatedCrew });
    get().addJournalEntry('ship', shipDamageTemplate(amount, newHull));
    // Log event to a random crew member
    if (state.crew.length > 0) {
      const witness = state.crew[Math.floor(Math.random() * state.crew.length)];
      get().addCrewHistory(witness.id, `Ship took ${amount} hull damage in an engagement`);
    }
    if (newHull <= 0) {
      get().triggerGameOver('The ship has been destroyed and sank beneath the waves.');
    }
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
  
  setCrewRole: (crewId, role) => {
    const state = get();
    const member = state.crew.find(c => c.id === crewId);
    const oldRole = member?.role;
    // If promoting to Captain, demote the current captain to Sailor
    const updatedCrew = state.crew.map(c => {
      if (c.id === crewId) return { ...c, role };
      if (role === 'Captain' && c.role === 'Captain') return { ...c, role: 'Sailor' as CrewRole };
      return c;
    });
    set({ crew: updatedCrew });
    if (member && oldRole && oldRole !== role) {
      get().addCrewHistory(crewId, `Reassigned from ${oldRole} to ${role}`);
      if (role === 'Captain') {
        const demoted = state.crew.find(c => c.role === 'Captain' && c.id !== crewId);
        if (demoted) get().addCrewHistory(demoted.id, `Demoted from Captain to Sailor`);
      }
    }
  },

  addCrewHistory: (crewId, event) => set((state) => ({
    crew: state.crew.map(c => c.id === crewId
      ? { ...c, history: [...c.history, { day: state.dayCount, event }] }
      : c
    )
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
      size: opts?.size, subtitle: opts?.subtitle, imageCandidates: opts?.imageCandidates, openPortId: opts?.openPortId,
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

    // Calculate effective price with supply/demand + crew bonuses
    const sdMod = supplyDemandModifier(port.inventory[commodity], port.baseInventory[commodity]);
    const effectiveBase = Math.max(1, Math.round(port.basePrices[commodity] * sdMod));
    const factorDiscount = getRoleBonus(state, 'Factor', 'charisma');
    const traitDiscount = captainHasTrait(state, 'Silver Tongue') ? 0.95 : 1.0;
    const price = Math.max(1, Math.floor(effectiveBase / factorDiscount * traitDiscount));
    const totalCost = price * amount;

    const commodityWeight = COMMODITY_DEFS[commodity].weight;
    const currentCargoWeight = Object.entries(state.cargo).reduce(
      (sum, [c, qty]) => sum + qty * COMMODITY_DEFS[c as Commodity].weight, 0
    );
    if (currentCargoWeight + amount * commodityWeight > state.stats.cargoCapacity) {
      get().addNotification('Not enough cargo space!', 'warning');
      return;
    }

    if (state.gold >= totalCost && port.inventory[commodity] >= amount) {
      const newInventory = { ...port.inventory, [commodity]: port.inventory[commodity] - amount };
      // Recalculate prices based on new inventory levels
      const newPrices = { ...port.prices };
      for (const c of ALL_COMMODITIES) {
        if (port.basePrices[c] > 0) {
          const mod = supplyDemandModifier(newInventory[c], port.baseInventory[c]);
          newPrices[c] = Math.max(1, Math.round(port.basePrices[c] * mod));
        }
      }
      set({
        gold: state.gold - totalCost,
        cargo: { ...state.cargo, [commodity]: state.cargo[commodity] + amount },
        activePort: { ...port, inventory: newInventory, prices: newPrices },
        ports: state.ports.map(p => p.id === port.id
          ? { ...p, inventory: newInventory, prices: newPrices }
          : p
        ),
      });
      get().addNotification(`Bought ${amount} ${commodity} for ${totalCost}g`, 'success');
      get().addJournalEntry('commerce', commerceBuyTemplate(commodity, amount, totalCost, port.name), port.name);
      const faction = PORT_FACTION[port.id];
      if (faction) get().adjustReputation(faction, 2);
      const factor = state.crew.find(c => c.role === 'Factor') ?? state.crew.find(c => c.role === 'Captain');
      if (factor) get().addCrewHistory(factor.id, `Negotiated purchase of ${amount} ${commodity} at ${port.name}`);
    } else {
      get().addNotification('Not enough gold or port inventory!', 'error');
    }
  },
  
  sellCommodity: (commodity, amount) => {
    const state = get();
    const port = state.activePort;
    if (!port) return;

    if (state.cargo[commodity] >= amount) {
      // If port doesn't stock this commodity (basePrice = 0), sell at reduced global average
      const portHasGood = port.basePrices[commodity] > 0;
      const sdMod = portHasGood
        ? supplyDemandModifier(port.inventory[commodity], port.baseInventory[commodity])
        : 1.0;
      const effectiveBase = portHasGood
        ? Math.max(1, Math.round(port.basePrices[commodity] * sdMod))
        : Math.max(1, Math.round(
            (COMMODITY_DEFS[commodity].basePrice[0] + COMMODITY_DEFS[commodity].basePrice[1]) / 2 * 0.5
          ));
      const factorBonus = getRoleBonus(state, 'Factor', 'charisma');
      const traitBonus = captainHasTrait(state, 'Silver Tongue') ? 1.05 : 1.0;
      const price = Math.max(1, Math.floor(effectiveBase * 0.8 * factorBonus * traitBonus));
      const totalGain = price * amount;

      const newInventory = { ...port.inventory, [commodity]: port.inventory[commodity] + amount };
      // Recalculate prices based on new supply levels
      const newPrices = { ...port.prices };
      for (const c of ALL_COMMODITIES) {
        if (port.basePrices[c] > 0) {
          const mod = supplyDemandModifier(newInventory[c], port.baseInventory[c]);
          newPrices[c] = Math.max(1, Math.round(port.basePrices[c] * mod));
        }
      }

      set({
        gold: state.gold + totalGain,
        cargo: { ...state.cargo, [commodity]: state.cargo[commodity] - amount },
        activePort: { ...port, inventory: newInventory, prices: newPrices },
        ports: state.ports.map(p => p.id === port.id
          ? { ...p, inventory: newInventory, prices: newPrices }
          : p
        ),
      });
      get().addNotification(`Sold ${amount} ${commodity} for ${totalGain}g`, 'success');
      get().addJournalEntry('commerce', commerceSellTemplate(commodity, amount, totalGain, port.name), port.name);
      const faction = PORT_FACTION[port.id];
      if (faction) get().adjustReputation(faction, 2);
      const factor = state.crew.find(c => c.role === 'Factor') ?? state.crew.find(c => c.role === 'Captain');
      if (factor) get().addCrewHistory(factor.id, `Sold ${amount} ${commodity} for ${totalGain}g at ${port.name}`);
    }
  },
  
  advanceTime: (delta) => {
    const state = get();
    const newTime = state.timeOfDay + delta;
    const wrapped = newTime >= 24;

    // Wind drifts slowly over time using sine waves at different frequencies
    const t = state.dayCount + newTime / 24;
    const dirDrift = Math.sin(t * 0.7) * 0.3 + Math.sin(t * 1.9) * 0.15 + Math.sin(t * 4.3) * 0.05;
    const newWindDir = (state.windDirection + dirDrift * delta * 0.02) % (Math.PI * 2);
    const speedBase = 0.55 + Math.sin(t * 0.5) * 0.25 + Math.sin(t * 1.7) * 0.1 + Math.sin(t * 3.1) * 0.05;
    const newWindSpeed = Math.max(0.1, Math.min(1, speedBase));

    set({
      timeOfDay: newTime % 24,
      dayCount: wrapped ? state.dayCount + 1 : state.dayCount,
      windDirection: newWindDir < 0 ? newWindDir + Math.PI * 2 : newWindDir,
      windSpeed: newWindSpeed,
    });

    // ── Daily tick: port restock (goods drift back toward baseline) ──
    if (wrapped) {
      const restockedPorts = state.ports.map(p => {
        let changed = false;
        const newInv = { ...p.inventory };
        for (const c of ALL_COMMODITIES) {
          const base = p.baseInventory[c as Commodity];
          if (base <= 0) continue;
          const current = newInv[c as Commodity];
          if (current < base) {
            // Restock ~3-5% of deficit per day (cheaper goods restock faster)
            const def = COMMODITY_DEFS[c as Commodity];
            const rate = def.tier <= 2 ? 0.05 : def.tier <= 3 ? 0.03 : 0.01;
            const restock = Math.max(1, Math.ceil((base - current) * rate));
            newInv[c as Commodity] = Math.min(base, current + restock);
            changed = true;
          }
        }
        if (!changed) return p;
        const newPrices = { ...p.prices };
        for (const c of ALL_COMMODITIES) {
          if (p.basePrices[c as Commodity] > 0) {
            const mod = supplyDemandModifier(newInv[c as Commodity], p.baseInventory[c as Commodity]);
            newPrices[c as Commodity] = Math.max(1, Math.round(p.basePrices[c as Commodity] * mod));
          }
        }
        return { ...p, inventory: newInv, prices: newPrices };
      });
      set({ ports: restockedPorts });
      if (state.activePort) {
        const updated = restockedPorts.find(p => p.id === state.activePort!.id);
        if (updated) set({ activePort: updated });
      }
    }

    // ── Daily tick: provisions & crew health (runs once per game-day) ──
    if (wrapped && state.crew.length > 0) {
      const crewCount = state.crew.length;
      // Each crew member eats ~0.5 provisions per day
      const dailyConsumption = Math.ceil(crewCount * 0.5);
      const hasSurgeon = state.crew.some(c => c.role === 'Surgeon' && c.health === 'healthy');
      const newProvisions = Math.max(0, state.provisions - dailyConsumption);
      const starving = newProvisions === 0;

      // Update crew health & morale
      let deadCrewId: string | null = null;
      let deadCause = '';
      const updatedCrew = state.crew.map(c => {
        if (deadCrewId) return c; // only one death per day

        let { health, morale } = c;

        // Starvation effects
        if (starving) {
          morale = Math.max(0, morale - 3);
          // Healthy crew get scurvy; already-sick crew worsen
          if (health === 'healthy' && Math.random() < 0.15) {
            health = 'scurvy';
          } else if (health === 'scurvy' && Math.random() < 0.12) {
            health = 'fevered';
          }
        }

        // Sick/injured crew degrade over time (even with food)
        if (health === 'fevered' && Math.random() < 0.08) {
          deadCrewId = c.id;
          deadCause = 'A burning fever took hold and would not break.';
          return c;
        }
        if (health === 'scurvy' && starving && Math.random() < 0.04) {
          deadCrewId = c.id;
          deadCause = 'Weakened by scurvy and starvation, the sea claimed another.';
          return c;
        }

        // Surgeon heals one sick crew member per day (not starvation-related)
        if (hasSurgeon && health !== 'healthy' && !starving && Math.random() < 0.2) {
          health = 'healthy';
        }

        // Natural morale recovery when well-fed and healthy
        if (!starving && health === 'healthy') {
          morale = Math.min(100, morale + 1);
        }

        // Zero morale + sick = death risk
        if (morale === 0 && health !== 'healthy' && Math.random() < 0.06) {
          deadCrewId = c.id;
          deadCause = 'Broken in spirit and wracked by illness, he could endure no more.';
          return c;
        }

        return { ...c, health, morale };
      });

      set({ provisions: newProvisions, crew: updatedCrew });

      // Starvation warning
      if (starving && state.provisions > 0) {
        get().addNotification('Provisions exhausted! The crew goes hungry.', 'error');
      } else if (newProvisions > 0 && newProvisions <= crewCount * 2) {
        get().addNotification(`Provisions running low (${newProvisions} remaining).`, 'warning');
      }

      // Process death (after state update so modal shows correctly)
      if (deadCrewId) {
        // Use setTimeout to avoid nested set() issues
        setTimeout(() => get().killCrewMember(deadCrewId!, deadCause), 0);
      }
    }
  },
  
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
    // Consume provisions for the journey
    const dailyConsumption = Math.ceil(state.crew.length * 0.5);
    const travelProvisions = dailyConsumption * travelDays;
    const newProvisions = Math.max(0, state.provisions - travelProvisions);
    set({
      currentWorldPortId: portId,
      playerVelocity: 0,
      playerMode: 'ship',
      activePort: null,
      interactionPrompt: null,
      dayCount: state.dayCount + travelDays,
      timeOfDay: 8,
      provisions: newProvisions,
    });
    syncLiveShipTransform(state.playerPos, state.playerRot, 0);
    const provWarn = newProvisions === 0 ? ' Provisions exhausted!' : newProvisions <= state.crew.length * 2 ? ` Provisions low (${newProvisions}).` : '';
    get().addNotification(`Arrived at ${port.name} after ${travelDays} days at sea.${provWarn}`, newProvisions === 0 ? 'warning' : 'success');
    get().addJournalEntry(
      'navigation',
      `After ${travelDays} days sailing, we have arrived at ${port.name}. The crew is relieved to see land again.`,
      port.name,
    );
  },
  setPaused: (paused) => set({ paused }),
  setAnchored: (anchored) => set({ anchored }),
  setCombatMode: (combatMode) => set({ combatMode }),
  buyWeapon: (weaponType) => {
    const state = get();
    const price = WEAPON_PRICES[weaponType];
    const def = WEAPON_DEFS[weaponType];
    if (state.gold < price) {
      get().addNotification('Not enough gold!', 'warning');
      return;
    }
    // Check max cannon slots
    const broadsideCount = state.stats.armament.filter(w => !WEAPON_DEFS[w].aimable).length;
    const maxCannons = MAX_CANNONS[state.ship.type] ?? 6;
    if (!def.aimable && broadsideCount >= maxCannons) {
      get().addNotification(`No room! ${state.ship.type} can mount ${maxCannons} broadside guns max.`, 'warning');
      return;
    }
    // Check cargo weight
    const currentWeight = state.stats.armament.reduce((sum, w) => sum + WEAPON_DEFS[w].weight, 0);
    if (currentWeight + def.weight > state.stats.cargoCapacity * 0.5) {
      get().addNotification('Too heavy — guns would overload the ship.', 'warning');
      return;
    }
    const newArmament = [...state.stats.armament, weaponType];
    const newCannons = newArmament.filter(w => !WEAPON_DEFS[w].aimable).length;
    set({
      gold: state.gold - price,
      stats: { ...state.stats, armament: newArmament, cannons: newCannons },
    });
    get().addNotification(`Mounted a ${def.name}. (${newCannons} broadside guns)`, 'success');
    get().addJournalEntry('ship', `Purchased and mounted a ${def.name} at the shipyard for ${price} gold.`);
  },
  sellWeapon: (weaponType) => {
    const state = get();
    const idx = state.stats.armament.indexOf(weaponType);
    if (idx === -1) return;
    // Can't sell your only swivel gun
    if (weaponType === 'swivelGun' && state.stats.armament.filter(w => w === 'swivelGun').length <= 1) {
      get().addNotification("Can't sell your only swivel gun!", 'warning');
      return;
    }
    const sellPrice = Math.floor(WEAPON_PRICES[weaponType] * 0.5);
    const newArmament = [...state.stats.armament];
    newArmament.splice(idx, 1);
    const newCannons = newArmament.filter(w => !WEAPON_DEFS[w].aimable).length;
    set({
      gold: state.gold + sellPrice,
      stats: { ...state.stats, armament: newArmament, cannons: newCannons },
    });
    get().addNotification(`Sold a ${WEAPON_DEFS[weaponType].name} for ${sellPrice} gold.`, 'success');
  },
  defeatedNpc: (npcId, shipName, flag, npcCargo) => {
    const state = get();
    // Gold reward based on cargo value
    const goldReward = 50 + Math.floor(Math.random() * 100);
    // Transfer salvageable cargo (30-60% of each commodity)
    const currentCargo = { ...state.cargo };
    const currentTotal = Object.values(currentCargo).reduce((a, b) => a + b, 0);
    const capacity = state.stats.cargoCapacity;
    const salvaged: string[] = [];
    for (const [comm, qty] of Object.entries(npcCargo)) {
      if (qty && qty > 0) {
        const salvageAmt = Math.max(1, Math.floor(qty * (0.3 + Math.random() * 0.3)));
        const spaceLeft = capacity - (currentTotal + salvaged.length);
        const taken = Math.min(salvageAmt, spaceLeft);
        if (taken > 0) {
          currentCargo[comm as Commodity] = (currentCargo[comm as Commodity] || 0) + taken;
          salvaged.push(`${taken} ${comm}`);
        }
      }
    }
    // XP reward — awarded to the captain crew member
    const xpGain = 20 + Math.floor(Math.random() * 30);
    const captain = getCaptain(state);
    let updatedCrew = state.crew;
    let levelUpLevel = 0;
    if (captain) {
      const newXp = captain.xp + xpGain;
      const levelUp = newXp >= captain.xpToNext;
      updatedCrew = updateCrewMember(state.crew, captain.id, (c) =>
        levelUp
          ? { ...c, xp: newXp - c.xpToNext, level: c.level + 1, xpToNext: Math.floor(c.xpToNext * 1.5) }
          : { ...c, xp: newXp }
      );
      if (levelUp) levelUpLevel = captain.level + 1;
    }

    set({ gold: state.gold + goldReward, cargo: currentCargo, crew: updatedCrew });
    // Remove from npcShips
    set((s) => ({ npcShips: s.npcShips.filter(n => n.id !== npcId) }));
    // Notifications
    const salvagedStr = salvaged.length > 0 ? ` Salvaged: ${salvaged.join(', ')}.` : '';
    get().addNotification(`Sank the ${shipName}! +${goldReward} gold.${salvagedStr}`, 'success', { size: 'grand', subtitle: 'SHIP DEFEATED' });
    if (levelUpLevel) get().addNotification(`Captain leveled up to level ${levelUpLevel}!`, 'legendary', { size: 'grand', subtitle: 'LEVEL UP' });
    // Journal
    get().addJournalEntry('encounter',
      `After a fierce exchange, the ${flag} vessel ${shipName} slipped beneath the waves. We recovered ${goldReward} gold${salvagedStr ? ' and' + salvagedStr.toLowerCase() : ''}.`);
    // Major reputation hit with that faction
    get().adjustReputation(flag, -25);
    // Crew history
    const gunner = state.crew.find(c => c.role === 'Gunner') ?? state.crew[0];
    if (gunner) get().addCrewHistory(gunner.id, `Helped sink the ${flag} ${shipName}`);
  },
  dismissDeadCrew: () => set({ deadCrew: null }),
  killCrewMember: (crewId, cause) => {
    const state = get();
    const member = state.crew.find(c => c.id === crewId);
    if (!member) return;
    // Freeze the member snapshot for the death modal before removing
    const snapshot = { ...member, history: [...member.history, { day: state.dayCount, event: cause }] };
    const remaining = state.crew.filter(c => c.id !== crewId);
    // Morale hit for all surviving crew
    const moraleHit = member.role === 'Captain' ? 15 : 5;
    const updatedCrew = remaining.map(c => ({
      ...c,
      morale: Math.max(0, c.morale - moraleHit),
    }));
    set({ crew: updatedCrew, deadCrew: snapshot, paused: true });
    get().addJournalEntry('crew',
      `${member.name}, our ${member.role.toLowerCase()}, has perished. ${cause} The crew is shaken.`,
    );
    // If captain dies, promote best crew member
    if (member.role === 'Captain' && updatedCrew.length > 0) {
      const best = [...updatedCrew].sort((a, b) => b.skill - a.skill)[0];
      get().setCrewRole(best.id, 'Captain');
      get().addNotification(`${best.name} has been promoted to Captain.`, 'warning');
    }
    // Game over if no crew left
    if (updatedCrew.length === 0) {
      get().triggerGameOver('The last of your crew has perished. The ship drifts unmanned upon the waves.');
    }
  },
  triggerGameOver: (cause) => {
    set({ gameOver: true, gameOverCause: cause, paused: true });
    audioManager.stopAll();
  },
  initWorld: (ports) => set((state) => ({
    ports,
    discoveredPorts: Array.from(new Set([...state.discoveredPorts, ...ports.map((port) => port.id)])),
  }))
}));
