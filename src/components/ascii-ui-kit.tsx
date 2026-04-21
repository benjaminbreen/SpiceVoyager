import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

// ═══════════════════════════════════════════════════════════════════════════
// Shared ASCII UI primitives — color palette, helpers, reusable components
// ═══════════════════════════════════════════════════════════════════════════

// ── Color palette (matches ASCIIToast) ───────────────────────────────────

export const ASCII_COLORS = {
  gold: '#c9a84c',
  dimGold: '#8a7a4a',
  warm: '#b89a6a',
  bright: '#d8ccb0',
  txt: '#9a9080',
  dim: '#5a5445',
  rule: '#3a3528',
  ruleLight: '#4a4538',
  bg: '#0a0908',
  bgPanel: '#0c0b08',

  // Ship art
  mast: '#a08060',
  hull: '#8b6940',
  sail: '#d4c8a8',
  water: '#3a6a7a',
  waterLight: '#5a8a9a',
  foam: '#7aaaba',

  // Status
  green: '#4ade80',
  yellow: '#fbbf24',
  orange: '#fb923c',
  red: '#f87171',
  cyan: '#22d3ee',
  teal: '#2dd4bf',
  purple: '#a78bfa',

  // Tab accents
  tabOverview: '#c9a84c',   // gold
  tabShip: '#22d3ee',       // cyan
  tabCrew: '#fbbf24',       // amber
  tabCargo: '#2dd4bf',      // teal
  tabReputation: '#f87171', // warm red
} as const;

// ── Sparkle character cycling ────────────────────────────────────────────

const SPARKLE_CHARS = ['\u2726', '\u2727', '\u00b7', '\u2727', '\u2726', '\u25c7'];

export function useSparkle(intervalMs = 350) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return (phase: number) => SPARKLE_CHARS[(tick + phase) % SPARKLE_CHARS.length];
}

// ── Colored text span ────────────────────────────────────────────────────

export function C({ c, children }: { c: string; children: React.ReactNode }) {
  return <span style={{ color: c }}>{children}</span>;
}

// ── Spacing helper ───────────────────────────────────────────────────────

export function sp(n: number) { return ' '.repeat(Math.max(0, n)); }

// ── ASCII bar gauge ──────────────────────────────────────────────────────
// Renders ████░░░░ style bar with animated fill

export function ASCIIBar({
  value,
  max = 100,
  width = 20,
  color = ASCII_COLORS.gold,
  emptyColor = ASCII_COLORS.rule,
  animate = true,
}: {
  value: number;
  max?: number;
  width?: number;
  color?: string;
  emptyColor?: string;
  animate?: boolean;
}) {
  const pct = Math.min(1, Math.max(0, value / max));
  const filled = Math.round(pct * width);

  if (!animate) {
    return (
      <span>
        <span style={{ color }}>{'\u2588'.repeat(filled)}</span>
        <span style={{ color: emptyColor }}>{'\u2591'.repeat(width - filled)}</span>
      </span>
    );
  }

  return (
    <motion.span
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <span style={{ color }}>{'\u2588'.repeat(filled)}</span>
      <span style={{ color: emptyColor }}>{'\u2591'.repeat(width - filled)}</span>
    </motion.span>
  );
}

// ── Ornamental divider rule ──────────────────────────────────────────────

export function Rule({
  width = 40,
  style = 'ornate',
  color = ASCII_COLORS.rule,
  accentColor = ASCII_COLORS.dimGold,
  sparkle,
}: {
  width?: number;
  style?: 'light' | 'heavy' | 'ornate';
  color?: string;
  accentColor?: string;
  sparkle?: (phase: number) => string;
}) {
  if (style === 'light') {
    const half = Math.floor((width - 2) / 2);
    return (
      <span>
        <C c={color}>{'\u2500'.repeat(half)}</C>
        <C c={accentColor}>{' \u00b7 '}</C>
        <C c={color}>{'\u2500'.repeat(half)}</C>
      </span>
    );
  }
  if (style === 'heavy') {
    return <C c={color}>{'\u2550'.repeat(width)}</C>;
  }
  // ornate — with sparkle ornament in center
  const half = Math.floor((width - 5) / 2);
  const s = sparkle ? sparkle(0) : '\u25c7';
  return (
    <span>
      <C c={color}>{'\u2576\u2500'.padEnd(2, '\u2500')}</C>
      <C c={color}>{'\u2500'.repeat(half)}</C>
      <C c={accentColor}>{` ${s} `}</C>
      <C c={color}>{'\u2500'.repeat(half)}</C>
      <C c={color}>{'\u2500\u2574'}</C>
    </span>
  );
}

