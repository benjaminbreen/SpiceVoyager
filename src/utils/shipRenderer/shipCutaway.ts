// Cutaway / wireframe interior view — shows the same hull silhouette but
// reveals decks, bulkheads, cargo fill, crew berths, and other
// compartments driven by game state. Inspired by the cross-section
// diagrams in The Life Aquatic with Steve Zissou.

import { CanvasContext, COLORS } from './shipCanvas';
import type { RenderConfig, Compartment } from './shipTypes';
import { getInterior } from './shipTypes';
import { getHullGeometry, getHullColumn } from './shipHullProfile';

export interface CutawayState {
  cargoUsed: number;      // units currently carried
  cargoMax: number;       // capacity
  crewCount: number;      // living crew aboard
  berthsMax: number;      // total bunks (usually crewCount + a few spares)
  powderPct: number;      // 0-1, powder magazine fill
  provisions: number;     // raw provisions count (0-60ish)
  provisionsMax: number;  // target provision capacity for fill fraction
  timeOfDay?: number;     // 0-24, used for small decorative flourishes
}

const EMPTY_STATE: CutawayState = {
  cargoUsed: 0,
  cargoMax: 100,
  crewCount: 0,
  berthsMax: 8,
  powderPct: 0,
  provisions: 30,
  provisionsMax: 60,
};

export function drawCutaway(
  ctx: CanvasContext,
  config: RenderConfig,
  state: CutawayState,
  time: number
) {
  const merged = { ...EMPTY_STATE, ...state };
  const geom = getHullGeometry(config.shipType, config.width, config.height);
  const interior = getInterior(config.shipType);

  // 1. Draw the hull outline (not filled — this is the silhouette frame).
  drawHullOutline(ctx, config, geom, time);

  // 2. Compute per-compartment bounding boxes in pixel space, then draw
  //    decks, bulkheads, and compartment contents.
  const bounds = getInteriorBounds(config, geom);
  drawDecksAndBulkheads(ctx, config, geom, interior.decks);
  drawCompartments(ctx, config, geom, bounds, interior.compartments, merged, time);

  // 3. Mast stubs (where they rise out of the deck) — short vertical lines
  //    above the silhouette, plus a fluttering flag for continuity with the
  //    exterior view.
  drawMastStubs(ctx, config, geom, time);

  // 4. Waterline underneath.
  drawWaterline(ctx, config, time);
}

// ── Hull outline (shared silhouette) ────────────────────────────────────────

function drawHullOutline(
  ctx: CanvasContext,
  config: RenderConfig,
  geom: ReturnType<typeof getHullGeometry>,
  _time: number
) {
  const { sternX, bowX, bowOvershoot } = geom;
  const { shipType, width, height } = config;

  let prevTop: number | null = null;
  let prevBot: number | null = null;

  for (let x = sternX; x <= bowX + bowOvershoot; x++) {
    const col = getHullColumn(shipType, geom, height, x);
    if (!col) continue;
    const { topY, bottomY } = col;

    // Top edge (gunwale / deck line)
    if (prevTop === null) {
      ctx.draw(x, topY, '╱', COLORS.hullOutline);
    } else {
      const dy = topY - prevTop;
      let ch = '─';
      if (dy < -0.5) ch = '╱';
      else if (dy > 0.5) ch = '╲';
      ctx.draw(x, topY, ch, COLORS.hullOutline);
    }

    // Bottom edge (keel curve)
    if (prevBot === null) {
      ctx.draw(x, bottomY, '╲', COLORS.hullOutline);
    } else {
      const dy = bottomY - prevBot;
      let ch = '─';
      if (dy < -0.5) ch = '╱';
      else if (dy > 0.5) ch = '╲';
      ctx.draw(x, bottomY, ch, COLORS.hullOutline);
    }

    prevTop = topY;
    prevBot = bottomY;
  }

  // Stern & bow end-caps: close the silhouette with vertical strokes.
  const sternCol = getHullColumn(shipType, geom, height, sternX);
  if (sternCol) {
    for (let y = sternCol.topY; y <= sternCol.bottomY; y++) {
      ctx.draw(sternX, y, '│', COLORS.hullOutline);
    }
  }
  const bowEndX = bowX + bowOvershoot;
  const bowCol = getHullColumn(shipType, geom, height, bowEndX);
  if (bowCol) {
    for (let y = bowCol.topY; y <= bowCol.bottomY; y++) {
      ctx.draw(bowEndX, y, '│', COLORS.hullOutline);
    }
  }

  void width;
}

