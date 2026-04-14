// ═══════════════════════════════════════════════════════════════════════════
// MOCKUP B — "Captain's Log" style
// Full-screen cinematic with ship centered, wave field animation below,
// a scrolling captain's log with flavor text for each day, compass rose,
// and atmospheric particle effects.
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ASCII_COLORS, C, Rule, useSparkle } from './ascii-ui-kit';

const MONO = '"SF Mono", "Fira Code", "Cascadia Code", "Consolas", monospace';
const SERIF = '"Fraunces", serif';

// ── Ship ASCII art by type (larger, centered) ───────────────────────────

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

// ── Flavor text for log entries ─────────────────────────────────────────

const LOG_ENTRIES: string[] = [
  'Fair winds fill our sails as we depart.',
  'The crew is in good spirits. Sea is calm.',
  'Spotted dolphins riding our bow wave.',
  'Overcast skies. Navigator takes bearing by compass.',
  'Strong following wind, making good time.',
  'Cook serves salt pork and ship biscuit.',
  'Moonrise over calm waters. Stars are bright.',
  'Squall passed quickly, no damage sustained.',
  'Sighted distant sails on the horizon.',
  'Crew mends canvas and splices rope.',
  'Flying fish land on deck — the men cheer.',
  'Heat oppressive. Extra water rations issued.',
  'Beautiful sunset paints the sky crimson.',
  'Wind shifts to the northeast quarter.',
  'Albatross follows in our wake.',
  'Morning fog lifts to reveal clear seas.',
  'The bosun leads a shanty at sunset.',
  'Current carries us swiftly onward.',
  'Passed a cluster of rocky islets.',
  'Stars guide us through the dark hours.',
];

// ── Animated wave field ─────────────────────────────────────────────────

const WAVE_CHARS = [' ', '·', '~', '∼', '≈', '≈'];

