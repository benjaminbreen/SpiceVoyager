import { describe, expect, it } from 'vitest';
import {
  effectiveFactionReputation,
  factionRelationModifier,
  sharesFactionLanguage,
} from '../utils/factionRelations';

describe('factionRelations', () => {
  it('treats same-faction captains as warmer before local reputation changes', () => {
    expect(factionRelationModifier('Spanish', 'Spanish')).toBe(35);
    expect(effectiveFactionReputation(0, 'Spanish', 'Spanish')).toBeGreaterThanOrEqual(25);
  });

  it('makes close allies cross the cordial threshold at neutral reputation', () => {
    expect(factionRelationModifier('Spanish', 'Portuguese')).toBe(25);
    expect(effectiveFactionReputation(0, 'Spanish', 'Portuguese')).toBeGreaterThanOrEqual(25);
  });

  it('makes major rival factions colder without changing stored reputation', () => {
    expect(factionRelationModifier('Spanish', 'Dutch')).toBeLessThanOrEqual(-25);
    expect(effectiveFactionReputation(0, 'Spanish', 'Dutch')).toBeLessThanOrEqual(-25);
  });

  it('marks Portuguese conflicts with Acehnese and Ottoman ships as bitter rivalries', () => {
    expect(factionRelationModifier('Portuguese', 'Acehnese')).toBeLessThanOrEqual(-35);
    expect(factionRelationModifier('Portuguese', 'Ottoman')).toBeLessThanOrEqual(-35);
  });

  it('keeps distant or mixed-contact pairs neutral unless the player earns a reputation', () => {
    expect(factionRelationModifier('Chinese', 'Japanese')).toBe(0);
    expect(factionRelationModifier('Chinese', 'Portuguese')).toBe(5);
  });

  it('recognizes shared same-faction native language', () => {
    expect(sharesFactionLanguage('Spanish', 'Spanish', 'Spanish')).toBe(true);
    expect(sharesFactionLanguage('Spanish', 'Spanish', 'Portuguese')).toBe(false);
    expect(sharesFactionLanguage('Spanish', 'Portuguese', 'Spanish')).toBe(false);
  });
});
