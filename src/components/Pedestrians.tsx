/**
 * Pedestrians.tsx — Instanced archetype-based NPC renderer
 *
 * Each pedestrian assembles up to six instanced meshes:
 *   - body archetype  (clothing silhouette, clothing color)
 *   - head            (per figure type, skin-tone color)
 *   - headwear        (optional, culturally appropriate)
 *   - two arms        (animated shoulder rotation, swing synced to walk phase)
 *   - prop            (optional — bundle, basket, rope, jar — by profession)
 *
 * Arms and props are separate meshes so the arm can swing independently
 * and so a sailor's rope or a farmer's basket reads at a glance.
 * Dwelling NPCs (paused at endpoints) drop their arm swing amplitude to zero.
 */

import { useRef, useMemo, useEffect } from 'react';
import { useFrame, ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore, Culture, CulturalRegion, PORT_CULTURAL_REGION, PORT_FACTION } from '../store/gameStore';
import {
  PedestrianSystemState, FigureType,
  initPedestrianSystem, updatePedestrians,
} from '../utils/pedestrianSystem';
import { syncLivePedestrians, clearLivePedestrians, consumePendingKills } from '../utils/livePedestrians';
import { applyRimLight, updateRimFromFog } from '../utils/rimLight';
import { getActivePlayerPos } from '../utils/livePlayerTransform';
import {
  BodyArchetype, HeadwearType, ArmType, PropType, VisualProfile,
  TrimArchetype,
  BODY_ARCHETYPES, HEADWEAR_TYPES, ARM_TYPES, PROP_TYPES, HEAD_TOP_Y,
  TRIM_ARCHETYPES, ARCHETYPE_SHOULDER,
  createBodyGeometry, createHeadGeometry, createHeadwearGeometry,
  createArmGeometry, createPropGeometry, createTrimGeometry,
  isTrimArchetype,
  CLOTHING_BY_ARCHETYPE, HEADWEAR_COLORS, PROP_COLORS,
  assignVisualProfile,
} from '../utils/pedestrianArchetypes';

// ── Seeded PRNG ─────────────────────────────────────────────────────────────
function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickWeighted<T extends { weight: number }>(arr: T[], rng: () => number): T {
  let total = 0;
  for (const e of arr) total += e.weight;
  let r = rng() * total;
  for (const e of arr) {
    r -= e.weight;
    if (r <= 0) return e;
  }
  return arr[arr.length - 1];
}

// Reusable scratch colors for HSL conversions during init.
const _varyColor = new THREE.Color();
const _varyHSL = { h: 0, s: 0, l: 0 };

// HSL-space jitter — channel-wise RGB noise just desaturates everything, but
// hue/sat/value shifts read as real dye variation, fading, and lighting differences.
// `huePull` warms (positive) or cools (negative) the result by a small amount,
// useful for clothing where a tiny shared bias makes a crowd feel weather-aged.
function varyHSL(
  base: [number, number, number],
  rng: () => number,
  hueAmt = 0.025,
  satAmt = 0.10,
  lightAmt = 0.12,
  huePull = 0,
): [number, number, number] {
  _varyColor.setRGB(base[0], base[1], base[2]);
  _varyColor.getHSL(_varyHSL);
  let h = _varyHSL.h + (rng() - 0.5) * hueAmt + huePull;
  // Wrap hue
  h = h - Math.floor(h);
  const s = Math.max(0, Math.min(1, _varyHSL.s + (rng() - 0.5) * satAmt));
  const l = Math.max(0, Math.min(1, _varyHSL.l + (rng() - 0.5) * lightAmt));
  _varyColor.setHSL(h, s, l);
  return [_varyColor.r, _varyColor.g, _varyColor.b];
}

// Skin variation — keep hue tight so the culture's palette stays coherent,
// but allow meaningful value shift so a crowd has light/dark range within a tone.
function varySkin(
  base: [number, number, number],
  rng: () => number,
): [number, number, number] {
  return varyHSL(base, rng, 0.008, 0.06, 0.08);
}

type SkinSwatch = { color: [number, number, number]; weight: number };

// Broad-bucket palettes — used as a fallback when no finer CulturalRegion is
// known for the port (e.g. Atlantic ports, generic European ports).
const SKIN_TONES: Record<Culture, SkinSwatch[]> = {
  'European': [
    { color: [0.82, 0.68, 0.54], weight: 2 },
    { color: [0.72, 0.56, 0.42], weight: 3 },
    { color: [0.58, 0.44, 0.32], weight: 3 },
    { color: [0.45, 0.34, 0.25], weight: 2 },
  ],
  'Indian Ocean': [
    { color: [0.65, 0.50, 0.36], weight: 3 },
    { color: [0.55, 0.42, 0.30], weight: 3 },
    { color: [0.45, 0.35, 0.26], weight: 2 },
    { color: [0.72, 0.56, 0.40], weight: 1 },
    { color: [0.38, 0.28, 0.20], weight: 1 },
  ],
  'West African': [
    { color: [0.42, 0.30, 0.20], weight: 4 },
    { color: [0.35, 0.25, 0.17], weight: 3 },
    { color: [0.50, 0.36, 0.24], weight: 2 },
    { color: [0.78, 0.64, 0.50], weight: 1 },
  ],
  'Atlantic': [
    { color: [0.45, 0.32, 0.22], weight: 3 },
    { color: [0.38, 0.27, 0.18], weight: 2 },
    { color: [0.62, 0.44, 0.28], weight: 2 },
    { color: [0.72, 0.56, 0.42], weight: 2 },
    { color: [0.80, 0.66, 0.52], weight: 1 },
  ],
};

// Finer-grained palettes keyed on CulturalRegion (+ a 'European' bucket for the
// colonial garrison/factor minority found in many Indian Ocean ports). These
// approximate dominant skin-tone distributions for each regional culture, so
// Mombasa reads as Swahili-coast rather than generic-Indian-Ocean.
type SkinRegion = CulturalRegion | 'European';

