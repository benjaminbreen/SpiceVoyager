import type { CrewMember, HealthFlag, Nationality } from '../store/gameStore';

export type CrewRelationTone = 'bond' | 'tension' | 'secret' | 'care';

export interface CrewRelation {
  id: string;
  aId: string;
  bId: string;
  affinity: number;
  tension: number;
  tags: string[];
  lastEventDay: number;
}

export interface CrewRelationshipStatus {
  id: string;
  crewId: string;
  otherCrewId: string;
  text: string;
  tone: CrewRelationTone;
  severity: number;
  createdDay: number;
  expiresDay: number;
}

export interface CrewRelationshipRollResult {
  relations: CrewRelation[];
  statuses: CrewRelationshipStatus[];
  publicEvent?: {
    title: string;
    text: string;
    type: 'warning' | 'success' | 'info';
  };
}

type CrewFaith =
  | 'Catholic'
  | 'Protestant'
  | 'Sunni'
  | 'Shia'
  | 'Ibadi'
  | 'Hindu'
  | 'Buddhist'
  | 'Chinese folk'
  | 'Shinto'
  | 'Jewish'
  | 'Animist';

const FAITH_BY_NATIONALITY: Partial<Record<Nationality, CrewFaith>> = {
  English: 'Protestant',
  Dutch: 'Protestant',
  Danish: 'Protestant',
  Portuguese: 'Catholic',
  Spanish: 'Catholic',
  French: 'Catholic',
  Venetian: 'Catholic',
  Mughal: 'Sunni',
  Persian: 'Shia',
  Ottoman: 'Sunni',
  Omani: 'Ibadi',
  Swahili: 'Sunni',
  Malay: 'Sunni',
  Acehnese: 'Sunni',
  Moluccan: 'Sunni',
  Siamese: 'Buddhist',
  Japanese: 'Shinto',
  Chinese: 'Chinese folk',
};

const GUJARATI_HINDU_BIRTHPLACES = new Set(['Ahmedabad', 'Broach', 'Mandvi', 'Porbandar', 'Gogha', 'Bharuch', 'Khambhat']);
const GUJARATI_MUSLIM_BIRTHPLACES = new Set(['Surat', 'Cambay', 'Diu']);
const JAVANESE_MUSLIM_BIRTHPLACES = new Set(['Banten', 'Cirebon', 'Gresik', 'Tuban', 'Japara']);

