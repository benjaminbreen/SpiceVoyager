// Exterior ship renderer — procedural ASCII art driven by game state.
// Ported from the standalone ascii-shipwright prototype, with:
//  - new `junk` ship type (battened sails, three masts)
//  - mast heights scale with canvas height so the same code works at any size
//  - water/sky split out into drawWaterAndSky()

import { CanvasContext, COLORS, getHullShade, getSailShade } from './shipCanvas';
import type { RenderConfig } from './shipTypes';

// Mast layouts are authored for a 95-tall virtual canvas; since the actual
// canvas is shorter than that, everything scales down proportionally —
// leaving a comfortable margin above the mastheads and below the keel.
const AUTHORED_HEIGHT = 95;

// Ship bounding box, as fractions of the rendering canvas. Tightened from
// 0.15→0.85 / 0.62→0.82 so the silhouette sits inside a frame of negative
// space instead of pressing against the edges.
const SHIP_X_START = 0.22;
const SHIP_X_END = 0.78;
const SHIP_DECK_Y = 0.68;
const SHIP_KEEL_Y = 0.80;

// ── Hull ────────────────────────────────────────────────────────────────────

export function drawHull(ctx: CanvasContext, config: RenderConfig, time: number) {
  const { shipType, damage, width, height } = config;
  const sternX = Math.floor(width * SHIP_X_START);
  const bowX = Math.floor(width * SHIP_X_END);
  const length = bowX - sternX;
  const keelY = Math.floor(height * SHIP_KEEL_Y);
  const deckY = Math.floor(height * SHIP_DECK_Y);
  const hy = height / AUTHORED_HEIGHT; // vertical scale factor

  for (let x = sternX; x <= bowX + (shipType === 'baghla' || shipType === 'dhow' || shipType === 'pinnace' ? 12 : 0); x++) {
    let t = (x - sternX) / length;
    if (t > 1) t = 1;

    let bottomY = keelY;
    let topY = deckY;

    if (shipType === 'galleon') {
      bottomY -= t < 0.1 ? (0.1 - t) * 30 * hy : 0;
      bottomY -= t > 0.8 ? Math.pow((t - 0.8) / 0.2, 2) * 35 * hy : 0;
      topY -= t < 0.2 ? 8 * hy : t < 0.3 ? 4 * hy : 0;
      topY -= t > 0.85 ? 7 * hy : 0;
    } else if (shipType === 'carrack') {
      bottomY -= t < 0.15 ? (0.15 - t) * 35 * hy : 0;
      bottomY -= t > 0.75 ? Math.pow((t - 0.75) / 0.25, 2) * 30 * hy : 0;
      topY -= t < 0.3 ? 15 * hy : t < 0.4 ? 8 * hy : 0;
      topY -= t > 0.8 ? 12 * hy : 0;
    } else if (shipType === 'xebec') {
      bottomY -= t < 0.3 ? Math.pow((0.3 - t) / 0.3, 2) * 20 * hy : 0;
      bottomY -= t > 0.6 ? Math.pow((t - 0.6) / 0.4, 2) * 40 * hy : 0;
      topY += t < 0.2 ? -3 * hy : 4 * hy;
      topY -= t > 0.7 ? Math.pow((t - 0.7) / 0.3, 2) * 10 * hy : 0;
      if (t > 0.95) bottomY = topY + 3;
    } else if (shipType === 'fluyt') {
      bottomY -= t < 0.1 ? (0.1 - t) * 20 * hy : 0;
      bottomY -= t > 0.85 ? Math.pow((t - 0.85) / 0.15, 2) * 20 * hy : 0;
      topY -= t < 0.15 ? 5 * hy : 0;
      topY += 3 * hy;
      topY -= t > 0.9 ? 4 * hy : 0;
      if (t < 0.05) topY += 4 * hy;
    } else if (shipType === 'baghla' || shipType === 'dhow') {
      bottomY -= t < 0.2 ? (0.2 - t) * 25 * hy : 0;
      bottomY -= t > 0.7 ? Math.pow((t - 0.7) / 0.3, 2) * 35 * hy : 0;
      topY -= t < 0.15 ? 9 * hy : 0;
      topY += t > 0.8 ? 3 * hy : 0;
      if (t > 0.95) bottomY = topY + 2;
    } else if (shipType === 'pinnace') {
      bottomY -= t < 0.15 ? (0.15 - t) * 28 * hy : 0;
      bottomY -= t > 0.75 ? Math.pow((t - 0.75) / 0.25, 2) * 32 * hy : 0;
      topY -= t < 0.2 ? 5 * hy : 0;
      topY -= t > 0.85 ? 4 * hy : 0;
      if (t > 0.98) bottomY = topY + 2;
    } else if (shipType === 'merchant_cog') {
      bottomY -= t < 0.25 ? Math.pow((0.25 - t) / 0.25, 2) * 25 * hy : 0;
      bottomY -= t > 0.75 ? Math.pow((t - 0.75) / 0.25, 2) * 25 * hy : 0;
      topY -= t < 0.15 ? 8 * hy : t < 0.25 ? 4 * hy : 0;
      topY -= t > 0.8 ? 8 * hy : 0;
    } else if (shipType === 'junk') {
      // High squared stern, flat bottom, slight rise forward.
      bottomY -= t < 0.15 ? (0.15 - t) * 20 * hy : 0;
      bottomY -= t > 0.85 ? Math.pow((t - 0.85) / 0.15, 2) * 22 * hy : 0;
      // Very high stern castle (towering quarterdeck)
      topY -= t < 0.15 ? 18 * hy : t < 0.22 ? 10 * hy : 0;
      topY -= t > 0.85 ? 6 * hy : 0;
    }

    bottomY = Math.floor(bottomY);
    topY = Math.floor(topY);

    for (let y = topY; y <= bottomY; y++) {
      const depth = (y - topY) / Math.max(1, bottomY - topY);
      // Darker toward the waterline, lighter toward the deck — this reads
      // more like a hull than the previous symmetric lighting did.
      const vertical = 0.75 - depth * 0.55;
      // Horizontal plank bands: low-frequency repeating pattern rather than
      // speckle noise, so the hull looks like planking, not static.
      const plankBand = Math.sin(y * 0.9) * 0.06;
      const longGrain = Math.sin(x * 0.35 + y * 0.2) * 0.05;
      let lum = Math.max(0, Math.min(0.95, vertical + plankBand + longGrain));

      let char = getHullShade(lum);
      let color = COLORS.hullDefault;
      if (lum < 0.35) color = COLORS.hullDark;
      else if (lum > 0.65) color = COLORS.hullLight;

      let sectionDamage = damage.mid;
      if (t < 0.3) sectionDamage = damage.stern;
      if (t > 0.7) sectionDamage = damage.bow;

      // Only paint damage once it's meaningfully above zero. The old
      // threshold (-1.0 + dmg*2.5) fired for random low-noise pixels even
      // at dmg = 0, producing constant speckle. Shifted to -2.0 + dmg*2.5
      // so damage only becomes visible once dmg > ~0.3.
      if (sectionDamage > 0.05) {
        const dNoise = Math.sin(x * 0.6 + y * 0.9) + Math.cos(x * 0.4 - y * 0.6);
        if (dNoise < -2.0 + sectionDamage * 2.5) {
          // Stable glyph choice keyed off cell position, so broken
          // planks don't flicker between `*` and `#` every frame.
          char = ((x * 31 + y * 17) & 1) === 0 ? '*' : '#';
          color = COLORS.damage;
          // Fire still flickers, but coherently from the time sine.
          if (Math.sin(time * 6 + x * 0.3 + y * 0.3) > 0.0) {
            color = COLORS.damageFire;
            char = '%';
          }
        }
      }
      ctx.draw(x, y, char, color);
    }

    // Crisp gunwale — strong top edge so the hull silhouette reads clearly.
    ctx.draw(x, topY, '▀', COLORS.hullLight);
    // Waterline stripe 2 cells above the keel (classic dark band).
    const wlY = bottomY - Math.max(2, Math.floor(2 * hy));
    if (wlY > topY + 1) ctx.draw(x, wlY, '─', COLORS.hullDark);

    // Gun / cargo ports
    if (['galleon', 'carrack', 'fluyt', 'merchant_cog', 'junk'].includes(shipType)) {
      if (x > sternX + 8 && x < bowX - 12 && x % Math.max(6, Math.floor(10 * (width / 200))) === 0) {
        const gy1 = topY + Math.floor(4 * hy);
        const gy2 = topY + Math.floor(9 * hy);
        if (gy1 < bottomY - 3) ctx.draw(x, gy1, 'O', '#111111');
        if (['galleon', 'carrack'].includes(shipType) && gy2 < bottomY - 4) {
          ctx.draw(x, gy2, 'O', '#111111');
        }
      }
    }
  }

  // Carved prow
  if (shipType === 'galleon' || shipType === 'carrack') {
    const prowX = bowX + 2;
    const prowY = deckY - Math.floor(5 * hy);
    ctx.draw(prowX, prowY, '}', COLORS.gold);
    ctx.draw(prowX + 1, prowY, '>', COLORS.gold);
    ctx.draw(prowX + 2, prowY, '>', COLORS.gold);
  } else if (shipType === 'pinnace') {
    const prowX = bowX + 13;
    const prowY = Math.floor(deckY - 3 * hy);
    ctx.draw(prowX, prowY, '>', COLORS.gold);
  } else if (shipType === 'junk') {
    // Painted eye ("oculus") on the bow — distinctive to Chinese junks.
    const eyeX = bowX - 4;
    const eyeY = Math.floor(deckY + 4 * hy);
    ctx.draw(eyeX, eyeY, '@', '#FEF3C7');
  }

  // Bowsprit
  if (shipType !== 'xebec' && shipType !== 'baghla' && shipType !== 'dhow' && shipType !== 'junk') {
    const bx = bowX;
    const by = Math.floor(deckY - (shipType === 'carrack' ? 10 * hy : 5 * hy));
    const dx = 1;
    const dy = -0.3;
    for (let i = 0; i < 20; i++) {
      const x = Math.floor(bx + i * dx);
      const y = Math.floor(by + i * dy);
      ctx.draw(x, y, '/', COLORS.mast);
      ctx.draw(x + 1, y, '/', COLORS.mast);
    }
  }
}

