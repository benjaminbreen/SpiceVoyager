/**
 * Pedestrians.tsx — Instanced stick figure renderer
 *
 * Three figure types (man, woman, child) as separate InstancedMeshes.
 * Clothing colors are historically grounded for c. 1612 Indian Ocean world —
 * based on actual dye availability (indigo, madder, turmeric, lac, undyed cotton/linen).
 * Night walkers carry tiny emissive lanterns.
 */

import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { useGameStore, Culture } from '../store/gameStore';
import {
  PedestrianSystemState, FigureType,
  initPedestrianSystem, updatePedestrians,
} from '../utils/pedestrianSystem';

// ── Seeded PRNG ─────────────────────────────────────────────────────────────
function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

// Slight random variation on a base color
function vary(base: [number, number, number], rng: () => number, amt = 0.04): [number, number, number] {
  return [
    Math.max(0, Math.min(1, base[0] + (rng() - 0.5) * amt)),
    Math.max(0, Math.min(1, base[1] + (rng() - 0.5) * amt)),
    Math.max(0, Math.min(1, base[2] + (rng() - 0.5) * amt)),
  ];
}

// ── Historically accurate clothing palettes (c. 1612) ───────────────────────
// Colors based on actual available dyes and textile traditions of the period.
// Most common people wore undyed or minimally dyed cloth; vivid colors = wealth.

type ClothingEntry = { color: [number, number, number]; weight: number };

