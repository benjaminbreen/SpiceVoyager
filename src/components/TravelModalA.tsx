// ═══════════════════════════════════════════════════════════════════════════
// MOCKUP A — "Scroll Map" style
// Ship sails right-to-left across a scrolling ocean with port names at edges
// Day counter ticks below. Ornate baroque border framing.
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ASCII_COLORS, C, Cartouche, Rule, BaroqueBorder, useSparkle } from './ascii-ui-kit';

const MONO = '"SF Mono", "Fira Code", "Cascadia Code", "Consolas", monospace';
const SERIF = '"Fraunces", serif';

// ── Ship ASCII art by type ──────────────────────────────────────────────

const SHIP_ART: Record<string, string[]> = {
  Carrack: [
    '       |    |    |   ',
    '      )_)  )_)  )_)  ',
    '     )___))___))___)\\ ',
    '    )____)____)_____)\\\\',
    '  _____|____|____|____\\\\\\',
    '  \\                   / ',
  ],
  Galleon: [
    '      |    |    |    |  ',
    '     )_)  )_)  )_)  )_) ',
    '    )___))___))___))___)\\ ',
    '   )____)____)____)_____)\\\\',
    ' ______|____|____|____|____\\\\\\',
    ' \\                         / ',
  ],
  Dhow: [
    '        |       ',
    '       /|       ',
    '      / |       ',
    '     /  |       ',
    '    /   |       ',
    '  _/____|____   ',
    '  \\         /   ',
  ],
  Junk: [
    '      |  |  |    ',
    '     _|__|__|_   ',
    '    |__|__|__|\\  ',
    '    |__|__|__|\\\\ ',
    '  __|__|__|__|__\\\\',
    '  \\              / ',
  ],
  Pinnace: [
    '      |       ',
    '     )_)      ',
    '    )___)\\    ',
    '   )____)\\\\   ',
    ' ___|____|_\\\\\\',
    ' \\          / ',
  ],
};

// ── Wave animation frames ───────────────────────────────────────────────

const WAVE_LINES = [
  '~~~~~~~∼∼∼≈≈≈∼∼∼~~~~~~~~∼∼∼≈≈≈∼∼∼~~~~~~~~∼∼∼≈≈≈∼∼∼~~~~',
  '∼∼∼≈≈~~~~∼∼∼∼∼∼≈≈≈~~~~∼∼∼∼∼∼≈≈≈~~~~∼∼∼∼∼∼≈≈≈~~~~∼∼∼∼∼',
  '≈≈∼∼∼∼~~~~≈≈∼∼∼∼∼∼~~~~≈≈∼∼∼∼∼∼~~~~≈≈∼∼∼∼∼∼~~~~≈≈∼∼∼∼∼',
];

interface TravelModalAProps {
  fromPort: string;
  toPort: string;
  totalDays: number;
  shipType: 'Carrack' | 'Galleon' | 'Dhow' | 'Junk' | 'Pinnace';
  onComplete: () => void;
  onSkip: () => void;
}

