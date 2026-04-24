import type { CrewMember, Language } from '../store/gameStore';
import type { NPCShipIdentity } from './npcShipGenerator';
import { COMMODITY_DEFS, type Commodity } from './commodities';

export type HailMood = 'HOSTILE' | 'COLD' | 'WARY' | 'CORDIAL' | 'WARM';
export type HailAction = 'news' | 'trade' | 'bearing' | 'leave';

export const DEFAULT_BARTER_QTY = 3;
export const BARTER_CANDIDATE_POOL = 3;

export function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function pickStable<T>(items: T[], key: string): T {
  return items[hashString(key) % items.length];
}

export function getHailMood(rep: number): HailMood {
  if (rep <= -60) return 'HOSTILE';
  if (rep <= -25) return 'COLD';
  if (rep >= 60) return 'WARM';
  if (rep >= 25) return 'CORDIAL';
  return 'WARY';
}

export function getHailMoodColor(mood: HailMood): string {
  if (mood === 'HOSTILE') return '#f87171';
  if (mood === 'COLD') return '#f59e0b';
  if (mood === 'CORDIAL') return '#86efac';
  if (mood === 'WARM') return '#34d399';
  return '#cbd5e1';
}

export function getHailGreeting(npc: NPCShipIdentity, mood: HailMood): string {
  const lines: Record<HailMood, string[]> = {
    HOSTILE: [
      `Keep off. One more cable and we fire.`,
      `We know your flag. Hold your course away from us.`,
      `No talk. No trade. Stand clear.`,
    ],
    COLD: [
      `State your business and keep your guns quiet.`,
      `We will answer once. Make it useful.`,
      `Speak plainly. We have no wish to linger.`,
    ],
    WARY: [
      `Fair water. What do you need?`,
      `We hear you. Keep a respectful distance.`,
      `Their master answers. Be quick about it.`,
    ],
    CORDIAL: [
      `Fair winds. We have news if you need it.`,
      `Good sailing to you. What word do you seek?`,
      `Come no closer, friend, but speak freely.`,
    ],
    WARM: [
      `Well met. We will help where we can.`,
      `A welcome sail. Ask what you need.`,
      `Good fortune to you. Our deck has news and cargo to spare.`,
    ],
  };
  return pickStable(lines[mood], npc.id + mood);
}

export function bearingFromTo(
  from: [number, number, number],
  to: [number, number, number],
): string {
  const dx = to[0] - from[0];
  const dz = to[2] - from[2];
  const angle = (Math.atan2(dx, dz) + Math.PI * 2) % (Math.PI * 2);
  const points = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
  return points[Math.round(angle / (Math.PI / 4)) % points.length];
}

export const UNTRANSLATED_HAIL: Record<Language, string> = {
  Arabic: 'لا أفهمك. سأمضي في طريقي.',
  Persian: 'سخنت را نمی‌فهمم. راه خود را می‌روم.',
  Gujarati: 'હું તમને સમજતો નથી. હું મારા રસ્તે જાઉં છું.',
  Hindustani: 'मैं तुम्हारी बात नहीं समझता। मैं अपने रास्ते जाऊँगा।',
  Portuguese: 'Não vos entendo. Sigo o meu caminho.',
  Dutch: 'Ik versta u niet. Ik vaar verder.',
  English: "I cannot understand you. I'll be on my way.",
  Spanish: 'No os entiendo. Seguiré mi rumbo.',
  French: 'Je ne vous comprends pas. Je poursuis ma route.',
  Italian: 'Non vi capisco. Vado per la mia strada.',
  Turkish: 'Sizi anlamıyorum. Yoluma devam edeceğim.',
  Malay: 'Aku tidak faham. Aku akan meneruskan pelayaran.',
  Swahili: 'Sikuelewi. Nitaendelea na safari yangu.',
  Chinese: '我听不懂你。我继续走我的航路。',
  Japanese: '何を言っているかわからぬ。このまま進む。',
};

