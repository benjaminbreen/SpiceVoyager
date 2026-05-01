// Canal-city urban layout. Output is consumed by cityGenerator: canal polylines
// carve water strips into the land mask, and bridge crossings become tier='bridge'
// roads laid perpendicular to each canal.
//
// Two layouts:
//
//   - 'concentric': semicircular arcs around a city core (used for Venice's
//     ring of major canals around the medieval sestieri). Suits cities with a
//     ring-and-spoke historical plan.
//
//   - 'wedge': one inlet crossing the coastline + a single moat-style arc
//     hugging the medieval core + a small number of parallel "burgwall"
//     side-canals flanking the inlet. Suits 1612-era Amsterdam, where the
//     Grachtengordel was only being SURVEYED that year (Herengracht dug 1613)
//     so the city was still the medieval wedge between Damrak/Rokin and the
//     Singel moat. Concentric was historically wrong for this period.

import { CardinalDir, resolveDirRadians } from './portArchetypes';

export type CanalLayoutDef =
  | {
      type: 'concentric';
      /** Open direction of the harbor (where the rings face). */
      openDirection: CardinalDir | number;
      /** Distance from canal center to innermost ring (world units). */
      innerRadius: number;
      /** Number of concentric semicircular rings. */
      rings: number;
      /** Radial gap between rings (world units). */
      ringSpacing: number;
      /** Number of straight radial canals connecting inner ring to outer + harbor. */
      radials: number;
      /** Width of canal water strip (world units). */
      canalWidth: number;
      /** If set, a central inlet (Damrak) cuts from the harbor edge to canal center. */
      centralInlet?: boolean;
      /** Length of the central inlet (world units). */
      inletDepth?: number;
      /** Width of the central inlet (defaults to canalWidth * 1.5). */
      inletWidth?: number;
      /** Bridges per concentric ring (evenly spaced along the arc). */
      bridgesPerRing?: number;
      /** Bridges per radial canal (placed at midpoint by default). */
      bridgesPerRadial?: number;
      /** Bridges along the central inlet. */
      bridgesOnInlet?: number;
    }
  | {
      type: 'wedge';
      /** Open direction of the harbor (the inlet's mouth). */
      openDirection: CardinalDir | number;
      /** Width of the central inlet (Damrak/Rokin) in world units. */
      inletWidth: number;
      /** Distance the inlet runs INLAND past the port marker. */
      inletDepth: number;
      /** Width of the side-canal "burgwallen" running parallel to the inlet. */
      sideCanalWidth: number;
      /** Lateral offset of each side-canal pair from the inlet centerline. */
      sideCanalOffsets: number[];
      /** How far the side-canals extend inland from the coastline. */
      sideCanalLength: number;
      /** Radius of the moat arc (Singel) measured from canal center. */
      moatRadius: number;
      /** Width of the moat arc water strip. */
      moatWidth: number;
      /** Arc extent in radians, centered behind the harbor (≈ Math.PI for a 180° wrap). */
      moatExtent: number;
      /** Bridges over the central inlet. */
      bridgesOnInlet?: number;
      /** Bridges over each side-canal. */
      bridgesPerSideCanal?: number;
      /** Bridges along the moat. */
      bridgesOnMoat?: number;
    };

export interface CanalSegment {
  /** World-space [x, z] points along the canal centerline. */
  polyline: [number, number][];
  /** Half-width of the water strip in world units. */
  halfWidth: number;
  /** Marks the central inlet / Grand-Canal-style primary waterway. */
  primary: boolean;
}

export interface CanalBridge {
  /** World-space center of the bridge. */
  x: number;
  z: number;
  /** Direction along the bridge deck (perpendicular to canal). Unit vector. */
  dirX: number;
  dirZ: number;
  /** Half the deck length (world units) — how far the deck extends from center. */
  halfLength: number;
}

