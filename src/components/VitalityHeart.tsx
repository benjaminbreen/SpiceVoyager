import { Heart } from 'lucide-react';
import { motion } from 'framer-motion';

interface Props {
  current: number;
  max: number;
  size?: number;
  showLabel?: boolean;
  labelClassName?: string;
}

// Color depends on fill percentage, not absolute value, so a Lvl 8 crew at
// 4/10 hearts reads "wounded" the same as a Lvl 1 crew at 1/3.
function colorForPct(pct: number): string {
  if (pct > 0.66) return '#f87171'; // red-400 — healthy
  if (pct > 0.33) return '#fbbf24'; // amber-400 — wounded
  return '#dc2626';                 // red-600 — critical
}

/**
 * Single heart icon with vertical fill clipped to current/max.
 * Replaces a pip row so the UI footprint stays fixed regardless of how
 * many hearts a crew member has accumulated through level-ups.
 */
export function VitalityHeart({ current, max, size = 16, showLabel = false, labelClassName }: Props) {
  const pct = max > 0 ? Math.max(0, Math.min(1, current / max)) : 0;
  const inset = (1 - pct) * 100;
  const color = colorForPct(pct);

  return (
    <span className="inline-flex items-center shrink-0" title={`${current} / ${max} vitality`}>
      <span className="relative inline-block" style={{ width: size, height: size }}>
        {/* Outline (always visible — empty silhouette) */}
        <Heart
          size={size}
          color="#334155"
          fill="none"
          strokeWidth={2}
          className="absolute top-0 left-0"
        />
        {/* Filled heart, clipped from the top to show fill % */}
        <motion.span
          className="absolute top-0 left-0 inline-block"
          initial={false}
          animate={{ clipPath: `inset(${inset}% 0 0 0)` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          style={{ width: size, height: size }}
        >
          <Heart size={size} color={color} fill={color} strokeWidth={2} />
        </motion.span>
      </span>
      {showLabel && (
        <span
          className={labelClassName ?? 'ml-1.5 text-[10px] font-mono tabular-nums'}
          style={{ color }}
        >
          {current}/{max}
        </span>
      )}
    </span>
  );
}
