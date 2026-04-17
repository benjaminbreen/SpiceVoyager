import { useMemo, useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { getActivePlayerPos } from '../utils/livePlayerTransform';
import { getTerrainHeight } from '../utils/terrain';
import { useGameStore } from '../store/gameStore';
import { sfxHoofbeats } from '../audio/SoundEffects';

// ── Types ────────────────────────────────────────────────────────────────────
export interface GrazerEntry {
  position: [number, number, number];
  rotation: number;
  color: [number, number, number];
  scale: number;
  speedMult: number;
}

export interface SpeciesInfo {
  name: string;
  latin: string;
  info: string;
}

interface GrazerOffset {
  dx: number; dz: number;          // flee offset (pushed by player)
  wDx: number; wDz: number;        // wander offset (slow ambient walking)
  wDirX: number; wDirZ: number;    // current wander velocity unit vector (0,0 = paused, grazing)
  wFacing: number;                  // remembered facing while paused
  wNextChange: number;              // clock time to repick direction
}

// ── Constants ────────────────────────────────────────────────────────────────
export type GrazerKind = 'antelope' | 'deer' | 'goat' | 'camel' | 'sheep' | 'bovine' | 'pig' | 'capybara';

const SCATTER_SQ = 14 * 14;      // spook radius — player must get fairly close before they bolt
// Player walks at 10 u/s; flee base = 0.10 * 60 = 6 u/s, with speedMult 0.7–1.3 → ~4.2–7.8 u/s.
// Slower than the player in all cases, so you can catch up if you chase.
const FLEE_SPEED = 0.10;
const RETURN_DECAY = 0.985;       // how fast they drift back to spawn
const MAX_FLEE_DIST = 40;
const MAX_FLEE_SQ = MAX_FLEE_DIST * MAX_FLEE_DIST;
const ANIM_RANGE_SQ = 120 * 120;
const Y_OFFSET = 0.2;             // hover height above terrain to avoid z-fighting on hooves
// Wander tuning — bounded ambient motion so herds don't drift off their patch
const WANDER_MAX = 5;
const WANDER_MAX_SQ = WANDER_MAX * WANDER_MAX;
const WANDER_BASE_SPEED = 0.45;   // units/sec for a scale=1.0 animal; divided by scale for smaller animals
const WANDER_WALK_PROB = 0.65;    // 65% pick new walk direction, 35% pause to graze

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

  // Body
  const body = new THREE.SphereGeometry(p.bodyR, 12, 8);
  body.scale(p.bodyScale[0], p.bodyScale[1], p.bodyScale[2]);
  parts.push(body);

  if (p.fluff) {
    // Extra wool bumps on a sheep body
    const bumpPositions: [number, number, number][] = [
      [0.2, 0.18, 0.15], [0.2, 0.18, -0.15], [-0.1, 0.22, 0.15], [-0.1, 0.22, -0.15],
      [-0.25, 0.14, 0.05], [0.05, 0.25, 0], [-0.18, 0.0, 0.22], [-0.18, 0.0, -0.22],
    ];
    for (const [x, y, z] of bumpPositions) {
      const bump = new THREE.SphereGeometry(0.13, 6, 5);
      bump.translate(x, y, z);
      parts.push(bump);
    }
  }

  if (p.shoulderHump) {
    const shoulder = new THREE.SphereGeometry(0.19, 8, 6);
    shoulder.scale(1.0, 0.85, 1.0);
    shoulder.translate(0.18, 0.18, 0);
    parts.push(shoulder);
  }

  if (p.hump) {
    // Single dromedary hump centered above back
    const hump = new THREE.SphereGeometry(0.22, 10, 7);
    hump.scale(1.2, 1.0, 0.9);
    hump.translate(0.05, 0.28, 0);
    parts.push(hump);
  }

  // Neck
  const neck = new THREE.CylinderGeometry(p.neckRFront, p.neckRBack, p.neckLen, 8);
  neck.rotateZ(p.neckTilt);
  // Position neck so top end meets head, bottom sits at front of body
  const neckCos = Math.cos(p.neckTilt);
  const neckSin = Math.sin(p.neckTilt);
  const neckMidX = 0.28 + Math.abs(neckSin) * p.neckLen * 0.5;
  const neckMidY = 0.08 + neckCos * p.neckLen * 0.5;
  neck.translate(neckMidX, neckMidY, 0);
  parts.push(neck);

  // Head
  const head = new THREE.SphereGeometry(p.headR, 10, 7);
  head.scale(p.headScale[0], p.headScale[1], p.headScale[2]);
  head.translate(p.headOffset[0], p.headOffset[1], 0);
  parts.push(head);

  // Muzzle (optional — skip for sheep/capybara with rounded faces by setting muzzleR=0)
  if (p.muzzleR > 0) {
    const muzzle = new THREE.SphereGeometry(p.muzzleR, 6, 5);
    muzzle.scale(p.muzzleScale[0], p.muzzleScale[1], p.muzzleScale[2]);
    muzzle.translate(p.muzzleOffset[0], p.muzzleOffset[1], 0);
    parts.push(muzzle);
  }

  // Ears
  if (p.earR > 0) {
    const earL = new THREE.ConeGeometry(p.earR, p.earH, 5);
    earL.rotateX(-p.earAngle);
    earL.rotateZ(-0.3);
    earL.translate(p.headOffset[0] - 0.01, p.headOffset[1] + 0.1, 0.07);
    parts.push(earL);
    const earR = new THREE.ConeGeometry(p.earR, p.earH, 5);
    earR.rotateX(p.earAngle);
    earR.rotateZ(-0.3);
    earR.translate(p.headOffset[0] - 0.01, p.headOffset[1] + 0.1, -0.07);
    parts.push(earR);
  }

  // Horns
  if (p.hornKind !== 'none') {
    const hornBaseX = p.headOffset[0];
    const hornBaseY = p.headOffset[1] + 0.12;
    const hornR = 0.022;
    const addHorn = (side: 1 | -1) => {
      if (p.hornKind === 'straight') {
        const h = new THREE.CylinderGeometry(hornR * 0.6, hornR, p.hornLen, 5);
        h.rotateX(0.25 * side);
        h.translate(hornBaseX, hornBaseY + p.hornLen * 0.5, 0.05 * side);
        parts.push(h);
      } else if (p.hornKind === 'curved') {
        // Two-segment curved horn (impala lyre / goat)
        const seg1 = new THREE.CylinderGeometry(hornR, hornR, p.hornLen * 0.55, 5);
        seg1.rotateX(0.35 * side);
        seg1.translate(hornBaseX, hornBaseY + p.hornLen * 0.25, 0.05 * side);
        parts.push(seg1);
        const seg2 = new THREE.CylinderGeometry(hornR * 0.6, hornR * 0.9, p.hornLen * 0.55, 5);
        seg2.rotateX(-0.15 * side);
        seg2.rotateZ(-0.2);
        seg2.translate(hornBaseX - 0.02, hornBaseY + p.hornLen * 0.75, 0.1 * side);
        parts.push(seg2);
      } else if (p.hornKind === 'spiral') {
        // Springbok-ish straight-ish with slight outward flare
        const h = new THREE.CylinderGeometry(hornR * 0.55, hornR, p.hornLen, 5);
        h.rotateX(0.18 * side);
        h.rotateZ(-0.15);
        h.translate(hornBaseX, hornBaseY + p.hornLen * 0.5, 0.05 * side);
        parts.push(h);
      } else if (p.hornKind === 'buffalo') {
        // Wide, low, thick horns sweeping out then curving up
        const seg1 = new THREE.CylinderGeometry(0.035, 0.045, p.hornLen * 0.6, 6);
        seg1.rotateZ(Math.PI / 2);
        seg1.rotateY(0.4 * side);
        seg1.translate(hornBaseX - 0.02, hornBaseY - 0.02, p.hornLen * 0.3 * side);
        parts.push(seg1);
        const seg2 = new THREE.CylinderGeometry(0.025, 0.035, p.hornLen * 0.45, 6);
        seg2.rotateX(0.7 * side);
        seg2.translate(hornBaseX - 0.03, hornBaseY + 0.08, p.hornLen * 0.6 * side);
        parts.push(seg2);
      } else if (p.hornKind === 'branched') {
        // Simple forked antler — vertical main + two short prongs
        const main = new THREE.CylinderGeometry(hornR * 0.6, hornR, p.hornLen, 5);
        main.rotateX(0.2 * side);
        main.translate(hornBaseX, hornBaseY + p.hornLen * 0.5, 0.06 * side);
        parts.push(main);
        const prongF = new THREE.CylinderGeometry(hornR * 0.4, hornR * 0.6, p.hornLen * 0.4, 4);
        prongF.rotateZ(-0.9);
        prongF.translate(hornBaseX + 0.08, hornBaseY + p.hornLen * 0.75, 0.06 * side);
        parts.push(prongF);
        const prongB = new THREE.CylinderGeometry(hornR * 0.4, hornR * 0.6, p.hornLen * 0.35, 4);
        prongB.rotateZ(0.9);
        prongB.translate(hornBaseX - 0.08, hornBaseY + p.hornLen * 0.7, 0.06 * side);
        parts.push(prongB);
      }
    };
    addHorn(1);
    addHorn(-1);
  }

  // Legs + hooves
  const legPositions: [number, number, number][] = [
    [0.22, -p.legLen * 0.5, 0.13],
    [0.22, -p.legLen * 0.5, -0.13],
    [-0.24, -p.legLen * 0.5, 0.13],
    [-0.24, -p.legLen * 0.5, -0.13],
  ];
  for (const [x, y, z] of legPositions) {
    const leg = new THREE.CylinderGeometry(p.legR, p.legR * 0.72, p.legLen, 6);
    leg.translate(x, y, z);
    parts.push(leg);
    const hoof = new THREE.CylinderGeometry(p.hoofR, p.hoofR * 0.75, 0.05, 6);
    hoof.translate(x, y - p.legLen * 0.5 - 0.02, z);
    parts.push(hoof);
  }

  // Tail
  if (p.tailH > 0) {
    const tail = new THREE.ConeGeometry(p.tailR, p.tailH, 5);
    tail.rotateX(p.tailTilt);
    tail.translate(p.tailOffset[0], p.tailOffset[1], 0);
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
      bodyR: 0.3, bodyScale: [1.5, 0.78, 0.78],
      legLen: 0.68, legR: 0.032, hoofR: 0.045,
      neckLen: 0.42, neckRFront: 0.08, neckRBack: 0.11, neckTilt: -1.15,
      headOffset: [0.6, 0.55], headScale: [1.4, 0.85, 0.75], headR: 0.11,
      muzzleOffset: [0.73, 0.5], muzzleR: 0.07, muzzleScale: [1.2, 0.75, 0.8],
      earAngle: 0.3, earR: 0.025, earH: 0.06, // small ears
      tailOffset: [-0.48, 0.1], tailR: 0.022, tailH: 0.2, tailTilt: 0.3,
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
  const lastTimeRef = useRef(0);
  const fleeingCountRef = useRef(0);
  const lastSfxRef = useRef(0);

  const geometry = useMemo(() => buildGeometryForKind(kind ?? 'antelope'), [kind]);

  const material = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.85,
    metalness: 0.0,
  }), []);

  // Init offsets + set initial matrices and per-instance colors
  useEffect(() => {
    offsetsRef.current = data.map((g) => ({
      dx: 0, dz: 0,
      wDx: 0, wDz: 0,
      wDirX: 0, wDirZ: 0,
      wFacing: g.rotation,
      wNextChange: Math.random() * 3, // stagger initial direction change so herd doesn't move in sync
    }));
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
  }, [data]);

  // Scatter + wander animation
  useFrame(({ clock }) => {
    if (!meshRef.current || offsetsRef.current.length !== data.length) return;
    const time = clock.getElapsedTime();
    const dt = Math.min(0.1, time - lastTimeRef.current);
    lastTimeRef.current = time;
    const dummy = dummyRef.current;
    const playerPos = getActivePlayerPos();
    const px = playerPos[0];
    const pz = playerPos[2];
    let anyUpdated = false;
    const dtScale = dt * 60; // preserve 60fps-tuned constants
    const decay = Math.pow(RETURN_DECAY, dtScale);
    let fleeingNow = 0;

    data.forEach((g, i) => {
      const spawnX = g.position[0];
      const spawnZ = g.position[2];
      const off = offsetsRef.current[i];
      const curX = spawnX + off.dx + off.wDx;
      const curZ = spawnZ + off.dz + off.wDz;

      const toPlayerX = curX - px;
      const toPlayerZ = curZ - pz;
      const distSq = toPlayerX * toPlayerX + toPlayerZ * toPlayerZ;

      // Skip distant grazers that aren't displaced
      const totalOffSq = off.dx * off.dx + off.dz * off.dz + off.wDx * off.wDx + off.wDz * off.wDz;
      if (distSq > ANIM_RANGE_SQ && totalOffSq < 1) return;
      anyUpdated = true;

      const isFleeing = distSq < SCATTER_SQ;
      if (isFleeing) {
        fleeingNow++;
        const dist = Math.sqrt(distSq) || 1;
        off.dx += (toPlayerX / dist) * FLEE_SPEED * g.speedMult * dtScale;
        off.dz += (toPlayerZ / dist) * FLEE_SPEED * g.speedMult * dtScale;
      } else {
        off.dx *= decay;
        off.dz *= decay;
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
        off.wDx += off.wDirX * wanderSpeed * dt;
        off.wDz += off.wDirZ * wanderSpeed * dt;
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
      const isWalking = (off.wDirX !== 0 || off.wDirZ !== 0) && !isFleeing;
      const headBob = isFleeing || isWalking ? 0 : Math.sin(time * 0.8 + i * 2.1) * 0.03;

      // Follow terrain so they don't float off the hill when fleeing or wandering.
      // Sampling only when displaced keeps the cost bounded to animals actually moving.
      const displaced = off.dx !== 0 || off.dz !== 0 || off.wDx !== 0 || off.wDz !== 0;
      const baseY = displaced ? getTerrainHeight(finalX, finalZ) + Y_OFFSET : g.position[1];
      dummy.position.set(finalX, baseY + headBob, finalZ);
      let facing: number;
      if (isFleeing && fleeDistSq > 0.5) {
        facing = -Math.atan2(off.dz, off.dx);
      } else if (isWalking) {
        facing = off.wFacing;
      } else {
        facing = off.wFacing; // hold last walking direction while grazing
      }
      dummy.rotation.set(0, facing, 0);
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);
    });

    if (anyUpdated) meshRef.current.instanceMatrix.needsUpdate = true;

    // Scatter SFX: fire when herd transitions from calm → spooked, throttled
    if (fleeingNow > fleeingCountRef.current && fleeingNow >= 2 && time - lastSfxRef.current > 1.2) {
      sfxHoofbeats();
      lastSfxRef.current = time;
    }
    fleeingCountRef.current = fleeingNow;
  });

  if (data.length === 0) return null;

  return (
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
  );
}
