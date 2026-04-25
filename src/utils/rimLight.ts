/**
 * rimLight.ts — shared fresnel rim-light shader patch for MeshStandardMaterial.
 *
 * Adds silhouette lighting tinted with the current sky/fog color so figures
 * read against the background. Patched via onBeforeCompile, with a stable
 * customProgramCacheKey so all rim-patched materials share one compiled
 * program (no first-frame compile stutter).
 *
 * Update path: call updateRimFromFog(scene) once per frame from any active
 * useFrame; uniforms are shared across every patched material.
 */
import * as THREE from 'three';

export const rimUniforms = {
  uRimColor:     { value: new THREE.Color('#a8c8e8') },
  uRimIntensity: { value: 0.22 },
  uRimPower:     { value: 2.6 },
};

const _white = new THREE.Color(1, 1, 1);
const _scratch = new THREE.Color();

// Tints rim with fog color (already mood-blended in GameScene), pulled toward
// white so it reads as bounced sky rather than a colored halo. Clamped low
// enough to stay below the Bloom luminanceThreshold (0.35) on bright days.
export function updateRimFromFog(scene: THREE.Scene) {
  const fog = scene.fog as THREE.Fog | null;
  if (!fog) return;
  _scratch.copy(fog.color).lerp(_white, 0.25).multiplyScalar(0.85);
  rimUniforms.uRimColor.value.copy(_scratch);
}

const RIM_KEY = 'rim-light-v1';

export function applyRimLight(mat: THREE.MeshStandardMaterial, intensityMul = 1) {
  if ((mat as any).__rimPatched) return;
  (mat as any).__rimPatched = true;

  // Stable cache key keyed only by intensity bucket so the program is shared
  // across every material with the same multiplier.
  const bucket = intensityMul.toFixed(2);
  (mat as any).customProgramCacheKey = () => `${RIM_KEY}:${bucket}`;

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uRimColor = rimUniforms.uRimColor;
    shader.uniforms.uRimIntensity = rimUniforms.uRimIntensity;
    shader.uniforms.uRimPower = rimUniforms.uRimPower;
    shader.uniforms.uRimMul = { value: intensityMul };

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform vec3 uRimColor;
        uniform float uRimIntensity;
        uniform float uRimPower;
        uniform float uRimMul;`
      )
      .replace(
        '#include <opaque_fragment>',
        `vec3 rimN = normalize(normal);
        vec3 rimV = normalize(vViewPosition);
        float rim = 1.0 - max(dot(rimN, rimV), 0.0);
        rim = pow(rim, uRimPower);
        outgoingLight += uRimColor * rim * uRimIntensity * uRimMul;
        #include <opaque_fragment>`
      );
  };
  mat.needsUpdate = true;
}

// Walk a subtree and rim-patch every MeshStandardMaterial whose name doesn't
// match an excluded keyword (sails, glass, flames, etc.). Idempotent — safe to
// call multiple times; applyRimLight no-ops on already-patched materials.
export function applyRimLightToTree(
  root: THREE.Object3D,
  opts: { intensityMul?: number; skipNamePattern?: RegExp } = {},
) {
  const skip = opts.skipNamePattern ?? /sail|flag|cloth|glass|flame|fire|emissive/i;
  const mul = opts.intensityMul ?? 1;
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      if (!m || !(m as any).isMeshStandardMaterial) continue;
      const std = m as THREE.MeshStandardMaterial;
      if (std.transparent) continue;
      if (std.name && skip.test(std.name)) continue;
      // Skip materials that are primarily emissive — rim on a lantern looks bad.
      if (std.emissive && std.emissiveIntensity > 0.5) continue;
      applyRimLight(std, mul);
    }
  });
}