// ── Interior bounding box ───────────────────────────────────────────────────

interface InteriorBounds {
  xStartPx: number;
  xEndPx: number;
  yTopPx: (t: number) => number; // maps x-fraction 0..1 to the deck y for that column
  yBottomPx: (t: number) => number; // same, for keel
}

function getInteriorBounds(
  config: RenderConfig,
  geom: ReturnType<typeof getHullGeometry>
): InteriorBounds {
  const { sternX, bowX, length, bowOvershoot } = geom;
  // Inset from the hull outline by a tiny margin so contents don't sit on the line.
  const xStartPx = sternX + 1;
  const xEndPx = bowX + bowOvershoot - 1;

  const yTopPx = (t: number) => {
    const x = Math.floor(sternX + t * length);
    const col = getHullColumn(config.shipType, geom, config.height, x);
    return col ? col.topY + 1 : geom.deckY;
  };
  const yBottomPx = (t: number) => {
    const x = Math.floor(sternX + t * length);
    const col = getHullColumn(config.shipType, geom, config.height, x);
    return col ? col.bottomY - 1 : geom.keelY;
  };
  return { xStartPx, xEndPx, yTopPx, yBottomPx };
}

// ── Decks & bulkheads ───────────────────────────────────────────────────────

function drawDecksAndBulkheads(
  ctx: CanvasContext,
  config: RenderConfig,
  geom: ReturnType<typeof getHullGeometry>,
  decks: number[]
) {
  const { sternX, bowX, length, bowOvershoot } = geom;
  const xEnd = bowX + bowOvershoot;

  for (const deckFrac of decks) {
    for (let x = sternX + 1; x < xEnd; x++) {
      const col = getHullColumn(config.shipType, geom, config.height, x);
      if (!col) continue;
      const interiorH = col.bottomY - col.topY;
      if (interiorH < 4) continue;
      const y = Math.floor(col.topY + interiorH * deckFrac);
      // Skip a pixel every few columns to suggest plank joints.
      if ((x - sternX) % 7 === 0) continue;
      ctx.draw(x, y, '═', COLORS.deckLine);
    }
  }
}

// ── Compartment contents ────────────────────────────────────────────────────

