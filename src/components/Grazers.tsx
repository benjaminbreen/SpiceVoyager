import { useMemo, useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { getActivePlayerPos } from '../utils/livePlayerTransform';
import { getTerrainHeight } from '../utils/terrain';
import { useGameStore } from '../store/gameStore';
import { sfxHoofbeats } from '../audio/SoundEffects';
import { BODY_RADIUS, PLAYER_RADIUS, computeCirclePush, separateHerd } from '../utils/animalBump';
import { resolveObstaclePush } from '../utils/obstacleGrid';
import { GRAZER_TERRAIN, resolveTerrainStep } from '../utils/animalTerrain';
import { wildlifeLivePositions } from '../utils/combatState';
import { tintFlat, tintGradient } from '../utils/animalTint';
import {
  createStaminaBarGeometry,
  createStaminaBarMaterial,
  setStaminaBarInstance,
  staminaColor,
} from '../utils/animalStaminaBar';
import { grazerFootOffset, type GrazerEntry, type GrazerKind, type SpeciesInfo } from '../utils/animalTypes';

// ── Types ────────────────────────────────────────────────────────────────────
interface GrazerOffset {
  dx: number; dz: number;          // flee offset (pushed by player)
  wDx: number; wDz: number;        // wander offset (slow ambient walking)
  wDirX: number; wDirZ: number;    // current wander velocity unit vector (0,0 = paused, grazing)
  wFacing: number;                  // remembered facing while paused
  wNextChange: number;              // clock time to repick direction
  fleeing: boolean;                 // hysteresis flag — prevents flicker at scatter boundary
  stamina: number;                  // 1 = fresh, 0 = exhausted — drained while fleeing
  fleeJitter: number;               // ±π/12 perturbation on flee heading, re-rolled on an interval
  fleeJitterNext: number;           // clock time to re-roll the jitter
  panic: boolean;                   // shot at — flees harder and never returns
  deathTime: number;                // 0 = alive, -1 = harvest finished + hidden, else clock time of death (drives flop + carcass pose)
  harvestTime: number;              // 0 until player harvests, then clock time of harvest (drives sink-into-ground animation)
}

// HP per grazer kind — most game animals are one-shot kills with the musket;
// big animals soak more punishment. The bow is weaker so it takes 2 shots to
// drop a goat or sheep, and a buffalo will take several arrows.
const GRAZER_MAX_HP: Record<GrazerKind, number> = {
  antelope: 80,
  deer:     90,
  goat:     60,
  camel:    140,
  sheep:    60,
  bovine:   200,
  pig:      90,
  capybara: 60,
};

// Body radius for hit detection — slightly larger than the visual body so
// shots that visually clip the animal still register.
const HIT_RADIUS_MULT = 1.1;

let grazerInstanceCounter = 0;

// ── Constants ────────────────────────────────────────────────────────────────
const SCATTER_SQ = 14 * 14;      // spook radius — player must get fairly close before they bolt
const SCATTER_EXIT_SQ = 20 * 20;  // hysteresis: must move further away before calming down
// Player walks at 10 u/s; flee base = 0.07 * 60 = 4.2 u/s, with speedMult 0.7–1.3 → ~2.9–5.5 u/s.
// Comfortably slower than the player so chasing works; combined with coastal/cliff
// barriers below, herds become catchable rather than galloping off the map.
const FLEE_SPEED = 0.07;
const RETURN_DECAY = 0.985;       // how fast they drift back to spawn
const MAX_FLEE_DIST = 40;
const MAX_FLEE_SQ = MAX_FLEE_DIST * MAX_FLEE_DIST;
const ANIM_RANGE_SQ = 100 * 100;

// Foot-to-pivot distance per kind, in base geometry units (scale=1). Mesh pivot is at the
// body center; the lowest point is the hoof bottom at y = -(legLen + 0.045). When placing a
// grazer on the terrain, add this * instanceScale to terrainHeight so feet meet the ground.
// Wander tuning — bounded ambient motion so herds don't drift off their patch
const WANDER_MAX = 5;
const WANDER_MAX_SQ = WANDER_MAX * WANDER_MAX;
const WANDER_BASE_SPEED = 0.45;   // units/sec for a scale=1.0 animal; divided by scale for smaller animals
const WANDER_WALK_PROB = 0.65;    // 65% pick new walk direction, 35% pause to graze
// Fatigue — a determined player can eventually wear a herd down rather than
// chase them forever. Tuned so grazers stay at full tilt for ~6s, then slow.
const FATIGUE_RATE = 0.17;        // stamina loss per second while fleeing (full → 0 in ~6s)
const RECOVERY_RATE = 0.12;       // regen per second while calm (0 → full in ~8s)
const MIN_STAMINA_SPEED = 0.35;   // floor so exhausted grazers still plod instead of freezing
const FLEE_JITTER = Math.PI / 12; // ±15° perturbation on flee heading so the herd fans out

// ── Geometry builders ─────────────────────────────────────────────────────────
// Per-kind silhouette differentiators — kept cheap (instanced on a single draw call).
// Axis convention: +X = forward (muzzle), +Y = up, +Z = right flank.
type BuildParams = {
  bodyR: number;        // body sphere base radius
  bodyScale: [number, number, number]; // xyz stretch of body
  legLen: number;
  legR: number;
  hoofR: number;
  neckLen: number;
  neckRFront: number;
  neckRBack: number;
  neckTilt: number;     // rotateZ — negative = up-forward
  headOffset: [number, number];  // [x, y] forward/up of head
  headScale: [number, number, number];
  headR: number;
  muzzleOffset: [number, number];
  muzzleR: number;
  muzzleScale: [number, number, number];
  earAngle: number;
  earR: number;
  earH: number;
  tailOffset: [number, number]; // [x, y] of tail base
  tailR: number;
  tailH: number;
  tailTilt: number;
  hornKind: 'none' | 'straight' | 'curved' | 'buffalo' | 'branched' | 'spiral';
  hornLen: number;
  hump: boolean;        // camel hump
  shoulderHump: boolean;
  fluff: boolean;       // sheep: rougher, inflated body, obscures legs a touch
};

function buildQuadruped(p: BuildParams): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // Body — gradient from darker back (0.88) to lighter belly (1.18), classic countershading
  const body = new THREE.SphereGeometry(p.bodyR, 12, 8);
  body.scale(p.bodyScale[0], p.bodyScale[1], p.bodyScale[2]);
  tintGradient(body, 0.88, 1.18);
  parts.push(body);

  if (p.fluff) {
    // Extra wool bumps on a sheep body — slightly brighter than base
    const bumpPositions: [number, number, number][] = [
      [0.2, 0.18, 0.15], [0.2, 0.18, -0.15], [-0.1, 0.22, 0.15], [-0.1, 0.22, -0.15],
      [-0.25, 0.14, 0.05], [0.05, 0.25, 0], [-0.18, 0.0, 0.22], [-0.18, 0.0, -0.22],
    ];
    for (const [x, y, z] of bumpPositions) {
      const bump = new THREE.SphereGeometry(0.13, 6, 5);
      bump.translate(x, y, z);
      tintFlat(bump, 1.08);
      parts.push(bump);
    }
  }

  if (p.shoulderHump) {
    const shoulder = new THREE.SphereGeometry(0.19, 8, 6);
    shoulder.scale(1.0, 0.85, 1.0);
    shoulder.translate(0.18, 0.18, 0);
    tintFlat(shoulder, 0.95);
    parts.push(shoulder);
  }

  if (p.hump) {
    // Single dromedary hump centered above back — slightly darker top
    const hump = new THREE.SphereGeometry(0.22, 10, 7);
    hump.scale(1.2, 1.0, 0.9);
    hump.translate(0.05, 0.28, 0);
    tintFlat(hump, 0.9);
    parts.push(hump);
  }

  // Neck — near base tone
  const neck = new THREE.CylinderGeometry(p.neckRFront, p.neckRBack, p.neckLen, 8);
  neck.rotateZ(p.neckTilt);
  const neckCos = Math.cos(p.neckTilt);
  const neckSin = Math.sin(p.neckTilt);
  const neckMidX = 0.28 + Math.abs(neckSin) * p.neckLen * 0.5;
  const neckMidY = 0.08 + neckCos * p.neckLen * 0.5;
  neck.translate(neckMidX, neckMidY, 0);
  tintFlat(neck, 0.98);
  parts.push(neck);

  // Head
  const head = new THREE.SphereGeometry(p.headR, 10, 7);
  head.scale(p.headScale[0], p.headScale[1], p.headScale[2]);
  head.translate(p.headOffset[0], p.headOffset[1], 0);
  tintFlat(head, 1.0);
  parts.push(head);

  // Muzzle — darker than face, reads as nose
  if (p.muzzleR > 0) {
    const muzzle = new THREE.SphereGeometry(p.muzzleR, 6, 5);
    muzzle.scale(p.muzzleScale[0], p.muzzleScale[1], p.muzzleScale[2]);
    muzzle.translate(p.muzzleOffset[0], p.muzzleOffset[1], 0);
    tintFlat(muzzle, 0.72);
    parts.push(muzzle);
  }

  // Ears — softly darker than face
  if (p.earR > 0) {
    const earL = new THREE.ConeGeometry(p.earR, p.earH, 5);
    earL.rotateX(-p.earAngle);
    earL.rotateZ(-0.3);
    earL.translate(p.headOffset[0] - 0.01, p.headOffset[1] + 0.1, 0.07);
    tintFlat(earL, 0.85);
    parts.push(earL);
    const earR = new THREE.ConeGeometry(p.earR, p.earH, 5);
    earR.rotateX(p.earAngle);
    earR.rotateZ(-0.3);
    earR.translate(p.headOffset[0] - 0.01, p.headOffset[1] + 0.1, -0.07);
    tintFlat(earR, 0.85);
    parts.push(earR);
  }

  // Horns — keratin reads as near-black at typical viewing distance
  if (p.hornKind !== 'none') {
    const hornBaseX = p.headOffset[0];
    const hornBaseY = p.headOffset[1] + 0.12;
    const hornR = 0.022;
    const pushHorn = (g: THREE.BufferGeometry) => {
      tintFlat(g, 0.22);
      parts.push(g);
    };
    const addHorn = (side: 1 | -1) => {
      if (p.hornKind === 'straight') {
        const h = new THREE.CylinderGeometry(hornR * 0.6, hornR, p.hornLen, 5);
        h.rotateX(0.25 * side);
        h.translate(hornBaseX, hornBaseY + p.hornLen * 0.5, 0.05 * side);
        pushHorn(h);
      } else if (p.hornKind === 'curved') {
        const seg1 = new THREE.CylinderGeometry(hornR, hornR, p.hornLen * 0.55, 5);
        seg1.rotateX(0.35 * side);
        seg1.translate(hornBaseX, hornBaseY + p.hornLen * 0.25, 0.05 * side);
        pushHorn(seg1);
        const seg2 = new THREE.CylinderGeometry(hornR * 0.6, hornR * 0.9, p.hornLen * 0.55, 5);
        seg2.rotateX(-0.15 * side);
        seg2.rotateZ(-0.2);
        seg2.translate(hornBaseX - 0.02, hornBaseY + p.hornLen * 0.75, 0.1 * side);
        pushHorn(seg2);
      } else if (p.hornKind === 'spiral') {
        const h = new THREE.CylinderGeometry(hornR * 0.55, hornR, p.hornLen, 5);
        h.rotateX(0.18 * side);
        h.rotateZ(-0.15);
        h.translate(hornBaseX, hornBaseY + p.hornLen * 0.5, 0.05 * side);
        pushHorn(h);
      } else if (p.hornKind === 'buffalo') {
        const seg1 = new THREE.CylinderGeometry(0.035, 0.045, p.hornLen * 0.6, 6);
        seg1.rotateZ(Math.PI / 2);
        seg1.rotateY(0.4 * side);
        seg1.translate(hornBaseX - 0.02, hornBaseY - 0.02, p.hornLen * 0.3 * side);
        pushHorn(seg1);
        const seg2 = new THREE.CylinderGeometry(0.025, 0.035, p.hornLen * 0.45, 6);
        seg2.rotateX(0.7 * side);
        seg2.translate(hornBaseX - 0.03, hornBaseY + 0.08, p.hornLen * 0.6 * side);
        pushHorn(seg2);
      } else if (p.hornKind === 'branched') {
        const main = new THREE.CylinderGeometry(hornR * 0.6, hornR, p.hornLen, 5);
        main.rotateX(0.2 * side);
        main.translate(hornBaseX, hornBaseY + p.hornLen * 0.5, 0.06 * side);
        pushHorn(main);
        const prongF = new THREE.CylinderGeometry(hornR * 0.4, hornR * 0.6, p.hornLen * 0.4, 4);
        prongF.rotateZ(-0.9);
        prongF.translate(hornBaseX + 0.08, hornBaseY + p.hornLen * 0.75, 0.06 * side);
        pushHorn(prongF);
        const prongB = new THREE.CylinderGeometry(hornR * 0.4, hornR * 0.6, p.hornLen * 0.35, 4);
        prongB.rotateZ(0.9);
        prongB.translate(hornBaseX - 0.08, hornBaseY + p.hornLen * 0.7, 0.06 * side);
        pushHorn(prongB);
      }
    };
    addHorn(1);
    addHorn(-1);
  }

  // Legs — noticeably darker than body so silhouette reads against grass
  const legPositions: [number, number, number][] = [
    [0.22, -p.legLen * 0.5, 0.13],
    [0.22, -p.legLen * 0.5, -0.13],
    [-0.24, -p.legLen * 0.5, 0.13],
    [-0.24, -p.legLen * 0.5, -0.13],
  ];
  for (const [x, y, z] of legPositions) {
    const leg = new THREE.CylinderGeometry(p.legR, p.legR * 0.72, p.legLen, 6);
    leg.translate(x, y, z);
    tintFlat(leg, 0.72);
    parts.push(leg);
    // Hooves almost black — keeps them reading as feet on any base color
    const hoof = new THREE.CylinderGeometry(p.hoofR, p.hoofR * 0.75, 0.05, 6);
    hoof.translate(x, y - p.legLen * 0.5 - 0.02, z);
    tintFlat(hoof, 0.3);
    parts.push(hoof);
  }

  // Tail — slightly darker tip hints at the fur/hair end
  if (p.tailH > 0) {
    const tail = new THREE.ConeGeometry(p.tailR, p.tailH, 5);
    tail.rotateX(p.tailTilt);
    tail.translate(p.tailOffset[0], p.tailOffset[1], 0);
    tintFlat(tail, 0.82);
    parts.push(tail);
  }

  const merged = mergeGeometries(parts);
  parts.forEach(g => g.dispose());
  return merged ?? new THREE.BoxGeometry(0.5, 0.3, 0.3);
}

