import { useRef, useMemo, useEffect, type RefObject } from 'react';
import { useFrame, useLoader, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { Water } from 'three-stdlib';
import { useGameStore } from '../store/gameStore';
import { SEA_LEVEL } from '../constants/world';
import { getTerrainData } from '../utils/terrain';
import { getWaterPalette, resolveWaterPaletteId } from '../utils/waterPalettes';
import { getLiveShipTransform } from '../utils/livePlayerTransform';

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

const WATER_SURFACE_OFFSET = -0.5;
const SHALLOW_TINT_OFFSET = .32;
const WAKE_SURFACE_OFFSET = 0.045;
const FOAM_SURFACE_OFFSET = 0.35;
const ALGAE_SURFACE_OFFSET = 0.035;
const CAUSTIC_SURFACE_OFFSET = 0.005;
const WATER_SURFACE_ALPHA = 0.75;
const WATER_OVERLAY_LAYER = 1;

function useWaterOverlayLayer(ref: RefObject<THREE.Object3D | null>) {
  useEffect(() => {
    ref.current?.layers.set(WATER_OVERLAY_LAYER);
  }, [ref]);
}

function WaterOverlayCameraLayer() {
  const { camera } = useThree();

  useEffect(() => {
    camera.layers.enable(WATER_OVERLAY_LAYER);
    return () => {
      camera.layers.disable(WATER_OVERLAY_LAYER);
    };
  }, [camera]);

  return null;
}

function ShallowWaterTint() {
  const meshRef = useRef<THREE.Mesh>(null);
  useWaterOverlayLayer(meshRef);
  const worldSeed = useGameStore((state) => state.worldSeed);
  const worldSize = useGameStore((state) => state.worldSize);
  const devSoloPort = useGameStore((state) => state.devSoloPort);
  const currentWorldPortId = useGameStore((state) => state.currentWorldPortId);
  const waterPaletteId = useGameStore((state) => resolveWaterPaletteId(state));
  const waterPalette = useMemo(() => getWaterPalette(waterPaletteId), [waterPaletteId]);

  const { geometry, material } = useMemo(() => {
    const baseSize = devSoloPort ? 1000 : 900;
    const size = baseSize + 250;
    const segments = Math.min(192, Math.max(72, Math.round(size * 0.12)));
    const geo = new THREE.PlaneGeometry(size, size, segments, segments);
    const position = geo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(position.count * 3);
    const alphas = new Float32Array(position.count);
    const foamIntensities = new Float32Array(position.count);
    const reefFactors = new Float32Array(position.count);
    const shoreEdges = new Float32Array(position.count);

    const _turquoiseBase = new THREE.Color().setRGB(...waterPalette.oceanOverlay.base);
    const _paleSurf = new THREE.Color().setRGB(...waterPalette.oceanOverlay.paleSurf);
    const _outerShallow = new THREE.Color().setRGB(...waterPalette.oceanOverlay.outerShallow);
    const turquoise = new THREE.Color();

    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i);
      const worldZ = -position.getY(i);
      const terrain = getTerrainData(x, worldZ);
      const tintStrength = Math.min(1, terrain.shallowFactor * 1.55 + terrain.surfFactor * 1.15 + terrain.wetSandFactor * 0.38);

      // Only tint below sea level — above-water terrain is handled by land geometry
      const aboveWater = terrain.height >= SEA_LEVEL;
      const depthBelowSea = SEA_LEVEL - terrain.height;
      const depthFade = aboveWater ? 0 : 1 - smoothstep(0.5, 6.2, depthBelowSea);
      const alpha =
        tintStrength *
        0.68 *
        (1 - terrain.coastSteepness * 0.20) *
        depthFade;
      turquoise.copy(_turquoiseBase);
      turquoise.lerp(_outerShallow, terrain.shallowFactor * 0.68);
      turquoise.lerp(_paleSurf, terrain.surfFactor * 0.58);

      colors[i * 3] = turquoise.r;
      colors[i * 3 + 1] = turquoise.g;
      colors[i * 3 + 2] = turquoise.b;
      alphas[i] = alpha;

      // Foam intensity: strongest in the surf zone, fades into shallows
      const foam = terrain.surfFactor * 0.9 + terrain.wetSandFactor * 0.4;
      foamIntensities[i] = Math.min(1, foam) * (1 - terrain.coastSteepness * 0.5);

      reefFactors[i] = terrain.reefFactor;

      // Shore edge: dark band at the waterline for coastline definition
      if (depthBelowSea > 0 && depthBelowSea < 2.5) {
        const proximity = Math.max(0, 1 - depthBelowSea * 0.55);
        shoreEdges[i] = proximity * Math.min(1, terrain.surfFactor * 2.5 + terrain.shallowFactor * 1.0)
          * (0.55 + terrain.coastSteepness * 0.45);
      } else {
        shoreEdges[i] = 0;
      }
    }

    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setAttribute('aAlpha', new THREE.Float32BufferAttribute(alphas, 1));
    geo.setAttribute('aFoam', new THREE.Float32BufferAttribute(foamIntensities, 1));
    geo.setAttribute('aReef', new THREE.Float32BufferAttribute(reefFactors, 1));
    geo.setAttribute('aShoreEdge', new THREE.Float32BufferAttribute(shoreEdges, 1));

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uDaylight: { value: 1.0 },
      },
      vertexShader: /* glsl */ `
        uniform float uTime;
        attribute float aAlpha;
        attribute float aFoam;
        attribute float aReef;
        attribute float aShoreEdge;
        varying vec3 vColor;
        varying float vAlpha;
        varying float vFoam;
        varying float vReef;
        varying float vShoreEdge;
        varying vec2 vWorldXZ;

        void main() {
          vColor = color;
          vAlpha = aAlpha;
          vFoam = aFoam;
          vReef = aReef;
          vShoreEdge = aShoreEdge;
          vWorldXZ = position.xy; // plane is XY before rotation

          vec3 pos = position;
          // Gentle wave displacement in shallows — scaled by alpha so deep ocean stays flat
          float wave = sin(pos.x * 0.3 + uTime * 1.2) * cos(pos.y * 0.25 + uTime * 0.8) * 0.15 * aAlpha;
          wave += sin(pos.x * 0.7 - uTime * 0.9 + pos.y * 0.4) * 0.08 * aAlpha;
          pos.z += wave; // Z is up before the -PI/2 rotation

          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uDaylight;
        varying vec3 vColor;
        varying float vAlpha;
        varying float vFoam;
        varying float vReef;
        varying float vShoreEdge;
        varying vec2 vWorldXZ;

        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }
        float noise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(hash(i), hash(i + vec2(1, 0)), f.x),
            mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x),
            f.y
          );
        }

        void main() {
          float alpha = vAlpha;
          vec3 col = vColor;

          // Animated foam in the surf zone
          if (vFoam > 0.01) {
            // Approximate shore-normal from alpha gradient — foam drifts shoreward
            float dAdx = dFdx(vAlpha);
            float dAdy = dFdy(vAlpha);
            float gradLen = length(vec2(dAdx, dAdy));
            // Shore direction: toward increasing alpha (toward coast)
            vec2 shoreDir = gradLen > 0.0001 ? normalize(vec2(dAdx, dAdy)) : vec2(0.0, 1.0);

            // Two octaves of noise scrolling toward shore
            float drift = uTime * 0.6;
            float n1 = noise(vWorldXZ * 0.8 + shoreDir * drift);
            float n2 = noise(vWorldXZ * 2.5 + shoreDir * drift * 0.7 + vec2(17.0));
            float foam = n1 * 0.6 + n2 * 0.4;

            // Rolling wave crests — parallel lines perpendicular to shore that sweep in
            float waveFront = dot(vWorldXZ, shoreDir) * 0.4 - uTime * 0.8;
            float crest = pow(max(0.0, sin(waveFront)), 3.0) * 0.35;
            foam = max(foam, foam + crest);

            // Threshold to create patchy foam rather than uniform white
            float foamMask = smoothstep(0.32, 0.58, foam) * vFoam;

            // Mix toward foam color — darken at night
            vec3 foamColor = mix(vec3(0.12, 0.14, 0.18), vec3(0.82, 0.90, 0.92), uDaylight);
            col = mix(col, foamColor, foamMask * 0.74);
            alpha = max(alpha, foamMask * 0.36);
          }

          // Coral reef caustic shimmer — warm dappled light over reef patches (suppressed at night)
          if (vReef > 0.1 && uDaylight > 0.15) {
            float caustic = noise(vWorldXZ * 1.2 + uTime * vec2(0.12, -0.08));
            caustic = smoothstep(0.55, 0.65, caustic);
            vec3 reefWarm = mix(vec3(0.75, 0.48, 0.58), vec3(0.40, 0.72, 0.58), caustic);
            col = mix(col, reefWarm, vReef * 0.3 * uDaylight);
            alpha = max(alpha, vReef * 0.22 * uDaylight);
          }

          // Shoreline shadow — dark edge right at the water-land boundary
          if (vShoreEdge > 0.02) {
            float edgeNoise = noise(vWorldXZ * 1.8 + vec2(3.7)) * 0.25 + 0.75;
            float edgeStrength = vShoreEdge * edgeNoise;
            // Dark teal shadow that reads as depth at the shoreline
            vec3 shoreDay = vec3(0.12, 0.20, 0.24);
            vec3 shoreNight = vec3(0.04, 0.07, 0.10);
            vec3 shoreColor = mix(shoreNight, shoreDay, uDaylight);
            col = mix(col, shoreColor, edgeStrength * 0.75);
            alpha = max(alpha, edgeStrength * 0.70);
          }

          // Darken shallow tint at night — both color and opacity
          col *= (0.25 + 0.75 * uDaylight);
          alpha *= (0.5 + 0.5 * uDaylight);

          if (alpha < 0.01) discard;
          gl_FragColor = vec4(col, alpha);
        }
      `,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
      side: THREE.DoubleSide,
    });

    return { geometry: geo, material: mat };
  }, [currentWorldPortId, devSoloPort, waterPalette, worldSeed, worldSize]);

  useFrame((state) => {
    if (meshRef.current) {
      const mat = meshRef.current.material as THREE.ShaderMaterial;
      mat.uniforms.uTime.value = state.clock.elapsedTime;

      // Daylight factor: 1 = full day, 0 = deep night
      const time = useGameStore.getState().timeOfDay;
      const theta = ((time - 6) / 24) * Math.PI * 2;
      const sunH = Math.sin(theta);
      mat.uniforms.uDaylight.value = smoothstep(-0.15, 0.25, sunH);
    }
  });

  useEffect(() => {
    return () => {
      geometry.dispose();
      material.dispose();
    };
  }, [geometry, material]);

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      material={material}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, SEA_LEVEL + SHALLOW_TINT_OFFSET, 0]}
      renderOrder={1}
    />
  );
}

