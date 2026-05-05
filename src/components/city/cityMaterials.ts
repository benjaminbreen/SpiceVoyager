import * as THREE from 'three';
import type { Part } from './cityTypes';
import { lerpColor } from './cityRandom';

export const BUILDING_SHAKE_DURATION = 0.28;
export const BUILDING_SHAKE_SWAY = 0.18;

export type BuildingMaterialKind = Exclude<Part['mat'], 'dark' | 'litWindow'>;

export const BUILDING_MATERIAL_TUNING: Record<BuildingMaterialKind, {
  grain: number;
  lowerShade: number;
  topLift: number;
  shadeLift: number;
  warmLift: [number, number, number];
  roughnessVariation: number;
  sunLift: number;
}> = {
  white: {
    grain: 0.032,
    lowerShade: 0.001,
    topLift: 0.34,
    shadeLift: 0.24,
    warmLift: [1.12, 1.08, 1.00],
    roughnessVariation: 0.02,
    sunLift: 0.30,
  },
  mud: {
    grain: 0.075,
    lowerShade: 0.018,
    topLift: 0.055,
    shadeLift: 0.03,
    warmLift: [1.06, 1.02, 0.94],
    roughnessVariation: 0.07,
    sunLift: 0.13,
  },
  wood: {
    grain: 0.090,
    lowerShade: 0.018,
    topLift: 0.035,
    shadeLift: 0.02,
    warmLift: [1.06, 1.00, 0.92],
    roughnessVariation: 0.08,
    sunLift: 0.10,
  },
  terracotta: {
    grain: 0.080,
    lowerShade: 0.010,
    topLift: 0.100,
    shadeLift: 0.02,
    warmLift: [1.12, 1.00, 0.90],
    roughnessVariation: 0.06,
    sunLift: 0.13,
  },
  stone: {
    grain: 0.060,
    lowerShade: 0.015,
    topLift: 0.055,
    shadeLift: 0.04,
    warmLift: [1.06, 1.04, 0.98],
    roughnessVariation: 0.05,
    sunLift: 0.20,
  },
  straw: {
    grain: 0.075,
    lowerShade: 0.012,
    topLift: 0.080,
    shadeLift: 0.02,
    warmLift: [1.12, 1.07, 0.90],
    roughnessVariation: 0.08,
    sunLift: 0.11,
  },
  tileRoof: {
    grain: 0.085,
    lowerShade: 0.008,
    topLift: 0.145,
    shadeLift: 0.012,
    warmLift: [1.20, 1.03, 0.88],
    roughnessVariation: 0.115,
    sunLift: 0.22,
  },
  thatchRoof: {
    grain: 0.065,
    lowerShade: 0.018,
    topLift: 0.050,
    shadeLift: 0.02,
    warmLift: [1.08, 1.04, 0.92],
    roughnessVariation: 0.075,
    sunLift: 0.085,
  },
  woodRoof: {
    grain: 0.080,
    lowerShade: 0.014,
    topLift: 0.045,
    shadeLift: 0.02,
    warmLift: [1.06, 1.01, 0.94],
    roughnessVariation: 0.075,
    sunLift: 0.09,
  },
};

