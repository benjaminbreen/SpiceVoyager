import { SEA_LEVEL } from '../constants/world';
import { getTerrainData, type TerrainData } from './terrain';
import { getWaterPalette, type WaterPalette, type WaterPaletteId } from './waterPalettes';

const WORLD_HALF = 550;
const TERRAIN_RESOLUTION = 512;
const PRE_RENDER_MIN_ROWS_PER_SLICE = 1;
const PRE_RENDER_MAX_ROWS_PER_SLICE = 8;
const PRE_RENDER_IDLE_BUDGET_MS = 1.5;

type IdleDeadlineLike = {
  timeRemaining: () => number;
};

function scheduleBackgroundRender(cb: (deadline?: IdleDeadlineLike) => void) {
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(cb);
    return;
  }
  (setTimeout as typeof globalThis.setTimeout)(() => cb(), 16);
}

let _terrainCanvas: HTMLCanvasElement | null = null;
let _terrainReady = false;
let _terrainPaletteId: WaterPaletteId | null = null;
let _terrainWorldHalf = WORLD_HALF;
let _terrainRendering = false;
let _terrainRenderToken = 0;
const _readyCallbacks: Array<() => void> = [];

export function onTerrainReady(cb: () => void) {
  if (_terrainReady) { cb(); return; }
  _readyCallbacks.push(cb);
}

export function getTerrainMapCanvas() {
  return _terrainCanvas;
}

export function getTerrainMapWorldHalf() {
  return _terrainWorldHalf;
}

export function isTerrainMapReady(waterPaletteId?: WaterPaletteId) {
  return _terrainReady && _terrainCanvas !== null && (!waterPaletteId || _terrainPaletteId === waterPaletteId);
}

function preRenderTerrain(waterPalette: WaterPalette) {
  const renderToken = ++_terrainRenderToken;
  _terrainRendering = true;
  const imgData = new ImageData(TERRAIN_RESOLUTION, TERRAIN_RESOLUTION);
  const renderWorldHalf = _terrainWorldHalf;
  const unitsPerPixel = (renderWorldHalf * 2) / TERRAIN_RESOLUTION;
  let row = 0;
  const renderChunk = (deadline?: IdleDeadlineLike) => {
    if (renderToken !== _terrainRenderToken) return;

    const startedAt = performance.now();
    let rowsProcessed = 0;

    const hasBudget = () => {
      if (deadline) {
        return rowsProcessed < PRE_RENDER_MAX_ROWS_PER_SLICE && deadline.timeRemaining() > 1;
      }
      if (rowsProcessed < PRE_RENDER_MIN_ROWS_PER_SLICE) return true;
      if (rowsProcessed >= PRE_RENDER_MAX_ROWS_PER_SLICE) return false;
      return performance.now() - startedAt < PRE_RENDER_IDLE_BUDGET_MS;
    };

    while (row < TERRAIN_RESOLUTION && hasBudget()) {
      const y = row;
      for (let x = 0; x < TERRAIN_RESOLUTION; x++) {
        const worldX = -renderWorldHalf + x * unitsPerPixel;
        const worldZ = -renderWorldHalf + y * unitsPerPixel;
        const terrain = getTerrainData(worldX, worldZ);
        const idx = (y * TERRAIN_RESOLUTION + x) * 4;
        const [r, g, b] = terrainChartColor(terrain, waterPalette);

        imgData.data[idx] = r * 255;
        imgData.data[idx + 1] = g * 255;
        imgData.data[idx + 2] = b * 255;
        imgData.data[idx + 3] = 255;
      }
      row++;
      rowsProcessed++;
    }

    if (row < TERRAIN_RESOLUTION) {
      scheduleBackgroundRender(renderChunk);
    } else {
      const terrainCanvas = document.createElement('canvas');
      terrainCanvas.width = TERRAIN_RESOLUTION;
      terrainCanvas.height = TERRAIN_RESOLUTION;
      terrainCanvas.getContext('2d')!.putImageData(imgData, 0, 0);
      _terrainCanvas = terrainCanvas;
      _terrainReady = true;
      _terrainRendering = false;
      _terrainPaletteId = waterPalette.id;
      _terrainWorldHalf = renderWorldHalf;
      for (const cb of _readyCallbacks) cb();
      _readyCallbacks.length = 0;
    }
  };

  scheduleBackgroundRender(renderChunk);
}

export function startTerrainPreRender(waterPaletteId: WaterPaletteId) {
  if (_terrainReady && _terrainPaletteId === waterPaletteId) return;
  if (_terrainPaletteId !== null && _terrainPaletteId !== waterPaletteId) {
    invalidateTerrainCache();
  }
  if (_terrainRendering) return;
  preRenderTerrain(getWaterPalette(waterPaletteId));
}

