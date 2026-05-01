import type { CrewMember, CrewRole, HealthFlag } from '../store/gameStore';
import type { CrewRelation, CrewRelationshipStatus } from './crewRelations';
import type { CrewTroubleMedallionKey } from './crewTroubleMedallions';

export type CrewTroubleArchetype =
  | 'fever-below-deck'
  | 'scurvy-signs'
  | 'wounded-hand'
  | 'desertion-talk'
  | 'refusal-of-duty'
  | 'ration-quarrel'
  | 'religious-dispute'
  | 'professional-rivalry'
  | 'captains-authority-challenged'
  | 'secret-attachment'
  | 'homesickness'
  | 'blame-after-damage'
  | 'shared-discovery'
  | 'lucky-catch'
  | 'port-windfall'
  | 'night-watch-omen';

export type CrewTroubleSeverity = 1 | 2 | 3;
export type CrewTroubleTone = 'sickbay' | 'discipline' | 'interpersonal' | 'opportunity' | 'aftermath';

export interface CrewTroubleOutcome {
  moraleDelta?: Record<string, number>;
  healthChange?: Record<string, HealthFlag>;
  heartsDelta?: Record<string, number>;
  relationDelta?: { aId: string; bId: string; affinity?: number; tension?: number; tag?: string };
  goldCost?: number;
  provisionCost?: number;
  crewLeaves?: string[];
  roleChange?: { crewId: string; role: CrewRole };
  addStatus?: {
    crewId: string;
    otherCrewId: string;
    text: string;
    tone: CrewRelationshipStatus['tone'];
    severity: number;
    durationDays: number;
  };
  journalEntry?: string;
}

export interface CrewTroubleChoice {
  id: string;
  label: string;
  detail: string;
  outcome: CrewTroubleOutcome;
}

export interface CrewTroubleEvent {
  id: string;
  archetype: CrewTroubleArchetype;
  severity: CrewTroubleSeverity;
  tone: CrewTroubleTone;
  day: number;
  crewIds: string[];
  title: string;
  body: string;
  medallionId: CrewTroubleMedallionKey;
  choices: CrewTroubleChoice[];
}