// Weighted color pools — higher weight = more common in the population
const CLOTHING: Record<Culture, Record<FigureType, ClothingEntry[]>> = {
  // ── EUROPEAN (Portuguese colonial — Goa, Macau, Mozambique) ───────────
  // Portuguese favored dark, sober colors influenced by Counter-Reformation austerity.
  // Common textiles: linen, wool, some imported silk. Dyes: woad/indigo, madder, logwood.
  'European': {
    man: [
      { color: [0.88, 0.82, 0.72], weight: 3 },  // undyed linen shirt — most common
      { color: [0.42, 0.36, 0.28], weight: 3 },  // brown wool doublet
      { color: [0.50, 0.48, 0.44], weight: 2 },  // grey wool
      { color: [0.18, 0.15, 0.12], weight: 2 },  // black — Jesuit cassock or merchant
      { color: [0.30, 0.18, 0.16], weight: 1 },  // dark ox-blood (madder + iron mordant)
      { color: [0.20, 0.28, 0.42], weight: 1 },  // dark blue (woad/indigo) — better-off
    ],
    woman: [
      { color: [0.82, 0.76, 0.66], weight: 3 },  // undyed linen chemise
      { color: [0.38, 0.32, 0.26], weight: 2 },  // dark brown dress
      { color: [0.20, 0.18, 0.15], weight: 2 },  // black (mourning or piety — very common)
      { color: [0.25, 0.22, 0.35], weight: 1 },  // deep purple-black (logwood)
      { color: [0.52, 0.28, 0.25], weight: 1 },  // madder red bodice
      { color: [0.22, 0.30, 0.48], weight: 1 },  // indigo blue
    ],
    child: [
      { color: [0.86, 0.80, 0.70], weight: 4 },  // undyed linen — hand-me-downs
      { color: [0.78, 0.72, 0.60], weight: 3 },  // faded cream
      { color: [0.48, 0.42, 0.34], weight: 2 },  // worn brown
      { color: [0.55, 0.50, 0.42], weight: 1 },  // patched grey
    ],
  },

  // ── INDIAN OCEAN (Malabar, Gujarat, Swahili coast, Arabian) ───────────
  // Rich textile traditions. India was the world's largest textile producer.
  // Key dyes: indigo (Indigofera), madder (Rubia), turmeric, lac, safflower.
  // White cotton was prestigious — fine muslin showed refinement.
  // Swahili coast: kanga cloth, imported Indian textiles.
  'Indian Ocean': {
    man: [
      { color: [0.92, 0.88, 0.80], weight: 4 },  // white cotton dhoti/lungi — most common
      { color: [0.86, 0.82, 0.72], weight: 3 },  // off-white unbleached cotton
      { color: [0.78, 0.72, 0.58], weight: 2 },  // light tan (natural cotton, unwashed)
      { color: [0.15, 0.22, 0.45], weight: 1 },  // deep indigo (dyed cotton — merchants)
      { color: [0.24, 0.40, 0.32], weight: 1 },  // green (Muslim traders — Sayyid status)
      { color: [0.88, 0.58, 0.14], weight: 1 },  // saffron/turmeric (Hindu religious)
    ],
    woman: [
      { color: [0.90, 0.86, 0.76], weight: 3 },  // white cotton sari — widows, Brahmin
      { color: [0.72, 0.20, 0.18], weight: 3 },  // madder red sari — most popular color
      { color: [0.85, 0.62, 0.12], weight: 2 },  // turmeric yellow
      { color: [0.14, 0.20, 0.48], weight: 2 },  // deep indigo
      { color: [0.62, 0.18, 0.35], weight: 1 },  // lac dye pink-crimson
      { color: [0.80, 0.40, 0.10], weight: 1 },  // safflower orange
    ],
    child: [
      { color: [0.90, 0.86, 0.78], weight: 4 },  // white cotton
      { color: [0.82, 0.78, 0.68], weight: 3 },  // off-white
      { color: [0.78, 0.58, 0.14], weight: 1 },  // turmeric-stained
      { color: [0.70, 0.25, 0.20], weight: 1 },  // faded madder red
    ],
  },

  // ── CARIBBEAN (Taíno, Spanish colonists, early African diaspora) ──────
  // Indigenous: cotton mantas, bark cloth. Spanish: imported European textiles.
  // Enslaved/free Africans: rough osnaburg, undyed cotton rations.
  // Dyes: annatto (achiote), logwood (Campeche), indigenous plant dyes.
  'Caribbean': {
    man: [
      { color: [0.72, 0.62, 0.48], weight: 3 },  // natural cotton manta
      { color: [0.55, 0.42, 0.28], weight: 3 },  // bark cloth brown
      { color: [0.82, 0.76, 0.64], weight: 2 },  // rough undyed linen (European import)
      { color: [0.40, 0.34, 0.26], weight: 2 },  // dark brown (logwood light dye)
      { color: [0.78, 0.52, 0.22], weight: 1 },  // annatto orange-red (indigenous)
      { color: [0.22, 0.20, 0.32], weight: 1 },  // logwood dark purple-black (Spanish)
    ],
    woman: [
      { color: [0.70, 0.60, 0.46], weight: 3 },  // natural cotton
      { color: [0.58, 0.46, 0.32], weight: 3 },  // bark cloth
      { color: [0.80, 0.74, 0.62], weight: 2 },  // undyed linen
      { color: [0.74, 0.48, 0.20], weight: 1 },  // annatto dyed
      { color: [0.45, 0.22, 0.18], weight: 1 },  // brazilwood red
      { color: [0.18, 0.22, 0.38], weight: 1 },  // indigo (traded from mainland)
    ],
    child: [
      { color: [0.74, 0.64, 0.50], weight: 4 },  // natural cotton
      { color: [0.68, 0.58, 0.44], weight: 3 },  // faded bark cloth
      { color: [0.80, 0.72, 0.58], weight: 2 },  // undyed linen
    ],
  },
};

// Culture-appropriate skin tone distributions
// Weighted to reflect the actual populations at each port type c. 1612
const SKIN_TONES: Record<Culture, { color: [number, number, number]; weight: number }[]> = {
  'European': [
    // Portuguese + mestiço + Indian converts + enslaved Africans in Goa etc.
    { color: [0.82, 0.68, 0.54], weight: 2 },  // lighter Portuguese
    { color: [0.72, 0.56, 0.42], weight: 3 },  // mestiço/mixed
    { color: [0.58, 0.44, 0.32], weight: 3 },  // Indian/South Asian
    { color: [0.45, 0.34, 0.25], weight: 2 },  // darker-skinned
  ],
  'Indian Ocean': [
    { color: [0.65, 0.50, 0.36], weight: 3 },  // South Asian
    { color: [0.55, 0.42, 0.30], weight: 3 },  // darker South Asian
    { color: [0.45, 0.35, 0.26], weight: 2 },  // East African (Swahili coast)
    { color: [0.72, 0.56, 0.40], weight: 1 },  // Arab/Persian traders
    { color: [0.38, 0.28, 0.20], weight: 1 },  // very dark (Dravidian, African)
  ],
  'Caribbean': [
    { color: [0.68, 0.48, 0.30], weight: 3 },  // Taíno/indigenous
    { color: [0.60, 0.42, 0.28], weight: 2 },  // indigenous
    { color: [0.45, 0.32, 0.22], weight: 2 },  // African
    { color: [0.38, 0.27, 0.18], weight: 2 },  // darker African
    { color: [0.78, 0.64, 0.50], weight: 1 },  // Spanish colonist
  ],
};

