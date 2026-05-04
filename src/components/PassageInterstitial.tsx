import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, type Variants } from 'framer-motion';
import { Anchor, CalendarDays, Check, HeartPulse, Loader2, Package, Sailboat, Shield } from 'lucide-react';
import { FACTIONS } from '../constants/factions';
import { PORT_FACTION, type Nationality } from '../store/gameStore';
import { parchment } from '../theme/tokens';
import { formatGameDateLong } from '../utils/gameDate';
import { getPortBannerCandidates } from '../utils/portAssets';
import { applyVoyageIncidentChoice, type VoyageEventTone, type VoyageResolution } from '../utils/voyageResolution';
import { getSeaRouteFeatureLabels } from '../utils/worldPorts';

const MONO = '"SF Mono", "Fira Code", "Cascadia Code", "Consolas", monospace';
const SERIF = '"Fraunces", serif';
const SANS = '"DM Sans", sans-serif';
const SEAL_GRID_SRC = '/icons/seal icon grid.png';
const EASE = [0.2, 0.8, 0.25, 1] as const;

const TONE_COLOR: Record<VoyageEventTone, string> = {
  good: '#6dc3b0',
  neutral: '#9bc4e8',
  warning: '#e8c872',
  danger: '#e89b9b',
};

const SEAL_GRID_POSITION: Partial<Record<Nationality, [number, number]>> = {
  English: [0, 0],
  Portuguese: [1, 0],
  Dutch: [2, 0],
  Spanish: [0, 1],
  Venetian: [1, 1],
  Omani: [2, 1],
  Chinese: [0, 2],
  Pirate: [1, 2],
  Gujarati: [2, 2],
};

const panelMotion: Variants = {
  hidden: { opacity: 0, scale: 0.97, y: 12 },
  show: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.38, ease: EASE } },
  exit: { opacity: 0, scale: 0.98, y: 8, transition: { duration: 0.16 } },
};

function Corner({ pos }: { pos: 'tl' | 'tr' | 'bl' | 'br' }) {
  const style: React.CSSProperties = {
    position: 'absolute',
    width: 22,
    height: 16,
    pointerEvents: 'none',
    borderColor: `${parchment.gold}99`,
    filter: `drop-shadow(0 0 5px ${parchment.gold}44)`,
  };
  if (pos === 'tl') { style.top = 10; style.left = 10; style.borderTopWidth = 2; style.borderLeftWidth = 2; }
  if (pos === 'tr') { style.top = 10; style.right = 10; style.borderTopWidth = 2; style.borderRightWidth = 2; }
  if (pos === 'bl') { style.bottom = 10; style.left = 10; style.borderBottomWidth = 2; style.borderLeftWidth = 2; }
  if (pos === 'br') { style.bottom = 10; style.right = 10; style.borderBottomWidth = 2; style.borderRightWidth = 2; }
  return <span style={style} />;
}

function FactionSeal({ factionId }: { factionId?: Nationality }) {
  if (!factionId) return null;
  const faction = FACTIONS[factionId];
  const pos = SEAL_GRID_POSITION[factionId];
  if (!faction || !pos) return null;

  const [col, row] = pos;
  return (
    <motion.div
      className="absolute right-3 top-3 hidden h-[84px] w-[84px] rotate-10 select-none sm:block"
      title={faction.displayName}
      initial={{ opacity: 0, rotate: 16, scale: 0.9 }}
      animate={{ opacity: 0.92, rotate: 10, scale: 1 }}
      transition={{ duration: 0.45, ease: EASE }}
      style={{
        backgroundImage: `url("${SEAL_GRID_SRC}")`,
        backgroundSize: '300% 300%',
        backgroundPosition: `${col * 50}% ${row * 50}%`,
        backgroundRepeat: 'no-repeat',
        filter: 'drop-shadow(0 10px 18px rgba(0,0,0,0.9))',
      }}
    >
      <span className="sr-only">{faction.displayName}</span>
    </motion.div>
  );
}

function passageDurationMs(days: number): number {
  const t = Math.max(0, Math.min(1, (days - 3) / 24));
  return Math.round(5000 + t * 5000);
}

