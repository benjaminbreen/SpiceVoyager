import { describe, expect, it } from 'vitest';
import { generateStartingKnowledge, getEffectiveKnowledge } from '../utils/knowledgeSystem';
import type { CrewMember } from '../store/gameStore';

function crewMember(overrides: Partial<CrewMember>): CrewMember {
  return {
    id: 'crew-1',
    name: 'Test Crew',
    nationality: 'Portuguese',
    role: 'Sailor',
    skill: 10,
    morale: 10,
    health: 'healthy',
    level: 1,
    xp: 0,
    xpToNext: 10,
    hearts: { current: 3, max: 3 },
    traits: [],
    abilities: [],
    languages: [],
    backstory: '',
    age: 30,
    birthplace: 'Goa',
    hireDay: 1,
    quality: 'able',
    humours: { sanguine: 0, choleric: 0, melancholic: 0, phlegmatic: 0, curiosity: 0 },
    stats: { strength: 10, perception: 10, charisma: 10, luck: 10 },
    history: [],
    ...overrides,
  };
}

describe('knowledgeSystem', () => {
  it('includes universal and nationality-based starting knowledge', () => {
    const knowledge = generateStartingKnowledge('Portuguese', []);

    expect(knowledge.Rice).toBe(1);
    expect(knowledge['Black Pepper']).toBe(1);
    expect(knowledge['Lapis de Goa']).toBe(1);
  });

  it('applies crew mastery over player ignorance', () => {
    const playerKnowledge = { Nutmeg: 0 as const };
    const crew = [crewMember({ nationality: 'Malay' })];

    expect(getEffectiveKnowledge('Nutmeg', playerKnowledge, crew)).toBe(2);
    expect(getEffectiveKnowledge('Camphor', playerKnowledge, crew)).toBe(1);
    expect(getEffectiveKnowledge('Murano Glass', playerKnowledge, crew)).toBe(0);
  });
});
