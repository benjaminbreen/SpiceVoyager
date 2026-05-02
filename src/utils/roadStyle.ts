/**
 * roadStyle.ts — single source of truth for road tier geometry.
 *
 * Both the renderer (CityRoads.tsx) and the ground-height resolver
 * (roadSurface.ts) need the same width / yLift numbers — if they drift, the
 * player starts visibly sinking into road surfaces again. Keep them here.
 *
 * `renderOrder` makes the stacking deterministic at overlaps: avenue draws
 * on top of road, road on top of path, bridge on top of all. yLift alone
 * almost achieves this via polygonOffset, but explicit renderOrder is
 * immune to scene-traversal order changes.
 */

import type { RoadTier } from '../store/gameStore';
import { SEA_LEVEL } from '../constants/world';

// ── Bridge deck height ──────────────────────────────────────────────────────
// Authored Y of a bridge polyline over water. Raised enough above the water
// surface that the deck reads as an arched span rather than a ribbon skimming
// the waves, and that piers have a meaningful above-water portion. Shared
// between cityGenerator (who writes polyline Y) and the renderer (who filters
// piers to the deck plane). Used for natural-river bridges (London Bridge,
// etc.) where ocean-going traffic needs clearance.
export const BRIDGE_DECK_Y = SEA_LEVEL + 2.8;

// Canal bridges sit much lower. Real urban canal bridges (Amsterdam, Bruges,
// Venice's smaller ponti) are flat or slightly arched footbridges only ~1m
// above the waterline — barge clearance, not ocean-ship clearance. Authoring
// canal bridges at the river deck height made the abutment ramps tower above
// the surrounding polderland, producing the visual "drape" where the bridge
// looked detached from the ground beneath it. Keeping the canal deck close
// to terrain Y collapses that height gap to almost nothing.
export const CANAL_BRIDGE_DECK_Y = SEA_LEVEL + 1.2;

export interface RoadTierStyle {
  /** Full ribbon width in world units (visual). halfWidth = width / 2. */
  width: number;
  /** Y-lift applied to every ribbon vertex above its polyline Y. */
  yLift: number;
  /** Three.js renderOrder. Higher values draw on top. */
  renderOrder: number;
  /** MeshStandardMaterial polygonOffsetFactor. Staggering this per tier is
   *  what actually disambiguates depth at overlaps — yLift alone is too
   *  small relative to screen-space depth precision at shallow angles, so
   *  roads and avenues flicker where they meet. A wider tier gets a more
   *  negative factor and therefore always wins the depth test against a
   *  narrower one. Units stays -1 throughout (the factor does the work). */
  polygonOffsetFactor: number;
  /** Optional override: lateral half-width a character counts as "on" this
   *  road for ground-height purposes. Defaults to width/2 if omitted.
   *  Bridges use a slightly narrower walk band (2.0) than their visual deck
   *  half-width (2.25) so characters stay clear of the parapet's inner face
   *  without the walkable strip feeling cramped. */
  walkHalfWidth?: number;
}

export const ROAD_TIER_STYLE: Record<RoadTier, RoadTierStyle> = {
  path:   { width: 1.3, yLift: 0.06, renderOrder: 1, polygonOffsetFactor: -1 },
  road:   { width: 3.0, yLift: 0.10, renderOrder: 2, polygonOffsetFactor: -2 },
  avenue: { width: 5.6, yLift: 0.16, renderOrder: 3, polygonOffsetFactor: -4 },
  // Bridge yLift is 0 because the polyline Y is already authored at
  // deck height (BRIDGE_DECK_Y over water, terrain at the abutments).
  bridge: { width: 4.5, yLift: 0.0,  renderOrder: 4, polygonOffsetFactor: -6, walkHalfWidth: 2.0 },
};

/** Shared polygonOffsetUnits for all road materials. Factor does the tier
 *  disambiguation; units provides the baseline bias against terrain. */
export const ROAD_POLYGON_OFFSET_UNITS = -1;

/** Convenience: tier half-width used for ground-height (walk) queries. */
export function tierWalkHalfWidth(tier: RoadTier): number {
  const s = ROAD_TIER_STYLE[tier];
  return s.walkHalfWidth ?? s.width / 2;
}

// ── Farm tracks ─────────────────────────────────────────────────────────────
// Farm tracks live on tier 'path' in the data model but render thinner and
// faded. For ground-height queries they count as a path (handled by the
// generic path tier).
export const FARM_TRACK_WIDTH = 0.75;
export const FARM_TRACK_Y_LIFT = 0.05;
export const FARM_TRACK_OPACITY = 0.72;