// Trail-based ship wake that follows the ship's actual path (curves with turns)
function ShipWake() {
  const meshRef = useRef<THREE.Mesh>(null);
  useWaterOverlayLayer(meshRef);

  const TRAIL_LENGTH = 80;
  const SAMPLE_DIST = 0.35; // sample every ~0.35 world units of travel

  interface TrailPoint {
    x: number; z: number;     // stern position
    perpX: number; perpZ: number; // perpendicular to travel direction
    speed: number;
    turn: number;             // signed turn intensity, -1 to 1
  }

  const trailRef = useRef<TrailPoint[]>([]);
  const lastPos = useRef<[number, number]>([0, 0]);
  const lastRot = useRef(0);

  const { geometry, material } = useMemo(() => {
    const vertCount = TRAIL_LENGTH * 2;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(vertCount * 3), 3));
    geo.setAttribute('aAlpha', new THREE.Float32BufferAttribute(new Float32Array(vertCount), 1));
    geo.setAttribute('aUv', new THREE.Float32BufferAttribute(new Float32Array(vertCount * 2), 2));

    const indices: number[] = [];
    for (let i = 0; i < TRAIL_LENGTH - 1; i++) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    geo.setIndex(indices);

    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uDaylight: { value: 1.0 } },
      vertexShader: /* glsl */ `
        attribute float aAlpha;
        attribute vec2 aUv;
        varying float vAlpha;
        varying vec2 vUv;
        void main() {
          vAlpha = aAlpha;
          vUv = aUv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uDaylight;
        varying float vAlpha;
        varying vec2 vUv;

        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
        float noise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f*f*(3.0-2.0*f);
          return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),
                     mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y);
        }
        float fbm(vec2 p) {
          float v = 0.0, a = 0.5;
          mat2 rot = mat2(0.877,0.479,-0.479,0.877);
          for (int i = 0; i < 3; i++) { v += a*noise(p); p = rot*p*2.0+vec2(100.0); a *= 0.5; }
          return v;
        }

        void main() {
          if (vAlpha < 0.01) discard;

          // Foam turbulence along the trail
          float foam = fbm(vUv * vec2(2.0, 15.0) + uTime * vec2(0.2, -0.8));
          foam = foam * 0.6 + 0.4;

          // Soft edges — fade to transparent at ribbon edges
          float edgeDist = abs(vUv.x - 0.5) * 2.0;
          float edgeFade = 1.0 - smoothstep(0.5, 1.0, edgeDist);

          // Two-layer wake: broad disturbed water plus a brighter stern churn.
          float centerDist = abs(vUv.x - 0.5) * 2.0;
          float centerChurn = 1.0 - smoothstep(0.0, 0.38, centerDist);
          centerChurn *= 1.0 - smoothstep(0.0, 0.92, vUv.y);
          float outerWash = edgeFade * 0.58;

          float wakeShape = outerWash + centerChurn * 0.92;
          float alpha = vAlpha * foam * wakeShape;
          if (alpha < 0.01) discard;

          vec3 dayColor = mix(vec3(0.7, 0.87, 0.97), vec3(0.93, 0.97, 1.0), alpha + centerChurn * 0.25);
          vec3 nightColor = mix(vec3(0.08, 0.12, 0.18), vec3(0.15, 0.18, 0.22), alpha);
          vec3 color = mix(nightColor, dayColor, uDaylight);
          gl_FragColor = vec4(color, alpha * 0.62);
        }
      `,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -2,
      side: THREE.DoubleSide,
    });

    return { geometry: geo, material: mat };
  }, []);

  const prevTrailLen = useRef(0);

  useFrame((state) => {
    const shipTransform = getLiveShipTransform();
    const speed = Math.abs(shipTransform.vel);
    const [px, , pz] = shipTransform.pos;
    const rot = shipTransform.rot;
    const dirX = Math.sin(rot);
    const dirZ = Math.cos(rot);
    const rawTurn = Math.atan2(Math.sin(rot - lastRot.current), Math.cos(rot - lastRot.current));
    const turn = THREE.MathUtils.clamp(rawTurn * 8, -1, 1);
    lastRot.current = rot;

    // Stern position (~2.5 units behind ship center)
    const sternX = px - dirX * 2.5;
    const sternZ = pz - dirZ * 2.5;

    // Sample by distance traveled (not time) so trail density is consistent
    const dx = sternX - lastPos.current[0];
    const dz = sternZ - lastPos.current[1];
    const distMoved = Math.sqrt(dx * dx + dz * dz);
    const movingEnough = distMoved > 0.001;
    const travelX = movingEnough ? dx / distMoved : dirX;
    const travelZ = movingEnough ? dz / distMoved : dirZ;
    const perpX = -travelZ;
    const perpZ = travelX;

    if (distMoved > SAMPLE_DIST || trailRef.current.length === 0) {
      lastPos.current = [sternX, sternZ];
      trailRef.current.unshift({
        x: sternX, z: sternZ,
        perpX, perpZ,
        speed,
        turn,
      });
      if (trailRef.current.length > TRAIL_LENGTH) trailRef.current.pop();
    } else if (trailRef.current.length > 0) {
      // Update the newest point to track current stern (smooth interpolation)
      const newest = trailRef.current[0];
      newest.x = sternX;
      newest.z = sternZ;
      newest.perpX = perpX;
      newest.perpZ = perpZ;
      newest.speed = speed;
      newest.turn = turn;
    }

    // Rebuild geometry from trail
    const trail = trailRef.current;
    const positions = geometry.attributes.position.array as Float32Array;
    const alphas = geometry.attributes.aAlpha.array as Float32Array;
    const uvs = geometry.attributes.aUv.array as Float32Array;
    const len = trail.length;

    for (let i = 0; i < TRAIL_LENGTH; i++) {
      const vi = i * 2;
      if (i < len) {
        const pt = trail[i];
        const age = i / Math.max(len - 1, 1); // 0 = newest, 1 = oldest
        const speedFactor = Math.min(pt.speed / 7, 1);
        const wakeStrength = pt.speed > 0.05 ? Math.min(1, 0.18 + speedFactor * 1.05) : 0;
        const turnStrength = Math.abs(pt.turn);
        // Width: starts narrow at stern, widens slightly, then narrows as it fades
        const widthCurve = Math.sin(Math.min(age * 3.0, Math.PI)) * 0.6 + 0.4;
        const width = (0.42 + speedFactor * 1.05 + turnStrength * 0.55) * widthCurve;
        // The outside of a turn throws a slightly wider, brighter wash.
        const turnBias = pt.turn * turnStrength * (0.18 + speedFactor * 0.14);
        const leftWidth = width * (1 + turnBias);
        const rightWidth = width * (1 - turnBias);

        positions[vi * 3]       = pt.x + pt.perpX * leftWidth;
        positions[vi * 3 + 1]   = SEA_LEVEL + WAKE_SURFACE_OFFSET;
        positions[vi * 3 + 2]   = pt.z + pt.perpZ * leftWidth;
        positions[(vi+1) * 3]   = pt.x - pt.perpX * rightWidth;
        positions[(vi+1) * 3 + 1] = SEA_LEVEL + WAKE_SURFACE_OFFSET;
        positions[(vi+1) * 3 + 2] = pt.z - pt.perpZ * rightWidth;

        // Alpha fades with age, scales with speed
        const a = Math.pow(1 - age, 1.65) * wakeStrength * (1 + turnStrength * 0.4);
        alphas[vi] = a * (1 + Math.max(0, turnBias));
        alphas[vi + 1] = a * (1 + Math.max(0, -turnBias));

        uvs[vi * 2] = 0;       uvs[vi * 2 + 1] = age;
        uvs[(vi+1) * 2] = 1;   uvs[(vi+1) * 2 + 1] = age;
      } else {
        positions[vi * 3 + 1] = -100;
        positions[(vi+1) * 3 + 1] = -100;
        alphas[vi] = 0;
        alphas[vi + 1] = 0;
      }
    }

    geometry.attributes.position.needsUpdate = true;
    (geometry.attributes.aAlpha as THREE.BufferAttribute).needsUpdate = true;
    (geometry.attributes.aUv as THREE.BufferAttribute).needsUpdate = true;
    const curLen = trailRef.current.length;
    if (curLen !== prevTrailLen.current) {
      geometry.computeBoundingSphere();
      prevTrailLen.current = curLen;
    }

    material.uniforms.uTime.value = state.clock.elapsedTime;

    const time = useGameStore.getState().timeOfDay;
    const theta = ((time - 6) / 24) * Math.PI * 2;
    const sunH = Math.sin(theta);
    material.uniforms.uDaylight.value = smoothstep(-0.15, 0.25, sunH);
  });

  return <mesh ref={meshRef} geometry={geometry} material={material} renderOrder={3} />;
}

