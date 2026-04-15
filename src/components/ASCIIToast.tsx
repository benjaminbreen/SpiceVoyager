import { useEffect, useRef, useCallback, useState } from 'react';
import { motion } from 'framer-motion';
import type { Notification } from '../store/gameStore';
import { sfxDismiss } from '../audio/SoundEffects';

// ── Type-specific accent colors ──────────────────────────────────────────────
const ACCENT = {
  success:   { border: '#4a7a4a', ornament: '#6aaa6a', glow: 'rgba(90,160,90,0.12)' },
  error:     { border: '#7a4a4a', ornament: '#aa6a6a', glow: 'rgba(160,90,90,0.12)' },
  warning:   { border: '#7a6a3a', ornament: '#aa9a5a', glow: 'rgba(160,140,70,0.12)' },
  info:      { border: '#4a5a6a', ornament: '#6a8a9a', glow: 'rgba(90,130,150,0.12)' },
  legendary: { border: '#7a4a8a', ornament: '#b06acc', glow: 'rgba(160,90,200,0.18)' },
};

const GOLD     = '#c9a84c';
const DIM_GOLD = '#8a7a4a';
const TXT      = '#c4b896';
const DIM      = '#5a5445';
const BG       = '#0c0b08';

const SPARKLE_CHARS = ['\u2726', '\u2727', '\u00b7', '\u2727', '\u2726', '\u25c7'];
const MONO_FONT = '"SF Mono", "Fira Code", "Cascadia Code", "Consolas", monospace';

function C({ c, children }: { c: string; children: React.ReactNode }) {
  return <span style={{ color: c }}>{children}</span>;
}

function sp(n: number) { return ' '.repeat(Math.max(0, n)); }

function ToastImageMedallion({ candidates }: { candidates?: string[] }) {
  const [idx, setIdx] = useState(0);
  const src = candidates?.[idx];

  if (!src) return null;

  return (
    <div
      className="relative h-[76px] w-[76px] shrink-0 overflow-hidden border select-none"
      style={{
        borderColor: 'rgba(201,168,76,0.42)',
        borderRadius: '50%',
        background: '#090806',
        boxShadow: 'inset 0 0 20px rgba(0,0,0,0.62), 0 0 18px rgba(201,168,76,0.16)',
      }}
    >
      <img
        key={src}
        src={src}
        alt=""
        className="h-full w-full object-cover"
        style={{ filter: 'saturate(0.78) contrast(0.95) brightness(0.72)' }}
        onError={() => setIdx(i => i + 1)}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          boxShadow: 'inset 0 0 0 2px rgba(12,11,8,0.7), inset 0 0 28px rgba(0,0,0,0.8)',
        }}
      />
    </div>
  );
}

