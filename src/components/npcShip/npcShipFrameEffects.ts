import * as THREE from 'three';
import { SEA_LEVEL } from '../../constants/world';
import { spawnSplash } from '../../utils/splashState';

export interface SmokeParticle {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
}

export interface BubbleParticle {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
}

export function updateSinkingShip({
  group,
  delta,
  sinkProgress,
  sinkSplashFired,
  damageTiltSide,
  bubbleMesh,
  bubbleParticles,
  bubbleDummy,
  bubbleCount,
}: {
  group: THREE.Group;
  delta: number;
  sinkProgress: { current: number };
  sinkSplashFired: { current: boolean };
  damageTiltSide: { current: number };
  bubbleMesh: THREE.InstancedMesh | null;
  bubbleParticles: BubbleParticle[];
  bubbleDummy: THREE.Object3D;
  bubbleCount: number;
}) {
  sinkProgress.current += delta * 0.22;
  const t = sinkProgress.current;
  const side = damageTiltSide.current;

  if (t < 0.3) {
    const p = t / 0.3;
    const ease = p * p;
    group.position.y = -ease * 1.5;
    group.rotation.z = side * ease * 0.6;
    group.rotation.x = ease * 0.15;
  } else if (t < 0.7) {
    const p = (t - 0.3) / 0.4;
    const ease = 1 - (1 - p) * (1 - p);
    group.position.y = -1.5 - ease * 3.0;
    group.rotation.z = side * (0.6 + ease * 0.8);
    group.rotation.x = 0.15 + ease * 0.5;
  } else {
    const p = Math.min(1, (t - 0.7) / 0.3);
    const ease = p * p;
    group.position.y = -4.5 - ease * 4;
    group.rotation.z = side * 1.4;
    group.rotation.x = 0.65 + ease * 0.2;
  }

  if (t > 0.25 && !sinkSplashFired.current) {
    sinkSplashFired.current = true;
    const pos = group.position;
    spawnSplash(pos.x, pos.z, 0.8);
  }

  if (bubbleMesh) {
    const shipPos = group.position;
    for (let i = 0; i < bubbleCount; i++) {
      const bp = bubbleParticles[i];
      if (bp.life <= 0 && t > 0.15 && t < 0.95) {
        bp.pos.set(
          shipPos.x + (Math.random() - 0.5) * 4,
          SEA_LEVEL - 0.1,
          shipPos.z + (Math.random() - 0.5) * 4,
        );
        bp.vel.set(
          (Math.random() - 0.5) * 0.5,
          1.5 + Math.random() * 2,
          (Math.random() - 0.5) * 0.5,
        );
        bp.life = 0.4 + Math.random() * 0.6;
        break;
      }
    }
    let needsUpdate = false;
    for (let i = 0; i < bubbleCount; i++) {
      const bp = bubbleParticles[i];
      if (bp.life > 0) {
        bp.life -= delta;
        bp.pos.addScaledVector(bp.vel, delta);
        bp.vel.x *= 1 - 2 * delta;
        bp.vel.z *= 1 - 2 * delta;
        bubbleDummy.position.copy(bp.pos);
        const s = Math.max(0, bp.life) * 0.25;
        bubbleDummy.scale.set(s, s, s);
        bubbleDummy.updateMatrix();
        bubbleMesh.setMatrixAt(i, bubbleDummy.matrix);
        needsUpdate = true;
      } else if (bp.pos.y > -100) {
        bp.pos.set(0, -1000, 0);
        bubbleDummy.position.copy(bp.pos);
        bubbleDummy.scale.set(0, 0, 0);
        bubbleDummy.updateMatrix();
        bubbleMesh.setMatrixAt(i, bubbleDummy.matrix);
        needsUpdate = true;
      }
    }
    if (needsUpdate) bubbleMesh.instanceMatrix.needsUpdate = true;
  }

  return t >= 1;
}

export function updateDamageMotion({
  group,
  hullFrac,
  delta,
  elapsedTime,
  initialPosition,
  damageTilt,
  damageTiltTarget,
  damageTiltSide,
}: {
  group: THREE.Group;
  hullFrac: number;
  delta: number;
  elapsedTime: number;
  initialPosition: [number, number, number];
  damageTilt: { current: number };
  damageTiltTarget: { current: number };
  damageTiltSide: { current: number };
}) {
  damageTiltTarget.current = hullFrac < 0.85 ? (1 - hullFrac / 0.85) * 0.35 : 0;
  damageTilt.current += (damageTiltTarget.current - damageTilt.current) * delta * 2;

  const sinkOffset = damageTilt.current * 1.2;
  group.position.y = Math.sin(elapsedTime * 2 + initialPosition[0]) * 0.2 - sinkOffset;
  group.rotation.z = Math.sin(elapsedTime * 1.5 + initialPosition[2]) * 0.05
    + damageTilt.current * damageTiltSide.current;
  group.rotation.x = Math.cos(elapsedTime * 1.2 + initialPosition[0]) * 0.05
    + damageTilt.current * 0.15;
}

