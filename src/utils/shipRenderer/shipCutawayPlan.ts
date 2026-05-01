import type { CompartmentKind, RenderConfig } from './shipTypes';
import { getHullColumn } from './shipHullProfile';
import { getCutawayScene, type CutawayCompartmentBounds, type CutawayScene } from './shipCutawayScene';

export interface CutawayRoomPlan extends CutawayCompartmentBounds {
  displayLabel: string | null;
  labelX: number;
  labelY: number;
}

export interface CutawayWalkLane {
  id: string;
  kind: CompartmentKind | 'mainDeck' | 'quarterdeck';
  x0: number;
  x1: number;
  y: number;
}

export interface CutawayStationPoint {
  id: string;
  kind: CompartmentKind | 'mast' | 'pump';
  x: number;
  y: number;
}

export interface CutawayRenderPlan {
  scene: CutawayScene;
  detail: 'compact' | 'full';
  rooms: CutawayRoomPlan[];
  deckFractions: number[];
  deckRows: number[];
  lanes: CutawayWalkLane[];
  stations: CutawayStationPoint[];
}

const LABELS: Record<string, string> = {
  "CAPT'N": 'CAPTAIN',
  BERTHS: 'BERTHS',
  HOLD: 'CARGO',
  CARGO: 'CARGO',
  GALLEY: 'GALLEY',
  FORE: 'FORE',
  POWDER: 'POWDER',
  'LOWER HOLD': 'LOWER HOLD',
  BILGE: 'BILGE',
};

export function buildCutawayPlan(config: RenderConfig): CutawayRenderPlan {
  const scene = getCutawayScene(config);
  const detail = config.width < 130 ? 'compact' : 'full';
  const cargoRoomCount = scene.compartments.filter((room) => room.kind === 'cargoHold').length;
  const rooms = scene.compartments.map((room) => makeRoomPlan(room, detail, cargoRoomCount));
  const lanes = buildLanes(config, scene, rooms);
  const stations = buildStations(scene, rooms);

  return {
    scene,
    detail,
    rooms,
    deckFractions: scene.decks,
    deckRows: scene.deckRows,
    lanes,
    stations,
  };
}

function makeRoomPlan(
  room: CutawayCompartmentBounds,
  detail: CutawayRenderPlan['detail'],
  cargoRoomCount: number
): CutawayRoomPlan {
  const w = room.x1 - room.x0;
  const h = room.y1 - room.y0;
  const label = roomLabel(room, cargoRoomCount);
  const displayLabel = labelForRoom(label, w, h, detail);
  const labelX = displayLabel ? Math.floor((room.x0 + room.x1 - displayLabel.length) / 2) : room.x0;
  const labelY = labelAnchorY(room, h);
  return {
    ...room,
    displayLabel,
    labelX,
    labelY,
  };
}

function roomLabel(room: CutawayCompartmentBounds, cargoRoomCount: number): string | null {
  if (room.kind === 'cargoHold' && !room.label && cargoRoomCount > 1) return null;
  return LABELS[room.label ?? ''] ?? room.label ?? defaultLabel(room.kind);
}

function labelAnchorY(room: CutawayCompartmentBounds, h: number): number {
  const fracByKind: Record<CompartmentKind, number> = {
    captainCabin: 0.34,
    gunDeck: 0.42,
    forecastle: 0.42,
    powder: 0.46,
    berths: 0.4,
    cargoHold: 0.45,
    galley: 0.4,
    lowerHold: 0.42,
    bilge: 0.34,
  };
  const frac = fracByKind[room.kind];
  return Math.max(room.y0 + 1, Math.min(room.y1 - 1, Math.floor(room.y0 + h * frac)));
}

function defaultLabel(kind: CompartmentKind): string {
  switch (kind) {
    case 'captainCabin': return 'CAPTAIN';
    case 'cargoHold': return 'CARGO';
    case 'lowerHold': return 'LOWER HOLD';
    case 'berths': return 'BERTHS';
    case 'galley': return 'GALLEY';
    case 'powder': return 'POWDER';
    case 'forecastle': return 'FORE';
    case 'gunDeck': return 'GUNS';
    case 'bilge': return 'BILGE';
  }
}

function labelForRoom(label: string | null, w: number, h: number, detail: CutawayRenderPlan['detail']): string | null {
  if (!label) return null;
  if (h < 4 || w < 9) return null;
  const insetWidth = w - 4;
  const compact = label.split(' ')[0];
  const spaced = spacedLabel(label);
  const spacedCompact = spacedLabel(compact);

  if (detail === 'compact') {
    if (spacedCompact.length <= insetWidth) return spacedCompact;
    return compact.length <= insetWidth ? compact : null;
  }
  if (spaced.length <= insetWidth) return spaced;
  if (spacedCompact.length <= insetWidth) return spacedCompact;
  return compact.length <= insetWidth ? compact : null;
}

function spacedLabel(label: string): string {
  return label
    .split(' ')
    .map((word) => word.split('').join(' '))
    .join('   ');
}

function buildLanes(
  config: RenderConfig,
  scene: CutawayScene,
  rooms: CutawayRoomPlan[]
): CutawayWalkLane[] {
  const lanes: CutawayWalkLane[] = [];
  const { geometry } = scene;
  const xEnd = geometry.bowX + geometry.bowOvershoot;

  for (const deckFrac of scene.decks) {
    const lanePoints: number[] = [];
    for (let x = geometry.sternX + 2; x < xEnd - 1; x++) {
      const col = getHullColumn(config.shipType, geometry, config.height, x);
      if (!col) continue;
      const y = Math.floor(col.topY + (col.bottomY - col.topY) * deckFrac) - 1;
      if (y > col.topY && y < col.bottomY) lanePoints.push(y);
    }
    if (lanePoints.length > 0) {
      const y = median(lanePoints);
      lanes.push({ id: `deck-${deckFrac}`, kind: 'mainDeck', x0: geometry.sternX + 4, x1: xEnd - 4, y });
    }
  }

  for (const room of rooms) {
    if (room.y1 - room.y0 < 5 || room.x1 - room.x0 < 8) continue;
    lanes.push({
      id: `${room.kind}-${room.x0}`,
      kind: room.kind,
      x0: room.x0 + 2,
      x1: room.x1 - 2,
      y: room.y1 - 2,
    });
  }

  return lanes;
}

function buildStations(scene: CutawayScene, rooms: CutawayRoomPlan[]): CutawayStationPoint[] {
  const stations: CutawayStationPoint[] = [];
  for (const room of rooms) {
    if (room.kind === 'galley') stations.push({ id: 'galley-stove', kind: 'galley', x: room.x0 + 3, y: room.y1 - 2 });
    if (room.kind === 'berths') stations.push({ id: 'sick-berth', kind: 'berths', x: room.centerX, y: room.y0 + 3 });
    if (room.kind === 'powder') stations.push({ id: 'powder-room', kind: 'powder', x: room.centerX, y: room.y1 - 2 });
    if (room.kind === 'cargoHold' || room.kind === 'lowerHold') {
      stations.push({ id: `cargo-${room.x0}`, kind: room.kind, x: room.centerX, y: room.y1 - 2 });
    }
  }

  const deckY = Math.floor(scene.geometry.deckY - 2);
  const mastXs = [0.32, 0.5, 0.68].map(t => Math.floor(scene.geometry.sternX + scene.geometry.length * t));
  for (let i = 0; i < mastXs.length; i++) {
    stations.push({ id: `mast-${i}`, kind: 'mast', x: mastXs[i], y: deckY });
  }
  return stations;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}
