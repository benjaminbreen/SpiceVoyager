// Top-center quest event toast. Reads from state.questToasts queue and
// renders the head item. Queues silently while a mode banner is up
// (combat/hunting) — combat chrome owns top-center while active.
//
// Variants (see src/types/leads.ts QuestToastVariant):
//   - offer:    never auto-dismisses, Accept / Decline (sources will fill in)
//   - resolved: auto-fades after RESOLVED_MS, wax-seal flourish
//   - expired:  auto-fades after EXPIRED_MS, desaturated chrome
//   - failed:   auto-fades after EXPIRED_MS, desaturated + cool-grey rule

import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check } from 'lucide-react';
import { useGameStore } from '../store/gameStore';
import { QuestIcon } from './quests/QuestIcon';
import type { QuestToastEntry, QuestToastVariant } from '../types/leads';

const RESOLVED_MS = 5000;
const EXPIRED_MS = 5000;

const VARIANT_LABEL: Record<QuestToastVariant, string> = {
  offer:    'A new commission',
  resolved: 'Commission resolved',
  expired:  'Commission lapsed',
  failed:   'Commission abandoned',
};

const VARIANT_RULE: Record<QuestToastVariant, string> = {
  offer:    'rgba(201,168,76,0.65)',
  resolved: 'rgba(201,168,76,0.85)',
  expired:  'rgba(140,135,115,0.45)',
  failed:   'rgba(140,135,115,0.45)',
};

const VARIANT_TITLE: Record<QuestToastVariant, string> = {
  offer:    '#e8d49a',
  resolved: '#f0e0a8',
  expired:  '#a09a86',
  failed:   '#a09a86',
};

export function QuestToast() {
  const queue = useGameStore(s => s.questToasts);
  const dismiss = useGameStore(s => s.dismissQuestToast);
  const combatMode = useGameStore(s => s.combatMode);

  const head: QuestToastEntry | undefined = queue[0];
  const inhibited = combatMode;
  const visibleEntry = head && !inhibited ? head : null;

  // Auto-fade for non-offer variants.
  useEffect(() => {
    if (!visibleEntry) return;
    if (visibleEntry.variant === 'offer') return;
    const ms = visibleEntry.variant === 'resolved' ? RESOLVED_MS : EXPIRED_MS;
    const t = window.setTimeout(() => dismiss(visibleEntry.id), ms);
    return () => window.clearTimeout(t);
  }, [visibleEntry?.id, visibleEntry?.variant, dismiss]);

  return (
    <AnimatePresence>
      {visibleEntry && (
        <ToastCard
          key={visibleEntry.id}
          entry={visibleEntry}
          onDismiss={() => dismiss(visibleEntry.id)}
        />
      )}
    </AnimatePresence>
  );
}

interface ToastCardProps {
  entry: QuestToastEntry;
  onDismiss: () => void;
}

function ToastCard({ entry, onDismiss }: ToastCardProps) {
  const muted = entry.variant === 'expired' || entry.variant === 'failed';
  const ruleColor = VARIANT_RULE[entry.variant];
  const titleColor = VARIANT_TITLE[entry.variant];
  const eyebrow = VARIANT_LABEL[entry.variant];

  return (
    <motion.div
      initial={{ opacity: 0, y: -14, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 280, damping: 26 }}
      className="absolute top-[5.5rem] left-1/2 -translate-x-1/2 z-40 pointer-events-auto"
    >
      <div
        className="relative flex items-stretch gap-4 px-5 py-4 rounded-lg
          bg-[#0c0b08]/93 backdrop-blur-md
          shadow-[0_8px_28px_rgba(0,0,0,0.6)]"
        style={{
          border: `1px solid ${ruleColor}`,
          minWidth: 420,
          maxWidth: 540,
        }}
      >
        <QuestIcon template={entry.template} size={52} muted={muted} />

        <div className="flex-1 min-w-0">
          <div
            className="text-[10px] uppercase tracking-[0.20em]"
            style={{ color: ruleColor, fontFamily: '"DM Sans", sans-serif', fontWeight: 700 }}
          >
            {eyebrow}
          </div>
          <div
            className="mt-1 text-[19px] leading-[1.18]"
            style={{
              fontFamily: '"Fraunces", serif',
              fontWeight: 550,
              letterSpacing: '0.01em',
              fontVariationSettings: '"opsz" 36',
              color: titleColor,
            }}
          >
            {entry.title}
          </div>
          <div
            className="mt-1 text-[12px] text-slate-400/85"
            style={{ fontFamily: '"Fraunces", serif', fontStyle: 'italic' }}
          >
            told to you by {entry.giverName}
          </div>
          {entry.variant === 'resolved' && entry.rewardReveal && (
            <div
              className="mt-2 text-[13.5px] italic"
              style={{ fontFamily: '"Fraunces", serif', color: '#d4b070' }}
            >
              ✦ {entry.rewardReveal}
            </div>
          )}
        </div>

        {entry.variant === 'offer' ? (
          <div className="flex flex-col gap-1.5 self-center">
            <button
              onClick={onDismiss}
              className="px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em]
                rounded border border-amber-700/50 bg-amber-900/15 text-amber-300/90
                hover:bg-amber-900/30 hover:border-amber-600/70 transition-colors
                flex items-center gap-1"
            >
              <Check size={11} /> Accept
            </button>
            <button
              onClick={onDismiss}
              className="px-3 py-1 text-[10px] uppercase tracking-[0.12em]
                rounded border border-white/[0.06] text-slate-500
                hover:text-slate-300 hover:border-white/[0.12] transition-colors"
            >
              Decline
            </button>
          </div>
        ) : (
          <button
            onClick={onDismiss}
            className="self-start w-5 h-5 rounded-full flex items-center justify-center
              text-slate-500 hover:text-slate-300 hover:bg-white/[0.06] transition-colors"
            aria-label="Dismiss"
          >
            <X size={10} />
          </button>
        )}
      </div>
    </motion.div>
  );
}