export function registerTerrainMapCanvas(canvas: HTMLCanvasElement, waterPaletteId: WaterPaletteId, worldHalf: number) {
  _terrainRenderToken++;
  _terrainCanvas = canvas;
  _terrainReady = true;
  _terrainRendering = false;
  _terrainPaletteId = waterPaletteId;
  _terrainWorldHalf = worldHalf;
  for (const cb of _readyCallbacks) cb();
  _readyCallbacks.length = 0;
}

export function invalidateTerrainCache() {
  _terrainRenderToken++;
  _terrainCanvas = null;
  _terrainReady = false;
  _terrainRendering = false;
  _terrainPaletteId = null;
  _terrainWorldHalf = WORLD_HALF;
  _readyCallbacks.length = 0;
}

function tintColor(r: number, g: number, b: number): [number, number, number] {
  const warmR = r * 0.75 + 0.25 * 0.92;
  const warmG = g * 0.75 + 0.25 * 0.82;
  const warmB = b * 0.65 + 0.35 * 0.62;
  return [warmR, warmG, warmB];
}

function oceanColor(height: number, waterPalette: WaterPalette): [number, number, number] {
  const depth = Math.min(1, Math.abs(height) / 20);
  const r = waterPalette.map.shallow[0] * (1 - depth) + waterPalette.map.deep[0] * depth;
  const g = waterPalette.map.shallow[1] * (1 - depth) + waterPalette.map.deep[1] * depth;
  const b = waterPalette.map.shallow[2] * (1 - depth) + waterPalette.map.deep[2] * depth;
  return tintColor(r, g, b);
}

function mixColor(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  const blend = Math.max(0, Math.min(1, t));
  return [
    a[0] + (b[0] - a[0]) * blend,
    a[1] + (b[1] - a[1]) * blend,
    a[2] + (b[2] - a[2]) * blend,
  ];
}

function clampMapColor(color: [number, number, number], min = 0.18): [number, number, number] {
  return [
    Math.max(min, Math.min(1, color[0])),
    Math.max(min, Math.min(1, color[1])),
    Math.max(min, Math.min(1, color[2])),
  ];
}

export function terrainChartColor(terrain: TerrainData, waterPalette: WaterPalette): [number, number, number] {
  if (terrain.surfFactor > 0.6) return [0.38, 0.31, 0.20];

  if (terrain.height < SEA_LEVEL) {
    let color = oceanColor(terrain.height, waterPalette);
    const shallow = tintColor(...waterPalette.map.shallow);
    color = mixColor(color, shallow, Math.min(1, terrain.shallowFactor * 0.75 + terrain.reefFactor * 0.35));
    if (terrain.biome === 'lagoon') {
      const lagoonTint: [number, number, number] = waterPalette.id === 'monsoon'
        ? [0.16, 0.40, 0.32]
        : waterPalette.id === 'temperate'
        ? [0.24, 0.34, 0.36]
        : [0.26, 0.58, 0.52];
      color = mixColor(color, lagoonTint, 0.35);
    }
    return clampMapColor(color, 0.12);
  }

  let color: [number, number, number];
  switch (terrain.biome) {
    case 'beach':
      color = [0.86, 0.76, 0.50];
      break;
    case 'desert':
      color = [0.76, 0.63, 0.36];
      break;
    case 'scrubland':
      color = [0.58, 0.56, 0.36];
      break;
    case 'paddy':
      color = [0.40, 0.58, 0.34];
      break;
    case 'mangrove':
      color = [0.24, 0.38, 0.28];
      break;
    case 'tidal_flat':
      color = [0.47, 0.43, 0.34];
      break;
    case 'rocky_shore':
      color = [0.42, 0.38, 0.33];
      break;
    case 'swamp':
      color = [0.30, 0.43, 0.31];
      break;
    case 'forest':
      color = [0.28, 0.48, 0.29];
      break;
    case 'jungle':
      color = [0.22, 0.46, 0.24];
      break;
    case 'arroyo':
      color = [0.66, 0.45, 0.30];
      break;
    case 'snow':
      color = [0.82, 0.84, 0.82];
      break;
    case 'volcano':
      color = [0.44, 0.38, 0.34];
      break;
    case 'river':
    case 'waterfall':
      color = [0.40, 0.62, 0.72];
      break;
    case 'grassland':
    default:
      color = [0.48, 0.58, 0.34];
      break;
  }

  color = mixColor(color, [0.48, 0.42, 0.34], Math.min(0.28, terrain.slope * 0.35));
  color = mixColor(color, [0.92, 0.84, 0.58], terrain.beachFactor * 0.42);
  color = mixColor(color, [0.68, 0.58, 0.40], terrain.wetSandFactor * 0.38);

  return clampMapColor(color, 0.22);
}
