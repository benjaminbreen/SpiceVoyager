// Inline prompt rendered inside PortModal when the active port matches an
// active lead's target.port. Player chooses to resolve now or defer until
// the next visit. "Later" hides the prompt for this visit only — re-opens
// next time activePort flips to this id.

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Clock } from 'lucide-react';
import { useGameStore } from '../../store/gameStore';
import { QuestIcon } from './QuestIcon';

export function LeadResolvePrompt() {
  const activePortId = useGameStore(s => s.activePort?.id ?? null);
  const leads = useGameStore(s => s.leads);
  const resolveLead = useGameStore(s => s.resolveLead);

  // Per-visit dismissals. Reset whenever the player enters a different port.
  const [deferred, setDeferred] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    setDeferred(new Set());
  }, [activePortId]);

  if (!activePortId) return null;
  const matches = leads.filter(l =>
    l.status === 'active' && l.target.port === activePortId && !deferred.has(l.id)
  );
  if (matches.length === 0) return null;

  return (
    <div className="px-5 pt-4 pb-1 space-y-2">
      <AnimatePresence initial={false}>
        {matches.map(lead => (
          <motion.div
            key={lead.id}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, height: 0, marginTop: 0, marginBottom: 0 }}
            transition={{ duration: 0.22 }}
            className="rounded-lg border border-amber-700/35 bg-amber-900/[0.07]
              shadow-[0_2px_10px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(245,200,120,0.05)]
              overflow-hidden"
          >
            <div className="px-3 py-1 border-b border-amber-700/20 bg-amber-900/[0.05]">
              <span
                className="text-[9px] uppercase tracking-[0.18em] text-amber-500/80"
                style={{ fontFamily: '"DM Sans", sans-serif', fontWeight: 700 }}
              >
                You have arrived
              </span>
            </div>
            <div className="flex items-center gap-3 px-3 py-3">
              <QuestIcon template={lead.template} size={42} />
              <div className="flex-1 min-w-0">
                <div
                  className="text-[14px] leading-tight text-amber-50/95"
                  style={{ fontFamily: '"Fraunces", serif', fontWeight: 550 }}
                >
                  {lead.title}
                </div>
                <div
                  className="mt-1 text-[12px] text-slate-300/85 leading-snug"
                  style={{ fontFamily: '"Fraunces", serif', fontStyle: 'italic' }}
                >
                  {lead.task}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => resolveLead(lead.id)}
                  className="flex items-center gap-1 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em]
                    rounded border border-amber-700/55 bg-amber-900/20 text-amber-200/95
                    hover:bg-amber-800/35 hover:border-amber-600/80 transition-colors"
                  style={{ fontFamily: '"DM Sans", sans-serif' }}
                >
                  <Check size={11} /> Deliver
                </button>
                <button
                  type="button"
                  onClick={() => setDeferred(prev => new Set(prev).add(lead.id))}
                  className="flex items-center gap-1 px-3 py-1.5 text-[10px] uppercase tracking-[0.12em]
                    rounded border border-white/[0.06] text-slate-400
                    hover:text-slate-200 hover:border-white/[0.14] transition-colors"
                  style={{ fontFamily: '"DM Sans", sans-serif' }}
                >
                  <Clock size={11} /> Later
                </button>
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
