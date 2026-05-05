import { serializeGeometry, transferGeometryBuffers, type SerializedGeometry } from './geometrySerialization';
import { generateWorldData, type GenerateWorldDataArgs, type GeneratedWorldData } from './worldGeneration';
import type { WorldLoadTiming } from './worldLoadTimings';

type WorkerRequest = {
  id: number;
  args: Omit<GenerateWorldDataArgs, 'onTiming'>;
};

export type SerializedGeneratedWorldData =
  Omit<GeneratedWorldData, 'landTerrainGeometry' | 'cliffFaceGeometry' | 'backgroundRingTerrainGeometry'> & {
    landTerrainGeometry: SerializedGeometry;
    cliffFaceGeometry: SerializedGeometry;
    backgroundRingTerrainGeometry: SerializedGeometry;
  };

export type WorldGenerationWorkerResponse =
  | { id: number; ok: true; data: SerializedGeneratedWorldData; timings: WorldLoadTiming[] }
  | { id: number; ok: false; error: string };

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { id, args } = event.data;
  try {
    const timings: WorldLoadTiming[] = [];
    const data = generateWorldData({
      ...args,
      onTiming: (timing) => timings.push(timing),
    });
    const serialized: SerializedGeneratedWorldData = {
      ...data,
      landTerrainGeometry: serializeGeometry(data.landTerrainGeometry),
      cliffFaceGeometry: serializeGeometry(data.cliffFaceGeometry),
      backgroundRingTerrainGeometry: serializeGeometry(data.backgroundRingTerrainGeometry),
    };
    const transfers = [
      ...transferGeometryBuffers(serialized.landTerrainGeometry),
      ...transferGeometryBuffers(serialized.cliffFaceGeometry),
      ...transferGeometryBuffers(serialized.backgroundRingTerrainGeometry),
    ];
    (self as DedicatedWorkerGlobalScope).postMessage({ id, ok: true, data: serialized, timings }, transfers);
  } catch (err) {
    const error = err instanceof Error ? err.stack || err.message : String(err);
    (self as DedicatedWorkerGlobalScope).postMessage({ id, ok: false, error });
  }
};