export const CREW_TROUBLE_ARCHETYPES: Record<CrewTroubleArchetype, {
  label: string;
  tone: CrewTroubleTone;
  medallionId: CrewTroubleMedallionKey;
  trigger: string;
  systems: string;
  beneficialPath: string;
}> = {
  'fever-below-deck': {
    label: 'Fever Below Deck',
    tone: 'sickbay',
    medallionId: 'fever-lantern',
    trigger: 'sickness worsens or fever persists',
    systems: 'health, hearts, surgeon XP, morale',
    beneficialPath: 'surgeon care can heal and create loyalty',
  },
  'scurvy-signs': {
    label: 'Scurvy Signs',
    tone: 'sickbay',
    medallionId: 'scurvy-barrel',
    trigger: 'low provisions and scurvy risk',
    systems: 'provisions, health, morale',
    beneficialPath: 'opening stores restores trust',
  },
  'wounded-hand': {
    label: 'Wounded Hand',
    tone: 'sickbay',
    medallionId: 'bandaged-hand',
    trigger: 'combat, storm, or hunting injury',
    systems: 'health, role performance, relations',
    beneficialPath: 'assigned help creates a care bond',
  },
  'desertion-talk': {
    label: 'Desertion Talk',
    tone: 'discipline',
    medallionId: 'moonlit-hatch',
    trigger: 'morale below 25',
    systems: 'morale, gold, crew removal',
    beneficialPath: 'hearing them out preserves loyalty',
  },
  'refusal-of-duty': {
    label: 'Refusal of Duty',
    tone: 'discipline',
    medallionId: 'coiled-rope',
    trigger: 'morale below 10 or repeated low-morale events',
    systems: 'discipline, captain charisma, role',
    beneficialPath: 'fair intervention restores work',
  },
  'ration-quarrel': {
    label: 'Ration Quarrel',
    tone: 'interpersonal',
    medallionId: 'broken-biscuit',
    trigger: 'ration tension and scarce stores',
    systems: 'provisions, tension, injury risk',
    beneficialPath: 'public rationing lowers anxiety',
  },
  'religious-dispute': {
    label: 'Religious Dispute',
    tone: 'interpersonal',
    medallionId: 'split-candle',
    trigger: 'faith tension over worship or prayer customs',
    systems: 'faith, morale, relations',
    beneficialPath: 'separate watches stabilize mixed crew',
  },
  'professional-rivalry': {
    label: 'Professional Rivalry',
    tone: 'interpersonal',
    medallionId: 'split-compass',
    trigger: 'same-role ambition or skill competition',
    systems: 'roles, XP, relations',
    beneficialPath: 'trial of skill clarifies role fit',
  },
  'captains-authority-challenged': {
    label: "Captain's Authority Challenged",
    tone: 'discipline',
    medallionId: 'cracked-seal',
    trigger: 'repeated trouble and weak crew morale',
    systems: 'captain role, morale, mutiny precursor',
    beneficialPath: 'successful address gives crew-wide morale',
  },
  'secret-attachment': {
    label: 'Secret Attachment',
    tone: 'interpersonal',
    medallionId: 'folded-note',
    trigger: 'secret fondness grows',
    systems: 'relations, watch assignment, jealousy risk',
    beneficialPath: 'paired watches boost morale and bond',
  },
  homesickness: {
    label: 'Homesickness',
    tone: 'interpersonal',
    medallionId: 'pay-purse',
    trigger: 'long voyage, far from home, melancholic humour',
    systems: 'morale, ports, journal, gold',
    beneficialPath: 'letters or shore-leave promise builds loyalty',
  },
  'blame-after-damage': {
    label: 'Blame After Damage',
    tone: 'aftermath',
    medallionId: 'medicine-chest',
    trigger: 'hull or sail damage after storm/combat',
    systems: 'ship damage, roles, relations',
    beneficialPath: 'investigation gives role XP and lowers blame',
  },
  'shared-discovery': {
    label: 'Shared Discovery',
    tone: 'opportunity',
    medallionId: 'open-logbook',
    trigger: 'port, POI, or commodity knowledge discovery',
    systems: 'knowledge, journal, crew domains',
    beneficialPath: 'public credit grants XP, knowledge, morale',
  },
  'lucky-catch': {
    label: 'Lucky Catch',
    tone: 'opportunity',
    medallionId: 'silver-fish',
    trigger: 'fishing, wildlife, provision pressure, lucky crew',
    systems: 'provisions, morale, luck',
    beneficialPath: 'shared food gives crew-wide morale',
  },
  'port-windfall': {
    label: 'Port Windfall',
    tone: 'opportunity',
    medallionId: 'spilled-coin',
    trigger: 'profitable trade and factor/reputation',
    systems: 'commerce, factor XP, gold, morale',
    beneficialPath: 'bonus or reinvestment creates loyalty',
  },
  'night-watch-omen': {
    label: 'Night Watch Omen',
    tone: 'opportunity',
    medallionId: 'night-watch-star',
    trigger: 'night or storm with perceptive witness',
    systems: 'weather, navigation, POI or encounter hooks',
    beneficialPath: 'trusting or logging clue can reveal opportunity',
  },
};

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function eventId(day: number, archetype: CrewTroubleArchetype, crewIds: string[]): string {
  return `${day}:${archetype}:${crewIds.join(':')}:${Math.floor(Math.random() * 10000)}`;
}

function lowestMoraleCrew(crew: CrewMember[]): CrewMember | null {
  return [...crew].sort((a, b) => a.morale - b.morale)[0] ?? null;
}

function mostTroubledRelation(relations: CrewRelation[], statuses: CrewRelationshipStatus[]): CrewRelation | null {
  const statusPairs = new Set(statuses.filter(s => s.tone === 'tension').map(s => [s.crewId, s.otherCrewId].sort().join(':')));
  return [...relations]
    .filter(relation => relation.tension >= 68 || relation.tags.some(tag => tag === 'faith' || tag === 'rations' || tag === 'rivalry') || statusPairs.has(relation.id))
    .sort((a, b) => b.tension - a.tension)[0] ?? null;
}

function participantNames(crew: CrewMember[], ids: string[]): string {
  return ids.map(id => crew.find(member => member.id === id)?.name).filter(Boolean).join(' and ');
}