function drawCompartments(
  ctx: CanvasContext,
  config: RenderConfig,
  geom: ReturnType<typeof getHullGeometry>,
  _bounds: InteriorBounds,
  compartments: Compartment[],
  state: CutawayState,
  time: number
) {
  const { sternX, bowX, length, bowOvershoot } = geom;
  const xEnd = bowX + bowOvershoot;
  const fullLength = xEnd - sternX;

  // Aggregate cargo fill across all cargoHold compartments so each one
  // fills proportionally when the total is partial.
  const cargoHolds = compartments.filter(c => c.kind === 'cargoHold' || c.kind === 'lowerHold');
  const totalHoldWeight = cargoHolds.reduce(
    (acc, c) => acc + (c.xEnd - c.xStart) * (c.yEnd - c.yStart),
    0
  );
  const cargoFillFrac = Math.max(0, Math.min(1, state.cargoUsed / Math.max(1, state.cargoMax)));

  for (const comp of compartments) {
    const compXStart = Math.floor(sternX + comp.xStart * fullLength);
    const compXEnd = Math.floor(sternX + comp.xEnd * fullLength);

    // Compute the compartment's top/bottom at its midpoint (approximation
    // is fine — interior boxes are small).
    const midX = Math.floor((compXStart + compXEnd) / 2);
    const midCol = getHullColumn(config.shipType, geom, config.height, midX);
    if (!midCol) continue;
    const interiorH = midCol.bottomY - midCol.topY;
    const compYStart = Math.floor(midCol.topY + interiorH * comp.yStart);
    const compYEnd = Math.floor(midCol.topY + interiorH * comp.yEnd);

    // Bulkhead separators (vertical line at start of this compartment, if not at hull edge)
    if (compXStart > sternX + 2) {
      for (let y = compYStart; y <= compYEnd; y++) {
        // Only draw bulkhead if the column is actually inside the hull at this y.
        const col = getHullColumn(config.shipType, geom, config.height, compXStart);
        if (col && y >= col.topY && y <= col.bottomY) {
          ctx.draw(compXStart, y, '│', COLORS.bulkhead);
        }
      }
    }

    drawCompartmentContent(ctx, config, geom, comp, compXStart, compXEnd, compYStart, compYEnd, state, cargoFillFrac, time);

    // Compartment label — tiny, at the top-left of the compartment.
    if (comp.label && compXEnd - compXStart >= 8 && compYEnd - compYStart >= 3) {
      const label = comp.label;
      const labelX = compXStart + 2;
      const labelY = compYStart + 1;
      for (let i = 0; i < label.length && labelX + i < compXEnd - 1; i++) {
        ctx.draw(labelX + i, labelY, label[i], COLORS.labelDim);
      }
    }
  }

  void totalHoldWeight;
  void length;
}

