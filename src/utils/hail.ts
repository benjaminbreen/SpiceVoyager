import type { CrewMember, Language, Nationality } from '../store/gameStore';
import type { NPCShipIdentity, RouteRole } from './npcShipGenerator';
import { COMMODITY_DEFS, type Commodity } from './commodities';

export interface HailGreetingContext {
  timeOfDay?: number; // 0-24, hours
  playerFlag?: Nationality;
}

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

// ── Hail greetings ────────────────────────────────────────────────
// The first thing a hailed captain calls across the water. Layered
// like the port-picker: a base mood line, optionally swapped for a
// role-flavoured variant, optionally fronted with a tradition prefix
// or a time-of-day fragment. All deterministic on npc.id so the line
// is stable for a given encounter.

const HAIL_MOOD: Record<HailMood, string[]> = {
  HOSTILE: [
    `Keep off. One more cable and we fire.`,
    `We know your flag. Hold your course away from us.`,
    `No talk. No trade. Stand clear.`,
    `Sheer off, or take the consequences.`,
    `Your colours are not welcome here. Fall away.`,
    `Another length and we open the ports. Choose.`,
    `We owe your kind nothing but powder. Stand off.`,
  ],
  COLD: [
    `State your business and keep your guns quiet.`,
    `We will answer once. Make it useful.`,
    `Speak plainly. We have no wish to linger.`,
    `Quickly. We have miles to make before dark.`,
    `Be brief. The sea owes us no patience.`,
    `Say what you need and let us be on.`,
    `One question. Then keep your distance.`,
  ],
  WARY: [
    `Fair water. What do you need?`,
    `We hear you. Keep a respectful distance.`,
    `Their master answers. Be quick about it.`,
    `You have our ear, briefly. Speak.`,
    `Hold there and tell us your business.`,
    `Close enough. What is it you want?`,
    `Speak across. We are listening.`,
    `A hail returned — what is it?`,
  ],
  CORDIAL: [
    `Fair winds. We have news if you need it.`,
    `Good sailing to you. What word do you seek?`,
    `Come no closer, friend, but speak freely.`,
    `A respectable sail. What can we tell you?`,
    `We are not in a hurry. Ask what you would.`,
    `Hail acknowledged. What brings you across?`,
    `We have time for a word. Speak.`,
    `A captain's courtesy — out with it.`,
  ],
  WARM: [
    `Well met. We will help where we can.`,
    `A welcome sail. Ask what you need.`,
    `Good fortune to you. Our deck has news and cargo to spare.`,
    `Friend on the water — speak, and freely.`,
    `By God, a friendly hail at last. Out with it.`,
    `We have weathered these seas long enough to share what we know.`,
    `Bring her alongside in spirit, if not in fact. What do you need?`,
    `A glad sail to find. Ask, and we will answer.`,
  ],
};

