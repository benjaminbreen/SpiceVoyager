// Leads seeded at game start. Currently just the factor's opening commission.

import type { Lead } from '../types/leads';
import type { Nationality } from '../store/gameStore';
import { getWorldPortById } from './worldPorts';

export const STARTER_LEAD_ID = 'starter-first-profit';

type StarterIssuer = {
  name: string;
  role: string;
};

const STARTER_ISSUERS: Partial<Record<Nationality, StarterIssuer[]>> = {
  English: [
    { name: 'Thomas Elkington', role: 'East India Company agent' },
    { name: 'Nicholas Withers', role: 'company broker' },
  ],
  Portuguese: [
    { name: 'Joao Rodrigues', role: 'Portuguese factor' },
    { name: 'Manuel de Sequeira', role: 'casado broker' },
  ],
  Dutch: [
    { name: 'Hendrik van der Velde', role: 'VOC factor' },
    { name: 'Cornelis van der Meer', role: 'company clerk' },
  ],
  Spanish: [
    { name: 'Diego de Avila', role: 'royal factor' },
    { name: 'Francisco de Mesa', role: 'galleon clerk' },
  ],
  Venetian: [
    { name: 'Marco Bembo', role: 'spice broker' },
    { name: 'Alvise Contarini', role: 'warehouse agent' },
  ],
  Omani: [
    { name: 'Yusuf ibn Salim', role: 'harbor broker' },
    { name: 'Ahmed ibn Rashid', role: 'customs broker' },
  ],
  Chinese: [
    { name: 'Li Wenqing', role: 'licensed merchant' },
    { name: 'Chen Yusheng', role: 'warehouse broker' },
  ],
  Gujarati: [
    { name: 'Abdul Rahim Bohra', role: 'merchant-broker' },
    { name: 'Shantidas Jhaveri', role: 'shroff' },
  ],
  Pirate: [
    { name: 'Marya al-Suqutri', role: 'prize broker' },
    { name: 'Gaspar Nunes', role: 'freebooter agent' },
  ],
};

function stableIndex(key: string, size: number): number {
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % size;
}

function starterIssuer(faction: Nationality, homePortId: string): StarterIssuer {
  const pool = STARTER_ISSUERS[faction] ?? [
    { name: 'Yusuf ibn Karim', role: 'harbor broker' },
    { name: 'Mansur al-Bazaz', role: 'warehouse agent' },
  ];
  return pool[stableIndex(`${faction}:${homePortId}`, pool.length)];
}

/**
 * The factor's opening commission — auto-added on new game.
 * Resolves on the player's first profitable sale at any port other than
 * where the goods were bought (see saleResolvesStarterLead).
 */
export function createStarterLead(currentDay: number, homePortId: string, faction: Nationality): Lead {
  const issuer = starterIssuer(faction, homePortId);
  const homePortName = getWorldPortById(homePortId)?.name ?? homePortId;

  return {
    id: STARTER_LEAD_ID,
    source: 'tavern',
    template: 'commodity',
    title: 'A return on this venture',
    task:
      `Make one profitable sale away from ${homePortName}. ` +
      `Buy low, choose another harbor, then sell for more than you paid. ` +
      `The sale itself completes the commission.`,
    sourceQuote: `The hold is not meant to sit idle. Bring back a profit before the season turns.`,
    giverName: `${issuer.name}, ${issuer.role} at ${homePortName}`,
    giverPort: homePortId,
    target: {},
    offeredOnDay: currentDay,
    deadlineDay: currentDay + 60,
    reward: { gold: 200 },
    status: 'active',
  };
}
