import { Canvas, useFrame } from '@react-three/fiber';
import { Suspense, useMemo, useRef, useState, type ComponentType } from 'react';
import * as THREE from 'three';
import type { POIDefinition, POIKind } from '../utils/poiDefinitions';
import { SocotraGrove } from './poi/SocotraGrove';
import { HormuzPearlBazaar } from './poi/HormuzPearlBazaar';
import { NagasakiPress } from './poi/NagasakiPress';
import { BantamKrakatoa } from './poi/BantamKrakatoa';
import { VeniceSpezieria } from './poi/VeniceSpezieria';
import { LisbonCasaDaIndia } from './poi/LisbonCasaDaIndia';
import { SevilleCasaContratacion } from './poi/SevilleCasaContratacion';
import { ManilaParian } from './poi/ManilaParian';

type POIRenderer = ComponentType<{
  poiId: string;
  position: readonly [number, number, number];
  rotationY: number;
}>;

interface PreviewConfig {
  Component: POIRenderer;
  scale: number;
  y: number;
  rotationY: number;
  camera: [number, number, number];
  target: [number, number, number];
}

const PREVIEW_MODEL_SCALE = 0.84;
const PREVIEW_MODEL_MAX_SCALE = 0.4;

const PREVIEW_CONFIG: Record<string, PreviewConfig> = {
  'socotra-dragons-blood-grove': {
    Component: SocotraGrove,
    scale: 0.86,
    y: -1.15,
    rotationY: 0.9,
    camera: [15, 9, 19],
    target: [0, 2.4, 0],
  },
  'hormuz-pearl-divers-bazaar': {
    Component: HormuzPearlBazaar,
    scale: 0.76,
    y: -0.95,
    rotationY: 3.05,
    camera: [15, 8.5, 18],
    target: [0, 2.4, 0],
  },
  'nagasaki-jesuit-press': {
    Component: NagasakiPress,
    scale: 0.68,
    y: -1.05,
    rotationY: 1.1,
    camera: [15, 9, 19],
    target: [0, 2.8, 0],
  },
  'bantam-krakatoa': {
    Component: BantamKrakatoa,
    scale: 0.74,
    y: -1.25,
    rotationY: 0.2,
    camera: [15, 10, 19],
    target: [0, 4, 0],
  },
  'venice-theriac-spezieria': {
    Component: VeniceSpezieria,
    scale: 0.74,
    y: -1.0,
    rotationY: 0.95,
    camera: [15, 8.8, 18.5],
    target: [0, 2.8, 0],
  },
  'lisbon-casa-da-india': {
    Component: LisbonCasaDaIndia,
    scale: 0.68,
    y: -1.18,
    rotationY: -0.85,
    camera: [16, 8.7, 19],
    target: [0, 2.4, 0],
  },
  'seville-casa-contratacion': {
    Component: SevilleCasaContratacion,
    scale: 0.7,
    y: -1.05,
    rotationY: -0.95,
    camera: [16, 8.8, 19],
    target: [0, 2.6, 0],
  },
  'manila-sangley-parian': {
    Component: ManilaParian,
    scale: 0.66,
    y: -1.0,
    rotationY: -0.75,
    camera: [16, 8.8, 19],
    target: [0, 2.6, 0],
  },
};

export function hasPOIModelPreview(poi: POIDefinition): boolean {
  return poi.id in PREVIEW_CONFIG;
}

export function POIModelPreview({ poi }: { poi: POIDefinition }) {
  const config = PREVIEW_CONFIG[poi.id] ?? fallbackPreviewConfig(poi);
  const [dragRotation, setDragRotation] = useState(0);
  const [dragStart, setDragStart] = useState<{ x: number; rotation: number } | null>(null);

  return (
    <div
      className="h-full w-full cursor-grab active:cursor-grabbing"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        setDragStart({ x: e.clientX, rotation: dragRotation });
      }}
      onPointerMove={(e) => {
        if (!dragStart) return;
        setDragRotation(dragStart.rotation + (e.clientX - dragStart.x) * 0.012);
      }}
      onPointerUp={(e) => {
        e.currentTarget.releasePointerCapture(e.pointerId);
        setDragStart(null);
      }}
      onPointerCancel={() => setDragStart(null)}
    >
      <Canvas
        camera={{ fov: 38, near: 0.1, far: 180, position: config.camera }}
        dpr={[1, 1.5]}
        gl={{ antialias: true, alpha: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.18 }}
        style={{ background: 'transparent' }}
        shadows
      >
        <Suspense fallback={null}>
          <PreviewScene poi={poi} config={config} dragRotation={dragRotation} />
        </Suspense>
      </Canvas>
    </div>
  );
}

