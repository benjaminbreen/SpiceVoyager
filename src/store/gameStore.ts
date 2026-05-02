import { create } from 'zustand';
import {
  commerceBuyTemplate, commerceSellTemplate, shipDamageTemplate,
  shipRepairTemplate, portDiscoverTemplate, tavernTemplate,
  fraudRevealTemplate, windfallRevealTemplate,
} from '../utils/journalTemplates';
import { generateStartingCrew, generateStartingCaptain } from '../utils/crewGenerator';
import { sfxCrabCollect, sfxDiscovery } from '../audio/SoundEffects';
import { audioManager } from '../audio/AudioManager';
import { rollLoot, playLootSfx, CRAB_LOOT } from '../utils/lootRoll';
import { NPCShipIdentity, SHIP_NAMES } from '../utils/npcShipGenerator';
import type { OceanEncounterDef } from '../utils/oceanEncounters';
import type { FishType } from '../utils/fishTypes';
import type { WaterPaletteSetting } from '../utils/waterPalettes';
import { canDirectlySail, estimateSeaTravel, getWorldPortById, resolveCampaignPortId, MARKET_TRUST } from '../utils/worldPorts';
import type { Lead, LeadSource, QuestToastEntry } from '../types/leads';
import { LEAD_CAPS } from '../types/leads';
import { createStarterLead } from '../utils/seedLeads';
import { saleResolvesStarterLead, leadsToExpire, formatRewardReveal, type SaleEvent } from '../utils/leadResolution';
import { authorityForPort } from '../utils/portAuthorities';
import type { VoyageResolution } from '../utils/voyageResolution';
import { nationalityToCulture } from '../utils/portCoords';
import type { DistrictKey } from '../utils/cityDistricts';
export type { DistrictKey };
import {
  syncLiveShipTransform,
  syncLiveWalkingTransform,
  syncLivePlayerMode,
} from '../utils/livePlayerTransform';
import {
  type Commodity, ALL_COMMODITIES, ALL_COMMODITIES_FULL, COMMODITY_DEFS,
  supplyDemandModifier, generateStartingCargo,
} from '../utils/commodities';
import {
  type KnowledgeLevel,
  generateStartingKnowledge,
  rollPurchaseOutcome,
} from '../utils/knowledgeSystem';
import {
  quoteBuyCommodity,
  quoteSellCommodity,
  settleSellCommodity,
} from '../utils/tradeQuotes';
import { calculateCargoWeight, cargoUnitWeight } from '../utils/cargoWeight';
import { rollCrewRelationshipEvent, type CrewRelation, type CrewRelationshipStatus } from '../utils/crewRelations';
import { maybeCreateCrewTroubleEvent, type CrewTroubleChoice, type CrewTroubleEvent } from '../utils/crewTrouble';
import type { CityFieldKey } from '../utils/cityFieldTypes';
import type { LUTParams, LUTPresetId } from '../utils/proceduralLUT';
import { PORT_CULTURAL_REGION, PORT_FACTION } from './registries';
import { lodgingCost, lodgingLabel } from './lodging';
import { rollWeatherForPortId, rollWindForPortId, type WeatherState } from './weather';
import {
  LAND_WEAPON_DEFS,
  WEAPON_DEFS,
  WEAPON_PRICES,
  type LandWeaponType,
  type WeaponType,
} from './armory';
import { SHIP_UPGRADES, type ShipUpgradeType } from './shipUpgrades';
import {
  captainHasAbility,
  captainHasTrait,
  getCaptain,
  getCrewByRole,
  getRoleBonus,
  grantCrewXp,
  initialHearts,
  maxHeartsForLevel,
} from './crewRules';
import { DEFAULT_RENDER_DEBUG } from './defaults';

export { PORT_CULTURAL_REGION, PORT_FACTION } from './registries';
export { lodgingCost, lodgingLabel } from './lodging';
export type { WeatherKind, WeatherState } from './weather';
export {
  LAND_WEAPON_DEFS,
  PORT_ARMORY,
  WEAPON_DEFS,
  WEAPON_DESCRIPTIONS,
  WEAPON_PRICES,
  getPortArmory,
} from './armory';
export type { LandWeapon, LandWeaponType, Weapon, WeaponType } from './armory';
export { SHIP_UPGRADES, getPortUpgrades } from './shipUpgrades';
export type { ShipUpgrade, ShipUpgradeType } from './shipUpgrades';
export {
  HEARTS_BASE_MAX,
  captainHasAbility,
  captainHasTrait,
  getCaptain,
  getCrewByRole,
  getRoleBonus,
  grantCrewXp,
  initialHearts,
  maxHeartsForLevel,
  updateCrewMember,
} from './crewRules';
export { DEFAULT_RENDER_DEBUG } from './defaults';

export type { Commodity } from '../utils/commodities';
export type { KnowledgeLevel } from '../utils/knowledgeSystem';

export type CulturalRegion = 'Arab' | 'Swahili' | 'Gujarati' | 'Malabari' | 'Malay' | 'Chinese';

export type Culture = 'Indian Ocean' | 'European' | 'West African' | 'Atlantic';
export type PortScale = 'Small' | 'Medium' | 'Large' | 'Very Large' | 'Huge';

export type BuildingType = 'dock' | 'warehouse' | 'fort' | 'estate' | 'house' | 'farmhouse' | 'shack' | 'market' | 'plaza' | 'spiritual' | 'landmark' | 'palace';

export type HousingClass = 'poor' | 'common' | 'merchant' | 'elite';
export type HouseholdKind = 'residence' | 'shop' | 'workshop' | 'farmstead' | 'laboring' | 'elite';

export interface BuildingHousehold {
  kind: HouseholdKind;
  profession?: string;
  good?: string;
  crop?: Building['crop'];
  title?: string;
}

export interface Building {
  id: string;
  type: BuildingType;
  position: [number, number, number];
  rotation: number;
  scale: [number, number, number];
  label?: string;
  labelSub?: string;
  labelEyebrow?: string;        // e.g. "RELIGIOUS" — all-caps glowing prefix on hover label
  labelEyebrowColor?: string;   // hex color for the eyebrow text + glow; paired with labelEyebrow
  district?: DistrictKey;
  stories?: number;          // 1..4; renderer stacks floors on tall buildings
  housingClass?: HousingClass;
  /** Surname of the household occupying the building (residential types
   *  only). Set by buildingLabels.generateBuildingLabel; pedestrians
   *  anchored to this building inherit it as their family name. */
  familyName?: string;
  /** Structured version of the household/trade hint that often appears in
   *  the building label ("goldsmith", "pepper merchant", "fishers' huts").
   *  Used by pedestrian roles and building descriptions so they do not have
   *  to parse label text. */
  household?: BuildingHousehold;
  setback?: number;          // 0..1; render-time jitter multiplier
  landmarkId?: string;       // e.g. 'tower-of-london' — triggers unique geometry
  faith?: string;            // for type === 'spiritual'; keys render geometry
  palaceStyle?: string;      // for type === 'palace'; keys render authority-building geometry from palaceStyles.ts
  /** Crop type for farmhouses — drives both the label and the field renderer.
   *  Only set when the picked label corresponds to a crop we have geometry
   *  for. Other farmhouses fall back to plain labels with no rendered field.
   *  - orange: small fruit tree with baked orange dots (citrus groves)
   *  - rice/sawah: low shoot tufts in tight rows + translucent paddy plane
   *  - date: short stout palm
   *  - palm: taller slimmer palm (coconut, sago, areca)
   *  - orchard: generic deciduous tree, canopy tint set per fruit type
   *  - vineyard: short staked rows (vineyard, hop garden)
   *  - grain: tinted ground patch + sparse stubble (wheat, barley, millet…)
   *  - banana: wide-leaf clump (banana, plantain, sugarcane, bamboo) */
  crop?: 'orange' | 'rice' | 'date' | 'palm' | 'orchard' | 'vineyard' | 'grain' | 'banana';
  /** World-space bounds of the rendered farm plot around the farmhouse.
   *  Half-width and half-depth in world units (rectangular). The hut sits
   *  near the center; crops fill the surrounding area with edge-ring
   *  dropouts so the boundary isn't a perfect rectangle. `tint` (when set)
   *  drives canopy / ground / leaf color so e.g. olive orchards look
   *  silvery and mango orchards look deep green from the same shared
   *  geometry. */
  cropPlot?: { halfWidth: number; halfDepth: number; tint?: [number, number, number] };
  /** When set, this building IS the geometry of a Point of Interest. The
   *  walking-detection pipeline uses this to dispatch to POIModal instead of
   *  the generic BuildingToast. Procedural shrines (Phase 2) inject these
   *  alongside their POI definition. Bespoke POIs that bind to existing
   *  landmarks do NOT get this — they reuse the landmark's building as-is. */
  poiId?: string;
  /** Uniform scale applied to the building's rendered geometry around its
   *  origin. Procedural shrines use this to render existing faith geometry
   *  (cathedral, mosque, shikhara, pagoda…) at heightened wayside (1.0),
   *  village (1.4), or pilgrimage (1.8) silhouettes. The Building.scale field
   *  is bumped to match so the AABB walking footprint stays consistent. */
  geometryScale?: number;
  /** Set on procedural shrines (Phase 2 of the POI system). The spiritual
   *  branch in ProceduralCity.tsx reads this to vary the silhouette per
   *  shrine: hero-feature scale, body proportion, palette drift, and accent
   *  toggles (boundary wall, prayer pole, outer courtyard). Absent on
   *  in-city spiritual buildings. */
  shrineVariant?: {
    keyFeatureScale: number;
    bodyProportion: number;
    paletteShift: number;
    accents: {
      boundaryWall: boolean;
      prayerPole: boolean;
      outerCourtyard: boolean;
    };
  };
}

export type POIRewardClaimResult =
  | { status: 'none' }
  | { status: 'already_claimed' }
  | { status: 'journal' }
  | { status: 'knowledge'; commodityId: Commodity; learned: boolean }
  | { status: 'cargo'; commodityId: Commodity; amount: number }
  | { status: 'empty' }
  | { status: 'full'; commodityId: Commodity };

export type RoadTier = 'path' | 'road' | 'avenue' | 'bridge';

export interface Road {
  id: string;
  tier: RoadTier;
  /** Polyline of world-space points (x, terrainHeight, z). */
  points: [number, number, number][];
}

/**
 * Lightweight connectivity graph of a port's road network. Built at city
 * generation time by welding endpoints and detecting T-junctions. Nodes are
 * welded positions (degree ≥ 1); edges are the road polylines between them.
 * Consumers don't need this for rendering — it's here so pedestrians, NPC
 * routing, and the ribbon renderer (taper-at-dead-ends) can share one
 * canonical view of "which road endpoints meet where".
 */
export interface RoadGraphNode {
  /** World-space position of the node (x, y, z) — y is terrain or deck. */
  pos: [number, number, number];
  /** Number of incident road endpoints welded to this node. 1 = dead-end,
   *  ≥ 2 = junction. */
  degree: number;
  /** The set of road tiers incident at this node (path/road/avenue/bridge). */
  tiers: RoadTier[];
}

export interface RoadGraphEdge {
  /** Matches the Road.id the edge was derived from. */
  roadId: string;
  tier: RoadTier;
  /** Index into RoadGraph.nodes for each endpoint, or -1 if the endpoint
   *  wasn't welded to any node (isolated segment). */
  fromNode: number;
  toNode: number;
}

export interface RoadGraph {
  nodes: RoadGraphNode[];
  edges: RoadGraphEdge[];
}

export interface Port {
  id: string;
  name: string;
  culture: Culture;
  scale: PortScale;
  buildingStyle?: string;
  flagColor?: [number, number, number];
  landmark?: string;
  position: [number, number, number];
  inventory: Record<Commodity, number>;
  baseInventory: Record<Commodity, number>; // initial stock levels for supply/demand calc
  basePrices: Record<Commodity, number>;    // base prices before supply/demand adjustment
  prices: Record<Commodity, number>;        // current effective prices
  buildings: Building[];
  roads?: Road[];
  /** Generation-time topology: welded endpoints + incidence. Optional so
   *  older save-state loads that predate the graph still boot. */
  roadGraph?: RoadGraph;
  /** Procedurally generated POIs for this port (shrines / ruins / etc).
   *  Populated at port-gen time by `proceduralShrines.ts` and similar.
   *  `getPOIsForPort` merges these with the hand-authored bespoke POIs in
   *  `POI_DEFINITIONS`. Type imported lazily to avoid utils → store cycles. */
  pois?: import('../utils/poiDefinitions').POIDefinition[];
}

// Max broadside cannons based on ship type
const MAX_CANNONS: Record<string, number> = {
  Pinnace: 4,
  Caravel: 4,
  Dhow: 4,
  Fluyt: 6,
  Junk: 6,
  Baghla: 8,
  Jong: 10,
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
  /** 0–1. How well the ship sails upwind. Lateens ≈ 0.9, galleons ≈ 0.35.
   *  Used by getWindTrimInfo to widen or narrow the usable wind arc. */
  windward: number;
  /** How shallow a reef or coastal shoal the ship can pass. */
  draft: 'shallow' | 'medium' | 'deep';
  /** Maximum berth — upper bound on hireable crew. Distinct from current
   *  crew count; a ship can sail undermanned but not overmanned. */
  maxCrew: number;
  cargoCapacity: number;
  cannons: number;       // broadside cannon count (0 = no broadsides)
  armament: WeaponType[]; // all mounted weapons
}

export type CrewRole = 'Captain' | 'Navigator' | 'Gunner' | 'Sailor' | 'Factor' | 'Surgeon';
export type HealthFlag = 'healthy' | 'sick' | 'injured' | 'scurvy' | 'fevered';

// Per-crew outcome of a single night's rest at an inn — surfaced to the
// post-rest summary modal. Captures only the deltas we want to show; the
// authoritative state is the updated crew member in the store.
export interface CrewRestDelta {
  crewId: string;
  name: string;
  moraleBefore: number;
  moraleAfter: number;
  healthBefore: HealthFlag;
  healthAfter: HealthFlag;
  heartsBefore: number;
  heartsAfter: number;
  heartsMaxBefore: number;
  heartsMaxAfter: number;
  xpGained: number;
  xpBonusReason: 'home' | 'foreign-port' | 'foreign-culture';
  levelUp: boolean;
  newLevel: number;
}

export interface RestSummary {
  portId: string;
  portName: string;
  cost: number;
  crewDeltas: CrewRestDelta[];
}
export type Nationality =
  | 'English' | 'Portuguese' | 'Dutch' | 'Spanish' | 'French' | 'Danish'
  | 'Venetian'
  | 'Pirate'
  | 'Mughal' | 'Gujarati' | 'Persian' | 'Ottoman' | 'Omani'
  | 'Swahili'
  | 'Malay' | 'Acehnese' | 'Javanese' | 'Moluccan'
  | 'Siamese' | 'Japanese' | 'Chinese';