// ── Masts & sails ───────────────────────────────────────────────────────────

interface MastSpec {
  type: 'square' | 'lateen' | 'batten';
  size: number;
  xOffset: number;
  h: number; // authored at 80 height
  thick: boolean;
  double: boolean;
}

function getMastLayout(shipType: string): MastSpec[] {
  if (shipType === 'galleon')
    return [
      { type: 'lateen', size: 1.1, xOffset: -0.3, h: 32, thick: false, double: false },
      { type: 'square', size: 1.8, xOffset: 0.0, h: 48, thick: true, double: true },
      { type: 'square', size: 1.3, xOffset: 0.28, h: 38, thick: false, double: true },
    ];
  if (shipType === 'carrack')
    return [
      { type: 'lateen', size: 0.9, xOffset: -0.35, h: 26, thick: false, double: false },
      { type: 'square', size: 2.0, xOffset: -0.05, h: 52, thick: true, double: true },
      { type: 'square', size: 1.4, xOffset: 0.25, h: 42, thick: true, double: true },
      { type: 'square', size: 0.9, xOffset: 0.45, h: 25, thick: false, double: false },
    ];
  if (shipType === 'xebec')
    return [
      { type: 'lateen', size: 1.3, xOffset: -0.28, h: 35, thick: false, double: false },
      { type: 'lateen', size: 1.8, xOffset: 0.0, h: 45, thick: true, double: false },
      { type: 'lateen', size: 1.4, xOffset: 0.28, h: 36, thick: false, double: false },
    ];
  if (shipType === 'fluyt')
    return [
      { type: 'lateen', size: 1.0, xOffset: -0.3, h: 30, thick: false, double: false },
      { type: 'square', size: 1.6, xOffset: 0.0, h: 44, thick: true, double: true },
      { type: 'square', size: 1.2, xOffset: 0.3, h: 36, thick: false, double: true },
    ];
  if (shipType === 'baghla' || shipType === 'dhow')
    return [
      { type: 'lateen', size: 2.0, xOffset: -0.05, h: 45, thick: true, double: false },
      { type: 'lateen', size: 1.5, xOffset: 0.3, h: 35, thick: false, double: false },
    ];
  if (shipType === 'pinnace')
    return [
      { type: 'lateen', size: 1.0, xOffset: -0.25, h: 28, thick: false, double: false },
      { type: 'square', size: 1.5, xOffset: 0.05, h: 40, thick: true, double: true },
    ];
  if (shipType === 'merchant_cog')
    return [{ type: 'square', size: 1.9, xOffset: 0.0, h: 42, thick: true, double: false }];
  if (shipType === 'junk')
    return [
      { type: 'batten', size: 1.2, xOffset: -0.25, h: 32, thick: false, double: false },
      { type: 'batten', size: 1.9, xOffset: 0.0, h: 48, thick: true, double: false },
      { type: 'batten', size: 1.5, xOffset: 0.28, h: 40, thick: true, double: false },
    ];
  return [];
}