// ── Ref-based sparkle — no re-renders ────────────────────────────────────────
function useSparkle(interval = 400) {
  const refs = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(() => {
    const id = setInterval(() => {
      const tick = Math.floor(Date.now() / interval);
      refs.current.forEach((el, i) => {
        if (el) el.textContent = SPARKLE_CHARS[(tick + i) % SPARKLE_CHARS.length];
      });
    }, interval);
    return () => clearInterval(id);
  }, [interval]);

  const sparkle = useCallback((phase: number) => (
    <span ref={el => { refs.current[phase] = el; }}>
      {SPARKLE_CHARS[phase % SPARKLE_CHARS.length]}
    </span>
  ), []);

  return sparkle;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Normal toast — compact single-line border
//
// Width system:
//   IW = inner content width between │ borders
//   Total line width = │(1) + IW + │(1) = IW + 2
//   Border line width = sparkle(1) + ─*halfL + ` · `(3) + ─*halfR + sparkle(1)
//                     = 5 + (IW - 3) = IW + 2  ✓
// ═══════════════════════════════════════════════════════════════════════════════

function NormalToast({
  notification,
  onClick,
}: {
  notification: Notification;
  onClick: () => void;
}) {
  const accent = ACCENT[notification.type];
  const sparkle = useSparkle(400);

  const msg = notification.message;
  const IW = Math.max(24, msg.length + 6);
  const halfL = Math.floor((IW - 3) / 2);
  const halfR = IW - 3 - halfL;

  const icon = notification.type === 'success' ? '\u2713'
    : notification.type === 'error' ? '\u2717'
    : notification.type === 'warning' ? '\u26a0'
    : notification.type === 'legendary' ? '\u2605'
    : '\u2022';

  return (
    <motion.div
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      onClick={onClick}
      className="pointer-events-auto cursor-pointer"
      style={{
        background: `linear-gradient(135deg, ${BG}, #100f0c)`,
        boxShadow: `0 4px 20px rgba(0,0,0,0.5), inset 0 0 30px ${accent.glow}`,
        borderRadius: '2px',
        padding: '2px',
        willChange: 'opacity, transform',
      }}
    >
      <pre
        className="text-[10px] leading-[1.5] whitespace-pre select-none"
        style={{ fontFamily: MONO_FONT, color: TXT }}
      >
        {/* Top border: sparkle + ─*halfL + ' · ' + ─*halfR + sparkle = IW+2 */}
        <C c={accent.ornament}>{sparkle(0)}</C>
        <C c={accent.border}>{'\u2500'.repeat(halfL)}</C>
        <C c={accent.ornament}>{' '}{sparkle(1)}{' '}</C>
        <C c={accent.border}>{'\u2500'.repeat(halfR)}</C>
        <C c={accent.ornament}>{sparkle(2)}</C>{'\n'}

        {/* Content: │ + body(IW) + │ = IW+2 */}
        <C c={accent.border}>{'\u2502'}</C>
        {sp(2)}<C c={accent.ornament}>{icon}</C>{' '}
        <C c={TXT}>{msg}</C>
        {sp(IW - 4 - msg.length)}
        <C c={accent.border}>{'\u2502'}</C>{'\n'}

        {/* Bottom border: same as top = IW+2 */}
        <C c={accent.ornament}>{sparkle(3)}</C>
        <C c={accent.border}>{'\u2500'.repeat(halfL)}</C>
        <C c={accent.ornament}>{' '}{sparkle(4)}{' '}</C>
        <C c={accent.border}>{'\u2500'.repeat(halfR)}</C>
        <C c={accent.ornament}>{sparkle(5)}</C>
      </pre>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Grand toast — double-line border, inner cartouche
//
// Width system:
//   BW = inner content width between ║ borders
//   Body line  = ║(1) + BW + ║(1)                       = BW + 2
//   Rail line  = sparkle(1) + ═*halfL + ╤(1) + ═*halfR + sparkle(1)
//              = 3 + (BW - 1)                            = BW + 2  ✓
// ═══════════════════════════════════════════════════════════════════════════════

function GrandToast({
  notification,
  onClick,
}: {
  notification: Notification;
  onClick: () => void;
}) {
  const accent = ACCENT[notification.type];
  const sparkle = useSparkle(350);

  const title = notification.message;
  const subtitle = notification.subtitle ?? '';
  const BW = Math.max(32, title.length + 8, subtitle ? subtitle.length + 6 : 0);

  // Rail halves: halfL + 1(╤) + halfR = BW, so halfL + halfR = BW - 1
  const halfL = Math.floor((BW - 1) / 2);
  const halfR = BW - 1 - halfL;

  // Inner cartouche: 2 margin + 1 border each side = 6, inner = BW - 6
  const cartInner = BW - 6;
  const titlePadL = Math.floor((cartInner - title.length) / 2);
  const titlePadR = cartInner - title.length - titlePadL;

  // Divider halves: 3 margin + ' · '(3) + 3 margin = 9, dashes = BW - 9
  const divL = Math.floor((BW - 9) / 2);
  const divR = BW - 9 - divL;

  // Subtitle centering
  const subPadL = Math.floor((BW - subtitle.length) / 2);
  const subPadR = BW - subtitle.length - subPadL;

  // ║-wrapped line helper — every child must be exactly BW chars
  const B = (children: React.ReactNode) => (
    <span>
      <C c={DIM_GOLD}>{'\u2551'}</C>
      {children}
      <C c={DIM_GOLD}>{'\u2551'}</C>
      {'\n'}
    </span>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      onClick={onClick}
      className="pointer-events-auto cursor-pointer flex items-center gap-3"
      style={{
        background: `linear-gradient(180deg, #0e0d0a, ${BG})`,
        boxShadow: `0 8px 40px rgba(0,0,0,0.6), inset 0 0 50px ${accent.glow}, 0 0 1px ${accent.border}`,
        borderRadius: '2px',
        padding: notification.imageCandidates?.length ? '6px 8px 6px 6px' : '3px',
        willChange: 'opacity, transform',
      }}
    >
      <ToastImageMedallion candidates={notification.imageCandidates} />
      <pre
        className="text-[11px] leading-[1.5] whitespace-pre select-none"
        style={{ fontFamily: MONO_FONT, color: TXT }}
      >
        {/* Top rail: sparkle + ═*halfL + ╤ + ═*halfR + sparkle = BW+2 */}
        <C c={GOLD}>{sparkle(0)}</C>
        <C c={DIM_GOLD}>{'\u2550'.repeat(halfL)}</C>
        <C c={GOLD}>{'\u2564'}</C>
        <C c={DIM_GOLD}>{'\u2550'.repeat(halfR)}</C>
        <C c={GOLD}>{sparkle(1)}</C>{'\n'}

        {/* Empty */}
        {B(<>{sp(BW)}</>)}

        {/* Title cartouche */}
        {B(
          <>
            {sp(2)}
            <C c={accent.border}>{'\u256d'}{'\u2500'.repeat(cartInner)}{'\u256e'}</C>
            {sp(2)}
          </>
        )}
        {B(
          <>
            {sp(2)}
            <C c={accent.border}>{'\u2502'}</C>
            {sp(titlePadL)}
            <C c={GOLD}>{title}</C>
            {sp(titlePadR)}
            <C c={accent.border}>{'\u2502'}</C>
            {sp(2)}
          </>
        )}
        {B(
          <>
            {sp(2)}
            <C c={accent.border}>{'\u2570'}{'\u2500'.repeat(cartInner)}{'\u256f'}</C>
            {sp(2)}
          </>
        )}

        {/* Subtitle section (optional) */}
        {subtitle ? (
          <>
            {B(<>{sp(BW)}</>)}

            {/* Ornamental divider */}
            {B(
              <>
                {sp(3)}
                <C c={accent.border}>{('\u2500 ').repeat(Math.ceil(divL / 2)).slice(0, divL)}</C>
                <C c={accent.ornament}>{' '}{sparkle(2)}{' '}</C>
                <C c={accent.border}>{(' \u2500').repeat(Math.ceil(divR / 2)).slice(0, divR)}</C>
                {sp(3)}
              </>
            )}

            {B(<>{sp(BW)}</>)}

            {B(
              <>
                {sp(subPadL)}
                <C c={DIM}>{subtitle}</C>
                {sp(subPadR)}
              </>
            )}
          </>
        ) : null}

        {/* Empty */}
        {B(<>{sp(BW)}</>)}

        {/* Bottom rail: sparkle + ═*halfL + ╧ + ═*halfR + sparkle = BW+2 */}
        <C c={GOLD}>{sparkle(3)}</C>
        <C c={DIM_GOLD}>{'\u2550'.repeat(halfL)}</C>
        <C c={GOLD}>{'\u2567'}</C>
        <C c={DIM_GOLD}>{'\u2550'.repeat(halfR)}</C>
        <C c={GOLD}>{sparkle(4)}</C>
      </pre>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Public component — dispatches to normal or grand based on notification.size
// ═══════════════════════════════════════════════════════════════════════════════

export function ASCIIToast({
  notification,
  onDismiss,
  onClick,
}: {
  notification: Notification;
  onDismiss: () => void;
  onClick?: () => void;
}) {
  const rawClick = onClick ?? onDismiss;
  const handleClick = () => { sfxDismiss(); rawClick(); };

  if (notification.size === 'grand') {
    return <GrandToast notification={notification} onClick={handleClick} />;
  }
  return <NormalToast notification={notification} onClick={handleClick} />;
}
