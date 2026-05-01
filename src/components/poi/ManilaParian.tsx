// ── Manila — Sangley Parian Compound ──────────────────────────────────────
//
// Readable from an angled top view: one oversized paifang gate, one broad
// green-tiled merchant hall, red pillars, silk canopies, porcelain tables,
// and large lanterns. The goal is "Chinese merchant quarter" at thumbnail
// scale before any small prop detail matters.

import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { getTerrainHeight } from '../../utils/terrain';
import { chunkyMat, ChimneySmoke, POITorchInstancer, type POITorchSpot } from './atmosphere';

const RED_LACQUER: readonly [number, number, number] = [0.72, 0.12, 0.10];
const RED_DARK: readonly [number, number, number] = [0.42, 0.08, 0.07];
const GREEN_TILE: readonly [number, number, number] = [0.12, 0.42, 0.30];
const GREEN_DARK: readonly [number, number, number] = [0.08, 0.26, 0.20];
const GOLD: readonly [number, number, number] = [0.86, 0.62, 0.16];
const WHITE_PLASTER: readonly [number, number, number] = [0.88, 0.82, 0.70];
const STONE: readonly [number, number, number] = [0.62, 0.58, 0.50];
const DARK_WOOD: readonly [number, number, number] = [0.24, 0.14, 0.08];
const SILK_BLUE: readonly [number, number, number] = [0.18, 0.38, 0.74];
const SILK_GOLD: readonly [number, number, number] = [0.86, 0.56, 0.18];
const PORCELAIN: readonly [number, number, number] = [0.92, 0.94, 0.88];
const PORCELAIN_BLUE: readonly [number, number, number] = [0.10, 0.26, 0.62];
const INCENSE: readonly [number, number, number] = [0.55, 0.42, 0.30];

function localTerrain(ax: number, az: number, rotationY: number) {
  return (lx: number, lz: number) => {
    const c = Math.cos(rotationY);
    const s = Math.sin(rotationY);
    return getTerrainHeight(ax + lx * c + lz * s, az - lx * s + lz * c);
  };
}

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
    const h = height;
    const verts = axis === 'x'
      ? new Float32Array([
          -hw, 0, -hd,  hw, 0, -hd,  hw, 0, hd,  -hw, 0, hd,
          -hw, h, 0,    hw, h, 0,
        ])
      : new Float32Array([
          -hw, 0, -hd,  hw, 0, -hd,  hw, 0, hd,  -hw, 0, hd,
          0, h, -hd,    0, h, hd,
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
      <mesh position={axis === 'x' ? [0, height + 0.05, 0] : [0, height + 0.05, 0]} material={ridgeMaterial}>
        <boxGeometry args={axis === 'x' ? [width + 0.35, 0.18, 0.35] : [0.35, 0.18, depth + 0.35]} />
      </mesh>
    </group>
  );
}

function MerchantHall({ position }: { position: readonly [number, number, number] }) {
  const wall = chunkyMat(WHITE_PLASTER, { roughness: 1 });
  const red = chunkyMat(RED_LACQUER, { roughness: 0.85 });
  const green = chunkyMat(GREEN_TILE, { roughness: 0.85 });
  const greenDark = chunkyMat(GREEN_DARK, { roughness: 0.9 });
  const gold = chunkyMat(GOLD, { roughness: 0.55, metalness: 0.25 });

  return (
    <group position={position as [number, number, number]}>
      <mesh position={[0, 0.35, 0]} material={chunkyMat(STONE, { roughness: 1 })}>
        <boxGeometry args={[23, 0.7, 10]} />
      </mesh>
      <mesh position={[0, 3.0, 0]} material={wall}>
        <boxGeometry args={[20, 5.3, 7.2]} />
      </mesh>
      <mesh position={[0, 5.7, -3.75]} material={red}>
        <boxGeometry args={[20.8, 0.8, 0.35]} />
      </mesh>
      {[-8, -4, 0, 4, 8].map((x) => (
        <mesh key={x} position={[x, 2.2, -4.15]} material={red}>
          <cylinderGeometry args={[0.32, 0.38, 4.2, 8]} />
        </mesh>
      ))}
      <group position={[0, 5.75, 0]}>
        <GableRoof width={23.5} depth={9.2} height={2.2} axis="x" material={green} ridgeMaterial={greenDark} />
      </group>
      <mesh position={[0, 8.1, 0]} material={gold}>
        <boxGeometry args={[23.8, 0.22, 0.5]} />
      </mesh>
      <mesh position={[0, 4.1, -4.45]} material={gold}>
        <boxGeometry args={[7.6, 0.65, 0.28]} />
      </mesh>
    </group>
  );
}