/** Pick from a weighted array */
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

// ── Figure geometries ───────────────────────────────────────────────────────

function createManGeometry(): THREE.BufferGeometry {
  const head = new THREE.SphereGeometry(0.15, 6, 4);
  head.translate(0, 1.55, 0);
  const body = new THREE.CylinderGeometry(0.12, 0.10, 0.85, 5, 1);
  body.translate(0, 1.02, 0);
  const leftLeg = new THREE.CylinderGeometry(0.07, 0.06, 0.6, 4, 1);
  leftLeg.translate(-0.08, 0.3, 0);
  const rightLeg = new THREE.CylinderGeometry(0.07, 0.06, 0.6, 4, 1);
  rightLeg.translate(0.08, 0.3, 0);
  const merged = mergeGeometries([head, body, leftLeg, rightLeg])!;
  head.dispose(); body.dispose(); leftLeg.dispose(); rightLeg.dispose();
  return merged;
}

function createWomanGeometry(): THREE.BufferGeometry {
  const head = new THREE.SphereGeometry(0.14, 6, 4);
  head.translate(0, 1.48, 0);
  const body = new THREE.CylinderGeometry(0.11, 0.10, 0.6, 5, 1);
  body.translate(0, 1.08, 0);
  // Skirt — wider cone shape below the torso
  const skirt = new THREE.CylinderGeometry(0.10, 0.22, 0.7, 6, 1);
  skirt.translate(0, 0.43, 0);
  const merged = mergeGeometries([head, body, skirt])!;
  head.dispose(); body.dispose(); skirt.dispose();
  return merged;
}

function createChildGeometry(): THREE.BufferGeometry {
  // Proportionally larger head, shorter body — reads as "child" even at distance
  const head = new THREE.SphereGeometry(0.13, 6, 4);
  head.translate(0, 0.98, 0);
  const body = new THREE.CylinderGeometry(0.09, 0.08, 0.5, 5, 1);
  body.translate(0, 0.65, 0);
  const leftLeg = new THREE.CylinderGeometry(0.05, 0.05, 0.38, 4, 1);
  leftLeg.translate(-0.06, 0.21, 0);
  const rightLeg = new THREE.CylinderGeometry(0.05, 0.05, 0.38, 4, 1);
  rightLeg.translate(0.06, 0.21, 0);
  const merged = mergeGeometries([head, body, leftLeg, rightLeg])!;
  head.dispose(); body.dispose(); leftLeg.dispose(); rightLeg.dispose();
  return merged;
}

function createLanternGeometry(): THREE.BufferGeometry {
  const lantern = new THREE.SphereGeometry(0.07, 4, 3);
  lantern.translate(0.18, 0.85, 0);
  return lantern;
}

// ── Component ───────────────────────────────────────────────────────────────

const MAX_PER_TYPE = 50; // max instances per figure type mesh

