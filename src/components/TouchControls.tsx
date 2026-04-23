import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '../store/gameStore';
import { useIsMobile } from '../utils/useIsMobile';
import { touchShipInput, touchWalkInput, resetTouchInput } from '../utils/touchInput';
import { setFireHeld } from '../utils/combatState';
import { Sailboat, Plus, Minus, Target, Swords, RotateCw } from 'lucide-react';

// First time the layout flips to mobile (real device or "Force Mobile"), pull
// the camera back so the smaller viewport isn't a claustrophobic close-up.
// Skip if the user has already dollied further out themselves.
const MOBILE_DEFAULT_ZOOM = 85;
const MOBILE_ZOOM_BUMP_THRESHOLD = 80;

// Zoom button step. Matches the wheel handler in GameScene.tsx so the feel is
// consistent across input methods.
const ZOOM_STEP_FACTOR = 0.12;  // 2× the wheel step since taps are coarser
const ZOOM_MIN = 10;
const ZOOM_MAX = 150;

// Phase 4 — touch controls. Ship mode has two steering strategies:
//   'tap'      — tap the ocean to set a target heading; sail button toggles throttle.
//   'joystick' — thumbstick replaces WASD (x=turn, y=throttle).
// Walking mode always uses the joystick.
//
// Visibility is gated by `useIsMobile` (matches the Phase 3 HUD gating), and
// can be forced on via Settings → "Force Mobile Layout".

// ═══════════════════════════════════════════════════════════════════════════
// DOM side — joystick + sail button. Mount inside <Game /> next to <UI />.
// ═══════════════════════════════════════════════════════════════════════════

export function TouchControls() {
  const { isMobile } = useIsMobile();
  const playerMode = useGameStore(s => s.playerMode);
  const steerMode = useGameStore(s => s.shipSteeringMode);
  const activePort = useGameStore(s => s.activePort);
  const combatMode = useGameStore(s => s.combatMode);
  const setTouchSailRaised = useGameStore(s => s.setTouchSailRaised);

  // Release any held input when we unmount, flip modes, or enter a port so
  // the ship doesn't stay in a committed heading after a modal opens.
  useEffect(() => {
    if (!isMobile || activePort) {
      resetTouchInput();
      setTouchSailRaised(false);
    }
    return () => {
      resetTouchInput();
      setTouchSailRaised(false);
    };
  }, [isMobile, playerMode, steerMode, activePort, setTouchSailRaised]);

  // Bump default zoom the first time we enter mobile layout. Checked against a
  // threshold so we don't undo a player's deliberate zoom-in.
  const didBumpZoom = useRef(false);
  useEffect(() => {
    if (!isMobile || didBumpZoom.current) return;
    didBumpZoom.current = true;
    const { cameraZoom, setCameraZoom } = useGameStore.getState();
    if (cameraZoom < MOBILE_ZOOM_BUMP_THRESHOLD) setCameraZoom(MOBILE_DEFAULT_ZOOM);
  }, [isMobile]);

  // Whenever combat ends, release fire in case the fire button was still held
  // when the player exited combat (e.g. they hit Stand Down mid-fire).
  useEffect(() => {
    if (!combatMode) setFireHeld(false);
  }, [combatMode]);

  if (!isMobile || activePort) return null;

  // Combat mode takes over the bottom-right cluster — hide the sail button
  // and swap in combat controls. The joystick (if active) stays visible so
  // the player can keep maneuvering while firing.
  const useJoystick = playerMode === 'walking' || steerMode === 'joystick';
  const useTapSteer = playerMode === 'ship' && steerMode === 'tap' && !combatMode;

  return (
    <div
      className="absolute pointer-events-none z-10 select-none"
      // Shrink the container by safe-area insets so absolutely-positioned
      // children (joystick, zoom, fire buttons) stay clear of the notch and
      // home indicator. Using inset instead of padding because absolute
      // children are laid out relative to the padding box, so padding
      // wouldn't actually shift them.
      style={{
        top: 'var(--sai-top)',
        right: 'var(--sai-right)',
        bottom: 'var(--sai-bottom)',
        left: 'var(--sai-left)',
      }}
    >
      {useJoystick && (
        <VirtualJoystick target={playerMode === 'walking' ? 'walk' : 'ship'} />
      )}
      {useTapSteer && <SailToggleButton />}
      {combatMode && <CombatTouchPanel playerMode={playerMode} />}
      <ZoomButtons offsetSail={useTapSteer} offsetCombat={combatMode} />
    </div>
  );
}

