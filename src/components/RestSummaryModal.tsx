import { motion, AnimatePresence } from 'motion/react';
import { Sun, ArrowUp, Sparkles, X } from 'lucide-react';
import type { CrewMember, HealthFlag, RestSummary } from '../store/gameStore';
import { CrewPortraitSquare } from './CrewPortrait';
import { VitalityHeart } from './VitalityHeart';
import { sfxClick, sfxHover } from '../audio/SoundEffects';

interface RestSummaryModalProps {
  summary: RestSummary | null;
  crew: CrewMember[];
  onDismiss: () => void;
}

const HEALTH_LABEL: Record<HealthFlag, string> = {
  healthy: 'Healthy',
  sick: 'Sick',
  injured: 'Injured',
  scurvy: 'Scurvy',
  fevered: 'Fevered',
};

export function RestSummaryModal({ summary, crew, onDismiss }: RestSummaryModalProps) {
  return (
    <AnimatePresence>
      {summary && (
        <motion.div
          key="rest-summary-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
          className="fixed inset-0 z-[210] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={onDismiss}
        >
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-[min(560px,92vw)] max-h-[82vh] overflow-y-auto rounded-xl border border-amber-400/15 bg-gradient-to-b from-slate-950 to-slate-900 shadow-[0_20px_60px_rgba(0,0,0,0.7)]"
            style={{ fontFamily: '"DM Sans", sans-serif' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/[0.06] px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full border border-amber-300/25 bg-amber-300/[0.06]">
                  <Sun size={18} className="text-amber-300/80" />
                </div>
                <div>
                  <div
                    className="text-[18px] font-bold text-slate-100"
                    style={{ fontFamily: '"Fraunces", serif' }}
                  >
                    Morning at {summary.portName}
                  </div>
                  <div className="text-[12px] text-slate-500">
                    A night's rest cost {summary.cost} reales.
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { sfxClick(); onDismiss(); }}
                onMouseEnter={() => sfxHover()}
                className="rounded-md border border-white/[0.06] p-1.5 text-slate-500 transition-colors hover:border-white/[0.12] hover:text-slate-300"
                aria-label="Dismiss"
              >
                <X size={14} />
              </button>
            </div>

            {/* Crew rows */}
            <div className="px-3 py-3 space-y-1.5">
              {summary.crewDeltas.map((d, i) => {
                const member = crew.find(c => c.id === d.crewId);
                if (!member) return null;
                const moraleDelta = d.moraleAfter - d.moraleBefore;
                const healthChanged = d.healthBefore !== d.healthAfter;
                const xpReason = d.xpBonusReason === 'foreign-culture'
                  ? 'foreign culture'
                  : 'rest';

                return (
                  <motion.div
                    key={d.crewId}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.25, delay: 0.15 + i * 0.06 }}
                    className="flex items-center gap-3 rounded-lg border border-white/[0.04] bg-white/[0.015] px-3 py-2.5"
                  >
                    {/* Portrait */}
                    <div className="shrink-0 overflow-hidden rounded-full border-2 border-white/[0.08]">
                      <CrewPortraitSquare member={member} size={44} />
                    </div>

                    {/* Name + role */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="truncate text-[14px] font-bold text-slate-200">
                          {d.name}
                        </span>
                        <span className="text-[11px] text-slate-500">
                          {member.role}
                        </span>
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px]">
                        {/* Morale */}
                        {moraleDelta !== 0 && (
                          <span className="flex items-center gap-1 text-emerald-300/80">
                            morale {d.moraleBefore} → {d.moraleAfter}
                            <span className="text-emerald-400/60">(+{moraleDelta})</span>
                          </span>
                        )}
                        {/* Vitality — refilled on rest */}
                        {(d.heartsBefore !== d.heartsAfter || d.heartsMaxBefore !== d.heartsMaxAfter) && (
                          <span className="flex items-center gap-1 text-red-300/85">
                            <VitalityHeart current={d.heartsAfter} max={d.heartsMaxAfter} size={12} />
                            {d.heartsBefore}/{d.heartsMaxBefore} → {d.heartsAfter}/{d.heartsMaxAfter}
                          </span>
                        )}
                        {/* Health */}
                        {healthChanged && (
                          <span className="flex items-center gap-1 text-sky-300/80">
                            <Sparkles size={11} />
                            {HEALTH_LABEL[d.healthBefore]} → {HEALTH_LABEL[d.healthAfter]}
                          </span>
                        )}
                        {/* XP */}
                        <span className="flex items-center gap-1 text-amber-300/80">
                          <ArrowUp size={11} />
                          +{d.xpGained} XP
                          <span className="text-slate-600 italic">({xpReason})</span>
                        </span>
                        {/* Level up */}
                        {d.levelUp && (
                          <span className="rounded-full border border-amber-400/40 bg-amber-400/[0.10] px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase text-amber-200">
                            Level {d.newLevel}
                          </span>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {/* Footer */}
            <div className="border-t border-white/[0.06] px-6 py-3 text-center">
              <button
                type="button"
                onClick={() => { sfxClick(); onDismiss(); }}
                onMouseEnter={() => sfxHover()}
                className="rounded-lg border border-amber-400/25 bg-amber-400/[0.08] px-6 py-2 text-[13px] font-bold tracking-wide text-amber-200/80 transition-all hover:border-amber-400/40 hover:bg-amber-400/[0.14] hover:text-amber-100 active:scale-[0.98]"
              >
                Begin the day
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
