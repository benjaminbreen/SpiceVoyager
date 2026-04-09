import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { EffectComposer, Bloom, Vignette, BrightnessContrast, HueSaturation } from '@react-three/postprocessing';
import { Ship } from './Ship';
import { Ocean } from './Ocean';
import { World } from './World';
import { UI } from './UI';
import { Player } from './Player';
import { GameOverScreen } from './GameOverScreen';
import { useGameStore } from '../store/gameStore';
import { ambientEngine } from '../audio/AmbientEngine';
import { sfxDisembark, sfxEmbark, sfxBattleStations, sfxAnchorDrop, sfxAnchorWeigh } from '../audio/SoundEffects';
import { audioManager } from '../audio/AudioManager';
import * as THREE from 'three';
import { Suspense, useRef, useEffect, useMemo } from 'react';
import { ShiftSelectOverlay } from './ShiftSelectOverlay';
import { getTerrainHeight, getTerrainData, BiomeType } from '../utils/terrain';
import { SEA_LEVEL } from '../constants/world';
import {
  getLiveShipTransform,
  getLiveWalkingTransform,
} from '../utils/livePlayerTransform';

// ── Landfall descriptions keyed to biome + terrain data ──────────────────────
function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

function landfallDescription(x: number, z: number): { title: string; subtitle: string } {
  const td = getTerrainData(x, z);
  const steep = td.coastSteepness > 0.6;
  const high = td.height > 12;

  const phrases: Record<string, { titles: string[]; subtitles: string[] }> = {
    beach: steep
      ? { titles: ['Scrambled ashore on a rocky coast', 'Climbed onto a craggy shoreline', 'Reached a wind-beaten rocky shore'],
          subtitles: ['Sharp stones and tide pools underfoot.', 'Gulls wheel above the spray.', 'The rocks are slick with brine.'] }
      : { titles: ['Made landfall on a sandy shore', 'Waded onto a stretch of white sand', 'Reached a quiet beach'],
          subtitles: ['Warm sand, gentle surf.', 'Crabs scatter at your approach.', 'Shells crunch underfoot.'] },
    desert: {
      titles: ['Stepped onto sun-baked sand', 'Made landfall on a barren coast', 'Reached a parched and dusty shore'],
      subtitles: ['The air shimmers with heat.', 'Not a drop of fresh water in sight.', 'Dry wind carries the scent of dust.'],
    },
    grassland: {
      titles: ['Found footing on a grassy headland', 'Reached a green and windswept shore', 'Made landfall on rolling coastal hills'],
      subtitles: ['Tall grass bends in the breeze.', 'The land smells of earth and rain.', 'A pleasant coast, open and airy.'],
    },
    forest: {
      titles: ['Landed beneath a canopy of trees', 'Made landfall on a wooded coast', 'Reached a forested shore'],
      subtitles: ['Birdsong from the treetops.', 'Dappled light through the leaves.', 'Timber aplenty here.'],
    },
    jungle: {
      titles: ['Pushed ashore through dense foliage', 'Landed on a tangled jungle coast', 'Reached a shore thick with vegetation'],
      subtitles: ['The air is heavy and humid.', 'Insects drone in the undergrowth.', 'Vines and roots crowd the shoreline.'],
    },
    swamp: {
      titles: ['Waded ashore through brackish shallows', 'Made landfall in marshy ground', 'Reached a muddy, waterlogged coast'],
      subtitles: ['The ground squelches underfoot.', 'Stagnant water and buzzing flies.', 'A miserable stretch of bog.'],
    },
    arroyo: {
      titles: ['Climbed onto dry, reddish rock', 'Made landfall on a sun-scorched canyon rim', 'Reached an arid, rocky shore'],
      subtitles: ['Cracked earth and sparse scrub.', 'The rock is warm to the touch.', 'A desolate but striking landscape.'],
    },
    snow: {
      titles: ['Landed on a frost-covered shore', 'Made landfall on frozen ground', 'Reached a bleak and icy coast'],
      subtitles: ['Snow crunches underfoot.', 'The cold bites immediately.', 'A bitter wind off the peaks.'],
    },
    volcano: {
      titles: ['Stepped onto black volcanic rock', 'Made landfall on a smoldering shore', 'Reached a coast of dark basalt'],
      subtitles: ['The ground radiates faint warmth.', 'Sulfur hangs in the air.', 'A forbidding, primordial landscape.'],
    },
  };

  const biome: string = td.biome === 'ocean' || td.biome === 'river' || td.biome === 'waterfall'
    ? (steep ? 'beach' : 'grassland') // fallback for water biomes at land edge
    : td.biome;

  const pool = phrases[biome] ?? phrases.beach;
  return { title: pick(pool.titles), subtitle: pick(pool.subtitles) };
}

