import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { CrewMember, CrewRole, HealthFlag, Nationality } from '../store/gameStore';
import {
  CanvasContext,
  drawHull,
  drawMastsAndSails,
  drawWater,
  drawCutaway,
  buildCutawayPlan,
  getCutawayScene,
  mapShipType,
  buildDamageFromGameState,
  type CutawayState,
  type CutawayCompartmentBounds,
  type CutawayRenderPlan,
  type CutawayScene,
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
  crew?: CrewMember[];
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
  onCrewSelect?: (crewId: string) => void;
  cropTopRows?: number;
  cropBottomRows?: number;
  minRows?: number;
  contentOffsetPct?: number;
}

// Pushed to the practical floor for legible procedural ASCII: 5px glyphs
// at ~3x the character density of the original shipwright renderer.
// Large matches the 200×80 grid the shipwright art was authored for.
const SIZE_SPECS: Record<ShipViewSize, { w: number; h: number; fontSize: number }> = {
  small: { w: 80, h: 30, fontSize: 5 },
  large: { w: 200, h: 76, fontSize: 5 },
};

const CHAR_WIDTH_FACTOR = 0.62;

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function responsiveSpec(size: ShipViewSize, availableWidth: number | null) {
  const base = SIZE_SPECS[size];
  if (!availableWidth || availableWidth <= 0) return base;

  const charWidth = base.fontSize * CHAR_WIDTH_FACTOR;
  const maxCols = Math.floor(availableWidth / charWidth);
  if (maxCols >= base.w) return base;

  const minCols = size === 'large' ? 48 : 44;
  const w = clamp(maxCols, minCols, base.w);
  const aspect = base.h / base.w;
  const h = clamp(Math.round(w * aspect), size === 'large' ? 32 : 22, base.h);
  return { ...base, w, h };
}

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
    crew = [],
    size = 'large',
    view,
    layer = 'all',
    showToggle = size === 'large',
    initialView = 'exterior',
    onViewChange,
    onCrewSelect,
    cropTopRows = 0,
    cropBottomRows = 0,
    minRows = 20,
    contentOffsetPct = 0,
  } = props;

  const outerRef = useRef<HTMLDivElement | null>(null);
  const measureRef = useRef<HTMLSpanElement | null>(null);
  const [availableWidth, setAvailableWidth] = useState<number | null>(null);
  const spec = useMemo(() => responsiveSpec(size, availableWidth), [size, availableWidth]);
  const [measuredCharWidth, setMeasuredCharWidth] = useState(SIZE_SPECS[size].fontSize * CHAR_WIDTH_FACTOR);

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
    crew,
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
    crew,
    view: activeView,
    layer,
  };

  useEffect(() => {
    const node = outerRef.current;
    if (!node || typeof ResizeObserver === 'undefined') return;

    const update = () => setAvailableWidth(node.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const node = measureRef.current;
    if (!node) return;
    const width = node.getBoundingClientRect().width / Math.max(1, spec.w);
    if (Number.isFinite(width) && width > 0) {
      setMeasuredCharWidth((current) => Math.abs(current - width) > 0.01 ? width : current);
    }
  }, [spec.fontSize, spec.w]);

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
          renderLabels: false,
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
  const approxWidth = Math.ceil(measuredCharWidth * spec.w);
  const approxHeight = Math.ceil(spec.fontSize * spec.h);
  const cropTopPx = Math.max(0, cropTopRows) * spec.fontSize;
  const cropBottomPx = Math.max(0, cropBottomRows) * spec.fontSize;
  const visibleHeight = Math.max(spec.fontSize * minRows, approxHeight - cropTopPx - cropBottomPx);
  const contentOffsetPx = approxWidth * contentOffsetPct;
  const overlayConfig: RenderConfig = useMemo(() => ({
    shipType: mapShipType(shipType),
    damage: buildDamageFromGameState({ hull, maxHull, sails, maxSails }),
    wind: Math.max(0.15, Math.min(1, wind)),
    width: spec.w,
    height: spec.h,
    flagColor,
  }), [flagColor, hull, maxHull, sails, maxSails, shipType, spec.h, spec.w, wind]);
  const cutawayScene = useMemo(() => getCutawayScene(overlayConfig), [overlayConfig]);
  const cutawayPlan = useMemo(() => buildCutawayPlan(overlayConfig), [overlayConfig]);

  return (
    <div
      ref={outerRef}
      className="w-full select-none"
    >
      <div
        className="relative mx-auto overflow-hidden"
        style={{ width: `${approxWidth}px`, height: `${visibleHeight}px`, maxWidth: '100%' }}
      >
        <div
          className="absolute left-0"
          style={{
            top: `-${cropTopPx}px`,
            width: `${approxWidth}px`,
            height: `${approxHeight}px`,
            transform: `translateX(${contentOffsetPx}px)`,
          }}
        >
          <div
            ref={hostRef}
            style={{
              fontSize: `${spec.fontSize}px`,
              lineHeight: 1,
              fontFamily: "'JetBrains Mono', 'SF Mono', Consolas, monospace",
              fontWeight: spec.fontSize <= 5 ? 500 : 700,
              letterSpacing: 0,
              width: `${approxWidth}px`,
              overflow: 'hidden',
            }}
          />
          {activeView === 'cutaway' && (
            <CutawayLabelOverlay
              plan={cutawayPlan}
              fontSize={spec.fontSize}
              charWidth={measuredCharWidth}
              compact={spec.w < 150}
            />
          )}
          {activeView === 'cutaway' && crew.length > 0 && (
            <CrewSpriteOverlay
              crew={crew}
              scene={cutawayScene}
              compact={spec.w < 150}
              onCrewSelect={onCrewSelect}
            />
          )}
        </div>
        {showToggle && (
          <button
            type="button"
            onClick={handleToggle}
            className="absolute left-[2%] bottom-[70%] text-[13px] uppercase tracking-[0.16em] px-4 py-2 rounded-md border transition-colors z-20"
            style={{
              color: activeView === 'cutaway' ? '#FBBF24' : '#9CA3AF',
              borderColor: activeView === 'cutaway' ? '#FBBF2444' : '#9CA3AF33',
              backgroundColor: '#000000aa',
              fontFamily: 'ui-sans-serif, system-ui',
              boxShadow: '0 10px 30px rgba(0,0,0,0.45)',
            }}
          >
            {activeView === 'cutaway' ? 'Exterior' : 'Cutaway'}
          </button>
        )}
      </div>
      <span
        ref={measureRef}
        aria-hidden
        className="pointer-events-none absolute opacity-0"
        style={{
          fontSize: `${spec.fontSize}px`,
          lineHeight: 1,
          fontFamily: "'JetBrains Mono', 'SF Mono', Consolas, monospace",
          fontWeight: spec.fontSize <= 5 ? 500 : 700,
          letterSpacing: 0,
          whiteSpace: 'pre',
        }}
      >
        {'M'.repeat(spec.w)}
      </span>
    </div>
  );
}

