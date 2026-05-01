import type { Compartment, RenderConfig } from './shipTypes';
import { getInterior } from './shipTypes';
import { getHullColumn, getHullGeometry, type HullGeometry } from './shipHullProfile';

export interface CutawayCompartmentBounds {
  compartment: Compartment;
  kind: Compartment['kind'];
  label?: string;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  centerX: number;
  centerY: number;
}

export interface CutawayScene {
  width: number;
  height: number;
  geometry: HullGeometry;
  decks: number[];
  deckRows: number[];
  compartments: CutawayCompartmentBounds[];
}

export function getCutawayScene(config: RenderConfig): CutawayScene {
  const baseGeometry = getHullGeometry(config.shipType, config.width, config.height);
  const geometry: HullGeometry = {
    ...baseGeometry,
    deckY: Math.floor(config.height * 0.5),
    keelY: Math.floor(config.height * 0.84),
  };
  const interior = getInterior(config.shipType);
  const { sternX, bowX, bowOvershoot } = geometry;
  const fullLength = bowX + bowOvershoot - sternX;
  const xEnd = bowX + bowOvershoot;
  const deckRows = interior.decks.map((deckFrac) => {
    const rows: number[] = [];
    for (let x = sternX + 2; x < xEnd - 1; x++) {
      const col = getHullColumn(config.shipType, geometry, config.height, x);
      if (!col) continue;
      rows.push(Math.floor(col.topY + (col.bottomY - col.topY) * deckFrac));
    }
    return median(rows);
  });

  const rowForFraction = (fraction: number, x0: number, x1: number) => {
    const deckIndex = interior.decks.findIndex((deckFrac) => Math.abs(deckFrac - fraction) < 0.001);
    if (deckIndex >= 0) return deckRows[deckIndex];

    const columns: { topY: number; bottomY: number }[] = [];
    for (let x = Math.max(sternX, x0); x <= Math.min(xEnd, x1); x++) {
      const col = getHullColumn(config.shipType, geometry, config.height, x);
      if (col) columns.push(col);
    }
    if (columns.length === 0) return geometry.deckY;

    if (fraction <= 0) return Math.min(...columns.map(col => col.topY + 1));
    if (fraction >= 1) return Math.max(...columns.map(col => col.bottomY - 1));

    const top = Math.min(...columns.map(col => col.topY + 1));
    const bottom = Math.max(...columns.map(col => col.bottomY - 1));
    return Math.floor(top + (bottom - top) * fraction);
  };

  const compartments = interior.compartments.flatMap((comp) => {
    const x0 = Math.floor(sternX + comp.xStart * fullLength);
    const x1 = Math.floor(sternX + comp.xEnd * fullLength);
    const y0 = rowForFraction(comp.yStart, x0, x1);
    const y1 = rowForFraction(comp.yEnd, x0, x1);

    return [{
      compartment: comp,
      kind: comp.kind,
      label: comp.label,
      x0,
      x1,
      y0,
      y1,
      centerX: (x0 + x1) / 2,
      centerY: (y0 + y1) / 2,
    }];
  });

  return {
    width: config.width,
    height: config.height,
    geometry,
    decks: interior.decks,
    deckRows,
    compartments,
  };
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}
