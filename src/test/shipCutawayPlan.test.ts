import { describe, expect, it } from 'vitest';
import { buildCutawayPlan, type RendererShipType } from '../utils/shipRenderer';

const SHIP_TYPES: RendererShipType[] = [
  'carrack',
  'galleon',
  'dhow',
  'junk',
  'pinnace',
  'fluyt',
  'xebec',
  'baghla',
  'merchant_cog',
];

function testConfig(shipType: RendererShipType, width = 150, height = 74) {
  return {
    shipType,
    width,
    height,
    wind: 1,
    damage: { bow: 0, mid: 0, stern: 0, foreMast: 0, mainMast: 0, aftMast: 0, sails: 0 },
  };
}

describe('ship cutaway render plan', () => {
  it('keeps authored rooms from overlapping in dashboard-scale renders', () => {
    for (const shipType of SHIP_TYPES) {
      const plan = buildCutawayPlan(testConfig(shipType));

      for (let i = 0; i < plan.rooms.length; i++) {
        for (let j = i + 1; j < plan.rooms.length; j++) {
          const a = plan.rooms[i];
          const b = plan.rooms[j];
          const overlapX = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0));
          const overlapY = Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
          expect(overlapX * overlapY, `${shipType}: ${a.kind} overlaps ${b.kind}`).toBe(0);
        }
      }
    }
  });

  it('places labels and walk lanes inside the cutaway bounds', () => {
    for (const shipType of SHIP_TYPES) {
      const plan = buildCutawayPlan(testConfig(shipType, 100, 64));

      for (const room of plan.rooms) {
        expect(room.x1, `${shipType}: ${room.kind} has invalid width`).toBeGreaterThan(room.x0);
        expect(room.y1, `${shipType}: ${room.kind} has invalid height`).toBeGreaterThan(room.y0);
        if (room.displayLabel) {
          expect(room.labelX).toBeGreaterThanOrEqual(room.x0);
          expect(room.labelX + room.displayLabel.length).toBeLessThanOrEqual(room.x1);
          expect(room.labelY).toBeGreaterThanOrEqual(room.y0);
          expect(room.labelY).toBeLessThanOrEqual(room.y1);
        }
      }

      for (const lane of plan.lanes) {
        expect(lane.x1).toBeGreaterThan(lane.x0);
        expect(lane.y).toBeGreaterThanOrEqual(0);
        expect(lane.y).toBeLessThan(plan.scene.height);
      }
    }
  });
});
