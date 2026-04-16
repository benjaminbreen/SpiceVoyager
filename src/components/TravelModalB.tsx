// ═══════════════════════════════════════════════════════════════════════════
// TRAVEL MODAL — "Clean & Centered" design
// Wide, baroque-bordered. Ship art with stars/lantern/parallax waves.
// Single event crossfades in large serif. Elaborate ASCII progress bar
// with animated wake effect. Minimal, polished, delightful.
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ASCII_COLORS, C, BaroqueBorder, useSparkle } from './ascii-ui-kit';
import { PORT_REGIONS } from '../utils/worldPorts';

const MONO = '"SF Mono", "Fira Code", "Cascadia Code", "Consolas", monospace';
const SERIF = '"Fraunces", serif';

// ── Ship ASCII art ──────────────────────────────────────────────────────

const SHIP_ART: Record<string, string[]> = {
  Carrack: [
    '            |    |    |',
    '           )_)  )_)  )_)',
    '          )___))___))___)\\',
    '         )____)____)_____)\\\\',
    '       _____|____|____|____\\\\\\__',
    '  ─────\\                   /──────',
  ],
  Galleon: [
    '           |    |    |    |',
    '          )_)  )_)  )_)  )_)',
    '         )___))___))___))___)\\',
    '        )____)____)____)_____)\\\\',
    '      ______|____|____|____|____\\\\\\__',
    '  ────\\                           /─────',
  ],
  Dhow: [
    '             |',
    '            /|',
    '           / |',
    '          /  |',
    '         /   |',
    '       _/____|____',
    '  ─────\\         /──────',
  ],
  Junk: [
    '           |  |  |',
    '          _|__|__|_',
    '         |__|__|__|\\',
    '         |__|__|__|\\\\',
    '       __|__|__|__|__\\\\',
    '  ─────\\              /──────',
  ],
  Pinnace: [
    '           |',
    '          )_)',
    '         )___)\\',
    '        )____)\\\\',
    '      ___|____|_\\\\\\',
    '  ────\\          /─────',
  ],
};

// ── Route-aware event pools ─────────────────────────────────────────────

interface VoyageEvent {
  text: string;
}

const GENERIC_EVENTS: VoyageEvent[] = [
  { text: 'Fair winds fill our sails. The crew is in good spirits.' },
  { text: 'Spotted dolphins riding our bow wave at dawn.' },
  { text: 'A squall blew through in the night \u2014 no damage sustained.' },
  { text: 'Beautiful sunset paints the sky crimson and gold.' },
  { text: 'Flying fish land on deck. Cook adds them to the stew.' },
  { text: 'Moonrise over calm waters. The navigator takes a star fix.' },
  { text: 'Strong following current carries us swiftly onward.' },
  { text: 'Crew mends canvas and splices rope during a calm.' },
  { text: 'An albatross follows in our wake for three days.' },
  { text: 'Morning fog lifts to reveal clear seas to the horizon.' },
  { text: 'The bosun leads a shanty as the sun goes down.' },
  { text: 'Heat oppressive. Extra water rations issued.' },
];