// Custom camera controller
function CameraController() {
  const setCameraZoom = useGameStore((state) => state.setCameraZoom);
  const { camera, gl } = useThree();
  const currentPos = useRef(new THREE.Vector3());
  const targetPos = useRef(new THREE.Vector3());

  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      const { cameraZoom } = useGameStore.getState();
      setCameraZoom(cameraZoom + (e.deltaY > 0 ? 5 : -5));
    };
    gl.domElement.addEventListener('wheel', handleWheel);
    return () => gl.domElement.removeEventListener('wheel', handleWheel);
  }, [gl, setCameraZoom]);

  useFrame((_, delta) => {
    const { playerMode, cameraZoom, viewMode } = useGameStore.getState();
    const shipTransform = getLiveShipTransform();
    const walkingTransform = getLiveWalkingTransform();
    const activePos = playerMode === 'ship' ? shipTransform.pos : walkingTransform.pos;
    const activeRot = playerMode === 'ship' ? shipTransform.rot : walkingTransform.rot;
    targetPos.current.set(activePos[0], activePos[1], activePos[2]);

    if (playerMode === 'ship') {
      currentPos.current.copy(targetPos.current);
    } else {
      const followAlpha = 1 - Math.exp(-delta * 14);
      currentPos.current.lerp(targetPos.current, followAlpha);
    }

    if (viewMode === 'firstperson') {
      // First-person: camera at eye level, looking in heading direction
      camera.position.x = currentPos.current.x;
      camera.position.y = currentPos.current.y + (playerMode === 'ship' ? 4 : 2);
      camera.position.z = currentPos.current.z;
      camera.lookAt(
        currentPos.current.x + Math.sin(activeRot) * 10,
        currentPos.current.y + (playerMode === 'ship' ? 3 : 1.5),
        currentPos.current.z + Math.cos(activeRot) * 10
      );
    } else if (viewMode === 'cinematic') {
      // Cinematic: close behind-and-above follow with offset behind the heading
      const dist = Math.min(cameraZoom, 20);
      camera.position.x = currentPos.current.x - Math.sin(activeRot) * dist * 0.8;
      camera.position.y = currentPos.current.y + dist * 0.5;
      camera.position.z = currentPos.current.z - Math.cos(activeRot) * dist * 0.8;
      camera.lookAt(
        currentPos.current.x + Math.sin(activeRot) * 5,
        currentPos.current.y + 1,
        currentPos.current.z + Math.cos(activeRot) * 5
      );
    } else if (viewMode === 'topdown') {
      // Top-down strategic view
      camera.position.x = currentPos.current.x;
      camera.position.y = currentPos.current.y + cameraZoom * 1.5;
      camera.position.z = currentPos.current.z + 0.01; // tiny offset to avoid gimbal lock
      camera.lookAt(currentPos.current);
    } else {
      // Default: original 45-degree diagonal view
      camera.position.x = currentPos.current.x + cameraZoom * 0.5;
      camera.position.y = currentPos.current.y + cameraZoom;
      camera.position.z = currentPos.current.z + cameraZoom;
      camera.lookAt(currentPos.current);
    }
  });

  return null;
}