export default function TravelModalA({
  fromPort,
  toPort,
  totalDays,
  shipType,
  onComplete,
  onSkip,
}: TravelModalAProps) {
  const [currentDay, setCurrentDay] = useState(0);
  const [waveFrame, setWaveFrame] = useState(0);
  const [arrived, setArrived] = useState(false);
  const sparkle = useSparkle(400);

  const shipArt = SHIP_ART[shipType] || SHIP_ART.Carrack;

  // Day ticker — 1 day per second
  useEffect(() => {
    if (arrived) return;
    const id = setInterval(() => {
      setCurrentDay(d => {
        const next = d + 1;
        if (next >= totalDays) {
          setArrived(true);
          setTimeout(onComplete, 1200);
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [totalDays, onComplete, arrived]);

  // Wave animation — shifts every 300ms
  useEffect(() => {
    const id = setInterval(() => setWaveFrame(f => f + 1), 300);
    return () => clearInterval(id);
  }, []);

  // Ship position: slides from left → right as days progress
  const shipProgress = totalDays > 0 ? Math.min(currentDay / totalDays, 1) : 0;

  // Shifted waves
  const shiftedWave = useCallback((line: string, offset: number) => {
    const shift = (waveFrame * 2 + offset) % line.length;
    return line.slice(shift) + line.slice(0, shift);
  }, [waveFrame]);

  const { gold, dimGold, warm, bright, txt, dim, rule, water, waterLight, foam, mast, hull, sail } = ASCII_COLORS;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[9999] flex items-center justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.5 }}
      >
        {/* Backdrop */}
        <div className="absolute inset-0 bg-[#020203]/90 backdrop-blur-sm" />

        {/* Modal */}
        <motion.div
          className="relative w-full max-w-[560px] bg-[#0a0908] border border-[#2a2520]/60 overflow-hidden"
          style={{ fontFamily: MONO }}
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        >
          <BaroqueBorder />

          <div className="relative z-30 px-8 py-6">
            {/* Title */}
            <Cartouche
              title="VOYAGE"
              subtitle={`${fromPort}  ───▸  ${toPort}`}
            />

            {/* Voyage info */}
            <div className="text-center mt-3 text-[11px]" style={{ color: txt, fontFamily: SERIF, fontStyle: 'italic' }}>
              {totalDays} days at sea  {sparkle(0)}  by {shipType}
            </div>

            <pre className="text-center text-[10px] mt-2" style={{ color: rule }}>
              {'    '}<Rule width={40} style="light" />
            </pre>

            {/* Ocean scene */}
            <div className="relative mt-4 overflow-hidden" style={{ height: '140px' }}>
              {/* Port labels */}
              <div className="absolute top-0 left-4 text-[9px]" style={{ color: dimGold }}>
                ⚓ {fromPort}
              </div>
              <div className="absolute top-0 right-4 text-[9px]" style={{ color: arrived ? gold : dimGold }}>
                {toPort} ⚓
              </div>

              {/* Dotted route line */}
              <pre className="absolute top-[18px] left-0 right-0 text-[9px] text-center" style={{ color: rule }}>
                {'· · · · · · · · · · · · · · · · · · · · · · · · · ·'}
              </pre>

              {/* Ship — slides across */}
              <motion.pre
                className="absolute text-[8px] leading-[1.3] whitespace-pre"
                style={{ top: '28px' }}
                animate={{ left: `${5 + shipProgress * 65}%` }}
                transition={{ duration: 0.8, ease: 'easeInOut' }}
              >
                {shipArt.map((line, i) => (
                  <span key={i}>
                    {i < (shipType === 'Dhow' ? 5 : 4) ? (
                      <C c={i === 0 ? mast : sail}>{line}</C>
                    ) : (
                      <C c={hull}>{line}</C>
                    )}
                    {'\n'}
                  </span>
                ))}
              </motion.pre>

              {/* Waves */}
              <pre className="absolute bottom-0 left-0 right-0 text-[9px] leading-[1.4] whitespace-pre overflow-hidden">
                <C c={water}>{'─'.repeat(56)}</C>{'\n'}
                <C c={waterLight}>{shiftedWave(WAVE_LINES[0], 0).slice(0, 56)}</C>{'\n'}
                <C c={water}>{shiftedWave(WAVE_LINES[1], 8).slice(0, 56)}</C>{'\n'}
                <C c={foam}>{shiftedWave(WAVE_LINES[2], 4).slice(0, 56)}</C>
              </pre>
            </div>

            <pre className="text-center text-[10px] mt-2" style={{ color: rule }}>
              {'    '}<Rule width={40} style="light" />
            </pre>

            {/* Day counter */}
            <div className="text-center mt-3">
              <AnimatePresence mode="wait">
                <motion.div
                  key={arrived ? 'arrived' : currentDay}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.25 }}
                >
                  {arrived ? (
                    <span className="text-[14px]" style={{ color: gold, fontFamily: SERIF }}>
                      Arrived at {toPort}
                    </span>
                  ) : (
                    <>
                      <span className="text-[10px]" style={{ color: dim }}>Day </span>
                      <span className="text-[18px]" style={{ color: bright, fontFamily: SERIF }}>
                        {currentDay + 1}
                      </span>
                      <span className="text-[10px]" style={{ color: dim }}> of {totalDays}</span>
                    </>
                  )}
                </motion.div>
              </AnimatePresence>

              {/* Progress bar */}
              <div className="mt-2 flex justify-center">
                <div className="text-[10px]">
                  <C c={gold}>{'█'.repeat(Math.round(shipProgress * 30))}</C>
                  <C c={rule}>{'░'.repeat(30 - Math.round(shipProgress * 30))}</C>
                </div>
              </div>
            </div>

            {/* Skip button */}
            <div className="text-center mt-4">
              <button
                onClick={onSkip}
                className="text-[10px] px-4 py-1 border transition-colors cursor-pointer"
                style={{
                  color: dim,
                  borderColor: rule,
                  fontFamily: MONO,
                  background: 'transparent',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.color = gold;
                  e.currentTarget.style.borderColor = dimGold;
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.color = dim;
                  e.currentTarget.style.borderColor = rule;
                }}
              >
                [ Skip ▸ ]
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