// ── Virtual joystick ────────────────────────────────────────────────────────

const JOY_RADIUS = 52;       // knob travel in px
const JOY_BASE = 120;        // total base diameter in px
const JOY_INSET = 24;        // distance from viewport corner

function VirtualJoystick({ target }: { target: 'walk' | 'ship' }) {
  const baseRef = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const [active, setActive] = useState(false);
  const pointerId = useRef<number | null>(null);
  const center = useRef({ x: 0, y: 0 });

  const write = (nx: number, ny: number) => {
    if (target === 'walk') {
      touchWalkInput.x = nx;
      touchWalkInput.y = ny;
    } else {
      touchShipInput.turnInput = nx;
      touchShipInput.throttleInput = ny;
    }
  };

  const recalc = (clientX: number, clientY: number) => {
    const dx = clientX - center.current.x;
    const dy = clientY - center.current.y;
    const dist = Math.hypot(dx, dy);
    const clamped = Math.min(dist, JOY_RADIUS);
    const angle = Math.atan2(dy, dx);
    const kx = clamped * Math.cos(angle);
    const ky = clamped * Math.sin(angle);
    setKnob({ x: kx, y: ky });
    // Normalise to -1..1. Screen-y is down-positive; invert so "push up" = forward.
    write(kx / JOY_RADIUS, -ky / JOY_RADIUS);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!baseRef.current) return;
    const rect = baseRef.current.getBoundingClientRect();
    center.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    pointerId.current = e.pointerId;
    baseRef.current.setPointerCapture(e.pointerId);
    setActive(true);
    recalc(e.clientX, e.clientY);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (pointerId.current !== e.pointerId) return;
    recalc(e.clientX, e.clientY);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (pointerId.current !== e.pointerId) return;
    pointerId.current = null;
    setActive(false);
    setKnob({ x: 0, y: 0 });
    write(0, 0);
  };

  return (
    <div
      ref={baseRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className="absolute rounded-full border-2 border-amber-900/60 bg-[#0a0e18]/30 backdrop-blur-sm pointer-events-auto"
      style={{
        left: JOY_INSET,
        bottom: JOY_INSET + 60, // sit above action bar (~60px tall)
        width: JOY_BASE,
        height: JOY_BASE,
        touchAction: 'none',
        opacity: active ? 0.9 : 0.55,
        transition: 'opacity 120ms',
      }}
    >
      <div
        className="absolute rounded-full bg-amber-500/80 shadow-[0_2px_8px_rgba(0,0,0,0.4)]"
        style={{
          width: 44,
          height: 44,
          left: '50%',
          top: '50%',
          transform: `translate(-50%, -50%) translate(${knob.x}px, ${knob.y}px)`,
          transition: active ? 'none' : 'transform 120ms ease-out',
        }}
      />
    </div>
  );
}

// ── Sail raise / lower button (tap-steer mode only) ─────────────────────────