function CutawayLabelOverlay({ plan, fontSize, charWidth, compact }: {
  plan: CutawayRenderPlan;
  fontSize: number;
  charWidth: number;
  compact: boolean;
}) {
  const labels = plan.rooms.filter(room => room.displayLabel);
  if (labels.length === 0) return null;

  const labelSize = compact
    ? clamp(fontSize * 1.45, 6.5, 9)
    : clamp(fontSize * 1.6, 7.5, 11);

  return (
    <div className="absolute inset-0 z-[9] pointer-events-none" aria-hidden>
      {labels.map((room) => {
        const text = room.displayLabel!;
        const roomWidth = Math.max(1, room.x1 - room.x0 - 4);
        const maxSizeForRoom = fontSize * (roomWidth / Math.max(1, text.length));
        const roomLabelSize = Math.max(fontSize * 1.05, Math.min(labelSize, maxSizeForRoom));
        const left = `${room.centerX * charWidth}px`;
        const top = `${room.labelY * fontSize}px`;
        const width = `${roomWidth * charWidth}px`;
        return (
          <div
            key={`${room.kind}-${room.x0}-${room.y0}`}
            className="absolute -translate-x-1/2 -translate-y-1/2 overflow-hidden whitespace-nowrap text-center uppercase"
            style={{
              left,
              top,
              width,
              color: '#D1D5DB',
              fontFamily: "'JetBrains Mono', 'SF Mono', Consolas, monospace",
              fontSize: `${roomLabelSize}px`,
              lineHeight: 1,
              fontWeight: 800,
              letterSpacing: 0,
              opacity: 0.86,
              textShadow: '0 0 8px rgba(0,0,0,0.95), 0 0 6px rgba(209,213,219,0.18)',
            }}
          >
            {text}
          </div>
        );
      })}
    </div>
  );
}

