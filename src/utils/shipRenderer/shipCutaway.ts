// Cutaway / wireframe interior view — shows the same hull silhouette but
// reveals decks, bulkheads, cargo fill, crew berths, and other
// compartments driven by game state. Inspired by the cross-section
// diagrams in The Life Aquatic with Steve Zissou.

import { CanvasContext, COLORS } from './shipCanvas';
import type { RenderConfig, Compartment } from './shipTypes';
import { getHullGeometry, getHullColumn } from './shipHullProfile';
import { buildCutawayPlan, type CutawayRenderPlan, type CutawayRoomPlan } from './shipCutawayPlan';

export interface CutawayState {
  cargoUsed: number;      // units currently carried
  cargoMax: number;       // capacity
  crewCount: number;      // living crew aboard
  berthsMax: number;      // total bunks (usually crewCount + a few spares)
  powderPct: number;      // 0-1, powder magazine fill
  provisions: number;     // raw provisions count (0-60ish)
  provisionsMax: number;  // target provision capacity for fill fraction
  timeOfDay?: number;     // 0-24, used for small decorative flourishes
  renderLabels?: boolean; // ShipView can render larger HTML labels instead.
}

const EMPTY_STATE: CutawayState = {
  cargoUsed: 0,
  cargoMax: 100,
  crewCount: 0,
  berthsMax: 8,
  powderPct: 0,
  provisions: 30,
  provisionsMax: 60,
  renderLabels: true,
};

export function drawCutaway(
  ctx: CanvasContext,
  config: RenderConfig,
  state: CutawayState,
  time: number
) {
  const merged = { ...EMPTY_STATE, ...state };
  const plan = buildCutawayPlan(config);
  const geom = plan.scene.geometry;

  // 1. Draw the ship as a sectioned object: heavy shell, planked keel, and
  //    the same broad silhouette as the exterior renderer.
  drawHullShell(ctx, config, geom, time);

  // 2. Mast stubs sit behind the sectioned rooms, so labels and room details
  //    stay legible while the rig still lines up with exterior view.
  drawMastStubs(ctx, config, geom, time);

  // 3. Draw decks and rooms over that shell.
  drawDecksAndBulkheads(ctx, config, geom, plan.deckRows);
  drawCompartments(ctx, config, geom, plan, merged, time);

  // 4. Waterline underneath.
  drawWaterline(ctx, config, time);
}

// ── Hull shell (shared silhouette) ──────────────────────────────────────────

function drawHullShell(
  ctx: CanvasContext,
  config: RenderConfig,
  geom: ReturnType<typeof getHullGeometry>,
  time: number
) {
  const { sternX, bowX, bowOvershoot } = geom;
  const { shipType, width, height } = config;

  let prevTop: number | null = null;
  let prevBot: number | null = null;

  for (let x = sternX; x <= bowX + bowOvershoot; x++) {
    const col = getHullColumn(shipType, geom, height, x);
    if (!col) continue;
    const { topY, bottomY } = col;
    const shellColor = (x + topY) % 9 === 0 ? COLORS.hullLight : COLORS.hullOutline;
    const plankColor = (x + bottomY) % 5 === 0 ? COLORS.hullDefault : COLORS.hullDark;

    // Top edge (gunwale / deck line), doubled with an inner shadow so the
    // cutaway reads as a real hull section instead of a wire outline.
    if (prevTop === null) {
      ctx.draw(x, topY, '╱', shellColor);
    } else {
      const dy = topY - prevTop;
      let ch = '─';
      if (dy < -0.5) ch = '╱';
      else if (dy > 0.5) ch = '╲';
      ctx.draw(x, topY, ch, shellColor);
    }
    if (bottomY - topY > 5) {
      ctx.draw(x, topY + 1, x % 3 === 0 ? '·' : '─', COLORS.hullDark, false);
    }

    // Bottom shell and keel: two visible rows of warm planking.
    if (prevBot === null) {
      ctx.draw(x, bottomY, '╲', shellColor);
    } else {
      const dy = bottomY - prevBot;
      let ch = '─';
      if (dy < -0.5) ch = '╱';
      else if (dy > 0.5) ch = '╲';
      ctx.draw(x, bottomY, ch, shellColor);
    }
    if (bottomY - topY > 6) {
      ctx.draw(x, bottomY - 1, (x + Math.floor(time * 2)) % 6 === 0 ? '▒' : '═', plankColor);
      if ((x - sternX) % 4 !== 0) ctx.draw(x, bottomY - 2, '░', COLORS.hullDark, false);
    }

    prevTop = topY;
    prevBot = bottomY;
  }

  // Stern & bow end-caps: close the silhouette with vertical strokes.
  const sternCol = getHullColumn(shipType, geom, height, sternX);
  if (sternCol) {
    for (let y = sternCol.topY; y <= sternCol.bottomY; y++) {
      ctx.draw(sternX, y, y % 2 === 0 ? '║' : '┃', COLORS.hullOutline);
      if (sternX + 1 < width) ctx.draw(sternX + 1, y, '│', COLORS.hullDark, false);
    }
  }
  const bowEndX = bowX + bowOvershoot;
  const bowCol = getHullColumn(shipType, geom, height, bowEndX);
  if (bowCol) {
    for (let y = bowCol.topY; y <= bowCol.bottomY; y++) {
      ctx.draw(bowEndX, y, y % 2 === 0 ? '║' : '┃', COLORS.hullOutline);
      ctx.draw(bowEndX - 1, y, '│', COLORS.hullDark, false);
    }
  }

  void width;
}