const REGION_EVENTS: Record<string, VoyageEvent[]> = {
  indianOcean: [
    { text: 'The monsoon winds shift \u2014 our lateen sails catch them well.' },
    { text: 'Passed a flotilla of fishing dhows near the Malabar coast.' },
    { text: 'Sighted the mountains of the Western Ghats on the horizon.' },
    { text: 'A merchant from Gujarat hails us and shares news of pepper prices.' },
    { text: 'Warm rain at twilight. The air smells of spices on the wind.' },
  ],
  eastAfrica: [
    { text: 'Current sweeps us along the Swahili coast. Coral reefs below.' },
    { text: 'Passed the ruins of a stone city on the Zanj coast.' },
    { text: 'A monsoon gust heels us hard to port, but the helmsman holds.' },
    { text: 'Evening prayers from a nearby sambuk carry across the water.' },
    { text: 'Schools of tuna follow our hull, drawn by barnacles.' },
  ],
  eastIndies: [
    { text: 'The air grows thick and warm as we enter the Straits.' },
    { text: 'A junk with crimson sails passes \u2014 the men whisper of Zheng He.' },
    { text: 'Volcanic islands smolder on the horizon. Sulfur on the wind.' },
    { text: 'Sudden tropical rain \u2014 the crew sets out barrels for fresh water.' },
    { text: 'Parrots wheel above an island thick with spice trees.' },
  ],
  europe: [
    { text: 'Grey Atlantic swells roll beneath us. The crew wraps in wool.' },
    { text: 'A carrack flying Portuguese colors crosses our stern.' },
    { text: 'Cold fog rolls in off the coast. The lookout strains to see.' },
    { text: 'We round the headland and catch the trade wind at last.' },
    { text: 'Seabirds crowd the rigging \u2014 we must be near land.' },
  ],
  westAfrica: [
    { text: 'The Guinea current fights our progress. Slow going today.' },
    { text: 'Fires on shore at night \u2014 the coast is inhabited but unfamiliar.' },
    { text: 'A pod of whales surfaces alongside, each longer than our ship.' },
    { text: 'Heat shimmer blurs the coastline into a wavering mirage.' },
    { text: 'Lightning plays across the horizon but the storm misses us.' },
  ],
  atlantic: [
    { text: 'The trade winds fill our sails, steady and warm from the northeast.' },
    { text: 'A sea turtle drifts past, ancient and unhurried.' },
    { text: 'Stars blazing overhead. The Southern Cross guides us.' },
    { text: 'Sargasso weed tangles in our rudder \u2014 the men clear it with poles.' },
    { text: 'Distant thunder but the skies remain clear above us.' },
  ],
};

function pickVoyageEvents(
  totalDays: number,
  fromRegion: string,
  toRegion: string,
  seed: number,
): { day: number; event: VoyageEvent }[] {
  let s = seed;
  const rand = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };

  const eventCount = totalDays <= 3 ? 2 : totalDays <= 8 ? 3 : 4;

  const pool: VoyageEvent[] = [
    ...GENERIC_EVENTS,
    ...(REGION_EVENTS[fromRegion] ?? []),
    ...(REGION_EVENTS[toRegion] ?? []),
  ];

  const shuffled = [...pool].sort(() => rand() - 0.5);
  const selected = shuffled.slice(0, eventCount);

  const events: { day: number; event: VoyageEvent }[] = [];
  for (let i = 0; i < selected.length; i++) {
    const segment = totalDays / (selected.length + 1);
    const day = Math.max(1, Math.min(totalDays - 1, Math.round(segment * (i + 1) + (rand() - 0.5) * segment * 0.4)));
    events.push({ day, event: selected[i] });
  }

  const usedDays = new Set<number>();
  for (const e of events) {
    while (usedDays.has(e.day) && e.day < totalDays - 1) e.day++;
    usedDays.add(e.day);
  }

  return events.sort((a, b) => a.day - b.day);
}

// ── Parallax wave field ─────────────────────────────────────────────────

const WAVE_CHARS = [' ', '\u00b7', '~', '\u223c', '\u2248', '\u2248'];

function WaveField({ width, height, frame }: { width: number; height: number; frame: number }) {
  const { water, waterLight, foam } = ASCII_COLORS;

  const backGrid = useMemo(() => {
    const rows: string[][] = [];
    for (let y = 0; y < 2; y++) {
      const row: string[] = [];
      for (let x = 0; x < width; x++) {
        const base = Math.sin((x + frame * 0.7) * 0.25 + y * 1.2) * 0.5 + 0.5;
        const idx = Math.min(WAVE_CHARS.length - 1, Math.floor(base * WAVE_CHARS.length));
        row.push(WAVE_CHARS[idx]);
      }
      rows.push(row);
    }
    return rows;
  }, [width, frame]);

  const frontGrid = useMemo(() => {
    const rows: string[][] = [];
    for (let y = 0; y < height; y++) {
      const row: string[] = [];
      for (let x = 0; x < width; x++) {
        const base = Math.sin((x + frame * 1.5) * 0.3 + y * 0.8) * 0.5 + 0.5;
        const idx = Math.min(WAVE_CHARS.length - 1, Math.floor(base * WAVE_CHARS.length));
        row.push(WAVE_CHARS[idx]);
      }
      rows.push(row);
    }
    return rows;
  }, [width, height, frame]);

  const backColors = ['#2a4a5a', '#1a3a4a'];
  const frontColors = [water, waterLight, foam, water, waterLight];

  return (
    <div className="relative">
      <pre className="text-[9px] leading-[1.25] whitespace-pre" style={{ opacity: 0.3 }}>
        {backGrid.map((row, y) => (
          <span key={`b${y}`}>
            <C c={backColors[y % backColors.length]}>{row.join('')}</C>{'\n'}
          </span>
        ))}
      </pre>
      <pre className="text-[9px] leading-[1.25] whitespace-pre">
        {frontGrid.map((row, y) => (
          <span key={`f${y}`}>
            <C c={frontColors[y % frontColors.length]}>{row.join('')}</C>{'\n'}
          </span>
        ))}
      </pre>
    </div>
  );
}