export interface CanalLayout {
  canals: CanalSegment[];
  bridges: CanalBridge[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Sample N points along an arc of arbitrary extent, centered on the inland
 * direction. extent=π reproduces arcPoints (180° wrap); 1.4π wraps further
 * around so the "moat" reaches back toward the harbor flanks. The arc ends
 * are `extent/2` either side of the inland direction.
 *
 * `jitterAmplitude` perturbs each point's radius using a deterministic
 * three-frequency wave. The result varies organically along the arc so the
 * moat doesn't read as a perfect Math.cos curve. Pass 0 for clean arcs.
 */
function partialArcPoints(
  cx: number, cz: number,
  radius: number,
  inlandDirX: number, inlandDirZ: number,
  extent: number,
  samples: number,
  jitterAmplitude: number = 0,
): [number, number][] {
  // Lateral basis (perpendicular to inland direction, in XZ plane).
  const latX = -inlandDirZ;
  const latZ =  inlandDirX;
  const out: [number, number][] = [];
  for (let i = 0; i < samples; i++) {
    // Map i ∈ [0, samples-1] to angle ∈ [-extent/2, +extent/2] measured
    // FROM the inland direction. cos along inland, sin along lateral.
    const a = -extent * 0.5 + (i / (samples - 1)) * extent;
    let r = radius;
    if (jitterAmplitude > 0) {
      // Three superposed waves with incommensurate frequencies — produces
      // pseudo-noise that's deterministic, smooth, and bounded. Tapered at
      // the arc ends so the flanks meet the harbor cleanly.
      const w = Math.sin(a * 4.31 + 1.7) * 1.0
              + Math.cos(a * 7.93 + 0.3) * 0.6
              + Math.sin(a * 13.1 - 2.9) * 0.3;
      const taper = Math.sin((i / (samples - 1)) * Math.PI); // 0 at ends, 1 at middle
      r += jitterAmplitude * w * taper / 1.9; // /1.9 normalises the sum-of-amps
    }
    const c = Math.cos(a);
    const s = Math.sin(a);
    out.push([
      cx + r * (c * inlandDirX + s * latX),
      cz + r * (c * inlandDirZ + s * latZ),
    ]);
  }
  return out;
}

function organicLinePoints(
  start: [number, number],
  end: [number, number],
  samples: number,
  lateralAmplitude: number,
  phase: number,
): [number, number][] {
  if (samples < 2 || lateralAmplitude <= 0) return [start, end];
  const dx = end[0] - start[0];
  const dz = end[1] - start[1];
  const len = Math.hypot(dx, dz);
  if (len < 1e-6) return [start, end];
  const nx = -dz / len;
  const nz = dx / len;
  const out: [number, number][] = [];
  for (let i = 0; i < samples; i++) {
    const t = i / (samples - 1);
    const taper = Math.sin(t * Math.PI);
    const wave =
      Math.sin(t * Math.PI * 1.35 + phase) * 0.8 +
      Math.sin(t * Math.PI * 2.7 + phase * 0.53) * 0.28;
    const offset = lateralAmplitude * wave * taper;
    out.push([
      start[0] + dx * t + nx * offset,
      start[1] + dz * t + nz * offset,
    ]);
  }
  return out;
}

function pointAtPolylineT(points: [number, number][], t: number): [number, number] {
  if (points.length === 0) return [0, 0];
  if (points.length === 1) return points[0];
  const clamped = Math.max(0, Math.min(1, t));
  const lengths: number[] = [];
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const len = Math.hypot(points[i + 1][0] - points[i][0], points[i + 1][1] - points[i][1]);
    lengths.push(len);
    total += len;
  }
  if (total < 1e-6) return points[0];
  let target = total * clamped;
  for (let i = 0; i < lengths.length; i++) {
    const len = lengths[i];
    if (target <= len || i === lengths.length - 1) {
      const localT = len < 1e-6 ? 0 : target / len;
      return [
        points[i][0] + (points[i + 1][0] - points[i][0]) * localT,
        points[i][1] + (points[i + 1][1] - points[i][1]) * localT,
      ];
    }
    target -= len;
  }
  return points[points.length - 1];
}

function normalAtPolylineT(points: [number, number][], t: number): [number, number] {
  if (points.length < 2) return [1, 0];
  const clamped = Math.max(0, Math.min(1, t));
  const idx = Math.max(0, Math.min(points.length - 2, Math.floor(clamped * (points.length - 1))));
  const a = points[idx];
  const b = points[idx + 1];
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const len = Math.hypot(dx, dz);
  if (len < 1e-6) return [1, 0];
  return [-dz / len, dx / len];
}

/**
 * Bridges within MIN_BRIDGE_DISTANCE world units of an earlier-emitted bridge
 * are culled. Without this, the per-canal bridge counts compound visually:
 * three inlet bridges + two side-canal bridges + four moat bridges in a Huge
 * port footprint look like ten bridges piled on top of each other in the
 * central wedge. A real medieval city had bridges spaced by neighbourhood,
 * not by canal-segment count.
 */
const MIN_BRIDGE_DISTANCE = 18;
function cullClusteredBridges(bridges: CanalBridge[]): CanalBridge[] {
  const kept: CanalBridge[] = [];
  for (const b of bridges) {
    let tooClose = false;
    for (const k of kept) {
      if (Math.hypot(b.x - k.x, b.z - k.z) < MIN_BRIDGE_DISTANCE) {
        tooClose = true;
        break;
      }
    }
    if (!tooClose) kept.push(b);
  }
  return kept;
}

// ── Main ─────────────────────────────────────────────────────────────────────

/**
 * Harbor unit vector in world coords. Must match coastlineBase+carveHarbor in
 * portArchetypes: rotateToOpen sends the local "into-land" axis to
 * (-sin α, +cos α), so the opposite "toward-harbor" direction is
 * (sin α, -cos α). Earlier versions of this file used +cos which agrees only
 * for E/W; N/S were 180° off and dumped canals into the natural harbor.
 */
function harborDirection(openDirection: CardinalDir | number): [number, number] {
  const dirRad = resolveDirRadians(openDirection);
  return [Math.sin(dirRad), -Math.cos(dirRad)];
}

/**
 * Wedge layout: medieval-Amsterdam topology.
 *   inlet (Damrak/Rokin) crosses the coastline along the inland axis;
 *   a small fan of parallel "burgwallen" run alongside it;
 *   a moat arc (Singel) wraps the city on the inland side.
 * No radials, no nested rings — those are post-1660 features.
 */
function generateWedge(
  centerX: number, centerZ: number,
  def: Extract<CanalLayoutDef, { type: 'wedge' }>,
): CanalLayout {
  const canals: CanalSegment[] = [];
  const bridges: CanalBridge[] = [];

  const [harborX, harborZ] = harborDirection(def.openDirection);
  // Inland direction (opposite of harbor). The inlet runs from harbor side
  // through the port marker into this direction.
  const inlandX = -harborX;
  const inlandZ = -harborZ;
  // Lateral (perpendicular to harbor axis) — used to offset the side canals.
  const latX = inlandZ;   // rotate inland 90° clockwise in XZ
  const latZ = -inlandX;

  const inletHalfW = def.inletWidth / 2;
  const sideHalfW = def.sideCanalWidth / 2;
  const moatHalfW = def.moatWidth / 2;

  // Bridge half-deck length scales with canal width plus a 1.5u floor for the
  // narrowest canals, matching the rule used in concentric.
  const deckOverhang = (halfW: number) => halfW * 1.4 + Math.max(1.5, halfW * 0.25);

  // ── Central inlet ────────────────────────────────────────────────────────
  // Mouth a short way into the harbor, tail well inland (past the moat
  // center) so the inlet visibly straddles the coastline.
  const inletMouthOffset = def.inletWidth * 1.2;
  const inletStart: [number, number] = [
    centerX + harborX * inletMouthOffset,
    centerZ + harborZ * inletMouthOffset,
  ];
  const inletEnd: [number, number] = [
    centerX + inlandX * def.inletDepth,
    centerZ + inlandZ * def.inletDepth,
  ];
  const inletPoints = organicLinePoints(
    inletStart, inletEnd,
    Math.max(8, Math.round(def.inletDepth / 8)),
    def.inletWidth * 0.12,
    0.9,
  );
  canals.push({ polyline: inletPoints, halfWidth: inletHalfW, primary: true });

  const inletBridges = def.bridgesOnInlet ?? 2;
  for (let b = 0; b < inletBridges; b++) {
    // City-side half of the inlet only — the harbor mouth shouldn't have
    // bridges. exclusive-endpoint t in (0.45, 0.9).
    const u = (b + 1) / (inletBridges + 1);
    const t = 0.45 + u * 0.45;
    const [bx, bz] = pointAtPolylineT(inletPoints, t);
    const [nx, nz] = normalAtPolylineT(inletPoints, t);
    bridges.push({
      x: bx,
      z: bz,
      dirX: nx, dirZ: nz,
      halfLength: deckOverhang(inletHalfW),
    });
  }

  // ── Parallel side-canals (burgwallen) ───────────────────────────────────
  // One canal on each side of the inlet, at sideCanalOffsets[i] units lateral
  // from the inlet centerline (mirrored). Each runs roughly the full
  // sideCanalLength inland, starting just shy of the coastline.
  const sideMouthOffset = def.sideCanalWidth * 0.6; // tucked just inside the coast
  const bridgesPerSide = def.bridgesPerSideCanal ?? 1;
  for (const offset of def.sideCanalOffsets) {
    for (const sign of [1, -1] as const) {
      const lateralX = latX * offset * sign;
      const lateralZ = latZ * offset * sign;
      const start: [number, number] = [
        centerX + harborX * -sideMouthOffset + lateralX,
        centerZ + harborZ * -sideMouthOffset + lateralZ,
      ];
      const end: [number, number] = [
        centerX + inlandX * def.sideCanalLength + lateralX,
        centerZ + inlandZ * def.sideCanalLength + lateralZ,
      ];
      const sidePoints = organicLinePoints(
        start, end,
        Math.max(7, Math.round(def.sideCanalLength / 8)),
        def.sideCanalWidth * 0.18,
        1.4 + offset * 0.017 * sign,
      );
      canals.push({ polyline: sidePoints, halfWidth: sideHalfW, primary: false });

      for (let b = 0; b < bridgesPerSide; b++) {
        const u = (b + 1) / (bridgesPerSide + 1);
        const t = 0.35 + u * 0.5; // mid-span bias, away from both ends
        const [bx, bz] = pointAtPolylineT(sidePoints, t);
        const [nx, nz] = normalAtPolylineT(sidePoints, t);
        bridges.push({
          x: bx,
          z: bz,
          dirX: nx, dirZ: nz,
          halfLength: deckOverhang(sideHalfW),
        });
      }
    }
  }

  // ── Moat arc (Singel) ───────────────────────────────────────────────────
  // Partial arc wrapping the city on the inland side. Center at the canal
  // origin (port marker offset slightly inland so the arc has room).
  // Jitter the radius along the arc so it reads as an organic medieval
  // moat rather than a Math.cos curve — the Singel had bastions, kinks
  // and slight bowing at different stretches.
  const moatCenterOffset = def.moatRadius * 0.2;
  const ccx = centerX + inlandX * moatCenterOffset;
  const ccz = centerZ + inlandZ * moatCenterOffset;
  const samples = Math.max(24, Math.round(def.moatRadius * (def.moatExtent / Math.PI)));
  const moatPoints = partialArcPoints(
    ccx, ccz, def.moatRadius, inlandX, inlandZ, def.moatExtent, samples,
    def.moatRadius * 0.07,
  );
  canals.push({ polyline: moatPoints, halfWidth: moatHalfW, primary: false });

  const moatBridges = def.bridgesOnMoat ?? 3;
  for (let b = 0; b < moatBridges; b++) {
    const t = (b + 1) / (moatBridges + 1);
    const idx = Math.floor(t * (moatPoints.length - 1));
    const [bx, bz] = moatPoints[idx];
    const [nx, nz] = normalAtPolylineT(moatPoints, t);
    bridges.push({
      x: bx, z: bz,
      dirX: nx, dirZ: nz,
      halfLength: deckOverhang(moatHalfW),
    });
  }

  return { canals, bridges: cullClusteredBridges(bridges) };
}

export function generateCanalLayout(
  centerX: number,
  centerZ: number,
  def: CanalLayoutDef,
): CanalLayout {
  if (def.type === 'wedge') {
    return generateWedge(centerX, centerZ, def);
  }
  if (def.type !== 'concentric') {
    return { canals: [], bridges: [] };
  }

  const [harborX, harborZ] = harborDirection(def.openDirection);

  // The "canal center" — historically Dam square in Amsterdam, sitting at the
  // south edge of the IJ harbor — is offset slightly AWAY from the harbor so
  // the semicircular rings have room to arc into the city.
  const canalCenterOffset = def.innerRadius * 0.25;
  const ccx = centerX - harborX * canalCenterOffset;
  const ccz = centerZ - harborZ * canalCenterOffset;

  const canals: CanalSegment[] = [];
  const bridges: CanalBridge[] = [];
  const halfW = def.canalWidth / 2;
  const bridgesPerRing = def.bridgesPerRing ?? 3;
  const bridgesPerRadial = def.bridgesPerRadial ?? 1;
  // Overhang past the water edge scales with canal width so wider canals
  // (Venice, ~8u) get proportionally longer abutment ramps than narrow ones
  // (Amsterdam, ~4u). The 1.5u floor keeps the smallest canals usable.
  const bridgeHalfDeck = halfW * 1.4 + Math.max(1.5, halfW * 0.25);

  // ── Concentric rings ──────────────────────────────────────────────────────
  // Each ring is a 180° arc opening toward the harbor. Small deterministic
  // radius variation keeps lagoon-city canals from reading as compass-drawn
  // geometry while preserving broad navigability for bridges and roads.
  for (let r = 0; r < def.rings; r++) {
    const radius = def.innerRadius + r * def.ringSpacing;
    const samples = Math.max(20, Math.round(radius * 1.2));
    const points = partialArcPoints(
      ccx, ccz,
      radius + Math.sin((r + 1) * 1.37) * def.ringSpacing * 0.08,
      -harborX, -harborZ,
      Math.PI * (0.92 + r * 0.08),
      samples,
      Math.min(def.ringSpacing * 0.12, def.canalWidth * 0.9),
    );
    canals.push({ polyline: points, halfWidth: halfW, primary: false });

    // Bridges along the arc — evenly spaced in arc-parameter, offset slightly
    // from each end so they don't sit on a flank where the canal meets the harbor.
    for (let b = 0; b < bridgesPerRing; b++) {
      const t = (b + 1) / (bridgesPerRing + 1); // 0..1, exclusive endpoints
      const idx = Math.floor(t * (points.length - 1));
      const [bx, bz] = points[idx];
      const [nx, nz] = normalAtPolylineT(points, t);
      bridges.push({
        x: bx, z: bz,
        dirX: nx, dirZ: nz,
        halfLength: bridgeHalfDeck,
      });
    }
  }

  // ── Radial canals ─────────────────────────────────────────────────────────
  // Distributed evenly across the 180° span. Each radial runs from the inner
  // ring outward through the outer ring and a short distance beyond, simulating
  // the spokes that historically connected Amsterdam's concentric grid.
  const innerR = def.innerRadius * 0.6;
  const outerR = def.innerRadius + (def.rings - 1) * def.ringSpacing + def.ringSpacing * 0.7;
  for (let i = 0; i < def.radials; i++) {
    // Skip the spokes that would land on the flanks (where rings meet harbor) —
    // distribute across the inner 60% of the arc.
    const t = (i + 1) / (def.radials + 1);
    const angle = (t - 0.5) * Math.PI * 0.85; // ±~76° from the back of the arc
    // Direction outward from canal center, on the city side (opposite harbor).
    const dirAwayX = Math.cos(angle) * (-harborX) + Math.sin(angle) * (-harborZ);
    const dirAwayZ = Math.cos(angle) * (-harborZ) - Math.sin(angle) * (-harborX);
    const start: [number, number] = [ccx + dirAwayX * innerR, ccz + dirAwayZ * innerR];
    const end:   [number, number] = [ccx + dirAwayX * outerR, ccz + dirAwayZ * outerR];
    const points = organicLinePoints(
      start, end,
      Math.max(6, Math.round((outerR - innerR) / 8)),
      def.canalWidth * 0.35,
      2.1 + i * 0.73,
    );
    canals.push({
      polyline: points,
      halfWidth: halfW * 0.85, // radials slightly narrower
      primary: false,
    });

    for (let b = 0; b < bridgesPerRadial; b++) {
      const bt = (b + 1) / (bridgesPerRadial + 1);
      const [bx, bz] = pointAtPolylineT(points, bt);
      const [nx, nz] = normalAtPolylineT(points, bt);
      bridges.push({
        x: bx, z: bz,
        dirX: nx, dirZ: nz,
        halfLength: bridgeHalfDeck * 0.9,
      });
    }
  }

  // ── Central inlet (Damrak/Rokin) ──────────────────────────────────────────
  if (def.centralInlet) {
    const inletDepth = def.inletDepth ?? def.innerRadius * 1.6;
    const inletHalfW = (def.inletWidth ?? def.canalWidth * 1.5) / 2;
    // The inlet must STRADDLE the coastline: mouth a short distance into the
    // harbor (so it visibly opens onto open water), tail well inland past the
    // canal center (so it joins the inner ring instead of dead-ending in the
    // city outskirts). The previous formulation placed both endpoints on the
    // harbor side of the port marker, making the inlet a stranded strip — on
    // Amsterdam this looked like "one short canal" because the rest of the
    // network was masked by harbor water (see harborZ comment above).
    const mouthOffset = def.canalWidth * 1.5;
    const tailOffset = Math.max(inletDepth - mouthOffset, def.innerRadius * 0.5);
    const start: [number, number] = [
      centerX + harborX * mouthOffset,
      centerZ + harborZ * mouthOffset,
    ];
    const end: [number, number] = [
      centerX - harborX * tailOffset,
      centerZ - harborZ * tailOffset,
    ];
    const inletPoints = organicLinePoints(
      start, end,
      Math.max(8, Math.round((mouthOffset + tailOffset) / 8)),
      inletHalfW * 0.28,
      0.4,
    );
    canals.push({
      polyline: inletPoints,
      halfWidth: inletHalfW,
      primary: true,
    });

    const inletBridges = def.bridgesOnInlet ?? 2;
    for (let b = 0; b < inletBridges; b++) {
      // Bridges only along the city-side half of the inlet — the harbor end
      // is open to the IJ and shouldn't have crossings. Use the same
      // exclusive-endpoint pattern as the rings so a single bridge lands
      // mid-span (t=0.7) instead of on the harbor seam.
      const u = (b + 1) / (inletBridges + 1); // 0..1, exclusive endpoints
      const t = 0.5 + u * 0.4;                // remapped to (0.5, 0.9)
      const [bx, bz] = pointAtPolylineT(inletPoints, t);
      const [nx, nz] = normalAtPolylineT(inletPoints, t);
      bridges.push({
        x: bx, z: bz,
        dirX: nx, dirZ: nz,
        halfLength: inletHalfW + 3,
      });
    }
  }

  return { canals, bridges: cullClusteredBridges(bridges) };
}

// ── Geometry queries (consumed by cityGenerator) ─────────────────────────────

/**
 * Signed distance from point (px, pz) to the nearest canal edge. Negative
 * inside a canal water strip (deepest at the centerline = -halfWidth);
 * positive outside (distance from the edge). Callers can derive the legacy
 * fields:
 *   insideCanal = signedDist <= 0
 *   dist        = |signedDist|
 *
 * Returning the signed distance lets the terrain canal-carve apply a smooth
 * band beyond `halfWidth` — so a narrow canal that the mesh sampling would
 * otherwise step right over (Nyquist-aliasing) still pulls at least one
 * nearby vertex below sea level. Without that band, canals narrower than
 * ~3 mesh quads render invisibly.
 */
export function signedDistanceToNearestCanal(
  px: number, pz: number,
  layout: CanalLayout,
): number {
  let best = Infinity;
  for (const seg of layout.canals) {
    const pts = seg.polyline;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i];
      const [bx, bz] = pts[i + 1];
      const dx = bx - ax;
      const dz = bz - az;
      const len2 = dx * dx + dz * dz;
      if (len2 < 1e-6) continue;
      let t = ((px - ax) * dx + (pz - az) * dz) / len2;
      if (t < 0) t = 0; else if (t > 1) t = 1;
      const cx = ax + dx * t;
      const cz = az + dz * t;
      const d = Math.hypot(px - cx, pz - cz) - seg.halfWidth;
      if (d < best) best = d;
    }
  }
  return best;
}

/**
 * Legacy convenience wrapper. Returns the inside flag and the absolute
 * distance to the nearest canal edge. Prefer `signedDistanceToNearestCanal`
 * for new code that needs to apply a smooth carve band.
 */
export function distanceToNearestCanal(
  px: number, pz: number,
  layout: CanalLayout,
): { dist: number; insideCanal: boolean } {
  const signed = signedDistanceToNearestCanal(px, pz, layout);
  return { dist: Math.abs(signed), insideCanal: signed <= 0 };
}
