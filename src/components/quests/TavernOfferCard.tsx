// Inline offer affordance shown inside a tavern conversation. The QuestToast
// offer variant is for non-modal sources (crew at sea, POI walkup); the
// tavern is in PortModal so the offer surfaces here in-context. Accept
// commits via addLead; Decline silently dismisses. Both unmount the card
// (parent clears pendingOffer) and the in-chat system message becomes the
// post-decision marker.

import { motion } from 'motion/react';
import { Check, X } from 'lucide-react';
import type { TavernOffer } from '../../utils/tavernConversation';
import { QuestIcon } from './QuestIcon';

interface TavernOfferCardProps {
  offer: TavernOffer;
  /** Falsy while accept/decline is in flight or when caps prevent acceptance. */
  capReached?: boolean;
  onAccept: () => void;
  onDecline: () => void;
}

export function TavernOfferCard({ offer, capReached, onAccept, onDecline }: TavernOfferCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="my-2 mx-1 rounded-lg border border-amber-700/35 bg-amber-900/[0.07]
        backdrop-blur-sm shadow-[0_2px_10px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(245,200,120,0.06)]
        overflow-hidden"
    >
      <div className="px-3 py-1 border-b border-amber-700/20 bg-amber-900/[0.05]">
        <span
          className="text-[9px] uppercase tracking-[0.18em] text-amber-500/80"
          style={{ fontFamily: '"DM Sans", sans-serif', fontWeight: 700 }}
        >
          An errand offered
        </span>
      </div>
      <div className="flex items-start gap-3 px-3 py-3">
        <QuestIcon template={offer.template} size={42} />
        <div className="flex-1 min-w-0">
          <div
            className="text-[14px] leading-tight text-amber-100/95"
            style={{ fontFamily: '"Fraunces", serif', fontWeight: 500 }}
          >
            {offer.title}
          </div>
          <div className="mt-1 text-[12px] text-slate-300/85 leading-snug">
            {offer.task}
          </div>
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <span className="text-[9px] uppercase tracking-[0.14em] text-amber-500/70 px-1.5 py-0.5 rounded border border-amber-700/30 bg-amber-900/10">
              {offer.rewardHint}
            </span>
            {offer.target?.port && (
              <span className="text-[9px] uppercase tracking-[0.12em] text-slate-400/80">
                → {offer.target.port}
              </span>
            )}
            <span className="text-[9px] uppercase tracking-[0.12em] text-slate-500">
              {offer.deadlineDays}d
            </span>
          </div>

          {capReached && (
            <div className="mt-2 text-[10px] italic text-amber-400/70">
              Your ledger is full — abandon a commission first.
            </div>
          )}

          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              disabled={capReached}
              onClick={() => { if (!capReached) onAccept(); }}
              className="flex items-center gap-1 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em]
                rounded border border-amber-700/50 bg-amber-900/15 text-amber-300/90
                hover:bg-amber-900/30 hover:border-amber-600/70 transition-colors
                disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-amber-900/15 disabled:hover:border-amber-700/50"
            >
              <Check size={11} /> Accept
            </button>
            <button
              type="button"
              onClick={onDecline}
              className="flex items-center gap-1 px-3 py-1.5 text-[10px] uppercase tracking-[0.12em]
                rounded border border-white/[0.06] text-slate-500
                hover:text-slate-300 hover:border-white/[0.12] transition-colors"
            >
              <X size={11} /> Decline
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