export const LANGUAGE_COLOR: Record<Language, string> = {
  Portuguese: '#e6b355',
  Spanish:    '#e6b355',
  Italian:    '#e6b355',
  Dutch:      '#7fb69a',
  English:    '#7fb69a',
  French:     '#7fb69a',
  Arabic:     '#d89366',
  Persian:    '#d89366',
  Turkish:    '#d89366',
  Hindustani: '#e39a5a',
  Gujarati:   '#e39a5a',
  Chinese:    '#9fc7b1',
  Japanese:   '#9fc7b1',
  Malay:      '#7ec0b4',
  Swahili:    '#7ec0b4',
};

export const CARGO_SCENT: Partial<Record<Commodity, string>> = {
  Cloves: 'clove and tar on the air',
  'Black Pepper': 'dry pepper and rope',
  Nutmeg: 'nutmeg and salt',
  Cinnamon: 'cinnamon bark in the breeze',
  Coffee: 'roasted coffee somewhere aft',
  Sugar: 'molasses-sweet',
  Rice: 'dry rice dust on the deck',
  Indigo: 'indigo-stained sacks stacked forward',
  Frankincense: 'frankincense, resinous and heavy',
  Myrrh: 'resinous myrrh',
  Tea: 'green tea and cedar crates',
  Saffron: 'saffron, sharp and earthy',
  Iron: 'iron and oil',
  Tobacco: 'cured tobacco on the wind',
  'Small Shot': 'powder and brass',
  Timber: 'raw pine and pitch',
  Benzoin: 'benzoin resin',
  Camphor: 'sharp camphor',
  Ambergris: 'a trace of ambergris',
  Cardamom: 'cardamom pods',
  'Rose Water': 'sweet rose water',
};

export const DISPOSITION_POSTURE: Record<HailMood, string[]> = {
  HOSTILE: [
    'The crew stands at their swivels. Words are snapped across the water.',
    'Gunners crouch behind the rail. The master shouts, not greets.',
  ],
  COLD: [
    'The master signals, terse. His men do not smile.',
    'They keep their distance, and their hands near their weapons.',
  ],
  WARY: [
    'The master raises a hand in greeting. His crew watches yours.',
    'A cautious hail — polite enough, but no one lowers their guard.',
  ],
  CORDIAL: [
    'The master calls across in a steady voice.',
    'Hands stay clear of the guns. The master hails you plainly.',
  ],
  WARM: [
    'The master waves broadly, a welcome in his voice.',
    'His crew leans over the rail, grinning, glad of company.',
  ],
};

export function getCrewLanguages(member: CrewMember): Language[] {
  return member.languages ?? [];
}

export function pickTranslator(crew: CrewMember[], language: Language): CrewMember | null {
  const roleRank: Record<string, number> = {
    Factor: 5,
    Navigator: 4,
    Captain: 3,
    Surgeon: 2,
    Sailor: 1,
    Gunner: 1,
  };
  return crew
    .filter((member) => getCrewLanguages(member).includes(language))
    .sort((a, b) =>
      (roleRank[b.role] ?? 0) - (roleRank[a.role] ?? 0) ||
      b.stats.charisma - a.stats.charisma ||
      b.skill - a.skill
    )[0] ?? null;
}

export function dominantCommodity(cargo: Partial<Record<Commodity, number>>): Commodity | null {
  let best: Commodity | null = null;
  let bestQty = 0;
  for (const [c, qty] of Object.entries(cargo)) {
    if ((qty ?? 0) > bestQty) {
      best = c as Commodity;
      bestQty = qty ?? 0;
    }
  }
  return best;
}

export function getDraftCondition(cargo: Partial<Record<Commodity, number>>): string {
  const total = Object.values(cargo).reduce<number>((sum, qty) => sum + (qty ?? 0), 0);
  if (total >= 24) return 'sitting deep';
  if (total >= 10) return 'steady in the water';
  return 'riding high';
}

export function capitalizeFirst(s: string): string {
  return s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1);
}