function createInterpersonalChoices(
  archetype: CrewTroubleArchetype,
  crew: CrewMember[],
  relation: CrewRelation,
  dayCount: number,
): CrewTroubleChoice[] {
  const [a, b] = [crew.find(c => c.id === relation.aId), crew.find(c => c.id === relation.bId)];
  const names = participantNames(crew, [relation.aId, relation.bId]);
  const subject = archetype === 'religious-dispute'
    ? 'worship and prayer aboard'
    : archetype === 'ration-quarrel'
      ? 'the division of rations'
      : 'standing aboard ship';
  return [
    {
      id: 'intervene',
      label: 'Intervene personally',
      detail: 'Spend authority now; lower tension without taking sides.',
      outcome: {
        moraleDelta: Object.fromEntries([relation.aId, relation.bId].map(id => [id, 4])),
        relationDelta: { aId: relation.aId, bId: relation.bId, tension: -22, affinity: 6, tag: 'captain-intervened' },
        journalEntry: `The captain settled a dispute between ${names} over ${subject}.`,
      },
    },
    {
      id: 'ignore',
      label: 'Ignore it',
      detail: 'No immediate cost; the quarrel may deepen.',
      outcome: {
        relationDelta: { aId: relation.aId, bId: relation.bId, tension: 12, affinity: -4, tag: 'ignored' },
        journalEntry: `${names} were left to settle their dispute over ${subject}.`,
      },
    },
    {
      id: 'side-a',
      label: `Side with ${a?.name ?? 'one side'}`,
      detail: 'Clear decision, but the other party will remember it.',
      outcome: {
        moraleDelta: { [relation.aId]: 5, [relation.bId]: -8 },
        relationDelta: { aId: relation.aId, bId: relation.bId, tension: 10, affinity: -8, tag: 'captain-sided' },
        journalEntry: `The captain sided with ${a?.name ?? 'one sailor'} in a dispute with ${b?.name ?? 'another sailor'}.`,
      },
    },
    {
      id: 'spend',
      label: archetype === 'ration-quarrel' ? 'Open the stores' : 'Buy peace',
      detail: archetype === 'ration-quarrel' ? 'Costs provisions; calms hungry men.' : 'Costs coin; calms the argument for now.',
      outcome: {
        provisionCost: archetype === 'ration-quarrel' ? 4 : undefined,
        goldCost: archetype === 'ration-quarrel' ? undefined : 12,
        moraleDelta: Object.fromEntries([relation.aId, relation.bId].map(id => [id, 8])),
        relationDelta: { aId: relation.aId, bId: relation.bId, tension: -30, affinity: 4, tag: 'appeased' },
        journalEntry: `${names} were quieted after the captain spent ship resources to end the dispute.`,
      },
    },
  ].map(choice => ({ ...choice, outcome: { ...choice.outcome, journalEntry: `${choice.outcome.journalEntry} Day ${dayCount}.` } }));
}

function createCrewEvent(
  archetype: CrewTroubleArchetype,
  dayCount: number,
  severity: CrewTroubleSeverity,
  crew: CrewMember[],
  crewIds: string[],
  body: string,
  choices: CrewTroubleChoice[],
): CrewTroubleEvent {
  const def = CREW_TROUBLE_ARCHETYPES[archetype];
  return {
    id: eventId(dayCount, archetype, crewIds),
    archetype,
    severity,
    tone: def.tone,
    day: dayCount,
    crewIds,
    title: def.label,
    body,
    medallionId: def.medallionId,
    choices,
  };
}

