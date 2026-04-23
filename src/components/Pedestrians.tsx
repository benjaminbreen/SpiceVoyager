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
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore, Culture } from '../store/gameStore';
import {
  PedestrianSystemState, FigureType,
  initPedestrianSystem, updatePedestrians,
} from '../utils/pedestrianSystem';
import { syncLivePedestrians, clearLivePedestrians } from '../utils/livePedestrians';
import {
  BodyArchetype, HeadwearType, ArmType, PropType, VisualProfile,
  BODY_ARCHETYPES, HEADWEAR_TYPES, ARM_TYPES, PROP_TYPES, HEAD_TOP_Y,
  ARCHETYPE_SHOULDER,
  createBodyGeometry, createHeadGeometry, createHeadwearGeometry,
  createArmGeometry, createPropGeometry,
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

function vary(base: [number, number, number], rng: () => number, amt = 0.04): [number, number, number] {
  return [
    Math.max(0, Math.min(1, base[0] + (rng() - 0.5) * amt)),
    Math.max(0, Math.min(1, base[1] + (rng() - 0.5) * amt)),
    Math.max(0, Math.min(1, base[2] + (rng() - 0.5) * amt)),
  ];
}

const SKIN_TONES: Record<Culture, { color: [number, number, number]; weight: number }[]> = {
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

function createLanternGeometry(): THREE.BufferGeometry {
  const lantern = new THREE.SphereGeometry(0.08, 5, 4);
  lantern.translate(0.22, 1.05, 0);
  return lantern;
}

// ── Component ───────────────────────────────────────────────────────────────

const MAX_PER_MESH = 160; // ample headroom; arm meshes take 2 slots per ped
const FIGURE_TYPES: FigureType[] = ['man', 'woman', 'child'];

export function Pedestrians() {
  const ports = useGameStore(s => s.ports);
  const timeOfDay = useGameStore(s => s.timeOfDay);
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
  const lanternRef = useRef<THREE.InstancedMesh>(null);

  const dummy = useRef(new THREE.Object3D());
  const scratchMat = useRef(new THREE.Matrix4());
  const scratchLocal = useRef(new THREE.Matrix4());
  const scratchPos = useRef(new THREE.Vector3());
  const scratchQuat = useRef(new THREE.Quaternion());
  const scratchScale = useRef(new THREE.Vector3(1, 1, 1));
  const scratchEuler = useRef(new THREE.Euler(0, 0, 0, 'XYZ'));

  const systemRef = useRef<PedestrianSystemState | null>(null);
  const profilesRef = useRef<VisualProfile[]>([]);
  const colorsNeedInit = useRef(true);
  const animAccumRef = useRef(0);
  const livePedXs = useRef<Float32Array>(new Float32Array(256));
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
  const propGeos = useMemo(() => {
    const m = {} as Record<Exclude<PropType, 'none'>, THREE.BufferGeometry>;
    for (const p of PROP_TYPES) m[p] = createPropGeometry(p);
    return m;
  }, []);
  const lanternGeo = useMemo(() => createLanternGeometry(), []);

  const bodyMat = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.88, metalness: 0 }), []);
  const skinMat = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.75, metalness: 0 }), []);
  const headwearMat = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.80, metalness: 0 }), []);
  const armMat = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0 }), []);
  const propMat = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.90, metalness: 0 }), []);
  const lanternMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#ff8800', emissive: '#ff6600', emissiveIntensity: 2.0, roughness: 0.3,
  }), []);

  useEffect(() => {
    if (ports.length === 0) return;
    const port = ports[0];
    const system = initPedestrianSystem(
      port.buildings, port.culture, port.scale,
      port.position[0], port.position[2], worldSeed,
      port.roads,
    );
    systemRef.current = system;
    clearLivePedestrians();

    const rng = mulberry32(worldSeed * 31 + 7717);
    profilesRef.current = system.pedestrians.map(p =>
      assignVisualProfile(system.culture, p.figureType, p.type, rng),
    );
    colorsNeedInit.current = true;
  }, [ports, worldSeed]);

  useFrame((state, delta) => {
    const system = systemRef.current;
    if (!system) return;
    const profiles = profilesRef.current;

    // ── Color initialization (once, after meshes are ready) ───────────────
    if (colorsNeedInit.current) {
      let allReady = true;
      for (const a of BODY_ARCHETYPES) if (!bodyRefs.current[a]) { allReady = false; break; }
      for (const f of FIGURE_TYPES) if (!headRefs.current[f]) { allReady = false; break; }
      for (const a of ARM_TYPES) if (!armRefs.current[a]) { allReady = false; break; }
      if (!allReady) return;

      const rng = mulberry32(worldSeed * 7 + 4231);
      const col = new THREE.Color();
      const skinPool = SKIN_TONES[system.culture];

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

      for (let i = 0; i < system.pedestrians.length; i++) {
        const p = system.pedestrians[i];
        const prof = profiles[i];
        const rig = ARCHETYPE_SHOULDER[prof.body];

        // Body
        const clothing = vary(pickWeighted(CLOTHING_BY_ARCHETYPE[prof.body], rng).color, rng);
        col.setRGB(clothing[0], clothing[1], clothing[2]);
        bodyRefs.current[prof.body]!.setColorAt(bodyCounters[prof.body]++, col);

        // Head (skin)
        const skin = vary(pickWeighted(skinPool, rng).color, rng);
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

        // Headwear
        if (prof.headwear !== 'none') {
          const hw = prof.headwear;
          const mesh = headwearRefs.current[hw];
          if (mesh) {
            const hwColor = vary(pickWeighted(HEADWEAR_COLORS[hw], rng).color, rng);
            col.setRGB(hwColor[0], hwColor[1], hwColor[2]);
            mesh.setColorAt(hwCounters[hw]++, col);
          }
        }

        // Prop
        if (prof.prop !== 'none') {
          const pp = prof.prop;
          const mesh = propRefs.current[pp];
          if (mesh) {
            const pc = vary(pickWeighted(PROP_COLORS[pp], rng).color, rng);
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

      colorsNeedInit.current = false;
    }

    // ── Throttle main update to ~20fps (arm swing reads fine at this rate) ─
    animAccumRef.current += delta;
    if (animAccumRef.current < 1 / 20) return;
    const dt = Math.min(0.1, animAccumRef.current);
    animAccumRef.current = 0;

    const time = state.clock.elapsedTime;
    const hour = timeOfDay;
    const activeCount = updatePedestrians(system, time, dt, hour);

    // Publish live positions for Player collision. Only the active slice moves;
    // inactive peds stay parked off-screen so they won't be reached by the scan.
    const pxs = livePedXs.current;
    const pzs = livePedZs.current;
    const pubCount = Math.min(activeCount, pxs.length);
    for (let i = 0; i < pubCount; i++) {
      pxs[i] = system.pedestrians[i].x;
      pzs[i] = system.pedestrians[i].z;
    }
    syncLivePedestrians(pubCount, pxs, pzs);

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
    let lanternCount = 0;

    const armMatW = scratchMat.current;
    const armLocal = scratchLocal.current;
    const armPos = scratchPos.current;
    const armQuat = scratchQuat.current;
    const armScale = scratchScale.current;
    const armEuler = scratchEuler.current;

    for (let i = 0; i < activeCount; i++) {
      const p = system.pedestrians[i];
      const prof = profiles[i];
      const rig = ARCHETYPE_SHOULDER[prof.body];

      // When dwelling, suppress sway/bob slightly and zero the arm swing.
      const motionGate = p.isDwelling ? 0.2 : 1.0;
      const bob = Math.sin(time * 6 + p.phase) * 0.04 * motionGate;
      const sway = Math.sin(time * 3 + p.phase) * 0.015 * motionGate;
      const tilt = p.corridorIdx >= 0 && !p.isDwelling ? 0.06 : 0.03;

      d.position.set(p.x + sway, p.y + bob, p.z);
      d.rotation.set(tilt, p.angle, 0);
      d.scale.setScalar(1);
      d.updateMatrix();

      // Body
      const bodyMesh = bodyRefs.current[prof.body];
      if (bodyMesh) bodyMesh.setMatrixAt(bodyCounts[prof.body]++, d.matrix);

      // Head
      const headMesh = headRefs.current[p.figureType];
      if (headMesh) headMesh.setMatrixAt(headCounts[p.figureType]++, d.matrix);

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
          armMatW.multiplyMatrices(d.matrix, armLocal);
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
    if (lanternRef.current) {
      lanternRef.current.count = lanternCount;
      if (lanternCount > 0) lanternRef.current.instanceMatrix.needsUpdate = true;
    }
  });

  if (ports.length === 0) return null;

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
    </>
  );
}