const SKIN_TONES_BY_REGION: Record<SkinRegion, SkinSwatch[]> = {
  // Swahili coast — Bantu/Swahili majority, dark-dominant with a lighter
  // Arab/Persian-mixed coastal minority.
  'Swahili': [
    { color: [0.38, 0.27, 0.18], weight: 4 },
    { color: [0.32, 0.22, 0.15], weight: 3 },
    { color: [0.46, 0.33, 0.22], weight: 3 },
    { color: [0.55, 0.40, 0.27], weight: 1 },
  ],
  // Arab/Omani/Persian — medium tan to olive, narrow range.
  'Arab': [
    { color: [0.68, 0.52, 0.36], weight: 3 },
    { color: [0.58, 0.43, 0.30], weight: 3 },
    { color: [0.50, 0.37, 0.26], weight: 2 },
    { color: [0.74, 0.58, 0.42], weight: 1 },
  ],
  // Gujarati — medium brown, modest range.
  'Gujarati': [
    { color: [0.60, 0.45, 0.30], weight: 3 },
    { color: [0.52, 0.38, 0.25], weight: 3 },
    { color: [0.45, 0.33, 0.22], weight: 2 },
    { color: [0.68, 0.52, 0.36], weight: 1 },
  ],
  // Malabari (Kerala/Konkan) — slightly darker than Gujarati on average.
  'Malabari': [
    { color: [0.50, 0.36, 0.24], weight: 4 },
    { color: [0.42, 0.30, 0.20], weight: 3 },
    { color: [0.58, 0.42, 0.28], weight: 2 },
    { color: [0.36, 0.26, 0.17], weight: 1 },
  ],
  // Malay / insular SE Asia — medium tan, warm.
  'Malay': [
    { color: [0.62, 0.48, 0.34], weight: 3 },
    { color: [0.55, 0.42, 0.30], weight: 3 },
    { color: [0.48, 0.36, 0.25], weight: 2 },
    { color: [0.70, 0.55, 0.40], weight: 1 },
  ],
  // Chinese — light warm tan.
  'Chinese': [
    { color: [0.78, 0.64, 0.50], weight: 3 },
    { color: [0.72, 0.58, 0.44], weight: 3 },
    { color: [0.66, 0.52, 0.38], weight: 2 },
    { color: [0.82, 0.68, 0.54], weight: 1 },
  ],
  // European garrison/factor — same as broad European palette.
  'European': [
    { color: [0.82, 0.68, 0.54], weight: 2 },
    { color: [0.72, 0.56, 0.42], weight: 3 },
    { color: [0.58, 0.44, 0.32], weight: 3 },
    { color: [0.45, 0.34, 0.25], weight: 2 },
  ],
};

// Per-port weighted mix of regional skin pools. Reflects rough population
// composition of each port c. 1612, mirroring PORT_TAVERN_NATIONALITIES but
// collapsed to skin-tone-relevant buckets. Ports not listed fall back to
// PORT_CULTURAL_REGION (single region) or the broad Culture palette.
const PORT_SKIN_MIX: Record<string, Array<{ region: SkinRegion; weight: number }>> = {
  // Swahili coast — Bantu/Swahili majority, Omani-Arab minority, smaller
  // Gujarati merchant + Portuguese garrison presence.
  mombasa:  [{ region: 'Swahili', weight: 14 }, { region: 'Arab', weight: 3 }, { region: 'Gujarati', weight: 2 }, { region: 'European', weight: 1 }],
  zanzibar: [{ region: 'Swahili', weight: 13 }, { region: 'Arab', weight: 4 }, { region: 'Gujarati', weight: 2 }, { region: 'European', weight: 1 }],
  kilwa:    [{ region: 'Swahili', weight: 16 }, { region: 'Arab', weight: 3 }, { region: 'European', weight: 1 }],
  mogadishu:[{ region: 'Swahili', weight: 14 }, { region: 'Arab', weight: 5 }, { region: 'Gujarati', weight: 1 }],
  // Red Sea / Arabia — Arab/Omani majority, Swahili + Gujarati minorities.
  aden:     [{ region: 'Arab', weight: 14 }, { region: 'Gujarati', weight: 3 }, { region: 'Swahili', weight: 2 }, { region: 'European', weight: 1 }],
  mocha:    [{ region: 'Arab', weight: 14 }, { region: 'Gujarati', weight: 3 }, { region: 'Swahili', weight: 2 }, { region: 'European', weight: 1 }],
  muscat:   [{ region: 'Arab', weight: 14 }, { region: 'Gujarati', weight: 3 }, { region: 'Swahili', weight: 2 }, { region: 'European', weight: 1 }],
  hormuz:   [{ region: 'Arab', weight: 12 }, { region: 'Gujarati', weight: 4 }, { region: 'European', weight: 4 }],
  socotra:  [{ region: 'Arab', weight: 14 }, { region: 'Swahili', weight: 4 }, { region: 'European', weight: 2 }],
  // Gujarati ports — Gujarati majority + Mughal/Persian (read as Arab in this
  // skin-tone taxonomy) and a Portuguese/Dutch/English factor minority.
  surat:    [{ region: 'Gujarati', weight: 14 }, { region: 'Arab', weight: 3 }, { region: 'European', weight: 3 }],
  diu:      [{ region: 'Gujarati', weight: 13 }, { region: 'European', weight: 5 }, { region: 'Arab', weight: 2 }],
  // Masulipatnam — Deccani/Telugu majority (use Malabari as nearest darker
  // South Indian palette), Persian + Gujarati merchants, Dutch/English factors.
  masulipatnam: [{ region: 'Malabari', weight: 12 }, { region: 'Arab', weight: 3 }, { region: 'Gujarati', weight: 3 }, { region: 'European', weight: 2 }],
  // Malabar coast — Malabari majority, Portuguese significant in Goa/Cochin.
  calicut:  [{ region: 'Malabari', weight: 14 }, { region: 'Gujarati', weight: 2 }, { region: 'Arab', weight: 2 }, { region: 'European', weight: 2 }],
  cochin:   [{ region: 'Malabari', weight: 12 }, { region: 'European', weight: 5 }, { region: 'Gujarati', weight: 2 }, { region: 'Arab', weight: 1 }],
  goa:      [{ region: 'Malabari', weight: 11 }, { region: 'European', weight: 6 }, { region: 'Gujarati', weight: 2 }, { region: 'Arab', weight: 1 }],
  // Insular SE Asia — Malay majority + Chinese trading communities + small
  // Gujarati and European factor presence.
  malacca:  [{ region: 'Malay', weight: 12 }, { region: 'Chinese', weight: 4 }, { region: 'European', weight: 2 }, { region: 'Gujarati', weight: 2 }],
  bantam:   [{ region: 'Malay', weight: 13 }, { region: 'Chinese', weight: 3 }, { region: 'European', weight: 3 }, { region: 'Gujarati', weight: 1 }],
  aceh:     [{ region: 'Malay', weight: 14 }, { region: 'Gujarati', weight: 3 }, { region: 'Arab', weight: 2 }, { region: 'European', weight: 1 }],
  // Macau — Chinese majority with a Portuguese enclave.
  macau:    [{ region: 'Chinese', weight: 14 }, { region: 'European', weight: 5 }, { region: 'Malay', weight: 1 }],
  // Manila — Sangley Chinese commercial majority + Spanish Intramuros + Malay.
  manila:   [{ region: 'Chinese', weight: 11 }, { region: 'European', weight: 5 }, { region: 'Malay', weight: 4 }],
  // Nagasaki — Japanese majority (use Chinese palette as nearest light-warm
  // East Asian bucket) with a Portuguese commercial enclave.
  nagasaki: [{ region: 'Chinese', weight: 14 }, { region: 'European', weight: 4 }, { region: 'Malay', weight: 2 }],
};

type RegionMixEntry = { region: SkinRegion; weight: number };