function fallbackPreviewConfig(poi: POIDefinition): PreviewConfig {
  const Component = FALLBACK_BY_KIND[poi.kind] ?? NaturalistPreview;
  return {
    Component,
    scale: poi.kind === 'natural' ? 0.92 : 0.78,
    y: poi.kind === 'natural' ? -1.35 : -1.0,
    rotationY: seededRotation(poi.id),
    camera: poi.kind === 'natural' ? [14, 10, 18] : [15, 8.8, 18.5],
    target: poi.kind === 'natural' ? [0, 3.4, 0] : [0, 2.6, 0],
  };
}

const FALLBACK_BY_KIND: Record<POIKind, POIRenderer> = {
  naturalist: NaturalistPreview,
  garden: GardenPreview,
  shrine: ShrinePreview,
  ruin: RuinPreview,
  wreck: WreckPreview,
  smugglers_cove: CovePreview,
  caravanserai: CaravanseraiPreview,
  natural: NaturalPreview,
};

function seededRotation(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) / 0xffffffff) * Math.PI * 2;
}

function PreviewScene({
  poi,
  config,
  dragRotation,
}: {
  poi: POIDefinition;
  config: PreviewConfig;
  dragRotation: number;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const Component = config.Component;
  const target = useMemo(() => new THREE.Vector3(...config.target), [config.target]);
  const modelScale = Math.min(config.scale * PREVIEW_MODEL_SCALE, PREVIEW_MODEL_MAX_SCALE);

  useFrame(({ camera }) => {
    camera.lookAt(target);
    if (groupRef.current) {
      groupRef.current.rotation.y = config.rotationY + dragRotation;
    }
  });

  return (
    <>
      <ambientLight intensity={0.42} />
      <hemisphereLight args={['#f2d39b', '#08101a', 0.55]} />
      <directionalLight position={[8, 12, 6]} intensity={3.9} color="#ffd08a" />
      <directionalLight position={[-9, 5, -7]} intensity={0.55} color="#82b7d6" />
      <spotLight
        position={[-7, 11, 10]}
        angle={0.42}
        penumbra={0.72}
        intensity={2.2}
        color="#fff1c7"
      />
      <pointLight position={[5, 4, -6]} intensity={0.55} color="#7fb9c8" />
      <group ref={groupRef} position={[0, config.y, 0]} scale={modelScale}>
        <Component poiId={poi.id} position={[0, 0, 0]} rotationY={0} />
      </group>
    </>
  );
}

const matCache = new Map<string, THREE.MeshStandardMaterial>();

function mat(color: string, roughness = 0.9, metalness = 0) {
  const key = `${color}:${roughness}:${metalness}`;
  const cached = matCache.get(key);
  if (cached) return cached;
  const created = new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness,
    flatShading: true,
  });
  matCache.set(key, created);
  return created;
}

function NaturalistPreview({ position, rotationY }: PreviewProps) {
  return (
    <group position={position as [number, number, number]} rotation={[0, rotationY, 0]}>
      <CompoundBase />
      <mesh position={[0, 1.15, 0]} material={mat('#d8d0b8')}>
        <boxGeometry args={[8, 2.3, 5.4]} />
      </mesh>
      <mesh position={[0, 2.65, 0]} material={mat('#8f5a3c')}>
        <boxGeometry args={[8.8, 0.55, 6.0]} />
      </mesh>
      <mesh position={[-3.7, 3.25, -1.9]} material={mat('#2f5d50')}>
        <coneGeometry args={[0.32, 1.7, 4]} />
      </mesh>
      <mesh position={[3.2, 1.05, -3.1]} material={mat('#7f5132')}>
        <boxGeometry args={[2.2, 1.1, 1.2]} />
      </mesh>
      <mesh position={[-2.1, 1.22, -3.15]} material={mat('#4f3825')}>
        <boxGeometry args={[2.8, 1.0, 0.8]} />
      </mesh>
    </group>
  );
}