export type Language =
  | 'Arabic' | 'Persian' | 'Gujarati' | 'Hindustani'
  | 'Portuguese' | 'Dutch' | 'English' | 'Spanish' | 'French' | 'Italian'
  | 'Turkish' | 'Malay' | 'Swahili' | 'Chinese' | 'Japanese';
export type CaptainTrait =
  | 'Silver Tongue'   // better prices at port
  | 'Iron Will'       // slower morale decay
  | 'Sea Legs'        // faster sailing speed
  | 'Keen Eye'        // discovers ports from further away
  | 'Battle Hardened' // reduced hull damage
  | 'Lucky Star';     // random bonus events

export type CrewQuality =
  | 'disaster'  // bottom ~3%, actively harmful
  | 'dud'       // ~15%, unreliable
  | 'untried'   // ~20%, green / unproven
  | 'passable'  // ~24%, serviceable, unremarkable
  | 'able'      // ~20%, competent
  | 'seasoned'  // ~12%, experienced
  | 'renowned'  // ~4.5%, famed in ports
  | 'legendary';// ~1.5%, peerless

export interface CrewStats {
  strength: number;    // 1-20, physical power — boarding, repairs, hauling
  perception: number;  // 1-20, awareness — navigation, spotting, fishing
  charisma: number;    // 1-20, social — trading, morale, diplomacy
  luck: number;        // 1-20, fortune — random events, loot, survival
}

export interface Humours {
  sanguine: number;    // 1-10, sociability, optimism, morale recovery
  choleric: number;    // 1-10, drive, initiative, but conflict risk
  melancholic: number; // 1-10, introspection, perception, but fragile morale
  phlegmatic: number;  // 1-10, steadiness, loyalty, crew harmony
  curiosity: number;   // 1-10, openness, language learning, adaptability
}

// Visible vitality meter, rendered as hearts. Independent of HealthFlag —
// flag transitions and combat/voyage/landfall hooks all push current down,
// rest/surgeon/level-up push it back up. Death triggers still live in the
// flag-based daily tick; hearts is advisory in stage 1.
export interface Hearts {
  current: number;
  max: number;
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
  humours: Humours;
  backstory: string;
  history: CrewHistoryEntry[];
  hireDay: number;     // game day when they joined the crew
  traits: CaptainTrait[];
  abilities: CaptainAbility[];
  level: number;       // 1+
  xp: number;          // current XP toward next level
  xpToNext: number;    // XP needed for next level
  hearts: Hearts;      // visible vitality meter; max scales with level
}

export interface ShipInfo {
  name: string;
  type: 'Carrack' | 'Galleon' | 'Dhow' | 'Baghla' | 'Junk' | 'Jong' | 'Pinnace' | 'Fluyt' | 'Caravel' | 'Pattamar' | 'Ghurab';
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

// Captain portrait expression (mirrors portraitConfig.Personality)
export type Personality = 'Friendly' | 'Stern' | 'Curious' | 'Smug' | 'Melancholy' | 'Neutral' | 'Weathered' | 'Fierce' | 'Rage';

export type NotificationTier = 'port' | 'event' | 'ticker';

export interface Notification {
  id: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error' | 'legendary';
  tier: NotificationTier;
  subtitle?: string;
  imageCandidates?: string[];
  openPortId?: string;
  timestamp: number;
}

export type CaptainOrderType =
  | 'tighten-rations'
  | 'extra-rations'
  | 'hold-council'
  | 'punish-publicly'
  | 'light-duty';

export type JournalCategory = 'navigation' | 'commerce' | 'ship' | 'crew' | 'encounter';
export type CargoOwnership = 'owned' | 'commission' | 'pledged' | 'spoils' | 'suspect';
export type ObligationStatus = 'active' | 'settled' | 'defaulted';
export type ObligationType = 'investorCargo' | 'credit';

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

/**
 * Per-stack provenance for cargo. Every buy creates one. Sells consume FIFO.
 * When `actualCommodity !== commodity`, the stack is mislabeled — reveal fires
 * on sale. Provenance is kept in sync with the `cargo` bucket counts.
 */
export interface CargoStack {
  id: string;
  commodity: Commodity;        // claimed / bucket identity
  actualCommodity: Commodity;  // what it really is (equals commodity for genuine stacks)
  amount: number;
  acquiredPort: string;        // port id
  acquiredPortName: string;
  acquiredDay: number;
  purchasePrice: number;       // per-unit gold paid
  knowledgeAtPurchase: KnowledgeLevel;
  ownership?: CargoOwnership;
  obligationId?: string;
}

export interface Obligation {
  id: string;
  type: ObligationType;
  patron: string;
  faction: Nationality;
  portIds: string[];
  dueDay: number;
  principal: number;
  amountDue: number;
  settledGold: number;
  playerShare: number;
  status: ObligationStatus;
  cargoStackIds?: string[];
  note: string;
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
  ao: boolean;
  brightnessContrast: boolean;
  hueSaturation: boolean;
  lutEnabled: boolean;
  lutPreset: LUTPresetId | 'custom';
  lutParams: LUTParams;
  /** 'auto' = derive from climate + weather (rain → monsoon look).
   *  'manual' = use lutEnabled / lutPreset / lutParams as set by the dev panel. */
  lutMode: 'auto' | 'manual';
  advancedWater: boolean;
  shipWake: boolean;
  rain: boolean;
  algae: boolean;
  coralReefs: boolean;
  /** Animated pink/cyan caustic shimmer over reef-zone shallows. Off by default
   *  because it produces noticeable chromatic stippling, especially near river
   *  mouths where the silt overlay raises water-surface alpha and exposes the
   *  caustic that was previously masked by zero alpha. Toggle on for testing. */
  reefCaustics: boolean;
  wildlifeMotion: boolean;
  cloudShadows: boolean;
  /** City-local packed earth / damp mud tint around roads and buildings. */
  cityGroundWear: boolean;
  animalMarkers: boolean;
  disableTransitions: boolean;
  worldMapChart: boolean;
  cityFieldOverlay: boolean;
  cityFieldMode: CityFieldKey | 'district';
  /** Floating religious plumb bobs above sacred sites. */
  sacredMarkers: boolean;
  /** Cyan interactable POI pillars. */
  poiBeacons: boolean;
  /** Render the chunky POI silhouettes (wreck/cove/garden/caravanserai) and
   *  the bespoke shrine geometry that backs procedural shrines. POIs are
   *  *world content* (the structures exist in fiction), not optional UI
   *  affordances, so default true. Separate from marker/beacon toggles so a player
   *  who turns markers off doesn't lose visible buildings. */
  poiVisibility: boolean;
  settingsV2: boolean;
}

export interface GameState {
  playerPos: [number, number, number];
  playerRot: number;
  playerVelocity: number;
  gold: number;
  cargo: Record<Commodity, number>;
  cargoProvenance: CargoStack[];
  obligations: Obligation[];
  stats: ShipStats;
  crew: CrewMember[];
  crewRelations: CrewRelation[];
  crewStatuses: CrewRelationshipStatus[];
  activeCrewTrouble: CrewTroubleEvent | null;
  lastCrewTroubleDay: number;
  crewTroubleCooldowns: Record<string, number>;
  ship: ShipInfo;
  ports: Port[];
  timeOfDay: number; // 0 to 24
  notifications: Notification[];
  /** Active and recently-resolved quest leads. See questplan.md. */
  leads: Lead[];
  /** Top-center QuestToast queue. Head is shown when no mode banner is up. */
  questToasts: QuestToastEntry[];
  activePort: Port | null;
  cameraZoom: number;
  cameraRotation: number; // radians, orbits around player on Y axis
  viewMode: 'default' | 'cinematic' | 'topdown' | 'firstperson';
  cycleViewMode: () => void;
  
  // New state for walking
  playerMode: 'ship' | 'walking';
  walkingPos: [number, number, number];
  walkingRot: number;
  interactionPrompt: string | null;
  nearestHailableNpc: NPCShipIdentity | null;
  discoveredPorts: string[];

  // POI modal — null when closed. Opened from walk-up toast in UI.tsx.
  // Type imported lazily via dynamic import in the modal itself to avoid
  // a circular ref through utils → store → components.
  activePOI: import('../utils/poiDefinitions').POIDefinition | null;
  // POI ids the player has opened the modal for at least once. Drives the
  // "?" → real-name reveal on Minimap + WorldMap.
  discoveredPOIs: string[];
  // POI ids whose one-time generated reward has been claimed.
  claimedPOIRewards: string[];
  // Last resolved outcome for a generated POI reward, used by the modal when reopened.
  poiRewardResults: Record<string, POIRewardClaimResult>;
  // Undirected sea lanes the player has sailed at least once.
  chartedRoutes: string[];

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
  windDirection: number; // radians wind blows toward; 0 = north, PI/2 = east
  windSpeed: number;     // 0-1 normalized

  // Weather — rolled per port arrival, climate-driven. Drives RainOverlay
  // visibility and (later) LUT lerp toward the monsoon preset.
  weather: WeatherState;
  setWeather: (patch: Partial<WeatherState>) => void;
  /** Re-roll weather for the current port using its climate odds. Dev-only. */
  rerollWeather: () => void;

  // Knowledge system — tracks what the player knows about trade goods
  knowledgeState: Record<string, KnowledgeLevel>;

  // Provisions (food/supplies for crew)
  provisions: number;
  rationingDays: number;

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
  forceMobileLayout: boolean;
  setForceMobileLayout: (v: boolean) => void;
  shipSteeringMode: 'tap' | 'joystick';
  setShipSteeringMode: (mode: 'tap' | 'joystick') => void;
  // Mirrors touchShipInput.sailRaised but lives in the store so SailToggleButton
  // re-renders when TouchSteerRaycaster auto-raises the sail on ocean tap.
  touchSailRaised: boolean;
  setTouchSailRaised: (v: boolean) => void;
  renderDebug: RenderDebugSettings;
  paused: boolean;
  anchored: boolean;
  combatMode: boolean;

  // Hunting (land combat)
  landWeapons: LandWeaponType[];        // weapons the player owns and can switch between
  activeLandWeapon: LandWeaponType;     // currently equipped land weapon
  setActiveLandWeapon: (w: LandWeaponType) => void;
  cycleLandWeapon: () => void;          // tab key handler — cycles through owned weapons
  requestWorldMap: boolean;
  setRequestWorldMap: (v: boolean) => void;
  voyageBegun: boolean;
  setVoyageBegun: () => void;

  // Captain expression override — temporary expression for game events
  captainExpression: Personality | null;
  setCaptainExpression: (expr: Personality | null, durationMs?: number) => void;

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
  setActivePOI: (poi: import('../utils/poiDefinitions').POIDefinition | null) => void;
  markPOIDiscovered: (id: string) => void;
  claimPOIReward: (poi: import('../utils/poiDefinitions').POIDefinition) => POIRewardClaimResult;
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
  issueCaptainOrder: (order: CaptainOrderType, targetCrewId?: string) => void;
  rollCrewRelations: (trigger?: 'daily' | 'voyage' | 'rest' | 'combat') => void;
  maybeTriggerCrewTrouble: (trigger?: 'daily' | 'voyage' | 'rest' | 'relations' | 'combat' | 'commerce' | 'discovery') => void;
  resolveCrewTrouble: (choice: CrewTroubleChoice) => void;
  dismissCrewTrouble: () => void;

  addNotification: (message: string, type?: Notification['type'], opts?: { size?: 'normal' | 'grand'; tier?: NotificationTier; subtitle?: string; imageCandidates?: string[]; openPortId?: string }) => void;
  removeNotification: (id: string) => void;
  addJournalEntry: (category: JournalCategory, message: string, portName?: string) => void;
  addJournalNote: (entryId: string, text: string) => void;