// Returns a weighted region distribution for the port. Each pedestrian samples
// a region from this list, then derives skin/clothing-accent/trim-accent from
// the same region so a Swahili-coded ped wears Swahili-coded clothes.
function getPortRegionMix(portId: string | undefined, culture: Culture): RegionMixEntry[] {
  if (portId) {
    const mix = PORT_SKIN_MIX[portId];
    if (mix) return mix;
    const region = PORT_CULTURAL_REGION[portId];
    if (region) return [{ region, weight: 1 }];
  }
  // Synthesize a region mix from the broad Culture for ports we haven't tagged.
  // 'European' and 'Atlantic' fall back to the broad palette via region='European'
  // (close enough for European garrison towns and Atlantic crews).
  if (culture === 'European' || culture === 'Atlantic') {
    return [{ region: 'European', weight: 1 }];
  }
  // 'Indian Ocean' generic — split across the three biggest regional pools.
  if (culture === 'Indian Ocean') {
    return [{ region: 'Gujarati', weight: 2 }, { region: 'Arab', weight: 1 }, { region: 'Malabari', weight: 1 }];
  }
  // 'West African' — use Swahili palette as the closest dark-dominant region;
  // West African ports proper would warrant their own region tag if we add one.
  return [{ region: 'Swahili', weight: 1 }];
}

// Per-region clothing-color accent pools — period-typical dyes for each
// cultural region. Used at sample time to bias each ped's clothing pick
// toward colors the region was actually wearing in 1612, on top of the
// archetype's base palette in pedestrianArchetypes.ts.
const CLOTHING_ACCENTS_BY_REGION: Record<SkinRegion, SkinSwatch[]> = {
  // Swahili coast — kanga predecessors, indigo cottons from Gujarat, ochre.
  'Swahili': [
    { color: [0.15, 0.22, 0.45], weight: 3 },  // indigo
    { color: [0.85, 0.62, 0.15], weight: 3 },  // turmeric/ochre
    { color: [0.62, 0.22, 0.18], weight: 2 },  // madder
    { color: [0.92, 0.88, 0.78], weight: 2 },  // off-white
    { color: [0.24, 0.55, 0.40], weight: 1 },  // deep green
    { color: [0.78, 0.40, 0.18], weight: 1 },  // brick orange
  ],
  // Arab/Omani/Persian — heavy whites + indigo + black, deep reds for elites.
  'Arab': [
    { color: [0.92, 0.88, 0.78], weight: 4 },  // white cotton thawb
    { color: [0.18, 0.15, 0.12], weight: 2 },  // black bisht
    { color: [0.15, 0.22, 0.45], weight: 2 },  // indigo
    { color: [0.62, 0.18, 0.20], weight: 1 },  // crimson elite
    { color: [0.55, 0.42, 0.28], weight: 1 },  // earth tan
    { color: [0.30, 0.22, 0.18], weight: 1 },  // dark brown
  ],
  // Gujarati — bandhani/leheriya bright reds and yellows, indigo workwear.
  'Gujarati': [
    { color: [0.78, 0.18, 0.20], weight: 3 },  // bandhani red
    { color: [0.85, 0.62, 0.12], weight: 3 },  // turmeric
    { color: [0.14, 0.20, 0.48], weight: 3 },  // indigo
    { color: [0.62, 0.18, 0.35], weight: 2 },  // lac pink
    { color: [0.80, 0.40, 0.10], weight: 2 },  // marigold
    { color: [0.55, 0.20, 0.50], weight: 1 },  // royal purple
    { color: [0.92, 0.86, 0.74], weight: 1 },  // off-white
  ],
  // Malabari (Kerala/Konkan) — saffron, white, deep maroon, palm-green.
  'Malabari': [
    { color: [0.88, 0.58, 0.14], weight: 3 },  // saffron
    { color: [0.92, 0.86, 0.74], weight: 3 },  // off-white mundu
    { color: [0.55, 0.18, 0.18], weight: 2 },  // maroon
    { color: [0.24, 0.55, 0.40], weight: 2 },  // green
    { color: [0.14, 0.20, 0.48], weight: 1 },  // indigo
    { color: [0.85, 0.62, 0.12], weight: 1 },  // turmeric
  ],
  // Malay/Insular SE Asia — batik browns/indigos, sirih red, rich purples.
  'Malay': [
    { color: [0.55, 0.32, 0.18], weight: 3 },  // soga batik brown
    { color: [0.18, 0.22, 0.40], weight: 3 },  // batik indigo
    { color: [0.62, 0.22, 0.18], weight: 2 },  // sirih red
    { color: [0.85, 0.62, 0.15], weight: 2 },  // turmeric
    { color: [0.45, 0.20, 0.45], weight: 1 },  // purple
    { color: [0.30, 0.22, 0.18], weight: 1 },  // dark brown
    { color: [0.88, 0.82, 0.70], weight: 1 },  // undyed cotton
  ],
  // Chinese — blue-black common workwear, red for festive, browns for everyday.
  'Chinese': [
    { color: [0.18, 0.15, 0.18], weight: 4 },  // blue-black
    { color: [0.20, 0.28, 0.42], weight: 3 },  // dark blue
    { color: [0.72, 0.20, 0.18], weight: 2 },  // red
    { color: [0.45, 0.35, 0.25], weight: 2 },  // brown
    { color: [0.88, 0.82, 0.70], weight: 1 },  // undyed
    { color: [0.30, 0.22, 0.18], weight: 1 },  // dark brown
  ],
  // European — handled by base archetype palette (CLOTHING_BY_ARCHETYPE
  // already has the right earth/dark tones for euro-man/euro-woman). This
  // pool is used for non-euro archetypes worn by European-region peds, which
  // is rare; provide a neutral merchant-class palette as fallback.
  'European': [
    { color: [0.20, 0.18, 0.15], weight: 3 },  // black
    { color: [0.42, 0.36, 0.28], weight: 2 },  // brown wool
    { color: [0.52, 0.18, 0.22], weight: 2 },  // crimson
    { color: [0.22, 0.30, 0.48], weight: 2 },  // woad blue
    { color: [0.30, 0.22, 0.32], weight: 1 },  // logwood
  ],
};