// ── Interior bounding box ───────────────────────────────────────────────────

// ── Decks & bulkheads ───────────────────────────────────────────────────────

function drawDecksAndBulkheads(
  ctx: CanvasContext,
  config: RenderConfig,
  geom: ReturnType<typeof getHullGeometry>,
  deckRows: number[]
) {
  const { sternX, bowX, length, bowOvershoot } = geom;
  const xEnd = bowX + bowOvershoot;

  for (const y of deckRows) {
    for (let x = sternX + 1; x < xEnd; x++) {
      const col = getHullColumn(config.shipType, geom, config.height, x);
      if (!col) continue;
      if (y <= col.topY || y >= col.bottomY) continue;
      ctx.draw(x, y, '═', COLORS.deckLine);
      if ((x - sternX) % 12 === 0 && y + 1 < col.bottomY) {
        ctx.draw(x, y + 1, '│', COLORS.hullDark, false);
      }
    }
  }
}

// ── Compartment contents ────────────────────────────────────────────────────

function drawCompartments(
  ctx: CanvasContext,
  config: RenderConfig,
  geom: ReturnType<typeof getHullGeometry>,
  plan: CutawayRenderPlan,
  state: CutawayState,
  time: number
) {
  const { rooms } = plan;

  // Cargo rooms all fill to the same level; separate compartments show how
  // divided holds and bulkheads change by ship type.
  const cargoFillFrac = Math.max(0, Math.min(1, state.cargoUsed / Math.max(1, state.cargoMax)));

  for (const bounds of rooms) {
    drawRoomBackground(ctx, config, geom, bounds);
  }

  drawRoomWalls(ctx, config, geom, rooms);

  for (const bounds of rooms) {
    const comp = bounds.compartment;
    drawCompartmentContent(ctx, config, geom, comp, bounds.x0, bounds.x1, bounds.y0, bounds.y1, state, cargoFillFrac, time);
  }

  if (state.renderLabels) {
    for (const bounds of rooms) {
      if (!bounds.displayLabel) continue;
      for (let i = 0; i < bounds.displayLabel.length && bounds.labelX + i < bounds.x1 - 1; i++) {
        ctx.draw(bounds.labelX + i, bounds.labelY, bounds.displayLabel[i], COLORS.labelBright);
      }
    }
  }
}

function drawRoomBackground(
  ctx: CanvasContext,
  config: RenderConfig,
  geom: ReturnType<typeof getHullGeometry>,
  room: CutawayRoomPlan
) {
  const inside = insideHull(config, geom);
  for (let x = room.x0 + 1; x < room.x1; x++) {
    for (let y = room.y0 + 1; y < room.y1; y++) {
      if (!inside(x, y)) continue;
      if ((x + y) % 17 === 0) {
        ctx.draw(x, y, '.', COLORS.hullDark, false);
      }
    }
  }
  for (let x = room.x0 + 1; x < room.x1; x++) {
    if (inside(x, room.y1 - 1)) ctx.draw(x, room.y1 - 1, '─', COLORS.deckLine);
  }
}