function mulberryTextureRng(seed: number) {
  return function() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function createTileRoofTexture(): THREE.CanvasTexture {
  const rng = mulberryTextureRng(0x7a11e);
  const size = 224;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#b85a3d';
  ctx.fillRect(0, 0, size, size);
  for (let y = 0; y < size; y += 18) {
    const rowShift = (y / 18) % 2 === 0 ? 0 : 13;
    ctx.fillStyle = 'rgba(48, 13, 8, 0.72)';
    ctx.fillRect(0, y, size, 3);
    ctx.fillStyle = 'rgba(255, 196, 130, 0.30)';
    ctx.fillRect(0, y + 3, size, 2);
    for (let x = -rowShift; x < size; x += 26) {
      const warm = 135 + Math.floor(rng() * 70);
      ctx.fillStyle = `rgba(${warm}, ${Math.floor(warm * 0.38)}, ${Math.floor(warm * 0.23)}, ${0.18 + rng() * 0.12})`;
      ctx.fillRect(x + 2, y + 5, 22, 12);
      ctx.fillStyle = 'rgba(38, 10, 7, 0.48)';
      ctx.fillRect(x, y + 4, 3, 14);
      ctx.fillStyle = 'rgba(255, 230, 170, 0.18)';
      ctx.fillRect(x + 3, y + 5, 2, 11);
    }
  }
  for (let i = 0; i < 1900; i++) {
    const hot = rng() < 0.44;
    const v = hot ? 145 + Math.floor(rng() * 100) : 45 + Math.floor(rng() * 90);
    ctx.fillStyle = hot
      ? `rgba(${v}, ${Math.floor(v * 0.48)}, ${Math.floor(v * 0.28)}, ${0.08 + rng() * 0.12})`
      : `rgba(${v}, ${Math.floor(v * 0.30)}, ${Math.floor(v * 0.20)}, ${0.09 + rng() * 0.13})`;
    ctx.fillRect(rng() * size, rng() * size, rng() < 0.8 ? 1 : 2, 1);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1.65, 1.65);
  tex.anisotropy = 4;
  return tex;
}

function finishSurfaceTexture(canvas: HTMLCanvasElement, repeat = 1.4): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = 4;
  return tex;
}

function createLimewashTexture(): THREE.CanvasTexture {
  const rng = mulberryTextureRng(0x11fef0);
  const size = 160;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#f4f0e4';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 900; i++) {
    const x = rng() * size;
    const y = rng() * size;
    const r = 3 + rng() * 12;
    const warm = rng() < 0.58;
    const a = 0.035 + rng() * 0.055;
    ctx.fillStyle = warm
      ? `rgba(255, ${235 + Math.floor(rng() * 14)}, ${198 + Math.floor(rng() * 26)}, ${a})`
      : `rgba(${200 + Math.floor(rng() * 35)}, ${215 + Math.floor(rng() * 25)}, 235, ${a})`;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * (0.45 + rng() * 0.7), rng() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < 120; i++) {
    const v = 220 + Math.floor(rng() * 30);
    ctx.fillStyle = `rgba(${v}, ${v - 6}, ${v - 18}, 0.18)`;
    ctx.fillRect(rng() * size, rng() * size, 1 + rng() * 3, 1);
  }
  return finishSurfaceTexture(canvas, 1.25);
}

function createStoneSurfaceTexture(): THREE.CanvasTexture {
  const rng = mulberryTextureRng(0x57011e);
  const size = 160;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#b9b4a7';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 1400; i++) {
    const v = 145 + Math.floor(rng() * 95);
    const a = 0.05 + rng() * 0.12;
    ctx.fillStyle = `rgba(${v}, ${Math.floor(v * 0.98)}, ${Math.floor(v * 0.90)}, ${a})`;
    ctx.fillRect(rng() * size, rng() * size, rng() < 0.75 ? 1 : 2, 1);
  }
  for (let i = 0; i < 70; i++) {
    const x = rng() * size;
    const y = rng() * size;
    ctx.strokeStyle = `rgba(245, 238, 210, ${0.08 + rng() * 0.08})`;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rng() - 0.5) * 16, y + (rng() - 0.5) * 10);
    ctx.stroke();
  }
  return finishSurfaceTexture(canvas, 1.35);
}

function createMudPlasterTexture(): THREE.CanvasTexture {
  const rng = mulberryTextureRng(0xc1a7);
  const size = 160;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#c7a477';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 1200; i++) {
    const v = 130 + Math.floor(rng() * 95);
    ctx.fillStyle = `rgba(${v}, ${Math.floor(v * 0.78)}, ${Math.floor(v * 0.48)}, ${0.045 + rng() * 0.09})`;
    ctx.fillRect(rng() * size, rng() * size, 1 + Math.floor(rng() * 2), 1);
  }
  for (let i = 0; i < 180; i++) {
    const x = rng() * size;
    const y = rng() * size;
    ctx.strokeStyle = `rgba(236, 205, 145, ${0.10 + rng() * 0.10})`;
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rng() - 0.5) * 10, y + 2 + rng() * 8);
    ctx.stroke();
  }
  return finishSurfaceTexture(canvas, 1.45);
}

