import { describe, expect, it, vi } from 'vitest';
import { rollCrewRelationshipEvent, type CrewRelation, type CrewRelationshipStatus } from '../utils/crewRelations';
import type { CrewMember } from '../store/gameStore';

function crew(overrides: Partial<CrewMember>): CrewMember {
  return {
    id: 'crew-a',
    name: 'Test Crew',
    role: 'Sailor',
    skill: 50,
    morale: 60,
    age: 28,
    nationality: 'English',
    languages: ['English'],
    birthplace: 'London',
    health: 'healthy',
    quality: 'passable',
    stats: { strength: 10, perception: 10, charisma: 10, luck: 10 },
    humours: { sanguine: 5, choleric: 5, melancholic: 5, phlegmatic: 5, curiosity: 5 },
    backstory: '',
    history: [],
    hireDay: 1,
    traits: [],
    abilities: [],
    level: 1,
    xp: 0,
    xpToNext: 100,
    hearts: { current: 3, max: 3 },
    ...overrides,
  };
}

describe('crewRelations', () => {
  it('prunes relations and statuses for crew no longer aboard', () => {
    const activeA = crew({ id: 'a', name: 'Thomas', nationality: 'English', birthplace: 'London' });
    const activeB = crew({ id: 'b', name: 'Mansur', nationality: 'Malay', birthplace: 'Malacca' });
    const departed = crew({ id: 'dead', name: 'Gone', nationality: 'Portuguese', birthplace: 'Goa' });
    const relations: CrewRelation[] = [
      { id: 'a:b', aId: 'a', bId: 'b', affinity: 10, tension: 20, tags: [], lastEventDay: 2 },
      { id: 'a:dead', aId: 'a', bId: departed.id, affinity: -10, tension: 80, tags: ['rations'], lastEventDay: 2 },
    ];
    const statuses: CrewRelationshipStatus[] = [
      { id: 'live', crewId: 'a', otherCrewId: 'b', text: 'Trusts Mansur', tone: 'bond', severity: 20, createdDay: 2, expiresDay: 20 },
      { id: 'stale', crewId: 'a', otherCrewId: departed.id, text: 'Feuding with Gone', tone: 'tension', severity: 80, createdDay: 2, expiresDay: 20 },
    ];

    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const result = rollCrewRelationshipEvent([activeA, activeB], relations, statuses, {
      dayCount: 3,
      provisions: 30,
      trigger: 'daily',
    });
    vi.restoreAllMocks();

    expect(result.relations.map(r => r.id)).toEqual(['a:b']);
    expect(result.statuses.map(s => s.id)).toEqual(['live']);
  });

  it('creates ration tension when scarcity forces an event', () => {
    const activeA = crew({ id: 'a', name: 'Thomas', morale: 25 });
    const activeB = crew({ id: 'b', name: 'Mansur', nationality: 'Malay', birthplace: 'Malacca', morale: 28 });

    vi.spyOn(Math, 'random').mockReturnValue(0.01);
    const result = rollCrewRelationshipEvent([activeA, activeB], [], [], {
      dayCount: 5,
      provisions: 0,
      starving: true,
      trigger: 'daily',
    });
    vi.restoreAllMocks();

    expect(result.relations).toHaveLength(1);
    expect(result.relations[0].tags).toContain('rations');
    expect(result.statuses.some(status => status.text.includes('rations'))).toBe(true);
  });
});
