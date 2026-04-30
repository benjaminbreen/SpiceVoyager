// Quest "Lead" trunk type. One shape, four sources (tavern/crew/poi/governor).
// See questplan.md for the full design.

export type LeadSource = 'tavern' | 'crew' | 'poi' | 'governor';
export type LeadStatus = 'active' | 'done' | 'failed' | 'expired';
export type LeadTemplate = 'delivery' | 'person' | 'commodity' | 'debt' | 'medical';

export interface LeadReward {
  gold?: number;
  rep?: { faction: string; amount: number };
}

export interface LeadTarget {
  port?: string;
  poiId?: string;
  commodity?: string;
  person?: string;
}

export interface Lead {
  id: string;
  source: LeadSource;
  template: LeadTemplate;
  title: string;
  task: string;
  sourceQuote: string;

  giverName: string;
  giverPortraitId?: string;
  giverPort?: string;

  target: LeadTarget;

  offeredOnDay: number;
  deadlineDay?: number;

  reward: LeadReward;
  status: LeadStatus;
}

// Per-source caps (see questplan.md). Governor is uncapped.
export const LEAD_CAPS: Record<LeadSource, number | null> = {
  tavern: 2,
  crew: 1,
  poi: 2,
  governor: null,
};

// Top-center toast queue entries. The QuestToast component reads from this
// queue and displays the head item; mode banners (combat/hunting/anchor)
// pause display so events don't collide with state-indicator chrome.
export type QuestToastVariant = 'offer' | 'resolved' | 'expired' | 'failed';

export interface QuestToastEntry {
  id: string;
  variant: QuestToastVariant;
  leadId: string;
  // Snapshot of the title + giver at the moment of the event so the toast
  // still renders cleanly if the underlying lead is gone (resolved/expired
  // leads vanish from `leads` after the journal entry fires).
  title: string;
  giverName: string;
  template: LeadTemplate;
  // Resolved-only: revealed reward string ("a small purse · 220 reales").
  rewardReveal?: string;
}
