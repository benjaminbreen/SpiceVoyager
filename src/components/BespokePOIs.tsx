// ── Bespoke POI dispatcher ─────────────────────────────────────────────────
//
// Phase 3 high-quality POIs that override the generic POISilhouettes
// renderer with bespoke geometry, atmosphere, and animation. Each entry
// in BESPOKE_POI_RENDERERS resolves a POI id to a renderer component and
// signals POISilhouettes to skip that id (so we don't double-render).
//
// As more bespoke POIs ship, append their renderers here. When a POI is
// removed, drop both the renderer entry and the BESPOKE_POI_IDS line.

import { useMemo } from 'react';
import { useGameStore } from '../store/gameStore';
import { getPOIsForPort, type POIDefinition } from '../utils/poiDefinitions';
import { getTerrainHeight } from '../utils/terrain';
import { resolveSnappedPOI } from '../utils/proximityResolution';
import { SEA_LEVEL } from '../constants/world';
import { SocotraGrove } from './poi/SocotraGrove';
import { HormuzPearlBazaar } from './poi/HormuzPearlBazaar';
import { NagasakiPress } from './poi/NagasakiPress';
import { BantamKrakatoa } from './poi/BantamKrakatoa';
import { VeniceSpezieria } from './poi/VeniceSpezieria';
import { LisbonCasaDaIndia } from './poi/LisbonCasaDaIndia';
import { SevilleCasaContratacion } from './poi/SevilleCasaContratacion';
import { ManilaParian } from './poi/ManilaParian';

type PortsProp = ReturnType<typeof useGameStore.getState>['ports'];
const POI_RENDER_RADIUS_SQ = 340 * 340;

interface BespokeRenderer {
  Component: React.ComponentType<{
    poiId: string;
    position: readonly [number, number, number];
    rotationY: number;
  }>;
  /** Per-POI rotation override hash — keeps grove orientation deterministic. */
  rotationSeed: number;
}

// Registry — id → renderer. POISilhouettes consults BESPOKE_POI_IDS to
// avoid double-rendering.
const BESPOKE_POI_RENDERERS: Record<string, BespokeRenderer> = {
  'socotra-dragons-blood-grove': {
    Component: SocotraGrove,
    rotationSeed: 0xd4a6, // hashes to ~37° rotation, decided once
  },
  'hormuz-pearl-divers-bazaar': {
    Component: HormuzPearlBazaar,
    // Rotation seed chosen so the jetty heads roughly toward the open
    // water side of Hormuz (openDirection 'N', so jetty +Z should point
    // toward -Z world after rotation — an authored rotationY of ~PI).
    // We use a fixed-offset hash so the orientation is deterministic
    // and predictable for placement tuning.
    rotationSeed: 0x8a13,
  },
  'nagasaki-jesuit-press': {
    Component: NagasakiPress,
    // Compound's local +Z heads "uphill" away from the harbor; with
    // Nagasaki openDirection 'W' the harbor is to local -X world. So the
    // gate (at local -Z) should face roughly +X world. Tune via the seed
    // if it ends up backwards in playtest.
    rotationSeed: 0x4c91,
  },
  'bantam-krakatoa': {
    Component: BantamKrakatoa,
    // Rotation just spins the satellite peaks around the central cone — any
    // value is fine, this seed is chosen for an asymmetric three-peak read.
    rotationSeed: 0x9f23,
  },
  'venice-theriac-spezieria': {
    Component: VeniceSpezieria,
    // The compound's local -Z faces the canal. Venice openDirection 'E' →
    // the lagoon water is to world +X. We want the canal-facing front of
    // the compound to point roughly toward the city's water — but since
    // the spezieria sits inland near Rialto, any rotation reads OK as long
    // as the canal alignment looks intentional. Seed chosen empirically.
    rotationSeed: 0x7e21,
  },
  'lisbon-casa-da-india': {
    Component: LisbonCasaDaIndia,
    // The Lisbon component ignores this seed and auto-orients toward the
    // water by sampling terrain around the snapped anchor — the original
    // hash-derived rotation pointed the quay inland and sank the warehouse
    // below the river. Seed kept for registry shape consistency.
    rotationSeed: 0x6c10,
  },
  'seville-casa-contratacion': {
    Component: SevilleCasaContratacion,
    // Local -Z is the formal river-facing entrance. This seed faces the broad
    // compound toward Seville's Guadalquivir edge without needing bespoke
    // water geometry.
    rotationSeed: 0x51c0,
  },
  'manila-sangley-parian': {
    Component: ManilaParian,
    // Gate faces the approach road outside Intramuros rather than drawing any
    // local bay or river geometry.
    rotationSeed: 0x6a11,
  },
};

export const BESPOKE_POI_IDS: ReadonlySet<string> = new Set(Object.keys(BESPOKE_POI_RENDERERS));

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function BespokePOIs({ ports }: { ports: PortsProp }) {
  const visible = useGameStore((state) => state.renderDebug.poiVisibility);
  const devSoloPort = useGameStore((state) => state.devSoloPort);
  const currentWorldPortId = useGameStore((state) => state.currentWorldPortId);
  const playerPos = useGameStore((state) => state.playerMode === 'walking' ? state.walkingPos : state.playerPos);

  const items = useMemo(() => {
    if (!visible) return [] as Array<{ poi: POIDefinition; position: [number, number, number]; rotationY: number; renderer: BespokeRenderer }>;
    const visiblePorts = devSoloPort
      ? ports.filter((p) => p.id === devSoloPort)
      : ports.filter((p) => {
        if (p.id === currentWorldPortId) return true;
        const dx = p.position[0] - playerPos[0];
        const dz = p.position[2] - playerPos[2];
        return dx * dx + dz * dz <= POI_RENDER_RADIUS_SQ;
      });
    const out: Array<{ poi: POIDefinition; position: [number, number, number]; rotationY: number; renderer: BespokeRenderer }> = [];
    for (const port of visiblePorts) {
      for (const poi of getPOIsForPort(port)) {
        const renderer = BESPOKE_POI_RENDERERS[poi.id];
        if (!renderer) continue;
        const placed = resolveSnappedPOI(poi, port);
        if (!placed) {
          console.warn(`[BespokePOI] ${poi.id} skipped — no valid placement on port ${port.id}`);
          continue;
        }
        const baseY = poi.kind === 'wreck'
          ? SEA_LEVEL - 0.05
          // Natural offshore features (volcanoes, etc.) sit at sea level and
          // bring their own island/peak geometry — terrainHeight in deep water
          // would sink the cone below the surface.
          : poi.kind === 'natural'
            ? SEA_LEVEL
            : getTerrainHeight(placed.x, placed.z);
        const rotationY = ((hashStr(poi.id) ^ renderer.rotationSeed) >>> 0) / 0xffffffff * Math.PI * 2;
        out.push({
          poi,
          position: [placed.x, baseY, placed.z],
          rotationY,
          renderer,
        });
      }
    }
    return out;
  }, [currentWorldPortId, devSoloPort, playerPos, ports, visible]);

  if (!visible || items.length === 0) return null;

  return (
    <group>
      {items.map(({ poi, position, rotationY, renderer }) => {
        const Component = renderer.Component;
        return (
          <Component
            key={poi.id}
            poiId={poi.id}
            position={position}
            rotationY={rotationY}
          />
        );
      })}
    </group>
  );
}
