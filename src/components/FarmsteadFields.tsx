import { useMemo, useRef, useEffect } from 'react';
import * as THREE from 'three';
import { useGameStore, Building } from '../store/gameStore';
import { mergeCompatibleGeometries } from '../utils/geometryMerge';

// ── Farmstead crop fields ────────────────────────────────────────────────────
// Renders the actual crop around farmhouses whose `crop` was assigned by
// cityGenerator (one of: 'orange' | 'rice' | 'date'). Each crop type owns one
// or two InstancedMesh pools — geometry is shared across every farmstead in
// every visible port. The ring of instances is hollowed out around the hut
// itself so the building isn't buried in trees.
//
// Performance budget: a Huge port has ~20 farmsteads. With 16 trees / paddy
// tufts per plot that's ~320 instances per crop type per port, batched into a
// single draw call per geometry. Cheap relative to the existing forest pools.
//
// Visual goals: regular grid spacing reads as "farmland" from a distance,
// distinct from the irregular tree scatter the worldGeneration flora pool
// uses. Per-instance jitter stays under ~15% of spacing so the grid still
// reads, but the rows aren't mathematically perfect.

interface FarmInstance {
  position: [number, number, number];
  scale: number;
  rotation: number;
}

interface FieldData {
  oranges: FarmInstance[];
  rice: FarmInstance[];
  dates: FarmInstance[];
  /** One translucent water plane per rice paddy — drawn with a single
   *  InstancedMesh quad so we don't pay per-paddy plane overhead. */
  ricePaddies: { position: [number, number, number]; halfSize: number }[];
}

function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h >>> 0;
}

/** Lay out a regular NxN grid of instances within the plot, centered on the
 *  farmhouse, skipping cells that overlap the hut footprint. Per-instance
 *  jitter keeps rows from looking artificially perfect. */
function gridPlot(
  building: Building,
  rows: number,
  spacing: number,
  hutClearRadius: number,
  jitterFraction: number,
  scaleRange: [number, number],
): FarmInstance[] {
  if (!building.cropPlot) return [];
  const [cx, cy, cz] = building.position;
  const half = (rows - 1) * spacing * 0.5;
  const rng = mulberry32(hashStr(building.id) + 1);
  const out: FarmInstance[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < rows; c++) {
      const baseX = c * spacing - half;
      const baseZ = r * spacing - half;
      const jx = (rng() - 0.5) * spacing * jitterFraction;
      const jz = (rng() - 0.5) * spacing * jitterFraction;
      const x = cx + baseX + jx;
      const z = cz + baseZ + jz;
      // Keep clear of the hut so the building stays legible.
      if (Math.abs(baseX) < hutClearRadius && Math.abs(baseZ) < hutClearRadius) continue;
      const scale = scaleRange[0] + rng() * (scaleRange[1] - scaleRange[0]);
      const rotation = rng() * Math.PI * 2;
      out.push({ position: [x, cy, z], scale, rotation });
    }
  }
  return out;
}

/** Rice paddies want denser, smaller tufts in tighter rows than orchards. */
function riceRows(building: Building): FarmInstance[] {
  if (!building.cropPlot) return [];
  const [cx, cy, cz] = building.position;
  const rng = mulberry32(hashStr(building.id) + 2);
  const out: FarmInstance[] = [];
  const half = building.cropPlot.halfSize;
  const spacing = 0.7;
  const rows = Math.floor((half * 2) / spacing);
  const start = -((rows - 1) * spacing) / 2;
  const hutClear = 2.4;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < rows; c++) {
      const baseX = start + c * spacing;
      const baseZ = start + r * spacing;
      if (Math.abs(baseX) < hutClear && Math.abs(baseZ) < hutClear) continue;
      const jx = (rng() - 0.5) * spacing * 0.25;
      const jz = (rng() - 0.5) * spacing * 0.25;
      out.push({
        position: [cx + baseX + jx, cy, cz + baseZ + jz],
        scale: 0.55 + rng() * 0.35,
        rotation: rng() * Math.PI * 2,
      });
    }
  }
  return out;
}

