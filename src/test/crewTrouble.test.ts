import { describe, expect, it, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { CREW_TROUBLE_ARCHETYPES, maybeCreateCrewTroubleEvent } from '../utils/crewTrouble';
import { CREW_TROUBLE_MEDALLION_KEYS } from '../utils/crewTroubleMedallions';
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

describe('crewTrouble', () => {
  it('defines the full sixteen archetypes', () => {
    expect(Object.keys(CREW_TROUBLE_ARCHETYPES)).toHaveLength(16);
  });

  it('has a sliced medallion asset for every crew trouble medallion key', () => {
    for (const key of CREW_TROUBLE_MEDALLION_KEYS) {
      expect(existsSync(resolve(process.cwd(), `public/crew-trouble-medallions/${key}.png`)), key).toBe(true);
    }
  });

  it('maps every archetype to an existing crew trouble medallion key', () => {
    for (const archetype of Object.values(CREW_TROUBLE_ARCHETYPES)) {
      expect(CREW_TROUBLE_MEDALLION_KEYS).toContain(archetype.medallionId);
    }
  });

  it('creates a fever event for a fevered crew member outside cooldown', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1);
    const event = maybeCreateCrewTroubleEvent({
      crew: [crew({ id: 'a', name: 'Thomas', health: 'fevered' }), crew({ id: 'b', name: 'Mansur' })],
      relations: [],
      statuses: [],
      dayCount: 20,
      provisions: 30,
      gold: 40,
      trigger: 'daily',
      lastTroubleDay: 0,
      crewTroubleCooldowns: {},
    });
    vi.restoreAllMocks();

    expect(event?.archetype).toBe('fever-below-deck');
    expect(event?.choices).toHaveLength(4);
  });

  it('respects global trouble cooldown for non-combat events', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1);
    const event = maybeCreateCrewTroubleEvent({
      crew: [crew({ id: 'a', name: 'Thomas', health: 'fevered' }), crew({ id: 'b', name: 'Mansur' })],
      relations: [],
      statuses: [],
      dayCount: 20,
      provisions: 30,
      gold: 40,
      trigger: 'daily',
      lastTroubleDay: 19,
      crewTroubleCooldowns: {},
    });
    vi.restoreAllMocks();

    expect(event).toBeNull();
  });
});
