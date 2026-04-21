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

// Per-tier fixed widths keep the right edge column clean.
// BW = inner content width between the outer rail borders.
const PORT_BW   = 48;
const EVENT_BW  = 48;
const TICKER_IW = 40;

const MAX_WRAP_LINES = 3;

// Banner geometry (port tier only)
const BANNER_IMAGE_ROWS = 5;

const SPARKLE_CHARS = ['✦', '✧', '·', '✧', '✦', '◇'];
const MONO_FONT = '"SF Mono", "Fira Code", "Cascadia Code", "Consolas", monospace';

// Monospace metrics — must match the <pre> styles below.
const PRE_FONT_SIZE_PX = 11;
const PRE_LINE_HEIGHT = 1.5;

// Auto-dismiss durations by tier (ms). Legendary bumps to at least LEGENDARY_MIN.
const DURATIONS = { port: 7000, event: 6000, ticker: 3800 } as const;
const LEGENDARY_MIN = 8000;

function durationFor(n: Notification): number {
  const base = DURATIONS[n.tier];
  return n.type === 'legendary' ? Math.max(base, LEGENDARY_MIN) : base;
}

// Title color by type — legendary stays gold (it's a celebratory catch),
// warning/error tint toward the accent so they're scannable at a glance.
function titleColor(type: Notification['type']): string {
  if (type === 'warning' || type === 'error') return ACCENT[type].ornament;
  return GOLD;
}

function C({ c, children }: { c: string; children: React.ReactNode }) {
  return <span style={{ color: c }}>{children}</span>;
}

function sp(n: number) { return ' '.repeat(Math.max(0, n)); }

// Word-wrap a string into lines of max `width`. Word-boundary aware; hard-breaks
// over-long words; ellipsizes if content exceeds `maxLines`.
function wrapText(text: string, width: number, maxLines: number): string[] {
  if (!text) return [];
  if (width <= 0 || maxLines <= 0) return [];

  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';

  const pushCur = () => { if (cur.length > 0) { lines.push(cur); cur = ''; } };

  for (const w of words) {
    if (lines.length >= maxLines) break;

    if (w.length > width) {
      if (cur) { pushCur(); if (lines.length >= maxLines) break; }
      let rest = w;
      while (rest.length > width && lines.length < maxLines - 1) {
        lines.push(rest.slice(0, width));
        rest = rest.slice(width);
      }
      cur = rest;
      continue;
    }

    const candidate = cur ? cur + ' ' + w : w;
    if (candidate.length <= width) {
      cur = candidate;
    } else {
      pushCur();
      if (lines.length >= maxLines) break;
      cur = w;
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur);

  const usedChars = lines.join(' ').length;
  if (usedChars < text.replace(/\s+/g, ' ').trim().length && lines.length === maxLines) {
    const last = lines[maxLines - 1];
    const ell = '…';
    lines[maxLines - 1] = last.length + ell.length <= width
      ? last + ell
      : last.slice(0, Math.max(0, width - ell.length)) + ell;
  }

  return lines;
}

// ── Auto-dismiss with pause-on-hover and timestamp-bump restart ──────────────
// Returns hover handlers to wire to the outer motion.div. The timer is owned
// per-toast (fixes the "only the latest toast auto-dismisses" bug), resets when
// `timestamp` changes (so dedupe bumps refresh the visible duration), and
// accumulates remaining time across hover pauses.
function useAutoDismiss({
  timestamp,
  duration,
  onDismiss,
}: {
  timestamp: number;
  duration: number;
  onDismiss: () => void;
}) {
  const [paused, setPaused] = useState(false);

  // Mutable cursors.
  const remainingRef = useRef(duration);
  const resumeAtRef = useRef(Date.now());
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  // Restart fresh whenever the toast is created or its timestamp bumps.
  useEffect(() => {
    remainingRef.current = duration;
    resumeAtRef.current = Date.now();
  }, [timestamp, duration]);

  useEffect(() => {
    if (paused) {
      const elapsed = Date.now() - resumeAtRef.current;
      remainingRef.current = Math.max(0, remainingRef.current - elapsed);
      return;
    }
    resumeAtRef.current = Date.now();
    const t = window.setTimeout(() => dismissRef.current(), remainingRef.current);
    return () => clearTimeout(t);
  }, [paused, timestamp, duration]);

  return {
    onHoverStart: useCallback(() => setPaused(true), []),
    onHoverEnd: useCallback(() => setPaused(false), []),
  };
}

// ── Banner image (absolutely positioned over reserved rows in the ASCII frame)
function ToastBannerImage({
  candidates, top, left, width, height,
}: {
  candidates?: string[];
  top: string; left: string; width: string; height: string;
}) {
  const [idx, setIdx] = useState(0);
  const src = candidates?.[idx];
  if (!src) return null;

  return (
    <div
      className="select-none"
      style={{
        position: 'absolute',
        top, left, width, height,
        overflow: 'hidden',
        background: '#090806',
        pointerEvents: 'none',
        boxShadow: 'inset 0 0 22px rgba(0,0,0,0.65)',
      }}
    >
      <img
        key={src}
        src={src}
        alt=""
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          filter: 'saturate(0.72) contrast(0.96) brightness(0.74) sepia(0.08)',
        }}
        onError={() => setIdx(i => i + 1)}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          boxShadow: 'inset 0 0 24px rgba(0,0,0,0.55), inset 0 0 0 1px rgba(201,168,76,0.22)',
        }}
      />
    </div>
  );
}