// Per-region trim/sash colors — saturated accent that contrasts against the
// main clothing color. Sashes and pallu borders were typically richer than
// the base garment.
const TRIM_ACCENTS_BY_REGION: Record<SkinRegion, SkinSwatch[]> = {
  'Swahili': [
    { color: [0.85, 0.20, 0.18], weight: 3 },  // bold red
    { color: [0.12, 0.18, 0.55], weight: 3 },  // deep indigo
    { color: [0.92, 0.70, 0.15], weight: 2 },  // gold
    { color: [0.20, 0.55, 0.40], weight: 1 },
  ],
  'Arab': [
    { color: [0.85, 0.18, 0.20], weight: 3 },  // crimson sash
    { color: [0.92, 0.78, 0.30], weight: 3 },  // gold thread
    { color: [0.12, 0.18, 0.55], weight: 2 },  // indigo
    { color: [0.18, 0.15, 0.12], weight: 1 },  // black
    { color: [0.55, 0.18, 0.40], weight: 1 },  // royal magenta
  ],
  'Gujarati': [
    { color: [0.92, 0.70, 0.12], weight: 3 },  // gold zari
    { color: [0.85, 0.18, 0.20], weight: 3 },  // bandhani red
    { color: [0.12, 0.18, 0.55], weight: 2 },  // indigo
    { color: [0.55, 0.20, 0.50], weight: 2 },  // royal purple
    { color: [0.20, 0.55, 0.40], weight: 1 },  // emerald
  ],
  'Malabari': [
    { color: [0.92, 0.70, 0.12], weight: 3 },  // gold border (kasavu)
    { color: [0.85, 0.18, 0.20], weight: 2 },  // red
    { color: [0.55, 0.18, 0.18], weight: 2 },  // maroon
    { color: [0.20, 0.55, 0.40], weight: 1 },  // green
  ],
  'Malay': [
    { color: [0.92, 0.70, 0.12], weight: 3 },  // gold thread (songket)
    { color: [0.55, 0.18, 0.40], weight: 2 },  // magenta
    { color: [0.85, 0.18, 0.20], weight: 2 },  // red
    { color: [0.12, 0.18, 0.55], weight: 1 },  // indigo
    { color: [0.20, 0.55, 0.40], weight: 1 },  // jade
  ],
  'Chinese': [
    { color: [0.85, 0.18, 0.20], weight: 4 },  // red sash
    { color: [0.92, 0.70, 0.12], weight: 3 },  // gold
    { color: [0.18, 0.15, 0.18], weight: 1 },  // black
  ],
  'European': [
    { color: [0.85, 0.18, 0.20], weight: 2 },
    { color: [0.92, 0.70, 0.12], weight: 1 },
    { color: [0.18, 0.15, 0.12], weight: 2 },
    { color: [0.92, 0.88, 0.78], weight: 1 },
  ],
};

function createLanternGeometry(): THREE.BufferGeometry {
  const lantern = new THREE.SphereGeometry(0.08, 5, 4);
  lantern.translate(0.22, 1.05, 0);
  return lantern;
}

// ── Component ───────────────────────────────────────────────────────────────

const MAX_PER_MESH = 160; // ample headroom; arm meshes take 2 slots per ped
const FIGURE_TYPES: FigureType[] = ['man', 'woman', 'child'];

// ── Click selection (shared across all Pedestrians instances) ──
// Mirrors NPCShip's module-level selectedNpcId pattern: state lives outside
// React so per-frame updates in useFrame don't trigger re-renders.
let selectedPedIdx: number | null = null;

const ROLE_LABEL: Record<string, string> = {
  merchant: 'merchant',
  laborer: 'laborer',
  religious: 'devotee',
  sailor: 'sailor',
  farmer: 'farmer',
};

// Head-turn: peds within this radius rotate their head toward the player.
const HEAD_TURN_RADIUS = 6;
const HEAD_TURN_RADIUS_SQ = HEAD_TURN_RADIUS * HEAD_TURN_RADIUS;
const HEAD_TURN_MAX_YAW = Math.PI / 3; // ±60°, anything more reads as inhuman
// Cluster-facing: dwelling peds within this radius pivot to face their nearest dwelling neighbor.
const CLUSTER_RADIUS = 2.5;
const CLUSTER_RADIUS_SQ = CLUSTER_RADIUS * CLUSTER_RADIUS;

