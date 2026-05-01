import { useEffect, useRef } from 'react';
import { motion, type Variants } from 'framer-motion';
import { Anchor, CalendarDays, Sailboat, X } from 'lucide-react';
import { FACTIONS } from '../constants/factions';
import { PORT_FACTION, type Nationality } from '../store/gameStore';
import { parchment } from '../theme/tokens';
import { formatGameDateLong } from '../utils/gameDate';
import { getPortBannerCandidates } from '../utils/portAssets';
import type { VoyageResolution } from '../utils/voyageResolution';

const MONO = '"SF Mono", "Fira Code", "Cascadia Code", "Consolas", monospace';
const SERIF = '"Fraunces", serif';
const SEAL_GRID_SRC = '/icons/seal icon grid.png';
const EASE = [0.2, 0.8, 0.25, 1] as const;

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
      <div
        className="absolute left-4 right-4 top-1/2 h-px"
        style={{ background: `linear-gradient(to right, ${parchment.dimGold}35, ${parchment.gold}, ${parchment.dimGold}35)` }}
      />
      <span className="absolute left-1 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full border" style={{ borderColor: parchment.gold, background: 'rgba(12,11,8,0.96)' }} />
      <span className="absolute right-1 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full border" style={{ borderColor: parchment.teal, background: 'rgba(12,11,8,0.96)' }} />
      <motion.div
        className="absolute top-1/2 -translate-y-1/2"
        initial={{ left: '8%' }}
        animate={{ left: '86%' }}
        transition={{ duration: durationMs / 1000, ease: EASE }}
        style={{ color: parchment.gold }}
      >
        <Sailboat size={22} />
      </motion.div>
    </div>
  );
}

interface PassageInterstitialProps {
  fromPort: string;
  toPort: string;
  toPortId: string;
  currentDay: number;
  resolution: VoyageResolution;
  hasIncident: boolean;
  onDone: () => void;
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
  const arrivalDay = currentDay + resolution.actualDays;
  const faction = PORT_FACTION[toPortId];
  const durationMs = passageDurationMs(resolution.actualDays);
  const onDoneRef = useRef(onDone);
  const doneRef = useRef(false);

  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDoneRef.current();
  };

  useEffect(() => {
    const id = window.setTimeout(finish, durationMs);
    return () => window.clearTimeout(id);
  }, [durationMs]);

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
        className="relative w-full max-w-[520px] overflow-hidden rounded-[10px] px-6 py-6 text-center"
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
        <button
          type="button"
          onClick={finish}
          className="absolute right-3 bottom-3 z-10 flex h-8 items-center gap-1 rounded-[4px] border px-2 text-[9px] uppercase tracking-[0.13em] transition-colors hover:bg-white/[0.06]"
          style={{ borderColor: 'rgba(201,168,76,0.22)', color: parchment.dimGold, fontFamily: MONO }}
          aria-label="Skip passage"
        >
          <X size={12} />
          Skip
        </button>

        <div className="mx-auto flex max-w-[350px] items-center justify-center gap-3 uppercase" style={{ color: parchment.dimGold, fontSize: 10, letterSpacing: '0.16em' }}>
          <span className="h-px flex-1" style={{ background: `linear-gradient(to right, transparent, ${parchment.dimGold}70)` }} />
          <span>Passage Made</span>
          <span className="h-px flex-1" style={{ background: `linear-gradient(to left, transparent, ${parchment.dimGold}70)` }} />
        </div>

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
          <div className="rounded-[4px] border px-3 py-2" style={{ borderColor: parchment.rule, background: 'rgba(255,255,255,0.025)' }}>
            <div className="flex items-center gap-2 uppercase" style={{ color: parchment.dimGold, fontSize: 9, letterSpacing: '0.14em' }}>
              <Anchor size={12} />
              At sea
            </div>
            <div className="mt-1 font-mono text-[20px] font-bold" style={{ color: parchment.gold }}>{resolution.actualDays} days</div>
          </div>
          <div className="rounded-[4px] border px-3 py-2" style={{ borderColor: parchment.rule, background: 'rgba(255,255,255,0.025)' }}>
            <div className="flex items-center gap-2 uppercase" style={{ color: parchment.dimGold, fontSize: 9, letterSpacing: '0.14em' }}>
              <CalendarDays size={12} />
              Arrival
            </div>
            <div className="mt-1 text-[16px]" style={{ color: parchment.txt, fontFamily: SERIF }}>{formatGameDateLong(arrivalDay)}</div>
          </div>
        </div>

        <div className="mx-auto mt-4 h-px max-w-[300px]" style={{ background: `linear-gradient(to right, transparent, ${parchment.gold}80, transparent)` }} />
        <p className="mt-3 text-[12px] uppercase tracking-[0.16em]" style={{ color: hasIncident ? parchment.warm : parchment.teal }}>
          {hasIncident ? 'A matter at sea requires orders' : 'Harbor in sight'}
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
    </motion.div>
  );
}
