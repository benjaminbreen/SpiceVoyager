// Lead resolution + lifecycle helpers. Pure functions — no store access.
// See questplan.md "Resolution" section.

import type { Lead } from '../types/leads';
import { STARTER_LEAD_ID } from './seedLeads';

/** Active leads whose `target.port` matches the given port id. */
export function leadsResolvableAtPort(leads: Lead[], portId: string): Lead[] {
  return leads.filter(l => l.status === 'active' && l.target.port === portId);
}

/** Active leads whose `target.poiId` matches the given POI id. */
export function leadsResolvableAtPoi(leads: Lead[], poiId: string): Lead[] {
  return leads.filter(l => l.status === 'active' && l.target.poiId === poiId);
}

/** Active leads whose deadline has passed. Used by the daily expiry sweep. */
export function leadsToExpire(leads: Lead[], currentDay: number): Lead[] {
  return leads.filter(l =>
    l.status === 'active' && l.deadlineDay != null && currentDay > l.deadlineDay
  );
}

export interface SaleEvent {
  commodity: string;
  amount: number;
  sellPort: string;       // port id where the sale happened
  acquiredPort: string;   // port id where the goods were bought
  netProfit: number;      // (sellPrice - purchasePrice) * amount
}

/**
 * Starter quest predicate: "Show a profit at a foreign port within sixty days."
 * Resolves on any sale where sell port ≠ acquired port and net is positive.
 * Kept as its own helper rather than a generic predicate because it's a one-off
 * — generalizing it now would be premature.
 */
export function saleResolvesStarterLead(lead: Lead, sale: SaleEvent): boolean {
  if (lead.id !== STARTER_LEAD_ID) return false;
  if (lead.status !== 'active') return false;
  return sale.sellPort !== sale.acquiredPort && sale.netProfit > 0;
}

/** Format a hint-style reward reveal for the Resolved toast. */
export function formatRewardReveal(lead: Lead): string {
  const parts: string[] = [];
  if (lead.reward.gold) parts.push(`${lead.reward.gold} reales`);
  if (lead.reward.rep) {
    const sign = lead.reward.rep.amount >= 0 ? '+' : '';
    parts.push(`${sign}${lead.reward.rep.amount} ${lead.reward.rep.faction}`);
  }
  return parts.join(' · ');
}
