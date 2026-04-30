import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore, RenderDebugSettings } from '../store/gameStore';
import { sfxTab, sfxClose, sfxClick, setSfxVolume, getSfxVolume } from '../audio/SoundEffects';
import { audioManager } from '../audio/AudioManager';
import { ambientEngine } from '../audio/AmbientEngine';
import {
  X, Globe, Monitor, Volume2, Gamepad2, Info,
  Copy, Shuffle, Rocket, Check, Code2, Map, Music, Waves, MousePointerClick,
} from 'lucide-react';
import { CORE_PORTS, WORLD_SIZE_VALUES, WorldSize } from '../utils/portArchetypes';
import { WATER_PALETTES, resolveWaterPaletteId } from '../utils/waterPalettes';
import type { WaterPaletteId, WaterPaletteSetting } from '../utils/waterPalettes';
import { modalBackdropMotion, modalContentMotion, modalPanelMotion } from '../utils/uiMotion';
import { CITY_FIELD_DESCRIPTIONS, CITY_FIELD_KEYS, CITY_FIELD_LABELS } from '../utils/cityFieldTypes';

type SettingsTab = 'world' | 'display' | 'audio' | 'gameplay' | 'dev' | 'about';

const TABS: { id: SettingsTab; label: string; icon: typeof Globe }[] = [
  { id: 'world',    label: 'World',    icon: Globe },
  { id: 'display',  label: 'Display',  icon: Monitor },
  { id: 'audio',    label: 'Audio',    icon: Volume2 },
  { id: 'gameplay', label: 'Gameplay', icon: Gamepad2 },
  { id: 'dev',      label: 'Dev',      icon: Code2 },
  { id: 'about',    label: 'About',    icon: Info },
];