// Interaction controller
function InteractionController() {
  const nearestLandRef = useRef<[number, number, number] | null>(null);
  const nextCheckRef = useRef(0);
  const promptRef = useRef<string | null>(null);

  useFrame((_, delta) => {
    nextCheckRef.current -= delta;
    if (nextCheckRef.current > 0) return;
    nextCheckRef.current = 0.1;

    const {
      playerMode,
      ports,
      discoverPort,
      setInteractionPrompt,
    } = useGameStore.getState();
    const shipTransform = getLiveShipTransform();
    const walkingTransform = getLiveWalkingTransform();
    const playerPos = shipTransform.pos;
    const playerRot = shipTransform.rot;
    const walkingPos = walkingTransform.pos;
    const activePos = playerMode === 'ship' ? playerPos : walkingPos;
    
    // Check for nearby ports to discover
    ports.forEach(port => {
      const dist = Math.sqrt((port.position[0] - activePos[0])**2 + (port.position[2] - activePos[2])**2);
      if (dist < 60) {
        discoverPort(port.id);
      }
    });

    if (playerMode === 'ship') {
      // Find nearest land — require height well above sea level so we don't
      // detect tiny noise spikes that the rendered terrain grid doesn't show.
      let foundLand: [number, number, number] | null = null;
      let minDist = Infinity;
      const LAND_THRESHOLD = SEA_LEVEL + 0.6;

      // Scan in a radius around the ship
      for (let r = 3; r <= 12; r += 3) {
        for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
          const cx = playerPos[0] + Math.cos(a) * r;
          const cz = playerPos[2] + Math.sin(a) * r;
          const height = getTerrainHeight(cx, cz);

          if (height > LAND_THRESHOLD) {
            const d = Math.sqrt((cx - playerPos[0])**2 + (cz - playerPos[2])**2);
            if (d < minDist) {
              minDist = d;
              foundLand = [cx, height, cz];
            }
          }
        }
      }

      nearestLandRef.current = foundLand;

      const nextPrompt = foundLand ? 'Press E to Disembark' : null;
      if (promptRef.current !== nextPrompt) {
        promptRef.current = nextPrompt;
        setInteractionPrompt(nextPrompt);
      }
    } else {
      // Check if near ship to embark
      const dx = walkingPos[0] - playerPos[0];
      const dz = walkingPos[2] - playerPos[2];
      const dist = Math.sqrt(dx * dx + dz * dz);

      const nextPrompt = dist < 15 ? 'Press E to Embark' : null;
      if (promptRef.current !== nextPrompt) {
        promptRef.current = nextPrompt;
        setInteractionPrompt(nextPrompt);
      }
    }
  }, -1);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      const state = useGameStore.getState();
      if (key === 'e') {
        if (state.interactionPrompt === 'Press E to Disembark' && nearestLandRef.current) {
          const landPos = nearestLandRef.current;
          const { rot } = getLiveShipTransform();
          state.setWalkingPos(landPos);
          state.setWalkingRot(rot);
          state.setPlayerMode('walking');
          state.setInteractionPrompt(null);
          sfxDisembark();
          // Landfall toast based on terrain biome
          const desc = landfallDescription(landPos[0], landPos[2]);
          state.addNotification(desc.title, 'info', { size: 'grand', subtitle: desc.subtitle });
        } else if (state.interactionPrompt === 'Press E to Embark') {
          state.setPlayerMode('ship');
          state.setInteractionPrompt(null);
          sfxEmbark();
        }
      } else if (key === 't') {
        if (state.interactionPrompt === 'Press T to Hail') {
          // Placeholder — will open dialogue in the future
          state.addNotification('They signal back but keep their distance.', 'info');
        }
      } else if (key === 'f' && state.playerMode === 'ship') {
        // Toggle combat mode
        const next = !state.combatMode;
        state.setCombatMode(next);
        if (next) {
          // Entering fight mode unanchors
          if (state.anchored) state.setAnchored(false);
          sfxBattleStations();
          audioManager.startFightMusic();
          state.addNotification('Battle stations!', 'info');
        } else {
          audioManager.stopFightMusic();
          state.addNotification('Standing down.', 'info');
        }
      } else if (key === ' ' && state.playerMode === 'ship') {
        e.preventDefault();
        if (state.combatMode) {
          // Spacebar in combat mode = fire swivel gun (tap)
          // TODO: hold-spacebar aiming mode with cursor targeting
          window.dispatchEvent(new CustomEvent('fire-swivel'));
        } else {
          // Spacebar in normal mode = toggle anchor
          const nextAnchored = !state.anchored;
          state.setAnchored(nextAnchored);
          if (nextAnchored) {
            sfxAnchorDrop();
            state.addNotification('Anchor dropped.', 'info');
          } else {
            sfxAnchorWeigh();
            state.addNotification('Weighing anchor.', 'info');
          }
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
  const advanceTime = useGameStore((state) => state.advanceTime);
  const paused = useGameStore((state) => state.paused);
  const accumulatedDelta = useRef(0);
  const ambientAccum = useRef(0);

  useFrame((_, delta) => {
    if (paused) return;
    accumulatedDelta.current += delta;
    if (accumulatedDelta.current < 0.05) return;

    // 1 real second = 0.1 game hours
    advanceTime(accumulatedDelta.current * 0.1);
    accumulatedDelta.current = 0;

    // Update ambient soundscape at ~500ms intervals
    ambientAccum.current += delta;
    if (ambientAccum.current > 0.5) {
      ambientAccum.current = 0;
      const s = useGameStore.getState();
      ambientEngine.update({
        playerMode: s.playerMode,
        playerPos: s.playerPos,
        walkingPos: s.walkingPos,
        ports: s.ports,
        speed: s.stats.speed,
        playerRot: s.playerRot,
        timeOfDay: s.timeOfDay,
        paused: s.paused,
      });
    }
  });
  return null;
}

// Syncs fog color, background color, and computes postprocessing params from timeOfDay
function useAtmosphere() {
  const timeOfDay = useGameStore((state) => state.timeOfDay);

  return useMemo(() => {
    const angle = ((timeOfDay - 6) / 24) * Math.PI * 2;
    const sunH = Math.sin(angle);
    const horizonFactor = Math.exp(-sunH * sunH * 10);

    // Sky and fog are related, but fog should be less saturated than the sky
    // or distant views turn uniformly blue when zoomed out.
    let skyColor: THREE.Color;
    let fogColor: THREE.Color;
    if (sunH > 0.3) {
      // Full day
      skyColor = new THREE.Color('#87CEEB');
      fogColor = new THREE.Color('#b2c3c9');
    } else if (sunH > 0.05) {
      // Golden hour — warm sky
      const t = (sunH - 0.05) / 0.25;
      skyColor = new THREE.Color().lerpColors(
        new THREE.Color('#d4845a'),
        new THREE.Color('#87CEEB'),
        t
      );
      fogColor = new THREE.Color().lerpColors(
        new THREE.Color('#c5a48f'),
        new THREE.Color('#b2c3c9'),
        t
      );
    } else if (sunH > -0.15) {
      // Sunset/sunrise — warm to midnight blue
      const t = (sunH + 0.15) / 0.2;
      skyColor = new THREE.Color().lerpColors(
        new THREE.Color('#1a2a52'),
        new THREE.Color('#d4845a'),
        t
      );
      fogColor = new THREE.Color().lerpColors(
        new THREE.Color('#1a2338'),
        new THREE.Color('#c5a48f'),
        t
      );
    } else {
      // Night — lush midnight blue
      skyColor = new THREE.Color('#0f1f42');
      fogColor = new THREE.Color('#121b2f');
    }

    // Daytime haze should sit farther out so wide ocean views stay clearer.
    const fogNear = sunH > 0 ? 340 : 120 + Math.max(0, sunH + 0.3) * 420;
    const fogFar = sunH > 0 ? 1100 : 360 + Math.max(0, sunH + 0.3) * 1100;

    // Postprocessing — golden hour warm, night cool/desaturated
    let brightness = 0;
    let contrast = 0;
    let hue = 0;
    let saturation = 0;

    if (sunH > 0.3) {
      // Day — neutral
      brightness = 0;
      contrast = 0;
      saturation = 0.05;
    } else if (sunH > -0.05) {
      // Golden hour — warm, slightly saturated
      const t = Math.max(0, Math.min(1, (0.3 - sunH) / 0.35));
      brightness = -0.02 * t;
      contrast = 0.05 * t;
      hue = 0.05 * t;
      saturation = 0.15 * t;
    } else {
      // Night — blue-shifted, slightly saturated for lush midnight feel
      const t = Math.max(0, Math.min(1, (-0.05 - sunH) / 0.3));
      brightness = -0.03 * t;
      contrast = 0;
      hue = -0.12 * t;
      saturation = 0.1 * t;
    }

    return { skyColor, fogColor, fogNear, fogFar, brightness, contrast, hue, saturation };
  }, [timeOfDay]);
}

// Syncs Three.js fog and background with computed atmosphere colors
function AtmosphereSync() {
  const { skyColor, fogColor, fogNear, fogFar } = useAtmosphere();
  const { scene } = useThree();

  useFrame(() => {
    if (scene.background instanceof THREE.Color) {
      scene.background.copy(skyColor);
    }
    if (scene.fog instanceof THREE.Fog) {
      scene.fog.color.copy(fogColor);
      scene.fog.near = fogNear;
      scene.fog.far = fogFar;
    }
  });

  return null;
}

export function Game() {
  const shadowsEnabled = useGameStore((state) => state.renderDebug.shadows);
  const postprocessingEnabled = useGameStore((state) => state.renderDebug.postprocessing);
  const bloomEnabled = useGameStore((state) => state.renderDebug.bloom);
  const vignetteEnabled = useGameStore((state) => state.renderDebug.vignette);

  return (
    <div className="w-full h-screen bg-black overflow-hidden relative">
      <Canvas
        dpr={[1, 2]}
        gl={{ antialias: true, powerPreference: 'high-performance', toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.1 }}
        shadows={shadowsEnabled ? { type: THREE.PCFSoftShadowMap } : false}
        camera={{ position: [0, 50, 50], fov: 45 }}
      >
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
          <AtmosphereSync />
          <ShiftSelectOverlay />

          {postprocessingEnabled && (
            <PostProcessing bloomEnabled={bloomEnabled} vignetteEnabled={vignetteEnabled} />
          )}
        </Suspense>
      </Canvas>
      <UI />
      <GameOverScreen />
    </div>
  );
}

function PostProcessing({ bloomEnabled, vignetteEnabled }: { bloomEnabled: boolean; vignetteEnabled: boolean }) {
  const { brightness, contrast, hue, saturation } = useAtmosphere();

  return (
    <EffectComposer>
      {bloomEnabled && <Bloom luminanceThreshold={0.8} luminanceSmoothing={0.9} height={300} intensity={1.1} />}
      <BrightnessContrast brightness={brightness} contrast={contrast} />
      <HueSaturation hue={hue} saturation={saturation} />
      {vignetteEnabled && <Vignette eskil={false} offset={0.18} darkness={0.85} />}
    </EffectComposer>
  );
}