function createWoodSurfaceTexture(): THREE.CanvasTexture {
  const rng = mulberryTextureRng(0x600d);
  const size = 160;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#8c6b4f';
  ctx.fillRect(0, 0, size, size);
  for (let y = 0; y < size; y += 12) {
    ctx.fillStyle = `rgba(245, 220, 180, ${0.035 + rng() * 0.05})`;
    ctx.fillRect(0, y, size, 1);
    ctx.fillStyle = `rgba(40, 24, 12, ${0.06 + rng() * 0.08})`;
    ctx.fillRect(0, y + 7 + Math.floor(rng() * 3), size, 1);
  }
  for (let i = 0; i < 420; i++) {
    const y = rng() * size;
    const x = rng() * size;
    ctx.strokeStyle = `rgba(${60 + Math.floor(rng() * 80)}, ${42 + Math.floor(rng() * 60)}, ${24 + Math.floor(rng() * 38)}, ${0.05 + rng() * 0.10})`;
    ctx.lineWidth = 0.5 + rng() * 0.8;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 18 + rng() * 42, y + (rng() - 0.5) * 3);
    ctx.stroke();
  }
  return finishSurfaceTexture(canvas, 1.5);
}

function createThatchRoofTexture(): THREE.CanvasTexture {
  const rng = mulberryTextureRng(0x71a7c4);
  const size = 192;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#c7b882';
  ctx.fillRect(0, 0, size, size);
  for (let y = 10; y < size; y += 24) {
    ctx.fillStyle = 'rgba(56, 42, 20, 0.13)';
    ctx.fillRect(0, y, size, 2);
    ctx.fillStyle = 'rgba(255, 245, 190, 0.07)';
    ctx.fillRect(0, y + 2, size, 1);
  }
  for (let i = 0; i < 900; i++) {
    const x = rng() * size;
    const y = rng() * size;
    const len = 14 + rng() * 34;
    const shade = 64 + Math.floor(rng() * 110);
    ctx.strokeStyle = `rgba(${shade}, ${Math.floor(shade * 0.86)}, ${Math.floor(shade * 0.50)}, ${0.10 + rng() * 0.14})`;
    ctx.lineWidth = 0.55 + rng() * 0.65;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rng() - 0.5) * 7, y + len);
    ctx.stroke();
  }
  for (let i = 0; i < 260; i++) {
    const v = 95 + Math.floor(rng() * 130);
    ctx.fillStyle = `rgba(${v}, ${Math.floor(v * 0.86)}, ${Math.floor(v * 0.52)}, 0.10)`;
    ctx.fillRect(rng() * size, rng() * size, 2, 1);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1.15, 1.15);
  tex.anisotropy = 4;
  return tex;
}

function createWoodRoofTexture(): THREE.CanvasTexture {
  const rng = mulberryTextureRng(0x522f17);
  const size = 192;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#aa8b70';
  ctx.fillRect(0, 0, size, size);
  for (let y = 0; y < size; y += 18) {
    const rowShift = ((y / 18) % 2) * 16;
    ctx.fillStyle = 'rgba(22, 15, 10, 0.50)';
    ctx.fillRect(0, y, size, 3);
    ctx.fillStyle = 'rgba(235, 205, 165, 0.12)';
    ctx.fillRect(0, y + 3, size, 2);
    for (let x = -rowShift; x < size; x += 32) {
      ctx.fillStyle = 'rgba(18, 12, 8, 0.34)';
      ctx.fillRect(x, y + 3, 3, 15);
      ctx.fillStyle = 'rgba(240, 210, 170, 0.08)';
      ctx.fillRect(x + 3, y + 4, 2, 12);
    }
  }
  for (let i = 0; i < 900; i++) {
    const shade = 55 + Math.floor(rng() * 120);
    ctx.fillStyle = `rgba(${shade}, ${Math.floor(shade * 0.78)}, ${Math.floor(shade * 0.58)}, 0.14)`;
    ctx.fillRect(rng() * size, rng() * size, 1, 1);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1.3, 1.3);
  tex.anisotropy = 4;
  return tex;
}