function stableHash(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function inferredFaith(member: CrewMember): CrewFaith {
  if (member.nationality === 'Gujarati') {
    if (GUJARATI_HINDU_BIRTHPLACES.has(member.birthplace)) return 'Hindu';
    if (GUJARATI_MUSLIM_BIRTHPLACES.has(member.birthplace)) return 'Sunni';
    return member.name.includes('Abdul') || member.name.includes('Mulla') ? 'Sunni' : 'Hindu';
  }
  if (member.nationality === 'Javanese') {
    return JAVANESE_MUSLIM_BIRTHPLACES.has(member.birthplace) ? 'Sunni' : 'Hindu';
  }
  if (member.nationality === 'Pirate') return stableHash(`${member.id}:${member.name}:${member.birthplace}`) % 100 < 45 ? 'Catholic' : 'Sunni';
  return FAITH_BY_NATIONALITY[member.nationality] ?? 'Animist';
}

function relationId(aId: string, bId: string): string {
  return [aId, bId].sort().join(':');
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function healthBurden(health: HealthFlag): number {
  if (health === 'healthy') return 0;
  if (health === 'injured' || health === 'sick') return 1;
  return 2;
}

function compatibility(a: CrewMember, b: CrewMember): number {
  let score = 0;
  const aFaith = inferredFaith(a);
  const bFaith = inferredFaith(b);

  if (a.nationality === b.nationality) score += 18;
  if (a.birthplace === b.birthplace) score += 20;
  if (aFaith === bFaith) score += 16;
  if ((aFaith === 'Catholic' && bFaith === 'Protestant') || (aFaith === 'Protestant' && bFaith === 'Catholic')) score -= 24;
  if ((aFaith === 'Sunni' && bFaith === 'Shia') || (aFaith === 'Shia' && bFaith === 'Sunni')) score -= 14;
  if ((aFaith === 'Catholic' || aFaith === 'Protestant') && (bFaith === 'Sunni' || bFaith === 'Shia' || bFaith === 'Ibadi')) score -= 10;
  if ((bFaith === 'Catholic' || bFaith === 'Protestant') && (aFaith === 'Sunni' || aFaith === 'Shia' || aFaith === 'Ibadi')) score -= 10;
  if (Math.abs(a.humours.choleric - b.humours.choleric) >= 5) score -= 6;
  if (a.humours.sanguine >= 7 || b.humours.sanguine >= 7) score += 5;
  if (a.humours.phlegmatic >= 7 || b.humours.phlegmatic >= 7) score += 5;
  return score;
}

function statusId(day: number, crewId: string, otherCrewId: string, tag: string): string {
  return `${day}:${crewId}:${otherCrewId}:${tag}:${Math.floor(Math.random() * 1000)}`;
}

function pushStatus(
  statuses: CrewRelationshipStatus[],
  status: CrewRelationshipStatus,
): CrewRelationshipStatus[] {
  const withoutSamePair = statuses.filter(s => !(s.crewId === status.crewId && s.otherCrewId === status.otherCrewId && s.tone === status.tone));
  return [...withoutSamePair, status]
    .sort((a, b) => b.severity - a.severity || b.createdDay - a.createdDay)
    .slice(0, 6);
}

export function rollCrewRelationshipEvent(
  crew: CrewMember[],
  relations: CrewRelation[],
  statuses: CrewRelationshipStatus[],
  context: {
    dayCount: number;
    provisions: number;
    starving?: boolean;
    trigger?: 'daily' | 'voyage' | 'rest' | 'combat';
  },
): CrewRelationshipRollResult {
  const crewIds = new Set(crew.map(member => member.id));
  const activeRelations = relations.filter(relation => crewIds.has(relation.aId) && crewIds.has(relation.bId));
  const activeStatuses = statuses.filter(status =>
    status.expiresDay >= context.dayCount &&
    crewIds.has(status.crewId) &&
    crewIds.has(status.otherCrewId)
  );
  if (crew.length < 2) return { relations: activeRelations, statuses: activeStatuses };

  const baseChance = context.trigger === 'voyage' ? 0.45 : context.trigger === 'rest' ? 0.32 : context.trigger === 'combat' ? 0.36 : 0.16;
  const lowMorale = crew.filter(c => c.morale < 40).length;
  const healthTrouble = crew.filter(c => c.health !== 'healthy').length;
  const scarcity = context.starving || context.provisions <= crew.length * 2;
  const chance = baseChance + lowMorale * 0.025 + healthTrouble * 0.02 + (scarcity ? 0.16 : 0);
  if (Math.random() > chance) return { relations: activeRelations, statuses: activeStatuses };

  const a = pick(crew);
  const candidates = crew.filter(c => c.id !== a.id);
  const b = pick(candidates);
  const id = relationId(a.id, b.id);
  const existing = activeRelations.find(r => r.id === id);
  const comp = compatibility(a, b);
  const stress = (100 - Math.min(a.morale, b.morale)) / 5 + healthBurden(a.health) * 4 + healthBurden(b.health) * 4 + (scarcity ? 18 : 0);
  const newRelation: CrewRelation = existing
    ? { ...existing }
    : { id, aId: a.id, bId: b.id, affinity: clamp(10 + comp / 2, -40, 55), tension: clamp(18 - comp / 3, 0, 60), tags: [], lastEventDay: context.dayCount };

  const aFaith = inferredFaith(a);
  const bFaith = inferredFaith(b);
  let tag = 'watch';
  let tone: CrewRelationTone = 'bond';
  let severity = 22;
  let aText = `Keeping an easier watch with ${b.name}`;
  let bText = `Keeping an easier watch with ${a.name}`;
  let publicEvent: CrewRelationshipRollResult['publicEvent'];

  const religiousDifference = aFaith !== bFaith;
  const hardReligiousFault =
    (aFaith === 'Catholic' && bFaith === 'Protestant') ||
    (aFaith === 'Protestant' && bFaith === 'Catholic') ||
    (aFaith === 'Sunni' && bFaith === 'Shia') ||
    (aFaith === 'Shia' && bFaith === 'Sunni');

  const roll = Math.random();
  if ((scarcity && roll < 0.38) || Math.min(a.morale, b.morale) < 30) {
    tag = 'rations';
    tone = 'tension';
    severity = scarcity ? 72 : 58;
    newRelation.tension += 14 + Math.floor(stress / 5);
    newRelation.affinity -= 6;
    aText = `Feuding with ${b.name} over rations`;
    bText = `Feuding with ${a.name} over rations`;
  } else if (religiousDifference && (hardReligiousFault || roll < 0.58)) {
    tag = 'faith';
    tone = 'tension';
    severity = hardReligiousFault ? 74 : 56;
    newRelation.tension += hardReligiousFault ? 18 : 11;
    newRelation.affinity -= hardReligiousFault ? 9 : 4;
    const subject = hardReligiousFault ? 'worship on deck' : 'prayer customs';
    aText = `At odds with ${b.name} over ${subject}`;
    bText = `At odds with ${a.name} over ${subject}`;
  } else if ((a.health !== 'healthy' || b.health !== 'healthy') && roll < 0.72) {
    const patient = a.health !== 'healthy' ? a : b;
    const helper = patient.id === a.id ? b : a;
    tag = 'care';
    tone = 'care';
    severity = 46;
    newRelation.affinity += 12;
    newRelation.tension = Math.max(0, newRelation.tension - 8);
    aText = patient.id === a.id ? `Being watched over by ${helper.name}` : `Watching over ${patient.name}`;
    bText = patient.id === b.id ? `Being watched over by ${helper.name}` : `Watching over ${patient.name}`;
  } else if (a.humours.sanguine + b.humours.sanguine >= 14 && roll < 0.82) {
    tag = 'fondness';
    tone = Math.random() < 0.45 ? 'secret' : 'bond';
    severity = tone === 'secret' ? 38 : 34;
    newRelation.affinity += 14;
    newRelation.tension = Math.max(0, newRelation.tension - 5);
    aText = tone === 'secret' ? `Quietly fond of ${b.name}` : `Fast friends with ${b.name}`;
    bText = tone === 'secret' ? `Quietly fond of ${a.name}` : `Fast friends with ${a.name}`;
  } else {
    tag = a.role === b.role ? 'rivalry' : 'respect';
    tone = tag === 'rivalry' ? 'tension' : 'bond';
    severity = tag === 'rivalry' ? 48 : 30;
    newRelation.affinity += tag === 'respect' ? 8 : -4;
    newRelation.tension += tag === 'rivalry' ? 10 : -4;
    aText = tag === 'rivalry' ? `Competing with ${b.name} for standing` : `Trusts ${b.name}'s judgment`;
    bText = tag === 'rivalry' ? `Competing with ${a.name} for standing` : `Trusts ${a.name}'s judgment`;
  }

  newRelation.affinity = clamp(newRelation.affinity, -100, 100);
  newRelation.tension = clamp(newRelation.tension, 0, 100);
  newRelation.lastEventDay = context.dayCount;
  if (!newRelation.tags.includes(tag)) newRelation.tags = [...newRelation.tags, tag].slice(-4);

  const nextRelations = [...activeRelations.filter(r => r.id !== id), newRelation];
  let nextStatuses = activeStatuses;
  const expiresDay = context.dayCount + 10 + Math.floor(Math.random() * 8);
  nextStatuses = pushStatus(nextStatuses, {
    id: statusId(context.dayCount, a.id, b.id, tag),
    crewId: a.id,
    otherCrewId: b.id,
    text: aText,
    tone,
    severity,
    createdDay: context.dayCount,
    expiresDay,
  });
  if (severity >= 46 || Math.random() < 0.45) {
    nextStatuses = pushStatus(nextStatuses, {
      id: statusId(context.dayCount, b.id, a.id, tag),
      crewId: b.id,
      otherCrewId: a.id,
      text: bText,
      tone,
      severity: Math.max(20, severity - 4),
      createdDay: context.dayCount,
      expiresDay,
    });
  }

  if (newRelation.tension >= 78 && severity >= 56) {
    publicEvent = {
      title: tag === 'faith' ? 'Crew Religious Dispute' : 'Crew Quarrel',
      text: tag === 'faith'
        ? `${a.name} and ${b.name} argued over ${hardReligiousFault ? 'worship on deck' : 'prayer customs'}. The matter is not settled.`
        : `${a.name} and ${b.name} nearly came to blows. The crew gave them room.`,
      type: 'warning',
    };
  } else if (newRelation.affinity >= 76 && tone !== 'secret' && Math.random() < 0.35) {
    publicEvent = {
      title: 'Crew Bond',
      text: `${a.name} and ${b.name} have begun looking out for one another.`,
      type: 'success',
    };
  }

  return { relations: nextRelations, statuses: nextStatuses, publicEvent };
}