// ── Ref-based sparkle (no re-renders) ────────────────────────────────────────
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
// Ticker toast — compact multi-line body with left accent bar.
// ═══════════════════════════════════════════════════════════════════════════════

function TickerToast({
  notification, onClick, onHoverStart, onHoverEnd,
}: {
  notification: Notification;
  onClick: () => void;
  onHoverStart: () => void;
  onHoverEnd: () => void;
}) {
  const accent = ACCENT[notification.type];
  // Legendary toasts sparkle faster to feel more alive.
  const sparkle = useSparkle(notification.type === 'legendary' ? 260 : 450);

  const BODY_W = TICKER_IW - 6;
  const wrapped = wrapText(notification.message, BODY_W, MAX_WRAP_LINES);
  const lines = wrapped.length > 0 ? wrapped : [''];

  const halfL = Math.floor((TICKER_IW - 3) / 2);
  const halfR = TICKER_IW - 3 - halfL;

  const icon = notification.type === 'success' ? '✓'
    : notification.type === 'error' ? '✗'
    : notification.type === 'warning' ? '⚠'
    : notification.type === 'legendary' ? '★'
    : '•';

  const glowBoost = notification.type === 'legendary' ? 42 : 24;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      onClick={onClick}
      onHoverStart={onHoverStart}
      onHoverEnd={onHoverEnd}
      className="pointer-events-auto cursor-pointer flex items-stretch"
      style={{
        background: `linear-gradient(135deg, ${BG}, #100f0c)`,
        boxShadow: `0 3px 14px rgba(0,0,0,0.45), inset 0 0 ${glowBoost}px ${accent.glow}`,
        borderRadius: '2px',
        padding: '1px',
        willChange: 'opacity, transform',
      }}
    >
      <div
        style={{
          width: '2px',
          background: accent.ornament,
          boxShadow: `0 0 ${notification.type === 'legendary' ? 10 : 6}px ${accent.ornament}`,
          marginRight: '4px',
        }}
      />
      <pre
        className="text-[10px] leading-[1.5] whitespace-pre select-none"
        style={{ fontFamily: MONO_FONT, color: TXT, margin: 0, padding: '1px 2px' }}
      >
        <C c={accent.ornament}>{sparkle(0)}</C>
        <C c={accent.border}>{'─'.repeat(halfL)}</C>
        <C c={accent.ornament}>{' '}{sparkle(1)}{' '}</C>
        <C c={accent.border}>{'─'.repeat(halfR)}</C>
        <C c={accent.ornament}>{sparkle(2)}</C>{'\n'}

        {lines.map((line, i) => (
          <span key={i}>
            <C c={accent.border}>{'│'}</C>
            {sp(2)}
            {i === 0 ? <><C c={accent.ornament}>{icon}</C>{' '}</> : sp(2)}
            <C c={TXT}>{line}</C>
            {sp(TICKER_IW - 4 - line.length)}
            <C c={accent.border}>{'│'}</C>{'\n'}
          </span>
        ))}

        <C c={accent.ornament}>{sparkle(3)}</C>
        <C c={accent.border}>{'─'.repeat(halfL)}</C>
        <C c={accent.ornament}>{' '}{sparkle(4)}{' '}</C>
        <C c={accent.border}>{'─'.repeat(halfR)}</C>
        <C c={accent.ornament}>{sparkle(5)}</C>
      </pre>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Grand frame — port (with banner image) and event tiers.
// ═══════════════════════════════════════════════════════════════════════════════

function GrandFrame({
  notification, bw, withImage, onClick, onHoverStart, onHoverEnd,
}: {
  notification: Notification;
  bw: number;
  withImage: boolean;
  onClick: () => void;
  onHoverStart: () => void;
  onHoverEnd: () => void;
}) {
  const accent = ACCENT[notification.type];
  // Legendary toasts pulse faster.
  const sparkle = useSparkle(notification.type === 'legendary' ? 240 : 350);

  const halfL = Math.floor((bw - 1) / 2);
  const halfR = bw - 1 - halfL;

  const cartInner = bw - 6;
  const titleLines = wrapText(notification.message, cartInner, MAX_WRAP_LINES);
  const renderedTitleLines = titleLines.length > 0 ? titleLines : [''];

  const subtitleLines = wrapText(notification.subtitle ?? '', bw, 2);

  const divL = Math.floor((bw - 9) / 2);
  const divR = bw - 9 - divL;

  const bannerInner = bw - 4;

  const titleCol = titleColor(notification.type);
  const isLegendary = notification.type === 'legendary';
  const glowPx = isLegendary ? 68 : 50;

  const B = (children: React.ReactNode) => (
    <span>
      <C c={DIM_GOLD}>{'║'}</C>
      {children}
      <C c={DIM_GOLD}>{'║'}</C>
      {'\n'}
    </span>
  );

  // Image overlay position (only matters when withImage).
  const FRAME_PAD = 3;
  const lineHeightEm = PRE_LINE_HEIGHT;
  const imageTop = `calc(${FRAME_PAD}px + ${3 * lineHeightEm}em)`;
  const imageLeft = `calc(${FRAME_PAD}px + 3ch)`;
  const imageWidth = `${bannerInner}ch`;
  const imageHeight = `${BANNER_IMAGE_ROWS * lineHeightEm}em`;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={
        isLegendary
          ? {
              opacity: 1,
              y: 0,
              boxShadow: [
                `0 8px 40px rgba(0,0,0,0.6), inset 0 0 ${glowPx}px ${accent.glow}, 0 0 1px ${accent.border}`,
                `0 8px 40px rgba(0,0,0,0.6), inset 0 0 ${glowPx + 18}px rgba(176,106,204,0.26), 0 0 2px ${accent.ornament}`,
                `0 8px 40px rgba(0,0,0,0.6), inset 0 0 ${glowPx}px ${accent.glow}, 0 0 1px ${accent.border}`,
              ],
            }
          : { opacity: 1, y: 0 }
      }
      exit={{ opacity: 0, y: 8 }}
      transition={
        isLegendary
          ? {
              duration: 0.4,
              ease: [0.22, 1, 0.36, 1],
              boxShadow: { duration: 2.4, repeat: Infinity, ease: 'easeInOut' },
            }
          : { duration: 0.4, ease: [0.22, 1, 0.36, 1] }
      }
      onClick={onClick}
      onHoverStart={onHoverStart}
      onHoverEnd={onHoverEnd}
      className="pointer-events-auto cursor-pointer relative"
      style={{
        background: `linear-gradient(180deg, #0e0d0a, ${BG})`,
        boxShadow: `0 8px 40px rgba(0,0,0,0.6), inset 0 0 ${glowPx}px ${accent.glow}, 0 0 1px ${accent.border}`,
        borderRadius: '2px',
        padding: `${FRAME_PAD}px`,
        willChange: 'opacity, transform',
        // Must match the <pre>'s font metrics so em/ch in the image overlay
        // resolve correctly (em = font-size; ch = width of '0' in monospace).
        fontFamily: MONO_FONT,
        fontSize: `${PRE_FONT_SIZE_PX}px`,
        lineHeight: PRE_LINE_HEIGHT,
      }}
    >
      <pre
        className="whitespace-pre select-none"
        style={{
          fontFamily: MONO_FONT,
          color: TXT,
          fontSize: `${PRE_FONT_SIZE_PX}px`,
          lineHeight: PRE_LINE_HEIGHT,
          margin: 0,
        }}
      >
        {/* top rail */}
        <C c={GOLD}>{sparkle(0)}</C>
        <C c={DIM_GOLD}>{'═'.repeat(halfL)}</C>
        <C c={GOLD}>{'╤'}</C>
        <C c={DIM_GOLD}>{'═'.repeat(halfR)}</C>
        <C c={GOLD}>{sparkle(1)}</C>{'\n'}

        {B(<>{sp(bw)}</>)}

        {withImage && (
          <>
            {B(<>{sp(1)}<C c={DIM_GOLD}>{'┌'}{'─'.repeat(bannerInner)}{'┐'}</C>{sp(1)}</>)}
            {Array.from({ length: BANNER_IMAGE_ROWS }).map((_, i) => (
              <span key={`b${i}`}>
                {B(<>{sp(1)}<C c={DIM_GOLD}>{'│'}</C>{sp(bannerInner)}<C c={DIM_GOLD}>{'│'}</C>{sp(1)}</>)}
              </span>
            ))}
            {B(<>{sp(1)}<C c={DIM_GOLD}>{'└'}{'─'.repeat(bannerInner)}{'┘'}</C>{sp(1)}</>)}
            {B(<>{sp(bw)}</>)}
          </>
        )}

        {/* cartouche top */}
        {B(
          <>
            {sp(2)}
            <C c={accent.border}>{'╭'}{'─'.repeat(cartInner)}{'╮'}</C>
            {sp(2)}
          </>
        )}

        {/* title lines */}
        {renderedTitleLines.map((ln, i) => {
          const padL = Math.floor((cartInner - ln.length) / 2);
          const padR = cartInner - ln.length - padL;
          return (
            <span key={`t${i}`}>
              {B(
                <>
                  {sp(2)}
                  <C c={accent.border}>{'│'}</C>
                  {sp(padL)}
                  <C c={titleCol}>{ln}</C>
                  {sp(padR)}
                  <C c={accent.border}>{'│'}</C>
                  {sp(2)}
                </>
              )}
            </span>
          );
        })}

        {/* cartouche bottom */}
        {B(
          <>
            {sp(2)}
            <C c={accent.border}>{'╰'}{'─'.repeat(cartInner)}{'╯'}</C>
            {sp(2)}
          </>
        )}

        {/* subtitle block */}
        {subtitleLines.length > 0 ? (
          <>
            {B(<>{sp(bw)}</>)}

            {/* Ornamental divider — legendary gets a fixed ★ center ornament. */}
            {B(
              <>
                {sp(3)}
                <C c={accent.border}>{('─ ').repeat(Math.ceil(divL / 2)).slice(0, divL)}</C>
                {isLegendary ? (
                  <C c={accent.ornament}>{' ★ '}</C>
                ) : (
                  <C c={accent.ornament}>{' '}{sparkle(2)}{' '}</C>
                )}
                <C c={accent.border}>{(' ─').repeat(Math.ceil(divR / 2)).slice(0, divR)}</C>
                {sp(3)}
              </>
            )}

            {B(<>{sp(bw)}</>)}

            {subtitleLines.map((ln, i) => {
              const padL = Math.floor((bw - ln.length) / 2);
              const padR = bw - ln.length - padL;
              return (
                <span key={`s${i}`}>
                  {B(
                    <>
                      {sp(padL)}
                      <C c={DIM}>{ln}</C>
                      {sp(padR)}
                    </>
                  )}
                </span>
              );
            })}
          </>
        ) : null}

        {B(<>{sp(bw)}</>)}

        {/* bottom rail */}
        <C c={GOLD}>{sparkle(3)}</C>
        <C c={DIM_GOLD}>{'═'.repeat(halfL)}</C>
        <C c={GOLD}>{'╧'}</C>
        <C c={DIM_GOLD}>{'═'.repeat(halfR)}</C>
        <C c={GOLD}>{sparkle(4)}</C>
      </pre>

      {withImage && (
        <ToastBannerImage
          candidates={notification.imageCandidates}
          top={imageTop}
          left={imageLeft}
          width={imageWidth}
          height={imageHeight}
        />
      )}
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Public dispatcher — owns per-toast auto-dismiss (with pause-on-hover) and
// routes to the correct tier frame.
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
  const duration = durationFor(notification);
  const hover = useAutoDismiss({
    timestamp: notification.timestamp,
    duration,
    onDismiss,
  });

  const rawClick = onClick ?? onDismiss;
  // Suppress the dismiss sfx when the click has a meaningful target (e.g. open port).
  const handleClick = () => {
    if (!onClick) sfxDismiss();
    rawClick();
  };

  if (notification.tier === 'port') {
    return (
      <GrandFrame
        notification={notification}
        bw={PORT_BW}
        withImage
        onClick={handleClick}
        onHoverStart={hover.onHoverStart}
        onHoverEnd={hover.onHoverEnd}
      />
    );
  }
  if (notification.tier === 'event') {
    return (
      <GrandFrame
        notification={notification}
        bw={EVENT_BW}
        withImage={false}
        onClick={handleClick}
        onHoverStart={hover.onHoverStart}
        onHoverEnd={hover.onHoverEnd}
      />
    );
  }
  return (
    <TickerToast
      notification={notification}
      onClick={handleClick}
      onHoverStart={hover.onHoverStart}
      onHoverEnd={hover.onHoverEnd}
    />
  );
}
