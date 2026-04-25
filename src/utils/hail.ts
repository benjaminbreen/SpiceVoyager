import type { CrewMember, Language } from '../store/gameStore';
import type { NPCShipIdentity } from './npcShipGenerator';
import { COMMODITY_DEFS, type Commodity } from './commodities';

export type HailMood = 'HOSTILE' | 'COLD' | 'WARY' | 'CORDIAL' | 'WARM';
export type HailAction =
  | 'news'
  | 'trade'
  | 'portIntel'
  | 'leave'
  | 'collision_apologize'
  | 'collision_pay'
  | 'collision_ignore'
  | 'collision_threaten'
  | 'warning_alter_course'
  | 'warning_pay_toll'
  | 'warning_ignore'
  | 'warning_threaten';

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

// ── Port-picker prompts ────────────────────────────────────────────
// Said by an NPC captain while the player is choosing which of his
// visited ports to ask about. Picked deterministically from the npc.id
// so the line is stable across re-renders within a single picker
// session, but varies between encounters.

const PORT_PICKER_MOOD: Record<HailMood, string[]> = {
  HOSTILE: [
    `One word. Which port. Then we part.`,
    `Speak — but I owe you nothing.`,
    `Quickly, before my temper turns.`,
    `Name it. I have no patience for your kind.`,
    `Ask, and have done with us.`,
  ],
  COLD: [
    `Choose. I will not stand here all watch.`,
    `Be brief. Which port.`,
    `Name it and have done.`,
    `One question. Then we are away.`,
    `If it must be asked, ask it.`,
    `Pick the place. No more than that.`,
  ],
  WARY: [
    `Which port? Be quick about it.`,
    `Name it, and I will see what I can tell.`,
    `Which one? I have business waiting.`,
    `Pick the place. I will speak briefly.`,
    `If you must ask — choose.`,
    `Speak the name. We can spare a moment.`,
    `Out with it. Which harbour?`,
  ],
  CORDIAL: [
    `Speak the port. I will tell what I have seen.`,
    `Which one? My memory holds enough.`,
    `Name it. A captain owes another captain that much.`,
    `I have run a few coasts. Pick your port.`,
    `Choose, and I will give you the lay of the harbour.`,
    `Ask freely. What we know, you may know.`,
    `Which place would you have? I will be plain.`,
  ],
  WARM: [
    `Many waters, friend. Which would you have me speak of?`,
    `Gladly. Name the place and I will tell what I know.`,
    `I have run many coasts. Choose one and I will paint it for you.`,
    `Speak the port — anchorage, holders, who weighs his hand on the scales.`,
    `Of which shall I tell? Spare nothing of your asking.`,
    `Ask, and ask thoroughly. We have time enough.`,
    `A captain's gift to another. Which port?`,
  ],
};

// Role-flavoured variants. Used in WARY/CORDIAL/WARM moods only — a
// hostile captain doesn't pause to characterise his trade.
const PORT_PICKER_ROLE: Partial<Record<string, string[]>> = {
  'pilgrim carrier': [
    `I run the faithful between holy places. Which port do you ask of?`,
    `My deck has carried hajjis and traders both. Name the place.`,
  ],
  'privateer': [
    `What I know I took from fatter ships. Choose.`,
    `I have smelled the smoke of half these harbours. Which one?`,
  ],
  'smuggler': [
    `I do not write down where I have been. But ask, and we will see.`,
    `Some ports remember me. Some prefer not to. Which?`,
  ],
  'spice convoy': [
    `Spice and silk and salt — choose your port.`,
    `I have run with the convoys. Pick a harbour.`,
  ],
  'horse transport': [
    `I run horses up the gulf. Pick a place I might have watered.`,
    `My hold is straw and beasts more often than not. Which port?`,
  ],
  'armed patrol': [
    `I have stood guard off most of these coasts. Which?`,
    `I know the lee of every fort here. Speak.`,
  ],
  'coastal trader': [
    `I work the same waters year on year. Which port?`,
    `I touch a dozen harbours each monsoon. Name one.`,
  ],
  'fisherman': [
    `I'm only a fisherman. But ask, if you like.`,
  ],
  'courier': [
    `I run despatches more than cargo. Which port?`,
    `My business is letters and small chests. Speak the place.`,
  ],
  'blue-water merchant': [
    `I have crossed open ocean for trade. Choose your port.`,
    `My logbook runs to many coasts. Which one?`,
  ],
};