function SailToggleButton() {
  // Subscribe to the store so auto-raise on ocean tap (in TouchSteerRaycaster)
  // keeps the button UI in sync with `touchShipInput.sailRaised`'s mirror.
  const raised = useGameStore(s => s.touchSailRaised);
  const setRaised = useGameStore(s => s.setTouchSailRaised);

  const onTap = () => {
    const next = !raised;
    setRaised(next);
    // Dropping sail clears the target so the ship coasts to a stop instead of
    // snapping back to heading the moment the player re-raises.
    if (!next) touchShipInput.targetHeading = null;
  };

  return (
    <button
      onPointerDown={onTap}
      className={`absolute right-6 bottom-28 w-16 h-16 rounded-full flex items-center justify-center
        pointer-events-auto border-2 backdrop-blur-md transition-all active:scale-95
        ${raised
          ? 'bg-emerald-600/20 border-emerald-400/70 text-emerald-200 shadow-[0_0_16px_rgba(52,211,153,0.3)]'
          : 'bg-[#0a0e18]/60 border-amber-900/60 text-amber-300/70'}`}
      style={{ touchAction: 'none' }}
      title={raised ? 'Drop sail' : 'Raise sail'}
    >
      <Sailboat size={24} />
      <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-[9px] font-bold tracking-wider uppercase text-amber-300/80 whitespace-nowrap">
        {raised ? 'Sail Up' : 'Sail Down'}
      </span>
    </button>
  );
}

// ── Zoom +/- buttons ────────────────────────────────────────────────────────
// Two-finger pinch-zoom is implemented on the canvas in GameScene.tsx; these
// buttons are the single-finger fallback. Stacked above the sail button so
// they don't overlap it in ship tap mode.

function ZoomButtons({ offsetSail, offsetCombat }: { offsetSail: boolean; offsetCombat: boolean }) {
  const setCameraZoom = useGameStore(s => s.setCameraZoom);

  const bump = (dir: 1 | -1) => {
    const z = useGameStore.getState().cameraZoom;
    const step = Math.max(3, z * ZOOM_STEP_FACTOR);
    setCameraZoom(Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z + dir * step)));
  };

  // Base bottom offset: clear the action bar. Shift further up when the sail
  // button or combat cluster is present so zoom out sits immediately above.
  const baseBottom = 24 + 60;
  let zoomOutBottom = baseBottom;
  if (offsetSail) zoomOutBottom = baseBottom + 96;
  else if (offsetCombat) zoomOutBottom = baseBottom + 180; // combat cluster is taller
  const zoomInBottom = zoomOutBottom + 60;

  return (
    <>
      <button
        onPointerDown={() => bump(1)}
        className="absolute w-12 h-12 rounded-full flex items-center justify-center pointer-events-auto
          border-2 border-amber-900/60 bg-[#0a0e18]/60 text-amber-300/80 backdrop-blur-md
          transition-all active:scale-95 active:bg-[#0a0e18]/80"
        style={{ right: 28, bottom: zoomInBottom, touchAction: 'none' }}
        title="Zoom in"
      >
        <Plus size={20} strokeWidth={2.5} />
      </button>
      <button
        onPointerDown={() => bump(-1)}
        className="absolute w-12 h-12 rounded-full flex items-center justify-center pointer-events-auto
          border-2 border-amber-900/60 bg-[#0a0e18]/60 text-amber-300/80 backdrop-blur-md
          transition-all active:scale-95 active:bg-[#0a0e18]/80"
        style={{ right: 28, bottom: zoomOutBottom, touchAction: 'none' }}
        title="Zoom out"
      >
        <Minus size={20} strokeWidth={2.5} />
      </button>
    </>
  );
}

// ── Combat touch panel ──────────────────────────────────────────────────────
// Shown only while combatMode is true. Layout depends on playerMode:
//   - ship    : Port broadside · Bow weapon fire · Starboard broadside · Cycle · Stand Down
//   - walking : Hunt fire · Swap weapon · Holster
// All one-shot actions dispatch the same synthetic keydown the desktop
// handlers already listen for (GameScene.tsx), so combat flow stays in one
// place. Fire is the exception: it's a held button that drives fireHeld
// directly, matching the desktop "hold left-click to auto-fire" feel.

function dispatchKey(key: string) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  window.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }));
}

