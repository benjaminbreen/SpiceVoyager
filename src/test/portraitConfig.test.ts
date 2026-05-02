import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ConfigPortrait, renderPortraitForTest } from '../components/CrewPortrait';
import type { CrewMember } from '../store/gameStore';
import {
  crewToPortraitConfig,
  portraitConfigSignature,
  tavernNpcToPortraitConfig,
} from '../utils/portraitConfig';

const crewMember: CrewMember = {
  id: 'crew-test-1',
  name: 'Thomas Avery',
  role: 'Captain',
  skill: 72,
  morale: 76,
  age: 43,
  nationality: 'English',
  languages: ['English'],
  birthplace: 'London',
  health: 'healthy',
  quality: 'passable',
  stats: { strength: 12, perception: 14, charisma: 11, luck: 8 },
  humours: { sanguine: 5, choleric: 6, melancholic: 4, phlegmatic: 5, curiosity: 7 },
  backstory: 'Keeps a careful watch.',
  history: [],
  hireDay: 1,
  traits: [],
  abilities: [],
  level: 1,
  xp: 0,
  xpToNext: 100,
  hearts: { current: 3, max: 3 },
};

describe('portrait generation', () => {
  it('generates deterministic crew portrait configs', () => {
    const first = crewToPortraitConfig(crewMember);
    const second = crewToPortraitConfig(crewMember);

    expect(second).toEqual(first);
    expect(portraitConfigSignature(second)).toBe(portraitConfigSignature(first));
  });

  it('generates deterministic tavern NPC portrait configs', () => {
    const npc = {
      id: 'npc-test-1',
      name: 'Joao Rodrigues',
      nationality: 'Portuguese' as const,
      isFemale: false,
      roleTitle: 'factor',
    };

    expect(tavernNpcToPortraitConfig(npc)).toEqual(tavernNpcToPortraitConfig(npc));
  });

  it('renders same-seed personality changes differently', () => {
    const config = crewToPortraitConfig(crewMember);
    const neutral = renderToStaticMarkup(React.createElement('svg', null, renderPortraitForTest(config, 'expr-test')));
    const rage = renderToStaticMarkup(React.createElement(
      'svg',
      null,
      renderPortraitForTest({ ...config, personality: 'Rage' }, 'expr-test'),
    ));

    expect(rage).not.toBe(neutral);
    expect(rage).toContain('#180909');
  });

  it('renders duplicate portrait configs with unique svg ids', () => {
    const config = crewToPortraitConfig(crewMember);
    const markup = renderToStaticMarkup(React.createElement(
      'svg',
      null,
      React.createElement(ConfigPortrait, { config }),
      React.createElement(ConfigPortrait, { config }),
    ));

    const ids = [...markup.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
    const duplicates = ids.filter((id, idx) => ids.indexOf(id) !== idx);

    expect(ids.length).toBeGreaterThan(0);
    expect(duplicates).toEqual([]);
  });
});