export function SettingsModal({ open, onClose, initialTab }: { open: boolean; onClose: () => void; initialTab?: SettingsTab }) {
  const worldSeed = useGameStore(s => s.worldSeed);
  const setWorldSeed = useGameStore(s => s.setWorldSeed);
  const worldSize = useGameStore(s => s.worldSize);
  const setWorldSize = useGameStore(s => s.setWorldSize);
  const devSoloPort = useGameStore(s => s.devSoloPort);
  const setDevSoloPort = useGameStore(s => s.setDevSoloPort);
  const waterPaletteSetting = useGameStore(s => s.waterPaletteSetting);
  const setWaterPaletteSetting = useGameStore(s => s.setWaterPaletteSetting);
  const resolvedWaterPaletteId = useGameStore(s => resolveWaterPaletteId(s));
  const renderDebug = useGameStore(s => s.renderDebug);
  const updateRenderDebug = useGameStore(s => s.updateRenderDebug);
  const resetRenderDebug = useGameStore(s => s.resetRenderDebug);
  const [tab, setTab] = useState<SettingsTab>(initialTab ?? 'world');
  useEffect(() => { if (open && initialTab) setTab(initialTab); }, [open, initialTab]);
  const [newSeed, setNewSeed] = useState('');
  const [copied, setCopied] = useState(false);

  const handleCopySeed = () => {
    navigator.clipboard.writeText(String(worldSeed));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleRandomSeed = () => {
    setNewSeed(String(Math.floor(Math.random() * 100000)));
  };

  const handleLaunchVoyage = () => {
    const seed = parseInt(newSeed, 10);
    if (!isNaN(seed) && seed > 0) {
      setWorldSeed(seed);
      onClose();
      // Reload to regenerate world with new seed
      window.location.reload();
    }
  };

  if (!open) return null;

  return (
    <motion.div
      {...modalBackdropMotion}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-6 pointer-events-auto"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        {...modalPanelMotion}
        className="w-full max-w-3xl h-[520px] flex rounded-xl overflow-hidden
          bg-[#0c1019]/95 backdrop-blur-xl border border-[#2a2d3a]/50
          shadow-[0_16px_64px_rgba(0,0,0,0.6)]"
      >
        {/* Left tab strip */}
        <div className="w-[180px] bg-[#080c14] border-r border-white/[0.06] flex flex-col">
          <div className="px-5 py-4 border-b border-white/[0.06]">
            <span className="text-[11px] font-bold tracking-[0.15em] uppercase text-slate-400">
              Settings
            </span>
          </div>
          <nav className="flex-1 py-2 px-2 space-y-0.5">
            {TABS.map(t => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => { sfxTab(); setTab(t.id); }}
                  className={`group w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all duration-150
                    ${active
                      ? 'bg-white/[0.07] text-slate-200'
                      : 'text-slate-500 hover:text-slate-300 hover:bg-white/[0.03]'
                    }`}
                >
                  <Icon size={15} className={active ? 'text-amber-400' : 'text-slate-600 group-hover:text-slate-400 transition-colors'} />
                  {t.label}
                </button>
              );
            })}
          </nav>
          <div className="px-4 py-3 border-t border-white/[0.06]">
            <span className="text-[9px] text-slate-600 tracking-wider uppercase">
              Seed: {worldSeed}
            </span>
          </div>
        </div>

        {/* Right content area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
            <h2 className="text-sm font-bold tracking-wide text-slate-300" style={{ fontFamily: '"DM Sans", sans-serif' }}>
              {TABS.find(t => t.id === tab)?.label}
            </h2>
            <button
              onClick={() => { sfxClose(); onClose(); }}
              className="w-7 h-7 rounded-full flex items-center justify-center text-slate-500
                hover:text-slate-300 hover:bg-white/[0.06] transition-all"
            >
              <X size={14} />
            </button>
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto px-6 py-5">
            <AnimatePresence mode="wait">
              <motion.div
                key={tab}
                {...modalContentMotion}
              >
                {tab === 'world' && (
                  <WorldTab
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
                  />
                )}
                {tab === 'display' && (
                  <DisplayTab
                    renderDebug={renderDebug}
                    onUpdateRenderDebug={updateRenderDebug}
                  />
                )}
                {tab === 'audio' && <AudioTab />}
                {tab === 'gameplay' && <PlaceholderTab title="Gameplay" description="Time speed, auto-pause, and difficulty settings will appear here." />}
                {tab === 'dev' && (
                  <DevTab
                    worldSeed={worldSeed}
                    worldSize={worldSize}
                    devSoloPort={devSoloPort}
                    renderDebug={renderDebug}
                    onSetWorldSize={(size) => {
                      setWorldSize(size);
                      onClose();
                    }}
                    onLoadPort={(portId) => {
                      setDevSoloPort(portId);
                      onClose();
                    }}
                    onClearSolo={() => {
                      setDevSoloPort(null);
                      onClose();
                    }}
                    onUpdateRenderDebug={updateRenderDebug}
                    onResetRenderDebug={resetRenderDebug}
                  />
                )}
                {tab === 'about' && <AboutTab />}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

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
  onSetWaterPalette: (setting: WaterPaletteSetting) => void;
}) {
  const validSeed = newSeed.trim() !== '' && !isNaN(parseInt(newSeed, 10)) && parseInt(newSeed, 10) > 0;
  const paletteOptions: Array<{ id: WaterPaletteSetting; label: string; description: string }> = [
    {
      id: 'auto',
      label: 'Auto',
      description: `Uses the current voyage climate. Now resolving to ${WATER_PALETTES[resolvedWaterPaletteId].label}.`,
    },
    ...Object.values(WATER_PALETTES).map((palette) => ({
      id: palette.id,
      label: palette.label,
      description: palette.description,
    })),
  ];

  return (
    <div className="space-y-8">
      {/* Current seed */}
      <SettingsSection title="Current Seed" description="This world was generated from this seed. Share it to let others explore the same map.">
        <div className="flex items-center gap-2">
          <div className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-lg px-4 py-2.5
            text-slate-300 text-sm font-mono tracking-wider">
            {worldSeed}
          </div>
          <button
            onClick={onCopy}
            className="h-10 px-3 rounded-lg border border-white/[0.08] bg-white/[0.04]
              text-slate-400 hover:text-slate-200 hover:bg-white/[0.07] transition-all
              flex items-center gap-2 text-xs font-medium"
          >
            {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </SettingsSection>

      {/* New voyage */}
      <SettingsSection title="New Voyage" description="Enter a seed or generate a random one. This will restart the game with a new world.">
        <div className="flex items-center gap-2 mb-3">
          <input
            type="text"
            value={newSeed}
            onChange={e => setNewSeed(e.target.value.replace(/[^0-9]/g, ''))}
            placeholder="Enter a seed number..."
            className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-lg px-4 py-2.5
              text-slate-300 text-sm font-mono tracking-wider placeholder-slate-600
              focus:outline-none focus:border-amber-700/50 focus:bg-white/[0.06] transition-all"
          />
          <button
            onClick={onRandom}
            className="h-10 px-3 rounded-lg border border-white/[0.08] bg-white/[0.04]
              text-slate-400 hover:text-amber-400 hover:bg-amber-500/[0.07] hover:border-amber-700/30 transition-all
              flex items-center gap-2 text-xs font-medium"
          >
            <Shuffle size={13} />
            Random
          </button>
        </div>
        <button
          onClick={onLaunch}
          disabled={!validSeed}
          className="w-full py-3 rounded-lg font-bold text-sm tracking-wide transition-all duration-200
            flex items-center justify-center gap-2
            disabled:opacity-30 disabled:cursor-not-allowed
            bg-amber-600/20 border border-amber-600/30 text-amber-400
            hover:bg-amber-600/30 hover:border-amber-500/50 hover:shadow-[0_0_20px_rgba(217,169,56,0.15)]
            active:scale-[0.98]"
        >
          <Rocket size={14} />
          Launch New Voyage
        </button>
      </SettingsSection>

      <SettingsSection title="Sea Palette" description="Choose how ocean water is color-graded across the world and parchment map.">
        <div className="grid grid-cols-2 gap-2">
          {paletteOptions.map((option) => {
            const active = waterPaletteSetting === option.id;
            return (
              <button
                key={option.id}
                onClick={() => onSetWaterPalette(option.id)}
                className={`rounded-lg border p-3 text-left transition-all ${
                  active
                    ? 'bg-cyan-500/10 border-cyan-500/30'
                    : 'bg-white/[0.03] border-white/[0.06] hover:bg-white/[0.05] hover:border-white/[0.12]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Waves size={14} className={active ? 'text-cyan-300' : 'text-slate-500'} />
                  <span className={`text-xs font-semibold ${active ? 'text-cyan-100' : 'text-slate-300'}`}>
                    {option.label}
                  </span>
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                  {option.description}
                </p>
              </button>
            );
          })}
        </div>
      </SettingsSection>
    </div>
  );
}

const CLIMATE_COLORS: Record<string, string> = {
  tropical: 'text-emerald-400',
  arid: 'text-amber-400',
  temperate: 'text-blue-400',
  monsoon: 'text-cyan-400',
};

const GEO_ICONS: Record<string, string> = {
  inlet: '🏞️',
  bay: '🌊',
  strait: '⛵',
  island: '🏝️',
  coastal_island: '🏘️',
  peninsula: '🗻',
  estuary: '🏞️',
  crater_harbor: '🌋',
  continental_coast: '🏖️',
  archipelago: '🗺️',
};

function DevTab({ worldSeed, worldSize, devSoloPort, renderDebug, onSetWorldSize, onLoadPort, onClearSolo, onUpdateRenderDebug, onResetRenderDebug }: {
  worldSeed: number;
  worldSize: number;
  devSoloPort: string | null;
  renderDebug: RenderDebugSettings;
  onSetWorldSize: (size: number) => void;
  onLoadPort: (portId: string) => void;
  onClearSolo: () => void;
  onUpdateRenderDebug: (patch: Partial<RenderDebugSettings>) => void;
  onResetRenderDebug: () => void;
}) {
  const worldSizeEntries = Object.entries(WORLD_SIZE_VALUES) as [WorldSize, number][];
  const forceMobileLayout = useGameStore(s => s.forceMobileLayout);
  const setForceMobileLayout = useGameStore(s => s.setForceMobileLayout);
  const shipSteeringMode = useGameStore(s => s.shipSteeringMode);
  const setShipSteeringMode = useGameStore(s => s.setShipSteeringMode);

  return (
    <div className="space-y-6">
      <SettingsSection title="Mobile Preview" description="Force the touch/mobile UI on desktop for testing. Normally auto-detected from viewport and pointer type.">
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 py-3">
            <div>
              <div className="text-xs font-semibold text-slate-300">Force Mobile Layout</div>
              <div className="text-[11px] text-slate-500">Treat this session as mobile regardless of screen size.</div>
            </div>
            <button
              onClick={() => { sfxClick(); setForceMobileLayout(!forceMobileLayout); }}
              className={`rounded-lg px-3 py-2 text-xs font-medium transition-all border ${
                forceMobileLayout
                  ? 'bg-emerald-600/20 border-emerald-600/30 text-emerald-300'
                  : 'bg-white/[0.03] border-white/[0.08] text-slate-400 hover:text-slate-200 hover:bg-white/[0.06]'
              }`}
            >
              {forceMobileLayout ? 'Forced On' : 'Auto'}
            </button>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 py-3">
            <div>
              <div className="text-xs font-semibold text-slate-300">Ship Steering (Touch)</div>
              <div className="text-[11px] text-slate-500">Tap sets a target heading; joystick mirrors WASD.</div>
            </div>
            <div className="flex gap-1 rounded-lg border border-white/[0.08] bg-white/[0.03] p-0.5">
              {(['tap', 'joystick'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => { sfxClick(); setShipSteeringMode(mode); }}
                  className={`rounded px-3 py-1.5 text-xs font-medium capitalize transition-all ${
                    shipSteeringMode === mode
                      ? 'bg-emerald-600/20 text-emerald-300'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

        </div>
      </SettingsSection>

      <SettingsSection title="Render Testing" description="Enable a live dev panel for turning expensive features on and off while sailing.">
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 py-3">
            <div>
              <div className="text-xs font-semibold text-slate-300">Live Render Panel</div>
              <div className="text-[11px] text-slate-500">Shows an in-game overlay with graphics toggles.</div>
            </div>
            <button
              onClick={() => onUpdateRenderDebug({ showDevPanel: !renderDebug.showDevPanel })}
              className={`rounded-lg px-3 py-2 text-xs font-medium transition-all border ${
                renderDebug.showDevPanel
                  ? 'bg-emerald-600/20 border-emerald-600/30 text-emerald-300'
                  : 'bg-white/[0.03] border-white/[0.08] text-slate-400 hover:text-slate-200 hover:bg-white/[0.06]'
              }`}
            >
              {renderDebug.showDevPanel ? 'Panel On' : 'Panel Off'}
            </button>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 py-3">
            <div>
              <div className="text-xs font-semibold text-slate-300">World Map Variant</div>
              <div className="text-[11px] text-slate-500">Brass-framed portolan chart (new) or flat slate modal (classic).</div>
            </div>
            <div className="flex gap-1 rounded-lg border border-white/[0.08] bg-white/[0.03] p-0.5">
              <button
                onClick={() => onUpdateRenderDebug({ worldMapChart: true })}
                className={`rounded px-3 py-1.5 text-xs font-medium transition-all ${
                  renderDebug.worldMapChart
                    ? 'bg-amber-600/20 text-amber-300'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Chart
              </button>
              <button
                onClick={() => onUpdateRenderDebug({ worldMapChart: false })}
                className={`rounded px-3 py-1.5 text-xs font-medium transition-all ${
                  !renderDebug.worldMapChart
                    ? 'bg-amber-600/20 text-amber-300'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Classic
              </button>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => onUpdateRenderDebug({
                shadows: false,
                postprocessing: false,
                bloom: false,
                vignette: false,
                advancedWater: false,
                shipWake: false,
                algae: false,
                wildlifeMotion: false,
              })}
              className="flex-1 rounded-lg border border-amber-600/20 bg-amber-600/10 px-3 py-2 text-xs font-medium text-amber-300 transition-all hover:bg-amber-600/15"
            >
              Minimal Render Test
            </button>
            <button
              onClick={onResetRenderDebug}
              className="flex-1 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs font-medium text-slate-300 transition-all hover:bg-white/[0.06]"
            >
              Restore Defaults
            </button>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title="City Field Overlay" description="Phase 1 debug view for the additive field model. Visualizes candidate sacred/profane, safe/dangerous, access, and prestige fields across all generated land without changing generation yet.">
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 py-3">
            <div>
              <div className="text-xs font-semibold text-slate-300">Heatmap Overlay</div>
              <div className="text-[11px] text-slate-500">Draws a coarse land heatmap for tuning future city districts, countryside danger, and sacred-site placement.</div>
            </div>
            <button
              onClick={() => onUpdateRenderDebug({ cityFieldOverlay: !renderDebug.cityFieldOverlay })}
              className={`rounded-lg px-3 py-2 text-xs font-medium transition-all border ${
                renderDebug.cityFieldOverlay
                  ? 'bg-emerald-600/20 border-emerald-600/30 text-emerald-300'
                  : 'bg-white/[0.03] border-white/[0.08] text-slate-400 hover:text-slate-200 hover:bg-white/[0.06]'
              }`}
            >
              {renderDebug.cityFieldOverlay ? 'Overlay On' : 'Overlay Off'}
            </button>
          </div>

          <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 py-3">
            <div className="text-xs font-semibold text-slate-300">Overlay Field</div>
            <div className="mt-1 text-[11px] text-slate-500">
              {renderDebug.cityFieldMode === 'district'
                ? 'District classification: citadel, sacred, urban core, elite residential, artisan, waterside, and fringe zones.'
                : CITY_FIELD_DESCRIPTIONS[renderDebug.cityFieldMode]}
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <button
                key="district"
                onClick={() => onUpdateRenderDebug({ cityFieldMode: 'district', cityFieldOverlay: true })}
                className={`rounded-md border px-2.5 py-1.5 text-[11px] font-medium transition-all ${
                  renderDebug.cityFieldMode === 'district'
                    ? 'border-amber-600/30 bg-amber-600/18 text-amber-300'
                    : 'border-white/[0.08] bg-white/[0.03] text-slate-400 hover:bg-white/[0.06] hover:text-slate-200'
                }`}
              >
                District
              </button>
              {CITY_FIELD_KEYS.map((field) => (
                <button
                  key={field}
                  onClick={() => onUpdateRenderDebug({ cityFieldMode: field, cityFieldOverlay: true })}
                  className={`rounded-md border px-2.5 py-1.5 text-[11px] font-medium transition-all ${
                    renderDebug.cityFieldMode === field
                      ? 'border-amber-600/30 bg-amber-600/18 text-amber-300'
                      : 'border-white/[0.08] bg-white/[0.03] text-slate-400 hover:bg-white/[0.06] hover:text-slate-200'
                  }`}
                >
                  {CITY_FIELD_LABELS[field]}
                </button>
              ))}
            </div>
          </div>
        </div>
      </SettingsSection>

      {/* World Size */}
      <SettingsSection title="World Size" description="Controls the size of the generated world. Current map will regenerate.">
        <div className="flex gap-2">
          {worldSizeEntries.map(([label, value]) => (
            <button
              key={label}
              onClick={() => onSetWorldSize(value)}
              className={`flex-1 py-2 px-2 rounded-lg text-xs font-medium transition-all border
                ${worldSize === value
                  ? 'bg-amber-600/20 border-amber-600/40 text-amber-300'
                  : 'bg-white/[0.03] border-white/[0.06] text-slate-500 hover:text-slate-300 hover:bg-white/[0.06]'
                }`}
            >
              {label}
            </button>
          ))}
        </div>
      </SettingsSection>

      {/* Solo port mode indicator */}
      {devSoloPort && (
        <div className="bg-amber-600/10 border border-amber-600/20 rounded-lg p-3 flex items-center justify-between">
          <div>
            <span className="text-amber-300 text-xs font-bold uppercase tracking-wider">Solo Mode</span>
            <span className="text-slate-400 text-xs ml-2">
              Viewing: {CORE_PORTS.find(p => p.id === devSoloPort)?.name ?? devSoloPort}
            </span>
          </div>
          <button
            onClick={onClearSolo}
            className="text-xs text-slate-400 hover:text-white px-3 py-1.5 rounded-lg
              bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] transition-all"
          >
            Back to Full World
          </button>
        </div>
      )}

      {/* Port Catalog */}
      <SettingsSection title="Port Archetypes" description="Load a single port to preview its geographic archetype. Click any port to generate its map.">
        <div className="grid grid-cols-2 gap-2 max-h-[280px] overflow-y-auto pr-1">
          {CORE_PORTS.map(port => (
            <button
              key={port.id}
              onClick={() => onLoadPort(port.id)}
              className={`text-left p-2.5 rounded-lg border transition-all group
                ${devSoloPort === port.id
                  ? 'bg-amber-600/15 border-amber-600/30'
                  : 'bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.05] hover:border-white/[0.12]'
                }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm">{GEO_ICONS[port.geography] ?? '📍'}</span>
                <span className="text-[12px] font-semibold text-slate-300 group-hover:text-white transition-colors">
                  {port.name}
                </span>
              </div>
              <div className="flex items-center gap-2 text-[10px]">
                <span className={`${CLIMATE_COLORS[port.climate] ?? 'text-slate-400'} font-medium`}>
                  {port.climate}
                </span>
                <span className="text-slate-600">·</span>
                <span className="text-slate-500">{port.geography.replace('_', ' ')}</span>
              </div>
              <p className="text-[9px] text-slate-600 mt-1 leading-relaxed line-clamp-2">
                {port.description}
              </p>
            </button>
          ))}
        </div>
      </SettingsSection>
    </div>
  );
}

function AboutTab() {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-2xl text-amber-400 mb-2" style={{ fontFamily: '"Fraunces", serif', fontWeight: 600 }}>
          Spice Voyager: <span className="text-amber-300/80">1612</span>
        </h3>
        <p className="text-slate-400 text-sm leading-relaxed">
          A sailing and trading game set in the Indian Ocean, 1612 AD.
          Chart your course between distant ports, trade exotic spices and silk,
          and build your fortune in the age of exploration.
        </p>
      </div>
      <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-4 space-y-2">
        <InfoRow label="Version" value="0.1.0" />
        <InfoRow label="Engine" value="Three.js + React" />
        <InfoRow label="Terrain" value="Procedural (Simplex Noise)" />
      </div>
    </div>
  );
}

function VolumeSlider({ icon, label, description, value, onChange, onAfterChange }: {
  icon: React.ReactNode;
  label: string;
  description: string;
  value: number;
  onChange: (v: number) => void;
  onAfterChange?: () => void;
}) {
  const pct = Math.round(value * 100);
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-8 h-8 rounded-full bg-white/[0.04] border border-white/[0.08] flex items-center justify-center shrink-0">
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-[12px] font-semibold text-slate-300">{label}</div>
          <div className="text-[10px] text-slate-500">{description}</div>
        </div>
        <span className="ml-auto text-[11px] font-mono text-slate-400 tabular-nums w-8 text-right">{pct}</span>
      </div>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={0}
          max={100}
          value={pct}
          onChange={(e) => onChange(Number(e.target.value) / 100)}
          onMouseUp={onAfterChange}
          onTouchEnd={onAfterChange}
          className="flex-1 h-1.5 appearance-none rounded-full bg-white/[0.08] cursor-pointer
            [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5
            [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-amber-400
            [&::-webkit-slider-thumb]:shadow-[0_0_6px_rgba(217,169,56,0.4)]
            [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-amber-500/60
            [&::-webkit-slider-thumb]:transition-all [&::-webkit-slider-thumb]:hover:scale-110
            [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:h-3.5
            [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-amber-400
            [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-amber-500/60"
          style={{
            background: `linear-gradient(to right, rgba(217,169,56,0.4) ${pct}%, rgba(255,255,255,0.08) ${pct}%)`,
          }}
        />
      </div>
    </div>
  );
}

function DisplayTab({ renderDebug, onUpdateRenderDebug }: {
  renderDebug: RenderDebugSettings;
  onUpdateRenderDebug: (patch: Partial<RenderDebugSettings>) => void;
}) {
  return (
    <div className="space-y-6">
      <SettingsSection title="Map Markers" description="Small visual cues overlaid on the 3D port maps to help spot important buildings at a glance.">
        <div className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 py-3">
          <div>
            <div className="text-xs font-semibold text-slate-300">Beacons</div>
            <div className="text-[11px] text-slate-500">Floating religious plumb bobs and cyan POI pillars on the 3D port map.</div>
          </div>
          <button
            onClick={() => {
              sfxClick();
              const next = !(renderDebug.sacredMarkers || renderDebug.poiBeacons);
              onUpdateRenderDebug({ sacredMarkers: next, poiBeacons: next });
            }}
            className={`rounded-lg px-3 py-2 text-xs font-medium transition-all border ${
              renderDebug.sacredMarkers || renderDebug.poiBeacons
                ? 'bg-emerald-600/20 border-emerald-600/30 text-emerald-300'
                : 'bg-white/[0.03] border-white/[0.08] text-slate-400 hover:text-slate-200 hover:bg-white/[0.06]'
            }`}
          >
            {renderDebug.sacredMarkers || renderDebug.poiBeacons ? 'On' : 'Off'}
          </button>
        </div>
      </SettingsSection>
    </div>
  );
}

function AudioTab() {
  const [musicVol, setMusicVol] = useState(() => audioManager.getMusicVolume());
  const [ambientVol, setAmbientVol] = useState(() => ambientEngine.getVolume());
  const [uiVol, setUiVol] = useState(() => getSfxVolume());

  return (
    <div className="space-y-8">
      <SettingsSection title="Volume" description="Adjust individual volume levels. Changes apply immediately.">
        <div className="space-y-3">
          <VolumeSlider
            icon={<Music size={14} className="text-amber-400/80" />}
            label="Music"
            description="Background music and ambient tracks"
            value={musicVol}
            onChange={(v) => { setMusicVol(v); audioManager.setMusicVolume(v); }}
          />
          <VolumeSlider
            icon={<Waves size={14} className="text-cyan-400/80" />}
            label="Ambient"
            description="Ocean waves, wind, and port atmosphere"
            value={ambientVol}
            onChange={(v) => { setAmbientVol(v); ambientEngine.setVolume(v); }}
          />
          <VolumeSlider
            icon={<MousePointerClick size={14} className="text-slate-400" />}
            label="UI Sounds"
            description="Button clicks, menu sounds, and notifications"
            value={uiVol}
            onChange={(v) => { setUiVol(v); setSfxVolume(v); }}
            onAfterChange={() => sfxClick()}
          />
        </div>
      </SettingsSection>
    </div>
  );
}

function PlaceholderTab({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-12 h-12 rounded-full bg-white/[0.04] border border-white/[0.06] flex items-center justify-center mb-4">
        <Gamepad2 size={20} className="text-slate-600" />
      </div>
      <h3 className="text-slate-400 font-medium mb-1" style={{ fontFamily: '"DM Sans", sans-serif' }}>{title}</h3>
      <p className="text-slate-600 text-sm max-w-xs">
        {description}
      </p>
    </div>
  );
}

function SettingsSection({ title, description, children }: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="text-[13px] font-bold text-slate-300 mb-0.5" style={{ fontFamily: '"DM Sans", sans-serif' }}>{title}</h3>
      <p className="text-[11px] text-slate-500 mb-3 leading-relaxed">{description}</p>
      {children}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="text-slate-300 font-mono text-xs">{value}</span>
    </div>
  );
}