function PassageLine({ durationMs }: { durationMs: number }) {
  return (
    <div className="relative mx-auto mt-5 h-12 max-w-[360px]" aria-hidden>
      <style>{`
        @keyframes passage-boat-glide {
          from { transform: translate3d(0, -50%, 0); }
          to { transform: translate3d(calc(100% - 22px), -50%, 0); }
        }
        @keyframes passage-boat-bob {
          0%, 100% { transform: translateY(0) rotate(-1deg); }
          50% { transform: translateY(-3px) rotate(1.5deg); }
        }
        @keyframes passage-arrival-pulse {
          0%, 82% {
            box-shadow: 0 0 0 0 rgba(107, 195, 176, 0);
            transform: translateY(-50%) scale(1);
          }
          92% {
            box-shadow: 0 0 0 7px rgba(107, 195, 176, 0.18);
            transform: translateY(-50%) scale(1.28);
          }
          100% {
            box-shadow: 0 0 0 12px rgba(107, 195, 176, 0);
            transform: translateY(-50%) scale(1);
          }
        }
      `}</style>
      <div
        className="absolute left-4 right-4 top-1/2 h-px"
        style={{ background: `linear-gradient(to right, ${parchment.dimGold}35, ${parchment.gold}, ${parchment.dimGold}35)` }}
      />
      <span className="absolute left-1 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full border" style={{ borderColor: parchment.gold, background: 'rgba(12,11,8,0.96)' }} />
      <span
        className="absolute right-1 top-1/2 h-2 w-2 rounded-full border"
        style={{
          animation: `passage-arrival-pulse ${durationMs}ms ease-out forwards`,
          borderColor: parchment.teal,
          background: 'rgba(12,11,8,0.96)',
        }}
      />
      <div
        className="absolute left-1 top-1/2 w-[calc(100%-0.5rem)]"
        style={{
          animation: `passage-boat-glide ${durationMs}ms linear forwards`,
          color: parchment.gold,
          willChange: 'transform',
        }}
      >
        <Sailboat
          size={22}
          style={{
            animation: 'passage-boat-bob 1.35s ease-in-out infinite',
            filter: `drop-shadow(0 0 5px ${parchment.gold}55)`,
            transformOrigin: '50% 70%',
            willChange: 'transform',
          }}
        />
      </div>
    </div>
  );
}