// ── Sky gradient ────────────────────────────────────────────────────────

function getSkyColors(dayProgress: number): { top: string; bottom: string; isNight: boolean } {
  const phase = (dayProgress * 3) % 1;
  if (phase < 0.15) return { top: '#1a1020', bottom: '#2a1525', isNight: true };
  if (phase < 0.25) return { top: '#2a1828', bottom: '#6a3030', isNight: false };
  if (phase < 0.45) return { top: '#1a2a3a', bottom: '#2a4050', isNight: false };
  if (phase < 0.55) return { top: '#0e1e2e', bottom: '#1a3040', isNight: false };
  if (phase < 0.7)  return { top: '#2a2018', bottom: '#5a3020', isNight: false };
  if (phase < 0.8)  return { top: '#1a1520', bottom: '#2a1828', isNight: true };
  return { top: '#0a0a14', bottom: '#10101a', isNight: true };
}

// ── Starfield ───────────────────────────────────────────────────────────

interface Star { x: number; y: number; char: string; phase: number; size: number; }

function generateStars(seed: number, count: number): Star[] {
  let s = seed;
  const rand = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  const chars = ['\u00b7', '\u00b7', '\u2726', '\u00b7', '\u2217', '\u22c5', '\u2726', '\u00b7'];
  const stars: Star[] = [];
  for (let i = 0; i < count; i++) {
    stars.push({
      x: rand() * 90 + 5,
      y: rand() * 60 + 5,
      char: chars[Math.floor(rand() * chars.length)],
      phase: Math.floor(rand() * 6),
      size: rand() > 0.85 ? 1.3 : rand() > 0.5 ? 1.0 : 0.7,
    });
  }
  return stars;
}

function Starfield({ visible, frame, seed }: { visible: boolean; frame: number; seed: number }) {
  const stars = useMemo(() => generateStars(seed, 24), [seed]);
  return (
    <div
      className="absolute inset-0 pointer-events-none overflow-hidden transition-opacity duration-[2000ms]"
      style={{ opacity: visible ? 1 : 0 }}
    >
      {stars.map((star, i) => {
        const twinkle = Math.sin((frame * 0.3 + star.phase * 1.7) * 0.8) * 0.5 + 0.5;
        const opacity = 0.15 + twinkle * 0.7;
        const color = star.char === '\u2726' ? '#c9a84c' : star.char === '\u2217' ? '#8aaccf' : '#7a7a8a';
        return (
          <span
            key={i}
            className="absolute"
            style={{
              left: `${star.x}%`,
              top: `${star.y}%`,
              color,
              opacity,
              fontSize: `${star.size * 9}px`,
              fontFamily: MONO,
              transition: 'opacity 0.5s ease',
            }}
          >
            {star.char}
          </span>
        );
      })}
    </div>
  );
}

// ── Shooting star ───────────────────────────────────────────────────────
// Rare streak during night phases. Appears as ─✦ sliding diagonally.

function ShootingStar({ onDone }: { onDone: () => void }) {
  // Random start position in the upper portion
  const startX = useMemo(() => 15 + Math.random() * 50, []);
  const startY = useMemo(() => 5 + Math.random() * 25, []);

  return (
    <motion.span
      className="absolute pointer-events-none"
      style={{
        left: `${startX}%`,
        top: `${startY}%`,
        color: '#c9a84c',
        fontSize: '10px',
        fontFamily: MONO,
        zIndex: 5,
        textShadow: '0 0 4px #c9a84c60',
      }}
      initial={{ opacity: 0, x: 0, y: 0 }}
      animate={{ opacity: [0, 0.9, 0.9, 0], x: 80, y: 40 }}
      transition={{ duration: 0.6, ease: 'easeIn' }}
      onAnimationComplete={onDone}
    >
      {'\u2500\u2726'}
    </motion.span>
  );
}

