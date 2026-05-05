import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore, PORT_FACTION, PORT_CULTURAL_REGION } from '../../../store/gameStore';
import { getEffectiveRainIntensity } from '../../../store/weather';
import { ROAD_POLYGON_OFFSET_UNITS, ROAD_TIER_STYLE, FARM_TRACK_OPACITY, FARM_TRACK_WIDTH, FARM_TRACK_Y_LIFT, BRIDGE_DECK_Y } from '../../../utils/roadStyle';
import { getTerrainHeight } from '../../../utils/terrain';

// ── Roads ────────────────────────────────────────────────────────────────────
// Extrudes each road polyline as a thin ribbon along the ground.

type PortsProp = ReturnType<typeof useGameStore.getState>['ports'];

type RoadTierKey = 'path' | 'road' | 'avenue' | 'bridge';
// ROAD_TIER_STYLE (width / yLift / renderOrder) is imported from
// ../utils/roadStyle so the ground-height resolver stays in lockstep with
// the ribbon renderer. Per-variant colour/roughness tables still live
// below because they're render-only.

// ── Road colour variants by culture ──────────────────────────────────────────
// The tier (path/road/avenue) sets width; the variant sets colour + roughness.
// Dispatch via roadVariantForPort() — falls through to 'european' so any port
// missing from our taxonomy still renders.
type RoadVariantKey =
  | 'european'      // London, Amsterdam — dark earth, flagstone avenues
  | 'iberian'       // Lisbon, Seville, Iberian colonial (Goa, Macau, Salvador…)
  | 'arab'          // Aden, Muscat, Hormuz — pale limestone
  | 'swahili'       // Mombasa, Zanzibar — warm coral sand
  | 'south-india'   // Calicut, Cochin, Surat — red laterite
  | 'chinese'       // Macau (non-Portuguese blocks), generic Chinese
  | 'malay'         // Malacca, Aceh, Bantam — packed tropical earth
  | 'african';      // Elmina, Luanda — ochre/red earth

function rememberDryRoadMaterial(mat: THREE.MeshStandardMaterial) {
  mat.userData.dryColor = mat.color.clone();
  mat.userData.dryRoughness = mat.roughness;
  return mat;
}

function applyRoadWetness(mat: THREE.MeshStandardMaterial, wetness: number) {
  const dryColor = mat.userData.dryColor as THREE.Color | undefined;
  const dryRoughness = mat.userData.dryRoughness as number | undefined;
  if (!dryColor || dryRoughness === undefined) return;
  mat.color.copy(dryColor).lerp(_roadWetColor.copy(dryColor).multiplyScalar(0.58), wetness);
  mat.roughness = THREE.MathUtils.lerp(dryRoughness, 0.58, wetness);
}

const _roadWetColor = new THREE.Color();

// Per-variant colour + roughness per tier. Keeping tier widths in
// ROAD_TIER_STYLE above; this table only modulates the material look.
const ROAD_VARIANT_STYLE: Record<RoadVariantKey, Record<'path' | 'road' | 'avenue', { color: string; roughness: number }>> = {
  'european': {
    path:   { color: '#8a6f4a', roughness: 1.00 },
    road:   { color: '#7a6850', roughness: 0.95 },
    avenue: { color: '#938875', roughness: 0.80 }, // weathered flagstone
  },
  'iberian': {
    path:   { color: '#a28968', roughness: 0.95 },
    road:   { color: '#9a8062', roughness: 0.90 },
    avenue: { color: '#b8a886', roughness: 0.78 }, // pale limestone paseo
  },
  'arab': {
    path:   { color: '#b3a17d', roughness: 0.95 },
    road:   { color: '#a8956f', roughness: 0.90 },
    avenue: { color: '#c6b892', roughness: 0.80 }, // whitewashed limestone
  },
  'swahili': {
    path:   { color: '#bfa37a', roughness: 0.95 },
    road:   { color: '#b29368', roughness: 0.90 },
    avenue: { color: '#d4bd94', roughness: 0.82 }, // crushed coral
  },
  'south-india': {
    path:   { color: '#9a6a4a', roughness: 1.00 },
    road:   { color: '#8a5a3d', roughness: 0.95 },
    avenue: { color: '#a87356', roughness: 0.88 }, // laterite red
  },
  'chinese': {
    path:   { color: '#7a7468', roughness: 0.95 },
    road:   { color: '#6d685c', roughness: 0.90 },
    avenue: { color: '#8a8478', roughness: 0.82 }, // grey granite
  },
  'malay': {
    path:   { color: '#8f6f46', roughness: 1.00 },
    road:   { color: '#80633c', roughness: 0.98 }, // packed tropical earth
    avenue: { color: '#9a7a52', roughness: 0.92 },
  },
  'african': {
    path:   { color: '#a06844', roughness: 1.00 },
    road:   { color: '#935a38', roughness: 0.98 },
    avenue: { color: '#ad7550', roughness: 0.92 }, // ochre earth
  },
};

