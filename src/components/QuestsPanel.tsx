// Quest panel — slide-out sister to the Journal panel. ~620px wide to give
// commission cards room to breathe. Does not pause time. Reads from
// state.leads; authoring and resolution happen in store actions.

import { motion, AnimatePresence } from 'framer-motion';
import { Scroll, X } from 'lucide-react';
import { useGameStore } from '../store/gameStore';
import { CommissionCard } from './quests/CommissionCard';

interface QuestsPanelProps {
  open: boolean;
  onClose: () => void;
  dockOffset?: boolean;
  onOpenChart?: () => void;
}

export function QuestsPanel({ open, onClose, dockOffset = false, onOpenChart }: QuestsPanelProps) {
  const leads = useGameStore(s => s.leads);
  const dayCount = useGameStore(s => s.dayCount);
  const failLead = useGameStore(s => s.failLead);

  const active = leads.filter(l => l.status === 'active');
  const sorted = [...active].sort((a, b) => {
    const ad = a.deadlineDay ?? Infinity;
    const bd = b.deadlineDay ?? Infinity;
    if (ad !== bd) return ad - bd;
    return a.offeredOnDay - b.offeredOnDay;
  });

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, x: -20, scale: 0.97 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: -20, scale: 0.97 }}
          transition={{ duration: 0.22, ease: [0.2, 0.8, 0.25, 1] }}
          className={`absolute bottom-[4.5rem] ${dockOffset ? 'left-[21.5rem]' : 'left-4'} w-[620px] max-w-[calc(100vw-2rem)] max-h-[640px] flex flex-col
            bg-[#0a0e18]/74 backdrop-blur-xl border border-[#2a2d3a]/55 rounded-xl
            shadow-[0_8px_32px_rgba(0,0,0,0.55)] pointer-events-auto z-30 overflow-hidden`}
        >
          {/* Header — Fraunces title to mirror the period-correspondence
              register; matches the "Captain's Log" cadence of the Journal. */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.06]">
            <div className="flex items-center gap-3">
              <Scroll size={15} className="text-amber-400/85" strokeWidth={1.6} />
              <span
                className="text-[10px] font-bold uppercase tracking-[0.22em] text-amber-300 leading-none"
                style={{ fontFamily: '"DM Sans", sans-serif' }}
              >
                Commissions
              </span>
            </div>
            <button
              onClick={onClose}
              className="w-6 h-6 rounded-full flex items-center justify-center text-slate-500 hover:text-slate-300 hover:bg-white/[0.06] transition-all"
              aria-label="Close commissions panel"
            >
              <X size={12} />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto min-h-0 px-4 py-4 space-y-3 scrollbar-thin">
            {sorted.length === 0 ? (
              <EmptyState />
            ) : (
              sorted.map(lead => (
                <CommissionCard
                  key={lead.id}
                  lead={lead}
                  currentDay={dayCount}
                  onAbandon={failLead}
                  onOpenChart={onOpenChart}
                />
              ))
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-16 px-8">
      <Scroll size={32} className="text-slate-700 mx-auto mb-4" strokeWidth={1.1} />
      <div
        className="text-[14px] text-slate-400/85 italic leading-[1.5]"
        style={{ fontFamily: '"Fraunces", serif' }}
      >
        The pages are clean. No standing letters await your reply.
      </div>
      <div
        className="text-[11px] text-slate-600 mt-2"
        style={{ fontFamily: '"Fraunces", serif', fontStyle: 'italic' }}
      >
        Listen for errands in taverns and at the harbor.
      </div>
    </div>
  );
}
