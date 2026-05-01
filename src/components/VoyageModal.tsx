import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, Anchor, Check, Gauge, HeartPulse, Package, Sailboat, Shield, Waves, Wind, X } from 'lucide-react';
import { useGameStore } from '../store/gameStore';
import {
  resolveVoyage,
  applyVoyageIncidentChoice,
  type VoyageResolution,
  type VoyageStance,
  type VoyageEventTone,
} from '../utils/voyageResolution';
import { sfxClick, sfxClose, sfxHover, sfxSail } from '../audio/SoundEffects';

interface VoyageModalProps {
  fromPort: string;
  toPort: string;
  totalDays: number;
  fromPortId: string;
  toPortId: string;
  onComplete: (resolution: VoyageResolution) => void;
  onSkip: (resolution: VoyageResolution) => void;
}

const STANCE_META: Record<VoyageStance, {
  title: string;
  short: string;
  detail: string;
  icon: typeof Gauge;
  accent: string;
}> = {
  press: {
    title: 'Press Sail',
    short: 'Fewer days, harder passage',
    detail: 'Crowd canvas and accept more strain on hull and crew.',
    icon: Wind,
    accent: '#e8c872',
  },
  standard: {
    title: 'Standard Passage',
    short: 'Balanced time and risk',
    detail: 'Keep the normal watches and make the safest ordinary run.',
    icon: Sailboat,
    accent: '#9bc4e8',
  },
  cautious: {
    title: 'Stand Off & Sound',
    short: 'Slower, safer approach',
    detail: 'Take soundings, shorten sail in bad water, and spare the ship.',
    icon: Anchor,
    accent: '#6dc3b0',
  },
};

const TONE_COLOR: Record<VoyageEventTone, string> = {
  good: '#6dc3b0',
  neutral: '#9bc4e8',
  warning: '#e8c872',
  danger: '#e89b9b',
};

function riskColor(risk: string) {
  if (risk === 'High') return '#e89b9b';
  if (risk === 'Moderate') return '#e8c872';
  return '#6dc3b0';
}

function formatRegion(value: string) {
  return value.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());
}

function StatTile({
  icon: Icon,
  label,
  value,
  tone = '#d4ccb6',
}: {
  icon: typeof Gauge;
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="rounded-md border border-white/[0.07] bg-white/[0.025] px-3 py-2">
      <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.14em] text-[#7f7868]" style={{ fontFamily: '"DM Sans", sans-serif' }}>
        <Icon size={12} style={{ color: tone }} />
        {label}
      </div>
      <div className="mt-1 font-mono text-[17px] font-bold leading-none" style={{ color: tone }}>
        {value}
      </div>
    </div>
  );
}

