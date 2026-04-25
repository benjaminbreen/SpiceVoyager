import { describe, expect, it } from 'vitest';
import {
  getCollisionHail,
  getRememberedCollisionGreeting,
  recordCollisionGrievance,
  ROMANIZED_COLLISION_HAIL,
} from '../utils/hail';
import type { NPCShipIdentity } from '../utils/npcShipGenerator';

function npc(language: NPCShipIdentity['hailLanguage']): NPCShipIdentity {
  return {
    id: `npc-${language}`,
    traditionId: 'persian_gulf',
    role: 'blue-water merchant',
    captainName: 'Test Captain',
    shipName: 'Test Ship',
    shipType: 'Dhow',
    flag: 'Persian',
    hailLanguage: language,
    crewCount: 20,
    morale: 50,
    armed: true,
    cargo: {},
    appearancePhrase: 'a test ship',
    position: [0, 0, 0],
    maxHull: 50,
    visual: {
      family: 'dhow',
      hullColor: '#000',
      trimColor: '#000',
      deckColor: '#000',
      sailColor: '#000',
      sailTrimColor: '#000',
      flagColor: '#000',
      flagAccentColor: '#000',
      mastCount: 1,
      sailPlan: 'lateen',
      hasOutrigger: false,
      hasCannonPorts: false,
      hasSternCastle: false,
      scale: 1,
      wear: 0.2,
    },
    visitedPorts: [],
  };
}

describe('collision hail language', () => {
  it('uses romanized Persian when untranslated', () => {
    const line = getCollisionHail(npc('Persian'), false);

    expect(ROMANIZED_COLLISION_HAIL.Persian).toContain(line);
    expect(line).toMatch(/[A-Z]/);
    expect(line).toContain('!!');
    expect(line).not.toMatch(/[\u0600-\u06ff]/);
  });

  it('uses translated outrage when understood', () => {
    const line = getCollisionHail(npc('Persian'), true);

    expect(line).toContain('!!');
    expect(line).toMatch(/[A-Z]/);
  });

  it('remembers a prior collision for later normal hails', () => {
    const testNpc = npc('English');
    recordCollisionGrievance(testNpc.id, 12);

    const line = getRememberedCollisionGreeting(testNpc, true);

    expect(line).not.toBeNull();
    expect(line).toMatch(/again|struck|hit/i);
  });
});