export function updateSmokeParticles({
  mesh,
  particles,
  dummy,
  count,
  hullFrac,
  delta,
  shipPos,
}: {
  mesh: THREE.InstancedMesh | null;
  particles: SmokeParticle[];
  dummy: THREE.Object3D;
  count: number;
  hullFrac: number;
  delta: number;
  shipPos: THREE.Vector3;
}) {
  if (!mesh) return;

  const spawnRate = hullFrac < 0.3 ? 3 : hullFrac < 0.5 ? 2 : 1;
  let spawned = 0;
  for (let i = 0; i < count && spawned < spawnRate; i++) {
    const sp = particles[i];
    if (sp.life <= 0) {
      sp.pos.set(
        shipPos.x + (Math.random() - 0.5) * 2.5,
        shipPos.y + 1.5 + Math.random() * 1.5,
        shipPos.z + (Math.random() - 0.5) * 2.5,
      );
      sp.vel.set(
        (Math.random() - 0.5) * 0.4,
        1.2 + Math.random() * 1.5,
        (Math.random() - 0.5) * 0.4,
      );
      sp.maxLife = 1.5 + Math.random() * 1.5;
      sp.life = sp.maxLife;
      spawned++;
    }
  }

  let needsUpdate = false;
  for (let i = 0; i < count; i++) {
    const sp = particles[i];
    if (!sp) continue;
    if (sp.life > 0) {
      sp.life -= delta;
      sp.pos.addScaledVector(sp.vel, delta);
      sp.vel.x += (Math.random() - 0.5) * delta * 0.8;
      sp.vel.z += (Math.random() - 0.5) * delta * 0.8;
      sp.vel.y *= 1 - 0.3 * delta;
      dummy.position.copy(sp.pos);
      const lifeRatio = sp.life / sp.maxLife;
      const growPhase = Math.min(1, (1 - lifeRatio) * 4);
      const fadePhase = Math.max(0, lifeRatio);
      const s = growPhase * fadePhase * 0.8;
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      needsUpdate = true;
    } else if (sp.pos.y > -100) {
      sp.pos.set(0, -1000, 0);
      dummy.position.copy(sp.pos);
      dummy.scale.set(0, 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      needsUpdate = true;
    }
  }
  if (needsUpdate) mesh.instanceMatrix.needsUpdate = true;
}

export function updateAlertRing(mesh: THREE.Mesh | null, isAlerted: boolean, distToPlayer: number, elapsedTime: number) {
  if (!mesh) return;
  const showAlert = isAlerted && distToPlayer < 180;
  mesh.visible = showAlert;
  if (showAlert) {
    const pulse = 0.5 + Math.sin(elapsedTime * 6) * 0.3;
    (mesh.material as THREE.MeshBasicMaterial).opacity = pulse;
  }
}

export function updateSelectionRing(mesh: THREE.Mesh | null, isSelected: boolean, elapsedTime: number) {
  if (!mesh) return;
  mesh.visible = isSelected;
  if (isSelected) {
    mesh.rotation.z = elapsedTime * 0.5;
    const pulse = 0.4 + Math.sin(elapsedTime * 3) * 0.15;
    (mesh.material as THREE.MeshBasicMaterial).opacity = pulse;
  }
}

export function updateTorch({
  light,
  material,
  timeOfDay,
  distToPlayer,
  range,
}: {
  light: THREE.PointLight | null;
  material: THREE.MeshStandardMaterial | null;
  timeOfDay: number;
  distToPlayer: number;
  range: number;
}) {
  const theta = ((timeOfDay - 6) / 24) * Math.PI * 2;
  const sunH = Math.sin(theta);
  const torchIntensity = sunH < 0.15 ? Math.min(1, (0.15 - sunH) * 3) : 0;
  const torchVisible = torchIntensity > 0.01 && distToPlayer < range;
  if (light) {
    light.intensity = torchVisible ? torchIntensity * 2 : 0;
    light.visible = torchVisible;
  }
  if (material) {
    material.emissiveIntensity = torchIntensity * 3;
    material.visible = torchIntensity > 0.01;
  }
}

export function updateHealthBar({
  group,
  foreground,
  hullFrac,
  distToPlayer,
  camera,
}: {
  group: THREE.Group | null;
  foreground: THREE.Mesh | null;
  hullFrac: number;
  distToPlayer: number;
  camera: THREE.Camera;
}) {
  if (!group) return;
  const showBar = hullFrac < 1 && distToPlayer < 60;
  group.visible = showBar;
  if (showBar && foreground) {
    foreground.scale.x = Math.max(0.01, hullFrac);
    foreground.position.x = -(1 - hullFrac) * 1.5;
    const mat = foreground.material as THREE.MeshBasicMaterial;
    if (hullFrac > 0.5) {
      mat.color.setRGB(1 - (hullFrac - 0.5) * 2, 1, 0);
    } else {
      mat.color.setRGB(1, hullFrac * 2, 0);
    }
    group.lookAt(camera.position);
  }
}