function PaifangGate({ position }: { position: readonly [number, number, number] }) {
  const red = chunkyMat(RED_LACQUER, { roughness: 0.85 });
  const dark = chunkyMat(RED_DARK, { roughness: 0.9 });
  const green = chunkyMat(GREEN_TILE, { roughness: 0.85 });
  const gold = chunkyMat(GOLD, { roughness: 0.55, metalness: 0.25 });

  return (
    <group position={position as [number, number, number]}>
      {[-4.3, 4.3].map((x) => (
        <mesh key={x} position={[x, 3.1, 0]} material={red}>
          <cylinderGeometry args={[0.42, 0.52, 6.2, 8]} />
        </mesh>
      ))}
      <mesh position={[0, 6.1, 0]} material={dark}>
        <boxGeometry args={[10.2, 0.65, 0.8]} />
      </mesh>
      <group position={[0, 6.65, 0]}>
        <GableRoof width={11.5} depth={2.2} height={0.9} axis="x" material={green} ridgeMaterial={gold} />
      </group>
      <mesh position={[0, 5.25, -0.45]} material={gold}>
        <boxGeometry args={[4.4, 1.0, 0.25]} />
      </mesh>
    </group>
  );
}

function SilkCanopy({ position, color, phase }: {
  position: readonly [number, number, number];
  color: readonly [number, number, number];
  phase: number;
}) {
  const geo = useMemo(() => new THREE.PlaneGeometry(8.5, 3.4, 8, 3), []);
  const rest = useMemo(() => geo.attributes.position.array.slice(0), [geo]);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({
    color: new THREE.Color(...color),
    side: THREE.DoubleSide,
    flatShading: true,
    roughness: 0.85,
  }), [color]);
  const ref = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const pos = ref.current?.geometry.attributes.position;
    if (!pos) return;
    const t = clock.elapsedTime + phase;
    for (let i = 0; i < pos.count; i++) {
      const x = rest[i * 3];
      const y = rest[i * 3 + 1];
      pos.setX(i, x);
      pos.setY(i, y);
      pos.setZ(i, Math.sin(t * 2.0 + x * 1.3) * 0.20);
    }
    pos.needsUpdate = true;
  });

  return (
    <mesh
      ref={ref}
      position={position as [number, number, number]}
      rotation={[-Math.PI / 2, 0, 0]}
      geometry={geo}
      material={mat}
    />
  );
}

function Lantern({ position, phase }: { position: readonly [number, number, number]; phase: number }) {
  const red = chunkyMat(RED_LACQUER, { roughness: 0.8, emissive: [0.45, 0.08, 0.04], emissiveIntensity: 0.25 });
  const gold = chunkyMat(GOLD, { roughness: 0.5, metalness: 0.2 });
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.rotation.z = Math.sin(clock.elapsedTime * 1.4 + phase) * 0.10;
  });
  return (
    <group ref={ref} position={position as [number, number, number]}>
      <mesh material={red}>
        <sphereGeometry args={[0.55, 10, 6]} />
      </mesh>
      <mesh position={[0, 0.62, 0]} material={gold}>
        <cylinderGeometry args={[0.28, 0.28, 0.12, 8]} />
      </mesh>
      <mesh position={[0, -0.62, 0]} material={gold}>
        <cylinderGeometry args={[0.20, 0.25, 0.12, 8]} />
      </mesh>
    </group>
  );
}

