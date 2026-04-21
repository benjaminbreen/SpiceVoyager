import { useEffect, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '../store/gameStore';
import { useIsMobile } from '../utils/useIsMobile';
import { touchShipInput, touchWalkInput, resetTouchInput } from '../utils/touchInput';
import { Sailboat } from 'lucide-react';

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

  // Release any held input when we unmount or flip modes so the ship doesn't
  // stay in a committed heading after the player opens a modal.
  useEffect(() => {
    if (!isMobile) resetTouchInput();
    return () => resetTouchInput();
  }, [isMobile, playerMode, steerMode]);

  if (!isMobile || activePort) return null;

  const useJoystick = playerMode === 'walking' || steerMode === 'joystick';
  const useTapSteer = playerMode === 'ship' && steerMode === 'tap';

  return (
    <div className="absolute inset-0 pointer-events-none z-10 select-none">
      {useJoystick && (
        <VirtualJoystick target={playerMode === 'walking' ? 'walk' : 'ship'} />
      )}
      {useTapSteer && <SailToggleButton />}
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
  const [raised, setRaised] = useState(touchShipInput.sailRaised);

  const onTap = () => {
    const next = !raised;
    touchShipInput.sailRaised = next;
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

// ═══════════════════════════════════════════════════════════════════════════
// R3F side — tap-on-water raycaster. Mount inside <Canvas> in GameScene.
// ═══════════════════════════════════════════════════════════════════════════

// Reused scratch objects — avoid allocation per tap.
const _tapRaycaster = new THREE.Raycaster();
const _tapNDC = new THREE.Vector2();
const _tapPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _tapHit = new THREE.Vector3();

export function TouchSteerRaycaster() {
  const { camera, gl } = useThree();
  const isMobileRef = useRef(false);
  // Subscribe so we recompute when the flag changes.
  const forceMobile = useGameStore(s => s.forceMobileLayout);

  useFrame(() => {
    // Re-read each frame so the handler sees the current store state.
    // Matches the useIsMobile logic (pointer-coarse + narrow viewport, or force).
    if (typeof window === 'undefined') return;
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const narrow = window.innerWidth <= 900;
    isMobileRef.current = forceMobile || (coarse && narrow);
  });

  useEffect(() => {
    const el = gl.domElement;

    const handler = (e: PointerEvent) => {
      const store = useGameStore.getState();
      if (!isMobileRef.current) return;
      if (store.playerMode !== 'ship') return;
      if (store.shipSteeringMode !== 'tap') return;
      if (store.activePort || store.paused) return;
      // Ignore taps that originated on UI — those get handled by
      // pointer-events-auto elements and don't bubble here.
      if (e.target !== el) return;

      const rect = el.getBoundingClientRect();
      _tapNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      _tapNDC.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      _tapRaycaster.setFromCamera(_tapNDC, camera);
      const hit = _tapRaycaster.ray.intersectPlane(_tapPlane, _tapHit);
      if (!hit) return;

      const [px, , pz] = store.playerPos;
      const angle = Math.atan2(hit.x - px, hit.z - pz);
      touchShipInput.targetHeading = angle;
      // A fresh heading tap implies the player wants to sail; raise the sail
      // automatically so they don't have to tap two controls per course change.
      touchShipInput.sailRaised = true;
    };

    el.addEventListener('pointerdown', handler);
    return () => el.removeEventListener('pointerdown', handler);
  }, [camera, gl]);

  return null;
}
