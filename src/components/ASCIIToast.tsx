import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import type { Notification } from '../store/gameStore';

// ── Type-specific accent colors ──────────────────────────────────────────────
const ACCENT = {
  success: { border: '#4a7a4a', ornament: '#6aaa6a', glow: 'rgba(90,160,90,0.12)' },
  error:   { border: '#7a4a4a', ornament: '#aa6a6a', glow: 'rgba(160,90,90,0.12)' },
  warning: { border: '#7a6a3a', ornament: '#aa9a5a', glow: 'rgba(160,140,70,0.12)' },
  info:    { border: '#4a5a6a', ornament: '#6a8a9a', glow: 'rgba(90,130,150,0.12)' },
};

const GOLD = '#c9a84c';
const DIM_GOLD = '#8a7a4a';
const TXT = '#c4b896';
const DIM = '#5a5445';
const BG = '#0c0b08';

const SPARKLE_CHARS = ['\u2726', '\u2727', '\u00b7', '\u2727', '\u2726', '\u25c7'];

function C({ c, children }: { c: string; children: React.ReactNode }) {
  return <span style={{ color: c }}>{children}</span>;
}

function sp(n: number) { return ' '.repeat(Math.max(0, n)); }

// ═══════════════════════════════════════════════════════════════════════════
// Normal-size toast
// ═══════════════════════════════════════════════════════════════════════════