function PorcelainTable({ position }: { position: readonly [number, number, number] }) {
  const wood = chunkyMat(DARK_WOOD, { roughness: 1 });
  const white = chunkyMat(PORCELAIN, { roughness: 0.45, metalness: 0.05 });
  const blue = chunkyMat(PORCELAIN_BLUE, { roughness: 0.55 });
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.rotation.y = Math.sin(clock.elapsedTime * 0.65) * 0.10;
  });
  return (
    <group ref={ref} position={position as [number, number, number]}>
      <mesh position={[0, 0.45, 0]} material={wood}>
        <boxGeometry args={[5.4, 0.7, 2.2]} />
      </mesh>
      {[-1.8, 0, 1.8].map((x) => (
        <group key={x} position={[x, 1.05, 0]}>
          <mesh material={white}>
            <cylinderGeometry args={[0.45, 0.35, 0.85, 10]} />
          </mesh>
          <mesh position={[0, 0.22, 0]} material={blue}>
            <torusGeometry args={[0.38, 0.04, 5, 12]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function IncenseAltar({ position }: { position: readonly [number, number, number] }) {
  const stone = chunkyMat(STONE, { roughness: 1 });
  const incense = chunkyMat(INCENSE, { roughness: 1 });
  return (
    <group position={position as [number, number, number]}>
      <mesh position={[0, 0.45, 0]} material={stone}>
        <boxGeometry args={[2.2, 0.9, 1.3]} />
      </mesh>
      {[-0.45, 0, 0.45].map((x) => (
        <mesh key={x} position={[x, 1.3, 0]} rotation={[0.25, 0, 0]} material={incense}>
          <cylinderGeometry args={[0.04, 0.04, 1.2, 5]} />
        </mesh>
      ))}
    </group>
  );
}

export function ManilaParian({ poiId, position, rotationY }: {
  poiId: string;
  position: readonly [number, number, number];
  rotationY: number;
}) {
  void poiId;
  const [ax, , az] = position as [number, number, number];
  const terrainAt = useMemo(() => localTerrain(ax, az, rotationY), [ax, az, rotationY]);
  const anchorY = terrainAt(0, 0);
  const y = (lx: number, lz: number) => Math.max(terrainAt(lx, lz), anchorY) - anchorY;

  const courtyardMat = useMemo(() => chunkyMat([0.54, 0.46, 0.34], { roughness: 1 }), []);
  const smokePos: [number, number, number] = useMemo(() => {
    const c = Math.cos(rotationY);
    const s = Math.sin(rotationY);
    const lx = 0;
    const lz = 5.6;
    return [ax + lx * c + lz * s, anchorY + y(lx, lz) + 2.0, az - lx * s + lz * c];
  }, [ax, az, anchorY, rotationY, terrainAt]);

  const torchSpots: POITorchSpot[] = useMemo(() => {
    const c = Math.cos(rotationY);
    const s = Math.sin(rotationY);
    return [[-5.3, -12.8], [5.3, -12.8], [-10, -1.8], [10, -1.8]].map(([lx, lz]) => ({
      pos: [ax + lx * c + lz * s, anchorY + y(lx, lz) + 2.2, az - lx * s + lz * c] as [number, number, number],
      warmth: 'warm',
    }));
  }, [ax, az, anchorY, rotationY, terrainAt]);

  return (
    <>
      <POITorchInstancer spots={torchSpots} />
      <ChimneySmoke position={smokePos} warmth="cool" scale={0.7} />

      <group position={position as [number, number, number]} rotation={[0, rotationY, 0]}>
        <mesh position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]} material={courtyardMat}>
          <planeGeometry args={[26, 24]} />
        </mesh>

        <PaifangGate position={[0, y(0, -13), -13]} />
        <MerchantHall position={[0, y(0, -3), -3]} />

        <SilkCanopy position={[-6.0, y(-6, 5.6) + 3.2, 5.6]} color={SILK_BLUE} phase={0} />
        <SilkCanopy position={[6.0, y(6, 5.6) + 3.3, 5.6]} color={SILK_GOLD} phase={1.7} />

        <PorcelainTable position={[-5.5, y(-5.5, 1.5), 1.5]} />
        <PorcelainTable position={[5.5, y(5.5, 1.5), 1.5]} />
        <IncenseAltar position={[0, y(0, 5.6), 5.6]} />

        {[[-5.2, -12.7, 0], [5.2, -12.7, 1], [-8.8, 7.6, 2], [8.8, 7.6, 3]].map(([lx, lz, phase]) => (
          <Lantern key={`${lx}:${lz}`} position={[lx, y(lx, lz) + 4.0, lz]} phase={phase} />
        ))}
      </group>
    </>
  );
}