function buildGeometryForKind(kind: GrazerKind): THREE.BufferGeometry {
  switch (kind) {
    case 'antelope': return buildQuadruped({
      bodyR: 0.3, bodyScale: [1.6, 0.78, 0.82],
      legLen: 0.44, legR: 0.033, hoofR: 0.038,
      neckLen: 0.24, neckRFront: 0.09, neckRBack: 0.11, neckTilt: -0.9,
      headOffset: [0.56, 0.32], headScale: [1.25, 0.9, 0.85], headR: 0.11,
      muzzleOffset: [0.67, 0.27], muzzleR: 0.065, muzzleScale: [1.1, 0.8, 0.85],
      earAngle: 0.35, earR: 0.03, earH: 0.1,
      tailOffset: [-0.48, 0.08], tailR: 0.03, tailH: 0.12, tailTilt: 0.4,
      hornKind: 'spiral', hornLen: 0.2,
      hump: false, shoulderHump: true, fluff: false,
    });
    case 'deer': return buildQuadruped({
      bodyR: 0.28, bodyScale: [1.65, 0.75, 0.78],
      legLen: 0.5, legR: 0.028, hoofR: 0.032,
      neckLen: 0.3, neckRFront: 0.08, neckRBack: 0.1, neckTilt: -1.0,
      headOffset: [0.58, 0.4], headScale: [1.25, 0.85, 0.8], headR: 0.105,
      muzzleOffset: [0.69, 0.36], muzzleR: 0.055, muzzleScale: [1.1, 0.8, 0.85],
      earAngle: 0.4, earR: 0.032, earH: 0.12,
      tailOffset: [-0.48, 0.15], tailR: 0.028, tailH: 0.1, tailTilt: 0.1,
      hornKind: 'branched', hornLen: 0.22,
      hump: false, shoulderHump: true, fluff: false,
    });
    case 'goat': return buildQuadruped({
      bodyR: 0.26, bodyScale: [1.55, 0.8, 0.8],
      legLen: 0.36, legR: 0.03, hoofR: 0.035,
      neckLen: 0.2, neckRFront: 0.08, neckRBack: 0.1, neckTilt: -0.9,
      headOffset: [0.5, 0.28], headScale: [1.2, 0.9, 0.85], headR: 0.1,
      muzzleOffset: [0.6, 0.23], muzzleR: 0.058, muzzleScale: [1.15, 0.8, 0.85],
      earAngle: 0.5, earR: 0.035, earH: 0.11, // floppier, wider
      tailOffset: [-0.42, 0.12], tailR: 0.025, tailH: 0.08, tailTilt: -0.2,
      hornKind: 'curved', hornLen: 0.18,
      hump: false, shoulderHump: false, fluff: false,
    });
    case 'camel': return buildQuadruped({
      // Neck geometry tuned so the neck cylinder terminates *inside* the head
      // sphere. Previous values left a ~0.3u gap where the head floated free.
      // With neckLen 0.56 and tilt -0.85, neck top lands at ~(0.70, 0.45) —
      // comfortably overlapping the head at (0.70, 0.48).
      bodyR: 0.3, bodyScale: [1.55, 0.74, 0.76],
      legLen: 0.68, legR: 0.032, hoofR: 0.05,
      neckLen: 0.56, neckRFront: 0.07, neckRBack: 0.12, neckTilt: -0.85,
      headOffset: [0.7, 0.48], headScale: [1.5, 0.7, 0.72], headR: 0.11,
      muzzleOffset: [0.86, 0.42], muzzleR: 0.065, muzzleScale: [1.45, 0.75, 0.75],
      earAngle: 0.3, earR: 0.022, earH: 0.055,
      tailOffset: [-0.48, 0.0], tailR: 0.025, tailH: 0.14, tailTilt: -0.15,
      hornKind: 'none', hornLen: 0,
      hump: true, shoulderHump: false, fluff: false,
    });
    case 'sheep': return buildQuadruped({
      bodyR: 0.32, bodyScale: [1.35, 0.95, 0.9],
      legLen: 0.32, legR: 0.035, hoofR: 0.04,
      neckLen: 0.12, neckRFront: 0.1, neckRBack: 0.13, neckTilt: -0.75,
      headOffset: [0.45, 0.2], headScale: [1.25, 0.95, 0.9], headR: 0.1,
      muzzleOffset: [0.56, 0.17], muzzleR: 0.055, muzzleScale: [1.05, 0.85, 0.85],
      earAngle: 0.6, earR: 0.03, earH: 0.08,
      tailOffset: [-0.45, 0.1], tailR: 0.03, tailH: 0.08, tailTilt: -0.1,
      hornKind: 'none', hornLen: 0,
      hump: false, shoulderHump: false, fluff: true,
    });
    case 'bovine': return buildQuadruped({
      bodyR: 0.36, bodyScale: [1.6, 0.9, 0.95],
      legLen: 0.44, legR: 0.045, hoofR: 0.055,
      neckLen: 0.22, neckRFront: 0.13, neckRBack: 0.16, neckTilt: -0.7,
      headOffset: [0.6, 0.25], headScale: [1.35, 0.9, 0.95], headR: 0.13,
      muzzleOffset: [0.73, 0.2], muzzleR: 0.09, muzzleScale: [1.1, 0.85, 0.9],
      earAngle: 0.7, earR: 0.035, earH: 0.09,
      tailOffset: [-0.52, 0.1], tailR: 0.03, tailH: 0.22, tailTilt: 0.2,
      hornKind: 'buffalo', hornLen: 0.28,
      hump: false, shoulderHump: true, fluff: false,
    });
    case 'pig': return buildQuadruped({
      bodyR: 0.34, bodyScale: [1.5, 0.8, 0.85],
      legLen: 0.28, legR: 0.035, hoofR: 0.04,
      neckLen: 0.06, neckRFront: 0.14, neckRBack: 0.16, neckTilt: -0.5,
      headOffset: [0.48, 0.1], headScale: [1.3, 0.85, 0.9], headR: 0.13,
      muzzleOffset: [0.63, 0.05], muzzleR: 0.08, muzzleScale: [0.9, 0.9, 1.0], // flat snout
      earAngle: 0.7, earR: 0.04, earH: 0.08, // floppy
      tailOffset: [-0.48, 0.12], tailR: 0.02, tailH: 0.1, tailTilt: -0.4, // curly-ish up tail
      hornKind: 'none', hornLen: 0,
      hump: false, shoulderHump: false, fluff: false,
    });
    case 'capybara': return buildQuadruped({
      bodyR: 0.34, bodyScale: [1.5, 0.85, 0.95],
      legLen: 0.22, legR: 0.035, hoofR: 0.042,
      neckLen: 0.05, neckRFront: 0.14, neckRBack: 0.17, neckTilt: -0.4,
      headOffset: [0.45, 0.08], headScale: [1.4, 0.85, 0.9], headR: 0.14,
      muzzleOffset: [0.6, 0.05], muzzleR: 0.08, muzzleScale: [1.0, 0.85, 0.95],
      earAngle: 0.4, earR: 0.025, earH: 0.05, // tiny round ears
      tailOffset: [0, 0], tailR: 0, tailH: 0, tailTilt: 0, // no tail
      hornKind: 'none', hornLen: 0,
      hump: false, shoulderHump: false, fluff: false,
    });
  }
}