function roadVariantForPort(
  culture: string,
  nationality?: string,
  region?: string,
): RoadVariantKey {
  // Iberian colonial overlay: Portuguese/Spanish control outside the
  // peninsula still paves the quay in pale Iberian stone.
  if (nationality === 'Portuguese' || nationality === 'Spanish') return 'iberian';
  if (region === 'Arab')      return 'arab';
  if (region === 'Swahili')   return 'swahili';
  if (region === 'Gujarati' || region === 'Malabari') return 'south-india';
  if (region === 'Malay')     return 'malay';
  if (region === 'Chinese')   return 'chinese';
  if (culture === 'West African') return 'african';
  if (culture === 'Atlantic') return 'iberian'; // Salvador, Havana, Cartagena
  return 'european';
}

// ── Bridge styles ────────────────────────────────────────────────────────────
// Three cultural variants. Dispatch by port.culture in bridgeStyleForPort().
type BridgeStyleKey = 'stone' | 'timber' | 'plank';

const BRIDGE_STYLE: Record<BridgeStyleKey, {
  deckColor: string;
  deckRoughness: number;
  parapet: { color: string; height: number; thickness: number } | null;
  pier: { radiusTop: number; radiusBot: number; height: number; color: string; segments: number };
  pierStep: number; // sample every Nth interior deck node
}> = {
  // European: weathered grey stone deck, low stone parapet, stout tapered piers.
  stone: {
    deckColor: '#5a5550', deckRoughness: 0.9,
    parapet: { color: '#6b655e', height: 0.5, thickness: 0.3 },
    pier: { radiusTop: 0.6, radiusBot: 0.8, height: 3.4, color: '#4a4540', segments: 8 },
    pierStep: 2,
  },
  // Indian Ocean: dark timber deck, slim wooden rail, closely spaced piles.
  timber: {
    deckColor: '#5a4632', deckRoughness: 1.0,
    parapet: { color: '#3e2f22', height: 0.35, thickness: 0.15 },
    pier: { radiusTop: 0.18, radiusBot: 0.18, height: 3.6, color: '#3a2c20', segments: 6 },
    pierStep: 1,
  },
  // West African / Atlantic / fallback: rough planks on log piers, no railing.
  plank: {
    deckColor: '#6b5230', deckRoughness: 1.0,
    parapet: null,
    pier: { radiusTop: 0.22, radiusBot: 0.28, height: 3.4, color: '#2d231a', segments: 6 },
    pierStep: 2,
  },
};

function bridgeStyleForPort(culture: string): BridgeStyleKey {
  if (culture === 'European') return 'stone';
  if (culture === 'Indian Ocean') return 'timber';
  return 'plank';
}

// Turns sharper than this (measured by dot of adjacent segment tangents)
// trigger a miter break instead of a smooth averaged-tangent vertex. At a
// break the shared vertex is duplicated: one perpendicular pair oriented to
// the incoming segment, one to the outgoing — so the ribbon edge doesn't
// pinch on the outside of a sharp corner.
// cos(75°) ≈ 0.26. Picked empirically: smoother turns than ~75° look fine
// mitered, sharper than that visibly pinch.
const RIBBON_MITER_DOT = 0.26;
const RIBBON_MIN_POINT_SPACING = 0.08;
const RIBBON_EDGE_MAX_DELTA = 1.2;
const RIBBON_MAX_SPIKE_SEG_LEN = 0.6;
const RIBBON_SPIKE_DOT = -0.85;