export function Pedestrians() {
  const ports = useGameStore(s => s.ports);
  // timeOfDay changes every 200ms; we only need the current value per frame,
  // not a React re-render on every tick. Read inside useFrame to avoid the
  // re-render cascade across all instanced meshes.
  const worldSeed = useGameStore(s => s.worldSeed);

  const bodyRefs = useRef<Record<BodyArchetype, THREE.InstancedMesh | null>>({
    'euro-man': null, 'robe-long': null, 'tunic-wrap': null, 'african-wrap-man': null,
    'euro-woman': null, 'sari-woman': null, 'wrap-woman': null, 'child': null,
  });
  const headRefs = useRef<Record<FigureType, THREE.InstancedMesh | null>>({
    man: null, woman: null, child: null,
  });
  const headwearRefs = useRef<Record<Exclude<HeadwearType, 'none'>, THREE.InstancedMesh | null>>({
    'felt-hat': null, 'turban': null, 'kufi': null, 'straw-hat': null,
    'mantilla': null, 'head-wrap': null, 'scarf': null,
  });
  const armRefs = useRef<Record<ArmType, THREE.InstancedMesh | null>>({
    'male-long': null, 'male-robe': null, 'female': null, 'child': null,
  });
  const propRefs = useRef<Record<Exclude<PropType, 'none'>, THREE.InstancedMesh | null>>({
    'bundle': null, 'basket': null, 'rope-coil': null, 'jar': null,
  });
  const trimRefs = useRef<Record<TrimArchetype, THREE.InstancedMesh | null>>({
    'robe-long': null, 'tunic-wrap': null, 'african-wrap-man': null,
    'sari-woman': null, 'wrap-woman': null,
  });
  const lanternRef = useRef<THREE.InstancedMesh>(null);
  // Click hitbox — invisible cylinders, one per ped, instanceId == ped index.
  // Lets raycasting against a single mesh resolve straight back to a
  // pedestrian without the per-archetype counter bookkeeping that the body
  // meshes use.
  const hitboxRef = useRef<THREE.InstancedMesh>(null);
  const selectionRingRef = useRef<THREE.Mesh>(null);

  const dummy = useRef(new THREE.Object3D());
  const headDummy = useRef(new THREE.Object3D());
  const scratchMat = useRef(new THREE.Matrix4());
  const scratchLocal = useRef(new THREE.Matrix4());
  const dwellingIdx = useRef<number[]>([]);
  const scratchPos = useRef(new THREE.Vector3());
  const scratchQuat = useRef(new THREE.Quaternion());
  const scratchScale = useRef(new THREE.Vector3(1, 1, 1));
  const scratchEuler = useRef(new THREE.Euler(0, 0, 0, 'XYZ'));

  const systemRef = useRef<PedestrianSystemState | null>(null);
  const profilesRef = useRef<VisualProfile[]>([]);
  const portIdRef = useRef<string | undefined>(undefined);
  const colorsNeedInit = useRef(true);
  const animAccumRef = useRef(0);
  const livePedXs = useRef<Float32Array>(new Float32Array(256));
  const livePedYs = useRef<Float32Array>(new Float32Array(256));
  const livePedZs = useRef<Float32Array>(new Float32Array(256));

  const bodyGeos = useMemo(() => {
    const m = {} as Record<BodyArchetype, THREE.BufferGeometry>;
    for (const a of BODY_ARCHETYPES) m[a] = createBodyGeometry(a);
    return m;
  }, []);
  const headGeos = useMemo(() => ({
    man: createHeadGeometry('man'),
    woman: createHeadGeometry('woman'),
    child: createHeadGeometry('child'),
  }), []);
  const headwearGeos = useMemo(() => {
    const m = {} as Record<Exclude<HeadwearType, 'none'>, THREE.BufferGeometry>;
    for (const h of HEADWEAR_TYPES) m[h] = createHeadwearGeometry(h);
    return m;
  }, []);
  const armGeos = useMemo(() => {
    const m = {} as Record<ArmType, THREE.BufferGeometry>;
    for (const a of ARM_TYPES) m[a] = createArmGeometry(a);
    return m;
  }, []);
  const trimGeos = useMemo(() => {
    const m = {} as Record<TrimArchetype, THREE.BufferGeometry>;
    for (const a of TRIM_ARCHETYPES) m[a] = createTrimGeometry(a);
    return m;
  }, []);
  const propGeos = useMemo(() => {
    const m = {} as Record<Exclude<PropType, 'none'>, THREE.BufferGeometry>;
    for (const p of PROP_TYPES) m[p] = createPropGeometry(p);
    return m;
  }, []);
  const lanternGeo = useMemo(() => createLanternGeometry(), []);
  // Hitbox: cylinder roughly the size of a person, centered at ped position
  // plus a y-offset so the matrix-translate hits its midriff. CylinderGeometry
  // is created erect along Y, so we don't need to rotate.
  const hitboxGeo = useMemo(() => new THREE.CylinderGeometry(0.55, 0.55, 1.8, 8, 1), []);
  const hitboxMat = useMemo(() => new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthWrite: false,
    colorWrite: false,
    side: THREE.DoubleSide,
  }), []);

  const bodyMat = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.88, metalness: 0 }), []);
  const skinMat = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.75, metalness: 0 }), []);
  const headwearMat = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.80, metalness: 0 }), []);
  const armMat = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0 }), []);
  const propMat = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.90, metalness: 0 }), []);
  const lanternMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#ff8800', emissive: '#ff6600', emissiveIntensity: 2.0, roughness: 0.3,
  }), []);

  // Rim-light pass for silhouette read against sky/fog. Skin gets a softer
  // multiplier so faces don't glow; lanternMat is left alone (emissive).
  useEffect(() => {
    applyRimLight(bodyMat, 1.0);
    applyRimLight(headwearMat, 1.0);
    applyRimLight(armMat, 1.0);
    applyRimLight(propMat, 1.0);
    applyRimLight(skinMat, 0.5);
  }, [bodyMat, headwearMat, armMat, propMat, skinMat]);

  useEffect(() => {
    if (ports.length === 0) return;
    const port = ports[0];
    const system = initPedestrianSystem(
      port.buildings, port.culture, port.scale,
      port.position[0], port.position[2], worldSeed,
      port.roads,
      PORT_FACTION[port.id],
      PORT_CULTURAL_REGION[port.id],
    );
    systemRef.current = system;
    portIdRef.current = port.id;
    clearLivePedestrians();
    // Drop any stale selection from a previous port — the index would now
    // point at a different person in the new system.
    selectedPedIdx = null;

    const rng = mulberry32(worldSeed * 31 + 7717);
    profilesRef.current = system.pedestrians.map(p =>
      assignVisualProfile(system.culture, p.figureType, p.type, rng),
    );
    colorsNeedInit.current = true;
  }, [ports, worldSeed]);

  useFrame((state, delta) => {
    updateRimFromFog(state.scene);
    const system = systemRef.current;
    if (!system) return;
    const profiles = profilesRef.current;

    // ── Color initialization (once, after meshes are ready) ───────────────
    if (colorsNeedInit.current) {
      let allReady = true;
      for (const a of BODY_ARCHETYPES) if (!bodyRefs.current[a]) { allReady = false; break; }
      for (const f of FIGURE_TYPES) if (!headRefs.current[f]) { allReady = false; break; }
      for (const a of ARM_TYPES) if (!armRefs.current[a]) { allReady = false; break; }
      for (const a of TRIM_ARCHETYPES) if (!trimRefs.current[a]) { allReady = false; break; }
      if (!allReady) return;

      const rng = mulberry32(worldSeed * 7 + 4231);
      const col = new THREE.Color();
      const regionMix = getPortRegionMix(portIdRef.current, system.culture);

      const bodyCounters: Record<BodyArchetype, number> = {
        'euro-man': 0, 'robe-long': 0, 'tunic-wrap': 0, 'african-wrap-man': 0,
        'euro-woman': 0, 'sari-woman': 0, 'wrap-woman': 0, 'child': 0,
      };
      const headCounters: Record<FigureType, number> = { man: 0, woman: 0, child: 0 };
      const hwCounters: Record<Exclude<HeadwearType, 'none'>, number> = {
        'felt-hat': 0, 'turban': 0, 'kufi': 0, 'straw-hat': 0,
        'mantilla': 0, 'head-wrap': 0, 'scarf': 0,
      };
      const armCounters: Record<ArmType, number> = {
        'male-long': 0, 'male-robe': 0, 'female': 0, 'child': 0,
      };
      const propCounters: Record<Exclude<PropType, 'none'>, number> = {
        'bundle': 0, 'basket': 0, 'rope-coil': 0, 'jar': 0,
      };
      const trimCounters: Record<TrimArchetype, number> = {
        'robe-long': 0, 'tunic-wrap': 0, 'african-wrap-man': 0,
        'sari-woman': 0, 'wrap-woman': 0,
      };

      for (let i = 0; i < system.pedestrians.length; i++) {
        const p = system.pedestrians[i];
        const prof = profiles[i];
        const rig = ARCHETYPE_SHOULDER[prof.body];

        // Sample a cultural region for this ped (e.g. Mombasa → mostly Swahili,
        // some Arab/Gujarati/European). Skin, clothing accent, and trim all
        // pull from this same region so the ped reads as one coherent person.
        const region = pickWeighted(regionMix, rng).region;

        // Body — 60% chance use the region's accent palette (period-typical
        // dyes for that culture), 40% the archetype's base palette. Euro
        // archetypes always use their own palette; sari-woman always uses
        // its own (saris were always brightly dyed regardless of region).
        const huePull = (rng() - 0.5) * 0.012;
        const useRegionAccent =
          prof.body !== 'euro-man' && prof.body !== 'euro-woman' &&
          prof.body !== 'sari-woman' && rng() < 0.6;
        const clothingPool = useRegionAccent
          ? CLOTHING_ACCENTS_BY_REGION[region]
          : CLOTHING_BY_ARCHETYPE[prof.body];
        const clothing = varyHSL(
          pickWeighted(clothingPool, rng).color,
          rng, 0.025, 0.10, 0.13, huePull,
        );
        col.setRGB(clothing[0], clothing[1], clothing[2]);
        bodyRefs.current[prof.body]!.setColorAt(bodyCounters[prof.body]++, col);

        // Head (skin) — tight hue, real value range.
        const skinPool = SKIN_TONES_BY_REGION[region];
        const skin = varySkin(pickWeighted(skinPool, rng).color, rng);
        const skinR = skin[0], skinG = skin[1], skinB = skin[2];
        col.setRGB(skinR, skinG, skinB);
        headRefs.current[p.figureType]!.setColorAt(headCounters[p.figureType]++, col);

        // Arms — two slots per pedestrian, same color for both sides
        const armColor: [number, number, number] = rig.armColorFromSkin
          ? [skinR, skinG, skinB]
          : clothing;
        col.setRGB(armColor[0], armColor[1], armColor[2]);
        const armMesh = armRefs.current[rig.armType]!;
        armMesh.setColorAt(armCounters[rig.armType]++, col);
        armMesh.setColorAt(armCounters[rig.armType]++, col);

        // Trim — sash/border accent, region-keyed saturated color. Picked
        // independently of clothing so it contrasts (e.g. red sash on
        // indigo robe). Wider value variation reads as silk vs cotton.
        if (isTrimArchetype(prof.body)) {
          const tc = varyHSL(
            pickWeighted(TRIM_ACCENTS_BY_REGION[region], rng).color,
            rng, 0.02, 0.10, 0.14,
          );
          col.setRGB(tc[0], tc[1], tc[2]);
          const trimMesh = trimRefs.current[prof.body];
          if (trimMesh) trimMesh.setColorAt(trimCounters[prof.body]++, col);
        }

        // Headwear — wider value range than clothing (hats fade unevenly in sun).
        if (prof.headwear !== 'none') {
          const hw = prof.headwear;
          const mesh = headwearRefs.current[hw];
          if (mesh) {
            const hwColor = varyHSL(pickWeighted(HEADWEAR_COLORS[hw], rng).color, rng, 0.03, 0.12, 0.16);
            col.setRGB(hwColor[0], hwColor[1], hwColor[2]);
            mesh.setColorAt(hwCounters[hw]++, col);
          }
        }

        // Prop — natural materials (wood, fiber, ceramic) — value-weighted variation.
        if (prof.prop !== 'none') {
          const pp = prof.prop;
          const mesh = propRefs.current[pp];
          if (mesh) {
            const pc = varyHSL(pickWeighted(PROP_COLORS[pp], rng).color, rng, 0.015, 0.08, 0.18);
            col.setRGB(pc[0], pc[1], pc[2]);
            mesh.setColorAt(propCounters[pp]++, col);
          }
        }
      }

      for (const a of BODY_ARCHETYPES) {
        const m = bodyRefs.current[a];
        if (m?.instanceColor) m.instanceColor.needsUpdate = true;
      }
      for (const f of FIGURE_TYPES) {
        const m = headRefs.current[f];
        if (m?.instanceColor) m.instanceColor.needsUpdate = true;
      }
      for (const h of HEADWEAR_TYPES) {
        const m = headwearRefs.current[h];
        if (m?.instanceColor) m.instanceColor.needsUpdate = true;
      }
      for (const a of ARM_TYPES) {
        const m = armRefs.current[a];
        if (m?.instanceColor) m.instanceColor.needsUpdate = true;
      }
      for (const p of PROP_TYPES) {
        const m = propRefs.current[p];
        if (m?.instanceColor) m.instanceColor.needsUpdate = true;
      }
      for (const a of TRIM_ARCHETYPES) {
        const m = trimRefs.current[a];
        if (m?.instanceColor) m.instanceColor.needsUpdate = true;
      }

      colorsNeedInit.current = false;
    }

    // ── Freeze entire animation while the game is paused (hail modal, etc.) ─
    // Existing instance matrices stay as they were last frame, so peds hold
    // their pose — no arm swing, no bob, no walking — until the game resumes.
    if (useGameStore.getState().paused) {
      animAccumRef.current = 0;
      return;
    }

    // ── Throttle main update to ~20fps (arm swing reads fine at this rate) ─
    animAccumRef.current += delta;
    if (animAccumRef.current < 1 / 20) return;
    const dt = Math.min(0.1, animAccumRef.current);
    animAccumRef.current = 0;

    const time = state.clock.elapsedTime;
    const hour = useGameStore.getState().timeOfDay;

    // Apply kills from projectile hits before updating positions.
    const kills = consumePendingKills();
    for (const idx of kills) {
      if (idx < system.pedestrians.length) system.pedestrians[idx].dead = true;
    }

    const activeCount = updatePedestrians(system, time, dt, hour);

    // Publish live positions for Player collision. Only the active slice moves;
    // inactive peds stay parked off-screen so they won't be reached by the scan.
    const pxs = livePedXs.current;
    const pys = livePedYs.current;
    const pzs = livePedZs.current;
    const pubCount = Math.min(activeCount, pxs.length);
    for (let i = 0; i < pubCount; i++) {
      pxs[i] = system.pedestrians[i].x;
      pys[i] = system.pedestrians[i].y;
      pzs[i] = system.pedestrians[i].z;
    }
    syncLivePedestrians(pubCount, pxs, pys, pzs);

    const d = dummy.current;

    const sunAngle = ((hour - 6) / 24) * Math.PI * 2;
    const isNight = Math.sin(sunAngle) < 0.1;

    const bodyCounts: Record<BodyArchetype, number> = {
      'euro-man': 0, 'robe-long': 0, 'tunic-wrap': 0, 'african-wrap-man': 0,
      'euro-woman': 0, 'sari-woman': 0, 'wrap-woman': 0, 'child': 0,
    };
    const headCounts: Record<FigureType, number> = { man: 0, woman: 0, child: 0 };
    const hwCounts: Record<Exclude<HeadwearType, 'none'>, number> = {
      'felt-hat': 0, 'turban': 0, 'kufi': 0, 'straw-hat': 0,
      'mantilla': 0, 'head-wrap': 0, 'scarf': 0,
    };
    const armCounts: Record<ArmType, number> = {
      'male-long': 0, 'male-robe': 0, 'female': 0, 'child': 0,
    };
    const propCounts: Record<Exclude<PropType, 'none'>, number> = {
      'bundle': 0, 'basket': 0, 'rope-coil': 0, 'jar': 0,
    };
    const trimCounts: Record<TrimArchetype, number> = {
      'robe-long': 0, 'tunic-wrap': 0, 'african-wrap-man': 0,
      'sari-woman': 0, 'wrap-woman': 0,
    };
    let lanternCount = 0;

    const armMatW = scratchMat.current;
    const armLocal = scratchLocal.current;
    const armPos = scratchPos.current;
    const armQuat = scratchQuat.current;
    const armScale = scratchScale.current;
    const armEuler = scratchEuler.current;
    const hd = headDummy.current;

    // Build a quick index of dwelling pedestrians for cluster-facing lookups.
    // Dwelling peds pivot to face their nearest dwelling neighbor within
    // CLUSTER_RADIUS, which reads as conversation rather than statues.
    const dwellList = dwellingIdx.current;
    dwellList.length = 0;
    for (let i = 0; i < activeCount; i++) {
      const pi = system.pedestrians[i];
      if (pi.isDwelling && !pi.dead) dwellList.push(i);
    }

    const playerPos = getActivePlayerPos();
    const playerX = playerPos[0];
    const playerZ = playerPos[2];

    for (let i = 0; i < activeCount; i++) {
      const p = system.pedestrians[i];
      const prof = profiles[i];

      if (p.dead) {
        // Render as a fallen body. Fall direction is backward from the ped's facing
        // angle, using the same axis-angle approach as felled trees in World.tsx.
        // armPos and scratchPos.current are the same ref, so capture scalar components
        // before the second set() call overwrites them.
        const fallAngle = p.angle + Math.PI;
        const fdx = Math.sin(fallAngle);
        const fdz = Math.cos(fallAngle);
        // fallAxis = perpendicular to fallDir in XZ plane, reuse armPos as temp
        armPos.set(fdz, 0, -fdx).normalize();
        armQuat.setFromAxisAngle(armPos, Math.PI * 0.48);
        d.position.set(p.x + fdx * 0.85, p.y, p.z + fdz * 0.85);
        d.scale.setScalar(1);
        d.quaternion.copy(armQuat);
        d.updateMatrix();
        const bodyMesh = bodyRefs.current[prof.body];
        if (bodyMesh) bodyMesh.setMatrixAt(bodyCounts[prof.body]++, d.matrix);
        const headMesh = headRefs.current[p.figureType];
        if (headMesh) headMesh.setMatrixAt(headCounts[p.figureType]++, d.matrix);
        // Trim falls with body — keep slot index aligned with init colors.
        if (isTrimArchetype(prof.body)) {
          const trimMesh = trimRefs.current[prof.body];
          if (trimMesh) trimMesh.setMatrixAt(trimCounts[prof.body]++, d.matrix);
        }
        continue;
      }

      const rig = ARCHETYPE_SHOULDER[prof.body];

      // ── Cluster facing: when dwelling, pivot toward nearest dwelling neighbor ──
      // Mutating p.angle here is safe because the system reassigns angle from
      // velocity once the ped starts walking again.
      if (p.isDwelling) {
        let bestSq = CLUSTER_RADIUS_SQ;
        let bestDx = 0, bestDz = 0;
        for (let k = 0; k < dwellList.length; k++) {
          const j = dwellList[k];
          if (j === i) continue;
          const q = system.pedestrians[j];
          const dx = q.x - p.x;
          const dz = q.z - p.z;
          const dsq = dx * dx + dz * dz;
          if (dsq < bestSq && dsq > 0.04) { // ignore overlapping spawns
            bestSq = dsq;
            bestDx = dx;
            bestDz = dz;
          }
        }
        if (bestSq < CLUSTER_RADIUS_SQ) {
          p.angle = Math.atan2(bestDx, bestDz);
        }
      }

      // When dwelling, suppress sway/bob slightly and zero the arm swing.
      const motionGate = p.isDwelling ? 0.2 : 1.0;
      const bob = Math.sin(time * 6 + p.phase) * 0.04 * motionGate;
      const sway = Math.sin(time * 3 + p.phase) * 0.015 * motionGate;
      const tilt = p.corridorIdx >= 0 && !p.isDwelling ? 0.06 : 0.03;

      d.position.set(p.x + sway, p.y + bob, p.z);
      d.rotation.set(tilt, p.angle, 0);
      d.scale.setScalar(1.12);
      d.updateMatrix();

      // ── Head turn: nearby peds rotate the head (and headwear) toward the player ──
      // Clamped to ±60°; outside HEAD_TURN_RADIUS we just reuse the body matrix.
      const dxP = playerX - p.x;
      const dzP = playerZ - p.z;
      const distSqP = dxP * dxP + dzP * dzP;
      let useHeadMatrix = false;
      if (distSqP < HEAD_TURN_RADIUS_SQ) {
        const bearing = Math.atan2(dxP, dzP);
        let yawDelta = bearing - p.angle;
        while (yawDelta > Math.PI) yawDelta -= Math.PI * 2;
        while (yawDelta < -Math.PI) yawDelta += Math.PI * 2;
        if (yawDelta > HEAD_TURN_MAX_YAW) yawDelta = HEAD_TURN_MAX_YAW;
        else if (yawDelta < -HEAD_TURN_MAX_YAW) yawDelta = -HEAD_TURN_MAX_YAW;
        if (Math.abs(yawDelta) > 0.05) {
          hd.position.set(p.x + sway, p.y + bob, p.z);
          hd.rotation.set(tilt, p.angle + yawDelta, 0);
          hd.scale.setScalar(1.12);
          hd.updateMatrix();
          useHeadMatrix = true;
        }
      }
      const headMat = useHeadMatrix ? hd.matrix : d.matrix;

      // Body
      const bodyMesh = bodyRefs.current[prof.body];
      if (bodyMesh) bodyMesh.setMatrixAt(bodyCounts[prof.body]++, d.matrix);

      // Trim — same matrix as body so the sash/border tracks the wearer.
      if (isTrimArchetype(prof.body)) {
        const trimMesh = trimRefs.current[prof.body];
        if (trimMesh) trimMesh.setMatrixAt(trimCounts[prof.body]++, d.matrix);
      }

      // Head
      const headMesh = headRefs.current[p.figureType];
      if (headMesh) headMesh.setMatrixAt(headCounts[p.figureType]++, headMat);

      // Arms — compute shoulder local transform × swing, for each side
      const swing = p.isDwelling ? 0 : Math.sin(time * 8 + p.phase) * rig.swingAmp;
      const armMesh = armRefs.current[rig.armType];
      if (armMesh) {
        for (const side of [-1, 1] as const) {
          armPos.set(side * rig.shoulderHalf, rig.shoulderY, 0);
          armEuler.set(swing * side, 0, 0); // left/right swing opposite phase
          armQuat.setFromEuler(armEuler);
          armLocal.compose(armPos, armQuat, armScale);
          armMatW.multiplyMatrices(d.matrix, armLocal);
          armMesh.setMatrixAt(armCounts[rig.armType]++, armMatW);
        }
      }

      // Headwear — offset vertically so it lands on the right head height
      if (prof.headwear !== 'none') {
        const hwMesh = headwearRefs.current[prof.headwear];
        if (hwMesh) {
          const yOffset = HEAD_TOP_Y[p.figureType] - HEAD_TOP_Y.man;
          armPos.set(0, yOffset, 0);
          armEuler.set(0, 0, 0);
          armQuat.setFromEuler(armEuler);
          armLocal.compose(armPos, armQuat, armScale);
          armMatW.multiplyMatrices(headMat, armLocal);
          hwMesh.setMatrixAt(hwCounts[prof.headwear]++, armMatW);
        }
      }

      // Prop — same vertical offset scheme as headwear (adults only)
      if (prof.prop !== 'none' && p.figureType !== 'child') {
        const pMesh = propRefs.current[prof.prop];
        if (pMesh) {
          const yOffset = HEAD_TOP_Y[p.figureType] - HEAD_TOP_Y.man;
          armPos.set(0, yOffset, 0);
          armEuler.set(0, 0, 0);
          armQuat.setFromEuler(armEuler);
          armLocal.compose(armPos, armQuat, armScale);
          armMatW.multiplyMatrices(d.matrix, armLocal);
          pMesh.setMatrixAt(propCounts[prof.prop]++, armMatW);
        }
      }

      if (isNight && p.figureType !== 'child' && lanternRef.current) {
        lanternRef.current.setMatrixAt(lanternCount++, d.matrix);
      }
    }

    // Commit counts + dirty flags
    for (const a of BODY_ARCHETYPES) {
      const m = bodyRefs.current[a];
      if (m) { m.count = bodyCounts[a]; if (bodyCounts[a] > 0) m.instanceMatrix.needsUpdate = true; }
    }
    for (const f of FIGURE_TYPES) {
      const m = headRefs.current[f];
      if (m) { m.count = headCounts[f]; if (headCounts[f] > 0) m.instanceMatrix.needsUpdate = true; }
    }
    for (const h of HEADWEAR_TYPES) {
      const m = headwearRefs.current[h];
      if (m) { m.count = hwCounts[h]; if (hwCounts[h] > 0) m.instanceMatrix.needsUpdate = true; }
    }
    for (const a of ARM_TYPES) {
      const m = armRefs.current[a];
      if (m) { m.count = armCounts[a]; if (armCounts[a] > 0) m.instanceMatrix.needsUpdate = true; }
    }
    for (const pp of PROP_TYPES) {
      const m = propRefs.current[pp];
      if (m) { m.count = propCounts[pp]; if (propCounts[pp] > 0) m.instanceMatrix.needsUpdate = true; }
    }
    for (const a of TRIM_ARCHETYPES) {
      const m = trimRefs.current[a];
      if (m) { m.count = trimCounts[a]; if (trimCounts[a] > 0) m.instanceMatrix.needsUpdate = true; }
    }
    if (lanternRef.current) {
      lanternRef.current.count = lanternCount;
      if (lanternCount > 0) lanternRef.current.instanceMatrix.needsUpdate = true;
    }

    // ── Click hitboxes ──
    // One cylinder per ped, instanceId == pedestrian array index. Dead peds
    // get parked far below the ground so raycasts skip them; their slot
    // remains in place so the index↔ped mapping stays stable.
    const hitbox = hitboxRef.current;
    if (hitbox) {
      for (let i = 0; i < activeCount; i++) {
        const p = system.pedestrians[i];
        if (p.dead) {
          d.position.set(0, -10000, 0);
          d.scale.setScalar(0.001);
        } else {
          d.position.set(p.x, p.y + 0.9, p.z);
          d.scale.setScalar(1);
        }
        d.rotation.set(0, 0, 0);
        d.updateMatrix();
        hitbox.setMatrixAt(i, d.matrix);
      }
      hitbox.count = activeCount;
      hitbox.instanceMatrix.needsUpdate = true;
    }

    // ── Selection ring ──
    const ring = selectionRingRef.current;
    if (ring) {
      const idx = selectedPedIdx;
      if (idx !== null && idx < activeCount && !system.pedestrians[idx].dead) {
        const sp = system.pedestrians[idx];
        ring.position.set(sp.x, sp.y + 0.05, sp.z);
        ring.rotation.z = state.clock.elapsedTime * 0.5;
        const pulse = 0.45 + Math.sin(state.clock.elapsedTime * 3) * 0.15;
        (ring.material as THREE.MeshBasicMaterial).opacity = pulse;
        ring.visible = true;
      } else {
        // Auto-deselect when the target dies or scrolls off the active slice.
        if (idx !== null && (idx >= activeCount || system.pedestrians[idx]?.dead)) {
          selectedPedIdx = null;
        }
        ring.visible = false;
      }
    }
  });

  if (ports.length === 0) return null;

  const handlePedClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const idx = e.instanceId;
    if (idx === undefined) return;
    const system = systemRef.current;
    if (!system) return;
    const ped = system.pedestrians[idx];
    if (!ped || ped.dead) return;

    // Toggle: click again to deselect
    if (selectedPedIdx === idx) {
      selectedPedIdx = null;
      return;
    }
    selectedPedIdx = idx;

    const port = ports[0];
    const home = ped.homeBuildingId
      ? port?.buildings.find(b => b.id === ped.homeBuildingId)
      : undefined;
    const role = ROLE_LABEL[ped.type] ?? ped.type;
    let phrase: string;
    if (ped.givenName && ped.familyName) {
      phrase = home?.label
        ? `${ped.givenName} ${ped.familyName}, a ${role} of ${home.label}.`
        : `${ped.givenName} ${ped.familyName}, a ${role}.`;
    } else {
      phrase = `a ${role} on the streets.`;
    }
    useGameStore.getState().addNotification(`You see ${phrase}`, 'info');
  };

  return (
    <>
      {BODY_ARCHETYPES.map(a => (
        <instancedMesh
          key={`body-${a}`}
          ref={(ref) => { bodyRefs.current[a] = ref; }}
          args={[bodyGeos[a], bodyMat, MAX_PER_MESH]}
          frustumCulled={false}
          castShadow
        />
      ))}
      {TRIM_ARCHETYPES.map(a => (
        <instancedMesh
          key={`trim-${a}`}
          ref={(ref) => { trimRefs.current[a] = ref; }}
          args={[trimGeos[a], bodyMat, MAX_PER_MESH]}
          frustumCulled={false}
          castShadow
        />
      ))}
      {FIGURE_TYPES.map(f => (
        <instancedMesh
          key={`head-${f}`}
          ref={(ref) => { headRefs.current[f] = ref; }}
          args={[headGeos[f], skinMat, MAX_PER_MESH]}
          frustumCulled={false}
          castShadow
        />
      ))}
      {HEADWEAR_TYPES.map(h => (
        <instancedMesh
          key={`hw-${h}`}
          ref={(ref) => { headwearRefs.current[h] = ref; }}
          args={[headwearGeos[h], headwearMat, MAX_PER_MESH]}
          frustumCulled={false}
          castShadow
        />
      ))}
      {ARM_TYPES.map(a => (
        <instancedMesh
          key={`arm-${a}`}
          ref={(ref) => { armRefs.current[a] = ref; }}
          args={[armGeos[a], armMat, MAX_PER_MESH]}
          frustumCulled={false}
          castShadow
        />
      ))}
      {PROP_TYPES.map(pp => (
        <instancedMesh
          key={`prop-${pp}`}
          ref={(ref) => { propRefs.current[pp] = ref; }}
          args={[propGeos[pp], propMat, MAX_PER_MESH]}
          frustumCulled={false}
          castShadow
        />
      ))}
      <instancedMesh
        ref={lanternRef}
        args={[lanternGeo, lanternMat, MAX_PER_MESH]}
        frustumCulled={false}
      />
      {/* Click hitboxes — invisible, but raycastable. */}
      <instancedMesh
        ref={hitboxRef}
        args={[hitboxGeo, hitboxMat, MAX_PER_MESH]}
        frustumCulled={false}
        onClick={handlePedClick}
      />
      {/* Selection ring — single mesh, repositioned each frame. */}
      <mesh
        ref={selectionRingRef}
        rotation={[-Math.PI / 2, 0, 0]}
        visible={false}
        renderOrder={2}
      >
        <ringGeometry args={[0.6, 0.78, 32]} />
        <meshBasicMaterial
          color="#ffe7a8"
          transparent
          opacity={0.5}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
    </>
  );
}
