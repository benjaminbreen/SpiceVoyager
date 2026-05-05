import type { Language, Nationality } from '../store/gameStore';

export const FACTION_NATIVE_LANGUAGE: Partial<Record<Nationality, Language>> = {
  English: 'English',
  Portuguese: 'Portuguese',
  Dutch: 'Dutch',
  Spanish: 'Spanish',
  French: 'French',
  Venetian: 'Italian',
  Pirate: 'Portuguese',
  Mughal: 'Hindustani',
  Gujarati: 'Gujarati',
  Persian: 'Persian',
  Ottoman: 'Turkish',
  Omani: 'Arabic',
  Swahili: 'Swahili',
  Khoikhoi: 'Khoekhoe',
  Malay: 'Malay',
  Acehnese: 'Malay',
  Javanese: 'Malay',
  Japanese: 'Japanese',
  Chinese: 'Chinese',
};

const RELATION_MODIFIERS: Partial<Record<Nationality, Partial<Record<Nationality, number>>>> = {
  Spanish: {
    Portuguese: 25,
    Dutch: -35,
    English: -30,
    French: -25,
  },
  Portuguese: {
    Spanish: 25,
    Dutch: -35,
    English: -30,
    Acehnese: -40,
    Malay: -25,
    Omani: -35,
    Ottoman: -35,
    Venetian: -12,
    Gujarati: -8,
    Mughal: -8,
  },
  Dutch: {
    Spanish: -35,
    Portuguese: -35,
    English: -8,
  },
  English: {
    Spanish: -30,
    Portuguese: -30,
    Dutch: -8,
  },
  French: {
    Spanish: -25,
    Portuguese: -8,
  },
  Venetian: {
    Portuguese: -12,
    Ottoman: 10,
    Persian: 10,
  },
  Pirate: {
    Portuguese: -35,
    Spanish: -35,
    Dutch: -30,
    English: -30,
    Ottoman: -25,
    Mughal: -20,
    Persian: -15,
    Omani: -12,
    Gujarati: -10,
    Swahili: -8,
  },
  Mughal: {
    Gujarati: 18,
    Persian: 12,
    Portuguese: -8,
  },
  Gujarati: {
    Mughal: 18,
    Omani: 12,
    Swahili: 12,
    Portuguese: -8,
  },
  Persian: {
    Mughal: 12,
    Omani: 12,
    Venetian: 10,
    Ottoman: -30,
  },
  Ottoman: {
    Portuguese: -35,
    Persian: -30,
    Venetian: 10,
    Omani: -12,
  },
  Omani: {
    Portuguese: -35,
    Gujarati: 12,
    Persian: 12,
    Swahili: 18,
    Ottoman: -12,
  },
  Swahili: {
    Omani: 18,
    Gujarati: 12,
    Portuguese: -12,
  },
  Malay: {
    Portuguese: -25,
    Javanese: 5,
    Acehnese: -8,
  },
  Acehnese: {
    Portuguese: -40,
    Malay: -8,
    Javanese: -8,
  },
  Javanese: {
    Malay: 5,
    Acehnese: -8,
  },
  Japanese: {
    Chinese: 0,
    Portuguese: 5,
  },
  Chinese: {
    Japanese: 0,
    Portuguese: 5,
    Spanish: 5,
  },
};

export function factionRelationModifier(playerFlag: Nationality, npcFlag: Nationality): number {
  if (playerFlag === npcFlag) return 35;
  return RELATION_MODIFIERS[playerFlag]?.[npcFlag]
    ?? RELATION_MODIFIERS[npcFlag]?.[playerFlag]
    ?? 0;
}

export function effectiveFactionReputation(baseRep: number, playerFlag: Nationality, npcFlag: Nationality): number {
  return Math.max(-100, Math.min(100, baseRep + factionRelationModifier(playerFlag, npcFlag)));
}

export function sharesFactionLanguage(playerFlag: Nationality, npcFlag: Nationality, hailLanguage: Language): boolean {
  return playerFlag === npcFlag && FACTION_NATIVE_LANGUAGE[playerFlag] === hailLanguage;
}