export default function VoyageModal({
  fromPort,
  toPort,
  totalDays,
  fromPortId,
  toPortId,
  onComplete,
  onSkip,
}: VoyageModalProps) {
  const crew = useGameStore(s => s.crew);
  const stats = useGameStore(s => s.stats);
  const provisions = useGameStore(s => s.provisions);
  const dayCount = useGameStore(s => s.dayCount);
  const weather = useGameStore(s => s.weather);
  const windSpeed = useGameStore(s => s.windSpeed);
  const chartedRoutes = useGameStore(s => s.chartedRoutes);
  const [stance, setStance] = useState<VoyageStance>('standard');
  const [phase, setPhase] = useState<'briefing' | 'incident' | 'log' | 'arrived'>('briefing');
  const [shownEvents, setShownEvents] = useState(0);
  const [choiceId, setChoiceId] = useState<string | null>(null);

  const baseResolution = useMemo(() => resolveVoyage({
    fromPortId,
    toPortId,
    stance,
    crew,
    stats,
    provisions,
    dayCount,
    chartedRoutes,
    weatherIntensity: weather.targetIntensity,
    windSpeed,
  }), [chartedRoutes, crew, dayCount, fromPortId, provisions, stance, stats, toPortId, weather.targetIntensity, windSpeed]);
  const resolution = useMemo(
    () => choiceId ? applyVoyageIncidentChoice(baseResolution, choiceId) : baseResolution,
    [baseResolution, choiceId],
  );

  const canDepart = stats.hull > 0 && crew.length > 0;
  const rationShortfall = Math.max(0, resolution.provisionCost - provisions);

  function playLog(nextResolution: VoyageResolution) {
    setPhase('log');
    let index = 0;
    const tickMs = nextResolution.actualDays <= 5 ? 680 : nextResolution.actualDays <= 12 ? 560 : 430;
    const id = window.setInterval(() => {
      index += 1;
      setShownEvents(index);
      if (index >= nextResolution.events.length) {
        window.clearInterval(id);
        window.setTimeout(() => setPhase('arrived'), 650);
      }
    }, tickMs);
  }

  function beginVoyage() {
    if (!canDepart) return;
    sfxSail();
    setChoiceId(null);
    setPhase('incident');
    setShownEvents(0);
    if (baseResolution.incident.autoResult) {
      const nextResolution = applyVoyageIncidentChoice(baseResolution, baseResolution.incident.autoResult.id);
      window.setTimeout(() => {
        setChoiceId(baseResolution.incident.autoResult?.id ?? null);
        playLog(nextResolution);
      }, 1050);
    }
  }

  function chooseIncident(choice: string) {
    sfxClick();
    setChoiceId(choice);
    const chosenResolution = applyVoyageIncidentChoice(baseResolution, choice);
    playLog(chosenResolution);
  }

  function finish(skip = false) {
    if (skip) onSkip(resolution);
    else onComplete(resolution);
  }

  return (
    <AnimatePresence>
      <motion.div
        data-testid="voyage-modal"
        className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/72 p-3 backdrop-blur-sm sm:p-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
      >
        <motion.div
          className="relative flex max-h-[min(860px,calc(100vh-1rem))] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-[#8f7740]/40 bg-[#080b12]/96 shadow-[0_20px_70px_rgba(0,0,0,0.76)]"
          initial={{ opacity: 0, y: 10, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.22, ease: [0.2, 0.8, 0.25, 1] }}
        >
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#e8c872]/70 to-transparent" />
          <button
            type="button"
            onClick={() => { sfxClose(); finish(true); }}
            onMouseEnter={() => sfxHover()}
            className="absolute right-3 top-3 z-20 grid h-8 w-8 place-items-center rounded-full border border-white/[0.08] bg-white/[0.03] text-[#8e856f] transition-colors hover:text-[#e8ddbf]"
            aria-label="Skip voyage"
          >
            <X size={14} />
          </button>

          <header className="border-b border-white/[0.07] px-5 py-5 md:px-7">
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#8e856f]" style={{ fontFamily: '"DM Sans", sans-serif' }}>
              Voyage Orders
            </div>
            <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-[30px] font-[560] leading-none text-[#e8ddbf] md:text-[42px]" style={{ fontFamily: '"Fraunces", serif' }}>
                  {fromPort} to {toPort}
                </h2>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-[#8e856f]" style={{ fontFamily: '"DM Sans", sans-serif' }}>
                  <span>{Math.round(resolution.distanceKm).toLocaleString()} km</span>
                  <span className="text-[#4f4a3d]">/</span>
                  <span>{formatRegion(resolution.fromRegion)} to {formatRegion(resolution.toRegion)}</span>
                  <span className="text-[#4f4a3d]">/</span>
                  <span style={{ color: riskColor(resolution.risk) }}>{resolution.risk} risk</span>
                  {resolution.routeKnown && (
                    <>
                      <span className="text-[#4f4a3d]">/</span>
                      <span className="text-[#6dc3b0]">charted route</span>
                    </>
                  )}
                </div>
              </div>
              <div className="rounded-md border border-[#e8c872]/20 bg-[#e8c872]/[0.06] px-3 py-2 text-right">
                <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#8e856f]" style={{ fontFamily: '"DM Sans", sans-serif' }}>Charted Run</div>
                <div className="mt-1 font-mono text-[18px] font-bold text-[#e8ddbf]">{totalDays}d baseline</div>
              </div>
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 md:px-7">
            {phase === 'briefing' && (
              <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(300px,0.9fr)]">
                <section>
                  <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-[#8e856f]" style={{ fontFamily: '"DM Sans", sans-serif' }}>
                    Choose the passage
                  </div>
                  <div className="grid gap-3">
                    {(Object.keys(STANCE_META) as VoyageStance[]).map((key) => {
                      const meta = STANCE_META[key];
                      const Icon = meta.icon;
                      const active = stance === key;
                      return (
                        <button
                          key={key}
                          data-testid={`voyage-stance-${key}`}
                          type="button"
                          onMouseEnter={() => sfxHover()}
                          onClick={() => { sfxClick(); setStance(key); }}
                          className={`grid grid-cols-[42px_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border px-3 py-3 text-left transition-all ${
                            active ? 'bg-white/[0.065]' : 'bg-white/[0.02] hover:bg-white/[0.04]'
                          }`}
                          style={{
                            borderColor: active ? `${meta.accent}88` : 'rgba(255,255,255,0.07)',
                            boxShadow: active ? `inset 3px 0 0 ${meta.accent}` : undefined,
                          }}
                        >
                          <span className="grid h-[42px] w-[42px] place-items-center rounded-md border border-white/[0.08] bg-black/20" style={{ color: meta.accent }}>
                            <Icon size={19} />
                          </span>
                          <span className="min-w-0">
                            <span className="block text-[17px] font-[560] text-[#e8ddbf]" style={{ fontFamily: '"Fraunces", serif' }}>{meta.title}</span>
                            <span className="mt-0.5 block text-[12px] text-[#8e856f]">{meta.short}</span>
                            <span className="mt-1 block text-[12.5px] leading-relaxed text-[#b9af98]">{meta.detail}</span>
                          </span>
                          {active && <Check size={17} style={{ color: meta.accent }} />}
                        </button>
                      );
                    })}
                  </div>
                </section>

                <aside className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <StatTile icon={Waves} label="Days" value={`${resolution.actualDays}`} tone={STANCE_META[stance].accent} />
                    <StatTile icon={Package} label="Provisions" value={`${resolution.provisionCost}`} tone={rationShortfall > 0 ? '#e89b9b' : '#d4ccb6'} />
                    <StatTile icon={Shield} label="Hull Risk" value={resolution.hullDamage > 0 ? `-${resolution.hullDamage}` : 'None'} tone={resolution.hullDamage > 0 ? '#e8c872' : '#6dc3b0'} />
                    <StatTile icon={HeartPulse} label="Morale" value={resolution.moraleDelta > 0 ? `+${resolution.moraleDelta}` : `${resolution.moraleDelta}`} tone={resolution.moraleDelta < 0 ? '#e89b9b' : resolution.moraleDelta > 0 ? '#6dc3b0' : '#d4ccb6'} />
                  </div>
                  <div className="rounded-lg border border-white/[0.07] bg-white/[0.025] px-4 py-4">
                    <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[#8e856f]" style={{ fontFamily: '"DM Sans", sans-serif' }}>
                      <AlertTriangle size={13} style={{ color: rationShortfall > 0 || resolution.hullDamage > 0 ? '#e8c872' : '#6dc3b0' }} />
                      Readiness
                    </div>
                    <p className="mt-2 text-[13px] leading-relaxed text-[#cfc5ad]" style={{ fontFamily: '"Fraunces", serif' }}>
                      {rationShortfall > 0
                        ? `The hold is short by ${rationShortfall} provisions. The crew can still sail, but the last days will be hungry.`
                        : `Stores are sufficient for this passage, with ${Math.max(0, provisions - resolution.provisionCost)} provisions expected on arrival.`}
                    </p>
                    {resolution.hullDamage > 0 && (
                      <p className="mt-2 text-[13px] leading-relaxed text-[#d9bf80]" style={{ fontFamily: '"Fraunces", serif' }}>
                        The route may cost roughly {resolution.hullDamage} hull if weather and sea room turn against you.
                      </p>
                    )}
                    {resolution.roleEffects.length > 0 && (
                      <div className="mt-3 space-y-1 border-t border-white/[0.06] pt-3">
                        {resolution.roleEffects.map((effect) => (
                          <div key={effect} className="text-[12px] text-[#9fc9bd]" style={{ fontFamily: '"DM Sans", sans-serif' }}>
                            {effect}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </aside>
              </div>
            )}

            {phase === 'incident' && (
              <div className="mx-auto max-w-3xl">
                <div className="rounded-lg border border-[#e8c872]/25 bg-[#e8c872]/[0.055] px-5 py-5">
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#b9a76f]" style={{ fontFamily: '"DM Sans", sans-serif' }}>
                    At Sea
                  </div>
                  <h3 className="mt-2 text-[30px] font-[560] leading-none text-[#e8ddbf]" style={{ fontFamily: '"Fraunces", serif' }}>
                    {resolution.incident.title}
                  </h3>
                  <p className="mt-3 text-[16px] leading-relaxed text-[#cfc5ad]" style={{ fontFamily: '"Fraunces", serif' }}>
                    {resolution.incident.text}
                  </p>
                </div>
                {resolution.incident.choices ? (
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    {resolution.incident.choices.map((choice) => (
                      <button
                        key={choice.id}
                        type="button"
                        onMouseEnter={() => sfxHover()}
                        onClick={() => chooseIncident(choice.id)}
                        className="rounded-lg border border-white/[0.08] bg-white/[0.025] px-4 py-4 text-left transition-all hover:border-[#e8c872]/45 hover:bg-white/[0.05] active:scale-[0.99]"
                      >
                        <div className="text-[17px] font-[560] text-[#e8ddbf]" style={{ fontFamily: '"Fraunces", serif' }}>
                          {choice.label}
                        </div>
                        <div className="mt-1 text-[12px] leading-relaxed text-[#8e856f]" style={{ fontFamily: '"DM Sans", sans-serif' }}>
                          {choice.detail}
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="mt-3 rounded-lg border border-white/[0.08] bg-white/[0.025] px-4 py-4">
                    <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#8e856f]" style={{ fontFamily: '"DM Sans", sans-serif' }}>
                      Ship's log
                    </div>
                    <div className="mt-1 text-[18px] font-[560] text-[#e8ddbf]" style={{ fontFamily: '"Fraunces", serif' }}>
                      {resolution.incident.autoResult?.resultText}
                    </div>
                  </div>
                )}
              </div>
            )}

            {(phase === 'log' || phase === 'arrived') && (
              <div className="grid gap-5">
                <section className="rounded-lg border border-white/[0.07] bg-[#05070d]/70">
                  <div className="border-b border-white/[0.07] px-4 py-3 text-[10px] font-bold uppercase tracking-[0.16em] text-[#8e856f]" style={{ fontFamily: '"DM Sans", sans-serif' }}>
                    Captain's Passage Log
                  </div>
                  <div className="space-y-3 px-4 py-4">
                    {resolution.events.slice(0, shownEvents).map((event) => (
                      <motion.div
                        key={`${event.day}:${event.title}`}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="grid grid-cols-[54px_minmax(0,1fr)] gap-3"
                      >
                        <div className="font-mono text-[12px] font-bold" style={{ color: TONE_COLOR[event.tone] }}>Day {event.day}</div>
                        <div>
                          <div className="text-[16px] font-[560] text-[#e8ddbf]" style={{ fontFamily: '"Fraunces", serif' }}>{event.title}</div>
                          <div className="mt-1 text-[13px] leading-relaxed text-[#b9af98]" style={{ fontFamily: '"Fraunces", serif' }}>{event.text}</div>
                        </div>
                      </motion.div>
                    ))}
                    {phase === 'arrived' && (
                      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-2 rounded-md border border-[#6dc3b0]/25 bg-[#6dc3b0]/[0.06] px-3 py-3">
                        <div className="text-[17px] font-[560] text-[#d7f2e9]" style={{ fontFamily: '"Fraunces", serif' }}>Landfall at {toPort}</div>
                        <div className="mt-1 text-[12.5px] text-[#9fc9bd]">
                          {resolution.chartedRoute ? `${fromPort}-${toPort} is now charted.` : 'The harbor is in sight. Orders are ready for arrival.'}
                        </div>
                      </motion.div>
                    )}
                  </div>
                </section>
              </div>
            )}
          </div>

          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.07] px-5 py-4 md:px-7">
            <button
              type="button"
              onClick={() => { sfxClose(); finish(true); }}
              onMouseEnter={() => sfxHover()}
              className="min-h-10 rounded-md border border-white/[0.08] px-4 text-[10px] font-bold uppercase tracking-[0.14em] text-[#8e856f] transition-colors hover:text-[#e8ddbf]"
              style={{ fontFamily: '"DM Sans", sans-serif' }}
            >
              Skip Passage
            </button>
            {phase === 'briefing' ? (
              <button
                type="button"
                data-testid="voyage-begin"
                disabled={!canDepart}
                onClick={beginVoyage}
                onMouseEnter={() => { if (canDepart) sfxHover(); }}
                className="min-h-11 rounded-md border px-5 text-[11px] font-bold uppercase tracking-[0.15em] text-[#211707] transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                style={{ fontFamily: '"DM Sans", sans-serif', background: STANCE_META[stance].accent, borderColor: STANCE_META[stance].accent }}
              >
                Set Sail - {STANCE_META[stance].title}
              </button>
            ) : phase === 'incident' ? (
              <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#8e856f]" style={{ fontFamily: '"DM Sans", sans-serif' }}>
                {resolution.incident.choices ? 'Choose an order' : 'Recording passage'}
              </div>
            ) : (
              <button
                type="button"
                data-testid="voyage-landfall"
                disabled={phase !== 'arrived'}
                onClick={() => finish(false)}
                onMouseEnter={() => { if (phase === 'arrived') sfxHover(); }}
                className="min-h-11 rounded-md border border-[#6dc3b0]/70 bg-[#6dc3b0] px-5 text-[11px] font-bold uppercase tracking-[0.15em] text-[#04110d] transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-35"
                style={{ fontFamily: '"DM Sans", sans-serif' }}
              >
                Make Landfall
              </button>
            )}
          </footer>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