function NormalToast({
  notification,
  onDismiss,
}: {
  notification: Notification;
  onDismiss: () => void;
}) {
  const accent = ACCENT[notification.type];
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 400);
    return () => clearInterval(id);
  }, []);

  const sparkle = (phase: number) => SPARKLE_CHARS[(tick + phase) % SPARKLE_CHARS.length];

  const msg = notification.message;
  const innerW = Math.max(28, msg.length + 2);

  const icon = notification.type === 'success' ? '\u2713'
    : notification.type === 'error' ? '\u2717'
    : notification.type === 'warning' ? '\u26a0'
    : '\u2022';

  return (
    <motion.div
      initial={{ opacity: 0, x: 40, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 20, scale: 0.95 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      onClick={onDismiss}
      className="pointer-events-auto cursor-pointer"
      style={{
        background: `linear-gradient(135deg, ${BG}, #100f0c)`,
        boxShadow: `0 4px 20px rgba(0,0,0,0.5), inset 0 0 30px ${accent.glow}`,
        borderRadius: '2px',
        padding: '2px',
      }}
    >
      <pre
        className="text-[10px] leading-[1.45] whitespace-pre select-none"
        style={{
          fontFamily: '"SF Mono", "Fira Code", "Cascadia Code", "Consolas", monospace',
          color: TXT,
        }}
      >
        <C c={accent.ornament}>{sparkle(0)}</C>
        <C c={accent.border}>{'\u2500\u2564'}</C>
        <C c={accent.border}>{'\u2550'.repeat(Math.floor((innerW - 8) / 2))}</C>
        <C c={accent.ornament}>{` ${sparkle(1)} `}</C>
        <C c={accent.border}>{'\u2550'.repeat(Math.ceil((innerW - 8) / 2))}</C>
        <C c={accent.border}>{'\u2564\u2500'}</C>
        <C c={accent.ornament}>{sparkle(2)}</C>{'\n'}

        <C c={accent.border}>{' \u2551'}</C>
        <C c={accent.ornament}>{` ${icon} `}</C>
        <C c={TXT}>{msg}</C>
        <C c={DIM}>{sp(innerW - 4 - msg.length)}</C>
        <C c={accent.border}>{'\u2551 '}</C>{'\n'}

        <C c={accent.ornament}>{sparkle(3)}</C>
        <C c={accent.border}>{'\u2500\u2567'}</C>
        <C c={accent.border}>{'\u2550'.repeat(Math.floor((innerW - 8) / 2))}</C>
        <C c={accent.ornament}>{` ${sparkle(4)} `}</C>
        <C c={accent.border}>{'\u2550'.repeat(Math.ceil((innerW - 8) / 2))}</C>
        <C c={accent.border}>{'\u2567\u2500'}</C>
        <C c={accent.ornament}>{sparkle(5)}</C>
      </pre>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Grand toast — for port approaches, discoveries, major events
// ═══════════════════════════════════════════════════════════════════════════

function GrandToast({
  notification,
  onDismiss,
}: {
  notification: Notification;
  onDismiss: () => void;
}) {
  const accent = ACCENT[notification.type];
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 350);
    return () => clearInterval(id);
  }, []);

  const sparkle = (phase: number) => SPARKLE_CHARS[(tick + phase) % SPARKLE_CHARS.length];

  const title = notification.message;
  const subtitle = notification.subtitle ?? '';
  const contentW = Math.max(36, title.length + 4, subtitle.length + 4);
  const IW = contentW + 4; // inner width with padding
  const halfRailL = Math.floor((IW - 10) / 2);
  const halfRailR = IW - 10 - halfRailL;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.96 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      onClick={onDismiss}
      className="pointer-events-auto cursor-pointer"
      style={{
        background: `linear-gradient(180deg, #0e0d0a, ${BG})`,
        boxShadow: `0 8px 40px rgba(0,0,0,0.6), inset 0 0 50px ${accent.glow}, 0 0 1px ${accent.border}`,
        borderRadius: '2px',
        padding: '3px',
      }}
    >
      <pre
        className="text-[11px] leading-[1.5] whitespace-pre select-none"
        style={{
          fontFamily: '"SF Mono", "Fira Code", "Cascadia Code", "Consolas", monospace',
          color: TXT,
        }}
      >
        {/* ── Floating ornaments ── */}
        <C c={DIM}>{sp(3)}{sparkle(0)}{sp(6)}{sparkle(1)}</C>
        <C c={DIM}>{sp(Math.max(1, IW - 16))}{sparkle(2)}{sp(6)}{sparkle(3)}</C>{'\n'}

        {/* ── Top border with corner medallions ── */}
        <C c={GOLD}>{sparkle(4)}</C>
        <C c={DIM_GOLD}>{'\u2500\u2550'}</C>
        <C c={DIM_GOLD}>{'\u2550'.repeat(halfRailL)}</C>
        <C c={GOLD}>{'\u2550\u2564\u2550'}</C>
        <C c={DIM_GOLD}>{'\u2550'.repeat(halfRailR)}</C>
        <C c={DIM_GOLD}>{'\u2550\u2500'}</C>
        <C c={GOLD}>{sparkle(5)}</C>{'\n'}

        {/* ── Empty ── */}
        <C c={DIM_GOLD}>{'\u2551'}</C><C c={BG}>{sp(IW + 2)}</C><C c={DIM_GOLD}>{'\u2551'}</C>{'\n'}

        {/* ── Title cartouche ── */}
        <C c={DIM_GOLD}>{'\u2551'}</C>
        <C c={BG}>{sp(2)}</C>
        <C c={accent.border}>{'\u256d'}{'\u2500'.repeat(IW - 4)}{'\u256e'}</C>
        <C c={BG}>{sp(2)}</C>
        <C c={DIM_GOLD}>{'\u2551'}</C>{'\n'}

        <C c={DIM_GOLD}>{'\u2551'}</C>
        <C c={BG}>{sp(2)}</C>
        <C c={accent.border}>{'\u2502'}</C>
        <C c={BG}>{sp(Math.floor((IW - 6 - title.length) / 2))}</C>
        <C c={GOLD}>{title}</C>
        <C c={BG}>{sp(Math.ceil((IW - 6 - title.length) / 2))}</C>
        <C c={accent.border}>{'\u2502'}</C>
        <C c={BG}>{sp(2)}</C>
        <C c={DIM_GOLD}>{'\u2551'}</C>{'\n'}

        <C c={DIM_GOLD}>{'\u2551'}</C>
        <C c={BG}>{sp(2)}</C>
        <C c={accent.border}>{'\u2570'}{'\u2500'.repeat(IW - 4)}{'\u256f'}</C>
        <C c={BG}>{sp(2)}</C>
        <C c={DIM_GOLD}>{'\u2551'}</C>{'\n'}

        {/* ── Subtitle (if present) ── */}
        {subtitle ? (
          <>
            <C c={DIM_GOLD}>{'\u2551'}</C><C c={BG}>{sp(IW + 2)}</C><C c={DIM_GOLD}>{'\u2551'}</C>{'\n'}

            {/* ornamental divider */}
            <C c={DIM_GOLD}>{'\u2551'}</C>
            <C c={BG}>{sp(4)}</C>
            <C c={accent.border}>{'\u2500 '.repeat(Math.floor((IW - 9) / 2)).slice(0, Math.floor((IW - 9) / 2))}</C>
            <C c={accent.ornament}>{` ${sparkle(0)} `}</C>
            <C c={accent.border}>{' \u2500'.repeat(Math.floor((IW - 9) / 2)).slice(0, Math.floor((IW - 9) / 2))}</C>
            <C c={BG}>{sp(Math.max(0, IW + 2 - 4 - Math.floor((IW - 9) / 2) - 3 - Math.floor((IW - 9) / 2)))}</C>
            <C c={DIM_GOLD}>{'\u2551'}</C>{'\n'}

            <C c={DIM_GOLD}>{'\u2551'}</C><C c={BG}>{sp(IW + 2)}</C><C c={DIM_GOLD}>{'\u2551'}</C>{'\n'}

            <C c={DIM_GOLD}>{'\u2551'}</C>
            <C c={BG}>{sp(Math.floor((IW + 2 - subtitle.length) / 2))}</C>
            <C c={DIM}>{subtitle}</C>
            <C c={BG}>{sp(Math.ceil((IW + 2 - subtitle.length) / 2))}</C>
            <C c={DIM_GOLD}>{'\u2551'}</C>{'\n'}
          </>
        ) : null}

        {/* ── Empty ── */}
        <C c={DIM_GOLD}>{'\u2551'}</C><C c={BG}>{sp(IW + 2)}</C><C c={DIM_GOLD}>{'\u2551'}</C>{'\n'}

        {/* ── Bottom border ── */}
        <C c={GOLD}>{sparkle(5)}</C>
        <C c={DIM_GOLD}>{'\u2500\u2550'}</C>
        <C c={DIM_GOLD}>{'\u2550'.repeat(halfRailL)}</C>
        <C c={GOLD}>{'\u2550\u2567\u2550'}</C>
        <C c={DIM_GOLD}>{'\u2550'.repeat(halfRailR)}</C>
        <C c={DIM_GOLD}>{'\u2550\u2500'}</C>
        <C c={GOLD}>{sparkle(4)}</C>{'\n'}

        {/* ── Floating ornaments below ── */}
        <C c={DIM}>{sp(3)}{sparkle(3)}{sp(6)}{sparkle(2)}</C>
        <C c={DIM}>{sp(Math.max(1, IW - 16))}{sparkle(1)}{sp(6)}{sparkle(0)}</C>
      </pre>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Public component — dispatches to normal or grand based on notification.size
// ═══════════════════════════════════════════════════════════════════════════

export function ASCIIToast({
  notification,
  onDismiss,
}: {
  notification: Notification;
  onDismiss: () => void;
}) {
  if (notification.size === 'grand') {
    return <GrandToast notification={notification} onDismiss={onDismiss} />;
  }
  return <NormalToast notification={notification} onDismiss={onDismiss} />;
}