// ── Seabirds (approaching land) ─────────────────────────────────────────
// Small v-shaped birds that drift across when close to destination.

function Seabirds({ visible }: { visible: boolean }) {
  if (!visible) return null;

  const birds = useMemo(() => [
    { delay: 0, y: 8, duration: 6 },
    { delay: 1.5, y: 18, duration: 7 },
    { delay: 3, y: 12, duration: 5.5 },
  ], []);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 3 }}>
      {birds.map((bird, i) => (
        <motion.span
          key={i}
          className="absolute text-[8px]"
          style={{
            top: `${bird.y}%`,
            color: '#5a5445',
            fontFamily: MONO,
          }}
          initial={{ left: '105%', opacity: 0 }}
          animate={{ left: '-5%', opacity: [0, 0.6, 0.6, 0.6, 0] }}
          transition={{
            duration: bird.duration,
            delay: bird.delay,
            ease: 'linear',
            repeat: Infinity,
            repeatDelay: 2,
          }}
        >
          v
        </motion.span>
      ))}
    </div>
  );
}

// ── Elaborate ASCII progress bar ────────────────────────────────────────
// Animated wake behind the ship marker, ornate endpoints, port labels.
// The wake uses ═ and ≈ characters that shift to create water movement.
// The horizon ahead uses spaced dots suggesting distance.

