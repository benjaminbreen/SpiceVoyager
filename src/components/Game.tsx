import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { UI } from './UI';
import { AmbientText } from './AmbientText';
import { TouchControls } from './TouchControls';
import { CrewDeathModal } from './CrewDeathModal';
import { GameOverScreen } from './GameOverScreen';
import { PERFORMANCE_STATS_EVENT, type PerformanceStats, setPerfEnabled } from '../utils/performanceStats';
import { getTestModeConfig } from '../test/testMode';
import { useGameStore } from '../store/gameStore';
import { useIsMobile } from '../utils/useIsMobile';

const GameScene = lazy(() => import('./GameScene').then((module) => ({
  default: module.GameScene,
})));

const ADAPTIVE_QUALITY_COOLDOWN_MS = 8000;
const ADAPTIVE_QUALITY_BAD_SAMPLES = 8;
const ADAPTIVE_QUALITY_MAX_LEVEL = 2;

const MOBILE_RENDER_PRESET = {
  shadows: true,
  postprocessing: false,
  bloom: false,
  vignette: false,
  advancedWater: true,
  shipWake: true,
  algae: true,
  wildlifeMotion: true,
} as const;

function installVisualViewportHeight() {
  const setAppHeight = () => {
    const height = window.visualViewport?.height ?? window.innerHeight;
    document.documentElement.style.setProperty('--app-height', `${height}px`);
  };

  setAppHeight();
  window.visualViewport?.addEventListener('resize', setAppHeight);
  window.visualViewport?.addEventListener('scroll', setAppHeight);
  window.addEventListener('resize', setAppHeight);

  return () => {
    window.visualViewport?.removeEventListener('resize', setAppHeight);
    window.visualViewport?.removeEventListener('scroll', setAppHeight);
    window.removeEventListener('resize', setAppHeight);
    document.documentElement.style.removeProperty('--app-height');
  };
}