  // Quest leads — see src/types/leads.ts and questplan.md.
  addLead: (lead: Lead) => void;
  resolveLead: (leadId: string) => void;
  failLead: (leadId: string) => void;
  expireLead: (leadId: string) => void;
  dismissQuestToast: (toastId: string) => void;
  setActivePort: (port: Port | null) => void;
  buyCommodity: (commodity: Commodity, amount: number) => void;
  sellCommodity: (commodity: Commodity, amount: number) => void;
  drawCredit: (amount: number) => void;
  repayObligation: (obligationId: string) => void;
  settleObligation: (obligationId: string) => void;
  advanceTime: (delta: number) => void;
  restAtInn: (port: Port) => RestSummary | null;
  setCameraZoom: (zoom: number) => void;
  setCameraRotation: (rotation: number) => void;
  setViewMode: (mode: 'default' | 'cinematic' | 'topdown' | 'firstperson') => void;
  setWorldSeed: (seed: number) => void;
  startNewGame: (opts: { faction: Nationality; portId: string }) => void;
  setWorldSize: (size: number) => void;
  setDevSoloPort: (portId: string | null) => void;
  devRestPreviewPortId: string | null;
  setDevRestPreview: (portId: string | null) => void;
  /** Set true when the player rests at an inn; consumed by PortModal on
   *  close to play the "After the Night" theme as the morning departure
   *  music. Cleared as soon as the music is triggered. */
  pendingAfterNightMusic: boolean;
  setPendingAfterNightMusic: (v: boolean) => void;
  setWaterPaletteSetting: (setting: WaterPaletteSetting) => void;
  updateRenderDebug: (patch: Partial<RenderDebugSettings>) => void;
  resetRenderDebug: () => void;
  learnAboutCommodity: (commodityId: string, newLevel: KnowledgeLevel, source: string) => void;
  collectCrab: () => void;
  fastTravel: (portId: string, opts?: { force?: boolean; voyage?: VoyageResolution }) => void;
  setPaused: (paused: boolean) => void;
  setAnchored: (anchored: boolean) => void;
  setCombatMode: (combatMode: boolean) => void;
  shipUpgrades: ShipUpgradeType[];
  buyUpgrade: (upgradeType: ShipUpgradeType) => void;
  buyWeapon: (weaponType: WeaponType) => void;
  sellWeapon: (weaponType: WeaponType) => void;
  defeatedNpc: (npcId: string, shipName: string, flag: Nationality, cargo: Partial<Record<Commodity, number>>) => void;
  initWorld: (ports: Port[]) => void;
}

const generateId = () => Math.random().toString(36).substring(2, 9);

function deterministicRewardRoll(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 0xffffffff;
}

// Playable factions. Each has a humble starter (the common case) and a grand
// one the captain's luck unlocks. Picking tier from the captain roll avoids
// an extra dice and ties ship quality to a stat the player can see. Omani
// and Chinese were added in phase 2 once the dhow/junk/baghla/jong meshes
// landed in shipProfiles.ts.
const PLAYABLE_FACTION_STARTS: Array<{
  faction: Nationality;
  humble: ShipInfo['type'];
  grand: ShipInfo['type'];
  homePortId: string;
}> = [
  { faction: 'English',    humble: 'Pinnace', grand: 'Galleon', homePortId: 'london'    },
  { faction: 'Portuguese', humble: 'Caravel', grand: 'Carrack', homePortId: 'lisbon'    },
  { faction: 'Dutch',      humble: 'Fluyt',   grand: 'Carrack', homePortId: 'amsterdam' },
  { faction: 'Spanish',    humble: 'Caravel', grand: 'Galleon', homePortId: 'seville'   },
  { faction: 'Venetian',   humble: 'Carrack', grand: 'Galleon', homePortId: 'venice'    },
  { faction: 'Omani',      humble: 'Dhow',    grand: 'Baghla',  homePortId: 'muscat'    },
  { faction: 'Chinese',    humble: 'Junk',    grand: 'Jong',    homePortId: 'macau'     },
  { faction: 'Pirate',     humble: 'Pinnace', grand: 'Caravel', homePortId: 'socotra'   },
  // Gujarati banias and Bohra/Memon merchant houses out of Surat — the great
  // Mughal-era port. Pattamar = lateen coastal trader; Ghurab ("raven") =
  // armed merchantman, the typical Surat blue-water hull.
  { faction: 'Gujarati',   humble: 'Pattamar', grand: 'Ghurab', homePortId: 'surat'     },
];

// Weighted spawn distributions for c. 1612. A captain usually begins in the
// metropole, but overseas factories, Estado da Índia strongholds, and colonial
// entrepôts are all plausible points of origin — a Portuguese merchant might
// already be seasoned in Goa, a Dutch factor in Bantam, etc. Weights are
// historically shaped (Portuguese Estado at full stretch; VOC founded 1602;
// EIC's Surat factory opens 1612; Spanish network anchored in the Caribbean).
export const FACTION_SPAWN_WEIGHTS: Partial<Record<Nationality, Array<{ portId: string; weight: number }>>> = {
  Portuguese: [
    { portId: 'lisbon',   weight: 53 },
    { portId: 'goa',      weight: 20 },
    { portId: 'macau',    weight: 10 },
    { portId: 'salvador', weight: 5  },
    { portId: 'luanda',   weight: 4  },
    { portId: 'mombasa',  weight: 3  },
    { portId: 'cape',     weight: 3  },
    // A handful of Portuguese New Christian / Sephardic merchant houses had
    // factors resident in Venice — pepper buyers working the Levantine route.
    { portId: 'venice',   weight: 2  },
  ],
  Dutch: [
    { portId: 'amsterdam', weight: 70 },
    { portId: 'bantam',    weight: 15 },
    { portId: 'surat',     weight: 8  },
    { portId: 'cape',      weight: 4  },
    { portId: 'mocha',     weight: 3  },
  ],
  English: [
    { portId: 'london',    weight: 68 },
    { portId: 'surat',     weight: 15 },
    { portId: 'bantam',    weight: 8  },
    { portId: 'jamestown', weight: 4  },
    { portId: 'cape',      weight: 3  },
    // The Levant Company (chartered 1592) maintained an English consul and
    // merchant presence in Venice through the early 17c.
    { portId: 'venice',    weight: 2  },
  ],
  Spanish: [
    { portId: 'seville',   weight: 53 },
    { portId: 'havana',    weight: 16 },
    { portId: 'cartagena', weight: 15 },
    // Manila — Spanish capital of the Philippines and Asian end of the
    // Acapulco galleon. A meaningful share of Spanish merchant captains
    // in 1612 were Pacific-side rather than Atlantic-side.
    { portId: 'manila',    weight: 14 },
    { portId: 'venice',    weight: 2  },
  ],
  Venetian: [
    { portId: 'venice',    weight: 70 },
    { portId: 'hormuz',    weight: 8  },   // Venetian merchants in Hormuz via the Levant
    { portId: 'aden',      weight: 6  },   // Red Sea pepper / coffee runs
    { portId: 'mocha',     weight: 5  },
    { portId: 'goa',       weight: 5  },   // few Venetian factors in Estado ports
    { portId: 'lisbon',    weight: 3  },
    { portId: 'surat',     weight: 3  },
  ],
  // Omani captains in 1612 sailed out of Muscat, Sur, and the Gulf/Red Sea
  // entrepôts. Hormuz is still Portuguese-held (falls 1622) but lascar
  // captains operated from it; Zanzibar/Mombasa reflect the Swahili-coast
  // dhow network. A few captains start in Surat via Gujarati-Omani links.
  Omani: [
    { portId: 'muscat',   weight: 40 },
    { portId: 'mocha',    weight: 15 },
    { portId: 'aden',     weight: 12 },
    { portId: 'hormuz',   weight: 10 },
    { portId: 'zanzibar', weight: 9  },
    { portId: 'mombasa',  weight: 6  },
    { portId: 'socotra',  weight: 4  },
    { portId: 'surat',    weight: 4  },
  ],
  // Chinese junk captains c. 1612 operated largely out of Fujian via Macau
  // (Luso-Chinese hub) and the East Indies hubs with large Chinese
  // communities. Bantam and Malacca reflect overseas-Chinese trade routes.
  Chinese: [
    { portId: 'macau',   weight: 45 },
    { portId: 'manila',  weight: 20 },  // Sangley Parián was huge — c. 20–30k Chinese in 1612
    { portId: 'bantam',  weight: 18 },
    { portId: 'malacca', weight: 12 },
    { portId: 'goa',     weight: 3  },
    { portId: 'calicut', weight: 2  },
  ],
  // Gujarati merchant houses c. 1612 anchor at Surat (Mughal port, EIC factory
  // founded this very year) but maintain factors across the Arabian Sea
  // pepper/cotton/horse circuits. Diu stays low because it's a Portuguese
  // fortress — Gujarati merchants worked through it under cartaz, but it's
  // not their home. Calicut weight reflects shared Gujarati-Mappila dominance
  // of the Malabar coast.
  Gujarati: [
    { portId: 'surat',    weight: 50 },
    { portId: 'calicut',  weight: 10 },
    { portId: 'mocha',    weight: 10 },
    { portId: 'hormuz',   weight: 8  },
    { portId: 'aden',     weight: 5  },
    { portId: 'zanzibar', weight: 5  },
    { portId: 'mombasa',  weight: 4  },
    { portId: 'malacca',  weight: 3  },
    { portId: 'diu',      weight: 5  },
  ],
  // "Pirate" is not a nationality here; it is an outlaw flag. Starts cluster
  // around loose anchorages, contested corridors, and ports where a mixed crew
  // could plausibly slip between jurisdictions.
  Pirate: [
    { portId: 'socotra',  weight: 18 },
    { portId: 'zanzibar', weight: 14 },
    { portId: 'mombasa',  weight: 12 },
    { portId: 'aden',     weight: 10 },
    { portId: 'mocha',    weight: 9  },
    { portId: 'hormuz',   weight: 8  },
    { portId: 'cape',     weight: 8  },
    { portId: 'havana',   weight: 7  },
    { portId: 'bantam',   weight: 7  },
    { portId: 'malacca',  weight: 7  },
  ],
};

function pickSpawnPort(faction: Nationality, fallback: string): string {
  const table = FACTION_SPAWN_WEIGHTS[faction];
  if (!table || table.length === 0) return fallback;
  const total = table.reduce((sum, row) => sum + row.weight, 0);
  let roll = Math.random() * total;
  for (const row of table) {
    roll -= row.weight;
    if (roll <= 0) return row.portId;
  }
  return table[table.length - 1].portId;
}

function playableStartForFaction(faction: Nationality) {
  return PLAYABLE_FACTION_STARTS.find((entry) => entry.faction === faction)
    ?? PLAYABLE_FACTION_STARTS[0];
}

const PIRATE_STARTING_SHIPS: Array<{ type: ShipInfo['type']; weight: number }> = [
  { type: 'Pinnace', weight: 20 },
  { type: 'Dhow', weight: 16 },
  { type: 'Pattamar', weight: 14 },
  { type: 'Caravel', weight: 14 },
  { type: 'Ghurab', weight: 10 },
  { type: 'Fluyt', weight: 8 },
  { type: 'Junk', weight: 7 },
  { type: 'Baghla', weight: 6 },
  { type: 'Carrack', weight: 3 },
  { type: 'Jong', weight: 1 },
  { type: 'Galleon', weight: 1 },
];

function pickStartingShipType(faction: Nationality, luckyStart: boolean, factionStart: { humble: ShipInfo['type']; grand: ShipInfo['type'] }): ShipInfo['type'] {
  if (faction === 'Pirate') {
    const total = PIRATE_STARTING_SHIPS.reduce((sum, row) => sum + row.weight, 0);
    let roll = Math.random() * total;
    for (const row of PIRATE_STARTING_SHIPS) {
      roll -= row.weight;
      if (roll <= 0) return row.type;
    }
    return PIRATE_STARTING_SHIPS[0].type;
  }
  return luckyStart ? factionStart.grand : factionStart.humble;
}

// Per-hull handling baseline. Speed is 0–25 (kn at top trim), turnSpeed is
// the existing 0–3 scale Ship.tsx already reads, windward is 0–1 (1.0 =
// can sail straight into the wind — none of these hulls hit that). Draft
// gates shallow-water crossings. maxHull is per-type so a Pinnace is less
// durable than a Galleon. maxCrew is the upper limit on hires; startMin/
// startMax give the random starting crew range for a fresh run.
const SHIP_BASE_STATS: Record<ShipInfo['type'], {
  speed: number;
  turnSpeed: number;
  windward: number;
  draft: 'shallow' | 'medium' | 'deep';
  maxHull: number;
  maxCrew: number;
  startMin: number;
  startMax: number;
}> = {
  Pinnace:  { speed: 24, turnSpeed: 2.6, windward: 0.55, draft: 'shallow', maxHull:  60, maxCrew:  4, startMin: 3, startMax: 4  },
  Dhow:     { speed: 22, turnSpeed: 2.8, windward: 0.90, draft: 'shallow', maxHull:  70, maxCrew:  4, startMin: 3, startMax: 4  },
  Caravel:  { speed: 21, turnSpeed: 2.5, windward: 0.78, draft: 'shallow', maxHull:  80, maxCrew:  5, startMin: 3, startMax: 5  },
  Pattamar: { speed: 20, turnSpeed: 2.4, windward: 0.85, draft: 'shallow', maxHull:  72, maxCrew:  5, startMin: 3, startMax: 5  },
  Baghla:   { speed: 18, turnSpeed: 2.2, windward: 0.82, draft: 'medium',  maxHull: 100, maxCrew:  8, startMin: 4, startMax: 7  },
  Fluyt:    { speed: 18, turnSpeed: 1.8, windward: 0.48, draft: 'medium',  maxHull: 110, maxCrew:  6, startMin: 4, startMax: 6  },
  Junk:     { speed: 17, turnSpeed: 2.0, windward: 0.65, draft: 'medium',  maxHull:  95, maxCrew:  6, startMin: 4, startMax: 6  },
  Ghurab:   { speed: 19, turnSpeed: 2.0, windward: 0.78, draft: 'medium',  maxHull: 110, maxCrew:  8, startMin: 5, startMax: 8  },
  Galleon:  { speed: 16, turnSpeed: 1.3, windward: 0.35, draft: 'deep',    maxHull: 160, maxCrew: 12, startMin: 6, startMax: 10 },
  Carrack:  { speed: 20, turnSpeed: 1.8, windward: 0.50, draft: 'deep',    maxHull: 130, maxCrew:  8, startMin: 5, startMax: 8  },
  Jong:     { speed: 15, turnSpeed: 1.4, windward: 0.60, draft: 'deep',    maxHull: 140, maxCrew: 12, startMin: 6, startMax: 10 },
};

// Starting armament by ship type. Swivels are the universal anti-personnel
// piece and are renamed to lantaka/cetbang in Arab and Malay/Javanese
// contexts respectively — we pick the name by the starting faction in
// buildStartingArmament(). `mounted` holds broadside cannons plus any
// fixed aimable pieces (rocket racks); stats.cannons then counts only
// the non-aimable entries via WEAPON_DEFS[w].aimable. Pinnace/Dhow/
// Caravel/Fluyt carry light armaments; Carrack and Baghla walk out as
// real armed merchants; Galleon and Jong are state-scale.
const SHIP_STARTING_ARMAMENT: Record<ShipInfo['type'], {
  swivelMin: number;
  swivelMax: number;
  mounted: WeaponType[];
}> = {
  Pinnace:  { swivelMin: 1, swivelMax: 1, mounted: [] },
  Dhow:     { swivelMin: 0, swivelMax: 1, mounted: [] },
  Caravel:  { swivelMin: 1, swivelMax: 2, mounted: ['minion', 'minion'] },
  Pattamar: { swivelMin: 1, swivelMax: 1, mounted: [] },
  Fluyt:    { swivelMin: 1, swivelMax: 1, mounted: ['minion', 'minion'] },
  // Junk/Jong come off the dock with a rocket rack — a small one on the
  // junk, a proper launcher on the Jong. Signature ranged weapon.
  Junk:     { swivelMin: 1, swivelMax: 2, mounted: ['minion', 'fireRocket'] },
  Baghla:   { swivelMin: 2, swivelMax: 2, mounted: ['minion', 'minion'] },
  // Ghurab — typical Surat armed merchantman. Heavier than the Baghla in
  // gunnery but no cannon ports proper; lantakas + a saker is realistic.
  Ghurab:   { swivelMin: 2, swivelMax: 3, mounted: ['minion', 'saker'] },
  Carrack:  { swivelMin: 2, swivelMax: 2, mounted: ['minion', 'minion', 'saker'] },
  Jong:     { swivelMin: 2, swivelMax: 3, mounted: ['minion', 'minion', 'fireRocket'] },
  Galleon:  { swivelMin: 3, swivelMax: 3, mounted: ['minion', 'minion', 'saker', 'saker', 'demiCulverin'] },
};

/** Pick the swivel-family weapon appropriate to the ship's faction — Omani
 *  captains carry lantakas, Chinese captains carry cetbangs, everyone else
 *  gets the generic European swivel gun. Purely cosmetic: stats are the
 *  same for all three. */
function factionSwivelType(faction: Nationality): WeaponType {
  if (faction === 'Omani') return 'lantaka';
  if (faction === 'Chinese') return 'cetbang';
  // Gujarati ships mounted swivel-class breech-loaders that the Portuguese
  // and Dutch sources call lantaka — the Malay loanword had spread along the
  // Indian Ocean by 1612.
  if (faction === 'Gujarati') return 'lantaka';
  return 'swivelGun';
}

function buildStartingArmament(type: ShipInfo['type'], faction: Nationality): WeaponType[] {
  const cfg = SHIP_STARTING_ARMAMENT[type];
  const range = cfg.swivelMax - cfg.swivelMin + 1;
  const swivelCount = cfg.swivelMin + Math.floor(Math.random() * range);
  const swivelType = factionSwivelType(faction);
  const armament = [
    ...Array(swivelCount).fill(swivelType),
    ...cfg.mounted,
  ];
  if (faction === 'Pirate' && armament.length === 0) {
    armament.push(swivelType);
  }
  if (
    faction === 'Pirate' &&
    (type === 'Pinnace' || type === 'Dhow' || type === 'Pattamar') &&
    armament.length < 2
  ) {
    armament.push(swivelType);
  }
  return armament;
}

function pirateStartingGold(baseGold: number): number {
  return Math.max(250, Math.floor(baseGold * 0.62));
}

function tunePirateStartingCargo(cargo: Record<Commodity, number>, cargoCapacity: number) {
  for (const commodity of Object.keys(cargo) as Commodity[]) {
    cargo[commodity] = Math.floor((cargo[commodity] ?? 0) * 0.55);
  }
  cargo['Small Shot'] = Math.max(cargo['Small Shot'] ?? 0, 16);
  cargo['Cannon Shot'] = Math.max(cargo['Cannon Shot'] ?? 0, Math.max(4, Math.floor(cargoCapacity / 22)));
}

function seedStartingAmmunition(cargo: Record<Commodity, number>, armament: WeaponType[]) {
  const broadsideCount = armament.filter(w => !WEAPON_DEFS[w].aimable).length;
  if (broadsideCount > 0) {
    cargo['Cannon Shot'] = Math.max(cargo['Cannon Shot'] ?? 0, 60);
  }
  if (armament.includes('fireRocket')) {
    cargo['War Rockets'] = Math.max(cargo['War Rockets'] ?? 0, 10);
  }
}

// Per-ship starting hold (tons) and purse (reals). Humble ships reflect a
// minor merchant's capital; grand ships imply investor/state backing and a
// fuller hold. Dhow/Baghla (Omani) and Junk/Jong (Chinese) are the
// non-European playable tiers.
const SHIP_START_PROFILE: Record<ShipInfo['type'], { cargoCapacity: number; gold: number }> = {
  Pinnace:  { cargoCapacity: 50,  gold: 120 },
  Caravel:  { cargoCapacity: 65,  gold: 160 },
  Pattamar: { cargoCapacity: 65,  gold: 140 },
  Fluyt:    { cargoCapacity: 120, gold: 220 },
  Carrack:  { cargoCapacity: 140, gold: 300 },
  Galleon:  { cargoCapacity: 130, gold: 360 },
  Dhow:     { cargoCapacity: 60,  gold: 120 },
  Baghla:   { cargoCapacity: 110, gold: 240 },
  Ghurab:   { cargoCapacity: 115, gold: 260 },
  Junk:     { cargoCapacity: 95,  gold: 180 },
  Jong:     { cargoCapacity: 150, gold: 340 },
};

// Per-faction starting reputation. Most captains begin neutral with everyone;
// non-European factions arrive with the period's actual political tilts pre-
// loaded. Numeric scale matches getReputation: -100..+100.
//
// Gujarati c. 1612: Mughal subjects (warm), Sunni co-religionist trade with
// Ottomans (mild), neutral with the upstart EIC/VOC, and a baseline penalty
// with the Portuguese — every Gujarati captain sails under cartaz tension
// even when there's no active hostility.
function buildStartingReputation(faction: Nationality): Partial<Record<Nationality, number>> {
  if (faction === 'Pirate') {
    return {
      Portuguese: -35,
      Spanish: -35,
      Dutch: -25,
      English: -25,
      Ottoman: -20,
      Mughal: -18,
      Persian: -15,
      Omani: -12,
      Gujarati: -10,
      Swahili: -8,
    };
  }
  if (faction === 'Gujarati') {
    return {
      Mughal: 20,
      Ottoman: 10,
      Persian: 5,
      Swahili: 5,
      Portuguese: -15,
    };
  }
  return {};
}

const _factionStart = PLAYABLE_FACTION_STARTS[Math.floor(Math.random() * PLAYABLE_FACTION_STARTS.length)];
const _startingFaction: Nationality = _factionStart.faction;
const _startingPortId = pickSpawnPort(_startingFaction, _factionStart.homePortId);

// Roll the captain first so we can check luck before picking the ship tier,
// then use the same captain in the full crew (keeps luck consistent across
// ship-tier selection and the cargo roll).
const _startingCaptain = generateStartingCaptain(_startingFaction);
const _captainLuck = _startingCaptain.stats.luck ?? 10;

// Captain luck is 1–20. Threshold 17 ≈ top ~20% of rolls upgrades the starter.
const _luckyStart = _captainLuck >= 17;
const _startingShipType: ShipInfo['type'] = pickStartingShipType(_startingFaction, _luckyStart, _factionStart);

const _baseStats = SHIP_BASE_STATS[_startingShipType];
const _crewRangeSize = _baseStats.startMax - _baseStats.startMin + 1;
const _startingCrewSize = _baseStats.startMin + Math.floor(Math.random() * _crewRangeSize);
const _startingCrew = generateStartingCrew(_startingFaction, _startingCrewSize, _startingCaptain);

const _shipNamePool = SHIP_NAMES[_startingShipType];
const _startingShipName = _shipNamePool[Math.floor(Math.random() * _shipNamePool.length)];

const _shipProfile = SHIP_START_PROFILE[_startingShipType];
const _startingCargoCapacity = _shipProfile.cargoCapacity;
const _startingGold = _startingFaction === 'Pirate' ? pirateStartingGold(_shipProfile.gold) : _shipProfile.gold;

const _startingCargoRollCapacity = _startingFaction === 'Pirate'
  ? Math.max(25, Math.floor(_startingCargoCapacity * 0.5))
  : _startingCargoCapacity;
const _startingCargo = generateStartingCargo(_startingFaction, _startingCargoRollCapacity, _captainLuck);
const _startingArmament = buildStartingArmament(_startingShipType, _startingFaction);
const _startingBroadsides = _startingArmament.filter(w => !WEAPON_DEFS[w].aimable).length;
if (_startingFaction === 'Pirate') {
  tunePirateStartingCargo(_startingCargo, _startingCargoCapacity);
}

// Seed the hold with 10 war rockets if the starting ship mounts a rocket rack
// (Junk / Jong). Without this the Chinese-start player would have an inert
// weapon until reaching Macau.
seedStartingAmmunition(_startingCargo, _startingArmament);
const _startingWeather = rollWeatherForPortId(_startingPortId);
const _startingWind = rollWindForPortId(_startingPortId, _startingWeather);

/** Build provenance stacks matching starting cargo. Treated as genuine goods
 *  taken on before the voyage began — no acquisition port, no fraud roll. */
function buildStartingProvenance(cargo: Record<Commodity, number>): CargoStack[] {
  const stacks: CargoStack[] = [];
  for (const [c, qty] of Object.entries(cargo)) {
    if (qty > 0) {
      stacks.push({
        id: generateId(),
        commodity: c as Commodity,
        actualCommodity: c as Commodity,
        amount: qty,
        acquiredPort: 'home',
        acquiredPortName: 'home port',
        acquiredDay: 0,
        purchasePrice: 0,
        knowledgeAtPurchase: 1,
      });
    }
  }
  return stacks;
}

const _startingProvenance = buildStartingProvenance(_startingCargo);
const _startingObligationStart = buildStartingObligations(
  _startingFaction,
  _startingPortId,
  _startingCargo,
  _startingProvenance,
);

function patronForFaction(faction: Nationality, portId?: string): string {
  const authority = portId ? authorityForPort(portId) : null;
  if (authority) return authority.creditPatron;

  if (faction === 'Portuguese') return 'Casa da India';
  if (faction === 'Dutch') return 'VOC directors';
  if (faction === 'English') return 'East India Company';
  if (faction === 'Spanish') return 'Casa de Contratacion';
  if (faction === 'Venetian') return 'Venetian spice syndics';
  if (faction === 'Gujarati') return 'Surat merchant house';
  if (faction === 'Omani') return 'Muscat broker';
  if (faction === 'Chinese') return 'Macau comprador';
  return 'private backers';
}

function buildStartingObligations(
  faction: Nationality,
  portId: string,
  cargo: Record<Commodity, number>,
  cargoProvenance: CargoStack[],
): { cargoProvenance: CargoStack[]; obligations: Obligation[] } {
  const ownedProvenance = cargoProvenance.map((stack) => ({ ...stack, ownership: 'owned' as const }));
  if (faction === 'Pirate') return { cargoProvenance: ownedProvenance, obligations: [] };
  const commissionStacks = cargoProvenance.filter((stack) =>
    stack.amount > 0 &&
    stack.commodity !== 'Rice' &&
    stack.commodity !== 'Small Shot' &&
    stack.commodity !== 'Cannon Shot' &&
    stack.commodity !== 'War Rockets'
  );
  if (commissionStacks.length === 0) return { cargoProvenance: ownedProvenance, obligations: [] };

  const obligationId = generateId();
  const principal = commissionStacks.reduce((sum, stack) => {
    const def = COMMODITY_DEFS[stack.commodity];
    const avg = Math.round((def.basePrice[0] + def.basePrice[1]) / 2);
    return sum + avg * stack.amount;
  }, 0);
  const amountDue = Math.max(40, Math.round(principal * 0.7));
  const patron = patronForFaction(faction, portId);
  return {
    cargoProvenance: cargoProvenance.map((stack) => commissionStacks.some((s) => s.id === stack.id)
      ? { ...stack, ownership: 'commission' as const, obligationId }
      : { ...stack, ownership: 'owned' as const }
    ),
    obligations: [{
      id: obligationId,
      type: 'investorCargo',
      patron,
      faction,
      portIds: [portId],
      dueDay: 90,
      principal,
      amountDue,
      settledGold: 0,
      playerShare: 0.3,
      status: 'active',
      cargoStackIds: commissionStacks.map((stack) => stack.id),
      note: `${patron} expects settlement on the cargo advanced at departure.`,
    }],
  };
}

function buildNewGameStart(faction: Nationality, portId?: string) {
  const factionStart = playableStartForFaction(faction);
  const startingPortId = portId || pickSpawnPort(faction, factionStart.homePortId);
  const captain = generateStartingCaptain(faction);
  const captainLuck = captain.stats.luck ?? 10;
  const luckyStart = captainLuck >= 17;
  const shipType: ShipInfo['type'] = pickStartingShipType(faction, luckyStart, factionStart);
  const baseStats = SHIP_BASE_STATS[shipType];
  const crewRangeSize = baseStats.startMax - baseStats.startMin + 1;
  const crewSize = baseStats.startMin + Math.floor(Math.random() * crewRangeSize);
  const crew = generateStartingCrew(faction, crewSize, captain);
  const shipNamePool = SHIP_NAMES[shipType];
  const shipName = shipNamePool[Math.floor(Math.random() * shipNamePool.length)];
  const shipProfile = SHIP_START_PROFILE[shipType];
  const startingCargoCapacity = faction === 'Pirate'
    ? Math.max(25, Math.floor(shipProfile.cargoCapacity * 0.5))
    : shipProfile.cargoCapacity;
  const cargo = generateStartingCargo(faction, startingCargoCapacity, captainLuck);
  const armament = buildStartingArmament(shipType, faction);
  if (faction === 'Pirate') {
    tunePirateStartingCargo(cargo, shipProfile.cargoCapacity);
  }
  const broadsides = armament.filter(w => !WEAPON_DEFS[w].aimable).length;
  seedStartingAmmunition(cargo, armament);
  const startingProvenance = buildStartingProvenance(cargo);
  const obligationStart = buildStartingObligations(faction, startingPortId, cargo, startingProvenance);
  const weather = rollWeatherForPortId(startingPortId);
  const wind = rollWindForPortId(startingPortId, weather);

  return {
    faction,
    startingPortId,
    captain,
    crew,
    crewRelations: [],
    crewStatuses: [],
    activeCrewTrouble: null,
    lastCrewTroubleDay: -999,
    crewTroubleCooldowns: {},
    cargo,
    cargoProvenance: obligationStart.cargoProvenance,
    obligations: obligationStart.obligations,
    gold: faction === 'Pirate' ? pirateStartingGold(shipProfile.gold) : shipProfile.gold,
    stats: {
      hull: baseStats.maxHull,
      maxHull: baseStats.maxHull,
      sails: 100,
      maxSails: 100,
      speed: baseStats.speed,
      turnSpeed: baseStats.turnSpeed,
      windward: baseStats.windward,
      draft: baseStats.draft,
      maxCrew: baseStats.maxCrew,
      cargoCapacity: shipProfile.cargoCapacity,
      cannons: broadsides,
      armament,
    } satisfies ShipStats,
    ship: {
      name: shipName,
      type: shipType,
      flag: faction,
      armed: true,
    } satisfies ShipInfo,
    reputation: buildStartingReputation(faction),
    knowledgeState: generateStartingKnowledge(faction, crew, armament),
    weather: { ...weather, intensity: weather.targetIntensity },
    windDirection: wind.direction,
    windSpeed: wind.speed,
  };
}

export const useGameStore = create<GameState>((set, get) => ({
  playerPos: [0, 0, 0],
  playerRot: 0,
  playerVelocity: 0,
  gold: _startingGold,
  cargo: _startingCargo,
  cargoProvenance: _startingObligationStart.cargoProvenance,
  obligations: _startingObligationStart.obligations,
  stats: {
    hull: _baseStats.maxHull,
    maxHull: _baseStats.maxHull,
    sails: 100,
    maxSails: 100,
    speed: _baseStats.speed,
    turnSpeed: _baseStats.turnSpeed,
    windward: _baseStats.windward,
    draft: _baseStats.draft,
    maxCrew: _baseStats.maxCrew,
    cargoCapacity: _startingCargoCapacity,
    cannons: _startingBroadsides,
    armament: _startingArmament,
  },
  crew: _startingCrew,
  crewRelations: [],
  crewStatuses: [],
  activeCrewTrouble: null,
  lastCrewTroubleDay: -999,
  crewTroubleCooldowns: {},
  ship: {
    name: _startingShipName,
    type: _startingShipType,
    flag: _startingFaction,
    armed: true,
  },
  ports: [],
  timeOfDay: 8, // Start at 8 AM
  notifications: [],
  leads: [createStarterLead(1, _startingPortId, _startingFaction)],
  questToasts: [],
  activePort: null,
  cameraZoom: 50,
  cameraRotation: 0,
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
  activePOI: null,
  discoveredPOIs: [],
  claimedPOIRewards: [],
  poiRewardResults: {},
  chartedRoutes: [],
  reputation: buildStartingReputation(_startingFaction),
  npcPositions: [],
  npcShips: [],
  oceanEncounters: [],
  fishShoals: [],
  fishNetCooldown: 0,
  shipUpgrades: [],
  journalEntries: [],
  dayCount: 1,
  windDirection: _startingWind.direction,
  windSpeed: _startingWind.speed,
  // Snap initial weather intensity to target so the opening scene doesn't
  // fade in mid-conversation.
  weather: { ..._startingWeather, intensity: _startingWeather.targetIntensity },
  knowledgeState: generateStartingKnowledge(_startingFaction, _startingCrew, _startingArmament),
  provisions: 30, // starting food supply
  rationingDays: 0,
  worldSeed: Math.floor(Math.random() * 100000),
  worldSize: 150,
  devSoloPort: null,
  devRestPreviewPortId: null,
  pendingAfterNightMusic: false,
  currentWorldPortId: _startingPortId,
  waterPaletteSetting: 'auto',
  forceMobileLayout: false,
  // Touch devices default to joystick — ship physics have momentum/turn
  // radius, which makes tap-to-set-heading feel laggy. Pointer fine devices
  // keep tap as the default. Settings → Controls lets the user override.
  shipSteeringMode:
    typeof window !== 'undefined' &&
    window.matchMedia?.('(pointer: coarse)').matches
      ? 'joystick'
      : 'tap',
  touchSailRaised: false,
  renderDebug: DEFAULT_RENDER_DEBUG,
  paused: false,
  anchored: false,
  combatMode: false,
  landWeapons: ['musket', 'bow'],
  activeLandWeapon: 'musket',
  requestWorldMap: false,
  setRequestWorldMap: (v) => set({ requestWorldMap: v }),
  voyageBegun: false,
  setVoyageBegun: () => set({ voyageBegun: true }),
  captainExpression: null,
  setCaptainExpression: (expr, durationMs = 4000) => {
    set({ captainExpression: expr });
    if (expr !== null) {
      setTimeout(() => {
        // Only clear if still the same expression (avoid clobbering a newer one)
        if (get().captainExpression === expr) set({ captainExpression: null });
      }, durationMs);
    }
  },
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
  setPlayerMode: (mode) => {
    syncLivePlayerMode(mode);
    set({ playerMode: mode });
  },
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
  setActivePOI: (poi) => set({ activePOI: poi }),
  markPOIDiscovered: (id) => set((state) => (
    state.discoveredPOIs.includes(id)
      ? state
      : { discoveredPOIs: [...state.discoveredPOIs, id] }
  )),
  claimPOIReward: (poi) => {
    const reward = poi.reward;
    const state = get();
    if (!reward || reward.type === 'none') return { status: 'none' };
    if (state.claimedPOIRewards.includes(poi.id)) {
      return state.poiRewardResults[poi.id] ?? { status: 'already_claimed' };
    }

    const markClaimed = (result: POIRewardClaimResult) => set((s) => ({
      claimedPOIRewards: s.claimedPOIRewards.includes(poi.id)
        ? s.claimedPOIRewards
        : [...s.claimedPOIRewards, poi.id],
      poiRewardResults: { ...s.poiRewardResults, [poi.id]: result },
    }));

    if (reward.type === 'journal') {
      const result: POIRewardClaimResult = { status: 'journal' };
      markClaimed(result);
      get().addJournalEntry('encounter', `${poi.name}: ${poi.lore}`);
      get().addNotification(`Recorded ${poi.name}.`, 'success', { subtitle: 'SITE RECORDED' });
      return result;
    }

    if (reward.type === 'knowledge') {
      const current = (state.knowledgeState[reward.commodityId] as 0 | 1 | 2 | undefined) ?? 0;
      const learned = reward.level > current;
      const result: POIRewardClaimResult = { status: 'knowledge', commodityId: reward.commodityId, learned };
      markClaimed(result);
      if (reward.level > current) {
        get().learnAboutCommodity(reward.commodityId, reward.level, poi.name);
      } else {
        get().addJournalEntry('encounter', `${poi.name}: the signs confirmed what we already knew of ${reward.commodityId}.`);
      }
      get().addNotification(`Recorded signs of ${reward.commodityId}.`, 'success', { subtitle: 'FIELD OBSERVATION' });
      return result;
    }

    const roll = deterministicRewardRoll(poi.id);
    if (roll > reward.chance) {
      const result: POIRewardClaimResult = { status: 'empty' };
      markClaimed(result);
      get().addJournalEntry('encounter', `${poi.name}: ${poi.lore}`);
      get().addNotification(`Inspected ${poi.name}.`, 'info', { subtitle: 'NO SALVAGE FOUND' });
      return result;
    }

    const amount = reward.min + Math.floor(deterministicRewardRoll(`${poi.id}:amount`) * (reward.max - reward.min + 1));
    const unitWeight = cargoUnitWeight(reward.commodityId);
    const currentCargoWeight = calculateCargoWeight(state.cargo);
    const availableWeight = state.stats.cargoCapacity - currentCargoWeight;
    const taken = unitWeight > 0
      ? Math.max(0, Math.min(amount, Math.floor(availableWeight / unitWeight)))
      : amount;
    if (taken <= 0) {
      get().addNotification(`No cargo space for ${reward.commodityId}.`, 'warning', { subtitle: 'HOLD FULL' });
      return { status: 'full', commodityId: reward.commodityId };
    }

    const stack: CargoStack = {
      id: `poi:${poi.id}:${state.dayCount}`,
      commodity: reward.commodityId,
      actualCommodity: reward.commodityId,
      amount: taken,
      acquiredPort: `poi:${poi.id}`,
      acquiredPortName: poi.name,
      acquiredDay: state.dayCount,
      purchasePrice: 0,
      knowledgeAtPurchase: 1,
    };
    const result: POIRewardClaimResult = { status: 'cargo', commodityId: reward.commodityId, amount: taken };
    markClaimed(result);
    set((s) => ({
      cargo: { ...s.cargo, [reward.commodityId]: (s.cargo[reward.commodityId] ?? 0) + taken },
      cargoProvenance: [...s.cargoProvenance, stack],
    }));
    get().addJournalEntry('encounter', `${poi.name}: recovered ${taken} ${reward.commodityId}.`);
    get().addNotification(`Recovered ${taken} ${reward.commodityId}.`, 'success', { subtitle: 'FIELD FIND' });
    return result;
  },
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
    // Captain reacts to damage
    get().setCaptainExpression(newHull < 30 ? 'Stern' : 'Fierce', 3000);
    if (newHull <= 0) {
      get().triggerGameOver('The ship has been destroyed and sank beneath the waves.');
    }
    get().maybeTriggerCrewTrouble('combat');
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

  issueCaptainOrder: (order, targetCrewId) => {
    const state = get();
    const crew = state.crew;
    if (crew.length === 0) return;
    const target = targetCrewId ? crew.find(c => c.id === targetCrewId) : null;
    const captain = getCaptain(state);
    const addStatus = (status: CrewRelationshipStatus) => {
      set((s) => ({ crewStatuses: [...s.crewStatuses, status].sort((a, b) => b.severity - a.severity).slice(0, 6) }));
    };
    const notifyLevelUp = (result: { levelledUp: string | null; newLevel: number }) => {
      if (result.levelledUp) get().addNotification(`${result.levelledUp} leveled up to Lvl ${result.newLevel}!`, 'success', { tier: 'event', subtitle: 'LEVEL UP' });
    };

    if (order === 'tighten-rations') {
      const updated = crew.map(member => ({ ...member, morale: Math.max(0, member.morale - 4) }));
      set({ crew: updated, rationingDays: Math.max(state.rationingDays, 5) });
      if (captain) {
        const result = grantCrewXp(get().crew, captain.id, 4);
        set({ crew: result.crew });
        notifyLevelUp(result);
      }
      get().addJournalEntry('crew', 'The captain ordered tight rations for five days. The stores will last longer; the crew noticed.');
      get().addNotification('Rations tightened for five days.', 'warning', { tier: 'event', subtitle: 'CAPTAIN ORDER' });
      get().maybeTriggerCrewTrouble('relations');
      return;
    }

    if (order === 'extra-rations') {
      const cost = Math.max(1, crew.length);
      if (state.provisions < cost) {
        get().addNotification('Not enough provisions for extra rations.', 'warning');
        return;
      }
      const updated = crew.map(member => ({ ...member, morale: Math.min(100, member.morale + 6) }));
      set({
        provisions: state.provisions - cost,
        crew: updated,
        crewStatuses: state.crewStatuses.filter(status => !status.text.toLowerCase().includes('ration')),
      });
      get().addJournalEntry('crew', `The captain issued extra rations, spending ${cost} provisions to quiet the deck.`);
      get().addNotification(`Extra rations issued (${cost} provisions).`, 'success', { tier: 'event', subtitle: 'CAPTAIN ORDER' });
      return;
    }

    if (order === 'hold-council') {
      const worst = [...state.crewRelations].sort((a, b) => b.tension - a.tension)[0];
      if (worst) {
        set({
          crewStatuses: [...state.crewStatuses, {
            id: generateId(),
            crewId: worst.aId,
            otherCrewId: worst.bId,
            text: 'Called before the captain to speak grievances',
            tone: 'tension',
            severity: Math.max(62, worst.tension),
            createdDay: state.dayCount,
            expiresDay: state.dayCount + 6,
          }],
        });
      }
      const updated = crew.map(member => ({ ...member, morale: Math.min(100, member.morale + (member.morale < 35 ? 5 : 1)) }));
      set({ crew: updated });
      get().addJournalEntry('crew', 'The captain called council and heard grievances before the watch.');
      get().addNotification('The crew was called to speak grievances.', 'info', { tier: 'event', subtitle: 'CAPTAIN ORDER' });
      get().maybeTriggerCrewTrouble('relations');
      return;
    }

    if (!target) return;

    if (order === 'punish-publicly') {
      const relations = state.crewRelations.filter(relation => relation.aId === target.id || relation.bId === target.id);
      const disliked = relations.length > 0 && relations.reduce((sum, relation) => sum + relation.tension - relation.affinity, 0) / relations.length > 55;
      let updated = crew.map(member => {
        if (member.id === target.id) {
          return {
            ...member,
            morale: Math.max(0, member.morale - 18),
            hearts: { ...member.hearts, current: Math.max(0, member.hearts.current - 1) },
          };
        }
        return { ...member, morale: Math.max(0, Math.min(100, member.morale + (disliked ? 3 : -3))) };
      });
      for (const member of updated) {
        if (member.id === target.id) continue;
        const result = grantCrewXp(updated, member.id, disliked ? 3 : 1);
        updated = result.crew;
        notifyLevelUp(result);
      }
      set({ crew: updated });
      addStatus({
        id: generateId(),
        crewId: target.id,
        otherCrewId: captain?.id ?? target.id,
        text: disliked ? 'Punished before a crew that had little love for him' : 'Punished publicly by the captain',
        tone: 'tension',
        severity: disliked ? 58 : 72,
        createdDay: state.dayCount,
        expiresDay: state.dayCount + 12,
      });
      get().addCrewHistory(target.id, disliked ? 'Punished publicly; several hands approved' : 'Punished publicly by the captain');
      get().addJournalEntry('crew', `${target.name} was punished publicly. ${disliked ? 'The deck grew quieter, and not unhappier.' : 'The deck grew quiet, but not loyal.'}`);
      get().addNotification(`${target.name} was punished publicly.`, disliked ? 'info' : 'warning', { tier: 'event', subtitle: disliked ? 'DISCIPLINE ACCEPTED' : 'HARSH DISCIPLINE' });
      get().maybeTriggerCrewTrouble('relations');
      return;
    }

    if (order === 'light-duty') {
      const updated = crew.map(member => member.id === target.id
        ? {
            ...member,
            morale: Math.min(100, member.morale + 8),
            hearts: { ...member.hearts, current: Math.min(member.hearts.max, member.hearts.current + 1) },
          }
        : member
      );
      set({ crew: updated });
      addStatus({
        id: generateId(),
        crewId: target.id,
        otherCrewId: captain?.id ?? target.id,
        text: 'Given light duty by the captain',
        tone: 'care',
        severity: 36,
        createdDay: state.dayCount,
        expiresDay: state.dayCount + 8,
      });
      get().addCrewHistory(target.id, 'Given light duty by the captain');
      get().addJournalEntry('crew', `${target.name} was put on light duty.`);
      get().addNotification(`${target.name} put on light duty.`, 'success', { tier: 'event', subtitle: 'CAPTAIN ORDER' });
    }
  },

  rollCrewRelations: (trigger = 'daily') => {
    const state = get();
    const result = rollCrewRelationshipEvent(state.crew, state.crewRelations, state.crewStatuses, {
      dayCount: state.dayCount,
      provisions: state.provisions,
      starving: state.provisions === 0,
      trigger,
    });
    set({ crewRelations: result.relations, crewStatuses: result.statuses });
    if (result.publicEvent) {
      get().addNotification(result.publicEvent.text, result.publicEvent.type, {
        tier: 'event',
        subtitle: result.publicEvent.title,
      });
      get().addJournalEntry('crew', result.publicEvent.text);
    }
    get().maybeTriggerCrewTrouble('relations');
  },

  maybeTriggerCrewTrouble: (trigger = 'daily') => {
    const state = get();
    if (state.activeCrewTrouble) return;
    const event = maybeCreateCrewTroubleEvent({
      crew: state.crew,
      relations: state.crewRelations,
      statuses: state.crewStatuses,
      dayCount: state.dayCount,
      provisions: state.provisions,
      gold: state.gold,
      trigger,
      lastTroubleDay: state.lastCrewTroubleDay,
      crewTroubleCooldowns: state.crewTroubleCooldowns,
    });
    if (!event) return;
    const cooldowns = { ...state.crewTroubleCooldowns };
    for (const crewId of event.crewIds) cooldowns[crewId] = state.dayCount + 12;
    set({
      activeCrewTrouble: event,
      lastCrewTroubleDay: state.dayCount,
      crewTroubleCooldowns: cooldowns,
      paused: true,
    });
  },

  resolveCrewTrouble: (choice) => {
    const state = get();
    const event = state.activeCrewTrouble;
    if (!event) return;
    const outcome = choice.outcome;
    if ((outcome.goldCost ?? 0) > state.gold) {
      get().addNotification('Not enough coin for that decision.', 'warning');
      return;
    }
    if ((outcome.provisionCost ?? 0) > state.provisions) {
      get().addNotification('Not enough provisions for that decision.', 'warning');
      return;
    }

    const leaving = new Set(outcome.crewLeaves ?? []);
    let nextCrew = state.crew
      .filter(member => !leaving.has(member.id))
      .map(member => {
        const moraleDelta = outcome.moraleDelta?.[member.id] ?? 0;
        const health = outcome.healthChange?.[member.id] ?? member.health;
        const heartsDelta = outcome.heartsDelta?.[member.id] ?? 0;
        const role = outcome.roleChange?.crewId === member.id ? outcome.roleChange.role : member.role;
        return {
          ...member,
          role,
          morale: Math.max(0, Math.min(100, member.morale + moraleDelta)),
          health,
          hearts: {
            ...member.hearts,
            current: Math.max(0, Math.min(member.hearts.max, member.hearts.current + heartsDelta)),
          },
        };
      });

    if (outcome.roleChange?.role === 'Captain') {
      nextCrew = nextCrew.map(member =>
        member.id !== outcome.roleChange!.crewId && member.role === 'Captain'
          ? { ...member, role: 'Sailor' as CrewRole }
          : member
      );
    }

    let nextRelations = state.crewRelations.filter(relation => !leaving.has(relation.aId) && !leaving.has(relation.bId));
    if (outcome.relationDelta) {
      const { aId, bId, affinity = 0, tension = 0, tag } = outcome.relationDelta;
      const id = [aId, bId].sort().join(':');
      const existing = nextRelations.find(relation => relation.id === id);
      const relation: CrewRelation = existing
        ? {
            ...existing,
            affinity: Math.max(-100, Math.min(100, existing.affinity + affinity)),
            tension: Math.max(0, Math.min(100, existing.tension + tension)),
            tags: tag && !existing.tags.includes(tag) ? [...existing.tags, tag].slice(-4) : existing.tags,
            lastEventDay: state.dayCount,
          }
        : {
            id,
            aId,
            bId,
            affinity: Math.max(-100, Math.min(100, affinity)),
            tension: Math.max(0, Math.min(100, tension)),
            tags: tag ? [tag] : [],
            lastEventDay: state.dayCount,
          };
      nextRelations = [...nextRelations.filter(r => r.id !== id), relation];
    }

    let nextStatuses = state.crewStatuses.filter(status => !leaving.has(status.crewId) && !leaving.has(status.otherCrewId));
    if (outcome.addStatus) {
      const status = outcome.addStatus;
      nextStatuses = [...nextStatuses, {
        id: generateId(),
        crewId: status.crewId,
        otherCrewId: status.otherCrewId,
        text: status.text,
        tone: status.tone,
        severity: status.severity,
        createdDay: state.dayCount,
        expiresDay: state.dayCount + status.durationDays,
      }].sort((a, b) => b.severity - a.severity).slice(0, 6);
    }

    set({
      gold: state.gold - (outcome.goldCost ?? 0),
      provisions: Math.max(0, state.provisions - (outcome.provisionCost ?? 0)),
      crew: nextCrew,
      crewRelations: nextRelations,
      crewStatuses: nextStatuses,
      activeCrewTrouble: null,
      paused: false,
    });

    if (outcome.journalEntry) get().addJournalEntry('crew', outcome.journalEntry);
    if (leaving.size > 0) {
      const names = state.crew.filter(member => leaving.has(member.id)).map(member => member.name).join(', ');
      get().addNotification(`${names} left the crew.`, 'warning', { tier: 'event', subtitle: event.title });
    } else {
      get().addNotification(choice.label, 'info', { tier: 'event', subtitle: event.title });
    }
    if (nextCrew.length === 0) {
      get().triggerGameOver('The last of your crew has left the ship.');
    }
  },

  dismissCrewTrouble: () => {
    set({ activeCrewTrouble: null, paused: false });
  },

  discoverPort: (id) => {
    const state = get();
    if (!state.discoveredPorts.includes(id)) {
      const port = state.ports.find(p => p.id === id);
      set({ discoveredPorts: [...state.discoveredPorts, id] });
      if (port) {
        get().addNotification(`Discovered ${port.name}!`, 'success');
        get().addJournalEntry('navigation', portDiscoverTemplate(port.name), port.name);
        get().setCaptainExpression('Curious', 4000);
        sfxDiscovery();
        // Navigator and captain gain XP for discovery
        const nav = state.crew.find(c => c.role === 'Navigator');
        const cap = getCaptain(state);
        let crew = state.crew;
        if (nav) {
          const r = grantCrewXp(crew, nav.id, 15 + Math.floor(Math.random() * 10));
          crew = r.crew;
          if (r.levelledUp) get().addNotification(`${r.levelledUp} leveled up to Lvl ${r.newLevel}!`, 'success', { tier: 'event', subtitle: 'LEVEL UP' });
        }
        if (cap && cap.id !== nav?.id) {
          const r = grantCrewXp(crew, cap.id, 10);
          crew = r.crew;
          if (r.levelledUp) get().addNotification(`${r.levelledUp} leveled up to Lvl ${r.newLevel}!`, 'success', { tier: 'event', subtitle: 'LEVEL UP' });
        }
        set({ crew });
        get().maybeTriggerCrewTrouble('discovery');
      }
    }
  },
  
  addNotification: (message, type = 'info', opts) => set((state) => {
    // Derive tier: explicit > openPortId → port > size:'grand' → event > ticker
    const tier: NotificationTier = opts?.tier
      ?? (opts?.openPortId ? 'port' : (opts?.size === 'grand' ? 'event' : 'ticker'));

    const now = Date.now();

    // Dedupe: if an identical toast is already live, refresh its timestamp
    // (bumps its visible duration) instead of stacking a duplicate.
    // - port: same openPortId within 10s
    // - other: same message+tier within 2s (strict-mode double-fire guard)
    const DEDUPE_PORT_MS = 10_000;
    const DEDUPE_MSG_MS = 2_000;
    const dupIdx = state.notifications.findIndex(n => {
      if (opts?.openPortId && n.openPortId === opts.openPortId && now - n.timestamp < DEDUPE_PORT_MS) return true;
      if (n.message === message && n.tier === tier && now - n.timestamp < DEDUPE_MSG_MS) return true;
      return false;
    });
    if (dupIdx >= 0) {
      const bumped = state.notifications.map((n, i) => i === dupIdx ? { ...n, timestamp: now } : n);
      return { notifications: bumped };
    }

    const incoming: Notification = {
      id: generateId(), message, type, tier, timestamp: now,
      subtitle: opts?.subtitle, imageCandidates: opts?.imageCandidates, openPortId: opts?.openPortId,
    };

    // Per-tier cap: port 1, event 2, ticker 3. Evict oldest within tier.
    const CAPS: Record<NotificationTier, number> = { port: 1, event: 2, ticker: 3 };
    const next = [...state.notifications, incoming];
    const byTier: Record<NotificationTier, Notification[]> = { port: [], event: [], ticker: [] };
    for (const n of next) byTier[n.tier].push(n);
    const trimmed = (['port', 'event', 'ticker'] as NotificationTier[])
      .flatMap(t => byTier[t].slice(-CAPS[t]))
      .sort((a, b) => a.timestamp - b.timestamp);

    return { notifications: trimmed };
  }),
  
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

  // ── Quest leads ────────────────────────────────────────────────────────────
  // The trunk type lives in src/types/leads.ts; resolution helpers in
  // src/utils/leadResolution.ts. addLead is the silent accept path — sources
  // (tavern, crew, POI, governor) own their own "Offer" UX before calling
  // this. resolve/fail/expire all fire QuestToasts and journal entries so
  // the panel and toast surfaces update from the same path.
  addLead: (lead) => set((state) => {
    const cap = LEAD_CAPS[lead.source as LeadSource];
    if (cap != null) {
      const activeOfSource = state.leads.filter(l => l.source === lead.source && l.status === 'active').length;
      if (activeOfSource >= cap) return {};
    }
    return { leads: [...state.leads, lead] };
  }),

  resolveLead: (leadId) => {
    const state = get();
    const lead = state.leads.find(l => l.id === leadId);
    if (!lead || lead.status !== 'active') return;

    if (lead.reward.gold) {
      set({ gold: state.gold + lead.reward.gold });
    }
    if (lead.reward.rep) {
      get().adjustReputation(lead.reward.rep.faction as Nationality, lead.reward.rep.amount);
    }

    const toast: QuestToastEntry = {
      id: generateId(),
      variant: 'resolved',
      leadId: lead.id,
      title: lead.title,
      giverName: lead.giverName,
      template: lead.template,
      rewardReveal: formatRewardReveal(lead),
    };

    set((s) => ({
      leads: s.leads.filter(l => l.id !== leadId),
      questToasts: [...s.questToasts, toast],
    }));
    get().addJournalEntry('encounter', `Resolved: ${lead.title}.`);
  },

  failLead: (leadId) => {
    const state = get();
    const lead = state.leads.find(l => l.id === leadId);
    if (!lead || lead.status !== 'active') return;
    const toast: QuestToastEntry = {
      id: generateId(),
      variant: 'failed',
      leadId: lead.id,
      title: lead.title,
      giverName: lead.giverName,
      template: lead.template,
    };
    set((s) => ({
      leads: s.leads.filter(l => l.id !== leadId),
      questToasts: [...s.questToasts, toast],
    }));
    get().addJournalEntry('encounter', `Failed: ${lead.title}.`);
  },

  expireLead: (leadId) => {
    const state = get();
    const lead = state.leads.find(l => l.id === leadId);
    if (!lead || lead.status !== 'active') return;
    const toast: QuestToastEntry = {
      id: generateId(),
      variant: 'expired',
      leadId: lead.id,
      title: lead.title,
      giverName: lead.giverName,
      template: lead.template,
    };
    set((s) => ({
      leads: s.leads.filter(l => l.id !== leadId),
      questToasts: [...s.questToasts, toast],
    }));
    get().addJournalEntry('encounter', `Lapsed: ${lead.title}.`);
  },

  dismissQuestToast: (toastId) => set((state) => ({
    questToasts: state.questToasts.filter(t => t.id !== toastId),
  })),

  setActivePort: (port) => set({ activePort: port }),
  
  buyCommodity: (commodity, amount) => {
    const state = get();
    const port = state.activePort;
    if (!port) return;

    const currentCargoWeight = calculateCargoWeight(state.cargo);
    const quote = quoteBuyCommodity({
      commodity,
      amount,
      port,
      cargo: state.cargo,
      cargoWeight: currentCargoWeight,
      cargoCapacity: state.stats.cargoCapacity,
      gold: state.gold,
      crew: state.crew,
      knowledgeState: state.knowledgeState,
    });

    if (quote.blockReason === 'no-space') {
      get().addNotification('Not enough cargo space!', 'warning');
      return;
    }

    // War Rockets are bulky and volatile — the hold can only take 20 before
    // the magazine is considered full.
    if (quote.blockReason === 'hold-cap') {
      get().addNotification('Magazine full — hold caps at 20 war rockets.', 'warning');
      return;
    }

    if (quote.amount > 0 && state.gold >= quote.total && port.inventory[commodity] >= quote.amount) {
      const newInventory = { ...port.inventory, [commodity]: port.inventory[commodity] - quote.amount };
      // Recalculate prices based on new inventory levels
      const newPrices = { ...port.prices };
      for (const c of ALL_COMMODITIES_FULL) {
        if (port.basePrices[c] > 0) {
          const mod = supplyDemandModifier(newInventory[c], port.baseInventory[c]);
          newPrices[c] = Math.max(1, Math.round(port.basePrices[c] * mod));
        }
      }

      // Roll purchase outcome: only blind (Level 0) buys can be fraudulent or
      // serendipitous. Identified buys are always genuine.
      const outcome = quote.knowledgeLevel === 0
        ? rollPurchaseOutcome(commodity, port.id, MARKET_TRUST[port.id] ?? 0.5)
        : { kind: 'genuine' as const };
      const actualCommodity = outcome.kind === 'genuine' ? commodity : outcome.actual;

      const newStack: CargoStack = {
        id: generateId(),
        commodity,
        actualCommodity,
        amount: quote.amount,
        acquiredPort: port.id,
        acquiredPortName: port.name,
        acquiredDay: state.dayCount,
        purchasePrice: quote.unitPrice,
        knowledgeAtPurchase: quote.knowledgeLevel,
        ownership: 'owned',
      };

      set({
        gold: state.gold - quote.total,
        cargo: { ...state.cargo, [commodity]: state.cargo[commodity] + quote.amount },
        cargoProvenance: [...state.cargoProvenance, newStack],
        activePort: { ...port, inventory: newInventory, prices: newPrices },
        ports: state.ports.map(p => p.id === port.id
          ? { ...p, inventory: newInventory, prices: newPrices }
          : p
        ),
      });

      get().addNotification(`Bought ${quote.amount} ${quote.displayName} for ${quote.total}g`, 'success');
      get().addJournalEntry('commerce', commerceBuyTemplate(commodity, quote.amount, quote.total, port.name), port.name);
      const faction = PORT_FACTION[port.id];
      if (faction) get().adjustReputation(faction, 2);
      const factor = state.crew.find(c => c.role === 'Factor') ?? state.crew.find(c => c.role === 'Captain');
      if (factor) {
        get().addCrewHistory(factor.id, `Negotiated purchase of ${quote.amount} ${quote.displayName} at ${port.name}`);
        const tradeXp = 3 + Math.floor(quote.total / 100);
        const r = grantCrewXp(get().crew, factor.id, tradeXp);
        set({ crew: r.crew });
      if (r.levelledUp) get().addNotification(`${r.levelledUp} leveled up to Lvl ${r.newLevel}!`, 'success', { tier: 'event', subtitle: 'LEVEL UP' });
      }
      get().maybeTriggerCrewTrouble('commerce');
    } else {
      get().addNotification('Not enough gold or port inventory!', 'error');
    }
  },
  
  sellCommodity: (commodity, amount) => {
    const state = get();
    const port = state.activePort;
    if (!port) return;
    if (state.cargo[commodity] < amount) return;

    const currentCargoWeight = calculateCargoWeight(state.cargo);
    const quote = quoteSellCommodity({
      commodity,
      amount,
      port,
      cargo: state.cargo,
      cargoWeight: currentCargoWeight,
      cargoCapacity: state.stats.cargoCapacity,
      gold: state.gold,
      crew: state.crew,
      knowledgeState: state.knowledgeState,
    });
    if (quote.amount <= 0) return;

    const settlement = settleSellCommodity({
      commodity,
      amount: quote.amount,
      port,
      crew: state.crew,
      knowledgeState: state.knowledgeState,
      cargoProvenance: state.cargoProvenance,
    });
    const totalGain = settlement.total;
    const claimedUnitPrice = settlement.total > 0
      ? settlement.total / Math.max(1, quote.amount)
      : 0;
    let reservedForPatrons = 0;
    const obligationReceipts: Record<string, number> = {};
    for (const { stack, taken } of settlement.consumed) {
      if (stack.ownership !== 'commission' || !stack.obligationId) continue;
      const obligation = state.obligations.find((o) => o.id === stack.obligationId && o.status === 'active');
      if (!obligation) continue;
      const stackGross = Math.round(claimedUnitPrice * taken);
      const reserve = Math.min(stackGross, Math.round(stackGross * (1 - obligation.playerShare)));
      reservedForPatrons += reserve;
      obligationReceipts[obligation.id] = (obligationReceipts[obligation.id] ?? 0) + reserve;
    }
    const playerGain = Math.max(0, totalGain - reservedForPatrons);

    // Port inventory increases by the CLAIMED commodity — the buyer still
    // thinks that's what they received (the player only learns on sale). This
    // is a small simplification we can tighten later.
    const newInventory = { ...port.inventory, [commodity]: port.inventory[commodity] + quote.amount };
    const newPrices = { ...port.prices };
    for (const c of ALL_COMMODITIES_FULL) {
      if (port.basePrices[c] > 0) {
        const mod = supplyDemandModifier(newInventory[c], port.baseInventory[c]);
        newPrices[c] = Math.max(1, Math.round(port.basePrices[c] * mod));
      }
    }

    set({
      gold: state.gold + playerGain,
      cargo: { ...state.cargo, [commodity]: state.cargo[commodity] - quote.amount },
      cargoProvenance: settlement.provenanceAfter,
      knowledgeState: settlement.knowledgeAfter,
      obligations: Object.keys(obligationReceipts).length === 0
        ? state.obligations
        : state.obligations.map((obligation) => obligationReceipts[obligation.id]
          ? { ...obligation, settledGold: obligation.settledGold + obligationReceipts[obligation.id] }
          : obligation
        ),
      activePort: { ...port, inventory: newInventory, prices: newPrices },
      ports: state.ports.map(p => p.id === port.id
        ? { ...p, inventory: newInventory, prices: newPrices }
        : p
      ),
    });

    // Standard sell notification + journal for the honest portion.
    get().addNotification(`Sold ${quote.amount} ${commodity} for ${playerGain}g`, 'success', reservedForPatrons > 0 ? { subtitle: `${reservedForPatrons}g reserved for patrons` } : undefined);
    get().addJournalEntry('commerce', commerceSellTemplate(commodity, quote.amount, playerGain, port.name), port.name);

    // Reveals: one notification + journal entry per mislabeled stack consumed.
    for (const r of settlement.reveals) {
      const { stack, taken, claimedUnitPrice, actualUnitPrice } = r;
      const delta = (actualUnitPrice - claimedUnitPrice) * taken;
      if (delta < 0) {
        const loss = -delta;
        get().addNotification(
          `"${stack.commodity}" from ${stack.acquiredPortName} was actually ${stack.actualCommodity} — ${loss}g lost`,
          'warning',
          { tier: 'event', subtitle: 'FRAUD REVEALED' },
        );
        get().addJournalEntry(
          'commerce',
          fraudRevealTemplate(stack.commodity, stack.actualCommodity, taken, stack.acquiredPortName, port.name, loss),
          port.name,
        );
      } else {
        get().addNotification(
          `"${stack.commodity}" from ${stack.acquiredPortName} was actually ${stack.actualCommodity} — +${delta}g beyond expectation`,
          'success',
          { tier: 'event', subtitle: 'WINDFALL' },
        );
        get().addJournalEntry(
          'commerce',
          windfallRevealTemplate(stack.commodity, stack.actualCommodity, taken, stack.acquiredPortName, port.name, delta),
          port.name,
        );
      }
    }

    const faction = PORT_FACTION[port.id];
    if (faction) get().adjustReputation(faction, 2);
    const factor = state.crew.find(c => c.role === 'Factor') ?? state.crew.find(c => c.role === 'Captain');
    if (factor) {
      get().addCrewHistory(factor.id, `Sold ${quote.amount} ${commodity} for ${totalGain}g at ${port.name}`);
      const tradeXp = 3 + Math.floor(totalGain / 80);
      const r = grantCrewXp(get().crew, factor.id, tradeXp);
      set({ crew: r.crew });
      if (r.levelledUp) get().addNotification(`${r.levelledUp} leveled up to Lvl ${r.newLevel}!`, 'success', { tier: 'event', subtitle: 'LEVEL UP' });
    }
    // Captain reacts to profitable sale
    get().setCaptainExpression(totalGain >= 200 ? 'Smug' : 'Friendly', 3000);

    // Resolve any active leads that match this sale (currently just the
    // starter quest's "first profit at a foreign port" predicate). One sale
    // can consume multiple cargo stacks from different acquired ports — any
    // profitable foreign-acquired stack satisfies the predicate.
    const profitableForeignSale = settlement.consumed.some(({ stack, taken }) => {
      if (stack.acquiredPort === port.id || stack.acquiredPort === 'unknown') return false;
      const stackNet = (claimedUnitPrice - stack.purchasePrice) * taken;
      return stackNet > 0;
    });
    if (profitableForeignSale) {
      const sale: SaleEvent = {
        commodity,
        amount: quote.amount,
        sellPort: port.id,
        acquiredPort: settlement.consumed[0]?.stack.acquiredPort ?? '',
        netProfit: 1, // any positive — predicate is binary
      };
      for (const lead of get().leads) {
        if (saleResolvesStarterLead(lead, sale)) get().resolveLead(lead.id);
      }
    }
    get().maybeTriggerCrewTrouble('commerce');
  },

  drawCredit: (amount) => {
    const state = get();
    const port = state.activePort;
    if (!port || amount <= 0) return;
    const faction = PORT_FACTION[port.id];
    if (!faction) return;
    const reputation = state.reputation[faction] ?? 0;
    const existingDebt = state.obligations
      .filter((o) => o.status === 'active' && o.type === 'credit' && o.faction === faction)
      .reduce((sum, o) => sum + Math.max(0, o.amountDue - o.settledGold), 0);
    const limit = Math.max(80, 220 + reputation * 4);
    const available = Math.max(0, limit - existingDebt);
    const borrowed = Math.min(amount, available);
    if (borrowed <= 0) {
      get().addNotification('No further credit is offered here.', 'warning');
      return;
    }
    const patron = patronForFaction(faction, port.id);
    const due = Math.round(borrowed * 1.18);
    const obligation: Obligation = {
      id: generateId(),
      type: 'credit',
      patron,
      faction,
      portIds: [port.id],
      dueDay: state.dayCount + 60,
      principal: borrowed,
      amountDue: due,
      settledGold: 0,
      playerShare: 1,
      status: 'active',
      note: `${patron} advanced ${borrowed}g against your reputation and cargo.`,
    };
    set({ gold: state.gold + borrowed, obligations: [...state.obligations, obligation] });
    get().addNotification(`Drew ${borrowed}g in credit.`, 'success', { subtitle: `${due}g due by Day ${obligation.dueDay}` });
    get().addJournalEntry('commerce', `${patron} extended ${borrowed}g in credit at ${port.name}; ${due}g is due by Day ${obligation.dueDay}.`, port.name);
  },

  repayObligation: (obligationId) => {
    const state = get();
    const obligation = state.obligations.find((o) => o.id === obligationId);
    if (!obligation || obligation.status !== 'active') return;
    const remaining = Math.max(0, obligation.amountDue - obligation.settledGold);
    if (remaining <= 0) {
      get().settleObligation(obligationId);
      return;
    }
    const payment = Math.min(state.gold, remaining);
    if (payment <= 0) {
      get().addNotification('No coin available for repayment.', 'warning');
      return;
    }
    set({
      gold: state.gold - payment,
      obligations: state.obligations.map((o) => o.id === obligationId
        ? { ...o, settledGold: o.settledGold + payment }
        : o
      ),
    });
    get().addNotification(`Paid ${payment}g toward ${obligation.patron}.`, 'success');
  },

  settleObligation: (obligationId) => {
    const state = get();
    const obligation = state.obligations.find((o) => o.id === obligationId);
    if (!obligation || obligation.status !== 'active') return;
    if (obligation.settledGold < obligation.amountDue) {
      get().addNotification(`${obligation.patron} still expects ${obligation.amountDue - obligation.settledGold}g.`, 'warning');
      return;
    }
    const portName = state.activePort?.name ?? 'port';
    set({
      obligations: state.obligations.map((o) => o.id === obligationId ? { ...o, status: 'settled' } : o),
      cargoProvenance: state.cargoProvenance.map((stack) => stack.obligationId === obligationId
        ? { ...stack, ownership: 'owned', obligationId: undefined }
        : stack
      ),
    });
    get().adjustReputation(obligation.faction, 4);
    get().addNotification(`Settled account with ${obligation.patron}.`, 'success');
    get().addJournalEntry('commerce', `Settled account with ${obligation.patron} at ${portName}.`, portName);
  },

  advanceTime: (delta) => {
    const state = get();
    const newTime = state.timeOfDay + delta;
    const wrapped = newTime >= 24;

    // Wind drifts over time using sine waves at different frequencies.
    const t = state.dayCount + newTime / 24;
    const dirDrift = Math.sin(t * 0.7) * 0.3 + Math.sin(t * 1.9) * 0.15 + Math.sin(t * 4.3) * 0.05;
    const newWindDir = (state.windDirection + dirDrift * delta * 0.12) % (Math.PI * 2);
    const speedBase = 0.55 + Math.sin(t * 0.5) * 0.25 + Math.sin(t * 1.7) * 0.1 + Math.sin(t * 3.1) * 0.05;
    // Heavy rain bumps the wind so streaks slant harder and trees thrash.
    const stormBoost = state.weather.intensity * 0.35;
    const newWindSpeed = Math.max(0.1, Math.min(1, speedBase + stormBoost));

    // Ease weather intensity toward its target. Frame-rate-independent;
    // closes ~half the gap per game-hour, so visible fades take a few seconds.
    const weather = state.weather;
    const k = 1 - Math.exp(-delta * 0.6);
    const newWeatherIntensity = weather.intensity + (weather.targetIntensity - weather.intensity) * k;

    set({
      timeOfDay: newTime % 24,
      dayCount: wrapped ? state.dayCount + 1 : state.dayCount,
      windDirection: newWindDir < 0 ? newWindDir + Math.PI * 2 : newWindDir,
      windSpeed: newWindSpeed,
      weather: { ...weather, intensity: newWeatherIntensity },
    });

    // Daily lead deadline sweep — expire any whose deadline has passed.
    if (wrapped) {
      const newDay = state.dayCount + 1;
      for (const lead of leadsToExpire(state.leads, newDay)) {
        get().expireLead(lead.id);
      }
      const defaulted = state.obligations.filter((obligation) =>
        obligation.status === 'active' &&
        obligation.settledGold < obligation.amountDue &&
        newDay > obligation.dueDay + 30
      );
      if (defaulted.length > 0) {
        set((s) => ({
          obligations: s.obligations.map((obligation) =>
            defaulted.some((d) => d.id === obligation.id)
              ? { ...obligation, status: 'defaulted' as const }
              : obligation
          ),
        }));
        for (const obligation of defaulted) {
          get().adjustReputation(obligation.faction, -12);
          get().addJournalEntry('commerce', `Defaulted on account with ${obligation.patron}; their factors have marked the debt against us.`);
        }
      }
    }

    // ── Daily tick: port restock (goods drift back toward baseline) ──
    if (wrapped) {
      const restockedPorts = state.ports.map(p => {
        let changed = false;
        const newInv = { ...p.inventory };
        for (const c of ALL_COMMODITIES_FULL) {
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
        for (const c of ALL_COMMODITIES_FULL) {
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
      const rationing = state.rationingDays > 0;
      const dailyConsumption = Math.max(1, Math.ceil(crewCount * (rationing ? 0.25 : 0.5)));
      const hasSurgeon = state.crew.some(c => c.role === 'Surgeon' && c.health === 'healthy');
      const newProvisions = Math.max(0, state.provisions - dailyConsumption);
      const starving = newProvisions === 0;

      // Update crew health & morale
      let deadCrewId: string | null = null;
      let deadCause = '';
      let healedBySurgeon = false;
      const updatedCrew = state.crew.map(c => {
        if (deadCrewId) return c; // only one death per day

        let { health, morale } = c;
        let heartsCurrent = c.hearts.current;
        const heartsMax = c.hearts.max;

        // Starvation and tight-ration effects
        if (starving || rationing) {
          morale = Math.max(0, morale - (starving ? 3 : 1));
          // Healthy crew get scurvy; already-sick crew worsen
          const scurvyChance = starving ? 0.15 : 0.035;
          if (health === 'healthy' && Math.random() < scurvyChance) {
            health = 'scurvy';
            heartsCurrent = Math.max(0, heartsCurrent - 1);
          } else if (health === 'scurvy' && Math.random() < (starving ? 0.12 : 0.035)) {
            health = 'fevered';
            heartsCurrent = Math.max(0, heartsCurrent - 1);
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

        // Surgeon heals one sick crew member per day (not starvation-related).
        // Flag flips to healthy; hearts recover by one (partial — full restore
        // is what tavern rest gives).
        if (hasSurgeon && health !== 'healthy' && !starving && Math.random() < 0.2) {
          health = 'healthy';
          heartsCurrent = Math.min(heartsMax, heartsCurrent + 1);
          healedBySurgeon = true;
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

        return { ...c, health, morale, hearts: { current: heartsCurrent, max: heartsMax } };
      });

      set({ provisions: newProvisions, crew: updatedCrew, rationingDays: Math.max(0, state.rationingDays - 1) });

      // Surgeon gains XP for healing
      if (healedBySurgeon) {
        const surgeon = get().crew.find(c => c.role === 'Surgeon');
        if (surgeon) {
          const r = grantCrewXp(get().crew, surgeon.id, 8 + Math.floor(Math.random() * 5));
          set({ crew: r.crew });
          if (r.levelledUp) get().addNotification(`${r.levelledUp} leveled up to Lvl ${r.newLevel}!`, 'success', { tier: 'event', subtitle: 'LEVEL UP' });
        }
      }

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
      get().rollCrewRelations('daily');
    }
  },
  
  setCameraZoom: (zoom) => set({ cameraZoom: Math.max(10, Math.min(300, zoom)) }),
  setCameraRotation: (rotation) => set({ cameraRotation: rotation }),
  setViewMode: (mode) => set({ viewMode: mode }),
  
  setWorldSeed: (seed) => {
    // Invalidate the snapped-POI cache — terrain shifts with the seed, so
    // a position that snapped onto land last seed may land in water now.
    import('../utils/proximityResolution').then((m) => m.clearSnappedCache()).catch(() => {});
    set({ worldSeed: seed, currentWorldPortId: null });
  },
  startNewGame: ({ faction, portId }) => {
    const start = buildNewGameStart(faction, portId);
    set({
      playerPos: [0, 0, 0],
      playerRot: 0,
      playerVelocity: 0,
      gold: start.gold,
      cargo: start.cargo,
      cargoProvenance: start.cargoProvenance,
      obligations: start.obligations,
      stats: start.stats,
      crew: start.crew,
      crewRelations: start.crewRelations,
      crewStatuses: start.crewStatuses,
      activeCrewTrouble: null,
      lastCrewTroubleDay: -999,
      crewTroubleCooldowns: {},
      ship: start.ship,
      timeOfDay: 8,
      notifications: [],
      leads: [createStarterLead(1, start.startingPortId, start.faction)],
      questToasts: [],
      activePort: null,
      cameraZoom: 50,
      cameraRotation: 0,
      viewMode: 'default',
      playerMode: 'ship',
      walkingPos: [0, 5, 0],
      walkingRot: 0,
      interactionPrompt: null,
      nearestHailableNpc: null,
      discoveredPorts: [],
      activePOI: null,
      discoveredPOIs: [],
      claimedPOIRewards: [],
      poiRewardResults: {},
      chartedRoutes: [],
      reputation: start.reputation,
      npcPositions: [],
      npcShips: [],
      oceanEncounters: [],
      fishShoals: [],
      deadCrew: null,
      gameOver: false,
      gameOverCause: null,
      paused: false,
      anchored: false,
      combatMode: false,
      activeLandWeapon: 'musket',
      requestWorldMap: false,
      currentWorldPortId: start.startingPortId,
      weather: start.weather,
      windDirection: start.windDirection,
      windSpeed: start.windSpeed,
      knowledgeState: start.knowledgeState,
      provisions: 30,
      rationingDays: 0,
      dayCount: 1,
      captainExpression: null,
      pendingAfterNightMusic: false,
    });
    syncLivePlayerMode('ship');
    syncLiveShipTransform([0, 0, 0], 0, 0);
    syncLiveWalkingTransform([0, 5, 0], 0);
  },
  setWorldSize: (size) => set({ worldSize: size }),
  setDevSoloPort: (portId) => set({ devSoloPort: portId }),
  setDevRestPreview: (portId) => set({ devRestPreviewPortId: portId }),
  setPendingAfterNightMusic: (v) => set({ pendingAfterNightMusic: v }),
  setWaterPaletteSetting: (setting) => set({ waterPaletteSetting: setting }),
  setForceMobileLayout: (v) => set({ forceMobileLayout: v }),
  setShipSteeringMode: (mode) => set({ shipSteeringMode: mode }),
  setTouchSailRaised: (v) => set({ touchSailRaised: v }),
  updateRenderDebug: (patch) => set((state) => ({
    renderDebug: { ...state.renderDebug, ...patch }
  })),
  resetRenderDebug: () => set({ renderDebug: DEFAULT_RENDER_DEBUG }),
  setWeather: (patch) => set((state) => ({ weather: { ...state.weather, ...patch } })),
  rerollWeather: () => {
    const state = get();
    const weather = rollWeatherForPortId(state.currentWorldPortId);
    const wind = rollWindForPortId(state.currentWorldPortId, weather);
    set({ weather, windDirection: wind.direction, windSpeed: wind.speed });
  },
  learnAboutCommodity: (commodityId, newLevel, source) => {
    const state = get();
    const current = state.knowledgeState[commodityId] ?? 0;
    if (newLevel <= current) return; // no downgrade

    const commodityName = commodityId;
    const def = COMMODITY_DEFS[commodityId as Commodity];

    set({
      knowledgeState: { ...state.knowledgeState, [commodityId]: newLevel },
    });

    if (newLevel === 1 && current === 0) {
      // Dramatic identification reveal
      get().addNotification(
        `Identified: ${commodityName}`,
        'success',
        {
          size: 'grand',
          subtitle: def?.description ?? `You now recognize this good.`,
          imageCandidates: def?.iconImage ? [def.iconImage] : undefined,
        },
      );
      get().addJournalEntry(
        'commerce',
        `Through ${source}, we identified the mysterious goods as ${commodityName}. ${def?.description ?? ''}`,
        state.activePort?.name,
      );
    } else if (newLevel === 2) {
      get().addNotification(
        `Mastered: ${commodityName}`,
        'legendary',
        {
          size: 'grand',
          subtitle: 'You know the best markets and can spot any fraud.',
          imageCandidates: def?.iconImage ? [def.iconImage] : undefined,
        },
      );
      get().addJournalEntry(
        'commerce',
        `Our expertise in ${commodityName} is now complete. We know the finest grades, the best buyers, and every trick of adulteration.`,
        state.activePort?.name,
      );
    }
  },
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
  fastTravel: (portId, opts) => {
    const state = get();
    const port = getWorldPortById(portId);
    if (!port) return;
    const currentPortId = resolveCampaignPortId(state);
    if (portId === currentPortId) return;
    if (!opts?.force && !canDirectlySail(currentPortId, portId)) {
      get().addNotification(`No direct sea lane to ${port.name} from this harbor.`, 'warning');
      return;
    }
    const travel = estimateSeaTravel(currentPortId, portId);
    const travelDays = opts?.voyage?.actualDays ?? travel?.days ?? 1;
    const travelProvisions = opts?.voyage?.provisionCost ?? Math.ceil(state.crew.length * 0.5) * travelDays;
    const newProvisions = Math.max(0, state.provisions - travelProvisions);
    const hullDamage = opts?.voyage?.hullDamage ?? 0;
    const moraleDelta = opts?.voyage?.moraleDelta ?? 0;
    const newHull = Math.max(0, state.stats.hull - hullDamage);
    const voyageCrew = moraleDelta === 0
      ? state.crew
      : state.crew.map((member) => ({
          ...member,
          morale: Math.max(0, Math.min(100, member.morale + moraleDelta)),
        }));
    // Roll fresh weather for the new harbor based on its climate. Leave
    // intensity at 0 so the rain (if any) fades in over a few seconds rather
    // than snapping on the moment the arrival curtain lifts.
    const arrivalWeather = rollWeatherForPortId(portId);
    const arrivalWind = rollWindForPortId(portId, arrivalWeather);
    set({
      currentWorldPortId: portId,
      playerVelocity: 0,
      playerMode: 'ship',
      activePort: null,
      interactionPrompt: null,
      activePOI: null,
      dayCount: state.dayCount + travelDays,
      timeOfDay: 8,
      provisions: newProvisions,
      stats: { ...state.stats, hull: newHull },
      crew: voyageCrew,
      weather: arrivalWeather,
      windDirection: arrivalWind.direction,
      windSpeed: arrivalWind.speed,
      chartedRoutes: opts?.voyage && !state.chartedRoutes.includes(opts.voyage.routeKey)
        ? [...state.chartedRoutes, opts.voyage.routeKey]
        : state.chartedRoutes,
    });
    syncLiveShipTransform(state.playerPos, state.playerRot, 0);
    const provWarn = newProvisions === 0 ? ' Provisions exhausted!' : newProvisions <= state.crew.length * 2 ? ` Provisions low (${newProvisions}).` : '';
    const hullWarn = hullDamage > 0 ? ` Hull lost ${hullDamage}.` : '';
    get().addNotification(`Arrived at ${port.name} after ${travelDays} days at sea.${provWarn}${hullWarn}`, newProvisions === 0 || hullDamage > 0 ? 'warning' : 'success');
    get().addJournalEntry(
      'navigation',
      opts?.voyage
        ? `After ${travelDays} days sailing from ${opts.voyage.fromPortName}, we arrived at ${port.name}. ${opts.voyage.events.map((event) => event.text).join(' ')}${opts.voyage.chartedRoute ? ` The ${opts.voyage.fromPortName}-${port.name} route is now charted in our books.` : ''}`
        : `After ${travelDays} days sailing, we have arrived at ${port.name}. The crew is relieved to see land again.`,
      port.name,
    );
    if (newHull <= 0) {
      get().triggerGameOver('The ship foundered during the passage and sank before landfall.');
    }
    get().rollCrewRelations('voyage');
  },
  restAtInn: (port) => {
    const state = get();
    const cost = lodgingCost(port.scale);
    if (state.gold < cost) {
      get().addNotification(`The innkeeper turns you away — you cannot afford ${cost} reales.`, 'warning');
      return null;
    }

    // Snapshot pre-rest state so the summary can report deltas
    const before = state.crew.map(c => ({
      id: c.id, morale: c.morale, health: c.health, level: c.level,
      hearts: c.hearts.current, heartsMax: c.hearts.max,
    }));

    // Advance to 8 AM the following morning. If currently before 8 AM, this still
    // resolves to 8 AM the next calendar day (delta is always 8..32, wrapping once).
    const delta = (24 - state.timeOfDay) + 8;
    get().advanceTime(delta);

    // Refresh state after time advance (provisions/health daily tick may have run)
    const post = get();

    const deltas: CrewRestDelta[] = [];
    let workingCrew = post.crew.map(c => {
      const prev = before.find(b => b.id === c.id);
      const moraleBefore = prev?.morale ?? c.morale;
      const healthBefore = prev?.health ?? c.health;
      const heartsBefore = prev?.hearts ?? c.hearts.current;
      const heartsMaxBefore = prev?.heartsMax ?? c.hearts.max;

      const morale = Math.min(100, c.morale + 15);
      let health = c.health;
      if (health !== 'healthy') {
        const chance = (health === 'sick' || health === 'injured') ? 0.4 : 0.15;
        if (Math.random() < chance) health = 'healthy';
      }
      // A night's rest fully refills the vitality meter regardless of whether
      // the underlying condition cleared. The flag may persist (still scurvy
      // in the morning), but the crew member is rested.
      const hearts: Hearts = { current: c.hearts.max, max: c.hearts.max };
      return { c: { ...c, morale, health, hearts }, moraleBefore, healthBefore, heartsBefore, heartsMaxBefore };
    });

    // Grant rest XP: +1 per crew member always, +1 more if this port's
    // culture differs from the crew member's home culture (a Dutch sailor
    // resting in Surat learns more than one resting in Amsterdam).
    let crewAfterXp = workingCrew.map(({ c, moraleBefore, healthBefore, heartsBefore, heartsMaxBefore }) => {
      const homeCulture = nationalityToCulture(c.nationality);
      const foreignCulture = homeCulture !== port.culture;
      const xpGain = foreignCulture ? 2 : 1;
      const xpBonusReason: CrewRestDelta['xpBonusReason'] = foreignCulture
        ? 'foreign-culture'
        : 'foreign-port'; // every rest is at a port, so "home" is unused for now
      return { c, moraleBefore, healthBefore, heartsBefore, heartsMaxBefore, xpGain, xpBonusReason };
    });

    // Apply XP via the existing helper (handles level-ups). Process one
    // crew at a time because grantCrewXp expects a single crewId per call.
    let updatedCrew = crewAfterXp.map(e => e.c);
    for (const entry of crewAfterXp) {
      const result = grantCrewXp(updatedCrew, entry.c.id, entry.xpGain);
      updatedCrew = result.crew;
      const finalMember = updatedCrew.find(m => m.id === entry.c.id)!;
      deltas.push({
        crewId: entry.c.id,
        name: entry.c.name,
        moraleBefore: entry.moraleBefore,
        moraleAfter: finalMember.morale,
        healthBefore: entry.healthBefore,
        healthAfter: finalMember.health,
        heartsBefore: entry.heartsBefore,
        heartsAfter: finalMember.hearts.current,
        heartsMaxBefore: entry.heartsMaxBefore,
        heartsMaxAfter: finalMember.hearts.max,
        xpGained: entry.xpGain,
        xpBonusReason: entry.xpBonusReason,
        levelUp: result.levelledUp === entry.c.id,
        newLevel: result.levelledUp === entry.c.id ? result.newLevel : finalMember.level,
      });
    }

    set({ gold: post.gold - cost, crew: updatedCrew, pendingAfterNightMusic: true });

    // ── Future event hook ─────────────────────────────────────────────
    // This is where a random nighttime event would be rolled — e.g. a
    // tavern-NPC follow-up, two unhappy crew getting drunk and fighting,
    // a stranger leaving a note, a theft, a feverish dream. The event
    // would build on tavern conversation history (see TavernTab's
    // conversationHistory) and crew morale/relationship state. The plan
    // is FF7-style: pre-rendered backdrop reuse + sprite walk-on +
    // dialogue tree. See AGENTS.md "Sleep / inn rest" section.
    // ─────────────────────────────────────────────────────────────────

    const lodgingName = lodgingLabel(port.culture);
    get().addJournalEntry(
      'navigation',
      `We took rooms at the ${lodgingName} in ${port.name} for ${cost} reales. The crew slept under a roof for the first time in weeks.`,
      port.name,
    );
    get().addNotification(`Rested at the ${lodgingName}. Crew morale restored.`, 'success');
    get().rollCrewRelations('rest');

    return {
      portId: port.id,
      portName: port.name,
      cost,
      crewDeltas: deltas,
    };
  },
  setPaused: (paused) => set({ paused }),
  setAnchored: (anchored) => set({ anchored }),
  setCombatMode: (combatMode) => set({ combatMode }),
  setActiveLandWeapon: (w) => {
    const state = get();
    if (!state.landWeapons.includes(w)) return;
    set({ activeLandWeapon: w });
  },
  cycleLandWeapon: () => {
    const state = get();
    if (state.landWeapons.length < 2) return;
    const idx = state.landWeapons.indexOf(state.activeLandWeapon);
    const next = state.landWeapons[(idx + 1) % state.landWeapons.length];
    set({ activeLandWeapon: next });
  },
  buyUpgrade: (upgradeType) => {
    const state = get();
    const upgrade = SHIP_UPGRADES[upgradeType];
    if (state.gold < upgrade.price) {
      get().addNotification('Not enough gold!', 'warning');
      return;
    }
    if (state.shipUpgrades.includes(upgradeType)) {
      get().addNotification('Already installed!', 'warning');
      return;
    }
    // Apply stat changes
    const statChanges = upgrade.apply(state.stats);
    const newStats = { ...state.stats, ...statChanges };
    // Special case: betterProvisions adds provisions directly
    const provBonus = upgradeType === 'betterProvisions' ? 25 : 0;
    set({
      gold: state.gold - upgrade.price,
      stats: newStats,
      shipUpgrades: [...state.shipUpgrades, upgradeType],
      provisions: state.provisions + provBonus,
    });
    get().addNotification(`Installed ${upgrade.name}. ${upgrade.effect}.`, 'success');
    const portName = state.activePort?.name ?? 'port';
    get().addJournalEntry('ship', `Purchased ${upgrade.name} at ${portName} for ${upgrade.price} gold. ${upgrade.description}`, portName);
  },
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
    void npcCargo;
    // XP reward — captain and gunner both gain combat XP, all crew get a small share
    const captainXp = 20 + Math.floor(Math.random() * 30);
    const combatXp = 15 + Math.floor(Math.random() * 20);
    const crewXp = 5 + Math.floor(Math.random() * 10);
    let updatedCrew = state.crew;
    const levelUps: string[] = [];

    // Captain XP
    const captain = getCaptain(state);
    if (captain) {
      const r = grantCrewXp(updatedCrew, captain.id, captainXp);
      updatedCrew = r.crew;
      if (r.levelledUp) levelUps.push(`${r.levelledUp} (Lvl ${r.newLevel})`);
    }
    // Gunner gets combat XP
    const gunnerMember = updatedCrew.find(c => c.role === 'Gunner');
    if (gunnerMember) {
      const r = grantCrewXp(updatedCrew, gunnerMember.id, combatXp);
      updatedCrew = r.crew;
      if (r.levelledUp) levelUps.push(`${r.levelledUp} (Lvl ${r.newLevel})`);
    }
    // All other crew get a small XP share
    for (const c of updatedCrew) {
      if (c.id === captain?.id || c.id === gunnerMember?.id) continue;
      const r = grantCrewXp(updatedCrew, c.id, crewXp);
      updatedCrew = r.crew;
      if (r.levelledUp) levelUps.push(`${r.levelledUp} (Lvl ${r.newLevel})`);
    }

    set({
      crew: updatedCrew,
    });
    // Remove from npcShips
    set((s) => ({ npcShips: s.npcShips.filter(n => n.id !== npcId) }));
    // Notifications
    get().addNotification(`Sank the ${shipName}! Watch for floating salvage.`, 'success', { size: 'grand', subtitle: 'SHIP DEFEATED' });
    for (const lu of levelUps) get().addNotification(`${lu} leveled up!`, 'success', { tier: 'event', subtitle: 'LEVEL UP' });
    // Captain savors victory
    get().setCaptainExpression('Smug', 5000);
    // Journal
    get().addJournalEntry('encounter',
      `After a fierce exchange, the ${flag} vessel ${shipName} slipped beneath the waves. Some cargo may still be afloat, if we can reach it before the sea takes it.`);
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
    // Captain mourns the loss
    get().setCaptainExpression('Melancholy', 6000);
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
