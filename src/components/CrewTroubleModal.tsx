import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import type { CSSProperties } from 'react';
import { useGameStore } from '../store/gameStore';
import type { CrewTroubleEvent, CrewTroubleTone } from '../utils/crewTrouble';
import { crewTroubleMedallionAsset } from '../utils/crewTroubleMedallions';
import { CrewPortraitSquare } from './CrewPortrait';
import { sfxClick, sfxClose, sfxHover } from '../audio/SoundEffects';

const SHELL: Record<CrewTroubleTone, { label: string; accent: string; soft: string; glyph: string }> = {
  sickbay: { label: 'Sickbay', accent: '#d65f5f', soft: 'rgba(214,95,95,0.22)', glyph: '✚' },
  discipline: { label: 'Discipline', accent: '#d89a4a', soft: 'rgba(216,154,74,0.22)', glyph: '!' },
  interpersonal: { label: 'Crew Matter', accent: '#c77c6f', soft: 'rgba(199,124,111,0.22)', glyph: '§' },
  opportunity: { label: 'Opportunity', accent: '#8dbf8a', soft: 'rgba(141,191,138,0.22)', glyph: '✦' },
  aftermath: { label: 'Aftermath', accent: '#b8875d', soft: 'rgba(184,135,93,0.22)', glyph: '◆' },
};

function medallionLabel(id: string): string {
  return id.split('-').map(part => part[0]?.toUpperCase() + part.slice(1)).join(' ');
}