export function drawMastsAndSails(ctx: CanvasContext, config: RenderConfig, time: number) {
  const { shipType, damage, width, height } = config;
  const sternX = Math.floor(width * SHIP_X_START);
  const bowX = Math.floor(width * SHIP_X_END);
  const length = bowX - sternX;
  const centerX = sternX + length / 2;
  const deckY = Math.floor(height * SHIP_DECK_Y);
  const hy = height / AUTHORED_HEIGHT;

  const layouts = getMastLayout(shipType);

  layouts.forEach((m, idx) => {
    let mDamage = damage.mainMast;
    if (m.type === 'lateen' && idx === 0) mDamage = damage.aftMast;
    if (m.xOffset < -0.1) mDamage = damage.aftMast;
    if (m.xOffset > 0.2) mDamage = damage.foreMast;

    const mX = Math.floor(centerX + m.xOffset * length);
    const t = (mX - sternX) / length;
    let startY = deckY;
    const mastH = m.h * hy;

    if (shipType === 'galleon' || shipType === 'fluyt') {
      if (t < 0.2) startY -= 6 * hy;
      else if (t > 0.8) startY -= 5 * hy;
    } else if (shipType === 'carrack') {
      if (t < 0.3) startY -= 12 * hy;
      else if (t > 0.8) startY -= 10 * hy;
    } else if (shipType === 'baghla' || shipType === 'dhow' || shipType === 'pinnace') {
      if (t < 0.15) startY -= 8 * hy;
    } else if (shipType === 'junk') {
      if (t < 0.2) startY -= 16 * hy;
      else if (t > 0.85) startY -= 4 * hy;
    }

    const topY = startY - mastH;
    let mastTopAvailable = topY;

    if (mDamage > 0) {
      const breakY = Math.floor(startY - mastH * (1 - mDamage));
      mastTopAvailable = breakY;
      for (let y = startY; y >= topY; y--) {
        if (y < breakY) continue;
        ctx.draw(mX, y, '|', COLORS.mast);
        if (m.thick) ctx.draw(mX + 1, y, '|', COLORS.mast);
        if (y === breakY) {
          ctx.draw(mX, y, '*', COLORS.damageFire);
          if (m.thick) ctx.draw(mX + 1, y, '*', COLORS.damageFire);
        } else if (y === breakY + 1) {
          ctx.draw(mX, y, '#', COLORS.damage);
          if (m.thick) ctx.draw(mX + 1, y, '#', COLORS.damage);
        }
      }
    } else {
      for (let y = startY; y >= topY; y--) {
        ctx.draw(mX, y, '|', COLORS.mast);
        if (m.thick) ctx.draw(mX + 1, y, '|', COLORS.mast);
      }
    }

    // Crow's nest
    if (mastTopAvailable <= topY + 6 && m.type === 'square') {
      const nY = topY + Math.floor(5 * hy);
      ctx.draw(mX - 2, nY, '[', COLORS.mast);
      ctx.draw(mX - 1, nY, '_', COLORS.mast);
      ctx.draw(mX, nY, '_', COLORS.mast);
      if (m.thick) ctx.draw(mX + 1, nY, '_', COLORS.mast);
      ctx.draw(mX + (m.thick ? 2 : 1), nY, ']', COLORS.mast);
    }

    // Flag/pennant at masthead — flutters with wind, colored by nationality
    if (mastTopAvailable <= topY + 2) {
      const flagY = topY;
      const flutter = Math.sin(time * 4 * config.wind + mX * 0.2);
      const flagLen = 3 + Math.floor(Math.abs(flutter) * 2);
      const flagCol = config.flagColor ?? COLORS.gold;
      for (let i = 1; i <= flagLen; i++) {
        const fY = flagY + (flutter > 0 ? 0 : flutter < -0.5 ? 1 : 0);
        ctx.draw(mX + i, fY, i === flagLen ? '>' : '-', flagCol);
      }
    }

    if (mastTopAvailable <= startY - 12 * hy) {
      if (m.type === 'square') {
        // Topsail sits just below the masthead.
        const topsailTop = mastTopAvailable + 2;
        const topsailH = Math.floor(7 * m.size * hy);
        drawSquareSail(ctx, mX, topsailTop, m.size * hy, mDamage, time, config);

        // Course (lower sail) below the topsail with a clear mast gap,
        // but clamped so its bottom edge never crosses the deck.
        if (m.double) {
          const gap = Math.max(2, Math.floor(3 * hy));
          const courseTop = topsailTop + topsailH + gap;
          const deckBuffer = Math.max(2, Math.floor(3 * hy));
          const maxBottom = startY - deckBuffer;
          const maxCourseH = maxBottom - courseTop;
          if (maxCourseH >= 4) {
            drawSquareSail(
              ctx,
              mX,
              courseTop,
              m.size * 1.15 * hy,
              mDamage,
              time,
              config,
              maxCourseH
            );
          }
        }
      } else if (m.type === 'lateen') {
        drawLateenSail(ctx, mX, mastTopAvailable + 3, m.size * hy, mDamage, time, config);
      } else if (m.type === 'batten') {
        drawBattenSail(ctx, mX, mastTopAvailable + 2, startY - 4, m.size * hy, mDamage, time, config);
      }
    }

    // Rigging (shrouds) — diagonal lines from masthead down to the
    // channels on either side. Using `\` on the stern side and `/` on
    // the bow side so they read as taut cordage instead of speckle.
    if (mastTopAvailable < startY - 8 && m.type !== 'batten') {
      const spread = Math.floor(14 * hy);
      const rigSteps = Math.max(spread, startY - mastTopAvailable);
      // Stern-side (leftward, descending): back-slash
      for (let i = 1; i < rigSteps; i++) {
        const t = i / rigSteps;
        const rx = Math.floor(mX - spread * t);
        const ry = Math.floor(mastTopAvailable + (startY - mastTopAvailable) * t);
        ctx.draw(rx, ry, '\\', COLORS.rigging, false);
      }
      // Bow-side (rightward, descending): forward-slash
      for (let i = 1; i < rigSteps; i++) {
        const t = i / rigSteps;
        const rx = Math.floor(mX + spread * t);
        const ry = Math.floor(mastTopAvailable + (startY - mastTopAvailable) * t);
        ctx.draw(rx, ry, '/', COLORS.rigging, false);
      }
    }
  });
}

