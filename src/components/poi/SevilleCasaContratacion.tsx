// ── Seville — Casa de la Contratacion ─────────────────────────────────────
//
// Cartoon-readable POI: a royal paperwork engine for the Indies trade. This
// deliberately avoids the Lisbon Casa's miniature-prop problem. From the
// angled top camera the identity comes from big massing: a courtyard compound,
// oversized tile roofs, an archive tower, a giant map table, and a crane-scale
// arm stamping cargo bales.

import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { getTerrainHeight } from '../../utils/terrain';
import { chunkyMat, ChimneySmoke, POITorchInstancer, type POITorchSpot } from './atmosphere';
import { WavingBanner } from './WavingBanner';

const WHITEWASH: readonly [number, number, number] = [0.90, 0.84, 0.72];
const SHADOW: readonly [number, number, number] = [0.62, 0.54, 0.44];
const ROOF: readonly [number, number, number] = [0.66, 0.24, 0.14];
const ROOF_DARK: readonly [number, number, number] = [0.42, 0.15, 0.10];
const TILE_BLUE: readonly [number, number, number] = [0.16, 0.36, 0.68];
const TILE_GREEN: readonly [number, number, number] = [0.20, 0.48, 0.32];
const STONE: readonly [number, number, number] = [0.70, 0.66, 0.56];
const GOLD: readonly [number, number, number] = [0.86, 0.63, 0.18];
const RED: readonly [number, number, number] = [0.76, 0.14, 0.12];
const DARK_WOOD: readonly [number, number, number] = [0.28, 0.17, 0.10];
const PARCHMENT: readonly [number, number, number] = [0.84, 0.75, 0.56];
const INK: readonly [number, number, number] = [0.12, 0.10, 0.08];
const ORANGE_LEAF: readonly [number, number, number] = [0.20, 0.38, 0.15];
const ORANGE_FRUIT: readonly [number, number, number] = [0.90, 0.42, 0.10];
const SILVER: readonly [number, number, number] = [0.70, 0.72, 0.72];

function GableRoof({ width, depth, height, axis, material, ridgeMaterial }: {
  width: number;
  depth: number;
  height: number;
  axis: 'x' | 'z';
  material: THREE.Material;
  ridgeMaterial: THREE.Material;
}) {
  const geometry = useMemo(() => {
    const hw = width * 0.5;
    const hd = depth * 0.5;
    const verts = axis === 'x'
      ? new Float32Array([
          -hw, 0, -hd,  hw, 0, -hd,  hw, 0, hd,  -hw, 0, hd,
          -hw, height, 0,  hw, height, 0,
        ])
      : new Float32Array([
          -hw, 0, -hd,  hw, 0, -hd,  hw, 0, hd,  -hw, 0, hd,
          0, height, -hd,  0, height, hd,
        ]);
    const indices = axis === 'x'
      ? [
          0, 1, 5, 0, 5, 4,
          3, 2, 5, 3, 5, 4,
          0, 4, 3,
          1, 2, 5,
          0, 3, 2, 0, 2, 1,
        ]
      : [
          0, 4, 3, 3, 4, 5,
          1, 2, 5, 1, 5, 4,
          0, 1, 4,
          3, 5, 2,
          0, 3, 2, 0, 2, 1,
        ];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    g.setIndex(indices);
    g.computeVertexNormals();
    return g;
  }, [axis, depth, height, width]);

  return (
    <group>
      <mesh geometry={geometry} material={material} />
      <mesh position={[0, height + 0.05, 0]} material={ridgeMaterial}>
        <boxGeometry args={axis === 'x' ? [width + 0.35, 0.2, 0.42] : [0.42, 0.2, depth + 0.35]} />
      </mesh>
    </group>
  );
}

