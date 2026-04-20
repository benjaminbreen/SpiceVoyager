export { CanvasContext, COLORS } from './shipCanvas';
export type { RenderConfig, DamageConfig, GameShipType, RendererShipType } from './shipTypes';
export { mapShipType, buildDamageFromGameState, getInterior } from './shipTypes';
export { drawHull, drawMastsAndSails, drawWater } from './shipExterior';
export { drawCutaway, type CutawayState } from './shipCutaway';