function drawSquareSail(
  ctx: CanvasContext,
  mx: number,
  topY: number,
  sizeFactor: number,
  dmg: number,
  time: number,
  config: RenderConfig,
  maxH?: number
) {
  const w = Math.floor(9 * sizeFactor);
  const naturalH = Math.floor(7 * sizeFactor);
  const h = maxH !== undefined ? Math.max(3, Math.min(naturalH, maxH)) : naturalH;

  // One slow, coherent bulge per sail. The whole sail shifts together
  // and swells gently at midship instead of each row picking its own
  // integer offset — which used to produce rogue lines jutting out.
  const windPhase = Math.sin(time * 0.9 * config.wind + mx * 0.08);
  const maxSwellCells = 1; // widen the belly by at most one cell
  const maxShiftCells = 1; // lateral drift cap; keeps outline smooth

  // Yard (upper horizontal spar)
  for (let x = mx - w - 1; x <= mx + w + 1; x++) {
    ctx.draw(x, topY, '━', COLORS.mast);
  }
  ctx.draw(mx - w - 1, topY, '┓', COLORS.rigging);
  ctx.draw(mx + w + 1, topY, '┏', COLORS.rigging);

  for (let y = topY + 1; y <= topY + h; y++) {
    const ty = (y - (topY + 1)) / Math.max(1, h);
    // Smooth half-sine profile: 0 at yard & foot, 1 at midship.
    const belly = Math.sin(ty * Math.PI);
    // Extra width is a rounded half-integer amount — monotone, so rows
    // never jump past their neighbours. Swell grows/shrinks with wind.
    const extra = Math.round(belly * maxSwellCells * (0.6 + 0.4 * Math.abs(windPhase)));
    const shift = Math.round(belly * windPhase * maxShiftCells * config.wind);
    const halfW = w - 1 + extra;
    const lX = mx - halfW + shift;
    const rX = mx + halfW + shift;

    for (let x = lX; x <= rX; x++) {
      const dist = Math.abs(x - (mx + shift));
      let shadeVal = 0.75 - (dist / Math.max(1, halfW)) * 0.25;
      const seam = dist < 1 ? 0.15 : 0;
      shadeVal += Math.sin(y * 1.8) * 0.05 - seam;

      let char: string;
      let color = COLORS.sail;
      if (x === lX) char = '▏';
      else if (x === rX) char = '▕';
      else if (y === topY + h) char = '─';
      else char = getSailShade(shadeVal);

      if (dmg > 0.05) {
        const dNoise = Math.sin(x * 1.6 + y * 1.9) + Math.cos(x * 2.4 - y * 1.6);
        if (dNoise < -1.0 + dmg * 2.8) continue;
        if (dNoise < -0.8 + dmg * 2.8) {
          char = '%';
          color = COLORS.damage;
        }
      }
      ctx.draw(x, y, char, color);
    }
  }
}

