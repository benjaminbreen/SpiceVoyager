import { useEffect, useRef, useState } from 'react';
import {
  CanvasContext,
  drawHull,
  drawMastsAndSails,
  drawWater,
  drawCutaway,
  mapShipType,
  buildDamageFromGameState,
  type CutawayState,
  type GameShipType,
  type RenderConfig,
} from '../utils/shipRenderer';

export type ShipViewMode = 'exterior' | 'cutaway';
export type ShipViewSize = 'small' | 'large';
/**
 * Which parts of the exterior view to render.
 * - `all`   draws both water and ship (default)
 * - `water` draws only the water band (useful as a stable background layer)
 * - `ship`  draws only hull + masts + sails (useful when layered on top of a
 *            stable water layer so the ship can bob/slide without dragging
 *            the horizon with it)
 */
export type ShipViewLayer = 'all' | 'water' | 'ship';

interface ShipViewProps {
  shipType: GameShipType | string;
  hull: number;
  maxHull: number;
  sails: number;
  maxSails: number;
  wind: number; // 0-1
  /** Optional masthead pennant color (CSS). */
  flagColor?: string;
  // Cutaway-specific (ignored in exterior mode)
  cargoUsed?: number;
  cargoMax?: number;
  crewCount?: number;
  berthsMax?: number;
  powderPct?: number;
  provisions?: number;
  provisionsMax?: number;
  size?: ShipViewSize;
  view?: ShipViewMode;
  /** Which exterior layers to draw. Ignored in cutaway mode. */
  layer?: ShipViewLayer;
  /** Show the exterior/cutaway toggle button. Defaults to true for large, false for small. */
  showToggle?: boolean;
  /** Initial view when uncontrolled. */
  initialView?: ShipViewMode;
  /** If provided, component is controlled (no internal toggle). */
  onViewChange?: (v: ShipViewMode) => void;
}

// Pushed to the practical floor for legible procedural ASCII: 5px glyphs
// at ~3x the character density of the original shipwright renderer.
// Large matches the 200×80 grid the shipwright art was authored for.
const SIZE_SPECS: Record<ShipViewSize, { w: number; h: number; fontSize: number }> = {
  small: { w: 80, h: 30, fontSize: 5 },
  large: { w: 200, h: 76, fontSize: 5 },
};

export function ShipView(props: ShipViewProps) {
  const {
    shipType,
    hull,
    maxHull,
    sails,
    maxSails,
    wind,
    flagColor,
    cargoUsed = 0,
    cargoMax = 100,
    crewCount = 0,
    berthsMax = 8,
    powderPct = 0.5,
    provisions = 30,
    provisionsMax = 60,
    size = 'large',
    view,
    layer = 'all',
    showToggle = size === 'large',
    initialView = 'exterior',
    onViewChange,
  } = props;

  const spec = SIZE_SPECS[size];

  const [internalView, setInternalView] = useState<ShipViewMode>(initialView);
  const activeView = view ?? internalView;

  const hostRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const ctxRef = useRef<CanvasContext | null>(null);
  const startTimeRef = useRef(performance.now());
  const lastDrawRef = useRef(0);
  // ASCII at 5px glyphs has no detail left to resolve at 60 fps; 20 fps
  // costs ~⅓ the DOM rewrites without any perceptible smoothness loss.
  const FRAME_INTERVAL_MS = 50;

  // Pack dynamic state into refs so the rAF loop always reads fresh values
  // without restarting on every prop change.
  const stateRef = useRef({
    shipType,
    hull,
    maxHull,
    sails,
    maxSails,
    wind,
    flagColor,
    cargoUsed,
    cargoMax,
    crewCount,
    berthsMax,
    powderPct,
    provisions,
    provisionsMax,
    view: activeView,
    layer,
  });
  stateRef.current = {
    shipType,
    hull,
    maxHull,
    sails,
    maxSails,
    wind,
    flagColor,
    cargoUsed,
    cargoMax,
    crewCount,
    berthsMax,
    powderPct,
    provisions,
    provisionsMax,
    view: activeView,
    layer,
  };

  useEffect(() => {
    ctxRef.current = new CanvasContext(spec.w, spec.h);

    const tick = () => {
      const now = performance.now();
      if (now - lastDrawRef.current < FRAME_INTERVAL_MS) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      lastDrawRef.current = now;

      const ctx = ctxRef.current;
      const host = hostRef.current;
      if (!ctx || !host) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      ctx.clear();

      const t = (now - startTimeRef.current) / 1000;
      const s = stateRef.current;
      const damage = buildDamageFromGameState({
        hull: s.hull,
        maxHull: s.maxHull,
        sails: s.sails,
        maxSails: s.maxSails,
      });
      const config: RenderConfig = {
        shipType: mapShipType(s.shipType),
        damage,
        wind: Math.max(0.15, Math.min(1, s.wind)),
        width: spec.w,
        height: spec.h,
        flagColor: s.flagColor,
      };

      if (s.view === 'cutaway') {
        const cutawayState: CutawayState = {
          cargoUsed: s.cargoUsed,
          cargoMax: s.cargoMax,
          crewCount: s.crewCount,
          berthsMax: s.berthsMax,
          powderPct: s.powderPct,
          provisions: s.provisions,
          provisionsMax: s.provisionsMax,
        };
        drawCutaway(ctx, config, cutawayState, t);
      } else {
        if (s.layer === 'all' || s.layer === 'water') drawWater(ctx, config, t);
        if (s.layer === 'all' || s.layer === 'ship') {
          drawHull(ctx, config, t);
          drawMastsAndSails(ctx, config, t);
        }
      }

      host.innerHTML = ctx.toHTML();
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [spec.w, spec.h]);

  const handleToggle = () => {
    const next = activeView === 'exterior' ? 'cutaway' : 'exterior';
    if (onViewChange) onViewChange(next);
    else setInternalView(next);
  };

  // Approximate cell width for a monospace font at this size; clamps the
  // wrapper so the containing flex layout centers it instead of letting the
  // <pre> push against the right edge.
  const approxWidth = Math.ceil(spec.fontSize * 0.62 * spec.w);

  return (
    <div
      className="relative select-none mx-auto"
      style={{ width: `${approxWidth}px`, maxWidth: '100%' }}
    >
      <div
        ref={hostRef}
        style={{
          fontSize: `${spec.fontSize}px`,
          lineHeight: 1,
          fontFamily: "'JetBrains Mono', 'SF Mono', Consolas, monospace",
          fontWeight: spec.fontSize <= 5 ? 500 : 700,
          letterSpacing: 0,
        }}
      />
      {showToggle && (
        <button
          type="button"
          onClick={handleToggle}
          className="absolute top-1 right-1 text-[9px] uppercase tracking-[0.15em] px-2 py-0.5 rounded border transition-colors"
          style={{
            color: activeView === 'cutaway' ? '#FBBF24' : '#9CA3AF',
            borderColor: activeView === 'cutaway' ? '#FBBF2444' : '#9CA3AF33',
            backgroundColor: '#00000055',
            fontFamily: 'ui-sans-serif, system-ui',
          }}
        >
          {activeView === 'cutaway' ? 'Exterior' : 'Cutaway'}
        </button>
      )}
    </div>
  );
}

export default ShipView;
