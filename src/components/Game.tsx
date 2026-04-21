import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { UI } from './UI';
import { TouchControls } from './TouchControls';
import { CrewDeathModal } from './CrewDeathModal';
import { GameOverScreen } from './GameOverScreen';
import { PERFORMANCE_STATS_EVENT, type PerformanceStats } from '../utils/performanceStats';

const GameScene = lazy(() => import('./GameScene').then((module) => ({
  default: module.GameScene,
})));

export function Game() {
  const [showPerformance, setShowPerformance] = useState(false);
  const [performanceStats, setPerformanceStats] = useState<PerformanceStats | null>(null);
  const showPerformanceRef = useRef(false);

  useEffect(() => {
    const handleStats = (event: Event) => {
      if (!showPerformanceRef.current) return;
      setPerformanceStats((event as CustomEvent<PerformanceStats>).detail);
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

  return (
    <div className="w-full h-screen bg-black overflow-hidden relative">
      <Suspense fallback={null}>
        <GameScene />
      </Suspense>
      <UI />
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
