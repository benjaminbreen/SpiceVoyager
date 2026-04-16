import { useMemo, useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '../store/gameStore';
import { SEA_LEVEL } from '../constants/world';
import { getLiveShipTransform } from '../utils/livePlayerTransform';
import { WAKE_SURFACE_OFFSET, useWaterOverlayLayer } from '../utils/waterOverlayLayer';

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function daylightFactor(timeOfDay: number): number {
  const theta = ((timeOfDay - 6) / 24) * Math.PI * 2;
  return smoothstep(-0.15, 0.25, Math.sin(theta));
}

const TRAIL_LENGTH = 72;
const TRAIL_LIFETIME = 6.2;
const SAMPLE_DIST = 0.45;

interface TrailPoint {
  x: number;
  z: number;
  perpX: number;
  perpZ: number;
  speed: number;
  turn: number;
  time: number;
  phase: number;
}

function ShipWakeTrail() {
  const meshRef = useRef<THREE.Mesh>(null);
  useWaterOverlayLayer(meshRef);

  const trailRef = useRef<TrailPoint[]>([]);
  const lastPos = useRef<[number, number]>([0, 0]);
  const lastRot = useRef(0);
  const initialized = useRef(false);
  const prevVisibleCount = useRef(0);
  const phaseSeed = useRef(0);

  const { geometry, material } = useMemo(() => {
    const vertCount = TRAIL_LENGTH * 2;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(vertCount * 3), 3));
    geo.setAttribute('aAlpha', new THREE.Float32BufferAttribute(new Float32Array(vertCount), 1));
    geo.setAttribute('aUv', new THREE.Float32BufferAttribute(new Float32Array(vertCount * 2), 2));
    geo.setAttribute('aPhase', new THREE.Float32BufferAttribute(new Float32Array(vertCount), 1));

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
        attribute float aPhase;
        varying float vAlpha;
        varying vec2 vUv;
        varying vec2 vWorldXZ;
        varying float vPhase;

        void main() {
          vAlpha = aAlpha;
          vUv = aUv;
          vPhase = aPhase;
          vWorldXZ = position.xz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uDaylight;
        varying float vAlpha;
        varying vec2 vUv;
        varying vec2 vWorldXZ;
        varying float vPhase;

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

          float edgeDist = abs(vUv.x - 0.5) * 2.0;
          float edgeFade = 1.0 - smoothstep(0.46, 1.0, edgeDist);
          float centerDist = abs(vUv.x - 0.5) * 2.0;
          float centerChurn = 1.0 - smoothstep(0.0, 0.33, centerDist);
          centerChurn *= 1.0 - smoothstep(0.0, 0.72, vUv.y);

          float worldFoam = fbm(vWorldXZ * vec2(0.65, 1.1) + vec2(vPhase, -vPhase) + uTime * vec2(0.14, -0.22));
          float streaks = fbm(vec2(vUv.x * 5.0 + vPhase, vUv.y * 18.0 - uTime * 0.7));
          float brokenFoam = smoothstep(0.24, 0.82, worldFoam * 0.58 + streaks * 0.42);
          float wakeShape = edgeFade * 0.42 + centerChurn * 0.98;
          float alpha = vAlpha * wakeShape * (0.45 + brokenFoam * 0.72);

          if (alpha < 0.01) discard;

          vec3 dayColor = mix(vec3(0.56, 0.78, 0.88), vec3(0.94, 0.98, 1.0), alpha + centerChurn * 0.22);
          vec3 nightColor = mix(vec3(0.05, 0.09, 0.14), vec3(0.14, 0.17, 0.22), alpha);
          vec3 color = mix(nightColor, dayColor, uDaylight);
          gl_FragColor = vec4(color, alpha * 0.54);
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

  useEffect(() => {
    return () => {
      geometry.dispose();
      material.dispose();
    };
  }, [geometry, material]);

  useFrame((state, delta) => {
    const elapsed = state.clock.elapsedTime;
    const shipTransform = getLiveShipTransform();
    const speed = Math.abs(shipTransform.vel);
    const [px, , pz] = shipTransform.pos;
    const rot = shipTransform.rot;
    const dirX = Math.sin(rot);
    const dirZ = Math.cos(rot);

    if (!initialized.current) {
      const sternX = px - dirX * 2.5;
      const sternZ = pz - dirZ * 2.5;
      lastPos.current = [sternX, sternZ];
      lastRot.current = rot;
      initialized.current = true;
    }

    const rawTurn = Math.atan2(Math.sin(rot - lastRot.current), Math.cos(rot - lastRot.current));
    const angularVelocity = rawTurn / Math.max(delta, 1 / 120);
    const turn = THREE.MathUtils.clamp(angularVelocity * 0.18, -1, 1);
    lastRot.current = rot;

    const sternX = px - dirX * 2.5;
    const sternZ = pz - dirZ * 2.5;
    const dx = sternX - lastPos.current[0];
    const dz = sternZ - lastPos.current[1];
    const distMoved = Math.sqrt(dx * dx + dz * dz);

    if (distMoved > 30) {
      trailRef.current.length = 0;
      lastPos.current = [sternX, sternZ];
    }

    const moving = speed > 0.12;
    const travelX = distMoved > 0.001 ? dx / distMoved : dirX;
    const travelZ = distMoved > 0.001 ? dz / distMoved : dirZ;
    const perpX = -travelZ;
    const perpZ = travelX;

    if (moving && (distMoved > SAMPLE_DIST || trailRef.current.length === 0)) {
      lastPos.current = [sternX, sternZ];
      phaseSeed.current = (phaseSeed.current + 0.173) % 10;
      trailRef.current.unshift({
        x: sternX,
        z: sternZ,
        perpX,
        perpZ,
        speed,
        turn,
        time: elapsed,
        phase: phaseSeed.current,
      });
      if (trailRef.current.length > TRAIL_LENGTH) trailRef.current.pop();
    } else if (moving && trailRef.current.length > 0) {
      const newest = trailRef.current[0];
      newest.x = sternX;
      newest.z = sternZ;
      newest.perpX = perpX;
      newest.perpZ = perpZ;
      newest.speed = speed;
      newest.turn = turn;
      newest.time = elapsed;
    }

    const trail = trailRef.current;
    while (trail.length > 0 && elapsed - trail[trail.length - 1].time > TRAIL_LIFETIME) {
      trail.pop();
    }

    const positions = geometry.attributes.position.array as Float32Array;
    const alphas = geometry.attributes.aAlpha.array as Float32Array;
    const uvs = geometry.attributes.aUv.array as Float32Array;
    const phases = geometry.attributes.aPhase.array as Float32Array;
    let visibleCount = 0;

    for (let i = 0; i < TRAIL_LENGTH; i++) {
      const vi = i * 2;
      if (i < trail.length) {
        const pt = trail[i];
        const ageSeconds = elapsed - pt.time;
        const age = THREE.MathUtils.clamp(ageSeconds / TRAIL_LIFETIME, 0, 1);
        const speedFactor = Math.min(pt.speed / 7, 1);
        const wakeStrength = pt.speed > 0.05 ? Math.min(1, 0.16 + speedFactor * 1.0) : 0;
        const turnStrength = Math.abs(pt.turn);
        const widthCurve = Math.sin(Math.min(age * 3.1, Math.PI)) * 0.68 + 0.36;
        const width = (0.42 + speedFactor * 1.1 + turnStrength * 0.58) * widthCurve;
        const turnBias = pt.turn * turnStrength * (0.18 + speedFactor * 0.14);
        const leftWidth = width * (1 + turnBias);
        const rightWidth = width * (1 - turnBias);

        positions[vi * 3] = pt.x + pt.perpX * leftWidth;
        positions[vi * 3 + 1] = SEA_LEVEL + WAKE_SURFACE_OFFSET;
        positions[vi * 3 + 2] = pt.z + pt.perpZ * leftWidth;
        positions[(vi + 1) * 3] = pt.x - pt.perpX * rightWidth;
        positions[(vi + 1) * 3 + 1] = SEA_LEVEL + WAKE_SURFACE_OFFSET;
        positions[(vi + 1) * 3 + 2] = pt.z - pt.perpZ * rightWidth;

        const a = Math.pow(1 - age, 1.85) * wakeStrength * (1 + turnStrength * 0.38);
        alphas[vi] = a * (1 + Math.max(0, turnBias));
        alphas[vi + 1] = a * (1 + Math.max(0, -turnBias));

        uvs[vi * 2] = 0;
        uvs[vi * 2 + 1] = age;
        uvs[(vi + 1) * 2] = 1;
        uvs[(vi + 1) * 2 + 1] = age;
        phases[vi] = pt.phase;
        phases[vi + 1] = pt.phase;
        if (a > 0.01) visibleCount++;
      } else {
        positions[vi * 3 + 1] = -100;
        positions[(vi + 1) * 3 + 1] = -100;
        alphas[vi] = 0;
        alphas[vi + 1] = 0;
      }
    }

    geometry.attributes.position.needsUpdate = true;
    (geometry.attributes.aAlpha as THREE.BufferAttribute).needsUpdate = true;
    (geometry.attributes.aUv as THREE.BufferAttribute).needsUpdate = true;
    (geometry.attributes.aPhase as THREE.BufferAttribute).needsUpdate = true;

    if (meshRef.current) {
      meshRef.current.visible = visibleCount > 1;
    }
    if (visibleCount !== prevVisibleCount.current) {
      geometry.computeBoundingSphere();
      prevVisibleCount.current = visibleCount;
    }

    material.uniforms.uTime.value = elapsed;
    material.uniforms.uDaylight.value = daylightFactor(useGameStore.getState().timeOfDay);
  });

  return <mesh ref={meshRef} geometry={geometry} material={material} renderOrder={3} />;
}

export function ShipWaterInteraction() {
  const shipWakeEnabled = useGameStore((state) => state.renderDebug.shipWake);

  return (
    <>
      {shipWakeEnabled && <ShipWakeTrail />}
    </>
  );
}
