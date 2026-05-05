export const CREW_TROUBLE_MEDALLION_KEYS = [
  'fever-lantern',
  'scurvy-barrel',
  'bandaged-hand',
  'medicine-chest',
  'moonlit-hatch',
  'coiled-rope',
  'cracked-seal',
  'pay-purse',
  'broken-biscuit',
  'split-candle',
  'split-compass',
  'folded-note',
  'open-logbook',
  'silver-fish',
  'spilled-coin',
  'night-watch-star',
] as const;

export type CrewTroubleMedallionKey = (typeof CREW_TROUBLE_MEDALLION_KEYS)[number];

export interface CrewTroubleMedallionAsset {
  key: CrewTroubleMedallionKey;
  path: string;
  label: string;
}

export function crewTroubleMedallionAsset(key: string): CrewTroubleMedallionAsset | null {
  if (!CREW_TROUBLE_MEDALLION_KEYS.includes(key as CrewTroubleMedallionKey)) return null;
  const safeKey = key as CrewTroubleMedallionKey;
  return {
    key: safeKey,
    path: `/crew-trouble-medallions/${safeKey}.webp`,
    label: safeKey.replace(/-/g, ' '),
  };
}