export function Pedestrians() {
  const ports = useGameStore(s => s.ports);
  const timeOfDay = useGameStore(s => s.timeOfDay);
  const worldSeed = useGameStore(s => s.worldSeed);

  const manRef = useRef<THREE.InstancedMesh>(null);
  const womanRef = useRef<THREE.InstancedMesh>(null);
  const childRef = useRef<THREE.InstancedMesh>(null);
  const lanternRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useRef(new THREE.Object3D());
  const systemRef = useRef<PedestrianSystemState | null>(null);
  const colorsNeedInit = useRef(true); // flag: colors not yet assigned to meshes

  const manGeo = useMemo(() => createManGeometry(), []);
  const womanGeo = useMemo(() => createWomanGeometry(), []);
  const childGeo = useMemo(() => createChildGeometry(), []);
  const lanternGeo = useMemo(() => createLanternGeometry(), []);

  const figureMat = useMemo(() => new THREE.MeshStandardMaterial({
    roughness: 0.85,
    metalness: 0.0,
  }), []);

  const lanternMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#ff8800',
    emissive: '#ff6600',
    emissiveIntensity: 2.0,
    roughness: 0.3,
  }), []);

  // Initialize pedestrian system (data only — no mesh access here)
  useEffect(() => {
    if (ports.length === 0) return;
    const port = ports[0];
    const system = initPedestrianSystem(
      port.buildings, port.culture, port.scale,
      port.position[0], port.position[2], worldSeed,
    );
    systemRef.current = system;
    colorsNeedInit.current = true; // mark for color assignment in useFrame
  }, [ports, worldSeed]);

  // Per-frame animation
  useFrame((state, delta) => {
    const system = systemRef.current;
    if (!system || !manRef.current || !womanRef.current || !childRef.current) return;

    // Assign per-instance colors on first frame when meshes are ready
    if (colorsNeedInit.current) {
      colorsNeedInit.current = false;
      const rng = mulberry32(worldSeed * 7 + 4231);
      const col = new THREE.Color();
      const clothingPool = CLOTHING[system.culture];
      const skinPool = SKIN_TONES[system.culture];
      const meshes = { man: manRef.current!, woman: womanRef.current!, child: childRef.current! };
      const counters = { man: 0, woman: 0, child: 0 };

      for (const p of system.pedestrians) {
        const mesh = meshes[p.figureType];
        const idx = counters[p.figureType]++;
        const clothing = vary(pickWeighted(clothingPool[p.figureType], rng).color, rng);
        const skin = vary(pickWeighted(skinPool, rng).color, rng);
        col.setRGB(
          clothing[0] * 0.78 + skin[0] * 0.22,
          clothing[1] * 0.78 + skin[1] * 0.22,
          clothing[2] * 0.78 + skin[2] * 0.22,
        );
        mesh.setColorAt(idx, col);
      }
      for (const mesh of Object.values(meshes)) {
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
    }

    const time = state.clock.elapsedTime;
    const hour = timeOfDay;
    const activeCount = updatePedestrians(system, time, delta, hour);
    const d = dummy.current;

    // Night check
    const sunAngle = ((hour - 6) / 24) * Math.PI * 2;
    const isNight = Math.sin(sunAngle) < 0.1;

    // Per-type counters
    let mc = 0, wc = 0, cc = 0, lc = 0;

    for (let i = 0; i < activeCount; i++) {
      const p = system.pedestrians[i];

      const bob = Math.sin(time * 6 + p.phase) * 0.04;
      const sway = Math.sin(time * 3 + p.phase) * 0.015;
      const tilt = p.corridorIdx >= 0 ? 0.06 : 0.03;

      d.position.set(p.x + sway, p.y + bob, p.z);
      d.rotation.set(tilt, p.angle, 0);
      d.scale.setScalar(1);
      d.updateMatrix();

      if (p.figureType === 'man') {
        manRef.current.setMatrixAt(mc++, d.matrix);
      } else if (p.figureType === 'woman') {
        womanRef.current.setMatrixAt(wc++, d.matrix);
      } else {
        childRef.current.setMatrixAt(cc++, d.matrix);
      }

      // Night lanterns (adults only)
      if (isNight && lanternRef.current && p.figureType !== 'child') {
        lanternRef.current.setMatrixAt(lc++, d.matrix);
      }
    }

    manRef.current.count = mc;
    womanRef.current.count = wc;
    childRef.current.count = cc;
    if (mc > 0) manRef.current.instanceMatrix.needsUpdate = true;
    if (wc > 0) womanRef.current.instanceMatrix.needsUpdate = true;
    if (cc > 0) childRef.current.instanceMatrix.needsUpdate = true;

    if (lanternRef.current) {
      lanternRef.current.count = lc;
      if (lc > 0) lanternRef.current.instanceMatrix.needsUpdate = true;
    }
  });

  if (ports.length === 0) return null;

  return (
    <>
      <instancedMesh ref={manRef} args={[manGeo, figureMat, MAX_PER_TYPE]} frustumCulled={false} />
      <instancedMesh ref={womanRef} args={[womanGeo, figureMat, MAX_PER_TYPE]} frustumCulled={false} />
      <instancedMesh ref={childRef} args={[childGeo, figureMat, MAX_PER_TYPE]} frustumCulled={false} />
      <instancedMesh ref={lanternRef} args={[lanternGeo, lanternMat, MAX_PER_TYPE]} frustumCulled={false} />
    </>
  );
}
