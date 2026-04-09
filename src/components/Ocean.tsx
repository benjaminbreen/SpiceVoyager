import { useRef, useMemo, useEffect } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { Water } from 'three-stdlib';
import { useGameStore } from '../store/gameStore';
import { SEA_LEVEL } from '../constants/world';
import { getTerrainData } from '../utils/terrain';

const WATER_SURFACE_OFFSET = -0.03;
const SHALLOW_TINT_OFFSET = 0.012;
const WAKE_SURFACE_OFFSET = 0.045;
const FOAM_SURFACE_OFFSET = 0.055;
const ALGAE_SURFACE_OFFSET = 0.035;

function ShallowWaterTint() {
  const worldSeed = useGameStore((state) => state.worldSeed);
  const worldSize = useGameStore((state) => state.worldSize);
  const devSoloPort = useGameStore((state) => state.devSoloPort);

  const { geometry, material } = useMemo(() => {
    const baseSize = devSoloPort ? 1000 : (worldSize || 600);
    const size = baseSize + 500;
    const segments = Math.min(192, Math.max(72, Math.round(size * 0.12)));
    const geo = new THREE.PlaneGeometry(size, size, segments, segments);
    const position = geo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(position.count * 3);
    const alphas = new Float32Array(position.count);

    const _turquoiseBase = new THREE.Color().setRGB(0.34, 0.72, 0.67);
    const _paleSurf = new THREE.Color().setRGB(0.72, 0.84, 0.72);
    const _outerShallow = new THREE.Color().setRGB(0.16, 0.47, 0.53);
    const turquoise = new THREE.Color();

    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i);
      const worldZ = -position.getY(i);
      const terrain = getTerrainData(x, worldZ);
      const tintStrength = Math.min(1, terrain.shallowFactor * 1.45 + terrain.surfFactor * 1.2 + terrain.wetSandFactor * 0.35);
      const alpha =
        tintStrength *
        (terrain.height < SEA_LEVEL ? 0.58 : 0.24) *
        (1 - terrain.coastSteepness * 0.28);
      turquoise.copy(_turquoiseBase);
      turquoise.lerp(_outerShallow, terrain.shallowFactor * 0.72);
      turquoise.lerp(_paleSurf, terrain.surfFactor * 0.72);

      colors[i * 3] = turquoise.r;
      colors[i * 3 + 1] = turquoise.g;
      colors[i * 3 + 2] = turquoise.b;
      alphas[i] = alpha;
    }

    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setAttribute('aAlpha', new THREE.Float32BufferAttribute(alphas, 1));

    const mat = new THREE.ShaderMaterial({
      vertexShader: /* glsl */ `
        attribute float aAlpha;
        varying vec3 vColor;
        varying float vAlpha;

        void main() {
          vColor = color;
          vAlpha = aAlpha;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        varying float vAlpha;

        void main() {
          if (vAlpha < 0.01) discard;
          gl_FragColor = vec4(vColor, vAlpha);
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
  }, [devSoloPort, worldSeed, worldSize]);

  useEffect(() => {
    return () => {
      geometry.dispose();
      material.dispose();
    };
  }, [geometry, material]);

  return (
    <mesh
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
  const TRAIL_LENGTH = 80;
  const SAMPLE_DIST = 0.35; // sample every ~0.35 world units of travel

  interface TrailPoint {
    x: number; z: number;     // stern position
    perpX: number; perpZ: number; // perpendicular to travel direction
    speed: number;
  }

  const trailRef = useRef<TrailPoint[]>([]);
  const lastPos = useRef<[number, number]>([0, 0]);

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
      uniforms: { uTime: { value: 0 } },
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

          float alpha = vAlpha * foam * edgeFade;
          if (alpha < 0.01) discard;

          vec3 color = mix(vec3(0.7, 0.87, 0.97), vec3(0.93, 0.97, 1.0), alpha);
          gl_FragColor = vec4(color, alpha * 0.45);
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

  useFrame((state) => {
    const store = useGameStore.getState();
    const speed = Math.abs(store.playerVelocity);
    const [px, , pz] = store.playerPos;
    const rot = store.playerRot;
    const dirX = Math.sin(rot);
    const dirZ = Math.cos(rot);

    // Stern position (~2.5 units behind ship center)
    const sternX = px - dirX * 2.5;
    const sternZ = pz - dirZ * 2.5;

    // Sample by distance traveled (not time) so trail density is consistent
    const dx = sternX - lastPos.current[0];
    const dz = sternZ - lastPos.current[1];
    const distMoved = Math.sqrt(dx * dx + dz * dz);

    if (distMoved > SAMPLE_DIST || trailRef.current.length === 0) {
      lastPos.current = [sternX, sternZ];
      // Perpendicular to ship heading
      trailRef.current.unshift({
        x: sternX, z: sternZ,
        perpX: -dirZ, perpZ: dirX,
        speed,
      });
      if (trailRef.current.length > TRAIL_LENGTH) trailRef.current.pop();
    } else if (trailRef.current.length > 0) {
      // Update the newest point to track current stern (smooth interpolation)
      const newest = trailRef.current[0];
      newest.x = sternX;
      newest.z = sternZ;
      newest.perpX = -dirZ;
      newest.perpZ = dirX;
      newest.speed = speed;
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
        const speedFactor = Math.min(pt.speed / 8, 1);
        // Width: starts narrow at stern, widens slightly, then narrows as it fades
        const widthCurve = Math.sin(Math.min(age * 3.0, Math.PI)) * 0.6 + 0.4;
        const width = (0.4 + speedFactor * 0.8) * widthCurve;

        positions[vi * 3]       = pt.x + pt.perpX * width;
        positions[vi * 3 + 1]   = SEA_LEVEL + WAKE_SURFACE_OFFSET;
        positions[vi * 3 + 2]   = pt.z + pt.perpZ * width;
        positions[(vi+1) * 3]   = pt.x - pt.perpX * width;
        positions[(vi+1) * 3 + 1] = SEA_LEVEL + WAKE_SURFACE_OFFSET;
        positions[(vi+1) * 3 + 2] = pt.z - pt.perpZ * width;

        // Alpha fades with age, scales with speed
        const a = (1 - age) * (1 - age) * speedFactor;
        alphas[vi] = a;
        alphas[vi + 1] = a;

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
    geometry.computeBoundingSphere();

    material.uniforms.uTime.value = state.clock.elapsedTime;
  });

  return <mesh geometry={geometry} material={material} renderOrder={3} />;
}

// Small shader overlay for bow foam and hull waterline — follows the ship
function BowFoam() {
  const meshRef = useRef<THREE.Mesh>(null);

  const shaderArgs = useMemo(() => ({
    uniforms: {
      uTime: { value: 0 },
      uShipPos: { value: new THREE.Vector3() },
      uShipDir: { value: new THREE.Vector2(0, 1) },
      uShipSpeed: { value: 0.0 },
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

        // Hull waterline foam — elongated oval around ship hull
        float hullAlong = ahead; // ship-local fore-aft
        float hullShape = absLat / (1.3 - clamp(abs(hullAlong) / 4.0, 0.0, 0.5)); // hull-shaped falloff
        if (hullShape < 1.5 && abs(hullAlong) < 4.0) {
          float hull = (1.0 - hullShape / 1.5) * speedFactor;
          float foamNoise = fbm(vWorldPosition.xz * 5.0 + uTime * 2.0);
          alpha = max(alpha, hull * foamNoise * 0.3);
        }

        if (alpha < 0.01) discard;
        vec3 color = mix(vec3(0.75, 0.88, 0.97), vec3(0.95, 0.98, 1.0), alpha);
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
    const store = useGameStore.getState();
    mat.uniforms.uTime.value = state.clock.elapsedTime;
    mat.uniforms.uShipPos.value.set(store.playerPos[0], store.playerPos[1], store.playerPos[2]);
    mat.uniforms.uShipSpeed.value = Math.abs(store.playerVelocity);
    mat.uniforms.uShipDir.value.set(Math.sin(store.playerRot), Math.cos(store.playerRot));

    meshRef.current.position.x = store.playerPos[0];
    meshRef.current.position.z = store.playerPos[2];
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
    mat.uniforms.uTime.value = performance.now() * 0.001;
    mat.uniforms.uPlayerPos.value.set(store.playerPos[0], store.playerPos[1], store.playerPos[2]);
    mat.uniforms.uShipDir.value.set(Math.sin(store.playerRot), Math.cos(store.playerRot));
    mat.uniforms.uShipSpeed.value = Math.abs(store.playerVelocity);

    const theta = ((store.timeOfDay - 6) / 24) * Math.PI * 2;
    const sunH = Math.sin(theta);
    mat.uniforms.uNightFactor.value = Math.max(0, -sunH);

    // Follow player
    meshRef.current.position.x = store.playerPos[0];
    meshRef.current.position.z = store.playerPos[2];
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

export function Ocean() {
  const waterRef = useRef<Water | null>(null);
  const advancedWaterEnabled = useGameStore((state) => state.renderDebug.advancedWater);
  const shipWakeEnabled = useGameStore((state) => state.renderDebug.shipWake);
  const bowFoamEnabled = useGameStore((state) => state.renderDebug.bowFoam);
  const algaeEnabled = useGameStore((state) => state.renderDebug.algae);

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
      sunDirection: new THREE.Vector3(1, 1, 0).normalize(),
      sunColor: 0xffffff,
      waterColor: 0x001e6f,
      distortionScale: 3.7,
      fog: true,
    });
    w.rotation.x = -Math.PI / 2;
    w.receiveShadow = true;
    const waterMaterial = w.material as THREE.ShaderMaterial;
    waterMaterial.polygonOffset = true;
    waterMaterial.polygonOffsetFactor = 2;
    waterMaterial.polygonOffsetUnits = 4;
    waterRef.current = w;
    return w;
  }, [waterNormals]);

  useFrame((_, delta) => {
    if (!waterRef.current) return;
    const mat = waterRef.current.material as THREE.ShaderMaterial;
    mat.uniforms.time.value += delta * 0.5;

    // Sync sun direction and colors with game time of day
    const time = useGameStore.getState().timeOfDay;
    const theta = ((time - 6) / 24) * Math.PI * 2;
    const sunH = Math.sin(theta);

    if (sunH > 0) {
      // Daytime — sun reflection
      mat.uniforms.sunDirection.value
        .set(Math.cos(theta), Math.sin(theta), Math.sin(theta) * 0.5)
        .normalize();
    } else {
      // Night — reflect moonlight from opposite direction
      mat.uniforms.sunDirection.value
        .set(-Math.cos(theta), Math.max(0.15, -Math.sin(theta)), -Math.sin(theta) * 0.5 + 0.3)
        .normalize();
    }

    // Time-dependent sun/moon color on water surface
    if (sunH > 0.2) {
      mat.uniforms.sunColor.value.setRGB(1.0, 0.98, 0.92);
    } else if (sunH > 0) {
      const t = sunH / 0.2;
      mat.uniforms.sunColor.value.setRGB(1.0, 0.45 + t * 0.53, 0.15 + t * 0.77);
    } else {
      // Night — cool moonlight reflection
      const moonStr = Math.min(1, Math.max(0, -sunH) * 2);
      mat.uniforms.sunColor.value.setRGB(
        0.3 + moonStr * 0.25,
        0.4 + moonStr * 0.25,
        0.6 + moonStr * 0.3
      );
    }

    // Adjust water body color with time
    if (sunH < -0.1) {
      mat.uniforms.waterColor.value.setRGB(0.0, 0.06, 0.22);
    } else if (sunH < 0.2) {
      const t = (sunH + 0.1) / 0.3;
      mat.uniforms.waterColor.value.setRGB(0.0, 0.06 + t * 0.06, 0.22 + t * 0.21);
    } else {
      mat.uniforms.waterColor.value.setHex(0x001e6f);
    }
  });

  return (
    <>
      <ShallowWaterTint />
      {advancedWaterEnabled ? (
        <primitive object={water} position={[0, SEA_LEVEL + WATER_SURFACE_OFFSET, 0]} />
      ) : (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, SEA_LEVEL + WATER_SURFACE_OFFSET, 0]}>
          <planeGeometry args={[10000, 10000]} />
          <meshPhongMaterial
            color="#0b2a63"
            transparent
            opacity={0.96}
            polygonOffset
            polygonOffsetFactor={2}
            polygonOffsetUnits={4}
          />
        </mesh>
      )}
      {algaeEnabled && <PhosphorescentAlgae />}
      {shipWakeEnabled && <ShipWake />}
      {bowFoamEnabled && <BowFoam />}
    </>
  );
}
