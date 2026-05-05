export const PERFORMANCE_STATS_EVENT = 'merchant-performance-stats';

export interface PerformanceStats {
  fps: number;
  avgFrameMs: number;
  maxFrameMs: number;
  // Rolling worst-frame across last ~5s — survives the 0.5s sampler reset so
  // transient stutters stay visible long enough to read.
  peakFrameMs5s: number;
  // Count of frames > 33ms (below 30 FPS) across last ~5s.
  longFrames5s: number;
  // Ship collision loop cost: avg/peak ms per sample + hit rate in Hz.
  collisionAvgMs: number;
  collisionMaxMs: number;
  collisionChecksPerSec: number;
  // Atmosphere useMemo recompute count/cost (driven by timeOfDay re-renders).
  atmosphereRecomputesPerSec: number;
  atmosphereAvgMs: number;
  // Ship useFrame cost and sail/flag/pennant deformation cost.
  shipFrameAvgMs: number;
  shipFrameMaxMs: number;
  shipSailAvgMs: number;
  shipSailMaxMs: number;
  shipStoreSyncsPerSec: number;
  drawCalls: number;
  triangles: number;
  lines: number;
  points: number;
  geometries: number;
  textures: number;
  dpr: number;
  npcShips: number;
  projectiles: number;
  postprocessing: boolean;
  shadows: boolean;
  advancedWater: boolean;
}

// Mutable signal bag: hot paths push timings here, PerformanceSampler drains
// and resets each 0.5s tick. Gated by `enabled` so production frames don't
// pay for performance.now() in the inner loops when the overlay is off.
export const perfSignals = {
  enabled: false,
  collisionMsSum: 0,
  collisionChecks: 0,
  collisionMaxMs: 0,
  atmosphereMsSum: 0,
  atmosphereRecomputes: 0,
  shipFrameMsSum: 0,
  shipFrameFrames: 0,
  shipFrameMaxMs: 0,
  shipSailMsSum: 0,
  shipSailSamples: 0,
  shipSailMaxMs: 0,
  shipStoreSyncs: 0,
};

export function setPerfEnabled(enabled: boolean) {
  perfSignals.enabled = enabled;
  perfSignals.collisionMsSum = 0;
  perfSignals.collisionChecks = 0;
  perfSignals.collisionMaxMs = 0;
  perfSignals.atmosphereMsSum = 0;
  perfSignals.atmosphereRecomputes = 0;
  perfSignals.shipFrameMsSum = 0;
  perfSignals.shipFrameFrames = 0;
  perfSignals.shipFrameMaxMs = 0;
  perfSignals.shipSailMsSum = 0;
  perfSignals.shipSailSamples = 0;
  perfSignals.shipSailMaxMs = 0;
  perfSignals.shipStoreSyncs = 0;
}

export function reportCollisionMs(ms: number) {
  if (!perfSignals.enabled) return;
  perfSignals.collisionMsSum += ms;
  perfSignals.collisionChecks += 1;
  if (ms > perfSignals.collisionMaxMs) perfSignals.collisionMaxMs = ms;
}

export function reportAtmosphereMs(ms: number) {
  if (!perfSignals.enabled) return;
  perfSignals.atmosphereMsSum += ms;
  perfSignals.atmosphereRecomputes += 1;
}

export function reportShipFrameMs(ms: number) {
  if (!perfSignals.enabled) return;
  perfSignals.shipFrameMsSum += ms;
  perfSignals.shipFrameFrames += 1;
  if (ms > perfSignals.shipFrameMaxMs) perfSignals.shipFrameMaxMs = ms;
}

export function reportShipSailMs(ms: number) {
  if (!perfSignals.enabled) return;
  perfSignals.shipSailMsSum += ms;
  perfSignals.shipSailSamples += 1;
  if (ms > perfSignals.shipSailMaxMs) perfSignals.shipSailMaxMs = ms;
}

export function reportShipStoreSync() {
  if (!perfSignals.enabled) return;
  perfSignals.shipStoreSyncs += 1;
}

export function drainPerfSignals() {
  const out = {
    collisionMsSum: perfSignals.collisionMsSum,
    collisionChecks: perfSignals.collisionChecks,
    collisionMaxMs: perfSignals.collisionMaxMs,
    atmosphereMsSum: perfSignals.atmosphereMsSum,
    atmosphereRecomputes: perfSignals.atmosphereRecomputes,
    shipFrameMsSum: perfSignals.shipFrameMsSum,
    shipFrameFrames: perfSignals.shipFrameFrames,
    shipFrameMaxMs: perfSignals.shipFrameMaxMs,
    shipSailMsSum: perfSignals.shipSailMsSum,
    shipSailSamples: perfSignals.shipSailSamples,
    shipSailMaxMs: perfSignals.shipSailMaxMs,
    shipStoreSyncs: perfSignals.shipStoreSyncs,
  };
  perfSignals.collisionMsSum = 0;
  perfSignals.collisionChecks = 0;
  perfSignals.collisionMaxMs = 0;
  perfSignals.atmosphereMsSum = 0;
  perfSignals.atmosphereRecomputes = 0;
  perfSignals.shipFrameMsSum = 0;
  perfSignals.shipFrameFrames = 0;
  perfSignals.shipFrameMaxMs = 0;
  perfSignals.shipSailMsSum = 0;
  perfSignals.shipSailSamples = 0;
  perfSignals.shipSailMaxMs = 0;
  perfSignals.shipStoreSyncs = 0;
  return out;
}