export function FarmsteadFields() {
  const ports = useGameStore(s => s.ports);

  // ── Aggregate instance data across every port ──────────────────────────────
  const data = useMemo<FieldData>(() => {
    const oranges: FarmInstance[] = [];
    const rice: FarmInstance[] = [];
    const dates: FarmInstance[] = [];
    const ricePaddies: FieldData['ricePaddies'] = [];

    for (const port of ports) {
      for (const b of port.buildings) {
        if (b.type !== 'farmhouse' || !b.crop || !b.cropPlot) continue;
        if (b.crop === 'orange') {
          oranges.push(...gridPlot(b, 4, 2.4, 2.6, 0.12, [0.85, 1.15]));
        } else if (b.crop === 'date') {
          dates.push(...gridPlot(b, 4, 2.6, 2.6, 0.10, [0.9, 1.2]));
        } else if (b.crop === 'rice') {
          rice.push(...riceRows(b));
          ricePaddies.push({
            position: [b.position[0], b.position[1] - 0.05, b.position[2]],
            halfSize: b.cropPlot.halfSize,
          });
        }
      }
    }
    return { oranges, rice, dates, ricePaddies };
  }, [ports]);

  // ── Geometry (built once) ──────────────────────────────────────────────────
  const geos = useMemo(() => {
    // Orange tree — short trunk + rounded canopy with a sprinkle of small
    // orange dots merged into the canopy mesh so they read as fruit at range.
    const orangeTree = (() => {
      const parts: THREE.BufferGeometry[] = [];
      const trunk = new THREE.CylinderGeometry(0.08, 0.12, 0.9, 5, 1);
      trunk.translate(0, 0.45, 0);
      paint(trunk, [0.30, 0.22, 0.16]);
      parts.push(trunk);
      const canopy = new THREE.IcosahedronGeometry(0.85, 0);
      canopy.translate(0, 1.25, 0);
      paint(canopy, [0.18, 0.42, 0.15]);
      parts.push(canopy);
      // Fruit — a few small spheres baked in for color pop.
      const rng = mulberry32(101);
      for (let i = 0; i < 6; i++) {
        const a = rng() * Math.PI * 2;
        const r = 0.6 + rng() * 0.25;
        const y = 1.0 + rng() * 0.5;
        const fruit = new THREE.IcosahedronGeometry(0.10, 0);
        fruit.translate(Math.sin(a) * r, y, Math.cos(a) * r);
        paint(fruit, [0.95, 0.55, 0.15]);
        parts.push(fruit);
      }
      const merged = mergeCompatibleGeometries(parts) ?? new THREE.IcosahedronGeometry(1, 0);
      parts.forEach(g => g.dispose());
      merged.computeVertexNormals();
      return merged;
    })();

    // Date palm — straight short trunk + 6 cone "fronds" radiating out.
    const datePalm = (() => {
      const parts: THREE.BufferGeometry[] = [];
      const trunk = new THREE.CylinderGeometry(0.10, 0.16, 2.4, 5, 1);
      trunk.translate(0, 1.2, 0);
      paint(trunk, [0.42, 0.34, 0.22]);
      parts.push(trunk);
      // Crown — 7 plane-fronds drooping outward.
      for (let f = 0; f < 7; f++) {
        const angle = (f / 7) * Math.PI * 2;
        const frond = new THREE.PlaneGeometry(0.25, 1.4, 1, 3);
        const pos = frond.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          const y = pos.getY(i);
          const t = (y + 0.7) / 1.4;
          pos.setZ(i, -t * t * 0.45);
        }
        pos.needsUpdate = true;
        frond.rotateX(-0.5);
        frond.rotateY(angle);
        frond.translate(Math.sin(angle) * 0.2, 2.4, Math.cos(angle) * 0.2);
        paint(frond, [0.20, 0.45, 0.12]);
        parts.push(frond);
      }
      const merged = mergeCompatibleGeometries(parts) ?? new THREE.IcosahedronGeometry(1, 0);
      parts.forEach(g => g.dispose());
      merged.computeVertexNormals();
      return merged;
    })();

    // Rice tuft — a small cluster of green vertical quads. Cheap and reads
    // as "shoots" from any distance.
    const riceTuft = (() => {
      const parts: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.3;
        const blade = new THREE.PlaneGeometry(0.08, 0.45);
        blade.translate(0, 0.22, 0);
        blade.rotateY(a);
        blade.translate(Math.sin(a) * 0.05, 0, Math.cos(a) * 0.05);
        paint(blade, [0.45, 0.62, 0.22]);
        parts.push(blade);
      }
      const merged = mergeCompatibleGeometries(parts) ?? new THREE.PlaneGeometry(0.1, 0.4);
      parts.forEach(g => g.dispose());
      return merged;
    })();

    // Paddy water plane — single quad oriented flat. We use a ShapeGeometry-
    // free PlaneGeometry rotated to lie on Y=0 and scale per-instance to the
    // farm's plot half-size.
    const paddyWater = (() => {
      const g = new THREE.PlaneGeometry(1, 1);
      g.rotateX(-Math.PI / 2);
      return g;
    })();

    return { orangeTree, datePalm, riceTuft, paddyWater };
  }, []);

  // ── Materials ──────────────────────────────────────────────────────────────
  const mats = useMemo(() => {
    const veg = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.85,
      side: THREE.DoubleSide,
    });
    const water = new THREE.MeshStandardMaterial({
      color: '#2d5a6b',
      transparent: true,
      opacity: 0.55,
      roughness: 0.4,
      metalness: 0.1,
    });
    return { veg, water };
  }, []);

  // Dispose geometry/materials on unmount so swapping ports doesn't leak GPU.
  useEffect(() => {
    return () => {
      geos.orangeTree.dispose();
      geos.datePalm.dispose();
      geos.riceTuft.dispose();
      geos.paddyWater.dispose();
      mats.veg.dispose();
      mats.water.dispose();
    };
  }, [geos, mats]);

  // ── Instance refs ──────────────────────────────────────────────────────────
  const orangeRef = useRef<THREE.InstancedMesh>(null);
  const dateRef = useRef<THREE.InstancedMesh>(null);
  const riceRef = useRef<THREE.InstancedMesh>(null);
  const paddyRef = useRef<THREE.InstancedMesh>(null);

  useEffect(() => {
    const dummy = new THREE.Object3D();
    if (orangeRef.current) {
      data.oranges.forEach((it, i) => {
        dummy.position.set(...it.position);
        dummy.rotation.set(0, it.rotation, 0);
        dummy.scale.setScalar(it.scale);
        dummy.updateMatrix();
        orangeRef.current!.setMatrixAt(i, dummy.matrix);
      });
      orangeRef.current.instanceMatrix.needsUpdate = true;
    }
    if (dateRef.current) {
      data.dates.forEach((it, i) => {
        dummy.position.set(...it.position);
        dummy.rotation.set(0, it.rotation, 0);
        dummy.scale.setScalar(it.scale);
        dummy.updateMatrix();
        dateRef.current!.setMatrixAt(i, dummy.matrix);
      });
      dateRef.current.instanceMatrix.needsUpdate = true;
    }
    if (riceRef.current) {
      data.rice.forEach((it, i) => {
        dummy.position.set(...it.position);
        dummy.rotation.set(0, it.rotation, 0);
        dummy.scale.setScalar(it.scale);
        dummy.updateMatrix();
        riceRef.current!.setMatrixAt(i, dummy.matrix);
      });
      riceRef.current.instanceMatrix.needsUpdate = true;
    }
    if (paddyRef.current) {
      data.ricePaddies.forEach((it, i) => {
        dummy.position.set(it.position[0], it.position[1], it.position[2]);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(it.halfSize * 2, 1, it.halfSize * 2);
        dummy.updateMatrix();
        paddyRef.current!.setMatrixAt(i, dummy.matrix);
      });
      paddyRef.current.instanceMatrix.needsUpdate = true;
    }
  }, [data]);

  return (
    <group>
      {data.oranges.length > 0 && (
        <instancedMesh
          ref={orangeRef}
          args={[geos.orangeTree, mats.veg, data.oranges.length]}
          castShadow
          receiveShadow
          frustumCulled={false}
        />
      )}
      {data.dates.length > 0 && (
        <instancedMesh
          ref={dateRef}
          args={[geos.datePalm, mats.veg, data.dates.length]}
          castShadow
          receiveShadow
          frustumCulled={false}
        />
      )}
      {data.rice.length > 0 && (
        <instancedMesh
          ref={riceRef}
          args={[geos.riceTuft, mats.veg, data.rice.length]}
          frustumCulled={false}
        />
      )}
      {data.ricePaddies.length > 0 && (
        <instancedMesh
          ref={paddyRef}
          args={[geos.paddyWater, mats.water, data.ricePaddies.length]}
          frustumCulled={false}
        />
      )}
    </group>
  );
}

/** Bake a flat color into a geometry's vertex colors so we can keep all
 *  crop parts on a single MeshStandardMaterial with vertexColors=true.
 *  Same trick the orange canopy uses in useFloraAssets. */
function paint(geo: THREE.BufferGeometry, rgb: [number, number, number]) {
  const count = geo.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = rgb[0];
    colors[i * 3 + 1] = rgb[1];
    colors[i * 3 + 2] = rgb[2];
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}