export function CrewTroubleModal({ event }: { event: CrewTroubleEvent }) {
  const crew = useGameStore(s => s.crew);
  const gold = useGameStore(s => s.gold);
  const provisions = useGameStore(s => s.provisions);
  const resolveCrewTrouble = useGameStore(s => s.resolveCrewTrouble);
  const dismissCrewTrouble = useGameStore(s => s.dismissCrewTrouble);
  const shell = SHELL[event.tone];
  const participants = event.crewIds.map(id => crew.find(member => member.id === id)).filter(Boolean);
  const medallionAsset = crewTroubleMedallionAsset(event.medallionId);

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[120] flex items-center justify-center pointer-events-auto p-3 sm:p-6"
        style={{
          height: 'var(--app-height)',
          background: 'radial-gradient(circle at 50% 20%, rgba(70,22,18,0.42), rgba(0,0,0,0.84) 62%)',
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div
          className="relative w-full max-w-[920px] overflow-hidden rounded-lg"
          style={{
            background: 'linear-gradient(180deg, rgba(22,17,13,0.98), rgba(8,7,6,0.98))',
            border: `1px solid ${shell.accent}80`,
            boxShadow: `0 28px 80px rgba(0,0,0,0.78), inset 0 1px 0 ${shell.accent}33`,
          }}
          initial={{ opacity: 0, y: 18, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.98 }}
          transition={{ duration: 0.22 }}
        >
          <div className="absolute inset-x-0 top-0 h-px" style={{ background: shell.accent }} />
          <button
            type="button"
            onClick={() => { sfxClose(); dismissCrewTrouble(); }}
            aria-label="Dismiss crew trouble"
            className="absolute right-4 top-4 z-10 grid h-9 w-9 place-items-center rounded-md border transition-all hover:-translate-y-px hover:bg-white/[0.07] focus:outline-none focus:ring-2"
            style={{
              color: '#d7b477',
              background: 'rgba(0,0,0,0.22)',
              borderColor: 'rgba(216,154,74,0.34)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
              '--tw-ring-color': shell.accent,
            } as CSSProperties}
          >
            <X size={19} strokeWidth={1.8} />
          </button>

          <div className="grid gap-6 p-5 pt-6 md:grid-cols-[188px_1fr] md:p-8">
            <div className="flex flex-col items-center border-b border-white/[0.07] pb-5 md:items-start md:border-b-0 md:border-r md:pb-0 md:pr-6">
              <div
                className="flex h-32 w-32 items-center justify-center rounded-full text-5xl md:h-36 md:w-36"
                style={{
                  color: '#1b0e0a',
                  background: `radial-gradient(circle at 30% 24%, #f1d39d 0%, ${shell.accent} 34%, #4f211a 72%, #100504 100%)`,
                  boxShadow: `0 0 30px ${shell.accent}28, inset 0 2px 10px rgba(255,255,255,0.2)`,
                  fontFamily: '"Fraunces", serif',
                }}
                title={medallionLabel(event.medallionId)}
              >
                {medallionAsset ? (
                  <img
                    src={medallionAsset.path}
                    alt=""
                    className="h-full w-full object-contain"
                    draggable={false}
                  />
                ) : shell.glyph}
              </div>
              <div className="mt-4 text-center md:text-left">
                <div className="text-[10px] uppercase tracking-[0.24em]" style={{ color: shell.accent, fontFamily: '"SF Mono", monospace' }}>
                  {shell.label}
                </div>
                <div className="mt-1 text-[12px] leading-5" style={{ color: '#b7a78c', fontFamily: '"DM Sans", sans-serif' }}>
                  Severity {event.severity} · {medallionLabel(event.medallionId)}
                </div>
              </div>
              {participants.length > 0 && (
                <div className="mt-5 flex w-full flex-wrap justify-center gap-2 md:justify-start">
                  {participants.map(member => member && (
                    <div key={member.id} className="flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5" style={{ background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.08)' }}>
                      <CrewPortraitSquare member={member} size={34} />
                      <span className="max-w-[105px] truncate text-[11px]" style={{ color: '#eadfca', fontFamily: '"DM Sans", sans-serif' }}>
                        {member.name}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="min-w-0 pr-0 md:pr-10">
              <div className="text-[11px] uppercase tracking-[0.22em]" style={{ color: '#8f7f66', fontFamily: '"SF Mono", monospace' }}>
                Crew Trouble
              </div>
              <h2 className="mt-2 text-2xl leading-tight md:text-[34px]" style={{ color: '#f2cf82', fontFamily: '"Fraunces", serif' }}>
                {event.title}
              </h2>
              <p className="mt-4 max-w-2xl text-[15px] leading-7" style={{ color: '#d8cbb6', fontFamily: '"DM Sans", sans-serif' }}>
                {event.body}
              </p>

              <div className="mt-6 grid gap-2.5">
                {event.choices.map((choice, index) => {
                  const blocked = (choice.outcome.goldCost ?? 0) > gold || (choice.outcome.provisionCost ?? 0) > provisions;
                  const cost = [
                    choice.outcome.goldCost ? `${choice.outcome.goldCost}g` : null,
                    choice.outcome.provisionCost ? `${choice.outcome.provisionCost} provisions` : null,
                  ].filter(Boolean).join(' · ');
                  return (
                    <button
                      key={choice.id}
                      type="button"
                      disabled={blocked}
                      onMouseEnter={() => { if (!blocked) sfxHover(); }}
                      onClick={() => { if (!blocked) { sfxClick(); resolveCrewTrouble(choice); } }}
                      className="group grid min-h-[76px] grid-cols-[26px_minmax(0,1fr)] gap-3 rounded-md px-3 py-3 text-left transition-all hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0 sm:grid-cols-[30px_minmax(0,1fr)] sm:px-4"
                      style={{
                        background: blocked ? 'rgba(255,255,255,0.025)' : 'rgba(255,255,255,0.035)',
                        border: `1px solid ${blocked ? 'rgba(255,255,255,0.08)' : shell.accent + '44'}`,
                        boxShadow: blocked ? 'none' : `inset 3px 0 0 ${shell.accent}, inset 0 1px 0 rgba(255,255,255,0.05)`,
                      }}
                    >
                      <span
                        className="mt-0.5 grid h-6 w-6 place-items-center rounded-full text-[10px] font-bold sm:h-7 sm:w-7"
                        style={{
                          color: blocked ? '#756a58' : '#17100a',
                          background: blocked ? 'rgba(255,255,255,0.06)' : shell.accent,
                          fontFamily: '"SF Mono", monospace',
                        }}
                      >
                        {index + 1}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-start justify-between gap-3">
                          <span className="text-[15px] font-semibold leading-6" style={{ color: '#f3dfc3', fontFamily: '"DM Sans", sans-serif' }}>
                            {choice.label}
                          </span>
                          {cost && (
                            <span className="shrink-0 rounded-sm border px-2 py-1 text-[10px] uppercase tracking-[0.14em]" style={{ color: shell.accent, borderColor: shell.accent + '55', background: 'rgba(0,0,0,0.2)', fontFamily: '"SF Mono", monospace' }}>
                              {cost}
                            </span>
                          )}
                        </div>
                        <div className="mt-1 text-[13px] leading-5" style={{ color: '#b4a68d', fontFamily: '"DM Sans", sans-serif' }}>
                          {choice.detail}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

export default CrewTroubleModal;
