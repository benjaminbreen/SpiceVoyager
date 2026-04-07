import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import { Ship } from './Ship';
import { Ocean } from './Ocean';
import { World } from './World';
import { UI } from './UI';
import { Player } from './Player';
import { useGameStore } from '../store/gameStore';
import * as THREE from 'three';
import { Suspense, useRef, useEffect } from 'react';
import { getTerrainHeight } from '../utils/terrain';

// Custom camera controller
function CameraController() {
  const { playerPos, walkingPos, playerMode, cameraZoom, setCameraZoom } = useGameStore();
  const { camera, gl } = useThree();
  const currentPos = useRef(new THREE.Vector3());

  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      setCameraZoom(cameraZoom + (e.deltaY > 0 ? 5 : -5));
    };
    gl.domElement.addEventListener('wheel', handleWheel);
    return () => gl.domElement.removeEventListener('wheel', handleWheel);
  }, [cameraZoom, setCameraZoom, gl.domElement]);

  useFrame(() => {
    // Smoothly follow active player (ship or walking)
    const activePos = playerMode === 'ship' ? playerPos : walkingPos;
    const target = new THREE.Vector3(activePos[0], activePos[1], activePos[2]);
    currentPos.current.lerp(target, 0.1);
    
    // Position camera behind and above
    camera.position.x = currentPos.current.x + cameraZoom * 0.5;
    camera.position.y = currentPos.current.y + cameraZoom;
    camera.position.z = currentPos.current.z + cameraZoom;
    
    camera.lookAt(currentPos.current);
  });

  return null;
}

// Interaction controller
function InteractionController() {
  const { 
    playerMode, playerPos, playerRot, walkingPos, 
    setPlayerMode, setWalkingPos, setWalkingRot, setInteractionPrompt,
    ports, discoverPort
  } = useGameStore();

  const nearestLandRef = useRef<[number, number, number] | null>(null);

  useFrame(() => {
    const activePos = playerMode === 'ship' ? playerPos : walkingPos;
    
    // Check for nearby ports to discover
    ports.forEach(port => {
      const dist = Math.sqrt((port.position[0] - activePos[0])**2 + (port.position[2] - activePos[2])**2);
      if (dist < 60) {
        discoverPort(port.id);
      }
    });

    if (playerMode === 'ship') {
      // Find nearest land
      let foundLand: [number, number, number] | null = null;
      let minDist = Infinity;
      
      // Scan in a radius around the ship
      for (let r = 3; r <= 15; r += 3) {
        for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
          const cx = playerPos[0] + Math.cos(a) * r;
          const cz = playerPos[2] + Math.sin(a) * r;
          const height = getTerrainHeight(cx, cz);
          
          if (height > 0.5) { // Definitely on land
            const d = Math.sqrt((cx - playerPos[0])**2 + (cz - playerPos[2])**2);
            if (d < minDist) {
              minDist = d;
              foundLand = [cx, height, cz];
            }
          }
        }
      }

      nearestLandRef.current = foundLand;

      if (foundLand) {
        setInteractionPrompt('Press E to Disembark');
      } else {
        setInteractionPrompt(null);
      }
    } else {
      // Check if near ship to embark
      const dx = walkingPos[0] - playerPos[0];
      const dz = walkingPos[2] - playerPos[2];
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist < 15) {
        setInteractionPrompt('Press E to Embark');
      } else {
        setInteractionPrompt(null);
      }
    }
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'e') {
        const state = useGameStore.getState();
        if (state.interactionPrompt === 'Press E to Disembark' && nearestLandRef.current) {
          state.setWalkingPos(nearestLandRef.current);
          state.setWalkingRot(state.playerRot);
          state.setPlayerMode('walking');
          state.setInteractionPrompt(null);
        } else if (state.interactionPrompt === 'Press E to Embark') {
          state.setPlayerMode('ship');
          state.setInteractionPrompt(null);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return null;
}

// Time controller
function TimeController() {
  const { advanceTime, paused } = useGameStore();
  useFrame((_, delta) => {
    if (paused) return;
    // 1 real second = 0.1 game hours
    advanceTime(delta * 0.1);
  });
  return null;
}

export function Game() {
  return (
    <div className="w-full h-screen bg-black overflow-hidden relative">
      <Canvas shadows={{ type: THREE.PCFShadowMap }} camera={{ position: [0, 50, 50], fov: 45 }}>
        <Suspense fallback={null}>
          <color attach="background" args={['#87CEEB']} />
          <fog attach="fog" args={['#87CEEB', 200, 600]} />
          
          <World />
          <Ocean />
          <Ship />
          <Player />
          
          <CameraController />
          <InteractionController />
          <TimeController />
          
          <EffectComposer>
            <Bloom luminanceThreshold={0.8} luminanceSmoothing={0.9} height={300} intensity={1.5} />
            <Vignette eskil={false} offset={0.1} darkness={1.1} />
          </EffectComposer>
        </Suspense>
      </Canvas>
      <UI />
    </div>
  );
}
