import { describe, expect, it } from 'vitest';
import {
  COLLISION_REPUTATION_TARGET,
  cargoTemptationScore,
  chooseInitiativePosture,
  chooseProvokedPosture,
  npcBowWeapon,
  npcBroadsideCount,
  npcBroadsideWeapon,
  shouldStayHostile,
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

  it('makes a light armed merchant evade rather than blindly fight', () => {
    expect(chooseProvokedPosture(ship({ role: 'blue-water merchant', armed: true, morale: 45, shipType: 'Patacher' }), {
      reputation: 0,
      provoked: true,
      hullFraction: 1,
    })).toBe('evade');
  });

  it('lets heavier armed merchants answer violence with gunfire', () => {
    expect(chooseProvokedPosture(ship({ role: 'blue-water merchant', armed: true, morale: 55, shipType: 'Armed Merchantman' }), {
      reputation: 0,
      provoked: true,
      hullFraction: 1,
    })).toBe('engage');
  });

  it('keeps aggressive armed ships hostile after provocation', () => {
    expect(shouldStayHostile(ship({ role: 'privateer', armed: true, morale: 55, shipType: 'Pinnace' }), {
      reputation: 0,
      hullFraction: 1,
    })).toBe(true);
    expect(shouldStayHostile(ship({ role: 'armed patrol', armed: true, morale: 50, shipType: 'Patacher' }), {
      reputation: 0,
      hullFraction: 1,
    })).toBe(true);
    expect(shouldStayHostile(ship({ role: 'blue-water merchant', armed: true, morale: 72, shipType: 'Armed Merchantman' }), {
      reputation: -30,
      hullFraction: 1,
    })).toBe(true);
  });

  it('does not keep weak or civilian ships permanently hostile', () => {
    expect(shouldStayHostile(ship({ role: 'coastal trader', armed: false, morale: 80, shipType: 'Dhow' }), {
      reputation: -100,
      hullFraction: 1,
    })).toBe(false);
    expect(shouldStayHostile(ship({ role: 'blue-water merchant', armed: true, morale: 50, shipType: 'Patacher' }), {
      reputation: -30,
      hullFraction: 1,
    })).toBe(false);
    expect(shouldStayHostile(ship({ role: 'privateer', armed: true, morale: 80, shipType: 'Pinnace' }), {
      reputation: -100,
      hullFraction: 0.18,
    })).toBe(false);
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

  it('does not let same-faction privateers prey on the player just because cargo is valuable', () => {
    expect(chooseInitiativePosture(ship({ role: 'privateer', armed: true, morale: 65, flag: 'Spanish' }), {
      reputation: 0,
      hullFraction: 1,
      playerFlag: 'Spanish',
      cargoTemptation: 90,
    })).toBe('neutral');
  });

  it('does not let friendly-relation privateers prey on the player just because cargo is valuable', () => {
    expect(chooseInitiativePosture(ship({ role: 'privateer', armed: true, morale: 65, flag: 'Portuguese' }), {
      reputation: 0,
      hullFraction: 1,
      playerFlag: 'Spanish',
      cargoTemptation: 90,
    })).toBe('neutral');
  });

  it('does not let neutral-relation privateers prey on the player just because cargo is valuable', () => {
    expect(chooseInitiativePosture(ship({ role: 'privateer', armed: true, morale: 65, flag: 'Japanese' }), {
      reputation: 0,
      hullFraction: 1,
      playerFlag: 'Chinese',
      cargoTemptation: 90,
    })).toBe('neutral');
  });

  it('still lets privateers prey on negative-relation cargo targets', () => {
    expect(chooseInitiativePosture(ship({ role: 'privateer', armed: true, morale: 65, flag: 'Dutch' }), {
      reputation: 0,
      hullFraction: 1,
      playerFlag: 'Spanish',
      cargoTemptation: 90,
    })).toBe('warn');
  });

  it('still lets privateers warn same-faction players who have earned hostile reputation', () => {
    expect(chooseInitiativePosture(ship({ role: 'privateer', armed: true, morale: 65, flag: 'Spanish' }), {
      reputation: -65,
      hullFraction: 1,
      playerFlag: 'Spanish',
      cargoTemptation: 0,
    })).toBe('warn');
  });

  it('makes patrols challenge pirate-flagged players', () => {
    expect(chooseInitiativePosture(ship({ role: 'armed patrol', armed: true, morale: 65, flag: 'Portuguese' }), {
      reputation: 0,
      hullFraction: 1,
      playerFlag: 'Pirate',
      cargoTemptation: 0,
    })).toBe('warn');
  });

  it('makes civilian ships flee from pirate-flagged players', () => {
    expect(chooseInitiativePosture(ship({ role: 'coastal trader', armed: true, morale: 45, flag: 'Gujarati' }), {
      reputation: 0,
      hullFraction: 1,
      playerFlag: 'Pirate',
      cargoTemptation: 0,
    })).toBe('flee');
  });

  it('assigns plausible NPC weapons by ship type and cannon ports', () => {
    expect(npcBowWeapon(ship({ shipType: 'Dhow' }))).toBe('lantaka');
    expect(npcBowWeapon(ship({ shipType: 'Junk' }))).toBe('cetbang');
    expect(npcBowWeapon(ship({ shipType: 'Galleon' }))).toBe('falconet');
    expect(npcBroadsideWeapon(ship({ shipType: 'Galleon' }))).toBe('demiCulverin');
    expect(npcBroadsideWeapon(ship({ shipType: 'Ghurab' }))).toBe('saker');
    expect(npcBroadsideCount(ship({
      shipType: 'Galleon',
      visual: { ...ship({}).visual, hasCannonPorts: true },
    }))).toBe(3);
    expect(npcBroadsideCount(ship({
      shipType: 'Galleon',
      visual: { ...ship({}).visual, hasCannonPorts: false },
    }))).toBe(0);
  });
});
