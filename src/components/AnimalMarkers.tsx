import { useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { getActivePlayerPos } from '../utils/livePlayerTransform';
import { useGameStore } from '../store/gameStore';
import { SEA_LEVEL } from '../constants/world';
import type { GrazerEntry, GrazerKind, SpeciesInfo } from './Grazers';
import type { PrimateEntry } from './Primates';
import type { ReptileEntry } from './Reptiles';
import type { WadingBirdEntry } from './WadingBirds';

// Cluster nearby animals into a single marker so a herd doesn't paint a wall of icons.
const CLUSTER_RADIUS = 18;
const CLUSTER_SQ = CLUSTER_RADIUS * CLUSTER_RADIUS;

// Fade curve: marker fully invisible when the player is standing in the herd,
// eases in between FADE_NEAR and FADE_FAR, and fades back out past MAX_DIST so
// the whole map doesn't clutter up.
const FADE_NEAR = 28;
const FADE_FAR = 48;
const MAX_DIST = 220;
const MAX_FADE_BAND = 40;

const GRAZER_EMOJI: Record<GrazerKind, string> = {
  antelope: '🦌',
  deer: '🦌',
  goat: '🐐',
  camel: '🐫',
  sheep: '🐑',
  bovine: '🐃',
  pig: '🐗',
  capybara: '🦫',
};

// Pick a marker emoji from a FishType id. Sharks and turtles share the fish pool
// but deserve their own silhouette; everything else defaults to the generic fish.
function fishEmojiForId(id: string): string {
  if (id.includes('shark')) return '🦈';
  if (id.includes('turtle')) return '🐢';
  return '🐟';
}

interface Cluster {
  x: number;
  y: number;
  z: number;
  count: number;
  emoji: string;
  species?: SpeciesInfo;
}

type Pt = { x: number; y: number; z: number };

function clusterPoints(points: Pt[], emoji: string, species?: SpeciesInfo): Cluster[] {
  const out: Cluster[] = [];
  const used = new Array(points.length).fill(false);
  for (let i = 0; i < points.length; i++) {
    if (used[i]) continue;
    let cx = points[i].x;
    let cy = points[i].y;
    let cz = points[i].z;
    let count = 1;
    used[i] = true;
    for (let j = i + 1; j < points.length; j++) {
      if (used[j]) continue;
      const dx = points[j].x - points[i].x;
      const dz = points[j].z - points[i].z;
      if (dx * dx + dz * dz < CLUSTER_SQ) {
        used[j] = true;
        cx += points[j].x;
        cy += points[j].y;
        cz += points[j].z;
        count++;
      }
    }
    out.push({ x: cx / count, y: cy / count, z: cz / count, count, emoji, species });
  }
  return out;
}

export function AnimalMarkers({
  grazerData,
  grazerKind,
  grazerSpecies,
  primateData,
  primateSpecies,
  reptileData,
  reptileSpecies,
  wadingBirdData,
  wadingSpecies,
}: {
  grazerData: GrazerEntry[];
  grazerKind?: GrazerKind;
  grazerSpecies?: SpeciesInfo;
  primateData: PrimateEntry[];
  primateSpecies?: SpeciesInfo;
  reptileData: ReptileEntry[];
  reptileSpecies?: SpeciesInfo;
  wadingBirdData: WadingBirdEntry[];
  wadingSpecies?: SpeciesInfo;
}) {
  const fishShoals = useGameStore(s => s.fishShoals);
  const oceanEncounters = useGameStore(s => s.oceanEncounters);
  const markersEnabled = useGameStore(s => s.renderDebug.animalMarkers);

  const clusters = useMemo<Cluster[]>(() => {
    const out: Cluster[] = [];
    if (grazerData.length > 0) {
      const pts = grazerData.map(g => ({ x: g.position[0], y: g.position[1], z: g.position[2] }));
      out.push(...clusterPoints(pts, GRAZER_EMOJI[grazerKind ?? 'antelope'], grazerSpecies));
    }
    if (primateData.length > 0) {
      const pts = primateData.map(p => ({ x: p.position[0], y: p.position[1], z: p.position[2] }));
      out.push(...clusterPoints(pts, '🐒', primateSpecies));
    }
    if (reptileData.length > 0) {
      const pts = reptileData.map(r => ({ x: r.position[0], y: r.position[1], z: r.position[2] }));
      out.push(...clusterPoints(pts, '🐊', reptileSpecies));
    }
    if (wadingBirdData.length > 0) {
      const pts = wadingBirdData.map(b => ({ x: b.position[0], y: b.position[1], z: b.position[2] }));
      out.push(...clusterPoints(pts, '🦩', wadingSpecies));
    }
    // Fish shoals: one marker per shoal — shoals are already a clustering unit so
    // we don't run the pairwise pass (would merge unrelated species nearby).
    for (const shoal of fishShoals) {
      if (shoal.count <= 0) continue;
      const ft = shoal.fishType;
      out.push({
        x: shoal.center[0],
        y: SEA_LEVEL,
        z: shoal.center[2],
        count: shoal.count,
        emoji: fishEmojiForId(ft.id),
        species: { name: ft.name, latin: ft.latin, info: ft.description },
      });
    }
    // Ocean encounters: whales and sea turtles. Wreckage is skipped (not wildlife).
    for (const enc of oceanEncounters) {
      if (enc.collected) continue;
      if (enc.type === 'whale') {
        out.push({ x: enc.position[0], y: SEA_LEVEL, z: enc.position[2], count: 1, emoji: '🐋' });
      } else if (enc.type === 'turtle') {
        out.push({ x: enc.position[0], y: SEA_LEVEL, z: enc.position[2], count: 1, emoji: '🐢' });
      }
    }
    return out;
  }, [grazerData, grazerKind, grazerSpecies, primateData, primateSpecies, reptileData, reptileSpecies, wadingBirdData, wadingSpecies, fishShoals, oceanEncounters]);

  const [opacities, setOpacities] = useState<Float32Array>(() => new Float32Array(0));
  const counterRef = useRef(0);

  useFrame((_, dt) => {
    counterRef.current += dt;
    if (counterRef.current < 0.18) return;
    counterRef.current = 0;
    const p = getActivePlayerPos();
    const next = new Float32Array(clusters.length);
    for (let i = 0; i < clusters.length; i++) {
      const c = clusters[i];
      const dx = c.x - p[0];
      const dz = c.z - p[2];
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < FADE_NEAR || dist > MAX_DIST) {
        next[i] = 0;
        continue;
      }
      const nearRamp = dist >= FADE_FAR ? 1 : (dist - FADE_NEAR) / (FADE_FAR - FADE_NEAR);
      const farRamp = dist > MAX_DIST - MAX_FADE_BAND
        ? (MAX_DIST - dist) / MAX_FADE_BAND
        : 1;
      next[i] = Math.max(0, Math.min(1, nearRamp * farRamp));
    }
    setOpacities(next);
  });

  if (!markersEnabled) return null;
  if (clusters.length === 0) return null;

  return (
    <>
      {clusters.map((c, i) => {
        const opacity = opacities[i] ?? 0;
        if (opacity <= 0.01) return null;
        const big = c.count >= 3;
        const size = big ? 32 : 26;
        const fontSize = big ? 17 : 14;
        return (
          <Html
            key={i}
            position={[c.x, c.y + 3.2, c.z]}
            center
            sprite
            zIndexRange={[9, 0]}
            style={{ pointerEvents: 'none', opacity, transition: 'opacity 0.25s ease-out' }}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                userSelect: 'none',
                filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.55))',
              }}
            >
              <div
                style={{
                  width: size,
                  height: size,
                  borderRadius: '50%',
                  background: 'rgba(24, 20, 16, 0.74)',
                  border: '1px solid rgba(245, 230, 200, 0.55)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize,
                  lineHeight: 1,
                  position: 'relative',
                }}
                title={c.species ? `${c.species.name} ×${c.count}` : undefined}
              >
                <span>{c.emoji}</span>
                {big && (
                  <span
                    style={{
                      position: 'absolute',
                      bottom: -4,
                      right: -5,
                      background: 'rgba(245, 230, 200, 0.94)',
                      color: '#1c1810',
                      fontFamily: '"DM Sans", sans-serif',
                      fontWeight: 700,
                      fontSize: 9,
                      padding: '1px 4px',
                      borderRadius: 6,
                      letterSpacing: 0.3,
                      lineHeight: 1,
                    }}
                  >
                    ×{c.count}
                  </span>
                )}
              </div>
              <div
                style={{
                  width: 0,
                  height: 0,
                  borderLeft: '4px solid transparent',
                  borderRight: '4px solid transparent',
                  borderTop: '6px solid rgba(245, 230, 200, 0.55)',
                  marginTop: -1,
                }}
              />
            </div>
          </Html>
        );
      })}
    </>
  );
}
