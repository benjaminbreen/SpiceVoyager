import { useMemo, useRef, useEffect } from 'react';
import * as THREE from 'three';
import { useGameStore } from '../store/gameStore';

interface Part {
  geo: 'box' | 'cylinder' | 'cone' | 'sphere';
  mat: 'white' | 'mud' | 'wood' | 'terracotta' | 'stone' | 'straw' | 'road_dirt' | 'road_stone';
  pos: [number, number, number];
  scale: [number, number, number];
  rot: [number, number, number];
}

export function ProceduralCity() {
  const { ports } = useGameStore();

  const parts = useMemo(() => {
    const allParts: Part[] = [];

    ports.forEach(port => {
      port.buildings.forEach(b => {
        const [w, h, d] = b.scale;
        const [x, y, z] = b.position;
        const rot = b.rotation;
        const c = port.culture;

        const addPart = (geo: Part['geo'], mat: Part['mat'], lx: number, ly: number, lz: number, sw: number, sh: number, sd: number) => {
          // Rotate local position around building center
          const rx = lx * Math.cos(rot) - lz * Math.sin(rot);
          const rz = lx * Math.sin(rot) + lz * Math.cos(rot);
          allParts.push({
            geo, mat,
            pos: [x + rx, y + ly, z + rz],
            scale: [sw, sh, sd],
            rot: [0, rot, 0]
          });
        };

        if (b.type === 'road') {
          const roadMat = c === 'European' ? 'road_stone' : 'road_dirt';
          addPart('box', roadMat, 0, 0, 0, w, h, d);
        }
        else if (b.type === 'dock') {
          addPart('box', 'wood', 0, 0, 0, w, 0.2, d); // deck
          addPart('cylinder', 'wood', w/2-0.2, -1, d/2-0.2, 0.2, 3, 0.2);
          addPart('cylinder', 'wood', -w/2+0.2, -1, d/2-0.2, 0.2, 3, 0.2);
          addPart('cylinder', 'wood', w/2-0.2, -1, -d/2+0.2, 0.2, 3, 0.2);
          addPart('cylinder', 'wood', -w/2+0.2, -1, -d/2+0.2, 0.2, 3, 0.2);
        }
        else if (b.type === 'fort') {
          const mat = c === 'Indian Ocean' ? 'mud' : 'stone';
          addPart('box', mat, 0, h/2, 0, w, h, d); // main block
          // corner towers
          addPart('cylinder', mat, w/2, h/2+1, d/2, 1.5, h+2, 1.5);
          addPart('cylinder', mat, -w/2, h/2+1, d/2, 1.5, h+2, 1.5);
          addPart('cylinder', mat, w/2, h/2+1, -d/2, 1.5, h+2, 1.5);
          addPart('cylinder', mat, -w/2, h/2+1, -d/2, 1.5, h+2, 1.5);
        }
        else if (b.type === 'market') {
          addPart('box', 'wood', 0, 0.2, 0, w, 0.4, d); // base
          addPart('cylinder', 'wood', w/2-0.5, h/2, d/2-0.5, 0.3, h, 0.3);
          addPart('cylinder', 'wood', -w/2+0.5, h/2, d/2-0.5, 0.3, h, 0.3);
          addPart('cylinder', 'wood', w/2-0.5, h/2, -d/2+0.5, 0.3, h, 0.3);
          addPart('cylinder', 'wood', -w/2+0.5, h/2, -d/2+0.5, 0.3, h, 0.3);
          
          if (c === 'Indian Ocean') {
            addPart('sphere', 'mud', 0, h, 0, w/2, w/2, d/2); // dome
          } else if (c === 'European') {
            addPart('cone', 'terracotta', 0, h+1, 0, w/1.5, 2, d/1.5);
          } else {
            addPart('cone', 'wood', 0, h+1, 0, w/1.5, 2, d/1.5);
          }
        }
        else if (b.type === 'shack') {
          if (c === 'Indian Ocean') {
            addPart('cylinder', 'wood', w/2-0.2, 0.5, d/2-0.2, 0.1, 1, 0.1);
            addPart('cylinder', 'wood', -w/2+0.2, 0.5, d/2-0.2, 0.1, 1, 0.1);
            addPart('cylinder', 'wood', w/2-0.2, 0.5, -d/2+0.2, 0.1, 1, 0.1);
            addPart('cylinder', 'wood', -w/2+0.2, 0.5, -d/2+0.2, 0.1, 1, 0.1);
            addPart('box', 'wood', 0, 1.5, 0, w, h, d);
            addPart('cone', 'straw', 0, 1.5+h/2+0.5, 0, w/1.2, 1, d/1.2);
          } else {
            addPart('box', 'wood', 0, h/2, 0, w, h, d);
            addPart('cone', 'straw', 0, h+0.5, 0, w/1.2, 1, d/1.2);
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

          addPart('box', wallMat, 0, h/2, 0, w, h, d);
          
          if (roofGeo === 'box') {
            addPart('box', roofMat, 0, h + roofH/2, 0, w+0.4, roofH, d+0.4);
          } else {
            addPart('cone', roofMat, 0, h + roofH/2, 0, w/1.2, roofH, d/1.2);
          }

          // Estates get an extra floor or balcony
          if (b.type === 'estate') {
            if (c === 'Caribbean') {
              // Wraparound porch
              addPart('box', 'wood', 0, h/2, 0, w+2, 0.2, d+2);
            } else {
              // Second floor
              addPart('box', wallMat, 0, h + h/2, 0, w-0.5, h, d-0.5);
              if (roofGeo === 'box') {
                addPart('box', roofMat, 0, h*2 + roofH/2, 0, w, roofH, d);
              } else {
                addPart('cone', roofMat, 0, h*2 + roofH/2, 0, w/1.2, roofH, d/1.2);
              }
            }
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
    road_stone: new THREE.MeshStandardMaterial({ color: '#7a7a72', roughness: 0.85 })
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
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
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