function drawLateenSail(
  ctx: CanvasContext,
  mx: number,
  topY: number,
  sizeFactor: number,
  dmg: number,
  time: number,
  config: RenderConfig
) {
  const A = { x: mx - Math.floor(2 * sizeFactor), y: topY };
  const B = { x: mx + Math.floor(10 * sizeFactor), y: topY + Math.floor(14 * sizeFactor) };
  const C = { x: mx - Math.floor(7 * sizeFactor), y: topY + Math.floor(14 * sizeFactor) };

  // Slow, coherent drift — the whole triangle leans with the wind
  // instead of individual rows jutting out.
  const windPhase = Math.sin(time * 0.9 * config.wind + mx * 0.08);
  const maxShiftCells = 1;

  const l_dx = B.x - A.x;
  const l_dy = B.y - A.y;
  const steps = Math.max(Math.abs(l_dx), Math.abs(l_dy));
  for (let i = -3; i <= steps + 4; i++) {
    const px = Math.floor(A.x + (l_dx / steps) * i);
    const py = Math.floor(A.y + (l_dy / steps) * i);
    ctx.draw(px, py, '\\', COLORS.mast);
    ctx.draw(px + 1, py, '\\', COLORS.mast, false);
  }

  for (let y = A.y + 1; y <= B.y; y++) {
    const t1 = (y - A.y) / (B.y - A.y);
    const t2 = (y - A.y) / (C.y - A.y);
    const rightX = A.x + (B.x - A.x) * t1;
    const leftX = A.x + (C.x - A.x) * t2;
    const belly = Math.sin(t1 * Math.PI);
    const shift = Math.round(belly * windPhase * maxShiftCells * config.wind);
    let lX = Math.floor(leftX) + shift;
    let rX = Math.floor(rightX) + shift;
    if (lX > rX) {
      const tmp = lX;
      lX = rX;
      rX = tmp;
    }
    for (let x = lX; x <= rX; x++) {
      const cx = (lX + rX) / 2;
      let shadeVal = 0.75 - (Math.abs(x - cx) / Math.max(1, rX - lX)) * 0.3;
      shadeVal += Math.sin(y * 1.6) * 0.06;

      let char: string;
      let color = COLORS.sail;
      if (x === lX) char = '▏';
      else if (x === rX) char = '▕';
      else if (y === B.y) char = '─';
      else char = getSailShade(shadeVal);

      if (dmg > 0.05) {
        const dNoise = Math.sin(x * 1.6 + y * 1.9) + Math.cos(x * 2.4 - y * 1.6);
        if (dNoise < -1.0 + dmg * 2.8) continue;
        if (dNoise < -0.8 + dmg * 2.8) {
          char = '%';
          color = COLORS.damage;
        }
      }
      ctx.draw(x, y, char, color);
    }
  }
}

