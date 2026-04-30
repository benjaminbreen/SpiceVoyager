import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore, RenderDebugSettings } from '../store/gameStore';
import {
  sfxClick, sfxTab, sfxHover, sfxClose,
  getSfxVolume, setSfxVolume,
} from '../audio/SoundEffects';
import { audioManager } from '../audio/AudioManager';
import { ambientEngine } from '../audio/AmbientEngine';
import { CORE_PORTS, WORLD_SIZE_VALUES, WorldSize } from '../utils/portArchetypes';
import { WATER_PALETTES, resolveWaterPaletteId } from '../utils/waterPalettes';
import type { WaterPaletteId, WaterPaletteSetting } from '../utils/waterPalettes';
import { CITY_FIELD_DESCRIPTIONS, CITY_FIELD_KEYS, CITY_FIELD_LABELS } from '../utils/cityFieldTypes';
import { ASCII_COLORS as CLR } from './ascii-ui-kit';

type SettingsTab = 'world' | 'display' | 'audio' | 'gameplay' | 'dev' | 'about';

const TABS: { id: SettingsTab; label: string; accent: string }[] = [
  { id: 'world',    label: 'World',    accent: CLR.gold    },
  { id: 'display',  label: 'Display',  accent: CLR.cyan    },
  { id: 'audio',    label: 'Audio',    accent: CLR.teal    },
  { id: 'gameplay', label: 'Gameplay', accent: CLR.warm    },
  { id: 'dev',      label: 'Dev',      accent: CLR.purple  },
  { id: 'about',    label: 'About',    accent: CLR.dimGold },
];

const MONO = '"SF Mono", "Fira Code", "Cascadia Code", "Consolas", monospace';
const SETTINGS_BODY_FONT = 15;
const SETTINGS_CONTROL_FONT = 13;
const SETTINGS_MICRO_FONT = 11;

const S = {
  bg:        '#0c0b09',
  panel:     '#0f0e0b',
  panelLt:   '#131210',
  border:    '#4a4438',
  borderDim: '#3a3328',
  gold:      '#c9a84c',
  dimGold:   '#a08a54',
  teal:      CLR.teal,
  tealDim:   CLR.teal + '35',
  txt:       '#c2b09a',   // main body text — readable warm gray
  bright:    '#ede0c8',   // numbers, values, emphasis
  dim:       '#8a7a6a',   // secondary / subdued
  label:     '#a89880',   // section labels
  rule:      '#3a3328',
  warm:      '#c8a870',   // CTAs, warm highlights
  crimson:   '#b06060',
} as const;

// ── Primitives ────────────────────────────────────────────────────────────────

function SectionRule({ label }: { label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, marginTop: 4 }}>
      <span style={{ color: S.gold, fontFamily: MONO, fontSize: SETTINGS_MICRO_FONT, userSelect: 'none', flexShrink: 0, opacity: 0.6 }}>▸</span>
      <span style={{
        color: S.label,
        fontFamily: MONO,
        fontSize: SETTINGS_MICRO_FONT,
        letterSpacing: '0.24em',
        textTransform: 'uppercase' as const,
        flexShrink: 0,
        userSelect: 'none' as const,
      }}>
        {label}
      </span>
      <div style={{
        flex: 1,
        height: 1,
        background: `linear-gradient(to right, ${S.border}cc, transparent)`,
      }} />
    </div>
  );
}