export function addBuildingMaterialLighting(
  mat: THREE.MeshStandardMaterial,
  kind: BuildingMaterialKind,
): THREE.MeshStandardMaterial {
  const t = BUILDING_MATERIAL_TUNING[kind];
  const roofDetailSnippet =
    kind === 'tileRoof' ? `
        float roofCourse = 1.0 - smoothstep(0.014, 0.050, abs(fract((vBuildingLocalPos.y + 0.5) * 8.5) - 0.5));
        float roofRunBreak = 1.0 - smoothstep(0.010, 0.036, abs(fract((vBuildingLocalPos.x + 0.5) * 6.3) - 0.5));
        float tileMottle = buildingNoise(vBuildingWorldPos.xz * 1.6 + vBuildingLocalPos.xy * 5.4);
        diffuseColor.rgb *= 1.0 - roofCourse * 0.030 - roofRunBreak * 0.018;
        diffuseColor.rgb = min(diffuseColor.rgb + vec3(0.070, 0.030, 0.010) * (roofCourse + roofRunBreak * 0.35), vec3(1.0));
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.18, 0.84, 0.68), tileMottle * 0.22);
      `
    : kind === 'thatchRoof' ? `
        float thatchCourse = 1.0 - smoothstep(0.020, 0.075, abs(fract((vBuildingLocalPos.y + 0.5) * 4.2) - 0.5));
        float thatchFiber = buildingNoise(vec2(vBuildingLocalPos.x * 18.0, vBuildingLocalPos.y * 7.0)) * 2.0 - 1.0;
        diffuseColor.rgb *= 1.0 - thatchCourse * 0.012 + thatchFiber * 0.014;
        diffuseColor.rgb = min(diffuseColor.rgb + vec3(0.026, 0.024, 0.012) * thatchCourse, vec3(1.0));
      `
    : kind === 'woodRoof' ? `
        float shingleCourse = 1.0 - smoothstep(0.016, 0.050, abs(fract((vBuildingLocalPos.y + 0.5) * 6.2) - 0.5));
        float shingleBreak = 1.0 - smoothstep(0.012, 0.040, abs(fract((vBuildingLocalPos.x + 0.5) * 4.8) - 0.5));
        diffuseColor.rgb *= 1.0 - shingleCourse * 0.016 - shingleBreak * 0.008;
        diffuseColor.rgb = min(diffuseColor.rgb + vec3(0.020, 0.016, 0.012) * (shingleCourse + shingleBreak * 0.35), vec3(1.0));
      `
    : '';
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uBuildingSunDir = { value: new THREE.Vector3(0.35, 0.93, -0.05).normalize() };
    mat.userData.shader = shader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>
      varying vec3 vBuildingLocalPos;
      varying vec3 vBuildingWorldPos;
      varying vec3 vBuildingWorldNormal;`
    );
    shader.vertexShader = shader.vertexShader.replace(
      '#include <worldpos_vertex>',
      `#include <worldpos_vertex>
      vBuildingLocalPos = position;
      vBuildingWorldPos = (modelMatrix * instanceMatrix * vec4(position, 1.0)).xyz;
      vBuildingWorldNormal = normalize(mat3(modelMatrix * instanceMatrix) * normal);`
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
      uniform vec3 uBuildingSunDir;
      varying vec3 vBuildingLocalPos;
      varying vec3 vBuildingWorldPos;
      varying vec3 vBuildingWorldNormal;

      float buildingHash(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
      }

      float buildingNoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = buildingHash(i);
        float b = buildingHash(i + vec2(1.0, 0.0));
        float c = buildingHash(i + vec2(0.0, 1.0));
        float d = buildingHash(i + vec2(1.0, 1.0));
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }`
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      {
        vec2 wp = vBuildingWorldPos.xz;
        float broad = buildingNoise(wp * 0.19);
        float fine = buildingNoise(wp * 1.25 + vBuildingLocalPos.xz * 2.7);
        float grain = (broad * 0.65 + fine * 0.35) * 2.0 - 1.0;
        float lightGrain = grain * 0.5 + 0.5;
        vec3 grainLift = min(diffuseColor.rgb * (1.0 + lightGrain * ${(t.grain * 1.55).toFixed(3)}), vec3(1.0));
        diffuseColor.rgb = mix(diffuseColor.rgb, grainLift, 0.78);
        diffuseColor.rgb += (grain - 0.15) * ${Math.min(t.grain * 0.18, 0.012).toFixed(3)};

        float lowerBand = 1.0 - smoothstep(-0.46, -0.16, vBuildingLocalPos.y);
        float topBand = smoothstep(0.12, 0.50, vBuildingLocalPos.y);
        float verticalBreakup = 0.72 + fine * 0.28;
        diffuseColor.rgb *= 1.0 - lowerBand * verticalBreakup * ${t.lowerShade.toFixed(3)};
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.985, 0.92), ${t.shadeLift.toFixed(3)});
        diffuseColor.rgb = mix(
          diffuseColor.rgb,
          min(diffuseColor.rgb * vec3(${t.warmLift[0].toFixed(3)}, ${t.warmLift[1].toFixed(3)}, ${t.warmLift[2].toFixed(3)}), vec3(1.0)),
          topBand * ${t.topLift.toFixed(3)}
        );
        vec3 buildingNormal = normalize(vBuildingWorldNormal);
        vec3 buildingSunDir = normalize(uBuildingSunDir);
        float sunVisible = smoothstep(0.03, 0.25, buildingSunDir.y);
        float wrappedSun = clamp((dot(buildingNormal, buildingSunDir) + 0.34) / 1.34, 0.0, 1.0);
        float sunFacing = pow(wrappedSun, 0.85) * sunVisible;
        diffuseColor.rgb = min(diffuseColor.rgb * (1.0 + sunFacing * ${t.sunLift.toFixed(3)}), vec3(1.0));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.96, 0.86), sunFacing * ${Math.min(t.sunLift * 0.22, 0.055).toFixed(3)});
        float skyFacing = smoothstep(-0.20, 0.70, buildingNormal.y);
        float sideFacing = 1.0 - abs(buildingNormal.y);
        vec2 wallNormal = normalize(buildingNormal.xz + vec2(0.0001));
        vec2 wallSun = normalize(buildingSunDir.xz + vec2(0.0001));
        float wallSunFacing = dot(wallNormal, wallSun) * 0.5 + 0.5;
        float verticalWall = smoothstep(0.45, 0.92, sideFacing);
        float sideContrast = mix(0.98, 1.18, wallSunFacing) * sunVisible;
        diffuseColor.rgb *= mix(1.0, sideContrast, verticalWall * 0.28);
        float skyFill = (skyFacing * 0.055 + sideFacing * 0.035) * sunVisible;
        diffuseColor.rgb = mix(
          diffuseColor.rgb,
          min(diffuseColor.rgb * vec3(1.08, 1.12, 1.16), vec3(1.0)),
          skyFill
        );
        ${roofDetailSnippet}
      }`
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <roughnessmap_fragment>',
      `#include <roughnessmap_fragment>
      {
        float surfaceVar = buildingNoise(vBuildingWorldPos.xz * 0.72 + vBuildingLocalPos.xz * 3.1) - 0.5;
        float roofGlint = ${kind === 'tileRoof' ? 'pow(max(dot(normalize(vBuildingWorldNormal), normalize(uBuildingSunDir)), 0.0), 1.8) * 0.16' : '0.0'};
        roughnessFactor = clamp(roughnessFactor + surfaceVar * ${t.roughnessVariation.toFixed(3)} - roofGlint, ${kind === 'tileRoof' ? '0.38' : '0.55'}, 1.0);
      }`
    );
  };
  return mat;
}

export function ruinedColor(base: [number, number, number]): [number, number, number] {
  return lerpColor(base, [0.025, 0.022, 0.018], 0.9);
}

export function damagedColor(base: [number, number, number], fraction: number): [number, number, number] {
  return lerpColor(base, [0.32, 0.29, 0.25], 0.18 + Math.min(0.45, fraction * 0.4));
}

export function applyGroundWeathering(base: [number, number, number], part: Part): [number, number, number] {
  if (!part.buildingId || !part.shakeCenter) return base;
  if (part.mat === 'dark' || part.mat === 'litWindow') return base;

  const buildingMidY = part.shakeCenter[1];
  const normalizedHeight = THREE.MathUtils.clamp((part.pos[1] - (buildingMidY - 2.6)) / 3.2, 0, 1);
  const groundFactor = 1 - normalizedHeight;
  if (groundFactor <= 0.01) return base;

  const soilTone: [number, number, number] = part.mat === 'wood'
    ? [0.24, 0.20, 0.16]
    : part.mat === 'stone'
      ? [0.34, 0.32, 0.29]
      : [0.40, 0.33, 0.24];

  const strength = part.mat === 'straw' || part.mat === 'thatchRoof' ? 0.035 : 0.065;
  return lerpColor(base, soilTone, groundFactor * strength);
}

export function isRoofLikePart(part: Part, centerY: number) {
  return (
    part.geo === 'cone' ||
    part.geo === 'dome' ||
    part.mat === 'terracotta' ||
    part.mat === 'tileRoof' ||
    part.mat === 'thatchRoof' ||
    part.mat === 'woodRoof' ||
    (part.mat === 'straw' && part.pos[1] > centerY - 0.2)
  );
}

export function isDelicateDetailPart(part: Part, centerY: number) {
  const volume = part.scale[0] * part.scale[1] * part.scale[2];
  return part.pos[1] > centerY + 0.8 && volume < 0.65;
}

export function isWindowLikePart(part: Part, centerY: number) {
  const volume = part.scale[0] * part.scale[1] * part.scale[2];
  return (part.mat === 'dark' || part.mat === 'litWindow') && volume < 0.08 && part.scale[1] <= 0.8 && part.pos[1] > centerY - 1.2;
}

export function createBuildingGeometries() {
  function createGableRoofGeometry() {
    const vertices: number[] = [];
    const uvs: number[] = [];
    const addFace = (points: [number, number, number][], faceUvs: [number, number][]) => {
      for (let i = 1; i < points.length - 1; i++) {
        const tri = [0, i, i + 1];
        tri.forEach((idx) => {
          vertices.push(...points[idx]);
          uvs.push(...faceUvs[idx]);
        });
      }
    };

    addFace([[-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0], [-0.5, 0.5, 0]], [[0, 0], [1, 0], [1, 1], [0, 1]]);
    addFace([[0.5, -0.5, -0.5], [-0.5, -0.5, -0.5], [-0.5, 0.5, 0], [0.5, 0.5, 0]], [[0, 0], [1, 0], [1, 1], [0, 1]]);
    addFace([[-0.5, -0.5, -0.5], [-0.5, -0.5, 0.5], [-0.5, 0.5, 0]], [[0, 0], [1, 0], [0.5, 1]]);
    addFace([[0.5, -0.5, 0.5], [0.5, -0.5, -0.5], [0.5, 0.5, 0]], [[0, 0], [1, 0], [0.5, 1]]);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.computeVertexNormals();
    return geo;
  }

  function createShedRoofGeometry() {
    const vertices: number[] = [];
    const uvs: number[] = [];
    const addFace = (points: [number, number, number][], faceUvs: [number, number][]) => {
      for (let i = 1; i < points.length - 1; i++) {
        const tri = [0, i, i + 1];
        tri.forEach((idx) => {
          vertices.push(...points[idx]);
          uvs.push(...faceUvs[idx]);
        });
      }
    };

    addFace([[-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5]], [[0, 0], [1, 0], [1, 1], [0, 1]]);
    addFace([[-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5]], [[0, 0], [1, 0], [1, 1], [0, 1]]);
    addFace([[-0.5, -0.5, -0.5], [-0.5, -0.5, 0.5], [-0.5, 0.5, 0.5]], [[0, 0], [1, 0], [1, 1]]);
    addFace([[0.5, -0.5, 0.5], [0.5, -0.5, -0.5], [0.5, 0.5, 0.5]], [[0, 0], [1, 0], [0, 1]]);
    addFace([[-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, -0.5, 0.5], [-0.5, -0.5, 0.5]], [[0, 0], [1, 0], [1, 1], [0, 1]]);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.computeVertexNormals();
    return geo;
  }

  return {
    box: new THREE.BoxGeometry(1, 1, 1),
    cylinder: new THREE.CylinderGeometry(1, 1, 1, 8),
    cone: new THREE.CylinderGeometry(0, 1, 1, 4),
    roundCone: new THREE.CylinderGeometry(0, 1, 1, 18),
    gableRoof: createGableRoofGeometry(),
    shedRoof: createShedRoofGeometry(),
    sphere: new THREE.SphereGeometry(1, 16, 16),
    dome: new THREE.SphereGeometry(1, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2),
  };
}

export function createBuildingMaterials(darkMat: THREE.MeshStandardMaterial, litWindowMat: THREE.MeshStandardMaterial, overlay = false) {
  const offset = overlay
    ? { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }
    : {};
  const limewashTexture = createLimewashTexture();
  const mudTexture = createMudPlasterTexture();
  const woodTexture = createWoodSurfaceTexture();
  const stoneTexture = createStoneSurfaceTexture();
  const tileTexture = createTileRoofTexture();
  const thatchTexture = createThatchRoofTexture();
  const woodRoofTexture = createWoodRoofTexture();
  return {
    white: addBuildingMaterialLighting(new THREE.MeshStandardMaterial({ color: '#ffffff', map: limewashTexture, roughness: 0.82, ...offset }), 'white'),
    mud: addBuildingMaterialLighting(new THREE.MeshStandardMaterial({ color: '#ffffff', map: mudTexture, roughness: 1.0, ...offset }), 'mud'),
    wood: addBuildingMaterialLighting(new THREE.MeshStandardMaterial({ color: '#ffffff', map: woodTexture, roughness: 0.82, ...offset }), 'wood'),
    terracotta: addBuildingMaterialLighting(new THREE.MeshStandardMaterial({ color: '#c85a4c', roughness: 0.84, ...offset }), 'terracotta'),
    stone: addBuildingMaterialLighting(new THREE.MeshStandardMaterial({ color: '#ffffff', map: stoneTexture, roughness: 0.84, ...offset }), 'stone'),
    straw: addBuildingMaterialLighting(new THREE.MeshStandardMaterial({ color: '#d4c07b', roughness: 1.0, ...offset }), 'straw'),
    tileRoof: addBuildingMaterialLighting(new THREE.MeshStandardMaterial({ color: '#ffffff', map: tileTexture, roughness: 0.50, metalness: 0.0, ...offset }), 'tileRoof'),
    thatchRoof: addBuildingMaterialLighting(new THREE.MeshStandardMaterial({ color: '#ffffff', map: thatchTexture, roughness: 1.0, ...offset }), 'thatchRoof'),
    woodRoof: addBuildingMaterialLighting(new THREE.MeshStandardMaterial({ color: '#ffffff', map: woodRoofTexture, roughness: 0.96, ...offset }), 'woodRoof'),
    dark: darkMat,
    litWindow: litWindowMat,
  };
}