function WaveField({ width, height, frame }: { width: number; height: number; frame: number }) {
  const grid = useMemo(() => {
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

  const { water, waterLight, foam } = ASCII_COLORS;
  const colors = [water, waterLight, foam, water, waterLight];

  return (
    <pre className="text-[9px] leading-[1.25] whitespace-pre">
      {grid.map((row, y) => (
        <span key={y}>
          <C c={colors[y % colors.length]}>{row.join('')}</C>{'\n'}
        </span>
      ))}
    </pre>
  );
}

// ── Compass rose (small, ASCII) ─────────────────────────────────────────

function CompassRose({ bearing }: { bearing: string }) {
  return (
    <pre className="text-[9px] leading-[1.3] whitespace-pre">
      <C c={ASCII_COLORS.dimGold}>{'      N'}</C>{'\n'}
      <C c={ASCII_COLORS.dim}>{'      |'}</C>{'\n'}
      <C c={ASCII_COLORS.dimGold}>{'  W'}</C><C c={ASCII_COLORS.dim}>{'───'}</C><C c={ASCII_COLORS.gold}>{'◆'}</C><C c={ASCII_COLORS.dim}>{'───'}</C><C c={ASCII_COLORS.dimGold}>{'E'}</C>{'\n'}
      <C c={ASCII_COLORS.dim}>{'      |'}</C>{'\n'}
      <C c={ASCII_COLORS.dimGold}>{'      S'}</C>{'\n'}
      <C c={ASCII_COLORS.txt}>{`    ${bearing}`}</C>
    </pre>
  );
}

interface TravelModalBProps {
  fromPort: string;
  toPort: string;
  totalDays: number;
  shipType: 'Carrack' | 'Galleon' | 'Dhow' | 'Junk' | 'Pinnace';
  shipName: string;
  onComplete: () => void;
  onSkip: () => void;
}

export default function TravelModalB({
  fromPort,
  toPort,
  totalDays,
  shipType,
  shipName,
  onComplete,
  onSkip,
}: TravelModalBProps) {
  const [currentDay, setCurrentDay] = useState(0);
  const [waveFrame, setWaveFrame] = useState(0);
  const [arrived, setArrived] = useState(false);
  const [shipBob, setShipBob] = useState(0);
  const sparkle = useSparkle(350);
  const logRef = useRef<HTMLDivElement>(null);

  const shipArt = SHIP_ART[shipType] || SHIP_ART.Carrack;
  const { gold, dimGold, warm, bright, txt, dim, rule, ruleLight, mast, hull, sail, water } = ASCII_COLORS;

  // Stable ref for onComplete to avoid effect restarting
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  // Day ticker
  useEffect(() => {
    if (arrived) return;
    const id = setInterval(() => {
      setCurrentDay(d => {
        const next = d + 1;
        if (next >= totalDays) {
          setArrived(true);
          setTimeout(() => onCompleteRef.current(), 1500);
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [totalDays, arrived]);

  // Wave + bob animation
  useEffect(() => {
    const id = setInterval(() => {
      setWaveFrame(f => f + 1);
      setShipBob(b => b + 1);
    }, 250);
    return () => clearInterval(id);
  }, []);

  // Auto-scroll log
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [currentDay]);

  const logEntries = useMemo(() => {
    const entries: { day: number; text: string }[] = [];
    for (let d = 0; d <= currentDay && d < totalDays; d++) {
      entries.push({ day: d + 1, text: LOG_ENTRIES[d % LOG_ENTRIES.length] });
    }
    return entries;
  }, [currentDay, totalDays]);

  const bearing = useMemo(() => {
    const bearings = ['NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W'];
    return bearings[currentDay % bearings.length];
  }, [currentDay]);

  const bobY = Math.sin(shipBob * 0.5) * 3;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[9999] flex items-center justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.6 }}
      >
        {/* Backdrop */}
        <div className="absolute inset-0 bg-[#010204]/95 backdrop-blur-md" />

        {/* Modal */}
        <motion.div
          className="relative w-full max-w-[620px] bg-[#080706] border border-[#1a1815]/80 overflow-hidden"
          style={{ fontFamily: MONO }}
          initial={{ scale: 0.92, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          {/* Subtle vignette */}
          <div
            className="absolute inset-0 pointer-events-none z-10"
            style={{
              background: 'radial-gradient(ellipse at center, transparent 50%, #020203 100%)',
            }}
          />

          <div className="relative z-20 px-6 py-5">
            {/* Header — route */}
            <div className="text-center">
              <pre className="text-[10px] leading-[1.5] whitespace-pre">
                <C c={dimGold}>{'╭────────────────────────────────────────────────╮'}</C>{'\n'}
                <C c={dimGold}>{'│'}</C>
                <C c={dim}>{`  ${fromPort}`}</C>
                <C c={rule}>{`  ${'· '.repeat(Math.max(2, 14 - fromPort.length - toPort.length))}  `}</C>
                <C c={gold}>{'▸▸▸'}</C>
                <C c={rule}>{`  ${'· '.repeat(Math.max(2, 3))}  `}</C>
                <C c={bright}>{`${toPort}  `}</C>
                <C c={dimGold}>{'│'}</C>{'\n'}
                <C c={dimGold}>{'╰────────────────────────────────────────────────╯'}</C>
              </pre>
            </div>

            {/* Ship name */}
            <div className="text-center mt-1 text-[11px]" style={{ color: warm, fontFamily: SERIF, fontStyle: 'italic' }}>
              {shipName} — {shipType}
            </div>

            {/* Ship + waves scene */}
            <div className="relative mt-3 overflow-hidden" style={{ height: '130px' }}>
              {/* Ship — centered, bobbing */}
              <motion.pre
                className="text-[9px] leading-[1.25] whitespace-pre text-center"
                animate={{ y: bobY }}
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

              {/* Wave field */}
              <div className="absolute bottom-0 left-0 right-0" style={{ opacity: 0.7 }}>
                <WaveField width={64} height={4} frame={waveFrame} />
              </div>
            </div>

            {/* Day counter + compass row */}
            <div className="flex items-center justify-between mt-2 px-4">
              {/* Compass */}
              <CompassRose bearing={bearing} />

              {/* Day display */}
              <div className="text-center flex-1">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={arrived ? 'arrived' : currentDay}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 1.1 }}
                    transition={{ duration: 0.3 }}
                  >
                    {arrived ? (
                      <div>
                        <div className="text-[10px]" style={{ color: dim }}>
                          {sparkle(0)} Land sighted {sparkle(2)}
                        </div>
                        <div className="text-[16px] mt-1" style={{ color: gold, fontFamily: SERIF }}>
                          {toPort}
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div className="text-[9px]" style={{ color: dim }}>DAY</div>
                        <div className="text-[28px] leading-none" style={{ color: bright, fontFamily: SERIF }}>
                          {currentDay + 1}
                        </div>
                        <div className="text-[9px] mt-1" style={{ color: dim }}>of {totalDays}</div>
                      </div>
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* Progress column */}
              <div className="text-[9px] text-right" style={{ minWidth: '80px' }}>
                <div style={{ color: dim }}>Progress</div>
                <div className="mt-1">
                  <C c={gold}>{'▓'.repeat(Math.round((currentDay / totalDays) * 16))}</C>
                  <C c={rule}>{'░'.repeat(16 - Math.round((currentDay / totalDays) * 16))}</C>
                </div>
                <div className="mt-1" style={{ color: txt }}>
                  {Math.round((currentDay / totalDays) * 100)}%
                </div>
              </div>
            </div>

            {/* Divider */}
            <pre className="text-center text-[10px] mt-2" style={{ color: rule }}>
              <Rule width={48} style="ornate" sparkle={sparkle} />
            </pre>

            {/* Captain's log */}
            <div className="mt-2">
              <div className="text-[9px] mb-1" style={{ color: dimGold, fontFamily: SERIF }}>
                ── Captain's Log ──
              </div>
              <div
                ref={logRef}
                className="overflow-y-auto text-[10px] leading-[1.6]"
                style={{
                  maxHeight: '72px',
                  color: txt,
                  fontFamily: SERIF,
                  fontStyle: 'italic',
                  scrollbarWidth: 'none',
                }}
              >
                {logEntries.map((entry, i) => (
                  <motion.div
                    key={entry.day}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <C c={dimGold}>{`Day ${entry.day}: `}</C>
                    <C c={dim}>{entry.text}</C>
                  </motion.div>
                ))}
              </div>
            </div>

            {/* Skip button */}
            <div className="text-center mt-3 mb-1">
              <button
                onClick={onSkip}
                className="text-[10px] px-5 py-1.5 border transition-all duration-200 cursor-pointer"
                style={{
                  color: dim,
                  borderColor: rule,
                  fontFamily: MONO,
                  background: 'transparent',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.color = gold;
                  e.currentTarget.style.borderColor = dimGold;
                  e.currentTarget.style.boxShadow = `0 0 12px ${gold}20`;
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.color = dim;
                  e.currentTarget.style.borderColor = rule;
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                [ Skip Voyage ▸ ]
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
