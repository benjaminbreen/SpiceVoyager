// ═══════════════════════════════════════════════════════════════════════════
// ARRIVAL CURTAIN — fullscreen wash that masks the world-map → port swap
// after a voyage. Fades in opaque, parent runs the swap, then fades out
// to reveal the new port.
//
// DEPARTURE CURTAIN — same visual language, shown when the player clicks
// Set Sail on the splash screen. Masks the Three.js canvas mount + terrain
// generation, dismissed when portCount > 0 (world ready).
// ═══════════════════════════════════════════════════════════════════════════

import { motion, AnimatePresence } from 'framer-motion';
import { ASCII_COLORS } from './ascii-ui-kit';
import { useGameStore } from '../store/gameStore';
import { formatGameDateLong } from '../utils/gameDate';

const SERIF = '"Fraunces", serif';

interface ArrivalCurtainProps {
  portName: string | null;
}

export function ArrivalCurtain({ portName }: ArrivalCurtainProps) {
  const { gold, dim } = ASCII_COLORS;
  const dayCount = useGameStore(s => s.dayCount);
  const dateStr = formatGameDateLong(dayCount);

  return (
    <AnimatePresence>
      {portName !== null && (
        <motion.div
          key="arrival-curtain"
          className="fixed inset-0 z-[10000] flex items-center justify-center pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.55, ease: 'easeInOut' }}
          style={{ background: '#080706' }}
        >
          <motion.div
            className="text-center"
            style={{ fontFamily: SERIF }}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.45, delay: 0.1, ease: 'easeOut' }}
          >
            <div
              className="text-[11px] tracking-[0.4em] uppercase mb-3"
              style={{ color: dim }}
            >
              {'──  Landfall  ──'}
            </div>
            <div
              className="text-[34px]"
              style={{
                color: gold,
                textShadow: '0 0 18px #c9a84c55',
                letterSpacing: '0.05em',
              }}
            >
              {portName}
            </div>
            <div
              className="mt-2 text-[11px] italic tracking-[0.08em]"
              style={{ color: '#6a6555', opacity: 0.7 }}
            >
              {dateStr}
            </div>
            <div
              className="mt-3 text-[12px]"
              style={{ color: dim, opacity: 0.6 }}
            >
              {'◇'}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── Departure Curtain ────────────────────────────────────────────────────────
// Shown when the player clicks Set Sail. Masks canvas mount + terrain gen.
// Dismissed by the parent when portCount > 0 (world is ready).

export function DepartureCurtain({ active }: { active: boolean }) {
  const { gold, dim } = ASCII_COLORS;
  const shipName = useGameStore(s => s.ship.name);
  const dayCount = useGameStore(s => s.dayCount);
  const dateStr = formatGameDateLong(dayCount);

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          key="departure-curtain"
          className="fixed inset-0 z-[10000] flex items-center justify-center pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5, ease: 'easeInOut' }}
          style={{ background: '#080706' }}
        >
          <motion.div
            className="text-center"
            style={{ fontFamily: SERIF }}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.4, delay: 0.08, ease: 'easeOut' }}
          >
            <div
              className="text-[11px] tracking-[0.4em] uppercase mb-3"
              style={{ color: dim }}
            >
              {'──  Departure  ──'}
            </div>
            <div
              className="text-[34px]"
              style={{
                color: gold,
                textShadow: '0 0 18px #c9a84c55',
                letterSpacing: '0.05em',
              }}
            >
              {shipName}
            </div>
            <div
              className="mt-2 text-[11px] italic tracking-[0.08em]"
              style={{ color: '#6a6555', opacity: 0.7 }}
            >
              {dateStr}
            </div>
            <motion.div
              className="mt-4 text-[11px] tracking-[0.35em] uppercase"
              style={{ color: dim }}
              animate={{ opacity: [0.25, 0.7, 0.25] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
            >
              Weighing Anchor
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
