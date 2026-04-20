export const PERFORMANCE_STATS_EVENT = 'merchant-performance-stats';

export interface PerformanceStats {
  fps: number;
  avgFrameMs: number;
  maxFrameMs: number;
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

