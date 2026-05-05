import { deserializeGeometry } from './geometrySerialization';
import { generateWorldData, registerGeneratedWorldRuntime, type GenerateWorldDataArgs, type GeneratedWorldData } from './worldGeneration';
import type { WorldGenerationWorkerResponse } from './worldGenerationWorker';
import { logWorldLoadTimings, nowMs, type WorldLoadTiming } from './worldLoadTimings';

let requestId = 0;
const cache = new Map<string, Promise<GeneratedWorldData>>();

function keyForArgs(args: GenerateWorldDataArgs): string {
  return JSON.stringify({
    worldSeed: args.worldSeed,
    worldSize: args.worldSize,
    devSoloPort: args.devSoloPort,
    currentWorldPortId: args.currentWorldPortId,
    waterPaletteId: args.waterPaletteId,
  });
}

function hydrateWorkerWorldData(response: WorldGenerationWorkerResponse & { ok: true }): GeneratedWorldData {
  return {
    ...response.data,
    landTerrainGeometry: deserializeGeometry(response.data.landTerrainGeometry),
    cliffFaceGeometry: deserializeGeometry(response.data.cliffFaceGeometry),
    backgroundRingTerrainGeometry: deserializeGeometry(response.data.backgroundRingTerrainGeometry),
  };
}

function generateOnMainThread(args: GenerateWorldDataArgs, label: string): GeneratedWorldData {
  const timings: WorldLoadTiming[] = [];
  const data = generateWorldData({ ...args, onTiming: (timing) => timings.push(timing) });
  logWorldLoadTimings(label, timings);
  return data;
}

function generateInWorker(args: GenerateWorldDataArgs): Promise<GeneratedWorldData> {
  if (typeof Worker === 'undefined') {
    return Promise.resolve(generateOnMainThread(args, 'main-thread'));
  }

  return new Promise((resolve) => {
    const id = ++requestId;
    const worker = new Worker(new URL('./worldGenerationWorker.ts', import.meta.url), { type: 'module' });
    const startedAt = nowMs();

    const fallback = (label: string, reason: unknown) => {
      console.warn(`[world-load] ${label}; falling back to main thread`, reason);
      worker.terminate();
      resolve(generateOnMainThread(args, 'main-thread-fallback'));
    };

    worker.onmessage = (event: MessageEvent<WorldGenerationWorkerResponse>) => {
      const response = event.data;
      if (response.id !== id) return;
      if (response.ok === false) {
        fallback('worker failed', response.error);
        return;
      }
      const hydrateStart = nowMs();
      const hydrated = hydrateWorkerWorldData(response);
      const timings = [
        ...response.timings,
        { phase: 'worker-transfer-and-hydrate', ms: nowMs() - hydrateStart },
        { phase: 'wall-total', ms: nowMs() - startedAt },
      ];
      logWorldLoadTimings('worker', timings);
      worker.terminate();
      resolve(hydrated);
    };

    worker.onerror = (event) => fallback('worker error', event.message);
    worker.postMessage({ id, args });
  });
}

export function preloadGeneratedWorldData(args: GenerateWorldDataArgs): Promise<GeneratedWorldData> {
  const key = keyForArgs(args);
  const cached = cache.get(key);
  if (cached) return cached;
  const promise = generateInWorker(args).catch((err) => {
    cache.delete(key);
    throw err;
  });
  cache.set(key, promise);
  return promise;
}

export async function loadGeneratedWorldData(args: GenerateWorldDataArgs): Promise<GeneratedWorldData> {
  const data = await preloadGeneratedWorldData(args);
  registerGeneratedWorldRuntime(args, data);
  return data;
}