type CrewAction = 'command' | 'chart' | 'guns' | 'haul' | 'cook' | 'tend' | 'rest' | 'pump' | 'watch';

interface SpritePlacement {
  member: CrewMember;
  compartment: CutawayCompartmentBounds;
  x: number;
  y: number;
  action: CrewAction;
}

const ROLE_ACCENT: Record<CrewRole, string> = {
  Captain: '#FBBF24',
  Navigator: '#38BDF8',
  Gunner: '#F87171',
  Sailor: '#D6C7A7',
  Factor: '#6DC3B0',
  Surgeon: '#F0A6CA',
};

const HEALTH_TINT: Record<HealthFlag, string> = {
  healthy: '#FFFFFF',
  sick: '#FDE68A',
  injured: '#FCA5A5',
  scurvy: '#FDBA74',
  fevered: '#F87171',
};

const REGION_SKIN: Record<string, string[]> = {
  european: ['#E0B88F', '#D2A477', '#C48F64', '#F0C8A0'],
  indian_ocean: ['#B9784F', '#9A5F3C', '#C4875C', '#7B4A32'],
  african: ['#6B3E2A', '#4A2A1F', '#8A5638', '#2F1D18'],
  southeast_asian: ['#B8754B', '#9E6140', '#C08255', '#7A4A33'],
  east_asian: ['#D0A06F', '#BC8759', '#E0B687', '#A8744E'],
};

const NATIONALITY_VISUAL_REGION: Record<Nationality, keyof typeof REGION_SKIN> = {
  English: 'european',
  Portuguese: 'european',
  Dutch: 'european',
  Spanish: 'european',
  French: 'european',
  Danish: 'european',
  Venetian: 'european',
  Pirate: 'indian_ocean',
  Mughal: 'indian_ocean',
  Gujarati: 'indian_ocean',
  Persian: 'indian_ocean',
  Ottoman: 'indian_ocean',
  Omani: 'indian_ocean',
  Swahili: 'african',
  Khoikhoi: 'african',
  Malay: 'southeast_asian',
  Acehnese: 'southeast_asian',
  Javanese: 'southeast_asian',
  Moluccan: 'southeast_asian',
  Siamese: 'southeast_asian',
  Japanese: 'east_asian',
  Chinese: 'east_asian',
};

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pickStable<T>(items: T[], seed: string): T {
  return items[hashString(seed) % items.length];
}

function skinTone(member: CrewMember): string {
  const region = NATIONALITY_VISUAL_REGION[member.nationality] ?? 'indian_ocean';
  return pickStable(REGION_SKIN[region], `${member.id}:skin`);
}

function roleAction(member: CrewMember, scene: CutawayScene): CrewAction {
  if (member.health !== 'healthy') return 'rest';
  if (member.role === 'Captain') return 'command';
  if (member.role === 'Navigator') return 'chart';
  if (member.role === 'Gunner') return scene.compartments.some(c => c.kind === 'gunDeck') ? 'guns' : 'watch';
  if (member.role === 'Surgeon') return 'tend';
  if (member.role === 'Factor') return 'haul';
  const sailorActions: CrewAction[] = ['haul', 'cook', 'pump', 'watch'];
  return pickStable(sailorActions, `${member.id}:action`);
}

function preferredKinds(action: CrewAction): CutawayCompartmentBounds['kind'][] {
  switch (action) {
    case 'command': return ['captainCabin', 'forecastle'];
    case 'chart': return ['forecastle', 'captainCabin'];
    case 'guns': return ['gunDeck', 'powder', 'forecastle'];
    case 'haul': return ['cargoHold', 'lowerHold'];
    case 'cook': return ['galley', 'cargoHold'];
    case 'tend': return ['berths', 'captainCabin'];
    case 'rest': return ['berths', 'captainCabin'];
    case 'pump': return ['bilge', 'lowerHold'];
    case 'watch': return ['forecastle', 'captainCabin'];
  }
}

