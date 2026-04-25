/**
 * windSway.ts — GPU vertex-shader wind sway for vegetation MeshStandardMaterials.
 *
 * Patches the vertex shader via onBeforeCompile so per-instance trees bend in
 * the wind with zero CPU cost. Phase is derived from each instance's world
 * position (via instanceMatrix translation column) so neighboring trees don't
 * lockstep. Sway falloff uses a smoothstep on local Y so the base of the
 * canopy stays anchored and the tip moves full amplitude.
 *
 * Shared uniforms (time, wind direction, wind speed) are updated once per
 * frame by updateWindUniforms() and reused across every patched material.
 *
 * customProgramCacheKey is bucketed by params so all materials with the same
 * shape sway profile share one compiled program (no first-frame stutter).
 */
import * as THREE from 'three';
import { useGameStore } from '../store/gameStore';

export const windUniforms = {
  uWindTime:   { value: 0 },
  uWindDir:    { value: new THREE.Vector2(1, 0) },
  uWindSpeed:  { value: 0 },
};

export function updateWindUniforms(elapsed: number) {
  const { windDirection, windSpeed } = useGameStore.getState();
  windUniforms.uWindTime.value = elapsed;
  windUniforms.uWindDir.value.set(Math.sin(windDirection), Math.cos(windDirection));
  windUniforms.uWindSpeed.value = THREE.MathUtils.clamp(windSpeed, 0, 1);
}

interface WindSwayOpts {
  anchorY?: number;     // local Y where sway begins ramping in (default -1)
  spanY?: number;       // distance over which sway ramps to full (default 3)
  amplitude?: number;   // peak XZ displacement at full speed (default 0.18)
  flutter?: number;     // high-frequency leaf flutter on top of bend (default 0.04)
}

export function applyWindSway(
  mat: THREE.MeshStandardMaterial,
  opts: WindSwayOpts = {},
) {
  if ((mat as any).__windPatched) return;
  (mat as any).__windPatched = true;

  const anchorY   = opts.anchorY   ?? -1.0;
  const spanY     = opts.spanY     ??  3.0;
  const amplitude = opts.amplitude ??  0.18;
  const flutter   = opts.flutter   ??  0.04;

  // Bucket by 2-decimal rounding so close variants share one program.
  const key = `wind-v1:${anchorY.toFixed(2)}:${spanY.toFixed(2)}:${amplitude.toFixed(2)}:${flutter.toFixed(2)}`;
  (mat as any).customProgramCacheKey = () => key;

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime  = windUniforms.uWindTime;
    shader.uniforms.uWindDir   = windUniforms.uWindDir;
    shader.uniforms.uWindSpeed = windUniforms.uWindSpeed;
    shader.uniforms.uWindAnchor    = { value: anchorY };
    shader.uniforms.uWindSpan      = { value: spanY };
    shader.uniforms.uWindAmplitude = { value: amplitude };
    shader.uniforms.uWindFlutter   = { value: flutter };

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uWindTime;
        uniform vec2  uWindDir;
        uniform float uWindSpeed;
        uniform float uWindAnchor;
        uniform float uWindSpan;
        uniform float uWindAmplitude;
        uniform float uWindFlutter;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec2 _windInstXZ = vec2(instanceMatrix[3].x, instanceMatrix[3].z);
        #else
          vec2 _windInstXZ = vec2(0.0);
        #endif
        float _windPhase = _windInstXZ.x * 0.13 + _windInstXZ.y * 0.17;
        float _windFall = clamp((position.y - uWindAnchor) / max(uWindSpan, 0.0001), 0.0, 1.0);
        _windFall = _windFall * _windFall * (3.0 - 2.0 * _windFall);
        float _windWave = sin(uWindTime * 1.3 + _windPhase) * 0.65
                        + sin(uWindTime * 2.6 + _windPhase * 1.4) * 0.35;
        float _windFlut = sin(uWindTime * 6.1 + _windPhase * 3.1) * uWindFlutter;
        vec2 _windOff = uWindDir * uWindSpeed * _windFall * (uWindAmplitude * _windWave + _windFlut);
        transformed.x += _windOff.x;
        transformed.z += _windOff.y;`
      );
  };
  mat.needsUpdate = true;
}
