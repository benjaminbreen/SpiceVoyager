import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { POI_DEFINITIONS, type POIDefinition, type POIKind } from '../utils/poiDefinitions';
import { POI_MEDALLION_KEYS, poiMedallionAsset } from '../utils/poiMedallions';

const POI_KINDS: POIKind[] = [
  'naturalist',
  'garden',
  'shrine',
  'ruin',
  'wreck',
  'smugglers_cove',
  'caravanserai',
  'natural',
];

function stubPOI(kind: POIKind): POIDefinition {
  return {
    id: `test-${kind}`,
    name: kind,
    kind,
    class: kind === 'shrine' ? 'religious' : 'learned',
    port: 'goa',
    location: { kind: 'hinterland', position: [0, 0] },
    knowledgeDomain: [],
    masteryGoods: [],
    cost: { type: 'gold', amount: 0 },
    npcName: 'Test Keeper',
    npcRole: 'keeper',
    lore: 'Test POI.',
  };
}

describe('poi medallions', () => {
  it('has a real PNG for every declared medallion key', () => {
    for (const key of POI_MEDALLION_KEYS) {
      expect(existsSync(`public/poi-medallions/${key}.png`), key).toBe(true);
    }
  });

  it('resolves every authored POI to an existing medallion asset', () => {
    for (const poi of POI_DEFINITIONS) {
      const asset = poiMedallionAsset(poi);
      expect(POI_MEDALLION_KEYS).toContain(asset.key);
      expect(existsSync(`public${asset.path}`), poi.id).toBe(true);
    }
  });

  it('has a fallback medallion for every POI kind', () => {
    for (const kind of POI_KINDS) {
      const asset = poiMedallionAsset(stubPOI(kind));
      expect(POI_MEDALLION_KEYS).toContain(asset.key);
      expect(existsSync(`public${asset.path}`), kind).toBe(true);
    }
  });
});