// ── Component ────────────────────────────────────────────────────────────────
export function Grazers({ data, shadowsActive, species, kind }: { data: GrazerEntry[]; shadowsActive: boolean; species?: SpeciesInfo; kind?: GrazerKind }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummyRef = useRef(new THREE.Object3D());
  const offsetsRef = useRef<GrazerOffset[]>([]);
  const animAccumRef = useRef(0);
  const fleeingCountRef = useRef(0);
  const lastSfxRef = useRef(0);
  const lastBumpRef = useRef(0);
  const separationAccumRef = useRef(0);
  // Scratch buffers reused every frame by the herd-separation pass
  const posXRef = useRef<number[]>([]);
  const posZRef = useRef<number[]>([]);
  const radiiRef = useRef<number[]>([]);
  const staminaBarMeshRef = useRef<THREE.InstancedMesh>(null);
  const staminaBarDummyRef = useRef(new THREE.Object3D());
  // Stable id prefix for this Grazers instance — used as the key into
  // wildlifeLivePositions so projectile hits can find this herd.
  const idPrefixRef = useRef<string>('');

  const geometry = useMemo(() => buildGeometryForKind(kind ?? 'antelope'), [kind]);
  const staminaBarGeometry = useMemo(() => createStaminaBarGeometry(), []);
  const staminaBarMaterial = useMemo(() => createStaminaBarMaterial(), []);

  const material = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.85,
    metalness: 0.0,
    // Vertex colors carry per-part tints (hooves dark, belly light, etc).
    // Three.js multiplies these with the per-instance color from setColorAt.
    vertexColors: true,
  }), []);

  // Init offsets + set initial matrices and per-instance colors
  useEffect(() => {
    offsetsRef.current = data.map((g) => ({
      dx: 0, dz: 0,
      wDx: 0, wDz: 0,
      wDirX: 0, wDirZ: 0,
      wFacing: g.rotation,
      wNextChange: Math.random() * 3, // stagger initial direction change so herd doesn't move in sync
      fleeing: false,
      stamina: 1,
      fleeJitter: 0,
      fleeJitterNext: 0,
      panic: false,
      deathTime: 0,
      harvestTime: 0,
    }));

    // Register this herd in wildlifeLivePositions so projectiles can hit them.
    // Use a unique prefix per Grazers instance so multiple herds don't collide.
    const variant = kind ?? 'antelope';
    const maxHp = GRAZER_MAX_HP[variant];
    const prefix = `grazer_${variant}_${grazerInstanceCounter++}`;
    idPrefixRef.current = prefix;
    data.forEach((g, i) => {
      const id = `${prefix}_${i}`;
      wildlifeLivePositions.set(id, {
        x: g.position[0],
        y: g.position[1],
        z: g.position[2],
        hp: maxHp,
        maxHp,
        template: 'grazer',
        variant,
        dead: false,
        radius: BODY_RADIUS.grazer * g.scale * HIT_RADIUS_MULT,
      });
    });
    if (!meshRef.current) return;
    const dummy = dummyRef.current;
    const col = new THREE.Color();
    data.forEach((g, i) => {
      const s = g.scale;
      dummy.position.set(g.position[0], g.position[1], g.position[2]);
      dummy.scale.set(s, s, s);
      dummy.rotation.set(0, g.rotation, 0);
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);
      col.setRGB(g.color[0], g.color[1], g.color[2]);
      meshRef.current!.setColorAt(i, col);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;

    // Init stamina bars as hidden (scale 0) — only show during flee
    if (staminaBarMeshRef.current) {
      const barDummy = staminaBarDummyRef.current;
      const barCol = new THREE.Color(0.1, 0.95, 0.15);
      for (let i = 0; i < data.length; i++) {
        setStaminaBarInstance(barDummy, 0, 0, 0, data[i].scale, 1, false);
        staminaBarMeshRef.current.setMatrixAt(i, barDummy.matrix);
        staminaBarMeshRef.current.setColorAt(i, barCol);
      }
      staminaBarMeshRef.current.instanceMatrix.needsUpdate = true;
      if (staminaBarMeshRef.current.instanceColor) staminaBarMeshRef.current.instanceColor.needsUpdate = true;
    }

    // Cleanup: remove this herd's entries from the wildlife map on unmount or
    // when the data array changes (port reload, scene swap).
    return () => {
      for (let i = 0; i < data.length; i++) {
        wildlifeLivePositions.delete(`${prefix}_${i}`);
      }
    };
  }, [data, kind]);

  // Scatter + wander animation
  const footOffset = grazerFootOffset(kind ?? 'antelope');
  useFrame(({ clock }, delta) => {
    if (!meshRef.current || offsetsRef.current.length !== data.length) return;
    animAccumRef.current += delta;
    if (animAccumRef.current < 1 / 20) return; // throttle to ~20fps
    const dt = Math.min(0.1, animAccumRef.current);
    animAccumRef.current = 0;
    const time = clock.getElapsedTime();
    const dummy = dummyRef.current;
    const playerPos = getActivePlayerPos();
    const px = playerPos[0];
    const pz = playerPos[2];
    let anyUpdated = false;
    const dtScale = dt * 60; // preserve 60fps-tuned constants
    const decay = Math.pow(RETURN_DECAY, dtScale);
    let fleeingNow = 0;
    let playerBumped = false;
    let bumpX = 0, bumpZ = 0;            // position of last bump, for spatial sfx
    let sampleFleeingX = 0, sampleFleeingZ = 0; // representative herd-flee position for scatter sfx
    let haveFleeingSample = false;

    // Separation scratch — reused across frames to avoid GC churn
    const posX = posXRef.current;
    const posZ = posZRef.current;
    const radii = radiiRef.current;
    posX.length = 0;
    posZ.length = 0;
    radii.length = 0;
    const nearIndices: number[] = [];

    const prefix = idPrefixRef.current;
    const dummy2 = dummyRef.current;
    data.forEach((g, i) => {
      const spawnX = g.position[0];
      const spawnZ = g.position[2];
      const off = offsetsRef.current[i];
      const id = `${prefix}_${i}`;
      const liveEntry = wildlifeLivePositions.get(id);

      // Harvested animals: sink + shrink over ~0.8s, then hide.
      if (liveEntry?.harvested) {
        const SINK_DUR = 0.8;
        if (off.harvestTime === 0) off.harvestTime = time;
        const th = time - off.harvestTime;
        if (th >= SINK_DUR) {
          if (off.deathTime !== -1) {
            off.deathTime = -1; // sentinel: harvested + hidden
            dummy2.position.set(0, -1000, 0);
            dummy2.scale.set(0, 0, 0);
            dummy2.updateMatrix();
            meshRef.current!.setMatrixAt(i, dummy2.matrix);
            anyUpdated = true;
          }
          return;
        }
        const p = Math.max(0, Math.min(1, th / SINK_DUR));
        // Ease-in cubic so the carcass lingers briefly then drops away
        const ease = p * p;
        const sinkY = liveEntry.y - 0.2 - ease * 0.7;
        const scale = g.scale * (1 - ease * 0.5);
        dummy2.position.set(liveEntry.x, sinkY, liveEntry.z);
        dummy2.scale.set(scale, scale, scale);
        dummy2.rotation.set(0, off.wFacing, Math.PI / 2);
        dummy2.updateMatrix();
        meshRef.current!.setMatrixAt(i, dummy2.matrix);
        anyUpdated = true;
        return;
      }

      // Dead (not yet harvested): flop over to the side over ~0.5s.
      // Progress the rotation and settle the body to the ground, then stop
      // writing the matrix so the instance buffer persists unchanged.
      if (liveEntry?.dead) {
        const FLOP_DUR = 0.5;
        if (off.deathTime === 0) {
          off.deathTime = time;
          const bar = staminaBarMeshRef.current;
          if (bar) {
            setStaminaBarInstance(staminaBarDummyRef.current, 0, 0, 0, g.scale, 0, false);
            bar.setMatrixAt(i, staminaBarDummyRef.current.matrix);
          }
        }
        const td = time - off.deathTime;
        if (td < FLOP_DUR) {
          // Ease-out quadratic: falls fast, settles gently on the ground
          const p = Math.max(0, Math.min(1, td / FLOP_DUR));
          const ease = 1 - (1 - p) * (1 - p);
          const tilt = ease * (Math.PI / 2);
          const carcassY = liveEntry.y - 0.2 * ease;
          dummy2.position.set(liveEntry.x, carcassY, liveEntry.z);
          dummy2.scale.set(g.scale, g.scale, g.scale);
          dummy2.rotation.set(0, off.wFacing, tilt);
          dummy2.updateMatrix();
          meshRef.current!.setMatrixAt(i, dummy2.matrix);
          anyUpdated = true;
        }
        return;
      }

      // Wounded but alive: enable persistent panic flag so they don't drift back.
      if (liveEntry && liveEntry.hp < liveEntry.maxHp) {
        off.panic = true;
      }

      const curX = spawnX + off.dx + off.wDx;
      const curZ = spawnZ + off.dz + off.wDz;

      const toPlayerX = curX - px;
      const toPlayerZ = curZ - pz;
      const distSq = toPlayerX * toPlayerX + toPlayerZ * toPlayerZ;

      // Always update live position so projectile hit tests can see them, even
      // when the grazer is offscreen and not animating.
      if (liveEntry) {
        liveEntry.x = curX;
        liveEntry.y = g.position[1];
        liveEntry.z = curZ;
      }

      // Skip distant grazers that aren't displaced
      const totalOffSq = off.dx * off.dx + off.dz * off.dz + off.wDx * off.wDx + off.wDz * off.wDz;
      if (distSq > ANIM_RANGE_SQ && totalOffSq < 1 && !off.panic) return;
      anyUpdated = true;

      // Hysteresis: enter flee at SCATTER_SQ, exit at SCATTER_EXIT_SQ to prevent flicker.
      // Panicked (shot at) animals stay fleeing until they recover stamina far from the player.
      if (off.panic) {
        off.fleeing = true;
      } else if (distSq < SCATTER_SQ) off.fleeing = true;
      else if (distSq > SCATTER_EXIT_SQ) off.fleeing = false;
      const isFleeing = off.fleeing;
      if (isFleeing) {
        fleeingNow++;
        off.stamina = Math.max(0, off.stamina - FATIGUE_RATE * dt);
        const dist = Math.sqrt(distSq) || 1;
        // Re-roll heading jitter every 1.5–2.5s so the herd fans out instead
        // of bolting on a straight line, without frame-by-frame flicker.
        if (time >= off.fleeJitterNext) {
          off.fleeJitter = (Math.random() * 2 - 1) * FLEE_JITTER;
          off.fleeJitterNext = time + 1.5 + Math.random() * 1.0;
        }
        const awayX = toPlayerX / dist;
        const awayZ = toPlayerZ / dist;
        const jc = Math.cos(off.fleeJitter);
        const js = Math.sin(off.fleeJitter);
        const fleeX = awayX * jc - awayZ * js;
        const fleeZ = awayX * js + awayZ * jc;
        const staminaMult = Math.max(MIN_STAMINA_SPEED, off.stamina);
        const stepX = fleeX * FLEE_SPEED * g.speedMult * staminaMult * dtScale;
        const stepZ = fleeZ * FLEE_SPEED * g.speedMult * staminaMult * dtScale;
        const move = resolveTerrainStep(
          spawnX + off.dx, spawnZ + off.dz, stepX, stepZ,
          GRAZER_TERRAIN.min, GRAZER_TERRAIN.max,
        );
        off.dx += move.dx;
        off.dz += move.dz;
      } else {
        off.stamina = Math.min(1, off.stamina + RECOVERY_RATE * dt);
        off.dx *= decay;
        off.dz *= decay;
      }

      // Player contact: if the player has actually caught up to an animal, snap it
      // out of overlap and flag a bump event (sound + toast, throttled below).
      const bumpSumR = BODY_RADIUS.grazer * g.scale + PLAYER_RADIUS;
      const push = computeCirclePush(curX, curZ, px, pz, bumpSumR);
      if (push && push.overlap > 0.05) {
        off.dx += push.px;
        off.dz += push.pz;
        playerBumped = true;
        bumpX = curX;
        bumpZ = curZ;
      }

      if (isFleeing && !haveFleeingSample) {
        haveFleeingSample = true;
        sampleFleeingX = curX;
        sampleFleeingZ = curZ;
      }

      // Static obstacle collision — trees/rocks deflect animals the same way
      // they deflect the player, so a fleeing herd can't stream through trunks.
      const obs = resolveObstaclePush(curX, curZ, BODY_RADIUS.grazer * g.scale);
      if (obs.hit) {
        off.dx += obs.px;
        off.dz += obs.pz;
      }

      // Clamp max flee distance
      const fleeDistSq = off.dx * off.dx + off.dz * off.dz;
      if (fleeDistSq > MAX_FLEE_SQ) {
        const clamp = MAX_FLEE_DIST / Math.sqrt(fleeDistSq);
        off.dx *= clamp;
        off.dz *= clamp;
      }

      // Wander — only when not fleeing, and only when close enough to actually be seen moving
      const nearPlayer = distSq < ANIM_RANGE_SQ;
      if (!isFleeing && nearPlayer) {
        if (time >= off.wNextChange) {
          if (Math.random() < WANDER_WALK_PROB) {
            const ang = Math.random() * Math.PI * 2;
            off.wDirX = Math.cos(ang);
            off.wDirZ = Math.sin(ang);
            off.wFacing = -Math.atan2(off.wDirZ, off.wDirX);
            off.wNextChange = time + 2.5 + Math.random() * 4; // walk for 2.5–6.5s
          } else {
            off.wDirX = 0;
            off.wDirZ = 0;
            off.wNextChange = time + 1.5 + Math.random() * 2.5; // graze for 1.5–4s
          }
        }
        // Smaller animals move faster — goats & sheep skitter, buffalo plod
        const wanderSpeed = WANDER_BASE_SPEED / g.scale;
        const wStepX = off.wDirX * wanderSpeed * dt;
        const wStepZ = off.wDirZ * wanderSpeed * dt;
        // Terrain-block wander too — grazers won't drift into the surf or up a cliff
        const wMove = resolveTerrainStep(
          spawnX + off.dx + off.wDx, spawnZ + off.dz + off.wDz, wStepX, wStepZ,
          GRAZER_TERRAIN.min, GRAZER_TERRAIN.max,
        );
        off.wDx += wMove.dx;
        off.wDz += wMove.dz;
        // Bound wander radius — turn around at boundary so they stay on their patch
        const wDistSq = off.wDx * off.wDx + off.wDz * off.wDz;
        if (wDistSq > WANDER_MAX_SQ) {
          const clamp = WANDER_MAX / Math.sqrt(wDistSq);
          off.wDx *= clamp;
          off.wDz *= clamp;
          // Reverse direction so they walk back inward
          off.wDirX = -off.wDirX;
          off.wDirZ = -off.wDirZ;
          if (off.wDirX !== 0 || off.wDirZ !== 0) off.wFacing = -Math.atan2(off.wDirZ, off.wDirX);
        }
      }

      const s = g.scale;
      const finalX = spawnX + off.dx + off.wDx;
      const finalZ = spawnZ + off.dz + off.wDz;
      // Record for pairwise separation (only nearby animals — far herds don't matter visually)
      if (nearPlayer) {
        nearIndices.push(i);
        posX.push(finalX);
        posZ.push(finalZ);
        radii.push(BODY_RADIUS.grazer * s);
      }
      const isWalking = (off.wDirX !== 0 || off.wDirZ !== 0) && !isFleeing;
      // Camels get a slow vertical undulation while walking — the pacing gait
      // (both legs on one side moving together) gives them a characteristic
      // rolling sway that other grazers don't have.
      const headBob = isFleeing
        ? 0
        : isWalking
          ? (kind === 'camel' ? Math.sin(time * 1.6 + i * 1.7) * 0.045 : 0)
          : Math.sin(time * 0.8 + i * 2.1) * 0.03;

      // Follow terrain so they don't float off the hill when fleeing or wandering.
      // Sampling only when displaced keeps the cost bounded to animals actually moving.
      // Foot offset scales with each instance's total scale so legs meet the ground regardless of size.
      const displaced = off.dx !== 0 || off.dz !== 0 || off.wDx !== 0 || off.wDz !== 0;
      const baseY = displaced ? getTerrainHeight(finalX, finalZ) + footOffset * s : g.position[1];
      dummy.position.set(finalX, baseY + headBob, finalZ);
      let facing: number;
      if (isFleeing && fleeDistSq > 0.5) {
        facing = -Math.atan2(off.dz, off.dx);
        off.wFacing = facing; // sync so transition out of flee is smooth
      } else {
        facing = off.wFacing;
      }
      dummy.rotation.set(0, facing, 0);
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);

      // Stamina bar — visible only while fleeing; sit flat on the ground at foot level
      const bar = staminaBarMeshRef.current;
      if (bar) {
        const footY = baseY - footOffset * s; // back off the pivot→foot offset
        setStaminaBarInstance(
          staminaBarDummyRef.current,
          finalX, footY, finalZ,
          s,
          off.stamina,
          isFleeing,
        );
        bar.setMatrixAt(i, staminaBarDummyRef.current.matrix);
        if (isFleeing) bar.setColorAt(i, staminaColor(off.stamina));
      }
    });

    if (anyUpdated) meshRef.current.instanceMatrix.needsUpdate = true;
    if (staminaBarMeshRef.current) {
      staminaBarMeshRef.current.instanceMatrix.needsUpdate = true;
      if (staminaBarMeshRef.current.instanceColor) staminaBarMeshRef.current.instanceColor.needsUpdate = true;
    }

    // Pairwise separation — prevents the herd from visually stacking up when
    // fleeing into a terrain corner or when multiple animals target the same
    // escape vector. Throttled to every ~0.3s to reduce O(n²) cost.
    separationAccumRef.current += dt;
    if (nearIndices.length > 1 && separationAccumRef.current >= 0.3) {
      separationAccumRef.current = 0;
      const localOffsets = nearIndices.map(idx => offsetsRef.current[idx]);
      separateHerd(localOffsets, posX, posZ, radii);
    }

    // Bump feedback: sound + toast when the player actually contacts a grazer.
    // Throttled so walking through a scattering herd doesn't spam notifications.
    if (playerBumped && time - lastBumpRef.current > 0.9) {
      lastBumpRef.current = time;
      sfxHoofbeats(bumpX, bumpZ);
      if (species) {
        useGameStore.getState().addNotification(species.name, 'info', {
          subtitle: `${species.latin} · startled by your approach`,
        });
      }
    }

    // Scatter SFX: fire when herd transitions from calm → spooked, throttled
    if (fleeingNow > fleeingCountRef.current && fleeingNow >= 2 && time - lastSfxRef.current > 1.2) {
      if (haveFleeingSample) sfxHoofbeats(sampleFleeingX, sampleFleeingZ);
      else sfxHoofbeats();
      lastSfxRef.current = time;
    }
    fleeingCountRef.current = fleeingNow;
  });

  if (data.length === 0) return null;

  return (
    <>
      <instancedMesh
        ref={meshRef}
        args={[geometry, material, data.length]}
        castShadow={shadowsActive}
        receiveShadow={shadowsActive}
        frustumCulled={false}
        onPointerDown={(e) => {
          if (!species) return;
          e.stopPropagation();
          useGameStore.getState().addNotification(species.name, 'info', {
            size: 'grand',
            subtitle: `${species.latin} · ${species.info}`,
          });
        }}
        onPointerOver={() => { if (species) document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { document.body.style.cursor = ''; }}
      />
      <instancedMesh
        ref={staminaBarMeshRef}
        args={[staminaBarGeometry, staminaBarMaterial, data.length]}
        frustumCulled={false}
        renderOrder={2}
      />
    </>
  );
}
