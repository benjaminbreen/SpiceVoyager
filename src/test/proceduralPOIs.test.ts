import { describe, expect, it } from 'vitest';
import { generateProceduralPOIsForPort } from '../utils/proceduralPOIs';
import { POI_MEDALLION_KEYS } from '../utils/poiMedallions';

const basePort = {
  id: 'test-port',
  name: 'Test Port',
  scale: 'Very Large' as const,
  position: [0, 0.5, 0] as [number, number, number],
  buildings: [],
  portDef: { climate: 'tropical' as const, geography: 'bay' as const },
  inventory: {
    'Black Pepper': 10,
    Tobacco: 10,
    Indigo: 10,
    Sugar: 10,
    Pearls: 10,
  },
};

describe('proceduralPOIs', () => {
  it('is deterministic for a seed and port input', () => {
    const a = generateProceduralPOIsForPort(basePort, 1612).pois;
    const b = generateProceduralPOIsForPort(basePort, 1612).pois;

    expect(a.map((poi) => ({
      id: poi.id,
      kind: poi.kind,
      variant: poi.poiVariant,
      medallionKey: poi.medallionKey,
      location: poi.location,
    }))).toEqual(b.map((poi) => ({
      id: poi.id,
      kind: poi.kind,
      variant: poi.poiVariant,
      medallionKey: poi.medallionKey,
      location: poi.location,
    })));
  });

  it('stays within the scale cap and produces valid generated POIs', () => {
    const pois = generateProceduralPOIsForPort(basePort, 1612).pois;

    expect(pois.length).toBeLessThanOrEqual(2);
    for (const poi of pois) {
      expect(poi.generated).toBe(true);
      expect(poi.hasKeeper).toBe(false);
      expect(poi.port).toBe(basePort.id);
      expect(poi.location.kind).toBe('hinterland');
      expect(poi.medallionKey && POI_MEDALLION_KEYS.includes(poi.medallionKey)).toBe(true);
    }
  });

  it('does not generate duplicate ids for a port', () => {
    const pois = generateProceduralPOIsForPort(basePort, 42).pois;
    expect(new Set(pois.map((poi) => poi.id)).size).toBe(pois.length);
  });
});