function CombatTouchPanel({ playerMode }: { playerMode: 'ship' | 'walking' }) {
  const landWeapons = useGameStore(s => s.landWeapons);

  const onFireDown = () => setFireHeld(true);
  const onFireUp = () => setFireHeld(false);

  if (playerMode === 'ship') {
    return (
      <>
        {/* Primary fire — current bow weapon. Held for auto-fire like desktop LMB. */}
        <CombatButton
          bottom={112}
          right={24}
          size={72}
          label="FIRE"
          accent="red"
          onPointerDown={onFireDown}
          onPointerUp={onFireUp}
          onPointerCancel={onFireUp}
        >
          <Target size={28} strokeWidth={2.5} />
        </CombatButton>

        {/* Port broadside — left of fire */}
        <CombatButton
          bottom={130}
          right={110}
          size={52}
          label="PORT"
          accent="amber"
          onPointerDown={() => dispatchKey('q')}
        >
          <span className="font-bold text-xs">◀◀</span>
        </CombatButton>

        {/* Starboard broadside — below fire */}
        <CombatButton
          bottom={32}
          right={54}
          size={52}
          label="STBD"
          accent="amber"
          onPointerDown={() => dispatchKey('r')}
        >
          <span className="font-bold text-xs">▶▶</span>
        </CombatButton>

        <CombatButton
          bottom={198}
          right={80}
          size={44}
          label="CYCLE"
          accent="amber"
          onPointerDown={() => dispatchKey('Tab')}
        >
          <RotateCw size={18} />
        </CombatButton>

        {/* Stand down — top-right of cluster */}
        <CombatButton
          bottom={198}
          right={24}
          size={48}
          label="STAND DOWN"
          accent="slate"
          onPointerDown={() => dispatchKey('f')}
        >
          <Swords size={20} />
        </CombatButton>
      </>
    );
  }

  // Walking / hunting mode
  const canSwap = landWeapons.length > 1;
  return (
    <>
      <CombatButton
        bottom={112}
        right={24}
        size={72}
        label="FIRE"
        accent="amber"
        onPointerDown={onFireDown}
        onPointerUp={onFireUp}
        onPointerCancel={onFireUp}
      >
        <Target size={28} strokeWidth={2.5} />
      </CombatButton>

      {canSwap && (
        <CombatButton
          bottom={130}
          right={110}
          size={52}
          label="SWAP"
          accent="amber"
          onPointerDown={() => dispatchKey('Tab')}
        >
          <RotateCw size={20} />
        </CombatButton>
      )}

      <CombatButton
        bottom={198}
        right={24}
        size={48}
        label="HOLSTER"
        accent="slate"
        onPointerDown={() => dispatchKey('f')}
      >
        <Swords size={20} />
      </CombatButton>
    </>
  );
}

const COMBAT_ACCENTS: Record<'red' | 'amber' | 'slate', { border: string; bg: string; text: string; glow: string }> = {
  red: {
    border: 'border-red-400/70',
    bg: 'bg-red-900/40',
    text: 'text-red-200',
    glow: 'shadow-[0_0_18px_rgba(220,38,38,0.35)]',
  },
  amber: {
    border: 'border-amber-500/60',
    bg: 'bg-amber-900/30',
    text: 'text-amber-200',
    glow: 'shadow-[0_0_14px_rgba(217,119,6,0.25)]',
  },
  slate: {
    border: 'border-amber-900/60',
    bg: 'bg-[#0a0e18]/70',
    text: 'text-amber-300/80',
    glow: '',
  },
};