function drawCompartmentContent(
  ctx: CanvasContext,
  config: RenderConfig,
  geom: ReturnType<typeof getHullGeometry>,
  comp: Compartment,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  state: CutawayState,
  cargoFillFrac: number,
  time: number
) {
  const w = x1 - x0;
  const h = y1 - y0;
  if (w < 2 || h < 2) return;

  // Interior column filter — don't draw content outside the hull curve.
  const inside = (x: number, y: number) => {
    const col = getHullColumn(config.shipType, geom, config.height, x);
    if (!col) return false;
    return y >= col.topY + 1 && y <= col.bottomY - 1;
  };

  switch (comp.kind) {
    case 'cargoHold':
    case 'lowerHold': {
      // Fill from bottom up to `cargoFillFrac` of the compartment height.
      const fillRows = Math.floor(h * cargoFillFrac);
      for (let row = 0; row < fillRows; row++) {
        const y = y1 - 1 - row;
        for (let x = x0 + 1; x < x1; x++) {
          if (!inside(x, y)) continue;
          // Alternate crate glyphs to suggest variety.
          const which = (x + row) % 3;
          const ch = which === 0 ? '▦' : which === 1 ? '◯' : '▤';
          const color = which === 1 ? COLORS.cargoBarrel : which === 2 ? COLORS.cargoBale : COLORS.cargoCrate;
          ctx.draw(x, y, ch, color);
        }
      }
      break;
    }

    case 'berths': {
      // Each berth is a small 3-wide glyph: ╒═╕ empty, ╒·╕ occupied.
      // Stack them in rows of 2 if the compartment is tall enough.
      const berthW = 3;
      const perRow = Math.max(1, Math.floor((w - 2) / (berthW + 1)));
      const rows = Math.max(1, Math.floor((h - 2) / 2));
      const capacity = Math.max(state.berthsMax, perRow * rows);
      let drawn = 0;
      let occupied = 0;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < perRow; c++) {
          if (drawn >= capacity) break;
          const bx = x0 + 1 + c * (berthW + 1);
          const by = y0 + 1 + r * 2;
          if (by + 1 > y1 - 1) continue;
          const isOccupied = occupied < state.crewCount;
          const color = isOccupied ? COLORS.berthFull : COLORS.berthEmpty;
          if (inside(bx, by)) ctx.draw(bx, by, '╒', color);
          if (inside(bx + 1, by)) ctx.draw(bx + 1, by, '═', color);
          if (inside(bx + 2, by)) ctx.draw(bx + 2, by, '╕', color);
          const sleepChar = isOccupied ? (Math.sin(time * 0.8 + drawn) > 0.8 ? 'z' : '·') : ' ';
          if (inside(bx + 1, by + 1)) ctx.draw(bx + 1, by + 1, sleepChar, color);
          drawn++;
          if (isOccupied) occupied++;
        }
      }
      break;
    }

    case 'captainCabin': {
      // Little desk and chair; "C" for captain in gold, if room.
      const cy = y1 - 1;
      const cx = x0 + 2;
      if (inside(cx, cy)) ctx.draw(cx, cy, '⊏', COLORS.captain);
      if (inside(cx + 1, cy)) ctx.draw(cx + 1, cy, '═', COLORS.captain);
      if (inside(cx + 2, cy)) ctx.draw(cx + 2, cy, '⊐', COLORS.captain);
      // A chair.
      if (inside(cx + 4, cy)) ctx.draw(cx + 4, cy, 'h', COLORS.captain);
      break;
    }

    case 'galley': {
      // Stove with fire flicker.
      const cy = y1 - 1;
      const cx = x0 + 1;
      if (inside(cx, cy)) ctx.draw(cx, cy, '[', COLORS.galley);
      const flame = Math.sin(time * 6) > 0 ? '^' : '*';
      if (inside(cx + 1, cy)) ctx.draw(cx + 1, cy, flame, COLORS.galley);
      if (inside(cx + 2, cy)) ctx.draw(cx + 2, cy, ']', COLORS.galley);
      // Barrels of provisions above the stove — filled proportional to provisions/max.
      const barrelCount = Math.max(0, Math.min(3, Math.floor((state.provisions / Math.max(1, state.provisionsMax)) * 3)));
      for (let i = 0; i < barrelCount; i++) {
        const bx = x0 + 1 + i * 2;
        const by = cy - 1;
        if (inside(bx, by)) ctx.draw(bx, by, 'o', COLORS.cargoBarrel);
      }
      break;
    }

    case 'powder': {
      // Red powder barrels marked with ×; fill fraction = state.powderPct.
      const barrelsPerRow = Math.max(1, Math.floor((w - 2) / 2));
      const rows = Math.max(1, Math.floor((h - 2) / 2));
      const totalBarrels = barrelsPerRow * rows;
      const filled = Math.round(totalBarrels * Math.max(0, Math.min(1, state.powderPct)));
      let n = 0;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < barrelsPerRow; c++) {
          const bx = x0 + 1 + c * 2;
          const by = y1 - 1 - r * 2;
          if (n < filled) {
            if (inside(bx, by)) ctx.draw(bx, by, '×', COLORS.powder);
          } else {
            if (inside(bx, by)) ctx.draw(bx, by, '·', COLORS.labelDim);
          }
          n++;
        }
      }
      break;
    }

    case 'bilge': {
      // Rippling water at the very bottom.
      for (let y = y1 - 2; y <= y1; y++) {
        for (let x = x0 + 1; x < x1; x++) {
          if (!inside(x, y)) continue;
          const wave = Math.sin(x * 0.4 + time * 1.5);
          const ch = wave > 0.3 ? '~' : wave > -0.3 ? '=' : '-';
          ctx.draw(x, y, ch, COLORS.bilge);
        }
      }
      break;
    }

    case 'forecastle': {
      // Anchor chain — a diagonal line of `#` glyphs.
      for (let i = 0; i < 4; i++) {
        const ax = x1 - 1 - i;
        const ay = y1 - 1 - Math.floor(i * 0.5);
        if (inside(ax, ay)) ctx.draw(ax, ay, '#', COLORS.hullDark);
      }
      break;
    }

    case 'gunDeck': {
      // Row of cannons (aimed outward).
      const cy = y1 - 1;
      const step = 4;
      for (let x = x0 + 2; x < x1 - 1; x += step) {
        if (inside(x, cy)) ctx.draw(x, cy, '▬', '#6B7280');
      }
      break;
    }
  }
}