export function maybeCreateCrewTroubleEvent(context: {
  crew: CrewMember[];
  relations: CrewRelation[];
  statuses: CrewRelationshipStatus[];
  dayCount: number;
  provisions: number;
  gold: number;
  trigger: 'daily' | 'voyage' | 'rest' | 'relations' | 'combat' | 'commerce' | 'discovery';
  lastTroubleDay: number;
  crewTroubleCooldowns: Record<string, number>;
}): CrewTroubleEvent | null {
  const { crew, dayCount, trigger } = context;
  if (crew.length === 0) return null;
  if (dayCount - context.lastTroubleDay < 3 && trigger !== 'combat') return null;

  const availableCrew = crew.filter(member => (context.crewTroubleCooldowns[member.id] ?? -Infinity) <= dayCount);
  if (availableCrew.length === 0) return null;

  const fevered = availableCrew.find(member => member.health === 'fevered');
  if (fevered && (trigger === 'daily' || trigger === 'rest') && Math.random() < 0.55) {
    return createCrewEvent('fever-below-deck', dayCount, 3, crew, [fevered.id],
      `${fevered.name} lies burning below deck. The crew have started counting the coughs through the bulkhead.`,
      [
        { id: 'surgeon', label: 'Call the surgeon', detail: 'Best chance of recovery if a surgeon is aboard.', outcome: { healthChange: { [fevered.id]: 'sick' }, heartsDelta: { [fevered.id]: 1 }, moraleDelta: { [fevered.id]: 6 }, journalEntry: `${fevered.name}'s fever was treated by shipboard care.` } },
        { id: 'isolate', label: 'Isolate them', detail: 'Protects the crew, hard on the patient.', outcome: { moraleDelta: { [fevered.id]: -6 }, addStatus: { crewId: fevered.id, otherCrewId: fevered.id, text: 'Isolated below deck with fever', tone: 'care', severity: 54, durationDays: 8 }, journalEntry: `${fevered.name} was isolated until the fever changed course.` } },
        { id: 'pray', label: 'Pray and wait', detail: 'No cost; morale depends on whether the fever breaks.', outcome: { moraleDelta: { [fevered.id]: -2 }, journalEntry: `The crew waited through ${fevered.name}'s fever.` } },
        { id: 'keep-working', label: 'Keep them on light duty', detail: 'Risky, but preserves hands.', outcome: { moraleDelta: { [fevered.id]: -10 }, heartsDelta: { [fevered.id]: -1 }, journalEntry: `${fevered.name} was kept on duty despite fever.` } },
      ]);
  }

  const scurvy = availableCrew.find(member => member.health === 'scurvy');
  if (scurvy && context.provisions <= crew.length * 2 && Math.random() < 0.6) {
    return createCrewEvent('scurvy-signs', dayCount, 2, crew, [scurvy.id],
      `${scurvy.name}'s gums are bad and the talk around the water cask has turned bitter.`,
      [
        { id: 'open-stores', label: 'Open preserved stores', detail: 'Costs 6 provisions; steadies the crew.', outcome: { provisionCost: 6, healthChange: { [scurvy.id]: 'sick' }, moraleDelta: { [scurvy.id]: 10 }, journalEntry: `Preserved stores were opened for ${scurvy.name}'s scurvy.` } },
        { id: 'strict-ration', label: 'Ration strictly', detail: 'Saves stores; morale suffers.', outcome: { moraleDelta: { [scurvy.id]: -8 }, journalEntry: `${scurvy.name}'s scurvy was answered with stricter rationing.` } },
        { id: 'promise-port', label: 'Promise fresh food at port', detail: 'A small morale lift now.', outcome: { moraleDelta: { [scurvy.id]: 5 }, journalEntry: `The captain promised fresh food for ${scurvy.name} at the next port.` } },
        { id: 'ignore', label: 'Ignore complaints', detail: 'No cost; tension rises.', outcome: { moraleDelta: { [scurvy.id]: -10 }, journalEntry: `${scurvy.name}'s scurvy complaints were ignored.` } },
      ]);
  }

  const injured = availableCrew.find(member => member.health === 'injured');
  if (injured && trigger === 'combat' && Math.random() < 0.7) {
    return createCrewEvent('wounded-hand', dayCount, 2, crew, [injured.id],
      `${injured.name} is still trying to work with a bad wound. Others are watching how the captain handles it.`,
      [
        { id: 'rest-duty', label: 'Rest them from duty', detail: 'Morale rises; work slows.', outcome: { moraleDelta: { [injured.id]: 8 }, heartsDelta: { [injured.id]: 1 }, journalEntry: `${injured.name} was rested from duty after injury.` } },
        { id: 'keep-working', label: 'Keep them working', detail: 'Preserves manpower; harsh.', outcome: { moraleDelta: { [injured.id]: -8 }, heartsDelta: { [injured.id]: -1 }, journalEntry: `${injured.name} was kept working through injury.` } },
        { id: 'assign-help', label: 'Assign a mate to help', detail: 'May create a care bond.', outcome: { moraleDelta: { [injured.id]: 5 }, journalEntry: `A mate was assigned to help ${injured.name}.` } },
        { id: 'replace-role', label: 'Replace their role', detail: 'Practical, but humiliating.', outcome: { moraleDelta: { [injured.id]: -5 }, roleChange: injured.role !== 'Sailor' ? { crewId: injured.id, role: 'Sailor' } : undefined, journalEntry: `${injured.name} was moved out of active duty while wounded.` } },
      ]);
  }

  const low = lowestMoraleCrew(availableCrew);
  if (low && low.morale < 25 && Math.random() < (low.morale < 10 ? 0.8 : 0.55)) {
    const archetype: CrewTroubleArchetype = low.morale < 10 ? 'refusal-of-duty' : 'desertion-talk';
    return createCrewEvent(archetype, dayCount, low.morale < 10 ? 3 : 2, crew, [low.id],
      archetype === 'refusal-of-duty'
        ? `${low.name} has stopped answering orders. The silence is worse than shouting.`
        : `${low.name} has been asking which ports hire hands without questions.`,
      [
        { id: 'hear-out', label: 'Hear them out', detail: 'Captain attention, no coin.', outcome: { moraleDelta: { [low.id]: 14 }, journalEntry: `The captain heard ${low.name} out at a breaking point.` } },
        { id: 'advance-pay', label: 'Offer advance pay', detail: 'Costs 20 gold; strong morale recovery.', outcome: { goldCost: 20, moraleDelta: { [low.id]: 24 }, journalEntry: `${low.name} was steadied with advance pay.` } },
        { id: 'discipline', label: 'Threaten discipline', detail: 'May keep them working, but hardens resentment.', outcome: { moraleDelta: { [low.id]: -6 }, journalEntry: `${low.name} was threatened back to work.` } },
        { id: 'let-go', label: 'Let them go', detail: 'They leave the crew.', outcome: { crewLeaves: [low.id], journalEntry: `${low.name} left the crew after reaching a breaking point.` } },
      ]);
  }

  const relation = mostTroubledRelation(context.relations, context.statuses);
  if (relation && Math.random() < 0.65) {
    const tag = relation.tags.at(-1);
    const archetype: CrewTroubleArchetype =
      tag === 'faith' ? 'religious-dispute' :
      tag === 'rations' ? 'ration-quarrel' :
      tag === 'rivalry' ? 'professional-rivalry' :
      tag === 'fondness' ? 'secret-attachment' :
      'captains-authority-challenged';
    const names = participantNames(crew, [relation.aId, relation.bId]);
    return createCrewEvent(archetype, dayCount, relation.tension > 82 ? 3 : 2, crew, [relation.aId, relation.bId],
      `${names} have carried their trouble long enough that the rest of the crew now knows about it.`,
      createInterpersonalChoices(archetype, crew, relation, dayCount));
  }

  if ((trigger === 'discovery' || trigger === 'commerce' || trigger === 'voyage') && Math.random() < 0.2) {
    const witness = pick(availableCrew);
    const archetype: CrewTroubleArchetype = trigger === 'commerce' ? 'port-windfall' : trigger === 'discovery' ? 'shared-discovery' : 'night-watch-omen';
    return createCrewEvent(archetype, dayCount, 1, crew, [witness.id],
      `${witness.name} has brought something useful to the captain's attention.`,
      [
        { id: 'credit', label: 'Credit them publicly', detail: 'Morale and loyalty rise.', outcome: { moraleDelta: { [witness.id]: 10 }, journalEntry: `${witness.name} was publicly credited for useful work.` } },
        { id: 'reward', label: 'Give a small reward', detail: 'Costs 10 gold; stronger morale gain.', outcome: { goldCost: 10, moraleDelta: { [witness.id]: 16 }, journalEntry: `${witness.name} received a small reward for useful work.` } },
        { id: 'record', label: 'Record it in the journal', detail: 'Preserves the finding without favoritism.', outcome: { moraleDelta: { [witness.id]: 5 }, journalEntry: `${witness.name}'s observation was entered in the ship journal.` } },
        { id: 'move-on', label: 'Move on', detail: 'No cost, no fuss.', outcome: { journalEntry: `${witness.name}'s observation was noted and the ship moved on.` } },
      ]);
  }

  return null;
}