// Tradition flourishes — tacked onto the front of a base line for
// flavour. Kept short and culturally plausible. Empty entries fall
// through to the plain mood line.
const PORT_PICKER_PREFIX: Partial<Record<string, string[]>> = {
  portuguese_estado:    [`By Santa Maria,`, `Por Deus,`],
  portuguese_atlantic:  [`By Santa Maria,`, `Por Deus,`],
  spanish_atlantic:     [`Por la Virgen,`, `Hombre,`],
  english_eic:          [`By God,`, `Well,`],
  english_atlantic:     [`By God,`, `Well now,`],
  french_atlantic:      [`Par Dieu,`, `Eh bien,`],
  dutch_voc:            [`Bij God,`, `Wel,`],
  dutch_atlantic:       [`Bij God,`, `Kom,`],
  gujarati_merchant:    [`Ram Ram,`, `Bhai,`],
  mughal_surati:        [`Bismillah,`, `Sahib,`],
  omani_dhow:           [`Bismillah,`, `Wallahi,`],
  persian_gulf:         [`Bismillah,`, `Saheb,`],
  ottoman_red_sea:      [`Bismillah,`, `Effendi,`],
  swahili_coaster:      [`Insha'Allah,`, `Bwana,`],
  malay_prau:           [`Demi Allah,`, `Tuan,`],
  acehnese_raider:      [`Demi Allah,`],
  javanese_jong:        [`Demi Allah,`, `Tuan,`],
  chinese_junk:         [`Aiyah,`],
  japanese_red_seal:    [],
  local_caribbean:      [`Hombre,`, `Bueno,`],
};

