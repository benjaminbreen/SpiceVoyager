import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { splashes, splinters, impactBursts, muzzleBursts, rocketTrails, setSplashClock } from '../utils/splashState';
import { SEA_LEVEL } from '../constants/world';
import { getLiveShipTransform } from '../utils/livePlayerTransform';

// ── Particle pools ──────────────────────────────────────────────────────────

const SPLASH_PARTICLE_COUNT = 60;
const SPLINTER_PARTICLE_COUNT = 64;
const IMPACT_PARTICLE_COUNT = 72;
const MUZZLE_PARTICLE_COUNT = 48;
// Rocket trails: each trail-spawn event produces 1–2 puffs that live ~0.8s.
// Headroom for two simultaneous rockets drawing trails at 20 Hz.
const ROCKET_TRAIL_PARTICLE_COUNT = 90;

interface Particle {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
}

interface BurstParticle {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
}

export function SplashSystem() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const splinterMeshRef = useRef<THREE.InstancedMesh>(null);
  const impactMeshRef = useRef<THREE.InstancedMesh>(null);
  const muzzleMeshRef = useRef<THREE.InstancedMesh>(null);
  const rocketTrailMeshRef = useRef<THREE.InstancedMesh>(null);
  const rippleRef = useRef<THREE.Mesh>(null);
  const particles = useRef<Particle[]>([]);
  const splinterParticles = useRef<Particle[]>([]);
  const impactParticles = useRef<BurstParticle[]>([]);
  const muzzleParticles = useRef<BurstParticle[]>([]);
  const rocketTrailParticles = useRef<BurstParticle[]>([]);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const lastSplashCount = useRef(0);
  const lastSplinterCount = useRef(0);
  const lastImpactCount = useRef(0);
  const lastMuzzleCount = useRef(0);
  const lastRocketTrailCount = useRef(0);

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
    for (let i = 0; i < IMPACT_PARTICLE_COUNT; i++) {
      impactParticles.current.push({
        pos: new THREE.Vector3(0, -1000, 0),
        vel: new THREE.Vector3(),
        life: 0,
        maxLife: 0,
      });
    }
    for (let i = 0; i < MUZZLE_PARTICLE_COUNT; i++) {
      muzzleParticles.current.push({
        pos: new THREE.Vector3(0, -1000, 0),
        vel: new THREE.Vector3(),
        life: 0,
        maxLife: 0,
      });
    }
    for (let i = 0; i < ROCKET_TRAIL_PARTICLE_COUNT; i++) {
      rocketTrailParticles.current.push({
        pos: new THREE.Vector3(0, -1000, 0),
        vel: new THREE.Vector3(),
        life: 0,
        maxLife: 0,
      });
    }
  }, []);

  useFrame((state, delta) => {
    // Guard against the init useEffect not having committed yet — useFrame
    // can fire before useEffect on the first render. Without this, an early
    // event (rocket fire on first tick) indexes into an empty pool and the
    // spawn loop throws on `p.life`, which then throws every frame and tanks
    // FPS via React's error overlay.
    if (rocketTrailParticles.current.length === 0) return;

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
        const count = Math.round(10 + sp.intensity * 14);
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

    // ── Spawn land impact burst particles ──
    if (impactBursts.length > lastImpactCount.current) {
      for (let si = lastImpactCount.current; si < impactBursts.length; si++) {
        const burst = impactBursts[si];
        const count = Math.round(10 + burst.intensity * 14);
        let spawned = 0;
        for (let i = 0; i < IMPACT_PARTICLE_COUNT && spawned < count; i++) {
          const p = impactParticles.current[i];
          if (p.life <= 0) {
            const angle = Math.random() * Math.PI * 2;
            const lateral = (1.8 + Math.random() * 2.4) * burst.intensity;
            const upward = (1.1 + Math.random() * 2.2) * burst.intensity;
            p.pos.set(
              burst.x + (Math.random() - 0.5) * 0.3,
              burst.y + 0.04 + Math.random() * 0.15,
              burst.z + (Math.random() - 0.5) * 0.3,
            );
            p.vel.set(
              Math.cos(angle) * lateral,
              upward,
              Math.sin(angle) * lateral,
            );
            p.maxLife = 0.25 + Math.random() * 0.35;
            p.life = p.maxLife;
            spawned++;
          }
        }
      }
    }
    lastImpactCount.current = impactBursts.length;

    // ── Spawn land muzzle smoke particles ──
    if (muzzleBursts.length > lastMuzzleCount.current) {
      for (let si = lastMuzzleCount.current; si < muzzleBursts.length; si++) {
        const burst = muzzleBursts[si];
        const count = Math.round(10 + burst.intensity * 12);
        let spawned = 0;
        for (let i = 0; i < MUZZLE_PARTICLE_COUNT && spawned < count; i++) {
          const p = muzzleParticles.current[i];
          if (p.life <= 0) {
            const forward = 1.1 + Math.random() * 1.2;
            const sideAngle = Math.random() * Math.PI * 2;
            p.pos.set(
              burst.x + (Math.random() - 0.5) * 0.12,
              burst.y + (Math.random() - 0.5) * 0.12,
              burst.z + (Math.random() - 0.5) * 0.12,
            );
            p.vel.set(
              burst.dirX * forward + Math.cos(sideAngle) * 0.45,
              Math.max(0.5, burst.dirY * 0.45) + 0.7 + Math.random() * 0.5,
              burst.dirZ * forward + Math.sin(sideAngle) * 0.45,
            );
            p.maxLife = 0.45 + Math.random() * 0.45;
            p.life = p.maxLife;
            spawned++;
          }
        }
      }
    }
    lastMuzzleCount.current = muzzleBursts.length;

    // ── Spawn rocket trail puffs ──
    // Each trail event produces 1–2 particles: one drifting up (smoke) and
    // a short-lived hot-colored spark. Many events spawn per second, so we
    // only draw one-to-two puffs per event to keep the pool healthy.
    if (rocketTrails.length > lastRocketTrailCount.current) {
      for (let si = lastRocketTrailCount.current; si < rocketTrails.length; si++) {
        const tr = rocketTrails[si];
        let spawned = 0;
        const target = 2;
        for (let i = 0; i < ROCKET_TRAIL_PARTICLE_COUNT && spawned < target; i++) {
          const p = rocketTrailParticles.current[i];
          if (p.life <= 0) {
            const jitter = tr.seed * 6.283;
            p.pos.set(
              tr.x + (Math.random() - 0.5) * 0.22,
              tr.y + (Math.random() - 0.5) * 0.18,
              tr.z + (Math.random() - 0.5) * 0.22,
            );
            // Puffs drift slightly aft and upward; sparks move more randomly.
            p.vel.set(
              Math.cos(jitter + spawned) * 0.45,
              0.55 + Math.random() * 0.7,
              Math.sin(jitter + spawned) * 0.45,
            );
            p.maxLife = spawned === 0 ? 0.85 + Math.random() * 0.25 : 0.35 + Math.random() * 0.2;
            p.life = p.maxLife;
            spawned++;
          }
        }
      }
    }
    lastRocketTrailCount.current = rocketTrails.length;

    // ── Expire old events ──
    while (splashes.length > 0 && elapsed - splashes[0].time > 4) {
      splashes.shift();
      lastSplashCount.current = Math.max(0, lastSplashCount.current - 1);
    }
    while (splinters.length > 0 && elapsed - splinters[0].time > 3) {
      splinters.shift();
      lastSplinterCount.current = Math.max(0, lastSplinterCount.current - 1);
    }
    while (impactBursts.length > 0 && elapsed - impactBursts[0].time > 2) {
      impactBursts.shift();
      lastImpactCount.current = Math.max(0, lastImpactCount.current - 1);
    }
    while (muzzleBursts.length > 0 && elapsed - muzzleBursts[0].time > 2) {
      muzzleBursts.shift();
      lastMuzzleCount.current = Math.max(0, lastMuzzleCount.current - 1);
    }
    while (rocketTrails.length > 0 && elapsed - rocketTrails[0].time > 1.5) {
      rocketTrails.shift();
      lastRocketTrailCount.current = Math.max(0, lastRocketTrailCount.current - 1);
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

    // ── Update land impact burst particles ──
    if (impactMeshRef.current) {
      let needsUpdate = false;
      for (let i = 0; i < IMPACT_PARTICLE_COUNT; i++) {
        const p = impactParticles.current[i];
        if (p.life > 0) {
          p.life -= delta;
          p.vel.y -= 6.5 * delta;
          p.vel.x *= 1 - 2.8 * delta;
          p.vel.z *= 1 - 2.8 * delta;
          p.pos.addScaledVector(p.vel, delta);
          dummy.position.copy(p.pos);
          const lifeFrac = p.maxLife > 0 ? Math.max(0, p.life / p.maxLife) : 0;
          const ageFrac = 1 - lifeFrac;
          const s = (0.1 + ageFrac * 0.5) * (0.2 + lifeFrac * 0.8);
          dummy.scale.set(s, s, s);
          dummy.updateMatrix();
          impactMeshRef.current.setMatrixAt(i, dummy.matrix);
          needsUpdate = true;
        } else if (p.pos.y > -100) {
          p.pos.set(0, -1000, 0);
          dummy.position.copy(p.pos);
          dummy.scale.set(0, 0, 0);
          dummy.updateMatrix();
          impactMeshRef.current.setMatrixAt(i, dummy.matrix);
          needsUpdate = true;
        }
      }
      if (needsUpdate) impactMeshRef.current.instanceMatrix.needsUpdate = true;
    }

    // ── Update land muzzle smoke particles ──
    if (muzzleMeshRef.current) {
      let needsUpdate = false;
      for (let i = 0; i < MUZZLE_PARTICLE_COUNT; i++) {
        const p = muzzleParticles.current[i];
        if (p.life > 0) {
          p.life -= delta;
          p.vel.x *= 1 - 1.5 * delta;
          p.vel.z *= 1 - 1.5 * delta;
          p.vel.y += 0.7 * delta;
          p.pos.addScaledVector(p.vel, delta);
          dummy.position.copy(p.pos);
          const lifeFrac = p.maxLife > 0 ? Math.max(0, p.life / p.maxLife) : 0;
          const ageFrac = 1 - lifeFrac;
          const s = (0.14 + ageFrac * 0.7) * (0.18 + lifeFrac * 0.82);
          dummy.scale.set(s, s, s);
          dummy.updateMatrix();
          muzzleMeshRef.current.setMatrixAt(i, dummy.matrix);
          needsUpdate = true;
        } else if (p.pos.y > -100) {
          p.pos.set(0, -1000, 0);
          dummy.position.copy(p.pos);
          dummy.scale.set(0, 0, 0);
          dummy.updateMatrix();
          muzzleMeshRef.current.setMatrixAt(i, dummy.matrix);
          needsUpdate = true;
        }
      }
      if (needsUpdate) muzzleMeshRef.current.instanceMatrix.needsUpdate = true;
    }

    // ── Update rocket trail particles ──
    // Warm exhaust when fresh, cool grey smoke as they age. Color is baked
    // into the material; we just drive scale here.
    if (rocketTrailMeshRef.current) {
      let needsUpdate = false;
      for (let i = 0; i < ROCKET_TRAIL_PARTICLE_COUNT; i++) {
        const p = rocketTrailParticles.current[i];
        if (p.life > 0) {
          p.life -= delta;
          // Smoke rises gently, drag slows lateral drift.
          p.vel.x *= 1 - 1.1 * delta;
          p.vel.z *= 1 - 1.1 * delta;
          p.vel.y += 0.35 * delta;
          p.pos.addScaledVector(p.vel, delta);
          dummy.position.copy(p.pos);
          const lifeFrac = p.maxLife > 0 ? Math.max(0, p.life / p.maxLife) : 0;
          const ageFrac = 1 - lifeFrac;
          // Puffs expand with age; alpha fades via mesh opacity combined
          // with the scale envelope.
          const s = (0.18 + ageFrac * 0.85) * (0.25 + lifeFrac * 0.75);
          dummy.scale.set(s, s, s);
          dummy.updateMatrix();
          rocketTrailMeshRef.current.setMatrixAt(i, dummy.matrix);
          needsUpdate = true;
        } else if (p.pos.y > -100) {
          p.pos.set(0, -1000, 0);
          dummy.position.copy(p.pos);
          dummy.scale.set(0, 0, 0);
          dummy.updateMatrix();
          rocketTrailMeshRef.current.setMatrixAt(i, dummy.matrix);
          needsUpdate = true;
        }
      }
      if (needsUpdate) rocketTrailMeshRef.current.instanceMatrix.needsUpdate = true;
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

      // Each splash emits a dispersive wave packet: crests and troughs
      // travel outward at the phase velocity while the envelope moves at
      // the slower group velocity (classic deep-water dispersion).  We
      // render the signed wave height as a pair of light/dark bands
      // rather than white rings — this reads as surface tilt catching
      // and shedding light, not as painted foam.  A small foam core is
      // only added back for fresh, high-intensity impacts (anchor drops,
      // cannonballs); turn-ripples with low intensity stay pure bands.
      void main() {
        float crest = 0.0;
        float trough = 0.0;
        float foam = 0.0;

        for (int i = 0; i < 4; i++) {
          vec4 sp = uSplashOrigins[i];
          float age = uTime - sp.z;
          if (age < 0.0 || age > 4.2 || sp.w < 0.01) continue;

          float dist = length(vWorldXZ - sp.xy);

          // Wave-packet geometry.  Phase = individual crest speed;
          // group = envelope speed.  The packet sits ahead of the
          // origin and widens as it ages.
          const float phaseSpeed = 2.4;
          const float groupSpeed = 1.2;
          const float wavelength = 2.8;
          const float k = 6.2831853 / wavelength;
          const float omega = phaseSpeed * k;

          float packetCenter = age * groupSpeed;
          float packetWidth = 1.7 + age * 1.2;
          float radial = dist - packetCenter;
          float envelope = exp(-(radial * radial) / (packetWidth * packetWidth));

          // Signed wave — alternating crests and troughs along the radius.
          float signedWave = sin(k * dist - omega * age) * envelope;

          // Damping: exponential with age + soft distance rolloff so
          // rings don't march across the entire plane.
          float amp = exp(-age * 0.6) * (1.0 - smoothstep(12.0, 28.0, dist)) * sp.w;
          float contribution = signedWave * amp;

          crest  += max( contribution, 0.0);
          trough += max(-contribution, 0.0);

          // Foam core: only meaningful for high-intensity, very fresh
          // splashes.  Subtle (low-w) turn ripples skip this entirely.
          if (sp.w > 0.22 && age < 0.7) {
            float coreFall = 1.0 - age / 0.7;
            float coreRadial = dist - age * 1.2;
            foam += exp(-(coreRadial * coreRadial) / 0.6) * coreFall * sp.w;
          }
        }

        float total = crest + trough + foam;
        if (total < 0.004) discard;

        // Base water tint — sampled to match the scene's deep-water hue.
        // Crests lift toward a bright specular; troughs drop into a cooler
        // shadow.  The two sum to a soft lateral light/dark band.
        vec3 base    = vec3(0.36, 0.52, 0.62);
        vec3 crestC  = vec3(0.92, 0.96, 1.00);
        vec3 troughC = vec3(0.18, 0.28, 0.38);

        vec3 color = mix(base, crestC, clamp(crest * 0.9 + foam, 0.0, 1.0));
        color = mix(color, troughC, clamp(trough * 0.55, 0.0, 1.0));

        // Subtle alpha — crests brighter than troughs, foam is the only
        // channel allowed to punch through.  Turn ripples (low sp.w) land
        // in the 0.01-0.04 alpha range; real splashes (sp.w ~ 1) peak
        // around 0.22 + foam.
        float alpha = crest * 0.22 + trough * 0.13 + foam * 0.28;
        gl_FragColor = vec4(color, clamp(alpha, 0.0, 0.55));
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

      {/* Land impact burst — dust/powder puff where musket ball or arrow lands */}
      <instancedMesh ref={impactMeshRef} args={[undefined, undefined, IMPACT_PARTICLE_COUNT]} frustumCulled={false}>
        <sphereGeometry args={[0.35, 5, 5]} />
        <meshStandardMaterial
          color="#d7c0a1"
          emissive="#8b6a42"
          emissiveIntensity={0.18}
          roughness={0.85}
          transparent
          opacity={0.5}
          depthWrite={false}
        />
      </instancedMesh>

      {/* Land muzzle smoke — short forward burst that loosens into drifting smoke */}
      <instancedMesh ref={muzzleMeshRef} args={[undefined, undefined, MUZZLE_PARTICLE_COUNT]} frustumCulled={false}>
        <sphereGeometry args={[0.3, 5, 5]} />
        <meshStandardMaterial
          color="#d7d2c9"
          emissive="#7f7a72"
          emissiveIntensity={0.1}
          roughness={1}
          transparent
          opacity={0.42}
          depthWrite={false}
        />
      </instancedMesh>

      {/* Rocket exhaust trail — warm-glowing smoke puffs left along the flight
          path. Emissive picks up the powder-burn color; opacity stays low so
          a dense column still reads as a continuous trail rather than a wall. */}
      <instancedMesh ref={rocketTrailMeshRef} args={[undefined, undefined, ROCKET_TRAIL_PARTICLE_COUNT]} frustumCulled={false}>
        <sphereGeometry args={[0.35, 5, 5]} />
        <meshStandardMaterial
          color="#c9b58a"
          emissive="#ff7a2b"
          emissiveIntensity={0.75}
          roughness={1}
          transparent
          opacity={0.55}
          depthWrite={false}
          toneMapped={false}
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