function addRoadSurfaceGrain(
  mat: THREE.MeshStandardMaterial,
  strength = 0.10,
  scale = 1.0,
  edgeFeather = 0.35,
): THREE.MeshStandardMaterial {
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>
      attribute float aRoadAcross;
      varying float vRoadAcross;
      varying vec3 vRoadWorldPos;`
    );
    shader.vertexShader = shader.vertexShader.replace(
      '#include <worldpos_vertex>',
      `#include <worldpos_vertex>
      vRoadAcross = aRoadAcross;
      vRoadWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;`
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
      varying float vRoadAcross;
      varying vec3 vRoadWorldPos;

      float roadHash(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
      }

      float roadNoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = roadHash(i);
        float b = roadHash(i + vec2(1.0, 0.0));
        float c = roadHash(i + vec2(0.0, 1.0));
        float d = roadHash(i + vec2(1.0, 1.0));
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }`
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      {
        vec2 p = vRoadWorldPos.xz * ${scale.toFixed(2)};
        float gravel = roadNoise(p * 2.8) * 2.0 - 1.0;
        float grit = roadHash(floor(p * 11.0)) * 2.0 - 1.0;
        float lane = roadNoise(vec2(p.x * 0.28, p.y * 1.35)) * 2.0 - 1.0;
        float worn = smoothstep(0.55, 0.98, roadNoise(p * 0.42 + 19.7));
        float detail = gravel * 0.56 + grit * 0.18 + lane * 0.26;
        diffuseColor.rgb *= 1.0 + detail * ${strength.toFixed(2)};
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.08, 1.04, 0.96), worn * ${(
          strength * 0.55
        ).toFixed(2)});
        float edge = abs(vRoadAcross - 0.5) * 2.0;
        float feather = 1.0 - smoothstep(0.76, 1.0, edge);
        diffuseColor.a *= mix(1.0, feather, ${edgeFeather.toFixed(2)});
      }`
    );
  };
  return mat;
}

function sanitizeRibbonPoints(points: [number, number, number][]): [number, number, number][] {
  if (points.length < 2) return points;
  const out: [number, number, number][] = [points[0]];
  const minDistSq = RIBBON_MIN_POINT_SPACING * RIBBON_MIN_POINT_SPACING;
  for (let i = 1; i < points.length; i++) {
    const prev = out[out.length - 1];
    const p = points[i];
    const dx = p[0] - prev[0];
    const dz = p[2] - prev[2];
    if (dx * dx + dz * dz < minDistSq) {
      // Keep the latest height sample for the same XZ position without
      // emitting a zero-length segment that would poison the tangent pass.
      out[out.length - 1] = p;
      continue;
    }
    if (out.length >= 2) {
      const beforePrev = out[out.length - 2];
      const backDx = p[0] - beforePrev[0];
      const backDz = p[2] - beforePrev[2];
      if (backDx * backDx + backDz * backDz < minDistSq) {
        out.pop();
        out[out.length - 1] = p;
        continue;
      }
      const prevDx = prev[0] - beforePrev[0];
      const prevDz = prev[2] - beforePrev[2];
      const prevLen = Math.hypot(prevDx, prevDz);
      const nextLen = Math.hypot(dx, dz);
      if (prevLen < RIBBON_MAX_SPIKE_SEG_LEN && nextLen < RIBBON_MAX_SPIKE_SEG_LEN) {
        const dot = (prevDx / prevLen) * (dx / nextLen) + (prevDz / prevLen) * (dz / nextLen);
        if (dot < RIBBON_SPIKE_DOT) {
          out.pop();
          out.push(p);
          continue;
        }
      }
    }
    out.push(p);
  }
  return out.length >= 2 ? out : points;
}

function buildRoadRibbon(
  rawPoints: [number, number, number][],
  width: number,
  yLift: number,
  taperStart: boolean = true,
  taperEnd: boolean = true,
  sampleEdgeY?: (x: number, z: number) => number,
): THREE.BufferGeometry | null {
  const points = sanitizeRibbonPoints(rawPoints);
  const n = points.length;
  if (n < 2) return null;
  const half = width / 2;
  const startW = half * (taperStart ? 0.85 : 1.0);
  const endW = half * (taperEnd ? 0.85 : 1.0);

  // Precompute per-segment tangents so we can test miter at interior vertices.
  const segTanX: number[] = new Array(n - 1);
  const segTanZ: number[] = new Array(n - 1);
  for (let i = 0; i < n - 1; i++) {
    const dx = points[i + 1][0] - points[i][0];
    const dz = points[i + 1][2] - points[i][2];
    const len = Math.hypot(dx, dz);
    if (len < 1e-5) { segTanX[i] = 1; segTanZ[i] = 0; }
    else { segTanX[i] = dx / len; segTanZ[i] = dz / len; }
  }

  const verts: number[] = [];
  const acrosses: number[] = [];
  // When sampleEdgeY is provided, the two ribbon edges use that callback's
  // Y instead of inheriting the centerline polyline Y. This lets a road
  // bank with the cross-slope on a hillside instead of cutting horizontally
  // through it (current behaviour for non-bridge tiers, which pass terrain
  // height as the sampler). Bridges leave it undefined so the deck stays
  // a flat plane at BRIDGE_DECK_Y across its full width.
  const pushPair = (
    px: number, py: number, pz: number,
    nx: number, nz: number, w: number,
  ): number => {
    const idx = verts.length / 3;
    const lx = px + nx * w;
    const lz = pz + nz * w;
    const rx = px - nx * w;
    const rz = pz - nz * w;
    let ly = py;
    let ry = py;
    if (sampleEdgeY) {
      const centerTerrainY = sampleEdgeY(px, pz);
      const elevatedCenterline = py > centerTerrainY + 0.25;
      ly = sampleEdgeY(lx, lz);
      ry = sampleEdgeY(rx, rz);
      if (elevatedCenterline) {
        ly = Math.max(ly, py);
        ry = Math.max(ry, py);
      } else {
        const roadBaseY = Math.max(py, centerTerrainY);
        // Riverbanks, canal lips, and steep terrain can put one sampled edge
        // far above/below the road centerline. A flat ribbon twisted across
        // that height gap creates the torn brown patches visible at some
        // ports. Keep mild banking, but clamp cliff/shore samples back toward
        // the centerline so roads read as ground decals rather than draped
        // terrain strips.
        ly = Math.max(
          roadBaseY,
          THREE.MathUtils.clamp(ly, roadBaseY - RIBBON_EDGE_MAX_DELTA, roadBaseY + RIBBON_EDGE_MAX_DELTA),
        );
        ry = Math.max(
          roadBaseY,
          THREE.MathUtils.clamp(ry, roadBaseY - RIBBON_EDGE_MAX_DELTA, roadBaseY + RIBBON_EDGE_MAX_DELTA),
        );
      }
    }
    verts.push(lx, ly + yLift, lz);
    verts.push(rx, ry + yLift, rz);
    acrosses.push(0, 1);
    return idx;
  };

  // For each segment i (from vertex i to i+1), record the left-vertex index
  // of its start pair and end pair. A smooth interior vertex shares one
  // pair between adjacent segments; a mitered interior vertex emits two
  // independent pairs so the segments triangulate separately at the turn.
  const segStart: number[] = new Array(n - 1);
  const segEnd: number[] = new Array(n - 1);

  // Vertex 0 — only "outgoing" pair.
  {
    const [px, py, pz] = points[0];
    const nx = -segTanZ[0], nz = segTanX[0];
    segStart[0] = pushPair(px, py, pz, nx, nz, startW);
  }

  // Interior vertices — decide smooth miter or break.
  for (let i = 1; i < n - 1; i++) {
    const [px, py, pz] = points[i];
    const inX = segTanX[i - 1], inZ = segTanZ[i - 1];
    const outX = segTanX[i], outZ = segTanZ[i];
    const dot = inX * outX + inZ * outZ;

    if (dot >= RIBBON_MITER_DOT) {
      // Smooth turn — one shared pair using the averaged tangent.
      let tx = inX + outX;
      let tz = inZ + outZ;
      const tl = Math.hypot(tx, tz);
      if (tl < 1e-5) { tx = 1; tz = 0; } else { tx /= tl; tz /= tl; }
      const nx = -tz, nz = tx;
      const idx = pushPair(px, py, pz, nx, nz, half);
      segEnd[i - 1] = idx;
      segStart[i] = idx;
    } else {
      // Sharp turn — break the ribbon with two independent pairs so the
      // incoming segment's outer edge doesn't stretch across to the outgoing
      // segment's outer edge (which is what produces the visible pinch).
      segEnd[i - 1] = pushPair(px, py, pz, -inZ, inX, half);
      segStart[i] = pushPair(px, py, pz, -outZ, outX, half);
    }
  }

  // Vertex n-1 — only "incoming" pair.
  {
    const [px, py, pz] = points[n - 1];
    const nx = -segTanZ[n - 2], nz = segTanX[n - 2];
    segEnd[n - 2] = pushPair(px, py, pz, nx, nz, endW);
  }

  const positions = new Float32Array(verts);
  const indices: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const a = segStart[i];      // left start
    const b = a + 1;            // right start
    const c = segEnd[i];        // left end
    const d = c + 1;            // right end
    // Two triangles per segment, CCW viewed from above.
    indices.push(a, c, b);
    indices.push(b, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aRoadAcross', new THREE.BufferAttribute(new Float32Array(acrosses), 1));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

// Offset a polyline perpendicular to its tangent in the XZ plane, preserving
// y. Used to build parapet centerlines from a deck centerline.
function offsetPolylineXZ(
  points: [number, number, number][],
  offset: number,
  yLift: number,
): [number, number, number][] {
  const n = points.length;
  const out: [number, number, number][] = new Array(n);
  for (let i = 0; i < n; i++) {
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(n - 1, i + 1)];
    let tx = next[0] - prev[0];
    let tz = next[2] - prev[2];
    const tl = Math.hypot(tx, tz);
    if (tl < 1e-5) { tx = 1; tz = 0; } else { tx /= tl; tz /= tl; }
    const nx = -tz, nz = tx;
    const [px, py, pz] = points[i];
    out[i] = [px + nx * offset, py + yLift, pz + nz * offset];
  }
  return out;
}

// Swept box wall along a polyline. Each polyline vertex emits 4 corners
// (outer-bottom, inner-bottom, inner-top, outer-top). Adjacent segments
// share corners via smooth miter on interior vertices, and the two short
// ends get capped so the wall isn't see-through. Used for bridge parapets
// so railings read as solid walls rather than flat ribbons hovering above
// the deck.
function buildWallRibbon(
  centerline: [number, number, number][],
  thickness: number,
  height: number,
): THREE.BufferGeometry | null {
  const n = centerline.length;
  if (n < 2) return null;
  const halfT = thickness / 2;

  // Per-segment tangents for mitering interior vertices.
  const segTanX: number[] = new Array(n - 1);
  const segTanZ: number[] = new Array(n - 1);
  for (let i = 0; i < n - 1; i++) {
    const dx = centerline[i + 1][0] - centerline[i][0];
    const dz = centerline[i + 1][2] - centerline[i][2];
    const len = Math.hypot(dx, dz);
    if (len < 1e-5) { segTanX[i] = 1; segTanZ[i] = 0; }
    else { segTanX[i] = dx / len; segTanZ[i] = dz / len; }
  }

  const verts: number[] = [];
  for (let i = 0; i < n; i++) {
    let tx: number, tz: number;
    if (i === 0) { tx = segTanX[0]; tz = segTanZ[0]; }
    else if (i === n - 1) { tx = segTanX[n - 2]; tz = segTanZ[n - 2]; }
    else {
      const ax = segTanX[i - 1] + segTanX[i];
      const az = segTanZ[i - 1] + segTanZ[i];
      const al = Math.hypot(ax, az);
      if (al < 1e-5) { tx = segTanX[i]; tz = segTanZ[i]; }
      else { tx = ax / al; tz = az / al; }
    }
    const nx = -tz, nz = tx;
    const [px, py, pz] = centerline[i];
    // 4 corners per sample, in order: outerBottom, innerBottom, innerTop, outerTop.
    verts.push(px + nx * halfT, py,          pz + nz * halfT);
    verts.push(px - nx * halfT, py,          pz - nz * halfT);
    verts.push(px - nx * halfT, py + height, pz - nz * halfT);
    verts.push(px + nx * halfT, py + height, pz + nz * halfT);
  }

  const indices: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const a = i * 4;
    const b = (i + 1) * 4;
    // Outer face (+nx side), CCW viewed from outside.
    indices.push(a + 0, b + 0, b + 3);
    indices.push(a + 0, b + 3, a + 3);
    // Inner face (-nx side), CCW viewed from inside.
    indices.push(a + 1, a + 2, b + 2);
    indices.push(a + 1, b + 2, b + 1);
    // Top face, CCW viewed from above.
    indices.push(a + 3, b + 3, b + 2);
    indices.push(a + 3, b + 2, a + 2);
  }
  // End caps. Start cap faces away from segment direction; end cap with it.
  indices.push(0, 3, 2);
  indices.push(0, 2, 1);
  const e = (n - 1) * 4;
  indices.push(e + 0, e + 1, e + 2);
  indices.push(e + 0, e + 2, e + 3);

  const positions = new Float32Array(verts);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function mergeGeometries(geos: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
  if (geos.length === 0) return null;
  let totalVerts = 0, totalIdx = 0;
  for (const g of geos) {
    totalVerts += g.getAttribute('position').count;
    totalIdx += g.getIndex()!.count;
  }
  const mergedPos = new Float32Array(totalVerts * 3);
  const mergedIdx = new Uint32Array(totalIdx);
  let posOff = 0, idxOff = 0, vertOff = 0;
  for (const g of geos) {
    const pos = g.getAttribute('position').array as Float32Array;
    mergedPos.set(pos, posOff);
    posOff += pos.length;
    const idx = g.getIndex()!.array as ArrayLike<number>;
    for (let k = 0; k < idx.length; k++) mergedIdx[idxOff + k] = idx[k] + vertOff;
    idxOff += idx.length;
    vertOff += g.getAttribute('position').count;
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(mergedPos, 3));
  merged.setIndex(new THREE.BufferAttribute(mergedIdx, 1));
  merged.computeVertexNormals();
  geos.forEach(g => g.dispose());
  return merged;
}

// Farm tracks — narrow dirt footpaths out to hamlets/farmsteads. Rendered as
// a separate mesh so they can be thinner and semi-transparent, visually
// distinct from the port's built road network. Detected by id prefix emitted
// from hinterland.ts. Constants live in ../utils/roadStyle.
function isFarmTrackRoad(id: string): boolean {
  return id.startsWith('farm_track_');
}

export function CityRoads({ ports }: { ports: PortsProp }) {
  const { tierVariantMeshes, farmTrackMeshes, bridgeMeshes, bridgePiersByStyle } = useMemo(() => {
    // Non-bridge roads grouped by (tier, variant) so each culture renders with
    // its own colour without re-allocating a material per port.
    type TierKey = Exclude<RoadTierKey, 'bridge'>;
    const byTierVariant = new Map<string, THREE.BufferGeometry[]>();
    const byFarmTrackVariant = new Map<RoadVariantKey, THREE.BufferGeometry[]>();
    const keyFor = (t: TierKey, v: RoadVariantKey) => `${t}|${v}`;
    // Bridges grouped by cultural style. Each style accumulates deck +
    // parapet ribbons separately so they can use distinct materials.
    const bridgeBuckets: Record<BridgeStyleKey, {
      deck: THREE.BufferGeometry[];
      parapet: THREE.BufferGeometry[];
      piers: [number, number, number][];
    }> = {
      stone:  { deck: [], parapet: [], piers: [] },
      timber: { deck: [], parapet: [], piers: [] },
      plank:  { deck: [], parapet: [], piers: [] },
    };

    const deckHalfWidth = ROAD_TIER_STYLE.bridge.width / 2;

    for (const port of ports) {
      if (!port.roads || port.roads.length === 0) continue;
      const bridgeStyle = bridgeStyleForPort(port.culture);
      const bs = BRIDGE_STYLE[bridgeStyle];
      const nat = PORT_FACTION[port.id];
      const reg = PORT_CULTURAL_REGION[port.id];
      const variant = roadVariantForPort(port.culture, nat, reg);
      // Per-road taper flags: a true dead-end (graph node degree 1) keeps
      // the 15% endpoint taper for a soft fade into grass/building anchor;
      // a welded endpoint (degree ≥ 2) stays full width so its ribbon
      // meets the target cleanly. Falls back to "taper both ends" if no
      // graph is available (older saves, malformed port data).
      const endpointTapers = new Map<string, [boolean, boolean]>();
      const graph = port.roadGraph;
      if (graph) {
        for (const edge of graph.edges) {
          const fromDead = edge.fromNode >= 0 && graph.nodes[edge.fromNode].degree === 1;
          const toDead = edge.toNode >= 0 && graph.nodes[edge.toNode].degree === 1;
          endpointTapers.set(edge.roadId, [fromDead, toDead]);
        }
      }
      const taperFor = (roadId: string): [boolean, boolean] =>
        endpointTapers.get(roadId) ?? [true, true];

      for (const r of port.roads) {
        if (r.tier === 'bridge') {
          const [ts, te] = taperFor(r.id);
          const deckGeo = buildRoadRibbon(r.points, ROAD_TIER_STYLE.bridge.width, 0, ts, te);
          if (deckGeo) bridgeBuckets[bridgeStyle].deck.push(deckGeo);
          // Parapets: a solid extruded box wall along each deck edge so the
          // railing reads as a proper parapet rather than a flat strip. The
          // wall base sits on the deck plane and rises by parapet.height.
          if (bs.parapet) {
            const railOffset = deckHalfWidth - bs.parapet.thickness / 2;
            const leftCenter  = offsetPolylineXZ(r.points,  railOffset, 0);
            const rightCenter = offsetPolylineXZ(r.points, -railOffset, 0);
            const lg = buildWallRibbon(leftCenter,  bs.parapet.thickness, bs.parapet.height);
            const rg = buildWallRibbon(rightCenter, bs.parapet.thickness, bs.parapet.height);
            if (lg) bridgeBuckets[bridgeStyle].parapet.push(lg);
            if (rg) bridgeBuckets[bridgeStyle].parapet.push(rg);
          }
          // Piers on interior deck nodes at the style's spacing. Restrict
          // to points sitting on the water-span deck plane — abutment ramp
          // points ride below the deck (terrain Y) and clifftop abutments
          // get clamped up above it, so anything meaningfully off the deck
          // plane is land and would produce a pier stuck in the ground.
          //
          // Bridges over canals use a lower deck (CANAL_BRIDGE_DECK_Y) than
          // bridges over rivers; rather than tracking which is which, we
          // infer the deck plane from the road's MIDDLE point — by the
          // pathToRoad construction it's always a water-span vertex sitting
          // exactly on the deck plane.
          const midIdx = Math.floor(r.points.length / 2);
          const inferredDeckY = r.points[midIdx]?.[1] ?? BRIDGE_DECK_Y;
          for (let i = 1; i < r.points.length - 1; i += bs.pierStep) {
            if (Math.abs(r.points[i][1] - inferredDeckY) > 0.05) continue;
            bridgeBuckets[bridgeStyle].piers.push(r.points[i]);
          }
        } else if (isFarmTrackRoad(r.id)) {
          // Farm tracks render thinner and faded so they read as footpaths
          // rather than built roads. They stay on 'path' tier in the data
          // model so pedestrian corridor-snapping treats them like any road.
          // The terrain edge sampler keeps both flanks pinned to the slope
          // so a track contouring a hillside banks instead of cutting a
          // horizontal sliver through it.
          const [ts, te] = taperFor(r.id);
          const geo = buildRoadRibbon(r.points, FARM_TRACK_WIDTH, FARM_TRACK_Y_LIFT, ts, te, getTerrainHeight);
          if (!geo) continue;
          const bucket = byFarmTrackVariant.get(variant);
          if (bucket) bucket.push(geo); else byFarmTrackVariant.set(variant, [geo]);
        } else {
          // Land roads sample terrain at the lateral offset of each ribbon
          // edge. On a slope the uphill edge rides up the hillside and the
          // downhill edge drops with it, so the cross-section banks with
          // the terrain instead of slicing horizontally through the slope.
          const tierKey = r.tier as TierKey;
          const style = ROAD_TIER_STYLE[tierKey];
          const [ts, te] = taperFor(r.id);
          const geo = buildRoadRibbon(r.points, style.width, style.yLift, ts, te, getTerrainHeight);
          if (!geo) continue;
          const k = keyFor(tierKey, variant);
          const bucket = byTierVariant.get(k);
          if (bucket) bucket.push(geo); else byTierVariant.set(k, [geo]);
        }
      }
    }

    const tierVariantMeshes: { tier: TierKey; variant: RoadVariantKey; geo: THREE.BufferGeometry }[] = [];
    for (const [k, geos] of byTierVariant) {
      const [tier, variant] = k.split('|') as [TierKey, RoadVariantKey];
      const merged = mergeGeometries(geos);
      if (merged) tierVariantMeshes.push({ tier, variant, geo: merged });
    }
    const farmTrackMeshes: { variant: RoadVariantKey; geo: THREE.BufferGeometry }[] = [];
    for (const [variant, geos] of byFarmTrackVariant) {
      const merged = mergeGeometries(geos);
      if (merged) farmTrackMeshes.push({ variant, geo: merged });
    }

    const bridgeMeshes: {
      style: BridgeStyleKey;
      deck: THREE.BufferGeometry | null;
      parapet: THREE.BufferGeometry | null;
    }[] = [];
    const bridgePiersByStyle: Record<BridgeStyleKey, [number, number, number][]> = {
      stone: [], timber: [], plank: [],
    };
    (['stone', 'timber', 'plank'] as const).forEach(style => {
      const b = bridgeBuckets[style];
      bridgeMeshes.push({
        style,
        deck: mergeGeometries(b.deck),
        parapet: mergeGeometries(b.parapet),
      });
      bridgePiersByStyle[style] = b.piers;
    });

    return { tierVariantMeshes, farmTrackMeshes, bridgeMeshes, bridgePiersByStyle };
  }, [ports]);

  const materials = useMemo(() => {
    // One material per (tier, variant). Created lazily via a Map so we only
    // allocate what's actually on screen (most runs hit a small subset).
    const m = new Map<string, THREE.MeshStandardMaterial>();
    const tiers: Array<'path' | 'road' | 'avenue'> = ['path', 'road', 'avenue'];
    const variants = Object.keys(ROAD_VARIANT_STYLE) as RoadVariantKey[];
    for (const t of tiers) {
      for (const v of variants) {
        const s = ROAD_VARIANT_STYLE[v][t];
        m.set(`${t}|${v}`, rememberDryRoadMaterial(addRoadSurfaceGrain(new THREE.MeshStandardMaterial({
          color: s.color, roughness: s.roughness, metalness: 0,
          transparent: t !== 'avenue',
          opacity: t === 'path' ? 0.88 : t === 'road' ? 0.94 : 1,
          depthWrite: t === 'avenue',
          polygonOffset: true,
          polygonOffsetFactor: ROAD_TIER_STYLE[t].polygonOffsetFactor,
          polygonOffsetUnits: ROAD_POLYGON_OFFSET_UNITS,
        }), t === 'avenue' ? 0.075 : 0.11, t === 'avenue' ? 0.82 : 1.0)));
      }
    }
    return m;
  }, []);

  const farmTrackMaterials = useMemo(() => {
    // Derive farm-track tone from the variant's path color, shifted darker
    // and with some alpha so the track reads as a worn trail blending into
    // the surrounding earth.
    const m = new Map<RoadVariantKey, THREE.MeshStandardMaterial>();
    const variants = Object.keys(ROAD_VARIANT_STYLE) as RoadVariantKey[];
    for (const v of variants) {
      const base = new THREE.Color(ROAD_VARIANT_STYLE[v].path.color);
      base.multiplyScalar(0.78); // slightly darker than the built path
      m.set(v, rememberDryRoadMaterial(addRoadSurfaceGrain(new THREE.MeshStandardMaterial({
        color: base, roughness: 1.0, metalness: 0,
        transparent: true, opacity: FARM_TRACK_OPACITY, depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: ROAD_TIER_STYLE.path.polygonOffsetFactor,
        polygonOffsetUnits: ROAD_POLYGON_OFFSET_UNITS,
      }), 0.14, 1.15)));
    }
    return m;
  }, []);

  const bridgeMaterials = useMemo(() => {
    const m: Record<BridgeStyleKey, { deck: THREE.MeshStandardMaterial; parapet: THREE.MeshStandardMaterial; pier: THREE.MeshStandardMaterial }> = {} as never;
    (['stone', 'timber', 'plank'] as const).forEach(k => {
      const s = BRIDGE_STYLE[k];
      m[k] = {
        deck: rememberDryRoadMaterial(addRoadSurfaceGrain(new THREE.MeshStandardMaterial({
          color: s.deckColor, roughness: s.deckRoughness, metalness: 0,
          polygonOffset: true,
          polygonOffsetFactor: ROAD_TIER_STYLE.bridge.polygonOffsetFactor,
          polygonOffsetUnits: ROAD_POLYGON_OFFSET_UNITS,
        }), 0.07, 0.72)),
        parapet: new THREE.MeshStandardMaterial({
          color: s.parapet?.color ?? s.deckColor, roughness: 0.95, metalness: 0,
        }),
        pier: new THREE.MeshStandardMaterial({
          color: s.pier.color, roughness: 0.95, metalness: 0,
        }),
      };
    });
    return m;
  }, []);

  const pierGeoms = useMemo(() => {
    const g: Record<BridgeStyleKey, THREE.CylinderGeometry> = {} as never;
    (['stone', 'timber', 'plank'] as const).forEach(k => {
      const p = BRIDGE_STYLE[k].pier;
      g[k] = new THREE.CylinderGeometry(p.radiusTop, p.radiusBot, p.height, p.segments);
    });
    return g;
  }, []);

  useFrame(() => {
    const state = useGameStore.getState();
    const wetness = getEffectiveRainIntensity(state.weather, state.renderDebug.rain);
    const roadWetness = Math.min(1, wetness * 0.9);
    materials.forEach((mat) => applyRoadWetness(mat, roadWetness));
    farmTrackMaterials.forEach((mat) => applyRoadWetness(mat, Math.min(1, wetness * 1.1)));
    (['stone', 'timber', 'plank'] as const).forEach((style) => {
      applyRoadWetness(bridgeMaterials[style].deck, roadWetness * 0.65);
    });
  });

  return (
    <group>
      {tierVariantMeshes.map(({ tier, variant, geo }) => (
        <mesh
          key={`${tier}|${variant}`}
          geometry={geo}
          material={materials.get(`${tier}|${variant}`)!}
          renderOrder={ROAD_TIER_STYLE[tier].renderOrder}
          receiveShadow
        />
      ))}
      {farmTrackMeshes.map(({ variant, geo }) => (
        <mesh
          key={`farm-track|${variant}`}
          geometry={geo}
          material={farmTrackMaterials.get(variant)!}
          renderOrder={0}
          receiveShadow
        />
      ))}
      {bridgeMeshes.map(({ style, deck, parapet }) => (
        <group key={style}>
          {deck && (
            <mesh
              geometry={deck}
              material={bridgeMaterials[style].deck}
              renderOrder={ROAD_TIER_STYLE.bridge.renderOrder}
              receiveShadow
              castShadow
            />
          )}
          {parapet && <mesh geometry={parapet} material={bridgeMaterials[style].parapet} receiveShadow castShadow />}
        </group>
      ))}
      {(['stone', 'timber', 'plank'] as const).map(style => {
        const piers = bridgePiersByStyle[style];
        if (piers.length === 0) return null;
        return (
          <BridgePiers
            key={style}
            geom={pierGeoms[style]}
            material={bridgeMaterials[style].pier}
            positions={piers}
            height={BRIDGE_STYLE[style].pier.height}
          />
        );
      })}
    </group>
  );
}

function BridgePiers({
  geom, material, positions, height,
}: {
  geom: THREE.CylinderGeometry;
  material: THREE.MeshStandardMaterial;
  positions: [number, number, number][];
  height: number;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    if (!ref.current) return;
    const dummy = new THREE.Object3D();
    // Top of pier sits ~0.2 below deck so it tucks under cleanly.
    const centerOffset = 0.2 + height / 2;
    positions.forEach((p, i) => {
      dummy.position.set(p[0], p[1] - centerOffset, p[2]);
      dummy.updateMatrix();
      ref.current!.setMatrixAt(i, dummy.matrix);
    });
    ref.current.instanceMatrix.needsUpdate = true;
  }, [positions, height]);
  // Piers don't cast shadows: dense rows of thin vertical cylinders (timber
  // bridges use pierStep=1) project a noisy picket-fence of shadow blades
  // onto the transparent water, and since the water surface already sits
  // below them the cast shadows read as visual litter rather than depth cue.
  // The deck + parapet still cast the bridge's main shadow.
  return (
    <instancedMesh ref={ref} args={[geom, material, positions.length]} receiveShadow />
  );
}