function ReportRow({
  icon: Icon,
  label,
  value,
  tone = parchment.txt,
  detail,
}: {
  icon: typeof Anchor;
  label: string;
  value: string;
  tone?: string;
  detail?: string;
}) {
  return (
    <div className="rounded-lg border px-3 py-2.5 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]" style={{ borderColor: 'rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.026)' }}>
      <div className="flex items-center gap-2 uppercase" style={{ color: parchment.dimGold, fontFamily: SANS, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em' }}>
        <Icon size={12} strokeWidth={1.8} />
        {label}
      </div>
      <div className="mt-1 text-[18px] font-[560] leading-none" style={{ color: tone, fontFamily: SERIF }}>{value}</div>
      {detail && <div className="mt-1 text-[11px] leading-snug" style={{ color: '#9ca3af', fontFamily: SANS }}>{detail}</div>}
    </div>
  );
}

function PrimaryButton({
  busy,
  children,
  onClick,
}: {
  busy?: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const isLit = hovered && !busy;

  return (
    <motion.button
      type="button"
      data-testid="voyage-landfall"
      onClick={onClick}
      disabled={busy}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      whileHover={!busy ? { y: -2 } : undefined}
      whileTap={!busy ? { scale: 0.975 } : undefined}
      className="relative mt-6 flex min-h-[54px] w-full items-center justify-center gap-3 overflow-hidden rounded-[5px] border px-5 text-[12px] font-bold uppercase transition-all disabled:cursor-wait"
      style={{
        fontFamily: MONO,
        letterSpacing: '0.24em',
        color: busy ? 'rgba(245,217,160,0.62)' : isLit ? '#ffffff' : '#f5d9a0',
        background: isLit ? 'rgba(30, 23, 12, 0.94)' : 'rgba(16, 14, 22, 0.92)',
        borderColor: busy ? 'rgba(122,100,50,0.45)' : isLit ? '#f5d9a0' : '#c9a84c',
        boxShadow: busy
          ? '0 0 0 1px rgba(122,100,50,0.2) inset, 0 2px 8px rgba(0,0,0,0.4)'
          : `0 0 0 1px rgba(201,168,76,0.42) inset, 0 1px 0 rgba(255,238,184,0.36) inset, 0 -1px 0 rgba(78,54,20,0.45) inset, 0 0 ${isLit ? 28 : 16}px rgba(201,168,76,${isLit ? 0.36 : 0.2}), 0 3px 12px rgba(0,0,0,0.56)`,
        transition: 'all 0.18s ease',
      }}
    >
      {!busy && (
        <motion.span
          aria-hidden
          animate={{ opacity: isLit ? [0.7, 1, 0.7] : [0.42, 0.72, 0.42] }}
          transition={{ duration: 2.4, ease: 'easeInOut', repeat: Infinity }}
          className="absolute inset-[2px] rounded-[3px] transition-opacity"
          style={{
            background: isLit
              ? 'linear-gradient(115deg, rgba(255,244,216,0.34), rgba(201,168,76,0.12) 38%, transparent 62%), linear-gradient(180deg, rgba(255,232,176,0.18), transparent 46%, rgba(55,35,12,0.2))'
              : 'linear-gradient(115deg, rgba(255,244,216,0.2), rgba(201,168,76,0.06) 36%, transparent 58%), linear-gradient(180deg, rgba(255,232,176,0.1), transparent 42%, rgba(55,35,12,0.16))',
            boxShadow: `0 0 0 1px rgba(255,230,170,${isLit ? 0.26 : 0.15}) inset`,
          }}
        />
      )}
      <span className="relative z-10 flex items-center gap-3">
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
        {children}
      </span>
    </motion.button>
  );
}

interface PassageInterstitialProps {
  fromPort: string;
  toPort: string;
  toPortId: string;
  currentDay: number;
  resolution: VoyageResolution;
  hasIncident: boolean;
  onDone: (resolution: VoyageResolution) => void | Promise<void>;
}

export default function PassageInterstitial({
  fromPort,
  toPort,
  toPortId,
  currentDay,
  resolution,
  hasIncident,
  onDone,
}: PassageInterstitialProps) {
  const candidates = getPortBannerCandidates(toPortId);
  const faction = PORT_FACTION[toPortId];
  const durationMs = passageDurationMs(resolution.actualDays);
  const onDoneRef = useRef(onDone);
  const doneRef = useRef(false);
  const [phase, setPhase] = useState<'passage' | 'incident' | 'report' | 'landing'>('passage');
  const [passageLabelIndex, setPassageLabelIndex] = useState(0);
  const [resolvedVoyage, setResolvedVoyage] = useState(resolution);

  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    setResolvedVoyage(resolution);
    setPhase('passage');
    setPassageLabelIndex(0);
    doneRef.current = false;
  }, [resolution]);

  const finish = async (finalResolution = resolvedVoyage) => {
    if (doneRef.current) return;
    doneRef.current = true;
    setPhase('landing');
    await onDoneRef.current(finalResolution);
  };

  useEffect(() => {
    const id = window.setTimeout(() => {
      setPhase(hasIncident ? 'incident' : 'report');
    }, durationMs + 250);
    return () => window.clearTimeout(id);
  }, [durationMs, hasIncident]);

  const passageStatusLabels = useMemo(() => {
    const features = getSeaRouteFeatureLabels(resolution.fromPortId, toPortId);
    const firstFeature = features[0] ?? 'open water';
    const secondFeature = features.find((feature) => feature !== firstFeature) ?? null;
    return [
      `Departing ${fromPort}`,
      `Crossing ${firstFeature}`,
      secondFeature ? `Making ${secondFeature}` : `Standing for ${toPort}`,
      'Harbor in sight',
    ];
  }, [fromPort, resolution.fromPortId, toPort, toPortId]);

  useEffect(() => {
    if (phase !== 'passage') return;
    setPassageLabelIndex(0);
    const ids = passageStatusLabels.slice(1).map((_, index) => {
      const progress = [0.32, 0.62, 0.86][index] ?? 0.86;
      return window.setTimeout(() => {
        setPassageLabelIndex(index + 1);
      }, Math.max(350, Math.round(durationMs * progress)));
    });
    return () => ids.forEach((id) => window.clearTimeout(id));
  }, [durationMs, passageStatusLabels, phase]);

  useEffect(() => {
    if (phase !== 'report') return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' && event.key !== 'Escape') return;
      event.preventDefault();
      void finish(resolvedVoyage);
    };
    window.addEventListener('keydown', handleKeyDown);
    const autoCloseId = window.setTimeout(() => {
      void finish(resolvedVoyage);
    }, 7000);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.clearTimeout(autoCloseId);
    };
  }, [phase, resolvedVoyage]);

  function chooseIncident(choiceId: string) {
    const next = applyVoyageIncidentChoice(resolution, choiceId);
    setResolvedVoyage(next);
    setPhase('report');
  }

  const arrivalDay = currentDay + resolvedVoyage.actualDays;
  const reportRows = useMemo<Array<{ icon: typeof Anchor; label: string; value: string; tone?: string; detail?: string }>>(() => [
      { icon: Anchor, label: 'At sea', value: `${resolvedVoyage.actualDays} days`, detail: `${fromPort} to ${toPort}` },
      { icon: Package, label: 'Stores', value: `-${resolvedVoyage.provisionCost}`, tone: resolvedVoyage.provisionCost > 0 ? parchment.warm : parchment.teal, detail: 'provisions consumed' },
      { icon: Shield, label: 'Hull', value: resolvedVoyage.hullDamage > 0 ? `-${resolvedVoyage.hullDamage}` : 'No damage', tone: resolvedVoyage.hullDamage > 0 ? parchment.warm : parchment.teal },
      { icon: HeartPulse, label: 'Crew morale', value: resolvedVoyage.moraleDelta > 0 ? `+${resolvedVoyage.moraleDelta}` : `${resolvedVoyage.moraleDelta}`, tone: resolvedVoyage.moraleDelta < 0 ? '#e89b9b' : resolvedVoyage.moraleDelta > 0 ? parchment.teal : parchment.txt },
    ], [fromPort, resolvedVoyage, toPort]);

  return (
    <motion.div
      className="fixed inset-0 z-[9998] flex items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22 }}
      style={{ backgroundColor: 'rgba(6,5,4,0.62)', backdropFilter: 'blur(3px)' }}
    >
      <motion.img
        src={candidates[0]}
        alt=""
        initial={{ scale: 1.08 }}
        animate={{ scale: 1.035 }}
        onError={(event) => { event.currentTarget.style.display = 'none'; }}
        transition={{ duration: 1.4, ease: EASE }}
        className="absolute inset-0 h-full w-full object-cover"
        style={{ filter: 'sepia(0.18) contrast(1.05) brightness(0.52) saturate(1.05)' }}
      />
      <div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(ellipse at center, transparent 24%, rgba(6,5,4,0.58) 74%, rgba(6,5,4,0.92) 100%)' }}
      />

      <motion.div
        variants={panelMotion}
        initial="hidden"
        animate="show"
        exit="exit"
        className="relative w-full max-w-[620px] overflow-hidden rounded-xl px-5 py-6 text-center sm:px-6 sm:py-8"
        style={{
          backgroundColor: 'rgba(12,11,8,0.95)',
          backgroundImage: 'linear-gradient(115deg, rgba(201,168,76,0.13), transparent 34%), linear-gradient(180deg, rgba(255,255,255,0.035), transparent 24%)',
          border: '1px solid rgba(201,168,76,0.25)',
          boxShadow: '0 25px 70px rgba(0,0,0,0.78), inset 0 1px 0 rgba(255,232,164,0.08), inset 0 0 28px rgba(0,0,0,0.38)',
          color: parchment.txt,
          fontFamily: MONO,
        }}
      >
        <div className="pointer-events-none absolute inset-[9px] rounded-[7px] border" style={{ borderColor: 'rgba(201,168,76,0.22)' }} />
        <Corner pos="tl" />
        <Corner pos="tr" />
        <Corner pos="bl" />
        <Corner pos="br" />
        <FactionSeal factionId={faction} />
        <div className="mx-auto flex max-w-[350px] items-center justify-center gap-3 uppercase" style={{ color: parchment.dimGold, fontSize: 10, letterSpacing: '0.16em' }}>
          <span className="h-px flex-1" style={{ background: `linear-gradient(to right, transparent, ${parchment.dimGold}70)` }} />
          <span>{phase === 'passage' ? 'Passage Made' : phase === 'incident' ? 'At Sea' : 'Passage Log'}</span>
          <span className="h-px flex-1" style={{ background: `linear-gradient(to left, transparent, ${parchment.dimGold}70)` }} />
        </div>

        <AnimatePresence mode="wait">
          {phase === 'passage' && (
            <motion.div key="passage" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22 }}>
              <h2
                className="mx-auto mt-3 max-w-[430px] text-[28px] font-normal leading-tight sm:text-[36px]"
                style={{
                  color: '#d9cfad',
                  fontFamily: SERIF,
                  textShadow: '0 1px 0 rgba(255,238,190,0.16), 0 10px 22px rgba(0,0,0,0.62)',
                  fontVariantCaps: 'small-caps',
                  letterSpacing: '0.04em',
                }}
              >
                {fromPort} to {toPort}
              </h2>
              <PassageLine durationMs={durationMs} />
              <div className="mt-4 grid grid-cols-2 gap-2 text-left">
                <ReportRow icon={Anchor} label="At sea" value={`${resolution.actualDays} days`} tone={parchment.gold} />
                <ReportRow icon={CalendarDays} label="Arrival" value={formatGameDateLong(currentDay + resolution.actualDays)} />
              </div>
              <div className="mx-auto mt-4 h-px max-w-[300px]" style={{ background: `linear-gradient(to right, transparent, ${parchment.gold}80, transparent)` }} />
              <p className="mt-3 text-[12px] uppercase tracking-[0.16em]" style={{ color: hasIncident ? parchment.warm : parchment.teal }}>
                {hasIncident && passageLabelIndex >= passageStatusLabels.length - 1
                  ? 'A matter at sea requires orders'
                  : passageStatusLabels[passageLabelIndex]}
              </p>
              <div className="mx-auto mt-3 h-1 max-w-[260px] overflow-hidden rounded-full" style={{ background: 'rgba(201,168,76,0.12)' }} aria-hidden>
                <motion.div
                  className="h-full"
                  style={{ background: `linear-gradient(to right, ${parchment.dimGold}, ${parchment.gold})` }}
                  initial={{ width: '0%' }}
                  animate={{ width: '100%' }}
                  transition={{ duration: durationMs / 1000, ease: 'linear' }}
                />
              </div>
            </motion.div>
          )}

          {phase === 'incident' && (
            <motion.div key="incident" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.24 }}>
              <h2 className="mx-auto mt-3 max-w-[430px] text-[28px] font-normal leading-tight sm:text-[34px]" style={{ color: '#d9cfad', fontFamily: SERIF, fontVariantCaps: 'small-caps', letterSpacing: '0.04em' }}>
                {resolution.incident.title}
              </h2>
              <p className="mx-auto mt-3 max-w-[430px] text-[15px] leading-relaxed" style={{ color: parchment.txt, fontFamily: SERIF }}>
                {resolution.incident.text}
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {resolution.incident.choices?.map((choice) => (
                  <button
                    key={choice.id}
                    type="button"
                    onClick={() => chooseIncident(choice.id)}
                    className="rounded-[5px] border px-4 py-4 text-left transition-all hover:translate-y-[-1px] hover:bg-white/[0.055] active:scale-[0.99]"
                    style={{ borderColor: 'rgba(201,168,76,0.22)', background: 'rgba(255,255,255,0.025)' }}
                  >
                    <div className="text-[17px] font-normal" style={{ color: parchment.gold, fontFamily: SERIF }}>{choice.label}</div>
                    <div className="mt-1 text-[12px] leading-relaxed" style={{ color: parchment.dimGold }}>{choice.detail}</div>
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {phase === 'report' && (
            <motion.div key="report" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.24 }}>
              <h2 className="mx-auto mt-7 max-w-[380px] text-[30px] font-[560] leading-tight sm:max-w-[420px] sm:text-[38px]" style={{ color: '#e8ddbf', fontFamily: SERIF, fontVariationSettings: '"opsz" 72, "SOFT" 18, "WONK" 1' }}>
                {fromPort} to {toPort}
              </h2>
              <div className="mt-6 grid grid-cols-2 gap-2.5">
                {reportRows.map((row) => (
                  <ReportRow key={row.label} {...row} />
                ))}
              </div>
              <div className="mt-4 max-h-[250px] space-y-2 overflow-y-auto pr-1">
                {resolvedVoyage.events.map((event, index) => (
                  <motion.div
                    key={`${event.day}:${event.title}:${index}`}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.18, delay: Math.min(index * 0.05, 0.18) }}
                    className="grid grid-cols-[54px_minmax(0,1fr)] gap-3 rounded-xl border px-3 py-3 text-left"
                    style={{ borderColor: 'rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.024)' }}
                  >
                    <div className="font-mono text-[11px] font-bold uppercase tracking-[0.08em]" style={{ color: TONE_COLOR[event.tone] }}>Day {event.day}</div>
                    <div>
                      <div className="text-[16px] font-[560]" style={{ color: '#e8ddbf', fontFamily: SERIF }}>{event.title}</div>
                      <div className="mt-1 text-[12px] leading-relaxed text-slate-400" style={{ fontFamily: SANS }}>{event.text}</div>
                    </div>
                  </motion.div>
                ))}
                <div className="rounded-xl border px-3 py-3 text-left" style={{ borderColor: 'rgba(109,195,176,0.25)', background: 'rgba(109,195,176,0.06)' }}>
                  <div className="text-[16px] font-[560]" style={{ color: '#d7f2e9', fontFamily: SERIF }}>Landfall at {toPort}</div>
                  <div className="mt-1 text-[12px]" style={{ color: '#9fc9bd', fontFamily: SANS }}>Arrival entered for {formatGameDateLong(arrivalDay)}.</div>
                </div>
              </div>
              <PrimaryButton onClick={() => void finish(resolvedVoyage)}>
                Make Landfall
              </PrimaryButton>
            </motion.div>
          )}

          {phase === 'landing' && (
            <motion.div key="landing" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
              <h2 className="mx-auto mt-3 max-w-[500px] text-[30px] font-[560] leading-tight sm:text-[38px]" style={{ color: '#e8ddbf', fontFamily: SERIF, fontVariationSettings: '"opsz" 72, "SOFT" 18, "WONK" 1' }}>
                {toPort}
              </h2>
              <p className="mx-auto mt-2 max-w-[430px] text-[13px] leading-relaxed text-slate-400" style={{ fontFamily: SANS }}>
                Harbor boats are coming alongside.
              </p>
              <div className="mx-auto mt-6 h-1.5 max-w-[300px] overflow-hidden rounded-full" style={{ background: 'rgba(201,168,76,0.12)' }} aria-hidden>
                <motion.div
                  className="h-full w-1/3 rounded-full"
                  style={{ background: `linear-gradient(to right, ${parchment.dimGold}, ${parchment.gold})` }}
                  animate={{ x: ['-120%', '330%'] }}
                  transition={{ duration: 1.1, ease: 'easeInOut', repeat: Infinity }}
                />
              </div>
              <PrimaryButton busy onClick={() => undefined}>
                Making Landfall
              </PrimaryButton>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
