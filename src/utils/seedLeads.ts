// Leads seeded at game start. Currently just the factor's opening commission.

import type { Lead } from '../types/leads';

export const STARTER_LEAD_ID = 'starter-first-profit';

/**
 * The factor's opening commission — auto-added on new game.
 * Resolves on the player's first profitable sale at any port other than
 * where the goods were bought (see saleResolvesStarterLead).
 */
export function createStarterLead(currentDay: number, homePortId: string): Lead {
  return {
    id: STARTER_LEAD_ID,
    source: 'tavern',
    template: 'commodity',
    title: 'A return on this venture',
    task: 'Show a profit at a foreign port within sixty days.',
    sourceQuote:
      `"You did not sail on the company's coin to keep it idle in your hold. ` +
      `Buy cheap, sell dear — and let the ledger speak for you within sixty days."`,
    giverName: 'The Company Factor',
    giverPort: homePortId,
    target: {},
    offeredOnDay: currentDay,
    deadlineDay: currentDay + 60,
    reward: { gold: 200 },
    status: 'active',
  };
}
