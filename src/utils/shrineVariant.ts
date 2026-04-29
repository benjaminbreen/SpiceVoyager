// ── Shrine Variant Application ─────────────────────────────────────────────
//
// Takes the parts a per-faith spiritual block has just emitted into the
// shared `allParts` array and applies the variant axes attached to the
// procedural shrine: hero-feature stretch, body proportion, palette drift,
// and three optional accents (boundary wall, prayer pole, outer courtyard).
//
// Tagging is index-based, not heuristic. Each per-faith block in
// ProceduralCity.tsx uses an `addKey(...)` wrapper for hero-feature parts
// (bell tower, minaret, shikhara, pagoda spire, dome, etc.) and the default
// `addPart(...)` for body parts. The wrapper records the part index in
// `keyIndices`, which this util then routes to `keyFeatureScale`. Body
// parts get `bodyProportion`. No Y-position guess.
//
// Why a util: the variant pass was ~70 lines living inline in the already-
// 1800-line ProceduralCity.tsx, and the same logic is going to grow when
// ruin/decay variants ship (Phase 4). Hoisting it now keeps the renderer
// readable and gives ruin/decay a sibling util to live next to.
//
// The accent emitters take an `addPart` closure because addPart in the
// renderer is a captured closure over the building's rotation + position;
// passing the closure preserves all that without leaking the renderer's
// internals into this util.

import type { ShrineVariant } from './proceduralShrines';

/** Subset of the renderer's `Part` shape we need to mutate. `color` is
 *  optional in the source type for legacy reasons, but addPart always
 *  populates it — so the variant pass treats it as required after a
 *  defined-check. */
interface MutablePart {
  pos: [number, number, number];
  scale: [number, number, number];
  color?: [number, number, number];
}

/** addPart closure shape from ProceduralCity.tsx — kept loose so the util
 *  doesn't reach into the renderer's internal Part / Geo / Mat unions. */
type AddPart = (
  geo: 'box' | 'cylinder' | 'cone' | 'sphere' | 'dome',
  mat: 'white' | 'mud' | 'wood' | 'stone' | 'dark' | 'straw' | 'terracotta',
  lx: number, ly: number, lz: number,
  sw: number, sh: number, sd: number,
  colorOverride?: [number, number, number],
) => void;

/**
 * Apply variant axes to the spiritual parts emitted by a per-faith block.
 *
 * @param parts       The shared `allParts` array. Mutated in place for parts
 *                    in [spiStart, parts.length).
 * @param spiStart    Index into `parts` where this spiritual block began.
 * @param keyIndices  Indices marked as hero-feature parts via `addKey`.
 *                    Anything in [spiStart, parts.length) not in this set is
 *                    treated as body.
 * @param sv          The variant axes rolled at gen time.
 * @param origin      Building world position (variant stretch is applied
 *                    around this anchor so the shrine stays planted).
 * @param addPart     Closure to emit accent parts in the renderer's
 *                    rotation/translation space.
 */
export function applyShrineVariant(
  parts: MutablePart[],
  spiStart: number,
  keyIndices: ReadonlySet<number>,
  sv: ShrineVariant,
  origin: { x: number; y: number; z: number },
  addPart: AddPart,
): void {
  const { x: ox, y: oy, z: oz } = origin;

  // ── Stretch + palette pass ────────────────────────────────────────────
  // Y multiplier per part: hero features get keyFeatureScale, body parts
  // get bodyProportion. Both anchor at the building's base (oy) so parts
  // grow upward, not centered.
  for (let i = spiStart; i < parts.length; i++) {
    const p = parts[i];
    const localY = p.pos[1] - oy;
    const yMul = keyIndices.has(i) ? sv.keyFeatureScale : sv.bodyProportion;
    p.pos = [p.pos[0], oy + localY * yMul, p.pos[2]];
    p.scale = [p.scale[0], p.scale[1] * yMul, p.scale[2]];
    // Palette shift — small warm/cool nudge over the per-faith base color.
    // Magnitude is intentionally small so the faith's palette still reads.
    if (p.color) {
      const t = sv.paletteShift;
      const c = p.color;
      p.color = [
        Math.max(0, Math.min(1, c[0] + t * 0.18)),
        Math.max(0, Math.min(1, c[1] + t * 0.08)),
        Math.max(0, Math.min(1, c[2] - t * 0.18)),
      ];
    }
  }

  // ── Accent: boundary wall ─────────────────────────────────────────────
  // Eight short stone segments forming a ring ~5.5u out from origin, with
  // a single gap at the front (last segment) that reads as the entrance.
  if (sv.accents.boundaryWall) {
    const wallColor: [number, number, number] = [0.78, 0.74, 0.66];
    const r = 5.5;
    const segments = 8;
    for (let i = 0; i < segments; i++) {
      if (i === segments - 1) continue;
      const a = (i / segments) * Math.PI * 2;
      const wx = Math.cos(a) * r;
      const wz = Math.sin(a) * r;
      addPart('box', 'stone', wx, 0.4, wz, 0.9, 0.8, 0.9, wallColor);
    }
  }

  // ── Accent: prayer pole ───────────────────────────────────────────────
  // Tall slim pole with a banner near the top. Color of the banner keys
  // off the variant's palette shift sign so warm-shifted shrines have red
  // banners and cool ones have indigo — small but visible coupling.
  if (sv.accents.prayerPole) {
    const poleColor: [number, number, number] = [0.32, 0.22, 0.14];
    const bannerColor: [number, number, number] = sv.paletteShift > 0
      ? [0.78, 0.32, 0.22]
      : [0.34, 0.46, 0.62];
    addPart('cylinder', 'wood', -3.5, 4.0, 0, 0.10, 8.0, 0.10, poleColor);
    addPart('box', 'straw', -3.5, 6.6, 0, 0.05, 0.9, 0.7, bannerColor);
  }

  // ── Accent: outer courtyard ───────────────────────────────────────────
  // Flat plinth one tier wider than the body, sits just above ground —
  // reads as a paved precinct. Mostly fires on pilgrimage-scale shrines
  // (rolled in proceduralShrines.rollShrineVariant).
  if (sv.accents.outerCourtyard) {
    const flagstone: [number, number, number] = [0.74, 0.70, 0.62];
    addPart('box', 'stone', 0, 0.08, 0, 11, 0.16, 11, flagstone);
  }

  // origin args reference suppression for unused-warn in strict modes —
  // ox/oz aren't used after the loop body inlines them, but keeping the
  // destructure self-documenting is worth a no-op reference.
  void ox; void oz;
}
