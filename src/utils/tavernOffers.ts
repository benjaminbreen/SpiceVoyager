// Convert a validated tavern LLM offer + conversation context into a Lead.
// Pure helper — no store access, no React. Keep this file the only place
// that knows how a tavern offer maps onto the Lead trunk type.

import type { Lead } from '../types/leads';
import type { TavernOffer } from './tavernConversation';
import type { Nationality } from '../store/gameStore';
import { WORLD_PORTS } from './worldPorts';

const REP_REWARD = 5;

interface BuildLeadInput {
  offer: TavernOffer;
  giverName: string;
  giverNationality: Nationality;
  giverPortId: string;
  sourceQuote: string;     // the npcDialogue line that produced the offer
  currentDay: number;
}

/**
 * Resolve the LLM-emitted target.port string (a name, e.g. "Calicut") to a
 * canonical port id from WORLD_PORTS. Without this, target.port stays as the
 * human name and never matches `port.id` at resolution time. Returns the
 * canonical id, or null if the name doesn't match any known port — in which
 * case we drop the target rather than store a string the world doesn't know.
 */
function resolvePortIdByName(name: string): string | null {
  const needle = name.trim().toLowerCase();
  if (!needle) return null;
  // Exact id match (LLM occasionally emits the id directly).
  const byId = WORLD_PORTS.find(p => p.id.toLowerCase() === needle);
  if (byId) return byId.id;
  // Case-insensitive name match.
  const byName = WORLD_PORTS.find(p => p.name.toLowerCase() === needle);
  if (byName) return byName.id;
  return null;
}

export function buildLeadFromTavernOffer(input: BuildLeadInput): Lead {
  const { offer, giverName, giverNationality, giverPortId, sourceQuote, currentDay } = input;

  const target: Lead['target'] = {};
  if (offer.target?.port) {
    const portId = resolvePortIdByName(offer.target.port);
    if (portId) target.port = portId;
  }
  if (offer.target?.commodity) target.commodity = offer.target.commodity;
  if (offer.target?.person) target.person = offer.target.person;

  return {
    id: makeLeadId(),
    source: 'tavern',
    template: offer.template,
    title: offer.title,
    task: offer.task,
    sourceQuote,
    giverName,
    giverPort: giverPortId,
    target,
    offeredOnDay: currentDay,
    deadlineDay: currentDay + offer.deadlineDays,
    reward: {
      gold: offer.rewardGold,
      rep: { faction: giverNationality, amount: REP_REWARD },
    },
    status: 'active',
  };
}

function makeLeadId(): string {
  return `lead-${Math.random().toString(36).slice(2, 9)}`;
}
