import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

type FlashDirection = 'up' | 'down';

export function ValueFlash({
  value,
  children,
  className = '',
  upColor = '#86efac',
  downColor = '#fca5a5',
}: {
  value: number;
  children: React.ReactNode;
  className?: string;
  upColor?: string;
  downColor?: string;
}) {
  const previousValue = useRef(value);
  const hasMounted = useRef(false);
  const [pulse, setPulse] = useState<{ key: number; direction: FlashDirection } | null>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const previous = previousValue.current;

    if (hasMounted.current && value !== previous) {
      setPulse((current) => ({
        key: (current?.key ?? 0) + 1,
        direction: value > previous ? 'up' : 'down',
      }));
    } else {
      hasMounted.current = true;
    }

    previousValue.current = value;
  }, [value]);

  const flashColor = pulse?.direction === 'up' ? upColor : downColor;

  return (
    <motion.span
      key={pulse?.key ?? 0}
      className={`inline-flex items-baseline rounded px-0.5 -mx-0.5 tabular-nums ${className}`}
      initial={pulse ? { scale: 1 } : false}
      animate={pulse ? {
        scale: reduceMotion ? 1 : [1, 1.1, 1],
        filter: ['brightness(1.8) saturate(1.2)', 'brightness(1.25) saturate(1.08)', 'brightness(1) saturate(1)'],
        textShadow: [`0 0 14px ${flashColor}`, `0 0 8px ${flashColor}`, '0 0 0 rgba(0,0,0,0)'],
      } : undefined}
      transition={{ duration: 0.36, ease: [0.2, 0.8, 0.2, 1] }}
    >
      {children}
    </motion.span>
  );
}
