import { Nationality } from '../store/gameStore';
import { FACTIONS } from '../constants/factions';

interface FactionFlagProps {
  nationality: Nationality;
  size?: number;
}

export function FactionFlag({ nationality, size = 20 }: FactionFlagProps) {
  const faction = FACTIONS[nationality];
  if (!faction) return null;

  const w = size;
  const h = Math.round(size * 0.7);
  const [c1, c2, c3] = faction.colors;

  const flagContent = (() => {
    switch (faction.flagPattern) {
      case 'cross': {
        // Offset cross (like St George, Dannebrog)
        // For Portuguese: centered cross
        const crossW = w * 0.14;
        const offsetX = nationality === 'Portuguese' ? w / 2 : w * 0.36;
        const offsetY = h / 2;
        return (
          <>
            <rect width={w} height={h} fill={c1} />
            <rect x={0} y={offsetY - crossW / 2} width={w} height={crossW} fill={c2} />
            <rect x={offsetX - crossW / 2} y={0} width={crossW} height={h} fill={c2} />
            {nationality === 'Portuguese' && (
              // Small shield at cross center
              <circle cx={w / 2} cy={h / 2} r={crossW * 0.7} fill={c3} />
            )}
          </>
        );
      }

      case 'triband-h': {
        const stripeH = h / 3;
        // Dutch 1612 was actually orange-white-blue (Prinsenvlag)
        const topColor = nationality === 'Dutch' ? '#FF7F00' : c1;
        return (
          <>
            <rect width={w} height={stripeH} fill={topColor} />
            <rect y={stripeH} width={w} height={stripeH} fill={c2} />
            <rect y={stripeH * 2} width={w} height={stripeH} fill={c3} />
          </>
        );
      }

      case 'bicolor-h': {
        return (
          <>
            <rect width={w} height={h / 2} fill={c1} />
            <rect y={h / 2} width={w} height={h / 2} fill={c2} />
          </>
        );
      }

      case 'bicolor-v': {
        // French 1612: white Bourbon flag — we'll do white with tiny gold fleur-de-lis suggestion
        if (nationality === 'French') {
          return (
            <>
              <rect width={w} height={h} fill="#FFFFFF" />
              {/* Three small gold fleur-de-lis arranged as triangle */}
              <FleurDeLis cx={w * 0.5} cy={h * 0.35} s={h * 0.16} fill="#C9B037" />
              <FleurDeLis cx={w * 0.35} cy={h * 0.68} s={h * 0.16} fill="#C9B037" />
              <FleurDeLis cx={w * 0.65} cy={h * 0.68} s={h * 0.16} fill="#C9B037" />
            </>
          );
        }
        return (
          <>
            <rect width={w / 2} height={h} fill={c2} />
            <rect x={w / 2} width={w / 2} height={h} fill={c3} />
          </>
        );
      }

      case 'quartered': {
        // Spanish Cross of Burgundy: white field, red ragged cross
        if (nationality === 'Spanish') {
          const mx = w / 2;
          const my = h / 2;
          return (
            <>
              <rect width={w} height={h} fill="#F1BF00" />
              {/* Simplified burgundy saltire */}
              <line x1={w * 0.08} y1={h * 0.08} x2={w * 0.92} y2={h * 0.92} stroke="#AA151B" strokeWidth={w * 0.09} strokeLinecap="round" />
              <line x1={w * 0.92} y1={h * 0.08} x2={w * 0.08} y2={h * 0.92} stroke="#AA151B" strokeWidth={w * 0.09} strokeLinecap="round" />
              {/* Small knots at the cross */}
              <circle cx={mx} cy={my} r={w * 0.06} fill="#AA151B" />
            </>
          );
        }
        return (
          <>
            <rect width={w / 2} height={h / 2} fill={c1} />
            <rect x={w / 2} width={w / 2} height={h / 2} fill={c2} />
            <rect y={h / 2} width={w / 2} height={h / 2} fill={c2} />
            <rect x={w / 2} y={h / 2} width={w / 2} height={h / 2} fill={c1} />
          </>
        );
      }

      case 'crescent': {
        const cx = w * 0.48;
        const cy = h / 2;
        const r = h * 0.3;
        return (
          <>
            <rect width={w} height={h} fill={c1} />
            {/* Crescent: full circle minus offset circle */}
            <circle cx={cx} cy={cy} r={r} fill={c2} />
            <circle cx={cx + r * 0.35} cy={cy} r={r * 0.8} fill={c1} />
            {/* Star */}
            <circle cx={cx + r * 0.85} cy={cy} r={r * 0.2} fill={c2} />
          </>
        );
      }

      case 'disc': {
        return (
          <>
            <rect width={w} height={h} fill={c1} />
            <circle cx={w / 2} cy={h / 2} r={h * 0.3} fill={c2} />
          </>
        );
      }

      case 'diamond': {
        const cx = w / 2;
        const cy = h / 2;
        const dx = w * 0.28;
        const dy = h * 0.38;
        return (
          <>
            <rect width={w} height={h} fill={c1} />
            <polygon
              points={`${cx},${cy - dy} ${cx + dx},${cy} ${cx},${cy + dy} ${cx - dx},${cy}`}
              fill={c2}
            />
          </>
        );
      }

      case 'stripe-edge': {
        return (
          <>
            <rect width={w} height={h} fill={c1} />
            <rect width={w} height={h * 0.25} fill={c2} />
            <rect y={h * 0.75} width={w} height={h * 0.25} fill={c3} />
          </>
        );
      }

      case 'plain':
      default: {
        // Siamese: red with white elephant suggestion (simple shape)
        if (nationality === 'Siamese') {
          return (
            <>
              <rect width={w} height={h} fill={c1} />
              {/* Simplified white elephant - just a rounded shape */}
              <ellipse cx={w * 0.5} cy={h * 0.48} rx={w * 0.18} ry={h * 0.25} fill={c2} opacity={0.9} />
            </>
          );
        }
        // Moluccan: green with gold border feel
        if (nationality === 'Moluccan') {
          return (
            <>
              <rect width={w} height={h} fill={c1} />
              <rect x={w * 0.1} y={h * 0.1} width={w * 0.8} height={h * 0.8} fill="none" stroke={c3} strokeWidth={1} rx={1} />
            </>
          );
        }
        return <rect width={w} height={h} fill={c1} />;
      }
    }
  })();

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className="inline-block shrink-0 rounded-[2px] shadow-[0_1px_3px_rgba(0,0,0,0.5)]"
      style={{ border: '0.5px solid rgba(255,255,255,0.15)' }}
      role="img"
      aria-label={`Flag of ${faction.displayName}`}
    >
      <title>{faction.displayName}</title>
      {flagContent}
    </svg>
  );
}

/** Tiny fleur-de-lis approximation for French flag */
function FleurDeLis({ cx, cy, s, fill }: { cx: number; cy: number; s: number; fill: string }) {
  return (
    <g transform={`translate(${cx},${cy})`}>
      {/* Center petal */}
      <ellipse cx={0} cy={-s * 0.2} rx={s * 0.2} ry={s * 0.45} fill={fill} />
      {/* Left petal */}
      <ellipse cx={-s * 0.3} cy={0} rx={s * 0.15} ry={s * 0.35} fill={fill} transform="rotate(20)" />
      {/* Right petal */}
      <ellipse cx={s * 0.3} cy={0} rx={s * 0.15} ry={s * 0.35} fill={fill} transform="rotate(-20)" />
    </g>
  );
}