// Small shader overlay for bow foam and hull waterline — follows the ship
function BowFoam() {
  const meshRef = useRef<THREE.Mesh>(null);
  useWaterOverlayLayer(meshRef);

  const shaderArgs = useMemo(() => ({
    uniforms: {
      uTime: { value: 0 },
      uShipPos: { value: new THREE.Vector3() },
      uShipDir: { value: new THREE.Vector2(0, 1) },
      uShipSpeed: { value: 0.0 },
      uDaylight: { value: 1.0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorldPosition;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPosition = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uShipPos;
      uniform vec2 uShipDir;
      uniform float uShipSpeed;
      uniform float uDaylight;
      varying vec3 vWorldPosition;

      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),
                   mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y);
      }
      float fbm(vec2 p) {
        float v = 0.0, a = 0.5;
        mat2 rot = mat2(0.877,0.479,-0.479,0.877);
        for (int i = 0; i < 3; i++) { v += a*noise(p); p = rot*p*2.0+vec2(100.0); a *= 0.5; }
        return v;
      }

      void main() {
        if (uShipSpeed < 0.3) discard;

        vec2 toFrag = vWorldPosition.xz - uShipPos.xz;
        float ahead = dot(toFrag, uShipDir);      // positive = in front
        float lateral = toFrag.x * uShipDir.y - toFrag.y * uShipDir.x;
        float absLat = abs(lateral);
        float dist = length(toFrag);
        float speedFactor = clamp(uShipSpeed / 12.0, 0.0, 1.0);
        float alpha = 0.0;

        // Bow wave — small V diverging from prow
        if (ahead > 1.5 && ahead < 5.0 + speedFactor * 2.0) {
          float bowDist = ahead - 1.5;
          float spread = bowDist * 0.5;
          float bowV = exp(-(absLat - spread) * (absLat - spread) * 4.0);
          float bowCenter = exp(-absLat * absLat * 3.0) * max(0.0, 1.0 - bowDist / 3.0);
          float fade = exp(-bowDist * 0.5);
          float foam = fbm(vec2(ahead * 3.0 + uTime * 2.5, lateral * 4.0)) * 0.5 + 0.5;
          alpha = (bowV * 0.5 + bowCenter * 0.8) * fade * foam * speedFactor * speedFactor;
        }

        if (alpha < 0.01) discard;
        vec3 dayColor = mix(vec3(0.75, 0.88, 0.97), vec3(0.95, 0.98, 1.0), alpha);
        vec3 nightColor = mix(vec3(0.06, 0.10, 0.16), vec3(0.12, 0.15, 0.20), alpha);
        vec3 color = mix(nightColor, dayColor, uDaylight);
        gl_FragColor = vec4(color, alpha * 0.5);
      }
    `,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -2,
  }), []);

  useFrame((state) => {
    if (!meshRef.current) return;
    const mat = meshRef.current.material as THREE.ShaderMaterial;
    const shipTransform = getLiveShipTransform();
    mat.uniforms.uTime.value = state.clock.elapsedTime;
    mat.uniforms.uShipPos.value.set(
      shipTransform.pos[0],
      shipTransform.pos[1],
      shipTransform.pos[2],
    );
    mat.uniforms.uShipSpeed.value = Math.abs(shipTransform.vel);
    mat.uniforms.uShipDir.value.set(
      Math.sin(shipTransform.rot),
      Math.cos(shipTransform.rot),
    );

    const time = useGameStore.getState().timeOfDay;
    const theta = ((time - 6) / 24) * Math.PI * 2;
    const sunH = Math.sin(theta);
    mat.uniforms.uDaylight.value = smoothstep(-0.15, 0.25, sunH);

    meshRef.current.position.x = shipTransform.pos[0];
    meshRef.current.position.z = shipTransform.pos[2];
  });

  return (
    <mesh
      ref={meshRef}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, SEA_LEVEL + FOAM_SURFACE_OFFSET, 0]}
      renderOrder={4}
    >
      <planeGeometry args={[20, 20, 1, 1]} />
      <shaderMaterial args={[shaderArgs]} side={THREE.DoubleSide} />
    </mesh>
  );
}

// Bioluminescent algae — rare glowing patches that react to the ship's wake
function PhosphorescentAlgae() {
  const meshRef = useRef<THREE.Mesh>(null);
  useWaterOverlayLayer(meshRef);

  const shaderArgs = useMemo(() => ({
    uniforms: {
      uTime: { value: 0 },
      uPlayerPos: { value: new THREE.Vector3() },
      uShipDir: { value: new THREE.Vector2(0, 1) },
      uShipSpeed: { value: 0 },
      uNightFactor: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vWorldXZ;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldXZ = wp.xz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uPlayerPos;
      uniform vec2 uShipDir;
      uniform float uShipSpeed;
      uniform float uNightFactor;
      varying vec2 vWorldXZ;

      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float hash2(vec2 p) { return fract(sin(dot(p, vec2(269.5,183.3))) * 43758.5453); }

      // Smooth noise for organic cluster shapes
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),
                   mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y);
      }

      void main() {
        if (uNightFactor < 0.05) discard;

        float totalGlow = 0.0;

        // --- Ambient patches: rare, organic-shaped clusters ---
        // Use noise to create irregular patch shapes instead of grid dots
        float patchNoise = noise(vWorldXZ * 0.04 + 50.0);
        float patchMask = smoothstep(0.72, 0.78, patchNoise); // only top ~25% of noise = patches
        if (patchMask > 0.0) {
          // Within a patch, add individual glowing motes
          vec2 cell = floor(vWorldXZ * 0.8);
          float h = hash(cell + 17.0);
          if (h < 0.12) {
            vec2 center = (cell + 0.5 + (hash2(cell + 17.0) - 0.5) * 0.7) / 0.8;
            float d = length(vWorldXZ - center);
            // Slow, dreamy pulsing at different rates
            float pulse = sin(uTime * (0.4 + h * 0.8) + h * 6.28) * 0.3 + 0.7;
            // Occasional bright flare (rare sine alignment)
            float flare = pow(max(0.0, sin(uTime * 0.15 + h * 100.0)), 8.0) * 1.5;
            totalGlow += exp(-d * d * 10.0) * (pulse + flare) * patchMask * 0.5;
          }
          // Tiny secondary motes within patches
          vec2 cell2 = floor(vWorldXZ * 2.5);
          float h2 = hash(cell2 + 77.0);
          if (h2 < 0.06) {
            vec2 center2 = (cell2 + 0.5 + (hash2(cell2 + 77.0) - 0.5) * 0.5) / 2.5;
            float d2 = length(vWorldXZ - center2);
            float twinkle = sin(uTime * (1.5 + h2 * 3.0) + h2 * 6.28) * 0.5 + 0.5;
            totalGlow += exp(-d2 * d2 * 40.0) * twinkle * patchMask * 0.3;
          }
        }

        // --- Wake-reactive glow: disturbed water lights up ---
        vec2 toFrag = vWorldXZ - uPlayerPos.xz;
        float behind = -dot(toFrag, uShipDir); // positive = behind ship
        float lateral = abs(toFrag.x * uShipDir.y - toFrag.y * uShipDir.x);
        float speedFactor = clamp(uShipSpeed / 8.0, 0.0, 1.0);

        if (behind > 1.0 && behind < 25.0 && speedFactor > 0.1) {
          // Wake zone — widens with distance behind
          float wakeWidth = 1.0 + behind * 0.15;
          float wakeFade = exp(-behind * 0.12);
          float inWake = exp(-lateral * lateral / (wakeWidth * wakeWidth) * 2.0);
          // Turbulent sparkle in the wake
          float wakeNoise = noise(vWorldXZ * 3.0 + uTime * vec2(0.3, -1.2));
          float wakeGlow = inWake * wakeFade * speedFactor * wakeNoise * 0.8;
          totalGlow += wakeGlow;
        }

        // Proximity glow — faint ring around the hull from disturbance
        float hullDist = length(toFrag);
        if (hullDist < 6.0 && speedFactor > 0.05) {
          float ring = exp(-(hullDist - 3.0) * (hullDist - 3.0) * 0.8) * speedFactor;
          float ringNoise = noise(vWorldXZ * 5.0 + uTime * 1.5);
          totalGlow += ring * ringNoise * 0.4;
        }

        // Fade with distance from player
        float playerDist = length(toFrag);
        float distFade = 1.0 - smoothstep(50.0, 100.0, playerDist);

        float alpha = totalGlow * uNightFactor * distFade * 0.5;
        if (alpha < 0.01) discard;

        // Bioluminescent color — mostly blue-green, patches vary subtly
        float colorSeed = noise(vWorldXZ * 0.05);
        vec3 color = mix(vec3(0.0, 0.85, 0.55), vec3(0.05, 0.45, 0.95), colorSeed);
        gl_FragColor = vec4(color * (0.8 + alpha * 1.2), alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -2,
  }), []);

  useFrame(() => {
    if (!meshRef.current) return;
    const mat = meshRef.current.material as THREE.ShaderMaterial;
    const store = useGameStore.getState();
    const shipTransform = getLiveShipTransform();
    mat.uniforms.uTime.value = performance.now() * 0.001;
    mat.uniforms.uPlayerPos.value.set(
      shipTransform.pos[0],
      shipTransform.pos[1],
      shipTransform.pos[2],
    );
    mat.uniforms.uShipDir.value.set(
      Math.sin(shipTransform.rot),
      Math.cos(shipTransform.rot),
    );
    mat.uniforms.uShipSpeed.value = Math.abs(shipTransform.vel);

    const theta = ((store.timeOfDay - 6) / 24) * Math.PI * 2;
    const sunH = Math.sin(theta);
    mat.uniforms.uNightFactor.value = Math.max(0, -sunH);

    // Follow player
    meshRef.current.position.x = shipTransform.pos[0];
    meshRef.current.position.z = shipTransform.pos[2];
  });

  return (
    <mesh
      ref={meshRef}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, SEA_LEVEL + ALGAE_SURFACE_OFFSET, 0]}
      renderOrder={2}
    >
      <planeGeometry args={[200, 200]} />
      <shaderMaterial args={[shaderArgs]} side={THREE.DoubleSide} />
    </mesh>
  );
}

function WaterCaustics() {
  const meshRef = useRef<THREE.Mesh>(null);
  useWaterOverlayLayer(meshRef);
  const waterPaletteId = useGameStore((state) => resolveWaterPaletteId(state));
  const causticTint = useMemo(() => {
    switch (waterPaletteId) {
      case 'monsoon':
        return new THREE.Vector3(0.34, 0.64, 0.54);
      case 'tropical':
        return new THREE.Vector3(0.36, 0.94, 0.88);
      case 'arid':
        return new THREE.Vector3(0.36, 0.78, 0.92);
      case 'mediterranean':
        return new THREE.Vector3(0.32, 0.66, 0.86);
      case 'temperate':
      default:
        return new THREE.Vector3(0.26, 0.48, 0.66);
    }
  }, [waterPaletteId]);

  const shaderArgs = useMemo(() => ({
    uniforms: {
      uTime: { value: 0 },
      uDaylight: { value: 1.0 },
      uPlayerPos: { value: new THREE.Vector3() },
      uCausticTint: { value: causticTint.clone() },
    },
    vertexShader: /* glsl */ `
      varying vec2 vWorldXZ;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldXZ = wp.xz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uDaylight;
      uniform vec3 uPlayerPos;
      uniform vec3 uCausticTint;
      varying vec2 vWorldXZ;

      // Smooth value noise
      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash(i), hash(i + vec2(1, 0)), f.x),
          mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x),
          f.y
        );
      }

      void main() {
        if (uDaylight < 0.1) discard;

        // Distance fade — only render near the player
        float dist = length(vWorldXZ - uPlayerPos.xz);
        float distFade = 1.0 - smoothstep(95.0, 220.0, dist);
        if (distFade < 0.01) discard;

        // Large drifting caustic pattern
        float t = uTime;
        vec2 uv1 = vWorldXZ * 0.06 + vec2(t * 0.20, t * 0.135);
        vec2 uv2 = vWorldXZ * 0.06 + vec2(-t * 0.15, t * 0.23);
        float n1 = noise(uv1);
        float n2 = noise(uv2);
        // Intersect two noise fields — creates bright caustic lines where both are high
        float caustic = n1 * n2;
        caustic = smoothstep(0.83, 0.22, caustic);

        // Smaller, faster detail layer
        vec2 uv3 = vWorldXZ * 0.135 + vec2(t * 0.29, -t * 0.22);
        vec2 uv4 = vWorldXZ * 0.135 + vec2(-t * 0.215, -t * 0.325);
        float n3 = noise(uv3);
        float n4 = noise(uv4);
        float detail = n3 * n4;
        detail = smoothstep(0.3, 0.52, detail);

        // Blend: large shapes dominate, detail adds sparkle
        float combined = caustic * 0.70 + detail * 0.5;

        vec3 causticColor = uCausticTint * (1.02 + combined * 0.18);

        float alpha = combined * 0.046 * uDaylight * distFade;
        if (alpha < 0.002) discard;

        gl_FragColor = vec4(causticColor, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    side: THREE.DoubleSide,
  }), [causticTint]);

  useFrame((state) => {
    if (!meshRef.current) return;
    const mat = meshRef.current.material as THREE.ShaderMaterial;
    mat.uniforms.uTime.value = state.clock.elapsedTime;

    const shipTransform = getLiveShipTransform();
    mat.uniforms.uPlayerPos.value.set(
      shipTransform.pos[0], shipTransform.pos[1], shipTransform.pos[2],
    );
    mat.uniforms.uCausticTint.value.copy(causticTint);
    meshRef.current.position.x = shipTransform.pos[0];
    meshRef.current.position.z = shipTransform.pos[2];

    const time = useGameStore.getState().timeOfDay;
    const theta = ((time - 6) / 24) * Math.PI * 2;
    const sunH = Math.sin(theta);
    mat.uniforms.uDaylight.value = smoothstep(-0.15, 0.25, sunH);
  });

  return (
    <mesh
      ref={meshRef}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, SEA_LEVEL + CAUSTIC_SURFACE_OFFSET, 0]}
      renderOrder={2}
    >
      <planeGeometry args={[340, 340, 1, 1]} />
      <shaderMaterial args={[shaderArgs]} />
    </mesh>
  );
}