// ── Title cartouche ──────────────────────────────────────────────────────

export function Cartouche({
  title,
  subtitle,
  color = ASCII_COLORS.dimGold,
  textColor = ASCII_COLORS.gold,
  subtitleColor = ASCII_COLORS.txt,
}: {
  title: string;
  subtitle?: string;
  color?: string;
  textColor?: string;
  subtitleColor?: string;
}) {
  const innerW = Math.max(title.length + 4, subtitle ? subtitle.length + 4 : 0, 20);
  const padTitle = Math.floor((innerW - title.length) / 2);
  const padTitleR = innerW - title.length - padTitle;

  return (
    <pre className="text-[11px] leading-[1.5] whitespace-pre text-center">
      <C c={color}>{'\u256d'}{'\u2500'.repeat(innerW + 2)}{'\u256e'}</C>{'\n'}
      <C c={color}>{'\u2502'}</C>
      {sp(padTitle + 1)}
      <C c={textColor}>{title}</C>
      {sp(padTitleR + 1)}
      <C c={color}>{'\u2502'}</C>
      {subtitle && (
        <>
          {'\n'}
          <C c={color}>{'\u2502'}</C>
          {sp(Math.floor((innerW + 2 - subtitle.length) / 2))}
          <C c={subtitleColor}>{subtitle}</C>
          {sp(Math.ceil((innerW + 2 - subtitle.length) / 2))}
          <C c={color}>{'\u2502'}</C>
        </>
      )}
      {'\n'}
      <C c={color}>{'\u2570'}{'\u2500'.repeat(innerW + 2)}{'\u256f'}</C>
    </pre>
  );
}

// ── Status color helpers ─────────────────────────────────────────────────

// Semantic stat colors at full health mirror src/theme/tokens.ts `stat.*`.
// Under distress they fall through yellow → red, same as any HUD bar.
export function hullColor(pct: number) {
  if (pct > 60) return ASCII_COLORS.cyan;
  if (pct > 30) return ASCII_COLORS.yellow;
  return ASCII_COLORS.red;
}

export function moraleColor(pct: number) {
  if (pct > 60) return ASCII_COLORS.green;
  if (pct > 30) return ASCII_COLORS.yellow;
  return ASCII_COLORS.red;
}

export function cargoColor(pct: number) {
  if (pct >= 95) return ASCII_COLORS.red;
  if (pct > 70) return ASCII_COLORS.orange;
  return ASCII_COLORS.yellow; // amber — wealth in hold
}

// ── Baroque border SVG components ────────────────────────────────────────

export function BaroqueCorner({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg
      className={className}
      width="90" height="90" viewBox="0 0 90 90"
      fill="none" xmlns="http://www.w3.org/2000/svg"
      style={{ overflow: 'visible', ...style }}
    >
      {/* Outer curve */}
      <path d="M4 86 L4 22 Q4 4 22 4 L86 4" stroke="#6a5d3a" strokeWidth="1.5" fill="none" opacity="0.7" />
      {/* Inner curve */}
      <path d="M10 86 L10 26 Q10 10 26 10 L86 10" stroke="#4a4030" strokeWidth="0.75" fill="none" opacity="0.5" />
      {/* Filigree loops */}
      <path
        d="M4 22 Q4 4 22 4
           M22 4 C16 4 8 8 8 18 C8 24 12 28 18 26 C22 24 24 20 22 16 C20 12 16 12 14 14
           M4 22 C4 16 8 8 18 8 C24 8 28 12 26 18 C24 22 20 24 16 22 C12 20 12 16 14 14"
        stroke="#8a7a4a" strokeWidth="0.8" fill="none" opacity="0.55"
      />
      {/* Center rosette */}
      <path d="M20 20 C22 16 26 16 26 20 C26 24 22 24 20 20 Z" fill="#6a5d3a" opacity="0.2" />
      {/* Additional flourish */}
      <path d="M30 4 Q32 8 36 6" stroke="#6a5d3a" strokeWidth="0.5" fill="none" opacity="0.3" />
      <path d="M4 30 Q8 32 6 36" stroke="#6a5d3a" strokeWidth="0.5" fill="none" opacity="0.3" />
      {/* Dots along edges */}
      <circle cx="44" cy="4" r="1.5" fill="#6a5d3a" opacity="0.4" />
      <circle cx="60" cy="4" r="1" fill="#4a4030" opacity="0.3" />
      <circle cx="76" cy="4" r="0.8" fill="#4a4030" opacity="0.2" />
      <circle cx="4" cy="44" r="1.5" fill="#6a5d3a" opacity="0.4" />
      <circle cx="4" cy="60" r="1" fill="#4a4030" opacity="0.3" />
      <circle cx="4" cy="76" r="0.8" fill="#4a4030" opacity="0.2" />
    </svg>
  );
}