export function Game() {
  const testMode = getTestModeConfig();
  const { isMobile } = useIsMobile();
  const [showPerformance, setShowPerformance] = useState(() => testMode.showPerformance);
  const [performanceStats, setPerformanceStats] = useState<PerformanceStats | null>(null);
  const [adaptiveDprCap, setAdaptiveDprCap] = useState(() => isMobile ? 1.25 : 1.5);
  const showPerformanceRef = useRef(testMode.showPerformance);
  const mobilePresetAppliedRef = useRef(false);
  const adaptiveLevelRef = useRef(isMobile ? 1 : 0);
  const badPerfSamplesRef = useRef(0);
  const lastAdaptiveChangeAtRef = useRef(0);

  useEffect(() => installVisualViewportHeight(), []);

  useEffect(() => {
    if (!isMobile || mobilePresetAppliedRef.current) return;
    mobilePresetAppliedRef.current = true;
    useGameStore.getState().updateRenderDebug(MOBILE_RENDER_PRESET);
    setAdaptiveDprCap(1.25);
    adaptiveLevelRef.current = Math.max(adaptiveLevelRef.current, 1);
  }, [isMobile]);

  useEffect(() => {
    setPerfEnabled(showPerformance);
  }, [showPerformance]);

  useEffect(() => {
    const applyAdaptiveStep = (level: number) => {
      if (level === 1) {
        setAdaptiveDprCap(1.35);
        return;
      }
      if (level === 2) {
        setAdaptiveDprCap(1.2);
        return;
      }
    };

    const maybeAdaptQuality = (stats: PerformanceStats) => {
      if (!useGameStore.getState().voyageBegun) return;

      const poorFramePacing =
        stats.fps < 38 ||
        stats.longFrames5s >= 18 ||
        stats.peakFrameMs5s >= 95;

      if (!poorFramePacing) {
        badPerfSamplesRef.current = 0;
        return;
      }

      badPerfSamplesRef.current++;
      if (badPerfSamplesRef.current < ADAPTIVE_QUALITY_BAD_SAMPLES) return;

      const now = performance.now();
      if (now - lastAdaptiveChangeAtRef.current < ADAPTIVE_QUALITY_COOLDOWN_MS) return;

      const nextLevel = Math.min(ADAPTIVE_QUALITY_MAX_LEVEL, adaptiveLevelRef.current + 1);
      if (nextLevel === adaptiveLevelRef.current) return;

      adaptiveLevelRef.current = nextLevel;
      lastAdaptiveChangeAtRef.current = now;
      badPerfSamplesRef.current = 0;
      applyAdaptiveStep(nextLevel);
    };

    const handleStats = (event: Event) => {
      const stats = (event as CustomEvent<PerformanceStats>).detail;
      maybeAdaptQuality(stats);
      if (showPerformanceRef.current) setPerformanceStats(stats);
    };
    window.addEventListener(PERFORMANCE_STATS_EVENT, handleStats);
    return () => window.removeEventListener(PERFORMANCE_STATS_EVENT, handleStats);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return;
      if (event.code === 'Backquote' || event.key === '`') {
        event.preventDefault();
        setShowPerformance((show) => {
          const next = !show;
          showPerformanceRef.current = next;
          return next;
        });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const transitionsDisabled = useGameStore((s) => s.renderDebug.disableTransitions);
  const voyageBegun = useGameStore((s) => s.voyageBegun);
  const [startupSceneReady, setStartupSceneReady] = useState(false);
  const markStartupSceneReady = useCallback(() => setStartupSceneReady(true), []);

  useEffect(() => {
    if (!voyageBegun) setStartupSceneReady(false);
  }, [voyageBegun]);

  return (
    <div
      data-testid="game-root"
      className="w-full bg-black overflow-hidden relative"
      // 100dvh — dynamic viewport height — tracks iOS Safari's URL bar
      // show/hide so the game doesn't get cropped when the bar appears.
      // --app-height is updated from visualViewport for Safari's bottom bar.
      style={{ height: 'var(--app-height)', transform: 'translateZ(0)' }}
    >
      {transitionsDisabled && (
        <style>{`* { transition: none !important; animation: none !important; }`}</style>
      )}
      {voyageBegun && (
        <Suspense fallback={null}>
          <GameScene dprCap={adaptiveDprCap} onWorldReady={markStartupSceneReady} />
        </Suspense>
      )}
      <UI startupSceneReady={startupSceneReady} />
      {voyageBegun && <AmbientText />}
      <TouchControls />
      <CrewDeathModal />
      <GameOverScreen />
      {showPerformance && <PerformanceOverlay stats={performanceStats} />}
    </div>
  );
}

function fmt(value: number, digits = 0) {
  return Number.isFinite(value) ? value.toFixed(digits) : '--';
}

function compact(value: number) {
  return Number.isFinite(value) ? value.toLocaleString() : '--';
}

function PerformanceOverlay({ stats }: { stats: PerformanceStats | null }) {
  return (
    <div
      data-testid="performance-overlay"
      className="fixed top-3 left-3 z-[10000] pointer-events-none select-none"
      style={{
        width: 260,
        padding: '10px 12px',
        border: '1px solid rgba(201,168,76,0.45)',
        borderRadius: 6,
        background: 'rgba(8, 7, 6, 0.88)',
        color: '#d8ccb0',
        fontFamily: '"SF Mono", "Fira Code", "Cascadia Code", "Consolas", monospace',
        fontSize: 11,
        lineHeight: 1.45,
        boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, color: '#c9a84c' }}>
        <span>PERFORMANCE</span>
        <span>`</span>
      </div>
      {!stats ? (
        <div style={{ color: '#9a9080' }}>Waiting for scene stats...</div>
      ) : (
        <>
          <Metric label="FPS" value={fmt(stats.fps)} />
          <Metric label="Frame avg/max" value={`${fmt(stats.avgFrameMs, 1)} / ${fmt(stats.maxFrameMs, 1)} ms`} />
          <Metric label="Peak frame (5s)" value={`${fmt(stats.peakFrameMs5s, 1)} ms`} />
          <Metric label="Long frames (5s)" value={compact(stats.longFrames5s)} />
          <Metric label="Collision avg/max" value={`${fmt(stats.collisionAvgMs, 2)} / ${fmt(stats.collisionMaxMs, 2)} ms`} />
          <Metric label="Collision/s" value={fmt(stats.collisionChecksPerSec, 0)} />
          <Metric label="Atmosphere rcmp/s" value={`${fmt(stats.atmosphereRecomputesPerSec, 1)} @ ${fmt(stats.atmosphereAvgMs, 2)}ms`} />
          <Metric label="Draw calls" value={compact(stats.drawCalls)} />
          <Metric label="Triangles" value={compact(stats.triangles)} />
          <Metric label="Lines / points" value={`${compact(stats.lines)} / ${compact(stats.points)}`} />
          <Metric label="Geometries" value={compact(stats.geometries)} />
          <Metric label="Textures" value={compact(stats.textures)} />
          <Metric label="DPR" value={fmt(stats.dpr, 2)} />
          <Metric label="NPC ships" value={compact(stats.npcShips)} />
          <Metric label="Projectiles" value={compact(stats.projectiles)} />
          <Metric label="Post / shad / water" value={`${yn(stats.postprocessing)} / ${yn(stats.shadows)} / ${yn(stats.advancedWater)}`} />
        </>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
      <span style={{ color: '#8f8778' }}>{label}</span>
      <span style={{ color: '#efe6c8', textAlign: 'right' }}>{value}</span>
    </div>
  );
}

function yn(value: boolean) {
  return value ? 'on' : 'off';
}
