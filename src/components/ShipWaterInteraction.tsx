import { useMemo, useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '../store/gameStore';
import { SEA_LEVEL } from '../constants/world';
import { getLiveShipMotion, getLiveShipTransform } from '../utils/livePlayerTransform';
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
const HULL_WAKE_COUNT = 112;
const HULL_WAKE_SURFACE_OFFSET = WAKE_SURFACE_OFFSET + 0.01;
const TURN_SIDE_SIGN = -1;

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
          gl_FragColor = vec4(color, alpha * 0.24);
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
        const width = (0.34 + speedFactor * 0.78 + turnStrength * 0.36) * widthCurve;
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

type HullWakeKind = 0 | 1 | 2;

interface HullWakeStamp {
  x: number;
  z: number;
  vx: number;
  vz: number;
  angle: number;
  scaleX: number;
  scaleZ: number;
  life: number;
  maxLife: number;
  alpha: number;
  seed: number;
  kind: HullWakeKind;
}

function HullWakeField() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  useWaterOverlayLayer(meshRef);

  const stampsRef = useRef<HullWakeStamp[]>(
    Array.from({ length: HULL_WAKE_COUNT }, () => ({
      x: 0,
      z: 0,
      vx: 0,
      vz: 0,
      angle: 0,
      scaleX: 0,
      scaleZ: 0,
      life: 0,
      maxLife: 1,
      alpha: 0,
      seed: 0,
      kind: 0,
    })),
  );
  const cursorRef = useRef(0);
  const sternEmitRef = useRef(0);
  const bowEmitRef = useRef(0);
  const turnEmitRef = useRef(0);
  const lastPosRef = useRef<[number, number]>([0, 0]);
  const initializedRef = useRef(false);

  const { geometry, material } = useMemo(() => {
    const geo = new THREE.PlaneGeometry(1, 1, 1, 1);
    geo.setAttribute('aLife', new THREE.InstancedBufferAttribute(new Float32Array(HULL_WAKE_COUNT), 1));
    geo.setAttribute('aAlpha', new THREE.InstancedBufferAttribute(new Float32Array(HULL_WAKE_COUNT), 1));
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(new Float32Array(HULL_WAKE_COUNT), 1));
    geo.setAttribute('aKind', new THREE.InstancedBufferAttribute(new Float32Array(HULL_WAKE_COUNT), 1));

    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uDaylight: { value: 1.0 } },
      vertexShader: /* glsl */ `
        attribute float aLife;
        attribute float aAlpha;
        attribute float aSeed;
        attribute float aKind;
        varying vec2 vUv;
        varying vec2 vWorldXZ;
        varying float vLife;
        varying float vAlpha;
        varying float vSeed;
        varying float vKind;

        void main() {
          vUv = uv;
          vLife = aLife;
          vAlpha = aAlpha;
          vSeed = aSeed;
          vKind = aKind;
          vec4 worldPosition = instanceMatrix * vec4(position, 1.0);
          vWorldXZ = worldPosition.xz;
          gl_Position = projectionMatrix * modelViewMatrix * worldPosition;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uDaylight;
        varying vec2 vUv;
        varying vec2 vWorldXZ;
        varying float vLife;
        varying float vAlpha;
        varying float vSeed;
        varying float vKind;

        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                     mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
        }
        float fbm(vec2 p) {
          float v = 0.0;
          float a = 0.5;
          mat2 rot = mat2(0.83, 0.56, -0.56, 0.83);
          for (int i = 0; i < 3; i++) {
            v += noise(p) * a;
            p = rot * p * 2.05 + vec2(19.7, 3.1);
            a *= 0.5;
          }
          return v;
        }

        void main() {
          if (vAlpha < 0.01) discard;

          vec2 p = vUv * 2.0 - 1.0;
          float longFade = 1.0 - smoothstep(0.48, 1.0, abs(p.y));
          float beamFade = 1.0 - smoothstep(0.22, 0.92, abs(p.x));
          float shoulder = smoothstep(-0.96, -0.12, p.y) * (1.0 - smoothstep(0.36, 0.98, p.y));
          float turnRake = smoothstep(-0.85, 0.16, p.y) * (1.0 - smoothstep(0.18, 0.98, abs(p.x)));
          float streakMask = beamFade * longFade;
          streakMask = mix(streakMask, max(streakMask * 0.75, shoulder * beamFade), step(0.5, vKind));
          streakMask = mix(streakMask, max(streakMask * 0.55, turnRake), step(1.5, vKind));

          float localNoise = fbm(vec2(p.x * 8.4 + vSeed, p.y * 2.4 - vLife * 1.2));
          float worldNoise = fbm(vWorldXZ * 0.85 + vec2(vSeed * 2.3, -vSeed) + uTime * vec2(0.08, -0.14));
          float broken = smoothstep(0.27, 0.86, localNoise * 0.58 + worldNoise * 0.42);
          float lace = smoothstep(0.50, 0.93, fbm(vec2(p.x * 15.0, p.y * 2.3 + vSeed * 4.0)));
          float gaps = smoothstep(0.18, 0.72, fbm(vec2(p.x * 5.0 - vSeed, p.y * 7.0 + vLife)));

          float fade = pow(1.0 - vLife, 1.25);
          float foam = streakMask * (0.12 + broken * 0.72) * (0.35 + lace * 0.65) * gaps;
          float disturbedWater = streakMask * (1.0 - smoothstep(0.0, 0.95, vLife)) * 0.16;
          float alpha = vAlpha * fade * (foam * 0.58 + disturbedWater);

          if (alpha < 0.012) discard;

          vec3 waterTint = vec3(0.34, 0.62, 0.68);
          vec3 foamTint = vec3(0.88, 0.97, 1.0);
          vec3 dayColor = mix(waterTint, foamTint, clamp(foam * 1.4, 0.0, 1.0));
          vec3 nightColor = mix(vec3(0.035, 0.07, 0.10), vec3(0.18, 0.23, 0.26), clamp(foam, 0.0, 1.0));
          vec3 color = mix(nightColor, dayColor, uDaylight);
          gl_FragColor = vec4(color, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -3,
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

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    dummy.position.set(0, -1000, 0);
    dummy.scale.set(0, 0, 0);
    dummy.updateMatrix();
    for (let i = 0; i < HULL_WAKE_COUNT; i++) mesh.setMatrixAt(i, dummy.matrix);
    mesh.instanceMatrix.needsUpdate = true;
  }, []);

  useFrame((state, delta) => {
    const elapsed = state.clock.elapsedTime;
    const ship = getLiveShipTransform();
    const motion = getLiveShipMotion();
    const [px, , pz] = ship.pos;
    const rot = ship.rot;
    const speedRatio = THREE.MathUtils.clamp(motion.speedRatio, 0, 1);
    const speed = Math.abs(ship.vel);
    const shipLength = THREE.MathUtils.clamp(motion.shipLength, 3.2, 8.2);
    const shipWidth = THREE.MathUtils.clamp(motion.shipWidth, 1.1, 3.2);
    const fwdX = Math.sin(rot);
    const fwdZ = Math.cos(rot);
    const rightX = Math.cos(rot);
    const rightZ = -Math.sin(rot);

    if (!initializedRef.current) {
      lastPosRef.current = [px, pz];
      initializedRef.current = true;
    }

    const dx = px - lastPosRef.current[0];
    const dz = pz - lastPosRef.current[1];
    const distMoved = Math.sqrt(dx * dx + dz * dz);
    if (distMoved > 30) {
      for (const stamp of stampsRef.current) stamp.life = 0;
    }
    lastPosRef.current = [px, pz];

    const wakeActive = speed > 0.08 && speedRatio > 0.025;
    const absTurn = Math.abs(motion.angularVelocity);
    const turnStrength = wakeActive
      ? THREE.MathUtils.clamp((absTurn - 0.15) * 0.55 * (0.35 + speedRatio * 0.9) + Math.abs(motion.heel) * 0.18, 0, 1)
      : 0;

    const emitStamp = (
      x: number,
      z: number,
      vx: number,
      vz: number,
      angle: number,
      scaleX: number,
      scaleZ: number,
      life: number,
      alpha: number,
      kind: HullWakeKind,
    ) => {
      const stamp = stampsRef.current[cursorRef.current];
      cursorRef.current = (cursorRef.current + 1) % HULL_WAKE_COUNT;
      stamp.x = x;
      stamp.z = z;
      stamp.vx = vx;
      stamp.vz = vz;
      stamp.angle = angle;
      stamp.scaleX = scaleX;
      stamp.scaleZ = scaleZ;
      stamp.life = life;
      stamp.maxLife = life;
      stamp.alpha = alpha;
      stamp.seed = Math.random() * 20;
      stamp.kind = kind;
    };

    if (wakeActive) {
      sternEmitRef.current += delta * (4.5 + speedRatio * 7.5);
      bowEmitRef.current += delta * (2.0 + speedRatio * 3.2);
      turnEmitRef.current += delta * (turnStrength * (12.0 + speedRatio * 12.0));

      while (sternEmitRef.current >= 1) {
        sternEmitRef.current -= 1;
        const side = Math.random() > 0.5 ? 1 : -1;
        const aft = shipLength * (0.44 + Math.random() * 0.10);
        const beam = side * shipWidth * (0.18 + Math.random() * 0.22);
        const x = px - fwdX * aft + rightX * beam;
        const z = pz - fwdZ * aft + rightZ * beam;
        const backDrift = 0.12 + speedRatio * 0.34 + Math.random() * 0.08;
        const sideDrift = side * (0.05 + Math.random() * 0.08);
          emitStamp(
          x,
          z,
          -fwdX * backDrift + rightX * sideDrift,
          -fwdZ * backDrift + rightZ * sideDrift,
          rot + (Math.random() - 0.5) * 0.38,
          shipWidth * (0.34 + speedRatio * 0.22) * (0.85 + Math.random() * 0.35),
          shipLength * (0.42 + speedRatio * 0.34),
          1.8 + speedRatio * 1.5 + Math.random() * 0.8,
          0.075 + speedRatio * 0.13,
          0,
        );
      }

      while (bowEmitRef.current >= 1) {
        bowEmitRef.current -= 1;
        for (const side of [-1, 1] as const) {
          const bow = shipLength * (0.42 + Math.random() * 0.08);
          const beam = side * shipWidth * (0.48 + Math.random() * 0.13);
          const x = px + fwdX * bow + rightX * beam;
          const z = pz + fwdZ * bow + rightZ * beam;
          const outward = 0.12 + speedRatio * 0.18;
          const backDrift = 0.05 + speedRatio * 0.12;
          emitStamp(
            x,
            z,
            rightX * side * outward - fwdX * backDrift,
            rightZ * side * outward - fwdZ * backDrift,
            rot + side * 0.35 + (Math.random() - 0.5) * 0.16,
            shipWidth * (0.22 + speedRatio * 0.13),
            shipLength * (0.26 + speedRatio * 0.14),
            0.9 + speedRatio * 0.8 + Math.random() * 0.35,
            0.035 + speedRatio * 0.065,
            1,
          );
        }
      }

      while (turnEmitRef.current >= 1) {
        turnEmitRef.current -= 1;
        const side = Math.sign(motion.angularVelocity || motion.heel || 1) * TURN_SIDE_SIGN;
        const along = -shipLength * (0.08 + Math.random() * 0.34);
        const beam = side * shipWidth * (0.48 + Math.random() * 0.25);
        const x = px + fwdX * along + rightX * beam;
        const z = pz + fwdZ * along + rightZ * beam;
        const outward = 0.34 + turnStrength * 1.02 + Math.random() * 0.22;
        const backDrift = 0.14 + speedRatio * 0.26 + turnStrength * 0.32;
        emitStamp(
          x,
          z,
          rightX * side * outward - fwdX * backDrift,
          rightZ * side * outward - fwdZ * backDrift,
          rot + side * (0.55 + Math.random() * 0.35),
          shipWidth * (0.56 + turnStrength * 0.62),
          shipLength * (0.46 + speedRatio * 0.24 + turnStrength * 0.48),
          1.45 + turnStrength * 1.55 + Math.random() * 0.55,
          0.16 + turnStrength * 0.34,
          2,
        );
      }
    } else {
      sternEmitRef.current = 0;
      bowEmitRef.current = 0;
      turnEmitRef.current = 0;
    }

    const mesh = meshRef.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    const quat = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const scale = new THREE.Vector3();
    const pos = new THREE.Vector3();
    const lifeAttr = geometry.attributes.aLife as THREE.InstancedBufferAttribute;
    const alphaAttr = geometry.attributes.aAlpha as THREE.InstancedBufferAttribute;
    const seedAttr = geometry.attributes.aSeed as THREE.InstancedBufferAttribute;
    const kindAttr = geometry.attributes.aKind as THREE.InstancedBufferAttribute;
    let visible = 0;

    for (let i = 0; i < HULL_WAKE_COUNT; i++) {
      const stamp = stampsRef.current[i];
      if (stamp.life > 0) {
        stamp.life -= delta;
        const age = 1 - Math.max(0, stamp.life) / stamp.maxLife;
        stamp.x += stamp.vx * delta;
        stamp.z += stamp.vz * delta;
        stamp.vx *= Math.exp(-delta * 0.42);
        stamp.vz *= Math.exp(-delta * 0.42);
        const spread = 1 + age * (stamp.kind === 2 ? 0.95 : 0.58);

        pos.set(stamp.x, SEA_LEVEL + HULL_WAKE_SURFACE_OFFSET + i * 0.000015, stamp.z);
        euler.set(-Math.PI / 2, 0, stamp.angle);
        quat.setFromEuler(euler);
        scale.set(stamp.scaleX * spread, stamp.scaleZ * spread, 1);
        dummy.matrix.compose(pos, quat, scale);
        mesh.setMatrixAt(i, dummy.matrix);
        lifeAttr.setX(i, age);
        alphaAttr.setX(i, stamp.alpha);
        seedAttr.setX(i, stamp.seed);
        kindAttr.setX(i, stamp.kind);
        visible++;
      } else {
        dummy.position.set(0, -1000, 0);
        dummy.scale.set(0, 0, 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        lifeAttr.setX(i, 1);
        alphaAttr.setX(i, 0);
      }
    }

    mesh.visible = visible > 0;
    mesh.instanceMatrix.needsUpdate = true;
    lifeAttr.needsUpdate = true;
    alphaAttr.needsUpdate = true;
    seedAttr.needsUpdate = true;
    kindAttr.needsUpdate = true;
    material.uniforms.uTime.value = elapsed;
    material.uniforms.uDaylight.value = daylightFactor(useGameStore.getState().timeOfDay);
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, HULL_WAKE_COUNT]}
      frustumCulled={false}
      renderOrder={4}
    />
  );
}

export function ShipWaterInteraction() {
  const shipWakeEnabled = useGameStore((state) => state.renderDebug.shipWake);

  return (
    <>
      {shipWakeEnabled && (
        <>
          <ShipWakeTrail />
          <HullWakeField />
        </>
      )}
    </>
  );
}