export function SideMedallion({ className }: { className?: string }) {
  return (
    <svg className={className} width="80" height="16" viewBox="0 0 80 16" fill="none">
      <path d="M0 8 C10 8 14 2 22 2 L58 2 C66 2 70 8 80 8" stroke="#6a5d3a" strokeWidth="0.75" opacity="0.4" />
      <path d="M0 8 C10 8 14 14 22 14 L58 14 C66 14 70 8 80 8" stroke="#6a5d3a" strokeWidth="0.75" opacity="0.4" />
      <circle cx="40" cy="8" r="2.5" fill="none" stroke="#6a5d3a" strokeWidth="0.75" opacity="0.35" />
      <circle cx="40" cy="8" r="1" fill="#6a5d3a" opacity="0.25" />
    </svg>
  );
}

export function SideMedallionV({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="80" viewBox="0 0 16 80" fill="none">
      <path d="M8 0 C8 10 2 14 2 22 L2 58 C2 66 8 70 8 80" stroke="#6a5d3a" strokeWidth="0.75" opacity="0.4" />
      <path d="M8 0 C8 10 14 14 14 22 L14 58 C14 66 8 70 8 80" stroke="#6a5d3a" strokeWidth="0.75" opacity="0.4" />
      <circle cx="8" cy="40" r="2.5" fill="none" stroke="#6a5d3a" strokeWidth="0.75" opacity="0.35" />
      <circle cx="8" cy="40" r="1" fill="#6a5d3a" opacity="0.25" />
    </svg>
  );
}

export function BaroqueBorder({ accentColor }: { accentColor?: string }) {
  const tint = accentColor || '#6a5d3a';
  return (
    <div className="absolute inset-0 pointer-events-none z-20" style={{ padding: '10px' }}>
      {/* Outer border */}
      <div className="absolute inset-[10px]" style={{ border: `1px solid ${tint}59` }} />
      {/* Inner border */}
      <div className="absolute inset-[16px]" style={{ border: `0.5px solid ${tint}40` }} />
      {/* Faint third rule */}
      <div className="absolute inset-[20px]" style={{ border: `0.5px solid ${tint}1a` }} />
      {/* Medallions */}
      <SideMedallion className="absolute top-[6px] left-1/2 -translate-x-1/2" />
      <SideMedallion className="absolute bottom-[6px] left-1/2 -translate-x-1/2" />
      <SideMedallionV className="absolute left-[6px] top-1/2 -translate-y-1/2" />
      <SideMedallionV className="absolute right-[6px] top-1/2 -translate-y-1/2" />
      {/* Corners */}
      <BaroqueCorner className="absolute top-0 left-0" />
      <BaroqueCorner className="absolute top-0 right-0" style={{ transform: 'scaleX(-1)' }} />
      <BaroqueCorner className="absolute bottom-0 left-0" style={{ transform: 'scaleY(-1)' }} />
      <BaroqueCorner className="absolute bottom-0 right-0" style={{ transform: 'scale(-1, -1)' }} />
    </div>
  );
}
