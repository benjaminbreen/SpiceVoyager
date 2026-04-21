// Canal-city urban layout. Output is consumed by cityGenerator: canal polylines
// carve water strips into the land mask, and bridge crossings become tier='bridge'
// roads laid perpendicular to each canal.
//
// Phase 1 supports the 'concentric' pattern (Amsterdam: semicircular arcs around
// a city core, opening toward the harbor, plus radial spokes and an optional
// central inlet representing the Damrak/Rokin). Phase 2 will add 'lagoon-grid'
// for Venice using the same output shape.

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

/** Sample N points evenly along a semicircular arc opening in `awayDirRad`. */
function arcPoints(
  cx: number, cz: number,
  radius: number,
  awayDirX: number, awayDirZ: number,
  samples: number,
): [number, number][] {
  // The arc covers 180°, sweeping from +90° to -90° relative to awayDir.
  // Tangent basis: awayDir is the "north" of the arc (the open side); rotate 90°
  // clockwise to get the sweep start direction.
  const startX = -awayDirZ;  // perpendicular, starts on one flank
  const startZ =  awayDirX;
  // We want the arc on the side OPPOSITE awayDir (the city side, away from harbor).
  // Parametrize point = center + radius * (cos(t) * startDir + sin(t) * (-awayDir))
  // for t in [0, π] — when t=0 we're at one flank, t=π/2 we're at the back of the
  // arc (deepest into city), t=π we're at the other flank.
  const out: [number, number][] = [];
  for (let i = 0; i < samples; i++) {
    const t = (i / (samples - 1)) * Math.PI;
    const c = Math.cos(t);
    const s = Math.sin(t);
    const px = cx + radius * (c * startX + s * (-awayDirX));
    const pz = cz + radius * (c * startZ + s * (-awayDirZ));
    out.push([px, pz]);
  }
  return out;
}

// ── Main ─────────────────────────────────────────────────────────────────────

export function generateCanalLayout(
  centerX: number,
  centerZ: number,
  def: CanalLayoutDef,
): CanalLayout {
  if (def.type !== 'concentric') {
    return { canals: [], bridges: [] };
  }

  // Harbor direction unit vector. Convention matches portArchetypes: 0 = N, 90 = E,
  // measured clockwise. We map N → +Z (so harborDir for openDirection 'N' is (0, 1)).
  // This matches the rest of the codebase's local-frame convention where the harbor
  // sits on the +Z side of the map relative to the city.
  const dirRad = resolveDirRadians(def.openDirection);
  const harborX = Math.sin(dirRad);
  const harborZ = Math.cos(dirRad);

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
  const bridgeHalfDeck = halfW + 2.5; // a little overhang past the water edge

  // ── Concentric rings ──────────────────────────────────────────────────────
  // Each ring is a 180° arc opening toward the harbor.
  for (let r = 0; r < def.rings; r++) {
    const radius = def.innerRadius + r * def.ringSpacing;
    const samples = Math.max(20, Math.round(radius * 1.2));
    const points = arcPoints(ccx, ccz, radius, harborX, harborZ, samples);
    canals.push({ polyline: points, halfWidth: halfW, primary: false });

    // Bridges along the arc — evenly spaced in arc-parameter, offset slightly
    // from each end so they don't sit on a flank where the canal meets the harbor.
    for (let b = 0; b < bridgesPerRing; b++) {
      const t = (b + 1) / (bridgesPerRing + 1); // 0..1, exclusive endpoints
      const idx = Math.floor(t * (points.length - 1));
      const [bx, bz] = points[idx];
      // Bridge crosses radially — direction is from canal-center outward.
      const ox = bx - ccx;
      const oz = bz - ccz;
      const ol = Math.hypot(ox, oz) || 1;
      bridges.push({
        x: bx, z: bz,
        dirX: ox / ol, dirZ: oz / ol,
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
    canals.push({
      polyline: [start, end],
      halfWidth: halfW * 0.85, // radials slightly narrower
      primary: false,
    });

    for (let b = 0; b < bridgesPerRadial; b++) {
      const bt = (b + 1) / (bridgesPerRadial + 1);
      const bx = start[0] + (end[0] - start[0]) * bt;
      const bz = start[1] + (end[1] - start[1]) * bt;
      // Perpendicular to the radial: rotate the radial direction by 90°.
      bridges.push({
        x: bx, z: bz,
        dirX: -dirAwayZ, dirZ: dirAwayX,
        halfLength: bridgeHalfDeck * 0.9,
      });
    }
  }

  // ── Central inlet (Damrak/Rokin) ──────────────────────────────────────────
  if (def.centralInlet) {
    const inletDepth = def.inletDepth ?? def.innerRadius * 1.6;
    const inletHalfW = (def.inletWidth ?? def.canalWidth * 1.5) / 2;
    // Starts at the harbor side (out past the rings) and runs to canal center.
    const harborEdgeDist = outerR + 8;
    const start: [number, number] = [
      centerX + harborX * harborEdgeDist,
      centerZ + harborZ * harborEdgeDist,
    ];
    const end: [number, number] = [
      centerX + harborX * (harborEdgeDist - inletDepth),
      centerZ + harborZ * (harborEdgeDist - inletDepth),
    ];
    canals.push({
      polyline: [start, end],
      halfWidth: inletHalfW,
      primary: true,
    });

    const inletBridges = def.bridgesOnInlet ?? 2;
    for (let b = 0; b < inletBridges; b++) {
      // Bridges only along the city-side half of the inlet — the harbor end
      // is open to the IJ and shouldn't have crossings.
      const t = 0.45 + (b / Math.max(1, inletBridges - 1)) * 0.45;
      const bx = start[0] + (end[0] - start[0]) * t;
      const bz = start[1] + (end[1] - start[1]) * t;
      // Perpendicular to harbor direction.
      bridges.push({
        x: bx, z: bz,
        dirX: -harborZ, dirZ: harborX,
        halfLength: inletHalfW + 3,
      });
    }
  }

  return { canals, bridges };
}

// ── Geometry queries (consumed by cityGenerator) ─────────────────────────────

/**
 * Distance from point (px, pz) to the nearest canal edge. Returns 0 if the
 * point is inside any canal water strip, otherwise the positive distance to
 * the nearest canal centerline minus halfWidth. Used by the cell carver.
 */
export function distanceToNearestCanal(
  px: number, pz: number,
  layout: CanalLayout,
): { dist: number; insideCanal: boolean } {
  let bestSignedDist = Infinity;
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
      if (d < bestSignedDist) bestSignedDist = d;
    }
  }
  return { dist: Math.abs(bestSignedDist), insideCanal: bestSignedDist <= 0 };
}
