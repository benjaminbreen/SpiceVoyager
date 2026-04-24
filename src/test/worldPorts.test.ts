import { describe, expect, it } from 'vitest';
import { canDirectlySail, estimateSeaTravel, getSeededWorldPortId, resolveCampaignPortId } from '../utils/worldPorts';

describe('worldPorts', () => {
  it('respects explicit campaign port overrides before falling back to seed', () => {
    expect(resolveCampaignPortId({ worldSeed: 1612, devSoloPort: 'goa', currentWorldPortId: 'surat' })).toBe('goa');
    expect(resolveCampaignPortId({ worldSeed: 1612, devSoloPort: null, currentWorldPortId: 'surat' })).toBe('surat');
    expect(resolveCampaignPortId({ worldSeed: 1612, devSoloPort: null, currentWorldPortId: null })).toBe(getSeededWorldPortId(1612));
  });

  it('keeps sea lanes and travel estimates coherent', () => {
    expect(canDirectlySail('london', 'jamestown')).toBe(true);
    expect(canDirectlySail('jamestown', 'goa')).toBe(false);

    const travel = estimateSeaTravel('lisbon', 'goa');
    expect(travel).not.toBeNull();
    expect(travel?.days).toBeGreaterThan(1);
    expect(['Low', 'Moderate', 'High']).toContain(travel?.risk);
    expect(travel?.distanceKm).toBeGreaterThan(1000);
  });
});