// Primary CTA — SET SAIL aesthetics from splash
function PrimaryBtn({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const [hov, setHov] = useState(false);
  return (
    <motion.button
      whileTap={!disabled ? { scale: 0.975 } : undefined}
      onClick={() => { if (!disabled) { sfxClick(); onClick(); } }}
      onMouseEnter={() => { if (!disabled) { sfxHover(); setHov(true); } }}
      onMouseLeave={() => setHov(false)}
      disabled={disabled}
      style={{
        width: '100%',
        padding: '11px 18px',
        fontFamily: MONO,
        fontSize: SETTINGS_CONTROL_FONT,
        letterSpacing: '0.26em',
        textTransform: 'uppercase' as const,
        color: disabled ? S.dim : (hov ? S.bright : S.warm),
        backgroundColor: disabled ? 'transparent' : 'rgba(16,14,26,0.9)',
        border: `1px solid ${disabled ? S.rule : (hov ? S.gold : S.dimGold)}`,
        borderRadius: 3,
        boxShadow: disabled ? 'none' : hov
          ? `0 0 0 1px ${S.dimGold}40 inset, 0 0 24px ${S.gold}28, 0 2px 8px rgba(0,0,0,0.5)`
          : `0 0 0 1px ${S.dimGold}18 inset, 0 0 10px ${S.gold}18, 0 2px 6px rgba(0,0,0,0.4)`,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'all 0.18s ease',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        opacity: disabled ? 0.35 : 1,
      }}
    >
      {!disabled && (
        <motion.span
          animate={hov ? { opacity: [1, 0.4, 1] } : { opacity: 0.7 }}
          transition={{ duration: 0.85, repeat: hov ? Infinity : 0, ease: 'easeInOut' }}
          style={{ color: S.gold, fontSize: 12, lineHeight: 1, display: 'inline-block' }}
        >◆</motion.span>
      )}
      {children}
    </motion.button>
  );
}

// Secondary ghost button — splash "about"/"settings" style
function SecBtn({
  onClick,
  children,
  active,
  danger,
  narrow,
}: {
  onClick: () => void;
  children: React.ReactNode;
  active?: boolean;
  danger?: boolean;
  narrow?: boolean;
}) {
  const [hov, setHov] = useState(false);
  const borderColor = danger
    ? (hov ? `${S.crimson}aa` : `${S.crimson}55`)
    : active ? `${S.gold}70`
    : hov ? `${S.dimGold}88` : S.border;
  const textColor = danger
    ? (hov ? S.crimson : `${S.crimson}99`)
    : active ? S.warm
    : hov ? S.txt : S.dim;

  return (
    <button
      onClick={() => { sfxClick(); onClick(); }}
      onMouseEnter={() => { sfxHover(); setHov(true); }}
      onMouseLeave={() => setHov(false)}
      style={{
        padding: narrow ? '7px 12px' : '9px 15px',
        fontFamily: MONO,
        fontSize: SETTINGS_CONTROL_FONT,
        letterSpacing: '0.16em',
        textTransform: 'uppercase' as const,
        color: textColor,
        backgroundColor: active ? `${S.gold}0c` : 'transparent',
        border: `1px solid ${borderColor}`,
        borderRadius: 3,
        cursor: 'pointer',
        transition: 'color 0.14s ease, border-color 0.14s ease, background-color 0.14s ease',
        whiteSpace: 'nowrap' as const,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
      }}
    >
      {children}
    </button>
  );
}

// Teal/dim toggle
function Toggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <motion.button
      onClick={() => { sfxClick(); onChange(!value); }}
      onMouseEnter={() => sfxHover()}
      animate={{
        color: value ? S.teal : S.dim,
        borderColor: value ? S.tealDim : S.rule,
        backgroundColor: value ? `${S.teal}0e` : 'rgba(0,0,0,0)',
      }}
      transition={{ duration: 0.16 }}
      style={{
        padding: '7px 16px',
        fontFamily: MONO,
        fontSize: SETTINGS_CONTROL_FONT,
        letterSpacing: '0.18em',
        textTransform: 'uppercase' as const,
        border: `1px solid ${value ? S.tealDim : S.rule}`,
        borderRadius: 3,
        cursor: 'pointer',
        minWidth: 58,
        textAlign: 'center' as const,
      }}
    >
      {value ? 'on' : 'off'}
    </motion.button>
  );
}

// Control row: label + description left, control right
function CtrlRow({
  label,
  desc,
  last,
  children,
}: {
  label: string;
  desc?: string;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div style={{
      display: 'flex',
      alignItems: desc ? 'flex-start' : 'center',
      justifyContent: 'space-between',
      gap: 16,
      padding: '11px 0',
      borderBottom: last ? 'none' : `1px solid ${S.borderDim}`,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: MONO, fontSize: SETTINGS_BODY_FONT, color: S.txt, letterSpacing: '0.04em' }}>{label}</div>
        {desc && (
          <div style={{ fontFamily: MONO, fontSize: SETTINGS_CONTROL_FONT, color: S.dim, marginTop: 4, lineHeight: 1.6, maxWidth: 330 }}>
            {desc}
          </div>
        )}
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  );
}