function chooseCompartment(scene: CutawayScene, member: CrewMember, action: CrewAction): CutawayCompartmentBounds {
  const preferred = preferredKinds(action);
  for (const kind of preferred) {
    const matches = scene.compartments.filter(c => c.kind === kind);
    if (matches.length > 0) return pickStable(matches, `${member.id}:${action}:${kind}`);
  }
  return scene.compartments[hashString(member.id) % Math.max(1, scene.compartments.length)];
}

function visibleCrew(crew: CrewMember[], compact: boolean): CrewMember[] {
  const roleRank: Record<CrewRole, number> = {
    Captain: 0,
    Navigator: 1,
    Surgeon: 2,
    Gunner: 3,
    Factor: 4,
    Sailor: 5,
  };
  const cap = compact ? 7 : 12;
  return [...crew]
    .sort((a, b) => {
      const roleDelta = roleRank[a.role] - roleRank[b.role];
      if (roleDelta !== 0) return roleDelta;
      if (a.health !== b.health) return a.health === 'healthy' ? 1 : -1;
      return a.name.localeCompare(b.name);
    })
    .slice(0, cap);
}

function buildPlacements(crew: CrewMember[], scene: CutawayScene, compact: boolean, tick: number): SpritePlacement[] {
  return visibleCrew(crew, compact).map((member, index) => {
    const action = roleAction(member, scene);
    const compartment = chooseCompartment(scene, member, action);
    const w = Math.max(1, compartment.x1 - compartment.x0);
    const h = Math.max(1, compartment.y1 - compartment.y0);
    const seed = hashString(`${member.id}:${action}:${index}`);
    const lane = (index % 3) - 1;
    const phase = ((seed % 1000) / 1000) * Math.PI * 2;
    const drift = Math.sin(tick / 2 + phase) * Math.min(4, w * 0.08);
    const xBias = ((seed % 53) / 52 - 0.5) * Math.max(2, w * 0.28);
    const yBias = ((((seed >>> 8) % 47) / 46) - 0.5) * Math.max(1, h * 0.22);
    const x = clamp(compartment.centerX + xBias + lane * Math.min(5, w * 0.12) + drift, compartment.x0 + 2, compartment.x1 - 2);
    const y = clamp(compartment.centerY + yBias, compartment.y0 + 2, compartment.y1 - 1);
    return { member, compartment, x, y, action };
  });
}

function actionLabel(action: CrewAction): string {
  switch (action) {
    case 'command': return 'commanding';
    case 'chart': return 'checking charts';
    case 'guns': return 'at the guns';
    case 'haul': return 'handling cargo';
    case 'cook': return 'at the galley';
    case 'tend': return 'tending the sick';
    case 'rest': return 'resting';
    case 'pump': return 'working the pump';
    case 'watch': return 'standing watch';
  }
}

