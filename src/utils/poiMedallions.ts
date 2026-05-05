import type { POIDefinition, POIKind } from './poiDefinitions';

export const POI_MEDALLION_KEYS = [
  'poi-apothecary-dispensary',
  'poi-physic-garden',
  'poi-college-mission',
  'poi-healer-camp',
  'poi-counting-house',
  'poi-pepper-godown',
  'poi-gem-brokerage',
  'poi-customs-office',
  'poi-sufi-lodge',
  'poi-coffee-shrine',
  'poi-mission-apothecary',
  'poi-pilgrimage-shrine',
  'poi-tobacco-shed',
  'poi-spice-plantation',
  'poi-shipwreck',
  'poi-caravanserai-cove',
  'poi-volcano-island',
  'poi-sacred-mountain',
  'poi-cave-spring',
  'poi-water-source',
  'poi-pearl-bank',
  'poi-coral-fishery',
  'poi-reef-shoal',
  'poi-sea-mark',
  'poi-ruined-temple',
  'poi-abandoned-fort',
  'poi-overgrown-ruin',
  'poi-hermitage',
  'poi-indigo-vat',
  'poi-sugar-mill',
  'poi-porcelain-kiln',
  'poi-tea-house',
] as const;

export type POIMedallionKey = (typeof POI_MEDALLION_KEYS)[number];

export interface POIMedallionAsset {
  key: POIMedallionKey;
  path: string;
  label: string;
}

const MEDALLION_BY_KIND: Record<POIKind, POIMedallionKey> = {
  naturalist: 'poi-apothecary-dispensary',
  garden: 'poi-spice-plantation',
  shrine: 'poi-pilgrimage-shrine',
  ruin: 'poi-overgrown-ruin',
  wreck: 'poi-shipwreck',
  smugglers_cove: 'poi-caravanserai-cove',
  caravanserai: 'poi-caravanserai-cove',
  natural: 'poi-sacred-mountain',
};

const MEDALLION_BY_ID: Record<string, POIMedallionKey> = {
  'london-apothecaries-hall': 'poi-apothecary-dispensary',
  'london-oxford': 'poi-physic-garden',
  'goa-bom-jesus': 'poi-mission-apothecary',
  'goa-botanical-garden': 'poi-physic-garden',
  'surat-banyan-counting-house': 'poi-counting-house',
  'surat-sufi-lodge': 'poi-sufi-lodge',
  'mocha-shadhili-coffee': 'poi-coffee-shrine',
  'calicut-mappila-house': 'poi-counting-house',
  'macau-colegio-sao-paulo': 'poi-college-mission',
  'mombasa-fort-apothecary': 'poi-mission-apothecary',
  'mocha-aloe-camp': 'poi-healer-camp',
  'socotra-dragons-blood-grove': 'poi-sacred-mountain',
  'hormuz-pearl-divers-bazaar': 'poi-pearl-bank',
  'masulipatnam-golconda-broker': 'poi-gem-brokerage',
  'bantam-pepper-warehouses': 'poi-pepper-godown',
  'bantam-krakatoa': 'poi-volcano-island',
  'nagasaki-jesuit-press': 'poi-college-mission',
  'manila-parian-silk-market': 'poi-customs-office',
  'aden-customs-hakim': 'poi-healer-camp',
  'malacca-chetty-compound': 'poi-counting-house',
  'lisbon-casa-da-india': 'poi-customs-office',
  'seville-casa-contratacion': 'poi-customs-office',
  'manila-sangley-parian': 'poi-customs-office',
  'venice-theriac-spezieria': 'poi-apothecary-dispensary',
  'jamestown-rolfe-tobacco-patch': 'poi-tobacco-shed',
  'havana-tabaquero-shed': 'poi-tobacco-shed',
};

export function poiMedallionKey(poi: POIDefinition): POIMedallionKey {
  if (poi.medallionKey) return poi.medallionKey;
  const explicit = MEDALLION_BY_ID[poi.id];
  if (explicit) return explicit;
  if (poi.class === 'mercantile' && poi.kind === 'naturalist') return 'poi-counting-house';
  if (poi.class === 'learned' && poi.kind === 'shrine') return 'poi-mission-apothecary';
  return MEDALLION_BY_KIND[poi.kind];
}

export function poiMedallionAsset(poi: POIDefinition): POIMedallionAsset {
  const key = poiMedallionKey(poi);
  return {
    key,
    path: `/poi-medallions/${key}.webp`,
    label: key.replace(/-/g, ' '),
  };
}