function GardenPreview({ position, rotationY }: PreviewProps) {
  return (
    <group position={position as [number, number, number]} rotation={[0, rotationY, 0]}>
      <CompoundBase color="#4e5d38" />
      <WallRing color="#b8a56d" />
      {[-3, 0, 3].map((x) => (
        <mesh key={x} position={[x, 0.24, 0]} material={mat('#355f35')}>
          <boxGeometry args={[0.8, 0.48, 5.2]} />
        </mesh>
      ))}
      <mesh position={[0, 1.2, -3.0]} material={mat('#d7c18b')}>
        <cylinderGeometry args={[1.15, 1.35, 2.4, 8]} />
      </mesh>
      <mesh position={[0, 2.75, -3.0]} material={mat('#a63f30')}>
        <coneGeometry args={[1.7, 1.15, 8]} />
      </mesh>
    </group>
  );
}

function ShrinePreview({ position, rotationY }: PreviewProps) {
  return (
    <group position={position as [number, number, number]} rotation={[0, rotationY, 0]}>
      <CompoundBase color="#242018" />
      <mesh position={[0, 0.45, 0]} material={mat('#bfa66f')}>
        <cylinderGeometry args={[3.9, 4.2, 0.9, 8]} />
      </mesh>
      <mesh position={[0, 1.75, 0]} material={mat('#d8d0b8')}>
        <boxGeometry args={[4.6, 2.6, 4.6]} />
      </mesh>
      <mesh position={[0, 3.7, 0]} material={mat('#b78645')}>
        <coneGeometry args={[3.2, 2.3, 4]} />
      </mesh>
      <mesh position={[3.8, 2.2, -1.6]} material={mat('#c7b082')}>
        <cylinderGeometry args={[0.35, 0.42, 4.4, 8]} />
      </mesh>
      <mesh position={[3.8, 4.7, -1.6]} material={mat('#b78645')}>
        <coneGeometry args={[0.8, 1.2, 8]} />
      </mesh>
    </group>
  );
}

function RuinPreview({ position, rotationY }: PreviewProps) {
  return (
    <group position={position as [number, number, number]} rotation={[0, rotationY, 0]}>
      <CompoundBase color="#343026" />
      <mesh position={[-2.8, 1.25, 0]} material={mat('#8a8067')}>
        <boxGeometry args={[1.0, 2.5, 5.8]} />
      </mesh>
      <mesh position={[1.8, 0.9, -1.6]} rotation={[0.1, 0, -0.16]} material={mat('#7a705b')}>
        <boxGeometry args={[1.0, 1.8, 4.4]} />
      </mesh>
      <mesh position={[0, 0.35, 1.9]} rotation={[0, 0.5, 0]} material={mat('#6c624f')}>
        <boxGeometry args={[4.2, 0.7, 1.1]} />
      </mesh>
      <mesh position={[2.8, 0.45, 2.5]} material={mat('#756b55')}>
        <boxGeometry args={[1.2, 0.9, 1.0]} />
      </mesh>
    </group>
  );
}

function WreckPreview({ position, rotationY }: PreviewProps) {
  return (
    <group position={position as [number, number, number]} rotation={[0, rotationY, 0]}>
      <mesh position={[0, 0.15, 0]} rotation={[0, 0, 0.55]} material={mat('#6f4a2d')}>
        <boxGeometry args={[8.5, 2.1, 2.8]} />
      </mesh>
      <mesh position={[-0.8, 2.3, 0]} rotation={[0, 0, -0.55]} material={mat('#3b2617')}>
        <cylinderGeometry args={[0.14, 0.18, 5.6, 7]} />
      </mesh>
      <mesh position={[1.6, 0.15, -2.5]} rotation={[1.45, 0.2, 0.8]} material={mat('#3b2617')}>
        <cylinderGeometry args={[0.12, 0.12, 4.2, 7]} />
      </mesh>
    </group>
  );
}