// Battened (junk) sail — rectangular panels divided by horizontal battens.
function drawBattenSail(
  ctx: CanvasContext,
  mx: number,
  topY: number,
  bottomY: number,
  sizeFactor: number,
  dmg: number,
  time: number,
  config: RenderConfig
) {
  const w = Math.floor(10 * sizeFactor);
  const h = Math.max(4, bottomY - topY);
  const battens = Math.max(3, Math.floor(h / 3));
  // Subtle, coherent sway — capped at one cell so the whole panel
  // drifts together rather than each row shifting independently.
  const windPhase = Math.sin(time * 0.8 * config.wind + mx * 0.08);
  const maxShiftCells = 1;

  for (let y = topY; y <= bottomY; y++) {
    const ty = (y - topY) / Math.max(1, h);
    const belly = Math.sin(ty * Math.PI);
    const bowOffsetX = Math.round(belly * windPhase * maxShiftCells * config.wind);
    const isBatten = (y - topY) % Math.floor(h / battens) === 0 || y === bottomY;

    for (let x = mx - w + bowOffsetX; x <= mx + w + bowOffsetX; x++) {
      let char: string;
      let color: string;
      if (isBatten) {
        char = '━';
        color = COLORS.mast;
      } else {
        const dist = Math.abs(x - (mx + bowOffsetX));
        let shadeVal = 0.72 - (dist / w) * 0.22;
        shadeVal += Math.sin(y * 1.8) * 0.06;
        char = getSailShade(shadeVal);
        color = COLORS.sail;
      }
      if (dmg > 0.05 && !isBatten) {
        const dNoise = Math.sin(x * 1.6 + y * 1.9) + Math.cos(x * 2.4 - y * 1.6);
        if (dNoise < -1.0 + dmg * 2.8) continue;
        if (dNoise < -0.8 + dmg * 2.8) {
          char = '%';
          color = COLORS.damage;
        }
      }
      ctx.draw(x, y, char, color);
    }
  }
}

// ── Water & sky ─────────────────────────────────────────────────────────────

export function drawWater(ctx: CanvasContext, config: RenderConfig, time: number) {
  const { width, height } = config;
  const keelY = Math.floor(height * SHIP_KEEL_Y) - 2;

  for (let y = keelY; y < height; y++) {
    const ty = (y - keelY) / (height - keelY);
    for (let x = 0; x < width; x++) {
      const wave = Math.sin(x * 0.2 + time * 2.5 + y * 1.5) + Math.cos(x * 0.1 - time * 1.5);
      let char = ' ';
      let color = COLORS.water1;

      if (wave > 1.2) char = '~';
      else if (wave > 0.6) char = '-';
      else if (wave > 0.0) char = '=';
      else if (wave > -0.6) char = '.';

      if (ty < 0.3 && x > width * 0.75) {
        const wake = Math.sin(x * 0.5 - time * 4 - y * 2.0);
        if (wake > 0.5) {
          char = '~';
          color = COLORS.waterHighlight;
        }
      }

      if (y > keelY + 3 && char !== ' ') {
        if (wave < 0) color = COLORS.water3;
        else color = COLORS.water2;
      }

      if (char !== ' ') ctx.draw(x, y, char, color, true);
    }
  }
}
