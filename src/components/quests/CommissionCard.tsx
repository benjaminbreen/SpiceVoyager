// Single-lead row in the QuestsPanel. Click the header area to expand;
// expanded state reveals the task body and an Abandon button. The header
// is a button, the expanded body is a sibling — never nested buttons.

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import type { Lead } from '../../types/leads';
import { QuestIcon } from './QuestIcon';
import { getWorldPortById } from '../../utils/worldPorts';

interface CommissionCardProps {
  lead: Lead;
  currentDay: number;
  onAbandon: (id: string) => void;
}

function formatRewardChip(lead: Lead): string {
  if (lead.source === 'governor' && lead.reward.gold) {
    const parts = [`${lead.reward.gold} reales`];
    if (lead.reward.rep) {
      const sign = lead.reward.rep.amount >= 0 ? '+' : '';
      parts.push(`${sign}${lead.reward.rep.amount} ${lead.reward.rep.faction}`);
    }
    return parts.join(' · ');
  }
  if (lead.reward.gold && lead.reward.gold >= 500) return 'a fat purse';
  if (lead.reward.gold) return 'a small purse';
  if (lead.reward.rep) return 'goodwill';
  return 'a quiet favor';
}

function formatDeadline(lead: Lead, currentDay: number): { label: string; tone: string } {
  if (lead.deadlineDay == null) return { label: 'no deadline', tone: 'text-slate-500' };
  const days = lead.deadlineDay - currentDay;
  if (days < 0) return { label: 'overdue', tone: 'text-red-400/85' };
  if (days === 0) return { label: 'due today', tone: 'text-amber-400' };
  if (days <= 7) return { label: `${days} days left`, tone: 'text-amber-300/90' };
  return { label: `${days} days left`, tone: 'text-slate-400/85' };
}

function targetLabel(lead: Lead): string | null {
  if (lead.target.port) {
    const known = getWorldPortById(lead.target.port);
    return known ? known.name : lead.target.port;
  }
  if (lead.target.poiId) return lead.target.poiId;
  return null;
}

export function CommissionCard({ lead, currentDay, onAbandon }: CommissionCardProps) {
  const [expanded, setExpanded] = useState(false);
  const reward = formatRewardChip(lead);
  const deadline = formatDeadline(lead, currentDay);
  const target = targetLabel(lead);

  return (
    <div className="rounded-xl bg-white/[0.025] hover:bg-white/[0.04] border border-white/[0.06]
      transition-colors overflow-hidden">

      {/* Header — the only <button> in this card. Sibling of the expanded body. */}
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        aria-expanded={expanded}
        className="w-full text-left flex items-start gap-4 p-4"
      >
        <QuestIcon template={lead.template} size={56} />

        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-3">
            <span
              className="text-[18px] leading-[1.25] text-amber-50/95"
              style={{
                fontFamily: '"Fraunces", serif',
                fontWeight: 550,
                letterSpacing: '0.005em',
                fontVariationSettings: '"opsz" 36',
              }}
            >
              {lead.title}
            </span>
            <span className={`text-[11px] tabular-nums shrink-0 ${deadline.tone}`}
              style={{ fontFamily: '"Fraunces", serif', fontStyle: 'italic' }}
            >
              {deadline.label}
            </span>
          </div>

          <div
            className="mt-1 text-[12px] text-slate-400"
            style={{ fontFamily: '"Fraunces", serif', fontStyle: 'italic' }}
          >
            told to you by {lead.giverName}
          </div>

          <div
            className={`mt-2 text-[13.5px] leading-[1.55] text-slate-300/90 italic
              ${expanded ? '' : 'line-clamp-2'}`}
            style={{ fontFamily: '"Fraunces", serif' }}
          >
            {lead.sourceQuote}
          </div>

          <div className="mt-3 flex items-center gap-3 flex-wrap">
            <span
              className="text-[11.5px] text-amber-300/85 italic px-2 py-0.5 rounded
                border border-amber-700/30 bg-amber-900/[0.08]"
              style={{ fontFamily: '"Fraunces", serif' }}
            >
              {reward}
            </span>
            {target && (
              <span
                className="text-[11.5px] text-slate-300/85"
                style={{ fontFamily: '"Fraunces", serif', fontStyle: 'italic' }}
              >
                <span className="text-slate-500 not-italic mr-1">→</span>{target}
              </span>
            )}
          </div>
        </div>

        <ChevronDown
          size={14}
          className={`text-slate-500 mt-1 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Expanded body — sibling of header button. Contains the Abandon
          button, which is no longer nested. */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 border-t border-white/[0.05] pt-3 space-y-3">
              <div className="text-[13px] text-slate-300/95 leading-[1.6]"
                style={{ fontFamily: '"Fraunces", serif' }}
              >
                {lead.task}
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => onAbandon(lead.id)}
                  className="text-[10px] uppercase tracking-[0.14em] text-slate-500 hover:text-red-400/90
                    px-3 py-1.5 rounded border border-white/[0.06] hover:border-red-500/30
                    transition-colors"
                  style={{ fontFamily: '"DM Sans", sans-serif', fontWeight: 600 }}
                >
                  Abandon
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