// ── Mast stubs + flags (above the silhouette) ───────────────────────────────

function drawMastStubs(
  ctx: CanvasContext,
  config: RenderConfig,
  geom: ReturnType<typeof getHullGeometry>,
  time: number
) {
  const { sternX, length } = geom;
  const { shipType, height } = config;
  const hy = height / 80;
  // Match the exterior renderer's mast xOffsets so masts line up when toggling.
  const layout = getMastXOffsets(shipType);
  for (const m of layout) {
    const mX = Math.floor(sternX + length / 2 + m.xOffset * length);
    const col = getHullColumn(shipType, geom, height, mX);
    if (!col) continue;
    const startY = col.topY;
    const stubH = Math.max(3, Math.floor(m.h * hy * 0.35));
    for (let y = startY; y > startY - stubH; y--) {
      ctx.draw(mX, y, '│', COLORS.mast);
    }
    // Tiny fluttering flag at the top of the stub.
    const flutter = Math.sin(time * 4 * config.wind + mX * 0.2);
    const flagLen = 2 + Math.floor(Math.abs(flutter) * 2);
    const flagY = startY - stubH + (flutter < -0.5 ? 1 : 0);
    for (let i = 1; i <= flagLen; i++) {
      ctx.draw(mX + i, flagY, i === flagLen ? '>' : '-', COLORS.gold);
    }
  }
}

function getMastXOffsets(shipType: string): { xOffset: number; h: number }[] {
  if (shipType === 'galleon') return [{ xOffset: -0.3, h: 32 }, { xOffset: 0.0, h: 48 }, { xOffset: 0.28, h: 38 }];
  if (shipType === 'carrack') return [{ xOffset: -0.35, h: 26 }, { xOffset: -0.05, h: 52 }, { xOffset: 0.25, h: 42 }, { xOffset: 0.45, h: 25 }];
  if (shipType === 'xebec') return [{ xOffset: -0.28, h: 35 }, { xOffset: 0.0, h: 45 }, { xOffset: 0.28, h: 36 }];
  if (shipType === 'fluyt') return [{ xOffset: -0.3, h: 30 }, { xOffset: 0.0, h: 44 }, { xOffset: 0.3, h: 36 }];
  if (shipType === 'baghla' || shipType === 'dhow') return [{ xOffset: -0.05, h: 45 }, { xOffset: 0.3, h: 35 }];
  if (shipType === 'pinnace') return [{ xOffset: -0.25, h: 28 }, { xOffset: 0.05, h: 40 }];
  if (shipType === 'merchant_cog') return [{ xOffset: 0.0, h: 42 }];
  if (shipType === 'junk') return [{ xOffset: -0.25, h: 32 }, { xOffset: 0.0, h: 48 }, { xOffset: 0.28, h: 40 }];
  return [];
}

// ── Waterline ───────────────────────────────────────────────────────────────

function drawWaterline(ctx: CanvasContext, config: RenderConfig, time: number) {
  const { width, height } = config;
  const keelY = Math.floor(height * 0.82);
  for (let y = keelY + 2; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const wave = Math.sin(x * 0.2 + time * 2 + y * 0.8);
      let ch = ' ';
      if (wave > 1.0) ch = '~';
      else if (wave > 0.2) ch = '-';
      else if (wave > -0.4) ch = '.';
      if (ch !== ' ') ctx.draw(x, y, ch, y > keelY + 3 ? COLORS.water3 : COLORS.water2);
    }
  }
}
