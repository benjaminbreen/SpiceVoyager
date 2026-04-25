import { describe, expect, it } from 'vitest';
import {
  COLLISION_REPUTATION_TARGET,
  cargoTemptationScore,
  chooseInitiativePosture,
  chooseProvokedPosture,
  shouldBreakOff,
} from '../utils/npcCombat';
import type { NPCShipIdentity } from '../utils/npcShipGenerator';

function ship(overrides: Partial<NPCShipIdentity>): NPCShipIdentity {
  return {
    id: 'npc-1',
    traditionId: 'portuguese_estado',
    role: 'coastal trader',
    captainName: 'Test Captain',
    shipName: 'Test Ship',
    shipType: 'Dhow',
    flag: 'Portuguese',
    hailLanguage: 'Portuguese',
    crewCount: 20,
    morale: 50,
    armed: false,
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
    ...overrides,
  };
}

describe('npcCombat', () => {
  it('makes an unarmed civilian flee when provoked', () => {
    expect(chooseProvokedPosture(ship({ role: 'coastal trader', armed: false }), {
      reputation: 0,
      provoked: true,
      hullFraction: 1,
    })).toBe('flee');
  });

  it('makes an armed patrol engage when provoked', () => {
    expect(chooseProvokedPosture(ship({ role: 'armed patrol', armed: true, morale: 60 }), {
      reputation: 0,
      provoked: true,
      hullFraction: 1,
    })).toBe('engage');
  });

  it('makes an armed merchant evade rather than blindly flee', () => {
    expect(chooseProvokedPosture(ship({ role: 'blue-water merchant', armed: true, morale: 45, shipType: 'Patacher' }), {
      reputation: 0,
      provoked: true,
      hullFraction: 1,
    })).toBe('evade');
  });

  it('breaks off badly damaged ships unless morale and role justify staying', () => {
    expect(shouldBreakOff(ship({ role: 'armed patrol', morale: 40 }), 0.3)).toBe(true);
    expect(shouldBreakOff(ship({ role: 'privateer', morale: 80 }), 0.3)).toBe(false);
  });

  it('allows hostile privateers to warn before initiating', () => {
    expect(chooseInitiativePosture(ship({ role: 'privateer', armed: true, morale: 65, flag: 'Dutch' }), {
      reputation: -65,
      hullFraction: 1,
      playerFlag: 'Portuguese',
      cargoTemptation: 0,
    })).toBe('warn');
  });

  it('uses faction rivalry data for patrol initiative even before local reputation changes', () => {
    expect(chooseInitiativePosture(ship({ role: 'armed patrol', armed: true, morale: 65, flag: 'Portuguese' }), {
      reputation: 0,
      hullFraction: 1,
      playerFlag: 'Acehnese',
      cargoTemptation: 0,
    })).toBe('warn');
  });

  it('does not make neutral distant-contact patrols initiate combat by default', () => {
    expect(chooseInitiativePosture(ship({ role: 'armed patrol', armed: true, morale: 65, flag: 'Japanese' }), {
      reputation: 0,
      hullFraction: 1,
      playerFlag: 'Chinese',
      cargoTemptation: 0,
    })).toBe('neutral');
  });

  it('uses fixed reputation targets for collision outcomes', () => {
    expect(COLLISION_REPUTATION_TARGET.ram).toBe(-100);
    expect(COLLISION_REPUTATION_TARGET.apologize).toBeGreaterThan(COLLISION_REPUTATION_TARGET.ram);
    expect(COLLISION_REPUTATION_TARGET.apologize).toBeLessThan(-25);
    expect(COLLISION_REPUTATION_TARGET.pay).toBe(-25);
    expect(COLLISION_REPUTATION_TARGET.threaten).toBe(-100);
  });

  it('scores laden valuable cargo as tempting to privateers', () => {
    expect(cargoTemptationScore({}, 100)).toBe(0);
    expect(cargoTemptationScore({ 'Black Pepper': 50 }, 100)).toBeGreaterThanOrEqual(55);
  });
});