function drawRoomWalls(
  ctx: CanvasContext,
  config: RenderConfig,
  geom: ReturnType<typeof getHullGeometry>,
  rooms: CutawayRoomPlan[]
) {
  const walls = new Map<string, { x: number; y0: number; y1: number; exterior: boolean }>();
  const addWall = (x: number, y0: number, y1: number, exterior: boolean) => {
    if (y1 <= y0) return;
    const key = `${x}:${y0}:${y1}`;
    const current = walls.get(key);
    walls.set(key, { x, y0, y1, exterior: exterior || current?.exterior === true });
  };

  for (const room of rooms) {
    const exteriorLeft = room.x0 <= geom.sternX + 2;
    const exteriorRight = room.x1 >= geom.bowX + geom.bowOvershoot - 2;
    addWall(room.x0, room.y0, room.y1, exteriorLeft);
    addWall(room.x1, room.y0, room.y1, exteriorRight);
  }

  for (const wall of walls.values()) {
    for (let y = wall.y0; y <= wall.y1; y++) {
      if (!insideHullInclusive(config, geom, wall.x, y)) continue;
      const existing = ctx.data[y]?.[wall.x]?.c ?? ' ';
      const joinsHorizontal = existing === '═' || existing === '─';
      const ch = joinsHorizontal ? '╬' : wall.exterior ? '║' : '┃';
      ctx.draw(wall.x, y, ch, wall.exterior ? COLORS.hullOutline : COLORS.bulkhead);
    }
  }
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

  const inside = insideHull(config, geom);

  switch (comp.kind) {
    case 'cargoHold':
    case 'lowerHold': {
      const availableRows = Math.max(1, comp.kind === 'lowerHold' ? h - 3 : Math.floor(h * 0.52));
      const fillRows = Math.floor(availableRows * cargoFillFrac);
      const stackTop = Math.max(y0 + 2, y1 - 1 - fillRows);
      for (let row = 0; row < fillRows; row++) {
        const y = y1 - 1 - row;
        for (let x = x0 + 2; x < x1 - 1; x += 2) {
          if (!inside(x, y)) continue;
          if ((x + row) % 11 === 0) continue;
          const which = (Math.floor(x / 2) + row) % 4;
          const ch = which === 0 ? '▣' : which === 1 ? 'o' : which === 2 ? '▤' : '≡';
          const color = which === 1 ? COLORS.cargoBarrel : which === 2 ? COLORS.cargoBale : COLORS.cargoCrate;
          ctx.draw(x, y, ch, color);
          if (x + 1 < x1 && which !== 1 && inside(x + 1, y)) ctx.draw(x + 1, y, '═', COLORS.cargoCrate, false);
        }
      }
      if (fillRows > 0) {
        for (let x = x0 + 2; x < x1 - 1; x++) {
          if (inside(x, stackTop)) ctx.draw(x, stackTop, x % 6 === 0 ? '╤' : '─', COLORS.cargoBale, false);
        }
      }
      break;
    }

    case 'berths': {
      const berthW = 5;
      const perRow = Math.max(1, Math.floor((w - 2) / (berthW + 1)));
      const rows = Math.max(1, Math.floor((h - 4) / 3));
      const capacity = Math.max(state.berthsMax, perRow * rows);
      let drawn = 0;
      let occupied = 0;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < perRow; c++) {
          if (drawn >= capacity) break;
          const bx = x0 + 1 + c * (berthW + 1);
          const by = y0 + 1 + r * 3;
          if (by + 1 > y1 - 2) continue;
          const isOccupied = occupied < state.crewCount;
          const color = isOccupied ? COLORS.berthFull : COLORS.berthEmpty;
          const chars = ['╭', '─', '─', '─', '╮'];
          for (let i = 0; i < chars.length; i++) if (inside(bx + i, by)) ctx.draw(bx + i, by, chars[i], color);
          const sleepChar = isOccupied ? (Math.sin(time * 0.8 + drawn) > 0.8 ? 'z' : '·') : ' ';
          if (inside(bx + 2, by + 1)) ctx.draw(bx + 2, by + 1, sleepChar, color);
          drawn++;
          if (isOccupied) occupied++;
        }
      }
      break;
    }

    case 'captainCabin': {
      const cy = y1 - 1;
      const cx = x0 + 2;
      const desk = ['╔', '═', '═', '╗'];
      for (let i = 0; i < desk.length; i++) if (inside(cx + i, cy - 1)) ctx.draw(cx + i, cy - 1, desk[i], COLORS.captain);
      if (inside(cx + 1, cy)) ctx.draw(cx + 1, cy, '□', COLORS.captain);
      if (inside(cx + 4, cy)) ctx.draw(cx + 4, cy, 'h', COLORS.captain);
      if (inside(x1 - 5, y0 + 2)) ctx.draw(x1 - 5, y0 + 2, '✦', COLORS.gold);
      if (w > 12 && h > 6) {
        const mapX = x0 + Math.floor(w * 0.58);
        const mapY = y1 - 3;
        const chart = ['╭', '─', '╮'];
        for (let i = 0; i < chart.length; i++) if (inside(mapX + i, mapY)) ctx.draw(mapX + i, mapY, chart[i], COLORS.labelDim);
        if (inside(mapX + 1, mapY + 1)) ctx.draw(mapX + 1, mapY + 1, '×', COLORS.labelDim);
      }
      break;
    }

    case 'galley': {
      const cy = y1 - 1;
      const cx = x0 + 1;
      if (inside(cx, cy)) ctx.draw(cx, cy, '▐', COLORS.galley);
      const flame = Math.sin(time * 6) > 0 ? '^' : '*';
      if (inside(cx + 1, cy)) ctx.draw(cx + 1, cy, flame, COLORS.damageFire);
      if (inside(cx + 2, cy)) ctx.draw(cx + 2, cy, '▌', COLORS.galley);
      if (inside(cx + 1, cy - 1)) ctx.draw(cx + 1, cy - 1, Math.sin(time * 2) > 0 ? '\'' : '`', COLORS.labelDim);
      const barrelCount = Math.max(0, Math.min(4, Math.floor((state.provisions / Math.max(1, state.provisionsMax)) * 4)));
      for (let i = 0; i < barrelCount; i++) {
        const bx = x0 + 5 + i * 2;
        const by = cy - 1 - (i % 2);
        if (inside(bx, by)) ctx.draw(bx, by, 'o', COLORS.cargoBarrel);
      }
      if (w > 9) {
        const shelfY = y0 + 2;
        for (let x = x0 + 2; x < x1 - 2; x++) {
          if (inside(x, shelfY)) ctx.draw(x, shelfY, x % 5 === 0 ? '┬' : '─', COLORS.deckLine, false);
        }
      }
      break;
    }

    case 'powder': {
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
            if (inside(bx, by)) ctx.draw(bx, by, '⊗', COLORS.powder);
          } else {
            if (inside(bx, by)) ctx.draw(bx, by, '·', COLORS.labelDim);
          }
          n++;
        }
      }
      break;
    }

    case 'bilge': {
      const waterTop = Math.max(y0 + 2, y1 - 4);
      for (let y = waterTop; y <= y1; y++) {
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
      if (w > 8) {
        const railY = y0 + 2;
        for (let x = x0 + 2; x < x1 - 2; x++) {
          if (inside(x, railY)) ctx.draw(x, railY, x % 4 === 0 ? '┬' : '─', COLORS.deckLine, false);
        }
      }
      for (let i = 0; i < 4; i++) {
        const ax = x1 - 1 - i;
        const ay = y1 - 1 - Math.floor(i * 0.5);
        if (inside(ax, ay)) ctx.draw(ax, ay, '#', COLORS.hullDark);
      }
      if (inside(x1 - 4, y0 + 2)) ctx.draw(x1 - 4, y0 + 2, '⚓', COLORS.hullOutline);
      break;
    }

    case 'gunDeck': {
      const gunY = y1 - 2;
      const portY = Math.max(y0 + 2, gunY - 2);
      const step = 7;
      for (let x = x0 + 4; x < x1 - 3; x += step) {
        if (inside(x, portY)) ctx.draw(x, portY, '□', COLORS.hullDark);
        if (inside(x, gunY)) ctx.draw(x, gunY, '◄', '#6B7280');
        if (inside(x + 1, gunY)) ctx.draw(x + 1, gunY, '═', '#6B7280');
      }
      break;
    }
  }
}

function insideHull(config: RenderConfig, geom: ReturnType<typeof getHullGeometry>) {
  return (x: number, y: number) => {
    const col = getHullColumn(config.shipType, geom, config.height, x);
    if (!col) return false;
    return y >= col.topY + 1 && y <= col.bottomY - 1;
  };
}

function insideHullInclusive(
  config: RenderConfig,
  geom: ReturnType<typeof getHullGeometry>,
  x: number,
  y: number
) {
  const col = getHullColumn(config.shipType, geom, config.height, x);
  if (!col) return false;
  return y >= col.topY && y <= col.bottomY;
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
