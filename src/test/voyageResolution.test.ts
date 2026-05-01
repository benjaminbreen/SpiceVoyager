import { describe, expect, it } from 'vitest';
import type { CrewMember, ShipStats } from '../store/gameStore';
import { resolveVoyage } from '../utils/voyageResolution';

function crewMember(role: CrewMember['role'], skill = 10): CrewMember {
  return {
    id: role,
    name: role,
    role,
    skill,
    morale: 50,
    age: 30,
    nationality: 'Portuguese',
    languages: [],
    birthplace: 'Goa',
    health: 'healthy',
    quality: 'able',
    stats: { strength: 10, perception: 10, charisma: 10, luck: 10 },
    humours: { sanguine: 0, choleric: 0, melancholic: 0, phlegmatic: 0, curiosity: 0 },
    backstory: '',
    history: [],
    hireDay: 1,
    traits: [],
    abilities: [],
    level: 1,
    xp: 0,
    xpToNext: 10,
    hearts: { current: 3, max: 3 },
  };
}

const stats: ShipStats = {
  hull: 80,
  maxHull: 100,
  sails: 100,
  maxSails: 100,
  speed: 10,
  turnSpeed: 1,
  windward: 0.7,
  draft: 'medium',
  maxCrew: 20,
  cargoCapacity: 60,
  cannons: 0,
  armament: ['swivelGun'],
};

describe('voyageResolution', () => {
  it('makes press faster and cautious slower than the standard passage', () => {
    const base = {
      fromPortId: 'goa',
      toPortId: 'malacca',
      crew: [crewMember('Captain'), crewMember('Navigator', 12), crewMember('Sailor')],
      stats,
      provisions: 80,
      dayCount: 12,
      weatherIntensity: 0,
      windSpeed: 0.5,
    };

    const press = resolveVoyage({ ...base, stance: 'press' });
    const standard = resolveVoyage({ ...base, stance: 'standard' });
    const cautious = resolveVoyage({ ...base, stance: 'cautious' });

    expect(press.actualDays).toBeLessThanOrEqual(standard.actualDays);
    expect(cautious.actualDays).toBeGreaterThanOrEqual(standard.actualDays);
    expect(press.events[0]?.title).toBe('Press Sail');
    expect(cautious.events[0]?.title).toBe('Stand Off & Sound');
  });

  it('reports short rations when provisions cannot cover the passage', () => {
    const result = resolveVoyage({
      fromPortId: 'london',
      toPortId: 'jamestown',
      stance: 'standard',
      crew: [crewMember('Captain'), crewMember('Sailor'), crewMember('Sailor'), crewMember('Sailor')],
      stats,
      provisions: 1,
      dayCount: 4,
      weatherIntensity: 0,
      windSpeed: 0.5,
    });

    expect(result.provisionCost).toBeGreaterThan(1);
    expect(result.moraleDelta).toBeLessThan(0);
    expect(result.events.some((event) => event.title === 'Short Rations')).toBe(true);
  });
});
