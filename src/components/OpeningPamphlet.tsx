import { motion, AnimatePresence } from 'framer-motion';

interface OpeningOverlayProps {
  ready: boolean;
  loadingMessage: string;
  loadingProgress: number;
  shipName: string;
  captainName: string;
  crewCount: number;
  portCount: number;
  dayCount: number;
  gold: number;
  onStart: () => void;
}

function Rule({ double = false }: { double?: boolean }) {
  return (
    <div
      className="mx-auto w-full max-w-[280px]"
      style={{
        height: double ? '5px' : '1px',
        borderTop: '1px solid #c4b896',
        borderBottom: double ? '1px solid #c4b896' : 'none',
      }}
    />
  );
}

export function OpeningPamphlet({
  ready,
  loadingMessage,
  loadingProgress,
  onStart,
}: OpeningOverlayProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-50 flex items-center justify-center overflow-y-auto pointer-events-auto"
      style={{ backgroundColor: '#f0ead4' }}
    >
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 w-full max-w-[380px] px-8 py-14 text-center select-none"
      >
        {/* Top double rule */}
        <Rule double />

        {/* Title */}
        <h1
          className="mt-8 text-[42px] leading-[1.1] tracking-[0.12em]"
          style={{
            fontFamily: '"IM Fell English", serif',
            color: '#2c2418',
          }}
        >
          SPICE<br />VOYAGER
        </h1>

        {/* Subtitle */}
        <p
          className="mt-5 text-[15px]"
          style={{
            fontFamily: '"Fraunces", serif',
            fontStyle: 'italic',
            fontWeight: 300,
            color: '#5a4e3a',
          }}
        >
          A Game of Oceanic Trade
        </p>

        <p
          className="mt-2 text-[13px] tracking-[0.2em]"
          style={{
            fontFamily: '"IM Fell English", serif',
            fontStyle: 'italic',
            color: '#8a7e6a',
          }}
        >
          1580 &ndash; 1620
        </p>

        {/* Single rule */}
        <div className="mt-7">
          <Rule />
        </div>

        {/* Description */}
        <p
          className="mt-7 text-[13px] leading-[1.8]"
          style={{
            fontFamily: '"DM Sans", sans-serif',
            color: '#5a4e3a',
          }}
        >
          Trade goods between ports across<br />
          the Indian, Atlantic &amp; Pacific Oceans.
        </p>

        {/* Single rule */}
        <div className="mt-7">
          <Rule />
        </div>

        {/* Loading state */}
        <div className="mt-7">
          <AnimatePresence mode="wait">
            <motion.p
              key={ready ? 'ready' : loadingMessage}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="text-[11px] italic"
              style={{
                fontFamily: '"Fraunces", serif',
                color: ready ? '#2c2418' : '#8a7e6a',
              }}
            >
              {ready ? 'Ready to depart.' : loadingMessage}
            </motion.p>
          </AnimatePresence>

          {/* Thin progress line */}
          <div className="mx-auto mt-4 h-px w-full max-w-[280px] overflow-hidden" style={{ backgroundColor: '#ddd5be' }}>
            <motion.div
              className="h-full"
              style={{ backgroundColor: ready ? '#8a7e6a' : '#b8a67a' }}
              animate={{ width: `${loadingProgress}%` }}
              transition={{ duration: ready ? 0.35 : 0.75, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
        </div>

        {/* Double rule */}
        <div className="mt-7">
          <Rule double />
        </div>

        {/* Start button */}
        <div className="mt-8">
          <motion.button
            whileHover={ready ? { scale: 1.02 } : undefined}
            whileTap={ready ? { scale: 0.98 } : undefined}
            onClick={onStart}
            disabled={!ready}
            className="transition-all"
            style={{
              fontFamily: '"Fraunces", serif',
              fontSize: '14px',
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              border: `1px solid ${ready ? '#2c2418' : '#c4b896'}`,
              color: ready ? '#2c2418' : '#b8a67a',
              backgroundColor: 'transparent',
              padding: '12px 40px',
              cursor: ready ? 'pointer' : 'default',
            }}
          >
            {ready ? 'Set Sail' : 'Preparing...'}
          </motion.button>
        </div>

        {/* Enter hint */}
        {ready && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-3 text-[10px] tracking-[0.2em] uppercase"
            style={{
              fontFamily: '"DM Sans", sans-serif',
              color: '#b8a67a',
            }}
          >
            or press Enter
          </motion.div>
        )}

        {/* Single rule */}
        <div className="mt-8">
          <Rule />
        </div>

        {/* Controls */}
        <div className="mt-6 flex justify-center">
          <div
            className="text-left text-[11px] leading-[2.2]"
            style={{
              fontFamily: '"DM Sans", sans-serif',
              color: '#8a7e6a',
            }}
          >
            <div><span style={{ color: '#5a4e3a', display: 'inline-block', width: '50px', fontWeight: 500 }}>W / S</span> raise &amp; lower sails</div>
            <div><span style={{ color: '#5a4e3a', display: 'inline-block', width: '50px', fontWeight: 500 }}>A / D</span> steer</div>
            <div><span style={{ color: '#5a4e3a', display: 'inline-block', width: '50px', fontWeight: 500 }}>E</span> enter port</div>
            <div><span style={{ color: '#5a4e3a', display: 'inline-block', width: '50px', fontWeight: 500 }}>M</span> open chart</div>
          </div>
        </div>

        {/* Bottom double rule */}
        <div className="mt-8">
          <Rule double />
        </div>

        <div
          className="mt-5 text-[9px] tracking-[0.2em] uppercase"
          style={{
            fontFamily: '"DM Sans", sans-serif',
            color: '#c4b896',
          }}
        >
          v0.1
        </div>
      </motion.div>
    </motion.div>
  );
}
