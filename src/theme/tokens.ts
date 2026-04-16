// ═══════════════════════════════════════════════════════════════════════════
// Design tokens — single source of truth for UI colors & shadows.
//
// Two coordinated palettes:
//   • parchment — warm golds/crimson for modals, events, tavern (ASCII surfaces)
//   • stat      — semantic HUD colors: hull/morale/cargo/food/danger/warn
//
// Tailwind utility equivalents are also exposed as `@theme` tokens in
// src/index.css (bg-hull, text-parchment-gold, shadow-panel, …), so most
// consumers should prefer the Tailwind class. Use these hex values when an
// inline style or JS-side color is needed.
// ═══════════════════════════════════════════════════════════════════════════

export const parchment = {
  gold:    '#c9a84c',
  dimGold: '#8a7a4a',
  warm:    '#b89a6a',
  bright:  '#d8ccb0',
  txt:     '#9a9080',
  dim:     '#5a5445',
  rule:    '#3a3528',
  ruleLt:  '#4a4538',
  bg:      '#0a0908',
  bgPanel: '#0c0b08',
  crimson: '#a05050',
  teal:    '#5a9aaa',
} as const;

// Semantic HUD colors. Hull is the anchor — nautical cyan. The rest follow
// the existing "warmth spectrum": cyan (ship) → emerald (crew) → amber (wealth) → lime (food).
export const stat = {
  hull:   '#22d3ee', // cyan-400  — ship integrity
  morale: '#34d399', // emerald-400 — crew wellbeing
  cargo:  '#fbbf24', // amber-400 — wealth in hold
  food:   '#a3e635', // lime-400  — provisions
  danger: '#f87171', // red-400   — critical state
  warn:   '#fbbf24', // amber-400 — caution
} as const;

// Depth shadows — stop pasting these strings everywhere.
export const shadow = {
  panel:    '0 25px 60px rgba(0,0,0,0.7)',
  card:     '0 8px 32px rgba(0,0,0,0.4)',
  inset:    'inset 0 2px 4px rgba(0,0,0,0.5)',
  vignette: 'inset 0 0 60px rgba(0,0,0,0.4)',
  glowGold: '0 0 12px rgba(201,168,76,0.25)',
} as const;

export type Parchment = keyof typeof parchment;
export type Stat = keyof typeof stat;