function CourtyardWing({ position, size, roofAxis = 'x' }: {
  position: readonly [number, number, number];
  size: readonly [number, number, number];
  roofAxis?: 'x' | 'z';
}) {
  const wall = chunkyMat(WHITEWASH, { roughness: 1 });
  const shade = chunkyMat(SHADOW, { roughness: 1 });
  const roof = chunkyMat(ROOF, { roughness: 0.9 });
  const roofDark = chunkyMat(ROOF_DARK, { roughness: 0.9 });
  const blue = chunkyMat(TILE_BLUE, { roughness: 0.9 });
  const [w, h, d] = size;
  const roofLong = roofAxis === 'x' ? w + 1.2 : d + 1.2;
  const roofShort = roofAxis === 'x' ? d + 1.1 : w + 1.1;

  return (
    <group position={position as [number, number, number]}>
      <mesh position={[0, 0.25, 0]} material={shade}>
        <boxGeometry args={[w + 0.7, 0.5, d + 0.7]} />
      </mesh>
      <mesh position={[0, 0.5 + h * 0.5, 0]} material={wall}>
        <boxGeometry args={[w, h, d]} />
      </mesh>
      <mesh position={[0, h + 0.15, -d * 0.5 - 0.03]} material={blue}>
        <boxGeometry args={[w, 0.42, 0.08]} />
      </mesh>
      <mesh position={[0, h + 0.15, d * 0.5 + 0.03]} material={blue}>
        <boxGeometry args={[w, 0.42, 0.08]} />
      </mesh>
      <group position={[0, h + 0.1, 0]}>
        <GableRoof width={roofAxis === 'x' ? roofLong : roofShort} depth={roofAxis === 'x' ? roofShort : roofLong} height={1.8} axis={roofAxis} material={roof} ridgeMaterial={roofDark} />
      </group>
    </group>
  );
}

function ArchiveTower({ position }: { position: readonly [number, number, number] }) {
  const wall = chunkyMat(WHITEWASH, { roughness: 1 });
  const shade = chunkyMat(SHADOW, { roughness: 1 });
  const roof = chunkyMat(ROOF, { roughness: 0.9 });
  const blue = chunkyMat(TILE_BLUE, { roughness: 0.9 });
  const gold = chunkyMat(GOLD, { roughness: 0.5, metalness: 0.35 });

  return (
    <group position={position as [number, number, number]}>
      <mesh position={[0, 0.35, 0]} material={shade}>
        <boxGeometry args={[7, 0.7, 7]} />
      </mesh>
      <mesh position={[0, 5.6, 0]} material={wall}>
        <boxGeometry args={[5.8, 10.5, 5.8]} />
      </mesh>
      <mesh position={[0, 10.4, 0]} material={blue}>
        <boxGeometry args={[6.2, 0.7, 6.2]} />
      </mesh>
      <mesh position={[0, 12.0, 0]} rotation={[0, Math.PI / 4, 0]} material={roof}>
        <coneGeometry args={[5.1, 3.0, 4]} />
      </mesh>
      <mesh position={[0, 14.0, 0]} material={gold}>
        <sphereGeometry args={[0.45, 8, 6]} />
      </mesh>
      <mesh position={[0, 14.55, 0]} material={gold}>
        <boxGeometry args={[0.16, 1.2, 0.16]} />
      </mesh>
      {[-1.6, 0, 1.6].map((x) => (
        <mesh key={x} position={[x, 5.8, -2.95]} material={chunkyMat(INK, { roughness: 1 })}>
          <boxGeometry args={[0.55, 2.1, 0.08]} />
        </mesh>
      ))}
    </group>
  );
}

function MapTable({ position }: { position: readonly [number, number, number] }) {
  const table = chunkyMat(DARK_WOOD, { roughness: 1 });
  const parchment = chunkyMat(PARCHMENT, { roughness: 1 });
  const ink = chunkyMat(INK, { roughness: 1 });
  const gold = chunkyMat(GOLD, { roughness: 0.5, metalness: 0.3 });
  const routeRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (!routeRef.current) return;
    const pulse = 1 + Math.sin(clock.elapsedTime * 2.4) * 0.08;
    routeRef.current.scale.set(pulse, 1, pulse);
  });

  return (
    <group position={position as [number, number, number]}>
      <mesh position={[0, 0.55, 0]} material={table}>
        <boxGeometry args={[7.5, 1.1, 4.8]} />
      </mesh>
      <mesh position={[0, 1.15, 0]} rotation={[-Math.PI / 2, 0, 0]} material={parchment}>
        <planeGeometry args={[7.0, 4.3]} />
      </mesh>
      <group ref={routeRef} position={[0, 1.22, 0]}>
        <mesh position={[-1.7, 0, -0.7]} rotation={[-Math.PI / 2, 0, 0.35]} material={ink}>
          <boxGeometry args={[3.6, 0.08, 0.06]} />
        </mesh>
        <mesh position={[1.2, 0, 0.4]} rotation={[-Math.PI / 2, 0, -0.45]} material={ink}>
          <boxGeometry args={[3.8, 0.08, 0.06]} />
        </mesh>
        <mesh position={[0.1, 0, 0.0]} material={gold}>
          <sphereGeometry args={[0.22, 8, 6]} />
        </mesh>
        <mesh position={[2.6, 0, 1.2]} material={gold}>
          <sphereGeometry args={[0.18, 8, 6]} />
        </mesh>
      </group>
    </group>
  );
}

