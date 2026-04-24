import { ambientEngine } from '../audio/AmbientEngine';
import { audioManager } from '../audio/AudioManager';
import { type PerformanceStats, PERFORMANCE_STATS_EVENT } from '../utils/performanceStats';
import { useGameStore } from '../store/gameStore';

interface TestModeConfig {
  enabled: boolean;
  muteAudio: boolean;
  skipOpening: boolean;
  showPerformance: boolean;
  worldSeed: number | null;
  portId: string | null;
  timeOfDay: number | null;
  forceMobileLayout: boolean | null;
}

interface TestModeSnapshot {
  worldSeed: number;
  currentWorldPortId: string | null;
  timeOfDay: number;
  portsReady: number;
  playerMode: 'ship' | 'walking';
}

interface TestHarnessApi {
  config: TestModeConfig;
  getSnapshot: () => TestModeSnapshot;
  getState: () => ReturnType<typeof useGameStore.getState>;
  setState: typeof useGameStore.setState;
  getPerformanceStats: () => PerformanceStats | null;
}

declare global {
  interface Window {
    __SPICE_VOYAGER_TEST__?: TestHarnessApi;
  }
}

const DISABLED_CONFIG: TestModeConfig = {
  enabled: false,
  muteAudio: false,
  skipOpening: false,
  showPerformance: false,
  worldSeed: null,
  portId: null,
  timeOfDay: null,
  forceMobileLayout: null,
};

let cachedSearch = '';
let cachedConfig = DISABLED_CONFIG;
let latestPerformanceStats: PerformanceStats | null = null;

function parseBoolean(value: string | null, fallback: boolean): boolean {
  if (value == null) return fallback;
  return value !== '0' && value !== 'false';
}

function parseNumber(value: string | null): number | null {
  if (value == null || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function getTestModeConfig(): TestModeConfig {
  if (typeof window === 'undefined') return DISABLED_CONFIG;
  const search = window.location.search;
  if (search === cachedSearch) return cachedConfig;

  cachedSearch = search;
  const params = new URLSearchParams(search);
  const enabled = parseBoolean(params.get('testMode'), false);
  if (!enabled) {
    cachedConfig = DISABLED_CONFIG;
    return cachedConfig;
  }

  cachedConfig = {
    enabled: true,
    muteAudio: parseBoolean(params.get('muteAudio'), true),
    skipOpening: parseBoolean(params.get('skipOpening'), true),
    showPerformance: parseBoolean(params.get('showPerformance'), false),
    worldSeed: parseNumber(params.get('seed')),
    portId: params.get('port'),
    timeOfDay: parseNumber(params.get('time')),
    forceMobileLayout: params.has('mobile') ? parseBoolean(params.get('mobile'), false) : null,
  };

  return cachedConfig;
}

function getSnapshot(): TestModeSnapshot {
  const state = useGameStore.getState();
  return {
    worldSeed: state.worldSeed,
    currentWorldPortId: state.currentWorldPortId,
    timeOfDay: state.timeOfDay,
    portsReady: state.ports.length,
    playerMode: state.playerMode,
  };
}

export function installTestMode() {
  if (typeof window === 'undefined') return;
  const config = getTestModeConfig();
  if (!config.enabled) return;

  if (config.muteAudio) {
    audioManager.stopAll();
    audioManager.setMusicVolume(0);
    ambientEngine.setVolume(0);
  }

  useGameStore.setState((state) => ({
    worldSeed: config.worldSeed ?? state.worldSeed,
    currentWorldPortId: config.portId ?? state.currentWorldPortId,
    timeOfDay: config.timeOfDay ?? state.timeOfDay,
    forceMobileLayout: config.forceMobileLayout ?? state.forceMobileLayout,
  }));

  document.documentElement.dataset.testMode = 'true';
  window.__SPICE_VOYAGER_TEST__ = {
    config,
    getSnapshot,
    getState: () => useGameStore.getState(),
    setState: useGameStore.setState,
    getPerformanceStats: () => latestPerformanceStats,
  };

  window.addEventListener(PERFORMANCE_STATS_EVENT, ((event: CustomEvent<PerformanceStats>) => {
    latestPerformanceStats = event.detail;
  }) as EventListener);
}
