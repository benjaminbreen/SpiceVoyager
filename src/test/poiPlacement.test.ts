import { describe, expect, it } from 'vitest';
import { PORT_CULTURAL_REGION, PORT_FACTION } from '../store/gameStore';
import { generateCity } from '../utils/cityGenerator';
import { POI_DEFINITIONS } from '../utils/poiDefinitions';
import { palaceStyleForPort } from '../utils/palaceStyles';
import { CORE_PORTS } from '../utils/portArchetypes';
import { faithsForPort } from '../utils/portReligions';
import { clearSnappedCache, getPOIFootprint, isPOIOnLand, resolveSnappedPOI } from '../utils/proximityResolution';
import { reseedTerrain, setMeshHalf, setPlacedArchetypes } from '../utils/terrain';

describe('POI placement', () => {
  it.each([
    ['lisbon', 'lisbon-casa-da-india'],
    ['seville', 'seville-casa-contratacion'],
    ['manila', 'manila-sangley-parian'],
  ])('keeps %s bespoke POI on visible land', (portId, poiId) => {
    const portDef = CORE_PORTS.find((port) => port.id === portId);
    const poi = POI_DEFINITIONS.find((candidate) => candidate.id === poiId);

    expect(portDef).toBeDefined();
    expect(poi).toBeDefined();
    if (!portDef || !poi) return;

    reseedTerrain(1612);
    setMeshHalf(450);
    setPlacedArchetypes([{ def: portDef, cx: 0, cz: 0 }]);
    clearSnappedCache();
    const placed = resolveSnappedPOI(poi, { id: portId, buildings: [] });

    expect(placed).not.toBeNull();
    expect(isPOIOnLand(placed!.x, placed!.z, getPOIFootprint(poi.kind))).toBe(true);
  });

  it('keeps Seville procedural buildings out of the Casa de la Contratacion compound', () => {
    const portDef = CORE_PORTS.find((port) => port.id === 'seville');
    const poi = POI_DEFINITIONS.find((candidate) => candidate.id === 'seville-casa-contratacion');

    expect(portDef).toBeDefined();
    expect(poi).toBeDefined();
    if (!portDef || !poi || poi.location.kind !== 'coords') return;

    reseedTerrain(1612);
    setMeshHalf(450);
    setPlacedArchetypes([{ def: portDef, cx: 0, cz: 0 }]);

    const city = generateCity(
      0,
      0,
      portDef.scale,
      portDef.culture,
      1612,
      portDef.name,
      PORT_FACTION[portDef.id],
      PORT_CULTURAL_REGION[portDef.id],
      portDef.bridgeCount ?? 0,
      undefined,
      portDef.landmark,
      faithsForPort(portDef.id),
      palaceStyleForPort(portDef.id),
      [poi],
    );

    const [poiX, poiZ] = poi.location.position;
    const reservedHalfWidth = (getPOIFootprint(poi.kind) + 16) / 2;
    const overlapping = city.buildings.filter((building) => {
      const buildingHalfWidth = building.scale[0] / 2;
      const buildingHalfDepth = building.scale[2] / 2;
      return Math.abs(building.position[0] - poiX) <= reservedHalfWidth + buildingHalfWidth
        && Math.abs(building.position[2] - poiZ) <= reservedHalfWidth + buildingHalfDepth;
    });

    expect(overlapping.map((building) => building.id)).toEqual([]);
  }, 15_000);
});