// Role-flavoured alternates. Used in WARY/CORDIAL/WARM only — a
// HOSTILE or COLD captain does not pause to characterise his trade.
// Roughly 1 in 3 friendly hails will draw from here instead of the
// base mood pool, giving the conversation more grain.
const HAIL_ROLE: Partial<Record<RouteRole, string[]>> = {
  'pilgrim carrier': [
    `We carry the faithful and what they bring with them. Speak.`,
    `Pilgrims aft, prayer mats forward. What is your need?`,
    `God's road runs over water too. Ask what you would.`,
  ],
  'privateer': [
    `We take what the law lets us. What do you want?`,
    `Our letters are in order, if that is your worry. Speak.`,
    `If you are not prey, you are welcome. Out with it.`,
  ],
  'smuggler': [
    `We do not write down our cargo. Be the same way and we will talk.`,
    `Quietly, friend. No need to shout our business across the water.`,
    `Some trades go better unrecorded. What is yours?`,
  ],
  'spice convoy': [
    `Our hold is heavy and our temper short. Be brief.`,
    `The convoy keeps its pace. Say it now or save it.`,
    `Spice and silk and a hundred mouths to feed. What do you want?`,
  ],
  'horse transport': [
    `Horses below — they hate a long hail. Quickly, then.`,
    `My deck stinks of straw and worse. Speak.`,
    `We run beasts up the gulf. What is your business?`,
  ],
  'armed patrol': [
    `These waters are ours to watch. Identify and state your business.`,
    `We answer to a flag. Be careful what you ask.`,
    `Patrol duty has its courtesies. Speak yours.`,
  ],
  'coastal trader': [
    `We work this coast year on year. What is it you need?`,
    `Same harbours, same monsoon. Ask, friend.`,
    `Small trade, honest enough. Out with it.`,
  ],
  'fisherman': [
    `Only a fishing boat, sir. But ask if you must.`,
    `The catch is light today. What is your business with us?`,
    `We've nothing worth taking but salt fish. Speak.`,
  ],
  'courier': [
    `We carry letters and small chests, no more. What word do you bring?`,
    `Despatches keep their hours. Be brief.`,
    `My hold is sealed and my time is paid for. Speak.`,
  ],
  'blue-water merchant': [
    `We have crossed open ocean to be here. Make it worth our hailing.`,
    `My logbook runs to many coasts. What would you have?`,
    `Long water behind us, longer ahead. Speak.`,
  ],
  'ferry': [
    `Passengers below, all paying. Quickly, what is it?`,
    `We run the strait twice a day. Say your piece.`,
  ],
};

// Time-of-day openers. Tacked onto friendly greetings only — a
// hostile captain does not remark on the light. Bucketed coarsely
// (dawn/dusk/night). Daylight hours go unprefixed.
const HAIL_TIME_PREFIX: Record<'dawn' | 'dusk' | 'night', string[]> = {
  dawn: [
    `First light, and a hail —`,
    `Before the sun is full,`,
    `Early on the water, are you?`,
  ],
  dusk: [
    `Last of the light —`,
    `While we still have the watch,`,
    `Before the dark closes —`,
  ],
  night: [
    `By lantern, then —`,
    `Strange hour for a hail, but —`,
    `The dark gives us time, at least.`,
  ],
};

function timeBucket(hour: number): 'dawn' | 'dusk' | 'night' | null {
  if (hour >= 4 && hour < 7) return 'dawn';
  if (hour >= 17 && hour < 20) return 'dusk';
  if (hour >= 20 || hour < 4) return 'night';
  return null;
}

function decapitalize(s: string): string {
  return s.length === 0 ? s : s.charAt(0).toLowerCase() + s.slice(1);
}