export function Ocean() {
  const waterRef = useRef<Water | null>(null);
  const advancedWaterEnabled = useGameStore((state) => state.renderDebug.advancedWater);
  const timeOfDay = useGameStore((state) => state.timeOfDay);
  const shipWakeEnabled = useGameStore((state) => state.renderDebug.shipWake);
  const bowFoamEnabled = useGameStore((state) => state.renderDebug.bowFoam);
  const algaeEnabled = useGameStore((state) => state.renderDebug.algae);
  const waterPaletteId = useGameStore((state) => resolveWaterPaletteId(state));
  const waterPalette = useMemo(() => getWaterPalette(waterPaletteId), [waterPaletteId]);

  const sunAngle = ((timeOfDay - 6) / 24) * Math.PI * 2;
  const sunH = Math.sin(sunAngle);
  const showAdvancedWater = advancedWaterEnabled;

  // Load the standard three.js water normals texture for realistic distortion
  const waterNormals = useLoader(
    THREE.TextureLoader,
    'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/waternormals.jpg'
  );
  waterNormals.wrapS = waterNormals.wrapT = THREE.RepeatWrapping;

  const water = useMemo(() => {
    const geometry = new THREE.PlaneGeometry(10000, 10000);
    const w = new Water(geometry, {
      textureWidth: 512,
      textureHeight: 512,
      waterNormals,
      sunDirection: new THREE.Vector3(1, 0, 0).normalize(),
      sunColor: 0xfffff,
      waterColor: waterPalette.surface.fallbackHex,
      alpha: WATER_SURFACE_ALPHA,
      distortionScale: 1.5,
      clipBias: 2.00,
      fog: true,
    });
    w.rotation.x = -Math.PI / 2;
    w.receiveShadow = false;
    const waterMaterial = w.material as THREE.ShaderMaterial;
    waterMaterial.transparent = true;
    waterMaterial.depthWrite = false;
    waterMaterial.polygonOffset = true;
    waterMaterial.polygonOffsetFactor = 2;
    waterMaterial.polygonOffsetUnits = 4;

    // Patch fragment shader:
    // 1. Use a capped Fresnel curve so ship and shoreline reflections stay rich without
    //    creating the old screen-horizontal transition band.
    // 2. Keep some base distortion so far-water reflections are broken up by waves.
    // 3. Fade reflection toward waterColor at distance to keep horizon/coastline
    //    reflections from forming a hard stripe in default camera view.
    waterMaterial.fragmentShader = waterMaterial.fragmentShader
      .replace('float rf0 = 0.3;', 'float rf0 = 0.27;')
      .replace(
        'float reflectance = rf0 + ( 1.0 - rf0 ) * pow( ( 1.0 - theta ), 5.0 );',
        'float reflectance = min(0.13 + 0.24 * pow(1.0 - theta, 2.0), 0.34);'
      )
      .replace(
        'vec3 scatter = max( 0.0, dot( surfaceNormal, eyeDirection ) ) * waterColor;',
        'vec3 scatter = max( 0.0, dot( surfaceNormal, eyeDirection ) ) * waterColor * 1.2;'
      )
      .replace(
        'vec2 distortion = surfaceNormal.xz * ( 0.001 + 1.0 / distance ) * distortionScale;',
        'vec2 distortion = surfaceNormal.xz * ( 0.0018 + 1.0 / distance ) * distortionScale;'
      )
      .replace(
        'vec3 reflectionSample = vec3( texture2D( mirrorSampler, mirrorCoord.xy / mirrorCoord.w + distortion ) );',
        `vec3 reflectionSample = vec3( texture2D( mirrorSampler, mirrorCoord.xy / mirrorCoord.w + distortion ) );
				float reflDistFade = smoothstep(350.0, 120.0, distance);
				reflectionSample = mix(waterColor, reflectionSample, reflDistFade);`
      );
    waterMaterial.needsUpdate = true;

    waterRef.current = w;
    return w;
  }, [waterNormals, waterPalette]);

  useFrame((_, delta) => {
    if (!waterRef.current) return;
    const mat = waterRef.current.material as THREE.ShaderMaterial;
    mat.uniforms.time.value += delta * 0.5;

    // Sun direction and color (only runs when advanced water is mounted, i.e. daytime)
    mat.uniforms.sunDirection.value
      .set(Math.cos(sunAngle), Math.sin(sunAngle), Math.sin(sunAngle) * 0.5)
      .normalize();

    if (sunH > 0.2) {
      mat.uniforms.sunColor.value.setRGB(0.9, 0.88, 0.8);
    } else if (sunH > 0) {
      const t = sunH / 0.2;
      mat.uniforms.sunColor.value.setRGB(0.95, 0.45 + t * 0.43, 0.15 + t * 0.65);
    } else {
      // Night — cool moonlight reflection
      const moonStr = Math.min(1, Math.max(0, -sunH) * 2);
      mat.uniforms.sunColor.value.setRGB(
        0.3 + moonStr * 0.15,
        0.35 + moonStr * 0.2,
        0.5 + moonStr * 0.25
      );
    }

    // Adjust water body color with time
    if (sunH < 0.2) {
      const t = (sunH + 0.1) / 0.3;
      mat.uniforms.waterColor.value.setRGB(
        waterPalette.surface.night[0] + (waterPalette.surface.dusk[0] - waterPalette.surface.night[0]) * t,
        waterPalette.surface.night[1] + (waterPalette.surface.dusk[1] - waterPalette.surface.night[1]) * t,
        waterPalette.surface.night[2] + (waterPalette.surface.dusk[2] - waterPalette.surface.night[2]) * t,
      );
    } else {
      mat.uniforms.waterColor.value.setRGB(...waterPalette.surface.day);
    }
  });

  return (
    <>
      <WaterOverlayCameraLayer />
      <ShallowWaterTint />
      {showAdvancedWater ? (
        <primitive object={water} position={[0, SEA_LEVEL + WATER_SURFACE_OFFSET, 0]} raycast={() => null} />
      ) : (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, SEA_LEVEL + WATER_SURFACE_OFFSET, 0]} raycast={() => null}>
          <planeGeometry args={[10000, 10000]} />
          <meshPhongMaterial
            color={waterPalette.surface.fallbackHex}
            transparent
            opacity={WATER_SURFACE_ALPHA}
            depthWrite={false}
            polygonOffset
            polygonOffsetFactor={2}
            polygonOffsetUnits={4}
          />
        </mesh>
      )}
      {showAdvancedWater && <WaterCaustics />}
      {algaeEnabled && <PhosphorescentAlgae />}
      {shipWakeEnabled && <ShipWake />}
      {bowFoamEnabled && <BowFoam />}
    </>
  );
}