function StampCrane({ position }: { position: readonly [number, number, number] }) {
  const wood = chunkyMat(DARK_WOOD, { roughness: 1 });
  const iron = chunkyMat(INK, { roughness: 0.8, metalness: 0.2 });
  const bale = chunkyMat(PARCHMENT, { roughness: 1 });
  const red = chunkyMat(RED, { roughness: 1 });
  const armRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (!armRef.current) return;
    armRef.current.rotation.z = -0.18 + Math.sin(clock.elapsedTime * 1.8) * 0.16;
  });

  return (
    <group position={position as [number, number, number]}>
      <mesh position={[0, 2.4, 0]} material={wood}>
        <boxGeometry args={[0.45, 4.8, 0.45]} />
      </mesh>
      <group ref={armRef} position={[0, 4.5, 0]}>
        <mesh position={[2.2, 0, 0]} material={wood}>
          <boxGeometry args={[4.6, 0.3, 0.35]} />
        </mesh>
        <mesh position={[4.55, -0.85, 0]} material={iron}>
          <cylinderGeometry args={[0.07, 0.07, 1.7, 6]} />
        </mesh>
        <mesh position={[4.55, -1.75, 0]} material={red}>
          <boxGeometry args={[0.95, 0.35, 0.95]} />
        </mesh>
      </group>
      {[-1.2, 0, 1.2].map((x, i) => (
        <mesh key={i} position={[x, 0.45, 2.0]} rotation={[0, i * 0.2, 0]} material={bale}>
          <boxGeometry args={[1.0, 0.9, 1.35]} />
        </mesh>
      ))}
    </group>
  );
}

function OrangeTree({ position }: { position: readonly [number, number, number] }) {
  const trunk = chunkyMat(DARK_WOOD, { roughness: 1 });
  const leaf = chunkyMat(ORANGE_LEAF, { roughness: 1 });
  const fruit = chunkyMat(ORANGE_FRUIT, { roughness: 0.8 });
  return (
    <group position={position as [number, number, number]}>
      <mesh position={[0, 0.7, 0]} material={trunk}>
        <cylinderGeometry args={[0.18, 0.24, 1.4, 6]} />
      </mesh>
      <mesh position={[0, 1.75, 0]} material={leaf}>
        <sphereGeometry args={[1.05, 7, 5]} />
      </mesh>
      <mesh position={[0.55, 1.9, 0.25]} material={fruit}>
        <sphereGeometry args={[0.16, 6, 4]} />
      </mesh>
      <mesh position={[-0.45, 1.65, -0.35]} material={fruit}>
        <sphereGeometry args={[0.14, 6, 4]} />
      </mesh>
    </group>
  );
}

function SilverStacks({ position }: { position: readonly [number, number, number] }) {
  const silver = chunkyMat(SILVER, { roughness: 0.45, metalness: 0.45 });
  const gold = chunkyMat(GOLD, { roughness: 0.5, metalness: 0.35 });
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.rotation.y = Math.sin(clock.elapsedTime * 0.9) * 0.08;
  });
  return (
    <group ref={ref} position={position as [number, number, number]}>
      {[0, 0.22, 0.44, 0.66].map((y, i) => (
        <mesh key={i} position={[0, y, 0]} material={i === 3 ? gold : silver}>
          <cylinderGeometry args={[0.85, 0.85, 0.16, 12]} />
        </mesh>
      ))}
    </group>
  );
}

function groundSampler(ax: number, az: number, rotationY: number) {
  return (lx: number, lz: number) => {
    const c = Math.cos(rotationY);
    const s = Math.sin(rotationY);
    const wx = ax + lx * c + lz * s;
    const wz = az - lx * s + lz * c;
    return getTerrainHeight(wx, wz);
  };
}