function CombatButton({
  bottom,
  right,
  size,
  label,
  accent,
  children,
  onPointerDown,
  onPointerUp,
  onPointerCancel,
}: {
  bottom: number;
  right: number;
  size: number;
  label: string;
  accent: 'red' | 'amber' | 'slate';
  children: ReactNode;
  onPointerDown?: () => void;
  onPointerUp?: () => void;
  onPointerCancel?: () => void;
}) {
  const c = COMBAT_ACCENTS[accent];
  return (
    <button
      onPointerDown={(e) => { e.stopPropagation(); onPointerDown?.(); }}
      onPointerUp={(e) => { e.stopPropagation(); onPointerUp?.(); }}
      onPointerCancel={(e) => { e.stopPropagation(); (onPointerCancel ?? onPointerUp)?.(); }}
      className={`absolute rounded-full flex items-center justify-center pointer-events-auto
        border-2 backdrop-blur-md transition-all active:scale-95
        ${c.border} ${c.bg} ${c.text} ${c.glow}`}
      style={{ right, bottom, width: size, height: size, touchAction: 'none' }}
      title={label}
    >
      {children}
      <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[8px] font-bold tracking-wider uppercase text-amber-300/80 whitespace-nowrap">
        {label}
      </span>
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// R3F side — tap-on-water raycaster. Mount inside <Canvas> in GameScene.
// ═══════════════════════════════════════════════════════════════════════════

// Reused scratch objects — avoid allocation per tap.
const _tapRaycaster = new THREE.Raycaster();
const _tapNDC = new THREE.Vector2();
const _tapPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _tapHit = new THREE.Vector3();

// A touch counts as a "tap" (commits heading) only if the finger lifts within
// this window and hasn't drifted more than TAP_MAX_PX from its origin — any
// longer or further and we treat it as a drag / pinch / accidental brush.
const TAP_MAX_MS = 300;
const TAP_MAX_PX = 10;

export function TouchSteerRaycaster() {
  const { camera, gl } = useThree();
  const isMobileRef = useRef(false);
  const forceMobile = useGameStore(s => s.forceMobileLayout);

  useFrame(() => {
    if (typeof window === 'undefined') return;
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const narrow = window.innerWidth <= 900;
    isMobileRef.current = forceMobile || (coarse && narrow);
  });

  useEffect(() => {
    const el = gl.domElement;
    // Track active pointers so we can ignore multi-touch (pinch / two-finger
    // pan gets handled by CameraController — we don't want to redirect the
    // ship in the middle of a pinch).
    const active = new Map<number, { x: number; y: number; t: number }>();

    const onDown = (e: PointerEvent) => {
      if (e.target !== el) return;
      active.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now() });
    };

    const onMove = (e: PointerEvent) => {
      const start = active.get(e.pointerId);
      if (!start) return;
      // If the finger strays beyond the tap radius, drop the tracking entry —
      // the release will no longer count as a heading commit.
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (dx * dx + dy * dy > TAP_MAX_PX * TAP_MAX_PX) {
        active.delete(e.pointerId);
      }
    };

    const onUp = (e: PointerEvent) => {
      const start = active.get(e.pointerId);
      active.delete(e.pointerId);
      if (!start) return;

      const store = useGameStore.getState();
      if (!isMobileRef.current) return;
      if (store.playerMode !== 'ship') return;
      if (store.shipSteeringMode !== 'tap') return;
      if (store.activePort || store.paused) return;
      if (store.combatMode) return;  // combat taps drive aim, not heading
      if (e.target !== el) return;

      // Reject if any other finger was also down at some point in this
      // gesture — likely a pinch or two-finger pan, not a steer tap.
      // (active.size checks only lingering pointers; we only steer if this
      // was the single pointer at release time, which is the default case.)
      if (active.size > 0) return;

      const dt = performance.now() - start.t;
      if (dt > TAP_MAX_MS) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (dx * dx + dy * dy > TAP_MAX_PX * TAP_MAX_PX) return;

      const rect = el.getBoundingClientRect();
      _tapNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      _tapNDC.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      _tapRaycaster.setFromCamera(_tapNDC, camera);
      const hit = _tapRaycaster.ray.intersectPlane(_tapPlane, _tapHit);
      if (!hit) return;

      const [px, , pz] = store.playerPos;
      const angle = Math.atan2(hit.x - px, hit.z - pz);
      touchShipInput.targetHeading = angle;
      if (!store.touchSailRaised) store.setTouchSailRaised(true);
    };

    const onCancel = (e: PointerEvent) => {
      active.delete(e.pointerId);
    };

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onCancel);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onCancel);
    };
  }, [camera, gl]);

  return null;
}
