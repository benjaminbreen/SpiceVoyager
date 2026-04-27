import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Starfield } from './Starfield';
import { getPortLatitude } from '../utils/portCoords';

interface SleepOverlayProps {
  active: boolean;
  portId: string;
  portName: string;
  lodgingName: string;
  dayCount: number;
}

export function SleepOverlay({ active, portId, portName, lodgingName, dayCount }: SleepOverlayProps) {
  const [imageStatus, setImageStatus] = useState<'loading' | 'ready' | 'missing'>('loading');
  const imageSrc = `/sleep/${portId}.png`;

  // Probe the image when the overlay activates
  useEffect(() => {
    if (!active) return;
    setImageStatus('loading');
    const img = new Image();
    img.onload = () => setImageStatus('ready');
    img.onerror = () => setImageStatus('missing');
    img.src = imageSrc;
  }, [active, imageSrc]);

  const latitude = getPortLatitude(portId);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {active && (
        <motion.div
          key="sleep-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 1.8 } }}
          transition={{ duration: 1.5 }}
          className="fixed inset-0 z-[200] overflow-hidden"
          style={{ pointerEvents: 'all' }}
        >
          {/* Deep night background — fills behind the transparent sky */}
          <div
            className="absolute inset-0"
            style={{
              background: 'radial-gradient(ellipse at 70% 25%, #0a1428 0%, #050810 60%, #02040a 100%)',
            }}
          />

          {/* Animated starfield */}
          <Starfield latitude={latitude} dayCount={dayCount} progress={1} />

          {/* Port still — masked sky lets stars through */}
          {imageStatus === 'ready' && (
            <motion.img
              src={imageSrc}
              alt={`${portName} at night`}
              initial={{ opacity: 0, scale: 1.06 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 2.5, delay: 0.6, ease: [0.4, 0, 0.2, 1] }}
              className="absolute inset-0 h-full w-full"
              style={{ objectFit: 'cover', objectPosition: 'center' }}
            />
          )}

          {/* Edge vignette to deepen corners further */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background: 'radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.6) 100%)',
            }}
          />

          {/* Title text — floats in after the image settles */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1.4, delay: 2.6 }}
            className="absolute bottom-[18%] left-0 right-0 flex flex-col items-center text-center"
          >
            <div
              className="text-[28px] font-bold tracking-wide text-slate-100"
              style={{
                fontFamily: '"Fraunces", serif',
                textShadow: '0 2px 16px rgba(0,0,0,0.9), 0 0 4px rgba(0,0,0,0.8)',
              }}
            >
              {portName}
            </div>
            <div
              className="mt-1 text-[14px] italic text-slate-300/80"
              style={{
                fontFamily: '"DM Sans", sans-serif',
                textShadow: '0 1px 8px rgba(0,0,0,0.9)',
              }}
            >
              You take a room at the {lodgingName}.
            </div>
            <div
              className="mt-3 text-[13px] tracking-[0.18em] uppercase text-slate-500"
              style={{
                fontFamily: '"DM Sans", sans-serif',
                textShadow: '0 1px 8px rgba(0,0,0,0.9)',
              }}
            >
              The night passes
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
