// Leads seeded at game start. Currently just the factor's opening commission.

import type { Lead, LeadHint } from '../types/leads';
import type { Nationality } from '../store/gameStore';
import type { Commodity, PortTradeRole } from './commodities';
import { ALL_COMMODITIES_FULL, COMMODITY_DEFS, getTradeRole } from './commodities';
import { getReachableWorldPortIds, getWorldPortById } from './worldPorts';

export const STARTER_LEAD_ID = 'starter-first-profit';

type StarterIssuer = {
  name: string;
  role: string;
};

interface StarterLeadContext {
  cargo?: Partial<Record<Commodity, number>>;
}

const NON_TRADE_STARTER_GOODS = new Set<Commodity>([
  'Rice',
  'Small Shot',
  'Cannon Shot',
  'Salted Meat',
  'War Rockets',
]);

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

function roleScore(role: PortTradeRole | null): number {
  if (role === 'demands') return 3;
  if (role === 'trades') return 1;
  return 0;
}

function tierScore(commodity: Commodity): number {
  return 6 - COMMODITY_DEFS[commodity].tier;
}

function bestDirectDestination(homePortId: string, commodity: Commodity): { portId: string; score: number } | null {
  let best: { portId: string; score: number } | null = null;
  for (const portId of getReachableWorldPortIds(homePortId)) {
    const score = roleScore(getTradeRole(portId, commodity));
    if (score <= 0) continue;
    if (!best || score > best.score || (score === best.score && portId < best.portId)) {
      best = { portId, score };
    }
  }
  return best;
}

function starterCargoHint(homePortId: string, cargo?: Partial<Record<Commodity, number>>): LeadHint | null {
  if (!cargo) return null;

  let best: { commodity: Commodity; qty: number; portId: string; score: number } | null = null;
  for (const [commodityName, qty] of Object.entries(cargo)) {
    const commodity = commodityName as Commodity;
    if (!qty || qty <= 0 || NON_TRADE_STARTER_GOODS.has(commodity)) continue;
    const destination = bestDirectDestination(homePortId, commodity);
    if (!destination) continue;

    const score = destination.score * 100 + tierScore(commodity) * 10 + Math.min(qty, 9);
    if (!best || score > best.score || (score === best.score && commodity < best.commodity)) {
      best = { commodity, qty, portId: destination.portId, score };
    }
  }

  if (!best) return null;
  const homeName = getWorldPortById(homePortId)?.name ?? homePortId;
  const destinationName = getWorldPortById(best.portId)?.name ?? best.portId;
  return {
    title: 'First trade to try',
    commodity: best.commodity,
    fromPort: homePortId,
    toPort: best.portId,
    body:
      `You already carry ${best.qty} unit${best.qty === 1 ? '' : 's'} of ${best.commodity}. ` +
      `Sail from ${homeName} to ${destinationName} and check the market there before selling.`,
  };
}

function starterBuyHint(homePortId: string): LeadHint | null {
  let best: { commodity: Commodity; portId: string; score: number } | null = null;
  for (const commodity of ALL_COMMODITIES_FULL) {
    if (NON_TRADE_STARTER_GOODS.has(commodity)) continue;
    const homeRole = getTradeRole(homePortId, commodity);
    if (homeRole !== 'produces' && homeRole !== 'trades') continue;

    const destination = bestDirectDestination(homePortId, commodity);
    if (!destination) continue;

    const homeScore = homeRole === 'produces' ? 2 : 1;
    const score = destination.score * 100 + homeScore * 20 + tierScore(commodity);
    if (!best || score > best.score || (score === best.score && commodity < best.commodity)) {
      best = { commodity, portId: destination.portId, score };
    }
  }

  if (!best) return null;
  const homeName = getWorldPortById(homePortId)?.name ?? homePortId;
  const destinationName = getWorldPortById(best.portId)?.name ?? best.portId;
  return {
    title: 'First trade to try',
    commodity: best.commodity,
    fromPort: homePortId,
    toPort: best.portId,
    body:
      `At ${homeName}, look for ${best.commodity}. ` +
      `If the price is low, carry it to ${destinationName} and compare the sale price there.`,
  };
}

function starterHint(homePortId: string, context?: StarterLeadContext): LeadHint | undefined {
  return starterCargoHint(homePortId, context?.cargo) ?? starterBuyHint(homePortId) ?? undefined;
}

/**
 * The factor's opening commission — auto-added on new game.
 * Resolves on the player's first profitable sale at any port other than
 * where the goods were bought (see saleResolvesStarterLead).
 */
export function createStarterLead(
  currentDay: number,
  homePortId: string,
  faction: Nationality,
  context?: StarterLeadContext,
): Lead {
  const issuer = starterIssuer(faction, homePortId);
  const homePortName = getWorldPortById(homePortId)?.name ?? homePortId;
  const hint = starterHint(homePortId, context);

  return {
    id: STARTER_LEAD_ID,
    source: 'tavern',
    template: 'commodity',
    title: 'A return on this venture',
    task:
      `Make one profitable sale away from ${homePortName}. ` +
      `Buy low, choose another harbor, then sell for more than you paid. ` +
      `Open the Navigation chart (press 7) to choose the next harbor. ` +
      `The sale itself completes the commission.`,
    sourceQuote: `The hold is not meant to sit idle. Bring back a profit before the season turns.`,
    giverName: `${issuer.name}, ${issuer.role} at ${homePortName}`,
    giverPort: homePortId,
    target: {},
    hint,
    offeredOnDay: currentDay,
    deadlineDay: currentDay + 60,
    reward: { gold: 200 },
    status: 'active',
  };
}