export function getHailGreeting(
  npc: NPCShipIdentity,
  mood: HailMood,
  ctx: HailGreetingContext = {},
): string {
  const seed = npc.id + mood;

  if (ctx.playerFlag === 'Pirate') {
    const piratePool = mood === 'HOSTILE' || mood === 'COLD'
      ? [
          `Black flag. Keep off, or we fire.`,
          `We see your colours. Stand away from us.`,
          `No closer. We will not be taken for easy prey.`,
          `That flag buys you no courtesy here. Speak from where you are.`,
        ]
      : [
          `Black flag or no, keep your distance and speak.`,
          `We see your colours. Say your piece quickly.`,
          `A hard flag to trust. What do you want?`,
          `Hold there. We will hear you, but no closer.`,
        ];
    return pickStable(piratePool, seed + 'pirate');
  }

  // Friendly captains may volunteer a role-flavoured opener instead
  // of a generic one. Roughly 1 in 3, only on WARY+ moods.
  let line: string;
  const rolePool = HAIL_ROLE[npc.role];
  const useRole =
    mood !== 'HOSTILE' &&
    mood !== 'COLD' &&
    rolePool &&
    rolePool.length > 0 &&
    hashString(seed + 'role') % 3 === 0;
  if (useRole) {
    line = pickStable(rolePool!, seed + 'rolepick');
  } else {
    line = pickStable(HAIL_MOOD[mood], seed + 'mood');
  }

  // ~30% chance of a tradition prefix. Hostile captains skip it.
  if (mood !== 'HOSTILE') {
    const prefixPool = PORT_PICKER_PREFIX[npc.traditionId];
    if (prefixPool && prefixPool.length > 0 && hashString(seed + 'prefix') % 100 < 30) {
      const prefix = pickStable(prefixPool, seed + 'prefixpick');
      line = `${prefix} ${decapitalize(line)}`;
    }
  }

  // ~25% chance of a time-of-day fragment, friendly moods only.
  if ((mood === 'CORDIAL' || mood === 'WARM') && typeof ctx.timeOfDay === 'number') {
    const bucket = timeBucket(ctx.timeOfDay);
    if (bucket && hashString(seed + 'tod') % 4 === 0) {
      const todPool = HAIL_TIME_PREFIX[bucket];
      const todLine = pickStable(todPool, seed + 'todpick');
      line = `${todLine} ${decapitalize(line)}`;
    }
  }

  return line;
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
  Khoekhoe: 'I do not know your words. I go on.',
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
  Khoekhoe: [
    'HAO!! WATCH THE WATER!',
    'HAO!! YOU STRUCK US! SAY IT WAS MISTAKE OR PAY FOR THE DAMAGE!!',
    'KEEP OFF OUR SIDE!! CATTLE TRADERS STEER BETTER THAN THAT!!',
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
  Khoekhoe:   '#c8a060',
};

export type SensoryKind = 'smell' | 'sight' | 'sound';
export interface SensoryImpression { kind: SensoryKind; text: string }

// Cargo impressions across smell, sight, and sound. Most goods do
// have a smell, but some are best described by what you can see
// across the water (lashed crates, oilskin bundles, stacked bars)
// or by what you can hear (porcelain in straw, glass in crates).
// One commodity may carry several entries — buildImpression picks
// stably per NPC, so the same captain always shows the same one
// but two captains hauling the same good will not match.
export const CARGO_IMPRESSION: Partial<Record<Commodity, SensoryImpression[]>> = {
  // ── Tier 1: spices & stimulants ──
  Cloves: [
    { kind: 'smell', text: 'clove and tar on the air' },
    { kind: 'sight', text: 'small jute sacks of dark cloves stacked forward' },
  ],
  'Black Pepper': [
    { kind: 'smell', text: 'dry pepper, faintly stinging' },
    { kind: 'sight', text: 'pepper-sacks piled forward, jute and brown' },
  ],
  Nutmeg: [
    { kind: 'smell', text: 'nutmeg and salt' },
    { kind: 'sight', text: 'small wooden barrels of nutmeg lashed against the mast' },
  ],
  Cinnamon: [
    { kind: 'smell', text: 'cinnamon bark in the breeze' },
    { kind: 'sight', text: 'bundles of pale cinnamon quills tied with cord' },
  ],
  Coffee: [
    { kind: 'smell', text: 'roasted coffee somewhere aft' },
    { kind: 'sight', text: 'sacks of green coffee beans lashed near the mast' },
  ],
  Tea: [
    { kind: 'smell', text: 'green tea and cedar crates' },
    { kind: 'sight', text: 'cedar tea-chests stacked neatly under canvas' },
  ],
  Saffron: [
    { kind: 'smell', text: 'saffron, sharp and earthy' },
  ],
  Cardamom: [
    { kind: 'smell', text: 'cardamom pods' },
    { kind: 'sight', text: 'pale green cardamom pods spilling from a low basket' },
  ],
  Ginger: [
    { kind: 'smell', text: 'dried ginger, sharp and woody' },
    { kind: 'sight', text: 'pale ginger root piled in shallow baskets' },
  ],
  'Star Anise': [
    { kind: 'smell', text: 'star anise, sweet and licorice-bright' },
    { kind: 'sight', text: 'star-shaped pods spilled across a low crate' },
  ],
  Tobacco: [
    { kind: 'smell', text: 'cured tobacco on the wind' },
    { kind: 'sight', text: 'twists of cured tobacco hanging in the rigging to dry' },
  ],

  // ── Tier 2: drugs & medicines ──
  Opium: [
    { kind: 'smell', text: 'a heavy, sweet poppy-resin smell' },
    { kind: 'sight', text: 'oilskin-wrapped opium cakes stacked behind the mast under guard' },
  ],
  Camphor: [
    { kind: 'smell', text: 'sharp camphor' },
  ],
  Benzoin: [
    { kind: 'smell', text: 'benzoin resin, warm and balsamic' },
  ],
  Frankincense: [
    { kind: 'smell', text: 'frankincense, resinous and heavy' },
    { kind: 'sight', text: 'pale lumps of frankincense in shallow baskets' },
  ],
  Myrrh: [
    { kind: 'smell', text: 'resinous myrrh' },
  ],
  Rhubarb: [
    { kind: 'smell', text: 'dried rhubarb root, faintly sour' },
    { kind: 'sight', text: 'bundles of dark rhubarb root tied in twine' },
  ],
  'China Root': [
    { kind: 'smell', text: 'a peaty, bitter root smell' },
    { kind: 'sight', text: 'pale slices of china-root drying on a tray under canvas' },
  ],
  'Cassia Fistula': [
    { kind: 'smell', text: 'a faint molasses note from cassia pods' },
    { kind: 'sight', text: 'long brown cassia pods like dark fingers, bundled with cord' },
  ],
  Aloes: [
    { kind: 'smell', text: 'bitter aloes — medicinal, almost burnt' },
  ],
  Sassafras: [
    { kind: 'smell', text: 'sassafras, sweet and bark-like' },
    { kind: 'sight', text: 'reddish bark stripped and stacked in flat bundles' },
  ],
  Musk: [
    { kind: 'smell', text: 'animal musk, close and oily' },
    { kind: 'sight', text: 'a small locked box at the master’s feet' },
  ],
  Quicksilver: [
    { kind: 'sight', text: 'sealed iron flasks of quicksilver in a low rack, lashed twice' },
    { kind: 'sound', text: 'a strange heavy slosh from sealed flasks below as the swell shifts' },
  ],
  Tamarind: [
    { kind: 'smell', text: 'tamarind paste, sour and date-like' },
    { kind: 'sight', text: 'clay jars of dark tamarind paste sealed with cloth' },
  ],
  'Betel Nut': [
    { kind: 'smell', text: 'astringent betel and slaked lime' },
    { kind: 'sight', text: 'reddish betel nuts in baskets, and a smear of red on the rail where someone spat' },
  ],
  'Rose Water': [
    { kind: 'smell', text: 'sweet rose water' },
    { kind: 'sight', text: 'small glass flasks of rose-water packed in cloth-lined trays' },
  ],

  // ── Tier 3: staples & trade goods ──
  Indigo: [
    { kind: 'sight', text: 'indigo-stained sacks stacked forward' },
    { kind: 'smell', text: 'a faint chemical sourness from indigo cakes' },
  ],
  Iron: [
    { kind: 'sight', text: 'iron bars lashed in the well, dark and oiled' },
  ],
  Timber: [
    { kind: 'sight', text: 'long balks of timber lashed across the deck' },
    { kind: 'smell', text: 'raw pine and pitch' },
  ],
  Sugar: [
    { kind: 'smell', text: 'molasses-sweet' },
    { kind: 'sight', text: 'cones of brown sugar wrapped in coarse paper' },
  ],
  Rice: [
    { kind: 'sight', text: 'rice-sacks piled six high, weighing her down' },
    { kind: 'smell', text: 'dry rice dust on the deck' },
  ],
  Ivory: [
    { kind: 'sight', text: 'pale tusks lashed in oilcloth bundles' },
  ],
  'Chinese Porcelain': [
    { kind: 'sight', text: 'crate-straw piled forward, lashed tight' },
    { kind: 'sound', text: 'a soft chink of porcelain in the straw with each swell' },
  ],
  Pearls: [
    { kind: 'sight', text: 'small wax-sealed chests under guard at the stern' },
  ],
  'Red Coral': [
    { kind: 'sight', text: 'branches of red coral wrapped in cloth and stacked low' },
  ],
  Hides: [
    { kind: 'smell', text: 'salt-cured hides, sour and heavy' },
    { kind: 'sight', text: 'salt-stiff hides stacked tall, lashed with rope' },
  ],
  Wool: [
    { kind: 'smell', text: 'damp wool and lanolin' },
    { kind: 'sight', text: 'wool bales sweating in the heat, dark at the seams' },
  ],
  Horn: [
    { kind: 'sight', text: 'bundles of dark horn, the tips bound with twine' },
  ],

  // ── Tier 4: precious rarities ──
  Ambergris: [
    { kind: 'smell', text: 'a trace of ambergris' },
    { kind: 'sight', text: 'a small wax-sealed jar passed carefully between two hands' },
  ],
  'Bezoar Stones': [
    { kind: 'sight', text: 'small lacquered boxes brought up from below under guard' },
  ],
  Bhang: [
    { kind: 'smell', text: 'pungent bhang, herbal and resinous' },
  ],
  "Dragon's Blood": [
    { kind: 'smell', text: "dragon's blood resin, sharp and reddish" },
    { kind: 'sight', text: 'jars of dark red resin, sealed with wax' },
  ],
  'Virginia Tobacco': [
    { kind: 'smell', text: 'sweet Virginia leaf, distinct from the rest' },
    { kind: 'sight', text: 'long Virginia leaves bundled and pressed into hogsheads' },
  ],
  'Murano Glass': [
    { kind: 'sight', text: 'crates of straw-packed glass, handled too carefully for any other cargo' },
    { kind: 'sound', text: 'a faint clink from the crates whenever the deck moves' },
  ],
  'Japanese Silver': [
    { kind: 'sight', text: 'oiled cloth around stacked silver bars at the stern, two men always near' },
  ],

  // ── Tier 5: extraordinary ──
  Mumia: [
    { kind: 'smell', text: 'a sweet-rotten resinous smell from sealed jars' },
    { kind: 'sight', text: 'sealed clay jars of the kind apothecaries use, packed in straw' },
  ],
  'Lapis de Goa': [
    { kind: 'sight', text: 'a small leather case kept under the master’s eye' },
  ],
  Theriac: [
    { kind: 'smell', text: 'a complicated apothecary smell — opium, honey, herbs' },
    { kind: 'sight', text: 'small ceramic jars stamped with an apothecary’s mark' },
  ],

  // ── Venetian export ──
  'Venetian Soap': [
    { kind: 'smell', text: 'olive-oil soap, faintly perfumed' },
    { kind: 'sight', text: 'pale soap-cakes stacked in waxed crates' },
  ],

  // ── Provisions & ordnance ──
  'Small Shot': [
    { kind: 'sight', text: 'lead shot in linen sacks, dark with use' },
    { kind: 'sound', text: 'a faint metallic chink from the stacked sacks each time the deck rolls' },
  ],
  'Cannon Shot': [
    { kind: 'sight', text: 'iron balls stacked in racks at the gun-deck' },
  ],
  'Salted Meat': [
    { kind: 'smell', text: 'brine and salt-pork' },
    { kind: 'sight', text: 'casks of salt-pork, the seams dark with brine' },
  ],
  'War Rockets': [
    { kind: 'smell', text: 'sulphur and bamboo' },
    { kind: 'sight', text: 'long bamboo tubes lashed in their racks, heads sealed in oilskin' },
  ],
};

export const DISPOSITION_POSTURE: Record<HailMood, string[]> = {
  HOSTILE: [
    'The crew stands at their swivels. Words are snapped across the water.',
    'Gunners crouch behind the rail. The master shouts, not greets.',
    'Match-cord smoke trails from the lee rail. No one is smiling.',
    'Boys run powder up from below before the hail is even returned.',
    'The master barks one word and twenty hands move to the guns.',
    'A musket comes up to a port and stays there while he speaks.',
  ],
  COLD: [
    'The master signals, terse. His men do not smile.',
    'They keep their distance, and their hands near their weapons.',
    'A junior officer answers in his place — the master watches from aft.',
    'The hail comes back flat, all business, no welcome in it.',
    'His crew goes on with their work as if you were not there.',
    'He listens with one ear and one eye on his own deck.',
  ],
  WARY: [
    'The master raises a hand in greeting. His crew watches yours.',
    'A cautious hail — polite enough, but no one lowers their guard.',
    'He answers across the water, but keeps a man at the swivel behind him.',
    'The crew pauses their work and watches in silence as the master speaks.',
    'Hands stay near belts and rails. The master is courteous, not warm.',
    'He nods, slow, and lets his second do most of the talking.',
  ],
  CORDIAL: [
    'The master calls across in a steady voice.',
    'Hands stay clear of the guns. The master hails you plainly.',
    'A few of his crew come to the rail to listen, idly curious.',
    'He leans on the rail with the easy stance of a man not worried.',
    'A quiet exchange — civil, careful, captain to captain.',
    'He answers with the patience of a man who has done this a hundred times.',
  ],
  WARM: [
    'The master waves broadly, a welcome in his voice.',
    'His crew leans over the rail, grinning, glad of company.',
    'A boy is sent below for something — bread, perhaps, or news in a wrapped packet.',
    'The master laughs at the hail and answers without hurry.',
    'Two of his men shout greetings in their own tongue from the foremast.',
    'He calls back across the water with the warmth of an old friend, though you have never met.',
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

// Light, friendly-only flourishes that name a slice of the day. Used
// to colour the sight line for CORDIAL/WARM encounters when no scent
// is in play, so the impression varies even for empty holds.
const SIGHT_TIME_TAIL: Record<'dawn' | 'dusk' | 'night', string[]> = {
  dawn: [
    ' Her sails are pale in the early light.',
    ' Lanterns still burn at her stern.',
  ],
  dusk: [
    ' Her hull is dark against the low sun.',
    ' The last light catches her topsails.',
  ],
  night: [
    ' Her shape is half-guessed in the dark — only her stern lantern is sure.',
    ' Lantern-light shows little more than her rail.',
  ],
};

export function buildImpression(
  npc: NPCShipIdentity,
  mood: HailMood,
  ctx: HailGreetingContext = {},
): { sight: string; posture: string; sense: SensoryImpression | null } {
  const draft = getDraftCondition(npc.cargo);
  const dom = dominantCommodity(npc.cargo);
  const impressions = dom ? CARGO_IMPRESSION[dom] : undefined;
  const sense: SensoryImpression | null =
    impressions && impressions.length > 0
      ? pickStable(impressions, npc.id + 'sense')
      : null;

  let sight = `${capitalizeFirst(npc.appearancePhrase)}, ${draft}.`;

  // Add a time-of-day tail when there is no sensory hit to carry
  // the line — keeps neutral impressions from feeling identical
  // across encounters.
  if (!sense && typeof ctx.timeOfDay === 'number') {
    const bucket = timeBucket(ctx.timeOfDay);
    if (bucket && hashString(npc.id + 'sighttod') % 2 === 0) {
      const tail = pickStable(SIGHT_TIME_TAIL[bucket], npc.id + 'sighttodpick');
      sight = `${sight}${tail}`;
    }
  }

  const posture = pickStable(DISPOSITION_POSTURE[mood], npc.id + mood + 'posture');
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

// ── Barter dialogue ────────────────────────────────────────────────
// Three branches: (a) the player has not chosen a good to offer yet,
// (b) they have but we cannot counter, (c) we are countering. Each
// branch picks stably from a mood pool. Counter lines are templates
// taking (yourGood, yourQty, counter), with role and tier flavor on
// top to make the same captain sound like himself across encounters.

const BARTER_ASK: Record<HailMood, string[]> = {
  HOSTILE: [
    `Show what you carry — and be quick about it.`,
    `If we are trading at all, name your good now.`,
  ],
  COLD: [
    `What do you carry? Let us see it before we talk numbers.`,
    `Name a good. We have no time for browsing.`,
    `Open your hold to us in word, at least. What is on offer?`,
  ],
  WARY: [
    `What is it you would put up?`,
    `Name your good. Then we will see if we can do business.`,
    `Show us what you have. We will say if it interests us.`,
    `What are you carrying that you can spare?`,
  ],
  CORDIAL: [
    `Fair enough. What would you put on the table?`,
    `Name your good and we will weigh it honestly.`,
    `Show us what you have, captain. We will hear it out.`,
    `What do you offer? We are not in a rush to refuse.`,
  ],
  WARM: [
    `Gladly — what will you offer? Show us what you carry.`,
    `Bring it forward, friend. What is on your deck worth trading?`,
    `Name anything in your hold. Half a chance we will want it.`,
    `We are open to most things today. What do you have?`,
  ],
};

const BARTER_REJECT: string[] = [
  `We've no stock to spare against that. Try something else.`,
  `Nothing in our hold answers to that. What else have you?`,
  `That trade does not suit us. Show us another good.`,
  `We could not give you what you would want for it. Try another.`,
  `Not from this hold, no. Pick something else.`,
];

type BarterCounterLine = (yourGood: Commodity, yourQty: number, counter: BarterCounterOffer) => string;

const BARTER_COUNTER: Record<HailMood, BarterCounterLine[]> = {
  HOSTILE: [
    (g, q, c) => `${g}, then. Your ${q} buys you ${c.theirQty} ${c.theirGood}. Take it or get off our beam.`,
    (g, q, c) => `Fine. ${c.theirQty} ${c.theirGood} for your ${q} ${g}. No haggling.`,
  ],
  COLD: [
    (g, q, c) => `${g}. Your ${q} is worth ${c.theirQty} ${c.theirGood} to us. No more.`,
    (g, q, c) => `For ${q} ${g} we will give ${c.theirQty} ${c.theirGood}. Decide.`,
    (g, q, c) => `${c.theirQty} ${c.theirGood} for your ${q} ${g}. That is the figure.`,
  ],
  WARY: [
    (g, q, c) => `${g}, eh? Your ${q} is worth ${c.theirQty} ${c.theirGood} to me, no more.`,
    (g, q, c) => `${q} ${g} for ${c.theirQty} ${c.theirGood}. Fair, by the look of your goods.`,
    (g, q, c) => `We can do ${c.theirQty} ${c.theirGood} against your ${q} ${g}. Take a moment.`,
    (g, q, c) => `${g}. We will trade ${c.theirQty} ${c.theirGood} for your ${q}, no flourishes.`,
  ],
  CORDIAL: [
    (g, q, c) => `Ah, ${g}. Fair trade — ${c.theirQty} ${c.theirGood} for your ${q}.`,
    (g, q, c) => `${q} ${g}, then ${c.theirQty} ${c.theirGood} our way. Honest enough?`,
    (g, q, c) => `For your ${q} ${g} we can part with ${c.theirQty} ${c.theirGood}. A captain's bargain.`,
    (g, q, c) => `${g} we know well. ${c.theirQty} ${c.theirGood} for your ${q} suits us.`,
    (g, q, c) => `Done in fairness — ${c.theirQty} ${c.theirGood} against your ${q} ${g}.`,
  ],
  WARM: [
    (g, q, c) => `${g}, good stock! We can part with ${c.theirQty} ${c.theirGood} for your ${q}.`,
    (g, q, c) => `Gladly — ${c.theirQty} ${c.theirGood} for your ${q} ${g}. A handsome trade.`,
    (g, q, c) => `${g}! For ${q} of that we will give ${c.theirQty} ${c.theirGood}, with our blessing.`,
    (g, q, c) => `${q} ${g} for ${c.theirQty} ${c.theirGood}. May it serve you, friend.`,
    (g, q, c) => `${c.theirQty} ${c.theirGood} sounds right against your ${q} ${g}. We are agreed.`,
  ],
};

// Role-flavored counter alternates. Used for CORDIAL+ moods only —
// a hostile or cold captain is too curt to characterise. Roughly 1
// in 3, mirroring the greeting pattern.
const BARTER_COUNTER_ROLE: Partial<Record<RouteRole, BarterCounterLine[]>> = {
  smuggler: [
    (g, q, c) => `${g}? Quietly done. ${c.theirQty} ${c.theirGood} for your ${q}, and we never spoke.`,
    (g, q, c) => `No papers, no prices written down. ${c.theirQty} ${c.theirGood} against ${q} ${g}.`,
  ],
  'spice convoy': [
    (g, q, c) => `${g}. The convoy moves at dusk. ${c.theirQty} ${c.theirGood} for your ${q}, settle quickly.`,
    (g, q, c) => `Spice for ${g} — fair enough. ${c.theirQty} ${c.theirGood} for your ${q}, and we are away.`,
  ],
  privateer: [
    (g, q, c) => `${g}, taken at trade rather than grappling-iron. ${c.theirQty} ${c.theirGood} for your ${q}.`,
    (g, q, c) => `${q} ${g} buys ${c.theirQty} ${c.theirGood}. We earned ours hard — we will spend it the same way.`,
  ],
  fisherman: [
    (g, q, c) => `${g}? More than we usually see. ${c.theirQty} ${c.theirGood} is what we can spare for your ${q}.`,
    (g, q, c) => `${q} ${g} for ${c.theirQty} ${c.theirGood}. Honest enough for a fishing boat.`,
  ],
  'pilgrim carrier': [
    (g, q, c) => `God-willing, ${c.theirQty} ${c.theirGood} for your ${q} ${g} is a fair exchange.`,
    (g, q, c) => `For ${q} ${g} we will give ${c.theirQty} ${c.theirGood}. The pilgrims would call it just.`,
  ],
  'horse transport': [
    (g, q, c) => `${g}? Useful. ${c.theirQty} ${c.theirGood} for your ${q} — and mind the smell of the hold.`,
    (g, q, c) => `${q} ${g} for ${c.theirQty} ${c.theirGood}. Quickly — the horses do not love a long hail.`,
  ],
  courier: [
    (g, q, c) => `${q} ${g} against ${c.theirQty} ${c.theirGood}. We must keep our schedule.`,
  ],
};

// Optional flourish appended to the counter line based on the tier
// of the player's offered good. Luxury draws appraisal; bulk staples
// draw a workmanlike note. Friendly moods only.
const BARTER_LUXURY_TAIL: string[] = [
  ` That is fine stock — we know its worth.`,
  ` A captain does not see such cargo every voyage.`,
  ` Good of you to bring it our way.`,
];
const BARTER_BULK_TAIL: string[] = [
  ` Plain trade for plain goods.`,
  ` No flourishes — bulk for bulk.`,
];

/**
 * Captain's dialogue reacting to the player's current offer, mood-sensitive.
 * Adds role flavor and (for friendly moods) a tier-aware tail.
 */
export function getBarterDialogue(
  mood: HailMood,
  yourGood: Commodity | null,
  yourQty: number,
  counter: BarterCounterOffer | null,
  npc?: NPCShipIdentity,
): string {
  const seed = (npc?.id ?? 'anon') + (yourGood ?? '') + 'barter';

  if (!yourGood) {
    return pickStable(BARTER_ASK[mood], seed + 'ask');
  }
  if (!counter) {
    return pickStable(BARTER_REJECT, seed + 'reject');
  }

  // Role-flavored counter, ~1 in 3, friendly moods only.
  let line: string;
  const rolePool = npc ? BARTER_COUNTER_ROLE[npc.role] : undefined;
  const useRole =
    (mood === 'CORDIAL' || mood === 'WARM' || mood === 'WARY') &&
    rolePool &&
    rolePool.length > 0 &&
    hashString(seed + 'role') % 3 === 0;
  if (useRole) {
    line = pickStable(rolePool!, seed + 'rolepick')(yourGood, yourQty, counter);
  } else {
    const fn = pickStable(BARTER_COUNTER[mood], seed + 'pick');
    line = fn(yourGood, yourQty, counter);
  }

  // Tier-aware tail on friendly moods, ~40% chance.
  if ((mood === 'CORDIAL' || mood === 'WARM') && hashString(seed + 'tail') % 100 < 40) {
    const tier = COMMODITY_DEFS[yourGood].tier;
    if (tier >= 4) {
      line += pickStable(BARTER_LUXURY_TAIL, seed + 'luxtail');
    } else if (tier === 3 && yourQty >= 5) {
      line += pickStable(BARTER_BULK_TAIL, seed + 'bulktail');
    }
  }

  return line;
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
