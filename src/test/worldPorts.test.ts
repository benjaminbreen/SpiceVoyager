import { describe, expect, it } from 'vitest';
import { PORT_ARMORY } from '../store/armory';
import { PORT_FACTION } from '../store/registries';
import { PORT_UPGRADE_POOLS } from '../store/shipUpgrades';
import { PORT_TRADE_PROFILES } from '../utils/commodities';
import { canDirectlySail, estimateSeaTravel, getSeededWorldPortId, MARKET_TRUST, resolveCampaignPortId, WORLD_PORTS } from '../utils/worldPorts';

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

  it('keeps active port registries in sync', () => {
    const portIds = new Set(WORLD_PORTS.map(port => port.id));
    const marketPortIds = new Set(WORLD_PORTS.filter(port => port.id !== 'cape').map(port => port.id));

    const expectNoExtraKeys = (name: string, registry: Record<string, unknown>) => {
      const extraKeys = Object.keys(registry).filter(id => !portIds.has(id));
      expect(extraKeys, `${name} has entries for inactive ports`).toEqual([]);
    };

    const expectKeys = (name: string, registry: Record<string, unknown>, expected: Set<string>) => {
      expectNoExtraKeys(name, registry);
      const missingKeys = [...expected].filter(id => !(id in registry));
      expect(missingKeys, `${name} is missing active ports`).toEqual([]);
    };

    expectKeys('PORT_FACTION', PORT_FACTION, portIds);
    expectKeys('PORT_TRADE_PROFILES', PORT_TRADE_PROFILES, marketPortIds);
    expectKeys('MARKET_TRUST', MARKET_TRUST, marketPortIds);
    expectKeys('PORT_ARMORY', PORT_ARMORY, portIds);
    expectKeys('PORT_UPGRADE_POOLS', PORT_UPGRADE_POOLS, portIds);
  });
});