function CrewSpriteOverlay({ crew, scene, compact, onCrewSelect }: {
  crew: CrewMember[];
  scene: CutawayScene;
  compact: boolean;
  onCrewSelect?: (crewId: string) => void;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick(t => t + 1), 450);
    return () => window.clearInterval(id);
  }, []);
  const placements = useMemo(() => buildPlacements(crew, scene, compact, tick), [compact, crew, scene, tick]);
  if (scene.compartments.length === 0) return null;

  return (
    <div className="absolute inset-0 z-10 pointer-events-none">
      {placements.map((placement) => {
        const { member, action, x, y } = placement;
        const active = activeId === member.id;
        const left = `${(x / scene.width) * 100}%`;
        const top = `${(y / scene.height) * 100}%`;
        const accent = ROLE_ACCENT[member.role];
        const tone = skinTone(member);
        const health = HEALTH_TINT[member.health];
        const size = compact ? 13 : 16;
        const labelStyle: CSSProperties = {
          color: '#F8E9C6',
          borderColor: `${accent}66`,
          background: 'rgba(9, 7, 4, 0.92)',
          boxShadow: `0 0 12px ${accent}22`,
          fontFamily: 'ui-sans-serif, system-ui',
        };

        return (
          <button
            key={member.id}
            type="button"
            className="absolute pointer-events-auto -translate-x-1/2 -translate-y-full group"
            style={{ left, top }}
            onMouseEnter={() => setActiveId(member.id)}
            onMouseLeave={() => setActiveId(current => current === member.id ? null : current)}
            onFocus={() => setActiveId(member.id)}
            onBlur={() => setActiveId(current => current === member.id ? null : current)}
            onClick={() => {
              if (compact && activeId !== member.id) {
                setActiveId(member.id);
                return;
              }
              setActiveId(member.id);
              onCrewSelect?.(member.id);
            }}
            aria-label={`${member.name}, ${member.role}, ${actionLabel(action)}`}
          >
            <CrewSprite
              role={member.role}
              skin={tone}
              accent={accent}
              healthTint={health}
              action={action}
              size={size}
              dim={member.health !== 'healthy'}
            />
            <div
              className={[
                'absolute left-1/2 bottom-full mb-1 -translate-x-1/2 whitespace-nowrap rounded-sm border px-2 py-1 text-left transition-opacity',
                active ? 'opacity-100' : compact ? 'opacity-0' : 'opacity-0 group-hover:opacity-100 group-focus:opacity-100',
              ].join(' ')}
              style={labelStyle}
            >
              <div className="text-[10px] font-semibold leading-tight">{member.name}</div>
              <div className="text-[9px] leading-tight" style={{ color: `${accent}` }}>
                {member.role} · {member.health === 'healthy' ? actionLabel(action) : member.health}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function CrewSprite({ role, skin, accent, healthTint, action, size, dim }: {
  role: CrewRole;
  skin: string;
  accent: string;
  healthTint: string;
  action: CrewAction;
  size: number;
  dim: boolean;
}) {
  const lean = action === 'haul' || action === 'pump' ? 1.5 : action === 'rest' ? -2 : 0;
  const opacity = dim ? 0.68 : 1;
  const tool =
    role === 'Navigator' ? 'M2 4 L6 2 L10 4'
    : role === 'Gunner' ? 'M1 8 H7'
    : role === 'Surgeon' ? 'M2 6 H6 M4 4 V8'
    : role === 'Factor' ? 'M2 4 H7 V8 H2 Z'
    : '';

  return (
    <svg
      width={size}
      height={Math.round(size * 1.45)}
      viewBox="0 0 12 18"
      aria-hidden
      style={{
        display: 'block',
        filter: `drop-shadow(0 0 4px ${accent}66)`,
        opacity,
        imageRendering: 'pixelated',
      }}
    >
      <g transform={`translate(${lean} 0)`}>
        <circle cx="6" cy="3" r="2.1" fill={skin} stroke={healthTint} strokeWidth="0.8" />
        <path d="M4.4 6.1 H7.6 L8.3 11.2 H3.7 Z" fill={accent} stroke="#1F130A" strokeWidth="0.6" />
        <path d="M4.2 7.2 L1.7 10.2" stroke={skin} strokeWidth="1.3" strokeLinecap="round" />
        <path d="M7.8 7.2 L10.3 10.2" stroke={skin} strokeWidth="1.3" strokeLinecap="round" />
        <path d="M5 11 L3.5 16" stroke={skin} strokeWidth="1.3" strokeLinecap="round" />
        <path d="M7 11 L8.5 16" stroke={skin} strokeWidth="1.3" strokeLinecap="round" />
        {role === 'Captain' && <path d="M3.2 1.3 H8.8 L7.8 0.4 H4.2 Z" fill={accent} />}
        {tool && <path d={tool} stroke="#F8E9C6" strokeWidth="0.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />}
        {action === 'cook' && <circle cx="10.3" cy="9" r="1" fill="#FB923C" />}
        {action === 'rest' && <path d="M8.8 1.2 L10.4 0.4 M9.7 2.2 L11.2 1.8" stroke="#BFDBFE" strokeWidth="0.6" />}
      </g>
    </svg>
  );
}

export default ShipView;