function VoyageProgress({
  progress,
  fromPort,
  toPort,
  frame,
  arrived,
}: {
  progress: number;
  fromPort: string;
  toPort: string;
  frame: number;
  arrived: boolean;
}) {
  const { gold, dimGold, bright, dim, rule } = ASCII_COLORS;
  const barWidth = 44;
  const filledCount = Math.min(barWidth, Math.round(progress * barWidth));
  const emptyCount = barWidth - filledCount;

  // Wake: ═ with ≈ ripples that shift backward, creating water motion
  const wake = useMemo(() => {
    if (filledCount <= 0) return '';
    return Array.from({ length: filledCount }, (_, i) => {
      const ripplePos = (i + frame) % 6;
      if (ripplePos === 0) return '\u2248'; // ≈
      if (ripplePos === 3) return '\u223c'; // ∼
      return '\u2550'; // ═
    }).join('');
  }, [filledCount, frame]);

  // Horizon ahead: gentle dots suggesting distance
  const horizon = useMemo(() => {
    if (emptyCount <= 0) return '';
    return Array.from({ length: emptyCount }, (_, i) => {
      if (i % 4 === 0) return '\u00b7'; // ·
      return '\u2500'; // ─
    }).join('');
  }, [emptyCount]);

  return (
    <div className="mt-5 mb-1 px-4">
      {/* Port labels */}
      <div className="flex justify-between text-[10px] mb-1.5 px-1" style={{ fontFamily: SERIF }}>
        <span style={{ color: dimGold, fontStyle: 'italic' }}>{fromPort}</span>
        <span style={{ color: arrived ? gold : dimGold, fontStyle: 'italic' }}>{toPort}</span>
      </div>

      {/* The bar */}
      <div className="text-center overflow-hidden">
        <pre className="text-[11px] whitespace-pre inline-block" style={{ fontFamily: MONO }}>
          {/* Left ornament + anchor */}
          <C c={dimGold}>{'\u2561'}</C>
          <C c={dimGold}>{'\u2693'}</C>
          {/* Wake (traveled) */}
          <C c={gold}>{wake}</C>
          {/* Ship marker */}
          {!arrived ? (
            <motion.span
              animate={{
                textShadow: [
                  '0 0 3px #c9a84c40',
                  '0 0 8px #c9a84c80',
                  '0 0 3px #c9a84c40',
                ],
              }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
              style={{ color: bright }}
            >
              {'\u25c6'}
            </motion.span>
          ) : (
            <C c={gold}>{'\u2736'}</C>
          )}
          {/* Horizon (remaining) */}
          <C c={rule}>{horizon}</C>
          {/* Right anchor + ornament */}
          <C c={arrived ? gold : dimGold}>{'\u2693'}</C>
          <C c={dimGold}>{'\u255e'}</C>
        </pre>
      </div>

      {/* Decorative sub-rule */}
      <div className="text-center mt-1">
        <pre className="text-[9px] whitespace-pre inline-block" style={{ color: rule }}>
          <C c={rule}>{'\u2576'}</C>
          <C c={rule}>{'\u2500'.repeat(Math.min(20, Math.floor(barWidth / 2) - 2))}</C>
          <C c={dimGold}>{' \u00b7 '}</C>
          <C c={rule}>{'\u2500'.repeat(Math.min(20, Math.floor(barWidth / 2) - 2))}</C>
          <C c={rule}>{'\u2574'}</C>
        </pre>
      </div>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────

type VoyagePhase = 'sailing' | 'event' | 'arriving' | 'arrived';

interface TravelModalBProps {
  fromPort: string;
  toPort: string;
  totalDays: number;
  shipType: 'Carrack' | 'Galleon' | 'Dhow' | 'Junk' | 'Pinnace';
  shipName: string;
  fromPortId?: string;
  toPortId?: string;
  onComplete: () => void;
  onSkip: () => void;
}

export default function TravelModalB({
  fromPort,
  toPort,
  totalDays,
  shipType,
  shipName,
  fromPortId,
  toPortId,
  onComplete,
  onSkip,
}: TravelModalBProps) {
  const [currentDay, setCurrentDay] = useState(0);
  const [waveFrame, setWaveFrame] = useState(0);
  const [shipBob, setShipBob] = useState(0);
  const [phase, setPhase] = useState<VoyagePhase>('sailing');
  const [activeEvent, setActiveEvent] = useState<VoyageEvent | null>(null);
  const [activeEventDay, setActiveEventDay] = useState(0);
  const [shootingStarKey, setShootingStarKey] = useState<number | null>(null);
  const sparkle = useSparkle(350);

  const shipArt = SHIP_ART[shipType] || SHIP_ART.Carrack;
  const { gold, dimGold, warm, bright, txt, dim, rule, mast, hull, sail, water } = ASCII_COLORS;

  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  // Use refs to prevent duplication from React strict mode
  const currentDayRef = useRef(0);
  const shownEventDaysRef = useRef(new Set<number>());

  const fromRegion = fromPortId ? (PORT_REGIONS[fromPortId] ?? 'indianOcean') : 'indianOcean';
  const toRegion = toPortId ? (PORT_REGIONS[toPortId] ?? 'indianOcean') : 'indianOcean';

  const voyageEvents = useMemo(() => {
    const seed = (fromPort.length * 31 + toPort.length * 17 + totalDays * 7) | 0;
    return pickVoyageEvents(totalDays, fromRegion, toRegion, seed);
  }, [totalDays, fromPort, toPort, fromRegion, toRegion]);

  // Main voyage tick — uses refs to avoid strict-mode duplication
  useEffect(() => {
    if (phase === 'arrived' || phase === 'event' || phase === 'arriving') return;

    const eventDayMap = new Map(voyageEvents.map(e => [e.day, e]));
    const tickSpeed = totalDays <= 5 ? 500 : totalDays <= 12 ? 350 : 250;

    const id = setInterval(() => {
      const next = currentDayRef.current + 1;
      currentDayRef.current = next;
      setCurrentDay(next);

      if (next >= totalDays) {
        setPhase('arriving');
        setTimeout(() => {
          setPhase('arrived');
          setTimeout(() => onCompleteRef.current(), 1800);
        }, 1500);
        return;
      }

      const evt = eventDayMap.get(next);
      if (evt && !shownEventDaysRef.current.has(next)) {
        shownEventDaysRef.current.add(next);
        setPhase('event');
        setActiveEvent(evt.event);
        setActiveEventDay(next);
        setTimeout(() => {
          setActiveEvent(null);
          setPhase('sailing');
        }, 3000);
      }
    }, tickSpeed);

    return () => clearInterval(id);
  }, [totalDays, phase, voyageEvents]);

  // Wave + bob animation + shooting star trigger
  const isNightRef = useRef(false);
  useEffect(() => {
    const id = setInterval(() => {
      setWaveFrame(f => f + 1);
      setShipBob(b => b + 1);
      // ~0.8% chance per tick (250ms) during night = roughly one per 30s of night
      if (isNightRef.current && Math.random() < 0.008) {
        setShootingStarKey(Date.now());
      }
    }, 250);
    return () => clearInterval(id);
  }, []);

  const bobY = Math.sin(shipBob * 0.5) * 3;
  const billowX = Math.sin(shipBob * 0.23) * 1.2; // slow horizontal sway
  const dayProgress = totalDays > 0 ? currentDay / totalDays : 0;
  const skyColors = getSkyColors(dayProgress);
  isNightRef.current = skyColors.isNight;
  const starSeed = useMemo(() => (fromPort.length * 31 + toPort.length * 17) | 0, [fromPort, toPort]);
  const showSeabirds = dayProgress > 0.85 && phase !== 'arrived';

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[9999] flex items-center justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.6 }}
      >
        {/* Backdrop with sky gradient */}
        <motion.div
          className="absolute inset-0 backdrop-blur-md"
          animate={{
            background: `linear-gradient(to bottom, ${skyColors.top} 0%, ${skyColors.bottom} 40%, #010204 100%)`,
          }}
          transition={{ duration: 2, ease: 'easeInOut' }}
          style={{ opacity: 0.95 }}
        />

        {/* Modal */}
        <motion.div
          className="relative w-full max-w-[780px] bg-[#080706]/90 border border-[#1a1815]/80 overflow-hidden"
          style={{ fontFamily: MONO }}
          initial={{ scale: 0.92, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          {/* Baroque border */}
          <BaroqueBorder />

          {/* Subtle vignette */}
          <div
            className="absolute inset-0 pointer-events-none z-10"
            style={{
              background: 'radial-gradient(ellipse at center, transparent 40%, #020203cc 100%)',
            }}
          />

          <div className="relative z-30 px-10 py-7">
            {/* Route header — clean serif typography */}
            <div className="text-center">
              <div className="text-[11px] tracking-[0.3em] uppercase" style={{ color: dim }}>
                V O Y A G E
              </div>
              <div className="mt-2 text-[15px]" style={{ fontFamily: SERIF }}>
                <C c={txt}>{fromPort}</C>
                <C c={rule}>{'  \u2500\u2500\u2500  '}</C>
                <C c={gold}>{'\u25b8\u25b8\u25b8'}</C>
                <C c={rule}>{'  \u2500\u2500\u2500  '}</C>
                <C c={bright}>{toPort}</C>
              </div>
              <div
                className="mt-1.5 text-[12px]"
                style={{ color: warm, fontFamily: SERIF, fontStyle: 'italic' }}
              >
                {shipName} \u2014 {shipType}
              </div>
            </div>

            {/* Ship + waves scene */}
            <div className="relative mt-4 overflow-hidden" style={{ height: '135px' }}>
              <Starfield visible={skyColors.isNight} frame={waveFrame} seed={starSeed} />

              {/* Shooting star — rare, night only */}
              {shootingStarKey !== null && (
                <ShootingStar
                  key={shootingStarKey}
                  onDone={() => setShootingStarKey(null)}
                />
              )}

              {/* Seabirds — appear when nearing destination */}
              <Seabirds visible={showSeabirds} />

              {/* Lantern glow at night */}
              <div
                className="absolute pointer-events-none transition-opacity duration-[2000ms]"
                style={{
                  left: '50%',
                  top: '30%',
                  transform: 'translate(-50%, -50%)',
                  width: '140px',
                  height: '110px',
                  background: `radial-gradient(ellipse at center, #c9a84c14 0%, transparent 70%)`,
                  opacity: skyColors.isNight ? 1 : 0,
                  zIndex: 1,
                }}
              />

              {/* Ship — bobbing vertically + subtle horizontal billow */}
              <motion.pre
                className="text-[9px] leading-[1.25] whitespace-pre text-center"
                animate={{ y: bobY, x: billowX }}
                transition={{ duration: 0.3, ease: 'easeInOut' }}
                style={{ position: 'relative', zIndex: 2 }}
              >
                {shipArt.map((line, i) => {
                  const isWaterline = i === shipArt.length - 1;
                  const isMast = i === 0;
                  const isHull = i >= shipArt.length - 2;
                  return (
                    <span key={i}>
                      <C c={isWaterline ? water : isMast ? mast : isHull ? hull : sail}>{line}</C>
                      {'\n'}
                    </span>
                  );
                })}
              </motion.pre>

              <div className="absolute bottom-0 left-0 right-0" style={{ opacity: 0.65 }}>
                <WaveField width={80} height={4} frame={waveFrame} />
              </div>
            </div>

            {/* Day counter — clean, centered */}
            <div className="text-center mt-3">
              <AnimatePresence mode="wait">
                <motion.div
                  key={phase === 'arrived' ? 'arrived' : phase === 'arriving' ? 'arriving' : 'sailing'}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.4 }}
                >
                  {phase === 'arrived' ? (
                    <div className="text-[18px]" style={{ color: gold, fontFamily: SERIF }}>
                      {sparkle(0)} Arrived at {toPort} {sparkle(2)}
                    </div>
                  ) : phase === 'arriving' ? (
                    <div className="text-[14px]" style={{ color: warm, fontFamily: SERIF, fontStyle: 'italic' }}>
                      Land on the horizon...
                    </div>
                  ) : (
                    <div className="text-[12px]" style={{ fontFamily: SERIF }}>
                      <C c={dim}>{'\u2500\u2500  '}</C>
                      <C c={txt}>Day </C>
                      <C c={bright}>{currentDay + 1}</C>
                      <C c={txt}> of {totalDays}</C>
                      <C c={dim}>{'  \u2500\u2500'}</C>
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Single event — large, serif, crossfades */}
            <div className="mt-3 px-8" style={{ minHeight: '52px' }}>
              <AnimatePresence mode="wait">
                {activeEvent ? (
                  <motion.div
                    key={`event-${activeEventDay}`}
                    className="text-center"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.6, ease: 'easeOut' }}
                  >
                    {/* Flourish */}
                    <motion.div
                      className="text-[10px] mb-2"
                      initial={{ opacity: 0, scaleX: 0 }}
                      animate={{ opacity: 0.5, scaleX: 1 }}
                      transition={{ duration: 0.8, ease: 'easeOut' }}
                    >
                      <C c={dimGold}>{'\u2500\u2500\u2500 \u25c7 \u2500\u2500\u2500'}</C>
                    </motion.div>
                    <div
                      className="text-[14px] leading-[1.6]"
                      style={{
                        color: txt,
                        fontFamily: SERIF,
                        fontStyle: 'italic',
                      }}
                    >
                      {activeEvent.text}
                    </div>
                  </motion.div>
                ) : phase === 'arriving' || phase === 'arrived' ? null : (
                  <motion.div
                    key="sailing-quiet"
                    className="text-center"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.5 }}
                  >
                    <div
                      className="text-[12px]"
                      style={{ color: dim, fontFamily: SERIF, fontStyle: 'italic' }}
                    >
                      {currentDay === 0
                        ? `Setting sail from ${fromPort}...`
                        : 'Calm seas. The voyage continues.'}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Elaborate progress bar */}
            <VoyageProgress
              progress={dayProgress}
              fromPort={fromPort}
              toPort={toPort}
              frame={waveFrame}
              arrived={phase === 'arrived'}
            />

            {/* Skip button */}
            <div className="text-center mt-4 mb-1">
              <button
                onClick={onSkip}
                className="text-[11px] px-6 py-2 border transition-all duration-200 cursor-pointer"
                style={{
                  color: dim,
                  borderColor: rule,
                  fontFamily: MONO,
                  background: 'transparent',
                  letterSpacing: '0.05em',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.color = gold;
                  e.currentTarget.style.borderColor = dimGold;
                  e.currentTarget.style.boxShadow = `0 0 16px ${gold}15`;
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.color = dim;
                  e.currentTarget.style.borderColor = rule;
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                [ Skip Voyage \u25b8 ]
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
