/**
 * HinterlandScenes.tsx — Renders culturally-specific gatherings placed in the
 * outer ring of each port. The NPCs that populate these scenes are spawned by
 * pedestrianSystem.ts; this component only draws the static props. Both sides
 * call placeHinterlandScenes() with the same seed, so positions agree without
 * needing shared state.
 */

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '../store/gameStore';
import { placeHinterlandScenes, SceneInstance } from '../utils/hinterlandScenes';

function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 0 at full day, 1 at full night, smooth through dusk/dawn. */
function nightFactor(hour: number): number {
  if (hour >= 20 || hour < 5) return 1;
  if (hour >= 7 && hour < 17) return 0;
  if (hour >= 17 && hour < 20) return (hour - 17) / 3;
  return 1 - (hour - 5) / 2;
}

// ── Shepherds' fire (European, pastoral) ────────────────────────────────────

function ShepherdsFire({ scene }: { scene: SceneInstance }) {
  const flameMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const lightRef = useRef<THREE.PointLight>(null);
  const flameRef = useRef<THREE.Mesh>(null);

  const sheepPositions = useMemo(() => {
    const rng = mulberry32(scene.seed);
    return Array.from({ length: 3 }, () => {
      const a = rng() * Math.PI * 2;
      const r = 2.4 + rng() * 2.6;
      return { offset: [Math.cos(a) * r, 0, Math.sin(a) * r] as [number, number, number], rot: rng() * Math.PI * 2 };
    });
  }, [scene.seed]);

  useFrame((state) => {
    const hour = useGameStore.getState().timeOfDay;
    const night = nightFactor(hour);
    const t = state.clock.elapsedTime + scene.seed * 0.0013;
    const flicker = 0.75 + Math.sin(t * 5.7) * 0.18 + Math.sin(t * 13.3) * 0.09;
    if (flameMatRef.current) {
      flameMatRef.current.emissiveIntensity = night * flicker * 2.6;
      flameMatRef.current.opacity = night * 0.95;
    }
    if (lightRef.current) lightRef.current.intensity = night * flicker * 3.2;
    if (flameRef.current) {
      flameRef.current.visible = night > 0.02;
      const s = 0.85 + flicker * 0.18;
      flameRef.current.scale.set(s, 0.9 + flicker * 0.2, s);
    }
  });

  return (
    <group position={[scene.x, scene.y, scene.z]}>
      <mesh position={[0, 0.06, 0]} castShadow receiveShadow rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.55, 0.13, 6, 16]} />
        <meshStandardMaterial color="#4a4540" roughness={0.95} />
      </mesh>
      <mesh position={[0, 0.01, 0]} receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.48, 12]} />
        <meshStandardMaterial color="#1a1614" roughness={1} />
      </mesh>
      <mesh ref={flameRef} position={[0, 0.32, 0]}>
        <coneGeometry args={[0.22, 0.55, 6, 1]} />
        <meshStandardMaterial
          ref={flameMatRef}
          color="#ff9340"
          emissive={new THREE.Color('#ff6218')}
          emissiveIntensity={0}
          transparent
          opacity={0}
          depthWrite={false}
        />
      </mesh>
      <pointLight ref={lightRef} position={[0, 0.6, 0]} color="#ff6218" intensity={0} distance={14} decay={2} />
      {sheepPositions.map((s, i) => (
        <group key={i} position={s.offset} rotation={[0, s.rot, 0]}>
          <mesh position={[0, 0.36, 0]} scale={[1.15, 0.8, 0.75]} castShadow>
            <sphereGeometry args={[0.34, 8, 6]} />
            <meshStandardMaterial color="#e2d7c2" roughness={0.95} />
          </mesh>
          <mesh position={[0.33, 0.42, 0]} castShadow>
            <sphereGeometry args={[0.14, 6, 5]} />
            <meshStandardMaterial color="#3a332c" roughness={0.9} />
          </mesh>
          {[[-0.2, 0.15], [0.2, 0.15], [-0.2, -0.15], [0.2, -0.15]].map((p, j) => (
            <mesh key={j} position={[p[0], 0.12, p[1]]} castShadow>
              <cylinderGeometry args={[0.05, 0.04, 0.24, 5]} />
              <meshStandardMaterial color="#2f2a24" roughness={0.9} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

// ── Charcoal-burners' mound (European, forest) ──────────────────────────────

function CharcoalMound({ scene }: { scene: SceneInstance }) {
  const smokeRef = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    const t = state.clock.elapsedTime + scene.seed * 0.0013;
    if (smokeRef.current) {
      const s = 1 + Math.sin(t * 0.7) * 0.15;
      smokeRef.current.scale.set(s, 1 + Math.sin(t * 0.5) * 0.1, s);
      smokeRef.current.rotation.y = t * 0.05;
    }
  });

  return (
    <group position={[scene.x, scene.y, scene.z]}>
      {/* Earthen dome covered in turf — a charcoal kiln mid-burn */}
      <mesh position={[0, 0.4, 0]} castShadow receiveShadow scale={[1.4, 0.6, 1.4]}>
        <sphereGeometry args={[1, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#3d2f22" roughness={1} />
      </mesh>
      {/* Smoke wisp */}
      <mesh ref={smokeRef} position={[0, 1.4, 0]}>
        <sphereGeometry args={[0.45, 8, 6]} />
        <meshStandardMaterial color="#8a8580" roughness={1} transparent opacity={0.35} depthWrite={false} />
      </mesh>
      {/* Axe in stump */}
      <group position={[1.6, 0, 0.3]}>
        <mesh position={[0, 0.18, 0]} castShadow>
          <cylinderGeometry args={[0.3, 0.35, 0.36, 10]} />
          <meshStandardMaterial color="#5a4430" roughness={1} />
        </mesh>
        <mesh position={[0.03, 0.52, 0]} rotation={[0, 0, 0.3]} castShadow>
          <boxGeometry args={[0.06, 0.7, 0.06]} />
          <meshStandardMaterial color="#3a2a1a" roughness={0.95} />
        </mesh>
        <mesh position={[0.15, 0.82, 0]} rotation={[0, 0, 0.3]} castShadow>
          <boxGeometry args={[0.22, 0.1, 0.08]} />
          <meshStandardMaterial color="#3a3a42" roughness={0.4} metalness={0.7} />
        </mesh>
      </group>
      {/* Stack of split logs */}
      <group position={[-1.5, 0, -0.2]}>
        {[0, 1, 2].map(i => (
          <mesh key={i} position={[0, 0.15 + i * 0.18, i * 0.04]} rotation={[0, i * 0.2, 0]} castShadow>
            <cylinderGeometry args={[0.1, 0.1, 0.9, 6]} />
            <meshStandardMaterial color="#5a4028" roughness={1} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

// ── Coffee / brazier mat (Indian Ocean, arid) ───────────────────────────────

function CoffeeMat({ scene }: { scene: SceneInstance }) {
  const glowRef = useRef<THREE.MeshStandardMaterial>(null);
  useFrame((state) => {
    const t = state.clock.elapsedTime + scene.seed * 0.002;
    if (glowRef.current) {
      glowRef.current.emissiveIntensity = 0.7 + Math.sin(t * 3) * 0.2;
    }
  });

  return (
    <group position={[scene.x, scene.y, scene.z]}>
      {/* Reed mat — low flat disc */}
      <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[1.8, 18]} />
        <meshStandardMaterial color="#b89860" roughness={0.95} />
      </mesh>
      {/* Small embers patch */}
      <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.22, 10]} />
        <meshStandardMaterial
          ref={glowRef}
          color="#3a1a0c"
          emissive={new THREE.Color('#ff5a18')}
          emissiveIntensity={0.7}
        />
      </mesh>
      {/* Dallah (brass coffee pot) — body + spout + handle */}
      <group position={[0.15, 0, 0.1]}>
        <mesh position={[0, 0.18, 0]} castShadow>
          <cylinderGeometry args={[0.12, 0.18, 0.36, 10]} />
          <meshStandardMaterial color="#b8863a" roughness={0.35} metalness={0.7} />
        </mesh>
        <mesh position={[0, 0.42, 0]} castShadow>
          <coneGeometry args={[0.13, 0.2, 10]} />
          <meshStandardMaterial color="#b8863a" roughness={0.35} metalness={0.7} />
        </mesh>
        <mesh position={[0.2, 0.3, 0]} rotation={[0, 0, -0.9]} castShadow>
          <cylinderGeometry args={[0.015, 0.025, 0.22, 6]} />
          <meshStandardMaterial color="#b8863a" roughness={0.35} metalness={0.7} />
        </mesh>
      </group>
      {/* Low cushions */}
      {[[-1.0, 0.4], [0.4, -1.0], [1.0, 0.5]].map((p, i) => (
        <mesh key={i} position={[p[0], 0.08, p[1]]} castShadow receiveShadow>
          <boxGeometry args={[0.55, 0.14, 0.55]} />
          <meshStandardMaterial color={i === 0 ? '#6a2a28' : i === 1 ? '#3a4a6a' : '#4a3a2a'} roughness={0.95} />
        </mesh>
      ))}
    </group>
  );
}

// ── Roadside shrine (Indian Ocean, tropical) ────────────────────────────────

function RoadsideShrine({ scene }: { scene: SceneInstance }) {
  const lampRef = useRef<THREE.MeshStandardMaterial>(null);
  const lightRef = useRef<THREE.PointLight>(null);
  useFrame((state) => {
    const hour = useGameStore.getState().timeOfDay;
    const night = nightFactor(hour);
    const t = state.clock.elapsedTime + scene.seed * 0.003;
    const flicker = 0.8 + Math.sin(t * 4) * 0.15;
    // Small oil lamp glows lightly by day, brighter at night.
    const base = 0.4 + night * 1.8;
    if (lampRef.current) lampRef.current.emissiveIntensity = base * flicker;
    if (lightRef.current) lightRef.current.intensity = night * flicker * 1.6;
  });

  return (
    <group position={[scene.x, scene.y, scene.z]}>
      {/* Plinth */}
      <mesh position={[0, 0.2, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.8, 0.4, 0.8]} />
        <meshStandardMaterial color="#8a7a5a" roughness={0.95} />
      </mesh>
      {/* Pillar-stone (lingam-like, simplified abstract form) */}
      <mesh position={[0, 0.65, 0]} castShadow>
        <cylinderGeometry args={[0.2, 0.24, 0.5, 10]} />
        <meshStandardMaterial color="#a0907a" roughness={0.9} />
      </mesh>
      {/* Flower offering — a flat disc of red */}
      <mesh position={[0, 0.92, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.18, 10]} />
        <meshStandardMaterial color="#c83a2a" roughness={0.9} />
      </mesh>
      {/* Small oil lamp on plinth edge */}
      <group position={[0.28, 0.42, 0.28]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.07, 0.09, 0.05, 8]} />
          <meshStandardMaterial color="#a88848" roughness={0.5} metalness={0.4} />
        </mesh>
        <mesh position={[0, 0.04, 0]}>
          <sphereGeometry args={[0.04, 6, 5]} />
          <meshStandardMaterial
            ref={lampRef}
            color="#ffcc60"
            emissive={new THREE.Color('#ffa030')}
            emissiveIntensity={0.4}
          />
        </mesh>
      </group>
      <pointLight ref={lightRef} position={[0.28, 0.55, 0.28]} color="#ffa030" intensity={0} distance={8} decay={2} />
      {/* A few scattered flower petals on the ground */}
      {[[0.4, 0.5], [-0.6, 0.2], [-0.2, -0.5], [0.5, -0.3]].map((p, i) => (
        <mesh key={i} position={[p[0], 0.02, p[1]]} rotation={[-Math.PI / 2, 0, i]}>
          <circleGeometry args={[0.06, 6]} />
          <meshStandardMaterial color={i % 2 ? '#e84a32' : '#f2c038'} roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

// ── Palm-wine tappers' bench (West African, tropical) ───────────────────────

function PalmWineBench({ scene }: { scene: SceneInstance }) {
  const calabashPositions = useMemo(() => {
    const rng = mulberry32(scene.seed);
    return Array.from({ length: 4 }, (_, i) => ({
      x: -0.6 + i * 0.4 + (rng() - 0.5) * 0.08,
      rot: rng() * Math.PI * 2,
      tilt: (rng() - 0.5) * 0.2,
    }));
  }, [scene.seed]);

  return (
    <group position={[scene.x, scene.y, scene.z]}>
      {/* Palm stump — tall thin cylinder with textured fronds top */}
      <mesh position={[-1.8, 0.9, 0]} castShadow>
        <cylinderGeometry args={[0.22, 0.28, 1.8, 8]} />
        <meshStandardMaterial color="#6a4a28" roughness={1} />
      </mesh>
      {/* Fronds */}
      {[0, 1, 2, 3, 4].map(i => {
        const ang = (i / 5) * Math.PI * 2;
        return (
          <mesh
            key={i}
            position={[-1.8 + Math.cos(ang) * 0.6, 1.8, Math.sin(ang) * 0.6]}
            rotation={[0, ang, -0.5]}
            castShadow
          >
            <boxGeometry args={[1.2, 0.06, 0.18]} />
            <meshStandardMaterial color="#4a7028" roughness={0.95} />
          </mesh>
        );
      })}
      {/* Collection bucket strapped to stump */}
      <mesh position={[-1.55, 1.2, 0]} castShadow>
        <cylinderGeometry args={[0.16, 0.14, 0.28, 8]} />
        <meshStandardMaterial color="#8a6a3a" roughness={0.95} />
      </mesh>
      {/* Low bench */}
      <mesh position={[0.2, 0.3, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.8, 0.08, 0.4]} />
        <meshStandardMaterial color="#6a4a28" roughness={0.95} />
      </mesh>
      {[[-0.7, 0.15, 0.15], [0.7, 0.15, 0.15], [-0.7, 0.15, -0.15], [0.7, 0.15, -0.15]].map((p, i) => (
        <mesh key={i} position={[0.2 + p[0], p[1], p[2]]} castShadow>
          <cylinderGeometry args={[0.05, 0.05, 0.3, 5]} />
          <meshStandardMaterial color="#5a3a20" roughness={0.95} />
        </mesh>
      ))}
      {/* Calabash gourds in a row on the bench */}
      {calabashPositions.map((c, i) => (
        <mesh
          key={i}
          position={[0.2 + c.x, 0.46, 0]}
          rotation={[c.tilt, c.rot, 0]}
          castShadow
          scale={[1, 0.85, 1]}
        >
          <sphereGeometry args={[0.16, 8, 6]} />
          <meshStandardMaterial color="#d8c078" roughness={0.95} />
        </mesh>
      ))}
    </group>
  );
}

// ── Cattle-watering trough (Atlantic, savanna) ──────────────────────────────

function CattleTrough({ scene }: { scene: SceneInstance }) {
  const cattlePositions = useMemo(() => {
    const rng = mulberry32(scene.seed);
    return Array.from({ length: 3 }, () => {
      const a = rng() * Math.PI * 2;
      const r = 1.6 + rng() * 1.5;
      return { offset: [Math.cos(a) * r, 0, Math.sin(a) * r] as [number, number, number], rot: rng() * Math.PI * 2 };
    });
  }, [scene.seed]);

  return (
    <group position={[scene.x, scene.y, scene.z]}>
      {/* Stone trough */}
      <mesh position={[0, 0.25, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.4, 0.5, 0.7]} />
        <meshStandardMaterial color="#8a7a64" roughness={1} />
      </mesh>
      {/* Water surface recessed into top */}
      <mesh position={[0, 0.48, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[2.2, 0.55]} />
        <meshStandardMaterial color="#4a6a7a" roughness={0.3} metalness={0.1} transparent opacity={0.85} />
      </mesh>
      {/* Cattle — reddish-brown ellipsoids with small head + horns */}
      {cattlePositions.map((c, i) => (
        <group key={i} position={c.offset} rotation={[0, c.rot, 0]}>
          <mesh position={[0, 0.55, 0]} scale={[1.5, 0.95, 0.9]} castShadow>
            <sphereGeometry args={[0.45, 10, 7]} />
            <meshStandardMaterial color={i % 2 === 0 ? '#7a3a20' : '#5a2a18'} roughness={0.95} />
          </mesh>
          <mesh position={[0.55, 0.62, 0]} castShadow>
            <sphereGeometry args={[0.2, 8, 6]} />
            <meshStandardMaterial color={i % 2 === 0 ? '#6a2a18' : '#4a2014'} roughness={0.95} />
          </mesh>
          {/* Horns */}
          <mesh position={[0.62, 0.78, 0.12]} rotation={[0, 0, 0.9]} castShadow>
            <cylinderGeometry args={[0.015, 0.03, 0.16, 5]} />
            <meshStandardMaterial color="#e8dcc0" roughness={0.8} />
          </mesh>
          <mesh position={[0.62, 0.78, -0.12]} rotation={[0, 0, 0.9]} castShadow>
            <cylinderGeometry args={[0.015, 0.03, 0.16, 5]} />
            <meshStandardMaterial color="#e8dcc0" roughness={0.8} />
          </mesh>
          {/* Legs */}
          {[[-0.3, 0.2], [0.3, 0.2], [-0.3, -0.2], [0.3, -0.2]].map((p, j) => (
            <mesh key={j} position={[p[0], 0.2, p[1]]} castShadow>
              <cylinderGeometry args={[0.07, 0.06, 0.4, 5]} />
              <meshStandardMaterial color="#3a1e12" roughness={0.95} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

// ── Top-level renderer ──────────────────────────────────────────────────────

export function HinterlandScenes() {
  const ports = useGameStore(s => s.ports);
  const worldSeed = useGameStore(s => s.worldSeed);

  const scenes = useMemo(() => {
    if (ports.length === 0) return [];
    const port = ports[0];
    return placeHinterlandScenes(
      port.position[0], port.position[2],
      port.culture, port.buildings, worldSeed,
    );
  }, [ports, worldSeed]);

  if (scenes.length === 0) return null;

  return (
    <group>
      {scenes.map((scene, i) => {
        switch (scene.kind) {
          case 'shepherds-fire':   return <ShepherdsFire   key={i} scene={scene} />;
          case 'charcoal-mound':   return <CharcoalMound   key={i} scene={scene} />;
          case 'coffee-mat':       return <CoffeeMat       key={i} scene={scene} />;
          case 'roadside-shrine':  return <RoadsideShrine  key={i} scene={scene} />;
          case 'palm-wine-bench':  return <PalmWineBench   key={i} scene={scene} />;
          case 'cattle-trough':    return <CattleTrough    key={i} scene={scene} />;
          default: return null;
        }
      })}
    </group>
  );
}
