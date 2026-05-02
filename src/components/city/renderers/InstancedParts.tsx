import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { buildingShakes, getBuildingDamageFraction, getBuildingDamageStage, getBuildingDamageVersion } from '../../../utils/impactShakeState';
import type { Part } from '../cityTypes';
import { BUILDING_SHAKE_DURATION, BUILDING_SHAKE_SWAY, applyGroundWeathering, damagedColor, isDelicateDetailPart, isRoofLikePart, isWindowLikePart, ruinedColor } from '../cityMaterials';

// ── Instanced Parts Renderer ──────────────────────────────────────────────────

export function InstancedParts({ parts, geometry, material }: { parts: Part[]; geometry: THREE.BufferGeometry; material: THREE.Material }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummyRef = useRef(new THREE.Object3D());
  const colorRef = useRef(new THREE.Color());
  const hadShakeRef = useRef(false);
  const damageVersionRef = useRef(-1);

  function applyPartMatrix(dummy: THREE.Object3D, part: Part) {
    const centerY = part.shakeCenter?.[1] ?? part.pos[1];
    const damageStage = part.buildingId ? getBuildingDamageStage(part.buildingId) : 'intact';
    const damageFraction = part.buildingId ? getBuildingDamageFraction(part.buildingId) : 0;

    dummy.position.set(...part.pos);
    dummy.scale.set(...part.scale);
    dummy.rotation.set(...part.rot);

    if (damageStage === 'destroyed') {
      if (isRoofLikePart(part, centerY)) {
        const side = Math.sin((part.pos[0] + part.pos[2]) * 4.17) > 0 ? 1 : -1;
        dummy.scale.y *= 0.16;
        dummy.scale.x *= 0.82;
        dummy.scale.z *= 0.86;
        dummy.position.y = Math.max(part.pos[1] - 1.15, centerY - 1.05);
        dummy.rotation.x += 0.34 * side;
        dummy.rotation.z += 0.22 * side;
      } else if (isWindowLikePart(part, centerY)) {
        dummy.scale.setScalar(0.0001);
      } else if (isDelicateDetailPart(part, centerY)) {
        dummy.scale.setScalar(0.0001);
      } else if (part.pos[1] > centerY + 0.6) {
        dummy.rotation.z += 0.04;
        dummy.position.y -= Math.min(0.8, damageFraction * 0.6);
      }
    } else if (damageStage === 'heavilyDamaged') {
      if (isDelicateDetailPart(part, centerY)) {
        dummy.scale.multiplyScalar(0.72);
        dummy.position.y -= 0.08;
      } else if (isRoofLikePart(part, centerY)) {
        dummy.rotation.z += 0.08;
        dummy.position.y -= 0.14;
      }
    }

    if (geometry instanceof THREE.CylinderGeometry && geometry.parameters.radialSegments === 4) {
      dummy.rotation.y += Math.PI / 4;
    }
    dummy.updateMatrix();
  }

  function applyInstanceColors() {
    const mesh = meshRef.current;
    if (!mesh) return;
    const color = colorRef.current;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (!p.color) continue;
      let finalColor = applyGroundWeathering(p.color, p);
      if (p.buildingId) {
        const damageStage = getBuildingDamageStage(p.buildingId);
        if (damageStage === 'destroyed') {
          finalColor = ruinedColor(finalColor);
        } else if (damageStage !== 'intact') {
          finalColor = damagedColor(finalColor, getBuildingDamageFraction(p.buildingId));
        }
      }
      color.setRGB(finalColor[0], finalColor[1], finalColor[2]);
      mesh.setColorAt(i, color);
    }
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }
    damageVersionRef.current = getBuildingDamageVersion();
  }

  useEffect(() => {
    if (!meshRef.current) return;
    const dummy = dummyRef.current;
    parts.forEach((p, i) => {
      applyPartMatrix(dummy, p);
      meshRef.current!.setMatrixAt(i, dummy.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
    applyInstanceColors();
  }, [parts, geometry]);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    if (damageVersionRef.current !== getBuildingDamageVersion()) {
      const dummy = dummyRef.current;
      for (let i = 0; i < parts.length; i++) {
        applyPartMatrix(dummy, parts[i]);
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      applyInstanceColors();
    }

    const now = Date.now() * 0.001;
    let hasRecentShake = false;
    for (const shake of buildingShakes) {
      const age = now - shake.time;
      if (age >= 0 && age < BUILDING_SHAKE_DURATION) {
        hasRecentShake = true;
        break;
      }
    }
    if (!hasRecentShake && !hadShakeRef.current) return;

    const dummy = dummyRef.current;
    let needsUpdate = false;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      let offsetX = 0;
      let offsetY = 0;
      let offsetZ = 0;
      if (p.buildingId && p.shakeCenter) {
        for (const shake of buildingShakes) {
          if (shake.buildingId !== p.buildingId) continue;
          const age = now - shake.time;
          if (age < 0 || age >= BUILDING_SHAKE_DURATION) continue;
          const decay = 1 - age / BUILDING_SHAKE_DURATION;
          const amp = BUILDING_SHAKE_SWAY * shake.intensity * decay;
          const radialX = p.pos[0] - p.shakeCenter[0];
          const radialZ = p.pos[2] - p.shakeCenter[2];
          offsetX += Math.sin(age * 62 + i * 0.37) * amp + radialX * 0.018 * amp;
          offsetY += Math.abs(Math.sin(age * 88 + i * 0.21)) * amp * 0.28;
          offsetZ += Math.cos(age * 57 + i * 0.29) * amp + radialZ * 0.018 * amp;
        }
      }

      dummy.position.set(p.pos[0] + offsetX, p.pos[1] + offsetY, p.pos[2] + offsetZ);
      applyPartMatrix(dummy, p);
      dummy.position.x += offsetX;
      dummy.position.y += offsetY;
      dummy.position.z += offsetZ;
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      needsUpdate = true;
    }

    if (needsUpdate) {
      mesh.instanceMatrix.needsUpdate = true;
    }
    hadShakeRef.current = hasRecentShake;
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, parts.length]}
      castShadow
      receiveShadow
      frustumCulled={false}
    />
  );
}