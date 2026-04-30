import { useSyncExternalStore } from 'react';
import type { Nationality } from '../store/gameStore';
import type { FigureType, PedestrianType } from './pedestrianSystem';

export interface PresentPedestrian {
  id: string;
  buildingId: string;
  name: string;
  role: string;
  nationality: Nationality;
  figureType: FigureType;
  pedestrianType: PedestrianType;
}

let snapshot: Record<string, PresentPedestrian[]> = {};
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function publishPedestrianPresence(next: Record<string, PresentPedestrian[]>): void {
  snapshot = next;
  emit();
}

export function clearPedestrianPresence(): void {
  if (Object.keys(snapshot).length === 0) return;
  snapshot = {};
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return snapshot;
}

export function useBuildingPresence(buildingId: string | undefined, max = 4): PresentPedestrian[] {
  const all = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  if (!buildingId) return [];
  return (all[buildingId] ?? []).slice(0, max);
}