// Segmented two-option toggle (Chart / Classic etc.)
function SegControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div style={{
      display: 'flex',
      border: `1px solid ${S.border}`,
      borderRadius: 3,
      overflow: 'hidden',
    }}>
      {options.map((opt, i) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            onClick={() => { sfxClick(); onChange(opt.value); }}
            onMouseEnter={() => { if (!active) sfxHover(); }}
            style={{
              padding: '7px 14px',
              fontFamily: MONO,
              fontSize: SETTINGS_CONTROL_FONT,
              letterSpacing: '0.14em',
              textTransform: 'uppercase' as const,
              color: active ? S.warm : S.dim,
              backgroundColor: active ? `${S.gold}0e` : 'transparent',
              borderLeft: i > 0 ? `1px solid ${S.border}` : 'none',
              cursor: 'pointer',
              transition: 'all 0.13s ease',
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// Volume slider with round gold thumb
function VolSlider({
  label,
  desc,
  value,
  onChange,
  onAfterChange,
  last,
}: {
  label: string;
  desc: string;
  value: number;
  onChange: (v: number) => void;
  onAfterChange?: () => void;
  last?: boolean;
}) {
  const pct = Math.round(value * 100);
  const [hov, setHov] = useState(false);
  const atMax = pct >= 100;

  return (
    <div style={{ padding: '14px 0', borderBottom: last ? 'none' : `1px solid ${S.borderDim}` }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{
          fontFamily: MONO,
          fontSize: SETTINGS_CONTROL_FONT,
          letterSpacing: '0.18em',
          textTransform: 'uppercase' as const,
          color: hov ? S.txt : S.label,
          transition: 'color 0.15s ease',
        }}>
          {label}
        </span>
        <motion.span
          animate={{ color: atMax ? S.gold : S.warm }}
          transition={{ duration: 0.2 }}
          style={{ fontFamily: MONO, fontSize: 14, fontVariantNumeric: 'tabular-nums' }}
        >
          {String(pct).padStart(3, '0')}
        </motion.span>
      </div>
      <div
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
      >
        <input
          type="range"
          min={0}
          max={100}
          value={pct}
          onChange={e => onChange(Number(e.target.value) / 100)}
          onMouseUp={onAfterChange}
          onTouchEnd={onAfterChange}
          className={[
            'w-full cursor-pointer appearance-none',
            '[&::-webkit-slider-thumb]:appearance-none',
            '[&::-webkit-slider-thumb]:w-[15px]',
            '[&::-webkit-slider-thumb]:h-[15px]',
            '[&::-webkit-slider-thumb]:rounded-full',
            '[&::-webkit-slider-thumb]:bg-[#c9a84c]',
            '[&::-webkit-slider-thumb]:shadow-[0_0_6px_rgba(201,168,76,0.45)]',
            '[&::-webkit-slider-thumb]:border',
            '[&::-webkit-slider-thumb]:border-[#8a7a4a]',
            '[&::-webkit-slider-thumb]:transition-[transform,box-shadow]',
            '[&::-webkit-slider-thumb]:duration-150',
            '[&::-webkit-slider-thumb]:hover:scale-110',
            '[&::-webkit-slider-thumb]:hover:shadow-[0_0_10px_rgba(201,168,76,0.7)]',
            '[&::-moz-range-thumb]:w-[15px]',
            '[&::-moz-range-thumb]:h-[15px]',
            '[&::-moz-range-thumb]:rounded-full',
            '[&::-moz-range-thumb]:bg-[#c9a84c]',
            '[&::-moz-range-thumb]:border',
            '[&::-moz-range-thumb]:border-[#8a7a4a]',
            '[&::-moz-range-thumb]:shadow-[0_0_6px_rgba(201,168,76,0.45)]',
          ].join(' ')}
          style={{
            height: 4,
            background: `linear-gradient(to right, ${hov ? S.gold : S.warm} ${pct}%, ${S.border} ${pct}%)`,
            borderRadius: 2,
            outline: 'none',
            transition: 'background 0.15s ease',
          }}
        />
      </div>
      <div style={{ fontFamily: MONO, fontSize: SETTINGS_CONTROL_FONT, color: S.dim, marginTop: 8, lineHeight: 1.6 }}>
        {desc}
      </div>
    </div>
  );
}

// Palette option card (sea palette)
function PaletteCard({
  label,
  description,
  active,
  onClick,
}: {
  label: string;
  description: string;
  active: boolean;
  onClick: () => void;
}) {
  const [hov, setHov] = useState(false);
  return (
    <motion.button
      onClick={() => { sfxClick(); onClick(); }}
      onMouseEnter={() => { sfxHover(); setHov(true); }}
      onMouseLeave={() => setHov(false)}
      animate={{
        borderColor: active ? `${S.gold}60` : hov ? `${S.dimGold}44` : S.border,
        backgroundColor: active ? `${S.gold}09` : hov ? 'rgba(255,255,255,0.015)' : 'rgba(0,0,0,0)',
        boxShadow: active ? `0 0 14px ${S.gold}14` : '0 0 0 transparent',
      }}
      transition={{ duration: 0.15 }}
      style={{
        padding: '10px 12px',
        border: `1px solid ${S.border}`,
        borderRadius: 3,
        textAlign: 'left' as const,
        cursor: 'pointer',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <motion.span
          animate={{ color: active ? S.gold : S.dim }}
          transition={{ duration: 0.15 }}
          style={{ fontSize: 12, lineHeight: 1, fontFamily: MONO }}
        >
          {active ? '●' : '○'}
        </motion.span>
        <span style={{
          fontFamily: MONO,
          fontSize: SETTINGS_CONTROL_FONT,
          letterSpacing: '0.14em',
          textTransform: 'uppercase' as const,
          color: active ? S.warm : S.txt,
          transition: 'color 0.15s ease',
        }}>
          {label}
        </span>
      </div>
      <div style={{ fontFamily: MONO, fontSize: SETTINGS_CONTROL_FONT, color: S.dim, lineHeight: 1.55, letterSpacing: '0.02em' }}>
        {description}
      </div>
    </motion.button>
  );
}

// ── Tab bar ───────────────────────────────────────────────────────────────────

function TabBar({ tab, onSetTab }: { tab: SettingsTab; onSetTab: (t: SettingsTab) => void }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'stretch',
      borderBottom: `1px solid ${S.border}`,
      overflowX: 'auto',
      scrollbarWidth: 'none',
      flexShrink: 0,
    } as React.CSSProperties}>
      {TABS.map(t => {
        const active = tab === t.id;
        return (
          <button
            key={t.id}
            onClick={() => { sfxTab(); onSetTab(t.id); }}
            onMouseEnter={() => { if (!active) sfxHover(); }}
            style={{
              position: 'relative',
              padding: '12px 18px',
              fontFamily: MONO,
              fontSize: SETTINGS_CONTROL_FONT,
              letterSpacing: '0.16em',
              textTransform: 'uppercase' as const,
              color: active ? t.accent : S.dim,
              background: 'none',
              border: 'none',
              borderBottom: active ? `2px solid ${t.accent}` : '2px solid transparent',
              marginBottom: -1,
              cursor: 'pointer',
              whiteSpace: 'nowrap' as const,
              transition: 'color 0.12s ease',
              flexShrink: 0,
            }}
            onMouseOver={e => { if (!active) (e.currentTarget as HTMLElement).style.color = S.txt; }}
            onMouseOut={e => { if (!active) (e.currentTarget as HTMLElement).style.color = S.dim; }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Tabs ──────────────────────────────────────────────────────────────────────

function WorldTab({
  worldSeed,
  newSeed,
  setNewSeed,
  copied,
  waterPaletteSetting,
  resolvedWaterPaletteId,
  onCopy,
  onRandom,
  onLaunch,
  onSetWaterPalette,
}: {
  worldSeed: number;
  newSeed: string;
  setNewSeed: (s: string) => void;
  copied: boolean;
  waterPaletteSetting: WaterPaletteSetting;
  resolvedWaterPaletteId: WaterPaletteId;
  onCopy: () => void;
  onRandom: () => void;
  onLaunch: () => void;
  onSetWaterPalette: (s: WaterPaletteSetting) => void;
}) {
  const validSeed = newSeed.trim() !== '' && !isNaN(parseInt(newSeed, 10)) && parseInt(newSeed, 10) > 0;
  const [spinning, setSpinning] = useState(false);

  const handleRandom = () => {
    setSpinning(true);
    setTimeout(() => setSpinning(false), 550);
    onRandom();
  };

  const paletteOptions: Array<{ id: WaterPaletteSetting; label: string; description: string }> = [
    {
      id: 'auto',
      label: 'Auto',
      description: `Now: ${WATER_PALETTES[resolvedWaterPaletteId].label}`,
    },
    ...Object.values(WATER_PALETTES).map(p => ({
      id: p.id as WaterPaletteSetting,
      label: p.label,
      description: p.description,
    })),
  ];

  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div>
        <SectionRule label="Current Seed" />
        <p style={{ fontFamily: MONO, fontSize: SETTINGS_BODY_FONT, color: S.dim, lineHeight: 1.65, marginBottom: 12 }}>
          Share this number to let others explore the same world.
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{
            flex: 1,
            padding: '9px 14px',
            background: 'rgba(255,255,255,0.02)',
            border: `1px solid ${S.border}`,
            borderRadius: 2,
            fontFamily: MONO,
            fontSize: 13,
            letterSpacing: '0.14em',
            color: S.bright,
          }}>
            {worldSeed}
          </div>
          <SecBtn onClick={onCopy}>
            <AnimatePresence mode="wait">
              {copied ? (
                <motion.span
                  key="copied"
                  initial={{ opacity: 0, y: -3 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 3 }}
                  style={{ color: S.teal }}
                >
                  ✓ Copied
                </motion.span>
              ) : (
                <motion.span
                  key="copy"
                  initial={{ opacity: 0, y: -3 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 3 }}
                >
                  Copy
                </motion.span>
              )}
            </AnimatePresence>
          </SecBtn>
        </div>
      </div>

      <div>
        <SectionRule label="New Voyage" />
        <p style={{ fontFamily: MONO, fontSize: SETTINGS_BODY_FONT, color: S.dim, lineHeight: 1.65, marginBottom: 12 }}>
          Enter a seed or generate a random one. Restarts the game.
        </p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <input
            ref={inputRef}
            type="text"
            value={newSeed}
            onChange={e => setNewSeed(e.target.value.replace(/[^0-9]/g, ''))}
            placeholder="seed number…"
            style={{
              flex: 1,
              padding: '9px 14px',
              background: 'rgba(255,255,255,0.02)',
              border: `1px solid ${S.border}`,
              borderRadius: 2,
              fontFamily: MONO,
              fontSize: 13,
              letterSpacing: '0.12em',
              color: S.bright,
              outline: 'none',
              transition: 'border-color 0.15s ease',
            }}
            onFocus={e => { e.currentTarget.style.borderColor = `${S.dimGold}88`; }}
            onBlur={e => { e.currentTarget.style.borderColor = S.border; }}
          />
          <button
            onClick={handleRandom}
            onMouseEnter={() => sfxHover()}
            style={{
              padding: '9px 14px',
              background: 'transparent',
              border: `1px solid ${S.border}`,
              borderRadius: 2,
              fontFamily: MONO,
              fontSize: SETTINGS_CONTROL_FONT,
              letterSpacing: '0.14em',
              textTransform: 'uppercase' as const,
              color: S.dim,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              flexShrink: 0,
            }}
            onMouseOver={e => { (e.currentTarget as HTMLElement).style.borderColor = `${S.dimGold}88`; (e.currentTarget as HTMLElement).style.color = S.txt; }}
            onMouseOut={e => { (e.currentTarget as HTMLElement).style.borderColor = S.border; (e.currentTarget as HTMLElement).style.color = S.dim; }}
          >
            <motion.span
              animate={spinning ? { rotate: 360 } : { rotate: 0 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              style={{ display: 'inline-block', fontSize: 13 }}
            >◈</motion.span>
            <span>Rnd</span>
          </button>
        </div>
        <PrimaryBtn onClick={onLaunch} disabled={!validSeed}>
          Launch New Voyage
        </PrimaryBtn>
      </div>

      <div>
        <SectionRule label="Sea Palette" />
        <p style={{ fontFamily: MONO, fontSize: SETTINGS_CONTROL_FONT, color: S.dim, lineHeight: 1.6, marginBottom: 10 }}>
          How ocean water is color-graded across the world.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(136px, 1fr))', gap: 6 }}>
          {paletteOptions.map(opt => (
            <PaletteCard
              key={opt.id}
              label={opt.label}
              description={opt.description}
              active={waterPaletteSetting === opt.id}
              onClick={() => onSetWaterPalette(opt.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function DisplayTab({
  renderDebug,
  onUpdate,
}: {
  renderDebug: RenderDebugSettings;
  onUpdate: (p: Partial<RenderDebugSettings>) => void;
}) {
  return (
    <div>
      <SectionRule label="Map Markers" />
      <CtrlRow label="Beacons" desc="Floating religious plumb bobs and cyan POI pillars on the 3D port map.">
        <Toggle
          value={renderDebug.sacredMarkers || renderDebug.poiBeacons}
          onChange={v => onUpdate({ sacredMarkers: v, poiBeacons: v })}
        />
      </CtrlRow>
      <CtrlRow label="Animal Markers" desc="Nearby wildlife cluster labels — camel, antelope, fish, etc." last>
        <Toggle value={renderDebug.animalMarkers} onChange={v => onUpdate({ animalMarkers: v })} />
      </CtrlRow>
    </div>
  );
}

function AudioTab() {
  const [musicVol, setMusicVol] = useState(() => audioManager.getMusicVolume());
  const [ambientVol, setAmbientVol] = useState(() => ambientEngine.getVolume());
  const [uiVol, setUiVol] = useState(() => getSfxVolume());

  return (
    <div>
      <SectionRule label="Volume" />
      <VolSlider
        label="Music"
        desc="Background music and ambient tracks"
        value={musicVol}
        onChange={v => { setMusicVol(v); audioManager.setMusicVolume(v); }}
      />
      <VolSlider
        label="Ambient"
        desc="Ocean waves, wind, and port atmosphere"
        value={ambientVol}
        onChange={v => { setAmbientVol(v); ambientEngine.setVolume(v); }}
      />
      <VolSlider
        label="UI Sounds"
        desc="Button clicks, menu sounds, notifications"
        value={uiVol}
        onChange={v => { setUiVol(v); setSfxVolume(v); }}
        onAfterChange={() => sfxClick()}
        last
      />
    </div>
  );
}

function GameplayTab({
  renderDebug,
  onUpdate,
}: {
  renderDebug: RenderDebugSettings;
  onUpdate: (p: Partial<RenderDebugSettings>) => void;
}) {
  const shipSteeringMode = useGameStore(s => s.shipSteeringMode);
  const setShipSteeringMode = useGameStore(s => s.setShipSteeringMode);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <SectionRule label="Controls" />
        <CtrlRow label="Ship Steering" desc="Tap sets a target heading; joystick mirrors WASD. Mainly affects touch screens.">
          <SegControl
            options={[{ value: 'tap', label: 'Tap' }, { value: 'joystick', label: 'Stick' }]}
            value={shipSteeringMode}
            onChange={v => setShipSteeringMode(v)}
          />
        </CtrlRow>
      </div>

      <div>
        <SectionRule label="Navigation" />
        <CtrlRow label="Minimap" desc="Small live chart in the sailing HUD.">
          <Toggle value={renderDebug.minimap} onChange={v => onUpdate({ minimap: v })} />
        </CtrlRow>
        <CtrlRow label="World Map" desc="Brass portolan chart or the older flat modal." last>
          <SegControl
            options={[{ value: 'chart', label: 'Chart' }, { value: 'classic', label: 'Classic' }]}
            value={renderDebug.worldMapChart ? 'chart' : 'classic'}
            onChange={v => onUpdate({ worldMapChart: v === 'chart' })}
          />
        </CtrlRow>
      </div>
    </div>
  );
}

const CLIMATE_COLORS: Record<string, string> = {
  tropical: '#4aaa6a',
  arid: '#c9a84c',
  temperate: '#5a8aaa',
  monsoon: '#5aaaaa',
};

const GEO_ICONS: Record<string, string> = {
  inlet: '∿', bay: '≋', strait: '⊃', island: '◉',
  coastal_island: '⊙', peninsula: '▲', estuary: '≈',
  crater_harbor: '⊕', continental_coast: '—', archipelago: '∷',
};

function DevTab({
  worldSeed,
  worldSize,
  devSoloPort,
  renderDebug,
  onSetWorldSize,
  onLoadPort,
  onClearSolo,
  onUpdate,
  onResetRender,
}: {
  worldSeed: number;
  worldSize: number;
  devSoloPort: string | null;
  renderDebug: RenderDebugSettings;
  onSetWorldSize: (n: number) => void;
  onLoadPort: (id: string) => void;
  onClearSolo: () => void;
  onUpdate: (p: Partial<RenderDebugSettings>) => void;
  onResetRender: () => void;
}) {
  const worldSizeEntries = Object.entries(WORLD_SIZE_VALUES) as [WorldSize, number][];
  const forceMobileLayout = useGameStore(s => s.forceMobileLayout);
  const setForceMobileLayout = useGameStore(s => s.setForceMobileLayout);
  const shipSteeringMode = useGameStore(s => s.shipSteeringMode);
  const setShipSteeringMode = useGameStore(s => s.setShipSteeringMode);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <SectionRule label="UI" />
        <CtrlRow label="Settings Panel" desc="Switch between redesigned (V2) and original (V1) for A/B comparison." last>
          <SegControl
            options={[{ value: 'true', label: 'V2' }, { value: 'false', label: 'V1' }]}
            value={renderDebug.settingsV2 ? 'true' : 'false'}
            onChange={v => onUpdate({ settingsV2: v === 'true' })}
          />
        </CtrlRow>
      </div>

      <div>
        <SectionRule label="Mobile Preview" />
        <CtrlRow label="Force Mobile Layout" desc="Treat this session as mobile regardless of screen size.">
          <Toggle value={forceMobileLayout} onChange={v => { sfxClick(); setForceMobileLayout(v); }} />
        </CtrlRow>
        <CtrlRow label="Ship Steering" desc="Tap sets a target heading; joystick mirrors WASD." last>
          <SegControl
            options={[{ value: 'tap', label: 'Tap' }, { value: 'joystick', label: 'Stick' }]}
            value={shipSteeringMode}
            onChange={v => { sfxClick(); setShipSteeringMode(v); }}
          />
        </CtrlRow>
      </div>

      <div>
        <SectionRule label="Render Testing" />
        <CtrlRow label="Live Render Panel" desc="In-game overlay with graphics toggles.">
          <Toggle value={renderDebug.showDevPanel} onChange={v => onUpdate({ showDevPanel: v })} />
        </CtrlRow>
        <CtrlRow label="World Map Variant" desc="Brass portolan chart or classic flat modal.">
          <SegControl
            options={[{ value: 'chart', label: 'Chart' }, { value: 'classic', label: 'Classic' }]}
            value={renderDebug.worldMapChart ? 'chart' : 'classic'}
            onChange={v => onUpdate({ worldMapChart: v === 'chart' })}
          />
        </CtrlRow>
        <CtrlRow label="Disable Transitions" desc="Kill all CSS transitions for snapshot testing." last>
          <Toggle value={renderDebug.disableTransitions} onChange={v => onUpdate({ disableTransitions: v })} />
        </CtrlRow>
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <SecBtn
            onClick={() => onUpdate({
              shadows: false, postprocessing: false, bloom: false,
              vignette: false, advancedWater: false, shipWake: false,
              algae: false, wildlifeMotion: false,
            })}
          >
            Minimal render
          </SecBtn>
          <SecBtn onClick={onResetRender}>Restore defaults</SecBtn>
        </div>
      </div>

      <div>
        <SectionRule label="City Field Overlay" />
        <CtrlRow label="Heatmap Overlay" desc="Coarse land heatmap for tuning city districts, countryside danger, sacred-site placement.">
          <Toggle
            value={renderDebug.cityFieldOverlay}
            onChange={v => onUpdate({ cityFieldOverlay: v })}
          />
        </CtrlRow>
        <div style={{ marginTop: 10 }}>
          <div style={{ fontFamily: MONO, fontSize: SETTINGS_CONTROL_FONT, color: S.dim, marginBottom: 8, lineHeight: 1.55 }}>
            {renderDebug.cityFieldMode === 'district'
              ? 'District classification: citadel, sacred, urban core, elite, artisan, waterside, fringe.'
              : CITY_FIELD_DESCRIPTIONS[renderDebug.cityFieldMode]}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {(['district', ...CITY_FIELD_KEYS] as const).map(field => {
              const active = renderDebug.cityFieldMode === field;
              return (
                <SecBtn
                  key={field}
                  active={active}
                  onClick={() => onUpdate({ cityFieldMode: field, cityFieldOverlay: true })}
                  narrow
                >
                  {field === 'district' ? 'District' : CITY_FIELD_LABELS[field]}
                </SecBtn>
              );
            })}
          </div>
        </div>
      </div>

      <div>
        <SectionRule label="World Size" />
        <div style={{ display: 'flex', gap: 6 }}>
          {worldSizeEntries.map(([label, value]) => (
            <SecBtn
              key={label}
              active={worldSize === value}
              onClick={() => onSetWorldSize(value)}
            >
              {label}
            </SecBtn>
          ))}
        </div>
      </div>

      {devSoloPort && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          background: `${S.gold}09`,
          border: `1px solid ${S.dimGold}44`,
          borderRadius: 3,
        }}>
          <div>
            <span style={{ fontFamily: MONO, fontSize: SETTINGS_MICRO_FONT, color: S.warm, letterSpacing: '0.2em', textTransform: 'uppercase' }}>Solo Mode</span>
            <span style={{ fontFamily: MONO, fontSize: SETTINGS_MICRO_FONT, color: S.dim, marginLeft: 10 }}>
              {CORE_PORTS.find(p => p.id === devSoloPort)?.name ?? devSoloPort}
            </span>
          </div>
          <SecBtn onClick={onClearSolo}>Exit Solo</SecBtn>
        </div>
      )}

      <div>
        <SectionRule label="Port Archetypes" />
        <p style={{ fontFamily: MONO, fontSize: SETTINGS_CONTROL_FONT, color: S.dim, lineHeight: 1.6, marginBottom: 10 }}>
          Load a single port to preview its geographic archetype.
        </p>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
          gap: 5,
          maxHeight: 240,
          overflowY: 'auto',
          paddingRight: 4,
        }}>
          {CORE_PORTS.map(port => {
            const active = devSoloPort === port.id;
            return (
              <motion.button
                key={port.id}
                onClick={() => { sfxClick(); onLoadPort(port.id); }}
                onMouseEnter={() => sfxHover()}
                animate={{
                  borderColor: active ? `${S.gold}55` : S.border,
                  backgroundColor: active ? `${S.gold}09` : 'transparent',
                }}
                transition={{ duration: 0.13 }}
                style={{
                  padding: '8px 10px',
                  border: `1px solid ${S.border}`,
                  borderRadius: 3,
                  textAlign: 'left' as const,
                  cursor: 'pointer',
                }}
                whileHover={{ borderColor: `${S.dimGold}55`, backgroundColor: 'rgba(255,255,255,0.015)' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                  <span style={{ fontFamily: MONO, fontSize: 13, color: S.dim }}>{GEO_ICONS[port.geography] ?? '·'}</span>
                  <span style={{ fontFamily: MONO, fontSize: SETTINGS_MICRO_FONT, color: active ? S.warm : S.txt, letterSpacing: '0.06em' }}>
                    {port.name}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <span style={{ fontFamily: MONO, fontSize: 9, color: CLIMATE_COLORS[port.climate] ?? S.dim, letterSpacing: '0.1em' }}>
                    {port.climate}
                  </span>
                  <span style={{ fontFamily: MONO, fontSize: 9, color: S.dim }}>·</span>
                  <span style={{ fontFamily: MONO, fontSize: 9, color: S.dim }}>
                    {port.geography.replace('_', ' ')}
                  </span>
                </div>
              </motion.button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function AboutTab() {
  const bodyStyle = {
    fontFamily: MONO,
    fontSize: SETTINGS_BODY_FONT,
    color: S.txt,
    lineHeight: 1.7,
    margin: 0,
  } as const;
  const linkStyle = {
    color: S.warm,
    textDecoration: 'none',
    borderBottom: `1px solid ${S.dimGold}66`,
  } as const;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <SectionRule label="Game" />
        <div style={{
          fontFamily: '"Fraunces", serif',
          fontSize: 22,
          color: S.warm,
          marginBottom: 6,
          fontWeight: 600,
          letterSpacing: '0.01em',
        }}>
          Spice Voyager <span style={{ color: S.dim, fontSize: 16 }}>1612</span>
        </div>
        <p style={{ ...bodyStyle, maxWidth: 510 }}>
          A historical sailing, trading, and knowledge game set in the Indian Ocean and connected Atlantic worlds of 1612. The game is centered on spices, drugs, medicines, ports, winds, ships, fraud, reputation, and the fragile business of knowing what a thing is before you stake your voyage on it.
        </p>
      </div>

      <div>
        <SectionRule label="Author" />
        <p style={bodyStyle}>
          Spice Voyager is a project by Benjamin Breen, a historian at UC Santa Cruz and the author of <em style={{ color: S.bright }}>The Age of Intoxication: Origins of the Global Drug Trade</em>. His work studies early modern drugs, commodities, pharmacology, colonialism, and the trade networks that connected Europe, Africa, Asia, and the Americas.
        </p>
        <p style={{ ...bodyStyle, marginTop: 12 }}>
          He has also written about AI-enabled historical educational games at{' '}
          <a
            href="https://resobscura.substack.com"
            target="_blank"
            rel="noreferrer"
            style={linkStyle}
          >
            resobscura.substack.com
          </a>
          .
        </p>
      </div>

      <div>
        <SectionRule label="Design" />
        <p style={bodyStyle}>
          The goal is not to make a generic age-of-sail trading loop with period wallpaper. The game treats commodities as historical objects with origins, uses, risks, reputations, and local expertise. Pepper, coffee, indigo, ambergris, dragon's blood, bezoar stones, and other goods are meant to feel specific: things handled by merchants, physicians, sailors, brokers, informants, and port officials, not abstract colored cubes.
        </p>
        <p style={{ ...bodyStyle, marginTop: 12 }}>
          The knowledge system is central. You begin with partial understanding. Crew members can identify goods. Taverns and encounters may teach, mislead, or confirm what you think you know. A cargo that looks profitable can still be counterfeit, misunderstood, or badly timed.
        </p>
      </div>

      <div>
        <SectionRule label="Historical Frame" />
        <p style={bodyStyle}>
          The year 1612 sits at a volatile moment: Portuguese routes still matter, Dutch and English companies are pushing into Asian waters, Mughal and Gujarati commerce shapes the western Indian Ocean, Red Sea coffee is becoming globally consequential, and Atlantic colonies are beginning to alter the map of trade. The simulation compresses and stylizes this world, but its systems are built around that specific historical moment.
        </p>
      </div>

      <div>
        <SectionRule label="Build" />
        {[
          ['Version',  '0.1.0'],
          ['Engine',   'Three.js + React'],
          ['World',    'Procedural ports + authored data'],
          ['Terrain',  'Procedural terrain and cities'],
          ['Renderer', 'WebGL 2.0'],
        ].map(([label, value], i, arr) => (
          <div
            key={label}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              padding: '8px 0',
              borderBottom: i < arr.length - 1 ? `1px solid ${S.borderDim}` : 'none',
            }}
          >
            <span style={{ fontFamily: MONO, fontSize: SETTINGS_MICRO_FONT, color: S.dim, letterSpacing: '0.15em', textTransform: 'uppercase' }}>{label}</span>
            <span style={{ fontFamily: MONO, fontSize: SETTINGS_CONTROL_FONT, color: S.txt }}>{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function SettingsModalV2({
  open,
  onClose,
  initialTab,
}: {
  open: boolean;
  onClose: () => void;
  initialTab?: SettingsTab;
}) {
  const worldSeed          = useGameStore(s => s.worldSeed);
  const setWorldSeed       = useGameStore(s => s.setWorldSeed);
  const worldSize          = useGameStore(s => s.worldSize);
  const setWorldSize       = useGameStore(s => s.setWorldSize);
  const devSoloPort        = useGameStore(s => s.devSoloPort);
  const setDevSoloPort     = useGameStore(s => s.setDevSoloPort);
  const waterPaletteSetting = useGameStore(s => s.waterPaletteSetting);
  const setWaterPaletteSetting = useGameStore(s => s.setWaterPaletteSetting);
  const resolvedWaterPaletteId = useGameStore(s => resolveWaterPaletteId(s));
  const renderDebug        = useGameStore(s => s.renderDebug);
  const updateRenderDebug  = useGameStore(s => s.updateRenderDebug);
  const resetRenderDebug   = useGameStore(s => s.resetRenderDebug);

  const [tab, setTab] = useState<SettingsTab>(initialTab ?? 'world');
  const [newSeed, setNewSeed] = useState('');
  const [copied, setCopied] = useState(false);
  const activeAccent = TABS.find(t => t.id === tab)?.accent ?? CLR.gold;

  useEffect(() => { if (open && initialTab) setTab(initialTab); }, [open, initialTab]);

  const handleCopySeed = () => {
    navigator.clipboard.writeText(String(worldSeed));
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const handleRandomSeed = () => {
    setNewSeed(String(Math.floor(Math.random() * 100000)));
  };

  const handleLaunchVoyage = () => {
    const seed = parseInt(newSeed, 10);
    if (!isNaN(seed) && seed > 0) {
      setWorldSeed(seed);
      onClose();
      window.location.reload();
    }
  };

  if (!open) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.12 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-auto"
      style={{ backgroundColor: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(3px)' }}
      onClick={e => { if (e.target === e.currentTarget) { sfxClose(); onClose(); } }}
    >
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 4 }}
        transition={{ duration: 0.14, ease: 'easeOut' }}
        style={{
          width: '100%',
          maxWidth: 620,
          height: 'min(88dvh, 640px)',
          background: S.bg,
          border: `1px solid ${S.border}`,
          borderRadius: 5,
          boxShadow: '0 24px 80px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,255,255,0.04), inset 0 1px 0 rgba(255,255,255,0.04)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 22px',
          borderBottom: `1px solid ${S.border}`,
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
            <span style={{ fontFamily: MONO, fontSize: 12, letterSpacing: '0.22em', textTransform: 'uppercase', color: S.warm }}>
              Settings
            </span>
          </div>
          <button
            onClick={() => { sfxClose(); onClose(); }}
            onMouseEnter={e => { sfxHover(); (e.currentTarget as HTMLElement).style.color = S.bright; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = S.txt; }}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontFamily: MONO, fontSize: 20, lineHeight: 1,
              color: S.txt, padding: '2px 6px',
              transition: 'color 0.1s ease',
            }}
            aria-label="Close"
          >×</button>
        </div>

        {/* Tab bar */}
        <TabBar tab={tab} onSetTab={setTab} />

        {/* Content — all panes rendered, shown with CSS opacity so height never changes */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          {([
            ['world', <WorldTab
              worldSeed={worldSeed}
              newSeed={newSeed}
              setNewSeed={setNewSeed}
              copied={copied}
              waterPaletteSetting={waterPaletteSetting}
              resolvedWaterPaletteId={resolvedWaterPaletteId}
              onCopy={handleCopySeed}
              onRandom={handleRandomSeed}
              onLaunch={handleLaunchVoyage}
              onSetWaterPalette={setWaterPaletteSetting}
            />],
            ['display', <DisplayTab renderDebug={renderDebug} onUpdate={updateRenderDebug} />],
            ['audio', <AudioTab />],
            ['gameplay', <GameplayTab renderDebug={renderDebug} onUpdate={updateRenderDebug} />],
            ['dev', <DevTab
              worldSeed={worldSeed}
              worldSize={worldSize}
              devSoloPort={devSoloPort}
              renderDebug={renderDebug}
              onSetWorldSize={size => { setWorldSize(size); onClose(); }}
              onLoadPort={id => { setDevSoloPort(id); onClose(); }}
              onClearSolo={() => { setDevSoloPort(null); onClose(); }}
              onUpdate={updateRenderDebug}
              onResetRender={resetRenderDebug}
            />],
            ['about', <AboutTab />],
          ] as [SettingsTab, React.ReactNode][]).map(([id, content]) => (
            <div
              key={id}
              style={{
                position: 'absolute', inset: 0,
                overflowY: 'auto', overflowX: 'hidden',
                padding: '20px 24px 36px',
                opacity: tab === id ? 1 : 0,
                pointerEvents: tab === id ? 'auto' : 'none',
                transition: 'opacity 0.1s ease',
              }}
            >
              {content}
            </div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}
