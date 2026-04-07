import { useRef, useMemo, useEffect } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { Water } from 'three-stdlib';
import { useGameStore } from '../store/gameStore';

// Ship wake as a separate transparent overlay that follows the ship
function ShipWake() {
  const meshRef = useRef<THREE.Mesh>(null);

  const shaderArgs = useMemo(() => ({
    uniforms: {
      uTime: { value: 0 },
      uShipPos: { value: new THREE.Vector3(0, 0, 0) },
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

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1,0)), f.x),
                   mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y);
      }
      float fbm(vec2 p) {
        float v = 0.0, a = 0.5;
        mat2 rot = mat2(0.877, 0.479, -0.479, 0.877);
        for (int i = 0; i < 4; i++) {
          v += a * noise(p);
          p = rot * p * 2.0 + vec2(100.0);
          a *= 0.5;
        }
        return v;
      }

      void main() {
        if (uShipSpeed < 0.3) discard;

        vec2 toFrag = vWorldPosition.xz - uShipPos.xz;
        // Project onto ship-local axes
        float behindShip = -dot(toFrag, uShipDir);
        float lateralDist = toFrag.x * uShipDir.y - toFrag.y * uShipDir.x;
        float absLateral = abs(lateralDist);
        float distToShip = length(toFrag);
        float speedFactor = clamp(uShipSpeed / 15.0, 0.0, 1.0);
        float speedSq = speedFactor * speedFactor; // quadratic scaling feels more natural
        float alpha = 0.0;

        // === BOW WAVE === (in front of ship)
        float aheadOfShip = dot(toFrag, uShipDir);
        if (aheadOfShip > 0.0 && aheadOfShip < 4.0 + speedFactor * 3.0) {
          // V-shaped bow wave spreading from the prow
          float bowSpread = aheadOfShip * 0.6;
          float bowWave = exp(-pow(absLateral - bowSpread, 2.0) * 3.0);
          float bowCenter = exp(-absLateral * absLateral * 2.0) * (1.0 - aheadOfShip / 6.0);
          float bowFade = exp(-aheadOfShip * 0.4);
          float bowFoam = fbm(vec2(aheadOfShip * 2.0 + uTime * 2.0, lateralDist * 3.0)) * 0.5 + 0.5;
          float bow = (bowWave * 0.7 + bowCenter) * bowFade * bowFoam * speedSq;
          alpha = max(alpha, bow * 0.5);
        }

        // === STERN WAKE === (behind ship)
        if (behindShip > 0.0) {
          // Narrow central turbulent wake — width grows slowly, capped
          float wakeWidth = 0.8 + min(behindShip * 0.015, 2.5) * speedFactor;
          float centralWake = exp(-absLateral * absLateral / (wakeWidth * wakeWidth));
          float centralFade = exp(-behindShip * 0.04) * speedSq;
          float turbulence = fbm(vec2(behindShip * 0.5, lateralDist * 3.0) + uTime * 1.2) * 0.5 + 0.5;
          float central = centralWake * centralFade * turbulence;

          // Kelvin V-wake arms (~19.5 degrees) — thin, subtle
          float wakeEdge = behindShip * 0.34;
          float armWidth = 0.3 + behindShip * 0.003;
          float arm1 = exp(-(absLateral - wakeEdge) * (absLateral - wakeEdge) / (armWidth * armWidth));
          float arm2 = exp(-(absLateral + wakeEdge) * (absLateral + wakeEdge) / (armWidth * armWidth));
          float armFade = exp(-behindShip * 0.05) * speedFactor;
          float transverse = sin(behindShip * 1.2 - uTime * 5.0) * 0.4 + 0.6;
          float arms = (arm1 + arm2) * armFade * transverse * 0.3;

          alpha = max(alpha, clamp(central * 0.6 + arms, 0.0, 0.5));
        }

        // Immediate hull foam — tight ring around ship position
        if (distToShip < 3.0) {
          float hullFoam = (1.0 - distToShip / 3.0) * speedFactor;
          float foamNoise = fbm(vWorldPosition.xz * 6.0 + uTime * 2.5);
          alpha = max(alpha, hullFoam * foamNoise * 0.35);
        }

        if (alpha < 0.01) discard;

        // Slight color variation — more white at high alpha, bluer at edges
        vec3 foamColor = mix(vec3(0.7, 0.85, 0.95), vec3(0.92, 0.97, 1.0), alpha);
        gl_FragColor = vec4(foamColor, alpha * 0.45);
      }
    `,
    transparent: true,
    depthWrite: false,
  }), []);

  useFrame((state) => {
    if (!meshRef.current) return;
    const mat = meshRef.current.material as THREE.ShaderMaterial;
    const store = useGameStore.getState();
    mat.uniforms.uTime.value = state.clock.elapsedTime;
    mat.uniforms.uShipPos.value.set(store.playerPos[0], store.playerPos[1], store.playerPos[2]);
    mat.uniforms.uShipSpeed.value = Math.abs(store.playerVelocity);
    mat.uniforms.uShipDir.value.set(Math.sin(store.playerRot), Math.cos(store.playerRot));

    // Keep wake plane centered on ship
    meshRef.current.position.x = store.playerPos[0];
    meshRef.current.position.z = store.playerPos[2];
  });

  return (
    <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]}>
      <planeGeometry args={[80, 80, 1, 1]} />
      <shaderMaterial args={[shaderArgs]} side={THREE.DoubleSide} />
    </mesh>
  );
}

// Spray particles that kick up at high speeds
function BowSpray() {
  const sprayRef = useRef<THREE.InstancedMesh>(null);
  const sprayCount = 40;
  const sprayData = useRef<{pos: THREE.Vector3, vel: THREE.Vector3, life: number, maxLife: number}[]>([]);
  const spawnTimer = useRef(0);

  useEffect(() => {
    for (let i = 0; i < sprayCount; i++) {
      sprayData.current.push({
        pos: new THREE.Vector3(0, -500, 0),
        vel: new THREE.Vector3(),
        life: 0,
        maxLife: 1,
      });
    }
  }, []);

  useFrame((state, delta) => {
    if (!sprayRef.current) return;
    const store = useGameStore.getState();
    const speed = Math.abs(store.playerVelocity);
    const rot = store.playerRot;
    const [px, , pz] = store.playerPos;
    const dirX = Math.sin(rot);
    const dirZ = Math.cos(rot);

    // Spawn new spray particles at bow when moving fast
    spawnTimer.current += delta;
    const spawnRate = speed > 8 ? 0.03 : speed > 4 ? 0.08 : 0.2;
    if (speed > 2 && spawnTimer.current > spawnRate) {
      spawnTimer.current = 0;
      // Find a dead particle to reuse
      for (let i = 0; i < sprayCount; i++) {
        const p = sprayData.current[i];
        if (p.life <= 0) {
          // Spawn at bow position (3.5 units ahead of ship center)
          const bowX = px + dirX * 3.5;
          const bowZ = pz + dirZ * 3.5;
          const side = (Math.random() - 0.5) * 1.5;
          p.pos.set(
            bowX + dirZ * side,
            0.3 + Math.random() * 0.5,
            bowZ - dirX * side
          );
          // Spray outward and upward
          const spreadAngle = (Math.random() - 0.5) * 1.2;
          const spraySpeed = (1 + Math.random() * 2) * (speed / 15);
          p.vel.set(
            (dirX * 0.5 + Math.cos(rot + spreadAngle) * 0.8) * spraySpeed,
            (1.5 + Math.random() * 2.5) * (speed / 15),
            (dirZ * 0.5 + Math.sin(rot + spreadAngle) * 0.8) * spraySpeed
          );
          p.maxLife = 0.4 + Math.random() * 0.6;
          p.life = p.maxLife;
          break; // Only spawn one per frame interval
        }
      }
    }

    // Update all particles
    const dummy = new THREE.Object3D();
    let needsUpdate = false;
    for (let i = 0; i < sprayCount; i++) {
      const p = sprayData.current[i];
      if (p.life > 0) {
        p.life -= delta;
        p.vel.y -= 6 * delta; // Gentle gravity
        p.pos.addScaledVector(p.vel, delta);

        // Particles die when hitting water
        if (p.pos.y < -0.1) {
          p.life = 0;
        }

        const t = p.life / p.maxLife;
        const scale = t * 0.15 * (1 + (1 - t) * 0.5); // Grow slightly then shrink
        dummy.position.copy(p.pos);
        dummy.scale.set(scale, scale, scale);
        dummy.updateMatrix();
        sprayRef.current.setMatrixAt(i, dummy.matrix);
        needsUpdate = true;
      } else if (p.pos.y > -400) {
        p.pos.set(0, -500, 0);
        dummy.position.copy(p.pos);
        dummy.scale.set(0, 0, 0);
        dummy.updateMatrix();
        sprayRef.current.setMatrixAt(i, dummy.matrix);
        needsUpdate = true;
      }
    }
    if (needsUpdate) {
      sprayRef.current.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <instancedMesh ref={sprayRef} args={[undefined, undefined, sprayCount]}>
      <sphereGeometry args={[1, 4, 4]} />
      <meshStandardMaterial color="#ddeeff" transparent opacity={0.6} roughness={0.2} />
    </instancedMesh>
  );
}

export function Ocean() {
  const waterRef = useRef<Water | null>(null);

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
    waterRef.current = w;
    return w;
  }, [waterNormals]);

  useFrame((_, delta) => {
    if (!waterRef.current) return;
    const mat = waterRef.current.material as THREE.ShaderMaterial;
    mat.uniforms.time.value += delta * 0.5;

    // Sync sun direction with game time of day
    const time = useGameStore.getState().timeOfDay;
    const theta = ((time - 6) / 24) * Math.PI * 2;
    mat.uniforms.sunDirection.value
      .set(Math.cos(theta), Math.sin(theta), Math.sin(theta) * 0.5)
      .normalize();
  });

  return (
    <>
      <primitive object={water} position={[0, -0.2, 0]} />
      <ShipWake />
      <BowSpray />
    </>
  );
}