function CovePreview({ position, rotationY }: PreviewProps) {
  return (
    <group position={position as [number, number, number]} rotation={[0, rotationY, 0]}>
      <mesh position={[0, 1.7, 2.2]} material={mat('#625d51')}>
        <boxGeometry args={[8.4, 3.4, 2.0]} />
      </mesh>
      <mesh position={[-2.2, 0.8, -0.5]} material={mat('#513823')}>
        <boxGeometry args={[3.5, 1.6, 2.4]} />
      </mesh>
      <mesh position={[-2.2, 2.0, -0.5]} material={mat('#8a7547')}>
        <coneGeometry args={[2.6, 1.2, 4]} />
      </mesh>
      <mesh position={[2.7, 0.45, -2.5]} material={mat('#6f4a2d')}>
        <boxGeometry args={[4.5, 0.28, 1.0]} />
      </mesh>
    </group>
  );
}

function CaravanseraiPreview({ position, rotationY }: PreviewProps) {
  return (
    <group position={position as [number, number, number]} rotation={[0, rotationY, 0]}>
      <CompoundBase color="#5c4630" />
      <WallRing color="#b78b57" />
      {[[-4, -4], [4, -4], [-4, 4], [4, 4]].map(([x, z]) => (
        <mesh key={`${x}:${z}`} position={[x, 1.5, z]} material={mat('#c09a63')}>
          <boxGeometry args={[1.4, 3.0, 1.4]} />
        </mesh>
      ))}
      <mesh position={[0, 1.7, -4.4]} material={mat('#3c2515')}>
        <boxGeometry args={[2.4, 2.5, 0.55]} />
      </mesh>
    </group>
  );
}

function NaturalPreview({ position, rotationY }: PreviewProps) {
  return (
    <group position={position as [number, number, number]} rotation={[0, rotationY, 0]}>
      <mesh position={[0, 0, 0]} material={mat('#2b342b')}>
        <cylinderGeometry args={[5.8, 6.5, 0.5, 18]} />
      </mesh>
      <mesh position={[0, 3.0, 0]} material={mat('#4f4639')}>
        <coneGeometry args={[4.6, 6.0, 9]} />
      </mesh>
      <mesh position={[0, 6.25, 0]} material={mat('#2a2420')}>
        <cylinderGeometry args={[0.75, 1.0, 0.6, 9]} />
      </mesh>
      <mesh position={[-1.8, 1.7, 1.9]} material={mat('#43563a')}>
        <coneGeometry args={[1.4, 3.4, 7]} />
      </mesh>
      <mesh position={[2.5, 1.4, -1.2]} material={mat('#50613d')}>
        <coneGeometry args={[1.2, 2.8, 7]} />
      </mesh>
    </group>
  );
}

function CompoundBase({ color = '#2b271d' }: { color?: string }) {
  return (
    <mesh position={[0, -0.03, 0]} material={mat(color)}>
      <cylinderGeometry args={[6.2, 6.8, 0.16, 18]} />
    </mesh>
  );
}

function WallRing({ color }: { color: string }) {
  return (
    <group>
      <mesh position={[0, 0.85, -4.6]} material={mat(color)}>
        <boxGeometry args={[9.5, 1.7, 0.55]} />
      </mesh>
      <mesh position={[0, 0.85, 4.6]} material={mat(color)}>
        <boxGeometry args={[9.5, 1.7, 0.55]} />
      </mesh>
      <mesh position={[-4.6, 0.85, 0]} material={mat(color)}>
        <boxGeometry args={[0.55, 1.7, 9.5]} />
      </mesh>
      <mesh position={[4.6, 0.85, 0]} material={mat(color)}>
        <boxGeometry args={[0.55, 1.7, 9.5]} />
      </mesh>
    </group>
  );
}

type PreviewProps = {
  poiId: string;
  position: readonly [number, number, number];
  rotationY: number;
};
