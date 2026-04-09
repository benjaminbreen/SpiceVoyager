import { useMemo, useRef, useEffect } from 'react';
import * as THREE from 'three';
import { useGameStore } from '../store/gameStore';

interface Part {
  geo: 'box' | 'cylinder' | 'cone' | 'sphere';
  mat: 'white' | 'mud' | 'wood' | 'terracotta' | 'stone' | 'straw' | 'road_dirt' | 'road_stone' | 'dark';
  pos: [number, number, number];
  scale: [number, number, number];
  rot: [number, number, number];
  color?: [number, number, number]; // per-instance RGB override
}

// Simple seeded random for deterministic color variation
function mulberry32(a: number) {
  return function() {
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// Base colors for each material - used to create per-instance variation
const BASE_COLORS: Record<string, [number, number, number]> = {
  white: [0.94, 0.94, 0.94],
  mud: [0.76, 0.63, 0.47],
  wood: [0.36, 0.25, 0.20],
  terracotta: [0.80, 0.36, 0.36],
  stone: [0.53, 0.53, 0.53],
  straw: [0.83, 0.75, 0.48],
  road_dirt: [0.55, 0.45, 0.33],
  road_stone: [0.48, 0.48, 0.45],
  dark: [0.12, 0.10, 0.08],
};

function varyColor(base: [number, number, number], rng: () => number, amount = 0.08): [number, number, number] {
  return [
    Math.max(0, Math.min(1, base[0] + (rng() - 0.5) * amount)),
    Math.max(0, Math.min(1, base[1] + (rng() - 0.5) * amount)),
    Math.max(0, Math.min(1, base[2] + (rng() - 0.5) * amount)),
  ];
}

export function ProceduralCity() {
  const { ports } = useGameStore();

  const parts = useMemo(() => {
    const allParts: Part[] = [];

    ports.forEach(port => {
      port.buildings.forEach((b, bi) => {
        const [w, h, d] = b.scale;
        const [x, y, z] = b.position;
        const rot = b.rotation;
        const c = port.culture;
        // Per-building seeded RNG for deterministic variation
        const rng = mulberry32(bi * 7919 + (x * 1000 | 0) + (z * 31 | 0));

        const addPart = (geo: Part['geo'], mat: Part['mat'], lx: number, ly: number, lz: number, sw: number, sh: number, sd: number, colorOverride?: [number, number, number]) => {
          const rx = lx * Math.cos(rot) - lz * Math.sin(rot);
          const rz = lx * Math.sin(rot) + lz * Math.cos(rot);
          allParts.push({
            geo, mat,
            pos: [x + rx, y + ly, z + rz],
            scale: [sw, sh, sd],
            rot: [0, rot, 0],
            color: colorOverride ?? varyColor(BASE_COLORS[mat], rng),
          });
        };

        if (b.type === 'road') {
          const roadMat = c === 'European' ? 'road_stone' : 'road_dirt';
          addPart('box', roadMat, 0, 0, 0, w, h, d);
        }
        else if (b.type === 'dock') {
          const deckColor = varyColor(BASE_COLORS.wood, rng, 0.06);
          addPart('box', 'wood', 0, 0, 0, w, 0.2, d, deckColor);
          const pileColor = varyColor(BASE_COLORS.wood, rng, 0.1);
          addPart('cylinder', 'wood', w/2-0.2, -1, d/2-0.2, 0.2, 3, 0.2, pileColor);
          addPart('cylinder', 'wood', -w/2+0.2, -1, d/2-0.2, 0.2, 3, 0.2, pileColor);
          addPart('cylinder', 'wood', w/2-0.2, -1, -d/2+0.2, 0.2, 3, 0.2, pileColor);
          addPart('cylinder', 'wood', -w/2+0.2, -1, -d/2+0.2, 0.2, 3, 0.2, pileColor);
          // Mooring posts
          addPart('cylinder', 'wood', w/2, 0.4, 0, 0.12, 0.8, 0.12);
          addPart('cylinder', 'wood', -w/2, 0.4, 0, 0.12, 0.8, 0.12);
          // Crates on dock
          const crateColor = varyColor(BASE_COLORS.wood, rng, 0.12);
          addPart('box', 'wood', w/4, 0.4, d/4, 0.5, 0.5, 0.5, crateColor);
          addPart('box', 'wood', -w/4, 0.4, -d/4, 0.4, 0.4, 0.4, varyColor(BASE_COLORS.wood, rng, 0.12));
        }
        else if (b.type === 'fort') {
          const mat = c === 'Indian Ocean' ? 'mud' : 'stone';
          const wallColor = varyColor(BASE_COLORS[mat], rng, 0.06);
          addPart('box', mat, 0, h/2, 0, w, h, d, wallColor);
          // Corner towers
          const towerColor = varyColor(BASE_COLORS[mat], rng, 0.04);
          addPart('cylinder', mat, w/2, h/2+1, d/2, 1.5, h+2, 1.5, towerColor);
          addPart('cylinder', mat, -w/2, h/2+1, d/2, 1.5, h+2, 1.5, towerColor);
          addPart('cylinder', mat, w/2, h/2+1, -d/2, 1.5, h+2, 1.5, towerColor);
          addPart('cylinder', mat, -w/2, h/2+1, -d/2, 1.5, h+2, 1.5, towerColor);
          // Gate
          addPart('box', 'dark', 0, h*0.35, d/2+0.05, 2.5, h*0.6, 0.15);
          // Battlements on top (small blocks)
          for (let bx = -w/2 + 1; bx <= w/2 - 1; bx += 2) {
            addPart('box', mat, bx, h + 0.5, d/2, 0.6, 1, 0.6, towerColor);
            addPart('box', mat, bx, h + 0.5, -d/2, 0.6, 1, 0.6, towerColor);
          }
        }
        else if (b.type === 'market') {
          addPart('box', 'wood', 0, 0.2, 0, w, 0.4, d);
          addPart('cylinder', 'wood', w/2-0.5, h/2, d/2-0.5, 0.3, h, 0.3);
          addPart('cylinder', 'wood', -w/2+0.5, h/2, d/2-0.5, 0.3, h, 0.3);
          addPart('cylinder', 'wood', w/2-0.5, h/2, -d/2+0.5, 0.3, h, 0.3);
          addPart('cylinder', 'wood', -w/2+0.5, h/2, -d/2+0.5, 0.3, h, 0.3);

          if (c === 'Indian Ocean') {
            addPart('sphere', 'mud', 0, h, 0, w/2, w/2, d/2);
          } else if (c === 'European') {
            addPart('cone', 'terracotta', 0, h+1, 0, w/1.5, 2, d/1.5);
          } else {
            addPart('cone', 'wood', 0, h+1, 0, w/1.5, 2, d/1.5);
          }
          // Awnings hanging from pillars
          const awningColor = varyColor(c === 'Indian Ocean' ? [0.72, 0.22, 0.15] : BASE_COLORS.straw, rng, 0.12);
          addPart('box', 'straw', w/2-0.5, h*0.55, 0, 1.2, 0.08, d*0.7, awningColor);
          addPart('box', 'straw', -w/2+0.5, h*0.55, 0, 1.2, 0.08, d*0.7, varyColor(awningColor, rng, 0.1));
          // Counter/table
          addPart('box', 'wood', 0, 1.0, 0, w*0.5, 0.15, d*0.4);
          // Goods on counter (small colorful boxes)
          addPart('box', 'straw', 0.4, 1.2, 0.2, 0.3, 0.25, 0.3, varyColor([0.85, 0.65, 0.2], rng, 0.15));
          addPart('box', 'straw', -0.3, 1.2, -0.1, 0.25, 0.2, 0.25, varyColor([0.6, 0.3, 0.15], rng, 0.15));
        }
        else if (b.type === 'shack') {
          const wallColor = varyColor(BASE_COLORS.wood, rng, 0.1);
          const roofColor = varyColor(BASE_COLORS.straw, rng, 0.1);
          if (c === 'Indian Ocean') {
            addPart('cylinder', 'wood', w/2-0.2, 0.5, d/2-0.2, 0.1, 1, 0.1);
            addPart('cylinder', 'wood', -w/2+0.2, 0.5, d/2-0.2, 0.1, 1, 0.1);
            addPart('cylinder', 'wood', w/2-0.2, 0.5, -d/2+0.2, 0.1, 1, 0.1);
            addPart('cylinder', 'wood', -w/2+0.2, 0.5, -d/2+0.2, 0.1, 1, 0.1);
            addPart('box', 'wood', 0, 1.5, 0, w, h, d, wallColor);
            addPart('cone', 'straw', 0, 1.5+h/2+0.5, 0, w/1.2, 1, d/1.2, roofColor);
            // Door opening
            addPart('box', 'dark', 0, 1.3, d/2+0.05, 0.6, 1.0, 0.1);
          } else {
            addPart('box', 'wood', 0, h/2, 0, w, h, d, wallColor);
            addPart('cone', 'straw', 0, h+0.5, 0, w/1.2, 1, d/1.2, roofColor);
            // Door
            addPart('box', 'dark', 0, h*0.35, d/2+0.05, 0.6, h*0.6, 0.1);
            // Window
            addPart('box', 'dark', w/2+0.05, h*0.55, 0, 0.1, 0.4, 0.5);
          }
        }
        else {
          // House, Warehouse, Estate, Farmhouse
          let wallMat: Part['mat'] = 'white';
          let roofMat: Part['mat'] = 'terracotta';
          let roofGeo: Part['geo'] = 'cone';
          let roofH = 1.5;

          if (c === 'Indian Ocean') {
            wallMat = 'mud';
            roofMat = 'mud';
            roofGeo = 'box';
            roofH = 0.4;
          } else if (c === 'Caribbean') {
            wallMat = 'wood';
            roofMat = 'wood';
            roofGeo = 'cone';
          }

          if (b.type === 'farmhouse') {
            roofMat = 'straw';
            roofGeo = 'cone';
          }

          const wallColor = varyColor(BASE_COLORS[wallMat], rng, 0.08);
          const roofColor = varyColor(BASE_COLORS[roofMat], rng, 0.10);

          addPart('box', wallMat, 0, h/2, 0, w, h, d, wallColor);

          if (roofGeo === 'box') {
            addPart('box', roofMat, 0, h + roofH/2, 0, w+0.4, roofH, d+0.4, roofColor);
          } else {
            addPart('cone', roofMat, 0, h + roofH/2, 0, w/1.2, roofH, d/1.2, roofColor);
          }

          // --- Detail parts ---
          // Door (front wall)
          addPart('box', 'dark', 0, h*0.3, d/2+0.05, 0.55, h*0.55, 0.1);

          // Windows
          if (b.type === 'house' || b.type === 'farmhouse') {
            // Side windows
            addPart('box', 'dark', w/2+0.05, h*0.55, 0, 0.1, 0.45, 0.55);
            addPart('box', 'dark', -w/2-0.05, h*0.55, 0, 0.1, 0.45, 0.55);
          }

          if (b.type === 'warehouse') {
            // Large loading door
            addPart('box', 'dark', 0, h*0.35, d/2+0.05, 1.8, h*0.6, 0.1);
            // Side windows (high, small)
            addPart('box', 'dark', w/2+0.05, h*0.7, d/4, 0.1, 0.35, 0.4);
            addPart('box', 'dark', w/2+0.05, h*0.7, -d/4, 0.1, 0.35, 0.4);
            // Crates stacked outside
            const crateColor = varyColor(BASE_COLORS.wood, rng, 0.15);
            addPart('box', 'wood', w/2+1.0, 0.35, 0, 0.7, 0.7, 0.7, crateColor);
            addPart('box', 'wood', w/2+1.0, 0.25, 0.9, 0.5, 0.5, 0.5, varyColor(BASE_COLORS.wood, rng, 0.15));
          }

          // Chimney (European and Caribbean houses/estates/farmhouses, not warehouses)
          if (b.type !== 'warehouse' && c !== 'Indian Ocean') {
            addPart('box', 'stone', w/4, h + roofH + 0.3, d/4, 0.4, 0.8, 0.4);
          }

          // Estates get extra details
          if (b.type === 'estate') {
            if (c === 'Caribbean') {
              // Wraparound porch
              addPart('box', 'wood', 0, h/2, 0, w+2, 0.2, d+2);
              // Porch posts
              addPart('cylinder', 'wood', w/2+0.8, h*0.35, d/2+0.8, 0.12, h*0.6, 0.12);
              addPart('cylinder', 'wood', -w/2-0.8, h*0.35, d/2+0.8, 0.12, h*0.6, 0.12);
              addPart('cylinder', 'wood', w/2+0.8, h*0.35, -d/2-0.8, 0.12, h*0.6, 0.12);
              addPart('cylinder', 'wood', -w/2-0.8, h*0.35, -d/2-0.8, 0.12, h*0.6, 0.12);
            } else {
              // Second floor
              addPart('box', wallMat, 0, h + h/2, 0, w-0.5, h, d-0.5, wallColor);
              if (roofGeo === 'box') {
                addPart('box', roofMat, 0, h*2 + roofH/2, 0, w, roofH, d, roofColor);
              } else {
                addPart('cone', roofMat, 0, h*2 + roofH/2, 0, w/1.2, roofH, d/1.2, roofColor);
              }
              // Upper floor windows
              addPart('box', 'dark', w/2-0.2, h*1.55, d/2-0.2+0.05, 0.1, 0.45, 0.5);
              addPart('box', 'dark', -w/2+0.7, h*1.55, d/2-0.2+0.05, 0.1, 0.45, 0.5);
            }
            // Front windows (ground floor, flanking door)
            addPart('box', 'dark', w/3, h*0.55, d/2+0.05, 0.1, 0.5, 0.6);
            addPart('box', 'dark', -w/3, h*0.55, d/2+0.05, 0.1, 0.5, 0.6);
          }

          // Farmhouse: fence posts
          if (b.type === 'farmhouse') {
            addPart('cylinder', 'wood', w/2+1.5, 0.35, d/2+1.5, 0.08, 0.7, 0.08);
            addPart('cylinder', 'wood', -w/2-1.5, 0.35, d/2+1.5, 0.08, 0.7, 0.08);
            addPart('cylinder', 'wood', w/2+1.5, 0.35, -d/2-1.5, 0.08, 0.7, 0.08);
          }
        }
      });
    });

    return allParts;
  }, [ports]);

  // Group parts by geo+mat
  const groups = useMemo(() => {
    const map = new Map<string, Part[]>();
    parts.forEach(p => {
      const key = `${p.geo}_${p.mat}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    });
    return map;
  }, [parts]);

  // Geometries
  const geos = useMemo(() => ({
    box: new THREE.BoxGeometry(1, 1, 1),
    cylinder: new THREE.CylinderGeometry(1, 1, 1, 8),
    cone: new THREE.CylinderGeometry(0, 1, 1, 4), // 4-sided pyramid
    sphere: new THREE.SphereGeometry(1, 16, 16)
  }), []);

  // Materials
  const mats = useMemo(() => ({
    white: new THREE.MeshStandardMaterial({ color: '#f0f0f0', roughness: 0.9 }),
    mud: new THREE.MeshStandardMaterial({ color: '#c2a077', roughness: 1.0 }),
    wood: new THREE.MeshStandardMaterial({ color: '#5c4033', roughness: 0.8 }),
    terracotta: new THREE.MeshStandardMaterial({ color: '#cd5c5c', roughness: 0.7 }),
    stone: new THREE.MeshStandardMaterial({ color: '#888888', roughness: 0.9 }),
    straw: new THREE.MeshStandardMaterial({ color: '#d4c07b', roughness: 1.0 }),
    road_dirt: new THREE.MeshStandardMaterial({ color: '#8b7355', roughness: 1.0 }),
    road_stone: new THREE.MeshStandardMaterial({ color: '#7a7a72', roughness: 0.85 }),
    dark: new THREE.MeshStandardMaterial({ color: '#1e1a14', roughness: 0.95 }),
  }), []);

  return (
    <group>
      {Array.from(groups.entries()).map(([key, groupParts]) => {
        const [geoName, matName] = key.split('_') as [keyof typeof geos, keyof typeof mats];
        return (
          <InstancedParts 
            key={key} 
            parts={groupParts} 
            geometry={geos[geoName]} 
            material={mats[matName]} 
          />
        );
      })}
    </group>
  );
}

function InstancedParts({ parts, geometry, material }: { parts: Part[], geometry: THREE.BufferGeometry, material: THREE.Material }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  useEffect(() => {
    if (!meshRef.current) return;
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    parts.forEach((p, i) => {
      dummy.position.set(...p.pos);
      dummy.scale.set(...p.scale);
      dummy.rotation.set(...p.rot);
      // For cones (pyramids), rotate 45 deg so flat sides align with boxes
      if (geometry instanceof THREE.CylinderGeometry && geometry.parameters.radialSegments === 4) {
        dummy.rotation.y += Math.PI / 4;
      }
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);
      // Per-instance color variation
      if (p.color) {
        color.setRGB(p.color[0], p.color[1], p.color[2]);
        meshRef.current!.setColorAt(i, color);
      }
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) {
      meshRef.current.instanceColor.needsUpdate = true;
    }
  }, [parts, geometry]);

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, parts.length]}
      castShadow
      receiveShadow
    />
  );
}
