import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { splashes, splinters, setSplashClock } from '../utils/splashState';
import { SEA_LEVEL } from '../constants/world';
import { getLiveShipTransform } from '../utils/livePlayerTransform';

// ── Particle pools ──────────────────────────────────────────────────────────

const SPLASH_PARTICLE_COUNT = 60;
const SPLINTER_PARTICLE_COUNT = 40;

interface Particle {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
}

export function SplashSystem() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const splinterMeshRef = useRef<THREE.InstancedMesh>(null);
  const rippleRef = useRef<THREE.Mesh>(null);
  const particles = useRef<Particle[]>([]);
  const splinterParticles = useRef<Particle[]>([]);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const lastSplashCount = useRef(0);
  const lastSplinterCount = useRef(0);

  // Initialize particle pools
  useEffect(() => {
    for (let i = 0; i < SPLASH_PARTICLE_COUNT; i++) {
      particles.current.push({
        pos: new THREE.Vector3(0, -1000, 0),
        vel: new THREE.Vector3(),
        life: 0,
      });
    }
    for (let i = 0; i < SPLINTER_PARTICLE_COUNT; i++) {
      splinterParticles.current.push({
        pos: new THREE.Vector3(0, -1000, 0),
        vel: new THREE.Vector3(),
        life: 0,
      });
    }
  }, []);

  useFrame((state, delta) => {
    const elapsed = state.clock.elapsedTime;
    setSplashClock(elapsed);

    // ── Spawn water splash particles ──
    if (splashes.length > lastSplashCount.current) {
      for (let si = lastSplashCount.current; si < splashes.length; si++) {
        const splash = splashes[si];
        const count = Math.round(12 + splash.intensity * 8);
        let spawned = 0;
        for (let i = 0; i < SPLASH_PARTICLE_COUNT && spawned < count; i++) {
          const p = particles.current[i];
          if (p.life <= 0) {
            const angle = (spawned / count) * Math.PI * 2 + Math.random() * 0.3;
            const speed = (1.2 + Math.random() * 2.5) * splash.intensity;
            p.pos.set(
              splash.x + (Math.random() - 0.5) * 0.4,
              SEA_LEVEL + 0.1,
              splash.z + (Math.random() - 0.5) * 0.4,
            );
            p.vel.set(
              Math.cos(angle) * speed * 0.5,
              speed * (1.0 + Math.random() * 1.5),
              Math.sin(angle) * speed * 0.5,
            );
            p.life = 0.5 + Math.random() * 0.5;
            spawned++;
          }
        }
      }
    }
    lastSplashCount.current = splashes.length;

    // ── Spawn wood splinter particles ──
    if (splinters.length > lastSplinterCount.current) {
      for (let si = lastSplinterCount.current; si < splinters.length; si++) {
        const sp = splinters[si];
        const count = Math.round(8 + sp.intensity * 10);
        let spawned = 0;
        for (let i = 0; i < SPLINTER_PARTICLE_COUNT && spawned < count; i++) {
          const p = splinterParticles.current[i];
          if (p.life <= 0) {
            const angle = Math.random() * Math.PI * 2;
            const speed = (2 + Math.random() * 4) * sp.intensity;
            p.pos.set(
              sp.x + (Math.random() - 0.5) * 1.0,
              sp.y + (Math.random() - 0.5) * 0.8,
              sp.z + (Math.random() - 0.5) * 1.0,
            );
            p.vel.set(
              Math.cos(angle) * speed,
              speed * (0.5 + Math.random() * 1.2),
              Math.sin(angle) * speed,
            );
            p.life = 0.6 + Math.random() * 0.6;
            spawned++;
          }
        }
      }
    }
    lastSplinterCount.current = splinters.length;

    // ── Expire old events ──
    while (splashes.length > 0 && elapsed - splashes[0].time > 4) {
      splashes.shift();
      lastSplashCount.current = Math.max(0, lastSplashCount.current - 1);
    }
    while (splinters.length > 0 && elapsed - splinters[0].time > 3) {
      splinters.shift();
      lastSplinterCount.current = Math.max(0, lastSplinterCount.current - 1);
    }

    // ── Update water splash particles ──
    if (meshRef.current) {
      let needsUpdate = false;
      for (let i = 0; i < SPLASH_PARTICLE_COUNT; i++) {
        const p = particles.current[i];
        if (p.life > 0) {
          p.life -= delta;
          p.vel.y -= 12 * delta;
          p.pos.addScaledVector(p.vel, delta);
          if (p.pos.y < SEA_LEVEL - 0.1) p.life = 0;
          dummy.position.copy(p.pos);
          const s = Math.max(0, p.life) * 0.35;
          dummy.scale.set(s, s, s);
          dummy.updateMatrix();
          meshRef.current.setMatrixAt(i, dummy.matrix);
          needsUpdate = true;
        } else if (p.pos.y > -100) {
          p.pos.set(0, -1000, 0);
          dummy.position.copy(p.pos);
          dummy.scale.set(0, 0, 0);
          dummy.updateMatrix();
          meshRef.current.setMatrixAt(i, dummy.matrix);
          needsUpdate = true;
        }
      }
      if (needsUpdate) meshRef.current.instanceMatrix.needsUpdate = true;
    }

    // ── Update wood splinter particles ──
    if (splinterMeshRef.current) {
      let needsUpdate = false;
      for (let i = 0; i < SPLINTER_PARTICLE_COUNT; i++) {
        const p = splinterParticles.current[i];
        if (p.life > 0) {
          p.life -= delta;
          p.vel.y -= 9 * delta; // lighter gravity — wood floats a bit
          // Air drag slows lateral movement
          p.vel.x *= 1 - 1.5 * delta;
          p.vel.z *= 1 - 1.5 * delta;
          p.pos.addScaledVector(p.vel, delta);
          dummy.position.copy(p.pos);
          // Tumbling rotation from velocity
          dummy.rotation.set(
            p.vel.x * elapsed * 3,
            p.vel.y * elapsed * 2,
            p.vel.z * elapsed * 4,
          );
          const s = Math.max(0, p.life) * 0.3;
          // Elongated splinters: stretch on one axis
          dummy.scale.set(s * 0.4, s * 0.4, s * 1.8);
          dummy.updateMatrix();
          splinterMeshRef.current.setMatrixAt(i, dummy.matrix);
          needsUpdate = true;
        } else if (p.pos.y > -100) {
          p.pos.set(0, -1000, 0);
          dummy.position.copy(p.pos);
          dummy.scale.set(0, 0, 0);
          dummy.updateMatrix();
          splinterMeshRef.current.setMatrixAt(i, dummy.matrix);
          needsUpdate = true;
        }
      }
      if (needsUpdate) splinterMeshRef.current.instanceMatrix.needsUpdate = true;
    }

    // ── Update ripple shader uniforms ──
    if (rippleRef.current) {
      const mat = rippleRef.current.material as THREE.ShaderMaterial;
      mat.uniforms.uTime.value = elapsed;
      const origins = mat.uniforms.uSplashOrigins.value as THREE.Vector4[];
      for (let i = 0; i < 4; i++) {
        if (i < splashes.length) {
          const sp = splashes[splashes.length - 1 - i];
          origins[i].set(sp.x, sp.z, sp.time, sp.intensity);
        } else {
          origins[i].set(0, 0, -100, 0);
        }
      }
      const shipTransform = getLiveShipTransform();
      rippleRef.current.position.x = shipTransform.pos[0];
      rippleRef.current.position.z = shipTransform.pos[2];
    }
  });

  // ── Ripple shader material (Option 3): expanding concentric rings ──
  const rippleShaderArgs = useMemo(() => ({
    uniforms: {
      uTime: { value: 0 },
      uSplashOrigins: {
        value: [
          new THREE.Vector4(0, 0, -100, 0),
          new THREE.Vector4(0, 0, -100, 0),
          new THREE.Vector4(0, 0, -100, 0),
          new THREE.Vector4(0, 0, -100, 0),
        ],
      },
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
      uniform vec4 uSplashOrigins[4]; // xy = world xz, z = spawn time, w = intensity

      varying vec2 vWorldXZ;

      void main() {
        float totalRipple = 0.0;

        for (int i = 0; i < 4; i++) {
          vec4 sp = uSplashOrigins[i];
          float age = uTime - sp.z;
          if (age < 0.0 || age > 3.5 || sp.w < 0.01) continue;

          float dist = length(vWorldXZ - sp.xy);
          float rippleSpeed = 8.0;
          float ringRadius = age * rippleSpeed;

          // Multiple concentric rings
          float ring1 = abs(dist - ringRadius);
          float ring2 = abs(dist - ringRadius * 0.65);
          float ring3 = abs(dist - ringRadius * 0.35);

          float width = 0.4 + age * 0.3; // rings widen with age
          float r1 = exp(-ring1 * ring1 / (width * width));
          float r2 = exp(-ring2 * ring2 / (width * width * 0.7)) * 0.5;
          float r3 = exp(-ring3 * ring3 / (width * width * 0.5)) * 0.25;

          // Fade out over time
          float fade = exp(-age * 1.2) * sp.w;
          // Fade with distance from splash origin (don't let rings go forever)
          float distFade = 1.0 - smoothstep(12.0, 25.0, dist);

          totalRipple += (r1 + r2 + r3) * fade * distFade;
        }

        if (totalRipple < 0.01) discard;

        // White-ish foam color for the ripple crests
        vec3 color = mix(vec3(0.7, 0.85, 0.95), vec3(0.95, 0.98, 1.0), totalRipple);
        float alpha = totalRipple * 0.35;
        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -3,
    side: THREE.DoubleSide,
  }), []);

  return (
    <>
      {/* Splash droplet particles */}
      <instancedMesh ref={meshRef} args={[undefined, undefined, SPLASH_PARTICLE_COUNT]} frustumCulled={false}>
        <sphereGeometry args={[0.5, 6, 6]} />
        <meshStandardMaterial
          color="#d4eaf7"
          emissive="#88bbdd"
          emissiveIntensity={0.3}
          roughness={0.2}
          transparent
          opacity={0.85}
        />
      </instancedMesh>

      {/* Wood splinter particles */}
      <instancedMesh ref={splinterMeshRef} args={[undefined, undefined, SPLINTER_PARTICLE_COUNT]} frustumCulled={false}>
        <boxGeometry args={[0.5, 0.5, 0.5]} />
        <meshStandardMaterial
          color="#8B6914"
          emissive="#332200"
          emissiveIntensity={0.4}
          roughness={0.9}
        />
      </instancedMesh>

      {/* Ripple rings on water surface */}
      <mesh
        ref={rippleRef}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, SEA_LEVEL + 0.06, 0]}
        renderOrder={5}
      >
        <planeGeometry args={[120, 120, 1, 1]} />
        <shaderMaterial args={[rippleShaderArgs]} />
      </mesh>
    </>
  );
}