export function SevilleCasaContratacion({ poiId, position, rotationY }: {
  poiId: string;
  position: readonly [number, number, number];
  rotationY: number;
}) {
  void poiId;
  const [ax, , az] = position as [number, number, number];
  const terrainAt = useMemo(() => groundSampler(ax, az, rotationY), [ax, az, rotationY]);
  const anchorY = terrainAt(0, 0);
  const y = (lx: number, lz: number) => Math.max(terrainAt(lx, lz), anchorY) - anchorY;

  const stone = useMemo(() => chunkyMat(STONE, { roughness: 1 }), []);
  const courtyard = useMemo(() => chunkyMat([0.62, 0.52, 0.36], { roughness: 1 }), []);
  const greenTile = useMemo(() => chunkyMat(TILE_GREEN, { roughness: 0.9 }), []);

  const smokePos: [number, number, number] = useMemo(() => {
    const c = Math.cos(rotationY);
    const s = Math.sin(rotationY);
    const lx = 10;
    const lz = -7;
    return [ax + lx * c + lz * s, anchorY + y(lx, lz) + 10.4, az - lx * s + lz * c];
  }, [ax, az, anchorY, rotationY, terrainAt]);

  const torchSpots: POITorchSpot[] = useMemo(() => {
    const c = Math.cos(rotationY);
    const s = Math.sin(rotationY);
    return [[-6, -11], [6, -11], [-13, 1], [13, 1]].map(([lx, lz]) => ({
      pos: [ax + lx * c + lz * s, anchorY + y(lx, lz) + 2.2, az - lx * s + lz * c] as [number, number, number],
      warmth: 'warm',
    }));
  }, [ax, az, anchorY, rotationY, terrainAt]);

  return (
    <>
      <POITorchInstancer spots={torchSpots} />
      <ChimneySmoke position={smokePos} warmth="warm" scale={0.9} />

      <group position={position as [number, number, number]} rotation={[0, rotationY, 0]}>
        <mesh position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]} material={courtyard}>
          <planeGeometry args={[27, 25]} />
        </mesh>
        <mesh position={[0, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]} material={greenTile}>
          <ringGeometry args={[5.2, 6.1, 4]} />
        </mesh>

        <CourtyardWing position={[0, y(0, -10), -10]} size={[26, 5.4, 5.2]} roofAxis="x" />
        <CourtyardWing position={[0, y(0, 10), 10]} size={[24, 4.8, 5.0]} roofAxis="x" />
        <CourtyardWing position={[-12, y(-12, 0), 0]} size={[5.4, 5.0, 18]} roofAxis="z" />
        <CourtyardWing position={[12, y(12, 0), 0]} size={[5.4, 5.0, 18]} roofAxis="z" />

        <ArchiveTower position={[-12, y(-12, -10), -10]} />
        <WavingBanner
          position={[-5.6, y(-5.6, -12.8) + 5.0, -12.8]}
          width={3.8}
          height={2.2}
          poleHeight={5.2}
          poleRadius={0.12}
          poleColor={DARK_WOOD}
          finialColor={GOLD}
          pattern={{ kind: 'saltire', field: [0.95, 0.82, 0.26], saltire: RED, width: 0.16 }}
          phase={1.1}
          amplitude={0.38}
          speed={3.8}
        />

        <MapTable position={[0, y(0, 0) + 0.05, 0]} />
        <StampCrane position={[7.5, y(7.5, 3.8), 3.8]} />
        <SilverStacks position={[-6.5, y(-6.5, 4.5) + 0.12, 4.5]} />

        <mesh position={[0, y(0, -13.5) + 1.3, -13.5]} material={stone}>
          <boxGeometry args={[9.5, 2.6, 1.2]} />
        </mesh>
        <mesh position={[0, y(0, -14.2) + 2.6, -14.2]} material={chunkyMat(TILE_BLUE, { roughness: 0.9 })}>
          <boxGeometry args={[8.0, 0.7, 0.4]} />
        </mesh>

        {[[-4.2, -2.5], [4.2, -2.5], [-4.2, 3.0], [4.2, 3.0]].map(([lx, lz], i) => (
          <OrangeTree key={i} position={[lx, y(lx, lz), lz]} />
        ))}
      </group>
    </>
  );
}