export function getPortPickerPrompt(npc: NPCShipIdentity, mood: HailMood): string {
  const seed = npc.id + 'picker';

  // Friendly captains may volunteer a role-flavoured opener instead of
  // a generic one. Roughly 1 in 3 of the time, only on WARY+ moods.
  if (mood !== 'HOSTILE' && mood !== 'COLD') {
    const rolePool = PORT_PICKER_ROLE[npc.role];
    if (rolePool && rolePool.length > 0 && hashString(seed + 'role') % 3 === 0) {
      return pickStable(rolePool, seed + 'rolepick');
    }
  }

  const base = pickStable(PORT_PICKER_MOOD[mood], seed + 'mood');

  // ~35% chance of a tradition prefix. Hostile captains skip it.
  if (mood !== 'HOSTILE') {
    const prefixPool = PORT_PICKER_PREFIX[npc.traditionId];
    if (prefixPool && prefixPool.length > 0 && hashString(seed + 'prefix') % 100 < 35) {
      const prefix = pickStable(prefixPool, seed + 'prefixpick');
      return `${prefix} ${base.charAt(0).toLowerCase()}${base.slice(1)}`;
    }
  }

  return base;
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

export const ROMANIZED_COLLISION_HAIL: Record<Language, string[]> = {
  Arabic: [
    'YA MAJNUN!! MADHA FAALT?!',
    'YA MAJNUN!! MADHA FAALT?! KASARTA JANB AL-SAFINA! QUL KANA KHATA, WA ILLA NARMIKUM BIL-MADAFI!!',
    'WALLAH, A ANTA AAMA?! DARABTANA KA-L-HIMAR! IBTAID AW IDFA THAMAN AL-KHASARA!!',
  ],
  Persian: [
    'KHODAYA!! CHE KARDI, AHMAQ?!',
    'KHODAYA!! CHE KARDI, MARD-E DIVANEH?! PAHLU-YE KESHTI RA SHEKASTI! BEGU KHATA BUD, VAGARNA JAVABASH RA MIGIRI!!',
    'HEY, BI-AQL!! MAGAR KUR SHODI?! KESHTI-YE MAN RA ZADI! YA JARIMEH BEDEH YA TOOP MIBINI!!',
  ],
  Gujarati: [
    'ARE PAGAL!! SHU KARYU?!',
    'ARE PAGAL!! SHU KARYU?! AMARI NAAVNU PAASU TODI NAKHYU! KAHO KE BHUL HATI, NAHI TO PARINAM BHOGVASHO!!',
    'O MURKH!! AANKH NATHI?! NAAVNE DHAKKA MARYO! HAVE MAAF MANGO KE BHUGTAN KARO!!',
  ],
  Hindustani: [
    'ARRE PAGAL!! KYA KIYA TUMNE?!',
    'ARRE PAGAL!! KYA KIYA TUMNE?! HAMARI KASHTI KA PAHLU TOD DIYA! KAHO YE HADSA THA, VARNA ANJAM BHUGTOGE!!',
    'O BE-AQL!! ANDHE HO KYA?! JAHAAZ SE TAKKAR MAARI! MAAF MANGO YA TOPEIN BOLENGI!!',
  ],
  Portuguese: [
    'QUE DIABO FOI ISSO?! ESTAIS LOUCO?!',
    'QUE DIABO FOI ISSO?! ESTAIS LOUCO?! ABRISTES O NOSSO COSTADO! DIZEI QUE FOI ACASO, OU HAVERA CONSEQUENCIAS!!',
    'CEGO DE TODO?! BATISTES COMO UM ASNO! PAGAI O DANO OU RESPONDEREIS AOS CANHOES!!',
  ],
  Dutch: [
    'WAT IN GODS NAAM WAS DAT?! ZIJT GIJ GEK?!',
    'WAT IN GODS NAAM WAS DAT?! ZIJT GIJ GEK?! GIJ HEBT ONZE ZIJDE GERAAKT! ZEG DAT HET ONGELUK WAS, OF GIJ ZULT BOETEN!!',
    'VERDOMDE DWAAS!! KIJKT GIJ NIET UIT?! BETAAL DE SCHADE OF WIJ LATEN DE STUKKEN SPREKEN!!',
  ],
  English: [
    'WHAT IN GODS NAME ARE YOU DOING, YOU UTTER FOOL?!',
    'WHAT IN GODS NAME WAS THAT?! ARE YOU MAD?! YOU STOVE IN OUR SIDE! SAY IT WAS AN ACCIDENT OR WE ANSWER WITH GUNS!!',
    'YOU BLIND FOOL!! KEEP YOUR HANDS OFF THE HELM IF YOU CANNOT STEER! PAY FOR THAT DAMAGE OR FACE CONSEQUENCES!!',
  ],
  Spanish: [
    'QUE EN NOMBRE DE DIOS HACEIS, NECIO?!',
    'QUE EN NOMBRE DE DIOS FUE ESO?! ESTAIS LOCO?! HABEIS ROTO NUESTRO COSTADO! DECID QUE FUE ACCIDENTE O HABRA CONSECUENCIAS!!',
    'MALDITO NECIO!! NO VEIS EL MAR DELANTE?! PAGAD EL DANO O HABLARAN LOS CANONES!!',
  ],
  French: [
    'NOM DE DIEU, QUE FAITES-VOUS, IMBECILE?!',
    'NOM DE DIEU, QU ETAIT-CE?! ETES-VOUS FOU?! VOUS AVEZ ENFONCE NOTRE BORD! DITES QUE C ETAIT ACCIDENT OU VOUS PAIEREZ!!',
    'ESPECE D IMBECILE!! VOUS NE SAVEZ PAS TENIR UN GOUVERNAIL?! PAYEZ LE DOMMAGE OU LES CANONS REPONDRONT!!',
  ],
  Italian: [
    'PER DIO, CHE FATE, SCIOCCO?!',
    'PER DIO, CHE COSA ERA?! SIETE PAZZO?! AVETE SFONDATO IL NOSTRO FIANCO! DITE CHE FU ACCIDENTE O PAGHERETE!!',
    'SCIOCCO CIECO!! NON SAPETE GOVERNARE?! PAGATE IL DANNO O PARLERANNO I CANNONI!!',
  ],
  Turkish: [
    'ALLAH ASKINA, NE YAPIYORSUN DELI?!',
    'ALLAH ASKINA, BU NEYDI?! DELI MISIN?! GEMININ YANINI KIRDIN! KAZA DE, YOKSA BEDELINI ODEYECEKSIN!!',
    'KOR MUSUN BE ADAM?! GEMIYE VURDUN! ZARARI ODE, YOKSA TOPLAR KONUSUR!!',
  ],
  Malay: [
    'APA DEMI TUHAN KAU BUAT, BODOH?!',
    'APA DEMI TUHAN ITU?! KAU GILA?! KAU PECAHKAN LAMBUNG KAPAL KAMI! KATAKAN INI SILAP, ATAU MERIAM MENJAWAB!!',
    'BODOH BUTA!! TAK NAMPAK LAUT DI DEPAN?! BAYAR ROSAKNYA ATAU TERIMA AKIBATNYA!!',
  ],
  Swahili: [
    'KWA MUNGU, UNAFANYA NINI, MPUMBAVU?!',
    'KWA MUNGU, HILO NI NINI?! UMEPAGAWA?! UMEPASUA UBAVU WA CHOMBO CHETU! SEMA ILIKUWA AJALI AU UTAJUTA!!',
    'MPUMBAVU WEWE!! HUNA MACHO?! LIPA UHARIBIFU AU MIZINGA ITAJIBU!!',
  ],
  Chinese: [
    'TIAN NA!! NI ZAI GAN SHENME, BEN DAN?!',
    'TIAN NA!! NI FENG LE MA?! NI ZHUANG HUAI LE WO MEN DE CHUANBANG! SHUO SHI SHIGU, FOUZE JIU KAI PAO!!',
    'XIA YAN DE BEN DAN!! BU HUI ZHANG DUO JIU BIE KAI CHUAN! PEI QIAN, BU RAN WO MEN KAI PAO!!',
  ],
  Japanese: [
    'KAMI YO!! NANI WO SHITE IRU, BAKA ME?!',
    'KAMI YO!! NANI WO SHITA?! KURUTTA KA?! WAREWARE NO FUNABARA WO KOWASHITA! AYAMARI DA TO IE, SARENeba UTSU!!',
    'KONO BAKA ME!! KAJI MO TORENU NO KA?! TSUGUNAE, SARENeba TEPPOU DE KOTAERU!!',
  ],
};

export const TRANSLATED_COLLISION_HAIL: string[] = [
  'WHAT IN GODS NAME ARE YOU DOING, YOU UTTER FOOL?!',
  'WHAT IN GODS NAME WAS THAT?! ARE YOU MAD?! YOU DAMAGED MY SHIP, YOU FOOL!! TELL ME THAT WAS AN ACCIDENT, OR YOU WILL FACE CONSEQUENCES!!',
  'YOU BLIND FOOL!! YOU STOVE IN OUR SIDE! APOLOGIZE NOW, OR PAY FOR IT WITH COIN OR GUNSMOKE!!',
  'KEEP YOUR HANDS OFF THE HELM IF YOU CANNOT STEER!! WAS THAT AN ACCIDENT, OR DO YOU MEAN TO START A FIGHT?!',
];

export function getCollisionHail(npc: NPCShipIdentity, translated: boolean): string {
  if (translated) return pickStable(TRANSLATED_COLLISION_HAIL, npc.id + 'collision-translated');
  return pickStable(ROMANIZED_COLLISION_HAIL[npc.hailLanguage] ?? ROMANIZED_COLLISION_HAIL.English, npc.id + 'collision-romanized');
}

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

export type SensoryKind = 'smell' | 'sight' | 'sound';
export interface SensoryImpression { kind: SensoryKind; text: string }

export function buildImpression(
  npc: NPCShipIdentity,
  mood: HailMood,
): { sight: string; posture: string; sense: SensoryImpression | null } {
  const draft = getDraftCondition(npc.cargo);
  const dom = dominantCommodity(npc.cargo);
  const scent = dom ? CARGO_SCENT[dom] : null;
  const sight = `${capitalizeFirst(npc.appearancePhrase)}, ${draft}.`;
  const posture = pickStable(DISPOSITION_POSTURE[mood], npc.id + mood + 'posture');
  const sense: SensoryImpression | null = scent ? { kind: 'smell', text: scent } : null;
  return { sight, posture, sense };
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
const collisionMemory = new Map<string, { count: number; lastDay: number }>();

export function hasAwardedTranslation(npcId: string): boolean {
  return awardedTranslations.has(npcId);
}

export function markAwardedTranslation(npcId: string): void {
  awardedTranslations.add(npcId);
}

export function recordCollisionGrievance(npcId: string, day: number): void {
  const current = collisionMemory.get(npcId);
  collisionMemory.set(npcId, {
    count: (current?.count ?? 0) + 1,
    lastDay: day,
  });
}

export function getCollisionGrievance(npcId: string): { count: number; lastDay: number } | null {
  return collisionMemory.get(npcId) ?? null;
}

export function getRememberedCollisionGreeting(npc: NPCShipIdentity, translated: boolean): string | null {
  const memory = getCollisionGrievance(npc.id);
  if (!memory) return null;
  if (!translated) {
    return pickStable(ROMANIZED_COLLISION_HAIL[npc.hailLanguage] ?? ROMANIZED_COLLISION_HAIL.English, npc.id + 'remembered-collision');
  }
  if (memory.count > 1) {
    return pickStable([
      `YOU AGAIN?! Keep that damned bow away from us!!`,
      `Still afloat, are you? Do not ram us a third time, you menace!!`,
      `There is the fool who struck us before. Speak quickly, and keep clear!!`,
    ], npc.id + 'remembered-collision-many');
  }
  return pickStable([
    `You again?! Have you learned to steer since you struck us?`,
    `I know that sail. You are the fool who hit us. Speak, but keep off!!`,
    `Back again? If this is another accident, I swear by God we fire!!`,
  ], npc.id + 'remembered-collision-one');
}
