export interface WorldLoadTiming {
  phase: string;
  ms: number;
}

export type WorldLoadTimingSink = (timing: WorldLoadTiming) => void;

export function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

export function reportWorldLoadTiming(sink: WorldLoadTimingSink | undefined, phase: string, startedAt: number) {
  sink?.({ phase, ms: nowMs() - startedAt });
}

export function logWorldLoadTimings(label: string, timings: WorldLoadTiming[]) {
  if (timings.length === 0) return;
  const total = timings.reduce((sum, t) => sum + t.ms, 0);
  const summary = timings
    .map((t) => `${t.phase}=${t.ms.toFixed(1)}ms`)
    .join(' ');
  console.info(`[world-load] ${label} total=${total.toFixed(1)}ms ${summary}`);
}
