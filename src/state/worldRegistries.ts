// Module-level singletons populated by World.tsx during world generation
// and read by other systems (Player, ShiftSelectOverlay, GameScene, WorldMap).
// Kept outside the React tree so they're cheap to read each frame without
// re-renders or store subscriptions.

import type { TreeImpactKind } from '../utils/impactShakeState';
import type { FishShoalEntry } from '../store/gameStore';
import type { SpeciesInfo } from '../components/Grazers';

export type { FishShoalEntry };

export type CrabEntry = { position: [number, number, number]; rotation: number };
export interface AnimalMarker { position: [number, number, number] }
export interface TreeImpactTarget {
  kind: TreeImpactKind;
  index: number;
  x: number;
  y: number;
  z: number;
  radius: number;
}

// ── Crabs ────────────────────────────────────────────────────────────────────
let _crabData: CrabEntry[] = [];
let _collectedCrabs = new Set<number>();

export function getCrabData(): CrabEntry[] { return _crabData; }
export function getCollectedCrabs(): Set<number> { return _collectedCrabs; }
export function collectCrabAt(index: number): void { _collectedCrabs.add(index); }
export function setCrabData(data: CrabEntry[]): void {
  _crabData = data;
  _collectedCrabs = new Set();
}

// ── Fish shoals (synced from store for shift-select overlay) ─────────────────
let _fishShoalData: FishShoalEntry[] = [];
export function getFishShoalData(): FishShoalEntry[] { return _fishShoalData; }
export function setFishShoalData(data: FishShoalEntry[]): void { _fishShoalData = data; }

// ── Animal markers + species info for the full-size map overlay ──────────────
let _grazerMapData: AnimalMarker[] = [];
let _primateMapData: AnimalMarker[] = [];
let _reptileMapData: AnimalMarker[] = [];
let _wadingBirdMapData: AnimalMarker[] = [];
let _grazerSpeciesMap: SpeciesInfo | undefined;
let _primateSpeciesMap: SpeciesInfo | undefined;
let _reptileSpeciesMap: SpeciesInfo | undefined;
let _wadingSpeciesMap: SpeciesInfo | undefined;

export function getAnimalMapData() {
  return {
    grazers: _grazerMapData,
    primates: _primateMapData,
    reptiles: _reptileMapData,
    wadingBirds: _wadingBirdMapData,
    grazerSpecies: _grazerSpeciesMap,
    primateSpecies: _primateSpeciesMap,
    reptileSpecies: _reptileSpeciesMap,
    wadingSpecies: _wadingSpeciesMap,
  };
}

export function setAnimalMapData(data: {
  grazers: AnimalMarker[];
  primates: AnimalMarker[];
  reptiles: AnimalMarker[];
  wadingBirds: AnimalMarker[];
  grazerSpecies?: SpeciesInfo;
  primateSpecies?: SpeciesInfo;
  reptileSpecies?: SpeciesInfo;
  wadingSpecies?: SpeciesInfo;
}): void {
  _grazerMapData = data.grazers;
  _primateMapData = data.primates;
  _reptileMapData = data.reptiles;
  _wadingBirdMapData = data.wadingBirds;
  _grazerSpeciesMap = data.grazerSpecies;
  _primateSpeciesMap = data.primateSpecies;
  _reptileSpeciesMap = data.reptileSpecies;
  _wadingSpeciesMap = data.wadingSpecies;
}

// ── Tree impact targets ──────────────────────────────────────────────────────
let _treeImpactTargets: TreeImpactTarget[] = [];
export function getTreeImpactTargets(): TreeImpactTarget[] { return _treeImpactTargets; }
export function setTreeImpactTargets(targets: TreeImpactTarget[]): void {
  _treeImpactTargets = targets;
}