export function buildImpression(
  npc: NPCShipIdentity,
  mood: HailMood,
): { sight: string; posture: string } {
  const draft = getDraftCondition(npc.cargo);
  const dom = dominantCommodity(npc.cargo);
  const scent = dom ? CARGO_SCENT[dom] : null;
  const sight = scent
    ? `${capitalizeFirst(npc.appearancePhrase)}, ${draft}. ${capitalizeFirst(scent)}.`
    : `${capitalizeFirst(npc.appearancePhrase)}, ${draft}.`;
  const posture = pickStable(DISPOSITION_POSTURE[mood], npc.id + mood + 'posture');
  return { sight, posture };
}

export function moodMarkup(mood: HailMood): number {
  return mood === 'WARM' ? 1.0
    : mood === 'CORDIAL' ? 1.2
    : mood === 'WARY' ? 1.5
    : mood === 'COLD' ? 2.0
    : 3.0;
}

export function commodityUnitValue(c: Commodity): number {
  const def = COMMODITY_DEFS[c];
  return (def.basePrice[0] + def.basePrice[1]) / 2;
}

export interface BarterCounterOffer {
  theirGood: Commodity;
  theirQty: number;
}

/**
 * Given a concrete player offer, compute what the NPC offers back.
 * Picks stably among the NPC's top-N abundant commodities, seeded by
 * (npc.id + yourGood) so different offered goods draw different counters,
 * but the same offer always produces the same reply.
 */
export function getBarterCounterOffer(
  npc: NPCShipIdentity,
  yourGood: Commodity,
  yourQty: number,
  mood: HailMood,
): BarterCounterOffer | null {
  const candidates = (Object.entries(npc.cargo) as [Commodity, number][])
    .filter(([c, qty]) => (qty ?? 0) > 0 && c !== yourGood)
    .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0))
    .slice(0, BARTER_CANDIDATE_POOL);
  if (candidates.length === 0) return null;

  const pick = hashString(npc.id + yourGood) % candidates.length;
  const [theirGood, theirHave] = candidates[pick];
  const yourValue = commodityUnitValue(yourGood) * yourQty;
  const effective = yourValue / moodMarkup(mood);
  const theirUnit = commodityUnitValue(theirGood);
  const theirQty = Math.max(1, Math.min(theirHave ?? 0, Math.round(effective / theirUnit)));
  if (theirQty < 1) return null;
  return { theirGood, theirQty };
}

/**
 * Captain's dialogue reacting to the player's current offer, mood-sensitive.
 */
export function getBarterDialogue(
  mood: HailMood,
  yourGood: Commodity | null,
  yourQty: number,
  counter: BarterCounterOffer | null,
): string {
  if (!yourGood) {
    if (mood === 'WARM') return `Gladly — what will you offer? Show us what you carry.`;
    if (mood === 'CORDIAL') return `Fair enough. What would you put on the table?`;
    return `What do you carry? Let us see it before we talk numbers.`;
  }
  if (!counter) {
    return `We've no stock to spare against that. Try something else.`;
  }
  if (mood === 'WARM') {
    return `${yourGood}, good stock! We can part with ${counter.theirQty} ${counter.theirGood} for your ${yourQty}.`;
  }
  if (mood === 'CORDIAL') {
    return `Ah, ${yourGood}. Fair trade — ${counter.theirQty} ${counter.theirGood} for your ${yourQty}.`;
  }
  return `${yourGood}, eh? Your ${yourQty} is worth ${counter.theirQty} ${counter.theirGood} to me, no more.`;
}

/**
 * Tracks which NPC translations have already awarded XP/reputation this session.
 * Prevents the player from farming rep by repeatedly hailing the same ship.
 */
const awardedTranslations = new Set<string>();

export function hasAwardedTranslation(npcId: string): boolean {
  return awardedTranslations.has(npcId);
}

export function markAwardedTranslation(npcId: string): void {
  awardedTranslations.add(npcId);
}
